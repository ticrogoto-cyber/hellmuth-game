#!/usr/bin/env python3
"""werkzeuge_check.py — maschinell prüfen, ob die elf Welle-1-Hebel aus
`docs/CONTAINER-WERKZEUGE.md` im aktuellen venv importierbar bzw. ausführbar sind.

Aufruf:
  python3 tools/werkzeuge_check.py            # nur prüfen, PASS/FAIL-Tabelle
  python3 tools/werkzeuge_check.py --install  # fehlende nachziehen (pip + GitHub-Release)

Exit-Code 0 wenn alles PASS, 1 sonst. Skip-Codes (z. B. bpy, das in einem
eigenen venv lebt) zählen als PASS, wenn die Datei `tools/.werkzeuge_skip` den
Eintrag enthält — siehe Datei-Ende für die Konvention.

Die Liste folgt strikt der Welle-1-Doktrin (`docs/CONTAINER-WERKZEUGE.md`
Commit `69d93a2`): es zählt der Gewichts-Host, nicht der Paket-Host. Wer das
ändert, ändert die Doktrin und nicht den Check.
"""
from __future__ import annotations

import argparse
import importlib
import os
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional

ROOT = Path(__file__).resolve().parent.parent      # hellmuth/
MODEL_DIR = ROOT / "tools" / "models"              # u2net.onnx, RealESRGAN_x4plus.pth, …
VOICE_DIR = ROOT / "tools" / "voices"              # de-thorsten-low.onnx, …
BIN_DIR = ROOT / "tools" / "bin"                   # FBX2glTF, piper
SKIP_FILE = ROOT / "tools" / ".werkzeuge_skip"


@dataclass
class Hebel:
    name: str
    klasse: str                       # Bild/Audio/3D/Profiling/Daten/…
    check: Callable[[], tuple[bool, str]]
    install: Optional[Callable[[], tuple[bool, str]]] = None
    skip_key: str = ""                # Eintrag in tools/.werkzeuge_skip → SKIP=PASS
    active: bool = True               # True = Pflicht-PASS in --ci; False = RESERVED


def _pip_install(*pkgs: str, extra: list[str] | None = None) -> tuple[bool, str]:
    extra = extra or []
    cmd = [sys.executable, "-m", "pip", "install", *pkgs, *extra]
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode == 0:
        return True, f"pip install {' '.join(pkgs)} ok"
    return False, (p.stderr or p.stdout).strip().splitlines()[-1] if (p.stderr or p.stdout) else "pip-Fehler"


def _import_check(modname: str, attr: str | None = None) -> Callable[[], tuple[bool, str]]:
    def go() -> tuple[bool, str]:
        try:
            m = importlib.import_module(modname)
            if attr is not None and not hasattr(m, attr):
                return False, f"{modname} ohne Attribut '{attr}'"
            v = getattr(m, "__version__", "?")
            return True, f"{modname} {v}"
        except Exception as exc:
            return False, f"import {modname}: {exc.__class__.__name__}: {exc}"
    return go


def _binary_check(name: str, candidates: list[Path]) -> Callable[[], tuple[bool, str]]:
    def go() -> tuple[bool, str]:
        for p in candidates:
            if p.exists() and os.access(p, os.X_OK):
                return True, f"{name} @ {p.relative_to(ROOT) if p.is_relative_to(ROOT) else p}"
        on_path = shutil.which(name)
        if on_path:
            return True, f"{name} @ {on_path} (PATH)"
        return False, f"{name} nicht gefunden in {[str(p) for p in candidates]} und nicht in PATH"
    return go


def _file_check(name: str, candidates: list[Path]) -> Callable[[], tuple[bool, str]]:
    def go() -> tuple[bool, str]:
        for p in candidates:
            if p.exists() and p.stat().st_size > 0:
                return True, f"{name} @ {p.relative_to(ROOT) if p.is_relative_to(ROOT) else p} ({p.stat().st_size // (1024*1024)} MB)"
        return False, f"{name} nicht gefunden: {[str(p) for p in candidates]}"
    return go


