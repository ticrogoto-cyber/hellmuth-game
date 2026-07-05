import Phaser from "phaser";
import { tilePolygon, TILE_WIDTH, TILE_HEIGHT, gridToScreen } from "../util/iso";
import {
  GRID_COLS,
  GRID_ROWS,
  WORLD_ORIGIN_X,
  WORLD_ORIGIN_Y,
  worldToTile,
  gridToWorld,
  inBounds,
} from "../util/world";
import type { GameData } from "../data/loader";
import { Unit } from "../entities/unit";
import { Building } from "../entities/building";
import { ResourceNode } from "../entities/resource_node";
import { GridEntity } from "../entities/entity";
import { GameState } from "../systems/game_state";
import { MovementSystem } from "../systems/movement_system";
import { KnockbackSystem } from "../systems/knockback";
import { SelectionSystem } from "../systems/selection_system";
import { ResourceSystem } from "../systems/resource_system";
import { BuildSystem } from "../systems/build_system";
import { ProductionSystem } from "../systems/production_system";
import { RepairSystem } from "../systems/repair_system";
import { CombatSystem } from "../systems/combat_system";
import { OrderSystem } from "../systems/order_system";
import { AiSystem } from "../systems/ai_system";
import { DestilleProduction } from "../systems/destille_production";
import { VisibilitySystem } from "../systems/visibility_system";
import { VeilSystem } from "../systems/veil_system";
import { renderMegatexture, importCollisionMask } from "../systems/map_texture";
import { installDeathFx, EVT_UNIT_DIED } from "../systems/death_fx";
import { installAudio } from "../audio/install_audio";
import type { AudioManager } from "../audio/audio_manager";
import {
  EVT_UNITS_SELECTED,
  EVT_COMMAND_MOVE,
  EVT_MATCH_START,
  EVT_VICTORY,
  EVT_DEFEAT,
} from "../systems/game_events";
import { MusicDirector } from "../audio/music_director";
import { AmbienceDirector } from "../audio/ambience_director";
import { BarkDirector } from "../audio/bark_director";
import { loadAudioManifest } from "../audio/audio_manifest";
import { ladeSprachpaket } from "../audio/audio_preload";
import { installFx, getFx } from "../fx";
import { getAuraRingSystem } from "../fx/aura_ring";
import { installHealGlow } from "../fx/heal_glow";
import { installGroundStain } from "../fx/ground_stain";
import { DoodadSystem } from "../systems/doodad_system";
import { HudScene } from "../ui/hud_scene";
import {
  UI_BUILD_REQUEST,
  UI_PRODUCE_REQUEST,
  UI_BUILD_CANCEL,
  UI_PAUSE_TOGGLE,
  UI_QUEUE_CANCEL,
} from "../ui/ui_events";
import { CONTROLS, TERRAIN, CAMERA, OCCLUDER_FADE } from "../data/balance";
import { SILHOUETTE_DEPTH } from "../util/world";
import { TERRAIN_SPRITE, UI_SPRITE, RALLY_MARKER_WIDTH } from "../data/sprites";
import { cursorFromTexture } from "../util/cursor";
import type { Owner, FactionId } from "../data/loader";
import type { MoveState, FireState, Order } from "../entities/unit";
import { TerrainRenderer } from "../editor/terrain_render";
import { TerrainTransform } from "../editor/terrain_transform";
import { FogRenderer } from "../editor/fog_render";
import { buildTerrainRegistry, buildDecalCutouts, factionTargetSortId } from "../editor/terrain_assets";
import { renderMapContent } from "../editor/map_view";
import { loadMap, type MapData } from "../maps/map_format";

// Editor-Karten (Blueprint V3 §2.1: das Spiel laedt EXAKT das Editor-Format ueber
// denselben Splat-Renderer -- kein Importer). Statisch gebuendelt fuer ?map=name.
const EDITOR_MAPS = import.meta.glob("../../game/maps/*.hellmuth.json", { eager: true }) as Record<
  string,
  { default?: unknown }
>;

// Spielerfraktion (bestimmt Bodentextur/-farbe). Spaeter aus der Fraktionswahl.
const PLAYER_FACTION: FactionId = "hellmuth";

// Platzhalter-Terrainfarben (abwechselnd, wie ein Schachbrett).
const TILE_COLOR_A = 0x2f3b34;
const TILE_COLOR_B = 0x27332d;
const TILE_BORDER = 0x1b231e;

// Kamera-Parameter.
// ZOOM_MIN ist der HARTE Floor. Code7 Tempo-Kalibrierung 2026-07-03: von 0.4
// auf 0.7 angehoben, damit die aeusserste Zoomstufe nicht mehr "Karte aus dem
// Weltraum" zeigt. Auf grossen Karten (fit < 0.7) greift dieser Floor; auf
// kleinen Karten greift stattdessen fit * (1 + CAMERA.minZoomMargin).
const ZOOM_MIN = 0.7;
const KEY_PAN_SPEED = 600;
const EDGE_PAN_MARGIN = 24;
const EDGE_PAN_SPEED = 500;

// Fester Sim-Takt (Strang 8): entkoppelt die Spiellogik von der Bildrate -> der
// Verlauf wird reproduzierbar. 30 Hz halbiert die O(n^2)-Last gegen 60.
// maxStepsPerFrame bremst die Todesspirale, wenn die Sim die Bildrate nicht haelt.
const SIM = { fixedDtMs: 1000 / 30, maxStepsPerFrame: 5 };

// Feste Startaufstellung (col, row). Genuegt fuer diese Session.
type Placement = { type: string; col: number; row: number };

// Spielerbasis oben links, Gegnerbasis unten rechts (Karte 36x36). Je Fraktion
// ein eigener Hain und eine Quelle in Basisnaehe; zwei neutrale Vorkommen in
// der umkaempften Mitte.
const PLAYER_BUILDINGS: ReadonlyArray<Placement> = [{ type: "apotheke", col: 5, row: 5 }];
const PLAYER_NODES: ReadonlyArray<Placement> = [
  { type: "hain", col: 4, row: 10 },
  { type: "quelle", col: 10, row: 4 },
];
const PLAYER_UNITS: ReadonlyArray<Placement> = [
  { type: "hellmuth", col: 6, row: 7 },
  { type: "sammler", col: 8, row: 7 },
  { type: "sammler", col: 7, row: 9 },
  { type: "sammler", col: 9, row: 8 },
  { type: "apotheker", col: 8, row: 9 },
  { type: "apotheker", col: 9, row: 9 },
  { type: "destillateur", col: 7, row: 8 },
  { type: "kurator", col: 10, row: 7 },
  { type: "alchemist", col: 6, row: 10 },
  { type: "suchfalter", col: 10, row: 10 },
];

const NEUTRAL_NODES: ReadonlyArray<Placement> = [
  { type: "hain", col: 16, row: 19 },
  { type: "quelle", col: 19, row: 16 },
];

const ENEMY_BUILDINGS: ReadonlyArray<Placement> = [
  { type: "zuckermaschine", col: 29, row: 29 },
  { type: "gaertank", col: 32, row: 29 },
  { type: "vorposten", col: 29, row: 32 },
];
const ENEMY_NODES: ReadonlyArray<Placement> = [
  { type: "hain", col: 34, row: 31 },
  { type: "quelle", col: 31, row: 34 },
];
const ENEMY_UNITS: ReadonlyArray<Placement> = [
  { type: "sirup_trupp", col: 28, row: 31 },
  { type: "sirup_trupp", col: 31, row: 28 },
  { type: "sirup_trupp", col: 30, row: 30 },
  { type: "stahlbrute", col: 27, row: 27 },
  { type: "schleuderer", col: 30, row: 27 },
  { type: "rohrkanone", col: 27, row: 30 },
  { type: "toxischer_nebler", col: 31, row: 31 },
];

/**
 * GameScene: zeichnet das isometrische Terrain, baut die Startaufstellung auf
 * und verdrahtet die Systeme (Auswahl, Bewegung, Sammeln, Bauen, Produktion).
 * Maus-Routing: links = Auswahl/Platzieren, rechts = Befehl/Rally, Mitte/WASD/
 * Edge = Kamera. HUD-Flaechen fangen Klicks ab.
 */
export class GameScene extends Phaser.Scene {
  private gameState!: GameState;
  /** Tiles in Sirup-Zonen ("col,row") aus der Kollisionsmaske (Slow-Effekt spaeter). */
  private syrupZones: Set<string> = new Set();
  private movement!: MovementSystem;
  private knockback = new KnockbackSystem();
  private selection!: SelectionSystem;
  private resourceSystem!: ResourceSystem;
  private buildSystem!: BuildSystem;
  private productionSystem!: ProductionSystem;
  private repairSystem!: RepairSystem;
  private combatSystem!: CombatSystem;
  private orderSystem!: OrderSystem;
  private aiSystem!: AiSystem;
  private destilleProduction!: DestilleProduction;
  private doodadSystem!: DoodadSystem;
  private visibilitySystem!: VisibilitySystem;
  private veilSystem!: VeilSystem;
  private hud!: HudScene;
  private matchOver = false;
  private paused = false;

