/* v5.6: cardio, training away from the gym, and protein from the body.

   What is proven here, in the order a user meets it:
   · onboarding has a body-type step, and the picture moves the goals and
     the protein target (lean mass, not total weight)
   · a park day is today's planned day rebuilt from bodyweight work — and it
     COUNTS: the rotation advances exactly as a gym day would
   · a cardio session runs on a phase timeline, pauses, skips, measures GPS
     distance, survives leaving the screen, and logs without touching the
     rotation
   · a rest day offers cardio when the goals or the body call for it */
import pw from 'playwright';
import path from 'node:path';
import { LAUNCH, localOnly } from './launch.mjs';

const { chromium } = pw;
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const BASE = `http://localhost:${process.env.PORT || 8777}/index.html`;
const shot = (p, n) => p.screenshot({ path: `${ROOT}/tools/shots12/${n}.png` });
const errors = [];
const out = {};

const idb = (page, key) => page.evaluate(async (k) => (await import('./js/db.js')).setting(k, null), key);
const setIdb = (page, key, value) => page.evaluate(async ([k, v]) => (await import('./js/db.js')).setSetting(k, v), [key, value]);
const next = (page) => page.locator('.onb-foot .btn.primary').click();

async function onboard(page) {
  await page.goto(BASE, { waitUntil: 'load' });
  await page.locator('.login .btn', { hasText: 'המשך בלי חשבון' }).click();
  await page.waitForSelector('.onb');
  await next(page); await page.waitForTimeout(320);          // welcome → body
  await page.locator('.onb input[type=number]').nth(2).fill('92'); // weight
  await page.waitForTimeout(150);
  out.liveProtein = (await page.locator('.onb .num-field .num').textContent()).trim();
  await next(page); await page.waitForTimeout(320);          // body → body type

  out.bodyTypeTiles = await page.locator('.bt').count();
  await page.locator('.bt').nth(3).click();                    // "מעט עודף"
  await page.waitForTimeout(300);
  out.bodyTypeInfo = (await page.locator('.onb .card').first().innerText()).replace(/\s+/g, ' ');
  await shot(page, '01-onboarding-bodytype');

  await next(page); await page.waitForTimeout(320);          // → experience
  await next(page); await page.waitForTimeout(320);          // → goals
  out.goalTags = await page.locator('.pick-tag').count();
  out.goalsPicked = await page.locator('.pick.on b').allInnerTexts();
  await shot(page, '02-onboarding-goals');

  for (let i = 0; i < 10 && (await page.locator('.onb').count()); i++) {
    await next(page).catch(() => {});
    await page.waitForTimeout(320);
  }
  await page.waitForSelector('#view .hero', { timeout: 8000 });
  await page.waitForTimeout(400);
  out.savedBodyType = await idb(page, 'bodyType');
  out.savedGoals = await idb(page, 'goals');
}

/** Log every open set of the running workout, then finish it. */
async function finishActive(page) {
  for (let guard = 0; guard < 40; guard++) {
    const open = page.locator('.set:not(.done)');
    if (!(await open.count())) break;
    const row = open.first();
    await row.locator('input').nth(0).fill('0');
    await row.locator('input').nth(1).fill('12');
    await row.locator('.set-go').click();
    const close = page.locator('.rest-close');
    await close.waitFor({ timeout: 900 }).then(() => close.click()).catch(() => {});
    await page.waitForTimeout(240);
    if (!(await page.locator('.set:not(.done)').count())) await page.waitForTimeout(900);
  }
  await page.locator('#topbarSlot .btn', { hasText: 'סיים' }).click();
  await page.waitForTimeout(400);
  await page.locator('#sheetBody .btn', { hasText: 'סיים ושמור' }).click();
  await page.waitForTimeout(1100);
}

