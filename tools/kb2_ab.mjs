// kb2_ab.mjs -- A/B-Beweis Code7-2: Knockback im Live-Sim verdrahtet.
// Strategie: EIN Build (Nachher). VORHER wird per Runtime-Rueckstellung
// simuliert (unit.knockbackMs=0 + kbVel=0 erzwingen, indem wir das
// Knockback-System pruefen und dann die Positionsdelta messen).
// Muster: tempo_ab.mjs.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
const PORT = 4187, BASE = `http://localhost:${PORT}`;
function startPreview() {
  const p = spawn("npx", ["vite","preview","--port",String(PORT),"--strictPort"], { cwd: process.cwd(), stdio: "pipe" });
  return new Promise((res, rej) => { let tries=0; const tick=async()=>{
    try { const r=await fetch(BASE+"/"); if(r.ok) return res(p); } catch{}
    if(++tries>80) return rej(new Error("vite preview kam nicht hoch"));
    setTimeout(tick,250); }; tick(); });
}
mkdirSync("proof/kb2", { recursive: true });
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

// --- A) Knockback-Nahkampf-Test: Hellmuth (heavy) trifft einen Apotheker.
//   VORHER: KnockbackSystem ist inaktiv (wir setzen kbVel*=0 in der Naht).
//   NACHHER: Knockback verdrahtet -- target sollte messbar weggeschoben werden.
async function nahkampfTest(label, killKnockback) {
  const trace = await page.evaluate(({ killKnockback }) => {
    const sim = window.__sim, gs = window.__game.registry.get("gameState");
    const scene = window.__game.scene.getScene("game");
    // Instrumentiere explode() (fuer Zaehl-Beweis) und - bei VORHER - No-Op.
    const kb = scene.knockback;
    kb.__origExplode = kb.__origExplode ?? kb.explode.bind(kb);
    let explodeCount = 0;
    if (killKnockback) {
      kb.explode = () => { explodeCount++; };
    } else {
      kb.explode = (spec) => { explodeCount++; kb.__origExplode(spec); };
    }
    sim.setDriven(true); sim.clear(); sim.setSeed(77);
    sim.spawn("spieler", "hellmuth", 15, 15);
    sim.spawn("gegner", "apotheker", 16, 15);
    const att = gs.units.find(u => u.owner === "spieler");
    const tgt = gs.units.find(u => u.owner === "gegner");
    tgt.hp = 1e9;
    tgt.moveState = "halten"; tgt.fireState = "feuerhalten"; tgt.attackTarget = undefined;
    tgt.reevalMs = 1e9;
    att.attackTarget = tgt; att.fireState = "frei"; att.reevalMs = 1e9;
    // Warten bis attacker in Reichweite ist und ein paar Ticks laufen lassen,
    // damit die Kampfschleife stabil ist. Dann die Basis-Position fixieren.
    for (let s = 0; s < 8; s++) sim.step(1);
    const baseX = tgt.x, baseY = tgt.y;
    // Nun: pro Tick TARGET-Position VOR sim.step auf Basis zuruecksetzen.
    // Nach step ist der Delta ausschliesslich Knockback-Effekt (movement wuerde
    // ihn auf Basis geklemmt bewegen, aber das ist minimal wenn moveState=halten
    // greift). knockbackMs/kbVelX werden pro Tick gemessen.
    const stepsLog = [];
    let maxKnockbackMsSeen = 0;
    let maxAbsPush = 0;
    for (let s = 1; s <= 120; s++) {
      tgt.setWorld(baseX, baseY);
      tgt.kbVelX = 0; tgt.kbVelY = 0; tgt.kbRemainingPx = 0; tgt.knockbackMs = 0;
      sim.step(1);
      const dx = tgt.x - baseX, dy = tgt.y - baseY;
      const push = Math.hypot(dx, dy);
      if (push > maxAbsPush) maxAbsPush = push;
      if (tgt.knockbackMs > maxKnockbackMsSeen) maxKnockbackMsSeen = tgt.knockbackMs;
      if (s % 10 === 0) stepsLog.push({
        s, dx: Math.round(dx*10)/10, dy: Math.round(dy*10)/10,
        push: Math.round(push*10)/10, kbVelX: Math.round(tgt.kbVelX),
        knockbackMs: Math.round(tgt.knockbackMs), explodes: explodeCount,
      });
    }
    return { baseX: Math.round(baseX), baseY: Math.round(baseY), stepsLog,
             maxKnockbackMsSeen: Math.round(maxKnockbackMsSeen),
             maxAbsPush: Math.round(maxAbsPush*10)/10, explodeCount };
  }, { killKnockback });
  // Kamera einstellen und Screenshot
  await page.evaluate(() => {
    const scene = window.__game.scene.getScene("game");
    const gs = window.__game.registry.get("gameState");
    const cam = scene.cameras.main;
    const u = gs.units[0];
    cam.setZoom(2.2); cam.centerOn(u.x + 40, u.y);
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `proof/kb2/${label}_nahkampf.png` });
  return trace;
}
out.nahkampf_vorher = await nahkampfTest("vorher", true);
out.nahkampf_nachher = await nahkampfTest("nachher", false);

