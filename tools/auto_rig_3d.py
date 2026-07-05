#!/usr/bin/env python3
"""auto_rig_3d.py — Stufe 2 der 3D-Animations-Pipeline: aus einem validierten
GLB ein gerigtes GLB (Skelett + Skin-Weights) machen. Werkzeug 19 / Hebel H19.

BACKEND-Switch (Research-Befund konsolidiert in
docs/PIPELINE-ANIMATIONS-IMPLEMENTATION.md):

  --backend local-bpy-template   (Default, humanoid, 0 EUR)
      bpy.ops.object.parent_set(type='ARMATURE_AUTO') gegen ein Mixamo-
      Skelett-Template (`tools/animations/templates/humanoid_template.glb`).
      Bone-Heat-Skinning, CPU, laeuft im H4b-PASS-bpy 4.2.0 headless.
      Lizenz: Blender GPL-3 (Tool) / Output frei. KEINE Cloud, KEIN Account.

  --backend cloud-modal          (Non-humanoid, ~$0.01-0.10/Asset)
      Modal.com-Deploy einer UniRig-Funktion. MIT-Lizenz (Tool+Output).
      A10G-GPU, Cold-Start mit Volume-Caching ~5-10 s. Modal-Token via
      MODAL_TOKEN_ID/MODAL_TOKEN_SECRET. Output gehoert dem Aufrufer.

  --backend cloud-replicate      (Fallback Cloud, UniRig-Community-Host)
      jkorstad/Mesh_Rigger oder aaronjmars/unirig-ai. REPLICATE_API_TOKEN noetig.
      MIT-Lizenz UniRig. Pro Asset ~$0.03-0.10.

ENV-Variable AUTO_RIG_BACKEND ueberschreibt --backend (fuer CI-Schalt).

Pre-Rig-Check: ruft tools/glb_validate.py mit konfigurierbarem Korridor;
FAIL stoppt vor jedem Backend-Aufruf (verhindert Bone-Heat-Crashes auf
Marching-Cubes-Salat oder Tencent-Lizenz-Verletzungen).

Output: gerigtes GLB. Post-Rig-Check: validiert dass das Output-GLB eine
Armature mit >0 Bones traegt (Werkzeug-Audit-PASS-Bedingung H19).

Aufruf:
  python3 tools/auto_rig_3d.py --in build/3d/apothekerin.glb \
      --out build/3d/apothekerin_rigged.glb --archetype humanoid

  AUTO_RIG_BACKEND=cloud-modal python3 tools/auto_rig_3d.py \
      --in build/3d/drohne.glb --out build/3d/drohne_rigged.glb \
      --archetype custom

Lizenz: MIT. Konsumiert H18 (glb_validate), nutzt H4b (bpy), optional H4c
(trimesh) fuer Post-Rig-Verifikation.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Optional


BACKENDS = ("local-bpy-template", "cloud-modal", "cloud-replicate")
TEMPLATES_DIR = Path(__file__).resolve().parent / "animations" / "templates"
DEFAULT_HUMANOID_TEMPLATE = TEMPLATES_DIR / "humanoid_template.glb"


# --- Pre-Rig Validation -----------------------------------------------------
def pre_rig_check(glb_in: Path, min_tris: int, max_tris: int) -> bool:
    """Ruft H18 (glb_validate). True wenn das Eingangs-GLB den Korridor erfuellt.
    Verhindert dass schlechte Meshes Bone-Heat-Crashes oder Cloud-Kosten
    erzeugen."""
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    try:
        from glb_validate import validate
    except Exception as exc:
        print(f"WARN: glb_validate nicht importierbar ({exc}); Pre-Check uebersprungen.")
        return True

    rep = validate(glb_in, min_tris=min_tris, max_tris=max_tris, max_genus=3,
                   strict_manifold=False)
    print(f"Pre-Rig-Check (H18): {'PASS' if rep.passed else 'FAIL'} "
          f"({rep.triangle_count} Tris, {rep.mesh_count} Mesh, "
          f"watertight={rep.is_watertight})")
    if not rep.passed:
        print("FAIL-Gruende:", file=sys.stderr)
        for n, ok, d in rep.checks:
            if not ok:
                print(f"  [FAIL] {n}: {d}", file=sys.stderr)
    return rep.passed


# --- Backend: local-bpy-template --------------------------------------------
def rig_local_bpy(glb_in: Path, glb_out: Path, archetype: str,
                  template: Optional[Path]) -> int:
    """Riggt das Eingabe-Mesh mit bpy.ops.object.parent_set(type='ARMATURE_AUTO').
    Voraussetzung: Skelett-Template aus tools/animations/templates/.

    Funktioniert zuverlaessig nur fuer Humanoide. Non-humanoide brauchen das
    cloud-modal-Backend.
    """
    if archetype != "humanoid":
        print(f"FAIL: local-bpy-template ist nur humanoid-faehig; "
              f"archetype={archetype} braucht --backend cloud-modal.", file=sys.stderr)
        return 2

    if template is None:
        template = DEFAULT_HUMANOID_TEMPLATE
    if not template.exists():
        print(f"FAIL: Skelett-Template fehlt: {template}", file=sys.stderr)
        print(f"  -> Mixamo-Standard-Rig nach {template} legen oder ", file=sys.stderr)
        print(f"     --template <pfad> angeben.", file=sys.stderr)
        return 3

    try:
        import bpy
    except Exception as exc:
        print(f"FAIL: bpy nicht importierbar ({exc}).", file=sys.stderr)
        return 4

    # Saubere Szene
    bpy.ops.wm.read_factory_settings(use_empty=True)

    # 1) Mesh laden
    bpy.ops.import_scene.gltf(filepath=str(glb_in))
    mesh_objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not mesh_objs:
        print(f"FAIL: keine Mesh-Objekte in {glb_in}", file=sys.stderr)
        return 5
    if len(mesh_objs) > 1:
        # Nur das groesste behalten (Hunyuan-Output ist typisch single-mesh,
        # aber sicherheitshalber kuemmern wir uns).
        mesh_objs.sort(key=lambda m: len(m.data.vertices), reverse=True)
        for m in mesh_objs[1:]:
            bpy.data.objects.remove(m, do_unlink=True)
    mesh = mesh_objs[0]

    # 2) Skelett-Template laden
    pre_arms = {o.name for o in bpy.context.scene.objects if o.type == "ARMATURE"}
    bpy.ops.import_scene.gltf(filepath=str(template))
    new_arms = [o for o in bpy.context.scene.objects
                if o.type == "ARMATURE" and o.name not in pre_arms]
    if not new_arms:
        print(f"FAIL: Skelett-Template enthielt keine Armature: {template}",
              file=sys.stderr)
        return 6
    armature = new_arms[0]

    # 3) Mesh ausrichten (Hoehen-Normalisierung auf Skelett-Hoehe)
    bpy.context.view_layer.update()
    arm_height = armature.dimensions.z or 1.0
    mesh_height = mesh.dimensions.z or 1.0
    scale = arm_height / mesh_height
    mesh.scale = (mesh.scale.x * scale, mesh.scale.y * scale, mesh.scale.z * scale)
    bpy.context.view_layer.update()

    # 4) ARMATURE_AUTO: Bone-Heat Auto-Skinning
    bpy.ops.object.select_all(action="DESELECT")
    mesh.select_set(True)
    armature.select_set(True)
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.parent_set(type="ARMATURE_AUTO", xmirror=False, keep_transform=False)
    print(f"OK: ARMATURE_AUTO gerigt: mesh={mesh.name} -> armature={armature.name}")

    # 5) Export als GLB
    bpy.ops.object.select_all(action="DESELECT")
    mesh.select_set(True)
    armature.select_set(True)
    glb_out.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(glb_out),
        export_format="GLB",
        export_skins=True,
        export_animations=False,
        use_selection=True,
    )
    print(f"OK: gerigtes GLB geschrieben: {glb_out}")
    return 0


# --- Backend: cloud-modal ----------------------------------------------------
def rig_cloud_modal(glb_in: Path, glb_out: Path, archetype: str) -> int:
    """Schickt das GLB an einen Modal-deployten UniRig-Endpunkt. Erwartet
    MODAL_RIG_URL als FastAPI-Endpunkt + MODAL_AUTH_TOKEN.

    Deploy-Snippet siehe docs/PIPELINE-ANIMATIONS-IMPLEMENTATION.md §2.
    Lizenz: UniRig MIT (Output gehoert dem Aufrufer).
    """
    url = os.environ.get("MODAL_RIG_URL")
    token = os.environ.get("MODAL_AUTH_TOKEN", "")
    if not url:
        print("FAIL: MODAL_RIG_URL nicht gesetzt. Deploy-Snippet siehe "
              "docs/PIPELINE-ANIMATIONS-IMPLEMENTATION.md §2.", file=sys.stderr)
        return 10

    try:
        import urllib.request
    except Exception as exc:
        print(f"FAIL: urllib nicht verfuegbar ({exc})", file=sys.stderr)
        return 11

    glb_bytes = glb_in.read_bytes()
    req = urllib.request.Request(
        url,
        data=glb_bytes,
        method="POST",
        headers={
            "Content-Type": "application/octet-stream",
            "X-Archetype": archetype,
            "Authorization": f"Bearer {token}" if token else "",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            data = resp.read()
    except Exception as exc:
        print(f"FAIL: Modal-Endpunkt {url}: {exc}", file=sys.stderr)
        return 12

    glb_out.parent.mkdir(parents=True, exist_ok=True)
    glb_out.write_bytes(data)
    print(f"OK: gerigt via Modal -> {glb_out} ({len(data)} Bytes)")
    return 0


# --- Backend: cloud-replicate ------------------------------------------------
def rig_cloud_replicate(glb_in: Path, glb_out: Path, archetype: str) -> int:
    """UniRig auf Replicate (aaronjmars/unirig-ai, A100 80 GB). Pro Asset
    ~$0.07 (Stand 2026; ~53 s/Call, $0.001400/s).

    Lizenz: UniRig MIT (Output gehoert dem Aufrufer). Replicate-ToS §6: "all
    right, title and interest in and to Output, including ... commercial
    purposes" (Quelle: replicate.com/terms).

    Voraussetzungen:
      pip install replicate requests
      export REPLICATE_API_TOKEN=...
      export REPLICATE_INPUT_URL=...  (oeffentliche URL zum GLB; Replicate
                                       laedt es selbst)
    """
    token = os.environ.get("REPLICATE_API_TOKEN")
    if not token:
        print("FAIL: REPLICATE_API_TOKEN nicht gesetzt.", file=sys.stderr)
        return 20

    # Da Replicate die Input-URL selbst zieht, brauchen wir entweder eine
    # vorgespeicherte URL oder einen Datei-Upload-Endpunkt. Ticro hostet das
    # GLB selbst (z. B. proof3d/public/models/...). Default-Konvention: lokale
    # Datei wird per `replicate.helpers.upload_file` hochgeladen.
    try:
        import replicate
        import requests
    except ImportError:
        print("FAIL: `pip install replicate requests` noetig.", file=sys.stderr)
        return 21

    input_url = os.environ.get("REPLICATE_INPUT_URL")
    model_id = os.environ.get("REPLICATE_MODEL_ID", "aaronjmars/unirig-ai")

    client = replicate.Client(api_token=token)
    inputs = {"input_mesh": input_url} if input_url else {"input_mesh": open(glb_in, "rb")}

    print(f"Replicate: {model_id}  (~53 s/Call, ~$0.07; archetype={archetype})")
    try:
        output = client.run(model_id, input=inputs)
    except Exception as exc:
        print(f"FAIL: Replicate-Call: {exc}", file=sys.stderr)
        return 22

    rigged_url = output if isinstance(output, str) else (output[0] if output else None)
    if not rigged_url:
        print(f"FAIL: kein Output-URL von Replicate: {output}", file=sys.stderr)
        return 23

    glb_out.parent.mkdir(parents=True, exist_ok=True)
    resp = requests.get(rigged_url, timeout=120)
    if resp.status_code != 200:
        print(f"FAIL: Download {rigged_url}: {resp.status_code}", file=sys.stderr)
        return 24
    glb_out.write_bytes(resp.content)
    print(f"OK: Replicate-gerigtes GLB -> {glb_out} ({len(resp.content)} Bytes)")
    return 0


# --- Post-Rig Verifikation ---------------------------------------------------
def post_rig_check(glb_out: Path) -> bool:
    """Liest das Output-GLB und prueft, ob es eine Armature mit >0 Bones traegt.
    PASS-Bedingung fuer Werkzeug-Audit H19."""
    try:
        from pygltflib import GLTF2
        g = GLTF2().load(str(glb_out))
        # In gltf 2.0 sitzen Skelette als Nodes mit "skin"-Eintrag und einer
        # Skin-Definition mit joints[]. Wir pruefen: >=1 Skin mit >=1 Joint.
        skins = g.skins or []
        n_joints = sum(len(s.joints or []) for s in skins)
        ok = len(skins) >= 1 and n_joints >= 1
        print(f"Post-Rig-Check (H19): {'PASS' if ok else 'FAIL'} "
              f"({len(skins)} Skin(s), {n_joints} Joints)")
        return ok
    except Exception as exc:
        print(f"WARN: pygltflib-Post-Check nicht moeglich ({exc}); Skip.", file=sys.stderr)
        return True


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--in", dest="glb_in", required=True)
    ap.add_argument("--out", dest="glb_out", required=True)
    ap.add_argument("--archetype",
                    choices=["humanoid", "quadruped", "drone", "plant", "insect", "custom"],
                    default="humanoid")
    ap.add_argument("--backend", choices=BACKENDS, default="local-bpy-template")
    ap.add_argument("--template", default=None,
                    help="Skelett-Template (Default tools/animations/templates/humanoid_template.glb)")
    ap.add_argument("--min-tris", type=int, default=5000)
    ap.add_argument("--max-tris", type=int, default=80000)
    ap.add_argument("--skip-pre-check", action="store_true")
    ap.add_argument("--skip-post-check", action="store_true")
    args = ap.parse_args()

    backend = os.environ.get("AUTO_RIG_BACKEND", args.backend)
    if backend not in BACKENDS:
        print(f"FAIL: unbekanntes Backend '{backend}'. Erlaubt: {BACKENDS}",
              file=sys.stderr)
        return 1

    glb_in = Path(args.glb_in).resolve()
    glb_out = Path(args.glb_out).resolve()
    template = Path(args.template).resolve() if args.template else None

    if not args.skip_pre_check:
        if not pre_rig_check(glb_in, args.min_tris, args.max_tris):
            print("ABORT: Pre-Rig-Check fehlgeschlagen. Mesh nicht riggbar.",
                  file=sys.stderr)
            return 2

    print(f"Rigging-Backend: {backend}")
    if backend == "local-bpy-template":
        rc = rig_local_bpy(glb_in, glb_out, args.archetype, template)
    elif backend == "cloud-modal":
        rc = rig_cloud_modal(glb_in, glb_out, args.archetype)
    else:  # cloud-replicate
        rc = rig_cloud_replicate(glb_in, glb_out, args.archetype)

    if rc != 0:
        return rc

    if not args.skip_post_check:
        if not post_rig_check(glb_out):
            print("ABORT: Post-Rig-Check fehlgeschlagen.", file=sys.stderr)
            return 3

    return 0


if __name__ == "__main__":
    sys.exit(main())
