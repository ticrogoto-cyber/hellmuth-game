import "./hud.css";
import type Phaser from "phaser";
import type { FactionId, GameData, Cost, ResourceId } from "../data/loader";
import type { GameState } from "../systems/game_state";
import { Building } from "../entities/building";
import { Unit } from "../entities/unit";
import { GRID_COLS, GRID_ROWS, gridToWorld, worldToTile } from "../util/world";
import { UI_BUILD_REQUEST, UI_PRODUCE_REQUEST, UI_BUILD_CANCEL } from "./ui_events";
import { tintedBorderImage, factionTint } from "./hud_tint";
import { BAR_MASTER } from "./hud_master_data";
import { K_TOP, K_BOT, K_SIDE, G_H, G_V } from "./hud_strip_data";
import { minimapFogAlpha, MINIMAP_FOG_RGB, blipAlpha, tilesFog } from "./minimap_fog";

// HTML/CSS-HUD — Geometrie exakt nach docs/hud-spec.md (Neuvermessung der
// Vorlagen docs/hud-zustand-1/2.png). Bilder nur Oberflaeche, Geometrie im Code.
// ?zonemap=1 rendert die Klassenfarben der Vorlage (Pruefstand, kein Spiel).

export type SelectionMode = "single" | "multi";
type CmdAction = "build" | "produce" | "cancel";
interface CmdItem { action: CmdAction; typeId: string; label: string; enabled: boolean; tooltip: string }

const ui = (f: string): string => `/sprites/ui/hud/${f}`;

// --- HUD-V2 Schichtarchitektur (docs/hud-spec-v2.md) -----------------------
// Masse @1920x1080. vw=px/19.2, vh=px/10.8. Slot-Geometrie aus Spec §5.
// Paket C: alle HUD-Masse ueber EINEN Skalenfaktor (--hud-scale, CSS); 1 Einheit
// = 1 Design-Pixel. VW/VH liefern jetzt dasselbe calc() — die alte vw/vh-Trennung
// entfaellt, beide Achsen skalieren uniform (keine Divergenz bei Nicht-16:9). Die
// Ornamente sitzen in .hud-stage (zentriertes 1920x1080-Design), die Werte sind
// Design-Pixel.
const SCALE = (px: number): string => `calc(${+px.toFixed(2)} * var(--hud-scale))`;
const VW = SCALE;
const VH = SCALE;

interface SlotGeom { x0: number; x1: number; peak: number; garantie: number; mod: number; fillTop: number }
// mod = Anteil der Slot-Breite fuers schmale Hauptmotiv unten (<=40%, D1). Darueber
// waechst ein SCHLANKES vertikales Beifuellmotiv bis fillTop (Option-1, Ticro-
// Maßvorlage docs/hud-groessen-moderat.png). Der Koenig fuellt seinen Slot.
const SLOTS: Record<"hero" | "gridres" | "edge", SlotGeom> = {
  hero: { x0: 316, x1: 506, peak: 809, garantie: 869, mod: 1.0, fillTop: 809 }, // #2 Koenig
  gridres: { x0: 1414, x1: 1601, peak: 928, garantie: 987, mod: 0.38, fillTop: 860 }, // #3
  edge: { x0: 1805, x1: 1920, peak: 834, garantie: 908, mod: 0.40, fillTop: 840 }, // #4
};

// Koenig-Box je Fraktion (Ticro-Maßvorlage): MODERAT satt/gross, fuellt die Slot-
// breite + leichter Ueberstand, ragt bis ~y706 (Auge gross). HELLMUTH hoehen-
// zentriert wie gehabt. x/y/r = Leuchtanker in % der Art-Box; ar = Seitenverh.
const KING_ANCHOR = {
  hellmuth: { x: 51.9, y: 65.3, r: 15.4, ar: 652 / 1196, w: 189.6, top: 732, fit: "width" as const },
  moderat: { x: 50.1, y: 54.6, r: 17.9, ar: 597 / 973, w: 222, top: 706, fit: "width" as const },
};

