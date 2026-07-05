# HELLMUTH — Asset-Prompt-Bibliothek V2 (KREA)

Ersetzt die V1 vollständig. V1 löschen, diese Datei nach docs/ committen. Drei Master-Blöcke statt einem, weil der alte Einheits-Master Architektur erzwang, wo keine hingehört.

**Baukastenprinzip:**
- Gebäude und alles Gebaute: [MASTER-BAU] + [FRAKTIONSPALETTE] + Asset-Prompt
- Natur, Vorkommen, Doodads: [MASTER-NATUR] + Asset-Prompt (keine Fraktionspalette)
- Einheiten/Charaktere: [MASTER-CHARAKTER] + [CHAR-PALETTE der Fraktion] + Asset-Prompt
- Karten-Megatexturen: eigene Prompts in Abschnitt 6, ohne Master

---

## 0. Arbeitsregeln

1. Pro Kategorie eine Sitzung, gleiche Einstellungen. Stilreferenzen pro Fraktion getrennt, beschnitten (nur Spielfeld), 35–40 %.
2. Pro Asset 4 Varianten, Auswahl nach Winkel zuerst, Schönheit zuletzt. TAB-Screenshot ist Winkel-Schiedsrichter.
3. Verbindliche Kamera: orthografisch, Elevation 36,87° (sin θ = 0,6), Rotation 45°, Tile 160×96 (5:3).
4. Rauheits-Abnahme: Korn sichtbar, echtes Schwarz, gekratzte Kontur, Verwitterung. Sauber/niedlich/neu = abgelehnt.
5. Freistellen macht Codes Normalisierungsskript (Hintergrundentfernung mit Schattenerhalt). Keine Photoshop-Handarbeit an Einzelassets.
6. **Gebäude-Varianten**: Jedes Gebäude bekommt ZWEI Designs (Zufallswahl beim Bau, AoE4-Prinzip). Variante B = identischer Prompt + `a structurally different second design of the same building type, same materials, same palette, same footprint, different silhouette`. Manifest deklariert beide, Engine würfelt.
7. **Höhenregel für Karten**: In Megatexturen wird nur gebacken, was flach ist. Alles mit Höhe (Bäume, Felsen, Klippen) bleibt Sprite, Ausnahme Kartenrand.
8. **Budgetregel** (KREA-Punkte knapp): Alles ohne Style-Transfer-Zwang läuft über OpenAI (Konzepte, UI-Edits, Nachzügler-Gebäude). KREA ist reserviert für stilkritische Assets, Video-Animation und Upscaling. Keine weiteren Kachel-Generierungen, der Hauptweg ist die Megatextur.
9. **Ruinen sind abgenommen** (Naturmaster + Schutt-Prompt + 20 % Referenz). Der mitgebackene Bodenteller bleibt und wird per Rand-Fade (Arbeitsregel in Abschnitt 4) zum verbrannten Fundament. Einsturz-Animation mit den Grau-Versionen fahren (Gebäude → Ruine), Code keyt danach alle Frames.

---

## 1. Die drei Master-Blöcke

### [MASTER-BAU] — nur für Gebäude, Gerüste, Wracks
```
Isometric 2D real-time strategy game building asset, gritty 1990s anime OVA style crossed with a stylized arcade RTS, drawn like a rough vintage manga woodcut print. Heavy scratchy black ink linework with variable line weight, dry-brush grit, broken and frayed edges. Flat cel-shaded color blocking with deep solid black shadow masses, harsh chiaroscuro contrast. Coarse manga screentone dot texture and aged parchment paper grain visibly printed over every surface. Everything weathered and lived-in: cracked plaster, stained stone, patched roofs, moss and grime in the seams, slightly asymmetrical silhouette, dense cluttered detail. Loud, dramatic, slightly grotesque, unhinged 90s OVA energy, gritty grindhouse print quality. Fixed dimetric camera exactly like They Are Billions: orthographic view, camera elevation 37 degrees, noticeably steeper than flat classic 2:1 isometric, generous view of rooftops and top surfaces, object rotated 45 degrees so two side faces and the top are visible. Light source baked in from the top-left, hard cel shadows falling to the bottom-right. Single isolated object, centered, on a plain flat neutral light-grey background, no environment, no scenery, only a soft oval contact shadow directly under the object grounding it. NOT painterly, NOT soft, NOT photorealistic, NOT glossy 3D render, NOT Warcraft, NOT cute, NOT tidy, NOT clean uniform vector outlines, NOT a polished mobile-game asset, no smooth gradients, no pristine surfaces, no perspective distortion, no front view, no tilted camera.
```

