import Phaser from "phaser";
import { worldToTile } from "../util/world";
import { CONTROLS } from "../data/balance";
import type { GameState } from "./game_state";
import type { Unit } from "../entities/unit";

// Schwelle in Bildschirmpixeln: darunter gilt das Ziehen als Klick.
const CLICK_THRESHOLD = 6;

// Vertikaler Versatz des Einheiten-Koerpers ueber der Kachelmitte (siehe unit.ts).
const UNIT_BODY_OFFSET_Y = -14;
const UNIT_PICK_RADIUS = 18;

// Nur eigene Einheiten sind selektierbar.
const PLAYER_OWNER = "spieler";

// Auswahlsystem: Linksklick waehlt eine Einheit, Aufziehen waehlt mehrere
// (Box-Select). Gebaeude/Ressourcenknoten sind anklickbar (Inspektion), aber
// nicht als Armee selektierbar. Klick ins Leere hebt die Auswahl auf.
export class SelectionSystem {
  private dragging = false;
  private startScreen = new Phaser.Math.Vector2();
  private startWorld = new Phaser.Math.Vector2();
  private box: Phaser.GameObjects.Graphics;
  private shiftKey?: Phaser.Input.Keyboard.Key;
  private lastClickMs = 0;
  private lastTypeId = "";

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly state: GameState,
  ) {
    // Im Welt-Space gezeichnet (kein scrollFactor 0), damit Zoom und Scroll der
    // Kamera den Rahmen automatisch mittransformieren und er bei jeder
    // Zoomstufe exakt unter dem Cursor sitzt.
    this.box = scene.add.graphics().setDepth(500000);
    this.shiftKey = scene.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
  }

  private get shiftDown(): boolean {
    return this.shiftKey?.isDown ?? false;
  }

  public onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (!pointer.leftButtonDown()) return;
    this.dragging = true;
    this.startScreen.set(pointer.x, pointer.y);
    const w = this.worldPoint(pointer);
    this.startWorld.set(w.x, w.y);
    this.box.clear();
  }

  public onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.dragging) return;
    const world = this.worldPoint(pointer);
    this.box.clear();
    // Liniendicke gegen den Zoom normieren, damit der Rahmen schlank bleibt.
    this.box.lineStyle(1 / this.scene.cameras.main.zoom, 0x9be7b4, 1);
    this.box.fillStyle(0x9be7b4, 0.12);
    const x = Math.min(this.startWorld.x, world.x);
    const y = Math.min(this.startWorld.y, world.y);
    const w = Math.abs(world.x - this.startWorld.x);
    const h = Math.abs(world.y - this.startWorld.y);
    this.box.fillRect(x, y, w, h);
    this.box.strokeRect(x, y, w, h);
  }

  public onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (!this.dragging) return;
    this.dragging = false;
    this.box.clear();

    const dragDist = Phaser.Math.Distance.Between(
      this.startScreen.x,
      this.startScreen.y,
      pointer.x,
      pointer.y,
    );

    if (dragDist < CLICK_THRESHOLD) {
      this.clickSelect(pointer);
    } else {
      this.boxSelect(pointer);
    }
  }

  // --- Auswahl-Logik -----------------------------------------------------

  private clickSelect(pointer: Phaser.Input.Pointer): void {
    const world = this.worldPoint(pointer);
    const shift = this.shiftDown;

    const unit = this.unitAt(world.x, world.y);
    if (unit) {
      const now = this.scene.time.now;
      const doubleClick =
        !shift && now - this.lastClickMs < CONTROLS.doubleClickMs && this.lastTypeId === unit.typeId;
      this.lastClickMs = now;
      this.lastTypeId = unit.typeId;

      if (doubleClick) this.selectSameTypeInView(unit);
      else if (shift) this.state.toggleUnit(unit);
      else this.state.selectUnits([unit]);
      return;
    }

    // Shift-Klick ins Leere/auf Struktur laesst die Auswahl unangetastet.
    if (shift) return;

    const tile = worldToTile(world.x, world.y);
    const structure =
      this.state.buildings.find(
        (b) =>
          b.footprintTiles().some((t) => t.col === tile.col && t.row === tile.row) ||
          b.getBounds().contains(world.x, world.y),
      ) ??
      this.state.nodes.find(
        (n) => (n.col === tile.col && n.row === tile.row) || n.getBounds().contains(world.x, world.y),
      );
    if (structure) {
      this.state.inspect(structure);
      return;
    }

    this.state.clearSelection();
  }

  /** Waehlt alle Einheiten desselben Typs im sichtbaren Kamerabereich. */
  private selectSameTypeInView(ref: Unit): void {
    const view = this.scene.cameras.main.worldView;
    const same = this.state.units.filter(
      (u) =>
        u.owner === PLAYER_OWNER &&
        u.typeId === ref.typeId &&
        view.contains(u.x, u.y + UNIT_BODY_OFFSET_Y),
    );
    this.state.selectUnits(same.length > 0 ? same : [ref]);
  }

  private boxSelect(pointer: Phaser.Input.Pointer): void {
    const world = this.worldPoint(pointer);
    const minX = Math.min(this.startWorld.x, world.x);
    const maxX = Math.max(this.startWorld.x, world.x);
    const minY = Math.min(this.startWorld.y, world.y);
    const maxY = Math.max(this.startWorld.y, world.y);

    const picked = this.state.units.filter((u) => {
      if (u.owner !== PLAYER_OWNER) return false;
      const by = u.y + UNIT_BODY_OFFSET_Y;
      return u.x >= minX && u.x <= maxX && by >= minY && by <= maxY;
    });

    if (this.shiftDown) {
      if (picked.length > 0) this.state.addToSelection(picked);
    } else if (picked.length > 0) {
      this.state.selectUnits(picked);
    } else {
      this.state.clearSelection();
    }
  }

  private unitAt(x: number, y: number): Unit | undefined {
    let best: Unit | undefined;
    let bestDist = UNIT_PICK_RADIUS;
    for (const u of this.state.units) {
      if (u.owner !== PLAYER_OWNER) continue;
      const d = Phaser.Math.Distance.Between(x, y, u.x, u.y + UNIT_BODY_OFFSET_Y);
      if (d <= bestDist) {
        bestDist = d;
        best = u;
      }
    }
    return best;
  }

  private worldPoint(pointer: Phaser.Input.Pointer): Phaser.Math.Vector2 {
    return this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
  }
}
