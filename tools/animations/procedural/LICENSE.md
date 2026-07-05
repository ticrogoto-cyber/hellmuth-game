# Prozedurale Animations-Clips — Lizenz

## Eigenwerk (HELLMUTH / Ticro Goto) — MIT

Die GLB-Clips in diesem Ordner sind **vollständig prozedural erzeugt** durch
`procedural_anim.py` (Sinus-/Phasenversatz-Kurven, eigene Skelette + Primitiv-
Meshes). **Keine Drittquellen-Mocap-Daten** flossen ein.

Damit: **uneingeschränkt kommerziell Steam-tauglich, keine Fremd-Klausel,
keine Attribution nötig.** Eigentum bleibt bei Ticro Goto.

Reproduzierbar: `python3 procedural_anim.py -- --out .` regeneriert alle Clips
deterministisch (kein RNG). Die `.glb` sind als Build-Eingang eingecheckt, damit
die Pipeline ohne Blender-Lauf weiterläuft, aber jederzeit neu erzeugbar.

| Clip | Archetyp | Mechanik | Loop |
|---|---|---|---|
| `humanoid_idle` | bipede | Atem-Sinus (Spine, Head) + Mini-Hüft-Bob | ja (1 s) |
| `humanoid_walk` | bipede | Bein-Pendel + Arm-Counter-Swing + Hüft-Sway | ja (1 s) |
| `humanoid_attack` | bipede | Wind-up (0–0.3 s) → Schlag (0.3–0.5 s) → Recovery | nein (1 s) |
| `humanoid_death` | bipede | Treffer → Knie geben nach → Endpose | nein (1 s) |
| `drone_hover` | Drohne | Körper-Bob (sin z) + 4 Rotoren Dauerrotation | ja (1 s) |
| `insect_scurry` | Insekt | 6 Beine, Tripod-Gangart (Phase 0/0.5) | ja (1 s) |
| `plant_sway` | Pflanze | 4-Segment-Stamm, Schaukel-Sinus, nach oben stärker | ja (1 s) |
| `plant_grow` | Pflanze | Scale-in 0.1→1.0 (Wachstum) | nein (1 s) |
| `hover_idle` | generisch | minimaler Schwebe-Idle | ja (1 s) |
