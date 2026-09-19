/* v3 flows: login gate, demo player window, emoji-free chrome, square geometry,
   anatomical muscle map. */
import pw from 'playwright';
const { chromium } = pw;

const ROOT = new URL('..', import.meta.url).pathname;
const BASE = 'http://localhost:8777/index.html';
const shot = (p, n) => p.screenshot({ path: `${ROOT}tools/shots6/${n}.png` });
const errors = [];
const out = {};

/* Emoji ranges that must not appear in rendered UI text. */
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;

async function visibleEmoji(page) {
  return page.evaluate(() => {
    const re = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;
    const hits = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walk.nextNode())) {
      const t = n.nodeValue.trim();
      if (t && re.test(t)) hits.push(t.slice(0, 40));
    }
    return hits;
  });
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
    viewport: { width: 414, height: 896 }, deviceScaleFactor: 2,
    locale: 'he-IL', hasTouch: true, isMobile: true
  });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(BASE, { waitUntil: 'networkidle' });

  /* ---------- 1. login gate ---------- */
  await page.waitForSelector('.login', { timeout: 8000 });
  await page.waitForTimeout(450);
  await shot(page, '01-login');
  out.loginHero = await page.locator('.login-bg img').count();
  out.loginHeroLoaded = await page.locator('.login-bg img').evaluate((i) => i.complete && i.naturalWidth > 0);
  out.googleButton = await page.locator('.login .btn.primary').innerText();

  /* Google without a client id must explain itself, not fail silently. */
  await page.locator('.login .btn.primary').click();
  await page.waitForTimeout(300);
  out.clientIdPanel = await page.locator('.login-client').count();
  await shot(page, '02-login-google');
  await page.locator('.login-client .btn.ghost').click();
  await page.waitForTimeout(200);

  await page.locator('.login .btn', { hasText: 'המשך בלי חשבון' }).click();
  await page.waitForTimeout(400);
  out.authMode = await page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('ironlog');
    r.onsuccess = () => {
      const q = r.result.transaction('settings').objectStore('settings').get('authMode');
      q.onsuccess = () => res(q.result?.value || null);
    };
  }));

  /* ---------- 2. onboarding without emoji ---------- */
  await page.waitForSelector('.onb', { timeout: 8000 });
  await page.waitForTimeout(400);
  await shot(page, '03-onb-welcome');
  out.onbHeroLoaded = await page.locator('.onb-hero img').evaluate((i) => i.complete && i.naturalWidth > 0);

  for (let i = 0; i < 12 && (await page.locator('.onb').count()); i++) {
    if (await page.locator('.pick-ico').count()) {
      out.pickIconImgs = Math.max(out.pickIconImgs || 0, await page.locator('.pick-ico img').count());
      out.pickIconSvgs = Math.max(out.pickIconSvgs || 0, await page.locator('.pick-ico svg').count());
      const emo = await visibleEmoji(page);
      if (emo.length) (out.onbEmoji ||= []).push(...emo);
      if (!out.shotPicks && (await page.locator('.pick-ico img').count())) {
        await shot(page, '04-onb-equipment');
        out.shotPicks = true;
      }
    }
    await page.locator('.onb-foot .btn.primary').click();
    await page.waitForTimeout(300);
  }
  out.onbEmoji = out.onbEmoji || [];

  await page.waitForTimeout(500);
  await shot(page, '05-home');
  out.homeEmoji = await visibleEmoji(page);

  /* ---------- 3. geometry: nothing is rounded ---------- */
  out.roundedElements = await page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('.btn,.card,.chip,.list-link,.day-card,.ex-thumb,input').forEach((n) => {
      const r = getComputedStyle(n).borderTopLeftRadius;
      if (parseFloat(r) > 0.5) bad.push(`${n.className}:${r}`);
    });
    return bad.slice(0, 8);
  });

  /* ---------- 4. the demo player: a loop and nothing else ---------- */
  await page.getByRole('button', { name: /התחל אימון/ }).click();
  await page.waitForTimeout(700);
  await page.locator('.ex-media').click();
  await page.waitForSelector('.player', { timeout: 6000 });
  await page.waitForTimeout(600);
  await shot(page, '06-player');

  out.playerTitle = await page.locator('.pl-title').innerText();
  /* the whole player is one image, one hint and one close button */
  out.playerControls = await page.locator('.player button, .player input, .player select, .player a').count();
  out.playerHasTabs = await page.locator('.pl-tab').count();
  out.playerHasSpeeds = await page.locator('.pl-speeds').count();
  out.playerHasVideo = await page.locator('.video-frame, .pl-video').count();
  out.playerHasStepper = await page.locator('.player', { hasText: 'פריים' }).count() ? 1 : 0;

  /* The demo is either a drawn figure (rAF-animated pose) or — for exercises
     with two bundled photos — a crossfade between real frames. Either way,
     the check is the same shape: it moves, a tap holds it, another resumes it. */
  const isPhotoDemo = await page.locator('.player img').count() > 0;
  const demoSel = isPhotoDemo ? '.player img' : '.player .fg';
  out.playerFigure = isPhotoDemo
    ? await page.locator('.player img').count()
    : await page.locator('.player .fg .fg-body').count();

  const poseNow = () => page.locator(demoSel).first().evaluate((n) => (n.tagName === 'IMG' ? n.style.opacity : n.innerHTML));
  const before = await poseNow();
  await page.waitForTimeout(isPhotoDemo ? 1600 : 500);
  out.playerAnimates = before !== (await poseNow());

  await page.locator('.pl-stage').click();
  await page.waitForTimeout(500);
  const held = await poseNow();
  await page.waitForTimeout(isPhotoDemo ? 1600 : 500);
  out.pauseHolds = held === (await poseNow());
  await page.locator('.pl-stage').click();
  await page.waitForTimeout(isPhotoDemo ? 1600 : 400);
  out.resumes = held !== (await poseNow());

  await page.locator('.pl-close').click();
  await page.waitForTimeout(250);
  out.playerClosed = await page.locator('.player').count();

  /* ---------- 5. muscle map is anatomical, not a cartoon ---------- */
  out.workoutEmoji = await visibleEmoji(page);
  out.workoutControls = await page.locator('#view button, #view input, #view select').count();
  await page.locator('.linkish', { hasText: 'עוד אפשרויות' }).click();
  await page.waitForTimeout(400);
  out.toolsSheetItems = await page.locator('.sheet .list-link').count();
  await shot(page, '09-tools-sheet');
  await page.locator('.sheet .list-link', { hasText: 'שרירים ופרטים' }).click();
  await page.waitForTimeout(700);
  out.mmFigures = await page.locator('.mm-figure').count();
  out.mmPaths = await page.locator('.mm-figure path').count();
  out.mmPrimary = await page.locator('.mm-primary').count();
  out.mmHeight = await page.locator('.mm-figure').first().evaluate((n) => Math.round(n.getBoundingClientRect().height));
  await shot(page, '10-muscle-map');
  await page.locator('.sheet-grab').click();
  await page.waitForTimeout(300);

  /* ---------- 6. the rest of the app stays emoji-free ---------- */
  await page.locator('.topbar-back, #topbarBack').first().click().catch(() => {});
  await page.goto(`${BASE}#/more`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  out.moreEmoji = await visibleEmoji(page);
  out.moreIcons = await page.locator('.list-link .ex-ord svg').count();
  await shot(page, '10-more');

  await page.goto(`${BASE}#/plan`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  out.planEmoji = await visibleEmoji(page);
  await shot(page, '11-plan');

  await page.goto(`${BASE}#/nutrition`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  out.nutritionEmoji = await visibleEmoji(page);

  out.errors = errors;
  console.log(JSON.stringify(out, null, 2));
  await browser.close();

  const fatal = [
    out.loginHero !== 1 && 'login hero missing',
    out.authMode !== 'local' && 'authMode not stored',
    !out.playerFigure && 'the player is not showing the figure',
    !out.playerAnimates && 'the player figure does not move',
    !out.pauseHolds && 'tapping the player does not hold the pose',
    !out.resumes && 'the player does not resume',
    out.playerClosed !== 0 && 'player did not close',
    out.mmFigures !== 2 && 'muscle map missing a view',
    out.playerHasTabs !== 0 && 'the player still has tabs',
    out.playerHasSpeeds !== 0 && 'the player still has speed controls',
    out.playerHasVideo !== 0 && 'the player still has a video pane',
    out.playerControls > 1 && `the player has ${out.playerControls} controls, not one`,
    out.workoutControls > 18 && `the workout screen has ${out.workoutControls} controls`,
    out.toolsSheetItems < 5 && 'the tools sheet lost its items',
    out.mmHeight < 120 && 'muscle map collapsed',
    out.roundedElements.length && `rounded corners: ${out.roundedElements.join(', ')}`,
    [...out.onbEmoji, ...out.homeEmoji, ...out.workoutEmoji, ...out.moreEmoji, ...out.planEmoji, ...out.nutritionEmoji]
      .filter((t) => EMOJI_RE.test(t)).length && 'emoji still rendered'
  ].filter(Boolean);
  if (fatal.length) { console.error('FAIL:', fatal.join(' | ')); process.exit(1); }
  console.log('PASS');
}

main().catch((e) => { console.error(e); process.exit(1); });
