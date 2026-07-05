#!/usr/bin/env python3
"""convert_for_accurig.py — Format-Konverter fuer Reallusion AccuRIG.

Werkzeug 31 / Hebel H31 (H28-H30 = Bild-/Tiles-Welle, parallel). bpy 4.2.0 (H4b),
headless. Nimmt eine 3D-Datei
(FBX / OBJ / GLB / GLTF), spuckt eine FBX-Datei aus, die AccuRIG frisst:
FBX-SDK v7400 (Blender-Standard-Export, entspricht "FBX 2014" im
Reallusion-Sprachgebrauch), Binary, EIN Mesh, embedded Textures, Skalierung
angewendet, FBX-Achsen-Konvention.

Ursache des AccuRIG-Fehlers 'This file type is not allowed' ist in aller Regel
die FBX-Version: KREA exportiert v7700 (FBX 2020), AccuRIG akzeptiert 2018 oder
aelter. Der Blender-Roundtrip normalisiert die Version zwangslaeufig auf v7400,
plus die Aufraeumarbeit unten.

Aufruf (bpy-Modul ODER blender-Binary):

  python3 tools/convert_for_accurig.py -- <input>
  python3 tools/convert_for_accurig.py -- <input> --out-dir <dir>
  python3 tools/convert_for_accurig.py -- --batch <input-dir>

Output-Basename: <input-stem>_accurig.fbx im --out-dir (Default:
assets/converted_for_accurig/).

Exit-Codes:
  0 ok
  2 Eingabe fehlt / falsches Format
  3 Import scheiterte (Blender/bpy Fehlermeldung im Log)
  4 kein Mesh gefunden
  5 Polycount ueber 600 000 Tris und Decimate nicht moeglich
  6 Export scheiterte
"""
from __future__ import annotations

import os
import sys
from pathlib import Path


def _argv() -> list[str]:
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]


import bpy  # noqa: E402

# AccuRIG-Grenze laut Reallusion-Handbuch (Auftrag §"AccuRIG-Anforderungen").
MAX_TRIS = 600_000
# Reihenfolge der Endungen -> Import-Operator
IMPORTERS = {
    ".fbx":  lambda p: bpy.ops.import_scene.fbx(filepath=str(p)),
    ".obj":  lambda p: bpy.ops.wm.obj_import(filepath=str(p)),
    ".glb":  lambda p: bpy.ops.import_scene.gltf(filepath=str(p)),
    ".gltf": lambda p: bpy.ops.import_scene.gltf(filepath=str(p)),
}
EXIT_OK, EXIT_BAD_INPUT, EXIT_IMPORT = 0, 2, 3
EXIT_NO_MESH, EXIT_TOO_MANY_TRIS, EXIT_EXPORT = 4, 5, 6


def _reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def _import(inp: Path) -> bool:
    ext = inp.suffix.lower()
    if ext not in IMPORTERS:
        print(f"FAIL: Format {ext!r} nicht unterstuetzt "
              f"(erwartet: {', '.join(IMPORTERS)})", file=sys.stderr)
        return False
    try:
        IMPORTERS[ext](inp)
    except Exception as exc:
        print(f"FAIL: Import {inp.name}: {exc.__class__.__name__}: {exc}",
              file=sys.stderr)
        return False
    return True


def _cleanup_to_single_mesh() -> tuple[list, list[str]]:
    """Loescht Kameras/Lampen/Empties/Armatures. Wenn >1 Mesh: joinen (Standard),
    Warnung mit Namen protokollieren. Rueckgabe: (meshes_am_ende, warnungen)."""
    warns: list[str] = []
    # Nicht-Mesh loeschen
    to_del = [o for o in bpy.data.objects if o.type != "MESH"]
    if to_del:
        types = {}
        for o in to_del:
            types[o.type] = types.get(o.type, 0) + 1
        warns.append(f"cleanup entfernt: {dict(sorted(types.items()))}")
        bpy.ops.object.select_all(action="DESELECT")
        for o in to_del:
            o.select_set(True)
        bpy.ops.object.delete()

    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    if len(meshes) > 1:
        # Standard-Verhalten laut Auftrag: joinen. Groesste Mesh wird active.
        biggest = max(meshes, key=lambda o: len(o.data.vertices))
        warns.append(
            f"multi-mesh {len(meshes)} -> joined; "
            f"active={biggest.name} (largest, "
            f"{len(biggest.data.vertices)} verts)"
        )
        bpy.ops.object.select_all(action="DESELECT")
        for m in meshes:
            m.select_set(True)
        bpy.context.view_layer.objects.active = biggest
        bpy.ops.object.join()
        meshes = [biggest]
    return meshes, warns


def _apply_transform(obj) -> None:
    """Skalierung/Rotation/Location auf das Mesh backen (AccuRIG erwartet
    identity-Transform). Kein Umposen des Rigs -- Rig ist zu diesem Zeitpunkt
    schon geloescht (nur Mesh)."""
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def _tri_count(obj) -> int:
    # jede Face traegt (loop_total - 2) Triangles nach Fan-Triangulation
    return sum(max(0, p.loop_total - 2) for p in obj.data.polygons)


