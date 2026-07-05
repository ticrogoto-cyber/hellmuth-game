import type Phaser from "phaser";
import { getTraumaCamera, shakeToTrauma, type TraumaEventClass } from "./trauma_camera";

// Kamera-Shake (Code7 Tempo-Kalibrierung 2026-07-03): AB SOFORT Trauma-Kamera
// nach Eiserloh (siehe src/fx/trauma_camera.ts). Diese Datei ist nur noch der
// Legacy-API-Wrapper. Ergebnis fuer den Menschen: kein hochfrequentes Zittern
// mehr, sondern trauma^2-basierter Zerfall mit weichem Value-Noise.
//
// Accessibility (Motion-Sickness, Xbox Accessibility Guideline 117): der
// Settings-Toggle bleibt. Der frueher noetige globale 120-ms-Cooldown entfaellt,
// weil das Trauma-Modell durch die 1-Clamp und den exponentiellen Zerfall von
// selbst saettigt (Massengefecht bringt die Kamera nicht in Dauer-Wackeln).

let enabled = true;

/** Accessibility-Toggle (Settings-Menue). Wird an die TraumaCamera weitergereicht. */
export function setScreenShakeEnabled(on: boolean, scene?: Phaser.Scene): void {
  enabled = on;
  if (scene) getTraumaCamera(scene).setEnabled(on);
}

export function isScreenShakeEnabled(): boolean {
  return enabled;
}

/**
 * Legacy-Bruecke: bildet die frueheren Aufrufer (explosion.ts, impact.ts) auf
 * die Trauma-Kamera ab. `duration` wird ignoriert (Trauma kennt Zerfall statt
 * Timer), `intensity` wird per shakeToTrauma auf einen Trauma-Beitrag skaliert.
 */
export function shakeCamera(scene: Phaser.Scene, intensity: number, _duration: number): void {
  if (!enabled) return;
  getTraumaCamera(scene).addRaw(shakeToTrauma(intensity));
}

/** Klassenbasierte API (bevorzugt): Trauma-Beitrag aus TRAUMA_ADD-Tabelle. */
export function addTrauma(scene: Phaser.Scene, cls: TraumaEventClass): void {
  if (!enabled) return;
  getTraumaCamera(scene).add(cls);
}
