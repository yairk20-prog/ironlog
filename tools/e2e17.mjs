/* v5.12: nothing typed in a workout is lost.

   The five reports, each reproduced:
   1. bodyweight exercises (push-ups) start with the lifter's bodyweight in
      the weight column, and progress by reps, not by a heavier body
   2/4. reps and weight typed into a set — not yet ticked — survive leaving
      for the home screen and coming back, and a full reload
   3. ticking a working set opens the rest screen, short rests included
   5. switching to the swipe view and back keeps what was typed, in both
      directions
   and the weight of a ticked set carries to the next open set. */
import pw from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { LAUNCH, localOnly } from './launch.mjs';

const { chromium } = pw;
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const BASE = `http://localhost:${process.env.PORT || 8777}/index.html`;
const SHOTS = `${ROOT}/tools/shots17`;
fs.mkdirSync(SHOTS, { recursive: true });
const shot = (p, n) => p.screenshot({ path: `${SHOTS}/${n}.png` });
const errors = [];
const out = {};
let BROWSER = null;
let PAGE = null;
const pause = (page, ms = 300) => page.waitForTimeout(ms);

const rowValues = (page, n) => page.locator('.set:not(.warmup)').nth(n).locator('input').evaluateAll((els) => els.map((e) => e.value));

async function main() {
  const browser = BROWSER = await chromium.launch(LAUNCH);
  const ctx = await browser.newContext({ viewport: { width: 414, height: 896 }, deviceScaleFactor: 2, locale: 'he-IL', hasTouch: true, isMobile: true });
  await localOnly(ctx);
  const page = PAGE = await ctx.newPage();
  page.setDefaultTimeout(8000);
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  /* onboarding: weight 82 kg */
  await page.goto(BASE, { waitUntil: 'load' });
  await page.locator('.login .btn', { hasText: 'המשך בלי חשבון' }).click();
  await page.waitForSelector('.onb');
  await page.locator('.onb-foot .btn.primary').click(); await pause(page, 320);
  await page.locator('.onb input[type=number]').nth(2).fill('82');
  for (let i = 0; i < 20 && (await page.locator('.onb').count()); i++) {
    await page.locator('.onb-foot .btn.primary').click({ timeout: 5000 }).catch(() => {});
    await pause(page, 320);
  }
  await page.waitForSelector('#view .hero', { timeout: 8000 });
  await pause(page, 400);

  /* today's push day, at the park: push-ups first */
  await page.locator('.venue-seg button', { hasText: 'פארק' }).click();
  await pause(page, 500);
  await page.locator('.hero .btn.primary', { hasText: 'התחל אימון' }).click();
  await page.waitForFunction(() => location.hash === '#/workout');
  await pause(page, 900);
  out.firstExercise = (await page.locator('.focus-nav .name b, .ex-head h2, #exPane h2').first().innerText().catch(() => '')).trim();
  out.prefill = await rowValues(page, 0);
  await shot(page, '01-pushups');

  /* 2/4: type into set 1 without ticking, leave, come back */
  const set1 = page.locator('.set:not(.warmup)').nth(0).locator('input');
  await set1.nth(0).fill('80');
  await set1.nth(1).fill('12');
  await pause(page, 100);
  await page.locator('.tab[data-route="home"]').click().catch(() => {});
  await page.evaluate(async () => (await import('./js/app.js')).go('home'));
  await pause(page, 900);
  out.leftTo = await page.evaluate(() => location.hash);
  await page.evaluate(async () => (await import('./js/app.js')).go('workout'));
  await pause(page, 900);
  out.afterLeave = await rowValues(page, 0);

  /* ...and a full reload */
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.set', { timeout: 8000 });
  await pause(page, 600);
  out.afterReload = await rowValues(page, 0);

  /* 5: the swipe view shows it, and what is typed there comes back */
  await page.locator('#topbarSlot .btn[aria-label="מצב גלילה"]').click();
  await page.waitForSelector('.feed-set', { timeout: 6000 });
  await pause(page, 500);
  out.feedSet1 = await page.locator('.feed-card').first().locator('.feed-set').nth(0).locator('input').evaluateAll((els) => els.map((e) => e.value));
  const feedSet3 = page.locator('.feed-card').first().locator('.feed-set').nth(2).locator('input');
  await feedSet3.nth(1).fill('9');
  await pause(page, 100);
  await shot(page, '02-feed');
  await page.locator('.feed-close').click();
  await pause(page, 700);
  out.afterFeed = await rowValues(page, 2);
  out.afterFeedSet1 = await rowValues(page, 0);

  /* 3: ticking a set opens the rest screen */
  await page.locator('.set:not(.warmup)').nth(0).locator('.set-go').click();
  await pause(page, 700);
  out.restOpen = await page.locator('.rest-screen').count();
  await shot(page, '03-rest');
  await page.locator('.rest-close').click().catch(() => {});
  await pause(page, 400);

  /* the ticked weight carries to the next open set */
  out.set2 = await rowValues(page, 1);
  out.logged = await page.evaluate(async () => {
    const db = await import('./js/db.js');
    const rows = await db.all('set_logs');
    return rows.map((r) => `${r.exercise_id}:${r.weight_kg}x${r.reps}`);
  });

  /* 1: next time, push-ups start from the logged bodyweight and ask for a rep more */
  out.next = await page.evaluate(async () => {
    const { nextTarget } = await import('./js/logic.js');
    const { getExercise } = await import('./js/exercises.js');
    return {
      fresh: nextTarget({ lastSets: [], exercise: getExercise('pushup'), goal: ['hypertrophy'], settings: { bodyweight: 82 } }),
      after: nextTarget({ lastSets: [{ weight_kg: 80, reps: 12 }, { weight_kg: 80, reps: 12 }], exercise: getExercise('pushup'), goal: ['hypertrophy'], settings: { bodyweight: 82 } }),
      bench: nextTarget({ lastSets: [], exercise: getExercise('bb_bench'), goal: ['hypertrophy'], settings: { bodyweight: 82 } })
    };
  });

  out.errors = errors;
  console.log(JSON.stringify(out, null, 2));
  await browser.close();

  const fatal = [
    out.prefill[0] !== '82' && `push-ups should start with the bodyweight (82), got ${out.prefill[0]}`,
    out.leftTo !== '#/home' && 'did not leave the workout',
    !(out.afterLeave[0] === '80' && out.afterLeave[1] === '12') && `typed values lost on leaving: ${out.afterLeave}`,
    !(out.afterReload[0] === '80' && out.afterReload[1] === '12') && `typed values lost on reload: ${out.afterReload}`,
    !(out.feedSet1[0] === '80' && out.feedSet1[1] === '12') && `the swipe view does not show what was typed: ${out.feedSet1}`,
    out.afterFeed[1] !== '9' && `reps typed in the swipe view lost on switching back: ${out.afterFeed}`,
    !(out.afterFeedSet1[0] === '80' && out.afterFeedSet1[1] === '12') && `switching views lost set 1: ${out.afterFeedSet1}`,
    out.restOpen !== 1 && 'ticking a push-up set did not open the rest screen',
    !out.logged.includes('pushup:80x12') && `the set was not logged as typed: ${out.logged}`,
    out.set2[0] !== '80' && `the next set did not carry the weight: ${out.set2}`,
    !(out.next.fresh.weight === 82) && `a fresh bodyweight target: ${JSON.stringify(out.next.fresh)}`,
    !(out.next.after.weight === 80 && out.next.after.reps === 13) && `bodyweight progression: ${JSON.stringify(out.next.after)}`,
    out.next.bench.weight !== 0 && 'a barbell lift got the bodyweight as its weight',
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
