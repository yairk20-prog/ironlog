/* v5.19: warm-up rests, and runs that really use the GPS.

   · a fixed rest (Settings) is also the rest after a warm-up set; without
     one, a warm-up rest stays 45 s
   · before an outdoor run, the GPS check: it asks for the location, waits
     for a real fix, and names the problem — location blocked, location off
     on the phone, a weak signal — with "check again"; start is enabled only
     with a good fix, and "start without GPS" is always there
   · notifications for the run: turned on from the program sheet; the phase
     changes are handed to the service worker ahead of time and shown on
     time — "עוברים למנוחה" for an easy phase, "משנים קצב" for a hard one,
     and the end; pausing cancels them
   · distance: the last fix is kept on the run, so a reload (or a frozen
     page) bridges the gap; every whole kilometre is announced
   · pocket mode: a black, locked screen; a tap does nothing, holding two
     seconds brings the run back */
import pw from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { LAUNCH, localOnly } from './launch.mjs';

const { chromium } = pw;
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const ORIGIN = `http://localhost:${process.env.PORT || 8777}`;
const BASE = `${ORIGIN}/index.html`;
const SHOTS = `${ROOT}/tools/shots23`;
fs.mkdirSync(SHOTS, { recursive: true });
const shot = (p, n) => p.screenshot({ path: `${SHOTS}/${n}.png` });
const errors = [];
const out = {};
let BROWSER = null;
let PAGE = null;
const pause = (page, ms = 300) => page.waitForTimeout(ms);
const LAT = 32.0853;
const LON = 34.7818;

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

const cardioStatus = (page) => page.evaluate(() => new Promise((resolve) => {
  const onMsg = (e) => { if (e.data?.cardioStatus) { navigator.serviceWorker.removeEventListener('message', onMsg); resolve(e.data.cardioStatus); } };
  navigator.serviceWorker.addEventListener('message', onMsg);
  navigator.serviceWorker.controller.postMessage({ type: 'cardio-status' });
  setTimeout(() => resolve(null), 2000);
}));

const gpsStatus = async (page) => ({
  tone: (await page.locator('.gps-status').getAttribute('class')).replace('gps-status', '').trim(),
  title: (await page.locator('.gps-status b').innerText()).trim(),
  startEnabled: await page.locator('.gps-check .btn.primary').isEnabled(),
  retry: await page.locator('.gps-check .btn', { hasText: 'בדוק שוב' }).isVisible()
});