### [MASTER-NATUR] — Vorkommen, Bäume, Felsen, Doodads
```
Isolated isometric 2D nature object for a real-time strategy game, gritty 1990s anime OVA style, drawn like a rough vintage manga woodcut print. Heavy scratchy black ink linework, flat cel-shading, deep solid black shadow masses, coarse screentone dots and paper grain over every surface. A single natural landscape feature in open wilderness. STRICTLY NO buildings, NO architecture, NO walls, NO huts, NO ruins, NO fences, NO man-made structures of any kind, nothing constructed by hands, only nature. Fixed dimetric camera exactly like They Are Billions: orthographic, elevation 37 degrees, generous top view, object rotated 45 degrees. Light from top-left, hard cel shadows to bottom-right. Single object, centered, plain flat neutral light-grey background, only a soft contact shadow under the object. Muted neutral steppe palette: warm grey-beige stone, dusty loam, desaturated grey-green vegetation. NOT photorealistic, NOT painterly soft, NOT cute, no scenery around the object, no horizon.
```

### [MASTER-CHARAKTER] — alle Einheiten (Bild-Vorstufe für die 3D-Pipeline)
```
Full-body character concept for a video game unit, single character only, gritty 1990s anime OVA style, bold ink lines, clean cel shading, sharp silhouette. Plain flat light-grey empty studio background, STRICTLY NO environment, NO buildings, NO scenery, NO ground objects, NO props lying around, nothing in the frame except the one character. Neutral even lighting, no dramatic shadows on the floor. Pose ready for 3D modeling and rigging: A-pose, arms spread at about 30 degrees, legs shoulder-width apart, ALL limbs fully visible from shoulder to hand and hip to foot, no capes or cloth covering arms, legs or joints. Realistic proportions, full body from head to toe in frame, front view.
```

---

## 2. Paletten

### [FRAKTIONSPALETTE HELLMUTH] (für MASTER-BAU)
```
HELLMUTH faction, botanical apothecary order, "Reinheit durch Wissen". Architecture of pale parchment-white stone, dark stained wood, copper and brass apparatus, amber apothecary glass, moss-green and bottle-green roofs and banners bearing the faction emblem: a single stylized stinging-nettle leaf with two small wings — one heart-shaped leaf with a pointed tip and finely toothed serrated edge, NOT a palmate leaf, NOT a seven-fingered cannabis leaf. Palette: parchment white, moss green, emerald, sage, amber, honey, brass, copper. Saturation restrained, dignified, almost monastic. One reserved accent: a clear gold-white "clarity" glow, used only on glass, vials and light sources.
```

### [FRAKTIONSPALETTE MODERAT] (für MASTER-BAU)
```
MODERAT faction, industrial sugar syndicate, "Süsse ist Zwang". Grotesque chrome-and-plastic machinery, black industrial plastic, riveted steel, rust, tangled pipes, pressure tanks, valves, a grinning spiked skull-sun logo stamped on tanks. Palette: chrome silver, black, gunmetal, rust brown, with candy magenta as the single screaming accent: magenta syrup dripping from pipes, pooling at the base, glowing sickly in glass domes. Lurid, sick, gleeful. The magenta is accent, not carpet.
```

### [CHAR-PALETTE HELLMUTH] (für MASTER-CHARAKTER)
```
HELLMUTH order member: ivory linen and moss-green apothecary garments, brown leather straps, belts and satchels, brass and copper instruments, corked glass vials with amber liquid, sturdy boots, restrained dignified palette, the small winged nettle-leaf emblem on chest or shoulder. Calm, disciplined, scholarly-martial.
```

### [CHAR-PALETTE MODERAT] (für MASTER-CHARAKTER)
```
MODERAT syndicate drone: candy-magenta and chrome pressure suit, black industrial plastic, riveted steel plating, blank faceless reflective face plate, ribbed hoses, canisters and gauges, the spiked grinning skull-sun logo stamped on the armor, thin magenta syrup residue in the joints. Uncanny, mass-produced, gleefully sinister.
```

---

## 3. Gebäude

