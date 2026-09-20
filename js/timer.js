/* ==========================================================================
   timer.js — rest timer.
   Driven by an absolute end timestamp rather than a decrementing counter, so
   it stays correct when the screen sleeps, the tab is backgrounded, or the
   PWA is resumed minutes later. State survives a reload via localStorage.
   ========================================================================== */

import { $, buzz, chime } from './ui.js';
import { fmtTime } from './logic.js';

const KEY = 'ironlog.timer';

const state = {
  endAt: 0,      // epoch ms
  total: 0,      // seconds originally set
  label: 'מנוחה',
  fired: false,
  tick: null
};

let dock, read, labelEl, fill, skipBtn, grab;

/** What tapping the countdown should do — the workout screen supplies it. */
let onExpand = null;
export const setExpandHandler = (fn) => { onExpand = fn; };

function bind() {
  if (dock) return;
  dock = $('#timerDock');
  read = $('#timerRead');
  labelEl = $('#timerLabel');
  fill = $('#timerFill');
  skipBtn = $('#timerSkip');
  grab = $('#timerGrab');

  skipBtn.addEventListener('click', stop);
  dock.querySelectorAll('[data-add]').forEach((b) => {
    b.addEventListener('click', (e) => { e.stopPropagation(); add(Number(b.dataset.add)); });
  });

  /* Tapping the clock opens the full rest screen; the dock is the compact
     form of the same thing. */
  $('#timerOpen')?.addEventListener('click', () => {
    if (dock.classList.contains('collapsed')) return expand();
    onExpand?.();
  });

  bindDrag();
}

/* ---------- drag to hide and show ---------- */

const collapse = () => { dock.classList.add('collapsed'); buzz(8); };
const expand = () => { dock.classList.remove('collapsed'); buzz(8); };

/**
 * Drag the dock down to tuck it away and up to bring it back. The handle is
 * the whole grab strip, so it works with a thumb on a phone.
 */
function bindDrag() {
  let startY = 0;
  let dragging = false;
  let collapsedAtStart = false;
  /* A drag ends with a click event; without this the tap-to-expand handler
     below would immediately undo the drag that just happened. */
  let justDragged = false;

  const down = (e) => {
    dragging = true;
    collapsedAtStart = dock.classList.contains('collapsed');
    startY = e.clientY;
    dock.classList.add('dragging');
    grab.setPointerCapture?.(e.pointerId);
  };

  const move = (e) => {
    if (!dragging) return;
    const dy = e.clientY - startY;
    const base = collapsedAtStart ? dock.offsetHeight - 34 : 0;
    /* Resists past the ends rather than tearing free of them. */
    const limited = Math.max(-12, Math.min(dock.offsetHeight - 34, base + dy));
    dock.style.transform = `translateY(${limited}px)`;
  };

  const up = (e) => {
    if (!dragging) return;
    dragging = false;
    dock.classList.remove('dragging');
    dock.style.transform = '';
    const dy = e.clientY - startY;
    justDragged = Math.abs(dy) > 4;
    if (dy > 28) collapse();
    else if (dy < -28) expand();
    else if (Math.abs(dy) < 6) (collapsedAtStart ? expand() : collapse());
    setTimeout(() => { justDragged = false; }, 300);
  };

  grab.addEventListener('pointerdown', down);
  grab.addEventListener('pointermove', move);
  ['pointerup', 'pointercancel'].forEach((ev) => grab.addEventListener(ev, up));

  /* Once it is tucked away the handle is a thin strip at the bottom of the
     screen; anywhere on what is left brings it back. */
  dock.addEventListener('click', (e) => {
    if (justDragged) return;
    if (dock.classList.contains('collapsed') && !e.target.closest('[data-add], .timer-x')) expand();
  });
  grab.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      dock.classList.contains('collapsed') ? expand() : collapse();
    }
  });
}

function persist() {
  try {
    if (state.endAt) {
      localStorage.setItem(KEY, JSON.stringify({ endAt: state.endAt, total: state.total, label: state.label }));
    } else {
      localStorage.removeItem(KEY);
    }
  } catch { /* private mode */ }
}

export function start(seconds, label = 'מנוחה') {
  bind();
  if (!seconds || seconds <= 0) return;
  state.total = seconds;
  state.endAt = Date.now() + seconds * 1000;
  state.label = label;
  state.fired = false;
  persist();
  render();
  if (!state.tick) state.tick = setInterval(render, 250);
  dock.hidden = false;
  dock.classList.remove('collapsed');
  /* The dock floats over the page, so the page has to make room for it —
     otherwise it sits on top of whatever is at the bottom of the card. */
  document.body.classList.add('timer-on');
  keepAwake();
}

