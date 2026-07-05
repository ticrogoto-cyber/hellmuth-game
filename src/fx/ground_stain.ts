import Phaser from "phaser";
import { PALETTE } from "./palette";
import { TILE_WIDTH, TILE_HEIGHT } from "../util/iso";
import type { GameState } from "../systems/game_state";

// Boden-Verschmutzung: Magenta-Risse/Adern im Terrain auf GENERIK-Seite
// (CODE4 VFX-ZIELBILDER). Zeichnet dunkle Sirup-Linien um GENERIK-Gebaeude
// herum, die den Boden als kontaminiert markieren. Statisch, einmalig gerendert.

const STAIN_ALPHA = 0.25;
const STAIN_RADIUS_TILES = 3;
const VEIN_COUNT_PER_BUILDING = 5;
const VEIN_SEGMENTS = 6;
const VEIN_MAX_LENGTH = 80;

const stainInstalled = new WeakMap<Phaser.Scene, true>();

export function installGroundStain(scene: Phaser.Scene, state: GameState): void {
  if (stainInstalled.get(scene)) return;
  stainInstalled.set(scene, true);

  const g = scene.add.graphics().setDepth(1);
  drawStains(g, state);

  // Neuzeichnen wenn Gebaeude gebaut/zerstoert werden
  const redraw = (): void => {
    g.clear();
    drawStains(g, state);
  };

  scene.events.on("building_placed", redraw);
  scene.events.on("building_destroyed", redraw);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.events.off("building_placed", redraw);
    scene.events.off("building_destroyed", redraw);
    g.destroy();
    stainInstalled.delete(scene);
  });
}

function drawStains(g: Phaser.GameObjects.Graphics, state: GameState): void {
  const moderatBuildings = state.buildings.filter(b => b.faction === "moderat" && !b.isDead);
  if (moderatBuildings.length === 0) return;

  for (const b of moderatBuildings) {
    const cx = b.x;
    const cy = b.y;
    drawVeins(g, cx, cy);
    drawGroundGlow(g, cx, cy);
  }
}

function drawVeins(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
  for (let v = 0; v < VEIN_COUNT_PER_BUILDING; v++) {
    const baseAngle = (v / VEIN_COUNT_PER_BUILDING) * Math.PI * 2 + v * 0.7;
    g.lineStyle(2, PALETTE.SIRUP, STAIN_ALPHA);
    g.beginPath();
    g.moveTo(cx, cy);

    let px = cx;
    let py = cy;
    for (let s = 0; s < VEIN_SEGMENTS; s++) {
      const segLen = VEIN_MAX_LENGTH / VEIN_SEGMENTS;
      const jitter = Math.sin(v * 7 + s * 3.7) * 12;
      const angle = baseAngle + Math.sin(s * 2.1 + v) * 0.4;
      px += Math.cos(angle) * segLen + Math.sin(s * 5 + v * 3) * 4;
      py += Math.sin(angle) * segLen * 0.6 + jitter * 0.3;
      g.lineTo(px, py);
    }
    g.strokePath();

    // Zweigadern (duenner, kuerzer)
    if (v % 2 === 0) {
      const branchStart = 0.4 + Math.sin(v * 2.3) * 0.2;
      const bx = cx + Math.cos(baseAngle) * VEIN_MAX_LENGTH * branchStart;
      const by = cy + Math.sin(baseAngle) * VEIN_MAX_LENGTH * branchStart * 0.6;
      const branchAngle = baseAngle + (v % 3 === 0 ? 0.8 : -0.8);

      g.lineStyle(1, PALETTE.SIRUP_GLINT, STAIN_ALPHA * 0.7);
      g.beginPath();
      g.moveTo(bx, by);
      for (let s = 0; s < 3; s++) {
        const segLen = 15;
        g.lineTo(
          bx + Math.cos(branchAngle) * segLen * (s + 1) + Math.sin(s * 4 + v) * 3,
          by + Math.sin(branchAngle) * segLen * (s + 1) * 0.6,
        );
      }
      g.strokePath();
    }
  }
}

function drawGroundGlow(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
  g.fillStyle(PALETTE.SIRUP_TIEF, 0.08);
  g.fillEllipse(cx, cy, STAIN_RADIUS_TILES * TILE_WIDTH * 0.6, STAIN_RADIUS_TILES * TILE_HEIGHT * 0.6);
}
