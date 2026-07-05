# KONSOLIDIERUNG

Stand: 2026-07-05

Quelle: `ticrogoto-cyber/Higgsfield-`
Ziel: `ticrogoto-cyber/hellmuth-game`, Branch `main`
Bekannte Importbasis: `Higgsfield-/claude/quirky-fermat-8rewv0` (`af4b65dd0c31`)

Wichtig: In dieser Analyse wurde nichts gemergt. Es wurde nur geprüft, was in den Quellbranches liegt und ob es in `hellmuth-game/main` bereits vorhanden, überholt oder noch separat prüfenswert ist.

## Methode

- Alle sichtbaren Branches im Quellrepo wurden über den GitHub-Connector erfasst.
- Für Branches mit Arbeit seit dem 2026-06-05 wurde gegen die Importbasis `claude/quirky-fermat-8rewv0` verglichen.
- Da `hellmuth-game` ein selektiv importiertes eigenes Repo ist, tauchen Higgsfield-Commit-SHAs dort nicht zwangsläufig 1:1 im `git log` auf. Darum ist die Einordnung eine Kombination aus Quellbranch-Vergleich, Dateipfaden und Stichproben gegen den aktuellen Zielstand.
- Nicht als direkte Importkandidaten gewertet: alles außerhalb des Spiels, außerdem `node_modules/`, `dist/`, `proof/`, `proof3d/`.

Hinweis zur Zeitangabe: Der GitHub-Connector hat für viele Kopfcommits die volle UTC-Zeit geliefert. Bei wenigen Branches lieferte er nur Message/Diff ohne separates Zeitfeld; diese sind tages- oder monatsgenau markiert, aber trotzdem im richtigen Aktualitätsfenster eingeordnet.

## Kurzbefund

- Der aktuelle `hellmuth-game/main` ist nicht nur der nackte alte Import. Er enthält bereits mehrere spätere Anpassungen, z. B. die `HELLMUTH`/`MODERAT`-Umbenennung, Audio-Paket D, VFX-Dateien und CI/Gate-Fixes.
- Nicht blind mergen: `claude/editor`, `claude/hud`, `claude/vfx` und `claude/vigilant-mccarthy-p9vxpa` enthalten große Lösch-/Cleanup-Wellen gegen alte Asset-Strukturen.
- Selektiv prüfenswert: Apothekenhaus-Iso-Sprites aus `claude/jolly-cerf-winia9`/Quell-`main`, der AoE4-artige RTS-HUD-Prototyp aus `claude/cool-goldberg-zs2vci` als Designreferenz, einzelne HUD-v2-Arbeit aus `claude/beautiful-thompson-nixyyc`, der einzelne Ornament-Source aus `claude/hopeful-cannon-z94t30`, sowie ältere Animations-/Atlas-Arbeit aus `claude/nifty-shannon-mL25W`.
- Schon enthalten oder überholt: `claude/audio`, `claude/dynamics`, `claude/gallant-rubin-pjfnxa`, `claude/pensive-fermat-tqacy2`, `claude/sharp-newton-ceo48s`, `copilot/claudequirky-fermat-8rewv0`, `claude/happy-knuth-2ga3m7`.

## Alle Branches

