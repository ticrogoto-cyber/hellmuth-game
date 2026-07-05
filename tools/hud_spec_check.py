#!/usr/bin/env python3
"""
hud_spec_check.py — Selbstabnahme der HUD-Geometrie gegen docs/hud-spec.md.

Dauerregel: vor jedem HUD-Commit laufen lassen. Der Check parst die ECHTE
src/ui/hud.css, rechnet jede Panel- und Innenkante in Pixel (vw=px/19.2,
vh=px/10.8) und vergleicht sie mit den Spec-Rechtecken. Eine Kante, die nicht in
ihrer Kontur liegt (>1 px), ist ein Bug -> Exitcode 1. Kein Browser noetig; das
ist exakt die Mathematik, die der ?speclines=1-Overlay zeichnet.
"""

import re
import sys
import os

VW = 19.2  # px pro vw (1920/100)
VH = 10.8  # px pro vh (1080/100)
TOL = 1.0  # erlaubte Abweichung in px

CSS = os.path.join(os.path.dirname(__file__), "..", "src", "ui", "hud.css")


def parse_rules(text):
    """[(─[einzelselektoren], {prop: rawvalue})] in Dokumentreihenfolge."""
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    rules = []
    for m in re.finditer(r"([^{}]+)\{([^{}]*)\}", text):
        sels = [s.strip() for s in m.group(1).split(",") if s.strip()]
        decls = {}
        for d in m.group(2).split(";"):
            if ":" in d:
                k, v = d.split(":", 1)
                decls[k.strip()] = v.strip()
        rules.append((sels, decls))
    return rules


def last_token(sel):
    """Letztes (Schluessel-)Kompound eines Selektors: '#hud .a .b.c' -> '.b.c'."""
    return sel.split()[-1] if sel.split() else sel


def px(val):
    val = val.strip()
    if val == "0":
        return 0.0
    m = re.match(r"^(-?[\d.]+)(vw|vh)$", val)
    if not m:
        return None
    return float(m.group(1)) * (VW if m.group(2) == "vw" else VH)


def props_for(rules, queries):
    """Merge der Deklarationen aller Regeln, deren Schluessel-Kompound in queries
    liegt (Dokumentreihenfolge, spaeter ueberschreibt)."""
    out = {}
    for sels, decls in rules:
        if any(last_token(s) in queries for s in sels):
            for k in ("left", "right", "top", "bottom", "width", "height"):
                if k in decls and px(decls[k]) is not None:
                    out[k] = px(decls[k])
    return out


def rect(p, ox, oy):
    """Absolute (x,y,w,h) aus Props + Eltern-Ursprung. None fuer Fehlend."""
    left = p.get("left"); right = p.get("right")
    top = p.get("top"); bottom = p.get("bottom")
    w = p.get("width"); h = p.get("height")
    if w is None and left is not None and right is not None:
        w = 1920 - left - right
    if h is None and top is not None and bottom is not None:
        h = 1080 - top - bottom
    x = ox + left if left is not None else (1920 - right - w if right is not None and w is not None else None)
    y = oy + top if top is not None else (1080 - bottom - h if bottom is not None and h is not None else None)
    return x, y, w, h


