import Phaser from "phaser";
import { FX_KIT_KEY, FX_KIT_FRAMES, FX_MIST_TILE_KEY, ensureFxKit, ensureMistTileTexture } from "./fx_kit";
import { PALETTE } from "./palette";
import { AURA_FX_DEPTH } from "../util/world";
import { MOVEMENT } from "../data/balance";
import { gridWorldRect } from "../systems/map_texture";
import type { GameState } from "../systems/game_state";
import type { Building } from "../entities/building";

// AMBIENT-SCHICHT (Gefechts-VFX Paket 4, Budget-Rahmen D3: ~220 Objekte,
// <= 1,5 ms gesamt -- gemessen ueber stats().tickMsAvg, Beweis 3).
//
// Vier Subsysteme in EINEM Modul (ein Poll, ein Tick, eine Mess-Quelle):
//  1. Schornstein-Rauch: bis zu 8 Partikel-Emitter (maxAlive 24, D3-Formel
//     alive ~ q*life/freq ~ 20) an MODERAT-Industriegebaeuden, Puff-Frames aus
//     dem FX-Kit (batcht mit dem Kit), NORMAL-Blend im Weltband (building.y+1).
//  2. Loop-Sprite-Fueller: 8-Frame-Puff-Loop (globale geteilte Anim) an
//     Gebaeuden ohne Emitter-Slot -- 1 Sprite statt ~20 Partikel (D3 §2).
//  3. Nebel: ZWEI TileSprite-Layer (POT-Kacheltextur, tilePosition-Drift aus
//     der SIM-UHR) + 12 grosse Wolken-Sprites (Cloud-Frame, seeded Positionen
//     via goldenem Winkel, Drift aus simTick). ERSETZT begruendet die
//     Aktivierung von fx/ground_mist.ts: das ist zonen-gebundene Editor-Map-
//     Feinarbeit und durchgaengig Math.random-getrieben (Verbots-Konflikt);
//     Koexistenz dokumentiert in docs/GEFECHTS-VFX.md, kein Doppelbau.
//  4. Glow-Flackern: bis zu 20 Alpha-Sinus-ADD-Sprites (glow_soft-Frame) auf
//     dem Boden-ADD-Band AURA_FX_DEPTH an Gebaeuden beider Fraktionen (MODERAT
//     Magenta, HELLMUTH Gold; Destille traegt zusaetzlich production_glow).
//
// DETERMINISMUS: alle Phasen/Positionen/Drifts aus simTick + id*goldenAngle
// bzw. fester Index-Streuung -- kein Math.random, keine Wanduhr in eigenem
// Code. Einzige dokumentierte Ausnahme: die Phaser-INTERNE Partikel-Streuung
// der Rauch-Emitter (Brief-Bauform "Emitter"; Residuum, s. Doku §Residuen).

const PROBE_MS = 500;
const MAX_CHIMNEYS = 8;
const MAX_LOOP_FILLERS = 10;
const MAX_GLOWS = 20;
const CLOUD_COUNT = 12;

// Rauch: D3-Kadenz (alive ~ 1 * 2400 / 120 = 20 < maxAlive 24).
const SMOKE_FREQ_MS = 120;
const SMOKE_LIFE_MS = 2400;
const SMOKE_MAX_ALIVE = 24;
const CHIMNEY_OFFSET_Y = -44; // Muendung ueber dem Gebaeude-Anker (Platzhalter)

// MODERAT-Industrie raucht; HELLMUTH-Prozessbauten bekommen den zarten Fueller.
const CHIMNEY_TYPES = new Set(["zuckermaschine", "raffinerie", "schlickwerk", "gaertank"]);
const FILLER_TYPES = new Set(["destille", "apotheke"]);

