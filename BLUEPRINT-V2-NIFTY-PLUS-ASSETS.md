# HELLMUTH — Blueprint V2: Entscheidung und verbindlicher Bauplan

## 0. Antwort auf deine Frage

**Option 1. NIFTY plus kohärente Assets.** Das komplette Phaser-Spiel bleibt, jede Mechanik bleibt, die Babylon-Linie wird eingefroren und archiviert. Deine Schlussfolgerung war korrekt, sie wird hiermit bestätigt und verbindlich.

Option 2 erzeugt dasselbe Bild mit mehr Aufwand und mehr Risiko. Option 3 hast du selbst für tot erklärt. Es gibt keinen Diskussionsbedarf mehr, es gibt nur noch Ausführung.

Eine Sache nimmst du aus der Babylon-Phase mit: das Blender-Template (orthografische Kamera, World-Licht 5.0, kein Sun-Licht). Es wird das Fundament der Sprite-Render-Pipeline. Der Umweg war teuer, aber nicht wertlos.

## 1. Warum Versuch 1 wirklich gescheitert ist

Das muss präzise verstanden werden, sonst wiederholt sich der Fehler in Phaser ein zweites Mal. Der NIFTY-Build ist **nicht** an der Engine gescheitert. Er ist an zwei Dingen gescheitert, die beide nichts mit Phaser zu tun haben:

1. **Es gab keine verbindliche Asset-Spezifikation.** Jedes Asset wurde einzeln generiert, ohne gemeinsamen Winkel, ohne gemeinsame Skala, ohne gemeinsame Palette, ohne gemeinsame Lichtrichtung. Das Ergebnis sieht aus wie Sticker auf Packpapier, weil es genau das ist. Bäume, Felsen und Gebäude stammen erkennbar aus verschiedenen Generierungssitzungen, kleben mit weichen Rändern auf einem leeren Grund und haben keinerlei gemeinsames Bodenverhältnis.
2. **Die Einheiten-Pipeline war manuell.** Hunderte PNGs pro Richtung von Hand aus Blender exportieren ist kein Workflow, das ist Selbstverletzung. Deshalb sind die Einheiten im Screenshot Kreise mit Debug-Labels.

Beide Probleme werden in diesem Blueprint gelöst. Beide Lösungen sind Code, nicht Handarbeit. Das ist der eigentliche Auftrag.

## 2. Architektur (final, nicht verhandelbar)

- **Engine**: Phaser 3 (WebGL-Renderer zwingend), bestehender NIFTY-Code als Basis
- **Sichtbare Ebene**: ausschließlich vorgerenderte/generierte 2D-Sprites und gekachelte gemalte Texturen
- **3D existiert nur offline**: Krea-Modelle + Mixamo-Animationen + Blender dienen einzig dazu, Spritesheets zu **rendern**. Nichts davon läuft zur Laufzeit.
- **HUD**: HTML/CSS-Overlay über dem Canvas, fraktionsgeskinnt (Spezifikation aus VISUAL-TARGET-ANWEISUNG.md, Abschnitt AP7, gilt unverändert)
- **Stilziel**: die beiden Ziel-Screenshots, ergänzt um das Bewegungs- und Effektgefühl von They Are Billions (flüssige Einheiten, leuchtende Lichtakzente, alles wie aus einem Guss)

## 3. Master-Asset-Spezifikation (das fehlende Dokument von Versuch 1)

Erstelle als allererstes Arbeitsprodukt eine Datei `asset-spec.md` im Repo. Sie ist ab dann Gesetz für jedes Asset, egal ob aus OpenAI, Krea oder Blender. Inhalt mindestens:

### 3.1 Geometrie
- Kamerawinkel: orthografisch, Elevation 36,87° (exakt sin θ = 0,6), Rotation 45°, für alle Assets identisch. Steiler als klassisches 2:1, Referenz They Are Billions. Blender-Kamera und Bildgenerierungs-Prompts verwenden denselben Winkel. Warnung: weder 26,57° (das ist der 2D-Kantenwinkel, keine Kamera-Elevation) noch 30° (klassisches 2:1, zu flach) verwenden.
- Tile-Größe: 1 Bodentile = 160×96 px bei Zoom 1 (Verhältnis 5:3, festgelegt, wird nie wieder angefasst)
- Jedes Asset-Manifest deklariert seinen Footprint in Tiles. Nach Generierung wird das Asset per Skript auf seine Footprint-Breite normalisiert. Skala ist damit erzwungen, nicht erhofft.
- Pivot: Boden-Mittelpunkt des Footprints, im Atlas-JSON hinterlegt

### 3.2 Licht und Schatten
- Lichtrichtung: oben links, in jedes Asset eingebacken
- Jedes Boden-Asset (Gebäude, Baum, Fels, Doodad) bringt einen weichen, leicht ovalen Kontaktschatten mit, eingebacken, Richtung unten rechts. Das verankert Objekte am Boden und beendet den Sticker-Effekt.
- Kein Echtzeit-Licht außer additiven Glow-Sprites (siehe 5.3)

