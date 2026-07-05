// gefecht_shot.mjs — Beweis-Harness Gefechts-VFX (Brief CODE7GEFECHTSVFX §Beweise).
//   node tools/gefecht_shot.mjs                 # alle Messungen auf ./dist
//   BEFORE_DIR=/pfad/zu/altem/checkout node ... # zusaetzlich Vorher-Messung
// Vorbedingung: `npm run build` (dist/ aktuell). Muster: tools/phys_smoke.mjs
// (vite preview + Playwright + window.__sim; Canvas-Renderer fuers Capture).
//
// Beweis 1: deterministischer Gefechts-Screenshot (beide Fraktionen feuern,
//           Tracer/Ringe/Rauch/Nebel sichtbar) -> proof/gefecht/gefecht_vfx.png
// Beweis 2: Draw-Calls + Blend-Wechsel pro Frame, WebGL-Lauf mit gl-Hook,
//           vorher (BEFORE_DIR) / nachher; Zielkorridor < 30 Draws.
// Beweis 3: Ambient-Budget: __ambient.stats() (Objekte je Subsystem, tickMsAvg)
//           gegen die 1,5-ms-Marke.
// Beweis 4: Determinismus: zwei Laeufe gleicher Seed -> __sim.hash gleich,
//           Ring-Puls-Phasen (pulseProbe) bit-gleich, Blut-Zaehler gleich.
// Beweis 5: GC: Heap-Samples ueber 60 s Dauerfeuer, kein monotoner Anstieg.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const PORT = Number(process.env.GEFECHT_PORT || 4181);
const SHOT_DIR = process.env.SHOT_DIR || "proof/gefecht";
const BASE = `http://localhost:${PORT}`;

function startPreview(cwd) {
  const p = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], {
    cwd: cwd || process.cwd(),
    stdio: "pipe",
  });
  return new Promise((resolve, reject) => {
    let tries = 0;
    const tick = async () => {
      try {
        const r = await fetch(BASE + "/");
        if (r.ok) return resolve(p);
      } catch {
        /* not up yet */
      }
      if (++tries > 80) return reject(new Error("vite preview kam nicht hoch"));
      setTimeout(tick, 250);
    };
    tick();
  });
}

async function launchBrowser() {
  return chromium.launch({
    executablePath: process.env.PW_CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--no-sandbox"],
  });
}

async function newPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.route("**/*", (route) => {
    const u = route.request().url();
    if (u.includes("fonts.googleapis") || u.includes("fonts.gstatic")) return route.abort();
    return route.continue();
  });
  page.on("pageerror", (e) => {
    if (/decode audio data/i.test(e.message)) return;
    console.error("PAGEERR", e.message);
  });
  return page;
}

// Gefechts-Aufstellung: Fernkampf-Duell (Tracer!) + Nahkampf + Industrie steht
// schon (Testmap-Gebaeude -> Rauch/Glow). Beide Fraktionen feuern.
function setupBattle({ seed, steps }) {
  const sim = window.__sim;
  const gs = window.__game.registry.get("gameState");
  sim.setDriven(true);
  sim.clear();
  sim.setSeed(seed);
  // Fernkampf-Linien (R4): destillateur (HELLMUTH, Gold) vs schleuderer
  // (MODERAT, Magenta) auf ~3 Tiles -> beide feuern Projektile = Tracer.
  for (let i = 0; i < 8; i++) {
    sim.spawn("spieler", "destillateur", 14, 12 + i);
    sim.spawn("gegner", "schleuderer", 17, 12 + i);
  }
  // Nahkampf-Knaeuel darunter (Blut/Splatter/Tode).
  for (let i = 0; i < 6; i++) {
    sim.spawn("spieler", "apotheker", 15, 22 + i);
    sim.spawn("gegner", "stahlbrute", 16, 22 + i);
  }
  const cam = window.__game.scene.getScene("game").cameras.main;
  cam.setZoom(1.35);
  const u = gs.units[10];
  if (u) cam.centerOn(u.x + 60, u.y + 120);
  for (let s = 0; s < steps; s++) sim.step(1);
  return { units: gs.units.length, simTick: gs.simTick };
}

// Beweis-4-Sonde: Positions-Hash + Ring-Puls-Phasen + Blut-Zaehler.
function determinismProbe() {
  const scene = window.__game.scene.getScene("game");
  const blood = scene.blood ?? null; // optionales Handle
  const rings = scene.__auraRings ? scene.__auraRings.pulseProbe() : [];
  const bloodStats = blood && blood.stats ? blood.stats() : null;
  return {
    hash: window.__sim.hash(),
    rings,
    blood: bloodStats,
    tick: window.__game.registry.get("gameState").simTick,
  };
}

