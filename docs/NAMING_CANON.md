# NAMING_CANON

Verbindliche Benennung für HELLMUTH. Diese Namen sind kanonisch. Code, Daten,
UI-Texte und spätere Assets richten sich danach. Abweichungen nur nach Freigabe
und Eintrag hier.

## Fraktions-Namen (Stand: Ticro-Entscheidung)

Die beiden Fraktionen heißen im Spiel und in allen UI-Texten:

- **HELLMUTH** — apothekarisch-alchemistischer Orden (früher »Die Hellmuth«).
- **MODERAT** — industrielle Zuckermaschine (früher »Die Moderat«).

**Schreibweise (verbindlich):** Die Fraktion wird in **Versalien** gesetzt:
`HELLMUTH`. Der gleichnamige Held wird in **gemischter Schreibung** gesetzt:
`Hellmuth`. Die Groß-/Kleinschreibung ist das unterscheidende Merkmal —
`HELLMUTH` meint die Fraktion, `Hellmuth` meint den Mann. `MODERAT` hat keine
solche Kollision, wird als Fraktion aber ebenfalls in Versalien gesetzt.

**Anzeige-Name ≠ Code-Schlüssel.** Der interne `FactionId` in `src/data/loader.ts`
bleibt `"hellmuth"` (= HELLMUTH) und `"moderat"` (= MODERAT). Diese Schlüssel
sind Code-Identifier, kein Spielertext, und durchziehen Daten, Balance, HUD und
Save-Format. Sie werden **nicht** umbenannt, solange kein koordinierter
projektweiter Refactor beschlossen ist; UI mappt nur das Label
(`hellmuth → HELLMUTH`, `moderat → MODERAT`).

| Anzeige-Name | Code-Schlüssel (`FactionId`) | früher |
|---|---|---|
| HELLMUTH | `hellmuth` | Die Hellmuth |
| MODERAT | `moderat` | Die Moderat |

## HELLMUTH

Apothekarisch-alchemistischer Orden. Benannt nach seinem Helden und Anführer
Hellmuth. **Fraktion (`HELLMUTH`, Versalien) und Held (`Hellmuth`, gemischt)
tragen denselben Namen, unterschieden durch die Schreibweise.** Der Held
`Hellmuth` bleibt eine eigenständige Einheit innerhalb der Fraktion (siehe
unten) — die frühere Kanon-Notiz »Hellmuth ist Held, keine Fraktion« ist mit
der Umbenennung aufgehoben: Der Mann gibt dem Banner seinen Namen.

### Gebäude

| Name | Rolle |
|---|---|
| Apotheke | HQ und Ressourcenabgabe |
| Hain | Botanicals-Quelle |
| Quelle | Reinwasser-Quelle |
| Beet | Versorgung (Botanischer Garten, erhöht Population-Kap) |
| Labor | Aufrüstung |
| Kuratorium | Caster und Archiv |

### Einheiten

| Name | Rolle |
|---|---|
| Hellmuth | Held und Protagonist (eigenständig, NICHT der Kurator; gemischte Schreibung, im Gegensatz zur Fraktion `HELLMUTH`) |
| Sammler | Arbeiter und Bau |
| Kuratorin | Caster (benannte Figur: Kuratorin Vestra) |
| Suchfalter | Flieger |
| Apothekerin | Nahkampf |
| Destillateur | Fernkampf |
| Alchemist | schwer |

**Geschlechter-Kanon HELLMUTH:** Apothekerin und Kuratorin weiblich;
Destillateur, Alchemist und Novize männlich; Hellmuth männlich.

## MODERAT

Industrielle Zuckermaschine.

### Gebäude

| Name | Rolle |
|---|---|
| Zuckermaschine | HQ und Zentrale |
| Raffinerie | Aufrüstung |
| Schlickwerk | Produktion |
| Gärtank | Versorgung |
| Vorposten | Verteidigung |
| Destillatsickerung | Destillat-Förderung |

### Einheiten

| Name | Rolle |
|---|---|
| Sirup-Trupp | Arbeiter und Bau |
| Stahlbrute | schwer |
| Rohrkanone | Belagerung |
| Schleuderer | Fernkampf |
| Toxischer Nebler | Caster |
| Sirup-Kern | Drohne (prozedural animiert; deckungsgleich mit dem Ziel-HUD »Zerstöre alle Sirup-Kerne«) |

## Fraktions-Embleme

| Fraktion | Emblem |
|---|---|
| HELLMUTH | Stilisiertes **Brennnesselblatt mit zwei kleinen Flügeln**: herzförmig, spitzes Ende, fein gezähnter Rand. **Kein Cannabisblatt.** |
| MODERAT | Grinsende, bestachelte **Totenkopf-Sonne**, auf Tanks und Rüstung gestempelt. |

Volle Prompt-Definition in `docs/ASSET-PROMPTS-KREA-V2.md` (Fraktionspaletten).

## Ressourcen

| Name | Beschreibung |
|---|---|
| Botanicals | Basisressource (Pflanzlich, von HELLMUTH über Haine geerntet). |
| Reinwasser | Zweitressource (über Quellen gewonnen). |
| Destillat | Fortgeschrittene Ressource (Destillatsickerung von MODERAT / Veredelung). |

## Tech-Stufen

In aufsteigender Reihenfolge:

1. APOTHEKE
2. AVANTGARDE
3. ALCHEMIE

---

## Noch nicht nachgezogen (projektweit, außerhalb dieser Doku)

Die Umbenennung ist hier kanonisch festgehalten. Folgende Stellen tragen die
alten Anzeige-Namen noch und sind in eigenen, koordinierten Schritten nachzu-
ziehen (nicht Teil des Code2-UI-Auftrags):

- `src/ui/html_hud.ts` — HUD-Embleme zeigen `HELLMUTH` / `MODERAT` plus Claims
  (»REINHEIT DURCH WISSEN« / »SÜSSE IST ZWANG«). Claims neu zu betexten, sobald
  Ticro sie für HELLMUTH/MODERAT freigibt.
- `hellmuth/CLAUDE.md` — Projektbeschreibung nennt noch »DIE HELLMUTH« /
  »DIE MODERAT«.
- Interner `FactionId` (`hellmuth`/`moderat`) — bleibt als Code-Schlüssel,
  bis ein projektweiter Refactor beschlossen wird (siehe oben).
