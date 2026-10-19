#!/usr/bin/env python3
"""Build the IRONLOG logo and app icons.

A flexed arm, drawn flat and in colour rather than as a pencil study — it
reads as skin, and it holds up at 16px the way a line drawing built from
hairline hatching never did. Just the arm: the dumbbell it used to hold was
dropped at the user's request.

The contour is the same hand-authored silhouette the pencil study used
(fist, forearm, an elbow notch, the bicep swelling up to a peak, deltoid
and tricep rounding back to the wrist); what changed is what fills it.
Shading is a handful of soft, semi-transparent ellipses clipped to that
contour rather than crossed hatch lines, which is what keeps small sizes
together: a hatch pattern turns to noise under about 96px, a gradient
doesn't. With nothing in the hand, the fist gets its knuckles and thumb
back so it reads as a fist rather than a blank knob.

Run:  python3 tools/build-icon.py
"""
import math
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent
ICONS = ROOT / 'icons'

# ---------------------------------------------------------------------------
# The arm's contour, clockwise from the top of the fist — unchanged from the
# original study: fist → thumb → wrist → down the forearm's thumb edge →
# NOTCH at the elbow crook → up over the bicep to its peak → deltoid →
# armpit → back along the underside of the upper arm → elbow → up the
# forearm's far edge → wrist → around the fist. The notch is what keeps the
# two limbs reading as two limbs instead of one bent tube, even at icon size.
# ---------------------------------------------------------------------------
ARM = (
    'M196 44 '
    'C226 42 250 62 252 94 '
    'C254 114 247 130 238 141 '
    'C230 150 225 156 223 164 '
    'C231 198 234 234 230 264 '
    'C228 278 224 286 218 292 '
    'C242 261 269 229 300 211 '
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


def ellipse(cx, cy, rx, ry, rot=0):
    a = math.radians(rot)
    ca, sa = math.cos(a), math.sin(a)
    pts = []
    for i in range(56):
        t = 2 * math.pi * i / 56
        x, y = rx * math.cos(t), ry * math.sin(t)
        pts.append((cx + x * ca - y * sa, cy + x * sa + y * ca))
    return 'M' + 'L'.join(f'{x:.1f} {y:.1f}' for x, y in pts) + 'Z'


# Soft shading, clipped to the arm — the crook, the underside of each mass,
# the forearm's far edge, the deltoid rolling under.
SHADOWS = [
    ellipse(224, 268, 30, 46, -16),
    ellipse(286, 306, 74, 28, -12),
    ellipse(296, 388, 104, 28, -6),
    ellipse(140, 262, 26, 92, -3),
    ellipse(410, 322, 34, 48, -26),
]

# Where the light catches: the bicep peak, down the forearm.
HIGHLIGHTS = [
    ellipse(292, 218, 62, 26, -20),
    ellipse(172, 210, 26, 62, -6),
]

# A few creases, kept spare — a flat icon reads clean, not sketched.
CREASES = [
    'M160 90 C176 80 200 78 220 86',       # knuckles
    'M162 110 C178 102 200 100 218 106',
    'M214 106 C226 110 233 118 234 130',   # thumb
    'M162 150 C176 160 200 160 214 152',   # wrist
    'M198 186 C208 238 206 296 196 348',   # the groove down the forearm
    'M218 232 C248 208 284 198 320 204',   # the bicep's two heads
    'M228 300 C260 318 302 322 338 308',   # under the bicep
    'M214 384 C262 406 328 404 374 376',   # the tricep's lower edge
]

# ---------------------------------------------------------------------------
# Colour
# ---------------------------------------------------------------------------
BG = '#0B0B0C'          # matches --surface
INK = '#7A431E'          # contour and creases — a warm shadow, not black

# The contour's bounding box is centred on x 275, y 235; this puts it on
# the canvas centre.
CENTRE = 'translate(-19 21)'


def defs():
    return (
        '<linearGradient id="skinGrad" x1="0" y1="0" x2="1" y2="1">'
        '<stop offset="0" stop-color="#F8B87E"/><stop offset="1" stop-color="#E08A4A"/>'
        '</linearGradient>'
        f'<clipPath id="c-arm"><path d="{ARM}"/></clipPath>'
    )


def illustration():
    """The arm, no background, no viewBox wrapper — reused at every size
       from the favicon up to the login-screen mark."""
    b = [f'<g transform="{CENTRE}">', f'<path d="{ARM}" fill="url(#skinGrad)"/>']
    b.append('<g clip-path="url(#c-arm)">')
    for d in SHADOWS:
        b.append(f'<path d="{d}" fill="#B9622C" opacity="0.32"/>')
    for d in HIGHLIGHTS:
        b.append(f'<path d="{d}" fill="#FFE0BB" opacity="0.4"/>')
    creases = ''.join(f'<path d="{d}"/>' for d in CREASES)
    b.append(f'<g fill="none" stroke="{INK}" stroke-width="4.5" stroke-linecap="round" '
             f'opacity="0.45">{creases}</g>')
    b.append('</g>')
    b.append(f'<path d="{ARM}" fill="none" stroke="{INK}" stroke-width="12" stroke-linejoin="round"/>')
    b.append('</g>')
    return ''.join(b)


def icon(radius=112, scale=1.0):
    t = '' if scale == 1.0 else (' transform="translate(256 256) '
                                  f'scale({scale}) translate(-256 -256)"')
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">'
        f'<defs>{defs()}</defs>'
        f'<rect width="512" height="512" rx="{radius}" fill="{BG}"/>'
        f'<g{t}>{illustration()}</g>'
        '</svg>'
    )


