// Splat-Terrain-Renderer (Blueprint V3 §2.2). Boden wird NICHT aus sichtbaren
// Einzelkacheln gesetzt, sondern als geschichtete Texturebenen komponiert: eine
// Grundebene (Default-Sorte, vollflaechig) plus je Sorte eine Ebene, die durch
// eine weiche, rausch-verzerrte Deckungsmaske gestanzt wird. Dasselbe System
// nutzt der Editor zum Malen UND das Spiel beim Laden jeder Karte -- ein System,
// nicht zwei.
//
// Technik nach Canvas2D-Painter-Verfahren (kein WebGL-Shader, damit Headless-
// Canvas-Screenshots das echte Bild zeigen):
//   Grundebene vollflaechig -> je Oberebene: Textur fuellen, per 'destination-in'
//   durch die Maske stanzen, per 'source-over' aufstapeln.
// Die Maske wird in Welt-Pixel-Raum verrauscht (nicht im Gitterraum), sonst erbt
// der Rand die Diamant-Anisotropie und das Raster scheint durch.

import Phaser from "phaser";
import { TILE_WIDTH, TILE_HEIGHT, screenToGrid } from "../util/iso";
import { WORLD_ORIGIN_X, WORLD_ORIGIN_Y, gridToWorld } from "../util/world";
import { type MapWorldRect } from "../systems/map_texture";
import { smoothstep, fbm2, warp2, rand2 } from "./noise";
import { GROUND_SORTS, sortById, type TerrainRegistry } from "./terrain_assets";

// Unter dem Platzhalterboden (-100000) liegt nichts; der Splat-Boden ersetzt ihn
// und sitzt knapp darueber, aber unter Fundamenten (-95000) und allem anderen.
export const TERRAIN_LAYER_DEPTH = -99000;

const CHUNK = 512; // Welt-Pixel je Chunk-Kante (Empfehlung Technik-Recherche).
const MASK_RES = 256; // Maske in halber Aufloesung -> 4x weniger Rauschsamples.

// Anti-Wiederholung (Strang 3). Variantenwahl auf JITTERED Regionen (nie aufs
// Tile-Raster getaktet), Region ~3 Kacheln. Makro-Toenung als WELT-Raum-fBm mit
// grosser, inkommensurabler Periode (~30 Kacheln) -> kein Perioden-Peak.
const REGION_PX = 3 * TILE_WIDTH; // Fleck-Skala der Variantenmischung (~3 Kacheln)
const REGION_VARMASK_RES = 96; // Aufloesung der weichen Varianten-Gewichtsmaske je Chunk
const TINT_FREQ = 1 / (30 * TILE_WIDTH); // Makro-Toenung ~30 Kacheln (inkommensurabel)
const TINT_STRENGTH = 0.1; // +/-5% Helligkeitsdrift

// Rauschparameter (Welt-Pixel-Raum). KOORDINATEN-Domain-Warp (nicht Wert-Warp):
// die Sample-Position wird verschoben, der weiche Gewichts-Gradient bleibt
// erhalten -> ueberall begrenzte, organische Uebergangsbreite (kein Slammen ueber
// die Schwelle, das lokal harte Kanten erzeugte). Grosse Lobi ~2,5 Kacheln +
// feine Finger ~0,5 Kacheln.
// Wellenlaengen bewusst lang gegenueber der Auslenkung gewaehlt: amp/wellenlaenge
// < ~0,16 verhindert das "Falten" des Raums (Jacobi < 1) und damit lokal harte
// Kreuzungen -> ueberall begrenzte Uebergangsbreite. Lobi ~6 Kacheln (Recherche
// 3..8), feine Finger ~2 Kacheln.
const TILE_FREQ = 1 / (6 * TILE_WIDTH);
const FINE_FREQ = 1 / (2 * TILE_WIDTH);
// Auslenkung bewusst SUB-Kachel (< 113px Diagonale) und nicht-faltend
// (amp/wellenlaenge < 0,15): sonst springt der Warp ueber scharfe Zell-Grenzen
// des Pinsels und erzeugt scheinbar harte Kanten. Finger bleiben sichtbar.
const WARP_DIST = 0.6 * TILE_WIDTH;
const WARP_FINE = 0.15 * TILE_WIDTH;
// Schmaler gewaehlt (Recherche: 0,25..0,75 Kachel, nicht breiter): definierter,
// nicht nebelig. Die 3x3-Gewichtsglaettung haelt die Kante trotzdem weich genug,
// um harte Schnitte zu vermeiden.
const FEATHER = 0.1;

interface Chunk {
  ci: number;
  cj: number;
  wx: number;
  wy: number;
  w: number;
  h: number;
  canvas: HTMLCanvasElement;
  key: string;
  image?: Phaser.GameObjects.Image;
  dirty: boolean;
}

