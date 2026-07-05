// sim_load_profile.ts — NODE-DIREKTES Last-Harness fuer den HELLMUTH-Sim-Kern.
//
// HINTERGRUND: dyn_smoke.mjs treibt die Sim ueber Playwright/Chromium, weil
// Unit/Building/GameScene an Phaser.GameObjects.Container haengen (Display-Tree).
// Der ALGORITHMISCHE Kern der heissen Tick-Schleife (stepSim -> rebuildUnitGrid +
// MovementSystem.avoidance + periodische A*-Repaths) ist aber Phaser-frei. Dieses
// Harness importiert genau diese ECHTEN Module (SpatialGrid, findPath/smoothPath/
// nearestWalkable, buildFlowField) und die ECHTEN MOVEMENT-Konstanten und treibt
// sie node-direkt unter 0x. Die avoidance()-Schleife ist 1:1 aus movement_system.ts
// transkribiert (gleiche Kraefte, gleiche queryRadius-Aufrufe, gleicher Tiebreak).
//
//   0x -- tsx tools/sim_load_profile.ts <N> <K>
//   tsx tools/sim_load_profile.ts <N> <K>            (nur ms/Tick, kein Profil)
//
// Einheiten werden kartenweit gestreut (teilerfremd 7/13) wie in dyn_smoke runStage.

import { SpatialGrid } from "../src/systems/spatial_grid";
import { findPath, smoothPath, nearestWalkable } from "../src/systems/pathfinding";
import { buildFlowField } from "../src/systems/flow_field";
import { MOVEMENT } from "../src/data/balance";
import { GRID_COLS, GRID_ROWS, PIXELS_PER_TILE, gridToWorld, worldToTile, inBounds } from "../src/util/world";

const SEPARATION_BUCKET_CAP = 32;
const FIXED_DT_S = 1 / 30; // 30 Hz Sim-Tick

// --- Minimal-Einheit: genau die Felder, die avoidance()/advance() lesen. ---
interface U {
  id: number;
  x: number;
  y: number;
  col: number;
  row: number;
  tempo: number;
  path: { x: number; y: number }[];
  stuckFrames: number;
}

// Statische Hindernisse (Bloecke) -> echtes isBlocked fuer A*/Repath/Nudge.
const blockedSet = new Set<number>();
const isBlocked = (col: number, row: number): boolean => blockedSet.has(row * GRID_COLS + col);
const blockedFn = (col: number, row: number): boolean => isBlocked(col, row);

function clampTile(col: number, row: number): { col: number; row: number } {
  return {
    col: col < 0 ? 0 : col >= GRID_COLS ? GRID_COLS - 1 : col,
    row: row < 0 ? 0 : row >= GRID_ROWS ? GRID_ROWS - 1 : row,
  };
}

// --- ECHTE avoidance()-Schleife, transkribiert aus movement_system.ts -------
const nbrScratch: U[] = [];
function avoidance(units: U[], grid: SpatialGrid<U>): void {
  const m = MOVEMENT;
  const minDist = m.separationDistance;
  for (const a of units) {
    const moving = a.path.length > 0;
    const lookahead = moving ? a.tempo * PIXELS_PER_TILE * m.avoidTau : 0;
    const range = minDist + lookahead;
    const vdir = moving ? moveDir(a) : null;

    const neighbors = grid.queryRadius(a.x, a.y, range, nbrScratch, SEPARATION_BUCKET_CAP);
    let px = 0;
    let py = 0;
    let nearest = Infinity;
    let overlap = false;
    for (let i = 0; i < neighbors.length; i++) {
      const b = neighbors[i];
      if (a === b) continue;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const d = Math.hypot(dx, dy);
      if (d < nearest) nearest = d;
      if (d < minDist - m.sepDeadbandPx) {
        if (d > 0.0001) {
          const t = (minDist - d) / minDist;
          const f = t * t;
          px += (dx / d) * f;
          py += (dy / d) * f;
        } else {
          overlap = true;
        }
      }
      if (moving && vdir && d > 0.0001 && d < range) {
        const ahead = (b.x - a.x) * vdir.x + (b.y - a.y) * vdir.y;
        if (ahead > 0) {
          const w = (1 - d / range) * 0.5;
          px += -vdir.y * w;
          py += vdir.x * w;
        }
      }
    }
    if (overlap) {
      const ang = a.id * m.goldenAngle;
      px += Math.cos(ang);
      py += Math.sin(ang);
    }
    const pm = Math.hypot(px, py);
    if (pm < 0.0001) {
      a.stuckFrames = 0;
      continue;
    }
    let ux = px / pm;
    let uy = py / pm;
    let stepMag = Math.min(pm, 1) * m.sepStepPx;
    if (moving) {
      if (vdir) {
        const along = ux * vdir.x + uy * vdir.y;
        if (along < 0) {
          ux -= along * vdir.x;
          uy -= along * vdir.y;
          const l = Math.hypot(ux, uy);
          if (l <= 0.0001) {
            a.stuckFrames = 0;
            continue;
          }
          ux /= l;
          uy /= l;
        }
      }
      stepMag *= m.avoidWeightMoving;
    } else if (stepMag < m.sepSnapPx) {
      a.stuckFrames = 0;
      continue;
    }
    const moved = tryNudge(a, ux * stepMag, uy * stepMag, nearest);
    if (moving && !moved) {
      if (++a.stuckFrames > m.stuckFrames && vdir) {
        tryNudge(a, -vdir.y * m.sepStepPx, vdir.x * m.sepStepPx, nearest);
      }
    } else {
      a.stuckFrames = 0;
    }
  }
}

