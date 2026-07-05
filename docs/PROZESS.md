# PROZESS — Merge- und Abnahme-Regeln (verbindlich)

> **Werkzeug-Pflicht**: Siehe `docs/WERKZEUGE.md` für das Container-Inventar.
> Vor jedem Auftrag konsultieren, vor jeder Eigenbau-Entscheidung verifizieren.

Der Regel-Teil von **H5** aus `docs/MAXI-3-TEMPO-NIVEAU.md`: weniger Durchgänge
durch den Menschen. Gemessener Engpass laut H5: **18–22 h pro Branch**, in denen
eine fertige Code-Instanz blockiert auf Merge/Abnahme/Entscheidung wartet. Diese
drei Regeln greifen genau das an. Jede Regel hat eine **konkrete Schwelle (Zahl)**
und einen erzwingenden Mechanismus — keine Prosa ohne Zahl.

Ergänzt die vorhandenen Richtungs-/Hygiene-Dateien (`docs/DIRECTION.md`,
`KONVENTIONEN.md`, `docs/LOOP-BLAUPAUSE.md`), ersetzt sie nicht.

Jeder neue Auftragsbrief trägt zudem den Pflicht-Kopf aus
`docs/AUFTRAG-VORLAGE.md` (Vorab-Block: KONVENTIONEN + CONTAINER-WERKZEUGE
lesen). Wer ohne den Block schreibt, schickt die nächste Instanz blind zu
externen Bezahl-Tools statt zu den gemessenen internen Hebeln.

---

## Regel 1 — Sammel-Merge statt Einzel-Stafette

**Schwelle:** **≥ 2** fertige Branches werden in **EINEM** Durchgang gemergt,
nicht einzeln über Tage gestaffelt. Zwischen **jedem** einzelnen Merge läuft
`./pruefen.sh`; nur **FAIL = 0** erlaubt den nächsten Merge.

**Mechanismus (erzwingend):**
1. Vorbedingung pro Branch: `ci-fast` grün (H1) — ein Sammel-Merge darf nicht
   blind sein (MAXI-3 H5-Trade-off).
2. Branch A mergen → `./pruefen.sh` → **FAIL = 0** → Branch B mergen →
   `./pruefen.sh` → **FAIL = 0** → … So kennzeichnet das Ergebnis eindeutig den
   schuldigen Branch.
3. **Halt nur bei echtem Konflikt:** ein Git-Merge-Konflikt **oder** `pruefen.sh
   FAIL > 0`. Dann pausiert der Durchgang an genau dieser Stelle; die bereits
   sauber gemergten Branches bleiben drin.

**Zahl, die zählt:** `FAIL = 0` zwischen je zwei Merges; **≥ 2** Branches je Runde.

---

## Regel 2 — 24-Stunden-Merge-Fenster

**Schwelle:** Kein Branch lebt isoliert **länger als 24 h**. Was binnen 24 h nicht
abnahmereif ist (Regel 3 erfüllt), wird trotzdem gemergt — aber **hinter einem
Feature-Flag mit Default = AUS**, statt weiter isoliert zu altern.

**Mechanismus (erzwingend):**
1. Stichtag = erster Commit des Branches. Alter **> 24 h** ⇒ der Branch MUSS im
   nächsten Sammel-Merge-Durchgang landen (reif → normal; unreif → Flag aus).
2. Feature-Flag = ein Schalter (Query-Param/`balance.ts`-Konstante/Env), der das
   Unreife zur Laufzeit standardmäßig **deaktiviert** lässt; der Code ist gemergt
   und CI-geprüft, aber nicht sichtbar. So kollidiert nichts mehr über Tage.
3. Grund für genau 24 h: deckelt die gemessenen **18–22 h** Leerlauf knapp
   darüber, ohne Tagesrhythmus zu erzwingen.

**Zahl, die zählt:** **24 h** maximale Isolation; Flag-Default **AUS**.

---

## Regel 3 — Paarweise Abnahme vor Ticro

**Schwelle:** Bevor etwas zu Ticro geht, nimmt **GENAU 1** Schwester-Instanz
(**≠** Autor-Instanz) den Beleg ab und meldet grün: `pruefen.sh` **FAIL = 0**
**UND** Kritiker **0 Befunde**. Erst dann landet es auf Ticros Tisch.

**Mechanismus (erzwingend):**
1. Abnahme-Artefakt = `proof/STATUS.md` (Werkstück 2): die Schwester-Instanz
   prüft die Galerie (Gate-Zeilen grün, Bilder echt), nicht den Quellcode-Diff
   allein.
2. Kritiker-Pflicht aus `docs/LOOP-BLAUPAUSE.md`: Abschluss erst bei **0**
   Kritiker-Befunden. Die Autor-Instanz darf sich **nicht** selbst abnehmen.
3. Der Mensch (Ticro) entscheidet danach **nur** noch, was die Maschine
   prinzipiell nicht sehen kann (Gesamteindruck, Geschmack, offene Entscheidungen
   aus `docs/ENTSCHEIDUNGEN.md`).

**Zahl, die zählt:** **1** abnehmende Schwester-Instanz; **0** Kritiker-Befunde;
`pruefen.sh` **FAIL = 0**.

---

_Reihenfolge der Wirkung: Regel 1 bündelt, Regel 2 begrenzt die Alterung, Regel 3
hält den Menschen aus allem heraus, was eine zweite Instanz sehen kann. H1
(`ci-fast`) ist die technische Vorbedingung für Regel 1._