### 3.3 Palette und Grading
- Grundwelt desaturiert: Khaki, Sand, ausgeblichene Grüntöne, Stein
- Gesättigte Farben sind reserviert: HELLMUTH-Gold/Grün-Akzente, MODERAT-Magenta, Blut, Kampfeffekte, Lichter
- **Normalisierungspass**: Schreibe ein Batch-Skript (Python/PIL oder ImageMagick), das jedes eingehende Asset durch dieselbe Behandlung schickt — einheitliche LUT/Tonkurve, leichte Entsättigung, identische Kantenbehandlung. Kein Asset gelangt ungefiltert ins Spiel. Dieses Skript ist die technische Garantie für »aus einem Guss«, unabhängig davon, wie sehr die Generatoren driften.

### 3.4 Prompt-Templates
- Erzeuge pro Asset-Kategorie (Gebäude HELLMUTH, Gebäude MODERAT, Vegetation, Felsen, Bodentexturen, Decals, UI-Rahmen) ein fertiges Prompt-Template mit festen Stil-Bausteinen (Winkel, Licht, Palette, Stilreferenz, transparenter Hintergrund, Kontaktschatten) und einer einzigen variablen Stelle für den Asset-Inhalt. Ticro generiert damit über sein OpenAI-Abo, ohne pro Asset Stil-Entscheidungen treffen zu müssen.
- Lege die Templates als `docs/ASSET-PROMPTS-KREA-V2.md` ins Repo.

## 4. Einheiten-Pipeline: vollautomatisch oder gar nicht

Das ist das Herzstück. Kein einziger manueller Blender-Klick mehr.

### 4.1 Headless-Rendering
Schreibe ein Blender-Python-Skript, aufrufbar als

```
blender -b unit-template.blend -P render_unit.py -- \
  --fbx assets/source/helmut_walk.fbx \
  --clip walk --directions 8 --frames 12 --out build/sprites/helmut/
```

Das Skript:
1. lädt das verbindliche Template (Ortho-Kamera, Elevation 36,87°, World-Licht 5.0, kein Sun-Licht)
2. importiert das Mixamo-FBX, normalisiert die Modellhöhe auf einen festen Wert pro Einheitenklasse (Skala erzwingen, siehe 3.1)
3. rotiert das **Modell** in 45°-Schritten (Kamera bleibt fix), für den Helden optional 16 Richtungen
4. setzt `frame_step` so, dass jeder Clip auf das Frame-Budget heruntergerechnet wird
5. rendert PNG-Sequenzen mit transparentem Hintergrund

### 4.2 Frame-Budget (die Lösung des 300-Bilder-Problems)
Die 300 Bilder pro Richtung waren ein Missverständnis, das war die rohe 24-fps-Vollaufnahme. They Are Billions wirkt nicht flüssig wegen irrsinniger Frame-Zahlen, sondern wegen sauberer Abspielrate plus weicher Spielbewegung. Verbindliche Budgets:

- Walk: 8–12 Frames, Loop
- Idle: 6–8 Frames, Loop
- Attack: 8–12 Frames
- Death: 10–15 Frames
- Abspielrate im Spiel: 15–20 fps
- Richtungen: 8 für Standardeinheiten, 16 für den Helden Helmut

Macht pro Standardeinheit grob 300–400 Frames **gesamt**, nicht pro Richtung. Das rendert ein Skript in Minuten.

### 4.3 Atlas-Bau
Zweites Skript: packt die PNG-Sequenzen zu Spritesheets und erzeugt Phaser-kompatible JSON-Atlanten (Frame-Namen nach Schema `unit_clip_dir_frame`), inklusive Pivot und Schatten-Offset. Der Normalisierungspass aus 3.3 läuft auch hier drüber.

### 4.4 Phaser-Seite
- Animations-Registry, die Atlanten automatisch einliest
- Richtungswahl aus dem Bewegungsvektor (8 bzw. 16 Sektoren)
- Positionen als Floats, Rendering subpixelgenau, keinerlei Grid-Snapping der Darstellung. Die Geschmeidigkeit von They Are Billions entsteht hier, in der Bewegung, nicht im Spritesheet.
- Y-sortierte Tiefe für alle Boden-Objekte (eine einzige Sortierfunktion für Einheiten, Gebäude, Doodads)
- Ovaler Schatten-Blob als eigenes Sprite unter jeder Einheit

## 5. Welt und Effekte

