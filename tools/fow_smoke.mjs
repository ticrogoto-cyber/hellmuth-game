// fow_smoke.mjs — Verhaltens-Gate fuer Fog-of-War Paket B (Verbraucher).
//   node tools/fow_smoke.mjs
// Vorbedingung: `npm run build`. Treibt die ECHTE App ueber window.__sim und
// liest den GERENDERTEN Zustand (Einheiten-.visible, Geist-Registry, gebackene
// Schleier-Deckkraft) -- Beleg fuer Teil 1 (Schleier) + Teil 2 (Sichtbarkeit).
// Teil 3 (KI/Kampf-Nebelfilter, Determinismus) deckt dyn_smoke ab.
//
// Vier Phasen an EINEM Aufbau (nur HQs als Dauerquellen):
//   baseline  -> Feind-HQ im Nebel: unsichtbar, kein Geist, Schleier dunkel.
//   reveal    -> Spaeher deckt auf: Feind-HQ live, Feind-Einheit sichtbar, Geist angelegt.
//   vanish    -> Spaeher weg: Einheit verschwindet (mobil), HQ wird gedimmter Geist.
//   destroyed -> HQ im Nebel entfernt: Geist BLEIBT bis Re-Aufklaerung.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

// SHOT_DIR vereinheitlicht das Ausgabe-Ziel aller Shot-Tools (Fallback = heutiger Pfad).
const SHOT_DIR = process.env.SHOT_DIR || "/tmp/fow";

const PORT = Number(process.env.FOW_PORT || 4179);
const BASE = `http://localhost:${PORT}`;

function startPreview() {
  const p = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], {
    cwd: process.cwd(),
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

// --- In-Page-Bausteine (laufen im Browser) ---------------------------------
const setupBaseline = () => {
  const sim = window.__sim;
  const gs = window.__game.registry.get("gameState");
  sim.setDriven(true);
  sim.clear(); // nur Gebaeude (HQs) bleiben als Sichtquellen
  sim.setSeed(1); // resetVision -> sauberer Nebel
  sim.step(1); // HQs stempeln ihre Sicht
  const ehq = gs.buildings.find((b) => b.owner === "gegner" && b.role === "hq");
  const phq = gs.buildings.find((b) => b.owner === "spieler" && b.role === "hq");
  const dc = ehq.col < 18 ? 6 : -6;
  window.__fow = {
    ehqC: ehq.col,
    ehqR: ehq.row,
    phqC: phq.col,
    phqR: phq.row,
    scoutC: ehq.col + dc, // Disc-Mitte: erkundetes Inneres, in allen Phasen messbar
    scoutR: ehq.row,
    // Saubere Terrain-Zelle im Spaeher-Disc (kein Blip, kein Kamerarahmen): 3
    // Kacheln Richtung Mitte -> sichtbar bei Reveal, erinnert bei Vanish, schwarz
    // bei Baseline. Misst den reinen Minimap-Drei-Zustand.
    probeC: ehq.col + dc + (dc > 0 ? 3 : -3),
    probeR: ehq.row,
  };
  return window.__fow;
};

const probe = () => {
  const sim = window.__sim;
  const gs = window.__game.registry.get("gameState");
  const f = window.__fow;
  const ehq = gs.buildings.find((b) => b.owner === "gegner" && b.role === "hq");
  const eu = f.enemyUnit;
  // Minimap-Helligkeit (Luminanz 0..255) an der sauberen Probe-Zelle: muss dem
  // Veil folgen (sichtbar hell, erinnert mittel, unerkundet dunkel).
  let mmLum = null;
  const mm = document.querySelector(".mm-canvas");
  if (mm) {
    const mctx = mm.getContext("2d");
    const px = Math.min(mm.width - 1, Math.round((f.probeC / 36) * mm.width) + 4);
    const py = Math.min(mm.height - 1, Math.round((f.probeR / 36) * mm.height) + 4);
    const d = mctx.getImageData(px, py, 1, 1).data;
    mmLum = Math.round(0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2]);
  }
  return {
    mmLum,
    veilProbe: f.probeC != null ? sim.veilAlpha(f.probeC, f.probeR) : null,
    visEnemyHq: sim.visAt("spieler", f.ehqC, f.ehqR),
    visPlayerHq: sim.visAt("spieler", f.phqC, f.phqR),
    enemyHqVisible: ehq ? ehq.visible : null,
    enemyUnitVisible: eu ? eu.visible : null,
    ghosts: sim.ghosts(),
    veilEnemyHq: sim.veilAlpha(f.ehqC, f.ehqR),
    veilPlayerHq: sim.veilAlpha(f.phqC, f.phqR),
    veilScout: f.scoutC != null ? sim.veilAlpha(f.scoutC, f.scoutR) : null,
    veilDepth: sim.veilDepth(),
  };
};

