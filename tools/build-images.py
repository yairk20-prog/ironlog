#!/usr/bin/env python3
"""
Build the bundled exercise image set.

Source: yuhonas/free-exercise-db (Unlicense / public domain).
Each exercise gets two frames — start and end of the movement — resized and
converted to WebP so the whole set stays small enough to ship offline.

Frames already in img/ex are kept as they are; only missing ones are built,
read from a local clone of the source repo (FEDB=path) or, failing that,
downloaded from it. Re-encoding the whole set on every run would rewrite
every image in git for no visible change.

Run:  python3 tools/build-images.py
"""
import io
import json
import os
import pathlib
import urllib.request
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = os.environ.get('FEDB', '/tmp/fedb')
RAW = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main'
OUT = str(ROOT / 'img' / 'ex')
WIDTH = 420
QUALITY = 74

# my exercise id → free-exercise-db id
MAP = {
    # push · chest
    'bb_bench': 'Barbell_Bench_Press_-_Medium_Grip',
    'db_bench': 'Dumbbell_Bench_Press',
    'machine_chest_press': 'Machine_Bench_Press',
    'smith_bench': 'Smith_Machine_Bench_Press',
    'pushup': 'Pushups',
    'bb_incline': 'Barbell_Incline_Bench_Press_-_Medium_Grip',
    'db_incline': 'Incline_Dumbbell_Press',
    'machine_incline': 'Leverage_Incline_Chest_Press',
    'cable_fly': 'Cable_Crossover',
    'pec_deck': 'Butterfly',
    'db_fly': 'Dumbbell_Flyes',
    'band_fly': 'Bodyweight_Flyes',

    # push · shoulders
    'bb_ohp': 'Barbell_Shoulder_Press',
    'db_shoulder_press': 'Dumbbell_Shoulder_Press',
    'machine_shoulder_press': 'Leverage_Shoulder_Press',
    'db_lateral': 'Side_Lateral_Raise',
    'cable_lateral': 'Cable_Seated_Lateral_Raise',
    'machine_lateral': 'Side_Lateral_Raise',
    'band_lateral': 'Lateral_Raise_-_With_Bands',
    'rear_delt_fly': 'Reverse_Flyes',
    'cable_face_pull': 'Face_Pull',
    'reverse_pec_deck': 'Reverse_Machine_Flyes',
    'band_pull_apart': 'Band_Pull_Apart',

    # push · triceps
    'cable_pushdown': 'Triceps_Pushdown',
    'rope_pushdown': 'Triceps_Pushdown_-_Rope_Attachment',
    'skullcrusher': 'EZ-Bar_Skullcrusher',
    'db_overhead_tri': 'Seated_Triceps_Press',
    'dips': 'Dips_-_Triceps_Version',
    'close_grip_bench': 'Close-Grip_Barbell_Bench_Press',

    # pull · back
    'pullup': 'Pullups',
    'lat_pulldown': 'Wide-Grip_Lat_Pulldown',
    'neutral_pulldown': 'Close-Grip_Front_Lat_Pulldown',
    'assisted_pullup': 'Band_Assisted_Pull-Up',
    'bb_row': 'Bent_Over_Barbell_Row',
    'db_row': 'One-Arm_Dumbbell_Row',
    'cable_row': 'Seated_Cable_Rows',
    'machine_row': 'Leverage_Iso_Row',
    'tbar_row': 'T-Bar_Row_with_Handle',
    'straight_arm_pulldown': 'Straight-Arm_Pulldown',
    'db_shrug': 'Dumbbell_Shrug',
    'inverted_row': 'Inverted_Row',

    # pull · biceps
    'bb_curl': 'Barbell_Curl',
    'db_curl': 'Dumbbell_Bicep_Curl',
    'hammer_curl': 'Hammer_Curls',
    'cable_curl': 'Standing_Biceps_Cable_Curl',
    'preacher_curl': 'Preacher_Curl',
    'band_curl': 'Close-Grip_EZ-Bar_Curl_with_Band',

    # legs
    'bb_squat': 'Barbell_Squat',
    'front_squat': 'Front_Squat_Clean_Grip',
    'hack_squat': 'Hack_Squat',
    'leg_press': 'Leg_Press',
    'goblet_squat': 'Goblet_Squat',
    'bulgarian_split': 'Split_Squat_with_Dumbbells',
    'walking_lunge': 'Bodyweight_Walking_Lunge',
    'bw_lunge': 'Bodyweight_Walking_Lunge',
    'bw_squat': 'Bodyweight_Squat',
    'step_up': 'Step-up_with_Knee_Raise',
    'rdl': 'Romanian_Deadlift',
    'deadlift': 'Barbell_Deadlift',
    'db_rdl': 'Stiff-Legged_Dumbbell_Deadlift',
    'back_extension': 'Hyperextensions_Back_Extensions',
    'leg_curl': 'Lying_Leg_Curls',
    'seated_leg_curl': 'Seated_Leg_Curl',
    'nordic_curl': 'Natural_Glute_Ham_Raise',
    'leg_extension': 'Leg_Extensions',
    'hip_thrust': 'Barbell_Hip_Thrust',
    'glute_bridge': 'Barbell_Glute_Bridge',
    'cable_kickback': 'One-Legged_Cable_Kickback',
    'band_abduction': 'Band_Hip_Adductions',
    'machine_abduction': 'Thigh_Abductor',
    'standing_calf': 'Standing_Calf_Raises',
    'seated_calf': 'Seated_Calf_Raise',
    'bw_calf': 'Standing_Dumbbell_Calf_Raise',

    # core
    'hanging_leg_raise': 'Hanging_Leg_Raise',
    'cable_crunch': 'Cable_Crunch',
    'reverse_crunch': 'Reverse_Crunch',
    'plank': 'Plank',
    'dead_bug': 'Dead_Bug',
    'pallof_press': 'Pallof_Press',
    'side_plank': 'Side_Bridge',

    # posture / mobility
    'hip_flexor_stretch': 'Kneeling_Hip_Flexor',
    'glute_activation': 'Glute_Kickback',
    'chin_tuck': 'Chin_To_Chest_Stretch',
    'wall_angel': 'Upper_Back_Stretch',
    'thoracic_ext': 'Cat_Stretch',
    'pigeon_stretch': 'Seated_Glute',
    'hamstring_stretch': 'Hamstring_Stretch',

    # bodyweight variants for training at the park / at home
    'decline_pushup': 'Decline_Push-Up',
    'diamond_pushup': 'Push-Ups_-_Close_Triceps_Position',
    'bench_dips': 'Bench_Dips',
    'chin_up': 'Chin-Up',
    'single_leg_bridge': 'Single_Leg_Glute_Bridge',
    'crunches': 'Crunches',

    # conditioning moves (HIIT)
    'jump_squat': 'Freehand_Jump_Squat',
    'mountain_climbers': 'Mountain_Climbers',
    'star_jump': 'Star_Jump',
    'split_jump': 'Split_Jump',

    # cardio — not exercises in the catalogue, just the photo per activity
    'cardio_run': 'Trail_Running_Walking',
    'cardio_treadmill': 'Running_Treadmill',
    'cardio_walk': 'Walking_Treadmill',
    'cardio_bike': 'Bicycling_Stationary',
    'cardio_elliptical': 'Elliptical_Trainer',
    'cardio_rope': 'Rope_Jumping',
    'cardio_rower': 'Rowing_Stationary',

    # functional
    'kb_swing': 'One-Arm_Kettlebell_Swings',
    'kb_thruster': 'Kettlebell_Thruster',
    'kb_clean': 'One-Arm_Kettlebell_Clean',
    'turkish_getup': 'Kettlebell_Turkish_Get-Up_Squat_style',
    'farmer_carry': 'Farmers_Walk',
    'renegade_row': 'Alternating_Renegade_Row',
    'med_ball_slam': 'Overhead_Slam',
    'box_jump': 'Front_Box_Jump',
    'battle_ropes': 'Battling_Ropes',
    'sled_push': 'Sled_Push',
    'inchworm': 'Inchworm',
    'pushup_side_plank': 'Push_Up_to_Side_Plank',
}


