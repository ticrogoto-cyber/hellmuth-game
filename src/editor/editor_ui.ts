// HTML-Werkzeugleiste des Editors. Eigenes DOM, eigenes CSS (editor.css) -- es
// wird KEINE HUD-Datei importiert oder angefasst (Briefing §3: getrennte Dateien,
// kein Merge-Konflikt mit der Parallel-Instanz). Die Leiste treibt nur die
// oeffentliche Szenen-API window.__editor; die Wahrheit liegt in der Szene.

import Phaser from "phaser";
import "./editor.css";
import { GROUND_SORTS, DECAL_SETS } from "./terrain_assets";
import { OBJECT_CATALOG, NODE_CATALOG, type ToolId, type ToolState } from "./editor_scene";

interface EditorApi {
  setTool: (t: Partial<ToolState>) => void;
  getTool: () => ToolState;
  serialize: () => string;
  load: (raw: unknown) => void;
  undo: () => void;
  redo: () => void;
  roundtripIdentical: () => boolean;
  /** DESTILLAT-SYSTEM: Liste der baubaren Gebaeude je Fraktion (faction-gefiltert,
   *  testmode override; disabled+reason bei Cap erreicht). */
  buildingCatalog: (faction: "hellmuth" | "moderat") => {
    type: string; faction: string; tier: number | null; w: number; h: number;
    placed: number; max: number | null; disabled: boolean; reason: string;
  }[];
}
function api(): EditorApi | undefined {
  return (window as unknown as { __editor?: EditorApi }).__editor;
}

