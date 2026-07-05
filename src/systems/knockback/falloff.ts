// Falloff-Profile fuer Druckwellen-Knockback (Solutions §3.1/§3.3). Quadratisch
// ist Default: heisser Kern, weiche Aussenkante -> vermeidet den Ghost-Hit am
// Rand (Anti-Pattern, Solutions Anhang C), weil die Wirkung weich auf 0 laeuft
// statt hart zu kippen. Reine Mathematik, Phaser-frei, deterministisch.

export type FalloffShape = "linear" | "quadratic" | "step" | "none";

/**
 * Normierter Wirkungsfaktor 0..1 ueber die Distanz `d`. Innerhalb `innerRadius`
 * volle Wirkung (1), ab `outerRadius` keine (0). `quadratic` ist `(1 - t)^2` mit
 * `t` = normierte Distanz im Ring zwischen innen und aussen.
 */
export function falloff(shape: FalloffShape, d: number, outerRadius: number, innerRadius = 0): number {
  if (outerRadius <= 0) return 0;
  if (d <= innerRadius) return 1; // Full-Effect-Kern
  if (d >= outerRadius) return 0;
  const span = outerRadius - innerRadius;
  const t = span <= 0 ? 1 : (d - innerRadius) / span; // 0..1
  switch (shape) {
    case "linear":
      return 1 - t;
    case "quadratic":
      return (1 - t) ** 2;
    case "step":
      return 1; // binaer voll bis outerRadius
    case "none":
      return 1;
    default:
      return (1 - t) ** 2;
  }
}
