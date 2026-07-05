import Phaser from "phaser";
import { GLOW_HELLMUTH_KEY } from "../data/glow_manifest";
import { AURA_FX_DEPTH } from "../util/world";
import { PALETTE, cssRgba } from "./palette";
import type { GameState } from "../systems/game_state";
import type { Building } from "../entities/building";
import { EVT_BUILDING_DIED } from "../systems/death_fx";

// PRODUKTIONS-GLOW (HELLMUTH-Destille). Additiver Sprite unter und hinter der
// Destille, HELLMUTH-Gold E8B33A, BlendMode ADD, alpha-pulsierend 0.4..0.7 ueber
// 2 s (Sine.easeInOut, yoyo). Sichtbar nur im aktiven Produktionszustand.
//
// Production-State-Quelle: KEINE eigene State-Maschine, KEIN eigener Timer.
// Code3 emittiert keinen expliziten 'start/stop' -- der Zustand ergibt sich
// deterministisch aus `building.fertig && typeId === 'destille' && !isDead`.
// Wir adoptieren diese Wahrheit (DESTILLAT-SYSTEM: HELLMUTH produziert autonom,
// sobald die Destille fertig ist), statt einen neuen Event-Namen zu erfinden.
// Der reaktive Naht-Punkt ist EVT_BUILDING_DIED fuer sauberes Despawn; der
// Polling-Tick (alle PROBE_MS) verbindet sich mit dem Sim-State des Gebaeudes.
//
// Sortierung: depth = building.y (Fusspunkt der Iso-Sprites). Glow ist ein
// separater Sprite, kein Container-Child -- damit kann eine Einheit, die VOR der
// Destille steht (groesseres y), den Glow ueberlagern, und eine Einheit DAHINTER
// (kleineres y) bleibt hinter dem Glow.

const PULSE_PERIOD_MS = 2000;
const ALPHA_MIN = 0.4;
const ALPHA_MAX = 0.7;
const TILE_PX_REFERENCE = 96; // ungefaehre Iso-Tile-Hoehe, fuer "1.5x Sprite in Tiles"
const RADIUS_MULTIPLIER = 1.5;
const PROBE_MS = 250; // Polling fuer Production-State-Wechsel (idle <-> active)

interface GlowSlot {
  building: Building;
  sprite: Phaser.GameObjects.Image;
  tween?: Phaser.Tweens.Tween;
  active: boolean;
}

// Per-Scene-Singleton (Repo-Konvention; vgl. BloodSystem / WoundTrailSystem).
const systems = new WeakMap<Phaser.Scene, ProductionGlowSystem>();

export function getProductionGlowSystem(scene: Phaser.Scene): ProductionGlowSystem {
  let s = systems.get(scene);
  if (!s) {
    s = new ProductionGlowSystem(scene);
    systems.set(scene, s);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => systems.delete(scene));
  }
  return s;
}

export class ProductionGlowSystem {
  private readonly slots = new Map<number, GlowSlot>(); // key: building.id
  private lastProbeMs = 0;
  // Diagnose / Audit (Kritiker-Pflicht):
  private activationsTotal = 0;
  private deactivationsTotal = 0;

