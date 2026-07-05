// Massen-Tiers (Solutions §4.1) + HELLMUTH-Rollen-Mapping (§4.2). Die
// `sqrt(mass)`-Daempfung (im knockback_system) macht schweres Vieh sichtbar
// wackelnd, aber deutlich weniger verschiebbar; `kbMult` ist der zusaetzliche
// Tier-Regler (bulwark 0.05, immovable 0). Reine TS-Konstante, kein Modul-State.

import type { UnitRole } from "../../data/loader";

export type MassTier = "featherweight" | "medium" | "heavy" | "bulwark" | "immovable";

export interface MassEntry {
  /** Numerisch fuer die sqrt(mass)-Skalierung. immovable: Infinity. */
  mass: number;
  /** Zusaetzlicher Tier-Multiplikator auf den Impuls. 0 = unverschiebbar. */
  kbMult: number;
  /** Statisch (Gebaeude): nimmt nie Knockback. */
  isStatic: boolean;
}

export const MASS_TABLE: Record<MassTier, MassEntry> = {
  featherweight: { mass: 0.5, kbMult: 2.0, isStatic: false },
  medium: { mass: 1.0, kbMult: 1.0, isStatic: false },
  heavy: { mass: 4.0, kbMult: 0.35, isStatic: false },
  bulwark: { mass: 20.0, kbMult: 0.05, isStatic: false },
  immovable: { mass: Infinity, kbMult: 0, isStatic: true },
};

// HELLMUTH-Rollen -> Default-Tier (Solutions §4.2). Pro Einheit per
// `massTier`/`massScale`-Override in der Unit-Def feinjustierbar (additive,
// optionale Felder in loader.ts). So bekommt jede bestehende Einheit ohne
// JSON-Pflege sofort ein plausibles Gewicht aus ihrer Rolle.
const ROLE_TIER: Record<UnitRole, MassTier> = {
  worker: "featherweight",
  flyer: "featherweight",
  caster: "medium",
  ranged: "medium",
  melee: "medium",
  heavy: "heavy",
  siege: "bulwark",
};

/** Tier aus der Rolle ableiten (Default, wenn die Unit-Def kein Tier setzt). */
export function tierForRole(role: UnitRole): MassTier {
  return ROLE_TIER[role] ?? "medium";
}

/** Tier-Auswahl mit Override-Vorrang: explizites Tier > Rollen-Default. */
export function resolveMassTier(role: UnitRole, override?: MassTier): MassTier {
  return override ?? tierForRole(role);
}
