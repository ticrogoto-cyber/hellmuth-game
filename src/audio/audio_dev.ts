// Audio-Mess-Bruecke. Ton wird nicht per Headless-Screenshot abgenommen, sondern
// GEHOERT auf echter Hardware (Chrome + iOS-Safari). Diese Bruecke macht die
// Verdrahtung ausuebbar: ein Overlay listet die Sets; Taste/Klick spielt; ein
// Live-Zaehler zeigt die aktiven Voices je Kategorie samt Cap; ein Stress-Test
// belegt die Voice-Limiting-Abnahme (50/150/300 gleichzeitig -> reale Voices
// <=48). Im Dev-Modus sind fehlende Dateien hoerbar (Synthton).
//
// Aktivierung ueber den Aufrufer (main.ts: ?audio-debug=1). Reines Werkzeug.

import type Phaser from "phaser";
import type { AudioManager } from "./audio_manager";
import type { AudioHookController } from "./install_audio";
import type { Sprache } from "./audio_manifest";
import { DEFAULT_CONFIG, KATEGORIEN } from "./voice_limiter";

const ZIFFERN = "123456789";
const STRESS_STUFEN = [50, 150, 300];
const STRESS_EVENTS = ["fx.unit_hit", "fx.unit_died", "fx.building_died"];

export function mountAudioDev(audio: AudioManager, game?: Phaser.Game): void {
  audio.setStubAudible(true); // fehlende Dateien hoerbar machen

  const wrap = document.createElement("div");
  wrap.id = "audio-dev";
  wrap.style.cssText = [
    "position:fixed",
    "right:8px",
    "bottom:8px",
    "z-index:99999",
    "font:11px/1.4 ui-monospace,Menlo,Consolas,monospace",
    "color:#e8f0e0",
    "background:rgba(10,12,14,0.86)",
    "border:1px solid #2c3a2c",
    "border-radius:6px",
    "padding:8px 10px",
    "max-width:340px",
    "pointer-events:auto",
    "user-select:none",
  ].join(";");

  const kopf = document.createElement("div");
  kopf.style.cssText = "font-weight:bold;margin-bottom:4px;letter-spacing:.04em";
  const voices = document.createElement("div");
  voices.style.cssText = "margin-bottom:6px;opacity:.9";
  const liste = document.createElement("div");
  const fuss = document.createElement("div");
  fuss.style.cssText = "margin-top:6px;opacity:.7";
  fuss.textContent = "Taste/Klick spielt · L Sprache · M stumm · [ ] Master · H Live-Hook · S Stress";
  wrap.append(kopf, voices, liste, fuss);

  const sets = audio.setKeys();
  let stressIdx = 0;

  const hook = (): AudioHookController | undefined =>
    game?.registry.get("audioHook") as AudioHookController | undefined;

  const zeichne = (): void => {
    const h = hook();
    const hookText = h ? (h.isEnabled() ? "AN" : "aus") : "n/v";
    kopf.textContent =
      `AUDIO [${audio.backendName}] ${audio.getSprache()} ` +
      `Master:${Math.round(audio.getBusLautstaerke("master") * 100)}%` +
      `${audio.isMuted() ? " STUMM" : ""} Hook:${hookText}`;
    const s = audio.voiceStats();
    const teile = KATEGORIEN.map((k) => `${k.replace(/_/g, " ")}:${s.perKat[k] ?? 0}/${DEFAULT_CONFIG.caps[k]}`);
    voices.textContent = `Voices ${s.total}/${DEFAULT_CONFIG.global} — ` + teile.join("  ");
    liste.innerHTML = "";
    sets.forEach((k, i) => {
      const row = document.createElement("div");
      row.style.cssText = "cursor:pointer;padding:1px 0";
      row.textContent = `[${i < ZIFFERN.length ? ZIFFERN[i] : "·"}] ${k}`;
      row.onclick = () => {
        audio.resume();
        audio.playSet(k, { x: 0, y: 0 });
      };
      liste.appendChild(row);
    });
  };

  const naechsteSprache = (): void => {
    const langs = audio.verfuegbareSprachen();
    if (langs.length === 0) return;
    const next: Sprache = langs[(langs.indexOf(audio.getSprache()) + 1) % langs.length];
    audio.setSprache(next);
    zeichne();
  };

  const aendereMaster = (d: number): void => {
    audio.setBusLautstaerke("master", clamp01(audio.getBusLautstaerke("master") + d));
    zeichne();
  };

  const stress = (): void => {
    audio.resume();
    const n = STRESS_STUFEN[stressIdx % STRESS_STUFEN.length];
    stressIdx++;
    // Eindeutige Fraktion je Aufruf -> Dedup greift NICHT, damit die Caps (nicht
    // der Dedup) die Obergrenze stellen: belegt die Voice-Limiting-Abnahme.
    for (let i = 0; i < n; i++) {
      audio.play(STRESS_EVENTS[i % STRESS_EVENTS.length], {
        x: (Math.random() - 0.5) * 2000,
        y: (Math.random() - 0.5) * 2000,
        faction: "f" + i,
      });
    }
    console.info(`[AUDIO] Stress ${n} -> aktive Voices ${audio.voiceStats().total} (Cap ${DEFAULT_CONFIG.global}).`);
    zeichne();
  };

  const onKey = (e: KeyboardEvent): void => {
    audio.resume();
    const idx = ZIFFERN.indexOf(e.key);
    if (idx >= 0 && idx < sets.length) {
      audio.playSet(sets[idx], { x: 0, y: 0 });
      return;
    }
    switch (e.key.toLowerCase()) {
      case "l":
        naechsteSprache();
        break;
      case "m":
        audio.setMuted(!audio.isMuted());
        zeichne();
        break;
      case "[":
        aendereMaster(-0.1);
        break;
      case "]":
        aendereMaster(0.1);
        break;
      case "s":
        stress();
        break;
      case "h": {
        const h = hook();
        if (h) {
          h.setEnabled(!h.isEnabled());
          zeichne();
        }
        break;
      }
      default:
        break;
    }
  };

  window.addEventListener("keydown", onKey);
  document.body.appendChild(wrap);
  window.setInterval(zeichne, 250); // Live-Zaehler aktualisieren
  zeichne();
  console.info("[AUDIO] Dev-Mess-Bruecke aktiv (?audio-debug=1).");
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
