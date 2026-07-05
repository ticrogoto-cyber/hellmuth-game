import type { Unit } from "../entities/unit";
import type { Building } from "../entities/building";
import type { ResourceNode } from "../entities/resource_node";
import type { GridEntity } from "../entities/entity";
import type { GameData, ResourceId, Cost, Owner } from "../data/loader";
import { SpatialGrid } from "./spatial_grid";
import { VisionGrid } from "./vision_grid";
import { VISION, DESTILLE_MAX, DESTILLE_TIER } from "../data/balance";
import { PIXELS_PER_TILE } from "../util/world";

// Zentrale Spielzustands-Halterung. Einzige Wahrheit ueber Entities,
// Ressourcenstaende (je Besitzer), Auswahl und belegte Kacheln. Systeme lesen
// und mutieren hier; Scene und HUD lesen hier. Keine Darstellung, keine Eingabe.
export class GameState {
  public readonly units: Unit[] = [];
  public readonly buildings: Building[] = [];
  public readonly nodes: ResourceNode[] = [];

  // Monotoner 30-Hz-Sim-Schritt-Zaehler (Gefechts-VFX): deterministische
  // Puls-Phasen (sin(simTick), Auren-Ringe/Glow-Flackern) lesen IHN statt der
  // Wanduhr. Schreibt NUR GameScene.stepSim (Inkrement) bzw. __sim.setSeed
  // (Reset); kein Sim-System liest ihn -> verhaltensneutral fuer die Sim.
  public simTick = 0;

  // Raeumliche Gitter (Strang 3): dynamisch (Einheiten, pro Tick rebuilt) +
  // statisch (Gebaeude, inkrementell). Zellkante = PIXELS_PER_TILE. Sie liefern
  // Kandidaten fuer Nachbarabfragen; der exakte Test bleibt beim Aufrufer.
  public readonly unitGrid = new SpatialGrid<Unit>(PIXELS_PER_TILE);
  public readonly buildingGrid = new SpatialGrid<Building>(PIXELS_PER_TILE);

  // Fog-of-War (FoW Paket A): ein Sichtgitter PRO FRAKTION. Read-only-Keystone --
  // NUR updateVision() schreibt; Render/KI/Minimap lesen ueber die VisionGrid-API.
  // Allianz waere OR (Shared Vision = Kanon-Luecke); vorerst nur Spieler + Gegner.
  public readonly vision: Record<Owner, VisionGrid> = {
    spieler: new VisionGrid(),
    gegner: new VisionGrid(),
  };
  /** FoW-eigener Mess-Anteil des Stempel-Passes (ms), Muster lastAvoidMs.
   *  lastSimMs misst den GANZEN Sim-Tick; das hier ist nur der FoW-Stempel. */
  public lastFowMs = 0;

  /** Ressourcen des Spielers (HUD liest hier direkt). */
  public readonly resources: Record<ResourceId, number>;
  /** Ressourcen des Gegners (KI-Oekonomie). */
  public readonly enemyResources: Record<ResourceId, number>;

  /** Aktuell als Armee selektierte Einheiten. */
  public selected: Unit[] = [];
  /** Per Klick inspiziertes Gebaeude/Ressourcenknoten (nicht selektierbar). */
  public inspected?: Building | ResourceNode;

  /** Fortschritt des Aufloesens (0..1) waehrend die Entf-Taste gehalten wird. */
  public disbandProgress = 0;

  private readonly reserved: Record<Owner, number> = { spieler: 0, gegner: 0 };
  private readonly blocked = new Set<string>();

  /** Generation der Begehbarkeit (Strang 1): bei jedem block/unblock erhoeht,
   *  damit gecachte Flussfelder als veraltet erkannt und neu gebacken werden. */
  public flowGeneration = 0;

  /** Optionale, darstellungsfreie Lebenszyklus-Haken (Scene registriert sie z. B.
   *  fuer die fliessende Terrain-Texturwandlung um Fraktionsgebaeude). */
  public onBuildingAdded?: (b: Building) => void;
  public onBuildingRemoved?: (b: Building) => void;

  private readonly startResources: Record<ResourceId, number>;
  private readonly startEnemyResources: Record<ResourceId, number>;
  private readonly data: GameData;

