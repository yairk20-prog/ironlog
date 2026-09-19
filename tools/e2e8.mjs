/* v4: animated loops, several goals at once, steppers and plate pickers,
   water in glasses, filter chips that show their state, and the rest screen. */
import pw from '/home/claude/.npm-global/lib/node_modules/playwright/index.js';
const { chromium } = pw;

const BASE = 'http://localhost:8777/index.html';
const shot = (p, n) => p.screenshot({ path: `/home/claude/gym/tools/shots8/${n}.png` });
const errors = [];
const out = {};

async function openSection(page, label) {
  await page.locator('.sect-head', { hasText: label }).click();
  await page.waitForTimeout(350);
}

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 414, height: 896 }, deviceScaleFactor: 2,
    locale: 'he-IL', hasTouch: true, isMobile: true
  });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(BASE, { waitUntil: 'load' });
  await page.locator('.login .btn', { hasText: 'המשך בלי חשבון' }).click();

  /* ---------- 1. several goals in the questionnaire ---------- */
  await page.waitForSelector('.onb', { timeout: 8000 });
  for (let i = 0; i < 12 && (await page.locator('.onb').count()); i++) {
    const goalStep = await page.locator('.onb h2', { hasText: 'מה המטרה' }).count();
    if (goalStep) {
      await page.locator('.pick', { hasText: 'כוח גולמי' }).click();
      await page.waitForTimeout(250);
      out.onbGoalsSelected = await page.locator('.pick.on').count();
      out.onbBlendNote = await page.locator('.onb p', { hasText: 'משולב' }).count();
      await shot(page, '01-goals');
    }
    await page.locator('.onb-foot .btn.primary').click();
    await page.waitForTimeout(260);
  }
  await page.waitForTimeout(600);

  out.storedGoals = await page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('ironlog');
    r.onsuccess = () => {
      const q = r.result.transaction('settings').objectStore('settings').get('goals');
      q.onsuccess = () => res(q.result?.value || null);
    };
  }));

  /* ---------- 2. the loop is a real animation ---------- */
  await page.getByRole('button', { name: /התחל אימון/ }).click();
  await page.waitForTimeout(900);
  const media = page.locator('.ex-media img').first();
  out.demoSrc = await media.getAttribute('src');
  out.demoIsMotion = /img\/motion\//.test(out.demoSrc || '');
  out.demoLoaded = await media.evaluate((i) => i.complete && i.naturalWidth > 0);
  out.demoFrames = await media.evaluate(async (i) => {
    /* An animated WebP decodes to more than one frame; a still does not. */
    const res = await fetch(i.src);
    const buf = new Uint8Array(await res.arrayBuffer());
    let anim = 0;
    for (let k = 0; k < buf.length - 4; k++) {
      if (buf[k] === 0x41 && buf[k + 1] === 0x4E && buf[k + 2] === 0x4D && buf[k + 3] === 0x46) anim++;
    }
    return anim;
  });
  await shot(page, '02-workout');

  /* ---------- 3. the rest screen ---------- */
  await page.locator('.set-field input').first().fill('60');
  await page.locator('.set-field input').nth(1).fill('8');
  await page.locator('.set-go').first().click();
  await page.waitForSelector('.rest-screen', { timeout: 6000 });
  await page.waitForTimeout(900);
  out.restClock = (await page.locator('.rest-clock').innerText()).trim();
  out.restHasRing = await page.locator('.rest-progress').count();
  out.restNext = await page.locator('.rest-next b').innerText().catch(() => '');
  out.restTip = (await page.locator('.rest-tip b').innerText().catch(() => '')).trim();
  out.restControls = await page.locator('.rest-screen button').count();
  await shot(page, '03-rest');

  /* the ring actually moves, and the dock agrees with the screen */
  const first = await page.locator('.rest-progress').getAttribute('stroke-dashoffset');
  await page.waitForTimeout(1500);
  const second = await page.locator('.rest-progress').getAttribute('stroke-dashoffset');
  out.ringAdvances = first !== second;
  out.dockMatches = await page.evaluate(() => {
    const dock = document.querySelector('#timerRead')?.textContent?.trim();
    const rest = document.querySelector('.rest-clock')?.textContent?.trim();
    return dock === rest;
  });

  /* +30 keeps it going, skip returns to the grid */
  await page.locator('.rest-screen .btn', { hasText: '+30' }).click();
  await page.waitForTimeout(400);
  await page.locator('.rest-screen .btn', { hasText: 'דלג' }).click();
  await page.waitForTimeout(500);
  out.restClosed = await page.locator('.rest-screen').count();
  out.timerStopped = await page.locator('#timerDock[hidden]').count();

  /* a warm-up must not take the screen over */
  await page.locator('.linkish', { hasText: 'עוד אפשרויות' }).click();
  await page.waitForTimeout(350);
  await page.locator('.sheet .list-link', { hasText: 'חימום' }).click();
  await page.waitForTimeout(600);
  const warm = page.locator('.set.warmup .set-go').first();
  if (await warm.count()) {
    await warm.click();
    await page.waitForTimeout(900);
  }
  out.restOnWarmup = await page.locator('.rest-screen').count();

  /* ---------- 4. filter chips show which one is on ---------- */
  await page.goto(`${BASE}#/library`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  out.chipsOnAtStart = await page.locator('.filter-row .chip.on').count();
  await page.locator('.filter-row .chip', { hasText: 'מכונה' }).click();
  await page.waitForTimeout(400);
  out.chipOnAfterTap = await page.locator('.filter-row .chip.on', { hasText: 'מכונה' }).count();
  out.chipIsWhite = await page.locator('.filter-row .chip.on').first()
    .evaluate((n) => getComputedStyle(n).backgroundColor);
  await shot(page, '04-filters');

  /* ---------- 5. water in glasses ---------- */
  await page.goto(`${BASE}#/nutrition`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  out.glassCount = await page.locator('.glass').count();
  out.mlShown = await page.locator('#view', { hasText: /\d+ \/ \d+ מ״ל/ }).count();
  await page.locator('.btn', { hasText: 'כוס' }).first().click();
  await page.waitForTimeout(700);
  out.glassesFull = await page.locator('.glass.full').count();
  await shot(page, '05-water');

  /* ---------- 6. settings without a keyboard ---------- */
  await page.goto(`${BASE}#/settings`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await openSection(page, 'גוף וציוד');
  out.steppers = await page.locator('.stepper').count();
  out.plateTiles = await page.locator('.plate-pick').count();
  out.barTiles = await page.locator('.pick-tile').count();
  out.typedNumberFields = await page.locator('.sect-body input[type="number"]').count();
  await shot(page, '06-body-equipment');

  const before = await page.locator('.stepper .num').first().innerText();
  await page.locator('.stepper .step-btn').first().click();
  await page.waitForTimeout(300);
  out.stepperChanges = before !== (await page.locator('.stepper .num').first().innerText());

  await page.locator('.plate-pick', { hasText: '25' }).first().click();
  await page.waitForTimeout(300);
  out.platesStored = await page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('ironlog');
    r.onsuccess = () => {
      const q = r.result.transaction('settings').objectStore('settings').get('plates');
      q.onsuccess = () => res(q.result?.value || null);
    };
  }));

  /* several goals stay selectable from settings too */
  await page.goto(`${BASE}#/settings`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  await openSection(page, 'מטרות אימון');
  out.goalsOn = await page.locator('.opt.on').count();
  await shot(page, '07-goals-settings');

  /* ---------- 7. backup with no account at all ---------- */
  if (process.env.COACH === '1') {
    await openSection(page, 'גיבוי בענן');
    out.recoveryCode = (await page.locator('.code-box code').innerText()).trim();
    out.codeLooksRandom = /^[A-Za-z0-9_-]{24,64}$/.test(out.recoveryCode);
    await page.locator('.sect-body .btn.primary', { hasText: 'גבה עכשיו' }).click();
    await page.waitForTimeout(1200);
    await openSection(page, 'גיבוי בענן');
    out.backedUp = await page.locator('.sect-body', { hasText: 'גובה לאחרונה' }).count();
    out.askedForGoogleId = await page.locator('.sect-body input[placeholder*="googleusercontent"]').count();
    await shot(page, '08-cloud-backup');
  }

  out.errors = errors;
  console.log(JSON.stringify(out, null, 2));
  await browser.close();

  const fatal = [
    !out.demoIsMotion && 'the demo is not the animated loop',
    !out.demoLoaded && 'the loop did not load',
    out.demoFrames < 2 && 'the loop file is not animated',
    (out.storedGoals || []).length < 2 && 'two goals were not stored',
    out.onbBlendNote !== 1 && 'the questionnaire did not explain the blend',
    !out.restHasRing && 'the rest screen has no countdown ring',
    !out.ringAdvances && 'the rest ring does not move',
    !out.dockMatches && 'the rest screen and the dock disagree',
    out.restControls > 3 && `the rest screen has ${out.restControls} controls`,
    out.restClosed !== 0 && 'skipping rest did not close it',
    out.restOnWarmup !== 0 && 'a warm-up set opened the rest screen',
    out.chipOnAfterTap !== 1 && 'the tapped filter chip does not read as selected',
    out.chipIsWhite !== 'rgb(255, 255, 255)' && `the selected chip is ${out.chipIsWhite}`,
    out.glassCount < 8 && 'the glasses row is missing',
    out.glassesFull !== 1 && 'adding a glass did not fill one',
    out.mlShown !== 0 && 'water is still shown in millilitres',
    out.typedNumberFields !== 0 && 'body and equipment still ask for typed numbers',
    !out.stepperChanges && 'the stepper does not change its value',
    out.plateTiles < 8 && 'the plate picker is missing',
    out.goalsOn < 2 && 'settings does not show both goals selected',
    process.env.COACH === '1' && !out.codeLooksRandom && 'the recovery code is not random enough',
    process.env.COACH === '1' && out.backedUp !== 1 && 'the cloud backup did not record a time'
  ].filter(Boolean);
  if (fatal.length) { console.error('FAIL:', fatal.join(' | ')); process.exit(1); }
  console.log('PASS');
}

main().catch((e) => { console.error('FATAL', e); process.exit(2); });
