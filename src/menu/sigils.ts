// Sigil-Glyphen fuer beide Fraktionen. Stark stilisiert, monochrom (currentColor),
// nutzbar als Glyph (Wortmarke) und Hero (gross + gedaempft).
// Anzeige-Namen: HELLMUTH (= Brennnesselblatt mit zwei Fluegeln) und MODERAT
// (= grinsende bestachelte Totenkopf-Sonne). Die Funktionsnamen tragen weiter
// den internen FactionId-Schluessel (hellmuth/moderat, loader.ts).

type SigilSize = "glyph" | "hero";

const NS = "http://www.w3.org/2000/svg";

export function buildHellmuthSigil(size: SigilSize = "glyph"): SVGSVGElement {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 200 200");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", size === "hero" ? "1.4" : "2");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const wL = document.createElementNS(NS, "path");
  wL.setAttribute("d", "M62 92 Q40 78 36 60 Q56 70 72 86 Z");
  const wR = document.createElementNS(NS, "path");
  wR.setAttribute("d", "M138 92 Q160 78 164 60 Q144 70 128 86 Z");
  const leaf = document.createElementNS(NS, "path");
  leaf.setAttribute(
    "d",
    "M100 38 Q70 50 60 90 L66 96 L60 102 L70 108 L62 114 L72 120 L66 126 L78 132 L72 140 Q84 156 100 168 Q116 156 128 140 L122 132 L134 126 L128 120 L138 114 L130 108 L140 102 L134 96 L140 90 Q130 50 100 38 Z",
  );
  const vein = document.createElementNS(NS, "path");
  vein.setAttribute("d", "M100 50 L100 162");
  vein.setAttribute("stroke-width", size === "hero" ? "0.9" : "1.2");
  vein.setAttribute("opacity", "0.7");
  svg.appendChild(wL);
  svg.appendChild(wR);
  svg.appendChild(leaf);
  svg.appendChild(vein);
  return svg;
}

export function buildModeratSigil(size: SigilSize = "glyph"): SVGSVGElement {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 200 200");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", size === "hero" ? "1.4" : "2");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  // Sonnenstrahlen / Stacheln: zwoelf Spitzen
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI * 2) / 12 - Math.PI / 2;
    const r1 = 60;
    const r2 = 88;
    const x1 = 100 + Math.cos(a) * r1;
    const y1 = 100 + Math.sin(a) * r1;
    const x2 = 100 + Math.cos(a) * r2;
    const y2 = 100 + Math.sin(a) * r2;
    const ray = document.createElementNS(NS, "line");
    ray.setAttribute("x1", x1.toFixed(1));
    ray.setAttribute("y1", y1.toFixed(1));
    ray.setAttribute("x2", x2.toFixed(1));
    ray.setAttribute("y2", y2.toFixed(1));
    svg.appendChild(ray);
  }
  // Schaedel-Kreis
  const skull = document.createElementNS(NS, "circle");
  skull.setAttribute("cx", "100");
  skull.setAttribute("cy", "94");
  skull.setAttribute("r", "44");
  svg.appendChild(skull);
  // Augenhoehlen
  const eL = document.createElementNS(NS, "circle");
  eL.setAttribute("cx", "84");
  eL.setAttribute("cy", "90");
  eL.setAttribute("r", "9");
  eL.setAttribute("fill", "currentColor");
  const eR = document.createElementNS(NS, "circle");
  eR.setAttribute("cx", "116");
  eR.setAttribute("cy", "90");
  eR.setAttribute("r", "9");
  eR.setAttribute("fill", "currentColor");
  svg.appendChild(eL);
  svg.appendChild(eR);
  // Nase (Dreieck)
  const nose = document.createElementNS(NS, "path");
  nose.setAttribute("d", "M100 100 L94 114 L106 114 Z");
  nose.setAttribute("fill", "currentColor");
  svg.appendChild(nose);
  // Grinsen: Zaehne als kleine Linien
  for (let i = -2; i <= 2; i++) {
    const x = 100 + i * 6;
    const t = document.createElementNS(NS, "line");
    t.setAttribute("x1", String(x));
    t.setAttribute("y1", "124");
    t.setAttribute("x2", String(x));
    t.setAttribute("y2", "134");
    svg.appendChild(t);
  }
  // Grins-Linie
  const grin = document.createElementNS(NS, "path");
  grin.setAttribute("d", "M82 124 L118 124 M82 134 L118 134");
  svg.appendChild(grin);
  return svg;
}

export function buildSigilFor(faction: "hellmuth" | "moderat", size: SigilSize = "glyph"): SVGSVGElement {
  return faction === "moderat" ? buildModeratSigil(size) : buildHellmuthSigil(size);
}
