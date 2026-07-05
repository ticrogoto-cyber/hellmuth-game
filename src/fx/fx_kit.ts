import Phaser from "phaser";

// FX-KIT — der EINE prozedurale VFX-Atlas (Gefechts-VFX, Ein-Atlas-Disziplin
// aus C1/H7). Alle neuen Gefechts-FX-Texturen (Tracer-Kern, Tracer-Halo,
// Auren-Ring, Nebel-Wolke, Rauch-Puff-Loop) leben als FRAMES in EINER
// 512x512-CanvasTexture: Frames aus demselben Atlas brechen den Batch nie
// (Phaser-MultiPipeline), und der spaetere Asset-Swap ist ein reiner
// Textur-Tausch (ein PNG gleichen Layouts ersetzt den Canvas -- Swap-Manifest
// in docs/GEFECHTS-VFX.md). Alle Formen sind WEISS und werden per setTint aus
// src/fx/palette.ts gefaerbt (Tint bricht den Batch nicht, D1).
//
// Layout (x, y, w, h) -- Aenderungen hier MUESSEN das Swap-Manifest in
// docs/GEFECHTS-VFX.md mitziehen:
//   ring        (  0,   0, 256, 256)  Auren-Ring, weicher Glow-Rand
//   cloud       (256,   0, 256, 256)  weiche Nebel-Wolke
//   puff_0..7   (k*64, 256,  64,  64)  Rauch-Puff-Loop (8 Frames)
//   tracer_core (  0, 336,  64,   8)  harter weisser Streifen, weiche Enden
//   tracer_halo (  0, 360,  64,  24)  dieselbe Form, vorgeblurrt (breit)
//   glow_soft   (128, 336, 128, 128)  weicher Radial-Glow (Flacker-Quellen)
//
// Kein Phaser-Graphics im Render-Pfad: der Canvas wird EINMAL beim Boot
// gemalt (2D-Context), danach sind es reine Atlas-Frames.

export const FX_KIT_KEY = "fx_kit";

export const FX_KIT_FRAMES = {
  RING: "ring",
  CLOUD: "cloud",
  PUFF: (i: number): string => `puff_${i}`,
  PUFF_COUNT: 8,
  TRACER_CORE: "tracer_core",
  TRACER_HALO: "tracer_halo",
  GLOW_SOFT: "glow_soft",
} as const;

/** Weicher radialer Fleck (Gauss-artig ueber pow-Falloff). */
function radial(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, pow: number, aMax = 1): void {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    g.addColorStop(t, `rgba(255,255,255,${(aMax * (1 - t) ** pow).toFixed(4)})`);
  }
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

/** Ring mit weichem Innen- und Aussen-Falloff (Auren-Ring, D2). */
function drawRing(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  const cx = x + size / 2;
  const cy = y + size / 2;
  const rOut = size * 0.48;
  const rMid = size * 0.4;
  const rIn = size * 0.3;
  const g = ctx.createRadialGradient(cx, cy, rIn, cx, cy, rOut);
  g.addColorStop(0.0, "rgba(255,255,255,0)");
  g.addColorStop((rMid - rIn) / (rOut - rIn), "rgba(255,255,255,1)");
  g.addColorStop(1.0, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, rOut, 0, Math.PI * 2);
  ctx.fill();
}

/** Wolke: mehrere ueberlagerte weiche Flecken, deterministisch platziert. */
function drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  const cx = x + size / 2;
  const cy = y + size / 2;
  // Feste (seeded) Blob-Anordnung -- kein Math.random, reproduzierbarer Bake.
  const blobs: Array<[number, number, number, number]> = [
    [0, 0, 0.42, 0.5],
    [-0.22, -0.08, 0.3, 0.4],
    [0.24, -0.05, 0.28, 0.4],
    [-0.1, 0.14, 0.26, 0.35],
    [0.12, 0.12, 0.24, 0.35],
  ];
  for (const [dx, dy, r, a] of blobs) {
    radial(ctx, cx + dx * size, cy + dy * size, r * size, 1.6, a);
  }
}

/** Rauch-Puff-Frame i von n: waechst und franst aus (Loop-faehig). */
function drawPuff(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, i: number, n: number): void {
  const t = i / n; // 0..~0.875
  const cx = x + size / 2;
  const cy = y + size / 2;
  const r = size * (0.18 + 0.26 * t);
  const a = 0.85 * (1 - t * 0.65);
  radial(ctx, cx, cy, r, 1.4, a);
  // Zwei Neben-Blasen, Phase aus dem Frame-Index (deterministisch).
  const ang = (i / n) * Math.PI * 2;
  radial(ctx, cx + Math.cos(ang) * r * 0.5, cy + Math.sin(ang) * r * 0.5, r * 0.55, 1.6, a * 0.7);
  radial(ctx, cx - Math.cos(ang) * r * 0.45, cy - Math.sin(ang) * r * 0.4, r * 0.5, 1.6, a * 0.6);
}

