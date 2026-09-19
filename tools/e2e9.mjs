/* v5: the drawn figure, the rebuilt timer dock, meals, and the swipe feed. */
import pw from 'playwright';
const { chromium } = pw;

const ROOT = new URL('..', import.meta.url).pathname;
const BASE = 'http://localhost:8777/index.html';
const shot = (p, n) => p.screenshot({ path: `${ROOT}tools/shots9/${n}.png` });
const errors = [];
const out = {};

const swipeUp = async (page) => {
  const box = await page.locator('.feed-track').boundingBox();
  const x = box.x + box.width / 2;
  await page.mouse.move(x, box.y + box.height * 0.75);
  await page.mouse.down();
  await page.mouse.move(x, box.y + box.height * 0.25, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(600);
};

async function main() {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({
    viewport: { width: 414, height: 896 }, deviceScaleFactor: 2,
    locale: 'he-IL', hasTouch: true, isMobile: true
  });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(BASE, { waitUntil: 'load' });
  await page.locator('.login .btn', { hasText: 'המשך בלי חשבון' }).click();
  await page.waitForSelector('.onb');
  for (let i = 0; i < 12 && (await page.locator('.onb').count()); i++) {
    await page.locator('.onb-foot .btn.primary').click();
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(500);

  /* ---------- 1. the demo has a body — drawn figure, or two real photos ---------- */
  await page.getByRole('button', { name: /התחל אימון/ }).click();
  await page.waitForTimeout(900);
  const isPhotoDemo = await page.locator('.ex-media img').count() > 0;
  out.isPhotoDemo = isPhotoDemo;
  out.bodyShapes = isPhotoDemo ? 8 : await page.locator('.ex-media .fg .fg-body').count();
  out.farShapes = isPhotoDemo ? 8 : await page.locator('.ex-media .fg .fg-far').count();
  out.workedMuscle = isPhotoDemo ? 1 : await page.locator('.ex-media .fg .fg-work').count();
  out.strokedLimbs = isPhotoDemo ? 0 : await page.locator('.ex-media .fg .fg-limb').count();
  await shot(page, '01-figure');

  /* ---------- 2. depth ---------- */
  out.buttonShadow = await page.locator('#view .btn, .set-go').first()
    .evaluate((n) => getComputedStyle(n).boxShadow);
  out.hasElevation = out.buttonShadow !== 'none';

  /* ---------- 3. the dock: clear of the edge, draggable, ±20 ---------- */
  await page.locator('.set-field input').first().fill('60');
  await page.locator('.set-field input').nth(1).fill('8');
  await page.locator('.set-go').first().click();
  await page.waitForTimeout(1200);
  const rc = page.locator('.rest-close');
  if (await rc.count()) { await rc.click(); await page.waitForTimeout(500); }

  const dock = page.locator('#timerDock');
  out.dockVisible = await dock.isVisible();
  out.dockBottom = await dock.evaluate((n) => getComputedStyle(n).bottom);
  out.dockClearOfEdge = parseFloat(out.dockBottom) >= 10;
  out.dockShadow = (await dock.evaluate((n) => getComputedStyle(n).boxShadow)) !== 'none';
  out.dockButtons = await dock.locator('[data-add]').allInnerTexts();
  await shot(page, '02-dock');

  /* drag it down to tuck away, and up to bring it back */
  const grab = await page.locator('#timerGrab').boundingBox();
  await page.mouse.move(grab.x + grab.width / 2, grab.y + 5);
  await page.mouse.down();
  await page.mouse.move(grab.x + grab.width / 2, grab.y + 70, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  out.dockCollapsed = await dock.evaluate((n) => n.classList.contains('collapsed'));

  /* The handle has moved with the dock, so it has to be found again. */
  const grab2 = await page.locator('#timerGrab').boundingBox();
  await page.mouse.move(grab2.x + grab2.width / 2, grab2.y + 5);
  await page.mouse.down();
  await page.mouse.move(grab2.x + grab2.width / 2, grab2.y - 70, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  out.dockExpanded = !(await dock.evaluate((n) => n.classList.contains('collapsed')));

  /* minus twenty takes time off and cannot run past zero */
  const readBefore = await page.locator('#timerRead').innerText();
  await dock.locator('[data-add="-20"]').click();
  await page.waitForTimeout(300);
  out.minusWorks = readBefore !== (await page.locator('#timerRead').innerText());

  /* ---------- 4. the feed ---------- */
  await page.locator('#topbarSlot .btn').first().click();
  await page.waitForSelector('.feed', { timeout: 5000 });
  await page.waitForTimeout(700);
  out.feedCards = await page.locator('.feed-card').count();
  out.feedFirstCount = (await page.locator('.feed-count').innerText()).trim();
  out.feedHasFigure = (await page.locator('.feed-card.on .fg .fg-body').count())
    || (await page.locator('.feed-card.on img').count());
  out.feedHasInputs = await page.locator('.feed-card.on input').count();
  await shot(page, '03-feed-exercise');

  await swipeUp(page);
  out.feedAfterSwipe = (await page.locator('.feed-count').innerText()).trim();
  out.feedMoved = out.feedFirstCount !== out.feedAfterSwipe;
  out.restCardShown = await page.locator('.feed-card.on.feed-rest').count();
  await shot(page, '04-feed-rest');

  /* logging from the feed writes to the same place as the list */
  await page.locator('.feed-close').click();
  await page.waitForTimeout(600);
  await page.locator('#topbarSlot .btn').first().click();
  await page.waitForSelector('.feed');
  await page.waitForTimeout(600);
  out.feedRemembersLog = await page.locator('.feed-set.done').count();

  await page.locator('.feed-card.on input').nth(2).fill('62.5');
  await page.locator('.feed-card.on input').nth(3).fill('7');
  await page.locator('.feed-card.on .feed-tick').nth(1).click();
  await page.waitForTimeout(700);
  out.feedLogged = await page.locator('.feed-set.done').count();
  await page.locator('.feed-close').click();
  await page.waitForTimeout(700);
  out.listAgrees = await page.locator('.set.done').count();

  /* ---------- 5. meals ---------- */
  await page.goto(`${BASE}#/nutrition`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  out.mealCards = await page.locator('.meal').count();
  out.mealNow = await page.locator('.meal.now').count();
  out.mealPluses = await page.locator('.meal-add').count();
  out.guidance = await page.locator('#view .rest-tip').count();
  out.guidanceFirst = (await page.locator('#view .rest-tip b').first().innerText()).trim();
  await shot(page, '05-meals');

  await page.locator('.meal', { hasText: 'ארוחת בוקר' }).locator('.meal-add').click();
  await page.waitForTimeout(500);
  out.sheetTitle = (await page.locator('#sheetTitle').innerText()).trim();
  await page.locator('#sheetBody textarea').fill('שתי ביצים וכוס אורז');
  await page.locator('#sheetBody .btn', { hasText: 'הוסף ליום' }).click();
  await page.waitForTimeout(900);
  out.breakfastItems = await page.locator('.meal', { hasText: 'ארוחת בוקר' }).locator('.meal-item').count();
  await shot(page, '06-meal-filled');

  out.errors = errors;
  console.log(JSON.stringify(out, null, 2));
  await browser.close();

  const fatal = [
    out.bodyShapes < 8 && 'the figure has no solid body parts',
    out.farShapes < 8 && 'the figure has no far side',
    !out.workedMuscle && 'the worked muscle is not marked',
    out.strokedLimbs > 0 && 'the figure is still drawn as strokes',
    !out.hasElevation && 'buttons have no elevation',
    !out.dockVisible && 'the rest dock did not appear',
    !out.dockClearOfEdge && `the dock sits ${out.dockBottom} from the edge`,
    !out.dockShadow && 'the dock has no shadow',
    out.dockButtons.join(',') !== '−20,+20' && `dock buttons are ${out.dockButtons.join(',')}`,
    !out.dockCollapsed && 'dragging down did not tuck the dock away',
    !out.dockExpanded && 'dragging up did not bring it back',
    !out.minusWorks && 'minus twenty did nothing',
    out.feedCards < 3 && 'the feed has no cards',
    !out.feedHasFigure && 'the feed card has no figure',
    out.feedHasInputs < 2 && 'the feed card cannot log a set',
    !out.feedMoved && 'swiping did not move the feed',
    !out.restCardShown && 'the rest card is not between exercises',
    out.feedRemembersLog < 1 && 'the feed does not show sets logged in the list',
    out.listAgrees < 2 && 'a set logged in the feed did not reach the list',
    out.mealCards < 5 && 'the day is not split into meals',
    out.mealNow !== 1 && 'no meal is marked as the current one',
    out.mealPluses < 5 && 'meals have no add button',
    out.guidance < 1 && 'there is no goal-based guidance',
    out.breakfastItems < 1 && 'food added to breakfast did not land there'
  ].filter(Boolean);
  if (fatal.length) { console.error('FAIL:', fatal.join(' | ')); process.exit(1); }
  console.log('PASS');
}

main().catch((e) => { console.error('FATAL', e); process.exit(2); });
