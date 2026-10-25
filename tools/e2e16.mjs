/* v5.10: goals in plain words, and cardio days inside the weekly plan.

   · the goal step reads "להתחזק / להתחטב / לרדת במשקל", and "לרדת במשקל"
     is its own goal: a bigger calorie deficit than a cut
   · choosing it suggests cardio days, which the questionnaire saves
   · cardio days sit in the split — on the plan screen, on the home screen
     as today's session, in tomorrow's preview and in the calendar file
   · finishing cardio on a planned cardio day counts as that day: the plan
     moves on, once; cardio on a lifting day still leaves the plan alone
   · changing the number of cardio days keeps today's place in the week */
import pw from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { LAUNCH, localOnly } from './launch.mjs';

const { chromium } = pw;
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const BASE = `http://localhost:${process.env.PORT || 8777}/index.html`;
const SHOTS = `${ROOT}/tools/shots16`;
fs.mkdirSync(SHOTS, { recursive: true });
const shot = (p, n) => p.screenshot({ path: `${SHOTS}/${n}.png` });
const errors = [];
const out = {};
let BROWSER = null;
let PAGE = null;
const pause = (page, ms = 300) => page.waitForTimeout(ms);
const setting = (page, k) => page.evaluate(async (k) => (await import('./js/db.js')).setting(k, null), k);
const setSetting = (page, k, v) => page.evaluate(async ([k, v]) => (await import('./js/db.js')).setSetting(k, v), [k, v]);
const next = (page) => page.locator('.onb-foot .btn.primary').click();

