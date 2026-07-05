import Phaser from "phaser";
import { FX_AIR_ADD_DEPTH } from "../util/world";
import type { ResourceId } from "../data/loader";

// Effekt-Layer (Blueprint §5.3 / ASSET-PROMPTS-KREA-V2 §7, Red-Alert-3-Prinzip).
// Eine Explosion ist ein Stapel billiger Bausteine, komponiert in Code. Hier:
//   - prozedurale Primitive (Glow-Kerne, Schockwellenring, weicher Funkenpunkt,
//     Rauchpuff) als Phaser-Texturen, pro Fraktion ueber Tint einfaerbbar
//   - additive Flash-/Shockwave-Helfer + Fake-Licht (Bloom liefert die Helligkeit)
//   - gepoolter Partikel-Burst (ein persistenter Emitter je Preset) und Rauch
//   - gehaerteter Frame-Animator (Flipbook-Player) mit Sprite-Pool
//   - Leichen-/Wrack-Logik (reiner Engine-Timer)
//
// Paket A (Fundament-Haertung) baut auf dem spawn(typ)-Dispatcher (src/fx/) auf:
// S1 Fake-Licht & Bloom, S2 Partikel-Pool, S3 Flipbook-Player. Nichts dupliziert,
// alles erweitert. Die drei Techniken sind die ersten Handler hinter fx.spawn.

// Leichen/Wracks: Defaults 8 s liegen, dann ueber 30 s ins Decal verblassen
// (asset-spec/Blueprint; spaeter justierbar).
export const CORPSE_LINGER_MS = 8000;
export const WRECK_FADE_MS = 30000;

// Texturschluessel. fx_glow/fx_ring bleiben (Abwaertskompat: death_fx). Die
// "soft"-Schluessel folgen den Asset-Namen aus Paket A; sie werden PROZEDURAL als
// reine Radial-Gradienten erzeugt (Projekt-§7: prozedural fuer Gradienten), bis
// ein echtes PNG unter demselben Schluessel geladen wird -- das exists()-Gate
// laesst es kommentarlos durch (Heilige Reihenfolge: Platzhalter, dann Kunst).
export const FX_GLOW_KEY = "fx_glow";
export const FX_RING_KEY = "fx_ring";
export const FX_GLOW_SOFT_KEY = "fx_glow_soft_128";
export const FX_DOT_KEY = "fx_soft_dot";
export const FX_PUFF_KEY = "fx_puff_soft";
export const FX_SMOKE_KEY = "fx_smoke_puff";

// Hohe konstante Tiefe fuer Partikel-/Flipbook-Overlay: ueber Einheiten/Gebaeude.
// Das HUD ist separates DOM und bleibt von Kamera-postFX/Tiefen unberuehrt.
// ADD-Konsolidierung (Gefechts-VFX Paket 5): ALLES Additive liegt im Luft-Band
// FX_AIR_ADD_DEPTH (990000..unter 1e6); FX_PARTICLE_DEPTH (1e6) ist der
// NORMAL-Deckel darueber (Rauch, neutrale Flipbooks). So bleibt die Depth-
// Sortierung ADD-zusammenhaengend -> konstant wenige Blend-Breaks.
const FX_PARTICLE_DEPTH = 1_000_000;

// Partikel-Budgets (Paket A S2). SPARK_CAP = globale Kappe gleichzeitig lebender
// Funken (jetzt CPU-Sprite-Pool in Iso-Scheinhoehe, kein GPU-Emitter mehr).
const SPARK_CAP = 200;
const SMOKE_CAP = 110;

// Funken-Physik (Code7): Iso-Scheinhoehe wie debris_system (h += vy*dt,
// vy -= g*dt; gezeichnet y0 - h). gravityY ist vorzeichen-/parameterfaehig
// (negativ -> Aufstieg, fuer die geparkte Magie-/Ploerre-Bewegung §8). In Welle 1
// faellt der Funke (positives g) und landet sichtbar statt zu schweben.
const SPARK_GRAVITY = 1000; // Scheinhoehe-Schwerkraft (px/s^2), signierbar
const SPARK_LIFE_MIN = 600; // §2: 420 -> 600..900 ms Flugzeit
const SPARK_LIFE_MAX = 900;
const SPARK_ISO_X = 0.92; // Horizontal-Bildschirm-x (iso-gedaempfte Streuung)
const SPARK_STREAK_K = 0.012; // Streak-Laengung pro px/s Momentantempo
const SPARK_STREAK_MAX = 3.4; // maximale Streak-Laengung

