import Phaser from "phaser";

// HudScene — auf das Nötige reduziert. Das alte gezeichnete In-Game-HUD (obere
// Ressourcenleiste mit 5/5, Auswahlpanel, Kommandobuttons, Warteschlange, Pause-
// Button) ist ERSATZLOS deaktiviert: es existierte nicht in docs/hud-spec.md und
// kollidierte mit dem HTML/CSS-HUD (V3). Diese Scene zeichnet jetzt KEIN HUD mehr.
//
// Sie bleibt als duenner Helfer fuer die GameScene erhalten:
//   - containsPoint: Klickblock ueber den HUD-Flaechen, abgeleitet aus den
//     ECHTEN DOM-Bounds (#hud .panel/.hud-bar) — keine hartkodierte Geometrie,
//     die gegen die skalierte HTML-HUD-Buehne (Paket C) driften koennte.
//   - setPaused: Vollbild-Pause-Abdunkelung (Pause-Screen, kein HUD-Element).
//   - showEndOverlay: Sieg-/Niederlage-Screen.
// Das Befehlsraster/die Live-Werte wandern als DOM-Logik ins HTML-HUD (H5/H6).

export class HudScene extends Phaser.Scene {
  private ended = false;
  private pauseOverlayBg?: Phaser.GameObjects.Rectangle;
  private pauseOverlayText?: Phaser.GameObjects.Text;
  private overlayBg?: Phaser.GameObjects.Rectangle;
  private overlayText?: Phaser.GameObjects.Text;

  constructor() {
    super("hud");
  }

  create(): void {
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layoutOverlays, this);
  }

  /**
   * Liegt der Bildschirmpunkt auf einer sichtbaren HUD-Flaeche? Quelle sind die
   * ECHTEN DOM-Bounds der Panels + der Bodenleiste — keine hartkodierte Parallel-
   * Geometrie (die nach Paket C gegen die zentrierte, skalierte Buehne driften
   * wuerde). Backstop zu pointer-events:auto; bei Scale.RESIZE sind Pointer-
   * Koordinaten = CSS-Pixel (1:1), also direkt mit getBoundingClientRect verglichen.
   */
  public containsPoint(x: number, y: number): boolean {
    const els = document.querySelectorAll<HTMLElement>("#hud .panel, #hud .hud-bar");
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
    }
    return false;
  }

  /** Vollbild-Pause-Abdunkelung (kein HUD-Element, reiner Pause-Screen). */
  public setPaused(paused: boolean): void {
    if (paused && !this.pauseOverlayBg) {
      this.pauseOverlayBg = this.add
        .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.45)
        .setOrigin(0, 0)
        .setDepth(4000);
      this.pauseOverlayText = this.add
        .text(this.scale.width / 2, this.scale.height / 2, "Pausiert", {
          fontFamily: "monospace", fontSize: "36px", color: "#f4f1e6",
        })
        .setOrigin(0.5)
        .setDepth(4001);
    } else if (!paused && this.pauseOverlayBg) {
      this.pauseOverlayBg.destroy();
      this.pauseOverlayText?.destroy();
      this.pauseOverlayBg = undefined;
      this.pauseOverlayText = undefined;
    }
  }

  /** Sieg-/Niederlage-Overlay (Vollbild). */
  public showEndOverlay(title: string, subtitle: string): void {
    if (this.ended) return;
    this.ended = true;
    this.overlayBg = this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.6)
      .setOrigin(0, 0)
      .setDepth(5000);
    this.overlayText = this.add
      .text(this.scale.width / 2, this.scale.height / 2, `${title}\n${subtitle}`, {
        fontFamily: "monospace", fontSize: "40px", color: "#f4f1e6", align: "center",
      })
      .setOrigin(0.5)
      .setDepth(5001);
  }

  private layoutOverlays(): void {
    const w = this.scale.width, h = this.scale.height;
    this.pauseOverlayBg?.setSize(w, h);
    this.pauseOverlayText?.setPosition(w / 2, h / 2);
    this.overlayBg?.setSize(w, h);
    this.overlayText?.setPosition(w / 2, h / 2);
  }
}
