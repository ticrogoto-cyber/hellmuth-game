# HUD-SOLL-SPEC — HELLMUTH

**Die verbindliche, pixel-genaue HUD-Gestaltung.** Rekonstruiert aus den Arbeitssitzungen, jede Zeile belegt. Diese Datei ist die Wahrheitsquelle, die nie wieder verloren geht. Was die Transkripte nicht hergeben, steht unter **OFFENE ENTSCHEIDUNG TICRO** — nicht erfunden.

Beleg-Notation: `[T:n]` = Transkript `Claude-GAME-5-2026-06-15__3` Zeile n · `[R:datei:zeile]` = Repo @ Integrationslinie · `[Ü:Cn]` = `FABLE-UEBERGABE-2026-06-16` Abschnitt · `[V2:n]` = `docs/hud-spec-v2.md` · `[V3:n]` = `BLUEPRINT-V3-HUD-EDITOR.md`.

---

## 0 · Geltung & Messbasis

- **Integrationslinie / Ziel-Branch:** `claude/quirky-fermat-8rewv0`. Gemessen wurde gegen `41ba145`; HUD-Dateien sind bis Tip `673d715` unverändert. **Der Arbeitsbaum-Default `0764e36` (hopeful-cannon) ist der alte Vor-Umbau-Stand und NICHT maßgeblich** (`--hud-scale` dort 0×, auf der Integrationslinie 91×) `[R:src/ui/hud.css]`.
- **Code-Stand der Implementierung:** `src/ui/html_hud.ts`, `src/ui/hud.css`, `src/ui/hud_tint.ts`, `src/ui/hud_strip_data.ts`. Geometrie in **Design-Pixeln @1920×1080**, uniform skaliert über genau einen Faktor `--hud-scale = min(100vw/1920, 100vh/1080)` `[R:src/ui/hud.css:17]`. Im Folgenden `s` = `var(--hud-scale)`; bei 1920×1080 gilt `s=1`, also px == Design-px.
- **Was diese Spec einfriert:** die **Rahmenebene** (kanten-differenzierte Leisten + Tönung + Anker + Eckstück + Sigil + Ressourcen) — das ist die über Tage erarbeitete Gestaltung, die nur im Chat lebte. Die **Blütenebene** (König/Begleiter/Säulen/Fläschchen) ist per `[T:174]` aus dem HUD zu entfernen (§9), bis zum späteren Hero-Asset-Einbau.
- **Architektur-Vorbehalt (§11):** Der Code folgt der **V2-Schichtarchitektur** (px-vermessen), der Vertrag `BLUEPRINT-V3` fordert den **Bausteinkasten** (vw/vh, keine Bildmaße). Das ist eine offene Architekturfrage; diese Spec friert den real implementierten V2-Strip-Stand ein und markiert die V3-Differenz als Ticro-Entscheidung.

---

## 1 · Panels & Anker

Fünf Panels, alle `.panel`-Boxen `[R:src/ui/html_hud.ts:189,196,198,207,232]`. Vier hängen an echten Viewport-Ecken, die Einheitenkarte sitzt in der zentrierten `.hud-stage` (`left:50%; bottom:0`) `[R:src/ui/hud.css:30-34]`.

| Panel | Klasse | Anker (Code) | Maß Design-px | Beleg |
|---|---|---|---|---|
| Emblem-Kästchen | `.p-emblem` | oben links `left:0; top:0` | 279×96 | `[R:hud.css:102]` `[V2:9]` |
| Menü-Kästchen | `.p-menu` | oben rechts `right:0; top:0` | 139×48 | `[R:hud.css:127]` `[V2:9]` |
| Minimap | `.p-minimap` | unten links | 286×286 | `[R:hud.css:136]` `[V2:10]` |
| Einheitenkarte | `.p-unitcard` | **horizontal zentriert**, unten-bündig (in `.hud-stage`) | 878×241 | `[R:hud.css:142]` `[V2:11]` |
| Ressourcenfenster | `.p-resources` | unten rechts `right:130` | 174×216 | `[R:hud.css:219]` `[V2:11]` |

