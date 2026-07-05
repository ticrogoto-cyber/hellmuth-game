import Phaser from "phaser";
import type { FactionId } from "../data/loader";
import { getFxSystem } from "./fx";
import { PALETTE, rgbTriple } from "../fx/palette";
import { mulberry32, stampDraws, hashXY } from "../fx/stamp_hash";
import { BLOOD_PERSIST_FADE } from "../data/balance";
import { gridWorldRect } from "./map_texture";

// BLUT & LEICHEN (Paket B). Blut ist in HELLMUTH keine Nebensache -- es traegt
// Funktion. Zwei Stufen, zwei Substanzen, KEIN Tint:
//   HELLMUTH = rotes Menschenblut (matt, unregelmaessig, weicher Saum)
//   MODERAT  = magenta klebrige Ploerre (glaenzend, dickfluessig, eigenes Set)
//
// Stufe 1 (Fenster-RT, ~80 % allen Bluts): eine kamera-verankerte RenderTexture
//   (2048x1536 @ halber Bodenaufloesung = 12,6 MB), Tiefe zwischen Terrain und
//   Decals. Jeder Treffer/jede Toetung stempelt hierher; FIFO-Verblassen.
// Stufe 2 (persistent, weltgenagelt, ~20 %): bleibt fuer immer am Weltpunkt.
//   Der Persistenz-MECHANISMUS (kartenweite Low-Res-RT vs. gepoolte Decals vs.
//   Hybrid) ist designkritisch und liegt bei Ticro -> Stage2Backend-Schnittstelle,
//   bis die Wahl getroffen ist; bis dahin sind Stufe-2-Marken im Fenster sichtbar.
//
// Erste RenderTexture im Projekt (Census: bisher nur addCanvas/Images/Partikel).
// Terrain-Chunks sind CanvasTexture -> rt.draw darauf unmoeglich; Blut bekommt
// daher seine EIGENE RT.

export type BloodSub = "hellmuth" | "moderat";

const SPLAT_KEYS: Record<BloodSub, string[]> = {
  hellmuth: ["blut-hellmuth-1", "blut-hellmuth-2", "blut-hellmuth-3", "blut-hellmuth-4"],
  moderat: ["ploerre-moderat-1", "ploerre-moderat-2", "ploerre-moderat-3", "ploerre-moderat-4"],
};
const EXPLO_KEYS: Record<BloodSub, string[]> = {
  hellmuth: ["blut-explo-1", "blut-explo-2"],
  moderat: ["ploerre-explo-1", "ploerre-explo-2"],
};

// Slot-System (Blut-Paket B / Strang 6): pro Effektklasse ein eigenes Textur-Set
// je Substanz. Die prozeduralen Platzhalter liegen unter denselben Schluesseln;
// Ticros KREA-PNGs fallen ueber das exists()-Gate + SPRITE_MANIFEST kommentarlos
// ein. Aufloesungen (Ziel): puddle 512x4, splash 256x3, drip 128x3, landing 256x3.
export type BloodSlot = "puddle" | "splash" | "drip" | "landing";
const SLOT_KEYS: Record<BloodSlot, Record<BloodSub, string[]>> = {
  puddle: SPLAT_KEYS,
  splash: {
    hellmuth: ["splash-hellmuth-1", "splash-hellmuth-2", "splash-hellmuth-3"],
    moderat: ["splash-moderat-1", "splash-moderat-2", "splash-moderat-3"],
  },
  drip: {
    hellmuth: ["drip-hellmuth-1", "drip-hellmuth-2", "drip-hellmuth-3"],
    moderat: ["drip-moderat-1", "drip-moderat-2", "drip-moderat-3"],
  },
  landing: {
    hellmuth: ["landing-hellmuth-1", "landing-hellmuth-2", "landing-hellmuth-3"],
    moderat: ["landing-moderat-1", "landing-moderat-2", "landing-moderat-3"],
  },
};
const SLOT_SIZE: Record<Exclude<BloodSlot, "puddle">, number> = { splash: 256, drip: 128, landing: 256 };

/** Texturschluessel eines Slots fuer eine Substanz; r in [0,1) waehlt die
 *  Variante. Gefechts-VFX Paket 6: r kommt aus dem positions-gehashten Strom
 *  (stampDraws), NICHT aus Math.random -- Splatter ist replay-identisch. */
