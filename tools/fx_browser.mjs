// fx_browser.mjs — Headless-Mess-Bruecke fuer den Effekt-Dienst (fx).
//
//   npm run build && node tools/fx_browser.mjs            # WebGL (Default; Bloom!)
//   FX_RENDERER=canvas node tools/fx_browser.mjs          # Canvas-2D-Fallback
//
// Schiesst den ECHTEN Spiel-Canvas (anders als hud_browser.mjs, die den Canvas
// vor dem Capture wegwirft -- daher zeigt sie Bloom nie). S1-Bloom ist WebGL-only,
// also ist WebGL der Default. FX_RENDERER=canvas erzwingt den Canvas-2D-Renderer
// (stabiler Fallback, ohne Bloom). Belegt zusaetzlich den S2-Pool: viele Funken
// desselben Presets -> die Zahl der ParticleEmitter-Objekte bleibt klein.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const PORT = Number(process.env.FX_PORT || 4174);
const BASE = `http://localhost:${PORT}`;
const VIEW = { width: 1280, height: 800 };
const OUT = process.env.SHOT_DIR || process.env.FX_OUT || "/tmp/fx";
// Destillat-Modi: Canvas-Renderer als Default. WebGL-headless rendert die leere
// Blut-Stage1-RT (Tiefe -96000) als opakes Tuerkis-Rechteck (uninitialisierter
// Buffer in der Swift-Shader-Pipeline) -- das verdeckt HELLMUTH-Boden + Tropfen.
// Drip/Parasit-Modi: Canvas-Renderer (WebGL-headless rendert die leere Blut-RT
// als opakes Tuerkis). Glow-Modi: WebGL -- der ADD-Blend des Glows kommt im
// Canvas-2D-Headless (globalCompositeOperation 'lighter') nicht durch.
const CANVAS_MODES = new Set(["destille_drip", "destille_drip_cap", "parasit_drain", "parasit_drain_no_target"]);
const RENDERER =
  process.env.FX_RENDERER === "canvas"
    ? "canvas"
    : process.env.FX_RENDERER === "webgl"
      ? "webgl"
      : CANVAS_MODES.has(process.env.FX_MODE)
        ? "canvas"
        : "webgl";
const MODE = [
  "flip",
  "blood",
  "persist",
  "explo",
  "debris",
  "splash",
  "persistfade",
  "pulse",
  "wound",
  "ballistic",
  "destille_drip",
  "destille_drip_cap",
  "parasit_drain",
  "parasit_drain_no_target",
  "glow_state",
  "glow_sort",
  "glow_perf",
  "kill_splatter",
].includes(process.env.FX_MODE)
  ? process.env.FX_MODE
  : "light";

// Headless drosselt rAF fuer "verdeckte" Seiten (deshalb tickte der Loop bisher
// langsam). Diese Flags halten den Renderer wach -> realistischeres Frame-Timing.
const AWAKE_ARGS = [
  "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding",
  "--disable-backgrounding-occluded-windows",
];

async function startPreview() {
  const p = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], {
    cwd: process.cwd(),
    stdio: "pipe",
  });
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(BASE + "/");
      if (r.ok) return p;
    } catch {
      /* noch nicht oben */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("vite preview kam nicht hoch (dist/ vorhanden? npm run build?)");
}

// Im Browserkontext: auf ein Vorkommen (Fake-Licht) zoomen, Funken feuern,
// S2-Pool belegen. Identische Kamera in beiden Renderern -> WebGL zeigt Bloom,
// Canvas nicht (A/B-Beleg fuer S1).
const EXERCISE = () => {
  const scene = window.__game.scene.getScene("game");
  const fx = scene.fx;
  const cam = scene.cameras.main;
  const gs = scene.registry.get("gameState");

  const countEmitters = () =>
    scene.children.getAll().filter((o) => o.type === "ParticleEmitter").length;
  const emittersBefore = countEmitters();

  // Auf die Quelle (reinwasser: Manna-Glow + Strahlen + Dunst) zoomen; sonst auf
  // das erste Vorkommen. Feste Kamera fuer den A/B-Vergleich.
  const node =
    gs.nodes.find((n) => n.ressource === "reinwasser") ||
    gs.nodes.find((n) => n.ressource === "botanicals") ||
    gs.nodes[0];
  if (node) {
    cam.centerOn(node.x, node.y - 20);
    cam.setZoom(4.5);
  }

  // S2: 60 Funken-Bursts desselben Presets (Farbe/Tempo/Skala/Leben gleich) ->
  // nur EIN zusaetzlicher Emitter darf entstehen, nicht 60.
  const cx = node ? node.x : cam.midPoint.x;
  const cy = node ? node.y - 20 : cam.midPoint.y;
  for (let i = 0; i < 60; i++) fx.spawn("sparks", cx, cy + 30, { color: 0xf0e6b0, count: 10, speed: 90 });

  return {
    renderer: scene.renderer.type === 2 ? "WEBGL" : "CANVAS",
    focusNode: node ? node.ressource : "none",
    cx,
    cy,
    types: fx.types(),
    emittersBefore,
    emittersAfterSamePreset: countEmitters(),
    serviceStats: fx.stats(),
  };
};

// Frischer, dichter Funken-Burst + heller additiver Kern genau vor dem Schuss
// (Partikel auf dem Hoehepunkt) -> Bloom-Saum maximal sichtbar.
const FRESH = ([cx, cy]) => {
  const scene = window.__game.scene.getScene("game");
  const fx = scene.fx;
  fx.spawn("sparks", cx, cy + 24, { color: 0xf0e6b0, count: 60, speed: 70 });
  fx.spawn("flash", cx, cy, { color: 0xeaf6ff, scale: 2.0, duration: 320 });
};

