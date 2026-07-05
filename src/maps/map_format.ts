// Kartenformat map.hellmuth.json (Blueprint V3, Teil II §2.1). Die Karte ist
// DATEN, das Bild ist Fassade. Das Spiel laedt exakt dieses Format -- kein
// Importer, keine Uebersetzung. Editor und Spiel teilen sich diesen Typ.

import type { FactionId, Owner } from "../data/loader";
import { GRID_COLS, GRID_ROWS } from "../util/world";

export const MAP_FORMAT_VERSION = 3;

/** Gewichts-Quantisierung: Float-Deckung 0..1 <-> Ganzzahl 0..255 im File.
 *  Ganzzahlig gespeichert -> kein Float-Drift, tiefgleicher Roundtrip moeglich. */
export const WEIGHT_SCALE = 255;

/** Float-Gewicht (0..1) -> robuste Ganzzahl 0..255 (NaN/Infinity -> 0). */
export function quantizeWeight(w: number): number {
  if (!Number.isFinite(w)) return 0;
  return Math.min(WEIGHT_SCALE, Math.max(0, Math.round(w * WEIGHT_SCALE)));
}

/** Kollisions-/Zonenart einer Zelle (deckungsgleich mit der Maskenfarbe). */
export type CellKind = "walkable" | "blocked" | "water" | "syrup";

export interface MapDoodad {
  type: string;
  col: number;
  row: number;
  variant?: number;
  mirror?: boolean;
  /** Skalierungs-Jitter (1.0 = unveraendert). */
  scale?: number;
  /** Rotation in Grad (Decals/streubare Objekte; Default 0). */
  rotation?: number;
  /** Deterministischer Seed der Auto-Variation (Roundtrip-stabil). */
  seed?: number;
}

export interface MapNode {
  type: string;
  col: number;
  row: number;
  owner?: Owner;
}

/**
 * Vorplatziertes Fraktionsgebaeude. Editor-seitig gesetzt; zur Laufzeit
 * instantiiert (Apotheke/Zuckermaschine als HQ kommen bisher AUS dem Spawn -- die
 * `buildings`-Liste ergaenzt, ersetzt sie nicht). Per-Fraktions-Caps (z. B. Destille
 * max 3 je HELLMUTH-Spieler) werden im Editor visualisiert; die Gameplay-Regel
 * (Tier-2-Gate, Cap-Erzwingung im Spiel) lebt im BuildSystem (Code3). Siehe
 * docs/DESTILLAT-SYSTEM.md.
 */
export interface MapBuilding {
  type: string;
  col: number;
  row: number;
  faction: "hellmuth" | "moderat";
}

/**
 * Boden-Decal (Moos, Sirup-Lache): freigestellte Streuakzente UEBER dem Boden,
 * keine Kollision. Sub-Kachel-Position (Gleitkomma col/row), mit automatischer
 * Variation in Rotation, Groesse, Deckkraft und Spiegelung (Organik-Gesetz §7).
 */
export interface MapDecal {
  /** Decal-Satz-Id ("moos" | "sirup"). */
  set: string;
  col: number;
  row: number;
  variant: number;
  /** Rotation in Grad. */
  rot: number;
  /** Skalierung relativ zur Basisgroesse. */
  scale: number;
  /** Deckkraft 0..1. */
  alpha: number;
  mirror: boolean;
}

/**
 * Nebel-Quelle (Silent-Hill-Schwaden, §12): nur Daten/Platzhalter. Der
 * Partikeleffekt kommt spaeter; der Editor setzt bereits die Quellen.
 */
export interface MapFog {
  col: number;
  row: number;
  /** Radius in Kacheln. */
  radius: number;
  /** Dichte 0..1. */
  density: number;
}

export interface MapSpawn {
  player: number;
  col: number;
  row: number;
  faction?: FactionId;
}

/**
 * Splat-Terrain: Standard-Bodentyp plus duenn besetzte Zell-Gewichte.
 *
 * INVARIANTE (Logik/Render-Trennung, zementiert): `w[]` ist REIN RENDER. Die
 * Begehbarkeit wird NIE aus dem dominanten Boden-Gewicht abgeleitet, sondern
 * ausschliesslich in fester Reihenfolge: default begehbar -> `water[]` ->
 * `collision[]` (plus blockierende Doodad-Footprints). Kein Code-Pfad darf `w[]`
 * fuer Kollision/Pathfinding lesen.
 *
 * Im FILE sind die Gewichte Ganzzahlen 0..255 (WEIGHT_SCALE); IM SPEICHER nach
 * loadMap Floats 0..1. Der Renderer normiert ohnehin ueber die Summe.
 */
