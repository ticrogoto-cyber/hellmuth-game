import { PIXELS_PER_TILE } from "../util/world";
import { getTracerFx, type TracerFx, type TracerPair } from "../fx/tracer_fx";
import type { GameState } from "./game_state";
import type { Unit } from "../entities/unit";
import type { Building } from "../entities/building";
import type { FactionId, Owner } from "../data/loader";
import type { HitSeverity } from "./death_fx";

// Gepooltes Geschoss-System fuer Fernkampf. Teilt den Timing-Vertrag des
// Nahkampfs (Abschuss am Hit-Frame, sonst Cooldown-Tick) und nutzt den
// Spatial-Hash (P1) fuer die Trefferpruefung. Determinismus: reine Mathematik,
// KEINE ungesaete RNG (gleiche Disziplin wie P1). Keine Allokation pro Schuss
// (Pool wie die Leichen-/FX-Pools); Budget-Kappe gegen Geschoss-Schwemme.
//
// MECHANIK-HUELLE: Geschosstempo, Trefferradius, Lebenszeit, Budget und welche
// Einheiten ueberhaupt Fernkaempfer sind = KANON (Platzhalter, Ticro).

type Combatant = Unit | Building;

const MAX_LIVE = 256; // Budget-Kappe (analog Truemmer-Kappe). PLATZHALTER.
const HIT_RADIUS = 16; // Trefferradius in Weltpixeln. PLATZHALTER.
const MAX_LIFE_MS = 4000; // Selbstzerstoerung gegen Geister-Geschosse.
const DEFAULT_SPEED_PX = 9 * PIXELS_PER_TILE; // Geschosstempo (px/s). PLATZHALTER.
const BODY_OFFSET_Y = -14; // Zielhoehe (Koerpermitte), wie der alte Tracer.

interface Projectile {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  gx: number; // Zielpunkt (ballistisch fix bei Abschuss)
  gy: number;
  ox: number; // Ursprung (Schuetzenmuendung) -> Spritzrichtung beim Einschlag (A1)
  oy: number;
  target?: Combatant; // zielsuchend: lebendes Ziel
  homing: boolean;
  speed: number;
  schaden: number;
  faction: FactionId;
  owner: Owner; // Schuetzen-Besitzer -> Parasit-Drop-Empfaenger (Destillat)
  sev: HitSeverity; // Treffer-Schwere (A1)
  lifeMs: number;
  // Tracer-Paar (Gefechts-VFX Paket 2): ersetzt den frueheren Vektor-Arc
  // (Graphics-Pipeline = Batch-Breaker). Optional: bei Paar-Knappheit kann
  // TracerFx das aelteste Paar stehlen; visSeq erkennt den Diebstahl.
  vis?: TracerPair;
  visSeq: number;
}

export interface LaunchOpts {
  x: number;
  y: number;
  target: Combatant;
  schaden: number;
  faction: FactionId;
  /** Schuetzen-Besitzer (Parasit-Drop-Empfaenger). */
  owner: Owner;
  homing?: boolean; // (b) zielsuchend; sonst (a) ballistisch/gerade
  speed?: number;
  /** Ursprung (Schuetzenmuendung) -> Spritzrichtung beim Einschlag (A1). */
  ox?: number;
  oy?: number;
  /** Treffer-Schwere (A1). Default light. */
  sev?: HitSeverity;
}

