# HELLMUTH — Blueprint V3: HUD-Komponentensystem und Karteneditor

Erweitert Blueprint V2. Mechanik, Einheiten-Pipeline, Effekt-Architektur und alle Fraktions-/Asset-Gesetze gelten unverändert. V3 ERSETZT zwei Teile von V2: den Megatextur-Kartenweg (V2 §5.1 in der geänderten Fassung) und den bildbasierten HUD-Ansatz (Auftrag §7). Code trägt das in DIRECTION.md ein. Bei Konflikt gilt V3.

## 0. Die Lehre, die V3 erzwingt

Drei Anläufe sind am selben Muster gescheitert: Versuch 1 (Sticker-Assets), die Megatextur (unkontrollierbares Riesenbild), das generierte Voll-HUD (nicht responsiv, nicht fraktionsidentisch). Jedes Mal wurde ein monolithisches Bild verlangt, wo ein System gebraucht wird. Daraus das Gesetz von V3:

> **Kein Bild ist je größer als ein Baustein. Struktur, Layout und Verhalten leben ausschließlich in Code und Daten. Generierte Kunst liefert nur kleine, austauschbare, fraktionsskinnbare Teile.**

So haben They Are Billions und Warcraft 2 ihre HUDs und Karten gebaut. Claude Code plus Subagenten sind das Entwicklerteam, dieses Dokument ist ihr Pflichtenheft.

---

# TEIL I — HUD V3 (They-Are-Billions-Schema)

## 1.1 Slot-Gesetz V3

Eine durchgehende untere Leiste über die volle Bildbreite, Elemente von links nach rechts. Referenz ist der TAB-Screenshot (liegt im Repo als `docs/ref/tab-hud.png` abzulegen). Richtwerte bei 16:9, Feinjustierung per Figma-Mock vor Implementierung:

| Slot | Breite | Inhalt |
|---|---|---|
| Minimap | ~13vw (Kartenfläche quadratisch, ragt über die Leiste hinaus, gesamt ~26vh) | Live-Karte, Seitenbuttons |
| Emblem | ~11vw | Fraktionsemblem + Claim (ersetzt TABs Uhr/Play-Panel) |
| Einheitenkarte | ~36vw | Porträt, Name, Stats, Effekte |
| Befehlsraster | ~22vw | 4×2 Buttons, kontextsensitiv |
| Ressourcen-Panel | ~18vw | Ressourcen + Bevölkerung, vertikal gestapelt wie TAB rechts |
| Leistenhöhe | ~22vh | Sockel der Leiste bündig am unteren Rand, null Margin |

Oben bleibt der Bildschirm frei bis auf das kleine Menü/Pause-Panel oben rechts (~7vw, bündig). Die Ressourcen wandern damit aus der oberen Mitte in die Leiste, das obere Ressourcenband entfällt.

Slots sind fraktionsunabhängiges Gesetz in CSS (vw/vh, keine Bildmaße). Beide Fraktionen identisch, nur die Haut wechselt.

## 1.2 Bausteinkasten statt Paneele

Die bereinigten Paneele werden nicht mehr als Ganzes verwendet, sondern als **Steinbruch**. Code extrahiert daraus pro Fraktion einen Bausteinkasten:

- `border_h.png` / `border_v.png` — horizontale/vertikale Rahmenleiste, kachelbar (aus geraden Rahmenstücken der Paneele geschnitten)
- `corner_tl/tr/bl/br.png` — vier Eckornamente
- `corner_cut.png` — Schrägkante (für Trapez-/Parallelogrammformen wie Emblem und Ressourcenleiste)
- `divider_h.png` / `divider_v.png` — Trennlinien mit Ornament-Mitte
- `backdrop.png` — mattes Panel-Schwarz mit Screentone, kachelbar (aus einer leeren Innenfläche)
- `cell.png` — Befehlsbutton-Zelle (Rahmen, leer)
- `glow_edge.png` — die Leuchtkante (MODERAT-Magenta-Glow bzw. HELLMUTH-Goldlinie) als separater Streifen für CSS-Schatten-Nachbau

Jedes HUD-Panel wird im DOM aus diesen Teilen komponiert (CSS border-image / nine-slice / Pseudoelemente für Ecken). Konsequenzen, die alles Bisherige vereinfachen:
1. Die Zonen-JSON entfällt ersatzlos. Inhalte sind DOM-Kinder der Panels und positionieren sich per Flex/Grid selbst.
2. Jede künftige Layoutänderung ist CSS, kein Asset.
3. Fraktionswechsel = Austausch des Bausteinordners, Layout bleibt bitgleich.

Wo der Steinbruch nicht reicht (zu wenig saubere gerade Rahmenstrecke), generiert Ticro gezielt EINEN Streifen bzw. EINE Ecke nach (Spec in Teil III), nie wieder ein Panel.

## 1.3 Figma-Schleife (Abnahme vor Implementierung)

