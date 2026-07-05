// KNOCKBACK-SYSTEM (Solutions §3 Algorithmus, HELLMUTH-konform adaptiert).
//
// Eigene Lightweight-Impuls-Schicht, NICHT Matter.js (Solutions §1: Matter ist
// Maintenance-Mode, nicht cross-browser-deterministisch, 87 KB). Hier ~120 Zeilen
// Vektor-Math. HELLMUTH hat KEINE Phaser-Physics-Bodies: das System schreibt die
// Welt-Position direkt (setWorld bzw. x/y), exakt wie der eigene 30-Hz-Sim.
//
// DETERMINISMUS (harte Leitplanke): kein `Math.random`. Der Trenn-Jitter fuer
// gestackte Einheiten kommt aus der stabilen Unit-`id` (goldener Winkel, wie
// movement_system.avoidance) -> bit-identisch reproduzierbar ueber Laeufe und
// Maschinen. Fixe Iterationsreihenfolge. Damit bleibt Lockstep-RTS eine Option,
// ohne dass jetzt Multiplayer-Code liegt (Solutions §12.2).

import { SpatialGrid } from "../spatial_grid";
import { MASS_TABLE, type MassTier } from "./mass_table";
import { falloff } from "./falloff";
import type { ExplosionSpec, Vec2 } from "./explosion_spec";

/** Minimaler Vertrag eines knockbar-baren Koerpers. Demo-Bodies UND echte Units
 *  (entity.ts: id, x, y, setWorld) erfuellen das; das System koppelt NICHT an
 *  gameState/combat. Die kb*-Felder verwaltet das System. */
export interface KbBody {
  readonly id: number;
  x: number;
  y: number;
  massTier: MassTier;
  massScale?: number;
  /** 0..1 Knockback-Resistenz (Anti-Pattern: Elites resistent, nicht immun). */
  kbResist?: number;
  /** Status `Anchored`: temporaer kbMult->0 (Early-Return), bricht NICHT Pathfinding. */
  anchored?: boolean;
  /** Status `Ghost/phasing`: immun gegen Knockback. */
  ghosted?: boolean;
  // --- vom System verwalteter Laufzeit-Zustand ---
  kbVelX: number;
  kbVelY: number;
  kbRemainingPx: number;
  staggerMs: number;
  /** Anim-Zaehler (analog unit.hitStopMs): >0 => Knockback-Clip/Fallback. */
  knockbackMs: number;
  /** Optional: HELLMUTH-Units setzen Position + Tiefe ueber setWorld. */
  setWorld?(x: number, y: number): void;
}

export interface KbTuning {
  force: number;
  decayPerFrame60: number;
  maxTravelPx: number;
  decayTravelFactor: number;
  staggerMinMs: number;
  staggerMaxMs: number;
  staggerScalePerImpulse: number;
  edgeEpsilon: number;
}

/** Default-Tuning (Solutions §3.4). Per game/data/knockback_config.json
 *  uebersteuerbar; das JSON-Schema validiert das (Hebel H16). */
export const DEFAULT_TUNING: KbTuning = {
  force: 350,
  decayPerFrame60: 0.88,
  maxTravelPx: 128,
  decayTravelFactor: 0.4,
  staggerMinMs: 150,
  staggerMaxMs: 600,
  staggerScalePerImpulse: 0.8,
  edgeEpsilon: 0.001,
};

const GOLDEN = 2.399963229728653; // goldener Winkel (rad) -- id-Jitter, kein RNG
const STACK_BOOST = 0.3; // schwaecherer Folge-Hit gibt 30 % dazu (Solutions §3.1)

interface PendingBlast {
  spec: ExplosionSpec;
  ageMs: number;
  firedStages: boolean[];
  firedBase: boolean;
  nextTickMs: number;
}

export interface BlastDebug {
  x: number;
  y: number;
  radius: number;
  age: number;
}

export class KnockbackSystem {
  private readonly tuning: KbTuning;
  private readonly pending: PendingBlast[] = [];
  /** Kurze Liste juengster Explosionen, nur fuer das Debug-Overlay. */
  readonly recentBlasts: BlastDebug[] = [];
  private readonly scratch: KbBody[] = [];

  constructor(tuning: Partial<KbTuning> = {}) {
    this.tuning = { ...DEFAULT_TUNING, ...tuning };
  }

