#!/usr/bin/env python3
"""status_gallery.py — Uebersichts-Galerie der Pruef-Batterie (Werkstueck 2).

Schreibt EINE auf GitHub browsbare Seite `proof/STATUS.md`: pro Gate eine Zeile
GRUEN/ROT/SKIP, daneben das zugehoerige Bild, alles in einem Scroll. Die
Gate-Status stammen aus einem ECHTEN `./pruefen.sh`-Lauf (kein erfundenes Gruen).

  python3 tools/status_gallery.py                 # faehrt pruefen.sh selbst
  python3 tools/status_gallery.py /pfad/lauf.log  # parst ein vorhandenes Log
  SHOT_DIR=/pfad python3 tools/status_gallery.py   # frische Shots von dort lesen

Leitplanke gegen Repo-Blaehung / 413-Push-Limit: nur kleine Thumbnails (JPEG,
feste Namen unter proof/thumbs/, harte Groessenschwelle THRESH). Ein zweiter Lauf
UEBERSCHREIBT dieselben Dateien — es entstehen NIE neue Bilddateien pro Lauf.
Fehlt eine Bildquelle, bleibt die Zelle leer (nie ein toter Link). Fehlt Pillow,
werden Thumbnails uebersprungen (Tabelle bleibt, ohne Bilder).
"""
import os
import re
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)            # hellmuth/
REPO = os.path.dirname(APP)            # Repo-Wurzel
PRUEFEN = os.path.join(REPO, "pruefen.sh")
PROOF = os.path.join(APP, "proof")
THUMBS = os.path.join(PROOF, "thumbs")
STATUS_MD = os.path.join(PROOF, "STATUS.md")

THRESH = 96 * 1024  # feste Groessenschwelle pro Thumbnail (Bytes)
WIDTH0 = 384        # Start-Breite Thumbnail (px)

ANSI = re.compile(r"\x1b\[[0-9;]*m")
ROW = re.compile(r"^\s+(PASS|FAIL|SKIP)\s+(.*\S)\s*$")
SECT = re.compile(r"^==\s*(.*?)\s*==\s*$")
TALLY = re.compile(r"PASS=(\d+)\s+FAIL=(\d+)\s+SKIP=(\d+)")

# Bild-Quellen je Gate. Erste existierende Quelle gewinnt: frischer Shot zuerst,
# committeter proof/-Beleg als Rueckfall. Schluessel = fester Thumbnail-Name.
SHOT = os.environ.get("SHOT_DIR")


def cand(*parts):
    """Bildkandidaten zusammenstellen, SHOT_DIR + bekannte /tmp-Dirs + proof/."""
    out = []
    for p in parts:
        if p:
            out.append(p)
    return out


def sources_for(name):
    """(thumb_key, [Quellpfade]) fuer ein Gate, oder (None, []) wenn kein Bild.

    NUR frische Shots des Laufs (SHOT_DIR zuerst, dann der Default-Ausgabepfad des
    erzeugenden Tools). KEIN Rueckfall auf committete proof/-Galeriebilder — sonst
    stuende neben einem Gate ein fremdes Marketing-Bild, das das Gate-Ergebnis NICHT
    belegt. Hat ein Gate keinen eigenen frischen Shot, bleibt die Zelle leer.
    """
    n = name.lower()
    s = lambda f: os.path.join(SHOT, f) if SHOT else None
    if ("render" in n and "drift" in n) or "render identisch" in n:
        return "render_hellmuth", cand(s("hellmuth_default.png"),
                                       "/tmp/pruefen_shots/hellmuth_default.png",
                                       "/tmp/shots/hellmuth_default.png")
    if "fog-of-war" in n or "fow" in n:
        return "fow", cand(s("reveal.png"), "/tmp/fow/reveal.png")
    if "physik" in n or "phys" in n:
        return "phys", cand(s("brawl.png"), "/tmp/phys/brawl.png")
    if "fraktions-zielsorten" in n or "faction" in n:
        return "faction", cand(s("faktion-zielsorten.png"),
                               "/tmp/edshots/faktion-zielsorten.png")
    if "terrain" in n:
        return "terrain", cand(s("terrain_offen.png"), "/tmp/gate/terrain_offen.png")
    if "hud-soll" in n or "hud-dom" in n:
        return "hud_soll", cand(s("real_hellmuth_1.png"), "/tmp/gate/real_hellmuth_1.png")
    return None, []


