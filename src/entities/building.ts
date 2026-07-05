import Phaser from "phaser";
import { GridEntity } from "./entity";
import { TILE_WIDTH, TILE_HEIGHT, type GridPoint, type ScreenPoint } from "../util/iso";
import { gridToWorld, FOUNDATION_DEPTH } from "../util/world";
import { BUILDING_HP, SELECTION_RING, FOUNDATION, VISION, foundationExtent, foundationOffsetY } from "../data/balance";
import { buildingVariantKey } from "../data/sprites";
import { createFoundation } from "../util/foundation";
import type { Unit } from "./unit";
import type { BuildingDef, FactionId, BuildingRole, Footprint, Owner } from "../data/loader";
import type { DeathSnapshot } from "../systems/death_fx";

const FOCUS_COLOR = 0xffffff;

const FACTION_COLOR: Record<FactionId, number> = {
  hellmuth: 0x6fae8f,
  moderat: 0xae6f6f,
};

/** Ein Eintrag in der Produktionswarteschlange eines Gebaeudes. */
export interface ProductionItem {
  typeId: string;
  name: string;
  totalMs: number;
  pop: number;
}

/**
 * Statisches Gebaeude auf dem Gitter. Datengetrieben aus buildings.json.
 * Belegt seine Grundflaeche (blockiert fuer Pathfinding). Kann im Bau sein
 * (noch nicht funktionsfaehig) und, wenn fertig, Einheiten produzieren.
 */
export class Building extends GridEntity {
  public readonly typeId: string;
  public readonly def: BuildingDef;
  public readonly faction: FactionId;
  public readonly role: BuildingRole;
  public readonly footprint: Footprint;
  private readonly popCapRaw: number;

  /** Fertig gebaut und funktionsfaehig? */
  public fertig: boolean;

  /** Produktionswarteschlange (vom production_system gepflegt). */
  public readonly queue: ProductionItem[] = [];
  /** Vergangene Zeit am aktiven Warteschlangen-Eintrag in ms. */
  public activeElapsedMs = 0;
  /** Aufsummierter Baufortschritt in ms (vom build_system gepflegt). */
  public buildElapsedMs = 0;
  /** Rallypunkt fuer neu produzierte Einheiten (exakte Weltkoordinate). */
  public rally?: ScreenPoint;

  // --- Kampf (nur kampffaehige Gebaeude, z. B. Vorposten) ---
  public attackTarget?: Unit | Building;
  public attackCooldownMs = 0;

  private bodyShape?: Phaser.GameObjects.Rectangle;
  private bodySprite?: Phaser.GameObjects.Image;
  /** Fundamentfleck (Weltobjekt, separat vom Container; eigene Lebensdauer). */
  private foundation?: Phaser.GameObjects.GameObject;
  private progressBg: Phaser.GameObjects.Rectangle;
  private progressFill: Phaser.GameObjects.Rectangle;
  private readonly barWidth: number;

  constructor(
    scene: Phaser.Scene,
    typeId: string,
    def: BuildingDef,
    col: number,
    row: number,
    owner: Owner,
    fertig = true,
  ) {
    super(scene, col, row, def.name, BUILDING_HP[def.role] ?? def.hp ?? 0, owner);
    this.typeId = typeId;
    this.def = def;
    this.faction = def.faction;
    this.role = def.role;
    this.footprint = def.grundflaeche ?? { w: 1, h: 1 };
    this.popCapRaw = def.pop_kap ?? 0;
    this.fertig = fertig;

    // Container auf die Mitte der Grundflaeche setzen (Anker ist die obere Ecke).
    const center = gridToWorld(col + (this.footprint.w - 1) / 2, row + (this.footprint.h - 1) / 2);
    this.setPosition(center.x, center.y);
    this.setDepth(center.y);

    const span = this.footprint.w + this.footprint.h;
    const blockW = span * TILE_WIDTH * 0.28;
    const blockH = TILE_HEIGHT * (1.6 + 0.4 * Math.max(this.footprint.w, this.footprint.h));
    this.barWidth = Math.max(40, blockW * 0.85);

    // Skalierungsgesetz (asset-spec.md): Sprite-Grundflaeche = Footprint x Tile.
    // Die projizierte Footprint-Breite im 5:3-Iso ist (w+h)*HALF_W = (w+h)*80;
    // fuer quadratische Grundflaechen gleich footprint.w * TILE_WIDTH (160).
    // Anker bleibt die Boden-Raute (Container = Footprint-Mitte, Sprite-Origin
    // unten-mittig). Ueberstand nach oben ergibt sich aus dem Seitenverhaeltnis;
    // seitlicher Ueberstand ist durch die exakte Breite ausgeschlossen.
    const dispW = (this.footprint.w + this.footprint.h) * (TILE_WIDTH / 2);

    // Fundamentfleck (ERSETZT den Kontaktschatten): DIN-A4/A5-Regel -- selber
    // Anker (0.5/1.0) und selbe Position wie das Gebaeude-Sprite (= Container-
    // Position `center`), nur groesser. Kein Offset. Sofort sichtbar bei
    // Baubeginn, volle Deckkraft, entkoppelt vom Bau-Fade.
    this.foundation = createFoundation(
      scene,
      FOUNDATION.buildingTexture,
      center.x,
      center.y + foundationOffsetY("building"),
      dispW,
      foundationExtent("building"),
      FOUNDATION_DEPTH,
    );

    // Auswahlring an die Gebaeudegroesse koppeln (iso-flach, 2:1), statt des
    // kleinen Einheiten-Defaults.
    const ringW = dispW * SELECTION_RING.buildingScale;
    this.makeHighlightRing(ringW, ringW * 0.5);

    // Sprite mit Varianten-Auswahl (positionsstabil, AoE4-Stil).
    this.bodySprite = this.makeBody(buildingVariantKey(typeId, col, row), dispW);
    if (!this.bodySprite) {
      this.bodyShape = scene.add
        .rectangle(0, -blockH / 2, blockW, blockH, FACTION_COLOR[def.faction])
        .setStrokeStyle(2, 0x14110a, 0.9);
      this.add(this.bodyShape);
    }

    this.addLabel(def.name, -blockH - 16);

    // Baufortschrittsbalken (nur sichtbar im Bau).
    const barY = -blockH - 4;
    this.progressBg = scene.add
      .rectangle(0, barY, this.barWidth, 6, 0x000000, 0.7)
      .setOrigin(0.5, 0.5);
    this.progressFill = scene.add
      .rectangle(-this.barWidth / 2, barY, 0, 6, 0xc9b06b, 1)
      .setOrigin(0, 0.5);
    this.add(this.progressBg);
    this.add(this.progressFill);

    this.addHealthBar(-blockH - 30, Math.max(48, blockW));

    this.applyBuildVisual();
  }

