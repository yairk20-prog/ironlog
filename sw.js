/* IRONLOG service worker — offline-first shell cache */
const VERSION = 'ironlog-v4.0.0';
const IMG_INDEX = './img/ex/index.json';
const MOTION_INDEX = './img/motion/index.json';
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
  './js/ex-motion.js',
  './js/chart.js',
  './js/onboarding.js',
  './js/gdrive.js',
  './js/cloud.js',
  './js/player.js',
  './js/login.js',
  './js/rest.js',
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
      .then((c) => c.addAll(SHELL))
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

    /* The animated loops matter most offline — that is when there is no
       falling back to anything. */
    const mot = await fetch(MOTION_INDEX, { cache: 'no-cache' });
    if (mot.ok) {
      for (const id of await mot.json()) {
        const url = `./img/motion/${id}.webp`;
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
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // Assets: cache-first, refresh in background.
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
