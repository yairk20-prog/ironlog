/* v5.18: after a real workout — typing, sync, and the end of a rest.

   1. typing into a field that already has a number replaces it (tap → it
      is selected), so 6 typed over a 3 is 6, never 36 or 06; a leading
      zero is dropped; an empty weight reads "–", not a grey 0
   2. the sets stay in step everywhere: a change to a set carries to the
      later sets that follow it — on screen and in their drafts — and the
      list, the swipe view, a reload and ticking a set all show the same
      numbers; a set given numbers of its own keeps them
   3. the end of a rest: a 3-2-1 countdown and a loud alarm (counted at the
      Web Audio layer), and a notification shown by the service worker at
      the end of the rest — turned on from the rest screen, cancelled when
      the rest is skipped, and not sent while it is off */
import pw from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { LAUNCH, localOnly } from './launch.mjs';

const { chromium } = pw;
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const ORIGIN = `http://localhost:${process.env.PORT || 8777}`;
const BASE = `${ORIGIN}/index.html`;
const SHOTS = `${ROOT}/tools/shots22`;
fs.mkdirSync(SHOTS, { recursive: true });
const shot = (p, n) => p.screenshot({ path: `${SHOTS}/${n}.png` });
const errors = [];
const out = {};
let BROWSER = null;
let PAGE = null;
const pause = (page, ms = 300) => page.waitForTimeout(ms);

const rows = (page) => page.locator('.set:not(.warmup)');
const listValues = (page) => rows(page).evaluateAll((rs) => rs.map((r) => [...r.querySelectorAll('input')].map((i) => i.value).join('×')));
const feedValues = (page) => page.locator('.feed-card').first().locator('.feed-set')
  .evaluateAll((rs) => rs.map((r) => [...r.querySelectorAll('input')].map((i) => i.value).join('×')));
const drafts = (page) => page.evaluate(async () => {
  const db = await import('./js/db.js');
  const w = (await db.all('workouts')).find((x) => !x.completed);
  const ex = w.slots[0].ex;
  return Object.fromEntries(Object.entries(w.drafts || {}).filter(([k]) => k.startsWith(`${ex}|`)).map(([k, v]) => [k.split('|')[1], `${v.w}×${v.r}`]));
});

/** Tap a field and type, as a thumb does — no clearing first. */
async function tapType(page, input, text) {
  await input.click();
  await pause(page, 80);
  await page.keyboard.type(text, { delay: 40 });
  await pause(page, 120);
}

const restStatus = (page) => page.evaluate(() => new Promise((resolve) => {
  const onMsg = (e) => { if (e.data?.restStatus) { navigator.serviceWorker.removeEventListener('message', onMsg); resolve(e.data.restStatus); } };
  navigator.serviceWorker.addEventListener('message', onMsg);
  navigator.serviceWorker.controller.postMessage({ type: 'rest-status' });
  setTimeout(() => resolve(null), 2000);
}));

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