  constructor(data: GameData) {
    this.data = data;
    this.startResources = {
      botanicals: data.resources.botanicals.start,
      reinwasser: data.resources.reinwasser.start,
      destillat: data.resources.destillat.start,
    };
    this.resources = { ...this.startResources };
    // Der Gegner startet mit einem Vorrat, damit Wellen rollen; seine Arbeiter
    // stocken ihn nach.
    this.startEnemyResources = { botanicals: 1500, reinwasser: 800, destillat: 1500 };
    this.enemyResources = { ...this.startEnemyResources };
  }

  /** Setzt beide Ressourcenkonten auf die Startwerte (Matchstart/Seed). Beruehrt
   *  keine Positionen -> hash() bleibt erhalten. */
  public resetEconomy(): void {
    Object.assign(this.resources, this.startResources);
    Object.assign(this.enemyResources, this.startEnemyResources);
  }

  // --- Registrierung -----------------------------------------------------

  public addUnit(u: Unit): void {
    this.units.push(u);
  }

  /** Dynamisches Einheiten-Gitter mit den aktuellen Positionen neu aufbauen.
   *  Einmal pro Tick VOR movement.update aufrufen (Strang 3). */
  public rebuildUnitGrid(): void {
    this.unitGrid.rebuild(this.units);
  }

  /** Stempel-Pass (FoW Paket A): beide Sichtgitter aus den aktuellen Quellen
   *  (Einheiten + Gebaeude derselben Fraktion) neu aufbauen. In stepSim NACH
   *  movement.update und VOR allen Konsumenten aufrufen. EINZIGER Schreibzugriff
   *  auf die Sichtgitter. Misst den FoW-eigenen Kostenanteil in lastFowMs. */
  public updateVision(): void {
    const t0 = performance.now();
    this.vision.spieler.update(this.units, this.buildings, "spieler", VISION.fogPersist);
    this.vision.gegner.update(this.units, this.buildings, "gegner", VISION.fogPersist);
    this.lastFowMs = performance.now() - t0;
  }

  /** Harter Reset beider Sichtgitter (Matchstart/Seed): Sicht + Gedaechtnis. */
  public resetVision(): void {
    this.vision.spieler.clear();
    this.vision.gegner.clear();
  }

  public addBuilding(b: Building): void {
    this.buildings.push(b);
    this.buildingGrid.insert(b);
    for (const t of b.footprintTiles()) this.block(t.col, t.row);
    this.onBuildingAdded?.(b);
  }

  public addNode(n: ResourceNode): void {
    this.nodes.push(n);
    this.block(n.col, n.row);
  }

  /** Entfernt eine tote Einheit (Population wird automatisch frei). */
  public removeUnit(u: Unit): void {
    const i = this.units.indexOf(u);
    if (i >= 0) this.units.splice(i, 1);
    this.selected = this.selected.filter((s) => s !== u);
    u.destroy();
  }

  /** Besitzt `owner` ein fertiggebautes Gebaeude des angegebenen Typs? */
  public hasCompletedBuilding(owner: Owner, typeId: string): boolean {
    return this.buildings.some((b) => b.owner === owner && b.typeId === typeId && b.fertig);
  }

  /** Besitzt `owner` noch ein HQ-Gebaeude? Sonst ist die Fraktion besiegt. */
  public hasHq(owner: Owner): boolean {
    return this.buildings.some((b) => b.owner === owner && b.role === "hq");
  }

  // --- Destillat-System (docs/DESTILLAT-SYSTEM.md) -----------------------

  /** Tech-Stufe eines Besitzers: 1 + Anzahl FERTIGER Upgrade-Gebaeude (Labor =
   *  Stufe 2). Live aus dem Gebaeudebestand abgeleitet -> kein Cache, kann nicht
   *  veralten; zaehlt nur (ordnungs-unabhaengig -> deterministisch). */
  public techLevelOf(owner: Owner): number {
    let n = 0;
    for (const b of this.buildings) if (b.owner === owner && b.role === "upgrade" && b.fertig) n++;
    return 1 + n;
  }

