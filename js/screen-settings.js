/* ==========================================================================
   screen-settings.js — goal, equipment, gym hardware, data backup.
   ========================================================================== */

import * as db from './db.js';
import { el, icon, ICONS, toast, buzz, openSheet, confirmSheet } from './ui.js';
import { GOALS, ROTATIONS, DURATIONS, DEFAULTS, goalList, resolveGoal, durationFor } from './programs.js';
import { proteinTarget, PLATE_COLORS } from './logic.js';
import * as ai from './ai.js';
import * as gdrive from './gdrive.js';
import * as cloud from './cloud.js';
import { BUILD, swVersion } from './version.js';

/**
 * A settings screen that shows everything at once is a wall. Each group is a
 * row you open, so the screen is a short list until you want one of them.
 */
function section(title, sub, children, open = false) {
  const kids = [].concat(children).filter(Boolean);
  const body = el('div', { class: 'sect-body' }, kids);
  body.hidden = !open;

  const head = el('button', { class: `sect-head${open ? ' open' : ''}`, onclick: () => {
    const show = body.hidden;
    body.hidden = !show;
    head.classList.toggle('open', show);
  } }, [
    el('div', { class: 'grow' }, [el('b', { text: title }), sub ? el('small', { text: sub }) : null]),
    icon(ICONS.chevronDown, 18)
  ]);

  return el('div', { class: 'sect' }, [head, body]);
}