/** Tracer-Streifen: horizontale weiche Enden, vertikal weicher Saum.
 *  `soft` steuert die Kern-Haerte (Core hart, Halo vorgeblurrt). */
function drawTracer(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, soft: boolean): void {
  const gx = ctx.createLinearGradient(x, 0, x + w, 0);
  gx.addColorStop(0, "rgba(255,255,255,0)");
  gx.addColorStop(0.18, `rgba(255,255,255,${soft ? 0.5 : 0.9})`);
  gx.addColorStop(0.55, "rgba(255,255,255,1)");
  gx.addColorStop(0.85, `rgba(255,255,255,${soft ? 0.5 : 0.9})`);
  gx.addColorStop(1, "rgba(255,255,255,0)");
  // Vertikales Profil: Kern = fast Rechteck mit 1px-Saum; Halo = weiche Glocke.
  const cy = y + h / 2;
  const steps = soft ? 10 : 4;
  for (let i = 0; i < steps; i++) {
    const tt = i / (steps - 1);
    const hh = (h / 2) * (1 - tt);
    const a = soft ? (1 - tt) ** 1.8 * 0.35 : tt < 0.75 ? 0.95 : 0.4;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = gx;
    ctx.fillRect(x, cy - hh, w, hh * 2);
    ctx.restore();
  }
}

// Nebel-Kacheltextur fuer die zwei Ambient-TileSprite-Layer. EIGENE 256er-POT-
// Textur (kein Kit-Frame): TileSprites wrappen ueber GL_REPEAT und koennen
// nicht aus Atlas-Sub-Rects kacheln. Deterministisch gemalt (feste Blob-Liste).
export const FX_MIST_TILE_KEY = "fx_mist_tile";

export function ensureMistTileTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(FX_MIST_TILE_KEY)) return;
  const size = 256;
  const tex = scene.textures.createCanvas(FX_MIST_TILE_KEY, size, size);
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, size, size);
  // Wisps kachelbar: jeder Blob wird an allen vier Raendern gespiegelt
  // mitgezeichnet (Torus), damit die Kachel nahtlos wiederholt.
  const blobs: Array<[number, number, number, number]> = [
    [40, 60, 52, 0.5],
    [150, 40, 64, 0.4],
    [220, 120, 48, 0.45],
    [90, 170, 70, 0.35],
    [190, 220, 56, 0.4],
    [20, 230, 44, 0.35],
  ];
  for (const [bx, by, r, a] of blobs) {
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        radial(ctx, bx + ox, by + oy, r, 1.5, a);
      }
    }
  }
  tex.refresh();
}

/**
 * Baut den FX-Kit-Atlas einmalig (idempotent). Ein echtes PNG gleichen
 * Schluessels haette Vorrang (Swap-Punkt) -- Konvention wie blood_system.
 */
export function ensureFxKit(scene: Phaser.Scene): void {
  if (scene.textures.exists(FX_KIT_KEY)) return;
  const size = 512;
  const tex = scene.textures.createCanvas(FX_KIT_KEY, size, size);
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, size, size);

  drawRing(ctx, 0, 0, 256);
  drawCloud(ctx, 256, 0, 256);
  for (let i = 0; i < FX_KIT_FRAMES.PUFF_COUNT; i++) drawPuff(ctx, i * 64, 256, 64, i, FX_KIT_FRAMES.PUFF_COUNT);
  drawTracer(ctx, 0, 336, 64, 8, false);
  drawTracer(ctx, 0, 360, 64, 24, true);
  radial(ctx, 128 + 64, 336 + 64, 62, 2.2, 1);
  tex.refresh();

  // Frame-Defs (Layout-Vertrag, s. Kopf-Kommentar + Swap-Manifest).
  tex.add(FX_KIT_FRAMES.RING, 0, 0, 0, 256, 256);
  tex.add(FX_KIT_FRAMES.CLOUD, 0, 256, 0, 256, 256);
  for (let i = 0; i < FX_KIT_FRAMES.PUFF_COUNT; i++) tex.add(FX_KIT_FRAMES.PUFF(i), 0, i * 64, 256, 64, 64);
  tex.add(FX_KIT_FRAMES.TRACER_CORE, 0, 0, 336, 64, 8);
  tex.add(FX_KIT_FRAMES.TRACER_HALO, 0, 0, 360, 64, 24);
  tex.add(FX_KIT_FRAMES.GLOW_SOFT, 0, 128, 336, 128, 128);
}
