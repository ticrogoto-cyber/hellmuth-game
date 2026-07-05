# DESTILLAT-SYSTEM

Verbindliche Wahrheitsquelle. Ersetzt das alte Gold-Mine-Modell. Bei Konflikt zwischen Code-Auftrag und diesem Dokument gewinnt das Dokument.

---

## Das alte Problem

Drei Ressourcen, alle drei aus einer Quellen-Struktur abgebaut wie eine Goldmine in Warcraft. Einfallslos und ohne ideologische Schärfe. Tot.

---

## Das neue System

### Zwei konventionelle Quell-Ressourcen

**Botanicals** aus dem Botanical-Hain. **Rheinwasser** aus dem Wasser-Hain. Beide werden von Sammler-Einheiten abgebaut, klassisch RTS, gleich für beide Fraktionen.

### Dritte Ressource Destillat, asymmetrisch

Diese Asymmetrie ist nicht Tarier-Detail, sie ist das Konzept. HELLMUTH erschafft, MODERAT eignet sich an. HELLMUTH produziert in sich selbst im Gleichgewicht, MODERAT frisst.

---

## HELLMUTH, autonome Produktion

Neues Gebäude **Destille**. Ab **Tech-Stufe 2** baubar (Default, bei zu starkem Frühvorteil auf 3 schieben).

Funktioniert wie Gunst in Age of Mythology. Sobald gebaut, produziert sie Destillate über die Zeit, ohne Arbeiter-Input. Keine Sammler nötig.

**Produktionsrate Default.** 1 Destillat pro 5 Sekunden pro Destille.

**Skalierung.** Linear mit Anzahl. 1 Destille = 1×, 2 = 2×, 3 = 3×.

**Maximum 3 Destillen** pro Spieler. Vierte verboten.

---

## MODERAT, parasitärer Kill-Drop

Kein Produktionsgebäude. MODERAT erbeutet Destillat aus feindlichen Toden.

**Pflicht-Bedingung**. Drop funktioniert nur wenn mindestens **eine HELLMUTH-Destille im Spiel existiert**. Parasit braucht Wirt. Ohne HELLMUTH-Destille kein Drop, egal wie viele Kills.

**Drop-Wert nach `sev`-Tier** des getöteten Opfers.

| sev | Destillat-Drop |
|---|---|
| light | 1 |
| mass | 2 |
| strong | 4 |
| hero | 8 |

**Friendly-Fire zählt nicht.** Nur Kills von feindlichen Einheiten triggern Drop.

**HELLMUTH bekommt keinen Drop.** HELLMUTH produziert ohnehin selbst. Drop ist MODERAT-exklusiv.

---

## Strategische Konsequenzen

HELLMUTH kann MODERAT aushungern, indem sie ihre Destille spät baut. Aber HELLMUTH braucht Destillate selbst für Tier-3-Einheiten. Spannung.

MODERAT muss kämpfen. Friedlicher Turtle-Stil ist tot. Wer nicht angreift, hat keine Tier-3-Optionen.

Wenn MODERAT alle HELLMUTH-Destillen zerstört, schneidet MODERAT sich selbst die Versorgung ab. Die Ironie ist die Mechanik.

---

## Edge-Cases (vorläufige Defaults, später tarieren)

- **HELLMUTH vs HELLMUTH**, kein MODERAT im Spiel. Produktion läuft normal, Parasit irrelevant.
- **MODERAT vs MODERAT**, kein HELLMUTH im Spiel. Niemand bekommt Destillate. Tier-3 für beide blockiert. Das ist beabsichtigt, ohne Wirt kein Parasit.
- **Mehrere HELLMUTH-Spieler**. Sobald irgend eine HELLMUTH-Destille im Spiel existiert, dürfen alle MODERAT-Spieler parasitieren.
- **Destille während Kampf zerstört**. Sobald keine Destille mehr existiert, hört MODERAT-Drop sofort auf. Aktuell gehortetes Destillat bleibt.

---

## Asset-Lücke (offen)

HELLMUTH braucht ein **Destille**-Gebäude. Existiert nicht im Manifest. Ticro generiert per KREA, Tonalität wie Apotheke und Labor, Footprint 2×2. Code-Aufträge arbeiten bis dahin mit Platzhalter-Sprite (graceful fallback wie sonst auch).

---

## Hinweis an Code

Jeder Code-Auftrag zum Destillat-System verweist auf dieses Dokument. Lies es vor der ersten Codezeile, ganz, nicht nur den Abschnitt für deine Instanz.
