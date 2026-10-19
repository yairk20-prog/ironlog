#!/usr/bin/env python3
"""Build the IRONLOG logo and app icons from a photograph.

The mark is a real photo of a flexed biceps at the top of a curl — the
same public-domain set the exercise demos use (yuhonas/free-exercise-db,
Unlicense), so the logo and the app's photography are one family. It
replaced the drawn arm at the user's request: a photograph, not a drawing.

Crops are hand-picked boxes on the source frame:
  · the app icon is tight on the arm, so it still reads at launcher size;
  · the maskable icon is the same subject zoomed out by 1/0.8, because
    Android may cut anything outside the centre 80% circle;
  · the launcher PNGs are full-bleed squares — iOS and Android round the
    corners themselves, and pre-rounded art gets rounded twice.

The SVGs (favicon, login mark) embed the photo, so every path that
already references icon.svg / logo.svg keeps working unchanged.

Needs Pillow. Run:  python3 tools/build-icon.py
"""
import base64
import io
import pathlib
import urllib.request

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parent.parent
ICONS = ROOT / 'icons'
SOURCE = ('https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/'
          'exercises/One_Arm_Dumbbell_Preacher_Curl/1.jpg')
CACHE = ROOT / 'tools' / '.icon-source.jpg'

# (left, top, right, bottom) on the 850×567 source frame.
ICON_BOX = (285, 80, 615, 410)       # the flexed arm, dumbbell above it
MASKABLE_BOX = (244, 39, 656, 451)   # same centre, 1.25× wider


def source():
    if not CACHE.exists():
        CACHE.write_bytes(urllib.request.urlopen(SOURCE, timeout=30).read())
    return Image.open(CACHE).convert('RGB')


def grade(img):
    """A little more contrast and bite, and the corners pulled toward black
    so the photo sits on the app's black ground instead of floating on it."""
    img = ImageEnhance.Contrast(img).enhance(1.12)
    img = ImageEnhance.Color(img).enhance(1.06)
    w, h = img.size
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).ellipse((-w * 0.18, -h * 0.18, w * 1.18, h * 1.18), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(w * 0.12))
    dark = ImageEnhance.Brightness(img).enhance(0.55)
    return Image.composite(img, dark, mask)


def square(img, box, size):
    out = grade(img.crop(box).resize((size, size), Image.LANCZOS))
    return out.filter(ImageFilter.UnsharpMask(radius=1.2, percent=60, threshold=2))


def jpeg_data_uri(img, quality=84):
    buf = io.BytesIO()
    img.save(buf, 'JPEG', quality=quality, optimize=True, progressive=True)
    return 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode('ascii')


def svg(img, radius=0):
    """The photo inside an SVG — rounded for the favicon, square otherwise."""
    uri = jpeg_data_uri(img)
    clip = (f'<defs><clipPath id="r"><rect width="512" height="512" rx="{radius}"/></clipPath></defs>'
            if radius else '')
    attr = ' clip-path="url(#r)"' if radius else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">'
            f'{clip}<image href="{uri}" width="512" height="512"{attr}/></svg>')


def main():
    ICONS.mkdir(exist_ok=True)
    src = source()
    icon = square(src, ICON_BOX, 512)
    maskable = square(src, MASKABLE_BOX, 512)

    for size in (180, 192, 512):
        icon.resize((size, size), Image.LANCZOS).save(ICONS / f'icon-{size}.png', optimize=True)
    maskable.save(ICONS / 'icon-maskable-512.png', optimize=True)

    (ICONS / 'icon.svg').write_text(svg(icon, radius=112), encoding='utf-8')
    (ICONS / 'icon-maskable.svg').write_text(svg(maskable), encoding='utf-8')
    (ICONS / 'logo.svg').write_text(svg(icon), encoding='utf-8')
    print('icons written')


if __name__ == '__main__':
    main()