// S3-Test: ein prozedural erzeugtes Test-Spritesheet (expandierender Ring, 8
// Frames) -- KEIN geshipptes Asset, nur ein Pruefstand fuer den Flipbook-Player.
// Feuert 40 Spawns gegen den 32er-Pool (kappt bei 32), halb "ground", halb
// "center" verankert.
const FLIP = () => {
  const scene = window.__game.scene.getScene("game");
  const fx = scene.fx;
  const cam = scene.cameras.main;
  const key = "fx_test_sheet";
  const fw = 64;
  const fh = 64;
  const n = 8;
  if (!scene.textures.exists(key)) {
    const tex = scene.textures.createCanvas(key, fw * n, fh);
    const ctx = tex.getContext();
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      ctx.beginPath();
      ctx.arc(i * fw + fw / 2, fh / 2, 4 + t * 26, 0, Math.PI * 2);
      ctx.lineWidth = Math.max(1, 7 * (1 - t));
      ctx.strokeStyle = `rgba(255, ${Math.floor(170 + 70 * t)}, 110, ${1 - t * 0.55})`;
      ctx.stroke();
      tex.add(i, 0, i * fw, 0, fw, fh);
    }
    tex.refresh();
  }
  cam.setZoom(1.4);
  const c = cam.midPoint;
  let requested = 0;
  for (let r = 0; r < 5; r++) {
    for (let col = 0; col < 8; col++) {
      fx.spawn("sheet", c.x - 200 + col * 55, c.y - 120 + r * 60, {
        sheet: key,
        frames: n,
        frameRate: 14,
        anchor: col % 2 ? "ground" : "center",
        scale: 1.2,
      });
      requested++;
    }
  }
  const active = scene.children
    .getAll()
    .filter((o) => o.type === "Sprite" && o.texture && o.texture.key === key && o.active).length;
  return { requested, activeFlipSprites: active };
};

// Paket B: HELLMUTH-Blut (links) vs. MODERAT-Ploerre (rechts) -> als sichtbar
// verschiedene Substanzen lesbar. Plus je eine Blutexplosion (grosser Stempel +
// Gibs). Belegt zugleich die Stempel-Drossel (DRAW_CAP/Frame).
const BLOOD = () => {
  const scene = window.__game.scene.getScene("game");
  const fx = scene.fx;
  const cam = scene.cameras.main;
  cam.setZoom(1.1);
  const c = cam.midPoint;
  for (let i = 0; i < 16; i++) {
    fx.spawn("blood", c.x - 300 + (Math.random() * 200 - 100), c.y - 30 + (Math.random() * 150 - 75), {
      faction: "hellmuth",
      scale: 0.3 + Math.random() * 0.22,
    });
    fx.spawn("blood", c.x + 220 + (Math.random() * 200 - 100), c.y - 30 + (Math.random() * 150 - 75), {
      faction: "moderat",
      scale: 0.3 + Math.random() * 0.22,
    });
  }
  fx.spawn("blood_burst", c.x - 280, c.y + 150, { faction: "hellmuth", scale: 0.7 });
  fx.spawn("blood_burst", c.x + 240, c.y + 150, { faction: "moderat", scale: 0.7 });
  return scene.blood ? scene.blood.stats() : { note: "kein blood-handle" };
};

// Stufe-2-Persistenz: persistente Marken setzen, Kamera weit wegfahren (erzwingt
// Fenster-Recenter = Fenster geloescht) und zurueck -> die persistenten Marken
// muessen bleiben (eigene kartenweite RT, weltgenagelt, kein Fade).
const PERSIST_SETUP = () => {
  const scene = window.__game.scene.getScene("game");
  const fx = scene.fx;
  const cam = scene.cameras.main;
  cam.setZoom(0.9);
  const cx = cam.midPoint.x;
  const cy = cam.midPoint.y;
  const R = 240;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    fx.spawn("blood_burst", cx + Math.cos(a) * R, cy + Math.sin(a) * R, {
      faction: i % 2 ? "moderat" : "hellmuth",
      scale: 0.6,
    });
  }
  // vergaengliches Fenster-Blut in der Mitte (muss nach dem Recenter weg sein)
  for (let i = 0; i < 12; i++) {
    fx.spawn("blood", cx + (Math.random() * 130 - 65), cy + (Math.random() * 130 - 65), { faction: "hellmuth", scale: 0.4 });
  }
  cam.centerOn(cx + 4400, cy + 3300); // weit weg -> Fenster-Recenter
  return { cx, cy, stats: scene.blood.stats() };
};
const PERSIST_RETURN = ([cx, cy]) => {
  window.__game.scene.getScene("game").cameras.main.centerOn(cx, cy);
  return window.__game.scene.getScene("game").blood.stats();
};

// Paket C: MODERAT-Explosionen (Magenta/Orange) links, HELLMUTH-Magie (Gold/
// Tuerkis) rechts -> ohne Beschriftung unterscheidbar. Plus eine Blutexplosion
// (blood-Register) -> persistenter Stempel, kein Feuer.
const EXPLO = () => {
  const scene = window.__game.scene.getScene("game");
  const fx = scene.fx;
  const cam = scene.cameras.main;
  cam.setZoom(0.85);
  const c = cam.midPoint;
  // MODERAT links, HELLMUTH rechts (je gross + klein), Blutexplosion unten.
  fx.explosion(c.x - 430, c.y - 90, "moderat", { big: true, scale: 2.2 });
  fx.explosion(c.x - 280, c.y + 90, "moderat", { big: false, scale: 1.2 });
  fx.explosion(c.x + 300, c.y - 90, "hellmuth", { big: true, scale: 2.2 });
  fx.explosion(c.x + 440, c.y + 90, "hellmuth", { big: false, scale: 1.2 });
  fx.explosion(c.x, c.y + 250, "blood", { scale: 1.1, faction: "moderat" });
  return { cx: c.x, cy: c.y, types: fx.types() };
};

// Paket D: grosse Explosionen -> Hero-Chunks (Wurfparabel). Bild 1 mitten im Flug
// (taumelnde Chunks in der Luft), Bild 2 gelandet (Truemmer-Abdruecke am Boden).
const DEBRIS_M = () => {
  const scene = window.__game.scene.getScene("game");
  const fx = scene.fx;
  const cam = scene.cameras.main;
  cam.setZoom(1.3);
  const c = cam.midPoint;
  fx.explosion(c.x - 120, c.y, "moderat", { big: true, scale: 2.4 });
  fx.explosion(c.x + 150, c.y - 30, "hellmuth", { big: true, scale: 2.2 });
  return { cx: c.x, cy: c.y };
};

// Blut-Paket A Strang 1: gerichtete Spritz-Fontaene. Treffer von links -> Blut
// nach rechts (HELLMUTH rot), von rechts -> nach links (MODERAT magenta), ohne
// ax/ay -> nach oben (Degradation).
const SPLASH = () => {
  const scene = window.__game.scene.getScene("game");
  const fx = scene.fx;
  const cam = scene.cameras.main;
  cam.setZoom(1.0);
  const c = cam.midPoint;
  fx.spawn("blood_splash", c.x - 160, c.y - 70, { faction: "hellmuth", ax: c.x - 460, ay: c.y - 70, count: 16 });
  fx.spawn("blood_splash", c.x + 160, c.y - 70, { faction: "moderat", ax: c.x + 460, ay: c.y - 70, count: 16 });
  fx.spawn("blood_splash", c.x, c.y + 150, { faction: "hellmuth", count: 16 });
  return { stats: fx.stats() };
};

