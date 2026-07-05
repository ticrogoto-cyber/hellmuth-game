import Phaser from "phaser";
import { GridEntity } from "./entity";
import { TILE_WIDTH, TILE_HEIGHT } from "../util/iso";
import { nodeSpriteKey, nodeDisplayWidth, NODE_VARIANTS, pickVariant } from "../data/sprites";
import { resourceNodeScale, FOUNDATION, foundationExtent, foundationOffsetY } from "../data/balance";
import { createFoundation } from "../util/foundation";
import { FOUNDATION_DEPTH } from "../util/world";
import { attachResourceLight } from "../systems/fx";
import type { BuildingDef, ResourceId, Owner } from "../data/loader";

const FOCUS_COLOR = 0xffffff;

// Farbe je gefoerderter Ressource (Platzhalter).
const RESOURCE_COLOR: Record<ResourceId, number> = {
  botanicals: 0x7fb069,
  reinwasser: 0x6fa8dc,
  destillat: 0xc59bd6,
};

/**
 * Ressourcenknoten (Hain, Quelle, Destillatsickerung). Datengetrieben aus
 * buildings.json (role "resource"). Haelt einen endlichen, sinkenden Vorrat.
 * Anklickbar, aber nicht als Armee selektierbar.
 */
export class ResourceNode extends GridEntity {
  public readonly typeId: string;
  public readonly def: BuildingDef;
  public readonly ressource: ResourceId;
  public vorrat: number;

  private vorratLabel: Phaser.GameObjects.Text;
  /** Fundamentfleck (Weltobjekt, separat vom Container). */
  private foundation?: Phaser.GameObjects.GameObject;

  constructor(
    scene: Phaser.Scene,
    typeId: string,
    def: BuildingDef,
    col: number,
    row: number,
    owner: Owner = "spieler",
  ) {
    super(scene, col, row, def.name, def.hp ?? 0, owner);
    this.typeId = typeId;
    this.def = def;
    this.ressource = def.ressource as ResourceId;
    this.vorrat = def.vorrat ?? 0;

    const w = TILE_WIDTH * 0.6;
    const h = TILE_HEIGHT * 1.1;
    const dispW = nodeDisplayWidth(typeId) * resourceNodeScale(typeId);
    const variants = NODE_VARIANTS[typeId];
    const variantKey = variants ? pickVariant(variants, col, row) : nodeSpriteKey(typeId);
    const sprite = this.makeBody(variantKey, dispW);
    if (!sprite) {
      const body = scene.add
        .ellipse(0, -h / 2, w, h, RESOURCE_COLOR[this.ressource])
        .setStrokeStyle(2, 0x14110a, 0.9);
      this.add(body);
    }

    // Vorkommens-Umgebungslicht (rein visuell, aus der Engine): Gluehwuermchen,
    // Wasserstrahlen/Nebel bzw. toxisches Flimmern je nach Ressource.
    attachResourceLight(scene, this, this.ressource);

    // Fundamentfleck (ERSETZT den Kontaktschatten): DIN-A4/A5-Regel -- selber
    // Anker (0.5/1.0) und selbe Position (this.x,this.y) wie das Vorkommen-
    // Sprite, nur groesser. Eigenes Weltobjekt unter dem Sprite.
    this.foundation = createFoundation(
      scene,
      FOUNDATION.nodeTexture[typeId],
      this.x,
      this.y + foundationOffsetY("node"),
      dispW,
      foundationExtent("node"),
      FOUNDATION_DEPTH,
    );

    this.addLabel(def.name, -h - 4);
    this.vorratLabel = this.scene.add
      .text(0, -2, this.vorratText(), {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#d7e8c9",
      })
      .setOrigin(0.5, 0.5);
    this.add(this.vorratLabel);
  }

  public get erschoepft(): boolean {
    return this.vorrat <= 0;
  }

  /** Entnimmt bis zu `menge` aus dem Vorrat, gibt die tatsaechliche Menge zurueck. */
  public abbauen(menge: number): number {
    const amt = Math.min(menge, this.vorrat);
    this.vorrat -= amt;
    this.refreshLabel();
    return amt;
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

  private vorratText(): string {
    return this.erschoepft ? "leer" : String(this.vorrat);
  }

  private refreshLabel(): void {
    this.vorratLabel.setText(this.vorratText());
  }
}