export async function render(ctx) {
  const s = ctx.settings;
  ctx.setTitle('הגדרות');
  const wrap = el('div', { class: 'stack' });

  /* ---- goals: several at once ---- */
  const chosen = goalList(s);
  const goalNodes = Object.values(GOALS).map((g) => {
    const on = chosen.includes(g.id);
    return el('button', {
      class: `opt${on ? ' on' : ''}`,
      onclick: async () => {
        const next = on ? chosen.filter((x) => x !== g.id) : [...chosen, g.id];
        /* Training toward nothing is not a state worth allowing. */
        if (!next.length) return toast('צריך לבחור לפחות מטרה אחת', 'bad');
        await ctx.saveSetting('goals', next);
        await ctx.saveSetting('goal', next[0]);
        ctx.reload();
      }
    }, [
      el('div', { class: 'grow' }, [
        el('b', { text: g.name }),
        el('small', { text: g.desc })
      ]),
      el('span', { class: `opt-check${on ? ' on' : ''}` }, [icon(ICONS.check, 16)])
    ]);
  });
  goalNodes.push(el('p', {
    class: 'tiny dim', style: { margin: '4px 2px 0', lineHeight: '1.5' },
    text: chosen.length > 1
      ? `משולב: ${resolveGoal(chosen).name}. התרגילים המורכבים ירוצו בטווח הכבד מבין המטרות, תרגילי הבידוד בטווח הנפח הגבוה, וזמן המנוחה לפי הארוך מביניהן.`
      : 'אפשר לבחור כמה מטרות יחד — התוכנית תשלב ביניהן.'
  }));
  wrap.appendChild(section('מטרות אימון', resolveGoal(chosen).name, goalNodes));

  /* ---- split ---- */
  const splitNodes = [];
  Object.values(ROTATIONS).forEach((r) => {
    splitNodes.push(el('button', {
      class: `opt${s.rotation === r.id ? ' on' : ''}`,
      onclick: async () => {
        await ctx.saveSetting('rotation', r.id);
        await db.setSetting('rotationCursor', 0);
        ctx.reload();
      }
    }, [
      el('div', { class: 'grow' }, [
        el('b', { text: r.name }),
        el('small', { text: r.desc })
      ]),
      s.rotation === r.id ? icon(ICONS.check, 18) : null
    ]));
  });
  wrap.appendChild(section('פיצול שבועי', ROTATIONS[s.rotation]?.name || '', splitNodes));

  /* ---- session length ---- */
  const durationNodes = Object.values(DURATIONS).map((d) => el('button', {
    class: `opt${(s.duration || 'medium') === d.id ? ' on' : ''}`,
    onclick: async () => { await ctx.saveSetting('duration', d.id); ctx.reload(); }
  }, [
    el('div', { class: 'grow' }, [
      el('b', { text: d.name }),
      el('small', { text: d.desc })
    ]),
    (s.duration || 'medium') === d.id ? icon(ICONS.check, 18) : null
  ]));
  durationNodes.push(el('p', {
    class: 'tiny dim', style: { margin: '4px 2px 0', lineHeight: '1.5' },
    text: 'קובע כמה תרגילים וסטים ייכנסו לכל אימון שנבנה מהתוכנית. יש גם "זריז" — כפתור נפרד במסך הבית לאימון קצר ברגע זה, בלי לשנות את ההגדרה הזו.'
  }));
  wrap.appendChild(section('אורך אימון', durationFor(s.duration).name, durationNodes));

  /* ---- body & gym: chosen, not typed ---- */
  wrap.appendChild(section('גוף וציוד', `${s.bodyweight} ק״ג · מוט ${s.barWeight} ק״ג`, [
    el('div', { class: 'stack' }, [
      stepper('משקל גוף', s.bodyweight, 0.5, 30, 250, 'ק״ג', (v) => ctx.saveSetting('bodyweight', v)),
      stepper('גובה', s.height || 175, 1, 120, 230, 'ס״מ', (v) => ctx.saveSetting('height', v)),
      stepper('גיל', s.age || 30, 1, 12, 100, 'שנים', (v) => ctx.saveSetting('age', v)),
      el('div', { class: 'tiny dim', text: `יעד חלבון ביום אימון: ${proteinTarget(s.bodyweight, true, chosen)} גרם · ביום מנוחה: ${proteinTarget(s.bodyweight, false, chosen)} גרם` }),
      el('div', { class: 'divider' }),
      barPicker(ctx, s),
      platePicker(ctx, s),
      stepper('קפיצה מינימלית במכונות', s.increment, 0.5, 0.5, 10, 'ק״ג', (v) => ctx.saveSetting('increment', v))
    ])
  ]));

  /* ---- appearance ---- */
  wrap.appendChild(section('עיצוב', 'צבע נושא', [themePicker(ctx, s)]));

  /* ---- behaviour ---- */
  wrap.appendChild(section('התנהגות', 'טיימר, רטט, חימום, RIR', [el('div', { class: 'card stack' }, [
    toggle('טיימר מנוחה אוטומטי', s.autoTimer !== false, (v) => ctx.saveSetting('autoTimer', v)),
    toggle('רטט במכשיר', s.vibrate !== false, (v) => ctx.saveSetting('vibrate', v)),
    toggle('צליל בסיום המנוחה (נשמע גם עם אוזניות)', s.soundAlert !== false, (v) => ctx.saveSetting('soundAlert', v)),
    toggle('התראה כשהמנוחה מסתיימת ברקע', s.bgNotify === true, async (v) => {
      if (v && 'Notification' in window && Notification.permission !== 'granted') {
        const perm = await Notification.requestPermission().catch(() => 'denied');
        if (perm !== 'granted') toast('ההתראות נחסמו בדפדפן/במכשיר — אפשר לאשר בהגדרות המערכת', 'bad');
      }
      await ctx.saveSetting('bgNotify', v);
    }),
    toggle('הצע סטי חימום לתרגילים כבדים', s.warmupOn !== false, (v) => ctx.saveSetting('warmupOn', v)),
    toggle('מעקב RIR (חזרות שנשארו במאגר)', s.trackRir === true, (v) => ctx.saveSetting('trackRir', v))
  ])]));

  /* ---- backup: the easy one first, the account one second ---- */
  const cloudOn = await cloud.available();
  wrap.appendChild(section(
    'גיבוי בענן',
    cloudOn ? 'בלי חשבון — קוד שחזור' : 'לא זמין באתר הזה',
    [await cloudCard(ctx, cloudOn)]
  ));
  wrap.appendChild(section('חשבון Google (אופציונלי)', 'סנכרון לדרייב הפרטי שלך', [await accountCard(ctx)]));

  /* ---- AI ---- */
  const currentKey = await ai.getKey();
  const hostedCoach = await ai.hosted();
  const keyInput = el('input', {
    type: 'password',
    placeholder: 'sk-ant-…',
    value: currentKey || '',
    autocomplete: 'off'
  });

  /* When the deployment hosts a key, nothing is asked of the user — the field
     stays available only as an override for a personal key. */
  const aiNodes = [];
  if (hostedCoach) {
    /* A key being *set* on the server and the API actually answering are two
       different things, and the gap between them is where "שגיאת AI (400)"
       lives. This runs one real call and prints what came back, so the cause
       is readable from the phone instead of from Netlify's function logs. */
    const verdict = el('p', { class: 'tiny dim', style: { margin: 0, lineHeight: '1.6', whiteSpace: 'pre-wrap' } });

    aiNodes.push(el('div', { class: 'card stack' }, [
      el('div', { class: 'row', style: { gap: '9px' } }, [
        icon(ICONS.check, 18),
        el('b', { text: 'המאמן פעיל — אין צורך במפתח' })
      ]),
      el('p', {
        class: 'tiny dim', style: { margin: 0, lineHeight: '1.55' },
        text: 'האתר הזה מריץ את המאמן דרך שרת משלו, כך שהצ׳אט וניתוח התמונות עובדים לכל מי שנכנס. יש מכסת הודעות יומית כדי למנוע שימוש לרעה.'
      }),
      el('button', {
        class: 'btn sm full', id: 'aiDiagnose',
        onclick: async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true; btn.textContent = 'בודק…';
          verdict.textContent = '';
          const out = await ai.checkHosted();
          verdict.textContent = out.ok
            ? `החיבור תקין. מודל: ${out.model}`
            : `${out.error || 'השרת לא הצליח לענות'}${out.detail ? `\n\n${out.detail}` : ''}`;
          verdict.classList.toggle('bad', !out.ok);
          btn.disabled = false; btn.textContent = 'בדוק חיבור לשרת ה-AI';
        }
      }, [icon(ICONS.sync, 16), 'בדוק חיבור לשרת ה-AI']),
      verdict
    ]));
  }

  if (!hostedCoach) aiNodes.push(el('div', { class: 'card stack' }, [
    el('p', {
      class: 'tiny dim', style: { margin: 0, lineHeight: '1.55' },
      text: 'מפתח Claude API מפעיל את הצ׳אט עם המאמן ואת ניתוח תמונות האוכל. המפתח נשמר רק במכשיר הזה ונשלח ישירות ל-api.anthropic.com. כל שאר האפליקציה עובדת בלעדיו.'
    }),
    keyInput,
    el('div', { class: 'row', style: { gap: '8px' } }, [
      el('button', {
        class: 'btn sm grow primary', text: 'שמור מפתח',
        onclick: async () => {
          await ai.setKey(keyInput.value);
          toast(keyInput.value.trim() ? 'המפתח נשמר' : 'המפתח נמחק', 'ok');
        }
      }),
      el('button', {
        class: 'btn sm grow', text: 'בדוק חיבור',
        onclick: async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true; btn.textContent = 'בודק…';
          try {
            await ai.setKey(keyInput.value);
            const out = await ai.analyzeMealText('ביצה אחת');
            toast(out?.items?.length ? 'החיבור תקין' : 'התקבלה תשובה לא צפויה', out?.items?.length ? 'ok' : 'bad');
          } catch (err) {
            toast(err.message, 'bad');
          } finally {
            btn.disabled = false; btn.textContent = 'בדוק חיבור';
          }
        }
      })
    ])
  ]));

  wrap.appendChild(section('מאמן AI וניתוח תזונה', hostedCoach ? 'פעיל' : 'דורש מפתח אישי', aiNodes));

  /* ---- data ---- */
  wrap.appendChild(section('נתונים וגיבוי', 'ייצוא, שחזור, מחיקה', [el('div', { class: 'card stack' }, [
    el('button', { class: 'btn full', onclick: exportBackup }, [icon(ICONS.download, 18), 'ייצוא גיבוי JSON']),
    el('button', { class: 'btn full', onclick: () => importBackup(ctx) }, [icon(ICONS.plus, 18), 'שחזור מגיבוי']),
    el('button', {
      class: 'btn full ghost danger',
      onclick: async () => {
        if (await confirmSheet('למחוק את כל הנתונים?', 'כל האימונים, הסטים וההגדרות יימחקו לצמיתות מהמכשיר הזה.', 'מחק הכל')) {
          await db.wipe();
          toast('הנתונים נמחקו');
          location.reload();
        }
      }
    }, [icon(ICONS.trash, 18), 'מחיקת כל הנתונים'])
  ])]));

  wrap.appendChild(section('גרסה ועדכונים', `גרסה ${BUILD}`, [versionCard()]));

  wrap.appendChild(el('p', {
    class: 'tiny dim',
    style: { textAlign: 'center', marginTop: '18px' },
    text: 'IRONLOG · כל הנתונים נשמרים מקומית במכשיר. עובד לגמרי ללא אינטרנט.'
  }));

  return wrap;
}