| Branch | Letzter Commit | Head | Letzte Message | Inhalt/Bereich | Enthalten in `hellmuth-game/main`? | Empfehlung |
|---|---:|---|---|---|---|---|
| `main` | 2026-07-04 UTC | `d238ff281cd9` | `HELLMUTH Sprint 0-3: game skeleton + combat + iso assets + deploy path to hellmuth-soda/game/` | Altes JS-Spiel unter `hellmuth-game/`, Apothekenhaus-Iso-Sprites, Deploy nach hellmuth-soda | Nein, Zielrepo nutzt anderes Vite/TS-Projektlayout | Nicht mergen. Apothekenhaus-Sprites/Metadata selektiv prüfen. |
| `claude/jolly-cerf-winia9` | 2026-07-04 15:40 UTC | `dd5fe568e159` | `Wire iso-rendered Apotheke sprites and extend deploy to hellmuth-soda/game/` | Apothekenhaus-Sprites, altes `hellmuth-game/` JS-Prototyp-Projekt, Deploy-Workflow | Nein, Pfade fehlen im Zielrepo | Selektiv: nur Sprites/Metadata prüfen, kein Branch-Merge. |
| `claude/quirky-fermat-8rewv0` | 2026-07-04 15:08 UTC | `af4b65dd0c31` | `docs: add generate_unit_sprites to werkzeuge manifest coverage` | Importbasis des Zielrepos | Ja | Keine Aktion. |
| `claude/vigilant-cannon-2netm7` | 2026-07-04 15:00 UTC | `8081ee3b2518` | `Update start.sh to use designated branch claude/vigilant-cannon-2netm7` | Nur `start.sh` im Quellrepo | Für Spiel irrelevant | Nicht mergen. |
| `claude/gallant-rubin-pjfnxa` | 2026-07-04 14:33 UTC | `b1e2de6fc99f` | `ci: soften asset source gate to warn instead of fail` | `hellmuth/tools/asset_resolve_gate.py` | Ja, Vergleich: ahead 0 / bereits in Basis | Keine Aktion. |
| `claude/sharp-newton-ceo48s` | 2026-07-04 14:32 UTC | `b98be8bf2f96` | `CI-Fix: werkzeuge_check + gate:assets nicht-blockierend` | CI/Gate-Fix | Ja, Vergleich: ahead 0 / bereits in Basis | Keine Aktion. |
| `copilot/claudequirky-fermat-8rewv0` | 2026-07-04 14:29 UTC | `29c6a1c3b6cc` | VFX-Zielbilder / MODERAT-kompatibler Stand | VFX mit `moderat` statt altem `generik` | Ja, Vergleich: Branch ist hinter Importbasis; Ziel enthält MODERAT-VFX | Keine Aktion. |
| `claude/pensive-fermat-tqacy2` | 2026-07-04 14:14 UTC | `48e974fb577b` | `ci: soften asset source gate in ci-fast` | CI/Gate-Fix | Ja, Vergleich: ahead 0 / bereits in Basis | Keine Aktion. |
| `claude/stoic-allen-vbaptw` | 2026-07-04 13:14 UTC | `17d9ffd7f077` | `VFX-Zielbilder: fraktionsfarbige Projektile, Aura, Heal, Boden-Verschmutzung (CODE4)` | VFX-Dateien, aber mit altem `klarheit/generik`-Vokabular | Funktional überholt: Ziel enthält MODERAT-kompatible VFX | Nicht mergen; höchstens als Historie. |
| `claude/happy-knuth-2ga3m7` | 2026-07-04 05:28 UTC | `94db1d6dd611` | `fix(gitignore): krea-roh und zielbilder Ausnahmen hinzugefuegt` | `.gitignore`-Ausnahmen für KREA/Zielbilder | Ja, Zielrepo enthält diese Ausnahmen bereits und sogar detaillierter | Keine Aktion. |
| `claude/eloquent-hawking-be4v29` | 2026-07-03 09:18 UTC | `a63e7e3b1dfa` | `Add SOLUTIONS-KOMMANDO-HAPTIK report` | `solutions/`-Dokumentation außerhalb Spielordner | Nein, aber out of scope | Nicht ins Spiel mergen; ggf. separat als Recherche-Dokument archivieren. |
| `claude/new-session-03j1sa` | 2026-06-27 22:56 UTC | `982e2723e7f6` | `Add complete German research synthesis (Analog Renaissance)` | `analog-renaissance/` Dokumentation | Nein, out of scope | Nicht mergen. |
| `claude/gracious-feynman-tp9kya` | 2026-06-17 UTC | `b2f3bd0e6316` | `3D-Pipeline-Cloud: Ausfuehrungs-Schicht (12 Straenge) unter solutions/` | Cloud-3D-Pipeline-Dokumentation | Nicht im Spielcode enthalten | Optional später nach `docs/` portieren, kein Merge. |
| `claude/eager-newton-cks9j9` | 2026-06-16 23:42 UTC | `1c39466dd3f2` | `Ignore python __pycache__ artifacts` | `.gitignore` außerhalb `hellmuth/` | Für Ziel irrelevant | Nicht mergen. |
| `claude/vigilant-mccarthy-p9vxpa` | 2026-06-16 23:31 UTC | `bdb195d37e06` | `Audit-Fix: Panel-Rahmen unter den Inhalt (z-index 1->0)` | HUD-CSS-Fix plus sehr große alte Asset-Löschwelle | Nicht direkt enthalten; Ziel-HUD-Struktur ist aber anders | Kein Branch-Merge. Einzelnen CSS-Gedanken nur bei konkretem HUD-Fehler prüfen. |
| `claude/hud` | 2026-06-16 05:03 UTC | `70d06c0eb895` | `Delete hellmuth/public/sprites/terrain directory` | Massive Löschung von Terrain/UI/Asset-Dateien | Nein, bewusst nicht enthalten | Nicht mergen. Destruktiver Cleanup-Branch. |
| `claude/editor` | 2026-06-16 04:56 UTC | `f94a6f587799` | `Delete hellmuth/assets/source/ui/freigestellt_part2of2.zip` | Große Löschung alter UI-Quellen/ZIPs | Nein, bewusst nicht enthalten | Nicht mergen. Nur einzelne Cleanup-Idee nach Asset-Audit. |
| `claude/vfx` | 2026-06-16 04:51 UTC | `4b45ae156b1f` | `Delete hellmuth/assets/source/ui/freigestellt_part2of2.zip` | Head ist Cleanup/Löschstand, nicht die relevante VFX-Variante | Nein | Nicht mergen. |
| `claude/dynamics` | 2026-06-14 19:32 UTC | `e1b5279a3c4d` | `FoW Paket C: Minimap-Verbraucher + konsolidierte Last-Validierung (FoW komplett)` | Fog-of-War, Minimap-Verbraucher, Lastvalidierung | Ja, Vergleich: ahead 0 / bereits in Basis | Keine Aktion. |
| `claude/hopeful-cannon-z94t30` | 2026-06-14 17:29 UTC | `618e6adc8b47` | `Asset: generik_v_topleft (Zier-Eckstueck GENERIK, roh/unfreigestellt, fuer Paket C)` | Einzelnes Source-Asset `hellmuth/assets/source/ui/orn/generik_v_topleft.png` | Nein, Zielrepo hat dieses Bild nicht | Optional portieren, vorher wegen Fraktionsname `generik` -> `moderat` prüfen. |
| `claude/beautiful-thompson-nixyyc` | 2026-06-14 15:24 UTC | `d0495a290b35` | `HUD Stufe 2: benannte Leisten-Assets gesetzt (Frames + Sigil + Eckstuecke)` | HUD-v2-Assets, HUD-CSS, HTML-HUD, GameState/UI-Anbindung | Teilweise überholt durch Ziel-HUD/V3; nicht 1:1 enthalten | Nur selektiv prüfen, kein Branch-Merge. |
| `claude/audio` | 2026-06-14 UTC | `eab8b83aa02c` | `Audio Paket D: format chain, audio-sprites, lazy localization (EN fallback)` | Audio-Formatkette, Audio-Sprites, lazy Lokalisierung, Tests | Ja, Zielrepo enthält Audio-Paket D und erweiterte `test:audio`-Scripts | Keine Aktion. |
| `claude/great-sagan-ifnem6` | 2026-06-11 18:11 UTC | `ddae63d3583b` | `ornament-bausatz` | Ornament-/UI-Source-Arbeit | Ja, Vergleich: ahead 0 / bereits in Basis | Keine Aktion. |
| `claude/ornament-varianten-archiv` | 2026-06-12 16:12 UTC | `9f2a54c9a232` | `Ornament-Prinzipien (Recherche-Destillate) als Kritiker-Kriterien dokumentiert` | `hellmuth/docs/ornament-prinzipien.md` | Ja, Vergleich: ahead 0 / bereits in Basis | Keine Aktion. |
| `claude/cool-goldberg-zs2vci` | 2026-06 UTC | `98e8b8ccec04` | `Add AoE4-style RTS HUD prototype under rts/` | Eigenständiger RTS-HUD-Prototyp unter `rts/` | Nein, außerhalb `hellmuth/` und nicht im Ziel | Nicht mergen; als Designreferenz ansehen. |
| `claude/nifty-shannon-mL25W` | 2026-06 UTC | `6ab59a83db47` | `AP1+AP2: asset pipeline + auto-rendered Hellmuth walk atlas` | Alter Spiel-Skeleton, Helmut-Walk-Atlas, Render-/Atlas-Tools, teilweise `proof3d` | Teilweise überholt, nicht vollständig enthalten | Selektiv prüfen: Atlas/Pipeline-Artefakte; `proof3d` nicht importieren. |
| `claude/german-victim-support-research-0kaphy` | 2026-06 UTC | `f1bfaf5898f6` | `Add Selbsthilfe-Leitfaden bei Verdacht auf Autoimmunenzephalitis (24-Subagenten-Recherche)` | Medizinische/rechercheartige Dokumente außerhalb Spiel | Nein, out of scope | Nicht mergen. |
| `claude/wizardly-pasteur-96cbys` | 2026-06 UTC | `268ed9c610e6` | `Add Tiefenrecherche Rechtsschutzversicherung` | Recherche-Dokumente außerhalb Spiel | Nein, out of scope | Nicht mergen. |
| `claude/wonderful-clarke-bngbzm` | 2026-06 UTC | `c9d48dc6bcc2` | `Add quellen/ mit 12 Einzelreports der Subagent-Recherchen` | Quellen-/Rechercheordner außerhalb Spiel | Nein, out of scope | Nicht mergen. |
| `claude/vibrant-turing-ncq1C` | 2026-05-29 17:45 UTC | `8213b2915ca4` | `Diagram 07: russian tradition only, spell out numbers` | Buch/Diagramme | Nein, alt und out of scope | Nicht mergen. |
| `claude/fix-chart-label-position-wydUE` | 2026-05-21 08:55 UTC | `f601b74c97ff` | `Refine diagram 05: precise arc tip, em-dash, frame-only box, vertical layout` | Buch/Diagramme | Nein, alt und out of scope | Nicht mergen. |
| `claude/fix-github-raw-access-ZI4Tx` | 2026-05-18 06:56 UTC | `ff1d67b4a3d3` | `Diagram 04: rotate größere Kleidung correctly, drop black-box verdict` | Buch/Diagramme | Nein, alt und out of scope | Nicht mergen. |
| `claude/add-video-overlays-lwC2s` | 2026-05-11 20:06 UTC | `c2327b93395d` | `Lock down sequence-mode contract in CLAUDE.md` | `CLAUDE.md`, Video/Overlay-Kontext außerhalb Spielimport | Nein, alt und out of scope | Nicht mergen. |
| `claude/add-plant-oils-vocab-FFKv5` | 2026-05-08 11:46 UTC | `e181bd80975c` | `Add PFLANZENÖL to Vokabular` | `sucht-mythen/vokabular/data.js` | Nein, alt und out of scope | Nicht mergen. |

