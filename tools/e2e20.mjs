/* v5.16: coffee, tea and other drinks count toward the day's water.

   · "שתייה אחרת" on the water card lists drinks; a drink is logged like a
     food (calories and all) and its water is counted: black coffee and tea
     whole, milk/juice/cola by the water in them, alcohol not at all
   · the portion sheet says how much a drink adds; the meal list says it too
   · the water card's total, tank and glasses include drinks; the glasses
     that came from drinks look different and are not taken back by a tap
   · editing or deleting the drink moves the water with it
   · the free-text parser's drinks count the same way
   · a drink logged before this version counts once the day is opened
   · the quick-add card, the reminders server (from the app and from the
     notification button) and the week's numbers all see the same total
   · "it was coffee" on the quick water sheet swaps the glass for a drink */
import pw from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { LAUNCH, localOnly } from './launch.mjs';

const { chromium } = pw;
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const ORIGIN = `http://localhost:${process.env.PORT || 8777}`;
const BASE = `${ORIGIN}/index.html`;
const SHOTS = `${ROOT}/tools/shots20`;
fs.mkdirSync(SHOTS, { recursive: true });
const shot = (p, n) => p.screenshot({ path: `${SHOTS}/${n}.png` });
const errors = [];
const out = {};
let BROWSER = null;
let PAGE = null;
const pause = (page, ms = 300) => page.waitForTimeout(ms);
const PUSH_ID = 'p_drinksdrinksdrinksdrinks';

const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const today = (page) => page.evaluate(async (iso) => {
  const db = await import('./js/db.js');
  return (await db.byIndex('nutrition_logs', 'date', IDBKeyRange.only(iso)))[0] || null;
}, isoToday());
const lastProgress = async (page) => {
  const log = await page.evaluate(() => fetch('/api/push?last').then((r) => r.json()));
  return log.filter((m) => m.action === 'progress' && m.id === PUSH_ID).pop()?.progress || null;
};
const tank = async (page) => (await page.locator('.tank-text b').innerText()).trim();
const sheetTitle = async (page) => (await page.locator('#sheetTitle').innerText()).trim();

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

async function closeSheet(page) {
  await page.locator('.sheet-close').click();
  await pause(page, 500);
}

/** Pick a drink from the "other drink" list and add its default portion. */
async function addDrink(page, name) {
  await page.locator('#sheetBody .food-row-main', { has: page.locator('b', { hasText: new RegExp(`^${name}$`) }) }).first().click();
  await page.waitForSelector('#sheetBody .macro-grid');
  await pause(page, 300);
  const note = (await page.locator('#sheetBody .water-note').innerText().catch(() => '')).trim();
  await page.locator('#sheetBody .btn.primary', { hasText: 'הוסף ל' }).click();
  await pause(page, 700);
  return note;
}

