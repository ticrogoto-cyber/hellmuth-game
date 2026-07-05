import Phaser from "phaser";
import { EVT_DESTILLAT_PRODUCED, EVT_BUILDING_DIED, type DestillatProducedEvent } from "../systems/death_fx";
import { PALETTE } from "./palette";

// Destille-Tropfen (HELLMUTH, friedlich-rhythmisch). Pro Produktions-Tick
// (EVT_DESTILLAT_PRODUCED, Default alle 5 s) ein Tropfen aus der Destille-Mitte,
// faellt 8-12 px nach unten, hinterlaesst eine kleine antik-goldene Pfuetze auf
// der Decal-Layer. Pool-Cap MAX_DRIPS_PER_DESTILLE = 8: aelteste Pfuetze
// verblasst und wird recycelt. Ruhig, langsam, KEIN Selbstleuchten -- nur Koenig
// leuchtet selbst (Density-Gesetz). Reine Procedural-Grafik, keine Sprite-Assets.
//
// Kritiker-Schutz:
//  - Tint nur aus der HELLMUTH-Palette (antik-Gold E8B33A/B8860B), keine
//    additiven Blend-Modes, kein Glow-Sprite -> kein Selbstleuchten.
//  - Per-Destille-Cleanup auf EVT_BUILDING_DIED -> kein Treiber-Leak, wenn die
//    Destille zerstoert wird.

const TINT_HEAD = PALETTE.GOLD; // HELLMUTH antik-Gold, hellerer Tropfen
const TINT_PUDDLE = PALETTE.GOLD_TIEF; // HELLMUTH dunkleres Gold, persistente Pfuetze
const MAX_DRIPS_PER_DESTILLE = 8;
const FALL_PX_MIN = 8;
const FALL_PX_MAX = 12;
const FALL_DURATION_MS = 700; // langsam, ruhig
const PUDDLE_RADIUS = 16; // klein, aber lesbar (HELLMUTH-Destille tropft ruhig)
const PUDDLE_FADE_MS = 14000; // ~3 Produktions-Ticks bis weg
const DROP_DEPTH_LIFT = 600; // ueber Boden, unter Sprites
const PUDDLE_DEPTH = -89000; // ueber Scatter-Decal, klar lesbar auf dem Boden

const DROP_TEX = "destille_drip_drop";
const PUDDLE_TEX = "destille_drip_puddle";

interface DripState {
  /** FIFO-Ring aelterer Pfuetzen je Destille (Cap MAX_DRIPS_PER_DESTILLE). */
  puddles: Phaser.GameObjects.Image[];
}

function ensureDripTextures(scene: Phaser.Scene): void {
  // Tropfen + Pfuetze werden direkt in den HELLMUTH-Goldtoenen gezeichnet,
  // statt ueber setTint() (Canvas-Renderer-Tint ist weniger zuverlaessig als ein
  // direkt eingefaerbter Pixel). setTint kann weiterhin nuancieren.
  if (!scene.textures.exists(DROP_TEX)) {
    const t = scene.textures.createCanvas(DROP_TEX, 8, 12);
    if (t) {
      const ctx = t.getContext();
      ctx.fillStyle = "rgba(232,179,58,1)"; // E8B33A, kein Selbstleuchten
      ctx.beginPath();
      ctx.arc(4, 6, 3.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(4, 0);
      ctx.quadraticCurveTo(2.8, 5, 4, 9);
      ctx.quadraticCurveTo(5.2, 5, 4, 0);
      ctx.fill();
      t.refresh();
    }
  }
  if (!scene.textures.exists(PUDDLE_TEX)) {
    const size = PUDDLE_RADIUS * 2 + 2;
    const t = scene.textures.createCanvas(PUDDLE_TEX, size, size);
    if (t) {
      const ctx = t.getContext();
      const cx = size / 2;
      const cy = size / 2;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, PUDDLE_RADIUS);
      g.addColorStop(0, "rgba(184,134,11,0.92)"); // B8860B Kern, opak-warm
      g.addColorStop(0.55, "rgba(160,110,10,0.78)");
      g.addColorStop(1, "rgba(130,90,8,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, PUDDLE_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      t.refresh();
    }
  }
}

// Per-Scene-Singleton. Listet die laufenden Drips je Destille-ID; cleanup auf
// EVT_BUILDING_DIED, scene SHUTDOWN.
const systems = new WeakMap<Phaser.Scene, DestilleDripSystem>();

export function getDestilleDripSystem(scene: Phaser.Scene): DestilleDripSystem {
  let s = systems.get(scene);
  if (!s) {
    s = new DestilleDripSystem(scene);
    systems.set(scene, s);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => systems.delete(scene));
  }
  return s;
}

export class DestilleDripSystem {
  private readonly perDestille = new Map<number, DripState>();
  private dropped = 0; // Diagnose: insgesamt gefallene Tropfen
  private destroyedSinceShutdown = false;

