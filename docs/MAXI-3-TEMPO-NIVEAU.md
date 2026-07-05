# MAXI-3 — TEMPO UND NIVEAU

**Von der Garage zum Entwicklungszentrum.** Eine priorisierte Hebel-Liste, kein
Essay. Jeder Hebel ist gemessen, nicht behauptet, und beginnt mit dem Beleg, dass
er noch **nicht** existiert (Anti-Moderat). Wo ein Hebel Tempo gegen Qualität
tauscht, steht der Trade-off offen dabei.

Quelle der Messungen: das Repo auf `claude/quirky-fermat-8rewv0` (Stand dieses
Dokuments) plus die Maxi-3-Recherche-Stränge. Dateizeilen sind nachprüfbar.

---

## Was schon da ist (wird NICHT vorgeschlagen)

Damit niemand Vorhandenes als Hebel aufwärmt — kartiert, bevor gesucht wurde:

- **Prüf-Batterie** `pruefen.sh` (Branch-Hygiene, Build, Sim-/Physik-Smoke,
  Terrain-/Audio-/HUD-Gates, Render-Drift gegen `proof/baseline/`, Asset-Auflösung).
- **Determinismus** ist bewiesen: `tools/dyn_smoke.mjs` zeigt, dass gleich
  geseedete Läufe denselben `sim.hash()` liefern (`setSeed` → identischer Hash).
- **Asset-Pixel-Pipeline**: `tools/normalize_asset.py`, `build_hud_*.py`,
  `process_ui_v2.py`, das `exists()`-Gate im Preload, `NAMING_CANON.md`, `asset-spec.md`.
- **Spec-Dokumente**: `HUD-SOLL-SPEC.md`, `NEBEL-TIEFE-SPEC.md`,
  `HUD-FEHLERURSACHEN.md`, `LOOP-BLAUPAUSE.md`, `DIRECTION.md`,
  `VERTICAL_SLICE_SCOPE.md`, handgepflegte KREA-Prompt-Docs.
- **Doktrin** aus Maxi-1 (Game-Feel) und Maxi-2 (Physik/Körperlichkeit) deckt das
  Körpergefühl ab. Audio-Engine (Ducking, Voice-Limiter, Bark, Music, Ambience),
  Blut-System, Nebel-Tiefe stehen.
- **Sim-Breite**: Sim-Kern (30-Hz-Tick), Editor, Fog-of-War, Flow-Field,
  Spatial-Grid, Kampf/Bau/Produktion/KI-Systeme.

Die Stränge unten zielen ausschließlich auf echte Lücken daneben.

---

# DIE FÜNF HEBEL MIT DEM HÖCHSTEN VERHÄLTNIS VON WIRKUNG ZU AUFWAND

Ticro kann nicht vierzig Dinge gleichzeitig tun. Diese fünf zuerst.

---

## H1 · CI führt die schnelle Gate-Hälfte bei jedem Push selbst aus

**Engpass.** Ein Bruch (tsc-Fehler, kaputter Audio-Test, fehlende Pflicht-Asset-Quelle,
versehentlich fest verdrahteter Debug-Marker) fällt heute erst auf, wenn ein Mensch
**lokal** `./pruefen.sh` oder `npm run build` startet. Zwischen Push und nächstem
Hand-Lauf ist das Fenster offen — bei mehreren parallelen `claude/*`-Branches das
Hauptloch.

**Beleg, dass er noch nicht existiert.** `.github/workflows/` enthält **genau eine**
Datei, `sync-hellmuth-soda.yml`; sie kopiert nur `sucht-mythen/` ins Vokabel-Site-Repo,
checkt `hellmuth/` nie aus, baut nie, testet nie (Trigger `paths: ['sucht-mythen/**']`,
feuert bei Spiel-Commits gar nicht). Es gibt keine zweite Workflow-Datei. Es läuft kein
einziges Gate automatisch.

