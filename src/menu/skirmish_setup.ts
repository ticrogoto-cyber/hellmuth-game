import "./skirmish_setup.css";
import { loadMaps, mapThumbUrl } from "./maps_data";
import type { MapDef } from "./maps_data";
import type { SkirmishParams } from "./menu_router";
import { buildSigilFor } from "./sigils";

// Skirmish-Setup. 3-Spalten Master-Detail (Subagent #2/#10, AoE4-Modell):
// Map-Hero links, Karten-Liste Mitte, Konfig rechts. Letzte Konfiguration
// wird in localStorage["hellmuth.skirmish.last"] persistiert und beim Mount
// vorausgefuellt.
//
// Anzeige-Namen der Fraktionen: HELLMUTH / MODERAT in Versalien (Ticro-Kanon,
// docs/NAMING_CANON.md). Der Held heisst "Hellmuth" gemischt -- hier geht es um
// die Fraktion, also Versalien. Interner FactionId-Schluessel bleibt
// "hellmuth"/"moderat" (loader.ts, projektweiter Code-Identifier).

type Faction = "hellmuth" | "moderat";
type Difficulty = "leicht" | "normal" | "schwer";

export interface SkirmishCallbacks {
  onStart(params: SkirmishParams): void;
}

const FACTION_LABEL: Record<Faction, string> = {
  hellmuth: "HELLMUTH",
  moderat: "MODERAT",
};
const DIFFICULTIES: Array<{ id: Difficulty; label: string; flavor: string }> = [
  { id: "leicht", label: "Leicht", flavor: "Der Gegner traeumt von Zucker und tut wenig." },
  { id: "normal", label: "Normal", flavor: "Der Gegner weiss, wo dein Wasser herkommt." },
  { id: "schwer", label: "Schwer", flavor: "Der Gegner vergiftet die Quellen, bevor du sie siehst." },
];

const STORAGE_KEY = "hellmuth.skirmish.last";

interface PersistedSkirmish {
  mapId?: string;
  faction?: Faction;
  difficulty?: Difficulty;
}

function loadLast(): PersistedSkirmish {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as PersistedSkirmish;
  } catch {
    return {};
  }
}

function saveLast(state: SkirmishParams): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* still */
  }
}

