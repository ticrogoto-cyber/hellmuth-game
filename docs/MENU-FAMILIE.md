# MENÜ-FAMILIE (Code2)

Pre-Game-Screens für HELLMUTH: Hauptmenü, Skirmish-Setup, Optionen, Footer,
AudioBus. Folge-Auftrag zur Florilegium-UI, gleiche Design-Sprache
(`docs/FLORILEGIUM-UI.md` + CODE2-DESIGN-SPEC). Eigene Dateien unter
`src/menu/`, eigener DOM-Stamm `#hellmuth-menu`, kein Eingriff in fremde Module.
Design-Tokens und Schrift kommen aus `src/ui/design_system.css`.

## 1 · View-Hierarchie und Routing

```
src/menu/
  menu_router.ts     State-Machine main|skirmish|florilegium|options
  menu.css           Stamm (#hellmuth-menu) + Bühne + Screen-Geküst
  main_menu.ts/.css  Hauptmenü (Title Screen)
  skirmish_setup.ts/.css
  options.ts/.css
  footer.ts/.css     wiederverwendbare Footer-Komponente
  menu_links.ts      Link-Konstanten (Wahrheit für H25)
  maps_data.ts       Loader für data/maps/index.json
  index.ts           Re-Exports + mountMenu()
src/audio/
  audio_bus.ts       globale Lautstärke-Schnittstelle
data/maps/
  index.json         Karten-Liste
public/sprites/maps/
  first_clearing_thumb.png  (Platzhalter, 7:5)
```

`MenuRouter` ist eine einfache State-Machine. Genau eine View ist aktiv.
`go(state)` tauscht die View in der Bühne; `florilegium` delegiert an die
externe `FlorilegiumUI` (eigener z-index) und blendet den Menü-Stamm aus, bis
das Florilegium schließt (`onClose` → zurück zu `main`). **Escape** kehrt immer
eine Ebene zurück (Subview → main; im Florilegium fängt dieses sein Escape
selbst). Der Menü-Stamm sitzt bei z-index 10000, über HUD (10) und Florilegium
(9000).

**Front-Door-Logik (`main.ts`).** Das Menü ist die Vordertür vor jedem
Spielstart. Es wird immer gemountet (Handle `window.__menu`), aber initial
verborgen und nur dann via `start()` aktiviert, wenn kein Headless-Harness
läuft. Bypass-Regel:

| URL | Verhalten |
|---|---|
| `/` (normal) | Menü aktiv, Hauptmenü sichtbar |
| `?renderer=canvas` | Menü **nicht** aktiviert (Headless-Screenshot-Modus von H3/H24 sieht HUD/Florilegium) |
| `?florilegium=1` | direktes Florilegium (H24), Menü übersprungen |
| `?menu=1` | Menü erzwungen (H25-Screenshot, auch mit `renderer=canvas`) |
| `?editor=1` | Editor, alles andere übersprungen |

Der Menü-Stamm ist opak; deshalb ist die verborgen-bis-`start()`-Disziplin
Pflicht, sonst verdeckt er HUD/Florilegium in den Headless-Läufen.

## 2 · Hauptmenü-Spezifikation

Title `HELLMUTH` (Printvetica, clamp 56–104px), Tagline `Hellmuth durch Wissen`
(Fournier Italic). Fünf Punkte vertikal, leicht links:

```
KAMPAGNE       (ausgegraut, disabled)
SKIRMISH       → go(skirmish)
FLORILEGIUM    → go(florilegium)
OPTIONEN       → go(options)
UNTERSTÜTZEN   → openExternal(LINKS.support)  [neuer Tab]
```

**Hover/Fokus:** aktiver Punkt leuchtet im HELLMUTH-Gold (`--accent`),
ausgegraute Punkte sind nicht hoverbar. **Tastatur:** Pfeil Auf/Ab navigiert
über die aktivierbaren Punkte, Enter aktiviert. Footer unten.

## 3 · Skirmish-Setup-Spezifikation

Vorbild AoE4 / They Are Billions. Felder:

- **Karte** — Galerie aus `data/maps/index.json` (Thumbnail 7:5, Name,
  Beschreibung). MVP: eine Karte (`Die erste Lichtung`). Auswahl per Klick,
  aktive Karte mit Gold-Rahmen.
- **Eigene Fraktion** — segmentierte Wahl, mit Banner-Vorschau.
- **Gegner-Fraktion** — automatisch die andere, als Info (nicht wählbar).
- **Schwierigkeit** — Leicht | Normal | Schwer.
- `[Starten]` (primär) ruft `onStart(params)`; `[Zurück zum Hauptmenü]`.

`SkirmishParams = { mapId, faction, difficulty }`.

**Fraktionsnamen — Abweichung von der Spec, bewusst.** Die CODE2-Specs nennen
die Fraktionen »HELLMUTH / MODERAT«. Das widerspricht der verbindlichen
`docs/NAMING_CANON.md` (kanonisch: **DIE HELLMUTH** und **DIE MODERAT**; und
`Hellmuth` ist dort der **Held**, ausdrücklich keine Fraktion). Da CLAUDE.md den
Naming-Canon als verbindliche Quelle für alle Fraktionsnamen setzt und der
Spielcode `FactionId = "hellmuth" | "moderat"` nutzt, rendert das Setup die
kanonischen Namen. Umbenennung auf HELLMUTH/MODERAT nur nach ausdrücklicher
Freigabe durch Ticro — dann an genau einer Stelle (`FACTION_LABEL` in
`skirmish_setup.ts`).

