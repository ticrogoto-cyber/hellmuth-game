// Editor-Einstieg (?editor=1). Eigene, schlanke Phaser-Konfiguration: NUR die
// Editor-Szene, kein Spiel-HUD, keine Spielsysteme. Beruehrt keine HUD-Dateien.
// Headless-Gate erzwingt den Canvas-Renderer (?renderer=canvas), damit
// Screenshots das echte Bild zeigen.

import Phaser from "phaser";
import { EditorScene } from "./editor_scene";
import { mountEditorUi } from "./editor_ui";
import { runRoundtripCheck } from "../maps/roundtrip_check";

export function startEditor(): void {
  const params = new URLSearchParams(location.search);
  const forceCanvas = params.get("renderer") === "canvas";
  const config: Phaser.Types.Core.GameConfig = {
    type: forceCanvas ? Phaser.CANVAS : Phaser.AUTO,
    parent: "game-root",
    backgroundColor: "#15171a",
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: "100%",
      height: "100%",
    },
    render: { pixelArt: false, antialias: true },
    scene: [EditorScene],
  };
  const game = new Phaser.Game(config);
  (window as unknown as { __game: Phaser.Game }).__game = game;
  // Roundtrip-Pruefstand fuer die Headless-Harness (Strang-6-Beleg).
  (window as unknown as { __roundtrip: typeof runRoundtripCheck }).__roundtrip = runRoundtripCheck;
  // HTML-Werkzeugleiste (eigene Datei + eigenes CSS, kein HUD-Import).
  mountEditorUi(game);
}
