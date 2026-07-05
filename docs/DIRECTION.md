# DIRECTION.md — die eine Richtungs-Wahrheit (verbindlich)

Dies ist das **jüngste vom Menschen bestätigte** Richtungsdokument. Es gibt ab
jetzt **genau eine** Quelle der Wahrheit zur Richtung. Bei Konflikt zwischen
Richtungsdokumenten gilt das jüngste vom Menschen bestätigte — und das ist
**dieses**.

## Verbindlich

- **`BLUEPRINT-V3-HUD-EDITOR.md`** — HUD-Komponentensystem + In-Engine-Karteneditor.
  Erweitert V2 und **ersetzt** zwei V2-Teile: den Megatextur-Kartenweg (V2 §5.1)
  und den bildbasierten HUD-Ansatz (Auftrag §7). **Bei Konflikt gilt V3.**
- **`BLUEPRINT-V2-NIFTY-PLUS-ASSETS.md`** — Spiel-/Aufbau-Blueprint (Mechanik,
  Einheiten-Pipeline, Effekt-Architektur, Fraktions-/Asset-Gesetze gelten weiter).
- **`asset-spec.md`** — Master-Asset-Spezifikation (Projektion, Normalisierung).

Kein anderes Richtungsdokument hat Vorrang. Wo `CLAUDE.md`,
`docs/ENGINE_REVIEW.md`, `HELLMUTH_ART_BIBLE_v2.md` oder sonstige Dateien
diesen widersprechen, gewinnen die oben (jüngstes zuerst: V3).

### Kerngesetz V3
Kein Bild ist je größer als ein Baustein. Struktur, Layout und Verhalten leben
ausschließlich in Code und Daten. Generierte Kunst liefert nur kleine,
austauschbare, fraktionsskinnbare Teile. HUD = aus Bausteinen komponiert (keine
Voll-Paneele, keine Zonen-JSON). Karte = Daten (`map.hellmuth.json`) plus
In-Engine-Editor; Megatextur nur noch als Backdrop/Fallback im Code.

## Arbeitsbranch (verbindlich, eine Quelle)

Arbeits- und Integrationsbranch ist `claude/quirky-fermat-8rewv0`. Solutions-Recherche liegt auf `claude/eloquent-hawking-be4v29` (read-only-Berichte). Ältere Branch-Namen in Alt-Dokumenten sind historisch und ungültig.

## Engine

Maßgeblich ist der lauffähige **Phaser-Sprite-Build** (`src/`). Der
**Babylon-Track (`proof3d/`) ist eingefroren** und wird nicht weiterentwickelt.

## AP8 — Steam-Packaging (nur dokumentiert, NICHT vor AP3–AP7 bauen)

Publikationsziel ist ein **Steam-Release**, kein Browsergame. Die Architektur
ändert sich **nicht**: Phaser bleibt, am Ende wird in **Electron** verpackt,
Steamworks-Anbindung über **steamworks.js**.

Ratifiziert 2026-07-03 per Blueprint-2-Entscheid (A1): Electron + steamworks.js ist der Auslieferungsweg; Tauri ist verworfen (Steam-Overlay, Cross-Build). Anderslautende Angaben in Nebendokumenten sind ungültig.

Offene Stichpunkte für AP8:

- **Electron-Build:** Vite-Output in einen Electron-Shell-Build packen
  (Main-/Renderer-Prozess, Production-Bundle, Code-Signing später).
- **steamworks.js:** Achievements, Steam-Overlay, Cloud-Saves.
- **Vollbild- & Auflösungs-Handling:** Fenster-/Vollbildmodus, Skalierung,
  unterstützte Auflösungen, DPI.
- **Settings-Menü:** Grafik, Audio, Steuerung, Sprache.
- **Save-System:** lokale Spielstände + Steam-Cloud-Sync.
- **Steam-Depot-Anforderungen:** Depots, Build-Upload (steamcmd), Store-Assets,
  Altersfreigaben.

AP8 wird **erst nach Abschluss von AP3–AP7** angefasst. Hier nur notiert, damit
die Architektur (Electron-tauglich bleiben) nicht versehentlich verbaut wird.

## Warum es dieses Dokument gibt

Es gab zwei konkurrierende Richtungsdokumente (u. a. das gelöschte
`REBUILD_DIRECTION.md`, das einen Babylon-Neustart vorschrieb). Das Ergebnis
war ein Tag verlorener Arbeit am falschen Track. Genau eine Quelle der Wahrheit,
nie wieder zwei.
