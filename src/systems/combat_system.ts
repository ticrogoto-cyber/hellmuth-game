import { Unit } from "../entities/unit";
import { Building } from "../entities/building";
import { COMBAT, WORKER_COMBAT, DESTILLAT_DROP } from "../data/balance";
import { pickBestTarget, shouldSwitchTarget, targetScore } from "./target_priority";
import type { ScoredTarget } from "./target_priority";
import { ProjectileSystem } from "./projectile_system";
import {
  EVT_UNIT_HIT,
  EVT_UNIT_DIED,
  EVT_BUILDING_DIED,
  EVT_DESTILLAT_DROPPED,
  type HitSeverity,
} from "./death_fx";
import { fireProjectileBeam, muzzleFlash, impactBurst } from "../fx/projectile_beam";
import type { GameState } from "./game_state";
import type { MovementSystem } from "./movement_system";
import { KnockbackSystem, makeExplosion } from "./knockback";
import type { GridPoint } from "../util/iso";
import type { AngriffsTyp, FactionId, Owner } from "../data/loader";
import { PIXELS_PER_TILE } from "../util/world";
import { TILE_WIDTH } from "../util/iso";

type Combatant = Unit | Building;
// Welt-Pixel-Toleranz, ab der ein Attack-Move-Wegpunkt als erreicht gilt.
const ARRIVE_PX = 28;
// Ab so vielen Kaempfern auf EIN Gebaeude (HQ) Flussfeld statt Einzel-A*
// (gespiegelt aus movement_system, Strang 1).
const SWARM_THRESHOLD = 40;