export interface MapTerrain {
  /** Index in groundTypes, der ueberall gilt, wo keine Zelle gesetzt ist. */
  default: number;
  /** Pro gemalter Zelle die Gewichte je Bodentyp (Reihenfolge = groundTypes). */
  cells: { c: number; r: number; w: number[] }[];
}

export interface MapData {
  version: number;
  name: string;
  cols: number;
  rows: number;
  /** Pinsel-Reihenfolge der Bodentypen (z. B. ["neutral","hellmuth","moderat"]). */
  groundTypes: string[];
  terrain: MapTerrain;
  /** Wasserzellen (duenn besetzt). Setzen Kollision automatisch. */
  water: { c: number; r: number }[];
  doodads: MapDoodad[];
  /** Boden-Decals (Streuebene ueber dem Terrain, keine Kollision). */
  decals: MapDecal[];
  /** Vorplatzierte Fraktionsgebaeude (DESTILLAT-SYSTEM, additiv zu spawns[]). */
  buildings: MapBuilding[];
  nodes: MapNode[];
  spawns: MapSpawn[];
  /** Nebel-Quellen (Platzhalter-Layer, Effekt folgt). */
  fog: MapFog[];
  /** Manuelle Kollisions-Overrides (ueberschreiben die Ableitung). */
  collision: { c: number; r: number; kind: CellKind }[];
  meta?: Record<string, unknown>;
}

const DEFAULT_GROUND_TYPES = ["neutral", "hellmuth", "moderat"];

/** Leere, spielbare Karte: ein Standardboden, sonst nichts. */
export function createEmptyMap(
  cols: number = GRID_COLS,
  rows: number = GRID_ROWS,
  groundTypes: string[] = DEFAULT_GROUND_TYPES,
  name = "Leere Karte",
): MapData {
  return {
    version: MAP_FORMAT_VERSION,
    name,
    cols,
    rows,
    groundTypes,
    terrain: { default: 0, cells: [] },
    water: [],
    doodads: [],
    decals: [],
    buildings: [],
    nodes: [],
    spawns: [],
    fog: [],
    collision: [],
  };
}

// Bekannte Top-Level-Keys (alles andere wird in meta.__unknown durchgereicht,
// damit kuenftige Versionen nicht verlustbehaftet durch den Loader laufen).
const KNOWN_KEYS = new Set([
  "version", "name", "cols", "rows", "groundTypes", "terrain",
  "water", "doodads", "decals", "buildings", "nodes", "spawns", "fog", "collision", "meta",
]);
const CELL_KINDS: ReadonlySet<string> = new Set(["walkable", "blocked", "water", "syrup"]);

/**
 * Versions-Migration. Erste Stufe in loadMap. v1 speicherte Float-Gewichte
 * (beliebige Skala) -> auf Summe 1 normieren und auf Ganzzahl 0..255 quantisieren,
 * sodass ab v2 alle Gewichte ganzzahlig sind. Geruest fuer weitere Stufen.
 */
function migrate(raw: unknown): Record<string, unknown> {
  const m: Record<string, unknown> = raw && typeof raw === "object" ? { ...(raw as object) } : {};
  const ver = typeof m.version === "number" ? (m.version as number) : 1;
  if (ver < 2) {
    const terrain = m.terrain as { default?: number; cells?: unknown[] } | undefined;
    if (terrain && Array.isArray(terrain.cells)) {
      m.terrain = {
        ...terrain,
        cells: terrain.cells.map((cell) => {
          const cc = cell as { c?: number; r?: number; w?: number[] };
          const w = Array.isArray(cc.w) ? cc.w.map(asNum) : [];
          // Auf das MAXIMUM normieren (idempotent; Verhaeltnisse bleiben, der
          // Renderer normiert ohnehin ueber die Summe). Summen-Normierung waere
          // nicht idempotent (Ganzzahl-Rundung verschiebt die Summe).
          const mx = Math.max(1e-9, ...w.map((x) => Math.max(0, x)));
          return { ...cc, w: w.map((x) => quantizeWeight(Math.max(0, x) / mx)) };
        }),
      };
    }
    m.version = 2;
  }
  if (ver < 3) {
    // Fraktions-Namensdrift (Kanon 2026-07-03, Code6-NAMENS-DRIFT): alte
    // Karten schrieben "klarheit"/"generik" in Objekt-Feldern (spawns[].faction,
    // buildings[].faction). Ab v3 heissen sie "hellmuth"/"moderat". Vorwaerts-
    // kompatibel migrieren: JEDES Vorkommen dieser beiden Werte an den bekannten
    // Feld-Standorten wird umgeschrieben; unbekannte Felder passieren unveraendert.
    const rename = (v: unknown): unknown =>
      v === "klarheit" ? "hellmuth" : v === "generik" ? "moderat" : v;
    const renameList = (key: string): void => {
      const arr = m[key];
      if (!Array.isArray(arr)) return;
      m[key] = arr.map((it) => {
        if (it && typeof it === "object" && "faction" in (it as object)) {
          const obj = it as Record<string, unknown>;
          return { ...obj, faction: rename(obj.faction) };
        }
        return it;
      });
    };
    for (const k of ["spawns", "buildings", "nodes", "fog", "decals"]) renameList(k);
    m.version = 3;
  }
  return m;
}

