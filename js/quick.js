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
import * as install from './install.js';

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
 * What stands between this phone and the home-screen buttons, worked out
 * from where the app is running — and the one thing to do about it.
 * @returns {Promise<{tone:'ok'|'warn'|'bad', title:string, text:string, action:null|'install'|'copy'}>}
 */
export async function diagnose() {
  const env = install.environment();
  const served = await install.servedShortcuts();
  const BROWSER = { samsung: 'Samsung Internet', firefox: 'Firefox', other: 'דפדפן שאינו Chrome' };
  if (env.os === 'ios') {
    return { tone: 'bad', title: 'באייפון אין כפתורים כאלה', text: 'אפל לא מאפשרת לאפליקציות רשת כפתורים בלחיצה ארוכה או ווידג׳טים. מה שעובד באייפון: האפליקציה המותקנת והתזכורות.', action: null };
  }
  if (served === 0) {
    return { tone: 'bad', title: 'האתר עוד לא מעודכן', text: 'הגרסה שהאתר מגיש עכשיו בלי הכפתורים. רענן את האפליקציה בעוד כמה דקות.', action: null };
  }
  if (env.os === 'android' && env.browser !== 'chrome') {
    return {
      tone: 'bad', title: `פתוח ב-${BROWSER[env.browser]}`,
      text: 'הכפתורים קיימים רק כש-IRONLOG מותקן מ-Chrome. העתק את הקישור, פתח אותו ב-Chrome ← תפריט ⋮ ← "התקן אפליקציה". הנתונים לא עוברים לבד בין דפדפנים: קודם הגדרות ← גיבוי בענן כאן, ושחזור עם הקוד ב-Chrome.',
      action: 'copy'
    };
  }
  if (install.canInstall()) {
    return { tone: 'warn', title: 'IRONLOG עוד לא מותקן מ-Chrome', text: 'התקנה מכאן נותנת את הכפתורים מיד: לחיצה ארוכה על האייקון החדש.', action: 'install' };
  }
  if (!env.standalone) {
    return { tone: 'warn', title: 'אתה בדפדפן, לא באפליקציה', text: 'נראה שהאפליקציה כבר מותקנת. פתח אותה מהאייקון שלה במסך הבית — ושם לחיצה ארוכה על האייקון.', action: null };
  }
  return {
    tone: 'ok', title: 'מותקן — הכפתורים בלחיצה ארוכה על האייקון',
    text: 'לא מופיעים? ההתקנה שלך קודמת לכפתורים, ו-Chrome מוסיף אותם רק כשהוא מעדכן את האפליקציה — לרוב תוך יום-יומיים, כשפותחים אותה. לקבל אותם מיד: גיבוי בענן (הגדרות), הסרת האייקון, ואז הקישור ב-Chrome ← ⋮ ← "התקן אפליקציה".',
    action: 'copy'
  };
}

/** The card is really in the shade (a phone setting can hide it silently). */
async function cardShown() {
  const reg = await registration();
  if (!reg) return false;
  return (await reg.getNotifications({ tag: 'ironlog-quick' }).catch(() => [])).length > 0;
}

/**
 * The panel in Settings and in "עוד": what this phone needs for the
 * home-screen buttons (checked, not just described), and the card switch —
 * which works on any Android phone, installed or not.
 */
export function panel() {
  const box = el('div', { class: 'card stack quick-panel' });
  let off = null;
  const paint = async () => {
    const on = await cardOn();
    const d = await diagnose();
    const check = el('div', { class: `qp-check ${d.tone}` }, [
      el('span', { class: 'gps-dot' }),
      el('div', { class: 'grow' }, [el('b', { text: d.title }), el('small', { text: d.text })])
    ]);
    const action = d.action === 'install'
      ? el('button', {
        class: 'btn primary full', onclick: async () => {
          const r = await install.install();
          if (r === 'accepted') { buzz(12); toast('מותקן — עכשיו לחיצה ארוכה על האייקון החדש', 'ok'); }
          paint();
        }
      }, [icon(ICONS.plus, 17), 'התקן עכשיו'])
      : d.action === 'copy'
        ? el('button', {
          class: 'btn full', onclick: async () => {
            try { await navigator.clipboard.writeText(install.appUrl()); toast('הקישור הועתק', 'ok'); } catch { toast(install.appUrl()); }
          }
        }, ['העתק קישור להתקנה'])
        : null;
    box.replaceChildren(...[
      el('b', { class: 'qp-title', text: 'כפתורים במסך הבית' }),
      el('ol', { class: 'qp-steps' }, [
        el('li', { text: 'לחיצה ארוכה על האייקון של IRONLOG במסך הבית.' }),
        el('li', { text: 'מופיעים: "כוס מים", "הוספת מאכל", "מאכלים שמורים", "התחל אימון".' }),
        el('li', { text: 'גוררים כל אחד מהם למסך הבית — והוא נשאר שם ככפתור נפרד. לחיצה עליו מוסיפה ישר.' })
      ]),
      check,
      action,
      el('div', { class: 'divider' }),
      el('b', { class: 'qp-title', text: 'כרטיס קבוע בהתראות' }),
      el('p', { class: 'tiny dim', style: { margin: 0, lineHeight: '1.5' }, text: 'עובד בכל אנדרואיד, גם בלי התקנה: כרטיס בהתראות עם המצב של היום ושני כפתורים — "+ כוס מים" (נרשם בלי לפתוח את האפליקציה) ו"+ מאכל".' }),
      cardSupported()
        ? el('button', {
          class: `btn full${on ? '' : ' primary'}`,
          onclick: async (e) => {
            const btn = e.currentTarget;
            btn.disabled = true;
            try {
              if (on) { await disableCard(); toast('הכרטיס הוסר'); } else {
                await enableCard();
                buzz(12);
                await new Promise((r) => setTimeout(r, 300));
                const shown = await cardShown();
                toast(shown
                  ? 'הכרטיס מופיע בהתראות — משיכה של המסך מלמעלה'
                  : 'ההתראות של IRONLOG מושתקות בטלפון: הגדרות ← אפליקציות ← IRONLOG (או Chrome) ← התראות', shown ? 'ok' : 'bad');
              }
            } catch (err) { toast(err.message, 'bad'); }
            paint();
          }
        }, [icon(ICONS.bell, 17), on ? 'הסר את הכרטיס' : 'הצג כרטיס בהתראות'])
        : el('p', { class: 'tiny bad', style: { margin: 0 }, text: 'לא זמין במכשיר הזה.' })
    ].filter(Boolean));
  };
  paint();
  /* Chrome's install offer can arrive after the panel is open */
  off = install.onChange(() => { if (box.isConnected) paint(); else off?.(); });
  return box;
}