// Zusatz: Peak-Frame direkt nach dem ersten Nahkampf-Schlag, VORHER vs NACHHER.
// Ziel: den Push visuell sichtbar machen (der Sample-Screenshot des Test-Loops
// zeigt einen Endzustand, keinen Peak).
async function peakShot(label, killKnockback) {
  await page.evaluate(({ killKnockback }) => {
    const sim = window.__sim, gs = window.__game.registry.get("gameState");
    const scene = window.__game.scene.getScene("game");
    const kb = scene.knockback;
    if (kb.__origExplode) kb.explode = kb.__origExplode; // restore
    if (killKnockback) kb.explode = () => {};
    sim.setDriven(true); sim.clear(); sim.setSeed(77);
    sim.spawn("spieler", "hellmuth", 15, 15);
    sim.spawn("gegner", "apotheker", 16, 15);
    const att = gs.units.find(u => u.owner === "spieler");
    const tgt = gs.units.find(u => u.owner === "gegner");
    tgt.hp = 1e9;
    att.attackTarget = tgt; att.fireState = "frei"; att.reevalMs = 1e9;
    // Bis in Reichweite laufen + ersten Schlag ausloesen
    for (let s = 0; s < 20; s++) sim.step(1);
    const cam = scene.cameras.main;
    cam.setZoom(2.4); cam.centerOn(att.x + 40, att.y + 30);
  }, { killKnockback });
  await page.waitForTimeout(160);
  await page.screenshot({ path: `proof/kb2/${label}_peak.png` });
}
await peakShot("vorher", true);
await peakShot("nachher", false);
console.log("VORHER:", JSON.stringify(out.nahkampf_vorher));
console.log("NACHHER:", JSON.stringify(out.nahkampf_nachher));

// --- B) Bench-Regression: der KB-Kern-Smoke muss weiter GRUEN sein.
//   (Wird ausserhalb dieses Skripts durch werkzeuge_check.py belegt.)

writeFileSync("proof/kb2/messwerte.json", JSON.stringify(out, null, 2));
let red = 0;
const checks = [];
const want = (name, ok, got) => { if (!ok) red++; checks.push([name, ok, got]); };
// Baseline aus VORHER (combat-getriebene Selbstverteidigung ~6.4 px) muss
// im NACHHER klar ueberboten werden. pushDelta = NACHHER - VORHER Baseline.
const pushDelta = out.nahkampf_nachher.maxAbsPush - out.nahkampf_vorher.maxAbsPush;
out.pushDelta = Math.round(pushDelta * 10) / 10;
out.push_ratio = out.nahkampf_vorher.maxAbsPush > 0
  ? Math.round((out.nahkampf_nachher.maxAbsPush / out.nahkampf_vorher.maxAbsPush) * 10) / 10 : null;

want("Naht 1 (Trigger): NACHHER ruft knockback.explode", out.nahkampf_nachher.explodeCount > 0, `${out.nahkampf_nachher.explodeCount} Aufrufe`);
want("Naht 1 (Trigger): VORHER ruft explode ebenso (Trigger unabhaengig vom Kill)", out.nahkampf_vorher.explodeCount > 0, `${out.nahkampf_vorher.explodeCount} Aufrufe`);
want("Naht 2 (Tick): NACHHER max Push je Tick > 30 px (Wirkung sichtbar)", out.nahkampf_nachher.maxAbsPush > 30, `${out.nahkampf_nachher.maxAbsPush} px`);
want("Wirkung vs Baseline: Push-Verhaeltnis >= 5x", out.push_ratio !== null && out.push_ratio >= 5, `${out.push_ratio}x (${out.nahkampf_nachher.maxAbsPush} vs ${out.nahkampf_vorher.maxAbsPush})`);
want("Wirkung isoliert: pushDelta > 30 px", pushDelta > 30, `+${out.pushDelta} px`);
want("VORHER-Baseline: kein Knockback (kbVel stets 0)", out.nahkampf_vorher.maxKnockbackMsSeen === 0, "keine Trauma-Aktivierung im vorher-Zustand");

console.log("\nKB-VERDRAHTUNG -- A/B-Gate:");
console.log("STATUS  PRUEFUNG                                            IST");
for (const [name, ok, got] of checks) console.log(`${ok ? "GRUEN " : "ROT   "}  ${String(name).padEnd(50)} ${got}`);
console.log(red === 0 ? "\nKB2-A/B-GATE: GRUEN" : `\nKB2-A/B-GATE: ROT (${red})`);

await browser.close(); preview.kill();
process.exit(red === 0 ? 0 : 1);
