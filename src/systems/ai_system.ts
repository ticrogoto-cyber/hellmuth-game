import { clampTile } from "../util/world";
import { AI } from "../data/balance";
import { EVT_UNIT_HIT, type HitEvent } from "./death_fx";
import type { GameState } from "./game_state";
import type { MovementSystem } from "./movement_system";
import type { ResourceSystem } from "./resource_system";
import type { ProductionSystem } from "./production_system";
import type { Unit } from "../entities/unit";
import type { Building } from "../entities/building";

const ENEMY = "gegner";
const PLAYER = "spieler";
const ENEMY_FACTION = "moderat";

// Gegner-KI als DUENNE Schwarm-Schicht ueber Flussfeld (Paket 2) + Hash (Paket 1):
// die Masse "denkt" nicht pro Einheit, sie folgt dem Feld zum Spieler-HQ
// (O(1)/Einheit, kein per-Einheit-A*); Kampflaerm zieht nahe Schwarmteile lokal
// nach (Hash-Buckets, kein Vollscan). Arbeiter sammeln, das HQ produziert
// Nachschub -> die "Welle" = anschwellende feld-folgende Population (Spawn>Verlust).
// MECHANIK-HUELLE: Schwellen, R_noise, T_aggro, Wellen-Oekonomie, Siegbedingungen
// und das Roster Schwarm-vs-Stehheer sind KANON-LUECKEN und gehoeren Ticro.
export class AiSystem {
  private gatherMs = 0;
  private produceMs = 0;
  private elapsedMs = 0;
  private readonly noiseScratch: Unit[] = [];
  private readonly onNoise: (e: HitEvent) => void;