**Der Hebel.** Ein `ci.yml` auf `on: [push, pull_request]`, das die **CI-billige
Teilmenge** läuft: `npx tsc --noEmit` (lokal ~3,5 s), `npm run test:audio` (die 5
Node-Tests), die Inline-Asset-Auflösung aus `pruefen.sh` (nur `json/os/sys`, kein
Browser) und die grep-Gates (Debug-Marker, Verwaiste). Reine Node-/Python-/grep-Strecke,
kein Chromium, unter ~2 min. Rot/grün hängt am Commit.

**Aufwand gegen Wirkung.** Aufwand klein: ~30 Zeilen YAML, die vorhandene Skripte
aufrufen, kein neuer Test-Code. Wirkung hoch fürs Tempo: jeder billige Bruch wird vor
dem nächsten Hand-Lauf sichtbar, automatisch, pro Push, pro Branch. **Trade-off:** Die
schnelle CI deckt die Browser-Gates (Determinismus-, Render-, Terrain-, HUD-Smoke)
**nicht** ab — die müssen wegen Playwright-Installkosten (bis 14 min/Lauf belegt) in
einen nächtlichen bzw. `workflow_dispatch`-Job, nicht in die Pflicht. Der Workflow muss
darum `ci-fast` heißen, sonst wiegt ein grünes Badge in falscher Sicherheit. (Determinismus-
Smoke `dyn_smoke.mjs` ist **Playwright**, nicht Node — gehört in den optionalen Job.)

**Erster umsetzbarer Schritt.** `.github/workflows/ci.yml` anlegen: `actions/setup-node@v4`
(`cache: npm`), `working-directory: hellmuth`, dann die vier Stufen als getrennte
`run:`-Steps (damit der rote Schritt im UI sofort benannt ist). Zweiten Job `render`
mit `if: schedule || workflow_dispatch` + `npx playwright install chromium --with-deps`
dazu — nur `chromium`, nie alle Browser.

---

## H2 · KREA-Prompt-Emitter mit fest eingebautem Negativ-Block — eine Magenta-Wahrheit

**Engpass.** Ticro schreibt jeden Asset-Prompt von Hand und wiederholt dabei pro Prompt
manuell denselben Spec-Block (Kamera 36,87°, Licht oben-links, grauer Grund, langer
NOT-Schwanz). Jede Wiederholung ist eine Vergessensquelle. Bei »bald Hunderte Assets« ist
das die Haupt-Schreiblast **und** die Haupt-Inkonsistenzquelle. Schlimmer: die Doks
widersprechen sich bereits an der Farbe.

**Beleg, dass er noch nicht existiert.** `docs/ASSET-PROMPTS-KREA-V2.md` ist reine Prosa
mit Copy-Paste-`[MASTER-*]`-Blöcken; **kein** Tool baut sie zusammen. `grep` über alle
`*.py` nach `krea.?prompt|prompt.?template|emit.*prompt` = null Treffer; die 35 Skripte
in `tools/` sind alle Pixel-Pipeline oder Gate. `game/data/asset_manifest.json` ist leer
(`"eintraege": []`). **Der eingefrorene Widerspruch:** `HUD-SOLL-SPEC.md:130-132` definiert
MODERAT-Magenta als »tiefes, bläuliches Magenta-Purpur, NIE candy-pink«
(`#B0186A…#C81E78`, Hue 325–339°) — aber `ASSET-PROMPTS-KREA-V2.md` schreibt wörtlich
**»candy magenta«** an vier Stellen (Z. 55, 65, 184, 283). Die Generierungs-Eingabe sät
genau die Farbe, die der Spec verbietet. Die HUD-**Laufzeit** wurde gerade auf tiefes
Magenta korrigiert (Commit `ae7694f`); der Fehler sitzt jetzt also präzise in der
Asset-Generierungs-Eingabe, die noch unkorrigiert ist — der Emitter schließt genau diese Lücke.

**Der Hebel.** Ein `tools/krea_prompts.py`, das (a) die Spec-Konstanten **einmal** als
Python-Dict hält (die drei Master-Blöcke, die zwei Fraktionspaletten, **den einen
Negativ-Block** mit Projektion + Grün-Schutz + `NOT candy-pink`) und (b) pro Asset-Zeile
den vollständigen, fertig konkatenierten Prompt ausgibt. Ticro kopiert nur noch und
generiert. MODERAT-Magenta wird dort exakt einmal definiert (`#B0186A…#C81E78, NOT
candy-pink`) — der Emitter kann gar keinen candy-Prompt mehr ausgeben.