/**
 * Laedt rohe JSON-Daten und projiziert sie auf die NORMALFORM: migrieren,
 * validieren, klemmen, deduplizieren, sortieren, Gewichte dequantisieren (0..255
 * -> 0..1). Bricht nie hart ab. Dadurch ist loadMap idempotent und der Roundtrip
 * tiefgleich (deepEqual). Vor jedem Speichern/Vergleichen die In-Memory-Karte
 * einmal hierdurch ziehen (normalisieren).
 */
export function loadMap(raw: unknown): MapData {
  const m = migrate(raw);
  const cols = clampInt(m.cols, 1, 512, GRID_COLS);
  const rows = clampInt(m.rows, 1, 512, GRID_ROWS);
  const groundTypes =
    Array.isArray(m.groundTypes) && m.groundTypes.length ? (m.groundTypes as unknown[]).map(String) : [...DEFAULT_GROUND_TYPES];
  const nSorts = groundTypes.length;

  // Terrain: dedupen (letzter gewinnt), OOB verwerfen, w auf nSorts zuschneiden/
  // auffuellen, von Ganzzahl 0..255 nach Float 0..1.
  const terr = (m.terrain ?? {}) as { default?: number; cells?: unknown[] };
  const cellMap = new Map<string, number[]>();
  for (const raw2 of Array.isArray(terr.cells) ? terr.cells : []) {
    const cell = raw2 as { c?: number; r?: number; w?: number[] };
    const c = ri(cell.c);
    const r = ri(cell.r);
    if (!inGrid(c, r, cols, rows)) continue;
    const w: number[] = [];
    for (let k = 0; k < nSorts; k++) w.push(dequant(cell.w?.[k]));
    cellMap.set(`${r},${c}`, w);
  }
  const cells = [...cellMap.entries()]
    .map(([key, w]) => {
      const [r, c] = key.split(",").map(Number);
      return { c, r, w };
    })
    .sort(byRC);

  const water = dedupeRC(arr(m.water), cols, rows).sort(byRC);
  const collision = dedupeKind(arr(m.collision), cols, rows).sort(byRC);

  const doodads = arr(m.doodads)
    .map((d) => normDoodad(d as Partial<MapDoodad>))
    .sort((a, b) => a.col - b.col || a.row - b.row || a.type.localeCompare(b.type));
  const decals = arr(m.decals)
    .map((d) => normDecal(d as Partial<MapDecal>))
    .sort((a, b) => a.row - b.row || a.col - b.col || a.set.localeCompare(b.set));
  // Buildings: normalisieren + ungueltige Fraktion droppen + OOB-Anker droppen +
  // total-ordnen (col,row,type,faction -- faction als Tie-Break, sonst nicht total).
  // OOB-Klemme an dieser Stelle, weil normBuilding cols/rows nicht kennt; analog
  // zu water/collision/terrain cells, die im Loader OOB filtern.
  const buildings = arr(m.buildings)
    .map((b) => normBuilding(b as Partial<MapBuilding>))
    .filter((b): b is MapBuilding => b !== null && b.col >= 0 && b.row >= 0 && b.col < cols && b.row < rows)
    .sort((a, b) => a.col - b.col || a.row - b.row || a.type.localeCompare(b.type) || a.faction.localeCompare(b.faction));
  const nodes = arr(m.nodes)
    .map((n) => normNode(n as Partial<MapNode>))
    .sort((a, b) => a.row - b.row || a.col - b.col || a.type.localeCompare(b.type));
  const spawns = arr(m.spawns)
    .map((s) => normSpawn(s as Partial<MapSpawn>))
    .sort((a, b) => a.player - b.player || a.col - b.col || a.row - b.row);
  const fog = arr(m.fog).map((f) => normFog(f as Partial<MapFog>));

  // meta + unbekannte kuenftige Top-Level-Keys durchreichen (verlustfrei).
  const meta: Record<string, unknown> = typeof m.meta === "object" && m.meta ? { ...(m.meta as object) } : {};
  const unknown: Record<string, unknown> = {};
  for (const k of Object.keys(m)) if (!KNOWN_KEYS.has(k)) unknown[k] = m[k];
  if (Object.keys(unknown).length) meta.__unknown = unknown;

  return {
    version: MAP_FORMAT_VERSION,
    name: typeof m.name === "string" ? m.name : "Unbenannte Karte",
    cols,
    rows,
    groundTypes,
    terrain: { default: clampInt(terr.default, 0, Math.max(0, nSorts - 1), 0), cells },
    water,
    doodads,
    decals,
    buildings,
    nodes,
    spawns,
    fog,
    collision,
    meta: Object.keys(meta).length ? meta : undefined,
  };
}

