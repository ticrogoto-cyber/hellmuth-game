# FLORILEGIUM — UI (Code2)

Mass-Effect-Codex-Funktion, In-Welt-Kompendium. Optik nach CODE2-DESIGN-SPEC:
dunkler Grund (`#1a1a1a`), cremeweisse Schrift, Gold-Akzent, Printvetica
(Titel/Navigation) plus Fournier Pro (Fliesstext). Tokens und Schrift teilt sich
die UI mit der Menue-Familie ueber `src/ui/design_system.css`. UI gegen den Schema-
Vertrag in `data/florilegium/schema.json` (Welle 5, Code9). Inhalt kommt aus
`data/florilegium/<lang>/<category>/<slug>.json`, vorab geprueft durch H22
(`tools/florilegium_validate.py`) und vorvertont durch H23
(`tools/florilegium_voice.py`).

## 1 · Was diese UI ist

Eine eigenstaendige, selbst-mountende View ueber dem Spiel. Zwei Modi:

- **fullview** — Vollbild ueber dem Hauptmenue. Im Spiel ueber Tastatur (`J`)
  oder URL (`?florilegium=1`).
- **overlay** — Schiebe-Overlay vom rechten Rand waehrend laufender Partie.
  Im Spiel ueber Tastatur (`J`) oder URL (`?florilegium=1&flomode=overlay`).

Beide Modi nutzen denselben DOM-Stamm `#florilegium`, dieselbe CSS-Datei
(`src/ui/florilegium.css`) und denselben Renderer (`src/ui/florilegium_ui.ts`).
`hud.css` und `html_hud.ts` werden nicht angefasst. Die UI lebt vor `#hud`
(z-index 9000) und konsumiert seine eigene Eingaben (Escape, Klick auf den
Scrim im Overlay-Modus).

Eingang in `main.ts` ist ein einzelner dynamischer Import (`void import("./ui/
florilegium_ui")`) am Ende des Spielboots. Vor dem Mount steht keine Network-
oder Daten-Latenz: Eintraege werden zur Buildzeit von Vite gebuendelt
(`import.meta.glob(..., { eager: true })`).

## 2 · Komponenten

| Datei | Rolle |
|---|---|
| `src/ui/florilegium_data.ts` | Loader + Typen + Pfad-Aufloesung. Konsumiert das Schema 1:1. |
| `src/ui/florilegium_unlock.ts` | Unlock-Adapter (always/build/kill/research) + Mock-Quelle. |
| `src/ui/design_system.css` | Geteilte Tokens, `@font-face`, Typo-Hierarchie (auch von der Menue-Familie genutzt). |
| `src/ui/florilegium_audio.ts` | OGG-Player (HTMLAudioElement, Pause-Toggle, Lautstaerke global aus dem AudioBus). |
| `src/ui/florilegium_ui.ts` | View-Klasse + `mountFlorilegium()` + URL-/Tasten-Bruecke. |
| `src/ui/florilegium.css` | Dunkles Codex-Layout (Tokens aus design_system.css), beide Modi. |
| `tools/florilegium_ui_check.py` | H24-Python-Hebel um das JS-Harness. |
| `tools/florilegium_ui_browser.mjs` | Headless-Chromium-Harness, schwester zu `hud_browser.mjs`. |

Keine dieser Dateien teilt sich Symbole oder Selektoren mit `hud.css` oder
`html_hud.ts`. Vite-Build bestaetigt die Trennung: das Florilegium-Bundle
landet als eigenes Chunk (`florilegium_ui-*.js` + `.css`) und wird nur dann
geladen, wenn die UI geoeffnet wird.

## 3 · Daten-Schicht

`loadFlorilegium(lang)` liefert alle Eintraege einer Sprache. Sortierung:
Kategorie-Reihenfolge aus dem Brief (`fraktionen` → `einheiten` → `gebaeude` →
`substanzen` → `konzepte` → `welt`), dann `order` aufsteigend, dann Titel
(`localeCompare('de')`).

Pfade folgen Schema-Konvention:

- **Bild**: `image` ist relativ zu `hellmuth/public/sprites/`. URL =
  `/sprites/<image>`. Vite kopiert `public/` automatisch nach `dist/`.
