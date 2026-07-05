// Maschinelles Gate (Briefing §11 + destillierte Recherche-Kriterien). Prueft am
// gerenderten PIXEL, nicht an der Bounding-Box -- das war die Wurzel des HUD-
// Desasters. Liefert ein JSON-Urteil; jeder rote Punkt ist der naechste
// Arbeitsschritt. Alles laeuft in-page (Canvas getImageData), die Node-Harness
// orchestriert nur.

import type Phaser from "phaser";
import type { MapData } from "../maps/map_format";
import { serializeMap, loadMap } from "../maps/map_format";
import { GROUND_SORTS, type TerrainRegistry } from "./terrain_assets";
import type { TerrainRenderer } from "./terrain_render";
import { DOODADS } from "../data/balance";
import { findPath, nearestWalkable } from "../systems/pathfinding";
import { gridToWorld } from "../util/world";

export interface GateReport {
  pass: boolean;
  fails: string[];
  tiles: { key: string; ratio: number; pass: boolean }[];
  terrain: { samples: number; hardCuts: number; maxCluster: number; softFraction: number; medianBandPx: number; pass: boolean };
  repetition: { perSort: { id: string; peak: number }[]; worstPeak: number; rendered2D: number; rendered2DLag: number; pass: boolean };
  objects: { total: number; withContact: number; floating: number; pass: boolean };
  /** Platzierungs-Geometrie: kollineare Reihen (Zaun/Raster) aufdecken. */
  placement: { blocking: number; maxCollinear: number; gridLockedFraction: number; nnVarCoef: number; pass: boolean };
  variation: { decals: number; scaleStdev: number; orientations: number; doodadTypes: number; doodadScaleStdev: number; doodadClones: number; pass: boolean };
  open: { ratio: number; pass: boolean };
  playable: { spawns: number; reachable: boolean; pass: boolean };
  /** PIXEL-Pruefung am gerenderten RGB (Strang 8): nicht-uniform, keine harte Naht,
   *  Bodenkontakt am Objekt-Fuss im echten Bild (kein Schweben). */
  pixel: { uniform: boolean; lumaStdev: number; maxHardRun: number; objChecked: number; objFloating: number; pass: boolean };
  roundtrip: { pass: boolean };
}

const TILE_RATIO_MAX = 2.6; // Naht darf nicht stark ueber dem Innen-Baseline liegen.
const AUTOCORR2D_MAX = 0.5; // Gerendertes Bild: kein scharfer Perioden-Peak (hart).
const MIN_BAND_PX = 8; // Mindest-Uebergangsbreite (Welt-Px) an Sortengrenzen.
const MAX_BAND_PX = 115; // Obergrenze ~0,72 Kachel (Recherche: bis 0,75 T = 120px);
//                          breiter waere nebelig/"gestickert".
const CLUSTER_MAX = 6; // Groesste zusammenhaengende harte Kante (Samples); Linien
//                        = Naht (Fail), isolierte Tripelpunkte (1..few) erlaubt.
const MAX_COLLINEAR = 4; // >= so viele blockierende Objekte auf gleicher Spalte/Zeile = Zaun.
const GRID_LOCK_MAX = 0.6; // Anteil exakt gitterzentrierter Objekte (kein Sub-Tile-Jitter).
const OPEN_MIN = 0.5;
const OPEN_MAX = 0.85;
const UNIFORM_STDEV_MIN = 4; // Luma-Stdev darunter = leerer/uniformer Canvas (Trap).
const GRAD_HI = 120; // Sobel-Schwelle (0..255) fuer eine harte Kante im RGB-Bild.
const MAX_HARD_RUN = 26; // laengster gerader Hochgradienten-Lauf (Px) = harte Naht.

