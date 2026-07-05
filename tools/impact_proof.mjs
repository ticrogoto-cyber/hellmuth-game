// impact_proof.mjs — Beleg fuer PHYSIK Welle 2 (Code7): §6 Blutrichtung + §7
// gestaffelter lokaler Hit-Stop.
//   npm run build && PW_CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
//     node tools/impact_proof.mjs
//
// §6 (Render): zwei gerichtete Spritzer -> Kegel zeigt vom Angreifer weg.
// §7 (Verhalten, sim-getrieben): ein synthetischer fx.unit_hit auf eine
//    animierende Einheit; schwerer Treffer FRIERT den Frame (Hit-Stop), leichter
//    laeuft glatt durch. Belegt die Verdrahtung hitStopStruck isoliert; den
//    Kampf->Event-Pfad deckt phys_smoke (A1) ab. LOKAL pro Sprite, kein Sim-
//    Eingriff -> dyn_smoke-Hash bleibt bit-identisch.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const PORT = Number(process.env.IMPACT_PORT || 4186);
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

// §6: zwei gerichtete Blut-Fontaenen auf OFFENEM Boden (Marker-Einheit auf freier
// Kachel, kein Gebaeude im Bild) -> Kegel zeigt vom (off-screen) Angreifer weg.
const FIRE_BLOOD = () => {
  const sim = window.__sim;
  const scene = window.__game.scene.getScene("game");
  const fx = scene.fx;
  const cam = scene.cameras.main;
  const gs = scene.registry.get("gameState");
  sim.setDriven(true);
  sim.clear();
  sim.setSeed(3);
  sim.spawn("spieler", "apotheker", 20, 20); // Marker auf offenem Boden
  for (let s = 0; s < 16; s++) sim.step(1); // Sicht des Markers deckt den Nebel lokal auf
  const u = gs.units[gs.units.length - 1];
  const wx = u ? u.x : cam.midPoint.x;
  const wy = u ? u.y : cam.midPoint.y;
  cam.centerOn(wx, wy + 90); // Feuerlinie in die obere Bildhaelfte (offener Boden, weg vom HUD)
  cam.setZoom(2.0);
  // Angreifer WEIT links -> Spray nach RECHTS (HELLMUTH, dunkelrot).
  fx.spawn("blood_splash", wx - 165, wy, { faction: "hellmuth", ax: wx - 600, ay: wy, count: 34 });
  // KEIN ax/ay -> Degradation nach OBEN (Kontrast: so sah es vorher immer aus).
  fx.spawn("blood_splash", wx, wy + 8, { faction: "hellmuth", count: 30 });
  // Angreifer WEIT rechts -> Spray nach LINKS (MODERAT, magenta).
  fx.spawn("blood_splash", wx + 165, wy, { faction: "moderat", ax: wx + 600, ay: wy, count: 34 });
  return { wx, wy };
};

// §7: synthetischer Treffer auf eine animierende Einheit; misst die Frame-Folge.
function runHitStopWiring({ sev, seed }) {
  const sim = window.__sim;
  const scene = window.__game.scene.getScene("game");
  const gs = window.__game.registry.get("gameState");
  sim.setDriven(true);
  sim.clear();
  sim.setSeed(seed);
  sim.spawn("spieler", "hellmuth", 10, 10); // Opfer: hat Attack-Clip -> animiert
  sim.spawn("gegner", "stahlbrute", 11, 10); // Dummy-Ziel (unsterblich) -> Opfer bleibt im Attack-Clip
  const victim = gs.units.find((u) => u.owner === "spieler");
  const dummy = gs.units.find((u) => u.owner === "gegner");
  if (!victim || !dummy) return { skipped: true, why: "spawn" };
  victim.hp = 1e9;
  dummy.hp = 1e9; // niemand stirbt; das Opfer wird NICHT real getroffen
  if (!victim.attackHasHitFrame()) return { skipped: true, why: "kein Attack-Clip (Atlas?)" };
  for (let s = 0; s < 8; s++) sim.step(1); // in den Attack-Clip laufen
  const f0 = victim.currentFrame();
  // SYNTHETISCHER Treffer am Opfer (testet hitStopStruck isoliert vom Kampf-RNG).
  scene.events.emit("fx.unit_hit", { x: victim.x, y: victim.y, faction: victim.faction, sev });
  const seq = [];
  for (let s = 0; s < 6; s++) {
    sim.step(1);
    seq.push(victim.currentFrame());
  }
  // fuehrende Schritte, in denen der Frame auf f0 haelt = Freeze-Fenster.
  let held = 0;
  for (const f of seq) {
    if (f === f0) held++;
    else break;
  }
  return { skipped: false, sev, f0, seq, held, distinct: new Set(seq).size };
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
      return !!(s && s.fx && s.debris && window.__sim);
    },
    { timeout: 20000 },
  );
  await page.waitForTimeout(1300);

  // §6 zuerst (lebende Startaufstellung, vor sim.clear).
  console.log("BLOOD_DIR", JSON.stringify(await page.evaluate(FIRE_BLOOD)));
  await page.waitForTimeout(160); // Bogen-Hoehepunkt
  const ca = await page.$("#game-root canvas");
  if (ca) await ca.screenshot({ path: `${OUT}/impact_blood_dir.png` });
  console.log("SHOT", `${OUT}/impact_blood_dir.png`);

  // §7 Verhalten.
  const heavy = await page.evaluate(runHitStopWiring, { sev: "heavy", seed: 5 });
  const light = await page.evaluate(runHitStopWiring, { sev: "light", seed: 5 });

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

  let red = 0;
  const want = (name, ok, got) => {
    if (!ok) red++;
    console.log(`${ok ? "GRUEN " : "ROT   "}  ${name.padEnd(46)} ${got}`);
  };
  console.log("\nPHYSIK Welle 2 — §7 Hit-Stop (Verhalten):");
  if (heavy.skipped || light.skipped) {
    want("§7 Hit-Stop messbar", false, `uebersprungen: ${heavy.why || light.why}`);
  } else {
    want("§7 schwer FRIERT (Freeze haelt Frame >=2 Schritte)", heavy.held >= 2, `held=${heavy.held} seq=${JSON.stringify(heavy.seq)}`);
    want("§7 leicht laeuft GLATT (nur natuerl. Clip-Takt <=1)", light.held <= 1, `held=${light.held} seq=${JSON.stringify(light.seq)}`);
    want("§7 schwer haelt deutlich laenger als leicht", heavy.held >= light.held + 2, `schwer=${heavy.held} leicht=${light.held}`);
    want("§7 schwer LAEUFT WIEDER an (kein Dauer-Freeze)", heavy.distinct > 1, `distinct=${heavy.distinct}`);
  }
  console.log(`\nRohwerte:\n  heavy: ${JSON.stringify(heavy)}\n  light: ${JSON.stringify(light)}`);
  console.log(`\nIMPACT-PROOF: ${red === 0 ? "GRUEN" : `ROT (${red})`}`);
  process.exit(red === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ABBRUCH:", e.stack || e.message);
  process.exit(1);
});
