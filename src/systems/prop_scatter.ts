// PROP-SCATTERING (CODE4 Welle 0, Strang D). Deterministischer Editor-Pass, der
// Doodad-Eintraege regelbasiert in die Kartendatei streut. KEIN Laufzeit-System.
//
// Purity-Doktrin (BLUEPRINT-2-SYNTHESE §4): dieses Modul importiert NUR reine
// Utility- und Typ-Bausteine -- keinerlei Phaser-, DOM-, Scene- oder Registry-
// Abhaengigkeiten. Damit ist es headless per tsx testbar (test/scatter/…) und
// bleibt Determinismus-Hash-fest (H28).
//
// Bausteine, die dieses Modul WIEDERVERWENDET:
//  - src/fx/stamp_hash.ts (hash01, hashXY, mulberry32) -- Phaser-frei per Datei-
//    header, positionsgehashter Deterministik-Vertrag.
//  - src/editor/noise.ts (rand2)                       -- ganzzahliger Grid-Hash,
//    explizit als Math.random-Ersatz fuer den Editor dokumentiert.
//  - src/data/balance.ts (DOODADS, DOODAD_PLACEMENT)   -- die Stueckliste + die
//    Kalibrierungs-Konstanten der bestehenden DoodadSystem-Runtime; wir spiegeln
//    sie in die 'zielbild'-Preset-Zeile, damit ein voller Karten-Scatter das
//    gleiche Layout wie die Runtime erzeugen KANN.
//
// Bewusst NICHT abhaengig:
//  - kein Import aus 'phaser' oder aus einem Modul, das 'phaser' importiert.
//  - kein Math.random. Jede zufaellige Entscheidung haengt ausschliesslich von
//    (globalSeed, categorySalt, col, row, drawIndex) ab -- reihenfolge-invariant.
//  - kein 'this.map.doodads.length'-Seeding (wie es scatterDecals in
//    editor_scene.ts:761 macht -- ordnungsabhaengig). Wir hashen Position.

import { hashXY, mulberry32 } from "../fx/stamp_hash";
import { rand2 } from "../editor/noise";
import { DOODADS, DOODAD_PLACEMENT, type DoodadCategory } from "../data/balance";
import { GRID_COLS, GRID_ROWS } from "../util/world";
import type { BuildingTable } from "../data/loader";
import type { CellKind, MapBuilding, MapDoodad, MapNode, MapSpawn } from "../maps/map_format";

// ---------------------------------------------------------------------------
// Task-Kategorien vs. code-DoodadCategory
// ---------------------------------------------------------------------------
// Die CODE4SCATTERING-Spec listet vier Task-Kategorien: fels / baum / wald /
// streu. Die code-DoodadCategory in balance.ts ist feiner (rock, tree, cluster,
// wald, streu). Mapping:
//   Task fels  = code rock
//   Task baum  = code tree + code cluster (baumgruppe 3x3 ist Sondergroesse)
//   Task wald  = code wald (Ein-Sprite-Kategorie)
//   Task streu = code streu
export type ScatterCategory = "fels" | "baum" | "wald" | "streu";

const CAT_TO_CODE: Record<ScatterCategory, DoodadCategory[]> = {
  fels: ["rock"],
  baum: ["tree", "cluster"],
  wald: ["wald"],
  streu: ["streu"],
};

// ---------------------------------------------------------------------------
// Regelwerk (Datentabelle, kein Code-Verzweig)
// ---------------------------------------------------------------------------

/** Eine Regel pro Task-Kategorie. Alle Zahlen in Kachel-Einheiten (integer col/
 *  row, wo nicht anders gesagt). Radien sind harte Sperrkreise (euklidisch). */
export interface ScatterRule {
  /** Positive Sprite-Auswahl mit Gewichten. Fehlt der Eintrag, wird der komplette
   *  Kategorie-Pool aus DOODADS gleichgewichtet genutzt. */
  spritePool?: readonly { type: string; weight: number }[];
  /** Minimalabstand zwischen zwei Instanzen dieser Kategorie (Kacheln). */
  minSpacing: number;
  /** Basis-Zielanzahl fuer die Kategorie bei density=1.0 auf 36x36. Reale Anzahl
   *  = round(count * density * areaFactor). Fuer 'wald'/'baumgruppe' entspricht
   *  das den DOODAD_PLACEMENT-Zaehlern (waldCount/clusterCount/etc.). */
  count: number;
  /** Sperrradius um Spawns + HQ-Gebaeude (Kacheln). */
  radiusHQ: number;
  /** Sperrradius um Ressourcenknoten (Kacheln). */
  radiusResource: number;
  /** Sperrradius um beliebige Gebaeude (Kacheln, Footprint-Rand + dieser Wert). */
  radiusBuilding: number;
  /** Skalierungs-Range (Sprite-scale-Feld). Default [0.82, 1.28] analog
   *  editor_scene.ts:805 placeObject. */
  scaleRange: readonly [number, number];
  /** Sub-Kachel-Jitter (col/row-Deltas), max in Kacheln. Default 0.4 analog
   *  editor_scene.ts:797-798 placeObject. */
  jitter: number;
  /** Nur fuer streu: 3-8 Satelliten pro Poisson-Punkt, verteilt in radius. */
  cluster?: { min: number; max: number; radius: number };
  /** Nur fuer fels: Rand-Bias (0..1). 1 = Kandidaten am Wasser/blocked-Rand
   *  bevorzugt; 0 = keine Rand-Bevorzugung. */
  edgeBias?: number;
}

