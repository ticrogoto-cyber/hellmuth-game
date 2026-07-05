// Lade-Schicht fuer Florilegium-Eintraege. Eingang: alle JSON-Dateien unter
// data/florilegium/<lang>/<category>/<slug>.json, gebuendelt zur Buildzeit von
// Vite (import.meta.glob). Ausgang: typisiertes Array gegen das Schema in
// data/florilegium/schema.json (Vertrag mit Code9, Welle 5).
// Es wird hier NICHT validiert -- das ist Aufgabe von H22 zur Build-Zeit. Hier
// werden nur die Felder typisiert konsumiert, in der gleichen Reihenfolge wie
// das Schema sie erzwingt.

export type FlorilegiumCategory =
  | "fraktionen"
  | "einheiten"
  | "gebaeude"
  | "substanzen"
  | "konzepte"
  | "welt";

export type FlorilegiumUnlockType = "always" | "build" | "kill" | "research";

export interface FlorilegiumUnlock {
  type: FlorilegiumUnlockType;
  trigger: string | null;
}

export interface FlorilegiumCitation {
  source: "Kreativer Suizid" | "Helmuths Buch" | null;
  page: number | null;
}

export interface FlorilegiumEntry {
  id: string;
  category: FlorilegiumCategory;
  title: string;
  order: number;
  unlock: FlorilegiumUnlock;
  image: string;
  audio: string;
  text: string;
  citation: FlorilegiumCitation;
  tags: string[];
}

export type FlorilegiumLang = "de" | "en";

// Reihenfolge der Kategorien im Codex. Spec gibt sie aus dem Brief vor:
// Fraktionen | Einheiten | Gebaeude | Substanzen | Konzepte | Welt.
export const CATEGORY_ORDER: readonly FlorilegiumCategory[] = [
  "fraktionen",
  "einheiten",
  "gebaeude",
  "substanzen",
  "konzepte",
  "welt",
] as const;

export const CATEGORY_LABEL_DE: Record<FlorilegiumCategory, string> = {
  fraktionen: "Fraktionen",
  einheiten: "Einheiten",
  gebaeude: "Gebäude",
  substanzen: "Substanzen",
  konzepte: "Konzepte",
  welt: "Welt",
};

// Vite glob-Import: Buildzeit-Aufloesung aller Eintraege pro Sprache.
// `eager: true` -> direkter Import, kein Laufzeit-fetch. `as: "json"` -> Werte
// kommen schon geparst zurueck (Vite-Garantie).
const ENTRIES_DE = import.meta.glob("../../data/florilegium/de/*/*.json", {
  eager: true,
  import: "default",
}) as Record<string, FlorilegiumEntry>;

const ENTRIES_EN = import.meta.glob("../../data/florilegium/en/*/*.json", {
  eager: true,
  import: "default",
}) as Record<string, FlorilegiumEntry>;

function collect(lang: FlorilegiumLang): FlorilegiumEntry[] {
  const src = lang === "en" ? ENTRIES_EN : ENTRIES_DE;
  return Object.values(src);
}

/** Alle Eintraege einer Sprache, stabil nach (category-order, order, title). */
export function loadFlorilegium(lang: FlorilegiumLang = "de"): FlorilegiumEntry[] {
  const items = collect(lang);
  const catIdx = (c: FlorilegiumCategory): number => CATEGORY_ORDER.indexOf(c);
  return items.slice().sort((a, b) => {
    const dc = catIdx(a.category) - catIdx(b.category);
    if (dc !== 0) return dc;
    if (a.order !== b.order) return a.order - b.order;
    return a.title.localeCompare(b.title, "de");
  });
}

/** Pfad-Aufloesung fuer Bilder: Schema-Konvention "florilegium/<cat>/<slug>.png"
 *  liegt unter `hellmuth/public/sprites/`. Browser-URL = Vite-Public-Wurzel. */
export function imageUrl(entry: FlorilegiumEntry): string {
  return `${import.meta.env.BASE_URL || "/"}sprites/${entry.image}`.replace(/\/+/g, "/");
}

/** Pfad-Aufloesung fuer Audio: Schema-Konvention "florilegium/<cat>/<slug>.ogg"
 *  ist sprachneutral; das Backend (H23) legt pro Sprache eine OGG unter
 *  `hellmuth/assets/voice/<lang>/` ab. Im Browser muss der Build sie nach
 *  `public/voice/<lang>/` spiegeln; das Mapping bleibt eine Konvention der
 *  Asset-Pipeline (siehe docs/FLORILEGIUM-UI.md). */
export function audioUrl(entry: FlorilegiumEntry, lang: FlorilegiumLang = "de"): string {
  return `${import.meta.env.BASE_URL || "/"}voice/${lang}/${entry.audio}`.replace(/\/+/g, "/");
}
