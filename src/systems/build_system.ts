import Phaser from "phaser";
import { Building } from "../entities/building";
import { tilePolygon, type GridPoint } from "../util/iso";
import { WORLD_ORIGIN_X, WORLD_ORIGIN_Y, worldToTile, inBounds } from "../util/world";
import { BUILD } from "../data/balance";
import { EVT_BUILD_REJECTED } from "../ui/ui_events";
import type { GameState } from "./game_state";
import type { MovementSystem } from "./movement_system";
import type { Unit } from "../entities/unit";
import type { GameData, BuildingDef, Footprint, Cost, ResourceId } from "../data/loader";

const GHOST_DEPTH = 1900;
const COLOR_VALID = 0x66ff99;
const COLOR_INVALID = 0xff6666;

// Bau-System: Platzierungsmodus mit Ghost; danach treibt der Fortschritt rein
// ueber die zugewiesenen Sammler. Mehrere Sammler bauen schneller (gedeckelt),
// abgezogene Sammler pausieren die Baustelle (sie bleibt bestehen), und sie
// laesst sich jederzeit wieder aufnehmen oder gegen Teil-Rueckerstattung
// abbrechen. Die Grundflaeche bleibt am Gitter eingerastet.
export class BuildSystem {
  private ghost: Phaser.GameObjects.Graphics;
  private placing?: { typeId: string; def: BuildingDef; builders: Unit[] };
  private hoverAnchor: GridPoint = { col: 0, row: 0 };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly state: GameState,
    private readonly movement: MovementSystem,
    private readonly data: GameData,
  ) {
    this.ghost = scene.add.graphics().setDepth(GHOST_DEPTH);
  }

  public isPlacing(): boolean {
    return this.placing !== undefined;
  }

  /** Startet den Platzierungsmodus, wenn ein bauender Arbeiter selektiert ist. */
  public beginPlacement(typeId: string): void {
    const def = this.data.buildings[typeId];
    if (!def || !def.baubar) return;
    // Server-seitiges Bau-Gate (Tech-Stufe/Limit, z. B. Destille). Frueh ablehnen,
    // damit der Platzierungsmodus gar nicht erst startet. Event fuers HUD.
    const gate = this.state.canConstruct(typeId, "spieler");
    if (!gate.ok) {
      this.scene.game.events.emit(EVT_BUILD_REJECTED, { typeId, reason: gate.reason });
      return;
    }
    const builders = this.state.selected.filter(
      (u) => u.def.kann_bauen && u.faction === def.faction,
    );
    if (builders.length === 0) return;
    this.placing = { typeId, def, builders };
  }

  public cancel(): void {
    this.placing = undefined;
    this.ghost.clear();
  }

  /** Aktualisiert den Ghost an der Cursorposition (Welt-Koordinaten). */
  public updateGhost(worldX: number, worldY: number): void {
    if (!this.placing) return;
    this.hoverAnchor = worldToTile(worldX, worldY);
    const valid = this.canPlaceHere();
    this.drawGhost(this.hoverAnchor, this.placing.def.grundflaeche ?? { w: 1, h: 1 }, valid);
  }

  /**
   * Versucht zu platzieren. Gibt das angelegte Gebaeude (Baustelle) zurueck,
   * sonst undefined. Das Tasking der Bautrupps macht der Aufrufer ueber die
   * Order-Queue. Bei `keepOpen` (gehaltene Umschalttaste) bleibt der
   * Platzierungsmodus aktiv.
   */
  public tryPlace(keepOpen = false): Building | undefined {
    if (!this.placing) return undefined;
    if (!this.canPlaceHere()) return undefined;

    const { typeId, def } = this.placing;
    // Hartes server-seitiges Gate (bypass-sicher, nicht nur HUD/Ghost): auch der
    // keepOpen-Vierfachbau wird hier abgefangen.
    const gate = this.state.canConstruct(typeId, "spieler");
    if (!gate.ok) {
      this.scene.game.events.emit(EVT_BUILD_REJECTED, { typeId, reason: gate.reason });
      this.cancel();
      return undefined;
    }
    this.state.spend("spieler", def.kosten ?? {});

    const building = new Building(
      this.scene,
      typeId,
      def,
      this.hoverAnchor.col,
      this.hoverAnchor.row,
      "spieler",
      false,
    );
    this.state.addBuilding(building);

    if (keepOpen) {
      this.drawGhost(this.hoverAnchor, def.grundflaeche ?? { w: 1, h: 1 }, this.canPlaceHere());
    } else {
      this.cancel();
    }
    return building;
  }

  /** Nimmt den Bau einer bestehenden, unfertigen Baustelle wieder auf. */
  public resumeBuild(workers: Unit[], building: Building): void {
    if (building.fertig || building.owner !== "spieler") return;
    for (const w of workers) {
      if (!w.isWorker) continue;
      w.gather = undefined;
      w.repairTarget = undefined;
      w.attackTarget = undefined;
      w.buildTarget = building;
      this.movement.moveAdjacentTo(w, { col: building.col, row: building.row });
    }
  }

  /** Bricht eine unfertige Baustelle ab und erstattet einen Teil der Kosten. */
  public cancelBuild(building: Building): void {
    if (building.fertig) return;
    const refund = this.scaleCost(building.def.kosten ?? {}, BUILD.refundFraction);
    for (const [id, amount] of Object.entries(refund) as [ResourceId, number][]) {
      this.state.addResource("spieler", id, amount);
    }
    for (const u of this.state.units) {
      if (u.buildTarget === building) u.buildTarget = undefined;
    }
    this.state.removeBuilding(building);
  }

  public update(deltaMs: number): void {
    for (const building of this.state.buildings) {
      if (building.fertig || building.owner !== "spieler") continue;

      const builders = this.state.units.filter((u) => u.buildTarget === building);
      let adjacent = 0;
      for (const b of builders) {
        if (this.adjacentToSite(b, building)) adjacent++;
        else if (!b.moving) this.movement.moveAdjacentTo(b, { col: building.col, row: building.row });
      }

      const effective = Math.min(adjacent, BUILD.maxWorkers) * BUILD.progressPerWorker;
      const totalMs = (building.def.bauzeit ?? 0) * 1000;
      if (effective > 0) building.buildElapsedMs += deltaMs * effective;
      building.setProgress(totalMs > 0 ? building.buildElapsedMs / totalMs : 1);

      if (building.buildElapsedMs >= totalMs) {
        building.complete();
        for (const b of builders) b.buildTarget = undefined;
      }
    }
  }

  // --- intern ------------------------------------------------------------

  private scaleCost(cost: Cost, factor: number): Cost {
    const out: Cost = {};
    for (const [id, amount] of Object.entries(cost) as [ResourceId, number][]) {
      out[id] = Math.round(amount * factor);
    }
    return out;
  }

  private canPlaceHere(): boolean {
    if (!this.placing) return false;
    const fp = this.placing.def.grundflaeche ?? { w: 1, h: 1 };
    if (!this.footprintFree(this.hoverAnchor, fp)) return false;
    if (!this.withinBuildZone(this.hoverAnchor, fp)) return false;
    // Tech-/Limit-Gate auch im Ghost (roter Umriss bei z. B. erreichtem Maximum).
    if (!this.state.canConstruct(this.placing.typeId, "spieler").ok) return false;
    return this.state.canAfford("spieler", this.placing.def.kosten ?? {});
  }

  /**
   * Liegt der Bauplatz in der Bauzone? Grosszuegiger Maximalabstand (Mitte zu
   * Mitte) zu einem eigenen Gebaeude. Zaehlt von jedem eigenen Gebaeude
   * (Bauzone waechst mit der Basis) oder nur vom HQ, je nach Tunable.
   */
  private withinBuildZone(anchor: GridPoint, fp: Footprint): boolean {
    const cx = anchor.col + (fp.w - 1) / 2;
    const cy = anchor.row + (fp.h - 1) / 2;
    for (const b of this.state.buildings) {
      if (b.owner !== "spieler") continue;
      if (!BUILD.zoneFromAnyBuilding && b.role !== "hq") continue;
      const bcx = b.col + (b.footprint.w - 1) / 2;
      const bcy = b.row + (b.footprint.h - 1) / 2;
      if (Math.max(Math.abs(cx - bcx), Math.abs(cy - bcy)) <= BUILD.maxRangeFromHQ) return true;
    }
    return false;
  }

  private footprintFree(anchor: GridPoint, fp: Footprint): boolean {
    for (let dr = 0; dr < fp.h; dr++) {
      for (let dc = 0; dc < fp.w; dc++) {
        const c = anchor.col + dc;
        const r = anchor.row + dr;
        if (!inBounds(c, r) || this.state.isBlocked(c, r)) return false;
      }
    }
    return true;
  }

  private adjacentToSite(unit: Unit, building: Building): boolean {
    for (const t of building.footprintTiles()) {
      if (Math.max(Math.abs(unit.col - t.col), Math.abs(unit.row - t.row)) <= 1) return true;
    }
    return false;
  }

  private drawGhost(anchor: GridPoint, fp: Footprint, valid: boolean): void {
    const color = valid ? COLOR_VALID : COLOR_INVALID;
    this.ghost.clear();
    this.ghost.fillStyle(color, 0.35);
    this.ghost.lineStyle(1, color, 0.9);
    for (let dr = 0; dr < fp.h; dr++) {
      for (let dc = 0; dc < fp.w; dc++) {
        const poly = tilePolygon(anchor.col + dc, anchor.row + dr).map((p) => ({
          x: p.x + WORLD_ORIGIN_X,
          y: p.y + WORLD_ORIGIN_Y,
        }));
        this.ghost.beginPath();
        this.ghost.moveTo(poly[0].x, poly[0].y);
        for (let k = 1; k < poly.length; k++) this.ghost.lineTo(poly[k].x, poly[k].y);
        this.ghost.closePath();
        this.ghost.fillPath();
        this.ghost.strokePath();
      }
    }
  }
}