/** Default-Regelwerk, kalibriert an DOODAD_PLACEMENT (balance.ts:282-316), sodass
 *  Preset 'zielbild' die aktuelle Runtime-Streuung als reine Datenausgabe liefert. */
export const DEFAULT_RULES: Record<ScatterCategory, ScatterRule> = {
  wald: {
    minSpacing: 12, // grosse Fuellflaechen liegen weit auseinander
    count: DOODAD_PLACEMENT.waldCount, // 2
    radiusHQ: DOODAD_PLACEMENT.exclusionRadiusHQ, // 6
    radiusResource: DOODAD_PLACEMENT.exclusionRadiusResource, // 3
    radiusBuilding: DOODAD_PLACEMENT.minSpacingObstacles, // 2
    scaleRange: [0.82, 1.28],
    jitter: 0.4,
  },
  fels: {
    minSpacing: DOODAD_PLACEMENT.minSpacingObstacles, // 2
    count: DOODAD_PLACEMENT.rockCount, // 8
    radiusHQ: DOODAD_PLACEMENT.exclusionRadiusHQ,
    radiusResource: DOODAD_PLACEMENT.exclusionRadiusResource,
    radiusBuilding: DOODAD_PLACEMENT.minSpacingObstacles,
    scaleRange: [0.82, 1.28],
    jitter: 0.4,
    edgeBias: 0.35, // moderat: Felsen laufen bevorzugt am Wasser-/Zonenrand
  },
  baum: {
    // Baumgruppe (3x3, code-cluster) + Einzelbaeume (2x2, code-tree) in einem Zug.
    // spritePool-Gewichtung: baumgruppe 0.3 (~3/13), tree 0.7 auf drei Sprites.
    minSpacing: DOODAD_PLACEMENT.minSpacingObstacles,
    count: DOODAD_PLACEMENT.clusterCount + DOODAD_PLACEMENT.singleTreeCount, // 3+8 = 11
    radiusHQ: DOODAD_PLACEMENT.exclusionRadiusHQ,
    radiusResource: DOODAD_PLACEMENT.exclusionRadiusResource,
    radiusBuilding: DOODAD_PLACEMENT.minSpacingObstacles,
    scaleRange: [0.82, 1.28],
    jitter: 0.4,
  },
  streu: {
    minSpacing: 1.2, // enger, stapelbar in Clustern
    count: 8, // Anzahl Cluster-Zentren; jedes Zentrum spawnt 3-8 Satelliten
    radiusHQ: 3, // streu darf naeher an HQ als Hindernisse
    radiusResource: 1.5,
    radiusBuilding: 1.2,
    scaleRange: [0.85, 1.2],
    jitter: 0.35,
    cluster: { min: 3, max: 8, radius: 2 },
    // 8 Zentren * ~4 Satelliten ~= 32 streu-Doodads => trifft
    // DOODAD_PLACEMENT.clutterCount=32 im Erwartungswert.
  },
};

// ---------------------------------------------------------------------------
// Presets (spec P3)
// ---------------------------------------------------------------------------

export type PresetName = "duenn" | "zielbild" | "dicht";
export type ScatterPreset = Partial<Record<ScatterCategory, { density?: number; count?: number }>>;

/** Dichte-Presets. 'zielbild' = 1.0 pro Kategorie und ist Default. 'duenn' und
 *  'dicht' verschieben nur die density-Multiplikatoren, KEINE Radien -- so bleibt
 *  ein Preset-Wechsel eine reine Zaehlaenderung, kein Layout-Umbau. */
export const PRESETS: Record<PresetName, Required<ScatterPreset>> = {
  duenn: {
    wald: { density: 0.5 },
    fels: { density: 0.5 },
    baum: { density: 0.55 },
    streu: { density: 0.5 },
  },
  zielbild: {
    wald: { density: 1.0 },
    fels: { density: 1.0 },
    baum: { density: 1.0 },
    streu: { density: 1.0 },
  },
  dicht: {
    wald: { density: 1.5 },
    fels: { density: 1.6 },
    baum: { density: 1.7 },
    streu: { density: 1.8 },
  },
};

// ---------------------------------------------------------------------------
// Eingabe / Ausgabe
// ---------------------------------------------------------------------------