// Nebel-Layer: unter dem ATMO_FOG-Band (-67000..-64000), Alpha compositing-
// sicher (2 Lagen ~0.14 kumulativ; mit ATMO zusammen < alphaCap 0.55).
const MIST_LAYERS = [
  { alpha: 0.09, scale: 2.4, driftX: 4.0, driftY: 1.4, depth: -68500, tint: 0x9fb6c8 },
  { alpha: 0.06, scale: 1.5, driftX: -6.5, driftY: -2.2, depth: -68000, tint: 0xaebfce },
] as const;
const CLOUD_DEPTH = -63500; // ueber ATMO/Mist, unter Einheiten
const CLOUD_ALPHA = 0.07;
const CLOUD_DRIFT_PX_PER_TICK = 0.35; // Welt-px je Sim-Tick (~10.5 px/s)

const GLOW_WORLD_PX = 96;
const GLOW_ALPHA_MIN = 0.12;
const GLOW_ALPHA_MAX = 0.3;
const GLOW_PERIOD_TICKS = 45; // 1,5 s bei 30 Hz, je Quelle phasenversetzt

const PUFF_LOOP_ANIM = "fx_puff_loop";
const SIM_TICK_HZ = 30;

interface ChimneySlot {
  building: Building;
  emitter: Phaser.GameObjects.Particles.ParticleEmitter;
}
interface FillerSlot {
  building: Building;
  spr: Phaser.GameObjects.Sprite;
}
interface GlowSlot {
  building: Building;
  img: Phaser.GameObjects.Image;
}

export class AmbientFx {
  private readonly chimneys: ChimneySlot[] = [];
  private readonly fillers: FillerSlot[] = [];
  private readonly glows: GlowSlot[] = [];
  private readonly clouds: Phaser.GameObjects.Image[] = [];
  private readonly mistTiles: Phaser.GameObjects.TileSprite[] = [];
  private readonly cloudBase: Array<{ x: number; y: number; phase: number }> = [];
  private probeAcc = 0;
  private tickMsSum = 0;
  private tickCount = 0;

