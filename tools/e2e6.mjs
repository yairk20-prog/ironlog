/* v3 flows: login gate, demo player window, emoji-free chrome, square geometry,
   anatomical muscle map. */
import pw from '/home/claude/.npm-global/lib/node_modules/playwright/index.js';
const { chromium } = pw;

const BASE = 'http://localhost:8777/index.html';
const shot = (p, n) => p.screenshot({ path: `/home/claude/gym/tools/shots6/${n}.png` });
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

async function main() {
  const browser = await chromium.launch();
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

  /* ---------- 4. the demo player ---------- */
  await page.getByRole('button', { name: /התחל אימון/ }).click();
  await page.waitForTimeout(700);
  out.mediaPlayBadge = await page.locator('.ex-media-play').count();
  await page.locator('.ex-media-play').click();
  await page.waitForSelector('.player', { timeout: 6000 });
  await page.waitForTimeout(700);
  await shot(page, '06-player-demo');

  out.playerTabs = await page.locator('.pl-tab').allInnerTexts();
  out.playerTitle = await page.locator('.pl-title').innerText();
  out.stageImages = await page.locator('.pl-stage img').count();
  out.stageLoaded = await page.locator('.pl-stage img').first()
    .evaluate((i) => i.complete && i.naturalWidth > 0);

  /* the loop actually advances: poll for both frames showing over 3s */
  const seen = new Set();
  for (let i = 0; i < 30; i++) {
    seen.add(await page.locator('.pl-stage img.on').getAttribute('alt'));
    if (seen.size > 1) break;
    await page.waitForTimeout(100);
  }
  out.framesSeen = [...seen];
  out.loopAdvances = seen.size > 1;

  /* play/pause holds the frame */
  await page.locator('.pl-play').click();
  await page.waitForTimeout(150);
  const paused = await page.locator('.pl-stage img.on').getAttribute('alt');
  await page.waitForTimeout(1600);
  out.pauseHolds = paused === (await page.locator('.pl-stage img.on').getAttribute('alt'));

  /* speed control */
  await page.locator('.pl-speeds .chip').last().click();
  out.speedSelected = await page.locator('.pl-speeds .chip.on').innerText();

  /* video tab: no link-out, an embed once a URL is saved */
  await page.locator('.pl-tab', { hasText: 'וידאו' }).click();
  await page.waitForTimeout(400);
  out.videoAsksForLink = await page.locator('.pl-empty').count();
  await shot(page, '07-player-video-empty');

  await page.locator('.pl-video input').fill('https://www.youtube.com/watch?v=vthMCtgVtFw');
  await page.locator('.pl-video .btn.primary').click();
  await page.waitForTimeout(600);
  out.embedSrc = await page.locator('.video-frame iframe').getAttribute('src').catch(() => null);
  await shot(page, '08-player-video-embed');

  /* the saved video survives reopening */
  await page.locator('.pl-close').click();
  await page.waitForTimeout(250);
  await page.locator('.ex-media-play').click();
  await page.waitForSelector('.player', { timeout: 5000 });
  await page.locator('.pl-tab', { hasText: 'וידאו' }).click();
  await page.waitForTimeout(500);
  out.embedPersisted = await page.locator('.video-frame iframe').count();
  await page.locator('.pl-close').click();
  await page.waitForTimeout(250);
  out.playerClosed = await page.locator('.player').count();

  /* ---------- 5. muscle map is anatomical, not a cartoon ---------- */
  out.workoutEmoji = await visibleEmoji(page);
  await page.locator('.chip', { hasText: 'שרירים' }).click();
  await page.waitForTimeout(700);
  out.mmFigures = await page.locator('.mm-figure').count();
  out.mmPaths = await page.locator('.mm-figure path').count();
  out.mmPrimary = await page.locator('.mm-primary').count();
  out.mmHeight = await page.locator('.mm-figure').first().evaluate((n) => Math.round(n.getBoundingClientRect().height));
  out.detailPlayerButton = await page.locator('.sheet .btn.primary').count();
  await shot(page, '09-muscle-map');
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
    !out.loopAdvances && 'demo loop does not advance',
    !out.pauseHolds && 'pause does not hold the frame',
    !out.embedSrc?.includes('youtube-nocookie.com/embed/vthMCtgVtFw') && 'video not embedded in-app',
    out.embedPersisted !== 1 && 'saved video did not persist',
    out.playerClosed !== 0 && 'player did not close',
    out.mmFigures !== 2 && 'muscle map missing a view',
    out.mmHeight < 120 && 'muscle map collapsed',
    out.roundedElements.length && `rounded corners: ${out.roundedElements.join(', ')}`,
    [...out.onbEmoji, ...out.homeEmoji, ...out.workoutEmoji, ...out.moreEmoji, ...out.planEmoji, ...out.nutritionEmoji]
      .filter((t) => EMOJI_RE.test(t)).length && 'emoji still rendered'
  ].filter(Boolean);
  if (fatal.length) { console.error('FAIL:', fatal.join(' | ')); process.exit(1); }
  console.log('PASS');
}

main().catch((e) => { console.error(e); process.exit(1); });