## Details zu nicht enthaltenen Kandidaten

### `claude/jolly-cerf-winia9` und Quell-`main`

Was dort liegt:

- `.github/workflows/sync-hellmuth-soda.yml`
- `hellmuth-game/assets/buildings/apothekenhaus/metadata.json`
- `hellmuth-game/assets/buildings/apothekenhaus/apotheke_dir_000_*` bis `apotheke_dir_315_*`
- Altes JS-Spielprojekt unter `hellmuth-game/src/...`, `data/...`, `vendor/phaser.min.js`

Einordnung:

- Das ist wertvoll für Apothekenhaus-Iso-Sprites und Metadata.
- Das Projektlayout ist aber ein anderes: altes `hellmuth-game/`-Browserprojekt mit JS/vendor Phaser, während das Zielrepo jetzt das Vite/TypeScript/Phaser-Projekt aus `hellmuth/` ist.

Empfehlung:

- Nicht mergen.
- Apothekenhaus-Sprites und `metadata.json` separat prüfen und in das aktuelle Asset-System übersetzen.

### `claude/cool-goldberg-zs2vci`

Was dort liegt:

- `rts/index.html`
- `rts/styles.css`
- `rts/game.js`
- `rts/hud.js`
- `they-are-billions-screenshot.webp`

Features:

- Eigenständiger AoE4-artiger RTS-HUD-Prototyp.
- Ressourcenleiste, Produktionsqueues, Benachrichtigungen, Eventlog, Minimap, Selection Panel, Command Card, World Canvas.

Empfehlung:

- Nicht in das Spielrepo mergen.
- Als UI-/HUD-Referenz für spätere Controls oder Layoutideen behalten.

### `claude/beautiful-thompson-nixyyc`

Was dort liegt:

- HUD-Stufe-2-Arbeit mit benannten Leisten-Assets, Frames, Sigil, Eckstücken.
- Relevante Bereiche: `hellmuth/public/sprites/ui/hud/v2/...`, `hellmuth/src/ui/html_hud.ts`, `hellmuth/src/ui/hud.css`, `hellmuth/src/scenes/game_scene.ts`, `hellmuth/src/systems/game_state.ts`, `hellmuth/tools/process_ui_v2.py`, `hellmuth/tools/hud_*`.

Einordnung:

- Der Zielstand enthält bereits eine spätere HUD/V3-Struktur und `HELLMUTH`/`MODERAT`-Namen.
- Ein direkter Merge würde alte HUD-Strukturen und Namen zurückbringen.

Empfehlung:

- Nur einzelne Assets oder Mess-/Tool-Ideen prüfen.
- Kein Branch-Merge.

