# HUD-KRISENSTAB

Das HUD ist zum zweiten Mal nach Neuaufsetzen gerendert kaputt, während das Gate
GRÜN meldete (Stand `ae7694f`/`cca8348` auf `claude/quirky-fermat-8rewv0`). Dieses
Dokument findet gemessen, warum, wie man es technisch richtig baut, und wie es nie
wieder durchrutscht.

**Methode.** 21 Mess-Stränge (18 zu Wurzel/Bau/Abnahme, 3 zur verlorenen Vorarbeit über
alle Branches), jeder mit Mess-Pflicht und der Auflage, keine
Einschätzung von Fable oder Code1 zu übernehmen. Gemessen wurde am echten Render
(`proof/baseline/{hellmuth,moderat}_default.png`, 1920×1080), an den echten
Quell-Assets (visuell + numerisch), am echten Gate-Code und an der Git-Historie.
Jede Aussage unten trägt einen Datei:Zeilen-Beleg oder eine gemessene Zahl.

**Das Urteil in einem Satz.** »Gate GRÜN, Bild KAPUTT« ist kein einzelner Bug,
sondern **zwei voneinander unabhängige Wahrheiten, die zufällig zugleich gelten**:
das Bild zerfällt aus drei gestapelten Ursachen (nicht-kachelbare Quellen, ein
periodenblinder Schneider, eine Laufzeit-Kachelung mit `repeat` statt `round`), und
der Gate bleibt grün aus zwei voneinander unabhängigen Gründen (er hat kein Sinnesorgan
für Motiv-Durchgängigkeit, und seine Referenz ist der kaputte Render selbst). Beides
muss getrennt repariert werden. Und das Zerhacken ist kein Urzustand, sondern eine
**benennbare Regression**: die korrekte Kachel-Doktrin (`border-image round` + Nine-Slice)
wurde in Commit `3a1c155` bewusst entfernt — gut begründet, im Ersatz aber verpfuscht (§4b).

---

# TEIL 1 — DIE WURZEL (gemessen)

## §1 · Die vier Verdachtsmomente, abgeurteilt

Der Auftrag nannte vier Verdachtsmomente. Gemessen:

| Verdacht | Urteil | Beleg |
|---|---|---|
| 1 · Korrumpierte Mess-Basis (Code1s `calc()`-Patch) | **TRÄGT NICHT** | W1, an echtem Chromium 141 gemessen |
| 2 · Gate-Blindstelle (prüft das Falsche) | **TRÄGT** | W2, alle 18 Checks enumeriert |
| 3 · Nicht-kachelbare Quell-Assets | **TRÄGT, massiv** | W5/B2/B3, 5 von 6 Assets ohne Rapport |
| 4 · Verlorene Vorarbeit (Doktrin + Kohärenz-Gate) | **TRÄGT, teilweise** | F1/F2, Doktrin in `3a1c155` verworfen; Kohärenz-Gate nie auf der Linie (§4b) |
| (zusätzlich gefunden) Selbst-referenzielle Baseline | **TRÄGT, stärkster Grün-Grund** | W7/A4, git-belegt |

Code1s Gate-Änderung (`f0c2ff4`, »Gate-J«, fraktionsabhängige Oberkante) wurde
gesondert geprüft und ist **eine legitime Spec-Korrektur, keine Schwächung** (W3):
HUD-SOLL-SPEC:49/53/54 sagt MODERAT oben geschlossen (15px), 26px gehört nur
HELLMUTH; die CSS kann für MODERAT strukturell keine 26px rendern. Die alte
26px-für-beide-Prüfung war der Fehler, nicht die Korrektur. Toleranz `tol=max(2s,2)`
≈ 2px ist nicht zu lax (`hud_soll_gate.py:84`).

## §2 · Warum das Bild zerfällt — drei gestapelte Ursachen

Der gemessene Schaden am Render (W4, Zahlen): HELLMUTH-Leiste **stempelt mit Periode
70px**, die Blattspitze ist an jeder Kachelkante flach abgeschnitten (Fugen bei
x=565…1335 im 70er-Raster, Autokorrelations-Peak Lag 70 mit Harmonik 140/210/280).
MODERAT-Leiste ist **flach gestreckt** (keine dominante Periode). Alle vier
Panel-Ecken sind **Stumpfstöße** (Diagonal-Symmetrie 0.33 statt ~1.0 bei echter
Gehrung). Diese drei Schäden haben drei verschiedene Ursachen, jede einzeln belegt:

**Ursache A — Die Quell-Assets tragen keinen Rapport** (W5, B2, B3). Von sechs
Leisten-Quellen ist nur eine sauber kachelbar. Gemessen (2D-NCC / Seam-MAD mit
Harmonik-Test; Roh-Autokorrelation liefert Grain-Fehlperioden und wurde verworfen):

