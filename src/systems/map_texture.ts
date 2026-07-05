import Phaser from "phaser";
import { GRID_COLS, GRID_ROWS, gridToWorld } from "../util/world";
import { TILE_WIDTH, TILE_HEIGHT } from "../util/iso";
import type { GameState } from "./game_state";

// Megatextur-Karten (Blueprint §5.1 / ASSET-PROMPTS-KREA-V2 §6): EIN grosses
// gemaltes Karten-PNG wird als unterste Ebene unter allen Sprites gerendert,
// in GPU-taugliche Chunks zerlegt. Eine farbcodierte Kollisionsmaske (zweites
// PNG gleicher Proportionen) wird aufs Tile-Grid gerastert und speist das
// bestehende Blocking/Pathfinding. Das Kachelsystem bleibt Fallback.
//
// Geruest: rendert/importiert nur, wenn die Texturen geladen sind (sonst No-op),
// damit das Spiel ohne Megatextur unveraendert auf dem Kachelboden laeuft.

// Optionale Asset-Schluessel (im Manifest als optional gefuehrt).
export const MAP_TEXTURE_KEY = "map_megatexture";
export const MAP_MASK_KEY = "map_collision";

// Karte liegt ueber dem Platzhalterboden (-100000), unter Fundamenten (-95000),
// Streu (-90000), Auren und allen Weltobjekten.
export const MAP_DEPTH = -99000;

// Maximale Chunk-Kantenlaenge in Quelltextur-Pixeln (GPU-Limit-schonend).
const MAX_CHUNK = 2048;

export type MaskClass = "walkable" | "blocked" | "water" | "syrup";

export interface MapWorldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Welt-Bounding-Box des gesamten Diamantgitters inkl. halber Randkacheln. */
export function gridWorldRect(): MapWorldRect {
  const corners = [
    gridToWorld(0, 0),
    gridToWorld(GRID_COLS - 1, 0),
    gridToWorld(0, GRID_ROWS - 1),
    gridToWorld(GRID_COLS - 1, GRID_ROWS - 1),
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of corners) {
    minX = Math.min(minX, c.x);
    maxX = Math.max(maxX, c.x);
    minY = Math.min(minY, c.y);
    maxY = Math.max(maxY, c.y);
  }
  return {
    x: minX - TILE_WIDTH / 2,
    y: minY - TILE_HEIGHT / 2,
    width: maxX - minX + TILE_WIDTH,
    height: maxY - minY + TILE_HEIGHT,
  };
}

/**
 * Rendert die Megatextur als unterste Ebene, in <=2048-px-Chunks zerlegt. Gibt
 * die erzeugten Chunk-Images zurueck (leeres Array, wenn die Textur fehlt).
 */
export function renderMegatexture(
  scene: Phaser.Scene,
  key: string = MAP_TEXTURE_KEY,
  rect: MapWorldRect = gridWorldRect(),
): Phaser.GameObjects.Image[] {
  if (!scene.textures.exists(key)) return [];
  const tex = scene.textures.get(key);
  const srcImg = tex.getSourceImage() as { width: number; height: number };
  const texW = srcImg.width;
  const texH = srcImg.height;
  const scaleX = rect.width / texW;
  const scaleY = rect.height / texH;

  const images: Phaser.GameObjects.Image[] = [];
  let ci = 0;
  for (let sy = 0; sy < texH; sy += MAX_CHUNK) {
    const ch = Math.min(MAX_CHUNK, texH - sy);
    for (let sx = 0; sx < texW; sx += MAX_CHUNK) {
      const cw = Math.min(MAX_CHUNK, texW - sx);
      const frameName = `__mapchunk_${ci++}`;
      if (!tex.has(frameName)) tex.add(frameName, 0, sx, sy, cw, ch);
      const img = scene.add
        .image(rect.x + sx * scaleX, rect.y + sy * scaleY, key, frameName)
        .setOrigin(0, 0)
        .setDepth(MAP_DEPTH);
      img.setScale(scaleX, scaleY);
      images.push(img);
    }
  }
  return images;
}

/** Farbklasse eines Maskenpixels (Weiss begehbar, Schwarz blockiert, Blau
 * Wasser, Magenta Sirup-Zone). */
export function classifyMaskColor(r: number, g: number, b: number): MaskClass {
  if (b > 150 && r < 120 && g < 120) return "water";
  if (r > 150 && b > 150 && g < 120) return "syrup";
  if ((r + g + b) / 3 < 80) return "blocked";
  return "walkable";
}

export interface MaskResult {
  blocked: number;
  water: number;
  /** Tiles in Sirup-Zonen ("col,row") fuer einen spaeteren Slow-Effekt. */
  syrup: Set<string>;
}

/**
 * Rastert die farbcodierte Kollisionsmaske aufs Tile-Grid und speist das
 * bestehende Blocking (ueber state.blockCell). Sirup-Zonen werden nur gesammelt
 * und zurueckgegeben (kein Mechanik-Eingriff hier). No-op ohne Maskentextur.
 */
export function importCollisionMask(
  scene: Phaser.Scene,
  state: GameState,
  maskKey: string = MAP_MASK_KEY,
  rect: MapWorldRect = gridWorldRect(),
): MaskResult {
  const res: MaskResult = { blocked: 0, water: 0, syrup: new Set<string>() };
  if (!scene.textures.exists(maskKey)) return res;
  const srcImg = scene.textures.get(maskKey).getSourceImage() as {
    width: number;
    height: number;
  };
  const mW = srcImg.width;
  const mH = srcImg.height;

  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const w = gridToWorld(col, row);
      const u = (w.x - rect.x) / rect.width;
      const v = (w.y - rect.y) / rect.height;
      const px = Math.min(mW - 1, Math.max(0, Math.round(u * mW)));
      const py = Math.min(mH - 1, Math.max(0, Math.round(v * mH)));
      const c = scene.textures.getPixel(px, py, maskKey);
      if (!c) continue;
      const cls = classifyMaskColor(c.red, c.green, c.blue);
      if (cls === "blocked") {
        state.blockCell(col, row);
        res.blocked++;
      } else if (cls === "water") {
        state.blockCell(col, row);
        res.water++;
      } else if (cls === "syrup") {
        res.syrup.add(`${col},${row}`);
      }
    }
  }
  return res;
}