function moveDir(a: U): { x: number; y: number } | null {
  if (a.path.length === 0) return null;
  const dx = a.path[0].x - a.x;
  const dy = a.path[0].y - a.y;
  const l = Math.hypot(dx, dy);
  return l > 0.0001 ? { x: dx / l, y: dy / l } : null;
}

function tryNudge(a: U, nx: number, ny: number, nearest: number): boolean {
  const cap = Math.max(nearest * 0.5, MOVEMENT.sepStepPx);
  let mag = Math.hypot(nx, ny);
  if (mag > cap && mag > 0.0001) {
    const s = cap / mag;
    nx *= s;
    ny *= s;
    mag = cap;
  }
  if (mag < 0.0001) return false;
  const free = (x: number, y: number): boolean => {
    const t = worldToTile(x, y);
    return inBounds(t.col, t.row) && !isBlocked(t.col, t.row);
  };
  let tx = a.x + nx;
  let ty = a.y + ny;
  if (!free(tx, ty)) {
    if (free(a.x + nx, a.y)) {
      tx = a.x + nx;
      ty = a.y;
    } else if (free(a.x, a.y + ny)) {
      tx = a.x;
      ty = a.y + ny;
    } else {
      return false;
    }
  }
  a.x = tx;
  a.y = ty;
  const t = worldToTile(tx, ty);
  a.col = t.col;
  a.row = t.row;
  return true;
}

// --- advance(): Einheit entlang ihrer Wegpunkte schieben (aus movement_system) -
function advance(a: U, dt: number): void {
  let budget = a.tempo * PIXELS_PER_TILE * dt;
  while (budget > 0 && a.path.length > 0) {
    const wp = a.path[0];
    const dx = wp.x - a.x;
    const dy = wp.y - a.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= budget || dist === 0) {
      a.x = wp.x;
      a.y = wp.y;
      a.path.shift();
      budget -= dist;
    } else {
      a.x += (dx / dist) * budget;
      a.y += (dy / dist) * budget;
      budget = 0;
    }
  }
  const t = worldToTile(a.x, a.y);
  a.col = t.col;
  a.row = t.row;
}

// --- ECHTER Repath ueber findPath + smoothPath (aus moveUnitTo) --------------
function moveUnitTo(a: U, goalCol: number, goalRow: number): void {
  const goal = clampTile(goalCol, goalRow);
  let target: { col: number; row: number } = goal;
  if (isBlocked(target.col, target.row)) {
    const alt = nearestWalkable(target, blockedFn, { col: a.col, row: a.row });
    if (!alt) {
      a.path = [];
      return;
    }
    target = alt;
  }
  const cells = findPath({ col: a.col, row: a.row }, target, blockedFn);
  if (cells.length <= 1) {
    a.path = [];
    return;
  }
  const smoothed = smoothPath(cells, blockedFn);
  a.path = smoothed.slice(1).map((c) => gridToWorld(c.col, c.row));
}

function main(): void {
  const N = Number(process.argv[2] || 500);
  const K = Number(process.argv[3] || 1000);

  // Spawnen wie dyn_smoke.runStage: kartenweit teilerfremd streuen.
  const units: U[] = [];
  let nextId = 1;
  for (let i = 0; i < N; i++) {
    const col = 1 + ((i * 7) % 34);
    const row = 1 + ((i * 13) % 34);
    const w = gridToWorld(col, row);
    units.push({ id: nextId++, x: w.x, y: w.y, col, row, tempo: 1.0, path: [], stuckFrames: 0 });
  }

  // Einheitengitter mit Zellkante = PIXELS_PER_TILE (wie GameState.rebuildUnitGrid).
  const grid = new SpatialGrid<U>(PIXELS_PER_TILE);

  // Initial-Marsch: jede Einheit bekommt ein echtes A*-Ziel (Pulk bleibt verteilt,
  // wie dyn_smoke march). -> echte Wegpunkt-Last in advance + avoidance.
  for (const a of units) moveUnitTo(a, a.col + 3, a.row + 3);

  // Warmup (JIT) + 5 Schritte wie dyn_smoke.
  for (let s = 0; s < 5; s++) {
    grid.rebuild(units);
    for (const a of units) if (a.path.length > 0) advance(a, FIXED_DT_S);
    avoidance(units, grid);
  }

  const ms: number[] = [];
  for (let s = 0; s < K; s++) {
    const t0 = performance.now();
    // 1:1 stepSim-Hotpath: Gitter neu bauen, bewegen, separieren.
    grid.rebuild(units);
    for (const a of units) if (a.path.length > 0) advance(a, FIXED_DT_S);
    avoidance(units, grid);
    // Periodischer Repath-Sturm (alle 60 Ticks neue Ziele) -> A*-Last messbar.
    if (s % 60 === 59) for (const a of units) moveUnitTo(a, a.col + 3, a.row + 3);
    ms.push(performance.now() - t0);
  }

  const sorted = [...ms].sort((x, y) => x - y);
  const med = sorted[(sorted.length / 2) | 0];
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  const max = sorted[sorted.length - 1];
  const mean = ms.reduce((a, b) => a + b, 0) / ms.length;
  console.log(
    `N=${String(N).padStart(4)} K=${K}  ms/Tick: median=${med.toFixed(3)} mean=${mean.toFixed(3)} p95=${p95.toFixed(3)} max=${max.toFixed(3)}  ` +
      `budget33.3=${med <= 33.3 ? "OK" : "REISST"} budget16.67=${med <= 16.67 ? "OK" : "REISST"}`,
  );
}

main();
