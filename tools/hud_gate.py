#!/usr/bin/env python3
"""
hud_gate.py — Abnahme-Gate der HUD-Endmontage (Bildvergleich, verbindlich).

Vergleicht die Zonemap-Screenshots der laufenden App (?zonemap=1, beide
Fraktionen, beide Zustaende) Zone fuer Zone gegen die Vorlagen-Vermessung
(docs/hud-zonen-N.json): Klasse, Position, Groesse, Toleranz 2 Zielpixel.
Zusaetzlich: Ornament-Deckung (Vorlagen-Rotmaske muss rot gerendert sein) und
Texturvarianz der Ornamentflaechen im Realbild (Einheitsfarbe = Fehler).

Vorbereitung: node tools/hud_browser.mjs gateshots  (Screenshots in /tmp/gate)
Lauf:        python3 tools/hud_gate.py [--skip-variance]
Exit 0 nur bei leerem Report.
"""
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.join(os.path.dirname(__file__), "..")
GATE = os.environ.get("SHOT_DIR", "/tmp/gate")
TOL = 2.0
CLASSES = {
    "panel": (127, 127, 127),
    "ornament": (255, 127, 127),
    "bild": (191, 191, 63),
    "icon": (63, 191, 191),
    "text": (191, 191, 191),
    "feld": (255, 255, 255),
}


def classify(arr):
    refs = np.array(list(CLASSES.values()), dtype=np.float32)
    flat = arr.reshape(-1, 3).astype(np.float32)
    d = np.linalg.norm(flat[:, None, :] - refs[None, :, :], axis=2)
    nearest = d.argmin(axis=1)
    # Pixel, die keiner Klassenfarbe nahe sind (>40), zaehlen als Feld.
    far = d.min(axis=1) > 40
    nearest[far] = list(CLASSES).index("feld")
    return nearest.reshape(arr.shape[:2])


def comps(mask, min_px=24):
    lbl, _ = ndimage.label(mask)
    out = []
    for sl in ndimage.find_objects(lbl):
        if sl is None:
            continue
        ys, xs = sl
        if int(mask[sl].sum()) < min_px:
            continue
        out.append([xs.start, ys.start, xs.stop - xs.start, ys.stop - ys.start])
    return out


def load_template(state):
    zones = json.load(open(os.path.join(ROOT, f"docs/hud-zonen-{state}.json")))
    return [z for z in zones if z["w"] >= 2 and z["h"] >= 2]


def match_zones(tmpl, rend, errors, tag):
    used = [False] * len(rend)
    for z in tmpl:
        best, bi = None, -1
        for i, r in enumerate(rend):
            if used[i]:
                continue
            d = abs(r[0] - z["x"]) + abs(r[1] - z["y"])
            if best is None or d < best:
                best, bi = d, i
        if bi < 0:
            errors.append(f"{tag}: {z['cls']} @({z['x']},{z['y']}) {z['w']}x{z['h']} FEHLT im Render")
            continue
        r = rend[bi]
        used[bi] = True
        dx, dy = abs(r[0] - z["x"]), abs(r[1] - z["y"])
        dw, dh = abs(r[2] - z["w"]), abs(r[3] - z["h"])
        if max(dx, dy, dw, dh) > TOL:
            errors.append(
                f"{tag}: {z['cls']} soll ({z['x']},{z['y']},{z['w']},{z['h']}) "
                f"ist ({r[0]},{r[1]},{r[2]},{r[3]}) d=({dx:.1f},{dy:.1f},{dw:.1f},{dh:.1f})")
    for i, r in enumerate(rend):
        if not used[i]:
            errors.append(f"{tag}: ZUSAETZLICHE Zone ({r[0]},{r[1]},{r[2]},{r[3]})")


