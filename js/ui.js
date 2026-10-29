/* ==========================================================================
   ui.js — tiny DOM helpers, bottom sheet, toasts, haptics.
   No framework: element creation stays explicit and fast on low-end phones.
   ========================================================================== */

/** Create an element. `attrs.class`, `.html`, `.text`, `on*` handlers, data-*. */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') {
      /* Object.assign silently drops custom properties (--foo): the
         CSSStyleDeclaration proxy only recognizes them through setProperty. */
      for (const [sk, sv] of Object.entries(v)) {
        if (sk.startsWith('--')) node.style.setProperty(sk, sv);
        else node.style[sk] = sv;
      }
    }
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); return node; };

export function icon(path, size = 22, cls = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  if (cls) svg.setAttribute('class', cls);
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = path;
  return svg;
}

export const ICONS = {
  chevron: '<path d="M15 6l-6 6 6 6"/>',
  chevronBack: '<path d="M9 6l6 6-6 6"/>',
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
  chevronUp: '<path d="M6 15l6-6 6 6"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  swap: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
  note: '<path d="M5 4h11l4 4v12H5z"/><path d="M15 4v5h5"/>',
  play: '<path d="M7 4l12 8-12 8z"/>',
  pause: '<path d="M8 4h3v16H8zM13 4h3v16h-3z"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  muscle: '<path d="M4 15c2-1 3-3 4-5s3-3 5-3 4 1 5 3 2 4 2 6a3 3 0 0 1-3 3H8a4 4 0 0 1-4-4z"/><path d="M9 10c1.5 1 3 1.5 5 1.5"/>',
  expand: '<path d="M4 9V4h5M20 15v5h-5M15 4h5v5M9 20H4v-5"/>',
  feed: '<rect x="5" y="3" width="14" height="8"/><rect x="5" y="13" width="14" height="8"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>',
  plate: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>',
  flame: '<path d="M12 3s5 4 5 9a5 5 0 0 1-10 0c0-2 1-3 1-3s1 2 2 2 2-8 2-8z"/>',
  dumbbell: '<path d="M6 8v8M3 10v4M18 8v8M21 10v4M6 12h12"/>',
  trash: '<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/>',
  download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  upload: '<path d="M12 20V9M7 13l5-5 5 5M5 4h14"/>',
  cloud: '<path d="M7 18a4 4 0 0 1 .6-8 5.5 5.5 0 0 1 10.6 1.5A3.5 3.5 0 0 1 17.5 18z"/>',
  sync: '<path d="M4 12a8 8 0 0 1 13.7-5.7L20 8M20 4v4h-4"/><path d="M20 12a8 8 0 0 1-13.7 5.7L4 16M4 20v-4h4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  google: '<path d="M20.6 12.2c0-.6-.1-1.2-.2-1.7H12v3.4h4.8a4.2 4.2 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.7-4 2.7-6.6z"/><path d="M12 21c2.4 0 4.5-.8 6-2.2l-2.9-2.2c-.8.5-1.8.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H3.9v2.3A9 9 0 0 0 12 21z"/><path d="M6.9 13.7a5.4 5.4 0 0 1 0-3.4V8H3.9a9 9 0 0 0 0 8z"/><path d="M12 6.6c1.3 0 2.5.5 3.5 1.4l2.6-2.6A9 9 0 0 0 3.9 8l3 2.3C7.6 8.1 9.6 6.6 12 6.6z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  library: '<path d="M4 5h4v14H4zM10 5h4v14h-4zM17 6l3 13"/>',
  ruler: '<path d="M3 9h18v6H3z"/><path d="M7 9v3M11 9v3M15 9v3M19 9v3"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  spark: '<path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/>',
  arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13" r="4"/>',
  scale: '<path d="M5 7h14l2 13H3z"/><path d="M9 7a3 3 0 0 1 6 0"/>',
  glass: '<path d="M6 3h12l-1.5 17h-9z"/><path d="M6.6 10h10.8"/>',
  cup: '<path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M8 3.5v2.5M12 3.5v2.5"/>',
  /* A figure standing tall, and a figure folded over a reach: the two
     off-plan sessions read instantly as what they are at 22px. */
  posture: '<circle cx="12" cy="4" r="2"/><path d="M12 7v8M8 10h8M9.5 21l2.5-6 2.5 6"/>',
  stretch: '<circle cx="7" cy="4.5" r="2"/><path d="M7 7v5l-2 9M7 12l4 9M7.5 9l8-2.5"/>',
  park: '<path d="M12 3l4 7h-3l4 6h-4v5h-2v-5H7l4-6H8z"/>',
  home: '<path d="M4 11l8-7 8 7"/><path d="M6 10v10h5v-6h2v6h5V10"/>',
  bolt: '<path d="M13 2L5 14h5l-1 8 8-12h-5z"/>',
  run: '<circle cx="15" cy="4" r="2"/><path d="M6 11l3.5-3H14l2 3.5h3.5M14 8l-2.5 6M11.5 14l3 3-1 4.5M11.5 14L8 17.5H4.5"/>',
  bottle: '<path d="M10 2h4v3l2 3v13H8V8l2-3z"/><path d="M8 12h8"/>',
  /* food categories — a shape per macro group, not a photo, so it stays on
     brand with everything else (no emoji, no stock imagery). */
  egg: '<path d="M12 3C8 8 6 13 6 16a6 6 0 0 0 12 0c0-3-2-8-6-13z"/>',
  carton: '<path d="M8 3h8l1 4v13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V7z"/><path d="M7 9h10"/>',
  grain: '<path d="M12 3v18"/><path d="M12 6l-3 2M12 6l3 2M12 10l-3 2M12 10l3 2M12 14l-3 2M12 14l3 2"/>',
  leaf: '<path d="M5 19c8 0 14-6 14-14-8 0-14 6-14 14z"/><path d="M5 19c2-4 5-7 9-9"/>',
  drop: '<path d="M12 3s6 7 6 12a6 6 0 0 1-12 0c0-5 6-12 6-12z"/>',
  candy: '<rect x="8" y="8" width="8" height="8" transform="rotate(45 12 12)"/><path d="M4 4l3 3M20 20l-3-3"/>',
  /* saved foods and free text, on the add-food sheet */
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.1a4.3 4.3 0 0 1 7.5 2.7C19.5 15.4 12 20 12 20z"/>',
  pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>'
};