/* ---------- version, and a way out of a stuck cache ---------- */

/**
 * "The app didn't update" is unanswerable without a number to compare. This
 * shows the build the page is running, the build the service worker reports,
 * and a button that throws away every cache and reloads — the manual version
 * of what the worker is supposed to do by itself.
 */
function versionCard() {
  const swLine = el('div', { class: 'row between' }, [
    el('span', { class: 'tiny dim', text: 'Service worker' }),
    el('b', { class: 'tiny', text: '…' })
  ]);
  swVersion().then((v) => {
    const b = swLine.querySelector('b');
    b.textContent = v ? v.replace('ironlog-v', '') : 'לא פעיל';
    /* A worker reporting a different build than the page means the update is
       half-applied: new worker, page still running the old modules. */
    if (v && !v.endsWith(BUILD)) b.classList.add('bad');
  });

  return el('div', { class: 'card stack' }, [
    el('div', { class: 'row between' }, [
      el('span', { class: 'tiny dim', text: 'גרסת האפליקציה' }),
      el('b', { class: 'tiny', text: BUILD })
    ]),
    swLine,
    el('p', {
      class: 'tiny dim', style: { margin: 0, lineHeight: '1.55' },
      text: 'האפליקציה בודקת עדכון בכל פתיחה ומתעדכנת לבד. אם המספר כאן נמוך מזה שפורסם, הכפתור מנקה את כל המטמון ומוריד הכל מחדש. הנתונים שלך לא נמחקים.'
    }),
    el('button', {
      class: 'btn full',
      onclick: async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true; btn.textContent = 'מרענן…';
        try {
          const regs = await navigator.serviceWorker?.getRegistrations?.() || [];
          await Promise.all(regs.map((r) => r.unregister()));
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        } catch { /* nothing cached is still a clean state */ }
        /* A query string the browser has never seen cannot come from its
           HTTP cache, which is the whole point on a device that stored the
           old files as long-lived. */
        location.replace(`${location.pathname}?fresh=${Date.now()}${location.hash}`);
      }
    }, [icon(ICONS.sync, 18), 'אלץ עדכון מלא']),
    el('p', {
      class: 'tiny dim', style: { margin: 0 },
      text: 'הנתונים נשמרים ב-IndexedDB ולא במטמון, ולכן ריענון לא מוחק אימונים.'
    })
  ]);
}