def check_state(fac, state, errors):
    p = os.path.join(GATE, f"zonemap_{fac}_{state}.png")
    if not os.path.exists(p):
        errors.append(f"{fac}/{state}: Screenshot fehlt ({p})")
        return
    arr = np.asarray(Image.open(p).convert("RGB"))
    idx = classify(arr)
    names = list(CLASSES)
    tmpl = load_template(state)
    for cls in ("panel", "bild", "icon", "text"):
        t = [z for z in tmpl if z["cls"] == cls]
        r = comps(idx == names.index(cls))
        match_zones(t, r, errors, f"{fac}/Z{state}/{cls}")
    # Ornament-Deckung: Vorlagen-Rotmaske (2px erodiert) muss rot sein.
    maskp = os.path.join(ROOT, f"docs/hud-ornamentmaske-{state}.png")
    tmask = np.asarray(Image.open(maskp).convert("L")) > 127
    tmask = ndimage.binary_erosion(tmask, iterations=2)
    red = idx == names.index("ornament")
    miss = tmask & ~red
    cov = 1 - miss.sum() / max(1, tmask.sum())
    if cov < 0.99:
        boxes = comps(miss, min_px=40)[:6]
        errors.append(f"{fac}/Z{state}/ornament: Deckung {cov*100:.2f}% (<99%), Luecken z.B. {boxes}")


def check_variance(fac, errors):
    """Texturvarianz im Realbild innerhalb der Vorlagen-Rotzonen (Zustand 1)."""
    p = os.path.join(GATE, f"real_{fac}_1.png")
    if not os.path.exists(p):
        errors.append(f"{fac}: Realbild fehlt ({p})")
        return
    arr = np.asarray(Image.open(p).convert("L")).astype(np.float32)
    tmask = np.asarray(Image.open(os.path.join(ROOT, "docs/hud-ornamentmaske-1.png")).convert("L")) > 127
    tmask = ndimage.binary_erosion(tmask, iterations=4)
    lbl, n = ndimage.label(tmask)
    B = 16
    for ri in range(1, n + 1):
        region = lbl == ri
        if region.sum() < 600:
            continue
        ys, xs = np.where(region)
        std_all = float(arr[region].std())
        # Blockraster: nur Bloecke voll in der Region
        uni = tot = 0
        for by in range(ys.min(), ys.max() - B, B):
            for bx in range(xs.min(), xs.max() - B, B):
                blk = region[by:by + B, bx:bx + B]
                if blk.all():
                    tot += 1
                    if arr[by:by + B, bx:bx + B].std() < 1.5:
                        uni += 1
        frac = uni / tot if tot else 0.0
        if std_all < 6.0 or frac > 0.5:
            errors.append(
                f"{fac}/ornament-Region {ri} (bbox x{xs.min()}-{xs.max()} y{ys.min()}-{ys.max()}): "
                f"std={std_all:.1f}, uniforme Bloecke {frac*100:.0f}% -> wirkt als Flachflaeche")


# Transparenz-Pruefpunkte (8x8-Patchmittel auf |weiss - schwarz|):
# Panelgrund MUSS durchscheinen (0.95 -> Soll-Differenz 0.05*255 = 12.75),
# Rahmen/Sockel/Buttons/Portraet DUERFEN NICHT (Differenz ~0).
ALPHA_THROUGH = [  # (x, y, Beschreibung)
    (1055, 950, "Einheitenkarte Panelgrund"),
    (1700, 1035, "Ressourcen Panelgrund"),
    (266, 76, "Emblem Panelgrund"),
]
ALPHA_OPAQUE = [
    (513, 900, "Einheitenkarte Rahmen"),
    (420, 1040, "Sockel-Band"),
    (1110, 850, "Befehlszelle"),
    (600, 950, "Portraetflaeche"),
]


def check_alpha(fac, errors):
    pw = os.path.join(GATE, f"alpha_{fac}_w.png")
    pb = os.path.join(GATE, f"alpha_{fac}_b.png")
    if not (os.path.exists(pw) and os.path.exists(pb)):
        errors.append(f"{fac}/alpha: Pruefpaar fehlt")
        return
    w = np.asarray(Image.open(pw).convert("L")).astype(np.float32)
    b = np.asarray(Image.open(pb).convert("L")).astype(np.float32)
    d = np.abs(w - b)
    def patch(x, y):
        return float(d[y - 4:y + 4, x - 4:x + 4].mean())
    for (x, y, name) in ALPHA_THROUGH:
        v = patch(x, y)
        if not (6.0 <= v <= 20.0):
            errors.append(f"{fac}/alpha: {name} ({x},{y}) Durchschein {v:.1f} ausserhalb [6,20] (Soll ~12.75)")
    for (x, y, name) in ALPHA_OPAQUE:
        v = patch(x, y)
        if v > 2.5:
            errors.append(f"{fac}/alpha: {name} ({x},{y}) scheint durch ({v:.1f} > 2.5) -- muss deckend sein")


