// hud_dom_probe.mjs — render-basierte DOM-Sonde fuer das HUD-Soll-Gate.
//
// Rendert die echte App (vite preview gegen dist/) headless in beiden Fraktionen
// und schreibt pro Fraktion ein dom_<faction>.json mit den computed-Werten, die
// hud_soll_gate.py gegen docs/HUD-SOLL-SPEC.md prueft. KEIN statisches CSS-Parsing
// — nur getComputedStyle/getBoundingClientRect des laufenden DOM (Ursache 8 in
// HUD-FEHLERURSACHEN.md: Gate und Laufzeit muessen dieselbe Wahrheit pruefen).
//
//   node tools/hud_dom_probe.mjs            # -> /tmp/gate/dom_{hellmuth,moderat}.json
//   SHOT_DIR=/pfad node tools/hud_dom_probe.mjs   # Ausgabe-Ziel umlenken (Fallback /tmp/gate)
//
// Braucht: playwright (chromium), gebautes dist/ (npx vite build). Fehlt eines,
// Exit != 0 mit klarer Meldung -> pruefen.sh meldet SKIP/FAIL, bricht nichts.

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const GATE_DIR = process.env.SHOT_DIR || process.env.GATE_DIR || "/tmp/gate";
const PORT = Number(process.env.HUD_PORT || 4178);
const VIEW = { width: 1920, height: 1080 };
const FACTIONS = ["hellmuth", "moderat"];

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("hud_dom_probe: playwright fehlt (npm i -D playwright) — uebersprungen");
  process.exit(3);
}

mkdirSync(GATE_DIR, { recursive: true });

// vite preview gegen dist/ starten (mirror hud_browser.mjs). strictPort, damit ein
// belegter Port hart faellt statt still auf einen anderen auszuweichen.
const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "ignore",
});
let serverUp = false;

async function waitForServer(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch { /* noch nicht oben */ }
    await sleep(500);
  }
  return false;
}