/* ---------- account-free cloud backup ---------- */

async function cloudCard(ctx, cloudOn) {
  const box = el('div', { class: 'card stack' });

  if (!cloudOn) {
    box.appendChild(el('p', {
      class: 'tiny dim', style: { margin: 0, lineHeight: '1.55' },
      text: 'הגיבוי בענן עובד כשהאתר מתארח ב-Netlify עם הפונקציות פעילות. בינתיים אפשר לייצא קובץ גיבוי מהמקטע "נתונים".'
    }));
    return box;
  }

  const code = await cloud.recoveryCode();
  const when = await cloud.lastBackup();

  box.appendChild(el('p', {
    class: 'tiny dim', style: { margin: 0, lineHeight: '1.55' },
    text: 'גיבוי בלחיצה אחת, בלי חשבון ובלי הרשמה. שמור את קוד השחזור — הוא כל מה שצריך כדי למשוך את הנתונים לטלפון אחר, וכל מי שמחזיק בו יכול לגשת אליהם.'
  }));

  const codeBox = el('div', { class: 'code-box', dir: 'ltr' }, [
    el('code', { text: code }),
    el('button', {
      class: 'btn sm', text: 'העתק',
      onclick: async () => {
        try {
          await navigator.clipboard.writeText(code);
          toast('הקוד הועתק', 'ok');
        } catch {
          toast('העתק ידנית מהשדה', 'bad');
        }
      }
    })
  ]);
  box.appendChild(codeBox);

  box.appendChild(el('button', {
    class: 'btn primary full',
    onclick: async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      const label = btn.textContent;
      btn.textContent = 'מגבה…';
      try {
        await cloud.backUp();
        toast('הגיבוי נשמר בענן', 'ok');
        ctx.reload();
      } catch (err) {
        toast(err.message, 'bad');
        btn.disabled = false;
        btn.textContent = label;
      }
    }
  }, [icon(ICONS.cloud, 18), 'גבה עכשיו']));

  box.appendChild(el('button', {
    class: 'btn full',
    onclick: () => restoreSheet(ctx)
  }, [icon(ICONS.download, 18), 'שחזור מקוד']));

  box.appendChild(toggle('גיבוי אוטומטי בסוף כל אימון',
    (await db.setting('cloudAuto', true)) !== false,
    (v) => db.setSetting('cloudAuto', v)));

  box.appendChild(el('div', {
    class: 'tiny dim',
    text: when ? `גובה לאחרונה: ${new Date(when).toLocaleString('he-IL')}` : 'עוד לא גובה'
  }));

  return box;
}