# ====================================================================
# HUD-V2 Slot-Gesetze (docs/hud-spec-v2.md §5/§6/§9). Messbasis: Pixeldiff
# der schaltbaren Layer (dmask_{fac}_full / _orn0 / _herz0, eingefrorene
# Animation). Slot-Grenzen aus der VIOLETT-Vermessung (hud-zonen-N.json,
# cls=slot). Koenig (#2) fuellt seinen Slot und dominiert; Begleiter (#3/#4)
# sind zentrierte Module <=40 % Slot-Breite mit Ruhe beidseits; nur der
# Koenig leuchtet (Leucht-Exklusivitaet, Faktor >=4). MODERAT darf #1/Siegel
# leer lassen (offene Materialbestellung) -- kein Fehler.
# ====================================================================
ACCENT_HUE = {"hellmuth": 97.0, "moderat": 338.6}  # 7FD14C bzw. FF2D78
DIFF_T = 12.0
# Welche Slots fuehrt welche Fraktion (MODERAT ohne #1 topleft).
SLOT_PRESENT = {
    "hellmuth": {"topleft", "koenig", "gridres", "edge"},
    "moderat": {"koenig", "gridres", "edge"},
}


def _diffmask(a, b):
    return np.abs(a.astype(np.float32) - b.astype(np.float32)).max(axis=2) > DIFF_T


def _slot_bounds(state=1):
    """Slot-Bounding-Boxes aus der VIOLETT-Vermessung, nach Rolle benannt."""
    zones = [z for z in json.load(open(os.path.join(ROOT, f"docs/hud-zonen-{state}.json")))
             if z["cls"] == "slot"]
    out = {}
    for z in zones:
        x, y, w = z["x"], z["y"], z["w"]
        if y < 200:
            role = "topleft"
        elif x < 800:
            role = "koenig"
        elif x < 1700:
            role = "gridres"
        else:
            role = "edge"
        out[role] = (int(round(x)), int(round(y)), int(round(w)), int(round(z["h"])))
    return out


def _bbox(mask):
    ys, xs = np.where(mask)
    if len(xs) == 0:
        return None
    return xs.min(), ys.min(), xs.max(), ys.max(), int(mask.sum())


