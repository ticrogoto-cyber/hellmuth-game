# HUD-SPEC V2 — HELLMUTH (Stand: Schichtarchitektur)

Verbindlich: docs/hud-zustand-1.png und -2.png (8000x4500, Faktor 0,24 auf
1920x1080). PNG schlaegt Abschrift. Farbcode: Grau Panel, Rot Rahmen, Gelb Bild,
Tuerkis Icon, Weiss leer, VIOLETT Ornamentzonen. Werte @1920x1080.

## 1-4 GEOMETRIE (unveraendert)
Panels (Grau innen / Rot Rahmen aussen, Rahmen 15 px):
Emblem 0,0,279,96 / 0,0,294,111. Menue 1780,0,140,48 / 1765,0,155,63.
Minimap 15,779,286,286 / 0,764,316,316. Einheitenkarte 521,824,879,241 /
506,809,908,271. Ressourcen 1616,849,174,216 / 1601,834,204,246.
Befehlsraster 4x3 Zelle 65x65, erste 1094,836, Schritt 75,5.
Z1 ein Portraet + Statzeilen, Z2 vier Portraetzellen 121x169 ab x534/668/803/937.

## 5 VIOLETT-SLOTS, gebundene vs freie Kanten (Kern)
Gerade Kanten pixelgenau, Schraegkanten organisch.
| Slot | Breite EXAKT | gebundene Kanten (Leiste/Rand) | freie Kante |
|------|--------------|--------------------------------|-------------|
| #1 oben links | bbox 172,6 | LINKS (Emblem) + OBEN (Rand) | Hypotenuse unten rechts |
| #2 zentral Koenig | 189,6 (x316-506) | LINKS + RECHTS + UNTEN (y1080) | nur OBEN, Peak y809 (Garantie y869) |
| #3 Raster\|Ressourcen | 186,7 (x1414-1601) | LINKS + RECHTS + UNTEN (y1080) | nur OBEN, Peak y928 (Garantie y987) |
| #4 Ressourcen\|Rand | 115,2 (x1805-1920) | LINKS + UNTEN + RECHTS(Rand) | nur OBEN, Peak y834 (Garantie y908) |

## 6 SCHICHTARCHITEKTUR (loest die Anschlussfaehigkeit)
GPT baut instinktiv mittige Objekte mit eigenem Sockel und freien Seiten. Statt
das zu erzwingen, trennen wir zwei Ebenen.
S1 RAHMENEBENE. Code zeichnet ALLE Leisten aus den konsistenten Leisten-Assets,
   durchgehend um die Panels UND entlang der gebundenen Slot-Kanten (bei
   #2/#3/#4 links, rechts, unten; bei #1 links, oben). HELLMUTH gold (v + neue h),
   MODERAT die tropfen- und kleinventilfreien Leisten.
S2 BLUETENEBENE. Jedes Slot-Ornament ist ein RAHMENLOSES Overlay, kein eigener
   Rahmen, KEIN Sockel im Asset. Es waechst mit flacher Unterkante aus dem oben
   offenen Rahmenfach, fuellt unten die volle Breite, bluest nur nach oben. Laub/
   Rohre duerfen leicht ueber die seitlichen Leisten lappen (organische Bindung).
S3 MONTAGE. Code ankert die Bluete unten, skaliert auf die EXAKTE Slot-Breite
   (Toleranz 2 px), laesst sie nach oben bluehen, beschneidet Ueberschuss an der
   Peak-Linie. Hoehe unter Garantielinie -> ablehnen, Residuum, nicht montieren.
   Kein Morphen noetig, die Leiste laeuft durch, die Bluete liegt obenauf.
S4 AUSNAHME. Das behaltene HELLMUTH-Eckteil oben links traegt seinen eigenen
   Goldrahmen. Dort verwendet Code diesen und zeichnet KEINE doppelte Leiste.

## 7 RENDERSTIL (loest das Zu-3D-Problem, GENERIERUNG, nicht Code)
Ziel ist gemalte Plastizitaet wie Bild 9 und 12, kein Render. In den Prompts:
positiv "stylized hand-painted concept art, illustrative relief, baked-in
lighting, believable form but clearly illustrated". Negativ "NOT a 3D render,
NOT CGI, NOT a photograph, no glossy plastic reflections, no ray-traced gloss".
NIE "oil painting" sagen (GPT produziert dann Dreck). Das magische Leuchten
bleibt als Stilisierungsanker. Der billige Flach-2D-Look bleibt verworfen.
Kritiker flaggt Assets, die fotografisch-3D statt gemalt lesen.

## 8 VERBOTE (Generierung + Kritiker)
- Eingefrorene Bewegung verboten. Pendel haengen tot senkrecht oder gar nicht,
  keine Tropfen, nichts wie mitten im Schwung oder Fall. Zerstoert die Emission.
- Keine ZAHLEN, keine Zifferblaetter, keine Zeigeranzeigen.
- Keine winzigen, unglaubwuerdigen, im HUD unsichtbaren Ventile. Ventile selten
  und GROSS oder weglassen.
- Kein eigener Sockel/Rahmen in Bluetenelementen (S2).
- Generalregel: wenige Elemente, GROSS und ikonisch, keine Kleinteiligkeit.

## 9 LEUCHT-EXKLUSIVITAET / DOMINANZ
Nur #2 traegt das grosse animierte Leuchten (HELLMUTH Kugel-Puls, MODERAT
Iris-Sakkade). Leuchtkern #2 mindestens Faktor 4 ueber jedem Akzent in #1/#3/#4.
MODERAT-Auge fuellt rund zwei Drittel der Slot-Breite (dominant, animierbar).