### 5.1 Boden
Hauptweg sind drei Unikat-Karten als Megatexturen (NEUTRAL, HELLMUTH, MODERAT) nach ASSET-PROMPTS-KREA-V2.md Abschnitt 6: gebacken wird nur Flaches (Boden, Pfade, Moos, Krusten, Fluss, eingebackene Decals), alles mit Höhe bleibt Sprite mit Y-Sortierung, Ausnahme Kartenrand. Dazu pro Karte eine farbcodierte Kollisionsmaske als zweites PNG, Code rastert sie aufs Tile-Grid und rendert die Karte in GPU-tauglichen Chunks unter der Sprite-Ebene. Das Kachelsystem (4–6 Varianten pro Typ, zufällig rotiert) bleibt als System-Fallback, Minimap-Basis und Prototyping-Grund erhalten und wird nicht weiter ausgebaut. Dynamische Decals (Kampf-Splatter, Bauschmutz, Wracks) bleiben Laufzeit-Sprites, sie lassen sich nicht vorbacken. Der aktuelle Packpapier-Grund verschwindet.

### 5.2 Doodads
Die vorhandenen Baum-, Wald- und Felsen-Assets werden nicht pauschal verworfen, sondern durch den Normalisierungspass geschickt und gegen die Spec geprüft (Skala, Schatten, Palette). Was danach noch herausfällt, wird mit den Prompt-Templates neu generiert.

### 5.3 Der They-Are-Billions-Layer
Drei Dinge erzeugen dort das Gefühl, alle drei sind in Phaser WebGL Standard:
1. **Additive Glow-Sprites** für Lichter, Mündungsfeuer, Energieeffekte (Blend-Mode ADD, weiche radiale Sprites)
2. **Globales Grading** als PostFX-Pipeline: dezenter kühler Stich in den Schatten, warme Lichter, leichte Vignette, Grain unter 8 % Opazität
3. **Projektile, Tracer, Einschlag-Decals** als kurze Sprite-Animationen plus permanente Boden-Decals (MODERAT-Splatter bleibt liegen, er ist Fraktionssignatur)

### 5.4 Aufräumen
- Alle Debug-Labels und schwebenden Textmarker raus aus der Spielwelt. Informationen gehören ins HUD und in Hover-Tooltips.
- Selektion über gemalte Bodenringe, nicht über Text

## 6. Reihenfolge der Arbeitspakete

1. **AP0**: Babylon-Branch einfrieren, NIFTY-Branch reaktivieren, Build lauffähig
2. **AP1**: `asset-spec.md` + `docs/ASSET-PROMPTS-KREA-V2.md` + Normalisierungsskript
3. **AP2**: Blender-Headless-Pipeline (render_unit.py + Atlas-Packer), Proof mit einem einzigen Mixamo-Clip von Helmut
4. **AP3**: Phaser-Integration der Einheiten (Registry, Richtungslogik, Subpixel-Bewegung, Schatten, Y-Sort)
5. **AP4**: Boden + Doodad-Normalisierung
6. **AP5**: Gebäude-Sprites (gegen Dummy-Maße bauen, Austausch = Dateitausch)
7. **AP6**: Effekt-Layer (Glow, Projektile, Decals, Grading)
8. **AP7**: HUD-Vollausbau nach VISUAL-TARGET-ANWEISUNG.md
9. **AP8**: Steam-Packaging (Spec in `docs/DIRECTION.md`). **Wird jetzt NICHT gebaut**, nur dokumentiert. Keine Arbeit daran vor Abschluss von AP3–AP7.

Keine Vorgriffe. AP2 ist der kritische Pfad, weil er das Problem löst, an dem Versuch 1 gestorben ist.

## 7. Abnahmekriterien

1. Helmut läuft in 16 Richtungen flüssig über die Karte, gerendert aus der automatischen Pipeline, ohne dass ein Mensch Blender geöffnet hat
2. Ein zweiter Pipeline-Durchlauf mit einem anderen FBX erzeugt ohne Code-Änderung eine zweite lauffähige Einheit
3. Kein Asset im Frame, das den Normalisierungspass nicht durchlaufen hat
4. Kein Debug-Text in der Spielwelt
5. Boden texturiert, Objekte mit Kontaktschatten, kein Sticker-Effekt im Standbild
6. Side-by-side mit dem Ziel-Screenshot: erkennbar dieselbe Welt
7. Alle NIFTY-Mechaniken (Ausweichen, Kampf, Bauen, Ressourcen, KI, Pause) funktionieren unverändert

## 8. Verbote

- Kein Engine-Wechsel mehr, unter keinem Vorwand
- Keine manuelle Blender-Arbeit als Workflow-Bestandteil
- Kein Asset ohne Spec-Konformität und Normalisierungspass ins Repo
- Keine Mechanik-Refactorings, solange die visuelle Schicht nicht steht. Das Spiel funktioniert. Fass es nicht an.
- Keine neuen Stil-Experimente. Der Stil ist definiert, die Referenzen liegen vor, die Diskussion ist beendet.