// Blut-Paket A Strang 2: Brennpunkt aus persistenten Marken (fuer den ~5-min-Fade).
const PFADE_SETUP = () => {
  const scene = window.__game.scene.getScene("game");
  const fx = scene.fx;
  const cam = scene.cameras.main;
  cam.setZoom(0.95);
  const c = cam.midPoint;
  const b = scene.blood;
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * 6.28;
    const r = Math.random() * 260;
    fx.spawn("blood", c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, { faction: i % 2 ? "moderat" : "hellmuth", scale: 0.5 });
  }
  for (let i = 0; i < 30; i++) {
    const a = Math.random() * 6.28;
    const r = Math.random() * 220;
    b.stampPersistent(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, i % 2 ? "moderat" : "hellmuth", 0.6);
  }
  return { fill0: b.stats().persistFill };
};

// Blut-Paket B Strang 3 (USP): nachpulsende Leichen.
// CODE4 BLUT+MAGENTA: A/B-Standbild fuer Blut-Kalibrierung. Feuert EVT_UNIT_DIED
// (statt fx.spawn), damit der ganze Tod-FX-Layer (death_fx.onUnitDied) laeuft --
// dort sitzt stampKillSplatter. Zwei Substanzen im gleichen Frame (KLARHEIT +
// GENERIK), damit der Vergleich beide Farben zeigt.
const KILL_SPLATTER = () => {
  const scene = window.__game.scene.getScene("game");
  const cam = scene.cameras.main;
  cam.setZoom(1.6);
  const c = cam.midPoint;
  const emit = (x, y, faction) => {
    scene.events.emit("fx.unit_died", {
      x, y,
      faction,
      sev: "mass",
    });
  };
  // Drei Positionen: links KLARHEIT, mitte KLARHEIT, rechts GENERIK.
  emit(c.x - 160, c.y - 20, "klarheit");
  emit(c.x + 0,   c.y + 30, "klarheit");
  emit(c.x + 160, c.y - 20, "generik");
  return { emitted: 3, center: [c.x, c.y] };
};

const PULSE = () => {
  const scene = window.__game.scene.getScene("game");
  const fx = scene.fx;
  const cam = scene.cameras.main;
  cam.setZoom(1.3);
  const c = cam.midPoint;
  fx.spawn("corpse_pulse", c.x - 130, c.y - 20, { faction: "hellmuth" });
  fx.spawn("corpse_pulse", c.x + 130, c.y - 20, { faction: "moderat" });
  return { drivers: fx.stats().drivers };
};

// Blut-Paket B Strang 4: Verletzungs-Spur. Deterministisch (Headless-Slowmo
// umgangen): verwundete + gesunde Einheit synthetisch ziehen, wounds.update rufen.
const WOUND = () => {
  const scene = window.__game.scene.getScene("game");
  const gs = scene.registry.get("gameState");
  const cam = scene.cameras.main;
  cam.setZoom(1.0);
  const wounds = scene.wounds;
  const us = gs.units.filter((u) => u.owner === "spieler");
  const hurt = us[0];
  const healthy = us[1];
  hurt.hp = hurt.maxHp * 0.1; // 10 % -> blutet
  healthy.hp = healthy.maxHp; // gesund
  const sx = cam.midPoint.x - 220;
  const sy = cam.midPoint.y;
  hurt.x = sx;
  hurt.y = sy - 50;
  healthy.x = sx;
  healthy.y = sy + 50;
  const d0 = wounds.stats().dripped;
  for (let s = 0; s < 26; s++) {
    hurt.x += 18;
    healthy.x += 18;
    wounds.update(16);
  } // ~468 px Weg
  const woundedDrips = wounds.stats().dripped - d0;
  // Heilung -> Spur stoppt
  hurt.hp = hurt.maxHp * 0.5;
  const d1 = wounds.stats().dripped;
  for (let s = 0; s < 12; s++) {
    hurt.x += 18;
    wounds.update(16);
  }
  return { woundedDrips, afterHealDrips: wounds.stats().dripped - d1, wounded: wounds.stats().wounded };
};

// Blut-Paket B Strang 5: Blut-Ballistik (substanz-blind, persistente Lande-Marken).
const BALLISTIC = () => {
  const scene = window.__game.scene.getScene("game");
  const fx = scene.fx;
  const cam = scene.cameras.main;
  cam.setZoom(0.8);
  const c = cam.midPoint;
  fx.spawn("blood_ballistic", c.x - 250, c.y, { faction: "hellmuth", count: 14 });
  fx.spawn("blood_ballistic", c.x + 250, c.y, { faction: "moderat", count: 14 });
  return { stats: scene.debris.stats() };
};

// Manifest-Check: stehen die Slot-Texturen (Platzhalter) bereit?
const MANIFEST = () => {
  const t = window.__game.scene.getScene("game").textures;
  const keys = ["blut-hellmuth-1", "ploerre-moderat-1", "splash-hellmuth-1", "splash-moderat-1", "drip-hellmuth-1", "drip-moderat-1", "landing-hellmuth-1", "landing-moderat-1", "blut-explo-1", "fx_scorch"];
  return Object.fromEntries(keys.map((k) => [k, t.exists(k)]));
};

// --- DESTILLAT-VFX -----------------------------------------------------------
//
// Synthetisierter Tick-Generator: feuert EVT_DESTILLAT_PRODUCED direkt auf den
// Scene-Events, ohne den Sim-Pfad zu manipulieren. Sauberer als die Wartezeit
// von echten 5 s pro Tick (Headless-rAF ist 13x langsamer als Realtime).
const DESTILLE_DRIP_SETUP = (ticks) => {
  const scene = window.__game.scene.getScene("game");
  const cam = scene.cameras.main;
  // FoW-Veil + Blut-Render-Texture ausblenden -- VFX-Sichtprobe braucht den
  // freien Boden.
  scene.children.getAll().forEach((o) => {
    const key = o.texture && o.texture.key;
    if (key === "fow_veil_mask" || o.type === "RenderTexture") {
      o.setVisible(false);
    }
  });
  // Welt-Koordinate der View-Mitte: cam.getWorldPoint(centerX, centerY) ist die
  // robusteste Mathe (rechnet origin + zoom + scroll konsistent).
  const c = cam.getWorldPoint(cam.width / 2, cam.height / 2);
  const x = c.x;
  const y = c.y;
  // Event-Payload je remote API (death_fx): {x, y, faction}. HELLMUTH triggert
  // den Drip-VFX.
  for (let i = 0; i < ticks; i++) {
    scene.events.emit("fx.destillat_produced", { x, y, faction: "hellmuth" });
  }
  const stats = scene.destilleDrip.stats();
  return { x, y, ticks, stats, fxDrivers: scene.fx.stats().drivers };
};

