import Phaser from "phaser";
import { FX_KIT_KEY, FX_KIT_FRAMES, ensureFxKit } from "./fx_kit";
import { PALETTE } from "./palette";
import { FX_AIR_ADD_DEPTH } from "../util/world";
import type { FactionId } from "../data/loader";

// TRACER (Gefechts-VFX Paket 2, D1-Sieger-Technik): gestrecktes Sprite-Paar pro
// Schuss -- weisser Kern (64x8) + vorgeblurrtes Halo (64x24) aus dem FX-Kit,
// beide ADD, per setTint gold/magenta gefaerbt, entlang des Flugvektors rotiert
// und gestreckt. Beide liegen im Luft-ADD-Band (FX_AIR_ADD_DEPTH): alle Tracer
// bilden mit den uebrigen Luft-ADD-Objekten EINEN zusammenhaengenden Blend-Block.
//
// Pooling (Pflicht, D1: 5-ms-GC-Pause = sichtbarer Ruckler): 128 Paare fest
// vorallokiert, aktiviert via setVisible/setActive -- NIE add/destroy pro Schuss.
// Laufen die Paare aus (Extremfall: MAX_LIVE 256 Projektile > 128 Paare), wird
// das aelteste aktive Paar gestohlen (steal-oldest): Budget haelt, Sim unberuehrt,
// nur das aelteste Geschoss verliert seine Leuchtspur.
//
// Determinismus: Position/Rotation kommen 1:1 aus dem Sim-Zustand des Projektils
// (30-Hz-stepSim) -- kein Math.random, keine Wanduhr. Nur der Ausklang-Fade nach
// dem Einschlag laeuft auf Render-dt: rein kosmetisch, ohne Sim-Rueckwirkung.

const POOL_PAIRS = 128;
const FADE_MS = 140; // Ausklang nach Einschlag/Release (D1: 100-160 ms)
const HALO_ALPHA = 0.6; // D1-Empfehlung
const HALO_SCALE_Y = 1.5; // Halo breiter als der Kern
const LEN_MIN_PX = 48;
const LEN_MAX_PX = 128;
const LEN_PER_SPEED = 0.1; // Streckung ~ Geschossgeschwindigkeit (px/s -> px)

export interface TracerPair {
  core: Phaser.GameObjects.Image;
  halo: Phaser.GameObjects.Image;
  live: boolean; // an ein aktives Projektil gebunden
  fadeMs: number; // >0: klingt aus
  seq: number; // Alters-Reihenfolge fuer steal-oldest
}

export class TracerFx {
  private readonly pairs: TracerPair[] = [];
  private seq = 0;

  constructor(scene: Phaser.Scene) {
    ensureFxKit(scene);
    for (let i = 0; i < POOL_PAIRS; i++) {
      const halo = scene.add
        .image(0, 0, FX_KIT_KEY, FX_KIT_FRAMES.TRACER_HALO)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(FX_AIR_ADD_DEPTH)
        .setVisible(false)
        .setActive(false);
      const core = scene.add
        .image(0, 0, FX_KIT_KEY, FX_KIT_FRAMES.TRACER_CORE)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(FX_AIR_ADD_DEPTH + 1)
        .setVisible(false)
        .setActive(false);
      this.pairs.push({ core, halo, live: false, fadeMs: 0, seq: 0 });
    }
    // Ausklang-Fade ist reine Kosmetik -> Render-Takt (Repo-Muster FxService).
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.tick, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.events.off(Phaser.Scenes.Events.UPDATE, this.tick, this);
      delete (scene as unknown as { __tracer?: TracerFx }).__tracer;
    });
    // Mess-Bruecken-Handle (Beweis 3/5), Muster wie scene.fx.
    (scene as unknown as { __tracer?: TracerFx }).__tracer = this;
  }

  /** Paar fuer einen frischen Schuss. Pool leer -> aeltestes stehlen. */
  acquire(faction: FactionId): TracerPair {
    let p = this.pairs.find((q) => !q.live && q.fadeMs <= 0);
    if (!p) {
      // Erst ausklingende opfern, dann das aelteste lebende.
      p = this.pairs.reduce((a, b) => (a.fadeMs > 0 && b.fadeMs <= 0 ? a : b.fadeMs > 0 && a.fadeMs <= 0 ? b : a.seq <= b.seq ? a : b));
    }
    const tint = faction === "moderat" ? PALETTE.MAGENTA_GLOW : PALETTE.GOLD_GLOW;
    p.live = true;
    p.fadeMs = 0;
    p.seq = ++this.seq;
    p.core.setTint(tint).setAlpha(1).setVisible(true).setActive(true);
    p.halo.setTint(tint).setAlpha(HALO_ALPHA).setVisible(true).setActive(true);
    return p;
  }

  /** Sim-getriebene Platzierung entlang des Flugvektors (deterministisch). */
  place(p: TracerPair, x: number, y: number, vx: number, vy: number, speed: number): void {
    const rot = Math.atan2(vy, vx);
    const len = Math.min(LEN_MAX_PX, Math.max(LEN_MIN_PX, speed * LEN_PER_SPEED));
    const sx = len / 64; // Frame-Basisbreite 64 px
    p.core.setPosition(x, y).setRotation(rot).setScale(sx, 1);
    p.halo.setPosition(x, y).setRotation(rot).setScale(sx, HALO_SCALE_Y);
  }

  /** Schuss vorbei (Einschlag/Timeout): Paar klingt render-seitig aus. */
  release(p: TracerPair | undefined): void {
    if (!p || !p.live) return;
    p.live = false;
    p.fadeMs = FADE_MS;
  }

  private tick(_t: number, dtMs: number): void {
    for (const p of this.pairs) {
      if (p.fadeMs <= 0) continue;
      p.fadeMs -= dtMs;
      const a = Math.max(0, p.fadeMs / FADE_MS);
      if (a <= 0) {
        p.core.setVisible(false).setActive(false);
        p.halo.setVisible(false).setActive(false);
      } else {
        p.core.setAlpha(a);
        p.halo.setAlpha(a * HALO_ALPHA);
      }
    }
  }

  /** Diagnose fuer Messungen (Beweis 3/5). */
  stats(): { live: number; fading: number } {
    let live = 0;
    let fading = 0;
    for (const p of this.pairs) {
      if (p.live) live++;
      else if (p.fadeMs > 0) fading++;
    }
    return { live, fading };
  }
}

// Per-Scene-Singleton (Repo-Konvention, vgl. BloodSystem/ProductionGlowSystem).
const systems = new WeakMap<Phaser.Scene, TracerFx>();
export function getTracerFx(scene: Phaser.Scene): TracerFx {
  let s = systems.get(scene);
  if (!s) {
    s = new TracerFx(scene);
    systems.set(scene, s);
  }
  return s;
}
