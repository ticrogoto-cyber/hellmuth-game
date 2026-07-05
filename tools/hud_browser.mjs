// hud_browser.mjs — Headless-Chromium-Harness fuer HELLMUTH.
//   node tools/hud_browser.mjs shoot   -> Screenshots beider Fraktionen nach $SHOT_DIR (Fallback /tmp/shots)
//   node tools/hud_browser.mjs check   -> Live-Mess-Gate: gerenderte Panel-Kanten
//                                         vs. hud-spec.md (Exit 1 bei Abweichung)
// Startet `vite preview` (dist/), misst/schiesst gegen die ECHTE App.
import { spawn } from "node:child_process";
import { appendFileSync } from "node:fs";
import { chromium } from "playwright";

const LOG = "/tmp/harness.log";
const log = (...a) => { try { appendFileSync(LOG, a.join(" ") + "\n"); } catch { /* ignore */ } };

const PORT = Number(process.env.HUD_PORT || 4173);
const BASE = `http://localhost:${PORT}`;
const VIEW = { width: 1920, height: 1080 };
// SHOT_DIR vereinheitlicht das Ausgabe-Ziel aller Shot-Tools (Fallback = heutiger Pfad).
const SHOT_DIR = process.env.SHOT_DIR || "/tmp/shots";
const GATE_DIR = process.env.SHOT_DIR || "/tmp/gate";

// Spec-Rechtecke (px auf 1920x1080) aus docs/hud-spec.md, Teilmenge der Panels
// und Innenzonen mit eindeutigem Selektor.
const SPEC = [
  ["#hud .p-emblem", 0, 0, 279, 96],
  ["#hud .p-menu", 1781, 0, 139, 48],
  ["#hud .p-minimap", 16, 779, 286, 286],
  ["#hud .p-unitcard", 521, 824, 878, 241],
  ["#hud .p-resources", 1616, 837, 173, 216],
  ["#hud .emb-mark", 21, 15, 65, 65],
  ["#hud .uc-portrait", 534, 837, 154, 216],
  ["#hud .uc-name", 712, 836, 232, 29],
  ["#hud .uc-sub", 712, 869, 171, 21],
  ["#hud .uc-eff-head", 884, 918, 155, 22],
  ["#hud .uc-stat-icon.s0", 712, 918, 21, 21],
  ["#hud .uc-stat-icon.s3", 712, 1014, 21, 21],
  ["#hud .uc-cmd", 1094, 837, 291.8, 216],
  ["#hud .res-icon.q0", 1630, 852, 38, 38],
  ["#hud .res-icon.q3", 1630, 1000.5, 38, 38],
  ["#hud .hud-sockel", 0, 988, 1920, 92],
  ["#hud .riser-minimap", 16, 764, 286, 224],
];

async function startPreview() {
  const p = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { cwd: process.cwd(), stdio: "pipe" });
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(BASE + "/"); if (r.ok) return p; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("vite preview kam nicht hoch");
}

