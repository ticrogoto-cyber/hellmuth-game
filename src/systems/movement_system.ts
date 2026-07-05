import { findPath, nearestWalkable, smoothPath } from "./pathfinding";
import {
  gridToWorld,
  worldToTile,
  inBounds,
  clampTile,
  PIXELS_PER_TILE,
  GRID_COLS,
  GRID_ROWS,
} from "../util/world";
import { buildFlowField, FlowField } from "./flow_field";
import { MOVEMENT } from "../data/balance";
import type { GameState } from "./game_state";
import type { Unit } from "../entities/unit";
import type { GridPoint, ScreenPoint } from "../util/iso";

// Bewegungssystem: erzeugt geglaettete Pfade (A* + String-Pulling) und schiebt
// Einheiten geschwindigkeitsbasiert glatt entlang der Welt-Wegpunkte. Der finale
// Wegpunkt eines Gruppenbefehls ist die exakte Klickposition (Sub-Tile). Alle
// Ziele werden hart auf die Kartenflaeche geklemmt; geratene Einheiten werden
// zurueckgezogen. Im Stillstand werden ueberlappende Einheiten sanft getrennt.
// Soft-Cap je Zelle fuer die Separation: in einem dichten Pulk genuegt eine
// Stichprobe der Nachbarn fuer eine plausible Trenn-Richtung; bounded die Kosten
// im Randfall (sonst O(N) Kandidaten je Einheit). Bei normaler Dichte inaktiv.
// Soft-Cap je Zelle: bounded die Kosten im Randfall (1000 auf einer Kachel),
// muss aber hoch genug sein, dass dichte Pulks sich gegenseitig sehen und voll
// trennen. Bei realistischer Dichte (<< cap/Zelle) inaktiv -> Skalierungs-Gate
// unberuehrt.
const SEPARATION_BUCKET_CAP = 32;

// Ab so vielen Einheiten auf DASSELBE Ziel lohnt das gemeinsame Flussfeld statt
// vieler Einzel-A* (unter dem ~50-Kipppunkt, Strang 1).
const SWARM_THRESHOLD = 40;
// LRU-Obergrenze fuer gecachte Flussfelder (verschiedene Ziele).
const FLOW_CACHE_MAX = 3;

export class MovementSystem {
  constructor(private readonly state: GameState) {}

  /** Wiederverwendeter Nachbar-Puffer (gegen GC) fuer die Gitterabfrage. */
  private readonly nbrScratch: Unit[] = [];

  // Flussfeld-Cache (LRU nach Ziel). Wird bei geaenderter Begehbarkeit
  // (state.flowGeneration) lazy neu gebacken -- effektiv hoechstens beim ersten
  // Zugriff je Generation und Ziel (max 1 Re-Bake/Frame in der Praxis).
  private readonly flowCache = new Map<number, FlowField>();
  private flowOrder: number[] = [];

  /** Dauer des letzten Vermeidungs-Passes in ms (Strang-2-Abnahme: < 4 ms@1000). */
  public lastAvoidMs = 0;

  private blockedFn = (col: number, row: number): boolean => this.state.isBlocked(col, row);

  /**
   * Befiehlt Einheiten, zur Bodenkachel (geklemmt) zu laufen. Bricht andere
   * Auftraege ab. Tile-basiert (fuer Rally, Verfolgung, Sammeln).
   */
  public commandMove(units: Unit[], goalCol: number, goalRow: number): void {
    const goal = clampTile(goalCol, goalRow);
    for (const unit of units) {
      this.clearOrders(unit);
      unit.lastMoveDest = goal;
      unit.movingByCommand = true;
      this.moveUnitTo(unit, goal);
    }
  }

