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
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
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
  check: '<path d="M4 12l5 5L20 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  swap: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
  note: '<path d="M5 4h11l4 4v12H5z"/><path d="M15 4v5h5"/>',
  play: '<path d="M7 4l12 8-12 8z"/>',
  pause: '<path d="M8 4h3v16H8zM13 4h3v16h-3z"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  muscle: '<path d="M4 15c2-1 3-3 4-5s3-3 5-3 4 1 5 3 2 4 2 6a3 3 0 0 1-3 3H8a4 4 0 0 1-4-4z"/><path d="M9 10c1.5 1 3 1.5 5 1.5"/>',
  expand: '<path d="M4 9V4h5M20 15v5h-5M15 4h5v5M9 20H4v-5"/>',
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
  scale: '<path d="M5 7h14l2 13H3z"/><path d="M9 7a3 3 0 0 1 6 0"/>'
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

/* ---------- bottom sheet ---------- */

let sheetCloser = null;

export function openSheet(title, buildBody) {
  const wrap = $('#sheet');
  const body = $('#sheetBody');
  $('#sheetTitle').textContent = title;
  clear(body);
  const content = buildBody(closeSheet);
  if (content) body.appendChild(content);
  wrap.hidden = false;
  document.body.style.overflow = 'hidden';

  sheetCloser = (e) => {
    if (e.target.hasAttribute?.('data-close') || e.key === 'Escape') closeSheet();
  };
  wrap.addEventListener('click', sheetCloser);
  document.addEventListener('keydown', sheetCloser);
  return closeSheet;
}

export function closeSheet() {
  const wrap = $('#sheet');
  if (!wrap || wrap.hidden) return;
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
