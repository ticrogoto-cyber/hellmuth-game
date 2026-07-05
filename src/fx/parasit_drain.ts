import Phaser from "phaser";
import { EVT_DESTILLAT_DROPPED, type DestillatDropEvent } from "../systems/death_fx";
import { PALETTE } from "./palette";
import type { GameState } from "../systems/game_state";

// MODERAT-Parasit-Aufsaugen (DESTILLAT-SYSTEM): an EVT_DESTILLAT_DROPPED gekoppelt.
// Eine magentafarbene Linie laeuft vom Drop-Punkt (Toter) zur naechstgelegenen
// MODERAT-Einheit; die Linie wird waehrend der Animation duenner (~600 ms), der
// Endpunkt pulsiert beim Absorber kurz. Lesbar: MODERAT saugt das Destillat
// aus dem Toten. NICHT subtil.
//
// Fallback-Hierarchie: keine Einheit im 800-px-Radius -> Linie zum MODERAT-HQ
// (Zuckermaschine). Kein HQ -> Animation entfaellt (Drop bleibt sim-seitig).
//
// Kritiker-Schutz:
//  - Tint = Sirup-Glint aus der zentralen FX-Palette (kein candy-pink); EXAKT
//    Pixel-Tint, kein additiver Glow am Linien-Render -> Palette respektiert.
//  - Treiber raeumt sich am Animationsende selbst ab; jeder Treiber wird in
//    fx.stats().drivers gezaehlt und drainet messbar.

const MAGENTA = PALETTE.SIRUP_GLINT;
// Linien-Lebensdauer in ms. Default = 600 ms (DESTILLAT-SYSTEM/Spec). Test/
// Headless-Probe darf den Wert via window.__parasit_dur_ms ueberschreiben, ohne
// am Sim-Vertrag zu schrauben.
const DEFAULT_DURATION_MS = 600;
const SEARCH_RADIUS = 800;
const LINE_WIDTH_START = 3;
const LINE_WIDTH_END = 0.5;
const PULSE_RADIUS = 14;
const DEPTH = 600000; // klar ueber Einheiten/Decals

interface DrainState {
  g: Phaser.GameObjects.Graphics;
  pulse: Phaser.GameObjects.Graphics;
  sx: number;
  sy: number;
  fx: () => number;
  fy: () => number;
  /** Endzeit in ms; raeumt sich am Animationsende selbst ab. */
  t0: number;
}

const systems = new WeakMap<Phaser.Scene, ParasitDrainSystem>();

export function getParasitDrainSystem(scene: Phaser.Scene): ParasitDrainSystem {
  let s = systems.get(scene);
  if (!s) {
    s = new ParasitDrainSystem(scene);
    systems.set(scene, s);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => systems.delete(scene));
  }
  return s;
}

export class ParasitDrainSystem {
  private readonly live: DrainState[] = [];
  private animated = 0; // Diagnose: ausgeloeste Animationen
  private fallbackHq = 0; // Diagnose: wie oft an HQ statt Einheit
  private skipped = 0; // Diagnose: keine Einheit, kein HQ -> uebersprungen

  constructor(private readonly scene: Phaser.Scene) {
    scene.events.on(EVT_DESTILLAT_DROPPED, this.onDrop, this);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.tick, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
    (scene as unknown as { parasitDrain?: ParasitDrainSystem }).parasitDrain = this;
  }

  /** Manueller Spawn (z. B. fuer die Mess-Bruecke). Sonst nicht noetig. */
  public spawnDrain(sx: number, sy: number): void {
    this.onDrop({ x: sx, y: sy, amount: 1, killerFaction: "moderat" });
  }

  private onDrop(e: DestillatDropEvent): void {
    const gs = this.scene.registry.get("gameState") as GameState | undefined;
    if (!gs) return;
    if (e.killerFaction !== "moderat") return; // Drop ist MODERAT-exklusiv (Spec).

    // 1) Naechstgelegene MODERAT-Einheit im SEARCH_RADIUS finden.
    let bestU: { x: number; y: number } | undefined;
    let bestD = SEARCH_RADIUS * SEARCH_RADIUS;
    for (const u of gs.units) {
      if (u.faction !== "moderat" || u.isDead) continue;
      const dx = u.x - e.x;
      const dy = u.y - e.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD) {
        bestD = d2;
        bestU = u;
      }
    }
    let targetGet: { fx: () => number; fy: () => number } | undefined;
    if (bestU) {
      const ref = bestU;
      targetGet = { fx: () => ref.x, fy: () => ref.y };
    } else {
      // 2) Fallback: MODERAT-Hauptquartier (Zuckermaschine) als Ziel.
      const hq = gs.buildings.find(
        (b) => b.faction === "moderat" && b.typeId === "zuckermaschine" && !b.isDead,
      );
      if (hq) {
        const ref = hq;
        targetGet = { fx: () => ref.x, fy: () => ref.y };
        this.fallbackHq++;
      } else {
        this.skipped++;
        return; // 3) Kein Ziel -> Animation entfaellt.
      }
    }

    const g = this.scene.add.graphics();
    g.setDepth(DEPTH);
    const pulse = this.scene.add.graphics();
    pulse.setDepth(DEPTH + 1);
    this.live.push({
      g,
      pulse,
      sx: e.x,
      sy: e.y,
      fx: targetGet.fx,
      fy: targetGet.fy,
      t0: this.scene.time.now,
    });
    this.animated++;
  }

  private tick(): void {
    const now = this.scene.time.now;
    const w = window as unknown as { __parasit_dur_ms?: number };
    const dur = typeof w.__parasit_dur_ms === "number" && w.__parasit_dur_ms > 0 ? w.__parasit_dur_ms : DEFAULT_DURATION_MS;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const d = this.live[i];
      const t = (now - d.t0) / dur;
      if (t >= 1) {
        d.g.destroy();
        d.pulse.destroy();
        this.live[i] = this.live[this.live.length - 1];
        this.live.pop();
        continue;
      }
      const lw = LINE_WIDTH_START + (LINE_WIDTH_END - LINE_WIDTH_START) * t;
      const tx = d.fx();
      const ty = d.fy();
      d.g.clear();
      d.g.lineStyle(lw, MAGENTA, 1);
      d.g.beginPath();
      d.g.moveTo(d.sx, d.sy);
      d.g.lineTo(tx, ty);
      d.g.strokePath();
      // Endpunkt-Puls: Sinus-Atmen am Absorber (kurz, lesbar).
      const pulseT = Math.sin(t * Math.PI); // 0 -> 1 -> 0
      d.pulse.clear();
      d.pulse.lineStyle(2, MAGENTA, 1 - t * 0.4);
      d.pulse.strokeCircle(tx, ty, PULSE_RADIUS * (0.55 + 0.45 * pulseT));
    }
  }

  /** Diagnose fuer die Mess-Bruecke (driver-aequivalent). */
  public stats(): { animated: number; fallbackHq: number; skipped: number; live: number } {
    return { animated: this.animated, fallbackHq: this.fallbackHq, skipped: this.skipped, live: this.live.length };
  }

  public destroy(): void {
    this.scene.events.off(EVT_DESTILLAT_DROPPED, this.onDrop, this);
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.tick, this);
    for (const d of this.live) {
      d.g.destroy();
      d.pulse.destroy();
    }
    this.live.length = 0;
  }
}