/**
 * Zeichnet einmalig eine weiche Radial-Alpha-Textur (weiss, per Tint faerbbar).
 * Falloff alpha = (1 - t)^pow von innen nach aussen. Idempotent ueber exists().
 */
function ensureRadial(scene: Phaser.Scene, key: string, size: number, pow: number): void {
  if (scene.textures.exists(key)) return;
  const r = size / 2;
  const g = scene.add.graphics();
  const steps = 48;
  for (let i = steps; i > 0; i--) {
    const t = i / steps; // 1 (aussen) .. 0 (innen)
    g.fillStyle(0xffffff, (1 - t) ** pow);
    g.fillCircle(r, r, r * t);
  }
  g.generateTexture(key, size, size);
  g.destroy();
}

/**
 * Erzeugt die prozeduralen Effekt-Primitive einmalig (per Tint einfaerbbar).
 * Idempotent. fx_glow/fx_ring fuer Abwaertskompat; soft/dot/puff fuer Paket A.
 */
export function ensureFxTextures(scene: Phaser.Scene): void {
  ensureRadial(scene, FX_GLOW_KEY, 128, 2); // bestehender Glow-Kern
  ensureRadial(scene, FX_GLOW_SOFT_KEY, 128, 2); // dokumentierter Name, gleicher Kern
  ensureRadial(scene, FX_DOT_KEY, 64, 2.4); // straffer, weicher Funkenpunkt (ADD)
  ensureRadial(scene, FX_PUFF_KEY, 128, 1.3); // breiter weicher Puff (NORMAL)
  ensureRadial(scene, FX_SMOKE_KEY, 128, 1.1); // breitester Rauchpuff (NORMAL)
  if (!scene.textures.exists(FX_RING_KEY)) {
    const size = 128;
    const r = size / 2;
    const g = scene.add.graphics();
    g.lineStyle(8, 0xffffff, 1);
    g.strokeCircle(r, r, r - 8);
    g.generateTexture(FX_RING_KEY, size, size);
    g.destroy();
  }
}

export interface BurstOpts {
  color?: number;
  scale?: number;
  duration?: number;
  depth?: number;
}

// Ein einzelner Funke im Scheinhoehe-Pool (Code7). Reine Render-Physik, nicht Sim.
interface Spark {
  img: Phaser.GameObjects.Image;
  cx: number; // aktuelle Bildschirm-x
  y0: number; // Boden-Bildschirm-y (Lande-Linie)
  vx: number; // Horizontaltempo (px/s)
  vy: number; // Vertikaltempo in Scheinhoehe (hoch = +)
  h: number; // aktuelle Scheinhoehe ueber Boden (px)
  g: number; // Scheinhoehe-Schwerkraft (signierbar)
  t: number; // Zeit seit Auswurf (s)
  life: number; // Lebensdauer (s)
  baseScale: number;
}

export interface SmokeOpts {
  color?: number;
  scale?: number;
  depth?: number;
  /** Aufstieg in px/s (negativ = nach oben). */
  rise?: number;
  frequency?: number;
}

// Per-Scene-Singleton: EIN FxSystem teilen sich death_fx und der fx-Dispatcher,
// damit es nicht zwei Saetze gepoolter Emitter gibt.
const systems = new WeakMap<Phaser.Scene, FxSystem>();

/** Liefert (lazy) das eine FxSystem der Scene. */
export function getFxSystem(scene: Phaser.Scene): FxSystem {
  let s = systems.get(scene);
  if (!s) {
    s = new FxSystem(scene);
    systems.set(scene, s);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => systems.delete(scene));
  }
  return s;
}

export class FxSystem {
  // S2-Funken (Code7): CPU-Sprite-Pool in Iso-Scheinhoehe statt GPU-Emitter, damit
  // Funken der Wurfparabel folgen (fallen + landen) statt in Bildschirm-Y zu
  // schweben. Gepoolt (Group, SPARK_CAP) + per-Frame getrieben (tickSparks).
  private sparkGroup?: Phaser.GameObjects.Group;
  private readonly liveSparks: Spark[] = [];
  private readonly freeSparks: Spark[] = [];
  // Rauch bleibt screen-space (legitim aufsteigend): ein laufender Emitter je smoke().
  private readonly smokeEmitters = new Set<Phaser.GameObjects.Particles.ParticleEmitter>();
  // S3: ein Sprite-Pool (Group, maxSize 32) fuer den Flipbook-Player.
  private flipGroup?: Phaser.GameObjects.Group;

