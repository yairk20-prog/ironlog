/* IRONLOG service worker — offline-first shell cache.

   Keep VERSION in step with BUILD in js/version.js; tools/e2e10.mjs fails the
   build if they drift, because the number shown in Settings is the only way
   anyone can tell from a phone whether an update actually landed. */
const VERSION = 'ironlog-v5.2.0';

/* Every request for code goes out with the browser's HTTP cache bypassed.
   Without this the service worker's "network-first" rule is a lie: fetch()
   is answered by the HTTP cache first, so a phone that once stored app.js
   under a long max-age keeps running last month's build no matter how many
   times it reloads. Revalidating costs one 304. */
const fresh = (url) => new Request(url, { cache: 'reload', credentials: 'same-origin' });
const IMG_INDEX = './img/ex/index.json';
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
  './icons/icon-192.png',
  './icons/icon-512.png'
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