async function withPage(query, fn) {
  const browser = await chromium.launch({
    executablePath: process.env.PW_CHROME || undefined,
    args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 1 });
  // Externe Google-Fonts haengen unter der Netz-Policy -> abbrechen (Barlow als
  // Fallback-Schrift). Sonst blockiert das load-Event.
  await page.route("**/*", (route) => {
    const u = route.request().url();
    if (u.includes("fonts.googleapis") || u.includes("fonts.gstatic")) return route.abort();
    return route.continue();
  });
  page.on("pageerror", (e) => console.error("PAGEERR", e.message));
  console.error("goto", query);
  await page.goto(`${BASE}/${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#hud", { timeout: 10000 });
  console.error("#hud da");
  await page.waitForTimeout(1800); // Terrain/HUD/Spawn setteln
  const r = await fn(page);
  await browser.close();
  return r;
}

const SELECT_HQ = () => {
  const gs = window.__game.registry.get("gameState");
  gs.selected = [];
  const b = gs.buildings.find((x) => x.owner === "spieler" && x.canProduce)
    || gs.buildings.find((x) => x.owner === "spieler");
  gs.inspected = b;
};
const SELECT_UNITS = () => {
  const gs = window.__game.registry.get("gameState");
  gs.inspected = undefined;
  const us = gs.units.filter((u) => u.owner === "spieler");
  gs.selectUnits(us.length >= 2 ? us : us.concat(us));
};
const COUNTS = () => {
  const gs = window.__game.registry.get("gameState");
  return { units: gs.units.length, buildings: gs.buildings.length,
    pUnits: gs.units.filter((u) => u.owner === "spieler").length };
};

async function shoot() {
  const shots = [
    ["?faction=hellmuth", "hellmuth_default", null],
    ["?faction=hellmuth", "hellmuth_command", SELECT_HQ],
    ["?faction=hellmuth", "hellmuth_multi", SELECT_UNITS],
    ["?faction=moderat", "moderat_default", null],
    ["?faction=moderat", "moderat_command", SELECT_HQ],
    ["?faction=hellmuth&speclines=1", "hellmuth_speclines", null],
    ["?faction=hellmuth&grid=1", "hellmuth_grid", null],
  ];
  const { mkdirSync } = await import("node:fs");
  mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.PW_CHROME || undefined,
    args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--no-sandbox"],
  });
  for (const [q, name, manip] of shots) {
    const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 1 });
    await page.route("**/*", (route) => {
      const u = route.request().url();
      return u.includes("fonts.g") ? route.abort() : route.continue();
    });
    const q2 = q + (q.includes("?") ? "&" : "?") + "renderer=canvas";
    await page.goto(`${BASE}/${q2}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#hud", { timeout: 10000 });
    await page.waitForTimeout(1400);
    if (manip) { await page.evaluate(manip); await page.waitForTimeout(350); }
    else { console.log("counts", JSON.stringify(await page.evaluate(COUNTS))); }
    // Phaser-Canvas vor dem Capture entfernen (Framebuffer-Capture crasht headless).
    await page.evaluate(() => {
      document.querySelectorAll("#game-root canvas").forEach((x) => x.remove());
      document.body.style.background = "#26302a";
    });
    await page.waitForTimeout(120);
    await page.screenshot({ path: `${SHOT_DIR}/${name}.png` });
    console.log("shot", name);
    await page.close();
  }
  await browser.close();
}

async function check() {
  const TOL = 2.5;
  let fails = 0;
  const res = await withPage("?faction=hellmuth", async (page) => {
    return page.evaluate((spec) => {
      const out = [];
      for (const [sel, x, y, w, h] of spec) {
        const el = document.querySelector(sel);
        if (!el) { out.push({ sel, missing: true }); continue; }
        const r = el.getBoundingClientRect();
        out.push({ sel, x: r.x, y: r.y, w: r.width, h: r.height, want: [x, y, w, h] });
      }
      return out;
    }, SPEC);
  });
  console.log(`${"ELEMENT".padEnd(22)} ${"SOLL".padEnd(22)} IST`);
  for (const e of res) {
    if (e.missing) { console.log(`${e.sel}  FEHLT`); fails++; continue; }
    const [wx, wy, ww, wh] = e.want;
    const d = [Math.abs(e.x - wx), Math.abs(e.y - wy), Math.abs(e.w - ww), Math.abs(e.h - wh)];
    const ok = d.every((v) => v <= TOL);
    if (!ok) fails++;
    console.log(`${e.sel.replace("#hud ", "").padEnd(22)} ${`${wx},${wy},${ww},${wh}`.padEnd(22)} ${e.x.toFixed(0)},${e.y.toFixed(0)},${e.w.toFixed(0)},${e.h.toFixed(0)} ${ok ? "OK" : "BUG " + d.map((v) => v.toFixed(1))}`);
  }
  if (fails) { console.log(`FAIL: ${fails} Abweichung(en) > ${TOL}px`); process.exitCode = 1; }
  else console.log("PASS: gerenderte Kanten decken sich mit der Spec.");
}

async function oneShot(q, name, manipKey) {
  const { mkdirSync } = await import("node:fs");
  mkdirSync(SHOT_DIR, { recursive: true });
  const manip = { hq: SELECT_HQ, units: SELECT_UNITS }[manipKey];
  const q2 = q + (q.includes("?") ? "&" : "?") + "renderer=canvas";
  log("oneShot start", name, q2);
  await withPage(q2, async (page) => {
    log("page ready", name);
    if (manip) { await page.evaluate(manip); await page.waitForTimeout(350); log("manip done", name); }
    // Phaser-Canvas (WebGL/Canvas) vor dem Capture entfernen: dessen Framebuffer-
    // Capturing crasht Headless-Chromium hier. HUD-DOM + Minimap-DOM-Canvas (mit
    // letztem Frame) bleiben erhalten. Hintergrund wird der Spielfeld-Bodenton.
    await page.evaluate(() => {
      const c = document.querySelector("#game-root canvas");
      const bg = c ? getComputedStyle(c).backgroundColor : "";
      document.querySelectorAll("#game-root canvas").forEach((x) => x.remove());
      document.body.style.background = "#26302a";
      void bg;
    });
    await page.waitForTimeout(150);
    log("canvas removed", name);
    await page.screenshot({ path: `${SHOT_DIR}/${name}.png` });
    log("screenshot done", name);
    console.log("shot", name);
  });
}

