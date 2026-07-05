# HUD-FEHLERURSACHEN — HELLMUTH

**Warum HUD-Arbeit über Instanz-/Chat-Wechsel verlorengeht oder falsch umgesetzt wird.** Jeder Mechanismus belegt, jede Gegenmaßnahme konkret und prüfbar. Keine Folklore.

Beleg-Notation: `[T:n]` Transkript `Claude-GAME-5-2026-06-15__3` · `[R:datei:zeile]` Repo @ `claude/quirky-fermat-8rewv0` · `[Ü:..]` `FABLE-UEBERGABE`.

---

## 1 · Wegwerf-Branch-Falle (Harness-Zuweisung ≠ Integrationslinie)

**Mechanismus.** Die Web-Harness weist jeder Instanz einen eigenen, oft veralteten Pflicht-Branch zu (`adoring-carson`, `lucid-goldberg`, `trusting-shannon`, `gallant-rubin`). Die Instanz baut dort, aber der Branch trägt den Projektstand nicht: `adoring-carson` liegt 55 Commits hinter `quirky-fermat`, hat den vfx-Merge nie bekommen — »Auf adoring-carson ist deine Aufgabe schlicht nicht baubar« `[T:6650]`. Gepushte Arbeit erreicht das Origin nie: Code1+ meldete B/C/D nach `claude/hud` gepusht — »und sie sind nicht da« `[T:6769]`.

**Gegenmaßnahme (prüfbar).** Feste Branch-Regel als erste Zeile jedes HUD-Auftrags:
```
git fetch origin && git checkout claude/quirky-fermat-8rewv0
git rev-parse HEAD          # muss Integrations-SHA sein, NICHT 0764e36
# bauen, committen, dann gezielt:
git push origin HEAD:claude/quirky-fermat-8rewv0
```
Den zugewiesenen Wegwerf-Branch ignorieren. Neuen Branch nie per `git push` anlegen (Proxy 413) — einmal über die GitHub-API, danach pusht git normal `[T:284]`. **Gate:** `pruefen.sh` Abschnitt »Branch-Hygiene« prüft `HEAD == origin/quirky-fermat` und meldet rot bei Abweichung `[R:pruefen.sh »Branch-Hygiene«]`.

---

## 2 · Branch-Divergenz-/Falschmessungs-Falle (Arbeitsbaum auf altem Stand)

**Mechanismus.** Wer den Arbeitsbaum misst statt der Integrationslinie, diagnostiziert den falschen HUD. Der Arbeitsbaum-Default `0764e36` ist der Vor-Umbau-Stand: `hud.css` hat dort **0×** `--hud-scale`, auf der Integrationslinie **91×** `[R:src/ui/hud.css]`. Dieselbe Falle traf die Diagnose live: »I diagnosed the wrong sibling. I must re-read the actual files I'll edit« `[T:3002]`; und die Mensch-Session stand auf einem alten `claude/hud`-Pointer und sah das Vor-Umbau-HUD, bis `git fetch` nachzog `[T:6766,6804]`. Auch die Übergabe `[Ü:F21]` (»König raus«, »Anker rückgängig«) beschreibt Stände von `beautiful-thompson`/`hopeful-cannon`, die nie nach quirky-fermat gemergt wurden — drei Subagenten dieser Runde maßen zunächst den falschen Branch.

**Gegenmaßnahme (prüfbar).** Identitäts-Check vor jeder Diagnose: `git rev-parse HEAD` == Integrations-SHA. Negativ-Gate gegen den Alt-Stand: `grep -c -- --hud-scale hellmuth/src/ui/hud.css` muss **> 0** sein und `grep -rn "gf-layer\|--gf-tile\|--gf-corner" hellmuth/src/ui/` **leer** — sonst steht die Instanz auf dem toten V2-Stand, jede Diagnose ist Müll. Mess-Methode: bei Sparse-/Index-Quirk `git cat-file -p <blob-oid>` statt `git show`/`cat` auf den Arbeitsbaum. Browser hart neu laden (Strg+Shift+R), sonst zeigt der Vite-Cache den Altstand `[T:6848]`.