const DESTILLE_DRIP_DRAIN = () => {
  const scene = window.__game.scene.getScene("game");
  const cam = scene.cameras.main;
  const cams = scene.cameras.cameras.map((c) => ({ id: c.id, name: c.name, vx: Math.round(c.worldView.x), vy: Math.round(c.worldView.y), vw: Math.round(c.worldView.width), z: c.zoom }));
  return {
    drip: scene.destilleDrip.stats(),
    fxDrivers: scene.fx.stats().drivers,
    cams,
    view: { x: Math.round(cam.worldView.x), y: Math.round(cam.worldView.y), w: Math.round(cam.worldView.width), h: Math.round(cam.worldView.height) },
  };
};

const DESTILLE_DESTROY = () => {
  const scene = window.__game.scene.getScene("game");
  // Kritiker-Punkt 3: emuliere Destille-Tod (EVT_BUILDING_DIED), pruefe dass
  // keine NEUEN Drips danach mehr kommen (die alten verfaden normal aus).
  scene.events.emit("fx.building_died", { x: 0, y: 0 });
  // Folge-Tick simulieren -- darf KEINE neue Pfuetze produzieren (im Sim wird
  // die Destille schlicht nicht mehr gezaehlt; hier emulieren wir das, indem
  // wir kein produced-Event mehr feuern).
  return scene.destilleDrip.stats();
};

const PARASIT_DRAIN_SETUP = (withTarget) => {
  const scene = window.__game.scene.getScene("game");
  const gs = scene.registry.get("gameState");
  const cam = scene.cameras.main;
  // FoW-Veil + Blut-RT ausblenden (s. destille_drip).
  scene.children.getAll().forEach((o) => {
    const key = o.texture && o.texture.key;
    if (key === "fow_veil_mask" || o.type === "RenderTexture") {
      o.setVisible(false);
    }
  });
  // Headless-Slowmo: Linien-Dauer fuer die Probe auf 8 s (Spiel-Default 600 ms).
  window.__parasit_dur_ms = 8000;
  // Drop-Punkt aus dem AKTUELLEN worldView (robust gegen panCamera).
  const c = cam.getWorldPoint(cam.width / 2, cam.height / 2);
  const cx = c.x;
  const cy = c.y;
  if (withTarget) {
    // Eine bestehende MODERAT-Einheit nahe an den Drop-Punkt umsetzen.
    const enemy = gs.units.find((u) => u.faction === "moderat" && !u.isDead);
    if (enemy) {
      enemy.x = cx + 220;
      enemy.y = cy - 80;
    }
  } else {
    // MODERAT-Einheiten + MODERAT-HQ aus dem State entfernen -> Linie geht zum HQ
    // bzw. faellt aus.
    const enemies = gs.units.filter((u) => u.faction === "moderat");
    enemies.forEach((u) => gs.removeUnit(u));
    // HQ stehen lassen -> Linie geht zum HQ. (Fallback-Probe).
  }
  // Drop-Event direkt feuern (sonst muesste man einen kompletten Kampf
  // synthetisieren); die VFX-Linie testet die Auswahl-Logik realitaetsnah.
  scene.events.emit("fx.destillat_dropped", { x: cx, y: cy, amount: 2, killerFaction: "moderat" });
  return { cx, cy, drain: scene.parasitDrain.stats() };
};

const PARASIT_DRAIN_DRAIN = () => {
  return {
    drain: window.__game.scene.getScene("game").parasitDrain.stats(),
    fxDrivers: window.__game.scene.getScene("game").fx.stats().drivers,
  };
};

// --- PRODUKTIONS-GLOW (HELLMUTH-Destille) ----------------------------------
// Synthetische Destille bauen: __sim.place erzeugt das Building korrekt, der
// Glow-Tick erkennt es im naechsten Tick (alle 250 ms Polling).
const GLOW_STATE_PLACE = (state) => {
  const scene = window.__game.scene.getScene("game");
  // FoW-Veil + leere Blut-Stage1-RT (uninitialisierter Headless-WebGL-Buffer)
  // ausblenden -- sonst verdecken sie die Sichtprobe. willRender stoppt das
  // Rendering hart, setVisible/setAlpha allein reichen unter swiftshader nicht.
  scene.children.getAll().forEach((o) => {
    const key = o.texture && o.texture.key;
    if (key === "fow_veil_mask" || o.type === "RenderTexture") {
      o.setVisible(false);
      o.setAlpha(0);
      o.willRender = () => false;
    }
  });
  // Selection (Highlight-Rings + Labels) wegnehmen, damit die Sichtprobe sauber
  // bleibt -- gameState.selected leeren + inspected loeschen.
  const gs0 = scene.registry.get("gameState");
  if (gs0) {
    gs0.selected = [];
    gs0.inspected = undefined;
    gs0.units.forEach((u) => u.setHighlight && u.setHighlight(false));
    gs0.buildings.forEach((b) => b.setHighlight && b.setHighlight(false));
  }
  const gs = scene.registry.get("gameState");
  // Erst aufraeumen, falls Reihen-Test.
  window.__sim.clearBuilt();
  const fertig = state !== "under_construction";
  // Destille im Spielerareal -- relativ nah am HQ, damit die Default-View sie
  // garantiert sieht (im Headless ist setScroll/centerOn wackelig wg. panCamera).
  window.__sim.place("spieler", "destille", 10, 8, fertig);
  // Sicherstellen, dass keine Selektion / Inspektion -> kein Highlight-Ring.
  gs.selected = [];
  gs.inspected = undefined;
  const d = gs.buildings.find((b) => b.typeId === "destille" && b.owner === "spieler");
  if (state === "destroyed" && d) {
    // Direktes removeBuilding -> tick() raeumt den Glow ueber liveIds-Diff.
    gs.removeBuilding(d);
  }
  // Im AKTUELLEN Sichtbereich emittieren -- Destille bleibt bei (10,8); Kamera
  // an die View-Mitte ausrichten ist im Headless wackelig. Stattdessen: die
  // Destille NACHTRAEGLICH auf die aktuelle View-Mitte verschieben, damit das
  // Bild garantiert was zeigt. Sim-relevant ist nur fertig/typeId/owner.
  const cam = scene.cameras.main;
  const cm = cam.getWorldPoint(cam.width / 2, cam.height / 2);
  if (d) {
    d.x = cm.x;
    d.y = cm.y;
  }
  return {
    state,
    destille: d ? { id: d.id, x: d.x, y: d.y, fertig: d.fertig } : null,
  };
};

