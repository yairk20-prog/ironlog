/* v5.21: the end of a rest with the screen locked, and over music.

   · rest-end notifications are on by default (with the phone's permission)
   · on Android the alarm is a short media clip (sounds/rest-end.wav, under
     five seconds), which Android plays with "may duck" audio focus — the
     music is turned down while it rings; if the clip cannot play, the
     Web Audio alarm rings instead
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
    /* what is played, and how */
    window.__media = [];
    window.__mediaFails = false;
    HTMLMediaElement.prototype.play = function () {
      window.__media.push(this.currentSrc || this.src);
      return window.__mediaFails ? Promise.reject(new Error('blocked')) : Promise.resolve();
    };
    window.__tones = [];
    const start = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (t) { window.__tones.push(Math.round(this.frequency.value)); return start.call(this, t); };
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

  /* ---------- the clip ---------- */
  out.clip = await page.evaluate(() => new Promise((resolve) => {
    const a = new Audio('sounds/rest-end.wav');
    a.addEventListener('loadedmetadata', () => resolve({ duration: a.duration }));
    a.addEventListener('error', () => resolve({ error: true }));
  }));

  /* ---------- a rest that ends with the screen locked ---------- */
  await page.evaluate(() => { window.__media = []; window.__tones = []; window.__shown = []; });
  await page.evaluate(async () => (await import('./js/timer.js')).start(3, 'מנוחה · לחיצת כתפיים'));
  await setHidden(page, true);
  await pause(page, 400);
  out.aliveWhileLocked = await alive(page);
  out.keeperTone = await page.evaluate(() => window.__tones.includes(25));
  await pause(page, 3200);
  out.mediaPlayed = await page.evaluate(() => window.__media.slice());
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

  /* the clip is blocked: the tone alarm rings instead */
  await page.evaluate(() => { window.__mediaFails = true; window.__tones = []; });
  await page.evaluate(async () => (await import('./js/ui.js')).chime());
  await pause(page, 300);
  out.fallbackTones = await page.evaluate(() => window.__tones.filter((f) => f >= 1500).length);
  await page.evaluate(() => { window.__mediaFails = false; });

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
    !(out.clip.duration > 1 && out.clip.duration < 5) && `the alarm clip: ${JSON.stringify(out.clip)}`,
    out.aliveWhileLocked !== true && 'the page was not kept running with the screen locked',
    !out.keeperTone && 'no keep-alive tone',
    !out.mediaPlayed.some((s) => /sounds\/rest-end\.wav$/.test(s)) && `the alarm clip did not play: ${JSON.stringify(out.mediaPlayed)}`,
    !out.pageNotice.includes('המנוחה הסתיימה') && `no notification from the page: ${JSON.stringify(out.pageNotice)}`,
    out.aliveAfterAlarm !== false && 'the keep-alive tone kept going after the alarm',
    out.lockUnlock.join(',') !== 'true,false' && `lock / unlock mid-rest: ${out.lockUnlock}`,
    !(out.fallbackTones >= 12) && `no tone alarm when the clip is blocked (${out.fallbackTones})`,
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