- **Skalierung:** genau **ein** `--hud-scale`, keine `transform:scale`, kein vw/vh pro Panel `[R:hud.css:17,32-34]` `[Ü:Paket C »ein --hud-scale«]`. Klick-Geometrie bleibt DOM-Wahrheit (`getBoundingClientRect`) `[R:c631e16-Commit »HUD-Anker«]`.
- **»Karte zentriert«** = nur Einheitenkarte + ihre Ornamente in der zentrierten Bühne; die vier Eck-Panels kleben an den echten Ecken (bei 21:9/4:3 kleben sie, Letterbox nur mittig) `[T:3231]`.
- **Hinweis Korrektur:** Frühere Messung (T6) meldete »Anker rückgängig« — das war eine Messung des alten Arbeitsbaums `0764e36`. Auf der Integrationslinie ist das Anker-Layout vollständig vorhanden `[R:hud.css:17,30-34,102,127]`.

**OFFENE ENTSCHEIDUNG TICRO:** exakte Eck-Offsets (Minimap 16/15 px, Ressourcen 130/15 px) sind nur code-, nicht transkript-belegt — verbindlich oder Ermessen? `[R:hud.css:131,219]`

---

## 2 · Leisten / Strips (die kanten-differenzierte Rahmung)

Das Kerngesetz: **die offene Oberkante trägt eine ANDERE Leiste als die geschlossenen Kanten.** Ein uniformes Band über alle vier Kanten ist falsch `[T:6851]` `[T:1554]`.

### HELLMUTH (zwei Leisten, eine 90°-Drehung)
- **Oberkante** (Einheitenraster, Minimap, Ressourcenfenster): `hellmuth_strip_h_b` — die **OFFENE**, höher ragende Leiste `[T:1582]` `[R:tools/build_hud_strips.py:9-11]`.
- **Unterkante**: `hellmuth_strip_h_a` — geschlossen `[T:1582]`.
- **Vertikale (links+rechts):** `hellmuth_strip_h_a` **um 90° im Uhrzeigersinn gedreht** (HELLMUTH hat keine eigene V-Leiste) `[T:1582]` `[R:build_hud_strips.py:53 np.rot90(k=3)]`.
- **Emblem- + Menü-Kästchen:** reines `hellmuth_strip_h_a`, **keine** offene Oberkante `[T:1582-1583]`.

### MODERAT (eigene Leisten, kein Drehen)
- **Oberkante = Unterkante:** `moderat_strip_h_e` (geschlossen, dieselbe horizontale für oben und unten) `[T:1583,1586]` `[R:html_hud.ts:177 sTop=sBot=G_H]`.
- **Vertikale:** `moderat_strip_v_e` (eigene V-Leiste, kein Drehen) `[T:1556,1583]` `[R:build_hud_strips.py:11]`.

### Maße & Rendering
- **Leistenstärke = 15 px** (Unterkante + Vertikale), als `--ornW/--ornH = calc(15 * s)` `[R:hud.css:23-24]` `[V2:8]` `[T:1643]`. Festgelegt im Stufe-1-Commit »nur Panels + 15px-Frames« `[T:1820]`.
- **Offene HELLMUTH-Oberkante = 26 px** (`calc(26 * s)`), ragt bewusst höher als die geschlossenen 15 px `[R:hud.css:86,92-94]`. Qualitativ »die halboffene, die schöne« `[T:1554]`.
- **Kachelung Pflicht durchgehend, nicht gestreckt, nicht fragmentiert:** vier Hintergrund-Lagen mit `repeat-x` (oben/unten) bzw. `repeat-y` (Seiten) auf `.panel::before`; Bodenleiste `.hud-bar` per `background-repeat: round` `[R:hud.css:94-97,65]`. Rapport ≤256 px, nahtlos geschnitten (`build_hud_strips.py _best_seam`) `[R:build_hud_strips.py:33-46]` `[T:1904]`.
- **`cut_elbow`-Eckverschmelzung:** die Horizontalen liegen oben im Lagen-Stapel und tragen die Ecke; HELLMUTH-Frame aus `strip_h_a` mit Eckverschmelzung gebacken `[T:1559,1582]` `[R:hud.css:87-88]`.
- Master-Maße (eingebetteter Rapport): `K_TOP 280×104, K_BOT 192×212, K_SIDE 212×192, G_H 144×234, G_V 150×120` `[R:src/ui/hud_strip_data.ts:7-11]`.