export function slotKey(slot: BloodSlot, sub: BloodSub, r: number): string {
  const keys = SLOT_KEYS[slot][sub];
  return keys[Math.min(keys.length - 1, (r * keys.length) | 0)];
}

// Positions-Hash fuer die deterministische Stempel-Ausrichtung (Paket 6, H5:
// "seeded Rotation aus dem Sim-Event"): stampDraws aus src/fx/stamp_hash.ts
// (Phaser-frei, headless testbar -- Beweis 4). Reihenfolge-UNABHAENGIG: Winkel,
// Flip, Skala und Varianten-Wahl haengen nur vom Weltpunkt des Sim-Events ab.
const WHITE_KEY = "blood_fade_white";
// Scorch/Brand-Decal (geteilt mit Paket C): dunkler, flacher Brandfleck. Wird in
// die Stufe-2-RT gestempelt (bleibt) -- Sieg-Feedback »gut zum Vernichten«.
const SCORCH_KEY = "fx_scorch";

// Fenster-RT-Geometrie. RT-Pixel = RT_SCALE Welt-Pixel (halbe Aufloesung), die
// RT deckt damit WORLD_W x WORLD_H Welt-Pixel ab.
const RT_W = 2048;
const RT_H = 1536;
const RT_SCALE = 2;
const WORLD_W = RT_W * RT_SCALE; // 4096
const WORLD_H = RT_H * RT_SCALE; // 3072
// Tiefe: zwischen Terrain/Megatextur (-99000/-100000) und Decals (-90000).
const BLOOD_DEPTH = -96000;
// Stufe 2 liegt knapp unter dem Fenster: frisches Blut ueberlagert die Dauerspur.
const PERSIST_DEPTH = -97000;
// Stempel-Drossel + FIFO-Verblassen (nur Fenster-RT; die persistente Stufe 2
// bleibt per Default liegen -- H5/Paket 6, Bremse via BLOOD_PERSIST_FADE).
const DRAW_CAP = 24; // Stempel pro Frame
const FADE_PERIOD_MS = 6000;
const FADE_ALPHA = 0.06;
// Recenter, wenn die Kameramitte den inneren Fensterbereich verlaesst.
const RECENTER_TRIGGER = 0.24;
// Anteil normaler Toetungen mit bleibender (Stufe-2-)Spur.
const PERSIST_KILL_CHANCE = 0.2;

interface PendingStamp {
  key: string;
  wx: number;
  wy: number;
  scale: number;
  angle: number;
  alpha: number;
  flipX: boolean;
}

/**
 * Backend der persistenten Stufe (weltgenagelt). KANON-Update: Blut bleibt NICHT
 * mehr fuer immer -- die Stufe-2-RT verblasst ueber ~5 min (kein 20/80-Ewigkeits-
 * Split). fade() senkt die Ziel-Alpha einen Schritt; fillLevel() ist der (decay-
 * gewichtete) Fuellgrad-Proxy fuer die Abnahme »konstant, nicht wachsend«.
 */
export interface Stage2Backend {
  stamp(worldX: number, worldY: number, key: string, scale: number, angle: number, flipX: boolean): void;
  fade(): void;
  fillLevel(): number;
  clear(): void;
  destroy(): void;
}

export function factionSub(f?: FactionId): BloodSub {
  return f === "moderat" ? "moderat" : "hellmuth";
}

/** Hash-Ableitung fuer Kill-Splatter-Satelliten: eigener uint32-Salt je i, sodass
 *  jeder Satellit einen unabhaengigen mulberry32-Stream bekommt. */
function mulberryOffset(wx: number, wy: number, i: number): number {
  return hashXY(wx, wy, 0x5157 + i * 0x2b);
}

// Fraktion -> Substanz, explizit (Kanon, ohne Eingriff in die Kampflogik):
// HELLMUTH blutet rotes Blut, MODERAT Magenta-Ploerre. NORMAL-Blend, kein Tint
// auf einer Substanz -- es sind zwei eigene Texturen.
export const FACTION_SUBSTANCE: Record<FactionId, BloodSub> = {
  hellmuth: "hellmuth",
  moderat: "moderat",
};

// Substanz-Grundfarbe (fuer getintete NORMAL-Drops der Fontaene). HELLMUTH
// dunkelrot (physikalisch, bleibt lokal), MODERAT Sirup aus der FX-Palette.
export function substanceColor(sub: BloodSub): number {
  return sub === "moderat" ? PALETTE.SIRUP : 0x961212;
}