// Kritiker 3: laeuft die Pulsation? Aktivieren, dann Sprite-Ref merken, dann
// Destille zerstoeren -- der Polling-Tick raeumt im naechsten Frame auf.
let __pg_sprite_ref = null;
const GLOW_TWEEN_STOP_CHECK = () => {
  const scene = window.__game.scene.getScene("game");
  const pg = scene.productionGlow;
  const slot = pg.firstSlot();
  if (!slot) return { err: "no slot" };
  const beforeId = slot.building.id;
  const tweensBefore = pg.tweensOnSlot(beforeId);
  // Sprite-Ref auf globaler Variable parken (window), damit FINAL-Check ihn auch
  // findet, nachdem der Slot weg ist (disposeSlot().destroy() in tick()).
  window.__pg_sprite_ref = slot.sprite;
  // Destille zerstoeren -> tick() ruft deactivate() + entfernt Slot.
  const gs = scene.registry.get("gameState");
  gs.removeBuilding(slot.building);
  return {
    tweensBefore,
    note: "Tween-Stop wird vom Polling-Tick (250 ms Sim) erledigt; FINAL-Check wartet darauf.",
  };
};
// Nach dem Tick-Wartefenster: Tweens auf dem geparkten Sprite zaehlen.
const GLOW_TWEEN_STOP_CHECK_FINAL = () => {
  const scene = window.__game.scene.getScene("game");
  const spr = window.__pg_sprite_ref;
  if (!spr) return { err: "no sprite ref" };
  const tweensAfter = scene.tweens.getTweensOf(spr).length;
  return {
    tweensAfter,
    spriteActive: spr.active,
    spriteVisible: spr.visible,
    slots: scene.productionGlow.stats(),
  };
};

const GLOW_STATE_STATS = () => {
  const scene = window.__game.scene.getScene("game");
  const pg = scene.productionGlow;
  // Diagnose: View-Mathe nachzeichnen.
  const cam = scene.cameras.main;
  const slot = pg.firstSlot();
  const slotInfo = slot
    ? {
        sprite_x: Math.round(slot.sprite.x),
        sprite_y: Math.round(slot.sprite.y),
        scale: Math.round(slot.sprite.scale * 100) / 100,
        visible: slot.sprite.visible,
        alpha: slot.sprite.alpha,
        depth: slot.sprite.depth,
        view: {
          x: Math.round(cam.worldView.x),
          y: Math.round(cam.worldView.y),
          w: Math.round(cam.worldView.width),
          h: Math.round(cam.worldView.height),
        },
      }
    : null;
  const big = scene.children
    .getAll()
    .filter((o) => (o.displayWidth || 0) > 250 && o.visible)
    .map((o) => ({
      type: o.type,
      key: o.texture && o.texture.key,
      w: Math.round(o.displayWidth || 0),
      h: Math.round(o.displayHeight || 0),
      d: o.depth,
      vis: o.visible,
      a: o.alpha,
      inView: cam.worldView.contains(o.x, o.y),
    }));
  return { glow: pg.stats(), slot: slotInfo, big };
};

// Drei Einheiten platzieren (vor/hinter/seitlich der Destille), Glow aktivieren.
const GLOW_SORT = () => {
  const scene = window.__game.scene.getScene("game");
  // FoW-Veil + leere Blut-Stage1-RT (uninitialisierter Headless-WebGL-Buffer)
  // ausblenden -- sonst verdecken sie die Sichtprobe. willRender stoppt das
  // Rendering hart, setVisible/setAlpha allein reichen unter swiftshader nicht.
  scene.children.getAll().forEach((o) => {
    const key = o.texture && o.texture.key;
    if (key === "fow_veil_mask" || o.type === "RenderTexture") {
      o.setVisible(false);
      o.setAlpha(0);
      o.willRender = () => false;
    }
  });
  // Selection (Highlight-Rings + Labels) wegnehmen, damit die Sichtprobe sauber
  // bleibt -- gameState.selected leeren + inspected loeschen.
  const gs0 = scene.registry.get("gameState");
  if (gs0) {
    gs0.selected = [];
    gs0.inspected = undefined;
    gs0.units.forEach((u) => u.setHighlight && u.setHighlight(false));
    gs0.buildings.forEach((b) => b.setHighlight && b.setHighlight(false));
  }
  const gs = scene.registry.get("gameState");
  window.__sim.clearBuilt();
  window.__sim.place("spieler", "destille", 8, 5, true);
  const d = gs.buildings.find((b) => b.typeId === "destille" && b.owner === "spieler");
  if (!d) return { err: "no destille" };
  // Sammler (HELLMUTH) sind beim Default-Spawn an col=7..9. Wir verschieben drei
  // direkt fuer den Sort-Test:
  //   hinter: y < d.y (kleineres y, weiter oben)
  //   davor:  y > d.y (groesseres y, weiter unten)
  //   seite:  ~ d.y, x daneben
  const sammler = gs.units.filter((u) => u.faction === "hellmuth" && !u.isDead).slice(0, 3);
  if (sammler.length >= 3) {
    sammler[0].x = d.x - 30; // hinter (oben links)
    sammler[0].y = d.y - 80;
    sammler[1].x = d.x + 10; // davor (unten)
    sammler[1].y = d.y + 90;
    sammler[2].x = d.x + 110; // seitlich rechts
    sammler[2].y = d.y;
  }
  // Kamera-Zoom etwas weiter, damit alle drei sichtbar sind.
  const cam = scene.cameras.main;
  cam.removeBounds();
  cam.setZoom(1.6);
  cam.setScroll(d.x - cam.width / cam.zoom, d.y - cam.height / cam.zoom);
  return { destille: { id: d.id, x: d.x, y: d.y } };
};

const GLOW_SORT_DEPTHS = () => {
  const scene = window.__game.scene.getScene("game");
  const pg = scene.productionGlow;
  const slot = pg.firstSlot();
  if (!slot) return { err: "no slot" };
  const gs = scene.registry.get("gameState");
  const sammler = gs.units.filter((u) => u.faction === "hellmuth" && !u.isDead).slice(0, 3);
  return {
    glow_depth: slot.sprite.depth,
    glow_y: slot.sprite.y,
    building_y: slot.building.y,
    units: sammler.map((u, i) => ({
      i,
      x: Math.round(u.x),
      y: Math.round(u.y),
      depth: u.depth,
      hint: u.y < slot.building.y ? "behind" : u.y > slot.building.y ? "in_front" : "side",
    })),
    sort_ok:
      sammler[0].depth < slot.sprite.depth && // hinter -> rendert FRUEHER (niedrigere Tiefe)
      sammler[1].depth > slot.sprite.depth, // davor -> rendert SPAETER (hoehere Tiefe)
  };
};

