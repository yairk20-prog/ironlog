/* Counts the interactive controls on each screen and screenshots it.
   A screen that asks the user to choose between a dozen things is a screen
   that has not decided what it is for. */
import pw from 'playwright';
const { chromium } = pw;

const ROOT = new URL('..', import.meta.url).pathname;
const BASE = 'http://localhost:8777/index.html';
const DIR = `${ROOT}tools/audit`;

const count = (page) => page.evaluate(() => {
  const vis = (n) => {
    const r = n.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(n).visibility !== 'hidden';
  };
  const inView = [...document.querySelectorAll('#view button, #view a, #view input, #view select, #view textarea')].filter(vis);
  const chrome = [...document.querySelectorAll('#topbar button, #tabbar button')].filter(vis);
  return {
    view: inView.length,
    chrome: chrome.length,
    labels: inView.map((n) => (n.innerText || n.placeholder || n.getAttribute('aria-label') || n.type || '').trim().replace(/\s+/g, ' ').slice(0, 26)).filter(Boolean)
  };
});

async function main() {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({
    viewport: { width: 414, height: 896 }, deviceScaleFactor: 2,
    locale: 'he-IL', hasTouch: true, isMobile: true
  });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'load' });

  await page.locator('.login .btn', { hasText: 'המשך בלי חשבון' }).click();
  await page.waitForSelector('.onb', { timeout: 8000 });
  for (let i = 0; i < 12 && (await page.locator('.onb').count()); i++) {
    await page.locator('.onb-foot .btn.primary').click();
    await page.waitForTimeout(240);
  }
  await page.waitForTimeout(600);

  const out = {};
  for (const route of ['home', 'plan', 'nutrition', 'history', 'more', 'settings', 'library', 'body', 'coach', 'posture']) {
    await page.goto(`${BASE}#/${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(750);
    out[route] = await count(page);
    await page.screenshot({ path: `${DIR}/${route}.png`, fullPage: true });
  }

  /* the active workout, which is where the density actually hurts */
  await page.goto(`${BASE}#/home`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /התחל אימון/ }).click();
  await page.waitForTimeout(900);
  out.workout = await count(page);
  await page.screenshot({ path: `${DIR}/workout.png`, fullPage: true });

  console.log(JSON.stringify(out, null, 1));
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
