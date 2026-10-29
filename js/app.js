/* ==========================================================================
   app.js — bootstrap, settings, hash router, tab bar.
   Screens are plain modules exporting `render(ctx)` → DOM node, so there is
   no framework and no build step: the browser loads exactly what ships.
   ========================================================================== */

import * as db from './db.js';
/* first, so Chrome's install offer is caught whenever it comes */
import './install.js';
import { DEFAULTS } from './programs.js';
import { $, clear, toast, setHaptics, setSoundAlert, historySettled } from './ui.js';
import * as timer from './timer.js';
import { BUILD } from './version.js';

import { render as renderHome } from './screen-home.js';
import { render as renderWorkout, cleanup as cleanupWorkout } from './screen-workout.js';
import { render as renderPlan } from './screen-plan.js';
import { render as renderHistory } from './screen-history.js';
import { render as renderSettings } from './screen-settings.js';
import { render as renderNutrition, cleanup as cleanupNutrition } from './screen-nutrition.js';
import { render as renderMore } from './screen-more.js';
import { render as renderCoach } from './screen-coach.js';
import { render as renderPosture } from './screen-posture.js';
import { render as renderSummary } from './screen-summary.js';
import { render as renderLibrary } from './screen-library.js';
import { render as renderBody } from './screen-body.js';
import { render as renderCardio, cleanup as cleanupCardio } from './screen-cardio.js';

const ROUTES = {
  home: { render: renderHome, title: 'היום' },
  plan: { render: renderPlan, title: 'תוכנית' },
  nutrition: { render: renderNutrition, cleanup: cleanupNutrition, title: 'תזונה' },
  history: { render: renderHistory, title: 'התקדמות' },
  more: { render: renderMore, title: 'עוד' },
  workout: { render: renderWorkout, cleanup: cleanupWorkout, title: 'אימון', chrome: false },
  cardio: { render: renderCardio, cleanup: cleanupCardio, title: 'אירובי', chrome: false },
  settings: { render: renderSettings, title: 'הגדרות', back: 'more' },
  coach: { render: renderCoach, title: 'מאמן אישי', back: 'more' },
  posture: { render: renderPosture, title: 'יציבה', back: 'more' },
  summary: { render: renderSummary, title: 'סיכום אימון', back: 'home' },
  library: { render: renderLibrary, title: 'ספריית תרגילים', back: 'more' },
  body: { render: renderBody, title: 'מדידות גוף', back: 'more' }
};

/** Shared context handed to every screen. */
export const ctx = {
  settings: { ...DEFAULTS },
  db,
  timer,
  go,
  reload,
  setTitle,
  setActions,
  saveSetting
};

let currentRoute = 'home';
let rendering = false;
let backTo = null;

/* ---------- settings ---------- */

async function loadSettings() {
  const stored = await db.settingsAll();
  ctx.settings = { ...DEFAULTS, ...stored };
  setHaptics(ctx.settings.vibrate !== false);
  setSoundAlert(ctx.settings.soundAlert !== false);
  timer.setBgNotify(ctx.settings.bgNotify === true);
  applyTheme(ctx.settings.themeColor);
}

async function saveSetting(key, value) {
  ctx.settings[key] = value;
  await db.setSetting(key, value);
  if (key === 'vibrate') setHaptics(value !== false);
  if (key === 'soundAlert') setSoundAlert(value !== false);
  if (key === 'bgNotify') timer.setBgNotify(value === true);
  if (key === 'themeColor') applyTheme(value);
}

/** The one accent colour, and everything derived from it, live as CSS custom
    properties — every rule and inline style already reads var(--accent), so
    changing the root variables re-themes the whole app with no re-render. */
function applyTheme(hex) {
  const color = hex || DEFAULTS.themeColor;
  document.documentElement.style.setProperty('--accent', color);
  document.documentElement.style.setProperty('--accent-dim', toRgba(color, 0.14));
}

function toRgba(hex, alpha) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return `rgba(255,92,0,${alpha})`;
  const [r, g, b] = m.slice(1).map((h) => parseInt(h, 16));
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ---------- chrome ---------- */

function setTitle(title, sub = '') {
  $('#topbarTitle').textContent = title;
  $('#topbarSub').textContent = sub;
}

function setActions(nodes = []) {
  const slot = clear($('#topbarSlot'));
  [].concat(nodes).filter(Boolean).forEach((n) => slot.appendChild(n));
}

function syncTabs(route) {
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('on', t.dataset.route === route);
  });
}

/* ---------- routing ---------- */

