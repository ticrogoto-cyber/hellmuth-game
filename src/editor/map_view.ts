// Gemeinsame Darstellung der Karteninhalte (Decals, Objekte, Vorkommen) aus
// MapData -- benutzt vom Editor UND vom Spiel beim Laden einer Editor-Karte.
// EIN Renderpfad: was der Editor zeigt, ist, was das Spiel laedt (Blueprint V3
// §2.1). Terrain (Splat-Blend) und Spawns/Logik liegen beim jeweiligen Aufrufer.

import Phaser from "phaser";
import { gridToWorld, SCATTER_DEPTH, FOUNDATION_DEPTH } from "../util/world";
import type { MapData, MapDecal, MapDoodad, MapNode } from "../maps/map_format";
import { DOODADS } from "../data/balance";
import { NODE_SPRITE, nodeDisplayWidth } from "../data/sprites";
import { decalById, decalCutKey } from "./terrain_assets";
import { rand2 } from "./noise";

const SOFT_SHADOW_KEY = "ed_soft_shadow";

/**
 * Weicher, randloser Kontaktschatten als einmalige Radial-Gradient-Textur. Ersetzt
 * den frueheren hellen Fundament-Teller (der wie ein Untersetzer las): ein dunkler,
 * weich auslaufender Fleck verankert das Objekt am Boden, ohne harte Kante und
 * unabhaengig vom Bodenton (Organik-Gesetz §7 Zweitens).
 */