| Asset | Maße | Echte Periode | Verdikt |
|---|---|---|---|
| `hellmuth/strip_h_a` | 2172×213 | keine (808px ≫ 256) | Unikat-Fries |
| `hellmuth/strip_h_b` | 2172×171 | keine (≈aperiodisch) | Unikat-Fries |
| `hellmuth/strip_h_c` | 2172×276 | keine (1660px) | Unikat-Fries |
| `moderat/strip_h_e` | 2172×483 | keine (868px); Nieten-Pitch 34px | Framing → Nine-Slice |
| `hellmuth/strip_v_a` | 209×2508 | **378px (Score 0.78)** | **echt kachelbar** |
| `moderat/strip_v_e` | 151×1774 | keine (Peak 0.30, Wrap-Err 51) | Unikat |

Der sichtbare Motiv-Zyklus der HELLMUTH-Friese (Volute + Blatt-Cluster) liegt bei
**~270–290px** (B3). Die Spec verlangt »Rapport ≤256px« (HUD-SOLL-SPEC §2:55) — das
ist für diese gemalten Bänder **physikalisch nicht erreichbar, ohne das Motiv zu
zerschneiden**. Es gibt keine kurze Kachel zum Herausschneiden. Das ist eine
Asset-Wurzel, kein Schneider-Fehler.

**Ursache B — Der Schneider schneidet das Falsche** (B1). `_best_seam`
(`tools/build_hud_frame.py:70-80`) minimiert die Differenz zweier einzelner
Rand-**Spalten** (`band[:,x0]` vs `band[:,x0+L]`). Die Kachellänge `L` geht in die
Bewertung **nicht** ein — der Algorithmus ist periodenblind und sein Minimum sitzt
systematisch im flachen, ornamentfreien Bereich, wo zwei Spalten sich trivial gleichen.
Folge: die Kachel beginnt und endet im Leeren und schneidet ein Ornament-Element mittig
durch. Das korrekte Kriterium (Schnitt auf die Autokorrelations-Periode) existiert im
Repo bereits ungenutzt (`tools/hud_render_proof.py:96-107 count_repeats`,
`tools/terrain_gate.py:90-109`). Der Schneider ist voll im Laufzeitpfad: er emittiert
`K_TOP/K_BOT/K_SIDE/G_H/G_V` als `data:`-URIs nach `src/ui/hud_strip_data.ts`, die
`html_hud.ts:180-183` lädt.

**Ursache C — Die Laufzeit-Kachelung clippt** (W6, an Ort und Stelle bestätigt). Zwei
Kachelsysteme in `hud.css`:
- Die untere Bodenleiste `.hud-bar` nutzt `background-repeat: round` (`hud.css:65`) —
  rescaliert auf ganze Kacheln, **läuft sauber durch**.
- Die Panel-Rahmen `.panel::before` nutzen `background-repeat: repeat-x`/`repeat-y` mit
  `background-size: auto` auf der Längsachse (`hud.css:94-97`, HELLMUTH-Variante
  `:106-110`) — `repeat` zwingt **nicht** auf ganze Kacheln, die letzte Kachel reißt an
  jeder Panelkante mitten im Motiv ab.

Der Beweis liegt im Kontrast: **dasselbe Motiv, `round` läuft, `repeat` zerhackt.** Dazu
quetscht `background-size: auto 15px` die 104–212px hohen Master-Kacheln auf 15px Höhe
(bis 14-fache Stauchung), was das Relief zusätzlich kollabieren lässt.

**Die Ecken** (W4, B4). Vier `background`-Layer auf einem `::before` überlagern sich an
der Box-Ecke rechtwinklig in voller Dicke (`hud.css:94-97`) → stumpfer L-Stoß. Es gibt
**kein** strukturelles Eck-Element. Das dekorative `emb-corner` (`html_hud.ts:189`,
Spec §4) ist laut Spec ausdrücklich »kein Leisten-Stoß« und sitzt nur an einer
Emblem-Ecke. Ein echtes Nine-Slice mit Eck-Slices existiert (`build_hud_frame.py` →
`FRAME_MASTER` 320×320), wird aber **nie importiert** (`html_hud.ts:10` zieht nur
`BAR_MASTER`) — toter Code, und die V3-Bake lief nie.

## §3 · Warum der Gate grün bleibt — zwei unabhängige Mechanismen

**Mechanismus D — Die Blindstelle** (W2, alle 18 Checks enumeriert). Der Gate
(`hud_soll_gate.py`) prüft genau drei Klassen: Geometrie (Anker-Quadranten, 15/26px-
Insets, Skala), Anwesenheit (Sigil, emb-corner, Counts) und Farb-**Format**
(sRGB-Filter-Attribut, Master als `data:`-URI vorhanden). Die Sonde
(`hud_dom_probe.mjs`) liefert pro Leisten-Kante nur **drei Booleans**
(`present/srgb/dataMaster`). Kein Check liest je den Strip-Pixelinhalt: `grep` über
Gate+Sonde nach `seam|miter|tile|getImageData|ncc|ssim|preserveAspectRatio` = **0
Treffer**. Die `cut_elbow`/Seam-Logik lebt in Build-Werkzeugen, die der Gate nicht
importiert. **Der Gate hat schlicht kein Sinnesorgan für Motiv-Durchgängigkeit oder
Eckverschmelzung.** Eine Instanz, die auf diese Checks hin optimiert, wird grün, während
Fuge, Ecke und Streckung beliebig zerfallen. Diese Lücke stammt aus dem Entwurf des
HUD-Soll-Gates selbst (HUD-SOLL-SPEC-Runde) — sie ist ehrlich als Eigenfehler zu
verbuchen, nicht Code1 anzulasten.

