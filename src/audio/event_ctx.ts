// Ereignis-Nutzlast -> Audio-Kontext. Rein (nur Typ-Import) -> in Node testbar
// (test/audio_destillat.test.ts). Aus install_audio.ts ausgelagert, damit die
// Positions-/Fraktions-Durchreichung belegt werden kann, ohne Phaser zu laden.

import type { PlayCtx } from "./audio_manager";

/**
 * Baut aus einer Ereignis-Nutzlast den Audio-Kontext (Position/Fraktion/...).
 * Position (x,y) kommt immer durch, wenn sie im Payload steht. Fraktion: das
 * Drop-Event (EVT_DESTILLAT_DROPPED) traegt `killerFaction` statt `faction` --
 * darauf abbilden, damit der Limiter-Dedup pro Killer-Fraktion keyed (sonst
 * verschmelzen gleichzeitige Drops verschiedener Fronten zu einem Bucket).
 */
export function ctxAus(payload: unknown): PlayCtx {
  if (!payload || typeof payload !== "object") return {};
  const p = payload as Record<string, unknown>;
  const ctx: PlayCtx = {};
  if (typeof p.x === "number") ctx.x = p.x;
  if (typeof p.y === "number") ctx.y = p.y;
  if (typeof p.faction === "string") ctx.faction = p.faction;
  else if (typeof p.killerFaction === "string") ctx.faction = p.killerFaction;
  if (typeof p.unitType === "string") ctx.unitType = p.unitType;
  if (typeof p.biome === "string") ctx.biome = p.biome;
  return ctx;
}