  constructor(
    scene: Phaser.Scene,
    private readonly state: GameState,
    private readonly movement: MovementSystem,
    private readonly resource: ResourceSystem,
    private readonly production: ProductionSystem,
  ) {
    // Laerm-Aggro haengt an der bestehenden Treffer-Emission (Strang 5):
    // jeder Angriff meldet {x,y,faction}. Reiner Konsument, kein Vollscan.
    this.onNoise = (e: HitEvent): void => this.reactToNoise(e);
    scene.events.on(EVT_UNIT_HIT, this.onNoise);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.events.off(EVT_UNIT_HIT, this.onNoise);
    });
  }

  /** Test-Isolation: alle Akkumulatoren auf 0. Wird vom __sim.setSeed-Pfad
   *  gerufen, damit zwei gleich geseedete Laeufe nicht ueber persistente
   *  gather/produce/elapsed-Timer divergieren. */
  public resetForTest(): void {
    this.gatherMs = 0;
    this.produceMs = 0;
    this.elapsedMs = 0;
  }

  public update(deltaMs: number): void {
    this.elapsedMs += deltaMs;
    this.gatherMs += deltaMs;
    this.produceMs += deltaMs;
    if (this.gatherMs >= AI.gatherIntervalMs) {
      this.assignGatherers();
      this.gatherMs = 0;
    }
    if (this.produceMs >= AI.produceIntervalMs) {
      this.produce();
      this.produceMs = 0;
    }

    const fighters = this.enemyFighters();
    // Schonfrist: vorher nur sammeln/rallyen, kein Vorstoss (Schonfrist = Ticro).
    if (this.elapsedMs < AI.attackGracePeriodSec * 1000) {
      this.rallyIdleFighters(fighters);
      return;
    }
    // Schwarm: untaetige Kampfeinheiten ins Flussfeld zum Spieler-HQ falten.
    if (AI.swarmEnabled) this.maintainSwarm(fighters);
  }

  // --- Schwarm-Lokomotion (A4.1 / A4.4) ----------------------------------

  /**
   * Faltet alle untaetigen MODERAT-Kaempfer ins gemeinsame Flussfeld zur Senke
   * (Spieler-HQ). attackTarget = Senke, damit der Kampf zuschlaegt, sobald eine
   * Einheit in Reichweite ist; das Feld traegt die Anfahrt (kein A*-Buendel).
   * Nachschub aus produce() faellt automatisch in den naechsten Faltzyklus.
   */
  private maintainSwarm(fighters: Unit[]): void {
    const goal = this.swarmGoal();
    if (!goal) return;
    const c = this.center(goal);
    const idle = fighters.filter(
      (f) => !f.flowField && !f.attackTarget && !f.attackMove && !f.movingByCommand,
    );
    if (idle.length === 0) return;
    for (const f of idle) {
      f.attackTarget = goal;
      f.swarmDriven = true;
    }
    this.movement.assignSwarmField(idle, c.col, c.row);
  }

  /** Senke des Schwarms: Spieler-HQ, sonst naechstes Spieler-Gebaeude. Randfall
   *  zugebaute/zerstoerte Basis -> kein Stehenbleiben (Rueckfall auf Gebaeude;
   *  lokal zieht ohnehin der Laerm). */
  private swarmGoal(): Building | undefined {
    return this.playerHq() ?? this.state.buildings.find((b) => b.owner === PLAYER && !b.isDead);
  }

  // --- Laerm-Aggro (A4.2, TAB-Kaskade) -----------------------------------

  /**
   * Ein Spielerangriff (Laerm) zieht nahe MODERAT-Schwarmteile lokal auf den
   * Angreifer. Nur die Strang-3-Buckets im Radius werden abgefragt (kein
   * Vollscan); nachgezogene schlagen -> neuer Laerm -> naechste Buckets
   * (emergente Kaskade). Prioritaet: Nahkampf > Laerm > Feld.
   */
  private reactToNoise(e: HitEvent): void {
    if (e.faction === ENEMY_FACTION) return; // eigener Laerm -> ignorieren
    const cands = this.state.unitGrid.queryRadius(e.x, e.y, AI.noiseRadiusPx, this.noiseScratch);
    // Angreifer (naechste Spieler-Kampfeinheit am Laerm) als Aggro-Ziel.
    // Distanz in d² getrackt: bit-identische Argmin-Reihenfolge ggu Math.hypot,
    // da `d < bestD <=> d² < bestD²` fuer d,bestD >= 0; spart sqrt im Hot-Pfad.
    let src: Unit | undefined;
    let bestD2 = Infinity;
    for (const u of cands) {
      if (u.owner !== PLAYER || !u.canAttack || u.isDead) continue;
      // FoW-Fairness: ohne cheatVision aggro-zielt die KI nur auf Einheiten, die
      // ihr eigenes Sichtgitter deckt (deterministisch -> hash() bleibt erhalten).
      if (!AI.cheatVision && !this.state.vision[ENEMY].isVisible(u.col, u.row)) continue;
      const dxn = u.x - e.x;
      const dyn = u.y - e.y;
      const d2 = dxn * dxn + dyn * dyn;
      if (d2 < bestD2) {
        bestD2 = d2;
        src = u;
      }
    }
    if (!src) return;
    for (const u of cands) {
      if (u.owner !== ENEMY || u.isWorker || !u.canAttack || u.isDead) continue;
      if (u.attackTarget && !u.flowField) continue; // schon im Nahkampf -> nicht stoeren
      u.attackTarget = src; // Laerm uebersteuert das Feld (Feld < Laerm < Nahkampf)
      u.flowField = undefined;
      u.swarmDriven = false;
    }
  }

  // --- Wirtschaft (unveraendert: sammeln + produzieren = Nachschub) -------

  /** Sammelt untaetige Kampfeinheiten vor der Schonfrist nahe der eigenen Basis. */
  private rallyIdleFighters(fighters: Unit[]): void {
    const g = this.gatherTile();
    if (!g) return;
    for (const f of fighters) {
      if (f.attackTarget || f.attackMove || f.moving) continue;
      if (Math.max(Math.abs(f.col - g.col), Math.abs(f.row - g.row)) > 2) {
        this.movement.commandMove([f], g.col, g.row);
      }
    }
  }

  private assignGatherers(): void {
    for (const w of this.enemyWorkers()) {
      if (w.gather || w.attackTarget || w.moving) continue;
      const node = this.nearestNode(w);
      if (node) this.resource.issueGather(w, node);
    }
  }

  private produce(): void {
    const hq = this.enemyHq();
    if (!hq) return;
    const type = this.enemyWorkers().length < 2 ? "sirup_trupp" : "stahlbrute";
    this.production.enqueue(hq, type);
  }

  // --- Abfragen ----------------------------------------------------------

  private center(b: Building): { col: number; row: number } {
    return {
      col: Math.round(b.col + (b.footprint.w - 1) / 2),
      row: Math.round(b.row + (b.footprint.h - 1) / 2),
    };
  }

  private enemyHq(): Building | undefined {
    return this.state.buildings.find((b) => b.owner === ENEMY && b.role === "hq" && b.canProduce);
  }

  private playerHq(): Building | undefined {
    return this.state.buildings.find((b) => b.owner === PLAYER && b.role === "hq");
  }

  private enemyWorkers(): Unit[] {
    return this.state.units.filter((u) => u.owner === ENEMY && u.isWorker);
  }

  private enemyFighters(): Unit[] {
    return this.state.units.filter((u) => u.owner === ENEMY && u.canAttack && !u.isWorker);
  }

  private gatherTile(): { col: number; row: number } | undefined {
    const hq = this.enemyHq();
    if (!hq) return undefined;
    const c = this.center(hq);
    return clampTile(c.col + AI.gatherOffset.col, c.row + AI.gatherOffset.row);
  }

  private nearestNode(u: Unit): (typeof this.state.nodes)[number] | undefined {
    let best: (typeof this.state.nodes)[number] | undefined;
    let bestD = Infinity;
    for (const n of this.state.nodes) {
      if (n.erschoepft) continue;
      const d = Math.abs(n.col - u.col) + Math.abs(n.row - u.row);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best;
  }
}
