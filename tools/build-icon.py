#!/usr/bin/env python3
"""Build the IRONLOG logo and app icons.

A flexed arm as a blue pencil study: one ink contour, tone built from hatch
lines, no flat fills. The geometry is original — the reference image was used
as a description of the look, not traced.

The silhouette is one hand-authored contour. Assembling it from overlapping
ovals is easier to steer but always reads as a pile of ovals; what makes a
drawn arm convincing is a single edge that swells and narrows, with a notch
cut where the forearm meets the bicep. Everything inside that contour is
shading only, clipped to it, so no interior shape can break the edge.

Tone is generated: hatch lines swept across a clipped region at an angle that
follows the form, in two passes crossing at a shallow angle — the way a hand
builds tone rather than pressing harder. Highlights are lifted back out with
paper-coloured washes, the way a kneaded eraser works.

A pencil study does not survive being shrunk to a home-screen icon: hatching
turns to mush under about 96px. So the same contour also builds a flat-ink
mark, and the small PNGs are cut from that.

Run:  python3 tools/build-icon.py
"""
import math
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent
ICONS = ROOT / 'icons'

# Two palettes from one drawing. Inverting a pencil study is not a matter of
# swapping two colours: on paper the tone is graphite *added* to white, while
# on a dark ground the tone is light *added* to black, so the shadow pass and
# the highlight pass trade places. Naming the roles rather than the colours is
# what lets the same geometry render both ways.
PALETTES = {
    'light': {
        'bg': '#F2F6F8',      # the ground
        'ink': '#22506E',     # the contour and the interior lines
        'wash': '#CBDFE8',    # flat tone laid under the hatching
        'tone': '#77A6BC',    # the hatching itself
        'deep': '#3B7093',    # the passes gone over twice
        'lift': '#F2F6F8',    # where the light lands — the ground, lifted back
        'lift_op': 1.0,
        'glow': False,
    },
    'dark': {
        'bg': '#0C1219',
        'ink': '#A9D6EC',
        'wash': '#1B2C39',
        'tone': '#5D93B0',
        'deep': '#15242F',    # darker than the ground: shadow, not more light
        'lift': '#BFE2F4',
        'lift_op': 0.30,      # a lit edge, not a hole punched in the drawing
        'glow': True,
    },
}

# ---------------------------------------------------------------------------
# The contour, clockwise from the top of the fist.
#
#   fist → thumb → wrist → down the forearm's thumb edge → NOTCH at the elbow
#   crook → up over the bicep to its peak → deltoid → armpit → back left along
#   the underside of the upper arm → elbow → up the forearm's far edge →
#   wrist → around the fist.
#
# The notch is the whole trick. Without it the two limbs merge and the shape
# reads as a bent tube; with it the eye separates forearm from upper arm
# instantly, even at thumbnail size.
# ---------------------------------------------------------------------------
ARM = (
    'M196 44 '
    'C226 42 250 62 252 94 '
    'C254 114 247 130 238 141 '
    'C230 150 225 156 223 164 '
    'C231 198 234 234 230 264 '
    'C228 278 224 286 218 292 '      # into the notch
    'C242 261 269 229 300 211 '      # out of the notch, up over the bicep
    'C333 192 366 198 390 218 '
    'C419 240 435 271 435 307 '
    'C435 343 422 375 401 398 '
    'C366 419 304 429 248 425 '
    'C204 422 168 411 149 392 '
    'C127 371 116 333 116 289 '
    'C116 244 123 201 136 171 '
    'C143 158 150 150 154 143 '
    'C145 126 143 100 150 80 '
    'C159 53 175 45 196 44 Z'
)

# The vest: enough of a torso that the arm belongs to someone, and no more.
STRAP = ('M386 218 C392 172 410 132 438 100 L504 100 '
         'C478 134 462 180 456 236 C440 224 412 216 386 218 Z')
VEST = ('M456 236 C464 304 474 378 480 450 C482 474 483 494 482 512 '
        'L512 512 L512 100 L504 100 C478 134 462 180 456 236 Z')


def ellipse(cx, cy, rx, ry, rot=0):
    """An ellipse as a path, so every region is handled the same way."""
    a = math.radians(rot)
    ca, sa = math.cos(a), math.sin(a)
    pts = []
    for i in range(56):
        t = 2 * math.pi * i / 56
        x, y = rx * math.cos(t), ry * math.sin(t)
        pts.append((cx + x * ca - y * sa, cy + x * sa + y * ca))
    return 'M' + 'L'.join(f'{x:.1f} {y:.1f}' for x, y in pts) + 'Z'


#  Muscle masses: shading only, clipped to the contour, so their edges never
#  have to be exact. (name, path, hatch angle)
MASSES = [
    ('fist', ellipse(198, 98, 52, 54, -8), -54),
    ('fore', ellipse(178, 250, 58, 108, -4), -80),
    ('bicep', ellipse(296, 252, 82, 62, -12), -28),
    ('tricep', ellipse(268, 350, 98, 52, -6), -6),
    ('delt', ellipse(392, 288, 50, 62, -18), -48),
]

