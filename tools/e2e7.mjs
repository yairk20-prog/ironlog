/* The hosted coach: with a server key present the app must work with no key
   from the user, and with none present it must fall back to asking for one.
   Run twice — once against `COACH=1 node tools/serve.mjs`, once without. */
import pw from 'playwright';
import { LAUNCH, localOnly } from './launch.mjs';

const { chromium } = pw;

const ROOT = new URL('..', import.meta.url).pathname;
const BASE = 'http://localhost:8777/index.html';
const HOSTED = process.env.COACH === '1';
const shot = (p, n) => p.screenshot({ path: `${ROOT}tools/shots7/${n}.png` });
const errors = [];
const out = { mode: HOSTED ? 'hosted' : 'bring-your-own-key' };

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

  /* The proxy must never receive an API key from the browser. */
  const proxyPosts = [];
  page.on('request', (r) => {
    if (r.url().endsWith('/api/coach') && r.method() === 'POST') {
      proxyPosts.push({ headers: r.headers(), body: r.postData() || '' });
    }
  });

  await page.goto(BASE, { waitUntil: 'load' });
  await page.locator('.login .btn', { hasText: 'המשך בלי חשבון' }).click();
  await page.waitForSelector('.onb', { timeout: 8000 });
  for (let i = 0; i < 12 && (await page.locator('.onb').count()); i++) {
    await page.locator('.onb-foot .btn.primary').click();
    await page.waitForTimeout(260);
  }
  await page.waitForTimeout(500);

  /* ---------- settings says which mode is live ---------- */
  await page.goto(`${BASE}#/settings`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  out.keyFieldShown = await page.locator('input[placeholder="sk-ant-…"]').count();
  out.hostedNotice = await page.locator('b', { hasText: 'המאמן פעיל' }).count();
  await shot(page, HOSTED ? '01-settings-hosted' : '01-settings-byok');

  /* ---------- the coach screen ---------- */
  await page.goto(`${BASE}#/coach`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  const input = page.locator('#view textarea, #view input[type="text"]').first();
  out.coachInput = await input.count();

  if (out.coachInput) {
    await input.fill('מה לעשות היום?');
    const send = page.locator('#view button').filter({ hasText: /שלח|שאל/ }).first();
    if (await send.count()) {
      await send.click();
      await page.waitForTimeout(1600);
    }
  }
  out.coachText = (await page.locator('#view').innerText()).slice(0, 240);
  await shot(page, HOSTED ? '02-coach-hosted' : '02-coach-byok');

  out.proxyPosts = proxyPosts.length;
  out.proxySentApiKeyHeader = proxyPosts.some((p) => 'x-api-key' in p.headers);
  out.proxyBodyHasKey = proxyPosts.some((p) => /sk-ant/.test(p.body));
  out.proxyBodyHasDevice = proxyPosts.every((p) => /"device"\s*:\s*"dev_/.test(p.body));

  out.errors = errors;
  console.log(JSON.stringify(out, null, 2));
  await browser.close();

  const fatal = [
    out.proxySentApiKeyHeader && 'the browser sent an API key to the proxy',
    out.proxyBodyHasKey && 'an API key appeared in the proxy request body',
    HOSTED && out.hostedNotice !== 1 && 'settings did not report the hosted coach',
    HOSTED && out.keyFieldShown !== 0 && 'settings still asks for a key when one is hosted',
    HOSTED && out.proxyPosts === 0 && 'the coach did not go through the proxy',
    HOSTED && !out.proxyBodyHasDevice && 'the proxy request carried no device id to meter',
    !HOSTED && out.keyFieldShown !== 1 && 'settings did not offer the key field',
    !HOSTED && out.hostedNotice !== 0 && 'settings claimed a hosted coach that is not there',
    !HOSTED && out.proxyPosts !== 0 && 'called the proxy with no hosted coach'
  ].filter(Boolean);
  if (fatal.length) { console.error('FAIL:', fatal.join(' | ')); process.exitCode = 1; return; }
  console.log('PASS');
}

/* process.exit() truncates a pipe mid-write, which silently ate the one
   line explaining the failure whenever a suite ran under the runner. */
main().catch((e) => { console.error('FATAL', e); process.exitCode = 2; });
