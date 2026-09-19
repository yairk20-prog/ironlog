/* Headless smoke test: boots the PWA, runs a full workout, checks persistence. */
import pw from 'playwright';
const { chromium } = pw;

const ROOT = new URL('..', import.meta.url).pathname;
const BASE = 'http://localhost:8777/index.html';
const shot = (p, n) => p.screenshot({ path: `${ROOT}tools/shots/${n}.png`, fullPage: false });

const errors = [];


/** First run shows the questionnaire; accept the defaults and move on. */
async function skipLogin(page) {
  const btn = page.locator('.login .btn', { hasText: 'המשך בלי חשבון' });
  try { await btn.waitFor({ timeout: 6000 }); await btn.click(); await page.waitForTimeout(350); }
  catch { /* already past the login screen */ }
}

async function skipOnboarding(page) {
  const onb = page.locator('.onb');
  if (!(await onb.count())) return;
  for (let i = 0; i < 12; i++) {
    if (!(await page.locator('.onb').count())) return;
    await page.locator('.onb-foot .btn.primary').click();
    await page.waitForTimeout(320);
  }
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

/* Logging a working set now takes over the screen with the rest card; the
   suites are not testing rest, so they step past it. */
async function dismissRest(page) {
  /* The card mounts a tick after the set is logged, so give it that tick
     before deciding it is not there. */
  try {
    await page.locator('.rest-close').waitFor({ timeout: 900 });
    await page.locator('.rest-close').click();
    await page.waitForSelector('.rest-screen', { state: 'detached', timeout: 2000 });
  } catch { /* no rest screen for this set */ }
}

async function main() {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({
    viewport: { width: 414, height: 896 },
    deviceScaleFactor: 2,
    locale: 'he-IL',
    hasTouch: true,
    isMobile: true
  });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#view:not([hidden])', { timeout: 8000 });
  await page.waitForTimeout(600);
  await skipLogin(page);
  await skipOnboarding(page);
  await page.waitForTimeout(400);
  await shot(page, '01-home');

  // Start the workout
  await page.getByRole('button', { name: /התחל אימון/ }).click();
  await page.waitForTimeout(600);
  await shot(page, '02-focus');

  // Log all sets of exercise 1
  const logExercise = async (weight, reps) => {
    const rows = page.locator('.set:not(.done)');
    let n = await rows.count();
    let guard = 0;
    while (n > 0 && guard++ < 12) {
      const row = rows.first();
      await row.locator('input').nth(0).fill(String(weight));
      await row.locator('input').nth(1).fill(String(reps));
      await row.locator('.set-go').click();
      await dismissRest(page);
      await page.waitForTimeout(280);
      n = await page.locator('.set:not(.done)').count();
    }
  };

  await logExercise(60, 10);
  await page.waitForTimeout(900);
  await shot(page, '03-after-ex1');

  // Plate calculator
  const plateChip = page.locator('.linkish', { hasText: 'עוד אפשרויות' });
  if (await plateChip.count()) {
    await plateChip.first().click();
    await page.waitForTimeout(350);
    await shot(page, '04-plates');
    await page.locator('.sheet-grab').click();
    await page.waitForTimeout(250);
  }

  // Warm-up
  await openTool(page, 'חימום');
  await page.waitForTimeout(350);
  await shot(page, '05-warmup');

  // Swap sheet
  await openTool(page, 'החלף תרגיל');
  await shot(page, '06-swap');
  await page.locator('.sheet-grab').click();
  await page.waitForTimeout(250);

  // Fill the rest of the workout quickly
  for (let i = 0; i < 6; i++) {
    await logExercise(40, 12);
    const next = page.locator('.focus-nav button').nth(1);
    if (await next.isDisabled()) break;
    await next.click();
    await page.waitForTimeout(350);
  }
  await shot(page, '07-late-workout');

  // Finish
  await shot(page, '08-before-finish');
  await finishWorkout(page);
  await page.waitForTimeout(700);
  await shot(page, '09-home-after');

  // History
  await page.locator('.tab[data-route="history"]').click();
  await page.waitForTimeout(700);
  await shot(page, '10-history');

  // Plan
  await page.locator('.tab[data-route="plan"]').click();
  await page.waitForTimeout(500);
  await shot(page, '11-plan');

  // More hub
  await page.locator('.tab[data-route="more"]').click();
  await page.waitForTimeout(500);
  await shot(page, '12-more');

  // Persistence across reload
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.locator('.tab[data-route="history"]').click();
  await page.waitForTimeout(700);
  const historyCount = await page.locator('.list-link').count();

  // Offline check
  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(1500);
  const offlineOk = await page.locator('#view').isVisible().catch(() => false);
  await shot(page, '13-offline');
  await ctx.setOffline(false);

  console.log(JSON.stringify({ historyCount, offlineOk, errors }, null, 2));
  await browser.close();
  if (errors.length) process.exitCode = 1;
}

main().catch((e) => { console.error('FATAL', e); process.exit(2); });
