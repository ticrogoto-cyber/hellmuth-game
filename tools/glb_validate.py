#!/usr/bin/env python3
"""glb_validate.py — Eingangsvalidator fuer GLB-Dateien aus KREA-Hunyuan3D
(Stufe 1 der 3D-Animations-Pipeline). Werkzeug 18 / Hebel H18.

Prueft:
  * Datei existiert und ist nicht leer
  * Valides GLB (Header magic 'glTF' + Version 2)
  * Genau ein Mesh-Objekt (Hunyuan-Output ist single-mesh)
  * Triangle-Count im Korridor [--min-tris, --max-tris] (Default 5000-80000)
  * Vertex-Manifold (Watertight-Indikator, optional --strict)
  * Genus <= --max-genus (Default 3) — verhindert "Donuts" und gebrochene Topologie

Output: stdout-Bericht + Exit 0 (PASS) / 1 (FAIL). Optional --json fuer
maschinenlesbare Audit-Eintraege.

Aufruf:
  python3 tools/glb_validate.py path/to/model.glb
  python3 tools/glb_validate.py model.glb --min-tris 1000 --max-tris 50000 --json

Werkzeug-Audit (tools/werkzeuge_check.py, Hebel H18): Round-Trip-PASS-Test
gegen testdata/probe.glb. FAIL = harter Stopp vor dem Rigging-Schritt.

Lizenz: MIT. Eingebettetes Werkzeug, nutzt trimesh (H4c).
"""
from __future__ import annotations

import argparse
import json
import struct
import sys
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Optional


@dataclass
class ValidationReport:
    glb_path: str
    file_size_bytes: int = 0
    glb_version: Optional[int] = None
    mesh_count: int = 0
    primary_mesh_name: Optional[str] = None
    triangle_count: int = 0
    vertex_count: int = 0
    is_watertight: bool = False
    euler_number: Optional[int] = None
    genus: Optional[int] = None
    checks: list[tuple[str, bool, str]] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return all(ok for _, ok, _ in self.checks)


def _read_glb_header(path: Path) -> Optional[int]:
    """Liest den 12-Byte GLB-Header und gibt die Version zurueck, oder None
    wenn die Datei kein gueltiges GLB ist."""
    try:
        with open(path, "rb") as f:
            magic, version, _length = struct.unpack("<4sII", f.read(12))
    except (OSError, struct.error):
        return None
    if magic != b"glTF":
        return None
    return version


