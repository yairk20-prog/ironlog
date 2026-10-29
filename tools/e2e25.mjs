/* v5.21–5.23: the end of a rest — heard over music, on time with the screen
   locked, and the music itself left exactly as it is.

   · rest-end notifications are on by default (with the phone's permission)
   · nothing is ever played as media (no <audio>): every sound is Web Audio
     mixed on top of the music, never pausing or lowering it
   · the audio engine is off while nothing is sounding: a running engine,
     even a silent one, makes some phones turn the music down for as long
     as it runs (it ran from the first tap, so the music dropped whenever
     the app was open). It goes on a few seconds before the end of a rest
     or for a chime, and off right after
   · the 3-2-1 and the alarm are scheduled on the audio clock — a pip at 3,
     2 and 1 seconds before the end and the alarm at the end, exactly, also
     with the screen locked and also when the page woke up late (what has
     passed is skipped); +30 cancels them and the engine goes off
   · with the screen locked the page shows its own notification as a
     second line behind the worker's */
import pw from 'playwright';
import { LAUNCH, localOnly } from './launch.mjs';

const { chromium } = pw;
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
const engineOn = (page) => page.evaluate(async () => (await import('./js/ui.js')).audioRunning());
/* sine + square per beep: one entry per pitch is enough */
const beeps = (list) => list.filter((x, i) => i % 2 === 0);

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
    window.__due = [];
    const start = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (t) {
      window.__due.push({ f: Math.round(this.frequency.value), at: Date.now() + ((t || this.context.currentTime) - this.context.currentTime) * 1000 });
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

  /* ---------- the app open, tapped around: the engine stays off ---------- */
  for (const route of ['nutrition', 'plan', 'home']) {
    await page.evaluate(async (r) => (await import('./js/app.js')).go(r), route);
    await pause(page, 400);
    await page.mouse.click(200, 300);
  }
  await pause(page, 400);
  out.idleEngine = await engineOn(page);

  /* ---------- on by default ---------- */
  out.noticesOn = await page.evaluate(async () => (await import('./js/timer.js')).noticesOn());
  await page.evaluate(async () => (await import('./js/timer.js')).start(30, 'מנוחה · לחיצת חזה'));
  await pause(page, 300);
  out.scheduled = (await restStatus(page))?.waiting || 0;
  out.engineMidRest = await engineOn(page);   // 30 s left: nothing to sound yet
  await page.evaluate(async () => (await import('./js/timer.js')).stop());

  /* ---------- a chime: on for it, off after ---------- */
  await page.evaluate(async () => (await import('./js/ui.js')).chime());
  await pause(page, 300);
  const chimeOn = await engineOn(page);
  await pause(page, 3300);
  out.chimeEngine = [chimeOn, await engineOn(page)];

  /* ---------- woken late, 1.5 s before the end: pip "1" and the alarm, on time ---------- */
  out.late = beeps(await page.evaluate(async () => {
    window.__due = [];
    const ui = await import('./js/ui.js');
    const endAt = Date.now() + 1500;
    ui.scheduleRestEnd(endAt);
    const due = window.__due.map((d) => ({ f: d.f, dt: Math.round(d.at - endAt) }));
    ui.cancelRestEnd();
    return due;
  }));

  /* ---------- a rest that ends with the screen locked ---------- */
  await pause(page, 600);
  await page.evaluate(() => { window.__due = []; window.__shown = []; });
  const endAt = await page.evaluate(async () => {
    (await import('./js/timer.js')).start(6, 'מנוחה · לחיצת כתפיים');
    return Date.now() + 6000;
  });
  await setHidden(page, true);
  await pause(page, 1000);
  out.lockedEarly = await engineOn(page);          // 5 s left: still off
  await pause(page, 2000);
  out.lockedCountdown = await engineOn(page);      // 3 s left: on, the countdown is set
  await pause(page, 3300);
  out.lockedDue = beeps(await page.evaluate((endAt) => window.__due
    .filter((d) => d.f >= 1000).map((d) => ({ f: d.f, dt: Math.round(d.at - endAt) })), endAt));
  out.pageNotice = await page.evaluate(() => window.__shown.slice());
  await pause(page, 2600);
  out.lockedAfter = await engineOn(page);          // the alarm is over: off
  await setHidden(page, false);
  await page.evaluate(async () => (await import('./js/timer.js')).stop());

  /* ---------- +30 during the countdown: cancelled, engine off ---------- */
  await page.evaluate(() => { window.__cancelled = 0; });
  await page.evaluate(async () => (await import('./js/timer.js')).start(4, 'מנוחה · ביטול'));
  await pause(page, 600);
  await page.evaluate(async () => (await import('./js/timer.js')).add(30));
  await pause(page, 800);
  out.cancelledOnAdd = await page.evaluate(() => window.__cancelled);
  out.engineAfterAdd = await engineOn(page);
  await page.evaluate(async () => (await import('./js/timer.js')).stop());
  out.media = await page.evaluate(() => window.__media.slice());

  out.errors = errors;
  console.log(JSON.stringify(out, null, 2));
  await BROWSER.close();

  const fatal = [
    out.idleEngine !== false && 'the audio engine runs while the app is just open (it turns the music down on some phones)',
    out.noticesOn !== true && 'rest-end notifications are not on by default',
    !(out.scheduled > 0) && 'a rest was not handed to the worker',
    out.engineMidRest !== false && 'the audio engine runs during a rest, long before anything sounds',
    out.chimeEngine.join(',') !== 'true,false' && `a chime: engine on for it, off after — got ${out.chimeEngine}`,
    !(out.late.length === 13 && Math.abs(out.late[0].dt + 1000) < 150 && Math.abs(out.late[1].dt) < 150) && `late wake: ${JSON.stringify(out.late)}`,
    out.lockedEarly !== false && 'locked, 5 s left: the engine was already on',
    out.lockedCountdown !== true && 'locked, 3 s left: the engine was not on for the countdown',
    !(out.lockedDue.length === 15
      && [-3000, -2000, -1000].every((t, i) => Math.abs(out.lockedDue[i].dt - t) < 150)
      && Math.abs(out.lockedDue[3].dt) < 150) && `locked countdown: ${JSON.stringify(out.lockedDue)}`,
    !out.pageNotice.includes('המנוחה הסתיימה') && `no notification from the page: ${JSON.stringify(out.pageNotice)}`,
    out.lockedAfter !== false && 'the engine stayed on after the alarm',
    !(out.cancelledOnAdd >= 20) && `+30 did not cancel the scheduled countdown (${out.cancelledOnAdd})`,
    out.engineAfterAdd !== false && 'the engine stayed on after +30 cancelled the countdown',
    out.media.length !== 0 && `something was played as media (it would touch the music): ${JSON.stringify(out.media)}`,
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
