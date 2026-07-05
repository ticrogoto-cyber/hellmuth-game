# Kampf & Animation — Konvention (Code3, Runde 5 / Paket 4)

Verbindliche Schnittstellen und Konventionen aus Strang 5 (Kampf) + Strang 7
(Animation). Balance-ZAHLEN bleiben Ticro (als `_platzhalter` markiert).

## Render-Konvention (Richtungen) — verbindlich

`src/util/unit_anim.ts`: `DIR_OFFSET_RAD = -π/2`, `DIR_FLIP = -1`.
Bildschirm-Bewegung → Atlas-Richtung (empirisch kalibriert, im Spiel geprüft):

| Bewegung | Atlas-deg | Ansicht |
|---|---|---|
| Norden (hoch) | 000 | Rücken |
| Süden (runter) | 180 | Front |
| Osten (rechts) | 270 | rechts |
| Westen (links) | 090 | links |

Gilt für 8 Richtungen; bei 16 dieselbe Formel (nur `dirs` im Atlas-Eintrag).
Frame-Schema: `<stem>_<clip>_<dir3>_<frame2>`.

## Hit-Frame-Bindung (Strang 5 ↔ 7)

Schaden fällt am **Treffer-Frame** des `attack`-Clips, nicht am Cooldown-Tick:

- Animator zählt einen `hitFrame`-Index pro Attack-Clip (datengetrieben,
  `UnitAtlas.hitFrame`, Default `floor(count/2)`).
- `UnitAnimator.attackHitFired()` ist genau im Update true, in dem der Clip den
  `hitFrame` überschreitet (Edge-Detect).
- `Unit.attackHitReady()` / `Unit.attackHasHitFrame()` kapseln das.
- Combat (`tickUnit`, in Reichweite): `if (cooldown<=0 && (!attackHasHitFrame() ||
  attackHitReady())) attack()`. Einheiten **ohne** Attack-Clip (kein Atlas)
  buchen weiter am Cooldown-Tick (unverändert) — keine Regression.
- Folge: `EVT_UNIT_HIT` wird damit für animierte Angreifer **hit-frame-genau**.
  Code4s Blut auf `EVT_UNIT_HIT` liegt automatisch am echten Kontaktframe; der
  Animator-Hook `attackHitFired()` steht zusätzlich bereit.
- Projektil (`angriffstyp` „fern"/dritter Fall) bleibt für später offen.

Reihenfolge: `updateAnimation` läuft pro Frame (Render-Pfad); Combat liest den
Animator-Zustand des Frames (1-Frame-Latenz, unsichtbar). Das Testbed
(`window.__sim.step`) treibt `updateAnimation` mit, sonst meldete der Animator
step-getrieben nie den Hit-Frame.

## Auto-Targeting / acquireMode — Abbildung

Statt eines separaten `acquireMode`-Enums über `fireState` + `movingByCommand`
abgebildet (kein redundanter State, kein Konflikt mit Paket 3):

| Absicht | Zustand | Verhalten |
|---|---|---|
| Move | `movingByCommand=true` | kein Auto-Acquire bis Ankunft (off) |
| Attack-Move / Patrouille | `attackMove`/`umherstreifen`, `fireState=frei` | auto |
| Hold | `moveState=halten` + `fireState=erwidern` | Position halten, nur in Waffenreichweite feuern, nicht verfolgen |
| Stop | Orders gelöscht, Default `direkt`+`frei` | acquired + verfolgt |
| Einzelangriff | `attackTarget` gesetzt | off bis Ziel tot, dann auto |

`fireState`: `frei` = Acquire bis `acquireRange`; `erwidern` = nur
`weaponRange` (defensiv); `feuerhalten` = kein Acquire.
`seekRange ≥ weaponRange`: Acquire nutzt `max(reichweite, acquireRange)` (frei)
bzw. `reichweite`; der In-Range-Schlag prüft `def.reichweite`.

## Bedrohungsgewichtete Zielwahl (`target_priority.ts`)

`score = tier·100 + dist − threat·6 − dps·1,2 − (fokussiert ? 20 : 0)`
(niedriger = besser). Wechsel nur bei `kandidat < aktuell − 10` (Hysterese) →
**0 Flatter-Wechsel bei Gleichrang** (im Testbed bestätigt). `threat`:
Held 3, caster/siege 2, heavy/ranged 1 — **Platzhalter, KANON-LÜCKE (Ticro)**.

## TTK / DPS — Gerüst (Formel verbindlich, Zahlen offen)

```
DPS  = angriffstempo · max(1, schaden − ruestung_ziel)
TTK  = hp_ziel / DPS
N_break(A vs B) = ⌈ TTK(A→B) / TTK(B→A) ⌉
```

Mit den **Platzhalter-Heldenwerten** 200 HP / 25 Schaden / 0,8 Tempo:
`N_break(Held vs Apothekerin) ≈ 14`. Finale Werte legt Ticro fest
(**KANON-LÜCKE**).

## Animation-Härtung (Strang 7)

- Min-Dwell/Hysterese (`MIN_DWELL = {idle:120, walk:100, attack:200}` ms),
  walk→idle erst nach 80 ms Stillstand (Doppelschwelle) → kein Flackern.
  `attack→attack` nullt `clipMs` NICHT (kein Zucken).
- **Tween-Verbot**: Min-Dwell + Hit-Frame ausschließlich aus `dtMs`/Frame-Index,
  nie Tween-Callbacks. Einzige Timer-Insel bleibt die `death_fx`-Corpse.
- `death`: einziger scharfer Pfad ist `death_fx.playDeathThenCorpse`
  (kill → `EVT_UNIT_DIED`). Der `death`-Zweig im Animator ist generischer
  Fallback, von `updateAnimation` nicht erreicht (dokumentiert). Frame-Dauer
  `DEATH_FRAME_MS = 70` als eine Konstante (Animator + death_fx).
- `harvest`: Auslöser verdrahtet, wartet auf Sammler-Atlas (keine Logikänderung).
