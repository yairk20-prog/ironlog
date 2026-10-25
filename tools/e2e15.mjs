/* v5.9: functional training, reminders, progress, and moving between screens.

   · functional: a home-screen way in, three circuit sessions with photos,
     off-plan (the rotation stays put), and a functional split that puts
     functional days into the week
   · reminders: switched on from Settings — permission, a push subscription
     and the settings reach the server; water and protein changes are
     reported so a reminder knows the gap; a test push; switching off
   · progress: weight against a goal with a rate and an arrival estimate,
     the weigh-in sheet, the week in numbers, strength trends, and a home
     prompt when a week has passed without a weigh-in
   · flow: the phone's back button closes a sheet instead of leaving the
     screen; a refresh does not replay the entrance; tabs remember where
     you were; tapping the current tab goes to the top */
import pw from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { LAUNCH, localOnly } from './launch.mjs';

const { chromium } = pw;
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const ORIGIN = `http://localhost:${process.env.PORT || 8777}`;
const BASE = `${ORIGIN}/index.html`;
const SHOTS = `${ROOT}/tools/shots15`;
fs.mkdirSync(SHOTS, { recursive: true });
const shot = (p, n) => p.screenshot({ path: `${SHOTS}/${n}.png` });
const errors = [];
const out = {};
let BROWSER = null;
let PAGE = null;
const pause = (page, ms = 300) => page.waitForTimeout(ms);
const setting = (page, k) => page.evaluate(async (k) => (await import('./js/db.js')).setting(k, null), k);
const pushLog = (page) => page.evaluate(() => fetch('/api/push?last').then((r) => r.json()));

async function boot(page) {
  await page.goto(BASE, { waitUntil: 'load' });
  await page.locator('.login .btn', { hasText: 'המשך בלי חשבון' }).click();
  await page.waitForSelector('.onb');
  for (let i = 0; i < 20 && (await page.locator('.onb').count()); i++) {
    await page.locator('.onb-foot .btn.primary').click({ timeout: 5000 }).catch(() => {});
    await pause(page, 320);
  }
  await page.waitForFunction(() => !document.querySelector('.onb'), null, { timeout: 10000 });
  await page.waitForSelector('#view .hero, #view .card', { timeout: 8000 });
  await pause(page, 500);
}