/* ---------- toast ---------- */

let toastTimer = null;
export function toast(message, kind = '') {
  const box = $('#toaster');
  if (!box) return;
  clear(box);
  box.appendChild(el('div', { class: `toast ${kind}`, text: message }));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => clear(box), 2400);
}

/* ---------- haptics ---------- */

let hapticsOn = true;
export const setHaptics = (on) => { hapticsOn = !!on; };
export function buzz(pattern = 12) {
  if (!hapticsOn) return;
  try { navigator.vibrate?.(pattern); } catch { /* unsupported */ }
}

/* ---------- rest-done chime ----------
   A vibration alone is silent through headphones, and at rest's end that is
   exactly when someone has earbuds in with music. Every sound here is
   generated with Web Audio and mixed on top of whatever is playing — never
   a media clip, which would pause or lower the music; the music must sound
   exactly the same, people asked for exactly that. To be heard over it
   anyway, the beeps sit at 1.7–3.1 kHz, where the ear is most sensitive and
   music has least energy, with square-wave overtones, at full level.

   The audio engine itself is switched on only around a sound — a few
   seconds before the end of a rest, for a chime — and off again right
   after. On some phones (it was reported on a Samsung) a running audio
   engine, even a silent one, is enough for the system to turn other apps'
   music down;
   left running from the first tap, it lowered the music for as long as
   the app was open. Starting it later needs no new tap: the page was
   touched before (the set that started the rest), which is what browsers
   ask for. */
let soundOn = true;
export const setSoundAlert = (on) => { soundOn = !!on; };

let audioCtx = null;
function ensureAudio() {
  if (audioCtx) return audioCtx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  audioCtx = new Ctx();
  /* created suspended until a sound needs it (some browsers start it running) */
  if (!tapOnly && audioCtx.state === 'running') audioCtx.suspend().catch(() => {});
  return audioCtx;
}

/* iPhone: Safari starts the engine only from inside a tap, so there it is
   started on the first tap and left on, as before (a running engine does
   not turn the music down there). */
const tapOnly = /iphone|ipad|ipod/i.test(navigator.userAgent);
if (tapOnly) document.addEventListener('pointerdown', () => { ensureAudio()?.resume().catch(() => {}); }, { once: true });