def _fetch_release(url: str, dst: Path, chmod_x: bool = False) -> tuple[bool, str]:
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists() and dst.stat().st_size > 0:
        return True, f"vorhanden: {dst}"
    try:
        import urllib.request
        urllib.request.urlretrieve(url, dst)
    except Exception as exc:
        return False, f"download {url}: {exc.__class__.__name__}: {exc}"
    if chmod_x:
        dst.chmod(0o755)
    return True, f"geladen: {dst} ({dst.stat().st_size // (1024*1024)} MB)"


HEBEL: list[Hebel] = [
    Hebel(name="H1 rembg (u2net via GitHub)", active=False, klasse="Bild/KI", check=_import_check("rembg"), install=lambda: _pip_install("rembg", "onnxruntime")),
    Hebel(name="H2 opencv-python-headless (cv2)", active=False, klasse="Bild/determin.", check=_import_check("cv2"), install=lambda: _pip_install("opencv-python-headless")),
    Hebel(name="H3a imageio-ffmpeg", active=False, klasse="Audio/Vorpipe", check=_import_check("imageio_ffmpeg"), install=lambda: _pip_install("imageio-ffmpeg")),
    Hebel(name="H3b pydub", active=False, klasse="Audio/Schnitt", check=_import_check("pydub"), install=lambda: _pip_install("pydub")),
    Hebel(name="H3c pyloudnorm", active=False, klasse="Audio/Loudness", check=_import_check("pyloudnorm"), install=lambda: _pip_install("pyloudnorm", "soundfile")),
    Hebel(name="H4a FBX2glTF (GitHub-Release-Binary)", active=False, klasse="3D", check=_binary_check("FBX2glTF", [BIN_DIR / "FBX2glTF", ROOT / "tools" / "FBX2glTF"]), install=lambda: _fetch_release("https://github.com/facebookincubator/FBX2glTF/releases/download/v0.9.7/FBX2glTF-linux-x64", BIN_DIR / "FBX2glTF", chmod_x=True)),
    Hebel(name="H4b bpy (eigenes venv, numpy 1.26)", active=False, klasse="3D", check=_import_check("bpy"), install=lambda: _pip_install("bpy"), skip_key="bpy"),
    Hebel(name="H4c trimesh + pygltflib + dracox", active=False, klasse="3D", check=_import_check("trimesh"), install=lambda: _pip_install("trimesh", "pygltflib", "dracox")),
    Hebel(name="H6a pyvips", active=False, klasse="Bild/Batch", check=_import_check("pyvips"), install=lambda: _pip_install("pyvips")),
    Hebel(name="H6b rectpack (--use-pep517)", active=False, klasse="Bild/Atlas", check=_import_check("rectpack"), install=lambda: _pip_install("rectpack", extra=["--use-pep517"])),
    Hebel(name="H7 pandas + matplotlib", active=False, klasse="Daten/Balance", check=_import_check("pandas"), install=lambda: _pip_install("pandas", "matplotlib")),
    Hebel(name="H8 Real-ESRGAN (GitHub-Release-Gewicht)", active=False, klasse="Bild/KI", check=_file_check("RealESRGAN_x4plus.pth", [MODEL_DIR / "RealESRGAN_x4plus.pth"]), install=lambda: _fetch_release("https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth", MODEL_DIR / "RealESRGAN_x4plus.pth")),
    Hebel(name="H9 piper-tts (GitHub-Release-Stimme, NICHT Default-Downloader)", active=False, klasse="Audio/TTS", check=_file_check("de-thorsten-low.onnx", [VOICE_DIR / "de-thorsten-low.onnx"]), install=lambda: _fetch_release("https://github.com/rhasspy/piper/releases/download/v0.0.2/voice-de-thorsten-low.tar.gz", VOICE_DIR / "voice-de-thorsten-low.tar.gz")),
    Hebel(name="W2-A pymatting (Halo-Cleanup NACH rembg)", active=False, klasse="Bild/Refine", check=_import_check("pymatting"), install=lambda: _pip_install("pymatting")),
    Hebel(name="W2 psd-tools", active=False, klasse="Bild/PSD", check=_import_check("psd_tools"), install=lambda: _pip_install("psd-tools")),
    Hebel(name="W2 opensimplex", active=False, klasse="Bild/Textur", check=_import_check("opensimplex"), install=lambda: _pip_install("opensimplex")),
    Hebel(name="W2 numpngw (APNG)", active=False, klasse="Bild/APNG", check=_import_check("numpngw"), install=lambda: _pip_install("numpngw")),
    Hebel(name="W2 colorspacious (DeltaE-Audit)", active=False, klasse="Bild/Palette", check=_import_check("colorspacious"), install=lambda: _pip_install("colorspacious")),
    Hebel(name="W2 open3d (3D-cluster, direkter FBX-Read)", active=False, klasse="3D", check=_import_check("open3d"), install=lambda: _pip_install("open3d"), skip_key="open3d-bildcluster"),
    Hebel(name="W2 meshoptimizer (3D, 3x schneller als trimesh)", active=False, klasse="3D", check=_import_check("meshoptimizer"), install=lambda: _pip_install("meshoptimizer"), skip_key="open3d-bildcluster"),
    Hebel(name="W2 pymeshlab", active=False, klasse="3D", check=_import_check("pymeshlab"), install=lambda: _pip_install("pymeshlab"), skip_key="open3d-bildcluster"),
    Hebel(name="W2 xatlas (UV-Unwrap)", active=False, klasse="3D", check=_import_check("xatlas"), install=lambda: _pip_install("xatlas"), skip_key="open3d-bildcluster"),
    Hebel(name="W2 embreex (AO-Bake)", active=False, klasse="3D", check=_import_check("embreex"), install=lambda: _pip_install("embreex"), skip_key="open3d-bildcluster"),
    Hebel(name="W2 pyvista (libGL apt noetig)", active=False, klasse="3D", check=_import_check("pyvista"), install=lambda: _pip_install("pyvista"), skip_key="open3d-bildcluster"),
    Hebel(name="W2 ikpy (3-Ziel-IK, Fehler 0,0)", active=False, klasse="3D/Rigging", check=_import_check("ikpy"), install=lambda: _pip_install("ikpy"), skip_key="open3d-bildcluster"),
    Hebel(name="W2 pybullet (URDF-Sim)", active=False, klasse="3D/Phys", check=_import_check("pybullet"), install=lambda: _pip_install("pybullet"), skip_key="open3d-bildcluster"),
    Hebel(name="W2 mediapipe (Pose -> IK)", active=False, klasse="3D/Pose", check=_import_check("mediapipe"), install=lambda: _pip_install("mediapipe"), skip_key="open3d-bildcluster"),
    Hebel(name="W2 pedalboard (Spotify Effekt-Ketten)", active=False, klasse="Audio/DSP", check=_import_check("pedalboard"), install=lambda: _pip_install("pedalboard")),
    Hebel(name="W2 librosa (Onset/Tempo/MFCC)", active=False, klasse="Audio/Analyse", check=_import_check("librosa"), install=lambda: _pip_install("librosa")),
    Hebel(name="W2 pyroomacoustics", active=False, klasse="Audio/Raum", check=_import_check("pyroomacoustics"), install=lambda: _pip_install("pyroomacoustics")),
    Hebel(name="W2 spaudiopy (Ambisonics, scipy<1.15)", active=False, klasse="Audio/Spatial", check=_import_check("spaudiopy"), install=lambda: _pip_install("spaudiopy", "scipy<1.15")),
    Hebel(name="W2 hypothesis (Property-Based-Testing)", active=False, klasse="Test", check=_import_check("hypothesis"), install=lambda: _pip_install("hypothesis")),
    Hebel(name="W3 txtai (BM25-RAG fuer repo_rag.py)", active=False, klasse="RAG", check=_import_check("txtai"), install=lambda: _pip_install("txtai")),
    Hebel(name="W3 fastembed (Neural-RAG, BGE auf GCS)", active=False, klasse="RAG", check=_import_check("fastembed"), install=lambda: _pip_install("fastembed")),
    Hebel(name="W3 supriya (SynthDef-Generator fuer scsynth_synthdef.py)", klasse="Audio/SC", active=False, check=_import_check("supriya"), install=lambda: _pip_install("supriya")),
    Hebel(name="H28 tile_tools (kacheltest/heal/quilt/diamond)", klasse="Bild/Tiles", check=_file_check("tile_tools.py", [ROOT / "tools" / "tile_tools.py"])),
    Hebel(name="H29 mine_mockup (Mockup-Ernte, Degraded-faehig)", klasse="Bild/Mining", check=_file_check("mine_mockup.py", [ROOT / "tools" / "mine_mockup.py"])),
    Hebel(name="W3 scsynth (apt, supercollider-server, NRT-Render)", klasse="Audio/SC", active=False, check=_binary_check("scsynth", [Path("/usr/bin/scsynth")])),
    Hebel(name="H18 glb_validate (trimesh-Pre-Rig-Validator)", active=False, klasse="3D/Validierung", check=lambda: _roundtrip_glb_validate()),
    Hebel(name="H19 auto_rig_3d (bpy ARMATURE_AUTO + Replicate-Fallback)", klasse="3D/Rigging", active=False, check=lambda: _check_auto_rig_skeleton(), skip_key="auto-rig-template"),
    Hebel(name="H20 retarget_animation (bpy Constraint-Loop)", klasse="3D/Anim", active=False, check=lambda: _check_retarget_smoke(), skip_key="retarget-demo"),
    Hebel(name="H21 render_iso_sheet (Multi-Clip Iso-Wrapper)", klasse="3D/Render", active=False, check=lambda: _check_render_iso_importable(), skip_key="render-iso-bpy"),
    Hebel(name="H22 florilegium_validate (Eintrag-Schema-Gate)", klasse="Daten/Florilegium", active=False, check=lambda: _check_florilegium_validate()),
    Hebel(name="H23 florilegium_voice (Eleven-Labs-Audio-Generator)", klasse="Audio/Florilegium", check=lambda: _check_florilegium_voice(), active=bool(os.environ.get("ELEVENLABS_API_KEY") and os.environ.get("HELLMUTH_VOICE_ID"))),
    Hebel(name="H24 florilegium_ui_check (Headless-UI-Strukturpruefung)", klasse="UI/Florilegium", active=False, check=lambda: _check_florilegium_ui(), skip_key="florilegium-ui-build"),
    Hebel(name="H25 menu_ui_check (Headless-Menue-Strukturpruefung)", klasse="UI/Menue", active=False, check=lambda: _check_menu_ui(), skip_key="menu-ui-build"),
    Hebel(name="KB-H14 knockback_system (Anti-Pattern-Tests via tsx)", klasse="Knockback", check=lambda: _tsx_run("test/knockback/anti_patterns.test.ts")),
    Hebel(name="KB-H15 SpatialGrid-Wiederverwendung (kein Duplikat)", klasse="Knockback", check=lambda: _kb_spatial_reuse()),
    Hebel(name="KB-H16 Knockback-Config-Schema (jsonschema good/bad)", klasse="Knockback", check=lambda: _kb_schema_check()),
    Hebel(name="KB-H17 Knockback-Debug-Visualizer (canvas + Ready-Flag)", klasse="Knockback", check=lambda: _kb_debug_html()),
    Hebel(name="KB-H18 Knockback-E2E-Smoke (tsx, eine Explosion bewegt Units)", klasse="Knockback", check=lambda: _tsx_run("tools/smoke/knockback_smoke.ts")),
    Hebel(name="KB-H19 §10-Demo-Assertion (Distanz-Baender + Determinismus)", klasse="Knockback", check=lambda: _tsx_run("tools/smoke/knockback_demo_assert.ts")),
    Hebel(name="H26 animate_glb (vereinheitlichter Dispatcher)", klasse="3D/Anim", check=lambda: _check_animate_glb()),
    Hebel(name="H27 anim_library resolve/search (Quell-Aufloeser)", klasse="3D/Anim", check=lambda: _check_anim_library_resolve()),
    Hebel(name="H31 convert_for_accurig (FBX v7700 -> v7400 fuer AccuRIG)", klasse="3D/Konvertierung", active=False, check=lambda: _check_convert_for_accurig(), skip_key="accurig-bpy"),
]


