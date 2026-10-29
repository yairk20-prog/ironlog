/* v5.21–5.22: the end of a rest with the screen locked, over music — and
   the music itself left exactly as it is.

   · rest-end notifications are on by default (with the phone's permission)
   · nothing is ever played as media (no <audio>): every sound is Web Audio,
     which takes no audio focus, so the music is never paused or lowered
   · the 3-2-1 and the alarm are scheduled on the audio clock — a pip at 3,
     2 and 1 seconds before the end and the alarm at the end, exactly, also
     with the screen locked and also when the page woke up late (what has
     passed is skipped); +30 cancels what was scheduled
   · with the screen locked (the page hidden) during a rest, an inaudible
     25 Hz tone keeps the page running so the alarm rings on time, and the
     page shows its own notification as a second line behind the worker's;
     the tone stops once the alarm has rung, and when the app is back
   · the same during a run: hidden mid-run keeps it going, back stops it */
import pw from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { LAUNCH, localOnly } from './launch.mjs';

const { chromium } = pw;
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const ORIGIN = `http://localhost:${process.env.PORT || 8777}`;
const BASE = `${ORIGIN}/index.html`;
const errors = [];
const out = {};
let BROWSER = null;
const pause = (page, ms = 300) => page.waitForTimeout(ms);
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';

async function onboard(page) {
  await page.locator('.login .btn', { hasText: 'המשך בלי חשבון' }).click();
  await page.waitForSelector('.onb');
  for (let i = 0; i < 20 && (await page.locator('.onb').count()); i++) {
    await page.locator('.onb-foot .btn.primary').click({ timeout: 5000 }).catch(() => {});
    await pause(page, 320);
  }
  await page.waitForFunction(() => !document.querySelector('.onb'), null, { timeout: 10000 });
  await pause(page, 400);
}

const restStatus = (page) => page.evaluate(() => new Promise((resolve) => {
  const onMsg = (e) => { if (e.data?.restStatus) { navigator.serviceWorker.removeEventListener('message', onMsg); resolve(e.data.restStatus); } };
  navigator.serviceWorker.addEventListener('message', onMsg);
  navigator.serviceWorker.controller.postMessage({ type: 'rest-status' });
  setTimeout(() => resolve(null), 2000);
}));

/** The screen locks / unlocks, as far as the page can tell. */
const setHidden = (page, hidden) => page.evaluate((h) => {
  window.__hidden = h;
  document.dispatchEvent(new Event('visibilitychange'));
}, hidden);
const alive = (page) => page.evaluate(async () => (await import('./js/ui.js')).keepingAlive());

