/* ==========================================================================
   app.js — bootstrap, settings, hash router, tab bar.
   Screens are plain modules exporting `render(ctx)` → DOM node, so there is
   no framework and no build step: the browser loads exactly what ships.
   ========================================================================== */

import * as db from './db.js';
import { DEFAULTS } from './programs.js';
import { $, clear, toast, setHaptics } from './ui.js';
import * as timer from './timer.js';

import { render as renderHome } from './screen-home.js';
import { render as renderWorkout, cleanup as cleanupWorkout } from './screen-workout.js';
import { render as renderPlan } from './screen-plan.js';
import { render as renderHistory } from './screen-history.js';
import { render as renderSettings } from './screen-settings.js';
import { render as renderNutrition } from './screen-nutrition.js';
import { render as renderMore } from './screen-more.js';
import { render as renderCoach } from './screen-coach.js';
import { render as renderPosture } from './screen-posture.js';
import { render as renderSummary } from './screen-summary.js';
import { render as renderLibrary } from './screen-library.js';
import { render as renderBody } from './screen-body.js';

const ROUTES = {
  home: { render: renderHome, title: 'היום' },
  plan: { render: renderPlan, title: 'תוכנית' },
  nutrition: { render: renderNutrition, title: 'תזונה' },
  history: { render: renderHistory, title: 'היסטוריה' },
  more: { render: renderMore, title: 'עוד' },
  workout: { render: renderWorkout, cleanup: cleanupWorkout, title: 'אימון', chrome: false },
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
}

async function saveSetting(key, value) {
  ctx.settings[key] = value;
  await db.setSetting(key, value);
  if (key === 'vibrate') setHaptics(value !== false);
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

async function mount(route, { keepScroll = false } = {}) {
  if (rendering) return;
  rendering = true;
  const def = ROUTES[route] || ROUTES.home;
  if (currentRoute !== route) ROUTES[currentRoute]?.cleanup?.();
  currentRoute = route;

  const view = $('#view');
  const scrollY = keepScroll ? window.scrollY : 0;

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
  } finally {
    rendering = false;
    view.hidden = false;
    window.scrollTo({ top: keepScroll ? scrollY : 0, behavior: 'auto' });
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
    t.addEventListener('click', () => go(t.dataset.route));
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

  /* First run: build the plan from a short questionnaire before anything else. */
  if (!ctx.settings.onboarded) {
    const { runOnboarding, applyAnswers } = await import('./onboarding.js');
    const answers = await runOnboarding();
    await applyAnswers(ctx, answers);
    await db.setSetting('rotationCursor', 0);
    await mount('home');
  }

  /* Offline caching only where it can actually work: a real origin we own,
     not a file:// open and not an embedded preview frame. */
  const embedded = window.top !== window.self;
  if ('serviceWorker' in navigator && location.protocol !== 'file:' && !embedded) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('[sw]', e));
  }
}

boot();