async function main() {
  const browser = BROWSER = await chromium.launch(LAUNCH);
  const ctx = await browser.newContext({
    viewport: { width: 414, height: 896 }, deviceScaleFactor: 2,
    locale: 'he-IL', hasTouch: true, isMobile: true
  });
  await localOnly(ctx);
  const page = PAGE = await ctx.newPage();
  page.setDefaultTimeout(8000);
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  /* ---------- the questionnaire ---------- */
  await page.goto(BASE, { waitUntil: 'load' });
  await page.locator('.login .btn', { hasText: 'המשך בלי חשבון' }).click();
  await page.waitForSelector('.onb');
  for (let i = 0; i < 12; i++) {
    if (await page.locator('.onb h2', { hasText: 'מה המטרה' }).count()) break;
    await next(page); await pause(page, 320);
  }
  out.goalNames = await page.locator('.onb .pick b').allInnerTexts();
  await page.locator('.onb .pick', { hasText: 'לרדת במשקל' }).click();
  await page.locator('.onb .pick', { hasText: 'לבנות שריר' }).click();   // off — it was the default
  await pause(page, 200);
  out.goalsOn = await page.locator('.onb .pick.on b').allInnerTexts();
  await shot(page, '01-goals');
  await next(page); await pause(page, 320);
  out.cardioChoice = (await page.locator('.onb-cardio .chip.on').innerText()).trim();
  await shot(page, '02-days-cardio');
  for (let i = 0; i < 10 && (await page.locator('.onb').count()); i++) {
    await next(page).catch(() => {});
    await pause(page, 320);
  }
  await page.waitForSelector('#view .hero', { timeout: 8000 });
  await pause(page, 500);
  out.savedGoals = await setting(page, 'goals');
  out.savedCardioDays = await setting(page, 'cardioDays');

  /* ---------- a bigger deficit than a cut ---------- */
  out.kcal = await page.evaluate(async () => {
    const { calorieTarget } = await import('./js/logic.js');
    const p = { bodyweight: 90, height: 178, age: 35, sex: 'male' };
    return { lose: calorieTarget({ ...p, goals: ['lose'] }), cut: calorieTarget({ ...p, goals: ['cut'] }), build: calorieTarget({ ...p, goals: ['hypertrophy'] }) };
  });

  /* ---------- the plan with cardio days in it ---------- */
  out.days = await page.evaluate(async () => {
    const { planDays } = await import('./js/programs.js');
    return {
      ppl6_2: planDays({ rotation: 'ppl6', cardioDays: 2 }),
      ppl3_2: planDays({ rotation: 'ppl3', cardioDays: 2 }),
      ppl3_3: planDays({ rotation: 'ppl3', cardioDays: 3 }),
      none: planDays({ rotation: 'ppl6', cardioDays: 0 })
    };
  });

  await page.locator('.tab[data-route="plan"]').click();
  await pause(page, 900);
  out.planCardioCards = await page.locator('.day-card.cardio-day').count();
  out.planRestCards = await page.locator('.day-card.rest').count();
  await page.locator('.cardio-plan').scrollIntoViewIfNeeded();
  await shot(page, '03-plan');

  /* move the plan to the first cardio day */
  const firstCardio = await page.evaluate(async () => {
    const { planDays } = await import('./js/programs.js');
    const db = await import('./js/db.js');
    const s = { rotation: await db.setting('rotation'), cardioDays: await db.setting('cardioDays') };
    return planDays(s).indexOf('cardio');
  });
  await setSetting(page, 'rotationCursor', firstCardio);
  await page.goto(`${BASE}#/home`, { waitUntil: 'load' });
  await page.reload({ waitUntil: 'load' });
  await pause(page, 900);
  out.heroKicker = (await page.locator('.hero .hero-kicker').innerText()).trim();
  out.heroTitle = (await page.locator('.hero h2').innerText()).trim();
  await shot(page, '04-home-cardio-day');

  /* start the planned session from the hero, then finish it */
  await page.locator('.hero .btn.primary', { hasText: 'התחל' }).click();
  await page.waitForFunction(() => location.hash === '#/cardio', null, { timeout: 6000 });
  await pause(page, 600);
  out.runPlanned = await page.evaluate(async () => (await (await import('./js/cardio.js')).getActiveCardio())?.planned === true);
  /* finish it from outside the live run screen, whose ticking would keep
     re-saving the run (the UI's own finish path is covered by e2e12) */
  await page.goto(`${BASE}#/more`, { waitUntil: 'load' });
  await pause(page, 500);
  const before = await setting(page, 'rotationCursor');
  out.finished = await page.evaluate(async () => {
    const c = await import('./js/cardio.js');
    const run = await c.getActiveCardio();
    run.startedAt -= 20 * 60000;
    const w = await c.finishCardio(run, { rpe: 6 }, 90);
    return { offPlan: w.offPlan, type: w.type };
  });
  out.cursorAfterPlanned = (await setting(page, 'rotationCursor')) - before;

  /* the cardio screen on a lifting day: no planned note, and the plan stays */
  await page.goto(`${BASE}#/home`, { waitUntil: 'load' });
  await page.reload({ waitUntil: 'load' });
  await pause(page, 700);
  out.heroAfter = (await page.locator('.hero h2').innerText()).trim();
  const liftCursor = await setting(page, 'rotationCursor');
  await page.goto(`${BASE}#/cardio`, { waitUntil: 'load' });
  await page.reload({ waitUntil: 'load' });
  await pause(page, 700);
  out.plannedNoteOnLiftDay = await page.locator('.planned-note').count();
  out.offPlanCardio = await page.evaluate(async () => {
    const c = await import('./js/cardio.js');
    const db = await import('./js/db.js');
    const settings = { rotation: await db.setting('rotation'), cardioDays: await db.setting('cardioDays'), duration: 'medium' };
    const run = await c.startCardio('walk', settings);
    const w = await c.finishCardio(run, {}, 90);
    return { planned: run.planned, offPlan: w.offPlan };
  });
  out.cursorAfterOffPlan = (await setting(page, 'rotationCursor')) - liftCursor;

  /* on a cardio day the cardio screen says it counts */
  await setSetting(page, 'rotationCursor', firstCardio);
  await page.reload({ waitUntil: 'load' });
  await pause(page, 700);
  out.plannedNote = await page.locator('.planned-note').count();
  out.plannedSection = (await page.locator('.section-title').nth(0).innerText()).trim();
  await shot(page, '05-cardio-planned');

  /* ---------- changing the number keeps today's place ---------- */
  await page.goto(`${BASE}#/plan`, { waitUntil: 'load' });
  await page.reload({ waitUntil: 'load' });
  await pause(page, 900);
  const todayKey = async () => page.evaluate(async () => {
    const { planDays } = await import('./js/programs.js');
    const db = await import('./js/db.js');
    const days = planDays({ rotation: await db.setting('rotation'), cardioDays: await db.setting('cardioDays') });
    const c = await db.setting('rotationCursor');
    return days[((c % days.length) + days.length) % days.length];
  });
  await setSetting(page, 'rotationCursor', 0);
  await page.reload({ waitUntil: 'load' });
  await pause(page, 800);
  const keyBefore = await todayKey();
  await page.locator('.cardio-plan .chip', { hasText: '3' }).click();
  await pause(page, 900);
  out.cardioDaysNow = await setting(page, 'cardioDays');
  out.keptPlace = (await todayKey()) === keyBefore;
  out.planCardioCards3 = await page.locator('.day-card.cardio-day').count();
  await page.locator('.cardio-plan .chip', { hasText: 'קפיצה בחבל' }).click();
  await pause(page, 700);
  out.kind = await setting(page, 'cardioKind');
  out.cardioCardName = (await page.locator('.day-card.cardio-day h3').first().innerText()).trim();

  /* ---------- the calendar file has the cardio days ---------- */
  out.ics = await page.evaluate(async () => {
    const { buildICS } = await import('./js/calendar.js');
    const ics = buildICS({ rotation: 'ppl3', cursor: 0, weeks: 1, cardioDays: 2, cardioName: 'אירובי · ריצה' });
    return { events: (ics.match(/BEGIN:VEVENT/g) || []).length, cardio: (ics.match(/SUMMARY:אירובי/g) || []).length };
  });

  /* ---------- settings has the same control ---------- */
  await page.goto(`${BASE}#/settings`, { waitUntil: 'load' });
  await page.reload({ waitUntil: 'load' });
  await pause(page, 900);
  out.settingsSection = (await page.locator('.sect-head', { hasText: 'ריצה ואירובי' }).innerText()).replace(/\s+/g, ' ');

  out.errors = errors;
  console.log(JSON.stringify(out, null, 2));
  await browser.close();

  const fatal = [
    !['לבנות שריר', 'להתחזק', 'להתחטב', 'לרדת במשקל'].every((g) => out.goalNames.some((n) => n.includes(g)))
      && `goal names: ${out.goalNames.join(' | ')}`,
    !(out.goalsOn.length === 1 && out.goalsOn[0].includes('לרדת במשקל')) && `goals picked: ${out.goalsOn}`,
    out.cardioChoice !== '2 ימים' && `weight loss should suggest 2 cardio days, got ${out.cardioChoice}`,
    !(Array.isArray(out.savedGoals) && out.savedGoals.includes('lose')) && `saved goals: ${out.savedGoals}`,
    out.savedCardioDays !== 2 && `saved cardio days: ${out.savedCardioDays}`,
    !(out.kcal.lose < out.kcal.cut && out.kcal.cut < out.kcal.build) && `calories lose/cut/build: ${JSON.stringify(out.kcal)}`,
    JSON.stringify(out.days.none) !== JSON.stringify(['push_a', 'pull_a', 'legs_a', 'push_b', 'pull_b', 'legs_b', 'rest']) && 'no cardio changed the split',
    !(out.days.ppl6_2.filter((d) => d === 'cardio').length === 2 && out.days.ppl6_2.includes('rest')) && `ppl6+2: ${out.days.ppl6_2}`,
    JSON.stringify(out.days.ppl3_2) !== JSON.stringify(['push_a', 'cardio', 'pull_a', 'cardio', 'legs_a', 'posture', 'rest']) && `ppl3+2 should take rest days: ${out.days.ppl3_2}`,
    !(out.days.ppl3_3.filter((d) => d === 'cardio').length === 3 && out.days.ppl3_3.includes('rest')) && `ppl3+3 must keep a rest day: ${out.days.ppl3_3}`,
    out.planCardioCards !== 2 && `plan shows ${out.planCardioCards} cardio days`,
    !/לפי התוכנית/.test(out.heroKicker) && `home on a cardio day: ${out.heroKicker}`,
    !out.heroTitle && 'no planned cardio session on the home screen',
    !out.runPlanned && 'cardio started on a cardio day is not marked as planned',
    !(out.finished.offPlan === false && out.finished.type === 'Cardio') && `planned cardio saved as ${JSON.stringify(out.finished)}`,
    out.cursorAfterPlanned !== 1 && `planned cardio moved the plan by ${out.cursorAfterPlanned}`,
    out.heroAfter === out.heroTitle && 'home still shows the cardio day after it was done',
    out.plannedNoteOnLiftDay !== 0 && 'the cardio screen claims a planned day on a lifting day',
    !(out.offPlanCardio.planned === false && out.offPlanCardio.offPlan === true) && `cardio on a lifting day: ${JSON.stringify(out.offPlanCardio)}`,
    out.cursorAfterOffPlan !== 0 && 'cardio on a lifting day moved the plan',
    out.plannedNote !== 1 && 'the cardio screen does not say a planned day counts',
    out.plannedSection !== 'לפי התוכנית' && `cardio screen lead section: ${out.plannedSection}`,
    out.cardioDaysNow !== 3 && 'choosing 3 cardio days did not save',
    !out.keptPlace && 'changing cardio days lost today\'s place',
    out.planCardioCards3 !== 3 && `plan shows ${out.planCardioCards3} cardio days after choosing 3`,
    out.kind !== 'rope' && `cardio kind: ${out.kind}`,
    out.cardioCardName !== 'קפיצה בחבל' && `cardio card shows ${out.cardioCardName}`,
    !(out.ics.cardio === 2 && out.ics.events === 6) && `calendar: ${JSON.stringify(out.ics)}`,
    !/3 ימים בשבוע/.test(out.settingsSection) && `settings: ${out.settingsSection}`,
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