/**
 * Haelt das Gewichtsfeld (pro Zelle ein Gewicht je Sorte) und rendert es in
 * Boden-Chunks. Das Gitter-Datenmodell bleibt sauber; die weiche Maske bestimmt
 * nur die Erscheinung.
 */
export class TerrainRenderer {
  readonly cols: number;
  readonly rows: number;
  readonly groundTypes: string[];
  readonly nSorts: number;
  readonly defaultIdx: number;
  /** Gewichte: [(row*cols + col) * nSorts + k]. Autoritativ (Export/Roundtrip). */
  private weights: Float32Array;
  /** Geglaettete Kopie (3x3) NUR fuers Sampling -> weiche Deckung trotz harter
   *  Pinsel-Zellgrenzen. Roh-Gewichte bleiben fuer das Speichern exakt. */
  private smooth: Float32Array;
  /** Laufzeit-Wandlungs-Overlay (Strang 2): wird beim Sampling ADDIERT, aber NIE
   *  gespeichert (exportCells liest nur `weights`). Damit 0 MB, mechanik-neutral. */
  private delta: Float32Array;
  private rect: MapWorldRect;
  private chunks: Chunk[] = [];
  /** Je Sorte (groundTypes-Index) die vier Varianten-Patterns (Region-Komposition). */
  private patterns: CanvasPattern[][] = [];
  private scratch: HTMLCanvasElement;
  private varScratch: HTMLCanvasElement;
  private varMaskCv: HTMLCanvasElement;
  private maskCv: HTMLCanvasElement;
  // Cull-Zustand (Throttle): zuletzt gecullte Kameralage.
  private cullX = NaN;
  private cullY = NaN;
  private cullZoom = NaN;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly reg: TerrainRegistry,
    map: { cols: number; rows: number; groundTypes: string[]; terrain: { default: number; cells: { c: number; r: number; w: number[] }[] } },
  ) {
    this.cols = map.cols;
    this.rows = map.rows;
    // Palette = Karten-Sorten + alle fehlenden GROUND_SORTS ANGEHAENGT (Index stabil).
    // Die angehaengten haben ueberall Basisgewicht 0 und werden nur per Laufzeit-delta
    // sichtbar (Fraktions-Zielsorte klarflur) -> die Wandlung faerbt auf JEDER Karte
    // um, auch auf alten 3-Sorten-Karten, ohne sie zu migrieren. Roundtrip bleibt
    // deterministisch (rendereq/roundtrip gruen).
    const pal = map.groundTypes.length ? [...map.groundTypes] : GROUND_SORTS.map((s) => s.id);
    for (const s of GROUND_SORTS) if (!pal.includes(s.id)) pal.push(s.id);
    this.groundTypes = pal;
    this.nSorts = this.groundTypes.length;
    this.defaultIdx = Math.min(Math.max(0, map.terrain.default | 0), this.nSorts - 1);
    this.weights = new Float32Array(this.cols * this.rows * this.nSorts);
    this.smooth = new Float32Array(this.cols * this.rows * this.nSorts);
    this.delta = new Float32Array(this.cols * this.rows * this.nSorts);
    // Welt-Rechteck aus DIESER Kartengroesse (nicht global 36x36) -> beliebig
    // grosse Karten moeglich (Strang 7).
    this.rect = computeRect(this.cols, this.rows);
    this.scratch = this.mkCanvas(CHUNK, CHUNK);
    this.varScratch = this.mkCanvas(CHUNK, CHUNK);
    this.varMaskCv = this.mkCanvas(REGION_VARMASK_RES, REGION_VARMASK_RES);
    this.maskCv = this.mkCanvas(MASK_RES, MASK_RES);
    this.initWeights(map.terrain.cells);
    this.rebuildSmooth();
    this.buildPatterns();
    this.buildChunks();
  }

  private mkCanvas(w: number, h: number): HTMLCanvasElement {
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    return cv;
  }

  /** Default-Gewicht 1 auf den Default-Typ, dann gespeicherte Zellen einlesen. */
  private initWeights(cells: { c: number; r: number; w: number[] }[]): void {
    for (let i = 0; i < this.cols * this.rows; i++) this.weights[i * this.nSorts + this.defaultIdx] = 1;
    for (const cell of cells) {
      if (cell.c < 0 || cell.r < 0 || cell.c >= this.cols || cell.r >= this.rows) continue;
      const base = (cell.r * this.cols + cell.c) * this.nSorts;
      for (let k = 0; k < this.nSorts; k++) this.weights[base + k] = cell.w[k] ?? 0;
    }
  }

  /** Je Sorte vier CanvasPatterns aus deren Quellvarianten (Region-Komposition). */
  private buildPatterns(): void {
    const tmp = this.scratch.getContext("2d");
    if (!tmp) return;
    this.patterns = this.groundTypes.map((id) => {
      const sort = sortById(id) ?? GROUND_SORTS[0];
      const vs = this.reg.variants[sort.id] ?? this.reg.variants[GROUND_SORTS[0].id] ?? [];
      const pats: CanvasPattern[] = [];
      for (const v of vs) {
        const p = tmp.createPattern(v, "repeat");
        if (p) pats.push(p);
      }
      return pats;
    });
  }

  private buildChunks(): void {
    const ncx = Math.ceil(this.rect.width / CHUNK);
    const ncy = Math.ceil(this.rect.height / CHUNK);
    for (let cj = 0; cj < ncy; cj++) {
      for (let ci = 0; ci < ncx; ci++) {
        const wx = this.rect.x + ci * CHUNK;
        const wy = this.rect.y + cj * CHUNK;
        const w = Math.min(CHUNK, this.rect.x + this.rect.width - wx);
        const h = Math.min(CHUNK, this.rect.y + this.rect.height - wy);
        if (w <= 0 || h <= 0) continue;
        // Vollflaechiges Rechteck (wie die Spiel-Bodenflaeche terrainRect): kein
        // gestufter Diamantrand. Ausserhalb des Gitters klemmt das Gewichtsfeld
        // auf die Randsorte (Boden laeuft sauber bis zur Rechteckkante).
        const canvas = this.mkCanvas(w, h);
        const key = `terrain_chunk_${ci}_${cj}`;
        this.chunks.push({ ci, cj, wx, wy, w, h, canvas, key, dirty: true });
      }
    }
  }

  // --- Gewichtszugriff ----------------------------------------------------

  /** Voller Gewichtsvektor einer Zelle (Kopie) -- fuer Undo-Diff/Pipette/Glaetten. */
  getCellWeights(col: number, row: number): number[] {
    const w: number[] = [];
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) {
      for (let k = 0; k < this.nSorts; k++) w.push(k === this.defaultIdx ? 1 : 0);
      return w;
    }
    const base = (row * this.cols + col) * this.nSorts;
    for (let k = 0; k < this.nSorts; k++) w.push(this.weights[base + k]);
    return w;
  }

  /** Schreibt den vollen Gewichtsvektor einer Zelle (Undo/Redo/Glaetten). */
  setCellWeights(col: number, row: number, w: number[]): void {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return;
    const base = (row * this.cols + col) * this.nSorts;
    for (let k = 0; k < this.nSorts; k++) this.weights[base + k] = w[k] ?? 0;
  }

  /** Wandlungs-Overlay einer Zelle setzen (Strang 2; NICHT gespeichert). */
  setTransformAt(col: number, row: number, sortIdx: number, value: number): void {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return;
    this.delta[(row * this.cols + col) * this.nSorts + sortIdx] = value;
  }

  /** Wandlungs-Overlay als MAX schreiben: ueberlappende Quellen derselben Sorte
   *  verstaerken sich nicht (kein Flackern), sie nehmen die staerkste Deckung. */
  maxTransformAt(col: number, row: number, sortIdx: number, value: number): void {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return;
    const i = (row * this.cols + col) * this.nSorts + sortIdx;
    if (value > this.delta[i]) this.delta[i] = value;
  }

  /** Setzt eine Zelle hart auf eine einzelne Sorte (Gewicht 1). */
  setCell(col: number, row: number, sortIdx: number): void {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return;
    const base = (row * this.cols + col) * this.nSorts;
    for (let k = 0; k < this.nSorts; k++) this.weights[base + k] = k === sortIdx ? 1 : 0;
  }

  /** Erhoeht das Gewicht einer Sorte in einer Zelle (Pinsel: Deckkraft `amount`). */
  addWeight(col: number, row: number, sortIdx: number, amount: number): void {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return;
    const base = (row * this.cols + col) * this.nSorts;
    this.weights[base + sortIdx] = Math.min(8, this.weights[base + sortIdx] + amount);
    // Konkurrierende Sorten leicht zuruecknehmen, damit der aktive Typ uebernimmt.
    for (let k = 0; k < this.nSorts; k++) {
      if (k !== sortIdx) this.weights[base + k] = Math.max(0, this.weights[base + k] - amount * 0.5);
    }
  }

  /** Welt-Bounding-Rechteck des gerenderten Bodens. */
  worldRect(): MapWorldRect {
    return this.rect;
  }

  /**
   * Komponiert eine Welt-Region aus den FERTIG gerenderten Chunk-Canvases in ein
   * outRes-Quadrat (inkl. Schmelz, Ton-Jitter, Sortenmix). Fuer das 2D-
   * Wiederholungs-Gate, das am gerenderten Bild misst, nicht an der Schmelze.
   */
  sampleRenderedRegion(wx: number, wy: number, worldSize: number, outRes: number): ImageData | null {
    const cv = this.mkCanvas(outRes, outRes);
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    const scale = outRes / worldSize;
    for (const c of this.chunks) {
      if (c.wx + c.w <= wx || c.wx >= wx + worldSize || c.wy + c.h <= wy || c.wy >= wy + worldSize) continue;
      ctx.drawImage(c.canvas, 0, 0, c.w, c.h, (c.wx - wx) * scale, (c.wy - wy) * scale, c.w * scale, c.h * scale);
    }
    return ctx.getImageData(0, 0, outRes, outRes);
  }

  /** Dominante Sorte einer Zelle (fuer Kollisions-/Lesbarkeitsableitung). */
  dominantSort(col: number, row: number): number {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return this.defaultIdx;
    const base = (row * this.cols + col) * this.nSorts;
    let best = 0;
    let bestV = -1;
    for (let k = 0; k < this.nSorts; k++) {
      if (this.weights[base + k] > bestV) {
        bestV = this.weights[base + k];
        best = k;
      }
    }
    return best;
  }

  /**
   * Glaettet das Gewichtsfeld (3x3-Mittel) in `smooth`. Nur fuers Sampling: macht
   * die Deckung weich, egal wie hart der Pinsel benachbarte Zellen gesetzt hat.
   * Guenstig (cols*rows*nSorts*9) -> bei jeder Neukomposition neu.
   */
  rebuildSmooth(): void {
    const { cols, rows, nSorts } = this;
    // Mitten-gewichtetes 3x3 (Mitte 4, Nachbarn 1): glaettet die steilsten
    // Pinsel-Zellspruenge (verhindert harte Kanten), spreizt die Uebergaenge aber
    // viel weniger als ein gleichgewichteter Kasten -> kein nebeliges Breitband.
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        for (let k = 0; k < nSorts; k++) {
          let sum = 0;
          let wsum = 0;
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              const cc = c + dc;
              const rr = r + dr;
              if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue;
              const wgt = dr === 0 && dc === 0 ? 4 : 1;
              const idx = (rr * cols + cc) * nSorts + k;
              sum += wgt * (this.weights[idx] + this.delta[idx]); // + Wandlungs-Overlay
              wsum += wgt;
            }
          }
          this.smooth[(r * cols + c) * nSorts + k] = sum / wsum;
        }
      }
    }
  }

  /** Debug: geglaetteter Gewichtsvektor (inkl. Delta) + Roh-Delta einer Zelle. */
  debugAt(col: number, row: number): { smooth: number[]; delta: number[] } {
    const base = (row * this.cols + col) * this.nSorts;
    const s: number[] = [];
    const d: number[] = [];
    for (let k = 0; k < this.nSorts; k++) {
      s.push(Math.round(this.smooth[base + k] * 100) / 100);
      d.push(Math.round(this.delta[base + k] * 100) / 100);
    }
    return { smooth: s, delta: d };
  }

  /** Gerenderte dominante Sorte einer Zelle (smooth inkl. Wandlungs-Overlay). */
  sampledDominant(col: number, row: number): number {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return this.defaultIdx;
    const base = (row * this.cols + col) * this.nSorts;
    let best = 0;
    let bestV = -1;
    for (let k = 0; k < this.nSorts; k++) {
      if (this.smooth[base + k] > bestV) {
        bestV = this.smooth[base + k];
        best = k;
      }
    }
    return best;
  }

  /** Bilineares Gewicht einer Sorte an fraktionaler Gitterposition (geglaettet). */
  private sampleWeight(k: number, col: number, row: number): number {
    const c0 = Math.floor(col);
    const r0 = Math.floor(row);
    const fc = col - c0;
    const fr = row - r0;
    const at = (c: number, r: number): number => {
      const cc = Math.min(this.cols - 1, Math.max(0, c));
      const rr = Math.min(this.rows - 1, Math.max(0, r));
      return this.smooth[(rr * this.cols + cc) * this.nSorts + k];
    };
    const top = at(c0, r0) * (1 - fc) + at(c0 + 1, r0) * fc;
    const bot = at(c0, r0 + 1) * (1 - fc) + at(c0 + 1, r0 + 1) * fc;
    return top * (1 - fr) + bot * fr;
  }

  /** Bilineare Summe aller Gewichte (Normierung der Deckung). */
  private sampleTotal(col: number, row: number): number {
    let t = 0;
    for (let k = 0; k < this.nSorts; k++) t += this.sampleWeight(k, col, row);
    return t;
  }

  // --- Komposition --------------------------------------------------------

  /** Erstellt/aktualisiert die Phaser-Bilder aller Chunks (Erstaufbau). */
  build(): void {
    for (const c of this.chunks) {
      this.compositeChunk(c);
      if (!this.scene.textures.exists(c.key)) {
        this.scene.textures.addCanvas(c.key, c.canvas);
      } else {
        this.refreshCanvasTexture(c.key);
      }
      c.image = this.scene.add
        .image(c.wx, c.wy, c.key)
        .setOrigin(0, 0)
        .setDepth(TERRAIN_LAYER_DEPTH);
      c.dirty = false;
    }
  }

  /**
   * worldView-Culling (Strang 7): blendet Chunks aus, die ausserhalb des
   * Kamerabereichs (+ 1 Chunk Marge) liegen. Boden ist achsenparallel -> einfacher
   * Rechteck-Overlap, kein Diamant-Test. Gedrosselt: nur bei >½ Chunk Wanderung
   * oder Zoom-Aenderung. Bei 36x36 sind alle sichtbar (No-op); zahlt sich bei
   * grossen Karten aus.
   */
  updateCull(cam: Phaser.Cameras.Scene2D.Camera): void {
    if (
      Math.abs(cam.scrollX - this.cullX) < CHUNK / 2 &&
      Math.abs(cam.scrollY - this.cullY) < CHUNK / 2 &&
      cam.zoom === this.cullZoom
    ) {
      return;
    }
    this.cullX = cam.scrollX;
    this.cullY = cam.scrollY;
    this.cullZoom = cam.zoom;
    const view = cam.worldView;
    const m = CHUNK; // 1-Chunk-Vorlaufmarge (kein Lueckenflimmern)
    for (const c of this.chunks) {
      if (!c.image) continue;
      const vis = c.wx < view.right + m && c.wx + c.w > view.x - m && c.wy < view.bottom + m && c.wy + c.h > view.y - m;
      c.image.setVisible(vis);
    }
  }

  /** Sichtbare (nicht gecullte) Chunk-Anzahl -- fuer den Perf-Beleg. */
  visibleChunkCount(): number {
    let n = 0;
    for (const c of this.chunks) if (c.image?.visible) n++;
    return n;
  }

  /** Gesamtzahl der Chunks. */
  chunkCount(): number {
    return this.chunks.length;
  }

  /** Markiert alle Chunks dirty, die ein Welt-Rechteck (+ Warp-Marge) schneiden. */
  markDirtyWorldRect(x: number, y: number, w: number, h: number): void {
    const m = TILE_WIDTH; // Warp-Marge: die Maske liest Nachbarzellen.
    for (const c of this.chunks) {
      if (x - m < c.wx + c.w && x + w + m > c.wx && y - m < c.wy + c.h && y + h + m > c.wy) {
        c.dirty = true;
      }
    }
  }

  /** Komponiert alle dirty Chunks neu und laedt ihre Textur neu hoch. */
  recompositeDirty(): number {
    this.rebuildSmooth(); // Gewichte koennten seit letztem Mal gemalt worden sein.
    let n = 0;
    for (const c of this.chunks) {
      if (!c.dirty) continue;
      this.compositeChunk(c);
      this.refreshCanvasTexture(c.key);
      c.dirty = false;
      n++;
    }
    return n;
  }

  private compositeChunk(c: Chunk): void {
    const ctx = c.canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, c.w, c.h);

    // Grundebene: Default-Sorte vollflaechig (nie Loecher).
    this.fillSortVariants(ctx, this.defaultIdx, c);

    // Oberebenen: jede Sorte ausser Default, durch ihre Deckungsmaske gestanzt.
    for (let k = 0; k < this.nSorts; k++) {
      if (k === this.defaultIdx) continue;
      if (!this.chunkHasSort(c, k)) continue;
      this.buildFrayedMask(c, k);
      const sctx = this.scratch.getContext("2d");
      if (!sctx) continue;
      sctx.setTransform(1, 0, 0, 1, 0, 0);
      sctx.globalCompositeOperation = "source-over";
      sctx.clearRect(0, 0, CHUNK, CHUNK);
      this.fillSortVariants(sctx, k, c);
      sctx.globalCompositeOperation = "destination-in";
      sctx.drawImage(this.maskCv, 0, 0, MASK_RES, MASK_RES, 0, 0, c.w, c.h);
      sctx.globalCompositeOperation = "source-over";
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(this.scratch, 0, 0, c.w, c.h, 0, 0, c.w, c.h);
    }

    // Niederfrequenter Ton-Jitter (Welt-Raum, kontinuierlich ueber Chunks):
    // bricht selbst die 2048er-Schmelzperiode tonal auf.
    this.applyToneJitter(ctx, c);
    ctx.globalCompositeOperation = "source-over";
  }

  /**
   * Fuellt eine Sorte aus ihren VIER Varianten regionsweise (Strang 3): Variante 0
   * vollflaechig als Basis, die uebrigen je nach jittered Region-Mitgliedschaft
   * darueber gestanzt. Variantenwahl auf verrauschten ~3-Kachel-Regionen, NIE auf
   * dem Tile-Raster -> keine Tile- und keine Regionsperiode.
   */
  private fillSortVariants(ctx: CanvasRenderingContext2D, k: number, c: Chunk): void {
    const pats = this.patterns[k];
    if (!pats || pats.length === 0) {
      const sort = sortById(this.groundTypes[k]) ?? GROUND_SORTS[0];
      ctx.fillStyle = sort.fallback;
      ctx.fillRect(0, 0, c.w, c.h);
      return;
    }
    const nv = pats.length;
    this.fillVariantPattern(ctx, pats[0], k, 0, c);
    for (let v = 1; v < nv; v++) {
      if (!this.buildVariantMask(c, k, v, nv)) continue;
      const vctx = this.varScratch.getContext("2d");
      if (!vctx) continue;
      vctx.setTransform(1, 0, 0, 1, 0, 0);
      vctx.globalCompositeOperation = "source-over";
      vctx.clearRect(0, 0, CHUNK, CHUNK);
      this.fillVariantPattern(vctx, pats[v], k, v, c);
      vctx.globalCompositeOperation = "destination-in";
      vctx.drawImage(this.varMaskCv, 0, 0, REGION_VARMASK_RES, REGION_VARMASK_RES, 0, 0, c.w, c.h);
      vctx.globalCompositeOperation = "source-over";
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(this.varScratch, 0, 0, c.w, c.h, 0, 0, c.w, c.h);
    }
  }

  /** Fuellt mit einer Varianten-Quelle, welt-kontinuierlich (Phase aus c.wx/wy). */
  private fillVariantPattern(ctx: CanvasRenderingContext2D, pat: CanvasPattern, k: number, v: number, c: Chunk): void {
    // Konstanter Versatz je (Sorte,Variante) dekorreliert die Varianten; die
    // Phase aus dem Welt-Offset haelt eine Variante ueber Chunkgrenzen nahtlos.
    const ox = Math.floor(rand2(k + 1, v + 1, 13) * 1024);
    const oy = Math.floor(rand2(k + 2, v + 3, 29) * 1024);
    const phaseX = ox - (((c.wx % 1024) + 1024) % 1024);
    const phaseY = oy - (((c.wy % 1024) + 1024) % 1024);
    pat.setTransform(new DOMMatrix().translateSelf(phaseX, phaseY));
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, c.w, c.h);
  }

  /**
   * WEICHES Gewicht der Variante v an einem Welt-Punkt (0..1). Zwei nicht-
   * periodische fBm-Felder spannen ein 2x2-Varianten-Raster auf, geschaerft und
   * normiert -> grosse, weiche Flecken je Variante mit fliessenden Raendern (kein
   * rechteckiger Regions-Schnitt) und KEINE Periode (Welt-Raum-fBm statt Kachel).
   */
  private variantMembership(wx: number, wy: number, k: number, v: number, nv: number): number {
    const f = 1 / REGION_PX; // eine Rauscheinheit ~ eine Region (~3 Kacheln)
    const a = fbm2(wx * f, wy * f, 3001 + k * 17, 3);
    const b = fbm2(wx * f + 11.3, wy * f + 7.7, 7001 + k * 17, 3);
    const raw = [(1 - a) * (1 - b), a * (1 - b), (1 - a) * b, a * b];
    let sum = 0;
    for (let i = 0; i < nv; i++) {
      raw[i] = raw[i] * raw[i]; // schaerfen -> je Fleck dominiert eine Variante
      sum += raw[i];
    }
    return sum > 0 ? raw[v] / sum : 0;
  }

  /** Baut die Mitglieds-Maske der Variante v fuer den Chunk; false = nicht vorhanden. */
  private buildVariantMask(c: Chunk, k: number, v: number, nv: number): boolean {
    const ctx = this.varMaskCv.getContext("2d");
    if (!ctx) return false;
    const img = ctx.createImageData(REGION_VARMASK_RES, REGION_VARMASK_RES);
    const d = img.data;
    const sx = c.w / REGION_VARMASK_RES;
    const sy = c.h / REGION_VARMASK_RES;
    let any = false;
    for (let my = 0; my < REGION_VARMASK_RES; my++) {
      for (let mx = 0; mx < REGION_VARMASK_RES; mx++) {
        const a = this.variantMembership(c.wx + (mx + 0.5) * sx, c.wy + (my + 0.5) * sy, k, v, nv);
        d[(my * REGION_VARMASK_RES + mx) * 4 + 3] = a * 255;
        if (a > 0) any = true;
      }
    }
    ctx.putImageData(img, 0, 0);
    return any;
  }

  /** Hat der Chunk ueberhaupt nennenswerte Deckung der Sorte k? (spart Masken). */
  private chunkHasSort(c: Chunk, k: number): boolean {
    // Stichprobe der Eckzellen + Mitte des Chunks.
    const corners = [
      [c.wx, c.wy],
      [c.wx + c.w, c.wy],
      [c.wx, c.wy + c.h],
      [c.wx + c.w, c.wy + c.h],
      [c.wx + c.w / 2, c.wy + c.h / 2],
    ];
    for (const [x, y] of corners) {
      const g = screenToGrid(x - WORLD_ORIGIN_X, y - WORLD_ORIGIN_Y);
      if (this.sampleWeight(k, g.col, g.row) > 0.02) return true;
    }
    // Zusaetzlich ein grobes Innenraster (Deckung kann mitten im Chunk liegen).
    const step = c.w / 4;
    for (let yy = c.wy; yy <= c.wy + c.h; yy += step) {
      for (let xx = c.wx; xx <= c.wx + c.w; xx += step) {
        const g = screenToGrid(xx - WORLD_ORIGIN_X, yy - WORLD_ORIGIN_Y);
        if (this.sampleWeight(k, g.col, g.row) > 0.02) return true;
      }
    }
    return false;
  }

  /**
   * Weiche, rausch-verzerrte Deckung der Sorte k an einem Welt-Punkt (0..1).
   * EINE Quelle fuer Maske UND Gate-Messung -- kein Auseinanderdriften.
   */
  frayedCoverage(wx: number, wy: number, k: number): number {
    // Koordinaten-Warp in zwei Skalen (gross + fein), im Welt-Pixel-Raum
    // ausgewertet (isotrop, nicht gitterausgerichtet). Der verschobene Punkt
    // wird auf das Gitter abgebildet, dort das weiche Gewicht gesampelt.
    const w1 = warp2(wx, wy, 2003 + k * 31, WARP_DIST, TILE_FREQ, 2);
    const w2 = warp2(wx, wy, 5501 + k * 53, WARP_FINE, FINE_FREQ, 2);
    const g = screenToGrid(wx + w1.x + w2.x - WORLD_ORIGIN_X, wy + w1.y + w2.y - WORLD_ORIGIN_Y);
    const total = this.sampleTotal(g.col, g.row);
    const cov = total > 0 ? this.sampleWeight(k, g.col, g.row) / total : 0;
    return smoothstep(0.5 - FEATHER, 0.5 + FEATHER, cov);
  }

  /** Hoechste sichtbare Deckung an einem Welt-Punkt (1 = reine Flaeche, 0,5 = 50/50). */
  topCoverageAtWorld(wx: number, wy: number): { sort: number; cov: number } {
    let maxOther = 0;
    let maxOtherSort = this.defaultIdx;
    for (let k = 0; k < this.nSorts; k++) {
      if (k === this.defaultIdx) continue;
      const cv = this.frayedCoverage(wx, wy, k);
      if (cv > maxOther) {
        maxOther = cv;
        maxOtherSort = k;
      }
    }
    // Default-Ebene ist vollflaechig; ihre sichtbare Deckung = 1 - max(andere).
    return maxOther >= 0.5 ? { sort: maxOtherSort, cov: maxOther } : { sort: this.defaultIdx, cov: 1 - maxOther };
  }

  /** Baut die weiche Deckungsmaske der Sorte k (halbe Aufloesung). */
  private buildFrayedMask(c: Chunk, k: number): void {
    const ctx = this.maskCv.getContext("2d");
    if (!ctx) return;
    const img = ctx.createImageData(MASK_RES, MASK_RES);
    const d = img.data;
    const sx = c.w / MASK_RES;
    const sy = c.h / MASK_RES;
    for (let my = 0; my < MASK_RES; my++) {
      for (let mx = 0; mx < MASK_RES; mx++) {
        const wx = c.wx + (mx + 0.5) * sx;
        const wy = c.wy + (my + 0.5) * sy;
        d[(my * MASK_RES + mx) * 4 + 3] = (this.frayedCoverage(wx, wy, k) * 255) | 0;
      }
    }
    // Leichter Weichzeichner der Alpha-Maske: rundet die steilsten Warp-
    // Kreuzungen, ohne die organische Randform breit zu waschen (Radius 1).
    blurAlpha(d, MASK_RES, MASK_RES, 1);
    ctx.putImageData(img, 0, 0);
  }

  /**
   * Makro-Toenung als WELT-Raum-fBm (nicht-periodisch, ~30 Kacheln, inkommensurabel
   * zu Region/Tile) -> grosse, weiche Helligkeitsdrift ohne eigenen Perioden-Peak.
   * Kantenbuendig gesampelt (mx/(RES-1)) -> ueber Chunkgrenzen stetig, keine Naht.
   */
  private applyToneJitter(ctx: CanvasRenderingContext2D, c: Chunk): void {
    const RES = 48;
    const jc = this.mkCanvas(RES, RES);
    const jx = jc.getContext("2d");
    if (!jx) return;
    const img = jx.createImageData(RES, RES);
    const d = img.data;
    for (let my = 0; my < RES; my++) {
      for (let mx = 0; mx < RES; mx++) {
        const wx = c.wx + (mx / (RES - 1)) * c.w;
        const wy = c.wy + (my / (RES - 1)) * c.h;
        const v = fbm2(wx * TINT_FREQ, wy * TINT_FREQ, 6101, 3);
        const lum = (1 - TINT_STRENGTH + TINT_STRENGTH * v) * 255; // ~0.9..1.0 (nur abdunkeln)
        const i = (my * RES + mx) * 4;
        d[i] = lum;
        d[i + 1] = lum;
        d[i + 2] = lum;
        d[i + 3] = 255;
      }
    }
    jx.putImageData(img, 0, 0);
    ctx.globalCompositeOperation = "multiply";
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(jc, 0, 0, RES, RES, 0, 0, c.w, c.h);
  }

  /** Laedt die CanvasTexture eines Chunks neu hoch (nach Neukomposition). */
  private refreshCanvasTexture(key: string): void {
    if (!this.scene.textures.exists(key)) return;
    const tex = this.scene.textures.get(key) as Phaser.Textures.CanvasTexture;
    if (typeof tex.refresh === "function") tex.refresh();
  }

  /** Gibt alle Chunk-Bilder/Texturen frei (Szenenwechsel). */
  destroy(): void {
    for (const c of this.chunks) {
      c.image?.destroy();
      if (this.scene.textures.exists(c.key)) this.scene.textures.remove(c.key);
    }
    this.chunks = [];
  }

  /** Serialisiert das Gewichtsfeld zurueck in das duenne Zell-Format der Karte. */
  exportCells(): { c: number; r: number; w: number[] }[] {
    const out: { c: number; r: number; w: number[] }[] = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const base = (r * this.cols + c) * this.nSorts;
        // Nur Zellen speichern, die vom reinen Default-Zustand abweichen.
        let isDefault = this.weights[base + this.defaultIdx] === 1;
        for (let k = 0; k < this.nSorts && isDefault; k++) {
          if (k !== this.defaultIdx && this.weights[base + k] !== 0) isDefault = false;
        }
        if (isDefault) continue;
        const w: number[] = [];
        for (let k = 0; k < this.nSorts; k++) w.push(round3(this.weights[base + k]));
        out.push({ c, r, w });
      }
    }
    return out;
  }
}