def make_thumb(src, key):
    """Kleines JPEG mit festem Namen erzeugen; gibt md-relativen Pfad oder None."""
    if not src or not os.path.exists(src):
        return None
    try:
        from PIL import Image
    except ImportError:
        return None
    try:
        os.makedirs(THUMBS, exist_ok=True)
        dst = os.path.join(THUMBS, key + ".jpg")
        width, q = WIDTH0, 72
        for _ in range(8):
            im = Image.open(src).convert("RGB")
            w, h = im.size
            if w > width:
                im = im.resize((width, max(1, round(h * width / w))), Image.LANCZOS)
            im.save(dst, "JPEG", quality=q, optimize=True)
            if os.path.getsize(dst) <= THRESH:
                break
            if q > 35:
                q -= 12
            else:
                width = max(200, width - 64)
        return os.path.relpath(dst, PROOF)
    except Exception as e:  # nie den Report wegen eines Bildes sprengen
        print(f"  thumb-skip {key}: {e}", file=sys.stderr)
        return None


def get_log(argv):
    """(log_text, quelle) — vorhandenes Log lesen oder pruefen.sh fahren."""
    if len(argv) > 1 and os.path.isfile(argv[1]):
        with open(argv[1], encoding="utf-8", errors="replace") as fh:
            return fh.read(), f"Log {argv[1]}"
    if not os.path.isfile(PRUEFEN):
        return "", "pruefen.sh nicht gefunden"
    print("status_gallery: fahre ./pruefen.sh (kann dauern) ...", file=sys.stderr)
    r = subprocess.run(["bash", PRUEFEN], cwd=REPO, capture_output=True, text=True)
    return r.stdout + r.stderr, "frischer ./pruefen.sh-Lauf"


def parse(text):
    """-> (sections[list of (title, [rows])], tally, overall). row=(status,name)."""
    text = ANSI.sub("", text)
    sections, cur = [], None
    tally, overall = None, None
    for line in text.splitlines():
        ms = SECT.match(line)
        if ms:
            cur = (ms.group(1), [])
            sections.append(cur)
            continue
        mr = ROW.match(line)
        if mr and cur is not None:
            cur[1].append((mr.group(1), mr.group(2)))
            continue
        mt = TALLY.search(line)
        if mt:
            tally = (int(mt.group(1)), int(mt.group(2)), int(mt.group(3)))
        if "GRUEN" in line and "ROT" not in line:
            overall = "GRUEN"
        if re.search(r"\bROT\b", line) and overall != "GRUEN":
            overall = "ROT"
    return sections, tally, overall


DOT = {"PASS": "\U0001F7E2", "FAIL": "\U0001F534", "SKIP": "\U0001F7E1"}
WORD = {"PASS": "GRUEN", "FAIL": "ROT", "SKIP": "SKIP"}


def short(s, n=86):
    return s if len(s) <= n else s[: n - 1] + "…"


def git(*args):
    try:
        return subprocess.run(["git", "-C", REPO, *args], capture_output=True,
                              text=True).stdout.strip()
    except Exception:
        return "?"