// --- Kanonische Serialisierung (bit-identischer, tiefgleicher Roundtrip) ----
// RFC-8785-Prinzip (JCS): rekursiver Schluessel-Sort, deterministische Listen.
// Gewichte als Ganzzahl 0..255. Pretty (2 Indent) fuer git-freundliche Diffs --
// die Byte-Gleichheit haengt nur an der stabilen Struktur, nicht am Whitespace.

/** Serialisiert eine Karte deterministisch und versionierbar. */
export function saveMap(map: MapData): string {
  const cells = map.terrain.cells
    .map((c) => {
      // Max-Normierung (idempotent, verhaeltniserhaltend) -> Ganzzahl 0..255.
      const mx = Math.max(1e-9, ...c.w.map((x) => Math.max(0, x)));
      const w = c.w.map((x) => quantizeWeight(Math.max(0, x) / mx));
      return { c: ri(c.c), r: ri(c.r), w };
    })
    .sort(byRC);
  const obj = {
    version: MAP_FORMAT_VERSION,
    name: map.name,
    cols: ri(map.cols),
    rows: ri(map.rows),
    groundTypes: [...map.groundTypes], // NICHT sortieren -- Reihenfolge = w-Index
    terrain: { default: ri(map.terrain.default), cells },
    water: map.water.map((w) => ({ c: ri(w.c), r: ri(w.r) })).sort(byRC),
    collision: map.collision.map((c) => ({ c: ri(c.c), r: ri(c.r), kind: c.kind })).sort(byRC),
    doodads: map.doodads
      .map((d) => ({ type: d.type, col: r3(d.col), row: r3(d.row), variant: ri(d.variant ?? 0), mirror: !!d.mirror, scale: r3(d.scale ?? 1), rotation: r3(d.rotation ?? 0), seed: ri(d.seed ?? 0) }))
      .sort((a, b) => a.col - b.col || a.row - b.row || a.type.localeCompare(b.type)),
    decals: map.decals
      .map((d) => ({ set: d.set, col: r3(d.col), row: r3(d.row), variant: ri(d.variant), rot: r3(d.rot), scale: r3(d.scale), alpha: r3(d.alpha), mirror: !!d.mirror }))
      .sort((a, b) => a.row - b.row || a.col - b.col || a.set.localeCompare(b.set)),
    buildings: map.buildings
      .map((b) => ({ type: b.type, col: ri(b.col), row: ri(b.row), faction: b.faction }))
      .sort((a, b) => a.col - b.col || a.row - b.row || a.type.localeCompare(b.type) || a.faction.localeCompare(b.faction)),
    nodes: map.nodes
      .map((n) => ({ type: n.type, col: ri(n.col), row: ri(n.row), owner: n.owner ?? null }))
      .sort((a, b) => a.row - b.row || a.col - b.col || a.type.localeCompare(b.type)),
    spawns: map.spawns
      .map((s) => ({ player: ri(s.player), col: ri(s.col), row: ri(s.row), faction: s.faction ?? null }))
      .sort((a, b) => a.player - b.player || a.col - b.col || a.row - b.row),
    fog: map.fog.map((f) => ({ col: r3(f.col), row: r3(f.row), radius: r3(f.radius), density: r3(f.density) })),
    meta: map.meta ?? {},
  };
  return JSON.stringify(sortKeysDeep(obj), null, 2) + "\n";
}

