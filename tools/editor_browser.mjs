// editor_browser.mjs — Headless-Chromium-Harness fuer den HELLMUTH-Karteneditor.
//   node tools/editor_browser.mjs shoot "<query>" <name>   -> Canvas-PNG + Frame-PNG
//   node tools/editor_browser.mjs gate                     -> Mess-Gate (Exit 1 bei Befund)
// Startet `vite preview` (dist/) und arbeitet gegen die ECHTE App. Erfasst den
// Boden ueber canvas.toDataURL() (Canvas-Renderer; WebGL-Framebuffer-Capture ist
// headless instabil) -- so wird das ECHTE Bild geprueft, nicht die Bounding-Box.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { chromium } from "playwright";

const PORT = Number(process.env.ED_PORT || 4174);
const BASE = `http://localhost:${PORT}`;
const VIEW = { width: 1680, height: 1050 };
const LAUNCH = {
  executablePath: process.env.PW_CHROME || undefined,
  args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--no-sandbox"],
};
// SHOT_DIR vereinheitlicht das Ausgabe-Ziel aller Shot-Tools (Fallback = heutiger Pfad).
const ED_OUT = process.env.SHOT_DIR || "/tmp/edshots";
const GATE_OUT = process.env.SHOT_DIR || "/tmp/gate";

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
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("vite preview kam nicht hoch");
}