async function main() {
  const browser = BROWSER = await chromium.launch(LAUNCH);
  const ctx = await browser.newContext({ viewport: { width: 414, height: 896 }, deviceScaleFactor: 2, locale: 'he-IL', hasTouch: true, isMobile: true });
  await localOnly(ctx);
  const page = PAGE = await ctx.newPage();
  page.setDefaultTimeout(8000);
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(BASE, { waitUntil: 'load' });
  await onboard(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10000 });
  /* reminders on, so both the app and the worker report the day's numbers */
  await page.evaluate(async (id) => {
    const db = await import('./js/db.js');
    await db.setSetting('pushId', id);
    await db.setSetting('reminders', { on: true, prefs: {} });
  }, PUSH_ID);

  await page.goto(`${BASE}#/nutrition`, { waitUntil: 'load' });
  await page.waitForSelector('.water-card');
  await pause(page, 600);

  /* ---------- the drinks list ---------- */
  await page.locator('.water-card .water-other').click();
  await page.waitForSelector('#sheetBody .food-list');
  await pause(page, 400);
  out.drinkTitle = await sheetTitle(page);
  out.drinkNames = await page.locator('#sheetBody .food-row-main b').allInnerTexts();
  out.drinkBack = await page.locator('#sheetBody .add-back').count();
  await shot(page, '01-drinks');

  out.coffeeNote = await addDrink(page, 'קפה שחור');
  out.afterAddTitle = await sheetTitle(page);
  out.doneBar = await page.locator('#sheetBody .add-done').count();
  out.teaNote = await addDrink(page, 'תה');
  await closeSheet(page);

  let rec = await today(page);
  out.coffee = rec.items.find((i) => i.label === 'קפה שחור');
  out.tea = rec.items.find((i) => i.label === 'תה');
  out.waterAfterDrinks = rec.water_ml || 0;
  out.drinksAfterDrinks = rec.drinks_ml;
  out.kcalAfterDrinks = rec.calories_consumed;
  out.tank1 = await tank(page);
  out.drinkLine = (await page.locator('.water-card .water-drinks').innerText().catch(() => '')).trim();
  out.drinkGlasses1 = await page.locator('.water-card .glass.full.drink').count();
  out.mealLine = (await page.locator('.meal-item', { hasText: 'קפה שחור' }).locator('small').innerText()).trim();
  await shot(page, '02-card-with-drinks');

  /* the app reports the whole total to the reminders server */
  await pause(page, 1600);
  out.appReported = (await lastProgress(page))?.water_ml;

  /* ---------- a plain glass on top: plain glasses first ---------- */
  await page.locator('.water-card .btn.water-add').click();
  await pause(page, 700);
  rec = await today(page);
  out.waterAfterGlass = rec.water_ml;
  out.tank2 = await tank(page);
  out.glassClasses = await page.locator('.water-card .glass').evaluateAll((gs) => gs.slice(0, 3).map((g) => g.className.replace('glass', '').trim() || 'empty'));
  /* tapping a drink's glass explains, and changes nothing */
  await page.locator('.water-card .glass.full.drink').first().click();
  await pause(page, 500);
  out.drinkGlassToast = (await page.locator('.toast').last().innerText().catch(() => '')).trim();
  out.waterAfterDrinkTap = (await today(page)).water_ml;
  out.drinksAfterDrinkTap = (await today(page)).drinks_ml;

  /* ---------- the quick card and the notification button see the total ---------- */
  out.status = await page.evaluate(async () => (await import('./js/quick.js')).status().then((s) => s.text));
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    reg.active.postMessage({ type: 'notification-action', action: 'water', data: {}, tag: 'ironlog-water' });
  });
  await page.waitForFunction(async () => {
    const r = await fetch('/api/push?last').then((x) => x.json());
    return r.some((m) => m.action === 'progress' && m.progress && m.progress.water_ml === 980);
  }, null, { timeout: 6000 }).catch(() => {});
  out.swReported = (await lastProgress(page))?.water_ml;
  await pause(page, 800);
  out.tank3 = await tank(page);

  /* ---------- the week's numbers count drinks ---------- */
  out.weekWater = await page.evaluate(async () => {
    const progress = await import('./js/progress.js');
    return (await progress.weekNumbers({ waterTarget: 900 }, () => 9999)).water;
  });

  /* ---------- editing the drink moves its water ---------- */
  await page.locator('.meal-item', { hasText: 'קפה שחור' }).locator('.meal-item-main').click();
  await page.waitForSelector('#sheetBody .qty-in');
  await page.locator('#sheetBody .qty-btn[aria-label="יותר"]').click();
  await pause(page, 300);
  out.editNote = (await page.locator('#sheetBody .water-note').innerText()).trim();
  await page.locator('#sheetBody .btn.primary', { hasText: 'עדכן' }).click();
  await pause(page, 700);
  rec = await today(page);
  out.coffeeEdited = rec.items.find((i) => i.label === 'קפה שחור')?.water_ml;
  out.drinksAfterEdit = rec.drinks_ml;
  /* delete the tea */
  await page.locator('.meal-item', { hasText: 'תה' }).locator('.meal-del').click();
  await pause(page, 700);
  rec = await today(page);
  out.drinksAfterDelete = rec.drinks_ml;
  out.waterAfterDelete = rec.water_ml;

  /* ---------- free text: coffee counts, wine does not ---------- */
  await page.locator('.meal', { hasText: 'נשנושים' }).locator('.meal-add').click();
  await pause(page, 400);
  await page.locator('#sheetBody .add-tile', { hasText: 'תיאור חופשי' }).click();
  await pause(page, 300);
  await page.locator('#sheetBody textarea').fill('ספל קפה הפוך וכוס יין');
  await pause(page, 300);
  await page.locator('#sheetBody .btn.primary', { hasText: 'הוסף ל' }).click();
  await pause(page, 700);
  await closeSheet(page);
  rec = await today(page);
  out.textLatte = rec.items.find((i) => i.label === 'קפה הפוך')?.water_ml;
  out.textWine = rec.items.find((i) => i.label === 'יין')?.water_ml ?? 0;
  out.drinksAfterText = rec.drinks_ml;
  /* the wine's portion sheet says why it does not count */
  await page.locator('.meal-item', { hasText: 'יין' }).locator('.meal-item-main').click();
  await page.waitForSelector('#sheetBody .qty-in');
  await pause(page, 300);
  out.wineNote = (await page.locator('#sheetBody .water-note').innerText().catch(() => '')).trim();
  await closeSheet(page);

  /* ---------- a drink logged before drinks counted ---------- */
  await page.evaluate(async (iso) => {
    const db = await import('./js/db.js');
    const r = (await db.byIndex('nutrition_logs', 'date', IDBKeyRange.only(iso)))[0];
    r.items.push({ label: 'תה', amount: 'כוס (240 מ״ל)', cat: 'drink', kcal: 2.4, p: 0, c: 0.5, f: 0, fid: 'f:תה', grams: 240, meal: 'other' });
    delete r.drinks_ml;
    await db.put('nutrition_logs', r);
  }, isoToday());
  out.beforeOpen = (await today(page)).drinks_ml ?? null;
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.water-card');
  await pause(page, 800);
  rec = await today(page);
  out.migrated = rec.drinks_ml;
  out.migratedItem = rec.items.filter((i) => i.label === 'תה').pop()?.water_ml;
  out.recentShape = Object.keys(rec).sort().join(',');

  /* ---------- "it was coffee": the glass becomes a drink ---------- */
  const w0 = (await today(page)).water_ml;
  await page.goto(`${BASE}?quick=water#/nutrition`, { waitUntil: 'load' });
  await page.waitForSelector('#sheetBody .qw-line');
  await pause(page, 500);
  out.quickAdded = (await today(page)).water_ml - w0;
  await page.locator('#sheetBody .btn', { hasText: 'זה היה קפה' }).click();
  await page.waitForSelector('#sheetBody .food-list');
  await pause(page, 500);
  out.swapTitle = await sheetTitle(page);
  out.swapWater = (await today(page)).water_ml - w0;
  await closeSheet(page);

  /* ---------- 360px ---------- */
  await page.setViewportSize({ width: 360, height: 760 });
  await page.goto(`${BASE}#/nutrition`, { waitUntil: 'load' });
  await page.waitForSelector('.water-card');
  await pause(page, 600);
  await page.locator('.water-card').scrollIntoViewIfNeeded();
  out.overflow360 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1
    || [...document.querySelectorAll('.water-card *')].some((n) => n.getBoundingClientRect().right > window.innerWidth + 1));
  await shot(page, '03-card-360');

  out.errors = errors;
  console.log(JSON.stringify(out, null, 2));
  await browser.close();

  const fatal = [
    out.drinkTitle !== 'שתייה אחרת' && `drinks sheet: ${out.drinkTitle}`,
    !['קפה שחור', 'קפה הפוך', 'תה', 'מיץ תפוזים', 'קולה'].every((n) => out.drinkNames.includes(n)) && `drinks listed: ${out.drinkNames}`,
    out.drinkBack !== 0 && 'the drinks list has a "back" to nowhere',
    out.coffeeNote !== 'נספר במים: 240 מ״ל' && `coffee portion note: ${out.coffeeNote}`,
    out.teaNote !== 'נספר במים: 240 מ״ל' && `tea portion note: ${out.teaNote}`,
    out.afterAddTitle !== 'שתייה אחרת' && `after adding, the sheet went to ${out.afterAddTitle}`,
    out.doneBar !== 1 && 'no running total after adding a drink',
    out.coffee?.water_ml !== 240 && `coffee item: ${JSON.stringify(out.coffee)}`,
    out.tea?.water_ml !== 240 && `tea item: ${JSON.stringify(out.tea)}`,
    out.waterAfterDrinks !== 0 && `drinks changed the plain water: ${out.waterAfterDrinks}`,
    out.drinksAfterDrinks !== 480 && `day drinks_ml: ${out.drinksAfterDrinks}`,
    !(out.kcalAfterDrinks > 0) && 'drinks were not logged with their calories',
    out.tank1 !== '1' && `tank after 480 ml of drinks: ${out.tank1}`,
    !/כולל 480 מ״ל/.test(out.drinkLine) && `water card drink line: ${out.drinkLine}`,
    out.drinkGlasses1 !== 1 && `drink glasses: ${out.drinkGlasses1}`,
    !/240 מ״ל למים/.test(out.mealLine) && `meal line: ${out.mealLine}`,
    out.appReported !== 480 && `the app reported water ${out.appReported} (want 480)`,
    out.waterAfterGlass !== 250 && `glass button: ${out.waterAfterGlass}`,
    out.tank2 !== '2' && `tank after a glass on top: ${out.tank2}`,
    out.glassClasses.join(',') !== 'full,full drink,empty' && `glasses: ${out.glassClasses}`,
    !/מהשתייה/.test(out.drinkGlassToast) && `drink glass tap: ${out.drinkGlassToast}`,
    out.waterAfterDrinkTap !== 250 && 'tapping a drink glass changed water',
    out.drinksAfterDrinkTap !== 480 && 'tapping a drink glass changed drinks',
    !/^2 מתוך 12 כוסות/.test(out.status) && `quick card text: ${out.status}`,
    out.swReported !== 980 && `the notification button reported ${out.swReported} (want 980)`,
    out.tank3 !== '3' && `tank after the notification glass: ${out.tank3}`,
    out.weekWater !== 1 && `week numbers water days: ${out.weekWater}`,
    out.editNote !== 'נספר במים: 360 מ״ל' && `edit note: ${out.editNote}`,
    out.coffeeEdited !== 360 && `edited coffee water: ${out.coffeeEdited}`,
    out.drinksAfterEdit !== 600 && `drinks after edit: ${out.drinksAfterEdit}`,
    out.drinksAfterDelete !== 360 && `drinks after deleting tea: ${out.drinksAfterDelete}`,
    out.waterAfterDelete !== 500 && `plain water moved on delete: ${out.waterAfterDelete}`,
    !(out.textLatte > 250 && out.textLatte < 300) && `free-text latte: ${out.textLatte}`,
    out.textWine !== 0 && `wine counted as water: ${out.textWine}`,
    out.drinksAfterText !== 360 + out.textLatte && `drinks after free text: ${out.drinksAfterText}`,
    !/לא נספר/.test(out.wineNote) && `wine note: ${out.wineNote}`,
    out.beforeOpen !== null && 'test setup: drinks_ml was not removed',
    out.migrated !== out.drinksAfterText + 240 && `an old tea was not counted: ${out.migrated}`,
    out.migratedItem !== 240 && `old tea item: ${out.migratedItem}`,
    out.quickAdded !== 250 && `quick water added ${out.quickAdded}`,
    out.swapTitle !== 'שתייה אחרת' && `"it was coffee" opened ${out.swapTitle}`,
    out.swapWater !== 0 && `"it was coffee" left ${out.swapWater} ml of water`,
    out.overflow360 && 'the water card overflows at 360px',
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