async function main() {
  const browser = BROWSER = await chromium.launch(LAUNCH);
  const ctx = await browser.newContext({ viewport: { width: 414, height: 896 }, deviceScaleFactor: 2, locale: 'he-IL', hasTouch: true, isMobile: true });
  await localOnly(ctx);
  await ctx.grantPermissions(['notifications'], { origin: ORIGIN });
  /* every tone the app plays, by frequency */
  await ctx.addInitScript(() => {
    window.__tones = [];
    const orig = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (t) {
      window.__tones.push(Math.round(this.frequency.value));
      return orig.call(this, t);
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
  await pause(page, 500);

  await page.locator('.hero .btn.primary', { hasText: 'התחל אימון' }).click();
  await page.waitForFunction(() => location.hash === '#/workout');
  await page.waitForSelector('.set:not(.warmup) .set-go');
  await pause(page, 800);
  for (let i = 0; i < 3 && (await rows(page).count()) < 4; i++) {
    await page.locator('.linkish', { hasText: 'הוסף סט' }).click();
    await pause(page, 400);
  }
  out.exercise = (await page.locator('.focus-nav .name b').innerText()).trim();
  out.start = await listValues(page);
  out.placeholders = await rows(page).nth(0).locator('input').evaluateAll((is) => is.map((i) => i.placeholder));

  /* ---------- 1. typing ---------- */
  const set1 = rows(page).nth(0).locator('input');
  await tapType(page, set1.nth(0), '12');      // weight over whatever is there
  await tapType(page, set1.nth(1), '6');       // reps over the target
  out.typed = await listValues(page);
  await page.locator('.target-box').click();   // off the field, then a fresh tap
  await tapType(page, set1.nth(1), '06');      // a habit zero
  out.leadingZero = await set1.nth(1).inputValue();
  out.draftsAfterTyping = await drafts(page);
  await shot(page, '01-typed');

  /* ---------- 2. sync ---------- */
  /* set 3 gets numbers of its own; set 4 follows it */
  const set3 = rows(page).nth(2).locator('input');
  await tapType(page, set3.nth(1), '5');
  out.own3 = await listValues(page);
  /* set 1 changes: set 2 follows it, 3 and 4 keep theirs */
  await tapType(page, set1.nth(1), '8');
  out.after1 = await listValues(page);

  /* the swipe view shows the same */
  await page.locator('#topbarSlot .btn[aria-label="מצב גלילה"]').click();
  await page.waitForSelector('.feed-set');
  await pause(page, 500);
  out.feedOpen = await feedValues(page);
  /* typed in the swipe view, it carries there too */
  const f1 = page.locator('.feed-card').first().locator('.feed-set').nth(0).locator('input');
  await tapType(page, f1.nth(1), '7');
  out.feedTyped = await feedValues(page);
  await shot(page, '02-feed');
  await page.locator('.feed-close').click();
  await pause(page, 700);
  out.listAfterFeed = await listValues(page);

  /* a reload */
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.set:not(.warmup) .set-go');
  await pause(page, 700);
  out.afterReload = await listValues(page);

  /* tick set 1: the next set still shows what it showed */
  await rows(page).nth(0).locator('.set-go').click();
  await pause(page, 700);
  out.offerFirstRest = await page.locator('.rest-screen button.rest-notify').count();
  await page.locator('.rest-close').click().catch(() => {});
  await pause(page, 300);
  out.afterTick = await listValues(page);
  await page.locator('#topbarSlot .btn[aria-label="מצב גלילה"]').click();
  await page.waitForSelector('.feed-set');
  await pause(page, 500);
  out.feedAfterTick = await feedValues(page);
  await page.locator('.feed-close').click();
  await pause(page, 600);

  /* ---------- 3. the end of a rest ---------- */
  await page.evaluate(async () => { (await import('./js/timer.js')).stop(); window.__tones = []; });
  /* a short rest, with the rest screen up: countdown and alarm */
  await page.evaluate(async () => (await import('./js/timer.js')).start(4, 'מנוחה · בדיקה'));
  await pause(page, 5200);
  out.tones = await page.evaluate(() => window.__tones.slice());
  out.waitingWhileOff = (await restStatus(page))?.waiting || 0;

  /* the offer is made once per workout: not on the second rest… */
  await page.evaluate(async () => (await import('./js/timer.js')).stop());
  await rows(page).nth(1).locator('.set-go').click();
  await page.waitForSelector('.rest-screen');
  await pause(page, 400);
  out.offerSecondRest = await page.locator('.rest-screen button.rest-notify').count();
  await page.locator('.rest-close').click().catch(() => {});
  await page.evaluate(async () => (await import('./js/timer.js')).stop());
  /* …and again when the app is opened afresh: turn it on from there */
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.set:not(.warmup) .set-go');
  await pause(page, 600);
  await rows(page).nth(2).locator('.set-go').click();
  await page.waitForSelector('.rest-screen');
  await pause(page, 400);
  out.inviteShown = await page.locator('.rest-screen .rest-notify').count();
  await page.locator('.rest-screen button.rest-notify').click();
  await pause(page, 600);
  out.inviteDone = (await page.locator('.rest-screen div.rest-notify.on').innerText().catch(() => '')).trim();
  out.bgNotify = await page.evaluate(async () => (await import('./js/db.js')).setting('bgNotify', null));
  out.waitingAfterOn = (await restStatus(page))?.waiting || 0;
  await shot(page, '03-rest-screen');
  await page.locator('.rest-close').click().catch(() => {});

  /* a 3-second rest: the worker shows the notification on time */
  const t0 = Date.now();
  await page.evaluate(async () => (await import('./js/timer.js')).start(3, 'מנוחה · לחיצת כתפיים משקולות'));
  await pause(page, 4200);
  const st = await restStatus(page);
  out.notified = st?.last && st.last.at >= t0 ? st.last : null;
  out.notifiedLate = out.notified ? out.notified.at - (t0 + 3000) : null;

  /* skipping a rest cancels its notification */
  await page.evaluate(async () => {
    const timer = await import('./js/timer.js');
    timer.start(3, 'מנוחה · ביטול');
    await new Promise((r) => setTimeout(r, 300));
    timer.stop();
  });
  await pause(page, 3800);
  const st2 = await restStatus(page);
  out.cancelled = !(st2?.last && /ביטול/.test(st2.last.body));
  out.waitingAfterCancel = st2?.waiting || 0;

  /* off again: nothing is scheduled */
  await page.evaluate(async () => {
    const app = await import('./js/app.js');
    const timer = await import('./js/timer.js');
    timer.setBgNotify(false);
    timer.start(30, 'מנוחה · כבוי');
  });
  await pause(page, 400);
  out.waitingWhenOff = (await restStatus(page))?.waiting || 0;
  await page.evaluate(async () => (await import('./js/timer.js')).stop());

  out.errors = errors;
  console.log(JSON.stringify(out, null, 2));
  await browser.close();

  const n = out.start.length;
  const all = (v) => Array.from({ length: n }, () => v);
  const pips = out.tones.filter((f) => f === 988 || f === 1319).length;
  const alarm = out.tones.filter((f) => f >= 1500).length;
  const fatal = [
    n < 4 && `test setup: only ${n} sets`,
    out.placeholders.join(',') !== '–,–' && `placeholders: ${out.placeholders}`,
    out.typed.join('|') !== all('12×6').join('|') && `typing over the numbers: ${out.typed}`,
    out.leadingZero !== '6' && `"06" stayed as ${out.leadingZero}`,
    Object.keys(out.draftsAfterTyping).length !== n && `the following sets have no drafts: ${JSON.stringify(out.draftsAfterTyping)}`,
    out.own3.join('|') !== ['12×6', '12×6', '12×5', '12×5'].concat(all('12×5').slice(4)).join('|') && `set 3 of its own: ${out.own3}`,
    out.after1.join('|') !== ['12×8', '12×8', '12×5', '12×5'].concat(all('12×5').slice(4)).join('|') && `set 1 changed: ${out.after1}`,
    out.feedOpen.join('|') !== out.after1.join('|') && `swipe view differs: ${out.feedOpen} vs ${out.after1}`,
    out.feedTyped.join('|') !== ['12×7', '12×7', '12×5', '12×5'].concat(all('12×5').slice(4)).join('|') && `typed in the swipe view: ${out.feedTyped}`,
    out.listAfterFeed.join('|') !== out.feedTyped.join('|') && `list after the swipe view: ${out.listAfterFeed}`,
    out.afterReload.join('|') !== out.feedTyped.join('|') && `after reload: ${out.afterReload}`,
    out.afterTick.join('|') !== out.feedTyped.join('|') && `after ticking set 1: ${out.afterTick}`,
    out.feedAfterTick.join('|') !== out.afterTick.join('|') && `swipe view after the tick: ${out.feedAfterTick}`,
    pips < 3 && `countdown pips: ${pips} (${out.tones})`,
    alarm < 12 && `alarm tones: ${alarm}`,
    out.waitingWhileOff !== 0 && 'a notification was scheduled while it was off',
    out.offerFirstRest !== 1 && 'no "notify me" offer on the first rest',
    out.offerSecondRest !== 0 && 'the offer came back on the second rest of the workout',
    out.inviteShown !== 1 && 'no "notify me" button on the rest screen after reopening',
    !/תקבל התראה/.test(out.inviteDone) && `after turning it on: ${out.inviteDone}`,
    out.bgNotify !== true && 'the rest screen button did not save the setting',
    !(out.waitingAfterOn > Date.now() - 60000) && 'turning it on mid-rest did not schedule this rest',
    !(out.notified && out.notified.title === 'המנוחה הסתיימה' && /לחיצת כתפיים משקולות/.test(out.notified.body)) && `notification: ${JSON.stringify(out.notified)}`,
    out.notified && !(out.notifiedLate > -300 && out.notifiedLate < 1500) && `notification off time by ${out.notifiedLate} ms`,
    !out.cancelled && 'a skipped rest still notified',
    out.waitingAfterCancel !== 0 && 'a skipped rest is still waiting',
    out.waitingWhenOff !== 0 && 'switched off, a rest was still scheduled',
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