export function go(route, opts = {}) {
  /* A sheet that was just closed is still taking its history entry back;
     changing the hash before that lands would be undone by it. */
  historySettled().then(() => navigate(route, opts));
}

function navigate(route, opts = {}) {
  const target = ROUTES[route] ? route : 'home';
  if (location.hash !== `#/${target}`) {
    if (opts.replace) location.replace(`#/${target}`);
    else location.hash = `#/${target}`;
    return; // hashchange drives the render
  }
  mount(target);
}

export function reload() {
  mount(currentRoute, { keepScroll: true });
}

/* A navigation that arrives mid-render is kept, not dropped — otherwise two
   quick taps leave the URL on one screen and the view on another. Only the
   latest one matters, so it simply replaces any earlier one waiting. */
let queued = null;

/* ---------- moving between screens ----------
   Tabs slide in the direction of the tab tapped; a deeper screen slides in
   and slides back out the way it came; a refresh of the same screen (a glass
   of water, a food added) changes in place without replaying any entrance.
   Where the browser has the View Transitions API the old screen and the new
   one animate as two pictures; elsewhere the cards rise in as before. */
const TAB_ORDER = ['home', 'plan', 'nutrition', 'history', 'more'];
const scrollMemory = {};
let restoreNext = false;
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function direction(from, to) {
  const a = TAB_ORDER.indexOf(from), b = TAB_ORDER.indexOf(to);
  if (a >= 0 && b >= 0) return b > a ? 'forward' : 'back';
  if (ROUTES[to]?.back === from || (b < 0 && a >= 0)) return 'forward';
  if (ROUTES[from]?.back === to || (a < 0 && b >= 0)) return 'back';
  return 'fade';
}

async function mount(route, { keepScroll = false } = {}) {
  if (rendering) { queued = { route, keepScroll }; return; }
  rendering = true;
  const def = ROUTES[route] || ROUTES.home;
  const from = currentRoute;
  const changing = from !== route;
  if (changing) {
    scrollMemory[from] = window.scrollY;
    ROUTES[from]?.cleanup?.();
  }
  currentRoute = route;

  const view = $('#view');
  const restore = changing && restoreNext ? (scrollMemory[route] || 0) : 0;
  restoreNext = false;
  const scrollY = keepScroll ? window.scrollY : restore;

  const paint = async () => {
    setTitle(def.title, '');
    setActions([]);
    backTo = def.chrome === false ? 'home' : (def.back || null);
    $('#topbarBack').hidden = !backTo;
    document.body.classList.toggle('no-tabs', def.chrome === false);
    $('#tabbar').hidden = def.chrome === false;
    syncTabs(route);
    try {
      const node = await def.render(ctx);
      clear(view);
      view.appendChild(node);
    } catch (err) {
      console.error('[render]', err);
      clear(view);
      view.appendChild(Object.assign(document.createElement('div'), {
        className: 'empty',
        innerHTML: `<b>שגיאה בטעינת המסך</b><div class="tiny">${String(err.message || err)}</div>`
      }));
    }
    view.hidden = false;
    // 'instant': the stylesheet's smooth scrolling would visibly scroll the restored page into place
    window.scrollTo({ top: scrollY, behavior: 'instant' });
  };

  /* Same screen again: no entrance at all. */
  view.classList.toggle('calm', !changing);
  const animate = changing && !view.hidden && document.startViewTransition && !reducedMotion();

  try {
    if (animate) {
      view.classList.add('calm');
      document.documentElement.dataset.nav = direction(from, route);
      const vt = document.startViewTransition(paint);
      await vt.updateCallbackDone.catch(() => {});
      vt.finished.finally(() => { delete document.documentElement.dataset.nav; });
    } else {
      await paint();
    }
  } finally {
    rendering = false;
    if (queued) {
      const q = queued;
      queued = null;
      mount(q.route, { keepScroll: q.keepScroll });
    }
  }
}