**Mechanismus E — Die selbst-referenzielle Referenz** (W7, A4, git-belegt). Der
Render-Drift-Teil von `pruefen.sh` vergleicht den neuen Render gegen
`proof/baseline/*.png`. `git log --follow` zeigt: die Baselines wurden in `f0c2ff4`
neu geschrieben — **im selben Commit, der den HUD-Rebuild trägt** — und nochmals in
`ae7694f`. Die Referenz ist also der kaputte Render selbst; der Drift vergleicht das
kaputte Bild gegen sich (MAE ~0.01 ≪ Schwelle 10). Verschärfend, alles gemessen:
- **Auto-Seed** (`pruefen.sh:140-142`): leere Baseline → `cp` der aktuellen Shots → PASS.
  Der erste Lauf adelt sich selbst.
- **Strukturblinder Vergleich** (`pruefen.sh:149-150`): Downscale auf **96×54**, globaler
  MAE, Schwelle 10. Bei 96×54 ist eine Leiste 3px hoch — Zerhackung, Ecke, halbiertes
  Motiv verschwinden im Downsampling.
- **Soll = Ist** (`hud_soll_gate.py:38-40`): die Soll-Werte `--align/--koenig/
  --lumastd-moderat` haben als Default den aktuellen Code-Stand. Der Gate kann per
  Konstruktion nie widersprechen.
- **Fehlender Render → SKIP** (`hud_soll_gate.py:266-267`): kein Render = kein Urteil =
  blockiert nicht.

In einem Satz (W7): **die Prüf-Batterie misst Selbstkonsistenz, nicht Korrektheit.**

## §4 · Was ausgeschlossen wurde (damit es niemand wieder aufwärmt)

- **Verdacht 1 trägt nicht** (W1). An der echten Harness-Chromium 141 gemessen: `--ornW`
  bleibt unaufgelöster `calc()`-String (Code1s Skala-Fallback feuert korrekt, kein toter
  Code), ABER das `::before`-`inset`-Shorthand löst nativ zu echten px auf
  (`-26px -15px -15px`). Die Insets sind echt, die `len>=3`-Prüfung läuft (wird nicht
  übersprungen). Die Mess-Basis ist intakt. (Restrisiko: bliebe ein künftiges Chromium
  beim `calc()`-String, würde `len<3` still überspringen → defensive Assertion empfohlen,
  siehe §14.)
- **Gate-J ist eine Korrektur, keine Lockerung** (W3, §1 oben).

## §4b · Vierter Verdachtsmoment: Verlorene Vorarbeit (F1, F2, gemessen über alle Branches)

Frühere Runden hatten zwei Dinge bereits gelöst, die der laufenden Linie fehlen. Beide
sind real und git-belegt — aber der Befund ist schärfer als »beim Linienwechsel verloren«.

**Die korrekte Kachel-Doktrin existierte und wurde bewusst verworfen.** Auf `claude/hud`
(Tip `749f23e`, ein Vorfahr von quirky-fermat) und auf `hopeful-cannon-z94t30` trägt
`hud.css` wörtlich `border-image: var(--frame-img) 32 round` mit EINEM getönten Nine-Slice
`FRAME_MASTER` (320×320, Slice 32) für beide Fraktionen (`html_hud.ts:169-173`).
`border-image round` kopiert die vier 32×32-Eck-Slices nativ in die Box-Ecken (verschmolzene
Ecke, kein Stoß) und kachelt die Kanten mit `round` auf ganze Kacheln (kein Anschnitt) —
genau das, was die heutige Vier-Layer-`repeat`-Lösung NICHT kann. Geboren in `178204f` (»ein
getoenter Nine-Slice-Master, Leiste kachelt«), **entfernt in `3a1c155` »HUD-Reparatur:
kanten-differenzierte Leisten«**: der Diff ersetzt in einem Hunk das symmetrische
`border-image` durch die vier asymmetrischen `repeat`-Layer. Der Grund war zwingend, nicht
blind — ein symmetrisches `border-image` kann keine offene 26px-Oberkante ≠ geschlossene
15px-Unterkante rendern (HUD-SOLL-SPEC §2:40, Kerngesetz: »ein uniformes Band über alle vier
Kanten ist falsch«). **Die Doktrin wurde zu Recht für die Edge-Differenzierung geopfert,
aber der Ersatz wurde verpfuscht: `repeat` statt `round` (zerhackt) und vier flache Layer
ohne Eck-Slice (stumpf).** Das Zerhacken und die stumpfen Ecken sind also eine benennbare
Regression aus `3a1c155`. `FRAME_MASTER` überlebt als unreferenzierter Export
(`hud_master_data.ts`), nie importiert. Konsequenz für den Bau: §8/§9 sind teils ein
**Zurückholen**, kein Neuerfinden.

