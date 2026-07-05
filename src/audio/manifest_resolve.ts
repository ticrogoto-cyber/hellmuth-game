// Reine Manifest-Typen + Aufloesungs-Helfer (Paket A-Schema, Paket D gehaertet).
// Importfrei (nur Typ-Importe) -> Node-testbar (manifest_resolve.test.ts).
// audio_manifest.ts buendelt die JSON und re-exportiert von hier.

import type { Kategorie } from "./voice_limiter";
import { KATEGORIEN } from "./voice_limiter.ts";

// --- Sprachen / Busse -----------------------------------------------------

export type Sprache = "de" | "en" | "ko" | "zh" | "ja";

export type BusId = "master" | "musik" | "sfx" | "stimme" | "ambience";

export const BUSSE: readonly BusId[] = ["master", "musik", "sfx", "stimme", "ambience"];

export type Format = "ogg" | "m4a" | "mp3";

// Format-Kette: .ogg (Opus/Vorbis) zuerst, .m4a (AAC) fuer Safari, .mp3 universal.
// WebM/Opus verworfen (Safari unterstuetzt Opus nur im Ogg-Container). Phaser
// waehlt die erste vom Browser unterstuetzte Datei (eingebauter Fallback).
export const STANDARD_FORMATE: Format[] = ["ogg", "m4a", "mp3"];

// --- Datei / Sprite / Set / Binding ---------------------------------------

/**
 * Eine Tonquelle: ENTWEDER eine Einzeldatei (`stem`) ODER eine Region in einem
 * Audio-Sprite (`sprite` + `marker`). `lang` markiert lokalisierte Stimmen.
 */
export interface AudioFile {
  stem?: string;
  sprite?: string;
  marker?: string;
  formats?: Format[];
  lang?: Sprache;
}

export interface SpriteMark {
  start: number; // Sekunden
  dauer: number; // Sekunden
}

/** Ein Audio-Sprite-Sheet: eine Datei, viele Regionen (1 Request, 1 Decode). */
export interface SpriteSheet {
  stem: string;
  formats?: Format[];
  marks: Record<string, SpriteMark>;
}

export interface AudioSet {
  key: string;
  bus: BusId;
  files: AudioFile[];
  kategorie?: Kategorie;
  gain?: number;
  loop?: boolean;
  /** Hinweis-Feld (noch nicht als per-Set-Dedup verdrahtet). Massgeblich fuer
   *  die Wiederholungs-Drosselung ist das kategorieweite `dedupMs` im Limiter. */
  cooldownMs?: number;
  maxVariants?: number;
  optional?: boolean;
  /** Pro-Instanz-Variation (Pitch/Volume) ausschalten (Default an). */
  jitter?: boolean;
  /** Pitch-Jitter-Spanne in Cent (Default 200 = ±200 Cent). */
  jitterPitchCents?: number;
  /** Volume-Jitter-Spanne in dB (Default 1,5 = ±1,5 dB). */
  jitterDb?: number;
}

export type PickStrategie = "faction" | "unitType" | "biome" | "first";

export interface AudioBinding {
  event: string;
  pick: PickStrategie;
  sets: Record<string, string>;
}

export interface AudioManifest {
  version: number;
  sprachen: Sprache[];
  /** Startsprache. */
  standardSprache: Sprache;
  /** Referenzsprache als Fallback statt Stille (Wwise-Muster). Default en. */
  referenzSprache?: Sprache;
  sets: Record<string, AudioSet>;
  bindings: AudioBinding[];
  sprites?: Record<string, SpriteSheet>;
}

// --- Audio-Web-Root -------------------------------------------------------

export const AUDIO_ROOT = "audio/";

/** Ladbare URLs einer Einzeldatei (eine je Format, in Praeferenzreihenfolge). */
export function audioUrls(file: AudioFile): string[] {
  if (!file.stem) return [];
  const formate = file.formats && file.formats.length > 0 ? file.formats : STANDARD_FORMATE;
  return formate.map((f) => AUDIO_ROOT + file.stem + "." + f);
}

/** Ladbare URLs eines Sprite-Sheets. */
export function spriteUrls(sheet: SpriteSheet): string[] {
  const formate = sheet.formats && sheet.formats.length > 0 ? sheet.formats : STANDARD_FORMATE;
  return formate.map((f) => AUDIO_ROOT + sheet.stem + "." + f);
}

/** Cache-/Lade-Schluessel der Tonquelle (Einzeldatei: stem; Sprite: sheet-key). */
export function fileCacheKey(file: AudioFile): string {
  return file.stem ?? file.sprite ?? "";
}

/** Eindeutiger Varianten-Schluessel (fuer den Shuffle-Bag). */
export function fileKey(file: AudioFile): string {
  if (file.stem) return file.stem;
  if (file.sprite) return file.sprite + "#" + (file.marker ?? "");
  return "";
}

// --- Aufloesung -----------------------------------------------------------

export function kategorieVon(set: AudioSet): Kategorie {
  if (set.kategorie) return set.kategorie;
  switch (set.bus) {
    case "musik":
      return "music";
    case "ambience":
      return "ambient";
    case "stimme":
      return "ui";
    case "sfx":
    case "master":
    default:
      return "hit_melee";
  }
}