Unverändert aus V1 (Apotheke, Kuratorium, Labor, Beet / Zuckermaschine, Raffinerie, Gärtank, Schlickwerk, Destillatsickerung, Vorposten), jeweils mit [MASTER-BAU] + Palette, plus Arbeitsregel 6 für die Zweitvariante. Reihenfolge: HQs zuerst, sie bleiben Stil-Anker.

### 3.1 Baugerüste (Constructor-Prinzip: kein Haus, nur Gerüst)
Pro Fraktion drei Größen (2×2, 3×3, 4×4). Größensteuerung über die Wörter `small compact` / `medium` / `large sprawling`.

**HELLMUTH-Gerüst**
```
[MASTER-BAU] + A free-standing empty construction scaffold occupying a square building plot. STRICTLY NO building inside, behind or under it — the scaffold interior is open air, you can see the bare ground through the structure. Rough timber scaffolding poles lashed together with rope, wooden platforms and ladders on several levels, hanging canvas tarps, stacked pale stone blocks and copper pipe segments on pallets beside it, tool crates, a small moss-green pennant on the highest pole. [small compact 2x2 / medium 3x3 / large sprawling 4x4] footprint.
```

**MODERAT-Gerüst**
```
[MASTER-BAU] + A free-standing empty construction scaffold occupying a square building plot. STRICTLY NO building inside, behind or under it — the scaffold interior is open air, bare ground visible through the structure. Welded steel scaffolding, riveted girders, chain hoists and pulleys, stacked steel plates and pipe segments, dented magenta syrup canisters, black-and-magenta hazard stripes on the base beams, one harsh magenta work lamp. [small compact 2x2 / medium 3x3 / large sprawling 4x4] footprint.
```

### 3.2 Zerstörung (KREA-Video-Workflow)
Drei Schritte, pro Gebäude einmal:

1. **Schutt-Endframe** als 2D-Asset generieren, pro Fraktion und Größe wiederverwendbar:
```
[MASTER-BAU] + [PALETTE] + A collapsed building ruin: a low flat pile of rubble filling a square plot — [broken pale stone, charred timber beams, bent copper piping, shattered amber glass] / [torn riveted steel plates, burst tanks, tangled pipes, spilled dried magenta syrup] — dust settled, no flames, no structure left standing taller than a man, reads as debris, not as a building.
```
2. **KREA-Video**: Anfangsframe = fertiges Gebäudesprite (auf Grau), Endframe = Schutt-Sprite (auf Grau). Prompt:
```
Static locked camera, no camera movement at all. The building collapses vertically into itself like a house of cards: walls buckle, the roof drops, a burst of dust and debris, everything falls straight down onto its own footprint. The plain grey background stays unchanged. 2 seconds.
```
3. Code extrahiert 12–16 Frames, stellt frei (Grau-Keying mit Schattenerhalt), packt den Atlas. Geometriewabern ist hier akzeptabel, Einsturz ist Chaos.

---

## 4. Ressourcen-Vorkommen (eigenständig, ohne Gebäude)

Jeweils [MASTER-NATUR] + folgender Prompt. Keine Fraktionspalette. 768×768, Footprint 2×2.

**Drei Grundsätze:**
1. **Randausblendung**: Der mitgenerierte lokale Boden ist erwünscht (er erzählt, was das Vorkommen mit seiner Umgebung macht), Code legt im Normalisierungspass einen radialen Alpha-Fade über die äußeren ~15 %, damit er weich in jede Karte übergeht. Gilt auch für Ruinen.
2. **Licht kommt aus der Engine, nie aus dem Sprite.** Das Sprite ist Materie, die Bewegung des Lichts ist Code:
   - Hain: 6–10 additive Glühwürmchen-Partikel (driftend, flackernd) + pulsierender warmer Tint-Overlay auf der Sprite-Fläche
   - Quelle: zwei langsam rotierende/scrollende additive Strahlen-Overlays aus dem Wasser + weißer Nebelloop (Rauch-Loop, niedrige Alpha, leicht steigend) + sanfter Glow-Puls. Flüssiges Manna.
   - Destillat: schwaches toxisches Flimmern (additiver Shimmer-Overlay)
3. Erschöpfte Varianten sind eigenständige Prompts mit eigener Silhouette, kein Farbwechsel.

**Hain (Botanicals)**
```
A wild sacred herb grove growing directly out of open ground: a dense rounded cluster of lush medicinal bushes and flowering herbs on a low mossy earth mound, a few pale luminous blossoms glowing faintly, one ancient gnarled dwarf tree rising from the center of the cluster. Only plants, earth, moss and small stones — nothing else exists in this image.
```