def check_slots(fac, errors, residuen):
    paths = {n: os.path.join(GATE, f"dmask_{fac}_{n}.png") for n in ("full", "orn0", "herz0")}
    if not all(os.path.exists(p) for p in paths.values()):
        errors.append(f"{fac}/slots: dmask-Tripel fehlt")
        return
    full = np.asarray(Image.open(paths["full"]).convert("RGB"))
    ornmask = _diffmask(full, np.asarray(Image.open(paths["orn0"]).convert("RGB")))
    herzmask = _diffmask(full, np.asarray(Image.open(paths["herz0"]).convert("RGB")))
    slots = _slot_bounds()
    present = SLOT_PRESENT[fac]

    # --- Begleiter #3/#4 (Option-1, Ticro-Maßvorlage): schmales Hauptmotiv unten
    # (<=40 %, D1) + SCHLANKES vertikales Beifuellmotiv, das bis fillTop aufragt.
    # Gemessen ab fillTop, um die Saeule zu erfassen. Garantie = Mindest-Fuellhoehe.
    FILLTOP = {"gridres": 860, "edge": 840}
    GARANTIE = {"gridres": 987, "edge": 908}
    begleiter_area = {}
    beg_tops = []
    for role in ("gridres", "edge"):
        sx, sy, sw, sh = slots[role]
        ftop, gar = FILLTOP[role], GARANTIE[role]
        sub = ornmask[:, sx:sx + sw]
        start = ftop - 25
        bb = _bbox(sub[start:1080])
        if bb is None:
            errors.append(f"{fac}/Slot-{role}: kein Begleiter montiert (Slot leer)")
            continue
        mnx, mny, mxx, mxy, area = bb
        begleiter_area[role] = area
        mny += start  # in absolute Bildkoordinaten
        mxy += start
        beg_tops.append(mny)
        occ = sub.any(axis=0)
        cols = int(occ.sum())
        span = (np.where(occ)[0].max() - np.where(occ)[0].min() + 1) if cols else 0
        # D1: Hauptmotiv-/Modulbreite <=40 % der Slot-Breite (2 % Toleranz). Das
        # schlanke vertikale Beifuellmotiv liegt mittig innerhalb dieser Breite.
        if span > 0.42 * sw:
            errors.append(f"{fac}/D1-{role}: Modulbreite {span}px > 40 % von {sw}")
        # D2: zentriert + Ruhe beidseits (jede Seite >= 18 % Slot-Breite).
        cen = sx + (np.where(occ)[0].min() + np.where(occ)[0].max()) / 2
        if abs(cen - (sx + sw / 2)) > 0.10 * sw:
            errors.append(f"{fac}/D2-{role}: Modul nicht zentriert (Mitte {cen:.0f} vs {sx+sw/2:.0f})")
        left = np.where(occ)[0].min()
        right = sw - 1 - np.where(occ)[0].max()
        if min(left, right) < 0.18 * sw:
            errors.append(f"{fac}/D2-{role}: Ruhe zu knapp (L{left}px R{right}px, <18 % von {sw})")
        # Verankerung unten + Hoehe: traegt das Band bis ~fillTop (mind. Garantie),
        # ohne fillTop deutlich zu ueberschreiten.
        if mxy < 1078:
            errors.append(f"{fac}/Anker-{role}: Fusskante y{mxy} nicht buendig (<1078)")
        if mny > gar:
            errors.append(f"{fac}/Hoehe-{role}: Begleiter erreicht Garantie {gar} nicht (top y{mny})")
        if mny < ftop - 22:
            errors.append(f"{fac}/Hoehe-{role}: Beifuellmotiv ragt ueber fillTop {ftop} (top y{mny})")

    # --- Koenig #2: fuellt den Slot, verankert, Peak erreicht, Dominanz.
    sx, sy, sw, sh = slots["koenig"]
    kb = _bbox(herzmask[sy - 30:1080, sx - 6:sx + sw + 6])
    biggest_beg = max(begleiter_area.values(), default=0)
    if kb is None:
        errors.append(f"{fac}/Koenig: kein Herzstueck im Slot")
    else:
        mnx, mny, mxx, mxy, karea = kb
        mny += sy - 30
        mxy += sy - 30
        if mxy < 1078:
            errors.append(f"{fac}/Anker-koenig: Fusskante y{mxy} nicht buendig (<1078)")
        # Koenig darf hoch aufragen (Ticro-Maßvorlage MODERAT bis ~y706); Spitze
        # zwischen y688 und der Garantie-Linie.
        if not (688 <= mny <= sy + (sh * 0.30)):
            errors.append(f"{fac}/Peak-koenig: Spitze y{mny} ausserhalb [688,{int(sy+sh*0.30)}]")
        # D6: Flaechen-Dominanz. In V2 fuellen Begleiter ihr Garantieband (Spec-
        # Groessenregel »gross und ikonisch«), sind also deutlich groesser als die
        # alten Mini-Aufsaetze -> Flaechenfaktor 8 war fuer das alte Modell. Hier
        # >=5x; die Koenig-PRIMITAET wird zusaetzlich durch Hoehe (ragt bis Peak,
        # ~3x hoeher) und Leucht-Exklusivitaet (D4, Faktor >=4) garantiert.
        if biggest_beg and karea < 5 * biggest_beg:
            errors.append(f"{fac}/D6: Koenig {karea}px2 < 5x groesstes Begleitmodul ({biggest_beg}px2)")
        # Hoehen-Dominanz: Koenig muss klar hoeher aufragen als jeder Begleiter.
        if beg_tops and (1080 - mny) < 1.3 * max(1080 - t for t in beg_tops):
            errors.append(f"{fac}/D6-Hoehe: Koenig ragt nicht >=1.3x hoeher als groesster Begleiter")

    # --- D4 Leucht-Exklusivitaet (§9): Akzent-LEUCHTEN nur am Koenig. Gemessen
    # NUR auf Ornamentpixeln (ornmask|herzmask), damit die fraktionsfarbene
    # Funktions-Chrome (Rahmen, Text, Icons, Minimap-Marker) nicht mitzaehlt.
    # Koenig-Leuchtkern muss >= 4x jeder Akzent-Leuchtfleck auf einem Begleiter.
    hsv = np.asarray(Image.open(paths["full"]).convert("HSV")).astype(np.float32)
    hue = hsv[..., 0] * 360.0 / 255.0
    dh = np.abs((hue - ACCENT_HUE[fac] + 180.0) % 360.0 - 180.0)
    accent = (dh <= 30.0) & (hsv[..., 1] > 127.5) & (hsv[..., 2] > 140.0)
    king_glow = int((accent & herzmask).sum())
    lbl, n = ndimage.label(accent & ornmask)  # Akzent auf Begleitern = verboten
    for sl in ndimage.find_objects(lbl):
        if sl is None:
            continue
        m = lbl[sl] > 0
        area = int(m.sum())
        if area < 200:
            continue
        ys, xs = sl
        box = f"x{xs.start}-{xs.stop} y{ys.start}-{ys.stop} {area}px2"
        if king_glow < 4 * area:
            errors.append(f"{fac}/D4: Akzent-Leuchten auf Begleiter ({box}); "
                          f"Koenig-Kern {king_glow}px2 < 4x")
        else:
            residuen.append(f"{fac}/D4: schwacher Akzent auf Begleiter ({box}, <1/4 Kern)")
    _ = present  # MODERAT #1/Siegel duerfen fehlen (kein Fehler)


