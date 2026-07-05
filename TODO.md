# TODO — HELLMUTH

Offene Punkte und getroffene Annahmen. Wird laufend gepflegt. Annahmen hier,
nicht raten.

## Abnahme-Prinzip HUD-Frame (verbindlich, Ticro)

- **Abnahme-Maßstab ist HUD-Größe, nicht der x7-Zoom.** Liest ein Element auf
  echter HUD-Größe korrekt, ist es abgenommen.
- Der x7-Zoom (Kritiker-Crops) ist **Prüfwerkzeug, kein Spielzustand**. Ein
  Fehler, den nur die Lupe zeigt, wird **nicht** gefixt.
- Der **gemalte Materiallook** ist der Kern des HUDs. Lösungen, die ihn
  gefährden (z. B. prozedural synthetisierte Schienen statt der verarbeiteten
  Strip-Assets), sind abgelehnt — erst recht für lupenkleine Defekte.

### Bekanntes Residuum: MODERAT-Eckverbinder (abgenommen)

- Der MODERAT-Panelrahmen läuft über `.panel::before` border-image-round mit
  `panel.png` (cut_elbow-Ecken + Schienen, `tools/bake_moderat_frame.py`).
- **Residuum:** Bei x7-Zoom liest die 45°-Gehrung eher als Stoßfuge, und die
  H/V-Rillen fluchten an der Ecke nicht. Ursache: die Ecke wird aus dem
  H-Band (`strip_h_e`) abgeleitet, die anstoßende V-Schiene aus `strip_v_e` —
  **gemischte Quellen**, daher kein gemeinsames Rillenraster.
- **Abgenommen** auf HUD-Größe (Ecke liest als Stahl-Bauteil). Nicht weiter
  verfolgt, weil der einzige saubere Fix (ein gemeinsames prozedurales
  Schienenprofil) den gemalten Materiallook gefährdet.
- **Eskalations-Trigger:** Falls derselbe Versatz bei **normaler HUD-Größe** an
  anderen Ecken sichtbar wird → melden und über die Schienen-Systematik reden
  (nicht über diese eine Ecke).

## Stand: spielbarer Kern vollstaendig

Mit Auftrag 04 hat das Spiel Anfang, Mitte und Ende: bauen, produzieren,
kaempfen, gewinnen oder verlieren gegen eine Moderat-KI.

## Naechster sinnvoller Schritt (nach dem Vertical Slice)

Reihenfolge offen, je nach Prioritaet:

1. **Balancing/Politur:** Gebaeude-HP, Schaden, Tempo, Wellenstaerke abstimmen;
   Angriffs-Bewegung (Attack-Move statt Ziel-Fixierung), Ziel-Retarget bei
   naeherem Gegner.
2. **Tech-Stufen** (Avantgarde, Alchemie) + Upgrades im Labor/Kuratorium.
3. **Destillat-Ernte** (Destillatsickerung) und schwere Einheiten (Alchemist).
4. **Caster-Faehigkeiten** (Kurator, Toxischer Nebler), Sprueche.
5. **Fog of War**, mehrere Karten, staerkere KI mit Basisausbau.
6. Echte Kunst und Ton (erst nach dem Loop).

Siehe `docs/VERTICAL_SLICE_SCOPE.md`.

### Was fuer ein vorzeigbares Skirmish noch fehlt

- Balancing: HQ haben 1200 HP, Belagerung dauert; Wellen sind grob getaktet.
- Attack-Move: Wellen-Einheiten ignorieren Gegner unterwegs (nur Ziel-Fix).
- Mehr Spieler-Optionen: nur Apotheke produziert Kaempfer (Apotheker,
  Destillateur); kein eigenes Militaergebaeude, keine schweren Einheiten.
- Audiovisuelles: reine Platzhalter, kein Ton, keine Trefferanimationen.
- Stance-UI: Halten/Patrouille nur per Taste (H/P), keine Buttons, kein
  Patrouille-Punkt-Picking.

### Erledigt in Auftrag 04 (Kampf + Gegner + Sieg)

- Daten: Kampfwerte (`schaden`, `reichweite`, `angriffstempo`, `ruestung`,
  `angriffstyp`) fuer Einheiten und Vorposten; `ruestung` fuer Gebaeude.
- Besitzer (`owner`) auf jeder Entity; Oekonomie/Population je Besitzer.
- `combat_system.ts`: Befehls- und Auto-Angriff, Nah/Fern, Schaden minus
  Ruestung, Tod (Entfernen, Pop frei, Raster frei), Fern-Tracer, Lebensbalken
  bei Beschaedigung, Haltungen aggressiv/halten/patrouille.
- `ai_system.ts`: Gegner sammelt, produziert Kampfeinheiten, schickt Wellen.
- Siegbedingung + Overlay (Zuckermaschine zerstoert = SIEG, Apotheke = NIEDERLAGE).

### Erledigt in Auftrag 03 (Bauen + Produktion)