def _tsx_run(rel: str, timeout: int = 90) -> tuple[bool, str]:
    target = ROOT / rel
    if not target.exists():
        return False, f"{rel} fehlt"
    try:
        p = subprocess.run(["npx", "tsx", rel], cwd=ROOT, capture_output=True, text=True, timeout=timeout)
        out = (p.stdout or p.stderr).strip().splitlines()
        return p.returncode == 0, (out[-1] if out else f"exit {p.returncode}")
    except Exception as exc:
        return False, f"tsx-Fehler: {exc.__class__.__name__}: {exc}"


def _kb_schema_check() -> tuple[bool, str]:
    try:
        import json as _json
        import jsonschema
        schema = _json.loads((ROOT / "game/data/knockback_config.schema.json").read_text(encoding="utf-8"))
        good = _json.loads((ROOT / "tools/fixtures/kb_config_good.json").read_text(encoding="utf-8"))
        bad = _json.loads((ROOT / "tools/fixtures/kb_config_bad.json").read_text(encoding="utf-8"))
        jsonschema.validate(good, schema)
        try:
            jsonschema.validate(bad, schema)
            return False, "bad-Fixture faelschlich akzeptiert"
        except jsonschema.ValidationError:
            return True, "good akzeptiert, bad abgelehnt"
    except Exception as exc:
        return False, f"{exc.__class__.__name__}: {exc}"