async function main() {
  const browser = await chromium.launch(LAUNCH);
  BROWSER = browser;
  /* VW=360 reruns the whole flow on a small phone. */
  const ctx = await browser.newContext({
    viewport: { width: Number(process.env.VW) || 414, height: 896 }, deviceScaleFactor: 2,
    locale: 'he-IL', hasTouch: true, isMobile: true,
    permissions: ['geolocation'], geolocation: { latitude: 32.0853, longitude: 34.7818, accuracy: 8 }
  });
  await localOnly(ctx);
  const page = await ctx.newPage();
  /* A missing element should fail this suite with its name, not stall it
     for 30 s per action until the runner gives up. */
  page.setDefaultTimeout(8000);
  PAGE = page;
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  /* ---------- pure maths ---------- */
  await page.goto(BASE, { waitUntil: 'load' });
  Object.assign(out, await page.evaluate(async () => {
    const l = await import('./js/logic.js');
    const base = { bodyweight: 90, height: 178, age: 30, sex: 'male', goals: ['hypertrophy'] };
    return {
      proteinLean: l.proteinTarget({ ...base, bodyType: 1 }, true),
      proteinHeavy: l.proteinTarget({ ...base, bodyType: 4 }, true),
      proteinOlder: l.proteinTarget({ ...base, age: 58 }, true),
      proteinYounger: l.proteinTarget({ ...base, age: 30 }, true),
      proteinRest: l.proteinTarget(base, false),
      proteinTaller: l.proteinTarget({ ...base, height: 192 }, true),
      proteinShorter: l.proteinTarget({ ...base, height: 165 }, true)
    };
  }));

  /* ---------- onboarding with a body type ---------- */
  await onboard(page);

  /* ---------- a park day counts as the planned day ---------- */
  out.venueButtons = await page.locator('.venue-seg button').count();
  const cursorBefore = await idb(page, 'rotationCursor') ?? 0;
  await page.locator('.venue-seg button', { hasText: 'פארק' }).click();
  await page.waitForTimeout(700);
  out.parkHero = await page.locator('.hero h2').textContent();
  out.parkNote = await page.locator('.venue-note').count();
  out.parkPreview = await page.locator('.today-row b').allInnerTexts();
  await shot(page, '03-home-park');

  await page.locator('.hero .btn.primary', { hasText: 'התחל אימון' }).click();
  await page.waitForTimeout(900);
  out.parkWorkoutTitle = await page.locator('#topbarTitle').textContent();
  await finishActive(page);
  out.cursorAfterPark = await idb(page, 'rotationCursor');
  out.parkCountsAsPlan = out.cursorAfterPark === cursorBefore + 1;
  out.parkRecord = await page.evaluate(async () => {
    const db = await import('./js/db.js');
    const w = (await db.all('workouts')).find((x) => x.venue === 'park');
    return w ? { offPlan: w.offPlan, venue: w.venue, type: w.type } : null;
  });

  /* ---------- the venue pick is for today only ---------- */
  /* Settings live in memory once loaded, and a new day starts with a fresh
     load — so the stale pick is written and the app reloaded. */
  await setIdb(page, 'venueToday', { date: '2000-01-01', venue: 'home' });
  await page.goto(`${BASE}#/home`, { waitUntil: 'load' });
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#view .hero');
  await page.waitForTimeout(500);
  out.staleVenueIgnored = await page.locator('.venue-seg button.on', { hasText: 'חדר כושר' }).count();

  /* ---------- cardio: choose ---------- */
  const cursorBeforeCardio = await idb(page, 'rotationCursor');
  await page.locator('.quick-tile', { hasText: 'אירובי' }).click();
  await page.waitForTimeout(700);
  out.cardioCards = await page.locator('.cardio-card').count();
  out.cardioFeatured = await page.locator('.cardio-card.featured b').textContent();
  await shot(page, '04-cardio-pick');

  /* HIIT: indoors, no GPS — pause, skip, leave and come back */
  await page.locator('.cardio-card', { hasText: 'HIIT' }).click();
  await page.waitForTimeout(500);
  out.hiitOutline = await page.locator('.phase-outline div').count();
  await shot(page, '05-cardio-sheet');
  await page.locator('#sheetBody .btn.primary', { hasText: 'התחל' }).click();
  await page.waitForTimeout(1200);
  out.runZone = await page.locator('.zone-pill').textContent();
  out.runClock = await page.locator('.cardio-clock').textContent();
  out.runPhoto = await page.locator('.cardio-media img').count();
  await shot(page, '06-cardio-run');

  const labelBefore = await page.locator('.cardio-label').textContent();
  await page.locator('.cardio-controls .btn', { hasText: 'דלג' }).click();
  await page.waitForTimeout(500);
  out.skipMoved = (await page.locator('.cardio-label').textContent()) !== labelBefore;
  out.skipZone = await page.locator('.zone-pill').textContent();

  await page.locator('.cardio-pause').click();
  await page.waitForTimeout(300);
  out.pausedLabel = (await page.locator('.cardio-pause').textContent()).trim();
  const frozen = await page.locator('.cardio-clock').textContent();
  await page.waitForTimeout(1400);
  out.pauseHolds = (await page.locator('.cardio-clock').textContent()) === frozen;
  await page.locator('.cardio-pause').click();
  await page.waitForTimeout(300);

  await page.goto(`${BASE}#/home`, { waitUntil: 'load' });
  await page.waitForTimeout(700);
  out.resumeHero = await page.locator('.hero-kicker').textContent();
  await page.locator('.hero .btn', { hasText: 'חזרה לאימון' }).click();
  await page.waitForTimeout(800);
  out.backInRun = await page.locator('.cardio-clock').count();

  await page.locator('#topbarSlot .btn', { hasText: 'סיים' }).click();
  await page.waitForTimeout(400);
  await page.locator('#sheetBody .btn', { hasText: 'סיים' }).click();
  await page.waitForTimeout(800);
  out.hiitAsksDistance = await page.locator('input[type=number]').count();
  await page.locator('.effort-row .chip', { hasText: 'קשה' }).click();
  await shot(page, '07-cardio-log');
  await page.locator('.btn.primary', { hasText: 'שמור' }).click();
  await page.waitForTimeout(1300);
  out.summaryTitle = await page.locator('.summary-hero h2').textContent();
  await shot(page, '08-cardio-summary');
  out.cursorAfterCardio = await idb(page, 'rotationCursor');
  out.cardioLeftRotation = out.cursorAfterCardio === cursorBeforeCardio;

  /* An outdoor run with GPS: move the fake position north ~5 m a second —
     a real running pace. (Faster than 7 m/s is rejected as a GPS jump.) */
  await page.goto(`${BASE}#/cardio`, { waitUntil: 'load' });
  await page.waitForTimeout(600);
  await page.locator('.cardio-card', { hasText: 'ריצה קלה' }).click();
  await page.waitForTimeout(400);
  /* outdoors: through the GPS check (v5.19), which waits for a real fix */
  await page.locator('#sheetBody .btn.primary', { hasText: 'בדיקת GPS' }).click();
  await page.waitForSelector('.gps-check .btn.primary:not([disabled])', { timeout: 8000 });
  await page.locator('.gps-check .btn.primary').click();
  await page.waitForTimeout(900);
  for (let i = 1; i <= 12; i++) {
    await ctx.setGeolocation({ latitude: 32.0853 + i * 0.000045, longitude: 34.7818, accuracy: 8 });
    await page.waitForTimeout(1000);
  }
  out.gpsKm = Number(await page.locator('.cardio-stats div').nth(0).locator('b').textContent());
  await shot(page, '09-cardio-gps');

  /* Leave mid-run, then come back after the session would have ended (the
     stored start moved back an hour): the log must open by itself, with
     the GPS distance — saved on the way out — prefilled. */
  await page.goto(`${BASE}#/home`, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  await page.evaluate(async () => {
    const c = await import('./js/cardio.js');
    const run = await c.getActiveCardio();
    run.startedAt -= 3600 * 1000;
    await c.saveActiveCardio(run);
  });
  await page.goto(`${BASE}#/cardio`, { waitUntil: 'load' });
  await page.waitForTimeout(900);
  out.autoLog = await page.locator('.effort-row').count();
  out.prefilledKm = await page.locator('input[type=number]').inputValue().catch(() => '');
  await page.locator('.btn.primary', { hasText: 'שמור' }).click();
  await page.waitForTimeout(1300);

  await page.goto(`${BASE}#/history`, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  out.historyCardioRows = await page.locator('.list-link small', { hasText: 'קק״ל' }).count();
  out.historyCardioCard = await page.locator('h3', { hasText: 'אירובי · 7 ימים' }).count();
  await shot(page, '10-history');

  /* ---------- a rest day becomes a cardio day for this body type ---------- */
  /* The week's rest day, wherever it sits: this body type's goals now put
     a cardio day into the week too, which shifts the positions. */
  const restAt = await page.evaluate(async () => {
    const { planDays } = await import('./js/programs.js');
    const db = await import('./js/db.js');
    return planDays({ rotation: await db.setting('rotation'), cardioDays: await db.setting('cardioDays') }).indexOf('rest');
  });
  await setIdb(page, 'rotationCursor', restAt);
  await page.goto(`${BASE}#/home`, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  out.restHero = await page.locator('.hero h2').textContent();
  out.restCardioButton = await page.locator('.hero .btn', { hasText: 'לאימון האירובי' }).count();
  await shot(page, '11-rest-day');

  /* ---------- settings: the picture changes the protein line ---------- */
  await page.goto(`${BASE}#/settings`, { waitUntil: 'load' });
  await page.waitForTimeout(600);
  await page.locator('.sect-head', { hasText: 'גוף וציוד' }).click();
  await page.waitForTimeout(300);
  out.settingsFigures = await page.locator('.bt').count();
  const lineBefore = await page.locator('.sect-body .tiny.dim', { hasText: 'מסת גוף רזה' }).textContent();
  await page.locator('.bt').nth(1).click();
  await page.waitForTimeout(400);
  const lineAfter = await page.locator('.sect-body .tiny.dim', { hasText: 'מסת גוף רזה' }).textContent();
  out.settingsProteinMoves = lineBefore !== lineAfter;
  await page.locator('.bt-grid').scrollIntoViewIfNeeded();
  await shot(page, '12-settings-body');

  out.errors = errors;
  console.log(JSON.stringify(out, null, 2));
  await browser.close();

  const fatal = [
    !(out.proteinLean > out.proteinHeavy) && `a lean body at the same weight should need more protein (${out.proteinLean} vs ${out.proteinHeavy})`,
    !(out.proteinOlder > out.proteinYounger) && 'protein should rise past 50',
    !(out.proteinRest < out.proteinYounger) && 'a rest day should need slightly less',
    !(out.proteinTaller > out.proteinShorter) && 'height should move the estimate',
    !/גרם/.test(out.liveProtein) && 'onboarding protein did not render',
    out.bodyTypeTiles !== 5 && `expected five body types, found ${out.bodyTypeTiles}`,
    !/מסת גוף רזה/.test(out.bodyTypeInfo) && 'picking a body type shows no lean-mass estimate',
    out.goalTags < 1 && 'no goal is marked as recommended',
    out.savedBodyType !== 3 && `body type was not saved (${out.savedBodyType})`,
    !(out.savedGoals || []).includes('cut') && 'the body type did not suggest a cut',
    out.venueButtons !== 3 && 'the hero has no gym/park/home choice',
    !/בפארק/.test(out.parkHero) && 'choosing the park did not change today\'s workout',
    !out.parkNote && 'the park day does not say it still counts',
    !out.parkPreview.includes('מקבילים (דיפס)') && `the park push day is not bodyweight (${out.parkPreview.join(', ')})`,
    !/בפארק/.test(out.parkWorkoutTitle) && 'the started workout is not the park version',
    !out.parkCountsAsPlan && `a park day must advance the rotation (${cursorBefore} → ${out.cursorAfterPark})`,
    out.parkRecord?.offPlan !== false && 'the park workout was saved as off-plan',
    !out.staleVenueIgnored && 'yesterday\'s venue leaked into today',
    out.cardioCards !== 7 && `expected seven cardio programs, found ${out.cardioCards}`,
    !/ריצה-הליכה/.test(out.cardioFeatured || '') && `"a bit over" should be offered run-walk first (${out.cardioFeatured})`,
    out.hiitOutline < 3 && 'the program sheet shows no outline',
    out.runZone !== 'חימום' && `a run should start warming up (${out.runZone})`,
    !/^\d\d:\d\d$/.test(out.runClock || '') && 'no phase clock',
    !out.runPhoto && 'the run shows no photo',
    !out.skipMoved && 'skip did not move to the next phase',
    out.pausedLabel !== 'המשך' && 'pause did not pause',
    !out.pauseHolds && 'the clock kept running while paused',
    !/אירובי/.test(out.resumeHero || '') && 'leaving a run does not offer it back on the home screen',
    !out.backInRun && 'resuming did not return to the run',
    out.hiitAsksDistance !== 0 && 'HIIT should not ask for a distance',
    out.summaryTitle !== 'אירובי הושלם' && `cardio summary missing (${out.summaryTitle})`,
    !out.cardioLeftRotation && 'cardio moved the lifting rotation',
    !(out.gpsKm >= 0.03) && `GPS distance did not accumulate (${out.gpsKm})`,
    !out.autoLog && 'a finished timeline did not open the log',
    !(Number(out.prefilledKm) > 0) && 'GPS distance was not prefilled',
    out.historyCardioRows < 2 && 'cardio sessions are missing from history',
    !out.historyCardioCard && 'history has no cardio summary',
    !/אירובי/.test(out.restHero || '') && `the rest day did not become a cardio day (${out.restHero})`,
    !out.restCardioButton && 'no cardio button on the rest day',
    out.settingsFigures !== 5 && 'settings has no body-type figures',
    !out.settingsProteinMoves && 'changing body type in settings did not move protein',
    errors.length && `page errors: ${errors.join(' | ')}`
  ].filter(Boolean);
  if (fatal.length) { console.error('FAIL:', fatal.join(' | ')); process.exitCode = 1; return; }
  console.log('PASS');
}

/* process.exit() truncates a pipe mid-write, which silently ate the one
   line explaining the failure whenever a suite ran under the runner. */
let BROWSER = null;
let PAGE = null;
main().catch(async (e) => {
  console.error('FATAL', e);
  process.exitCode = 2;
  /* An open browser keeps node alive, so a failed step would otherwise
     hang the runner instead of reporting. */
  await PAGE?.screenshot({ path: `${ROOT}/tools/shots12/fatal.png` }).catch(() => {});
  await BROWSER?.close().catch(() => {});
});
