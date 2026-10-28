/* IRONLOG service worker — offline-first shell cache.

   Keep VERSION in step with BUILD in js/version.js; tools/e2e10.mjs fails the
   build if they drift, because the number shown in Settings is the only way
   anyone can tell from a phone whether an update actually landed. */
const VERSION = 'ironlog-v5.16.0';

/* Every request for code goes out with the browser's HTTP cache bypassed.
   Without this the service worker's "network-first" rule is a lie: fetch()
   is answered by the HTTP cache first, so a phone that once stored app.js
   under a long max-age keeps running last month's build no matter how many
   times it reloads. Revalidating costs one 304. */
const fresh = (url) => new Request(url, { cache: 'reload', credentials: 'same-origin' });
const IMG_INDEX = './img/ex/index.json';

/* Quick add from a notification button: the same code the app uses. */
importScripts('./js/sw-quick.js');
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/db.js',
  './js/ui.js',
  './js/session.js',
  './js/exercises.js',
  './js/programs.js',
  './js/logic.js',
  './js/timer.js',
  './js/food.js',
  './js/ai.js',
  './js/posture.js',
  './js/calendar.js',
  './js/anatomy.js',
  './js/media.js',
  './js/ex-images.js',
  './js/figure.js',
  './js/version.js',
  './js/chart.js',
  './js/onboarding.js',
  './js/gdrive.js',
  './js/cloud.js',
  './js/player.js',
  './js/login.js',
  './js/rest.js',
  './js/cardio.js',
  './js/screen-cardio.js',
  './js/body.js',
  './js/progress.js',
  './js/quick.js',
  './js/sw-quick.js',
  './js/reminders.js',
  './js/feed.js',
  './js/body-paths.js',
  './js/screen-home.js',
  './js/screen-workout.js',
  './js/screen-plan.js',
  './js/screen-history.js',
  './js/screen-settings.js',
  './js/screen-nutrition.js',
  './js/screen-more.js',
  './js/screen-coach.js',
  './js/screen-posture.js',
  './js/screen-summary.js',
  './js/screen-library.js',
  './js/screen-body.js',
  './icons/icon.svg',
  './icons/logo.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/sc-water.png',
  './icons/sc-food.png',
  './icons/sc-saved.png',
  './icons/sc-workout.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(SHELL.map(fresh)))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('[sw] precache partial', err))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => warmImages())
  );
});

/**
 * Pull the exercise photos into the cache after the shell is live.
 * Done in small batches and after activation so the first load stays fast,
 * but the whole set is on the phone before it ever loses signal.
 */
async function warmImages() {
  try {
    const cache = await caches.open(VERSION);
    const missing = [];

    const res = await fetch(IMG_INDEX, { cache: 'no-cache' });
    if (res.ok) {
      for (const f of await res.json()) {
        const url = `./img/ex/${f}`;
        if (!(await cache.match(url))) missing.push(url);
      }
    }
    for (let i = 0; i < missing.length; i += 8) {
      await Promise.allSettled(missing.slice(i, i + 8).map((u) => cache.add(u)));
    }
  } catch (err) {
    console.warn('[sw] image warm skipped', err);
  }
}

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
  /* Settings asks the *running worker* what it is, rather than trusting the
     page's own constant: if the two disagree the update is half-applied, and
     that is exactly the state worth being able to see from a phone. */
  if (e.data === 'version') e.source?.postMessage({ swVersion: VERSION });
  /* The same path a notification button takes, reachable from a page —
     how tools/e2e19.mjs exercises it, since no test can tap a real
     notification. It only ever does what that button does. */
  if (e.data?.type === 'notification-action') {
    e.waitUntil(notificationAction(e.data.action, e.data.data || {}, e.data.tag || ''));
  }
});

/* ---------- reminders ----------
   Sent by the site's server once an hour (netlify/functions/push-tick.js)
   when the day is behind on water or protein. A tap opens the nutrition
   screen — in the app window that is already open, if there is one. */
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'IRONLOG', {
    body: d.body || '',
    tag: d.tag || 'ironlog',
    renotify: true,
    dir: 'rtl',
    lang: 'he',
    icon: './icons/icon-192.png',
    /* "שתיתי כוס" on a water reminder, "הוספת מאכל" on a protein one */
    actions: Array.isArray(d.actions) ? d.actions.slice(0, 2) : [],
    data: { url: d.url || './#/nutrition' }
  }));
});

/** Bring the app forward on a URL — the open window if there is one. */
function openApp(url) {
  const href = new URL(url, self.registration.scope).href;
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
    const win = wins.find((w) => 'focus' in w);
    if (win) return win.focus().then((w) => (w || win).navigate?.(href)).catch(() => {});
    return self.clients.openWindow(href);
  });
}

/**
 * What a notification button does.
 * · water — one glass on today, written here with the app closed; the open
 *   app (if any) is told to refresh, the reminders server hears the new
 *   total, and the notification is replaced by today's updated numbers.
 * · food — open the app straight on adding food (?quick=food).
 * · anything else (a tap on the body) — open the notification's page.
 */
async function notificationAction(action, data, tag) {
  if (action === 'water') {
    const rec = await IronlogQuick.addWater(IronlogQuick.GLASS_ML);
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    wins.forEach((w) => w.postMessage({ type: 'day-changed' }));
    await IronlogQuick.syncProgress(rec).catch(() => false);
    const st = await IronlogQuick.status();
    if (data.quick || st.card) {
      const { title, options } = await IronlogQuick.cardNotification();
      await self.registration.showNotification(title, options);
    } else {
      await self.registration.showNotification('נוספה כוס מים', {
        body: st.text, tag: tag || 'ironlog-water', silent: true, dir: 'rtl', lang: 'he',
        icon: './icons/icon-192.png', data: { url: './index.html#/nutrition' }
      });
    }
    return;
  }
  if (action === 'food') return openApp('./index.html?quick=food#/nutrition');
  return openApp(data.url || './index.html#/nutrition');
}

self.addEventListener('notificationclick', (e) => {
  const data = e.notification.data || {};
  const tag = e.notification.tag;
  /* The quick card is replaced, not dismissed, by its water button. */
  if (!(e.action === 'water' && data.quick)) e.notification.close();
  e.waitUntil(notificationAction(e.action, data, tag));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  /* The API is live state, not a shell asset: caching the coach's discovery
     reply would freeze the app on whatever the server said the first time. */
  if (url.pathname.startsWith('/api/')) return;

  // Navigation: network-first with cached shell fallback (keeps app usable offline).
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(fresh(req.url))
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  /* Code and markup: network-first. A stale image is invisible; stale JS is
     a bug report from someone who can't see why the app won't update. Only
     what's actually new-and-unreachable falls back to cache. */
  if (/\.(?:js|css|webmanifest|html)$/.test(url.pathname) || url.pathname === '/') {
    e.respondWith(
      fetch(fresh(req.url))
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Everything else (photos, icons): cache-first, refresh in background.
  // These don't change once shipped, so there's nothing stale to chase.
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});
