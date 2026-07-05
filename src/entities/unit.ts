import Phaser from "phaser";
import { GridEntity } from "./entity";
import type { Building } from "./building";
import type { ResourceNode } from "./resource_node";
import { UNIT_DEPTH_OFFSET, PIXELS_PER_TILE } from "../util/world";
import { unitSpriteKey, unitDisplayWidth, unitAtlas } from "../data/sprites";
import type { UnitClip } from "../data/sprites";
import { VISION } from "../data/balance";
import { resolveMassTier } from "../systems/knockback";
import { UnitAnimator, MOVING_EPS } from "../util/unit_anim";
import type { DeathSnapshot, DeathTier } from "../systems/death_fx";
import type { UnitDef, FactionId, Owner } from "../data/loader";
import type { ScreenPoint, GridPoint } from "../util/iso";
import type { FlowField } from "../systems/flow_field";

// Zustaende des Sammel-Automaten eines Arbeiters.
export type GatherState = "to_node" | "harvest" | "to_depot" | "deposit";

export interface GatherJob {
  node: ResourceNode;
  state: GatherState;
  carry: number;
  timerMs: number;
  depot?: Building;
}

// Kampfhaltung. aggressiv: Gegner suchen und verfolgen. halten: nur in
// Reichweite angreifen, nicht verfolgen. patrouille: zwischen zwei Punkten
// pendeln, Gegner in Reichweite angreifen.
// Kampfhaltung als 2D-Matrix (TA-Stil): Bewegungszustand x Feuerzustand. Combat
// liest beide. moveState steuert Verfolgung, fireState die Zielerfassung.
export type MoveState = "halten" | "direkt" | "umherstreifen";
export type FireState = "feuerhalten" | "erwidern" | "frei";

// Ein verketteter Befehl (Umschalt-Queue). Gemischte Typen erlaubt.
export type Order =
  | { kind: "move"; x: number; y: number }
  | { kind: "attackMove"; x: number; y: number }
  | { kind: "gather"; node: ResourceNode }
  | { kind: "attack"; target: Unit | Building }
  | { kind: "build"; site: Building };

const SELECTION_COLOR = 0x66ff99;

// Weltpixel pro vollem Walk-Zyklus (Fussgleit-Kalibrierung, asset-spec/Fable).
// Tweakbar; ein voller Schrittzyklus deckt ~1,3 Kacheln Bodenstrecke ab.
const WALK_STRIDE_PX = 1.3 * PIXELS_PER_TILE;

// Fussanker im Atlas-Frame: die Render-Kamera zentriert den Koerper bei
// ortho_scale 2,7, die Fuesse liegen bei ~0,87 der Framehoehe. Origin dorthin
// -> die Einheit steht mit den Fuessen auf ihrem Tile (statt zu schweben).
// Sichtbar kalibrierbar; muss zur Render-ortho_scale passen.
const UNIT_FOOT_ANCHOR = 0.87;

const FACTION_COLOR: Record<FactionId, number> = {
  hellmuth: 0x8fd9b6,
  moderat: 0xd98f8f,
};

/**
 * Bewegliche Einheit auf dem Gitter. Datengetrieben aus units.json. Haelt
 * Bewegungspfad, Sammel-Job (Arbeiter) und Kampfzustand. Die Logik dazu liegt
 * in den Systemen; die Unit ist Daten- und Darstellungstraeger.
 */
export class Unit extends GridEntity {
  public readonly typeId: string;
  public readonly def: UnitDef;
  public readonly faction: FactionId;
  public readonly pop: number;
  public readonly tempo: number;

  /** Sichtradius in Kacheln (FoW). Datenwert oder Kanon-Default. Erfuellt den
   *  VisionSource-Vertrag fuer das Sichtgitter (Paket A). */
  public get sicht(): number {
    return this.def.sicht ?? VISION.defaultSicht;
  }

  public selected = false;

  /** Verbleibende Welt-Wegpunkte. Leer = steht still. */
  public path: ScreenPoint[] = [];

  /** Gesetzt -> Einheit folgt dem gemeinsamen Flussfeld (Schwarm) in O(1) statt
   *  eigenem A*-Pfad. Der Pfad hat Vorrang; das Flussfeld ist der Fallback. */
  public flowField?: FlowField;

