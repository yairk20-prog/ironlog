/* v5.2: the two things the user reported — the AI's 400 and the app not
   updating on the phone. Both were invisible from inside the app, so what is
   tested here is mostly whether the app can now *tell you* what is wrong. */
import pw from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

import { LAUNCH, localOnly } from './launch.mjs';

const { chromium } = pw;
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const BASE = `http://localhost:${process.env.PORT || 8777}/index.html`;
const shot = (p, n) => p.screenshot({ path: `${ROOT}/tools/shots10/${n}.png` });
const errors = [];
const out = {};

/* ---------- static checks: the deploy config itself ---------- */

const toml = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const version = fs.readFileSync(path.join(ROOT, 'js/version.js'), 'utf8');

/** The header block that applies to a given path pattern. */
const headerFor = (pattern) => {
  const at = toml.indexOf(`for = "${pattern}"`);
  if (at < 0) return '';
  const next = toml.indexOf('[[', at);
  return toml.slice(at, next < 0 ? undefined : next);
};

out.jsHeader = headerFor('/js/*').match(/Cache-Control = "([^"]+)"/)?.[1] || '';
out.cssHeader = headerFor('/css/*').match(/Cache-Control = "([^"]+)"/)?.[1] || '';
out.swHeader = headerFor('/sw.js').match(/Cache-Control = "([^"]+)"/)?.[1] || '';

/* Source files are served under fixed names, so `immutable` tells a phone to
   keep last month's app.js for a year — the exact reported symptom. */
out.jsRevalidates = /must-revalidate/.test(out.jsHeader) && !/immutable/.test(out.jsHeader);
out.cssRevalidates = /must-revalidate/.test(out.cssHeader) && !/immutable/.test(out.cssHeader);

/* A header fixes future visits; already-poisoned devices only escape if the
   worker fetches past the HTTP cache. */
out.swBypassesHttpCache = /cache: 'reload'/.test(sw);
out.swPrecacheIsFresh = /addAll\(SHELL\.map\(fresh\)\)/.test(sw);

const swVer = sw.match(/const VERSION = 'ironlog-v([\d.]+)'/)?.[1] || '';
const build = version.match(/export const BUILD = '([\d.]+)'/)?.[1] || '';
out.swVersion = swVer;
out.build = build;
out.versionsAgree = !!swVer && swVer === build;

/* ---------- live checks ---------- */

async function boot(page) {
  await page.goto(BASE, { waitUntil: 'load' });
  await page.locator('.login .btn', { hasText: 'המשך בלי חשבון' }).click();
  await page.waitForSelector('.onb');
  for (let i = 0; i < 20 && (await page.locator('.onb').count()); i++) {
    await page.locator('.onb-foot .btn.primary').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(320);
  }
  /* Each step swaps the overlay node out and back, so "`.onb` is detached"
     is true for a moment between steps and means nothing on its own. The
     honest finish line is the flag onboarding writes when it is done. */
  await page.waitForFunction(() => !document.querySelector('.onb'), null, { timeout: 10000 });
  await page.waitForSelector('#view .hero, #view .card', { timeout: 8000 });
  await page.waitForTimeout(600);
}

/** Settings groups are collapsed; open the one whose title matches. */
async function openSection(page, title) {
  /* Two things can land between asking for #/settings and getting it: the
     questionnaire reappearing, and — because finishing it mounts the home
     screen rather than the route that was asked for — settings never being
     rendered at all. Both are cured by asking again. */
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto(`${BASE}#/settings`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(700);
    for (let i = 0; i < 12 && (await page.locator('.onb').count()); i++) {
      await page.locator('.onb-foot .btn.primary').click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(320);
    }
    await page.waitForFunction(() => !document.querySelector('.onb'), null, { timeout: 10000 });
    if (await page.locator('.sect-head').count()) break;
    await page.waitForTimeout(500);
  }
  await page.locator('.sect-head', { hasText: title }).click({ timeout: 15000 });
  await page.waitForTimeout(400);
}

async function main() {
  const browser = await chromium.launch(LAUNCH);
  const ctx = await browser.newContext({
    viewport: { width: 414, height: 896 }, deviceScaleFactor: 2,
    locale: 'he-IL', hasTouch: true, isMobile: true
  });
  await localOnly(ctx);

  const page = await ctx.newPage();
  /* The web font is fetched from Google and this sandbox has no route to it.
     A missing font is a fallback, not a failure, so it must not mask the
     errors this suite exists to catch. */
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (/ERR_TUNNEL_CONNECTION_FAILED|fonts\.googleapis\.com|fonts\.gstatic\.com/.test(m.text())) return;
    errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await boot(page);

  /* ---------- the version card ---------- */
  await openSection(page, 'גרסה ועדכונים');
  const versionText = await page.locator('.sect-body', { hasText: 'גרסת האפליקציה' }).first().innerText();
  out.buildShown = versionText.includes(build);
  out.hasForceUpdate = await page.getByRole('button', { name: /אלץ עדכון מלא/ }).count();
  await shot(page, '01-version');

  /* ---------- the AI diagnosis, when the server is refusing ---------- */
  await openSection(page, 'מאמן AI');
  out.hasDiagnoseButton = await page.locator('#aiDiagnose').count();
  if (out.hasDiagnoseButton) {
    await page.locator('#aiDiagnose').click();
    await page.waitForTimeout(900);
    out.diagnosis = (await page.locator('#aiDiagnose').locator('xpath=following-sibling::p[1]').innerText()).trim();
  }
  await shot(page, '02-ai-check');

  /* With COACH=fail the reason must reach the screen, not just a status code. */
  const failing = process.env.COACH === 'fail';
  out.diagnosisExplains = failing
    ? /קרדיט/.test(out.diagnosis || '')
    : /תקין/.test(out.diagnosis || '');
  out.diagnosisIsNotJustAStatus = !/^שגיאת AI \(\d+\)\.?$/.test((out.diagnosis || '').trim());

  out.errors = errors;
  console.log(JSON.stringify(out, null, 2));
  await browser.close();

  const fatal = [
    !out.jsRevalidates && `/js/* is served as "${out.jsHeader}" — a phone will not re-fetch it`,
    !out.cssRevalidates && `/css/* is served as "${out.cssHeader}"`,
    !/must-revalidate/.test(out.swHeader) && 'sw.js may be served stale',
    !out.swBypassesHttpCache && 'the worker still fetches through the HTTP cache',
    !out.swPrecacheIsFresh && 'the precache does not bypass the HTTP cache',
    !out.versionsAgree && `sw.js says ${swVer} but version.js says ${build}`,
    !out.buildShown && 'the build number is not shown in settings',
    !out.hasForceUpdate && 'there is no way to force an update from the app',
    !out.hasDiagnoseButton && 'the hosted coach cannot be diagnosed from the app',
    !out.diagnosisExplains && `the diagnosis did not explain the state: "${out.diagnosis}"`,
    !out.diagnosisIsNotJustAStatus && 'the diagnosis is still only a status code',
    errors.length && `page errors: ${errors.join(' | ')}`
  ].filter(Boolean);
  if (fatal.length) { console.error('FAIL:', fatal.join(' | ')); process.exitCode = 1; return; }
  console.log('PASS');
}

/* process.exit() truncates a pipe mid-write, which silently ate the one
   line explaining the failure whenever a suite ran under the runner. */
main().catch((e) => { console.error('FATAL', e); process.exitCode = 2; });
