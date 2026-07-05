// ZENTRALE FX-PALETTE (Gefechts-VFX Paket 1). Stilbriefing-V2-Werte als einzige
// Farbquelle fuer Fraktions-FX; ersetzt das Platzhalter-Magenta 0xff3bd0 und die
// verstreuten Gold-/Magenta-Literale. Regel ab jetzt: Fraktionsfarben in FX-Code
// NUR aus dieser Datei. Physikalische Effektfarben (Feuer-Orange, Rauch-Grau,
// Blut-Rot) bleiben lokal beim Effekt; Editor-UI-Chrome (#ff3da5) ist KEIN FX
// und bleibt unberuehrt (docs/GEFECHTS-VFX.md).
//
// ADD-Kalibrierung: additive Blends hellen auf -- die *_GLOW-Stufen sind deshalb
// bewusst heller als die Boden-Basistoene. MAGENTA_GLOW = SIRUP_GLINT auf
// Leuchtstaerke gezogen (Kanaele ~x1.6, auf 255 gekappt), Farbton der Familie
// (~327 Grad, blau-stichig) erhalten -- nie Richtung Bonbon-Rosa (Blau bleibt
// deutlich ueber Gruen). GOLD_GLOW/GOLD_HELL uebernehmen die im Bestand bereits
// kalibrierten hellen Goldstufen (explosion.ts) als Familien-Werte.

export const PALETTE = {
  // --- HELLMUTH (antik-Gold-Familie) ---
  /** HELLMUTH-Gold, Basiston (Stilbriefing V2). */
  GOLD: 0xe8b33a,
  /** Tiefes Gold, dunkle Stufe (Pfuetzen, Raender). */
  GOLD_TIEF: 0xb8860b,
  /** ADD-Glow-Stufe Gold (Tracer, Blitz, Ringe). Heller gefahren, s.o. */
  GOLD_GLOW: 0xffd25a,
  /** Helle Funken-/Schutt-Stufe. */
  GOLD_HELL: 0xffe79a,
  /** Gold-Weiss (Todesblitz HELLMUTH). */
  GOLD_WEISS: 0xf0e6b0,

  // --- MODERAT (Sirup-Familie) ---
  /** MODERAT-Sirup, Basiston (Stilbriefing V2). NORMAL-Flaechen: Substanz, Ploerre. */
  SIRUP: 0xb0186a,
  /** Sirup-Glint (Glanzlicht, Linien). */
  SIRUP_GLINT: 0xc81e78,
  /** Dunkle Sirup-Stufe (Painter-Schatten der Splat-Texturen). */
  SIRUP_TIEF: 0x610d3a,
  /** ADD-Glow-Stufe Magenta (Tracer, Blitz, Glows). Ersetzt 0xff3bd0. */
  MAGENTA_GLOW: 0xff30c0,
} as const;

/** RGB-Tripel fuer Canvas-Painter (blood_system-Basistoene u.ae.). */
export function rgbTriple(hex: number): [number, number, number] {
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
}

/** CSS-rgba()-String fuer Canvas-Gradienten (production_glow u.ae.). */
export function cssRgba(hex: number, alpha: number): string {
  const [r, g, b] = rgbTriple(hex);
  return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
}
