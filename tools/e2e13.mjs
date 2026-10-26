/* v5.7: adding food four ways, and the numbers each way computes.

   The plus on a meal opens four choices — database search, saved foods, a
   photo, free text. What is proven here is that every one of them really
   works end to end and lands an item whose calories, protein, carbs and fat
   are right — not just that a sheet opens:
   · search: popular list before typing, ranked results, a portion picker
     whose numbers follow the amount and the measure, and the item stored
     with exactly those numbers
   · a food the database lacks: the AI lookup (stubbed here) becomes a food
     that is found again offline; a food typed off a package label likewise
   · saved: the heart keeps a food; recent foods re-add in one tap
   · photo: detected rows can be removed before adding; without any AI the
     sheet explains why instead of taking a useless picture
   · free text: the offline parser, with each food's own cup
   · a logged item reopens on tap and can be changed */
import pw from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { LAUNCH, localOnly } from './launch.mjs';

const { chromium } = pw;
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const BASE = `http://localhost:${process.env.PORT || 8777}/index.html`;
const SHOTS = `${ROOT}/tools/shots13`;
fs.mkdirSync(SHOTS, { recursive: true });
const shot = (p, n) => p.screenshot({ path: `${SHOTS}/${n}.png` });
const errors = [];
const out = {};
let BROWSER = null;
let PAGE = null;

const idb = (page, key) => page.evaluate(async (k) => (await import('./js/db.js')).setting(k, null), key);
const today = (page) => page.evaluate(async () => {
  const db = await import('./js/db.js');
  const d = new Date();
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const rows = await db.byIndex('nutrition_logs', 'date', IDBKeyRange.only(iso));
  return rows[0] || null;
});
const macro = async (page, cls) => Number((await page.locator(`#sheetBody .macro-cell.${cls} b`).textContent()).trim());
const sheet = (page) => page.locator('#sheetBody');
const pause = (page, ms = 300) => page.waitForTimeout(ms);

/* The two AI calls this flow makes, answered the way the model would. */
async function stubAI(page) {
  await page.route('**/api/coach', async (route) => {
    const req = route.request();
    if (req.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ available: true, model: 'stub' }) });
    }
    const body = req.postDataJSON();
    const sys = String(body.system || '');
    const content = body.messages[0].content;
    out.aiCalls = (out.aiCalls || 0) + 1;
    let text;
    if (!Array.isArray(content) && content.startsWith('נתח את הארוחה')) {
      text = JSON.stringify({
        items: [
          { label: 'עוגת גבינה פירורים', amount: 'פרוסה', grams: 120, cat: 'sweet', kcal: 384, p: 9.6, c: 36, f: 22.8 },
          { label: 'קפה הפוך', amount: 'כוס', grams: 200, cat: 'drink', kcal: 90, p: 5, c: 8, f: 4 }
        ],
        note: 'הערכה'
      });
    } else if (sys.includes('ל-100 גרם')) {
      out.lookupAsked = body.messages[0].content;
      text = JSON.stringify({ name: 'קינדר בואנו', cat: 'sweet', kcal: 572, p: 8.6, c: 49.5, f: 37.3, unitG: 21.5, unitLabel: 'חטיף', defG: 43, note: 'לפי התווית' });
    } else {
      out.photoAsked = Array.isArray(body.messages[0].content) && body.messages[0].content.some((c) => c.type === 'image');
      text = JSON.stringify({
        items: [
          { label: 'סטייק', amount: '200 גרם', cat: 'protein', kcal: 540, p: 50, c: 0, f: 38 },
          { label: 'צ׳יפס', amount: 'מנה', cat: 'carb', kcal: 400, p: 5, c: 52, f: 19 }
        ],
        note: 'הערכה לפי גודל הצלחת'
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text }] }) });
  });
}

