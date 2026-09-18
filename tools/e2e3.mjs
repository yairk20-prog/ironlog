/* Progressive-overload regression: session 2 must target more than session 1. */
import pw from '/home/claude/.npm-global/lib/node_modules/playwright/index.js';
const { chromium } = pw;

const BASE = 'http://localhost:8777/index.html';
const shot = (p, n) => p.screenshot({ path: `/home/claude/gym/tools/shots3/${n}.png` });
const errors = [];

async function logAllSets(page, weight, reps) {
  for (let guard = 0; guard < 14; guard++) {
    const open = page.locator('.set:not(.done)');
    if (!(await open.count())) break;
    const row = open.first();
    await row.locator('input').nth(0).fill(String(weight));
    await row.locator('input').nth(1).fill(String(reps));
    await row.locator('.set-go').click();
    await page.waitForTimeout(260);
  }
}

async function runWholeWorkout(page, weight, reps) {
  for (let i = 0; i < 10; i++) {
    await logAllSets(page, weight, reps);
    await page.waitForTimeout(500);
    const next = page.locator('.focus-nav button').nth(1);
    if (!(await next.count()) || await next.isDisabled()) break;
    await next.click();
    await page.waitForTimeout(350);
  }
}


/** First run shows the questionnaire; accept the defaults and move on. */
async function skipOnboarding(page) {
  const onb = page.locator('.onb');
  if (!(await onb.count())) return;
  for (let i = 0; i < 12; i++) {
    if (!(await page.locator('.onb').count())) return;
    await page.locator('.onb-foot .btn.primary').click();
    await page.waitForTimeout(320);
  }
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
  await page.waitForSelector('#view:not([hidden])');
  await page.waitForTimeout(600);
  await skipOnboarding(page);
  await page.waitForTimeout(400);

  /* ---------- session 1: bench at 60×10 (top of the 6–10 range) ---------- */
  await page.getByRole('button', { name: /התחל אימון/ }).click();
  await page.waitForTimeout(700);

  const firstTarget = await page.locator('.target-box .t-val').first().textContent();

  // plate calculator on the barbell lift
  await page.locator('.chip', { hasText: 'פלטות' }).first().click();
  await page.waitForTimeout(400);
  await page.locator('#sheetBody input').first().fill('100');
  await page.waitForTimeout(400);
  await shot(page, 'plates-100');
  const plateRows = await page.locator('.plate-item').allTextContents();
  await page.locator('.sheet-grab').click();
  await page.waitForTimeout(300);

  // warm-up ramp
  await page.locator('.set-field input').first().fill('60');
  await page.locator('.chip', { hasText: 'חימום' }).first().click();
  await page.waitForTimeout(500);
  const warmupRows = await page.locator('.set.warmup').count();
  await shot(page, 'warmup-rows');

  // tuning note
  await page.locator('.chip', { hasText: 'הערת כיוונון' }).first().click();
  await page.waitForTimeout(400);
  await page.locator('#sheetBody textarea').fill('כיסא על חור 4');
  await page.locator('#sheetBody .btn', { hasText: 'שמור' }).click();
  await page.waitForTimeout(500);

  await runWholeWorkout(page, 60, 10);
  await shot(page, 'session1-end');

  await page.locator('.btn', { hasText: 'סיום ושמירת האימון' }).click();
  await page.waitForTimeout(400);
  await page.locator('#sheetBody .btn', { hasText: 'סיים ושמור' }).click();
  await page.waitForTimeout(1600);

  /* ---------- session 2: start Push A again from the plan tab ---------- */
  await page.locator('.tab[data-route="plan"]').click();
  await page.waitForTimeout(600);
  await page.locator('.day-card', { hasText: 'דחיפה A' }).first().click();
  await page.waitForTimeout(500);
  await page.locator('#sheetBody .btn', { hasText: 'התחל את האימון הזה' }).click();
  await page.waitForTimeout(1000);

  const secondTarget = await page.locator('.target-box .t-val').first().textContent();
  const prevHint = await page.locator('.prev-hint').first().textContent();
  const noteChip = await page.locator('.chip', { hasText: 'הערת כיוונון' }).count();
  await shot(page, 'session2-target');

  /* rest timer should be visible right after a set */
  await page.locator('.set-field input').first().fill('62.5');
  await page.locator('.set-field input').nth(1).fill('8');
  await page.locator('.set-go').first().click();
  await page.waitForTimeout(600);
  const timerVisible = await page.locator('#timerDock:not([hidden])').count();
  const timerText = await page.locator('#timerRead').textContent();
  await shot(page, 'rest-timer');

  console.log(JSON.stringify({
    firstTarget: firstTarget.trim(),
    secondTarget: secondTarget.trim(),
    prevHint: prevHint.replace(/\s+/g, ' ').trim(),
    plateRows,
    warmupRows,
    noteChip,
    timerVisible,
    timerText,
    errors
  }, null, 2));

  await browser.close();
  if (errors.length) process.exitCode = 1;
}

main().catch((e) => { console.error('FATAL', e); process.exit(2); });
