# HUD-Reparatur — Übergabe-Notiz (CODE-Loop)

Stand der vier (fünf) Werkstücke aus `CODEHUDREPARATURLOOP.md`. Reihenfolge: **erst
das Auge, dann das Bild.** Linie: `claude/quirky-fermat-8rewv0`. Alles Gemessene ist
am echten 1920×1080-Render gesetzt, nicht behauptet.

## Erledigt und gepusht

- **Werkstück 0 — §6(A) linksbündig.** `hud_soll_gate.py` ALIGN-Default `right→left`
  (Soll `flex-start`), `pruefen.sh` mit, `hud.css .res-val` ausgewogener Icon→Zahl-Abstand
  (x=64, ~12px). Gate war `ROT` (Fehlerwartung), ist jetzt `GRÜN`; Gegenprobe `ALIGN=right`
  wirft weiter rot. Abstand final von Ticro abzunehmen. *(Commit `Werkstueck 0`.)*

- **Werkstück 1 — sehendes Gate.** `tools/hud_continuity.py` (neu) + `check_continuity`
  in `hud_soll_gate.py`. Zwei Detektoren, an proof/baseline geeicht, am synthetisch
  perfekten Tile gegengeprüft:
  - Durchgängigkeit (§11): Selbst-NCC über die Harmonik-Reihe (1×/2×/3×) im aus
    `--hud-scale` lokalisierten Band + Kanten-Kamm-Backstop. PASS = ∃P `min(1×,2×)≥0.55`
    UND `3×≥0.45` UND Kamm `≤3.0`. Gesund (synthetisch) 0.97/0.97/0.97, Kamm 1.3.
  - Eckverschmelzung (§12): Gradientenrichtungs-Fraktion (primär) UND anti-diagonale
    Korrelation. MITER nur `gfrac≥0.55` UND `anti≥0.80`; sonst Stumpfstoss.
  - **Pflicht-Gegenprobe bestanden:** am aktuellen kaputten Render wird das Gate `ROT`
    — HELLMUTH self-NCC 0.18, MODERAT 0.55/0.36/0.08 (Harmonik-Kollaps), Kamm 4.8/3.4;
    14/14 gemessene Panel-Ecken Stumpfstoss. *(Commit `Werkstueck 1`.)*

- **Werkstück 2 — Anti-Self-Green.** *(Commit `Werkstueck 2`.)*
  - `tools/coupling_gate.sh` (P1b/P1c): kein Commit darf Render-Code UND
    `proof/baseline/*.png` zugleich anfassen. **Gegen `f0c2ff4` verifiziert → ROT.**
  - `tools/baseline_gate.py` (P1a/P2): Baseline gilt nur via menschlichem Hash-Manifest
    `proof/baseline/APPROVED.sha256`. PNG ohne Neu-Segnung → ROT; fehlende Baseline → ROT
    (kein Auto-Seed). Vor erster Segnung Warnung statt rot.
  - `tools/segnen.sh` (P1c): der menschliche Segnungs-Akt. **Keine Instanz führt es aus.**
  - `hud_soll_gate.py` (P4): fehlender Render bei `RENDER_RAN=1` → FAIL statt SKIP.
  - `pruefen.sh`: Auto-Seed→FAIL, Anti-Self-Green-Abschnitt, `RENDER_RAN` durchgereicht.
  - `package.json` + `.github/workflows/ci.yml`: `gate:coupling` + `gate:baseline` als
    commit-gebundene CI-Schritte (der dauerhafte Riegel, krisenstab §15).

## Offen — Werkstück 3 (die eigentliche Reparatur): Doktrin zurückholen, hybrid

Genaues Rezept, gemessen vorbereitet, NICHT begonnen (Render-Code, hohe Prüf-Last,
echte Integrations-Hürde — bewusst sauber übergeben statt halb gerendert gepusht):

1. **`FRAME_MASTER` zurückholen.** Liegt fertig gebacken (320×320, Slice 32, grau) auf
   `origin/claude/hud:hellmuth/src/ui/hud_master_data.ts` als `export const FRAME_MASTER`.
   Der heutige `hud_master_data.ts` hat nur `BAR_MASTER` — den `FRAME_MASTER`-Export
   ergänzen (kein Re-Bake nötig, krisenstab §4b). `tools/build_hud_frame.py` erzeugt ihn,
   falls doch neu gebacken werden soll.
2. **Wiring (`html_hud.ts`).** `FRAME_MASTER` importieren; in `render()`
   `--frame-img` = `tintedBorderImage(FRAME_MASTER.uri, factionTint(faction), 320, 320)`
   setzen (wie `claude/hud:html_hud.ts:169-173`). `factionTint`/`tintedBorderImage`
   existieren bereits in `hud_tint.ts`.