# (Schluessel-Query-Liste, Eltern-Ursprung, Spec(x,y,w,h), nur-Position?)
# Masslage nach Neuvermessung der Vorlagen (docs/hud-spec.md, 12.06.).
U = (521, 824); E = (0, 0); R = (1616, 836); V = (0, 0)
CHECKS = [
    ([".p-emblem"], V, (0, 0, 279, 96), False),
    ([".p-menu"], V, (1781, 0, 139, 48), False),
    ([".p-minimap"], V, (16, 779, 286, 286), False),
    ([".p-unitcard"], V, (521, 824, 878, 241), False),
    ([".p-resources"], V, (1616, 836, 174, 216), False),
    ([".emb-mark"], E, (21, 15, 65, 65), False),
    ([".emb-name"], E, (99, 19, 159, 37), False),
    ([".emb-claim"], E, (99, 62, 159, 15), False),
    ([".menu-text"], (1781, 0), (1794, 11, 113, 27), False),
    ([".uc-portrait"], U, (534, 836, 154, 216), False),
    ([".uc-name"], U, (712, 836, 232, 29), False),
    ([".uc-sub"], U, (712, 869, 171, 21), False),
    ([".uc-eff-head"], U, (884, 918, 155, 22), False),
    ([".uc-cmd"], U, (1094, 836, 291.5, 216), False),
    ([".hud-sockel"], V, (0, 988, 1920, 92), False),
    ([".bar-riser", ".riser-minimap"], V, (1, 764, 316, 224), False),
    ([".bar-riser", ".riser-unitcard"], V, (506, 809, 908, 179), False),
    ([".bar-riser", ".riser-resources"], V, (1601, 809, 204, 179), False),
]
# Wiederholte Zonen (Basis-Query + Index-Query, gleiche Eltern).
for i, y in enumerate((918, 950, 982, 1014)):
    CHECKS.append(([".uc-stat-icon", f".uc-stat-icon.s{i}"], U, (712, y, 21, 21), False))
    CHECKS.append(([".uc-stat-val", f".uc-stat-val.s{i}"], U, (745, y, 83, 22), False))
for i, y in enumerate((946, 988)):
    CHECKS.append(([".uc-eff-icon", f".uc-eff-icon.f{i}"], U, (884, y, 36, 36), False))
for f, ys in ((0, (946, 967)), (1, (988, 1009))):
    for part, y in zip(("la", "lb"), ys):
        CHECKS.append(([".uc-eff-line", f".uc-eff-line.f{f}.{part}"], U, (929, y, 109, 15), False))
for i, x in enumerate((534, 668, 803, 937)):
    CHECKS.append(([".uc-mp", f".uc-mp.p{i}"], U, (x, 836, 121, 169), False))
    CHECKS.append(([".uc-ml", f".uc-ml.p{i}"], U, (x + 30, 1014, 60, 21), False))
for i, y in enumerate((851, 901, 950, 999)):
    CHECKS.append(([".res-icon", f".res-icon.q{i}"], R, (1630, y, 38, 38), False))
    CHECKS.append(([".res-val", f".res-val.q{i}"], R, (1682, y + 8, 95, 23), False))


def main():
    rules = parse_rules(open(CSS, encoding="utf-8").read())
    fails = 0
    print(f"{'ELEMENT':30} {'SOLL (x,y,w,h)':24} {'IST':24} STATUS")
    for queries, (ox, oy), spec, pos_only in CHECKS:
        p = props_for(rules, queries)
        x, y, w, h = rect(p, ox, oy)
        sx, sy, sw, sh = spec
        deltas = []
        def chk(actual, want, label):
            if want is None:
                return
            if actual is None:
                deltas.append(f"{label}:fehlt"); return
            if abs(actual - want) > TOL:
                deltas.append(f"{label}:{actual:.1f}!={want}")
        chk(x, sx, "x"); chk(y, sy, "y")
        if not pos_only:
            chk(w, sw, "w"); chk(h, sh, "h")
        ok = not deltas
        fails += 0 if ok else 1
        ist = f"{_f(x)},{_f(y)},{_f(w)},{_f(h)}"
        name = queries[-1]
        print(f"{name:30} {str(spec):24} {ist:24} {'OK' if ok else 'BUG ' + ' '.join(deltas)}")
    print()
    if fails:
        print(f"FAIL: {fails} Element(e) liegen nicht in ihrer Kontur.")
        sys.exit(1)
    print("PASS: alle Kanten in ihren Spec-Konturen.")


def _f(v):
    return "-" if v is None else f"{v:.0f}"


if __name__ == "__main__":
    main()
