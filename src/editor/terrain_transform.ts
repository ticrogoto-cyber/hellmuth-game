// Fliessende Terrain-Texturwandlung (VFX Strang 2). Pro Fraktionsgebaeude ein
// wachsendes Distanzfeld, das das Sortengewicht in einem NICHT gespeicherten
// Overlay (TerrainRenderer.delta) hochzieht: MODERAT -> erde-tot, HELLMUTH ->
// klarflur. Kein Kachel-Swap (kein Sprung), weiche Kante gratis aus dem Renderer-
// Blend, gedrosselt (Tick + Chunk-Cap), bei Gebaeude-Tod reversibel. Null
// zusaetzliche RenderTexture -> 0 MB (zurueck in die bestehenden Chunk-Bakes).

import { TILE_WIDTH } from "../util/iso";
import { gridToWorld } from "../util/world";
import { smoothstep } from "./noise";
import type { TerrainRenderer } from "./terrain_render";

interface TransformSource {
  cx: number;
  cy: number;
  sortIdx: number;
  radiusMax: number;
  radius: number;
  grow: boolean;
  done: boolean;
}

const TICK_MS = 200; // Drossel-Intervall
const GROW_PER_TICK = 0.9; // Kacheln je Tick
// Randbreite (Kacheln) = max(SOFT_FRAC*radius, SOFT_MIN). Eine breite, weiche
// Dominanz-Rampe ist der einzige robuste Naht-Brecher (Sweep ueber Radius 5..8):
// nur wenn das Band breiter als der Renderer-Warp (~0,75 Kachel) ist, bleibt die
// gerenderte Deckung im Uebergang (kein Hochkontrast-Sprung, den das Gate als Naht
// zaehlt). SOFT_MIN haelt das Band auch bei kleinem Radius breit genug.
const SOFT_FRAC = 0.75;
const SOFT_MIN = 8; // Sweep Radius 5..11: cluster=0 + sichtbarer Umfaerbung. Darunter
//                     (Radius < 5) zu klein zum Umfaerben, was fuer Gebaeude-Einfluss
//                     ohnehin nicht vorkommt; ueber MAX_BAND wandert das Band nie.
const TARGET = 2.5; // Ziel-Overlay (zusaetzlich zur Basis): hebt die Zielsorte sicher
//                     ueber die normierte Basis (max 1), OHNE die Basis zu canceln.
//                     Ein gecanceltes Gewicht macht den Dominanz-Sprung sub-Kachel
//                     hart; blosses Anheben laesst ein echtes Uebergangsband stehen.

export class TerrainTransform {
  private sources: TransformSource[] = [];
  private last = 0;
  // Laufzeit-justierbar (Sweep im Headless).
  softFrac = SOFT_FRAC;
  softMin = SOFT_MIN;
  target = TARGET;

  constructor(private readonly terrain: TerrainRenderer) {}

  /** Neue Wandlungsquelle (Gebaeudemitte, Zielsorte, Maximalradius in Kacheln). */
  add(cx: number, cy: number, sortIdx: number, radiusMax: number): void {
    this.sources.push({ cx, cy, sortIdx, radiusMax, radius: 0, grow: true, done: false });
  }

  /** Gebaeude-Tod: die naechste Quelle bei (cx,cy) zurueckwachsen lassen. */
  reverseAt(cx: number, cy: number): void {
    let best: TransformSource | undefined;
    let bestD = Infinity;
    for (const s of this.sources) {
      const d = Math.hypot(s.cx - cx, s.cy - cy);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    if (best && bestD <= 2) {
      best.grow = false;
      best.done = false;
    }
  }

  get activeCount(): number {
    return this.sources.filter((s) => !s.done).length;
  }

  /**
   * Treibt alle Quellen einen Schritt (gedrosselt) und KOMPONIERT danach das ganze
   * Overlay neu (max je Sorte) statt jede Quelle einzeln zu schreiben. Damit
   * ueberlagern sich nahe Gebaeude sauber: gleiche Zielsorte -> staerkste Deckung
   * (kein Flackern durch Last-Writer-Wins), verschiedene Fraktionen -> jede besetzt
   * ihre eigene Sorte. Liefert true, wenn etwas neu zu backen ist.
   */
  tick(now: number): boolean {
    if (now - this.last < TICK_MS) return false;
    this.last = now;
    let advanced = false;
    for (const s of this.sources) {
      if (s.done) continue;
      s.radius += s.grow ? GROW_PER_TICK : -GROW_PER_TICK;
      if (s.grow && s.radius >= s.radiusMax) {
        s.radius = s.radiusMax;
        s.done = true;
      } else if (!s.grow && s.radius <= 0) {
        s.radius = 0;
        s.done = true;
      }
      advanced = true;
    }
    if (!advanced) return false;
    this.recompositeDelta();
    return true;
  }

  private soft(s: TransformSource): number {
    return Math.max(this.softFrac * s.radiusMax, this.softMin);
  }

  /**
   * Baut das Wandlungs-Overlay aus ALLEN Quellen neu auf (max je Sorte). Loescht
   * zuerst die Vereinigungs-Bounding-Box (radiusMax-basiert, deckt also auch
   * geschrumpfte Quellen), addiert dann je Quelle ihre Zielsorte als MAX. Nur die
   * Zielsorte wird angehoben (weiches Band gratis), Basissorten bleiben unberuehrt.
   */
  private recompositeDelta(): void {
    const live = this.sources.filter((s) => s.radius > 0 || !s.done);
    // Vereinigungs-Box ueber ALLE Quellen (auch radius 0: muss geleert werden).
    let minC = Infinity;
    let minR = Infinity;
    let maxC = -Infinity;
    let maxR = -Infinity;
    for (const s of this.sources) {
      const ext = Math.ceil(Math.max(s.radiusMax, this.soft(s))) + 1;
      minC = Math.min(minC, Math.floor(s.cx - ext));
      minR = Math.min(minR, Math.floor(s.cy - ext));
      maxC = Math.max(maxC, Math.ceil(s.cx + ext));
      maxR = Math.max(maxR, Math.ceil(s.cy + ext));
    }
    if (minC > maxC) return;
    const nSorts = this.terrain.nSorts;
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        for (let k = 0; k < nSorts; k++) this.terrain.setTransformAt(c, r, k, 0);
      }
    }
    for (const s of live) {
      if (s.radius <= 0) continue;
      const soft = this.soft(s);
      const ext = Math.ceil(Math.max(s.radiusMax, soft)) + 1;
      for (let r = Math.floor(s.cy - ext); r <= Math.ceil(s.cy + ext); r++) {
        for (let c = Math.floor(s.cx - ext); c <= Math.ceil(s.cx + ext); c++) {
          const dist = Math.hypot(c + 0.5 - s.cx, r + 0.5 - s.cy);
          const cov = 1 - smoothstep(s.radius - soft, s.radius, dist);
          if (cov > 0) this.terrain.maxTransformAt(c, r, s.sortIdx, this.target * cov);
        }
      }
    }
    // Welt-Bounding-Box ueber ALLE vier Gitterecken (Diamant dreht -> zwei Ecken
    // reichen nicht). Grosszuegiger Rand fuer das weiche Band.
    const corners = [gridToWorld(minC, minR), gridToWorld(maxC, minR), gridToWorld(minC, maxR), gridToWorld(maxC, maxR)];
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    const pad = TILE_WIDTH;
    const x0 = Math.min(...xs) - pad;
    const y0 = Math.min(...ys) - pad;
    this.terrain.markDirtyWorldRect(x0, y0, Math.max(...xs) - x0 + pad, Math.max(...ys) - y0 + pad);
  }
}
