#!/usr/bin/env python3
# fog_depth_gate.py — render-basierte Lesbarkeits-Pruefung der Nebel-Tiefe gegen
# docs/NEBEL-TIEFE-SPEC.md §5. Vergleicht zwei Shots derselben Szene — MIT und OHNE
# Nebel — und prueft, dass Einheiten/Terrain unter dem Nebel erkennbar BLEIBEN
# (Leitplanke: Tiefe darf nicht in opakes Zukleistern kippen).
#
#   python3 tools/fog_depth_gate.py --without /tmp/fog/without.png --with /tmp/fog/with.png
#   python3 tools/fog_depth_gate.py --dir /tmp/fog        # liest without.png / with.png
#   python3 tools/fog_depth_gate.py --dir /tmp/fog --edge-min 0.60 --alpha-cap 0.55
#
# Drei Checks aus der Spec, alle aus dem PNG-Paar (kein Engine-Zugriff):
#   (a) Alpha-Deckel    p99 des Nebel-Alpha-Beitrags <= ALPHA_CAP (Default 0.55)
#   (b) Einheiten-Lesbk Sobel-Kantenenergie- UND RMS-Kontrast-Erhalt >= EDGE_MIN (0.60)
#   (c) Terrain-Lesbk   dito ueber die untere Bildhaelfte (Boden) >= TERR_MIN (0.55)
# Drift-Determinismus (d) und Pool-Leck (e) leben in editor_browser.mjs (brauchen
# Engine-APIs) — siehe NEBEL-TIEFE-SPEC.md §5.
#
# Fehlt ein PNG oder Pillow -> SKIP (Exit 0), blockiert keinen Gate-Lauf.
# Fail -> Exit 1, jede verletzte Zeile mit Spec-Verweis.

import os
import sys


def _arg(name, default=None):
    for i, a in enumerate(sys.argv[1:]):
        if a == f"--{name}":
            return sys.argv[i + 2] if i + 2 < len(sys.argv) else default
        if a.startswith(f"--{name}="):
            return a.split("=", 1)[1]
    return default


DIR = _arg("dir", os.environ.get("SHOT_DIR", "/tmp/fog"))
P_WITHOUT = _arg("without", os.path.join(DIR, "without.png"))
P_WITH = _arg("with", os.path.join(DIR, "with.png"))
EDGE_MIN = float(_arg("edge-min", "0.60"))      # Einheiten (b)
CONTR_MIN = float(_arg("contrast-min", "0.60"))
TERR_EDGE_MIN = float(_arg("terrain-edge-min", "0.55"))   # Terrain (c)
TERR_CONTR_MIN = float(_arg("terrain-contrast-min", "0.55"))
ALPHA_CAP = float(_arg("alpha-cap", "0.55"))    # (a) Betaeubungs-Deckel
# Tint-Luma des Nebels (0x9fb6c8 -> 0.299*159+0.587*182+0.114*200 ~= 177), Spec-konsistent
FOG_LUMA = float(_arg("fog-luma", "177"))

errors = []
notes = []


def fail(where, msg):
    errors.append(f"{where} :: {msg}")


def luma_grid(im):
    """Graustufen-2D-Liste (Rec.601) eines RGB-Bildes."""
    w, h = im.size
    px = im.load()
    g = [[0.0] * w for _ in range(h)]
    for y in range(h):
        row = g[y]
        for x in range(w):
            r, gr, b = px[x, y][:3]
            row[x] = 0.299 * r + 0.587 * gr + 0.114 * b
    return g, w, h


def sobel_energy(g, w, h, y0, y1):
    """Summe der Sobel-Gradientenbetraege ueber Zeilen [y0,y1)."""
    e = 0.0
    for y in range(max(1, y0), min(h - 1, y1)):
        gm1, g0, gp1 = g[y - 1], g[y], g[y + 1]
        for x in range(1, w - 1):
            gx = (gm1[x + 1] + 2 * g0[x + 1] + gp1[x + 1]) - (gm1[x - 1] + 2 * g0[x - 1] + gp1[x - 1])
            gy = (gp1[x - 1] + 2 * gp1[x] + gp1[x + 1]) - (gm1[x - 1] + 2 * gm1[x] + gm1[x + 1])
            e += (gx * gx + gy * gy) ** 0.5
    return e


def rms_std(g, w, h, y0, y1):
    """RMS-Kontrast = Standardabweichung der Luma ueber Zeilen [y0,y1)."""
    vals = []
    for y in range(max(0, y0), min(h, y1)):
        vals.extend(g[y])
    if not vals:
        return 0.0
    m = sum(vals) / len(vals)
    return (sum((v - m) ** 2 for v in vals) / len(vals)) ** 0.5