/** Lese-Projektion der Karte, die der Scatter braucht. Die Editor-Instanz
 *  reicht die passenden Felder von `MapData` durch; das Modul liest davon nur --
 *  es mutiert die Karte NICHT. Das erzwingt Pfade-Freiheit im Modul und macht
 *  den Rueckgabewert testbar. */
export interface ScatterMapProjection {
  cols: number;
  rows: number;
  spawns: readonly MapSpawn[];
  nodes: readonly MapNode[];
  buildings: readonly MapBuilding[];
  water: readonly { c: number; r: number }[];
  collision: readonly { c: number; r: number; kind: CellKind }[];
  /** Bereits gestreute/manuell platzierte Doodads werden respektiert (keepout). */
  doodads: readonly MapDoodad[];
}

export interface ScatterOptions {
  seed: number;
  /** Preset-Name oder ad-hoc Preset-Objekt. Default: 'zielbild'. */
  preset?: PresetName | ScatterPreset;
  /** Aktive Kategorien. Default: alle vier. */
  categories?: readonly ScatterCategory[];
  /** Regel-Overrides je Kategorie. Un-uebersteuerte Felder erben DEFAULT_RULES. */
  rules?: Partial<Record<ScatterCategory, Partial<ScatterRule>>>;
  /** Optional: Brush-Bereich statt gesamter Karte. Wenn gesetzt, werden nur
   *  Kandidaten mit euklidischer Distanz &lt;= radius zu (cx, cy) angenommen; die
   *  Zielanzahl skaliert proportional zur Flaeche des Kreises vs. Karte. */
  area?: { cx: number; cy: number; radius: number };
  /** Gebaeude-Tabelle fuer Footprint-Aufloesung (typeId -> grundflaeche{w,h}).
   *  Ohne Tabelle fallen alle Gebaeude auf 1x1 zurueck -- HQ-Sperrkreise sitzen
   *  dann off-centre. Deshalb PFLICHT. */
  buildingTable: BuildingTable;
}

export interface ScatterResult {
  doodads: MapDoodad[];
  stats: {
    generated: Record<ScatterCategory, number>;
    rejected: Record<string, number>;
    poissonTries: number;
    poissonCells: number;
  };
}

// ---------------------------------------------------------------------------
// Determinismus-Bausteine
// ---------------------------------------------------------------------------

/** Ganzzahliger Salt pro Kategorie -- entkoppelt die vier RNG-Streams. */
const CATEGORY_SALT: Record<ScatterCategory, number> = {
  wald: 0x001,
  fels: 0x101,
  baum: 0x201,
  streu: 0x301,
};

/** Ganzzahliger Salt pro Feld-Draw (variant/mirror/scale/rotation/seed/jitterX/
 *  jitterY). Getrennte Salts -> unkorrelierte Ausgaben. */
const DRAW_SALT = {
  spritePick: 0x11,
  mirror: 0x22,
  scaleT: 0x33,
  rotationT: 0x44,
  seedField: 0x55,
  jitterX: 0x66,
  jitterY: 0x77,
  clusterCount: 0x88,
  clusterAngle: 0x99,
  clusterRadius: 0xaa,
  poisson: 0xbb,
};

/** Byte-stabile Quantisierung: r3() rundet auf 0.001, ri() auf integer -- exakt
 *  die gleichen Rundungen wie saveMap (map_format.ts:398-409). Damit ist die
 *  Ausgabe des Streuers auch VOR dem Speichern bereits kanonisch. */
function r3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
function ri(x: number): number {
  return Math.round(x);
}

/** Deterministischer 4-Draw-Stream an einem Grid-Punkt: pro (col, row, salt)
 *  ein eigener mulberry32. Reihenfolge-invariant, egal in welcher Ordnung die
 *  Kandidaten verarbeitet werden. */
function drawsAt(col: number, row: number, salt: number): () => number {
  return mulberry32(hashXY(col, row, salt));
}

// ---------------------------------------------------------------------------
// Blocked-Mask (dense Uint8Array, aus sparsen Listen aufgebaut)
// ---------------------------------------------------------------------------

/** Uint8Array-Layout: row-major, index = row * cols + col. 0 = frei, 1 = geblockt
 *  (water/collision/gebaeude/nodes/vorhandene blockierende doodads). streu darf
 *  ueber ALLES ausser water/collision-blocked -- daher zwei Masken. */
interface BlockedMasks {
  hard: Uint8Array; // alles Gebauliche + water + blocked-Kollisionsart
  soft: Uint8Array; // hard PLUS bestehende Doodad-Footprints (nur fuer neue Doodads)
  waterOrBlocked: Uint8Array; // fuer edgeBias-Kanten-Erkennung
}

function idx(cols: number, c: number, r: number): number {
  return r * cols + c;
}

