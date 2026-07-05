import Phaser from "phaser";
import {
  DOODADS,
  DOODAD_PLACEMENT,
  foundationExtent,
  foundationOffsetY,
  type DoodadDef,
  type DoodadFaction,
  type DoodadCategory,
} from "../data/balance";
import {
  GRID_COLS,
  GRID_ROWS,
  inBounds,
  gridToWorld,
  UNIT_DEPTH_OFFSET,
  SCATTER_DEPTH,
  FOUNDATION_DEPTH,
} from "../util/world";
import { createFoundation } from "../util/foundation";
import { findPath, nearestWalkable } from "./pathfinding";
import type { GameState } from "./game_state";
import type { GridPoint } from "../util/iso";

interface Obstacle {
  key: string;
  cells: GridPoint[];
  image: Phaser.GameObjects.Image;
  /** Fundamentfleck unter dem Hindernis (verankert es im Boden). */
  foundation?: Phaser.GameObjects.GameObject;
  blocksMovement: boolean;
  blocksSight: boolean;
  /** Hoher Verdecker (Block B): wird halbtransparent, wenn Einheit dahinter. */
  tall: boolean;
  blocked: boolean;
}

// Terrain-Doodads: deterministische Platzierung (fester Seed) von Hindernissen
// (Fels/Baum mit Footprint) und begehbarer Streu-Deko. Nutzt das bestehende
// Pathfinding-Grid (game_state) fuer Kollision und Erreichbarkeit sowie den
// Fusspunkt-Y-Sort wie Gebaeude/Einheiten. Sicht-Blocker liefern sie an die
// bestehende Occlusion-Silhouette.
export class DoodadSystem {
  private readonly obstacles: Obstacle[] = [];
  private readonly scatter: Phaser.GameObjects.Image[] = [];
  private hqCenters: GridPoint[] = [];
  private sightImages: Phaser.GameObjects.Image[] = [];
  private tallImages: Phaser.GameObjects.Image[] = [];
  /** Mitten der platzierten Waelder (fuer das Cluster-Verteilen der Baeume). */
  private waldCenters: GridPoint[] = [];
  /** Wie viele Doodads die Erreichbarkeitspruefung zuruecknehmen musste. */
  public removedForReach = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly state: GameState,
    private readonly faction: DoodadFaction,
  ) {}

  // --- Platzierung (Block B) ---------------------------------------------

  public generate(): void {
    this.hqCenters = this.state.buildings
      .filter((b) => b.role === "hq")
      .map((b) => ({ col: Math.round(b.col + (b.footprint.w - 1) / 2), row: Math.round(b.row + (b.footprint.h - 1) / 2) }));

    const rng = new Phaser.Math.RandomDataGenerator([String(DOODAD_PLACEMENT.seed)]);
    const waldKeys = this.keysOfCategory("wald");
    const clusterKeys = this.keysOfCategory("cluster");
    const treeKeys = this.keysOfCategory("tree");
    const rockKeys = this.keysOfCategory("rock");
    const clutterKeys = this.keysOfCategory("streu");

    // Kategorie-Zaehler statt pauschaler obstacleCount. Waelder zuerst (dicht
    // beieinander), mit gestreuten Randbaeumen; Einzelbaeume bevorzugt um die
    // Waelder geclustert, Felsen in kleinen Gruppen.
    this.placeForests(rng, waldKeys, treeKeys);
    this.placeCategory(rng, clusterKeys, DOODAD_PLACEMENT.clusterCount);
    this.placeTrees(rng, treeKeys, DOODAD_PLACEMENT.singleTreeCount);
    this.placeRocks(rng, rockKeys, DOODAD_PLACEMENT.rockCount);
    this.placeClutter(rng, clutterKeys);
  }

  /** Eingeloggte, ladbare Schluessel einer Platzierungs-Kategorie (faktionsgefiltert). */
  private keysOfCategory(cat: DoodadCategory): string[] {
    const eligible = (def: DoodadDef) => def.faction === this.faction || def.faction === "neutral";
    return Object.keys(DOODADS).filter(
      (k) => DOODADS[k].category === cat && eligible(DOODADS[k]) && this.scene.textures.exists(k),
    );
  }

  /** Platziert `count` Hindernisse aus `keys` an gueltigen Zellen. */
  private placeCategory(rng: Phaser.Math.RandomDataGenerator, keys: string[], count: number): void {
    if (keys.length === 0 || count <= 0) return;
    const maxTries = count * 80;
    let placed = 0;
    let tries = 0;
    while (placed < count && tries < maxTries) {
      tries++;
      if (this.tryPlaceObstacle(rng, rng.pick(keys))) placed++;
    }
  }

  /** Versucht eine zufaellige gueltige Platzierung des Schluessels. */
  private tryPlaceObstacle(rng: Phaser.Math.RandomDataGenerator, key: string): boolean {
    const def = DOODADS[key];
    const col = rng.between(0, GRID_COLS - def.footprint.w);
    const row = rng.between(0, GRID_ROWS - def.footprint.h);
    const cells = this.footprintCells(col, row, def.footprint.w, def.footprint.h);
    if (!this.validObstacle(cells)) return false;
    this.addObstacle(key, def, col, row, cells);
    return true;
  }

  /** Versucht eine gueltige Platzierung im Umkreis `radius` um `near`. */
  private tryPlaceNear(
    rng: Phaser.Math.RandomDataGenerator,
    key: string,
    near: GridPoint,
    radius: number,
  ): boolean {
    const def = DOODADS[key];
    const col = Phaser.Math.Clamp(
      Math.round(near.col) + rng.between(-radius, radius),
      0,
      GRID_COLS - def.footprint.w,
    );
    const row = Phaser.Math.Clamp(
      Math.round(near.row) + rng.between(-radius, radius),
      0,
      GRID_ROWS - def.footprint.h,
    );
    const cells = this.footprintCells(col, row, def.footprint.w, def.footprint.h);
    if (!this.validObstacle(cells)) return false;
    this.addObstacle(key, def, col, row, cells);
    return true;
  }

  /** Einzelbaeume: Anteil forestClusterBias clustert um einen Wald, Rest zufaellig. */
  private placeTrees(rng: Phaser.Math.RandomDataGenerator, keys: string[], count: number): void {
    if (keys.length === 0 || count <= 0) return;
    const maxTries = count * 80;
    let placed = 0;
    let tries = 0;
    while (placed < count && tries < maxTries) {
      tries++;
      const key = rng.pick(keys);
      const nearWald = this.waldCenters.length > 0 && rng.frac() < DOODAD_PLACEMENT.forestClusterBias;
      const ok = nearWald
        ? this.tryPlaceNear(rng, key, rng.pick(this.waldCenters), DOODAD_PLACEMENT.forestNearRadius)
        : this.tryPlaceObstacle(rng, key);
      if (ok) placed++;
    }
  }

  /** Felsen: mit Wahrscheinlichkeit rockClusterChance als kleine Gruppe (2-3). */
  private placeRocks(rng: Phaser.Math.RandomDataGenerator, keys: string[], count: number): void {
    if (keys.length === 0 || count <= 0) return;
    const maxTries = count * 80;
    let placed = 0;
    let tries = 0;
    while (placed < count && tries < maxTries) {
      tries++;
      if (!this.tryPlaceObstacle(rng, rng.pick(keys))) continue;
      placed++;
      if (rng.frac() >= DOODAD_PLACEMENT.rockClusterChance) continue;
      // Begleitfelsen direkt daneben streuen.
      const anchor = this.obstacles[this.obstacles.length - 1].cells[0];
      const extra = rng.between(1, 2);
      for (let k = 0; k < extra && placed < count; k++) {
        if (this.tryPlaceNear(rng, rng.pick(keys), anchor, DOODAD_PLACEMENT.rockClusterRadius)) placed++;
      }
    }
  }

  /** Platziert die Waelder und streut um jeden einige Randbaeume. */
  private placeForests(
    rng: Phaser.Math.RandomDataGenerator,
    waldKeys: string[],
    treeKeys: string[],
  ): void {
    if (waldKeys.length === 0) return;
    const count = DOODAD_PLACEMENT.waldCount;
    const maxTries = count * 200;
    const maxDist = DOODAD_PLACEMENT.forestProximity * GRID_COLS;
    let placed = 0;
    let tries = 0;
    while (placed < count && tries < maxTries) {
      tries++;
      const key = rng.pick(waldKeys);
      const def = DOODADS[key];
      const col = rng.between(0, GRID_COLS - def.footprint.w);
      const row = rng.between(0, GRID_ROWS - def.footprint.h);
      const cells = this.footprintCells(col, row, def.footprint.w, def.footprint.h);
      if (!this.validObstacle(cells)) continue;
      const center = { col: col + (def.footprint.w - 1) / 2, row: row + (def.footprint.h - 1) / 2 };
      // Folge-Waelder nahe an einen bereits platzierten setzen (in den ersten
      // 70 % der Versuche; danach jeder gueltige Platz, damit es nicht haengt).
      if (
        this.waldCenters.length > 0 &&
        tries < maxTries * 0.7 &&
        !this.waldCenters.some((c) => (c.col - center.col) * (c.col - center.col) + (c.row - center.row) * (c.row - center.row) <= maxDist * maxDist)
      ) {
        continue;
      }
      this.addObstacle(key, def, col, row, cells);
      this.waldCenters.push(center);
      this.scatterForestEdge(rng, col, row, def.footprint.w, def.footprint.h, treeKeys);
      placed++;
    }
  }

  /** Streut Einzelbaeume in ein Band um den Wald-Footprint (weicher Rand). */
  private scatterForestEdge(
    rng: Phaser.Math.RandomDataGenerator,
    col: number,
    row: number,
    w: number,
    h: number,
    treeKeys: string[],
  ): void {
    if (treeKeys.length === 0) return;
    const band = DOODAD_PLACEMENT.forestEdgeBand;
    const target = DOODAD_PLACEMENT.forestEdgeTrees;
    const maxTries = target * 40;
    let placed = 0;
    let tries = 0;
    while (placed < target && tries < maxTries) {
      tries++;
      const key = rng.pick(treeKeys);
      const def = DOODADS[key];
      const c0 = Phaser.Math.Clamp(
        rng.between(col - band, col + w - 1 + band),
        0,
        GRID_COLS - def.footprint.w,
      );
      const r0 = Phaser.Math.Clamp(
        rng.between(row - band, row + h - 1 + band),
        0,
        GRID_ROWS - def.footprint.h,
      );
      const cells = this.footprintCells(c0, r0, def.footprint.w, def.footprint.h);
      if (!this.validObstacle(cells)) continue;
      this.addObstacle(key, def, c0, r0, cells);
      placed++;
    }
  }

  private placeClutter(rng: Phaser.Math.RandomDataGenerator, keys: string[]): void {
    if (keys.length === 0) return;
    const target = DOODAD_PLACEMENT.clutterCount;
    const maxTries = target * 80;
    let tries = 0;
    while (this.scatter.length < target && tries < maxTries) {
      tries++;
      const key = rng.pick(keys);
      const def = DOODADS[key];
      const col = rng.between(0, GRID_COLS - 1);
      const row = rng.between(0, GRID_ROWS - 1);
      if (!inBounds(col, row) || this.state.isBlocked(col, row)) continue;
      this.addScatter(key, def, col, row);
    }
  }

  private validObstacle(cells: GridPoint[]): boolean {
    for (const c of cells) {
      if (!inBounds(c.col, c.row)) return false;
      if (this.state.isBlocked(c.col, c.row)) return false; // Gebaeude/Vorkommen
      if (this.nearAny(c, this.hqCenters, DOODAD_PLACEMENT.exclusionRadiusHQ)) return false;
      if (this.nearNodes(c, DOODAD_PLACEMENT.exclusionRadiusResource)) return false;
      if (this.nearUnits(c, 1)) return false; // Startpunkte nicht zustellen
      if (this.tooCloseToObstacle(c, DOODAD_PLACEMENT.minSpacingObstacles)) return false;
    }
    return true;
  }

  private addObstacle(key: string, def: DoodadDef, col: number, row: number, cells: GridPoint[]): void {
    const cx = col + (def.footprint.w - 1) / 2;
    const cy = row + (def.footprint.h - 1) / 2;
    const w = gridToWorld(cx, cy);
    // Tiefe nach depthMode: 'top' nimmt die noerdlichste Footprint-Zelle (Wald
    // sortiert weiter hinten); 'foot' (Default) den Fusspunkt des Sprites.
    const depthY = def.depthMode === "top" ? gridToWorld(col, row).y : w.y;
    const image = this.makeImage(key, w.x, w.y, def.displayWidthPx, UNIT_DEPTH_OFFSET + depthY);
    // Fundamentfleck (ERSETZT den Kontaktschatten): DIN-A4/A5-Regel -- selber
    // Anker (0.5/1.0) und selbe Position (w.x,w.y) wie das Doodad-Sprite, nur
    // groesser. Extent je Kategorie. No-Op ohne Textur.
    const foundation = createFoundation(
      this.scene,
      def.foundationTexture,
      w.x,
      w.y + foundationOffsetY(def.category),
      def.displayWidthPx,
      foundationExtent(def.category),
      FOUNDATION_DEPTH,
    );
    this.obstacles.push({
      key,
      cells,
      image,
      foundation,
      blocksMovement: def.blocksMovement,
      blocksSight: def.blocksSight,
      tall: def.tall,
      blocked: false,
    });
  }

  private addScatter(key: string, def: DoodadDef, col: number, row: number): void {
    const w = gridToWorld(col, row);
    this.scatter.push(this.makeImage(key, w.x, w.y, def.displayWidthPx, SCATTER_DEPTH));
  }

  private makeImage(
    key: string,
    worldX: number,
    worldY: number,
    displayWidthPx: number,
    depth: number,
  ): Phaser.GameObjects.Image {
    const img = this.scene.add.image(worldX, worldY, key).setOrigin(0.5, 1);
    img.setScale(displayWidthPx / (img.width || displayWidthPx));
    img.setDepth(depth);
    return img;
  }

  // --- Helfer ------------------------------------------------------------

  private footprintCells(col: number, row: number, w: number, h: number): GridPoint[] {
    const cells: GridPoint[] = [];
    for (let dr = 0; dr < h; dr++) for (let dc = 0; dc < w; dc++) cells.push({ col: col + dc, row: row + dr });
    return cells;
  }

  private nearAny(c: GridPoint, points: GridPoint[], radius: number): boolean {
    return points.some((p) => (p.col - c.col) * (p.col - c.col) + (p.row - c.row) * (p.row - c.row) <= radius * radius);
  }

  private nearNodes(c: GridPoint, radius: number): boolean {
    return this.state.nodes.some((n) => (n.col - c.col) * (n.col - c.col) + (n.row - c.row) * (n.row - c.row) <= radius * radius);
  }

  private nearUnits(c: GridPoint, radius: number): boolean {
    return this.state.units.some((u) => (u.col - c.col) * (u.col - c.col) + (u.row - c.row) * (u.row - c.row) <= radius * radius);
  }

  private tooCloseToObstacle(c: GridPoint, minSpacing: number): boolean {
    for (const o of this.obstacles) {
      for (const oc of o.cells) {
        if (Math.max(Math.abs(oc.col - c.col), Math.abs(oc.row - c.row)) < minSpacing) return true;
      }
    }
    return false;
  }

  // --- Kollision + Sicht (Block C) --------------------------------------

  /**
   * Traegt die Hindernis-Footprints ins selbe Pathfinding-Grid ein, auf dem
   * Einheiten routen, und stellt die HQ-zu-HQ-Erreichbarkeit sicher: bricht der
   * Weg, werden blockierende Doodads einzeln zurueckgenommen, bis er wieder
   * steht. Danach werden die Sicht-Blocker fuer die Occlusion gecached.
   */
  public applyCollision(): void {
    for (const o of this.obstacles) {
      if (!o.blocksMovement) continue;
      for (const c of o.cells) this.state.blockCell(c.col, c.row);
      o.blocked = true;
    }
    this.removedForReach = this.ensureReachable();
    this.sightImages = this.obstacles.filter((o) => o.blocksSight).map((o) => o.image);
    this.tallImages = this.obstacles.filter((o) => o.tall).map((o) => o.image);
  }

  private ensureReachable(): number {
    const blockedFn = (col: number, row: number): boolean => this.state.isBlocked(col, row);
    if (this.hqCenters.length < 2) return 0;
    const a = nearestWalkable(this.hqCenters[0], blockedFn, this.hqCenters[0]);
    const b = nearestWalkable(this.hqCenters[1], blockedFn, this.hqCenters[1]);
    if (!a || !b) return 0;

    const reachable = () => findPath(a, b, blockedFn).length > 0;
    if (reachable()) return 0;

    // Zuletzt gesetzte blockierende Doodads zuerst zuruecknehmen.
    let removed = 0;
    for (let i = this.obstacles.length - 1; i >= 0 && !reachable(); i--) {
      const o = this.obstacles[i];
      if (!o.blocked) continue;
      for (const c of o.cells) this.state.unblockCell(c.col, c.row);
      o.image.destroy();
      o.foundation?.destroy();
      this.obstacles.splice(i, 1);
      removed++;
    }
    return removed;
  }

  /** Bilder der sicht-blockierenden Hindernisse fuer die Occlusion-Silhouette. */
  public sightBlockers(): Phaser.GameObjects.Image[] {
    return this.sightImages;
  }

  /** Bilder der hohen Verdecker (Baeume, grosse Felsen) fuer den Fade-Effekt. */
  public tallOccluders(): Phaser.GameObjects.Image[] {
    return this.tallImages;
  }
}
