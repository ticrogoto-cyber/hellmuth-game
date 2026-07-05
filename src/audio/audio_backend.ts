// Backend-Abstraktion (Strang 1 + 6). Engine-Entscheidung: Phaser-
// `WebAudioSoundManager` als Ausgabeschicht, der `AudioManager` darueber.
// `PhaserAudioBackend` zieht den AudioContext aus Phasers Sound-Manager;
// `RawWebAudioBackend` (eigener Context) ist der V2-Notausgang;
// `SilentAudioBackend` degradiert still (nie werfen).
//
// Misch-Graph (Strang 6):
//   Voice -> voiceGain -> StereoPanner -> busDuck -> busUser -> master
//          -> DynamicsCompressor (Limiter, Pflicht) -> destination
// Zwei Gains je Bus: busUser (Slider) und busDuck (Ducking-Automation), damit
// Regler und Ducking sich nicht ueberschreiben. Pro Voice 1 Gain + 1
// StereoPanner (kein Convolver, KEIN PannerNode -> iOS-sicher).

import type Phaser from "phaser";
import type { BusId } from "./audio_manifest";
import { BUSSE } from "./audio_manifest";
import { jitter as jitterFaktoren } from "./audio_util";

export interface BackendPlayRequest {
  bus: BusId;
  /** Dekodierter Puffer der echten Datei (oder des Sprite-Sheets). */
  buffer?: AudioBuffer;
  /** Sprite-Region: Startversatz im Puffer (Sekunden). */
  offset?: number;
  /** Sprite-Region: Dauer (Sekunden). Fehlt -> ganzer Puffer. */
  dauer?: number;
  /** Effektive Grundlautstaerke 0..1 (Bus-/Master-Gain kommen obendrauf). */
  lautstaerke: number;
  /** Stereo-Position -1..1 (links..rechts). */
  pan: number;
  loop: boolean;
  /** Pro-Instanz-Variation (Pitch/Volume) aus (Default an). */
  jitter?: boolean;
  /** Pitch-Jitter-Spanne in Cent (Default 200 = ±200 Cent). */
  jitterPitchCents?: number;
  /** Volume-Jitter-Spanne in dB (Default 1,5 = ±1,5 dB). */
  jitterDb?: number;
  /** Stabiler Schluessel; steuert die Stub-Tonhoehe und das Dev-Log. */
  hinweis: string;
  /** Wird gerufen, wenn die Voice endet (auch nach stop). Genau einmal. */
  onEnded?: () => void;
}

export interface BackendHandle {
  readonly id: number;
  readonly bus: BusId;
  stop(): void;
}

// Streaming (Paket C): Musik/Ambience laufen ueber ein gestreamtes
// HTMLAudioElement (MediaElementAudioSourceNode), NICHT als dekodierter Puffer
// (ein 90-s-Track = ~126 MB PCM). Geroutet in den Music-/Ambience-Bus-Gain.
export interface StreamRequest {
  bus: BusId;
  /** Format-Fallback-Liste (ogg zuerst, m4a fuer Safari). */
  urls: string[];
  loop: boolean;
  lautstaerke: number;
}

export interface StreamHandle {
  /** Weiche Gain-Fahrt (Crossfade) auf Ziel ueber durSec. */
  fade(target: number, durSec: number): void;
  /** Aktuelle Wiedergabeposition in Sekunden. */
  position(): number;
  /** Gesamtdauer in Sekunden (0 = unbekannt). */
  dauer(): number;
  stop(): void;
}

export interface AudioBackend {
  readonly name: string;
  resume(): void;
  /** Slider-Gain eines Busses 0..1 (busUser). */
  setBusGain(bus: BusId, gain: number): void;
  /** Ducking-Gain eines Busses 0..1 (busDuck), weich via setTargetAtTime. */
  duckBus(bus: BusId, gain: number, tau: number): void;
  setMasterMuted(muted: boolean): void;
  /** Dev: fehlende Dateien als hoerbaren Synthton statt Stille spielen. */
  setStubAudible(audible: boolean): void;
  play(req: BackendPlayRequest): BackendHandle | null;
  /** Gestreamte Quelle (Musik/Ambience) auf einem Bus. */
  playStream(req: StreamRequest): StreamHandle | null;
  stopBus(bus: BusId): void;
  stopAll(): void;
}

// NaN-sicher: ein nicht-endlicher Wert (z. B. aus kaputtem Manifest) faellt auf
// die untere Grenze, statt als NaN bis WebAudio durchzuschlagen (das wirft).
// NaN-sicher: ein nicht-endlicher Wert (z. B. aus kaputtem Manifest) faellt auf
// einen gueltigen Default, statt als NaN bis WebAudio durchzuschlagen (das wirft).
const clamp01 = (v: number): number => (v >= 1 ? 1 : v > 0 ? v : 0);
const clampPan = (v: number): number => (v >= 1 ? 1 : v <= -1 ? -1 : Number.isFinite(v) ? v : 0);

interface AudioWindow {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
}