/** Alias: der Editor ruft historisch serializeMap. */
export const serializeMap = saveMap;

/** Rekursiver Schluessel-Sort (Arrays behalten ihre Reihenfolge). */
function sortKeysDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeysDeep);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) out[k] = sortKeysDeep((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}

// --- Helfer ------------------------------------------------------------------

function asNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
function r3(v: unknown): number {
  return Math.round(asNum(v) * 1000) / 1000;
}
function ri(v: unknown): number {
  return Math.round(asNum(v));
}
function dequant(v: unknown): number {
  return Math.min(WEIGHT_SCALE, Math.max(0, Math.round(asNum(v)))) / WEIGHT_SCALE;
}
function clampInt(v: unknown, lo: number, hi: number, def: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : def;
  return Math.min(hi, Math.max(lo, n));
}
function inGrid(c: number, r: number, cols: number, rows: number): boolean {
  return c >= 0 && r >= 0 && c < cols && r < rows;
}
function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}
function byRC(a: { c: number; r: number }, b: { c: number; r: number }): number {
  return a.r - b.r || a.c - b.c;
}
function dedupeRC(list: { c?: number; r?: number }[], cols: number, rows: number): { c: number; r: number }[] {
  const map = new Map<string, { c: number; r: number }>();
  for (const it of list) {
    const c = ri(it.c);
    const r = ri(it.r);
    if (inGrid(c, r, cols, rows)) map.set(`${r},${c}`, { c, r });
  }
  return [...map.values()];
}
function dedupeKind(list: { c?: number; r?: number; kind?: string }[], cols: number, rows: number): { c: number; r: number; kind: CellKind }[] {
  const map = new Map<string, { c: number; r: number; kind: CellKind }>();
  for (const it of list) {
    const c = ri(it.c);
    const r = ri(it.r);
    if (!inGrid(c, r, cols, rows)) continue;
    const kind = (CELL_KINDS.has(it.kind ?? "") ? it.kind : "blocked") as CellKind;
    map.set(`${r},${c}`, { c, r, kind });
  }
  return [...map.values()];
}
function normDoodad(d: Partial<MapDoodad>): MapDoodad {
  return {
    type: String(d.type ?? "unknown"),
    col: r3(d.col),
    row: r3(d.row),
    variant: ri(d.variant ?? 0),
    mirror: !!d.mirror,
    scale: r3(d.scale ?? 1),
    rotation: r3(d.rotation ?? 0),
    seed: ri(d.seed ?? 0),
  };
}
function normDecal(d: Partial<MapDecal>): MapDecal {
  return {
    set: String(d.set ?? "moos"),
    col: r3(d.col),
    row: r3(d.row),
    variant: ri(d.variant ?? 0),
    rot: r3(d.rot),
    scale: r3(d.scale ?? 1),
    alpha: r3(d.alpha ?? 1),
    mirror: !!d.mirror,
  };
}
function normBuilding(b: Partial<MapBuilding>): MapBuilding | null {
  // Faction MUSS exakt 'hellmuth' oder 'moderat' sein -- alles andere droppt den
  // Eintrag (analog OOB-Zellen). KEIN stilles Coercieren mehr: die TS-Wahrheit
  // (faction: "hellmuth"|"moderat") darf nicht von den Daten ent-koppelt sein.
  if (b.faction !== "hellmuth" && b.faction !== "moderat") return null;
  return {
    type: String(b.type ?? "unknown"),
    col: ri(b.col),
    row: ri(b.row),
    faction: b.faction,
  };
}

function normNode(n: Partial<MapNode>): MapNode {
  const node: MapNode = { type: String(n.type ?? "hain"), col: ri(n.col), row: ri(n.row) };
  if (n.owner) node.owner = n.owner;
  return node;
}
function normSpawn(s: Partial<MapSpawn>): MapSpawn {
  const spawn: MapSpawn = { player: ri(s.player), col: ri(s.col), row: ri(s.row) };
  if (s.faction) spawn.faction = s.faction;
  return spawn;
}
function normFog(f: Partial<MapFog>): MapFog {
  return { col: r3(f.col), row: r3(f.row), radius: r3(f.radius), density: r3(f.density) };
}