**Aufwand gegen Wirkung.** Aufwand klein: eine Python-Datei (~120 Z., keine Deps), die
Prosa existiert schon und wird nur strukturiert. Wirkung hoch und wachsend: die
Spec-Wiederholung sinkt von linear (Hunderte × Block) auf konstant (Block 1×), und ein
**schon im Repo eingefrorener** Fehler wird strukturell unmöglich statt per Disziplin
vermieden. **Trade-off:** Der asset-spezifische Prosa-Satz bleibt menschlich (richtig so —
die kreative Zeile ist nicht das Problem). Erfordert eine Zeile Freigabe von Ticro, dass
das HUD-Magenta auch das Asset-Magenta ist (sehr wahrscheinlich ja, dieselbe Fraktionsfarbe).

**Erster umsetzbarer Schritt.** `tools/krea_prompts.py` anlegen, die drei Master-Strings +
zwei Paletten + den Negativ-Block wörtlich aus `ASSET-PROMPTS-KREA-V2.md` als Konstanten
ziehen, eine `emit(name, kat, fraktion, prosa)`-Funktion. Dann die vier `candy`-Stellen im
Doc ersetzen; Messlatte: `grep -c "candy" docs/ASSET-PROMPTS-KREA-V2.md` == 0.

---

## H3 · BEFUND-KODEX: das Spiel hinterlässt etwas, plus ein »NOCHMAL«-Ausgang

**Engpass.** Eine gewonnene Partie endet im Nichts. Es gibt keinen Grund, eine zweite zu
starten, der über »war kurzweilig« hinausgeht — keine Persistenz, kein Übertrag, nicht
einmal ein Knopf, der die nächste Runde anbietet. Das ist die Retention-Ebene (nicht der
Kern-Loop), und HELLMUTH hat sie bei null.

**Beleg, dass er noch nicht existiert.** Einzige `localStorage`-Nutzung im ganzen
Projekt: Sprach-Präferenz (`audio_lang.ts`, `audio_manager.ts:166`). `endMatch()`
(`game_scene.ts:1461`) tut exakt zwei Dinge: Overlay zeigen und ein Audio-Event feuern —
kein `scene.restart`, kein Score, kein Freischalt-Flag. Szenenfluss linear und tot:
`boot → preload → game`, kein Menü, keine Kampagne. `DIRECTION.md` parkt Save/Achievements
ausdrücklich erst in »AP8«. Suche nach `vokabular|codex|befund|unlock|score` im Spielcode:
nur Falschtreffer. HELLMUTH hat den überlegenen Rohstoff — ein reales, kuratiertes
Vokabular über die Sucht-Ökonomie (`sucht-mythen/vokabular/data.js` im Mutter-Repo) — und
nutzt ihn im Spiel zu null Prozent.

**Der Hebel.** Ein **BEFUND-KODEX**: Vokabular-Einträge (ZUCKER, DOPAMIN, WITHDRAWAL
REVERSAL …), die durch Spielhandlungen freigeschaltet werden (»erste Zuckermaschine
zerstört« → Eintrag ZUCKER) und in `localStorage` bleiben, lesbar über das bestehende
`MENÜ`. Dazu ein **»NOCHMAL«-Knopf** im End-Overlay (`scene.restart`) und **eine** diagnostisch
benannte Eskalations-Ziffer (»ZUCKERMASCHINEN ZERLEGT: 7«). Genau der thematisch passende
Anker: der Sog **weckt** (vermittelt echtes Wissen über die Gegner-Ökonomie), statt zu
betäuben. Plague Inc. macht genau das (reale Krankheits-Fakten hinter Fortschritt,
CDC-gelobt) — HELLMUTH hat den besseren Rohstoff.