  // Fester Sim-Takt + Determinismus (Strang 8).
  private simAcc = 0;
  private lastSimMs = 0;
  /** Render-Pfad-Anteil von FoW (Sichtbarkeit + Schleier) pro Frame in ms. Liegt
   *  ausserhalb des Sim-Budgets (laeuft im rAF-Sync, nicht in stepSim). */
  private lastFowRenderMs = 0;
  private testbedDriven = false; // true: nur window.__sim.step treibt die Sim
  private readonly simRng = new Phaser.Math.RandomDataGenerator(["hellmuth"]);

  private keys!: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };

  private camDragging = false;
  private camDragStart = new Phaser.Math.Vector2();
  private camScrollStart = new Phaser.Math.Vector2();
  private pointerScreen = new Phaser.Math.Vector2();
  // Dynamischer Mindestzoom: so weit raus, dass der Viewport das Bodenrechteck
  // gerade noch nicht ueberschreitet (kein schwarzer Rand). Aus terrainRect()
  // vs. Viewport abgeleitet, bei Resize neu berechnet.
  private minZoom = ZOOM_MIN;
  // Drei feste Zoomstufen (nah -> fern); das Mausrad schaltet stufenweise.
  private zoomSteps: number[] = [];
  private zoomStepIndex = CAMERA.startStep - 1;

  // Attack-Move scharf (Fadenkreuz), naechster Linksklick setzt das Ziel.
  private attackMoveArmed = false;
  // Mehrfachbau: Umschalttaste haelt den Platzierungsmodus offen.
  private shiftKey?: Phaser.Input.Keyboard.Key;
  private multiBuilding = false;
  // Halten der Entf-Taste zum Aufloesen eigener Einheiten.
  private deleteKey?: Phaser.Input.Keyboard.Key;
  private disbandHeldMs = 0;
  // Kontrollgruppen (Strg + Zahl).
  private controlGroups = new Map<number, Unit[]>();
  private rallyMarker!: Phaser.GameObjects.Graphics;
  private rallyMarkerImg?: Phaser.GameObjects.Image;
  private silhouetteLayer!: Phaser.GameObjects.Graphics;
  // Splat-Bodenrenderer + fliessende Texturwandlung -- nur bei Editor-Karten gesetzt
  // (sonst Megatextur ohne Splat). VFX Strang 2: Fraktionsgebaeude faerben um.
  private terrain?: TerrainRenderer;
  private terrainTransform?: TerrainTransform;
  private terrainDirty = false;
  private fog?: FogRenderer; // VFX Strang 1: Welt-Nebel (nur Editor-Karten)
  private musicDirector?: MusicDirector;
  private barkDirector?: BarkDirector;

  constructor() {
    super("game");
  }

  create(): void {
    const data = this.registry.get("gameData") as GameData;
    const editorMap = this.resolveEditorMap();

    // Bodenton statt Schwarz, damit am Rand keine schwarze Kante steht.
    this.cameras.main.setBackgroundColor(TERRAIN.bgColor[PLAYER_FACTION]);
    if (editorMap) {
      // Editor-Karte: derselbe Splat-Renderer wie im Editor ("was der Editor
      // zeigt, IST das Spiel"). Kein Kachelboden, keine Megatextur.
      this.terrain = this.buildEditorTerrain(editorMap);
      this.terrainTransform = new TerrainTransform(this.terrain);
      this.fog = new FogRenderer(this, this.terrain.worldRect());
      this.fog.build(editorMap.fog);
      // Scene-Shutdown: per-Instanz-CanvasTexture lebt global (game.textures);
      // ohne destroy() leckt sie ueber Scene-Restarts (siehe textureCount-Watchdog).
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.fog?.destroy());
    } else {
      this.drawTerrain();
      renderMegatexture(this);
    }
    this.silhouetteLayer = this.add.graphics().setDepth(SILHOUETTE_DEPTH);
    this.rallyMarker = this.add.graphics().setDepth(490000);

    this.gameState = new GameState(data);
    this.registry.set("gameState", this.gameState);
    // Tod-/Treffer-FX-Layer abonnieren (reine Darstellung, Event-getrieben).
    installDeathFx(this);
    // VFX Strang 2: jedes gesetzte Fraktionsgebaeude zieht die Bodensorte fliessend
    // um (MODERAT -> erde-tot, HELLMUTH -> sandlehm); Abriss faerbt zurueck. Reine
    // Darstellung im nicht gespeicherten Overlay, in die Chunk-Bakes zurueck (0 MB).
    // Wird VOR populateFromMap registriert, damit die Start-HQs gleich mitfaerben.
    this.registerTerrainRecolor();
    // Audio-Bus-Hook abonnieren (additiv, standardmaessig stumm; die
    // Dev-Mess-Bruecke ?audio-debug=1 kann ihn live schalten). Kein Eingriff in
    // Spiellogik. AudioManager wird in main.ts auf der Registry abgelegt.
    const audio = this.registry.get("audio") as AudioManager | undefined;
    const audioHook = installAudio(this, audio);
    this.registry.set("audioHook", audioHook);
    // Kamera als Listener fuer positionalen Klang (Pan/Distanz/Cull, Strang 2).
    // midPoint/worldView/zoom werden je Frame von Phaser aktualisiert.
    audio?.setCamera(this.cameras.main);
    // Inhaltsschicht (Paket C): Musik-/Ambience-/Bark-Direktoren. Reagieren auf
    // dieselben Events (kein neuer Emit-Pfad); still bis Tondateien geliefert.
    if (audio) {
      this.musicDirector = new MusicDirector(this, audio);
      this.barkDirector = new BarkDirector(this, audio);
      // Selbst-tickend ueber einen 500-ms-Timer; haengt am Scene-Lebenszyklus.
      new AmbienceDirector(this, audio);
      // Lazy Sprach-Pakete: Sprachwechsel laedt nur die fehlenden Stimm-Dateien
      // nach (selektiver Tausch, kein Rebuild). SFX/Musik bleiben unberuehrt.
      const audioManifest = loadAudioManifest();
      audio.setSpracheHook((lang) => ladeSprachpaket(this, audioManifest, lang));
      // Scene-Shutdown-Cleanup (Physik T3): laufende Voices/Streams freigeben.
      // Die Direktoren stoppen ihre Streams selbst (eigene shutdown-Hooks).
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => audio.stopAll());
    }
    // Effekt-Dienst (fx.spawn-Dispatcher + Pooling-Substrat) an die Scene haengen.
    // Tickt selbst ueber das Scene-UPDATE-Event; die konkreten Effekt-Handler
    // stecken spaeter ein. Reine Darstellung, kein Eingriff in die Spiellogik.
    installFx(this);

    if (editorMap) {
      this.populateFromMap(editorMap, data);
      this.syrupZones = new Set();
      // Leeres Doodad-System: die Karten-Doodads sind statische Bilder (map_view),
      // ihre Kollision ist bereits gesetzt; Occlusion-Listen bleiben leer.
      this.doodadSystem = new DoodadSystem(this, this.gameState, PLAYER_FACTION);
    } else {
      this.spawnInitial(data);
      // Kollisionsmaske der Megatextur ins Blocking rastern (No-op ohne Maske).
      this.syrupZones = importCollisionMask(this, this.gameState).syrup;
      // Terrain-Doodads deterministisch streuen, Hindernisse ins Pathfinding-Grid
      // eintragen und HQ-zu-HQ-Erreichbarkeit sichern (vor jedem Einheitenbefehl).
      this.doodadSystem = new DoodadSystem(this, this.gameState, PLAYER_FACTION);
      this.doodadSystem.generate();
      this.doodadSystem.applyCollision();
    }

    // Audio-Tap: Match begonnen (Set-Binding state.match_start). Einmalig nach
    // Spawn/Karte, damit die Audio-Direktoren auf den fertigen Zustand reagieren.
    this.events.emit(EVT_MATCH_START);

    this.movement = new MovementSystem(this.gameState);
    this.selection = new SelectionSystem(this, this.gameState);
    this.resourceSystem = new ResourceSystem(this.gameState, this.movement);
    this.buildSystem = new BuildSystem(this, this.gameState, this.movement, data);
    this.productionSystem = new ProductionSystem(this, this.gameState, this.movement, data);
    this.repairSystem = new RepairSystem(this, this.gameState, this.movement);
    this.combatSystem = new CombatSystem(this, this.gameState, this.movement, this.knockback);
    this.orderSystem = new OrderSystem(
      this.gameState,
      this.movement,
      this.resourceSystem,
      this.combatSystem,
    );
    this.aiSystem = new AiSystem(
      this,
      this.gameState,
      this.movement,
      this.resourceSystem,
      this.productionSystem,
    );
    // HELLMUTH autonome Destillat-Produktion (docs/DESTILLAT-SYSTEM.md).
    // Scene reicht den Audio-/VFX-Hook EVT_DESTILLAT_PRODUCED durch (Code5/4).
    this.destilleProduction = new DestilleProduction(this.gameState, this);
    // FoW Paket B (Render-Pfad): Feind-Sichtbarkeit + Schleier. Reine Verbraucher
    // des VisionGrid (Paket A) -- lesen nur, schreiben nie.
    this.visibilitySystem = new VisibilitySystem(this, this.gameState);
    this.veilSystem = new VeilSystem(this, this.gameState);

    // VFX-Layer (CODE4 VFX-ZIELBILDER): Aura-Ringe, Heil-Glow, Boden-Verschmutzung.
    getAuraRingSystem(this);
    installHealGlow(this);
    installGroundStain(this, this.gameState);

    this.setupCameraBounds();
    this.setupKeyboard();
    this.setupInput();
    this.centerCameraOnMap();
    this.installSimTestbed(data); // dev-Testbed-Bruecke window.__sim (Strang 8)

    // Diagnose: Tile-Grid + Footprint-Markierung (?grid=1) als Beleg, dass die
    // sichtbare Gebaeudegroesse der Grundflaeche entspricht.
    if (new URLSearchParams(location.search).get("grid") === "1") this.drawTileGridOverlay();

    this.scene.launch("hud");
    this.hud = this.scene.get("hud") as HudScene;
    // Alten Phaser-HUD aktiv lassen (Refs/Logik), aber NICHT rendern -- das
    // sichtbare HUD ist jetzt das HTML-Overlay (kein Diagnose-Text im Viewport).
    this.scene.setVisible(false, "hud");

    this.registerUiCommands();
  }

  // --- Aufbau ------------------------------------------------------------

  private spawnInitial(data: GameData): void {
    this.spawnGroup(data, PLAYER_BUILDINGS, PLAYER_NODES, PLAYER_UNITS, "spieler");
    this.spawnGroup(data, ENEMY_BUILDINGS, ENEMY_NODES, ENEMY_UNITS, "gegner");
    // Neutrale Vorkommen in der Kartenmitte (umkaempfter Raum).
    for (const n of NEUTRAL_NODES) {
      this.gameState.addNode(new ResourceNode(this, n.type, data.buildings[n.type], n.col, n.row));
    }
  }

  private spawnGroup(
    data: GameData,
    buildings: ReadonlyArray<Placement>,
    nodes: ReadonlyArray<Placement>,
    units: ReadonlyArray<Placement>,
    owner: Owner,
  ): void {
    for (const b of buildings) {
      this.gameState.addBuilding(
        new Building(this, b.type, data.buildings[b.type], b.col, b.row, owner, true),
      );
    }
    for (const n of nodes) {
      this.gameState.addNode(
        new ResourceNode(this, n.type, data.buildings[n.type], n.col, n.row, owner),
      );
    }
    for (const u of units) {
      this.gameState.addUnit(new Unit(this, u.type, data.units[u.type], u.col, u.row, owner));
    }
  }

  // --- Editor-Karte laden (?map=name oder ?map=__session) -----------------

  /** Loest eine Editor-Karte auf; nur 36x36 (passt zur bestehenden Engine-Gitter). */
  private resolveEditorMap(): MapData | undefined {
    const name = new URLSearchParams(location.search).get("map");
    if (!name) return undefined;
    let raw: unknown;
    if (name === "__session") {
      const t = sessionStorage.getItem("hellmuth_editor_map");
      if (!t) return undefined;
      try {
        raw = JSON.parse(t);
      } catch {
        return undefined;
      }
    } else {
      for (const k of Object.keys(EDITOR_MAPS)) {
        if (k.endsWith(`/${name}.hellmuth.json`)) {
          raw = EDITOR_MAPS[k].default ?? EDITOR_MAPS[k];
          break;
        }
      }
      if (raw === undefined) return undefined;
    }
    const map = loadMap(raw);
    if (map.cols !== GRID_COLS || map.rows !== GRID_ROWS) return undefined;
    return map;
  }

  /**
   * VFX Strang 2: Lebenszyklus-Haken, die jedes Fraktionsgebaeude eine wachsende
   * Wandlungsquelle setzen lassen (Zielsorte je Fraktion), bei Abriss zurueck.
   * No-op ohne Splat-Terrain (Megatextur-Karten haben keine Sortengewichte).
   */
  private registerTerrainRecolor(): void {
    const tf = this.terrainTransform;
    const terrain = this.terrain;
    if (!tf || !terrain) return;
    // Sortenindex je Fraktion aus der Sortenliste des Renderers (erde-tot/sandlehm/
    // steppe). Faellt auf 0 zurueck, falls eine Sorte fehlt.
    const sortIdx = (faction: FactionId): number => {
      const id = factionTargetSortId(faction === "moderat" ? "moderat" : "hellmuth");
      const i = terrain.groundTypes.indexOf(id);
      return i >= 0 ? i : 0;
    };
    const center = (b: Building) => ({
      cx: b.col + (b.footprint.w - 1) / 2,
      cy: b.row + (b.footprint.h - 1) / 2,
    });
    this.gameState.onBuildingAdded = (b) => {
      const { cx, cy } = center(b);
      // Einflussradius leicht mit der Grundflaeche skaliert, im Sweet-Spot 5..11.
      const radius = 7 + Math.max(b.footprint.w, b.footprint.h);
      tf.add(cx, cy, sortIdx(b.faction), radius);
      this.terrainDirty = true;
    };
    this.gameState.onBuildingRemoved = (b) => {
      const { cx, cy } = center(b);
      tf.reverseAt(cx, cy);
      this.terrainDirty = true;
    };
  }

  /** Baut die Splat-Bodenebene aus der Karte (gemeinsamer Renderer mit dem Editor). */
  private buildEditorTerrain(map: MapData): TerrainRenderer {
    const reg = buildTerrainRegistry(this);
    buildDecalCutouts(this);
    const t = new TerrainRenderer(this, reg, map);
    t.build();
    return t;
  }

  /**
   * Setzt Karteninhalte ins Spiel: Decals/Objekte (statisch, mit Kollision),
   * Vorkommen als ResourceNode-Entitaeten und je Startpunkt ein HQ plus drei
   * Arbeiter. Genug fuer einen spielbaren Test der Editor-Karte.
   */
  private populateFromMap(map: MapData, data: GameData): void {
    const handles = renderMapContent(this, map, { skipNodes: true });
    for (const key of handles.collision) {
      const [c, r] = key.split(",").map(Number);
      if (inBounds(c, r)) this.gameState.blockCell(c, r);
    }
    for (const n of map.nodes) {
      const def = data.buildings[n.type];
      if (def) this.gameState.addNode(new ResourceNode(this, n.type, def, n.col, n.row, n.owner));
    }
    for (const s of map.spawns) {
      const owner: Owner = s.player === 1 ? "spieler" : "gegner";
      const fac: FactionId = s.faction ?? (s.player === 2 ? "moderat" : "hellmuth");
      const hqType = fac === "moderat" ? "zuckermaschine" : "apotheke";
      const workerType = fac === "moderat" ? "sirup_trupp" : "sammler";
      if (data.buildings[hqType]) {
        this.gameState.addBuilding(new Building(this, hqType, data.buildings[hqType], s.col, s.row, owner, true));
      }
      const wdef = data.units[workerType];
      if (wdef) {
        for (let i = 0; i < 3; i++) {
          const wc = Math.min(GRID_COLS - 1, s.col + 1 + i);
          const wr = Math.min(GRID_ROWS - 1, s.row + 2);
          this.gameState.addUnit(new Unit(this, workerType, wdef, wc, wr, owner));
        }
      }
    }
    // Vorplatzierte Fraktionsgebaeude (DESTILLAT-SYSTEM, MapBuilding). Owner aus dem
    // ersten Spawn der passenden Fraktion ableiten -- ohne diese Bruecke ist die
    // Editor-Palette dekorativ (Editor-Daten wuerden nie zu Building-Entities). HQ
    // wird via map.spawns gebaut, NICHT hier (Doppel-Erzeugung vermeiden) -- also nur
    // baubare Nicht-HQ-Gebaeude (role !== "hq"); HQ gehoert ohnehin zum Spawn-Slot.
    for (const b of map.buildings) {
      const def = data.buildings[b.type];
      if (!def || def.role === "hq") continue; // nur "echte" platzierte, kein HQ-Doppel
      const ownerSpawn = map.spawns.find((s) => (s.faction ?? (s.player === 2 ? "moderat" : "hellmuth")) === b.faction);
      const owner: Owner = ownerSpawn ? (ownerSpawn.player === 1 ? "spieler" : "gegner") : (b.faction === "moderat" ? "gegner" : "spieler");
      this.gameState.addBuilding(new Building(this, b.type, def, b.col, b.row, owner, true));
    }
  }

  /** Achsenausgerichtetes Bodenrechteck (Bounding-Box des Gitters + Rand). */
  private terrainRect(): Phaser.Geom.Rectangle {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [col, row] of [
      [0, 0],
      [GRID_COLS - 1, 0],
      [0, GRID_ROWS - 1],
      [GRID_COLS - 1, GRID_ROWS - 1],
    ]) {
      const c = gridToScreen(col, row);
      const x = c.x + WORLD_ORIGIN_X;
      const y = c.y + WORLD_ORIGIN_Y;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    minX -= TILE_WIDTH / 2;
    maxX += TILE_WIDTH / 2;
    minY -= TILE_HEIGHT;
    maxY += TILE_HEIGHT;
    const b = TERRAIN.borderPx;
    return new Phaser.Geom.Rectangle(minX - b, minY - b, maxX - minX + 2 * b, maxY - minY + 2 * b);
  }

  private drawTerrain(): void {
    const key = TERRAIN_SPRITE[PLAYER_FACTION];
    // Bodentextur, falls geladen; sonst die gezeichneten Rauten.
    if (!this.textures.exists(key)) {
      this.drawTerrainPlaceholder();
      return;
    }
    // Lineare Filterung fuer die gemalte (nicht pixelige) Bodentextur: weiches
    // Skalieren statt Flimmern an Kachelraendern.
    this.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
    // Mipmaps gegen Flimmern/Matsch beim Rauszoomen (nur WebGL2 zuverlaessig).
    if (TERRAIN.mipmaps) this.tryGroundMipmaps(key);
    // Kachelmassstab zur Laufzeit aus der tatsaechlichen Texturbreite ableiten,
    // damit die Kachelgroesse (Weltpixel je Kachel) unabhaengig von der
    // Texturaufloesung ist (1254 wie 4096 ergeben dieselbe Weltgroesse).
    const texW = this.textures.get(key).source[0]?.width || TERRAIN.groundCoverageWorldPx;
    const tileScale = TERRAIN.groundCoverageWorldPx / texW;
    // Durchgehende, achsenausgerichtete Rechteckflaeche (keine Iso-Treppe).
    const r = this.terrainRect();
    this.add
      .tileSprite(r.x, r.y, r.width, r.height, key)
      .setOrigin(0, 0)
      .setDepth(-100000)
      .setTileScale(tileScale, tileScale);
  }

  /**
   * Erzeugt Mipmaps fuer die Bodentextur und setzt den Minification-Filter auf
   * trilinear, damit der Boden beim Rauszoomen scharf statt flimmrig bleibt.
   * Nur auf WebGL2 (die 1254er-Quelle ist NPOT; WebGL1 verbietet NPOT-Mipmaps).
   * Defensiv: bei Canvas-Renderer, fehlender GL-Textur oder Fehler bleibt es bei
   * linearer Filterung. Schaltbar ueber TERRAIN.mipmaps.
   */
  private tryGroundMipmaps(key: string): void {
    // Defensiv ueber `any`: Phaser 3.90 kapselt GL-Texturen in Wrapper, und die
    // Renderer-API variiert. Schlaegt irgendetwas fehl, bleibt es bei linearer
    // Filterung (Boden rendert normal weiter).
    const rendererAny = this.renderer as unknown as { gl?: WebGL2RenderingContext };
    const gl = rendererAny?.gl;
    if (!gl) return; // Canvas-Renderer: keine Mipmaps
    const isWebGL2 =
      typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;
    if (!isWebGL2) return; // WebGL1 + NPOT: Mipmaps wuerden die Textur deaktivieren
    const source = this.textures.get(key).source[0] as unknown as {
      glTexture?: WebGLTexture | { webGLTexture?: WebGLTexture };
    };
    const raw = source?.glTexture;
    const glTex =
      raw && typeof raw === "object" && "webGLTexture" in raw ? raw.webGLTexture : (raw as WebGLTexture);
    if (!glTex) return;
    try {
      gl.bindTexture(gl.TEXTURE_2D, glTex);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    } catch {
      // Bleibt bei linearer Filterung; im Zweifel ueber TERRAIN.mipmaps deaktivieren.
    } finally {
      // Neutralen Bind-Zustand hinterlassen; Phasers Pipeline bindet pro Batch neu.
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
  }

  private drawTerrainPlaceholder(): void {
    const g = this.add.graphics();
    g.lineStyle(1, TILE_BORDER, 0.8);

    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const fill = (col + row) % 2 === 0 ? TILE_COLOR_A : TILE_COLOR_B;
        const poly = tilePolygon(col, row).map((p) => ({
          x: p.x + WORLD_ORIGIN_X,
          y: p.y + WORLD_ORIGIN_Y,
        }));

        g.fillStyle(fill, 1);
        g.beginPath();
        g.moveTo(poly[0].x, poly[0].y);
        for (let i = 1; i < poly.length; i++) g.lineTo(poly[i].x, poly[i].y);
        g.closePath();
        g.fillPath();
        g.strokePath();
      }
    }
  }

  /**
   * Diagnose-Overlay (?grid=1): zeichnet das gesamte Iso-Tile-Grid und markiert
   * jede belegte Gebaeude-Grundflaeche. Beleg fuer das Skalierungsgesetz
   * (Sprite-Grundflaeche = Footprint x Tile). Hohe Tiefe -> ueber dem Boden.
   */
  private drawTileGridOverlay(): void {
    const g = this.add.graphics().setDepth(1_000_000);
    const off = (p: { x: number; y: number }) => ({ x: p.x + WORLD_ORIGIN_X, y: p.y + WORLD_ORIGIN_Y });
    // Grid
    g.lineStyle(1, 0x000000, 0.28);
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const poly = tilePolygon(col, row).map(off);
        g.beginPath();
        g.moveTo(poly[0].x, poly[0].y);
        for (let i = 1; i < poly.length; i++) g.lineTo(poly[i].x, poly[i].y);
        g.closePath();
        g.strokePath();
      }
    }
    // Footprints aller Gebaeude markieren.
    for (const b of this.gameState.buildings) {
      g.fillStyle(0x6fd08a, 0.28);
      g.lineStyle(2, 0xffd25a, 0.95);
      for (const t of b.footprintTiles()) {
        const poly = tilePolygon(t.col, t.row).map(off);
        g.beginPath();
        g.moveTo(poly[0].x, poly[0].y);
        for (let i = 1; i < poly.length; i++) g.lineTo(poly[i].x, poly[i].y);
        g.closePath();
        g.fillPath();
        g.strokePath();
      }
    }
  }

  // --- UI-Befehle (Cross-Scene) -----------------------------------------

  private registerUiCommands(): void {
    const onBuild = (typeId: string) => {
      if (!this.paused) this.buildSystem.beginPlacement(typeId);
    };
    const onProduce = (typeId: string) => {
      if (this.paused) return;
      const insp = this.gameState.inspected;
      if (insp instanceof Building) this.productionSystem.enqueue(insp, typeId);
    };
    const onCancelBuild = () => {
      if (this.paused) return;
      const insp = this.gameState.inspected;
      if (insp instanceof Building && !insp.fertig && insp.owner === "spieler") {
        this.buildSystem.cancelBuild(insp);
      }
    };
    const onPauseToggle = () => this.togglePause();
    const onQueueCancel = (index: number) => {
      if (this.paused) return;
      const insp = this.gameState.inspected;
      if (insp instanceof Building) this.productionSystem.cancelQueueItem(insp, index);
    };
    this.game.events.on(UI_BUILD_REQUEST, onBuild);
    this.game.events.on(UI_PRODUCE_REQUEST, onProduce);
    this.game.events.on(UI_BUILD_CANCEL, onCancelBuild);
    this.game.events.on(UI_PAUSE_TOGGLE, onPauseToggle);
    this.game.events.on(UI_QUEUE_CANCEL, onQueueCancel);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(UI_BUILD_REQUEST, onBuild);
      this.game.events.off(UI_PRODUCE_REQUEST, onProduce);
      this.game.events.off(UI_BUILD_CANCEL, onCancelBuild);
      this.game.events.off(UI_PAUSE_TOGGLE, onPauseToggle);
      this.game.events.off(UI_QUEUE_CANCEL, onQueueCancel);
    });
  }

  // --- Eingabe -----------------------------------------------------------

  private setupInput(): void {
    this.input.mouse?.disableContextMenu();

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (this.matchOver) return;
      this.pointerScreen.set(p.x, p.y);
      if (this.hud?.containsPoint(p.x, p.y)) return;

      if (this.attackMoveArmed) {
        if (p.leftButtonDown()) {
          const w = this.cameras.main.getWorldPoint(p.x, p.y);
          if (!this.paused && this.gameState.selected.length > 0) {
            const shift = this.shiftKey?.isDown ?? false;
            this.command(this.gameState.selected, { kind: "attackMove", x: w.x, y: w.y }, shift);
          }
          this.disarmAttackMove();
        } else if (p.rightButtonDown()) {
          this.disarmAttackMove();
        }
        return;
      }

      if (this.buildSystem.isPlacing()) {
        if (p.leftButtonDown() && !this.paused) {
          const shift = this.shiftKey?.isDown ?? false;
          const placed = this.buildSystem.tryPlace(shift);
          if (placed) {
            const builders = this.gameState.selected.filter(
              (u) => u.def.kann_bauen && u.faction === placed.faction,
            );
            this.command(builders, { kind: "build", site: placed }, shift);
          }
          this.multiBuilding = placed !== undefined && shift;
        } else if (p.rightButtonDown()) {
          this.buildSystem.cancel();
          this.multiBuilding = false;
        }
        return;
      }

      if (p.middleButtonDown()) {
        this.camDragging = true;
        this.camDragStart.set(p.x, p.y);
        this.camScrollStart.set(this.cameras.main.scrollX, this.cameras.main.scrollY);
      } else if (p.leftButtonDown()) {
        this.selection.onPointerDown(p);
      } else if (p.rightButtonDown()) {
        this.handleCommand(p);
      }
    });

    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (this.matchOver) return;
      this.pointerScreen.set(p.x, p.y);

      if (this.buildSystem.isPlacing()) {
        const w = this.cameras.main.getWorldPoint(p.x, p.y);
        this.buildSystem.updateGhost(w.x, w.y);
        return;
      }

      if (this.camDragging && p.middleButtonDown() && !this.paused) {
        const zoom = this.cameras.main.zoom;
        this.cameras.main.setScroll(
          this.camScrollStart.x + (this.camDragStart.x - p.x) / zoom,
          this.camScrollStart.y + (this.camDragStart.y - p.y) / zoom,
        );
      }
      this.selection.onPointerMove(p);
    });

    this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => {
      if (this.matchOver) return;
      if (this.camDragging && !p.middleButtonDown()) this.camDragging = false;
      if (this.buildSystem.isPlacing()) return;
      this.selection.onPointerUp(p);
      // Audio-Tap: Auswahl bestaetigt (Set-Binding sel.units_selected).
      if (this.gameState.selected.length > 0) {
        this.events.emit(EVT_UNITS_SELECTED, {
          count: this.gameState.selected.length,
          faction: PLAYER_FACTION,
          unitType: this.gameState.selected[0]?.typeId,
        });
      }
    });

    this.input.on(
      Phaser.Input.Events.POINTER_WHEEL,
      (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
        if (this.matchOver || this.paused || dy === 0) return;
        // Eine feste Stufe pro Rad-Tick: vor = rein (Index runter), zurueck =
        // raus (Index hoch). An den Raendern geklemmt.
        this.zoomStepIndex = Phaser.Math.Clamp(
          this.zoomStepIndex + Math.sign(dy),
          0,
          this.zoomSteps.length - 1,
        );
        this.cameras.main.setZoom(this.zoomSteps[this.zoomStepIndex]);
      },
    );

    const kb = this.input.keyboard;
    kb?.on("keydown-ESC", () => {
      this.buildSystem.cancel();
      this.multiBuilding = false;
      this.disarmAttackMove();
    });
    // Umschalttaste loslassen beendet den Mehrfachbau-Modus.
    kb?.on("keyup-SHIFT", () => {
      if (this.multiBuilding && this.buildSystem.isPlacing()) {
        this.buildSystem.cancel();
        this.multiBuilding = false;
      }
    });
    kb?.on(`keydown-${CONTROLS.keys.attackMove}`, () => this.armAttackMove());
    kb?.on(`keydown-${CONTROLS.keys.pause}`, () => this.togglePause());
    kb?.on(`keydown-${CONTROLS.keys.stop}`, () => this.stopSelected());
    kb?.on(`keydown-${CONTROLS.keys.hold}`, () => {
      // Klassisches "Halten": Position halten + nur erwidern (kein Verfolgen).
      this.setMoveState("halten");
      this.setFireState("erwidern");
    });
    kb?.on("keydown-DELETE", () => {
      const insp = this.gameState.inspected;
      if (insp instanceof Building && !insp.fertig && insp.owner === "spieler") {
        this.buildSystem.cancelBuild(insp);
      }
    });

    // Kontrollgruppen: Strg+Zahl zuweisen, Zahl abrufen. Die Zifferntasten
    // capturen, damit Strg+Zahl NICHT den Browser-Tab wechselt; im Handler
    // zusaetzlich preventDefault/stopPropagation, sobald Strg/Meta gedrueckt ist.
    const digits = ["ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE"];
    kb?.addCapture(digits.join(","));
    digits.forEach((name, idx) => {
      kb?.on(`keydown-${name}`, (e: KeyboardEvent) => {
        const assign = e.ctrlKey || e.metaKey;
        if (assign) {
          e.preventDefault();
          e.stopPropagation();
        }
        this.handleControlGroup(idx + 1, assign);
      });
    });
  }

  // --- RTS-Befehle -------------------------------------------------------

  private armAttackMove(): void {
    if (this.matchOver || this.paused) return;
    if (this.gameState.selected.length === 0) return;
    this.attackMoveArmed = true;
    // Angriff-Icon als Cursor. Das Quell-Sprite ist fuer einen CSS-Cursor zu
    // gross (Browser ignoriert es und faellt aufs Kreuz zurueck); daher auf
    // cursor-taugliche Groesse herunterrechnen. Fehlt das Asset -> Kreuz.
    this.input.setDefaultCursor(
      cursorFromTexture(this, UI_SPRITE.attackCursor, CONTROLS.commandCursorPx, "crosshair"),
    );
  }

  private disarmAttackMove(): void {
    if (!this.attackMoveArmed) return;
    this.attackMoveArmed = false;
    this.input.setDefaultCursor("");
  }

  private togglePause(): void {
    if (this.matchOver) return;
    this.paused = !this.paused;
    if (this.paused) this.disarmAttackMove();
    this.hud.setPaused(this.paused);
  }

  private stopSelected(): void {
    if (this.matchOver || this.paused) return;
    for (const u of this.gameState.selected) u.stopAll();
  }

  private handleControlGroup(n: number, ctrl: boolean): void {
    if (this.matchOver) return;
    if (ctrl) {
      this.controlGroups.set(n, [...this.gameState.selected]);
      return;
    }
    const group = this.controlGroups.get(n);
    if (!group) return;
    const alive = group.filter((u) => this.gameState.units.includes(u));
    if (alive.length > 0) {
      this.gameState.selectUnits(alive);
      this.events.emit(EVT_UNITS_SELECTED, {
        count: alive.length,
        faction: PLAYER_FACTION,
        unitType: alive[0]?.typeId,
      });
    }
  }

  /** Setzt den Bewegungszustand (Halten/Direkt/Umherstreifen) der Selektion. */
  private setMoveState(ms: MoveState): void {
    if (this.matchOver) return;
    for (const u of this.gameState.selected) {
      u.moveState = ms;
      if (ms === "halten") {
        u.path = [];
      } else if (ms === "umherstreifen") {
        u.patrolA = { col: u.col, row: u.row };
        u.patrolB = u.lastMoveDest ?? { col: u.col, row: u.row };
      }
    }
  }

  /** Setzt den Feuerzustand (Feuer halten/Erwidern/Feuer frei) der Selektion. */
  private setFireState(fs: FireState): void {
    if (this.matchOver) return;
    for (const u of this.gameState.selected) u.fireState = fs;
  }

  /**
   * Rechtsklick: Bewegung/Sammeln/Angriff bei Einheiten, Rallypunkt bei
   * Gebaeude. Mit gehaltener Umschalttaste wird der Befehl an die Kette
   * angehaengt statt ersetzt.
   */
  private handleCommand(pointer: Phaser.Input.Pointer): void {
    if (this.paused) return;
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const tile = worldToTile(world.x, world.y);
    const selected = this.gameState.selected;
    const shift = this.shiftKey?.isDown ?? false;

    if (selected.length > 0) {
      const enemy = this.enemyEntityAt(world.x, world.y, tile);
      if (enemy) {
        this.command(selected, { kind: "attack", target: enemy }, shift);
        return;
      }
      // Eigenes Gebaeude: unfertige Baustelle weiterbauen, beschaedigtes reparieren.
      const friendly = this.friendlyBuildingAt(world.x, world.y, tile);
      if (friendly) {
        const workers = selected.filter((u) => u.isWorker);
        if (!friendly.fertig && workers.length > 0) {
          this.command(workers, { kind: "build", site: friendly }, shift);
          return;
        }
        if (friendly.damaged && workers.length > 0) {
          // Reparatur ist nicht verkettbar (immer sofort).
          this.repairSystem.issueRepair(workers, friendly);
          return;
        }
      }
      const node = this.gameState.nodes.find(
        (n) =>
          (n.col === tile.col && n.row === tile.row) || n.getBounds().contains(world.x, world.y),
      );
      if (node && !node.erschoepft) {
        this.command(selected, { kind: "gather", node }, shift);
        return;
      }
      this.command(selected, { kind: "move", x: world.x, y: world.y }, shift);
      return;
    }

    const insp = this.gameState.inspected;
    if (insp instanceof Building && insp.canProduce) {
      insp.rally = { x: world.x, y: world.y };
    }
  }

  /**
   * Wendet einen Befehl an: mit Umschalt an die Order-Queue anhaengen, sonst die
   * Kette ersetzen und sofort ausfuehren.
   */
  private command(units: Unit[], order: Order, shift: boolean): void {
    if (units.length === 0) return;
    // Audio-Tap: Befehl erteilt (UI-SFX + Bark; traegt typeId und order.kind).
    const befehlTyp = units[0]?.typeId;
    if (order.kind === "move" || order.kind === "attackMove") {
      this.events.emit(EVT_COMMAND_MOVE, {
        x: order.x,
        y: order.y,
        faction: PLAYER_FACTION,
        unitType: befehlTyp,
        kind: order.kind,
      });
    } else {
      this.events.emit(EVT_COMMAND_MOVE, {
        faction: PLAYER_FACTION,
        unitType: befehlTyp,
        kind: order.kind,
      });
    }
    if (shift) {
      for (const u of units) u.orders.push(order);
      return;
    }
    for (const u of units) u.orders = [];
    this.executeNow(units, order);
  }

  private executeNow(units: Unit[], order: Order): void {
    switch (order.kind) {
      case "attack":
        this.combatSystem.issueAttack(units, order.target);
        return;
      case "gather":
        for (const u of units) {
          if (u.isWorker) this.resourceSystem.issueGather(u, order.node);
          else this.movement.commandMove([u], order.node.col, order.node.row);
        }
        return;
      case "move":
        this.movement.commandMoveGroup(units, order.x, order.y);
        return;
      case "attackMove":
        this.movement.commandAttackMove(units, order.x, order.y);
        return;
      case "build":
        for (const u of units) {
          u.gather = undefined;
          u.repairTarget = undefined;
          u.attackTarget = undefined;
          u.attackMove = undefined;
          u.buildTarget = order.site;
          this.movement.moveAdjacentTo(u, { col: order.site.col, row: order.site.row });
        }
        return;
    }
  }

  /** Findet eine gegnerische Einheit/Gebaeude am Klickpunkt (fuer Angriff). */
  private enemyEntityAt(wx: number, wy: number, tile: { col: number; row: number }): Unit | Building | undefined {
    const u = this.gameState.units.find(
      (e) =>
        e.owner === "gegner" &&
        !e.isDead &&
        Phaser.Math.Distance.Between(wx, wy, e.x, e.y - 14) <= 18,
    );
    if (u) return u;
    return this.gameState.buildings.find(
      (b) =>
        b.owner === "gegner" &&
        !b.isDead &&
        (b.footprintTiles().some((t) => t.col === tile.col && t.row === tile.row) ||
          b.getBounds().contains(wx, wy)),
    );
  }

  /** Findet ein eigenes Gebaeude am Klickpunkt (fuer Reparatur). */
  private friendlyBuildingAt(wx: number, wy: number, tile: { col: number; row: number }): Building | undefined {
    return this.gameState.buildings.find(
      (b) =>
        b.owner === "spieler" &&
        !b.isDead &&
        (b.footprintTiles().some((t) => t.col === tile.col && t.row === tile.row) ||
          b.getBounds().contains(wx, wy)),
    );
  }

  // --- Kamera ------------------------------------------------------------

  private setupCameraBounds(): void {
    // Exakt auf das gerade Bodenrechteck: nie ueber die gerade Kante scrollen.
    const r = this.terrainRect();
    const cam = this.cameras.main;
    cam.setBounds(r.x, r.y, r.width, r.height);
    this.refreshMinZoom(r);
    // Viewport-Aenderungen (Scale.RESIZE) verschieben den Einpass-Mindestzoom.
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onViewportResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.onViewportResize, this);
    });
  }

  private onViewportResize(): void {
    this.refreshMinZoom(this.terrainRect());
  }

  /**
   * Kleinster Zoom, bei dem der Viewport das Bodenrechteck nicht ueberschreitet,
   * aus Rechteck vs. Viewport abgeleitet (Tunable CAMERA.minZoomMargin als
   * Zusatzmarge). Baut danach die festen Zoomstufen neu und wendet die aktuelle
   * Stufe an.
   */
  private refreshMinZoom(r: Phaser.Geom.Rectangle): void {
    const fit = Math.max(this.scale.width / r.width, this.scale.height / r.height);
    this.minZoom = Math.max(ZOOM_MIN, fit * (1 + CAMERA.minZoomMargin));
    this.applyZoomSteps();
  }

  /**
   * Baut die drei festen Zoomstufen (nah -> fern): [0] maximaler Reinzoom, [2]
   * der dynamische Rauszoom (= Mindestzoom aus terrainRect/Viewport), [1] der
   * Standard dazwischen. Sortiert/geklemmt und auf die aktuelle Stufe gesetzt.
   */
  private applyZoomSteps(): void {
    const far = this.minZoom;
    const near = Math.max(CAMERA.zoomSteps[0], far);
    // Mittelstufe exakt mittig zwischen Rein- und Rauszoom (zur Laufzeit, damit
    // sie dem dynamischen Rauszoom folgt). zoomSteps[1] wird dadurch abgeleitet.
    const mid = (near + far) / 2;
    this.zoomSteps = [near, mid, far];
    this.zoomStepIndex = Phaser.Math.Clamp(this.zoomStepIndex, 0, this.zoomSteps.length - 1);
    this.cameras.main.setZoom(this.zoomSteps[this.zoomStepIndex]);
  }

  private centerCameraOnMap(): void {
    const center = gridToScreen(GRID_COLS / 2, GRID_ROWS / 2);
    this.cameras.main.centerOn(center.x + WORLD_ORIGIN_X, center.y + WORLD_ORIGIN_Y);
  }

  private setupKeyboard(): void {
    const kb = this.input.keyboard;
    if (!kb) return;
    // Kamera auf Pfeiltasten (plus Edge-Pan, Mitte-Drag), damit die
    // Buchstabentasten fuer RTS-Befehle frei sind.
    this.keys = {
      up: kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
      down: kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
      left: kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
    };
    this.deleteKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.DELETE);
    this.shiftKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);

    // Nur im Dev-Build: Debug-Hotkeys fuer den schnellen Browser-Check.
    // import.meta.env.DEV ist im Production-Bundle false -> wird wegoptimiert.
    if (import.meta.env.DEV) this.setupDevKeys(kb);
  }

  /**
   * Dev-only Hotkeys (Browser-Check): U spawnt den Helden am Cursor (Blick-
   * richtung + Fussgleiten pruefen), K toetet die selektierten Einheiten
   * (Flash + Shockwave + Corpse-Ablauf pruefen), F feuert einen Platzhalter-
   * Effekt am Cursor (Sichtprobe des fx-Diensts). Nicht im Production-Build.
   */
  private setupDevKeys(kb: Phaser.Input.Keyboard.KeyboardPlugin): void {
    kb.addKey(Phaser.Input.Keyboard.KeyCodes.U).on("down", () => {
      if (this.matchOver) return;
      const data = this.registry.get("gameData") as GameData;
      const p = this.input.activePointer;
      const t = worldToTile(p.worldX, p.worldY);
      if (!inBounds(t.col, t.row) || !data.units["hellmuth"]) return;
      this.gameState.addUnit(new Unit(this, "hellmuth", data.units["hellmuth"], t.col, t.row, "spieler"));
      console.info(`[DEV] Held gespawnt bei (${t.col}, ${t.row}).`);
    });
    kb.addKey(Phaser.Input.Keyboard.KeyCodes.K).on("down", () => {
      for (const u of [...this.gameState.selected]) {
        this.events.emit(EVT_UNIT_DIED, u.deathSnapshot());
        this.gameState.removeUnit(u);
      }
    });
    kb.addKey(Phaser.Input.Keyboard.KeyCodes.F).on("down", () => {
      if (this.matchOver) return;
      const p = this.input.activePointer;
      getFx(this)?.spawn("placeholder", p.worldX, p.worldY);
    });
  }

  update(time: number, delta: number): void {
    // Audio-Direktoren vor den Match-/Pause-Gates ticken: Musik muss auch nach
    // Match-Ende auf den Victory-/Defeat-Track wechseln (Ambience self-tickt).
    this.musicDirector?.tick();
    this.barkDirector?.tick();
    if (this.matchOver) return;
    // Render/Eingabe pro Frame (rohes delta).
    this.drawRallyMarker();
    this.drawSilhouettes();
    this.updateOccluderFade();
    if (this.paused) return;

    this.fog?.update(time, delta); // VFX Strang 1: Nebel-Drift
    // VFX Strang 2: Wandlungsquellen einen gedrosselten Schritt treiben und nur bei
    // Bedarf neu backen (in die vorhandenen Chunk-RTs zurueck -> 0 MB zusaetzlich).
    // Friert mit der Simulation ein (nach dem Pause-Gate).
    if (this.terrainTransform?.tick(time)) this.terrainDirty = true;
    if (this.terrainDirty && this.terrain) {
      this.terrain.recompositeDirty();
      this.terrainDirty = false;
    }
    // Chunk-Culling jeden Frame (intern gedrosselt), nicht nur waehrend einer
    // aktiven Wandlung -- sonst re-cullt ein reiner Kamera-Pan nie (Editor ebenso).
    // No-op bei 36x36, korrekt sobald Karten groesser als ein Bildschirm werden.
    this.terrain?.updateCull(this.cameras.main);

    // Kamera ist bei Pause vollstaendig eingefroren (siehe auch Zoom/Drag-Gates).
    this.panCamera(delta);
    this.updateDisband(delta);

    // Sim mit festem Zeitschritt (Strang 8): Akkumulator + Spiral-Bremse. Im
    // Testbed-Modus treibt nur window.__sim.step die Sim (reproduzierbar).
    if (!this.testbedDriven) {
      this.simAcc += delta;
      let steps = 0;
      while (this.simAcc >= SIM.fixedDtMs && steps < SIM.maxStepsPerFrame) {
        this.stepSim(SIM.fixedDtMs);
        this.simAcc -= SIM.fixedDtMs;
        steps++;
      }
      if (steps === SIM.maxStepsPerFrame) this.simAcc = 0;
    }

    // Darstellung nach der Sim (Render-Pfad): Walk-Frame/Blickrichtung aus der
    // tatsaechlich zurueckgelegten Strecke (Fussgleit-Fix). Nur Darstellung.
    for (const unit of this.gameState.units) unit.updateAnimation();
    // FoW (Render-Pfad, Paket B): Feind-Sichtbarkeit + Schleier nach der Sim,
    // anhand des im stepSim frisch gestempelten Gitters. Eigene Messung, da
    // ausserhalb des Sim-Budgets (Frame-Budget 16,67 ms, nicht 33,3 ms).
    const tFow = performance.now();
    this.visibilitySystem.update();
    this.veilSystem.update();
    this.lastFowRenderMs = performance.now() - tFow;
    this.checkVictory();
  }

  /** Ein Simulationsschritt mit konstantem dt (alle Spielsysteme, feste
   *  Reihenfolge). Vom Akkumulator in update() und vom Testbed aufgerufen.
   *  Das Einheiten-Gitter (Strang 3) wird am Schritt-Anfang neu gebaut. */
  private stepSim(dt: number): void {
    const t0 = performance.now();
    this.gameState.simTick++; // Sim-Uhr fuer deterministische VFX-Pulse
    this.gameState.rebuildUnitGrid();
    this.movement.update(dt);
    // Knockback-Integration (Code7-2, docs/PHYSIK-KNOCKBACK.md §10 Naht 2):
    // laeuft AFTER movement.update (verschiebt Positionen) und VOR
    // combat/vision (die die frischen Positionen lesen). update() erwartet
    // dtMs; unser dt ist Sekunden -> * 1000. Das rebuilt-Grid oben kann direkt
    // weitergereicht werden (Unit erfuellt KbBody-Vertrag).
    this.knockback.update(dt * 1000, this.gameState.units, this.gameState.unitGrid);
    // FoW-Stempel (Paket A): nach der Bewegung, VOR allen Konsumenten -- so liest
    // jeder Konsument im selben Tick frische Sicht. Einziger Schreibpfad.
    this.gameState.updateVision();
    this.resourceSystem.update(dt);
    this.destilleProduction.update(dt); // HELLMUTH autonome Destillat-Produktion
    this.buildSystem.update(dt);
    this.productionSystem.update(dt);
    this.repairSystem.update(dt);
    this.combatSystem.update(dt);
    this.orderSystem.update();
    this.aiSystem.update(dt);
    this.lastSimMs = performance.now() - t0;
  }

  /**
   * Dev-Testbed-Bruecke (Strang 8) fuer den headless Smoke-/Determinismus-Test
   * (tools/dyn_smoke.mjs). Reine Mess-/Steuer-API auf window.__sim; greift NICHT
   * in den Live-Loop ein, solange das Testbed nicht uebernimmt.
   */
  private installSimTestbed(data: GameData): void {
    const api = {
      /** Determinismus: Sim-RNG neu saen, ID-Zaehler + Akkumulator zuruecksetzen
       *  (id-basierte Entstapelung wird so ueber Laeufe reproduzierbar). */
      setSeed: (n: number): void => {
        GridEntity.resetIds();
        this.simRng.sow([String(n)]);
        this.simAcc = 0;
        this.gameState.simTick = 0; // VFX-Sim-Uhr mit-reseten (Reproduzierbarkeit)
        // Neuer Seed = neues Match: Sichtgitter (Sicht + Gedaechtnis) leeren,
        // damit FoW-Laeufe ueber Seeds unabhaengig/reproduzierbar sind.
        this.gameState.resetVision();
        this.destilleProduction.reset();
        this.gameState.resetEconomy();
        // Test-Isolation (Audit-Befund): persistente AI-/Produktions-Akkumulatoren
        // wuerden sonst ueber Laeufe leaken und den Positions-Hash divergieren.
        this.aiSystem.resetForTest();
        this.productionSystem.resetForTest();
      },
      /** true: Live-Akkumulator aus, nur step() treibt die Sim (Gate). */
      setDriven: (on: boolean): void => {
        this.testbedDriven = on;
      },
      spawn: (owner: Owner, type: string, col: number, row: number): void => {
        const def = data.units[type];
        if (def) this.gameState.addUnit(new Unit(this, type, def, col, row, owner));
      },
      moveAll: (owner: Owner, col: number, row: number): void => {
        this.movement.commandMove(
          this.gameState.units.filter((u) => u.owner === owner),
          col,
          row,
        );
      },
      // Paralleler Marsch: jede Einheit um (dCol,dRow) versetzt -> der Pulk
      // bleibt verteilt (realistischer Bewegungs-Stresstest, kein Punkt-Stau).
      march: (owner: Owner, dCol: number, dRow: number): void => {
        for (const u of this.gameState.units) {
          if (u.owner === owner) this.movement.commandMove([u], u.col + dCol, u.row + dRow);
        }
      },
      // Schwarm-Gruppenbefehl auf eine Zielkachel (>= SWARM_THRESHOLD -> Flussfeld).
      swarm: (owner: Owner, col: number, row: number): void => {
        const w = gridToWorld(col, row);
        this.movement.commandMoveGroup(
          this.gameState.units.filter((u) => u.owner === owner),
          w.x,
          w.y,
        );
      },
      // Mauer setzen (Linie aus len Kacheln) -> invalidiert die Flussfelder.
      wall: (col: number, row: number, dCol: number, dRow: number, len: number): void => {
        for (let k = 0; k < len; k++) this.gameState.addObstacle(col + dCol * k, row + dRow * k);
      },
      /** n feste Sim-Schritte ausfuehren (deterministisch). */
      step: (n = 1): void => {
        // Sim + Animations-Update (sonst meldet der Animator im step-getriebenen
        // Testbed nie den Hit-Frame, und der Kampf buchte nie Schaden).
        for (let i = 0; i < n; i++) {
          this.stepSim(SIM.fixedDtMs);
          for (const u of this.gameState.units) u.updateAnimation(SIM.fixedDtMs);
        }
      },
      stats: (): {
        arrived: number;
        total: number;
        alive: number;
        lastFrameMs: number;
        avoidMs: number;
        fowMs: number;
      } => {
        const us = this.gameState.units;
        let arrived = 0;
        for (const u of us) if (u.path.length === 0) arrived++;
        return {
          arrived,
          total: us.length,
          alive: us.length,
          lastFrameMs: this.lastSimMs,
          avoidMs: this.movement.lastAvoidMs,
          fowMs: this.gameState.lastFowMs,
        };
      },
      /** FNV-1a ueber die Einheitenpositionen (stabile Reihenfolge) fuer das
       *  Determinismus-Gate: zwei gleich geseedete Laeufe -> gleicher Hash. */
      hash: (): number => {
        let h = 2166136261 >>> 0;
        for (const u of this.gameState.units) {
          const s = `${u.x.toFixed(3)},${u.y.toFixed(3)};`;
          for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619) >>> 0;
          }
        }
        return h >>> 0;
      },
      clear: (): void => {
        for (const u of [...this.gameState.units]) this.gameState.removeUnit(u);
      },
      // --- FoW-Sondierung (Paket A): nur Lesezugriff ueber die VisionGrid-API. ---
      /** Drei-Zustand einer Kachel: 2 sichtbar, 1 erinnert, 0 schwarz. */
      visAt: (owner: Owner, col: number, row: number): number =>
        this.gameState.vision[owner].visibilityAt(col, row),
      /** Roher Deckungszaehler einer Kachel. */
      visCount: (owner: Owner, col: number, row: number): number =>
        this.gameState.vision[owner].visionCountAt(col, row),
      /** Wurde die Kachel jemals gesehen (Persistenz)? */
      explored: (owner: Owner, col: number, row: number): boolean =>
        this.gameState.vision[owner].wasExplored(col, row),
      /** FNV-1a ueber den Drei-Zustand aller Kacheln -> FoW-Determinismus-Gate. */
      visHash: (owner: Owner): number => {
        const g = this.gameState.vision[owner];
        let h = 2166136261 >>> 0;
        for (let row = 0; row < GRID_ROWS; row++) {
          for (let col = 0; col < GRID_COLS; col++) {
            h ^= g.visibilityAt(col, row);
            h = Math.imul(h, 16777619) >>> 0;
          }
        }
        return h >>> 0;
      },
      // --- FoW-RENDER-Sondierung (Paket B): Schleier-Deckkraft + Geist-Statistik. ---
      /** Schleier-Deckkraft (0..255) am gerenderten Bild fuer eine Kachel. */
      veilAlpha: (col: number, row: number): number => this.veilSystem.alphaAt(col, row),
      /** Tiefe der einen Schleier-Ebene (Beleg: ein Draw-Call). */
      veilDepth: (): number => this.veilSystem.layerDepth,
      /** Geist-Statistik (Feind-Gebaeude): gesamt registriert / aktuell sichtbar. */
      ghosts: (): { total: number; visible: number } => this.visibilitySystem.ghostStats(),
      /** Render-Pfad-Kosten von FoW (Sichtbarkeit + Schleier) im letzten Frame (ms). */
      fowRenderMs: (): number => this.lastFowRenderMs,
      // --- Destillat-System (Test-Sonden) ---
      /** Destillat-Stand eines Besitzers. */
      destillat: (owner: Owner): number => this.gameState.resourcesOf(owner).destillat,
      /** Tech-Stufe eines Besitzers (1 + fertige Upgrade-Bauten). */
      tech: (owner: Owner): number => this.gameState.techLevelOf(owner),
      /** Bau-Gate abfragen (Tech/Limit). */
      canBuild: (owner: Owner, typeId: string): { ok: boolean; reason?: string } =>
        this.gameState.canConstruct(typeId, owner),
      /** Gebaeude direkt setzen (Test): erzeugt es fertig/als Baustelle, ohne Gate. */
      place: (owner: Owner, typeId: string, col: number, row: number, fertig = true): void => {
        const bdef = data.buildings[typeId];
        if (bdef) this.gameState.addBuilding(new Building(this, typeId, bdef, col, row, owner, fertig));
      },
      /** Bau ueber den echten Bau-Pfad versuchen (Gate greift). true = platziert. */
      tryBuild: (typeId: string, col: number, row: number): boolean => {
        this.buildSystem.beginPlacement(typeId);
        this.buildSystem.updateGhost(gridToWorld(col, row).x, gridToWorld(col, row).y);
        return !!this.buildSystem.tryPlace(false);
      },
      /** Test-Aufraeumung: entfernt alle test-platzierten Bauten (destille/labor),
       *  laesst die Anfangsbauten (HQ/Knoten) unberuehrt -> dyn_smoke-hash bleibt. */
      clearBuilt: (): void => {
        for (const b of [...this.gameState.buildings]) {
          if (b.typeId === "destille" || b.typeId === "labor") this.gameState.removeBuilding(b);
        }
      },
    };
    (window as unknown as { __sim: typeof api }).__sim = api;
  }

  /** Liegt die Kachel in einer Sirup-Zone der Kollisionsmaske? (Slow-Effekt spaeter.) */
  public inSyrupZone(col: number, row: number): boolean {
    return this.syrupZones.has(`${col},${row}`);
  }

  /** Loest die ausgewaehlten Einheiten auf, wenn Entf lange genug gehalten wird. */
  private updateDisband(delta: number): void {
    const held = (this.deleteKey?.isDown ?? false) && this.gameState.selected.length > 0;
    if (!held) {
      this.disbandHeldMs = 0;
      this.gameState.disbandProgress = 0;
      return;
    }
    this.disbandHeldMs += delta;
    this.gameState.disbandProgress = Math.min(1, this.disbandHeldMs / CONTROLS.disbandHoldMs);
    if (this.disbandHeldMs >= CONTROLS.disbandHoldMs) {
      for (const u of [...this.gameState.selected]) this.gameState.removeUnit(u);
      this.gameState.clearSelection();
      this.disbandHeldMs = 0;
      this.gameState.disbandProgress = 0;
    }
  }

  /**
   * Occlusion-Silhouette: zeichnet einen durchscheinenden Umriss fuer jede
   * Einheit, die hinter einem Gebaeude steht (positionell verdeckt), auf einem
   * Layer ueber den Gebaeuden. So bleibt die Position im Endkampf erkennbar.
   * Gilt fuer eigene und feindliche Einheiten.
   */
  private drawSilhouettes(): void {
    this.silhouetteLayer.clear();
    const buildings = this.gameState.buildings;
    const vis = this.gameState.vision["spieler"];
    for (const u of this.gameState.units) {
      // Im Nebel kein Silhouetten-Leak: verborgene Feinde werfen keine Aura.
      if (u.owner !== "spieler" && !vis.isVisible(u.col, u.row)) continue;
      const bx = u.x;
      const by = u.y - 14;
      let behind = false;
      for (const b of buildings) {
        if (b.isDead) continue;
        if (b.y > u.y && b.getBounds().contains(bx, by)) {
          behind = true;
          break;
        }
      }
      // Sicht-blockierende Doodads (Wald, Felssaeule) wie Gebaeude behandeln.
      if (!behind) {
        for (const img of this.doodadSystem.sightBlockers()) {
          if (img.y > u.y && img.getBounds().contains(bx, by)) {
            behind = true;
            break;
          }
        }
      }
      if (!behind) continue;
      // Etwas groesser als der Einheitenkoerper (18x26), damit eine sichtbare
      // Aura um die ueberlagernde Einheit herum durch das Gebaeude scheint.
      const color = u.owner === "spieler" ? 0x9be7b4 : 0xe79b9b;
      this.silhouetteLayer.fillStyle(color, 0.55);
      this.silhouetteLayer.fillEllipse(bx, by - 4, 30, 40);
    }
  }

  /**
   * Hohe Verdecker (Gebaeude, Baeume, grosse Felsen) werden halbtransparent,
   * solange eine Spieler-Einheit positionell dahinter steht (vom Verdecker
   * ueberlappt und in der Tiefe dahinter). Rein visuell: aendert weder Kollision
   * noch die Sicht-Verdeckung der Occlusion.
   */
  private updateOccluderFade(): void {
    if (!OCCLUDER_FADE.enabled) return;
    const a = OCCLUDER_FADE.alpha;
    const players = this.gameState.units.filter((u) => u.owner === "spieler" && !u.isDead);
    for (const b of this.gameState.buildings) {
      if (b.isDead) continue;
      b.setOccludedFade(this.playerUnitBehind(b.y, b.getBounds(), players), a);
    }
    for (const img of this.doodadSystem.tallOccluders()) {
      img.setAlpha(this.playerUnitBehind(img.y, img.getBounds(), players) ? a : 1);
    }
  }

  /** Steht eine der Einheiten hinter (kleineres y) und unter dem Verdecker-Sprite? */
  private playerUnitBehind(
    occY: number,
    bounds: Phaser.Geom.Rectangle,
    players: Unit[],
  ): boolean {
    for (const u of players) {
      if (occY > u.y && bounds.contains(u.x, u.y - 14)) return true;
    }
    return false;
  }

  /** Pulsierender Rally-Marker, nur sichtbar bei selektiertem Produktionsgebaeude. */
  private drawRallyMarker(): void {
    this.rallyMarker.clear();
    if (this.rallyMarkerImg) this.rallyMarkerImg.setVisible(false);
    const insp = this.gameState.inspected;
    if (!(insp instanceof Building) || insp.owner !== "spieler" || !insp.canProduce || !insp.rally) {
      return;
    }
    const w = insp.rally;
    const pulse = 0.5 + 0.5 * Math.sin((this.time.now / 1000) * 4);
    if (this.textures.exists(UI_SPRITE.rallyMarker)) {
      if (!this.rallyMarkerImg) {
        this.rallyMarkerImg = this.add
          .image(0, 0, UI_SPRITE.rallyMarker)
          .setOrigin(0.5, 0.5)
          .setDepth(490000);
      }
      // Auf feste Weltbreite skalieren (nie native Pixelgroesse), dann pulsieren.
      const base = RALLY_MARKER_WIDTH / (this.rallyMarkerImg.width || RALLY_MARKER_WIDTH);
      this.rallyMarkerImg
        .setVisible(true)
        .setPosition(w.x, w.y)
        .setAlpha(0.55 + 0.45 * pulse)
        .setScale(base * (0.85 + 0.2 * pulse));
      return;
    }
    this.rallyMarker.lineStyle(2, 0x9be7b4, 0.85);
    this.rallyMarker.strokeCircle(w.x, w.y, 8 + pulse * 6);
    this.rallyMarker.fillStyle(0x9be7b4, 0.35 * pulse);
    this.rallyMarker.fillCircle(w.x, w.y, 4);
  }

  private checkVictory(): void {
    // Generisch: eine Fraktion ist besiegt, wenn sie kein HQ-Gebaeude mehr hat
    // (Hellmuth: letzte Apotheke, Moderat: letzte Zuckermaschine).
    if (!this.gameState.hasHq("gegner")) this.endMatch("SIEG", "Die Moderat hat kein HQ mehr.");
    else if (!this.gameState.hasHq("spieler")) this.endMatch("NIEDERLAGE", "Die Hellmuth hat kein HQ mehr.");
  }

  private endMatch(title: string, subtitle: string): void {
    this.matchOver = true;
    this.gameState.clearSelection();
    this.buildSystem.cancel();
    this.hud.showEndOverlay(title, subtitle);
    // Audio-Tap: Ausgang (Set-Bindings state.victory / state.defeat).
    this.events.emit(title === "SIEG" ? EVT_VICTORY : EVT_DEFEAT);
  }

  private panCamera(delta: number): void {
    const cam = this.cameras.main;
    const dt = delta / 1000;
    const keyDist = (KEY_PAN_SPEED * dt) / cam.zoom;

    let dx = 0;
    let dy = 0;
    if (this.keys) {
      if (this.keys.left.isDown) dx -= keyDist;
      if (this.keys.right.isDown) dx += keyDist;
      if (this.keys.up.isDown) dy -= keyDist;
      if (this.keys.down.isDown) dy += keyDist;
    }

    if (!this.camDragging) {
      const edgeDist = (EDGE_PAN_SPEED * dt) / cam.zoom;
      const w = this.scale.width;
      const h = this.scale.height;
      const px = this.pointerScreen.x;
      const py = this.pointerScreen.y;
      if (px >= 0 && px <= w && py >= 0 && py <= h) {
        if (px < EDGE_PAN_MARGIN) dx -= edgeDist;
        else if (px > w - EDGE_PAN_MARGIN) dx += edgeDist;
        if (py < EDGE_PAN_MARGIN) dy -= edgeDist;
        else if (py > h - EDGE_PAN_MARGIN) dy += edgeDist;
      }
    }

    if (dx !== 0 || dy !== 0) cam.setScroll(cam.scrollX + dx, cam.scrollY + dy);
  }
}