def _kb_spatial_reuse() -> tuple[bool, str]:
    sg = ROOT / "src/systems/spatial_grid.ts"
    ks = ROOT / "src/systems/knockback/knockback_system.ts"
    if not sg.exists():
        return False, "spatial_grid.ts fehlt"
    if not ks.exists() or "spatial_grid" not in ks.read_text(encoding="utf-8"):
        return False, "knockback_system nutzt spatial_grid nicht"
    return True, "spatial_grid wiederverwendet (kein SpatialHash-Duplikat)"


def _kb_debug_html() -> tuple[bool, str]:
    html = ROOT / "src/systems/knockback/knockback_debug.html"
    if not html.exists():
        return False, "knockback_debug.html fehlt"
    txt = html.read_text(encoding="utf-8")
    if "<canvas" in txt and "__kbDebugReady" in txt:
        return True, "canvas + __kbDebugReady vorhanden"
    return False, "canvas/__kbDebugReady fehlt"


def _check_florilegium_validate() -> tuple[bool, str]:
    schema = ROOT / "data" / "florilegium" / "schema.json"
    if not schema.is_file():
        return False, f"schema.json fehlt: {schema.relative_to(ROOT)}"
    try:
        import json as _json
        _json.loads(schema.read_text(encoding="utf-8"))
    except Exception as e:
        return False, f"schema.json kaputt: {e.__class__.__name__}: {e}"
    script = ROOT / "tools" / "florilegium_validate.py"
    if not script.is_file():
        return False, "tools/florilegium_validate.py fehlt"
    p = subprocess.run([sys.executable, str(script)], capture_output=True, text=True, timeout=60)
    if p.returncode != 0:
        first = (p.stdout or p.stderr).strip().splitlines()
        tail = first[-1] if first else "kein Output"
        return False, f"validate exit {p.returncode}: {tail[:120]}"
    return True, "schema parsbar + validate Exit 0 gegen data/florilegium/de/"


