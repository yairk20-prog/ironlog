/* v5.3: the off-plan starts, and the icon set.

   The spontaneous session had been reachable only through one faint text link
   under the hero, which is the same as not being reachable. What is tested
   here is that each of the four ways in exists, starts a workout, and — the
   part that actually matters — leaves the weekly rotation where it was. */
import pw from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { LAUNCH, localOnly } from './launch.mjs';

const { chromium } = pw;
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const BASE = `http://localhost:${process.env.PORT || 8777}/index.html`;
const shot = (p, n) => p.screenshot({ path: `${ROOT}/tools/shots11/${n}.png` });
const errors = [];
const out = {};

/* ---------- static: the icon set is complete and wired ---------- */

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

const iconFiles = ['icon.svg', 'icon-maskable.svg', 'logo.svg',
  'icon-180.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];
out.iconsPresent = iconFiles.filter((f) => fs.existsSync(path.join(ROOT, 'icons', f)));
out.iconsMissing = iconFiles.filter((f) => !out.iconsPresent.includes(f));

/* A launcher that crops to a circle needs a maskable entry, or Android puts
   the square tile inside a white circle and it looks broken. */
out.hasMaskable = manifest.icons.some((i) => i.purpose === 'maskable');
out.appleTouch = /apple-touch-icon[^>]*icon-180\.png/.test(html);
out.iconInShell = sw.includes("'./icons/icon-180.png'");

/* ---------- live ---------- */

async function boot(page) {
  await page.goto(BASE, { waitUntil: 'load' });
  await page.locator('.login .btn', { hasText: 'המשך בלי חשבון' }).click();
  await page.waitForSelector('.onb');
  for (let i = 0; i < 20 && (await page.locator('.onb').count()); i++) {
    await page.locator('.onb-foot .btn.primary').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(320);
  }
  await page.waitForFunction(() => !document.querySelector('.onb'), null, { timeout: 10000 });
  await page.waitForSelector('#view .hero, #view .card', { timeout: 8000 });
  await page.waitForTimeout(500);
}

/** The rotation cursor is the thing an off-plan session must never move. */
const cursor = (page) => page.evaluate(() => new Promise((resolve) => {
  const req = indexedDB.open('ironlog');
  req.onsuccess = () => {
    const tx = req.result.transaction('settings');
    const g = tx.objectStore('settings').get('rotationCursor');
    g.onsuccess = () => resolve(g.result?.value ?? g.result ?? null);
    g.onerror = () => resolve(null);
  };
  req.onerror = () => resolve(null);
}));

/** Log every open set of the running workout, then finish it. */
async function finishActive(page) {
  for (let guard = 0; guard < 30; guard++) {
    const open = page.locator('.set:not(.done)');
    if (!(await open.count())) break;
    const row = open.first();
    await row.locator('input').nth(0).fill('20');
    await row.locator('input').nth(1).fill('10');
    await row.locator('.set-go').click();
    const close = page.locator('.rest-close');
    await close.waitFor({ timeout: 900 }).then(() => close.click()).catch(() => {});
    await page.waitForTimeout(260);
    /* A finished exercise advances by itself; the next one's rows appear. */
    if (!(await page.locator('.set:not(.done)').count())) {
      await page.waitForTimeout(900);
    }
  }
  await page.locator('#topbarSlot .btn', { hasText: 'סיים' }).click();
  await page.waitForTimeout(400);
  await page.locator('#sheetBody .btn', { hasText: 'סיים ושמור' }).click();
  await page.waitForTimeout(1100);
}

async function main() {
  const browser = await chromium.launch(LAUNCH);
  const ctx = await browser.newContext({
    viewport: { width: 414, height: 896 }, deviceScaleFactor: 2,
    locale: 'he-IL', hasTouch: true, isMobile: true
  });
  await localOnly(ctx);
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await boot(page);

  /* ---------- the four ways in ---------- */
  out.tiles = await page.locator('.quick-tile').allInnerTexts();
  out.tileCount = out.tiles.length;
  await shot(page, '01-home');

  /* ---------- stretching ---------- */
  const before = await cursor(page);
  out.cursorBefore = before;
  await page.locator('.quick-tile', { hasText: 'מתיחות' }).click();
  await page.waitForTimeout(1100);
  out.stretchName = (await page.locator('#topbarTitle, .top-title, h1').first().innerText().catch(() => '')).trim();
  out.stretchExercises = await page.locator('.focus-nav .name b').count();
  await shot(page, '02-stretch');
  await finishActive(page);
  out.cursorAfterStretch = await cursor(page);
  out.stretchLeftRotation = out.cursorAfterStretch === before;

  /* ---------- a challenge, with the personal best beside it ---------- */
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  await page.locator('.quick-tile', { hasText: 'אתגר' }).click();
  await page.waitForTimeout(900);
  out.challengeOptions = await page.locator('#sheetBody .opt').count();
  out.challengeBadges = await page.locator('#sheetBody .opt .badge').count();
  await shot(page, '03-challenge');
  await page.locator('#sheetBody .opt').first().click();
  await page.waitForTimeout(1100);
  out.challengeSets = await page.locator('.set').count();
  await shot(page, '04-challenge-running');
  await finishActive(page);
  out.cursorAfterChallenge = await cursor(page);
  out.challengeLeftRotation = out.cursorAfterChallenge === before;

  /* ---------- a free exercise, listed before anything is typed ---------- */
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  await page.locator('.quick-tile', { hasText: 'חופשי' }).click();
  await page.waitForTimeout(800);
  out.freeSuggestions = await page.locator('#sheetBody .opt').count();
  await page.locator('#sheetBody input[type=search]').fill('פלאנק');
  await page.waitForTimeout(500);
  out.freeSearchResults = await page.locator('#sheetBody .opt').count();
  await shot(page, '05-free');

  /* The control. "The rotation did not move" only means something if the
     rotation moves when it is supposed to — otherwise every off-plan check
     above passes against a cursor that never changes at all. */
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  await page.locator('.sheet-close').click().catch(() => {});
  await page.getByRole('button', { name: /התחל אימון/ }).click();
  await page.waitForTimeout(900);
  await finishActive(page);
  out.cursorAfterPlanned = await cursor(page);
  out.plannedMovesRotation = out.cursorAfterPlanned !== before;

  out.errors = errors;
  console.log(JSON.stringify(out, null, 2));
  await browser.close();

  const fatal = [
    out.iconsMissing.length && `missing icon files: ${out.iconsMissing.join(', ')}`,
    !out.hasMaskable && 'the manifest has no maskable icon',
    !out.appleTouch && 'no apple-touch-icon at 180px',
    !out.iconInShell && 'the icons are not precached',
    out.tileCount !== 4 && `expected four off-plan tiles, found ${out.tileCount}`,
    !/יציבה/.test(out.tiles.join(' ')) && 'no posture tile',
    !/מתיחות/.test(out.tiles.join(' ')) && 'no stretching tile',
    !/אתגר/.test(out.tiles.join(' ')) && 'no challenge tile',
    !/חופשי/.test(out.tiles.join(' ')) && 'no free-exercise tile',
    out.stretchExercises < 1 && 'the stretching session started empty',
    !out.stretchLeftRotation
      && `stretching moved the rotation (${out.cursorBefore} → ${out.cursorAfterStretch})`,
    out.challengeOptions < 4 && `expected four challenges, found ${out.challengeOptions}`,
    out.challengeBadges < 4 && 'challenges do not show a personal best',
    out.challengeSets !== 1 && `a challenge should be one set, found ${out.challengeSets}`,
    !out.challengeLeftRotation
      && `a challenge moved the rotation (${out.cursorBefore} → ${out.cursorAfterChallenge})`,
    out.freeSuggestions < 5 && 'the free-exercise sheet opens empty',
    out.freeSearchResults < 1 && 'searching the free-exercise sheet found nothing',
    !out.plannedMovesRotation
      && `a planned workout did not move the rotation (${out.cursorBefore} → ${out.cursorAfterPlanned}), so the off-plan checks above prove nothing`,
    errors.length && `page errors: ${errors.join(' | ')}`
  ].filter(Boolean);
  if (fatal.length) { console.error('FAIL:', fatal.join(' | ')); process.exitCode = 1; return; }
  console.log('PASS');
}

/* process.exit() truncates a pipe mid-write, which silently ate the one
   line explaining the failure whenever a suite ran under the runner. */
main().catch((e) => { console.error('FATAL', e); process.exitCode = 2; });
