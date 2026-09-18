/* ==========================================================================
   screen-settings.js — goal, equipment, gym hardware, data backup.
   ========================================================================== */

import * as db from './db.js';
import { el, icon, ICONS, toast, openSheet, confirmSheet } from './ui.js';
import { GOALS, ROTATIONS, DEFAULTS } from './programs.js';
import { proteinTarget } from './logic.js';
import * as ai from './ai.js';
import * as gdrive from './gdrive.js';

export async function render(ctx) {
  const s = ctx.settings;
  ctx.setTitle('הגדרות');
  const wrap = el('div', { class: 'stack' });

  /* ---- goal ---- */
  wrap.appendChild(el('div', { class: 'section-title', text: 'מצב מטרה' }));
  Object.values(GOALS).forEach((g) => {
    wrap.appendChild(el('button', {
      class: `opt${s.goal === g.id ? ' on' : ''}`,
      onclick: async () => { await ctx.saveSetting('goal', g.id); ctx.reload(); }
    }, [
      el('div', { class: 'grow' }, [
        el('b', { text: g.name }),
        el('small', { text: g.desc })
      ]),
      s.goal === g.id ? icon(ICONS.check, 18) : null
    ]));
  });

  /* ---- split ---- */
  wrap.appendChild(el('div', { class: 'section-title', text: 'פיצול שבועי' }));
  Object.values(ROTATIONS).forEach((r) => {
    wrap.appendChild(el('button', {
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

  /* ---- body & gym ---- */
  wrap.appendChild(el('div', { class: 'section-title', text: 'גוף וציוד' }));
  wrap.appendChild(el('div', { class: 'card stack' }, [
    numberField('משקל גוף (ק״ג)', s.bodyweight, (v) => ctx.saveSetting('bodyweight', v), 0.1),
    numberField('גובה (ס״מ)', s.height || 175, (v) => ctx.saveSetting('height', v), 1),
    numberField('גיל', s.age || 30, (v) => ctx.saveSetting('age', v), 1),
    el('div', { class: 'tiny dim', text: `יעד חלבון ביום אימון: ${proteinTarget(s.bodyweight, true, s.goal)} גרם · ביום מנוחה: ${proteinTarget(s.bodyweight, false, s.goal)} גרם` }),
    el('div', { class: 'divider' }),
    numberField('משקל המוט (ק״ג)', s.barWeight, (v) => ctx.saveSetting('barWeight', v), 0.5),
    numberField('קפיצת משקל מינימלית במכונות (ק״ג)', s.increment, (v) => ctx.saveSetting('increment', v), 0.5),
    el('div', {}, [
      el('label', { class: 'field-label', text: 'פלטות זמינות בחדר הכושר (ק״ג, מופרדות בפסיק)' }),
      el('input', {
        type: 'text',
        value: (s.plates || DEFAULTS.plates).join(', '),
        onchange: async (e) => {
          const list = e.target.value.split(',')
            .map((x) => Number(x.trim()))
            .filter((x) => x > 0)
            .sort((a, b) => b - a);
          if (!list.length) { toast('רשימת פלטות לא תקינה', 'bad'); return; }
          await ctx.saveSetting('plates', list);
          toast('נשמר', 'ok');
        }
      })
    ])
  ]));

  /* ---- behaviour ---- */
  wrap.appendChild(el('div', { class: 'section-title', text: 'התנהגות' }));
  wrap.appendChild(el('div', { class: 'card stack' }, [
    toggle('טיימר מנוחה אוטומטי', s.autoTimer !== false, (v) => ctx.saveSetting('autoTimer', v)),
    toggle('רטט במכשיר', s.vibrate !== false, (v) => ctx.saveSetting('vibrate', v)),
    toggle('הצע סטי חימום לתרגילים כבדים', s.warmupOn !== false, (v) => ctx.saveSetting('warmupOn', v))
  ]));

  /* ---- Google account ---- */
  wrap.appendChild(el('div', { class: 'section-title', text: 'חשבון Google וסנכרון' }));
  wrap.appendChild(await accountCard(ctx));

  /* ---- AI ---- */
  wrap.appendChild(el('div', { class: 'section-title', text: 'מאמן AI וניתוח תזונה' }));
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
  if (hostedCoach) {
    wrap.appendChild(el('div', { class: 'card stack' }, [
      el('div', { class: 'row', style: { gap: '9px' } }, [
        icon(ICONS.check, 18),
        el('b', { text: 'המאמן פעיל — אין צורך במפתח' })
      ]),
      el('p', {
        class: 'tiny dim', style: { margin: 0, lineHeight: '1.55' },
        text: 'האתר הזה מריץ את המאמן דרך שרת משלו, כך שהצ׳אט וניתוח התמונות עובדים לכל מי שנכנס. יש מכסת הודעות יומית כדי למנוע שימוש לרעה.'
      })
    ]));
  }

  if (!hostedCoach) wrap.appendChild(el('div', { class: 'card stack' }, [
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

  /* ---- data ---- */
  wrap.appendChild(el('div', { class: 'section-title', text: 'נתונים' }));
  wrap.appendChild(el('div', { class: 'card stack' }, [
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
  ]));

  wrap.appendChild(el('p', {
    class: 'tiny dim',
    style: { textAlign: 'center', marginTop: '18px' },
    text: 'IRONLOG · כל הנתונים נשמרים מקומית במכשיר. עובד לגמרי ללא אינטרנט.'
  }));

  return wrap;
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

function numberField(label, value, onSave, step = 1) {
  const input = el('input', {
    type: 'number', inputmode: 'decimal', step: String(step), value: String(value ?? ''),
    onchange: async (e) => {
      const v = Number(e.target.value);
      if (!(v > 0)) { toast('ערך לא תקין', 'bad'); return; }
      await onSave(v);
      toast('נשמר', 'ok');
    }
  });
  return el('div', {}, [el('label', { class: 'field-label', text: label }), input]);
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