def _check_florilegium_voice() -> tuple[bool, str]:
    key = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    voice = os.environ.get("HELLMUTH_VOICE_ID", "").strip()
    if not key:
        return False, "ELEVENLABS_API_KEY nicht gesetzt"
    if not voice:
        return False, "HELLMUTH_VOICE_ID nicht gesetzt"
    script = ROOT / "tools" / "florilegium_voice.py"
    if not script.is_file():
        return False, "tools/florilegium_voice.py fehlt"
    target = ROOT / "data" / "florilegium" / "de"
    if not target.exists():
        return True, "Env ok, kein Inhalt zum Trockenlauf"
    p = subprocess.run([sys.executable, str(script), "--dry-run", str(target)], capture_output=True, text=True, timeout=30)
    if p.returncode != 0:
        tail = (p.stdout + p.stderr).strip().splitlines()[-1:] or ["kein Output"]
        return False, f"dry-run exit {p.returncode}: {tail[0][:120]}"
    return True, "Env ok + dry-run Exit 0"


def _check_florilegium_ui() -> tuple[bool, str]:
    js = ROOT / "tools" / "florilegium_ui_browser.mjs"
    py = ROOT / "tools" / "florilegium_ui_check.py"
    if not js.is_file():
        return False, "tools/florilegium_ui_browser.mjs fehlt"
    if not py.is_file():
        return False, "tools/florilegium_ui_check.py fehlt"
    if not shutil.which("npx"):
        return False, "npx nicht im PATH"
    if not (ROOT / "dist").is_dir():
        return False, "dist/ fehlt (npm run build vorab)"
    return True, "Skripte + npx + dist/ vorhanden"


