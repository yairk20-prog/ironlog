/* v5.20: why the home-screen buttons are missing, and the fix in one tap.

   The long-press buttons exist only on an app installed from Chrome on
   Android. The quick-add panel now checks where it is running and says so:
   · Samsung Internet (or another browser): install from Chrome — with a
     "copy the link" button and the backup note
   · Chrome, not installed (Chrome offers to install): "התקן עכשיו" opens
     Chrome's install dialog — the buttons come with it at once; the same
     button sits in "עוד"
   · Chrome, in the browser while the app is installed: open the app
   · inside the installed app: installed, and what to do if Chrome has not
     added the buttons yet
   · iPhone: not possible there
   and the site really serves the four buttons in its manifest. */
import pw from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { LAUNCH, localOnly } from './launch.mjs';

const { chromium } = pw;
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const ORIGIN = `http://localhost:${process.env.PORT || 8777}`;
const BASE = `${ORIGIN}/index.html`;
const SHOTS = `${ROOT}/tools/shots24`;
fs.mkdirSync(SHOTS, { recursive: true });
const errors = [];
const out = {};
let BROWSER = null;
const pause = (page, ms = 300) => page.waitForTimeout(ms);

const UA = {
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  chrome: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
};

async function onboard(page) {
  await page.locator('.login .btn', { hasText: 'המשך בלי חשבון' }).click();
  await page.waitForSelector('.onb');
  for (let i = 0; i < 20 && (await page.locator('.onb').count()); i++) {
    await page.locator('.onb-foot .btn.primary').click({ timeout: 5000 }).catch(() => {});
    await pause(page, 320);
  }
  await page.waitForFunction(() => !document.querySelector('.onb'), null, { timeout: 10000 });
  await pause(page, 400);
}

/** One phone: open the quick-add panel from "עוד" and read the check. */
async function scenario(name, { ua, standalone = false, offer = false }) {
  const ctx = await BROWSER.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'he-IL', hasTouch: true, isMobile: true, userAgent: ua });
  await localOnly(ctx);
  await ctx.addInitScript(([standalone]) => {
    if (standalone) {
      const mm = window.matchMedia.bind(window);
      window.matchMedia = (q) => (/display-mode:\s*standalone/.test(q) ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} } : mm(q));
    }
    window.__prompted = 0;
  }, [standalone]);
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(BASE, { waitUntil: 'load' });
  await onboard(page);
  if (offer) {
    /* Chrome offers to install: the event the browser fires */
    await page.evaluate(() => {
      const ev = new Event('beforeinstallprompt', { cancelable: true });
      ev.prompt = async () => { window.__prompted += 1; };
      ev.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });
      window.dispatchEvent(ev);
    });
  }
  await page.evaluate(async () => (await import('./js/app.js')).go('more'));
  await page.waitForSelector('.list-link');
  await pause(page, 400);
  const r = {};
  r.moreInstall = await page.locator('.btn', { hasText: 'התקן עכשיו' }).count();
  await page.locator('.list-link', { hasText: 'הוספה מהירה מהמסך הראשי' }).click();
  await page.waitForSelector('#sheetBody .qp-check');
  await pause(page, 500);
  r.tone = (await page.locator('#sheetBody .qp-check').getAttribute('class')).replace('qp-check', '').trim();
  r.title = (await page.locator('#sheetBody .qp-check b').innerText()).trim();
  r.text = (await page.locator('#sheetBody .qp-check small').innerText()).trim();
  r.buttons = (await page.locator('#sheetBody .btn').allInnerTexts()).map((t) => t.trim());
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
  if (offer) {
    await page.locator('#sheetBody .btn', { hasText: 'התקן עכשיו' }).click();
    await pause(page, 600);
    r.prompted = await page.evaluate(() => window.__prompted);
    r.toast = (await page.locator('.toast').last().innerText().catch(() => '')).trim();
    r.afterInstall = (await page.locator('#sheetBody .qp-check b').innerText()).trim();
  }
  r.served = await page.evaluate(async () => (await import('./js/install.js')).servedShortcuts());
  await ctx.close();
  return r;
}

async function main() {
  BROWSER = await chromium.launch(LAUNCH);
  out.samsung = await scenario('samsung', { ua: UA.samsung });
  out.chromeOffer = await scenario('chrome-offer', { ua: UA.chrome, offer: true });
  out.chromeTab = await scenario('chrome-tab', { ua: UA.chrome });
  out.installed = await scenario('installed', { ua: UA.chrome, standalone: true });
  out.iphone = await scenario('iphone', { ua: UA.iphone });
  out.errors = errors;
  console.log(JSON.stringify(out, null, 2));
  await BROWSER.close();

  const fatal = [
    !(out.samsung.tone === 'bad' && /Samsung Internet/.test(out.samsung.title) && /Chrome/.test(out.samsung.text) && /גיבוי/.test(out.samsung.text)) && `Samsung: ${JSON.stringify(out.samsung)}`,
    !out.samsung.buttons.includes('העתק קישור להתקנה') && 'Samsung: no copy-link button',
    !(out.chromeOffer.tone === 'warn' && /לא מותקן/.test(out.chromeOffer.title) && out.chromeOffer.buttons.some((b) => /התקן עכשיו/.test(b))) && `Chrome offer: ${JSON.stringify(out.chromeOffer)}`,
    out.chromeOffer.moreInstall !== 1 && 'no install button in "עוד" when Chrome offers it',
    out.chromeOffer.prompted !== 1 && 'the install button did not open Chrome\'s dialog',
    !/מותקן/.test(out.chromeOffer.toast) && `after installing: ${out.chromeOffer.toast}`,
    /לא מותקן/.test(out.chromeOffer.afterInstall) && 'the check still says "not installed" after installing',
    !(out.chromeTab.tone === 'warn' && /בדפדפן/.test(out.chromeTab.title)) && `Chrome tab: ${JSON.stringify(out.chromeTab)}`,
    out.chromeTab.moreInstall !== 0 && 'an install button with nothing to install',
    !(out.installed.tone === 'ok' && /מותקן/.test(out.installed.title) && /יום-יומיים/.test(out.installed.text)) && `installed: ${JSON.stringify(out.installed)}`,
    !(out.iphone.tone === 'bad' && /אייפון/.test(out.iphone.title)) && `iPhone: ${JSON.stringify(out.iphone)}`,
    out.installed.served !== 4 && `the manifest serves ${out.installed.served} buttons`,
    errors.length && `page errors: ${errors.join(' | ')}`
  ].filter(Boolean);
  if (fatal.length) { console.error('FAIL:', fatal.join(' | ')); process.exitCode = 1; return; }
  console.log('PASS');
}

main().catch(async (e) => {
  console.error('FATAL', e);
  if (BROWSER) await BROWSER.close().catch(() => {});
  process.exitCode = 2;
});