async function newPage(browser, query) {
  const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 1 });
  await page.route("**/*", (route) => {
    const u = route.request().url();
    return u.includes("fonts.googleapis") || u.includes("fonts.gstatic") ? route.abort() : route.continue();
  });
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));
  page.on("console", (m) => {
    if (m.type() === "error") errs.push("CONSOLE " + m.text());
  });
  const q = query + (query.includes("?") ? "&" : "?") + "renderer=canvas";
  await page.goto(`${BASE}/${q}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__editorReady === true, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(900);
  page.__errs = errs;
  return page;
}

/** Liest den Spiel-Canvas als PNG-Buffer (Boden ohne DOM-Panel). */
async function canvasPng(page) {
  const dataUrl = await page.evaluate(() => {
    const c = document.querySelector("#game-root canvas");
    return c ? c.toDataURL("image/png") : null;
  });
  if (!dataUrl) return null;
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

async function shoot(query, name, zoom, cx, cy) {
  const browser = await chromium.launch(LAUNCH);
  mkdirSync(ED_OUT, { recursive: true });
  const page = await newPage(browser, query);
  if (zoom) {
    // Kamera fuer einen Detail-Shot setzen (Welt-Zoom + Zentrum in Gitterkoord.).
    await page.evaluate(
      ([z, gx, gy]) => {
        const g = window.__game;
        const sc = g.scene.getScene("editor");
        const HW = 80,
          HH = 48;
        const wx = (gx - gy) * HW + 36 * HW;
        const wy = (gx + gy) * HH + 96;
        sc.cameras.main.setZoom(z);
        sc.cameras.main.centerOn(wx, wy);
      },
      [zoom, cx ?? 18, cy ?? 18],
    );
    await page.waitForTimeout(500);
  }
  const png = await canvasPng(page);
  if (png) writeFileSync(`${ED_OUT}/${name}.png`, png);
  // Zusaetzlich das gerahmte Editor-Bild (mit Werkzeugleiste) fuer die Demo.
  await page.screenshot({ path: `${ED_OUT}/${name}_frame.png` });
  console.log(`shot ${name}: canvas=${png ? png.length : 0}B errs=${page.__errs.length}`);
  if (page.__errs.length) console.log(page.__errs.slice(0, 8).join("\n"));
  await browser.close();
}

async function gate(queries) {
  const browser = await chromium.launch(LAUNCH);
  let anyFail = false;
  for (const [query, name] of queries) {
    const page = await newPage(browser, query);
    const report = await page.evaluate(() => {
      const ed = window.__editor;
      return ed && ed.gate ? ed.gate() : null;
    });
    if (!report) {
      console.log(`GATE ${name}: kein Report (Editor nicht bereit). errs:`, page.__errs.slice(0, 5).join(" | "));
      anyFail = true;
      await page.close();
      continue;
    }
    const badTiles = report.tiles.filter((t) => !t.pass);
    console.log(`\n=== GATE: ${name} ===`);
    console.log(`  Kachelprobe: ${report.tiles.length} Texturen, ${badTiles.length} mit Naht-Befund` +
      (badTiles.length ? " -> " + badTiles.map((t) => `${t.key}:${t.ratio}`).join(", ") : " (alle nahtlos)"));
    console.log(`  Terrain: hardCuts=${report.terrain.hardCuts}, maxCluster=${report.terrain.maxCluster}, soft=${report.terrain.softFraction}, bandPx=${report.terrain.medianBandPx} -> ${report.terrain.pass ? "OK" : "FAIL"}`);
    console.log(`  Wiederholung: schmelz1D=${report.repetition.worstPeak} (${report.repetition.perSort.map((s) => s.id + ":" + s.peak).join(", ")}), bild2D=${report.repetition.rendered2D}@lag${report.repetition.rendered2DLag} -> ${report.repetition.pass ? "OK" : "FAIL"}`);
    console.log(`  Objekte: ${report.objects.total}, Kontakt ${report.objects.withContact}, schwebend ${report.objects.floating} -> ${report.objects.pass ? "OK" : "FAIL"}`);
    console.log(`  Platzierung: blockierend=${report.placement.blocking}, maxKollinear=${report.placement.maxCollinear}, gitterAnteil=${report.placement.gridLockedFraction}, nnVar=${report.placement.nnVarCoef} -> ${report.placement.pass ? "OK" : "FAIL"}`);
    console.log(`  Variation: decals=${report.variation.decals}, decalScaleStdev=${report.variation.scaleStdev}, orient=${report.variation.orientations}, doodadTypen=${report.variation.doodadTypes}, doodadScaleStdev=${report.variation.doodadScaleStdev}, klone=${report.variation.doodadClones} -> ${report.variation.pass ? "OK" : "FAIL"}`);
    console.log(`  Offen/Detail: ${report.open.ratio} (${report.open.pass ? "im Band" : "ausserhalb 0.5..0.85"})`);
    console.log(`  Spielbar: Startpunkte=${report.playable.spawns}, verbunden=${report.playable.reachable} -> ${report.playable.pass ? "OK" : "FAIL"}`);
    console.log(`  Pixel(RGB): uniform=${report.pixel.uniform}, lumaStdev=${report.pixel.lumaStdev}, max.harte Naht=${report.pixel.maxHardRun}px, schwebend ${report.pixel.objFloating}/${report.pixel.objChecked} -> ${report.pixel.pass ? "OK" : "FAIL"}`);
    console.log(`  Roundtrip bit-identisch: ${report.roundtrip.pass ? "OK" : "FAIL"}`);
    console.log(`  --> ${report.pass ? "GRUEN" : "ROT: " + report.fails.join(" | ")}`);
    if (!report.pass) anyFail = true;
    await page.close();
  }
  await browser.close();
  return anyFail;
}

async function authormap(name) {
  const browser = await chromium.launch(LAUNCH);
  const page = await newPage(browser, "?editor=1");
  const text = await page.evaluate((mapName) => {
    const ed = window.__editor;
    const A = ed.author;
    // Seeded RNG -> reproduzierbares Layout (das Ergebnis wird als Datei fixiert).
    let s = (mapName === "offen" ? 0x0ffe0 : 0xd1c47) >>> 0;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 4294967296);
    const ri = (a, b) => Math.floor(a + rnd() * (b - a + 1));

    if (mapName === "offen") {
      A.reset(36, 36, "Offene Ebene");
      // Grasige Sandlehm-Ebene grossflaechig ueber die tote Erde.
      for (let r = 2; r < 34; r += 3) for (let c = 2; c < 34; c += 3) A.brush(c + ri(-1, 1), r + ri(-1, 1), 1, 4, 0.6);
      // Steppe-Marschweg als geschwungene Geste P1(6,30) -> P2(30,6).
      for (let t = 0; t <= 1.0001; t += 0.03) {
        const c = 6 + 24 * t + Math.sin(t * 9) * 2.5;
        const r = 30 - 24 * t + Math.cos(t * 7) * 2.5;
        A.brush(c, r, 2, 3, 0.7);
      }
      // Tote-Erde-Kampfspuren in der umkaempften Mitte.
      for (let i = 0; i < 5; i++) A.brush(ri(15, 21), ri(15, 21), 0, 3, 0.5);
      A.spawn(1, 6, 30);
      A.spawn(2, 30, 6);
      A.node(4, 33, "quelle");
      A.node(9, 27, "hain");
      A.node(33, 4, "quelle");
      A.node(27, 9, "hain");
      A.node(16, 19, "hain");
      A.node(20, 16, "quelle");
      // Komposition: Haine unterschiedlicher Groesse flankieren den Marschweg und
      // brechen Sichtlinien; dazwischen offene Lanes. Cluster-Streuung mit Gleit-
      // komma-Versatz (kein Raster), Groesse variiert (Fokus oben-links).
      const groves = [
        { c: 11, r: 11, n: 7 },
        { c: 25, r: 26, n: 6 },
        { c: 9, r: 22, n: 3 },
        { c: 30, r: 14, n: 4 },
        { c: 19, r: 8, n: 3 },
        { c: 16, r: 29, n: 4 },
      ];
      for (const G of groves) {
        A.place(G.c, G.r, "baumgruppe");
        for (let i = 0; i < G.n; i++) {
          const a = rnd() * 6.2832;
          const rr = Math.sqrt(rnd()) * (1.6 + G.n * 0.32);
          A.place(G.c + Math.cos(a) * rr, G.r + Math.sin(a) * rr, rnd() < 0.5 ? "baum-1" : "baum-2");
        }
      }
      // Felsgruppe als Landmarke (geclustert, nicht in Reihe) + Eckfelsen.
      for (let i = 0; i < 4; i++) {
        const a = rnd() * 6.2832;
        const rr = Math.sqrt(rnd()) * 2.4;
        A.place(7 + Math.cos(a) * rr, 7 + Math.sin(a) * rr, rnd() < 0.5 ? "fels-1" : "fels-2");
      }
      for (let i = 0; i < 3; i++) A.place(30 + rnd() * 4, 31 + rnd() * 3, rnd() < 0.5 ? "fels-1" : "fels-2");
      // Moos sparsam (weite Ebene bleibt offen), an Hainen + Weg konzentriert.
      for (const G of groves) A.scatter(G.c + ri(-2, 2), G.r + ri(-2, 2), "moos", 2, 0.3);
      for (let i = 0; i < 5; i++) A.scatter(ri(8, 28), ri(12, 24), "moos", 2, 0.25);
      for (let i = 0; i < 3; i++) A.scatter(30 + ri(-3, 2), 6 + ri(-2, 3), "sirup", 2, 0.6);
    } else {
      A.reset(36, 36, "Dichter Forst");
      for (let r = 2; r < 34; r += 3) for (let c = 2; c < 34; c += 3) A.brush(c, r, 1, 4, 0.6);
      // Dezente Tote-Erde-Senken (weich, keine harten Bloecke) + zentrale
      // Steppe-Lichtung. Die Dichte tragen die Waelder, der Boden bleibt ruhig.
      for (let i = 0; i < 7; i++) A.brush(ri(4, 12), ri(22, 31), 0, 3, 0.45);
      for (let i = 0; i < 7; i++) A.brush(ri(23, 32), ri(5, 14), 0, 3, 0.45);
      for (let i = 0; i < 8; i++) A.brush(16 + ri(-2, 2), 18 + ri(-2, 2), 2, 3, 0.5);
      // Zwei Waldmassive mit dichtem Kern und ausgefranstem Rand.
      for (const [mc, mr] of [[8, 9], [26, 24]]) {
        A.place(mc + 2, mr + 2, "wald");
        for (let i = 0; i < 9; i++) A.place(mc + ri(-1, 9), mr + ri(-1, 9), "baumgruppe");
        for (let i = 0; i < 46; i++) {
          const dc = ri(-4, 12);
          const dr = ri(-4, 12);
          const d = Math.hypot(dc - 4, dr - 4);
          if (rnd() > 1 - d / 13) continue; // Dichte faellt nach aussen
          A.place(mc + dc, mr + dr, rnd() < 0.5 ? "baum-1" : "baum-2");
        }
      }
      // Engstelle: unregelmaessiger Felsbogen mit Durchlass (Reihe 17-19), KEIN
      // gerader Zaun -- die Spalte wandert (sin) + oeffnet sich zur Luecke, mit
      // Begleitfelsen. Sub-Tile-Jitter setzt placeObject obendrauf.
      const gapLo = 17;
      const gapHi = 19;
      for (let r = 12; r <= 24; r++) {
        if (r >= gapLo && r <= gapHi) continue;
        const open = r < gapLo ? (gapLo - r) * 0.35 : (r - gapHi) * 0.35;
        const c = 20 + Math.sin(r * 0.7) * 2.4 + open;
        A.place(c, r, rnd() < 0.5 ? "felssaeule" : "felskante");
        if (rnd() < 0.5) A.place(c + (rnd() < 0.5 ? -2.5 : 2.5) + rnd(), r + (rnd() - 0.5) * 1.5, "fels-1");
      }
      A.spawn(1, 5, 31);
      A.spawn(2, 31, 5);
      A.node(4, 34, "quelle");
      A.node(8, 30, "hain");
      A.node(34, 4, "quelle");
      A.node(30, 8, "hain");
      A.node(18, 18, "hain");
      for (const [mc, mr] of [[8, 9], [26, 24]]) for (let i = 0; i < 6; i++) A.scatter(mc + ri(0, 9), mr + ri(0, 9), "moos", 3, 0.55);
      for (let i = 0; i < 4; i++) A.scatter(31 + ri(-4, 3), 5 + ri(-3, 4), "sirup", 3, 0.6);
    }
    A.flush();
    return ed.serialize();
  }, name);
  writeFileSync(`game/maps/${name}.hellmuth.json`, text);
  console.log(`authored ${name}: ${text.length} bytes -> game/maps/${name}.hellmuth.json`);
  await browser.close();
}

async function gameshot(mapName) {
  const browser = await chromium.launch(LAUNCH);
  mkdirSync(ED_OUT, { recursive: true });
  const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 1 });
  await page.route("**/*", (route) => (route.request().url().includes("fonts.g") ? route.abort() : route.continue()));
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));
  // GAME-Modus (kein ?editor): laedt die Karte ueber GameScene + Splat-Renderer.
  await page.goto(`${BASE}/?map=${mapName}&renderer=canvas`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__game, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(3200); // Melt-Bau + Render setteln
  const counts = await page.evaluate(() => {
    const gs = window.__game?.registry?.get("gameState");
    return gs ? { units: gs.units.length, buildings: gs.buildings.length, nodes: gs.nodes.length } : null;
  });
  const dataUrl = await page.evaluate(() => {
    const c = document.querySelector("#game-root canvas");
    return c ? c.toDataURL("image/png") : null;
  });
  if (dataUrl) writeFileSync(`${ED_OUT}/game_${mapName}.png`, Buffer.from(dataUrl.split(",")[1], "base64"));
  // Nahaufnahme auf ein HQ: zeigt die fliessende Terrain-Umfaerbung (VFX Strang 2).
  const hqUrl = await page.evaluate(() => {
    const gs = window.__game?.registry?.get("gameState");
    // MODERAT faerbt nach erde-tot (sichtbar dunkler); bevorzugt zeigen.
    const b = gs?.buildings?.find((x) => x.faction === "moderat") || gs?.buildings?.[0];
    if (!b) return null;
    const sc = window.__game.scene.getScene("game");
    const HW = 80,
      HH = 48;
    const wx = (b.col - b.row) * HW + 36 * HW;
    const wy = (b.col + b.row) * HH + 96;
    sc.cameras.main.setZoom(1.6);
    sc.cameras.main.centerOn(wx, wy);
    const c = document.querySelector("#game-root canvas");
    return c ? c.toDataURL("image/png") : null;
  });
  await page.waitForTimeout(250);
  const hqUrl2 = await page.evaluate(() => {
    const c = document.querySelector("#game-root canvas");
    return c ? c.toDataURL("image/png") : null;
  });
  const finalHq = hqUrl2 || hqUrl;
  if (finalHq) writeFileSync(`${ED_OUT}/game_${mapName}_hq.png`, Buffer.from(finalHq.split(",")[1], "base64"));
  console.log(`gameshot ${mapName}: counts=${JSON.stringify(counts)} errs=${errs.length}`);
  if (errs.length) console.log(errs.slice(0, 6).join("\n"));
  await browser.close();
}

async function perf(size) {
  const browser = await chromium.launch(LAUNCH);
  const page = await newPage(browser, `?editor=1&demo=perf&cols=${size}&rows=${size}`);
  await page.waitForTimeout(2500); // grosse Karte backen lassen
  const res = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const g = window.__game;
        const ed = window.__editor;
        const cam = ed.camera();
        cam.setZoom(0.6);
        const fps = [];
        const start = performance.now();
        const tick = () => {
          cam.setScroll(cam.scrollX + 14, cam.scrollY + 7); // schwenken
          fps.push(g.loop.actualFps);
          if (performance.now() - start > 2600) {
            const s = fps.slice(12);
            const avg = s.reduce((a, b) => a + b, 0) / Math.max(1, s.length);
            resolve({ avg, ...ed.chunkStats() });
          } else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
  console.log(`PERF ${size}x${size}: avgFps=${res.avg.toFixed(1)}, sichtbar ${res.visible}/${res.total} Chunks (Cull spart ${(100 * (1 - res.visible / res.total)).toFixed(0)} %)`);
  await browser.close();
}

async function rendereq() {
  const browser = await chromium.launch(LAUNCH);
  const page = await newPage(browser, "?editor=1&demo=blend");
  const res = await page.evaluate(async () => {
    const canvas = document.querySelector("#game-root canvas");
    const cap = () => {
      const c2 = document.createElement("canvas");
      c2.width = canvas.width;
      c2.height = canvas.height;
      const x = c2.getContext("2d");
      x.drawImage(canvas, 0, 0);
      return x.getImageData(0, 0, c2.width, c2.height).data;
    };
    const ed = window.__editor;
    // Erst EINMAL normalisieren (Recherche: vor dem Vergleich durch load(save)
    // ziehen), dann Render-Stabilitaet unter einem weiteren Roundtrip pruefen.
    ed.load(JSON.parse(ed.serialize()));
    await new Promise((r) => setTimeout(r, 1800));
    const a = cap();
    ed.load(JSON.parse(ed.serialize()));
    await new Promise((r) => setTimeout(r, 1800));
    const b = cap();
    let diff = 0;
    const tot = a.length / 4;
    for (let i = 0; i < a.length; i += 4) {
      if (Math.abs(a[i] - b[i]) > 6 || Math.abs(a[i + 1] - b[i + 1]) > 6 || Math.abs(a[i + 2] - b[i + 2]) > 6) diff++;
    }
    return { diffPct: diff / tot };
  });
  console.log(`RENDER-EQ (in-memory vs load(save)): ${(res.diffPct * 100).toFixed(3)}% Pixel abweichend -> ${res.diffPct < 0.005 ? "OK" : "FAIL"}`);
  await browser.close();
  return res.diffPct >= 0.005;
}

// Captures fuer das Python-Gate (tools/terrain_gate.py). Canvas BLEIBT (Terrain
// lebt im Canvas), ?renderer=canvas. Haupt-PNG + Objekt-Fusspunkte + Roundtrip-Paar.
async function terrainshots(name) {
  const browser = await chromium.launch(LAUNCH);
  mkdirSync(GATE_OUT, { recursive: true });
  const page = await newPage(browser, `?editor=1&map=${name}`);
  const png = await canvasPng(page);
  if (png) writeFileSync(`${GATE_OUT}/terrain_${name}.png`, png);
  const objs = await page.evaluate(() => (window.__editor ? window.__editor.objectsImagePx() : []));
  writeFileSync(`${GATE_OUT}/objects_${name}.json`, JSON.stringify(objs));
  await page.close();
  // Roundtrip-Paar, terrain-only (doodads=0). BEIDE Captures durch den GLEICHEN
  // load(save)-Pfad ziehen (Recherche: vor dem Vergleich normalisieren) -> a und b
  // stammen aus identischem Rebuild und muessen pixelgleich sein.
  const pa = await newPage(browser, `?editor=1&map=${name}&doodads=0`);
  const reload = () => pa.evaluate(() => window.__editor.load(JSON.parse(window.__editor.serialize())));
  await reload();
  await pa.waitForTimeout(1600);
  const a = await canvasPng(pa);
  if (a) writeFileSync(`${GATE_OUT}/terrain_rt_a.png`, a);
  await reload();
  await pa.waitForTimeout(1600);
  const b = await canvasPng(pa);
  if (b) writeFileSync(`${GATE_OUT}/terrain_rt_b.png`, b);
  console.log(`terrainshots ${name}: terrain_${name}.png + objects_${name}.json + terrain_rt_a/b.png -> ${GATE_OUT} (objs=${objs.length})`);
  await browser.close();
}

async function transformtest() {
  const browser = await chromium.launch(LAUNCH);
  const page = await newPage(browser, "?editor=1&map=offen");
  // Deterministisch getrieben (pumpTransform, Synthetik-Uhr) statt rAF: die
  // Software-Rasterung im Headless bremst die echte Schleife so stark aus, dass
  // die Wandlung in 3 s nicht fertig wird (Produktion mit 60 fps: ~1,8 s). Wir
  // pruefen die WEICHE KANTE mitten in der Wandlung und den VOLLEN Umfaerbe-
  // Endzustand -- in beiden Phasen muss das Gate gruen bleiben (kein Kachelsprung).
  const r = await page.evaluate(() => {
    const ed = window.__editor;
    const before = ed.renderedSortAt(10, 10);
    const target = 2; // Steppe
    const chunks0 = ed.chunkStats().total;
    ed.addTransform(10, 10, target, 8);
    ed.pumpTransform(3); // mitten im Wachsen (Radius ~2,7 Kacheln)
    const midGate = ed.gate();
    const midCenter = ed.renderedSortAt(10, 10);
    const activeMid = ed.transformActive();
    ed.pumpTransform(60); // bis zum Abschluss treiben
    const endGate = ed.gate();
    return {
      before,
      target,
      center: ed.renderedSortAt(10, 10),
      outside: ed.renderedSortAt(10 + 13, 10),
      dbg: ed.debugAt(10, 10),
      active: ed.transformActive(),
      activeMid,
      midCenter,
      chunks0,
      chunks1: ed.chunkStats().total,
      midPass: midGate.pass,
      midCluster: midGate.terrain.maxCluster,
      midFails: midGate.fails,
      endPass: endGate.pass,
      endCluster: endGate.terrain.maxCluster,
      endFails: endGate.fails,
    };
  });
  const ok =
    r.center === r.target &&
    r.outside !== r.target &&
    r.chunks0 === r.chunks1 &&
    r.midPass &&
    r.endPass &&
    r.active === 0;
  console.log(
    `TRANSFORM: zentrum ${r.before}->${r.center} (Ziel ${r.target}), aussen=${r.outside}, ` +
      `Chunks ${r.chunks0}->${r.chunks1} (0 MB add), Gate[mitte=${r.midPass} ende=${r.endPass}], ` +
      `aktiv=${r.active} -> ${ok ? "OK" : "FAIL"}`,
  );
  console.log(
    `  mitte: zentrum=${r.midCenter} aktiv=${r.activeMid} cluster=${r.midCluster} | ` +
      `ende: cluster=${r.endCluster} smooth=${JSON.stringify(r.dbg.smooth)} delta=${JSON.stringify(r.dbg.delta)}`,
  );
  if (!r.midPass) console.log("  Mitte-Gate-Fails:", r.midFails.join(" | "));
  if (!r.endPass) console.log("  Ende-Gate-Fails:", r.endFails.join(" | "));
  await browser.close();
  return !ok;
}

async function fogtest() {
  const browser = await chromium.launch(LAUNCH);
  // demo=blend hat Startpunkte + Terrain (wie das Gate-Default), damit der Gate-Lauf
  // MIT Nebel nur den Nebel-Effekt isoliert prueft, nicht eine leere Karte.
  const page = await newPage(browser, "?editor=1&demo=blend");
  const r = await page.evaluate(() => {
    const ed = window.__editor;
    const before = ed.fogStats();
    ed.simulateFog(18, 18, 6, 0.7);
    ed.simulateFog(12, 22, 5, 0.9);
    const placed = ed.fogStats();
    const g = ed.gate(); // Gate muss MIT gerendertem Nebel gruen bleiben
    ed.undo();
    const undo = ed.fogStats().count;
    ed.redo();
    const redo = ed.fogStats().count;
    ed.eraseFog(18, 18, 3); // nur die Quelle bei 18,18 (12,22 ist weiter weg)
    const erase = ed.fogStats().count;
    // Draw-Calls konstant ueber Kartengroesse?
    const dc = [];
    for (const sz of [36, 64, 96]) {
      ed.author.reset(sz, sz, "t");
      ed.simulateFog(sz / 2, sz / 2, 6, 0.8);
      dc.push(ed.fogStats().drawCalls);
    }
    return { before, placed, gatePass: g.pass, fails: g.fails, undo, redo, erase, dc };
  });
  // Konstanz ueber die Kartengroesse ist die eigentliche Pruefung. Die exakte Zahl
  // ist datengetrieben aus ATMO_FOG.layers.length (heute 4) -- so muss der Test
  // beim Aendern der Lagenzahl in balance.ts NICHT mit-editiert werden.
  const layerCount = r.placed.layerCount;
  const dcConst = r.dc.every((x) => x === r.dc[0]) && r.dc[0] === layerCount;
  const ok =
    r.before.count === 0 &&
    !r.before.active &&
    r.placed.count === 2 &&
    r.placed.active &&
    r.placed.drawCalls === layerCount &&
    r.gatePass &&
    r.undo === 1 &&
    r.redo === 2 &&
    r.erase === 1 &&
    dcConst;
  console.log(
    `FOG: leer(${r.before.count}/${r.before.drawCalls}) -> gesetzt(${r.placed.count}/${r.placed.drawCalls}, aktiv=${r.placed.active}) ` +
      `undo=${r.undo} redo=${r.redo} erase=${r.erase} | Draw-Calls@36/64/96=${JSON.stringify(r.dc)} (erwartet=${layerCount}, konstant=${dcConst}) ` +
      `| Gate-mit-Nebel=${r.gatePass} -> ${ok ? "OK" : "FAIL"}`,
  );
  if (!r.gatePass) console.log("  Gate-Fails:", r.fails.join(" | "));
  await browser.close();
  return !ok;
}

async function fogalpha() {
  const browser = await chromium.launch(LAUNCH);
  const page = await newPage(browser, "?editor=1&demo=blend");
  await page.waitForTimeout(300);
  const lumaOf = () => {
    const cv = document.querySelector("#game-root canvas");
    const ctx = cv.getContext("2d");
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    const out = new Float32Array(d.length / 4);
    for (let i = 0; i < out.length; i++) {
      const j = i * 4;
      out[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
    }
    return Array.from(out);
  };
  const base = await page.evaluate(lumaOf);
  // Grosse, dichte Quelle ueber die ganze Ansicht -> maximaler Alpha-Beitrag.
  await page.evaluate(() => window.__editor.simulateFog(18, 18, 30, 1.0));
  await page.waitForTimeout(500);
  const stats = await page.evaluate((base) => {
    const cv = document.querySelector("#game-root canvas");
    const ctx = cv.getContext("2d");
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    const FOGL = 177; // luma(0x9fb6c8)
    const alphas = [];
    for (let i = 0; i < base.length; i++) {
      const j = i * 4;
      const wl = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
      const bl = base[i];
      if (FOGL - bl > 25) {
        const a = (wl - bl) / (FOGL - bl);
        if (a >= 0 && a <= 1.2) alphas.push(Math.min(1, a));
      }
    }
    alphas.sort((a, b) => a - b);
    const pct = (p) => alphas[Math.floor(alphas.length * p)] || 0;
    const mean = alphas.reduce((s, x) => s + x, 0) / Math.max(1, alphas.length);
    return { n: alphas.length, mean, p90: pct(0.9), p99: pct(0.99), max: alphas[alphas.length - 1] || 0 };
  }, base);
  const ok = stats.n > 100 && stats.p99 <= 0.55;
  console.log(
    `FOG-ALPHA: n=${stats.n} mean=${stats.mean.toFixed(2)} p90=${stats.p90.toFixed(2)} ` +
      `p99=${stats.p99.toFixed(2)} max=${stats.max.toFixed(2)} -> ${ok ? "OK (<=0.55)" : "FAIL"}`,
  );
  await browser.close();
  return !ok;
}

async function fogshot() {
  const browser = await chromium.launch(LAUNCH);
  mkdirSync(ED_OUT, { recursive: true });
  // demo=blend: variiertes Terrain + Objekte, damit man die Lesbarkeit DURCH den
  // Nebel beurteilen kann. Lokale Quelle -> Nebel + klares Terrain nebeneinander.
  const page = await newPage(browser, "?editor=1&demo=blend");
  await page.evaluate(() => {
    const ed = window.__editor;
    const sc = window.__game.scene.getScene("editor");
    ed.simulateFog(20, 14, 6, 0.8);
    ed.simulateFog(24, 18, 5, 0.65);
    const HW = 80,
      HH = 48;
    const wx = (18 - 18) * HW + 36 * HW;
    const wy = (18 + 18) * HH + 96;
    sc.cameras.main.setZoom(0.7);
    sc.cameras.main.centerOn(wx, wy);
  });
  await page.waitForTimeout(700);
  const png = await canvasPng(page);
  if (png) writeFileSync(`${ED_OUT}/fog.png`, png);
  console.log(`fogshot: ${ED_OUT}/fog.png`);
  await browser.close();
}

// Nebel-Tiefe-Gate (NEBEL-TIEFE-SPEC §5): rendert EINE Kontrollszene ohne/mit Nebel
// und prueft die Lesbarkeits-Erhaltung via tools/fog_depth_gate.py, plus den Drift-
// Determinismus (d) ueber die Editor-API. Kontrollszene: Hochkontrast-Objekte in der
// OBEREN Bildhaelfte (Einheiten-Proxy), Terrain-Sortenkante in der UNTEREN -- so misst
// die Haelften-Heuristik des Pruefers den richtigen Bereich.
const FOG_DIR = process.env.SHOT_DIR || "/tmp/fog";

async function fogdepth() {
  const browser = await chromium.launch(LAUNCH);
  mkdirSync(FOG_DIR, { recursive: true });
  // Stale-Schutz: alte Shots ZUERST loeschen, sonst koennte ein fehlgeschlagener
  // Capture gegen die PNGs eines frueheren Laufs gruen werten (False-Green).
  rmSync(`${FOG_DIR}/without.png`, { force: true });
  rmSync(`${FOG_DIR}/with.png`, { force: true });
  // demo=blend ist die gemessen rauscharme Szene (wie fogalpha): dunkles, dichtes
  // Terrain (gesunde Nenner im Alpha-Rekonstruktor) + Baeume/Objekte als Hochkontrast.
  // Wir setzen zusaetzlich Hochkontrast-Objekte klar in die OBERE Haelfte und einen
  // Terrain-Block in die UNTERE, damit die Haelften-Heuristik des Pruefers greift.
  const page = await newPage(browser, "?editor=1&demo=blend");
  await page.evaluate(() => {
    const ed = window.__editor;
    const A = ed.author;
    A.place(13, 6, "felssaeule"); // obere Haelfte (kleine col+row)
    A.place(16, 5, "baum-1");
    A.place(10, 8, "fels-1");
    A.place(19, 7, "baum-2");
    for (let r = 26; r < 32; r++) for (let c = 14; c < 24; c++) A.setCell(c, r, 0); // erde-tot-Block unten
    A.flush();
    // KEIN Zoom: Standard-Fit (ganze Karte) wie fogalpha -> rauscharme Alpha-Messung.
  });
  await page.waitForTimeout(700);
  const without = await canvasPng(page);
  await page.evaluate(() => window.__editor.simulateFog(18, 18, 30, 1.0));
  await page.waitForTimeout(700);
  const withFog = await canvasPng(page);
  // (d) Drift-Determinismus: zwei identische dt-Laeufe -> identische tilePosition,
  // UND die Drift muss tatsaechlich vorangeschritten sein (sonst pruefte ein inaktiver
  // No-Op-Schritt nichts; advanced>0 schliesst das aus).
  const drift = await page.evaluate(() => {
    const ed = window.__editor;
    const run = () => {
      ed.fogResetDrift();
      for (let i = 0; i < 30; i++) ed.fogStep(16.7);
      return ed.fogDrift();
    };
    const a = run();
    const b = run();
    let maxDelta = 0;
    let advanced = 0;
    // a.length === b.length pruefen: ein dynamischer Lagen-Add/Drop wuerde sonst
    // stillschweigend uebersehen werden (advanced misst a, Lagen-Mismatch nicht).
    const lenMismatch = a.length !== b.length;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
      maxDelta = Math.max(maxDelta, Math.abs(a[i].x - b[i].x), Math.abs(a[i].y - b[i].y));
      advanced = Math.max(advanced, Math.abs(a[i].x), Math.abs(a[i].y), Math.abs(b[i].x), Math.abs(b[i].y));
    }
    return { maxDelta, advanced, layers: a.length, lenMismatch };
  });
  await browser.close();
  // Capture-Wache: ohne echtes PNG-Paar KEIN gruenes Urteil (sonst SKIP-False-Green).
  if (!without || !withFog) {
    console.log(`FOG-DEPTH: Canvas-Capture fehlgeschlagen (without=${!!without} with=${!!withFog}) -> FAIL`);
    return true;
  }
  writeFileSync(`${FOG_DIR}/without.png`, without);
  writeFileSync(`${FOG_DIR}/with.png`, withFog);
  // Python-Gate aufrufen. SKIP (fehlendes Pillow/PNG -> Exit 0 OHNE Urteil) gilt fuer
  // dieses GATE als FAIL: ein Gate, das nichts geprueft hat, ist nicht gruen.
  const py = spawnSync("python3", ["tools/fog_depth_gate.py", "--dir", FOG_DIR], { encoding: "utf8" });
  const pyOut = py.stdout || "";
  process.stdout.write(pyOut);
  if (py.stderr) process.stderr.write(py.stderr);
  const skipped = /SKIP/i.test(pyOut);
  const driftOk = drift.maxDelta < 1e-6 && drift.advanced > 1e-6 && !drift.lenMismatch;
  console.log(
    `FOG-DEPTH Drift-Determinismus: Lagen=${drift.layers} maxΔ=${drift.maxDelta.toExponential(2)} ` +
      `vorangeschritten=${drift.advanced.toFixed(1)}px -> ${driftOk ? "OK (<1e-6, >0)" : "FAIL"}`,
  );
  if (skipped) console.log("FOG-DEPTH: Python-Gate hat SKIPpt (kein Urteil) -> FAIL (Pillow/PNG noetig)");
  const gateFailed = py.status !== 0 || skipped;
  return gateFailed || !driftOk;
}

// Nebel-Drift-Sequenz: vier Frames in 1-s-Abstand -> Parallaxe/Loop/Naht beurteilbar
// (gegenlaeufige Lagen-Drift sichtbar; eine Kachelnaht waere ein gerader Strich quer).
async function fogframes() {
  const browser = await chromium.launch(LAUNCH);
  mkdirSync(ED_OUT, { recursive: true });
  const page = await newPage(browser, "?editor=1&demo=blend");
  await page.evaluate(() => {
    window.__editor.simulateFog(18, 18, 12, 0.9);
    window.__editor.simulateFog(12, 22, 10, 0.8);
    window.__editor.lookAt(16, 18, 0.8);
  });
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(1000); // ~1 s Echtzeit-Drift
    const png = await canvasPng(page);
    if (png) writeFileSync(`${ED_OUT}/fog_t${i}.png`, png);
  }
  console.log(`fogframes: ${ED_OUT}/fog_t0..3.png`);
  await browser.close();
}

// Neutraler Nebel ueber BEIDEN Fraktions-Umfaerbungen (ohne/mit), als Beleg fuer den
// Abschluss: kein Tint-Clash, Lesbarkeit ueber dunkler MODERAT + heller HELLMUTH.
async function fogfaction() {
  const browser = await chromium.launch(LAUNCH);
  mkdirSync(ED_OUT, { recursive: true });
  const page = await newPage(browser, "?editor=1&map=offen");
  await page.evaluate(() => {
    const ed = window.__editor;
    ed.addTransform(14, 14, ed.factionSortIdx("moderat"), 7); // dunkelt
    ed.addTransform(22, 14, ed.factionSortIdx("hellmuth"), 7); // begruent
    ed.pumpTransform(80);
    ed.lookAt(18, 14, 0.85);
  });
  await page.waitForTimeout(500);
  const without = await canvasPng(page);
  if (without) writeFileSync(`${ED_OUT}/fog_faktion_ohne.png`, without);
  await page.evaluate(() => window.__editor.simulateFog(18, 14, 16, 0.95));
  await page.waitForTimeout(600);
  const withFog = await canvasPng(page);
  if (withFog) writeFileSync(`${ED_OUT}/fog_faktion_mit.png`, withFog);
  console.log(`fogfaction: ${ED_OUT}/fog_faktion_ohne.png + _mit.png`);
  await browser.close();
}

async function transformshot() {
  const browser = await chromium.launch(LAUNCH);
  mkdirSync(ED_OUT, { recursive: true });
  const page = await newPage(browser, "?editor=1&map=offen");
  // Kamera auf die Wandlungszone (Gitter 10,10) zoomen.
  await page.evaluate(() => {
    const sc = window.__game.scene.getScene("editor");
    const HW = 80,
      HH = 48;
    const wx = (10 - 10) * HW + 36 * HW;
    const wy = (10 + 10) * HH + 96;
    sc.cameras.main.setZoom(1.4);
    sc.cameras.main.centerOn(wx, wy);
  });
  await page.waitForTimeout(400);
  const before = await canvasPng(page);
  if (before) writeFileSync(`${ED_OUT}/transform_vorher.png`, before);
  // Wandlung nach Steppe setzen und bis zum Abschluss treiben.
  await page.evaluate(() => {
    const ed = window.__editor;
    ed.addTransform(10, 10, 2, 8);
    ed.pumpTransform(80);
  });
  await page.waitForTimeout(300);
  const after = await canvasPng(page);
  if (after) writeFileSync(`${ED_OUT}/transform_nachher.png`, after);
  console.log(`transformshot: ${ED_OUT}/transform_vorher.png + _nachher.png`);
  await browser.close();
}

async function factiontest() {
  const browser = await chromium.launch(LAUNCH);
  const page = await newPage(browser, "?editor=1&map=offen");
  const r = await page.evaluate(() => {
    const ed = window.__editor;
    const gt = ed.groundTypes();
    const eIdx = ed.factionSortIdx("moderat"); // erde-tot (dunkel)
    const kIdx = ed.factionSortIdx("hellmuth"); // klarflur (hell/gruen, Platzhalter)
    const gBefore = ed.renderedSortAt(10, 10);
    const kBefore = ed.renderedSortAt(25, 25);
    ed.addTransform(10, 10, eIdx, 8); // MODERAT korrumpiert
    ed.addTransform(25, 25, kIdx, 8); // HELLMUTH begruent
    ed.pumpTransform(80);
    const g = ed.gate();
    return {
      gt,
      eIdx,
      kIdx,
      gBefore,
      kBefore,
      gAfter: ed.renderedSortAt(10, 10),
      kAfter: ed.renderedSortAt(25, 25),
      gatePass: g.pass,
      fails: g.fails,
      cluster: g.terrain.maxCluster,
    };
  });
  const ok =
    r.kIdx >= 0 &&
    r.eIdx !== r.kIdx &&
    r.gt.includes("klarflur") &&
    r.gAfter === r.eIdx &&
    r.kAfter === r.kIdx &&
    r.gAfter !== r.kAfter &&
    r.gatePass;
  console.log(
    `FAKTION: palette=${JSON.stringify(r.gt)} | MODERAT ${r.gBefore}->${r.gAfter} (Ziel erde-tot=${r.eIdx}) | ` +
      `HELLMUTH ${r.kBefore}->${r.kAfter} (Ziel klarflur=${r.kIdx}) | cluster=${r.cluster} Gate=${r.gatePass} -> ${ok ? "OK" : "FAIL"}`,
  );
  if (!r.gatePass) console.log("  Gate-Fails:", r.fails.join(" | "));
  await browser.close();
  return !ok;
}

async function robusttest() {
  const browser = await chromium.launch(LAUNCH);
  const out = [];

  // (A) Karten-Wechsel/Reload: Nebel + Wandlung sauber neu aufgebaut, keine Geister.
  {
    const page = await newPage(browser, "?editor=1&demo=blend");
    const r = await page.evaluate(() => {
      const ed = window.__editor;
      ed.simulateFog(18, 18, 6, 0.8);
      const a = ed.fogStats();
      ed.author.reset(40, 40, "B"); // Map-Wechsel -> applyMap baut Nebel/Transform neu
      const empty = ed.fogStats();
      ed.simulateFog(20, 20, 6, 0.8);
      const b = ed.fogStats();
      return { aActive: a.active, aCount: a.count, emptyCount: empty.count, emptyActive: empty.active, bCount: b.count, bActive: b.active, bDraw: b.drawCalls, layerCount: b.layerCount };
    });
    // Erwarte ATMO_FOG.layers.length Draw-Calls (datengetrieben, robust gegen Spec-Aenderungen).
    const ok = r.aActive && r.aCount === 1 && r.emptyCount === 0 && !r.emptyActive && r.bCount === 1 && r.bActive && r.bDraw === r.layerCount;
    out.push(["Karten-Wechsel/Reload", ok, JSON.stringify(r)]);
    await page.close();
  }

  // (B) Undo/Redo-Ketten: kein RT-Leck, konsistente Counts.
  {
    const page = await newPage(browser, "?editor=1&demo=blend");
    const r = await page.evaluate(() => {
      const ed = window.__editor;
      const texBefore = ed.textureCount();
      const seq = [];
      for (let i = 0; i < 3; i++) {
        ed.simulateFog(15 + i, 15, 5, 0.8);
        ed.eraseFog(15 + i, 15, 3);
        ed.undo();
        ed.redo();
        ed.undo();
        seq.push(ed.fogStats().count);
      }
      const texMid = ed.textureCount();
      for (let k = 0; k < 30; k++) ed.undo();
      return { texBefore, texMid, texAfter: ed.textureCount(), seq, finalCount: ed.fogStats().count };
    });
    // Kein RT-Leck: der Nebel-Aufbau kostet EINMALIG ein paar Texturen (Maske +
    // BitmapMask-Interna), danach refresht jedes rebuild dieselbe Maske. Beweis:
    // die 30-Undo-Kette (30 rebuilds) addiert NULL Texturen (texAfter == texMid),
    // und der Einmalaufbau ist beschraenkt (<= 6), nicht proportional zu Ops.
    const ok = r.texMid - r.texBefore <= 6 && r.texAfter === r.texMid && r.finalCount === 0;
    out.push(["Undo/Redo-Ketten (kein RT-Leck)", ok, JSON.stringify(r)]);
    await page.close();
  }

  // (C) Viele ueberlappende Wandlungsquellen: 0 MB, gruen, kein Flackern (max-Komposit).
  {
    const page = await newPage(browser, "?editor=1&map=offen");
    const r = await page.evaluate(() => {
      const ed = window.__editor;
      const c0 = ed.chunkStats().total;
      const kg = ed.factionSortIdx("moderat");
      const kk = ed.factionSortIdx("hellmuth");
      // 8 nahe Quellen, gemischte Fraktionen -> Ueberlappung beider Zielsorten.
      for (let i = 0; i < 8; i++) ed.addTransform(15 + (i % 4), 15 + Math.floor(i / 4), i % 2 ? kk : kg, 7);
      ed.pumpTransform(140);
      const c1 = ed.chunkStats().total;
      // Stabilitaet (kein Flackern): zwei aufeinanderfolgende Kompositionen identisch.
      const s1 = ed.debugAt(16, 16);
      ed.pumpTransform(4);
      const s2 = ed.debugAt(16, 16);
      const g = ed.gate();
      return { c0, c1, active: ed.transformActive(), gatePass: g.pass, cluster: g.terrain.maxCluster, stable: JSON.stringify(s1) === JSON.stringify(s2), fails: g.fails };
    });
    const ok = r.c0 === r.c1 && r.active === 0 && r.gatePass && r.stable;
    out.push(["Viele Wandlungsquellen (0 MB, stabil)", ok, JSON.stringify(r)]);
    await page.close();
  }

  // (D) Speicher-Roundtrip mit aktiver Wandlung: delta NICHT persistiert, fog schon.
  {
    const page = await newPage(browser, "?editor=1&map=offen");
    const r = await page.evaluate(() => {
      const ed = window.__editor;
      const before = JSON.parse(ed.serialize());
      ed.simulateFog(12, 12, 6, 0.8); // fog -> Datenlayer
      ed.addTransform(20, 20, ed.factionSortIdx("hellmuth"), 8); // delta -> Laufzeit
      ed.pumpTransform(80);
      const after = JSON.parse(ed.serialize());
      const terrainEqual = JSON.stringify(before.terrain) === JSON.stringify(after.terrain);
      const fogPersisted = (after.fog || []).length === 1;
      ed.load(after);
      return { terrainEqual, fogPersisted, fogBefore: (before.fog || []).length, reFog: ed.fogStats().count };
    });
    const ok = r.terrainEqual && r.fogPersisted && r.fogBefore === 0 && r.reFog === 1;
    out.push(["Speicher-Roundtrip (delta nicht persistiert)", ok, JSON.stringify(r)]);
    await page.close();
  }

  // (E) Partikel-Pool-Leck (NEBEL-TIEFE-SPEC §5e): Strang-11-Partikel sind Default
  // AUS -> die Partikelzahl bleibt ueber Frames 0 (No-Op-Wache bis zur Aktivierung).
  {
    const page = await newPage(browser, "?editor=1&demo=blend");
    const r = await page.evaluate(async () => {
      const ed = window.__editor;
      const c0 = ed.fogParticleStats().count;
      await new Promise((res) => {
        let n = 0;
        const f = () => (++n > 20 ? res() : requestAnimationFrame(f));
        requestAnimationFrame(f);
      });
      return { c0, c1: ed.fogParticleStats().count };
    });
    const ok = r.c0 === 0 && r.c1 === 0;
    out.push(["Partikel-Pool-Leck (Default aus -> 0)", ok, JSON.stringify(r)]);
    await page.close();
  }

  let anyFail = false;
  for (const [name, ok, detail] of out) {
    console.log(`ROBUST ${ok ? "OK  " : "FAIL"} ${name}\n        ${detail}`);
    if (!ok) anyFail = true;
  }
  await browser.close();
  return anyFail;
}

// DESTILLAT-SYSTEM: Editor-Palette der Destille. Prueft drei Pflichtproben in EINEM
// Lauf: (1) HELLMUTH sieht 'destille' im Katalog, MODERAT NICHT (testmode aus);
// (2) ?testmode=1 hebt die Sicht-Sperre auf (MODERAT sieht sie auch); (3) Vier
// Klick-Versuche auf Destille -> der vierte scheitert, map.buildings haelt 3.
// Editor-Screenshots der Destille-Palette: HELLMUTH (mit Destille), MODERAT (ohne),
// MODERAT+testmode (mit). Belegt die Kritiker-Pruefung "MODERAT sieht Destille NICHT".
async function destille_screenshots() {
  const browser = await chromium.launch(LAUNCH);
  mkdirSync(ED_OUT, { recursive: true });
  let anyFail = false;
  const shoot = async (query, file, faction) => {
    const page = await newPage(browser, query);
    // 1) Tool-Tab "Gebaeude" anklicken UND verifizieren, dass er aktiv wurde.
    //    Ein stilles null-safe-Click wuerde sonst einen Screenshot vom Default-
    //    Werkzeug (Terrain) machen und CI gruen melden -> falsche Belege.
    const toolOk = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("[data-tool]")).find((b) => b.dataset.tool === "building");
      if (!btn) return false;
      btn.click();
      return btn.classList.contains("active");
    });
    if (!toolOk) {
      console.log(`  destille_screenshots ${file}: 'Gebaeude'-Tool nicht aktivierbar -> FAIL`);
      anyFail = true;
      await page.close();
      return;
    }
    await page.waitForTimeout(120);
    if (faction === "moderat") {
      const facOk = await page.evaluate(() => {
        const facChip = Array.from(document.querySelectorAll(".ed-chip")).find((c) => /Moderat/i.test(c.textContent || ""));
        if (!facChip) return false;
        facChip.click();
        return facChip.classList.contains("active");
      });
      if (!facOk) {
        console.log(`  destille_screenshots ${file}: Moderat-Fraktions-Chip nicht aktivierbar -> FAIL`);
        anyFail = true;
        await page.close();
        return;
      }
      await page.waitForTimeout(120);
    }
    await page.screenshot({ path: `${ED_OUT}/${file}` });
    await page.close();
  };
  await shoot("?editor=1", "destille_palette_hellmuth.png", "hellmuth");
  await shoot("?editor=1", "destille_palette_moderat.png", "moderat");
  await shoot("?editor=1&testmode=1", "destille_palette_moderat_testmode.png", "moderat");
  console.log(`destille_screenshots: ${ED_OUT}/destille_palette_{hellmuth,moderat,moderat_testmode}.png${anyFail ? " (mit FAIL)" : ""}`);
  await browser.close();
  return anyFail;
}

async function destille_palette() {
  const browser = await chromium.launch(LAUNCH);
  // (1) Default: nur HELLMUTH sieht die Destille.
  const pageA = await newPage(browser, "?editor=1");
  const a = await pageA.evaluate(() => {
    const ed = window.__editor;
    const kl = ed.buildingCatalog("hellmuth").map((b) => b.type);
    const ge = ed.buildingCatalog("moderat").map((b) => b.type);
    return { kl, ge };
  });
  // (2) testmode: MODERAT sieht alle Gebaeude.
  const pageB = await newPage(browser, "?editor=1&testmode=1");
  const b = await pageB.evaluate(() => {
    const ed = window.__editor;
    return { ge: ed.buildingCatalog("moderat").map((b) => b.type) };
  });
  // (3) Max-3-Cap: viermal platzieren, der vierte muss scheitern + Reason korrekt.
  const pageC = await newPage(browser, "?editor=1");
  const c = await pageC.evaluate(() => {
    const ed = window.__editor;
    const log = [];
    for (let i = 0; i < 4; i++) {
      const placed = ed.placeBuilding(10 + i * 3, 10, "destille", "hellmuth");
      log.push(!!placed);
    }
    const catalog4 = ed.buildingCatalog("hellmuth").find((x) => x.type === "destille");
    return {
      log,
      count: ed.buildingCount("destille", "hellmuth"),
      disabled: catalog4?.disabled,
      reason: catalog4?.reason,
    };
  });
  // (4) Cross-Faction-Schutz (Default): MODERAT darf KEINE Destille setzen.
  const pageD = await newPage(browser, "?editor=1");
  const d = await pageD.evaluate(() => {
    const ed = window.__editor;
    const refused = ed.placeBuilding(15, 15, "destille", "moderat"); // muss undefined liefern
    return { refused: !refused, count: ed.buildingCount("destille", "moderat") };
  });
  // (5) testmode=1 erlaubt die EINGABE quer zur Fraktion, aber die DATEN bleiben
  // dem Typ treu: das gespeicherte MapBuilding bekommt die Typ-Fraktion (hellmuth),
  // egal welche Aufrufer-Fraktion. Sonst koennte testmode-MODERAT den hasHellmuth-
  // Destille()-Wirt-Check spoofen.
  const pageE = await newPage(browser, "?editor=1&testmode=1");
  const e = await pageE.evaluate(() => {
    const ed = window.__editor;
    const placed = ed.placeBuilding(15, 15, "destille", "moderat");
    return {
      placed: !!placed,
      genCount: ed.buildingCount("destille", "moderat"), // muss 0 bleiben (kein Spoof)
      klarCount: ed.buildingCount("destille", "hellmuth"), // muss 1 sein (datentreu)
      faction: placed?.faction,
    };
  });
  // (6) Footprint-Ueberlappung (auch im testmode) wird abgewiesen.
  const pageF = await newPage(browser, "?editor=1");
  const f = await pageF.evaluate(() => {
    const ed = window.__editor;
    const first = ed.placeBuilding(10, 10, "destille", "hellmuth");
    const overlap = ed.placeBuilding(11, 10, "destille", "hellmuth"); // 2x2 ueberlappt
    return { first: !!first, overlap: !!overlap, count: ed.buildingCount("destille", "hellmuth") };
  });
  await browser.close();
  const aOk = a.kl.includes("destille") && !a.ge.includes("destille");
  const bOk = b.ge.includes("destille");
  const cOk = c.log[0] && c.log[1] && c.log[2] && !c.log[3] && c.count === 3 && c.disabled === true && /Maximum von 3 Destillen/.test(c.reason || "");
  const dOk = d.refused === true && d.count === 0;
  // testmode-Platzierung muss gelingen, die DATEN aber der Typ-Fraktion folgen
  // (hellmuth), NICHT der Aufrufer-Fraktion (moderat). Sonst Wirt-Spoof.
  const eOk = e.placed === true && e.genCount === 0 && e.klarCount === 1 && e.faction === "hellmuth";
  const fOk = f.first === true && f.overlap === false && f.count === 1;
  console.log(`DESTILLE-PALETTE:`);
  console.log(`  (1) Sicht-Filter: HELLMUTH sieht destille=${a.kl.includes("destille")}, MODERAT sieht destille=${a.ge.includes("destille")} -> ${aOk ? "OK" : "FAIL"}`);
  console.log(`     HELLMUTH-Katalog: ${a.kl.join(",")}`);
  console.log(`     MODERAT-Katalog : ${a.ge.join(",") || "(leer)"}`);
  console.log(`  (2) Sicht testmode=1: MODERAT sieht destille=${b.ge.includes("destille")} -> ${bOk ? "OK" : "FAIL"}`);
  console.log(`  (3) Max-3-Cap: 4x destille -> ${JSON.stringify(c.log)}, count=${c.count}, disabled=${c.disabled}, reason="${c.reason}" -> ${cOk ? "OK" : "FAIL"}`);
  console.log(`  (4) Cross-Faction-Schutz: MODERAT->destille abgewiesen=${d.refused}, count=${d.count} -> ${dOk ? "OK" : "FAIL"}`);
  console.log(`  (5) testmode platziert, Daten typ-treu: gesetzt=${e.placed} faction='${e.faction}' moderat-count=${e.genCount} hellmuth-count=${e.klarCount} -> ${eOk ? "OK" : "FAIL"}`);
  console.log(`  (6) Footprint-Overlap-Schutz: 1.=${f.first}, 2.(overlap)=${f.overlap}, count=${f.count} -> ${fOk ? "OK" : "FAIL"}`);
  return !(aOk && bOk && cOk && dOk && eOk && fOk);
}

async function factionshot() {
  const browser = await chromium.launch(LAUNCH);
  mkdirSync(ED_OUT, { recursive: true });
  const page = await newPage(browser, "?editor=1&map=offen");
  await page.evaluate(() => {
    const ed = window.__editor;
    const sc = window.__game.scene.getScene("editor");
    ed.addTransform(14, 14, ed.factionSortIdx("moderat"), 7); // dunkelt
    ed.addTransform(22, 14, ed.factionSortIdx("hellmuth"), 7); // begruent
    ed.pumpTransform(80);
    const HW = 80,
      HH = 48;
    const wx = (18 - 14) * HW + 36 * HW;
    const wy = (18 + 14) * HH + 96;
    sc.cameras.main.setZoom(0.85);
    sc.cameras.main.centerOn(wx, wy);
  });
  await page.waitForTimeout(500);
  const png = await canvasPng(page);
  if (png) writeFileSync(`${ED_OUT}/faktion-zielsorten.png`, png);
  console.log(`factionshot: ${ED_OUT}/faktion-zielsorten.png`);
  await browser.close();
}

async function transformsweep() {
  const browser = await chromium.launch(LAUNCH);
  const combos = [
    { softFrac: 0.75, softMin: 8, target: 2.5, rad: 4 },
    { softFrac: 0.75, softMin: 8, target: 2.5, rad: 5 },
    { softFrac: 0.75, softMin: 8, target: 2.5, rad: 6 },
    { softFrac: 0.75, softMin: 8, target: 2.5, rad: 8 },
    { softFrac: 0.75, softMin: 8, target: 2.5, rad: 11 },
    { softFrac: 0.75, softMin: 8, target: 2.5, rad: 14 },
  ];
  for (const p of combos) {
    const page = await newPage(browser, "?editor=1&map=offen");
    const r = await page.evaluate((p) => {
      const ed = window.__editor;
      ed.tuneTransform(p);
      ed.addTransform(10, 10, 2, p.rad);
      ed.pumpTransform(80);
      const g = ed.gate();
      return {
        center: ed.renderedSortAt(10, 10),
        outside: ed.renderedSortAt(10 + p.rad + 5, 10),
        cluster: g.terrain.maxCluster,
        band: g.terrain.medianBandPx,
        soft: g.terrain.softFraction,
        pass: g.pass,
        fails: g.fails,
      };
    }, p);
    const reco = r.center === 2 && r.outside !== 2;
    console.log(
      `softFrac=${p.softFrac} softMin=${p.softMin} tgt=${p.target} rad=${p.rad}: ` +
        `zentrum=${r.center} aussen=${r.outside} cluster=${r.cluster} band=${r.band}px ` +
        `recolor=${reco} GATE=${r.pass ? "OK" : "FAIL"}` +
        (r.pass ? "" : ` [${r.fails.filter((f) => /Terrain|Naht|band/i.test(f)).join("; ")}]`),
    );
    await page.close();
  }
  await browser.close();
}

async function editops() {
  const browser = await chromium.launch(LAUNCH);
  const page = await newPage(browser, "?editor=1");
  const r = await page.evaluate(() => {
    const ed = window.__editor;
    const before = ed.dominantAt(10, 10);
    // Ein Strich (5 Zellen) Sandlehm (Index 1).
    ed.simulateStroke([{ c: 8, r: 10 }, { c: 9, r: 10 }, { c: 10, r: 10 }, { c: 11, r: 10 }, { c: 12, r: 10 }], 1);
    const painted = ed.dominantAt(10, 10);
    const depthAfter = ed.undoDepth();
    ed.undo();
    const afterUndo = ed.dominantAt(10, 10);
    ed.redo();
    const afterRedo = ed.dominantAt(10, 10);
    return { before, painted, depthAfter, afterUndo, afterRedo };
  });
  const ok = r.painted === 1 && r.depthAfter === 1 && r.afterUndo === r.before && r.afterRedo === 1;
  console.log(`EDITOPS: before=${r.before} painted=${r.painted} (1 Strich=1 Undo-Eintrag: ${r.depthAfter}) undo->${r.afterUndo} redo->${r.afterRedo} -> ${ok ? "OK" : "FAIL"}`);
  await browser.close();
  return !ok;
}

async function roundtrip() {
  const browser = await chromium.launch(LAUNCH);
  const page = await newPage(browser, "?editor=1");
  const res = await page.evaluate(() => (window.__roundtrip ? window.__roundtrip() : null));
  if (!res) {
    console.log("ROUNDTRIP: kein Pruefstand (Editor nicht bereit)");
    await browser.close();
    return true;
  }
  console.log("ROUNDTRIP (byte / deep / idempotent):");
  for (const c of res.cases) {
    console.log(`  ${c.name.padEnd(14)} byte=${c.byteEqual} deep=${c.deepEqual} idem=${c.idempotent} ${c.note} -> ${c.ok ? "OK" : "FAIL"}`);
  }
  console.log(`  --> ${res.pass ? "GRUEN" : "ROT"}`);
  await browser.close();
  return !res.pass;
}

async function attack() {
  const browser = await chromium.launch(LAUNCH);
  const page = await newPage(browser, "?editor=1");
  const res = await page.evaluate(() => {
    const ed = window.__editor;
    const A = ed.author;
    const cases = {};
    const run = (name, place) => {
      A.reset(36, 36, name);
      A.spawn(1, 4, 31);
      A.spawn(2, 31, 4);
      place(A);
      A.flush();
      cases[name] = ed.gate().placement.maxCollinear;
    };
    // Diagonale Wand (45 Grad) -- frueher: PASS (bbox quadratisch).
    run("diagonal", (A) => {
      for (let i = 0; i < 12; i++) A.place(8 + i, 8 + i, "felssaeule");
    });
    // Sparse Wand (4 Kacheln Abstand entlang einer Spalte).
    run("sparse", (A) => {
      for (let i = 0; i < 8; i++) A.place(18, 6 + i * 3, "felssaeule");
    });
    // Wackel-Zaun (1 tief, perpendikular +/-0,9).
    run("wobble", (A) => {
      for (let i = 0; i < 12; i++) A.place(20 + (i % 2 ? 0.9 : -0.9), 6 + i, "felssaeule");
    });
    return cases;
  });
  console.log("ATTACK (maxKollinear>0 = Zaun erkannt):");
  for (const [k, v] of Object.entries(res)) console.log(`  ${k}: ${v} -> ${v > 0 ? "ERKANNT" : "DURCHGERUTSCHT"}`);
  await browser.close();
}

// CODE4 PROP-SCATTERING: Baseline-Screenshots je Dichte-Preset. Zeichnet den
// gleichen Karten-Zuschnitt (leeres 36x36 mit einer Apotheke + einer Zucker-
// maschine + einem Hain) einmal je Preset in duenn/zielbild/dicht und
// speichert das Bild + die Kategorien-Zaehlung. Solange Ticros Zielbild 1/4
// nicht im Repo liegen (docs/GEFECHTS-VFX.md:82-85), dienen diese Baselines
// als selbstreferentielle Vergleichsziele und werden explizit als Residuum
// dokumentiert (docs/PROP-SCATTERING.md).
async function streushot() {
  const presets = ["duenn", "zielbild", "dicht"];
  const seed = 4711;
  const summary = { seed, presets: {}, ok: true };
  const browser = await chromium.launch(LAUNCH);
  mkdirSync(ED_OUT, { recursive: true });
  for (const preset of presets) {
    const page = await newPage(browser, "?editor=1");
    // Empty 36x36 Karte + Fixture-Objekte (HQ links oben, HQ rechts unten, Hain
    // in der Mitte). Symmetrisch zur Roundtrip-Fixture in src/maps/roundtrip_check.
    const stats = await page.evaluate(
      async ([presetName, s]) => {
        const ed = window.__editor;
        ed.author.reset(36, 36, `streu-${presetName}`);
        ed.setTool({ tool: "building", buildingKey: "apotheke", buildingFaction: "hellmuth" });
        ed.author.spawn(1, 4, 4);
        ed.author.spawn(2, 30, 30);
        ed.author.node(10, 10, "hain");
        // 'author.streuMap' streut ALLE Kategorien in einem Undo-Schritt.
        const r = ed.author.streuMap(presetName, s);
        ed.author.flush();
        return { stats: r.stats, added: r.added, roundtripIdentical: ed.roundtripIdentical() };
      },
      [preset, seed],
    );
    // Bit-Beweis: die Preset-Karte im Speicher serialisiert byte-stabil.
    if (!stats.roundtripIdentical) summary.ok = false;
    const png = await canvasPng(page);
    if (png) writeFileSync(`${ED_OUT}/scatter_baseline_${preset}.png`, png);
    // Frame-Version (mit UI) zusaetzlich, damit man das Werkzeug sieht.
    await page.screenshot({ path: `${ED_OUT}/scatter_baseline_${preset}_frame.png` });
    summary.presets[preset] = { added: stats.added, generated: stats.stats.generated, rejected: stats.stats.rejected, roundtripIdentical: stats.roundtripIdentical, errs: page.__errs.length };
    console.log(
      `streushot ${preset}: added=${stats.added} gen=${JSON.stringify(stats.stats.generated)} rt=${stats.roundtripIdentical} errs=${page.__errs.length}`,
    );
    if (page.__errs.length) console.log("  " + page.__errs.slice(0, 4).join("\n  "));
    await page.close();
  }
  writeFileSync(`${ED_OUT}/scatter_baseline_summary.json`, JSON.stringify(summary, null, 2) + "\n");
  await browser.close();
  return summary.ok ? 0 : 1;
}

// CODE4 PROP-SCATTERING: Perf-Nachweis (Task P4). Streut 'zielbild' auf 36x36
// und misst die Frame-Zeit ueber 3 Sekunden gegen den nackten Editor als
// Baseline (kein Streu). Zurueck kommt {beforeFps, afterFps, addedDoodads}.
async function streuperf() {
  const browser = await chromium.launch(LAUNCH);
  mkdirSync(ED_OUT, { recursive: true });
  const page = await newPage(browser, "?editor=1");
  const measure = () =>
    page.evaluate(
      () =>
        new Promise((resolve) => {
          const sc = window.__game.scene.getScene("editor");
          const g = sc.game;
          let frames = 0;
          const t0 = g.loop.time;
          const onFrame = () => {
            frames++;
          };
          g.events.on("prestep", onFrame);
          setTimeout(() => {
            g.events.off("prestep", onFrame);
            const dt = g.loop.time - t0;
            resolve({ frames, dtMs: Math.round(dt), fps: Math.round((frames * 1000) / dt) });
          }, 2600);
        }),
    );
  const before = await measure();
  const streu = await page.evaluate(() => {
    const ed = window.__editor;
    ed.author.reset(36, 36, "streu-perf");
    ed.author.spawn(1, 4, 4);
    ed.author.spawn(2, 30, 30);
    ed.author.node(10, 10, "hain");
    const r = ed.author.streuMap("zielbild", 1337);
    ed.author.flush();
    return { added: r.added, generated: r.stats.generated };
  });
  const after = await measure();
  const png = await canvasPng(page);
  if (png) writeFileSync(`${ED_OUT}/scatter_perf.png`, png);
  const perfSummary = { before, after, added: streu.added, generated: streu.generated, dFps: (after.fps ?? 0) - (before.fps ?? 0) };
  writeFileSync(`${ED_OUT}/scatter_perf_summary.json`, JSON.stringify(perfSummary, null, 2) + "\n");
  console.log(`streuperf: before=${before.fps}fps after=${after.fps}fps added=${streu.added} generated=${JSON.stringify(streu.generated)}`);
  await browser.close();
  return 0;
}

const cmd = process.argv[2];
let preview;
try {
  preview = await startPreview();
  if (cmd === "attack") {
    await attack();
    preview?.kill("SIGKILL");
    process.exit(0);
  } else if (cmd === "roundtrip") {
    const failed = await roundtrip();
    preview?.kill("SIGKILL");
    process.exit(failed ? 1 : 0);
  } else if (cmd === "editops") {
    const failed = await editops();
    preview?.kill("SIGKILL");
    process.exit(failed ? 1 : 0);
  } else if (cmd === "terrainshots") {
    await terrainshots(process.argv[3] || "offen");
    preview?.kill("SIGKILL");
    process.exit(0);
  } else if (cmd === "transformtest") {
    const failed = await transformtest();
    preview?.kill("SIGKILL");
    process.exit(failed ? 1 : 0);
  } else if (cmd === "transformsweep") {
    await transformsweep();
    preview?.kill("SIGKILL");
    process.exit(0);
  } else if (cmd === "factiontest") {
    const failed = await factiontest();
    preview?.kill("SIGKILL");
    process.exit(failed ? 1 : 0);
  } else if (cmd === "destille_palette") {
    const failed = await destille_palette();
    preview?.kill("SIGKILL");
    process.exit(failed ? 1 : 0);
  } else if (cmd === "destille_screenshots") {
    const failed = await destille_screenshots();
    preview?.kill("SIGKILL");
    process.exit(failed ? 1 : 0);
  } else if (cmd === "factionshot") {
    await factionshot();
    preview?.kill("SIGKILL");
    process.exit(0);
  } else if (cmd === "robusttest") {
    const failed = await robusttest();
    preview?.kill("SIGKILL");
    process.exit(failed ? 1 : 0);
  } else if (cmd === "transformshot") {
    await transformshot();
    preview?.kill("SIGKILL");
    process.exit(0);
  } else if (cmd === "fogtest") {
    const failed = await fogtest();
    preview?.kill("SIGKILL");
    process.exit(failed ? 1 : 0);
  } else if (cmd === "fogshot") {
    await fogshot();
    preview?.kill("SIGKILL");
    process.exit(0);
  } else if (cmd === "fogdepth") {
    const failed = await fogdepth();
    preview?.kill("SIGKILL");
    process.exit(failed ? 1 : 0);
  } else if (cmd === "fogframes") {
    await fogframes();
    preview?.kill("SIGKILL");
    process.exit(0);
  } else if (cmd === "fogfaction") {
    await fogfaction();
    preview?.kill("SIGKILL");
    process.exit(0);
  } else if (cmd === "fogalpha") {
    const failed = await fogalpha();
    preview?.kill("SIGKILL");
    process.exit(failed ? 1 : 0);
  } else if (cmd === "rendereq") {
    const failed = await rendereq();
    preview?.kill("SIGKILL");
    process.exit(failed ? 1 : 0);
  } else if (cmd === "perf") {
    await perf(Number(process.argv[3] || 64));
    preview?.kill("SIGKILL");
    process.exit(0);
  } else if (cmd === "gameshot") {
    await gameshot(process.argv[3] || "offen");
    preview?.kill("SIGKILL");
    process.exit(0);
  } else if (cmd === "streushot") {
    const failed = await streushot();
    preview?.kill("SIGKILL");
    process.exit(failed ? 1 : 0);
  } else if (cmd === "streuperf") {
    const failed = await streuperf();
    preview?.kill("SIGKILL");
    process.exit(failed ? 1 : 0);
  } else if (cmd === "author") {
    await authormap(process.argv[3] || "offen");
    preview?.kill("SIGKILL");
    process.exit(0);
  } else if (cmd === "gate") {
    const extra = process.argv.slice(3).map((m) => [`?editor=1&map=${m}`, m]);
    const queries = [["?editor=1&demo=blend", "demo_blend"], ...extra];
    const failed = await gate(queries);
    preview?.kill("SIGKILL");
    process.exit(failed ? 1 : 0);
  } else if (cmd === "shoot")
    await shoot(
      process.argv[3] || "?editor=1",
      process.argv[4] || "shot",
      process.argv[5] ? Number(process.argv[5]) : undefined,
      process.argv[6] ? Number(process.argv[6]) : undefined,
      process.argv[7] ? Number(process.argv[7]) : undefined,
    );
  else console.log("unbekanntes Kommando:", cmd);
  preview?.kill("SIGKILL");
  process.exit(0);
} catch (e) {
  console.log("HARNESS_ERROR", e?.message || String(e));
  preview?.kill("SIGKILL");
  process.exit(1);
}