export function stop() {
  bind();
  state.endAt = 0;
  releaseWake();
  state.fired = false;
  persist();
  clearInterval(state.tick);
  state.tick = null;
  dock.hidden = true;
  dock.classList.remove('over');
  document.body.classList.remove('timer-on');
  listeners.forEach((fn) => fn(0, 0));
}

export function add(seconds) {
  bind();
  if (!state.endAt) return;
  /* Taking time off must not run the clock past zero from a button press. */
  const left = (state.endAt - Date.now()) / 1000;
  const delta = Math.max(seconds, -Math.max(0, left - 1));
  state.endAt += delta * 1000;
  state.total = Math.max(5, state.total + delta);
  buzz(8);
  state.fired = false;
  dock.classList.remove('over');
  persist();
  render();
}

export const isRunning = () => state.endAt > 0;

/** Seconds left (negative once it has run over) and the span it was set for. */
export const remaining = () => (state.endAt ? (state.endAt - Date.now()) / 1000 : 0);
export const total = () => state.total;

/* The rest screen renders the same countdown in a different place, so it
   subscribes here rather than running a second clock that can drift. */
const listeners = new Set();
export function onTick(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function render() {
  if (!state.endAt) { listeners.forEach((fn) => fn(0, 0)); return; }
  const remainMs = state.endAt - Date.now();
  const remain = remainMs / 1000;

  if (remain <= 0) {
    if (!state.fired) {
      state.fired = true;
      buzz([0, 220, 90, 220]);
      chime();
      dock.classList.add('over');
      labelEl.textContent = 'המנוחה הסתיימה — קדימה';
      notify();
    }
    read.textContent = `+${fmtTime(-remain)}`;
    fill.style.width = '100%';
    listeners.forEach((fn) => fn(remain, state.total));
    // Auto-dismiss after two idle minutes so the dock does not linger.
    if (-remain > 120) stop();
    return;
  }

  read.textContent = fmtTime(remain);
  labelEl.textContent = state.label;
  fill.style.width = `${Math.max(0, Math.min(100, (1 - remain / state.total) * 100))}%`;
  listeners.forEach((fn) => fn(remain, state.total));
}

/* Off by default and only ever turned on from Settings. Browser permission on
   its own is not consent: a site-wide grant made for something else must not
   silently switch this on, and switching the setting back off has to actually
   stop the notifications. */
let bgNotifyOn = false;
export const setBgNotify = (on) => { bgNotifyOn = on === true; };

function notify() {
  try {
    if (!bgNotifyOn) return;
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      const n = new Notification('IRONLOG', { body: `${state.label} הסתיימה — לסט הבא`, silent: false, tag: 'rest' });
      /* Only meaningful while the page/tab is still alive in the background —
         which is the case this notification fires for in the first place
         (document.hidden, not fully terminated). A page the OS has actually
         killed needs a push server to wake back up, which this static site
         does not have. */
      n.onclick = () => { window.focus(); n.close(); };
    }
  } catch { /* not available */ }
}

/* ---------- keep the screen on during rest ----------
   The point is not having to unlock the phone just to check the clock — so
   keep the screen from timing out on its own for as long as a rest is
   running. This cannot, and is not meant to, override someone deliberately
   pressing the power button or switching apps; the Wake Lock spec releases
   itself the moment the page is hidden either way, which is the platform's
   call, not a bug here. Re-acquiring on the next visibilitychange is what
   makes coming back to the app mid-rest resume the same protection. */
let wakeLock = null;

async function keepAwake() {
  try {
    if (!('wakeLock' in navigator) || document.hidden) return;
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch { /* denied, unsupported, or backgrounded mid-request — fine either way */ }
}

function releaseWake() {
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}

/** Restore a timer that was running before a reload. */
export function restore() {
  bind();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!saved?.endAt || saved.endAt - Date.now() < -120000) { localStorage.removeItem(KEY); return; }
    state.endAt = saved.endAt;
    state.total = saved.total || 90;
    state.label = saved.label || 'מנוחה';
    state.fired = false;
    dock.hidden = false;
    document.body.classList.add('timer-on');
    render();
    state.tick = setInterval(render, 250);
    keepAwake();
  } catch { /* ignore */ }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden || !state.endAt) return;
  render();
  if (!wakeLock) keepAwake();
});