  constructor(private readonly scene: Phaser.Scene) {
    this.ensureTexture();
    const onUpdate = (_t: number, _d: number): void => this.tick();
    scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
    scene.events.on(EVT_BUILDING_DIED, this.onBuildingDied, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
      scene.events.off(EVT_BUILDING_DIED, this.onBuildingDied, this);
      this.destroy();
      // Handle nicht als toten Zeiger auf das zerstoerte System stehen lassen.
      delete (scene as unknown as { productionGlow?: ProductionGlowSystem }).productionGlow;
    });
    (scene as unknown as { productionGlow?: ProductionGlowSystem }).productionGlow = this;
  }

  /** Erzeugt eine Notfall-Textur, falls die generierte PNG (manifest) fehlt -- mit
   *  demselben Cosinus-Falloff wie das echte Asset, damit der Look stimmt. */
  private ensureTexture(): void {
    if (this.scene.textures.exists(GLOW_HELLMUTH_KEY)) return;
    const size = 512;
    const t = this.scene.textures.createCanvas(GLOW_HELLMUTH_KEY, size, size);
    if (!t) return;
    const ctx = t.getContext();
    // Cosinus-Falloff per Radial-Gradient, mehrere Stops fuer ringfreies Profil.
    const cx = size / 2;
    const cy = size / 2;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, size / 2);
    // 1/2*(cos(pi*t)+1) bei t=0,0.25,0.5,0.75,1 -> 1.0, 0.854, 0.5, 0.146, 0.0
    // Gold aus der zentralen FX-Palette (Paket 1).
    g.addColorStop(0.0, cssRgba(PALETTE.GOLD, 1.0));
    g.addColorStop(0.25, cssRgba(PALETTE.GOLD, 0.854));
    g.addColorStop(0.5, cssRgba(PALETTE.GOLD, 0.5));
    g.addColorStop(0.75, cssRgba(PALETTE.GOLD, 0.146));
    g.addColorStop(1.0, cssRgba(PALETTE.GOLD, 0.0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
    ctx.fill();
    t.refresh();
  }

  /** Production-State der Destille -- KEINE eigene State-Maschine, sondern eine
   *  Ableitung aus den vorhandenen Building-Feldern. */
  public isProducing(b: Building): boolean {
    return (
      !b.isDead &&
      b.fertig &&
      b.typeId === "destille" &&
      b.faction === "hellmuth" // DESTILLAT-SYSTEM: HELLMUTH-exklusiv
    );
  }

  /** Zielmaßstab fuer den Glow-Sprite: 1.5x der Destille-Grundflaeche, abgeleitet
   *  aus dem Footprint (Tile-Anzahl x Iso-Tile-Hoehe). BEWUSST NICHT ueber
   *  Container.getBounds(): das misst Label/HP-Balken/Baufortschritt der
   *  Building-Container mit und blaeht den Glow auf -- und reagiert sogar auf
   *  transiente Kinder (Baufortschrittsbalken). Der Footprint ist deterministisch
   *  und kinderunabhaengig, egal ob die echte Destille-PNG vorliegt oder nur der
   *  Platzhalter. */
  private computeScale(b: Building): number {
    const fpTiles = Math.max(b.footprint.w, b.footprint.h);
    const maxPx = fpTiles * TILE_PX_REFERENCE;
    // Glow-Textur ist 512px (Origin 0.5 -> Halbradius 256); Zielradius = 1.5 x Footprint.
    return (RADIUS_MULTIPLIER * maxPx) / 256;
  }

  /** Pro Tick: Production-State je HELLMUTH-Destille pollen, Slots syncen. */
  private tick(): void {
    const now = this.scene.time.now;
    if (now - this.lastProbeMs < PROBE_MS) return;
    this.lastProbeMs = now;
    const gs = this.scene.registry.get("gameState") as GameState | undefined;
    if (!gs) return;

    const liveIds = new Set<number>();
    for (const b of gs.buildings) {
      if (b.typeId !== "destille") continue;
      liveIds.add(b.id);
      const active = this.isProducing(b);
      let slot = this.slots.get(b.id);
      if (!slot) {
        slot = this.createSlot(b);
        this.slots.set(b.id, slot);
      }
      // Position aktualisieren (Gebaeude koennten von einem System verschoben
      // worden sein -- hier robust gegen alles).
      slot.sprite.setPosition(b.x, b.y);
      slot.sprite.setDepth(b.y - 1); // hinter die eigene Destille (s. createSlot)
      if (active && !slot.active) this.activate(slot);
      else if (!active && slot.active) this.deactivate(slot);
    }
    // Entfernte Destillen aus dem Tracking saeubern (z. B. removeBuilding ohne EVT).
    for (const [id, slot] of this.slots) {
      if (!liveIds.has(id)) {
        this.disposeSlot(slot);
        this.slots.delete(id);
      }
    }
  }

  private createSlot(b: Building): GlowSlot {
    const sprite = this.scene.add
      .image(b.x, b.y, GLOW_HELLMUTH_KEY)
      .setOrigin(0.5, 0.5)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(this.computeScale(b))
      .setAlpha(0)
      .setVisible(false)
      // ADD-Konsolidierung (Gefechts-VFX Paket 5): der Boden-Glow liegt im
      // zusammenhaengenden Boden-ADD-Band AURA_FX_DEPTH statt als ADD-Insel im
      // y-sortierten Weltband (dort kostete JEDE Destille zwei Batch-Breaks).
      // Preis: der Glow zeichnet nicht mehr ueber Einheiten vor der Destille --
      // das ist das D2-Referenzverhalten (LoL-Decal-Pass, Fusszonen-Artefakt).
      .setDepth(AURA_FX_DEPTH);
    return { building: b, sprite, active: false };
  }

  private activate(slot: GlowSlot): void {
    slot.sprite.setVisible(true);
    slot.tween?.stop();
    slot.tween = this.scene.tweens.add({
      targets: slot.sprite,
      alpha: { from: ALPHA_MIN, to: ALPHA_MAX },
      duration: PULSE_PERIOD_MS / 2,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });
    slot.active = true;
    this.activationsTotal++;
  }

  private deactivate(slot: GlowSlot): void {
    // Tween HART STOPPEN (Kritiker 3) -- nicht nur den Sprite verstecken.
    slot.tween?.stop();
    this.scene.tweens.killTweensOf(slot.sprite);
    slot.tween = undefined;
    slot.sprite.setAlpha(0).setVisible(false);
    slot.active = false;
    this.deactivationsTotal++;
  }

  private disposeSlot(slot: GlowSlot): void {
    this.deactivate(slot);
    slot.sprite.destroy();
  }

  private onBuildingDied(snap: { x?: number; y?: number }): void {
    // Sofortiges Despawn am gemeldeten Fusspunkt: der Glow ist ein separater
    // Sprite (kein Container-Child) und ueberlebt building.destroy(); ohne dies
    // pulsiert er bis zum naechsten Poll-Tick (<= PROBE_MS) ueber der leeren
    // Stelle weiter. Das Event traegt keine ID -> per Position matchen (Gebaeude
    // ueberlappen nicht, der Fusspunkt ist eindeutig). Greift kein Treffer, raeumt
    // der naechste tick() ohnehin ueber den liveIds-Diff auf.
    if (typeof snap.x !== "number" || typeof snap.y !== "number") return;
    for (const [id, slot] of this.slots) {
      if (Math.abs(slot.building.x - snap.x) < 1 && Math.abs(slot.building.y - snap.y) < 1) {
        this.disposeSlot(slot);
        this.slots.delete(id);
        break;
      }
    }
  }

  /** Diagnose-Stats (Audit, Mess-Bruecke). */
  public stats(): {
    slots: number;
    active: number;
    activations: number;
    deactivations: number;
  } {
    let active = 0;
    for (const s of this.slots.values()) if (s.active) active++;
    return {
      slots: this.slots.size,
      active,
      activations: this.activationsTotal,
      deactivations: this.deactivationsTotal,
    };
  }

  /** Verifiziert (Test-API), dass keine Tweens am Sprite einer deaktivierten
   *  Destille mehr hangen -- Kritiker-Punkt 3. */
  public tweensOnSlot(buildingId: number): number {
    const slot = this.slots.get(buildingId);
    if (!slot) return 0;
    return this.scene.tweens.getTweensOf(slot.sprite).length;
  }

  /** Liefert den ersten Slot (Stable-iteration), damit der Test ihn finden kann. */
  public firstSlot(): GlowSlot | undefined {
    return this.slots.values().next().value;
  }

  public destroy(): void {
    for (const slot of this.slots.values()) this.disposeSlot(slot);
    this.slots.clear();
  }
}
