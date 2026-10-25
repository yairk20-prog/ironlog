/* v5.8: the day at a glance, water as a tank, and a second person on the app.

   · protein and calories are two rings whose numbers, remaining amounts and
     accessible values follow what was eaten — and calories past the target
     say so instead of reading as success
   · water is a tank that fills, litres in large type, one big "add a glass"
   · the More screen shares the install link, and explains that each phone
     keeps its own data while updates reach everyone
   · opening a new build after an old one announces the update */
import pw from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { LAUNCH, localOnly } from './launch.mjs';

const { chromium } = pw;
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const BASE = `http://localhost:${process.env.PORT || 8777}/index.html`;
const SHOTS = `${ROOT}/tools/shots14`;
fs.mkdirSync(SHOTS, { recursive: true });
const shot = (p, n) => p.screenshot({ path: `${SHOTS}/${n}.png` });
const errors = [];
const out = {};
let BROWSER = null;
let PAGE = null;
const pause = (page, ms = 300) => page.waitForTimeout(ms);

async function boot(page) {
  await page.goto(BASE, { waitUntil: 'load' });
  await page.locator('.login .btn', { hasText: 'המשך בלי חשבון' }).click();
  await page.waitForSelector('.onb');
  for (let i = 0; i < 20 && (await page.locator('.onb').count()); i++) {
    await page.locator('.onb-foot .btn.primary').click({ timeout: 5000 }).catch(() => {});
    await pause(page, 320);
  }
  await page.waitForFunction(() => !document.querySelector('.onb'), null, { timeout: 10000 });
}

/** Write today's log directly, so the rings have known numbers to show. */
const setDay = (page, items, water) => page.evaluate(async ([items, water]) => {
  const db = await import('./js/db.js');
  const d = new Date();
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const rows = await db.byIndex('nutrition_logs', 'date', IDBKeyRange.only(iso));
  const t = items.reduce((a, i) => ({ k: a.k + i.kcal, p: a.p + i.p, c: a.c + i.c, f: a.f + i.f }), { k: 0, p: 0, c: 0, f: 0 });
  await db.put('nutrition_logs', {
    id: rows[0]?.id || db.uid('n'), date: iso, items,
    calories_consumed: t.k, protein_grams: t.p, carbs_grams: t.c, fat_grams: t.f, water_ml: water
  });
}, [items, water]);

const ringInfo = (page, cls) => page.locator(`.ring.${cls}`).evaluate((r) => ({
  now: Number(r.getAttribute('aria-valuenow')),
  max: Number(r.getAttribute('aria-valuemax')),
  center: r.querySelector('.ring-center b').textContent,
  foot: r.querySelector('.ring-label small').textContent,
  offset: Number(r.querySelector('.ring-fill').getAttribute('stroke-dashoffset')),
  over: r.classList.contains('over')
}));

