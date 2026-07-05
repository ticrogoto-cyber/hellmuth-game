#!/usr/bin/env python3
# hud_continuity.py — DAS SEHENDE GATE (Werkstueck 1).
#
# Zwei maschinelle Detektoren, die der alte HUD-Soll-Gate NICHT hatte und durch
# deren Fehlen zweimal ein zerhacktes HUD gruen durchrutschte (HUD-KRISENSTAB.md
# §3 Mechanismus D: "kein Sinnesorgan fuer Motiv-Durchgaengigkeit oder
# Eckverschmelzung"). Beide laufen auf VOLLAUFLOESUNG im Leisten-Band, nicht auf
# dem 96x54-Downscale der Drift-Strecke (dort ist eine Leiste 3px hoch, da
# verschwindet jede Zerhackung).
#
# 1) Durchgaengigkeit (§11): Selbst-NCC ueber die Harmonik-Reihe (1x/2x/3x). Rohe
#    Autokorrelation ist nutzlos — das Korn dominiert (Krisenstab). Plus ein
#    Kanten-Kamm-Backstop (signiertes Spaltengefaelle ueber Zeilen gemittelt, das
#    Korn hebt sich auf, regelmaessige Nahtfugen bleiben stehen).
# 2) Eckverschmelzung (§12): Gradientenrichtungs-Fraktion (beleuchtungsinvariant)
#    UND anti-diagonale Transponierungs-Korrelation. Der naive corr(patch,patch.T)
#    ist eine Falle (Stumpf UND Gehrung geben +1.0 auf der Hauptdiagonale).
#
# Schwellen an den ECHTEN kaputten Renders gesetzt (proof/baseline/*_default.png,
# 1920x1080) und am synthetisch-perfekten Tile gegengeprueft (self-NCC 0.97):
#   gesund (nahtlos):  self-NCC 0.97/0.97/0.97   comb ~1.3
#   MODERAT gestreckt: self-NCC 0.55/0.36/0.08   comb ~3.4   -> FAIL (Harmonik weg)
#   HELLMUTH zerhackt: self-NCC 0.18/0.08/-0.01  comb ~4.8   -> FAIL (kein Alignment)
#   alle Panel-Ecken:  gfrac<=0.48, anti<=0.34               -> FAIL (Stumpfstoss)
#
# CLI (Eich-/Pruefwerkzeug, Exit 1 bei FAIL):
#   python3 tools/hud_continuity.py <render.png> --scale 1 [--dom dom_hellmuth.json] [--fac hellmuth]
#
# Eingehaengt in hud_soll_gate.py:check_continuity. Braucht numpy+Pillow; fehlt
# eins -> der Aufrufer meldet das als eigenen Punkt (kein stilles Gruen).

import sys
import json

# ---- Schwellen (an echten Renders geeicht, HUD-KRISENSTAB §11/§12) -------------
NCC_MIN12 = 0.55     # min(1x,2x) muss >= sein
NCC_MIN3 = 0.45      # 3x muss >= sein
COMB_MAX = 3.0       # Kanten-Kamm-Konzentration darueber = zerhackt
MITER_GFRAC = 0.55   # Ecke gilt nur als verschmolzen, wenn gfrac >= ...
MITER_ANTI = 0.80    # ... UND anti-diagonal-Korrelation >= ...
CORNER_STD_SKIP = 5.0  # flache (leere) Eck-Flaeche -> nicht messbar, SKIP
MIN_CORNER_PX = 10     # 15*s darunter -> zu starker Downscale, SKIP


def load_gray(path):
    from PIL import Image
    import numpy as np
    a = np.asarray(Image.open(path).convert("RGB"), dtype=np.float64)
    return 0.2126 * a[:, :, 0] + 0.7152 * a[:, :, 1] + 0.0722 * a[:, :, 2]


def _pearson(a, b):
    import numpy as np
    a = a.ravel(); b = b.ravel()
    a = a - a.mean(); b = b - b.mean()
    da = np.sqrt((a * a).sum()); db = np.sqrt((b * b).sum())
    if da < 1e-9 or db < 1e-9:
        return 0.0
    return float((a * b).sum() / (da * db))


def continuity(gray, s=1.0):
    """Selbst-NCC ueber die Harmonik-Reihe im Leisten-Band + Kanten-Kamm-Backstop."""
    import numpy as np
    H, W = gray.shape
    y0 = max(0, H - round(82 * s)); y1 = H - round(18 * s)
    band = gray[y0:y1, :]
    bh, bw = band.shape
    win = 320
    pmax = round(85 * s); pmin = round(57 * s)
    hi = bw - win - 3 * pmax
    if hi < 1:
        win = max(64, bw - 3 * pmax - 8); hi = bw - win - 3 * pmax
    # dichtestes Fenster (Spalten-Aktivitaet = Varianz ueber Zeilen)
    colE = band.var(axis=0)
    cum = np.concatenate([[0.0], np.cumsum(colE)])
    x0, best_e = 0, -1.0
    for x in range(0, max(1, hi)):
        e = cum[x + win] - cum[x]
        if e > best_e:
            best_e, x0 = e, x
    ref = band[:, x0:x0 + win]
    best = (pmin, [0.0, 0.0, 0.0])
    for P in range(pmin, pmax + 1):
        triple = [_pearson(ref, band[:, x0 + k * P:x0 + k * P + win]) for k in (1, 2, 3)]
        if min(triple[0], triple[1]) > min(best[1][0], best[1][1]):
            best = (P, triple)
    P, triple = best
    # Kanten-Kamm: signiertes Spaltengefaelle, ueber Zeilen gemittelt (Korn hebt
    # sich auf), Konzentration = std/mean(|.|). Regelmaessige Nahtfugen -> hoch.
    grad = band[:, 1:] - band[:, :-1]
    comb_sig = grad.mean(axis=0)
    comb = float(comb_sig.std() / (np.abs(comb_sig).mean() + 1e-9))
    ncc_ok = (min(triple[0], triple[1]) >= NCC_MIN12) and (triple[2] >= NCC_MIN3)
    passed = bool(ncc_ok and comb <= COMB_MAX)
    return {
        "passed": passed, "bestP": P, "ncc": [round(v, 3) for v in triple],
        "comb": round(comb, 2), "band": [y0, y1], "x0": x0,
        "ncc_ok": bool(ncc_ok), "comb_ok": bool(comb <= COMB_MAX),
    }


