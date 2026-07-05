#!/usr/bin/env python3
"""generate_unit_sprites.py — Programmatic unit sprite atlas generator.

Generates animated sprite atlases for all game units using Pillow.
Each atlas contains 4 clips x 8 directions x 8 frames = 256 frames at 128x128 px.
Output: PNG atlas + Phaser-compatible JSON descriptor.

Revision 2: Improved silhouettes per CODE3-REVISION feedback.
- HELLMUTH: distinctive robed silhouettes (basket, armor, scroll, apparatus, wings)
- MODERAT: corrected designs (6-leg mech, sphere-on-stilts, orbital drone, massive golem)
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw

# --- Configuration -----------------------------------------------------------
FRAME_SIZE = 128
FRAMES_PER_CLIP = 8
DIRECTIONS = 8
CLIPS = ["idle", "walk", "attack", "death"]
COLS = 16

# --- Faction Palettes --------------------------------------------------------
HELLMUTH_PALETTE = {
    "body": (240, 235, 220),       # warm white robe
    "accent": (232, 179, 58),       # messing gold
    "shadow": (180, 175, 160),      # robe shadow
    "trim": (90, 130, 80),          # moss green
    "glow": (255, 220, 100),        # golden glow
    "skin": (220, 195, 170),        # skin tone
}

MODERAT_PALETTE = {
    "body": (40, 32, 38),           # blackened steel
    "accent": (176, 24, 106),       # sirup magenta #B0186A
    "shadow": (26, 20, 24),         # deep shadow
    "trim": (120, 80, 50),          # rust
    "glow": (200, 30, 120),         # magenta glow
    "skin": (60, 50, 55),           # dark metal highlight
}

# --- Unit Definitions --------------------------------------------------------
UNITS = {
    # HELLMUTH faction
    "sammler": {
        "faction": "hellmuth",
        "shape": "robed_basket",
        "height_ratio": 0.7,
        "width_ratio": 0.38,
    },
    "destillateur": {
        "faction": "hellmuth",
        "shape": "robed_armored",
        "height_ratio": 0.75,
        "width_ratio": 0.4,
    },
    "apotheker": {
        "faction": "hellmuth",
        "shape": "robed_female",
        "height_ratio": 0.72,
        "width_ratio": 0.38,
    },
    "kurator": {
        "faction": "hellmuth",
        "shape": "robed_scholar",
        "height_ratio": 0.78,
        "width_ratio": 0.36,
    },
    "alchemist": {
        "faction": "hellmuth",
        "shape": "robed_apparatus",
        "height_ratio": 0.8,
        "width_ratio": 0.5,
    },
    "suchfalter": {
        "faction": "hellmuth",
        "shape": "butterfly_flyer",
        "height_ratio": 0.5,
        "width_ratio": 0.55,
    },
    # MODERAT faction
    "sirup_trupp": {
        "faction": "moderat",
        "shape": "sphere_bot",
        "height_ratio": 0.45,
        "width_ratio": 0.45,
    },
    "schleuderer": {
        "faction": "moderat",
        "shape": "tank_on_stilts",
        "height_ratio": 0.7,
        "width_ratio": 0.5,
    },
    "toxischer_nebler": {
        "faction": "moderat",
        "shape": "orbital_virus",
        "height_ratio": 0.55,
        "width_ratio": 0.55,
    },
    "rohrkanone": {
        "faction": "moderat",
        "shape": "six_leg_mech",
        "height_ratio": 0.6,
        "width_ratio": 0.72,
    },
    "stahlbrute": {
        "faction": "moderat",
        "shape": "massive_golem",
        "height_ratio": 0.88,
        "width_ratio": 0.6,
    },
}


def palette_for(faction: str) -> dict:
    return HELLMUTH_PALETTE if faction == "hellmuth" else MODERAT_PALETTE


def direction_angle(dir_idx: int) -> float:
    return dir_idx * (2 * math.pi / DIRECTIONS)


# =============================================================================
# HELLMUTH shapes — white-robed order with distinct silhouettes
# =============================================================================

def _robe_base(draw: ImageDraw.Draw, cx: float, cy: float, w: float, h: float,
               pal: dict, angle: float, frame_t: float, clip: str,
               waist_ratio: float = 0.5, skirt_ratio: float = 0.6):
    """Common robed figure base. Returns (head_cy, torso_top, base_y, dx)."""
    dx = math.sin(angle) * w * 0.07
    walk_bob = 0.0
    collapse = 0.0

    if clip == "walk":
        walk_bob = math.sin(frame_t * 2 * math.pi) * h * 0.025
    elif clip == "idle":
        walk_bob = math.sin(frame_t * 2 * math.pi * 0.5) * h * 0.008
    elif clip == "death":
        collapse = frame_t

    base_y = cy + h * 0.2 + walk_bob + collapse * h * 0.25

    # Robe skirt (triangular)
    skirt_w = w * skirt_ratio
    skirt_h = h * 0.38 * (1 - collapse * 0.4)
    skirt_top = base_y - h * 0.05
    pts = [
        (cx + dx - skirt_w * waist_ratio, skirt_top),
        (cx + dx + skirt_w * waist_ratio, skirt_top),
        (cx + dx + skirt_w * 0.5, skirt_top + skirt_h),
        (cx + dx - skirt_w * 0.5, skirt_top + skirt_h),
    ]
    draw.polygon(pts, fill=pal["body"], outline=pal["shadow"])

    # Torso (narrower ellipse above skirt)
    torso_h = h * 0.25
    torso_w = w * waist_ratio * 0.9
    torso_top = skirt_top - torso_h
    draw.ellipse([cx + dx - torso_w, torso_top,
                  cx + dx + torso_w, skirt_top],
                 fill=pal["body"], outline=pal["shadow"])

    # Head
    head_r = w * 0.14
    head_cy = torso_top - head_r * 0.6
    draw.ellipse([cx + dx - head_r, head_cy - head_r,
                  cx + dx + head_r, head_cy + head_r],
                 fill=pal["skin"], outline=pal["shadow"])

    # Gold circlet/halo
    halo_r = head_r * 1.3
    draw.arc([cx + dx - halo_r, head_cy - halo_r * 1.1,
              cx + dx + halo_r, head_cy - halo_r * 0.3],
             start=200, end=340, fill=pal["accent"], width=2)

    return head_cy, torso_top, base_y, dx, skirt_top


def draw_robed_basket(draw: ImageDraw.Draw, cx: float, cy: float,
                      w: float, h: float, pal: dict, angle: float,
                      frame_t: float, clip: str, features: list = None) -> None:
    """Sammler: simple robe with herb basket on back."""
    head_cy, torso_top, base_y, dx, skirt_top = _robe_base(
        draw, cx, cy, w, h, pal, angle, frame_t, clip, waist_ratio=0.45)

    # Arms carrying position
    arm_swing = 0.0
    if clip == "walk":
        arm_swing = math.sin(frame_t * 2 * math.pi) * w * 0.08
    elif clip == "attack":
        arm_swing = math.sin(frame_t * math.pi) * w * 0.15

    arm_y = torso_top + h * 0.12
    arm_w = max(2, int(w * 0.08))
    draw.line([(cx + dx - w * 0.2, arm_y),
               (cx + dx - w * 0.25 - arm_swing, arm_y + h * 0.15)],
              fill=pal["body"], width=arm_w)
    draw.line([(cx + dx + w * 0.2, arm_y),
               (cx + dx + w * 0.25 + arm_swing, arm_y + h * 0.15)],
              fill=pal["body"], width=arm_w)

    # Basket on back (visible based on direction)
    bk_x = cx + dx - math.sin(angle) * w * 0.25
    bk_y = torso_top + h * 0.05
    basket_w = w * 0.2
    basket_h = h * 0.15
    draw.rectangle([bk_x - basket_w / 2, bk_y,
                    bk_x + basket_w / 2, bk_y + basket_h],
                   fill=pal["trim"], outline=pal["accent"])
    # Herbs poking out
    for i in range(3):
        hx = bk_x - basket_w / 3 + i * basket_w / 3
        draw.line([(hx, bk_y), (hx, bk_y - h * 0.05)],
                  fill=pal["trim"], width=1)


def draw_robed_armored(draw: ImageDraw.Draw, cx: float, cy: float,
                       w: float, h: float, pal: dict, angle: float,
                       frame_t: float, clip: str, features: list = None) -> None:
    """Destillateur: robe with shoulder armor, ranged staff weapon."""
    head_cy, torso_top, base_y, dx, skirt_top = _robe_base(
        draw, cx, cy, w, h, pal, angle, frame_t, clip, waist_ratio=0.5)

    # Shoulder plates (gold)
    plate_sz = w * 0.14
    s_y = torso_top + h * 0.04
    draw.ellipse([cx + dx - w * 0.28 - plate_sz, s_y - plate_sz / 2,
                  cx + dx - w * 0.28 + plate_sz, s_y + plate_sz / 2],
                 fill=pal["accent"])
    draw.ellipse([cx + dx + w * 0.28 - plate_sz, s_y - plate_sz / 2,
                  cx + dx + w * 0.28 + plate_sz, s_y + plate_sz / 2],
                 fill=pal["accent"])

    # Staff weapon (always visible)
    staff_x = cx + dx + w * 0.3
    staff_top = head_cy - h * 0.1
    staff_bot = skirt_top + h * 0.2
    draw.line([(staff_x, staff_top), (staff_x, staff_bot)],
              fill=pal["trim"], width=max(2, int(w * 0.05)))

    # Glowing tip (attack intensifies)
    glow_r = w * 0.06
    if clip == "attack":
        glow_r *= 1.0 + math.sin(frame_t * math.pi) * 0.8
    draw.ellipse([staff_x - glow_r, staff_top - glow_r,
                  staff_x + glow_r, staff_top + glow_r],
                 fill=pal["glow"])

    # Belt with ammo pouches
    belt_y = skirt_top - h * 0.01
    draw.line([(cx + dx - w * 0.2, belt_y), (cx + dx + w * 0.2, belt_y)],
              fill=pal["accent"], width=max(2, int(h * 0.025)))


def draw_robed_female(draw: ImageDraw.Draw, cx: float, cy: float,
                      w: float, h: float, pal: dict, angle: float,
                      frame_t: float, clip: str, features: list = None) -> None:
    """Apotheker(in): female silhouette, mortar/pestle or herb sickle."""
    head_cy, torso_top, base_y, dx, skirt_top = _robe_base(
        draw, cx, cy, w, h, pal, angle, frame_t, clip,
        waist_ratio=0.42, skirt_ratio=0.65)

    # More flowing robe hem (wider skirt already via skirt_ratio)
    # Hair/veil
    hair_r = w * 0.16
    draw.arc([cx + dx - hair_r, head_cy - hair_r * 1.2,
              cx + dx + hair_r, head_cy + hair_r * 0.8],
             start=0, end=360, fill=pal["shadow"], width=2)

    # Herb sickle in hand
    arm_angle = 0.0
    if clip == "attack":
        arm_angle = math.sin(frame_t * math.pi) * 0.6
    elif clip == "walk":
        arm_angle = math.sin(frame_t * 2 * math.pi) * 0.15

    sickle_x = cx + dx + w * 0.25
    sickle_y = torso_top + h * 0.15
    sickle_end_x = sickle_x + math.cos(arm_angle) * w * 0.15
    sickle_end_y = sickle_y + math.sin(arm_angle + 0.5) * h * 0.1
    draw.line([(sickle_x, sickle_y), (sickle_end_x, sickle_end_y)],
              fill=pal["accent"], width=max(2, int(w * 0.06)))
    # Curved blade
    draw.arc([sickle_end_x - w * 0.06, sickle_end_y - h * 0.04,
              sickle_end_x + w * 0.06, sickle_end_y + h * 0.04],
             start=0, end=180, fill=pal["accent"], width=2)

    # Mortar at belt
    mortar_x = cx + dx - w * 0.15
    mortar_y = skirt_top - h * 0.02
    draw.ellipse([mortar_x - w * 0.06, mortar_y - h * 0.03,
                  mortar_x + w * 0.06, mortar_y + h * 0.03],
                 fill=pal["trim"])


def draw_robed_scholar(draw: ImageDraw.Draw, cx: float, cy: float,
                       w: float, h: float, pal: dict, angle: float,
                       frame_t: float, clip: str, features: list = None) -> None:
    """Kurator(in): flowing long robe, carries book/scroll."""
    head_cy, torso_top, base_y, dx, skirt_top = _robe_base(
        draw, cx, cy, w, h, pal, angle, frame_t, clip,
        waist_ratio=0.4, skirt_ratio=0.55)

    # Longer flowing robe (extra hem below)
    hem_y = skirt_top + h * 0.38
    hem_pts = [
        (cx + dx - w * 0.28, hem_y),
        (cx + dx + w * 0.28, hem_y),
        (cx + dx + w * 0.22, hem_y + h * 0.06),
        (cx + dx - w * 0.22, hem_y + h * 0.06),
    ]
    draw.polygon(hem_pts, fill=pal["body"])

    # Book held in front
    book_bob = 0.0
    if clip == "walk":
        book_bob = math.sin(frame_t * 2 * math.pi) * h * 0.01
    book_x = cx + dx + math.sin(angle) * w * 0.1
    book_y = torso_top + h * 0.15 + book_bob
    book_w = w * 0.15
    book_h = h * 0.1
    draw.rectangle([book_x - book_w / 2, book_y - book_h / 2,
                    book_x + book_w / 2, book_y + book_h / 2],
                   fill=pal["trim"], outline=pal["accent"])
    # Glowing runes on book during attack
    if clip == "attack":
        glow_int = int(math.sin(frame_t * math.pi) * 150 + 105)
        draw.line([(book_x - book_w * 0.3, book_y),
                   (book_x + book_w * 0.3, book_y)],
                  fill=(255, glow_int, 50), width=1)

    # Scroll tucked at belt
    scroll_x = cx + dx - w * 0.2
    scroll_y = skirt_top
    draw.ellipse([scroll_x - 3, scroll_y - 2, scroll_x + 3, scroll_y + 2],
                 fill=pal["accent"])


def draw_robed_apparatus(draw: ImageDraw.Draw, cx: float, cy: float,
                         w: float, h: float, pal: dict, angle: float,
                         frame_t: float, clip: str, features: list = None) -> None:
    """Alchemist: heavy build, brass apparatus on back, glass flasks."""
    head_cy, torso_top, base_y, dx, skirt_top = _robe_base(
        draw, cx, cy, w, h, pal, angle, frame_t, clip,
        waist_ratio=0.55, skirt_ratio=0.6)

    # Wider shoulders (heavy build)
    shoulder_y = torso_top + h * 0.02
    draw.line([(cx + dx - w * 0.3, shoulder_y), (cx + dx + w * 0.3, shoulder_y)],
              fill=pal["shadow"], width=max(3, int(h * 0.03)))

    # Brass apparatus on back (tall frame with tubes)
    app_x = cx + dx - math.sin(angle) * w * 0.15
    app_top = head_cy + h * 0.02
    app_bot = skirt_top - h * 0.02
    app_w = w * 0.2

    # Main frame
    draw.rectangle([app_x - app_w / 2, app_top,
                    app_x + app_w / 2, app_bot],
                   fill=pal["accent"], outline=pal["trim"])
    # Tubes
    draw.line([(app_x - app_w / 3, app_top), (app_x - app_w / 3, app_top - h * 0.06)],
              fill=pal["accent"], width=2)
    draw.line([(app_x + app_w / 3, app_top), (app_x + app_w / 3, app_top - h * 0.06)],
              fill=pal["accent"], width=2)

    # Glass flask in hand (front)
    flask_x = cx + dx + w * 0.2
    flask_y = torso_top + h * 0.18
    flask_r = w * 0.06
    # Flask bubbles during attack
    if clip == "attack":
        flask_r *= 1 + math.sin(frame_t * 4 * math.pi) * 0.3
    draw.ellipse([flask_x - flask_r, flask_y - flask_r * 1.3,
                  flask_x + flask_r, flask_y + flask_r * 0.7],
                 fill=pal["trim"], outline=pal["glow"])
    # Liquid glow
    draw.ellipse([flask_x - flask_r * 0.6, flask_y - flask_r * 0.3,
                  flask_x + flask_r * 0.6, flask_y + flask_r * 0.5],
                 fill=pal["glow"])


def draw_butterfly_flyer(draw: ImageDraw.Draw, cx: float, cy: float,
                         w: float, h: float, pal: dict, angle: float,
                         frame_t: float, clip: str, features: list = None) -> None:
    """Suchfalter: butterfly/moth-like flyer, luminous wings."""
    dx = math.sin(angle) * w * 0.05
    hover_y = math.sin(frame_t * 2 * math.pi) * h * 0.05
    wing_phase = frame_t * 2 * math.pi

    if clip == "death":
        hover_y = frame_t * h * 0.3
        wing_phase = 0

    body_cy = cy - h * 0.05 + hover_y
    body_h = h * 0.3
    body_w = w * 0.12

    # Wings (flap based on clip)
    wing_spread = 0.7 + math.sin(wing_phase) * 0.3
    if clip == "idle":
        wing_spread = 0.8 + math.sin(wing_phase * 0.5) * 0.15
    elif clip == "attack":
        wing_spread = 1.0

    wing_w = w * 0.4 * wing_spread
    wing_h = h * 0.25

    # Left wing
    lw_pts = [
        (cx + dx, body_cy - body_h * 0.2),
        (cx + dx - wing_w, body_cy - wing_h * 0.5),
        (cx + dx - wing_w * 0.8, body_cy + wing_h * 0.3),
        (cx + dx - wing_w * 0.3, body_cy + wing_h * 0.2),
    ]
    draw.polygon(lw_pts, fill=pal["glow"], outline=pal["accent"])

    # Right wing
    rw_pts = [
        (cx + dx, body_cy - body_h * 0.2),
        (cx + dx + wing_w, body_cy - wing_h * 0.5),
        (cx + dx + wing_w * 0.8, body_cy + wing_h * 0.3),
        (cx + dx + wing_w * 0.3, body_cy + wing_h * 0.2),
    ]
    draw.polygon(rw_pts, fill=pal["glow"], outline=pal["accent"])

    # Wing patterns
    for wing_side in [-1, 1]:
        spot_x = cx + dx + wing_side * wing_w * 0.5
        spot_y = body_cy - wing_h * 0.1
        spot_r = wing_w * 0.15
        draw.ellipse([spot_x - spot_r, spot_y - spot_r,
                      spot_x + spot_r, spot_y + spot_r],
                     fill=pal["accent"])

    # Elongated body
    draw.ellipse([cx + dx - body_w, body_cy - body_h / 2,
                  cx + dx + body_w, body_cy + body_h / 2],
                 fill=pal["body"], outline=pal["shadow"])

    # Head (small)
    head_r = w * 0.07
    head_y = body_cy - body_h / 2 - head_r * 0.5
    draw.ellipse([cx + dx - head_r, head_y - head_r,
                  cx + dx + head_r, head_y + head_r],
                 fill=pal["skin"], outline=pal["shadow"])

    # Antennae
    for side in [-1, 1]:
        draw.line([(cx + dx + side * head_r * 0.5, head_y - head_r),
                   (cx + dx + side * w * 0.12, head_y - h * 0.1)],
                  fill=pal["accent"], width=1)


# =============================================================================
# MODERAT shapes — industrial machines and dark constructs
# =============================================================================

def draw_sphere_bot(draw: ImageDraw.Draw, cx: float, cy: float,
                    w: float, h: float, pal: dict, angle: float,
                    frame_t: float, clip: str, features: list = None) -> None:
    """Sirup-Trupp: small spherical worker bots with tentacle legs."""
    bob = 0.0
    scale = 1.0
    if clip == "walk":
        bob = math.sin(frame_t * 2 * math.pi) * h * 0.05
    elif clip == "idle":
        bob = math.sin(frame_t * 2 * math.pi * 0.5) * h * 0.02
    elif clip == "attack":
        bob = -math.sin(frame_t * math.pi) * h * 0.06
    elif clip == "death":
        bob = frame_t * h * 0.2
        scale = 1.0 - frame_t * 0.3

    body_r = min(w, h) * 0.28 * scale
    body_cy = cy + bob

    # Tentacle legs (3)
    for i in range(3):
        leg_a = angle + (i - 1) * 0.9
        if clip == "walk":
            leg_a += math.sin(frame_t * 2 * math.pi + i * 2.1) * 0.3
        lx = cx + math.sin(leg_a) * body_r * 0.6
        ly = body_cy + body_r * 0.7
        lx_end = lx + math.sin(leg_a) * body_r * 0.5
        ly_end = ly + h * 0.22
        draw.line([(lx, ly), (lx_end, ly_end)],
                  fill=pal["accent"], width=max(2, int(body_r * 0.15)))

    # Body sphere
    draw.ellipse([cx - body_r, body_cy - body_r,
                  cx + body_r, body_cy + body_r],
                 fill=pal["body"], outline=pal["accent"])

    # Eye (direction indicator)
    eye_dx = math.sin(angle) * body_r * 0.4
    eye_dy = -math.cos(angle) * body_r * 0.3
    eye_r = body_r * 0.22
    draw.ellipse([cx + eye_dx - eye_r, body_cy + eye_dy - eye_r,
                  cx + eye_dx + eye_r, body_cy + eye_dy + eye_r],
                 fill=pal["glow"])


def draw_tank_on_stilts(draw: ImageDraw.Draw, cx: float, cy: float,
                        w: float, h: float, pal: dict, angle: float,
                        frame_t: float, clip: str, features: list = None) -> None:
    """Schleuderer: spherical tank body on 2 tall stilt-legs."""
    dx = math.sin(angle) * w * 0.04
    walk_bob = 0.0
    leg_phase = 0.0

    if clip == "walk":
        walk_bob = math.sin(frame_t * 2 * math.pi) * h * 0.03
        leg_phase = frame_t * 2 * math.pi
    elif clip == "death":
        walk_bob = frame_t * h * 0.2

    body_r = w * 0.28
    body_cy = cy - h * 0.15 + walk_bob
    leg_base_y = body_cy + body_r * 0.6

    # Two tall stilt legs (digitigrade)
    for side in [-1, 1]:
        hip_x = cx + dx + side * body_r * 0.4
        knee_y = leg_base_y + h * 0.15
        foot_y = leg_base_y + h * 0.35

        step_off = 0.0
        if clip == "walk":
            step_off = math.sin(leg_phase + side * math.pi / 2) * h * 0.04

        knee_x = hip_x + side * w * 0.05
        foot_x = knee_x - side * w * 0.03

        leg_w = max(3, int(w * 0.07))
        draw.line([(hip_x, leg_base_y), (knee_x, knee_y + step_off)],
                  fill=pal["body"], width=leg_w)
        draw.line([(knee_x, knee_y + step_off), (foot_x, foot_y + step_off)],
                  fill=pal["accent"], width=leg_w)
        # Foot pad
        draw.ellipse([foot_x - w * 0.04, foot_y + step_off - h * 0.01,
                      foot_x + w * 0.04, foot_y + step_off + h * 0.02],
                     fill=pal["accent"])

    # Spherical tank body
    draw.ellipse([cx + dx - body_r, body_cy - body_r,
                  cx + dx + body_r, body_cy + body_r],
                 fill=pal["body"], outline=pal["shadow"])

    # Barrel/turret (direction-facing)
    barrel_len = w * 0.3
    barrel_dx = math.sin(angle) * barrel_len
    barrel_dy = -math.cos(angle) * barrel_len * 0.4
    turret_r = body_r * 0.4
    draw.ellipse([cx + dx - turret_r, body_cy - body_r - turret_r * 0.5,
                  cx + dx + turret_r, body_cy - body_r + turret_r * 0.5],
                 fill=pal["body"], outline=pal["accent"])
    draw.line([(cx + dx, body_cy - body_r),
               (cx + dx + barrel_dx, body_cy - body_r + barrel_dy)],
              fill=pal["accent"], width=max(3, int(w * 0.08)))

    # Magenta glow eye
    eye_dx = math.sin(angle) * body_r * 0.3
    eye_dy = -math.cos(angle) * body_r * 0.2
    eye_r = body_r * 0.15
    draw.ellipse([cx + dx + eye_dx - eye_r, body_cy + eye_dy - eye_r,
                  cx + dx + eye_dx + eye_r, body_cy + eye_dy + eye_r],
                 fill=pal["glow"])


def draw_orbital_virus(draw: ImageDraw.Draw, cx: float, cy: float,
                       w: float, h: float, pal: dict, angle: float,
                       frame_t: float, clip: str, features: list = None) -> None:
    """Toxischer Nebler: floating corona-virus with orbiting satellites."""
    bob = math.sin(frame_t * 2 * math.pi) * h * 0.04
    if clip == "death":
        bob = frame_t * h * 0.3
    pulse = 1.0 + math.sin(frame_t * 4 * math.pi) * 0.04

    body_r = min(w, h) * 0.22 * pulse
    body_cy = cy - h * 0.08 + bob

    # Spikes on main body
    n_spikes = 10
    for i in range(n_spikes):
        spike_a = (i / n_spikes) * 2 * math.pi + angle * 0.2
        spike_len = body_r * (0.5 + math.sin(frame_t * 3 * math.pi + i) * 0.1)
        sx = cx + math.cos(spike_a) * body_r
        sy = body_cy + math.sin(spike_a) * body_r * 0.7
        ex = cx + math.cos(spike_a) * (body_r + spike_len)
        ey = body_cy + math.sin(spike_a) * (body_r + spike_len) * 0.7
        draw.line([(sx, sy), (ex, ey)], fill=pal["accent"],
                  width=max(1, int(body_r * 0.08)))
        # Spike tip sphere
        tip_r = body_r * 0.1
        draw.ellipse([ex - tip_r, ey - tip_r, ex + tip_r, ey + tip_r],
                     fill=pal["glow"])

    # Core sphere
    draw.ellipse([cx - body_r, body_cy - body_r,
                  cx + body_r, body_cy + body_r],
                 fill=pal["body"], outline=pal["accent"])

    # Glowing core
    core_r = body_r * 0.45
    draw.ellipse([cx - core_r, body_cy - core_r,
                  cx + core_r, body_cy + core_r], fill=pal["glow"])

    # ORBITAL SATELLITES (revision requirement: planet-around-sun effect)
    orbit_r = body_r * 2.0
    n_sats = 4
    orbit_speed = frame_t * 2 * math.pi * 0.7
    for i in range(n_sats):
        sat_angle = orbit_speed + i * (2 * math.pi / n_sats)
        sat_x = cx + math.cos(sat_angle) * orbit_r
        sat_y = body_cy + math.sin(sat_angle) * orbit_r * 0.5
        sat_r = body_r * 0.25
        # Mini virus
        draw.ellipse([sat_x - sat_r, sat_y - sat_r,
                      sat_x + sat_r, sat_y + sat_r],
                     fill=pal["body"], outline=pal["accent"])
        # Mini spikes
        for j in range(4):
            ms_a = j * math.pi / 2 + sat_angle
            ms_x = sat_x + math.cos(ms_a) * sat_r
            ms_y = sat_y + math.sin(ms_a) * sat_r * 0.6
            ms_ex = sat_x + math.cos(ms_a) * sat_r * 1.6
            ms_ey = sat_y + math.sin(ms_a) * sat_r
            draw.line([(ms_x, ms_y), (ms_ex, ms_ey)],
                      fill=pal["accent"], width=1)


def draw_six_leg_mech(draw: ImageDraw.Draw, cx: float, cy: float,
                      w: float, h: float, pal: dict, angle: float,
                      frame_t: float, clip: str, features: list = None) -> None:
    """Rohrkanone: 6-legged insectoid mech with long cannon barrel."""
    body_w = w * 0.35
    body_h = h * 0.2
    body_cy = cy - h * 0.02

    bob = 0.0
    if clip == "walk":
        bob = math.sin(frame_t * 2 * math.pi) * h * 0.015
    elif clip == "death":
        bob = frame_t * h * 0.12
        body_h *= (1 - frame_t * 0.5)

    body_cy += bob

    # SIX legs (insectoid gait: alternating tripod)
    for i in range(6):
        side = 1 if i % 2 == 0 else -1
        leg_idx = i // 2  # 0,1,2 positions along body
        leg_x_off = (leg_idx - 1) * body_w * 0.7

        phase_off = (i % 2) * math.pi  # alternating tripod
        if clip == "walk":
            leg_step = math.sin(frame_t * 2 * math.pi + phase_off) * h * 0.05
        else:
            leg_step = 0

        # Leg geometry: hip -> knee -> foot
        hip_x = cx + leg_x_off + math.sin(angle) * body_w * 0.1
        hip_y = body_cy + body_h * 0.3
        knee_x = hip_x + side * w * 0.2
        knee_y = hip_y + h * 0.08
        foot_x = knee_x + side * w * 0.08
        foot_y = hip_y + h * 0.25 + leg_step

        leg_w = max(2, int(w * 0.045))
        draw.line([(hip_x, hip_y), (knee_x, knee_y)],
                  fill=pal["accent"], width=leg_w)
        draw.line([(knee_x, knee_y), (foot_x, foot_y)],
                  fill=pal["body"], width=leg_w)

    # Main hull body (flattened oval)
    draw.ellipse([cx - body_w, body_cy - body_h,
                  cx + body_w, body_cy + body_h],
                 fill=pal["body"], outline=pal["shadow"])

    # Armored segments on hull
    for seg in range(3):
        seg_x = cx + (seg - 1) * body_w * 0.5
        draw.arc([seg_x - body_w * 0.25, body_cy - body_h * 0.8,
                  seg_x + body_w * 0.25, body_cy + body_h * 0.3],
                 start=0, end=360, fill=pal["accent"], width=1)

    # VERY LONG cannon barrel (signature feature per concept art)
    turret_y = body_cy - body_h
    barrel_len = w * 0.55
    barrel_dx = math.sin(angle) * barrel_len
    barrel_dy = -math.cos(angle) * barrel_len * 0.25

    # Turret base (wider)
    turret_r = body_w * 0.4
    draw.ellipse([cx - turret_r, turret_y - h * 0.07,
                  cx + turret_r, turret_y + h * 0.05],
                 fill=pal["body"], outline=pal["accent"])

    # Barrel (thick, industrial pipe)
    barrel_w = max(5, int(w * 0.11))
    draw.line([(cx, turret_y), (cx + barrel_dx, turret_y + barrel_dy)],
              fill=pal["accent"], width=barrel_w)
    # Barrel band/ring near muzzle
    band_t = 0.7
    band_x = cx + barrel_dx * band_t
    band_y = turret_y + barrel_dy * band_t
    draw.ellipse([band_x - barrel_w * 0.8, band_y - barrel_w * 0.5,
                  band_x + barrel_w * 0.8, band_y + barrel_w * 0.5],
                 fill=pal["body"], outline=pal["accent"])

    # Muzzle glow during attack (magenta blast)
    if clip == "attack":
        blast_t = math.sin(frame_t * math.pi)
        if blast_t > 0.3:
            glow_r = w * 0.08 * blast_t
            draw.ellipse([cx + barrel_dx - glow_r, turret_y + barrel_dy - glow_r,
                          cx + barrel_dx + glow_r, turret_y + barrel_dy + glow_r],
                         fill=pal["glow"])
            # Muzzle flash lines
            for fl in range(4):
                fl_a = fl * math.pi / 2 + frame_t * math.pi
                fl_len = glow_r * 1.5
                draw.line([(cx + barrel_dx, turret_y + barrel_dy),
                           (cx + barrel_dx + math.cos(fl_a) * fl_len,
                            turret_y + barrel_dy + math.sin(fl_a) * fl_len)],
                          fill=pal["glow"], width=1)


def draw_massive_golem(draw: ImageDraw.Draw, cx: float, cy: float,
                       w: float, h: float, pal: dict, angle: float,
                       frame_t: float, clip: str, features: list = None) -> None:
    """Stahlbrute (Riese): segmented armored worm-beast per concept art.

    NOT humanoid. Hunched segmented body of cylindrical armor plates,
    massive arms dragging on the ground, jagged glowing maw, tiny head
    sunk into the mass. Moves like a beast, not a person.
    """
    dx = math.sin(angle) * w * 0.04

    walk_bob = 0.0
    undulate = 0.0
    if clip == "walk":
        walk_bob = math.sin(frame_t * 2 * math.pi) * h * 0.035
        undulate = math.sin(frame_t * 2 * math.pi) * 0.12
    elif clip == "death":
        walk_bob = frame_t * h * 0.18
    elif clip == "attack":
        dx += math.sin(frame_t * math.pi) * w * 0.15

    base_y = cy + h * 0.12 + walk_bob

    # --- Segmented body (5 overlapping cylinder-plates, hunched arc) ---
    n_seg = 5
    seg_w = w * 0.32
    seg_h_each = h * 0.12
    for i in range(n_seg):
        t = i / (n_seg - 1)
        arc_x = cx + dx + math.sin(angle) * (t - 0.5) * w * 0.15
        arc_y = base_y - h * 0.08 - math.sin(t * math.pi) * h * 0.28
        if clip == "walk":
            arc_y += math.sin(frame_t * 2 * math.pi + i * 0.7) * h * 0.015

        cur_w = seg_w * (0.7 + 0.3 * math.sin(t * math.pi))
        draw.ellipse([arc_x - cur_w, arc_y - seg_h_each,
                      arc_x + cur_w, arc_y + seg_h_each],
                     fill=pal["body"], outline=pal["shadow"])
        # Segment joint lines (armor plate edges)
        draw.line([(arc_x - cur_w * 0.8, arc_y),
                   (arc_x + cur_w * 0.8, arc_y)],
                  fill=pal["accent"], width=1)

    # --- Massive arms (dragging low, gorilla/beast style) ---
    arm_w_px = max(6, int(w * 0.14))
    shoulder_y = base_y - h * 0.3
    arm_swing = 0.0
    if clip == "walk":
        arm_swing = math.sin(frame_t * 2 * math.pi) * w * 0.08
    elif clip == "attack":
        arm_swing = math.sin(frame_t * math.pi) * w * 0.25

    for side in [-1, 1]:
        sh_x = cx + dx + side * seg_w * 0.8
        elb_x = sh_x + side * w * 0.12
        elb_y = shoulder_y + h * 0.2
        fist_x = elb_x + side * arm_swing
        fist_y = base_y + h * 0.22  # dragging near ground
        draw.line([(sh_x, shoulder_y), (elb_x, elb_y)],
                  fill=pal["body"], width=arm_w_px)
        draw.line([(elb_x, elb_y), (fist_x, fist_y)],
                  fill=pal["shadow"], width=arm_w_px)
        fist_r = w * 0.09
        draw.ellipse([fist_x - fist_r, fist_y - fist_r,
                      fist_x + fist_r, fist_y + fist_r],
                     fill=pal["body"], outline=pal["accent"])

    # --- Stumpy legs (beast stance, wide apart) ---
    leg_w_px = max(7, int(w * 0.18))
    for side in [-1, 1]:
        lx = cx + dx + side * w * 0.2
        step = 0.0
        if clip == "walk":
            step = math.sin(frame_t * 2 * math.pi + side * math.pi / 2) * h * 0.05
        draw.line([(lx, base_y + h * 0.02), (lx + side * w * 0.03, base_y + h * 0.22 + step)],
                  fill=pal["shadow"], width=leg_w_px)

    # --- Head: tiny, sunk into top segment, with jagged glowing maw ---
    head_x = cx + dx + math.sin(angle) * w * 0.08
    head_y = base_y - h * 0.38
    head_r = w * 0.08
    draw.ellipse([head_x - head_r, head_y - head_r,
                  head_x + head_r, head_y + head_r],
                 fill=pal["shadow"])

    # Glowing eyes (2 dots)
    for e_side in [-1, 1]:
        ex = head_x + e_side * head_r * 0.45 + math.sin(angle) * head_r * 0.2
        ey = head_y - head_r * 0.15
        er = head_r * 0.25
        draw.ellipse([ex - er, ey - er, ex + er, ey + er], fill=pal["glow"])

    # Jagged maw (zigzag line below head)
    maw_y = head_y + head_r * 0.6
    maw_w = head_r * 1.2
    teeth = 5
    for t_i in range(teeth):
        tx = head_x - maw_w / 2 + t_i * maw_w / (teeth - 1)
        ty = maw_y + (h * 0.02 if t_i % 2 == 0 else -h * 0.01)
        if t_i > 0:
            prev_x = head_x - maw_w / 2 + (t_i - 1) * maw_w / (teeth - 1)
            prev_y = maw_y + (h * 0.02 if (t_i - 1) % 2 == 0 else -h * 0.01)
            draw.line([(prev_x, prev_y), (tx, ty)], fill=pal["glow"], width=2)

    # --- Magenta energy veins (glowing cracks across segments) ---
    for i in range(6):
        vy = base_y - h * 0.05 - i * h * 0.06
        vw = seg_w * (0.4 + math.sin(i * 1.3) * 0.2)
        draw.line([(cx + dx - vw, vy), (cx + dx + vw, vy)],
                  fill=pal["glow"], width=1)

    # Ground stomp effect
    if clip == "walk":
        stomp_int = abs(math.sin(frame_t * 2 * math.pi))
        if stomp_int > 0.7:
            ground_y = base_y + h * 0.24
            for r_off in range(3):
                sr = w * (0.1 + r_off * 0.06) * stomp_int
                draw.arc([cx + dx - sr, ground_y - h * 0.01,
                          cx + dx + sr, ground_y + h * 0.015],
                         start=0, end=360, fill=pal["accent"], width=1)


# =============================================================================
# Renderer dispatch
# =============================================================================

SHAPE_RENDERERS = {
    "robed_basket": draw_robed_basket,
    "robed_armored": draw_robed_armored,
    "robed_female": draw_robed_female,
    "robed_scholar": draw_robed_scholar,
    "robed_apparatus": draw_robed_apparatus,
    "butterfly_flyer": draw_butterfly_flyer,
    "sphere_bot": draw_sphere_bot,
    "tank_on_stilts": draw_tank_on_stilts,
    "orbital_virus": draw_orbital_virus,
    "six_leg_mech": draw_six_leg_mech,
    "massive_golem": draw_massive_golem,
}


def render_frame(unit_def: dict, clip: str, dir_idx: int, frame_idx: int) -> Image.Image:
    """Render a single sprite frame."""
    img = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    pal = palette_for(unit_def["faction"])
    angle = direction_angle(dir_idx)
    frame_t = frame_idx / FRAMES_PER_CLIP

    cx = FRAME_SIZE / 2
    cy = FRAME_SIZE / 2
    w = FRAME_SIZE * unit_def["width_ratio"]
    h = FRAME_SIZE * unit_def["height_ratio"]

    renderer = SHAPE_RENDERERS.get(unit_def["shape"], draw_robed_basket)
    renderer(draw, cx, cy, w, h, pal, angle, frame_t, clip)

    return img


def generate_atlas(unit_id: str, unit_def: dict, out_dir: Path) -> dict:
    """Generate a full sprite atlas for one unit."""
    total_frames = len(CLIPS) * DIRECTIONS * FRAMES_PER_CLIP
    rows = math.ceil(total_frames / COLS)
    atlas_w = COLS * FRAME_SIZE
    atlas_h = rows * FRAME_SIZE

    atlas = Image.new("RGBA", (atlas_w, atlas_h), (0, 0, 0, 0))
    frames_meta: dict[str, Any] = {}

    frame_num = 0
    for clip in CLIPS:
        for dir_idx in range(DIRECTIONS):
            deg = dir_idx * 45
            for f_idx in range(FRAMES_PER_CLIP):
                frame_img = render_frame(unit_def, clip, dir_idx, f_idx)

                col = frame_num % COLS
                row = frame_num // COLS
                x = col * FRAME_SIZE
                y = row * FRAME_SIZE
                atlas.paste(frame_img, (x, y))

                key = f"{unit_id}_{clip}_{deg:03d}_{f_idx:02d}"
                frames_meta[key] = {
                    "frame": {"x": x, "y": y, "w": FRAME_SIZE, "h": FRAME_SIZE},
                    "rotated": False,
                    "trimmed": False,
                    "spriteSourceSize": {"x": 0, "y": 0, "w": FRAME_SIZE, "h": FRAME_SIZE},
                    "sourceSize": {"w": FRAME_SIZE, "h": FRAME_SIZE},
                    "pivot": {"x": 0.5, "y": 0.92},
                }
                frame_num += 1

    png_path = out_dir / f"{unit_id}.png"
    atlas.save(png_path, "PNG", optimize=True)

    atlas_json = {
        "frames": frames_meta,
        "meta": {
            "app": "generate_unit_sprites.py",
            "version": "2.0",
            "image": f"{unit_id}.png",
            "format": "RGBA8888",
            "size": {"w": atlas_w, "h": atlas_h},
            "scale": "1",
        },
    }
    json_path = out_dir / f"{unit_id}.json"
    json_path.write_text(json.dumps(atlas_json, indent=2))

    print(f"  {unit_id}: {png_path.name} ({atlas_w}x{atlas_h}, "
          f"{total_frames} frames, {png_path.stat().st_size // 1024} KB)")
    return {"png": str(png_path), "json": str(json_path), "frames": total_frames}


def main() -> int:
    import argparse
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--units", default="",
                    help="Comma-separated unit IDs to generate. Empty = all.")
    ap.add_argument("--out-dir", default="public/sprites/units",
                    help="Output directory for atlas PNGs and JSONs.")
    args = ap.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    units_to_gen = UNITS
    if args.units:
        ids = [u.strip() for u in args.units.split(",")]
        units_to_gen = {k: v for k, v in UNITS.items() if k in ids}

    print(f"Generating {len(units_to_gen)} unit sprite atlases...")
    results = {}
    for uid, udef in units_to_gen.items():
        results[uid] = generate_atlas(uid, udef, out_dir)

    print(f"\nDone. {len(results)} atlases generated in {out_dir}/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