export function buildSkirmishSetup(cb: SkirmishCallbacks): HTMLElement {
  const maps = loadMaps();
  const last = loadLast();
  const state: SkirmishParams = {
    mapId: maps.find((m) => m.id === last.mapId)?.id ?? maps[0]?.id ?? "",
    faction: last.faction ?? "hellmuth",
    difficulty: last.difficulty ?? "normal",
  };

  const grid = document.createElement("div");
  grid.className = "skirmish";

  // --- Spalte links: Map-Hero -------------------------------------------
  const hero = document.createElement("div");
  hero.className = "skirmish-hero";
  const heroImageWrap = document.createElement("div");
  heroImageWrap.className = "skirmish-hero-image";
  const heroImg = document.createElement("img");
  heroImg.alt = "";
  heroImageWrap.appendChild(heroImg);
  hero.appendChild(heroImageWrap);
  const heroName = document.createElement("div");
  heroName.className = "skirmish-hero-name";
  hero.appendChild(heroName);
  const heroMeta = document.createElement("div");
  heroMeta.className = "skirmish-hero-meta";
  hero.appendChild(heroMeta);
  const heroDesc = document.createElement("div");
  heroDesc.className = "skirmish-hero-desc";
  hero.appendChild(heroDesc);
  grid.appendChild(hero);

  const refreshHero = (): void => {
    const m = maps.find((x) => x.id === state.mapId);
    if (!m) return;
    heroImg.src = mapThumbUrl(m);
    heroImg.alt = m.name;
    heroName.textContent = m.name;
    heroMeta.innerHTML = "";
    const sizeChip = document.createElement("span");
    sizeChip.innerHTML = `<strong>Groesse:</strong> ${m.size.toUpperCase()}`;
    const slotsChip = document.createElement("span");
    slotsChip.innerHTML = `<strong>Spieler:</strong> ${m.max_players}`;
    heroMeta.appendChild(sizeChip);
    heroMeta.appendChild(slotsChip);
    heroDesc.textContent = m.description;
  };

  // --- Spalte Mitte: Karten-Liste --------------------------------------
  const mapsCol = document.createElement("div");
  mapsCol.className = "skirmish-field";
  mapsCol.appendChild(label("Karten"));
  const mapList = document.createElement("div");
  mapList.className = "skirmish-maps";
  mapList.setAttribute("role", "radiogroup");
  mapList.setAttribute("aria-label", "Kartenwahl");
  const mapButtons = new Map<string, HTMLButtonElement>();
  for (const m of maps) {
    const card = buildMapCard(m, () => {
      state.mapId = m.id;
      for (const [id, b] of mapButtons) {
        const active = id === m.id;
        b.classList.toggle("is-active", active);
        b.setAttribute("aria-checked", String(active));
      }
      refreshHero();
      saveLast(state);
    });
    const active = m.id === state.mapId;
    card.classList.toggle("is-active", active);
    card.setAttribute("aria-checked", String(active));
    mapButtons.set(m.id, card);
    mapList.appendChild(card);
  }
  if (!maps.length) {
    const empty = document.createElement("div");
    empty.className = "skirmish-hero-desc";
    empty.textContent = "Keine Karten in data/maps/index.json.";
    mapList.appendChild(empty);
  }
  mapsCol.appendChild(mapList);
  grid.appendChild(mapsCol);

  // --- Spalte rechts: Konfiguration ------------------------------------
  const config = document.createElement("div");
  config.className = "skirmish-config";
  grid.appendChild(config);

  // Fraktions-Banner (grosses Sigil, Subagent #2)
  const facField = document.createElement("div");
  facField.className = "skirmish-field";
  facField.appendChild(label("Eigene Fraktion"));
  const banner = document.createElement("div");
  banner.className = "skirmish-banner";
  const bannerSigil = document.createElement("div");
  bannerSigil.className = "skirmish-banner-sigil";
  const bannerName = document.createElement("div");
  bannerName.className = "skirmish-banner-name";
  const bannerVs = document.createElement("div");
  bannerVs.className = "skirmish-vs";
  banner.appendChild(bannerSigil);
  banner.appendChild(bannerName);
  banner.appendChild(bannerVs);
  const facChoice = document.createElement("div");
  facChoice.className = "skirmish-choice";
  facChoice.setAttribute("role", "radiogroup");
  facChoice.setAttribute("aria-label", "Eigene Fraktion");

  const refreshFaction = (): void => {
    bannerSigil.innerHTML = "";
    bannerSigil.appendChild(buildSigilFor(state.faction, "hero"));
    bannerName.textContent = FACTION_LABEL[state.faction];
    const enemy: Faction = state.faction === "hellmuth" ? "moderat" : "hellmuth";
    bannerVs.textContent = `vs. ${FACTION_LABEL[enemy]}`;
    saveLast(state);
  };

  (["hellmuth", "moderat"] as Faction[]).forEach((f) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = FACTION_LABEL[f];
    b.dataset.faction = f;
    b.setAttribute("role", "radio");
    const active = state.faction === f;
    b.classList.toggle("is-active", active);
    b.setAttribute("aria-checked", String(active));
    b.addEventListener("click", () => {
      state.faction = f;
      facChoice.querySelectorAll("button").forEach((x) => {
        const a = x === b;
        x.classList.toggle("is-active", a);
        x.setAttribute("aria-checked", String(a));
      });
      refreshFaction();
    });
    facChoice.appendChild(b);
  });
  facField.appendChild(banner);
  facField.appendChild(facChoice);
  config.appendChild(facField);

  // Schwierigkeit + KI-Persoenlichkeits-Satz
  const diffField = document.createElement("div");
  diffField.className = "skirmish-field";
  diffField.appendChild(label("Schwierigkeit"));
  const diffChoice = document.createElement("div");
  diffChoice.className = "skirmish-choice";
  diffChoice.setAttribute("role", "radiogroup");
  diffChoice.setAttribute("aria-label", "Schwierigkeit");
  const diffFlavor = document.createElement("div");
  diffFlavor.className = "skirmish-flavor";
  const refreshDiff = (): void => {
    const d = DIFFICULTIES.find((x) => x.id === state.difficulty);
    if (d) diffFlavor.textContent = d.flavor;
    saveLast(state);
  };
  DIFFICULTIES.forEach((d) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = d.label;
    b.dataset.difficulty = d.id;
    b.setAttribute("role", "radio");
    const active = state.difficulty === d.id;
    b.classList.toggle("is-active", active);
    b.setAttribute("aria-checked", String(active));
    b.addEventListener("click", () => {
      state.difficulty = d.id;
      diffChoice.querySelectorAll("button").forEach((x) => {
        const a = x === b;
        x.classList.toggle("is-active", a);
        x.setAttribute("aria-checked", String(a));
      });
      refreshDiff();
    });
    diffChoice.appendChild(b);
  });
  diffField.appendChild(diffChoice);
  diffField.appendChild(diffFlavor);
  config.appendChild(diffField);

  // Anfangszustand rendern
  refreshHero();
  refreshFaction();
  refreshDiff();

  // Aktions-Hooks fuer den Router (er baut die sticky-Bar unten):
  (grid as HTMLElement & { __action?: () => void }).__action = () => {
    if (!state.mapId) return;
    saveLast(state);
    cb.onStart({ ...state });
  };

  return grid;
}

function label(text: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "skirmish-label";
  el.textContent = text;
  return el;
}

function buildMapCard(m: MapDef, onPick: () => void): HTMLButtonElement {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "skirmish-map";
  card.dataset.map = m.id;
  card.setAttribute("role", "radio");
  const thumbWrap = document.createElement("div");
  thumbWrap.className = "skirmish-map-thumb";
  const thumb = document.createElement("img");
  thumb.src = mapThumbUrl(m);
  thumb.alt = "";
  thumb.addEventListener("error", () => thumb.removeAttribute("src"));
  thumbWrap.appendChild(thumb);
  const info = document.createElement("div");
  info.className = "skirmish-map-info";
  const name = document.createElement("div");
  name.className = "skirmish-map-name";
  name.textContent = m.name;
  const mini = document.createElement("div");
  mini.className = "skirmish-map-mini";
  mini.textContent = `${m.size.toUpperCase()} · ${m.max_players} SPIELER`;
  info.appendChild(name);
  info.appendChild(mini);
  card.appendChild(thumbWrap);
  card.appendChild(info);
  card.addEventListener("click", onPick);
  card.setAttribute(
    "aria-label",
    `Karte: ${m.name}, ${m.size}, ${m.max_players} Spieler`,
  );
  return card;
}
