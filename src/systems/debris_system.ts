import Phaser from "phaser";
import { DEBRIS } from "../data/balance";
import { getBloodSystem, substanceColor, factionSub, DROP_KEY } from "./blood_system";
import type { FactionId } from "../data/loader";

// PHYSIK-TRUEMMER (Paket D, optionales Salz). burst() liefert den ballistischen
// Klein-Schutt schon gratis; hier die WENIGEN grossen Hero-Chunks pro Explosion
// und der Tod-/Einsturz-Schutt. KEINE Physik-Engine, kein Ragdoll, kein
// zerstoerbarer Boden -- eine getunte, nicht-physische Wurfparabel in Iso-
// Scheinhoehe (vy/h inkrementell integriert: h += vy*dt, vy -= g*dt; gezeichnet
// als y0 - h) mit iso-gedaempfter Drift. Code7: zwischen Bodenkontakt und Stempel
// liegt jetzt die Zustandsmaschine AUFPRALL -> ROLLEN -> RUHE. Erst die Ruhe
// stempelt (Blut: persistenter Lande-Slot; Stahl: Wrack-Decal). Gepoolt + gekappt.

export type DebrisFaction = "moderat" | "hellmuth";

const KEYS: Record<DebrisFaction, string[]> = {
  moderat: ["debris-moderat-1", "debris-moderat-2", "debris-moderat-3", "debris-moderat-4"],
  hellmuth: ["debris-hellmuth-1", "debris-hellmuth-2", "debris-hellmuth-3", "debris-hellmuth-4"],
};

const DEPTH_LIFT = 1500; // fliegende Chunks ueber Boden/Einheiten

type ChunkState = "fly" | "roll";

interface Chunk {
  spr: Phaser.GameObjects.Sprite;
  y0: number; // Boden-Bildschirm-y (Lande-Linie); Tiefe/Stempel haengen daran
  cx: number; // aktuelle Bildschirm-x (inkrementell; Drift bzw. Rollen)
  vx: number; // Horizontaltempo (px/s, iso-gedaempft)
  vy: number; // Vertikaltempo in Scheinhoehe (hoch = +)
  h: number; // aktuelle Scheinhoehe ueber Boden (px)
  t: number; // Gesamtzeit seit Wurf (s) -- nur Diagnose (stats.t0)
  spin: number; // Taumel-/Rolltempo (rad/s)
  state: ChunkState;
  bounces: number;
  key: string;
  scale: number;
  material: DebrisFaction; // fuer die Restitution (Stahl vs. Glas)
  // Blut-Ballistik: persistenter Lande-Stempel (landing-Slot) statt Wrack-Decal,
  // und KEIN Abprall/Rollen (Blut splattert, es huepft nicht -- siehe throwBlood).
  persistent: boolean;
  faction: FactionId | undefined;
}

// --- prozedurale Chunk-Texturen (Platzhalter; echtes PNG ueberschreibt) -------

interface ChunkPalette {
  fill: string;
  edge: string;
  hi: string;
}
const STEEL: ChunkPalette = { fill: "#585d62", edge: "#2a2d31", hi: "#aeb6bd" };
// HELLMUTH: Glas/Holz/Phiole -- hell, alchemistisch.
const KLAR_PALS: ChunkPalette[] = [
  { fill: "#cfe6f0", edge: "#5f8496", hi: "#ffffff" }, // Glas
  { fill: "#b8e0c4", edge: "#3f7a52", hi: "#eafff0" }, // Phiole
  { fill: "#8a5e34", edge: "#3a2614", hi: "#caa074" }, // Holz
  { fill: "#cfe6f0", edge: "#5f8496", hi: "#ffffff" }, // Glas
];

function drawChunk(ctx: CanvasRenderingContext2D, size: number, pal: ChunkPalette): void {
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2;
  const cy = size / 2;
  const n = 4 + ((Math.random() * 3) | 0); // 4-6 Ecken
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
    const r = size * 0.3 * (0.7 + Math.random() * 0.5);
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < n; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle = pal.fill;
  ctx.fill();
  ctx.lineJoin = "round";
  ctx.strokeStyle = pal.edge;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  // Kantenglanz (eine Seite) -> metallisch/glasig.
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  ctx.lineTo(pts[1][0], pts[1][1]);
  ctx.strokeStyle = pal.hi;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function ensureDebrisTextures(scene: Phaser.Scene): void {
  const make = (key: string, pal: ChunkPalette): void => {
    if (scene.textures.exists(key)) return;
    const t = scene.textures.createCanvas(key, 64, 64);
    if (!t) return;
    drawChunk(t.getContext(), 64, pal);
    t.refresh();
  };
  KEYS.moderat.forEach((k) => make(k, STEEL));
  KEYS.hellmuth.forEach((k, i) => make(k, KLAR_PALS[i % KLAR_PALS.length]));
}

// --- Per-Scene-Singleton ------------------------------------------------------

const systems = new WeakMap<Phaser.Scene, DebrisSystem>();

export function getDebrisSystem(scene: Phaser.Scene): DebrisSystem {
  let s = systems.get(scene);
  if (!s) {
    s = new DebrisSystem(scene);
    systems.set(scene, s);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => systems.delete(scene));
  }
  return s;
}

