/* ==========================================================================
   timer.js — rest timer.
   Driven by an absolute end timestamp rather than a decrementing counter, so
   it stays correct when the screen sleeps, the tab is backgrounded, or the
   PWA is resumed minutes later. State survives a reload via localStorage.
   ========================================================================== */

import { $, buzz, chime, scheduleRestEnd, cancelRestEnd, COUNTDOWN_LEAD } from './ui.js';
import { fmtTime } from './logic.js';

const KEY = 'ironlog.timer';

const state = {
  endAt: 0,      // epoch ms
  total: 0,      // seconds originally set
  label: 'מנוחה',
  fired: false,
  sounded: false, // the 3-2-1 and the alarm are scheduled on the audio clock
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
  state.sounded = false;
  cancelRestEnd();
  persist();
  scheduleNotice();
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
  cancelRestEnd();
  state.sounded = false;
  state.fired = false;
  persist();
  cancelNotice();
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
  state.sounded = false;
  cancelRestEnd();
  dock.classList.remove('over');
  persist();
  scheduleNotice();
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

  /* 3, 2, 1 and the alarm, scheduled once on the audio clock — exact even
     when this tick came late (screen locked), mixed over the music without
     touching it. */
  if (remain > 0 && remain <= COUNTDOWN_LEAD + 1 && !state.sounded) state.sounded = scheduleRestEnd(state.endAt);

  /* A long rest outlives the worker's five-minute wait: hand it over again. */
  if (remain > 5 && bgNotifyOn && Date.now() - lastScheduled > 240000) scheduleNotice();

  if (remain <= 0) {
    if (!state.fired) {
      state.fired = true;
      buzz([0, 220, 90, 220]);
      /* already scheduled on the audio clock — ring it here only if it was not */
      if (!state.sounded) chime();
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

/* On by default (people asked for it: the phone is on a bench, the screen
   is locked) — but only ever with the phone's permission, which is asked
   for from a tap (the rest screen's button, or Settings); switching the
   setting off has to actually stop them.

   The notification is shown by the service worker, which is told when the
   rest ends: it fires on time with the screen off or the app in the
   background — where this page's own clock is throttled or frozen — and as
   a real notification it plays the phone's notification sound, which
   Android lets through headphones over music. */
let bgNotifyOn = false;
let lastScheduled = 0;
export function setBgNotify(on) {
  bgNotifyOn = on === true;
  if (bgNotifyOn && state.endAt) scheduleNotice();
  else cancelNotice();
}

export function toWorker(msg) {
  try {
    const sw = navigator.serviceWorker;
    if (!sw) return false;
    if (sw.controller) { sw.controller.postMessage(msg); return true; }
    sw.ready.then((reg) => reg.active?.postMessage(msg)).catch(() => {});
    return true;
  } catch { return false; }
}

/** Notifications are on, and the phone allows them. */
export const noticesOn = () => bgNotifyOn && 'Notification' in window && Notification.permission === 'granted';

/**
 * Turn the notifications on: ask the phone, then save the setting.
 * @param {(key:string, value:any) => Promise<void>} save ctx.saveSetting
 * @returns {Promise<string|null>} null when on, else why not (to show)
 */
export async function askNotices(save) {
  if (!('Notification' in window)) return 'הדפדפן הזה לא תומך בהתראות';
  const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission().catch(() => 'denied');
  if (perm !== 'granted') return 'ההתראות נחסמו — אפשר לאשר אותן בהגדרות הטלפון';
  await save('bgNotify', true);
  return null;
}

function scheduleNotice() {
  if (!bgNotifyOn || !state.endAt) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  lastScheduled = Date.now();
  toWorker({ type: 'rest-schedule', endAt: state.endAt, label: state.label });
}

function cancelNotice() {
  lastScheduled = 0;
  toWorker({ type: 'rest-cancel' });
}

/** Without a service worker: the page's own notification, if it is still alive. */
/**
 * The page's own "rest is over" notification, as a second line behind the
 * worker's: a locked phone's page still runs (slowly) for the first
 * minutes, so if the worker's wait was cut short, this one still comes. Same tag, and no
 * renotify — when the worker's has already been shown it is not repeated.
 */
function notify() {
  try {
    if (!noticesOn() || !document.hidden) return;
    const what = String(state.label || '').replace(/^מנוחה\s*·\s*/, '');
    const options = {
      body: what ? `הסט הבא: ${what}` : 'הסט הבא מחכה', tag: 'ironlog-rest', renotify: false, silent: false,
      vibrate: [500, 200, 500, 200, 500], dir: 'rtl', lang: 'he', icon: './icons/icon-192.png',
      data: { url: './index.html#/workout', focusOnly: true }
    };
    if (navigator.serviceWorker) {
      navigator.serviceWorker.ready.then((reg) => reg.showNotification('המנוחה הסתיימה', options)).catch(() => {});
    } else {
      const n = new Notification('המנוחה הסתיימה', options);
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
    scheduleNotice();
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
