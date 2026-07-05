import Phaser from "phaser";
import { Building } from "../entities/building";
import { buildingSpriteKey } from "../data/sprites";
import { TILE_WIDTH, TILE_HEIGHT, type GridPoint } from "../util/iso";
import { VISION } from "../data/balance";
import type { GameState } from "./game_state";
import type { VisionGrid } from "./vision_grid";

// FoW Paket B, Teil 2 -- Sichtbarkeit von Einheiten und Gebaeuden (Render-Pfad,
// KEIN Sim-Eingriff). Read-only-Verbraucher des VisionGrid des LOKALEN Spielers.
//
// Regeln (League/TA-Standard):
//   Freund            -> immer sichtbar.
//   Feind-EINHEIT      -> nur in aktueller Sicht (mobil = verschwindet, NIE Geist).
//   Feind-GEBAEUDE     -> in Sicht: live (+Snapshot bei Erst-Sicht);
//                         erkundet, aber unsichtbar: gedimmter Geist;
//                         nie gesehen: verborgen.
// Statik bleibt Geist (eigene Registry, ueberlebt das Splice in removeBuilding),
// bis die Kachel re-aufgeklaert ist -- auch wenn das Gebaeude im Nebel zerstoert
// wurde (dann zeigt der Geist den letzten bekannten Stand, bis man nachsieht).
// col/row sind direkt der Gitter-Index (kein worldToTile). Idempotente
// setVisible-Sets sind ~gratis -> pro Frame statt eventgetrieben.

const LOCAL = "spieler" as const;

interface BuildingGhost {
  spr: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
  tiles: GridPoint[];
}

export class VisibilitySystem {
  private readonly ghosts = new Map<number, BuildingGhost>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly state: GameState,
  ) {}

  public update(): void {
    const vis = this.state.vision[LOCAL];

    // --- Einheiten ---
    for (const u of this.state.units) {
      if (u.owner === LOCAL) {
        if (!u.visible) u.setVisible(true);
        continue;
      }
      u.setVisible(vis.isVisible(u.col, u.row)); // mobil: im Nebel weg, kein Geist
    }

    // --- Gebaeude ---
    const live = new Set<number>();
    for (const b of this.state.buildings) {
      if (b.owner === LOCAL) {
        if (!b.visible) b.setVisible(true);
        continue;
      }
      live.add(b.id);
      const tiles = b.footprintTiles();
      if (this.anyVisible(tiles, vis)) {
        b.setVisible(true);
        this.ensureGhost(b); // Snapshot bei (Erst-)Sicht, fuer spaeter
        this.setGhostVisible(b.id, false);
      } else if (this.anyExplored(tiles, vis)) {
        b.setVisible(false);
        this.setGhostVisible(b.id, true);
      } else {
        b.setVisible(false);
        this.setGhostVisible(b.id, false);
      }
    }

    // --- Verwaiste Geister (Quelle nicht mehr im State = zerstoert): bleiben
    //     stehen, bis die Kachel wieder in Sicht ist -> dann nachweislich weg. ---
    for (const [id, g] of this.ghosts) {
      if (live.has(id)) continue;
      if (this.anyVisible(g.tiles, vis)) {
        g.spr.destroy();
        this.ghosts.delete(id);
      } else {
        g.spr.setVisible(true);
      }
    }
  }

  private anyVisible(tiles: GridPoint[], vis: VisionGrid): boolean {
    for (const t of tiles) if (vis.isVisible(t.col, t.row)) return true;
    return false;
  }

  private anyExplored(tiles: GridPoint[], vis: VisionGrid): boolean {
    for (const t of tiles) if (vis.wasExplored(t.col, t.row)) return true;
    return false;
  }

  private setGhostVisible(id: number, on: boolean): void {
    const g = this.ghosts.get(id);
    if (g) g.spr.setVisible(on);
  }

  /** Geist einmalig aus dem aktuellen Bauzustand erzeugen (Vorbild spawnCorpse:
   *  eigenes Sprite, entsaettigter Tint, halbe Deckkraft). Verborgen bis gebraucht. */
  private ensureGhost(b: Building): void {
    if (this.ghosts.has(b.id)) return;
    const tiles = b.footprintTiles();
    const key = buildingSpriteKey(b.typeId);
    let spr: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
    if (key && this.scene.textures.exists(key)) {
      const dispW = (b.footprint.w + b.footprint.h) * (TILE_WIDTH / 2);
      const img = this.scene.add.image(b.x, b.y, key).setOrigin(0.5, 1);
      img.setScale(dispW / (img.width || dispW));
      img.setTint(VISION.ghostTint);
      spr = img;
    } else {
      // Platzhalter-Gebaeude (kein Atlas): dieselbe Klotzform wie der Bau.
      const span = b.footprint.w + b.footprint.h;
      const blockW = span * TILE_WIDTH * 0.28;
      const blockH = TILE_HEIGHT * (1.6 + 0.4 * Math.max(b.footprint.w, b.footprint.h));
      spr = this.scene.add.rectangle(b.x, b.y - blockH / 2, blockW, blockH, VISION.ghostTint);
    }
    spr.setDepth(b.depth);
    spr.setAlpha(VISION.ghostAlpha);
    spr.setVisible(false);
    this.ghosts.set(b.id, { spr, tiles });
  }

  /** Mess-Hook: Geist-Statistik (gesamt registriert / aktuell sichtbar). */
  public ghostStats(): { total: number; visible: number } {
    let visible = 0;
    for (const g of this.ghosts.values()) if (g.spr.visible) visible++;
    return { total: this.ghosts.size, visible };
  }

  public destroy(): void {
    for (const g of this.ghosts.values()) g.spr.destroy();
    this.ghosts.clear();
  }
}