---

## 3 · Undokumentierte Chat-Verfeinerungen (Spec lebte nur im Chat)

**Mechanismus.** Die tagelange Gestaltung (welche benannte Leiste an welche Kante, Eckstück-Bindung, Sigil-Position, Tönung) lebte nur im Chatverlauf, in keiner Spec. Das Gedächtnis driftet — »aus meinem driftenden Gedächtnis« `[T:6795]`, »Was paraphrasiert wird, korrumpiert die Wahrheitsquelle« `[T:6882]`; der referenzierte `d0495a2`-Hash »existiert in keinem Branch« (nur falsch erinnert) `[T:1701]`. Ticro musste die Dateiname-zu-Position-Zuordnung mehrfach komplett neu diktieren `[T:992,1554]`.

**Gegenmaßnahme (prüfbar).** Die versionierte **`docs/HUD-SOLL-SPEC.md`** im Repo ist die alleinige Wahrheit (diese Spec). Jede Instanz arbeitet gegen die Datei, nicht gegen die Paraphrase des Vorgänger-Chats. Fehlt eine Zuordnung: nachfragen, nicht raten — die Spec führt offene Punkte explizit unter »OFFENE ENTSCHEIDUNG TICRO«. Prüfbar: Spec-Diff statt Chat-Paraphrase.

---

## 4 · Spec-Umdeutung (eigener uniformer Master statt der designten Strips)

**Mechanismus.** Code1+ generierte einen **eigenen uniformen Nine-Slice** und kachelte ihn, statt die designten kanten-differenzierten Strips zu setzen `[T:6851]` `[Ü:K5]`. Die Strip-Differenzierung (offene Oberkante `strip_h_b` ≠ geschlossene Kanten `strip_h_a` gedreht; MODERAT `h_e`/`v_e`) ist die Kerngestaltung — sie geht verloren, sobald ein generisches 9-Slice-Band über alle vier Kanten läuft. Frühere Instanzen streckten zudem eine einzige Leiste (»maximal hässlich«) und verzerrten Größenverhältnisse gegen die Anweisung `[T:1554,992]`.

**Gegenmaßnahme (prüfbar).** Die Spec schreibt Strips **per exaktem Dateinamen pro Kante** vor (§2), nicht »ein Nine-Slice«. **Gate:** `tools/hud_soll_gate.py` prüft, dass die offene Oberkante eine andere Leiste (26 px) trägt als die geschlossenen Kanten (15 px), und meldet rot, wenn alle vier Kanten uniform sind. Abnahme am gerenderten Bild: offene vs geschlossene Kante sichtbar verschieden.

---

## 5 · Ordner-vs-Dateiname-Asset-Auflösung (404 / Vergrauung)

**Mechanismus.** `process_ui_v2.py` routete HUD-Assets nach Rollen-Ordner statt Basename (`folder_of()`); die lit-Eckstücke lagen im falschen Ordner (`moderat_v_topleft_d` in `violett/`, `hellmuth_v_topleft_gpt_a` in `orn/`) `[T:1557]`. Folge: erzwungene Re-Freistellung + deglow/desat → grauer Saum, zerstörte Beleuchtung; die fertige RGBA-Quelle in `freigestellt/` ignoriert `[T:1848]`. Am Konsum-Ende ein zweiter Fehlpfad: `html_hud.ts` referenzierte tote Anker `topleft/gpt_a.png`/`d.png`, die nie erzeugt wurden → 404, leerer Rahmen `[T:1847]`. **Der Ordner lügt, der Dateiname nicht** `[T:1886]`.