// Pro Fraktion drei Kompositionen (Auswahl-Subagenten). Koenig je gleich.
// MODERAT ohne topleft/sigil = offene Materialbestellung (docs/TODO.md).
interface VariantCfg {
  hero: string; gridres: string; edge: string;
  topleft?: string; sigil?: string; strip_h: string; strip_v: string; corner: string;
}
// gridres/edge verweisen auf die gecroppten Begleiter-Einzelmotive (begleiter/).
const VARIANTS: Record<FactionId, VariantCfg[]> = {
  hellmuth: [
    { hero: "v_hero_anschluss_g", gridres: "kgrid_b", edge: "kedge_d", topleft: "v_topleft_a", sigil: "sigil_b", strip_h: "strip_h_a", strip_v: "strip_v_a", corner: "corner_a" },
    { hero: "v_hero_anschluss_g", gridres: "kgrid_g", edge: "kedge_b", topleft: "v_topleft_e", sigil: "sigil_b", strip_h: "strip_h_c", strip_v: "strip_v_a", corner: "corner_g" },
    { hero: "v_hero_anschluss_g", gridres: "kgrid_h", edge: "kedge_d", topleft: "v_topleft_c", sigil: "sigil_b", strip_h: "strip_h_b", strip_v: "strip_v_a", corner: "corner_d" },
  ],
  moderat: [
    { hero: "v_hero_slot_d", gridres: "gvalve_a", edge: "gvalve_b", sigil: "sigil_a", strip_h: "strip_h_e", strip_v: "strip_v_e", corner: "corner_a" },
    { hero: "v_hero_slot_d", gridres: "gvalve_b", edge: "gvalve_c", sigil: "sigil_a", strip_h: "strip_h_e", strip_v: "strip_v_e", corner: "corner_c" },
    { hero: "v_hero_slot_d", gridres: "gvalve_c", edge: "gvalve_a", sigil: "sigil_a", strip_h: "strip_h_e", strip_v: "strip_v_e", corner: "corner_b" },
  ],
};

const EMBLEM: Record<FactionId, { name: string; claim: string }> = {
  hellmuth: { name: "HELLMUTH", claim: "REINHEIT DURCH WISSEN" },
  moderat: { name: "MODERAT", claim: "SÜSSE IST ZWANG" },
};

const RES_ORDER: ResourceId[] = ["botanicals", "reinwasser", "destillat"];
const STAT_ICONS = ["stat/hp", "stat/armor", "stat/damage", "stat/speed"];

const UNIT_ROLE_LABEL: Record<string, string> = {
  worker: "ARBEITER", melee: "NAHKÄMPFER", ranged: "FERNKÄMPFER",
  caster: "ZAUBERER", heavy: "SCHWERE EINHEIT", hero: "HELD",
};
const BUILDING_ROLE_LABEL: Record<string, string> = {
  hq: "HAUPTGEBÄUDE", supply: "VERSORGUNG", upgrade: "FORSCHUNG",
  caster: "ZAUBERHAUS", production: "PRODUKTION", defense: "VERTEIDIGUNG", resource: "VORKOMMEN",
};

const RES_LABEL: Record<ResourceId, string> = {
  botanicals: "Botanicals", reinwasser: "Reinwasser", destillat: "Destillat",
};

// Minimap-Terrainfarben (Platzhalter-Schachbrett der GameScene, gleiche Werte).
const MM_TILE_A = "#2f3b34";
const MM_TILE_B = "#27332d";
const MM_BLOCKED = "#1c241f";

/** div mit background-image (statt <img>): zonemap-faehig + drop-shadow-Silhouette. */
const bgDiv = (cls: string, url: string): string =>
  `<div class="${cls}" style="background-image:url('${url}')"></div>`;

export class HtmlHud {
  private readonly root: HTMLDivElement;
  private faction: FactionId = "hellmuth";
  private game?: Phaser.Game;
  private zonemap = false;
  private variant = 0;
  private cmdSig = "";
  private raf = 0;
  private sakT = 0;
  private ornOff = false;
  private herzOff = false;
  private mm?: HTMLCanvasElement;

  constructor() {
    this.root = document.createElement("div");
    this.root.id = "hud";
  }

  public mount(faction: FactionId, game?: Phaser.Game, parent: HTMLElement = document.body): void {
    this.faction = faction;
    this.game = game;
    const q = new URLSearchParams(location.search);
    this.zonemap = q.get("zonemap") === "1";
    const v = parseInt(q.get("variant") ?? "1", 10);
    this.variant = Number.isFinite(v) && v >= 1 && v <= 3 ? v - 1 : 0;
    // Mess-Schalter (Dichte-Gesetz): ?orn=0 ohne Aufsatz-Ebene, ?herz=0 ohne
    // Herzstueck. hud_gate.py gewinnt daraus die Masken per Pixeldiff.
    this.ornOff = q.get("orn") === "0";
    this.herzOff = q.get("herz") === "0";
    this.render();
    parent.appendChild(this.root);
    if (this.zonemap) {
      this.root.classList.add("zonemap");
      document.body.classList.add("zonemap");
      this.setSelection(q.get("select") === "multi" ? "multi" : "single");
      return; // reiner Geometrie-Pruefstand: keine Live-Daten
    }
    this.mm = this.root.querySelector(".mm-canvas") as HTMLCanvasElement;
    this.wireMinimap();
    if (game) this.startSync();
  }

