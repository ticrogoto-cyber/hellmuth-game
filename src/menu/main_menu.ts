import "./main_menu.css";
import { buildFooter, buildBookCta } from "./footer";
import { LINKS, openExternal } from "./menu_links";
import { mountParticles } from "./particles";

export interface MainMenuCallbacks {
  onSkirmish(): void;
  onFlorilegium(): void;
  onOptions(): void;
}

interface MenuItemDef {
  label: string;
  enabled: boolean;
  action?: () => void;
  key: string;
  suffix?: string;
}

const TAGLINE = "Sucht ist der einfachere Krieg.";
const BUILD_TAG = "v0.1 alpha · HELLMUTH";

const BG_SRC = "/sprites/ui/menu/bg_hero.png";
const LOGO_SRC = "/sprites/ui/menu/logo_hellmuth.png";

export function buildMainMenu(cb: MainMenuCallbacks): HTMLElement {
  const items: MenuItemDef[] = [
    { label: "Skirmish", enabled: true, action: cb.onSkirmish, key: "skirmish" },
    { label: "Kampagne", enabled: false, key: "kampagne", suffix: "(kommt)" },
    { label: "Florilegium", enabled: true, action: cb.onFlorilegium, key: "florilegium" },
    { label: "Optionen", enabled: true, action: cb.onOptions, key: "optionen" },
    { label: "Unterstützen", enabled: true, action: () => openExternal(LINKS.support), key: "unterstuetzen" },
    { label: "Beenden", enabled: true, action: () => window.close(), key: "beenden" },
  ];

  const screen = document.createElement("section");
  screen.className = "main-menu";
  screen.setAttribute("role", "navigation");
  screen.setAttribute("aria-label", "Hauptmenue");

  // Layer 0: Background image + vignette overlay
  const bg = document.createElement("div");
  bg.className = "main-menu-bg";
  bg.setAttribute("aria-hidden", "true");
  const bgImg = document.createElement("img");
  bgImg.className = "main-menu-bg-img";
  bgImg.src = BG_SRC;
  bgImg.alt = "";
  bgImg.loading = "eager";
  bgImg.decoding = "async";
  bg.appendChild(bgImg);
  const vignette = document.createElement("div");
  vignette.className = "main-menu-bg-vignette";
  bg.appendChild(vignette);
  screen.appendChild(bg);

  // Layer 1: Particle canvas
  const canvas = document.createElement("canvas");
  canvas.className = "main-menu-particles";
  canvas.setAttribute("aria-hidden", "true");
  screen.appendChild(canvas);
  let teardownParticles: (() => void) | null = null;
  requestAnimationFrame(() => {
    teardownParticles = mountParticles(canvas);
  });

  // Layer 2: Header — logo image + tagline
  const head = document.createElement("header");
  head.className = "main-menu-head";
  const title = document.createElement("h1");
  title.className = "main-menu-title";
  title.textContent = "HELLMUTH";
  head.appendChild(title);
  const logo = document.createElement("img");
  logo.className = "main-menu-logo";
  logo.src = LOGO_SRC;
  logo.alt = "";
  logo.loading = "eager";
  logo.draggable = false;
  head.appendChild(logo);
  const tagline = document.createElement("div");
  tagline.className = "main-menu-tagline";
  tagline.textContent = TAGLINE;
  head.appendChild(tagline);
  screen.appendChild(head);

  // Layer 2: Navigation
  const nav = document.createElement("nav");
  nav.className = "main-menu-nav";
  nav.setAttribute("aria-label", "Hauptmenue-Navigation");
  const buttons: HTMLButtonElement[] = [];
  for (const def of items) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "main-menu-item" + (def.enabled ? "" : " disabled");
    btn.dataset.item = def.key;
    btn.disabled = !def.enabled;
    if (!def.enabled) btn.setAttribute("aria-disabled", "true");
    btn.append(def.label);
    if (def.suffix) {
      const sfx = document.createElement("span");
      sfx.className = "main-menu-item-suffix";
      sfx.textContent = def.suffix;
      btn.appendChild(sfx);
    }
    if (def.enabled && def.action) btn.addEventListener("click", def.action);
    nav.appendChild(btn);
    buttons.push(btn);
  }
  screen.appendChild(nav);

  // Layer 2: Footer
  const footer = document.createElement("footer");
  footer.className = "main-menu-footer";
  footer.appendChild(buildFooter());
  const cta = document.createElement("div");
  cta.className = "main-menu-footer-cta";
  cta.appendChild(buildBookCta("Buch bestellen"));
  const buildTagEl = document.createElement("div");
  buildTagEl.className = "main-menu-build-tag";
  buildTagEl.textContent = BUILD_TAG;
  cta.appendChild(buildTagEl);
  footer.appendChild(cta);
  screen.appendChild(footer);

  // Keyboard navigation
  const focusable = items
    .map((d, i) => ({ d, i }))
    .filter((x) => x.d.enabled)
    .map((x) => x.i);
  let focusPos = 0;
  const applyFocus = (): void => {
    buttons.forEach((b) => b.classList.remove("is-focus"));
    const idx = focusable[focusPos];
    if (idx != null) buttons[idx].classList.add("is-focus");
  };
  const onKey = (e: KeyboardEvent): void => {
    if (!screen.isConnected) {
      document.removeEventListener("keydown", onKey);
      teardownParticles?.();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusPos = (focusPos + 1) % focusable.length;
      applyFocus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusPos = (focusPos - 1 + focusable.length) % focusable.length;
      applyFocus();
    } else if (e.key === "Enter") {
      const idx = focusable[focusPos];
      const def = items[idx];
      if (def?.enabled && def.action) {
        e.preventDefault();
        def.action();
      }
    }
  };
  document.addEventListener("keydown", onKey);
  applyFocus();

  return screen;
}