export class DebrisSystem {
  private readonly group: Phaser.GameObjects.Group;
  private readonly live: Chunk[] = [];
  private readonly freeChunks: Chunk[] = [];
  private thrown = 0; // Diagnose (Stahl)
  private bloodThrown = 0; // Diagnose (Blut-Ballistik)

  constructor(private readonly scene: Phaser.Scene) {
    ensureDebrisTextures(scene);
    this.group = scene.add.group({
      maxSize: Math.max(DEBRIS.maxLive, DEBRIS.bloodDropMax),
      classType: Phaser.GameObjects.Sprite,
    });

    const onUpdate = (_t: number, delta: number): void => this.tick(delta);
    scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
      this.destroy();
    });
    (scene as unknown as { debris?: DebrisSystem }).debris = this;
  }

  private kindLive(persistent: boolean): number {
    let n = 0;
    for (const c of this.live) if (c.persistent === persistent) n++;
    return n;
  }

  /** Gemeinsamer Start eines Chunks (Stahl wie Blut). false, wenn gekappt/voll. */
  private launch(
    x: number,
    y: number,
    key: string,
    tint: number | undefined,
    persistent: boolean,
    material: DebrisFaction,
    faction: FactionId | undefined,
  ): boolean {
    const cap = persistent ? DEBRIS.bloodDropMax : DEBRIS.maxLive;
    if (this.kindLive(persistent) >= cap) return false;
    const spr = this.group.get(x, y, key) as Phaser.GameObjects.Sprite | null;
    if (!spr) return false; // Pool voll
    const scale = persistent
      ? 0.3 + Math.random() * 0.25
      : DEBRIS.scaleMin + Math.random() * (DEBRIS.scaleMax - DEBRIS.scaleMin);
    spr
      .setTexture(key)
      .setActive(true)
      .setVisible(true)
      .setPosition(x, y)
      .setScale(scale)
      .setRotation(Math.random() * Math.PI * 2)
      .setAlpha(1)
      .setBlendMode(Phaser.BlendModes.NORMAL)
      .setDepth(y + DEPTH_LIFT);
    if (tint !== undefined) spr.setTint(tint);
    else spr.clearTint();
    const c = this.freeChunks.pop() ?? ({} as Chunk);
    c.spr = spr;
    c.y0 = y;
    c.cx = x;
    c.vx = (Math.random() * 2 - 1) * DEBRIS.driftMax;
    c.vy = DEBRIS.launchUp * (0.75 + Math.random() * 0.5);
    c.h = 0;
    c.t = 0;
    c.spin = (Math.random() * 2 - 1) * DEBRIS.spinMax;
    c.state = "fly";
    c.bounces = 0;
    c.key = key;
    c.scale = scale;
    c.material = material;
    c.persistent = persistent;
    c.faction = faction;
    this.live.push(c);
    return true;
  }

  /**
   * Wirft bis zu count Stahl-Hero-Chunks von (x, y). Sie fliegen, prallen ab,
   * rollen aus und legen sich dann als Wrack-Decal (Fenster-RT) ab.
   * Respektiert DEBRIS.maxLive.
   */
  public throw(x: number, y: number, faction: DebrisFaction, count: number): void {
    const keys = KEYS[faction];
    for (let i = 0; i < count; i++) {
      if (!this.launch(x, y, keys[(Math.random() * keys.length) | 0], undefined, false, faction, undefined)) return;
      this.thrown++;
    }
  }

  /**
   * Blut-Ballistik (Blut-Paket B): dieselbe Wurfparabel, substanz-blind (nur die
   * Tint-Farbe differiert). KEIN Abprall/Rollen -- Blut splattert. Bodenkontakt ->
   * persistenter Lande-Stempel (landing-Slot, 5-Min-Fade), gedrosselt.
   */
  public throwBlood(x: number, y: number, faction: FactionId | undefined, count: number): void {
    const tint = substanceColor(factionSub(faction));
    const material: DebrisFaction = faction === "hellmuth" ? "hellmuth" : "moderat";
    for (let i = 0; i < count; i++) {
      if (!this.launch(x, y, DROP_KEY, tint, true, material, faction)) return;
      this.bloodThrown++;
    }
  }

  /** Recycelt einen Chunk: aus der Live-Liste (Swap-Pop) in die Freiliste. */
  private recycle(c: Chunk, i: number): void {
    this.group.killAndHide(c.spr);
    c.spr.setRotation(0).setScale(1).clearTint();
    this.live[i] = this.live[this.live.length - 1];
    this.live.pop();
    this.freeChunks.push(c);
  }

  private tick(delta: number): void {
    if (this.live.length === 0) return;
    const dt = delta / 1000;
    const g = DEBRIS.gravity;
    // Rollreibung framerate-normiert: dokumentiert als vx*0,92 pro 1/60 s.
    const frictionStep = Math.pow(DEBRIS.rollFriction, dt * 60);
    let landStamps = 0; // Pflicht-Drossel der persistenten Lande-Stempel (Blut)

    for (let i = this.live.length - 1; i >= 0; i--) {
      const c = this.live[i];
      c.t += dt;

      // --- ROLLEN: auf dem Boden ausrollen, Spin an die Bodengeschwindigkeit
      // gekoppelt (der koerperliche Kern). Bei Ruhe -> Wrack-Decal + recyceln.
      if (c.state === "roll") {
        c.vx *= frictionStep;
        c.cx += c.vx * dt;
        const radius = DEBRIS.chunkRollRadius * c.scale;
        c.spr.setPosition(c.cx, c.y0).setRotation(c.spr.rotation + (c.vx / radius) * dt);
        if (Math.abs(c.vx) <= DEBRIS.restSpeed) {
          getBloodSystem(this.scene).stampWindowDecal(c.cx, c.y0, c.key, c.scale * 0.9);
          this.recycle(c, i);
        }
        continue;
      }

      // --- FLIEGEN: ballistische Scheinhoehe (semi-impliziter Euler).
      c.vy -= g * dt;
      c.h += c.vy * dt;
      c.cx += c.vx * dt;

      if (c.h <= 0 && c.t > 0.02) {
        c.h = 0;
        const impact = -c.vy; // Auftreff-Vertikaltempo (positiv beim Abstieg)

        if (c.persistent) {
          // Blut-Gibs: kein Huepfer -> direkter persistenter Lande-Stempel (Drossel).
          if (landStamps < DEBRIS.landingCap) {
            getBloodSystem(this.scene).stampPersistentSlot(c.cx, c.y0, c.faction, c.scale, "landing");
            landStamps++;
          }
          this.recycle(c, i);
          continue;
        }

        // Stahl/Glas: AUFPRALL -> reflektieren mit Restitution, bis Energie/Anzahl
        // erschoepft, dann in den Roll-Zustand. Apex-Folge z. B. 95 -> ~12 -> ~1,5 px.
        const e = DEBRIS.restitution[c.material];
        if (impact > DEBRIS.bounceMinSpeed && c.bounces < DEBRIS.maxBounces) {
          c.vy = impact * e; // nach oben reflektiert, Energie verloren
          c.vx *= DEBRIS.bounceDrag; // Horizontal gedaempft
          c.spin *= DEBRIS.bounceDrag;
          c.bounces++;
          c.spr.setPosition(c.cx, c.y0).setRotation(c.spr.rotation + c.spin * dt);
          continue;
        }
        // Keine Wucht mehr fuer einen Huepfer -> ausrollen.
        c.vy = 0;
        c.state = "roll";
        c.spr.setPosition(c.cx, c.y0);
        continue;
      }

      // in der Luft: zeichnen + taumeln
      c.spr.setPosition(c.cx, c.y0 - c.h).setRotation(c.spr.rotation + c.spin * dt);
    }
  }

  /** Diagnose fuer die Mess-Bruecke. t0 = Flugzeit des ersten Chunks (Sim-Sek.). */
  public stats(): { live: number; thrown: number; bloodThrown: number; cap: number; t0: number } {
    return {
      live: this.live.length,
      thrown: this.thrown,
      bloodThrown: this.bloodThrown,
      cap: DEBRIS.maxLive,
      t0: this.live.length > 0 ? Math.round(this.live[0].t * 100) / 100 : 0,
    };
  }

  public destroy(): void {
    this.live.length = 0;
    this.freeChunks.length = 0;
    this.group.destroy(true);
  }
}