#  The passes a pencil goes back over: each mass's turning edge, the crook,
#  and the core shadow under the upper arm.
SHADOWS = [
    ellipse(224, 268, 30, 46, -16),     # the crook, deepest tone in the drawing
    ellipse(286, 306, 74, 28, -12),     # under the bicep
    ellipse(296, 388, 104, 28, -6),     # under the upper arm
    ellipse(140, 262, 26, 92, -3),      # the forearm's far edge
    ellipse(410, 322, 34, 48, -26),     # the deltoid rolling under
    ellipse(230, 140, 26, 22, 10),      # under the thumb
]

#  Where the light lands, lifted back out of the hatching.
HIGHLIGHTS = [
    (ellipse(292, 218, 62, 26, -20), 0.66),   # the bicep peak
    (ellipse(172, 210, 26, 62, -6), 0.50),    # down the forearm
    (ellipse(190, 78, 30, 20, -12), 0.50),    # across the knuckles
    (ellipse(384, 254, 26, 30, -20), 0.42),   # the top of the deltoid
]

#  The lines a pencil puts inside the contour.
DETAIL = [
    'M166 70 C180 60 202 58 220 66',          # 0 knuckles
    'M160 90 C176 80 200 78 220 86',          # 1
    'M162 110 C178 102 200 100 218 106',      # 2
    'M214 106 C226 110 233 118 234 130',      # 3 thumb
    'M162 150 C176 160 200 160 214 152',      # 4 wrist
    'M198 186 C208 238 206 296 196 348',      # 5 the groove down the forearm
    'M150 206 C144 254 146 302 156 340',      # 6
    'M218 232 C248 208 284 198 320 204',      # 7 the bicep's two heads
    'M228 300 C260 318 302 322 338 308',      # 8 under the bicep
    'M356 246 C376 274 386 308 384 342',      # 9 deltoid striations
    'M384 238 C404 262 416 294 418 326',      # 10
    'M214 384 C262 406 328 404 374 376',      # 11 the tricep's lower edge
]


def hatch(clip_id, angle_deg, spacing, width, colour, opacity):
    a = math.radians(angle_deg)
    dx, dy = math.cos(a), math.sin(a)
    nx, ny = -dy, dx
    reach = 780
    out = []
    for i in range(int(reach * 2 / spacing)):
        off = -reach + i * spacing
        cx, cy = 256 + nx * off, 256 + ny * off
        out.append(f'<line x1="{cx - dx * reach:.0f}" y1="{cy - dy * reach:.0f}" '
                   f'x2="{cx + dx * reach:.0f}" y2="{cy + dy * reach:.0f}"/>')
    return (f'<g clip-path="url(#{clip_id})" stroke="{colour}" stroke-width="{width}" '
            f'stroke-linecap="round" opacity="{opacity}">{"".join(out)}</g>')


def study(theme='light', ground=True):
    P = PALETTES[theme]
    clips = [f'<clipPath id="c-arm"><path d="{ARM}"/></clipPath>',
             f'<clipPath id="c-strap"><path d="{STRAP}"/></clipPath>',
             f'<clipPath id="c-vest"><path d="{VEST}"/></clipPath>']
    clips += [f'<clipPath id="c-{n}"><path d="{d}"/></clipPath>' for n, d, _ in MASSES]
    clips += [f'<clipPath id="c-sh{i}"><path d="{d}"/></clipPath>' for i, d in enumerate(SHADOWS)]

    b = []

    # The vest sits behind the arm, in a lighter register so it never competes.
    for name, d in (('strap', STRAP), ('vest', VEST)):
        b.append(f'<path d="{d}" fill="{P["wash"]}" opacity="0.26"/>')
        b.append(hatch(f'c-{name}', -74, 9.0, 1.4, P['tone'], 0.34))
        b.append(f'<path d="{d}" fill="none" stroke="{P["ink"]}" stroke-width="2.8" '
                 f'stroke-linejoin="round" opacity="0.62"/>')

    # A flat tone under the arm, so the ground never shows through the
    # hatching untouched — that is what separates a drawn mass from a screen
    # pattern laid over nothing.
    b.append(f'<path d="{ARM}" fill="{P["wash"]}" opacity="0.55"/>')

    # Everything from here to the contour is clipped to the arm.
    b.append('<g clip-path="url(#c-arm)">')

    b.append(hatch('c-arm', -68, 7.0, 1.6, P['tone'], 0.40))
    for name, _, ang in MASSES:
        b.append(hatch(f'c-{name}', ang, 6.2, 1.9, P['tone'], 0.52))
        b.append(hatch(f'c-{name}', ang + 40, 12.0, 1.3, P['tone'], 0.26))

    for i in range(len(SHADOWS)):
        b.append(hatch(f'c-sh{i}', -26, 5.0, 2.0, P['deep'], 0.40))
        b.append(hatch(f'c-sh{i}', 20, 6.5, 1.6, P['deep'], 0.30))

    for d, op in HIGHLIGHTS:
        b.append(f'<path d="{d}" fill="{P["lift"]}" opacity="{op * P["lift_op"]:.2f}"/>')

    paths = ''.join(f'<path d="{d}"/>' for d in DETAIL)
    b.append(f'<g fill="none" stroke="{P["ink"]}" stroke-width="2.9" stroke-linecap="round" '
             f'opacity="0.9">{paths}</g>')
    b.append('</g>')

    # The contour, twice: a searching line underneath and the committed one on
    # top. A single vector edge is the giveaway that nothing was drawn. On the
    # dark ground the under-line is spread rather than offset, which reads as
    # the line catching light instead of as a doubled stroke.
    if P['glow']:
        b.append(f'<path d="{ARM}" fill="none" stroke="{P["ink"]}" stroke-width="12" '
                 f'stroke-linejoin="round" opacity="0.16"/>')
    b.append(f'<path d="{ARM}" fill="none" stroke="{P["ink"]}" stroke-width="5.4" '
             f'stroke-linejoin="round" opacity="0.3" transform="translate(2 2.5)"/>')
    b.append(f'<path d="{ARM}" fill="none" stroke="{P["ink"]}" stroke-width="4.8" '
             f'stroke-linejoin="round"/>')

    bg = f'<rect width="512" height="512" fill="{P["bg"]}"/>' if ground else ''
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" '
            f'width="512" height="512">\n  <defs>{"".join(clips)}</defs>\n  '
            f'{bg}\n  {"".join(b)}\n</svg>')