async function boot(page) {
  await page.goto(BASE, { waitUntil: 'load' });
  await page.locator('.login .btn', { hasText: 'המשך בלי חשבון' }).click();
  await page.waitForSelector('.onb');
  for (let i = 0; i < 20 && (await page.locator('.onb').count()); i++) {
    await page.locator('.onb-foot .btn.primary').click({ timeout: 5000 }).catch(() => {});
    await pause(page, 320);
  }
  await page.waitForFunction(() => !document.querySelector('.onb'), null, { timeout: 10000 });
  await page.goto(`${BASE}#/nutrition`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.meal', { timeout: 8000 });
  await pause(page, 400);
}

const openBreakfast = async (page) => {
  await page.locator('.meal', { hasText: 'ארוחת בוקר' }).locator('.meal-add').click();
  await pause(page);
};
const tile = (page, name) => sheet(page).locator('.add-tile', { hasText: name }).click().then(() => pause(page));
const back = (page) => sheet(page).locator('.add-back').click().then(() => pause(page));

async function main() {
  const browser = BROWSER = await chromium.launch(LAUNCH);
  const ctx = await browser.newContext({
    viewport: { width: 414, height: 896 }, deviceScaleFactor: 2,
    locale: 'he-IL', hasTouch: true, isMobile: true
  });
  await localOnly(ctx);
  const page = PAGE = await ctx.newPage();
  page.setDefaultTimeout(8000);
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await stubAI(page);
  await boot(page);

  /* ---------- the four ways in ---------- */
  await openBreakfast(page);
  out.tiles = await sheet(page).locator('.add-tile b').allInnerTexts();
  out.emojiInSheet = await page.evaluate(() => /\p{Extended_Pictographic}/u.test(document.querySelector('#sheetBody').innerText));
  await shot(page, '01-chooser');

  /* ---------- 1. search ---------- */
  await tile(page, 'חיפוש במאגר');
  out.popular = await sheet(page).locator('.food-row').count();
  await sheet(page).locator('input[type=search]').fill('קוטג');
  await pause(page, 250);
  out.cottageFirst = (await sheet(page).locator('.food-row b').first().innerText()).trim();
  await shot(page, '02-search');
  await sheet(page).locator('.food-row-main').first().click();
  await pause(page);
  out.cottageUnits = await sheet(page).locator('.unit-chips .chip span').allInnerTexts();
  out.cottageDefaultKcal = await macro(page, 'kcal');           // one 250 g tub
  await sheet(page).locator('.qty-btn[aria-label="יותר"]').click();
  await pause(page, 150);
  out.cottageTubAndHalf = await macro(page, 'kcal');
  await sheet(page).locator('.unit-chips .chip', { hasText: 'גרם' }).click();
  await pause(page, 150);
  out.cottageGramsQty = Number(await sheet(page).locator('.qty-in').inputValue());
  out.cottageSameAfterSwitch = await macro(page, 'kcal');
  await sheet(page).locator('.qty-in').fill('200');
  await pause(page, 150);
  out.cottage200 = { kcal: await macro(page, 'kcal'), p: await macro(page, 'p'), c: await macro(page, 'c'), f: await macro(page, 'f') };
  await sheet(page).locator('.heart-btn').click();
  await pause(page);
  await shot(page, '03-portion');
  await sheet(page).locator('.btn.primary', { hasText: 'הוסף ל' }).click();
  await pause(page, 600);
  out.backOnSearch = (await page.locator('#sheetTitle').innerText()).trim();
  out.doneBar = await sheet(page).locator('.add-done').count();

  await sheet(page).locator('input[type=search]').fill('פיתה');
  await pause(page, 250);
  await sheet(page).locator('.food-row-main', { hasText: 'פיתה' }).first().click();
  await pause(page);
  out.pitaKcal = await macro(page, 'kcal');
  await sheet(page).locator('.btn.primary', { hasText: 'הוסף ל' }).click();
  await pause(page, 600);

  /* ---------- a food the database lacks: AI ---------- */
  await sheet(page).locator('input[type=search]').fill('קינדר בואנו');
  await pause(page, 250);
  out.kinderLocal = await sheet(page).locator('.food-row').count();
  await shot(page, '04-not-found');
  await sheet(page).locator('.btn', { hasText: 'עם AI' }).click();
  await page.waitForSelector('#sheetBody .macro-grid');
  await pause(page);
  out.kinderTitle = (await page.locator('#sheetTitle').innerText()).trim();
  out.kinderUnit = (await sheet(page).locator('.unit-chips .chip.on span').innerText()).trim();
  out.kinderKcal = await macro(page, 'kcal');                     // one 21.5 g bar
  await sheet(page).locator('.btn.primary', { hasText: 'הוסף ל' }).click();
  await pause(page, 600);
  await sheet(page).locator('input[type=search]').fill('קינדר');
  await pause(page, 250);
  out.kinderFoundAgain = (await sheet(page).locator('.food-row b').first().innerText()).trim();
  out.kinderBadge = (await sheet(page).locator('.food-row .badge').first().innerText().catch(() => '')).trim();

  /* ---------- a food off the package label ---------- */
  await sheet(page).locator('input[type=search]').fill('חטיף הבית');
  await pause(page, 250);
  await sheet(page).locator('.btn', { hasText: 'צור מאכל חדש' }).click();
  await pause(page);
  const nums = sheet(page).locator('.grid-2 input');
  await nums.nth(0).fill('');           // no calories typed: computed from the macros
  await nums.nth(1).fill('30');
  await nums.nth(2).fill('40');
  await nums.nth(3).fill('10');
  await nums.nth(4).fill('50');
  await nums.nth(5).fill('חטיף');
  await shot(page, '05-custom');
  await sheet(page).locator('.btn.primary', { hasText: 'שמור' }).click();
  await pause(page);
  out.customKcal = await macro(page, 'kcal');                     // (30·4+40·4+10·9)/2
  out.customP = await macro(page, 'p');
  await sheet(page).locator('.btn.primary', { hasText: 'הוסף ל' }).click();
  await pause(page, 600);

  /* ---------- 2. saved and recent ---------- */
  await back(page);
  await tile(page, 'מאכלים שמורים');
  await pause(page, 300);
  const sections = await sheet(page).locator('.section-title').allInnerTexts();
  out.savedSections = sections;
  out.favourite = (await sheet(page).locator('.food-list').first().locator('.food-row b').first().innerText()).trim();
  out.recentCount = await sheet(page).locator('.food-list').nth(1).locator('.food-row').count();
  await shot(page, '06-saved');
  const beforeQuick = (await today(page)).items.length;
  await sheet(page).locator('.food-list').nth(1).locator('.food-quick').first().click();
  await pause(page, 600);
  out.quickAdded = (await today(page)).items.length - beforeQuick;

  /* ---------- 3. photo ---------- */
  await back(page);
  await tile(page, 'צילום');
  await pause(page, 300);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await sheet(page).locator('input[type=file]').setInputFiles({ name: 'plate.png', mimeType: 'image/png', buffer: png });
  await page.waitForSelector('#sheetBody .food-row', { timeout: 8000 });
  await pause(page);
  out.photoRows = await sheet(page).locator('.food-row').count();
  await shot(page, '07-photo');
  await sheet(page).locator('.food-quick[aria-label^="הסר"]').nth(1).click();   // drop the fries
  await pause(page, 200);
  out.photoRowsAfterRemove = await sheet(page).locator('.food-row').count();
  await sheet(page).locator('.btn.primary', { hasText: 'הוסף ל' }).click();
  await pause(page, 600);

  /* ---------- 4. free text ---------- */
  await tile(page, 'תיאור חופשי');
  await sheet(page).locator('textarea').fill('שתי ביצים וכוס אורז');
  await pause(page, 300);
  out.textRows = await sheet(page).locator('.food-row').count();
  out.textTotal = (await sheet(page).locator('.target-box .t-val').innerText()).trim();
  await shot(page, '08-text');
  await sheet(page).locator('.btn.primary', { hasText: 'הוסף ל' }).click();
  await pause(page, 600);
  out.doneLabel = (await sheet(page).locator('.add-done b').innerText()).trim();
  await shot(page, '09-chooser-after');
  await sheet(page).locator('.add-done .btn', { hasText: 'סיום' }).click();
  await pause(page, 500);

  /* ---------- what was stored ---------- */
  const day = await today(page);
  const items = day.items.filter((i) => i.meal === 'breakfast');
  const find = (label) => items.find((i) => i.label === label);
  out.stored = items.map((i) => `${i.label}:${i.kcal}`);
  out.cottage = find('קוטג׳ 5%');
  out.pita = find('פיתה');
  out.kinder = find('קינדר בואנו');
  out.steak = find('סטייק');
  out.fries = find('צ׳יפס');
  out.rice = find('אורז מבושל');
  const sumK = Math.round(day.items.reduce((a, i) => a + i.kcal, 0));
  out.totalsTrue = day.calories_consumed === sumK
    && Math.abs(day.carbs_grams - day.items.reduce((a, i) => a + (i.c || 0), 0)) < 0.05
    && Math.abs(day.fat_grams - day.items.reduce((a, i) => a + (i.f || 0), 0)) < 0.05;
  out.breakfastRows = await page.locator('.meal', { hasText: 'ארוחת בוקר' }).locator('.meal-item').count();
  out.macroStrip = (await page.locator('.macro-tiles').innerText()).replace(/\s+/g, ' ');
  out.savedSetting = (await idb(page, 'savedFoods') || []).map((f) => f.name);
  out.customSetting = (await idb(page, 'customFoods') || []).map((f) => `${f.name}:${f.kcal}`);
  await page.locator('.meal', { hasText: 'ארוחת בוקר' }).scrollIntoViewIfNeeded();
  await shot(page, '10-day');

  /* ---------- a logged item reopens and changes ---------- */
  await page.locator('.meal', { hasText: 'ארוחת בוקר' }).locator('.meal-item-main', { hasText: 'פיתה' }).click();
  await pause(page);
  out.editButton = (await sheet(page).locator('.btn.primary').innerText()).trim();
  await sheet(page).locator('.qty-btn[aria-label="יותר"]').click();
  await sheet(page).locator('.qty-btn[aria-label="יותר"]').click();
  await pause(page, 150);
  await sheet(page).locator('.btn.primary', { hasText: 'עדכן' }).click();
  await pause(page, 600);
  out.pitaAfterEdit = (await today(page)).items.find((i) => i.label === 'פיתה');

  /* ---------- what the AI recognised is remembered ----------
     A food the database lacks, analysed once by the AI, becomes one of the
     user's foods: found by search, understood by the offline parser, and
     never sent to the AI again. One the database already knows is not
     duplicated. */
  await openBreakfast(page);
  await tile(page, 'תיאור חופשי');
  await sheet(page).locator('textarea').fill('פרוסת עוגת גבינה פירורים וקפה');
  await pause(page, 200);
  await sheet(page).locator('.btn', { hasText: 'נתח עם AI' }).click();
  await page.waitForFunction(() => document.querySelectorAll('#sheetBody .food-row').length === 2);
  await sheet(page).locator('.btn.primary', { hasText: 'הוסף ל' }).click();
  await pause(page, 600);
  out.learnToast = (await page.locator('#toaster').innerText().catch(() => '')).trim();
  await sheet(page).locator('.add-done .btn', { hasText: 'סיום' }).click();
  await pause(page, 400);
  const learnedFoods = await idb(page, 'customFoods') || [];
  out.learned = learnedFoods.find((f) => f.name === 'עוגת גבינה פירורים') || null;
  out.learnedKnownToo = learnedFoods.some((f) => f.name === 'קפה הפוך');
  out.learnedItem = (await today(page)).items.find((i) => i.label === 'עוגת גבינה פירורים') || null;

  const callsBefore = out.aiCalls;
  await openBreakfast(page);
  await tile(page, 'תיאור חופשי');
  await sheet(page).locator('textarea').fill('עוגת גבינה פירורים');
  await pause(page, 300);
  out.offlineRows = await sheet(page).locator('.food-row').count();
  out.offlineTotal = (await sheet(page).locator('.target-box .t-val').innerText().catch(() => '')).trim();
  await back(page);
  await tile(page, 'חיפוש במאגר');
  out.mineSection = (await sheet(page).locator('.section-title').first().innerText()).trim();
  out.mineFirst = (await sheet(page).locator('.food-row b').first().innerText()).trim();
  await shot(page, '14-my-foods');
  await sheet(page).locator('input[type=search]').fill('עוגת גבינה');
  await pause(page, 250);
  out.searchLearned = (await sheet(page).locator('.food-row b').first().innerText()).trim();
  out.aiCallsForRepeat = out.aiCalls - callsBefore;
  await page.locator('.sheet-close').click();
  await pause(page, 300);

  /* ---------- small phone ---------- */
  await page.setViewportSize({ width: 360, height: 780 });
  await openBreakfast(page);
  await shot(page, '11-chooser-360');
  out.overflow360 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1
    || [...document.querySelectorAll('#sheetBody .add-tile')].some((t) => t.scrollWidth > t.clientWidth + 1));
  await tile(page, 'חיפוש במאגר');
  await sheet(page).locator('input[type=search]').fill('אורז');
  await pause(page, 250);
  await sheet(page).locator('.food-row-main').first().click();
  await pause(page);
  await shot(page, '12-portion-360');
  /* grams said as an everyday measure, and a measure said in grams */
  await sheet(page).locator('.qty-in').fill('250');
  await pause(page, 150);
  out.likeText = (await sheet(page).locator('.amount-like').innerText()).trim();
  await sheet(page).locator('.unit-chips .chip', { hasText: 'צלחת גדולה' }).click();
  await pause(page, 150);
  await sheet(page).locator('.qty-in').fill('1');
  await pause(page, 150);
  out.likeGrams = (await sheet(page).locator('.amount-like').innerText()).trim();
  out.riceUnits = await sheet(page).locator('.unit-chips .chip span').allInnerTexts();
  out.portionOverflow360 = await page.evaluate(() => {
    const b = document.querySelector('#sheetBody');
    return b.scrollWidth > b.clientWidth + 1;
  });

  /* ---------- no AI at all: the photo says why ---------- */
  const ctx2 = await browser.newContext({ viewport: { width: 414, height: 896 }, locale: 'he-IL', hasTouch: true, isMobile: true });
  await localOnly(ctx2);
  const p2 = await ctx2.newPage();
  p2.on('pageerror', (e) => errors.push(`pageerror(no-ai): ${e.message}`));
  await p2.route('**/api/coach', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ available: false }) }));
  await boot(p2);
  await openBreakfast(p2);
  await tile(p2, 'צילום');
  await pause(p2, 400);
  out.noAiPhoto = (await sheet(p2).innerText()).includes('זיהוי מתמונה עובד דרך AI');
  out.noAiFileInput = await sheet(p2).locator('input[type=file]').count();
  await shot(p2, '13-photo-no-ai');
  await back(p2);
  await tile(p2, 'חיפוש במאגר');
  await sheet(p2).locator('input[type=search]').fill('משהו שלא קיים');
  await pause(p2, 250);
  await sheet(p2).locator('.btn', { hasText: 'עם AI' }).click();
  await pause(p2, 400);
  out.noAiLookupToast = (await p2.locator('#toast, .toast').first().innerText().catch(() => '')).trim();

  out.errors = errors;
  console.log(JSON.stringify(out, null, 2));
  await browser.close();

  const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;
  const fatal = [
    out.tiles.join('|') !== 'חיפוש במאגר|מאכלים שמורים|צילום|תיאור חופשי' && `the four options are wrong: ${out.tiles.join(', ')}`,
    out.emojiInSheet && 'emoji in the add-food sheet',
    out.popular < 8 && 'search opens empty instead of listing common foods',
    out.cottageFirst !== 'קוטג׳ 5%' && `"קוטג" ranked ${out.cottageFirst} first`,
    !['גביע', 'כף', 'גרם'].every((u) => out.cottageUnits.includes(u)) && `cottage units: ${out.cottageUnits}`,
    out.cottageDefaultKcal !== 258 && `a tub of cottage should be 258 kcal, got ${out.cottageDefaultKcal}`,
    out.cottageTubAndHalf !== 386 && `a tub and a half should be 386 kcal, got ${out.cottageTubAndHalf}`,
    (out.cottageGramsQty !== 375 || out.cottageSameAfterSwitch !== 386) && 'switching to grams changed the amount on the plate',
    !(out.cottage200.kcal === 206 && out.cottage200.p === 22 && out.cottage200.c === 7 && out.cottage200.f === 10)
      && `200 g cottage computed wrong: ${JSON.stringify(out.cottage200)}`,
    out.backOnSearch !== 'חיפוש במאגר' && 'adding did not return to the search for the next food',
    !out.doneBar && 'no running total after adding',
    out.pitaKcal !== 190 && `a pita should be 190 kcal, got ${out.pitaKcal}`,
    out.kinderLocal !== 0 && 'a food missing from the database was "found" locally',
    !/קינדר בואנו/.test(out.lookupAsked || '') && 'the AI was not asked about the missing food',
    out.kinderTitle !== 'קינדר בואנו' && 'the AI food did not open in the portion picker',
    out.kinderUnit !== 'חטיף' && `the AI food's unit is ${out.kinderUnit}`,
    out.kinderKcal !== 123 && `one bar should be 123 kcal, got ${out.kinderKcal}`,
    out.kinderFoundAgain !== 'קינדר בואנו' && 'the AI food is not found again by search',
    out.kinderBadge !== 'AI' && 'the AI food is not marked as such',
    !(out.customKcal === 185 && out.customP === 15) && `the label food computed ${out.customKcal} kcal / ${out.customP} g`,
    out.favourite !== 'קוטג׳ 5%' && `favourites show ${out.favourite}`,
    !out.savedSections.some((t) => /לאחרונה/.test(t)) && 'no recent foods section',
    out.recentCount < 3 && 'recent foods list is short',
    out.quickAdded !== 1 && 'the one-tap re-add did not add exactly one item',
    !out.photoAsked && 'the photo was not sent to the AI',
    out.photoRows !== 2 && `photo rows: ${out.photoRows}`,
    out.photoRowsAfterRemove !== 1 && 'a detected item could not be removed',
    out.textRows !== 2 && `free text rows: ${out.textRows}`,
    !/364 קק״ל/.test(out.textTotal) && `two eggs and a cup of rice should be 364 kcal: ${out.textTotal}`,
    !/נוספו/.test(out.doneLabel) && 'the chooser does not show what was added',
    !(out.cottage && out.cottage.kcal === 206 && out.cottage.p === 22 && out.cottage.fid === 'f:קוטג׳ 5%' && out.cottage.grams === 200)
      && `cottage stored as ${JSON.stringify(out.cottage)}`,
    !(out.pita && near(out.pita.kcal, 190)) && 'pita not stored',
    !(out.kinder && near(out.kinder.kcal, 123)) && 'AI food not stored',
    !(out.steak && out.steak.kcal === 540 && out.steak.f === 38) && 'photo item not stored with its macros',
    out.fries && 'a removed photo item was stored anyway',
    !(out.rice && out.rice.kcal === 208) && `rice by the cup: ${JSON.stringify(out.rice)}`,
    !out.totalsTrue && 'the day totals do not equal the items',
    out.breakfastRows < 7 && `breakfast shows ${out.breakfastRows} rows`,
    !/פחמימות \d+ ג׳/.test(out.macroStrip) && 'carbs are not shown for the day',
    !out.savedSetting.includes('קוטג׳ 5%') && 'the heart did not save',
    !(out.learned && out.learned.kcal === 320 && out.learned.g === 120 && out.learned.src === 'ai')
      && `the AI food was not learned per 100 g: ${JSON.stringify(out.learned)}`,
    out.learnedKnownToo && 'a food the database already has was learned again',
    !(out.learnedItem && /^c:/.test(out.learnedItem.fid || '') && out.learnedItem.grams === 120 && !out.learnedItem.src)
      && `the logged AI item is not linked to its learned food: ${JSON.stringify(out.learnedItem)}`,
    !/נשמר במאגר/.test(out.learnToast) && `learning was not announced: ${out.learnToast}`,
    !(out.offlineRows === 1 && /384 קק״ל/.test(out.offlineTotal)) && `the learned food is not parsed offline: ${out.offlineRows} / ${out.offlineTotal}`,
    !(out.mineSection === 'המאכלים שלי' && out.mineFirst === 'עוגת גבינה פירורים')
      && `search does not open on the user's foods: ${out.mineSection} / ${out.mineFirst}`,
    out.searchLearned !== 'עוגת גבינה פירורים' && `search for the learned food found ${out.searchLearned}`,
    out.aiCallsForRepeat !== 0 && 'the learned food was sent to the AI again',
    !(out.customSetting.includes('קינדר בואנו:572') && out.customSetting.includes('חטיף הבית:370'))
      && `custom foods: ${out.customSetting}`,
    out.editButton !== 'עדכן' && 'a logged item does not reopen for editing',
    !(out.pitaAfterEdit && out.pitaAfterEdit.kcal === 379.4) && `pita after +1: ${JSON.stringify(out.pitaAfterEdit)}`,
    out.overflow360 && 'the chooser overflows at 360px',
    out.likeText !== 'זה בערך צלחת בינונית' && `250 g of rice should read as a medium plate: "${out.likeText}"`,
    out.likeGrams !== '= 350 גרם' && `a large plate should read in grams: "${out.likeGrams}"`,
    !['צלחת קטנה', 'צלחת בינונית', 'צלחת גדולה', 'כוס'].every((u) => out.riceUnits.includes(u)) && `rice measures: ${out.riceUnits}`,
    out.portionOverflow360 && 'the portion picker overflows at 360px',
    !out.noAiPhoto && 'without AI the photo option does not explain itself',
    out.noAiFileInput !== 0 && 'without AI the photo option still asks for a picture',
    !/API/.test(out.noAiLookupToast) && `AI lookup without AI said: ${out.noAiLookupToast}`,
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
