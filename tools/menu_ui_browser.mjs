// menu_ui_browser.mjs -- Headless-Chromium-Harness fuer die Menue-Familie.
// Schwester von tools/florilegium_ui_browser.mjs (H24), gegen die DOM-Wurzel
// #hellmuth-menu und ueber das URL-Flag ?menu=1.
//
//   node tools/menu_ui_browser.mjs check
//     -> startet vite preview, oeffnet ?menu=1, prueft Hauptmenue (5 Punkte),
//        Design-Tokens (Hintergrund, Printvetica, liga 0, >=2 @font-face),
//        Footer-Links gegen die Konstanten, AudioBus global, Skirmish gegen
//        data/maps/index.json, Optionen-localStorage-Roundtrip. Exit 1 bei FAIL.
//   node tools/menu_ui_browser.mjs shoot [view]
//     -> Screenshot nach $SHOT_DIR/menu_<view>.png. view: main|skirmish|options.

import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

const LOG = "/tmp/menu_ui_harness.log";
const log = (...a) => { try { appendFileSync(LOG, a.join(" ") + "\n"); } catch { /* ignore */ } };

const PORT = Number(process.env.MENU_PORT || 4175);
const BASE = `http://localhost:${PORT}`;
const VIEW = { width: 1920, height: 1080 };
const SHOT_DIR = process.env.SHOT_DIR || "proof/menu";

// Erwartete Footer-Link-Konstanten (Spiegel von src/menu/menu_links.ts).
const EXPECTED_LINKS = {
  kokos: "https://kokos-und-zitrone.de",
  soda: "https://hellmuth-soda.de",
};

// Erwartete Karten aus data/maps/index.json (Wahrheit, gegen die Skirmish rendert).
function expectedMaps() {
  try {
    const raw = readFileSync(new URL("../data/maps/index.json", import.meta.url), "utf-8");
    return JSON.parse(raw).maps || [];
  } catch {
    return [];
  }
}

async function startPreview() {
  const p = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], {
    cwd: process.cwd(),
    stdio: "pipe",
  });
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(BASE + "/"); if (r.ok) return p; } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("vite preview kam nicht hoch");
}

async function newPage(browser) {
  const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 1 });
  await page.route("**/*", (route) => {
    const u = route.request().url();
    if (u.includes("fonts.googleapis") || u.includes("fonts.gstatic")) return route.abort();
    return route.continue();
  });
  page.on("pageerror", (e) => console.error("PAGEERR", e.message));
  return page;
}