const state: ToolState = {
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

function push(): void {
  api()?.setTool(state);
}

export function mountEditorUi(_game: Phaser.Game): void {
  if (document.getElementById("editor-ui")) return;
  const root = document.createElement("div");
  root.id = "editor-ui";
  document.body.appendChild(root);

  root.appendChild(header());
  const tools = toolRow();
  root.appendChild(tools);
  const opts = document.createElement("div");
  opts.className = "ed-options";
  root.appendChild(opts);
  root.appendChild(sliders());
  root.appendChild(actionRow());

  // Optionspanel je Werkzeug neu aufbauen.
  const renderOptions = () => {
    // Tool-Wechsel raeumt OptIns-DOM. Der buildingPicker registriert einen
    // __editorBuildingChanged-Hook, der sonst auf den freigewordenen items-DIV
    // zeigt -> hier explizit nullen, damit placeBuilding aus dem Spiel-Pfad nicht
    // in detached DOM schreibt.
    (window as unknown as { __editorBuildingChanged?: () => void }).__editorBuildingChanged = undefined;
    opts.innerHTML = "";
    if (state.tool === "terrain") opts.appendChild(sortPicker());
    else if (state.tool === "decal") opts.appendChild(decalPicker());
    else if (state.tool === "object") opts.appendChild(objectPicker());
    else if (state.tool === "node") opts.appendChild(nodePicker());
    else if (state.tool === "spawn") opts.appendChild(spawnPicker());
    else if (state.tool === "fog") opts.appendChild(note("Nebel-Quelle setzen (Platzhalter-Layer, Effekt folgt)."));
    else if (state.tool === "building") opts.appendChild(buildingPicker());
    else if (state.tool === "streu") opts.appendChild(streuPicker());
    else if (state.tool === "erase") opts.appendChild(note("Radierer: Terrain auf Default, Objekte/Decals im Radius entfernen."));
  };

  const selectTool = (t: ToolId) => {
    state.tool = t;
    tools.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach((b) => b.classList.toggle("active", b.dataset.tool === t));
    renderOptions();
    push();
  };
  tools.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach((btn) => {
    btn.addEventListener("click", () => selectTool(btn.dataset.tool as ToolId));
  });
  // Tastatur-Werkzeugwechsel (1/2/3/Tab in der Szene) in die Leiste spiegeln.
  (window as unknown as { __editorToolChanged?: (t: ToolId) => void }).__editorToolChanged = (t) => selectTool(t);
  // Pipette (Strg) hebt die aktive Sorte -> Chips aktualisieren.
  (window as unknown as { __editorSortChanged?: (i: number) => void }).__editorSortChanged = (i) => {
    state.sortIdx = i;
    if (state.tool === "terrain") renderOptions();
  };
  renderOptions();
  push();
}

function header(): HTMLElement {
  const h = document.createElement("div");
  h.className = "ed-header";
  h.innerHTML = `<span class="ed-title">HELLMUTH</span><span class="ed-sub">KARTENEDITOR</span>`;
  return h;
}

const TOOLS: { id: ToolId; label: string }[] = [
  { id: "terrain", label: "Terrain" },
  { id: "decal", label: "Decals" },
  { id: "object", label: "Objekte" },
  { id: "node", label: "Vorkommen" },
  { id: "spawn", label: "Start" },
  { id: "fog", label: "Nebel" },
  { id: "building", label: "Gebaeude" }, // DESTILLAT-SYSTEM
  { id: "streu", label: "Streuen" }, // CODE4 PROP-SCATTERING
  { id: "erase", label: "Radierer" },
];

function toolRow(): HTMLElement {
  const row = document.createElement("div");
  row.className = "ed-tools";
  for (const t of TOOLS) {
    const b = document.createElement("button");
    b.dataset.tool = t.id;
    b.textContent = t.label;
    b.className = "ed-tool" + (t.id === state.tool ? " active" : "");
    row.appendChild(b);
  }
  return row;
}

function sortPicker(): HTMLElement {
  const wrap = chips();
  GROUND_SORTS.forEach((s, i) => {
    const c = chip(s.label, i === state.sortIdx, s.fallback);
    c.addEventListener("click", () => {
      state.sortIdx = i;
      mark(wrap, c);
      push();
    });
    wrap.appendChild(c);
  });
  return wrap;
}

function decalPicker(): HTMLElement {
  const wrap = chips();
  DECAL_SETS.forEach((d) => {
    const c = chip(d.label, d.id === state.decalSet, d.faction === "moderat" ? "#ff3da5" : "#6f8f5a");
    c.addEventListener("click", () => {
      state.decalSet = d.id;
      mark(wrap, c);
      push();
    });
    wrap.appendChild(c);
  });
  return wrap;
}

function objectPicker(): HTMLElement {
  const wrap = document.createElement("div");
  for (const grp of OBJECT_CATALOG) {
    const lbl = document.createElement("div");
    lbl.className = "ed-grouplabel";
    lbl.textContent = grp.group;
    wrap.appendChild(lbl);
    const row = chips();
    for (const key of grp.keys) {
      const c = chip(key, key === state.objectKey);
      c.addEventListener("click", () => {
        state.objectKey = key;
        wrap.querySelectorAll(".ed-chip").forEach((x) => x.classList.remove("active"));
        c.classList.add("active");
        push();
      });
      row.appendChild(c);
    }
    wrap.appendChild(row);
  }
  return wrap;
}

// DESTILLAT-SYSTEM: zeigt baubare Gebaeude je Fraktion (faction-Toggle); ausgegraute
// Eintraege bei Per-Fraktions-Cap (z. B. nach drei Destillen). Reines UI -- die
// Wahrheit (Sicht/Cap) liefert die Editor-Szene ueber buildingCatalog.
function buildingPicker(): HTMLElement {
  const wrap = document.createElement("div");
  const factions: ToolState["buildingFaction"][] = ["hellmuth", "moderat"];
  // Fraktions-Umschalter (gleiches Idiom wie spawnPicker, klarer Trennstrich oben).
  const facRow = chips();
  factions.forEach((f) => {
    const c = chip(`Fraktion: ${f === "moderat" ? "Moderat" : "Hellmuth"}`, f === state.buildingFaction, f === "moderat" ? "#ff3da5" : "#ffd25a");
    c.addEventListener("click", () => {
      state.buildingFaction = f;
      // Beim Faction-Wechsel die Auswahl konsistent machen:
      //  - Katalog enthaelt aktuellen Key       -> nichts tun.
      //  - Katalog leer (keine baubaren Gebaeude fuer die Fraktion)
      //                                         -> Key auf "" (placeBuilding scheitert
      //                                            sauber, statt im testmode den
      //                                            alten Typ unter neuer Fraktion zu
      //                                            erlauben).
      //  - Katalog hat Eintraege, aber Key nicht drin -> ersten Eintrag waehlen.
      const cat = api()?.buildingCatalog(f) ?? [];
      if (!cat.length) state.buildingKey = "";
      else if (!cat.some((b) => b.type === state.buildingKey)) state.buildingKey = cat[0].type;
      renderItems();
      mark(facRow, c);
      push();
    });
    facRow.appendChild(c);
  });
  wrap.appendChild(facRow);

  const items = document.createElement("div");
  items.style.marginTop = "6px";
  wrap.appendChild(items);

  function renderItems(): void {
    items.innerHTML = "";
    const cat = api()?.buildingCatalog(state.buildingFaction) ?? [];
    if (!cat.length) {
      items.appendChild(note(`Keine baubaren Gebaeude fuer ${state.buildingFaction === "moderat" ? "Moderat" : "Hellmuth"} in dieser Karte.`));
      return;
    }
    const row = chips();
    for (const b of cat) {
      // Label clampt placed/max-Anzeige: bei stale Katalog (placed>max nach Cap-
      // Senkung) sonst "4/3" statt "3/3". Disabled-Status (scene) bleibt unberuehrt.
      const placedShown = b.max != null ? Math.min(b.placed, b.max) : b.placed;
      const label = `${b.type}${b.tier && b.tier > 1 ? ` (T${b.tier})` : ""}${b.max != null ? ` ${placedShown}/${b.max}` : ""}`;
      const c = chip(label, b.type === state.buildingKey);
      if (b.disabled) {
        c.classList.add("disabled");
        c.title = b.reason;
        c.style.opacity = "0.45";
        c.style.cursor = "not-allowed";
      }
      c.addEventListener("click", () => {
        if (b.disabled) return; // Hard-Cap-Visualisierung: kein Click wenn Maximum erreicht
        state.buildingKey = b.type;
        mark(row, c);
        push();
      });
      row.appendChild(c);
    }
    items.appendChild(row);
  }
  renderItems();
  // Nach jedem Editor-Click die Cap-Visualisierung aktualisieren (placed-Counts).
  (window as unknown as { __editorBuildingChanged?: () => void }).__editorBuildingChanged = renderItems;
  return wrap;
}

function nodePicker(): HTMLElement {
  const wrap = chips();
  NODE_CATALOG.forEach((n) => {
    const c = chip(n, n === state.nodeType);
    c.addEventListener("click", () => {
      state.nodeType = n;
      mark(wrap, c);
      push();
    });
    wrap.appendChild(c);
  });
  return wrap;
}

function spawnPicker(): HTMLElement {
  const wrap = chips();
  [1, 2].forEach((p) => {
    const c = chip(`Spieler ${p} (${p === 2 ? "Moderat" : "Hellmuth"})`, p === state.spawnPlayer, p === 2 ? "#ff3da5" : "#ffd25a");
    c.addEventListener("click", () => {
      state.spawnPlayer = p;
      mark(wrap, c);
      push();
    });
    wrap.appendChild(c);
  });
  return wrap;
}

// CODE4 PROP-SCATTERING: Werkzeug-Panel fuer den regelbasierten Streu-Pass.
// Setzt Kategorie (fels/baum/wald/streu), Preset (duenn/zielbild/dicht) und
// Seed. Der eigentliche Pinselradius kommt aus dem Groesse-Slider unten (analog
// zum Terrain-/Radierer-Werkzeug). Preview folgt live dem Cursor -> WYSIWYG.
const SCATTER_CATEGORIES: ("fels" | "baum" | "wald" | "streu")[] = ["fels", "baum", "wald", "streu"];
const SCATTER_PRESET_NAMES: ("duenn" | "zielbild" | "dicht")[] = ["duenn", "zielbild", "dicht"];

interface StreuApi {
  streuMap?: (preset: string, seed: number, categories?: string[]) => { added: number; stats: unknown };
}
function streuApi(): StreuApi | undefined {
  return (window as unknown as { __editor?: StreuApi }).__editor;
}

function streuPicker(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.appendChild(note("Kategorie:"));
  const catRow = chips();
  SCATTER_CATEGORIES.forEach((cat) => {
    const c = chip(cat, cat === state.scatterCategory);
    c.addEventListener("click", () => {
      state.scatterCategory = cat;
      mark(catRow, c);
      push();
    });
    catRow.appendChild(c);
  });
  wrap.appendChild(catRow);

  wrap.appendChild(note("Preset (Dichte):"));
  const presetRow = chips();
  SCATTER_PRESET_NAMES.forEach((p) => {
    const c = chip(p, p === state.scatterPresetName);
    c.addEventListener("click", () => {
      state.scatterPresetName = p;
      mark(presetRow, c);
      push();
    });
    presetRow.appendChild(c);
  });
  wrap.appendChild(presetRow);

  // Seed-Eingabe (integer). Enter oder blur uebernimmt.
  const seedRow = document.createElement("div");
  seedRow.className = "ed-slider";
  const seedLabel = document.createElement("span");
  seedLabel.textContent = "Seed";
  seedRow.appendChild(seedLabel);
  const seedInput = document.createElement("input");
  seedInput.type = "number";
  seedInput.step = "1";
  seedInput.value = String(state.scatterSeed);
  seedInput.style.width = "80px";
  seedInput.addEventListener("change", () => {
    const v = parseInt(seedInput.value, 10);
    if (Number.isFinite(v)) {
      state.scatterSeed = v | 0;
      push();
    }
  });
  seedRow.appendChild(seedInput);
  wrap.appendChild(seedRow);

  // Karte-anwenden Knopf: sofort ganze Karte mit Preset+Seed streuen.
  const applyRow = document.createElement("div");
  applyRow.className = "ed-actions";
  const applyBtn = document.createElement("button");
  applyBtn.className = "ed-action";
  applyBtn.textContent = "Preset auf ganze Karte";
  applyBtn.addEventListener("click", () => {
    const api2 = streuApi();
    if (!api2 || !api2.streuMap) return;
    const r = api2.streuMap(state.scatterPresetName, state.scatterSeed);
    console.log(`[streu] Preset '${state.scatterPresetName}' auf Karte angewendet: +${r.added} Doodads`);
  });
  applyRow.appendChild(applyBtn);
  wrap.appendChild(applyRow);

  wrap.appendChild(note("Linksklick streut in Groesse-Radius. Rechtsklick loescht die aktive Kategorie."));
  return wrap;
}

function sliders(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "ed-sliders";
  wrap.appendChild(slider("Groesse", 1, 10, 1, state.size, (v) => {
    state.size = v;
    push();
  }));
  wrap.appendChild(slider("Staerke/Dichte", 0.05, 1, 0.05, state.strength, (v) => {
    state.strength = v;
    push();
  }));
  wrap.appendChild(slider("Haerte", 0, 1, 0.05, state.hardness, (v) => {
    state.hardness = v;
    push();
  }));
  return wrap;
}

function actionRow(): HTMLElement {
  const row = document.createElement("div");
  row.className = "ed-actions";
  row.appendChild(button("Undo", () => api()?.undo()));
  row.appendChild(button("Redo", () => api()?.redo()));
  row.appendChild(button("Speichern", saveMap));
  row.appendChild(button("Laden", loadMap));
  row.appendChild(button("Spielen", playMap));
  return row;
}

function saveMap(): void {
  const text = api()?.serialize();
  if (!text) return;
  const blob = new Blob([text], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "karte.hellmuth.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

function loadMap(): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file) return;
    file.text().then((t) => api()?.load(JSON.parse(t)));
  });
  input.click();
}

