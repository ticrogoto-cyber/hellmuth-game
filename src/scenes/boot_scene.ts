import Phaser from "phaser";

/**
 * BootScene: minimaler Einstieg. Hier wuerden spaeter globale Registry-Werte
 * oder Lade-Konfiguration gesetzt. Aktuell nur Weiterleitung zur PreloadScene.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  create(): void {
    this.scene.start("preload");
  }
}
