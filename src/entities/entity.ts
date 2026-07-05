import Phaser from "phaser";
import { gridToWorld } from "../util/world";
import type { Owner } from "../data/loader";

// Basisgroesse des iso-flachen Auswahlrings (passt zu Einheiten). Gebaeude
// ueberschreiben sie nach ihrer Anzeigegroesse (SELECTION_RING.buildingScale).
const RING_W = 44;
const RING_H = 22;

// Gemeinsame Basis aller Spielobjekte auf dem Gitter. Eine GridEntity ist ein
// Phaser-Container (Platzhalter-Form + Label + optionaler Highlight-Ring +
// Lebensbalken) und kennt ihre Gitterposition (col, row) und ihren Besitzer.
// Konkrete Formen liefern die Unterklassen (Unit, Building, ResourceNode).
export abstract class GridEntity extends Phaser.GameObjects.Container {
  private static nextId = 1;
  /** Stabile, eindeutige Sim-ID (Erzeugungsreihenfolge). Fuer deterministische
   *  Tiebreaks und Prioritaet in der Separation/Vermeidung (Strang 2). */
  public readonly id = GridEntity.nextId++;

  /** Setzt den ID-Zaehler zurueck (Matchstart/Seed) -- damit die id-basierte
   *  Entstapelung ueber gleich geseedete Laeufe reproduzierbar ist (Strang 8). */
  public static resetIds(start = 1): void {
    GridEntity.nextId = start;
  }
  public col: number;
  public row: number;
  public hp: number;
  public readonly maxHp: number;
  public readonly displayName: string;
  public readonly owner: Owner;

  /** Tiefen-Offset des Layers (Einheiten liegen ueber Gebaeuden). */
  protected depthOffset = 0;

  private highlightRing!: Phaser.GameObjects.Ellipse;
  private ringVisible = false;
  private ringColor = 0x66ff99;

  private healthBarBg?: Phaser.GameObjects.Rectangle;
  private healthBarFill?: Phaser.GameObjects.Rectangle;
  private healthBarWidth = 0;

  constructor(
    scene: Phaser.Scene,
    col: number,
    row: number,
    displayName: string,
    maxHp: number,
    owner: Owner,
  ) {
    const w = gridToWorld(col, row);
    super(scene, w.x, w.y);

    this.col = col;
    this.row = row;
    this.displayName = displayName;
    this.maxHp = maxHp;
    this.hp = maxHp;
    this.owner = owner;

    // Highlight-Ring als iso-flache, gezeichnete Ellipse auf Bodenhoehe (das
    // gemalte Ringsprite wirkt aufrecht und wird bewusst nicht verwendet).
    // Erstes Kind, damit es unter Form und Label liegt. Default-Groesse passt zu
    // Einheiten; Gebaeude vergroessern den Ring nach ihrer Anzeigegroesse.
    this.makeHighlightRing(RING_W, RING_H);

    this.setDepth(this.depthOffset + w.y);
    scene.add.existing(this);
  }

  /** Setzt die Gitterposition und aktualisiert Welt-Position + Tiefe. */
  public placeAtGrid(col: number, row: number): void {
    this.col = col;
    this.row = row;
    const w = gridToWorld(col, row);
    this.setPosition(w.x, w.y);
    this.setDepth(this.depthOffset + w.y);
  }

  /** Setzt direkt die Welt-Position (fuer glatte Bewegung) und die Tiefe. */
  public setWorld(x: number, y: number): void {
    this.setPosition(x, y);
    this.setDepth(this.depthOffset + y);
  }

  /** Schaltet den Highlight-Ring (Auswahl/Fokus) an oder aus, mit Farbe. */
  public setHighlight(on: boolean, color = 0x66ff99): void {
    this.ringVisible = on;
    this.ringColor = color;
    this.highlightRing.setStrokeStyle(2, color, 1);
    this.highlightRing.setVisible(on);
  }