async function main() {
  BROWSER = await chromium.launch(LAUNCH);
  const ctx = await BROWSER.newContext({ viewport: { width: 390, height: 844 }, locale: 'he-IL', hasTouch: true, isMobile: true, userAgent: ANDROID });
  await localOnly(ctx);
  await ctx.grantPermissions(['notifications'], { origin: ORIGIN });
  await ctx.addInitScript(() => {
    /* a lockable screen */
    window.__hidden = false;
    Object.defineProperty(document, 'hidden', { get: () => window.__hidden, configurable: true });
    Object.defineProperty(document, 'visibilityState', { get: () => (window.__hidden ? 'hidden' : 'visible'), configurable: true });
    /* anything played as media would take audio focus from the music */
    window.__media = [];
    HTMLMediaElement.prototype.play = function () {
      window.__media.push(this.currentSrc || this.src);
      return Promise.resolve();
    };
    /* every tone: its pitch, and when it is due on the wall clock */
    window.__tones = [];
    window.__due = [];
    const start = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (t) {
      const f = Math.round(this.frequency.value);
      window.__tones.push(f);
      window.__due.push({ f, at: Date.now() + ((t || this.context.currentTime) - this.context.currentTime) * 1000 });
      return start.call(this, t);
    };
    window.__cancelled = 0;
    const stop = OscillatorNode.prototype.stop;
    OscillatorNode.prototype.stop = function (t) { if (t === undefined) window.__cancelled += 1; return stop.call(this, t); };
    window.__shown = [];
    const show = ServiceWorkerRegistration.prototype.showNotification;
    ServiceWorkerRegistration.prototype.showNotification = function (title, options) {
      window.__shown.push(title);
      return show.call(this, title, options).catch(() => {});
    };
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: 'load' });
  await onboard(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10000 });
  await page.mouse.click(5, 5);   // a first touch, as on a phone: audio is unlocked
  await pause(page, 300);

  /* ---------- on by default ---------- */
  out.noticesOn = await page.evaluate(async () => (await import('./js/timer.js')).noticesOn());
  await page.evaluate(async () => (await import('./js/timer.js')).start(30, 'מנוחה · לחיצת חזה'));
  await pause(page, 300);
  out.scheduled = (await restStatus(page))?.waiting || 0;
  await page.evaluate(async () => (await import('./js/timer.js')).stop());

  /* sine + square per beep: one entry per pitch is enough */
  const beeps = (list) => list.filter((x, i) => i % 2 === 0);
  /* woken late, 1.5 s before the end: pip "1" and the alarm, on time; 3 and 2 have passed */
  out.late = await page.evaluate(async () => {
    window.__due = [];
    const ui = await import('./js/ui.js');
    const endAt = Date.now() + 1500;
    ui.scheduleRestEnd(endAt);
    const due = window.__due.map((d) => ({ f: d.f, dt: Math.round(d.at - endAt) }));
    ui.cancelRestEnd();
    return due;
  });
  out.late = beeps(out.late);

  /* ---------- a rest that ends with the screen locked ---------- */
  await page.evaluate(() => { window.__tones = []; window.__due = []; window.__shown = []; });
  const endAt = await page.evaluate(async () => {
    (await import('./js/timer.js')).start(5, 'מנוחה · לחיצת כתפיים');
    return Date.now() + 5000;
  });
  await setHidden(page, true);
  await pause(page, 400);
  out.aliveWhileLocked = await alive(page);
  out.keeperTone = await page.evaluate(() => window.__tones.includes(25));
  await pause(page, 5000);
  out.lockedDue = beeps(await page.evaluate((endAt) => window.__due
    .filter((d) => d.f >= 1000).map((d) => ({ f: d.f, dt: Math.round(d.at - endAt) })), endAt));
  out.pageNotice = await page.evaluate(() => window.__shown.slice());
  await pause(page, 4300);
  out.aliveAfterAlarm = await alive(page);
  await setHidden(page, false);
  await page.evaluate(async () => (await import('./js/timer.js')).stop());

  /* locked, then back mid-rest: the tone stops */
  await page.evaluate(async () => (await import('./js/timer.js')).start(30, 'מנוחה · בדיקה'));
  await setHidden(page, true);
  await pause(page, 200);
  const lockedMid = await alive(page);
  await setHidden(page, false);
  await pause(page, 200);
  out.lockUnlock = [lockedMid, await alive(page)];
  await page.evaluate(async () => (await import('./js/timer.js')).stop());

  /* +30 during the countdown: what was scheduled is cancelled */
  await page.evaluate(() => { window.__cancelled = 0; });
  await page.evaluate(async () => (await import('./js/timer.js')).start(4, 'מנוחה · ביטול'));
  await pause(page, 600);
  await page.evaluate(async () => (await import('./js/timer.js')).add(30));
  await pause(page, 200);
  out.cancelledOnAdd = await page.evaluate(() => window.__cancelled);
  await page.evaluate(async () => (await import('./js/timer.js')).stop());
  out.media = await page.evaluate(() => window.__media.slice());

  /* ---------- a run, locked ---------- */
  await page.goto(`${BASE}#/cardio`, { waitUntil: 'load' });
  await page.waitForSelector('.cardio-card');
  await pause(page, 400);
  await page.locator('.cardio-card', { hasText: 'HIIT' }).first().click();
  await pause(page, 400);
  await page.locator('#sheetBody .btn.primary', { hasText: 'התחל' }).click();
  await page.waitForSelector('.cardio-run');
  await pause(page, 500);
  await setHidden(page, true);
  await pause(page, 200);
  const runLocked = await alive(page);
  await setHidden(page, false);
  await pause(page, 200);
  out.runLockUnlock = [runLocked, await alive(page)];

  out.errors = errors;
  console.log(JSON.stringify(out, null, 2));
  await BROWSER.close();

  const fatal = [
    out.noticesOn !== true && 'rest-end notifications are not on by default',
    !(out.scheduled > 0) && 'a rest was not handed to the worker',
    out.aliveWhileLocked !== true && 'the page was not kept running with the screen locked',
    !out.keeperTone && 'no keep-alive tone',
    /* locked: pips at −3, −2, −1 s and the alarm (12 beeps) from the end — each within 150 ms */
    !(out.lockedDue.length === 15
      && [-3000, -2000, -1000].every((t, i) => Math.abs(out.lockedDue[i].dt - t) < 150)
      && Math.abs(out.lockedDue[3].dt) < 150) && `locked countdown: ${JSON.stringify(out.lockedDue)}`,
    /* woken late: only pip "1" (at −1 s) and the alarm at the end */
    !(out.late.length === 13 && Math.abs(out.late[0].dt + 1000) < 150 && Math.abs(out.late[1].dt) < 150) && `late wake: ${JSON.stringify(out.late)}`,
    !(out.cancelledOnAdd >= 20) && `+30 did not cancel the scheduled countdown (${out.cancelledOnAdd})`,
    out.media.length !== 0 && `something was played as media (it would touch the music): ${JSON.stringify(out.media)}`,
    !out.pageNotice.includes('המנוחה הסתיימה') && `no notification from the page: ${JSON.stringify(out.pageNotice)}`,
    out.aliveAfterAlarm !== false && 'the keep-alive tone kept going after the alarm',
    out.lockUnlock.join(',') !== 'true,false' && `lock / unlock mid-rest: ${out.lockUnlock}`,
    out.runLockUnlock.join(',') !== 'true,false' && `lock / unlock mid-run: ${out.runLockUnlock}`,
    errors.length && `page errors: ${errors.join(' | ')}`
  ].filter(Boolean);
  if (fatal.length) { console.error('FAIL:', fatal.join(' | ')); process.exitCode = 1; return; }
  console.log('PASS');
}

main().catch(async (e) => {
  console.error('FATAL', e);
  if (BROWSER) await BROWSER.close().catch(() => {});
  process.exitCode = 2;
});
