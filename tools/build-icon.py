#!/usr/bin/env python3
"""Build the IRONLOG logo and app icons.

A flexed arm holding a dumbbell, drawn flat and in colour rather than as a
pencil study — the arm reads as skin, the plates read as metal, and it holds
up at 16px the way a line drawing built from hairline hatching never did.

The arm's contour is the same hand-authored silhouette the previous icon
used (fist, forearm, an elbow notch, the bicep swelling up to a peak,
deltoid and tricep rounding back to the wrist) — it was already a good
flexed-arm shape; what changed is what fills it. Shading is a handful of
soft, semi-transparent ellipses clipped to that contour rather than crossed
hatch lines, which is what makes the small sizes hold together: a hatch
pattern turns to noise under about 96px, a soft gradient doesn't.

The dumbbell is two circles and a line, not traced from any reference photo:
a near plate in front of the fist, a smaller far plate behind it, joined by
a bar. Each plate gets a gradient for the metal, a darker inner ring, and a
light arc for the glint — enough to read as a weight at a glance, not so
much detail that it clutters a 48px launcher icon.

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
METAL_OUTLINE = '#101216'
METAL_DARK = '#1C1E23'
ACCENT = '#FF5C00'       # the app's own accent, on the plate hub

# The dumbbell: a bar through where the fist grips, a small plate tucked
# behind it, a bigger one held out in front. Angled rather than level so it
# reads as *held*, not laid across the hand.
BAR_CENTER = (195, 90)
BAR_ANGLE = -18
_a = math.radians(BAR_ANGLE)
_dx, _dy = math.cos(_a), math.sin(_a)
NEAR_END = (BAR_CENTER[0] - _dx * 110, BAR_CENTER[1] - _dy * 110)
FAR_END = (BAR_CENTER[0] + _dx * 95, BAR_CENTER[1] + _dy * 95)
NEAR_R, FAR_R, BAR_W = 56, 40, 26


def plate(cx, cy, r):
    return (
        f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r}" fill="url(#plateGrad)" '
        f'stroke="{METAL_OUTLINE}" stroke-width="6"/>'
        f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r * 0.6:.1f}" fill="none" '
        f'stroke="{METAL_DARK}" stroke-width="{r * 0.16:.1f}" opacity="0.6"/>'
        f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r * 0.2:.1f}" fill="{ACCENT}"/>'
        f'<path d="M {cx - r * 0.5:.1f} {cy - r * 0.62:.1f} '
        f'A {r * 0.82:.1f} {r * 0.82:.1f} 0 0 1 {cx + r * 0.15:.1f} {cy - r * 0.78:.1f}" '
        f'fill="none" stroke="#8A93A3" stroke-width="{max(3, r * 0.09):.1f}" '
        f'stroke-linecap="round" opacity="0.55"/>'
    )


def dumbbell():
    x1, y1 = NEAR_END
    x2, y2 = FAR_END
    bar = (
        f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
        f'stroke="{METAL_OUTLINE}" stroke-width="{BAR_W + 8}" stroke-linecap="round"/>'
        f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
        f'stroke="url(#barGrad)" stroke-width="{BAR_W}" stroke-linecap="round"/>'
    )
    return bar + plate(x2, y2, FAR_R) + plate(x1, y1, NEAR_R)


def defs():
    return (
        '<linearGradient id="skinGrad" x1="0" y1="0" x2="1" y2="1">'
        '<stop offset="0" stop-color="#F8B87E"/><stop offset="1" stop-color="#E08A4A"/>'
        '</linearGradient>'
        '<linearGradient id="plateGrad" x1="0" y1="0" x2="1" y2="1">'
        '<stop offset="0" stop-color="#6B7280"/><stop offset="0.55" stop-color="#33373F"/>'
        '<stop offset="1" stop-color="#16181C"/>'
        '</linearGradient>'
        '<linearGradient id="barGrad" x1="0" y1="0" x2="1" y2="1">'
        '<stop offset="0" stop-color="#4A505A"/><stop offset="1" stop-color="#22242A"/>'
        '</linearGradient>'
        f'<clipPath id="c-arm"><path d="{ARM}"/></clipPath>'
    )


def illustration():
    """The arm + dumbbell group, no background, no viewBox wrapper — reused
       at every size from the favicon up to the login-screen mark."""
    b = [f'<path d="{ARM}" fill="url(#skinGrad)"/>']
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
    b.append(dumbbell())
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
    (ICONS / 'logo-light.svg').write_text(mark(), encoding='utf-8')
    (ICONS / 'icon.svg').write_text(icon(112), encoding='utf-8')
    (ICONS / 'icon-maskable.svg').write_text(icon(0, scale=0.78), encoding='utf-8')

    # No `sharp` in this environment; the project already carries Playwright
    # for its e2e suite, and a headless page rendering the SVG at exact CSS
    # pixel size makes just as faithful a rasteriser.
    jobs = [('logo.svg', 'logo-512.png', 512),
            ('icon.svg', 'icon-180.png', 180),
            ('icon.svg', 'icon-192.png', 192),
            ('icon.svg', 'icon-512.png', 512),
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
