// fx_wucht_proof.mjs — Sicht-Beleg fuer PHYSIK Welle 1 (Code7).
//   npm run build && PW_CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
//     node tools/fx_wucht_proof.mjs
// Feuert die drei umgestellten Effekte (Funken, Truemmer, Blut-Fontaene)
// nebeneinander und schiesst am Bewegungs-HOEHEPUNKT (~150 ms) und beim Setzen
// (~650 ms) -- die fx_browser-Modi kapern zu spaet (Renderer wach -> Bewegung
// schon vorbei). Belegt: Funken fallen/streaken, Chunks fliegen+prallen, Blut im
// Bogen + gerichtet. Reine Render-Schicht, keine Sim, kein Determinismus-Eingriff.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const PORT = Number(process.env.WUCHT_PORT || 4185);
const BASE = `http://localhost:${PORT}`;
const OUT = process.env.SHOT_DIR || process.env.FX_OUT || "/tmp/fx";
const VIEW = { width: 1280, height: 800 };

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
  throw new Error("vite preview kam nicht hoch (npm run build?)");
}

// Drei Saeulen ueber der eigenen Basis (garantiert aufgedeckter, heller Boden,
// weg vom HUD): links Funken, Mitte Truemmer, rechts Blut.
const FIRE = () => {
  const scene = window.__game.scene.getScene("game");
  const fx = scene.fx;
  const cam = scene.cameras.main;
  const gs = scene.registry.get("gameState");
  const anchor =
    gs.buildings.find((b) => b.owner === "spieler") || gs.units.find((u) => u.owner === "spieler") || cam.midPoint;
  cam.centerOn(anchor.x, anchor.y - 70);
  cam.setZoom(2.0);
  const c = cam.midPoint;
  const lx = c.x - 230;
  const mx = c.x;
  const rx = c.x + 230;
  const y = c.y - 40;
  // Funken: viele, schnell -> Streak sichtbar; sie POPpen hoch und fallen.
  fx.spawn("sparks", lx, y, { color: 0xffe79a, count: 64, speed: 210, scale: 2.0 });
  // Truemmer: Stahl (MODERAT) + Glas (HELLMUTH) -> Flug, Abprall, Rollen.
  scene.debris.throw(mx - 36, y, "moderat", 6);
  scene.debris.throw(mx + 36, y, "hellmuth", 6);
  // Blut-Fontaene, gerichtet: Angreifer rechts -> Spray nach links (MODERAT),
  // Angreifer links -> Spray nach rechts (HELLMUTH). ax/ay setzen das Heading.
  fx.spawn("blood_splash", rx, y, { faction: "moderat", ax: rx + 280, ay: y - 10, count: 26 });
  fx.spawn("blood_splash", rx, y - 90, { faction: "hellmuth", ax: rx - 280, ay: y - 100, count: 22 });
  return { lx, mx, rx, y, debris: scene.debris.stats() };
};

async function shot(page, name) {
  const ca = await page.$("#game-root canvas");
  if (ca) await ca.screenshot({ path: `${OUT}/${name}` });
  else await page.screenshot({ path: `${OUT}/${name}`, clip: { x: 0, y: 0, ...VIEW } });
  console.log("SHOT", `${OUT}/${name}`);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const preview = await startPreview();
  const browser = await chromium.launch({
    executablePath: process.env.PW_CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 2 });
  await page.route("**/*", (r) => (r.request().url().includes("fonts.g") ? r.abort() : r.continue()));
  page.on("pageerror", (e) => {
    if (!/decode audio data/i.test(e.message)) console.error("PAGEERR", e.message);
  });
  await page.goto(`${BASE}/?renderer=canvas`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => {
      const s = window.__game?.scene?.getScene?.("game");
      return !!(s && s.fx && s.debris);
    },
    { timeout: 20000 },
  );
  await page.waitForTimeout(1300); // Startaufstellung setteln

  console.log("FIRE", JSON.stringify(await page.evaluate(FIRE)));
  await page.waitForTimeout(240); // HOEHEPUNKT: Funken/Chunks/Blut gemeinsam in der Luft
  await shot(page, "fx_wucht_peak.png");
  console.log("PEAK", JSON.stringify(await page.evaluate(() => window.__game.scene.getScene("game").debris.stats())));
  await page.waitForTimeout(500); // ~740 ms: Funken landen, Chunks prallen/rollen
  await shot(page, "fx_wucht_land.png");
  console.log("LAND", JSON.stringify(await page.evaluate(() => window.__game.scene.getScene("game").debris.stats())));

  try {
    await browser.close();
  } catch {
    /* egal */
  }
  try {
    preview.kill("SIGKILL");
  } catch {
    /* egal */
  }
  process.exit(0); // erzwungen: kein haengendes Teardown
}

main().catch((e) => {
  console.error("ABBRUCH:", e.stack || e.message);
  process.exit(1);
});