- HUD-Klickblock: `hud.containsPoint` verhindert Durchschlagen ins Spielfeld.
- `build_system.ts`: Ghost-Platzierung (gerastert, gruen/rot, Grundflaeche),
  Kostenabzug, Bautrupp-Anlauf, Baufortschritt, Fertigstellung blockiert Raster.
- `production_system.ts`: Warteschlange, Kostenabzug, Timer, Spawn am
  Rallypunkt, Pop-Kap-Pruefung mit deaktivierten Buttons als Rueckmeldung.
- HUD-Kommandoleiste: kontextabhaengig Bau/Produktion, deaktivierte Buttons,
  Produktionsfortschritt + Warteschlange.
- Daten: `kosten`, `bauzeit`, `grundflaeche`, `produziert`, `baubar`; neues
  Gebaeude **Beet** (Versorgung, pop_kap).

### Erledigt in Auftrag 02 (Interaktion + Wirtschaft)

- Entity-Architektur, `game_state`, Auswahl, Bewegung + A\*, Sammel-Loop, HUD.

## Getroffene Annahmen (Fundament-Session)

- **Phaser-Version:** Das offizielle Template `phaserjs/template-vite-ts` nutzt
  inzwischen Phaser 4. Auftrag verlangt Phaser 3, daher manuelles Setup mit
  Phaser `^3.90.0`. Vermerkt in `docs/ENGINE_REVIEW.md`.
- **Build-Versionen:** Vite `^6.3.1` und TypeScript `~5.7.2` (erprobte
  Template-Versionen) statt der neuesten Major-Releases (Vite 8 / TS 6), um
  Ueberraschungen im Fundament zu vermeiden. Spaeter ggf. anheben.
- **JSON-Laden:** Datenschicht ueber statische `import`-Bindung der JSON
  (resolveJsonModule), nicht per Laufzeit-fetch. Robust fuer Dev und Build.
- **Daten ueber Auftrag hinaus:** units.json und buildings.json wurden um die
  restlichen im `NAMING_CANON` genannten Einheiten/Gebaeude ergaenzt (Werte
  sind Platzhalter, kein Balancing).
- **Kachelgroesse:** 64x32 (2:1-Diamant), Gitter 24x24.

## Getroffene Annahmen (Auftrag 02)

- **Daten ergaenzt:** units.json um `name`, `tempo` (Kacheln/s), `tragkraft`,
  `erntezeit_ms`; buildings.json um `name` und `vorrat` (endliche Knoten).
  Werte sind Platzhalter, kein Balancing.
- **Maus-Routing:** links = Auswahl/Box, rechts = Befehl (Bewegung/Sammeln),
  Mitte-Drag = Kamera-Schwenk (vorher Links-Drag). WASD + Edge-Pan bleiben.
- **Belegung:** Nur Gebaeude und Ressourcenknoten blockieren Kacheln.
  Einheiten blockieren nicht (kein Crowd-Steering in dieser Session), sie
  duerfen sich stapeln.
- **Ziel belegt:** Bewegungsbefehl auf eine belegte Kachel steuert die
  naechstgelegene begehbare Nachbarkachel an (auch fuer Sammeln/Abladen).
- **Sammeln nur Hellmuth:** Selektierbar ist nur Fraktion `hellmuth`
  (Spieler). Destillat wird noch nicht geerntet (bleibt 0).

## Getroffene Annahmen (Auftrag 03)

- **Grundflaeche** als `{w,h}`, Anker ist die obere Ecke (nach +col/+row).
  Gebaeude blockieren ihre ganze Grundflaeche; Apotheke/Beet/Labor sind 2x2.
- **Bauen blockiert sofort** bei Platzierung (nicht erst bei Fertigstellung),
  damit waehrend des Baus nichts ueberlappt.
- **Pop-Reservierung:** Produktion zieht Kosten sofort ab und reserviert Pop
  (`reservedPop`), damit das Kap nicht ueberbucht wird.
- **Maus:** im Platzierungsmodus links = platzieren, rechts/Escape = abbrechen.
- **Picking:** Gebaeude/Knoten werden ueber Grundflaeche ODER gerenderte Bounds
  getroffen (naeherungsweise, wegen hoher iso-Bloecke).

## Bekannte kleine Luecken (spaeter)

- Headless-Tests: `combat_system`/`ai_system` haengen ueber die Entities an
  Phaser und sind nicht headless getestet (Phaser laesst sich nicht ohne
  Weiteres node-bundlen). Spaeter: reine Kampf-Mathematik (Distanz, Schaden)
  in ein Phaser-freies Modul ziehen und testen. `game_state` ist getestet.
- Auto-Acquire-Reichweite ist fix (5 Kacheln); kein Aggro-Leash/Rueckkehr.
- Wellen-Einheiten verfolgen ihr Ziel stur (kein Retarget auf naehere Gegner).
- Bautrupp-Wechsel: Wird der bauende Sammler manuell wegbefohlen, pausiert die
  Baustelle (kein Auto-Ersatzbauer). Spaeter: weiterer Sammler kann andocken.