async function main() {
  const browser = BROWSER = await chromium.launch(LAUNCH);
  const ctx = await browser.newContext({
    viewport: { width: 414, height: 896 }, deviceScaleFactor: 2,
    locale: 'he-IL', hasTouch: true, isMobile: true
  });
  await localOnly(ctx);
  await ctx.grantPermissions(['notifications'], { origin: ORIGIN });
  /* Headless Chromium has no push service to subscribe with; stand in for
     it with a subscription of the right shape. */
  await ctx.addInitScript(() => {
    if (!window.PushManager) return;
    let sub = null;
    const make = () => ({
      endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint',
      toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' } }; },
      unsubscribe: async () => { sub = null; return true; }
    });
    PushManager.prototype.subscribe = async function (opts) { window.__subOpts = opts; sub = make(); return sub; };
    PushManager.prototype.getSubscription = async function () { return sub; };
  });
  const page = PAGE = await ctx.newPage();
  page.setDefaultTimeout(8000);
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await boot(page);

  /* ---------- functional ---------- */
  const cursor0 = await setting(page, 'rotationCursor');
  out.funcTile = await page.locator('.func-wide').count();
  await page.locator('.func-wide').click();
  await pause(page, 400);
  out.funcOptions = await page.locator('#sheetBody .func-opt').count();
  out.funcPhotos = await page.locator('#sheetBody .func-opt img').count();
  await shot(page, '01-functional');
  await page.locator('#sheetBody .func-opt').first().click();
  await page.waitForFunction(() => location.hash === '#/workout', null, { timeout: 6000 }).catch(() => {});
  await pause(page, 900);
  out.funcRoute = await page.evaluate(() => location.hash);
  out.funcExercises = await page.locator('.focus-nav .name b').allInnerTexts().catch(() => []);
  out.funcFirst = (await page.locator('#view').innerText()).includes('קטלבל סווינג');
  await shot(page, '02-functional-running');
  /* abandon it: the point was that it starts and stays off-plan */
  await page.locator('.linkish', { hasText: 'עוד אפשרויות' }).click();
  await pause(page, 350);
  await page.locator('.sheet .btn.danger', { hasText: 'בטל את האימון' }).click();
  await pause(page, 400);
  await page.locator('#sheetBody .btn', { hasText: 'בטל אימון' }).click();
  await pause(page, 900);
  out.funcCursorSame = (await setting(page, 'rotationCursor')) === cursor0;

  /* a functional split puts functional days into the plan */
  await page.evaluate(async () => {
    const db = await import('./js/db.js');
    await db.setSetting('rotation', 'func4');
    await db.setSetting('rotationCursor', 0);
  });
  await page.goto(`${BASE}#/home`, { waitUntil: 'load' });
  await page.reload({ waitUntil: 'load' });
  await pause(page, 900);
  out.func4Hero = (await page.locator('.hero h2, .hero').first().innerText()).replace(/\s+/g, ' ');

  /* ---------- flow: the back button closes a sheet ---------- */
  await page.locator('.func-wide').click();
  await pause(page, 300);
  out.sheetOpenBefore = await page.locator('#sheet').isVisible();
  await page.goBack();
  await pause(page, 400);
  out.sheetClosedByBack = !(await page.locator('#sheet').isVisible());
  out.routeAfterBack = await page.evaluate(() => location.hash);

  /* closing with the X and then navigating from code still lands */
  await page.locator('.func-wide').click();
  await pause(page, 300);
  await page.locator('.sheet-close').click();
  await page.evaluate(async () => (await import('./js/app.js')).go('nutrition'));
  await pause(page, 900);
  out.routeAfterCloseAndGo = await page.evaluate(() => location.hash);

  /* a refresh of the same screen does not replay the entrance */
  await page.locator('.btn.water-add').click();
  await pause(page, 500);
  out.calmAfterReload = await page.evaluate(() => {
    const v = document.querySelector('#view');
    const first = v.querySelector('.stack > *');
    return v.classList.contains('calm') && getComputedStyle(first).animationName === 'none';
  });

  /* tabs remember the scroll; the current tab goes back to the top */
  await page.evaluate(() => window.scrollTo({ top: 700, behavior: 'instant' }));
  await pause(page, 200);
  const scrolled = await page.evaluate(() => window.scrollY);
  await page.locator('.tab[data-route="home"]').click();
  await pause(page, 900);
  await page.locator('.tab[data-route="nutrition"]').click();
  await pause(page, 1000);
  out.scrollBack = await page.evaluate(() => window.scrollY);
  out.scrollRestored = Math.abs(out.scrollBack - scrolled) < 40;
  out.scrollWas = scrolled;
  await page.locator('.tab[data-route="nutrition"]').click();
  await pause(page, 900);
  out.scrollTopOnTab = (await page.evaluate(() => window.scrollY)) < 5;
  out.viewTransitions = await page.evaluate(() => typeof document.startViewTransition === 'function');

  /* ---------- reminders ---------- */
  out.inviteShown = await page.locator('.remind-invite').count();
  await page.goto(`${BASE}#/settings`, { waitUntil: 'load' });
  await pause(page, 900);
  await page.locator('.sect-head', { hasText: 'תזכורות' }).click();
  await pause(page, 300);
  await page.locator('.reminders .btn.primary', { hasText: 'הפעל תזכורות' }).click();
  await page.waitForSelector('.reminders .chip', { timeout: 6000 });
  await pause(page, 300);
  await shot(page, '03-reminders-on');
  let log = await pushLog(page);
  const subMsg = log.find((m) => m.action === 'subscribe');
  out.subscribed = !!subMsg && subMsg.subscription?.endpoint?.startsWith('https://') && !!subMsg.subscription?.keys?.p256dh;
  out.subscribeId = subMsg?.id || '';
  out.subscribeTz = subMsg?.tz || '';
  out.appKeyBytes = await page.evaluate(() => window.__subOpts?.applicationServerKey?.length || 0);
  out.userVisibleOnly = await page.evaluate(() => window.__subOpts?.userVisibleOnly === true);
  out.savedOn = (await setting(page, 'reminders'))?.on === true;

  /* changing a setting reports it */
  await page.locator('.reminders .chip', { hasText: 'מים' }).click();
  await pause(page, 600);
  log = await pushLog(page);
  out.prefsReported = log.some((m) => m.action === 'progress' && m.prefs && m.prefs.water === false);
  await page.locator('.reminders .chip', { hasText: 'מים' }).click();
  await pause(page, 400);

  /* a test push */
  await page.locator('.reminders .btn', { hasText: 'שלח בדיקה' }).click();
  await pause(page, 500);
  log = await pushLog(page);
  out.testSent = log.some((m) => m.action === 'test' && m.id === out.subscribeId);

  /* water and protein changes reach the server (debounced) */
  await page.goto(`${BASE}#/nutrition`, { waitUntil: 'load' });
  await pause(page, 900);
  out.inviteHiddenWhenOn = (await page.locator('.remind-invite').count()) === 0;
  await page.locator('.btn.water-add').click();
  await pause(page, 600);
  await page.locator('.btn.water-add').click();
  await pause(page, 1800);
  log = await pushLog(page);
  const prog = log.filter((m) => m.action === 'progress' && m.progress).pop();
  out.progressReported = prog?.progress;

  /* off */
  await page.goto(`${BASE}#/settings`, { waitUntil: 'load' });
  await pause(page, 900);
  await page.locator('.sect-head', { hasText: 'תזכורות' }).click();
  await pause(page, 300);
  await page.locator('.reminders .btn', { hasText: 'כבה' }).click();
  await pause(page, 600);
  log = await pushLog(page);
  out.offSent = log.some((m) => m.action === 'off' && m.id === out.subscribeId);
  out.savedOff = (await setting(page, 'reminders'))?.on === false;

  /* ---------- progress ---------- */
  await page.goto(`${BASE}#/home`, { waitUntil: 'load' });
  await pause(page, 900);
  out.weighPrompt = await page.locator('.weigh-prompt').count();

  await page.evaluate(async () => {
    const db = await import('./js/db.js');
    const day = 86400000;
    const iso = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    /* 90 kg falling half a kilo a week for four weeks, last weigh-in 9 days ago */
    for (let i = 0; i <= 8; i++) {
      const t = Date.now() - (37 - i * 3.5) * day;
      await db.put('body_logs', { id: `bw${i}`, date: iso(t), weight: 90 - i * 0.25, sites: {}, timestamp: t });
    }
    await db.setSetting('goalWeight', 84);
    /* a lift done three times, getting stronger */
    for (let k = 0; k < 3; k++) {
      const t = Date.now() - (30 - k * 14) * day;
      await db.put('set_logs', { id: `sl${k}`, workout_id: `wk${k}`, exercise_id: 'bb_squat', set_order: 1, weight_kg: 100 + k * 5, reps: 5, is_warmup: false, timestamp: t });
    }
    await db.put('workouts', { id: 'wk2', date: iso(Date.now() - 2 * day), name: 'רגליים', type: 'Legs', completed: true, finished_at: Date.now() - 2 * day, duration_seconds: 3000 });
  });
  await page.reload({ waitUntil: 'load' });
  await pause(page, 900);
  out.weighPromptStale = (await page.locator('.weigh-prompt').innerText().catch(() => '')).replace(/\s+/g, ' ');

  await page.locator('.tab[data-route="history"]').click();
  await pause(page, 1000);
  out.progressTitle = (await page.locator('#topbarTitle, .topbar-titles h1').first().innerText().catch(() => '')).trim();
  out.tabLabel = (await page.locator('.tab[data-route="history"]').innerText()).trim();
  out.weightCard = (await page.locator('.weight-card').innerText()).replace(/\s+/g, ' ');
  out.goalPct = Number(await page.locator('.goal-bar').getAttribute('aria-valuenow'));
  out.weekNums = (await page.locator('.week-nums').innerText()).replace(/\s+/g, ' ');
  out.liftRows = await page.locator('.lift-row').count();
  out.liftText = (await page.locator('.lift-row').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
  await shot(page, '04-progress');

  await page.locator('.weight-card .btn.primary', { hasText: 'שקילה' }).click();
  await pause(page, 400);
  out.weighStart = Number(await page.locator('#sheetBody .weigh-in').inputValue());
  await page.locator('#sheetBody .qty-btn[aria-label="פחות 0.1"]').click();
  await page.locator('#sheetBody .qty-btn[aria-label="פחות 0.1"]').click();
  await shot(page, '05-weigh');
  await page.locator('#sheetBody .btn.primary', { hasText: 'שמור' }).click();
  await pause(page, 900);
  out.bodyweightAfter = await setting(page, 'bodyweight');
  out.weightCardAfter = (await page.locator('.weight-card .badge').innerText()).trim();

  await page.locator('.tab[data-route="home"]').click();
  await pause(page, 900);
  out.weighPromptAfter = await page.locator('.weigh-prompt').count();

  await page.setViewportSize({ width: 360, height: 780 });
  await page.locator('.tab[data-route="history"]').click();
  await pause(page, 900);
  out.overflow360 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  await shot(page, '06-progress-360');

  out.errors = errors;
  console.log(JSON.stringify(out, null, 2));
  await browser.close();

  const fatal = [
    out.funcTile !== 1 && 'no functional way in on the home screen',
    out.funcOptions !== 3 && `functional sessions: ${out.funcOptions}`,
    out.funcPhotos < 2 && 'functional sessions have no photos',
    out.funcRoute !== '#/workout' && `a functional session did not start (${out.funcRoute})`,
    !out.funcFirst && 'the functional session does not open on kettlebell swings',
    !out.funcCursorSame && 'a functional session moved the rotation',
    !/פונקציונלי A/.test(out.func4Hero) && `the functional split does not plan a functional day: ${out.func4Hero}`,
    !out.sheetOpenBefore && 'the sheet did not open',
    !out.sheetClosedByBack && 'the back button did not close the sheet',
    out.routeAfterBack !== '#/home' && `the back button left the screen (${out.routeAfterBack})`,
    out.routeAfterCloseAndGo !== '#/nutrition' && `closing a sheet then navigating ended on ${out.routeAfterCloseAndGo}`,
    !out.calmAfterReload && 'a refresh replays the entrance animation',
    !(out.scrollWas > 300 && out.scrollRestored) && `the tab did not remember its scroll (${out.scrollWas})`,
    !out.scrollTopOnTab && 'tapping the current tab did not go to the top',
    !out.inviteShown && 'no reminders invitation on the nutrition screen',
    !out.subscribed && 'enabling reminders did not send a subscription',
    !/^p_[A-Za-z0-9_-]{24,}$/.test(out.subscribeId) && `weak or missing reminder id: ${out.subscribeId}`,
    !out.subscribeTz && 'no time zone sent',
    out.appKeyBytes !== 65 && `subscribed with a ${out.appKeyBytes}-byte server key`,
    !out.userVisibleOnly && 'subscribed without userVisibleOnly',
    !out.savedOn && 'reminders are not remembered as on',
    !out.prefsReported && 'changing a reminder setting was not reported',
    !out.testSent && 'the test push was not requested',
    !out.inviteHiddenWhenOn && 'the invitation still shows with reminders on',
    !(out.progressReported && out.progressReported.water_ml === 750 && out.progressReported.protein_target > 0)
      && `water was not reported: ${JSON.stringify(out.progressReported)}`,
    !(out.offSent && out.savedOff) && 'switching reminders off did not reach the server',
    !out.weighPrompt && 'no weigh-in prompt without any weigh-in',
    !/עברו 9 ימים/.test(out.weighPromptStale) && `stale weigh-in prompt: ${out.weighPromptStale}`,
    out.tabLabel !== 'התקדמות' && `tab label: ${out.tabLabel}`,
    !/88\.\d/.test(out.weightCard) && `weight now: ${out.weightCard}`,
    !/בעוד כ-\d+ שבועות/.test(out.weightCard) && `no arrival estimate: ${out.weightCard}`,
    !(out.goalPct > 15 && out.goalPct < 40) && `goal progress ${out.goalPct}%`,
    !/אימונים/.test(out.weekNums) && 'no week numbers',
    out.liftRows < 1 && 'no strength trend',
    !(Number((/\+(\d+(?:\.\d+)?)\u2069? ק״ג/.exec(out.liftText) || [])[1]) > 10) && `strength delta: ${out.liftText}`,
    Math.abs(out.weighStart - 88) > 0.05 && `the weigh-in did not start from the last weight: ${out.weighStart}`,
    Math.abs(out.bodyweightAfter - 87.8) > 0.05 && `bodyweight not updated from the weigh-in: ${out.bodyweightAfter}`,
    out.weightCardAfter !== 'נשקלת היום' && `after weighing: ${out.weightCardAfter}`,
    out.weighPromptAfter !== 0 && 'the weigh-in prompt stays after weighing',
    out.overflow360 && 'progress overflows at 360px',
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
