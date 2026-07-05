# ENTSCHEIDUNGEN — offene Ticro-Entscheidungen, abnickbar

Eine einzige Queue für die im Repo und in den Specs verstreuten offenen
Entscheidungen, die nur Ticro treffen kann. **Nichts hier ist erfunden** — jede
Zeile ist aus einer Spec/TODO gesammelt und mit Quelle belegt. Jede Entscheidung
trägt einen **Default-Vorschlag**: nicken (Häkchen) heißt »Default gilt«, sonst
den Eintrag mit der gewählten Variante überschreiben.

Sammelt H5 aus `docs/MAXI-3-TEMPO-NIVEAU.md` (»geordneter Ort für offene
Entscheidungen«). Quellen: `docs/HUD-SOLL-SPEC.md` §12, `docs/NEBEL-TIEFE-SPEC.md`
§4 + §6, `docs/HUD-KRISENSTAB.md`, `TODO.md`. Status der Defaults entspricht dem
aktuellen Integrationslinien-Code (damit die Gates nicht gegen Unentschiedenes
rot laufen).

Stand: 25 gesammelt, davon **A1 inzwischen entschieden** (Werkstück 0, `4afd260`) → 24 offen. Bitte abnicken oder ändern.

---

## A · HUD (`docs/HUD-SOLL-SPEC.md` §12 + Inline-Marker)

### A1 · Ressourcen-Zahlen-Ausrichtung — links vs rechts ✅ ENTSCHIEDEN
- **Quelle:** HUD-SOLL-SPEC §6/§12 (A), `[Brief:20]`/`[R:hud.css:222-228]`.
- **Frage:** linksbündig (Brief-Soll) vs rechtsbündig (`flex-end`).
- **Default-Vorschlag / Entscheidung:** **linksbündig** — umgesetzt in Werkstück 0 (`4afd260`): `hud.css` res-val links, Gate-Default `ALIGN=left` in `hud_soll_gate.py` + `pruefen.sh`. Das HUD-Soll-Gate ist damit grün.
- [x] abgenickt (Werkstück 0)

### A2 · Ressourcen-Namen — Code vs Brief
- **Quelle:** HUD-SOLL-SPEC §12 (B), `[R:html_hud.ts:78]`.
- **Frage:** Brief nennt »Holz/Stein/Gold/Sirup«; im Code existieren `botanicals/reinwasser/destillat`.
- **Default-Vorschlag:** **Code-Namen behalten** (Brief-Liste war Platzhalter), kein Rename.
- [ ] abgenickt

### A3 · Tausender-Trennung / max. Stellenzahl
- **Quelle:** HUD-SOLL-SPEC §12 (C).
- **Frage:** Tausenderpunkt? maximale Stellen in der 113-px-Box?
- **Default-Vorschlag:** **keine Trennung, `tabular-nums`, Box 113 px** (Code-Stand; Worst-Case 999999 passt).
- [ ] abgenickt

### A4 · Kanonische Fraktions-Hex (zentral)
- **Quelle:** HUD-SOLL-SPEC §3/§12, `[Ü:C14]`; `../TODO.md` HUD V2/V3 (Platzhalter `#b9a14a`/`#c0407a`).
- **Frage:** A Code-Stand `#c4a23c`/`#883b54` · B Platzhalter `#b9a14a`/`#c0407a` (MODERAT verletzt Negativregel) · C Kanon `#E8B33A…`/`#B0186A…`.
- **Default-Vorschlag:** **C** — erfüllt die Negativregel »tief bläuliches Magenta, nie candy-pink«.
- [ ] abgenickt

### A5 · MODERAT-Rahmen-Motiv — eigenes vs geteiltes
- **Quelle:** HUD-SOLL-SPEC §12; `../TODO.md` HUD V2/V3 (Paket B, »deine Entscheidung«).
- **Frage:** MODERAT bekommt das HELLMUTH-Ornament magenta getönt, oder ein eigenes Industrie-Motiv (zweiter Master)?
- **Default-Vorschlag:** **geteiltes Motiv magenta getönt** (ein Master, weniger Asset-Schuld), bis ein eigenes MODERAT-Motiv generiert ist.
- [ ] abgenickt

### A6 · König / Hero — raus vs bleibt (Richtungs-Blocker)
- **Quelle:** HUD-SOLL-SPEC §8 (`[T:174]`); pruefen.sh-Default `KOENIG=present`.
- **Frage:** König komplett raus (Gate prüft Abwesenheit, Entfernung nach quirky-fermat portieren) oder als Hero behalten?
- **Default-Vorschlag:** **raus für jetzt**, später als dediziertes Hero-Asset (Destillenkrone/Orb-Puls) wieder rein; Gate-Default auf `KOENIG=absent`.
- [ ] abgenickt