function playMap(): void {
  const text = api()?.serialize();
  if (!text) return;
  sessionStorage.setItem("hellmuth_editor_map", text);
  location.href = "./?map=__session";
}

// --- DOM-Helfer -------------------------------------------------------------

function chips(): HTMLElement {
  const w = document.createElement("div");
  w.className = "ed-chips";
  return w;
}
function chip(label: string, active: boolean, swatch?: string): HTMLElement {
  const c = document.createElement("button");
  c.className = "ed-chip" + (active ? " active" : "");
  if (swatch) {
    const s = document.createElement("span");
    s.className = "ed-swatch";
    s.style.background = swatch;
    c.appendChild(s);
  }
  c.appendChild(document.createTextNode(label));
  return c;
}
function mark(wrap: HTMLElement, active: HTMLElement): void {
  wrap.querySelectorAll(".ed-chip").forEach((x) => x.classList.remove("active"));
  active.classList.add("active");
}
function note(text: string): HTMLElement {
  const n = document.createElement("div");
  n.className = "ed-note";
  n.textContent = text;
  return n;
}
function button(label: string, fn: () => void): HTMLElement {
  const b = document.createElement("button");
  b.className = "ed-action";
  b.textContent = label;
  b.addEventListener("click", fn);
  return b;
}
function slider(label: string, min: number, max: number, step: number, val: number, fn: (v: number) => void): HTMLElement {
  const wrap = document.createElement("label");
  wrap.className = "ed-slider";
  const span = document.createElement("span");
  span.textContent = `${label}: ${val}`;
  const input = document.createElement("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(val);
  input.addEventListener("input", () => {
    const v = parseFloat(input.value);
    span.textContent = `${label}: ${v}`;
    fn(v);
  });
  wrap.appendChild(span);
  wrap.appendChild(input);
  return wrap;
}