export function bindingIndex(manifest: AudioManifest): Map<string, AudioBinding> {
  const m = new Map<string, AudioBinding>();
  for (const b of manifest.bindings) m.set(b.event, b);
  return m;
}

export interface BindCtx {
  faction?: string;
  unitType?: string;
  biome?: string;
}

export function waehleSetKey(binding: AudioBinding, ctx: BindCtx): string | undefined {
  let selektor: string | undefined;
  switch (binding.pick) {
    case "faction":
      selektor = ctx.faction;
      break;
    case "unitType":
      selektor = ctx.unitType;
      break;
    case "biome":
      selektor = ctx.biome;
      break;
    case "first":
    default:
      selektor = undefined;
  }
  if (selektor && binding.sets[selektor]) return binding.sets[selektor];
  if (binding.sets["*"]) return binding.sets["*"];
  return Object.values(binding.sets)[0];
}

/**
 * Filtert die Dateien eines Sets auf die Wunschsprache. Lokalisierte Sets fallen
 * auf die REFERENZSPRACHE (EN) zurueck statt auf Stille, dann auf neutrale
 * Dateien. Sprachneutrale Sets (keine lang-Felder) bleiben unveraendert.
 */
export function dateienFuerSprache(
  set: AudioSet,
  sprache: Sprache,
  referenzSprache: Sprache,
): AudioFile[] {
  const lokalisierte = set.files.filter((f) => f.lang !== undefined);
  if (lokalisierte.length === 0) return set.files;
  const inSprache = set.files.filter((f) => f.lang === sprache);
  if (inSprache.length > 0) return inSprache;
  const inReferenz = set.files.filter((f) => f.lang === referenzSprache);
  if (inReferenz.length > 0) return inReferenz;
  return set.files.filter((f) => f.lang === undefined);
}

/** Die Referenzsprache eines Manifests (Default en). */
export function referenzVon(manifest: AudioManifest): Sprache {
  return manifest.referenzSprache ?? "en";
}

/** Lokalisierte Dateien eines Sets in einer bestimmten Sprache (Puffer-Fallback). */
export function dateienInSprache(set: AudioSet, lang: Sprache): AudioFile[] {
  return set.files.filter((f) => f.lang === lang);
}

/**
 * Validiert das Manifest und gibt eine Liste der Probleme zurueck (leer = ok).
 * Faengt Tippfehler in Pfad/Key frueh und klar: Bindings auf unbekannte Sets,
 * unbekannte Busse/Kategorien, kaputte Sprite-Referenzen, Dateien ohne Quelle.
 */
export function validateManifest(manifest: AudioManifest): string[] {
  const probleme: string[] = [];
  const setKeys = new Set(Object.keys(manifest.sets));
  const busSet = new Set<string>(BUSSE);
  const katSet = new Set<string>(KATEGORIEN);

  if (!manifest.sprachen.includes(manifest.standardSprache)) {
    probleme.push(`standardSprache ${manifest.standardSprache} nicht in sprachen`);
  }
  if (manifest.referenzSprache && !manifest.sprachen.includes(manifest.referenzSprache)) {
    probleme.push(`referenzSprache ${manifest.referenzSprache} nicht in sprachen`);
  }

  for (const [key, set] of Object.entries(manifest.sets)) {
    if (!busSet.has(set.bus)) probleme.push(`Set ${key}: unbekannter Bus ${set.bus}`);
    if (set.kategorie && !katSet.has(set.kategorie)) {
      probleme.push(`Set ${key}: unbekannte Kategorie ${set.kategorie}`);
    }
    if (set.files.length === 0) probleme.push(`Set ${key}: keine files`);
    for (const f of set.files) {
      if (!f.stem && !f.sprite) probleme.push(`Set ${key}: Datei ohne stem oder sprite`);
      if (f.sprite) {
        const sheet = manifest.sprites?.[f.sprite];
        if (!sheet) probleme.push(`Set ${key}: Sprite ${f.sprite} nicht definiert`);
        else if (!f.marker || !sheet.marks[f.marker]) {
          probleme.push(`Set ${key}: Sprite-Marker ${f.sprite}#${f.marker} fehlt`);
        } else {
          const mk = sheet.marks[f.marker];
          if (!Number.isFinite(mk.start) || mk.start < 0) {
            probleme.push(`Set ${key}: Sprite ${f.sprite}#${f.marker} start ungueltig (${mk.start})`);
          }
          if (!Number.isFinite(mk.dauer) || mk.dauer <= 0) {
            probleme.push(`Set ${key}: Sprite ${f.sprite}#${f.marker} dauer ungueltig (${mk.dauer})`);
          }
        }
      }
    }
  }

  for (const b of manifest.bindings) {
    for (const [sel, sk] of Object.entries(b.sets)) {
      if (!setKeys.has(sk)) probleme.push(`Binding ${b.event} (${sel}): unbekanntes Set ${sk}`);
    }
  }
  return probleme;
}
