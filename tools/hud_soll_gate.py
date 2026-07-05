#!/usr/bin/env python3
# hud_soll_gate.py — prueft die HUD-SOLL-SPEC maschinell gegen den ECHTEN Render.
#
# Liest /tmp/gate/dom_<faction>.json (von tools/hud_dom_probe.mjs) und optional die
# real_<faction>_1.png-Shots (von hud_browser.mjs gateshots). Jeder Fail nennt die
# verletzte Soll-Spec-Stelle. Render-basiert, NICHT statisches CSS-Parsing
# (HUD-FEHLERURSACHEN.md Ursache 8: Gate und Laufzeit muessen dieselbe Wahrheit pruefen).
#
#   python3 tools/hud_soll_gate.py
#   python3 tools/hud_soll_gate.py --align=left --koenig=absent
#   ALIGN=left KOENIG=absent python3 tools/hud_soll_gate.py
#
# Parametrisierte OFFENE Entscheidungen (HUD-SOLL-SPEC §12), Default = aktueller
# Integrationslinien-Stand, damit das Gate nicht gegen unentschiedene Fragen rot wird:
#   --align=left|right       (A: Ressourcen-Zahlen, Default left = kanonisch links)
#   --koenig=present|absent  (C: Koenig, Default present = Code-Stand)
#   --lumastd-moderat=N      (G: Default 35; 0 akzeptiert MODERAT-Flachheit)
#
# Exit 1 bei Fail (errors), 0 sonst. Fehlende dom-JSON/Shots -> SKIP (kein Fail),
# damit der Gate-Lauf ohne Render nicht blockiert.

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

GATE = os.environ.get("SHOT_DIR", os.environ.get("GATE_DIR", "/tmp/gate"))
# Voll-Render fuer das sehende Gate (Werkstueck 1). Default = GATE_DIR; pruefen.sh
# schiesst die *_default.png in /tmp/pruefen_shots, darum auch dort suchen.
RENDER_DIR = os.environ.get("RENDER_DIR", "")
# P4 (Werkstueck 2): wenn die Render-Strecke nachweislich lief, ist ein fehlender
# Render/dom ein FAIL, kein stiller SKIP. pruefen.sh setzt RENDER_RAN=1.
RENDER_RAN = os.environ.get("RENDER_RAN") == "1"
SPEC = "docs/HUD-SOLL-SPEC.md"
FACTIONS = ("hellmuth", "moderat")


def _arg(name, env, default):
    for a in sys.argv[1:]:
        if a.startswith(f"--{name}="):
            return a.split("=", 1)[1]
    return os.environ.get(env, default)


ALIGN = _arg("align", "ALIGN", "left")             # A — kanonisch linksbuendig (Werkstueck 0)
KOENIG = _arg("koenig", "KOENIG", "present")        # C
LUMASTD_MODERAT = float(_arg("lumastd-moderat", "LUMASTD_MODERAT", "35"))  # G

errors = []   # harte Verstoesse -> rot, Exit 1
residuen = [] # Hinweise/Skips -> grau, kein Exit-Beitrag


def fail(fac, where, msg):
    errors.append(f"[{fac}] {where} :: {msg}")


def note(msg):
    residuen.append(msg)


def load_dom(fac):
    p = os.path.join(GATE, f"dom_{fac}.json")
    if not os.path.exists(p):
        return None
    try:
        with open(p, encoding="utf-8") as fh:
            return json.load(fh)
    except Exception as e:  # noqa: BLE001
        note(f"dom_{fac}.json unlesbar: {e}")
        return None


def _inset_px(s):
    # "−26px −15px −15px" / "-26px -15px -15px -15px" -> [top,right,bottom,(left)]
    out = []
    for tok in (s or "").replace("−", "-").split():
        try:
            out.append(abs(float(tok.replace("px", ""))))
        except ValueError:
            pass
    return out