**Hain, erschöpft**
```
A depleted, harvested herb grove on a low earth mound: bare grey skeletal bushes stripped of every leaf, dry brittle twigs, the ancient dwarf tree reduced to a dead cut stump in the center, trampled dusty earth with worn footpaths, scattered dry leaves and cut stems, no flowers, no glow, lifeless grey-brown palette. Only dead plants, dust and stones — nothing else exists in this image.
```

**Quelle (Reinwasser)**
```
A natural water spring in open wilderness: clear turquoise-white water welling up inside an irregular ring of raw weathered rocks, wet glistening stone, a faint clean glow on the water surface, moss and a few reeds at the rim, one thin rivulet trickling off into the dirt. Only water, rock, moss and earth — nothing else exists in this image.
```

**Quelle, erschöpft**
```
A dried-up dead spring: the same irregular ring of weathered rocks now surrounding a cracked, completely empty stone basin, ABSOLUTELY NO water anywhere, the basin floor broken into dry curling mud plates, white mineral crust lines marking the old water level, grey dead algae stains, one withered brown reed, dust. Only dry rock, cracked mud and dust — nothing else exists in this image.
```

**Destillat-Vorkommen**
```
A raw crystalline deposit erupting from bare cracked sandy loam, no grass anywhere: a jagged cluster of translucent crystals in sickly yellow-green with pale magenta veins, oily residue seeping at the base, broken dry earth and rubble pushed up around it, a faint toxic shimmer in the air directly above. Only crystals, sand, cracked earth and rubble — nothing else exists in this image.
```

**Destillat-Vorkommen, erschöpft**
```
A mined-out crystal deposit in bare sandy loam: a dark blasted crater of broken earth where the crystals once stood, only short shattered dull crystal stumps left around the rim, scattered lightless fragments, dried oily residue stains, loose rubble and pick marks in the dirt, no shimmer, no glow, no grass. Only broken crystal stumps, crater earth and rubble — nothing else exists in this image.
```

---

## 5. Einheiten

Workflow unverändert: Konzeptbild → KREA 3D → Mixamo → Blender-Pipeline. Konzeptbilder mit [MASTER-CHARAKTER] + [CHAR-PALETTE], nie mit MASTER-BAU.

**Harte Bein-Klausel, in JEDEN Einheiten-Prompt einbauen** (Mixamo-Versicherung):
```
Slim trousers tucked into boots, both legs fully separated and visible from hip to foot, both arms fully visible from shoulder to hand, NO long robe, NO skirt, NO floor-length coat — any coat is short or worn open at front and sides.
```
Ausnahmen: der Novize (abgenommen, wird trotz Robe probiert) und Hellmuth (Design gesetzt, Mantel seitlich).

### HELLMUTH (Stil-Anker: der abgenommene Novize)

**Novize (Arbeiter)** — abgenommen, bleibt wie generiert.

**Apothekerin (Kampf-Medic, Frau)**
```
A young woman field apothecary: a fitted moss-green short jacket over an ivory shirt, a white half-apron split open at the front, slim linen trousers tucked into sturdy leather boots, [BEIN-KLAUSEL], a bandolier of corked tincture vials across the chest, a brass-nozzled tincture sprayer pistol holstered at the hip, a leather satchel, round goggles pushed up into her tied-back hair, calm determined face.
```

**Kuratorin (Caster, Frau)**
```
A scholarly woman curator-caster: a tailored bottle-green short coat ending at the hip, worn open, over an ivory blouse, [BEIN-KLAUSEL], a heavy brass-clasped codex chained to her belt, a slender staff topped with a sealed glass vial of glowing gold-white liquid, small brass instruments on a shoulder strap, wire-frame spectacles, composed sharp gaze.
```

**Destillateur (Mittlere Reichweite, Mann)**
```
A distiller soldier: a leather work vest over an ivory shirt with rolled sleeves, heavy gloves, [BEIN-KLAUSEL], a polished copper backpack still with brass coils on his back, a hose leading to a long-nozzled mist lance held in both hands, faint amber vapor at the nozzle tip, soot smudges on the apron, focused weathered face.
```