  /** Anzahl Destillen eines Besitzers. completedOnly=true nur fertige (Produktion);
   *  sonst inkl. Baustellen (Bau-Limit, damit man nicht vier Baustellen reiht). */
  public destilleCount(owner: Owner, completedOnly = false): number {
    let n = 0;
    for (const b of this.buildings) {
      if (b.owner === owner && b.typeId === "destille" && (!completedOnly || b.fertig)) n++;
    }
    return n;
  }

  /** Wirt-Bedingung des Parasiten: existiert eine HELLMUTH-Destille im Spiel?
   *  Live (kein Cache) -> faellt die letzte Destille, hoert der MODERAT-Drop
   *  sofort auf. `.some()` ist ordnungs-unabhaengig -> deterministisch. */
  public hasHellmuthDestille(): boolean {
    return this.buildings.some((b) => b.typeId === "destille" && b.faction === "hellmuth");
  }

  /** Autoritatives Bau-Gate (server-seitig, von JEDEM Bau-Pfad zu pruefen). Fuer
   *  die Destille: Tech-Stufe >= DESTILLE_TIER und weniger als DESTILLE_MAX.
   *  Generisch danach: `requiresBuilding` aus der BuildingDef wird live geprueft
   *  (muss FERTIG vorhanden sein). So bekommen alle Bauten mit Voraussetzung den
   *  selben deklarativen Gate, ohne Spezialfall im Code. */
  public canConstruct(typeId: string, owner: Owner): { ok: boolean; reason?: string } {
    if (typeId === "destille") {
      if (this.techLevelOf(owner) < DESTILLE_TIER) return { ok: false, reason: "destille_tier_too_low" };
      if (this.destilleCount(owner) >= DESTILLE_MAX) return { ok: false, reason: "destille_max_reached" };
    }
    const def = this.data.buildings[typeId];
    if (def?.requiresBuilding && !this.hasCompletedBuilding(owner, def.requiresBuilding)) {
      return { ok: false, reason: `requires_${def.requiresBuilding}` };
    }
    return { ok: true };
  }

  /** Entfernt ein zerstoertes Gebaeude und gibt seine Kacheln frei. */
  public removeBuilding(b: Building): void {
    const i = this.buildings.indexOf(b);
    if (i >= 0) this.buildings.splice(i, 1);
    this.buildingGrid.remove(b);
    for (const t of b.footprintTiles()) this.unblock(t.col, t.row);
    if (this.inspected === b) this.inspected = undefined;
    // Arbeiter freigeben, die auf das zerstoerte Gebaeude verwiesen -- sonst
    // bleiben sie fuer immer "busy" (Baustelle weg, buildTarget haengt). Spiegelt
    // cancelBuild; Reparatur-/Abladeziel werden naechsten Tick neu erworben.
    for (const u of this.units) {
      if (u.buildTarget === b) u.buildTarget = undefined;
      if (u.repairTarget === b) u.repairTarget = undefined;
      if (u.gather?.depot === b) u.gather.depot = undefined;
    }
    this.onBuildingRemoved?.(b);
    b.destroy();
  }

  // --- Belegung / Pathfinding -------------------------------------------

  private static key(col: number, row: number): string {
    return `${col},${row}`;
  }

  private block(col: number, row: number): void {
    this.blocked.add(GameState.key(col, row));
    this.flowGeneration++;
  }

  private unblock(col: number, row: number): void {
    this.blocked.delete(GameState.key(col, row));
    this.flowGeneration++;
  }

  /** Test-/Editor-Hook: blockiert eine Kachel (Mauer) und invalidiert die
   *  gecachten Flussfelder. Nicht im normalen Spielpfad. */
  public addObstacle(col: number, row: number): void {
    this.block(col, row);
  }

  /** Ist die Kachel von einem Gebaeude oder Ressourcenknoten belegt? */
  public isBlocked(col: number, row: number): boolean {
    return this.blocked.has(GameState.key(col, row));
  }

  /** Sperrt/entsperrt eine Kachel (fuer Terrain-Doodads). */
  public blockCell(col: number, row: number): void {
    this.block(col, row);
  }
  public unblockCell(col: number, row: number): void {
    this.unblock(col, row);
  }

