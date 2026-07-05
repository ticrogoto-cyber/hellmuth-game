import Phaser from "phaser";
import { REPAIR } from "../data/balance";
import { EVT_HEAL_TICK } from "../fx/heal_glow";
import type { GameState } from "./game_state";
import type { MovementSystem } from "./movement_system";
import type { Unit } from "../entities/unit";
import type { Building } from "../entities/building";
import type { Cost, ResourceId } from "../data/loader";

// Reparatur-System: Sammler stellen HP eigener, beschaedigter Gebaeude wieder
// her, solange Ressourcen reichen. Rate und Kostenanteil aus data/balance.ts.
// Volle Reparatur kostet `costFraction` der Baukosten, anteilig pro HP.
export class RepairSystem {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly state: GameState,
    private readonly movement: MovementSystem,
  ) {}

  /** Startet die Reparatur eines eigenen, beschaedigten Gebaeudes. */
  public issueRepair(workers: Unit[], building: Building): void {
    if (building.owner !== "spieler" || !building.damaged) return;
    for (const u of workers) {
      if (!u.isWorker) continue;
      u.gather = undefined;
      u.buildTarget = undefined;
      u.attackTarget = undefined;
      u.repairTarget = building;
      this.movement.moveAdjacentTo(u, { col: building.col, row: building.row });
    }
  }

  public update(deltaMs: number): void {
    const dt = deltaMs / 1000;
    for (const unit of this.state.units) {
      if (unit.repairTarget) this.tick(unit, unit.repairTarget, dt);
    }
  }

  private tick(unit: Unit, building: Building, dt: number): void {
    if (building.isDead || !building.damaged) {
      unit.repairTarget = undefined;
      unit.path = [];
      return;
    }
    if (!this.adjacent(unit, building)) {
      if (!unit.moving) this.movement.moveAdjacentTo(unit, { col: building.col, row: building.row });
      return;
    }

    const remaining = building.maxHp - building.hp;
    if (remaining <= 0) {
      unit.repairTarget = undefined;
      return;
    }

    const applied = Math.min(REPAIR.hpPerSecondPerWorker * dt, remaining);
    const cost = this.repairCost(building, applied);
    if (!this.state.canAfford("spieler", cost)) {
      // Ressourcen aufgebraucht: Reparatur sauber beenden.
      unit.repairTarget = undefined;
      return;
    }
    this.state.spend("spieler", cost);
    building.heal(applied);
    this.scene.events.emit(EVT_HEAL_TICK, { x: building.x, y: building.y });
  }

  /** Anteilige Reparaturkosten fuer `hp` wiederhergestellte HP. Gebaeude ohne
   * eigene Baukosten (HQ) nutzen die Ersatzkosten aus balance.ts, damit die
   * Reparatur nicht kostenlos ist. */
  private repairCost(building: Building, hp: number): Cost {
    const baukosten = building.def.kosten ?? REPAIR.fallbackKosten;
    const maxHp = building.maxHp || 1;
    const cost: Cost = {};
    for (const [id, amount] of Object.entries(baukosten) as [ResourceId, number][]) {
      cost[id] = (REPAIR.costFraction * amount * hp) / maxHp;
    }
    return cost;
  }

  private adjacent(unit: Unit, building: Building): boolean {
    for (const t of building.footprintTiles()) {
      if (Math.max(Math.abs(unit.col - t.col), Math.abs(unit.row - t.row)) <= 1) return true;
    }
    return false;
  }
}