**Alchemist (Schwere Einheit, Mann)**
```
A heavy alchemist brute: a broad muscular man in a reinforced leather apron over a sleeveless work shirt, massive gauntlets, [BEIN-KLAUSEL] with iron-capped boots, a chest harness racked with fat glass grenade vials of amber and green liquid, one oversized brass mortar grenade-launcher carried over the shoulder, stern heavy face.
```

### MODERAT (Stil-Anker: Zielbild, Chrom + Magenta, gesichtslos, Kürbisfratzen-Glühen)

**Sirup-Trupp (Arbeiter)**
```
A faceless worker drone in a bulbous candy-magenta pressure suit, smooth blank reflective faceplate, chrome joints, a dented syrup canister backpack with ribbed hoses, [BEIN-KLAUSEL] with heavy industrial boots, a hydraulic grabber tool in one hand.
```

**Schleuderer (Fernkampf)**
```
A lanky ranged drone in segmented magenta-and-chrome plating, the right arm replaced by a pneumatic sling-launcher loaded with a glass syrup canister, spare canisters racked on the left thigh, blank faceplate with one round glowing lens, [BEIN-KLAUSEL], slim jointed mechanical legs.
```

**Toxischer Nebler (Caster)**
```
A hunched caster drone with twin glass back-tanks of swirling toxic magenta-green fog, twin nozzle vents on the shoulders, ribbed hoses running to a valve gauntlet on the left arm, blank faceplate leaking one thin wisp of vapor, [BEIN-KLAUSEL], plated boots.
```

**Stahlkoloss (Belagerungsriese mit Rohrkanone)**
```
A towering hulking humanoid siege machine: massive riveted chrome and gunmetal armor plates over a piston-driven frame, a glowing magenta grinning jack-o-lantern faceplate, the right arm fused into one oversized riveted pipe cannon, the left arm a crushing piston fist, twin syrup tanks on the back feeding hoses into the limbs, dented battle-scarred plating dripping magenta at the joints, exaggerated bulk, [BEIN-KLAUSEL], both massive legs clearly separated.
```

**Sirup-Kern (Virendrohne — NICHT Mixamo, prozedurale Animation)**
```
A spherical drone machine the size of a large dog: a chrome and black metal ball studded with short magenta-tipped spikes like a virus capsid, one single round glowing magenta lens, four short insectoid jointed legs folded beneath the sphere, thin syrup residue dripping between the spikes.
```
Naming-Notiz: Das Ziel-HUD nennt sie bereits »Sirup-Kerne« (»Zerstöre alle Sirup-Kerne«), der Name ist also kanonfähig. Satirische Alternative für die Ideen-Infektion: »Plapperkern«. Entscheidung Ticro, eine Zeile an Code genügt.
Technische Fußnote: Mixamo riggt nur Humanoide. Die Kugel wird prozedural animiert (Rotation, Linsen-Pulsieren, Beinzucken), Blender-Turntable oder direkt in Phaser. Rollen und Zucken ist viraler als Laufen.

---

## 6. Karten: Megatexturen (Hauptweg)

Drei Unikat-Karten statt Kachel-Optik: NEUTRAL, HELLMUTH, MODERAT. Die Kacheln aus V1 bleiben System-Fallback, Minimap-Basis und Prototyping-Grund, die drei abgenommenen Kacheltexturen sind spec-konform und werden behalten.

### 6.1 Eiserne Regel
In die Megatextur wird nur gebacken, was FLACH ist: Boden, Pfade, Moosfelder, Krusten, Flecken, Risse, Kies, der Fluss, Sirupseen, Plattenreste. Alles mit Höhe (Bäume, Wälder, Felsen, Klippen) bleibt separates Sprite mit Y-Sortierung — Ausnahme: der Kartenrand darf Klippen- und Waldmassive enthalten, weil dort nie eine Einheit dahinter läuft.

### 6.2 Workflow
1. Pro Karte ein Konzeptbild (OpenAI oder KREA) als Stil- und Layoutreferenz
2. Karte in 2×2 Quadranten generieren (höchste verfügbare Auflösung), Referenz + Quadrant-Beschreibung
3. KREA-Upscaler auf Zielauflösung
4. Nähte in Photoshop (Ticro), finale Karte als ein PNG
5. **Kollisionsmaske**: zweites PNG, gleiche Proportionen, farbcodiert — Weiß begehbar, Schwarz blockiert, Blau Wasser, Magenta Sirup-Zone (Slow-Effekt möglich). Code rastert die Maske aufs Tile-Grid.
6. Code zerlegt die Karte in GPU-taugliche Chunks (≤2048 px) und rendert sie unter der Sprite-Ebene.

