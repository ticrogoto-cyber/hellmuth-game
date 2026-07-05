#!/usr/bin/env python3
"""florilegium_voice.py — H23 — Eleven-Labs-Audio-Generator fuer Florilegium-Eintraege.

Vorrendert pro Eintrag eine OGG-Datei (Helmuth-Voice-Klon). NICHT zur Laufzeit
erzeugt -- der Spielclient liest fertige Dateien.

Aufruf:
  python3 tools/florilegium_voice.py data/florilegium/de/einheiten/apothekerin.json
  python3 tools/florilegium_voice.py data/florilegium/de          # alle Eintraege
  python3 tools/florilegium_voice.py --dry-run data/florilegium/de # keine API-Calls

Idempotenz: SHA-256 ueber text+voice_settings. Liegt der Hash bereits in
.florilegium_audio_state.json UND die audio-Datei existiert, SKIPPED.

Budget-Cap: hartes Limit 100 Eintraege pro Lauf. Ueberschritten -> Abbruch.

Environment:
  ELEVENLABS_API_KEY     Pflicht. Ohne -> H23 RESERVED, Aufruf endet mit Fehler.
  HELLMUTH_VOICE_ID      Pflicht. Voice-Clone-ID aus dem Eleven-Labs-Konto.
  FLORILEGIUM_MODEL      optional, default 'eleven_multilingual_v2'.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent       # hellmuth/
ASSETS_VOICE = ROOT / "assets" / "voice"
STATE_FILE = ROOT / "data" / "florilegium" / ".florilegium_audio_state.json"

# Voice-Settings -- bewusst hier oben als Konstanten, spaeter anpassbar.
STABILITY = 0.5
SIMILARITY_BOOST = 0.75
STYLE = 0.0
USE_SPEAKER_BOOST = True

BUDGET_CAP = 100   # harte Obergrenze Eintraege/Lauf (Brief)
API_BASE = "https://api.elevenlabs.io"


def _settings_signature() -> str:
    return f"s{STABILITY}-b{SIMILARITY_BOOST}-y{STYLE}-{'B' if USE_SPEAKER_BOOST else 'b'}"


def hash_text(text: str) -> str:
    h = hashlib.sha256()
    h.update(_settings_signature().encode("utf-8"))
    h.update(b"\x00")
    h.update(text.encode("utf-8"))
    return h.hexdigest()


def load_state() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {}
    return {}


def save_state(state: dict) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")


def collect_entries(target: Path) -> list[tuple[Path, str]]:
    """Liefert (entry-json, lang) fuer alle relevanten Eintraege."""
    out: list[tuple[Path, str]] = []
    if target.is_file():
        # Lang aus Pfad ableiten: data/florilegium/<lang>/<cat>/<slug>.json
        lang = "de"
        for part in target.relative_to(ROOT).parts:
            if part in {"de", "en"}:
                lang = part
                break
        out.append((target, lang))
        return out
    # Verzeichnis -- alle .json sammeln, lang pro Datei
    for jf in sorted(target.rglob("*.json")):
        if jf.name in {"schema.json"} or jf.name.startswith("."):
            continue
        rel = jf.relative_to(ROOT)
        lang = "de"
        for part in rel.parts:
            if part in {"de", "en"}:
                lang = part
                break
        out.append((jf, lang))
    return out


def call_elevenlabs(text: str, voice_id: str, api_key: str, model: str) -> bytes:
    """OGG-Bytes von Eleven-Labs. Hebt bei jeder API-Antwort != 200 ab."""
    url = f"{API_BASE}/v1/text-to-speech/{voice_id}?output_format=ogg_44100"
    payload = {
        "text": text,
        "model_id": model,
        "voice_settings": {
            "stability": STABILITY,
            "similarity_boost": SIMILARITY_BOOST,
            "style": STYLE,
            "use_speaker_boost": USE_SPEAKER_BOOST,
        },
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "xi-api-key": api_key,
            "Content-Type": "application/json",
            "Accept": "audio/ogg",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def render_entry(entry_file: Path, lang: str, voice_id: str, api_key: str,
                 model: str, state: dict, dry_run: bool) -> tuple[str, str]:
    """-> (status, detail). status in {GENERATED, SKIPPED, FAILED}."""
    try:
        entry = json.loads(entry_file.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        return "FAILED", f"JSON kaputt: {e}"
    text = entry.get("text", "")
    audio_rel = entry.get("audio", "")
    if not (isinstance(text, str) and text):
        return "FAILED", "text-Feld fehlt oder leer"
    if not (isinstance(audio_rel, str) and audio_rel):
        return "FAILED", "audio-Feld fehlt oder leer"

    audio_out = ASSETS_VOICE / lang / audio_rel
    text_hash = hash_text(text)
    state_key = f"{lang}/{audio_rel}"
    prev = state.get(state_key, {})

    if prev.get("hash") == text_hash and audio_out.exists():
        return "SKIPPED", f"unveraendert ({audio_out.relative_to(ROOT)})"

    if dry_run:
        return "GENERATED", f"DRY {audio_out.relative_to(ROOT)} (kein API-Call)"

    try:
        ogg = call_elevenlabs(text, voice_id, api_key, model)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace") if e.fp else ""
        return "FAILED", f"HTTP {e.code} {body[:120]}"
    except Exception as e:
        return "FAILED", f"API-Call: {e.__class__.__name__}: {e}"

    audio_out.parent.mkdir(parents=True, exist_ok=True)
    audio_out.write_bytes(ogg)
    state[state_key] = {
        "hash": text_hash,
        "bytes": len(ogg),
        "voice_id": voice_id,
        "model": model,
        "settings": _settings_signature(),
    }
    return "GENERATED", f"{audio_out.relative_to(ROOT)} ({len(ogg)} B)"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("path", help="Eintrag-JSON oder Verzeichnis (data/florilegium/<lang>/)")
    ap.add_argument("--dry-run", action="store_true",
                    help="Pfade auflisten, KEINE API-Calls (kein Budget-Verbrauch)")
    ap.add_argument("--model", default=os.environ.get("FLORILEGIUM_MODEL", "eleven_multilingual_v2"))
    args = ap.parse_args()

    api_key = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    voice_id = os.environ.get("HELLMUTH_VOICE_ID", "").strip()
    if not args.dry_run:
        if not api_key:
            print("FAIL ELEVENLABS_API_KEY nicht gesetzt -> H23 RESERVED.")
            return 2
        if not voice_id:
            print("FAIL HELLMUTH_VOICE_ID nicht gesetzt.")
            return 2

    target = Path(args.path).resolve()
    if not target.exists():
        print(f"FAIL Pfad nicht gefunden: {target}")
        return 1

    entries = collect_entries(target)
    if not entries:
        print("no entries to render")
        return 0
    if len(entries) > BUDGET_CAP:
        print(f"FAIL Budget-Cap verletzt: {len(entries)} > {BUDGET_CAP} Eintraege pro Lauf.")
        return 1

    state = load_state()
    counts = {"GENERATED": 0, "SKIPPED": 0, "FAILED": 0}
    for entry_file, lang in entries:
        status, detail = render_entry(entry_file, lang, voice_id, api_key,
                                       args.model, state, args.dry_run)
        counts[status] += 1
        rel = entry_file.relative_to(ROOT)
        print(f"{status:9}  {rel}  {detail}")
    if not args.dry_run:
        save_state(state)

    print()
    print(f"Florilegium-Voice: GENERATED={counts['GENERATED']} "
          f"SKIPPED={counts['SKIPPED']} FAILED={counts['FAILED']}  (cap {BUDGET_CAP})")
    return 1 if counts["FAILED"] else 0


if __name__ == "__main__":
    sys.exit(main())
