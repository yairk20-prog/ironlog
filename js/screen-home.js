/* ==========================================================================
   screen-home.js — "היום": what to train next, streak, week strip, quick stats.
   ========================================================================== */

import * as db from './db.js';
import { el, icon, ICONS } from './ui.js';
import { GOALS, ROTATIONS, DAY_TYPES, TEMPLATES, restFor } from './programs.js';
import { exerciseName } from './exercises.js';
import { frameUrl, hasImages, thumb } from './media.js';
import { fmtDuration, todayISO, HEB_DAYS } from './logic.js';
import {
  getActive, nextUp, createFromTemplate, advanceRotation,
  recentWorkouts, workoutSummary, streak
} from './session.js';

export async function render(ctx) {
  const { settings } = ctx;
  ctx.setTitle(
    settings.userName ? `היי ${settings.userName}` : 'היום',
    new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })
  );

  const wrap = el('div', { class: 'stack' });

  const active = await getActive();
  const up = await nextUp(settings);
  const done = await recentWorkouts(60);
  const stk = await streak();

  /* ---- hero: resume or start ---- */
  wrap.appendChild(active
    ? heroResume(ctx, active)
    : up.template
      ? heroStart(ctx, up.template, settings)
      : heroRest(ctx, up));

  /* What is coming, as information rather than controls: the list answers
     "what am I doing today" without adding a single thing to tap. */
  const preview = active?.slots || up.template?.slots;
  if (preview?.length) {
    wrap.appendChild(el('div', { class: 'section-title', text: 'התרגילים היום' }));
    wrap.appendChild(el('div', { class: 'today-list' }, preview.map((slot, i) => {
      const id = slot.ex;
      const reps = slot.seconds ? `${slot.seconds} שניות` : `${slot.sets || slot.s} סטים`;
      return el('div', { class: `today-row${slot.done ? ' done' : ''}` }, [
        hasImages(id) ? thumb(id, '') : el('div', { class: 'ex-ord', text: String(i + 1) }),
        el('div', { class: 'grow' }, [
          el('b', { text: exerciseName(id) }),
          el('small', { text: reps })
        ]),
        slot.done ? icon(ICONS.check, 16) : null
      ]);
    })));
  }

  /* Everything below is a progress report, and a progress report with no
     progress in it is noise. It appears as there is something to say. */
  if (done.length) {
    const week = done.filter((w) => withinDays(w.date, 7));
    const weekVolume = (await Promise.all(week.map((w) => workoutSummary(w.id))))
      .reduce((s, x) => s + x.volume, 0);

    wrap.appendChild(el('div', { class: 'stats' }, [
      stat(String(stk), 'רצף ימים'),
      stat(String(week.length), 'אימונים השבוע'),
      stat(weekVolume >= 1000 ? `${(weekVolume / 1000).toFixed(1)}ט׳` : String(Math.round(weekVolume)), 'נפח שבועי')
    ]));

    wrap.appendChild(el('div', { class: 'section-title', text: '7 הימים האחרונים' }));
    wrap.appendChild(weekStrip(done));

    wrap.appendChild(el('div', { class: 'section-title', text: 'אימונים אחרונים' }));
    for (const w of done.slice(0, 3)) {
      const sum = await workoutSummary(w.id);
      const pic = w.slots?.find((s) => hasImages(s.ex))?.ex;
      wrap.appendChild(el('button', {
        class: 'list-link',
        onclick: () => ctx.go('history')
      }, [
        pic ? thumb(pic, w.name) : el('div', { class: 'ex-ord', text: DAY_TYPES[w.type]?.short || '' }),
        el('div', { class: 'grow' }, [
          el('b', { text: w.name }),
          el('small', { text: `${new Date(w.finished_at).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })} · ${sum.sets} סטים · ${Math.round(sum.volume)} ק״ג נפח` })
        ]),
        icon(ICONS.chevron, 18)
      ]));
    }
  }

  return wrap;
}

/* ---------- hero variants ---------- */