- Kein Bau-Abbruch mit Ressourcen-Rueckerstattung; kein Produktions-Abbruch.
- Rallypunkt ist ein einzelner Punkt (kein Rally auf Ressource/Gebaeude).
- Platzierung ignoriert stehende Einheiten (nur Gebaeude/Knoten blockieren).
- Auswahl: kein Shift-Add, kein Doppelklick-Typenauswahl, kein Control-Group.
- Bewegung: kein Crowd-Steering, Einheiten koennen sich ueberlappen.
- A\*: lineares Open-Set-Minimum (genuegt fuer 24x24, spaeter Heap).

## Stand: Effekt-Dienst (fx-Geruest, Branch claude/vfx)

Hülle für visuelle Effekte gebaut — **nur das Gerüst**, kein konkreter Effekt
(harte Stopp-Grenze: erst die Effekt-Pakete, dann der Inhalt). Details und
Handler-Vertrag in `src/fx/README.md`.

- **Modul `src/fx/`:** `fx.spawn(type, x, y, opts)`-Dispatcher + Handler-Register
  (`register`) + Pooling-Substrat (`FxPool`) + per-Frame-Treiber-Tick. Technik-
  agnostisch; Handler stecken später ein (Glow/Partikel/Sheet/Bake).
- **Einhängung:** ein Aufruf `installFx(this)` in `GameScene.create()`; der Dienst
  tickt selbst über das Scene-`UPDATE`-Event (kein Code in `update()`). Dev-Hotkey
  **F** feuert einen Platzhalter am Cursor.
- **Platzhalter-Handler `"placeholder"`:** neutrale magenta Diagnose-Raute, bewusst
  kein VFX. Im Browser via `tools/fx_browser.mjs` abgenommen
  (`/tmp/fx/fx_placeholder.png`, 5 Spawns, Pool/Tick belegt).

### Paket A — Fundament-Härtung (S1/S2/S3, eingesteckt)

`systems/fx.ts` gehärtet (erweitert, nicht dupliziert); die drei Techniken sind
die ersten Handler hinter `fx.spawn` (`fx/core_handlers.ts`): `flash`, `sparks`,
`smoke`, `shockwave`, `sheet`. Ein `FxSystem` je Scene (`getFxSystem`), geteilt
mit `death_fx`.

- **S1 Bloom/Fake-Licht:** `installBloom(scene)` = ein Vollbild-Bloom-Pass
  (`cameras.main.postFX.addBloom`, WebGL-gated). `fakeLight(target, opts)`
  parametrisiert Quelle/Destillat/Hain (Alpha **nicht** angehoben, Mote-Frequenz
  280 belassen — Bloom liefert die Helligkeit). Abnahme: WebGL vs Canvas A/B
  (`fx_webgl.png` weicher Saum, Kern getönt, kein Ausbrennen; `fx_canvas.png` ohne).
- **S2 Partikel-Pool:** `burst()` = ein persistenter Emitter je Preset (kein
  `add.particles`/`destroy` pro Aufruf), `maxAliveParticles`-Kappen (Funken 200,
  Rauch 110) + globale Drossel (Σ 500). Funken `ADD`, Rauch `NORMAL`. Abnahme:
  60 Bursts → **1** Emitter.
- **S3 Flipbook-Player:** `playFrames()` mit Group-Pool (maxSize 32), Anker
  `ground|center`, Frame-0-Absicherung. Abnahme: 40 Spawns → **32** aktive Sprites
  (prozedurales Test-Sheet, kein Ship-Asset).
- **Annahme (Assets):** Glow/Dot/Puff sind reine Radial-Gradienten → prozedural
  erzeugt (Projekt-§7), unter den dokumentierten Schlüsseln (`fx_glow_soft_128`,
  `fx_soft_dot`, `fx_puff_soft`, `fx_smoke_puff`); ein echtes PNG gleichen Namens
  überschreibt sie kommentarlos (`exists()`-Gate). Kein Binär-Asset committed.
- **Befund Harness:** Headless-**WebGL**-Capture funktioniert hier (vorinstallierte
  Chrome + swiftshader) — die HUD-Harness-Warnung (Canvas vor Capture entfernen)
  gilt nur für ihren Pfad, nicht für `fx_browser.mjs`. Bloom ist so headless abnehmbar.
- **Offen für Paket C:** `smoke()`-Emitter sind nicht gepoolt (laufend, pro Quelle);
  der Aufrufer stoppt sie (Wrack-Lebensdauer). Echte Effekt-Sheets + `render_effect.py`
  (oder KREA) kommen mit Paket C.

### Paket B — Blut & Leichen (Stufe 1 fertig, Stufe-2-Backend offen)

`systems/blood_system.ts`: zwei Stufen, zwei Substanzen (KEIN Tint), erste
RenderTexture im Projekt. Verdrahtet in `death_fx` (Hit/Tod/Gebaeude + Leichen-
Abdruck nach dem Fade = schliesst das Wrack-Decal-TODO). Handler `blood`/`blood_burst`.

