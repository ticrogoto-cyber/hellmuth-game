import Phaser from "phaser";
import { GRID_COLS, GRID_ROWS, gridToWorld } from "../util/world";
import { TILE_WIDTH, TILE_HEIGHT } from "../util/iso";
import { gridWorldRect } from "./map_texture";
import type { GameState } from "./game_state";

// FoW Paket B, Teil 1 -- Schleier-Rendering (Render-Pfad, KEIN Sim-Eingriff).
// Read-only-Verbraucher des VisionGrid: liest nur, schreibt nie.
//
// Die WAHL (gegen 1296 per-Tile-Quads = Budget-Tod + harte Diamantkanten):
// EINE kleine Masken-Textur in Halbkachel-Aufloesung (~72x72, 2x-Uebersample der
// 36x36) wird CPU-seitig aus dem Sichtgitter gebacken und als EIN welt-
// verankertes Bild ueber gridWorldRect() gelegt -- exakt das Schema der
// Megatextur (map_texture.ts): achsenausgerichtetes Bild, Tile (col,row) ->
// (u,v) backt die Iso-Scherung ein, KEIN Mesh/Shear noetig. Der GPU-Bilinear-
// Upscale (FilterMode.LINEAR) liefert den weichen, schmalen Saum gratis.
// 1 Textur + 1 Upload + 1 Draw-Call, konstant ueber die Kartengroesse.
//
// Tiefe: ueber Boden/Aura/Megatextur, UNTER den Einheiten -> toent nur den Grund
// (Feind-Einheiten versteckt Teil 2, nicht der Schleier). Dirty-flag-getrieben:
// neu gebacken nur, wenn sich die Stempel-Generation des Gitters geaendert hat.

/** Schleier-Tiefe: ueber Editor-Atmo-Nebel (-67000..-64000, anderes System) und
 *  ueber Aura (-80000), unter den y-sortierten Einheiten (>= 0). */
export const VEIL_GROUND_DEPTH = -60000;

const VEIL_KEY = "fow_veil_mask";
// Dunkler, leicht kuehler Schleierton (toent, schwaerzt nicht voellig).
const VEIL_R = 6;
const VEIL_G = 9;
const VEIL_B = 13;
// Deckkraft je Zustand (0..255). visible -> 0 (klar).
const ALPHA_BLACK = 224; // unerkundet: schwer, aber nicht stockfinster
const ALPHA_EXPLORED = 116; // gedimmt-erinnert

const LOCAL = "spieler" as const;

export class VeilSystem {
  private readonly tex: Phaser.Textures.CanvasTexture;
  private readonly img: Phaser.GameObjects.Image;
  private readonly buf: ImageData;
  private readonly maskW: number;
  private readonly maskH: number;
  private readonly rect: { x: number; y: number; width: number; height: number };
  private lastVersion = -1;

  constructor(
    scene: Phaser.Scene,
    private readonly state: GameState,
  ) {
    this.rect = gridWorldRect();
    // Halbkachel-Aufloesung: der Iso-Diamant hat ein 2*GRID-Diagonalgitter ->
    // ~72x72 ist genau das 2x-Uebersample der 36x36-Kacheln.
    this.maskW = Math.max(2, Math.round(this.rect.width / (TILE_WIDTH / 2)));
    this.maskH = Math.max(2, Math.round(this.rect.height / (TILE_HEIGHT / 2)));

    const tex = scene.textures.createCanvas(VEIL_KEY, this.maskW, this.maskH);
    if (!tex) throw new Error("VeilSystem: CanvasTexture konnte nicht erzeugt werden");
    this.tex = tex;
    this.tex.setFilter(Phaser.Textures.FilterMode.LINEAR); // weicher Bilinear-Saum
    this.buf = this.tex.context.createImageData(this.maskW, this.maskH);

    this.img = scene.add
      .image(this.rect.x, this.rect.y, VEIL_KEY)
      .setOrigin(0, 0)
      .setDepth(VEIL_GROUND_DEPTH);
    this.img.setDisplaySize(this.rect.width, this.rect.height);

    this.bake();
  }

  /** Pro Frame (Render-Pfad): nur neu backen, wenn das Gitter sich geaendert hat. */
  public update(): void {
    const v = this.state.vision[LOCAL].version;
    if (v === this.lastVersion) return;
    this.lastVersion = v;
    this.bake();
  }

  /** Schleier optional global schalten (z. B. Debug). Beeinflusst nur Render. */
  public setEnabled(on: boolean): void {
    this.img.setVisible(on);
  }

  /** Mess-Hook: Schleier-Deckkraft (0..255) an einer Kachel aus dem gebackenen
   *  Puffer (genau das hochgeladene Bild). 0 = klar/sichtbar. */
  public alphaAt(col: number, row: number): number {
    const w = gridToWorld(col, row);
    const mx = Math.round(((w.x - this.rect.x) / this.rect.width) * this.maskW);
    const my = Math.round(((w.y - this.rect.y) / this.rect.height) * this.maskH);
    if (mx < 0 || my < 0 || mx >= this.maskW || my >= this.maskH) return 0;
    return this.buf.data[(my * this.maskW + mx) * 4 + 3];
  }

  /** Tiefe der EINEN Schleier-Ebene (ein einziger Draw-Call). */
  public get layerDepth(): number {
    return this.img.depth;
  }

  private bake(): void {
    const vis = this.state.vision[LOCAL];
    const data = this.buf.data;
    data.fill(0); // alles klar; nur Schleier-Kacheln werden gestempelt

    // Iso -> Mask ist eine 45deg-Drehung: orthogonale Mask-Nachbarn fallen auf
    // Halbkachel-Luecken. Daher 3x3-Stempel (luecken-frei). ZWEI Paesse:
    //   1) Schleier-Kacheln (unerkundet/erinnert), Max-Alpha gewinnt.
    //   2) sichtbare Kacheln ERZWINGEN klar -> die sichtbare Seite gewinnt am
    //      Rand. Der weiche Saum entsteht erst im GPU-Bilinear und blutet nur in
    //      den Nebel, nie in die Sicht (League-Regel: Gameplay-Hellmuth zuerst).
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const st = vis.visibilityAt(col, row);
        if (st === 2) continue;
        this.stamp(data, col, row, st === 1 ? ALPHA_EXPLORED : ALPHA_BLACK, false);
      }
    }
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        if (vis.visibilityAt(col, row) === 2) this.stamp(data, col, row, 0, true);
      }
    }

    this.tex.context.putImageData(this.buf, 0, 0);
    this.tex.refresh(); // ein Upload pro Aenderung
  }

  /** 3x3-Stempel der Schleier-Deckkraft `a` (0..255) um die Kachel (col,row).
   *  force=true ueberschreibt (sichtbare Kachel reklamiert), sonst Max-Alpha. */
  private stamp(data: Uint8ClampedArray, col: number, row: number, a: number, force: boolean): void {
    const mw = this.maskW;
    const mh = this.maskH;
    const w = gridToWorld(col, row);
    const mx = Math.round(((w.x - this.rect.x) / this.rect.width) * mw);
    const my = Math.round(((w.y - this.rect.y) / this.rect.height) * mh);
    for (let dy = -1; dy <= 1; dy++) {
      const py = my + dy;
      if (py < 0 || py >= mh) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const px = mx + dx;
        if (px < 0 || px >= mw) continue;
        const i = (py * mw + px) * 4;
        if (force || a >= data[i + 3]) {
          data[i] = VEIL_R;
          data[i + 1] = VEIL_G;
          data[i + 2] = VEIL_B;
          data[i + 3] = a;
        }
      }
    }
  }
}
