/* ==========================================================================
   install.js — is IRONLOG installed the way that gives home-screen buttons,
   and if not, installing it from inside the app.

   The long-press buttons ("כוס מים", "הוספת מאכל"…) exist only on an app
   installed from Chrome on Android (a WebAPK). An icon added from Samsung
   Internet or Firefox, or as a plain bookmark, has none — and an app
   installed before the buttons existed gets them only when Chrome updates
   it, on its own schedule. Chrome's install offer (beforeinstallprompt) is
   kept here from the moment the page loads, so a button can use it later:
   it installs the app with the buttons at once.
   ========================================================================== */

let offer = null;
const listeners = new Set();
const changed = () => listeners.forEach((fn) => { try { fn(); } catch { /* a closed panel */ } });

window.addEventListener('beforeinstallprompt', (e) => {
  /* our own button asks instead of Chrome's bar at the bottom */
  e.preventDefault();
  offer = e;
  changed();
});
window.addEventListener('appinstalled', () => { offer = null; changed(); });

/** Chrome is offering to install the app (so it is not installed from Chrome yet). */
export const canInstall = () => !!offer;

/** Show Chrome's install dialog. @returns {Promise<'accepted'|'dismissed'|'unavailable'>} */
export async function install() {
  if (!offer) return 'unavailable';
  const e = offer;
  offer = null;
  try {
    await e.prompt();
    const { outcome } = await e.userChoice;
    changed();
    return outcome;
  } catch {
    return 'dismissed';
  }
}

/** Call fn when the install offer appears or goes. @returns {() => void} unsubscribe */
export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Where the app is running, as far as a page can tell.
 * @returns {{os:'android'|'ios'|'other', browser:'chrome'|'samsung'|'firefox'|'other', standalone:boolean}}
 */
export function environment(ua = navigator.userAgent) {
  const os = /android/i.test(ua) ? 'android' : /iphone|ipad|ipod/i.test(ua) ? 'ios' : 'other';
  const browser = /SamsungBrowser/i.test(ua) ? 'samsung'
    : /Firefox|FxiOS/i.test(ua) ? 'firefox'
      : /EdgA|OPR|Opera|YaBrowser|MiuiBrowser|HuaweiBrowser/i.test(ua) ? 'other'
        : /Chrome|CriOS/i.test(ua) ? 'chrome' : 'other';
  const standalone = !!(window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true);
  return { os, browser, standalone };
}

/** How many home-screen buttons the site's manifest offers right now (null: unreachable). */
export async function servedShortcuts() {
  try {
    const m = await fetch('manifest.webmanifest', { cache: 'no-store' }).then((r) => r.json());
    return Array.isArray(m.shortcuts) ? m.shortcuts.length : 0;
  } catch {
    return null;
  }
}

/** The address to install from. */
export const appUrl = () => `${location.origin}${location.pathname.replace(/index\.html$/, '')}`;