def mark():
    """The square mark for the login screen — same art, no corner radius;
       the img tag's own border-radius clips it."""
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">'
        f'<defs>{defs()}</defs>'
        f'<rect width="512" height="512" fill="{BG}"/>'
        f'{illustration()}'
        '</svg>'
    )


def main():
    ICONS.mkdir(exist_ok=True)
    (ICONS / 'logo.svg').write_text(mark(), encoding='utf-8')
    (ICONS / 'icon.svg').write_text(icon(112), encoding='utf-8')
    (ICONS / 'icon-maskable.svg').write_text(icon(0, scale=0.78), encoding='utf-8')

    # No `sharp` in this environment; the project already carries Playwright
    # for its e2e suite, and a headless page rendering the SVG at exact CSS
    # pixel size makes just as faithful a rasteriser.
    # Launcher PNGs come from the square mark, not the rounded favicon: the
    # OS rounds home-screen icons itself, and pre-rounded art leaves the
    # page's white showing in the corners.
    jobs = [('logo.svg', 'icon-180.png', 180),
            ('logo.svg', 'icon-192.png', 192),
            ('logo.svg', 'icon-512.png', 512),
            ('icon-maskable.svg', 'icon-maskable-512.png', 512)]
    job_list = ', '.join(f'[{svg!r}, {png!r}, {size}]' for svg, png, size in jobs)
    subprocess.run(['node', '-e', f'''
const {{ chromium }} = require('playwright');
const fs = require('fs');
const ROOT = {str(ICONS)!r};
const jobs = [{job_list}];
(async () => {{
  const browser = await chromium.launch({{ executablePath: '/opt/pw-browsers/chromium' }});
  for (const [svg, png, size] of jobs) {{
    const page = await browser.newPage({{ viewport: {{ width: size, height: size }} }});
    const markup = fs.readFileSync(ROOT + '/' + svg, 'utf8')
      .replace('<svg ', '<svg style="width:100%;height:100%;display:block" ');
    await page.setContent(`<html><body style="margin:0">${{markup}}</body></html>`);
    await page.screenshot({{ path: ROOT + '/' + png, omitBackground: false }});
    await page.close();
  }}
  await browser.close();
  console.log('icons written');
}})();
'''], check=True, cwd=str(ROOT))


if __name__ == '__main__':
    main()