def main():
    text, quelle = get_log(sys.argv)
    sections, tally, overall = parse(text)

    # Galerie-Belege (committet, immer vorhanden) — feste Thumbnails.
    spiel = [
        ("spiel_01", "01_zwei_armeen.png", "Aufstellung: zwei Armeen, HUD, Minimap, Ressourcen"),
        ("spiel_02", "02_gefecht.png", "Gefecht: Einheiten in Bewegung/Kontakt"),
        ("spiel_03", "03_karte_dicht.png", "Editor-Karte dicht (Wald)"),
        ("spiel_04", "04_karte_offen.png", "Editor-Karte offen"),
        ("spiel_05", "05_fog_of_war.png", "Fog-of-War: aufgedeckte Tasche"),
    ]

    L = []
    head = "GRUEN" if overall == "GRUEN" else ("ROT" if overall == "ROT" else "?")
    badge = {"GRUEN": DOT["PASS"], "ROT": DOT["FAIL"]}.get(head, DOT["SKIP"])
    L.append("# HELLMUTH — STATUS (Pruef-Batterie)")
    L.append("")
    L.append(f"_Generiert {time.strftime('%Y-%m-%d %H:%M')} · "
             f"Branch `{git('rev-parse', '--abbrev-ref', 'HEAD')}` · "
             f"HEAD `{git('rev-parse', '--short', 'HEAD')}`_  ")
    L.append(f"_Gate-Status aus: {quelle}. Diese Seite wird von "
             "`tools/status_gallery.py` erzeugt; nicht von Hand pflegen._")
    L.append("")
    if tally:
        L.append(f"## Gesamturteil: {badge} **{head}** — "
                 f"PASS={tally[0]} FAIL={tally[1]} SKIP={tally[2]}")
    else:
        L.append(f"## Gesamturteil: {badge} **{head}**")
    L.append("")

    used_keys = set()
    made = set()  # tatsaechlich in diesem Lauf geschriebene Thumbnail-Dateien
    if not sections:
        L.append("> Kein Gate-Output gefunden — lief die Batterie?")
    for title, rows in sections:
        if not rows:
            continue
        L.append(f"### {title}")
        L.append("")
        L.append("| Status | Gate | Bild |")
        L.append("|---|---|---|")
        for status, name in rows:
            key, srcs = sources_for(name)
            rel = None
            if key and key not in used_keys:
                src = next((p for p in srcs if p and os.path.exists(p)), None)
                rel = make_thumb(src, key)
                if rel:
                    used_keys.add(key)
                    made.add(key + ".jpg")
            elif key in used_keys:
                rel = os.path.relpath(os.path.join(THUMBS, key + ".jpg"), PROOF) \
                    if os.path.exists(os.path.join(THUMBS, key + ".jpg")) else None
            img = f"![{key}]({rel})" if rel else "—"
            L.append(f"| {DOT.get(status, '')} {WORD.get(status, status)} "
                     f"| {short(name)} | {img} |")
        L.append("")

    # Spiel-Ansicht: committete Belege, herunterskaliert (immer vorhanden).
    L.append("### Spiel-Ansicht (committete Belege, herunterskaliert)")
    L.append("")
    any_img = False
    for key, fname, capt in spiel:
        rel = make_thumb(os.path.join(PROOF, fname), key)
        if rel:
            any_img = True
            made.add(key + ".jpg")
            L.append(f"**{capt}**  ")
            L.append(f"![{capt}]({rel})")
            L.append("")
    if not any_img:
        L.append("> Pillow fehlt — Thumbnails uebersprungen. "
                 "Originale liegen in `proof/*.png`.")
        L.append("")

    L.append("---")
    L.append("_Bilder: frischer Shot aus `SHOT_DIR`, sonst committeter `proof/`-Beleg "
             "(herunterskaliert). Feste Dateinamen unter `proof/thumbs/`, "
             f"je < {THRESH // 1024} KB, vom naechsten Lauf ueberschrieben._")

    os.makedirs(PROOF, exist_ok=True)
    with open(STATUS_MD, "w", encoding="utf-8") as fh:
        fh.write("\n".join(L) + "\n")

    # Verwaiste Thumbnails frueherer Laeufe entfernen -> kein Zuwachs an Bilddateien,
    # keine toten/irrefuehrenden Reste. Nur proof/thumbs/*.jpg, nur was dieser Lauf
    # nicht geschrieben hat.
    if os.path.isdir(THUMBS):
        for f in sorted(os.listdir(THUMBS)):
            if f.endswith(".jpg") and f not in made:
                os.remove(os.path.join(THUMBS, f))
                print(f"  thumb entfernt (verwaist): {f}")

    # Selbstkontrolle: Schwelle einhalten, Groessen melden.
    over = []
    if os.path.isdir(THUMBS):
        for f in sorted(os.listdir(THUMBS)):
            fp = os.path.join(THUMBS, f)
            sz = os.path.getsize(fp)
            print(f"  thumb {f}: {sz // 1024} KB")
            if sz > THRESH:
                over.append(f)
    print(f"status_gallery: {STATUS_MD} geschrieben "
          f"({sum(len(r) for _, r in sections)} Gate-Zeilen, Urteil {head}).")
    if over:
        print(f"WARN: ueber Schwelle: {over}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