async function check() {
  const browser = await chromium.launch({
    executablePath: process.env.PW_CHROME || undefined,
    args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--no-sandbox"],
  });
  const page = await newPage(browser);
  await page.goto(`${BASE}/?menu=1&renderer=canvas`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#hellmuth-menu .main-menu-item", { timeout: 10000 });
  await page.waitForTimeout(500);

  const res = await page.evaluate((expected) => {
    const out = {};
    const root = document.querySelector("#hellmuth-menu");
    out.has_root = !!root;
    const items = Array.from(document.querySelectorAll("#hellmuth-menu .main-menu-item"));
    // Label = data-item-Schluessel (stabil), Text wird nur fuer Anzeige genutzt.
    out.item_keys = items.map((b) => b.dataset.item || "");
    out.kampagne_disabled = items.some(
      (b) => b.dataset.item === "kampagne" && b.disabled,
    );
    // Design-Tokens
    out.bg = root ? getComputedStyle(root).backgroundColor : null;
    const title = document.querySelector("#hellmuth-menu .main-menu-title");
    out.title_font = title ? getComputedStyle(title).fontFamily : null;
    out.liga = title ? getComputedStyle(title).fontFeatureSettings : null;
    // @font-face zaehlen
    let faceCount = 0;
    for (const sheet of Array.from(document.styleSheets)) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      if (!rules) continue;
      for (const r of Array.from(rules)) {
        if (r.constructor && r.constructor.name === "CSSFontFaceRule") faceCount++;
        else if (r.type === 5) faceCount++; // FONT_FACE_RULE
      }
    }
    out.font_face_count = faceCount;
    // Footer-Links
    const fl = {};
    document.querySelectorAll("#hellmuth-menu .menu-footer-links a").forEach((a) => {
      fl[a.dataset.link] = a.getAttribute("href");
    });
    out.footer_links = fl;
    // AudioBus
    const bus = window.__audioBus;
    out.bus_ok = !!bus &&
      typeof bus.effectiveMusic === "function" &&
      typeof bus.effectiveSfx === "function" &&
      typeof bus.effectiveVoice === "function";
    out.bus_voice = bus ? bus.effectiveVoice() : null;
    void expected;
    return out;
  }, EXPECTED_LINKS);

  // Skirmish gegen index.json
  await page.evaluate(() => window.__menu && window.__menu.go("skirmish"));
  await page.waitForSelector("#hellmuth-menu .skirmish-map", { timeout: 5000 }).catch(() => {});
  const skirmish = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll("#hellmuth-menu .skirmish-map"));
    return {
      count: cards.length,
      names: cards.map((c) => (c.querySelector(".skirmish-map-name")?.textContent || "").trim()),
      has_start: !!document.querySelector('#hellmuth-menu [data-action="start"]'),
    };
  });

  // Optionen-localStorage-Roundtrip: Musik-Slider auf 40 setzen.
  await page.evaluate(() => window.__menu && window.__menu.go("options"));
  await page.waitForSelector('#hellmuth-menu input[data-channel="music"]', { timeout: 5000 }).catch(() => {});
  const options = await page.evaluate(() => {
    const slider = document.querySelector('#hellmuth-menu input[data-channel="music"]');
    if (!slider) return { ok: false };
    slider.value = "40";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem("hellmuth_options_v1") || "{}"); } catch { /* */ }
    return { ok: true, music: stored ? stored.music : null };
  });

  await browser.close();

  // Auswertung
  let fails = 0;
  const must = (cond, msg) => { if (!cond) { console.log("FAIL " + msg); fails++; } else console.log("OK   " + msg); };
  // Pflicht-Menuepunkte (Subagent #1: Skirmish zuerst, Kampagne klein-disabled,
  // Unterstuetzen + Beenden ans Ende). Reihenfolge wird hier nicht geprueft.
  const wantKeys = ["skirmish", "kampagne", "florilegium", "optionen", "unterstuetzen", "beenden"];
  must(res.has_root, "#hellmuth-menu vorhanden");
  must(res.item_keys.length === wantKeys.length, `${wantKeys.length} Menuepunkte (ist ${res.item_keys.length})`);
  for (const w of wantKeys) must(res.item_keys.includes(w), `Punkt '${w}' vorhanden`);
  must(res.kampagne_disabled, "Kampagne ausgegraut/disabled");
  must(res.bg === "rgb(26, 26, 26)", `Menue-Hintergrund rgb(26,26,26) (ist ${res.bg})`);
  must(/Printvetica/.test(res.title_font || ""), `Title-Font enthaelt Printvetica (ist ${res.title_font})`);
  must(/liga.*0|0.*liga/.test(res.liga || ""), `font-feature-settings liga 0 (ist ${res.liga})`);
  must(res.font_face_count >= 2, `>=2 @font-face (ist ${res.font_face_count})`);
  for (const [k, v] of Object.entries(EXPECTED_LINKS)) {
    must(res.footer_links[k] === v, `Footer-Link ${k} == ${v} (ist ${res.footer_links[k]})`);
  }
  must(res.bus_ok, "AudioBus global mit effectiveMusic/Sfx/Voice");
  must(typeof res.bus_voice === "number" && res.bus_voice >= 0 && res.bus_voice <= 1,
    `AudioBus.effectiveVoice in [0,1] (ist ${res.bus_voice})`);
  const wantMaps = expectedMaps();
  must(skirmish.count === wantMaps.length, `Skirmish-Karten == index.json (${skirmish.count} vs ${wantMaps.length})`);
  if (wantMaps[0]) must(skirmish.names.includes(wantMaps[0].name), `Karte '${wantMaps[0].name}' gerendert`);
  must(skirmish.has_start, "Skirmish hat Starten-Button");
  must(options.ok && options.music === 0.4, `Optionen schreibt music=0.4 in localStorage (ist ${options.music})`);

  if (fails) { console.log(`FAIL: ${fails} Punkt(e)`); process.exitCode = 1; }
  else console.log("PASS: Menue-Familie strukturell + Design-Tokens + AudioBus intakt.");
}

async function shoot(view) {
  view = view || "main";
  mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.PW_CHROME || undefined,
    args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--no-sandbox"],
  });
  const page = await newPage(browser);
  await page.goto(`${BASE}/?menu=1&renderer=canvas`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#hellmuth-menu .main-menu-item", { timeout: 10000 });
  if (view !== "main") {
    await page.evaluate((v) => window.__menu && window.__menu.go(v), view);
    await page.waitForTimeout(400);
  }
  // Phaser-Canvas vor Capture entfernen (Framebuffer-Capture crasht headless).
  await page.evaluate(() => {
    document.querySelectorAll("#game-root canvas").forEach((x) => x.remove());
  });
  await page.waitForTimeout(200);
  const name = `menu_${view}.png`;
  await page.screenshot({ path: `${SHOT_DIR}/${name}` });
  console.log("shot", `${SHOT_DIR}/${name}`);
  await browser.close();
}

const cmd = process.argv[2] || "check";
let preview;
try {
  console.log("startPreview on", PORT);
  preview = await startPreview();
  console.log("preview ready");
  if (cmd === "shoot") await shoot(process.argv[3]);
  else await check();
  if (preview) preview.kill("SIGKILL");
  process.exit(0);
} catch (e) {
  console.log("MENU_HARNESS_ERROR", e && e.message ? e.message : String(e));
  if (preview) preview.kill("SIGKILL");
  process.exit(1);
}
