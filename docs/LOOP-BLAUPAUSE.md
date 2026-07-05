# LOOP-BLAUPAUSE — Autonomer Arbeitsauftrag mit Gate und Kritiker

Werkzeug für Aufträge an Claude Code, die ohne menschliche Zwischenrunden bis zum
fertigen Ergebnis laufen sollen. Entstanden im HELLMUTH-Projekt (HUD-Endmontage,
vier Kritiker-Runden bis null Befunde). Funktioniert für jede Aufgabe, deren
Ergebnis sich gegen eine Referenz prüfen lässt.

---

## Wann dieses Werkzeug, wann nicht

EINSETZEN, wenn alle drei Bedingungen erfüllt sind:
1. Es existiert eine verbindliche Referenz (Vorlage, Spec, Testdaten, Beispiel).
2. Das Ergebnis lässt sich maschinell oder per Subagent gegen die Referenz prüfen.
3. Der Auftrag ist groß genug, dass Zwischenrunden mit dem Menschen teurer sind
   als ein autonomer Lauf (Faustregel: mehr als drei erwartbare Korrekturschleifen).

NICHT einsetzen für: Entscheidungen, die Geschmack oder Strategie verlangen
(dort Varianten bauen lassen und Mensch wählen lassen), Aufgaben ohne prüfbare
Referenz, Kleinkram unter einer Stunde Arbeit.

---

## Die fünf Bausteine (alle Pflicht, Reihenfolge fest)

### 1. ERSETZUNGSKLAUSEL + LOOP-BEFEHL
Der Auftrag beginnt immer mit drei Festlegungen:
- Alle bisherigen Aufträge zum Thema sind ersetzt (verhindert Vermischung).
- Arbeit im Loop, Meldung erst bei Gate-grün.
- Kein Zwischenbericht, keine Rückfrage, kein Abschlussbericht vor Gate-grün.

Formulierung:
> ARBEITSAUFTRAG [NAME]. Alle bisherigen Aufträge zu [THEMA] sind hiermit
> ersetzt. Du arbeitest im Loop und meldest dich erst wieder, wenn das
> Abnahme-Gate grün ist. Kein Zwischenbericht, keine Rückfrage, kein
> Abschlussbericht vor Gate-grün.

### 2. MASSREFERENZ (die Wahrheitsquelle)
Genau EINE verbindliche Referenz benennen, mit Pfad im Repo. Bei mehreren
Quellen die Rangfolge festlegen. Kernsatz aus dem HELLMUTH-Fall, der den
entscheidenden Fehler verhindert:

> Bei jeder Abweichung zwischen [abgeleiteter Spec/Tabelle] und [Original-
> Referenz] gewinnt das Original, denn die Spec ist eine Abschrift und
> Abschriften können Fehler enthalten. Vermiss die Referenz selbst neu und
> korrigiere die Abschrift mit Protokoll der Korrekturen.

Lehre dahinter: Ein Prüfer, der gegen eine fehlerhafte Abschrift prüft, ist
grün und das Ergebnis trotzdem falsch. Die Wahrheit liegt immer im Original.

### 3. SCOPE (final / Platzhalter / ausgenommen)
Drei Listen, keine Grauzonen:
- WAS FINAL ZU BAUEN IST — abgeschlossene, abnahmefähige Teile.
- WAS PLATZHALTER BLEIBT — Geometrie/Struktur final, Inhalt kommt später.
  Platzhalter werden gebaut und markiert, nie übersprungen.
- WAS AUSGENOMMEN IST — wartet auf externe Zulieferung, mit Begründung.

### 4. DAS GATE (maschinelle Prüfung)
Der Auftrag verlangt, dass Code ZUERST den Prüfstand baut, DANN gegen ihn
arbeitet. Das Gate muss das gerenderte/erzeugte ERGEBNIS prüfen, nicht den
Quellcode (Screenshot statt CSS, Output statt Funktion, Datei statt Skript).
Bestandteile:
- Erzeugung des Ist-Zustands (z. B. Headless-Render, Testlauf, Export).
- Vergleich gegen die Referenz mit definierter Toleranz (z. B. 2 Pixel,
  exakte Werte, Schwellwerte).
- Zusatzprüfungen gegen bekannte Betrugsmuster (z. B. Texturvarianz gegen
  Flachfarben-Platzhalter, Nicht-Leere gegen leere Dateien).
- Jeder rote Punkt des Reports ist der nächste Arbeitsschritt. Wiederholen
  bis Report leer.