**Gegenmaßnahme (prüfbar).** Dateinamen-keyed Manifest `src/data/hud_assets.json` (existiert): Suche per Basename über alle Quellordner, mehrdeutiger Name → harter Build-Fehler; Raw-Bypass (`pipeline:"raw"`) für lit-Assets, nie relight/desat/grain `[R:tools/build_hud_assets.py:25,130-153]`. **Gate:** `pruefen.sh` »HUD-Asset-Auflösung + Kollisions-Guard« prüft, dass jeder Pflicht-Slot auflösbar ist und kein Pfad ins 404 zeigt `[R:pruefen.sh »HUD-Asset-Aufloesung«]`. Prüfbar: Datei zwischen Ordnern verschieben → bit-identisches Ergebnis; Kollision → Build-Stopp; fehlendes Asset → Platzhalter statt stiller 404.

---

## 6 · Zu schwaches Selbst-Abnahme-Kriterium (kein Rendered-Result-Gate)

**Mechanismus.** Die Instanz meldet »fertig« gegen `tsc`/`vite`-grün, das Ticros visuellen Standard verfehlt: »das hat immer noch genauso beschissen ausgesehen« `[T:992]`, »widersprüchlich zu den Anweisungen« trotz vieler Subagenten `[T:1554]`; Build grün, HUD-Stand falsch `[T:6644]`. Strukturell gefährlich: ein SVG-`border-image`-Master lief im **secure static mode**, konnte die `/sprites/`-Quelle nicht laden und hätte den Rahmen **unsichtbar** gemalt — »ein Fehler, der im Code sauber aussieht und im Browser nichts malt« `[T:3071]`. `tsc` grün ist kein Beleg.

**Gegenmaßnahme (prüfbar).** Verbindliches **Rendered-Result-Gate**: »fertig« erst nach Browser-Screenshot der laufenden App auf der Integrationslinie, nie nach Code-Review/Typecheck allein `[T:6914]`. Mechanik existiert: `pruefen.sh` »Render-Drift« rendert beide Fraktionen headless und difft gegen `proof/baseline/*` `[R:pruefen.sh »Render-Drift«]`; `tools/hud_soll_gate.py` prüft die Soll-Punkte maschinell. Abnahme-Checkliste (aus `[T:992,1554]`): (1) offene Oberkante ≠ geschlossene Kanten; (2) Strips kacheln, nicht gestreckt; (3) Ecken verschmolzen; (4) Eckstück am Kästchen, nicht in der Bildschirmecke; (5) kein grauer Halo; (6) Menü statt Pause; (7) keine `+X/s`-Rate; (8) kein König-Orb zwischen Minimap und Raster. Versagt ein Punkt im Bild, ist »fertig« unzulässig.

---

## 7 · V3-Manifest-vs-V2-Laufzeit-Disconnect (strukturelle Wurzel des Defekts)

**Mechanismus.** Das Manifest `src/data/hud_assets.json` treibt einen neuen `v3/`-Baum, aber `html_hud.ts` nutzt das Manifest NICHT — es hardcodet `/sprites/ui/hud/v2/${faction}/...` `[R:src/ui/html_hud.ts:275,296]`. `public/sprites/ui/hud/v3/` ist **leer** (V3-Substrat ungebaut); der `v2/`-Baum ist lückenhaft. Die Laufzeit zeigt den alten, unvollständigen V2-Stand = der »kaputte« Render. Das Manifest ist totes Datenmodell, von keiner Laufzeit/keinem Test konsumiert (`HUD_ASSETS` nur intern in `hud_assets.ts`).

**Gegenmaßnahme (prüfbar).** Entscheidung Ticro (HUD-SOLL-SPEC §10/§11): V3 bauen (`tools/build_hud_assets.py`) + `html_hud.ts` vom v2-Hardcode auf das Manifest umstellen, ODER bewusst beim v2-Stand bleiben. **Gate:** `pruefen.sh` »HUD-Asset-Auflösung« meldet `TEILBAU` rot, wenn der v3-Baum existiert aber Outputs fehlen, und »ungebaut« als Hinweis, wenn der ganze Baum fehlt `[R:pruefen.sh »HUD-Asset-Aufloesung«]`. Zusatz-Check empfohlen: jeder im DOM referenzierte `url()` muss in `public/` existieren (404-Wächter).

---

## 8 · Gate-vs-Renderer-Drift (das Gate prüft, was die Laufzeit nicht rendert)