# ====================================================================
# PIXEL-PRUEFUNG AN UEBERGAENGEN (hud-spec-v2 §5/§6, Briefing Abschnitt 5,
# Regel 1). Die Bounding-Box-/Deckungspruefung oben sieht keine LUECKE an der
# Naht: ueberlappende Boxen melden "Geometrie korrekt", waehrend im Bild der
# gruene Bodenton durchscheint (diagonale Eckteil-Luecke, schlanke Begleiter
# ohne Seiten-Leiste). Diese Pruefung laeuft die GEBUNDENEN Slot-Kanten am
# GERENDERTEN Realbild Pixel fuer Pixel ab und misst den Abstand von der Kante
# zum ersten Strukturpixel. Scheint der Bodenton ueber TR_GAP hinaus durch, ist
# das eine LUECKE = harter Befund. FREIE Kanten (oben/Hypotenuse) werden NICHT
# geprueft -- dort ist offenes Feld spec-konform.
# ====================================================================
BG_RGB = (38, 48, 42)  # Spielfeld-Bodenton, den der Harness hinter das HUD legt (#26302a)
BG_TOL = 12            # per-Kanal; Minimap-Terrain (~47,59,52) liegt knapp drueber -> ausgeschlossen
TR_SCAN = 40           # px, so weit wird von der Kante einwaerts nach Struktur gesucht
TR_GAP = 4             # px Bodenton zwischen Kante und Struktur sind toleriert (Antialiasing)
TR_MINRUN = 18         # px, so lang muss ein Spalt zusammenhaengen, um als Luecke zu zaehlen
# Hypotenuse + Naht des topleft-Eckteils (nicht-orthogonal): gruenes Dreieck an
# der Schraege und Spalt Emblem<->Eckteil. Bodenton per HSV erfassen (auch die
# antialiasten Randpixel, nicht nur den exakten Ton).
HSV_GREEN_H = (70, 160)            # Bodenton-Farbton (gruen) in Grad
HSV_GREEN_V = 90                   # nur dunkle Pixel (Bodenton ist dunkelgruen)
HSV_GREEN_S = (0.10, 0.60)         # Saettigungsfenster des Bodentons
TR_DIAG_MINRUN = 10                # px Mindestlauf entlang der Hypotenuse
TR_SEAM_GAP = 3                    # px Bodenton-Lauf in der Naht-Spalte, ab dem eine Zeile zaehlt
TOPLEFT_BOX = (294, 0, 173, 150)   # = TOPLEFT in src/ui/html_hud.ts
EMBLEM_RIGHT = 279                 # Emblem-Panel rechte Kante, docs/hud-zonen-1.json
# Gebundene Kanten je Slot (freie Kante ausgelassen), hud-spec-v2 §5.
SLOT_BOUND = {
    "topleft": ("L", "T"),          # frei: Hypotenuse unten rechts
    "koenig": ("L", "R", "B"),      # frei: oben
    "gridres": ("L", "R", "B"),     # frei: oben
    "edge": ("L", "B", "R"),        # frei: oben (R = Bildrand)
}