/* Keep the engine on until `until` (epoch ms), then switch it off again. */
let releaseAt = 0;
let releaseTimer = null;
function hold(until) {
  const ctx = ensureAudio();
  if (!ctx) return null;
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  releaseAt = Math.max(releaseAt, until);
  clearTimeout(releaseTimer);
  releaseTimer = setTimeout(release, Math.max(0, releaseAt - Date.now()));
  return ctx;
}
function release() {
  releaseTimer = null;
  if (Date.now() < releaseAt - 50) { releaseTimer = setTimeout(release, releaseAt - Date.now()); return; }
  releaseAt = 0;
  if (!tapOnly && audioCtx && audioCtx.state === 'running') audioCtx.suspend().catch(() => {});
}
/** Whether the audio engine is on right now (for the tests). */
export const audioRunning = () => !!audioCtx && audioCtx.state === 'running';

/* Everything goes through a limiter set hard, then out at full level: the
   beeps come out as loud as the phone's media volume allows without
   clipping into a crackle. */
let master = null;
function output(ctx) {
  if (master) return master;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.08;
  limiter.connect(ctx.destination);
  master = limiter;
  return master;
}

/** One beep at audio-clock time `at`: a square wave over a sine. @returns its two oscillators */
function beep(ctx, at, freq, dur, level = 1) {
  return [['square', 0.32], ['sine', 0.7]].map(([type, vol]) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(vol * level, at + 0.008);
    gain.gain.setValueAtTime(vol * level, at + dur - 0.02);
    gain.gain.linearRampToValueAtTime(0, at + dur);
    osc.connect(gain).connect(output(ctx));
    osc.start(at);
    osc.stop(at + dur + 0.01);
    return osc;
  });
}

/** The engine, on until `until` — or null when sound is off or unavailable. */
function audioReady(until) {
  if (!soundOn) return null;
  return hold(until);
}

const ALARM_LENGTH = 2.3;   // seconds, the alarm below

/* three rising double beeps, twice */
const ALARM = [0, 1.25].flatMap((round) => [[0, 2093], [0.13, 2093], [0.36, 2637], [0.49, 2637], [0.72, 3136], [0.85, 3136]]
  .map(([dt, f]) => [round + dt, f]));
const PIP = { 3: 1760, 2: 1760, 1: 1976 };

/** The alarm, now. @returns the oscillators it scheduled */
function alarmAt(ctx, t0) {
  return ALARM.flatMap(([dt, f]) => beep(ctx, t0 + dt, f, 0.1));
}

/** Rest is over (or a run changes phase): an alarm, not a ding. */
export function chime() {
  try {
    const ctx = audioReady(Date.now() + (ALARM_LENGTH + 0.5) * 1000);
    if (ctx) alarmAt(ctx, ctx.currentTime + 0.03);
  } catch { /* unsupported or blocked — vibration and the notification still fire */ }
}

/* ---- the end of a rest, on the audio clock ----
   A pip at 3, 2 and 1 seconds left and the alarm at the end are scheduled
   ahead on the AudioContext's own clock, which keeps exact time even when
   the page's timers only wake once a second (screen locked). Scheduled as
   soon as COUNTDOWN_LEAD (+1) seconds are left — whatever is already past
   is skipped — and cancelled when the rest is skipped or changed. */
export const COUNTDOWN_LEAD = 3;
let endNodes = [];

/** @param {number} endAt when the rest ends (epoch ms) @returns {boolean} whether it is scheduled */
export function scheduleRestEnd(endAt) {
  cancelRestEnd();
  try {
    const ctx = audioReady(endAt + (ALARM_LENGTH + 0.5) * 1000);
    if (!ctx) return false;
    const at = (ms) => ctx.currentTime + (ms - Date.now()) / 1000;
    const soon = ctx.currentTime + 0.02;
    for (const n of [3, 2, 1]) {
      const t = at(endAt - n * 1000);
      if (t >= soon) endNodes.push(...beep(ctx, t, PIP[n], 0.1, 0.85));
    }
    endNodes.push(...alarmAt(ctx, Math.max(soon, at(endAt))));
    return true;
  } catch {
    return false;
  }
}

/** The rest was skipped, lengthened or replaced: silence what was scheduled. */
export function cancelRestEnd() {
  if (endNodes.length) { releaseAt = 0; clearTimeout(releaseTimer); releaseTimer = setTimeout(release, 300); }
  endNodes.forEach((osc) => { try { osc.stop(); osc.disconnect(); } catch { /* already done */ } });
  endNodes = [];
}

/* ---------- number fields typed on a phone ---------- */

/**
 * Tapping the field selects what is in it, so what is typed replaces it —
 * no "06" from typing 6 after a 0 or a 3 already in the box — and a leading
 * zero left in front of a number is dropped as it is typed. Call before
 * adding the field's own input listeners, so they see the clean value.
 */
