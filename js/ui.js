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

export function icon(path, size = 22) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = path;
  return svg;
}

export const ICONS = {
  chevron: '<path d="M15 6l-6 6 6 6"/>',
  chevronBack: '<path d="M9 6l6 6-6 6"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  swap: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
  note: '<path d="M5 4h11l4 4v12H5z"/><path d="M15 4v5h5"/>',
  play: '<path d="M7 4l12 8-12 8z"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>',
  plate: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>',
  flame: '<path d="M12 3s5 4 5 9a5 5 0 0 1-10 0c0-2 1-3 1-3s1 2 2 2 2-8 2-8z"/>',
  dumbbell: '<path d="M6 8v8M3 10v4M18 8v8M21 10v4M6 12h12"/>',
  trash: '<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/>',
  download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'
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