  /** Loest eine Explosion aus. delayMs/stages/durationMs werden im `update`
   *  zeitgesteuert abgearbeitet (deterministisch, headless-testbar -- KEIN
   *  scene.time.delayedCall). bodies + optional ein SpatialGrid fuer die Query. */
  explode(spec: ExplosionSpec): void {
    this.pending.push({
      spec,
      ageMs: 0,
      firedStages: spec.stages.map(() => false),
      firedBase: false,
      nextTickMs: spec.delayMs,
    });
  }

  /**
   * Pro Sim-Schritt: pending Explosionen abarbeiten (Fuse/Stages/persistente
   * Ticks) und die fliegenden Koerper integrieren. `grid` ist optional; ohne
   * Grid faellt es auf eine naive O(N)-Distanzpruefung zurueck (bei N<100 < 1 ms,
   * Solutions §1).
   */
  update(dtMs: number, bodies: readonly KbBody[], grid?: SpatialGrid<KbBody>): void {
    this.resolvePending(dtMs, bodies, grid);
    this.integrate(dtMs, bodies);
    this.ageDebug(dtMs);
  }

  // --- Explosions-Lifecycle (Solutions §5.2) ---------------------------------

  private resolvePending(dtMs: number, bodies: readonly KbBody[], grid?: SpatialGrid<KbBody>): void {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      p.ageMs += dtMs;
      const s = p.spec;
      // Fuse: erst nach delayMs wirkt die Basis-Welle.
      if (!p.firedBase && p.ageMs >= s.delayMs) {
        this.resolveBlast(s, s.origin, bodies, grid);
        p.firedBase = true;
        p.nextTickMs = s.delayMs + Math.max(1, s.tickIntervalMs);
      }
      // Mehrstufig: jede Stage relativ zum Fuse-Ende.
      for (let k = 0; k < s.stages.length; k++) {
        if (p.firedStages[k]) continue;
        const st = s.stages[k];
        if (p.ageMs >= s.delayMs + st.offsetMs) {
          const o: Vec2 = { x: s.origin.x + st.offsetOrigin.x, y: s.origin.y + st.offsetOrigin.y };
          const merged: ExplosionSpec = { ...s, ...st.inheritSpec, origin: o };
          this.resolveBlast(merged, o, bodies, grid);
          p.firedStages[k] = true;
        }
      }
      // Persistent: solange durationMs laeuft, alle tickIntervalMs erneut wirken.
      if (p.firedBase && s.durationMs > 0 && s.tickIntervalMs > 0) {
        while (p.ageMs >= p.nextTickMs && p.nextTickMs <= s.delayMs + s.durationMs) {
          this.resolveBlast(s, s.origin, bodies, grid);
          p.nextTickMs += s.tickIntervalMs;
        }
      }
      // Fertig: Basis + alle Stages + Duration abgelaufen.
      const stagesDone = p.firedStages.every(Boolean);
      const durDone = s.durationMs <= 0 || p.ageMs >= s.delayMs + s.durationMs;
      if (p.firedBase && stagesDone && durDone) {
        this.pending[i] = this.pending[this.pending.length - 1];
        this.pending.pop();
      }
    }
  }

  private resolveBlast(spec: ExplosionSpec, origin: Vec2, bodies: readonly KbBody[], grid?: SpatialGrid<KbBody>): void {
    if (!spec.knockback) return; // reiner DoT-Pool: kein Knockback
    const force = spec.knockback.peakForce;
    const cand = grid ? grid.queryRadius(origin.x, origin.y, spec.outerRadius, this.scratch) : bodies;
    for (const b of cand) {
      if (spec.ignoreEntityIds.size && spec.ignoreEntityIds.has(String(b.id))) continue;
      this.applyImpulse(b, origin, force, spec.innerRadius, spec.outerRadius, spec.falloff);
    }
    this.recentBlasts.push({ x: origin.x, y: origin.y, radius: spec.outerRadius, age: 0 });
  }

  // --- Kern-Formel (Solutions §3.1), id-Jitter statt Math.random -------------

  private applyImpulse(
    b: KbBody,
    origin: Vec2,
    force: number,
    innerR: number,
    outerR: number,
    shape: ExplosionSpec["falloff"],
  ): void {
    const tier = MASS_TABLE[b.massTier];
    if (tier.isStatic || tier.kbMult === 0 || b.anchored || b.ghosted) return;

    const dx = b.x - origin.x;
    const dy = b.y - origin.y;
    const d = Math.hypot(dx, dy);
    // Ghost-Hit-Schutz: weicher Rand mit Float-Epsilon (Anti-Pattern, Solutions C).
    if (d > outerR + this.tuning.edgeEpsilon) return;
    const f = falloff(shape, d, outerR, innerR);
    if (f <= 0) return;

    // Trenn-Jitter aus der stabilen id (±5°), deterministisch statt Math.random.
    const jitter = (((b.id * GOLDEN) % 1) - 0.5) * 0.087;
    let nx: number;
    let ny: number;
    if (d < 1) {
      nx = Math.cos(jitter);
      ny = Math.sin(jitter);
    } else {
      const c = Math.cos(jitter);
      const s = Math.sin(jitter);
      const ux = dx / d;
      const uy = dy / d;
      nx = ux * c - uy * s;
      ny = ux * s + uy * c;
    }

    const massEff = tier.mass * (b.massScale ?? 1);
    const resist = 1 - Math.min(1, Math.max(0, b.kbResist ?? 0));
    // sqrt(mass)-Daempfung + Tier-Mult + Resist. immovable/bulwark sind oben schon
    // abgefangen bzw. via kbMult fast 0.
    const impulse = (force * f * tier.kbMult * resist) / Math.sqrt(massEff);
    if (impulse <= 0) return;

    // Stacking: Take-Max, schwaecherer Folge-Hit gibt 30 % dazu (Solutions §3.1).
    const newVx = nx * impulse;
    const newVy = ny * impulse;
    const curMag = Math.hypot(b.kbVelX, b.kbVelY);
    if (impulse >= curMag) {
      b.kbVelX = newVx;
      b.kbVelY = newVy;
    } else {
      b.kbVelX += newVx * STACK_BOOST;
      b.kbVelY += newVy * STACK_BOOST;
    }

    // Travel-Cap auf maxTravelPx (RTS-Lesbarkeit).
    const projected = impulse * this.tuning.decayTravelFactor;
    b.kbRemainingPx = Math.min(projected, this.tuning.maxTravelPx);

    // Stagger-Fenster, skaliert mit Impuls (Solutions §3.1).
    b.staggerMs = Math.min(
      this.tuning.staggerMaxMs,
      Math.max(this.tuning.staggerMinMs, this.tuning.staggerMinMs + impulse * this.tuning.staggerScalePerImpulse),
    );
    if (b.staggerMs > b.knockbackMs) b.knockbackMs = b.staggerMs;
  }

  // --- Integration / Tick-Decay (Solutions §3.2) -----------------------------

  private integrate(dtMs: number, bodies: readonly KbBody[]): void {
    const decay = Math.pow(this.tuning.decayPerFrame60, (dtMs / 1000) * 60); // framerate-unabhaengig
    const s = dtMs / 1000;
    for (const b of bodies) {
      if (b.knockbackMs > 0) b.knockbackMs = Math.max(0, b.knockbackMs - dtMs);
      const mag = Math.hypot(b.kbVelX, b.kbVelY);
      if (mag < 1 || b.kbRemainingPx <= 0) {
        b.kbVelX = 0;
        b.kbVelY = 0;
        continue;
      }
      let stepX = b.kbVelX * s;
      let stepY = b.kbVelY * s;
      const stepLen = Math.hypot(stepX, stepY);
      if (stepLen > b.kbRemainingPx) {
        const k = b.kbRemainingPx / stepLen;
        stepX *= k;
        stepY *= k;
      }
      const nx = b.x + stepX;
      const ny = b.y + stepY;
      if (b.setWorld) b.setWorld(nx, ny);
      else {
        b.x = nx;
        b.y = ny;
      }
      b.kbRemainingPx -= Math.hypot(stepX, stepY);
      b.kbVelX *= decay;
      b.kbVelY *= decay;
    }
  }

  private ageDebug(dtMs: number): void {
    for (let i = this.recentBlasts.length - 1; i >= 0; i--) {
      this.recentBlasts[i].age += dtMs;
      if (this.recentBlasts[i].age > 600) {
        this.recentBlasts[i] = this.recentBlasts[this.recentBlasts.length - 1];
        this.recentBlasts.pop();
      }
    }
  }

  /** Diagnose (Bench/Smoke). */
  activeBlasts(): number {
    return this.pending.length;
  }
}

/** Setzt die Knockback-Laufzeitfelder auf einem rohen Objekt (Demo/Test-Helfer). */
export function initKbState<T extends Partial<KbBody>>(b: T): T & {
  kbVelX: number;
  kbVelY: number;
  kbRemainingPx: number;
  staggerMs: number;
  knockbackMs: number;
} {
  return Object.assign(b, { kbVelX: 0, kbVelY: 0, kbRemainingPx: 0, staggerMs: 0, knockbackMs: 0 });
}