def _check_menu_ui() -> tuple[bool, str]:
    js = ROOT / "tools" / "menu_ui_browser.mjs"
    py = ROOT / "tools" / "menu_ui_check.py"
    maps = ROOT / "data" / "maps" / "index.json"
    if not js.is_file():
        return False, "tools/menu_ui_browser.mjs fehlt"
    if not py.is_file():
        return False, "tools/menu_ui_check.py fehlt"
    if not maps.is_file():
        return False, "data/maps/index.json fehlt"
    if not shutil.which("npx"):
        return False, "npx nicht im PATH"
    if not (ROOT / "dist").is_dir():
        return False, "dist/ fehlt (npm run build vorab)"
    return True, "Skripte + maps + npx + dist/ vorhanden"


def _roundtrip_glb_validate() -> tuple[bool, str]:
    sys.path.insert(0, str(ROOT / "tools"))
    glb = ROOT / "proof3d" / "public" / "models" / "hellmuth.glb"
    if not glb.exists():
        return True, "kein Test-GLB im Repo (skip-pass)"
    try:
        from glb_validate import validate
    except Exception as exc:
        return False, f"import glb_validate: {exc.__class__.__name__}: {exc}"
    try:
        rep = validate(glb, min_tris=1, max_tris=10_000_000)
    except Exception as exc:
        return False, f"validate() crash: {exc.__class__.__name__}: {exc}"
    return True, (f"glb_validate lief ueber {glb.name}: {rep.triangle_count} Tris, passed={rep.passed}")


def _check_auto_rig_skeleton() -> tuple[bool, str]:
    template = ROOT / "tools" / "animations" / "templates" / "humanoid_template.glb"
    if not template.exists():
        return False, (f"Skelett-Template fehlt: {template} (Ticro: einmaliges Setup, siehe README dort)")
    try:
        import bpy
        return True, f"bpy {bpy.app.version_string}, Template vorhanden"
    except Exception as exc:
        return False, f"bpy: {exc.__class__.__name__}: {exc}"


def _check_retarget_smoke() -> tuple[bool, str]:
    try:
        sys.path.insert(0, str(ROOT / "tools"))
        from retarget_animation import retarget_with_bpy  # noqa: F401
        return True, "retarget_animation importierbar"
    except Exception as exc:
        return False, f"import retarget_animation: {exc.__class__.__name__}: {exc}"


def _check_render_iso_importable() -> tuple[bool, str]:
    script = ROOT / "tools" / "render_iso_sheet.py"
    if not script.is_file():
        return False, "tools/render_iso_sheet.py fehlt"
    return True, "render_iso_sheet.py vorhanden (bpy-basierter Lauf ausserhalb ci-fast)"


def _check_animate_glb() -> tuple[bool, str]:
    try:
        import importlib.util
        spec = importlib.util.spec_from_file_location("animate_glb", ROOT / "tools" / "animate_glb.py")
        if spec is None or spec.loader is None:
            return False, "kein Loader fuer animate_glb"
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
    except Exception as exc:
        return False, f"import animate_glb: {exc.__class__.__name__}: {exc}"
    n = len(mod.RETARGET_TYPES) + len(mod.PROCEDURAL_TYPES)
    if n == 0:
        return False, "Dispatch-Tabellen leer"
    return True, f"animate_glb importierbar, {n} anim-types (retarget+prozedural)"


def _check_convert_for_accurig() -> tuple[bool, str]:
    script = ROOT / "tools" / "convert_for_accurig.py"
    if not script.is_file():
        return False, "tools/convert_for_accurig.py fehlt"
    return True, "convert_for_accurig.py vorhanden (bpy-basierter Lauf ausserhalb ci-fast)"


