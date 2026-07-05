# asset-spec.md — HELLMUTH Master-Asset-Spezifikation (Gesetz)

> Verbindlich für **jedes** Asset, egal ob aus OpenAI, KREA oder Blender.
> Kein Asset gelangt ohne Spec-Konformität **und** Normalisierungspass
> (`tools/normalize_asset.py`) ins Spiel. Dieses Dokument beendet den Grund,
> an dem Versuch 1 (nifty) gescheitert ist: fehlende gemeinsame Spezifikation.

Quelle: Fable Blueprint V2 + VISUAL-TARGET-ANWEISUNG (AP1–AP7). Stilreferenz =
die drei Ziel-Screenshots (HELLMUTH, MODERAT, HELLMUTH-Aufbau).

---

## 1. Projektion & Geometrie

**Kamera vs. Bildschirm-Raster, strikt getrennt** (das war die CODEX-Falle, hier verbindlich):

| Größe | Wert | Gilt für |
|---|---|---|
| **Blender-Render-Kamera** | **Elevation 36,87° (exakt sin θ = 0,6), 45° Yaw, orthographic, Look-at** | Einheiten-Render aus 3D (render_unit.py) |
| **Bildschirm-Tile-Raster** | **5:3, Tile 160 × 96 px** bei Zoom 1.0 | 2D-Bildgenerierung (Gebäude/Boden/Decals/UI), Spritesheet-Komposition, Iso-Mathematik |
| **2D-Tile-Kantenwinkel** | `atan(0.6) ≈ 30,96°` | nur Bild-Komposition, NIE die Kamera |

Referenz ist **They Are Billions**: Kamera steiler als klassisches 2:1, mehr
Dachfläche sichtbar, übersichtlicherer Blick. Die Zielbilder definieren Stil und
Palette, nicht den Kamerawinkel. Herleitung: Bodentile projiziert zu
Breite:Höhe = `1 : sin θ`; Ziel 5:3 → `sin θ = 0,6` → **θ = 36,87°** Elevation,
Tile **160 × 96 px**.

**Verbotene Kamerawinkel (Ausschuss, kein Asset und kein Frame wird akzeptiert):**
- **26,57°** (`atan 0,5`) — ein 2D-Kantenwinkel des alten 2:1-Rasters, nie eine
  Kameraelevation. (Bleibt als Warnung bestehen.)
- **30°** — klassisches 2:1, zu flach, zu wenig Dachfläche.

**Tile-Größe (einmal festlegen, nie wieder anfassen):**
- 1 Bodentile = **160 × 96 px** bei Zoom 1.0.
- Jedes Asset deklariert seinen **Footprint in Tiles** im Manifest. Nach
  Generierung wird das Asset per Skript auf seine **Footprint-Breite** in Pixel
  normalisiert (`footprint_tiles[0] * 160`). Damit ist Skala **erzwungen**.

**Pivot:** Boden-Mittelpunkt des Footprints, normalisiert (0..1) im Atlas-JSON.
Bei aufragenden Objekten liegt der Pivot tief im Bild (z. B. y ≈ 0.85).

## 2. Licht & Schatten (eingebacken, kein Echtzeit-Licht)

- **Lichtrichtung: oben links**, in jedes Asset eingebacken.
- **Kontaktschatten: weicher, leicht ovaler Schatten nach unten rechts**, in
  jedes Boden-Asset eingebacken (Gebäude, Baum, Fels, Doodad). Das verankert
  Objekte und beendet den Sticker-Effekt.
- **Freistellen bewahrt den Kontaktschatten.** Der Normalisierungspass entfernt
  nur den flächigen Generierungs-Hintergrund (z. B. Grau), nie den eingebackenen
  Schatten. Der Schatten ist Spec, keine Verunreinigung; er verankert das Objekt
  am Boden und wird als halbtransparenter Alpha-Bereich erhalten.
- Blender-Render: **World-Licht 5.0, kein Sun-Licht** (verbindliches Template).
- Zur Laufzeit **kein Szenenlicht** — nur additive Glow-Sprites (Effekte).

## 3. Palette & Grading

- **Grundwelt desaturiert:** Khaki, Sand, ausgeblichene Grüntöne, Stein.
- **Gesättigte Farben sind reserviert** für: HELLMUTH Gold/Grün-Akzente,
  MODERAT-Magenta, Blut/Sirup, Kampfeffekte, Lichter. Sonst nichts.
- **HELLMUTH:** heller Grund (Pergament/Sand/Moos), grün/gold Akzente.
- **MODERAT:** dunkler Industrieboden (Rost/Schmutz/Platten), Magenta Akzent.

**Fraktions-Embleme (Sigille/Banner):**
- **HELLMUTH-Emblem:** ein stilisiertes **Brennnesselblatt mit zwei kleinen
  Flügeln** — ein herzförmiges Blatt mit spitzem Ende und fein gezähntem Rand.
  **Kein gefingertes/siebenfingriges Cannabisblatt** (HELLMUTH ist ein
  Anti-Rausch-Orden; ein Rauschdrogen-Blatt ist thematisch verkehrt).
- **MODERAT-Emblem:** eine grinsende, bestachelte Totenkopf-Sonne, auf Tanks
  und Rüstung gestempelt.
- Volle Definition in `docs/ASSET-PROMPTS-KREA-V2.md` (Fraktionspaletten) und
  `docs/NAMING_CANON.md`.
- **Normalisierungspass (Pflicht):** `tools/normalize_asset.py` schickt jedes
  eingehende Asset durch dieselbe Behandlung (einheitliche Entsättigung,
  Tonkurve, dezenter Split-Tone). Das ist die technische Garantie für »aus einem
  Guss«, unabhängig davon, wie die Generatoren driften.

## 4. Formate & Ordner

```
hellmuth/assets/
  source/                # Roh-Eingang (FBX, roh generierte PNGs) — nie ins Spiel
  sprites/
    buildings/           # gemalte Gebaeude-Sprites (PNG RGBA)
    units/               # Spritesheets + JSON-Atlas (aus render_unit.py)
    effects/             # Rauch/Splatter/Glow-Sheets
    ground/              # gekachelte Bodentexturen (4-6 Varianten/Typ)
    ui/                  # HUD-Rahmen, Icons, Porraets
  manifest.json          # je Asset: name, kategorie, footprint_tiles, pivot, datei
```

- Alle Dateinamen `lowercase_snake_case`.
- Bild-Assets: **PNG mit Alpha**, transparenter Hintergrund.
- Atlas: Phaser-kompatibles JSON, Frame-Schema `unit_clip_dir_frame`.

## 5. Manifest-Eintrag (Schema)

```json
{
  "name": "apotheke",
  "category": "buildings",
  "faction": "hellmuth",
  "footprint_tiles": [4, 4],
  "pivot": [0.5, 0.88],
  "file": "sprites/buildings/apotheke.png",
  "normalized": true
}
```

## 6. Definition of Done pro Asset

1. Aus dem passenden Prompt-Template (`docs/ASSET-PROMPTS-KREA-V2.md`) bzw. dem Blender-Template erzeugt.
2. Durch `tools/normalize_asset.py` gelaufen (`normalized: true`).
3. Auf Footprint-Breite skaliert, Pivot gesetzt, Kontaktschatten vorhanden.
4. Transparenter Hintergrund, Licht von oben links.
5. Im `manifest.json` eingetragen.
