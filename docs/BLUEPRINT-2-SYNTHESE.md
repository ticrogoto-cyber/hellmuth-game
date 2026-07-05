# BLUEPRINT-2-SYNTHESE — Ratifizierung und Lücken-Auflösung

Fable, 2026-07-03. Kreuzung von `SOLUTIONS-BLUEPRINT-2-RELEASE.md` mit der Code9-Terrain-Messung (2026-07-02, Basis `bc24825`) und dem Sessionstand. Dieses Dokument ist die verbindliche Lesart des Berichts. Task-Schnitte referenzieren es. Es gehört als `docs/BLUEPRINT-2-SYNTHESE.md` ins Repo.

---

## 1. Ratifizierte Entscheidungen

Ab sofort beschlossen, keine Diskussionsmasse mehr.

1. **Auslieferung Electron + steamworks.js.** DIRECTION.md:43–44 sagt das bereits wörtlich — der A1-Entscheid ratifiziert die Wahrheitsquelle. Der Widerspruch lebt in CLAUDE.md:27–28 und TODO.md:373 (Tauri) und wird per Kanon-Patch bereinigt. Tauri fällt belegt am Steam-Overlay (tauri#6196) und am Cross-Build.
2. **Kalender.** Coming-Soon-Seite August 2026 · Demo mit eigener App-ID · Next Fest Februar 2027, nie kalt (7k-Wishlist-Boden als Arbeitsziel) · Release März 2027. Steam-Fristen als harte Anker (Coming-Soon ≥2 Wochen, Review ≥7 Werktage, Fest-Registrierung ~8 Wochen vorher).
3. **Einheiten-Budget.** 87 Frames pro Typ, 5 Richtungen plus flipX. Der 8-Richtungen-Plan aus Blueprint v1 (8.1/8.3) ist gepatcht. Roster-Ziel HELLMUTH 4, MODERAT 5, Schwarmling als Scale-Vierling, zwei Elite-Recolors, ein 4096er-Atlas je Fraktion.
4. **Animations-Determinismus.** Tick-getriebenes `setFrame`, nie Phaser-Wallclock-Anims. Merge-Gate gegen `frameRate`-Importe.
5. **Wucht-Schicht.** Trauma-Kamera nach Eiserloh (trauma², Perlin, Zufuhr-Deckel, render-only), Hitstop nur paarlokal 2–4 Render-Frames, die Sim friert nie. Kein Rotations-Shake in Iso. Kommando-Quittung unter 50 ms mit eigener Bark-Cooldown-Klasse.
6. **Higgsfield.** Erst der kostenlose 3-Tage-Trial fürs VFX-Sheet-Experiment (sobald Sheets zum Testen existieren), der eine Plus-Monat unmittelbar vor der Trailer-Produktion Januar 2027. Jetzt kein Kauf.
7. **Werkzeug-Hebel.** H26 Sim-Purity, H27 Balance-Matrix, H28 Determinismus-Hash, H29 Depot-Preview. Die redaktionelle Kollisions-Auflösung (H29 statt doppeltem H26) gilt.
8. **Save-Architektur.** Snapshot plus Seed plus RNG-State plus optionaler Input-Log, 300-Tick-Hash als Desync-Wächter, Auto-Cloud über Dateispiegel. Das IndexedDB-Non-Goal aus Blueprint v1 §23 ist überholt.

## 2. Auflösung der gemeldeten Lücken

Solutions durfte nur den eigenen Branch lesen und hat korrekt markiert statt erfunden. Die Auflösung aus der Innenperspektive.

| Gemeldete Lücke | Tatsächliche Lage |
|---|---|
| Code9-Terrain-Messung fehlt | Liegt vor (Chat-Lieferung ohne Commit, wie beauftragt; 92 Dateien, adversarial verifiziert). Kernbefunde in Abschnitt 3. Sie gehört als `docs/MESSUNG-TERRAIN.md` ins Repo, damit künftige Runden sie lesen können. |
| Sound-Recherche fehlt | Existiert im Repo — `docs/SOUND-RECHERCHE.md` (von der Terrain-Messung zweimal zitiert, Zeilen 324/710). H6/H7 erweitern den Bestand, Bark-Cue-Listen liegen dort. |
| DIRECTION V3 / TODO fehlen | Liegen im Repo; die Messung zitiert die relevanten Passagen (Electron-Zeile, Iso-Konstanten). Wortlaut in Abschnitt 3, Frage 6. |
| Physik-Körperlichkeits-Bericht fehlt | Echte Lücke — das Mandat wurde geschnitten, die Runde nie geliefert. Konsequenz wie im Bericht: H4/H5 starten gekapselt, die Feel-Abnahme-Maßstäbe (Red-Alert-3-Schichtung, Master-Werte-Tabelle) fehlen weiter. Nachholen ist eine eigene, spätere Entscheidung. |
| flowField im Branch nicht auffindbar | Existiert im Repo — `Unit` trägt `flowField` (unit.ts:80–121), `movement` läuft in der stepSim-Reihenfolge. Interna ungemessen, siehe Abschnitt 4. |

## 3. Antworten auf die sieben offenen Fragen

1. **movement/flowField-Ist.** Existiert (unit.ts:80–121, movement_system in stepSim game_scene.ts:1201–1217). Datenlayout, Kostenmetrik, Dirty-Verhalten ungemessen — Paket 0 des H13-Tasks. H11 startet nicht auf euklidischem Fallback, sondern auf dem vorhandenen Modul nach dessen Kurzmessung.
2. **Karten-Migrationsgerüst.** Voll beantwortet — `MAP_FORMAT_VERSION = 2` (map_format.ts:8), `migrate()` als Stufen-Gerüst (177–204, v1→v2 belegt), Loader top-level tolerant mit `meta.__unknown`-Durchreichung (266–270), Roundtrip-Test vorhanden. H16 richtet SaveFile-Migration exakt daran aus.
3. **Sim/Render-Trennungsgrad.** Der Fixed-Timestep-Accumulator existiert (30 Hz, game_scene.ts:1174–1183, `SIM.maxStepsPerFrame = 5`). Aber die Trennung existiert nicht — `GridEntity extends Phaser.GameObjects.Container` (entity.ts:14), Units/Buildings sind Phaser-Objekte, GameState hält sie direkt, Systeme laufen in der Scene. Konsequenz in Abschnitt 4.
4. **AudioBus/BarkKern-Ist.** Vorhanden — `audio_bus.ts` (Volumes, `AUDIO_VOLUME_EVENT`), `install_audio.ts` mit datengetriebenem Event-Tap über `audio_manifest.json`, `bark_director.ts` als Event-Empfänger. Cooldown-Klassen und Bus-Graph ungemessen — Paket 0 des H6/H7-Tasks. Erweitern, nicht ersetzen.
5. **HUD-Stand.** DOM-HUD (`html_hud.ts`), Phaser-HudScene ersatzlos deaktiviert, rAF-Polling aus der Registry. Der nie dispatchte V2-HUD-Task bleibt der bekannte offene Hebel und blockiert die HUD-Anteile von H7/H12/H16 — er wird als eigener Schnitt fällig, bevor diese Stränge ihre Anzeigen bauen.
6. **DIRECTION-Wortlaut.** Electron plus steamworks.js steht in DIRECTION.md:43–44. Iso-Konstanten bestätigt (TILE 160×96 in iso.ts:8/11, Winkel-Kanon in asset-spec.md:19–21). Font-Coverage von Printvetica/Fournier ist ungemessen und bleibt es bis zum H17-Glyph-Gate — das Gate misst, statt anzunehmen.
7. **Steam-Konten-Stand.** Partner-Konto und App-ID existieren (4867920, USK 16, Inhaltsbefragung und Beschreibungstexte teils eingepflegt). T1 ist teilerledigt — der August gilt der Finalisierung (Kapsel-Assets in exakten Steam-Maßen, Screenshots nach Parität, Demo-App-ID beantragen), nicht dem Setup.

## 4. Die harte Korrektur — Sim-Purity ist Extraktion, kein Gate

Der Bericht preist H26 als Gate ein, das Phaser-Importe in `src/sim/` verhindert. Die Messung zeigt, dass es `src/sim/` nicht gibt und die heutige Sim untrennbar in der Scene lebt — Entities erben von Phaser-Containern. Ein headless `runMatch` kann die bestehende Sim nicht starten.

Beschlossener Weg (Knockback-Vorbild, bereits im Repo bewiesen). Neue Systeme entstehen als reine Module ohne Phaser-Import (Wandlungsfront läuft schon so, Flow-Field-Modul H13 wird so beauftragt, WaveDirector/AIBrain H11 ebenso). `runMatch` startet als Fassade über diesen reinen Kernen plus einem minimalen Zustands-Extrakt (Positionen, HP, Owner als TypedArrays), nicht über der Scene-Sim. Die Alt-Sim wird nicht aufgebrochen, sie wird umwachsen — Extraktion einzelner Systeme nur, wenn ein Strang sie ohnehin anfasst. Ehrliche Mehrkosten gegenüber der Berichts-Schätzung — Welle 1 plus 3 bis 5 Instanz-Tage für Fassade und Extrakt. H28-Doppellauf-Hash gilt zunächst für die reinen Kerne, nicht für das Vollspiel.

## 5. Konsequenz-Deltas zur Roadmap

- T1 (Steam-Setup) schrumpft auf Finalisierung; die 100-USD-Fee ist gezahlt, App-ID existiert.
- Welle 1 trägt die Purity-Mehrkosten (Abschnitt 4) und beginnt mit zwei Paket-0-Kurzmessungen (flowField-Interna für H13, Audio-Ist für H6/H7) statt mit Annahmen.
- Der V2-HUD-Task wird vor den HUD-Anteilen von H7/H12/H16 geschnitten — er steht seit Wochen offen und wird jetzt terminiert.
- Welle 0 wird mit dem Scattering-Task geschlossen (letzter offener Strang der Zielbild-Runde).
- Die Terrain-Messung und dieses Dokument gehen als `docs/`-Commits auf die Integrationslinie, damit Solutions-Folgerunden und Instanzen dieselbe Faktenbasis lesen.

## 6. Offene Entscheidungen beim Menschen

1. Go für den Kanon-Patch (CODE6-KANON-PATCH liegt bei).
2. Stufe-2-Entscheid Wandlungsfront (H12 nennt die Zwischenform — Flächen-Zähler als Win/Lose-Metrik ohne Mechanik-Wirkung; mein Vorschlag bleibt zweistufig, Zähler ja, Mechanik nach Parität).
3. MODERAT-König-Augenfrage vor den ersten Charakter-Renderläufen.
4. GLB-Export — T2 rückt mit jedem Welle-1-Tag näher an den kritischen Pfad.