3. **CSS (`hud.css .panel::before`).** Die kaputten vier `background-repeat`-Layer
   (`:93-97`, HELLMUTH-Kopie `:106-111`) ersetzen durch
   `border: calc(15*var(--hud-scale)) solid transparent; border-image: var(--frame-img) 32 round;`.
   `round` kachelt ganze Kacheln (kein Anschnitt), die 32er-Eck-Slices verschmelzen die
   Ecken nativ — **keine `clip-path`-Gehrung nötig**. Zwei tote Kommentare räumen
   (`hud.css:71,86`, sie zeigen noch auf die alte Doktrin).
4. **MODERAT = nur das** (überall 15px geschlossen, symmetrisch → reines border-image round).
5. **HELLMUTHs offene 26px-Oberkante als separate Lage** über den drei Hauptpanels
   (`K_TOP` aus `hud_strip_data.ts` trägt sie bereits). **DAS ist die eigentliche Hürde:**
   border-image ist symmetrisch und kann oben-26-offen ≠ unten-15-zu nicht selbst
   rendern (genau dafür wurde die Doktrin in `3a1c155` geopfert, HUD-SOLL-SPEC §2:40).
   Hybrid: border-image round für den geschlossenen 15px-Rahmen + Ecken, K_TOP-Lage
   für die offene Oberkante darüber.
   - **Prüf-Konsequenz:** Der §12-Eck-Detektor misst HELLMUTHs Oberecken in einem
     26px-Quadrat (`ttop=26`). Nach dem Bau verifizieren, dass diese Ecken **MITER**
     melden (`gfrac≥0.55` UND `anti≥0.80`). Tun sie es nicht, ist das der Kalibrier-/
     Integrationspunkt: K_TOP-Überlappung an die Eck-Slices anpassen ODER (krisenstab §15
     erlaubt render-spezifische Nachkalibrierung) Schwelle an einem ECHTEN sauberen
     Render neu setzen — nicht am kaputten.

**Abnahme W3:** `npm run build` → `node tools/hud_browser.mjs shoot` → der sehende Gate
(W1) muss **GRÜN** werden (Durchgängigkeit über Schwelle beide Fraktionen, 0 Stumpfecken).
Dann visuell beide Fraktionen bei mehreren Seitenverhältnissen.

## Offen — Werkstück 4 (erst nach W3-grün)

- `_best_seam` raus (`build_hud_frame.py`, periodenblind). Autokorrelations-Methode
  liegt im Repo (`hud_render_proof.py count_repeats`).
- Tote/stale Reste: `--ornW`/`--ornH` (`hud.css:23-24`, wirkungslos), stale Spec §2.1.
  Löschen, nicht auskommentieren.

## Offen — Abnahme-Artefakte

- **`contact.html`** (krisenstab §14, `tools/contact_sheet.mjs`): Leisten als höhen-
  überhöhte Bänder, Ecken 8× vergrößert, beide Fraktionen nebeneinander, Ja/Nein-
  Checkliste am Fuß. Crop-Geometrie liegt dreifach vor (`hud_browser.mjs SPEC`,
  `hud_zones.json`, `docs/hud-zonen-2.json`).
- **Kritiker-Pflicht** vor jeder Grün-Meldung: adversariale Subagenten auf Attrappen-Gate
  / Zoom-Lüge / Self-Green-Rückkehr. Für W1/W2 sind die Kern-Gegenproben schon gefahren
  (red-on-broken, f0c2ff4→rot, synthetisch-gesund→grün, P4-FAIL).
- **Baseline-Segnung** ist Ticros separater Akt NACH dem Kontaktbogen (`tools/segnen.sh`),
  NICHT Teil dieses Auftrags (W2 sperrt das Selbst-Segnen).

## Ehrliche Residuen

- numpy+Pillow mussten zur Laufzeit nachinstalliert werden (ephemerer Container). CI
  (`ci-fast`) installiert sie nicht für den browser-losen Teil — der sehende Gate läuft
  im `render`-Job / lokal in `pruefen.sh`, nicht in `ci-fast`.
- Die **PASS-Schwelle des Eck-Detektors an einem echten verschmolzenen Render ist noch
  nicht gemessen** (nur synthetisch-gesund für die Durchgängigkeit). Erst W3 liefert den
  realen sauberen Render zur Schluss-Eichung. Schwellen sind an DIESEN kaputten Renders
  gesetzt; bei geändertem Render-Pfad / Nicht-1.0-Scale (21:9, 4:3) neu kalibrieren.
- Die ganze Maschinerie greift nur, wenn `pruefen.sh`/CI **läuft**. Der dauerhafte Riegel
  ist `ci.yml` (jetzt mit `gate:coupling`+`gate:baseline`); auf direkt gepushten
  `claude/*`-Branches ohne Branch-Protection bleibt CI ein Aufsatz, kein harter Block.
