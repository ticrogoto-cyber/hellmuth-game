import { GRID_COLS, inBounds } from "../util/world";
import type { GridPoint } from "../util/iso";

// Grid-A* ueber das 36x36-Gitter. 8-Richtungen, ohne Ecken-Schneiden durch
// zwei blockierte Nachbarn. `blocked(col,row)` meldet belegte Kacheln.
// Open-Liste als Binaer-Min-Heap (O(log n) statt linearem Scan); der Heap ist
// generisch und wird vom Flussfeld-Dijkstra (Paket 2) wiederverwendet.

export type BlockedFn = (col: number, row: number) => boolean;

/**
 * Array-basierter Binaer-Min-Heap. `less(a,b)` ist true, wenn a vor b liegt.
 * Wiederverwendbar (A*, Dijkstra). Lazy deletion erledigt der Aufrufer (er
 * verwirft beim Pop ueberholte/geschlossene Eintraege).
 */
export class MinHeap<T> {
  private readonly a: T[] = [];
  constructor(private readonly less: (x: T, y: T) => boolean) {}
  get size(): number {
    return this.a.length;
  }
  push(v: T): void {
    const a = this.a;
    a.push(v);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.less(a[i], a[p])) {
        [a[i], a[p]] = [a[p], a[i]];
        i = p;
      } else break;
    }
  }
  pop(): T | undefined {
    const a = this.a;
    if (a.length === 0) return undefined;
    const top = a[0];
    const last = a.pop() as T;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      const n = a.length;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let s = i;
        if (l < n && this.less(a[l], a[s])) s = l;
        if (r < n && this.less(a[r], a[s])) s = r;
        if (s === i) break;
        [a[i], a[s]] = [a[s], a[i]];
        i = s;
      }
    }
    return top;
  }
  clear(): void {
    this.a.length = 0;
  }
}

interface Node {
  col: number;
  row: number;
  g: number;
  f: number;
  parent?: Node;
}

const STEP_STRAIGHT = 10;
const STEP_DIAGONAL = 14;

function key(col: number, row: number): number {
  return row * GRID_COLS + col;
}

function heuristic(col: number, row: number, goal: GridPoint): number {
  // Octile-Distanz, passt zur 8-Richtungs-Bewegung.
  const dc = Math.abs(col - goal.col);
  const dr = Math.abs(row - goal.row);
  return STEP_STRAIGHT * (dc + dr) + (STEP_DIAGONAL - 2 * STEP_STRAIGHT) * Math.min(dc, dr);
}

const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
  [1, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
];

/**
 * Findet einen Pfad von start nach goal. Gibt die Kachelfolge inkl. start und
 * goal zurueck, oder ein leeres Array, wenn kein Pfad existiert. start und goal
 * werden als begehbar angenommen (Aufrufer stellt das sicher).
 */
export function findPath(start: GridPoint, goal: GridPoint, blocked: BlockedFn): GridPoint[] {
  if (start.col === goal.col && start.row === goal.row) return [start];

  // best: bestbekannter Knoten je Zelle (Lookup + Decrease-Key-Ersatz).
  // open: Min-Heap auf f. Ueberholte Heap-Eintraege werden beim Pop lazy
  // verworfen (ueber closed bzw. den best-Vergleich). Verhalten bit-identisch
  // zum frueheren linearen Scan, nur O(N log N) statt O(N^2).
  const best = new Map<number, Node>();
  const closed = new Set<number>();
  const open = new MinHeap<Node>((x, y) => x.f < y.f);

  const startNode: Node = {
    col: start.col,
    row: start.row,
    g: 0,
    f: heuristic(start.col, start.row, goal),
  };
  best.set(key(start.col, start.row), startNode);
  open.push(startNode);

  while (open.size > 0) {
    const current = open.pop() as Node;
    const ck = key(current.col, current.row);
    if (closed.has(ck)) continue; // veralteter Heap-Eintrag
    if (current !== best.get(ck)) continue; // von besserem Knoten ueberholt

    if (current.col === goal.col && current.row === goal.row) {
      return reconstruct(current);
    }
    closed.add(ck);

    for (let i = 0; i < NEIGHBORS.length; i++) {
      const [dc, dr] = NEIGHBORS[i];
      const nc = current.col + dc;
      const nr = current.row + dr;
      if (!inBounds(nc, nr) || blocked(nc, nr)) continue;
      const k = key(nc, nr);
      if (closed.has(k)) continue;

      const diagonal = dc !== 0 && dr !== 0;
      // Ecken-Schneiden verhindern: bei Diagonale duerfen die beiden
      // orthogonalen Nachbarn nicht blockiert sein.
      if (diagonal && (blocked(current.col + dc, current.row) || blocked(current.col, current.row + dr))) {
        continue;
      }

      const g = current.g + (diagonal ? STEP_DIAGONAL : STEP_STRAIGHT);
      const existing = best.get(k);
      if (existing && existing.g <= g) continue;

      const node: Node = {
        col: nc,
        row: nr,
        g,
        f: g + heuristic(nc, nr, goal),
        parent: current,
      };
      best.set(k, node);
      open.push(node);
    }
  }

  return [];
}