- **Substanzen (prozedural, Platzhalter):** HELLMUTH rotes Blut (matt, unregelmaessig,
  dunkler Kern), MODERAT magenta Ploerre (glaenzend, Glanzpunkt, klebrige Faeden) —
  im Browser als **sichtbar verschiedene** Substanzen abgenommen (`fx_blood.png`).
  Schluessel `blut-hellmuth-1..4`, `ploerre-moderat-1..4` (512²), `*-explo-1..2` (768²);
  echtes PNG gleichen Namens ueberschreibt via `exists()`-Gate.
- **Stufe 1 (Fenster-RT):** 2048×1536 @ halber Aufloesung = **12,6 MB**, kamera-folgend
  (Recenter loescht → Blut weit ausserhalb faellt heraus), Tiefe −96000 (zwischen
  Terrain und Decals). FIFO-Verblassen via **`rt.erase`** mit 6-%-Quad (NICHT
  `fill(0x000000)` — das schwaerzt den leeren Bereich). Stempel-Drossel **24/Frame**
  (im Browser belegt: stamped 24/Frame bei 34 in der Queue).
- **Stufe 2 (persistent):** Backend = **Hybrid Low-Res-RT** (Ticros Wahl c). Blut
  bleibt **bewusst fuer immer** liegen (kuenstlerischer Punkt, kein Fade). ~20 % der
  Toetungen + Gebaeude + Blutexplosionen rufen `stampPersistent`/`bloodBurst`. Im
  Browser abgenommen (`fx_persist.png`): Marken ueberleben Kamera-Roaming + Fenster-
  Recenter.
- **Naht zu Paket C:** `bloodBurst(x,y,faction,scale)` = grosser Stufe-2-Stempel +
  Gib-Burst (Paket-A-Pool), KEIN Feuer. Paket C ruft es via `fx.explosion(register:'blood')`.

### Stufe-2-Backend: Hybrid Low-Res-RT (Ticros Wahl c)

Gemessen: Terrain bei 64×64 @ 160×96 voll ≈ **251 MB**; ½-Res-Persistenz-RT ≈ **63 MB**
(bei 36×36 nur ~21 MB). `HybridPersistBackend`: EINE kartengrosse ½-Res-RT, **lazy**
(erst beim ersten persistenten Stempel) und nur in gespielter Kartengroesse allokiert
(= die Absicherung), verblasst nie, Tiefe −97000 (unter dem Fenster). Bei sehr grossen
Karten stuft die Aufloesung herunter (GPU-Texturlimit). **Austauschbar** ueber
`Stage2Backend` + `setStage2Backend` (Lazy-Default, nicht festgenagelt).

### Paket C — Explosionen & Zauber-FX (Komposit, eingesteckt)

`fx/explosion.ts`: eine Explosion ist ein Komposit ZEITVERSETZTER Schichten
(RA3/SAGE-FXList), kein Einzelclip. `fx.explosion(x,y,register,opts)` +
`explosion`-Handler. `death_fx:onBuildingDied` ersetzt -> Offset-Komposit.

- **Schicht-Timing:** Flash t=0 (160ms) · Feuerball t=0 (400ms) · Debris t=0 ·
  Rauch t=+80ms (~2s) · Sekundaer-Flash t=+120ms · Scorch t=+200ms (bleibt) ·
  Shake t=0 (nur gross+nah). InitialDelay traegt die Wucht.
- **Register** (Farben aus der Fraktionspalette; weitere = Ticros offener Slot):
  MODERAT Magenta-Blitz/oranger Feuerball/Stahlschutt/grauer Rauch; HELLMUTH
  Gold-Blitz/tuerkis Energie(ADD)/viel Funken/kuehle Spur; `blood` -> `bloodBurst`
  (persistenter Stempel + Gibs, KEIN Feuer/Scorch).
- **Neue Helfer:** `FxSystem.releaseSmoke` (Explosions-Puff statt Schlot),
  `BloodSystem.stampScorch` (Brandfleck in die Stufe-2-RT, bleibt), `fx/shake.ts`
  `shakeCamera` (gegated: Accessibility-Toggle + Cooldown 120ms + nur gross+nah;
  `cameras.main.shake` war vorher nirgends).
- **Sheets/Pipeline:** Feuerball spielt `fx_explo_<register>` (Paket-A-S3-Player),
  falls vorhanden; sonst Fallback auf additiven Glow. Echte KREA-/Blender-Sheets
  kommen spaeter (Loop vor Kunst).
- **LOD-Kappe:** ~40 reiche Explosionen/Frame; darueber nur Flash+Funken.
- **Abnahme (WebGL):** MODERAT vs HELLMUTH ohne Beschriftung unterscheidbar
  (`fx_explo.png`), Blutexplosion versprueht persistenten Stempel, Scorch/Rauch
  bleiben (`fx_explo_after.png`, scorched:4).