  /**
   * Gruppen-Bewegungsbefehl auf eine exakte Weltposition (Klickpunkt als
   * Zentrum). Verteilt die Einheiten in eine Formation; Plaetze ausserhalb der
   * Karte werden nach innen gefaltet und hart geklemmt.
   */
  public commandMoveGroup(units: Unit[], worldX: number, worldY: number): void {
    // Grosser Pulk auf EIN Ziel -> gemeinsames Flussfeld statt Einzel-A*.
    if (units.length >= SWARM_THRESHOLD) {
      const gt = worldToTile(worldX, worldY);
      const goal = clampTile(gt.col, gt.row);
      this.assignSwarm(units, goal.col, goal.row);
      return;
    }
    // Formation mit Slot-Reservierung: jeder Platz auf eine EIGENE Kachel, damit
    // die Gruppe nicht stapelt. Runden zwei Slots auf dieselbe Kachel, weicht der
    // zweite auf die naechste freie, noch nicht reservierte Nachbarkachel aus.
    const center = { x: worldX, y: worldY };
    const slots = this.formationSlots(center, units.length, MOVEMENT.formationSpacing);
    const reserved = new Set<number>();
    units.forEach((unit, i) => {
      const raw = slots[i] ?? slots[slots.length - 1];
      const folded = this.foldIntoBounds(raw, center);
      const tile = this.reserveTile(worldToTile(folded.x, folded.y), reserved);
      reserved.add(tile.row * GRID_COLS + tile.col);
      this.clearOrders(unit);
      unit.lastMoveDest = tile;
      unit.movingByCommand = true;
      this.moveUnitTo(unit, tile);
    });
  }