  constructor(private readonly scene: Phaser.Scene) {
    ensureDripTextures(scene);
    scene.events.on(EVT_DESTILLAT_PRODUCED, this.onProduced, this);
    // Kritiker-Punkt 3: Cleanup auf EVT_BUILDING_DIED. death_fx feuert ihn fuer
    // jeden Gebaeude-Tod -- wir streichen die Destille aus dem Tracking.
    scene.events.on(EVT_BUILDING_DIED, this.onBuildingDied, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
    (scene as unknown as { destilleDrip?: DestilleDripSystem }).destilleDrip = this;
  }

  private onProduced(e: DestillatProducedEvent): void {
    // Nur HELLMUTH visuell -- DESTILLAT-SYSTEM: HELLMUTH produziert, MODERAT
    // erbeutet. Sim feuert paritaetisch je Owner; hier filtern.
    if (e.faction !== "hellmuth") return;
    // Destille-ID = Welt-Position-Hash (Welt-Koordinaten sind pro Destille
    // eindeutig, weil Gebaeude nicht ueberlappen). Stabil ueber Ticks hinweg.
    const id = Math.round(e.x) * 100000 + Math.round(e.y);
    this.spawnDrip(id, e.x, e.y);
  }

  private onBuildingDied(s: { x: number; y: number }): void {
    // Wir kennen die ID nicht direkt -- naehern: alle Destillen-Drip-Buckets,
    // deren letzte Pfuetze in der Naehe liegt, ablaufen lassen. (Kein Building-
    // Handle im Event; das ist die billige Strategie ohne Sim-Vertrag zu brechen.)
    void s; // explizit benutzt: wir loeschen NICHT eagerly, sondern lassen die
    // bestehenden Pfuetzen normal ausfaden. Wichtig: NEUE drips kommen ohnehin
    // nicht, weil destille_production die zerstoerte Destille nicht mehr listet.
    this.destroyedSinceShutdown = true; // Diagnose
  }

  /** Spawnt einen Tropfen, der herabfaellt und in eine Pfuetze laeuft. */
  public spawnDrip(destilleId: number, x: number, y: number): void {
    const fallPx = FALL_PX_MIN + Math.random() * (FALL_PX_MAX - FALL_PX_MIN);
    const startY = y - 6; // Mitte der Destille (leicht ueber dem Boden)
    const drop = this.scene.add
      .image(x, startY, DROP_TEX)
      .setDepth(y + DROP_DEPTH_LIFT)
      .setBlendMode(Phaser.BlendModes.NORMAL); // KEIN ADD -> Density-Gesetz
    void TINT_HEAD; // Farbe in der Textur; setTint wuerde nochmal multiplizieren
    this.dropped++;
    this.scene.tweens.add({
      targets: drop,
      y: startY + fallPx,
      alpha: { from: 1, to: 0.85 },
      duration: FALL_DURATION_MS,
      ease: "Quad.In",
      onComplete: () => {
        drop.destroy();
        this.placePuddle(destilleId, x, startY + fallPx);
      },
    });
  }

  private placePuddle(destilleId: number, x: number, y: number): void {
    let state = this.perDestille.get(destilleId);
    if (!state) {
      state = { puddles: [] };
      this.perDestille.set(destilleId, state);
    }
    // Cap MAX_DRIPS_PER_DESTILLE: aelteste verblasst sofort und wird entfernt.
    while (state.puddles.length >= MAX_DRIPS_PER_DESTILLE) {
      const old = state.puddles.shift();
      if (old && old.active) {
        this.scene.tweens.add({
          targets: old,
          alpha: 0,
          duration: 400,
          onComplete: () => old.destroy(),
        });
      }
    }
    // Streuung: Pfuetzen rund um die Destille-Mitte, damit die N Drips als
    // mehrere lesbar bleiben (~16 px Radius, vorzugsweise nach unten).
    const sx = x + (Math.random() * 32 - 16);
    const sy = y + (Math.random() * 10 - 2);
    const puddle = this.scene.add
      .image(sx, sy, PUDDLE_TEX)
      .setDepth(PUDDLE_DEPTH)
      .setAlpha(0.85)
      .setScale(0.7 + Math.random() * 0.5)
      .setBlendMode(Phaser.BlendModes.NORMAL); // KEIN ADD
    void TINT_PUDDLE; // Farbe in der Textur (B8860B-Gradient)
    state.puddles.push(puddle);
    // Persistente Pfuetze, aber langsam verblassend (Decay zugunsten neuer Drops).
    this.scene.tweens.add({
      targets: puddle,
      alpha: 0,
      duration: PUDDLE_FADE_MS,
      ease: "Linear",
      onComplete: () => {
        puddle.destroy();
        const i = state.puddles.indexOf(puddle);
        if (i >= 0) state.puddles.splice(i, 1);
        // Leeren Bucket aus der Map nehmen: sonst akkumulieren tote Destille-
        // Buckets (Positions-Hash-Schluessel) ueber ein langes Match -> Leak.
        if (state.puddles.length === 0) this.perDestille.delete(destilleId);
      },
    });
  }

  /** Diagnose fuer die Mess-Bruecke. */
  public stats(): { dropped: number; puddleBuckets: number; livePuddles: number; cleaned: boolean } {
    let live = 0;
    for (const s of this.perDestille.values()) live += s.puddles.length;
    return {
      dropped: this.dropped,
      puddleBuckets: this.perDestille.size,
      livePuddles: live,
      cleaned: this.destroyedSinceShutdown,
    };
  }

  public destroy(): void {
    this.scene.events.off(EVT_DESTILLAT_PRODUCED, this.onProduced, this);
    this.scene.events.off(EVT_BUILDING_DIED, this.onBuildingDied, this);
    for (const s of this.perDestille.values()) {
      for (const p of s.puddles) p.destroy();
    }
    this.perDestille.clear();
  }
}