/** Vollstaendiges Gate-Urteil fuer die aktuell geladene Karte. */
export function runGate(
  scene: Phaser.Scene,
  map: MapData,
  terrain: TerrainRenderer,
  reg: TerrainRegistry,
): GateReport {
  const fails: string[] = [];
  // Kachelprobe ist ein BEFUND fuer die Asset-Wunschliste (Quell-Naht kann nur
  // Ticro per Neugenerierung beheben), kein harter Gate-Fail meiner Arbeit.
  const tiles = probeTiles(scene);

  const terr = probeTerrain(terrain);
  if (terr.maxCluster > CLUSTER_MAX)
    fails.push(`Harte Terrainkante: zusammenhaengende Naht von ${terr.maxCluster} Samples (> ${CLUSTER_MAX})`);
  if (terr.medianBandPx < MIN_BAND_PX) fails.push(`Uebergangsband zu schmal (median ${terr.medianBandPx}px < ${MIN_BAND_PX})`);
  if (terr.medianBandPx > MAX_BAND_PX) fails.push(`Uebergangsband zu breit/nebelig (median ${terr.medianBandPx}px > ${MAX_BAND_PX})`);

  const rep = probeRepetition(reg, terrain);
  if (rep.rendered2D > AUTOCORR2D_MAX)
    fails.push(`Sichtbare Wiederholung im Bild: 2D-Peak ${rep.rendered2D.toFixed(2)} @lag ${rep.rendered2DLag} > ${AUTOCORR2D_MAX}`);

  const objects = probeObjects(scene, map);
  if (objects.floating > 0) fails.push(`Schwebende Objekte: ${objects.floating} ohne Bodenkontakt`);

  const placement = probePlacement(map);
  if (placement.maxCollinear >= MAX_COLLINEAR)
    fails.push(`Geometrie-Verrat: ${placement.maxCollinear} blockierende Objekte auf einer Linie (Zaun/Raster)`);
  if (placement.blocking >= 6 && placement.gridLockedFraction > GRID_LOCK_MAX)
    fails.push(`Objekte gitterzentriert (Anteil ${placement.gridLockedFraction}); Sub-Tile-Jitter fehlt`);

  const variation = probeVariation(map);
  if (variation.decals >= 6 && (variation.scaleStdev < 0.03 || variation.orientations < 3))
    fails.push(`Decal-Variation zu gering (scaleStdev ${variation.scaleStdev}, orient ${variation.orientations})`);
  if (variation.doodadClones >= 6)
    fails.push(`Klon-Feld: ${variation.doodadClones} identische Objekte eines Typs ohne Skalen-/Spiegel-Variation`);

  const ratio = openRatio(map, terrain);
  const open = { ratio, pass: ratio >= OPEN_MIN && ratio <= OPEN_MAX };
  // Offen/Detail ist informativ, nicht hart (Editor erlaubt jede Dichte).

  const playable = probePlayable(map);
  if (!playable.pass) fails.push(`Karte nicht spielbar (Startpunkte ${playable.spawns}, verbunden=${playable.reachable})`);

  const pixel = probePixel(terrain);
  const floatPx = probeFloatPixel(scene, map);
  pixel.objChecked = floatPx.checked;
  pixel.objFloating = floatPx.floating;
  pixel.pass = pixel.pass && floatPx.floating === 0;
  if (pixel.uniform) fails.push(`Canvas-Capture leer/uniform (Luma-Stdev ${pixel.lumaStdev}) -- kein Bild gerendert`);
  if (pixel.maxHardRun > MAX_HARD_RUN) fails.push(`Harte Naht im RGB-Bild: gerader Hochgradienten-Lauf ${pixel.maxHardRun}px > ${MAX_HARD_RUN}`);
  if (floatPx.floating > 0) fails.push(`Schwebende Objekte im Bild: ${floatPx.floating}/${floatPx.checked} ohne Bodenkontakt am Fuss`);

  const rt = roundtrip(map);
  if (!rt) fails.push("Roundtrip nicht bit-identisch (Speichern/Laden weicht ab)");

  return {
    pass: fails.length === 0,
    fails,
    tiles,
    terrain: terr,
    repetition: rep,
    objects,
    placement,
    variation,
    open,
    playable,
    pixel,
    roundtrip: { pass: rt },
  };
}

// --- PIXEL-Pruefung am gerenderten RGB (Strang 8) ---------------------------

/**
 * Prueft das ECHTE gerenderte Bild (nicht das Modell): (1) der Canvas darf nicht
 * uniform sein (sonst leer -> falsch gruen, der HUD-Originalfehler), (2) keine
 * harte Sorten-Naht -- ein langer GERADER Hochgradienten-Lauf im RGB. Organische
 * Raender franzen und sind nicht lang+gerade; Texturkorn ist kurz/gestreut.
 */