### Anti-Fall (was NICHT sein darf, belegt)
- `border-image: img 32` ohne Keyword = Default `stretch` → »gestreckt statt gekachelt« (Chrome: stretch konstant 31 px, round skaliert mit Kantenlänge) `[T:1899]`.
- `background-size: auto 100%` auf einem Vollbreitband (z. B. 2172×171) → eine Kachel ~190 px, liest sich gestreckt `[T:1903]`.

**CODE≠SOLL (Gate-relevant):**
1. **`strip_h_b`/Oberkante liegt global auf JEDEM Panel** — auch Emblem (96 px) und Menü (48 px) tragen die offene 26-px-Oberkante, weil `--strip-top` global auf `:root` gesetzt wird. Soll: offene Oberkante NUR auf den 3 Hauptpanels `[T:1582-1583]` vs `[R:html_hud.ts:178 + hud.css:89]`. **Differenz — fixen (per-Panel-Override).**
2. **`preserveAspectRatio="none"` im Tönungs-SVG** streckt den Master auf die Ziel-Box (Streck-Verdacht bei AR-Mismatch) `[R:hud_tint.ts:44]`.

**OFFENE ENTSCHEIDUNG TICRO:** exakte Höhe der offenen Oberkante (26 px vs anderer Wert; nur qualitativ »halboffen« belegt) `[T:1554]`; Stärke der gedrehten HELLMUTH-Vertikalen (intrinsisch breiter); ob die `cut_elbow`-CSS-Stapelung eine sichtbare Doppelkante erzeugt `[T:1919,1941]`.

---

## 3 · Licht & Tönung

**Grundgesetz: Fraktionsfarbe wird NIE ins Asset gebacken.** Graustufen-Master + Laufzeit-Tönung; das Relief bleibt der Master `[R:hud_tint.ts]` `[T:1945,1962]`.

- **SVG-Tönungspfad** (Panel-Rahmen): `feColorMatrix saturate 0 → feFlood(Fraktionsfarbe) → feBlend luminosity → feComposite in` `[R:hud_tint.ts:38-46]`.
- **`color-interpolation-filters="sRGB"` ist PFLICHT** (Default linearRGB verschiebt Mitteltöne / Safari weicht ab) `[R:hud_tint.ts:37]` `[T:1883]`.
- **Master als `data:image/png;base64`-URI eingebettet** — KEINE externe `/sprites/`-href: ein SVG als CSS-`border-image` läuft im secure-static-mode und lädt keine externen Bilder, sonst **unsichtbarer Rahmen** `[R:hud_tint.ts:25-28]` `[T:3071,3023,3544]`.
- **Master trägt NIE Farbe / Relight-Gradient / Patina.** Die destruktive Kohärenz-Kette (135°-Relight, palette_match, grain) ist als Färbungsmechanismus stillgelegt — sie war die Regressionsquelle `[T:1916,1945]`.
- **Zielwerte (Graustufen-Median):** Frame-Master ≈ **150**, Leisten-Master ≈ **78** (`STRIP_MEDIAN`, bewusst dunkler, damit Magenta nicht grell liest) `[R:tools/build_hud_assets.py:40]` `[R:tools/build_hud_strips.py:29]`. Per-Leiste: HELLMUTH-Strips 92, MODERAT g_h 50, g_v 56 `[R:build_hud_strips.py:64-70]`.
- **Tönung gedämpft** (Commit `3a1c155`): durch dunklere Strip-Master, kein eigener Skalar `[R:3a1c155-Commit]`.
- **LumaStd-Materialwahrheit:** MODERAT-Stahl erreicht intrinsisch nur **~35–40**, HELLMUTH-Gold **~42–47**. Die Schwelle ≥45 erreicht keine MODERAT-Leiste — Materialwahrheit, kein Pipeline-Fehler; ehrlich gemeldet `[T:2732-2737]`.
- **Lichtrichtung:** nur qualitativ »Quell-Licht der gut beleuchteten Zier-Objekte nicht antasten, lieber die Leisten anpassen« `[T:992]`; die synthetische 135°-Relight-Rampe ist verworfen `[T:1916]`. Ein numerischer Soll-Azimut ist NICHT festgelegt.