export function ensureSoftShadow(scene: Phaser.Scene): void {
  if (scene.textures.exists(SOFT_SHADOW_KEY)) return;
  const S = 128;
  const cv = document.createElement("canvas");
  cv.width = S;
  cv.height = S;
  const ctx = cv.getContext("2d");
  if (!ctx) return;
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgba(8,6,4,0.85)");
  g.addColorStop(0.55, "rgba(8,6,4,0.45)");
  g.addColorStop(1, "rgba(8,6,4,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  scene.textures.addCanvas(SOFT_SHADOW_KEY, cv);
}

/** Setzt einen weichen Kontaktschatten unter (worldX, footY); liefert das Bild. */
function addContactShadow(
  scene: Phaser.Scene,
  worldX: number,
  footY: number,
  widthPx: number,
): Phaser.GameObjects.Image | undefined {
  if (!scene.textures.exists(SOFT_SHADOW_KEY)) return undefined;
  const img = scene.add.image(worldX, footY, SOFT_SHADOW_KEY).setOrigin(0.5, 0.5);
  // Iso-gestaucht (flach), etwas breiter als das Objekt, leicht nach unten/vorn.
  img.setDisplaySize(widthPx * 0.9, widthPx * 0.42);
  img.setDepth(FOUNDATION_DEPTH);
  return img;
}

export interface MapViewHandles {
  objects: Phaser.GameObjects.GameObject[];
  /** Blockierte Zellen ("col,row") aus Footprints + Wasser + Overrides. */
  collision: Set<string>;
}

const DECAL_BASE_WIDTH = 130;

/**
 * Zeichnet Decals, Objekte und (optional) Vorkommen einer Karte; liefert Handles
 * + abgeleitete Kollision. `skipNodes` fuer das Spiel, das echte ResourceNode-
 * Entitaeten statt dekorativer Knoten-Sprites setzt.
 */
export function renderMapContent(scene: Phaser.Scene, map: MapData, opts?: { skipNodes?: boolean }): MapViewHandles {
  ensureSoftShadow(scene);
  const objects: Phaser.GameObjects.GameObject[] = [];
  const collision = new Set<string>();
  for (const d of map.decals) objects.push(...drawDecal(scene, d));
  for (const o of map.doodads) {
    objects.push(...drawObject(scene, o));
    const def = DOODADS[o.type];
    if (def && def.blocksMovement) {
      const fw = def.footprint.w || 1;
      const fh = def.footprint.h || 1;
      const c0 = Math.round(o.col);
      const r0 = Math.round(o.row);
      for (let dr = 0; dr < fh; dr++) for (let dc = 0; dc < fw; dc++) collision.add(`${c0 + dc},${r0 + dr}`);
    }
  }
  if (!opts?.skipNodes) for (const n of map.nodes) objects.push(...drawNode(scene, n));
  for (const w of map.water) collision.add(`${w.c},${w.r}`);
  for (const c of map.collision) if (c.kind === "blocked" || c.kind === "water") collision.add(`${c.c},${c.r}`);
  return { objects, collision };
}

export function clearMapView(handles: MapViewHandles): void {
  for (const o of handles.objects) o.destroy();
  handles.objects = [];
}

/** Zeichnet ein einzelnes Decal (freigestellt, weich); liefert die Objekte. */
export function drawDecal(scene: Phaser.Scene, d: MapDecal): Phaser.GameObjects.GameObject[] {
  const set = decalById(d.set);
  if (!set) return [];
  const baseKey = set.keys[Math.min(set.keys.length - 1, Math.max(0, d.variant))];
  const key = scene.textures.exists(decalCutKey(baseKey)) ? decalCutKey(baseKey) : baseKey;
  if (!scene.textures.exists(key)) return [];
  const w = gridToWorld(d.col, d.row);
  const img = scene.add.image(w.x, w.y, key).setOrigin(0.5, 0.5);
  img.setScale((DECAL_BASE_WIDTH / (img.width || DECAL_BASE_WIDTH)) * d.scale);
  img.setAngle(d.rot);
  img.setAlpha(d.alpha);
  img.setFlipX(d.mirror);
  img.setDepth(SCATTER_DEPTH + d.row * 0.001);
  return [img];
}

/** Zeichnet ein einzelnes Objekt mit Kontaktschatten und Tint. */
export function drawObject(scene: Phaser.Scene, o: MapDoodad): Phaser.GameObjects.GameObject[] {
  if (!scene.textures.exists(o.type)) return drawPlaceholder(scene, o.col, o.row);
  ensureSoftShadow(scene);
  const def = DOODADS[o.type];
  const displayWidth = (def?.displayWidthPx ?? 120) * (o.scale ?? 1);
  const w = gridToWorld(o.col, o.row);
  const out: Phaser.GameObjects.GameObject[] = [];
  const shadow = addContactShadow(scene, w.x, w.y, displayWidth);
  if (shadow) out.push(shadow);
  const img = scene.add.image(w.x, w.y, o.type).setOrigin(0.5, 1);
  img.setScale(displayWidth / (img.width || displayWidth));
  img.setFlipX(!!o.mirror);
  // Deterministischer Tint (~+/-12% Helligkeit, leicht warm/kalt) bricht den
  // Klon-Eindruck identischer Sprites (Anti-Stempel, Recherche ±8..15%).
  const t = rand2(Math.round(o.col * 7), Math.round(o.row * 7), 5557);
  img.setTint(
    Phaser.Display.Color.GetColor(255 * (0.85 + 0.15 * t), 255 * (0.86 + 0.14 * t), 255 * (0.82 + 0.18 * t)),
  );
  img.setDepth(w.y);
  out.push(img);
  return out;
}

/** Zeichnet ein einzelnes Vorkommen mit Kontaktschatten. */
export function drawNode(scene: Phaser.Scene, n: MapNode): Phaser.GameObjects.GameObject[] {
  const key = NODE_SPRITE[n.type] ?? n.type;
  if (!scene.textures.exists(key)) return drawPlaceholder(scene, n.col, n.row);
  ensureSoftShadow(scene);
  const displayWidth = nodeDisplayWidth(n.type) * 1.8;
  const w = gridToWorld(n.col, n.row);
  const out: Phaser.GameObjects.GameObject[] = [];
  const shadow = addContactShadow(scene, w.x, w.y, displayWidth);
  if (shadow) out.push(shadow);
  const img = scene.add.image(w.x, w.y, key).setOrigin(0.5, 1);
  img.setScale(displayWidth / (img.width || displayWidth));
  img.setDepth(w.y);
  out.push(img);
  return out;
}

/** Platzhalter mit Bodenkontakt-Scheibe (Asset fehlt -> Wunschliste, kein Schweben). */
function drawPlaceholder(scene: Phaser.Scene, col: number, row: number): Phaser.GameObjects.GameObject[] {
  const w = gridToWorld(col, row);
  const g = scene.add.graphics().setDepth(w.y);
  g.fillStyle(0x000000, 0.28);
  g.fillEllipse(w.x, w.y, 26, 13);
  g.fillStyle(0xff3da5, 0.5);
  g.fillCircle(w.x, w.y - 14, 14);
  g.lineStyle(2, 0xffd25a, 0.9);
  g.strokeCircle(w.x, w.y - 14, 14);
  return [g];
}