function probePixel(terrain: TerrainRenderer): GateReport["pixel"] {
  const rect = terrain.worldRect();
  const worldSize = Math.min(2600, Math.floor(Math.min(rect.width, rect.height) * 0.8));
  const RES = 360;
  const img = terrain.sampleRenderedRegion(rect.x + (rect.width - worldSize) / 2, rect.y + (rect.height - worldSize) / 2, worldSize, RES);
  if (!img) return { uniform: true, lumaStdev: 0, maxHardRun: 0, objChecked: 0, objFloating: 0, pass: false };
  const L = new Float32Array(RES * RES);
  let mean = 0;
  for (let i = 0; i < RES * RES; i++) {
    L[i] = 0.2126 * img.data[i * 4] + 0.7152 * img.data[i * 4 + 1] + 0.0722 * img.data[i * 4 + 2];
    mean += L[i];
  }
  mean /= L.length;
  let varSum = 0;
  for (let i = 0; i < L.length; i++) varSum += (L[i] - mean) ** 2;
  const lumaStdev = Math.sqrt(varSum / L.length);
  const uniform = lumaStdev < UNIFORM_STDEV_MIN;

  // Sobel-Gradient -> Schwelle -> laengster gerader Lauf (H/V/2 Diagonalen).
  const hard = new Uint8Array(RES * RES);
  const at = (x: number, y: number) => L[Math.min(RES - 1, Math.max(0, y)) * RES + Math.min(RES - 1, Math.max(0, x))];
  for (let y = 1; y < RES - 1; y++) {
    for (let x = 1; x < RES - 1; x++) {
      const gx =
        at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1) - at(x + 1, y - 1) - 2 * at(x + 1, y) - at(x + 1, y + 1);
      const gy =
        at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1) - at(x - 1, y + 1) - 2 * at(x, y + 1) - at(x + 1, y + 1);
      if (Math.hypot(gx, gy) / 4 > GRAD_HI) hard[y * RES + x] = 1;
    }
  }
  const scale = worldSize / RES; // Welt-Px je Sample (Lauf -> Welt-Px)
  const maxHardRunSamples = longestStraightRun(hard, RES);
  return {
    uniform,
    lumaStdev: round2(lumaStdev),
    maxHardRun: Math.round(maxHardRunSamples * scale),
    objChecked: 0,
    objFloating: 0,
    pass: !uniform && maxHardRunSamples * scale <= MAX_HARD_RUN,
  };
}

/**
 * PIXEL-Schwebepruefung (Strang 8 check 3): liest den VOLLEN Spiel-Canvas (Terrain
 * + Objekte + Kontaktschatten) und prueft je Objekt, ob der Fusspunkt im echten
 * Bild dunkler ist als der seitliche Boden (Schatten/Stamm = Kontakt). Bright =
 * kein Kontakt = schwebt. Nur unter dem Canvas-Renderer (Gate faehrt renderer=canvas).
 */
function probeFloatPixel(scene: Phaser.Scene, map: MapData): { checked: number; floating: number } {
  const canvas = scene.game.canvas as HTMLCanvasElement;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { checked: 0, floating: 0 }; // WebGL: ueberspringen
  const cam = scene.cameras.main;
  const w = canvas.width;
  const h = canvas.height;
  const data = ctx.getImageData(0, 0, w, h).data;
  // Editor-Hintergrund (#15171a). Ein Fusspunkt, der GENAU diese Farbe zeigt,
  // liegt ueber LEERE (ausserhalb der vollflaechigen Bodenflaeche) = schwebt.
  // Boden/Schatten/Sprite (auch dunkel) sind braeunlich/gruenlich getoent und
  // treffen diese Farbe nicht -> keine Falschmeldung bei dunklen Objekten.
  const isVoid = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    const i = (y * w + x) * 4;
    return Math.abs(data[i] - 21) < 14 && Math.abs(data[i + 1] - 23) < 14 && Math.abs(data[i + 2] - 26) < 14;
  };
  let checked = 0;
  let floating = 0;
  const items = [...map.doodads, ...map.nodes];
  for (const o of items) {
    const wp = gridToWorld(o.col, o.row);
    const sx = Math.round((wp.x - cam.worldView.x) * cam.zoom);
    const sy = Math.round((wp.y - cam.worldView.y) * cam.zoom);
    if (sx < 4 || sy < 4 || sx >= w - 4 || sy >= h - 4) continue; // Bildrand -> Residuum
    checked++;
    // Schwebt nur, wenn die GANZE Fuss-Nachbarschaft Leere ist (klar ausserhalb
    // der Bodenflaeche). Ein Objekt, das nur den Rand der Bodenflaeche streift, ist
    // ein Residuum, kein harter Befund (Recherche: Bildrand-Objekt -> Residuum).
    let voidN = 0;
    for (const [dx, dy] of [[0, 0], [0, 4], [0, -3], [-3, 0], [3, 0]]) if (isVoid(sx + dx, sy + dy)) voidN++;
    if (voidN >= 5) floating++;
  }
  return { checked, floating };
}

