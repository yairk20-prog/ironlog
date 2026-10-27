/* v5.15: adding water and food from outside the app.

   · the manifest's home-screen shortcuts exist, with their icons
   · ?quick=water adds exactly one glass — once: the address is cleaned
     before acting, so a reload never adds again — and the sheet's own
     buttons add, add a bottle and take back
   · ?quick=food / saved / photo open the same sheets as inside the app,
     on today, and what is added there is stored like any other food
   · an unknown ?quick= and a ?quick= before the questionnaire do nothing
   · the notification's water button, run in the real service worker, adds
     one glass with the same record shape, refreshes an open app, reports
     the new total to the reminders server, and redraws the quick card
   · the race: the app holds a copy of today, a notification adds water,
     then food is added in the app — the glass is not lost
   · the quick card switch: permission, the card with its two buttons, off */
import pw from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { LAUNCH, localOnly } from './launch.mjs';

const { chromium } = pw;
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const ORIGIN = `http://localhost:${process.env.PORT || 8777}`;
const BASE = `${ORIGIN}/index.html`;
const SHOTS = `${ROOT}/tools/shots19`;
fs.mkdirSync(SHOTS, { recursive: true });
const shot = (p, n) => p.screenshot({ path: `${SHOTS}/${n}.png` });
const errors = [];
const out = {};
let BROWSER = null;
let PAGE = null;
const pause = (page, ms = 300) => page.waitForTimeout(ms);

const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const today = (page) => page.evaluate(async (iso) => {
  const db = await import('./js/db.js');
  return (await db.byIndex('nutrition_logs', 'date', IDBKeyRange.only(iso)))[0] || null;
}, isoToday());
const water = async (page) => (await today(page))?.water_ml || 0;
const setting = (page, k) => page.evaluate(async (k) => (await import('./js/db.js')).setting(k, null), k);

async function onboard(page) {
  await page.locator('.login .btn', { hasText: 'המשך בלי חשבון' }).click();
  await page.waitForSelector('.onb');
  for (let i = 0; i < 20 && (await page.locator('.onb').count()); i++) {
    await page.locator('.onb-foot .btn.primary').click({ timeout: 5000 }).catch(() => {});
    await pause(page, 320);
  }
  await page.waitForFunction(() => !document.querySelector('.onb'), null, { timeout: 10000 });
  await pause(page, 500);
}

/** Run a notification button through the real service worker. */
const tapNotification = (page, action, data = {}) => page.evaluate(async ([action, data]) => {
  const reg = await navigator.serviceWorker.ready;
  reg.active.postMessage({ type: 'notification-action', action, data, tag: 'ironlog-water' });
}, [action, data]);

