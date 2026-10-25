/* ==========================================================================
   screen-plan.js — the rotation: what each day of the split contains,
   plus starting any day out of order and shifting the schedule.
   ========================================================================== */

import * as db from './db.js';
import { el, icon, ICONS, toast, openSheet } from './ui.js';
import { ROTATIONS, TEMPLATES, DAY_TYPES, GOALS, repRange, goalList, resolveGoal, planDays } from './programs.js';
import { CARDIO, plannedProgram, buildPhases, totalSeconds } from './cardio.js';
import { getExercise, CATEGORIES } from './exercises.js';
import { createFromTemplate, getActive, nextUp, advanceRotation, resolveExercise, setCardioDays } from './session.js';
import { thumb, exerciseDetail, hasImages, frameUrl } from './media.js';

export async function render(ctx) {
  const { settings } = ctx;
  const rot = ROTATIONS[settings.rotation] || ROTATIONS.ppl6;
  const up = await nextUp(settings);
  const active = await getActive();

  ctx.setTitle('תוכנית', `${rot.name} · ${resolveGoal(goalList(settings)).name}`);
  ctx.setActions([
    el('button', { class: 'btn sm', text: 'החלף פיצול', onclick: () => rotationSheet(ctx) })
  ]);

  const wrap = el('div', { class: 'stack' });

  wrap.appendChild(el('div', { class: 'section-title', text: 'ימי הסבב' }));

  const days = planDays(settings);
  days.forEach((key, i) => {
    const isNext = i === up.cursor;
    if (key === 'cardio') {
      wrap.appendChild(cardioDayCard(settings, isNext, () => ctx.go('cardio')));
      return;
    }
    if (key === 'rest') {
      wrap.appendChild(restDayCard(isNext, isNext ? 'הבא בתור — השריר גדל היום' : 'התאוששות'));
      return;
    }

    const tpl = TEMPLATES[key];
    wrap.appendChild(dayCard(ctx, tpl, isNext, () => daySheet(ctx, tpl, !!active, isNext)));
  });

  /* ---- running and cardio as part of the week ---- */
  wrap.appendChild(el('div', { class: 'section-title', text: 'ריצה ואירובי בתוכנית' }));
  wrap.appendChild(cardioPlanControl(ctx));

  /* A missed day is an occasional problem, so its controls sit after the plan
     rather than on top of it. */
  wrap.appendChild(el('div', { class: 'section-title', text: 'פספסת יום?' }));
  wrap.appendChild(el('div', { class: 'card' }, [
    el('p', { class: 'tiny dim', style: { margin: '0 0 10px' }, text: 'הזז את כל הסבב יום קדימה או אחורה בלי לשבור את הרצף ההיסטורי.' }),
    el('div', { class: 'row', style: { gap: '8px' } }, [
      el('button', {
        class: 'btn sm grow', text: 'יום אחורה',
        onclick: async () => { await advanceRotation(-1); toast('הלו״ז הוזז אחורה'); ctx.reload(); }
      }),
      el('button', {
        class: 'btn sm grow', text: 'יום קדימה',
        onclick: async () => { await advanceRotation(1); toast('הלו״ז הוזז קדימה'); ctx.reload(); }
      })
    ])
  ]));


  return wrap;
}

function daySheet(ctx, tpl, hasActive, isNext) {
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
      const r = repRange(goalList(ctx.settings), ex);
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

    if (!isNext) {
      box.appendChild(el('p', {
        class: 'tiny dim', style: { margin: '2px 0 0' },
        text: 'זה לא היום המתוכנן כרגע — האימון הזה לא יזיז את הסבב, והיום שמחכה בתור יישאר מחכה.'
      }));
    }

    box.appendChild(el('button', {
      class: 'btn primary full',
      style: { marginTop: '6px' },
      text: hasActive ? 'כבר יש אימון פעיל' : 'התחל את האימון הזה',
      disabled: hasActive,
      onclick: async () => {
        await createFromTemplate(tpl.id, ctx.settings, { offPlan: !isNext });
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


/** Visual card for a rest day, matching dayCard's layout. */
/** A planned cardio day: what it will be, how long, and that it counts. */
export function cardioDayCard(settings, isNext, onclick) {
  const p = CARDIO[plannedProgram(settings)];
  const mins = Math.round(totalSeconds(buildPhases(p.id, settings.duration)) / 60);
  return el('button', { class: `day-card cardio-day${isNext ? ' next' : ''}`, onclick }, [
    el('div', { class: 'day-card-img' }, [
      hasImages(p.pic) ? el('img', { src: frameUrl(p.pic, 0), alt: '', loading: 'lazy', decoding: 'async' }) : icon(ICONS.run, 30)
    ]),
    el('div', { class: 'day-card-body' }, [
      el('span', { class: 'day-card-tag', style: { color: DAY_TYPES.Cardio.color } }, [el('span', { text: '● אירובי' })]),
      el('h3', { text: p.name }),
      el('p', { text: `כ-${mins} דקות · חלק מהתוכנית${isNext ? ' · הבא בתור' : ''}` })
    ])
  ]);
}

/**
 * How many cardio days the week has, and which session they open on.
 * Shared by the plan screen and Settings.
 */
export function cardioPlanControl(ctx) {
  const box = el('div', { class: 'card stack cardio-plan' });
  const paint = () => {
    const s = ctx.settings;
    const n = Math.max(0, Math.min(4, Number(s.cardioDays) || 0));
    const kind = CARDIO[s.cardioKind] ? s.cardioKind : 'auto';
    box.replaceChildren(
      el('p', { class: 'tiny dim', style: { margin: 0, lineHeight: '1.55' }, text: 'ימי אירובי נכנסים לסבב כמו ימי כוח: קודם במקום ימי מנוחה (תמיד נשאר יום מנוחה אחד), ואם צריך עוד — אחרי ימי כוח. אימון אירובי ביום כזה נספר והתוכנית מתקדמת.' }),
      el('div', { class: 'field-label', text: 'כמה ימים בשבוע' }),
      el('div', { class: 'seg-row' }, [0, 1, 2, 3, 4].map((v) => el('button', {
        class: `chip${v === n ? ' on' : ''}`, 'aria-pressed': String(v === n), text: v ? String(v) : 'בלי',
        onclick: async () => {
          if (v === n) return;
          await setCardioDays(ctx.settings, v, ctx.saveSetting);
          ctx.reload();
        }
      }))),
      n ? el('div', { class: 'field-label', text: 'איזה אימון' }) : null,
      n ? el('div', { class: 'row', style: { gap: '6px', flexWrap: 'wrap' } }, [
        ['auto', 'לפי ההמלצה'], ...Object.values(CARDIO).map((p) => [p.id, p.name])
      ].map(([id, name]) => el('button', {
        class: `chip${id === kind ? ' on' : ''}`, 'aria-pressed': String(id === kind), text: name,
        onclick: async () => { await ctx.saveSetting('cardioKind', id === 'auto' ? null : id); ctx.reload(); }
      }))) : null
    );
  };
  paint();
  return box;
}

export function restDayCard(isNext, note) {
  return el('div', { class: `day-card rest${isNext ? ' next' : ''}` }, [
    el('div', { class: 'day-card-img rest-img' }, [icon(ICONS.timer, 30)]),
    el('div', { class: 'day-card-body' }, [
      el('span', { class: 'day-card-tag', style: { color: 'var(--text-3)' }, text: 'מנוחה' }),
      el('h3', { text: 'יום מנוחה' }),
      el('p', { text: note })
    ])
  ]);
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