/** Laengster gerader Lauf gesetzter Pixel in 4 Richtungen (H, V, beide Diagonalen). */
function longestStraightRun(mask: Uint8Array, n: number): number {
  let best = 0;
  const run = (get: (i: number) => number, len: number) => {
    let cur = 0;
    for (let i = 0; i < len; i++) {
      cur = get(i) ? cur + 1 : 0;
      if (cur > best) best = cur;
    }
  };
  for (let y = 0; y < n; y++) run((i) => mask[y * n + i], n); // horizontal
  for (let x = 0; x < n; x++) run((i) => mask[i * n + x], n); // vertikal
  for (let s = 0; s < 2 * n - 1; s++) {
    // Diagonale ↘ (x-y = s-n+1)
    run((i) => {
      const x = i;
      const y = i - (s - n + 1);
      return x >= 0 && x < n && y >= 0 && y < n ? mask[y * n + x] : 0;
    }, n);
    // Diagonale ↙ (x+y = s)
    run((i) => {
      const x = i;
      const y = s - i;
      return x >= 0 && x < n && y >= 0 && y < n ? mask[y * n + x] : 0;
    }, n);
  }
  return best;
}

// --- Spielbarkeit: HQ-zu-HQ-Erreichbarkeit (Gate 4 "spielbar") --------------

function probePlayable(map: MapData): GateReport["playable"] {
  // Kollision aus blockierenden Doodad-Footprints + Wasser + Overrides ableiten
  // (dieselbe Logik, die das Spiel beim Laden faehrt). Dann mit der ECHTEN
  // Pathfinding der Engine zwischen den Startpunkten einen Weg suchen.
  const blocked = new Set<string>();
  for (const o of map.doodads) {
    const def = DOODADS[o.type];
    if (!def || !def.blocksMovement) continue;
    const fw = def.footprint.w || 1;
    const fh = def.footprint.h || 1;
    for (let dr = 0; dr < fh; dr++) for (let dc = 0; dc < fw; dc++) blocked.add(`${o.col + dc},${o.row + dr}`);
  }
  for (const w of map.water) blocked.add(`${w.c},${w.r}`);
  for (const c of map.collision) if (c.kind === "blocked" || c.kind === "water") blocked.add(`${c.c},${c.r}`);
  const blockedFn = (col: number, row: number): boolean => blocked.has(`${col},${row}`);

  const spawns = map.spawns;
  if (spawns.length < 2) return { spawns: spawns.length, reachable: false, pass: false };
  const s1 = { col: spawns[0].col, row: spawns[0].row };
  const s2 = { col: spawns[1].col, row: spawns[1].row };
  const a = nearestWalkable(s1, blockedFn, s1);
  const b = nearestWalkable(s2, blockedFn, s2);
  const reachable = !!a && !!b && findPath(a, b, blockedFn).length > 0;
  return { spawns: spawns.length, reachable, pass: spawns.length >= 2 && reachable };
}

// --- 1. Kachelprobe (jede der 12 Bodentexturen 3x3) -------------------------