/** Texturschluessel des weichen NORMAL-Tropfens fuer die Spritz-Fontaene. */
export const DROP_KEY = "blood_drop";

// --- prozedurale Substanz-Texturen (Platzhalter; echtes PNG gleichen Schluessels
// ueberschreibt via exists()-Gate). Reine Mal-Operationen -> Projekt-§7. ---

// mulberry32 kommt aus src/fx/stamp_hash.ts (ein Generator, kein Duplikat).

function blob(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  rgb: [number, number, number],
  a: number,
): void {
  const [cr, cg, cb] = rgb;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  // Solider Kern, weicher (nicht harter = comichaft) Rand.
  g.addColorStop(0, `rgba(${cr},${cg},${cb},${a})`);
  g.addColorStop(0.55, `rgba(${cr},${cg},${cb},${a * 0.85})`);
  g.addColorStop(0.85, `rgba(${cr},${cg},${cb},${a * 0.32})`);
  g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// Zeichnet eine Substanz-Pfuetze. glossy=true -> Ploerre (rund, dick, Glanzpunkt,
// klebrige Faeden); glossy=false -> Blut (matt, unregelmaessig, dunkler Kern).
function drawSplat(
  ctx: CanvasRenderingContext2D,
  size: number,
  base: [number, number, number],
  dark: [number, number, number],
  glossy: boolean,
  seed: number,
): void {
  const rnd = mulberry32(seed);
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2 + (rnd() - 0.5) * size * 0.08;
  const cy = size / 2 + (rnd() - 0.5) * size * 0.08;
  const R = size * (glossy ? 0.3 : 0.28) + rnd() * size * 0.06;

  // Hauptpfuetze
  blob(ctx, cx, cy, R, base, glossy ? 0.92 : 0.95);
  // Lappen (Blut unregelmaessiger als Ploerre)
  const lobes = glossy ? 4 : 7;
  for (let k = 0; k < lobes; k++) {
    const a = rnd() * Math.PI * 2;
    const d = R * (0.45 + rnd() * 0.6);
    blob(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d, R * (0.22 + rnd() * 0.32), base, 0.7);
  }
  // Spritzer
  const drops = glossy ? 4 : 9;
  for (let k = 0; k < drops; k++) {
    const a = rnd() * Math.PI * 2;
    const d = R * (1.0 + rnd() * 0.95);
    blob(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d, size * 0.015 + rnd() * size * 0.045, base, 0.55 + rnd() * 0.35);
  }

  if (glossy) {
    // klebrige Faeden zwischen Pfuetze und Spritzern
    ctx.lineCap = "round";
    for (let k = 0; k < 3; k++) {
      const a = rnd() * Math.PI * 2;
      const d = R * (1.1 + rnd() * 0.7);
      ctx.strokeStyle = `rgba(${base[0]},${base[1]},${base[2]},0.45)`;
      ctx.lineWidth = size * (0.012 + rnd() * 0.01);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
      ctx.stroke();
    }
    // Glanzpunkt (nass/glaenzend) -> liest als andere Substanz. BLUT-KALIBRIERUNG:
    // Highlight halbiert (0.5 -> 0.22, 0.65 -> 0.3), damit die Ploerre nicht als
    // Dauer-Bonbon leuchtet. Kanon: kurze frisch-glaenzende Phase, dann matt.
    const hx = cx - R * 0.32;
    const hy = cy - R * 0.36;
    blob(ctx, hx, hy, R * 0.34, [255, 205, 245], 0.22);
    blob(ctx, hx, hy, R * 0.12, [255, 255, 255], 0.30);
  } else {
    // dunkler Blutkern (geronnen, matt)
    blob(ctx, cx, cy, R * 0.42, dark, 0.55);
  }
}

const HELLMUTH_BASE: [number, number, number] = [150, 18, 18];
const HELLMUTH_DARK: [number, number, number] = [70, 6, 8];
// MODERAT-Ploerre aus der Sirup-Familie der FX-Palette (Paket 1).
const MODERAT_BASE: [number, number, number] = rgbTriple(PALETTE.SIRUP_GLINT);
const MODERAT_DARK: [number, number, number] = rgbTriple(PALETTE.SIRUP_TIEF);

// Flacher, dunkler Brandfleck (256x128, Anker 0.5/0.85): elliptisch gestaucht.
function drawScorch(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h / 2;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, w / 2);
  g.addColorStop(0, "rgba(10,7,4,0.95)");
  g.addColorStop(0.45, "rgba(18,13,8,0.8)");
  g.addColorStop(0.78, "rgba(24,18,12,0.38)");
  g.addColorStop(1, "rgba(24,18,12,0)");
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, h / w); // flachdruecken -> Bodenfleck
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, w / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function ensureWhite(scene: Phaser.Scene): void {
  if (scene.textures.exists(WHITE_KEY)) return;
  const g = scene.add.graphics();
  g.fillStyle(0xffffff, 1).fillRect(0, 0, 8, 8);
  g.generateTexture(WHITE_KEY, 8, 8);
  g.destroy();
}

