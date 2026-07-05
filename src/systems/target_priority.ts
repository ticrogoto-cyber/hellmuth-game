// Reine, Phaser-freie Zielauswahl nach bedrohungsgewichtetem Score. Aus
// combat_system ausgelagert, damit die Logik headless testbar ist.
//
// NIEDRIGER Score = besseres Ziel. Stufe (tier) dominiert (Kampfeinheit vor
// Verteidigungsgebaeude vor Sonstigem); innerhalb dessen ziehen Bedrohung
// (Held/Sondereinheit), DPS und Naehe das Ziel nach vorn. Ein schon beschossenes
// Ziel bekommt einen Fokus-Bonus (Klebrigkeit), und ein Wechsel passiert nur bei
// klar besserem Score (Hysterese-Marge) -> kein Ziel-Flackern bei Gleichrang.
//
// Die konkreten Gewichte sind vorlaeufig (KANON-LUECKE: Balance = Ticro).

export interface ScoredTarget {
  tier: number; // Prioritaetsstufe (niedriger = wichtiger)
  dist: number; // Kachel-Distanz
  threat: number; // Bedrohungspriorität (Held/Spezial > 0)
  dps: number; // Schadensausstoss des Ziels
  focused: boolean; // wird bereits beschossen (Fokus-Bonus)
}

const W_TIER = 100; // Stufe dominiert
const W_DIST = 1; // naeher = besser
const W_THREAT = 6; // Held/Spezial bevorzugen
const W_DPS = 1.2; // gefaehrlichere zuerst
const FOCUS_BONUS = 20; // schon beschossen -> kleben (Anti-Flacker)
const SWITCH_HYST = 10; // Marge: nur wechseln, wenn klar besser

/** Score eines Ziels. Niedriger = besser. */
export function targetScore(t: ScoredTarget): number {
  return (
    t.tier * W_TIER +
    t.dist * W_DIST -
    t.threat * W_THREAT -
    t.dps * W_DPS -
    (t.focused ? FOCUS_BONUS : 0)
  );
}

/** Bester Kandidat (kleinster Score). */
export function pickBestTarget<T extends ScoredTarget>(candidates: T[]): T | undefined {
  let best: T | undefined;
  let bestScore = Infinity;
  for (const c of candidates) {
    const sc = targetScore(c);
    if (sc < bestScore) {
      best = c;
      bestScore = sc;
    }
  }
  return best;
}

/**
 * Vom laufenden Ziel (currentScore) auf einen Kandidaten (candidateScore)
 * wechseln? Nur, wenn der Kandidat um die Hysterese-Marge besser ist. Bei
 * Gleichrang (Score ~ gleich) bleibt das aktuelle Ziel -> kein Flackern.
 */
export function shouldSwitchTarget(currentScore: number, candidateScore: number): boolean {
  return candidateScore < currentScore - SWITCH_HYST;
}