function restoreSheet(ctx) {
  openSheet('שחזור מקוד', (close) => {
    const field = el('input', { type: 'text', dir: 'ltr', placeholder: 'קוד שחזור' });
    return el('div', { class: 'stack' }, [
      el('p', { class: 'tiny dim', style: { margin: 0 }, text: 'הדבק את קוד השחזור מהמכשיר הקודם. הנתונים ימוזגו עם מה שכבר קיים כאן.' }),
      field,
      el('button', {
        class: 'btn primary full', text: 'שחזר',
        onclick: async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true;
          try {
            const { count } = await cloud.restore(field.value.trim());
            close();
            toast(`שוחזרו ${count} רשומות`, 'ok');
            setTimeout(() => location.reload(), 700);
          } catch (err) {
            toast(err.message, 'bad');
            btn.disabled = false;
          }
        }
      })
    ]);
  });
}

/* ---------- Google account ---------- */

async function accountCard(ctx) {
  const card = el('div', { class: 'card stack' });
  const account = await gdrive.currentAccount();
  const ready = await gdrive.configured();
  const last = await gdrive.lastSync();

  if (account) {
    card.appendChild(el('div', { class: 'acct' }, [
      el('div', { class: 'acct-avatar' }, [
        account.picture
          ? el('img', { src: account.picture, alt: '', referrerpolicy: 'no-referrer' })
          : icon(ICONS.user, 22)
      ]),
      el('div', { class: 'grow' }, [
        el('b', { style: { display: 'block', fontSize: '14.5px' }, text: account.name || 'מחובר' }),
        el('small', { class: 'dim', text: account.email || '' })
      ]),
      el('span', { class: 'badge ok', text: 'מחובר' })
    ]));

    card.appendChild(el('div', { class: 'tiny dim', text: last
      ? `סונכרן לאחרונה: ${new Date(last.at).toLocaleString('he-IL')} (${last.dir === 'up' ? 'העלאה' : 'הורדה'})`
      : 'עוד לא סונכרן' }));

    card.appendChild(el('div', { class: 'row', style: { gap: '8px' } }, [
      el('button', {
        class: 'btn sm grow primary',
        onclick: (e) => busy(e, 'מעלה…', async () => {
          const r = await gdrive.syncUp();
          toast(`הגיבוי הועלה (${Math.round(r.bytes / 1024)}KB)`, 'ok');
          ctx.reload();
        })
      }, [icon(ICONS.upload, 16), 'העלה לענן']),
      el('button', {
        class: 'btn sm grow',
        onclick: (e) => busy(e, 'מוריד…', async () => {
          if (!await confirmSheet('לשחזר מהענן?', 'הנתונים מהענן ימוזגו לנתונים שבמכשיר הזה.', 'שחזר', false)) return;
          const r = await gdrive.syncDown();
          toast(`שוחזרו ${r.count} רשומות`, 'ok');
          setTimeout(() => location.reload(), 800);
        })
      }, [icon(ICONS.download, 16), 'הורד מהענן'])
    ]));

    card.appendChild(toggle('סנכרון אוטומטי בסיום אימון', ctx.settings.autoSync === true, (v) => ctx.saveSetting('autoSync', v)));

    card.appendChild(el('button', {
      class: 'btn sm full ghost danger', text: 'התנתק',
      onclick: async () => { await gdrive.signOut(); toast('התנתקת'); ctx.reload(); }
    }));
    return card;
  }

  card.appendChild(el('p', {
    class: 'tiny dim', style: { margin: 0, lineHeight: '1.55' },
    text: 'התחברות עם Google מסנכרנת את האימונים בין המכשירים. הגיבוי נשמר בתיקייה מוסתרת של האפליקציה ב-Drive שלך — לא גלויה בקבצים שלך, ואף אחד חוץ מהאפליקציה לא יכול לקרוא אותה. אין שרת באמצע.'
  }));

  if (ready) {
    card.appendChild(el('button', {
      class: 'btn primary full',
      onclick: (e) => busy(e, 'מתחבר…', async () => {
        const p = await gdrive.signIn();
        toast(`שלום ${p.name || p.email}`, 'ok');
        ctx.reload();
      })
    }, [icon(ICONS.google, 18), 'התחבר עם Google']));
  } else {
    card.appendChild(el('div', {
      class: 'tiny', style: { color: 'var(--warn)' },
      text: 'כדי להפעיל את זה צריך Client ID משלך מ-Google Cloud Console (חינם). זה לוקח כ-3 דקות.'
    }));
  }

  const idInput = el('input', {
    type: 'text', placeholder: '…apps.googleusercontent.com', autocomplete: 'off',
    value: await gdrive.getClientId()
  });
  card.appendChild(el('label', { class: 'field-label', text: 'Google OAuth Client ID' }));
  card.appendChild(idInput);
  card.appendChild(el('div', { class: 'row', style: { gap: '8px' } }, [
    el('button', {
      class: 'btn sm grow', text: 'שמור',
      onclick: async () => { await gdrive.setClientId(idInput.value); toast('נשמר', 'ok'); ctx.reload(); }
    }),
    el('button', {
      class: 'btn sm grow ghost', text: 'איך משיגים?',
      onclick: () => openSheet('חיבור חשבון Google', () => el('div', { class: 'stack' }, [
        el('p', { class: 'tiny dim', style: { margin: 0 }, text: 'פעם אחת בלבד, והאפליקציה מסנכרנת בין כל המכשירים שלך:' }),
        ...[
          'היכנס ל-console.cloud.google.com וצור פרויקט חדש.',
          'ב-"APIs & Services" → "Library" הפעל את Google Drive API.',
          'ב-"OAuth consent screen" בחר External, מלא שם ואימייל, והוסף את עצמך תחת Test users.',
          'ב-"Credentials" → "Create credentials" → "OAuth client ID" → Web application.',
          'תחת Authorized JavaScript origins הוסף את כתובת האתר שלך (למשל https://ironlog.netlify.app).',
          'העתק את ה-Client ID והדבק אותו כאן.'
        ].map((t, i) => el('div', { class: 'ex-row' }, [
          el('div', { class: 'ex-ord', text: String(i + 1) }),
          el('div', { class: 'grow tiny', text: t })
        ])),
        el('p', { class: 'tiny dim', style: { margin: 0 }, text: 'הרשאת הגישה היא ל-appDataFolder בלבד — תיקייה פרטית של האפליקציה. אין לאפליקציה גישה לשאר הקבצים ב-Drive שלך.' })
      ]))
    })
  ]));

  return card;
}