  public setFaction(faction: FactionId): void {
    this.faction = faction;
    this.render();
    this.mm = this.root.querySelector(".mm-canvas") as HTMLCanvasElement;
    this.wireMinimap();
  }

  public setSelection(mode: SelectionMode): void {
    this.root.classList.toggle("select-multi", mode === "multi");
    this.root.classList.toggle("select-single", mode !== "multi");
  }

  public unmount(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.sakT) { clearTimeout(this.sakT); this.sakT = 0; }
    this.root.remove();
  }

  // --- Aufbau ------------------------------------------------------------

  private render(): void {
    const b = ui(this.faction);
    const blocks = `${b}/blocks`;
    const em = EMBLEM[this.faction];
    this.root.className = `faction-${this.faction} select-single` + (this.zonemap ? " zonemap" : "");
    // Kanten-differenzierte Leisten (HUD-Reparatur): jede Panelkante eine eigene
    // getoente Leiste (Oberkante anders als Unterkante) -> 4 Hintergrund-Lagen auf
    // .panel::before. HELLMUTH: top=offen (h_b), bottom=geschlossen (h_a), seiten=
    // h_a gedreht. MODERAT: top/bottom=h_e, seiten=v_e. Farbe per SVG-Toenung.
    // --strip-closed = geschlossene Leiste (HELLMUTH h_a / MODERAT h_e) fuer ALLE
    // Kanten als Default. --strip-open = offene HELLMUTH-Oberkante (h_b), per CSS
    // NUR auf HELLMUTHs drei Hauptpanels (F-Fix, nicht global). --strip-side vert.
    const tint = factionTint(this.faction);
    const k = this.faction === "hellmuth";
    const sOpen = k ? K_TOP : G_H, sClosed = k ? K_BOT : G_H, sSide = k ? K_SIDE : G_V;
    this.root.style.setProperty("--strip-top", tintedBorderImage(sOpen.uri, tint, sOpen.w, sOpen.h));   // offen (HELLMUTH h_b)
    this.root.style.setProperty("--strip-bot", tintedBorderImage(sClosed.uri, tint, sClosed.w, sClosed.h)); // geschlossen
    this.root.style.setProperty("--strip-side", tintedBorderImage(sSide.uri, tint, sSide.w, sSide.h));

    // Zier-Eckstueck als KIND des Emblem-Panels (Paket C, Teil 2): raw-Asset,
    // sitzt per CSS auf der Box-Ecke. HELLMUTH gpt_a, MODERAT das neue Rohr-Eck.
    const cornerUrl = `/sprites/ui/hud/emblem_corner/${this.faction}.png`;
    const emblem = `<div class="panel p-emblem">
      <div class="emb-corner" style="background-image:url('${cornerUrl}')"></div>
      ${bgDiv("emb-mark", `${blocks}/emblem_mark.png`)}
      <div class="emb-name">${em.name}</div>
      <div class="emb-claim">${em.claim}</div>
    </div>`;

    const menu = `<div class="panel p-menu">
      <div class="menu-text"><span class="menu-label">MENÜ</span></div>
    </div>`;

    const minimap = `<div class="panel p-minimap"><canvas class="mm-canvas" width="286" height="286"></canvas></div>`;

    const statIcons = STAT_ICONS
      .map((ic, i) => bgDiv(`uc-stat-icon s${i}`, `${blocks}/${ic}.png`)).join("");
    const statVals = [0, 1, 2, 3].map((i) => `<div class="uc-stat-val s${i}"></div>`).join("");
    const effIcons = [0, 1].map((i) => bgDiv(`uc-eff-icon f${i}`, `${blocks}/eff/e${i}.png`)).join("");
    // Je Eintrag ZWEI Zeilen (Vorlage): Name-Zeile (a) + Wert-Zeile (b).
    const effLines = [0, 1].map((i) =>
      `<div class="uc-eff-line f${i} la"></div><div class="uc-eff-line f${i} lb"></div>`).join("");
    const single = `<div class="uc-single">
      <div class="uc-portrait"><span class="uc-portrait-ph">PORTRÄT</span></div>
      <div class="uc-name"></div>
      <div class="uc-sub"></div>
      ${statIcons}${statVals}
      <div class="uc-eff-head">AKTIVE EFFEKTE</div>
      ${effIcons}${effLines}
    </div>`;
    const multi = `<div class="uc-multi">${[0, 1, 2, 3]
      .map((i) => `<div class="uc-mp p${i}"></div><div class="uc-ml p${i}"></div>`).join("")}</div>`;
    const cmds = Array.from({ length: 12 }, () => `<div class="cmd-cell empty"></div>`).join("");
    const cmdGrid = `<div class="uc-cmd" style="--cell-img:url('${blocks}/cell.png')">${cmds}</div>`;
    const unitcard = `<div class="panel p-unitcard">${single}${multi}${cmdGrid}</div>`;

    const resIcons = [0, 1, 2, 3].map((i) => bgDiv(`res-icon q${i}`, `${blocks}/res/r${i}.png`)).join("");
    const resVals = [0, 1, 2, 3].map((i) =>
      `<div class="res-val q${i}"><span class="rv"></span></div>`).join("");
    const resources = `<div class="panel p-resources">${resIcons}${resVals}</div>`;

    // Anker-Layout: die vier Eck-Panels haengen direkt am #hud (echte Viewport-
    // Ecken, CSS), NUR die Einheitenkarte + ihre Ornamente bleiben in der
    // zentrierten .hud-stage; der Edge-Begleiter pinnt mit dem Ressourcen-Cluster
    // nach rechts. Leiste + Korn volle Breite.
    const center = `<div class="hud-stage">${this.ornaments()}${unitcard}</div>`;
    this.root.innerHTML =
      this.bottomBar() + emblem + menu + minimap + resources + center +
      `<div class="hud-grain" style="--grain:url('/sprites/ui/hud/grain.png')"></div>`;
    this.wireStatic();
    this.cmdSig = "";
  }

  /**
   * Durchgehende untere Leiste (V3 §1.1): EIN nahtloser Bar-Rapport (Graustufen-
   * Master), per `background-repeat: round` gekachelt -> der Motiv-Wechsel waechst
   * mit der Bildbreite, nie gestreckt, kein angeschnittener Endkachel. Fraktions-
   * farbe per SVG-Toenung. Ersetzt die alte Segment-Maschinerie (hud-sockel/
   * bar-riser); die Panel-Rahmen (::before) tragen die Panelkanten selbst.
   */
  private bottomBar(): string {
    const img = tintedBorderImage(BAR_MASTER.uri, factionTint(this.faction), BAR_MASTER.w, BAR_MASTER.h);
    const tileW = VW(BAR_MASTER.w * 92 / BAR_MASTER.h); // Rapport-Aspekt auf 92px Bandhoehe
    return `<div class="hud-bar" style="background-image:${img};background-size:${tileW} 100%"></div>`;
  }

  /**
   * Ornament-Layer nach Dichte-Gesetz (Auftrag HUD-KORREKTUR ORNAMENT-DICHTE):
   *  - KOENIG = Herzstueck (hero_1), unangetastet: zentral ueber der Einheiten-
   *    karte, einzig aufragendes und einzig animiertes Element (HELLMUTH atmet,
   *    MODERAT starrt per Sakkade). Schaltbar mit ?herz=0.
   *  - AUFSATZ-EBENE (schaltbar mit ?orn=0): aktuell LEER, beide Fraktionen.
   *    Die Begleitstueck-Bibliothek liegt nicht im Repo; der alte Bausatz
   *    enthaelt fuer MODERAT kein D4-konformes Stueck (Orb, Maul, Auge,
   *    Leucht-Bullauge) und fuer HELLMUTH nur Motive (Moerser), die die
   *    Grundtextur-Fries bereits eingebacken traegt -- jede Montage erzeugte
   *    Motivdoppel und Regal-Effekt. Sichtfenster zeigen reine Grundtextur.
   *    Die Ebene und das Dichte-Gesetz im Gate (D1-D7) bleiben scharf fuer
   *    die kommende Bibliothek.
   * Alle frueheren Block-/Eck-/Schmuck-Montagen sind demontiert.
   */
  /**
   * S2 BLUETENEBENE (docs/hud-spec-v2.md §6): rahmenlose Blueten in die vier
   * Slots. Begleiter (#3 gridres, #4 edge) sind zentrierte Module <=40 %
   * Slot-Breite (D1 schlaegt "volle Breite"), unten an y1080 verankert, nach
   * oben bis zur Peak-Linie wachsend. #1 topleft an Emblem+Oberrand gebunden.
   * Koenig (#2) fuellt die F1-Luecke, einziges leuchtendes + animiertes Element.
   * MODERAT ohne #1/Siegel (offene Materialbestellung) -> S1-Leiste laeuft durch.
   * ?orn=0 blendet die Begleiter aus, ?herz=0 den Koenig (Gate-Diffmasken).
   */
  private ornaments(): string {
    const cfg = VARIANTS[this.faction][this.variant];
    const base = `/sprites/ui/hud/v2/${this.faction}`;
    let begleit = "";
    if (!this.ornOff) {
      // N3/N4: Saeulen (v2-fill) + Flaeschchen (v2-bloom-Begleiter, gridres+edge)
      // entfernt. Sigil NUR MODERAT (mittig auf der Rasteroberkante), HELLMUTH keins.
      if (this.faction === "moderat" && cfg.sigil) begleit += this.sigilMark(`${base}/sigil/${cfg.sigil}.png`);
      begleit += this.cornerKnots(`${base}/corner/${cfg.corner}.png`);
    }
    const king = this.herzOff ? "" : this.koenig(cfg, base);
    return `<div class="orn-layer">${begleit}${king}</div>`;
  }

  /** MODERAT Stahl-Eckknoten (matt, leuchtfrei) an den Einheitenkarten-Oberecken,
   *  als Gegengewicht zu HELLMUTHs Gold-Eckteil (Ticro). Klein, leise. */
  private cornerKnots(url: string): string {
    if (this.faction !== "moderat") return "";
    const sz = 38;
    // Auf der Kartenleiste innen (klar vom Koenig-Ueberstand x522 und gridres-Slot
    // x1414 weg), damit die Eckknoten nicht in Slots/Koenig ragen.
    return [548, 1372].map((x) =>
      `<div class="v2-corner" style="left:${VW(x - sz / 2)};top:${VH(809 - sz / 2)};` +
      `width:${VW(sz)};height:${VH(sz)};background-image:url('${url}')"></div>`).join("");
  }

  /**
   * Begleiter (Option-1, Ticro-Maßvorlage): schmales Hauptmotiv (<=mod*Breite, D1)
   * im Sockelband, DARUEBER ein SCHLANKES vertikales Beifuellmotiv (Rohr/Ranke),
   * das bis fillTop aufragt -> die Begleiter tragen das Band in der Hoehe, kleben
   * nicht am Boden, ragen aber schlank, nicht breit. Der Koenig bleibt das einzige
   * breit+hoch Aufragende. Fill liegt HINTER dem Hauptmotiv.
   */

  /**
   * Eck-Siegel, leise, kleiner als der Koenig. HELLMUTH: obere rechte Kartenecke.
   * MODERAT (Maul, Ticro-Maßvorlage): ZENTRIERT oben auf der Einheitenkarten-
   * Leiste (~x960), klein und dunkel genug, um nicht mit dem Auge zu konkurrieren.
   */
  private sigilMark(url: string): string {
    const k = this.faction === "hellmuth";
    const sz = k ? 44 : 64;
    const left = k ? 1410 - sz : 960 - sz / 2;
    const top = k ? 815 : 794;
    return `<div class="v2-sigil" style="left:${VW(left)};top:${VH(top)};` +
      `width:${VW(sz)};height:${VH(sz)};background-image:url('${url}')"></div>`;
  }

  /**
   * Koenig (#2) in der F1-Luecke (x316-506), unten verankert, bis Peak y809.
   * Art-Box hoehenfuellend zentriert (contain), damit das ganze Motiv sichtbar
   * bleibt. HELLMUTH: Kugel-Puls auf dem Orb. MODERAT: Iris-Scheibe im Porthole
   * (Sakkade per JS). Leuchtkern exklusiv (§9), Faktor >=4 ueber Begleiter.
   */
  private koenig(cfg: VariantCfg, base: string): string {
    const k = this.faction === "hellmuth";
    const a = KING_ANCHOR[this.faction];
    const cx = (SLOTS.hero.x0 + SLOTS.hero.x1) / 2;
    const w = a.w, left = cx - w / 2, h = 1080 - a.top;
    // Art-Box exakt im Asset-Seitenverhaeltnis: MODERAT fuellt die Box-Breite
    // (satt/gross, leichter Ueberstand), HELLMUTH die Box-Hoehe.
    const aw = a.fit === "width" ? w : h * a.ar;
    const ah = a.fit === "width" ? w / a.ar : h;
    const box = `style="left:${VW(left)};width:${VW(w)};height:${VH(h)}"`;
    const anchor = `--kx:${a.x}%;--ky:${a.y}%;--kr:${a.r}%`;
    // Gluehlagen liegen INNERHALB der Art-Box, damit --kx/--ky Prozent der Art-Box sind.
    const glow = k
      ? `<div class="v2-aura" style="${anchor}"></div><div class="v2-disc" style="${anchor}"></div>`
      : `<div class="v2-iris" style="${anchor}">` +
        `<div class="v2-iris-disc" style="background-image:url('${base}/eye/iris.png')"></div></div>` +
        `<div class="v2-reflex" style="${anchor}"></div>`;
    const art = `<div class="v2-king-art" style="width:${VW(aw)};height:${VH(ah)};` +
      `background-image:url('${base}/hero/${cfg.hero}.png')">${glow}</div>`;
    const cls = k ? "v2-king-hellmuth orn-pulse" : "v2-king-moderat";
    return `<div class="v2-koenig ${cls}" ${box}><div class="v2-king-ground"></div>${art}</div>`;
  }

  private wireStatic(): void {
    // N1: kein Pause-Event mehr auf »MENÜ« (das Menue-System kommt separat).
    this.startSakkade();
  }

  /**
   * MODERAT-Sakkade: die Iris des Waechterauges (orn-iris-disc) zuckt in
   * unregelmaessigen Abstaenden (8-25 s) um einen kleinen Offset (3-5 % des
   * Iris-Durchmessers) in zufaellige Richtung, haelt kurz und kehrt zurueck.
   * Bewegung ~150 ms (CSS-Transition). Lichtreflex (orn-reflex) bleibt fix.
   */
  private startSakkade(): void {
    if (this.sakT) { clearTimeout(this.sakT); this.sakT = 0; }
    if (this.faction !== "moderat" || this.zonemap) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const disc = this.root.querySelector(".v2-iris-disc") as HTMLElement | null;
    if (!disc) return;
    const dia = 60; // Iris-Durchmesser in px @1920 (Bewegungsbasis)
    const step = (): void => {
      this.sakT = window.setTimeout(() => {
        const mag = (0.03 + Math.random() * 0.02) * dia; // 3-5 % Offset
        const ang = Math.random() * Math.PI * 2;
        disc.style.transform =
          `translate(${(Math.cos(ang) * mag).toFixed(2)}px, ${(Math.sin(ang) * mag).toFixed(2)}px)`;
        this.sakT = window.setTimeout(() => {
          disc.style.transform = "translate(0, 0)";
          step();
        }, 500 + Math.random() * 700); // Fixation
      }, 8000 + Math.random() * 17000); // Intervall 8-25 s
    };
    step();
  }

  // --- Live-Schleife -------------------------------------------------------

  private startSync(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    const tick = (): void => {
      const gs = this.game?.registry.get("gameState") as GameState | undefined;
      const gd = this.game?.registry.get("gameData") as GameData | undefined;
      if (gs && gd) {
        this.updateCommands(gs, gd);
        this.updateUnitcard(gs);
        this.updateResources(gs);
        this.updateMinimap(gs);
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  // --- Einheitenkarte ------------------------------------------------------

  private updateUnitcard(gs: GameState): void {
    const sel = gs.selected;
    const multi = sel.length > 1;
    this.setSelection(multi ? "multi" : "single");

    if (multi) {
      for (let i = 0; i < 4; i++) {
        const u = sel[i];
        this.setText(`.uc-ml.p${i}`, u ? u.displayName : "");
        const mp = this.root.querySelector(`.uc-mp.p${i}`) as HTMLElement | null;
        if (mp) mp.style.visibility = u ? "visible" : "hidden";
      }
      if (sel.length > 4) this.setText(".uc-ml.p3", `+${sel.length - 3}`);
      return;
    }

    const t = gs.panelTarget;
    const stats = ["", "", "", ""];
    let name = "", sub = "";
    if (t instanceof Unit) {
      const d = t.def;
      name = t.displayName; sub = UNIT_ROLE_LABEL[d.role] ?? d.role;
      stats[0] = `${Math.ceil(t.hp)}/${t.maxHp}`;
      stats[1] = `${d.ruestung}`; stats[2] = `${d.schaden}`; stats[3] = `${d.tempo}`;
    } else if (t instanceof Building) {
      const d = t.def;
      name = t.displayName; sub = BUILDING_ROLE_LABEL[d.role] ?? d.role;
      stats[0] = `${Math.ceil(t.hp)}/${t.maxHp}`;
      stats[1] = `${d.ruestung ?? 0}`; stats[2] = `${d.schaden ?? 0}`;
      stats[3] = d.reichweite != null ? `${d.reichweite}` : "—";
    }
    this.setText(".uc-name", name);
    this.setText(".uc-sub", sub);
    for (let i = 0; i < 4; i++) this.setText(`.uc-stat-val.s${i}`, stats[i]);
    // Effekt-System existiert nicht -> Platzhalterzeilen in Vorlagen-Geometrie.
    for (const f of [0, 1]) {
      this.setText(`.uc-eff-line.f${f}.la`, t ? "—" : "");
      this.setText(`.uc-eff-line.f${f}.lb`, "");
    }
  }

  // --- Ressourcen ------------------------------------------------------------

  private updateResources(gs: GameState): void {
    for (let i = 0; i < 3; i++) this.setText(`.res-val.q${i} .rv`, `${Math.floor(gs.resources[RES_ORDER[i]])}`);
    this.setText(".res-val.q3 .rv", `${gs.population}/${gs.populationCap}`);
  }

  // --- Befehlsraster -----------------------------------------------------

  private updateCommands(gs: GameState, gd: GameData): void {
    const items = this.computeMenu(gs, gd);
    const sig = items.map((i) => `${i.action}:${i.typeId}:${i.enabled ? 1 : 0}`).join("|");
    if (sig !== this.cmdSig) { this.cmdSig = sig; this.renderCmd(items); }
  }

  private costStr(cost: Cost | undefined): string {
    if (!cost) return "";
    return (Object.entries(cost) as [ResourceId, number][])
      .filter(([, n]) => n > 0)
      .map(([id, n]) => `${RES_LABEL[id]} ${n}`)
      .join(", ");
  }

  private computeMenu(gs: GameState, gd: GameData): CmdItem[] {
    const builders = gs.selected.filter((u) => u.def.kann_bauen);
    if (builders.length > 0) {
      const faction = builders[0].faction;
      const items: CmdItem[] = [];
      for (const [typeId, def] of Object.entries(gd.buildings)) {
        if (!def.baubar || def.faction !== faction) continue;
        const cost = (def.kosten ?? {}) as Cost;
        const afford = gs.canAfford("spieler", cost);
        items.push({ action: "build", typeId, label: def.name, enabled: afford,
          tooltip: `${def.name}${this.costStr(cost) ? " — " + this.costStr(cost) : ""}${afford ? "" : " (zu teuer)"}` });
      }
      return items;
    }
    const bld = gs.inspected;
    if (bld instanceof Building && bld.canProduce) {
      const items: CmdItem[] = [];
      for (const typeId of bld.def.produziert ?? []) {
        const def = gd.units[typeId];
        const prereq = def.requiresBuilding;
        const prereqOk = !prereq || bld.owner !== "spieler" || gs.hasCompletedBuilding("spieler", prereq);
        const afford = gs.canAfford("spieler", def.kosten);
        const popOk = gs.canAddPop("spieler", def.pop);
        const enabled = afford && popOk && prereqOk;
        let reason = "";
        if (!prereqOk) reason = ` (${gd.buildings[prereq!]?.name ?? prereq} nötig)`;
        else if (!popOk) reason = " (Pop voll)";
        else if (!afford) reason = " (zu teuer)";
        items.push({ action: "produce", typeId, label: def.name, enabled,
          tooltip: `${def.name} — ${this.costStr(def.kosten)} · ${def.pop} Pop${reason}` });
      }
      return items;
    }
    if (bld instanceof Building && !bld.fertig && bld.owner === "spieler") {
      return [{ action: "cancel", typeId: bld.typeId, label: "ABBRUCH", enabled: true, tooltip: "Baustelle abbrechen" }];
    }
    return [];
  }

  private renderCmd(items: CmdItem[]): void {
    const grid = this.root.querySelector(".uc-cmd");
    if (!grid) return;
    const game = this.game;
    grid.replaceChildren();
    for (let i = 0; i < 12; i++) {
      const item = items[i];
      if (!item) {
        const empty = document.createElement("div");
        empty.className = "cmd-cell empty";
        grid.appendChild(empty);
        continue;
      }
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cmd-cell" + (item.enabled ? "" : " disabled");
      btn.title = item.tooltip;
      btn.innerHTML = `<span class="cmd-label">${item.label}</span>`;
      if (item.enabled && game) {
        btn.addEventListener("click", () => {
          if (item.action === "build") game.events.emit(UI_BUILD_REQUEST, item.typeId);
          else if (item.action === "produce") game.events.emit(UI_PRODUCE_REQUEST, item.typeId);
          else game.events.emit(UI_BUILD_CANCEL);
        });
      }
      grid.appendChild(btn);
    }
  }

  // --- Minimap -------------------------------------------------------------

  private gameScene(): Phaser.Scene | undefined {
    return this.game?.scene.getScene("game") ?? undefined;
  }

  private wireMinimap(): void {
    const cv = this.mm;
    if (!cv) return;
    cv.addEventListener("pointerdown", (e) => {
      const scene = this.gameScene();
      if (!scene) return;
      const rect = cv.getBoundingClientRect();
      const col = ((e.clientX - rect.left) / rect.width) * GRID_COLS;
      const row = ((e.clientY - rect.top) / rect.height) * GRID_ROWS;
      const w = gridToWorld(col, row);
      scene.cameras.main.centerOn(w.x, w.y);
    });
  }

  private updateMinimap(gs: GameState): void {
    const cv = this.mm;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const W = cv.width, H = cv.height;
    const cw = W / GRID_COLS, ch = H / GRID_ROWS;
    const gx = (col: number) => (col / GRID_COLS) * W;
    const gy = (row: number) => (row / GRID_ROWS) * H;

    // FoW Paket C -- Minimap-Verbraucher (read-only): Drei-Zustand-Schleier +
    // Blip-Gating ueber das VisionGrid des lokalen Spielers. Auf die neu gebaute
    // updateMinimap gepfropft (geplante Naht aus claude/dynamics).
    const vision = gs.vision["spieler"];

    // Terrain: Platzhalter-Schachbrett + blockierte Zellen (Doodads/Felsen),
    // darueber der Drei-Zustand-Schleier (konsistent zum Welt-Veil).
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        ctx.fillStyle = (c + r) % 2 === 0 ? MM_TILE_A : MM_TILE_B;
        if (gs.isBlocked(c, r)) ctx.fillStyle = MM_BLOCKED;
        ctx.fillRect(gx(c), gy(r), cw + 0.5, ch + 0.5);
        const fog = minimapFogAlpha(vision.visibilityAt(c, r));
        if (fog > 0) {
          ctx.fillStyle = `rgba(${MINIMAP_FOG_RGB}, ${fog})`;
          ctx.fillRect(gx(c), gy(r), cw + 0.5, ch + 0.5);
        }
      }
    }
    // Vorkommen: nur sichtbar/erinnert (Geist-Blip im Nebel gedimmt).
    for (const n of gs.nodes) {
      const a = blipAlpha(vision.visibilityAt(n.col, n.row));
      if (a < 0) continue;
      ctx.globalAlpha = a;
      ctx.fillStyle = "#6f9a55";
      ctx.fillRect(gx(n.col), gy(n.row), cw * 1.4, ch * 1.4);
    }
    ctx.globalAlpha = 1;
    // Gebaeude: Freund immer; Feind sichtbar=voll, erkundet=Geist-Blip, sonst weg.
    for (const b of gs.buildings) {
      let a = 1;
      if (b.owner !== "spieler") {
        a = blipAlpha(tilesFog(vision, b.footprintTiles()));
        if (a < 0) continue;
      }
      ctx.globalAlpha = a;
      ctx.fillStyle = b.owner === "spieler" ? "#6f9e80" : "#a86e6e";
      ctx.fillRect(gx(b.col), gy(b.row), Math.max(2, b.footprint.w * cw), Math.max(2, b.footprint.h * ch));
    }
    ctx.globalAlpha = 1;
    // Einheiten: Freund immer; Feind-Blip nur im aktuellen Sichtfeld (mobil).
    for (const u of gs.units) {
      if (u.owner !== "spieler" && !vision.isVisible(u.col, u.row)) continue;
      ctx.fillStyle = u.owner === "spieler" ? "#9ab8a4" : "#b58e8e";
      ctx.fillRect(gx(u.col) - 1, gy(u.row) - 1, 3, 3);
    }
    // Kamerarahmen: der Iso-Viewport ist im Kachelraum ein gedrehtes Viereck.
    // Alle vier Ecken projizieren und als Polygon zeichnen (vorher: naive
    // 2-Punkt-Bbox -> degeneriertes Mini-Rechteck, Kritiker-Befund 6).
    const scene = this.gameScene();
    if (scene) {
      const v = scene.cameras.main.worldView;
      const corners = [
        worldToTile(v.x, v.y),
        worldToTile(v.x + v.width, v.y),
        worldToTile(v.x + v.width, v.y + v.height),
        worldToTile(v.x, v.y + v.height),
      ];
      // gedaempftes Stahl-Cyan statt Reinweiss: nichts ausser dem Koenig darf der
      // hellste Punkt sein (Leucht-Exklusivitaet, unabhaengiger Kritiker-Befund).
      ctx.strokeStyle = "rgba(150,166,158,0.85)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(gx(corners[0].col), gy(corners[0].row));
      for (let i = 1; i < 4; i++) ctx.lineTo(gx(corners[i].col), gy(corners[i].row));
      ctx.closePath();
      ctx.stroke();
    }
  }

  // --- Helfer ----------------------------------------------------------------

  private setText(sel: string, text: string): void {
    const el = this.root.querySelector(sel);
    if (el && el.textContent !== text) el.textContent = text;
  }
}