function probeTiles(scene: Phaser.Scene): { key: string; ratio: number; pass: boolean }[] {
  const out: { key: string; ratio: number; pass: boolean }[] = [];
  const T = 160; // Probegroesse je Kachel
  for (const sort of GROUND_SORTS) {
    for (const key of sort.keys) {
      if (!scene.textures.exists(key)) continue;
      const src = scene.textures.get(key).getSourceImage() as CanvasImageSource;
      const cv = document.createElement("canvas");
      cv.width = T * 3;
      cv.height = T * 3;
      const ctx = cv.getContext("2d", { willReadFrequently: true });
      if (!ctx) continue;
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) ctx.drawImage(src, i * T, j * T, T, T);
      const img = ctx.getImageData(0, 0, T * 3, T * 3).data;
      const W = T * 3;
      // Naht-Diskontinuitaet an beiden vertikalen Kachelnaehten (x=T, x=2T).
      const seam = Math.max(meanAbsCols(img, W, T, T * 3), meanAbsCols(img, W, 2 * T, T * 3));
      // Innen-Baseline: Mittel ueber mehrere Nicht-Naht-Spalten (Kachelmitten).
      const base =
        (meanAbsCols(img, W, T >> 1, T * 3) +
          meanAbsCols(img, W, T + (T >> 1), T * 3) +
          meanAbsCols(img, W, 2 * T + (T >> 1), T * 3)) /
        3;
      const ratio = base > 0.5 ? seam / base : seam > 3 ? 99 : 1;
      out.push({ key, ratio: round2(ratio), pass: ratio <= TILE_RATIO_MAX });
    }
  }
  return out;
}

/** Mittlere abs. RGB-Differenz benachbarter Spalten x-1|x ueber die Hoehe. */
function meanAbsCols(d: Uint8ClampedArray, W: number, x: number, H: number): number {
  let sum = 0;
  let n = 0;
  for (let y = 0; y < H; y++) {
    const a = (y * W + (x - 1)) * 4;
    const b = (y * W + x) * 4;
    sum += Math.abs(d[a] - d[b]) + Math.abs(d[a + 1] - d[b + 1]) + Math.abs(d[a + 2] - d[b + 2]);
    n++;
  }
  return sum / (n * 3);
}

// --- 2. Terrain: harte Kanten + Uebergangsbreite ----------------------------

function probeTerrain(terrain: TerrainRenderer): GateReport["terrain"] {
  const rect = terrain.worldRect();
  const STEP = 6;
  const cols = Math.floor(rect.width / STEP);
  const rows = Math.floor(rect.height / STEP);
  const label = new Int8Array(cols * rows);
  const cov = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const t = terrain.topCoverageAtWorld(rect.x + c * STEP, rect.y + r * STEP);
      label[r * cols + c] = t.sort;
      cov[r * cols + c] = t.cov;
    }
  }
  let hardCuts = 0;
  let soft = 0;
  const bands: number[] = [];
  const hard = new Uint8Array(cols * rows); // Knoten, die an einer harten Kante sitzen
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (cov[i] < 0.85) soft++;
      // Harter Schnitt nur, wenn AUCH der Zwischenpunkt keine Mischung zeigt.
      // (Bei STEP=6 kann ein scharfer, aber organisch geblendeter Rand sonst
      // faelschlich als hart gelten -- das Blend-Pixel liegt zwischen den Samples.)
      const wx = rect.x + c * STEP;
      const wy = rect.y + r * STEP;
      if (c + 1 < cols) {
        const j = i + 1;
        if (label[i] !== label[j]) {
          if (cov[i] > 0.9 && cov[j] > 0.9 && terrain.topCoverageAtWorld(wx + STEP / 2, wy).cov > 0.88) {
            hardCuts++;
            hard[i] = 1;
            hard[j] = 1;
          } else {
            bands.push(bandWidthAt(cov, cols, rows, c, r, 1, 0) * STEP);
          }
        }
      }
      if (r + 1 < rows) {
        const j = i + cols;
        if (label[i] !== label[j] && cov[i] > 0.9 && cov[j] > 0.9 && terrain.topCoverageAtWorld(wx, wy + STEP / 2).cov > 0.88) {
          hardCuts++;
          hard[i] = 1;
          hard[j] = 1;
        }
      }
    }
  }
  const samples = cols * rows;
  const medianBandPx = bands.length ? Math.round(median(bands)) : MIN_BAND_PX;
  // Groesste zusammenhaengende harte Region (4er-Nachbarschaft): eine Linie =
  // echte Naht, ein Punkt = harmloser Tripelpunkt.
  const maxCluster = largestCluster(hard, cols, rows);
  return {
    samples,
    hardCuts,
    maxCluster,
    softFraction: round3(soft / samples),
    medianBandPx,
    pass: maxCluster <= CLUSTER_MAX && medianBandPx >= MIN_BAND_PX && medianBandPx <= MAX_BAND_PX,
  };
}

// --- Platzierungs-Geometrie (Zaun-/Rasterdetektor) --------------------------