**Aufwand gegen Wirkung.** Aufwand niedrig–mittel: ein dünner `localStorage`-Wrapper
(`kodex_store.ts`, Muster steht in `audio_lang.ts`), ein `kodex.json` mit ~12–20
Einträgen (Text existiert bereits, nur portieren), ~3–5 Freischalt-Trigger, ein
DOM-Screen wie das bestehende `html_hud.ts`. Keine Engine-Änderung. Wirkung hoch: erste
Retention-Schleife überhaupt **und** der einzige Mechanismus, der die Anti-Sucht-These
trägt statt sie zu behaupten. **Trade-off:** Inhalte müssen das Vokabular-Stilgesetz
erfüllen (kein Gedankenstrich, Verdikt-Schluss, keine Soda-Reklame), und Freischaltung an
Spielfortschritt koppeln, **nicht** an Zeit-Grinden — sonst betäubt es, statt zu wecken.
Die nackte Ziffer darf nicht ins generische Highscore-Genre kippen: genau **eine**,
diagnostisch benannt.

**Erster umsetzbarer Schritt.** In `endMatch()` bei Sieg `Kodex.unlock("zucker")`
einhängen und in `src/systems/kodex_store.ts` das Set freigeschalteter IDs unter
`localStorage["hellmuth.kodex"]` persistieren. Minimaler Beweis, dass eine Partie etwas
hinterlässt, das die nächste motiviert.

---

## H4 · Die leeren Tiefen-Felder der Ökonomie füllen (das Richtige zuerst)

**Engpass.** Wir haben viel **Tiefe** poliert (Physik, Blut, Nebel, Audio) an Stellen, an
denen die **Breite** noch fehlt. Konkret die Wirtschaft: Das Daten-Schema kennt
Tech-Gating und Produktionsketten, aber sie sind fast leer — und für den Spieler ist eine
Ressource sogar tot.

**Beleg, dass er noch nicht existiert.** Gemessen an `game/data/`: von **12 Einheiten**
hat **genau eine** (`destillateur`) ein `requiresBuilding` (→ `labor`). Von **12 Gebäuden**
haben **genau zwei** ein `produziert`-Feld (`apotheke` → sammler/apotheker/destillateur,
`zuckermaschine` → sirup_trupp/stahlbrute). **7 der 12 Einheiten** haben damit gar keine
Produktionsquelle. Die Ressource `destillat` startet bei `0`, und die **einzige**
Quelle, das Gebäude `destillatsickerung`, gehört der Fraktion `moderat` — die HELLMUTH
(die Spieler-Fraktion) kann Destillat also nie herstellen, obwohl Einheiten es kosten. Die
`tech_tree.json` ist ein 3-Wort-Stub (`{"stufen":["apotheke","avantgarde","alchemie"]}`),
benutzt nur in einer `console.info`-Zeile (`preload_scene.ts:30`) — sie gated nichts.

**Der Hebel.** Keine neuen Systeme — die **vorhandenen Felder ausfüllen**: die
`produziert`-Arrays so erweitern, dass jede baubare Einheit eine Quelle hat; per
`requiresBuilding` die drei `tech_tree`-Stufen an echte Freischaltungen hängen; und **eine
HELLMUTH-Destillat-Quelle** spiegeln (Gegenstück zu `destillatsickerung`), damit die
Spieler-Ökonomie lebt. Erst wenn die Breite steht, wird die ganze gebaute Tiefe überhaupt
erlebbar.

**Aufwand gegen Wirkung.** Aufwand niedrig–mittel: reine JSON-Daten plus die schon
existierende `requiresBuilding`-Mechanik, kein Engine-Code. Wirkung hoch: macht die
zweite Fraktion und die dritte Ressource erst spielbar und gibt der Tech-Progression
Bedeutung. **Trade-off:** Die Tiefe-Politur war **nicht falsch**, nur in der Reihenfolge
vorgezogen — dieser Hebel korrigiert die Reihenfolge, er wirft nichts weg. Balancing der
neuen Ketten kostet Iteration (über `dyn_smoke.mjs` smoke-bar).

**Erster umsetzbarer Schritt.** In `buildings.json` ein HELLMUTH-Gebäude mit
`"ressource": "destillat"` ergänzen und `labor`/`kuratorium`/`raffinerie` `produziert`-
Arrays für die 7 quellenlosen Einheiten geben; dann `node tools/dyn_smoke.mjs` als
Sanity-Lauf.

---

