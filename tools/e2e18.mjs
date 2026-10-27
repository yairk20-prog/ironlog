/* v5.14: what was eaten yesterday, and the days before.

   · a strip of the last 14 days at the top of nutrition — today first,
     each day with its date and calories
   · "הימים האחרונים": logged days with date, calories, protein against
     that day's target, water, and the foods — tap to open the day
   · an earlier day opens whole and stays editable: adding to it lands on
     that date, not today; its meals can be copied to today in one tap
   · leaving the screen comes back to today */
import pw from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { LAUNCH, localOnly } from './launch.mjs';

const { chromium } = pw;
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const BASE = `http://localhost:${process.env.PORT || 8777}/index.html`;
const SHOTS = `${ROOT}/tools/shots18`;
fs.mkdirSync(SHOTS, { recursive: true });
const shot = (p, n) => p.screenshot({ path: `${SHOTS}/${n}.png` });
const errors = [];
const out = {};
let BROWSER = null;
let PAGE = null;
const pause = (page, ms = 300) => page.waitForTimeout(ms);

const isoAgo = (n) => {
  const d = new Date(Date.now() - n * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dayRecord = (page, iso) => page.evaluate(async (iso) => {
  const db = await import('./js/db.js');
  return (await db.byIndex('nutrition_logs', 'date', IDBKeyRange.only(iso)))[0] || null;
}, iso);

async function main() {
  const browser = BROWSER = await chromium.launch(LAUNCH);
  const ctx = await browser.newContext({ viewport: { width: 414, height: 896 }, deviceScaleFactor: 2, locale: 'he-IL', hasTouch: true, isMobile: true });
  await localOnly(ctx);
  const page = PAGE = await ctx.newPage();
  page.setDefaultTimeout(8000);
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(BASE, { waitUntil: 'load' });
  await page.locator('.login .btn', { hasText: 'המשך בלי חשבון' }).click();
  await page.waitForSelector('.onb');
  for (let i = 0; i < 20 && (await page.locator('.onb').count()); i++) {
    await page.locator('.onb-foot .btn.primary').click({ timeout: 5000 }).catch(() => {});
    await pause(page, 320);
  }
  await page.waitForSelector('#view .hero', { timeout: 8000 });

  /* yesterday and three days ago, logged */
  const y = isoAgo(1), d3 = isoAgo(3);
  await page.evaluate(async ([y, d3]) => {
    const db = await import('./js/db.js');
    const day = (id, date, items, water) => {
      const t = items.reduce((a, i) => ({ k: a.k + i.kcal, p: a.p + i.p, c: a.c + i.c, f: a.f + i.f }), { k: 0, p: 0, c: 0, f: 0 });
      return { id, date, items, water_ml: water, calories_consumed: t.k, protein_grams: t.p, carbs_grams: t.c, fat_grams: t.f };
    };
    await db.put('nutrition_logs', day('n_y', y, [
      { label: 'חביתה', amount: 'חביתה (120 ג׳)', cat: 'protein', kcal: 218, p: 13.2, c: 1.2, f: 18, meal: 'breakfast' },
      { label: 'פיתה', amount: 'פיתה (70 ג׳)', cat: 'carb', kcal: 190, p: 6, c: 37.8, f: 1, meal: 'breakfast' },
      { label: 'חזה עוף', amount: '200 גרם', cat: 'protein', kcal: 330, p: 62, c: 0, f: 7.2, meal: 'lunch' }
    ], 2000));
    await db.put('nutrition_logs', day('n_3', d3, [
      { label: 'שווארמה בפיתה', amount: 'מנה (300 ג׳)', cat: 'dish', kcal: 700, p: 40, c: 55, f: 35, meal: 'dinner' }
    ], 750));
  }, [y, d3]);

  await page.goto(`${BASE}#/nutrition`, { waitUntil: 'load' });
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.day-strip');
  await pause(page, 600);
  out.chips = await page.locator('.day-chip').count();
  out.firstChip = (await page.locator('.day-chip').first().innerText()).replace(/\s+/g, ' ');
  out.selected = (await page.locator('.day-chip.on small').innerText()).trim();
  out.yesterdayChip = (await page.locator('.day-chip').nth(1).innerText()).replace(/\s+/g, ' ');
  out.recentRows = await page.locator('.recent-day').count();
  out.recentFirst = (await page.locator('.recent-day').first().innerText()).replace(/\s+/g, ' ');
  await page.locator('.recent-days').scrollIntoViewIfNeeded();
  await shot(page, '01-today-recent');

  /* open yesterday from the list */
  await page.locator('.recent-day', { hasText: 'אתמול' }).click();
  await pause(page, 800);
  out.banner = (await page.locator('.past-day').innerText().catch(() => '')).replace(/\s+/g, ' ');
  out.heroHead = (await page.locator('.day-hero h3').innerText()).trim();
  out.yItems = await page.locator('.meal-item b').allInnerTexts();
  out.selectedNow = (await page.locator('.day-chip.on small').innerText()).trim();
  out.copyButtons = await page.locator('.meal-copy').count();
  out.guidanceHidden = (await page.locator('.section-title', { hasText: 'מה כדאי לאכול' }).count()) === 0;
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await shot(page, '02-yesterday');

  /* adding on yesterday lands on yesterday */
  await page.locator('.meal', { hasText: 'ארוחת ערב' }).locator('.meal-add').click();
  await pause(page, 400);
  await page.locator('#sheetBody .add-tile', { hasText: 'תיאור חופשי' }).click();
  await pause(page, 300);
  await page.locator('#sheetBody textarea').fill('צלחת אורז');
  await pause(page, 300);
  await page.locator('#sheetBody .btn.primary', { hasText: 'הוסף ל' }).click();
  await pause(page, 700);
  await page.locator('.sheet-close').click().catch(() => {});
  await pause(page, 500);
  const yRec = await dayRecord(page, y);
  out.yesterdayHasRice = (yRec?.items || []).some((i) => i.label === 'אורז מבושל' && i.meal === 'dinner');
  const todayBefore = await dayRecord(page, isoAgo(0));
  out.todayHasRice = (todayBefore?.items || []).some((i) => i.label === 'אורז מבושל');
  out.stillYesterday = (await page.locator('.day-chip.on small').innerText()).trim();

  /* copy yesterday's breakfast to today */
  await page.locator('.meal', { hasText: 'ארוחת בוקר' }).locator('.meal-copy').click();
  await pause(page, 600);
  const todayRec = await dayRecord(page, isoAgo(0));
  out.copied = (todayRec?.items || []).filter((i) => i.meal === 'breakfast').map((i) => i.label);

  /* the strip picks any day; "להיום" comes back */
  await page.locator('.day-chip').nth(3).click();
  await pause(page, 700);
  out.d3Items = await page.locator('.meal-item b').allInnerTexts();
  await page.locator('.past-day .btn', { hasText: 'להיום' }).click();
  await pause(page, 700);
  out.backToday = (await page.locator('.day-chip.on small').innerText()).trim();
  out.todayItems = await page.locator('.meal-item b').allInnerTexts();

  /* leaving the screen returns to today next time */
  await page.locator('.day-chip').nth(1).click();
  await pause(page, 600);
  await page.locator('.tab[data-route="home"]').click();
  await pause(page, 700);
  await page.locator('.tab[data-route="nutrition"]').click();
  await pause(page, 800);
  out.afterLeave = (await page.locator('.day-chip.on small').innerText()).trim();

  await page.setViewportSize({ width: 360, height: 780 });
  await pause(page, 300);
  out.overflow360 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  await shot(page, '03-360');

  out.errors = errors;
  console.log(JSON.stringify(out, null, 2));
  await browser.close();

  const fatal = [
    out.chips !== 14 && `day strip has ${out.chips} days`,
    !/היום/.test(out.firstChip) && `first chip: ${out.firstChip}`,
    out.selected !== 'היום' && `selected: ${out.selected}`,
    !/אתמול .*738/.test(out.yesterdayChip) && `yesterday chip should show its calories: ${out.yesterdayChip}`,
    out.recentRows !== 2 && `recent days: ${out.recentRows}`,
    !(/אתמול/.test(out.recentFirst) && /738 קק״ל/.test(out.recentFirst) && /81\/\d+ ג׳ חלבון/.test(out.recentFirst) && /חביתה/.test(out.recentFirst) && /8 כוסות/.test(out.recentFirst))
      && `yesterday's row: ${out.recentFirst}`,
    !/אתמול/.test(out.banner) && `no past-day banner: ${out.banner}`,
    !/^אתמול/.test(out.heroHead) && `hero head: ${out.heroHead}`,
    !(['חביתה', 'פיתה', 'חזה עוף'].every((n) => out.yItems.includes(n))) && `yesterday's foods: ${out.yItems}`,
    out.selectedNow !== 'אתמול' && 'the strip does not mark yesterday',
    out.copyButtons !== 2 && `copy-to-today buttons: ${out.copyButtons}`,
    !out.guidanceHidden && 'today\'s guidance shown on a past day',
    !out.yesterdayHasRice && 'food added on yesterday did not land on yesterday',
    out.todayHasRice && 'food added on yesterday landed on today',
    out.stillYesterday !== 'אתמול' && 'adding food jumped back to today',
    !(out.copied.includes('חביתה') && out.copied.includes('פיתה')) && `copied breakfast: ${out.copied}`,
    !out.d3Items.includes('שווארמה בפיתה') && `three days ago: ${out.d3Items}`,
    out.backToday !== 'היום' && '"להיום" did not come back',
    !out.todayItems.includes('חביתה') && 'the copied breakfast is not on today',
    out.afterLeave !== 'היום' && 'leaving the screen kept the past day',
    out.overflow360 && 'nutrition overflows at 360px',
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