  /** Sichtradius in Kacheln (FoW). Datenwert oder Kanon-Default. Gebaeude sind
   *  Sichtquellen und erfuellen den VisionSource-Vertrag (Paket A). */
  public get sicht(): number {
    return this.def.sicht ?? VISION.defaultSicht;
  }

  /** Kann das Gebaeude angreifen (kampffaehig und fertig)? */
  public get canAttack(): boolean {
    return this.fertig && (this.def.schaden ?? 0) > 0;
  }

  /** Population-Kap, das dieses Gebaeude beitraegt (nur wenn fertig). */
  public get effectivePopCap(): number {
    return this.fertig ? this.popCapRaw : 0;
  }

  /** Kann das Gebaeude Einheiten produzieren? */
  public get canProduce(): boolean {
    return this.fertig && (this.def.produziert?.length ?? 0) > 0;
  }

  /** Alle Kacheln der Grundflaeche (vom Anker nach +col/+row). */
  public footprintTiles(): GridPoint[] {
    const tiles: GridPoint[] = [];
    for (let dr = 0; dr < this.footprint.h; dr++) {
      for (let dc = 0; dc < this.footprint.w; dc++) {
        tiles.push({ col: this.col + dc, row: this.row + dr });
      }
    }
    return tiles;
  }

  /** Momentaufnahme fuer den FX-Layer beim Gebaeude-Tod (Physik A2): Sprite-
   *  Beschreibung (re-instanziierbar) + Grundflaeche. Der lebende Container wird
   *  unmittelbar danach von removeBuilding abgebaut -- darum eine Beschreibung
   *  statt eines Live-Handles; Code7 baut daraus den Einsturz-Sprite (wie die
   *  Leiche bei Einheiten ueber spawnCorpse). */
  public deathSnapshot(): DeathSnapshot {
    const s: DeathSnapshot = {
      x: this.x,
      y: this.y,
      faction: this.faction,
      footprint: { w: this.footprint.w, h: this.footprint.h },
    };
    if (this.bodySprite) {
      s.key = this.bodySprite.texture.key;
      const fn = this.bodySprite.frame?.name;
      s.frame = typeof fn === "string" ? fn : undefined;
      s.sx = this.bodySprite.scaleX;
      s.sy = this.bodySprite.scaleY;
    }
    return s;
  }

  /** Setzt den Baufortschritt (0..1) und aktualisiert den Balken. */
  public setProgress(ratio: number): void {
    const r = Phaser.Math.Clamp(ratio, 0, 1);
    this.progressFill.width = this.barWidth * r;
  }

  /** Markiert das Gebaeude als fertig. */
  public complete(): void {
    this.fertig = true;
    this.applyBuildVisual();
  }

  public setFocused(on: boolean): void {
    this.setHighlight(on, FOCUS_COLOR);
  }

  /** Raeumt den separaten Fundamentfleck mit auf (kein Container-Kind). */
  public destroy(fromScene?: boolean): void {
    this.foundation?.destroy();
    this.foundation = undefined;
    super.destroy(fromScene);
  }

  /**
   * Blendet nur den Gebaeudekoerper halbtransparent, solange eine Spieler-
   * Einheit dahinter steht (rein visuell). Unverdeckt zurueck auf die
   * Bau-Deckkraft (fertig 1, im Bau 0.45). Aura, Label und Balken bleiben voll.
   */
  public setOccludedFade(faded: boolean, alpha: number): void {
    const base = this.fertig ? 1 : 0.45;
    (this.bodySprite ?? this.bodyShape)?.setAlpha(faded ? alpha : base);
  }

  private applyBuildVisual(): void {
    (this.bodySprite ?? this.bodyShape)?.setAlpha(this.fertig ? 1 : 0.45);
    this.progressBg.setVisible(!this.fertig);
    this.progressFill.setVisible(!this.fertig);
  }
}