const setupReveal = () => {
  const sim = window.__sim;
  const gs = window.__game.registry.get("gameState");
  const f = window.__fow;
  // Spaeher in die Disc-Mitte am Feind-HQ (in Sicht 6, ueber Acquire-Reichweite
  // 5 -> KEIN Kampf). Feind-Einheit 6 Kacheln daneben (sichtbar, nicht bekaempft).
  sim.spawn("spieler", "apotheker", f.scoutC, f.scoutR);
  window.__fow.scout = gs.units[gs.units.length - 1];
  sim.spawn("gegner", "stahlbrute", f.scoutC, f.scoutR - 6);
  window.__fow.enemyUnit = gs.units[gs.units.length - 1];
  sim.step(1);
};

const setupVanish = () => {
  const gs = window.__game.registry.get("gameState");
  gs.removeUnit(window.__fow.scout); // nur die Sichtquelle weg, Feind-Einheit bleibt
  window.__sim.step(1);
};

const setupDestroyed = () => {
  const gs = window.__game.registry.get("gameState");
  const ehq = gs.buildings.find((b) => b.owner === "gegner" && b.role === "hq");
  if (ehq) gs.removeBuilding(ehq); // im Nebel zerstoert -> Quelle aus dem State
  window.__sim.step(1);
};

// Last-Phase (Paket C, Teil 2): 1000 Sichtquellen -> FoW-Kosten unter Last.
const setupLoad = () => {
  const sim = window.__sim;
  sim.clear();
  sim.setSeed(2);
  for (let i = 0; i < 1000; i++) {
    const c = 1 + ((i * 7) % 34);
    const r = 1 + ((i * 13) % 34);
    sim.spawn("spieler", "apotheker", c, r);
  }
  for (let k = 0; k < 6; k++) sim.step(1); // Stempel/Sicht warm
  return { lastFowMs: sim.stats().fowMs };
};
const probeLoad = () => ({
  fowRenderMs: window.__sim.fowRenderMs(),
  units: window.__game.registry.get("gameState").units.length,
});

