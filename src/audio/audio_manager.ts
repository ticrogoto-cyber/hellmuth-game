// AudioManager: das RUECKGRAT und die EINE Schnittstelle. Ausloeser rufen nie
// direkt Phaser, sondern `audio.play(event, ctx)`. Der Manager loest ueber das
// Manifest auf (Binding -> Set -> Sprach-/Varianten-Wahl), wendet Dedup +
// Voice-Limiting + Stealing (Strang 1), positionalen Klang (Strang 2) und
// Ducking (Strang 6) an und reicht nur zugelassene Voices ans Backend. Kein
// Klang erzwingt eine Datei: fehlt sie, spielt das Backend still -- no-op.

import type { AudioBackend, BackendHandle, StreamHandle } from "./audio_backend";
import { createAudioBackend } from "./audio_backend";
import { DuckController } from "./audio_ducking";
import { ShuffleBag } from "./shuffle_bag";
import type {
  AudioBinding,
  AudioFile,
  AudioManifest,
  AudioSet,
  BusId,
  Sprache,
} from "./audio_manifest";
import {
  BUSSE,
  audioUrls,
  bindingIndex,
  dateienFuerSprache,
  dateienInSprache,
  fileCacheKey,
  kategorieVon,
  referenzVon,
  validateManifest,
  waehleSetKey,
} from "./audio_manifest";
import type { Kategorie } from "./voice_limiter";
import { VoiceLimiter } from "./voice_limiter";

/** Kontext eines Ausloesers. Steuert Set-Wahl, Prioritaet, Position. */
export interface PlayCtx {
  x?: number;
  y?: number;
  faction?: string;
  unitType?: string;
  biome?: string;
  /** Wichtigkeit 0..1 (ueberschreibt die Kategorie-Vorgabe). */
  importance?: number;
  /** Lautstaerke-Faktor 0..1 auf die Set-Grundlautstaerke. */
  lautstaerke?: number;
  loop?: boolean;
}

/** Strukturelle Sicht auf die Phaser-Kamera (haelt den Manager Phaser-frei). */
export interface CameraLike {
  midPoint: { x: number; y: number };
  worldView: { left: number; right: number; top: number; bottom: number };
  zoom: number;
  width: number;
  height: number;
}

export interface KlangHandle {
  readonly bus: BusId;
  stop(): void;
}

/** Liefert den dekodierten Puffer zu einem Datei-Stamm (aus dem Phaser-Cache). */
export type BufferProvider = (stem: string) => AudioBuffer | undefined;

export interface AudioManagerOpts {
  backend?: AudioBackend;
  sprache?: Sprache;
  busLautstaerken?: Partial<Record<BusId, number>>;
}

const KAT_IMP: Record<Kategorie, number> = {
  building_death: 0.9,
  unit_death: 0.6,
  ui: 0.7,
  music: 0.5,
  combat_fx: 0.5,
  hit_ranged: 0.4,
  hit_melee: 0.4,
  ambient: 0.3,
  building_idle: 0.25,
};

// Positionale Kategorien (Pan + Distanz + Off-Screen-Cull). Nicht-positional:
// ui (geschuetzte Spur), music, ambient, voice -> zentriert, voll, nie gecullt.
const POSITIONAL: ReadonlySet<Kategorie> = new Set<Kategorie>([
  "hit_melee",
  "hit_ranged",
  "unit_death",
  "building_death",
  "building_idle",
  "combat_fx",
]);
const CULL_MARGIN = 80; // 0.5 * TILE: kartenferne Schwaerme erzeugen 0 Knoten
const REF_FAKTOR = 0.45; // refPx = 0.45 * halfW (inverse Distanzkurve)

const now = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const clampPan = (v: number): number => (v < -1 ? -1 : v > 1 ? 1 : v);

interface Raum {
  pan: number;
  gain: number;
  prox: number;
  culled: boolean;
}

export class AudioManager {
  private readonly manifest: AudioManifest;
  private readonly backend: AudioBackend;
  private readonly limiter = new VoiceLimiter();
  private readonly duck: DuckController;
  private readonly bindings: Map<string, AudioBinding>;
  private sprache: Sprache;
  private readonly referenzSprache: Sprache;
  private spracheHook?: (lang: Sprache) => void;
  private muted = false;
  private readonly busLautstaerke = new Map<BusId, number>();
  private readonly aktiveHandles = new Map<number, BackendHandle>();
  private readonly bags = new Map<string, ShuffleBag<AudioFile>>();
  private bufferProvider: BufferProvider = () => undefined;
  private camera: CameraLike | null = null;

  constructor(manifest: AudioManifest, opts: AudioManagerOpts = {}) {
    this.manifest = manifest;
    this.backend = opts.backend ?? createAudioBackend();
    this.duck = new DuckController(this.backend);
    this.sprache = opts.sprache ?? manifest.standardSprache;
    this.referenzSprache = referenzVon(manifest);
    this.bindings = bindingIndex(manifest);
    for (const bus of BUSSE) {
      const v = opts.busLautstaerken?.[bus] ?? 1;
      this.busLautstaerke.set(bus, v);
      this.backend.setBusGain(bus, v);
    }
    // Schema frueh pruefen (Physik T3): Tippfehler in Pfad/Key klar melden.
    for (const p of validateManifest(manifest)) console.warn(`[AUDIO] Manifest: ${p}`);
  }

