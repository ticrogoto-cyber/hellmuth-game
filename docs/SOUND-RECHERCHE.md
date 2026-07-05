# HELLMUTH — SOUND-DESIGN-RECHERCHE

Konsolidiert aus 14 Subagent-Berichten, Stand 2026-06-17. Bereich: Sound-Design-
Vorarbeit für die Steam-Veröffentlichung. Spielkontext: 2D-Isometrie-RTS, zwei
Fraktionen (HELLMUTH apothekarisch-organisch, MODERAT Industrie-Süßstoff-Casino).
Audio-Engine + Manifest stehen schon (`docs/AUDIO_ENGINE.md`, Pakete A–D + Physik
+ Destillat). Diese MD versorgt das Asset-Sourcing, nicht den Code.

Persönlicher Auftraggeber-Anker: **nach 80 Stunden HELLMUTH soll der Spieler bei
echtem Supermarkt-Kassen-Klingeln eine innere »MODERAT«-Stimme hören.**
Psychologische Konditionierung, kein Ästhetik-Projekt. Alle nachfolgenden Sound-
Entscheidungen messen sich an diesem Anker.

---

## 1 · Tool-Empfehlung (gestaffelt nach Sound-Kategorie)

### Empfohlener Stack

| Rolle | Tool | Tarif | Kosten/Jahr | Begründung |
|---|---|---|---|---|
| **Primäre KI-SFX-Quelle** | ElevenLabs Sound Effects v2 (Creator) | $22/Monat | ~$264 | beste Foley-Generation (Kassen-Ping, Glasklirren, Flaschen-Plopp), 30-s-Loop-Parameter, Royalty-frei, klare AGB für Steam-Embed |
| **Bezahl-Bibliothek (kuratiert)** | **Soundsnap Annual** | $249/Jahr | $249 | Jackpot/Supermarket/Slot/UI-Playlists als kuratierte Fraktions-Bundles; downloads bleiben perpetuell nach Abo-Ende; **klares Steam-OK** |
| **Free-Backup A: CC0-Field** | Freesound (Filter CC0) | gratis | 0 | das Bügelflaschen-Plopp-Pflicht-Sample (Audeption 418511); Wind-/Werkbank-/Mörser-Loops |
| **Free-Backup B: Designed** | ZapSplat Gold | £20/Jahr | ~$25 | attribution-frei, lifetime, designed Material; ergänzt Soundsnap bei Lücken |
| **Stilistische Loops** | Stable Audio 3 (Creator) | ~$12/Monat | ~$144 | Audio-to-Audio-Style-Reference für kohärente Ambient-Loops, lizensierte Trainingsdaten = Steam-tauglich unter 1 Mio. USD Umsatz |
| **Mastering/Konsistenz (Pflicht)** | iZotope Ozone 11 Match EQ **oder** FabFilter Pro-Q 4 EQ Match | Einmalkauf | $200–500 | zwei Fraktions-EQ-Profile als Master-Layer — der einzige verlässliche Weg zu hörbar einheitlichen Fraktionen aus heterogenen Quellen |
| **Foley-Pack-Generator (optional)** | GameSynth (Tsugi) | Einmalkauf | ~$200 | prozedurale Variations-Generierung für Footsteps/Cloth/Impacts; verhindert »Maschinengewehr«-Wiederholungen |

**Jahresbudget (Indie-Variante):** ~$640 Sourcing + ~$300 Mastering einmalig.
**Brutto-Roll:** Soundsnap + ElevenLabs decken ≥ 80 % aller Slots; Freesound +
ZapSplat sind Ergänzung; Stable Audio ist Identitäts-Hebel für Ambient.

### Tool-Eignung pro Sound-Kategorie

| Feld | Beschreibung | Erste Wahl | Zweite Wahl | Vermeiden |
|---|---|---|---|---|
| **A** Welt-Ambient (Loops) | Apotheker-Wind, Industrie-Marketing-Schicht | Stable Audio 3 + ElevenLabs (30-s-Loop) + Freesound (Field-Recording) | ZapSplat | Suno (nur Musik) |
| **B** Einheits-Sounds (Bewegung/Angriff/Tod) | pflanzlich (HELLMUTH) vs. klebrig (MODERAT) | ZapSplat (designed) + Soundsnap (Foley) + Eigen-Foley (Stimmen) | Freesound (CC0) | ElevenLabs (Transienten zu weich) |
| **C** Gebäude (Bau/Idle/Zerstörung) | hölzern vs. industriell | ZapSplat + Soundsnap | ElevenLabs (Idle-Loops) | – |
| **D** UI (Klick/Bestätigung/Menü) | leiser Holz-Klick vs. Kassen-Ping | Eigen-Foley + Soundsnap + Bfxr-/Synth-Patches | ZapSplat | ElevenLabs (Klick-Transienten zu weich) |
| **E** Narzissmus-Spiegel (Pumpe/Halb/Voll) | Konditionierung-Herzstück | ElevenLabs (Vintage-Kerching) + Sub-Bass-Foley | Soundsnap Jackpot-Playlist | Suno (Lizenz-Risiko, keine Indemnification) |
| **F** Sechs Spezial-Signets | Casino-Werbe-Trigger | ElevenLabs SFX (kurz) + Suno (Persona für Jingle-Familie, **Risiko-Augen offen**) | Soundsnap + AudioJungle Einzelkauf | Udio (Walled-Garden seit 11/2025), AudioCraft (CC-BY-NC) |
| **G** Reagenzien + Wellen-Druck + Stinger | drug effects, Wellen, Sieg/Niederlage | ElevenLabs + Stable Audio (Wellen-Drone) + Eigen-Mastering | Soundsnap | AudioCraft, Suno für Stinger |

### Lizenz-Sieger im Überblick

- **GREEN** (sauber für Steam, kein Anwalt nötig): Kenney.nl, Freesound CC0,
  Freesound CC-BY (mit Attribution), ZapSplat Gold, Soundsnap, ElevenLabs Paid
  (eingebettet), Stable Audio (Community License unter 1 Mio. USD).
- **YELLOW** (mit Vorsicht): AudioJungle Music Standard (Kopien-Limit 10 000),
  Pixabay Audio (Upload-Moderation schwach — Lizenz-Zertifikate archivieren),
  Envato Elements (Item-Registrierung pro Projekt pflichtig).
- **RED** (nicht ohne Anwalt): **Suno** (Sony-Klage offen, Summary-Judgement
  07/2026; keine Indemnification), **Udio** (seit 11/2025 Walled-Garden), Adobe
  Stock Standard (deckt Games NICHT), **CC-BY-NC** auf Freesound (Steam-fatal),
  Meta AudioCraft/AudioGen (CC-BY-NC), Sampling+ (retired).

---

## 2 · Sound-Liste nach Themenfeld

Format pro Eintrag: **deutscher Slot-Name** · _englischer Suchbegriff / Prompt_ ·
empfohlene Quelle · Referenz-Spiel (optional).

### A · Welt-Ambient (Loop-fähige Schichten)

