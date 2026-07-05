import Phaser from "phaser";
import { Unit } from "../entities/unit";
import { EVT_UNIT_READY } from "./game_events";
import { nearestWalkable } from "./pathfinding";
import { inBounds, gridToWorld, worldToTile } from "../util/world";
import type { GameState } from "./game_state";
import type { MovementSystem } from "./movement_system";
import type { Building } from "../entities/building";
import type { GameData, ResourceId } from "../data/loader";
import type { GridPoint, ScreenPoint } from "../util/iso";

export interface EnqueueResult {
  ok: boolean;
  reason?: string;
}

// Produktions-System: Warteschlangen an Produktionsgebaeuden, Kostenabzug,
// Timer, Spawn am Rallypunkt. Population-Kap wird respektiert.
export class ProductionSystem {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly state: GameState,
    private readonly movement: MovementSystem,
    private readonly data: GameData,
  ) {}

  private blockedFn = (c: number, r: number): boolean => this.state.isBlocked(c, r);

  /** Test-Isolation: Warteschlangen und aktive Timer aller Gebaeude leeren.
   *  Wird vom __sim.setSeed-Pfad gerufen, damit zwei gleich geseedete Laeufe
   *  nicht ueber persistente Produktions-Akkumulatoren divergieren. Beruehrt nur
   *  Render-/Sim-Akkumulatoren, keine Positionen. */
  public resetForTest(): void {
    for (const b of this.state.buildings) {
      b.queue.length = 0;
      b.activeElapsedMs = 0;
    }
  }

  /** Stellt eine Einheit in die Warteschlange. Kosten werden sofort abgezogen. */
  public enqueue(building: Building, unitTypeId: string): EnqueueResult {
    if (!building.canProduce) return { ok: false, reason: "Gebaeude produziert nicht" };
    if (!(building.def.produziert ?? []).includes(unitTypeId)) {
      return { ok: false, reason: "Nicht produzierbar" };
    }
    const def = this.data.units[unitTypeId];
    const owner = building.owner;
    // Voraussetzungsgebaeude (nur fuer die Spielerfraktion erzwungen, damit die
    // KI sich nicht selbst aussperrt).
    if (
      owner === "spieler" &&
      def.requiresBuilding &&
      !this.state.hasCompletedBuilding(owner, def.requiresBuilding)
    ) {
      return { ok: false, reason: "Voraussetzung fehlt" };
    }
    if (!this.state.canAfford(owner, def.kosten)) return { ok: false, reason: "Zu wenig Ressourcen" };
    if (!this.state.canAddPop(owner, def.pop)) return { ok: false, reason: "Population voll" };

    this.state.spend(owner, def.kosten);
    this.state.addReservedPop(owner, def.pop);
    building.queue.push({
      typeId: unitTypeId,
      name: def.name,
      totalMs: def.bauzeit * 1000,
      pop: def.pop,
    });
    return { ok: true };
  }

  /**
   * Storniert genau einen Warteschlangen-Eintrag (per Index) und erstattet die
   * VOLLEN Baukosten zurueck, auch wenn er schon teilweise produziert wurde.
   * Gibt die reservierte Population frei. Beim Entfernen des vordersten,
   * gerade laufenden Eintrags startet der naechste frisch.
   */
  public cancelQueueItem(building: Building, index: number): void {
    if (index < 0 || index >= building.queue.length) return;
    const item = building.queue[index];
    const def = this.data.units[item.typeId];
    for (const [id, amount] of Object.entries(def.kosten) as [ResourceId, number][]) {
      this.state.addResource(building.owner, id, amount);
    }
    this.state.addReservedPop(building.owner, -item.pop);
    building.queue.splice(index, 1);
    if (index === 0) building.activeElapsedMs = 0;
  }

  public update(deltaMs: number): void {
    for (const building of this.state.buildings) {
      if (!building.fertig || building.queue.length === 0) continue;
      const item = building.queue[0];
      building.activeElapsedMs += deltaMs;
      if (building.activeElapsedMs < item.totalMs) continue;

      this.spawn(building, item.typeId);
      this.state.addReservedPop(building.owner, -item.pop);
      building.queue.shift();
      building.activeElapsedMs = 0;
    }
  }

  private spawn(building: Building, unitTypeId: string): void {
    const def = this.data.units[unitTypeId];
    const rally = building.rally ?? this.defaultRally(building);
    const rallyTile = worldToTile(rally.x, rally.y);

    const south: GridPoint = { col: building.col, row: building.row + building.footprint.h };
    const spawnTile =
      nearestWalkable(south, this.blockedFn, rallyTile) ??
      nearestWalkable({ col: building.col, row: building.row }, this.blockedFn, rallyTile);
    if (!spawnTile) return;

    const unit = new Unit(this.scene, unitTypeId, def, spawnTile.col, spawnTile.row, building.owner);
    this.state.addUnit(unit);
    // Exakte (Sub-Tile) Welt-Koordinate ansteuern.
    this.movement.commandMoveGroup([unit], rally.x, rally.y);
    // Audio-Tap: Einheit fertig produziert (Set-Binding prod.unit_ready).
    this.scene.events.emit(EVT_UNIT_READY, {
      x: rally.x,
      y: rally.y,
      faction: def.faction,
      unitType: unitTypeId,
    });
  }

  private defaultRally(building: Building): ScreenPoint {
    const south: GridPoint = { col: building.col, row: building.row + building.footprint.h };
    const tile = inBounds(south.col, south.row)
      ? south
      : { col: building.col, row: Math.max(0, building.row - 1) };
    return gridToWorld(tile.col, tile.row);
  }
}
