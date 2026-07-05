#!/usr/bin/env python3
"""florilegium_validate.py — H22 — Validator fuer Florilegium-Eintraege.

Prueft data/florilegium/<lang>/<category>/<slug>.json gegen data/florilegium/
schema.json (Draft-07, hand-validiert -- keine externe jsonschema-Dep). Pro
Eintrag wird zusaetzlich geprueft:

  - id eindeutig innerhalb seiner category (Slug-Kollision -> harter FAIL)
  - image-Pfad existiert relativ zu hellmuth/public/sprites/
  - audio-Pfad existiert relativ zu hellmuth/assets/voice/<lang>/
  - text >= 200 Zeichen, <= 2000
  - category aus erlaubter Liste, unlock.type aus erlaubter Liste

Aufruf:
  python3 tools/florilegium_validate.py                       # default de/
  python3 tools/florilegium_validate.py data/florilegium/de   # explizit
  python3 tools/florilegium_validate.py --strict-paths        # image+audio MUSS existieren (Standard: nur warnen, Geruest-Phase)

Output: pro Eintrag PASS oder FAIL mit erster Befund-Zeile, am Ende Sammelbericht.
Exit 0 bei leerem Inhalts-Ordner mit Hinweis "no entries yet, schema valid".
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent       # hellmuth/
SCHEMA_PATH = ROOT / "data" / "florilegium" / "schema.json"
DEFAULT_DIR = ROOT / "data" / "florilegium" / "de"
ASSETS_VOICE = ROOT / "assets" / "voice"
ASSETS_IMG = ROOT / "public" / "sprites"

ID_RE = re.compile(r"^[a-z][a-z0-9_]{1,63}$")
TAG_RE = re.compile(r"^[a-z][a-z0-9_]{0,31}$")
PATH_IMG_RE = re.compile(r"^florilegium/[a-z]+/[a-z0-9_]+\.png$")
PATH_AUD_RE = re.compile(r"^florilegium/[a-z]+/[a-z0-9_]+\.ogg$")

CATEGORIES = ("fraktionen", "einheiten", "gebaeude", "substanzen", "konzepte", "welt")
UNLOCK_TYPES = ("always", "build", "kill", "research")
CITATION_SOURCES = ("Kreativer Suizid", "Helmuths Buch", None)


def _is_int(x): return isinstance(x, int) and not isinstance(x, bool)


def validate_entry(entry: dict, lang: str, expected_category: str | None, strict_paths: bool) -> list[str]:
    """Hand-validiert gegen schema.json + Cross-File-Constraints. Gibt Befundliste."""
    errs: list[str] = []

    # required keys
    required = ("id", "category", "title", "order", "unlock", "image",
                "audio", "text", "citation", "tags")
    for k in required:
        if k not in entry:
            errs.append(f"missing key '{k}'")
    if errs:
        return errs   # ohne Pflichtfelder ist Tiefenpruefung sinnlos

    # extra keys verboten (Schema additionalProperties:false)
    extra = set(entry) - set(required)
    if extra:
        errs.append(f"unknown keys: {sorted(extra)}")

    # id
    if not isinstance(entry["id"], str) or not ID_RE.match(entry["id"]):
        errs.append(f"id '{entry['id']!r}' verletzt ^[a-z][a-z0-9_]{{1,63}}$")

    # category
    cat = entry["category"]
    if cat not in CATEGORIES:
        errs.append(f"category '{cat}' nicht in {CATEGORIES}")
    if expected_category and cat != expected_category:
        errs.append(f"category '{cat}' widerspricht Ordnerpfad '{expected_category}'")

    # title
    if not (isinstance(entry["title"], str) and 1 <= len(entry["title"]) <= 120):
        errs.append("title muss str, 1..120 Zeichen sein")

    # order
    if not (_is_int(entry["order"]) and entry["order"] >= 0):
        errs.append("order muss int >= 0 sein")

    # unlock
    u = entry["unlock"]
    if not isinstance(u, dict):
        errs.append("unlock muss object sein")
    else:
        if set(u) - {"type", "trigger"}:
            errs.append(f"unlock: unbekannte Schluessel {sorted(set(u)-{'type','trigger'})}")
        if "type" not in u or "trigger" not in u:
            errs.append("unlock braucht 'type' und 'trigger'")
        else:
            if u["type"] not in UNLOCK_TYPES:
                errs.append(f"unlock.type '{u['type']}' nicht in {UNLOCK_TYPES}")
            if u["trigger"] is not None and not isinstance(u["trigger"], str):
                errs.append("unlock.trigger muss string oder null sein")

    # image / audio path pattern + Existenz
    img = entry["image"]
    if not (isinstance(img, str) and PATH_IMG_RE.match(img)):
        errs.append(f"image '{img}' verletzt Pfad-Konvention 'florilegium/<cat>/<slug>.png'")
    else:
        img_full = ASSETS_IMG / img
        if not img_full.exists():
            msg = f"image-Datei fehlt: {img_full.relative_to(ROOT)}"
            errs.append(msg) if strict_paths else errs.append("WARN " + msg)

    aud = entry["audio"]
    if not (isinstance(aud, str) and PATH_AUD_RE.match(aud)):
        errs.append(f"audio '{aud}' verletzt Pfad-Konvention 'florilegium/<cat>/<slug>.ogg'")
    else:
        aud_full = ASSETS_VOICE / lang / aud
        if not aud_full.exists():
            msg = f"audio-Datei fehlt: {aud_full.relative_to(ROOT)}"
            errs.append(msg) if strict_paths else errs.append("WARN " + msg)

    # text
    t = entry["text"]
    if not isinstance(t, str):
        errs.append("text muss string sein")
    elif not (200 <= len(t) <= 2000):
        errs.append(f"text-Laenge {len(t)} verletzt 200..2000 Zeichen")

    # citation
    c = entry["citation"]
    if not isinstance(c, dict):
        errs.append("citation muss object sein")
    else:
        if set(c) - {"source", "page"}:
            errs.append(f"citation: unbekannte Schluessel {sorted(set(c)-{'source','page'})}")
        if c.get("source") not in CITATION_SOURCES:
            errs.append(f"citation.source '{c.get('source')}' nicht in {CITATION_SOURCES}")
        page = c.get("page")
        if page is not None and not (_is_int(page) and page >= 1):
            errs.append("citation.page muss int >= 1 oder null sein")

    # tags
    tags = entry["tags"]
    if not isinstance(tags, list):
        errs.append("tags muss array sein")
    elif len(tags) > 16:
        errs.append(f"tags: {len(tags)} > 16 erlaubt")
    elif len(set(tags)) != len(tags):
        errs.append("tags: Duplikate")
    else:
        for tag in tags:
            if not (isinstance(tag, str) and TAG_RE.match(tag)):
                errs.append(f"tag '{tag}' verletzt ^[a-z][a-z0-9_]{{0,31}}$")
                break

    return errs


def _category_from_path(p: Path, root: Path) -> str | None:
    """data/florilegium/<lang>/<category>/<slug>.json -> <category>."""
    try:
        rel = p.relative_to(root)
    except ValueError:
        return None
    return rel.parts[0] if len(rel.parts) >= 2 else None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("path", nargs="?", default=str(DEFAULT_DIR),
                    help="Pfad zu data/florilegium/<lang>/ oder data/florilegium/")
    ap.add_argument("--strict-paths", action="store_true",
                    help="image+audio MUESSEN existieren (sonst nur WARN, Geruest-Phase)")
    args = ap.parse_args()

    if not SCHEMA_PATH.is_file():
        print(f"FAIL Schema fehlt: {SCHEMA_PATH.relative_to(ROOT)}")
        return 1
    try:
        json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))   # syntax-only
    except json.JSONDecodeError as e:
        print(f"FAIL Schema kaputt: {e}")
        return 1

    target = Path(args.path).resolve()
    if not target.exists():
        print(f"FAIL Inhalts-Ordner fehlt: {target}")
        return 1

    # Lang-Ordner-Erkennung
    if target.name in {"de", "en"}:
        lang_dirs = [target]
    else:
        lang_dirs = [d for d in target.iterdir() if d.is_dir() and d.name in {"de", "en"}]
        if not lang_dirs:
            lang_dirs = [target]   # alter Aufruf-Stil

    total = 0
    fails = 0
    warnings = 0
    seen: dict[tuple[str, str, str], Path] = {}   # (lang, category, id) -> file

    for lang_dir in lang_dirs:
        lang = lang_dir.name if lang_dir.name in {"de", "en"} else "de"
        for jf in sorted(lang_dir.rglob("*.json")):
            if jf.name == "schema.json":
                continue
            total += 1
            try:
                data = json.loads(jf.read_text(encoding="utf-8"))
            except json.JSONDecodeError as e:
                print(f"FAIL {jf.relative_to(ROOT)} :: JSON kaputt :: {e}")
                fails += 1
                continue
            cat_from_path = _category_from_path(jf, lang_dir)
            errs = validate_entry(data, lang, cat_from_path, args.strict_paths)
            real_errs = [e for e in errs if not e.startswith("WARN ")]
            warns = [e for e in errs if e.startswith("WARN ")]
            warnings += len(warns)
            # Duplikat-Check (id innerhalb category innerhalb Sprache)
            if isinstance(data.get("id"), str) and isinstance(data.get("category"), str):
                key = (lang, data["category"], data["id"])
                if key in seen:
                    real_errs.append(f"id-Duplikat in {key[0]}/{key[1]}: bereits {seen[key].relative_to(ROOT)}")
                else:
                    seen[key] = jf
            if real_errs:
                fails += 1
                print(f"FAIL {jf.relative_to(ROOT)} :: {real_errs[0]}"
                      + (f" (+{len(real_errs)-1} weitere)" if len(real_errs) > 1 else ""))
                for extra in real_errs[1:]:
                    print(f"     ... {extra}")
            else:
                tail = f" ({len(warns)} WARN)" if warns else ""
                print(f"PASS {jf.relative_to(ROOT)}{tail}")
            for w in warns:
                print(f"     {w}")

    print()
    if total == 0:
        print("PASS no entries yet, schema valid (Geruest-Phase)")
        return 0
    print(f"Florilegium: {total} Eintraege, {total - fails} PASS, {fails} FAIL, {warnings} WARN")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
