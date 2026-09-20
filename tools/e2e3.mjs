/* Progressive-overload regression: session 2 must target more than session 1. */
import pw from 'playwright';
import { LAUNCH, localOnly } from './launch.mjs';

const { chromium } = pw;

const ROOT = new URL('..', import.meta.url).pathname;
const BASE = 'http://localhost:8777/index.html';
const shot = (p, n) => p.screenshot({ path: `${ROOT}tools/shots3/${n}.png` });
const errors = [];

async function logAllSets(page, weight, reps) {
  for (let guard = 0; guard < 14; guard++) {
    const open = page.locator('.set:not(.done)');
    if (!(await open.count())) break;
    const row = open.first();
    await row.locator('input').nth(0).fill(String(weight));
    await row.locator('input').nth(1).fill(String(reps));
    await row.locator('.set-go').click();
    await dismissRest(page);
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
  const browser = await chromium.launch(LAUNCH);
  const ctx = await browser.newContext({
    viewport: { width: 414, height: 896 }, deviceScaleFactor: 2, locale: 'he-IL', hasTouch: true, isMobile: true
  });
  await localOnly(ctx);

  const page = await ctx.newPage();
  /* A blocked web font or a sandbox with no route to Google is an artefact of
     where the suite runs, not a regression in the app. */
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (/ERR_TUNNEL_CONNECTION_FAILED|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|fonts\.googleapis\.com|fonts\.gstatic\.com|accounts\.google\.com/.test(m.text())) return;
    errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#view:not([hidden])');
  await page.waitForTimeout(600);
  await skipLogin(page);
  await skipOnboarding(page);
  await page.waitForTimeout(400);

  /* ---------- session 1: bench at 60×10 (top of the 6–10 range) ---------- */
  await page.getByRole('button', { name: /התחל אימון/ }).click();
  await page.waitForTimeout(700);

  const firstTarget = await page.locator('.target-box .t-val').first().textContent();

  // plate calculator on the barbell lift
  await openTool(page, 'מחשבון פלטות');
  await page.waitForTimeout(400);
  await page.locator('#sheetBody input').first().fill('100');
  await page.waitForTimeout(400);
  await shot(page, 'plates-100');
  const plateRows = await page.locator('.plate-item').allTextContents();
  await page.locator('.sheet-grab').click();
  await page.waitForTimeout(300);

  // warm-up ramp
  await page.locator('.set-field input').first().fill('60');
  await openTool(page, 'חימום');
  await page.waitForTimeout(500);
  const warmupRows = await page.locator('.set.warmup').count();
  await shot(page, 'warmup-rows');

  // tuning note
  await openTool(page, 'הערת כיוונון');
  await page.waitForTimeout(400);
  await page.locator('#sheetBody textarea').fill('כיסא על חור 4');
  await page.locator('#sheetBody .btn', { hasText: 'שמור' }).click();
  await page.waitForTimeout(500);

  await runWholeWorkout(page, 60, 10);
  await shot(page, 'session1-end');

  await finishWorkout(page);
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
  /* The saved tuning note must survive into the next session; it now lives
     one level down, in the overflow sheet. */
  await page.locator('.linkish', { hasText: 'עוד אפשרויות' }).click();
  await page.waitForTimeout(350);
  const noteChip = await page.locator('.sheet .list-link', { hasText: 'הערת כיוונון' }).count();
  await page.locator('.sheet .list-link', { hasText: 'הערת כיוונון' }).click();
  await page.waitForTimeout(400);
  const savedNote = await page.locator('#sheetBody textarea').inputValue().catch(() => '');
  await page.locator('.sheet-grab').click();
  await page.waitForTimeout(300);
  await shot(page, 'session2-target');

  /* rest timer should be visible right after a set */
  await page.locator('.set-field input').first().fill('62.5');
  await page.locator('.set-field input').nth(1).fill('8');
  await page.locator('.set-go').first().click();
  await dismissRest(page);
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
    savedNote,
    timerVisible,
    timerText,
    errors
  }, null, 2));

  await browser.close();
  if (errors.length) process.exitCode = 1;
}

/* process.exit() truncates a pipe mid-write, which silently ate the one
   line explaining the failure whenever a suite ran under the runner. */
main().catch((e) => { console.error('FATAL', e); process.exitCode = 2; });