  // --- Ressourcen (je Besitzer) -----------------------------------------

  public resourcesOf(owner: Owner): Record<ResourceId, number> {
    return owner === "spieler" ? this.resources : this.enemyResources;
  }

  public addResource(owner: Owner, id: ResourceId, amount: number): void {
    this.resourcesOf(owner)[id] += amount;
  }

  /** Reichen die Ressourcen des Besitzers fuer die Kosten? */
  public canAfford(owner: Owner, cost: Cost): boolean {
    const pool = this.resourcesOf(owner);
    return (Object.entries(cost) as [ResourceId, number][]).every(
      ([id, amount]) => pool[id] >= amount,
    );
  }

  /** Zieht die Kosten ab. Vorher mit canAfford pruefen. */
  public spend(owner: Owner, cost: Cost): void {
    const pool = this.resourcesOf(owner);
    for (const [id, amount] of Object.entries(cost) as [ResourceId, number][]) {
      pool[id] -= amount;
    }
  }

  // --- Population (je Besitzer) -----------------------------------------

  public populationOf(owner: Owner): number {
    return this.units.reduce((sum, u) => (u.owner === owner ? sum + u.pop : sum), 0);
  }

  public populationCapOf(owner: Owner): number {
    return this.buildings.reduce(
      (sum, b) => (b.owner === owner ? sum + b.effectivePopCap : sum),
      0,
    );
  }

  public addReservedPop(owner: Owner, delta: number): void {
    this.reserved[owner] += delta;
  }

  /** Passt eine Einheit mit `pop` noch ins Population-Kap des Besitzers? */
  public canAddPop(owner: Owner, pop: number): boolean {
    const effective = this.populationOf(owner) + this.reserved[owner];
    return effective + pop <= this.populationCapOf(owner);
  }

  // HUD-Bequemlichkeit: Spielerwerte.
  public get population(): number {
    return this.populationOf("spieler");
  }
  public get populationCap(): number {
    return this.populationCapOf("spieler");
  }

  /** Naechstgelegenes HQ des Besitzers als Abgabestelle. */
  public nearestDepot(col: number, row: number, owner: Owner): Building | undefined {
    let best: Building | undefined;
    let bestDist = Infinity;
    for (const b of this.buildings) {
      if (b.role !== "hq" || b.owner !== owner) continue;
      const d = Math.abs(b.col - col) + Math.abs(b.row - row);
      if (d < bestDist) {
        bestDist = d;
        best = b;
      }
    }
    return best;
  }

  // --- Auswahl -----------------------------------------------------------

  /** Aktuelles Panel-Ziel: erste selektierte Einheit, sonst inspiziertes Objekt. */
  public get panelTarget(): GridEntity | undefined {
    return this.selected[0] ?? this.inspected;
  }

  public selectUnits(units: Unit[]): void {
    this.clearSelection();
    this.selected = units;
    for (const u of units) u.setSelected(true);
  }

  /** Fuegt Einheiten zur bestehenden Auswahl hinzu (Shift+Box/Klick). */
  public addToSelection(units: Unit[]): void {
    if (this.inspected) {
      this.inspected.setFocused(false);
      this.inspected = undefined;
    }
    for (const u of units) {
      if (!this.selected.includes(u)) {
        this.selected.push(u);
        u.setSelected(true);
      }
    }
  }

  /** Schaltet eine Einheit in der Auswahl an/aus (Shift+Klick). */
  public toggleUnit(unit: Unit): void {
    if (this.inspected) {
      this.inspected.setFocused(false);
      this.inspected = undefined;
    }
    const i = this.selected.indexOf(unit);
    if (i >= 0) {
      this.selected.splice(i, 1);
      unit.setSelected(false);
    } else {
      this.selected.push(unit);
      unit.setSelected(true);
    }
  }

  public inspect(entity: Building | ResourceNode): void {
    this.clearSelection();
    this.inspected = entity;
    entity.setFocused(true);
  }

  public clearSelection(): void {
    for (const u of this.selected) u.setSelected(false);
    this.selected = [];
    if (this.inspected) {
      this.inspected.setFocused(false);
      this.inspected = undefined;
    }
  }
}