- **Kalibrierung:** RA3/SAGE-Startwerte (LightPulse ~2333ms, ScorchMarkSize 320 =
  ~2,5 Tiles @ PIXELS_PER_TILE 128) in den Schicht-Helfern, justierbar.
- **Offen (Ticro):** weitere HELLMUTH-Zauber, was bei HELLMUTH explodiert, Farben
  jenseits der Palette, Scorch-Permanenz (Default: bleibt) -- Inhalts-Slots leer.

### Paket D — Physik-Truemmer (optionales Salz, eingesteckt)

`systems/debris_system.ts`: die WENIGEN grossen Hero-Chunks pro grosser Explosion
(der ballistische Klein-Schutt steckt schon in `burst()`/`gravityY`). Getunte,
NICHT-physische Wurfparabel (`y=vy0*t-1/2*g*t^2`, iso-gedaempfte Drift) -- keine
Physik-Engine, kein Ragdoll, kein zerstoerbarer Boden (Ticros Verbote).

- **Pool + Kappe:** Phaser-Group (maxSize 64) + Plain-Object-Pool fuer den Chunk-
  Zustand; `DEBRIS.maxLive=64` global, von der Explosionsrate entkoppelt.
- **Bodenkontakt:** Stempel in Paket Bs Fenster-RT (`stampWindowDecal`) -> Truemmer
  bleiben liegen, ohne dauernde GameObjects.
- **Wiring:** nur bei grossen (nicht-LOD-lite) MODERAT/HELLMUTH-Explosionen
  `getDebrisSystem(scene).throw(x,y,register,DEBRIS.heroChunks)`. `blood` wirft nichts.
- **Substanzen:** `debris-moderat-1..4` (Stahl, grau) / `debris-hellmuth-1..4`
  (Glas/Phiole/Holz), prozedurale 64er-Platzhalter; echtes PNG ueberschreibt.
- **Tuning:** `DEBRIS`-Block in `data/balance.ts` (launchUp/gravity/drift/spin/scale).
- **Abnahme (WebGL):** Chunks fliegen sichtbar + fraktionsverschieden aus den
  Explosionen (`fx_debris.png`), live<=64 (3 Expl. -> 12, 2 -> 8). Landung/Bogen
  laeuft headless im Slowmo (~13x; Phaser klemmt das Riesen-Delta) -> auf echter
  Hardware bei 60 fps voll; die Lande-Stempel nutzen denselben RT-Pfad wie Blut.

### Blut-Paket A — Fundament: gerichtete Fontaene + 5-Min-Persistenz

Verfeinerung der Blut-Engine (auf `7641cae`). Drei Stuecke, dann harte Zaesur
(Mechanismen/Paket B nicht anfassen, bis Ticro verifiziert hat).

- **Strang 1 — gerichtete Spritz-Fontaene:** neuer Handler `blood_splash`
  (`fx/blood_splash.ts`): NORMAL-Blend-Tropfen (kein ADD-Funke) in einem Kegel
  (±0,45 rad) um das Heading `atan2(y-ay, x-ax)`, ballistisch, Settle ->
  `stampWindow` zu `SETTLE_STAMP_CHANCE=0,3` (DRAW_CAP-Schonung). Soft-Cap 400
  Tropfen, gepoolt. **HitEvent um `ax/ay` erweitert** (dynamics-Kopplung: Code3
  setzt sie; fehlen sie -> Aufwaerts-Degradation). `onHit` nutzt es statt des
  flachen `stampWindow`. Abnahme (`fx_splash.png`): rot vs magenta NORMAL,
  Pool ohne Leak (live 48 -> 0, parked 48; drivers 3 -> 0).
- **Substanz-Konstante explizit:** `FACTION_SUBSTANCE` + `substanceColor`
  (HELLMUTH rot `0x961212`, MODERAT magenta `0xc81aa8`) -- NORMAL, kein ADD,
  ohne Eingriff in die Kampflogik.
- **Strang 2 — 5-Min-Persistenz (KANON-Update):** die Stufe-2-RT bleibt NICHT
  mehr fuer immer (der 20/80-Ewigkeits-Split ist kassiert). Derselbe
  `fadeQuad`+ERASE-Mechanismus auf die Stage2-RT, `FADE_ALPHA_PERSIST=0,0743`/6 s
  -> Marke verblasst in exakt ~5,0 min. RT bleibt fester Puffer, waechst nie.
  `stats().persistFill` = decay-gewichteter Fuellgrad-Proxy. Abnahme
  (`fx_persistfade_*.png`): fill 30 -> 3,7 (~2,5 min) -> 0,5 (~5 min); Steady-State
  unter konstanter Stempelrate plateaut bei ~61 (NICHT monoton wachsend).
  Diagnose `pumpPersistFade(n)` erlaubt den Test ohne 5 reale Minuten (headless
  laeuft die Uhr ~13x im Slowmo).
