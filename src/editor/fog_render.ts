// Welt-Nebel (Strang 8, atmosphaerische Tiefe). VIER welt-getilte Parallaxe-Lagen
// (fern/mittel/nah/ADD-Schimmer) ueber Boden/Decals, unter den Einheiten (Tiefe
// -67000..-64000), gegenlaeufig gestaffelt driftend (kein sichtbarer Loop), alle
// masken-begrenzt auf die fog-Zonen via EINER weich gebackenen Deckungsmaske
// (geteilte BitmapMask -> FoW/Terrain unberuehrt). Eine prozedurale, nahtlos
// kachelnde Schwaden-Textur (kein KREA-Asset, KEIN Domain-Warp -> keine Naht).
//
// Tiefe ist ein RE-BUDGET, keine Addition: die Over-Blend-Summe der drei NORMAL-
// Lagen bleibt <= der frueheren EINEN Lage (~0.27), Parallaxe traegt die Tiefe.
// 4 TileSprites = 4 Draw-Calls, KONSTANT ueber die Kartengroesse. Drift ist rein
// tilePos += DRIFT*dt (kein Random) -> deterministisch gegeben den dt-Strom.
// Konstanten zentral in balance.ts ATMO_FOG. Lokale Partikel (Dichte>0.8) sind
// Strang 11 und bewusst NICHT hier (eigene Datei, Default aus).

import Phaser from "phaser";
import { TILE_WIDTH } from "../util/iso";
import { gridToWorld } from "../util/world";
import { ATMO_FOG } from "../data/balance";
import type { MapWorldRect } from "../systems/map_texture";
import type { MapFog } from "../maps/map_format";

const WISP_KEY = "__fog_wisps"; // prozedurale Schwaden (einmal, geteilt)
const WISP_RES = 256;