async function main() {
  const browser = BROWSER = await chromium.launch(LAUNCH);
  const ctx = await browser.newContext({
    viewport: { width: 414, height: 896 }, deviceScaleFactor: 2,
    locale: 'he-IL', hasTouch: true, isMobile: true
  });
  await localOnly(ctx);
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(BASE).origin });
  const page = PAGE = await ctx.newPage();
  page.setDefaultTimeout(8000);
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await boot(page);

  /* ---------- an empty day ---------- */
  await page.goto(`${BASE}#/nutrition`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ring.protein');
  await pause(page, 400);
  out.empty = await ringInfo(page, 'protein');
  out.emptyTank = await page.locator('.tank-fill').evaluate((n) => n.style.height);
  await shot(page, '01-empty');

  /* ---------- a day half eaten ---------- */
  await setDay(page, [
    { label: 'חזה עוף', amount: '200 גרם', cat: 'protein', kcal: 330, p: 62, c: 0, f: 7.2, meal: 'lunch' },
    { label: 'אורז מבושל', amount: 'כוס', cat: 'carb', kcal: 208, p: 4.3, c: 44.8, f: 0.5, meal: 'lunch' }
  ], 1250);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ring.protein');
  await pause(page, 500);
  out.protein = await ringInfo(page, 'protein');
  out.kcal = await ringInfo(page, 'kcal');
  out.macroTiles = (await page.locator('.macro-tiles').innerText()).replace(/\s+/g, ' ');
  out.tankHeight = await page.locator('.tank-fill').evaluate((n) => n.style.height);
  out.tankNumber = (await page.locator('.tank-text b').textContent()).trim();
  out.waterLine = (await page.locator('.water-line').innerText()).replace(/\s+/g, ' ');
  out.waterAria = await page.locator('.tank').getAttribute('aria-label');
  await shot(page, '02-half');

  /* the big button adds exactly one glass */
  await page.locator('.btn.water-add').click();
  await pause(page, 600);
  out.tankAfterGlass = (await page.locator('.tank-text b').textContent()).trim();
  out.glassesFull = await page.locator('.glass.full').count();

  /* the add-food button opens the add sheet on the current meal */
  await page.locator('.day-hero .btn.primary').click();
  await pause(page, 400);
  out.heroOpens = (await page.locator('#sheetTitle').innerText()).trim();
  await page.locator('.sheet-close').click();
  await pause(page, 300);

  /* ---------- past the calorie target ---------- */
  await setDay(page, [
    { label: 'פיצה', amount: 'מגש', cat: 'dish', kcal: 4000, p: 160, c: 400, f: 160, meal: 'dinner' }
  ], 3000);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ring.kcal');
  await pause(page, 500);
  out.overKcal = await ringInfo(page, 'kcal');
  out.overProtein = await ringInfo(page, 'protein');
  out.waterDone = (await page.locator('.water-card .badge').innerText()).trim();
  await shot(page, '03-over');

  await page.setViewportSize({ width: 360, height: 780 });
  await pause(page, 300);
  await shot(page, '04-360');
  out.overflow360 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  out.ringsFit360 = await page.evaluate(() => [...document.querySelectorAll('.ring-dial')].every((d) => d.getBoundingClientRect().width >= 120));
  await page.setViewportSize({ width: 414, height: 896 });

  /* ---------- sharing ---------- */
  await page.goto(`${BASE}#/more`, { waitUntil: 'domcontentloaded' });
  await pause(page, 600);
  await page.locator('.list-link', { hasText: 'שתף' }).click();
  await pause(page, 400);
  out.shareUrl = (await page.locator('#sheetBody .share-url').innerText()).trim();
  out.shareText = (await page.locator('#sheetBody').innerText()).replace(/\s+/g, ' ');
  await shot(page, '05-share');
  await page.evaluate(() => { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); });
  await page.locator('#sheetBody .btn', { hasText: 'העתק קישור' }).click();
  await pause(page, 300);
  out.clipboard = await page.evaluate(() => navigator.clipboard.readText());
  out.copyToast = (await page.locator('#toaster').innerText()).trim();

  /* ---------- an update announces itself ---------- */
  await page.evaluate(async () => (await import('./js/db.js')).setSetting('seenBuild', '5.0.0'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#toaster .toast', { timeout: 6000 }).catch(() => {});
  out.updateToast = (await page.locator('#toaster').innerText().catch(() => '')).trim();
  await page.reload({ waitUntil: 'load' });
  await pause(page, 1200);
  out.updateToastAgain = (await page.locator('#toaster').innerText().catch(() => '')).trim();
  const build = await page.evaluate(async () => (await import('./js/version.js')).BUILD);

  out.errors = errors;
  console.log(JSON.stringify(out, null, 2));
  await browser.close();

  const fatal = [
    !(out.empty.now === 0 && out.empty.max > 0 && /נשארו/.test(out.empty.foot)) && `empty protein ring: ${JSON.stringify(out.empty)}`,
    out.emptyTank !== '0%' && `an empty day's tank is ${out.emptyTank}`,
    !(out.protein.now === 66 && out.protein.center === '66' && out.protein.foot.includes(`נשארו ${out.protein.max - 66}`))
      && `protein ring: ${JSON.stringify(out.protein)}`,
    !(out.protein.offset > 0 && out.protein.offset < out.empty.offset) && 'the protein ring does not fill',
    !(out.kcal.now === 538 && !out.kcal.over) && `calorie ring: ${JSON.stringify(out.kcal)}`,
    !/פחמימות 45 ג׳/.test(out.macroTiles) && `carbs tile: ${out.macroTiles}`,
    !(out.tankHeight === '42%' && out.tankNumber === '5') && `tank at 1.25 l of 3: ${out.tankHeight} / ${out.tankNumber}`,
    !/1\.3 מתוך 3 ליטר/.test(out.waterLine) && `water line: ${out.waterLine}`,
    !/5 מתוך 12 כוסות/.test(out.waterAria || '') && `water is not announced: ${out.waterAria}`,
    !(out.tankAfterGlass === '6' && out.glassesFull === 6) && `one glass added ${out.tankAfterGlass} / ${out.glassesFull}`,
    !/הוספת מאכל/.test(out.heroOpens) && `the hero button opened ${out.heroOpens}`,
    !(out.overKcal.over && /חריגה של \d+/.test(out.overKcal.foot) && out.overKcal.offset === 0) && `calories over target: ${JSON.stringify(out.overKcal)}`,
    !/הושג/.test(out.overProtein.foot) && 'protein past target does not say it is reached',
    out.waterDone !== 'הושלם' && `full water says ${out.waterDone}`,
    out.overflow360 && 'nutrition overflows at 360px',
    !out.ringsFit360 && 'the rings shrink too far at 360px',
    !/^http:\/\/localhost:\d+\/$/.test(out.shareUrl) && `share link: ${out.shareUrl}`,
    !/נפרדים/.test(out.shareText) && 'the share sheet does not say the data stays separate',
    !/עדכונים/.test(out.shareText) && 'the share sheet does not say updates reach everyone',
    out.clipboard !== out.shareUrl && `copied ${out.clipboard}`,
    !/הועתק/.test(out.copyToast) && 'copying was not confirmed',
    !out.updateToast.includes(`עודכנה לגרסה ${build}`) && `no update notice: "${out.updateToast}"`,
    /עודכנה/.test(out.updateToastAgain) && 'the update notice repeats on every open',
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