// Performance-Modus: 10 Destillen aktiv vs idle, FPS messen.
// "idle" = under_construction (fertig=false): Building existiert, Glow ist aus.
const GLOW_PERF_PLACE = (mode) => {
  const scene = window.__game.scene.getScene("game");
  // FoW-Veil + leere Blut-Stage1-RT (uninitialisierter Headless-WebGL-Buffer)
  // ausblenden -- sonst verdecken sie die Sichtprobe. willRender stoppt das
  // Rendering hart, setVisible/setAlpha allein reichen unter swiftshader nicht.
  scene.children.getAll().forEach((o) => {
    const key = o.texture && o.texture.key;
    if (key === "fow_veil_mask" || o.type === "RenderTexture") {
      o.setVisible(false);
      o.setAlpha(0);
      o.willRender = () => false;
    }
  });
  // Selection (Highlight-Rings + Labels) wegnehmen, damit die Sichtprobe sauber
  // bleibt -- gameState.selected leeren + inspected loeschen.
  const gs0 = scene.registry.get("gameState");
  if (gs0) {
    gs0.selected = [];
    gs0.inspected = undefined;
    gs0.units.forEach((u) => u.setHighlight && u.setHighlight(false));
    gs0.buildings.forEach((b) => b.setHighlight && b.setHighlight(false));
  }
  window.__sim.clearBuilt();
  const fertig = mode === "active";
  // 10 Destillen in einem 4x3-Raster verteilen (Map-Bereich Spieler).
  let i = 0;
  for (let r = 4; r <= 11 && i < 10; r += 2) {
    for (let c = 5; c <= 13 && i < 10; c += 2) {
      window.__sim.place("spieler", "destille", c, r, fertig);
      i++;
    }
  }
  return { placed: i, fertig };
};

const GLOW_PERF_MEASURE = () => {
  // FPS aus Phaser-Loop ablesen + Frame-Zaehler.
  const scene = window.__game.scene.getScene("game");
  return {
    fps: Math.round(scene.game.loop.actualFps * 10) / 10,
    frame: scene.game.loop.frame,
    glow: scene.productionGlow.stats(),
  };
};