def alpha_p99(gc, gf, w, h):
    """p99 des rekonstruierten Nebel-Alpha-Beitrags (wie editor_browser.mjs fogalpha)."""
    a = []
    for y in range(h):
        rc, rf = gc[y], gf[y]
        for x in range(w):
            bl, wl = rc[x], rf[x]
            if FOG_LUMA - bl > 25:           # Hintergrund deutlich dunkler als Nebelton
                val = (wl - bl) / (FOG_LUMA - bl)
                if 0.0 <= val <= 1.0:
                    a.append(val)
    if len(a) <= 100:
        return None, len(a)
    a.sort()
    return a[int(0.99 * (len(a) - 1))], len(a)


def main():
    if not (os.path.exists(P_WITHOUT) and os.path.exists(P_WITH)):
        notes.append(f"Shots fehlen (without={P_WITHOUT}, with={P_WITH}) — `editor_browser.mjs fogdepth` erst rendern")
        print("== Fog-Depth-Gate ==\n  SKIP — kein PNG-Paar; kein Urteil.")
        for n in notes:
            print(f"  ~ {n}")
        return 0
    try:
        from PIL import Image
    except Exception:  # noqa: BLE001
        print("== Fog-Depth-Gate ==\n  SKIP — Pillow fehlt (pip install pillow).")
        return 0

    imc = Image.open(P_WITHOUT).convert("RGB")
    imf = Image.open(P_WITH).convert("RGB")
    if imc.size != imf.size:
        # auf gemeinsame Groesse bringen (SwiftShader/Viewport-Toleranz)
        imf = imf.resize(imc.size)
    gc, w, h = luma_grid(imc)
    gf, _, _ = luma_grid(imf)
    mid = h // 2

    # (a) Alpha-Deckel
    p99, n = alpha_p99(gc, gf, w, h)
    if p99 is None:
        notes.append(f"Alpha-Deckel: nur {n} Stichproben (<=100) — Szene zu hell/Nebel zu schwach?")
    elif p99 > ALPHA_CAP:
        fail("NEBEL-TIEFE-SPEC §5(a) Alpha-Deckel",
             f"p99 Nebel-Alpha={p99:.3f} > {ALPHA_CAP} (Betaeubungs-Deckel) — Tiefe kippt in Deckkraft")
    else:
        notes.append(f"Alpha-Deckel p99={p99:.3f} <= {ALPHA_CAP} (n={n})")

    # (b) Einheiten-Lesbarkeit (obere Bildhaelfte = wo Einheiten-Silhouetten stehen)
    ec_u = sobel_energy(gc, w, h, 0, mid)
    ef_u = sobel_energy(gf, w, h, 0, mid)
    eEdge = (ef_u / ec_u) if ec_u > 0 else 1.0
    sc_u = rms_std(gc, w, h, 0, mid)
    sf_u = rms_std(gf, w, h, 0, mid)
    cStd = (sf_u / sc_u) if sc_u > 0 else 1.0
    if eEdge < EDGE_MIN:
        fail("NEBEL-TIEFE-SPEC §5(b) Einheiten-Lesbarkeit",
             f"Sobel-Kanten-Erhalt {eEdge:.2f} < {EDGE_MIN} — Silhouetten erstickt")
    if cStd < CONTR_MIN:
        fail("NEBEL-TIEFE-SPEC §5(b) Einheiten-Lesbarkeit",
             f"RMS-Kontrast-Erhalt {cStd:.2f} < {CONTR_MIN} — Wertabstand flachgedrueckt")

    # (c) Terrain-Lesbarkeit (untere Bildhaelfte = Boden)
    ec_t = sobel_energy(gc, w, h, mid, h)
    ef_t = sobel_energy(gf, w, h, mid, h)
    tEdge = (ef_t / ec_t) if ec_t > 0 else 1.0
    sc_t = rms_std(gc, w, h, mid, h)
    sf_t = rms_std(gf, w, h, mid, h)
    tStd = (sf_t / sc_t) if sc_t > 0 else 1.0
    if tEdge < TERR_EDGE_MIN:
        fail("NEBEL-TIEFE-SPEC §5(c) Terrain-Lesbarkeit",
             f"Sobel-Kanten-Erhalt {tEdge:.2f} < {TERR_EDGE_MIN}")
    if tStd < TERR_CONTR_MIN:
        fail("NEBEL-TIEFE-SPEC §5(c) Terrain-Lesbarkeit",
             f"RMS-Kontrast-Erhalt {tStd:.2f} < {TERR_CONTR_MIN}")

    print(f"== Fog-Depth-Gate (edge>={EDGE_MIN} contrast>={CONTR_MIN} alpha<={ALPHA_CAP}) ==")
    if errors:
        print(f"  ROT — {len(errors)} Verstoss(e):")
        for e in errors:
            print(f"    - {e}")
        for n in notes:
            print(f"    ~ {n}")
        return 1
    print(f"  GRUEN — Einheiten eEdge={eEdge:.2f}/cStd={cStd:.2f}, "
          f"Terrain {tEdge:.2f}/{tStd:.2f} bleiben lesbar; Deckel gehalten.")
    for n in notes:
        print(f"  ~ {n}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
