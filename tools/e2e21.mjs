/* v5.17: a fixed rest between sets, chosen and edited in Settings.

   · Settings ← התנהגות: "אוטומטי" by default; "מספר קבוע" saves 90 s,
     which is then edited by ±15, by typing, and by a preset; a number out
     of range is refused and the old one kept
   · in a workout, ticking a work set starts exactly the fixed rest
   · "זמן מנוחה" in the exercise's options says the rest in force, can
     override it for this exercise (a preset or a typed number), and can go
     back to the default
   · back on "אוטומטי", the rest is the plan's again (exercise × goal)
   · the control fits a 360px screen */
import pw from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { LAUNCH, localOnly } from './launch.mjs';

const { chromium } = pw;
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const BASE = `http://localhost:${process.env.PORT || 8777}/index.html`;
const SHOTS = `${ROOT}/tools/shots21`;
fs.mkdirSync(SHOTS, { recursive: true });
const shot = (p, n) => p.screenshot({ path: `${SHOTS}/${n}.png` });
const errors = [];
const out = {};
let BROWSER = null;
let PAGE = null;
const pause = (page, ms = 300) => page.waitForTimeout(ms);

const setting = (page, k) => page.evaluate(async (k) => (await import('./js/db.js')).setting(k, null), k);
const restNow = (page) => page.evaluate(async () => {
  const timer = await import('./js/timer.js');
  return timer.isRunning() ? timer.total() : 0;
});

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

async function openBehaviour(page) {
  await page.evaluate(async () => (await import('./js/app.js')).go('settings'));
  await page.waitForSelector('.sect-head');
  await pause(page, 500);
  await page.locator('.sect-head', { hasText: 'התנהגות' }).click();
  await pause(page, 300);
}

const control = (page) => page.locator('.rest-control');

/** Tick the n-th work set of the exercise on screen and read the rest it started. */
async function tick(page, n) {
  await page.evaluate(async () => (await import('./js/timer.js')).stop());
  await page.locator('.set:not(.warmup)').nth(n).locator('.set-go').click();
  await pause(page, 700);
  const total = await restNow(page);
  await page.locator('.rest-close').click().catch(() => {});
  await pause(page, 300);
  return total;
}