def _decimate_if_needed(obj, warns: list[str]) -> bool:
    tris = _tri_count(obj)
    if tris <= MAX_TRIS:
        warns.append(f"tris={tris} <= {MAX_TRIS}, no decimate")
        return True
    ratio = MAX_TRIS / tris
    warns.append(f"tris={tris} > {MAX_TRIS}, decimate ratio={ratio:.4f}")
    bpy.context.view_layer.objects.active = obj
    mod = obj.modifiers.new("AccuRIG_Decimate", "DECIMATE")
    mod.ratio = ratio
    try:
        bpy.ops.object.modifier_apply(modifier=mod.name)
    except Exception as exc:
        warns.append(f"decimate apply failed: {exc.__class__.__name__}: {exc}")
        return False
    new_tris = _tri_count(obj)
    warns.append(f"after decimate: tris={new_tris}")
    return new_tris <= MAX_TRIS


def _export(out_path: Path, warns: list[str]) -> bool:
    """FBX 2014 (v7400) Binary, embed textures, apply-all-scale, Y-forward,
    Z-up laut Blender-Konvention (die vom FBX-Exporter in FBX-Y-up konvertiert
    wird -- axis_forward='-Z', axis_up='Y' spiegelt genau das)."""
    try:
        bpy.ops.export_scene.fbx(
            filepath=str(out_path),
            check_existing=False,
            use_selection=False,
            use_active_collection=False,
            apply_unit_scale=True,
            apply_scale_options="FBX_SCALE_ALL",
            bake_space_transform=True,
            object_types={"MESH"},
            use_mesh_modifiers=True,
            mesh_smooth_type="FACE",
            add_leaf_bones=False,
            path_mode="COPY",
            embed_textures=True,
            axis_forward="-Z",
            axis_up="Y",
        )
    except Exception as exc:
        warns.append(f"export failed: {exc.__class__.__name__}: {exc}")
        return False
    return True


def convert_one(inp: Path, out_dir: Path) -> tuple[int, dict]:
    """Konvertiert eine Datei. Rueckgabe (exit_code, meta)."""
    if not inp.exists():
        return EXIT_BAD_INPUT, {"error": f"Eingabe fehlt: {inp}"}

    _reset_scene()
    if not _import(inp):
        return EXIT_IMPORT, {"error": f"Import scheiterte: {inp.name}"}

    meshes, warns = _cleanup_to_single_mesh()
    if not meshes:
        return EXIT_NO_MESH, {"error": "kein Mesh in der Datei", "warns": warns}

    _apply_transform(meshes[0])
    if not _decimate_if_needed(meshes[0], warns):
        return EXIT_TOO_MANY_TRIS, {"error": "Decimate scheiterte", "warns": warns}

    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{inp.stem}_accurig.fbx"
    if not _export(out_path, warns):
        return EXIT_EXPORT, {"error": "FBX-Export scheiterte", "warns": warns,
                             "target": str(out_path)}

    return EXIT_OK, {
        "input": str(inp), "output": str(out_path),
        "size_bytes": out_path.stat().st_size,
        "warns": warns,
    }


def main() -> int:
    import argparse
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input", nargs="?",
                    help="Eingabe-Datei (FBX/OBJ/GLB/GLTF).")
    ap.add_argument("--batch", default=None,
                    help="Ordner-Modus: alle unterstuetzten Dateien darin "
                         "konvertieren.")
    ap.add_argument("--out-dir", default="assets/converted_for_accurig",
                    help="Ausgabe-Ordner (Default: %(default)s).")
    args = ap.parse_args(_argv())

    if not args.input and not args.batch:
        ap.print_usage(sys.stderr)
        print("FAIL: entweder <input> oder --batch <dir> angeben.",
              file=sys.stderr)
        return EXIT_BAD_INPUT

    out_dir = Path(args.out_dir)
    files: list[Path] = []
    if args.batch:
        d = Path(args.batch)
        if not d.is_dir():
            print(f"FAIL: --batch-Ordner fehlt: {d}", file=sys.stderr)
            return EXIT_BAD_INPUT
        for p in sorted(d.iterdir()):
            if p.is_file() and p.suffix.lower() in IMPORTERS:
                files.append(p)
        if not files:
            print(f"(keine unterstuetzten Dateien in {d}: "
                  f"{', '.join(IMPORTERS)})", file=sys.stderr)
            return EXIT_BAD_INPUT
    else:
        files.append(Path(args.input))

    n_ok, n_fail = 0, 0
    for f in files:
        rc, meta = convert_one(f, out_dir)
        if rc == EXIT_OK:
            print(f"OK  {f.name} -> {meta['output']} "
                  f"({meta['size_bytes'] // 1024} KB)")
            for w in meta["warns"]:
                print(f"    - {w}")
            n_ok += 1
        else:
            print(f"FAIL[{rc}]  {f.name}: {meta.get('error','?')}",
                  file=sys.stderr)
            for w in meta.get("warns", []):
                print(f"    - {w}", file=sys.stderr)
            n_fail += 1

    if len(files) > 1:
        print(f"\nSammel: {n_ok} ok, {n_fail} fail von {len(files)}.")
    return EXIT_OK if n_fail == 0 else EXIT_EXPORT


if __name__ == "__main__":
    sys.exit(main())
