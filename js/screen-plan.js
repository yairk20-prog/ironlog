/* ==========================================================================
   screen-plan.js — the rotation: what each day of the split contains,
   plus starting any day out of order and shifting the schedule.
   ========================================================================== */

import * as db from './db.js';
import { el, icon, ICONS, toast, openSheet } from './ui.js';
import { ROTATIONS, TEMPLATES, DAY_TYPES, GOALS, repRange } from './programs.js';
import { getExercise, CATEGORIES } from './exercises.js';
import { createFromTemplate, getActive, nextUp, advanceRotation, resolveExercise } from './session.js';
import { thumb, exerciseDetail, hasImages, frameUrl } from './media.js';

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
      wrap.appendChild(el('div', { class: `day-card rest${isNext ? ' next' : ''}` }, [
        el('div', { class: 'day-card-img', text: '😴' }),
        el('div', { class: 'day-card-body' }, [
          el('span', { class: 'day-card-tag', style: { color: 'var(--text-3)' }, text: 'מנוחה' }),
          el('h3', { text: 'יום מנוחה' }),
          el('p', { text: isNext ? 'הבא בתור — השריר גדל היום' : 'התאוששות' })
        ])
      ]));
      return;
    }

    const tpl = TEMPLATES[key];
    wrap.appendChild(dayCard(ctx, tpl, isNext, () => daySheet(ctx, tpl, !!active)));
  });

  return wrap;
}

function daySheet(ctx, tpl, hasActive) {
  openSheet(tpl.name, (close) => {
    const box = el('div', { class: 'stack' });

    const taken = new Set(tpl.slots.map((x) => x.ex));
    const shown = new Set();
    tpl.slots.forEach((s, i) => {
      /* preview exactly what the session will contain, not the raw template */
      const exId = resolveExercise(s.ex, ctx.settings, taken);
      if (exId !== s.ex && shown.has(exId)) return;
      taken.add(exId);
      shown.add(exId);
      const ex = getExercise(exId);
      if (!ex) return;
      const swapped = exId !== s.ex;
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
        ]),
        swapped ? el('span', { class: 'badge accent', text: 'הותאם' }) : null
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


/** Visual card for one day of the split, led by its first compound lift. */
export function dayCard(ctx, tpl, isNext, onclick) {
  const type = DAY_TYPES[tpl.type] || DAY_TYPES.Custom;

  /* count what the session will really contain after equipment swaps */
  const taken = new Set(tpl.slots.map((x) => x.ex));
  const resolved = [];
  const seen = new Set();
  tpl.slots.forEach((slot) => {
    const id = resolveExercise(slot.ex, ctx.settings, taken);
    if (id !== slot.ex && seen.has(id)) return;
    taken.add(id);
    seen.add(id);
    resolved.push({ id, s: slot.s });
  });

  const lead = resolved.map((r) => r.id).find((id) => hasImages(id));
  const sets = resolved.reduce((sum, x) => sum + x.s, 0);

  return el('button', { class: `day-card${isNext ? ' next' : ''}`, onclick }, [
    el('div', { class: 'day-card-img' }, [
      lead ? el('img', { src: frameUrl(lead, 0), alt: '', loading: 'lazy', decoding: 'async' }) : null
    ]),
    el('div', { class: 'day-card-body' }, [
      el('span', { class: 'day-card-tag', style: { color: type.color } }, [
        el('span', { text: `● ${type.name}` })
      ]),
      el('h3', { text: tpl.name }),
      el('p', { text: `${resolved.length} תרגילים · ${sets} סטים${isNext ? ' · הבא בתור' : ''}` })
    ])
  ]);
}
