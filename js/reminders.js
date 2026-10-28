/* ==========================================================================
   reminders.js — water and protein reminders, the phone's side.

   The reminders themselves are sent by the site's server once an hour
   (netlify/functions/push-tick.js), so they arrive with the app closed.
   What happens here:
   · turning them on: notification permission, a push subscription signed
     for the server's public key, and the settings — sent to /api/push
   · keeping the server's idea of today current: every change to water or
     protein is reported (debounced), so a reminder states the real gap and
     a goal already met never triggers one
   · the panel in Settings and the one-tap invitation on the nutrition screen

   Nothing is sent anywhere unless reminders are switched on.
   ========================================================================== */

import * as db from './db.js';
import { el, icon, ICONS, toast, buzz } from './ui.js';
import { todayISO } from './logic.js';

const API = '/api/push';
const DEFAULT_PREFS = { water: true, protein: true, from: 9, to: 21, every: 2 };

export const supported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

export async function settings() {
  return { on: false, prefs: { ...DEFAULT_PREFS }, ...(await db.setting('reminders', {})) };
}
const save = (r) => db.setSetting('reminders', r);

/** A long random id for this phone's record on the server. */
async function pushId() {
  let id = await db.setting('pushId', '');
  if (!id) {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    id = `p_${btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
    await db.setSetting('pushId', id);
  }
  return id;
}

const keyBytes = (b64u) => {
  const s = atob(b64u.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64u.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

async function post(body) {
  const res = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `שגיאת שרת ${res.status}`);
  return j;
}

/* ---- today's numbers ---- */

let progress = null;
let targets = { water_target: 3000, protein_target: 120 };
let timer = null;

/** The nutrition screen says what today's targets are. Kept on the device
    too, so a notification button (service worker) can report a glass with
    the right targets and the quick card can show protein against target. */
export function setTargets(t) {
  const next = { ...targets, ...t };
  const changed = JSON.stringify(next) !== JSON.stringify(targets);
  targets = next;
  if (changed) db.setSetting('reminderTargets', targets).catch(() => {});
}

/** Report a day's water and protein (debounced; nothing if reminders are off). */
export function syncDay(day) {
  if (!day || day.date !== todayISO()) return;
  /* water_ml here is the day's whole water, drinks included */
  progress = { date: day.date, water_ml: (day.water_ml || 0) + (day.drinks_ml || 0), protein: day.protein_grams || 0, ...targets };
  clearTimeout(timer);
  timer = setTimeout(async () => {
    const r = await settings();
    if (!r.on) return;
    try {
      await post({ action: 'progress', id: await pushId(), progress, tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
    } catch { /* offline: the next change, or the next open, reports again */ }
  }, 1200);
}

/* ---- on / off ---- */

/** Why reminders cannot work on this phone right now, or null. */
export function blocker() {
  if (isIOS() && !standalone()) return 'באייפון התזכורות עובדות רק מהאפליקציה המותקנת: שיתוף ← "הוסף למסך הבית", ואז מפעילים מכאן.';
  if (!supported()) return 'הדפדפן הזה לא תומך בהתראות. ב-Chrome באנדרואיד, או באפליקציה המותקנת באייפון, זה עובד.';
  if (Notification.permission === 'denied') return 'ההתראות לאתר הזה חסומות. אפשר לאשר אותן בהגדרות הדפדפן או המכשיר, ואז לנסות שוב.';
  return null;
}

export async function enable(prefs = {}) {
  const why = blocker();
  if (why) throw new Error(why);
  let disc;
  try {
    disc = await fetch(API).then((r) => r.json());
  } catch {
    disc = null;
  }
  if (!disc?.available || !disc.publicKey) throw new Error('התזכורות דורשות את השרת של האתר (Netlify) — הוא לא זמין כרגע.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('לא ניתנה הרשאה להתראות.');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(disc.publicKey) });
  }
  const r = await settings();
  const next = { on: true, prefs: { ...r.prefs, ...prefs } };
  await post({
    action: 'subscribe', id: await pushId(), subscription: sub.toJSON(), prefs: next.prefs,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    progress: progress || { date: todayISO(), water_ml: 0, protein: 0, ...targets }
  });
  await save(next);
  return next;
}

export async function disable() {
  const r = await settings();
  await save({ ...r, on: false });
  try { await post({ action: 'off', id: await pushId() }); } catch { /* forgotten server-side on its next 410 anyway */ }
  try { (await (await navigator.serviceWorker.ready).pushManager.getSubscription())?.unsubscribe(); } catch { /* nothing to undo */ }
}

export async function updatePrefs(prefs) {
  const r = await settings();
  const next = { ...r, prefs: { ...r.prefs, ...prefs } };
  await save(next);
  if (next.on) {
    await post({ action: 'progress', id: await pushId(), prefs: next.prefs, progress: progress || { date: todayISO(), ...targets } }).catch(() => {});
  }
  return next;
}

export const sendTest = async () => post({ action: 'test', id: await pushId() });

/* ---- UI ---- */

const HOURS = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** The full panel: on/off, which kinds, the waking window, how often, a test. */
export function panel(ctx) {
  const box = el('div', { class: 'card stack reminders' });
  const paint = async () => {
    const r = await settings();
    box.replaceChildren();
    const why = blocker();
    box.appendChild(el('p', { class: 'tiny dim', style: { margin: 0, lineHeight: '1.55' }, text: 'התראה לטלפון גם כשהאפליקציה סגורה — רק כשבאמת חסר: מים לפי השעה ביום, וחלבון בצהריים, אחה״צ וערב.' }));
    if (why && !r.on) {
      box.appendChild(el('p', { class: 'tiny bad', style: { margin: 0, lineHeight: '1.5' }, text: why }));
      return;
    }
    if (!r.on) {
      box.appendChild(el('button', {
        class: 'btn primary full', onclick: async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true;
          try {
            await enable();
            buzz(12);
            toast('התזכורות הופעלו', 'ok');
          } catch (err) {
            toast(err.message, 'bad');
          }
          paint();
        }
      }, [icon(ICONS.bell, 18), 'הפעל תזכורות']));
      return;
    }
    const sel = (value, options, onChange, label) => {
      const s = el('select', { 'aria-label': label });
      options.forEach(([v, t]) => s.appendChild(el('option', { value: String(v), text: t, ...(v === value ? { selected: true } : {}) })));
      s.addEventListener('change', () => onChange(Number(s.value)));
      return s;
    };
    const chip = (label, on, key) => el('button', {
      class: `chip${on ? ' on' : ''}`, 'aria-pressed': String(on),
      onclick: async () => { await updatePrefs({ [key]: !on }); paint(); }
    }, [icon(key === 'water' ? ICONS.glass : ICONS.target, 15), label]);
    box.append(
      el('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } }, [
        chip('מים', r.prefs.water, 'water'),
        chip('חלבון', r.prefs.protein, 'protein')
      ]),
      el('div', { class: 'grid-2' }, [
        el('div', {}, [el('label', { class: 'field-label', text: 'מהשעה' }),
          sel(r.prefs.from, HOURS(5, 12).map((h) => [h, `${h}:00`]), (v) => updatePrefs({ from: v }), 'מהשעה')]),
        el('div', {}, [el('label', { class: 'field-label', text: 'עד השעה' }),
          sel(r.prefs.to, HOURS(15, 24).map((h) => [h, `${h === 24 ? '00' : h}:00`]), (v) => updatePrefs({ to: v }), 'עד השעה')])
      ]),
      el('div', {}, [el('label', { class: 'field-label', text: 'תזכורת מים לכל היותר' }),
        sel(r.prefs.every, [[1, 'כל שעה'], [2, 'כל שעתיים'], [3, 'כל 3 שעות'], [4, 'כל 4 שעות']], (v) => updatePrefs({ every: v }), 'תדירות')]),
      el('div', { class: 'row', style: { gap: '8px' } }, [
        el('button', {
          class: 'btn sm grow', onclick: async (e) => {
            const btn = e.currentTarget;
            btn.disabled = true;
            try {
              const res = await sendTest();
              toast(res.ok ? 'נשלחה התראת בדיקה' : 'השליחה נכשלה — נסה לכבות ולהפעיל מחדש', res.ok ? 'ok' : 'bad');
            } catch (err) { toast(err.message, 'bad'); }
            btn.disabled = false;
          }
        }, [icon(ICONS.bell, 15), 'שלח בדיקה']),
        el('button', {
          class: 'btn sm ghost', onclick: async () => { await disable(); toast('התזכורות כובו'); paint(); }
        }, ['כבה'])
      ])
    );
  };
  paint();
  return box;
}

/**
 * The nutrition screen's invitation: shown until reminders are on or the
 * card is dismissed, and never where they cannot work.
 */
export async function invite(ctx) {
  const r = await settings();
  if (r.on || (await db.setting('remindersInviteHidden', false)) || blocker()) return null;
  const card = el('div', { class: 'remind-invite' }, [
    el('div', { class: 'remind-ico' }, [icon(ICONS.bell, 20)]),
    el('div', { class: 'grow' }, [
      el('b', { text: 'תזכורות למים ולחלבון' }),
      el('small', { text: 'התראה כשאתה מאחר ביעד היומי — גם כשהאפליקציה סגורה' })
    ]),
    el('button', {
      class: 'btn sm primary', onclick: async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          await enable();
          toast('התזכורות הופעלו — אפשר לכוון אותן בהגדרות', 'ok');
          card.remove();
        } catch (err) {
          toast(err.message, 'bad');
          btn.disabled = false;
        }
      }
    }, ['הפעל']),
    el('button', {
      class: 'remind-x', 'aria-label': 'לא עכשיו',
      onclick: async () => { await db.setSetting('remindersInviteHidden', true); card.remove(); }
    }, [icon(ICONS.close, 16)])
  ]);
  return card;
}
