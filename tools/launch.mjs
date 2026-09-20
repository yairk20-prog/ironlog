/* ==========================================================================
   launch.mjs — one place that says how the test browser is started.

   Chromium talks to several Google endpoints of its own accord — component
   updates, autofill, sign-in state — none of which have anything to do with
   this app. In a sandbox whose egress *hangs* on a denied connection rather
   than refusing it, those background calls can stall a suite for minutes and
   look exactly like a failing test. Turn them off.
   ========================================================================== */
import fs from 'node:fs';

const PINNED = '/opt/pw-browsers/chromium';

export const LAUNCH = {
  /* Use the preinstalled browser where there is one, and let Playwright find
     its own otherwise, so the suites run unchanged on a normal machine. */
  ...(fs.existsSync(PINNED) ? { executablePath: PINNED } : {}),
  args: [
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-sync',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=OptimizationHints,Translate,AutofillServerCommunication,MediaRouter'
  ]
};

/** Block everything that is not the local server, answering empty rather than
    aborting — an aborted request logs a console error, and these suites treat
    console errors as failures. */
export async function localOnly(ctx) {
  await ctx.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith('http://localhost') || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
    return route.fulfill({ status: 200, contentType: 'text/plain', body: '' });
  });
}