// Beweis-3-Sonde: Ambient-Objekte + Tick-Kosten.
function ambientProbe() {
  const scene = window.__game.scene.getScene("game");
  const amb = scene.__ambient;
  if (!amb) return null;
  amb.resetStats();
  return null; // reset; Messung nach Laufzeit via ambientRead
}
function ambientRead() {
  const scene = window.__game.scene.getScene("game");
  const amb = scene.__ambient;
  const tracer = scene.__tracer ? scene.__tracer.stats() : null;
  const rings = scene.__auraRings ? scene.__auraRings.stats() : null;
  return amb ? { ...amb.stats(), tracer, rings } : null;
}

// GL-Hook (Beweis 2): zaehlt draw*-Calls + blendFunc-Wechsel je rAF-Frame.
const GL_HOOK = `(() => {
  const stats = { frames: [], cur: null };
  window.__glstats = stats;
  const wrap = (proto) => {
    if (!proto || proto.__vfxWrapped) return;
    proto.__vfxWrapped = true;
    const de = proto.drawElements, da = proto.drawArrays;
    const bf = proto.blendFunc, bfs = proto.blendFuncSeparate;
    proto.drawElements = function (...a) { if (stats.cur) stats.cur.draws++; return de.apply(this, a); };
    proto.drawArrays = function (...a) { if (stats.cur) stats.cur.draws++; return da.apply(this, a); };
    proto.blendFunc = function (...a) { if (stats.cur) stats.cur.blend++; return bf.apply(this, a); };
    proto.blendFuncSeparate = function (...a) { if (stats.cur) stats.cur.blend++; return bfs.apply(this, a); };
  };
  if (window.WebGLRenderingContext) wrap(WebGLRenderingContext.prototype);
  if (window.WebGL2RenderingContext) wrap(WebGL2RenderingContext.prototype);
  const loop = () => {
    if (stats.cur && (stats.cur.draws || stats.cur.blend)) {
      stats.frames.push(stats.cur);
      if (stats.frames.length > 300) stats.frames.shift();
    }
    stats.cur = { draws: 0, blend: 0 };
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
})();`;

function glRead() {
  const f = window.__glstats.frames.slice(-120);
  if (!f.length) return null;
  const avg = (k) => f.reduce((s, x) => s + x[k], 0) / f.length;
  const max = (k) => Math.max(...f.map((x) => x[k]));
  return {
    frames: f.length,
    drawsAvg: Math.round(avg("draws") * 10) / 10,
    drawsMax: max("draws"),
    blendAvg: Math.round(avg("blend") * 10) / 10,
    blendMax: max("blend"),
    rendererType: window.__game ? window.__game.renderer.type : -1, // 2 = WEBGL
  };
}

// --- Messlaeufe -------------------------------------------------------------