### 5. KRITIKER-PFLICHT (adversariale zweite Instanz)
Vor jeder Fertig-Deklaration beauftragt Code einen Subagenten als Kritiker:
- Der Kritiker erhält DENSELBEN Auftragstext und DIESELBE Referenz.
- Er sucht aktiv nach Abweichungen UND nach Qualitätsmängeln, die das Gate
  nicht messen kann (Hässlichkeit, Nahtfehler, Inkonsistenz).
- Er bekommt einen Qualitätsanker von außen (z. B. „Niveau von [bestes
  Beispiel der Gattung] oder besser").
- Abschluss erst bei: Kritiker meldet KEINE BEFUNDE **UND** Gate grün.
- Der Loop Kritiker→Fix→Kritiker läuft so oft wie nötig (HELLMUTH: 4 Runden).

Ergänzung Beschaffungspflicht:
> Fehlt dir ein Werkzeug oder Wissen, beschaffst du es dir selbst oder per
> Subagent, statt den Punkt zu überspringen.

---

## Optionale Bausteine

### RECHERCHE-SUBAGENTS (bei Qualitäts-/Geschmacksfragen)
Parallel zum Bauen recherchieren Subagents, was die Gattung gut macht
(z. B. „warum wirkt das Vorbild-HUD"), und destillieren Prinzipien, die der
Kritiker als Prüfkriterien übernimmt. So wird Geschmack in benennbare
Regeln übersetzt, bevor gebaut wird.

### VARIANTEN-MODUS (wenn der Mensch wählen soll)
Bei nicht messbaren Entscheidungen baut Code N unterscheidbare Varianten
hinter einem Schalter (z. B. URL-Parameter), jede mit einem Satz Begründung
ihrer Logik. Das Gate prüft alle Varianten auf das harte Fundament, der
Kritiker auf handwerkliche Sauberkeit, die WAHL trifft der Mensch. Varianten
müssen sich strukturell unterscheiden, nicht nur in Parametern.

### EHRLICHE RESIDUEN
Der Abschlussbericht enthält pflichtgemäß eine Liste der bewussten Lücken,
Workarounds und Umgebungsgrenzen (z. B. „Screenshots ohne Spielwelt, weil
Capture crasht"). Eine gemeldete Lücke ist ein Arbeitsposten, eine
versteckte eine Falle.

---

## Abnahme durch den Menschen (nach Gate-grün)
Der Mensch prüft NUR, was die Maschine prinzipiell nicht sehen kann:
- Gesamteindruck im echten Kontext (nicht im Prüfstand).
- Die Stellen, an denen der Kritiker am häufigsten Fehler fand.
- Stichprobe der Kernfunktion.
Meldung in einem Satz („abgenommen") oder als Stichwortliste der Befunde,
die der nächste Loop frisst.

---

## Vorlage zum Ausfüllen

> ARBEITSAUFTRAG [NAME]. Alle bisherigen Aufträge zu [THEMA] sind hiermit
> ersetzt. Du arbeitest im Loop und meldest dich erst wieder, wenn das
> Abnahme-Gate grün ist. Kein Zwischenbericht, keine Rückfrage, kein
> Abschlussbericht vor Gate-grün.
>
> MASSREFERENZ. [Pfad(e), Format, Umrechnung]. Bei Abweichung zwischen
> Abschrift und Original gewinnt das Original; neu vermessen, Abschrift
> korrigieren, Korrekturen protokollieren.
>
> WAS FINAL ZU BAUEN IST. [Liste]
> WAS PLATZHALTER BLEIBT. [Liste, mit „Geometrie final, Inhalt Stufe X"]
> WAS AUSGENOMMEN IST. [Liste, mit Grund]
>
> DER LOOP. Zuerst Prüfstand: [wie wird der Ist-Zustand erzeugt], Vergleich
> gegen die Referenz [Toleranz], Zusatzprüfungen [Betrugsmuster]. Jeder rote
> Punkt ist der nächste Arbeitsschritt, wiederholen bis Report leer.
>
> [Optional RECHERCHE: N Subagents recherchieren parallel [Frage] und
> destillieren Prüfkriterien für den Kritiker.]
>
> [Optional VARIANTEN: Baue [N] strukturell unterschiedliche Varianten
> hinter [Schalter], je ein Satz Begründung; die Wahl trifft der Mensch.]
>
> KRITIKER-PFLICHT. Vor jeder Fertig-Deklaration Subagent mit diesem
> Auftragstext und der Referenz, adversarial, Qualitätsanker [Vorbild].
> Abschluss erst bei KEINE BEFUNDE und Gate grün. Abschlussbericht mit
> [Belegen] und ehrlichen Residuen. Fehlendes Werkzeug/Wissen wird
> beschafft, nie übersprungen.