### A7 · König-Pupille — Schlitz vs rund
- **Quelle:** HUD-SOLL-SPEC §8 (`[Ü:F21]`).
- **Frage:** Reptil-Schlitz (Fable, bedrohlicher) vs rund (Code `border-radius:50%`).
- **Default-Vorschlag:** **geparkt bis Hero-Asset-Einbau** (rund im Code bis dahin).
- [ ] abgenickt

### A8 · MODERAT-LumaStd ~35–40 akzeptieren?
- **Quelle:** HUD-SOLL-SPEC §7 (`[T:2743,2778]`).
- **Frage:** geschwärzter MODERAT-Stahl (~35–40) akzeptiert oder reliefreichere Leiste nachgenerieren? ≥45-Schwelle?
- **Default-Vorschlag:** **akzeptiert** (Stahl ist absichtlich ruhiger als Gold; Code1+ freigegeben), formale ≥45-Schwelle fallen lassen.
- [ ] abgenickt

### A9 · MODERAT-Zier-Eck — Materiallücke
- **Quelle:** HUD-SOLL-SPEC §5 (`[T:1749,2068]`); `../TODO.md` HUD V2/V3 (Slot #1).
- **Frage:** kein leucht-/tropfenfreies MODERAT-Eck vorhanden; nachgenerieren? überhaupt ein Zier-Eck für MODERAT?
- **Default-Vorschlag:** **Slot leer lassen** (durchlaufende S1-Leiste deckt die Ecke), nachgenerieren sobald ein sauberes Industrie-Eck existiert.
- [ ] abgenickt

### A10 · Eck-Offsets — verbindlich vs Ermessen
- **Quelle:** HUD-SOLL-SPEC §1 (`[R:hud.css:131,219]`).
- **Frage:** sind die nur code-belegten Offsets (Minimap 16/15, Ressourcen 130/15 px) verbindlich oder Ermessen?
- **Default-Vorschlag:** **Code-Werte verbindlich**.
- [ ] abgenickt

### A11 · Offene-Oberkante-Höhe + Vertikalstärke + Doppelkante
- **Quelle:** HUD-SOLL-SPEC §6 (`[T:1554,1919,1941]`).
- **Frage:** Höhe der offenen Oberkante (26 px nur »halboffen« belegt), Stärke der gedrehten HELLMUTH-Vertikalen, sichtbare `cut_elbow`-Doppelkante?
- **Default-Vorschlag:** **26 px verbindlich**, keine sichtbare Doppelkante (Code-Stapelung ok).
- [ ] abgenickt

### A12 · Sigil — Größe, Z-Order, HELLMUTH-Sigil
- **Quelle:** HUD-SOLL-SPEC §5 (`[T:992]`).
- **Frage:** Sigil-Größe (Code 64 px), Z-Order (Code z8 über Oberkante), bekommt HELLMUTH je ein Sigil?
- **Default-Vorschlag:** **64 px, z8 (drüber), HELLMUTH ohne Sigil** (Code-Stand).
- [ ] abgenickt

### A13 · V3 bauen + Manifest verdrahten vs v2-Stand
- **Quelle:** HUD-SOLL-SPEC §10.
- **Frage:** `build_hud_assets.py` laufen + Laufzeit vom v2-Hardcode aufs Manifest umstellen, oder bewusst beim v2-Stand bleiben?
- **Default-Vorschlag:** **vorerst v2-Stand** (läuft); V3-Umstellung als eigenes Paket nach Abnahme. Falls V3 gebaut wird: die gitignored `public/sprites/ui/hud/v3/`-Master fürs Deploy entweder tracken oder einen CI-Build-Schritt ergänzen (sonst fehlen sie im Deploy). `[Quelle: docs/TODO.md (alt), »V3-Master sind gitignored«]`
- [ ] abgenickt

### A14 · V2-px vs V3-Bausteinkasten (oberste Architekturfrage)
- **Quelle:** HUD-SOLL-SPEC §11 (`[R:hud.css:63]`/`[V3:28]`).
- **Frage:** Gilt die real implementierte V2-px-Vermessung oder Umstellung auf den V3-Bausteinkasten (vw/vh)? Plus Bar-Höhe (92 px vs ~22vh).
- **Default-Vorschlag:** **V2-px einfrieren** (Code-Wahrheit); V3-Migration als bewusster späterer Schnitt, nicht nebenbei.
- [ ] abgenickt

---

## B · Nebel-Tiefe (`docs/NEBEL-TIEFE-SPEC.md` §4 + §6)

### B1 · Fraktions-Tint des Nebels
- **Quelle:** NEBEL-TIEFE-SPEC §4.
- **Frage:** A neutral · B fraktionsgetönt · C konservativ gedeckelt.
- **Default-Vorschlag:** **C konservativ** — übersetzt »Hellmuth« in Mechanik statt Farbe, umgeht Magenta-auf-Magenta.
- [ ] abgenickt

### B2 · MapFog-Faction-Feld vs Laufzeit-Ableitung
- **Quelle:** NEBEL-TIEFE-SPEC §6.
- **Frage:** neues `MapFog.faction`-Feld (+ Editor) oder Laufzeit-Ableitung aus Distanzfeldern?
- **Default-Vorschlag:** **Laufzeit-Ableitung** (keine Datenmigration, kein Editor-Eingriff).
- [ ] abgenickt

### B3 · Lagen-Anzahl — 4 vs 3
- **Quelle:** NEBEL-TIEFE-SPEC §2/§6.
- **Frage:** 4 dünne Parallaxe-Lagen vs 3 robustere.
- **Default-Vorschlag:** **4 Lagen** (Tabelle §2; Over-Blend-Summe ≤ heute, 0.271).
- [ ] abgenickt

### B4 · Farbtemperatur-Gradient-Stärke
- **Quelle:** NEBEL-TIEFE-SPEC §6.
- **Frage:** Spreizung des Tints fern→nah.
- **Default-Vorschlag:** **moderat** (`0x8fa8be` fern … `0xb4c6d6` ADD).
- [ ] abgenickt

### B5 · Vignette / Y-Gradient
- **Quelle:** NEBEL-TIEFE-SPEC §6.
- **Frage:** Vignette an oder aus?
- **Default-Vorschlag:** **aus** (Erstickungs-Risiko in der Kartenmitte; falls an, nur Ränder/Horizont).
- [ ] abgenickt

### B6 · Lokale Partikel — aus / Typ A / Typ A+B
- **Quelle:** NEBEL-TIEFE-SPEC §3/§6.
- **Frage:** lokale Nebel-Partikel standardmäßig?
- **Default-Vorschlag:** **aus** (Preset STANDARD = Typ A Cap 16 + Typ B Cap 4 nur bei Bedarf).
- [ ] abgenickt

### B7 · Alpha-Deckel — 0.55 vs 0.52
- **Quelle:** NEBEL-TIEFE-SPEC §6.
- **Frage:** Deckel des Nebel-Alpha-Beitrags.
- **Default-Vorschlag:** **0.55** (gemessen p99 ~0.51, Headroom ~0.04).
- [ ] abgenickt

### B8 · Kanten-Erhalt-Schwellen (0.60 / 0.55)
- **Quelle:** NEBEL-TIEFE-SPEC §6.
- **Frage:** Mindest-Erkennbarkeit Einheiten ≥0.60, Terrain ≥0.55?
- **Default-Vorschlag:** **an echten Sprites einschießen**, vorläufig 0.60 / 0.55.
- [ ] abgenickt

---

## C · Übergreifend (andere Quellen)

### C1 · Minimap-Nebel-Färbung (Code3 FoW)
- **Quelle:** `../TODO.md` HUD V2/V3 (HUD-Rebuild-Folgepunkte).
- **Frage:** wie färbt die Minimap den Nebel?
- **Default-Vorschlag:** **an B1 (Fraktions-Tint C) koppeln**, kein eigener Sonderweg.
- [ ] abgenickt

### C2 · Leisten-Asset-Neuschnitt (Rapport ≤256 px unerreichbar)
- **Quelle:** `docs/HUD-KRISENSTAB.md` §5/§8/§10 (Pixel-Vertrag »Rapport ≤256px« strukturell unerreichbar).
- **Frage:** aktuellen Kachel-Stand akzeptieren oder Hybrid `border-image` + Asset-Neuschnitt/Neugenerierung der Leisten beauftragen?
- **Default-Vorschlag:** **Hybrid jetzt** (KRISENSTAB §8: `border-image … round`), Neuschnitt als Asset-Auftrag nachziehen, wenn Bildschärfe Priorität hat.
- [ ] abgenickt

### C3 · Kanonischer Arbeitsbranch — Doku-Hygiene
- **Quelle:** Widerspruch `docs/DIRECTION.md` (nennt `claude/hopeful-cannon-z94t30`) vs `KONVENTIONEN.md` + `pruefen.sh` (nennen `claude/quirky-fermat-8rewv0`).
- **Frage:** welcher Branch ist kanonisch?
- **Default-Vorschlag:** **`claude/quirky-fermat-8rewv0`** (KONVENTIONEN + pruefen.sh + aktive Integrationslinie); `DIRECTION.md` entsprechend angleichen.
- [ ] abgenickt

---

_Gepflegt als Teil der H5-Konsolidierung. Neue offene Punkte hier eintragen, nicht
verstreut in Specs/Commits hinterlassen. Wenn ein Default abgenickt ist, gilt er als
verbindlich und kann in die jeweilige Spec zurückgeschrieben werden._
