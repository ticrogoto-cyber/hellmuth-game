import "../ui/design_system.css";
import "./menu.css";
import { buildMainMenu } from "./main_menu";
import { buildSkirmishSetup } from "./skirmish_setup";
import { buildOptions } from "./options";

// Zustands-Router der Menue-Familie. Single-Level-State-Machine; Florilegium
// delegiert an externe UI. Subview-Header ist eine sticky Topbar mit Back-
// Pfeil + Wortmarke (Subagent #12). Browser-History (pushState/popstate) ist
// die Routing-Wahrheit; URL-State `?screen=skirmish` etc.

export type MenuState = "main" | "skirmish" | "florilegium" | "options";

export interface FlorilegiumBridge {
  open(mode: "fullview" | "overlay"): void;
  close(): void;
  onClose(cb: () => void): void;
}

export interface GameBridge {
  start(params: SkirmishParams): void;
}

export interface SkirmishParams {
  mapId: string;
  faction: "hellmuth" | "moderat";
  difficulty: "leicht" | "normal" | "schwer";
}

export interface MenuRouterOpts {
  florilegium?: FlorilegiumBridge;
  game?: GameBridge;
}

const ROOT_ID = "hellmuth-menu";
const URL_PARAM = "screen";

const TITLES: Record<MenuState, string> = {
  main: "Hauptmenue",
  skirmish: "Skirmish",
  florilegium: "Florilegium",
  options: "Optionen",
};

export class MenuRouter {
  private readonly root: HTMLElement;
  private readonly stage: HTMLElement;
  private state: MenuState = "main";
  private active = false;
  private readonly florilegium?: FlorilegiumBridge;
  private readonly game?: GameBridge;
  /** Suppress URL pushes during popstate handling. */
  private syncingFromUrl = false;

  constructor(opts: MenuRouterOpts = {}) {
    this.florilegium = opts.florilegium;
    this.game = opts.game;

    this.root = document.createElement("div");
    this.root.id = ROOT_ID;
    this.root.className = "ds-root";
    this.root.setAttribute("role", "navigation");
    this.root.setAttribute("aria-label", "Hauptmenue");

    this.stage = document.createElement("div");
    this.stage.className = "menu-stage";
    this.root.appendChild(this.stage);
    this.root.style.display = "none";
    document.body.appendChild(this.root);

    this.florilegium?.onClose(() => {
      if (this.state === "florilegium") this.go("main");
    });

    document.addEventListener("keydown", (e) => {
      if (!this.active) return;
      if (e.key === "Escape") {
        if (this.state === "main" || this.state === "florilegium") return;
        e.preventDefault();
        this.go("main");
      }
    });

    // Browser-History: popstate -> Router-State synchronisieren.
    window.addEventListener("popstate", (e) => {
      if (!this.active) return;
      const st = (e.state as { screen?: MenuState } | null)?.screen;
      const target: MenuState =
        st && (["main", "skirmish", "florilegium", "options"] as MenuState[]).includes(st)
          ? st
          : "main";
      this.syncingFromUrl = true;
      this.go(target);
      this.syncingFromUrl = false;
    });
  }

  start(): void {
    this.active = true;
    this.show();
    // Initial-State aus der URL ziehen, sonst main.
    const qs = new URLSearchParams(location.search);
    const fromUrl = qs.get(URL_PARAM) as MenuState | null;
    const initial: MenuState =
      fromUrl && (["main", "skirmish", "florilegium", "options"] as MenuState[]).includes(fromUrl)
        ? fromUrl
        : "main";
    this.syncingFromUrl = true;
    this.go(initial);
    this.syncingFromUrl = false;
  }

  isActive(): boolean {
    return this.active;
  }

  private show(): void {
    this.root.style.display = "";
  }
  private hide(): void {
    this.root.style.display = "none";
  }

  go(state: MenuState): void {
    this.state = state;
    this.pushHistory(state);
    if (state === "florilegium") {
      this.hide();
      this.florilegium?.open("fullview");
      return;
    }
    this.show();
    this.render();
  }

  private pushHistory(state: MenuState): void {
    if (this.syncingFromUrl) return;
    try {
      const qs = new URLSearchParams(location.search);
      qs.set(URL_PARAM, state);
      const url = `${location.pathname}?${qs.toString()}`;
      history.pushState({ screen: state }, "", url);
    } catch {
      /* still */
    }
  }

  private render(): void {
    this.stage.innerHTML = "";
    if (this.state === "main") {
      const view = buildMainMenu({
        onSkirmish: () => this.go("skirmish"),
        onFlorilegium: () => this.go("florilegium"),
        onOptions: () => this.go("options"),
      });
      this.stage.appendChild(view);
      return;
    }

    // Subviews bekommen das gemeinsame Topbar/Actions-Geruest.
    const screen = document.createElement("section");
    screen.className = "menu-screen";
    screen.setAttribute("aria-labelledby", "menu-screen-title");

    // Topbar mit Back-Pfeil
    const topbar = document.createElement("header");
    topbar.className = "menu-topbar";
    const back = document.createElement("button");
    back.type = "button";
    back.className = "menu-back";
    back.setAttribute("aria-label", "Zurueck zum Hauptmenue");
    const arrow = document.createElement("span");
    arrow.className = "menu-back-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "‹";
    back.appendChild(arrow);
    back.append("Hauptmenue");
    back.addEventListener("click", () => this.go("main"));
    topbar.appendChild(back);
    const mark = document.createElement("div");
    mark.className = "menu-topbar-mark";
    mark.textContent = `HELLMUTH · ${TITLES[this.state].toUpperCase()}`;
    topbar.appendChild(mark);
    const right = document.createElement("div");
    right.className = "menu-topbar-right";
    topbar.appendChild(right);
    screen.appendChild(topbar);

    // Hauptbereich
    const main = document.createElement("div");
    main.className = "menu-screen-main";
    const inner = document.createElement("div");
    inner.className = "menu-screen-inner";
    main.appendChild(inner);
    screen.appendChild(main);

    let view: HTMLElement;
    let primaryAction: { label: string; run: () => void } | null = null;

    if (this.state === "skirmish") {
      view = buildSkirmishSetup({
        onStart: (p) => {
          this.active = false;
          this.hide();
          this.game?.start(p);
        },
      });
      primaryAction = {
        label: "Spiel starten",
        run: () => (view as HTMLElement & { __action?: () => void }).__action?.(),
      };
    } else if (this.state === "options") {
      view = buildOptions({ onBack: () => this.go("main") });
    } else {
      view = document.createElement("div");
    }

    const title = document.createElement("h2");
    title.id = "menu-screen-title";
    title.className = "menu-screen-title";
    title.textContent = TITLES[this.state];
    inner.appendChild(title);
    inner.appendChild(view);

    // Actions-Bar unten
    if (primaryAction) {
      const actions = document.createElement("div");
      actions.className = "menu-actions";
      const left = document.createElement("div");
      const right2 = document.createElement("div");
      right2.className = "menu-actions-right";
      const startBtn = document.createElement("button");
      startBtn.type = "button";
      startBtn.className = "btn btn-primary";
      startBtn.textContent = primaryAction.label;
      startBtn.dataset.action = "start";
      startBtn.addEventListener("click", primaryAction.run);
      right2.appendChild(startBtn);
      actions.appendChild(left);
      actions.appendChild(right2);
      screen.appendChild(actions);
    }

    this.stage.appendChild(screen);
  }
}

export function mountMenu(opts: MenuRouterOpts = {}): MenuRouter {
  return new MenuRouter(opts);
}