function ensureSubstanceTextures(scene: Phaser.Scene): void {
  ensureWhite(scene);
  const make = (key: string, size: number, sub: BloodSub, seed: number): void => {
    if (scene.textures.exists(key)) return; // echtes PNG hat Vorrang
    const tex = scene.textures.createCanvas(key, size, size);
    if (!tex) return;
    const ctx = tex.getContext();
    if (sub === "moderat") drawSplat(ctx, size, MODERAT_BASE, MODERAT_DARK, true, seed);
    else drawSplat(ctx, size, HELLMUTH_BASE, HELLMUTH_DARK, false, seed);
    tex.refresh();
  };
  (["hellmuth", "moderat"] as BloodSub[]).forEach((sub) => {
    SPLAT_KEYS[sub].forEach((k, i) => make(k, 512, sub, 1009 * (sub === "moderat" ? 7 : 3) + i * 131));
    EXPLO_KEYS[sub].forEach((k, i) => make(k, 768, sub, 7777 * (sub === "moderat" ? 5 : 2) + i * 313));
  });
  // Neue Slots (splash/drip/landing) als Platzhalter; echtes PNG ueberschreibt.
  (["splash", "drip", "landing"] as Array<Exclude<BloodSlot, "puddle">>).forEach((slot) => {
    (["hellmuth", "moderat"] as BloodSub[]).forEach((sub) => {
      SLOT_KEYS[slot][sub].forEach((k, i) => make(k, SLOT_SIZE[slot], sub, 4201 * (sub === "moderat" ? 9 : 4) + slot.length * 17 + i * 91));
    });
  });
  if (!scene.textures.exists(SCORCH_KEY)) {
    const t = scene.textures.createCanvas(SCORCH_KEY, 256, 128);
    if (t) {
      drawScorch(t.getContext(), 256, 128);
      t.refresh();
    }
  }
  if (!scene.textures.exists(DROP_KEY)) {
    const t = scene.textures.createCanvas(DROP_KEY, 24, 24);
    if (t) {
      const c = t.getContext();
      const g = c.createRadialGradient(12, 12, 0, 12, 12, 12);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.62, "rgba(255,255,255,0.85)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.beginPath();
      c.arc(12, 12, 12, 0, Math.PI * 2);
      c.fill();
      t.refresh();
    }
  }
}

// --- Stufe-2-Backend: Hybrid Low-Res-RT (Ticros Wahl) ----------------------
// Eine kartengrosse RenderTexture in halber Bodenaufloesung, LAZY allokiert (erst
// beim ersten persistenten Stempel) und nur in der gespielten Kartengroesse. Sie
// ist ein FESTER Puffer, waechst NIE; KANON-Update: sie verblasst ueber ~5 min
// (fade()/ERASE, kein Ewigkeits-Split). Bei sehr grossen Karten stuft die
// Aufloesung herunter (GPU-Texturlimit). Hinter Stage2Backend -> austauschbar.
class HybridPersistBackend implements Stage2Backend {
  private rt?: Phaser.GameObjects.RenderTexture;
  private fadeQuad?: Phaser.GameObjects.Image;
  private originX = 0;
  private originY = 0;
  private res = RT_SCALE;
  private count = 0;
  private fill = 0; // decay-gewichteter Fuellgrad-Proxy

  constructor(private readonly scene: Phaser.Scene) {}

  private maxTextureSize(): number {
    const gl = (this.scene.renderer as unknown as { gl?: WebGLRenderingContext }).gl;
    if (gl) {
      try {
        return Math.min(8192, gl.getParameter(gl.MAX_TEXTURE_SIZE) as number);
      } catch {
        /* faellt auf den sicheren Default */
      }
    }
    return 4096; // Canvas-Renderer o. ae.
  }