**Mechanismus.** Die vorhandenen statischen Prüfer driften gegen den Code:
- `hud_spec_check.py` parst nur `vw/vh`, der Code nutzt aber `calc(px*var(--hud-scale))` → jeder Wert wird `None`, alle Checks falsch-rot `[R:tools/hud_spec_check.py]` `[R1-Befund]`.
- Beide statischen Prüfer tragen tote V2-Selektoren (`.hud-sockel`/`.bar-riser`) → garantierte `FEHLT`-Fails `[R:tools/hud_browser.mjs]`.
- `hud_gate.py` verlangt ein `topleft`-Ornament, das die Laufzeit nie rendert (die Ecke macht `.emb-corner`) → Gate widerspricht dem Renderer `[R:tools/hud_gate.py]` vs `[R:html_hud.ts:184]`.

**Gegenmaßnahme (prüfbar).** Gate-Checks müssen gegen den **realen Render** laufen (`getComputedStyle`/`getBoundingClientRect` + Pixel), nicht gegen statisch geparste CSS-Annahmen. `tools/hud_soll_gate.py` (neu) liest die echten DOM-/Render-Werte und vergleicht gegen die HUD-SOLL-SPEC; jeder Fail nennt die verletzte Spec-Zeile. Die toten statischen Prüfer sind zu reparieren (calc-Parser) oder durch die render-basierten Checks zu ersetzen. **Regel:** ein Gate, das gegen den Renderer driftet, ist selbst eine Fehlerquelle — Gate und Laufzeit müssen dieselbe Wahrheit prüfen.

---

## Prozess-Regel — was jede HUD-Instanz VOR »fertig« tun muss

1. **Stand verifizieren.** `git fetch origin && git checkout claude/quirky-fermat-8rewv0`; `git rev-parse HEAD` == Integrations-SHA (nicht `0764e36`). Wegwerf-Branch ignorieren. [Ursache 1,2]
2. **Alt-Stand-Negativ-Gate.** `grep -c -- --hud-scale hellmuth/src/ui/hud.css` > 0 **und** `gf-layer/--gf-tile` leer. Sonst toter V2-HUD — neu auschecken. [Ursache 2]
3. **Gegen die Datei arbeiten, nicht gegen Gedächtnis.** Maßgeblich ist `docs/HUD-SOLL-SPEC.md`. Fehlt eine Zuordnung: nachfragen, nicht raten. [Ursache 3]
4. **Assets per Basename, nie per Ordner.** Über das Manifest; lit-Assets Raw-Bypass. Mehrdeutiger/fehlender Name = Build-Stopp, kein stiller 404/Grau-Halo. [Ursache 5,7]
5. **Die designten Strips setzen, keinen Eigen-Master.** Offene Oberkante `strip_h_b`, geschlossene Kanten `strip_h_a` gedreht; MODERAT `h_e`/`v_e`; Sigil mittig. Kein uniformes Band. [Ursache 4]
6. **Rendered-Result-Gate.** `./pruefen.sh` grün (inkl. `tools/hud_soll_gate.py`), Browser-Screenshot gegen die 8-Punkt-Abnahmeliste. `tsc`/`vite` grün zählt nicht. [Ursache 6,8]
7. **Gezielt pushen.** `git push origin HEAD:claude/quirky-fermat-8rewv0`; Ankunft belegen (`git rev-parse origin/...`). [Ursache 1]

---

## Offen / unbelegt

- **Container-/Sandbox-Isolation selbst** (Pushes erreichen das Origin nicht, weil der Container nur über den Git-Kanal nach außen kommt `[T:6769]`): Die Branch-Regel adressiert das Push-Ziel, nicht die zugrundeliegende Isolation. Ob die Harness-Branch-Zuweisung umkonfigurierbar ist, ist nicht belegt — bleibt Disziplin.
- **Zeilennummern-Drift** zwischen Transkript-Zitaten und Repo-Stand ist ein Symptom von Ursache 2 (verschiedene Stände, verschiedene Zeilen), kein Widerspruch.
