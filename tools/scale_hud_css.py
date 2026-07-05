#!/usr/bin/env python3
"""
scale_hud_css.py — Einmal-Konverter (Paket C, Teil 1): jeden rohen vw/vh-Wert in
src/ui/hud.css auf `calc(<design-px> * var(--hud-scale))` heben. So skalieren beide
Achsen mit EINEM Faktor (min-Letterbox) -> bei 21:9/4:3/Hochformat divergieren vw
und vh nicht mehr. 1vw = 19.2 Design-px, 1vh = 10.8 Design-px (1920x1080-Raster).

Strukturregeln (Stage zentriert, Bar/Korn volle Breite) setzt der Mensch danach
von Hand; dieses Skript macht NUR die mechanische Einheiten-Umrechnung.
Lauf: python3 tools/scale_hud_css.py
"""
import os
import re

CSS = os.path.join(os.path.dirname(__file__), "..", "src/ui/hud.css")


def repl(m):
    num = float(m.group(1))
    val = num * (19.2 if m.group(2) == "w" else 10.8)
    val = round(val, 4)
    s = f"{val:.4f}".rstrip("0").rstrip(".")
    return f"calc({s} * var(--hud-scale))"


def main():
    with open(CSS, encoding="utf-8") as f:
        css = f.read()
    # nur <zahl>vw / <zahl>vh (eine Zahl davor); Prozente/0/100% bleiben unberuehrt
    out, n = re.subn(r"(\d+(?:\.\d+)?)v([wh])\b", repl, css)
    with open(CSS, "w", encoding="utf-8") as f:
        f.write(out)
    print(f"scale_hud_css: {n} vw/vh-Werte -> calc(px * --hud-scale)")


if __name__ == "__main__":
    main()