**Das Kohärenz-Gate kam nie auf der Linie an, und hätte den Fehler ohnehin nicht gefangen.**
`hud_coherence.py` (+ `_probe.py`) wurde in `8be4b47` angelegt und in `hud_verify.sh` als
»Prüfer 3« eingehängt. `8be4b47` ist **kein** Vorfahr von quirky-fermat (gemessen, Exit 1);
die Datei liegt an keinem laufenden Tip, nur auf `beautiful-thompson-nixyyc`; quirky-fermats
`hud_verify.sh` hat nur Prüfer 1+2, null Kohärenz-Aufruf. Es lief also nie. Wichtiger (F1,
am alten Code belegt): es prüft **zonenübergreifende** Kohärenz — pro Zone ein Median-Vektor
(Licht-Azimut, LAB-Material, Tonwert, Kanten-Kontrast, Textur) gegen den Median aller Zonen.
Es misst **nichts innerhalb** einer Zone: keine Position, keine Periode, keine Naht. Eine
70px-Stempelfuge verschiebt den Zonen-Median praktisch nicht (gleiche Pixel, gleiche
Palette, nur anders angeordnet). **Kohärenz ≠ Kontinuität.** Selbst voll eingebunden und
grün hätte es die Zerhackung durchgewunken. Zurückholen lohnt als komplementäres Stil-Gate
(fängt den nächsten, anderen Fehler: Zonen, die im Licht/Material auseinanderdriften),
ersetzt aber keinen Kontinuitäts-Check (§11).

**Urteil zum vierten Verdachtsmoment:** trägt, teilweise. Die verlorene Doktrin ist die
proximate Ursache der Regression (Reparatur = teils Zurückholen, §8/§9). Das verlorene
Kohärenz-Gate ist ein echter Vorarbeits-Verlust, für DIESEN Defekt aber strukturell
irrelevant; sein Fehlen erklärt nicht das grüne Gate — das tun §3-D/E.

---

# TEIL 2 — DAS BAU-REZEPT

## §5 · Die unbequeme Wahrheit zuerst

Kein noch so kluger Schneider repariert die Leisten, solange die Quell-Assets keine
Kacheln sind (§2-A). Die eigentliche Lösung ist **Asset-Neuschnitt / Neugenerierung zu
echten Kacheln**; alles andere ist Schadensbegrenzung. Das Bau-Rezept hat darum vier
Ebenen: Assets (§6), Schneider (§7), Laufzeit-CSS (§8), Ecken (§9), gegen den
Pixel-Vertrag (§10).

## §6 · Asset-Lösung pro Leiste (gemessene Schnittgrenzen, B3/B2)

- **`hellmuth/strip_h_a, _b, _c` (Unikat-Friese):** Neuschnitt auf die Motiv-Periode.
  Gemessenes Schnittfenster für `_a`: Spalte **13 → 291** (278px, beide Spalten sind
  Tiefluma-Stiel-Lücken → Schnitt fällt zwischen die Blätter), danach linke/rechte 24px
  per Offset+Heal auf Wrap-Err <12 angleichen. Periode dann **278px**, nicht 70.
  Alternative, wenn ≤256 hart erzwungen werden soll: das Motiv mit absichtlich auf 256px
  gesetztem Zyklus **neu zeichnen** (Endkappen identisch). Reines Beschneiden trifft 256
  nicht ohne Schnitt durchs Blatt.
- **`moderat/strip_h_e` (gerahmtes Feld):** Nine-Slice. Linke Endkappe Spalte **0 → 40**,
  rechte **2132 → 2171** (Pilaster), wiederholbares Mittelstück Spalte **40 → 2132**,
  gekachelt auf Vielfache von **34px** (Nieten-Pitch), damit Plattennähte ausgerichtet
  bleiben. Nur die Kunstbande (Reihen 3–482) nutzen; vertikal nicht strecken.
- **`hellmuth/strip_v_a` (echt periodisch):** Mittelstück Reihen **1128 → 1506** (378px)
  als Repeat-Tile; Naht-Err fällt auf 8.8, minimaler Heal genügt. 378 > 256: volle Zelle
  behalten oder das Soll für dieses Asset bewusst auf 378 anheben (die 189px-Halbzelle
  schneidet den Blattspray an).
- **`moderat/strip_v_e` (Unikat, schlimmster Wrap):** kein nutzbares Tile. Neuzeichnen
  mit gesetzter Vertikalperiode ~178px. **Mirror-Tile nur als Notlösung** (vertikal
  gespiegelt aneinander killt den Wrap-Sprung, erzeugt aber eine sichtbare Symmetrieachse).

**Stopgap ohne Neugenerierung** (B2): in `build_hud_strips.py` `_best_seam`+`_seamless_h`
durch **Mirror-Synthese** ersetzen (`concatenate([band, band[:, ::-1]])`). Garantiert
nahtlos und durchgehend, fixt das Zerhacken sofort aus vorhandenem Material. Ehrlicher
Trade-off: für gerichtete Motive (Akanthus-Volute) kehrt die Spiegelung die
Laufrichtung an jeder Naht um — vertretbar als Übergang, nicht als Endzustand.

## §7 · Den Schneider reparieren (B1)