  private ensure(): Phaser.GameObjects.RenderTexture {
    if (this.rt) return this.rt;
    const rect = gridWorldRect();
    const max = this.maxTextureSize();
    let res = RT_SCALE; // halbe Bodenaufloesung
    while (Math.ceil(rect.width / res) > max || Math.ceil(rect.height / res) > max) res *= 2;
    this.res = res;
    this.originX = rect.x;
    this.originY = rect.y;
    const tw = Math.ceil(rect.width / res);
    const th = Math.ceil(rect.height / res);
    this.rt = this.scene.add
      .renderTexture(rect.x, rect.y, tw, th)
      .setOrigin(0, 0)
      .setDepth(PERSIST_DEPTH)
      .setScale(res);
    // Verblass-Quad (ERASE) auf RT-Texturgroesse: senkt je fade() die Ziel-Alpha.
    // Alpha aus dem Balance-Flag (Paket 6: Saettigungsbremse 0.02, optional).
    this.fadeQuad = this.scene.make.image({ x: 0, y: 0, key: WHITE_KEY, add: false });
    this.fadeQuad.setOrigin(0, 0).setDisplaySize(tw, th).setAlpha(BLOOD_PERSIST_FADE.alpha);
    return this.rt;
  }

  public stamp(wx: number, wy: number, key: string, scale: number, angle: number, flipX: boolean): void {
    const rt = this.ensure();
    const lx = (wx - this.originX) / this.res;
    const ly = (wy - this.originY) / this.res;
    const s = scale / this.res;
    rt.stamp(key, undefined, lx, ly, {
      alpha: 0.95,
      angle,
      scaleX: (flipX ? -1 : 1) * s,
      scaleY: s,
      originX: 0.5,
      originY: 0.5,
    });
    this.count++;
    this.fill++;
  }

  /** Ein Verblass-Schritt (ERASE, Saettigungsbremse). Wird von BloodSystem nur
   *  bei BLOOD_PERSIST_FADE.enabled getrieben (Default: liegen lassen). */
  public fade(): void {
    if (!this.rt || !this.fadeQuad) return; // noch nichts allokiert
    this.rt.erase(this.fadeQuad, 0, 0);
    this.fill *= 1 - BLOOD_PERSIST_FADE.alpha;
  }

  public fillLevel(): number {
    return Math.round(this.fill * 10) / 10;
  }

  public stamps(): number {
    return this.count;
  }

  public clear(): void {
    this.rt?.clear();
    this.count = 0;
    this.fill = 0;
  }

  public destroy(): void {
    this.fadeQuad?.destroy();
    this.fadeQuad = undefined;
    this.rt?.destroy();
    this.rt = undefined;
  }
}

// --- Per-Scene-Singleton ---

const systems = new WeakMap<Phaser.Scene, BloodSystem>();

export function getBloodSystem(scene: Phaser.Scene): BloodSystem {
  let s = systems.get(scene);
  if (!s) {
    s = new BloodSystem(scene);
    systems.set(scene, s);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => systems.delete(scene));
  }
  return s;
}

export class BloodSystem {
  private readonly rt: Phaser.GameObjects.RenderTexture;
  private readonly fadeQuad: Phaser.GameObjects.Image;
  private readonly queue: PendingStamp[] = [];
  private originX = 0;
  private originY = 0;
  private lastFade = 0;
  private lastPersistFade = 0;
  private stage2?: Stage2Backend;
  private stamped = 0; // Diagnose
  private persisted = 0; // Diagnose
  private scorched = 0; // Diagnose

