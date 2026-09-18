/* v2 flows: onboarding, equipment-aware planning, library, summary, body. */
import pw from '/home/claude/.npm-global/lib/node_modules/playwright/index.js';
const { chromium } = pw;

const BASE = 'http://localhost:8777/index.html';
const shot = (p, n) => p.screenshot({ path: `/home/claude/gym/tools/shots5/${n}.png` });
const errors = [];

async function skipLogin(page) {
  const btn = page.locator('.login .btn', { hasText: 'המשך בלי חשבון' });
  try { await btn.waitFor({ timeout: 6000 }); await btn.click(); await page.waitForTimeout(350); }
  catch { /* already past the login screen */ }
}

/* The workout screen's occasional actions moved behind one overflow sheet. */
async function openTool(page, label) {
  await page.locator('.linkish', { hasText: 'עוד אפשרויות' }).click();
  await page.waitForTimeout(350);
  await page.locator('.sheet .list-link', { hasText: label }).click();
  await page.waitForTimeout(400);
}

/* Finishing lives in the top bar now, not at the bottom of the card. */
async function finishWorkout(page) {
  await page.locator('#topbarSlot .btn', { hasText: 'סיים' }).click();
  await page.waitForTimeout(450);
  await page.locator('#sheetBody .btn', { hasText: 'סיים ושמור' }).click();
  await page.waitForTimeout(900);
}

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 414, height: 896 }, deviceScaleFactor: 2, locale: 'he-IL', hasTouch: true, isMobile: true
  });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(BASE, { waitUntil: 'networkidle' });

  /* ---------- onboarding ---------- */
  await skipLogin(page);
  await page.waitForSelector('.onb', { timeout: 8000 });
  await page.waitForTimeout(500);
  await shot(page, '01-onb-welcome');
  const steps = await page.locator('.onb-progress i').count();

  await page.locator('.onb input[type="text"]').fill('יאיר');
  await page.locator('.onb-foot .btn.primary').click();
  await page.waitForTimeout(400);
  await shot(page, '02-onb-body');

  // body metrics
  const nums = page.locator('.onb .num-field input');
  await nums.nth(0).fill('34');
  await nums.nth(1).fill('178');
  await nums.nth(2).fill('82');
  await page.waitForTimeout(250);
  await page.locator('.onb-foot .btn.primary').click();
  await page.waitForTimeout(350);

  // experience → intermediate
  await page.locator('.onb .pick').nth(1).click();
  await page.waitForTimeout(250);
  await shot(page, '03-onb-experience');
  await page.locator('.onb-foot .btn.primary').click();
  await page.waitForTimeout(350);

  // goal → hypertrophy (first)
  await page.locator('.onb .pick').nth(0).click();
  await page.waitForTimeout(250);
  await page.locator('.onb-foot .btn.primary').click();
  await page.waitForTimeout(350);

  // days → 6 (third)
  await page.locator('.onb .pick').nth(2).click();
  await page.waitForTimeout(250);
  await page.locator('.onb-foot .btn.primary').click();
  await page.waitForTimeout(350);
  await shot(page, '04-onb-equipment');

  // equipment: turn OFF machines and cables, leaving free weights + bodyweight
  const eq = page.locator('.onb .pick');
  await eq.nth(1).click(); await page.waitForTimeout(200);
  await eq.nth(2).click(); await page.waitForTimeout(200);
  await shot(page, '05-onb-equipment-picked');
  await page.locator('.onb-foot .btn.primary').click();
  await page.waitForTimeout(350);

  // limits: knee
  await page.locator('.onb .pick').nth(1).click();
  await page.waitForTimeout(250);
  await shot(page, '06-onb-limits');
  await page.locator('.onb-foot .btn.primary').click();
  await page.waitForTimeout(400);
  await shot(page, '07-onb-summary');

  await page.locator('.onb-foot .btn.primary').click();
  await page.waitForTimeout(1200);
  await shot(page, '08-home');

  const greeting = await page.locator('#topbarTitle').textContent();
  const savedSettings = await page.evaluate(async () => {
    const db = await import('./js/db.js');
    return {
      equipment: await db.setting('equipment'),
      limits: await db.setting('limits'),
      goal: await db.setting('goal'),
      rotation: await db.setting('rotation'),
      bodyweight: await db.setting('bodyweight'),
      onboarded: await db.setting('onboarded')
    };
  });

  /* ---------- planning respects equipment + limits ---------- */
  await page.locator('.tab[data-route="plan"]').click();
  await page.waitForTimeout(700);
  await shot(page, '09-plan-cards');
  const dayCards = await page.locator('.day-card').count();
  const dayImages = await page.locator('.day-card-img img').count();

  await page.locator('.day-card', { hasText: 'רגליים A' }).first().click();
  await page.waitForTimeout(600);
  await shot(page, '10-legs-adapted');
  const legNames = await page.locator('#sheetBody .ex-name').allTextContents();

  await page.locator('#sheetBody .btn', { hasText: 'התחל את האימון הזה' }).click();
  await page.waitForTimeout(1000);
  await shot(page, '11-workout');

  /* log the whole session so the summary has data */
  for (let ex = 0; ex < 8; ex++) {
    for (let guard = 0; guard < 8; guard++) {
      const open = page.locator('.set:not(.done)');
      if (!(await open.count())) break;
      const row = open.first();
      await row.locator('input').nth(0).fill('50');
      await row.locator('input').nth(1).fill('10');
      await row.locator('.set-go').click();
      await page.waitForTimeout(240);
    }
    await page.waitForTimeout(450);
    const next = page.locator('.focus-nav button').nth(1);
    if (!(await next.count()) || await next.isDisabled()) break;
    await next.click();
    await page.waitForTimeout(300);
  }

  await finishWorkout(page);
  await page.waitForTimeout(2000);
  await shot(page, '12-summary');
  const onSummary = await page.locator('.summary-hero').count();
  const summaryTiles = await page.locator('.summary-grid .card').count();
  const muscleMapOnSummary = await page.locator('.muscle-map').count();

  /* ---------- library ---------- */
  await page.locator('.tab[data-route="more"]').click();
  await page.waitForTimeout(500);
  await page.locator('.list-link', { hasText: 'ספריית תרגילים' }).click();
  await page.waitForTimeout(800);
  await shot(page, '13-library');
  const libCards = await page.locator('.lib-card').count();

  await page.locator('.chip', { hasText: 'רק מה שמתאים' }).click();
  await page.waitForTimeout(500);
  const libFiltered = await page.locator('.lib-card').count();
  await shot(page, '14-library-filtered');

  // open something the session actually trained, so the chart has data
  await page.locator('.chip', { hasText: 'רק מה שמתאים' }).click();
  await page.waitForTimeout(400);
  const trainedName = await page.evaluate(async () => {
    const db = await import('./js/db.js');
    const ex = await import('./js/exercises.js');
    const rows = await db.all('set_logs');
    const id = rows.find((r) => !r.is_warmup && r.weight_kg > 0)?.exercise_id;
    return id ? ex.exerciseName(id) : '';
  });
  await page.locator('input[type="search"]').fill(trainedName);
  await page.waitForTimeout(500);
  await page.locator('.lib-card').first().click();
  await page.waitForTimeout(1100);
  await shot(page, '15-library-detail');
  const detailChart = await page.locator('.chart').count();
  const progressText = (await page.locator('#sheetBody .card').first().textContent()).replace(/\s+/g, ' ').trim().slice(0, 90);
  await page.locator('.sheet-grab').click();
  await page.waitForTimeout(300);

  /* ---------- body measurements ---------- */
  await page.locator('.tab[data-route="more"]').click();
  await page.waitForTimeout(400);
  await page.locator('.list-link', { hasText: 'מדידות גוף' }).click();
  await page.waitForTimeout(600);
  await shot(page, '16-body-empty');

  await page.locator('.btn', { hasText: 'רישום ראשון' }).click();
  await page.waitForTimeout(500);
  await page.locator('#sheetBody input[type="number"]').first().fill('82.4');
  await page.locator('#sheetBody .num-field input').first().fill('84');
  await page.waitForTimeout(250);
  await shot(page, '17-body-entry');
  await page.locator('#sheetBody .btn', { hasText: 'שמור מדידה' }).click();
  await page.waitForTimeout(900);
  await shot(page, '18-body-logged');
  const bodyCards = await page.locator('.meas-cell').count();

  /* ---------- settings: google card ---------- */
  await page.locator('.tab[data-route="more"]').click();
  await page.waitForTimeout(400);
  await page.locator('.list-link', { hasText: 'הגדרות' }).click();
  await page.waitForTimeout(900);
  await shot(page, '19-settings');
  const googleCard = await page.locator('text=Google OAuth Client ID').count();

  /* ---------- onboarding does not repeat ---------- */
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const onbAgain = await page.locator('.onb').count();

  console.log(JSON.stringify({
    steps, greeting, savedSettings,
    dayCards, dayImages, legNames,
    onSummary, summaryTiles, muscleMapOnSummary,
    libCards, libFiltered, detailChart, progressText, trainedName,
    bodyCards, googleCard, onbAgain,
    errors
  }, null, 2));

  await browser.close();
  if (errors.length) process.exitCode = 1;
}

main().catch((e) => { console.error('FATAL', e); process.exit(2); });