export class ProjectileSystem {
  private readonly pool: Projectile[] = [];
  private readonly scratch: Unit[] = []; // Hash-Abfragepuffer (gegen GC)
  private tracerRef?: TracerFx; // lazy: FX-Kit erst beim ersten Schuss baken

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly state: GameState,
    /** Aufloesung des Treffers ueber den vorhandenen Kampf-Schadenspfad. */
    private readonly onImpact: (
      target: Combatant,
      schaden: number,
      faction: FactionId,
      ax: number,
      ay: number,
      sev: HitSeverity,
      owner: Owner,
    ) => void,
  ) {}

  /** Schuss am Hit-Frame des Schuetzen. Keine Allokation, wenn der Pool reicht;
   *  bei voller Budget-Kappe faellt der Schuss aus (statt zu allozieren). */
  launch(o: LaunchOpts): void {
    const p = this.obtain();
    if (!p) return; // Budget voll -> Schuss verworfen (Kappe)
    p.active = true;
    p.x = o.x;
    p.y = o.y;
    p.target = o.target;
    p.gx = o.target.x;
    p.gy = o.target.y + BODY_OFFSET_Y;
    p.ox = o.ox ?? o.x;
    p.oy = o.oy ?? o.y;
    p.homing = !!o.homing;
    p.speed = o.speed ?? DEFAULT_SPEED_PX;
    p.schaden = o.schaden;
    p.faction = o.faction;
    p.owner = o.owner;
    p.sev = o.sev ?? "light";
    p.lifeMs = MAX_LIFE_MS;
    const dx = p.gx - p.x;
    const dy = p.gy - p.y;
    const d = Math.hypot(dx, dy) || 1;
    p.vx = (dx / d) * p.speed;
    p.vy = (dy / d) * p.speed;
    // Gold-/Magenta-Tracer (Paket 2): Paar binden und entlang des Flugvektors
    // ausrichten. Farbwahl (Palette) uebernimmt TracerFx.acquire.
    p.vis = this.tracer().acquire(o.faction);
    p.visSeq = p.vis.seq;
    this.tracer().place(p.vis, p.x, p.y, p.vx, p.vy, p.speed);
  }

  update(deltaMs: number): void {
    const dt = deltaMs / 1000;
    for (const p of this.pool) {
      if (!p.active) continue;
      p.lifeMs -= deltaMs;
      // (b) zielsuchend: Richtung aufs lebende Ziel nachfuehren.
      if (p.homing && p.target && !p.target.isDead) {
        const dx = p.target.x - p.x;
        const dy = p.target.y + BODY_OFFSET_Y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        p.vx = (dx / d) * p.speed;
        p.vy = (dy / d) * p.speed;
        p.gx = p.target.x;
        p.gy = p.target.y + BODY_OFFSET_Y;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // Tracer folgt dem Sim-Zustand; gestohlene Paare (steal-oldest) loesen.
      if (p.vis && p.vis.seq !== p.visSeq) p.vis = undefined;
      if (p.vis) this.tracer().place(p.vis, p.x, p.y, p.vx, p.vy, p.speed);

      const hit = this.checkHit(p);
      if (hit) {
        this.onImpact(hit, p.schaden, p.faction, p.ox, p.oy, p.sev, p.owner);
        this.release(p);
        continue;
      }
      // Zielpunkt erreicht (ballistisch -> evtl. Fehlschuss, wenn das Ziel
      // auswich) oder Lebenszeit aus -> Ende. Quadrierter Vergleich: bit-
      // identischer Boolean ggu Math.hypot(dx,dy)<=R, kein sqrt im Hotpfad.
      const dxg = p.gx - p.x;
      const dyg = p.gy - p.y;
      if (p.lifeMs <= 0 || dxg * dxg + dyg * dyg <= HIT_RADIUS * HIT_RADIUS) {
        this.release(p);
      }
    }
  }

  /** Treffer ueber den Spatial-Hash (Bucket des Geschosses), kein Vollscan.
   * Distanz-Mathematik in d² (quadrierter Schwellenwert HIT_RADIUS²): kein
   * sqrt im Hot-Pfad, bit-identische Argmin-Reihenfolge gegenueber Math.hypot,
   * da `d <= bestD <=> d² <= bestD²` fuer d,bestD >= 0. */
  private checkHit(p: Projectile): Combatant | undefined {
    const R2 = HIT_RADIUS * HIT_RADIUS;
    if (p.homing && p.target && !p.target.isDead) {
      const dxh = p.target.x - p.x;
      const dyh = p.target.y + BODY_OFFSET_Y - p.y;
      return dxh * dxh + dyh * dyh <= R2 ? p.target : undefined;
    }
    const cands = this.state.unitGrid.queryRadius(p.x, p.y, HIT_RADIUS, this.scratch);
    let best: Unit | undefined;
    let bestD2 = R2;
    for (const u of cands) {
      if (u.faction === p.faction || u.isDead) continue;
      const dx = u.x - p.x;
      const dy = u.y + BODY_OFFSET_Y - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= bestD2) {
        bestD2 = d2;
        best = u;
      }
    }
    return best;
  }

  private tracer(): TracerFx {
    // Lazy statt im Konstruktor: die Scene steht beim System-Bau noch im
    // create()-Aufbau; der erste Schuss kommt sicher danach.
    if (!this.tracerRef) this.tracerRef = getTracerFx(this.scene);
    return this.tracerRef;
  }

  private obtain(): Projectile | undefined {
    for (const p of this.pool) if (!p.active) return p;
    if (this.pool.length >= MAX_LIVE) return undefined;
    const p: Projectile = {
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      gx: 0,
      gy: 0,
      ox: 0,
      oy: 0,
      homing: false,
      speed: 0,
      schaden: 0,
      faction: "hellmuth",
      owner: "spieler",
      sev: "light",
      lifeMs: 0,
      visSeq: 0,
    };
    this.pool.push(p);
    return p;
  }

  private release(p: Projectile): void {
    p.active = false;
    p.target = undefined;
    if (p.vis && p.vis.seq === p.visSeq) this.tracer().release(p.vis);
    p.vis = undefined;
  }
}