function routeFromHash() {
  const raw = (location.hash || '').replace(/^#\/?/, '').split('?')[0];
  return ROUTES[raw] ? raw : 'home';
}

/* ---------- boot ---------- */

async function boot() {
  try {
    await db.open();
    await loadSettings();
  } catch (err) {
    console.error('[db]', err);
    toast('לא ניתן לפתוח את בסיס הנתונים המקומי', 'bad');
  }

  document.querySelectorAll('.tab').forEach((t) => {
    t.addEventListener('click', () => {
      /* The tab you are on: back to the top, the way every phone app does. */
      if (t.dataset.route === currentRoute) { window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' }); return; }
      /* Another tab: come back to where you left it. */
      restoreNext = true;
      go(t.dataset.route);
    });
  });
  $('#topbarBack').addEventListener('click', () => go(backTo || 'home'));
  window.addEventListener('hashchange', () => mount(routeFromHash()));

  timer.restore();

  await mount(routeFromHash());

  $('#topbar').hidden = false;
  $('#view').hidden = false;
  const boot = $('#boot');
  boot.classList.add('gone');
  setTimeout(() => boot.remove(), 320);

  /* Offline caching, started before anything that waits on the user: the
     questionnaire below blocks until it is answered, and the install prompt
     and image pre-cache should not wait behind it. */
  registerServiceWorker();
  announceUpdate();
  listenForQuickAdds();
  /* Read (and strip) a home-screen shortcut's ?quick= before anything else,
     so even a first run, which ignores it, leaves a clean address. */
  const quickKind = takeQuickParam();

  /* First run: sign in (or decline), then build the plan from the questionnaire. */
  if (!ctx.settings.onboarded) {
    const { runLogin, loginSettled } = await import('./login.js');
    if (!(await loginSettled())) {
      const { mode, account } = await runLogin();
      ctx.settings.authMode = mode;
      if (account) ctx.settings.googleAccount = account;
    }

    const { runOnboarding, applyAnswers } = await import('./onboarding.js');
    const answers = await runOnboarding();
    await applyAnswers(ctx, answers);
    await db.setSetting('rotationCursor', 0);
    await mount('home');
    return;
  }

  await handleQuick(quickKind);
  /* The quick-add card shows today's numbers: redraw it on every open. */
  import('./quick.js').then((q) => q.refreshCard()).catch(() => {});
}

/**
 * A home-screen shortcut opened the app with ?quick=water|food|saved|photo.
 * The parameter is removed from the address *before* acting on it, so a
 * reload — including the one an update triggers — never adds twice.
 */
function takeQuickParam() {
  const params = new URLSearchParams(location.search);
  const kind = params.get('quick');
  if (!kind) return null;
  params.delete('quick');
  const rest = params.toString();
  history.replaceState(history.state, '', `${location.pathname}${rest ? `?${rest}` : ''}${location.hash}`);
  return kind;
}

async function handleQuick(kind) {
  if (!['water', 'food', 'saved', 'photo'].includes(kind)) return;
  if (currentRoute !== 'nutrition') {
    location.hash = '#/nutrition';
    await new Promise((resolve) => setTimeout(resolve, 50));
    while (rendering) await new Promise((resolve) => setTimeout(resolve, 30));
  }
  const { quickAdd } = await import('./screen-nutrition.js');
  await quickAdd(ctx, kind);
}

/** A notification button changed today (the service worker wrote it): show it. */
function listenForQuickAdds() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'day-changed' && ['nutrition', 'home', 'history'].includes(currentRoute)) reload();
  });
}

/**
 * Say so when an update has landed. Every installed copy picks up a new
 * deploy by itself and reloads — which on a phone looks like nothing
 * happened. One toast on the first open of a new build makes it visible.
 */
async function announceUpdate() {
  try {
    const seen = await db.setting('seenBuild', '');
    if (seen === BUILD) return;
    await db.setSetting('seenBuild', BUILD);
    if (seen && ctx.settings.onboarded) toast(`האפליקציה עודכנה לגרסה ${BUILD}`, 'ok');
  } catch { /* a toast is not worth a failed boot */ }
}

/** Only where it can actually work: a real origin, not file:// and not a preview frame. */
function registerServiceWorker() {
  let embedded = false;
  try { embedded = window.top !== window.self; } catch { embedded = true; }
  if (!('serviceWorker' in navigator) || location.protocol === 'file:' || embedded) return;

  /* The worker already takes over immediately on install (skipWaiting +
     clients.claim) — but that only controls *future* requests. A page
     opened before the update, especially a PWA left running for days, keeps
     executing the JS modules it already loaded until something reloads it.
     One reload per new controller closes that gap. */
  /* On a first visit there is no controller yet, and the one that installs is
     serving exactly the code this page already loaded — reloading then buys
     nothing and can interrupt someone halfway through the questionnaire. Only
     a controller *replacing* an earlier one means the page is now stale. */
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded || !hadController) return;
    reloaded = true;
    location.reload();
  });

  navigator.serviceWorker.register('sw.js').then((reg) => {
    /* Browsers only check for a new sw.js on navigation, which a standalone
       PWA that's reopened from its icon (not truly re-navigated) may skip
       for a long time. Foregrounding the app is exactly when "is there an
       update" is worth asking. */
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch((e) => console.warn('[sw]', e));
}

boot();