/** Run an async action with the button showing progress and errors. */
async function busy(e, label, fn) {
  const btn = e.currentTarget;
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = label;
  try {
    await fn();
  } catch (err) {
    toast(err.message, 'bad');
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
  }
}

/* ---------- field helpers ---------- */

/**
 * A number you nudge rather than type. Typing a weight on a phone means
 * summoning a keyboard, missing the field, and fixing a typo; two big targets
 * and a held finger do not.
 */
function stepper(label, value, step, min, max, unit, onSave) {
  let v = Number(value) || min;
  const read = el('b', { class: 'num', text: String(v) });

  const commit = async (next) => {
    const clamped = Math.min(max, Math.max(min, Math.round(next / step) * step));
    if (clamped === v) return;
    v = Math.round(clamped * 100) / 100;
    read.textContent = String(v);
    buzz(6);
    await onSave(v);
  };

  /* Holding the button accelerates, so 75 → 110 kg is not 70 taps. */
  const hold = (dir) => {
    const btn = el('button', {
      class: 'step-btn', 'aria-label': dir > 0 ? `הגדל ${label}` : `הקטן ${label}`
    }, [icon(dir > 0 ? ICONS.plus : ICONS.minus, 18)]);
    let timer = null;
    let speed = 0;
    const start = (e) => {
      e.preventDefault();
      commit(v + dir * step);
      speed = 0;
      timer = setInterval(() => { speed += 1; commit(v + dir * step * (speed > 8 ? 4 : 1)); }, 110);
    };
    const stop = () => { clearInterval(timer); timer = null; };
    btn.addEventListener('pointerdown', start);
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => btn.addEventListener(ev, stop));
    return btn;
  };

  return el('div', { class: 'stepper' }, [
    el('div', { class: 'grow' }, [
      el('span', { class: 'step-label', text: label }),
      el('div', { class: 'step-read' }, [read, el('small', { text: unit })])
    ]),
    hold(-1),
    hold(1)
  ]);
}