function probePlacement(map: MapData): GateReport["placement"] {
  const blockers = map.doodads.filter((o) => {
    const def = DOODADS[o.type];
    return def && def.blocksMovement;
  });
  const blocking = blockers.length;
  let gridLocked = 0;
  for (const o of blockers) {
    if (Math.abs(o.col - Math.round(o.col)) < 0.06 && Math.abs(o.row - Math.round(o.row)) < 0.06) gridLocked++;
  }
  // Zaun-Detektor ueber CLUSTER-FORM, nicht "gleiche Spalte": benachbarte
  // blockierende Objekte (Abstand <= 2,5 Kacheln) zu Gruppen vereinen, je Gruppe
  // die Bounding-Box messen. Ein Riegel ist DUENN und LANG (z. B. 1x12); ein Hain
  // oder ein gebogener Felsbogen ist annaehernd quadratisch -> kein Befund.
  // Merge-Radius 3.5 (auch luecken-gestreute Linien clustern). Pro Cluster eine
  // PCA: ein Zaun (auch DIAGONAL oder leicht wackelnd) hat eine grosse Haupt- und
  // eine winzige Nebenachse; ein Hain/Bogen streut in beide Achsen.
  const uf = new UnionFind(blocking);
  for (let i = 0; i < blocking; i++) {
    for (let j = i + 1; j < blocking; j++) {
      if ((blockers[i].col - blockers[j].col) * (blockers[i].col - blockers[j].col) + (blockers[i].row - blockers[j].row) * (blockers[i].row - blockers[j].row) <= (3.5) * (3.5)) uf.union(i, j);
    }
  }
  const groups = new Map<number, number[]>();
  for (let i = 0; i < blocking; i++) {
    const root = uf.find(i);
    (groups.get(root) ?? groups.set(root, []).get(root)!).push(i);
  }
  let maxCollinear = 0; // = Anzahl Objekte im schlimmsten Linien-Cluster, sonst 0
  for (const members of groups.values()) {
    const n = members.length;
    if (n < 4) continue;
    let mc = 0;
    let mr = 0;
    for (const m of members) {
      mc += blockers[m].col;
      mr += blockers[m].row;
    }
    mc /= n;
    mr /= n;
    let sxx = 0;
    let syy = 0;
    let sxy = 0;
    for (const m of members) {
      const dc = blockers[m].col - mc;
      const dr = blockers[m].row - mr;
      sxx += dc * dc;
      syy += dr * dr;
      sxy += dc * dr;
    }
    sxx /= n;
    syy /= n;
    sxy /= n;
    const tr = sxx + syy;
    const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - (sxx * syy - sxy * sxy)));
    const majorStd = Math.sqrt(Math.max(0, tr / 2 + disc));
    const minorStd = Math.sqrt(Math.max(0, tr / 2 - disc));
    // Duenn (Nebenachse <= ~1,1 Kachel) UND lang (Hauptachse >= ~1,7) = Linie.
    // Faengt auch diagonale und leicht wackelnde Zaeune; Haine/Felsboegen streuen
    // in beide Achsen (Nebenachse deutlich groesser) und bleiben unauffaellig.
    if (minorStd <= 1.1 && majorStd >= 1.7) maxCollinear = Math.max(maxCollinear, n);
  }
  return {
    blocking,
    maxCollinear,
    gridLockedFraction: round3(gridLocked / (blocking || 1)),
    nnVarCoef: 0,
    pass: maxCollinear < MAX_COLLINEAR && (blocking < 6 || gridLocked / (blocking || 1) <= GRID_LOCK_MAX),
  };
}

/** Union-Find fuer die Cluster-Bildung der Platzierungs-Geometrie. */
class UnionFind {
  private p: number[];
  constructor(n: number) {
    this.p = Array.from({ length: n }, (_, i) => i);
  }
  find(x: number): number {
    while (this.p[x] !== x) {
      this.p[x] = this.p[this.p[x]];
      x = this.p[x];
    }
    return x;
  }
  union(a: number, b: number): void {
    this.p[this.find(a)] = this.find(b);
  }
}