/** Welt-Bounding-Rechteck (achsenparallel) fuer eine Karte beliebiger Groesse. */
function computeRect(cols: number, rows: number): MapWorldRect {
  const corners = [gridToWorld(0, 0), gridToWorld(cols - 1, 0), gridToWorld(0, rows - 1), gridToWorld(cols - 1, rows - 1)];
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
  return { x: minX - TILE_WIDTH / 2, y: minY - TILE_HEIGHT / 2, width: maxX - minX + TILE_WIDTH, height: maxY - minY + TILE_HEIGHT };
}

/** Rundet auf 3 Nachkommastellen (stabile, kompakte Serialisierung). */
function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** Separabler Box-Weichzeichner des Alpha-Kanals (Radius r) einer RGBA-Maske. */
function blurAlpha(d: Uint8ClampedArray, W: number, H: number, r: number): void {
  const a = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) a[i] = d[i * 4 + 3];
  const b = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let s = 0;
      let n = 0;
      for (let k = -r; k <= r; k++) {
        const xx = x + k;
        if (xx < 0 || xx >= W) continue;
        s += a[y * W + xx];
        n++;
      }
      b[y * W + x] = s / n;
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let s = 0;
      let n = 0;
      for (let k = -r; k <= r; k++) {
        const yy = y + k;
        if (yy < 0 || yy >= H) continue;
        s += b[yy * W + x];
        n++;
      }
      d[(y * W + x) * 4 + 3] = s / n;
    }
  }
}
