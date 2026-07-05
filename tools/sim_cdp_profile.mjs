// sim_cdp_profile.mjs — Profilt den VOLLEN browser-gebundenen Sim-Tick (stepSim
// mit Combat/AI/Vision/FoW), den dyn_smoke.mjs fahrbar macht, ueber den Chrome
// DevTools Protocol Profiler. ANTI-MODERAT: Playwright/Chromium ist schon da,
// kein neues Tool noetig -- der CPU-Profiler kommt per CDP-Session (Profiler.start).
// So messen wir die heissesten Funktionen des ECHTEN, vollstaendigen Sim-Kerns
// (nicht nur des node-direkten Bewegungs-Subsets).
//
//   node tools/sim_cdp_profile.mjs [N] [K]
//
// Voraussetzung: npm run build (dist/). Schreibt /tmp/sim_cpu.cpuprofile + Top-Liste.

import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const N = Number(process.argv[2] || 1000);
const K = Number(process.argv[3] || 1500);
const PORT = Number(process.env.DYN_PORT || 4188);
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
      } catch {}
      if (++tries > 80) return reject(new Error("vite preview kam nicht hoch"));
      setTimeout(tick, 250);
    };
    tick();
  });
}

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
  await page.goto(BASE + "/?renderer=canvas", { waitUntil: "load" });
  await page.waitForFunction(() => !!window.__sim && !!window.__game, { timeout: 30000 });

  // Lastszenario aufbauen: N Kampfeinheiten kartenweit gestreut + Marsch.
  await page.evaluate(
    ({ N }) => {
      const sim = window.__sim;
      sim.setDriven(true);
      sim.clear();
      sim.setSeed(1);
      for (let i = 0; i < N; i++) {
        const col = 1 + ((i * 7) % 34);
        const row = 1 + ((i * 13) % 34);
        sim.spawn("spieler", "apotheker", col, row);
      }
      sim.march("spieler", 3, 3);
      for (let w = 0; w < 5; w++) sim.step(1); // warmup
    },
    { N },
  );

  // CDP-Profiler an der Seiten-Session starten.
  const client = await page.context().newCDPSession(page);
  await client.send("Profiler.enable");
  await client.send("Profiler.setSamplingInterval", { interval: 200 }); // us
  await client.send("Profiler.start");

  // K volle Sim-Ticks treiben + Frame-ms sammeln.
  const stat = await page.evaluate(
    ({ K }) => {
      const sim = window.__sim;
      const ms = [];
      for (let s = 0; s < K; s++) {
        sim.step(1);
        ms.push(sim.stats().lastFrameMs);
      }
      const sorted = [...ms].sort((a, b) => a - b);
      const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
      return {
        median: q(0.5),
        p95: q(0.95),
        max: sorted[sorted.length - 1],
        units: sim.stats().total,
        avoidMs: sim.stats().avoidMs,
        fowMs: sim.stats().fowMs,
      };
    },
    { K },
  );

  const { profile } = await client.send("Profiler.stop");
  await browser.close();
  preview.kill();

  writeFileSync("/tmp/sim_cpu.cpuprofile", JSON.stringify(profile));

  // Self-Time je Funktion aus dem CDP-Profil aggregieren.
  const nodeById = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  for (const s of profile.samples) {
    const n = nodeById.get(s);
    if (!n) continue;
    const cf = n.callFrame;
    const file = (cf.url || "").split("/").pop() || "?";
    const name = `${cf.functionName || "(anon)"} @ ${file}:${cf.lineNumber + 1}`;
    self.set(name, (self.get(name) || 0) + 1);
  }
  const total = profile.samples.length || 1;
  const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);

  console.log(`\n=== VOLLER Sim-Tick (Browser, stepSim mit Combat/AI/Vision/FoW) @ N=${stat.units} ===`);
  console.log(
    `Frame-ms (lastSimMs): median=${stat.median.toFixed(2)} p95=${stat.p95.toFixed(2)} max=${stat.max.toFixed(2)} | avoidMs=${stat.avoidMs.toFixed(2)} fowMs=${stat.fowMs.toFixed(2)} | budget33.3=${stat.median <= 33.3 ? "OK" : "REISST"}`,
  );
  console.log(`\nTop self-time Funktionen (CDP-CPU-Profil, ${total} Samples):`);
  for (const [name, n] of top) {
    console.log(`${((100 * n) / total).toFixed(1).padStart(5)}%  ${String(n).padStart(5)}  ${name.slice(0, 88)}`);
  }
}

main().catch((e) => {
  console.error("ABBRUCH:", e.stack || e.message);
  process.exit(1);
});