### `claude/hopeful-cannon-z94t30`

Was dort liegt:

- `hellmuth/assets/source/ui/orn/generik_v_topleft.png`

Einordnung:

- Einzelnes Roh-/Source-Asset, im Zielrepo nicht vorhanden.
- Der Name ist noch `generik`; Ziel-Fraktionen sind `HELLMUTH` und `MODERAT`.

Empfehlung:

- Optional portieren, falls das Asset noch optisch gebraucht wird.
- Beim Portieren umbenennen/einordnen: `generik` nicht wieder als Fraktion einführen.

### `claude/nifty-shannon-mL25W`

Was dort liegt:

- Älteres `hellmuth/`-Projektgerüst.
- `hellmuth/assets/sprites/units/helmut.png` und JSON-Atlas.
- Tools wie `render_unit.py`, `normalize_asset.py`, `pack_atlas.py`.
- Dokumente wie `ENGINE_REVIEW`, `LICENSE_REVIEW`, Pipeline-Notizen.
- Auch `proof3d`-/Proof-Material, das nicht direkt importiert werden soll.

Einordnung:

- 93 Commits Vorsprung gegenüber alter Mergebasis, aber stark veraltet und hunderte Commits hinter dem Importstand.
- Wahrscheinlich sind einzelne Assets oder Pipeline-Ideen wertvoll, nicht der Branch als Ganzes.

Empfehlung:

- Separat auditieren: nur Walk-Atlas, Renderer-/Pack-Tools und relevante Doku prüfen.
- `proof3d/` nicht importieren.

### `claude/vigilant-mccarthy-p9vxpa`

Was dort liegt:

- Kopfcommit: HUD-CSS-Z-Index-Fix, damit Panel-Rahmen nicht über Inhalt liegt.
- Branchinhalt insgesamt: sehr große Löschwelle alter UI-/Terrain-/Sprite-Dateien, zusätzlich altes `WERKZEUGE.md`.

Einordnung:

- Ziel-HUD ist strukturell anders als dieser Branch. Der konkrete `.frame`-Fix ist nicht direkt auf den aktuellen Zielstand übertragbar.
- Die Asset-Löschungen sind riskant.

Empfehlung:

- Kein Branch-Merge.
- Nur bei sichtbarem HUD-Übermalungsfehler die Idee „Rahmen unter Inhalt“ gezielt nachbauen.

### `claude/editor`, `claude/hud`, `claude/vfx`

Was dort liegt:

- Große Cleanup-/Löschstände für `hellmuth/assets/source/ui/...`, `hellmuth/public/sprites/...`, ZIPs und Terrain-/Building-Sprites.
- `claude/vfx` klingt nach VFX, der Head ist aber faktisch ein Cleanup/Löschstand.