  get backendName(): string {
    return this.backend.name;
  }

  setBufferProvider(p: BufferProvider): void {
    this.bufferProvider = p;
  }

  /** Kamera als Listener fuer positionalen Klang (Pan/Distanz/Cull). */
  setCamera(cam: CameraLike | null): void {
    this.camera = cam;
  }

  // --- Sprache ------------------------------------------------------------

  getSprache(): Sprache {
    return this.sprache;
  }

  /**
   * Tauscht die Stimmsprache OHNE Rebuild. Persistiert die Wahl und ruft den
   * Sprach-Hook (lazy Nachladen des Sprach-Pakets). SFX/Musik bleiben unberuehrt.
   */
  setSprache(sprache: Sprache): void {
    if (!this.manifest.sprachen.includes(sprache)) {
      console.warn(`[AUDIO] Sprache nicht im Manifest: ${sprache} (ignoriert)`);
      return;
    }
    this.sprache = sprache;
    try {
      localStorage.setItem("hellmuth.lang", sprache);
    } catch {
      /* kein localStorage -> egal */
    }
    this.spracheHook?.(sprache);
  }

  /** Hook fuer das lazy Nachladen eines Sprach-Pakets beim Sprachwechsel. */
  setSpracheHook(fn: (lang: Sprache) => void): void {
    this.spracheHook = fn;
  }

  verfuegbareSprachen(): Sprache[] {
    return [...this.manifest.sprachen];
  }

  // --- Mischung -----------------------------------------------------------

  setBusLautstaerke(bus: BusId, v: number): void {
    const c = clamp01(v);
    this.busLautstaerke.set(bus, c);
    this.backend.setBusGain(bus, c);
  }

  getBusLautstaerke(bus: BusId): number {
    return this.busLautstaerke.get(bus) ?? 1;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.backend.setMasterMuted(muted);
  }

  isMuted(): boolean {
    return this.muted;
  }

  resume(): void {
    this.backend.resume();
  }

  setStubAudible(audible: boolean): void {
    this.backend.setStubAudible(audible);
  }

  // --- Wiedergabe ---------------------------------------------------------

  boundEvents(): string[] {
    return this.manifest.bindings.map((b) => b.event);
  }

  setKeys(): string[] {
    return Object.keys(this.manifest.sets).sort();
  }

  hasSet(setKey: string): boolean {
    return setKey in this.manifest.sets;
  }

  voiceStats(): { total: number; perKat: Record<string, number> } {
    return this.limiter.stats();
  }

  play(event: string, ctx: PlayCtx = {}): KlangHandle | null {
    const binding = this.bindings.get(event);
    if (!binding) return null;
    const setKey = waehleSetKey(binding, ctx);
    if (!setKey) return null;
    const set = this.manifest.sets[setKey];
    if (!set) {
      console.warn(`[AUDIO] Binding ${event} -> unbekanntes Set ${setKey}`);
      return null;
    }
    return this.allokiere(set, ctx);
  }

  playSet(setKey: string, ctx: PlayCtx = {}): KlangHandle | null {
    const set = this.manifest.sets[setKey];
    if (!set) {
      console.warn(`[AUDIO] Unbekanntes Set: ${setKey}`);
      return null;
    }
    return this.allokiere(set, ctx);
  }

  stopBus(bus: BusId): void {
    this.backend.stopBus(bus);
  }

  stopAll(): void {
    this.backend.stopAll();
    this.aktiveHandles.clear();
  }

  private allokiere(set: AudioSet, ctx: PlayCtx): KlangHandle | null {
    const kat = kategorieVon(set);
    const t = now();

    // 1. Dedup VOR Allokation (keyed category+faction).
    if (this.limiter.istDuplikat(kat, ctx.faction, t)) return null;

    // 2. Positionaler Klang: Off-Screen-Hard-Cull VOR jeder Allokation.
    const raum = this.raum(kat, ctx);
    if (raum.culled) return null;

    const imp = ctx.importance ?? KAT_IMP[kat] ?? 0.5;
    const req = { kategorie: kat, faction: ctx.faction, prox: raum.prox, imp, nowMs: t };

    // 3. Caps + Stealing.
    const decision = this.limiter.pruefe(req);
    if (!decision.admit) return null;
    if (decision.stealId !== undefined) {
      this.aktiveHandles.get(decision.stealId)?.stop();
    }

    const quelle = this.waehleQuelle(set);
    const lautstaerke = clamp01((set.gain ?? 1) * (ctx.lautstaerke ?? 1) * raum.gain);

    let voiceId = -1;
    const handle = this.backend.play({
      bus: set.bus,
      buffer: quelle?.buffer,
      offset: quelle?.offset,
      dauer: quelle?.dauer,
      jitter: set.jitter !== false,
      jitterPitchCents: set.jitterPitchCents,
      jitterDb: set.jitterDb,
      lautstaerke,
      pan: raum.pan,
      loop: ctx.loop ?? set.loop ?? false,
      hinweis: set.key,
      onEnded: () => {
        if (voiceId >= 0) {
          this.limiter.entferne(voiceId);
          this.aktiveHandles.delete(voiceId);
          this.duck.release(set.bus, kat);
        }
      },
    });
    if (!handle) return null;

    voiceId = handle.id;
    this.limiter.registriere(handle.id, req);
    this.aktiveHandles.set(handle.id, handle);
    this.duck.engage(set.bus, kat);

    return { bus: set.bus, stop: () => handle.stop() };
  }

