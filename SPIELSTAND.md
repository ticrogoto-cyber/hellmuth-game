# SPIELSTAND

Stand: 2026-07-05

Dieses Dokument ist die Arbeitsgrundlage fuer `ticrogoto-cyber/hellmuth-game`. Es soll verhindern, dass alte, verworfene oder repo-fremde Inhalte wieder in das Spiel gemischt werden.

## Eine Wahrheit

- Zielrepo fuer die weitere Spielentwicklung: `ticrogoto-cyber/hellmuth-game`.
- Zielbranch fuer die Konsolidierung: `main`.
- Quellrepo fuer alte Branches: `ticrogoto-cyber/Higgsfield-`.
- Aktuelle Fraktionen: `HELLMUTH` und `MODERAT`.
- Alte Fraktionsnamen wie `generik` oder `klarheit` duerfen nicht wieder als Spielkonzept eingefuehrt werden. Sie duerfen nur als historische Hinweise in Altmaterial auftauchen.

## Was localhost bedeutet

`localhost` liest nicht direkt GitHub. `localhost` zeigt immer das Projekt, aus dessen Arbeitskopie ein Entwicklungsserver gestartet wurde.

Wenn also ein Browser `http://localhost:...` oeffnet, kommt das Spiel aus genau dem Ordner oder der Cloud-Arbeitsumgebung, in der der Vite-Server laeuft. Damit wirklich `hellmuth-game` getestet wird, muss dieser Server aus `ticrogoto-cyber/hellmuth-game` gestartet sein, nicht aus `Higgsfield-` oder einem alten Ordner.

Praktische Konsequenz:

- GitHub ist die Quelle der Wahrheit.
- Der Testserver muss aus genau diesem Repo/Branch laufen.
- Wenn ein Agent GitHub aendert und die Aenderung sofort im Spiel sichtbar ist, dann laeuft der Testserver in einer Arbeitsumgebung, die genau diesen Stand ausgecheckt oder aktualisiert hat.
- Der Browser kann ohne so eine Arbeitsumgebung nicht magisch den neuesten GitHub-Stand als `localhost` anzeigen.

## Actions-Regel

Waehrend der Konsolidierung werden keine neuen GitHub-Actions-Workflows angelegt.

Grund: Jeder fehlerhafte Workflow erzeugt rote Kreuze und E-Mails, obwohl dadurch am Spiel nicht unbedingt etwas kaputt ist. Erst wenn der konsolidierte Spielstand klar ist, wird ein einziger, einfacher CI-Workflow angelegt, und nur nach bewusster Entscheidung.

Gewuenschter spaeterer CI-Umfang:

- `npm install`
- `npx tsc --noEmit`
- `npm run build`

Aktueller Stand am 2026-07-05:

- Im Zielrepo wurde keine aktive `.github/workflows/`-Struktur gefunden.
- Alte fehlgeschlagene Actions-Laeufe koennen in GitHub sichtbar bleiben. Das ist Historie, kein aktiver neuer Fehler.

## Konsolidierungsregel

Aus `Higgsfield-` wird nichts blind gemergt.

Jeder Fund wird in eine der folgenden Gruppen eingeordnet:

1. Bereits enthalten.
2. Wertvoll, aber nur selektiv zu portieren.
3. Alt/ueberholt und nicht wieder einzufuehren.
4. Repo-fremd oder nicht spielrelevant.

Die aktuelle Branch-Uebersicht steht in `KONSOLIDIERUNG.md`.

## Aktuelle offene Punkte

Diese Punkte sind noch nicht als erledigt zu betrachten:

- Fonts/Schriftarten sind im Zielrepo noch nicht als lokale Assets sichtbar. `index.html` nutzt aktuell Google Fonts fuer Barlow Condensed.
- Die wichtigen `solutions/`-Rechercheergebnisse aus `Higgsfield-` sind noch nicht konsolidiert.
- Apothekenhaus-Iso-Sprites und Metadata aus alten Branches sind noch nicht sauber in das aktuelle Vite/TypeScript-Projekt uebernommen.
- Einige HUD-/VFX-/Asset-Branches enthalten potentiell wertvolle Einzelteile, duerfen aber nicht als ganze Branches gemergt werden.
- Es fehlt noch eine fuer Menschen sofort sichtbare Kennzeichnung im Spiel, aus welchem Repo/Commit der laufende Teststand kommt.

## Arbeitsregeln fuer weitere Agenten

- Nicht auf dem lokalen Rechner des Nutzers klonen, installieren oder Dateien aendern, ausser der Nutzer verlangt das ausdruecklich.
- Repo-Aenderungen bevorzugt ueber GitHub-Connector/API vornehmen.
- Keine temporaeren Workflows anlegen, um Analyse oder Tests auszufuehren.
- Keine alten Projektlayouts (`hellmuth-game/` JS/vendor-Prototyp aus `Higgsfield-`) ueber das aktuelle Vite/TypeScript-Projekt kopieren.
- Keine `node_modules/`, `dist/`, `proof/` oder `proof3d/` importieren.
- Jede uebernommene Datei muss begruendet sein: Quelle, Zweck, Zielpfad.
- Nach jedem Konsolidierungsschritt `ZUSTAND.md` oder ein passendes Dokument aktualisieren.

## Naechste sinnvolle Reihenfolge

1. Lokale Fonts/Schriftarten im Quellmaterial suchen und in `hellmuth-game` sauber einordnen.
2. `solutions/`-Recherche aus `Higgsfield-` inventarisieren und entscheiden, was in `docs/solutions/` gehoert.
3. Apothekenhaus-Iso-Sprites/Metadata selektiv portieren.
4. HUD-/VFX-Kandidaten einzeln gegen den aktuellen Stand pruefen.
5. Sichtbare Build-/Repo-Kennung ins Spiel einbauen, damit beim Testen klar ist, welcher Stand laeuft.
6. Erst danach einen einfachen, stabilen CI-Workflow bewusst einfuehren.