Empfehlung:

- Nicht mergen.
- Nur nach einem getrennten Asset-Audit einzelne Löschungen übernehmen.

### `claude/stoic-allen-vbaptw`

Was dort liegt:

- VFX-Dateien: `aura_ring.ts`, `ground_stain.ts`, `heal_glow.ts`, `palette.ts`, `projectile_beam.ts`.
- Änderungen in Combat/Repair/Death/GameScene.

Einordnung:

- Diese Arbeit ist im Ziel bereits in einer MODERAT-kompatiblen Form angekommen.
- Der Stoic-Branch nutzt in Teilen noch alte Begriffe `klarheit/generik`.

Empfehlung:

- Nicht mergen.
- Zielstand behalten.

### `claude/gracious-feynman-tp9kya`

Was dort liegt:

- `solutions/SOLUTIONS-3D-PIPELINE-CLOUD.md`
- Recherche zu Cloud-Ausführung der 3D-Pipeline: Tripo3D, Modal, Replicate, R2, Kosten, Lizenzen, Audit-Trail.

Empfehlung:

- Nicht als Spielcode mergen.
- Optional später als `docs/`-Dokument in bereinigter Form übernehmen, wenn die Cloud-Pipeline wieder Thema wird.

### Recherche-/Dokumentationsbranches außerhalb des Spiels

Branches:

- `claude/eloquent-hawking-be4v29`
- `claude/german-victim-support-research-0kaphy`
- `claude/new-session-03j1sa`
- `claude/wizardly-pasteur-96cbys`
- `claude/wonderful-clarke-bngbzm`

Einordnung:

- Enthalten Dokumente außerhalb von `hellmuth/`.
- Kein direkter Spielimport.

Empfehlung:

- Nicht mergen.
- Nur separat archivieren, falls diese Recherche bewusst in ein eigenes Wissens-/Doku-Repo soll.

## Bereits enthaltene oder überholte Branches

### Audio

`claude/audio` ist enthalten. Der Zielstand enthält die Audio-Formatkette `.ogg/.m4a/.mp3`, Audio-Sprites, lazy Sprachpakete und zusätzliche Audio-Tests.

### Fog-of-War / Dynamics

`claude/dynamics` ist enthalten. Der Vergleich meldete `ahead_by: 0`.

### CI/Gates

`claude/gallant-rubin-pjfnxa`, `claude/pensive-fermat-tqacy2` und `claude/sharp-newton-ceo48s` sind enthalten. Die Asset-Gates und CI-Fixes sind im Zielstand bereits angekommen oder überholt.

### VFX mit MODERAT

`copilot/claudequirky-fermat-8rewv0` ist enthalten/überholt. `hellmuth-game/main` nutzt bereits `FactionId` mit `moderat`, z. B. in `src/fx/projectile_beam.ts`.

### `.gitignore`

`claude/happy-knuth-2ga3m7` ist im Zielstand überholt: `hellmuth-game/.gitignore` enthält die KREA/Zielbilder-Ausnahmen bereits, sogar mit zusätzlicher Detailausnahme.

## Empfohlene nächste Konsolidierungs-Reihenfolge

1. Apothekenhaus-Sprites aus `claude/jolly-cerf-winia9`/Quell-`main` separat in das aktuelle TS/Vite-Assetsystem übersetzen.
2. Einzelnes Ornament-Asset aus `claude/hopeful-cannon-z94t30` prüfen, falls MODERAT-UI noch ein passendes Eckstück braucht.
3. `claude/nifty-shannon-mL25W` nur auf Walk-Atlas und Pipeline-Tools auditieren.
4. `claude/cool-goldberg-zs2vci` als Designreferenz lesen, nicht importieren.
5. Cleanup-Branches (`editor`, `hud`, `vfx`, `vigilant-mccarthy`) erst ganz am Ende und nur dateiweise nach Asset-Inventar anfassen.

## Abschluss

Diese Datei ist nur die Analyse. Es wurde nichts aus den Quellbranches in `hellmuth-game` gemergt.