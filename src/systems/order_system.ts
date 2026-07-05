import type { GameState } from "./game_state";
import type { MovementSystem } from "./movement_system";
import type { ResourceSystem } from "./resource_system";
import type { CombatSystem } from "./combat_system";
import type { Unit, Order } from "../entities/unit";

// Order-System: arbeitet die per Umschalttaste verkettete Befehls-Queue jeder
// Einheit ab. Ist eine Einheit untaetig und hat noch Befehle, startet der
// naechste. Generisch ueber gemischte Befehlstypen (bauen, bewegen, sammeln,
// angreifen, Attack-Move). Phaser-frei.
export class OrderSystem {
  constructor(
    private readonly state: GameState,
    private readonly movement: MovementSystem,
    private readonly resource: ResourceSystem,
    private readonly combat: CombatSystem,
  ) {}

  public update(): void {
    for (const unit of this.state.units) {
      if (unit.orders.length === 0 || this.busy(unit)) continue;
      const order = unit.orders.shift();
      if (order) this.start(unit, order);
    }
  }

  /** Ist die Einheit gerade mit einer Taetigkeit beschaeftigt? */
  private busy(unit: Unit): boolean {
    return (
      unit.path.length > 0 ||
      unit.gather !== undefined ||
      unit.buildTarget !== undefined ||
      unit.repairTarget !== undefined ||
      unit.attackTarget !== undefined ||
      unit.attackMove !== undefined
    );
  }

  /** Startet einen Befehl. Veraltete Ziele werden uebersprungen. */
  public start(unit: Unit, order: Order): void {
    switch (order.kind) {
      case "move":
        this.movement.commandMoveGroup([unit], order.x, order.y);
        return;
      case "attackMove":
        this.movement.commandAttackMove([unit], order.x, order.y);
        return;
      case "gather":
        // Eignungsfilter: nur Arbeiter sammeln (Nichtarbeiter in der Queue
        // uebersprungen, statt bloss zum Knoten zu laufen).
        if (order.node.erschoepft || !unit.isWorker) return;
        this.resource.issueGather(unit, order.node);
        return;
      case "attack":
        if (order.target.isDead) return;
        this.combat.issueAttack([unit], order.target);
        return;
      case "build":
        // Eignungsfilter: nur Bauer (Arbeiter); sonst rief der Pfad
        // moveAdjacentTo auch fuer Nichtbauer auf.
        if (
          order.site.isDead ||
          order.site.fertig ||
          !this.state.buildings.includes(order.site) ||
          !unit.isWorker
        ) {
          return;
        }
        unit.gather = undefined;
        unit.repairTarget = undefined;
        unit.attackTarget = undefined;
        unit.attackMove = undefined;
        unit.buildTarget = order.site;
        this.movement.moveAdjacentTo(unit, { col: order.site.col, row: order.site.row });
        return;
    }
  }
}