// In-Browser-Sonde: liefert genau die Felder, die hud_soll_gate.py erwartet.
// Null-sicher; fehlende Elemente -> present:false / count:0, nie Exception.
function probeInPage(faction) {
  const css = (el, prop) => (el ? getComputedStyle(el).getPropertyValue(prop).trim() : "");
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  };
  const hud = document.querySelector("#hud");
  const panelOf = (sel) => document.querySelector(`#hud ${sel}`);

  // --hud-scale ist calc() und nicht direkt lesbar. ornW (computed) = 15*scale px,
  // daraus den Skalenfaktor ableiten (1.0 bei 1920x1080). scalePx>0 belegt zugleich,
  // dass --hud-scale definiert ist und propagiert (Anker-Layout aktiv).
  let ornW = parseFloat(css(hud, "--ornW")) || 0;
  let ornH = parseFloat(css(hud, "--ornH")) || 0;
  // Fallback: aeltere Chromium loesen calc() in Custom-Properties NICHT in
  // getComputedStyle auf (--ornW bleibt calc-String -> 0). Dann den Skalenfaktor
  // aus einer AUFGELOESTEN Groesse ableiten: Emblem-Panel-Breite = 279*scale.
  if (!(ornW > 0)) {
    const er = rect(panelOf(".p-emblem"));
    if (er && er.w > 0) { ornW = (er.w / 279) * 15; ornH = ornW; }
  }
  const scalePx = ornW > 0 ? ornW / 15 : 0; // 1 bei 1920x1080
  // transform:scale auf dem HUD-Subtree ist verboten (Soll: EIN --hud-scale, kein scale())
  let transformScaleCount = 0;
  for (const el of document.querySelectorAll("#hud, #hud *")) {
    const t = getComputedStyle(el).transform;
    if (t && t !== "none" && /matrix|scale/.test(t)) {
      // translateX(-50%) der hud-stage erzeugt matrix(1,0,0,1,..) ohne Skalierung -> ausschliessen
      const m = t.match(/matrix\(([^)]+)\)/);
      if (m) {
        const p = m[1].split(",").map(parseFloat);
        if (Math.abs(p[0] - 1) > 0.001 || Math.abs(p[3] - 1) > 0.001) transformScaleCount++;
      } else if (/scale\(/.test(t)) transformScaleCount++;
    }
  }

  // ::before-Insets je Panel (offene Oberkante 26 vs geschlossen 15)
  const beforeInset = {};
  for (const key of ["p-emblem", "p-menu", "p-minimap", "p-unitcard", "p-resources"]) {
    const el = panelOf("." + key);
    beforeInset[key] = el ? getComputedStyle(el, "::before").getPropertyValue("inset").trim() : "";
  }

  // Strip-Toenung: --strip-top/-bot/-side enthalten das Inline-SVG (data:-URI).
  // Wir dumpen NICHT die ganze URI, sondern pruefen die Pflicht-Substrings im Browser.
  const stripVal = (name) => css(hud, name);
  const decodeChecks = (v) => {
    if (!v) return { present: false, srgb: false, dataMaster: false };
    let dec = v;
    try { dec = decodeURIComponent(v); } catch { /* schon dekodiert */ }
    return {
      present: /data:image\/svg/i.test(v),
      srgb: /color-interpolation-filters\s*=\s*["']?sRGB/i.test(dec),
      // Master als data:image/png eingebettet, KEINE externe /sprites-href
      dataMaster: /href\s*=\s*["']data:image\/png/i.test(dec) && !/href\s*=\s*["']\/?sprites/i.test(dec),
    };
  };

  // Sigil
  const sig = document.querySelector("#hud .v2-sigil");
  const sigRect = rect(sig);
  const sigil = {
    count: document.querySelectorAll("#hud .v2-sigil").length,
    centerX: sigRect ? sigRect.x + sigRect.w / 2 : null,
    top: sigRect ? sigRect.y : null,
    zIndex: sig ? parseInt(css(sig, "z-index")) || 0 : null,
  };

  // Emblem-Eckstueck
  const corner = document.querySelector("#hud .emb-corner");
  let cornerUrl = "";
  if (corner) {
    const bg = getComputedStyle(corner).backgroundImage || "";
    const m = bg.match(/url\(["']?([^"')]+)["']?\)/);
    cornerUrl = m ? m[1] : "";
  }

  const fills = document.querySelectorAll("#hud .v2-fill, #hud .v2-bloom").length;
  const koenig = document.querySelectorAll("#hud .v2-koenig").length;

  const resVal = document.querySelector("#hud .res-val");
  const resAlign = resVal ? getComputedStyle(resVal).justifyContent : "";
  const resCount = document.querySelectorAll("#hud .res-val").length;

  return {
    faction,
    viewport: { w: window.innerWidth, h: window.innerHeight },
    scale: { px: scalePx, transformScale: transformScaleCount, ornW, ornH },
    panels: {
      emblem: rect(panelOf(".p-emblem")),
      menu: rect(panelOf(".p-menu")),
      minimap: rect(panelOf(".p-minimap")),
      unitcard: rect(panelOf(".p-unitcard")),
      resources: rect(panelOf(".p-resources")),
    },
    beforeInset,
    strip: {
      top: decodeChecks(stripVal("--strip-top")),
      bot: decodeChecks(stripVal("--strip-bot")),
      side: decodeChecks(stripVal("--strip-side")),
    },
    sigil,
    embCorner: { present: !!corner, url: cornerUrl },
    fills,
    koenig,
    resVal: { justify: resAlign, count: resCount },
  };
}

let exitCode = 0;
let browser;
try {
  serverUp = await waitForServer(`http://localhost:${PORT}/`);
  if (!serverUp) {
    console.error("hud_dom_probe: vite preview kam nicht hoch (dist/ gebaut? npx vite build) — uebersprungen");
    process.exit(4);
  }
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PW_CHROME || undefined,
    args: ["--use-gl=swiftshader", "--no-sandbox"],
  });
  for (const fac of FACTIONS) {
    const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    // Google-Fonts abbrechen (sonst haengt load), wie hud_browser.mjs
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await page.goto(`http://localhost:${PORT}/?faction=${fac}&renderer=canvas`, {
      waitUntil: "networkidle",
      timeout: 30000,
    });
    await page.waitForSelector("#hud .panel", { timeout: 15000 });
    const dom = await page.evaluate(probeInPage, fac);
    writeFileSync(`${GATE_DIR}/dom_${fac}.json`, JSON.stringify(dom, null, 2));
    console.log(`hud_dom_probe: ${GATE_DIR}/dom_${fac}.json geschrieben`);
    await ctx.close();
  }
} catch (e) {
  console.error("hud_dom_probe: Fehler —", e && e.message ? e.message : e);
  exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  try { server.kill("SIGTERM"); } catch { /* egal */ }
}
process.exit(exitCode);