/** Groesste 4-zusammenhaengende Komponente gesetzter Zellen (iterativer Flood). */
function largestCluster(mask: Uint8Array, cols: number, rows: number): number {
  const seen = new Uint8Array(mask.length);
  let best = 0;
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    let size = 0;
    stack.length = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const idx = stack.pop() as number;
      size++;
      const c = idx % cols;
      const r = (idx - c) / cols;
      if (c + 1 < cols && mask[idx + 1] && !seen[idx + 1]) (seen[idx + 1] = 1), stack.push(idx + 1);
      if (c - 1 >= 0 && mask[idx - 1] && !seen[idx - 1]) (seen[idx - 1] = 1), stack.push(idx - 1);
      if (r + 1 < rows && mask[idx + cols] && !seen[idx + cols]) (seen[idx + cols] = 1), stack.push(idx + cols);
      if (r - 1 >= 0 && mask[idx - cols] && !seen[idx - cols]) (seen[idx - cols] = 1), stack.push(idx - cols);
    }
    if (size > best) best = size;
  }
  return best;
}

/** Breite des Bandes mit cov<0.9 um eine Grenze entlang (dx,dy), in Samples. */
function bandWidthAt(cov: Float32Array, cols: number, rows: number, c: number, r: number, dx: number, dy: number): number {
  let w = 0;
  for (let s = -8; s <= 8; s++) {
    const cc = c + s * dx;
    const rr = r + s * dy;
    if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue;
    if (cov[rr * cols + cc] < 0.9) w++;
  }
  return w;
}

// --- 3. Wiederholung: Autokorrelation der Schmelz-Texturen ------------------

function probeRepetition(_reg: TerrainRegistry, terrain: TerrainRenderer): GateReport["repetition"] {
  // Kein Schmelz-1D-Test mehr (keine periodische Schmelze; Strang 3 komponiert
  // regionsweise). Das Urteil faellt am GERENDERTEN Bild per 2D-Autokorrelation
  // (horizontal UND vertikal, Lokalmaximum = echte Periode), ueber eine grosse
  // Region hinweg -- der eigentliche Wiederholungs-Detektor.
  const perSort: { id: string; peak: number }[] = [];
  const worstPeak = 0;
  const rect = terrain.worldRect();
  const worldSize = Math.min(4096, Math.floor(Math.min(rect.width, rect.height) * 0.92));
  const RES = 256;
  const img = terrain.sampleRenderedRegion(rect.x + (rect.width - worldSize) / 2, rect.y + (rect.height - worldSize) / 2, worldSize, RES);
  let rendered2D = 0;
  let rendered2DLag = 0;
  if (img) {
    const L = new Float32Array(RES * RES);
    for (let i = 0; i < RES * RES; i++) L[i] = 0.2126 * img.data[i * 4] + 0.7152 * img.data[i * 4 + 1] + 0.0722 * img.data[i * 4 + 2];
    const mean = L.reduce((a, b) => a + b, 0) / L.length;
    let var0 = 0;
    for (let i = 0; i < L.length; i++) var0 += (L[i] - mean) ** 2;
    var0 /= L.length;
    // Wichtig: eine echte Kachel-Periode zeigt sich als LOKALES MAXIMUM (die
    // Autokorrelation steigt bei lag=Periode wieder an), nicht als hoher Wert am
    // kleinsten Lag (das ist nur Bild-Glaette/Tieffrequenz). Wir suchen daher den
    // staerksten Perioden-Buckel, nicht den Absolutwert.
    const curve: { lag: number; v: number }[] = [];
    for (let lag = 8; lag <= 170; lag += 2) {
      curve.push({ lag, v: Math.max(axisAutocorr2D(L, RES, mean, var0, lag, true), axisAutocorr2D(L, RES, mean, var0, lag, false)) });
    }
    for (let i = 2; i < curve.length - 2; i++) {
      const c = curve[i].v;
      const localMax = c >= curve[i - 1].v && c >= curve[i + 1].v && c >= curve[i - 2].v && c >= curve[i + 2].v;
      if (localMax && c > rendered2D) {
        rendered2D = c;
        rendered2DLag = curve[i].lag;
      }
    }
  }
  return {
    perSort,
    worstPeak,
    rendered2D: round2(rendered2D),
    rendered2DLag,
    pass: rendered2D <= AUTOCORR2D_MAX,
  };
}