`_best_seam` (`build_hud_frame.py:70-80`) auf das richtige Kriterium umstellen: zuerst
`L` = Lag des ersten starken Autokorrelations-Peaks der opaken Bandzeilen bestimmen (=
Grundperiode), **danach** `x0` (Phase) als Stelle minimaler Randdifferenz bei diesem
festen `L`. So bestimmt die Periode die Kachelbreite, die Randdifferenz nur noch die
Phasenlage. Wiederverwendbar: `count_repeats` (`hud_render_proof.py:96-107`),
`terrain_gate.py:90-109`. Das repariert den Schneider für künftige, korrekt kachelbare
Assets — die Altlasten aus §6 brauchen trotzdem den Neuschnitt.

## §8 · Laufzeit-Kachelung: die Doktrin zurückholen (Hybrid), nicht nur flicken (W6, B5, F2)

**Empfohlen (F2, Option b — Hybrid).** Die saubere Lösung holt die verworfene Doktrin
(§4b) teilweise zurück: `border-image: var(--frame-img) 32 round` mit dem vorhandenen
`FRAME_MASTER` für die drei **geschlossenen** Kanten (unten/links/rechts, alle symmetrisch
15px) UND alle vier Ecken — das quantisiert die Kacheln nativ auf ganze Kacheln (kein
Anschnitt) und verschmilzt die Ecken über die 32×32-Eck-Slices nativ (kein clip-path, keine
Doppelkanten-Frage). Die EINE Sache, die `border-image` strukturell nicht kann — die offene
26px-HELLMUTH-Oberkante — bleibt ein separater `repeat-x`-Layer mit `--strip-top`
(`K_TOP`/`h_b`), per-Panel auf den drei HELLMUTH-Hauptpanels, wie der F-Fix ihn schon
scopet. MODERAT (oben=unten=`h_e`, symmetrisch) braucht sogar nur reines `border-image
round`, keinen Extra-Layer. `FRAME_MASTER` ist dafür direkt brauchbar (keine Neu-Bake),
`K_TOP` liegt bereits eingebettet vor. Residuum: an der Hybrid-Naht muss die Z-Order stimmen
(Oberlayer über border-image, obere `border-width` auf 0/15px), und die zwei oberen Ecken
trägt der Oberlayer bzw. das `.emb-corner`-Stück, nicht der Eck-Slice — obere
Eckverschmelzung also manuell, untere zwei plus seitliche nativ.

**Fallback (Option c), falls der Hybrid-Top-Saum zu fummelig wird:** die Vier-Layer-Lösung
behalten, aber in `hud.css:94-97` und `:106-110` `background-repeat: repeat-x`/`repeat-y`
durch `round` ersetzen (wie `.hud-bar:65`), mit expliziter Kachel-Achse in `background-size`
statt `auto`. Behebt das Zerhacken, lässt die Ecke aber als clip-path-Gehrung offen (§9).

In beiden Fällen der gemessene Bar-Bug (A1): `html_hud.ts:248` berechnet die
Bodenleisten-Kachel mit **G_H für beide Fraktionen** (144·92/234 ≈ 56.6px), falsch für
HELLMUTHs K_BOT (192·92/212 ≈ 83px) — die Bar-Kachelbreite muss fraktionsabhängig aus dem
jeweiligen Master kommen.

## §9 · Eckverschmelzung: 45°-Gehrung per `clip-path` (B4)

**Im Hybrid (§8/Option b) entfällt das Gros davon:** die unteren zwei plus die seitlichen
Ecken verschmelzen nativ über die `border-image`-Eck-Slices; `clip-path` braucht es dann nur
noch für die zwei oberen Ecken an der offenen 26px-Kante (bzw. das `.emb-corner`-Stück trägt
sie). Bleibt man bei der Vier-Layer-Lösung (Option c), gilt das Folgende für alle vier Ecken:

Empfehlung ohne neue Assets: die vier Kanten-Layer auf zwei Träger (`::before`/`::after`)
aufteilen und jedem ein `clip-path`-Polygon geben, das die Eck-Dreiecke komplementär
kappt, sodass die Naht zur Diagonale wird. Das Polygon ist deterministisch aus den
bekannten `inset`-Werten berechenbar: untere/seitliche Ecken **15:15** (echte 45°),
HELLMUTHs offene Oberkante **15:26** (flachere Schräge). Genau diese 15≠26-Asymmetrie ist
der Grund, warum ein einzelnes symmetrisches Nine-Slice (der tote `FRAME_MASTER`) die
Ecke nicht lösen kann und `clip-path` der praktischere Weg ist. Wer das Relief sauber um
die Ecke ziehen will, verdrahtet alternativ `FRAME_MASTER` als `border-image` plus ein
gesondertes asymmetrisches Oberkanten-Eck — teurer.

## §10 · Pixel-Vertrag (B5) und die zu putzenden Abweichungen

Gemessener Ist-Stand, der erzwingende Ort ist die CSS, nicht die TS:

| Vorgabe | Spec | Ort | Ist | stimmt? |
|---|---|---|---|---|
| 15px geschlossene Kante | §2:53 | `hud.css:92,94-97` | `calc(15*s)` | ja |
| 26px offene HELLMUTH-Oberkante | §2:54 | `hud.css:102-107` (fraktions-+panel-skopiert) | `calc(26*s)` | ja |
| 13.423·s Inhalt→Leiste | §6 | `hud.css:234-238` (in `104.58*s` verrechnet) | `calc(104.58*s)` | ja |
| Rapport ≤256px | §2:55 | `.panel::before` Längsachse | siehe §2-A | **nein, unerreichbar** |
| Master K_TOP/K_BOT/K_SIDE/G_H/G_V | §2:57 | `hud_strip_data.ts:7-11` | 280×104 / 192×212 / 212×192 / 144×234 / 150×120 | ja, aber = Schneider-Ausgabe |

Abweichungen zu putzen: `--ornW/--ornH` (`hud.css:23-24`) sind tot (15 ist hartkodiert,
Änderung wirkungslos); `FRAME_MASTER` ungenutzt (§9); und **der Gate darf nicht gegen die
veraltete Spec-Zeile §2.1 (»strip_h_b global«) rot werfen** — der F-Fix ist im Code
bereits umgesetzt (`hud.css:102-104` skopiert die Oberkante korrekt). Die Spec-Tabelle
§2:57 schreibt die fehlerhaften `_best_seam`-Maße als Soll fest — bei der Neuschnitt-
Entscheidung (§6) mit zu korrigieren.

---

# TEIL 3 — DIE GATE-VERSCHÄRFUNG

Ziel: eine Instanz darf NICHT grün melden können, während die Leiste zerfällt. Vier
Bausteine, alle an den echten Renders erprobt.

## §11 · Kontinuitäts-Prüfung (A1, Schwellen an echten Renders gesetzt)

Das tragende Maß ist **Selbst-NCC über die Harmonik-Serie**, nicht Roh-Autokorrelation
(die liefert Grain-Fehlperioden). Band aus `--hud-scale` lokalisieren (kein Suchen):
`band_y0 = H - round(82*s)`, `band_y1 = H - round(18*s)`, auf das dichteste 320px-Fenster
fokussieren. Für Kandidat-Perioden P im Kachelband (round(57·s)…round(85·s), Grain
ausgeschlossen) die Selbst-NCC bei Versatz 1×/2×/3× messen:

| Render | self-NCC 1×/2×/3× | Urteil |
|---|---|---|
| Gesund (nahtlos) | 0.97 / 0.97 / 0.97 | PASS |
| MODERAT (gestreckt) | 0.47 / 0.17 / 0.08 | FAIL (Harmonik-Kollaps) |
| HELLMUTH (zerhackt) | 0.07 / −0.01 / −0.09 | FAIL (kein Alignment) |

**PASS:** ∃P mit `min(1×,2×) ≥ 0.55` UND `3× ≥ 0.45`. **Stretch:** `1× ≥ 0.40` aber
`3× < 0.30`. Zweitmaß zur Bestätigung — Kanten-Kamm-Konzentration (signiertes Spalten-
Gefälle über Zeilen gemittelt, Grain hebt sich auf): kaputt 5.24 vs gesund 1.39 vs Grain
1.8; Schwelle `> 3.0`. Optional stärker: getöntes Render-Band entsättigt per NCC gegen
den gebackenen Master aus `hud_strip_data.ts` (Schwelle locker `> 0.6` wegen Tönung/AA).
Einhängepunkt: `hud_soll_gate.py:207 check_pixels`, nutzt `scale.px` aus `dom_*.json`.

**Anti-Moderat (gemessen).** Ein Naht-/Kontinuitäts-Detektor existiert im Repo bereits —
`src/editor/gate.ts` (Briefing §11: `MAX_HARD_RUN=26`, `TILE_RATIO_MAX`, Kachelprobe
`meanAbsCols` an den Kachelnähten `x=T,2T`) und `tools/editor_browser.mjs` —, prüft aber
**Terrain-Texturen**, nicht den HUD-DOM-Overlay. `hud_gate.py` hat eine Naht-Spalten-Prüfung
(`TR_SEAM_GAP`), aber nur für den topleft-Emblem-Eckstoß, und ist NICHT in `pruefen.sh`
eingehängt (die Batterie fährt `hud_browser` + `hud_soll_gate`, nicht `hud_gate`). Der neue
Check erfindet also nichts — er **richtet die vorhandene Naht-/Kachel-Mechanik
(`MAX_HARD_RUN`, `meanAbsCols`) auf das HUD-Streifen-Band** und ergänzt sie um die
Selbst-NCC-Harmonik. Dazu (§4b): `hud_coherence.py` als »Prüfer 3« in `hud_verify.sh`
zurückholen — als komplementäres Stil-Gate, das den nächsten Zonen-Drift fängt, nicht diese
Zerhackung.

## §12 · Eck-Prüfung (A2, Schwellen erprobt)

Eck-Quadrate aus den Soll-Maßen ableiten (Panel-Anker × s, Überlapp-Seite
`min(t_top,t_lr)=15` → bleibt quadratisch, löst die 15:26-Asymmetrie ohne Fehlalarm).
Der naive `corr(patch, patch.T)` ist eine Falle (Stumpf UND Gehrung geben +1.00 auf der
Hauptdiagonale). Zwei wirksame Maße, UND-verknüpft:
- **Primär — Gradientenrichtungs-Fraktion** (beleuchtungs-/tönungsinvariant): Sobel im
  Eck-Quadrat, `gfrac` = Diagonalbin-Energie / (Diagonal+Achsen). Butt ≤0.40, Miter ≥0.61.