function neuerContext(): AudioContext | undefined {
  const w = window as unknown as AudioWindow;
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return undefined;
  try {
    return new Ctor();
  } catch {
    return undefined;
  }
}

export class WebAudioBackend implements AudioBackend {
  readonly name: string;
  protected readonly ctx: AudioContext;
  private readonly master: GainNode;
  private readonly busUser = new Map<BusId, GainNode>();
  private readonly busDuck = new Map<BusId, GainNode>();
  /** Eingangsknoten je Bus, an den Voices haengen (= busDuck, master bei master). */
  private readonly busInput = new Map<BusId, GainNode>();
  private masterVolume = 1;
  private muted = false;
  private stubAudible = false;
  private naechsteId = 1;
  private readonly aktiv = new Map<number, { bus: BusId; stop: () => void }>();
  private stille?: AudioBuffer;

  constructor(ctx: AudioContext, name = "webaudio") {
    this.name = name;
    this.ctx = ctx;

    // Master -> Limiter (DynamicsCompressor) -> Ausgang. Der Limiter ist Pflicht:
    // faengt Summen-Spitzen im Vollmix ab (kein Clipping).
    this.master = ctx.createGain();
    this.master.gain.value = this.masterVolume;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    this.master.connect(limiter);
    limiter.connect(ctx.destination);
    this.busInput.set("master", this.master);

    // Je Nicht-Master-Bus: busDuck -> busUser -> master.
    for (const bus of BUSSE) {
      if (bus === "master") continue;
      const user = ctx.createGain();
      user.gain.value = 1;
      user.connect(this.master);
      const duck = ctx.createGain();
      duck.gain.value = 1;
      duck.connect(user);
      this.busUser.set(bus, user);
      this.busDuck.set(bus, duck);
      this.busInput.set(bus, duck);
    }
  }