- **Audio**: `audio` ist sprachneutral, der pro-Sprache-Anteil kommt von H23.
  URL = `/voice/<lang>/<audio>`. **Erwartung an die Asset-Pipeline:** der Audio-
  Generator (H23) legt seine Output-OGGs entweder direkt unter
  `hellmuth/public/voice/<lang>/florilegium/<category>/<slug>.ogg` ab oder ein
  Build-Hook (Vite `publicDir`-Alias, Symlink) spiegelt von `assets/voice/`
  dorthin. Solange das fehlt, schlaegt der Audio-Button still fehl (kein
  Crash). Reicht fuer die Geruest-Phase; muss vor dem ersten Audio-Rollout mit
  Code9 abgestimmt werden.

Validierung passiert NICHT zur Laufzeit. H22 ist das Gate dafuer, hier wird
nur konsumiert. Wenn ein Eintrag kein gueltiges Schema hat, ist der Bug bei
H22 (oder im Eintrag), nicht in der UI.

## 4 · Unlock-Logik

`FlorilegiumUnlock` wird in `isUnlocked(unlock, src)` aufgeloest:

- `type=always` → immer sichtbar, `trigger` ignoriert.
- `type=build|kill|research` → sichtbar gdw. die UnlockSource `has(type, trigger)`
  liefert `true`.

`UnlockSource` ist ein schmales Interface. Default ist `MockUnlockSource`
(leer; `always`-Eintraege durch, Rest blockiert). Sobald der State-Manager
echte Events ausgibt, wird hier ein Adapter eingestoepselt — die UI bleibt
unveraendert. Re-Render geschieht ueber `onChange()`.

Aktueller Stand (Brief, Geruest-Phase): nur die Apothekerin (`always`) ist
sichtbar.

## 5 · Audio-Player

Ein HTMLAudioElement pro Mount. Drei Aktionen:

- **Stimme** (Play) → laedt die URL und startet. Wenn die Datei fehlt, gibt
  `play()` einen Rejection-Promise zurueck; der Player setzt sich zurueck,
  ohne den User zu stoeren.
- **Pause** → Toggle auf der aktuell geladenen Quelle.
- **Stop bei Eintrag-Wechsel** → die View ruft `player.stop()` in jedem
  `flo-item`-Klick. Geschlossene View (Escape oder Schliessen-Button) ruft
  ebenfalls `stop()`.

Lautstaerke ist global und kommt aus dem **AudioBus**
(`src/audio/audio_bus.ts`, `effectiveVoice() = master * voice`), gesetzt im
Optionen-Menue. Der Player hat keinen eigenen Regler mehr; er hoert auf das
Event `audio:volume-changed` und zieht den Wert live nach. Das Bild im Detail
nutzt das feste Verhaeltnis 168.956/120.866 (`--florilegium-image-ratio`,
object-fit cover gegen Verzerrung).

## 6 · Pruefen / Beweis

Werkzeug-Hebel **H24** (`tools/florilegium_ui_check.py`):

```
npm run build                                  # einmal pro UI-Aenderung
python3 tools/florilegium_ui_check.py          # Strukturpruefung (Default)
python3 tools/florilegium_ui_check.py --shoot  # Apothekerin-Render-Beweis
```

Strukturpruefung misst gegen die echte gerenderte App (`vite preview`):

- `#florilegium` ist offen und hat `data-mode=fullview`
- mindestens ein Eintrag in der Liste
- gewuenschter Eintrag (`?entry=<id>`) ist aktiv
- Detail-Titel und -Text gerendert, Text >= 200 Zeichen
- Tab-Leiste enthaelt "Einheiten"
- Audio-Button vorhanden
- Codex-Rahmen mindestens 1200×700 px

`--shoot` produziert `proof/florilegium/<id>_<mode>.png`. Aktueller Stand:

- `proof/florilegium/apothekerin_fullview.png` — Vollbild-Render der Apothekerin
- `proof/florilegium/apothekerin_overlay.png` — Schiebe-Overlay-Variante

(Das Bild im Render ist derzeit ein 1×1-Platzhalter von Code9; sobald ein
echtes `public/sprites/florilegium/einheiten/apothekerin.png` einliegt, fuellt
sich der Kasten ohne UI-Aenderung.)

H24 ist in `tools/werkzeuge_check.py` als RESERVED bis `dist/` existiert
(gleiche Konvention wie H3 `hud_browser.mjs`). Nach `npm run build` schaltet
er auf PASS um.

---

## Anhaenge

- Schema-Quelle: `data/florilegium/schema.json` (Code9, Welle 5)
- Backend-Doku: `docs/FLORILEGIUM-BACKEND.md` (Code9)
- Werkzeug-Inventar: `docs/WERKZEUGE.md` § Welle 5
