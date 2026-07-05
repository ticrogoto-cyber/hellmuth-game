// Welt-/Karten-Konstanten und Helfer fuer HELLMUTH.
// Buendelt die Gittergroesse und den Welt-Offset, damit Scene, Entities und
// Systeme dieselbe Quelle nutzen. Setzt auf iso.ts auf.

import {
  gridToScreen,
  screenToTile,
  TILE_WIDTH,
  TILE_HEIGHT,
  type GridPoint,
  type ScreenPoint,
} from "./iso";

// Kartengroesse (Kacheln). Gegenueber dem Vertical Slice um ~50% vergroessert,
// damit die Basen weit auseinanderliegen und es eine umkaempfte Mitte gibt.
export const GRID_COLS = 36;
export const GRID_ROWS = 36;

// Welt-Offset, damit das gesamte Diamantgitter in positiven Koordinaten liegt.
export const WORLD_ORIGIN_X = GRID_COLS * (TILE_WIDTH / 2);
export const WORLD_ORIGIN_Y = TILE_HEIGHT;

// Pixel-Strecke, die einer Kachel "Tempo-Einheit" entspricht. Aus der
// halben Diamant-Diagonale gemittelt, damit das Tempo (Kacheln/s) in eine
// plausible Pixelgeschwindigkeit uebersetzt.
export const PIXELS_PER_TILE = (TILE_WIDTH + TILE_HEIGHT) / 2;

// Render-Tiefen-Layer. ALLE Weltobjekte (Gebaeude, Doodads, Einheiten) sortieren
// ausschliesslich nach dem Bildschirm-Y ihres Fusspunkts (Gitterzeile -> y),
// auf EINER gemeinsamen Skala (~32..1200): ein suedlicheres Objekt (hoeheres y,
// naeher an der Kamera) zeichnet immer vor einem noerdlicheren. Kein
// Sonder-Offset fuer Einheiten mehr -- sonst stuende der Wald (Doodad) vor
// Gebaeuden/Einheiten unabhaengig vom Fusspunkt. Die Occlusion-Silhouette liegt
// ueber dem gesamten Weltband, damit Geister verdeckter Einheiten obenauf
// sichtbar sind.
export const UNIT_DEPTH_OFFSET = 0;
export const SILHOUETTE_DEPTH = 50000;
// Begehbare Streu-Deko: ueber dem Boden (-100000), unter Gebaeuden/Einheiten.
export const SCATTER_DEPTH = -90000;
// Fundamentflecken (C&C-artig): ueber dem Boden, unter Streu und allen Objekten.
export const FOUNDATION_DEPTH = -95000;
// Boden-Aura (Verankerungsscheibe) freistehender Doodad-Hindernisse: ueber
// Boden und Streu, unter allen Objekten (Gebaeude-Auren sitzen dagegen im
// Gebaeude-Container und sortieren mit ihm).
export const GROUND_AURA_DEPTH = -80000;
// Gefechts-VFX (docs/GEFECHTS-VFX.md, Paket 3/5): die ZWEI zusammenhaengenden
// ADD-Blend-Baender. Boden-Band im freien Slot -80000..-60000 (Auren-Ringe,
// Boden-Glows -- ueber allen opaken Boden-Decals, unter den y-sortierten
// Einheiten); Luft-Band direkt unter dem FX-Partikel-Band 1_000_000 (Tracer,
// Blitze -- ueber Einheiten, D1-Empfehlung). Alles Additive gehoert in genau
// eines dieser Baender, sonst bricht jeder Streuner den Sprite-Batch zweimal.
export const AURA_FX_DEPTH = -70000;
export const FX_AIR_ADD_DEPTH = 990000;

/** Gitter (col, row) -> Welt-Pixel (x, y), inkl. Welt-Offset. */
export function gridToWorld(col: number, row: number): ScreenPoint {
  const s = gridToScreen(col, row);
  return { x: s.x + WORLD_ORIGIN_X, y: s.y + WORLD_ORIGIN_Y };
}

/** Welt-Pixel (x, y) -> ganzzahliger Kachel-Index (col, row). */
export function worldToTile(x: number, y: number): GridPoint {
  return screenToTile(x - WORLD_ORIGIN_X, y - WORLD_ORIGIN_Y);
}

/** Liegt (col, row) innerhalb des Gitters? */
export function inBounds(col: number, row: number): boolean {
  return col >= 0 && row >= 0 && col < GRID_COLS && row < GRID_ROWS;
}

/** Klemmt eine Kachel hart auf die gueltige Kartenflaeche. */
export function clampTile(col: number, row: number): GridPoint {
  return {
    col: Math.min(GRID_COLS - 1, Math.max(0, col)),
    row: Math.min(GRID_ROWS - 1, Math.max(0, row)),
  };
}
