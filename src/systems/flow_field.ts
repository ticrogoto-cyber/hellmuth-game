// Flussfeld (Strang 1, Paket 2) — der Schwarm-Traeger fuer viele Einheiten auf
// EIN Ziel. Drei Paesse, Phaser-frei, Index i = row*cols + col (deckungsgleich
// mit pathfinding.key()):
//   1. Cost Field  (Uint8):  blockiert = 255, frei = 1, kostengewichtet 1..63
//      (Mauern/Tuerme heben Kosten -> Schwarm fliesst um starke Verteidigung
//      herum). Deckel 1..63 haelt das Integration Field unter 2^16.
//   2. Integration Field (Uint16): EIN Dijkstra vom Ziel, mit dem Binaer-Heap
//      aus Paket 1 (pathfinding.MinHeap).
//   3. Flow Field (Uint8): 8-Richtungscode je Zelle (steilster Abstieg),
//      0xFF = unerreichbar/Ziel.
// Statt dass jede Einheit einzeln A* sucht (Repath-Sturm), lesen alle den
// Vektor in O(1) aus dem Feld. Die Separation (Strang 2) liegt lokal darueber.

import { MinHeap } from "./pathfinding";

// 8 Richtungen, identische Reihenfolge wie pathfinding.NEIGHBORS.
const DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
  [1, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
];
const BLOCKED = 255;
const UNREACHABLE = 0xffff;
const NO_DIR = 0xff;
// Schrittkosten gerade/diagonal (Verhaeltnis ~1,5 ~= sqrt(2)). Mit Cost-Deckel
// 63 bleibt das Integration Field selbst bei langen Umwegen < 2^16.
const STRAIGHT = 2;
const DIAG = 3;

export type CostFn = (col: number, row: number) => number;
export type BlockedFn = (col: number, row: number) => boolean;

function inBounds(c: number, r: number, cols: number, rows: number): boolean {
  return c >= 0 && r >= 0 && c < cols && r < rows;
}

export class FlowField {
  /** Generation, bei der das Feld gebaut wurde (Cache-Invalidierung). */
  public generation = 0;

  constructor(
    public readonly cols: number,
    public readonly rows: number,
    public readonly goalCol: number,
    public readonly goalRow: number,
    private readonly flow: Uint8Array,
  ) {}

  /** Gitter-Bewegungsrichtung an (col,row) zum Ziel, oder null (Ziel erreicht
   *  bzw. unerreichbar). O(1). */
  dirAt(col: number, row: number): readonly [number, number] | null {
    if (!inBounds(col, row, this.cols, this.rows)) return null;
    const code = this.flow[row * this.cols + col];
    return code === NO_DIR ? null : DIRS[code];
  }
}

/** Baut Cost/Integration/Flow in drei Paessen. `costFn` optional (Default: alle
 *  begehbaren Zellen Kosten 1); Mauern/Tuerme als Gewichte folgen als Design. */
export function buildFlowField(
  cols: number,
  rows: number,
  goalCol: number,
  goalRow: number,
  blockedFn: BlockedFn,
  costFn?: CostFn,
): FlowField {
  const n = cols * rows;

  // Pass 1: Cost Field.
  const cost = new Uint8Array(n);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (blockedFn(c, r)) {
        cost[i] = BLOCKED;
      } else {
        const w = costFn ? costFn(c, r) : 1;
        cost[i] = w < 1 ? 1 : w > 63 ? 63 : w;
      }
    }
  }

  // Pass 2: Integration Field — Dijkstra vom Ziel (Heap aus Paket 1). Der Heap
  // traegt {i, v} mit v = Wert bei Einschub; veraltete Eintraege werden beim Pop
  // lazy verworfen (v > integ[i]).
  const integ = new Uint16Array(n).fill(UNREACHABLE);
  const heap = new MinHeap<{ i: number; v: number }>((a, b) => a.v < b.v);
  const seed = (c: number, r: number): void => {
    if (!inBounds(c, r, cols, rows)) return;
    const i = r * cols + c;
    if (cost[i] < BLOCKED && integ[i] !== 0) {
      integ[i] = 0;
      heap.push({ i, v: 0 });
    }
  };
  if (inBounds(goalCol, goalRow, cols, rows)) {
    if (cost[goalRow * cols + goalCol] < BLOCKED) {
      seed(goalCol, goalRow);
    } else {
      // Blockiertes Ziel (Gebaeude/HQ): von der begehbaren Perimeter aussaeen ->
      // der Schwarm stroemt an die Gebaeudekante und haelt dort (Angriff).
      for (let d = 0; d < 8; d++) seed(goalCol + DIRS[d][0], goalRow + DIRS[d][1]);
    }
  }
  while (heap.size > 0) {
    const top = heap.pop() as { i: number; v: number };
    if (top.v > integ[top.i]) continue; // veraltet
    const cc = top.i % cols;
    const cr = (top.i - cc) / cols;
    const base = integ[top.i];
    for (let d = 0; d < 8; d++) {
      const dc = DIRS[d][0];
      const dr = DIRS[d][1];
      const nc = cc + dc;
      const nr = cr + dr;
      if (!inBounds(nc, nr, cols, rows)) continue;
      const ni = nr * cols + nc;
      if (cost[ni] >= BLOCKED) continue;
      const diag = dc !== 0 && dr !== 0;
      // Kein Ecken-Schneiden: beide Orthogonalen muessen frei sein.
      if (diag && (blockedFn(cc + dc, cr) || blockedFn(cc, cr + dr))) continue;
      const nv = base + cost[ni] * (diag ? DIAG : STRAIGHT);
      if (nv < integ[ni]) {
        integ[ni] = nv;
        heap.push({ i: ni, v: nv });
      }
    }
  }

  // Pass 3: Flow Field — steilster Abstieg zum kleinsten Integrationswert.
  const flow = new Uint8Array(n).fill(NO_DIR);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (integ[i] === UNREACHABLE) continue;
      let best = integ[i];
      let bestDir = NO_DIR;
      for (let d = 0; d < 8; d++) {
        const dc = DIRS[d][0];
        const dr = DIRS[d][1];
        const nc = c + dc;
        const nr = r + dr;
        if (!inBounds(nc, nr, cols, rows)) continue;
        const ni = nr * cols + nc;
        if (integ[ni] === UNREACHABLE) continue;
        const diag = dc !== 0 && dr !== 0;
        if (diag && (blockedFn(c + dc, r) || blockedFn(c, r + dr))) continue;
        if (integ[ni] < best) {
          best = integ[ni];
          bestDir = d;
        }
      }
      flow[i] = bestDir;
    }
  }

  return new FlowField(cols, rows, goalCol, goalRow, flow);
}