async function main() {
  /* ---------- the manifest ---------- */
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
  out.shortcuts = (manifest.shortcuts || []).map((s) => `${s.short_name}|${s.url}`);
  out.shortcutIconsExist = (manifest.shortcuts || []).every((s) => (s.icons || []).every((i) => fs.existsSync(path.join(ROOT, i.src))));

  const browser = BROWSER = await chromium.launch(LAUNCH);

  /* ---------- a shortcut before the questionnaire: nothing happens ---------- */
  {
    const c0 = await browser.newContext({ viewport: { width: 414, height: 896 }, locale: 'he-IL', hasTouch: true, isMobile: true });
    await localOnly(c0);
    const p0 = await c0.newPage();
    p0.on('pageerror', (e) => errors.push(`pageerror(fresh): ${e.message}`));
    await p0.goto(`${BASE}?quick=water#/nutrition`, { waitUntil: 'load' });
    await onboard(p0);
    out.freshWater = await water(p0);
    out.freshUrl = await p0.evaluate(() => location.search);
    await c0.close();
  }

  const ctx = await browser.newContext({ viewport: { width: 414, height: 896 }, deviceScaleFactor: 2, locale: 'he-IL', hasTouch: true, isMobile: true });
  await localOnly(ctx);
  await ctx.grantPermissions(['notifications'], { origin: ORIGIN });
  /* record what the app asks to show in the notification shade */
  await ctx.addInitScript(() => {
    const orig = ServiceWorkerRegistration.prototype.showNotification;
    window.__shown = [];
    ServiceWorkerRegistration.prototype.showNotification = function (title, options) {
      window.__shown.push({ title, options: JSON.parse(JSON.stringify(options || {})) });
      return orig.call(this, title, options).catch(() => {});
    };
  });
  const page = PAGE = await ctx.newPage();
  page.setDefaultTimeout(8000);
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(BASE, { waitUntil: 'load' });
  await onboard(page);
  /* let the service worker take control, as it does on a phone */
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10000 });
  await pause(page, 500);

  /* ---------- ?quick=water ---------- */
  await page.goto(`${BASE}?quick=water#/nutrition`, { waitUntil: 'load' });
  await page.waitForSelector('#sheetBody .qw-line', { timeout: 8000 });
  await pause(page, 500);
  out.qwTitle = (await page.locator('#sheetTitle').innerText()).trim();
  out.qwLine = (await page.locator('#sheetBody .qw-line').innerText()).replace(/\s+/g, ' ');
  out.qwWater = await water(page);
  out.qwSearch = await page.evaluate(() => location.search);
  await shot(page, '01-quick-water');
  await page.locator('#sheetBody .btn.water-add').click();
  await pause(page, 600);
  out.qwAfterMore = await water(page);
  out.qwLineMore = (await page.locator('#sheetBody .qw-line b').innerText()).trim();
  await page.locator('#sheetBody .btn', { hasText: 'בקבוק' }).click();
  await pause(page, 600);
  out.qwAfterBottle = await water(page);
  await page.locator('#sheetBody .btn', { hasText: 'בטל כוס' }).click();
  await pause(page, 600);
  out.qwAfterUndo = await water(page);
  await page.locator('.sheet-close').click();
  await pause(page, 500);
  out.tankAfter = (await page.locator('.tank-text b').innerText()).trim();

  /* a reload does not add again */
  await page.reload({ waitUntil: 'load' });
  await pause(page, 1200);
  out.afterReload = await water(page);
  out.sheetAfterReload = await page.locator('#sheet').isVisible();

  /* ---------- ?quick=food / saved / photo ---------- */
  await page.goto(`${BASE}?quick=food#/home`, { waitUntil: 'load' });
  await page.waitForSelector('#sheetBody .add-tile', { timeout: 8000 });
  await pause(page, 400);
  out.foodTitle = (await page.locator('#sheetTitle').innerText()).trim();
  out.foodRoute = await page.evaluate(() => location.hash);
  out.foodTiles = await page.locator('#sheetBody .add-tile').count();
  await shot(page, '02-quick-food');
  await page.locator('#sheetBody .add-tile', { hasText: 'תיאור חופשי' }).click();
  await pause(page, 300);
  await page.locator('#sheetBody textarea').fill('סקופ חלבון');
  await pause(page, 300);
  await page.locator('#sheetBody .btn.primary', { hasText: 'הוסף ל' }).click();
  await pause(page, 700);
  await page.locator('.sheet-close').click().catch(() => {});
  await pause(page, 300);
  out.foodStored = ((await today(page))?.items || []).map((i) => `${i.label}:${i.kcal}`);

  await page.goto(`${BASE}?quick=saved#/nutrition`, { waitUntil: 'load' });
  await page.waitForSelector('#sheet:not([hidden])', { timeout: 8000 });
  await pause(page, 500);
  out.savedTitle = (await page.locator('#sheetTitle').innerText()).trim();
  out.savedRecent = (await page.locator('#sheetBody').innerText()).includes('סקופ אבקת חלבון');
  await page.locator('.sheet-close').click();
  await pause(page, 300);

  await page.goto(`${BASE}?quick=photo#/nutrition`, { waitUntil: 'load' });
  await page.waitForSelector('#sheet:not([hidden])', { timeout: 8000 });
  await pause(page, 400);
  out.photoTitle = (await page.locator('#sheetTitle').innerText()).trim();
  await page.locator('.sheet-close').click();
  await pause(page, 300);

  const before = await water(page);
  await page.goto(`${BASE}?quick=nonsense#/nutrition`, { waitUntil: 'load' });
  await pause(page, 1000);
  out.bogusSheet = await page.locator('#sheet').isVisible();
  out.bogusSearch = await page.evaluate(() => location.search);
  out.bogusWater = (await water(page)) - before;

  /* ---------- the notification's water button, in the service worker ---------- */
  await page.goto(`${BASE}#/nutrition`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10000 });
  await pause(page, 600);
  const w0 = await water(page);
  const tank0 = (await page.locator('.tank-text b').innerText()).trim();
  /* reminders on, so the worker also reports the new total */
  await page.evaluate(async () => {
    const db = await import('./js/db.js');
    await db.setSetting('pushId', 'p_testtesttesttesttesttesttest');
    await db.setSetting('reminders', { on: true, prefs: {} });
  });
  await tapNotification(page, 'water', {});
  await page.waitForFunction(async (w) => {
    const db = await import('./js/db.js');
    const d = new Date();
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const r = (await db.byIndex('nutrition_logs', 'date', IDBKeyRange.only(iso)))[0];
    return (r?.water_ml || 0) === w + 250;
  }, w0, { timeout: 6000 }).catch(() => {});
  await pause(page, 800);
  out.swWaterDelta = (await water(page)) - w0;
  out.swRecordShape = Object.keys((await today(page)) || {}).sort().join(',');
  out.swRefreshedApp = (await page.locator('.tank-text b').innerText()).trim() !== tank0;
  const log = await page.evaluate(() => fetch('/api/push?last').then((r) => r.json()));
  const prog = log.filter((m) => m.action === 'progress' && m.id === 'p_testtesttesttesttesttesttest').pop();
  out.swReported = prog?.progress?.water_ml;

  /* ---------- the race: a held copy of today, a notification glass, then food ---------- */
  await page.locator('.meal', { hasText: 'נשנושים' }).locator('.meal-add').click();
  await pause(page, 400);
  await page.locator('#sheetBody .add-tile', { hasText: 'תיאור חופשי' }).click();
  await pause(page, 300);
  const w1 = await water(page);
  await tapNotification(page, 'water', {});
  await pause(page, 1200);
  await page.locator('#sheetBody textarea').fill('בננה');
  await pause(page, 300);
  await page.locator('#sheetBody .btn.primary', { hasText: 'הוסף ל' }).click();
  await pause(page, 800);
  await page.locator('.sheet-close').click().catch(() => {});
  const raceDay = await today(page);
  out.raceWater = (raceDay?.water_ml || 0) - w1;
  out.raceBanana = (raceDay?.items || []).some((i) => i.label === 'בננה' && i.meal === 'other');

  /* ---------- the in-app water button still adds one glass ---------- */
  const w2 = await water(page);
  await page.locator('.btn.water-add').click();
  await pause(page, 700);
  out.inAppDelta = (await water(page)) - w2;

  /* ---------- the quick card ---------- */
  await page.goto(`${BASE}#/settings`, { waitUntil: 'load' });
  await pause(page, 900);
  await page.locator('.sect-head', { hasText: 'הוספה מהירה' }).click();
  await pause(page, 300);
  await shot(page, '03-settings');
  await page.evaluate(() => { window.__shown = []; });
  await page.locator('.quick-panel .btn', { hasText: 'הצג כרטיס' }).click();
  await pause(page, 900);
  out.cardOn = await setting(page, 'quickCard');
  const shown = await page.evaluate(() => window.__shown);
  const card = shown.find((s) => s.options.tag === 'ironlog-quick');
  out.card = card ? { title: card.title, body: card.options.body, actions: (card.options.actions || []).map((a) => a.action), sticky: card.options.requireInteraction } : null;
  out.cardButton = (await page.locator('.quick-panel .btn').innerText()).trim();

  /* the card's own water button: one glass, and the card is redrawn */
  const w3 = await water(page);
  await tapNotification(page, 'water', { quick: true });
  await pause(page, 1200);
  out.cardWaterDelta = (await water(page)) - w3;
  out.cardRedrawn = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    const n = await reg.getNotifications({ tag: 'ironlog-quick' });
    return n.length ? n[0].body : null;
  });

  await page.locator('.quick-panel .btn', { hasText: 'הסר' }).click();
  await pause(page, 600);
  out.cardOff = await setting(page, 'quickCard');

  /* the "עוד" screen leads here too */
  await page.goto(`${BASE}#/more`, { waitUntil: 'load' });
  await pause(page, 700);
  await page.locator('.list-link', { hasText: 'הוספה מהירה' }).click();
  await pause(page, 400);
  out.moreSheet = await page.locator('#sheetBody .quick-panel').count();

  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto(`${BASE}?quick=water#/nutrition`, { waitUntil: 'load' });
  await page.waitForSelector('#sheetBody .qw-line', { timeout: 8000 });
  await pause(page, 400);
  out.overflow360 = await page.evaluate(() => document.querySelector('#sheetBody').scrollWidth > document.querySelector('#sheetBody').clientWidth + 1);
  await shot(page, '04-quick-water-360');

  out.errors = errors;
  console.log(JSON.stringify(out, null, 2));
  await browser.close();

  const fatal = [
    !['כוס מים|./index.html?quick=water#/nutrition', 'הוסף מאכל|./index.html?quick=food#/nutrition', 'שמורים|./index.html?quick=saved#/nutrition'].every((s) => out.shortcuts.includes(s))
      && `shortcuts: ${out.shortcuts}`,
    !out.shortcutIconsExist && 'a shortcut icon is missing',
    out.freshWater !== 0 && 'a shortcut before the questionnaire added water',
    out.freshUrl !== '' && 'the shortcut parameter stayed in the address',
    out.qwTitle !== 'כוס מים נוספה' && `quick water sheet: ${out.qwTitle}`,
    out.qwWater !== 250 && `?quick=water should add exactly 250 ml, got ${out.qwWater}`,
    !/^1 מתוך 12 כוסות/.test(out.qwLine) && `quick water count: ${out.qwLine}`,
    out.qwSearch !== '' && 'the ?quick parameter was not removed',
    out.qwAfterMore !== 500 && `"עוד כוס": ${out.qwAfterMore}`,
    out.qwLineMore !== '2' && `the sheet count did not follow: ${out.qwLineMore}`,
    out.qwAfterBottle !== 1250 && `bottle: ${out.qwAfterBottle}`,
    out.qwAfterUndo !== 1000 && `take back a glass: ${out.qwAfterUndo}`,
    out.tankAfter !== '4' && `the water card behind the sheet: ${out.tankAfter}`,
    out.afterReload !== 1000 && `a reload added water again: ${out.afterReload}`,
    out.sheetAfterReload && 'a reload reopened the quick sheet',
    !/^הוספת מאכל/.test(out.foodTitle) && `quick food: ${out.foodTitle}`,
    out.foodRoute !== '#/nutrition' && `quick food stayed on ${out.foodRoute}`,
    out.foodTiles !== 4 && 'quick food does not offer the four ways',
    !out.foodStored.includes('סקופ אבקת חלבון:120') && `quick food stored: ${out.foodStored}`,
    out.savedTitle !== 'מאכלים שמורים' && `quick saved: ${out.savedTitle}`,
    !out.savedRecent && 'quick saved does not list the food just eaten',
    out.photoTitle !== 'צילום הצלחת' && `quick photo: ${out.photoTitle}`,
    out.bogusSheet && 'an unknown ?quick opened something',
    out.bogusSearch !== '' && 'an unknown ?quick stayed in the address',
    out.bogusWater !== 0 && 'an unknown ?quick changed water',
    out.swWaterDelta !== 250 && `the notification button added ${out.swWaterDelta} ml`,
    !['date', 'id', 'items', 'water_ml'].every((k) => out.swRecordShape.split(',').includes(k))
      && `record shape after the worker wrote it: ${out.swRecordShape}`,
    !out.swRefreshedApp && 'the open app did not show the glass added from the notification',
    !(out.swReported > 0) && 'the worker did not report the new total to the reminders server',
    out.raceWater !== 250 && `the glass from the notification was lost when food was added (${out.raceWater})`,
    !out.raceBanana && 'the food added after the notification glass was lost',
    out.inAppDelta !== 250 && `the in-app water button added ${out.inAppDelta}`,
    out.cardOn !== true && 'the quick card setting did not turn on',
    !(out.card && out.card.actions.join(',') === 'water,food' && out.card.sticky === true && /כוסות מים/.test(out.card.body)) && `quick card: ${JSON.stringify(out.card)}`,
    out.cardButton !== 'הסר את הכרטיס' && `card button after enabling: ${out.cardButton}`,
    out.cardWaterDelta !== 250 && `the card's water button added ${out.cardWaterDelta}`,
    out.cardOff !== false && 'the quick card did not turn off',
    out.moreSheet !== 1 && 'no way in from "עוד"',
    out.overflow360 && 'the quick sheet overflows at 360px',
    errors.length && `page errors: ${errors.join(' | ')}`
  ].filter(Boolean);
  if (fatal.length) { console.error('FAIL:', fatal.join(' | ')); process.exitCode = 1; return; }
  console.log('PASS');
}

main().catch(async (e) => {
  console.error('FATAL', e);
  if (PAGE) await PAGE.screenshot({ path: `${SHOTS}/fatal.png` }).catch(() => {});
  if (BROWSER) await BROWSER.close().catch(() => {});
  process.exitCode = 2;
});