  constructor(private readonly scene: Phaser.Scene) {
    ensureFxTextures(scene);
    const onUpdate = (_t: number, delta: number): void => this.tickSparks(delta);
    scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
      this.destroy();
    });
  }

  /** Additiver Blitzkern: kurzer heller Glow, der aufskaliert und ausblendet.
   *  Default-Tiefe = Luft-ADD-Band (Paket 5): frueher y+1000 im Weltband, wo
   *  jeder Blitz als ADD-Insel zwei Batch-Breaks kostete. */
  public flash(x: number, y: number, opts: BurstOpts = {}): void {
    const img = this.scene.add
      .image(x, y, FX_GLOW_KEY)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(opts.color ?? 0xffffff)
      .setDepth(opts.depth ?? FX_AIR_ADD_DEPTH);
    const scale = opts.scale ?? 1;
    img.setScale(scale * 0.4);
    this.scene.tweens.add({
      targets: img,
      scale: scale,
      alpha: 0,
      duration: opts.duration ?? 220,
      ease: "Quad.Out",
      onComplete: () => img.destroy(),
    });
  }

  /** Summe lebender Rauch-Partikel (Diagnose; Funken zaehlt liveSparks separat). */
  private totalAlive(): number {
    let n = 0;
    for (const em of this.smokeEmitters) n += em.getAliveParticleCount();
    return n;
  }

  /**
   * Funken-Burst (S2, Red-Alert-3-Prinzip), von Code7 auf Iso-Scheinhoehe gehoben:
   * einmaliger Auswurf einiger Funken aus der Trefferstelle. Sie POPpen hoch,
   * folgen der Wurfparabel (h += vy*dt, vy -= g*dt) und LANDEN sichtbar auf dem
   * Boden (y0) statt in Bildschirm-Y zu schweben; ein Bewegungs-Streak laengt mit
   * dem Momentantempo. Gepoolt (CPU-Sprite-Pool, SPARK_CAP gekappt), ADD-Blend.
   * gravityY ist signierbar und die Streuung parametrierbar (Grundlage fuer die
   * geparkte Aufstiegs-/Absink-Bewegung §8). Tint/Blend/Kurven bleiben Code4.
   */
  public burst(
    x: number,
    y: number,
    opts: BurstOpts & { count?: number; speed?: number; gravityY?: number; spread?: number } = {},
  ): void {
    const color = opts.color ?? 0xffffff;
    const speed = opts.speed ?? 90;
    const scale = opts.scale ?? 1;
    const count = opts.count ?? 8;
    const g = opts.gravityY ?? SPARK_GRAVITY; // signierbar (negativ -> Aufstieg)
    const spread = opts.spread ?? SPARK_ISO_X;
    const depth = opts.depth ?? FX_AIR_ADD_DEPTH; // Funken sind ADD -> Luft-Band
    if (!this.sparkGroup) {
      this.sparkGroup = this.scene.add.group({ maxSize: SPARK_CAP, classType: Phaser.GameObjects.Image });
    }
    for (let i = 0; i < count; i++) {
      if (this.liveSparks.length >= SPARK_CAP) break; // globale Drossel
      const img = this.sparkGroup.get(x, y, FX_DOT_KEY) as Phaser.GameObjects.Image | null;
      if (!img) break; // Pool voll
      const s = speed * (0.45 + Math.random() * 0.55);
      const a = Math.random() * Math.PI * 2; // radiale Horizontalrichtung
      const baseScale = scale * 0.22;
      const life = (opts.duration ?? SPARK_LIFE_MIN + Math.random() * (SPARK_LIFE_MAX - SPARK_LIFE_MIN)) / 1000;
      img
        .setTexture(FX_DOT_KEY)
        .setActive(true)
        .setVisible(true)
        .setPosition(x, y)
        .setTint(color)
        .setAlpha(0.95)
        .setScale(baseScale)
        .setRotation(0)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(depth);
      const sp = this.freeSparks.pop() ?? ({} as Spark);
      sp.img = img;
      sp.cx = x;
      sp.y0 = y;
      sp.vx = Math.cos(a) * s * spread; // Bildschirm-x-Drift
      // Scheinhoehe-Pop, dimensioniert auf die Flugzeit (vy0 ~ |g|*life/2 -> der
      // Funke kehrt etwa bei life zum Boden zurueck). |g|, damit ein negatives g
      // (§8, Aufstieg) den Pop nicht umkehrt; das Vorzeichen wirkt nur auf den Fall.
      sp.vy = Math.abs(g) * life * 0.5 * (0.9 + Math.random() * 0.2);
      sp.h = 0;
      sp.g = g;
      sp.t = 0;
      sp.life = life;
      sp.baseScale = baseScale;
      this.liveSparks.push(sp);
    }
  }

  /**
   * Per-Frame-Treiber der Funken (an das Scene-UPDATE gehaengt). Integriert die
   * Scheinhoehe, laengt den Streak mit dem Momentantempo, blendet ueber die
   * Lebensdauer aus und recycelt bei Bodenkontakt (h<=0) bzw. Timeout (Aufstieg).
   */
  private tickSparks(delta: number): void {
    if (this.liveSparks.length === 0) return;
    const dt = delta / 1000;
    for (let i = this.liveSparks.length - 1; i >= 0; i--) {
      const sp = this.liveSparks[i];
      sp.t += dt;
      sp.vy -= sp.g * dt;
      sp.h += sp.vy * dt;
      sp.cx += sp.vx * dt;
      const landed = sp.h <= 0 && sp.t > 0.02;
      if (landed || sp.t >= sp.life) {
        this.sparkGroup?.killAndHide(sp.img);
        sp.img.setBlendMode(Phaser.BlendModes.NORMAL).setScale(1).setRotation(0);
        this.liveSparks[i] = this.liveSparks[this.liveSparks.length - 1];
        this.liveSparks.pop();
        this.freeSparks.push(sp);
        continue;
      }
      const screenVy = -sp.vy; // d(y0 - h)/dt: Bildschirm-Vertikaltempo
      const mag = Math.hypot(sp.vx, screenVy);
      const stretch = Math.min(SPARK_STREAK_MAX, 1 + mag * SPARK_STREAK_K);
      sp.img
        .setPosition(sp.cx, sp.y0 - sp.h)
        .setRotation(Math.atan2(screenVy, sp.vx))
        .setScale(sp.baseScale * stretch, sp.baseScale / Math.sqrt(stretch))
        .setAlpha(0.95 * (1 - sp.t / sp.life));
    }
  }

  /**
   * Aufsteigender Schlot-/Wrack-Rauch (S2): laufender Emitter, NORMAL (nicht ADD,
   * sonst kollabiert Overdraw zu Weiss). Niedrige Frequenz, weiche Puffs, Aufstieg
   * + Aufskalieren + Ausblenden. Gibt den Emitter zurueck; der Aufrufer stoppt ihn
   * (Paket C bindet ihn an die Wrack-Lebensdauer). Beim Shutdown aufgeraeumt.
   */
  public smoke(x: number, y: number, opts: SmokeOpts = {}): Phaser.GameObjects.Particles.ParticleEmitter {
    const scale = opts.scale ?? 1;
    const em = this.scene.add.particles(x, y, FX_SMOKE_KEY, {
      speedY: { min: (opts.rise ?? -20) * 1.2, max: opts.rise ?? -20 },
      speedX: { min: -6, max: 6 },
      lifespan: { min: 1400, max: 2400 },
      scale: { start: scale * 0.18, end: scale * 0.5 },
      alpha: { start: 0.28, end: 0 },
      frequency: opts.frequency ?? 220,
      quantity: 1,
      tint: opts.color ?? 0x6b6b6b,
      blendMode: Phaser.BlendModes.NORMAL,
      maxAliveParticles: SMOKE_CAP,
    });
    em.setDepth(opts.depth ?? FX_PARTICLE_DEPTH);
    this.smokeEmitters.add(em);
    return em;
  }

  /**
   * Beendet einen laufenden Rauch-Emitter geordnet (Explosions-Puff statt Schlot):
   * stoppt nach emitMs das Ausstossen, laesst die Partikel auslaufen und raeumt
   * den Emitter danach ab (auch aus der Tracking-Menge).
   */
  public releaseSmoke(em: Phaser.GameObjects.Particles.ParticleEmitter, emitMs = 300): void {
    this.scene.time.delayedCall(emitMs, () => em.stop());
    this.scene.time.delayedCall(emitMs + 2600, () => {
      this.smokeEmitters.delete(em);
      em.destroy();
    });
  }

  /** Schockwellenring: skaliert von klein nach gross und blendet aus.
   *  Default-Tiefe = Luft-ADD-Band (Paket 5, wie flash). */
  public shockwave(x: number, y: number, opts: BurstOpts = {}): void {
    const img = this.scene.add
      .image(x, y, FX_RING_KEY)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(opts.color ?? 0xffffff)
      .setDepth(opts.depth ?? FX_AIR_ADD_DEPTH);
    const scale = opts.scale ?? 2;
    img.setScale(scale * 0.2);
    this.scene.tweens.add({
      targets: img,
      scale: scale,
      alpha: 0,
      duration: opts.duration ?? 350,
      ease: "Cubic.Out",
      onComplete: () => img.destroy(),
    });
  }

  /**
   * Flipbook-Player (S3, gehaertet): spielt ein abgenommenes Effekt-Spritesheet
   * (Impact, Muendungsfeuer, Rauch ...) als kurze Frame-Sequenz. No-op, wenn die
   * Textur fehlt. Haertung gegenueber dem alten Stand:
   *   - Sprite-Pool (Group, maxSize 32): recyceln statt destroy; Zustand beim
   *     Wiederverwenden zuruecksetzen (Blend/Scale/Origin/Alpha/Rotation).
   *   - Anker "ground" (Origin 0.5/1, fuer bodenverankerten Rauch) | "center"
   *     (0.5/0.5, Default fuer Lufteffekte).
   *   - Frame-0-Absicherung vor play() gegen das Erst-Frame-Zucken.
   */
  public playFrames(
    x: number,
    y: number,
    key: string,
    frames: number,
    opts: {
      frameRate?: number;
      scale?: number;
      rotation?: number;
      blendAdd?: boolean;
      depth?: number;
      anchor?: "ground" | "center";
    } = {},
  ): Phaser.GameObjects.Sprite | undefined {
    if (!this.scene.textures.exists(key)) return undefined;
    if (!this.flipGroup) {
      this.flipGroup = this.scene.add.group({ maxSize: 32, classType: Phaser.GameObjects.Sprite });
    }
    const spr = this.flipGroup.get(x, y, key) as Phaser.GameObjects.Sprite | null;
    if (!spr) return undefined; // Pool voll (32 aktiv): Effekt auslassen, kein Ruckler
    spr
      .setActive(true)
      .setVisible(true)
      .setPosition(x, y)
      .setAlpha(1)
      .setRotation(opts.rotation ?? 0)
      .setScale(opts.scale ?? 1)
      .setOrigin(0.5, opts.anchor === "ground" ? 1 : 0.5)
      .setBlendMode(opts.blendAdd ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL)
      .setDepth(opts.depth ?? (opts.blendAdd ? FX_AIR_ADD_DEPTH : FX_PARTICLE_DEPTH));
    // Frame-0-Absicherung: nur wenn der numerische Frame existiert (Spritesheet).
    if (this.scene.textures.get(key).has("0")) spr.setFrame(0);
    const animKey = `__fx_${key}`;
    if (!this.scene.anims.exists(animKey)) {
      this.scene.anims.create({
        key: animKey,
        frames: this.scene.anims.generateFrameNumbers(key, { start: 0, end: Math.max(0, frames - 1) }),
        frameRate: opts.frameRate ?? 18,
        repeat: 0,
      });
    }
    spr.play(animKey);
    spr.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.flipGroup?.killAndHide(spr);
      // Zustand fuer die naechste Wiederverwendung neutralisieren.
      spr.setBlendMode(Phaser.BlendModes.NORMAL).setScale(1).setRotation(0).setOrigin(0.5, 0.5);
    });
    return spr;
  }

  /**
   * Leichen-/Wrack-Logik: friert das uebergebene GameObject ein, laesst es
   * CORPSE_LINGER_MS liegen, blendet es dann ueber WRECK_FADE_MS aus und
   * zerstoert es. Reiner Engine-Timer, kein Asset. Optional ein Wrack-Decal,
   * das eingeblendet wird, bevor das Original verschwindet.
   */
  public corpse(
    obj: Phaser.GameObjects.GameObject & { alpha: number; x?: number; y?: number },
    opts: { lingerMs?: number; fadeMs?: number; wreckDecalKey?: string; x?: number; y?: number } = {},
  ): void {
    const linger = opts.lingerMs ?? CORPSE_LINGER_MS;
    const fade = opts.fadeMs ?? WRECK_FADE_MS;
    const anyObj = obj as unknown as { anims?: { stop?: () => void } };
    anyObj.anims?.stop?.();
    this.scene.time.delayedCall(linger, () => {
      let decal: Phaser.GameObjects.Image | undefined;
      if (opts.wreckDecalKey && this.scene.textures.exists(opts.wreckDecalKey)) {
        const dx = opts.x ?? obj.x ?? 0;
        const dy = opts.y ?? obj.y ?? 0;
        decal = this.scene.add.image(dx, dy, opts.wreckDecalKey).setDepth(dy);
      }
      this.scene.tweens.add({
        targets: obj,
        alpha: 0,
        duration: fade,
        onComplete: () => obj.destroy(),
      });
      if (decal) {
        this.scene.tweens.add({ targets: decal, alpha: 0, duration: fade, onComplete: () => decal?.destroy() });
      }
    });
  }

  /** Diagnose fuer die Mess-Bruecke: lebende Funken/Rauch + Flipbook. */
  public stats(): { sparksLive: number; smokeEmitters: number; aliveParticles: number; flipActive: number } {
    return {
      sparksLive: this.liveSparks.length,
      smokeEmitters: this.smokeEmitters.size,
      aliveParticles: this.totalAlive() + this.liveSparks.length,
      flipActive: this.flipGroup ? this.flipGroup.countActive(true) : 0,
    };
  }

  /** Scene-Shutdown: Funken-Pool + Rauch-Emitter + Flipbook-Group zerstoeren. */
  public destroy(): void {
    this.liveSparks.length = 0;
    this.freeSparks.length = 0;
    this.sparkGroup?.destroy(true);
    this.sparkGroup = undefined;
    for (const em of this.smokeEmitters) em.destroy();
    this.smokeEmitters.clear();
    this.flipGroup?.destroy(true);
    this.flipGroup = undefined;
  }
}