/** Bars come in two lengths in almost every gym; the picture says which. */
function barPicker(ctx, s) {
  const BARS = [
    { kg: 20, name: 'מוט אולימפי', desc: 'הסטנדרטי, 2.2 מטר' },
    { kg: 15, name: 'מוט נשים', desc: 'אולימפי קצר, 2.0 מטר' },
    { kg: 10, name: 'מוט קצר / EZ', desc: 'מוט מתולתל או קצר' },
    { kg: 7, name: 'מוט קל', desc: 'אלומיניום, שיעורי גוף' }
  ];
  const row = el('div', { class: 'pick-row' });
  BARS.forEach((b) => {
    const node = el('button', { class: `pick-tile${s.barWeight === b.kg ? ' on' : ''}` }, [
      el('b', { class: 'num', text: `${b.kg}` }),
      el('span', { text: b.name })
    ]);
    node.addEventListener('click', async () => {
      row.querySelectorAll('.pick-tile').forEach((t) => t.classList.remove('on'));
      node.classList.add('on');
      buzz(8);
      await ctx.saveSetting('barWeight', b.kg);
      toast(`${b.name} · ${b.kg} ק״ג`, 'ok');
    });
    row.appendChild(node);
  });
  return el('div', {}, [el('label', { class: 'field-label', text: 'משקל המוט' }), row]);
}