- **Zwei getrennte Stempel-Budgets (Solutions-Fund, gilt durchgehend):**
  `stampWindow`/`stampWindowDecal` -> DRAW_CAP=24/Frame; `stampPersistent` ->
  umgeht DRAW_CAP, schreibt sofort. Persistente Straenge brauchen je eine eigene
  Drossel (relevant fuer kuenftige Pakete).
- **Kanon-Luecke (Default):** Gebaeude-/Scorch-Marken laufen unter denselben
  5-Min-Fade (Ticros Entscheidung offen; Default = gleicher Fade).
- **Naht-Hinweis:** `installDeathFx` ist auf vfx noch nicht an `combat.kill()`
  verdrahtet -> Blut feuert live erst nach dem dynamics-Merge; Tests laufen ueber
  die Headless-Bruecke.

### Blut-Paket B — Mechanismen: Leiche, Spur, Ballistik (mechanisch komplett)

Drei Mechanismen auf dem Fundament (Paket A), alle ueber das geteilte Rueckgrat
(`ctx.drive` + `fx_pool` + `registerCoreFx`). Die zwei getrennten Stempel-Budgets
gelten: persistente Straenge haben je eine EIGENE Drossel (nicht der Fenster-DRAW_CAP).

- **Strang 3 — nachpulsende Leiche (USP):** Handler `corpse_pulse`
  (`fx/corpse_pulse.ts`): N=4 Bursts @ 2,5 Hz, exponentiell abklingend, ~1,6 s
  (sitzt VOR dem 8-s-Wrack-Stempel). Pro Puls Aufwaerts-Mini-Fontaene
  (`blood_splash`) + drip-Fenster-Marke + 15 % persistente Marke. Waechter
  `MAX_PULSE_DRIVERS=120`. Kanon = Herzschlag/Erloeschen, kein Dauerstrom.
  `onUnitDied` feuert es. Abnahme (`fx_pulse.png`): zwei Leichen pulsieren rot vs
  magenta nach; `fx.stats().drivers` drainiert (4 -> 2, pool live 14 -> 4, parked
  0 -> 10 -> kein Leak; volle Drain-zu-0 braucht headless mehr Realzeit).
- **Strang 4 — Verletzungs-Blutspur (<15 % HP):** `WoundTrailSystem`
  (`systems/wound_trail_system.ts`, self-tickend ueber `gameState.units`).
  Distanz-Akkumulator auf ECHTEM Weg (nicht `unit.moving` = Befehls-Absicht);
  je 48 px ein persistenter drip-Tropfen, eigene Drossel
  `WOUND_DRIP_CAP_PER_FRAME=12` (Round-Robin). Abnahme (`fx_wound.png`):
  Verwundeter zieht sichtbare rote Spur, Gesunder NICHT (0 Tropfen), geheilt ->
  stoppt (afterHealDrips 0). Verblasst mit der 5-Min-Regel.
- **Strang 5 — Blut-Ballistik:** Handler `blood_ballistic` = die Debris-Parabel
  (`debris_system.throwBlood`), aber persistente Lande-Stempel (landing-Slot)
  statt Wrack-Decal. Substanz-blind: identische Trajektorie, nur Tint differiert.
  Kappe `bloodDropMax=96`, Pflicht-Lande-Drossel `landingCap=24`/Frame. In die
  `blood`-Explosion verdrahtet. Abnahme: `bloodThrown=28` (2x14) fliegen im Bogen.
- **Strang 6 — Manifest-Slots:** `data/blood_manifest.ts` (`BLOOD_FX_MANIFEST`),
  von `preload` mitgeladen (alle optional, FILE_LOAD_ERROR-graceful). Slot-System
  in `blood_system` (`puddle 512x4 / splash 256x3 / drip 128x3 / landing 256x3 /
  explo 768x2`), `stampWindowSlot`/`stampPersistentSlot`. Prozedurale Platzhalter
  unter denselben Schluesseln; Ticros KREA-PNGs (sprites/effects/) fallen via
  exists()-Gate ein, OHNE Code-Aenderung. Abnahme (MANIFEST): alle Slot-Texturen da.
- **Naht (gilt weiter):** `installDeathFx` feuert live erst nach dem dynamics-Merge;
  `HitEvent.ax/ay` von Code3. Bis dahin treibt die Headless-Bruecke; Sterberaten
  abgeleitet. -> Blut-System ist damit MECHANISCH KOMPLETT (wartet auf KREA + Merge).

### Tooling-Befund

- **Phaser-postFX Bloom/Glow:** in Phaser 3.90 vorhanden (`phaser/src/fx/`),
  **WebGL-only** (Canvas-Renderer inert). Additive Glow-Sprites rendern in beiden
  Renderern → Basis; Bloom nur obendrauf.
- **3D→2D-Flipbook-Bake:** Pipeline als Code da (`tools/render_unit.py`,
  `iso-pipeline/blender_master_rig.py`), **Blender im Container nicht installiert**
  → Effekt-Sheets müssten extern gebacken werden.
