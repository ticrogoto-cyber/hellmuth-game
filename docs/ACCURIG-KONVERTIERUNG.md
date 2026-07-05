# AccuRIG-Konvertierung — Kurzanleitung

Wenn AccuRIG eine 3D-Datei aus KREA mit »This file type is not allowed« ablehnt,
läuft die Datei durch das Werkzeug `tools/convert_for_accurig.py` (H31). Ursache
ist praktisch immer die FBX-Version: KREA liefert **FBX 2020** (v7700), AccuRIG
akzeptiert nur bis **FBX 2018** oder älter. Der Konverter macht einen
Blender-Roundtrip, der zwangsweise **FBX 2014** (v7400) rausschreibt — plus die
Aufräumarbeit, die AccuRIG erwartet.

## Ein Modell konvertieren

```bash
python3 tools/convert_for_accurig.py -- <datei>
```

Beispiel:

```bash
python3 tools/convert_for_accurig.py -- assets/source/units/hellmuth_walk.fbx
```

Ergebnis:

```
OK  hellmuth_walk.fbx -> assets/converted_for_accurig/hellmuth_walk_accurig.fbx (31986 KB)
    - cleanup entfernt: {'ARMATURE': 1}
    - tris=498146 <= 600000, no decimate
```

Die konvertierte Datei liegt im Ordner `assets/converted_for_accurig/`. Diese
öffnest du in AccuRIG.

## Mehrere Modelle auf einmal

Alle unterstützten Dateien in einem Ordner konvertieren:

```bash
python3 tools/convert_for_accurig.py -- --batch assets/source/units
```

Ergebnis mit vier KREA-Dateien: `Sammel: 4 ok, 0 fail von 4.`

## Was der Konverter macht

Pro Datei:

1. Öffnet die Datei in Blender (headless, unsichtbar).
2. Löscht alles außer der Mesh — Kameras, Lampen, Rigs. AccuRIG will die
   Ur-Mesh und riggt selbst.
3. Bei mehreren Meshes: joint sie zu einer (Warnung im Log).
4. Applies Transform (Scale/Rotation/Location).
5. Prüft Polycount. Über 600 000 Triangles → automatisches Decimate (Blender
   Decimate-Modifier) auf 600 000.
6. Exportiert als **FBX 2014 Binary** mit eingebetteten Texturen, Y-Forward,
   Z-Up, Copy-Mode. Genau das Format-Set, das AccuRIG frisst.

## Unterstützte Eingaben

`.fbx`, `.obj`, `.glb`, `.gltf`. Ausgabe ist immer FBX.

## Exit-Codes bei Fehlern

- `0` — OK.
- `2` — Eingabe fehlt oder Format nicht unterstützt.
- `3` — Import scheiterte (Blender/bpy-Fehlermeldung im Log).
- `4` — keine Mesh in der Datei.
- `5` — Polycount über 600 000 und Decimate scheiterte.
- `6` — FBX-Export scheiterte.

## Bekannte Sonderfälle

- **Draco-komprimierte GLB**: die pip-Version von bpy trägt `libextern_draco.so`
  nicht mit. Betroffene GLBs vorher mit `npx gltf-transform copy in.glb out.glb`
  dekodieren, dann diesen Konverter füttern.
- **Rig ist im Import**: die eingebettete Armature wird entfernt. Das ist
  Absicht — AccuRIG erwartet ein rig-loses Mesh. Rigging und Skinning macht
  AccuRIG selbst.

## Kein Umposen

Wenn die Figur nach dem Import in einer merkwürdigen Pose steht (nicht T- oder
A-Pose), meldet der Konverter das nicht automatisch. Du siehst es in AccuRIG.
In dem Fall bitte melden — Umposen ist per Auftrag nicht Teil dieses Werkzeugs.