  constructor(private readonly scene: Phaser.Scene) {
    ensureSubstanceTextures(scene);
    this.rt = scene.add
      .renderTexture(0, 0, RT_W, RT_H)
      .setOrigin(0, 0)
      .setDepth(BLOOD_DEPTH)
      .setScale(RT_SCALE); // halbe Aufloesung -> deckt WORLD_W x WORLD_H ab
    // Verblass-Quad (nicht in der Display-List): per ERASE-Blend reduziert es die
    // Ziel-Alpha um FADE_ALPHA -- blendet Blut Richtung TRANSPARENT (nicht Schwarz,
    // wie es fill(0x000000) ueber den leeren Bereichen taete).
    this.fadeQuad = scene.make.image({ x: 0, y: 0, key: WHITE_KEY, add: false });
    this.fadeQuad.setOrigin(0, 0).setDisplaySize(RT_W, RT_H).setAlpha(FADE_ALPHA);

    // Anfangs auf die Kartenmitte zentrieren (zentrales Schlachtfeld).
    const cam = scene.cameras.main;
    this.recenter(cam.midPoint.x, cam.midPoint.y);

    const onUpdate = (time: number, delta: number): void => this.tick(time, delta);
    scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
      this.destroy();
    });
    // Handle fuer die Headless-Mess-Bruecke (tools/fx_browser.mjs).
    (scene as unknown as { blood?: BloodSystem }).blood = this;
  }

  /** Tauscht das Persistenz-Backend (Stufe 2) aus. Default ist das Hybrid-RT;
   *  hierueber laesst es sich durch ein anderes Backend ersetzen. */
  public setStage2Backend(backend: Stage2Backend): void {
    this.stage2?.destroy();
    this.stage2 = backend;
  }

  /** Liefert das Stufe-2-Backend; legt LAZY das Default-Hybrid an (Ticros Wahl),
   *  falls keins injiziert wurde. Lazy = Absicherung; austauschbar bleibt es. */
  private ensureStage2(): Stage2Backend {
    if (!this.stage2) this.stage2 = new HybridPersistBackend(this.scene);
    return this.stage2;
  }

  private recenter(cx: number, cy: number): void {
    this.originX = cx - WORLD_W / 2;
    this.originY = cy - WORLD_H / 2;
    this.rt.setPosition(this.originX, this.originY);
    this.rt.clear();
  }

  /** Liegt der Weltpunkt im aktuellen Fenster? */
  private inWindow(wx: number, wy: number): boolean {
    return wx >= this.originX && wx <= this.originX + WORLD_W && wy >= this.originY && wy <= this.originY + WORLD_H;
  }

  /**
   * Stufe 1: stempelt einen jitternden Substanz-Klecks ins Fenster (Treffer/Tod).
   * scale ~ Welt-Anzeigegroesse (1 ~ Texturgroesse). Gepuffert; pro Frame DRAW_CAP.
   */
  public stampWindow(wx: number, wy: number, faction: FactionId | undefined, scale: number): void {
    this.stampWindowSlot(wx, wy, faction, scale, "puddle");
  }

  /** Wie stampWindow, aber mit explizitem Slot (splash/drip/landing/puddle).
   *  Ausrichtung deterministisch aus dem Sim-Event-Punkt (Paket 6).
   *
   *  BLUT-KALIBRIERUNG (CODE4 BLUT+MAGENTA Paket 1): Alpha auf ~1/3 des alten
   *  Bereichs abgesenkt (war 0.72..1.00 -> jetzt 0.22..0.34). Bodenbelag-Bild
   *  ("Fussballplatz voller Blut") kam aus voll-alpha Stempeln, nicht aus zu
   *  vielen -- der Fix sitzt HIER an der Alpha-Quelle, nicht in einem zweiten
   *  Faktor oben. Grosse Splatter-Ausdehnung wird von stampKillSplatter geloest,
   *  das statt eines grossen Stempels 3-5 kleine emittiert. */
  public stampWindowSlot(wx: number, wy: number, faction: FactionId | undefined, scale: number, slot: BloodSlot): void {
    const [r1, r2, r3, r4] = stampDraws(wx, wy);
    this.queue.push({
      key: slotKey(slot, factionSub(faction), r1),
      wx,
      wy,
      scale: scale * (0.82 + r2 * 0.36),
      angle: r3 * 360,
      alpha: 0.22 + r4 * 0.12, // war 0.72 + r4 * 0.28 -> Blut, nicht Bodenbelag
      flipX: r2 < 0.5,
    });
  }

  /** Tod-Splatter (CODE4 BLUT+MAGENTA Paket 1): statt EINEM grossen Puddle-Stempel
   *  emittiert dies 3-5 kleine Splatter-Marken in einem engen Ring um den Todes-
   *  punkt. Groesse ~ halbe Kachel (spec-konform). Positionen und Anzahl aus dem
   *  Positions-Hash (deterministisch, reihenfolge-invariant). Ersetzt den bisher
   *  einzelnen stampWindow(scale=0.55)-Aufruf in death_fx.onUnitDied. */
  public stampKillSplatter(wx: number, wy: number, faction: FactionId | undefined, baseScale: number): void {
    const [r1, r2, r3, r4] = stampDraws(wx, wy);
    const n = 3 + Math.floor(r1 * 3); // 3..5 Stempel
    const sub = factionSub(faction);
    for (let i = 0; i < n; i++) {
      // Kleiner deterministischer Ring um (wx, wy): eigener Hash je i, damit
      // Reihenfolge egal ist. Radius ~ 6..14 Welt-px (unter halber Kachel).
      const rnd = mulberry32(mulberryOffset(wx, wy, i));
      const angle = rnd() * Math.PI * 2;
      const radius = 6 + rnd() * 8;
      const jx = Math.cos(angle) * radius;
      const jy = Math.sin(angle) * radius;
      // Sprite ist 512px; Ziel <= halbe Kachel = 80 Welt-px => scaleWorld ~ 80/512 = 0.156.
      // Wir nehmen 0.10..0.15 als Grundstock (spec: ~10% des alten Werts 0.55).
      const scale = baseScale * (0.10 + rnd() * 0.05);
      const [rr1] = [rnd()];
      this.queue.push({
        key: slotKey("puddle", sub, rr1),
        wx: wx + jx,
        wy: wy + jy,
        scale,
        angle: (rnd() * 2 - 1) * 45, // +/-45 Grad statt vollem Kreis (nasse Landung)
        alpha: 0.28 + rnd() * 0.10, // matte Landung, kein Voll-Alpha
        flipX: rnd() < 0.5,
      });
    }
    // Verwender-Signal: r2/r3/r4 wurden zur Winkelvorbereitung/Diagnose verbraucht.
    void r2; void r3; void r4;
  }

  /**
   * Generischer Fenster-Stempel mit explizitem Texturschluessel (z. B. Truemmer
   * beim Bodenkontakt, Paket D). Geht durch dieselbe Drossel wie das Blut.
   */
  public stampWindowDecal(wx: number, wy: number, key: string, scale: number): void {
    const [r1, r2] = stampDraws(wx, wy);
    this.queue.push({
      key,
      wx,
      wy,
      scale: scale * (0.85 + r1 * 0.3),
      angle: r2 * 360,
      alpha: 0.9,
      flipX: r1 < 0.5,
    });
  }

  /**
   * Persistente (Stufe-2-)Marke: weltgenagelt fuer immer. Sichtbar bereits im
   * Fenster; das echte Backend (Ticro-Entscheidung) nagelt sie zusaetzlich fest.
   */
  public stampPersistent(wx: number, wy: number, faction: FactionId | undefined, scale: number): void {
    this.stampPersistentSlot(wx, wy, faction, scale, "puddle");
  }

  /** Wie stampPersistent, aber mit explizitem Slot. Default: bleibt liegen
   *  (H5); Verblassen nur mit BLOOD_PERSIST_FADE.enabled. */
  public stampPersistentSlot(wx: number, wy: number, faction: FactionId | undefined, scale: number, slot: BloodSlot): void {
    const [r1, r2, r3] = stampDraws(wx, wy);
    this.ensureStage2().stamp(wx, wy, slotKey(slot, factionSub(faction), r1), scale, r2 * 360, r3 < 0.5);
    this.persisted++;
  }

  /** ~20-%-Wuerfel fuer eine bleibende Spur bei einer normalen Toetung --
   *  deterministisch aus dem Event-Punkt (Paket 6), kein Math.random. */
  public maybePersistKill(wx: number, wy: number, faction: FactionId | undefined, scale: number): void {
    const [, , , r4] = stampDraws(wx, wy);
    if (r4 < PERSIST_KILL_CHANCE) this.stampPersistent(wx, wy, faction, scale);
  }

  /**
   * Brandfleck (Paket C): wird weltgenagelt in die Stufe-2-RT gestempelt (bleibt
   * = Layer-Spec). scorch-Permanenz ist Ticros offener Punkt -> hier per Default
   * persistent; ueber ein anderes Stage2Backend/Toggle spaeter aenderbar.
   */
  public stampScorch(wx: number, wy: number, scale: number): void {
    const [r1, r2] = stampDraws(wx, wy);
    this.ensureStage2().stamp(wx, wy, SCORCH_KEY, scale, r1 * 30 - 15, r2 < 0.5);
    this.scorched++;
  }

  /**
   * Blutexplosion (Naht zu Paket C): grosser persistenter Stempel + Gib-Burst
   * ueber den Paket-A-Partikel-Pool. KEIN Feuer/Scorch. Paket C ruft das via
   * fx.explosion(register:'blood') auf.
   */
  public bloodBurst(wx: number, wy: number, faction: FactionId | undefined, scale: number): void {
    const sub = factionSub(faction);
    const explo = EXPLO_KEYS[sub];
    const [r1, r2, r3] = stampDraws(wx, wy);
    const key = explo[Math.min(explo.length - 1, (r1 * explo.length) | 0)];
    // grosser, weltgenagelter Stufe-2-Stempel (bleibt fuer immer).
    this.ensureStage2().stamp(wx, wy, key, scale, r2 * 360, r3 < 0.5);
    this.persisted++;
    // Gib-Burst (Funken, fraktionsfarbig) ueber den gehaerteten Pool aus Paket A.
    const color = sub === "moderat" ? PALETTE.MAGENTA_GLOW : 0xb01818;
    getFxSystem(this.scene).burst(wx, wy - 12, { color, count: Math.round(16 * scale), speed: 150 * scale, scale: 1.4 });
  }

  private tick(time: number, _delta: number): void {
    // Kamera folgen: Fenster nachfuehren, wenn die Mitte den inneren Bereich
    // verlaesst. Recenter loescht -> Blut weit ausserhalb faellt heraus (Design).
    const cam = this.scene.cameras.main;
    const dx = Math.abs(cam.midPoint.x - (this.originX + WORLD_W / 2));
    const dy = Math.abs(cam.midPoint.y - (this.originY + WORLD_H / 2));
    if (dx > WORLD_W * RECENTER_TRIGGER || dy > WORLD_H * RECENTER_TRIGGER) {
      this.recenter(cam.midPoint.x, cam.midPoint.y);
    }

    // Stempel-Drossel: hoechstens DRAW_CAP pro Frame ins Fenster.
    let n = 0;
    while (this.queue.length > 0 && n < DRAW_CAP) {
      const s = this.queue.shift() as PendingStamp;
      n++;
      if (!this.inWindow(s.wx, s.wy)) continue; // ausserhalb des Fensters -> faellt raus
      const lx = (s.wx - this.originX) / RT_SCALE;
      const ly = (s.wy - this.originY) / RT_SCALE;
      const rtScale = s.scale / RT_SCALE;
      this.rt.stamp(s.key, undefined, lx, ly, {
        alpha: s.alpha,
        angle: s.angle,
        scaleX: (s.flipX ? -1 : 1) * rtScale,
        scaleY: rtScale,
        originX: 0.5,
        originY: 0.5,
      });
      this.stamped++;
    }

    // FIFO-Verblassen im 6-s-Takt: NUR das Fenster (0,06). Stufe 2 bleibt per
    // Default fuer immer liegen (H5/Paket 6, MODERAT-Aesthetik); die optionale
    // Saettigungsbremse (ERASE alpha 0.02 alle ~10 s) haengt am Balance-Flag.
    if (time - this.lastFade >= FADE_PERIOD_MS) {
      this.lastFade = time;
      this.rt.erase(this.fadeQuad, 0, 0);
    }
    if (BLOOD_PERSIST_FADE.enabled && time - this.lastPersistFade >= BLOOD_PERSIST_FADE.periodMs) {
      this.lastPersistFade = time;
      this.stage2?.fade();
    }
  }

  /**
   * Diagnose/Test: fuehrt n Stufe-2-Verblass-Schritte sofort aus (entspricht n*6 s
   * Spielzeit). Erlaubt der Mess-Bruecke, den ~5-min-Fade ohne 5 reale Minuten zu
   * pruefen (headless laeuft die Uhr im Slowmo).
   */
  public pumpPersistFade(n: number): void {
    for (let i = 0; i < n; i++) this.stage2?.fade();
  }

  /** Diagnose fuer die Mess-Bruecke. */
  public stats(): {
    stamped: number;
    queued: number;
    persisted: number;
    scorched: number;
    persistFill: number;
    hasStage2: boolean;
    window: [number, number, number, number];
  } {
    return {
      stamped: this.stamped,
      queued: this.queue.length,
      persisted: this.persisted,
      scorched: this.scorched,
      persistFill: this.stage2?.fillLevel() ?? 0,
      hasStage2: !!this.stage2,
      window: [this.originX, this.originY, WORLD_W, WORLD_H],
    };
  }

  public destroy(): void {
    this.queue.length = 0;
    this.stage2?.destroy();
    this.fadeQuad.destroy();
    this.rt.destroy();
  }
}