export function numberField(input) {
  input.addEventListener('focus', () => {
    /* after the browser has placed its caret, or it undoes the selection */
    setTimeout(() => { try { if (document.activeElement === input) input.select(); } catch { /* not selectable */ } }, 0);
  });
  input.addEventListener('input', () => {
    if (/^0\d/.test(input.value)) input.value = String(Number(input.value));
  });
  return input;
}

/* ---------- bottom sheet ---------- */

let sheetCloser = null;

/* ---- the phone's back button ----
   On Android, "back" with a sheet open should close the sheet, not leave the
   screen (or the app). So an opening sheet adds one history entry, and the
   back button arriving on it closes the sheet. Closing it any other way
   takes that entry back off — and until that has happened, a navigation
   must wait, or the late "back" would undo it. */
let sheetEntry = false;
let backPending = null;

window.addEventListener('popstate', () => {
  if (backPending) { const done = backPending; backPending = null; done(); return; }
  if (sheetEntry) { sheetEntry = false; closeSheet({ fromHistory: true }); }
});

/** Resolves once a pending sheet "back" has landed (immediately if none). */
export function historySettled() {
  if (!backPending) return Promise.resolve();
  return new Promise((resolve) => {
    const prev = backPending;
    backPending = () => { prev(); resolve(); };
    /* A browser that never fires popstate must not strand navigation. */
    setTimeout(() => { if (backPending) { const d = backPending; backPending = null; d(); } }, 400);
  });
}

export function openSheet(title, buildBody) {
  const wrap = $('#sheet');
  const body = $('#sheetBody');
  if (wrap.hidden && !sheetEntry) {
    try { history.pushState({ ironSheet: true }, ''); sheetEntry = true; } catch { /* sandboxed frame */ }
  }
  $('#sheetTitle').textContent = title;
  clear(body);
  /* One sheet replacing another (a back step, a sub-page) reuses the same
     panel: drop the previous listeners first, or each step stacks another. */
  if (sheetCloser) {
    wrap.removeEventListener('click', sheetCloser);
    document.removeEventListener('keydown', sheetCloser);
  }
  const content = buildBody(closeSheet);
  if (content) body.appendChild(content);
  body.scrollTop = 0;
  wrap.hidden = false;
  document.body.style.overflow = 'hidden';

  sheetCloser = (e) => {
    if (e.target.hasAttribute?.('data-close') || e.key === 'Escape') closeSheet();
  };
  wrap.addEventListener('click', sheetCloser);
  document.addEventListener('keydown', sheetCloser);
  return closeSheet;
}

export function closeSheet({ fromHistory = false } = {}) {
  const wrap = $('#sheet');
  if (!wrap || wrap.hidden) return;
  if (!fromHistory && sheetEntry) {
    sheetEntry = false;
    if (history.state?.ironSheet) {
      backPending = () => {};
      history.back();
    }
  }
  wrap.hidden = true;
  document.body.style.overflow = '';
  if (sheetCloser) {
    wrap.removeEventListener('click', sheetCloser);
    document.removeEventListener('keydown', sheetCloser);
    sheetCloser = null;
  }
}

/** Confirm dialog rendered as a sheet (window.confirm is blocked in some PWAs). */
export function confirmSheet(title, message, confirmLabel = 'אישור', danger = true) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; closeSheet(); resolve(v); } };
    openSheet(title, () => el('div', { class: 'stack' }, [
      el('p', { class: 'muted', text: message, style: { margin: '0 0 6px' } }),
      el('button', { class: `btn full ${danger ? 'danger' : 'primary'}`, text: confirmLabel, onclick: () => done(true) }),
      el('button', { class: 'btn full ghost', text: 'ביטול', onclick: () => done(false) })
    ]));
    $('#sheet').addEventListener('click', (e) => {
      if (e.target.hasAttribute?.('data-close')) done(false);
    }, { once: true });
  });
}

/* ---------- PR celebration ---------- */

export function celebratePR(text = 'שיא אישי!') {
  const box = $('#prBurst');
  if (!box) return;
  box.querySelector('span').textContent = text;
  box.hidden = true;
  void box.offsetWidth; // restart the animation
  box.hidden = false;
  buzz([0, 40, 60, 40, 60, 90]);
  setTimeout(() => { box.hidden = true; }, 950);
}

/* ---------- empty state ---------- */

export const emptyState = (title, sub, iconPath = ICONS.dumbbell) =>
  el('div', { class: 'empty' }, [
    icon(iconPath, 40),
    el('b', { text: title }),
    sub ? el('div', { class: 'tiny', text: sub }) : null
  ]);