  constructor(private readonly scene: Phaser.Scene) {
    ensureFxKit(scene);
    ensureMistTileTexture(scene);
    this.buildMist();
    this.buildClouds();
    this.ensurePuffAnim();
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.tick, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.events.off(Phaser.Scenes.Events.UPDATE, this.tick, this);
      delete (scene as unknown as { __ambient?: AmbientFx }).__ambient;
    });
    // Mess-Bruecken-Handle (Beweis 3), Muster wie scene.fx in fx/index.ts.
    (scene as unknown as { __ambient?: AmbientFx }).__ambient = this;
  }

  // --- Nebel (2 TileSprite-Layer, POT-Kachel) -------------------------------

  private buildMist(): void {
    const rect = gridWorldRect();
    for (const L of MIST_LAYERS) {
      const ts = this.scene.add
        .tileSprite(rect.x, rect.y, rect.width, rect.height, FX_MIST_TILE_KEY)
        .setOrigin(0, 0)
        .setTileScale(L.scale, L.scale)
        .setTint(L.tint)
        .setAlpha(L.alpha)
        .setDepth(L.depth);
      this.mistTiles.push(ts);
    }
  }

  // --- Wolken (12 Sprites, seeded Positionen + Sim-Drift) --------------------

  private buildClouds(): void {
    const rect = gridWorldRect();
    for (let i = 0; i < CLOUD_COUNT; i++) {
      // Seeded Streuung: goldener Winkel + radiale Treppe -> gleichmaessig,
      // deterministisch, ohne RNG (movement-Muster).
      const ang = i * MOVEMENT.goldenAngle;
      const rad = 0.25 + 0.7 * ((i * 0.618034) % 1);
      const x = rect.x + rect.width * (0.5 + 0.5 * rad * Math.cos(ang));
      const y = rect.y + rect.height * (0.5 + 0.5 * rad * Math.sin(ang));
      const img = this.scene.add
        .image(x, y, FX_KIT_KEY, FX_KIT_FRAMES.CLOUD)
        .setAlpha(CLOUD_ALPHA)
        .setScale(1.4 + (i % 3) * 0.35)
        .setDepth(CLOUD_DEPTH);
      this.clouds.push(img);
      this.cloudBase.push({ x, y, phase: ang });
    }
  }

  private ensurePuffAnim(): void {
    if (this.scene.anims.exists(PUFF_LOOP_ANIM)) return;
    this.scene.anims.create({
      key: PUFF_LOOP_ANIM,
      frames: Array.from({ length: FX_KIT_FRAMES.PUFF_COUNT }, (_, i) => ({
        key: FX_KIT_KEY,
        frame: FX_KIT_FRAMES.PUFF(i),
      })),
      frameRate: 8,
      repeat: -1,
    });
  }

  // --- Gebaeude-Zuordnung (Rauch, Fueller, Glows) ----------------------------

  private assign(): void {
    const gs = this.scene.registry.get("gameState") as GameState | undefined;
    if (!gs) return;
    const alive = new Set<Building>();
    for (const b of gs.buildings) if (b.fertig && !b.isDead) alive.add(b);

    // Tote/entfernte Slots freigeben.
    for (let i = this.chimneys.length - 1; i >= 0; i--) {
      if (!alive.has(this.chimneys[i].building)) {
        this.chimneys[i].emitter.destroy();
        this.chimneys.splice(i, 1);
      }
    }
    for (let i = this.fillers.length - 1; i >= 0; i--) {
      if (!alive.has(this.fillers[i].building)) {
        this.fillers[i].spr.destroy();
        this.fillers.splice(i, 1);
      }
    }
    for (let i = this.glows.length - 1; i >= 0; i--) {
      if (!alive.has(this.glows[i].building)) {
        this.glows[i].img.destroy();
        this.glows.splice(i, 1);
      }
    }

    // Neue Slots vergeben (Budget-Deckel je Subsystem).
    for (const b of alive) {
      const hasChimney = this.chimneys.some((s) => s.building === b);
      const hasFiller = this.fillers.some((s) => s.building === b);
      const hasGlow = this.glows.some((s) => s.building === b);
      if (CHIMNEY_TYPES.has(b.typeId) && !hasChimney && this.chimneys.length < MAX_CHIMNEYS) {
        this.chimneys.push({ building: b, emitter: this.makeChimney(b) });
      } else if (FILLER_TYPES.has(b.typeId) && !hasFiller && !hasChimney && this.fillers.length < MAX_LOOP_FILLERS) {
        const spr = this.scene.add
          .sprite(b.x, b.y + CHIMNEY_OFFSET_Y, FX_KIT_KEY, FX_KIT_FRAMES.PUFF(0))
          .setAlpha(0.35)
          .setDepth(b.y + 1);
        spr.play(PUFF_LOOP_ANIM);
        this.fillers.push({ building: b, spr });
      }
      if (!hasGlow && this.glows.length < MAX_GLOWS) {
        const tint = b.faction === "moderat" ? PALETTE.MAGENTA_GLOW : PALETTE.GOLD_GLOW;
        const img = this.scene.add
          .image(b.x, b.y, FX_KIT_KEY, FX_KIT_FRAMES.GLOW_SOFT)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(tint)
          .setAlpha(GLOW_ALPHA_MIN)
          .setScale(GLOW_WORLD_PX / 128)
          .setDepth(AURA_FX_DEPTH)
          .setOrigin(0.5, 0.5);
        this.glows.push({ building: b, img });
      }
    }
  }

  private makeChimney(b: Building): Phaser.GameObjects.Particles.ParticleEmitter {
    // Brief-Bauform "Emitter" (D3): Phaser-Partikel mit Kit-Frames. Die
    // emitterinterne Streuung ist Phaser-Engine-RNG (Residuum, Doku) -- alle
    // EIGENEN Ambient-Groessen bleiben seeded/tick-gebunden.
    return this.scene.add.particles(b.x, b.y + CHIMNEY_OFFSET_Y, FX_KIT_KEY, {
      frame: Array.from({ length: FX_KIT_FRAMES.PUFF_COUNT }, (_, i) => FX_KIT_FRAMES.PUFF(i)),
      frequency: SMOKE_FREQ_MS,
      quantity: 1,
      maxAliveParticles: SMOKE_MAX_ALIVE,
      lifespan: SMOKE_LIFE_MS,
      speedY: { min: -26, max: -14 },
      speedX: { min: -6, max: 6 },
      alpha: { start: 0.42, end: 0 },
      scale: { start: 0.5, end: 1.15 },
      tint: 0x8d8d94, // Industrie-Grau (physikalischer Ton, kein Fraktions-FX)
    }).setDepth(b.y + 1);
  }

  // --- Tick (Render-Takt; liest NUR Sim-Wahrheit + simTick) ------------------

  private tick(): void {
    const t0 = performance.now();
    this.probeAcc += this.scene.game.loop.delta;
    if (this.probeAcc >= PROBE_MS) {
      this.probeAcc = 0;
      this.assign();
    }
    const gs = this.scene.registry.get("gameState") as GameState | undefined;
    const tick = gs ? gs.simTick : 0;

    // Nebel-Drift aus der Sim-Uhr: drift ist Welt-px/s, tick/30 = Sekunden.
    for (let i = 0; i < this.mistTiles.length; i++) {
      const L = MIST_LAYERS[i];
      this.mistTiles[i].setTilePosition((tick * L.driftX) / SIM_TICK_HZ, (tick * L.driftY) / SIM_TICK_HZ);
    }

    // Wolken: langsame Kreis-Drift um die Basisposition (deterministisch).
    for (let i = 0; i < this.clouds.length; i++) {
      const base = this.cloudBase[i];
      const w = tick * ((Math.PI * 2) / (SIM_TICK_HZ * 40)) + base.phase; // 40-s-Umlauf
      this.clouds[i].setPosition(base.x + Math.cos(w) * 60 + tick * CLOUD_DRIFT_PX_PER_TICK * 0.2, base.y + Math.sin(w) * 24);
    }

    // Glow-Flackern: Alpha-Sinus aus simTick, Phase aus Gebaeude-id.
    const omega = (Math.PI * 2) / GLOW_PERIOD_TICKS;
    for (const s of this.glows) {
      const phase = s.building.id * MOVEMENT.goldenAngle;
      const w = Math.sin(tick * omega + phase) * 0.5 + 0.5;
      s.img.setAlpha(GLOW_ALPHA_MIN + (GLOW_ALPHA_MAX - GLOW_ALPHA_MIN) * w);
      s.img.setPosition(s.building.x, s.building.y);
    }

    this.tickMsSum += performance.now() - t0;
    this.tickCount++;
  }

  /** Mess-Bruecke (Beweis 3): Objektzahl je Subsystem + mittlere Tick-Kosten.
   *  Partikel-alive wird konservativ mit maxAlive angesetzt. */
  stats(): { objects: Record<string, number>; totalObjects: number; tickMsAvg: number } {
    const objects = {
      chimneyEmitters: this.chimneys.length,
      chimneyMaxAlive: this.chimneys.length * SMOKE_MAX_ALIVE,
      loopFillers: this.fillers.length,
      mistLayers: this.mistTiles.length,
      clouds: this.clouds.length,
      glows: this.glows.length,
    };
    const totalObjects =
      objects.chimneyMaxAlive + objects.loopFillers + objects.mistLayers + objects.clouds + objects.glows;
    const tickMsAvg = this.tickCount ? this.tickMsSum / this.tickCount : 0;
    return { objects, totalObjects, tickMsAvg };
  }

  /** Mess-Fenster zuruecksetzen (fuer saubere Beweis-Messungen). */
  resetStats(): void {
    this.tickMsSum = 0;
    this.tickCount = 0;
  }
}

const systems = new WeakMap<Phaser.Scene, AmbientFx>();
export function getAmbientFx(scene: Phaser.Scene): AmbientFx {
  let s = systems.get(scene);
  if (!s) {
    s = new AmbientFx(scene);
    systems.set(scene, s);
  }
  return s;
}