// --- S1: Fake-Licht & Bloom -------------------------------------------------

export interface BloomOpts {
  color?: number;
  offsetX?: number;
  offsetY?: number;
  blurStrength?: number;
  strength?: number;
  steps?: number;
}

/**
 * Installiert EINEN Vollbild-Bloom-Pass auf der Hauptkamera (S1). Bloom liefert
 * die "Haut" auf den additiven Glow-Sprites -- die Iso-Optik hat kein dynamisches
 * Licht, also wird es gefaelscht. WebGL-only: unter dem Canvas-Renderer gibt es
 * kein postFX (graceful No-op). Ein Pass kostet gleich, ob 50 oder 300 Glows
 * (kein Per-Glow-Shader). Dezent getunt; alle Werte justierbar.
 */
export function installBloom(scene: Phaser.Scene, opts: BloomOpts = {}): unknown {
  if (scene.renderer.type !== Phaser.WEBGL) return undefined;
  const cam = scene.cameras.main as unknown as {
    postFX?: {
      addBloom?: (
        color?: number,
        offsetX?: number,
        offsetY?: number,
        blurStrength?: number,
        strength?: number,
        steps?: number,
      ) => unknown;
    };
  };
  if (!cam.postFX?.addBloom) return undefined;
  return cam.postFX.addBloom(
    opts.color ?? 0xffffff,
    opts.offsetX ?? 1,
    opts.offsetY ?? 1,
    opts.blurStrength ?? 1.2,
    opts.strength ?? 0.9,
    opts.steps ?? 4,
  );
}