// Gate-Aufnahmen: Zonemap (Geometrie-Pruefstand) + Realbild, beide Fraktionen
// und beide Zustaende. Phaser-Canvas wird vor dem Realbild-Capture entfernt
// (Framebuffer-Capture crasht Headless); Zonemap blendet ihn per CSS aus.
async function gateshots() {
  const { mkdirSync } = await import("node:fs");
  mkdirSync(GATE_DIR, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.PW_CHROME || undefined,
    args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--no-sandbox"],
  });
  const jobs = [];
  for (const fac of ["hellmuth", "moderat"]) {
    jobs.push([`?faction=${fac}&zonemap=1&renderer=canvas`, `zonemap_${fac}_1`, null]);
    jobs.push([`?faction=${fac}&zonemap=1&select=multi&renderer=canvas`, `zonemap_${fac}_2`, null]);
    jobs.push([`?faction=${fac}&renderer=canvas`, `real_${fac}_1`, "hq"]);
    jobs.push([`?faction=${fac}&renderer=canvas`, `real_${fac}_2`, "units"]);
    // Transparenz-Pruefpaar: identischer Zustand, Hintergrund weiss vs schwarz.
    // Panelgrund (Deckkraft 0.95) muss Differenz ~12.75 zeigen, alles andere ~0.
    jobs.push([`?faction=${fac}&renderer=canvas`, `alpha_${fac}_w`, "hq:white"]);
    jobs.push([`?faction=${fac}&renderer=canvas`, `alpha_${fac}_b`, "hq:black"]);
    // Dichte-Gesetz-Masken: voll / ohne Aufsatz-Ebene / ohne Herzstueck, alle
    // mit reduzierter Bewegung (eingefrorener Puls), damit der Pixeldiff nur
    // die geschalteten Layer zeigt. hud_gate.py misst D1-D6 darauf.
    jobs.push([`?faction=${fac}&renderer=canvas`, `dmask_${fac}_full`, "hq:still"]);
    jobs.push([`?faction=${fac}&orn=0&renderer=canvas`, `dmask_${fac}_orn0`, "hq:still"]);
    jobs.push([`?faction=${fac}&herz=0&renderer=canvas`, `dmask_${fac}_herz0`, "hq:still"]);
  }
  for (const [q, name, manipKey] of jobs) {
    const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 1 });
    if ((manipKey || "").endsWith(":still")) await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("**/*", (route) =>
      route.request().url().includes("fonts.g") ? route.abort() : route.continue());
    await page.goto(`${BASE}/${q}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#hud", { timeout: 10000 });
    await page.waitForTimeout(1200);
    const [mk, bg] = (manipKey || "").split(":");
    const manip = { hq: SELECT_HQ, units: SELECT_UNITS }[mk];
    if (manip) { await page.evaluate(manip); await page.waitForTimeout(300); }
    if (!q.includes("zonemap")) {
      await page.evaluate((bgc) => {
        document.querySelectorAll("#game-root canvas").forEach((x) => x.remove());
        document.body.style.background = bgc || "#26302a";
      }, bg === "white" ? "#ffffff" : bg === "black" ? "#000000" : "");
      await page.waitForTimeout(120);
    }
    await page.screenshot({ path: `${GATE_DIR}/${name}.png` });
    console.log("gate-shot", name);
    await page.close();
  }
  await browser.close();
}

const cmd = process.argv[2];
let preview;
try {
  console.log("startPreview on", PORT);
  preview = await startPreview();
  console.log("preview ready");
  if (cmd === "one") await oneShot(process.argv[3], process.argv[4], process.argv[5]);
  else if (cmd === "shoot") await shoot();
  else if (cmd === "gateshots") await gateshots();
  else await check();
  if (preview) preview.kill("SIGKILL");
  process.exit(0); // nie auf haengende Browser-/Preview-Handles warten
} catch (e) {
  console.log("HARNESS_ERROR", e && e.message ? e.message : String(e));
  if (preview) preview.kill("SIGKILL");
  process.exit(1);
}