def _sobel(patch):
    import numpy as np
    from numpy.lib.stride_tricks import sliding_window_view
    if patch.shape[0] < 3 or patch.shape[1] < 3:
        return None
    kx = np.array([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], float)
    w = sliding_window_view(patch, (3, 3))
    gx = (w * kx).sum(axis=(2, 3))
    gy = (w * kx.T).sum(axis=(2, 3))
    return gx, gy


def _gfrac(patch):
    import numpy as np
    sb = _sobel(patch)
    if sb is None:
        return None
    gx, gy = sb
    mag = np.sqrt(gx * gx + gy * gy)
    deg = np.degrees(np.arctan2(gy, gx)) % 180.0
    diag = (np.abs(deg - 45) < 22.5) | (np.abs(deg - 135) < 22.5)
    axis = (deg < 22.5) | (deg > 157.5) | (np.abs(deg - 90) < 22.5)
    de = mag[diag].sum(); ae = mag[axis].sum()
    if de + ae < 1e-9:
        return None
    return float(de / (de + ae))


# Welche Panels tragen den fraktionsabhaengigen offenen 26px-Oberrand (Gate-J).
_OPEN_TOP = ("minimap", "unitcard", "resources")


def corners(gray, panels, fac, s=1.0):
    """Pro Panel-Ecke: gfrac (primaer) + anti-diagonale Korrelation. MITER nur bei
    gfrac>=0.55 UND anti>=0.80; sonst Stumpfstoss. Emblem-TL ausgenommen (dort sitzt
    das dekorative emb-corner ueber der Naht), flache/zu kleine Ecken -> SKIP."""
    t = round(15 * s)
    rows = []; butt = 0; measured = 0
    for name, r in panels.items():
        px, py, pw, ph = int(r["x"]), int(r["y"]), int(r["w"]), int(r["h"])
        ttop = round(26 * s) if (fac == "hellmuth" and name in _OPEN_TOP) else t
        cs = {"TL": (px - t, py - ttop), "TR": (px + pw, py - ttop),
              "BL": (px - t, py + ph), "BR": (px + pw, py + ph)}
        for cn, (cx, cy) in cs.items():
            if name == "emblem" and cn == "TL":
                continue
            if t < MIN_CORNER_PX:
                rows.append((name, cn, "SKIP<px", None, None)); continue
            if cx < 0 or cy < 0 or cy + t > gray.shape[0] or cx + t > gray.shape[1]:
                rows.append((name, cn, "OOB", None, None)); continue
            patch = gray[cy:cy + t, cx:cx + t]
            st = float(patch.std())
            if st < CORNER_STD_SKIP:
                rows.append((name, cn, "SKIPflat", round(st, 1), None)); continue
            gf = _gfrac(patch)
            an = _pearson(patch, patch.T[::-1, ::-1])
            miter = (gf is not None and gf >= MITER_GFRAC and an >= MITER_ANTI)
            measured += 1
            if not miter:
                butt += 1
            rows.append((name, cn, "MITER" if miter else "BUTT",
                         None if gf is None else round(gf, 3), round(an, 3)))
    return {"passed": bool(measured > 0 and butt == 0), "butt": butt,
            "measured": measured, "rows": rows}


def _main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("render")
    ap.add_argument("--scale", type=float, default=1.0)
    ap.add_argument("--dom", default=None, help="dom_<fac>.json fuer Panel-Rechtecke")
    ap.add_argument("--fac", default="hellmuth")
    a = ap.parse_args()
    g = load_gray(a.render)
    c = continuity(g, a.scale)
    print("DURCHGAENGIGKEIT  self-NCC 1x/2x/3x = %.2f/%.2f/%.2f  bestP=%d  comb=%.2f  -> %s"
          % (c["ncc"][0], c["ncc"][1], c["ncc"][2], c["bestP"], c["comb"],
             "PASS" if c["passed"] else "FAIL"))
    fails = 0 if c["passed"] else 1
    if a.dom:
        d = json.load(open(a.dom))
        s = (d.get("scale") or {}).get("px") or a.scale
        co = corners(g, d["panels"], a.fac, s)
        print("ECKVERSCHMELZUNG  %d/%d Ecken Stumpfstoss  -> %s"
              % (co["butt"], co["measured"], "PASS" if co["passed"] else "FAIL"))
        for nm, cn, verdict, gf, an in co["rows"]:
            print("    %-9s %-2s %-9s gfrac=%-6s anti=%-6s" % (nm, cn, verdict, gf, an))
        if not co["passed"]:
            fails = 1
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    _main()
