/* Full-app smoke test across every screen, plus unit checks of the maths. */
import pw from 'playwright';
import { LAUNCH, localOnly } from './launch.mjs';

const { chromium } = pw;

const ROOT = new URL('..', import.meta.url).pathname;
const BASE = 'http://localhost:8777/index.html';
const shot = (p, n) => p.screenshot({ path: `${ROOT}tools/shots2/${n}.png`, fullPage: false });
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
  const browser = await chromium.launch(LAUNCH);
  const ctx = await browser.newContext({
    viewport: { width: 414, height: 896 }, deviceScaleFactor: 2,
    locale: 'he-IL', hasTouch: true, isMobile: true
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
  await page.waitForSelector('#view:not([hidden])', { timeout: 8000 });
  await page.waitForTimeout(600);
  await skipLogin(page);
  await skipOnboarding(page);
  await page.waitForTimeout(400);

  /* ---- unit checks inside the page ---- */
  const units = await page.evaluate(async () => {
    const logic = await import('./js/logic.js');
    const food = await import('./js/food.js');
    const posture = await import('./js/posture.js');
    const cal = await import('./js/calendar.js');
    const out = {};

    const p = logic.platesFor(100, { barWeight: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25] });
    out.plates100 = { achieved: p.achieved, perSide: p.perSide };

    const p2 = logic.platesFor(62.5, { barWeight: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25] });
    out.plates62 = { achieved: p2.achieved, leftover: p2.leftover, perSide: p2.perSide };

    out.warmup = logic.warmupSets(100, { bar: true, compound: true }, { barWeight: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25] });
    out.oneRM = logic.oneRM(100, 5);

    out.overloadUp = logic.nextTarget({
      lastSets: [{ weight_kg: 60, reps: 10 }, { weight_kg: 60, reps: 10 }, { weight_kg: 60, reps: 10 }],
      exercise: { compound: true, bar: true, cat: 'FreeWeights' },
      goal: 'hypertrophy',
      settings: { plates: [25, 20, 15, 10, 5, 2.5, 1.25], increment: 2.5 }
    });
    out.overloadDown = logic.nextTarget({
      lastSets: [{ weight_kg: 60, reps: 4 }, { weight_kg: 60, reps: 3 }, { weight_kg: 60, reps: 3 }],
      exercise: { compound: true, bar: true, cat: 'FreeWeights' },
      goal: 'hypertrophy',
      settings: { plates: [25, 20, 15, 10, 5, 2.5, 1.25], increment: 2.5 }
    });

    out.meal = food.parseMeal('שתי ביצים וסקופ חלבון');
    out.meal2 = food.parseMeal('150 גרם חזה עוף, כוס אורז ובננה');
    out.protein = logic.proteinTarget(80, true, 'hypertrophy');

    out.posture = posture.scoreAssessment([2, 2, 1, 0, 0, 0, 1]);

    const ics = cal.buildICS({ rotation: 'ppl6', cursor: 0, weeks: 2, time: '18:00' });
    out.icsEvents = (ics.match(/BEGIN:VEVENT/g) || []).length;
    out.icsValid = ics.startsWith('BEGIN:VCALENDAR') && ics.trim().endsWith('END:VCALENDAR');
    return out;
  });

  /* ---- walk every tab ---- */
  const tabs = ['home', 'plan', 'nutrition', 'history', 'more'];
  for (const t of tabs) {
    await page.locator(`.tab[data-route="${t}"]`).click();
    await page.waitForTimeout(600);
    await shot(page, `tab-${t}`);
  }

  /* ---- nutrition: log a meal ---- */
  await page.locator('.tab[data-route="nutrition"]').click();
  await page.waitForTimeout(500);
  /* Food is added on the meal it belongs to, not from one catch-all button. */
  await page.locator('.meal', { hasText: 'ארוחת בוקר' }).locator('.meal-add').click();
  await page.waitForTimeout(400);
  await page.locator('#sheetBody textarea').first().fill('שתי ביצים וסקופ חלבון');
  await page.waitForTimeout(400);
  await shot(page, 'nutrition-parse');
  await page.locator('#sheetBody .btn', { hasText: 'הוסף ליום' }).click();
  await page.waitForTimeout(800);
  await shot(page, 'nutrition-after');
  const proteinText = await page.locator('.card .num').first().textContent();

  /* ---- more → posture ---- */
  await page.locator('.tab[data-route="more"]').click();
  await page.waitForTimeout(500);
  await page.locator('.list-link', { hasText: 'יציבה' }).click();
  await page.waitForTimeout(600);
  await shot(page, 'posture');
  await page.locator('.btn', { hasText: 'התחל הערכה' }).click();
  await page.waitForTimeout(500);
  await shot(page, 'posture-assess');
  await page.locator('#sheetBody .btn', { hasText: 'קבל תוצאה' }).click();
  await page.waitForTimeout(800);
  await shot(page, 'posture-result');

  /* start a posture session and finish it */
  await page.locator('.list-link', { hasText: 'ניידות כללית' }).click();
  await page.waitForTimeout(500);
  await page.locator('#sheetBody .btn', { hasText: 'סשן עצמאי מלא' }).click();
  await page.waitForTimeout(900);
  await shot(page, 'posture-session');
  const inPostureWorkout = await page.locator('.focus').count();

  /* Abandoning now lives in the overflow sheet, not beside the set grid. */
  await page.locator('.linkish', { hasText: 'עוד אפשרויות' }).click();
  await page.waitForTimeout(350);
  await page.locator('.sheet .btn.danger', { hasText: 'בטל את האימון' }).click();
  await page.waitForTimeout(400);
  await page.locator('#sheetBody .btn', { hasText: 'בטל אימון' }).click();
  await page.waitForTimeout(800);

  /* ---- more → coach (no key) ---- */
  await page.locator('.tab[data-route="more"]').click();
  await page.waitForTimeout(400);
  await page.locator('.list-link', { hasText: 'מאמן אישי' }).click();
  await page.waitForTimeout(600);
  await shot(page, 'coach-nokey');

  /* ---- more → calendar ---- */
  await page.locator('.tab[data-route="more"]').click();
  await page.waitForTimeout(400);
  await page.locator('.list-link', { hasText: 'סנכרון ליומן' }).click();
  await page.waitForTimeout(500);
  await shot(page, 'calendar');
  await page.locator('.sheet-grab').click();
  await page.waitForTimeout(300);

  /* ---- settings ---- */
  await page.locator('.list-link', { hasText: 'הגדרות' }).click();
  await page.waitForTimeout(700);
  await shot(page, 'settings');

  /* ---- back navigation ---- */
  await page.locator('#topbarBack').click();
  await page.waitForTimeout(500);
  const backOk = await page.locator('.tab[data-route="more"].on').count();

  console.log(JSON.stringify({ units, proteinText, inPostureWorkout, backOk, errors }, null, 2));
  await browser.close();
  if (errors.length) process.exitCode = 1;
}

/* process.exit() truncates a pipe mid-write, which silently ate the one
   line explaining the failure whenever a suite ran under the runner. */
main().catch((e) => { console.error('FATAL', e); process.exitCode = 2; });