export interface FakeLightOpts {
  color: number;
  /** Glow-Radius in px (Skala ~ radius/64). */
  radius?: number;
  /** Grund-Deckkraft. NICHT hochdrehen -- Bloom liefert die Helligkeit. */
  baseAlpha?: number;
  pulsePeriodMs?: number;
  /** Alpha-Hub des Pulses (klein halten). */
  pulseHub?: number;
  /** Anzahl langsam rotierender Strahlen. */
  rays?: number;
  /** Aufsteigender Dunst (NORMAL). */
  mist?: boolean;
  /** Driftende Gluehwuermchen (ADD, wenige, weich). */
  motes?: boolean;
  moteTint?: number;
}

/**
 * Parametrisiertes Fake-Licht (S1): additive Glow-Sprites + optional Strahlen,
 * Dunst und Gluehwuermchen, an einen Container gehaengt. Alpha bleibt niedrig
 * (Bloom hellt auf); Gluehwuermchen-Frequenz bleibt grob (Bloom ueberdreht Dichte
 * sonst zu Matsch). Licht kommt aus der Engine, nie aus dem Sprite.
 */
export function fakeLight(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.Container,
  opts: FakeLightOpts,
): void {
  ensureFxTextures(scene);
  const r = (opts.radius ?? 64) / 64;
  const baseA = opts.baseAlpha ?? 0.14;
  const glow = scene.add
    .image(0, -16, FX_GLOW_SOFT_KEY)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setTint(opts.color)
    .setAlpha(baseA)
    .setScale(r);
  target.add(glow);
  if (opts.pulseHub && opts.pulsePeriodMs) {
    scene.tweens.add({
      targets: glow,
      alpha: baseA + opts.pulseHub,
      duration: opts.pulsePeriodMs / 2,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
    });
  }
  for (let i = 0; i < (opts.rays ?? 0); i++) {
    const ray = scene.add
      .image(0, -16, FX_GLOW_SOFT_KEY)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(opts.color)
      .setAlpha(baseA * 0.7)
      .setScale(0.4 * r, 1.3 * r)
      .setRotation((i * Math.PI) / 2);
    target.add(ray);
    scene.tweens.add({ targets: ray, rotation: ray.rotation + Math.PI * 2, duration: 9000 + i * 2000, repeat: -1 });
  }
  if (opts.mist) {
    const mist = scene.add.particles(0, -10, FX_PUFF_KEY, {
      speedY: { min: -10, max: -22 },
      lifespan: { min: 1800, max: 3000 },
      scale: { start: 0.12 * r, end: 0.3 * r },
      alpha: { start: 0.16, end: 0 },
      frequency: 600,
      quantity: 1,
      tint: 0xffffff,
      blendMode: Phaser.BlendModes.NORMAL,
      maxAliveParticles: 24,
    });
    target.add(mist);
  }
  if (opts.motes) {
    const motes = scene.add.particles(0, -20, FX_DOT_KEY, {
      speed: { min: 4, max: 14 },
      lifespan: { min: 1600, max: 2800 },
      scale: { start: 0.06, end: 0 },
      alpha: { start: 0.9, end: 0 },
      frequency: 280, // bewusst grob -- Bloom verdichtet sonst zu Matsch
      quantity: 1,
      tint: opts.moteTint ?? 0xe8f0a0,
      blendMode: Phaser.BlendModes.ADD,
      emitZone: {
        type: "random",
        source: new Phaser.Geom.Circle(0, 0, 26) as Phaser.Types.GameObjects.Particles.RandomZoneSource,
      },
    });
    target.add(motes);
  }
}