// Kampf-System: Befehls- und Auto-Angriffe, Schaden, Tod. Datengetrieben aus
// den Kampfwerten der Defs. Bewegung kommt vom MovementSystem.
export class CombatSystem {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly state: GameState,
    private readonly movement: MovementSystem,
    /** Knockback-System (Code7-2): wird bei jedem Treffer via applyKnockback
     *  gefuettert; die Integration selbst laeuft in game_scene.stepSim. Kern
     *  bleibt unangetastet. */
    private readonly knockback: KnockbackSystem,
  ) {
    this.projectiles = new ProjectileSystem(scene, state, (t, s, f, ax, ay, sev, owner) =>
      this.resolveProjectileHit(t, s, f, ax, ay, sev, owner),
    );
  }

  /** Gepooltes Geschoss-System (Fernkampf); Einschlag ueber resolveProjectileHit. */
  private readonly projectiles: ProjectileSystem;

  /** Wiederverwendeter Kandidatenpuffer (gegen GC). */
  private readonly unitScratch: Unit[] = [];

  /** Tile-Reichweite -> sichere Pixel-Radius-Obergrenze fuer die Gitterabfrage.
   *  dist() misst in Kacheln (Chebyshev); im Diamantgitter deckt
   *  range*TILE_WIDTH die groesste Bildschirm-Strecke ab, plus eine Zelle
   *  Schlupf (Rebuild-Staleness). Der exakte dist()-Test filtert danach
   *  praezise -> bit-identisch. */
  private rangeToPx(rangeTiles: number): number {
    return rangeTiles * TILE_WIDTH + PIXELS_PER_TILE;
  }

  /** Befiehlt Einheiten, ein Ziel anzugreifen. Nicht-Kaempfer laufen nur hin. */
  public issueAttack(units: Unit[], target: Combatant): void {
    for (const u of units) {
      if (u === target) continue;
      if (u.canAttack) {
        u.gather = undefined;
        u.buildTarget = undefined;
        u.repairTarget = undefined;
        u.attackMove = undefined;
        u.movingByCommand = false;
        u.path = [];
        u.attackTarget = target;
        u.moveState = "direkt";
        u.fireState = "frei";
      } else {
        this.movement.commandMove([u], target.col, target.row);
      }
    }
    // Grosser Angriffs-Schwarm auf ein Gebaeude (z. B. HQ): gemeinsames
    // Flussfeld statt Einzel-A* -> kein Repath-Sturm; attackTarget bleibt, der
    // Kampf schlaegt zu, sobald eine Einheit in Reichweite ist.
    const fighters = units.filter((u) => u !== target && u.canAttack);
    if (fighters.length >= SWARM_THRESHOLD && target instanceof Building) {
      this.movement.assignSwarmField(fighters, target.col, target.row);
    }
  }

  public update(deltaMs: number): void {
    for (const u of [...this.state.units]) {
      if (!u.isDead) this.tickUnit(u, deltaMs);
    }
    for (const b of [...this.state.buildings]) {
      if (b.canAttack && !b.isDead) this.tickBuilding(b, deltaMs);
    }
    this.projectiles.update(deltaMs); // Geschosse fliegen + schlagen ein
  }

  // --- Einheiten ---------------------------------------------------------

  private tickUnit(u: Unit, dt: number): void {
    // Arbeiter: reine Selbstverteidigung im Nahkampf, kein Auto-Acquire/Jagen.
    if (u.isWorker) {
      this.tickWorkerDefense(u, dt);
      return;
    }
    if (u.attackCooldownMs > 0) u.attackCooldownMs -= dt;
    if (!u.canAttack) return;

    // Expliziter Move hat Vorrang: kein Auto-Acquire, bis das Ziel erreicht ist
    // (erlaubt Rueckzug aus dem Kampf). Attack-Move setzt das Flag nicht.
    if (u.movingByCommand) {
      if (u.moving) return;
      u.movingByCommand = false;
    }

    if (u.attackTarget && u.attackTarget.isDead) u.attackTarget = undefined;
    // Flucht in den Nebel (Option a): ein unsichtbar gewordenes EINHEIT-Ziel
    // wird sofort verloren -- konsistent mit dem Halten-Reflex (:142), keine
    // Verfolgung der letzten Sichtposition (das gehoert zu befohlenem
    // Attack-Move, nicht zum Auto-Reflex). Gebaeude-Ziele bleiben (Kanon-Luecke).
    if (
      u.attackTarget instanceof Unit &&
      !this.state.vision[u.owner].isVisible(u.attackTarget.col, u.attackTarget.row)
    ) {
      u.attackTarget = undefined;
    }

    // fireState steuert die Erfassung: frei = volle Acquire-Reichweite,
    // erwidern = nur Waffenreichweite (defensiv), feuerhalten = gar nicht.
    const canAcquire = u.fireState !== "feuerhalten";
    const range =
      u.fireState === "frei" ? Math.max(u.def.reichweite, COMBAT.acquireRange) : u.def.reichweite;

    if (!u.attackTarget) {
      if (canAcquire) u.attackTarget = this.acquire(u, range);
    } else {
      // Periodisch pruefen, ob ein gefaehrlicheres Ziel aufgetaucht ist.
      u.reevalMs -= dt;
      if (u.reevalMs <= 0) {
        u.reevalMs = COMBAT.reevalIntervalMs;
        if (canAcquire) this.maybeReacquire(u, range);
      }
    }

    if (u.attackTarget) {
      const d = this.dist(u, u.attackTarget);
      if (d <= u.def.reichweite) {
        u.path = []; // in Reichweite: anhalten und schlagen
        u.flowField = undefined; // Schwarm-Anflug beendet -> stehen und schlagen
        // Zwei-Phasen-Angriff: mit Attack-Clip faellt der Schaden am Hit-Frame
        // (Sichtsync + Code4-Blut), ohne Clip am Cooldown-Tick (unveraendert).
        if (u.attackCooldownMs <= 0 && (!u.attackHasHitFrame() || u.attackHitReady())) {
          // Fernkampf feuert ein Geschoss (Schaden beim Einschlag); Nahkampf
          // bucht den Schaden sofort. Beide teilen den Hit-Frame-Takt.
          if (this.typOf(u) === "fern") this.launchProjectile(u, u.attackTarget);
          else this.attack(u, u.attackTarget);
        }
      } else if (u.moveState === "halten") {
        u.attackTarget = undefined; // Position halten: nicht verfolgen
      } else if (!u.moving) {
        this.movement.moveAdjacentTo(u, this.targetTile(u, u.attackTarget));
      }
      return;
    }

    // Attack-Move: kein Ziel in Reichweite -> weiter zum Wegpunkt laufen.
    // Quadrierter Vergleich: bit-identischer Boolean ggu Math.hypot(dx,dy)<=R.
    if (u.attackMove) {
      const dxam = u.x - u.attackMove.x;
      const dyam = u.y - u.attackMove.y;
      const reached = dxam * dxam + dyam * dyam <= ARRIVE_PX * ARRIVE_PX;
      if (reached) u.attackMove = undefined;
      else if (!u.moving) this.movement.moveUnitToWorld(u, u.attackMove.x, u.attackMove.y);
      return;
    }

    if (u.moveState === "umherstreifen" && !u.moving && u.patrolA && u.patrolB) {
      this.movement.moveUnitTo(u, this.farther(u, u.patrolA, u.patrolB));
    }
  }

  /**
   * Arbeiterwehr: schwacher Nahkampf zur Selbstverteidigung. Steht ein Feind in
   * Nahreichweite, schlaegt der Arbeiter zurueck (im Cooldown-Takt); sonst tut
   * er nichts Kampfbezogenes und sammelt/baut weiter. Er rueckt nie von selbst
   * zum Angriff aus (kein Acquire, keine Verfolgung).
   */
  private tickWorkerDefense(u: Unit, dt: number): void {
    if (u.attackCooldownMs > 0) u.attackCooldownMs -= dt;
    if (!WORKER_COMBAT.autoRetaliate) return;
    const enemy = this.nearestEnemyUnitInRange(u, WORKER_COMBAT.range);
    if (!enemy) return;
    if (u.attackCooldownMs <= 0) this.workerStrike(u, enemy);
  }

  /** Naechste feindliche Einheit in Reichweite (nur Einheiten, keine Gebaeude). */
  private nearestEnemyUnitInRange(u: Unit, range: number): Unit | undefined {
    let best: Unit | undefined;
    let bestD = Infinity;
    const cand = this.state.unitGrid.queryRadius(u.x, u.y, this.rangeToPx(range), this.unitScratch);
    const vision = this.state.vision[u.owner];
    for (let i = 0; i < cand.length; i++) {
      const e = cand[i];
      if (e.owner === u.owner || e.isDead) continue;
      if (!vision.isVisible(e.col, e.row)) continue; // FoW: nur Sichtbares
      const d = this.dist(u, e);
      if (d <= range && d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  /** Schwacher Arbeiterschlag mit eigenen Kampfwerten (HP bleiben unangetastet). */
  private workerStrike(u: Unit, target: Unit): void {
    const net = Math.max(1, WORKER_COMBAT.damage - this.ruestungOf(target));
    target.applyDamage(net);
    // A1: Treffer mit Richtung (Angreifer u) + Schwere (Arbeiter = light).
    this.scene.events.emit(EVT_UNIT_HIT, {
      x: target.x, y: target.y, faction: u.faction, ax: u.x, ay: u.y, sev: "light",
    });
    // Code7-2: kleiner Knockback-Peak (leichter Schlag, radial vom Angreifer).
    this.applyKnockback(u, target, "light", u.x, u.y);
    u.attackCooldownMs = WORKER_COMBAT.cooldown;
    if (target.isDead) this.kill(target, u.faction, u.owner);
  }

  /** Naht 1 der Knockback-Verdrahtung (Code7-2, docs/PHYSIK-KNOCKBACK.md §10).
   *  Wandelt einen Treffer in eine punkthafte Explosion in Angreifer-Nachbarschaft;
   *  target wird radial WEGgeschubst, weil origin am/vor dem Angreifer sitzt. Die
   *  Wirkung ist knapp gross genug (outerRadius ~1.5 Tiles), um nur nahe Bodies
   *  zu erfassen; der Angreifer selbst wird per ignoreEntityIds ausgeklammert.
   *  peakForce nach Schwere: light 180 (regulaerer Nahkampf), heavy 320
   *  (schwere/Siege-Einheiten); Arbeiterschlag (u ist Unit mit role=worker)
   *  gibt zusaetzlich einen halben Peak, damit Sammler nur ansatzweise ruettteln. */
  private applyKnockback(
    attacker: Combatant | undefined,
    target: Combatant,
    sev: HitSeverity,
    originX: number,
    originY: number,
  ): void {
    if (!(target instanceof Unit)) return; // Gebaeude: static, immovable -> No-Op
    if (target.isDead) return;
    const isWorker = attacker instanceof Unit && attacker.def.role === "worker";
    const peakForce = (sev === "heavy" ? 420 : 250) * (isWorker ? 0.5 : 1.0);
    this.knockback.explode(
      makeExplosion({
        id: `hit_${target.id}`,
        origin: { x: originX, y: originY },
        // Iso-Nachbarkacheln liegen ~90 px auseinander (TILE_WIDTH/HEIGHT
        // 160/96 -> sqrt(80^2+48^2)=93). innerRadius muss target voll erfassen,
        // outerRadius nur knapp darueber, damit Umstehende auf naechster Kachel
        // nur einen Kissen-Effekt bekommen. peakForce entsprechend kalibriert:
        // heavy 420 -> impuls ~420 -> kbRemainingPx=min(168,128)=128 (voller
        // Travel-Cap = ~2 Tiles); light 250 -> ~100 px (~1 Tile).
        innerRadius: 100,
        outerRadius: 170,
        knockback: { peakForce, stunMs: 0, liftZ: 0 },
        ignoreEntityIds: attacker instanceof Unit ? new Set([String(attacker.id)]) : new Set<string>(),
      }),
    );
  }

  // --- Gebaeude (stationaere Verteidiger) --------------------------------

  private tickBuilding(b: Building, dt: number): void {
    if (b.attackCooldownMs > 0) b.attackCooldownMs -= dt;
    if (b.attackTarget && b.attackTarget.isDead) b.attackTarget = undefined;
    // FoW: ein in den Nebel entwichenes EINHEIT-Ziel auch fuer Gebaeude verlieren.
    if (
      b.attackTarget instanceof Unit &&
      !this.state.vision[b.owner].isVisible(b.attackTarget.col, b.attackTarget.row)
    ) {
      b.attackTarget = undefined;
    }
    if (!b.attackTarget) b.attackTarget = this.acquire(b, this.reichOf(b));
    if (!b.attackTarget) return;
    if (this.dist(b, b.attackTarget) <= this.reichOf(b)) {
      if (b.attackCooldownMs <= 0) this.attack(b, b.attackTarget);
    } else {
      b.attackTarget = undefined;
    }
  }

  // --- Angriff / Schaden / Tod ------------------------------------------

  /** Fernkampf: am Hit-Frame ein Geschoss abfeuern; der Schaden faellt erst beim
   *  Einschlag. Geschosstyp = KANON (Platzhalter: caster zielsuchend, sonst
   *  ballistisch). Cooldown wie beim Nahkampf aus angriffstempo. */
  private launchProjectile(attacker: Unit, target: Combatant): void {
    attacker.attackCooldownMs = 1000 / this.tempoOf(attacker);
    this.projectiles.launch({
      x: attacker.x,
      y: attacker.y - 14,
      target,
      schaden: this.schadenOf(attacker),
      faction: attacker.faction,
      homing: attacker.def.role === "caster",
      owner: attacker.owner, // Parasit-Drop-Empfaenger beim Einschlag-Kill
      // A1: Ursprung (Schuetzenmuendung) -> Spritzrichtung beim Einschlag; Schwere.
      ox: attacker.x,
      oy: attacker.y - 14,
      sev: this.hitSeverity(attacker),
    });
  }

  /** Geschoss-Einschlag an einer Einheit: Schaden ueber denselben Pfad wie der
   *  Nahkampf, gleicher Treffer-/Blut-Stempel (EVT_UNIT_HIT) und ggf. Tod. ax/ay
   *  = Schuetzenmuendung (Richtung), sev = Schwere (A1). */
  private resolveProjectileHit(
    target: Combatant,
    schaden: number,
    faction: FactionId,
    ax: number,
    ay: number,
    sev: HitSeverity,
    owner: Owner,
  ): void {
    if (target.isDead) return;
    const net = Math.max(1, schaden - this.ruestungOf(target));
    target.applyDamage(net);
    this.scene.events.emit(EVT_UNIT_HIT, { x: target.x, y: target.y, faction, ax, ay, sev });
    // Code7-2: Fernkampf-Einschlag stoesst das Ziel entlang der Flugrichtung
    // weg (origin an der Schuetzenmuendung ax/ay). Angreifer-id kennen wir hier
    // nicht (ProjectileSystem gibt sie nicht durch) -- ist ok, weil der Schuetze
    // typisch mehr als outerRadius entfernt steht.
    this.applyKnockback(undefined, target, sev, ax, ay);
    if (target.isDead) this.kill(target, faction, owner);
  }

  private attack(attacker: Combatant, target: Combatant): void {
    const net = Math.max(1, this.schadenOf(attacker) - this.ruestungOf(target));
    target.applyDamage(net);
    // A1: Treffer mit Angreiferrichtung (ax/ay) + Schwere (sev) anreichern.
    this.scene.events.emit(EVT_UNIT_HIT, {
      x: target.x, y: target.y, faction: attacker.faction,
      ax: attacker.x, ay: attacker.y, sev: this.hitSeverity(attacker),
    });
    attacker.attackCooldownMs = 1000 / this.tempoOf(attacker);
    // Code7-2: Nahkampf-Schlag stoesst target radial vom Angreifer weg.
    this.applyKnockback(attacker, target, this.hitSeverity(attacker), attacker.x, attacker.y);
    if (this.typOf(attacker) === "fern") {
      muzzleFlash(this.scene, attacker.x, attacker.y, attacker.faction);
      fireProjectileBeam(this.scene, attacker.x, attacker.y, target.x, target.y, attacker.faction);
      impactBurst(this.scene, target.x, target.y, attacker.faction);
    }
    if (target.isDead) this.kill(target, attacker.faction, attacker.owner);
  }

  /** Treffer-Schwere (A1): schwere Waffe/Einheit -> "heavy" (mehr Blut/Funken,
   *  laengerer Hit-Stop bei Code7), sonst "light". Aus dem role-Feld, kein neuer
   *  Stat. KANON-LUECKE: finale Zuordnung tariert Ticro. */
  private hitSeverity(attacker: Combatant): HitSeverity {
    if (attacker instanceof Unit) {
      const r = attacker.def.role;
      if (r === "heavy" || r === "siege") return "heavy";
    }
    return "light";
  }

  private kill(target: Combatant, killerFaction?: FactionId, killerOwner?: Owner): void {
    // Nur ein Darstellungs-Ereignis emittieren; die Kampflogik bleibt gleich:
    // die Einheit verlaesst den State sofort. Die Leiche lebt nur im Renderer.
    if (target instanceof Unit) {
      const snap = target.deathSnapshot();
      this.scene.events.emit(EVT_UNIT_DIED, snap);
      this.state.removeUnit(target);
      // MODERAT-Parasit-Drop (docs/DESTILLAT-SYSTEM.md): nur Einheiten-Tode, nur
      // wenn der Killer MODERAT ist, KEIN Friendly-Fire, und eine HELLMUTH-
      // Destille als Wirt EXISTIERT (live geprueft -> faellt die Destille, stoppt
      // der Drop sofort). Sim-Logik (deterministisch); EVT nur fuer Code4/Code5.
      if (
        killerFaction === "moderat" &&
        killerOwner &&
        killerFaction !== snap.faction &&
        this.state.hasHellmuthDestille()
      ) {
        const amount = DESTILLAT_DROP[snap.sev ?? "mass"];
        this.state.addResource(killerOwner, "destillat", amount);
        this.scene.events.emit(EVT_DESTILLAT_DROPPED, {
          x: snap.x,
          y: snap.y,
          amount,
          killerFaction,
        });
      }
    } else {
      // A2: angereicherter Gebaeude-Tod (Sprite-Beschreibung + Grundflaeche) ->
      // Code7 kann den Bau sichtbar zusammensacken lassen + Truemmer werfen.
      this.scene.events.emit(EVT_BUILDING_DIED, target.deathSnapshot());
      this.state.removeBuilding(target);
    }
  }

  // --- Zielsuche / Distanz ----------------------------------------------

  /**
   * Waehlt das Ziel nach Bedrohungspriorität (Kampfeinheit > schiessendes
   * Verteidigungsgebaeude > Sonstiges), innerhalb derselben Stufe das
   * naechstgelegene. Gilt fuer Auto-Acquire und Attack-Move.
   */
  private acquire(actor: Combatant, range: number): Combatant | undefined {
    return this.bestTarget(actor, range)?.e;
  }

  /** Bester Kandidat als ScoredTarget (inkl. e), fuer Acquire und Reacquire. */
  private bestTarget(
    actor: Combatant,
    range: number,
  ): (ScoredTarget & { e: Combatant }) | undefined {
    const current = actor instanceof Unit ? actor.attackTarget : undefined;
    const vision = this.state.vision[actor.owner];
    const candidates: (ScoredTarget & { e: Combatant })[] = [];
    const consider = (e: Combatant): void => {
      if (e.owner === actor.owner || e.isDead) return;
      // FoW-Praedikat VOR dist/Score: unsichtbare Feind-EINHEITEN werden nicht
      // erfasst (spart Scoring im Nebel). Gebaeude-Ziele bleiben ungefiltert
      // (Kanon-Luecke: einmal erkundete Statik bleibt anvisierbar).
      if (e instanceof Unit && !vision.isVisible(e.col, e.row)) return;
      const d = this.dist(actor, e);
      if (d > range) return;
      candidates.push({
        e,
        tier: this.priorityOf(e),
        dist: d,
        threat: this.threatOf(e),
        dps: this.dpsOf(e),
        focused: e === current,
      });
    };
    // Einheiten ueber das Gitter (die O(N^2)-Quelle); Gebaeude bleiben ein
    // voller Scan (wenige, mehrkachelig -> kein sicheres Punkt-Gitter).
    const us = this.state.unitGrid.queryRadius(actor.x, actor.y, this.rangeToPx(range), this.unitScratch);
    for (let i = 0; i < us.length; i++) consider(us[i]);
    for (const b of this.state.buildings) consider(b);
    return pickBestTarget(candidates);
  }

  /**
   * Wechselt das laufende Ziel, wenn in Reichweite ein Ziel STRIKT hoeherer
   * Prioritaet auftaucht (z. B. eine frische Kampfeinheit, waehrend gerade aufs
   * HQ geschossen wird). Gleichrangige Neuzugaenge loesen keinen Wechsel aus.
   */
  private maybeReacquire(u: Unit, range: number): void {
    if (!u.attackTarget) return;
    const cur = u.attackTarget;
    const currentScore = targetScore({
      tier: this.priorityOf(cur),
      dist: this.dist(u, cur),
      threat: this.threatOf(cur),
      dps: this.dpsOf(cur),
      focused: true, // aktuelles Ziel bekommt den Fokus-Bonus (Klebrigkeit)
    });
    const cand = this.bestTarget(u, range);
    if (cand && cand.e !== cur && shouldSwitchTarget(currentScore, targetScore(cand))) {
      u.attackTarget = cand.e;
    }
  }

  /** Prioritaetsstufe eines Ziels (niedriger = wichtiger), aus balance.ts. */
  private priorityOf(e: Combatant): number {
    if (e instanceof Unit) {
      return e.canAttack ? COMBAT.priority.combatUnit : COMBAT.priority.other;
    }
    return (e.def.schaden ?? 0) > 0 ? COMBAT.priority.defenseBuilding : COMBAT.priority.other;
  }

  private dist(a: Combatant, target: Combatant): number {
    if (target instanceof Building) {
      let best = Infinity;
      for (const t of target.footprintTiles()) {
        best = Math.min(best, Math.max(Math.abs(a.col - t.col), Math.abs(a.row - t.row)));
      }
      return best;
    }
    return Math.max(Math.abs(a.col - target.col), Math.abs(a.row - target.row));
  }

  private targetTile(actor: Combatant, target: Combatant): GridPoint {
    if (!(target instanceof Building)) return { col: target.col, row: target.row };
    let best: GridPoint = { col: target.col, row: target.row };
    let bestD = Infinity;
    for (const t of target.footprintTiles()) {
      const d = Math.max(Math.abs(actor.col - t.col), Math.abs(actor.row - t.row));
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  private farther(actor: Combatant, a: GridPoint, b: GridPoint): GridPoint {
    const da = Math.max(Math.abs(actor.col - a.col), Math.abs(actor.row - a.row));
    const db = Math.max(Math.abs(actor.col - b.col), Math.abs(actor.row - b.row));
    return da >= db ? a : b;
  }

  // --- Werte je Combatant ------------------------------------------------

  private schadenOf(e: Combatant): number {
    return e instanceof Unit ? e.def.schaden : e.def.schaden ?? 0;
  }
  private ruestungOf(e: Combatant): number {
    return e instanceof Unit ? e.def.ruestung : e.def.ruestung ?? 0;
  }
  private tempoOf(e: Combatant): number {
    return e instanceof Unit ? e.def.angriffstempo : e.def.angriffstempo ?? 1;
  }
  private reichOf(e: Combatant): number {
    return e instanceof Unit ? e.def.reichweite : e.def.reichweite ?? 1;
  }

  /** Bedrohungspriorität (Held/Sondereinheit > 0). Platzhalter-Gewichte
   *  (KANON-LUECKE: finale Werte legt Ticro fest). */
  private threatOf(e: Combatant): number {
    if (e instanceof Unit) {
      if (e.typeId === "hellmuth") return 3;
      const r = e.def.role;
      if (r === "caster" || r === "siege") return 2;
      if (r === "heavy" || r === "ranged") return 1;
    }
    return 0;
  }
  /** Schadensausstoss des Ziels (DPS-Beitrag) fuer die Zielgewichtung. */
  private dpsOf(e: Combatant): number {
    return this.tempoOf(e) * Math.max(1, this.schadenOf(e));
  }
  private typOf(e: Combatant): AngriffsTyp {
    return e instanceof Unit ? e.def.angriffstyp : e.def.angriffstyp ?? "nah";
  }

}