def source(rel):
    """Bytes of one source frame: the local clone if there is one, else the repo."""
    local = os.path.join(SRC, 'exercises', rel)
    if os.path.exists(local):
        return open(local, 'rb').read()
    with urllib.request.urlopen(f'{RAW}/exercises/{rel}', timeout=30) as r:
        return r.read()


def index():
    local = os.path.join(SRC, 'dist', 'exercises.json')
    if os.path.exists(local):
        return json.load(open(local))
    with urllib.request.urlopen(f'{RAW}/dist/exercises.json', timeout=30) as r:
        return json.load(r)


def convert(src_bytes, dst_path):
    img = Image.open(io.BytesIO(src_bytes)).convert('RGB')
    h = int(img.height * WIDTH / img.width)
    img = img.resize((WIDTH, h), Image.LANCZOS)
    img.save(dst_path, 'WEBP', quality=QUALITY, method=6)
    return os.path.getsize(dst_path)


def main():
    os.makedirs(OUT, exist_ok=True)
    data = None

    manifest = {}
    total = 0
    missing = []

    for mine, theirs in MAP.items():
        have = [f'{mine}-{n}.webp' for n in range(2) if os.path.exists(os.path.join(OUT, f'{mine}-{n}.webp'))]
        if have:
            manifest[mine] = have
            continue
        if data is None:
            data = {e['id']: e for e in index()}
        entry = data.get(theirs)
        if not entry:
            missing.append((mine, theirs, 'no-entry'))
            continue
        images = entry.get('images') or []
        if not images:
            missing.append((mine, theirs, 'no-images'))
            continue

        frames = []
        for n, rel in enumerate(images[:2]):
            try:
                raw = source(rel)
            except Exception as err:  # one missing frame is not the whole set
                print('  fetch failed', rel, err)
                continue
            name = f'{mine}-{n}.webp'
            total += convert(raw, os.path.join(OUT, name))
            frames.append(name)

        if frames:
            manifest[mine] = frames
        else:
            missing.append((mine, theirs, 'files-missing'))

    ids = sorted(manifest)
    two = sorted(k for k, v in manifest.items() if len(v) >= 2)
    lines = [
        '/* ex-images.js \u2014 generated by tools/build-images.py. Do not edit by hand.',
        '   Source: yuhonas/free-exercise-db (Unlicense / public domain). */',
        '',
        '/** Exercise ids that ship with bundled photos. */',
        'export const WITH_IMAGES = new Set([',
        *[f"  '{i}'," for i in ids],
        ']);',
        '',
        '/** Ids that have two frames (start + end of the movement). */',
        'export const TWO_FRAMES = new Set([',
        *[f"  '{i}'," for i in two],
        ']);',
        '',
    ]
    with open(ROOT / 'js' / 'ex-images.js', 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')

    # Flat file list the service worker warms in the background after install.
    files = sorted(n for frames in manifest.values() for n in frames)
    with open(os.path.join(OUT, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump(files, f)

    print(f'exercises with images: {len(manifest)}')
    print(f'new bytes: {total/1024/1024:.2f} MB')
    if missing:
        print('MISSING:')
        for m in missing:
            print('  ', m)


if __name__ == '__main__':
    main()