### 6.3 Karten-Prompts
Gemeinsamer Kopf für alle drei:
```
A vast continuous ground plane for an isometric 2D RTS map, seen flat from above in the fixed dimetric game view, painted in gritty 1990s manga woodcut style: scratchy ink detail, coarse screentone, aged paper grain, muted palette. The image is ENTIRELY ground surface from edge to edge: no horizon, no sky, no buildings, no walls, no standing objects, no trees or rocks rising from the ground (low flat features only). Base ground: dry compacted sand-loam steppe soil, warm grey-beige (#D6D0C2, #CCC5B5, #C8BFAE), fine mineral grain, sparse pebbles, hairline cracks, soft irregular tonal clouds, no directional light, no cast shadows.
```

**NEUTRAL-Karte** `+ winding dusty footpaths crossing the plain, patches of dry grass and pale moss, scattered pebble fields, one broad shallow river with stony banks and a fordable crossing winding through one quarter of the map, dried flood channels, subtle darker loam basins. Along the outer map edges only: a continuous rim of rocky cliff terraces and dense dark forest mass, painted as part of the ground image.`

**HELLMUTH-Karte** `+ soft moss carpets and herb patches in desaturated green-gold, faint pilgrim footpaths worn into the loam, remnants of an ancient pale stone plaza half swallowed by moss, scattered flowering ground herbs, a clear spring-fed stream in one corner. Along the outer map edges only: rocky terraces overgrown with moss and a dark herb-forest rim, painted as part of the ground image.`

**MODERAT-Karte** `+ dead grey industrial crust spreading over the loam, flat pipe trenches and cable runs sunk into the ground, dried magenta syrup stains, seep pools and splatter trails, tire and track marks, scorched patches, cracked concrete plates. The magenta concentrated in veins and pools, not carpeted. Along the outer map edges only: black slag heaps and jagged dark rock rim, painted as part of the ground image.`

### 6.4 Doodads (Höhenobjekte, bleiben Sprites)
Mit [MASTER-NATUR], ein Objekt pro Bild (das Sammelblatt aus dem Test war Seitenansicht und Fotorealismus, beides verworfen): knorriger Steppenbaum, Waldscholle (als eine Masse mit dunklem Inneren), toter Baum, Findling, Felsstapel, Felsnadel. Mit Megatextur sinkt der Bedarf, fünfzehn gute Doodads reichen für alle drei Karten.

---

## 7. Effekte: Schichtarchitektur (Red-Alert-3-Prinzip)

Eine Explosion ist kein Clip, sie ist ein Stapel. Code komponiert pro Effekt aus diesen Bausteinen, jeder einzeln billig:

1. **Blitzkern**: radialer Lichtverlauf, wird NICHT generiert (KREA macht Gesichter daraus, ein Gradient ist kein Bildmotiv). Code erzeugt ihn prozedural (PIL oder Phaser-Gradient), pro Fraktion einfärbbar. Gleiches gilt für den Schockwellenring (Punkt 4).
2. **Materialbrocken**: Spritesheet aus KREA-Video — `magenta syrup bursting outward in thick glossy globs and droplets, on a plain solid dark background, static locked camera, 1 second` (analog für HELLMUTH: Glassplitter + Amberflüssigkeit + Kräuter). Code keyt den dunklen Grund, zieht 10–12 Frames.
3. **Rauchsäule**: KREA-Video-Loop — `a single column of thick cartoon smoke billowing upward on a plain solid dark background, static camera, seamless loop, 2 seconds`. Code baut den Loop per Überblendung.
4. **Schockwellenring**: ein einziger Ring-Sprite, per Code skaliert + ausgeblendet
5. **Partikel**: Phaser-Emitter mit 3–4 Mini-Sprites (Niete, Splitter, Tropfen, Blatt)
6. **Decal**: vorhandene Splatter-/Brandflecken, bleibt liegen
7. **Leichen/Wracks**: Todesanimation friert im letzten Frame ein, liegt N Sekunden, blendet ins Wrack-Decal über, das wiederum nach M Sekunden verblasst. Reiner Engine-Timer, kein Asset.

Die RA3-Schönheit entsteht aus Timing und additivem Blending in Code, nicht aus fetten Einzelanimationen. KREA-Video liefert ausschließlich die organischen Rohstoffe (2, 3), immer isoliert, immer statische Kamera, immer auf einfarbig dunklem Grund.

