/* ==========================================================================
   screen-settings.js — goal, equipment, gym hardware, data backup.
   ========================================================================== */

import * as db from './db.js';
import { el, icon, ICONS, toast, openSheet, confirmSheet } from './ui.js';
import { GOALS, ROTATIONS, DEFAULTS } from './programs.js';
import { proteinTarget } from './logic.js';
import * as ai from './ai.js';

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

  /* ---- AI ---- */
  wrap.appendChild(el('div', { class: 'section-title', text: 'מאמן AI וניתוח תזונה' }));
  const currentKey = await ai.getKey();
  const keyInput = el('input', {
    type: 'password',
    placeholder: 'sk-ant-…',
    value: currentKey || '',
    autocomplete: 'off'
  });
  wrap.appendChild(el('div', { class: 'card stack' }, [
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