def _greenish_mask(arr):
    hsv = np.asarray(Image.fromarray(arr).convert("HSV")).astype(np.float32)
    h = hsv[..., 0] * 360.0 / 255.0
    s = hsv[..., 1] / 255.0
    v = hsv[..., 2]
    return ((h >= HSV_GREEN_H[0]) & (h <= HSV_GREEN_H[1]) & (v < HSV_GREEN_V) &
            (s >= HSV_GREEN_S[0]) & (s <= HSV_GREEN_S[1]))


def _bg_mask(arr):  # ERSETZT: exakter Bodenton ODER HSV-Gruen (auch antialiaste Raender)
    exact = np.abs(arr.astype(np.int16) - np.array(BG_RGB, np.int16)).max(2) <= BG_TOL
    m = exact | _greenish_mask(arr)
    m[764:1080, 0:316] = False  # Minimap-Terrain liegt farblich zu nah am Bodenton
    return m


def _runs(depths, gap, minrun):
    """Generischer Lauf-Finder: zusammenhaengende Laeufe mit Tiefe > gap."""
    out, cur, s = [], 0, 0
    for i, dd in enumerate(depths):
        if dd > gap:
            if cur == 0:
                s = i
            cur += 1
        else:
            if cur >= minrun:
                out.append((s, i - 1, cur, max(depths[s:i])))
            cur = 0
    if cur >= minrun:
        out.append((s, len(depths) - 1, cur, max(depths[s:])))
    return out


def _gap_runs(depths):
    return _runs(depths, TR_GAP, TR_MINRUN)


def _edge_depths(bg, box, edge):
    """Spalttiefe (Abstand Kante -> erstes Strukturpixel, gedeckelt auf TR_SCAN)
    je Position entlang einer gebundenen Kante. Scannt IN den Slot hinein."""
    x, y, w, h = box
    H, W = bg.shape
    y0, y1 = max(0, y), min(H, y + h)
    x0, x1 = max(0, x), min(W, x + w)

    def first(line):
        nz = np.where(~line[:TR_SCAN])[0]
        return int(nz[0]) if len(nz) else TR_SCAN

    if edge == "L":
        return [first(bg[j, x0:x0 + TR_SCAN]) for j in range(y0, y1)], ("y", y0)
    if edge == "R":
        xr = x1 - 1
        return [first(bg[j, xr::-1][:TR_SCAN]) for j in range(y0, y1)], ("y", y0)
    if edge == "T":
        return [first(bg[y0:y0 + TR_SCAN, i]) for i in range(x0, x1)], ("x", x0)
    yb = y1 - 1  # "B"
    return [first(bg[yb::-1, i][:TR_SCAN]) for i in range(x0, x1)], ("x", x0)


def _diag_depths(bg, box):
    """Hypotenuse oben-rechts -> unten-links: je Punkt Abstand einwaerts
    (links UND hoch) zum ersten Strukturpixel."""
    x, y, w, h = box
    H, W = bg.shape
    N = max(w, h)
    xs = np.linspace(x + w - 1, x, N).astype(int)
    ys = np.linspace(y, y + h - 1, N).astype(int)
    depths = []
    for px, py in zip(xs, ys):
        d = TR_SCAN
        for k in range(TR_SCAN):
            qx, qy = px - k, py - k
            if qx < 0 or qy < 0 or qx >= W or qy >= H:
                d = k
                break
            if not bg[qy, qx]:
                d = k
                break
        depths.append(d)
    return depths