**Abgenommen (bereits generiert, Stand 10.06.):** Impact-Sterne, Mündungsfeuer beider Fraktionen, Magenta-Splash-Frames, Vial-Projektile, Rauch-Einzelposen. Das sind gültige Bausteine der Schichtarchitektur, Code animiert sie über Skalierung, Alpha, Rotation und 2–3-Frame-Wechsel. Keine Neugenerierung.

---

## 8. Icons
Erledigt (Ticro). Fraktionsgetrennte Ressourcen-Icons sind gesetzt. Hintergrundstrukturen entfernt Code im Normalisierungspass, nicht Photoshop.

---

## 9. UI (OpenAI-Edit-Workflow, nicht KREA)

KREA fällt für UI aus (GPT Image 2 dort ohne Referenz-Upload). Stattdessen: Die separierten Referenz-HUDs gehen direkt zu OpenAI (ChatGPT, Bild + Prompt), in zwei Schritten, damit beide Fraktionen pixelidentische Proportionen bekommen. Maßstab-Vorbild ist Age of Empires 4 (schlank, klar, untere Leiste bündig am Rand), Gestaltung bleibt die der Referenzen.

**Schritt 1 — HELLMUTH-Referenz hochladen + diesen Edit-Prompt:**
```
Edit this game HUD image. Keep the overall layout, style, panel shapes, ornaments and color scheme exactly as they are — apply ONLY the following changes:
1) Scale the entire bottom UI row (minimap, unit info panel, command button grid) down to roughly 60% of its current size and anchor it flush to the bottom edge of the image, no gap below. Target proportions on a 16:9 screen: bottom panels no taller than 15% of image height, the minimap square about 20% of image height.
2) Scale the top bars (emblem panel, resource bar, menu buttons) down to about 75%, flush to the top edge.
3) Make all lettering proportionally smaller and crisper.
4) Empty every panel: remove ALL text, numbers, icons and the portrait from inside every panel, slot and button — keep only the frames, borders, dividers and ornaments.
5) The central play area stays one flat untouched parchment-beige field with nothing on it.
Output in 16:9.
```

**Schritt 2 — das Ergebnis aus Schritt 1 hochladen + diesen Konvertierungs-Prompt:**
```
Convert this HELLMUTH game HUD into the MODERAT faction skin while keeping every panel position, size and proportion EXACTLY identical: replace the moss-green and antique gold borders with hot candy-magenta lines on black, replace the etched botanical corner ornaments with riveted industrial corner plates and hazard notches, add faint magenta syrup drips at a few outer panel corners, change the central play area from parchment-beige to pure black, change the emblem placeholder from a winged nettle leaf to a spiked grinning skull-sun. No other changes whatsoever. Output in 16:9.
```

Danach zerschneidet Code beide Treffer in Nine-Slice-Teile (Panelrahmen, Buttonzelle normal/hover/gedrückt, Tooltip, Minimap-Bezel). Text, Zahlen, Icons und Porträts kommen aus dem HTML-Overlay.

**Engine, nicht Asset:** Das Befehlsraster unten rechts ist pro Einheit individuell belegt und blendet sich kontextsensitiv aus, wenn nichts selektiert ist (AoE4/SC2-Verhalten). Das ist HTML-Logik, kein Bildmaterial.

---

## 10. Porträts und Porträt-Animation (geparkt)

Porträts erst, wenn die finalen Einheiten stehen (Gesichter der generierten Einheiten als Quelle). HELLMUTH-Porträt existiert und bleibt. Animation danach: Atem-Loop im StarCraft/WC3-Stil (leichte Regung, Blinzeln, Loop per Überblendung), Werkzeugkandidaten Luma Dream Machine, KREA-Video, Higgsfield — Code recherchiert und testet mit einem Porträt, bevor die Serie läuft.

---

## 11. Abnahme pro Asset
1. Winkel deckungsgleich mit dem Fraktions-HQ
2. Licht oben links, Kontaktschatten vorhanden (bei Charakter-Konzepten: neutral, kein Bodendrama)
3. Palette innerhalb der Fraktionsdefinition
4. Vor Bodentextur platziert: kein Sticker-Effekt, keine Säume
5. Rauheits-Check (Arbeitsregel 4)
6. Normalisierungspass durchlaufen