Code legt per Figma-MCP eine Datei »HELLMUTH HUD« an: das Slot-Gesetz als Auto-Layout-Frames (1920×1080), beide Fraktionen als Varianten, Bausteine als Komponenten, daneben der TAB-Referenz-Screenshot. Ticro justiert Maße direkt in Figma, Code liest die finalen Werte zurück und implementiert. Figma ist Abnahmefläche, das CSS ist die Wahrheit.

## 1.4 Reihenfolge HUD

1. **H1** Slot-Gesetz V3 als Debug-Boxen, beide Fraktionen (eine Vorschau, da identisch) gegen TAB-Referenz
2. **H2** Figma-Mock, Ticro-Abnahme der Maße
3. **H3** Bausteinkasten-Extraktion aus den bereinigten Paneelen (mit Sichtprüfung der Kachelbarkeit)
4. **H4** Komponenten-Build in HTML/CSS, Panels aus Bausteinen, Barlow Condensed
5. **H5** Live-Werte (Ressourcen, Einheitenkarte, Uhr) direkt als DOM-Inhalte
6. **H6** Befehlsraster kontextsensitiv aus der Button-Bibliothek (Einzelzellen-Schnitt aus den Originalen bleibt gültig)
7. **H7** Minimap-Live-Rendering in die Kartenfläche

---

# TEIL II — Karteneditor (In-Engine, rudimentär, kreative Kontrolle)

## 2.1 Grundsatzentscheidungen

- **In-Engine, nicht Tiled.** Der Editor ist eine zweite Szene/Route derselben Phaser-App, nutzt denselben Renderer, dieselbe Iso-Mathematik (160×96), dieselben normalisierten Assets, dieselbe Y-Sortierung. Was der Editor zeigt, IST das Spiel. Werkzeugleisten als HTML neben dem Canvas, gleiche Technik wie das HUD.
- **Die Karte ist Daten, das Bild ist Fassade.** Ein JSON-Format `map.hellmuth.json`: Splat-Layer (Terrain-Gewichte pro Zelle), Doodad-Liste (Typ, Position, Variante, Spiegelung), Wasser-Layer, Ressourcen/Vorkommen, Spawnpunkte, Kollisions-Overrides, Metadaten. Das Spiel lädt exakt dieses Format, kein Importer, keine Übersetzung.
- **Megatextur-Erbe**: Chunk-Renderer und Kollisionsmasken-Import bleiben im Code (nützlich fürs Backdrop-Compositing und als Fallback), werden aber nicht mehr als Autorenweg verwendet.

## 2.2 Terrain als Splat-System (der Pinsel-Kern)

Terrainmalen funktioniert über Gewichtsmischung, nicht über diskrete Kacheltypen:

- Pro Bodentyp existiert eine nahtlose Textur (die drei abgenommenen Kacheln NEUTRAL/HELLMUTH/MODERAT sind ab sofort Pinsel Nummer 1 bis 3).
- Jede Zelle hält Gewichte pro Bodentyp, der Pinsel (Größe, Härte, Deckkraft einstellbar) erhöht das Gewicht des aktiven Typs, weiche Übergänge entstehen aus der Mischung.
- Die Übergangskanten werden mit **prozeduralen Noise-Masken** gebrochen (Code generiert sie per Skript, kostet null KREA-Punkte), damit keine glatten Verläufe entstehen, sondern die organisch ausgefransten Ränder des Zielstils.
- Gerendert wird das Komposit in Boden-Chunks unter der Sprite-Ebene (vorhandener Chunk-Renderer).

Damit ist »unebene Texturen malen« sofort möglich, mit vorhandenem Material.

## 2.3 Werkzeuge (Phase 1, rudimentär aber vollständig)

1. **Terrain-Pinsel** — Bodentyp wählen, malen, Größe/Härte/Deckkraft, Radierer = Grundtyp malen
2. **Wasser-Pinsel** — eigener Layer: Wassertextur + animierter Shimmer-Overlay (Engine, additive Scroll-Textur), Ufer entsteht automatisch als Splat-Übergang plus prozeduraler Ufer-Decalstreu. Flüsse = mit schmalem Pinsel gezogene Wasserpfade. Wasserzellen setzen Kollision automatisch.
3. **Doodad-Pinsel** — Palette aus allen normalisierten Doodads (Bäume, Felsen, Streuobjekte). Zwei Modi: Einzelplatzierung (Klick, mit Zufallsvariante/-spiegelung/-skalierung ±10 %) und Streumodus (Dichte-Pinsel: Wälder malen = Baum-Doodads mit einstellbarer Dichte und Jitter streuen, plus automatisches Laubboden-Decal unter dichten Clustern). Doodads blockieren Kollision gemäß Footprint, Y-Sortierung live sichtbar.
4. **Decal-Stempel** — vorhandene Decal-Sets (Risse, Kiesel, Moos, Sirup) einzeln stempeln, Zufallsrotation
5. **Vorkommen & Spawns** — Hain/Quelle/Destillat platzieren (mit Fade-Tellern), Spielerstartpunkte 1/2, Fraktionszuordnung
6. **Kollisions-Pinsel** — Overlay-Ansicht (begehbar/blockiert/Wasser/Sirup-Zone), automatische Ableitung aus Terrain+Doodads, manueller Override-Pinsel
7. **Undo/Redo, Speichern/Laden, »Diese Karte spielen«** — der Testknopf lädt die Karte direkt in die Spielszene