def check_dom(fac, d):
    s = (d.get("scale") or {}).get("px") or 0
    vp = d.get("viewport") or {"w": 1920, "h": 1080}
    if s <= 0:
        fail(fac, "HUD-SOLL-SPEC §1 [hud.css:17]",
             "--hud-scale propagiert nicht (ornW=0) — Arbeitsbaum/Alt-Stand statt Integrationslinie?")
        return
    tol = max(2.0 * s, 2.0)

    # C2 — genau EIN Skalierungsweg (kein transform:scale)
    tsc = (d.get("scale") or {}).get("transformScale", 0)
    if tsc:
        fail(fac, "HUD-SOLL-SPEC §1 [hud.css:17]",
             f"{tsc} Element(e) mit transform:scale — Soll: nur EIN --hud-scale, kein scale()")

    # C2 — Panel-Anker-Quadranten
    P = d.get("panels") or {}
    quad = {
        "emblem":    ("links", "oben"),
        "menu":      ("rechts", "oben"),
        "minimap":   ("links", "unten"),
        "resources": ("rechts", "unten"),
    }
    for key, (hx, hy) in quad.items():
        r = P.get(key)
        if not r:
            fail(fac, "HUD-SOLL-SPEC §1", f"Panel .{key} fehlt im DOM")
            continue
        cx, cy = r["x"] + r["w"] / 2, r["y"] + r["h"] / 2
        okx = (cx < vp["w"] / 2) if hx == "links" else (cx > vp["w"] / 2)
        oky = (cy < vp["h"] / 2) if hy == "oben" else (cy > vp["h"] / 2)
        if not (okx and oky):
            fail(fac, "HUD-SOLL-SPEC §1 [hud.css:102,127,136,219]",
                 f"{key} Mitte ({cx:.0f},{cy:.0f}) nicht im Soll-Quadrant {hx}-{hy}")
    uc = P.get("unitcard")
    if uc:
        ucx = uc["x"] + uc["w"] / 2
        if abs(ucx - vp["w"] / 2) > 0.03 * vp["w"]:
            fail(fac, "HUD-SOLL-SPEC §1 (Karte zentriert)",
                 f"Einheitenkarte Mitte x={ucx:.0f}, Soll ~{vp['w']/2:.0f}")

    # C1 — Leistenstaerke 15px (geschlossen) / 26px (offene Oberkante)
    bi = d.get("beforeInset") or {}
    for key in ("p-minimap", "p-unitcard", "p-resources"):
        ins = _inset_px(bi.get(key))
        if len(ins) >= 3:
            top, right, bot = ins[0], ins[1], ins[2]
            # J — Oberkanten-Pruefung fraktionsabhaengig: NUR HELLMUTH hat die
            # offene 26px-Oberkante, MODERAT ist ueberall geschlossen (15px).
            exp_top = 26 * s if fac == "hellmuth" else 15 * s
            if abs(top - exp_top) > tol:
                kind = "offene" if fac == "hellmuth" else "geschlossene"
                fail(fac, "HUD-SOLL-SPEC §2 [hud.css:92-94]",
                     f"{key} {kind} Oberkante {top:.0f}px, Soll {exp_top:.0f}px (J fraktionsabhaengig)")
            if abs(bot - 15 * s) > tol or abs(right - 15 * s) > tol:
                fail(fac, "HUD-SOLL-SPEC §2 [hud.css:95-97]",
                     f"{key} geschlossene Kante {bot:.0f}/{right:.0f}px, Soll 15*s={15*s:.0f}px")
    # CODE≠SOLL §2.1 — offene Oberkante darf NICHT auf Emblem/Menue liegen
    for key in ("p-emblem", "p-menu"):
        ins = _inset_px(bi.get(key))
        if len(ins) >= 1 and abs(ins[0] - 26 * s) <= tol:
            fail(fac, "HUD-SOLL-SPEC §2 CODE≠SOLL(F) [html_hud.ts:178]",
                 f"{key} traegt die offene 26px-Oberkante — Soll: nur 3 Hauptpanels, Emblem/Menue reines strip_h_a")

    # C10 — Toenung: sRGB-Pflicht + Master als data:-URI
    st = d.get("strip") or {}
    for edge in ("top", "bot", "side"):
        c = st.get(edge) or {}
        if not c.get("present"):
            note(f"[{fac}] strip-{edge}: kein Inline-SVG erkannt (Toenung evtl. anders verdrahtet)")
            continue
        if not c.get("srgb"):
            fail(fac, "HUD-SOLL-SPEC §3 [hud_tint.ts:37]",
                 f"strip-{edge}: SVG ohne color-interpolation-filters=sRGB")
        if not c.get("dataMaster"):
            fail(fac, "HUD-SOLL-SPEC §3 [hud_tint.ts:25-28]",
                 f"strip-{edge}: Master nicht als data:image/png eingebettet (externe href = unsichtbarer Rahmen)")

    # C3 — Sigil
    sig = d.get("sigil") or {}
    if fac == "moderat":
        if sig.get("count", 0) != 1:
            fail(fac, "HUD-SOLL-SPEC §5 [html_hud.ts:283]",
                 f"MODERAT-Sigil count={sig.get('count')}, Soll 1")
        else:
            if sig.get("centerX") is not None and abs(sig["centerX"] - 960 * s) > 4 * s + 2:
                fail(fac, "HUD-SOLL-SPEC §5 [html_hud.ts:343]",
                     f"MODERAT-Sigil Mitte x={sig['centerX']:.0f}, Soll 960*s={960*s:.0f}")
            if sig.get("zIndex") not in (None, 8):
                fail(fac, "HUD-SOLL-SPEC §5 [hud.css:281]",
                     f"MODERAT-Sigil z-index={sig['zIndex']}, Soll 8")
    else:  # hellmuth
        if sig.get("count", 0) != 0:
            fail(fac, "HUD-SOLL-SPEC §5 [html_hud.ts:283]",
                 f"HELLMUTH hat Sigil ({sig.get('count')} Stueck), Soll 0")

    # C4 — Emblem-Eckstueck vorhanden + faction-korrekt
    ec = d.get("embCorner") or {}
    if not ec.get("present"):
        fail(fac, "HUD-SOLL-SPEC §4 [html_hud.ts:184]", "emb-corner fehlt im DOM")
    else:
        url = ec.get("url") or ""
        if "emblem_corner" not in url or fac not in url:
            fail(fac, "HUD-SOLL-SPEC §4 [html_hud.ts:184]",
                 f"emb-corner URL falsch/404-Verdacht: {url or '(leer)'} (Soll emblem_corner/{fac}.png)")

    # C6 — Saeulen/Flaeschchen raus (N3/N4)
    if d.get("fills", 0) != 0:
        fail(fac, "HUD-SOLL-SPEC §9 N3/N4 [html_hud.ts:280,298]",
             f"{d['fills']} v2-fill/v2-bloom (Saeulen/Flaeschchen) im DOM — Soll 0")

    # C12 — Ressourcen-Zahlen-Ausrichtung (parametrisiert, BLOCKER A)
    rv = d.get("resVal") or {}
    j = (rv.get("justify") or "").strip()
    want = "flex-start" if ALIGN == "left" else "flex-end"
    if rv.get("count", 0) and j and j != want:
        fail(fac, "HUD-SOLL-SPEC §6 (A) [hud.css:228]",
             f"res-val justify={j}, Soll {want} (--align={ALIGN})")

    # C13 — Koenig-Status (parametrisiert, BLOCKER C)
    kc = d.get("koenig", 0)
    if KOENIG == "absent" and kc != 0:
        fail(fac, "HUD-SOLL-SPEC §8 (C) [T:174]",
             f"Koenig gerendert ({kc} Stueck), Soll absent (--koenig=absent)")
    if KOENIG == "present" and kc == 0:
        fail(fac, "HUD-SOLL-SPEC §8 (C) [html_hud.ts:286]",
             "Koenig nicht gerendert, Soll present (--koenig=present)")