**Architektur (Pflicht für jede Fraktion):** drei Layer parallel — Bed-Loop
(durchgehend, 30–90 s, Primzahl-Längen 17/29/41 s gegen 80-h-Gewöhnung),
Scatterer-Oneshots (Pool 6–12 Samples, Random-Trigger 4–18 s, ±3 dB, ±2
Halbtöne), Charakter-Layer (Fraktions-Signatur, sehr leise, langsam pulsierend).
Master-Loudness **−30 ... −24 dBFS RMS** (»felt not heard«). Combat-Ducking:
Ambient duckt −16 dB über 800 ms, Slow-Release 6–10 s zurück.

#### HELLMUTH-Ambient (3 Loops je Bett)

| Slot | Englischer Begriff / Prompt | Empfohlene Quelle |
|---|---|---|
| Bed: Brennnessel-Wind | `wind through dry grass / nettles loop seamless 30s` | Freesound Benboncan-Wind-Pack (https://freesound.org/people/Benboncan/packs/6298/), Lowcut 200 Hz |
| Scatterer: Glas-Klirren fern | `glass bottle gentle clink distant` | Freesound twohoursago (135039), in Scatterer 8–25 s |
| Scatterer: Mörser-Stoß | `stone pestle place into mortar` | ZapSplat v5 (https://www.zapsplat.com/music/stone-pestle-place-into-mortar-version-5/) |
| Charakter-Layer: Werkbank-Knarren | `workshop wooden creak ambience loop` | Freesound jittels/367169, Bandpass 120–600 Hz, −32 dBFS |

#### MODERAT-Ambient (Konditionierungs-Bett — das psychologische Stück)

| Slot | Englischer Begriff / Prompt | Empfohlene Quelle |
|---|---|---|
| Bed: Industrie-Grundrauschen | `industrial low ambient hum loop, 40-80 Hz` | Pixabay industrial-ambience oder ElevenLabs-Prompt _»factory hum 80Hz, sticky drips every 1.7s, faint AM-radio jingle 4s in, glitchy, 30s seamless loop«_ |
| Scatterer: Neon-Flicker | `fluorescent flicker loop` | Freesound kentspublicdomain/777053 + Pixabay neon |
| Scatterer: Lüftung-Whoosh | `mechanical ventilation pressure release` | ZapSplat industrial-loop-3 |
| Scatterer: Kassen-Klick | `modern supermarket scanner beep single` | ZapSplat (https://www.zapsplat.com/music/modern-supermarket-cash-register-self-service-scanner-beep-version-2/), Trigger 6–14 s, **immer rechts-vorne** (räumliche Verankerung) |
| Charakter-Layer: Jingle-Fragment (ungelöst) | _eigene Komposition_: 3-Ton-Motiv C-E-G aufsteigend, **endet auf Dominante**, niemals auf Tonika | DAW (Reaper/Ableton) + Glockenspiel-Sample + Tape-Saturation; Trigger 90–180 s, −30…−26 dBFS |

> **Hinweis Zeigarnik-Effekt:** Das Jingle-Fragment endet ungelöst → das Gehirn
> hält die Tonika subjektiv präsent, baut Spannung über Stunden. Erhöhe die
> Trigger-Frequenz mit `session_duration` (180 s → 120 s nach 30 min). Spieler
> bemerkt es bewusst nie. Solutions-Studie Knoeferle/Spence 2016: 5–10
> Wiederholungen reichen für cross-modale Bahnung.

Referenz-Spiele: Frostpunk (Piotr Musiał, Hope/Discontent-Layering), They Are
Billions (Aktivitäts-Audio-Kopplung), Dorfromantik (organisch dünn).

### B · Einheits-Sounds (Bewegung / Angriff / Schaden / Tod)

Pool-Größen pro Kategorie (siehe Variation-Cooldown-Spec §4):

| Einheitenklasse | Selection | Move | Attack | Death | Idle | Annoyed |
|---|---|---|---|---|---|---|
| Schwarm | 3 | 3 | 2 | 1 | 2 | 3 |
| Standard | 4 | 4 | 3 | 2 | 3 | 5 |
| Held (Hellmuth) | 6 | 5 | 4 | 2 | 4 | 8 |

#### HELLMUTH-Einheiten (pflanzlich, würdig)

| Slot | Englischer Begriff / Prompt | Empfohlene Quelle |
|---|---|---|
| Bewegung | `cotton clothes rustling foley` | Freesound khenshom/481075, OwlStorm Cloth-Foley-Pack 17931 |
| Angriff (Pflanzen-Impact) | `leaves rustle impact`, `wood crack snap dry` | Freesound Kinoton/347557, SONNISS »The Rustle«; ZapSplat `branch break` |
| Schaden | _Foley_: trockener Atem-Aus | selbst aufnehmen |
| Tod (würdig) | `body falls onto soft ground cloth` + Atem-Aus | ZapSplat + Eigen-Foley |
| Stimmen | Eigen-Aufnahme (1 Sprecher pro Rolle, 8 Sätze × 6 Einheiten = 48 Takes) | Reaper + Kondensator-Mikro |

#### MODERAT-Einheiten (klebrig, smacking, Komik-Anflug beim Tod)

| Slot | Englischer Begriff / Prompt | Empfohlene Quelle |
|---|---|---|
| Bewegung | `squelch step sticky foot wet smack` | ZapSplat-Kategorie »Squelch and Splat« (143 Sounds) |
| Angriff (fettiger Impact) | `gore wet fleshy impact squash`, `body hit wet ground puddle` | ZapSplat (gore-wet-fleshy-bloody-impact-squash) |
| Schaden | `cartoon boing soft` + Chewing-Layer | ZapSplat Cartoon-Impact + Eating-and-Biting-Kategorie |
| Tod (Komik) | Splat + »yummy«-Layer + Konsum-Knall | ZapSplat Squelch + Eigen-Foley |
| Stimmen | _Eigen_-Aufnahme mit Pitch-Mod / Bit-Crush 12 bit | DAW |

Referenz: Warcraft 2 (Sample-Längen 800–1400 ms = natürlicher Cooldown), SC2
(Pissed-Eskalation in Stufen), CoH3-Patchnotes 2024 (Voiceover-Selection-Logik
verfeinert gegen memorable-line-recall).

### C · Gebäude (Bau-Start / Bau-Fertig / Idle / Zerstörung)

#### HELLMUTH-Gebäude

| Slot | Quelle | Notiz |
|---|---|---|
| Bau-Start | ZapSplat `hammer hitting nail into wood` | RF |
| Bau-Fertig | ZapSplat `hammer hit wooden decking plank 2` + Glas-Klink-Tail | Layer |
| Zerstörung | ZapSplat `large wood structure collapse 6` | RF |
| Idle-Loop | ElevenLabs-Prompt _»wooden creak loop 8s, soft wind, distant glass clink every 4s, dry«_ | KI |

#### MODERAT-Gebäude

| Slot | Quelle | Notiz |
|---|---|---|
| Bau-Start | ZapSplat `industrial generator loop 3` + Münzeinwurf | Layer |
| Bau-Fertig | ZapSplat `slot machine jackpot tone 2 long` | RF |
| Zerstörung | ZapSplat `large building collapse with glass breaking 4` | RF |
| Idle-Loop | ElevenLabs-Prompt _»factory hum 80Hz, sticky drips every 1.7s, faint AM-radio jingle 4s in, glitchy«_ | KI |

### D · UI (Button-Klick / Befehl / Auswahl / Menü)

Designdoktrin (Marshall McGee, Karen Collins): UI = **Logo-Design für Ohren**,
nicht Foley. ≤ 120 ms, zweischichtig (Body + Detail), ohne Hall. Pro Event 3–5
Varianten (Round-Robin), Pitch ±10 %, Volume ±3 dB. Frequenzteilung: Klick low,
Bestätigung mid, Auswahl high — keine zwei UI-Sounds im selben Band.

#### HELLMUTH-UI (leiser Holz-Klick)

| Slot | Quelle |
|---|---|
| Button-Klick | ElevenLabs-Prompt _»single dry wooden tap, 90ms, 400Hz body, no reverb«_ — 5 Varianten |
| Befehl-Bestätigung | Freesound 418511 (Bügelflaschen-Plopp) abgeschwächt −10 dB |
| Auswahl | ZapSplat Finger-Pull-Pop, gekürzt 60 ms |
| Menü-Auf | ZapSplat Cartoon-Swipe + Holz-Schubladen-Layer |
| Menü-Zu | Reverse von Menü-Auf, −3 dB Tail |

#### MODERAT-UI (Kassen-Ping / bunter Spielautomaten-Klick)

| Slot | Quelle |
|---|---|
| Button-Klick | ZapSplat `coin insert into casino slot machine with beep`, gekürzt 100 ms |
| Befehl-Bestätigung | ZapSplat `arcade slot machine payout/collect tone` |
| Auswahl | BOOM Library `Casual UI` Sparkle-Variante |
| Menü-Auf | ElevenLabs-Prompt _»plastic casino chip clatter 200ms + neon hum tail 400ms«_ |
| Menü-Zu | ElevenLabs-Prompt _»reverse jingle stinger 300ms, vibraphone, tape-wow«_ |

#### Wunsch-Kopplung: Verteidigungsturm-Ladegeräusch (Bügelflaschen-Plopp)

**4-Layer-Stack (Gesamt ~220–280 ms):**

1. **Body** — Freesound `Audeption/418511` (https://freesound.org/people/Audeption/sounds/418511/), CC0 (vor Download Lizenz prüfen — 99 % der Audeption-Uploads sind CC0), −6 dB
2. **Pressure** — Freesound `EricsSoundschmiede/514085` Champagner-Plopp, HP 200 Hz, −9 dB, 20 ms Pre-Delay
3. **Mechanik-Click** — Eigen-Aufnahme Mouth-Pop (Lippen-Plopp ins Smartphone-Mikro), HP 400 Hz, −12 dB → imitiert das Bügel-Klacken
4. **Tail** — 80 ms Pink-Noise-Hiss durch BP 2 kHz, −18 dB, Fade-out 120 ms → simuliert entweichendes CO₂

Bus: leichter Plate-Reverb 0,6 s, 8 % wet. Limiter −0,3 dB. Pitch-Random ±6 %
zur Vermeidung der »Same-Sample«-Erkennung beim 30-s-Schussintervall. Bei
MODERAT zusätzlich +6 dB Sub-Drop bei 60 Hz und 200 ms Pingpong-Delay-Tail.

### E · Narzissmus-Spiegel (das psychologische Herzstück)

Dreiphasen-Architektur:

#### Phase 1 — Spiegel füllt sich (jeder Kill)

»Pumpe«: subtile dumpfe Münze-fällt-in-Slot-Resonanz. **Felt not heard.**

**Frequenz-Doktrin** (aus Spielautomaten-Audio-Forschung):
- Sub-Bereich 50–80 Hz Fundamental (55–65 Hz Sweet Spot)
- Sinus + Sub-Click-Layer bei 800 Hz für unbewussten »Position«-Cue
- Hüllkurve: Attack 1–10 ms, Decay 50–100 ms, Release 20–50 ms, Gesamt 80–150 ms
- Sidechain-Trick: −2 dB Mid-Range-Duck für 80 ms (Pumpe sitzt am Schädel ohne lauter zu sein)
- Pitch-Randomization ±2 Halbtöne, Volume ±3 dB pro Trigger

**Layer-Rezept (Phase 1, −28 LUFS):**
- A: Sinus 58 Hz, Attack 5 ms, Decay 80 ms, Release 30 ms, −24 dB
- B: Foley »distant slot reel thud« (Lowpass 200 Hz), −30 dB
- C: Sub-Click 800 Hz, 4 ms, −36 dB (Positions-Cue)

ElevenLabs-Prompt: _»Subterranean muffled bass thud from inside an old slot
machine cabinet, very short, no high frequencies, felt rather than heard, single
hit, dry.«_

#### Phase 2 — Spiegel halb voll

Kein neuer Sound. Trigger-Frequenz von 1 pro Kill auf **1,5 pro Kill** (Overlap
erlaubt, max. 3 Stimmen). Optional sub-bewusster 50-Hz-Drone bei −40 dB als
Spannungsteppich.

#### Phase 3 — Spiegel voll (Jackpot, einmalig, max 700–800 ms)

**Kritische Regel:** über 800 ms kippt der Jackpot-Jingle in Looney-Tunes-
Comedy. Maximale Dauer einhalten.

**Vintage mechanisch > digital cha-ching.** Begründung: Dixon-2013-Studie
misst die 75-%-Zufriedenheit am **mechanischen Kerching**, nicht am digitalen
Beep. Mechanische Sounds enthalten unregelmäßige Obertöne (Hammer-Anschlag,
Federmechanik), die das Ohr als »real« liest.

**Layer-Rezept (Phase 3, −12 LUFS):**
- A: Vintage mechanisches Kerching, ungekürzt (300 ms) — z. B. A Sound Effect
  `Antique Cash Registers` (https://www.asoundeffect.com/sound-library/antique-cash-registers/) oder ElevenLabs-Prompt unten
- B: Aufsteigende Glockensequenz in C-Dur, C5–E5–G5–C6, je 80 ms
- C: Münzregen (200 ms, Hochpass 1 kHz), abgeschnitten bei 600 ms gesamt
- D: Sub-Bass-Hit 50 Hz unter dem Kerching (taktiler Anker zur Phase-1-Pumpe)
- Magenta-Flash synchron auf Layer-B-Onset, **nicht** auf Kerching-Onset

ElevenLabs-Prompt: _»Vintage 1920s mechanical cash register kerching, brass bell
resonance, single emphatic hit with metallic spring decay, followed by ascending
bell jingle in C major, three coins dropping on wood at the end, warm analog, no
digital artifacts.«_ — 4 Generationen anstoßen ($0,48), beste auswählen.

**Backup:** AudioJungle Item 22461690 »Cash Register Ka-Ching«
(https://audiojungle.net/item/cash-register-kaching/22461690), $1–5 Einzelkauf,
Music Standard License (1 Endprodukt, 10 000-Kopien-Limit).

Referenz: Thrill Kill (Bar-Fill-Mechanik), C&C Generals (Power-Trigger-Sounds).
Wissenschaftlich belegt: Dixon et al. 2013 (sound-präsentierte »LDW« erhöhen
Gewinn-Überschätzung um 24 %), Knoeferle/Spence 2016 (cross-modale Bahnung nach
5–10 Wiederholungen messbar), Schüll 2012 »Addiction by Design« (variable
Verstärkung + Audio-Reward = »Maschinen-Toleranz«).

### F · Sechs Spezialfähigkeit-Sound-Signets (MODERAT)

Vorlage: C&C-Generals-»General's Powers«-Architektur. **0,8–1,5 s Klang +
optionale Voice-Line.** Mix-Bus UI/HUD, zentriert, **−6 LUFS short-term**, Peak
≤ −1 dBTP. Harter Attack (≤ 5 ms), schneller Tail-Fade (60–120 ms). Sidechain-
Duck auf Musik 300–400 ms.

#### F1 — Discounter-Glück (~1,4 s)

- 0–150 ms: Schubladen-Klick (EQ-Cut < 200 Hz)
- 80–650 ms: Bell-Ding (2,8–3,2 kHz Spitze, +6 dB Sweet-Spot)
- 400–1100 ms: Sale-Klingelei (Ding-Dong, Reverb)
- 1100–1400 ms: Plate-Reverb-Tail (RT60 0,4 s)

ElevenLabs-Prompt: _»vintage mechanical cash register cha-ching, single short
ding, drawer slide opening, crisp foley, no music, 1.2 seconds«_

#### F2 — Erfolgsmeldung (~2,3 s)

- 0–50 ms: Korken-Pop (Kompressor 4:1, schneller Attack)
- 40–260 ms: Schaum-Hiss (HP 800 Hz, −9 dB)
- 200–1800 ms: Mittelgroßer Saal-Applaus (8–12 Personen — **wirkt zynischer als
  Stadion**), Bandpass 400 Hz – 6 kHz
- 1800–2300 ms: Crowd-Tail-Fade

ElevenLabs-Prompt: _»champagne bottle cork pop with quick foam hiss, close mic,
single pop, 0.4 seconds, dry«_ + ElevenLabs Applause Generator.

#### F3 — Sonderangebot (~2,2 s, »50 %-Off«)

- 0–80 ms: Lever-Pull-Click (Tarn-Anker für »du hast aktiviert«)
- 100–900 ms: Rising-Arp drei aufsteigende Glocken (C-E-G) Glockenspiel, **leicht
  detuned ±8 Cent** gegen Asset-Store-Sauberkeit
- 900–1900 ms: Coin-Cascade Granular (~30 Hits)
- 1900–2200 ms: Reverb 0,5 s

ElevenLabs-Prompt: _»slot machine win sound, ascending three coin chimes followed
by rapid coin payout cascade, 1.8 seconds, bright, no voice«_

#### F4 — Werbekampagne (~1,8 s, Drei-Ton-Jingle)

Sonic-Logo-Architektur (Intel-Bong, McDonald's-»Ba-Da-Ba-Ba-Baa«):
- Mediante E5 (0–400 ms): FM-Glockensynth + Mallet-Verdoppelung
- Quinte G5 (350–750 ms): + Sub-Layer (Sine, eine Oktave tiefer)
- Oktave C6 (700–1300 ms): + Plate-Reverb (RT60 1,2 s), **Pitch-Bend +2 Cent**
- Sub-Boom-Drop (700–900 ms): tiefe Trailer-Bass-Drop unter Ton 3 (ironisches
  Overshoot)

Stable-Audio-Prompt: _»corporate sonic logo, three ascending synth bells, major
triad, optimistic, glossy, plastic-bright, 1.5 seconds, no drums, ending stinger«_

**Anti-Cliché-Hebel:** ein Cent leicht detunen, einen Ton minimal verzerren
(Bit-Crush 12 bit) — signalisiert »zu süß, etwas faul«.

#### F5 — Studie veröffentlicht (~2,0 s)

- 0–1200 ms: Hotel-Service-Glocke (4–5 kHz Resonanz), Tape-Saturation
- 250–600 ms: Stempel-Slam (Holz-Griff-Thud + Papier-Crunch, EQ-Cut > 5 kHz)
- 600–1500 ms: Papier-Rascheln (Granular-Foley)
- 1200–2000 ms: Bell-Sympathie-Resonanz

**Pointe:** Stempel landet **bevor** die Bell ausklingt → bürokratische Realität
überrollt Wissenschafts-Ritual.

#### F6 — Influencer-Sturm (~2,4 s, hart abgeschnitten)

- Ping 1 (0–300 ms): Standard-Notification, mittig
- Ping 2 (150–450 ms): +200 Cent, leicht links
- Ping 3 (350–650 ms): −100 Cent, leicht rechts
- Ping 4–7 (600–1800 ms): Granular-Stutter, Pitch ±300 Cent, Bit-Crush 16→8 bit,
  Tempo beschleunigend
- Distortion-Bus (1500–2400 ms): Overdrive + Tape-Hiss
- **Hard-Cut bei 2400 ms (kein Tail)** — psychisches Abreißen wie Algorithmus-Refresh

ElevenLabs-Prompt: _»iPhone-style notification ping, single bright two-tone bell,
0.3 seconds, clean«_ — 6 Variationen für Layering.

**Übergreifende Kohärenz-Doktrin:** alle sechs Signets teilen dieselbe
Bell-Familie (Hotel-Service-Glocke als Leitmotiv-Sample, durch Pitch/EQ je
Signet umgeformt) → Wiedererkennung als MODERAT-Klang-Welt. In jedem Signet
**ein Element, das den Versprechungs-Ton minimal bricht** (Bit-Crush, Detune,
Sub-Boom-Overshoot, harter Cut ohne Tail).

### G · Welt-Reagenzien, Wellen-Druck, Stinger

#### G1 — Drogenkonsum-Effekt eintritt

**Designprinzip:** Disco Elysium / Cultist Simulator / Outer Wilds — **karger
Raum + eine einzelne sinnliche Geste**. Kein »magic sparkle«, kein »evil whoosh«.

**HELLMUTH-Tinktur (~2,2 s):**
- 0–200 ms: leiser Glas-Tap (Pipette an Phiolen-Rand), Foley, dry, −14 dB
- 150–1800 ms: tiefer Atemzug, HPF 200 Hz, −18 dB (**Körper-Reaktion, nicht
  Magie**)
- 400–2200 ms: Bowed-Glas-Drone, reine Quinte, Fade-in, **kein Hall**

**MODERAT-Konsum-Trigger (~1,4 s):**
- 0–60 ms: Plastik-Crack 4–6 kHz, sehr kurz
- 50–600 ms: Soda-Zischen, Bandpass 2–3 kHz, Bitcrush 12 bit
- 200–1400 ms: Sinus aufsteigend 220 → 380 Hz, **abrupt abgeschnitten bei 380 Hz**
  → kein Belohnungs-Bogen, sondern abgewürgte Erwartung

#### G2 — Wellen-Druck-Aufbau (TAB-Modell)

**Hüllkurve über 60-s-Welle:**

| Sek | Layer | Pegel | Wahrnehmung |
|---|---|---|---|
| 0–10 | Sub-Drone 40 Hz | −30 dB | unter Bewusstsein, **körperlich** |
| 10–25 | + Drone 80 Hz Quint | −28 → −24 dB | »Druck im Brustkorb« |
| 25–40 | + Cello-Bow 160 Hz, Tremolo 0,3 Hz | −22 dB | bewusst, nicht Melodie |
| 40–55 | + Atmungs-Foley (6/min) | −24 dB | leichtes Stress-Signal |
| 55–60 | Bow-Pressure-Knack | −12 dB Peak | bewusst, »jetzt« |

**Sub-Bass 40 Hz wird »mehr gespürt als gehört«** → Fight-or-Flight unter
Bewusstsein. Sound wird **nie lautlos** (Drone bleibt zwischen Wellen bei
−35 dB). FMOD `WaveIntensity` Parameter (0–1), 5 Stems, Vertical
Re-Orchestration.

ElevenLabs-Prompt: _»40 Hz sine sub-bass, 60-second sustain, very slow 0.2 Hz
amplitude modulation, –6 dBFS, mono, no reverb«_

#### G3 — Sieg / Niederlage-Stinger (pro Fraktion)

**HELLMUTH-Sieg (~1,8 s, ehrlich-traurig):**
- Tibetischer Klang-Bowl auf C3, lange Decay 1,5 s
- Klavier-Einzelton C5, −18 dB, leichter Flügel-Pedalhall
- Affekt: »Es ist vorbei, niemand jubelt.«

**HELLMUTH-Niederlage (~1,2 s):**
- Gepresster Bowl auf G2 (Dämpfer am Rand, Decay 0,8 s)
- **KEIN zweiter Anschlag, KEIN melodischer Abschluss.**

**MODERAT-Sieg »falscher Triumph« (~2,4 s — drei Lügen-Verfahren parallel):**
1. **Detune-Drift:** Trompeten-Fanfare 4 Töne C-Dur, eine Stimme −17 Cent
   verstimmt (knapp unter bewusster Wahrnehmung)
2. **Dissonantes Diskant-Layer:** Triangel F#5 (Tritonus zu C) bei 0,3 s, −22 dB
3. **Zu langer Reverb-Tail:** Plate 4,5 s an einer 1,2-s-Phrase

**MODERAT-Niederlage »erstickter Slot« (~1,5 s):**
- Slot-Win-Coin-Rolle für 0,4 s
- **Tape-Stop-Effekt** (Pitch-Drop 100 % über 200 ms) würgt ab
- Bit-Crush-Glitch (12 bit → 4 bit Sprung)
- Affekt: »Jackpot, der nicht ausgezahlt wird.«

Referenz: Bioshock-Endung (Audio-Cues, die durch einen Riss als Lüge entlarven),
Spec Ops: The Line (Audio gegen Triumph-Behauptung).

---

## 3 · Psychologische Verankerung

Diese MD ist kein Ästhetik-Projekt. Jeder Sound-Entscheid steht oder fällt mit
der Frage: **Konditioniert er den Spieler in Richtung des persönlichen Anker-
Ziels?** (»Nach 80 h sagt eine innere Stimme im Supermarkt: MODERAT.«)

### Wissenschaftliche Belege

| Autor / Studie | Befund | Konsequenz für HELLMUTH |
|---|---|---|
| **Dixon et al. 2013, University of Waterloo** ([Pubmed](https://pubmed.ncbi.nlm.nih.gov/24198088/)) | Sound-Bedingung erhöht Gewinn-Überschätzung um 24 % bei Slot-Spielern (»Losses Disguised as Wins«) | Phase-1-Pumpe + Phase-3-Jackpot wirken auch bei De-facto-Verlust (= Cooldown-Ressource ausgegeben). |
| **Knoeferle/Spence 2016** ([Pubmed](https://pubmed.ncbi.nlm.nih.gov/27295466/)) | Cross-modale Bahnung durch Sonic Logo nach 5–10 Wiederholungen messbar | Das Jingle-Fragment im MODERAT-Ambient (alle 90–180 s) erreicht nach ~10 min die Bahnungs-Schwelle. |
| **Schüll 2012 »Addiction by Design«** ([Princeton](https://press.princeton.edu/books/paperback/9780691160887/addiction-by-design)) | Spielautomaten-Designer investieren 1 Monat für 1 »bing!«-Sound — »satisfying, comforting, not annoying« | Das Jackpot-Sample ist nicht beliebig. Vintage mechanisch > digital cha-ching. |
| **Cash-Register-Studie** ([Columbia Insights](https://thingscope.cs.columbia.edu/cash-register-sound)) | 75 % Konsumenten-Zufriedenheits-Anstieg bei klassischem Cha-Ching vs. generischem Beep | Vintage-Kerching ist der Pawlow-Stellvertreter für »Gewinn / Befriedigung« seit 140 Jahren. |
| **Spielautomaten-Tonart-Standardisierung** ([20k Hertz Podcast](https://www.20k.org/episodes/slotmachines)) | C-Dur-Stimmung auf dem Casino-Floor → »harmonic cohesion«, nie Dissonanz | Alle MODERAT-Trigger in C-Dur halten. Phase-3-Jackpot C-E-G-C. |

### Kipp-Punkte (wann der Trick nicht mehr funktioniert)

1. **Audio-Fatigue:** identischer Pitch über 80 h → Spieler stumpft ab.
   Gegenmaßnahmen: Pitch-Random ±2 Halbtöne, Velocity ±3 dB, Layer-Kreuz-
   Randomisierung. (Bereits in HELLMUTH-Engine via `jitterPitchCents`/`jitterDb`.)
2. **Looney-Tunes-Kipp:** Jackpot-Jingle > 1200 ms wird als Comedy gelesen.
   Maximum 800 ms.
3. **Asset-Store-Geruch:** unbearbeitete Stock-Hits, sauberer Studio-Schlusshall,
   keine Detune/Saturation. Anti-Cliché-Hebel: Tape-Saturation +0,3 % THD, Pitch-
   Detune ±3–8 Cent, Foley-Bett unter jedem Signet, ironischer Riss in jedem
   Trigger.

### Ethik-Notiz (kurz, neutral)

Zagal/Björk 2013 klassifizieren genau dieses Muster (variable Verstärkung +
Audio-Reward) als »Dark Game Design Pattern«. Bogost steht in der Tradition
kritischer Spieldesign-Analyse (»Cow Clicker« als ironische Bloßstellung der
Skinner-Box). Eingesetzt **gegen** MODERAT, also mit explizitem In-Game-Frame
als _Mechanik der Selbstvergiftung_, ist die Konditionierung deklariert und
re-flektiert — das ist genau der Hebel, den Bogosts »procedural rhetoric«
vorsieht.

---

## 4 · Variation-Cooldown-Spec

Engine bereits gebaut (`hellmuth/src/audio/bark_state.ts`, `voice_limiter.ts`).
Diese Spec dokumentiert die empfohlenen Werte, die der Engine vom Auftraggeber
mitgegeben werden sollen.

### Pool-Größen pro Einheitenklasse

```
Pro Einheit-Typ × Kategorie:
  Schwarm   : select=3 move=3 attack=2 death=1 idle=2 annoyed=3
  Standard  : select=4 move=4 attack=3 death=2 idle=3 annoyed=5
  Held      : select=6 move=5 attack=4 death=2 idle=4 annoyed=8

Shuffle-Bag (bereits im Engine): jede Variante einmal vor Nachfüllen,
kein Sofort-Wiederholer ueber die Grenze.
```

### Cooldowns (ms)

| Kategorie | Industrie-Median | HELLMUTH-Default (Stand 2026-06) | **Empfehlung Spec** |
|---|---|---|---|
| Select | 300–500 | 350 | **300** (knapper) |
| Move/Befehl | 500–800 | 600 | **600** (beibehalten) |
| Attack | 200–400 | nicht definiert | **300** (ergänzen) |
| Death | 0 | 0 | **0** (nie blocken) |
| Idle | 8 000–15 000 | 12 000 | **12 000** (beibehalten) |
| Annoyed-Trigger | 4–6 Klicks in <1500 ms | **6 / 1200** | **5 / 1500** |

Begründung **5 / 1500**: 6/1200 ist zu eng — normale Mehrfach-Selektion bei
Mikrokontrolle löst Annoyed unbeabsichtigt aus. WC3-Designziel war »Spieler muss
bewusst spammen«, nicht »Spieler-Hand zittert«.

### Prioritäts-/Stealing-Hierarchie

Wwise-Skala 1–100, höher = wichtiger. Bei Gleichstand: oldest discard.

| Kategorie | Priorität | Stealing-Verhalten |
|---|---|---|
| Death | 100 | unterbricht ALLES, nie unterbrochen |
| Attack-Reaction | 80 | unterbricht Befehl/Select/Idle |
| Befehl (Move/Order) | 60 | unterbricht Select/Idle |
| Annoyed | 45 | knapp über Select |
| Selection | 40 | unterbricht Idle |
| Idle | 20 | wird von allem geschnitten |

HELLMUTH-Vorgabe »Death > Befehl > Selektion > Idle« bestätigt.

### Multi-Select / Anti-Cluster

**`units[0]` spricht allein** = Stand der Technik (WC3/SC2-`SoundOnce`-Mechanik).
Gestaffelt-Variante (Total War WARHAMMER) wurde von der Community nachweislich
als »obnoxious« empfunden. **Beibehalten.**

Bei gemischter Auswahl: Held > Spezialist > Standard.

### Drei konkrete Verfeinerungen am vorhandenen `BarkKern`

1. **Faction-Override einbauen.** `BarkKernCfg` braucht
   `factionOverride: Record<string, Partial<BarkKernCfg>>` damit MODERAT auf
   `annoyedClicks=4` (klebrig-genervt) und HELLMUTH auf `7` (würdig-geduldig)
   tunbar ist. Heute nur globaler Wert.
2. **`barkDauer=1200ms` ist eine Lüge.** Echte Samples variieren 400–2500 ms.
   AudioManager sollte nach `playSet()` die tatsächliche Sample-Länge
   zurückgeben, `BarkKern` setzt `curBis = nowMs + tatsaechlicheLaenge`.
3. **`postAnnoyedSelectLock = 1500` ms** ergänzen — nach ausgelöstem Annoyed
   sollten Select-Sprüche 1,5 s gesperrt sein, sonst spielt der nächste Klick
   ein normales »Ja?« hinterher und bricht den Witz.

Quellen: Blizzard-Postmortems, Liquipedia-Datamining, Hive-Workshop-Quote-Guides,
Pixel-Crushers-Bark-System-Doku, Audiokinetic-Wwise-Lessons.

---

## 5 · Risiken und Fallen

### A · Lizenz-Fallen für Steam-Release

**Vor jedem Sample-Einkauf/-Download (5-Schritte-Checkliste):**

1. **Lizenztext PDF speichern und mit Datum versehen.** Lizenzen ändern sich
   (Pixabay 2019, Suno 2025). Beweis später nur mit Snapshot.
2. **Tier prüfen.** ElevenLabs Free, Suno Basic, Adobe Standard, Freesound
   CC-BY-NC: alle vier sind Steam-Tot. Niemals Free-Tier-Output kommerziell.
3. **Stückzahl-Limit prüfen.** AudioJungle 10 000-Grenze, Envato Single-Use.
   Vor Steam-Launch hochrechnen.
4. **Standalone-Verbot prüfen.** ElevenLabs, Adobe, Pixabay, Soundsnap: Audio
   darf nicht extrahierbar als Asset verkauft werden. **Kein separater OST auf
   Bandcamp**, kein Asset-Pack.
5. **Indemnification dokumentieren.** Wer haftet bei Infringement-Claim? Suno
   NEIN, ElevenLabs JA für Audio-Output, Stock-Libraries meist JA bis
   Lizenzsumme. Bei NEIN nicht für Hero-Tracks nutzen.

**Bonus-Regel:** Pro genutztem Sound einen CSV-Eintrag pflegen: Quelle, Lizenz,
Datum, URL, Lizenz-PDF-Pfad. Bei DMCA-Counterclaim ist diese Liste der
Unterschied zwischen 48-h-Reinstellung und Permadelist.

### B · Stilbrüche

| Falle | Symptom | Gegenmittel |
|---|---|---|
| Magic-sparkle-Konsum-Effekt | Drogen-Wirkung klingt wie 90er-Disney-Fee | körperhafte Geste statt Glitzer (Atem, Bowed-Glass) |
| Kassen-Klingel zu nostalgisch | MODERAT klingt nach Großmutter-Greißler | EQ-Brightener +6 dB bei 4 kHz, leichte Sättigung |
| Werbe-Jingle löst sich auf | Tonika erreicht → konditioniert nicht | Jingle **endet auf Dominante**, niemals auf Tonika (Zeigarnik) |
| Jackpot > 800 ms | Looney-Tunes-Comedy | Hartes Cropping, Layer-C-Limit |
| Identischer Pitch über 80 h | Spieler stumpft ab, Konditionierung versagt | Pitch-Random ±2 ST (im Engine: `jitterPitchCents`) |
| MODERAT klingt zu ehrlich | Falscher Triumph wird nicht als falsch erkannt | Detune-Drift einer Stimme −17 Cent, Tritonus-Triangel, zu langer Reverb-Tail |
| HELLMUTH klingt zu episch | wirkt selbst wie Konsum-Pose | Mix-Headroom −14 LUFS (vs. −10 für MODERAT), kein Sidechain-Pumpen, ein-Adjektiv-pro-Substantiv-Doktrin |
| Asset-Store-Geruch | unbearbeitete Stock-Hits, sauberer Studio-Hall | Tape-Saturation +0,3 % THD, Foley-Bett, ironischer Riss |
| MODERAT-Signets klingen wie WC3-Powers | C&C-Schatten überdeckt eigenen Charakter | Hotel-Service-Glocke als Leitmotiv durch alle 6 Signets, Pitch/EQ-Variation |

### C · Engine-/Mechanik-Fallen

- **Annoyed-Trigger zu eng (6/1200):** löst bei Mikro-Selektion versehentlich
  aus → Anpassung auf 5/1500 (siehe §4).
- **Multi-Select gestaffelt statt `units[0]`:** Kakophonie (Total War WARHAMMER
  als Negativ-Beispiel). Beibehalten.
- **`barkDauer` fix statt aus Sample-Länge:** Geist-Sperren oder verschluckte
  Folgesprüche. AudioManager muss Sample-Länge melden.
- **Jingle-Trigger-Rate statisch:** verpasst die unbewusste Dosis-Steigerung.
  Mit `session_duration` koppeln (180 s → 120 s nach 30 min).

---

## 6 · Konkrete Such-Befehle (copy-paste-ready)

### Freesound (Filter CC0 + Lizenz im Download bestätigen!)

```
license:"Creative Commons 0" tag:loop duration:[20 TO 60]
license:"Creative Commons 0" tag:wind tag:grass
license:"Creative Commons 0" tag:fluorescent tag:flicker
license:"Creative Commons 0" tag:mortar tag:stone
license:"Creative Commons 0" tag:cash tag:register
license:"Creative Commons 0" tag:swing tag:top tag:beer
license:"Creative Commons 0" tag:champagne
license:"Creative Commons 0" tag:bell tag:small
license:"Creative Commons 0" tag:squelch tag:wet
license:"Creative Commons 0" tag:notification

User-Search: Benboncan, Robinhood76, kentspublicdomain, jittels, Audeption,
            EricsSoundschmiede, twohoursago, lukaso, mmaruska, felix.blume,
            khenshom, Kinoton, GowlerMusic
```

### ZapSplat (Account nötig, Standard mit Attribution oder Gold £20/Jahr)

```
opening a beer bottle with swing top
finger pull from top of empty glass bottle, pop
cash register old fashioned open ka-ching
modern supermarket cash register self service scanner beep
arcade game slot machine jackpot tone long
arcade game slot machine payout collect tone
champagne bottle cork pop open
champagne cork pop
hammer hitting nail into wood
hammer hit wooden decking plank
large wood structure collapse
large building collapse glass breaking
stone pestle place into mortar
grinding herb leaves stone mortar pestle
cartoon swipe fast swish whoosh
coin insert into casino slot machine with a beep
hard hitting cinematic impact slam dramatic drum hit

Category-Browse:
/sound-effect-category/squelch-and-splat/
/sound-effect-category/eating-and-biting/
/sound-effect-category/cartoon-impacts/
/sound-effect-category/intro-outro-and-stinger/
/sound-effect-category/bottle/
/sound-effect-category/casino/
```

### Soundsnap (Annual-Abo $249/Jahr)

```
Tag-Browse:
/tags/vintage_cash_register_0
/tags/slot_machine
/tags/swing_top
/tags/rubber_stamp
/tags/low_drone
/tags/notification

Playlist:
/playlist/jackpot_playlist
/playlist/ambient

Interiors:
/interiors/supermarket
/interiors/casino
```

### ElevenLabs Sound Effects (Creator $22/Monat)

Master-Prompt-Präfixe für Fraktions-Konsistenz:

```
HELLMUTH_PREFIX = "dry, organic, wooden, room-tone, 1970s analogue tape character, no reverb, close mic, "
MODERAT_PREFIX  = "glossy, casino floor, bright digital, slot machine euphoric, slight tape flutter, "
```

**Konkrete Prompts (Slot-Liste):**

```
HELLMUTH-Ambient:
  "Quiet apothecary cellar at night, distant slow water drips on stone, gentle
   wooden creak, low resonant glass tone, 30 seconds seamless loop"
  "Mortar grinding dried herbs on stone, sparse, dry, no music, close microphone"
  "Glass alembic bubbling slowly, occasional crystalline ting, mineral resonance,
   ambient"

MODERAT-Ambient:
  "Bright supermarket aisle muzak, glossy synth pad, distant register beeps,
   80s sweet, loop"
  "Sugar refinery factory floor, syrupy conveyor belt squelch, repeating cheerful
   jingle stab"
  "Glossy commercial jingle bed, major chord pluck arpeggio, hyper-positive,
   slightly off-key, 8 seconds"

UI-Klick HELLMUTH:
  "single dry wooden tap, 90ms, 400Hz body, no reverb" (5x)

UI-Klick MODERAT:
  "plastic casino chip clatter 200ms + neon hum tail 400ms"

Spiegel-Phase-1-Pumpe:
  "Subterranean muffled bass thud from inside an old slot machine cabinet, very
   short, no high frequencies, felt rather than heard, single hit, dry."

Spiegel-Phase-3-Jackpot:
  "Vintage 1920s mechanical cash register kerching, brass bell resonance, single
   emphatic hit with metallic spring decay, followed by ascending bell jingle in
   C major, three coins dropping on wood at the end, warm analog, no digital
   artifacts."

Signet F1 Discounter-Glück:
  "vintage mechanical cash register cha-ching, single short ding, drawer slide
   opening, crisp foley, no music, 1.2 seconds"

Signet F2 Erfolgsmeldung:
  "champagne bottle cork pop with quick foam hiss, close mic, single pop,
   0.4 seconds, dry"

Signet F3 Sonderangebot:
  "slot machine win sound, ascending three coin chimes followed by rapid coin
   payout cascade, 1.8 seconds, bright, no voice"

Signet F4 Werbekampagne (Stable Audio bevorzugt):
  "corporate sonic logo, three ascending synth bells, major triad, optimistic,
   glossy, plastic-bright, 1.5 seconds, no drums, ending stinger"

Signet F5 Studie veröffentlicht:
  "single brass service bell ding, sustained metallic ring, 1 second, dry,
   indoor"
  "rubber stamp slam on paper, wooden handle thud, single hit, close mic,
   0.3 seconds"

Signet F6 Influencer-Sturm:
  "iPhone-style notification ping, single bright two-tone bell, 0.3 seconds,
   clean" (6x)

Wellen-Druck-Bed:
  "40 Hz sine sub-bass, 60-second sustain, very slow 0.2 Hz amplitude modulation,
   -6 dBFS, mono, no reverb"
```

### Stable Audio 3 (Style-Reference-Loops, Creator-Tier)

Workflow: Eine HELLMUTH-Identitäts-Aufnahme (z. B. 30 s eigene Mörser-Foley) als
Audio-to-Audio-Anker hochladen, dann Prompt:

```
"transform this into a 60-second seamless ambient loop, dry organic wooden room
 tone, glass clink scatter every 8-20 seconds, distant mortar pestle, no music"
```

Analog für MODERAT mit Casino-Identitäts-Anker.

### Konkrete URL-Liste (Direkt-Treffer)

```
Bügelflaschen-Plopp (Pflicht-Sample):
  https://freesound.org/people/Audeption/sounds/418511/  ← Lizenz CC0 prüfen!
  https://freesound.org/people/EricsSoundschmiede/sounds/514085/  (Champagner-Layer)
  https://www.zapsplat.com/music/opening-a-beer-bottle-with-swing-top/  (Backup)

Ka-Ching-Backup (falls KI nicht überzeugt):
  https://audiojungle.net/item/cash-register-kaching/22461690  ($1-5)

ZapSplat Pflicht-Treffer:
  https://www.zapsplat.com/music/cash-register-old-fashioned-open-ka-ching-version-1/
  https://www.zapsplat.com/music/modern-supermarket-cash-register-self-service-scanner-beep-version-2/
  https://www.zapsplat.com/music/stone-pestle-place-into-mortar-version-5/
  https://www.zapsplat.com/music/finger-pull-from-top-of-empty-glass-bottle-pop-2/

Freesound Pflicht-Treffer:
  https://freesound.org/people/Audeption/sounds/418511/
  https://freesound.org/people/twohoursago/sounds/135039/   (Glas-Klink)
  https://freesound.org/people/Benboncan/packs/6298/        (Wind-Pack)
  https://freesound.org/people/jittels/sounds/367169/       (Werkstatt-Ambience)
  https://freesound.org/people/Robinhood76/sounds/62282/    (Alchemist-Lab)
  https://freesound.org/people/kentspublicdomain/sounds/777053/  (Fluorescent Flicker)
  https://freesound.org/people/Noted451/sounds/530435/      (Tibetan Bell HELLMUTH-Sieg)
  https://freesound.org/people/khenshom/sounds/481075/      (Cloth Foley)
  https://freesound.org/people/Kinoton/sounds/347557/       (Leaves Rustle)

ElevenLabs-Galerie (Referenz-Hören vor Prompt-Verfeinerung):
  https://elevenlabs.io/sound-effects/cash-register
  https://elevenlabs.io/sound-effects/clink
  https://elevenlabs.io/sound-effects/foley
  https://elevenlabs.io/sound-effects/slot-machine
  https://elevenlabs.io/sound-effects/applause

Soundsnap-Pflicht:
  https://www.soundsnap.com/tags/vintage_cash_register_0
  https://www.soundsnap.com/playlist/jackpot_playlist
  https://www.soundsnap.com/interiors/supermarket
  https://www.soundsnap.com/tags/rubber_stamp
  https://www.soundsnap.com/tags/swing_top
```

---

## Anhang A · Lizenz-Ampel-Cheat-Sheet (für CSV-Pflege)

| Quelle | Ampel | Lizenz-Modell | Steam-Hinweis |
|---|---|---|---|
| Kenney.nl | GREEN | CC0 | unproblematisch, keine Attribution |
| Freesound CC0 | GREEN | CC0 | keine Attribution, kommerziell, **Lizenz vor Download manuell prüfen** |
| Freesound CC-BY | YELLOW | CC-BY 4.0 | Attribution pro Sound (Autor + Link + Lizenz) in Credits-Screen |
| Freesound CC-BY-NC | **RED** | CC-BY-NC | **Steam-Verkauf = NC-Verstoß** |
| Freesound Sampling+ | RED | legacy | retired 2011, vermeiden |
| ZapSplat Free | GREEN | Standard mit Attribution | »Sound by ZapSplat« in Credits |
| ZapSplat Gold | GREEN | attribution-free for life | downloads bleiben lizenziert auch nach Abo-Ende |
| Pixabay Audio | YELLOW | Content License | **Lizenz-Zertifikat archivieren** — Pixabay verifiziert Uploads nicht vorab |
| Soundsnap | GREEN | Abo, perpetuell | downloads bleiben nach Abo-Ende |
| Adobe Stock Standard | RED | deckt Games NICHT | Extended nötig, nur Enterprise |
| AudioJungle Music Standard | YELLOW | 1 Endprodukt, **10 000-Kopien-Limit** | Broadcast-Upgrade ab 10k |
| Envato Elements | YELLOW | Item-Registrierung pro Projekt | bei Patch/DLC neue Lizenz nötig |
| ElevenLabs Free | RED | nicht kommerziell + Attribution | **niemals für Steam** |
| ElevenLabs Creator+ | GREEN | royalty-free, eingebettet | **kein OST-Verkauf**, kein Asset-Pack |
| Stable Audio Community | GREEN | bis 1 Mio. USD Umsatz frei | Enterprise ab Schwelle |
| Suno | **RED** | Klagen offen, **keine Indemnification** | Hochrisiko bis nach Sony-Summary-Judgment 07/2026 |
| Udio | **RED** | Walled-Garden seit 11/2025 | kein Export mehr |
| Meta AudioCraft | **RED** | CC-BY-NC | nicht kommerziell |
| AIVA Pro | GREEN | volle Copyright-Übertragung | sauber für Soundtrack |
| BOOM Library | GREEN | Einmalkauf, kommerziell | UI-Pack »Casual UI« relevant |
| GameSynth (Tsugi) | GREEN | Einmalkauf, kommerziell | prozedurale Foley |

---

## Anhang B · Produktions-Reihenfolge (Empfehlung an Auftraggeber)

1. **Sourcing-Tools beschaffen** (Tag 1):
   - ElevenLabs Creator-Tier $22 abonnieren
   - Soundsnap Annual $249 kaufen
   - Freesound-Account anlegen (gratis)
   - ZapSplat-Account (Standard gratis, Gold £20 nach 5 Standard-Treffern)
   - Mastering-Tools (Ozone 11 Match EQ oder FabFilter Pro-Q 4 EQ Match) einmalig
2. **Fraktions-EQ-Profile bauen** (Tag 2):
   - 3–5 Identitäts-Samples pro Fraktion auswählen
   - Match-EQ-Curve speichern (Hellmuth.eqmatch, Moderat.eqmatch)
3. **Bügelflaschen-Plopp** (Tag 3) — Audeption + 3 Layer + Master = das
   psychologisch-zentrale erste Asset
4. **Spiegel-Sounds Phase 1/2/3** (Tag 3–4) — psychologisches Herzstück, früh
   testen
5. **Welt-Ambient pro Fraktion** (Tag 4–5) — Bed-Loops + Scatterer-Pools +
   Charakter-Layer (Jingle-Fragment)
6. **UI-Sounds** (Tag 5) — 5 Slots × 2 Fraktionen × 3 Varianten = 30 Klänge
7. **Sechs Signets** (Tag 6–7) — C&C-Generals-Architektur, Anti-Cliché-Hebel
8. **Einheits-Sound-Sets** (Tag 7–9) — Stimmen-Aufnahme + Foley-Layer
9. **Stinger** (Tag 9) — Sieg/Niederlage pro Fraktion
10. **Gebäude** (Tag 10) — Bau-Start/Fertig/Idle/Zerstörung
11. **Mastering-Pass** (Tag 10) — alle Assets durch das Fraktions-EQ-Profil,
    Loudness-Normalisierung −16 LUFS (Spiel-Standard)
12. **Engine-Integration** (Tag 11) — Dateien droppen ins `public/audio/`,
    `audio_manifest.json` aktualisieren (siehe `docs/AUDIO_ENGINE.md`)
13. **Hör-Abnahme auf echter Hardware** (Tag 12) — Chrome + iOS-Safari +
    `?audio-debug=1` für Voice-Stress-Test
14. **80-Stunden-Konditionierungs-Test** (Tag 13–???) — Spieler nach 80 h
    fragen: »Was hörst du, wenn an der Supermarkt-Kasse das Cha-Ching klingelt?«
    Antwort = Erfolgsmaßstab.

Geschätzter Gesamtaufwand: **~14 Personentage** für ein vollständiges Sound-
Set zweier Fraktionen, inkl. Mastering und Engine-Integration.

---

_Dokumentenende. 14 Subagent-Reports konsolidiert. Vollständige Belegquellen-
Liste in den einzelnen Subagent-Output-Files (`/tmp/claude-0/.../tasks/`)._