function stampFootprint(mask: Uint8Array, cols: number, rows: number, col: number, row: number, w: number, h: number): void {
  const c0 = Math.floor(col);
  const r0 = Math.floor(row);
  for (let dr = 0; dr < h; dr++) {
    for (let dc = 0; dc < w; dc++) {
      const c = c0 + dc;
      const r = r0 + dr;
      if (c < 0 || c >= cols || r < 0 || r >= rows) continue;
      mask[idx(cols, c, r)] = 1;
    }
  }
}

function buildBlockedMasks(m: ScatterMapProjection, buildingTable: BuildingTable): BlockedMasks {
  const cols = m.cols;
  const rows = m.rows;
  const size = cols * rows;
  const hard = new Uint8Array(size);
  const waterOrBlocked = new Uint8Array(size);

  // 1) water
  for (const w of m.water) {
    if (w.c < 0 || w.c >= cols || w.r < 0 || w.r >= rows) continue;
    hard[idx(cols, w.c, w.r)] = 1;
    waterOrBlocked[idx(cols, w.c, w.r)] = 1;
  }
  // 2) collision overrides (kind 'blocked'|'water'|'syrup' bloomen die Kollision;
  //    'walkable' HEBT sie auf).
  for (const cx of m.collision) {
    if (cx.c < 0 || cx.c >= cols || cx.r < 0 || cx.r >= rows) continue;
    const i = idx(cols, cx.c, cx.r);
    if (cx.kind === "walkable") {
      hard[i] = 0;
      waterOrBlocked[i] = 0;
    } else {
      hard[i] = 1;
      if (cx.kind === "blocked" || cx.kind === "water") waterOrBlocked[i] = 1;
    }
  }
  // 3) gebaeude-Footprints
  for (const b of m.buildings) {
    const fp = buildingTable[b.type]?.grundflaeche ?? { w: 1, h: 1 };
    stampFootprint(hard, cols, rows, b.col, b.row, fp.w, fp.h);
  }
  // 4) nodes als 1x1 (falls Zellen ueberhaupt eine Gebaeude-Grundflaeche haben,
  //    liefert buildingTable das; ohne Eintrag fallen sie auf 1x1).
  for (const n of m.nodes) {
    const fp = buildingTable[n.type]?.grundflaeche ?? { w: 1, h: 1 };
    stampFootprint(hard, cols, rows, n.col, n.row, fp.w, fp.h);
  }

  // 5) soft = hard + bestehende Doodad-Footprints. streu (fp 0x0) wird uebergangen.
  const soft = new Uint8Array(hard);
  for (const d of m.doodads) {
    const def = DOODADS[d.type];
    if (!def || def.footprint.w <= 0 || def.footprint.h <= 0) continue;
    stampFootprint(soft, cols, rows, d.col, d.row, def.footprint.w, def.footprint.h);
  }

  return { hard, soft, waterOrBlocked };
}

// ---------------------------------------------------------------------------
// Keepout-Zentren (fuer Kreis-Radien statt Zell-Blocking)
// ---------------------------------------------------------------------------

interface KeepoutPoint {
  cx: number;
  cy: number;
  kind: "hq" | "resource" | "building";
}

function collectKeepoutPoints(m: ScatterMapProjection, buildingTable: BuildingTable): KeepoutPoint[] {
  const out: KeepoutPoint[] = [];
  // Spawns (Player-Startpunkt vor jeder Gebaeude-Instanziierung).
  for (const s of m.spawns) out.push({ cx: s.col + 0.5, cy: s.row + 0.5, kind: "hq" });
  // Gebaeude + Rolle. HQs (role='hq') zaehlen doppelt (hq-Radius statt building-Radius).
  for (const b of m.buildings) {
    const def = buildingTable[b.type];
    const fp = def?.grundflaeche ?? { w: 1, h: 1 };
    const cx = b.col + fp.w / 2;
    const cy = b.row + fp.h / 2;
    out.push({ cx, cy, kind: def?.role === "hq" ? "hq" : "building" });
  }
  // Ressourcenknoten.
  for (const n of m.nodes) out.push({ cx: n.col + 0.5, cy: n.row + 0.5, kind: "resource" });
  return out;
}

