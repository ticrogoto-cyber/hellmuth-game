import Phaser from "phaser";
import type { FxService } from "./fx_service";
import type { FxOpts } from "./fx_types";
import { GROUND_MIST } from "../data/balance";

// Lokale Nebel-Partikel (Strang 11, NEBEL-TIEFE-SPEC §3) -- das dezente Salz UEBER
// der globalen Atmo-Schicht. STRUKTUR FINAL, AKTIVIERUNG SPAETER: GROUND_MIST.enabled
// ist Default AUS. Zwei gepoolte Typen (wie debris_system / corpse_pulse): Treiber-
// basiert (ctx.drive), Hard-Cap je Typ + globaler totalCap gegen Mehrzonen-Akkumu-
// lation, Alpha-Huegel 0->peak->0 (Compositing-geprueft <= 0.55 ueber der Grund-
// schicht). Bewegung in ·dt (framerate-robust). Pool gibt bei Tod zwingend frei
// (kein Leck; pool.stats() macht live monoton sichtbar). Tint global neutral.

const PUFF_KEY = "__mist_puff"; // radial, pow 1.3 (Typ A Bodenschwade)
const WISP_KEY = "__mist_wisp_soft"; // radial, pow 1.05 (Typ B breit/weich)
const TAU = Math.PI * 2;

// Live-Zaehler je Typ (Treiber dekrementiert bei Tod). totalLive = Summe.
let groundLive = 0;
let wispLive = 0;
const totalLive = (): number => groundLive + wispLive;

const rand = (a: number, b: number): number => a + Math.random() * (b - a);
const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
/** Alpha-Huegel: 0 am Anfang, 1 bei `peakAt` (Anteil), 0 am Ende. */
const hill = (u: number, peakAt: number): number =>
  u < peakAt ? smoothstep(0, peakAt, u) : 1 - smoothstep(peakAt, 1, u);

