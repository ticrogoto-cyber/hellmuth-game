import "./options.css";
import { AudioBus } from "../audio/audio_bus";
import type { AudioBusChannel } from "../audio/audio_bus";

// Optionen-Menue. Sektion-Tabs links (AUDIO/BILD/SPIEL/EINGABE/SPRACHE),
// Inhalt rechts (Subagent #3). MVP befuellt AUDIO+SPIEL+SPRACHE, die anderen
// zwei Sektionen sind dokumentierte Stubs (Future-Proofing).

const STORAGE_KEY = "hellmuth_options_v1";

export interface OptionsCallbacks {
  onBack(): void;
}

interface NonAudioOptions {
  fullscreen: boolean;
  language: "de" | "en";
  /** Per-Channel Mute (unabhaengig vom Slider-Wert -- Subagent #3). */
  mute: { master: boolean; music: boolean; sfx: boolean; voice: boolean };
}

const NON_AUDIO_DEFAULT: NonAudioOptions = {
  fullscreen: false,
  language: "de",
  mute: { master: false, music: false, sfx: false, voice: false },
};

function readNonAudio(): NonAudioOptions {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...NON_AUDIO_DEFAULT, mute: { ...NON_AUDIO_DEFAULT.mute } };
    const o = JSON.parse(raw) as Partial<NonAudioOptions>;
    return {
      fullscreen: typeof o.fullscreen === "boolean" ? o.fullscreen : false,
      language: o.language === "en" ? "en" : "de",
      mute: { ...NON_AUDIO_DEFAULT.mute, ...(o.mute ?? {}) },
    };
  } catch {
    return { ...NON_AUDIO_DEFAULT, mute: { ...NON_AUDIO_DEFAULT.mute } };
  }
}

function writeNonAudio(patch: Partial<NonAudioOptions>): void {
  let current: Record<string, unknown> = {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) current = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    /* neu schreiben */
  }
  Object.assign(current, patch);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    /* still */
  }
}

const VOLUME_ROWS: Array<{ label: string; channel: AudioBusChannel }> = [
  { label: "Musik", channel: "music" },
  { label: "Soundeffekte", channel: "sfx" },
  { label: "Stimme", channel: "voice" },
  { label: "Gesamt", channel: "master" },
];

type TabId = "audio" | "bild" | "spiel" | "eingabe" | "sprache";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "audio", label: "Audio" },
  { id: "bild", label: "Bild" },
  { id: "spiel", label: "Spiel" },
  { id: "eingabe", label: "Eingabe" },
  { id: "sprache", label: "Sprache" },
];

export function buildOptions(_cb: OptionsCallbacks): HTMLElement {
  const nonAudio = readNonAudio();
  let activeTab: TabId = "audio";

  const root = document.createElement("div");
  root.className = "options";

  // Tab-Liste links
  const tabsEl = document.createElement("div");
  tabsEl.className = "options-tabs";
  tabsEl.setAttribute("role", "tablist");
  tabsEl.setAttribute("aria-orientation", "vertical");
  const tabButtons = new Map<TabId, HTMLButtonElement>();
  for (const t of TABS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "options-tab";
    b.dataset.tab = t.id;
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(activeTab === t.id));
    b.textContent = t.label;
    b.addEventListener("click", () => switchTab(t.id));
    tabButtons.set(t.id, b);
    tabsEl.appendChild(b);
  }
  root.appendChild(tabsEl);

  // Inhalts-Panel rechts
  const panel = document.createElement("div");
  panel.className = "options-panel";
  panel.setAttribute("role", "tabpanel");
  root.appendChild(panel);

  function switchTab(id: TabId): void {
    activeTab = id;
    for (const [tid, b] of tabButtons) b.setAttribute("aria-selected", String(tid === id));
    renderPanel();
  }

  function renderPanel(): void {
    panel.innerHTML = "";
    if (activeTab === "audio") renderAudio(panel, nonAudio);
    else if (activeTab === "sprache") renderSprache(panel, nonAudio);
    else if (activeTab === "spiel") renderSpiel(panel, nonAudio);
    else renderStub(panel, activeTab);
  }

  renderPanel();
  return root;
}