**OFFENE ENTSCHEIDUNG TICRO:** (a) MODERAT-LumaStd ~35–40 akzeptiert (geschwärzter Stahl ist ruhiger als Gold) oder reliefreichere Leiste? Code1+ hat zur Bild-Abnahme »~35–40 akzeptiert« freigegeben, die ≥45-Schwelle bleibt formal `[T:2743,2778]`. (b) exakte Dämpfung / eingebackene Lichtrichtung falls als Gate-Konstante gewünscht.

---

## 4 · Eckstücke (Zier-Eckstück »topleft«)

Das Zier-Eckstück ist ein dekoratives Filigran, das **auf der Ecke des Emblem-Kästchens** sitzt — KEIN Leisten-Stoß `[T:2062]`.

- **Aktueller Render-Mechanismus (Integrationslinie):** `.emb-corner` als **Kind von `.p-emblem`**, Asset `/sprites/ui/hud/emblem_corner/<faction>.png`, `z-index:6`, 168 px, `transform: translate(-38%,-38%)`; andere Ecken per CSS-Spiegelung `[R:html_hud.ts:184-186]` `[R:hud.css:116-124]`. Vorhanden: `emblem_corner/hellmuth.png` (1441×962 RGBA) + `moderat.png` (849×885 RGBA) `[R:public/sprites/ui/hud/emblem_corner/]`.
- **Quell-Assets:** HELLMUTH `hellmuth_v_topleft_gpt_a.png` (1536×1024 RGBA, saubere Quellkunst, in `freigestellt/`) `[T:1582,2062]`; MODERAT `moderat_v_topleft_d.png` (RGBA in `freigestellt/`) bzw. die nachgenerierte `moderat_v_topleft.png` (roh RGB in `orn/`, Freistellen nötig) `[T:1583,2473]`.
- **Raw-Bypass-Regel:** Zier-Assets (vorbeleuchtet) laufen `pipeline:"raw"` = **nur freistellen + trim, kein relight/desat/palette/grain** `[R:tools/build_hud_assets.py:138]` `[T:1568,1584]`. Pflichtprüfung auf **eingeschlossenes Grau** in den L-Aussparungen/Ranken-Lücken (Rand-Flood-Fill killt nur randerreichbares Grau) `[T:2501,2508]`.

**Anti-Fall (was NICHT sein darf, belegt):** Der alte Stand (`d0495a2`/`beautiful-thompson`) referenzierte `topleft/gpt_a.png` / `topleft/d.png`, die nie erzeugt wurden → **404 + toter Anker**, echte Quelle ungenutzt in `freigestellt/` `[T:1847]`. Soll: Asset per **Basename aus dem Manifest** auflösen, Ordner egal (§10).

**OFFENE ENTSCHEIDUNG TICRO:** (a) MODERAT-Materiallücke — `moderat_v_topleft_a–d` tragen laut TODO alle Magenta-Glow + Tropfen; kein leucht-/tropfenfreies Eck `[T:1749]`; nachgenerieren ja/nein? (b) ob MODERAT überhaupt ein Zier-Eck bekommt `[T:2068]`. (c) andere Ecken als oben links (oben rechts / unten) — nicht belegt.

---

## 5 · Sigil

- **MODERAT:** `moderat_sigil_a` **mittig auf der Oberkante des Einheitenrasters, vertikal UND horizontal zentriert** `[T:992,1583,6172,6714]`. Code: horizontal zentriert bei x≈960 (`left=928`, sz=64), `top=794`, `z-index:8` (über der Leiste) `[R:html_hud.ts:343-345]` `[R:hud.css:280-284]`.
- **HELLMUTH:** **KEIN Sigil** `[T:992,1566,1582,6172]`. Render-Gate schließt HELLMUTH aus (`if faction==="moderat" && cfg.sigil`) `[R:html_hud.ts:283]`; HELLMUTH-Sigil-Assets liegen ungenutzt bereit.

**OFFENE ENTSCHEIDUNG TICRO:** Sigil-Größe (Code 64 px, nur »in schöner Größe« belegt — verbindlich oder Augenmaß?) `[T:992]`; Z-Order über/unter der Oberkante (Code: drüber, z8) bestätigen; ob HELLMUTH je ein Sigil bekommt (»da finden wir noch eine Lösung«) `[T:992]`.

---

## 6 · Ressourcen-Zahlen ⚠ BLOCKER

