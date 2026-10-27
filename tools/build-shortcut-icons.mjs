/* Build the icons for the home-screen shortcuts (manifest "shortcuts").

   Long-pressing the app icon on Android lists these, and each can be dragged
   onto the home screen as a button of its own — the nearest thing to a
   widget a web app has. The glyphs are the app's own line icons (js/ui.js),
   drawn orange on the app's dark tile, so a shortcut looks like part of the
   app rather than a generic link.

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

const SHORTCUTS = {
  'sc-water': 'glass',
  'sc-food': 'plus',
  'sc-saved': 'heart',
  'sc-workout': 'dumbbell'
};

const svg = (paths) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192" width="192" height="192">
  <rect width="192" height="192" fill="#141417"/>
  <g transform="translate(48 48) scale(4)" fill="none" stroke="#FF5C00" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter">${paths}</g>
</svg>`;

const browser = await pw.chromium.launch(LAUNCH);
const page = await browser.newPage({ viewport: { width: 192, height: 192 } });
for (const [file, name] of Object.entries(SHORTCUTS)) {
  await page.setContent(`<html><body style="margin:0">${svg(glyph(name))}</body></html>`);
  await page.screenshot({ path: path.join(ROOT, 'icons', `${file}.png`) });
}
await browser.close();
console.log(`wrote ${Object.keys(SHORTCUTS).length} shortcut icons`);