/** Plates are physical objects with standard colours — so show the objects. */
function platePicker(ctx, s) {
  const ALL = [25, 20, 15, 10, 5, 2.5, 1.25, 1, 0.5];
  const owned = new Set(s.plates || DEFAULTS.plates);
  const row = el('div', { class: 'plate-row' });

  ALL.forEach((kg) => {
    const node = el('button', {
      class: `plate-pick${owned.has(kg) ? ' on' : ''}`,
      'aria-label': `${kg} קילו`,
      style: { '--plate': PLATE_COLORS[kg] || '#888' }
    }, [el('span', { class: 'num', text: String(kg) })]);
    node.addEventListener('click', async () => {
      if (owned.has(kg)) owned.delete(kg); else owned.add(kg);
      if (!owned.size) { owned.add(kg); return toast('צריך לפחות סוג פלטה אחד', 'bad'); }
      node.classList.toggle('on', owned.has(kg));
      buzz(8);
      await ctx.saveSetting('plates', [...owned].sort((a, b) => b - a));
    });
    row.appendChild(node);
  });

  return el('div', {}, [
    el('label', { class: 'field-label', text: 'אילו פלטות יש בחדר הכושר שלך?' }),
    row,
    el('div', { class: 'tiny dim', style: { marginTop: '6px' }, text: 'מחשבון הפלטות ועיגול המשקלים ישתמשו רק במה שסימנת.' })
  ]);
}

const THEME_COLORS = ['#FF5C00', '#FF3B6B', '#4DA3FF', '#34D06A', '#B98BFF', '#FFC93D', '#2DD4CF'];

/** The accent is a single CSS variable, so switching it re-themes the whole
    app immediately — nothing here re-renders the screen. */
function themePicker(ctx, s) {
  const current = s.themeColor || DEFAULTS.themeColor;
  const row = el('div', { class: 'plate-row' });

  THEME_COLORS.forEach((color) => {
    const node = el('button', {
      class: `theme-pick${current.toLowerCase() === color.toLowerCase() ? ' on' : ''}`,
      'aria-label': color,
      style: { '--plate': color }
    }, [icon(ICONS.check, 16)]);
    node.addEventListener('click', async () => {
      row.querySelectorAll('.theme-pick').forEach((n) => n.classList.remove('on'));
      node.classList.add('on');
      buzz(8);
      await ctx.saveSetting('themeColor', color);
    });
    row.appendChild(node);
  });

  return el('div', {}, [
    el('label', { class: 'field-label', text: 'צבע הדגשה' }),
    row
  ]);
}


function toggle(label, on, onChange) {
  const btn = el('button', {
    class: 'row between',
    style: { width: '100%', padding: '6px 0' },
    onclick: async () => {
      on = !on;
      paint();
      await onChange(on);
    }
  });
  const knob = el('i', {});
  const track = el('span', {});
  function paint() {
    btn.innerHTML = '';
    Object.assign(track.style, {
      display: 'inline-block', width: '46px', height: '28px', borderRadius: '999px',
      background: on ? 'var(--accent)' : 'var(--surface-3)',
      position: 'relative', transition: 'background .18s', flex: 'none'
    });
    Object.assign(knob.style, {
      position: 'absolute', top: '3px', width: '22px', height: '22px', borderRadius: '50%',
      background: on ? 'var(--accent-ink)' : '#6E6E7A',
      insetInlineStart: on ? '21px' : '3px', transition: 'inset-inline-start .18s'
    });
    track.appendChild(knob);
    btn.appendChild(el('span', { class: 'grow', style: { textAlign: 'start', fontSize: '14.5px' }, text: label }));
    btn.appendChild(track);
  }
  paint();
  return btn;
}

/* ---------- backup ---------- */

async function exportBackup() {
  try {
    const payload = await db.exportAll();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', {
      href: url,
      download: `ironlog-backup-${new Date().toISOString().slice(0, 10)}.json`
    });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('הגיבוי נוצר', 'ok');
  } catch (e) {
    toast(`ייצוא נכשל: ${e.message}`, 'bad');
  }
}

function importBackup(ctx) {
  const input = el('input', { type: 'file', accept: 'application/json,.json', style: { display: 'none' } });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      const n = await db.importAll(payload, { merge: true });
      toast(`שוחזרו ${n} רשומות`, 'ok');
      setTimeout(() => location.reload(), 700);
    } catch (e) {
      toast(`שחזור נכשל: ${e.message}`, 'bad');
    } finally {
      input.remove();
    }
  });
  document.body.appendChild(input);
  input.click();
}