  /** Frames in Folge ohne echten Fortschritt trotz Bewegungswunsch (Strang 2,
   *  Deadlock-Erkennung). */
  public stuckFrames = 0;

  /** Teil der feld-getriebenen MODERAT-Masse (Strang 4): folgt dem Flussfeld
   *  zum Spieler-HQ statt eigenem A*. Parallel zu movingByCommand. */
  public swarmDriven = false;

  /** Aktiver Sammel-Job, nur bei Arbeitern gesetzt. */
  public gather?: GatherJob;

  /** Zugewiesene Baustelle, nur bei Arbeitern gesetzt. */
  public buildTarget?: Building;

  /** Zu reparierendes eigenes Gebaeude, nur bei Arbeitern gesetzt. */
  public repairTarget?: Building;

  // --- Kampf (2D-Haltung) ---
  public moveState: MoveState = "direkt";
  public fireState: FireState = "frei";
  public attackTarget?: Unit | Building;
  public attackCooldownMs = 0;
  /** Restzeit bis zur naechsten Ziel-Re-Evaluierung (Prioritaetswechsel). */
  public reevalMs = 0;
  /** Attack-Move-Ziel in Weltkoordinaten (laeuft hin, greift unterwegs an). */
  public attackMove?: ScreenPoint;
  /** Expliziter Move aktiv: Auto-Zielerfassung aus, bis das Ziel erreicht ist.
   * Erlaubt das Loesen aus dem Kampf (Rueckzug). Attack-Move setzt dies NICHT. */
  public movingByCommand = false;
  public patrolA?: GridPoint;
  public patrolB?: GridPoint;
  /** Letztes Bewegungsziel (fuer das Setzen einer Patrouille). */
  public lastMoveDest?: GridPoint;

  /** Verkettete Befehle (mit gehaltener Umschalttaste angehaengt). */
  public orders: Order[] = [];

  // --- Knockback (Code7-2, docs/PHYSIK-KNOCKBACK.md §10). Erfuellt den
  // KbBody-Vertrag (src/systems/knockback/knockback_system.ts) direkt auf der
  // Unit -- so kann gameState.unitGrid ohne Adapter an knockback.update()
  // durchgereicht werden. Die statischen Felder (massTier, massScale, kbResist)
  // kommen aus der Rolle/Def; die Runtime-Felder verwaltet KnockbackSystem.
  public massTier!: import("../systems/knockback").MassTier;
  public massScale?: number;
  public kbResist?: number;
  public anchored?: boolean;
  public ghosted?: boolean;
  public kbVelX = 0;
  public kbVelY = 0;
  public kbRemainingPx = 0;
  public staggerMs = 0;
  /** Aktiver Knockback-Flug (ms). >0 -> unit.updateAnimation waehlt einen
   *  reaktiven Clip statt walk/idle (Naht analog zu hitStopMs). */
  public knockbackMs = 0;

  // --- Darstellung (Mehr-Clip-Atlas) ---
  private anim?: UnitAnimator;
  private walkSprite?: Phaser.GameObjects.Sprite;
  private prevX = 0;
  private prevY = 0;

