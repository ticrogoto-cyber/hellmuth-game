import Phaser from "phaser";
import { PALETTE } from "./palette";
import { ensureFxTextures, FX_GLOW_KEY } from "../systems/fx";

// Goldenes Heil-Glühen (CODE4 VFX-ZIELBILDER): aufsteigende goldene Partikel
// am reparierten Gebaeude/geheilten Ziel. Abonniert ein Event, das das
// RepairSystem bei jedem Heal-Tick feuert.

export const EVT_HEAL_TICK = "fx.heal_tick";

export interface HealTickEvent {
  x: number;
  y: number;
}

const healInstalled = new WeakMap<Phaser.Scene, true>();

export function installHealGlow(scene: Phaser.Scene): void {
  if (healInstalled.get(scene)) return;
  healInstalled.set(scene, true);
  ensureFxTextures(scene);

  let lastEmitTime = 0;
  const THROTTLE_MS = 300;

  const onHeal = (e: HealTickEvent): void => {
    const now = scene.time.now;
    if (now - lastEmitTime < THROTTLE_MS) return;
    lastEmitTime = now;

    // Aufsteigende goldene Partikel
    const emitter = scene.add.particles(e.x, e.y - 20, FX_GLOW_KEY, {
      lifespan: { min: 600, max: 1000 },
      speedY: { min: -30, max: -60 },
      speedX: { min: -8, max: 8 },
      scale: { start: 0.06, end: 0 },
      alpha: { start: 0.7, end: 0 },
      tint: PALETTE.GOLD_HELL,
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    });
    emitter.setDepth(e.y + 1000);
    emitter.explode(3);
    scene.time.delayedCall(1200, () => emitter.destroy());

    // Kurzer goldener Glow-Puls am Gebaeudefuss
    const glow = scene.add
      .image(e.x, e.y, FX_GLOW_KEY)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(PALETTE.GOLD_GLOW)
      .setScale(0.3)
      .setAlpha(0.15)
      .setDepth(e.y - 1);
    scene.tweens.add({
      targets: glow,
      alpha: 0,
      scale: 0.5,
      duration: 600,
      ease: "Quad.Out",
      onComplete: () => glow.destroy(),
    });
  };

  scene.events.on(EVT_HEAL_TICK, onHeal);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.events.off(EVT_HEAL_TICK, onHeal);
    healInstalled.delete(scene);
  });
}
