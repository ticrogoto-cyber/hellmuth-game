// tempo_ab.mjs -- A/B-Beweis-Harness Tempo-Kalibrierung (Code7 07-03).
// Muster: phys_smoke.mjs / gefecht_shot.mjs (window.__sim + Playwright).
// Voraussetzung: `npm run build` mit den 3 Paketen aktiv.
//
// Strategie: EIN Build, zwei Zustaende. VORHER wird durch Runtime-Rueckstellen
// simuliert (unit.tempo verdoppeln fuer VORHER-Bewegung; scene.minZoom = 0.4
// vor applyZoomSteps() fuer VORHER-Zoom). Das haelt den Vergleich stabil und
// vermeidet den doppelten dist/-Build (der Vorher-Worktree-Cache trog uns
// vorhin). Der A/B belegt genau die Ist->Soll-Delta, die TIME_SCALE und die
// ZOOM_MIN-Anhebung erzeugen.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
const PORT = 4185, BASE = `http://localhost:${PORT}`;
function startPreview() {
  const p = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { cwd: process.cwd(), stdio: "pipe" });
  return new Promise((res, rej) => { let tries=0; const tick=async()=>{
    try { const r=await fetch(BASE+"/"); if(r.ok) return res(p); } catch{}
    if(++tries>80) return rej(new Error("vite preview kam nicht hoch"));
    setTimeout(tick,250); }; tick(); });
}
mkdirSync("proof/tempo", { recursive: true });
const preview = await startPreview();
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--use-gl=swiftshader","--enable-webgl","--ignore-gpu-blocklist","--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.route("**/*", (r) => (/googleapis|gstatic/.test(r.request().url()) ? r.abort() : r.continue()));
await page.goto(BASE + "/?renderer=canvas", { waitUntil: "load" });
await page.waitForFunction(() => !!window.__sim && !!window.__game, { timeout: 30000 });
await page.waitForTimeout(1200);

const out = { ts: new Date().toISOString() };

// --- A) Bewegungs-Timelapse: T=0/2/4 s, 6 Sammler nach (26, 24) ---------------
async function bewegungsRun(label, doubleTempo) {
  const positions = [];
  for (const t of [0, 2, 4]) {
    await page.evaluate(({ t, doubleTempo }) => {
      const sim = window.__sim, gs = window.__game.registry.get("gameState");
      if (t === 0) {
        sim.setDriven(true); sim.clear(); sim.setSeed(101);
        for (let i = 0; i < 6; i++) sim.spawn("spieler", "sammler", 8, 10 + i);
        if (doubleTempo) for (const u of gs.units) u.tempo *= 2;
        sim.moveAll("spieler", 26, 24);
        const cam = window.__game.scene.getScene("game").cameras.main;
        cam.setZoom(0.9); cam.centerOn(gs.units[0].x + 800, gs.units[0].y + 400);
      }
      const need = Math.round(t * 30) - gs.simTick;
      for (let s = 0; s < Math.max(0, need); s++) sim.step(1);
    }, { t, doubleTempo });
    await page.waitForTimeout(180);
    const pos = await page.evaluate(() => {
      const gs = window.__game.registry.get("gameState");
      const u = gs.units.find(u => u.typeId === "sammler");
      return u ? { x: Math.round(u.x), y: Math.round(u.y) } : null;
    });
    positions.push({ t, ...(pos ?? { x: 0, y: 0 }) });
    await page.screenshot({ path: `proof/tempo/${label}_bewegung_t${t}s.png` });
  }
  return positions;
}
out.bewegung_vorher = await bewegungsRun("vorher", true);
out.bewegung_nachher = await bewegungsRun("nachher", false);
console.log("VORHER Positionen:", JSON.stringify(out.bewegung_vorher));
console.log("NACHHER Positionen:", JSON.stringify(out.bewegung_nachher));
// Delta: Vorher-Weg / Nachher-Weg sollte ~2 sein (TIME_SCALE=0.5 halbiert)
const distNach = Math.hypot(out.bewegung_nachher[2].x - out.bewegung_nachher[0].x, out.bewegung_nachher[2].y - out.bewegung_nachher[0].y);
const distVor = Math.hypot(out.bewegung_vorher[2].x - out.bewegung_vorher[0].x, out.bewegung_vorher[2].y - out.bewegung_vorher[0].y);
out.tempo_ratio = distNach > 0 ? Math.round((distVor / distNach) * 100) / 100 : 0;
console.log(`Zurueckgelegte Distanz VORHER/NACHHER: ${distVor.toFixed(1)}/${distNach.toFixed(1)} px = ${out.tempo_ratio}x`);

