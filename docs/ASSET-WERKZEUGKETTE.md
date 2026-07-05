# ASSET-WERKZEUGKETTE (CODE1, Welle 0 Strang B)

Setzt die Solutions-Hebel H8/H10 und die Befunde E1/E3/E4 aus
`solutions/SOLUTIONS-ZIELBILD-REALISIERUNG.md` (Branch
`claude/eloquent-hawking-be4v29`) in Repo-Werkzeuge um. Alles lokal,
pip/stdlib + ImageMagick, keine Non-Commercial-Lizenz im Stack.

---

## Paket 0 — Messung `normalize_asset.py` (Solutions-Frage 6)

Was das Tool heute exakt tut, Schritt fuer Schritt, mit Fundstellen:

| # | Schritt | Fundstelle | Haengt am Keying? |
|---|---|---|---|
| 1 | BG-Schaetzung: Median des 6-px-Randstreifens (NICHT hartes #7F7F7F) | `_estimate_bg` | ist die Referenz |
| 2 | `seed_bg`: Max-Kanal-Abstand zur Referenz < `bg_tol=0.10`, BINAER | `remove_background` | Kern des Alt-Keyings |
| 3 | `seed_shadow`: unbunt (`chroma<0.12`) + dunkler als BG + ueber `shadow_floor` | dito | JA — nutzt dieselbe Flood-Region |
| 4 | Flood-Fill vom Bildrand ueber `seed_bg\|seed_shadow` (4er-BFS) | `_flood_from_border` | Topologie-Herz |
| 5 | Rand-verbundenes BG -> Alpha 0 (hart, kein Teil-Alpha) | `remove_background` | JA |
| 6 | Schatten-Erhalt: Luminanz->Alpha (`shadow_strength=0.85`), neutral getoent | dito | JA |
| 7 | Pocket-Entfernung: eingeschlossene BG-Taschen >= `hole_min` -> Loch, Rand-Dilatation `hole_grow=2` frisst AA-Halo | dito | JA — nutzt `seed_bg` + Flood-Komplement |
| 8 | mode=node: radialer Alpha-Fade aussen 15 % | `radial_fade` | nein (nach Keying) |
| 9 | Auto-Skip: bereits transparente Eingaben ueberspringen Stufe A | `_mostly_transparent` | Gate davor |
| 10 | Farb-Normalisierung: Entsaettigung m. Reserve-Schutz, S-Kurve, Split-Tone | `normalize_rgb` | NEIN (immer, unabhaengig) |
| 11 | Hue-Harmonisierung (Kanon-Akzente) | `harmonize_hue` | NEIN |

**Antwort auf Frage 6:** Kein Drop-in-Austausch — Schritte 3/6/7 konsumieren
die Flood-Topologie. Der neue Lab-Keyer uebernimmt deshalb die Topologie-Logik
(Flood-Gate, Schatten, Pockets) und ersetzt nur die harte Zugehoerigkeit durch
die weiche Delta-E-Rampe.

## Paket 1 — Keying-Upgrade (`--keyer lab`, Default)

`remove_background_lab` in `tools/normalize_asset.py`: Delta-E (CIE76) im
CIELAB-Raum zur Rand-Median-Referenz, weiche Rampe `lab_t_in=8 / lab_t_out=22`
(E3-Skizze). Alt-Modus bleibt: `--keyer flood`.

A/B auf fuenf Bestands-Assets (Diff-Bilder + Cutouts in `proof/keying_ab/`).
Metrik: Anteil fraktionaler Alpha-Pixel in der 3-px-Kantenzone um die
0,5-Kontur (dort leben die AA-Kanten; mehr fraktional = weichere Kante):

| Asset | flood | lab | Gewinn |
|---|---|---|---|
| hellmuth_corner_a | 0,305 | 0,356 | +17 % |
| moderat_sigil_a (feine Speichen) | 0,489 | 0,571 | +17 % |
| hellmuth_strip_h_a (duenne Staebe) | 0,161 | 0,316 | +96 % |
| moderat_strip_v_e (Rohre) | 0,549 | 0,602 | +10 % |
| hellmuth_v_topleft_gpt_a (GPT, E3-Fall) | 0,232 | 0,341 | +47 % |
| **Mittel Kantenzone** | **0,347** | **0,437** | **+26 %** |

Groesster Gewinn genau dort, wo E3 ihn vorhersagt: GPT-Ausgabe (nie
pixelidentisches Grau) und duenne Staebe.

**Eskalations-Weg bei Grau-Kollision im Objekt** (E3-Entscheidungsbaum Pfad 2):
`rembg` mit `birefnet-general` — via `tools/mine_mockup.py`-Stufe 3 oder
direkt `rembg i -m birefnet-general in.png out.png`. Gewicht MIT-lizenziert;
die BRIA-Variante RMBG-2.0 ist non-commercial und VERBOTEN.

## Paket 2 — `tools/mine_mockup.py` (Mockup-Ernte, H8)

Kommandokette Real-ESRGAN(-anime) -> GroundingDINO+SAM2 -> rembg isnet-anime
(Fallback birefnet-general, u2net) -> ImageMagick Halo-Erode+Trim. Jede Stufe
degradiert einzeln und meldet es (Lauf bricht nicht). Grenze im Header:
Props <= 150 px Quellgroesse, keine Hero-Gebaeude (E1-Rechnung). Lizenzblock im
Header; RMBG-2.0-Verbot als harte Warnung.

Gewichte: `bash tools/get_mining_weights.sh` — Trust-on-first-use-Checksummen
in `tools/mining_weights.sha256.lock` (KEINE Fantasie-Hashes; die Lock-Datei
entsteht beim ersten Lauf auf offener Maschine und wird committet).

**Mining-Beweis-Lauf** (2026-07-02, `docs/ref/tab-hud.png`, Degraded-Mode):

| Stufe | geplant | gelaufen |
|---|---|---|
| Upscale | Real-ESRGAN anime_6B | uebersprungen (Gewicht nicht beschaffbar, s. Residuen) |
| Segmentierung | GroundingDINO+SAM2 | Connected-Components (Objekte unbenannt) |
| Alpha | isnet-anime | u2net (lokaler Cache; isnet-Download proxy-gesperrt) |
| Nacharbeit | ImageMagick Erode+Trim | ImageMagick Erode+Trim |

Ausbeute, ehrlich: **1 Kandidat, 0 brauchbar** — `objekt_00.png`
(bbox 465,90–1365,833, Quellgroesse ~225 px) schlaegt korrekt die
Hero-Grenze-Warnung an. `docs/ref/tab-hud.png` ist ein HUD-Referenzbild, kein
Prop-reiches Szenen-Mockup; die echten Zielbild-Mockups liegen nicht im Repo.
Der Lauf beweist die Kette (alle 4 Stufen + Grenz-Warnung + Sichtungs-Ordner-
Zwang), nicht die Ausbeute. Beweis: `proof/mining/`.

## Paket 3 — Nahtlos-Werkzeuge (`tools/tile_tools.py`, H10)

1. **`kacheltest`** — Naht-Score = Wrap-Differenz (letzte gegen erste
   Spalte/Zeile) relativ zur inneren Nachbar-Differenz. Schwelle PASS < 1,6,
   begruendet ueber synthetische Validierung: wrap-periodisches Bild 1,00,
   Helligkeits-Gradient 4,82, angeklebte Fremd-Haelfte 2,04.
2. **`heal`** — Offset+Heal (E4/Resynthesizer-Weg): Roll um halbe Kante
   (Raender werden per Konstruktion wrap-stetig), Naht-Kreuz per
   Efros-Freeman-Patches ueberdeckt (SSD-Match + Minimal-Fehler-Schnitt,
   Kernschleife selbst geschrieben — Referenz: Efros & Freeman, "Image
   Quilting for Texture Synthesis and Transfer", SIGGRAPH 2001; keine
   Fremd-Implementierung uebernommen, damit keine Lizenzfrage entsteht).
3. **`quilt`** — Efros-Freeman-Synthese aus Beispiel-Crops (fuer den
   Rissboden-Fall: neue Textur aus Mockup-Material). Fuer zirkulaere
   Ausgabe `heal` nachschalten.
4. **`diamond`** — Quadrat -> 160×96-Raute, `--method rotate` (45°-Rotation +
   Stauchung) und `--method mask` (Rautenmaske), beide verifiziert
   (Ausgabe 160×96 RGBA).

## Paket 4 — Reparatur-Beweis (Naht-Score vorher/nachher)

| Boden | vorher | nachher (heal) | Urteil |
|---|---|---|---|
| `boden-erde-tot-2` (Brief-Ziel) | 1,29 | **0,99** | PASS |
| `boden-steppe-1` (Brief-Ziel) | 1,80 | **1,01** | PASS |
| `boden-erde-tot-3` (messbar schlimmster) | 3,53 | **0,87** | PASS |

Reparierte Kacheln + 2×2-Montagen vorher/nachher: `proof/tile_repair/`
(Sichtungs-Ordner — **read-only gegenueber `assets/source/`**, Uebernahme in
den Quellbestand ist Ticros Akt).

**Diskrepanz, ehrlich:** Die KARTENEDITOR.md:111-114-Zahlen (erde-tot-2 ~ 11,
steppe-1 ~ 2,9) sind mit keiner Frequenz-Variante am heutigen UND am
urspruenglichen Quell-PNG (`git show c2a30ad`) reproduzierbar; das Original-
Messskript ist nicht ueberliefert. Meine Metrik ist stattdessen synthetisch
validiert (s. o.). Der messbar auffaelligste Boden des Bestands ist
`boden-erde-tot-3` (3,53), gefolgt von `sandlehm-4` (3,43) und `steppe-2`
(2,13) — Kandidaten fuer denselben `heal`-Lauf, wenn Ticro sie freigibt.

## Lizenzliste (Stack komplett)

| Werkzeug/Gewicht | Lizenz |
|---|---|
| Real-ESRGAN (+anime_6B) | BSD-3-Clause |
| GroundingDINO | Apache-2.0 |
| Grounded-SAM-2 / SAM2.1 | Apache-2.0 |
| rembg | MIT |
| u2net / isnet-anime (DIS) | Apache-2.0 |
| birefnet-general | MIT |
| pymatting | MIT |
| Efros-Freeman-Quilting | Eigen-Implementierung (Paper-Algorithmus) |
| ImageMagick | ImageMagick-Lizenz (Apache-2.0-kompatibel) |
| **VERBOTEN** | RMBG-2.0 (BRIA, NC) · FLUX.1-dev (NC) · u2net_portrait (NC-Daten) |

## Residuen (ehrlich)

1. **Gewichts-Beschaffung in Cloud-Sessions tot** (gemessen 2026-07-02):
   github-Releases fremder Repos liefern die Proxy-Wand
   `"GitHub access to this repository is not enabled for this session"`
   (403), `dl.fbaipublicfiles.com` connect-tot. Morgens lief derselbe
   u2net-Download noch (Welle-1-Doktrin-Messung) — die Wand ist neu/
   session-abhaengig. Folge: Real-ESRGAN-anime, GroundingDINO, SAM2,
   isnet-anime, birefnet konnten nicht geladen werden; Mining-Lauf lief im
   Degraded-Mode. `get_mining_weights.sh` auf offener Maschine ausfuehren,
   `tools/models/` + Lock-Datei kopieren — danach laeuft alles offline.
2. **`_grounded_sam2` ist vorbereitet, nicht implementiert** (wirft
   NotImplementedError mit Anleitung) — ohne Gewichte nicht testbar, und
   ungetesteter Code waere eine Attrappe.
3. **Mining-Ausbeute am echten Mockup ungemessen** — kein Prop-reiches
   Zielbild im Repo. Sobald Ticro eines liefert: Lauf wiederholen,
   Ausbeute-Liste in dieses Kapitel.
4. **KARTENEDITOR-Naht-Zahlen nicht reproduzierbar** (s. Paket 4) — die
   dortige Doku sollte auf die `tile_tools.py kacheltest`-Metrik
   umgestellt werden (Folge-Auftrag, nicht mein Schreibrecht in fremde
   Mess-Doku ohne Freigabe).
5. **`quilt` als Neusynthese** liefert brauchbare Textur, aber erst
   `heal` macht sie zirkulaer — dokumentiert, kein versteckter Defekt.