  /** Naechste freie, NICHT reservierte Kachel zu `tile` (Ringsuche). Klemmt als
   *  letzte Sicherung. So bekommt jede Einheit eines Gruppenbefehls eine eigene
   *  Zielkachel (kein Stapeln). */
  private reserveTile(tile: GridPoint, reserved: Set<number>): GridPoint {
    const ok = (c: number, r: number): boolean =>
      inBounds(c, r) && !this.state.isBlocked(c, r) && !reserved.has(r * GRID_COLS + c);
    if (ok(tile.col, tile.row)) return tile;
    for (let ring = 1; ring <= 10; ring++) {
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring) continue; // nur Ringrand
          const c = tile.col + dc;
          const r = tile.row + dr;
          if (ok(c, r)) return { col: c, row: r };
        }
      }
    }
    return clampTile(tile.col, tile.row);
  }

  private clearOrders(unit: Unit): void {
    unit.gather = undefined;
    unit.buildTarget = undefined;
    unit.repairTarget = undefined;
    unit.attackTarget = undefined;
    unit.attackMove = undefined;
    unit.flowField = undefined;
  }

  /**
   * Weist einer grossen Gruppe das gemeinsame Flussfeld zum Ziel zu (Schwarm).
   * Ersetzt die Einzel-A*-Pfade -> kein Repath-Sturm. Auch von der KI
   * (issueAttack auf das HQ) genutzt.
   */
  public assignSwarm(units: Unit[], goalCol: number, goalRow: number): void {
    const goal = clampTile(goalCol, goalRow);
    for (const unit of units) {
      this.clearOrders(unit);
      unit.lastMoveDest = goal;
      unit.movingByCommand = true;
    }
    this.assignSwarmField(units, goal.col, goal.row);
  }

  /** Nur das Flussfeld setzen (ohne andere Befehle zu loeschen) -- fuer den
   *  Angriffs-Schwarm, der sein attackTarget behaelt (Kampf greift in
   *  Reichweite). */
  public assignSwarmField(units: Unit[], goalCol: number, goalRow: number): void {
    const goal = clampTile(goalCol, goalRow);
    const field = this.swarmField(goal.col, goal.row);
    for (const unit of units) {
      unit.path = [];
      unit.flowField = field;
    }
  }

  /** Cached/baut das Flussfeld zum Ziel; backt bei geaenderter Begehbarkeit neu
   *  (state.flowGeneration), LRU ueber verschiedene Ziele. */
  private swarmField(goalCol: number, goalRow: number): FlowField {
    const key = goalRow * GRID_COLS + goalCol;
    const gen = this.state.flowGeneration;
    let f = this.flowCache.get(key);
    if (!f || f.generation !== gen) {
      f = buildFlowField(GRID_COLS, GRID_ROWS, goalCol, goalRow, this.blockedFn);
      f.generation = gen;
      this.flowCache.set(key, f);
      this.flowOrder = this.flowOrder.filter((k) => k !== key);
      this.flowOrder.push(key);
      while (this.flowOrder.length > FLOW_CACHE_MAX) {
        const old = this.flowOrder.shift();
        if (old !== undefined) this.flowCache.delete(old);
      }
    }
    return f;
  }

  /** Attack-Move-Befehl: laeuft zur Position und greift unterwegs an. */
  public commandAttackMove(units: Unit[], worldX: number, worldY: number): void {
    this.commandMoveGroup(units, worldX, worldY);
    for (const unit of units) {
      unit.moveState = "direkt";
      unit.fireState = "frei";
      unit.attackMove = { x: worldX, y: worldY };
      // Attack-Move kaempft unterwegs: kein Move-Vorrang vor Auto-Acquire.
      unit.movingByCommand = false;
    }
  }

  /**
   * Faltet einen Formationsplatz, der ausserhalb der Karte liegt, am Zentrum
   * nach innen und klemmt ihn als letzte Sicherung hart auf eine Kachel.
   */
  private foldIntoBounds(slot: ScreenPoint, center: ScreenPoint): ScreenPoint {
    let target = slot;
    let tile = worldToTile(target.x, target.y);
    if (!inBounds(tile.col, tile.row)) {
      target = { x: center.x - (slot.x - center.x), y: center.y - (slot.y - center.y) };
      tile = worldToTile(target.x, target.y);
    }
    if (!inBounds(tile.col, tile.row)) {
      const ct = clampTile(tile.col, tile.row);
      target = gridToWorld(ct.col, ct.row);
    }
    return target;
  }

  /** Effektiver Startknoten: steht die Einheit auf einer belegten Kachel, wird
   * die naechste freie Nachbarkachel als Start genommen, damit sie immer
   * herausfindet. */
  private effectiveStart(unit: Unit): GridPoint {
    const from: GridPoint = { col: unit.col, row: unit.row };
    if (!this.state.isBlocked(from.col, from.row) && inBounds(from.col, from.row)) return from;
    return nearestWalkable(from, this.blockedFn, from) ?? from;
  }

  /**
   * Bewegt eine Einheit zu einer Kachel (Zentrum, geklemmt). Ist das Ziel
   * belegt, wird die naechste begehbare Kachel angesteuert.
   */
  public moveUnitTo(unit: Unit, goal: GridPoint): boolean {
    const cells = this.pathCells(unit, clampTile(goal.col, goal.row));
    if (!cells) {
      unit.path = [];
      return false;
    }
    if (cells.length <= 1) {
      unit.path = [];
      return cells.length === 1;
    }
    const smoothed = smoothPath(cells, this.blockedFn);
    unit.path = smoothed.slice(1).map((c): ScreenPoint => gridToWorld(c.col, c.row));
    return true;
  }

  /**
   * Bewegt eine Einheit zu einer exakten Weltposition (geklemmt). A* findet den
   * groben Pfad; der letzte Wegpunkt ist die reale Klickkoordinate (Sub-Tile),
   * sofern die Zielkachel frei und innerhalb der Karte liegt.
   */
  public moveUnitToWorld(unit: Unit, worldX: number, worldY: number): boolean {
    const from = this.effectiveStart(unit);
    const rawTile = worldToTile(worldX, worldY);
    let target = clampTile(rawTile.col, rawTile.row);
    let exact: ScreenPoint =
      target.col === rawTile.col && target.row === rawTile.row
        ? { x: worldX, y: worldY }
        : gridToWorld(target.col, target.row);

    if (this.state.isBlocked(target.col, target.row)) {
      const alt = nearestWalkable(target, this.blockedFn, from);
      if (!alt) {
        unit.path = [];
        return false;
      }
      target = alt;
      exact = gridToWorld(alt.col, alt.row);
    }

    const cells = findPath(from, target, this.blockedFn);
    if (cells.length === 0) {
      unit.path = [];
      return false;
    }
    const smoothed = smoothPath(cells, this.blockedFn);
    const pts = smoothed.slice(1).map((c): ScreenPoint => gridToWorld(c.col, c.row));
    if (pts.length === 0) pts.push(exact);
    else pts[pts.length - 1] = exact;
    unit.path = pts;
    return true;
  }

  /**
   * Bewegt eine Einheit neben ein belegtes Ziel (Gebaeude/Ressourcenknoten).
   * Gibt true, wenn ein begehbarer Nachbarplatz erreichbar ist.
   */
  public moveAdjacentTo(unit: Unit, target: GridPoint): boolean {
    const from = this.effectiveStart(unit);
    const spot = nearestWalkable(clampTile(target.col, target.row), this.blockedFn, from);
    if (!spot) return false;
    return this.moveUnitTo(unit, spot);
  }

  private pathCells(unit: Unit, goal: GridPoint): GridPoint[] | null {
    const from = this.effectiveStart(unit);
    let target = goal;
    if (this.state.isBlocked(target.col, target.row)) {
      const alt = nearestWalkable(target, this.blockedFn, from);
      if (!alt) return null;
      target = alt;
    }
    return findPath(from, target, this.blockedFn);
  }

  // --- Formation ---------------------------------------------------------

  private formationSlots(center: ScreenPoint, n: number, spacing: number): ScreenPoint[] {
    const slots: ScreenPoint[] = [{ x: center.x, y: center.y }];
    let ring = 1;
    while (slots.length < n) {
      const count = 6 * ring;
      for (let k = 0; k < count && slots.length < n; k++) {
        const ang = (2 * Math.PI * k) / count + (ring % 2) * 0.3;
        slots.push({
          x: center.x + Math.cos(ang) * spacing * ring,
          y: center.y + Math.sin(ang) * spacing * ring,
        });
      }
      ring++;
    }
    return slots;
  }

  // --- Pro-Frame-Aktualisierung -----------------------------------------

  public update(deltaMs: number): void {
    const dt = deltaMs / 1000;
    for (const unit of this.state.units) {
      if (unit.path.length > 0) this.advance(unit, dt);
      else if (unit.flowField) this.advanceFlow(unit, dt);
    }
    const t0 = performance.now();
    this.avoidance();
    this.lastAvoidMs = performance.now() - t0;
    this.enforceBounds(dt);
  }

  private advance(unit: Unit, dt: number): void {
    let budget = unit.tempo * PIXELS_PER_TILE * dt;

    while (budget > 0 && unit.path.length > 0) {
      const wp = unit.path[0];
      const dx = wp.x - unit.x;
      const dy = wp.y - unit.y;
      const dist = Math.hypot(dx, dy);

      if (dist <= budget || dist === 0) {
        unit.setWorld(wp.x, wp.y);
        unit.path.shift();
        budget -= dist;
      } else {
        const nx = unit.x + (dx / dist) * budget;
        const ny = unit.y + (dy / dist) * budget;
        unit.setWorld(nx, ny);
        budget = 0;
      }
    }

    const tile = worldToTile(unit.x, unit.y);
    unit.col = tile.col;
    unit.row = tile.row;
  }

  /**
   * Schwarm-Bewegung entlang des Flussfelds (O(1)/Frame, kein A*). Backt das
   * Feld bei geaenderter Begehbarkeit neu, sodass ein aktiver Schwarm sichtbar
   * um eine neu gesetzte Mauer umleitet.
   */
  private advanceFlow(unit: Unit, dt: number): void {
    let ff = unit.flowField;
    if (!ff) return;
    if (ff.generation !== this.state.flowGeneration) {
      ff = this.swarmField(ff.goalCol, ff.goalRow);
      unit.flowField = ff;
    }
    if (unit.col === ff.goalCol && unit.row === ff.goalRow) {
      unit.flowField = undefined; // Ziel erreicht
      return;
    }
    const dir = ff.dirAt(unit.col, unit.row);
    if (!dir) {
      unit.flowField = undefined; // unerreichbar / kein Gradient
      return;
    }
    const target = gridToWorld(unit.col + dir[0], unit.row + dir[1]);
    const budget = unit.tempo * PIXELS_PER_TILE * dt;
    const dx = target.x - unit.x;
    const dy = target.y - unit.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= budget || dist === 0) unit.setWorld(target.x, target.y);
    else unit.setWorld(unit.x + (dx / dist) * budget, unit.y + (dy / dist) * budget);
    const tile = worldToTile(unit.x, unit.y);
    unit.col = tile.col;
    unit.row = tile.row;
  }

  /**
   * Lokale Kollisionsvermeidung fuer ALLE Einheiten (Strang 2):
   *  - Ruhende: echte Separation mit Abstands-Totband + Arrival-Snap +
   *    quadratischer Daempfung -> 0 px Ruhe-Jitter.
   *  - Laeufer: Separationsvektor als seitliche Korrektur (avoidWeightMoving)
   *    auf die Wunschrichtung + Head-on-Bias (beide konsistent zur Seite) ->
   *    zwei Pulks durchdringen sich nicht.
   * Nachbarn aus dem Strang-3-Gitter (Lookahead = speed*tau). Deadlocks rein
   * geometrisch geloest (Buffered-Voronoi-Klemmung + tangentiales Wall-Following),
   * NIE ueber den Pfadfinder. Deterministischer Tiebreak (id), kein Math.random.
   */
  private avoidance(): void {
    const m = MOVEMENT;
    const minDist = m.separationDistance;
    for (const a of this.state.units) {
      const moving = a.path.length > 0 || a.flowField !== undefined;
      const lookahead = moving ? a.tempo * PIXELS_PER_TILE * m.avoidTau : 0;
      const range = minDist + lookahead;
      // queryRadius liefert ganze Zellen (per Doku: NICHT distanzgefiltert);
      // viele Kandidaten liegen jenseits `range`. Wir cullen sie billig via d²,
      // sparen so Math.hypot fuer den Grossteil; fuer die Nahen bleibt Math.hypot
      // (bit-identische Werte gegenueber Vor-Patch -> Determinismus erhalten).
      const range2 = range * range;
      const vdir = moving ? this.moveDir(a) : null;

      const neighbors = this.state.unitGrid.queryRadius(
        a.x,
        a.y,
        range,
        this.nbrScratch,
        SEPARATION_BUCKET_CAP,
      );
      let px = 0;
      let py = 0;
      let nearest = Infinity;
      let overlap = false;
      for (let i = 0; i < neighbors.length; i++) {
        const b = neighbors[i];
        if (a === b) continue;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        // Cull: ferne Nachbarn tragen weder zu Push, Head-on noch zu `nearest`
        // bei: bei d>=range fallen alle Innenbedingungen aus, und ohne nahen
        // Nachbar/Overlap wird `nearest` nie gelesen (pm<eps -> continue oben).
        if (d2 >= range2) continue;
        const d = Math.hypot(dx, dy);
        if (d < nearest) nearest = d;
        if (d < minDist - m.sepDeadbandPx) {
          if (d > 0.0001) {
            const t = (minDist - d) / minDist; // (0,1]
            const f = t * t; // quadratische Daempfung
            px += (dx / d) * f;
            py += (dy / d) * f;
          } else {
            overlap = true; // exaktes Overlap -> radiale Entstapelung nach der Schleife
          }
        }
        // Head-on-Bias fuer Laeufer: Nachbar voraus -> konsistent zur Seite
        // (rechts in Bildschirm-y-nach-unten = (-vy, vx)) -> bricht das Knaeuel.
        if (moving && vdir && d > 0.0001) {
          const ahead = (b.x - a.x) * vdir.x + (b.y - a.y) * vdir.y;
          if (ahead > 0) {
            const w = (1 - d / range) * 0.5;
            px += -vdir.y * w;
            py += vdir.x * w;
          }
        }
      }

      if (overlap) {
        // Einzigartiger radialer Schub je Einheit (Phyllotaxis ueber
        // id*goldenAngle): deterministisch, loescht sich bei vielen gestapelten
        // Einheiten NICHT aus -> sie faechern zuverlaessig auf.
        const ang = a.id * m.goldenAngle;
        px += Math.cos(ang);
        py += Math.sin(ang);
      }
      const pm = Math.hypot(px, py);
      if (pm < 0.0001) {
        a.stuckFrames = 0;
        continue;
      }
      let ux = px / pm;
      let uy = py / pm;
      let stepMag = Math.min(pm, 1) * m.sepStepPx;

      if (moving) {
        // Seitliche Korrektur, nicht bremsen: Komponente gegen die Bewegung kappen.
        if (vdir) {
          const along = ux * vdir.x + uy * vdir.y;
          if (along < 0) {
            ux -= along * vdir.x;
            uy -= along * vdir.y;
            const l = Math.hypot(ux, uy);
            if (l <= 0.0001) {
              a.stuckFrames = 0;
              continue;
            }
            ux /= l;
            uy /= l;
          }
        }
        stepMag *= m.avoidWeightMoving;
      } else if (stepMag < m.sepSnapPx) {
        a.stuckFrames = 0; // Arrival-Snap: vernachlaessigbarer Push -> 0 px
        continue;
      }

      const moved = this.tryNudge(a, ux * stepMag, uy * stepMag, nearest);
      if (moving && !moved) {
        // Eingekeilt: nach STUCK_FRAMES weicht die niedrigere Prioritaet (hoehere
        // id) staerker zur Seite aus und bricht die Verklemmung; hoehere haelt.
        if (++a.stuckFrames > m.stuckFrames && vdir) {
          this.tryNudge(a, -vdir.y * m.sepStepPx, vdir.x * m.sepStepPx, nearest);
        }
      } else {
        a.stuckFrames = 0;
      }
    }
  }

  /** Wunsch-Bewegungsrichtung (Bildschirm) eines Laeufers: zum naechsten
   *  Wegpunkt bzw. zur Flussfeld-Nachbarkachel. */
  private moveDir(a: Unit): { x: number; y: number } | null {
    let tx: number;
    let ty: number;
    if (a.path.length > 0) {
      tx = a.path[0].x;
      ty = a.path[0].y;
    } else if (a.flowField) {
      const d = a.flowField.dirAt(a.col, a.row);
      if (!d) return null;
      const w = gridToWorld(a.col + d[0], a.row + d[1]);
      tx = w.x;
      ty = w.y;
    } else {
      return null;
    }
    const dx = tx - a.x;
    const dy = ty - a.y;
    const l = Math.hypot(dx, dy);
    return l > 0.0001 ? { x: dx / l, y: dy / l } : null;
  }

  /**
   * Versetzt a um (nx,ny) kollisionsfrei: Buffered-Voronoi-Klemmung (nie weiter
   * als halbe Nachbar-Distanz) + tangentiales Ausweichen an Bounds/belegten
   * Kacheln (Wall-Following statt Verwurf). true, wenn tatsaechlich bewegt.
   */
  private tryNudge(a: Unit, nx: number, ny: number, nearest: number): boolean {
    // Buffered-Voronoi-Klemmung, aber mit Boden sepStepPx: voll ueberlappte
    // Einheiten (nearest=0) muessen sich noch entstapeln koennen.
    const cap = Math.max(nearest * 0.5, MOVEMENT.sepStepPx);
    let mag = Math.hypot(nx, ny);
    if (mag > cap && mag > 0.0001) {
      const s = cap / mag;
      nx *= s;
      ny *= s;
      mag = cap;
    }
    if (mag < 0.0001) return false;
    const free = (x: number, y: number): boolean => {
      const t = worldToTile(x, y);
      return inBounds(t.col, t.row) && !this.state.isBlocked(t.col, t.row);
    };
    let tx = a.x + nx;
    let ty = a.y + ny;
    if (!free(tx, ty)) {
      if (free(a.x + nx, a.y)) {
        tx = a.x + nx;
        ty = a.y;
      } else if (free(a.x, a.y + ny)) {
        tx = a.x;
        ty = a.y + ny;
      } else {
        return false;
      }
    }
    a.setWorld(tx, ty);
    const tile = worldToTile(tx, ty);
    a.col = tile.col;
    a.row = tile.row;
    return true;
  }

  /** Sicherheitsnetz: zieht Einheiten ausserhalb der Bounds auf die naechste
   * gueltige Kachel zurueck. Keine Einheit bleibt je draussen stehen. */
  private enforceBounds(dt: number): void {
    for (const unit of this.state.units) {
      if (inBounds(unit.col, unit.row)) continue;
      const ct = clampTile(unit.col, unit.row);
      const goal = gridToWorld(ct.col, ct.row);
      const dx = goal.x - unit.x;
      const dy = goal.y - unit.y;
      const dist = Math.hypot(dx, dy);
      const step = MOVEMENT.recoverSpeed * dt;
      if (dist <= step || dist === 0) {
        unit.setWorld(goal.x, goal.y);
      } else {
        unit.setWorld(unit.x + (dx / dist) * step, unit.y + (dy / dist) * step);
      }
      const tile = worldToTile(unit.x, unit.y);
      unit.col = tile.col;
      unit.row = tile.row;
    }
  }
}