def flat(radius=112, scale=1.0, theme='light'):
    """Hatching dropped, contour thickened: what survives at icon sizes."""
    P = PALETTES[theme]
    t = '' if scale == 1.0 else (' transform="translate(256 256) '
                                 f'scale({scale}) translate(-256 -256)"')
    lines = ''.join(f'<path d="{DETAIL[i]}"/>' for i in (1, 4, 7, 8))
    darks = ''.join(f'<path d="{SHADOWS[i]}"/>' for i in (0, 1, 2))
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs><clipPath id="f-arm"><path d="{ARM}"/></clipPath></defs>
  <rect width="512" height="512" rx="{radius}" fill="{P["bg"]}"/>
  <g{t}>
    <path d="{STRAP}" fill="{P["wash"]}" opacity="0.55"/>
    <path d="{VEST}" fill="{P["wash"]}" opacity="0.55"/>
    <g fill="none" stroke="{P["ink"]}" stroke-width="7" stroke-linejoin="round" opacity="0.4">
      <path d="{STRAP}"/><path d="{VEST}"/>
    </g>
    <path d="{ARM}" fill="{P["wash"]}"/>
    <g clip-path="url(#f-arm)">
      <g fill="{P["tone"]}" opacity="0.6">{darks}</g>
      <g fill="none" stroke="{P["ink"]}" stroke-width="8" stroke-linecap="round"
         opacity="0.9">{lines}</g>
    </g>
    <path d="{ARM}" fill="none" stroke="{P["ink"]}" stroke-width="14" stroke-linejoin="round"/>
  </g>
</svg>'''


#  The app is an OLED-dark app, so dark is what ships; the paper version is
#  kept because it is the one that works on a printed page or a light background.
THEME = 'dark'


def main():
    ICONS.mkdir(exist_ok=True)
    (ICONS / 'logo.svg').write_text(study(THEME), encoding='utf-8')
    (ICONS / 'logo-light.svg').write_text(study('light'), encoding='utf-8')
    (ICONS / 'icon.svg').write_text(flat(112, theme=THEME), encoding='utf-8')
    (ICONS / 'icon-maskable.svg').write_text(flat(0, scale=0.78, theme=THEME), encoding='utf-8')

    sharp = '/home/claude/.npm-global/lib/node_modules/sharp'
    subprocess.run(['node', '-e', f'''
const sharp = require({sharp!r});
const fs = require('fs');
const read = (f) => fs.readFileSync({str(ICONS)!r} + '/' + f);
(async () => {{
  await sharp(read('logo.svg'), {{ density: 384 }}).resize(512, 512)
    .png({{ compressionLevel: 9 }}).toFile({str(ICONS)!r} + '/logo-512.png');
  for (const size of [180, 192, 512]) {{
    await sharp(read('icon.svg'), {{ density: 384 }}).resize(size, size)
      .png({{ compressionLevel: 9 }}).toFile({str(ICONS)!r} + `/icon-${{size}}.png`);
  }}
  await sharp(read('icon-maskable.svg'), {{ density: 384 }}).resize(512, 512)
    .png({{ compressionLevel: 9 }}).toFile({str(ICONS)!r} + '/icon-maskable-512.png');
  console.log('icons written');
}})();
'''], check=True)


if __name__ == '__main__':
    main()
