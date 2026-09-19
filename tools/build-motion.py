#!/usr/bin/env python3
"""Turn each exercise's two bundled stills into a real animated loop.

Licensed exercise GIFs cannot be downloaded from this environment, and a hard
cross-fade between a start pose and an end pose reads as a flicker rather than
a movement. So the motion is synthesised, in three steps that matter:

  1. The second still is aligned to the first, because the two photographs were
     taken moments apart and the camera itself moved. Without this the whole
     room slides while the lifter presses.
  2. Dense optical flow gives a displacement field, and that field is masked to
     the regions that actually changed — so the rack, the floor and the wall
     stay put and stay sharp while the arms and the bar travel.
  3. Each intermediate frame is both images dragged toward each other and
     blended by the same weight, eased so the turnaround is slower than the
     middle, then composited back over the untouched background.

The result is an animated WebP that plays out and back.

Usage: python3 tools/build-motion.py [--only id] [--steps N]
"""
import argparse
import json
import pathlib
import sys

import cv2
import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'img' / 'ex'
OUT = ROOT / 'img' / 'motion'

# Frames generated between the two poses. The loop plays 0 → 1 → 0, so the
# visible sequence is 2 * STEPS long at a cost of STEPS extra frames.
STEPS = 6
FPS_MS = 95
QUALITY = 58
MAX_W = 440


def flow(a_gray, b_gray):
    """Dense displacement from a to b (Farnebäck: no training data needed)."""
    return cv2.calcOpticalFlowFarneback(
        a_gray, b_gray, None,
        pyr_scale=0.5, levels=4, winsize=25,
        iterations=4, poly_n=7, poly_sigma=1.5, flags=0
    )


def align(a, b):
    """Cancel the camera's own shift between the two shots, so the flow field
    describes the lifter rather than the room."""
    ga, gb = (cv2.cvtColor(x, cv2.COLOR_BGR2GRAY) for x in (a, b))
    orb = cv2.ORB_create(2000)
    ka, da = orb.detectAndCompute(ga, None)
    kb, db = orb.detectAndCompute(gb, None)
    if da is None or db is None or len(da) < 12 or len(db) < 12:
        return b
    matches = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True).match(db, da)
    if len(matches) < 12:
        return b
    matches = sorted(matches, key=lambda m: m.distance)[:400]
    src = np.float32([kb[m.queryIdx].pt for m in matches]).reshape(-1, 1, 2)
    dst = np.float32([ka[m.trainIdx].pt for m in matches]).reshape(-1, 1, 2)
    M, _ = cv2.estimateAffinePartial2D(src, dst, method=cv2.RANSAC, ransacReprojThreshold=3)
    if M is None:
        return b
    h, w = a.shape[:2]
    return cv2.warpAffine(b, M, (w, h), borderMode=cv2.BORDER_REPLICATE)


def motion_mask(f, a, b):
    """Where the picture actually changed, feathered. Everything else is left
    exactly as it was shot."""
    mag = np.linalg.norm(f, axis=2)
    diff = cv2.cvtColor(cv2.absdiff(a, b), cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
    m = np.clip(mag / max(np.percentile(mag, 97), 1e-3), 0, 1) * 0.6 + np.clip(diff * 3, 0, 1) * 0.4
    m = cv2.GaussianBlur(m, (0, 0), 9)
    return np.clip(m * 1.6, 0, 1)[..., None]


def warp(img, f, amount):
    """Push every pixel `amount` of the way along the flow field."""
    h, w = img.shape[:2]
    grid_x, grid_y = np.meshgrid(np.arange(w, dtype=np.float32),
                                 np.arange(h, dtype=np.float32))
    map_x = grid_x + f[..., 0] * amount
    map_y = grid_y + f[..., 1] * amount
    return cv2.remap(img, map_x, map_y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)


def ease(t):
    """Lifting is not linear: slow at the turnaround, quicker in the middle."""
    return t * t * (3 - 2 * t)


def morph(a, b, steps=STEPS):
    """Frames from a to b, exclusive of both ends."""
    a_gray = cv2.cvtColor(a, cv2.COLOR_BGR2GRAY)
    b_gray = cv2.cvtColor(b, cv2.COLOR_BGR2GRAY)
    f_ab = flow(a_gray, b_gray)
    f_ba = flow(b_gray, a_gray)

    mask = motion_mask(f_ab, a, b)
    f_ab = f_ab * mask
    f_ba = f_ba * mask
    still = a.astype(np.float32) * (1 - mask)

    out = []
    for i in range(1, steps + 1):
        t = ease(i / (steps + 1))
        # Each image is dragged toward the other, then they are blended by the
        # same weight — so the moving parts line up instead of ghosting.
        wa = warp(a, f_ab, t)
        wb = warp(b, f_ba, 1 - t)
        blend = cv2.addWeighted(wa, 1 - t, wb, t, 0).astype(np.float32)
        out.append((blend * mask + still).astype(np.uint8))
    return out


def sequence(a, b):
    """The full ping-pong loop: start, out, end, back."""
    fwd = morph(a, b)
    return [a] + fwd + [b] + list(reversed(fwd))


def to_pil(bgr):
    return Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))


def build(ex_id):
    p0 = SRC / f'{ex_id}-0.webp'
    p1 = SRC / f'{ex_id}-1.webp'
    if not (p0.exists() and p1.exists()):
        return None

    a = cv2.imread(str(p0))
    b = cv2.imread(str(p1))
    if a is None or b is None:
        return None
    if a.shape != b.shape:
        b = cv2.resize(b, (a.shape[1], a.shape[0]))
    if a.shape[1] > MAX_W:
        scale = MAX_W / a.shape[1]
        size = (MAX_W, int(a.shape[0] * scale))
        a, b = cv2.resize(a, size), cv2.resize(b, size)

    b = align(a, b)

    frames = [to_pil(f) for f in sequence(a, b)]
    OUT.mkdir(parents=True, exist_ok=True)
    dest = OUT / f'{ex_id}.webp'
    frames[0].save(
        dest, save_all=True, append_images=frames[1:],
        duration=FPS_MS, loop=0, quality=QUALITY, method=4
    )
    return dest


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only')
    ap.add_argument('--steps', type=int)
    args = ap.parse_args()
    if args.steps:
        global STEPS
        STEPS = args.steps

    ids = sorted({p.name.rsplit('-', 1)[0] for p in SRC.glob('*-1.webp')})
    if args.only:
        ids = [args.only]

    made = []
    for i, ex in enumerate(ids, 1):
        dest = build(ex)
        if dest:
            made.append(ex)
        if i % 20 == 0:
            print(f'  {i}/{len(ids)}', file=sys.stderr)

    (OUT / 'index.json').write_text(json.dumps(sorted(made)), encoding='utf-8')

    # The app should not have to fetch a manifest before it can decide whether
    # an exercise has a loop, so the list ships as a module.
    ids = ',\n  '.join(f"'{m}'" for m in sorted(made))
    (ROOT / 'js' / 'ex-motion.js').write_text(
        '/* Generated by tools/build-motion.py — exercises with an animated loop. */\n'
        f'export const WITH_MOTION = new Set([\n  {ids}\n]);\n',
        encoding='utf-8'
    )
    total = sum((OUT / f'{m}.webp').stat().st_size for m in made)
    print(f'{len(made)} loops, {total / 1e6:.2f} MB total, '
          f'{total / max(len(made), 1) / 1000:.0f} KB each')


if __name__ == '__main__':
    main()