- **Bestätigung — Anti-Diagonal-Korrelation** `corr(patch, patch.T[::-1,::-1])`: Butt
  −0.29 (real reproduziert: moderat-Minimap −0.343 = die gesuchte ~0.33), Miter +1.00.

**GEHRT nur wenn `gfrac ≥ 0.55` UND `anti ≥ 0.80`.** Ergebnis an beiden echten Renders:
alle 20 Panel-Ecken FAIL = Stumpfstoß, konsistent mit dem fehlenden `cut_elbow`. SKIP-
Wächter: Varianz `std<5` (leere Flächen), `15·s<10px` (starker Downscale), und Emblem-TL
ausnehmen (dort liegt das dekorative `emb-corner` über der Naht).

## §13 · Anti-Self-Green: die Referenz vom Prüfling trennen (A4, priorisiert)

Die Reihenfolge ist nach Wirkung sortiert; P1–P4 sind codierte `pruefen.sh`/Gate-Blöcke,
die ohne Willenskraft bei jedem Lauf greifen.

- **P1 — Referenz-Segnung trennen (Kernleck).** (a) `proof/baseline/APPROVED.sha256`,
  menschlich gesetztes Hash-Manifest; `pruefen.sh` wird ROT, wenn ein Baseline-PNG-Hash
  vom Manifest abweicht (PNG geändert ohne Neu-Segnung). (b) Koppelungs-Sperre: ein Commit,
  der Render-Code (`src/ui/*`, `hud.css`, `hud_tint`) UND `proof/baseline/*.png` zugleich
  anfasst → ROT. Das sperrt exakt den `f0c2ff4`-Mechanismus. (c) Segnung nur als eigener
  Commit mit `BASELINE-ABNAHME:`-Präfix, ausschließlich Baseline + Manifest.
- **P2 — »keine Referenz« nie grün.** Auto-Seed (`pruefen.sh:140-142`) von PASS/`cp` auf
  FAIL umstellen. Fehlende Baseline ist rot, nicht selbstheilend.
- **P3 — Soll extern verankern.** Die §12-Entscheidungen (A/C/G) in eine menschlich
  gepflegte `docs/HUD-SOLL-ENTSCHEIDUNGEN.json` auslagern; `hud_soll_gate.py` liest sie,
  die `--align/--koenig/--lumastd-moderat`-Flags ersatzlos streichen (Default=Ist
  entfällt). Den `lumastd-moderat`-Wert nicht mehr nur deklarieren, sondern einen echten
  MODERAT-Flachheits-Check daran hängen (0 verboten).
- **P4 — fehlender Render → FAIL statt SKIP.** `hud_soll_gate.py:266` und die DOM-Sonde/
  Drift-Strecke in `pruefen.sh`: ein grünes Gesamturteil ist nur gültig, wenn die
  Render-Strecke lief (`RENDER_RAN=1`-Wächter).
- **P5 — Gate-Selbst-Schwächung verhindern.** Ein Pflicht-Check-Inventar
  `tools/GATE-PFLICHTCHECKS.txt` (Marker-Fragmente der Kontinuitäts-/Eck-/Inset-/Sigil-/
  Koppelungs-Checks) + ein Meta-Test in `pruefen.sh`, der ROT wird, wenn ein Marker fehlt.
  **Marker sind Kategorie-Anker, nicht Schwellen** — so bleibt eine legitime Verschärfung
  (wie Gate-J) erlaubt, während Check-Löschen auffällt. Schwellen (`DRIFT_THR`, Downscale-
  Größe) mitverankern.
- **P6 — Drift entblinden (nachrangig).** Den 96×54-Downscale durch kachelweisen MAE auf
  Vollauflösung ersetzen (8×8-Raster, ROT wenn eine Kachel reißt). Der eigentliche
  Struktur-Check liegt ohnehin bei §11/§12.

## §14 · Den menschlichen Blick verlässlich früher erzwingen (A3)

Maschine fängt Zerhackung und Stumpfecke (§11/§12), aber nicht »sieht stimmig aus« —
genau das ist zweimal durchgerutscht. Darum ein **Kontaktbogen** + ein **Sign-off-Tor**:
- `tools/contact_sheet.mjs` erzeugt im selben Playwright-Lauf eine selbsttragende
  `contact.html`: jede Leiste als langes, in der Höhe überhöhtes Band (Zerhackung springt
  ins Auge), jede Ecke 8× nearest-neighbor, kritische Motive 3–4×, beide Fraktionen
  nebeneinander, am Fuß die Ja/Nein-Checkliste (Leiste durchgehend? Ecke sauber? Motiv
  ganz? Tönung richtig?). Crop-Geometrie liegt bereits dreifach vor (`hud_browser.mjs SPEC`,
  `hud_zones.json`, `docs/hud-zonen-2.json`) — keine neue.