  /**
   * (Neu)erzeugt den iso-flachen Auswahlring in absoluter Groesse und legt ihn
   * als unterstes Kind ab. Strichstaerke bleibt konstant (kein Skalieren).
   * Unterklassen mit grossem Sprite (Gebaeude) rufen das mit ihrer Anzeigegroesse.
   */
  protected makeHighlightRing(width: number, height: number): void {
    this.highlightRing?.destroy();
    this.highlightRing = this.scene.add
      .ellipse(0, 0, width, height)
      .setStrokeStyle(2, this.ringColor, 1)
      .setFillStyle(0, 0)
      .setVisible(this.ringVisible);
    this.addAt(this.highlightRing, 0);
  }

  public get isDead(): boolean {
    return this.hp <= 0;
  }

  /** Zieht Schaden ab (bereits ruestungsbereinigt). Aktualisiert den Balken. */
  public applyDamage(amount: number): void {
    this.hp = Phaser.Math.Clamp(this.hp - amount, 0, this.maxHp);
    this.refreshHealthBar();
  }

  /** Stellt HP wieder her (Reparatur). Aktualisiert den Balken. */
  public heal(amount: number): void {
    this.hp = Phaser.Math.Clamp(this.hp + amount, 0, this.maxHp);
    this.refreshHealthBar();
  }

  public get damaged(): boolean {
    return this.hp < this.maxHp;
  }

  /**
   * Erzeugt das Body-Sprite, wenn die Textur geladen ist (Anker unten-mitte fuer
   * korrekte y-Tiefensortierung). Fehlt sie, gibt undefined zurueck und die
   * Unterklasse zeichnet ihre Platzhalterform. Anzeigegroesse rein visuell,
   * entkoppelt vom Gameplay-Footprint.
   */
  protected makeBody(
    key: string | undefined,
    displayWidth: number,
  ): Phaser.GameObjects.Image | undefined {
    if (!key || !this.scene.textures.exists(key)) return undefined;
    const img = this.scene.add.image(0, 0, key).setOrigin(0.5, 1);
    const w = img.width || displayWidth;
    img.setScale(displayWidth / w);
    this.add(img);
    return img;
  }

  /**
   * Erzeugt das Textlabel ueber der Form. Von Unterklassen aufgerufen, nachdem
   * sie ihre Form hinzugefuegt haben, damit das Label oben liegt.
   */
  protected addLabel(text: string, yOffset: number): Phaser.GameObjects.Text {
    const label = this.scene.add
      .text(0, yOffset, text, {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#f4f1e6",
        backgroundColor: "#00000088",
        padding: { x: 3, y: 1 },
      })
      .setOrigin(0.5, 1);
    this.add(label);
    return label;
  }

  /** Legt einen Lebensbalken an, der nur bei Beschaedigung sichtbar ist. */
  protected addHealthBar(yOffset: number, width: number): void {
    this.healthBarWidth = width;
    this.healthBarBg = this.scene.add
      .rectangle(0, yOffset, width, 5, 0x000000, 0.7)
      .setOrigin(0.5, 0.5)
      .setVisible(false);
    this.healthBarFill = this.scene.add
      .rectangle(-width / 2, yOffset, width, 5, 0x6fd08a, 1)
      .setOrigin(0, 0.5)
      .setVisible(false);
    this.add(this.healthBarBg);
    this.add(this.healthBarFill);
  }

  private refreshHealthBar(): void {
    if (!this.healthBarBg || !this.healthBarFill) return;
    const ratio = this.maxHp > 0 ? this.hp / this.maxHp : 0;
    const damaged = this.hp < this.maxHp && this.hp > 0;
    this.healthBarFill.width = this.healthBarWidth * ratio;
    this.healthBarFill.setFillStyle(ratio > 0.5 ? 0x6fd08a : ratio > 0.25 ? 0xc9b06b : 0xd06f6f, 1);
    this.healthBarBg.setVisible(damaged);
    this.healthBarFill.setVisible(damaged);
  }
}
