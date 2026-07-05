// HUD-Tönung (Paket A, Teil 2) — Laufzeit-Substrat für die luminanzerhaltende
// Fraktionsfärbung. Zwei Pfade, beide ohne eingebackene Farbe:
//   - CSS  mix-blend-mode:color  (siehe hud_tint.css) für DOM-Lagen (Leisten,
//     Backdrop, Füllungen).
//   - SVG  feBlend luminosity     (hier) für border-image-Chrome (Panel-Rahmen).
// Tönungswerte sind PLATZHALTER (FACTION_TINT_PLACEHOLDER); Ticro setzt die
// kanonischen Werte beim Asset-Durchlauf.

import { FACTION_TINT_PLACEHOLDER, type HudFaction } from "../data/hud_assets";

/** Platzhalter-Fraktionstönung (eine Quelle: hud_assets.ts). */
export function factionTint(faction: HudFaction): string {
  return FACTION_TINT_PLACEHOLDER[faction];
}

/**
 * border-image-/background-Quelle: bettet den Graustufen-Master ein und färbt ihn
 * luminanzerhaltend. feColorMatrix(saturate 0) → feFlood(Farbe) →
 * feBlend(mode=luminosity) = SetLum(Farbe, Lum(Master)) → feComposite(in) klemmt
 * auf die Master-Silhouette. `color-interpolation-filters="sRGB"` ist PFLICHT:
 * der Default linearRGB verschiebt Mitteltöne (getippte Farbe landet falsch,
 * Safari weicht ohnehin ab).
 *
 * `masterUri` MUSS eine eingebettete `data:image/png;base64,…`-URI sein (aus
 * hud_master_data.ts), KEINE externe `/sprites/…`-URL: ein SVG, das als CSS
 * border-image/background dient, läuft im »secure static mode« und lädt keine
 * externen Bilder — eine externe href bliebe unsichtbar. Rückgabe: CSS-`url(...)`.
 */
export function tintedBorderImage(
  masterUri: string,
  color: string,
  w: number,
  h: number,
): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<filter id="t" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
    `<feColorMatrix type="saturate" values="0" result="g"/>` +
    `<feFlood flood-color="${color}" result="f"/>` +
    `<feBlend in="g" in2="f" mode="luminosity" result="d"/>` +
    `<feComposite in="d" in2="SourceAlpha" operator="in"/>` +
    `</filter>` +
    `<image href="${masterUri}" width="${w}" height="${h}" filter="url(#t)"/>` +
    `</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/**
 * Setzt Master + Tönung als CSS-Variablen für den CSS-Blend-Pfad (.hud-tinted).
 * Die Kachelung (background-repeat/-size) bleibt beim Aufrufer.
 */
export function applyMasterTint(
  el: HTMLElement,
  masterUrl: string,
  faction: HudFaction,
): void {
  el.style.setProperty("--hud-master", `url("${masterUrl}")`);
  el.style.setProperty("--hud-tint", FACTION_TINT_PLACEHOLDER[faction]);
}