/**
 * Vorkommens-Umgebungslicht als Container-Kinder (rein visuell). Mappt die drei
 * Ressourcen auf Fake-Licht-Rezepte: Quelle (Manna, hell + Strahlen + Dunst),
 * Destillat (toxisch-gruen, schneller Puls), Hain (Gluehwuermchen). Werte
 * gespiegelt aus dem erprobten Stand (Alpha/Frequenz nicht angehoben).
 */
export function attachResourceLight(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  ressource: ResourceId,
): void {
  if (ressource === "botanicals") {
    fakeLight(scene, container, {
      color: 0xc7e08a,
      radius: 70,
      baseAlpha: 0.12,
      pulsePeriodMs: 3600,
      pulseHub: 0.1,
      motes: true,
      moteTint: 0xe8f0a0,
    });
  } else if (ressource === "reinwasser") {
    fakeLight(scene, container, {
      color: 0xeaf6ff,
      radius: 58,
      baseAlpha: 0.14,
      pulsePeriodMs: 4400,
      pulseHub: 0.12,
      rays: 2,
      mist: true,
    });
  } else if (ressource === "destillat") {
    fakeLight(scene, container, {
      color: 0xb6e36a,
      radius: 52,
      baseAlpha: 0.08,
      pulsePeriodMs: 1400,
      pulseHub: 0.1,
    });
  }
}