async function run() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.PW_CHROME || undefined,
    args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--no-sandbox", ...AWAKE_ARGS],
  });
  const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 1 });
  await page.route("**/*", (route) =>
    route.request().url().includes("fonts.g") ? route.abort() : route.continue(),
  );
  page.on("pageerror", (e) => console.error("PAGEERR", e.message));
  page.on("console", (m) => {
    if (m.type() === "error") console.error("CONSOLE_ERR", m.text());
  });

  const q = RENDERER === "canvas" ? "?renderer=canvas" : "";
  await page.goto(`${BASE}/${q}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => {
      const g = window.__game;
      const s = g && g.scene && g.scene.getScene && g.scene.getScene("game");
      return !!(s && s.fx);
    },
    { timeout: 15000 },
  );
  await page.waitForTimeout(1300); // Terrain/Startaufstellung/Fake-Licht setteln

  let name;
  if (MODE === "flip") {
    const f = await page.evaluate(FLIP);
    console.log("FLIP", JSON.stringify(f));
    await page.waitForTimeout(230); // mitten in der Animation (Frame ~3 von 8)
    name = "fx_flip.png";
  } else if (MODE === "blood") {
    const b = await page.evaluate(BLOOD);
    console.log("BLOOD_SPAWN", JSON.stringify(b));
    await page.waitForTimeout(1600); // Headless-rAF ist langsam: mehr Zeit fuer den Flush
    const after = await page.evaluate(() => window.__game.scene.getScene("game").blood.stats());
    console.log("BLOOD_AFTER", JSON.stringify(after));
    name = "fx_blood.png";
  } else if (MODE === "persist") {
    const a = await page.evaluate(PERSIST_SETUP);
    console.log("PERSIST_SETUP", JSON.stringify(a));
    await page.waitForTimeout(1900); // Recenter (Fenster geloescht); persistente RT bleibt
    const b = await page.evaluate(PERSIST_RETURN, [a.cx, a.cy]);
    console.log("PERSIST_BACK", JSON.stringify(b));
    await page.waitForTimeout(1900); // zurueck in der Mitte: nur Persistentes sichtbar
    name = "fx_persist.png";
  } else if (MODE === "explo") {
    const e = await page.evaluate(EXPLO);
    console.log("EXPLO", JSON.stringify(e));
    await page.waitForTimeout(140); // helle Phase: Blitz/Feuerball/Debris + Frueh-Rauch
    const ca = await page.$("#game-root canvas");
    if (ca) await ca.screenshot({ path: `${OUT}/fx_explo.png` });
    console.log("SHOT", `${OUT}/fx_explo.png`);
    await page.waitForTimeout(850); // Aftermath: Rauch ueberlebt noch, Scorch bleibt
    const bs = await page.evaluate(() => window.__game.scene.getScene("game").blood.stats());
    console.log("EXPLO_BLOOD", JSON.stringify(bs));
    name = "fx_explo_after.png";
  } else if (MODE === "debris") {
    const d = await page.evaluate(DEBRIS_M);
    console.log("DEBRIS", JSON.stringify(d));
    await page.waitForTimeout(2300); // Chunks fliegen aus den Explosionen (Headless-Slowmo)
    console.log("DEBRIS_AIR", JSON.stringify(await page.evaluate(() => window.__game.scene.getScene("game").debris.stats())));
    name = "fx_debris.png";
  } else if (MODE === "splash") {
    console.log("SPLASH", JSON.stringify(await page.evaluate(SPLASH)));
    await page.waitForTimeout(3500); // Tropfen im Flug (Headless-Slowmo)
    console.log("SPLASH_AIR", JSON.stringify(await page.evaluate(() => window.__game.scene.getScene("game").fx.stats())));
    const ca = await page.$("#game-root canvas");
    if (ca) await ca.screenshot({ path: `${OUT}/fx_splash.png` });
    console.log("SHOT", `${OUT}/fx_splash.png`);
    await page.waitForTimeout(9000); // bis alle gesettlet -> Leak-Check (pool.live -> 0)
    console.log("SPLASH_SETTLED", JSON.stringify(await page.evaluate(() => window.__game.scene.getScene("game").fx.stats())));
    name = "fx_splash_after.png";
  } else if (MODE === "persistfade") {
    console.log("PFADE_SETUP", JSON.stringify(await page.evaluate(PFADE_SETUP)));
    await page.waitForTimeout(1400); // window-Blut flushen + setteln
    const c0 = await page.$("#game-root canvas");
    if (c0) await c0.screenshot({ path: `${OUT}/fx_persistfade_0.png` });
    console.log("SHOT", `${OUT}/fx_persistfade_0.png`);
    const half = await page.evaluate(() => {
      const b = window.__game.scene.getScene("game").blood;
      b.pumpPersistFade(25);
      return b.stats().persistFill;
    });
    console.log("PFADE_HALF_2p5min", half);
    await page.waitForTimeout(200);
    const c1 = await page.$("#game-root canvas");
    if (c1) await c1.screenshot({ path: `${OUT}/fx_persistfade_1.png` });
    console.log("SHOT", `${OUT}/fx_persistfade_1.png`);
    const full = await page.evaluate(() => {
      const b = window.__game.scene.getScene("game").blood;
      b.pumpPersistFade(25);
      return b.stats().persistFill;
    });
    console.log("PFADE_FULL_5min", full);
    // Steady-State: konstante Stempelrate vs Fade -> Fuellgrad pendelt konstant.
    const series = await page.evaluate(() => {
      const scene = window.__game.scene.getScene("game");
      const b = scene.blood;
      const c = scene.cameras.main.midPoint;
      const out = [];
      for (let k = 0; k < 48; k++) {
        for (let j = 0; j < 5; j++) {
          const a = Math.random() * 6.28;
          const r = Math.random() * 240;
          b.stampPersistent(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, j % 2 ? "moderat" : "hellmuth", 0.5);
        }
        b.pumpPersistFade(1);
        if (k % 8 === 7) out.push(b.stats().persistFill);
      }
      return out;
    });
    console.log("PFADE_STEADY_SERIES", JSON.stringify(series));
    await page.waitForTimeout(200);
    name = "fx_persistfade_2.png";
  } else if (MODE === "pulse") {
    console.log("PULSE_SPAWN", JSON.stringify(await page.evaluate(PULSE)));
    console.log("MANIFEST", JSON.stringify(await page.evaluate(MANIFEST)));
    await page.waitForTimeout(4500); // erste Pulse: Blut + Tropfen am Koerper
    console.log("PULSE_MID", JSON.stringify(await page.evaluate(() => window.__game.scene.getScene("game").fx.stats())));
    const cp = await page.$("#game-root canvas");
    if (cp) await cp.screenshot({ path: `${OUT}/fx_pulse.png` });
    console.log("SHOT", `${OUT}/fx_pulse.png`);
    await page.waitForTimeout(26000); // bis alle Pulse durch sind -> Treiber drainiert
    console.log("PULSE_DRAINED", JSON.stringify(await page.evaluate(() => window.__game.scene.getScene("game").fx.stats())));
    name = "fx_pulse_after.png";
  } else if (MODE === "kill_splatter") {
    console.log("KILL_SPLATTER", JSON.stringify(await page.evaluate(KILL_SPLATTER)));
    await page.waitForTimeout(1400); // stampKillSplatter -> Queue -> Flush
    const stats = await page.evaluate(() => window.__game.scene.getScene("game").blood.stats());
    console.log("KILL_SPLATTER_STATS", JSON.stringify(stats));
    name = "fx_kill_splatter.png";
  } else if (MODE === "wound") {
    console.log("WOUND", JSON.stringify(await page.evaluate(WOUND)));
    await page.waitForTimeout(900); // persistente Spur flushen
    name = "fx_wound.png";
  } else if (MODE === "ballistic") {
    console.log("BALLISTIC", JSON.stringify(await page.evaluate(BALLISTIC)));
    await page.waitForTimeout(2600); // Tropfen im Bogen
    console.log("BALLISTIC_AIR", JSON.stringify(await page.evaluate(() => window.__game.scene.getScene("game").debris.stats())));
    name = "fx_ballistic.png";
  } else if (MODE === "destille_drip") {
    // Maus in die Mitte, damit Edge-Pan die Kamera nicht zerwirft.
    await page.mouse.move(VIEW.width / 2, VIEW.height / 2);
    // Camera setteln lassen (centerCameraOnMap + Veil-Init).
    await page.waitForTimeout(800);
    const setup = await page.evaluate(DESTILLE_DRIP_SETUP, 6);
    console.log("DESTILLE_DRIP_SETUP", JSON.stringify(setup));
    await page.waitForTimeout(9000); // Headless-Slowmo: Tween ~700 ms Sim
    const mid = await page.evaluate(DESTILLE_DRIP_DRAIN);
    console.log("DESTILLE_DRIP_MID", JSON.stringify(mid));
    // Kein Treiber-Leak: fxDrivers muss 0 sein (Pflichtprobe 5, Drain).
    name = "fx_destille_drip.png";
  } else if (MODE === "destille_drip_cap") {
    await page.mouse.move(VIEW.width / 2, VIEW.height / 2);
    await page.waitForTimeout(800);
    const setup = await page.evaluate(DESTILLE_DRIP_SETUP, 12);
    console.log("DESTILLE_DRIP_CAP_SETUP", JSON.stringify(setup));
    await page.waitForTimeout(9000);
    const mid = await page.evaluate(DESTILLE_DRIP_DRAIN);
    console.log("DESTILLE_DRIP_CAP_MID", JSON.stringify(mid));
    // Schuss SOFORT NACH MID (Pfuetzen frisch sichtbar, Cap=8 wirkt).
    const ca = await page.$("#game-root canvas");
    if (ca) await ca.screenshot({ path: `${OUT}/fx_destille_drip_cap.png` });
    console.log("SHOT", `${OUT}/fx_destille_drip_cap.png`);
    // Treiber drainen pruefen + Destille zerstoeren (Kritiker-Punkt 3).
    await page.waitForTimeout(5000);
    const destroyed = await page.evaluate(DESTILLE_DESTROY);
    console.log("DESTILLE_DRIP_CAP_DESTROYED", JSON.stringify(destroyed));
    name = "fx_destille_drip_cap_after.png";
  } else if (MODE === "parasit_drain") {
    await page.mouse.move(VIEW.width / 2, VIEW.height / 2);
    await page.waitForTimeout(800);
    const setup = await page.evaluate(PARASIT_DRAIN_SETUP, true);
    console.log("PARASIT_DRAIN_SETUP", JSON.stringify(setup));
    await page.waitForTimeout(600);
    const ca = await page.$("#game-root canvas");
    if (ca) await ca.screenshot({ path: `${OUT}/fx_parasit_drain.png` });
    console.log("SHOT", `${OUT}/fx_parasit_drain.png`);
    const mid = await page.evaluate(PARASIT_DRAIN_DRAIN);
    console.log("PARASIT_DRAIN_MID", JSON.stringify(mid));
    // Drain-Probe: nach voller Animation muessen live==0 und fxDrivers==0.
    // Linien-Dauer ist hier 8 s (window.__parasit_dur_ms), Headless-Slowmo
    // braucht reichlich Realtime fuer den Abschluss.
    await page.waitForTimeout(13000);
    const drained = await page.evaluate(PARASIT_DRAIN_DRAIN);
    console.log("PARASIT_DRAIN_DRAINED", JSON.stringify(drained));
    name = "fx_parasit_drain_drained.png";
  } else if (MODE === "parasit_drain_no_target") {
    await page.mouse.move(VIEW.width / 2, VIEW.height / 2);
    await page.waitForTimeout(800);
    const setup = await page.evaluate(PARASIT_DRAIN_SETUP, false);
    console.log("PARASIT_DRAIN_NO_TARGET_SETUP", JSON.stringify(setup));
    await page.waitForTimeout(600);
    const ca2 = await page.$("#game-root canvas");
    if (ca2) await ca2.screenshot({ path: `${OUT}/fx_parasit_drain_no_target.png` });
    console.log("SHOT", `${OUT}/fx_parasit_drain_no_target.png`);
    const mid = await page.evaluate(PARASIT_DRAIN_DRAIN);
    console.log("PARASIT_DRAIN_NO_TARGET_MID", JSON.stringify(mid));
    await page.waitForTimeout(8000);
    const drained = await page.evaluate(PARASIT_DRAIN_DRAIN);
    console.log("PARASIT_DRAIN_NO_TARGET_DRAINED", JSON.stringify(drained));
    name = "fx_parasit_drain_no_target_drained.png";
  } else if (MODE === "glow_state") {
    // FX_STATE: under_construction | idle | active | cooldown | destroyed.
    await page.mouse.move(VIEW.width / 2, VIEW.height / 2);
    await page.waitForTimeout(600);
    const state = process.env.FX_STATE || "active";
    const setup = await page.evaluate(GLOW_STATE_PLACE, state);
    console.log("GLOW_STATE_SETUP", JSON.stringify(setup));
    await page.waitForTimeout(1200); // 1 Probe-Tick + Pulsation einschwingen
    const stats = await page.evaluate(GLOW_STATE_STATS);
    console.log("GLOW_STATE_STATS", JSON.stringify(stats));
    // Kritiker-3-Audit: wenn state=active, jetzt zerstoeren und Tweens pruefen.
    if (state === "active") {
      // Destille zerstoeren -> warten bis der Polling-Tick (250 ms Sim) den Slot
      // entfernt. Headless-Slowmo: ~13x; daher 4 s Realzeit.
      const tweenCheck = await page.evaluate(GLOW_TWEEN_STOP_CHECK);
      console.log("GLOW_TWEEN_STOP_IMMEDIATE", JSON.stringify(tweenCheck));
      await page.waitForTimeout(4000);
      const final = await page.evaluate(GLOW_TWEEN_STOP_CHECK_FINAL);
      console.log("GLOW_TWEEN_STOP_FINAL", JSON.stringify(final));
    }
    name = `fx_glow_state_${state}.png`;
  } else if (MODE === "glow_sort") {
    await page.mouse.move(VIEW.width / 2, VIEW.height / 2);
    await page.waitForTimeout(600);
    const setup = await page.evaluate(GLOW_SORT);
    console.log("GLOW_SORT_SETUP", JSON.stringify(setup));
    await page.waitForTimeout(1200);
    const depths = await page.evaluate(GLOW_SORT_DEPTHS);
    console.log("GLOW_SORT_DEPTHS", JSON.stringify(depths));
    name = "fx_glow_sort.png";
  } else if (MODE === "glow_perf") {
    // FX_PERFMODE: active | idle. Misst FPS ueber 10 s Realzeit.
    await page.mouse.move(VIEW.width / 2, VIEW.height / 2);
    await page.waitForTimeout(600);
    const mode = process.env.FX_PERFMODE === "idle" ? "idle" : "active";
    const setup = await page.evaluate(GLOW_PERF_PLACE, mode);
    console.log("GLOW_PERF_SETUP", JSON.stringify(setup));
    await page.waitForTimeout(2000); // einschwingen
    const startFrame = (await page.evaluate(GLOW_PERF_MEASURE)).frame;
    const t0 = Date.now();
    await page.waitForTimeout(10000); // 10 s Mess-Fenster
    const tEnd = Date.now();
    const endStats = await page.evaluate(GLOW_PERF_MEASURE);
    const realtimeSec = (tEnd - t0) / 1000;
    const measuredFps = (endStats.frame - startFrame) / realtimeSec;
    console.log(
      "GLOW_PERF_MEASURE",
      JSON.stringify({ mode, ...endStats, measuredFps: Math.round(measuredFps * 10) / 10, realtimeSec }),
    );
    name = `fx_glow_perf_${mode}.png`;
  } else {
    const info = await page.evaluate(EXERCISE);
    console.log("EXERCISE", JSON.stringify(info));
    await page.waitForTimeout(120);
    // Frischer Burst auf dem Hoehepunkt direkt vor dem Schuss.
    await page.evaluate(FRESH, [info.cx, info.cy]);
    await page.waitForTimeout(90);
    name = `fx_${RENDERER}.png`;
  }
  const canvas = await page.$("#game-root canvas");
  try {
    if (canvas) await canvas.screenshot({ path: `${OUT}/${name}` });
    else await page.screenshot({ path: `${OUT}/${name}`, clip: { x: 0, y: 0, ...VIEW } });
    console.log("SHOT", `${OUT}/${name}`);
  } catch (e) {
    console.error("SHOT_FAILED", e && e.message ? e.message : String(e));
  }
  await browser.close();
}

let preview;
try {
  preview = await startPreview();
  await run();
  if (preview) preview.kill("SIGKILL");
  process.exit(0);
} catch (e) {
  console.error("HARNESS_ERROR", e && e.message ? e.message : String(e));
  if (preview) preview.kill("SIGKILL");
  process.exit(1);
}
