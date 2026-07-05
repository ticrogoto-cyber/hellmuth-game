// HUD-Asset-Manifest (V3 §1.2) — dateinamen-keyed, Spiegel der SpriteEntry-
// Disziplin aus sprites.ts. EINE Quelle der Wahrheit: hud_assets.json wird hier
// typisiert und vom Build (tools/build_hud_assets.py) UND zur Laufzeit gelesen.
//
// Kerngesetz (Paket A, Teil 3): der ORDNER luegt, der DATEINAME nicht. Der Build
// loest `source` per Basename ueber die disjunkten Quellordner orn/ + violett/
// auf; ein mehrdeutiger Name bricht den Build hart ab. `freigestellt/` ist nur
// der vorab-gecuttete Cache, kein Suchordner.
//
// Pipeline-Gesetz (Paket A, Teil 2+3):
//   "raw"    -> NUR freistellen + trim. NIE relight/palette/desat/grain/present.
//               Behaelt die eingebackene Farbe + Plastik. Immer-raw: corner,
//               topleft, sigil, hero, eye (+ farbige Motive wie begleiter).
//   "master" -> achromatischer Graustufen-Master (R=G=B, Median ~150-175). Die
//               Fraktionsfarbe kommt zur LAUFZEIT per luminanzerhaltender Toenung
//               (CSS mix-blend-mode:color / SVG feBlend luminosity), nie gebacken.

import manifest from "./hud_assets.json";

export type HudFaction = "hellmuth" | "moderat";
export type HudPipeline = "raw" | "master";

export interface HudAssetEntry {
  /** Rolle/Slot im HUD (strip_h, corner, hero, eye, sigil, backdrop, …). */
  slot: string;
  faction: HudFaction;
  /** Quell-Basename ohne Ordner/Endung (in orn/ ODER violett/, disjunkt). */
  source: string;
  pipeline: HudPipeline;
  /** Ausgabepfad relativ zum Web-Root (Vite liefert public/ unter /). */
  out: string;
  /** Optional: fehlt die Quelle, kein Crash — sauberer Leerzustand. */
  optional?: boolean;
}

export const HUD_ASSETS: HudAssetEntry[] = manifest as unknown as HudAssetEntry[];

/** Slots, die NIE durch die Farbkette dürfen (Pipeline muss "raw" sein). */
export const ALWAYS_RAW_SLOTS: ReadonlySet<string> = new Set([
  "corner", "topleft", "sigil", "hero", "eye",
]);

/**
 * Platzhalter-Fraktionstönung (Paket A baut den MECHANISMUS, nicht die echten
 * Werte). Ticro setzt die kanonischen Hex-Werte beim Asset-Durchlauf — HELLMUTH
 * Gold-Grün, MODERAT Magenta (der aktuelle Stahl liest »zu pinkrosa«). Hier nur
 * neutrale Stellvertreter, damit die Tönung sichtbar greift.
 */
export const FACTION_TINT_PLACEHOLDER: Record<HudFaction, string> = {
  hellmuth: "#b9a14a", // PLATZHALTER mattgold-grün
  moderat: "#743a66", // PLATZHALTER tief blaeuliches Magenta (nie candy-pink, harte Negativregel)
};

/** Web-Root-URL (führender Slash) eines Ausgabepfads für CSS/DOM. */
export function hudAssetUrl(entry: HudAssetEntry): string {
  return "/" + entry.out.replace(/^\/+/, "");
}

/** Erste passende Variante eines Slots je Fraktion (oder per Quell-Basename). */
export function findHudAsset(
  faction: HudFaction,
  slot: string,
  source?: string,
): HudAssetEntry | undefined {
  return HUD_ASSETS.find(
    (e) => e.faction === faction && e.slot === slot &&
      (source === undefined || e.source === source),
  );
}

/** Alle Varianten eines Slots je Fraktion (z. B. die drei strip_h-Friese). */
export function hudAssetVariants(faction: HudFaction, slot: string): HudAssetEntry[] {
  return HUD_ASSETS.filter((e) => e.faction === faction && e.slot === slot);
}

/**
 * Daten-seitige Spiegelung des Build-Gesetzes: jeder Immer-raw-Slot MUSS
 * pipeline "raw" tragen. Wird im Test/Typecheck aufgerufen; verhindert, dass ein
 * lit Motiv versehentlich in den Master-Pfad (Farbkette) rutscht.
 */
export function violationsOfRawLaw(): HudAssetEntry[] {
  return HUD_ASSETS.filter((e) => ALWAYS_RAW_SLOTS.has(e.slot) && e.pipeline !== "raw");
}