export class FogRenderer {
  private tiles: Phaser.GameObjects.TileSprite[] = [];
  private drifts: { x: number; y: number }[] = []; // je Lage, parallel zu tiles
  private maskImg?: Phaser.GameObjects.Image;
  private mask?: Phaser.Display.Masks.BitmapMask;
  private maskCanvas?: HTMLCanvasElement;
  private maskKey: string;
  private active = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly rect: MapWorldRect,
  ) {
    this.maskKey = `__fog_mask_${Math.random().toString(36).slice(2)}`;
    FogRenderer.ensureWispTexture(scene);
  }

  /** Anzahl Draw-Calls der Nebelflaeche (Abnahme: konstant ueber Kartengroesse). */
  drawCalls(): number {
    return this.active ? this.tiles.length : 0;
  }

  get isActive(): boolean {
    return this.active;
  }

  /** (Neu-)Aufbau aus der aktuellen fog-Liste. Ohne Quellen: alles aus (kein Quad). */
  build(fog: MapFog[]): void {
    const any = this.bakeMask(fog);
    if (!any) {
      this.setVisible(false);
      this.active = false;
      return;
    }
    if (!this.tiles.length) this.createTiles();
    this.refreshMask();
    this.setVisible(true);
    this.active = true;
  }

  /** Editor-Livevorschau: Maske neu backen, Sichtbarkeit nachziehen. */
  rebuild(fog: MapFog[]): void {
    this.build(fog);
  }

  /** Drift treiben: rein tilePosition += DRIFT*dt je Lage (deterministisch, kein
   *  Random). Gegenlaeufig gestaffelt -> Motion-Parallaxe (staerkster 2D-Tiefen-Cue). */
  update(_time: number, dtMs: number): void {
    if (!this.active) return;
    const dt = dtMs / 1000;
    for (let i = 0; i < this.tiles.length; i++) {
      this.tiles[i].tilePositionX += this.drifts[i].x * dt;
      this.tiles[i].tilePositionY += this.drifts[i].y * dt;
    }
  }

  /** tilePosition je Lage (Drift-Determinismus-Gate, NEBEL-TIEFE-SPEC §5(d)). */
  driftState(): { x: number; y: number }[] {
    return this.tiles.map((t) => ({ x: t.tilePositionX, y: t.tilePositionY }));
  }

  /** Drift auf null (deterministischer Determinismus-Test: gleicher Startpunkt). */
  resetDrift(): void {
    for (const t of this.tiles) t.setTilePosition(0, 0);
  }

  /** Einen Drift-Schritt mit explizitem dt (ms) treiben (Determinismus-Test). */
  step(dtMs: number): void {
    this.update(0, dtMs);
  }

  destroy(): void {
    for (const t of this.tiles) t.destroy();
    this.tiles = [];
    this.drifts = [];
    this.mask?.destroy();
    this.maskImg?.destroy();
    this.maskCanvas = undefined;
    if (this.scene.textures.exists(this.maskKey)) this.scene.textures.remove(this.maskKey);
    // Stale-Refs nullen: ein zweiter destroy() oder ein destroy-then-build wuerde
    // sonst die zerstoerten Phaser-Objekte erneut destroy'en bzw. die zerstoerte
    // BitmapMask an frische Tiles haengen (Render-Crash). Idempotent.
    this.mask = undefined;
    this.maskImg = undefined;
    this.maskCanvas = undefined;
    this.active = false;
  }

  // --- intern --------------------------------------------------------------

  private createTiles(): void {
    const { rect } = this;
    const wispTexW = this.scene.textures.get(WISP_KEY).getSourceImage().width || WISP_RES;
    const tileWorld = ATMO_FOG.tileWorldTiles * TILE_WIDTH;
    this.tiles = [];
    this.drifts = [];
    for (const L of ATMO_FOG.layers) {
      const scale = (tileWorld * L.scale) / wispTexW; // Schwaden-Kachel je Lage groesser/kleiner
      const ts = this.scene.add
        .tileSprite(rect.x, rect.y, rect.width, rect.height, WISP_KEY)
        .setOrigin(0, 0)
        .setTileScale(scale, scale)
        .setTint(L.tint) // Tiefen-Tint-Gradient (fern kuehler/blasser, ADD heller)
        .setAlpha(L.alpha)
        .setDepth(L.depth);
      ts.setBlendMode(L.blend === "ADD" ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
      this.tiles.push(ts);
      this.drifts.push(L.drift);
    }
  }

  /** Maske als BitmapMask auf beide TileSprites legen (eine Maske, ein Renderpass). */
  private refreshMask(): void {
    if (!this.maskCanvas) return;
    if (!this.maskImg) {
      // Welt-Bild der Deckungsmaske (Anker 0,0; deckt das Karten-Rect). Nicht auf
      // der Anzeigeliste -- dient nur als Alpha-Quelle der BitmapMask.
      this.maskImg = this.scene.make.image({ x: this.rect.x, y: this.rect.y, key: this.maskKey, add: false });
      this.maskImg.setOrigin(0, 0).setDisplaySize(this.rect.width, this.rect.height);
      this.mask = this.maskImg.createBitmapMask();
    }
    for (const t of this.tiles) t.setMask(this.mask!);
  }

  private setVisible(v: boolean): void {
    for (const t of this.tiles) t.setVisible(v);
  }

  /**
   * Backt die weiche Deckungsmaske: je fog-Quelle ein radialer Verlauf (Mitte =
   * Dichte, Rand = 0) ins Karten-Rect (Welt->UV-Raster wie map_texture). Liefert
   * false, wenn keine Quelle existiert. Additive Ueberlagerung (lighter).
   */
  private bakeMask(fog: MapFog[]): boolean {
    if (!fog.length) return false;
    const { rect } = this;
    const aspect = rect.height / rect.width;
    const w = Math.min(ATMO_FOG.maskMax, Math.max(64, Math.round(rect.width / 6)));
    const h = Math.max(64, Math.round(w * aspect));
    let cv = this.maskCanvas;
    if (!cv || cv.width !== w || cv.height !== h) {
      cv = document.createElement("canvas");
      cv.width = w;
      cv.height = h;
      this.maskCanvas = cv;
    }
    const ctx = cv.getContext("2d");
    if (!ctx) return false;
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";
    for (const f of fog) {
      const wc = gridToWorld(f.col, f.row);
      const mx = ((wc.x - rect.x) / rect.width) * w;
      const my = ((wc.y - rect.y) / rect.height) * h;
      const rpx = ((f.radius * TILE_WIDTH) / rect.width) * w;
      const dens = Math.max(0, Math.min(1, f.density));
      const grad = ctx.createRadialGradient(mx, my, rpx * 0.15, mx, my, Math.max(2, rpx));
      grad.addColorStop(0, `rgba(255,255,255,${dens})`);
      grad.addColorStop(0.6, `rgba(255,255,255,${dens * 0.6})`);
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(mx, my, Math.max(2, rpx), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
    // Textur IN PLACE aktualisieren (refresh) statt remove+addCanvas: sonst zeigt
    // das Masken-Image eine entfernte Texturreferenz (Naht-Bug nach Undo/Redo-
    // Ketten) und es leckt CanvasTextures. Das Canvas-Objekt bleibt stabil
    // (Rect je Instanz fix), darum genuegt ein refresh ab dem zweiten Backen.
    if (this.scene.textures.exists(this.maskKey)) {
      (this.scene.textures.get(this.maskKey) as Phaser.Textures.CanvasTexture).refresh();
    } else {
      this.scene.textures.addCanvas(this.maskKey, cv);
    }
    return true;
  }

  /**
   * Prozedurale, nahtlos kachelnde Schwaden-Textur (periodisches Plasma -> kein
   * sichtbarer Loop): weisse Wolken in der Alpha, Farbe kommt vom TileSprite-Tint.
   * Einmal pro Scene gebaut und geteilt.
   */
  private static ensureWispTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists(WISP_KEY)) return;
    const n = WISP_RES;
    const cv = document.createElement("canvas");
    cv.width = n;
    cv.height = n;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const img = ctx.createImageData(n, n);
    const d = img.data;
    const TAU = Math.PI * 2;
    // Periodisches Plasma: NUR ganzzahlige Frequenzen -> exakt kachelbar (kein
    // Domain-Warp, der eine Naht quer uebers Bild risse). Sieben Terme im Gain~0.5-
    // Abfall (1.0..0.1), die zwei hochfrequenten geben FBM-artige Granularitaet.
    const terms = [
      { fx: 1, fy: 2, px: 0.3, py: 0.0, a: 1.0 },
      { fx: 3, fy: 1, px: 0.0, py: 0.5, a: 0.6 },
      { fx: 2, fy: 3, px: 0.7, py: 0.2, a: 0.45 },
      { fx: 5, fy: 4, px: 0.1, py: 0.8, a: 0.28 },
      { fx: 4, fy: 6, px: 0.9, py: 0.3, a: 0.2 },
      { fx: 7, fy: 5, px: 0.35, py: 0.6, a: 0.14 },
      { fx: 6, fy: 8, px: 0.15, py: 0.05, a: 0.1 },
    ];
    let ampSum = 0;
    for (const t of terms) ampSum += t.a;
    const ss = (e0: number, e1: number, x: number): number => {
      const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
      return t * t * (3 - 2 * t);
    };
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const u = x / n;
        const v = y / n;
        let s = 0;
        for (const t of terms) {
          s += t.a * Math.sin(TAU * (t.fx * u + t.px)) * Math.cos(TAU * (t.fy * v + t.py));
        }
        // s in ~[-ampSum, ampSum] -> 0..1, dann Schwell-Maske smoothstep(0.42,0.72):
        // unteres Drittel = transparente Loecher (Durchsicht), oberes = lesbare Ballen.
        let c = 0.5 + 0.5 * (s / ampSum);
        c = ss(ATMO_FOG.edgeLo, ATMO_FOG.edgeHi, c);
        const a = Math.round(Math.min(ATMO_FOG.texMax, c) * 255); // Spitze gedeckelt
        const i = (y * n + x) * 4;
        d[i] = 255;
        d[i + 1] = 255;
        d[i + 2] = 255;
        d[i + 3] = a;
      }
    }
    ctx.putImageData(img, 0, 0);
    scene.textures.addCanvas(WISP_KEY, cv);
  }
}
