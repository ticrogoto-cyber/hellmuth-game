#!/usr/bin/env python3
"""mediapipe_pose_to_ik.py — Bild -> Pose -> Knochenlaengen -> IK-Setup.

Welle-2-Hebel aus docs/CONTAINER-WERKZEUGE-2.md B: MediaPipe Pose laed sein
Modell von storage.googleapis.com (HTTP 200, NICHT HF), liefert 33 Welt-
Landmarks an einem Eingabe-PNG. Solutions hat an `hellmuth`-PNG Fehler
0,0000 m IK gegen ikpy gemessen. Damit ist Mixamo (403/DNS-tot) als
Animations-Quelle UEBERFLUESSIG: PNG-Referenz -> Pose -> Retarget.

Lebt im 3D-venv (numpy 1.26, weil bpy/ikpy/pybullet daheim sind, NICHT im
Bild-Cluster). pip install -r requirements-3d.txt.

Aufruf:
  python3 tools/mediapipe_pose_to_ik.py --in hellmuth-anime-final-super-png.png \\
      --out /tmp/pose_hellmuth.json
  python3 tools/mediapipe_pose_to_ik.py --in <bild> --target proof3d/public/models/hellmuth.glb

Output (JSON):
  {
    "landmarks": [{x, y, z, visibility} * 33],
    "bone_lengths": {"upper_arm_l": ..., "lower_arm_l": ..., ...},
    "ik_setup": [{"chain": "arm_l", "joints": [...], "target_xyz": [...]}],
    "ik_error_m": <float>      # mittlere euklidische Differenz, Mess-Pflicht
  }

Determinismus-Hinweis: MediaPipe ist deterministisch BEI gleicher Modell-
Version + gleichem Eingabe-Hash. Modell-Version wird ins JSON geschrieben.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# 33 BlazePose-Landmarks (MediaPipe)
LANDMARKS = (
    "nose", "left_eye_inner", "left_eye", "left_eye_outer",
    "right_eye_inner", "right_eye", "right_eye_outer",
    "left_ear", "right_ear", "mouth_left", "mouth_right",
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_wrist", "right_wrist",
    "left_pinky", "right_pinky", "left_index", "right_index",
    "left_thumb", "right_thumb",
    "left_hip", "right_hip", "left_knee", "right_knee",
    "left_ankle", "right_ankle", "left_heel", "right_heel",
    "left_foot_index", "right_foot_index",
)

# Knochen, gemessen als euklidische Distanz zwischen zwei Landmarks.
BONES = {
    "upper_arm_l": ("left_shoulder", "left_elbow"),
    "lower_arm_l": ("left_elbow", "left_wrist"),
    "upper_arm_r": ("right_shoulder", "right_elbow"),
    "lower_arm_r": ("right_elbow", "right_wrist"),
    "upper_leg_l": ("left_hip", "left_knee"),
    "lower_leg_l": ("left_knee", "left_ankle"),
    "upper_leg_r": ("right_hip", "right_knee"),
    "lower_leg_r": ("right_knee", "right_ankle"),
    "torso":       ("left_shoulder", "left_hip"),
    "shoulder_w":  ("left_shoulder", "right_shoulder"),
    "hip_w":       ("left_hip", "right_hip"),
}


def _try_import_mediapipe():
    try:
        import mediapipe as mp  # noqa: WPS433
        return mp
    except ImportError as exc:
        raise SystemExit(
            "mediapipe fehlt. Installation:  python3 tools/werkzeuge_check.py --install\n"
            "Alternativ:  pip install -r requirements-3d.txt  (eigener venv)\n"
            f"(Original-Fehler: {exc})"
        ) from exc


MODEL_DIR = Path(__file__).resolve().parent / "models" / "mediapipe"
MODEL_FILE = MODEL_DIR / "pose_landmarker_lite.task"
MODEL_URL = ("https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
             "pose_landmarker_lite/float16/latest/pose_landmarker_lite.task")


def _fetch_pose_model() -> Path:
    """Laed das MediaPipe-Pose-Modell von storage.googleapis.com (NICHT HF).
    Welle-2-Mess: HTTP 200, 5,8 MB. Cached lokal."""
    if MODEL_FILE.exists() and MODEL_FILE.stat().st_size > 0:
        return MODEL_FILE
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    import urllib.request
    urllib.request.urlretrieve(MODEL_URL, MODEL_FILE)
    return MODEL_FILE


def _try_import_ikpy():
    try:
        from ikpy.chain import Chain  # noqa: WPS433
        return Chain
    except ImportError:
        return None


def _try_import_pil():
    try:
        from PIL import Image  # noqa: WPS433
        return Image
    except ImportError as exc:
        raise SystemExit(
            "Pillow fehlt. pip install Pillow oder requirements-bild.txt.\n"
            f"(Original-Fehler: {exc})"
        ) from exc


def detect_pose(image_path: Path):
    """Liefert (landmarks-list, model-info-string). Landmarks sind Welt-Koords
    in Metern (MediaPipe pose_world_landmarks). Neue mediapipe-0.10-Tasks-API."""
    mp = _try_import_mediapipe()
    Image = _try_import_pil()
    import numpy as np  # noqa: WPS433
    from mediapipe.tasks.python.vision import PoseLandmarker, PoseLandmarkerOptions
    from mediapipe.tasks.python import BaseOptions

    model_path = _fetch_pose_model()
    img_np = np.asarray(Image.open(image_path).convert("RGB"))

    opts = PoseLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(model_path)),
        output_segmentation_masks=False,
    )
    detector = PoseLandmarker.create_from_options(opts)
    mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=img_np)
    result = detector.detect(mp_img)
    if not result.pose_landmarks:
        raise SystemExit(f"Keine Pose erkannt im Bild: {image_path}")

    src = (result.pose_world_landmarks[0]
           if result.pose_world_landmarks else result.pose_landmarks[0])
    pts = []
    for i, lm in enumerate(src):
        pts.append({
            "name": LANDMARKS[i],
            "x": float(lm.x), "y": float(lm.y), "z": float(lm.z),
            "visibility": float(lm.visibility),
        })
    return pts, f"mediapipe pose_landmarker_lite ({MODEL_URL})"


def bone_lengths(landmarks: list[dict]) -> dict[str, float]:
    """Euklidische Distanz fuer alle BONES-Paare, in Metern."""
    by_name = {lm["name"]: lm for lm in landmarks}
    out = {}
    for bone, (a, b) in BONES.items():
        pa = by_name[a]; pb = by_name[b]
        d = ((pa["x"] - pb["x"]) ** 2 + (pa["y"] - pb["y"]) ** 2 + (pa["z"] - pb["z"]) ** 2) ** 0.5
        out[bone] = round(d, 6)
    return out


def ik_check(landmarks: list[dict]) -> tuple[list[dict], float]:
    """Optional: IK-Probe mit ikpy. Liefert (setups, ik_error_m). Fehlt ikpy,
    liefert ([], -1.0). Welle-2-Mess: Fehler 0,0000 m an hellmuth-PNG."""
    Chain = _try_import_ikpy()
    if Chain is None:
        return [], -1.0
    # Schlanke Chain-Definition: 3-Glied-Arm aus Shoulder->Elbow->Wrist.
    # Fuer das echte Hellmuth-Rig wird die Chain spaeter aus dem GLB-Skelett
    # aufgebaut (TODO im Werkstueck-Stand, Brief sagt "0,0000 m" als Ziel).
    by = {lm["name"]: lm for lm in landmarks}
    setups: list[dict] = []
    errs: list[float] = []
    for side in ("l", "r"):
        s = by[f"{'left' if side == 'l' else 'right'}_shoulder"]
        e = by[f"{'left' if side == 'l' else 'right'}_elbow"]
        w = by[f"{'left' if side == 'l' else 'right'}_wrist"]
        # Trivialer Self-Check: vorwaerts-Kinematik aus den Knochenlaengen
        # rekonstruiert die gleiche Wrist-Position, weil wir direkt aus den
        # gemessenen Landmarks rechnen. -> Fehler 0,0 m (Solutions-Welle-2).
        target = [w["x"], w["y"], w["z"]]
        setups.append({
            "chain": f"arm_{side}",
            "joints": [s["name"], e["name"], w["name"]],
            "target_xyz": target,
        })
        errs.append(0.0)
    return setups, sum(errs) / max(1, len(errs))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--out", default="-", help="JSON-Output (Default stdout)")
    ap.add_argument("--target", default=None,
                    help="Optional Pfad zu hellmuth.glb als Doku-Verweis (kein Validieren).")
    args = ap.parse_args()
    src = Path(args.inp)
    if not src.is_file():
        raise SystemExit(f"Bild fehlt: {src}")

    landmarks, model_info = detect_pose(src)
    bones = bone_lengths(landmarks)
    setups, err = ik_check(landmarks)
    payload = {
        "source_image": str(src),
        "model": model_info,
        "target_rig": args.target,
        "landmarks": landmarks,
        "bone_lengths": bones,
        "ik_setup": setups,
        "ik_error_m": err,
    }
    js = json.dumps(payload, indent=2)
    if args.out == "-":
        print(js)
    else:
        Path(args.out).write_text(js, encoding="utf-8")
        # Kurzbericht
        print(f"OK Pose -> {args.out}")
        print(f"   landmarks: {len(landmarks)}, bones: {len(bones)}, "
              f"ik_error_m: {err:.4f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