- **Headless-Harness (Playwright):** läuft. `npx playwright install` ist blockiert
  (CDN nicht in Egress-Allowlist); vorinstallierter Browser
  `/opt/pw-browsers/chromium-1194` über `PW_CHROME`.

### Getroffene Annahme (Branch)

- Narrativ „von `origin/hopeful-cannon` abzweigen" → reale Branch
  `claude/hopeful-cannon-z94t30` (HUD/Code1, identische HEAD `0764e36`). Neuer
  Branch `claude/vfx` einmalig per GitHub-API angelegt (git push kann im Container
  keinen neuen Branch anlegen, Proxy 413), danach normaler Push.

## Spaeter / nicht in dieser Session

- Echte Schema-Validierung der JSON (z. B. zod) im Loader statt Typ-Cast.
- Drittlizenz-Uebersicht fuer den ersten Release-Build (siehe
  `docs/LICENSE_REVIEW.md`).
- Higgsfield-Assets: Gebaeude, Tiles, UI, Portraits, Effekte.
- Einheiten-Sprites via 3D-Render-Turnaround.
- Steam-Wrapper: Electron + steamworks.js (entschieden 2026-07-03, Blueprint 2 A1) — Umsetzung siehe Hebel H1/H2.
- Minimap, UI-Rahmen, Auswahl-Feedback.
- Touch-/Mobile-Steuerung (aktuell nur Maus + Tastatur).

## Audio-Engine

### Paket A — Fundament (erledigt)

Doku: `docs/AUDIO_ENGINE.md`. Typecheck + Build + `npm run test:audio` gruen.

- **Backend entschieden:** Phaser-`WebAudioSoundManager`-Context als
  Ausgabeschicht (`PhaserAudioBackend`), roher WebAudio als V2-Notausgang. Pro
  Voice 1 Gain + 1 StereoPanner (kein PannerNode -> iOS-sicher).
- **Voice-Limiter** (`voice_limiter.ts`, Phaser-frei, 8 Tests): Dedup vor
  Allokation, Kategorie-Caps + Global-48, Priority-Stealing.
- **Manifest v2** auf Set/Binding/File-Schema; Bindings definiert; fuenf
  Emit-Punkte verdrahtet (sel/command/prod/state).
- **Mess-Bruecke** erweitert: Voice-Zaehler + Stress-Test (`S`).

Getroffene Annahmen:

- **Audio-Web-Root = `public/audio/`** (von Ticro bestaetigt 14.06.; kein
  Kopierschritt nach `game/assets/`).
- **Bus-Hook standardmaessig aktiv**, aber fehlende Dateien sind still (no-op).
  Im Dev-Modus (`?audio-debug=1`) hoerbarer Synthton.
- **AudioManager nach Game-READY initialisiert** (erst dann existiert Phasers
  Sound-Context). Faellt auf rohen WebAudio zurueck, falls nicht vorhanden.

### Paket B — Mix & Raum (erledigt)

- **Strang 6:** Master-`DynamicsCompressor` (Limiter), zwei Gains je Bus
  (`busUser`/`busDuck`), `audio_ducking.ts` (Refcount, tiefste Senkung gewinnt,
  τ = ms/3000). UI-SFX als geschuetzte nicht-positionale Spur (Limiter-Schutz).
- **Strang 2:** Pan(Screen-X) + inverse Distanz, Off-Screen-Hard-Cull (80 px)
  vor Allokation; Kamera ueber `audio.setCamera(cam)`. Kein PannerNode (iOS).
- Tests: `test/audio_mix.test.ts` (Ducking + UI-Schutz). `npm run test:audio`
  laeuft beide Suites (12 Tests gruen).

### Paket C — Inhaltsschicht (erledigt)

- **Streaming-Naht:** Musik/Ambience ueber `MediaElementAudioSourceNode`
  (`streamSet` -> `StreamHandle`), SFX/Voice gepuffert.
- **Strang 3 Barks** (`bark_director`/`bark_state`): Shuffle-Bag, Cooldowns,
  Annoyed, Interruption, ein Sprecher. Emits um `unitType`+`kind` erweitert.
- **Strang 4 Musik** (`music_director`/`music_state`): Crossfade-Zustaende,
  Hysterese (2 Treffer/1500 ms, Hold 6 s), Terminal-Override.
- **Strang 5 Ambience** (`ambience_director`/`ambience_state`): 5x5-Poll/500 ms,
  Hysterese >=3/>=60 %, Crossfade, `biome.entered`. Terrain ueber Stub-Sampler.
- Tests `test/audio_content.test.ts`; `npm run test:audio` = 24 Tests gruen.

### Paket D — Format & Lokalisierung (erledigt)

- **Format-Kette** `[.ogg, .m4a, .mp3]` (`STANDARD_FORMATE`); Phaser-Fallback.
- **Audio-Sprites:** `manifest.sprites` + `AudioFile{sprite,marker}`, Loader laedt
  das Sheet, Backend spielt per `offset`/`dauer`. Beispiel `sfx_ui`.
