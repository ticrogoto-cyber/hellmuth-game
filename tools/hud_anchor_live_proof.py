#!/usr/bin/env python3
"""
hud_anchor_live_proof.py — HUD-Anker (Anker-Layout): gerendert aus der ECHTEN App
(vite dev, mit echten Ornamenten) bei 16:9 / 21:9 / 4:3.

Belegt: die vier Eck-Panels haengen an den echten Viewport-Ecken, die Einheiten-
karte ist horizontal zentriert, 16:9 bleibt spec-gleich, die Ornamente sind
intakt, und der elementFromPoint-Klick-Test stimmt (Panels schlucken, Luecken
durch). Voraussetzung: `npm run dev` laeuft auf :5173.

Lauf: python3 tools/hud_anchor_live_proof.py
"""
import glob
import io
import os

from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(ROOT, "docs/proof/hud_anchor.png")
URL = "http://localhost:5173/"
ASPECTS = [("16:9", 1920, 1080), ("21:9", 2560, 1080), ("4:3", 1440, 1080)]

PROBE = """() => {
  const C = sel => { const e=document.querySelector(sel); if(!e) return null;
    const r=e.getBoundingClientRect(); return [r.left+r.width/2, r.top+r.height/2]; };
  const R = sel => { const e=document.querySelector(sel); if(!e) return null;
    const r=e.getBoundingClientRect(); return {l:Math.round(r.left),t:Math.round(r.top),
    r:Math.round(r.right),b:Math.round(r.bottom),cx:Math.round(r.left+r.width/2)}; };
  const W=innerWidth,H=innerHeight;
  const pts=[['Emblem',C('.p-emblem')],['Menue',C('.p-menu')],['Minimap',C('.p-minimap')],
    ['Einheitenkarte',C('.p-unitcard')],['Ressourcen',C('.p-resources')],
    ['Leiste(frei)',[W*0.5,H-4]],['Welt-oben',[W*0.5,H*0.30]],['Welt-links',[W*0.12,H*0.5]]];
  const probes = pts.filter(p=>p[1]).map(([name,[x,y]])=>{
    const el=document.elementFromPoint(x,y); let hit='WELT';
    if(el){ const p=el.closest('#hud .panel'); if(p) hit=(p.className.match(/p-[\\w]+/)||['HUD'])[0];
      else if(el.closest('#hud .hud-bar')) hit='Leiste'; else if(el.closest('#hud')) hit='HUD'; }
    return {name,x:Math.round(x),y:Math.round(y),hit}; });
  return {W,H, emblem:R('.p-emblem'), menu:R('.p-menu'), minimap:R('.p-minimap'),
    resources:R('.p-resources'), unitcard:R('.p-unitcard'), probes};
}"""


def _font(sz):
    p = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    return ImageFont.truetype(p, sz) if os.path.exists(p) else ImageFont.load_default()


def label(img, text, h=26):
    out = Image.new("RGB", (img.width, img.height + h), (16, 16, 18))
    ImageDraw.Draw(out).text((8, 5), text, font=_font(15), fill=(235, 235, 235))
    out.paste(img.convert("RGB"), (0, h))
    return out


def main():
    exe = (glob.glob("/opt/pw-browsers/chromium-*/chrome-linux/chrome") + [None])[0]
    rows, all_ok = [], True
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=exe, args=["--no-sandbox", "--disable-gpu", "--use-gl=swiftshader"])
        for fac in ("hellmuth", "moderat"):
            aspects = ASPECTS if fac == "hellmuth" else [ASPECTS[0]]
            for name, w, h in aspects:
                pg = b.new_page(viewport={"width": w, "height": h})
                pg.goto(f"{URL}?faction={fac}", wait_until="load", timeout=30000)
                pg.wait_for_selector("#hud .p-emblem", timeout=15000)
                pg.wait_for_timeout(1800)  # Ornament-Bilder laden lassen
                d = pg.evaluate(PROBE)
                shot = Image.open(io.BytesIO(pg.screenshot())).convert("RGB")
                dr = ImageDraw.Draw(shot)
                # Ecken-Assertion: Emblem an (0,0), Menue rechtsbuendig, Minimap u.l., Ressourcen u.r.
                checks = {
                    "Emblem o.l.": d["emblem"]["l"] <= 2 and d["emblem"]["t"] <= 2,
                    "Menue o.r.": abs(d["menu"]["r"] - d["W"]) <= 2 and d["menu"]["t"] <= 2,
                    "Minimap u.l.": d["minimap"]["l"] <= 30 and abs(d["minimap"]["b"] - d["H"]) <= 30,
                    "Ressourcen u.r.": abs(d["resources"]["r"] - d["W"]) <= 200 and abs(d["resources"]["b"] - d["H"]) <= 30,
                    "Karte zentriert": abs(d["unitcard"]["cx"] - d["W"] / 2) <= 3,
                }
                for pr in d["probes"]:
                    world = pr["hit"] == "WELT"
                    ok = world == pr["name"].startswith("Welt")
                    checks[f"klick:{pr['name']}"] = ok
                    col = (90, 220, 90) if world else (235, 70, 70)
                    x, y = pr["x"], pr["y"]
                    dr.ellipse([x - 9, y - 9, x + 9, y + 9], outline=col, width=4)
                    dr.text((x + 12, y - 8), f"{pr['name']}->{pr['hit']}", font=_font(14), fill=col)
                ok_all = all(checks.values())
                all_ok = all_ok and ok_all
                bad = [k for k, v in checks.items() if not v]
                print(f"{fac} {name}: {'OK' if ok_all else 'FEHLER: ' + ', '.join(bad)}")
                disp = shot.resize((960, int(960 * h / w)), Image.LANCZOS)
                rows.append(label(disp, f"{fac.upper()} {name} ({w}x{h}) — Ecken gepinnt, Karte zentriert, "
                                         f"Ornamente intakt, Klick {'OK' if ok_all else 'FEHLER'}"))
                pg.close()
        b.close()

    print("\nGESAMT:", "ALLE KORREKT" if all_ok else "FEHLER — siehe oben")
    W = max(r.width for r in rows)
    sheet = Image.new("RGB", (W, sum(r.height + 8 for r in rows)), (10, 10, 12))
    y = 0
    for r in rows:
        sheet.paste(r, ((W - r.width) // 2, y)); y += r.height + 8
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    sheet.save(OUT)
    print(f"Beleg: {os.path.relpath(OUT, ROOT)}  ({sheet.width}x{sheet.height})")


if __name__ == "__main__":
    main()
