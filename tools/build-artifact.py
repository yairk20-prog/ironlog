#!/usr/bin/env python3
"""Prepare the artifact publish: the page body plus the list of files to ship.

The artifact hosts the real app, not a rebuild of it — every module, stylesheet
and photograph is published alongside the page at its own path, so what runs on
claude.ai is byte-for-byte what runs on Netlify. This script only strips the
document skeleton the publisher supplies itself, and writes the manifest of
supporting files for the publish call.
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'artifact'

# Everything the app loads at run time. tools/, README and the deploy config
# are not part of the running site.
INCLUDE_DIRS = ('js', 'css', 'icons', 'img')
INCLUDE_FILES = ('manifest.webmanifest',)


def page():
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    body = html.split('<body>', 1)[1].split('</body>', 1)[0].strip()
    head = '\n'.join([
        '<title>IRONLOG · אימון</title>',
        '<link rel="stylesheet" href="css/styles.css">',
        # The publish skeleton owns <html>, so the app claims direction,
        # language and its own dark ground from inside the page.
        '<style>:root{color-scheme:dark;direction:rtl;background:#000}'
        'html,body{height:100%;background:#000}</style>',
        '<script>document.documentElement.setAttribute("dir","rtl");'
        'document.documentElement.setAttribute("lang","he");</script>'
    ])
    return f'{head}\n{body}\n'


def files():
    out = []
    for d in INCLUDE_DIRS:
        for p in sorted((ROOT / d).rglob('*')):
            if p.is_file():
                out.append(str(p.relative_to(ROOT)).replace('\\', '/'))
    out.extend(INCLUDE_FILES)
    return out


def main():
    OUT.mkdir(exist_ok=True)
    (OUT / 'index.html').write_text(page(), encoding='utf-8')
    manifest = files()
    (OUT / 'files.json').write_text(json.dumps(manifest, indent=0), encoding='utf-8')
    print(f'page: {(OUT / "index.html").stat().st_size} bytes')
    print(f'files: {len(manifest)} (limit 255)')


if __name__ == '__main__':
    main()
