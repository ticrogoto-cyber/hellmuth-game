import type { FactionId } from "../data/loader";

// Spec-Overlay (?speclines=1). Zeichnet JEDES Rechteck aus docs/hud-spec.md als
// farbige Konturlinie ueber das laufende HUD. Die einzige Abnahmeregel: eine
// Panel-Kante, die nicht in ihrer Kontur liegt, ist ein Bug. Reines Mess-Werk,
// keine Spiel-Logik, pointer-events: none. Alle Werte sind die InDesign-px auf
// 1920x1080; Umrechnung vw=px/19.2, vh=px/10.8 (identisch zur hud.css).

interface SBox { x: number; y: number; w: number; h: number; c: string; t?: string }

const COL = {
  panel: "#00e5ff",   // Panels (Bildschirm-absolut)
  inner: "#ffe000",   // Einheitenkarte-Innenzonen
  grid: "#ff4dd2",    // Befehlsraster-Zellen
  res: "#66ff66",     // Ressourcen-Innenzonen
  bar: "#a6ff00",     // Leisten-Silhouette (Sockel/Stufen)
  multi: "#ff9500",   // Mehrfachauswahl-Portraets
};

function panels(): SBox[] {
  return [
    { x: 0, y: 0, w: 279, h: 96, c: COL.panel, t: "Emblem 279x96" },
    { x: 1781, y: 0, w: 139, h: 48, c: COL.panel, t: "Menu 139x48" },
    { x: 16, y: 779, w: 286, h: 286, c: COL.panel, t: "Minimap 286x286 @16,779" },
    { x: 521, y: 824, w: 878, h: 241, c: COL.panel, t: "Einheitenkarte 878x241 @521,824" },
    { x: 1616, y: 837, w: 173, h: 216, c: COL.panel, t: "Ressourcen 173x216 @1616,837" },
  ];
}

function emblemInner(): SBox[] {
  return [
    { x: 21, y: 15, w: 65, h: 65, c: COL.inner, t: "Icon 65x65 @21,15" },
    { x: 99, y: 19, w: 2, h: 60, c: COL.inner, t: "Titel x=99,y=19" },
  ];
}

function unitcardInner(): SBox[] {
  const b: SBox[] = [
    { x: 534, y: 837, w: 154, h: 216, c: COL.inner, t: "Portraet 154x216" },
    { x: 712, y: 836, w: 232, h: 29, c: COL.inner, t: "Name 232x29" },
    { x: 712, y: 869, w: 171, h: 21, c: COL.inner, t: "Untertitel 171x21" },
    { x: 884, y: 918, w: 155, h: 22, c: COL.inner, t: "Effekte-Kopf 155x22" },
    { x: 884, y: 946, w: 36, h: 36, c: COL.inner, t: "Eff-Icon" },
    { x: 884, y: 988, w: 36, h: 36, c: COL.inner, t: "Eff-Icon" },
    { x: 745, y: 918, w: 2, h: 118, c: COL.inner, t: "Stat-Wert x=745" },
    { x: 929, y: 946, w: 2, h: 78, c: COL.inner, t: "Eff-Zeile x=929" },
  ];
  for (const y of [918, 950, 982, 1014]) b.push({ x: 712, y, w: 21, h: 21, c: COL.inner, t: "Stat-Icon" });
  return b;
}

function commandGrid(): SBox[] {
  const b: SBox[] = [];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 4; c++)
      b.push({ x: 1094 + c * 75.6, y: 837 + r * 75.5, w: 65, h: 65, c: COL.grid, t: r === 0 && c === 0 ? "Raster 4x3 65x65 @1094,837" : "" });
  return b;
}

function multiSelect(): SBox[] {
  const b: SBox[] = [];
  for (let i = 0; i < 4; i++) {
    const x = 534 + i * 134.3;
    b.push({ x, y: 837, w: 121, h: 169, c: COL.multi, t: i === 0 ? "Multi-Portraet 121x169 Raster134.3" : "" });
    b.push({ x, y: 1014, w: 60, h: 21, c: COL.multi, t: "" });
  }
  return b;
}

function resourcesInner(): SBox[] {
  const b: SBox[] = [{ x: 1682, y: 852, w: 2, h: 186, c: COL.res, t: "Wert x=1682" }];
  for (let i = 0; i < 4; i++) b.push({ x: 1630, y: 852 + i * 49.5, w: 38, h: 38, c: COL.res, t: i === 0 ? "Res-Icon 38 @1630 R49.5" : "" });
  return b;
}

function barSilhouette(): SBox[] {
  return [
    { x: 0, y: 988, w: 1920, h: 92, c: COL.bar, t: "Sockel volle Breite ab y=988" },
    { x: 16, y: 764, w: 286, h: 224, c: COL.bar, t: "Stufe Minimap-Block y=764" },
    { x: 521, y: 809, w: 878, h: 179, c: COL.bar, t: "Stufe Einheitenkarte y=809" },
    { x: 1616, y: 809, w: 173, h: 179, c: COL.bar, t: "Stufe Ressourcen y=809" },
  ];
}

export function mountSpecOverlay(_faction: FactionId, parent: HTMLElement = document.body): void {
  if (new URLSearchParams(location.search).get("speclines") !== "1") return;

  const root = document.createElement("div");
  root.id = "spec-overlay";
  Object.assign(root.style, {
    position: "absolute", inset: "0", zIndex: "9999", pointerEvents: "none",
    font: "10px/1 monospace",
  } as CSSStyleDeclaration);

  const all = [
    ...barSilhouette(), ...panels(), ...unitcardInner(), ...emblemInner(),
    ...commandGrid(), ...multiSelect(), ...resourcesInner(),
  ];

  for (const s of all) {
    const d = document.createElement("div");
    const dashed = s.c === COL.bar;
    Object.assign(d.style, {
      position: "absolute",
      left: `${s.x / 19.2}vw`, top: `${s.y / 10.8}vh`,
      width: `${s.w / 19.2}vw`, height: `${s.h / 10.8}vh`,
      boxSizing: "border-box",
      border: `1px ${dashed ? "dashed" : "solid"} ${s.c}`,
      boxShadow: `0 0 0 0.5px rgba(0,0,0,0.6)`,
    } as CSSStyleDeclaration);
    if (s.t) {
      const lab = document.createElement("span");
      lab.textContent = s.t;
      Object.assign(lab.style, {
        position: "absolute", left: "0", top: "-11px", whiteSpace: "nowrap",
        color: s.c, textShadow: "0 0 2px #000, 0 0 2px #000",
      } as CSSStyleDeclaration);
      d.appendChild(lab);
    }
    root.appendChild(d);
  }

  // Legende oben mittig.
  const legend = document.createElement("div");
  legend.innerHTML =
    `<b style="color:${COL.bar}">Leiste</b> &nbsp; <b style="color:${COL.panel}">Panels</b> &nbsp; ` +
    `<b style="color:${COL.inner}">Einheitenkarte</b> &nbsp; <b style="color:${COL.grid}">Raster</b> &nbsp; ` +
    `<b style="color:${COL.res}">Ressourcen</b> &nbsp; <b style="color:${COL.multi}">Multi</b> &nbsp; speclines=1`;
  Object.assign(legend.style, {
    position: "absolute", left: "50%", top: "50vh", transform: "translateX(-50%)",
    padding: "4px 8px", background: "rgba(0,0,0,0.7)", color: "#fff", borderRadius: "3px",
  } as CSSStyleDeclaration);
  root.appendChild(legend);

  parent.appendChild(root);
}