def validate(
    glb_path: Path,
    min_tris: int = 5000,
    max_tris: int = 80000,
    max_genus: int = 3,
    strict_manifold: bool = False,
) -> ValidationReport:
    """Fuehrt die volle Validierungskette aus und liefert einen Bericht.
    Saemtliche Pruefschritte landen in report.checks; report.passed
    aggregiert.

    Nicht-strikt: ein nicht-wasserdichtes Mesh ist nur eine Warnung
    (Hunyuan-Output ist oft offen am Boden); --strict macht es zum FAIL.
    """
    r = ValidationReport(glb_path=str(glb_path))

    # 1) Existenz + Groesse
    if not glb_path.exists():
        r.checks.append(("exists", False, f"Datei nicht gefunden: {glb_path}"))
        return r
    r.file_size_bytes = glb_path.stat().st_size
    if r.file_size_bytes == 0:
        r.checks.append(("non_empty", False, "Datei ist leer"))
        return r
    r.checks.append(("exists", True, f"{r.file_size_bytes} Bytes"))

    # 2) GLB-Header
    version = _read_glb_header(glb_path)
    if version is None:
        r.checks.append(("glb_header", False, "kein gueltiger GLB-Header"))
        return r
    r.glb_version = version
    r.checks.append(("glb_header", version == 2, f"glTF v{version}"))
    if version != 2:
        return r

    # 3) Mesh-Inhalt (trimesh)
    import trimesh

    try:
        scene_or_mesh = trimesh.load(glb_path, force="scene")
    except Exception as exc:
        r.checks.append(("load", False, f"trimesh.load failed: {exc.__class__.__name__}: {exc}"))
        return r

    meshes = []
    if isinstance(scene_or_mesh, trimesh.Scene):
        for name, geom in scene_or_mesh.geometry.items():
            if isinstance(geom, trimesh.Trimesh):
                meshes.append((name, geom))
    elif isinstance(scene_or_mesh, trimesh.Trimesh):
        meshes.append(("__root__", scene_or_mesh))

    r.mesh_count = len(meshes)
    mesh_count_ok = r.mesh_count == 1
    r.checks.append(("mesh_count_eq_1", mesh_count_ok, f"{r.mesh_count} Meshes (erwartet 1)"))
    if r.mesh_count == 0:
        return r

    # 4) Primary mesh
    name, mesh = meshes[0]
    r.primary_mesh_name = name
    r.triangle_count = int(mesh.faces.shape[0])
    r.vertex_count = int(mesh.vertices.shape[0])

    tri_ok = min_tris <= r.triangle_count <= max_tris
    r.checks.append(
        (
            "triangle_corridor",
            tri_ok,
            f"{r.triangle_count} Tris (Korridor [{min_tris}, {max_tris}])",
        )
    )

    # 5) Manifold-/Topologie-Pruefung (Euler + Genus)
    r.is_watertight = bool(mesh.is_watertight)
    # Genus = (2 - chi) / 2 fuer geschlossene Flaechen, wobei chi = V - E + F.
    # Bei offenen Meshes ist Genus nicht streng definiert; wir liefern den
    # Wert nur, wenn das Mesh wasserdicht ist, sonst None.
    if r.is_watertight:
        v = r.vertex_count
        e = int(mesh.edges_unique.shape[0])
        f = r.triangle_count
        r.euler_number = v - e + f
        r.genus = max(0, (2 - r.euler_number) // 2)
        genus_ok = r.genus <= max_genus
        r.checks.append(("genus", genus_ok, f"Genus {r.genus} (max {max_genus})"))
    else:
        # Nicht-wasserdicht: im Standardmodus Warnung (PASS), im strict Mode FAIL.
        r.checks.append(
            ("watertight", not strict_manifold, "Mesh nicht wasserdicht (offene Raender)")
        )

    return r


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("glb", help="GLB-Datei (z. B. aus KREA-Hunyuan3D-Export)")
    ap.add_argument("--min-tris", type=int, default=5000)
    ap.add_argument("--max-tris", type=int, default=80000)
    ap.add_argument("--max-genus", type=int, default=3)
    ap.add_argument("--strict", action="store_true",
                    help="Nicht-wasserdichte Meshes als FAIL werten")
    ap.add_argument("--json", action="store_true", help="JSON-Bericht statt Text")
    args = ap.parse_args()

    rep = validate(
        Path(args.glb),
        min_tris=args.min_tris,
        max_tris=args.max_tris,
        max_genus=args.max_genus,
        strict_manifold=args.strict,
    )

    if args.json:
        print(json.dumps(asdict(rep), indent=2))
    else:
        print(f"GLB-Validator (H18) — {rep.glb_path}")
        print(f"  Groesse:        {rep.file_size_bytes} Bytes")
        print(f"  glTF-Version:   {rep.glb_version}")
        print(f"  Mesh-Anzahl:    {rep.mesh_count}")
        print(f"  Primary Mesh:   {rep.primary_mesh_name}")
        print(f"  Triangles:      {rep.triangle_count}")
        print(f"  Vertices:       {rep.vertex_count}")
        print(f"  Watertight:     {rep.is_watertight}")
        if rep.euler_number is not None:
            print(f"  Euler chi:      {rep.euler_number}")
            print(f"  Genus:          {rep.genus}")
        print()
        for name, ok, detail in rep.checks:
            tag = "PASS" if ok else "FAIL"
            print(f"  [{tag}] {name:24s}  {detail}")
        print()
        print(f"Gesamt: {'PASS' if rep.passed else 'FAIL'}")

    return 0 if rep.passed else 1


if __name__ == "__main__":
    sys.exit(main())
