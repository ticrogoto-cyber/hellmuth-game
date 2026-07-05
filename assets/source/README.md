# assets/source/ — Roh-Eingang (nie direkt ins Spiel)

Hier landen die rohen Lieferungen (KREA, OpenAI, Video-Dumps). Nichts daraus
geht ungefiltert ins Spiel: jedes Asset durchläuft erst `tools/normalize_asset.py`
(und ggf. `tools/pack_atlas.py`), bevor es unter `public/sprites/...` bzw.
`assets/sprites/...` als spielfertig gilt. Siehe `asset-spec.md` und
`docs/ASSET-PROMPTS-KREA-V2.md`.

Dateinamen immer `lowercase_snake_case`. Stamm = der typeId/Kanonname aus
`docs/NAMING_CANON.md`.

## Ordner und erwartete Benennung

| Ordner | Inhalt | Benennung (Beispiel) |
|---|---|---|
| `units/` | Texturierte 3D-Modelle (GLB) + Mixamo-Clips (FBX) für die Render-Pipeline | `<unit>.glb`, `<unit>_<clip>.fbx` → `hellmuth.glb`, `hellmuth_walk.fbx`, `novize_walk.fbx` |
| `buildings/` | Rohe Gebäude-PNGs auf Grau (Standard-Freistellen, `--mode building`). Zweitdesign mit Suffix `_b` (Arbeitsregel 6) | `<gebaeude>.png`, `<gebaeude>_b.png` → `apotheke.png`, `apotheke_b.png` |
| `nodes/` | Vorkommen UND Ruinen auf Grau, laufen mit `--mode node` (Bodenteller bleibt, Rand-Fade). Erschöpfte Variante mit Suffix `_erschoepft` | `<node>.png`, `<node>_erschoepft.png` → `hain.png`, `hain_erschoepft.png`, `quelle.png`, `destillat.png` |
| `fx/` | Effekt-Einzelframes und Video-Framedumps (auf dunklem Grund). Frame-Sequenzen durchnummeriert | `<effekt>_<NN>.png` → `impact_00.png`, `muendung_hellmuth_00.png`; Dumps in Unterordner `<effekt>_dump/` |
| `ui/{hellmuth,moderat}/` | Je 6 HUD-Paneele pro Fraktion. Original (mit Inhalt) + gereinigte Inpainting-Version mit Suffix `_clean` | `emblem.png` + `emblem_clean.png`, ebenso `missionsziel`, `ressourcenleiste`, `einheitenkarte`, `befehlsraster`, `minimap` |
| `maps/` | Karten-PNG + farbcodierte Kollisionsmaske als `<name>_mask.png` (gleiche Proportionen) | `neutral.png` + `neutral_mask.png`, `hellmuth.png` + `hellmuth_mask.png`, `moderat.png` + `moderat_mask.png` |
| `maps/` | Karten-PNG + farbcodierte Kollisionsmaske als `<name>_mask.png` (gleiche Proportionen) | `neutral.png` + `neutral_mask.png`, `hellmuth.png` + `hellmuth_mask.png`, `moderat.png` + `moderat_mask.png` |

## HUD-Workflow (§7)

Die HUD-Reinigung macht **OpenAI-Inpainting** (Ticro): pro Paneel eine
inhaltsleere Version mit nahtlos gefüllter Panel-Textur, abgelegt als
`<type>_clean.png` neben dem Original. `tools/process_hud.py` malt nichts,
es (1) stellt freistehende Paneele frei (Alpha außerhalb des Rahmens), (2)
schreibt die relative Zonen-JSON (`tools/hud_zones.json`) und (3) prüft per
QA-Diff, dass das Inpainting außerhalb der deklarierten Zonen nichts verändert
hat. Lauf: `python tools/process_hud.py`.

## Hinweise pro Typ

- **units**: Stamm = Einheiten-typeId (`hellmuth`, `novize`, `apothekerin`,
  `kuratorin`, `destillateur`, `alchemist`, `sirup_trupp`, `schleuderer`,
  `toxischer_nebler`, `stahlkoloss`, `sirup_kern`). Clip-Namen: `walk`, `idle`,
  `attack`, `death`. Aufruf z. B. `render_unit.py --fbx assets/source/units/hellmuth_walk.fbx --clip walk --directions 16`.
- **buildings/nodes**: grauer Vollhintergrund ist erwünscht (Freistellen macht
  der Normalisierungspass), eingebackener Kontaktschatten bleibt.
- **maps**: Maske farbcodiert — Weiß begehbar, Schwarz blockiert, Blau Wasser,
  Magenta Sirup-Zone. Schlüssel im Code: `maps/neutral.png` (Megatextur) und
  `maps/neutral_mask.png` (Maske); weitere Karten analog.
