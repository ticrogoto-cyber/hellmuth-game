// EditorScene: der Karteneditor als zweite Phaser-Szene. Nutzt denselben
// Renderer, dieselbe Iso-Mathematik (160x96) und dieselbe Y-Sortierung wie das
// Spiel -- "was der Editor zeigt, IST das Spiel" (Blueprint V3 §2.1). Die Karte
// ist DATEN (MapData), das Bild ist Fassade.
//
// Werkzeuge (§2.3 / Briefing §10): Terrain-Pinsel (Splat), Decal-Streupinsel,
// Objekt-Platzierung (Baeume/Felsen/Vorkommen/Startpunkte), Nebel-Quellen
// (Platzhalter), Radierer, Undo, Speichern/Laden. Das Organik-Gesetz (§7) wird
// vom Werkzeug erzwungen, nicht dem Kartenbauer abverlangt: Uebergaenge loest der
// Renderer, Streuung variiert automatisch in Variante/Spiegelung/Groesse.

import Phaser from "phaser";
import { TILE_WIDTH, screenToGrid } from "../util/iso";
import { WORLD_ORIGIN_X, WORLD_ORIGIN_Y, gridToWorld } from "../util/world";
import {
  type MapData,
  type MapDecal,
  type MapDoodad,
  type MapNode,
  type MapSpawn,
  type MapFog,
  type MapBuilding,
  loadMap,
  createEmptyMap,
  serializeMap,
} from "../maps/map_format";
import {
  GROUND_SORTS,
  DECAL_SETS,
  enqueueTerrainLoads,
  buildTerrainRegistry,
  buildDecalCutouts,
  decalById,
  factionTargetSortId,
  type TerrainRegistry,
} from "./terrain_assets";
import { TerrainRenderer } from "./terrain_render";
import { TerrainTransform } from "./terrain_transform";
import { FogRenderer } from "./fog_render";
import { mistStats } from "../fx/ground_mist";
import { runGate } from "./gate";
// Direktimport der buildings.json: der Editor braucht faction/Footprint fuer den
// Gebaeude-Katalog. Tier/Cap der Destille teilen wir ueber die balance-Konstanten
// MIT dem BuildSystem (Code3 / DESTILLAT-SYSTEM) -- EIN Wahrheitsort, EINE Zahl.
import buildingsJson from "../../game/data/buildings.json";
import type { BuildingDef, BuildingTable } from "../data/loader";
import { DESTILLE_MAX, DESTILLE_TIER, ATMO_FOG, DOODADS } from "../data/balance";
import { rand2, fbm2, smoothstep } from "./noise";
// CODE4 PROP-SCATTERING: reines Modul (kein Phaser). Der Editor traegt hier nur
// die Bruecke Scene <-> pures Modul: liest den aktuellen Karten-Zustand,
// treibt scatterProps, schiebt die Ausgabe in stroke.addedDoodads und rendert
// per mvDrawObject. Der Determinismus lebt im Modul, nicht hier.
import {
  scatterProps as propScatter,
  PRESETS as SCATTER_PRESETS,
  type ScatterCategory,
  type ScatterMapProjection,
} from "../systems/prop_scatter";
import {
  renderMapContent,
  clearMapView,
  drawDecal as mvDrawDecal,
  drawObject as mvDrawObject,
  drawNode as mvDrawNode,
  type MapViewHandles,
} from "./map_view";
import { SPRITE_MANIFEST } from "../data/sprites";

const MAPS = import.meta.glob("../../game/maps/*.hellmuth.json", { eager: true }) as Record<
  string,
  { default?: unknown }
>;

export type ToolId =
  | "terrain"
  | "decal"
  | "object"
  | "node"
  | "spawn"
  | "fog"
  | "building"
  | "streu"
  | "erase";

export interface ToolState {
  tool: ToolId;
  /** Terrain: aktive Sorte (Index in GROUND_SORTS / map.groundTypes). */
  sortIdx: number;
  /** Decal-Satz-Id. */
  decalSet: string;
  /** Objekt-Schluessel (DOODADS / NODE) der Platzierung. */
  objectKey: string;
  /** Knoten-Typ (hain/quelle/destillatsickerung). */
  nodeType: string;
  /** Spieler 1/2 fuer Startpunkt. */
  spawnPlayer: number;
  /** Aktiver Gebaeude-Typ (DESTILLAT-SYSTEM): wird von der HTML-Palette gesetzt. */
  buildingKey: string;
  /** Aktive Fraktion des Gebaeude-Werkzeugs (hellmuth/moderat). */
  buildingFaction: "hellmuth" | "moderat";
  /** Pinselradius in Kacheln. */
  size: number;
  /** Deckkraft 0..1 (Terrain) bzw. Dichte (Streupinsel). */
  strength: number;
  /** Haerte 0..1: 1 = harter Kern bis zum Rand, 0 = weicher Verlauf ab Zentrum. */
  hardness: number;
  /** Streu-Werkzeug (CODE4 Prop-Scatter): Kategorie fels/baum/wald/streu. */
  scatterCategory: "fels" | "baum" | "wald" | "streu";
  /** Streu-Werkzeug: ganzzahliger Seed. Gleicher Seed -> gleicher Wurf. */
  scatterSeed: number;
  /** Streu-Werkzeug: aktives Dichte-Preset ('duenn'|'zielbild'|'dicht'). */
  scatterPresetName: "duenn" | "zielbild" | "dicht";
}

/** Ein Bearbeitungsstrich als Diff (Strang 5): ein Undo-Eintrag pro Strich. */
interface EditStroke {
  /** cellKey (r*cols+c) -> Gewichtsvektor vor/nach dem Strich. */
  terrain: Map<number, { before: number[]; after: number[] }>;
  addedDecals: MapDecal[];
  addedDoodads: MapDoodad[];
  addedNodes: MapNode[];
  removedDecals: MapDecal[];
  removedDoodads: MapDoodad[];
  removedNodes: MapNode[];
  addedFog: MapFog[];
  removedFog: MapFog[];
  /** Vorplatzierte Fraktionsgebaeude (DESTILLAT-SYSTEM, Strang 5 Diff). */
  addedBuildings: MapBuilding[];
  removedBuildings: MapBuilding[];
  spawnBefore?: MapSpawn[];
  spawnAfter?: MapSpawn[];
}

/** Objekt-Katalog fuer die UI: Gruppen aus dem vorhandenen DOODAD-/Node-Bestand. */
export const OBJECT_CATALOG: { group: string; keys: string[] }[] = [
  { group: "Baeume", keys: ["baum-1", "baum-2", "baum-tot", "baumgruppe", "wald"] },
  { group: "Felsen", keys: ["fels-1", "fels-2", "felskante", "felssaeule"] },
  { group: "Streu", keys: ["streu-1", "streu-2", "streu-3", "streu-4", "streu-5", "streu-6", "streu-7"] },
];
export const NODE_CATALOG = ["hain", "quelle", "destillatsickerung"];

// Gebaeude-Katalog des Editors: gefiltert aus buildings.json (`baubar: true`),
// damit Truppen-Vorposten/HQ-Eintraege nicht in der Setz-Palette landen. Per-Typ
// werden faction + tier + max_per_player + Footprint gespiegelt, NICHTS Anderes;
// der Editor braucht keine HP/Kosten/Kampfwerte (Gameplay-Logik = Code3).
// Deutsche Plural-Formen je name (Cap-Reason-Text). Nicht algorithmisch: deutsche
// Pluralregeln sind unregelmaessig (Apotheke -> Apotheken, Beet -> Beete, Labor ->
// Labore, Destille -> Destillen, Vorposten -> Vorposten). Lookup pro name; Default
// ist der Singular (besser kein Buchstabe als ein falscher).
const BUILDING_PLURAL: Record<string, string> = {
  Apotheke: "Apotheken",
  Beet: "Beete",
  Labor: "Labore",
  Destille: "Destillen",
  Vorposten: "Vorposten",
  Kuratorium: "Kuratorien",
  Zuckermaschine: "Zuckermaschinen",
  Raffinerie: "Raffinerien",
  Schlickwerk: "Schlickwerke",
  Gaertank: "Gaertanks",
};

