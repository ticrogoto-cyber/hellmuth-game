import type Phaser from "phaser";
import type { GameState } from "../systems/game_state";
import type { Unit } from "../entities/unit";
import type { HitSeverity, DeathTier } from "../systems/death_fx";
import type { FactionId } from "../data/loader";
import { shakeCamera } from "./shake";

// SEVERITY-IMPACT-DISPATCHER (Physik §7, Code7). Eine Wahrheit fuer die nach
// Schwere gestaffelte Treffer-Wucht: der lokale Hit-Stop. Der Freeze ist REIN
// LOKAL am Akteur-Sprite (unit.hitStop -> haelt den Frame in updateAnimation),
// NIE ein globaler timeScale und NIE ein Eingriff in die 30-Hz-Sim -- der
// Determinismus-Hash bleibt bit-identisch. Liegt bewusst NICHT in explosion.ts
// (dort mischt Code5 die Audio-Kopplung); der Dispatcher ist FX-eigen.
//
// Millisekunden sind PLATZHALTER -- Ticro tariert sie am echten Kampf, nicht am
// leeren Feld. Reihenfolge: leicht laeuft glatt, mittel/schwer/Tod friert kurz.

/** Hit-Stop bei nicht-toedlichem Treffer, nach Treffer-Schwere. */
export const HITSTOP_HIT: Record<HitSeverity, number> = {
  light: 0, // leichter Treffer laeuft glatt durch (kein Freeze)
  heavy: 45, // schwere Waffe/Einheit: kurzer Freeze
};

/** Hit-Stop beim Tod, nach Tod-Tiering (der Akteur = das Todes-Clip-Sprite). */
export const HITSTOP_DEATH: Record<DeathTier, number> = {
  mass: 0, // Schwarm/Arbeiter: kein Freeze (haeufiges Ereignis, billiges Feedback)
  strong: 60, // teure/starke Einheit
  hero: 110, // Held: das volle Programm
};

// Einheiten-Position == Trefferstelle im selben (synchron emittierten) Frame;
// die kleine Toleranz faengt Float-Rauschen ab, ohne fremde Einheiten zu greifen.
const HIT_EPS2 = 8 * 8; // px^2

/**
 * Friert das getroffene Akteur-Sprite lokal ein (nicht-toedlicher Treffer). Die
 * getroffene Einheit wird ueber Fraktion + Naehe zur Trefferstelle aus gameState
 * gelesen (rein lesend, kein Sim-Eingriff); leichter Treffer (~0 ms) ist No-op.
 */
export function hitStopStruck(
  scene: Phaser.Scene,
  x: number,
  y: number,
  faction: FactionId | undefined,
  sev: HitSeverity | undefined,
): void {
  const ms = HITSTOP_HIT[sev ?? "light"];
  if (ms <= 0) return;
  const gs = scene.registry.get("gameState") as GameState | undefined;
  if (!gs) return;
  let best: Unit | undefined;
  let bestD = HIT_EPS2;
  for (const u of gs.units) {
    if (faction && u.faction !== faction) continue;
    const dx = u.x - x;
    const dy = u.y - y;
    const d = dx * dx + dy * dy;
    if (d <= bestD) {
      bestD = d;
      best = u;
    }
  }
  best?.hitStop(ms);
}

/** Hit-Stop-Dauer fuer den Tod-Pfad (haelt das Todes-Clip-Sprite, Code7). */
export function deathFreezeMs(sev: DeathTier | undefined): number {
  return HITSTOP_DEATH[sev ?? "mass"];
}

// Gebaeude-Einschlag (§7): Shake statt Freeze. Der grosse Explosions-Layer shaket
// bereits (explosion big), darum hier kein zweiter Shake -- nur eine Sicherung,
// falls ein Gebaeude-Impact ausserhalb des grossen Explosions-Komposits gebraucht
// wird. Wird derzeit nicht von death_fx aufgerufen (kein Doppel-Shake).
export const BUILDING_SHAKE = { intensity: 0.008, durationMs: 260 };
export function impactBuildingShake(scene: Phaser.Scene, x: number, y: number): void {
  if (scene.cameras.main.worldView.contains(x, y)) {
    shakeCamera(scene, BUILDING_SHAKE.intensity, BUILDING_SHAKE.durationMs);
  }
}