- **Lokalisierung gehaertet:** EN-Referenz-Fallback (`referenzSprache`),
  Sprache aus Registry (`?lang` > localStorage > Default), **lazy Sprach-Pakete**
  (`ladeSprachpaket`), Laufzeit-Tausch ohne Rebuild.
- Reine Aufloesung in `manifest_resolve.ts` ausgelagert; `test/manifest_resolve`.
  `npm run test:audio` = 30 Tests gruen.

### Physik — Wucht + Variation + Robustheit (erledigt)

- **T1 Wucht:** `explosion.ts` koppelt am Frame t=0 `impact.big`/`impact.small`
  (Sub-Bass nur big, duckt Musik); `fx.building_died`-Binding entfaellt.
- **T2 Anti-Monotonie:** Pitch ±200 Cent + Volume ±1,5 dB pro Voice (`audio_util`).
- **T3 Robustheit:** Musik-Tail-Crossfade-Loop, EN-Puffer-Fallback beim lazy
  Sprachwechsel, Scene-Shutdown `stopAll`, `validateManifest`, Decode-HEAD-Pruefung
  (kein `Unable to decode`-Spam bei leerem public/audio/).
- Tests `test/audio_robust.test.ts`; `npm run test:audio` = 38 Tests gruen.

### Destillat-Audio (Code5)

- Sets `destille.drip` (building_idle, `fx.destillat_produced`) + `parasit.drain`
  (combat_fx, `fx.destillat_dropped`), raeumlich, je 3 optionale Slots,
  per-Set-Jitter. Neue Kategorien building_idle/combat_fx im Limiter + Ducking.
- `EVT_DESTILLAT_PRODUCED` emittiert von `destille_production` (hash-neutral).
- Test `test/audio_destillat.test.ts`; `npm run test:audio` = 43 Tests gruen.

### Offen (nach den Tondateien)

- Echte Tondateien (ElevenLabs) -> droppen ins Set, spielen ohne Code-Aenderung.
  Neu: `impact.big`/`impact.small` (vorgemischt Transient/Body/Sub/Tail).
- Cross-Branch: Terrain-`dominantSort` (editor) in den Ambience-Sampler ziehen.
- Optional Stufe 2 Wucht: prozedurale Schichtung (`detune`/`layers`/`lowpassHz`).

## HUD V2/V3 — Endmontage & Rebuild (zusammengeführt aus docs/TODO.md)

> Konsolidiert am 2026-06-16 (H5): `docs/TODO.md` ist jetzt ein Stub. Diese
> TODO.md ist die **einzige** TODO-Quelle. Offene HUD-Entscheidungen liegen in
> `docs/ENTSCHEIDUNGEN.md`; die ausführliche Mess-/Bau-Historie in
> `docs/HUD-SOLL-SPEC.md` und `docs/HUD-KRISENSTAB.md`.

**Stand (erledigt):**
- V2-Endmontage: Schichtarchitektur S1 (durchlaufende Leisten) + S2 (rahmenlose
  Blüten), König je Fraktion, drei Varianten (`?variant=1|2|3`), Gate auf
  V2-Slot-Gesetze umgestellt.
- HUD-V3 Rebuild A→D durch: A Fundament (Asset-Manifest `src/data/hud_assets.json`),
  B Rahmen (ein getönter Graustufen-Master, Nine-Slice, gekachelte Leiste),
  C Verankerung (`--hud-scale`, kein `transform:scale`; Zier-Eckstücke),
  D Inhalt/Klick (Ressourcen-Zahlen, DOM-Wahrheit für Klick-Geometrie).
- HUD-Anker (Eck-Kleben an Viewport-Ecken), HUD-Reparatur (kanten-differenzierte
  Leisten, Pause-Symbol raus, Sigil nur MODERAT). Belege unter `docs/proof/`.

**Bekannte Materiallücke (kein Fehler, dokumentiert):**
- MODERAT Slot #1 (Eckteil oben links): kein leucht-/tropfenfreies MODERAT-Eck;
  Slot bleibt leer, die durchlaufende S1-Leiste deckt die Ecke. Schließbar, sobald
  ein sauberes Industrie-Eckteil generiert ist. (Auch als Entscheidung A9 geführt.)
- MODERAT-Begleiter: nur drei tropfenfreie Motive (`gvalve_a/b/c`) brauchbar; mehr
  Vielfalt braucht neue, leucht-/tropfenfreie Generierungen.

**Offene HUD-Punkte → `docs/ENTSCHEIDUNGEN.md`:** Ressourcen-Ausrichtung (A1),
Fraktions-Hex (A4), MODERAT-Rahmen-Motiv (A5), König/Hero (A6), MODERAT-LumaStd
(A8), V3-Verdrahtung (A13), V2-vs-V3-Architektur (A14), Minimap-Nebel-Färbung
(C1), Leisten-Asset-Neuschnitt (C2).