/**
 * Freie Sichtlinie zwischen zwei Kacheln? Tastet das Segment fein ab und meldet
 * false, sobald eine abgetastete Kachel blockiert ist. Genuegt fuer die
 * Pfadglaettung (String-Pulling); das A* hat Ecken bereits gemieden.
 */
export function hasLineOfSight(a: GridPoint, b: GridPoint, blocked: BlockedFn): boolean {
  const dc = b.col - a.col;
  const dr = b.row - a.row;
  const steps = Math.max(1, Math.ceil(Math.hypot(dc, dr) * 4));
  for (let s = 0; s <= steps; s++) {
    const c = Math.round(a.col + (dc * s) / steps);
    const r = Math.round(a.row + (dr * s) / steps);
    if (blocked(c, r)) return false;
  }
  return true;
}

/**
 * Glaettet einen A*-Kachelpfad per String-Pulling: behaelt nur Wegpunkte, an
 * denen die direkte Sicht zum naechsten abreisst. Ergebnis sind wenige, direkte
 * Wegpunkte fuer eine geschmeidige, diagonale Bahn statt Treppenstufen.
 */
export function smoothPath(cells: GridPoint[], blocked: BlockedFn): GridPoint[] {
  if (cells.length <= 2) return cells;
  const out: GridPoint[] = [cells[0]];
  let anchor = 0;
  for (let i = 2; i < cells.length; i++) {
    if (!hasLineOfSight(cells[anchor], cells[i], blocked)) {
      out.push(cells[i - 1]);
      anchor = i - 1;
    }
  }
  out.push(cells[cells.length - 1]);
  return out;
}

function reconstruct(node: Node): GridPoint[] {
  const path: GridPoint[] = [];
  let cur: Node | undefined = node;
  while (cur) {
    path.push({ col: cur.col, row: cur.row });
    cur = cur.parent;
  }
  return path.reverse();
}

/**
 * Naechste begehbare Kachel zu `target` (per BFS-Ringen), bevorzugt nahe `from`.
 * Nuetzlich, wenn das Ziel selbst belegt ist (Gebaeude, Ressourcenknoten):
 * die Einheit stellt sich daneben.
 */
export function nearestWalkable(
  target: GridPoint,
  blocked: BlockedFn,
  from: GridPoint,
): GridPoint | undefined {
  if (!blocked(target.col, target.row) && inBounds(target.col, target.row)) {
    return target;
  }

  const seen = new Set<number>([key(target.col, target.row)]);
  let frontier: GridPoint[] = [target];
  const candidates: GridPoint[] = [];

  // Bis zu wenigen Ringen nach aussen suchen.
  for (let ring = 0; ring < 6 && candidates.length === 0; ring++) {
    const next: GridPoint[] = [];
    for (const cell of frontier) {
      for (const [dc, dr] of NEIGHBORS) {
        const nc = cell.col + dc;
        const nr = cell.row + dr;
        const k = key(nc, nr);
        if (seen.has(k) || !inBounds(nc, nr)) continue;
        seen.add(k);
        if (!blocked(nc, nr)) candidates.push({ col: nc, row: nr });
        else next.push({ col: nc, row: nr });
      }
    }
    frontier = next;
  }

  if (candidates.length === 0) return undefined;

  candidates.sort(
    (a, b) =>
      Math.abs(a.col - from.col) + Math.abs(a.row - from.row) -
      (Math.abs(b.col - from.col) + Math.abs(b.row - from.row)),
  );
  return candidates[0];
}