function passesKeepout(col: number, row: number, keepouts: KeepoutPoint[], rule: ScatterRule): boolean {
  for (const k of keepouts) {
    const dc = col - k.cx;
    const dr = row - k.cy;
    const d2 = dc * dc + dr * dr;
    const r = k.kind === "hq" ? rule.radiusHQ : k.kind === "resource" ? rule.radiusResource : rule.radiusBuilding;
    if (d2 < r * r) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Poisson-Disc (Bridson-Variante, grid-beschleunigt)
// ---------------------------------------------------------------------------
// Referenz: Bridson (2007) 'Fast Poisson Disk Sampling in Arbitrary Dimensions',
// MIT-typische Kernschleife: acceleration grid = zelle < r/sqrt(2), so dass
// jede Zelle hoechstens einen Sample traegt und Nachbarschafts-Checks O(1)
// bleiben. Lizenz: eigene Implementierung, keine Fremdbibliothek.

interface PoissonAcceptor {
  (col: number, row: number): boolean;
}

interface PoissonOptions {
  cols: number;
  rows: number;
  minDist: number;
  seed: number;
  categorySalt: number;
  /** Maximale Punktzahl (Bridson bricht spaetestens hier ab). */
  maxPoints: number;
  /** k-Kandidaten je aktiver Punkt (Bridson-Standard = 30, editor_scene:764 = 30). */
  kTries: number;
  /** Zellzentrums-Filter (Keepout, Blocked-Mask, area). */
  accept: PoissonAcceptor;
  /** Optional: Brush-Bereich. */
  area?: { cx: number; cy: number; radius: number };
}

interface PoissonReport {
  points: { col: number; row: number }[];
  triesUsed: number;
  cellsFilled: number;
}

function poissonDisc(opts: PoissonOptions): PoissonReport {
  const { cols, rows, minDist, seed, categorySalt, maxPoints, kTries, accept, area } = opts;
  const cellSize = minDist / Math.SQRT2;
  const gCols = Math.ceil(cols / cellSize);
  const gRows = Math.ceil(rows / cellSize);
  const grid = new Int32Array(gCols * gRows).fill(-1);

  const points: { col: number; row: number }[] = [];
  const active: number[] = [];
  let tries = 0;

  const gi = (gc: number, gr: number): number => gr * gCols + gc;

  const findValidCell = (col: number, row: number): boolean => {
    if (col < 0 || row < 0 || col >= cols || row >= rows) return false;
    const gc = Math.floor(col / cellSize);
    const gr = Math.floor(row / cellSize);
    const c0 = Math.max(0, gc - 2);
    const r0 = Math.max(0, gr - 2);
    const c1 = Math.min(gCols - 1, gc + 2);
    const r1 = Math.min(gRows - 1, gr + 2);
    for (let gr2 = r0; gr2 <= r1; gr2++) {
      for (let gc2 = c0; gc2 <= c1; gc2++) {
        const idx2 = grid[gi(gc2, gr2)];
        if (idx2 < 0) continue;
        const p = points[idx2];
        const dc = p.col - col;
        const dr = p.row - row;
        if (dc * dc + dr * dr < minDist * minDist) return false;
      }
    }
    return true;
  };

  const addPoint = (col: number, row: number): void => {
    const gc = Math.floor(col / cellSize);
    const gr = Math.floor(row / cellSize);
    const idx2 = points.length;
    points.push({ col, row });
    grid[gi(gc, gr)] = idx2;
    active.push(idx2);
  };

  // Startpunkt: deterministisch aus (seed, categorySalt). Wenn area gesetzt ist,
  // wird der Mittelpunkt genommen; sonst die Kartenmitte modulo Hash.
  const centreCol = area ? area.cx : cols / 2;
  const centreRow = area ? area.cy : rows / 2;
  const seedRnd = mulberry32(hashXY(centreCol, centreRow, seed ^ categorySalt ^ DRAW_SALT.poisson));
  // Wir versuchen bis zu 64 zufaellige Startpunkte im (area | Karte), bis einer
  // akzeptiert wird -- damit der erste Fels nicht in einem HQ landet.
  for (let s = 0; s < 64; s++) {
    let sCol: number;
    let sRow: number;
    if (area) {
      // Random point im Kreis: sqrt(u) * radius, angle 2*pi*v
      const u = seedRnd();
      const v = seedRnd();
      const r = Math.sqrt(u) * area.radius;
      const a = v * 2 * Math.PI;
      sCol = area.cx + Math.cos(a) * r;
      sRow = area.cy + Math.sin(a) * r;
    } else {
      sCol = seedRnd() * cols;
      sRow = seedRnd() * rows;
    }
    if (accept(sCol, sRow) && findValidCell(sCol, sRow)) {
      addPoint(sCol, sRow);
      break;
    }
  }
  if (points.length === 0) return { points, triesUsed: 0, cellsFilled: 0 };

  // Bridson-Hauptschleife.
  while (active.length > 0 && points.length < maxPoints) {
    // Deterministische Auswahl aus active: die letzte (LIFO) -- reihenfolge-
    // unabhaengig, weil active nur aus akzeptierten Kandidaten befuellt wird,
    // die ihrerseits reihenfolgeunabhaengig hashen.
    const idxA = active[active.length - 1];
    const base = points[idxA];
    const localRnd = mulberry32(hashXY(base.col, base.row, seed ^ categorySalt ^ 0x137));
    let placed = false;
    for (let k = 0; k < kTries; k++) {
      tries++;
      const u = localRnd();
      const v = localRnd();
      const r = minDist * (1 + u); // [minDist, 2*minDist)
      const a = v * 2 * Math.PI;
      const col = base.col + Math.cos(a) * r;
      const row = base.row + Math.sin(a) * r;
      if (area) {
        const dc = col - area.cx;
        const dr = row - area.cy;
        if (dc * dc + dr * dr > area.radius * area.radius) continue;
      }
      if (!accept(col, row)) continue;
      if (!findValidCell(col, row)) continue;
      addPoint(col, row);
      placed = true;
      break;
    }
    if (!placed) active.pop();
  }

  let cellsFilled = 0;
  for (let i = 0; i < grid.length; i++) if (grid[i] >= 0) cellsFilled++;
  return { points, triesUsed: tries, cellsFilled };
}

// ---------------------------------------------------------------------------
// Sprite-Auswahl aus Pool
// ---------------------------------------------------------------------------

function poolForCategory(cat: ScatterCategory, rule: ScatterRule): { type: string; weight: number }[] {
  if (rule.spritePool && rule.spritePool.length > 0) return [...rule.spritePool];
  const codeCats = CAT_TO_CODE[cat];
  const pool: { type: string; weight: number }[] = [];
  for (const [type, def] of Object.entries(DOODADS)) {
    if (codeCats.includes(def.category)) pool.push({ type, weight: 1 });
  }
  // Deterministische Reihenfolge (Objekt.entries ist zwar Insertion-order, aber
  // wir sortieren zusaetzlich alphabetisch, damit rule-Overrides und Default den
  // gleichen Index-Kanal treffen -- Determinismus-Vertrag).
  pool.sort((a, b) => a.type.localeCompare(b.type));
  return pool;
}

function pickFromPool(pool: readonly { type: string; weight: number }[], r: number): string {
  let total = 0;
  for (const p of pool) total += p.weight;
  const target = r * total;
  let acc = 0;
  for (const p of pool) {
    acc += p.weight;
    if (target < acc) return p.type;
  }
  return pool[pool.length - 1].type;
}

// ---------------------------------------------------------------------------
// Regel-Merge und Preset-Aufloesung
// ---------------------------------------------------------------------------

function mergeRule(base: ScatterRule, ov?: Partial<ScatterRule>): ScatterRule {
  if (!ov) return base;
  return {
    spritePool: ov.spritePool ?? base.spritePool,
    minSpacing: ov.minSpacing ?? base.minSpacing,
    count: ov.count ?? base.count,
    radiusHQ: ov.radiusHQ ?? base.radiusHQ,
    radiusResource: ov.radiusResource ?? base.radiusResource,
    radiusBuilding: ov.radiusBuilding ?? base.radiusBuilding,
    scaleRange: ov.scaleRange ?? base.scaleRange,
    jitter: ov.jitter ?? base.jitter,
    cluster: ov.cluster ?? base.cluster,
    edgeBias: ov.edgeBias ?? base.edgeBias,
  };
}

function resolvePreset(preset: ScatterOptions["preset"]): Required<ScatterPreset> {
  if (!preset) return PRESETS.zielbild;
  if (typeof preset === "string") return PRESETS[preset];
  return {
    wald: { density: preset.wald?.density ?? 1, count: preset.wald?.count ?? -1 },
    fels: { density: preset.fels?.density ?? 1, count: preset.fels?.count ?? -1 },
    baum: { density: preset.baum?.density ?? 1, count: preset.baum?.count ?? -1 },
    streu: { density: preset.streu?.density ?? 1, count: preset.streu?.count ?? -1 },
  };
}

// ---------------------------------------------------------------------------
// Kern: scatterProps
// ---------------------------------------------------------------------------

/** Prioritaets-Reihenfolge: gross-vor-klein, gross exklusiv pro Zelle, klein
 *  stapelbar (streu-Cluster). wald zuerst (8x8), dann fels (2x2/2x3/3x2), dann
 *  baum (2x2 + cluster 3x3), dann streu (0x0). */
const CATEGORY_ORDER: readonly ScatterCategory[] = ["wald", "fels", "baum", "streu"];

/** Streut Doodads deterministisch in die Karte. Reine Funktion; keine Seiten-
 *  effekte auf Eingaben. */
export function scatterProps(map: ScatterMapProjection, opts: ScatterOptions): ScatterResult {
  const preset = resolvePreset(opts.preset);
  const categories = opts.categories ?? CATEGORY_ORDER;
  const buildingTable = opts.buildingTable;
  const masks = buildBlockedMasks(map, buildingTable);
  const keepouts = collectKeepoutPoints(map, buildingTable);
  const generated: Record<ScatterCategory, number> = { wald: 0, fels: 0, baum: 0, streu: 0 };
  const rejected: Record<string, number> = {};
  const out: MapDoodad[] = [];
  let totalTries = 0;
  let totalCells = 0;

  // Flaechenskalierung: bei area-Modus die Zielzahl proportional zur Kreis-
  // flaeche gegenueber Kartenflaeche reduzieren.
  const areaFactor = opts.area
    ? Math.min(1, (Math.PI * opts.area.radius * opts.area.radius) / (map.cols * map.rows))
    : 1;

  for (const cat of CATEGORY_ORDER) {
    if (!categories.includes(cat)) continue;
    const rule = mergeRule(DEFAULT_RULES[cat], opts.rules?.[cat]);
    const p = preset[cat] ?? { density: 1, count: -1 };
    const targetCount =
      p.count && p.count >= 0
        ? p.count
        : Math.max(0, Math.round((rule.count * (p.density ?? 1) * areaFactor)));
    if (targetCount <= 0) continue;

    const pool = poolForCategory(cat, rule);
    if (pool.length === 0) {
      rejected[`${cat}:empty_pool`] = (rejected[`${cat}:empty_pool`] ?? 0) + 1;
      continue;
    }

    const catSalt = CATEGORY_SALT[cat];

    // Kandidaten-Akzeptor: keepouts + blocked-Masken.
    // Fuer streu gilt hard (nicht soft), da streu ueber Doodad-Footprints laufen
    // darf; fuer wald/fels/baum gilt soft, da sie Footprints belegen und nicht
    // ueberlappen duerfen.
    const useMask = cat === "streu" ? masks.hard : masks.soft;

    const accept: PoissonAcceptor = (col, row) => {
      if (col < 0 || row < 0 || col >= map.cols || row >= map.rows) return false;
      const ic = Math.floor(col);
      const ir = Math.floor(row);
      if (useMask[idx(map.cols, ic, ir)] === 1) return false;
      if (!passesKeepout(col, row, keepouts, rule)) return false;
      // edgeBias: erhoehe Ablehnungsrate im "inneren" (fern vom Rand), d.h. wenn
      // KEIN Nachbar water/blocked ist, wird der Kandidat mit Wahrscheinlichkeit
      // (1-edgeBias) verworfen. Deterministisch aus hash01(col,row,salt).
      if (rule.edgeBias && rule.edgeBias > 0) {
        let touchesEdge = false;
        for (let dr = -1; dr <= 1 && !touchesEdge; dr++) {
          for (let dc = -1; dc <= 1 && !touchesEdge; dc++) {
            if (dc === 0 && dr === 0) continue;
            const nc = ic + dc;
            const nr = ir + dr;
            if (nc < 0 || nr < 0 || nc >= map.cols || nr >= map.rows) {
              touchesEdge = true;
              break;
            }
            if (masks.waterOrBlocked[idx(map.cols, nc, nr)] === 1) touchesEdge = true;
          }
        }
        if (!touchesEdge) {
          const rnd = drawsAt(ic, ir, opts.seed ^ catSalt ^ 0xed6e)();
          if (rnd > rule.edgeBias) return false;
        }
      }
      return true;
    };

    const poisson = poissonDisc({
      cols: map.cols,
      rows: map.rows,
      minDist: rule.minSpacing,
      seed: opts.seed,
      categorySalt: catSalt,
      maxPoints: cat === "streu" ? targetCount : targetCount * 3, // Puffer, wir kappen unten
      kTries: 30,
      accept,
      area: opts.area,
    });
    totalTries += poisson.triesUsed;
    totalCells += poisson.cellsFilled;

    // Auswahl: erste targetCount Punkte in stabiler Reihenfolge (Poisson liefert
    // sie in Insertion-order, die ihrerseits hash-getrieben ist).
    const chosen = poisson.points.slice(0, targetCount);

    for (const p of chosen) {
      const rnd = drawsAt(p.col, p.row, opts.seed ^ catSalt);
      const spriteR = rnd(); // draw 0: sprite
      const mirrorR = rnd(); // draw 1: mirror
      const scaleR = rnd(); // draw 2: scale
      const jitterXR = rnd(); // draw 3: jitter X
      const jitterYR = rnd(); // draw 4: jitter Y
      const seedR = rnd(); // draw 5: seed-Feld

      const type = pickFromPool(pool, spriteR);
      const jitterX = (jitterXR * 2 - 1) * rule.jitter;
      const jitterY = (jitterYR * 2 - 1) * rule.jitter;
      const col = clampFloat(p.col + jitterX, 0, map.cols - 0.001);
      const row = clampFloat(p.row + jitterY, 0, map.rows - 0.001);
      // Zellen-belegte Doodads: nach Jitter erneut gegen useMask pruefen und
      // Footprint der neuen Position markieren, damit die naechste Kategorie
      // nicht auf uns setzt.
      const def = DOODADS[type];
      if (!def) {
        rejected[`${cat}:missing_def:${type}`] = (rejected[`${cat}:missing_def:${type}`] ?? 0) + 1;
        continue;
      }
      if (def.footprint.w > 0 && def.footprint.h > 0) {
        // Blocke Zellen fuer nachfolgende Kategorien (nur soft-Maske; wald+fels+
        // baum teilen sich soft).
        stampFootprint(masks.soft, map.cols, map.rows, col, row, def.footprint.w, def.footprint.h);
      }
      const scale = rule.scaleRange[0] + scaleR * (rule.scaleRange[1] - rule.scaleRange[0]);
      const mirror = mirrorR < 0.5;
      const seed = Math.floor(seedR * 0x40000000); // int32-halbraum
      const doodad: MapDoodad = {
        type,
        col: r3(col),
        row: r3(row),
        variant: 0,
        mirror,
        scale: r3(scale),
        rotation: 0,
        seed: ri(seed),
      };
      out.push(doodad);
      generated[cat]++;

      // streu-Cluster: 3-8 Satelliten um jeden Poisson-Punkt.
      if (cat === "streu" && rule.cluster) {
        const cCount = Math.round(
          rule.cluster.min + drawsAt(p.col, p.row, opts.seed ^ catSalt ^ DRAW_SALT.clusterCount)() * (rule.cluster.max - rule.cluster.min),
        );
        for (let ci = 0; ci < cCount; ci++) {
          const sRnd = drawsAt(p.col, p.row, opts.seed ^ catSalt ^ DRAW_SALT.clusterAngle ^ (ci + 1) * 0x1d);
          const angle = sRnd() * 2 * Math.PI;
          const radius = drawsAt(p.col, p.row, opts.seed ^ catSalt ^ DRAW_SALT.clusterRadius ^ (ci + 1) * 0x2f)() * rule.cluster.radius;
          const scol = clampFloat(p.col + Math.cos(angle) * radius, 0, map.cols - 0.001);
          const srow = clampFloat(p.row + Math.sin(angle) * radius, 0, map.rows - 0.001);
          if (!accept(scol, srow)) continue;
          const sRnd2 = drawsAt(scol, srow, opts.seed ^ catSalt ^ 0x777);
          const sSpriteR = sRnd2();
          const sMirrorR = sRnd2();
          const sScaleR = sRnd2();
          const sSeedR = sRnd2();
          const sType = pickFromPool(pool, sSpriteR);
          const sDoodad: MapDoodad = {
            type: sType,
            col: r3(scol),
            row: r3(srow),
            variant: 0,
            mirror: sMirrorR < 0.5,
            scale: r3(rule.scaleRange[0] + sScaleR * (rule.scaleRange[1] - rule.scaleRange[0])),
            rotation: 0,
            seed: ri(Math.floor(sSeedR * 0x40000000)),
          };
          out.push(sDoodad);
          generated.streu++;
        }
      }
    }
  }

  // Kanonische Sortierung passend zu saveMap (map_format.ts:317): col asc, row
  // asc, type localeCompare. Damit ist saveMap ein No-op-Sort und die Ausgabe
  // dieses Moduls ist BEREITS byte-stabil.
  out.sort((a, b) => a.col - b.col || a.row - b.row || a.type.localeCompare(b.type));

  return {
    doodads: out,
    stats: {
      generated,
      rejected,
      poissonTries: totalTries,
      poissonCells: totalCells,
    },
  };
}

function clampFloat(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

// ---------------------------------------------------------------------------
// Test-Hilfen (rein deterministisch, keine Phaser-Beruehrung)
// ---------------------------------------------------------------------------

/** Serialisiert ein ScatterResult in eine kanonische, zeilen-basierte Form. Fuer
 *  Determinismus-Tests: zwei Laeufe muessen buchstaeblich identische Strings
 *  liefern. */
export function canonicalize(result: ScatterResult): string {
  const lines: string[] = [];
  for (const d of result.doodads) {
    lines.push(
      `${d.type} col=${d.col.toFixed(3)} row=${d.row.toFixed(3)} v=${d.variant} m=${d.mirror ? 1 : 0} s=${(d.scale ?? 1).toFixed(3)} r=${(d.rotation ?? 0).toFixed(3)} seed=${d.seed}`,
    );
  }
  return lines.join("\n");
}

/** Kleine Leer-Kartenprojektion fuer Tests. GRID_COLS/ROWS aus util/world. */
export function emptyProjection(cols = GRID_COLS, rows = GRID_ROWS): ScatterMapProjection {
  return { cols, rows, spawns: [], nodes: [], buildings: [], water: [], collision: [], doodads: [] };
}

// Export der Regel-Konstanten fuer die Editor-UI (renderOptions kann sie zur
// Anzeige heranziehen -- Preset-Chips, Kategorie-Toggles).
export { CAT_TO_CODE as CATEGORY_TO_CODE };

// Diagnose-Rueckgabe fuer Rand-Faelle (Tests/Reports).
export { rand2 as _rand2ForTest };
