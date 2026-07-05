# VERTICAL_SLICE_SCOPE

Was der spätere spielbare Kern (Vertical Slice) von HELLMUTH umfasst. Diese
Session legt davon **nur das Fundament** und **kein Gameplay**.

## Ziel des Vertical Slice (späterer Auftrag)

Ein minimal, aber vollständig spielbarer RTS-Loop:

1. **Eine Karte** — isometrisch, eine Spielfläche.
2. **Beide Fraktionen** — DIE HELLMUTH und DIE MODERAT spielbar.
3. **Drei Ressourcen** — Botanicals, Reinwasser, Destillat.
4. **Sammeln** — Arbeiter (Sammler / Sirup-Trupp) ernten Ressourcen und geben
   sie am HQ ab.
5. **Bauen** — Arbeiter errichten Gebäude.
6. **Einheitenproduktion** — Gebäude produzieren Einheiten gegen Ressourcen und
   Bevölkerung.
7. **Einfacher Kampf** — Einheiten greifen an, nehmen Schaden, sterben.
8. **Simple Gegner-KI** — Basisaufbau, Produktion, Angriffswellen.
9. **Siegbedingung** — die gegnerische Zentrale (Apotheke bzw. Zuckermaschine)
   zerstören.

## Nicht im Vertical Slice

- Echte Grafik und Sound (Platzhalter-Formen bleiben, bis der Loop steht).
- Mehrere Karten, Kampagne, Story-Missionen.
- Fortgeschrittene KI (Mikromanagement, Strategiewechsel).
- Mehrspieler/Netcode.
- Steam/Tauri-Build.

## Was diese Fundament-Session liefert

- Lauffähiges Phaser-3-Projekt (`npm run dev`).
- Isometrische Platzhalterkarte mit beweg- und zoombarer Kamera.
- Zwei beschriftete statische Platzhalter (Apotheke, Sammler).
- Projekt-Dokumentation (`docs/`).
- Datenschicht als Gerüst (JSON-Stubs + typisierter Loader).

Kein Sammeln, kein Bauen, keine Produktion, kein Kampf, keine KI. Der nächste
Auftrag ist der spielbare Loop.
