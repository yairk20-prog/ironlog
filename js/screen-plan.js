/* ==========================================================================
   screen-plan.js — the rotation: what each day of the split contains,
   plus starting any day out of order and shifting the schedule.
   ========================================================================== */

import * as db from './db.js';
import { el, icon, ICONS, toast, openSheet } from './ui.js';
import { ROTATIONS, TEMPLATES, DAY_TYPES, GOALS, repRange } from './programs.js';
import { getExercise, CATEGORIES } from './exercises.js';
import { createFromTemplate, getActive, nextUp, advanceRotation } from './session.js';
import { thumb, exerciseDetail } from './media.js';

export async function render(ctx) {
  const { settings } = ctx;
  const rot = ROTATIONS[settings.rotation] || ROTATIONS.ppl6;
  const up = await nextUp(settings);
  const active = await getActive();

  ctx.setTitle('תוכנית', `${rot.name} · ${GOALS[settings.goal]?.name || ''}`);
  ctx.setActions([
    el('button', { class: 'btn sm', text: 'החלף פיצול', onclick: () => rotationSheet(ctx) })
  ]);

  const wrap = el('div', { class: 'stack' });

  wrap.appendChild(el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [
      el('h3', { text: 'הזזת לו״ז' }),
      el('span', { class: 'badge accent', text: `יום ${(up.cursor % rot.days.length) + 1}` })
    ]),
    el('p', { class: 'tiny dim', style: { margin: '0 0 10px' }, text: 'פספסת אימון? הזז את כל הסבב יום קדימה או אחורה בלי לשבור את הרצף ההיסטורי.' }),
    el('div', { class: 'row', style: { gap: '8px' } }, [
      el('button', {
        class: 'btn sm grow', text: '← יום אחורה',
        onclick: async () => { await advanceRotation(-1); toast('הלו״ז הוזז אחורה'); ctx.reload(); }
      }),
      el('button', {
        class: 'btn sm grow', text: 'יום קדימה →',
        onclick: async () => { await advanceRotation(1); toast('הלו״ז הוזז קדימה'); ctx.reload(); }
      })
    ])
  ]));

  wrap.appendChild(el('div', { class: 'section-title', text: 'ימי הסבב' }));

  rot.days.forEach((key, i) => {
    const isNext = i === up.cursor % rot.days.length;
    if (key === 'rest') {
      wrap.appendChild(el('div', {
        class: 'ex-row',
        style: isNext ? { borderColor: 'var(--accent)' } : {}
      }, [
        el('div', { class: 'ex-ord', text: '—' }),
        el('div', { class: 'grow' }, [
          el('div', { class: 'ex-name', text: 'יום מנוחה' }),
          el('div', { class: 'ex-meta', text: isNext ? 'הבא בתור' : 'התאוששות' })
        ])
      ]));
      return;
    }

    const tpl = TEMPLATES[key];
    const type = DAY_TYPES[tpl.type];
    wrap.appendChild(el('button', {
      class: 'ex-row',
      style: isNext ? { borderColor: 'var(--accent)' } : {},
      onclick: () => daySheet(ctx, tpl, !!active)
    }, [
      el('div', { class: 'ex-ord', style: { color: type.color }, text: type.short }),
      el('div', { class: 'grow', style: { textAlign: 'start' } }, [
        el('div', { class: 'ex-name', text: tpl.name }),
        el('div', { class: 'ex-meta', text: `${tpl.slots.length} תרגילים · ${tpl.slots.reduce((s, x) => s + x.s, 0)} סטים${isNext ? ' · הבא בתור' : ''}` })
      ]),
      icon(ICONS.chevron, 18)
    ]));
  });

  return wrap;
}

function daySheet(ctx, tpl, hasActive) {
  openSheet(tpl.name, (close) => {
    const box = el('div', { class: 'stack' });

    tpl.slots.forEach((s, i) => {
      const ex = getExercise(s.ex);
      if (!ex) return;
      const r = repRange(ctx.settings.goal, ex);
      box.appendChild(el('button', {
        class: 'ex-row',
        style: { width: '100%', textAlign: 'start' },
        onclick: () => openSheet(ex.name, () => exerciseDetail(ex.id))
      }, [
        thumb(ex.id, ex.name),
        el('div', { class: 'grow' }, [
          el('div', { class: 'ex-name', text: ex.name }),
          el('div', { class: 'ex-meta', text: `${s.s} × ${r.min}–${r.max} · ${CATEGORIES[ex.cat]}` })
        ])
      ]));
    });

    box.appendChild(el('button', {
      class: 'btn primary full',
      style: { marginTop: '6px' },
      text: hasActive ? 'כבר יש אימון פעיל' : 'התחל את האימון הזה',
      disabled: hasActive,
      onclick: async () => {
        await createFromTemplate(tpl.id, ctx.settings);
        close();
        ctx.go('workout');
      }
    }));
    return box;
  });
}

function rotationSheet(ctx) {
  openSheet('בחירת פיצול', (close) => {
    const box = el('div', { class: 'stack' });
    Object.values(ROTATIONS).forEach((r) => {
      box.appendChild(el('button', {
        class: `opt${ctx.settings.rotation === r.id ? ' on' : ''}`,
        onclick: async () => {
          await ctx.saveSetting('rotation', r.id);
          await db.setSetting('rotationCursor', 0);
          close();
          ctx.reload();
        }
      }, [
        el('div', { class: 'grow' }, [
          el('b', { text: r.name }),
          el('small', { text: r.desc })
        ])
      ]));
    });
    return box;
  });
}