async function main() {
  mkdirSync(SHOT_DIR, { recursive: true });
  const out = { ts: new Date().toISOString() };

  // ===== Lauf 1: Canvas (Screenshot + Determinismus + Budget + GC) ==========
  {
    const preview = await startPreview();
    const browser = await launchBrowser();
    const page = await newPage(browser);
    await page.goto(BASE + "/?renderer=canvas", { waitUntil: "load" });
    await page.waitForFunction(() => !!window.__sim && !!window.__game, { timeout: 30000 });
    await page.waitForTimeout(1200);

    // Beweis 4: zwei identische Laeufe, gleicher Seed. 400 ms Settle nach den
    // Steps: der Ring-Zuordnungs-Poll laeuft alle 250 ms im Render-Takt; der
    // Puls selbst haengt an simTick (steht im driven-Modus fest -> stabil).
    // Blut-Zaehler sind kumulativ ueber Laeufe -> DELTAS vergleichen.
    const runProbe = async () => {
      const pre = await page.evaluate(determinismProbe);
      await page.evaluate(setupBattle, { seed: 42, steps: 70 });
      // Ring-Zuordnung laeuft im 250-ms-Render-Poll; headless rendert langsam
      // -> auf die Zuordnung WARTEN statt fixe Zeit (framerate-unabhaengig).
      await page.waitForFunction(
        () => {
          const s = window.__game.scene.getScene("game");
          return !!s.__auraRings && s.__auraRings.stats().active > 0;
        },
        { timeout: 15000 },
      );
      const post = await page.evaluate(determinismProbe);
      const delta = {};
      if (pre.blood && post.blood) {
        for (const k of Object.keys(post.blood)) {
          if (typeof post.blood[k] === "number") delta[k] = post.blood[k] - (pre.blood[k] ?? 0);
        }
      }
      return { ...post, bloodDelta: delta };
    };
    const A = await runProbe();
    const B = await runProbe();
    out.determinism = {
      hashA: A.hash,
      hashB: B.hash,
      hashEqual: A.hash === B.hash && A.hash !== 0,
      ringsA: A.rings.length,
      ringsEqual: JSON.stringify(A.rings) === JSON.stringify(B.rings),
      ringsProbe: A.rings.slice(0, 6),
      bloodDeltaA: A.bloodDelta,
      bloodDeltaB: B.bloodDelta,
      bloodEqual: JSON.stringify(A.bloodDelta) === JSON.stringify(B.bloodDelta),
      tick: A.tick,
    };

    // Beweis 1: Screenshot mitten im Feuerwechsel (frischer Lauf, weniger Steps
    // -> Projektile in der Luft).
    await page.evaluate(setupBattle, { seed: 42, steps: 46 });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${SHOT_DIR}/gefecht_vfx.png` });
    out.screenshot = `${SHOT_DIR}/gefecht_vfx.png`;

    // Beweis 3: Ambient-Budget ueber ~5 s Laufzeit (Render-Ticks sammeln).
    await page.evaluate(ambientProbe);
    await page.waitForTimeout(5000);
    out.ambient = await page.evaluate(ambientRead);

    // Beweis 5: 60 s Dauerfeuer, Heap alle 2 s. Nachschub haelt den Kampf am
    // Leben (Dauerfeuer), driven-Steps treiben die Sim.
    const heap = [];
    const t0 = Date.now();
    let spawnWave = 0;
    while (Date.now() - t0 < 60000) {
      await page.evaluate((wave) => {
        const sim = window.__sim;
        const gs = window.__game.registry.get("gameState");
        for (let s = 0; s < 8; s++) sim.step(1);
        // Nachschub, wenn eine Seite ausduennt (Dauerfeuer).
        const alive = { spieler: 0, gegner: 0 };
        for (const u of gs.units) alive[u.owner]++;
        if (alive.spieler < 8) sim.spawn("spieler", wave % 2 ? "destillateur" : "apotheker", 13 + (wave % 4), 14 + (wave % 8));
        if (alive.gegner < 8) sim.spawn("gegner", wave % 2 ? "schleuderer" : "stahlbrute", 18 + (wave % 4), 14 + (wave % 8));
      }, spawnWave++);
      if (spawnWave % 8 === 0) {
        const m = await page.evaluate(() => (performance.memory ? performance.memory.usedJSHeapSize : 0));
        heap.push(m);
      }
      await page.waitForTimeout(220);
    }
    const half = Math.floor(heap.length / 2);
    const avg = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
    const h1 = avg(heap.slice(0, half));
    const h2 = avg(heap.slice(half));
    out.gc = {
      samples: heap.map((v) => Math.round(v / 1048576)),
      firstHalfMiB: Math.round(h1 / 1048576),
      secondHalfMiB: Math.round(h2 / 1048576),
      growthPct: h1 > 0 ? Math.round(((h2 - h1) / h1) * 1000) / 10 : 0,
    };

    await browser.close();
    preview.kill();
  }

  // ===== Lauf 2: WebGL (Draw-Calls + Blend-Wechsel), nachher ================
  const webglMeasure = async (cwd, label) => {
    const preview = await startPreview(cwd);
    const browser = await launchBrowser();
    const page = await newPage(browser);
    await page.addInitScript(GL_HOOK);
    await page.goto(BASE + "/", { waitUntil: "load" }); // Default-Renderer (WebGL)
    try {
      await page.waitForFunction(() => !!window.__sim && !!window.__game, { timeout: 30000 });
      await page.waitForTimeout(1200);
      await page.evaluate(setupBattle, { seed: 42, steps: 40 });
      // LIVE-Feuerwechsel waehrend der Messung: driven-Steps in Wellen, damit
      // die gesammelten Frames Tracer/Blitze/Tode ENTHALTEN (nicht eingefroren).
      for (let w = 0; w < 12; w++) {
        await page.evaluate(() => {
          for (let s = 0; s < 3; s++) window.__sim.step(1);
        });
        await page.waitForTimeout(260);
      }
      const r = await page.evaluate(glRead);
      await browser.close();
      preview.kill();
      return r;
    } catch (e) {
      await browser.close();
      preview.kill();
      return { error: String(e.message || e), rendererType: -1 };
    }
  };
  out.drawCallsAfter = await webglMeasure(undefined, "nachher");
  if (process.env.BEFORE_DIR) {
    out.drawCallsBefore = await webglMeasure(process.env.BEFORE_DIR, "vorher");
  }

  // ===== Auswertung ==========================================================
  writeFileSync(`${SHOT_DIR}/messwerte.json`, JSON.stringify(out, null, 2));
  let red = 0;
  const checks = [];
  const want = (name, ok, got) => {
    if (!ok) red++;
    checks.push([name, ok, got]);
  };

  want("B4 Positions-Hash zweier Laeufe identisch", out.determinism.hashEqual, `${out.determinism.hashA} == ${out.determinism.hashB}`);
  want("B4 Ring-Puls-Phasen bit-identisch", out.determinism.ringsEqual && out.determinism.ringsA > 0, `${out.determinism.ringsA} Ringe, Probe ${JSON.stringify(out.determinism.ringsProbe)}`);
  // Splatter-Rotationen: headless-Beweis ueber die Phaser-freie Hash-Schicht
  // (bit-identisch + reihenfolge-unabhaengig). Die ANZAHL render-getriebener
  // Zusatzstempel (corpse_pulse-Timing) ist Render-Kosmetik -> Doku §Residuen.
  const splat = spawnSync("npx", ["tsx", "test/vfx/splatter_determinism.test.ts"], { encoding: "utf8" });
  out.splatterTest = (splat.stdout || "").trim().split("\n").pop();
  want("B4 Splatter-Rotationen deterministisch (tsx-Test)", splat.status === 0, out.splatterTest);
  want("B3 Ambient-Tick unter 1,5 ms", !!out.ambient && out.ambient.tickMsAvg < 1.5, out.ambient ? `${out.ambient.tickMsAvg.toFixed(3)} ms` : "keine Sonde");
  want("B3 Ambient-Objekte im D3-Korridor (~220)", !!out.ambient && out.ambient.totalObjects <= 260, out.ambient ? `${out.ambient.totalObjects}` : "-");
  want("B5 Heap waechst nicht monoton (<15 %)", out.gc.growthPct < 15, `${out.gc.growthPct} % (H1 ${out.gc.firstHalfMiB} MiB -> H2 ${out.gc.secondHalfMiB} MiB)`);
  const dca = out.drawCallsAfter;
  const dcb = out.drawCallsBefore;
  const webglOk = dca && dca.rendererType === 2 && dca.frames > 0;
  if (webglOk) {
    want("B2 Draw-Calls im Gefechtsbild < 30 (avg)", dca.drawsAvg < 30, `avg ${dca.drawsAvg} / max ${dca.drawsMax}`);
    // Blend-Bilanz: die Testmap hat eine VFX-unabhaengige Grundlast (Bloom-
    // Kamera-Pass, FoW, HUD -- gemessen im Vorher-Build). Kriterium der
    // Konsolidierung: TROTZ ~35 neuer ADD-Objekte (Ringe, Glows, Tracer,
    // Wolken) KEIN Anstieg gegen vorher. Ohne BEFORE_DIR: Absolut-Deckel 16.
    if (dcb && dcb.rendererType === 2) {
      want("B2 Blend-Wechsel: kein Anstieg trotz VFX-Vollausbau", dca.blendAvg <= dcb.blendAvg + 0.5, `nachher ${dca.blendAvg} vs vorher ${dcb.blendAvg} (Grundlast Bestand)`);
    } else {
      want("B2 Blend-Wechsel unter Absolut-Deckel (<=16 avg)", dca.blendAvg <= 16, `avg ${dca.blendAvg} / max ${dca.blendMax}`);
    }
  } else {
    want("B2 WebGL-Messlauf (swiftshader)", false, dca ? `rendererType=${dca.rendererType} ${dca.error ?? ""}` : "kein Ergebnis");
  }

  console.log("");
  console.log("GEFECHTS-VFX — Beweis-Harness:");
  console.log("STATUS  PRUEFUNG                                            IST");
  for (const [name, ok, got] of checks) console.log(`${ok ? "GRUEN " : "ROT   "}  ${String(name).padEnd(48)} ${got}`);
  console.log("");
  console.log(`Screenshot: ${out.screenshot}`);
  console.log(`Ambient:    ${JSON.stringify(out.ambient)}`);
  console.log(`DrawCalls:  nachher=${JSON.stringify(out.drawCallsAfter)}${out.drawCallsBefore ? ` vorher=${JSON.stringify(out.drawCallsBefore)}` : ""}`);
  console.log(`-> ${SHOT_DIR}/messwerte.json`);
  console.log(red === 0 ? "GEFECHT-VFX-GATE: GRUEN" : `GEFECHT-VFX-GATE: ROT (${red})`);
  process.exit(red === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ABBRUCH:", e.stack || e.message);
  process.exit(1);
});
