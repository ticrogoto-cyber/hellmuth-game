import Phaser from "phaser";
import { PALETTE } from "./palette";
import { ensureFxTextures, FX_GLOW_KEY } from "../systems/fx";
import type { FactionId } from "../data/loader";

// Projektil-Strahlen beider Fraktionen (CODE4 VFX-ZIELBILDER).
// KLARHEIT: goldener Lichtstrahl, geradlinig, sauber.
// GENERIK:  magenta-Strahl, aggressiver, unregelmaeessiger (Sinus-Wobble).

const BEAM_DURATION_MS = 180;
const BEAM_WIDTH = 3;
const PARTICLE_COUNT_KLARHEIT = 5;
const PARTICLE_COUNT_GENERIK = 7;
const BODY_OFFSET_Y = -14;

interface BeamColors {
  line: number;
  glow: number;
  particles: number;
}

function beamColors(faction?: FactionId): BeamColors {
  if (faction === "moderat") {
    return { line: PALETTE.SIRUP_GLINT, glow: PALETTE.MAGENTA_GLOW, particles: PALETTE.MAGENTA_GLOW };
  }
  return { line: PALETTE.GOLD, glow: PALETTE.GOLD_GLOW, particles: PALETTE.GOLD_HELL };
}

/**
 * Feuert einen fraktionsfarbigen Projektilstrahl von Angreifer zu Ziel.
 * KLARHEIT: gerader Goldstrahl mit Glow-Partikeln entlang der Linie.
 * GENERIK: Magenta-Strahl mit Sinus-Wobble und mehr Partikeln.
 */
export function fireProjectileBeam(
  scene: Phaser.Scene,
  ax: number, ay: number,
  tx: number, ty: number,
  faction?: FactionId,
): void {
  ensureFxTextures(scene);
  const colors = beamColors(faction);
  const isModerat = faction === "moderat";
  const aSy = ay + BODY_OFFSET_Y;
  const tSy = ty + BODY_OFFSET_Y;

  // Strahl-Linie (Graphics)
  const g = scene.add.graphics().setDepth(3000);
  g.setBlendMode(Phaser.BlendModes.ADD);

  if (isModerat) {
    drawWobblyBeam(g, ax, aSy, tx, tSy, colors.line, BEAM_WIDTH);
  } else {
    g.lineStyle(BEAM_WIDTH, colors.line, 0.9);
    g.lineBetween(ax, aSy, tx, tSy);
    g.lineStyle(1, colors.glow, 0.5);
    g.lineBetween(ax, aSy, tx, tSy);
  }

  scene.time.delayedCall(BEAM_DURATION_MS, () => g.destroy());

  // Glow-Partikel entlang der Strahlrichtung
  const count = isModerat ? PARTICLE_COUNT_GENERIK : PARTICLE_COUNT_KLARHEIT;
  const dx = tx - ax;
  const dy = tSy - aSy;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;

  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const px = ax + dx * t;
    const py = aSy + (tSy - aSy) * t;
    const spread = isModerat ? 6 : 3;
    const ox = (Math.sin(t * 12 + i) * spread);
    const oy = (Math.cos(t * 8 + i * 2) * spread * 0.5);
    const pImg = scene.add
      .image(px + ox, py + oy, FX_GLOW_KEY)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(colors.particles)
      .setScale(isModerat ? 0.12 : 0.08)
      .setAlpha(0.8)
      .setDepth(3001);

    const nxDir = -dy / len;
    const nyDir = dx / len;
    scene.tweens.add({
      targets: pImg,
      x: pImg.x + nxDir * (isModerat ? 8 : 4),
      y: pImg.y + nyDir * (isModerat ? 8 : 4),
      alpha: 0,
      scale: 0,
      duration: BEAM_DURATION_MS * 1.5,
      ease: "Quad.Out",
      onComplete: () => pImg.destroy(),
    });
  }
}

/** Zeichnet einen Sinus-modulierten Strahl (GENERIK: aggressiver, zackiger). */
function drawWobblyBeam(
  g: Phaser.GameObjects.Graphics,
  ax: number, ay: number,
  tx: number, ty: number,
  color: number,
  width: number,
): void {
  const dx = tx - ax;
  const dy = ty - ay;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const segments = 12;
  const amplitude = 4;

  g.lineStyle(width, color, 0.85);
  g.beginPath();
  g.moveTo(ax, ay);
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const wobble = Math.sin(t * Math.PI * 3) * amplitude * (1 - t * 0.4);
    const px = ax + dx * t + nx * wobble;
    const py = ay + dy * t + ny * wobble;
    g.lineTo(px, py);
  }
  g.strokePath();

  g.lineStyle(1, PALETTE.MAGENTA_GLOW, 0.4);
  g.beginPath();
  g.moveTo(ax, ay);
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const wobble = Math.sin(t * Math.PI * 3) * amplitude * (1 - t * 0.4);
    const px = ax + dx * t + nx * wobble;
    const py = ay + dy * t + ny * wobble;
    g.lineTo(px, py);
  }
  g.strokePath();
}

/**
 * Muendungsfeuer: kurzer additiver Flash am Schuetzen bei Fernkampf.
 * Fraktionsfarbig, klein, schnell.
 */
export function muzzleFlash(
  scene: Phaser.Scene,
  x: number, y: number,
  faction?: FactionId,
): void {
  ensureFxTextures(scene);
  const color = faction === "moderat" ? PALETTE.MAGENTA_GLOW : PALETTE.GOLD_GLOW;
  const img = scene.add
    .image(x, y + BODY_OFFSET_Y, FX_GLOW_KEY)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setTint(color)
    .setScale(0.25)
    .setAlpha(0.9)
    .setDepth(3002);
  scene.tweens.add({
    targets: img,
    scale: 0.5,
    alpha: 0,
    duration: 100,
    ease: "Quad.Out",
    onComplete: () => img.destroy(),
  });
}

/**
 * Einschlag-Partikelausstoss am Ziel bei Fernkampf-Treffer.
 * Fraktionsfarbig, klein, kurz.
 */
export function impactBurst(
  scene: Phaser.Scene,
  x: number, y: number,
  faction?: FactionId,
): void {
  ensureFxTextures(scene);
  const color = faction === "moderat" ? PALETTE.MAGENTA_GLOW : PALETTE.GOLD_HELL;
  const emitter = scene.add.particles(x, y + BODY_OFFSET_Y, FX_GLOW_KEY, {
    lifespan: 200,
    speed: { min: 30, max: 70 },
    angle: { min: 0, max: 360 },
    gravityY: 120,
    scale: { start: 0.08, end: 0 },
    alpha: { start: 0.9, end: 0 },
    tint: color,
    blendMode: Phaser.BlendModes.ADD,
    emitting: false,
  });
  emitter.setDepth(y + 1000);
  emitter.explode(4);
  scene.time.delayedCall(350, () => emitter.destroy());
}