## H5 · Weniger Durchgänge durch den Menschen: ein STATUS.md + Sammel-Merge-Fenster

**Engpass.** Ticro ist der einzige Mensch und muss durch fast alles hindurch: Entscheidung,
Git, Asset-Generierung, Abnahme. Der stärkste Tempo-Hebel ist hier nicht mehr Arbeit,
sondern **weniger Durchgänge**. Gemessen: pro Branch fallen 18–22 h an, in denen eine
Code-Instanz fertig, aber blockiert ist, weil sie auf den Menschen für Merge/Abnahme/
Entscheidung wartet.

**Beleg, dass er noch nicht existiert.** Es gibt **kein** lebendes Übergabe-Dokument: weder
`STATUS.md` noch `HANDOFF.md` existieren im Repo; `HELLMUTH-BRIEFING.md` (im Maxi-3-Brief
als »lebendes Handoff« genannt) ist nicht eingecheckt. Stattdessen **zwei divergierte**
`TODO.md` (`hellmuth/TODO.md` vs `docs/TODO.md`). Es gibt keinen geordneten Ort für offene
Entscheidungen, keine Sammel-Merge-Kadenz, keine paarweise Instanz-Abnahme — jede Frage
geht einzeln durch Ticro.

**Der Hebel.** Drei kleine Prozess-Bausteine, kein Code: (1) **ein** `STATUS.md` als
einzige lebende Wahrheit (Stand, offene Entscheidungs-Queue, Wer-wartet-worauf) — ersetzt
die zwei TODO-Leichen; (2) ein **Sammel-Merge-Fenster** (Code-Instanzen sammeln fertige
Branches, Ticro merged sie einmal pro Fenster gebündelt statt einzeln); (3) **paarweise
Abnahme** (Instanz A nimmt B's Render-Proof ab, bevor es zu Ticro geht) — der Mensch
entscheidet nur noch, was wirklich nur er entscheiden kann.

**Aufwand gegen Wirkung.** Aufwand minimal: eine Markdown-Datei plus zwei Spielregeln.
Wirkung hoch: greift direkt die gemessenen 18–22 h Leerlauf an und gibt Ticros Kopf für
echte Entscheidungen frei. **Trade-off:** Sammel-Merge erhöht das Risiko, dass zwei
Branches kollidieren (mehr gleichzeitiger Merge-Stoff) — darum gehört H1 (Auto-CI) davor,
damit ein Sammel-Merge nicht blind ist. Paarweise Abnahme verschiebt etwas Last auf die
Instanzen, aber das ist genau gewollt (weg vom Menschen).

**Erster umsetzbarer Schritt.** `hellmuth/STATUS.md` anlegen mit drei Abschnitten —
»Stand«, »Offene Entscheidungen (Queue)«, »Branches: fertig / wartet auf« — und die zwei
`TODO.md` dorthin zusammenführen. Eine Datei, ab morgen die einzige, die alle lesen.

---

# DER REST, SORTIERT

## H6 · Die Welle hat eine sichtbare Uhr (Eskalations-Anzeige)

**Engpass.** Spannung entsteht in der Gattung (They Are Billions) daraus, dass der Spieler
**sieht**, wann die nächste, größere Welle kommt — eine Uhr, die tickt. HELLMUTH hat
Angriffswellen (`ai_system.ts`), aber keine sichtbare Eskalations-Anzeige; die Bedrohung
ist da, aber nicht **gelesen**.

**Beleg, dass er noch nicht existiert.** Das HUD (`html_hud.ts`) hat kein Countdown-/
Wellen-Element; `VERTICAL_SLICE_SCOPE.md` listet »Angriffswellen« als KI-Verhalten, nicht
als angezeigte Uhr. Es gibt keine UI, die dem Spieler Welle/Zeit-bis-Welle/Stärke zeigt.

**Der Hebel.** Eine schlanke HUD-Anzeige: »nächste Welle in mm:ss« plus eine
Eskalationsstufe, die mit der Zeit steigt. Macht aus diffuser Bedrohung eine lesbare
Spannungskurve — das »nur noch bis zur nächsten Welle«-Ziehen.

**Aufwand gegen Wirkung.** Aufwand niedrig (ein DOM-Element, gespeist aus dem
vorhandenen Wellen-Timer der KI). Wirkung mittel–hoch für den Sog. **Trade-off:** Die Uhr
muss ehrlich zur KI-Logik passen, sonst lügt sie; der Wellen-Timer im `ai_system` muss
also als Wert nach außen gereicht werden (kleine Schnittstelle).

**Erster umsetzbarer Schritt.** Im `ai_system` den Zeitpunkt der nächsten Welle als
lesbaren Wert exponieren und im HUD als Countdown rendern.

## H7 · Asset-Wellen-Intake + Inhalts-Validierungs-Gate

**Engpass.** Bald kommen Hunderte Assets über KREA/GPT/ElevenLabs. Das Einsortieren
(roh → selected → processed → Manifest) und die **Inhalts**-Prüfung (Projektion, Palette,
candy-vs-deep-Magenta) hängen heute am Menschen bzw. existieren nur fürs HUD.

**Beleg, dass er noch nicht existiert.** `game/data/asset_manifest.json` ist leer
(`"eintraege": []`) — nichts füllt es. Die Pixel-Pipeline (`normalize_asset.py`) und die
Farb-/Hue-Detektoren existieren, aber **nur im HUD-Kontext** (`hud_gate.py`,
`hud_soll_gate.py`, `process_ui_v2.py`); es gibt **kein** Inhalts-Gate, das ein generiertes
**Spiel**-Asset (Einheit/Gebäude/Effekt) gegen `asset-spec.md` prüft (Projektion, Palette,
Grün-Schutz). Der candy-Detektor aus den Transkripten liegt nirgends als wiederverwendbares
Asset-Gate.

**Der Hebel.** Ein Intake-Skript, das neue Dateien nach Namenskonvention einsortiert und
das Manifest füllt, plus ein `asset_content_gate.py`, das pro Asset Projektion/Palette/
Magenta-Band prüft (derselbe Negativ-Block wie H2, als Prüfung statt Prompt). Zwei Stränge
(S5 Intake, S6 Validierung) docken hier an H2 an: ein Magenta, eine Wahrheit, an der
Eingabe **und** am Ausgang.

**Aufwand gegen Wirkung.** Aufwand mittel. Wirkung hoch beim kommenden Asset-Schwall —
das größte Tempo- **und** Qualitätsrisiko zugleich. **Trade-off:** Ein zu strenges Gate
blockiert brauchbare Assets (Schwellen müssen an echten KREA-Ausgaben kalibriert werden,
nicht erfunden).

**Erster umsetzbarer Schritt.** `asset_content_gate.py` für **eine** Kategorie (MODERAT-
Gebäude) gegen das Magenta-Band aus `HUD-SOLL-SPEC.md:130` schreiben und an drei schon
abgenommenen Assets eichen.

## H8 · Command-Log-Save + Determinismus-Audit-Gate

**Engpass.** Es gibt kein Speichern/Laden, und die bewiesene Determinismus-Eigenschaft ist
gegen stille Regression ungeschützt — ein nicht-deterministischer `Math.random` an der
falschen Stelle bricht sie unbemerkt.

**Beleg, dass er noch nicht existiert.** `game_state.ts` enthält keinerlei `save`/
`serialize`/`command_log`. Determinismus ist zwar bewiesen (`dyn_smoke.mjs`: `setSeed` →
identischer `sim.hash()`), aber kein Save nutzt ihn und kein Gate bewacht ihn dauerhaft.

**Der Hebel.** (a) **Determinismus-Audit-Gate** jetzt: ein grep/AST-Check, der `Math.random`
außerhalb der geseedeten RNG-Quelle im Sim-Pfad verbietet — billig, schützt die Eigenschaft,
auf der alle Smokes ruhen. (b) **Command-Log-Save später**: Spielstand = `{seed, tick,
command_log}` statt voller Zustands-Serialisierung; Laden = Wiederholen. Nutzt die schon
vorhandene Determinismus-Garantie.

**Aufwand gegen Wirkung.** Das Audit-Gate: Aufwand klein, Wirkung mittel, sofort sinnvoll.
Der Save: Aufwand mittel, Wirkung hoch — aber **Trade-off**: `DIRECTION.md` parkt Save in
AP8; verfrüht, solange der Loop nicht steht. Darum **das Gate jetzt, den Save erst, wenn
der vertikale Ausschnitt abgenommen ist** (H11).

**Erster umsetzbarer Schritt.** Das Audit-Gate in `pruefen.sh` und in H1s `ci-fast`
aufnehmen: `grep` nach `Math.random` unter `src/systems/` (außer der RNG-Quelle) → Rot.

## H9 · Proof-Bilder pro Push veröffentlichen statt nur lokal

**Engpass.** Der Render-Drift-Vergleich und die Proof-Shots existieren, aber Ticro sieht
das laufende Bild nur, wenn er **lokal** baut. Die Strecke »Code meldet fertig« →
»Mensch sieht, ob es gut ist« bleibt lang.

**Beleg, dass er noch nicht existiert.** `proof/baseline/` und der Drift-Check in
`pruefen.sh` sind da, aber es gibt **keinen** Workflow, der Proof-Bilder pro Push
rendert und veröffentlicht — nur `sync-hellmuth-soda.yml`. `vite.config.ts` hat zwar
`base: "./"` (Pages-fähig), aber keine Pages-Publikation existiert.

**Der Hebel.** Ein (nächtlicher/dispatch-) Job, der die Proof-/HUD-Shots rendert und als
GitHub-Pages-Galerie ablegt — Ticro öffnet einen Link und sieht den Stand jeder Fraktion,
ohne lokal zu bauen. Schwester zu H1 (gleiche CI, anderer Job).

**Aufwand gegen Wirkung.** Aufwand mittel (Playwright im CI, an H1s Render-Job angehängt).
Wirkung mittel–hoch für die Abnahme-Geschwindigkeit. **Trade-off:** Browser-CI-Kosten —
darum nicht pro Push, sondern nächtlich/auf Knopfdruck (wie H1s Render-Job).

**Erster umsetzbarer Schritt.** An H1s `render`-Job ein `actions/upload-pages-artifact`
mit dem Proof-Shot-Ordner hängen.

## H10 · Veteranen-Stufen für HELLMUTH (wenige werden stärker, nicht mehr)

**Engpass.** Die Fiktion ist »wenige Starke (HELLMUTH) gegen hirnlose Masse (MODERAT)«,
aber mechanisch wird das nirgends ausgespielt — eine HELLMUTH-Einheit, die überlebt, wird
nicht stärker, sie bleibt gleich.

**Beleg, dass er noch nicht existiert.** `units.json` hat keine `veteran`/`rang`/`xp`-
Felder; es gibt kein System, das Kampf-Erfahrung in Stärke übersetzt. Die thematische
Asymmetrie ist behauptet, nicht gebaut.

**Der Hebel.** Eine schlanke Veteranen-Stufe **nur für HELLMUTH**: Einheiten, die X Kämpfe
überleben, steigen eine Stufe (kleiner Schaden-/HP-Bonus, sichtbares Abzeichen). Macht die
»wenige Starke«-These mechanisch erfahrbar und belohnt Erhalt statt Verheizen.

**Aufwand gegen Wirkung.** Aufwand niedrig–mittel (ein Zähler pro Einheit + ein
Stufen-Tabellen-Lookup). Wirkung mittel für Niveau/Identität. **Trade-off:** Balancing —
zu starke Veteranen kippen die Asymmetrie ins Unfaire; Stufen klein halten.

**Erster umsetzbarer Schritt.** Ein `kills`-Zähler auf der HELLMUTH-Einheit und eine
Stufe bei Schwelle, zunächst nur als HP-Bonus + Abzeichen.

## H11 · Den vertikalen Ausschnitt als abgenommen markieren + Spannungsbogen

**Engpass.** `VERTICAL_SLICE_SCOPE.md` beschreibt den Ziel-Ausschnitt, aber niemand
verfolgt, ob er **fertig und durchgängig spielbar** ist — und es gibt keinen skriptbaren
Bogen, an dem man das »nicht mehr loskommen« zum ersten Mal echt prüft.

**Beleg, dass er noch nicht existiert.** `VERTICAL_SLICE_SCOPE.md` sagt selbst »nur das
Fundament und kein Gameplay« und listet »Kein Sammeln, kein Bauen, keine Produktion« —
inzwischen existieren aber `build_system`, `production_system`, `combat_system`,
`ai_system`. Das Doc ist **veraltet**; es gibt keine Abnahme-Checkliste, die den
Slice-Stand gegen die 9 Punkte des Scopes führt.

**Der Hebel.** (1) `VERTICAL_SLICE_SCOPE.md` auf den Ist-Stand bringen und als
**Abnahme-Checkliste** führen (jeder der 9 Punkte: steht / fehlt / Beleg). (2) Einen
skriptbaren 10-Minuten-Bogen definieren (Aufbau → erste Welle → Eskalation → Sieg), an dem
der Sog testbar wird. Das ist die kürzeste Linie zum ersten echten »ich höre nicht auf«-Test.

**Aufwand gegen Wirkung.** Aufwand niedrig fürs Doc/Checkliste, mittel für den geskripteten
Bogen. Wirkung hoch für die Priorisierung (zeigt, wo Breite fehlt — vgl. H4). **Trade-off:**
Eine Checkliste baut nichts; sie lenkt nur — ihr Wert hängt daran, dass H4/H6 die Lücken
schließen, die sie sichtbar macht.

**Erster umsetzbarer Schritt.** Die 9 Scope-Punkte als Checkliste an den Kopf von
`VERTICAL_SLICE_SCOPE.md` setzen und jeden mit Datei-Beleg auf steht/fehlt prüfen.

---

# VERWORFEN (damit es niemand wieder aufwärmt)

- **»Führt eine Test-Batterie ein« / »nutzt Subagenten-Schleifen«** — beides läuft längst
  (`pruefen.sh`, LOOP-BLAUPAUSE). Anti-Moderat.
- **Volle Zustands-Serialisierung als Save** — verworfen zugunsten Command-Log (H8): die
  Determinismus-Garantie macht das Wiederholen billiger und robuster als das Abbilden des
  ganzen Zustands.
- **Alle Browser in der Pflicht-CI** (Firefox/WebKit `--with-deps`) — belegter Kostenfall
  (bis 14 min, ein Fehlersturm bis 10 h Actions-Zeit). Nur `chromium`, nur nächtlich.
- **Engine-/ECS-Neubau, Multiplayer-Netcode** — als Bremse **nicht gemessen**; reine
  Architektur-Lust. `VERTICAL_SLICE_SCOPE.md` schließt Netcode ausdrücklich aus.
- **Steam-/Tauri-Packaging jetzt** — `DIRECTION.md` parkt es in AP8; vor einem stehenden
  Loop verfrüht.
- **3D/Babylon-Wiederbelebung** (`proof3d/`) — laut `hellmuth/CLAUDE.md` eingefroren.
- **Mehr Parallelität um ihrer selbst willen** — die Messung (H5: 18–22 h Leerlauf je
  Branch) zeigt, der Engpass ist nicht zu wenig Arbeit, sondern zu viele Durchgänge durch
  den Menschen. Mehr Instanzen ohne H1/H5 machen langsamer, nicht schneller.

---

# EHRLICHE RESIDUEN

- **Render-Validierung der zwei neuen Gates** (Fog-Depth, HUD-Soll) ist syntaxgeprüft und
  gegen Fixtures validiert, aber ein echter Vite-/Playwright-Lauf steht aus — er gehört in
  H1s Render-Job (das schließt die Lücke automatisch).
- **Balancing** aller neuen Ketten (H4) und Stufen (H10) ist hier nicht gelöst, nur
  ermöglicht; es braucht Iteration über `dyn_smoke.mjs`.
- **Die genauen Schwellen** des Asset-Inhalts-Gates (H7) müssen an echten KREA-Ausgaben
  geeicht werden, nicht aus der Spec geraten.
- Die Messung der 18–22 h Leerlauf (H5) stammt aus der Strang-Analyse der Branch-Historie;
  sie ist eine belastbare Größenordnung, keine Stoppuhr.