## 10 MOTIV-VORRAT UND HAEUFIGKEIT
HELLMUTH (innere Quelle, Wissen, Edelmut): oft Brennnessel (gruen NUR am Koenig,
sonst nur Substanz im Glas). Maessig Phiolen/Flaschen wechselnder Form mit gruener
Substanz, Nautilus-/Goldener-Schnitt-Schnecken. Selten Moerser, Pendel (nur 1x,
sitzt im Eckteil), Fleur-de-Lis, Destille, Retorte. Max 1x inszeniert Waage.
MODERAT (exogen, zuckerabhaengig, entgleist): oft Ventile (gross!), Rohre als
Adernsystem mit Magenta-Blörre. Maessig Pumpzylinder mit teilgefuellter Substanz
(gern schraeg), vergitterte Fenster. Selten fressendes Maul (Sigille), Totenkopf
(ohne Unterkiefer wirkt bedrohlicher), Trichter, Corona-Spikes.

## 11 ECK-SIEGEL (ersetzt den abstrakten Knubbel)
Kein abstrakter Knubbel. Ein kleines Fraktions-SIEGEL, HELLMUTH Brennnessel-Emblem,
MODERAT Maul oder Totenkopf. Platzierung EMPFOHLEN an der oberen rechten Kartenecke
(1414,809). Zentriert auf der oberen Kartenleiste moeglich, aber Hierarchie-Risiko
(zweites Zentrum neben Koenig), Entscheidung Mensch. Siegel leise, kleiner als #2.

## 12 LEISTEN
HELLMUTH: vertikale Leiste bleibt (Bild 16). Horizontale Leiste NEU, gleicher Stil,
nur Brennnesseln, keine Flaschen. MODERAT: Leisten neu ohne Tropfen UND ohne
winzige Ventile, geaedertes Stahlband mit Magenta-Blörre in den Rohren.

## 13 Transparenz: schwarze Hintergruende 0,95 Deckkraft, unveraendert.

## 14 Asset-Dateien
violett/: *_v_hero (#2 leuchtend animiert), *_v_gridres (#3), *_v_edge (#4).
HELLMUTH #1 topleft bleibt (Bild 2). orn/: hellmuth_strip_h (neu, nur Brennnessel),
moderat_strip_h / moderat_strip_v (neu, ohne winzige Ventile), hellmuth_sigil,
moderat_sigil. Alle BLUETEN rahmenlos, ohne Sockel, flache Unterkante, oben
organisch, neutraler Grund.