**Spiel-Init.** `onStart` ist im Gerüst ein **klar markierter Stub** (`main.ts`,
`GameBridge.start`): persistiert die Parameter nach `localStorage`
(`hellmuth_skirmish_v1`), feuert `skirmish:start` und blendet das Menü aus —
das bereits laufende Spiel wird sichtbar. Die echte Init mit Fraktion/Karte/
Schwierigkeit als Eingang wird verdrahtet, sobald die Spiel-Init-Funktion einen
Parameter-Eingang anbietet.

## 4 · Optionen-Menü mit localStorage-Schema

Felder: **Musik**, **Soundeffekte**, **Stimme**, **Gesamt** (je Slider 0–100),
**Vollbild** (Toggle, `requestFullscreen`/`exitFullscreen`), **Sprache**
(DE aktiv, EN noch deaktiviert). `[Zurück]` und `[Standard wiederherstellen]`.

Lautstärke-Slider schreiben direkt auf den `AudioBus` (`set(channel, 0..1)`),
der seinerseits persistiert. Vollbild/Sprache liegen im selben Schlüssel, ohne
die Audio-Felder zu zerstören.

```jsonc
// localStorage["hellmuth_options_v1"]
{
  "master": 1.0,   // AudioBus
  "music":  1.0,   // AudioBus
  "sfx":    1.0,   // AudioBus
  "voice":  1.0,   // AudioBus
  "fullscreen": false,
  "language": "de"
}
```

Beim App-Start lädt `AudioBus.loadFromStorage()` die vier Lautstärken; die
Optionen-View liest Vollbild/Sprache aus demselben Schlüssel.

## 5 · Footer-Komponente mit Link-Konstanten

`buildFooter()` rendert:

```
© 2026 Hellmuth Development
kokos-und-zitrone.de | hellmuth-soda.de | Buch kaufen
```

Link-Konstanten (Wahrheit für H25) in `src/menu/menu_links.ts`:

| Schlüssel | URL |
|---|---|
| `support` | https://donate.stripe.com/5kQ28r9bzf2n79l3Pn2kw00 |
| `kokos` | https://kokos-und-zitrone.de |
| `soda` | https://hellmuth-soda.de |
| `buch` | https://www.amazon.de/dp/B0GT4G61VX |

Alle externen Links öffnen in neuem Tab (`target=_blank`, `rel=noopener
noreferrer`); ein expliziter `openExternal()`-Handler greift im späteren
Electron-Wrapper.

## 6 · AudioBus-Schnittstelle

`src/audio/audio_bus.ts` — die einzige neue globale Audio-Schnittstelle.

```typescript
AudioBus.master | music | sfx | voice   // 0..1
AudioBus.effectiveMusic()  // master * music
AudioBus.effectiveSfx()    // master * sfx
AudioBus.effectiveVoice()  // master * voice
AudioBus.set(channel, 0..1)   // persistiert + feuert "audio:volume-changed"
AudioBus.loadFromStorage() / saveToStorage()
```

Konsumenten ziehen die Werte hier (Florilegium-Voice-Player tut das bereits und
hört auf `audio:volume-changed`). HUD-Sound und Spiel-Musik docken später hier
an, ohne neue Schnittstelle. Globaler Handle `window.__audioBus` (für H25). Der
bestehende `AudioManager` (src/audio/audio_manager.ts) bleibt unangetastet.

## 7 · Werkzeug-Spec H25

`tools/menu_ui_check.py` (+ `tools/menu_ui_browser.mjs`), Muster wie H24.
Headless-Chromium gegen `dist/`, Flag `?menu=1`. Prüft:

- Hauptmenü rendert, fünf Punkte, Kampagne disabled
- Design-Tokens: Hintergrund `rgb(26,26,26)`, Printvetica im Title,
  `font-feature-settings` enthält `liga 0`, ≥ 2 `@font-face`
- Footer-Links == Konstanten (`menu_links.ts`)
- `window.__audioBus` global mit `effectiveMusic/Sfx/Voice`, Werte in [0,1]
- Skirmish rendert gegen `data/maps/index.json` (Anzahl + Name)
- Optionen schreibt Lautstärke in `localStorage` (Musik-Slider → `music=0.4`)

```
npm run build
python3 tools/menu_ui_check.py            # Strukturpruefung
python3 tools/menu_ui_check.py --shoot --view main|skirmish|options
```

H25 ist in `werkzeuge_check.py` `active=False` bis `dist/` vorliegt (gleiche
Konvention wie H3/H24). Nach `npm run build` schaltet er auf PASS.

## 8 · Screenshot-Belege pro View

`proof/menu/` (Headless-Render, 1920×1080):

- `menu_main.png` — Hauptmenü (Printvetica-Title, Fournier-Tagline, fünf
  Punkte, Kampagne ausgegraut, Skirmish gold-fokussiert, Footer)
- `menu_skirmish.png` — Karte »Die erste Lichtung«, Fraktionswahl mit
  Banner (DIE HELLMUTH), Gegner-Info, Schwierigkeit, Starten/Zurück
- `menu_options.png` — vier Gold-Slider, Vollbild-Toggle, Sprache DE/EN,
  Zurück/Standard

Florilegium im selben Design (dunkel): `proof/florilegium/apothekerin_*.png`.

---

## Erfolgsmaßstab (Abgleich)

- App-Start zeigt das Hauptmenü mit fünf Optionen. ✓ (`menu_main.png`)
- Skirmish: Fraktion + Karte + Schwierigkeit wählbar, Starten blendet ins
  Spiel. ✓ (Stub-Init, `menu_skirmish.png`)
- Optionen: Musik auf 50%, Neustart hält den Wert (localStorage). ✓ (H25
  prüft den Roundtrip)
- Florilegium öffnet aus dem Menü, Apothekerin mit Audio (sobald OGG da). ✓
- Unterstützen/Buch öffnen externe Seiten im neuen Tab. ✓ (Link-Konstanten)
