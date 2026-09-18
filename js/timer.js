/* ==========================================================================
   timer.js — rest timer.
   Driven by an absolute end timestamp rather than a decrementing counter, so
   it stays correct when the screen sleeps, the tab is backgrounded, or the
   PWA is resumed minutes later. State survives a reload via localStorage.
   ========================================================================== */

import { $, buzz } from './ui.js';
import { fmtTime } from './logic.js';

const KEY = 'ironlog.timer';

const state = {
  endAt: 0,      // epoch ms
  total: 0,      // seconds originally set
  label: 'מנוחה',
  fired: false,
  tick: null
};

let dock, read, labelEl, fill, skipBtn;

function bind() {
  if (dock) return;
  dock = $('#timerDock');
  read = $('#timerRead');
  labelEl = $('#timerLabel');
  fill = $('#timerFill');
  skipBtn = $('#timerSkip');

  skipBtn.addEventListener('click', stop);
  dock.querySelectorAll('[data-add]').forEach((b) => {
    b.addEventListener('click', () => add(Number(b.dataset.add)));
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
}

export function stop() {
  bind();
  state.endAt = 0;
  state.fired = false;
  persist();
  clearInterval(state.tick);
  state.tick = null;
  dock.hidden = true;
  dock.classList.remove('over');
}

export function add(seconds) {
  bind();
  if (!state.endAt) return;
  state.endAt += seconds * 1000;
  state.total += seconds;
  state.fired = false;
  dock.classList.remove('over');
  persist();
  render();
}

export const isRunning = () => state.endAt > 0;

function render() {
  if (!state.endAt) return;
  const remainMs = state.endAt - Date.now();
  const remain = remainMs / 1000;

  if (remain <= 0) {
    if (!state.fired) {
      state.fired = true;
      buzz([0, 220, 90, 220]);
      dock.classList.add('over');
      labelEl.textContent = 'המנוחה הסתיימה — קדימה';
      notify();
    }
    read.textContent = `+${fmtTime(-remain)}`;
    fill.style.width = '100%';
    // Auto-dismiss after two idle minutes so the dock does not linger.
    if (-remain > 120) stop();
    return;
  }

  read.textContent = fmtTime(remain);
  labelEl.textContent = state.label;
  fill.style.width = `${Math.max(0, Math.min(100, (1 - remain / state.total) * 100))}%`;
}

function notify() {
  try {
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      new Notification('IRONLOG', { body: 'המנוחה הסתיימה — לסט הבא', silent: false, tag: 'rest' });
    }
  } catch { /* not available */ }
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
    render();
    state.tick = setInterval(render, 250);
  } catch { /* ignore */ }
}

document.addEventListener('visibilitychange', () => { if (!document.hidden && state.endAt) render(); });