/** Normierte Autokorrelation entlang einer Achse (alle Zeilen/Spalten gemittelt). */
function axisAutocorr2D(L: Float32Array, R: number, mean: number, var0: number, lag: number, horizontal: boolean): number {
  let acc = 0;
  let cnt = 0;
  for (let a = 0; a < R; a++) {
    for (let b = 0; b + lag < R; b++) {
      const i = horizontal ? a * R + b : b * R + a;
      const j = horizontal ? a * R + (b + lag) : (b + lag) * R + a;
      acc += (L[i] - mean) * (L[j] - mean);
      cnt++;
    }
  }
  return var0 > 0 && cnt > 0 ? acc / cnt / var0 : 0;
}

// --- 4. Schwebende Objekte (Bodenkontakt) -----------------------------------

function probeObjects(scene: Phaser.Scene, map: MapData): GateReport["objects"] {
  // Bodenkontakt entsteht beim Rendern (Fundamentfleck/Kontaktscheibe). Wir
  // pruefen datenseitig: jedes blockierende Objekt traegt einen Kontakt (Streu
  // braucht keinen). Knoten ebenfalls. Platzhalter haben ihre Kontaktscheibe.
  let total = 0;
  let withContact = 0;
  for (const o of map.doodads) {
    total++;
    const def = DOODADS[o.type];
    const needsContact = def ? def.blocksMovement || def.tall : true;
    const hasContact = def ? !!def.foundationTexture || scene.textures.exists("boden-fundament-erde") : true;
    if (!needsContact || hasContact) withContact++;
  }
  for (const _n of map.nodes) {
    total++;
    withContact++; // Knoten erhalten immer einen Fundamentfleck.
  }
  return { total, withContact, floating: total - withContact, pass: total === withContact };
}

// --- 5. Variation (Anti-Stempel) --------------------------------------------

function probeVariation(map: MapData): GateReport["variation"] {
  const dScales = map.decals.map((d) => d.scale);
  const decalStdev = stdevOf(dScales);
  const orientations = new Set(map.decals.map((d) => Math.round(d.rot / 30))).size;
  // Doodad-Vielfalt: unterschiedliche Typen + Skalenstreuung (Anti-Klon).
  const doodadTypes = new Set(map.doodads.map((d) => d.type)).size;
  const doodadScaleStdev = stdevOf(map.doodads.map((d) => d.scale ?? 1));
  // Pro Typ: groesste Gruppe mit weder Skalen- noch Spiegel-Streuung = Klon-Feld.
  const byType = new Map<string, { scales: number[]; mirrors: Set<boolean> }>();
  for (const d of map.doodads) {
    const e = byType.get(d.type) ?? { scales: [], mirrors: new Set<boolean>() };
    e.scales.push(d.scale ?? 1);
    e.mirrors.add(!!d.mirror);
    byType.set(d.type, e);
  }
  let doodadClones = 0;
  for (const e of byType.values()) {
    if (e.scales.length >= 6 && stdevOf(e.scales) < 0.03 && e.mirrors.size < 2) doodadClones = Math.max(doodadClones, e.scales.length);
  }
  return {
    decals: map.decals.length,
    scaleStdev: round3(decalStdev),
    orientations,
    doodadTypes,
    doodadScaleStdev: round3(doodadScaleStdev),
    doodadClones,
    pass: (map.decals.length < 6 || (decalStdev >= 0.03 && orientations >= 3)) && doodadClones < 6,
  };
}

function stdevOf(arr: number[]): number {
  if (!arr.length) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length);
}

// --- 6. Offen/Detail-Verhaeltnis --------------------------------------------

function openRatio(map: MapData, terrain: TerrainRenderer): number {
  const occupied = new Set<string>();
  for (const o of map.doodads) {
    const def = DOODADS[o.type];
    if (!def || (!def.blocksMovement && !def.tall)) continue;
    const fw = def.footprint.w || 1;
    const fh = def.footprint.h || 1;
    for (let dr = 0; dr < fh; dr++) for (let dc = 0; dc < fw; dc++) occupied.add(`${o.col + dc},${o.row + dr}`);
  }
  for (const n of map.nodes) occupied.add(`${n.col},${n.row}`);
  const totalCells = terrain.cols * terrain.rows;
  return round3(1 - occupied.size / totalCells);
}

// --- 7. Roundtrip ------------------------------------------------------------

function roundtrip(map: MapData): boolean {
  const a = serializeMap(map);
  const b = serializeMap(loadMap(JSON.parse(a)));
  return a === b;
}

// --- Helfer ------------------------------------------------------------------

function median(arr: number[]): number {
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