  constructor(
    scene: Phaser.Scene,
    typeId: string,
    def: UnitDef,
    col: number,
    row: number,
    owner: Owner,
  ) {
    super(scene, col, row, def.name, def.hp, owner);
    this.typeId = typeId;
    this.def = def;
    this.faction = def.faction;
    this.pop = def.pop;
    this.tempo = def.tempo;
    // Massen-Tier per Default aus der Rolle (Code7-2, §4.2 der Knockback-Spec).
    // Rolle -> Tier: worker/flyer=featherweight, caster/ranged/melee=medium,
    // heavy=heavy, siege=bulwark. resolveMassTier greift auf die Rolle zurueck.
    this.massTier = resolveMassTier(this.def.role);

    // Darstellung in Vorrangordnung:
    // 1) direktionaler Walk-Atlas (animiert), 2) statisches Einzel-PNG,
    // 3) gezeichnetes Platzhalter-Oval. Anker jeweils unten-mitte.
    const atlas = unitAtlas(typeId);
    const dispW = unitDisplayWidth(typeId);
    // Schatten-Blob unter der Einheit (eingebackenes Licht von oben-links, kein
    // dynamischer Schatten). Als erstes Kind hinter Koerper/Sprite, flach (iso).
    const shadow = scene.add.ellipse(
      0,
      1,
      Math.max(14, dispW * 0.3),
      Math.max(6, dispW * 0.13),
      0x000000,
      0.26,
    );
    this.add(shadow);
    if (atlas && scene.textures.exists(atlas.key)) {
      const spr = scene.add
        .sprite(0, 0, atlas.key, `${atlas.stem}_idle_000_00`)
        .setOrigin(0.5, UNIT_FOOT_ANCHOR);
      spr.setScale(dispW / (spr.width || dispW));
      this.add(spr);
      this.walkSprite = spr;
      this.anim = new UnitAnimator(spr, atlas, WALK_STRIDE_PX);
    } else if (!this.makeBody(unitSpriteKey(typeId), dispW)) {
      const body = scene.add
        .ellipse(0, -14, 18, 26, FACTION_COLOR[def.faction])
        .setStrokeStyle(2, 0x14110a, 0.9);
      this.add(body);
    }

    this.addLabel(def.name, -30);
    this.addHealthBar(-34, 26);

    // Einheiten liegen immer ueber Gebaeuden (eigener Tiefen-Layer).
    this.depthOffset = UNIT_DEPTH_OFFSET;
    this.setDepth(this.depthOffset + this.y);
    this.prevX = this.x;
    this.prevY = this.y;
  }

  /**
   * Pro-Frame-Darstellungsupdate (nach dem Bewegungssystem aufrufen). Koppelt
   * die Walk-Abspielrate an die tatsaechlich zurueckgelegte Strecke (Fussgleit-
   * Fix) und waehlt die Blickrichtung aus dem Bewegungsvektor. No-op fuer
   * Einheiten ohne Walk-Atlas.
   */
  public updateAnimation(dtMs?: number): void {
    if (!this.anim) return;
    const dx = this.x - this.prevX;
    const dy = this.y - this.prevY;
    this.prevX = this.x;
    this.prevY = this.y;
    const dt = dtMs ?? this.scene.game.loop.delta;
    // FX-Hit-Stop (Physik A5, von Code7 getrieben): das Akteur-Sprite kurz
    // einfrieren -> der Frame haelt. LOKAL, kein globaler timeScale; die Sim
    // laeuft unberuehrt weiter (updateAnimation ist reiner Render-Pfad).
    if (this.hitStopMs > 0) {
      this.hitStopMs -= dt;
      return;
    }
    // Aktiver Knockback: dieselbe Naht wie hitStop, aber wir halten den Sprite
    // nicht fest -- die Position wandert per Sim (knockback_system schiebt x/y);
    // wir zwingen nur den Walk-Clip als Fallback, bis ein knockback_*-Frame im
    // Atlas landet (Doku §9). Der knockbackMs-Zaehler laeuft im
    // KnockbackSystem.integrate mit; wir schreiben ihn nicht.

    // Gewuenschten Clip aus dem Einheitenzustand ableiten (nicht vom HUD):
    // sammeln > laufen > kaempfen > stehen. Tod laeuft im FX-Layer (Kill-Pfad).
    let clip: UnitClip = "idle";
    let faceX = 0;
    let faceY = 0;
    if (this.knockbackMs > 0) {
      // Knockback-Flug: der walk-Clip ist der beste vorhandene Ersatz, weil er
      // schon eine Bewegung zeigt. Sobald knockback_light/heavy/landing im
      // Atlas landen (Doku §9), wird das hier zu clip = "knockback".
      clip = "walk";
    } else if (this.gather?.state === "harvest") {
      clip = "harvest";
    } else if (dx * dx + dy * dy > MOVING_EPS * MOVING_EPS) {
      clip = "walk";
    } else if (this.attackTarget) {
      clip = "attack";
      faceX = this.attackTarget.x - this.x; // im Stand zum Ziel blicken
      faceY = this.attackTarget.y - this.y;
    }
    this.anim.update(dx, dy, clip, dt, faceX, faceY);
  }

