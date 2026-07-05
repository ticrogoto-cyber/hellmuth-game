import Phaser from "phaser";
import { BootScene } from "./scenes/boot_scene";
import { PreloadScene } from "./scenes/preload_scene";
import { GameScene } from "./scenes/game_scene";
import { HudScene } from "./ui/hud_scene";
import { HtmlHud } from "./ui/html_hud";
import { mountSpecOverlay } from "./ui/spec_overlay";
import type { FactionId } from "./data/loader";
import { AudioManager } from "./audio/audio_manager";
import { loadAudioManifest } from "./audio/audio_manifest";
import { createAudioBackend } from "./audio/audio_backend";
import { bufferAusCache } from "./audio/audio_preload";
import { aktiveSprache } from "./audio/audio_lang";
import { mountAudioDev } from "./audio/audio_dev";

// Editor-Modus (?editor=1): eigener Einstieg unter src/editor/. Das Spiel-/HUD-
// Setup darunter wird komplett uebersprungen. Bewusst minimaler Eingriff in der
// einzigen von beiden Instanzen geteilten Datei (Briefing §3): nur diese Abfrage,
// der Rest bleibt unveraendert im else-Zweig.
if (new URLSearchParams(location.search).get("editor") === "1") {
  void import("./editor/editor_main").then((m) => m.startEditor());
} else {
// Einstiegspunkt von HELLMUTH. Konfiguriert Phaser, fuellt den Viewport und
// startet die Scene-Kette: boot -> preload -> game.
// Headless-Screenshots (?renderer=canvas) nutzen den CANVAS-Renderer; das
// WebGL-Framebuffer-Capturing in Headless-Chromium ist instabil. Im Spiel bleibt
// AUTO (WebGL bevorzugt).
const forceCanvas = new URLSearchParams(location.search).get("renderer") === "canvas";
const config: Phaser.Types.Core.GameConfig = {
  type: forceCanvas ? Phaser.CANVAS : Phaser.AUTO,
  parent: "game-root",
  backgroundColor: "#0c0d10",
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: "100%",
    height: "100%",
  },
  render: {
    pixelArt: false,
    antialias: true,
  },
  scene: [BootScene, PreloadScene, GameScene, HudScene],
};

const game = new Phaser.Game(config);
// Unsichtbarer Handle fuer die Headless-Screenshot-Harness (kein sichtbares
// Debug-Element). Erlaubt der Harness, eine Auswahl/Inspektion zu setzen.
(window as unknown as { __game: Phaser.Game }).__game = game;

// Audio-Engine-Rueckgrat. Backend = Phaser-WebAudioSoundManager-Context (die
// getroffene Entscheidung), roher WebAudio als V2-Notausgang. Erst nach dem
// Game-READY ist Phasers Sound-Context da; darum verzoegert initialisiert. Auf
// der Registry, damit Scenes den Bus-Hook ziehen (game_scene). KEINE Live-API.
const initAudio = (): void => {
  const audioManifest = loadAudioManifest();
  const audio = new AudioManager(audioManifest, {
    backend: createAudioBackend(game),
    sprache: aktiveSprache(audioManifest.standardSprache),
  });
  audio.setBufferProvider((stem) => bufferAusCache(game, stem));
  game.registry.set("audio", audio);
  // Audiokontext erst auf einer Nutzergeste entsperren (Autoplay-Politik).
  const entsperreAudio = (): void => {
    audio.resume();
    window.removeEventListener("pointerdown", entsperreAudio);
    window.removeEventListener("keydown", entsperreAudio);
  };
  window.addEventListener("pointerdown", entsperreAudio);
  window.addEventListener("keydown", entsperreAudio);
  // Audio-Mess-Bruecke (?audio-debug=1): Verdrahtung hoerbar pruefen.
  if (new URLSearchParams(location.search).get("audio-debug") === "1") {
    mountAudioDev(audio, game);
  }
};
if (game.isBooted) initAudio();
else game.events.once(Phaser.Core.Events.READY, initAudio);

// HTML/CSS-HUD-Overlay (§7). Skin per ?faction=moderat testbar; Default hellmuth.
// Gerueststufe: Layout + Maßstab; Live-Werte/Befehlsraster folgen.
const faction: FactionId =
  new URLSearchParams(location.search).get("faction") === "moderat" ? "moderat" : "hellmuth";
const htmlHud = new HtmlHud();
htmlHud.mount(faction, game); // V3-HUD nach docs/hud-spec.md; game = Live-Befehlsraster (H6)
// Auswahlzustand testbar: ?select=multi
htmlHud.setSelection(
  new URLSearchParams(location.search).get("select") === "multi" ? "multi" : "single",
);

// Spec-Overlay (?speclines=1): zeichnet jede hud-spec.md-Zahl als Kontur.
mountSpecOverlay(faction);

// Florilegium-UI (Code2): eigener DOM-Stamm `#florilegium`, eigene CSS-Datei,
// kein Eingriff in #hud. Lazy-Mount; geoeffnet ueber Tastatur (J), das
// Hauptmenue oder URL (?florilegium=1[&entry=<id>]) -- letzteres ist die
// Bruecke fuer den Headless-UI-Validator H24 (tools/florilegium_ui_check.py).
void import("./ui/florilegium_ui").then(({ mountFlorilegium }) => {
  const flo = mountFlorilegium({ lang: "de", mode: "fullview" });
  (window as unknown as { __florilegium: ReturnType<typeof mountFlorilegium> }).__florilegium = flo;
  window.addEventListener("keydown", (e) => {
    if (e.key === "j" || e.key === "J") {
      e.preventDefault();
      flo.toggle("overlay");
    }
  });
  const qs = new URLSearchParams(location.search);
  const directFlorilegium = qs.get("florilegium") === "1";
  if (directFlorilegium) {
    const mode = qs.get("flomode") === "overlay" ? "overlay" : "fullview";
    flo.open(mode, qs.get("entry") || undefined);
  }

  // Menue-Familie (Code2): eigener DOM-Stamm `#hellmuth-menu` (z-index ueber
  // HUD und Florilegium). Vordertuer vor jedem Spielstart. Bypass fuer die
  // Headless-Harnesses, die die Spielflaeche/HUD direkt vermessen
  // (?renderer=canvas) und fuer den direkten Florilegium-Aufruf; `?menu=1`
  // erzwingt das Menue (H25-Screenshot). Skirmish-Start ist im Geruest ein
  // klar markierter Stub: dismisst das Menue und meldet die Parameter.
  void import("./menu").then(({ mountMenu }) => {
    const forceMenu = qs.get("menu") === "1";
    const headlessCanvas = qs.get("renderer") === "canvas";
    const router = mountMenu({
      florilegium: {
        open: (mode) => flo.open(mode),
        close: () => flo.close(),
        onClose: (cb) => flo.onClose(cb),
      },
      game: {
        start: (params) => {
          // STUB: echte Spiel-Init mit Fraktion/Karte/Schwierigkeit folgt.
          // Das Spiel laeuft bereits unter dem Menue; Dismiss macht es sichtbar.
          try {
            localStorage.setItem("hellmuth_skirmish_v1", JSON.stringify(params));
          } catch { /* still */ }
          window.dispatchEvent(new CustomEvent("skirmish:start", { detail: params }));
          console.info("[menu] Skirmish-Start (Geruest-Stub):", params);
        },
      },
    });
    (window as unknown as { __menu: ReturnType<typeof mountMenu> }).__menu = router;
    if (forceMenu || (!headlessCanvas && !directFlorilegium)) {
      router.start();
    }
  });
});
}