  /** Startet eine gestreamte Quelle (Musik/Ambience) zu einem Set (Paket C). */
  streamSet(setKey: string, opts: { loop?: boolean; gain?: number } = {}): StreamHandle | null {
    const set = this.manifest.sets[setKey];
    if (!set) return null;
    const file = set.files[0];
    if (!file) return null;
    return this.backend.playStream({
      bus: set.bus,
      urls: audioUrls(file),
      loop: opts.loop ?? set.loop ?? true,
      lautstaerke: opts.gain ?? set.gain ?? 1,
    });
  }

  /**
   * Waehlt Datei + Puffer mit Puffer-Fallback (Physik T3): ist die aktive
   * Sprache noch nicht nachgeladen (kein Puffer), spielt die EN-Referenz statt
   * Stille -- bis das lazy Sprach-Paket da ist.
   */
  private waehleQuelle(set: AudioSet): { buffer?: AudioBuffer; offset?: number; dauer?: number } | undefined {
    const file = this.waehleDatei(set);
    if (!file) return undefined;
    const quelle = this.aufloeseQuelle(file);
    if (!quelle.buffer && file.lang !== undefined && file.lang !== this.referenzSprache) {
      for (const rf of dateienInSprache(set, this.referenzSprache)) {
        const rq = this.aufloeseQuelle(rf);
        if (rq.buffer) return rq;
      }
    }
    return quelle;
  }

  /** Loest eine Tonquelle in Puffer (+ Sprite-Versatz/Dauer) auf. */
  private aufloeseQuelle(file: AudioFile): { buffer?: AudioBuffer; offset?: number; dauer?: number } {
    const buffer = this.bufferProvider(fileCacheKey(file));
    if (file.sprite) {
      const mark = this.manifest.sprites?.[file.sprite]?.marks[file.marker ?? ""];
      return { buffer, offset: mark?.start, dauer: mark?.dauer };
    }
    return { buffer };
  }

  /** Sprach-Filter (EN-Referenz-Fallback) + Shuffle-Bag (kein Sofort-Wiederholer). */
  private waehleDatei(set: AudioSet): AudioFile | undefined {
    let kandidaten = dateienFuerSprache(set, this.sprache, this.referenzSprache);
    if (kandidaten.length === 0) return undefined;
    if (set.maxVariants && set.maxVariants > 0) {
      kandidaten = kandidaten.slice(0, set.maxVariants);
    }
    if (kandidaten.length === 1) return kandidaten[0];
    const key = set.key + "|" + this.sprache;
    let bag = this.bags.get(key);
    if (!bag || bag.groesse !== kandidaten.length) {
      bag = new ShuffleBag(kandidaten);
      this.bags.set(key, bag);
    }
    return bag.zieh() ?? kandidaten[0];
  }

  /**
   * Positionaler Klang: Pan aus Screen-X, Gain aus inverser Distanzkurve,
   * Off-Screen-Cull mit Marge. Nicht-positionale Kategorien (UI/Musik/Ambience/
   * Stimme) sind zentriert, voll und werden nie gecullt. Iso-Y fliesst nur in
   * die Distanz, nicht in den Pan.
   */
  private raum(kat: Kategorie, ctx: PlayCtx): Raum {
    const positional = POSITIONAL.has(kat);
    const cam = this.camera;
    if (!positional || !cam || ctx.x === undefined || ctx.y === undefined) {
      return { pan: 0, gain: 1, prox: positional ? 0.6 : 0.7, culled: false };
    }
    const halfW = cam.width / 2;
    if (halfW <= 0) return { pan: 0, gain: 1, prox: 0.6, culled: false };

    const v = cam.worldView;
    if (
      ctx.x < v.left - CULL_MARGIN ||
      ctx.x > v.right + CULL_MARGIN ||
      ctx.y < v.top - CULL_MARGIN ||
      ctx.y > v.bottom + CULL_MARGIN
    ) {
      return { pan: 0, gain: 0, prox: 0, culled: true };
    }

    const pan = clampPan(((ctx.x - cam.midPoint.x) * cam.zoom) / halfW);
    const dist = Math.hypot(ctx.x - cam.midPoint.x, ctx.y - cam.midPoint.y);
    const refPx = REF_FAKTOR * halfW;
    const gain = refPx / (refPx + dist); // 1 bei 0, 0.5 bei refPx, monoton fallend
    return { pan, gain, prox: gain, culled: false };
  }
}