- **Struktur (Code):** Panel `.p-resources`, 4 Zeilen q0…q3, je Icon links (`left:14`, 38×38) + Wertfeld (`left:56`, Breite 113) `[R:hud.css:220,226]`. Reihenfolge `RES_ORDER = [botanicals, reinwasser, destillat]`, q3 = `population/populationCap` (z. B. `12/20`) `[R:html_hud.ts:78,480-481]`. Bare Ganzzahl, keine Tausender-Trennung, **keine Text-Labels** (nur Icons r0…r3).
- **⚠ AUSRICHTUNGS-WIDERSPRUCH (Ticro muss entscheiden):**
  - **Brief-Soll: linksbündig** (rechtsbündig als Symptom gelistet) `[Brief:20]`.
  - **Engineering-Transkript + Code: rechtsbündig** — bewusst gewählt, `justify-content: flex-end`, Begründung: 9999/9999-Überlauf läuft nach links, nie rechts abgeschnitten `[R:hud.css:222-228]` `[T:1895,1934,1964]`.
  - Kein Transkript-Beleg löst den Konflikt. **Falls linksbündig:** bestätigen, dass Rechts-Clip bei 4-stelligen Werten in der 113-px-Box akzeptabel ist (oder Box/Font anpassen).

**OFFENE ENTSCHEIDUNG TICRO:** (A) **linksbündig vs rechtsbündig** (Blocker, s. o.). (B) Ressourcen-Namen: der Brief nennt »Holz/Stein/Gold/Sirup« — die existieren **nicht** im Code (botanicals/reinwasser/destillat). Umbenennen oder Missverständnis? `[R:html_hud.ts:78]` (C) Tausender-Trennung / max. Stellenzahl.

---

## 7 · Fraktions-Hex ⚠ NICHT FINAL ABGENOMMEN

Kein finaler Fraktions-Hex wurde je von Ticro abgenommen — »Final-Hex = Ticro« `[T:3575]`, zählt zu den Entscheidungen »die auf dich warteten« `[T:6181]`.

| Fraktion | Code-Wert (`--frame`) | Übergabe-Platzhalter | Kanon-Richtwert (empfohlen) |
|---|---|---|---|
| HELLMUTH | `#c4a23c` `[R:hud.css:40]` | `#b9a14a` `[T:2744]` | Gold `#E8B33A` / `#B8860B` `[Ü:C14]` |
| MODERAT | `#883b54` `[R:hud.css:46]` | `#c0407a` `[T:2744]` | tiefes bläuliches Magenta `#B0186A…#C81E78` `[T:3575]` |

- **Harte Negativregel (belegt):** MODERAT = tiefes, bläuliches Magenta-Purpur, **NIE helles candy-pink / rosa** `[T:3575,3633]`. Hue-Band ~325–339°, muss den Blau-Anteil (`g<120`-Detektor) passieren. Maschinell prüfbar als Hue-Fenster (§ Gate C8).

**OFFENE ENTSCHEIDUNG TICRO (zentral):** die kanonischen Fraktions-Hex setzen. Drei Kandidaten als Vorlage: **A** Code-Stand `#c4a23c`/`#883b54` (live) · **B** Platzhalter `#b9a14a`/`#c0407a` (MODERAT verletzt die Negativregel) · **C** Kanon-Richtwert `#E8B33A…`/`#B0186A…` (empfohlen, erfüllt die Negativregel). Plus: MODERAT-Rahmen-Motiv, Fraktions→Substanz-Konstante `[Ü:C14]`.

---

## 8 · König / Begleiter ⚠ WIDERSPRUCH

- **Brief-Soll `[T:174]`:** König »geht komplett raus … erst mal gar nichts« — zwischen Minimap und Einheitenraster entfernen.
- **Code-Realität (Integrationslinie):** König ist **LIVE**, per Default gerendert (`koenig()`, nur `?herz=0` schaltet ab); volle Hero-Mechanik — HELLMUTH grüner Orb-Puls (`--pulse-rgb:130,235,105`), MODERAT Wächterauge-Saccade `[R:html_hud.ts:286,358-378]` `[R:hud.css:285-336]`.
- **Übergabe F21:** König »im Stufe-1-Abspecken entfernt« — diese Entfernung geschah aber auf `beautiful-thompson` (`d0495a2`), die **nie nach quirky-fermat gemergt** wurde. Auf der Integrationslinie ist er also noch da `[Ü:F21]`.

