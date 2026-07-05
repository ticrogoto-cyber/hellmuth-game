# fx — Effekt-Dienst

Technik-agnostische Hülle für visuelle Effekte (Treffer, Tod, Mündungsfeuer,
Umgebungslicht …). Dieser Ordner ist **nur das Gerüst**: Dispatcher, Pooling und
Scene-Einhängung. Die konkreten Effekte stecken später als Handler ein.

## Eisernes Gesetz (Optik)

Die Iso-Optik hat **kein dynamisches Licht** — alles ist eingebacken. „Licht
tanzt auf Objekten" wird **gefälscht**: additive Glow-Sprites
(`BlendModes.ADD`) + Bloom, weich, dezent, wenige. Kein Effekt-Handler erzeugt
echtes Licht. Abnahme ist immer das gerenderte bewegte Bild im Browser, nie das
Konzept (siehe Mess-Brücke unten).

## API

```ts
import { installFx, getFx } from "../fx";

// einmal in GameScene.create():
installFx(this);

// von überall in der Scene:
getFx(this)?.spawn("placeholder", worldX, worldY, { color: 0xf0e6b0, scale: 1 });
```

- `installFx(scene)` — hängt den Dienst an die Scene, registriert den
  Platzhalter-Handler, tickt selbst über das Scene-`UPDATE`-Event und räumt beim
  `SHUTDOWN` auf. Idempotent. **Der einzige nötige Eingriff in `game_scene.ts`.**
- `getFx(scene)` — der Dienst der Scene (oder `undefined`).
- `fx.spawn(type, x, y, opts?)` — feuert einen Effekt an Weltkoordinate. Fehlt
  der Handler: Dev-Warnung, sonst No-op. Reine Darstellung, reißt nie die Logik.
- `fx.register(type, handler)` — steckt einen Effekt-Handler ein (siehe unten).

### Eingebaute Handler

| Typ | Technik | Quelle |
|---|---|---|
| `placeholder` | neutrale Diagnose-Raute (kein VFX) | `placeholder_fx.ts` |
| `flash` | additiver Glow-Blitz | `systems/fx.ts` `FxSystem.flash` |
| `sparks` | gepoolter Funken-Burst (ADD) | `FxSystem.burst` |
| `smoke` | aufsteigender Rauch (NORMAL) | `FxSystem.smoke` |
| `shockwave` | additiver Ring | `FxSystem.shockwave` |
| `sheet` | Flipbook-Player (32er-Pool) | `FxSystem.playFrames` |
| `blood` | Substanz-Spritzer (Stufe-1-RT) | `systems/blood_system.ts` |
| `blood_burst` | Blutexplosion (Stempel + Gibs) | `BloodSystem.bloodBurst` |
| `explosion` | Schicht-Komposit (Offsets, Register) | `fx/explosion.ts` |

`fx.explosion(x, y, register, opts)` ist die Bequem-Naht (delegiert an den
`explosion`-Handler). `register ∈ "moderat" | "hellmuth" | "blood"`.

`opts` je Typ: `sparks`→`{color,scale,duration,count,speed}`, `smoke`→`{color,scale,rise,frequency}`, `sheet`→`{sheet,frames,frameRate,scale,rotation,blendAdd,anchor:"ground"|"center"}`.

## Einen Effekt-Handler einstecken

Ein Handler ist eine Funktion `(ctx, x, y, opts) => void`. Er entscheidet **selbst**
über die Technik — 3D-Bake-zu-Sheet, handgemaltes Sheet, Phaser-Partikel oder
additiver Glow. Der Dienst kennt nur das Interface.

```ts
fx.register("spark", (ctx, x, y, opts) => {
  // Objekt aus dem Pool holen (statt neu erzeugen/zerstören):
  const img = ctx.pool.acquire("spark", () =>
    ctx.scene.add.image(0, 0, "fx_glow").setBlendMode(Phaser.BlendModes.ADD),
  );
  img.setPosition(x, y).setDepth(opts.depth ?? ctx.depthFor(y)).setTint(opts.color ?? 0xffffff);

  // Animiert? Einen per-Frame-Treiber registrieren; false = fertig:
  let t = 0;
  ctx.drive((dt) => {
    t += dt;
    img.setScale(1 + t / 400).setAlpha(Math.max(0, 1 - t / 400));
    if (t < 400) return true;
    ctx.pool.release("spark", img); // zurück in den Pool
    return false;
  });
});
```

Fire-and-forget (Tween/Partikel mit Selbstzerstörung) braucht **keinen** Treiber.

### `ctx` (FxContext)

