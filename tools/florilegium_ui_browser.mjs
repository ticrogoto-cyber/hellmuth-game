// florilegium_ui_browser.mjs -- Headless-Chromium-Harness fuer die Florilegium-
// UI. Schwester von tools/hud_browser.mjs, aber gegen die andere DOM-Wurzel
// (#florilegium statt #hud) und ueber das URL-Flag ?florilegium=1.
//
//   node tools/florilegium_ui_browser.mjs check
//     -> startet vite preview, oeffnet ?florilegium=1&entry=apothekerin,
//        misst .flo-frame/.flo-detail-image/.flo-detail-title und reportet
//        PASS/FAIL. Exit 1 bei strukturellen Fehlern (Selector fehlt, leere
//        Liste, kein Eintrag aktiv).
//   node tools/florilegium_ui_browser.mjs shoot [id] [mode]
//     -> einzelner Screenshot nach $SHOT_DIR/<id>_<mode>.png.
//        Default id=apothekerin, mode=fullview.

import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";

const LOG = "/tmp/florilegium_ui_harness.log";
const log = (...a) => { try { appendFileSync(LOG, a.join(" ") + "\n"); } catch { /* ignore */ } };

const PORT = Number(process.env.FLORI_PORT || 4174);
const BASE = `http://localhost:${PORT}`;
const VIEW = { width: 1920, height: 1080 };
const SHOT_DIR = process.env.SHOT_DIR || "proof/florilegium";

async function startPreview() {
  const p = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], {
    cwd: process.cwd(),
    stdio: "pipe",
  });
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(BASE + "/");
      if (r.ok) return p;
    } catch { /* not up yet */ }
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
  await page.route("**/*", (route) => {
    const u = route.request().url();
    if (u.includes("fonts.googleapis") || u.includes("fonts.gstatic")) return route.abort();
    return route.continue();
  });
  page.on("pageerror", (e) => console.error("PAGEERR", e.message));
  await page.goto(`${BASE}/${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#florilegium.is-open", { timeout: 10000 });
  // Selektoren der UI-Skelettpruefung
  await page.waitForSelector("#florilegium .flo-frame", { timeout: 5000 });
  await page.waitForSelector("#florilegium .flo-list .flo-item", { timeout: 5000 });
  await page.waitForTimeout(500); // Bilder/Layout-Setzten
  const r = await fn(page);
  await browser.close();
  return r;
}

async function check() {
  const query = "?florilegium=1&entry=apothekerin&renderer=canvas";
  const res = await withPage(query, async (page) => {
    return page.evaluate(() => {
      const root = document.querySelector("#florilegium");
      const frame = root && root.querySelector(".flo-frame");
      const items = Array.from(root ? root.querySelectorAll(".flo-list .flo-item") : []);
      const active = root && root.querySelector(".flo-item.is-active");
      const title = root && root.querySelector(".flo-detail-title");
      const text = root && root.querySelector(".flo-detail-text");
      const img = root && root.querySelector(".flo-detail-image");
      const audioBtn = root && root.querySelector(".flo-audio-btn");
      const cats = Array.from(root ? root.querySelectorAll(".flo-cat-head") : []);
      const breadcrumb = root && root.querySelector(".flo-breadcrumb");
      const out = {
        mode: root ? root.getAttribute("data-mode") : null,
        items: items.length,
        active_id: active ? active.getAttribute("data-id") : null,
        title: title ? title.textContent : null,
        text_len: text ? (text.textContent || "").length : 0,
        img_src: img ? img.querySelector("img")?.getAttribute("src") : null,
        img_missing: img ? img.getAttribute("data-missing") === "1" : null,
        has_audio_btn: !!audioBtn,
        cat_headings: cats.map((t) => (t.textContent || "").replace(/\s+/g, " ").trim()),
        breadcrumb: breadcrumb ? (breadcrumb.textContent || "").replace(/\s+/g, " ").trim() : null,
      };
      const frect = frame ? frame.getBoundingClientRect() : null;
      out.frame = frect ? { x: frect.x, y: frect.y, w: frect.width, h: frect.height } : null;
      return out;
    });
  });

  let fails = 0;
  const must = (cond, msg) => { if (!cond) { console.log("FAIL " + msg); fails++; } else console.log("OK   " + msg); };
  must(res.mode === "fullview", `mode=fullview (ist '${res.mode}')`);
  must(res.items >= 1, `liste hat >=1 Eintrag (ist ${res.items})`);
  must(res.active_id === "apothekerin", `aktiver Eintrag=apothekerin (ist '${res.active_id}')`);
  must(res.title === "Die Apothekerin", `Titel='Die Apothekerin' (ist '${res.title}')`);
  must(res.text_len >= 200, `Text >=200 Zeichen (ist ${res.text_len})`);
  must(res.has_audio_btn, "Audio-Button vorhanden");
  must(res.frame && res.frame.w > 1200 && res.frame.h > 700, `Rahmen mind. 1200x700 (ist ${res.frame ? res.frame.w + "x" + res.frame.h : "null"})`);
  // Akkordeon: Kategorie "Einheiten" muss im Listen-Tree vorkommen.
  const catHits = (res.cat_headings || []).map((s) => s.toLowerCase());
  must(catHits.some((s) => s.includes("einheiten")), "Kategorie 'Einheiten' im Listen-Akkordeon vorhanden");
  must(res.breadcrumb && res.breadcrumb.includes("Apothekerin"), "Breadcrumb zeigt 'Apothekerin'");

  if (fails) {
    console.log(`FAIL: ${fails} Strukturpunkt(e)`);
    process.exitCode = 1;
  } else {
    console.log("PASS: Florilegium-UI strukturell intakt + Apothekerin gerendert.");
  }
}

async function shoot(id, mode) {
  id = id || "apothekerin";
  mode = mode || "fullview";
  const q = `?florilegium=1&flomode=${mode}&entry=${id}&renderer=canvas`;
  mkdirSync(SHOT_DIR, { recursive: true });
  log("shoot start", id, mode, q);
  await withPage(q, async (page) => {
    // Spiel-Canvas vor Capture entfernen (siehe hud_browser.mjs); Florilegium
    // ist eine HTML/CSS-Wurzel und braucht den WebGL-Frame nicht.
    await page.evaluate(() => {
      document.querySelectorAll("#game-root canvas").forEach((x) => x.remove());
      document.body.style.background = "#1d160d";
    });
    await page.waitForTimeout(200);
    const name = `${id}_${mode}.png`;
    await page.screenshot({ path: `${SHOT_DIR}/${name}`, fullPage: false });
    console.log("shot", `${SHOT_DIR}/${name}`);
  });
}

const cmd = process.argv[2] || "check";
let preview;
try {
  console.log("startPreview on", PORT);
  preview = await startPreview();
  console.log("preview ready");
  if (cmd === "shoot") await shoot(process.argv[3], process.argv[4]);
  else await check();
  if (preview) preview.kill("SIGKILL");
  process.exit(0);
} catch (e) {
  console.log("FLORI_HARNESS_ERROR", e && e.message ? e.message : String(e));
  if (preview) preview.kill("SIGKILL");
  process.exit(1);
}