  /** Verbleibende Hit-Stop-Zeit (ms). Reine Darstellung, nie Sim-relevant. */
  private hitStopMs = 0;

  /** FX-Hook (Physik A5): friert das Akteur-Sprite fuer `ms` ein (Hit-Stop).
   *  LOKAL pro Sprite, KEIN globaler timeScale; die 30-Hz-Sim laeuft weiter.
   *  Code7 ruft das in der Impact-Choreografie (gestaffelt 0/40/100 ms). */
  public hitStop(ms: number): void {
    if (ms > this.hitStopMs) this.hitStopMs = ms;
  }

  /**
   * Momentaufnahme fuer das Leichen-Sprite (reine Darstellung). Friert den
   * zuletzt gezeigten Walk-Frame und die Position ein. Wird im Kill-Pfad
   * emittiert, nicht von der Einheit selbst genutzt.
   */
  public deathSnapshot(): DeathSnapshot {
    const s: DeathSnapshot = { x: this.x, y: this.y, faction: this.faction, unitType: this.typeId, sev: this.deathTier() };
    if (this.walkSprite) {
      s.key = this.walkSprite.texture.key;
      s.frame = this.anim?.currentFrame();
      s.sx = this.walkSprite.scaleX;
      s.sy = this.walkSprite.scaleY;
    }
    // Death-Clip-Infos fuer den FX-Layer: er spielt die Todesanimation einmal
    // ab und laesst dann die Leiche liegen (siehe death_fx.ts).
    const atlas = unitAtlas(this.typeId);
    if (atlas && this.anim) {
      s.deathStem = atlas.stem;
      s.deathDeg = this.anim.deg();
      s.originY = UNIT_FOOT_ANCHOR;
    }
    return s;
  }

  /** Tod-Tiering (Physik A2) aus dem role-Feld, kein neuer Stat: Held -> hero,
   *  Arbeiter/Flieger (leichte Masse/Schwarm) -> mass, sonst (teuer/stark) ->
   *  strong. KANON-LUECKE: die feine Schwarm-vs-stark-Grenze tariert Ticro. */
  private deathTier(): DeathTier {
    if (this.typeId === "hellmuth") return "hero";
    const r = this.def.role;
    return r === "worker" || r === "flyer" ? "mass" : "strong";
  }

  public get isWorker(): boolean {
    return this.def.role === "worker";
  }

  public get canAttack(): boolean {
    return this.def.schaden > 0;
  }

  /** Hat diese Einheit einen Attack-Clip (Hit-Frame-Sync)? Sonst Cooldown-Tick. */
  public attackHasHitFrame(): boolean {
    return !!this.anim && this.anim.has("attack");
  }

  /** Meldet der Animator gerade den Treffer-Frame? (Combat bucht dann Schaden.) */
  public attackHitReady(): boolean {
    return this.anim?.attackHitFired() ?? false;
  }

  /** Aktueller Atlas-Frame-Schluessel (Diagnose: Hit-Stop-Freeze belegen). */
  public currentFrame(): string | undefined {
    return this.anim?.currentFrame();
  }
  /** Aktueller Clip-Name (Diagnose: Attack-Clip/Wind-up belegen). */
  public currentClip(): string | undefined {
    return this.anim?.currentClip();
  }

  public get moving(): boolean {
    // Flussfeld-Einheiten haben keinen Pfad, bewegen sich aber -> als bewegt
    // melden, damit der Kampf sie nicht einzeln neu bepfadet (Repath-Sturm).
    return this.path.length > 0 || this.flowField !== undefined;
  }

  public setSelected(on: boolean): void {
    this.selected = on;
    this.setHighlight(on, SELECTION_COLOR);
  }

  /** Bricht Bewegung, Sammel-Job, Bauauftrag, Reparatur und Angriff(-Move) ab. */
  public stopAll(): void {
    this.path = [];
    this.gather = undefined;
    this.buildTarget = undefined;
    this.repairTarget = undefined;
    this.attackTarget = undefined;
    this.attackMove = undefined;
    this.movingByCommand = false;
    this.orders = [];
  }
}
