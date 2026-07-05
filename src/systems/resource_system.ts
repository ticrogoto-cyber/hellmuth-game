import type { GameState } from "./game_state";
import type { MovementSystem } from "./movement_system";
import type { Unit } from "../entities/unit";
import type { ResourceNode } from "../entities/resource_node";
import type { GridPoint } from "../util/iso";

// Fallbacks, falls ein Arbeiter ausnahmsweise keine Sammelwerte im JSON hat.
const FALLBACK_TRAGKRAFT = 10;
const FALLBACK_ERNTEZEIT_MS = 1200;

// Sammel-System: treibt den Zustandsautomaten jedes Arbeiters mit aktivem
// Sammel-Job. idle -> geht_zur_quelle -> erntet -> geht_zurueck -> laedt_ab ->
// wiederholt. Endlicher Vorrat; erschoepfte Quelle stoppt den Loop sauber.
export class ResourceSystem {
  constructor(
    private readonly state: GameState,
    private readonly movement: MovementSystem,
  ) {}

  /** Startet den Sammel-Loop fuer einen Arbeiter an einem Ressourcenknoten. */
  public issueGather(unit: Unit, node: ResourceNode): void {
    if (!unit.isWorker || node.erschoepft) return;
    unit.buildTarget = undefined;
    unit.repairTarget = undefined;
    unit.gather = { node, state: "to_node", carry: 0, timerMs: 0 };
    this.movement.moveAdjacentTo(unit, { col: node.col, row: node.row });
  }

  public update(deltaMs: number): void {
    for (const unit of this.state.units) {
      if (unit.gather) this.tick(unit, deltaMs);
    }
  }

  private tick(unit: Unit, deltaMs: number): void {
    const job = unit.gather;
    if (!job) return;
    const node = job.node;

    switch (job.state) {
      case "to_node": {
        if (node.erschoepft && job.carry === 0) {
          unit.stopAll();
          return;
        }
        if (unit.moving) return;
        if (this.adjacent(unit, node)) {
          job.state = "harvest";
          job.timerMs = unit.def.erntezeit_ms ?? FALLBACK_ERNTEZEIT_MS;
        } else {
          // Nicht angekommen (z. B. Weg neu noetig): erneut ansteuern.
          this.movement.moveAdjacentTo(unit, { col: node.col, row: node.row });
        }
        return;
      }

      case "harvest": {
        job.timerMs -= deltaMs;
        if (job.timerMs > 0) return;
        const menge = unit.def.tragkraft ?? FALLBACK_TRAGKRAFT;
        job.carry = node.abbauen(menge);
        if (job.carry <= 0) {
          unit.stopAll();
          return;
        }
        job.depot = this.state.nearestDepot(unit.col, unit.row, unit.owner);
        if (!job.depot) {
          unit.stopAll();
          return;
        }
        this.movement.moveAdjacentTo(unit, { col: job.depot.col, row: job.depot.row });
        job.state = "to_depot";
        return;
      }

      case "to_depot": {
        if (unit.moving) return;
        if (job.depot && this.adjacent(unit, job.depot)) {
          job.state = "deposit";
        } else if (job.depot) {
          this.movement.moveAdjacentTo(unit, { col: job.depot.col, row: job.depot.row });
        } else {
          unit.stopAll();
        }
        return;
      }

      case "deposit": {
        this.state.addResource(unit.owner, node.ressource, job.carry);
        job.carry = 0;
        if (node.erschoepft) {
          unit.stopAll();
        } else {
          this.movement.moveAdjacentTo(unit, { col: node.col, row: node.row });
          job.state = "to_node";
        }
        return;
      }
    }
  }

  /** Chebyshev-Nachbarschaft (8-Richtungen) zwischen Einheit und Zielkachel. */
  private adjacent(unit: Unit, target: GridPoint): boolean {
    return Math.max(Math.abs(unit.col - target.col), Math.abs(unit.row - target.row)) <= 1;
  }
}