def _check_anim_library_resolve() -> tuple[bool, str]:
    try:
        sys.path.insert(0, str(ROOT / "tools" / "animations"))
        import anim_library
        p = anim_library.resolve("walk", family="humanoid")
        n = len(anim_library.search("humanoid"))
    except Exception as exc:
        return False, f"anim_library: {exc.__class__.__name__}: {exc}"
    if p is None:
        return False, "resolve('walk', humanoid) -> None (procedural-Clips fehlen?)"
    return True, f"resolve walk -> {p.name}, search humanoid -> {n} Treffer"


def _load_skips() -> set[str]:
    if not SKIP_FILE.exists():
        return set()
    return {line.strip() for line in SKIP_FILE.read_text(encoding="utf-8").splitlines() if line.strip() and not line.strip().startswith("#")}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--install", action="store_true", help="fehlende Werkzeuge per pip / GitHub-Release nachziehen")
    ap.add_argument("--json", action="store_true", help="Maschinen-lesbare Ausgabe für CI")
    ap.add_argument("--ci", action="store_true", help="CI-Modus: FAIL nur auf ACTIVE-Hebeln (siehe docs/WERKZEUGE.md). RESERVED-Eintraege (active=False) gelten als RESERVED-OPTIONAL und brechen den Build nicht.")
    args = ap.parse_args()

    skips = _load_skips()
    rows: list[tuple[str, str, str, str, bool]] = []
    fails_active = 0
    fails_reserved = 0

    for h in HEBEL:
        ok, detail = h.check()
        if not ok and args.install and h.install is not None:
            iok, idetail = h.install()
            if iok:
                ok, detail = h.check()
                detail = f"installiert → {detail}"
            else:
                detail = f"install fehlgeschlagen: {idetail}"
        if ok:
            state = "PASS"
        elif h.skip_key and h.skip_key in skips:
            state = "SKIP"
            detail = f"übersprungen via .werkzeuge_skip ({h.skip_key}): {detail}"
        elif not h.active:
            state = "RESERVED"
            fails_reserved += 1
        else:
            state = "FAIL"
            fails_active += 1
        rows.append((state, h.name, h.klasse, detail, h.active))

    width = max(len(r[1]) for r in rows)
    print(f"{'STATE':9}  {'WERKZEUG':<{width}}  KLASSE          DETAIL")
    print("-" * (9 + 2 + width + 2 + 16 + 2 + 40))
    for state, name, klasse, detail, active in rows:
        color = {"PASS": "\033[32m", "FAIL": "\033[31m", "SKIP": "\033[33m", "RESERVED": "\033[90m"}.get(state, "")
        reset = "\033[0m" if color else ""
        tag = "" if active else " [RES]"
        print(f"{color}{state:9}{reset}  {name+tag:<{width}}  {klasse:<14}  {detail}")
    print()
    actives = [r for r in rows if r[4]]
    pass_active = sum(1 for r in actives if r[0] == "PASS")
    pass_total = sum(1 for r in rows if r[0] == "PASS")
    print(f"ACTIVE:    PASS {pass_active}/{len(actives)}   FAIL {fails_active}   SKIP {sum(1 for r in actives if r[0] == 'SKIP')}")
    print(f"RESERVED:  PASS {pass_total - pass_active}/{len(rows) - len(actives)} (OPTIONAL, kein Stopp-Signal)")

    if args.ci:
        if fails_active > 0:
            print(f"\nCI: ROT — {fails_active} ACTIVE-Werkzeug(e) fehlen. Manifest docs/WERKZEUGE.md verletzt.")
            return 1
        print(f"\nCI: GRUEN — alle {len(actives)} ACTIVE-Werkzeuge im Container.")
        return 0
    if fails_active or fails_reserved:
        print("Container-Doktrin (`docs/WERKZEUGE.md` + CONTAINER-WERKZEUGE-2.md) ist unvollstaendig.")
        print("Reparatur:  python3 tools/werkzeuge_check.py --install")
        return 1
    print("Welle 1+2+3 vollstaendig im Container verdrahtet.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
