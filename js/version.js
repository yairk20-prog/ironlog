/* ==========================================================================
   version.js — the one string that says which build is running.

   It exists so that "the app didn't update" stops being a guess. Settings
   shows this number next to the one reported by the live service worker; if
   they match and the number is the one that was deployed, the update landed,
   and any remaining problem is in the code, not in a cache.

   Keep BUILD and VERSION in sw.js in step — tools/e2e10.mjs enforces it.
   ========================================================================== */

export const BUILD = '5.5.0';

/** What the service worker currently controlling this page says it is. */
export function swVersion(timeout = 1200) {
  return new Promise((resolve) => {
    const sw = navigator.serviceWorker?.controller;
    if (!sw) return resolve(null);
    const done = (v) => { clearTimeout(t); navigator.serviceWorker.removeEventListener('message', onMsg); resolve(v); };
    const onMsg = (e) => { if (e.data?.swVersion) done(e.data.swVersion); };
    const t = setTimeout(() => done(null), timeout);
    navigator.serviceWorker.addEventListener('message', onMsg);
    try { sw.postMessage('version'); } catch { done(null); }
  });
}