/** Radiale Alpha-Textur (weiss, Mitte 1 -> Rand 0, Exponent steuert die Weichheit). */
function ensureRadial(scene: Phaser.Scene, key: string, res: number, pow: number): void {
  if (scene.textures.exists(key)) return;
  const cv = document.createElement("canvas");
  cv.width = res;
  cv.height = res;
  const ctx = cv.getContext("2d");
  if (!ctx) return;
  const img = ctx.createImageData(res, res);
  const d = img.data;
  const c = (res - 1) / 2;
  for (let y = 0; y < res; y++) {
    for (let x = 0; x < res; x++) {
      const dx = (x - c) / c;
      const dy = (y - c) / c;
      const r = Math.min(1, Math.hypot(dx, dy));
      const a = Math.round(Math.pow(1 - r, pow) * 255);
      const i = (y * res + x) * 4;
      d[i] = 255;
      d[i + 1] = 255;
      d[i + 2] = 255;
      d[i + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  scene.textures.addCanvas(key, cv);
}

export function ensureMistTextures(scene: Phaser.Scene): void {
  ensureRadial(scene, PUFF_KEY, 128, 1.3);
  ensureRadial(scene, WISP_KEY, 256, 1.05);
}

/** Diagnose fuer das Pool-Leck-Gate (NEBEL-TIEFE-SPEC §5(e)). */
export function mistStats(): { count: number; ground: number; wisp: number } {
  return { count: totalLive(), ground: groundLive, wisp: wispLive };
}

/**
 * Registriert die zwei Partikel-Handler am Effekt-Dienst (wie registerCoreFx).
 * Sie EXISTIEREN damit, werden aber nur gefeuert, wenn jemand sie spawnt -- der
 * Zonen-Emitter (maybeEmitMist) ist Default AUS, also bleibt es ohne Aktivierung
 * ein No-Op (0 Partikel, 0 Kosten).
 */
export function registerGroundMist(fx: FxService): void {
  // Die Live-Zaehler/Throttle sind modul-global; FxService.destroy() laesst aktive
  // Treiber ohne ihre Sterbe-Verzweigung fallen, also wuerden Restwerte ueber den
  // Scene-Neustart bluten und den Cap dauerhaft saettigen. registerGroundMist laeuft
  // EINMAL je Scene (installFx) -> hier hart zuruecksetzen = sauberer Startzustand.
  groundLive = 0;
  wispLive = 0;
  groundAcc = 0;
  wispAcc = 0;
  wispNext = GROUND_MIST.mistWisp.spawnMsMin;

  // Texturen werden beim ersten Spawn lazy gebaut (ctx.scene), nicht hier --
  // der Dienst legt seine Scene bewusst nicht offen.

  // Typ A -- Bodennebel-Schwade: langsame Expansion, Sinus-Maeander auf vx.
  fx.register("ground_mist", (ctx, x, y, _o: FxOpts) => {
    const P = GROUND_MIST.groundMist;
    if (totalLive() >= GROUND_MIST.totalCap || groundLive >= P.cap) return; // Cap -> kein Spawn
    ensureMistTextures(ctx.scene);
    groundLive++;
    const img = ctx.pool.acquire("ground_mist", () => ctx.scene.add.image(0, 0, PUFF_KEY));
    const life = rand(P.lifeMin, P.lifeMax);
    const vx0 = (Math.random() * 2 - 1) * P.vxMax;
    const vy = rand(P.vyMin, P.vyMax);
    const period = rand(P.meanderPeriodMin, P.meanderPeriodMax);
    const phase = Math.random() * TAU;
    let px = x;
    let py = y;
    let t = 0;
    img
      .setTexture(PUFF_KEY)
      .setBlendMode(Phaser.BlendModes.NORMAL)
      .setTint(GROUND_MIST.tint)
      .setDepth(GROUND_MIST.depth)
      .setPosition(x, y)
      .setAlpha(0)
      .setScale(P.scaleFrom);
    ctx.drive((dt) => {
      t += dt;
      if (t >= life) {
        ctx.pool.release("ground_mist", img);
        groundLive--;
        return false; // Treiber raeumt sich ab (kein Leck)
      }
      const u = t / life;
      const meander = Math.sin(phase + (TAU * t) / period) * P.meanderAmp;
      px += ((vx0 + meander) * dt) / 1000;
      py += (vy * dt) / 1000;
      img
        .setPosition(px, py)
        .setAlpha(P.peakAlpha * hill(u, 0.35))
        .setScale(P.scaleFrom + (P.scaleTo - P.scaleFrom) * u);
      return true;
    });
  });

  // Typ B -- driftende Fetzen: riesig, langsam, quer driftend.
  fx.register("mist_wisp", (ctx, x, y, _o: FxOpts) => {
    const P = GROUND_MIST.mistWisp;
    if (totalLive() >= GROUND_MIST.totalCap || wispLive >= P.cap) return;
    ensureMistTextures(ctx.scene);
    wispLive++;
    const img = ctx.pool.acquire("mist_wisp", () => ctx.scene.add.image(0, 0, WISP_KEY));
    const life = rand(P.lifeMin, P.lifeMax);
    const vx = (Math.random() < 0.5 ? -1 : 1) * rand(P.vxMin, P.vxMax);
    const vy = (Math.random() * 2 - 1) * P.vyMax;
    let px = x;
    let py = y;
    let t = 0;
    img
      .setTexture(WISP_KEY)
      .setBlendMode(Phaser.BlendModes.NORMAL)
      .setTint(GROUND_MIST.tint)
      .setDepth(GROUND_MIST.depth)
      .setPosition(x, y)
      .setAlpha(0)
      .setScale(P.scaleFrom);
    ctx.drive((dt) => {
      t += dt;
      if (t >= life) {
        ctx.pool.release("mist_wisp", img);
        wispLive--;
        return false;
      }
      const u = t / life;
      px += (vx * dt) / 1000;
      py += (vy * dt) / 1000;
      img
        .setPosition(px, py)
        .setAlpha(P.peakAlpha * hill(u, 0.4))
        .setScale(P.scaleFrom + (P.scaleTo - P.scaleFrom) * u);
      return true;
    });
  });
}

// --- Zonen-Emitter (Default AUS) --------------------------------------------

interface MistZone {
  x: number; // Welt-Px
  y: number;
  density: number;
}

let groundAcc = 0;
let wispAcc = 0;
let wispNext: number = GROUND_MIST.mistWisp.spawnMsMin;

/**
 * Treibt den Zonen-Emitter: spawnt an Zonen mit density > Schwelle gedrosselt
 * Bodenschwaden (haeufig) und Fetzen (selten). KEIN-Op, solange GROUND_MIST.enabled
 * false ist -- so bleibt die Struktur final, die Aktivierung Ticros Entscheidung.
 */
export function maybeEmitMist(fx: FxService, zones: MistZone[], dtMs: number): void {
  if (!GROUND_MIST.enabled || !zones.length) return;
  const dense = zones.filter((z) => z.density > GROUND_MIST.densityThreshold);
  if (!dense.length) return;
  groundAcc += dtMs;
  wispAcc += dtMs;
  if (groundAcc >= GROUND_MIST.groundMist.spawnMs) {
    groundAcc = 0;
    const z = dense[(Math.random() * dense.length) | 0];
    fx.spawn("ground_mist", z.x, z.y, {});
  }
  if (wispAcc >= wispNext) {
    wispAcc = 0;
    wispNext = rand(GROUND_MIST.mistWisp.spawnMsMin, GROUND_MIST.mistWisp.spawnMsMax);
    const z = dense[(Math.random() * dense.length) | 0];
    fx.spawn("mist_wisp", z.x, z.y, {});
  }
}