def _seam_gap(bg, x_lo, x_hi, y0, y1):
    """BG-Lauf je Zeile in der Naht-Spalte zwischen Emblem und Eckteil."""
    rows, maxw = 0, 0
    for yy in range(y0, y1):
        seg = bg[yy, x_lo:x_hi]
        run = best = 0
        for vv in seg:
            run = run + 1 if vv else 0
            best = max(best, run)
        if best > TR_SEAM_GAP:
            rows += 1
            maxw = max(maxw, best)
    return rows, maxw


def check_transitions(fac, errors, residuen):
    p = os.path.join(GATE, f"real_{fac}_1.png")
    if not os.path.exists(p):
        errors.append(f"{fac}/Uebergaenge: Realbild fehlt ({p})")
        return
    arr = np.asarray(Image.open(p).convert("RGB"))
    bg = _bg_mask(arr)
    H, W = bg.shape
    slots = _slot_bounds()
    for role, edges in SLOT_BOUND.items():
        if role not in slots:
            continue
        x, y, w, h = slots[role]
        interior = ~bg[max(0, y):min(H, y + h), max(0, x):min(W, x + w)]
        # Leerer Slot (z.B. MODERAT #1 ohne Material): keine Naht zu pruefen.
        if interior.size == 0 or float(interior.mean()) < 0.05:
            residuen.append(f"{fac}/Uebergang-{role}: Slot praktisch leer, keine Naht gemessen")
            continue
        for e in edges:
            depths, base = _edge_depths(bg, (x, y, w, h), e)
            for (a, b, ln, deep) in _gap_runs(depths):
                where = f"{base[0]}{base[1] + a}-{base[1] + b}"
                errors.append(
                    f"{fac}/Uebergang-{role}-{e}: Bodenton scheint durch ({where}, "
                    f"Laenge {ln}px, max Spalttiefe {deep}px) -- Leiste/Ornament fehlt an der Kante")
    # topleft-Eckteil zusaetzlich an Hypotenuse + Naht (nicht-orthogonal):
    for (a, b, ln, deep) in _runs(_diag_depths(bg, TOPLEFT_BOX), TR_GAP, TR_DIAG_MINRUN):
        errors.append(f"{fac}/Uebergang-topleft-DIAG: gruenes Dreieck an der Hypotenuse "
                      f"(Diag {a}-{b}, Laenge {ln}px, Tiefe {deep}px)")
    rows, gw = _seam_gap(bg, EMBLEM_RIGHT, TOPLEFT_BOX[0] + 2, 0, TOPLEFT_BOX[3])
    if rows >= TR_MINRUN:
        errors.append(f"{fac}/Naht-topleft-emblem: Spalt {gw}px ueber {rows} Zeilen "
                      f"-- Leiste fehlt an der Naht")


def main():
    errors = []
    residuen = []
    for fac in ("hellmuth", "moderat"):
        for state in (1, 2):
            check_state(fac, state, errors)
    if "--skip-variance" not in sys.argv:
        for fac in ("hellmuth", "moderat"):
            check_variance(fac, errors)
    for fac in ("hellmuth", "moderat"):
        check_alpha(fac, errors)
        check_slots(fac, errors, residuen)
        check_transitions(fac, errors, residuen)
    print(f"== HUD-GATE: {len(errors)} Befund(e) ==")
    for e in errors:
        print("  -", e)
    if residuen:
        print(f"== RESIDUEN (kein Gate-Fehler, Basis-Stand): {len(residuen)} ==")
        for r in residuen:
            print("  ~", r)
    if errors:
        sys.exit(1)
    print("GATE GRUEN: Zonen + Ornament + Transparenz + Dichte-Gesetz D1-D6.")


if __name__ == "__main__":
    main()