const BUILDING_JSON = buildingsJson as Record<string, BuildingDef>;
// Destille-spezifische Cap/Tier-Werte kommen aus balance.ts (von Code3 erzwungen
// im BuildSystem); der Editor liest dieselben Konstanten -> garantierter Gleich-
// klang. Andere Gebaeude koennten kuenftig eigene tier/max_per_player tragen
// (BuildingDef erlaubt es) -- dann greift der JSON-Fallback.
const BUILDING_DEFS: Record<string, { name: string; faction: "hellmuth" | "moderat"; max: number | null; tier: number | null; w: number; h: number }> = (() => {
  const out: Record<string, { name: string; faction: "hellmuth" | "moderat"; max: number | null; tier: number | null; w: number; h: number }> = {};
  for (const [k, def] of Object.entries(BUILDING_JSON)) {
    if (def.role === "resource") continue; // Vorkommen sind keine baubaren Gebaeude
    if (!def.baubar) continue;
    const isDestille = k === "destille";
    out[k] = {
      name: def.name ?? k,
      faction: def.faction === "moderat" ? "moderat" : "hellmuth",
      max: isDestille ? DESTILLE_MAX : def.max_per_player ?? null,
      tier: isDestille ? DESTILLE_TIER : def.tier ?? null,
      w: def.grundflaeche?.w ?? 1,
      h: def.grundflaeche?.h ?? 1,
    };
  }
  return out;
})();

export class EditorScene extends Phaser.Scene {
  private reg!: TerrainRegistry;
  private terrain!: TerrainRenderer;
  private transform!: TerrainTransform;
  private transformClock = 1e6; // monotone Synthetik-Uhr fuer pumpTransform (Test)
  private fog!: FogRenderer; // VFX Strang 1: Welt-Nebel (Livevorschau im Editor)
  private map!: MapData;

  // Welt-Objektebenen (Decals/Objekte/Vorkommen) -- gemeinsamer Renderpfad mit
  // dem Spiel (map_view). Spawns/Fog/Cursor liegen im Overlay.
  private mapHandles: MapViewHandles = { objects: [], collision: new Set() };
  private overlay!: Phaser.GameObjects.Graphics;
  /** ?doodads=0: nur Terrain rendern (Roundtrip-Determinismus fuers Python-Gate). */
  private hideObjects = false;

  private tool: ToolState = {
    tool: "terrain",
    sortIdx: 0,
    decalSet: "moos",
    objectKey: "baum-1",
    nodeType: "hain",
    spawnPlayer: 1,
    buildingKey: "apotheke",
    buildingFaction: "hellmuth",
    size: 3,
    strength: 0.6,
    hardness: 0.5,
    scatterCategory: "baum",
    scatterSeed: 1337,
    scatterPresetName: "zielbild",
  };

  /** BuildingTable-Projektion aus buildings.json fuer den Streu-Pass. Enthaelt
   *  Footprints, damit der reine Modul-Aufruf HQ-Sperrkreise am Zentrum sitzt.
   *  buildingsJson ist bereits ein Record<string, BuildingDef> (loader.ts kanoni-
   *  siert das Alias-Cast auf denselben Typ). */
  private readonly buildingTable: BuildingTable = buildingsJson as BuildingTable;

  // Diff-Undo (Strang 5): ein EditStroke je Strich, plus Redo. Kein Snapshot
  // (O(Karte)/Schritt, platzt bei grossen Karten).
  private undoStack: EditStroke[] = [];
  private redoStack: EditStroke[] = [];
  private stroke: EditStroke | null = null;
  private painting = false;
  private erasing = false;
  private lastPaintCell = { col: -999, row: -999 };
  private lastPaintWorld: { x: number; y: number } | null = null;
  private terrainDirty = false;

  // Kamera.
  private dragging = false;
  private dragStart = new Phaser.Math.Vector2();
  private scrollStart = new Phaser.Math.Vector2();
  private pointer = new Phaser.Math.Vector2();

  constructor() {
    super("editor");
  }

  preload(): void {
    enqueueTerrainLoads(this.load);
    // Objekt-/Knoten-Sprites aus dem Manifest (fehlende werden zu Platzhaltern).
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, () => {
      /* fehlendes Asset -> Platzhalter, kein Crash */
    });
    for (const e of SPRITE_MANIFEST) {
      if (!e.path.endsWith(".png")) continue;
      this.load.image(e.key, e.path);
    }
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#15171a");
    this.hideObjects = new URLSearchParams(location.search).get("doodads") === "0";
    this.reg = buildTerrainRegistry(this);
    buildDecalCutouts(this);
    this.map = this.initialMap();
    this.terrain = new TerrainRenderer(this, this.reg, this.map);
    this.terrain.build();
    this.transform = new TerrainTransform(this.terrain);
    this.fog = new FogRenderer(this, this.terrain.worldRect());
    this.fog.build(this.map.fog);
    // Scene-Shutdown: die per Instanz registrierte CanvasTexture lebt am GLOBALEN
    // TextureManager (game.textures), nicht an der Scene. Ohne destroy() leckt sie
    // ueber Scene-Restarts hinweg (siehe textureCount-Watchdog). Idempotent.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.fog?.destroy());

    this.overlay = this.add.graphics().setDepth(900000);
    this.renderObjects();

    // Demo der fliessenden Terrainwandlung (?transform=1): je Startpunkt eine
    // Quelle (MODERAT -> tote Erde, HELLMUTH -> Klarflur), Zielsorte je Fraktion.
    if (new URLSearchParams(location.search).get("transform") === "1") {
      for (const s of this.map.spawns) {
        const id = factionTargetSortId(s.faction === "moderat" ? "moderat" : "hellmuth");
        this.transform.add(s.col, s.row, Math.max(0, this.terrain.groundTypes.indexOf(id)), 10);
      }
    }

    this.setupCamera();
    this.setupInput();
    this.exposeApi();