function renderAudio(panel: HTMLElement, nonAudio: NonAudioOptions): void {
  for (const row of VOLUME_ROWS) {
    const r = document.createElement("div");
    r.className = "options-row";
    const lbl = document.createElement("div");
    lbl.className = "options-row-label";
    lbl.textContent = row.label;

    const mute = document.createElement("button");
    mute.type = "button";
    mute.className = "options-mute";
    mute.dataset.mute = row.channel;
    mute.setAttribute("aria-label", `${row.label} stummschalten`);
    const setMuteSymbol = (m: boolean): void => {
      mute.textContent = m ? "◌" : "♪";
      mute.setAttribute("aria-pressed", String(m));
    };
    setMuteSymbol(nonAudio.mute[row.channel]);
    mute.addEventListener("click", () => {
      const m = !nonAudio.mute[row.channel];
      nonAudio.mute[row.channel] = m;
      writeNonAudio({ mute: { ...nonAudio.mute } });
      setMuteSymbol(m);
      // Mute = effektive Lautstaerke 0 ohne Slider-Wert zu verlieren.
      if (m) AudioBus.set(row.channel, 0);
      else AudioBus.set(row.channel, Number(input.value) / 100);
    });

    const input = document.createElement("input");
    input.type = "range";
    input.min = "0";
    input.max = "100";
    input.step = "1";
    input.dataset.channel = row.channel;
    input.value = String(Math.round(AudioBus[row.channel] * 100));
    input.setAttribute("aria-label", row.label);

    const val = document.createElement("div");
    val.className = "options-row-value";
    val.textContent = `${input.value}`;

    input.addEventListener("input", () => {
      const pct = Number(input.value);
      val.textContent = `${pct}`;
      // Sobald geschoben wird: Mute aufheben.
      if (nonAudio.mute[row.channel]) {
        nonAudio.mute[row.channel] = false;
        writeNonAudio({ mute: { ...nonAudio.mute } });
        setMuteSymbol(false);
      }
      AudioBus.set(row.channel, pct / 100);
    });

    r.appendChild(lbl);
    r.appendChild(mute);
    r.appendChild(input);
    r.appendChild(val);
    panel.appendChild(r);
  }
}

function renderSpiel(panel: HTMLElement, nonAudio: NonAudioOptions): void {
  const fsRow = document.createElement("div");
  fsRow.className = "options-row";
  fsRow.style.gridTemplateColumns = "140px 1fr";
  const fsLbl = document.createElement("div");
  fsLbl.className = "options-row-label";
  fsLbl.textContent = "Vollbild";
  const fsBtn = document.createElement("button");
  fsBtn.type = "button";
  fsBtn.className = "options-toggle";
  fsBtn.dataset.option = "fullscreen";
  const setFsLabel = (on: boolean): void => {
    fsBtn.textContent = on ? "An" : "Aus";
    fsBtn.setAttribute("aria-pressed", String(on));
  };
  setFsLabel(nonAudio.fullscreen);
  fsBtn.addEventListener("click", () => {
    const want = !(fsBtn.getAttribute("aria-pressed") === "true");
    setFsLabel(want);
    nonAudio.fullscreen = want;
    writeNonAudio({ fullscreen: want });
    applyFullscreen(want);
  });
  fsRow.appendChild(fsLbl);
  fsRow.appendChild(fsBtn);
  panel.appendChild(fsRow);

  const stub = document.createElement("div");
  stub.className = "options-stub";
  stub.textContent = "Weitere Spielregeln (Spielgeschwindigkeit, Auto-Save) folgen.";
  panel.appendChild(stub);
}

function renderSprache(panel: HTMLElement, nonAudio: NonAudioOptions): void {
  const row = document.createElement("div");
  row.className = "options-row";
  row.style.gridTemplateColumns = "140px 1fr";
  const lbl = document.createElement("div");
  lbl.className = "options-row-label";
  lbl.textContent = "Sprache";
  const choice = document.createElement("div");
  choice.className = "options-lang";
  choice.setAttribute("role", "radiogroup");
  choice.setAttribute("aria-label", "Sprache");
  const langs: Array<{ id: "de" | "en"; label: string; enabled: boolean }> = [
    { id: "de", label: "DE", enabled: true },
    { id: "en", label: "EN", enabled: false },
  ];
  for (const l of langs) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = l.label;
    b.dataset.lang = l.id;
    b.disabled = !l.enabled;
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(nonAudio.language === l.id));
    if (l.enabled) {
      b.addEventListener("click", () => {
        choice.querySelectorAll("button").forEach((x) =>
          x.setAttribute("aria-checked", String(x === b)),
        );
        nonAudio.language = l.id;
        writeNonAudio({ language: l.id });
      });
    }
    choice.appendChild(b);
  }
  row.appendChild(lbl);
  row.appendChild(choice);
  panel.appendChild(row);
}

function renderStub(panel: HTMLElement, tab: TabId): void {
  const map: Record<TabId, string> = {
    audio: "",
    bild: "Aufloesung, VSync, UI-Skalierung folgen in einem spaeteren Patch.",
    spiel: "",
    eingabe: "Tastenbelegung kommt mit der ersten Kampagnen-Mission.",
    sprache: "",
  };
  const stub = document.createElement("div");
  stub.className = "options-stub";
  stub.textContent = map[tab] || "Diese Sektion ist vorerst leer.";
  panel.appendChild(stub);
}

function applyFullscreen(on: boolean): void {
  try {
    if (on && !document.fullscreenElement) {
      void document.documentElement.requestFullscreen?.();
    } else if (!on && document.fullscreenElement) {
      void document.exitFullscreen?.();
    }
  } catch {
    /* still */
  }
}
