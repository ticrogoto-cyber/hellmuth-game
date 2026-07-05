import Phaser from "phaser";
import { FX_KIT_KEY, FX_KIT_FRAMES, ensureFxKit } from "./fx_kit";
import { PALETTE } from "./palette";
import { AURA_FX_DEPTH } from "../util/world";
import { MOVEMENT } from "../data/balance";
import type { GameState } from "../systems/game_state";
import type { Unit } from "../entities/unit";

// AUREN-RINGE (Gefechts-VFX Paket 3, D2 Option a): EINE weisse 256er-Ring-Textur
// aus dem FX-Kit, instanziert unter HELLMUTH-Einheiten, ADD + Gold-Tint. Alle
// Ringe liegen auf dem Boden-ADD-Band AURA_FX_DEPTH (-70000, freier Slot
// zwischen Boden-Aura -80000 und Veil -60000): zwischen Boden-Decals und den
// y-sortierten Einheiten, konsekutiv in der Depth-Ordnung -> praktisch EIN
// Batch fuer alle Ringe. Das Fusszonen-Artefakt bei Ueberlappung entspricht dem
// Look der Referenzspiele (LoL-Decal-Pass, SC2-Splat; D2).
//
// DETERMINISMUS (Brief-Verbot: keine Wanduhr, kein Math.random): der Puls liest
// die SIM-UHR gameState.simTick (30 Hz, monoton, per setSeed genullt); die
// Phase je Einheit kommt aus unit.id * goldenAngle (dasselbe Muster wie die
// movement-Entstapelung). Zwei Laeufe mit gleichem Seed zeigen bit-identische
// Puls-Phasen. Der Render-Tick liest nur Sim-Wahrheit (unit.x/y, simTick).
//
// Pooling: Ringe werden wiederverwendet (setVisible), nie pro Einheit zerstoert.

const PROBE_MS = 250; // Zuordnungs-Poll (Repo-Muster production_glow)
const RING_WORLD_PX = 56; // Ring-Durchmesser am Boden (Einheiten-Fusskreis)
const ISO_SQUASH = 0.55; // Iso-Ellipse (Tile 160x96-Verhaeltnis)
const PULSE_PERIOD_TICKS = 60; // 2 s bei 30 Hz (production_glow-Kadenz)
const ALPHA_MIN = 0.3;
const ALPHA_MAX = 0.55;
const SCALE_PULSE = 0.05; // +-5 % Groessen-Atmung
const MAX_RINGS = 64; // Budget-Deckel (D2: 20-50 Ringe sind Rauschen)

interface RingSlot {
  img: Phaser.GameObjects.Image;
  unit?: Unit;
}

export class AuraRingSystem {
  private readonly slots: RingSlot[] = [];
  private probeAcc = 0;

  constructor(private readonly scene: Phaser.Scene) {
    ensureFxKit(scene);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.tick, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.events.off(Phaser.Scenes.Events.UPDATE, this.tick, this);
      delete (scene as unknown as { __auraRings?: AuraRingSystem }).__auraRings;
    });
    // Mess-Bruecken-Handle (Beweis 4: Puls-Phasen-Probe), Muster wie scene.fx.
    (scene as unknown as { __auraRings?: AuraRingSystem }).__auraRings = this;
  }

  /** Beweis-4-Sonde: Alpha-Werte aller aktiven Ringe (deterministische
   *  Puls-Phasen), sortiert nach Unit-id -> vergleichbar ueber Laeufe. */
  pulseProbe(): number[] {
    return this.slots
      .filter((s) => !!s.unit)
      .sort((a, b) => (a.unit as Unit).id - (b.unit as Unit).id)
      .map((s) => Math.round(s.img.alpha * 10000) / 10000);
  }

  private acquire(): RingSlot | undefined {
    let s = this.slots.find((q) => !q.unit);
    if (!s) {
      if (this.slots.length >= MAX_RINGS) return undefined;
      const img = this.scene.add
        .image(0, 0, FX_KIT_KEY, FX_KIT_FRAMES.RING)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(AURA_FX_DEPTH)
        .setVisible(false);
      s = { img };
      this.slots.push(s);
    }
    return s;
  }

  /** Zuordnung Einheiten <-> Ringe (gedrosselt): jede lebende HELLMUTH-Einheit
   *  bekommt einen Ring; Ringe toter/entfernter Einheiten kehren in den Pool. */
  private assign(): void {
    const gs = this.scene.registry.get("gameState") as GameState | undefined;
    if (!gs) return;
    const want = new Set<Unit>();
    for (const u of gs.units) if (u.faction === "hellmuth" && !u.isDead) want.add(u);
    for (const s of this.slots) {
      if (s.unit && !want.delete(s.unit)) {
        s.unit = undefined;
        s.img.setVisible(false);
      }
    }
    for (const u of want) {
      const s = this.acquire();
      if (!s) break; // Budget-Deckel erreicht
      s.unit = u;
      s.img.setTint(PALETTE.GOLD_GLOW).setVisible(true);
    }
  }

  private tick(_t: number, dtMs: number): void {
    this.probeAcc += dtMs;
    if (this.probeAcc >= PROBE_MS) {
      this.probeAcc = 0;
      this.assign();
    }
    const gs = this.scene.registry.get("gameState") as GameState | undefined;
    if (!gs) return;
    const tick = gs.simTick; // Sim-Uhr, NICHT Wanduhr
    const omega = (Math.PI * 2) / PULSE_PERIOD_TICKS;
    const base = RING_WORLD_PX / 256; // Frame-Basisgroesse 256 px
    for (const s of this.slots) {
      const u = s.unit;
      if (!u) continue;
      if (u.isDead) {
        s.unit = undefined;
        s.img.setVisible(false);
        continue;
      }
      // Phase deterministisch aus der stabilen Unit-id (goldener Winkel).
      const phase = u.id * MOVEMENT.goldenAngle;
      const w = Math.sin(tick * omega + phase) * 0.5 + 0.5; // 0..1
      const sc = base * (1 + (w - 0.5) * 2 * SCALE_PULSE);
      s.img
        .setPosition(u.x, u.y)
        .setAlpha(ALPHA_MIN + (ALPHA_MAX - ALPHA_MIN) * w)
        .setScale(sc, sc * ISO_SQUASH);
    }
  }

  /** Diagnose (Beweis 3/4): aktive Ringe. */
  stats(): { active: number } {
    return { active: this.slots.filter((s) => !!s.unit).length };
  }
}

const systems = new WeakMap<Phaser.Scene, AuraRingSystem>();
export function getAuraRingSystem(scene: Phaser.Scene): AuraRingSystem {
  let s = systems.get(scene);
  if (!s) {
    s = new AuraRingSystem(scene);
    systems.set(scene, s);
  }
  return s;
}