async function main() {
  const preview = await startPreview();
  const browser = await chromium.launch({
    executablePath:
      process.env.PW_CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.route("**/*", (route) => {
    const u = route.request().url();
    if (u.includes("fonts.googleapis") || u.includes("fonts.gstatic")) return route.abort();
    return route.continue();
  });
  page.on("pageerror", (e) => console.error("PAGEERR", e.message));

  await page.goto(BASE + "/?renderer=canvas", { waitUntil: "load" });
  await page.waitForFunction(() => !!window.__sim && !!window.__game, { timeout: 30000 });
  await page.waitForTimeout(1200); // Spawn/Terrain setteln

  const wait = () => page.waitForTimeout(220);

  await page.evaluate(setupBaseline);
  await wait();
  const baseline = await page.evaluate(probe);

  await page.evaluate(setupReveal);
  await wait();
  const reveal = await page.evaluate(probe);

  // Realbild (Canvas2D) der Reveal-Phase: zeigt Schleier + aufgedeckte Tasche.
  // Kamera vorher sichern und danach wiederherstellen, damit die folgenden
  // Phasen (Minimap-Sampling) denselben Rahmen sehen.
  let shot = null;
  try {
    mkdirSync(SHOT_DIR, { recursive: true });
    await page.evaluate(() => {
      const cam = window.__game.scene.getScene("game").cameras.main;
      window.__camSave = { x: cam.scrollX, y: cam.scrollY, z: cam.zoom };
      cam.setZoom(0.45);
      const s = window.__fow.scout;
      if (s) cam.centerOn(s.x, s.y);
    });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${SHOT_DIR}/reveal.png` });
    shot = `${SHOT_DIR}/reveal.png`;
    await page.evaluate(() => {
      const cam = window.__game.scene.getScene("game").cameras.main;
      const s = window.__camSave;
      if (s) {
        cam.setZoom(s.z);
        cam.setScroll(s.x, s.y);
      }
    });
    await page.waitForTimeout(120);
  } catch (e) {
    console.error("SHOT-SKIP", e.message);
  }

  await page.evaluate(setupVanish);
  await wait();
  const vanish = await page.evaluate(probe);

  await page.evaluate(setupDestroyed);
  await wait();
  const destroyed = await page.evaluate(probe);

  const load = await page.evaluate(setupLoad);
  await wait();
  const loadR = await page.evaluate(probeLoad);

  await browser.close();
  preview.kill();

  // --- Auswertung ---------------------------------------------------------
  let red = 0;
  const checks = [];
  const want = (name, cond, got) => {
    if (!cond) red++;
    checks.push([name, cond, got]);
  };

  // Teil 1 (Schleier): toent den Grund nach Gitterzustand, eine Ebene unter Einheiten.
  want("Schleier-Ebene unter Einheiten (-60000)", baseline.veilDepth === -60000, baseline.veilDepth);
  want("Schleier klar ueber Spieler-HQ (alpha 0)", baseline.veilPlayerHq === 0, baseline.veilPlayerHq);
  want("Schleier dunkel ueber Feind-HQ im Nebel (>180)", baseline.veilEnemyHq > 180, baseline.veilEnemyHq);
  want("Schleier weicht beim Aufdecken (alpha 0)", reveal.veilEnemyHq === 0, reveal.veilEnemyHq);
  want(
    "Schleier gedimmt im erkundeten Inneren nach Verlassen (0<a<200)",
    vanish.veilScout > 0 && vanish.veilScout < 200,
    vanish.veilScout,
  );

  // Teil 2 (Sichtbarkeit): Feind verschwindet im Nebel, Gebaeude wird Geist.
  want("Feind-HQ im Nebel verborgen", baseline.enemyHqVisible === false, baseline.enemyHqVisible);
  want("Feind-HQ kein Geist vor Erst-Sicht", baseline.ghosts.total === 0, JSON.stringify(baseline.ghosts));
  want("Feind-HQ live bei Sicht", reveal.enemyHqVisible === true, reveal.enemyHqVisible);
  want("Feind-Einheit sichtbar bei Sicht", reveal.enemyUnitVisible === true, reveal.enemyUnitVisible);
  want("Geist angelegt bei Erst-Sicht", reveal.ghosts.total >= 1, JSON.stringify(reveal.ghosts));
  want("Feind-Einheit verschwindet im Nebel (mobil)", vanish.enemyUnitVisible === false, vanish.enemyUnitVisible);
  want("Feind-HQ wird Geist nach Verlassen", vanish.enemyHqVisible === false && vanish.ghosts.visible >= 1, `vis=${vanish.enemyHqVisible} ghosts=${JSON.stringify(vanish.ghosts)}`);
  want(
    "Geist BLEIBT nach Zerstoerung im Nebel",
    destroyed.ghosts.total >= 1 && destroyed.ghosts.visible >= 1,
    JSON.stringify(destroyed.ghosts),
  );
  want("verlassener Bereich bleibt erkundet (vis 1)", destroyed.visEnemyHq === 1, destroyed.visEnemyHq);

  // Teil C-1 (Minimap): Drei-Zustand KONSISTENT zum Schleier -- die Spaeher-Zelle
  // ist unerkundet dunkel, sichtbar hell, erinnert mittel (invers zur Veil-Deckkraft).
  const mmOk =
    baseline.mmLum != null &&
    reveal.mmLum > vanish.mmLum &&
    vanish.mmLum > baseline.mmLum;
  want(
    "Minimap Drei-Zustand konsistent zum Schleier (hell>mittel>dunkel)",
    mmOk,
    `mmLum base=${baseline.mmLum} reveal=${reveal.mmLum} vanish=${vanish.mmLum} | veilProbe ${baseline.veilProbe}/${reveal.veilProbe}/${vanish.veilProbe}`,
  );

  // Teil C-2 (Last): FoW-Kosten bei 1000 Quellen. Sim-Stempel (lastFowMs) im
  // Sim-Budget (33,3 ms), Render-Pfad (Sicht+Schleier) im Frame-Budget (16,67 ms).
  want("Last: 1000 Sichtquellen aktiv", loadR.units === 1000, loadR.units);
  want("Last: Sim-Stempel lastFowMs < 2 ms @1000", load.lastFowMs < 2, `${load.lastFowMs.toFixed(3)} ms`);
  want(
    "Last: Render-Pfad (Sicht+Schleier) < 16,67 ms @1000",
    loadR.fowRenderMs < 16.67,
    `${loadR.fowRenderMs.toFixed(3)} ms`,
  );

  const line = (s) => console.log(s);
  line("");
  line("FoW Paket B — Verbraucher (Schleier + Sichtbarkeit), gerenderter Zustand:");
  line("STATUS  PRUEFUNG                                              IST");
  for (const [name, ok, got] of checks) {
    line(`${ok ? "GRUEN " : "ROT   "}  ${name.padEnd(52)} ${got}`);
  }
  line("");
  line(`Phasen-Rohwerte:`);
  line(`  baseline: ${JSON.stringify(baseline)}`);
  line(`  reveal:   ${JSON.stringify(reveal)}`);
  line(`  vanish:   ${JSON.stringify(vanish)}`);
  line(`  destroyed:${JSON.stringify(destroyed)}`);
  line(`  last:     lastFowMs=${load.lastFowMs.toFixed(3)}ms fowRenderMs=${loadR.fowRenderMs.toFixed(3)}ms units=${loadR.units}`);
  if (shot) line(`Realbild (Canvas2D, Reveal-Phase): ${shot}`);
  line("");
  line(red === 0 ? "FOW-B-GATE: GRUEN" : `FOW-B-GATE: ROT (${red} Pruefung(en))`);
  process.exit(red === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ABBRUCH:", e.stack || e.message);
  process.exit(1);
});