## 2.4 Phase 2 (nach Phase-1-Abnahme, nicht vorher)

- **Klippen-Werkzeug**: Kantenzug-Tool, das aus einem Klippen-Tileset (Spec in Teil III) Plateauränder legt, mit Rampenstück. Bis dahin gilt: Höhenwirkung über Felsnadel-/Felskanten-Doodads, Kartenrand über dichte Rand-Doodad-Streu.
- Trigger-Regionen, benannte Zonen (für Missionen)
- Spiegel-/Symmetriewerkzeug für faire 1v1-Karten

## 2.5 Reihenfolge Editor

1. **E1** Kartenformat + Loader im Spiel (leere Karte spielbar)
2. **E2** Editor-Shell (Route, Viewport = Spielrenderer, HTML-Werkzeugleiste, Kamera-Pan/Zoom)
3. **E3** Splat-Terrain-Pinsel + prozedurale Übergangsmasken (mit den drei vorhandenen Texturen)
4. **E4** Doodad-Pinsel beide Modi + Kollisionsableitung
5. **E5** Wasser-Pinsel + Shimmer
6. **E6** Vorkommen/Spawns/Kollisions-Override
7. **E7** Undo/Speichern/Laden/Testmodus
8. Abnahme durch Ticro: eine komplette spielbare Karte selbst gebaut, dann Phase 2

---

# TEIL III — Asset-Spezifikation für die Pinsel (KREA, wenn Abo erneuert)

Phase 1 startet OHNE neue Generierung. Folgendes wird gebraucht, sobald Punkte da sind, alles kleine Bausteine, Master-Blöcke aus ASSET-PROMPTS-KREA-V2.md gelten:

**Terrain-Texturen (nahtlos, 1024×1024, je 2 Varianten, Prompt-Schema = vorhandener Bodenkachel-Prompt mit getauschtem Inhaltssatz):**
1. Wasser: `still dark teal-grey water surface, subtle painted ripples, NO shore, NO objects, seamless` (Shimmer macht die Engine)
2. Trockener Flussbett-Kies: `dry riverbed gravel and smoothed stones, grey-beige`
3. Pfad/Erde verdichtet: `compacted bare footpath earth, slightly darker than loam`
4. Totes Schlackefeld (MODERAT-Rand): `black industrial slag and cinder field`

**Doodad-Nachschub (MASTER-NATUR, je 768×768):** 2 weitere Baumvarianten, 1 Buschgruppe, 1 Schilf/Ufergras, 2 Felsvarianten. Mehr nicht, der Streumodus erzeugt Vielfalt aus Varianten+Spiegelung+Skalierung.

**Klippen-Tileset (Phase 2, MASTER-NATUR, exakter 36,87°-Winkel, jedes Stück einzeln auf Grau):** 4 Kantenstücke (NO/NW/SO/SW), 4 Außenecken, 4 Innenecken, 1 Rampe pro Himmelsrichtungspaar, alle auf 160×96-Fußraster, Höhe eine Klippenstufe ≈ 1 Tile-Höhe. Insgesamt ~14 Sprites. Vor Generierung legt Code ein maßhaltiges Drahtgitter-Template als Formreferenz vor.

**HUD-Nachschub (nur falls Steinbruch-Extraktion Lücken meldet):** je Fraktion 1 langer gerader Rahmenstreifen horizontal `a long straight ornamental game UI border strip, [moss-green and gold / hot magenta] double line on matte black, seamless horizontally, no corners, no text` und 1 Eckornament-Quartett.

---

# TEIL IV — Arbeitsteilung und Reihenfolge gesamt

- Code beginnt parallel mit **H1+H2** (Slot-Gesetz + Figma-Mock, klein) und **E1+E2** (Kartenformat + Editor-Shell, der eigentliche Brocken). Subagenten-Aufteilung steht ihm frei, die Schnittstellen sind dieses Dokument.
- Ticro: Figma-Abnahme der HUD-Maße, danach erste Editor-Sitzung mit vorhandenen Pinseln, KREA-Liste aus Teil III erst nach Abo-Erneuerung.
- Unverändert offen und weiterhin VOR allem anderen sinnvoll: Hellmuth-GLB + walk.fbx. Der Editor baut Karten, auf denen jemand laufen können muss.
