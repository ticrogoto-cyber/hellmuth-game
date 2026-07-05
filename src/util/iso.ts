// Isometrische Koordinaten-Hilfen fuer HELLMUTH.
// Umrechnung zwischen kartesischen Gitterkoordinaten (col, row) und
// isometrischen Bildschirmkoordinaten (x, y). 5:3-Diamantprojektion
// (asset-spec.md §1: Render-Elevation 36,87°, sin θ = 0,6, Tile 160x96,
// steiler als klassisches 2:1 -> Referenz They Are Billions).

/** Kachelbreite in Pixel (volle Diagonale des Diamanten, horizontal). */
export const TILE_WIDTH = 160;

/** Kachelhoehe in Pixel (volle Diagonale des Diamanten, vertikal). 5:3 zu Breite. */
export const TILE_HEIGHT = 96;

const HALF_W = TILE_WIDTH / 2;
const HALF_H = TILE_HEIGHT / 2;

export interface GridPoint {
  col: number;
  row: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

/**
 * Gitter (col, row) -> Bildschirm (x, y). Bezieht sich auf die Mitte der
 * Kachel-Oberseite. Ursprung (0,0) liegt bei Screen (0,0); der Aufrufer
 * verschiebt typischerweise um einen Welt-Offset.
 */
export function gridToScreen(col: number, row: number): ScreenPoint {
  return {
    x: (col - row) * HALF_W,
    y: (col + row) * HALF_H,
  };
}

/**
 * Bildschirm (x, y) -> Gitter (col, row), als Fliesskomma. Inverse von
 * gridToScreen. Fuer Kachel-Index ueber Math.floor runden.
 */
export function screenToGrid(x: number, y: number): { col: number; row: number } {
  const col = (x / HALF_W + y / HALF_H) / 2;
  const row = (y / HALF_H - x / HALF_W) / 2;
  return { col, row };
}

/** Wie screenToGrid, aber auf ganzzahlige Kachel-Indizes abgerundet. */
export function screenToTile(x: number, y: number): GridPoint {
  const { col, row } = screenToGrid(x, y);
  return { col: Math.floor(col), row: Math.floor(row) };
}

/**
 * Die vier Eckpunkte eines Kachel-Diamanten in Bildschirmkoordinaten,
 * im Uhrzeigersinn ab oben. Praktisch zum Zeichnen von Polygonen.
 */
export function tilePolygon(col: number, row: number): ScreenPoint[] {
  const c = gridToScreen(col, row);
  return [
    { x: c.x, y: c.y - HALF_H }, // oben
    { x: c.x + HALF_W, y: c.y }, // rechts
    { x: c.x, y: c.y + HALF_H }, // unten
    { x: c.x - HALF_W, y: c.y }, // links
  ];
}
