/* ==========================================================================
   quick.js — adding water and food from outside the app.

   Two ways, both Android-first (that is where a web app gets them):
   · home-screen shortcuts — long-press the app icon: "כוס מים", "הוספת
     מאכל", "מאכלים שמורים"; each can be dragged onto the home screen as a
     button of its own. They open the app with ?quick=…, handled here.
   · a quick-add card in the notification shade with "+ כוס מים" and
     "+ מאכל". The water button works with the app closed — the service
     worker writes the glass itself (js/sw-quick.js, shared with the app).

   A real home-screen widget is not something a web app can install on
   Android or iPhone; this is the closest the platform allows.
   ========================================================================== */

import * as db from './db.js';
import './sw-quick.js';
import { el, icon, ICONS, toast, buzz } from './ui.js';

const Q = () => self.IronlogQuick;

/** The service worker registration, or null if there is none (yet). */
async function registration() {
  if (!('serviceWorker' in navigator)) return null;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((resolve) => setTimeout(() => resolve(null), 3000))
  ]);
}

export const cardSupported = () => 'Notification' in window && 'serviceWorker' in navigator
  && !/iphone|ipad|ipod/i.test(navigator.userAgent);

export const cardOn = async () => !!(await db.setting('quickCard', false));

/** Draw (or redraw) the card with today's numbers. */
export async function showCard() {
  const reg = await registration();
  if (!reg || Notification.permission !== 'granted') return false;
  const { title, options } = await Q().cardNotification();
  await reg.showNotification(title, options);
  return true;
}

let refreshTimer = null;
/** After any change to today: redraw the card if it is on. Debounced. */
export function refreshCard() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    try { if (await cardOn()) await showCard(); } catch { /* the card is a convenience */ }
  }, 400);
}

export async function enableCard() {
  if (!cardSupported()) throw new Error('הכרטיס בהתראות זמין באנדרואיד (Chrome). באייפון זה לא נתמך לאפליקציות רשת.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('לא ניתנה הרשאה להתראות');
  await db.setSetting('quickCard', true);
  if (!(await showCard())) throw new Error('ההתראה לא הוצגה — נסה שוב אחרי פתיחה מחדש של האפליקציה');
}

export async function disableCard() {
  await db.setSetting('quickCard', false);
  const reg = await registration();
  const open = reg ? await reg.getNotifications({ tag: 'ironlog-quick' }) : [];
  open.forEach((n) => n.close());
}

/** One glass (or any amount; negative takes back) on today — the same write the notification button makes. */
export const addWater = (ml) => Q().addWater(ml);
export const status = () => Q().status();
export const GLASS_ML = 250;

/**
 * The panel in Settings and in "עוד": how to put the buttons on the home
 * screen, and the notification card switch.
 */
export function panel() {
  const box = el('div', { class: 'card stack quick-panel' });
  const paint = async () => {
    const on = await cardOn();
    box.replaceChildren(
      el('b', { class: 'qp-title', text: 'כפתורים במסך הבית' }),
      el('ol', { class: 'qp-steps' }, [
        el('li', { text: 'לחיצה ארוכה על האייקון של IRONLOG במסך הבית.' }),
        el('li', { text: 'מופיעים: "כוס מים", "הוספת מאכל", "מאכלים שמורים", "התחל אימון".' }),
        el('li', { text: 'גוררים כל אחד מהם למסך הבית — והוא נשאר שם ככפתור נפרד. לחיצה עליו מוסיפה ישר.' })
      ]),
      el('p', { class: 'tiny dim', style: { margin: 0, lineHeight: '1.5' }, text: 'עובד באנדרואיד כשהאפליקציה מותקנת. באייפון אין כפתורים כאלה לאפליקציות רשת.' }),
      el('div', { class: 'divider' }),
      el('b', { class: 'qp-title', text: 'כרטיס קבוע בהתראות' }),
      el('p', { class: 'tiny dim', style: { margin: 0, lineHeight: '1.5' }, text: 'כרטיס בהתראות של הטלפון עם המצב של היום ושני כפתורים: "+ כוס מים" (נרשם בלי לפתוח את האפליקציה) ו"+ מאכל".' }),
      cardSupported()
        ? el('button', {
          class: `btn full${on ? '' : ' primary'}`,
          onclick: async (e) => {
            const btn = e.currentTarget;
            btn.disabled = true;
            try {
              if (on) { await disableCard(); toast('הכרטיס הוסר'); } else { await enableCard(); buzz(12); toast('הכרטיס מופיע בהתראות', 'ok'); }
            } catch (err) { toast(err.message, 'bad'); }
            paint();
          }
        }, [icon(ICONS.bell, 17), on ? 'הסר את הכרטיס' : 'הצג כרטיס בהתראות'])
        : el('p', { class: 'tiny bad', style: { margin: 0 }, text: 'לא זמין במכשיר הזה.' })
    );
  };
  paint();
  return box;
}
