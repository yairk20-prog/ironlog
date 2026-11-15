/* Build the icons for the home-screen shortcuts (manifest "shortcuts").

   Long-pressing the app icon on Android lists these, and each can be dragged
   onto the home screen as a button of its own — the nearest thing to a
   widget a web app has. The glyphs are the app's own line icons (js/ui.js),
   white on the app's orange, edge to edge, with the glyph inside the
   maskable safe zone (the middle 80%) so a launcher that crops icons to its
   own shape — Samsung's does — never cuts into it.

   The files carry a version in their name: Chrome bakes shortcut icons into
   the installed app when it updates it, and fetches them again only when
   their address changes. The first set reached phones as empty squares;
   new names make Chrome fetch them anew. Bump VERSION for any redraw.

   Run: node tools/build-shortcut-icons.mjs */
import fs from 'node:fs';
import path from 'node:path';
import pw from 'playwright';
import { LAUNCH } from './launch.mjs';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const ui = fs.readFileSync(path.join(ROOT, 'js/ui.js'), 'utf8');
const glyph = (name) => {
  const m = new RegExp(`\\n  ${name}: '([^']+)'`).exec(ui);
  if (!m) throw new Error(`no icon ${name} in js/ui.js`);
  return m[1];
};

export const VERSION = 2;
const SHORTCUTS = {
  water: 'glass',
  food: 'plus',
  saved: 'heart',
  workout: 'dumbbell'
};
const SIZES = [96, 192];

/* 24-unit glyph scaled ×4.5 = 108 of 192: its corners stay inside the
   safe-zone circle (radius 40% = 76.8 from the centre). */
const svg = (paths, size) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192" width="${size}" height="${size}">
  <rect width="192" height="192" fill="#FF5C00"/>
  <g transform="translate(42 42) scale(4.5)" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="square" stroke-linejoin="miter">${paths}</g>
</svg>`;

const browser = await pw.chromium.launch(LAUNCH);
for (const size of SIZES) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  for (const [file, name] of Object.entries(SHORTCUTS)) {
    await page.setContent(`<html><body style="margin:0">${svg(glyph(name), size)}</body></html>`);
    await page.screenshot({ path: path.join(ROOT, 'icons', `shortcut-${file}-v${VERSION}-${size}.png`) });
  }
  await page.close();
}
await browser.close();
console.log(`wrote ${Object.keys(SHORTCUTS).length * SIZES.length} shortcut icons (v${VERSION})`);