async function main() {
  const browser = BROWSER = await chromium.launch(LAUNCH);
  const ctx = await browser.newContext({
    viewport: { width: 414, height: 896 }, deviceScaleFactor: 2, locale: 'he-IL', hasTouch: true, isMobile: true,
    geolocation: { latitude: LAT, longitude: LON, accuracy: 8 }
  });
  await localOnly(ctx);
  await ctx.grantPermissions(['geolocation', 'notifications'], { origin: ORIGIN });
  /* A location that can also be blocked or switched off, as on a phone:
     window.__geo = 'real' | 'denied' | 'off'. And every notification the
     page itself shows (the kilometre splits). */
  await ctx.addInitScript(() => {
    const real = navigator.geolocation;
    window.__geo = 'real';
    const fake = {
      watchPosition(ok, err, opts) {
        if (window.__geo === 'denied') { setTimeout(() => err({ code: 1, message: 'denied' }), 60); return -1; }
        if (window.__geo === 'off') { setTimeout(() => err({ code: 2, message: 'off' }), 60); return -2; }
        return real.watchPosition(ok, err, opts);
      },
      clearWatch(id) { if (id >= 0) real.clearWatch(id); },
      getCurrentPosition: (...a) => real.getCurrentPosition(...a)
    };
    Object.defineProperty(navigator, 'geolocation', { get: () => fake, configurable: true });
    window.__shown = [];
    const orig = ServiceWorkerRegistration.prototype.showNotification;
    ServiceWorkerRegistration.prototype.showNotification = function (title, options) {
      window.__shown.push(title);
      return orig.call(this, title, options).catch(() => {});
    };
  });
  const page = PAGE = await ctx.newPage();
  page.setDefaultTimeout(8000);
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(BASE, { waitUntil: 'load' });
  await onboard(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10000 });
  await pause(page, 400);

  /* ---------- 1. warm-up rests ---------- */
  const warmupRest = async () => {
    await page.evaluate(async () => (await import('./js/timer.js')).stop());
    await page.locator('.set.warmup .set-go').first().click();
    await pause(page, 600);
    const t = await page.evaluate(async () => { const tm = await import('./js/timer.js'); return tm.isRunning() ? tm.total() : 0; });
    await page.locator('.set.warmup .set-go').first().click();   // untick, for the next round
    await pause(page, 500);
    return t;
  };
  await page.locator('.hero .btn.primary', { hasText: 'התחל אימון' }).click();
  await page.waitForFunction(() => location.hash === '#/workout');
  await page.waitForSelector('.set:not(.warmup) .set-go');
  await pause(page, 600);
  if (!(await page.locator('.set.warmup').count())) {
    /* warm-ups ramp up to the working weight, so type one first */
    await page.locator('.set:not(.warmup)').nth(0).locator('input').first().fill('60');
    await pause(page, 400);
    await page.locator('.linkish', { hasText: 'עוד אפשרויות' }).click();
    await pause(page, 300);
    await page.locator('#sheetBody .list-link', { hasText: 'הוסף סטי חימום' }).click();
    await pause(page, 600);
  }
  out.warmupRows = await page.locator('.set.warmup').count();
  out.warmupAuto = await warmupRest();
  await page.evaluate(async () => {
    const app = await import('./js/app.js');
    const db = await import('./js/db.js');
    await db.setSetting('restFixed', true);
    await db.setSetting('restSeconds', 75);
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.set.warmup .set-go');
  await pause(page, 600);
  out.warmupFixed = await warmupRest();
  await page.evaluate(async () => (await import('./js/timer.js')).stop());

  /* ---------- 2. the GPS check ---------- */
  await page.goto(`${BASE}#/cardio`, { waitUntil: 'load' });
  await page.waitForSelector('.cardio-card');
  await pause(page, 500);
  await page.locator('.cardio-card', { hasText: 'ריצה קלה' }).click();
  await pause(page, 400);
  /* notifications for the run, turned on right here */
  out.noticeBefore = (await page.locator('#sheetBody .notice-row').innerText()).replace(/\s+/g, ' ');
  await page.locator('#sheetBody .notice-row .btn', { hasText: 'הפעל' }).click();
  await pause(page, 500);
  out.noticeAfter = (await page.locator('#sheetBody .notice-row .badge').innerText().catch(() => '')).trim();
  out.bgNotify = await page.evaluate(async () => (await import('./js/db.js')).setting('bgNotify', null));
  out.startLabel = (await page.locator('#sheetBody .btn.primary').last().innerText()).trim();

  /* blocked */
  await page.evaluate(() => { window.__geo = 'denied'; });
  await page.locator('#sheetBody .btn.primary', { hasText: 'בדיקת GPS' }).click();
  await page.waitForSelector('.gps-check');
  await pause(page, 500);
  out.denied = await gpsStatus(page);
  await shot(page, '01-gps-denied');
  /* switched off on the phone */
  await page.evaluate(() => { window.__geo = 'off'; });
  await page.locator('.gps-check .btn', { hasText: 'בדוק שוב' }).click();
  await pause(page, 500);
  out.off = await gpsStatus(page);
  /* a weak fix, then a good one */
  await ctx.setGeolocation({ latitude: LAT, longitude: LON, accuracy: 90 });
  await page.evaluate(() => { window.__geo = 'real'; });
  await page.locator('.gps-check .btn', { hasText: 'בדוק שוב' }).click();
  await pause(page, 900);
  out.weak = await gpsStatus(page);
  await ctx.setGeolocation({ latitude: LAT, longitude: LON, accuracy: 6 });
  await pause(page, 1200);
  out.ok = await gpsStatus(page);
  await shot(page, '02-gps-ok');
  out.noGpsOption = await page.locator('.gps-check .btn.ghost', { hasText: 'בלי GPS' }).count();

  /* ---------- 3. the run ---------- */
  await page.locator('.gps-check .btn.primary').click();
  await page.waitForSelector('.cardio-run');
  await pause(page, 600);
  for (let i = 1; i <= 4; i++) {
    await ctx.setGeolocation({ latitude: LAT + i * 0.000045, longitude: LON, accuracy: 6 });
    await pause(page, 1000);
  }
  out.liveTone = (await page.locator('.gps-live').getAttribute('class')).replace('gps-live', '').trim();
  out.liveText = (await page.locator('.gps-live').innerText()).trim();
  await pause(page, 5500);   // the run is saved every 5 s
  out.runGps = await page.evaluate(async () => {
    const run = await (await import('./js/cardio.js')).getActiveCardio();
    return { gps: run.gps, hasLastFix: !!run.lastFix, distanceM: Math.round(run.distanceM) };
  });
  await shot(page, '03-run');

  /* pocket mode */
  await page.locator('.btn', { hasText: 'מצב כיס' }).click();
  await pause(page, 400);
  out.pocketOpen = await page.locator('.pocket').count();
  await page.locator('.pocket').click();
  await pause(page, 300);
  out.pocketAfterTap = await page.locator('.pocket').count();
  await shot(page, '04-pocket');
  const box = await page.locator('.pocket').boundingBox();
  await page.mouse.move(box.width / 2, box.height / 2);
  await page.mouse.down();
  await pause(page, 2300);
  await page.mouse.up();
  await pause(page, 300);
  out.pocketAfterHold = await page.locator('.pocket').count();

  /* a kilometre, across a reload: the last fix is on the stored run */
  await page.evaluate(async () => {
    const c = await import('./js/cardio.js');
    const run = await c.getActiveCardio();
    run.distanceM = 995;
    run.splitKm = 0;
    await c.saveActiveCardio(run);
  });
  await page.goto(`${BASE}#/home`, { waitUntil: 'load' });
  await pause(page, 300);
  await page.evaluate(async () => {
    const c = await import('./js/cardio.js');
    const run = await c.getActiveCardio();
    run.distanceM = 995;
    run.splitKm = 0;
    await c.saveActiveCardio(run);
  });
  await page.goto(`${BASE}#/cardio`, { waitUntil: 'load' });
  await page.waitForSelector('.cardio-run');
  await page.evaluate(() => { window.__shown = []; });
  await ctx.setGeolocation({ latitude: LAT + 0.000045 * 7, longitude: LON, accuracy: 6 });
  await pause(page, 1500);
  await ctx.setGeolocation({ latitude: LAT + 0.000045 * 8, longitude: LON, accuracy: 6 });
  await pause(page, 5500);
  out.afterReloadM = await page.evaluate(async () => Math.round((await (await import('./js/cardio.js')).getActiveCardio()).distanceM));
  out.kmShown = await page.locator('.cardio-stats div').nth(0).locator('b').innerText();
  out.splitNotice = await page.evaluate(() => window.__shown.filter((t) => /קילומטר/.test(t)));

  /* ---------- 4. the phase notifications fire on time ---------- */
  await page.goto(`${BASE}#/home`, { waitUntil: 'load' });
  await pause(page, 300);
  await page.evaluate(async () => {
    const c = await import('./js/cardio.js');
    const run = await c.getActiveCardio();
    run.phases = [
      { label: 'הליכה', seconds: 2, zone: 'warm' },
      { label: 'הליכה קלה', seconds: 3, zone: 'walk' },
      { label: 'ריצה מהירה', seconds: 3, zone: 'hard' }
    ];
    run.startedAt = Date.now();
    run.pausedMs = 0;
    run.pausedAt = null;
    await c.saveActiveCardio(run);
  });
  const t0 = Date.now();
  await page.goto(`${BASE}#/cardio`, { waitUntil: 'load' });
  await page.waitForSelector('.cardio-run');
  out.cuesWaiting = (await cardioStatus(page))?.waiting || 0;
  out.cueTitles = await page.evaluate(async () => {
    const c = await import('./js/cardio.js');
    return c.upcomingCues(await c.getActiveCardio(), Date.now() - 60000).map((x) => x.title);
  });
  await pause(page, Math.max(0, t0 + 3200 - Date.now()));
  out.firstCue = (await cardioStatus(page))?.last;
  await pause(page, Math.max(0, t0 + 6200 - Date.now()));
  out.secondCue = (await cardioStatus(page))?.last;
  /* pause: nothing more is waiting */
  await page.locator('.cardio-pause').click().catch(() => {});
  await pause(page, 500);
  out.waitingWhenPaused = (await cardioStatus(page))?.waiting ?? -1;

  out.errors = errors;
  console.log(JSON.stringify(out, null, 2));
  await browser.close();

  const fatal = [
    !(out.warmupRows > 0) && 'test setup: no warm-up sets',
    out.warmupAuto !== 45 && `warm-up rest without a fixed rest: ${out.warmupAuto}`,
    out.warmupFixed !== 75 && `warm-up rest with a fixed 75 s: ${out.warmupFixed}`,
    !/התראה בכל מעבר/.test(out.noticeBefore) && `notification row: ${out.noticeBefore}`,
    out.noticeAfter !== 'פעיל' && `after turning notifications on: ${out.noticeAfter}`,
    out.bgNotify !== true && 'the notification setting was not saved',
    !/בדיקת GPS/.test(out.startLabel) && `outdoor start button: ${out.startLabel}`,
    !(out.denied.tone === 'bad' && /חסומה/.test(out.denied.title) && !out.denied.startEnabled && out.denied.retry) && `blocked: ${JSON.stringify(out.denied)}`,
    !(out.off.tone === 'bad' && /כבוי/.test(out.off.title) && !out.off.startEnabled && out.off.retry) && `GPS off: ${JSON.stringify(out.off)}`,
    !(out.weak.tone === 'warn' && !out.weak.startEnabled) && `weak signal: ${JSON.stringify(out.weak)}`,
    !(out.ok.tone === 'ok' && out.ok.startEnabled && !out.ok.retry) && `good fix: ${JSON.stringify(out.ok)}`,
    out.noGpsOption !== 1 && 'no "start without GPS"',
    !(out.liveTone === 'ok' && out.liveText === 'GPS מחובר') && `live GPS line: ${out.liveTone} ${out.liveText}`,
    !(out.runGps.gps && out.runGps.hasLastFix && out.runGps.distanceM > 10) && `run: ${JSON.stringify(out.runGps)}`,
    out.cuesWaiting !== 3 && `phase notifications handed to the service worker: ${out.cuesWaiting} (want 3)`,
    out.pocketOpen !== 1 && 'pocket mode did not open',
    out.pocketAfterTap !== 1 && 'a tap closed pocket mode',
    out.pocketAfterHold !== 0 && 'holding did not close pocket mode',
    !(out.afterReloadM >= 1000) && `distance across the reload: ${out.afterReloadM}`,
    !/^1\.0/.test(out.kmShown) && `km on screen: ${out.kmShown}`,
    out.splitNotice.length !== 1 && `kilometre notice: ${JSON.stringify(out.splitNotice)}`,
    !(out.cueTitles[0] === 'עוברים למנוחה: הליכה קלה' && out.cueTitles[1] === 'משנים קצב: ריצה מהירה' && out.cueTitles[2] === 'סיימת את האימון') && `cue titles: ${out.cueTitles}`,
    out.firstCue?.title !== 'עוברים למנוחה: הליכה קלה' && `first cue shown: ${JSON.stringify(out.firstCue)}`,
    out.secondCue?.title !== 'משנים קצב: ריצה מהירה' && `second cue shown: ${JSON.stringify(out.secondCue)}`,
    out.waitingWhenPaused !== 0 && `paused, still waiting: ${out.waitingWhenPaused}`,
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
