import Phaser from "phaser";
import { FxService } from "./fx_service";
import { registerPlaceholderFx } from "./placeholder_fx";
import { registerCoreFx } from "./core_handlers";
import { registerExplosionFx } from "./explosion";
import { registerBloodSplash } from "./blood_splash";
import { registerCorpsePulse } from "./corpse_pulse";
import { registerGroundMist } from "./ground_mist";
import { getDestilleDripSystem } from "./destille_drip";
import { getParasitDrainSystem } from "./parasit_drain";
import { getProductionGlowSystem } from "./production_glow";
import { getAuraRingSystem } from "./aura_ring";
import { getAmbientFx } from "./ambient_fx";
import { getTraumaCamera } from "./trauma_camera";
import { installBloom } from "../systems/fx";

export { FxService, FX_DEPTH_LIFT } from "./fx_service";
export { FxPool } from "./fx_pool";
export type { FxOpts, FxContext, FxHandler, FxDriver } from "./fx_types";

// Scene-lokale Bindung des Diensts (kein globaler Registry-Eintrag, GC-freundlich
// ueber WeakMap). Erlaubt getFx(scene)?.spawn(...) aus jedem System.
const services = new WeakMap<Phaser.Scene, FxService>();

/**
 * Haengt den Effekt-Dienst an eine Scene: erzeugt den Dienst, registriert den
 * neutralen Platzhalter-Handler, verdrahtet den per-Frame-Tick an das Scene-
 * UPDATE-Event und raeumt beim Shutdown auf. Minimaler Eingriff in geteilte
 * Dateien: ein einziger Aufruf in GameScene.create(), kein Code in update().
 * Idempotent.
 */
export function installFx(scene: Phaser.Scene): FxService {
  const existing = services.get(scene);
  if (existing) return existing;

  const fx = new FxService(scene);
  services.set(scene, fx);
  registerPlaceholderFx(fx);
  // Paket A: die drei Fundament-Techniken als erste Handler + ein Vollbild-Bloom-
  // Pass (S1, WebGL-only -- unter Canvas ein No-op).
  registerCoreFx(fx);
  // Paket C: Explosions-Komposit (nutzt Paket A + B).
  registerExplosionFx(fx);
  // Blut-Paket A: gerichtete Spritz-Fontaene.
  registerBloodSplash(fx);
  // Blut-Paket B: nachpulsende Leiche (USP).
  registerCorpsePulse(fx);
  // Strang 11: lokale Nebel-Partikel -- Handler registriert (Struktur final), aber
  // ohne Zonen-Emitter (GROUND_MIST.enabled=false) ein No-Op.
  registerGroundMist(fx);
  // Destillat-VFX: HELLMUTH-Drip (autonom auf EVT_DESTILLAT_PRODUCED) und
  // MODERAT-Parasit-Linie (auf EVT_DESTILLAT_DROPPED). Beide tickend self-
  // organisiert; SHUTDOWN-cleanup intern.
  getDestilleDripSystem(scene);
  getParasitDrainSystem(scene);
  // HELLMUTH-Produktions-Glow: additiver Sprite unter aktiver Destille,
  // pulsiert 0.4..0.7 mit 2 s Periode. Production-State wird aus Building-
  // Feldern abgeleitet (keine Parallel-State-Maschine).
  getProductionGlowSystem(scene);
  // Gefechts-VFX Paket 3: Gold-Auren-Ringe unter HELLMUTH-Einheiten auf dem
  // Boden-ADD-Band (AURA_FX_DEPTH); Puls deterministisch aus sin(simTick).
  getAuraRingSystem(scene);
  // Gefechts-VFX Paket 4: Ambient-Schicht (Schornstein-Rauch, Loop-Fueller,
  // 2 Nebel-TileSprites + 12 Wolken, Glow-Flackern) -- Budget D3, Mess-Bruecke
  // ueber getAmbientFx(scene).stats().
  getAmbientFx(scene);
  // Trauma-Kamera (Code7 Tempo-Kalibrierung Paket 2, Eiserloh-Kanon):
  // ersetzt Phaser cameras.main.shake -- weiches Value-Noise, trauma^2-Zerfall,
  // KEIN Rotations-Shake in Iso, klassenbasierte Zufuhr mit Deckel.
  getTraumaCamera(scene);
  installBloom(scene);

  const onUpdate = (time: number, delta: number): void => fx.tick(time, delta);
  scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
    services.delete(scene);
    fx.destroy();
    // Mess-Bruecken-Handle nicht als toten Zeiger auf den zerstoerten Dienst
    // stehen lassen (Scene-Restart-Hygiene).
    delete (scene as unknown as { fx?: FxService }).fx;
  });

  // Handle fuer die Headless-Mess-Bruecke (tools/fx_browser.mjs ruft
  // window.__game.scene.getScene("game").fx.spawn(...) ueber den Canvas-Renderer).
  (scene as unknown as { fx?: FxService }).fx = fx;
  return fx;
}

/** Zugriff auf den Dienst einer Scene (z. B. fuer den Tod-/Treffer-FX-Layer). */
export function getFx(scene: Phaser.Scene): FxService | undefined {
  return services.get(scene);
}