- `tools/segnen.sh` rendert den Bogen, öffnet ihn, wartet, schreibt dann `APPROVED.sha256`
  mit Render-SHA + Bogen-Hash + Kürzel. Segnen ist ein Befehl, Nicht-Segnen der Default.

## §15 · Ehrliche Residuen

- **Schönheit, Motiv-Sinn, Marken-Stimmigkeit, Gesamtgefühl** bleiben prinzipiell
  menschlich. Keine Maschinen-Metrik wird dafür behauptet; §14 setzt den Menschen davor,
  statt Schönheit zu messen.
- **Die Sign-off-Grenze:** `APPROVED` verhindert *stilles* Selbst-Segnen, nicht *aktives
  Lügen* (eine Instanz kann SHA+Kürzel eintragen, ohne dass ein Mensch sah). Es verwandelt
  die Tat aus einem stillen `cp` in einen sichtbaren, signierten, im Diff prüfbaren Akt —
  mehr ist lokal nicht erreichbar.
- **Die eigentliche Achillesferse:** P1–P5 greifen nur, wenn `pruefen.sh` überhaupt läuft.
  Eine Instanz, die es ignoriert oder im selben Commit mitschwächt, umgeht alles. Der
  einzige echte Riegel ist **CI** — ein ~30-Zeilen-`ci.yml` auf `push`, der die browser-lose
  Teilmenge (inkl. P1a-Hash, P1b-Koppelung, P5-Meta-Test) läuft, macht Rot/Grün
  commit-gebunden und außerhalb der Instanz-Kontrolle. Das ist derselbe Hebel, den
  `MAXI-3-TEMPO-NIVEAU.md` (H1) als Hauptloch nennt; hier wird er zur Sicherheits-Pflicht.
- **Schwellen-Verankerung:** alle §11/§12-Schwellen sind an DIESEN echten kaputten Renders
  gesetzt, nicht an Theorie (synthetischer Chop blieb zu glatt). Bei geändertem Render-Pfad
  neu kalibrieren. Bei Nicht-1.0-Scale (21:9, 4:3) müssen die Band-/Eck-Koordinaten mit `s`
  mitskalieren — auf diesen 1080p-Shots ungetestet.
- **CODEOWNERS/PR-Branch-Protection** (P5c) ist auf direkt gepushten `claude/*`-Branches
  wirkungslos; ehrlich als Aufsatz für einen späteren Review-Workflow zu verbuchen, nicht
  als Solo-Schutz.

---

## Anhang · Die 18 Mess-Stränge (je ein Satz, mit der Kern-Zahl)

**Wurzel.** W1: Probe-Basis intakt (Chromium 141, Insets echt px, Verdacht 1 fällt). W2:
Gate prüft 18× Geometrie/Anwesenheit/Format, 0× Kontinuität. W3: Gate-J ist spec-treu
(Spec:49/53/54), keine Lockerung. W4: HELLMUTH stempelt 70px (Fugen x=565…1335), MODERAT
gestreckt, Ecken 0.33. W5: 5/6 Quellen ohne Rapport, nur `strip_v_a` (378px) kachelbar.
W6: `.panel::before repeat`+`auto` clippt, `.hud-bar round` läuft. W7: Baseline in
`f0c2ff4` = Render-Commit, Drift 96×54/MAE10 strukturblind.

**Bau.** B1: `_best_seam` minimiert Randspalten, periodenblind. B2: echte Perioden
808/2112/1660/868px ≫ 256, Mirror-Synthese als Stopgap. B3: Neuschnitt-Fenster (z.B. `_a`
13→291=278px), `strip_v_a` Reihen 1128→1506. B4: 45°-Gehrung per `clip-path`,
`FRAME_MASTER` tot. B5: 15/26/13.423·s belegt, `--ornW` tot, Spec §2.1 schon gefixt.

**Abnahme.** A1: Selbst-NCC 0.97/0.47/0.07 trennt gesund/Stretch/Chop, Kamm-Konzentration
5.24 vs 1.39. A2: `gfrac`≥0.55 UND `anti`≥0.80, 20/20 Ecken FAIL. A3: Kontaktbogen +
`APPROVED.sha256`-Sign-off, Crop-Geometrie dreifach vorhanden. A4: Referenz-Trennung
P1–P6, erzwungen vs Disziplin, CI als einziger echter Riegel.

**Verlorene Vorarbeit.** F1: `hud_coherence.py` misst Zonen-Median (Licht/Material/Kante/
Textur), nie Kontinuität — hätte den Chop nicht gefangen, lief nie auf der Linie (`8be4b47`
kein Vorfahr, nur auf beautiful-thompson). F2: Doktrin `border-image 32 round` + FRAME_MASTER
auf `claude/hud:90` / `hopeful-cannon:120`, verworfen in `3a1c155` für die
Edge-Differenzierung; Empfehlung Hybrid (b), FRAME_MASTER direkt brauchbar. F3 (git):
quirky-fermat descendet von `claude/hud` (`749f23e`), Doktrin geboren `178204f`, Regression
`3a1c155`; Kohärenz-Gate nur auf `beautiful-thompson-nixyyc`.
