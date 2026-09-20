/* ==========================================================================
   login.js — the opening screen: sign in with Google, or carry on locally.
   Signing in is optional by design: the app is fully usable offline and the
   account only buys backup and sync of the same local data to the user's own
   Google Drive. Nothing is ever uploaded to a server of ours — there isn't one.
   ========================================================================== */

import { el, icon, ICONS, toast } from './ui.js';
import * as db from './db.js';
import { frameUrl } from './media.js';
import { configured, setClientId, signIn, currentAccount } from './gdrive.js';

/** Resolves once the user has picked how to continue. */
export function runLogin() {
  return new Promise((resolve) => {
    const root = el('div', { class: 'login' });

    const bg = el('div', { class: 'login-bg' }, [
      el('img', { src: frameUrl('bb_squat', 0), alt: '' })
    ]);

    const done = async (mode, account = null) => {
      await db.setSetting('authMode', mode);
      if (account) await db.setSetting('googleAccount', account);
      root.remove();
      document.body.classList.remove('login-open');
      resolve({ mode, account });
    };

    const google = el('button', { class: 'btn primary full' }, [
      icon(ICONS.google, 18, 'solid'),
      el('span', { text: 'המשך עם Google' })
    ]);

    google.addEventListener('click', async () => {
      if (!(await configured())) return askClientId();
      google.disabled = true;
      try {
        const account = await signIn();
        toast(`שלום ${account.name || account.email}`, 'ok');
        done('google', account);
      } catch (err) {
        toast(err.message || 'ההתחברות נכשלה', 'bad');
        google.disabled = false;
      }
    });

    /* The app has no server, so Google sign-in needs the user's own OAuth
       client. Rather than hide that in settings, we ask for it here once. */
    function askClientId() {
      const field = el('input', {
        type: 'text', dir: 'ltr', placeholder: '…apps.googleusercontent.com',
        'aria-label': 'Google Client ID'
      });
      const save = el('button', {
        class: 'btn full', text: 'שמור והתחבר',
        onclick: async () => {
          const v = field.value.trim();
          if (!v.endsWith('.apps.googleusercontent.com')) {
            return toast('זה לא נראה כמו Client ID של Google', 'bad');
          }
          await setClientId(v);
          panel.remove();
          google.click();
        }
      });
      const panel = el('div', { class: 'login-client stack' }, [
        el('b', { text: 'חיבור ראשוני ל-Google' }),
        el('p', {
          class: 'tiny dim',
          text: 'האפליקציה שלך, החשבון שלך: אין לנו שרת, ולכן ההתחברות עוברת ישירות מול Google עם Client ID משלך. יוצרים אותו פעם אחת ב-Google Cloud Console (מדריך מלא בהגדרות).'
        }),
        field,
        save,
        el('button', { class: 'btn ghost full', text: 'לא עכשיו', onclick: () => panel.remove() })
      ]);
      root.appendChild(panel);
      field.focus();
    }

    root.append(
      bg,
      /* The mark itself, not just the word. It is the first thing anyone
         sees of the app, and it is already on their home screen. */
      el('img', { class: 'login-logo', src: 'icons/logo.svg', alt: '', width: 128, height: 128 }),
      el('div', { class: 'login-mark', text: 'IRONLOG' }),
      el('h1', { text: 'תתאמן. תתעד.\nתראה התקדמות.' }),
      el('p', { text: 'תוכנית PPL שמתעדכנת לפי הביצועים שלך, מעקב תזונה בעברית, והכל עובד גם בלי רשת.' }),
      google,
      el('button', {
        class: 'btn full', text: 'המשך בלי חשבון',
        onclick: () => done('local')
      }),
      el('div', { class: 'login-note', text: 'הנתונים נשמרים על המכשיר בלבד. חשבון Google משמש אך ורק לגיבוי לדרייב הפרטי שלך, ואפשר להוסיף אותו מאוחר יותר מההגדרות.' })
    );

    document.body.appendChild(root);
    document.body.classList.add('login-open');
  });
}

/** Has the user already answered the login screen? */
export async function loginSettled() {
  const mode = await db.setting('authMode', '');
  if (mode) return true;
  return !!(await currentAccount());
}