  resume(): void {
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  setBusGain(bus: BusId, gain: number): void {
    const v = clamp01(gain);
    if (bus === "master") {
      this.masterVolume = v;
      this.master.gain.value = this.muted ? 0 : v;
      return;
    }
    const node = this.busUser.get(bus);
    if (node) node.gain.value = v;
  }

  duckBus(bus: BusId, gain: number, tau: number): void {
    const node = this.busDuck.get(bus);
    if (!node) return; // master wird nicht geduckt
    node.gain.setTargetAtTime(clamp01(gain), this.ctx.currentTime, Math.max(tau, 0.001));
  }

  setMasterMuted(muted: boolean): void {
    this.muted = muted;
    this.master.gain.value = muted ? 0 : this.masterVolume;
  }

  setStubAudible(audible: boolean): void {
    this.stubAudible = audible;
  }

  play(req: BackendPlayRequest): BackendHandle | null {
    const busNode = this.busInput.get(req.bus) ?? this.master;
    // Anti-Monotonie (Physik T2): Pitch- + Volume-Jitter pro Instanz, per Set
    // tunbar (Default ±200 Cent / ±1,5 dB; Destille-Tropfen ±100 / ±1).
    const jit =
      req.jitter === false
        ? { detuneCents: 0, gainFaktor: 1 }
        : jitterFaktoren(Math.random, req.jitterPitchCents ?? 200, req.jitterDb ?? 1.5);
    const voiceGain = this.ctx.createGain();
    voiceGain.gain.value = clamp01(req.lautstaerke) * (req.buffer ? 1 : 0.25) * jit.gainFaktor;

    // Panner: StereoPanner (iOS-sicher). Fehlt selbst der -> kein Panning.
    if (typeof this.ctx.createStereoPanner === "function") {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = clampPan(req.pan);
      voiceGain.connect(panner);
      panner.connect(busNode);
    } else {
      voiceGain.connect(busNode);
    }

    const id = this.naechsteId++;
    let beendet = false;
    const fertig = (): void => {
      if (beendet) return;
      beendet = true;
      this.aktiv.delete(id);
      req.onEnded?.();
    };

    if (req.buffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = req.buffer;
      if (src.detune) src.detune.value = jit.detuneCents; // detune fehlt in alt-iOS-WebKit
      src.loop = req.loop;
      // Sprite-Versatz/-Dauer defensiv klemmen: ein kaputter Mark (NaN/negativ)
      // darf src.start() nicht mit RangeError werfen (nie-werfen-Zusage).
      const off = Number.isFinite(req.offset) && (req.offset as number) >= 0 ? (req.offset as number) : 0;
      const dur = Number.isFinite(req.dauer) && (req.dauer as number) > 0 ? (req.dauer as number) : undefined;
      // Sprite-Region: Loop-Grenzen auf den Ausschnitt setzen.
      if (req.loop && dur != null) {
        src.loopStart = off;
        src.loopEnd = off + dur;
      }
      src.connect(voiceGain);
      src.onended = fertig;
      if (dur != null) src.start(this.ctx.currentTime, off, dur);
      else if (req.offset != null) src.start(this.ctx.currentTime, off);
      else src.start();
      this.aktiv.set(id, {
        bus: req.bus,
        stop: () => {
          try {
            src.stop();
          } catch {
            /* schon gestoppt */
          }
        },
      });
    } else if (this.stubAudible) {
      const osc = this.ctx.createOscillator();
      const now = this.ctx.currentTime;
      osc.type = req.bus === "stimme" ? "sawtooth" : "sine";
      osc.frequency.value = 180 + (hashCode(req.hinweis) % 32) * 18;
      if (osc.detune) osc.detune.value = jit.detuneCents;
      const env = this.ctx.createGain();
      env.gain.setValueAtTime(0.0001, now);
      env.gain.exponentialRampToValueAtTime(0.9, now + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
      osc.connect(env);
      env.connect(voiceGain);
      osc.onended = fertig;
      osc.start(now);
      osc.stop(now + 0.18);
      this.aktiv.set(id, {
        bus: req.bus,
        stop: () => {
          try {
            osc.stop();
          } catch {
            /* schon gestoppt */
          }
        },
      });
    } else {
      // Stille NIE loopen: sonst belegte ein unhoerbarer Loop einen Voice-Slot
      // den ganzen Match. Echte Loop-Dateien (Puffer-Zweig) loopen sehr wohl.
      const src = this.ctx.createBufferSource();
      src.buffer = this.stilleBuffer();
      src.connect(voiceGain);
      src.onended = fertig;
      src.start();
      src.stop(this.ctx.currentTime + 0.2);
      this.aktiv.set(id, {
        bus: req.bus,
        stop: () => {
          try {
            src.stop();
          } catch {
            /* schon gestoppt */
          }
        },
      });
    }

    return {
      id,
      bus: req.bus,
      stop: () => {
        this.aktiv.get(id)?.stop();
        fertig();
      },
    };
  }

  playStream(req: StreamRequest): StreamHandle | null {
    try {
      const el = document.createElement("audio");
      el.loop = req.loop;
      el.preload = "auto";
      for (const url of req.urls) {
        const q = document.createElement("source");
        q.src = url;
        el.appendChild(q);
      }
      const src = this.ctx.createMediaElementSource(el);
      const g = this.ctx.createGain();
      g.gain.value = clamp01(req.lautstaerke);
      const busNode = this.busInput.get(req.bus) ?? this.master;
      src.connect(g);
      g.connect(busNode);
      void el.play().catch(() => {
        /* Autoplay blockiert oder Datei fehlt -> still, nie werfen */
      });
      return {
        fade: (target: number, durSec: number): void => {
          g.gain.setTargetAtTime(clamp01(target), this.ctx.currentTime, Math.max(durSec / 3, 0.001));
        },
        position: (): number => (Number.isFinite(el.currentTime) ? el.currentTime : 0),
        dauer: (): number => (Number.isFinite(el.duration) ? el.duration : 0),
        stop: (): void => {
          try {
            el.pause();
            src.disconnect();
            g.disconnect();
          } catch {
            /* egal */
          }
        },
      };
    } catch {
      return null;
    }
  }

  stopBus(bus: BusId): void {
    for (const [, v] of [...this.aktiv]) if (v.bus === bus) v.stop();
  }

  stopAll(): void {
    for (const [, v] of [...this.aktiv]) v.stop();
  }

  private stilleBuffer(): AudioBuffer {
    if (!this.stille) {
      this.stille = this.ctx.createBuffer(1, Math.max(1, Math.floor(this.ctx.sampleRate)), this.ctx.sampleRate);
    }
    return this.stille;
  }
}

/** Primaeres Backend: AudioContext aus Phasers WebAudioSoundManager. */
export class PhaserAudioBackend extends WebAudioBackend {
  constructor(ctx: AudioContext) {
    super(ctx, "phaser-webaudio");
  }

  static fromGame(game: Phaser.Game): PhaserAudioBackend | null {
    const sound = game.sound as unknown as { context?: AudioContext };
    if (sound && sound.context) return new PhaserAudioBackend(sound.context);
    return null;
  }
}

/** V2-Notausgang: eigener AudioContext, unabhaengig von Phaser. */
export class RawWebAudioBackend extends WebAudioBackend {
  constructor(ctx: AudioContext) {
    super(ctx, "raw-webaudio");
  }
}

/** Tut nichts. Sichere Rueckfalloption (Headless / kein WebAudio). */
export class SilentAudioBackend implements AudioBackend {
  readonly name = "silent";
  resume(): void {}
  setBusGain(): void {}
  duckBus(): void {}
  setMasterMuted(): void {}
  setStubAudible(): void {}
  play(): BackendHandle | null {
    return null;
  }
  playStream(): StreamHandle | null {
    return null;
  }
  stopBus(): void {}
  stopAll(): void {}
}

export function createAudioBackend(game?: Phaser.Game): AudioBackend {
  if (game) {
    const phaser = PhaserAudioBackend.fromGame(game);
    if (phaser) return phaser;
  }
  const ctx = neuerContext();
  return ctx ? new RawWebAudioBackend(ctx) : new SilentAudioBackend();
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