function heroResume(ctx, active) {
  const mins = Math.round((Date.now() - active.started_at) / 60000);
  const lead = active.slots.find((s) => hasImages(s.ex))?.ex;
  return el('div', { class: 'hero' }, [
    lead ? el('img', { class: 'hero-bg', src: frameUrl(lead, 0), alt: '', loading: 'lazy' }) : null,
    el('div', { class: 'hero-kicker', text: 'אימון פעיל' }),
    el('h2', { text: active.name }),
    el('p', { text: `התחיל לפני ${mins} דקות · ${active.slots.filter((s) => s.done).length}/${active.slots.length} תרגילים` }),
    el('button', {
      class: 'btn primary full',
      onclick: () => ctx.go('workout')
    }, [icon(ICONS.play, 18), 'המשך אימון'])
  ]);
}

function heroStart(ctx, tpl, settings) {
  /* The exercises are listed below in full, so the hero says how big the
     session is instead of repeating the first three names. */
  const sets = tpl.slots.reduce((n, x) => n + (x.s || 3), 0);
  const mins = Math.round((sets * (restFor(settings.goal, null) + 45)) / 60 / 5) * 5;
  const lead = tpl.slots.find((s) => hasImages(s.ex))?.ex;
  return el('div', { class: 'hero' }, [
    lead ? el('img', { class: 'hero-bg', src: frameUrl(lead, 0), alt: '', loading: 'lazy' }) : null,
    el('div', { class: 'hero-kicker', text: `${DAY_TYPES[tpl.type]?.name || ''} · ${GOALS[settings.goal]?.name || ''}` }),
    el('h2', { text: tpl.name }),
    el('p', { text: `${tpl.slots.length} תרגילים · ${sets} סטים · כ-${mins} דקות` }),
    el('button', {
      class: 'btn primary full',
      onclick: async () => {
        await createFromTemplate(tpl.id, settings);
        ctx.go('workout');
      }
    }, [icon(ICONS.play, 18), 'התחל אימון'])
  ]);
}

function heroRest(ctx, up) {
  return el('div', { class: 'hero' }, [
    el('div', { class: 'hero-kicker', text: 'לפי התוכנית' }),
    el('h2', { text: 'יום מנוחה' }),
    el('p', { text: 'השריר גדל במנוחה. אפשר לעשות סשן יציבה קצר או לדלג ליום הבא.' }),
    el('div', { class: 'row', style: { marginTop: '14px', gap: '8px' } }, [
      el('button', {
        class: 'btn full',
        style: { flex: '1' },
        onclick: async () => {
          await createFromTemplate('posture', ctx.settings);
          ctx.go('workout');
        }
      }, [icon(ICONS.spark, 17), 'סשן יציבה']),
      el('button', {
        class: 'btn full primary',
        style: { flex: '1' },
        onclick: async () => { await advanceRotation(1); ctx.reload(); }
      }, [icon(ICONS.chevron, 17), 'דלג ליום הבא'])
    ])
  ]);
}

/* ---------- bits ---------- */

const stat = (value, label) => el('div', { class: 'stat' }, [
  el('b', { class: 'num', text: value }),
  el('span', { text: label })
]);

function weekStrip(done) {
  const doneDates = new Map(done.map((w) => [w.date, w]));
  const strip = el('div', { class: 'week' });
  const today = todayISO();
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = todayISO(d);
    const w = doneDates.get(iso);
    strip.appendChild(el('div', {
      class: `day${w ? ' done' : ''}${iso === today ? ' today' : ''}${!w && iso !== today ? ' rest' : ''}`
    }, [
      el('small', { text: HEB_DAYS[d.getDay()] }),
      el('b', { text: w ? (DAY_TYPES[w.type]?.short || '✓') : String(d.getDate()) })
    ]));
  }
  return strip;
}

function withinDays(iso, days) {
  const then = new Date(`${iso}T00:00:00`).getTime();
  return Date.now() - then <= days * 86400000;
}