**OFFENE ENTSCHEIDUNG TICRO (Richtungs-Blocker):** Aktuelles Soll »König raus« (dann Gate prüft Abwesenheit, und die Entfernung muss nach quirky-fermat portiert werden) ODER König bleibt als Hero? Empfehlung aus `[T:174]`: raus für jetzt, später als Hero-Asset (Destillenkrone, grüner Orb, Puls) wieder rein. **Pupille:** Schlitz/Reptil (Fable-Empfehlung, bedrohlicher/animierbar) vs rund (Ticros Prompt-Entwurf; Code zeigt aktuell rund, `border-radius:50%`) — geparkt bis Asset-Einbau `[Ü:F21]`.

---

## 9 · Was raus muss (Negativliste)

Stand der Integrationslinie: N1/N2/N10 sind teilbereinigt, N3/N4/N5 noch offen `[T:7-Befund]`.

| # | Element | Code-Stelle | Beleg | Status Integrationslinie |
|---|---|---|---|---|
| N1 | Pause-Symbol (»II« neben MENÜ) | `menu-pause` | `[T:174,6702]` | raus (nur »MENÜ«), ABER Klick feuert noch `UI_PAUSE_TOGGLE` `[R:html_hud.ts:385]` → Event-Rest entfernen |
| N2 | großer schwarzer/fetter Balken unten | alte `hud-sockel`/`bar-riser` | `[T:174]` | ersetzt durch schlanke `hud-bar`; aber »Leisten zu hell« separat (§3) `[T:6702]` |
| N3 | Säulen/Stangen (»Diademe«) | `v2-fill` via `bloom()` | `[T:174]` | **noch da** `[R:html_hud.ts:280,298]` → RAUS |
| N4 | kleine Fläschchen davor | `v2-bloom` | `[T:174]` | **noch da** → RAUS |
| N5 | König (mittig) | `koenig()` | `[T:174]` | **noch da** (nur `?herz=0`) → s. §8 |
| N7 | Medaillon oben rechts (»auf halb acht«, falsch ausgeleuchtet) | Sigil-Fehlplatzierung | `[T:174]` | falsch platziertes raus; `moderat_sigil_a` mittig bleibt (§5) |
| N8 | Debug-Marker (rosa Zonen `#ff4dd2` / gelbe Linien `#ffe000`) | `spec_overlay.ts` (`?speclines=1`), `?zonemap=1` | `[T:174]` `[Ü:C12]` | nur bei Flags sichtbar → Proof-Render OHNE diese Flags |
| N9 | violette Bereiche | kein eigener Layer; Proof-Artefakte | `[T:6702]` `[Ü:C12]` | pixelbasiert prüfen (§ Gate C8) |
| N10 | totes `orn-koenig`-CSS | — | `[T:6346]` | abgerissen `[R:hud.css:248]` |

---

## 10 · Assets & Manifest

- **Auflösungsregel: Slot → Basename → Datei, der ORDNER LÜGT, der DATEINAME NICHT** `[R:tools/build_hud_assets.py:25]` `[R:src/data/hud_assets.ts:9-13]`. Manifest `src/data/hud_assets.json`; Suche per Basename über disjunkte `assets/source/ui/orn/` + `violett/`; `freigestellt/` = Cut-Cache. Namenskollision → harter Build-Abbruch `[R:build_hud_assets.py:130-133]`.
- **Raw-Gesetz:** `ALWAYS_RAW_SLOTS = {corner, topleft, sigil, hero, eye}` dürfen NIE in den Master-Pfad; `assert_raw_law()` erzwingt es `[R:build_hud_assets.py:147-153]`.
- **Render-Ziel = `v3/`** (`sprites/ui/hud/v3/<faction>/<slot>/...` + `emblem_corner/<faction>.png`) `[R:src/data/hud_assets.json]`.

**CODE≠SOLL (strukturelle Wurzel des kaputten Renders):** Die Laufzeit hardcodet den **alten `v2/`-Pfad** (`/sprites/ui/hud/v2/${faction}/...`), nutzt das Manifest NICHT, und `public/sprites/ui/hud/v3/` ist **leer** (V3-Substrat ungebaut). Der `v2/`-Baum ist lückenhaft → der sichtbare Defekt `[R:html_hud.ts:275,296]` `[R2-Befund]`. **Soll:** `build_hud_assets.py` laufen lassen (V3 erzeugen) UND `html_hud.ts` vom v2-Hardcode auf das Manifest umstellen.

