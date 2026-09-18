/* Imagery checks: demo loop, muscle map, thumbnails, hero backdrop, offline. */
import pw from '/home/claude/.npm-global/lib/node_modules/playwright/index.js';
const { chromium } = pw;

const BASE = 'http://localhost:8777/index.html';
const shot = (p, n) => p.screenshot({ path: `/home/claude/gym/tools/shots4/${n}.png` });
const errors = [];
const failedImages = [];


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

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 414, height: 896 }, deviceScaleFactor: 2, locale: 'he-IL', hasTouch: true, isMobile: true
  });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('response', (r) => { if (r.url().includes('/img/') && r.status() >= 400) failedImages.push(`${r.status()} ${r.url()}`); });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#view:not([hidden])');
  await page.waitForTimeout(600);
  await skipLogin(page);
  await skipOnboarding(page);
  await page.waitForTimeout(900);
  await shot(page, '01-home-hero');
  const heroBg = await page.locator('.hero-bg').count();

  /* every bundled image resolves */
  const imageAudit = await page.evaluate(async () => {
    const { WITH_IMAGES, TWO_FRAMES } = await import('./js/ex-images.js');
    const { EXERCISES } = await import('./js/exercises.js');
    const urls = [];
    for (const id of WITH_IMAGES) {
      urls.push(`img/ex/${id}-0.webp`);
      if (TWO_FRAMES.has(id)) urls.push(`img/ex/${id}-1.webp`);
    }
    const bad = [];
    for (const u of urls) {
      const r = await fetch(u, { method: 'HEAD' });
      if (!r.ok) bad.push(`${r.status} ${u}`);
    }
    const noImage = EXERCISES.filter((e) => !WITH_IMAGES.has(e.id)).map((e) => e.id);
    return { checked: urls.length, bad, exercisesWithoutImage: noImage };
  });

  /* focus mode: the demo card and its loop */
  await page.getByRole('button', { name: /התחל אימון/ }).click();
  await page.waitForTimeout(1200);
  await shot(page, '02-focus-demo');
  const mediaCount = await page.locator('.ex-media img').count();
  const firstOn = await page.locator('.ex-media img.on').first().getAttribute('src');
  await page.waitForTimeout(1400);
  const secondOn = await page.locator('.ex-media img.on').first().getAttribute('src');

  /* muscle map sheet */
  await openTool(page, 'שרירים ופרטים');
  await page.waitForTimeout(700);
  await shot(page, '03-muscle-map');
  const mapPrimary = await page.locator('.muscle-map .mm-primary').count();
  const mapSecondary = await page.locator('.muscle-map .mm-secondary').count();
  const detailFrames = await page.locator('.media-row img').count();
  await page.locator('.sheet-grab').click();
  await page.waitForTimeout(300);

  /* swap sheet thumbnails */
  await openTool(page, 'החלף תרגיל');
  await page.waitForTimeout(600);
  await shot(page, '04-swap-thumbs');
  const swapThumbs = await page.locator('#sheetBody .ex-thumb').count();
  await page.locator('.sheet-grab').click();
  await page.waitForTimeout(300);

  /* plan sheet thumbnails */
  await page.locator('#topbarBack').click();
  await page.waitForTimeout(600);
  await page.locator('.tab[data-route="plan"]').click();
  await page.waitForTimeout(600);
  await page.locator('.day-card', { hasText: 'משיכה A' }).first().click();
  await page.waitForTimeout(700);
  await shot(page, '05-plan-thumbs');
  const planThumbs = await page.locator('#sheetBody .ex-thumb').count();

  /* exercise detail from the plan list */
  await page.locator('#sheetBody .ex-row').first().click();
  await page.waitForTimeout(800);
  await shot(page, '06-exercise-detail');
  await page.locator('.sheet-grab').click();
  await page.waitForTimeout(300);

  /* posture protocol thumbnails */
  await page.locator('.tab[data-route="more"]').click();
  await page.waitForTimeout(500);
  await page.locator('.list-link', { hasText: 'יציבה' }).click();
  await page.waitForTimeout(500);
  await page.locator('.list-link', { hasText: 'אגן בהטיה' }).click();
  await page.waitForTimeout(700);
  await shot(page, '07-posture-thumbs');
  const postureThumbs = await page.locator('#sheetBody .ex-thumb').count();
  await page.locator('.sheet-grab').click();
  await page.waitForTimeout(300);

  /* images must survive going offline */
  await page.locator('.tab[data-route="home"]').click();
  await page.waitForTimeout(800);
  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(2000);
  await shot(page, '08-offline-home');
  const offlineHero = await page.locator('.hero-bg').count();
  const offlineHeroLoaded = await page.evaluate(() => {
    const i = document.querySelector('.hero-bg');
    return i ? i.complete && i.naturalWidth > 0 : null;
  });
  await ctx.setOffline(false);

  console.log(JSON.stringify({
    heroBg,
    imageAudit: { checked: imageAudit.checked, bad: imageAudit.bad, exercisesWithoutImage: imageAudit.exercisesWithoutImage },
    mediaCount,
    loopAdvanced: firstOn !== secondOn,
    mapPrimary, mapSecondary, detailFrames,
    swapThumbs, planThumbs, postureThumbs,
    offlineHero, offlineHeroLoaded,
    failedImages,
    errors
  }, null, 2));

  await browser.close();
  if (errors.length) process.exitCode = 1;
}

main().catch((e) => { console.error('FATAL', e); process.exit(2); });