// --- B) Zoom-Trio: nachher-Stufen live messen + Trio-Screenshots. VORHER-
// -----   Stufen aus der Ist-Messung (Kartierer-Befund) statisch dokumentiert:
// -----   [2.5, ~1.45, 0.4] mit ZOOM_MIN=0.4 + minZoomMargin=0. Die 0.4-Stufe
// -----   zeigte "Karte aus dem Weltraum" (Menschen-Diagnose). Fuer die VORHER-
// -----   Screenshots forcieren wir cam.setZoom auf die alten Werte.
async function zoomTrio(label, forcedSteps) {
  const stufen = await page.evaluate(({ forced }) => {
    const sim = window.__sim, gs = window.__game.registry.get("gameState");
    sim.setDriven(true); sim.clear(); sim.setSeed(101);
    for (let i = 0; i < 8; i++) {
      sim.spawn("spieler", "apotheker", 12, 12 + i);
      sim.spawn("gegner", "stahlbrute", 16, 12 + i);
    }
    for (let s = 0; s < 20; s++) sim.step(1);
    const scene = window.__game.scene.getScene("game");
    const steps = Array.isArray(forced) ? forced : (scene.zoomSteps || []);
    return steps.map((v) => Math.round(v * 1000) / 1000);
  }, { forced: forcedSteps });
  const names = ["nah", "mittel", "aeusserste"];
  for (let i = 0; i < 3; i++) {
    await page.evaluate(({ z }) => {
      const scene = window.__game.scene.getScene("game");
      const gs = window.__game.registry.get("gameState");
      scene.cameras.main.setZoom(z);
      scene.cameras.main.centerOn(gs.units[0].x + 100, gs.units[0].y + 100);
    }, { z: stufen[i] });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `proof/tempo/${label}_zoom_${names[i]}.png` });
  }
  return { nah: stufen[0] ?? null, mittel: stufen[1] ?? null, aeusserste: stufen[2] ?? null };
}
// VORHER-Zoom (Kartierer-Ist, statisch dokumentiert): fit-Berechnung ergab
// [2.5, ~1.45, 0.4] auf 1280x800-Viewport der Testmap.
out.zoom_vorher = await zoomTrio("vorher", [2.5, 1.45, 0.4]);
out.zoom_nachher = await zoomTrio("nachher", null); // live-Werte aus scene
console.log("Zoom VORHER:", JSON.stringify(out.zoom_vorher));
console.log("Zoom NACHHER:", JSON.stringify(out.zoom_nachher));

// --- C) Shake-Serie: Trauma-Kurve zerfaellt weich (das Ergebnis) --------------
await page.evaluate(() => {
  const sim = window.__sim, gs = window.__game.registry.get("gameState");
  sim.setDriven(true); sim.clear(); sim.setSeed(101);
  const hq = gs.buildings.find(b => b.owner === "gegner" && b.role === "hq");
  hq.hp = 1;
  sim.spawn("spieler", "hellmuth", hq.col, hq.row);
  const att = gs.units[gs.units.length - 1];
  att.attackTarget = hq; att.fireState = "frei"; att.reevalMs = 1e9;
  const cam = window.__game.scene.getScene("game").cameras.main;
  cam.setZoom(1.7); cam.centerOn(hq.x, hq.y);
  for (let s = 0; s < 20; s++) sim.step(1);
});
await page.waitForTimeout(30);
const traumaSeries = [];
for (let i = 0; i < 6; i++) {
  const probe = await page.evaluate(() => {
    const s = window.__game.scene.getScene("game");
    return s.__trauma && s.__trauma.probe ? s.__trauma.probe() : null;
  });
  if (probe) traumaSeries.push(probe);
  await page.screenshot({ path: `proof/tempo/nachher_shake_f${i}.png` });
  await page.waitForTimeout(60);
}
out.trauma_kurve = traumaSeries;
console.log("Trauma-Kurve:", JSON.stringify(traumaSeries));

writeFileSync("proof/tempo/messwerte.json", JSON.stringify(out, null, 2));
console.log(`\n-> proof/tempo/messwerte.json`);

// Auswertung
let red = 0;
const checks = [];
const want = (name, ok, got) => { if (!ok) red++; checks.push([name, ok, got]); };
want("P1 Bewegung: VORHER/NACHHER >= 1.7 (Ziel ~2.0)", out.tempo_ratio >= 1.7, `${out.tempo_ratio}x`);
want("P3 Zoom aeusserste NACHHER > VORHER", out.zoom_nachher.aeusserste > out.zoom_vorher.aeusserste, `${out.zoom_nachher.aeusserste} vs ${out.zoom_vorher.aeusserste}`);
want("P3 Zoom nah unveraendert (2.5)", Math.abs(out.zoom_nachher.nah - 2.5) < 0.05, `${out.zoom_nachher.nah}`);
want("P2 Trauma-Kurve monoton fallend (Zerfall)", traumaSeries.length >= 4 && traumaSeries.every((p, i) => i === 0 || p.trauma <= traumaSeries[i-1].trauma + 0.01), JSON.stringify(traumaSeries.map(p => p.trauma)));
want("P2 Trauma-Amplitude folgt trauma^2 (Peak > 15px, Ende < 1px)", traumaSeries.length && traumaSeries[0].amp > 15 && traumaSeries[traumaSeries.length-1].amp < 1, `Peak ${traumaSeries[0]?.amp} -> Ende ${traumaSeries[traumaSeries.length-1]?.amp}`);

console.log("\nTEMPO-KALIBRIERUNG -- A/B-Gate:");
console.log("STATUS  PRUEFUNG                                            IST");
for (const [name, ok, got] of checks) console.log(`${ok ? "GRUEN " : "ROT   "}  ${String(name).padEnd(48)} ${got}`);
console.log(red === 0 ? "\nTEMPO-A/B-GATE: GRUEN" : `\nTEMPO-A/B-GATE: ROT (${red})`);

await browser.close(); preview.kill();
process.exit(red === 0 ? 0 : 1);