**OFFENE ENTSCHEIDUNG TICRO:** V3 bauen + Laufzeit aufs Manifest umstellen, oder bewusst beim v2-Stand bleiben?

---

## 11 · Vertrag V2 / V3 ⚠ ARCHITEKTUR-ENTSCHEIDUNG

- **`BLUEPRINT-V3` (Vertrag):** Bausteinkasten-Prinzip — »Kein Bild ist je größer als ein Baustein; Struktur/Layout/Verhalten in Code/Daten« `[V3:9]`; vw/vh-Slot-Law, **keine Bildmaße** `[V3:32]`; Zonen-JSON entfällt `[V3:47]`; Bausteine `border_h/v`, `corner_tl..br`, `corner_cut`, `divider_*`, `glow_edge` `[V3:38-44]`.
- **Code (Integrationslinie):** komplett V2-px-vermessen (`calc(px*s)`), V2-§5-Slots verbatim, lebt von V2-Blütenebene; V3-Bausteinnamen NICHT verdrahtet, Zonen-JSON noch da `[R3-Befund]`. »V2-Mechanik überlebt unter V3-Etikett.«
- **V2-Maße (belegt, für die px-Wahrheit):** Rahmen 15 px `[V2:8]`; Panel-Geometrie wie §1; Schichtarchitektur S1 Rahmenebene / S2 Blütenebene / S3 Montage (Toleranz 2 px) / S4 HELLMUTH-Eckteil-Ausnahme `[V2:27-40]`.

**OFFENE ENTSCHEIDUNG TICRO (oberste Architekturfrage):** Gilt V2-px (real implementiert, diese Spec friert es ein) oder soll auf V3-Bausteinkasten (vw/vh) umgestellt werden? Der Vertrag widerspricht dem Code frontal. Plus: Bar-Höhe (Code 92 px vs V3 ~22vh `[R:hud.css:63]` `[V3:28]`), Schicksal der V2-Blütenebene unter V3.

---

## 12 · OFFENE ENTSCHEIDUNGEN TICRO — Sammelliste

| # | Thema | Kern | §  |
|---|---|---|---|
| A | **Ressourcen-Zahlen-Ausrichtung** (BLOCKER) | links (Brief) vs rechts (Code/Engineering) | 6 |
| B | **Fraktions-Hex final** | nie abgenommen; 3 Kandidaten (Code/Platzhalter/Kanon) | 7 |
| C | **König raus vs Hero** + Pupille (Schlitz/rund) | Brief raus vs Code live; Richtungs-Blocker | 8 |
| D | **V2-px vs V3-Bausteinkasten** | Vertrag widerspricht Code (oberste Architekturfrage) | 11 |
| E | **V3 bauen + Manifest verdrahten** vs v2-Stand belassen | strukturelle Wurzel des Defekts | 10 |
| F | **`strip_h_b` global vs nur 3 Hauptpanels** | Emblem+Menü tragen sie fälschlich | 2 |
| G | **MODERAT-LumaStd ~35–40 akzeptiert?** | Materialwahrheit vs ≥45-Schwelle | 3 |
| H | **Bar-Höhe** | 92 px vs ~22vh vs 15-px-Logik | 11 |
| I | **Ressourcen-Namen** Holz/Stein/Gold/Sirup vs Code | Missverständnis oder Umbenennung | 6 |
| J | Eck-Offsets, Oberkanten-Höhe (26 px), Sigil-Größe (64 px), V-Stärke | Code-Werte verbindlich oder Ermessen? | 1,2,5 |
| K | MODERAT-Materiallücke Zier-Eck (Magenta-Glow+Drip) | nachgenerieren ja/nein | 4 |

---

*Stand: rekonstruiert aus den Arbeitssitzungen + Code-Messung @ `claude/quirky-fermat-8rewv0`. Maschinelle Abnahme: `tools/hud_soll_gate.py` (in `pruefen.sh` eingehängt). Jede verletzte Soll-Zeile wird vom Gate rot mit `[R:..]`/§-Verweis ausgegeben.*