async function restSheet(page) {
  await page.locator('.linkish', { hasText: 'עוד אפשרויות' }).click();
  await pause(page, 400);
  const sub = (await page.locator('#sheetBody .list-link', { hasText: 'זמן מנוחה' }).locator('small').innerText()).trim();
  await page.locator('#sheetBody .list-link', { hasText: 'זמן מנוחה' }).click();
  await page.waitForFunction(() => document.querySelector('#sheetTitle')?.textContent.trim() === 'זמן מנוחה');
  await pause(page, 300);
  return sub;
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

  /* ---------- Settings ---------- */
  await openBehaviour(page);
  out.defaultOn = (await control(page).locator('.chip.on').innerText()).trim();
  out.defaultFixed = await setting(page, 'restFixed');
  await control(page).locator('.chip', { hasText: 'מספר קבוע' }).click();
  await pause(page, 300);
  out.fixedOn = [await setting(page, 'restFixed'), await setting(page, 'restSeconds')];
  await control(page).locator('.step-btn[aria-label="הגדל מנוחה"]').click();
  await pause(page, 300);
  out.afterPlus = await setting(page, 'restSeconds');
  await control(page).locator('.step-btn[aria-label="הקטן מנוחה"]').click();
  await control(page).locator('.step-btn[aria-label="הקטן מנוחה"]').click();
  await pause(page, 300);
  out.afterMinus = await setting(page, 'restSeconds');
  await control(page).locator('.rest-sec-in').fill('80');
  await control(page).locator('.rest-sec-in').press('Enter');
  await pause(page, 400);
  out.afterType = await setting(page, 'restSeconds');
  out.typedLabel = (await control(page).locator('.step-read small').innerText()).trim();
  await control(page).locator('.chip', { hasText: '1:00 דק׳' }).click();
  await pause(page, 300);
  out.afterPreset = await setting(page, 'restSeconds');
  await control(page).locator('.rest-sec-in').fill('5');
  await control(page).locator('.rest-sec-in').press('Enter');
  await pause(page, 400);
  out.afterBad = await setting(page, 'restSeconds');
  out.badShown = await control(page).locator('.rest-sec-in').inputValue();
  out.badToast = (await page.locator('.toast').last().innerText().catch(() => '')).trim();
  await shot(page, '01-settings');
  /* survives a reload */
  await page.reload({ waitUntil: 'load' });
  await pause(page, 600);
  await openBehaviour(page);
  out.afterReload = (await control(page).locator('.rest-sec-in').inputValue());
  out.sectionSub = (await page.locator('.sect-head', { hasText: 'התנהגות' }).locator('small').innerText()).trim();

  /* ---------- a workout ---------- */
  await page.evaluate(async () => (await import('./js/app.js')).go('home'));
  await page.waitForSelector('.hero .btn.primary');
  await pause(page, 400);
  await page.locator('.hero .btn.primary', { hasText: 'התחל אימון' }).click();
  await page.waitForFunction(() => location.hash === '#/workout');
  await page.waitForSelector('.set:not(.warmup) .set-go');
  await pause(page, 800);
  out.rest1 = await tick(page, 0);

  /* the options say it, and override it for this exercise */
  out.menuSub = await restSheet(page);
  out.sheetDefault = (await page.locator('#sheetBody .opt.on b').innerText()).trim();
  await page.locator('#sheetBody .opt', { hasText: '2:00 דק׳' }).click();
  await pause(page, 500);
  out.overrideStarted = await restNow(page);
  out.rest2 = await tick(page, 1);

  await restSheet(page);
  await page.locator('#sheetBody .rest-own-in').fill('100');
  await page.locator('#sheetBody .btn', { hasText: 'קבע לתרגיל הזה' }).click();
  await pause(page, 500);
  out.rest3 = await tick(page, 2);
  out.slot = await page.evaluate(async () => {
    const db = await import('./js/db.js');
    const w = (await db.all('workouts')).find((x) => !x.completed);
    const s = w.slots[w.cursor || 0];
    return { rest: s.rest, restSet: s.restSet };
  });

  /* back to the default */
  await restSheet(page);
  await page.locator('#sheetBody .opt', { hasText: 'ברירת המחדל' }).click();
  await pause(page, 500);
  out.backToDefault = await restNow(page);
  out.rest4 = await tick(page, 3).catch(() => -1);

  /* ---------- automatic again: the plan's rest ---------- */
  await openBehaviour(page);
  await control(page).locator('.chip', { hasText: 'אוטומטי' }).click();
  await pause(page, 300);
  out.autoSaved = await setting(page, 'restFixed');
  out.expectedAuto = await page.evaluate(async () => {
    const db = await import('./js/db.js');
    const { restFor, goalList } = await import('./js/programs.js');
    const { getExercise } = await import('./js/exercises.js');
    const settings = { goals: await db.setting('goals', null), goal: await db.setting('goal', null) };
    const w = (await db.all('workouts')).find((x) => !x.completed);
    const s = w.slots[w.cursor || 0];
    return { plan: restFor(goalList(settings), getExercise(s.ex)), slotRest: s.rest, restSet: s.restSet };
  });
  await page.evaluate(async () => (await import('./js/app.js')).go('workout'));
  await page.waitForSelector('.set:not(.warmup) .set-go');
  await pause(page, 700);
  out.autoMenuSub = await restSheet(page);
  await page.locator('.sheet-close').click();
  await pause(page, 300);

  /* ---------- 360px ---------- */
  await page.evaluate(async () => {
    const db = await import('./js/db.js');
    await db.setSetting('restFixed', true);
  });
  await page.setViewportSize({ width: 360, height: 760 });
  await page.reload({ waitUntil: 'load' });
  await pause(page, 600);
  await openBehaviour(page);
  await control(page).scrollIntoViewIfNeeded();
  out.overflow360 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1
    || [...document.querySelectorAll('.rest-control *')].some((n) => n.getBoundingClientRect().right > window.innerWidth + 1));
  await shot(page, '02-settings-360');

  out.errors = errors;
  console.log(JSON.stringify(out, null, 2));
  await browser.close();

  const fatal = [
    out.defaultOn !== 'אוטומטי' && `default: ${out.defaultOn}`,
    out.defaultFixed && 'fixed rest on by default',
    out.fixedOn.join(',') !== 'true,90' && `"מספר קבוע" saved ${out.fixedOn}`,
    out.afterPlus !== 105 && `+15: ${out.afterPlus}`,
    out.afterMinus !== 75 && `−15 twice: ${out.afterMinus}`,
    out.afterType !== 80 && `typed 80: ${out.afterType}`,
    !/1:20 דק׳/.test(out.typedLabel) && `label for 80: ${out.typedLabel}`,
    out.afterPreset !== 60 && `preset 1:00: ${out.afterPreset}`,
    out.afterBad !== 60 && `typing 5 changed the rest to ${out.afterBad}`,
    out.badShown !== '60' && `the field kept a refused number: ${out.badShown}`,
    !/בין 15 ל-600/.test(out.badToast) && `no explanation for a refused number: ${out.badToast}`,
    out.afterReload !== '60' && `after reload: ${out.afterReload}`,
    !/מנוחה 1:00 דק׳/.test(out.sectionSub) && `section summary: ${out.sectionSub}`,
    out.rest1 !== 60 && `a work set started ${out.rest1} s of rest (want 60)`,
    out.menuSub !== 'כרגע 1:00 דק׳' && `options say: ${out.menuSub}`,
    !/ברירת המחדל · 1:00 דק׳/.test(out.sheetDefault) && `rest sheet default: ${out.sheetDefault}`,
    out.overrideStarted !== 120 && `choosing 2:00 started ${out.overrideStarted}`,
    out.rest2 !== 120 && `the override did not hold for the next set: ${out.rest2}`,
    out.rest3 !== 100 && `a typed 100 gave ${out.rest3}`,
    !(out.slot.rest === 100 && out.slot.restSet === true) && `slot: ${JSON.stringify(out.slot)}`,
    out.backToDefault !== 60 && `back to default started ${out.backToDefault}`,
    !(out.rest4 === 60 || out.rest4 === -1) && `after going back to default: ${out.rest4}`,
    out.autoSaved !== false && 'automatic did not save',
    out.autoMenuSub !== `כרגע ${out.expectedAuto.plan < 60 ? `${out.expectedAuto.plan} שניות` : `${Math.floor(out.expectedAuto.plan / 60)}:${String(out.expectedAuto.plan % 60).padStart(2, '0')} דק׳`}`
      && `automatic rest: ${out.autoMenuSub} (plan ${out.expectedAuto.plan})`,
    out.overflow360 && 'the rest control overflows at 360px',
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