| Feld | Zweck |
|---|---|
| `scene` | die Phaser-Scene |
| `pool` | Pooling-Substrat (`acquire(key, factory)` / `release(key, obj)`) |
| `depthFor(y)` | Sortier-Tiefe; Effekte liegen über den Einheiten (`y + 1000`) |
| `drive(fn)` | per-Frame-Treiber registrieren; `fn(dt)` → `false` wenn fertig |

## Verhältnis zu `systems/fx.ts` / `systems/death_fx.ts`

`systems/fx.ts` (`FxSystem`: `flash`/`burst`/`shockwave`/`corpse`/Resource-Light)
und `systems/death_fx.ts` (Event-Layer) sind **bestehende, konkrete** Primitive.
Dieser Dienst ist die **Orchestrierungs-Schicht darüber** (String-Dispatch +
Pooling + Lifecycle). Paket A hat die Primitive gehärtet und als Handler hinter
`fx.spawn(...)` gehängt (`core_handlers.ts`). `death_fx` und der Dispatcher teilen
sich **ein** `FxSystem` je Scene (`getFxSystem(scene)`) — keine doppelten Pools.

## Stand: Paket A (Fundament-Härtung) eingesteckt

Die drei Fundament-Techniken sind die ersten Handler hinter `fx.spawn`:

- **S1 Fake-Licht & Bloom:** `fakeLight(target, opts)` parametrisiert die
  Vorkommens-Glows (Quelle/Destillat/Hain); `installBloom(scene)` legt **einen**
  Vollbild-Bloom-Pass auf die Kamera (WebGL-only, sonst No-op). Alpha bleibt
  niedrig — Bloom liefert die Helligkeit.
- **S2 Partikel-Pool:** `burst()` nutzt **einen persistenten Emitter je Preset**
  (kein `add.particles`/`destroy` pro Aufruf), `maxAliveParticles`-Kappen + globale
  Drossel; Funken auf `ADD`, Rauch (`smoke()`) auf `NORMAL`.
- **S3 Flipbook-Player:** `playFrames()` mit Sprite-Pool (Group, 32), Anker
  `ground|center`, Frame-0-Absicherung.

Pakete **B (Blut)** und **C (Explosionen)** stecken in dieselbe Naht — sie
komponieren `flash`/`sparks`/`smoke`/`shockwave`/`sheet` zu Effekten und liefern
die echten Sheets (Paket C konsumiert `playFrames`).

## Mess-Brücke (Headless-Abnahme)

`tools/fx_browser.mjs` schießt den **echten Spiel-Canvas** (anders als die
HUD-Harness, die den Canvas vor dem Capture entfernt). **S1-Bloom ist WebGL-only**,
darum ist WebGL der Default — und Headless-WebGL-Capture funktioniert in diesem
Container (mit der vorinstallierten Chrome + swiftshader). `FX_RENDERER=canvas`
erzwingt den Canvas-2D-Fallback (ohne Bloom, für die A/B-Probe).

```sh
npm run build
CHR=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
PW_CHROME=$CHR node tools/fx_browser.mjs                 # WebGL: Glow + Bloom + S2-Pool
PW_CHROME=$CHR FX_RENDERER=canvas node tools/fx_browser.mjs  # Canvas: A/B ohne Bloom
PW_CHROME=$CHR FX_MODE=flip node tools/fx_browser.mjs    # S3: 40 Spawns -> 32er-Pool
# -> /tmp/fx/fx_webgl.png, fx_canvas.png, fx_flip.png  (+ Pool-/Emitter-Logs)
```

Belegt: WebGL zeigt den weichen Bloom-Saum (Kern bleibt getönt), Canvas nicht;
60 Funken-Bursts → **1** Emitter; 40 Flipbook-Spawns → **32** aktive Sprites.

> Hinweis Container: `npx playwright install` ist blockiert (CDN nicht in der
> Egress-Allowlist). Der vorinstallierte Browser unter `/opt/pw-browsers`
> (Build 1194) wird über `PW_CHROME` angesteuert.

## Tooling-Befund (Optik-Bausteine)

- **Phaser-postFX Bloom/Glow:** vorhanden in Phaser 3.90
  (`node_modules/phaser/src/fx/Bloom.js`, `Glow.js`, `Blur.js`, `Bokeh.js`,
  `Shine.js` …). **Aber WebGL-only** — unter dem Canvas-Renderer (Headless-Shots)
  inert. Die additive Glow-Sprite-Optik rendert dagegen in **beiden** Renderern;
  deshalb ist sie die Basis, Bloom nur die Kür obendrauf.
- **3D→2D-Flipbook-Bake:** Die Pipeline existiert als Code
  (`tools/render_unit.py`, `iso-pipeline/blender_master_rig.py`), braucht aber
  **Blender** — im Container **nicht installiert**. Effekt-Sheets aus 3D müssten
  außerhalb gebacken und als Assets eingespielt werden.