# ----- optionale Pixel-Checks (PIL); fehlt PIL oder Shot -> SKIP, kein Fail -----
def check_pixels(fac):
    shot = os.path.join(GATE, f"real_{fac}_1.png")
    if not os.path.exists(shot):
        note(f"[{fac}] Pixel-Checks uebersprungen (real_{fac}_1.png fehlt — hud_browser.mjs gateshots)")
        return
    try:
        from PIL import Image
    except Exception:  # noqa: BLE001
        note(f"[{fac}] Pixel-Checks uebersprungen (Pillow fehlt)")
        return
    im = Image.open(shot).convert("RGB")
    W, H = im.size
    px = im.load()

    # C7 — Debug-Marker (knallgelb #ffe000 / rosa #ff4dd2) duerfen im Proof-Render nicht sein
    yellow = magenta = 0
    step = max(1, W // 480)
    for y in range(0, H, step):
        for x in range(0, W, step):
            r, g, b = px[x, y]
            if r > 220 and g > 200 and b < 60:
                yellow += 1
            elif r > 220 and 60 < g < 140 and b > 170:
                magenta += 1
    if yellow > 200:
        fail(fac, "HUD-SOLL-SPEC §9 N8 [spec_overlay.ts]",
             f"gelbe Debug-Linien sichtbar (~{yellow}) — Proof-Render ohne ?speclines/?zonemap rendern")
    if magenta > 200 and fac == "hellmuth":
        fail(fac, "HUD-SOLL-SPEC §9 N9 [hud.css:42]",
             f"rosa/violette Flaeche im HELLMUTH-Render (~{magenta}) — keine violetten Bereiche")

    # C5 — schwarzer Fremdbalken am unteren Rand (Luma<0.10, breit, hoch)
    band = range(max(0, H - 30), H)
    wide_dark_rows = 0
    for y in band:
        dark = 0
        for x in range(0, W, step):
            r, g, b = px[x, y]
            if (0.2126 * r + 0.7152 * g + 0.0722 * b) < 26:  # ~Luma<0.10
                dark += 1
        if dark > 0.60 * (W // step):
            wide_dark_rows += 1
    if wide_dark_rows >= 18:
        fail(fac, "HUD-SOLL-SPEC §9 N2",
             f"schwarzer Fremdbalken am unteren Rand (~{wide_dark_rows}px hoch, >60% breit)")


# ----- DAS SEHENDE GATE (Werkstueck 1): Durchgaengigkeit + Eckverschmelzung -----
def _find_render(fac):
    name = f"{fac}_default.png"
    cands = []
    if RENDER_DIR:
        cands.append(os.path.join(RENDER_DIR, name))
    cands += [os.path.join(GATE, name), f"/tmp/pruefen_shots/{name}",
              f"/tmp/gate/{name}", f"/tmp/shots/{name}"]
    for c in cands:
        if os.path.exists(c):
            return c
    return None


def check_continuity(fac, d):
    """§11 Durchgaengigkeit + §12 Eckverschmelzung auf dem Voll-Render. Das ist das
    Sinnesorgan, das dem alten Gate fehlte (HUD-KRISENSTAB §3-D)."""
    s = (d.get("scale") or {}).get("px") or 0
    panels = d.get("panels") or {}
    if s <= 0 or not panels:
        return  # Geometrie ist schon in check_dom rot geworden
    render = _find_render(fac)
    if render is None:
        if RENDER_RAN:
            fail(fac, "HUD-SOLL-SPEC §2 Durchgaengigkeit (P4)",
                 f"{fac}_default.png fehlt, obwohl die Render-Strecke lief (RENDER_RAN=1) — "
                 f"fehlender Render ist FAIL, kein SKIP")
        else:
            note(f"[{fac}] Durchgaengigkeits-/Eck-Gate uebersprungen "
                 f"({fac}_default.png nicht gefunden — `hud_browser.mjs shoot`)")
        return
    try:
        import hud_continuity as hc
        g = hc.load_gray(render)
    except Exception as e:  # noqa: BLE001
        note(f"[{fac}] Durchgaengigkeits-/Eck-Gate uebersprungen (numpy/Pillow fehlt: {e})")
        return
    cont = hc.continuity(g, s)
    if not cont["passed"]:
        why = []
        if not cont["ncc_ok"]:
            why.append(f"self-NCC {cont['ncc']} (<{hc.NCC_MIN12}/{hc.NCC_MIN3})")
        if not cont["comb_ok"]:
            why.append(f"Kanten-Kamm {cont['comb']} (>{hc.COMB_MAX})")
        fail(fac, "HUD-SOLL-SPEC §2 [hud.css:94-110] Durchgaengigkeit",
             f"Leiste laeuft nicht durch — {', '.join(why)}, bestP={cont['bestP']} "
             f"(zerhackt/gestreckt)")
    co = hc.corners(g, panels, fac, s)
    if not co["passed"]:
        fail(fac, "HUD-SOLL-SPEC §2 [hud.css:89-98] Eckverschmelzung",
             f"{co['butt']}/{co['measured']} Panel-Ecken Stumpfstoss statt Gehrung "
             f"(gfrac>={hc.MITER_GFRAC} UND anti>={hc.MITER_ANTI} verlangt)")


def main():
    any_dom = False
    for fac in FACTIONS:
        d = load_dom(fac)
        if d is None:
            note(f"[{fac}] dom_{fac}.json fehlt — DOM-Checks uebersprungen (node tools/hud_dom_probe.mjs)")
        else:
            any_dom = True
            check_dom(fac, d)
            check_continuity(fac, d)
        check_pixels(fac)

    print(f"== HUD-Soll-Gate (Params: ALIGN={ALIGN} KOENIG={KOENIG} LUMASTD_MODERAT={LUMASTD_MODERAT:g}) ==")
    if not any_dom:
        if RENDER_RAN:
            print("  ROT — Render lief (RENDER_RAN=1), aber keine dom_*.json gefunden:"
                  " fehlender Render zaehlt als FAIL, nicht als SKIP (P4).")
            for r in residuen:
                print(f"    ~ {r}")
            return 1
        print("  SKIP — keine dom_*.json gefunden; erst `node tools/hud_dom_probe.mjs` laufen lassen.")
        for r in residuen:
            print(f"  ~ {r}")
        return 0  # kein Render -> kein Urteil, blockiert nicht
    if errors:
        print(f"  ROT — {len(errors)} Verstoss(e) gegen die HUD-SOLL-SPEC:")
        for e in errors:
            print(f"    - {e}")
        for r in residuen:
            print(f"    ~ {r}")
        return 1
    print("  GRUEN — Geometrie(15px/Anker/Sigil/Eck) + Abwesenheit + Toenung + Zahlen + Koenig"
          " + Durchgaengigkeit + Eckverschmelzung bestanden.")
    for r in residuen:
        print(f"  ~ {r}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