    // Bereitschaftssignal fuer die Headless-Harness (nach dem ersten Aufbau).
    (window as unknown as { __editorReady?: boolean }).__editorReady = true;
  }

  // --- Karte laden / Demo --------------------------------------------------

  private initialMap(): MapData {
    const params = new URLSearchParams(location.search);
    const name = params.get("map");
    if (name) {
      const loaded = this.loadMapByName(name);
      if (loaded) return loaded;
    }
    // Variable Kartengroesse (Strang 7 Perf-Test): ?cols=64&rows=64.
    const cols = clampSize(params.get("cols"));
    const rows = clampSize(params.get("rows"));
    const map = createEmptyMap(cols, rows, GROUND_SORTS.map((s) => s.id), "Neue Karte");
    const demo = params.get("demo");
    if (demo === "blend") this.demoPaint(map);
    else if (demo === "perf") this.perfPaint(map);
    return map;
  }

  /** Fuellt eine (auch grosse) Karte flaechig mit variiertem Terrain (Perf-Test). */
  private perfPaint(map: MapData): void {
    const cells: { c: number; r: number; w: number[] }[] = [];
    for (let r = 0; r < map.rows; r++) {
      for (let c = 0; c < map.cols; c++) {
        const w = [0.2, 0, 0];
        const a = fbm2(c * 0.12, r * 0.12, 11, 3);
        const b = fbm2(c * 0.1 + 5, r * 0.1 + 5, 22, 3);
        if (a > 0.55) w[1] = Math.min(1, (a - 0.55) * 4);
        if (b > 0.6) w[2] = Math.min(1, (b - 0.6) * 4);
        if (w[1] > 0.01 || w[2] > 0.01) cells.push({ c, r, w });
      }
    }
    map.terrain = { default: 0, cells };
    map.spawns = [
      { player: 1, col: 3, row: map.rows - 4, faction: "hellmuth" },
      { player: 2, col: map.cols - 4, row: 3, faction: "moderat" },
    ];
  }

  private loadMapByName(name: string): MapData | undefined {
    for (const k of Object.keys(MAPS)) {
      if (k.endsWith(`/${name}.hellmuth.json`)) {
        const mod = MAPS[k];
        return loadMap(mod.default ?? mod);
      }
    }
    return undefined;
  }

  /** Synthetische Blobs (nur ?demo=blend): belegt das Renderer-Blending sichtbar. */
  private demoPaint(map: MapData): void {
    const cells: { c: number; r: number; w: number[] }[] = [];
    const blobs = [
      { sort: 1, cx: 12, cy: 13, r: 8 },
      { sort: 2, cx: 24, cy: 22, r: 9 },
      { sort: 1, cx: 27, cy: 9, r: 5 },
    ];
    for (let r = 0; r < map.rows; r++) {
      for (let c = 0; c < map.cols; c++) {
        const w = [0, 0, 0];
        w[0] = 0.15; // schwache Grunddeckung Tote Erde
        for (const b of blobs) {
          const dist = Math.hypot(c - b.cx, r - b.cy);
          // organischer Radius: Rausch-moduliert, damit der Blobrand nicht rund ist
          const wob = (fbm2(c * 0.25, r * 0.25, 71 + b.sort, 3) - 0.5) * 4;
          const cov = Math.max(0, Math.min(1, (b.r + wob - dist) / 3));
          w[b.sort] = Math.max(w[b.sort], cov);
        }
        if (w[1] > 0.001 || w[2] > 0.001 || w[0] !== 0.15) {
          if (w[0] === 0.15 && w[1] === 0 && w[2] === 0) continue;
          cells.push({ c, r, w });
        }
      }
    }
    map.terrain = { default: 0, cells };
    map.spawns = [
      { player: 1, col: 6, row: 30, faction: "hellmuth" },
      { player: 2, col: 30, row: 6, faction: "moderat" },
    ];
  }

  // --- Objektebenen aus den Kartendaten rendern ---------------------------

  /** Zeichnet Decals, Objekte, Knoten (gemeinsamer Pfad) + Overlay neu. */
  private renderObjects(): void {
    clearMapView(this.mapHandles);
    if (!this.hideObjects) this.mapHandles = renderMapContent(this, this.map);
    this.drawOverlay();
  }

  /** Spawns (Startpunkte), Nebel-Quellen und der Pinsel-Cursor (Overlay). */
  private drawOverlay(): void {
    this.overlay.clear();
    for (const s of this.map.spawns) {
      const w = gridToWorld(s.col, s.row);
      const col = s.faction === "moderat" ? 0xff3da5 : 0xffd25a;
      this.overlay.lineStyle(3, col, 0.95);
      this.overlay.strokeCircle(w.x, w.y, 26);
      this.overlay.lineStyle(2, col, 0.6);
      this.overlay.strokeCircle(w.x, w.y, 40);
      this.overlay.fillStyle(col, 0.18);
      this.overlay.fillCircle(w.x, w.y, 26);
    }
    for (const f of this.map.fog) {
      const w = gridToWorld(f.col, f.row);
      this.overlay.lineStyle(2, 0x9fb6c8, 0.5);
      this.overlay.strokeCircle(w.x, w.y, f.radius * TILE_WIDTH * 0.4);
    }
  }

  // --- Kamera --------------------------------------------------------------

  private setupCamera(): void {
    const r = this.terrain.worldRect();
    const m = 400;
    this.cameras.main.setBounds(r.x - m, r.y - m, r.width + 2 * m, r.height + 2 * m);
    this.fitCamera();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.fitCamera, this);
  }

  private fitCamera(): void {
    const r = this.terrain.worldRect();
    const fit = Math.min(this.scale.width / (r.width + 200), this.scale.height / (r.height + 200));
    this.cameras.main.setZoom(Math.max(0.18, fit));
    this.cameras.main.centerOn(r.x + r.width / 2, r.y + r.height / 2);
  }

  // --- Eingabe / Werkzeug-Dispatch ----------------------------------------

  private setupInput(): void {
    this.input.mouse?.disableContextMenu();

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      this.pointer.set(p.x, p.y);
      if (uiHit(p.x, p.y)) return;
      if (p.middleButtonDown()) {
        // Mitte = Kamera schwenken (rechts ist jetzt fuer Loeschen reserviert).
        this.dragging = true;
        this.dragStart.set(p.x, p.y);
        this.scrollStart.set(this.cameras.main.scrollX, this.cameras.main.scrollY);
        return;
      }
      if (p.leftButtonDown() || p.rightButtonDown()) {
        this.erasing = p.rightButtonDown(); // Rechts = loeschen/abtragen
        this.beginStroke();
        this.lastPaintWorld = null;
        this.lastPaintCell = { col: -999, row: -999 };
        this.applyToolAtPointer(p);
      }
    });

    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      this.pointer.set(p.x, p.y);
      if (this.dragging) {
        const z = this.cameras.main.zoom;
        this.cameras.main.setScroll(
          this.scrollStart.x + (this.dragStart.x - p.x) / z,
          this.scrollStart.y + (this.dragStart.y - p.y) / z,
        );
        return;
      }
      if (this.painting && (p.leftButtonDown() || p.rightButtonDown())) this.strokeTo(p);
      this.drawBrushCursor(p);
    });

    const finishStroke = () => {
      this.dragging = false;
      this.endStroke();
    };
    this.input.on(Phaser.Input.Events.POINTER_UP, finishStroke);
    // Maus verlaesst den Canvas mitten im Strich -> Strich sauber schliessen.
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, finishStroke);
    this.input.on(Phaser.Input.Events.GAME_OUT, finishStroke);

    this.input.on(
      Phaser.Input.Events.POINTER_WHEEL,
      (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
        const cam = this.cameras.main;
        const before = cam.getWorldPoint(p.x, p.y);
        const z = Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.88 : 1.14), 0.12, 3);
        cam.setZoom(z);
        const after = cam.getWorldPoint(p.x, p.y);
        cam.setScroll(cam.scrollX + (before.x - after.x), cam.scrollY + (before.y - after.y));
      },
    );

    const kb = this.input.keyboard;
    kb?.on("keydown-Z", (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.shiftKey) this.redo();
        else this.undo();
      }
    });
    kb?.on("keydown-Y", (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) this.redo();
    });
    // Werkzeug-Schnellwahl 1/2/3 + Tab (Strang 5).
    const order: ToolId[] = ["terrain", "decal", "object", "node", "spawn", "fog", "erase"];
    kb?.on("keydown-ONE", () => this.setToolId("terrain"));
    kb?.on("keydown-TWO", () => this.setToolId("decal"));
    kb?.on("keydown-THREE", () => this.setToolId("object"));
    kb?.on("keydown-TAB", (e: KeyboardEvent) => {
      e.preventDefault();
      const i = order.indexOf(this.tool.tool);
      this.setToolId(order[(i + 1) % order.length]);
    });
    // Kamera per Pfeiltasten.
    this.cursors = kb?.createCursorKeys();
  }

  /** Setzt das aktive Werkzeug (Tastatur) und spiegelt es in die UI. */
  private setToolId(t: ToolId): void {
    this.tool.tool = t;
    (window as unknown as { __editorToolChanged?: (t: ToolId) => void }).__editorToolChanged?.(t);
  }

  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;

  update(time: number, delta: number): void {
    this.fog.update(time, delta); // VFX Strang 1: Nebel-Drift
    if (this.transform.tick(time)) this.terrainDirty = true; // VFX Strang 2
    if (this.cursors) {
      const cam = this.cameras.main;
      const d = (500 * delta) / 1000 / cam.zoom;
      if (this.cursors.left?.isDown) cam.scrollX -= d;
      if (this.cursors.right?.isDown) cam.scrollX += d;
      if (this.cursors.up?.isDown) cam.scrollY -= d;
      if (this.cursors.down?.isDown) cam.scrollY += d;
    }
    if (this.terrainDirty) {
      this.terrain.recompositeDirty();
      this.terrainDirty = false;
    }
    this.terrain.updateCull(this.cameras.main); // Strang 7: nur Sichtbares zeichnen
  }

  private pointerToGrid(p: Phaser.Input.Pointer): { col: number; row: number } {
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    return screenToGrid(w.x - WORLD_ORIGIN_X, w.y - WORLD_ORIGIN_Y);
  }

  private applyToolAtPointer(p: Phaser.Input.Pointer): void {
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    const ev = p.event as MouseEvent | undefined;
    this.applyAtWorld(w.x, w.y, { ctrl: !!(ev?.ctrlKey || ev?.metaKey), shift: !!ev?.shiftKey, alt: !!ev?.altKey });
  }

  /** Strich mit Zwischenpunkt-Interpolation (kein Lueckenstottern bei schnellem Zug). */
  private strokeTo(p: Phaser.Input.Pointer): void {
    const t = this.tool.tool;
    // Einzelplatzierungen (Objekt/Knoten/Start/Gebaeude/Streu) feuern nur beim
    // Klick, nicht im Zug. Streu-Werkzeug: EIN Klick = EIN Bulk-Emit; ein Drag
    // wuerde sonst mehrere ueberlappende Streu-Kreise erzeugen.
    if (!this.erasing && (t === "object" || t === "node" || t === "spawn" || t === "building" || t === "streu")) return;
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    const ev = p.event as MouseEvent | undefined;
    const mods = { ctrl: !!(ev?.ctrlKey || ev?.metaKey), shift: !!ev?.shiftKey, alt: !!ev?.altKey };
    if (this.lastPaintWorld) {
      const dx = w.x - this.lastPaintWorld.x;
      const dy = w.y - this.lastPaintWorld.y;
      const steps = Math.max(1, Math.floor(Math.hypot(dx, dy) / (TILE_WIDTH * 0.4)));
      for (let s = 1; s <= steps; s++) {
        this.applyAtWorld(this.lastPaintWorld.x + (dx * s) / steps, this.lastPaintWorld.y + (dy * s) / steps, mods);
      }
    } else {
      this.applyAtWorld(w.x, w.y, mods);
    }
    this.lastPaintWorld = { x: w.x, y: w.y };
  }

  private applyAtWorld(wx: number, wy: number, mods: { ctrl: boolean; shift: boolean; alt: boolean }): void {
    const g = screenToGrid(wx - WORLD_ORIGIN_X, wy - WORLD_ORIGIN_Y);
    const col = Math.floor(g.col);
    const row = Math.floor(g.row);
    if (this.erasing) {
      this.eraseActive(g.col, g.row);
      this.lastPaintCell = { col, row };
      return;
    }
    switch (this.tool.tool) {
      case "terrain":
        if (mods.ctrl) {
          this.pipette(col, row);
        } else if (mods.alt) {
          this.smoothTerrain(g.col, g.row);
        } else if (mods.shift && this.lastPaintCell.col > -900) {
          this.lineTerrain(this.lastPaintCell.col, this.lastPaintCell.row, g.col, g.row);
        } else {
          this.paintTerrain(g.col, g.row, this.tool.sortIdx);
        }
        break;
      case "erase":
        this.eraseAt(g.col, g.row);
        break;
      case "decal":
        this.scatterDecals(g.col, g.row);
        break;
      case "object":
        this.placeObject(col, row);
        break;
      case "node":
        this.placeNode(col, row);
        break;
      case "spawn":
        this.placeSpawn(col, row);
        break;
      case "building":
        // KEIN eigener beginStroke/endStroke: POINTER_DOWN hat den Strich bereits
        // geoeffnet (analog object/node/spawn). Die Cap-Pruefung sitzt in
        // placeBuilding (liefert undefined, wenn der 4. Klick auf eine 3er-Sorte
        // trifft -- Klick wirkt unsichtbar; der UI-Katalog markiert disabled).
        this.placeBuilding(col, row, this.tool.buildingKey, this.tool.buildingFaction);
        break;
      case "fog":
        this.placeFog(g.col, g.row);
        break;
      case "streu":
        this.applyScatter(g.col, g.row);
        break;
    }
    this.lastPaintCell = { col, row };
  }

  // --- Werkzeuge -----------------------------------------------------------

  private paintTerrain(ccol: number, crow: number, sortIdx: number): void {
    const rad = this.tool.size;
    const hard = this.tool.hardness;
    for (let r = Math.floor(crow - rad); r <= Math.ceil(crow + rad); r++) {
      for (let c = Math.floor(ccol - rad); c <= Math.ceil(ccol + rad); c++) {
        const dist = Math.hypot(c + 0.5 - ccol, r + 0.5 - crow);
        if (dist > rad) continue;
        // Haerte-Plateau: voll bis rad*hardness, dann smooth auf 0 am Rand.
        const falloff = 1 - smoothstep(rad * hard, rad, dist);
        const amount = this.tool.strength * falloff;
        if (amount <= 0) continue;
        this.recBefore(c, r);
        this.terrain.addWeight(c, r, sortIdx, amount);
        this.recAfter(c, r);
      }
    }
    this.markTerrainDirty(ccol, crow, rad);
  }

  /** Markiert die Terrain-Region unter dem Pinsel als dirty (Neukomposition). */
  private markTerrainDirty(ccol: number, crow: number, rad: number): void {
    const w = gridToWorld(ccol, crow);
    this.terrain.markDirtyWorldRect(w.x - rad * TILE_WIDTH, w.y - rad * TILE_WIDTH, rad * TILE_WIDTH * 2, rad * TILE_WIDTH * 2);
    this.terrainDirty = true;
  }

  // --- Diff-Aufzeichnung fuer Undo ----------------------------------------

  private recBefore(c: number, r: number): void {
    if (!this.stroke || c < 0 || r < 0 || c >= this.map.cols || r >= this.map.rows) return;
    const k = r * this.map.cols + c;
    if (!this.stroke.terrain.has(k)) this.stroke.terrain.set(k, { before: this.terrain.getCellWeights(c, r), after: [] });
  }
  private recAfter(c: number, r: number): void {
    if (!this.stroke || c < 0 || r < 0 || c >= this.map.cols || r >= this.map.rows) return;
    const e = this.stroke.terrain.get(r * this.map.cols + c);
    if (e) e.after = this.terrain.getCellWeights(c, r);
  }

  // --- Rechtsklick: Loeschen/Abtragen (Strang 5) --------------------------

  private eraseActive(ccol: number, crow: number): void {
    const t = this.tool.tool;
    if (t === "terrain") {
      this.eraseTerrain(ccol, crow);
      return;
    }
    const rad = this.tool.size;
    if (t === "decal" || t === "erase") this.removeDecals(ccol, crow, rad);
    if (t === "object" || t === "erase") this.removeDoodads(ccol, crow, rad);
    if (t === "node" || t === "erase") this.removeNodes(ccol, crow, rad);
    if (t === "fog" || t === "erase") this.removeFog(ccol, crow, rad);
    // Streu-Werkzeug: Loeschmodus. Rechte Maustaste in Kreis-Radius entfernt
    // NUR Doodads der aktiven Kategorie (kein Terrain, keine Nodes/Buildings).
    if (t === "streu") this.removeDoodadsByCategory(ccol, crow, rad, this.tool.scatterCategory);
    this.renderObjects();
  }

  /** Trägt den aktiven Bodentyp ab (rechts auf Terrain). */
  private eraseTerrain(ccol: number, crow: number): void {
    const rad = this.tool.size;
    const sortIdx = this.tool.sortIdx;
    for (let r = Math.floor(crow - rad); r <= Math.ceil(crow + rad); r++) {
      for (let c = Math.floor(ccol - rad); c <= Math.ceil(ccol + rad); c++) {
        const dist = Math.hypot(c + 0.5 - ccol, r + 0.5 - crow);
        if (dist > rad || c < 0 || r < 0 || c >= this.map.cols || r >= this.map.rows) continue;
        const falloff = 1 - smoothstep(rad * this.tool.hardness, rad, dist);
        if (falloff <= 0) continue;
        this.recBefore(c, r);
        const w = this.terrain.getCellWeights(c, r);
        w[sortIdx] = Math.max(0, w[sortIdx] - this.tool.strength * falloff);
        if (w.every((x) => x <= 0)) w[this.terrain.defaultIdx] = 1; // nie leer
        this.terrain.setCellWeights(c, r, w);
        this.recAfter(c, r);
      }
    }
    this.markTerrainDirty(ccol, crow, rad);
  }

  private removeDecals(ccol: number, crow: number, rad: number): void {
    const keep: MapDecal[] = [];
    for (const d of this.map.decals) {
      if ((d.col - ccol) * (d.col - ccol) + (d.row - crow) * (d.row - crow) <= rad * rad) this.stroke?.removedDecals.push(d);
      else keep.push(d);
    }
    this.map.decals = keep;
  }
  private removeDoodads(ccol: number, crow: number, rad: number): void {
    const keep: MapDoodad[] = [];
    for (const o of this.map.doodads) {
      if ((o.col - ccol) * (o.col - ccol) + (o.row - crow) * (o.row - crow) <= rad * rad) this.stroke?.removedDoodads.push(o);
      else keep.push(o);
    }
    this.map.doodads = keep;
  }
  private removeNodes(ccol: number, crow: number, rad: number): void {
    const keep: MapNode[] = [];
    for (const n of this.map.nodes) {
      if ((n.col - ccol) * (n.col - ccol) + (n.row - crow) * (n.row - crow) <= rad * rad) this.stroke?.removedNodes.push(n);
      else keep.push(n);
    }
    this.map.nodes = keep;
  }

  /** Pipette: dominanten Bodentyp aufnehmen (Strg auf Terrain). */
  private pipette(col: number, row: number): void {
    this.tool.sortIdx = this.terrain.dominantSort(col, row);
    (window as unknown as { __editorSortChanged?: (i: number) => void }).__editorSortChanged?.(this.tool.sortIdx);
  }

  /** 3x3-Glaettung der Gewichte im Pinselradius (Alt auf Terrain). */
  private smoothTerrain(ccol: number, crow: number): void {
    const rad = this.tool.size;
    const writes: { c: number; r: number; w: number[] }[] = [];
    for (let r = Math.floor(crow - rad); r <= Math.ceil(crow + rad); r++) {
      for (let c = Math.floor(ccol - rad); c <= Math.ceil(ccol + rad); c++) {
        if ((c + 0.5 - ccol) * (c + 0.5 - ccol) + (r + 0.5 - crow) * (r + 0.5 - crow) > rad * rad || c < 0 || r < 0 || c >= this.map.cols || r >= this.map.rows) continue;
        const acc = this.terrain.getCellWeights(c, r).map(() => 0);
        let n = 0;
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++) {
            const nw = this.terrain.getCellWeights(c + dc, r + dr);
            for (let k = 0; k < acc.length; k++) acc[k] += nw[k];
            n++;
          }
        writes.push({ c, r, w: acc.map((x) => x / n) });
      }
    }
    for (const wr of writes) {
      this.recBefore(wr.c, wr.r);
      this.terrain.setCellWeights(wr.c, wr.r, wr.w);
      this.recAfter(wr.c, wr.r);
    }
    this.markTerrainDirty(ccol, crow, rad);
  }

  /** Gerade Linie malen (Shift): zwischen letztem und aktuellem Punkt. */
  private lineTerrain(c0: number, r0: number, c1: number, r1: number): void {
    const steps = Math.max(1, Math.ceil(Math.hypot(c1 - c0, r1 - r0) / 0.4));
    for (let s = 0; s <= steps; s++) {
      this.paintTerrain(c0 + ((c1 - c0) * s) / steps, r0 + ((r1 - r0) * s) / steps, this.tool.sortIdx);
    }
  }

  private eraseAt(ccol: number, crow: number): void {
    // Radierer-Werkzeug: Terrain auf Default, Objekte/Decals/Knoten im Radius weg.
    const rad = this.tool.size;
    for (let r = Math.floor(crow - rad); r <= Math.ceil(crow + rad); r++) {
      for (let c = Math.floor(ccol - rad); c <= Math.ceil(ccol + rad); c++) {
        if ((c + 0.5 - ccol) * (c + 0.5 - ccol) + (r + 0.5 - crow) * (r + 0.5 - crow) > rad * rad || c < 0 || r < 0 || c >= this.map.cols || r >= this.map.rows) continue;
        this.recBefore(c, r);
        this.terrain.setCell(c, r, this.terrain.defaultIdx);
        this.recAfter(c, r);
      }
    }
    this.markTerrainDirty(ccol, crow, rad);
    this.removeDecals(ccol, crow, rad);
    this.removeDoodads(ccol, crow, rad);
    this.removeNodes(ccol, crow, rad);
    this.renderObjects();
  }

  /**
   * Streupinsel mit Poisson-Disk-Abstand (inkrementelle Bridson-Variante): ein
   * Kandidat wird nur gesetzt, wenn kein bestehendes Decal naeher als der
   * dichteabhaengige Mindestabstand liegt -> kein Klumpen, kein Raster. Dichte
   * regelt den Radius (Recherche: rMin 0,35 .. rMax 1,4 Kachel). Auto-Jitter in
   * Variante/Rotation/Spiegelung/Groesse/Deckkraft, deterministisch aus der Lage.
   */
  private scatterDecals(ccol: number, crow: number): void {
    const set = decalById(this.tool.decalSet);
    if (!set) return;
    const rad = this.tool.size;
    const density = Math.max(0, Math.min(1, this.tool.strength));
    const minDist = 1.4 + (0.35 - 1.4) * density; // Kacheln; dichter bei hoher Dichte
    const tries = Math.max(6, Math.round(rad * rad * density * 3));
    for (let i = 0; i < tries; i++) {
      const ang = rand2(this.map.decals.length + i, i * 7 + 3, 1234) * Math.PI * 2;
      const rr = Math.sqrt(rand2(i * 13 + 1, this.map.decals.length + i * 3, 99)) * rad;
      const col = ccol + Math.cos(ang) * rr;
      const row = crow + Math.sin(ang) * rr;
      if (col < 0 || row < 0 || col >= this.map.cols || row >= this.map.rows) continue;
      let ok = true;
      for (const dd of this.map.decals) {
        if ((dd.col - col) ** 2 + (dd.row - row) ** 2 < minDist * minDist) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      const seed = (Math.round(col * 16) * 131 + Math.round(row * 16) * 977) | 0;
      const decal: MapDecal = {
        set: set.id,
        col: round3(col),
        row: round3(row),
        variant: Math.floor(rand2(seed, 1, 3) * set.keys.length),
        rot: round3(rand2(seed, 2, 5) * 360),
        scale: round3(0.7 + rand2(seed, 3, 7) * 0.6),
        alpha: round3(0.78 + rand2(seed, 4, 11) * 0.22),
        mirror: rand2(seed, 5, 13) > 0.5,
      };
      this.map.decals.push(decal);
      this.stroke?.addedDecals.push(decal);
      this.mapHandles.objects.push(...mvDrawDecal(this, decal));
    }
  }

  // ------------------------------------------------------------------
  // CODE4 PROP-SCATTERING: Bruecke Scene <-> reines Modul (src/systems/prop_scatter.ts)
  // ------------------------------------------------------------------

  /** Liest den aktuellen Kartenzustand als Lese-Projektion fuer das Streu-Modul.
   *  Kein tiefes Klonen -- das Modul mutiert die Eingabe nicht (as-designed). */
  private scatterProjection(): ScatterMapProjection {
    return {
      cols: this.map.cols,
      rows: this.map.rows,
      spawns: this.map.spawns,
      nodes: this.map.nodes,
      buildings: this.map.buildings,
      water: this.map.water,
      collision: this.map.collision,
      doodads: this.map.doodads,
    };
  }

  /** Wendet einen Streu-Klick an: Brush-Kreis um (col,row) mit tool.size, Preset
   *  aus tool.scatterPresetName, Kategorie tool.scatterCategory, Seed tool.
   *  scatterSeed. EIN Klick = EIN EditStroke (undo-atomar). */
  private applyScatter(col: number, row: number): void {
    if (col < 0 || row < 0 || col >= this.map.cols || row >= this.map.rows) return;
    const cat = this.tool.scatterCategory;
    const seed = this.tool.scatterSeed | 0;
    const result = propScatter(this.scatterProjection(), {
      seed,
      preset: this.tool.scatterPresetName,
      categories: [cat],
      area: { cx: col, cy: row, radius: this.tool.size },
      buildingTable: this.buildingTable,
    });
    for (const d of result.doodads) {
      this.map.doodads.push(d);
      this.stroke?.addedDoodads.push(d);
      this.mapHandles.objects.push(...mvDrawObject(this, d));
    }
  }

  /** Loescht Doodads einer bestimmten Task-Kategorie (fels/baum/wald/streu) im
   *  Radius rad um (ccol,crow). Nutzt die code-DoodadDef.category-Zuordnung von
   *  DOODADS -- symmetrisch zur Emissions-Kategorie im Streu-Modul. */
  private removeDoodadsByCategory(ccol: number, crow: number, rad: number, cat: ScatterCategory): void {
    const catMatches = (type: string): boolean => {
      const def = DOODADS[type];
      if (!def) return false;
      if (cat === "fels") return def.category === "rock";
      if (cat === "baum") return def.category === "tree" || def.category === "cluster";
      if (cat === "wald") return def.category === "wald";
      if (cat === "streu") return def.category === "streu";
      return false;
    };
    const keep: MapDoodad[] = [];
    for (const o of this.map.doodads) {
      const dc = o.col - ccol;
      const dr = o.row - crow;
      if (dc * dc + dr * dr <= rad * rad && catMatches(o.type)) {
        this.stroke?.removedDoodads.push(o);
      } else {
        keep.push(o);
      }
    }
    this.map.doodads = keep;
  }

  /** Live-Preview des Streu-Werkzeugs: rendert dieselben Positionen, die ein
   *  Anwenden erzeugen wuerde, als kleine Ellipsen ins Overlay. WYSIWYG. */
  private drawScatterPreview(ccol: number, crow: number): void {
    if (this.tool.tool !== "streu") return;
    const cat = this.tool.scatterCategory;
    const seed = this.tool.scatterSeed | 0;
    // Preview ist ein Dry-Run: reines Modul, keine Nebenwirkung. Wir rufen
    // dieselbe Funktion wie beim Commit -- damit ist Vorschau == Ergebnis.
    const result = propScatter(this.scatterProjection(), {
      seed,
      preset: this.tool.scatterPresetName,
      categories: [cat],
      area: { cx: ccol, cy: crow, radius: this.tool.size },
      buildingTable: this.buildingTable,
    });
    this.overlay.lineStyle(1, 0xffef6a, 0.9);
    for (const d of result.doodads) {
      const w = gridToWorld(d.col, d.row);
      this.overlay.strokeEllipse(w.x, w.y, TILE_WIDTH * 0.5, TILE_WIDTH * 0.3);
    }
  }

  private placeObject(col: number, row: number): void {
    if (col < 0 || row < 0 || col >= this.map.cols || row >= this.map.rows) return;
    const key = this.tool.objectKey;
    const seed = (col * 73856093) ^ (row * 19349663) ^ this.map.doodads.length;
    // Sub-Tile-Jitter (±0,4 Kachel): das Werkzeug erzwingt Organik, kein Objekt
    // klebt auf der Kachelmitte (Anti-Raster, Kritiker-Befund B2).
    const jcol = clamp01(col + (rand2(seed, 3, 23) - 0.5) * 0.8, this.map.cols - 1);
    const jrow = clamp01(row + (rand2(seed, 4, 29) - 0.5) * 0.8, this.map.rows - 1);
    const o: MapDoodad = {
      type: key,
      col: round3(jcol),
      row: round3(jrow),
      variant: 0,
      mirror: rand2(seed, 1, 17) > 0.5,
      scale: round3(0.82 + rand2(seed, 2, 19) * 0.46),
    };
    this.map.doodads.push(o);
    this.stroke?.addedDoodads.push(o);
    this.mapHandles.objects.push(...mvDrawObject(this, o));
  }

  private placeNode(col: number, row: number): void {
    if (col < 0 || row < 0 || col >= this.map.cols || row >= this.map.rows) return;
    const n: MapNode = { type: this.tool.nodeType, col, row };
    this.map.nodes.push(n);
    this.stroke?.addedNodes.push(n);
    this.mapHandles.objects.push(...mvDrawNode(this, n));
  }

  private placeSpawn(col: number, row: number): void {
    if (col < 0 || row < 0 || col >= this.map.cols || row >= this.map.rows) return;
    if (this.stroke && !this.stroke.spawnBefore) this.stroke.spawnBefore = this.map.spawns.map((s) => ({ ...s }));
    const player = this.tool.spawnPlayer;
    const faction = player === 2 ? "moderat" : "hellmuth";
    const existing = this.map.spawns.find((s) => s.player === player);
    if (existing) {
      existing.col = col;
      existing.row = row;
      existing.faction = faction;
    } else {
      this.map.spawns.push({ player, col, row, faction });
    }
    this.drawOverlay();
  }

  /**
   * Vorplatziertes Fraktionsgebaeude setzen (DESTILLAT-SYSTEM). Liefert das gesetzte
   * MapBuilding oder undefined, wenn es abgewiesen wird. Pruefungen in dieser
   * Reihenfolge (ein Fehler reicht zur Abweisung):
   *   1) Footprint muss komplett im Gitter liegen (col+w <= cols, row+h <= rows).
   *   2) Typ muss baubar sein (Eintrag in BUILDING_DEFS).
   *   3) Fraktion des Typs (laut buildings.json) MUSS der Aufrufer-Fraktion
   *      entsprechen -- AUSSER ?testmode=1 (dann ist der Editor frei, das ist die
   *      DESTILLAT-SYSTEM-Testmode-Ausnahme).
   *   4) Per-(Typ, Fraktion)-Cap (z. B. Destille max 3 je HELLMUTH-Spieler).
   *   5) Footprint darf sich nicht mit einem bereits platzierten Gebaeude
   *      ueberschneiden (sonst kollidieren die 2x2-Quadrate sub-Kachel).
   * Code3 erzwingt die Gameplay-Regeln (Tier-Gate, Laufzeit-Cap, HELLMUTH-Wirt-
   * Pflicht); der EDITOR erzwingt die hier sichtbaren Klick-Konsequenzen.
   */
  private placeBuilding(col: number, row: number, type: string, faction: "hellmuth" | "moderat"): MapBuilding | undefined {
    const def = this.buildingDefFor(type);
    if (!def) return undefined;
    // (1) Footprint im Gitter (nicht nur die Ankerzelle).
    if (col < 0 || row < 0 || col + def.w > this.map.cols || row + def.h > this.map.rows) return undefined;
    // (3) Fraktions-Pflicht -- testmode=1 lockert die Sicht UND die Platzierung.
    // ABER: das gespeicherte MapBuilding bekommt IMMER die Typ-Fraktion (def.faction).
    // Sonst koennte testmode-MODERAT eine destille mit faction='hellmuth' anlegen und
    // hasHellmuthDestille() spoofen (Parasit-Wirt-Pflicht), ohne dass HELLMUTH je
    // eine Destille besass. Test-Mode lockert die EINGABE, nicht die DATEN.
    const testmode = new URLSearchParams(location.search).get("testmode") === "1";
    if (def.faction !== faction && !testmode) return undefined;
    const effFaction: "hellmuth" | "moderat" = def.faction; // datentreu, nicht aufrufertreu
    // (4) Per-(Typ, Fraktion)-Cap -- jetzt gegen die effektive (Typ-)Fraktion.
    const cap = def.max;
    if (cap != null) {
      const same = this.map.buildings.filter((b) => b.type === type && b.faction === effFaction).length;
      if (same >= cap) return undefined;
    }
    // (5) Footprint-Ueberschneidung (jedes bereits platzierte Gebaeude blockt seine
    // w*h-Zellen; auch HQ-Spawns und Vorkommen blocken, aber das pruefen wir nicht
    // hier -- der Editor erlaubt bewusst Platzierungen ueber Spawns; die Spielwelt
    // verschiebt sie zur Laufzeit).
    for (const b of this.map.buildings) {
      const bdef = this.buildingDefFor(b.type);
      const bw = bdef?.w ?? 1;
      const bh = bdef?.h ?? 1;
      if (col < b.col + bw && col + def.w > b.col && row < b.row + bh && row + def.h > b.row) return undefined;
    }
    const b: MapBuilding = { type, col, row, faction: effFaction };
    this.map.buildings.push(b);
    this.stroke?.addedBuildings.push(b);
    // UI-Refresh: der Palette-Chip-Status (placed/max, disabled) muss live folgen,
    // sonst sieht der Spieler erst nach Tool-Wechsel, dass die 4. Destille gesperrt
    // ist. Defensiv (Hook optional).
    (window as unknown as { __editorBuildingChanged?: () => void }).__editorBuildingChanged?.();
    return b;
  }

  /** Loescht ein vorplatziertes Gebaeude (exakte col/row). */
  private removeBuilding(col: number, row: number, type?: string): MapBuilding | undefined {
    const i = this.map.buildings.findIndex((b) => b.col === col && b.row === row && (type === undefined || b.type === type));
    if (i < 0) return undefined;
    const [removed] = this.map.buildings.splice(i, 1);
    this.stroke?.removedBuildings.push(removed);
    (window as unknown as { __editorBuildingChanged?: () => void }).__editorBuildingChanged?.();
    return removed;
  }

  /** Minimal-Def aus buildings.json (faction + cap + tier + footprint + name),
   *  defensiv per Side-Channel-Lookup; entkoppelt vom Render-Pfad, damit der
   *  Editor ohne GameData arbeiten kann. */
  private buildingDefFor(type: string): { name: string; faction: "hellmuth" | "moderat"; max: number | null; tier: number | null; w: number; h: number } | undefined {
    return BUILDING_DEFS[type];
  }

  private placeFog(col: number, row: number): void {
    const f: MapFog = { col: round3(col), row: round3(row), radius: this.tool.size, density: this.tool.strength };
    this.map.fog.push(f);
    this.stroke?.addedFog.push(f);
    this.fog.rebuild(this.map.fog); // VFX Strang 1: Livevorschau
    this.drawOverlay();
  }

  /** Loescht fog-Quellen im Radius (Strang 1: removeFog) und zieht die Vorschau nach. */
  private removeFog(ccol: number, crow: number, rad: number): void {
    const keep: MapFog[] = [];
    for (const f of this.map.fog) {
      if ((f.col - ccol) * (f.col - ccol) + (f.row - crow) * (f.row - crow) <= rad * rad) this.stroke?.removedFog.push(f);
      else keep.push(f);
    }
    if (keep.length !== this.map.fog.length) {
      this.map.fog = keep;
      this.fog.rebuild(this.map.fog);
    }
  }

  private drawBrushCursor(p: Phaser.Input.Pointer): void {
    // Pinsel-Vorschau wird im Overlay separat gehalten? Hier nur Spawns/Fog +
    // Cursor neu. Um die Objekt-Tiefe nicht zu stoeren, zeichnen wir den Cursor
    // in dasselbe Overlay (es wird je drawOverlay-Aufruf neu aufgebaut).
    this.drawOverlay();
    if (uiHit(p.x, p.y)) return;
    const g = this.pointerToGrid(p);
    const w = gridToWorld(g.col, g.row);
    const px = this.tool.size * TILE_WIDTH * 0.5;
    this.overlay.lineStyle(1.5, 0xffffff, 0.5);
    this.overlay.strokeEllipse(w.x, w.y, px * 2, px * 1.2);
    // Streu-Werkzeug: zusaetzliche WYSIWYG-Vorschau der Kandidatenpositionen.
    if (this.tool.tool === "streu") this.drawScatterPreview(g.col, g.row);
  }

  // --- Undo / Speichern / Laden -------------------------------------------

  private beginStroke(): void {
    this.painting = true;
    this.stroke = {
      terrain: new Map(),
      addedDecals: [],
      addedDoodads: [],
      addedNodes: [],
      removedDecals: [],
      removedDoodads: [],
      removedNodes: [],
      addedFog: [],
      removedFog: [],
      addedBuildings: [],
      removedBuildings: [],
    };
  }

  private endStroke(): void {
    this.painting = false;
    this.lastPaintWorld = null;
    const s = this.stroke;
    this.stroke = null;
    if (!s) return;
    if (s.spawnBefore) s.spawnAfter = this.map.spawns.map((x) => ({ ...x }));
    const empty =
      s.terrain.size === 0 &&
      !s.addedDecals.length &&
      !s.addedDoodads.length &&
      !s.addedNodes.length &&
      !s.removedDecals.length &&
      !s.removedDoodads.length &&
      !s.removedNodes.length &&
      !s.addedFog.length &&
      !s.removedFog.length &&
      !s.addedBuildings.length &&
      !s.removedBuildings.length &&
      !s.spawnBefore;
    if (empty) return;
    this.undoStack.push(s);
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack.length = 0; // neuer Edit invalidiert Redo
  }

  private undo(): void {
    const s = this.undoStack.pop();
    if (!s) return;
    this.restoreStroke(s, false);
    this.redoStack.push(s);
  }

  private redo(): void {
    const s = this.redoStack.pop();
    if (!s) return;
    this.restoreStroke(s, true);
    this.undoStack.push(s);
  }

  /** Wendet einen Strich-Diff an (useAfter=redo) oder zurueck (useAfter=false=undo). */
  private restoreStroke(s: EditStroke, useAfter: boolean): void {
    let minC = Infinity;
    let minR = Infinity;
    let maxC = -Infinity;
    let maxR = -Infinity;
    for (const [k, e] of s.terrain) {
      const c = k % this.map.cols;
      const r = Math.floor(k / this.map.cols);
      this.terrain.setCellWeights(c, r, useAfter ? e.after : e.before);
      minC = Math.min(minC, c);
      minR = Math.min(minR, r);
      maxC = Math.max(maxC, c);
      maxR = Math.max(maxR, r);
    }
    if (s.terrain.size > 0) {
      const cs = [gridToWorld(minC, minR), gridToWorld(maxC, minR), gridToWorld(minC, maxR), gridToWorld(maxC, maxR)];
      const xs = cs.map((p) => p.x);
      const ys = cs.map((p) => p.y);
      const x0 = Math.min(...xs) - 2 * TILE_WIDTH;
      const y0 = Math.min(...ys) - 2 * TILE_WIDTH;
      this.terrain.markDirtyWorldRect(x0, y0, Math.max(...xs) - x0 + 2 * TILE_WIDTH, Math.max(...ys) - y0 + 2 * TILE_WIDTH);
      this.terrain.recompositeDirty();
    }
    const addBack = useAfter ? s.removedDecals : s.addedDecals; // entfernen
    const reAdd = useAfter ? s.addedDecals : s.removedDecals; // hinzufuegen
    this.map.decals = this.map.decals.filter((d) => !addBack.includes(d)).concat(reAdd.filter((d) => !this.map.decals.includes(d)));
    const addBackO = useAfter ? s.removedDoodads : s.addedDoodads;
    const reAddO = useAfter ? s.addedDoodads : s.removedDoodads;
    this.map.doodads = this.map.doodads.filter((o) => !addBackO.includes(o)).concat(reAddO.filter((o) => !this.map.doodads.includes(o)));
    const addBackN = useAfter ? s.removedNodes : s.addedNodes;
    const reAddN = useAfter ? s.addedNodes : s.removedNodes;
    this.map.nodes = this.map.nodes.filter((n) => !addBackN.includes(n)).concat(reAddN.filter((n) => !this.map.nodes.includes(n)));
    const addBackF = useAfter ? s.removedFog : s.addedFog;
    const reAddF = useAfter ? s.addedFog : s.removedFog;
    if (addBackF.length || reAddF.length) {
      this.map.fog = this.map.fog.filter((f) => !addBackF.includes(f)).concat(reAddF.filter((f) => !this.map.fog.includes(f)));
      this.fog.rebuild(this.map.fog); // VFX Strang 1: Vorschau nach Undo/Redo
    }
    const addBackB = useAfter ? s.removedBuildings : s.addedBuildings;
    const reAddB = useAfter ? s.addedBuildings : s.removedBuildings;
    this.map.buildings = this.map.buildings
      .filter((b) => !addBackB.includes(b))
      .concat(reAddB.filter((b) => !this.map.buildings.includes(b)));
    if (s.spawnBefore) {
      const sp = useAfter ? s.spawnAfter : s.spawnBefore;
      if (sp) this.map.spawns = sp.map((x) => ({ ...x }));
    }
    this.renderObjects();
  }

  /** Zieht das aktuelle Terrain-Gewichtsfeld in die Karte und gibt sie zurueck. */
  syncMap(): MapData {
    this.map.terrain = { default: this.terrain.defaultIdx, cells: this.terrain.exportCells() };
    this.map.groundTypes = this.terrain.groundTypes;
    this.map.cols = this.terrain.cols;
    this.map.rows = this.terrain.rows;
    return this.map;
  }

  /** Ersetzt die gesamte Karte (Laden/Undo) und baut alles neu auf. */
  applyMap(map: MapData): void {
    this.map = map;
    this.terrain.destroy();
    this.terrain = new TerrainRenderer(this, this.reg, this.map);
    this.terrain.build();
    this.transform = new TerrainTransform(this.terrain);
    // Nebel neu aufbauen (Kartengroesse -> Rect kann sich aendern). VFX Strang 1.
    this.fog.destroy();
    this.fog = new FogRenderer(this, this.terrain.worldRect());
    this.fog.build(this.map.fog);
    this.renderObjects();
  }

  // --- Oeffentliche API (UI + Headless-Harness) ---------------------------

  private exposeApi(): void {
    (window as unknown as { __editor: unknown }).__editor = {
      scene: this,
      setTool: (t: Partial<ToolState>) => Object.assign(this.tool, t),
      getTool: () => ({ ...this.tool }),
      serialize: () => serializeMap(this.syncMap()),
      load: (raw: unknown) => this.applyMap(loadMap(raw)),
      undo: () => this.undo(),
      redo: () => this.redo(),
      catalog: { sorts: GROUND_SORTS, decals: DECAL_SETS, objects: OBJECT_CATALOG, nodes: NODE_CATALOG },
      /** Roundtrip-Beweis: Re-Serialisierung nach Laden ist bit-identisch. */
      roundtripIdentical: () => {
        const a = serializeMap(this.syncMap());
        const b = serializeMap(loadMap(JSON.parse(a)));
        return a === b;
      },
      mapData: () => this.syncMap(),
      gate: () => runGate(this, this.syncMap(), this.terrain, this.reg),
      chunkStats: () => ({ total: this.terrain.chunkCount(), visible: this.terrain.visibleChunkCount() }),
      camera: () => this.cameras.main,
      // Test-Haken fuer die Undo/Redo-Pruefung (ein Strich als Diff).
      simulateStroke: (pts: { c: number; r: number }[], sortIdx: number) => {
        this.tool.size = 1;
        this.tool.strength = 1;
        this.tool.hardness = 1;
        this.beginStroke();
        for (const p of pts) this.paintTerrain(p.c + 0.5, p.r + 0.5, sortIdx);
        this.endStroke();
        this.terrain.recompositeDirty();
      },
      dominantAt: (col: number, row: number) => this.terrain.dominantSort(col, row),
      undoDepth: () => this.undoStack.length,
      redoDepth: () => this.redoStack.length,
      // Terrainwandlung (VFX Strang 2): Quelle setzen, aktive Zaehlung.
      addTransform: (cx: number, cy: number, sortIdx: number, radiusMax: number) => this.transform.add(cx, cy, sortIdx, radiusMax),
      transformActive: () => this.transform.activeCount,
      tuneTransform: (p: { softFrac?: number; softMin?: number; target?: number }) => {
        if (p.softFrac !== undefined) this.transform.softFrac = p.softFrac;
        if (p.softMin !== undefined) this.transform.softMin = p.softMin;
        if (p.target !== undefined) this.transform.target = p.target;
      },
      // Deterministisch N gedrosselte Ticks treiben (Synthetik-Uhr, fps-unabhaengig)
      // + einmal neu backen. So ist die Wandlung im Headless-Gate pruefbar, obwohl
      // die Software-Rasterung die rAF-Schleife ausbremst. Liefert die Restquellen.
      pumpTransform: (steps: number) => {
        for (let i = 0; i < steps; i++) {
          this.transformClock += 1000;
          this.transform.tick(this.transformClock);
        }
        this.terrain.recompositeDirty();
        this.terrain.updateCull(this.cameras.main);
        return this.transform.activeCount;
      },
      renderedSortAt: (col: number, row: number) => this.terrain.sampledDominant(col, row),
      debugAt: (col: number, row: number) => this.terrain.debugAt(col, row),
      groundTypes: () => [...this.terrain.groundTypes],
      textureCount: () => this.textures.getTextureKeys().length, // RT-Leck-Wache (Robustheit)
      factionSortIdx: (faction: "moderat" | "hellmuth") =>
        Math.max(0, this.terrain.groundTypes.indexOf(factionTargetSortId(faction))),
      // Welt-Nebel (VFX Strang 1): Quellen + Draw-Call-Zahl (Abnahme: konstant).
      fogStats: () => ({ count: this.map.fog.length, drawCalls: this.fog.drawCalls(), active: this.fog.isActive, layerCount: ATMO_FOG.layers.length }),
      simulateFog: (col: number, row: number, radius: number, density: number) => {
        this.tool.size = radius;
        this.tool.strength = density;
        this.beginStroke();
        this.placeFog(col, row);
        this.endStroke();
      },
      eraseFog: (col: number, row: number, radius: number) => {
        this.beginStroke();
        this.removeFog(col, row, radius);
        this.endStroke();
      },
      // Nebel-Tiefe-Gate (NEBEL-TIEFE-SPEC §5): tilePosition je Lage (Drift-
      // Determinismus) + Partikelzahl (Strang 11, heute 0 -> Pool-Leck-Wache).
      fogDrift: () => this.fog.driftState(),
      fogResetDrift: () => this.fog.resetDrift(),
      fogStep: (dtMs: number) => this.fog.step(dtMs),
      fogParticleStats: () => ({ count: mistStats().count }),
      // Kamera deterministisch auf eine Gitterzelle zentrieren (fogdepth-Testszene).
      lookAt: (col: number, row: number, zoom: number) => {
        const wp = gridToWorld(col, row);
        this.cameras.main.setZoom(zoom);
        this.cameras.main.centerOn(wp.x, wp.y);
      },
      // --- Gebaeude-Palette (DESTILLAT-SYSTEM) -----------------------------
      // Liefert die buildbaren Gebaeude FUER eine Fraktion mit UI-Status (disabled
      // + reason). MODERAT sieht HELLMUTH-only-Gebaeude NICHT (Default); ?testmode=1
      // hebt die Sicht-Sperre auf (alle Fraktionen sehen alles -- die Cap-Regel
      // bleibt). Die VISUALISIERUNG ist hier; die Spielregel sitzt im BuildSystem
      // (Code3 enforct Tier-2 + Cap zur Laufzeit).
      buildingCatalog: (faction: "hellmuth" | "moderat") => {
        const testmode = new URLSearchParams(location.search).get("testmode") === "1";
        const out: { type: string; faction: string; tier: number | null; w: number; h: number; placed: number; max: number | null; disabled: boolean; reason: string }[] = [];
        for (const [type, def] of Object.entries(BUILDING_DEFS)) {
          if (def.faction !== faction && !testmode) continue;
          const placed = this.map.buildings.filter((b) => b.type === type && b.faction === faction).length;
          let disabled = false;
          let reason = "";
          if (def.max != null && placed >= def.max) {
            disabled = true;
            // Plural-Form aus dem JSON-Namen (deutsch unregelmaessig, kein "+n"-Hack).
            const word = def.max === 1 ? def.name : BUILDING_PLURAL[def.name] ?? def.name;
            reason = `Maximum von ${def.max} ${word} erreicht`;
          }
          out.push({ type, faction: def.faction, tier: def.tier, w: def.w, h: def.h, placed, max: def.max, disabled, reason });
        }
        // Stabile Reihenfolge: tier asc (null = 1), dann type-Name.
        out.sort((a, b) => (a.tier ?? 1) - (b.tier ?? 1) || a.type.localeCompare(b.type));
        return out;
      },
      placeBuilding: (col: number, row: number, type: string, faction: "hellmuth" | "moderat") => {
        this.beginStroke();
        const b = this.placeBuilding(col, row, type, faction);
        this.endStroke();
        return b;
      },
      removeBuildingAt: (col: number, row: number, type?: string) => {
        this.beginStroke();
        const b = this.removeBuilding(col, row, type);
        this.endStroke();
        return b;
      },
      buildingsList: () => this.map.buildings.map((b) => ({ ...b })),
      buildingCount: (type: string, faction: "hellmuth" | "moderat") =>
        this.map.buildings.filter((b) => b.type === type && b.faction === faction).length,
      // Objekt-Fusspunkte in BILD-Pixeln (fuer das Python-Gate, Strang 8).
      objectsImagePx: () => {
        const cam = this.cameras.main;
        const out: { type: string; fx: number; fy: number }[] = [];
        for (const o of [...this.map.doodads, ...this.map.nodes]) {
          const wp = gridToWorld(o.col, o.row);
          out.push({
            type: o.type,
            fx: Math.round((wp.x - cam.worldView.x) * cam.zoom),
            fy: Math.round((wp.y - cam.worldView.y) * cam.zoom),
          });
        }
        return out;
      },
      // Programmatische Autorenschnittstelle: dieselben Werkzeugmethoden, die die
      // Maus-UI aufruft. So werden die Probekarten mit GENAU diesem Editor gebaut
      // (Briefing §10), reproduzierbar skriptbar.
      author: {
        reset: (cols = 36, rows = 36, name = "Karte") =>
          this.applyMap(createEmptyMap(cols, rows, GROUND_SORTS.map((s) => s.id), name)),
        setName: (n: string) => {
          this.map.name = n;
          if (!this.map.meta) this.map.meta = {};
          (this.map.meta as Record<string, unknown>).author = "editor";
        },
        brush: (col: number, row: number, sortIdx: number, size: number, strength: number) => {
          this.tool.size = size;
          this.tool.strength = strength;
          this.paintTerrain(col, row, sortIdx);
        },
        setCell: (col: number, row: number, sortIdx: number) => this.terrain.setCell(col, row, sortIdx),
        scatter: (col: number, row: number, setId: string, size: number, density: number) => {
          this.tool.decalSet = setId;
          this.tool.size = size;
          this.tool.strength = density;
          this.scatterDecals(col, row);
        },
        /** CODE4 PROP-SCATTERING (headless-tauglich): streut Doodads einer Task-
         *  Kategorie in einem Kreis um (col,row) mit dem gegebenen Preset und Seed.
         *  Symmetrisch zu 'scatter' (Decals). Rueckgabe: Anzahl neu erzeugter
         *  Doodads (fuer editor_browser.mjs Preset-Zaehlung + Perf-Gate). */
        streu: (col: number, row: number, category: ScatterCategory, size: number, preset: "duenn" | "zielbild" | "dicht" = "zielbild", seed = 1337) => {
          this.tool.scatterCategory = category;
          this.tool.scatterPresetName = preset;
          this.tool.scatterSeed = seed;
          this.tool.size = size;
          const before = this.map.doodads.length;
          this.applyScatter(col, row);
          return this.map.doodads.length - before;
        },
        /** Anwendung auf die GANZE Karte (nicht nur Brush): fuer P3-Presets und
         *  Baseline-Auto-Generierung. Fuegt in EINEM stroke ALLE Kategorien
         *  eines Presets ein, Seed wird durchgereicht. */
        streuMap: (preset: "duenn" | "zielbild" | "dicht" = "zielbild", seed = 1337, categories?: ScatterCategory[]) => {
          this.beginStroke();
          const r = propScatter(this.scatterProjection(), {
            seed,
            preset,
            categories,
            buildingTable: this.buildingTable,
          });
          for (const d of r.doodads) {
            this.map.doodads.push(d);
            this.stroke?.addedDoodads.push(d);
            this.mapHandles.objects.push(...mvDrawObject(this, d));
          }
          this.endStroke();
          return { added: r.doodads.length, stats: r.stats };
        },
        streuPresets: () => Object.keys(SCATTER_PRESETS),
        place: (col: number, row: number, key: string) => {
          this.tool.objectKey = key;
          this.placeObject(Math.round(col), Math.round(row));
        },
        node: (col: number, row: number, type: string) => {
          this.tool.nodeType = type;
          this.placeNode(Math.round(col), Math.round(row));
        },
        spawn: (player: number, col: number, row: number) => {
          this.tool.spawnPlayer = player;
          this.placeSpawn(Math.round(col), Math.round(row));
        },
        fog: (col: number, row: number, radius: number, density: number) => {
          this.tool.size = radius;
          this.tool.strength = density;
          this.placeFog(col, row);
        },
        flush: () => {
          const n = this.terrain.recompositeDirty();
          this.renderObjects();
          return n;
        },
      },
    };
  }
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function clamp01(v: number, max: number): number {
  return Math.min(max, Math.max(0, v));
}

/** Kartengroesse aus URL-Param, geklemmt 8..256, Default 36. */
function clampSize(v: string | null): number {
  const n = v ? parseInt(v, 10) : 36;
  return Number.isFinite(n) ? Math.min(256, Math.max(8, n)) : 36;
}

/** Trifft ein Bildschirmpunkt die HTML-Werkzeugleiste? (Klick nicht in die Welt.) */
function uiHit(x: number, y: number): boolean {
  const el = document.elementFromPoint(x, y);
  return !!el && !!el.closest("#editor-ui");
}
