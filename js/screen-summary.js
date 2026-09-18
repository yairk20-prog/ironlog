/* ==========================================================================
   screen-summary.js — what you just did.
   Shown right after finishing a session: the numbers, any records broken,
   and a muscle map of everything the session touched.
   ========================================================================== */

import * as db from './db.js';
import { el, icon, ICONS, emptyState } from './ui.js';
import { muscleMap } from './anatomy.js';
import { getExercise, exerciseName, MUSCLES } from './exercises.js';
import { thumb } from './media.js';
import { fmtDuration, oneRM, round2 } from './logic.js';
import { setsOf, recentWorkouts } from './session.js';

export async function render(ctx) {
  ctx.setTitle('סיכום אימון');

  const id = await db.setting('lastFinishedWorkout', null);
  const w = id ? await db.get('workouts', id) : (await recentWorkouts(1))[0];
  if (!w) return emptyState('אין אימון להצגה', 'סיים אימון וסיכום יופיע כאן');

  const logs = (await setsOf(w.id)).filter((l) => !l.is_warmup);
  const volume = logs.reduce((s, l) => s + (l.weight_kg || 0) * (l.reps || 0), 0);
  const reps = logs.reduce((s, l) => s + (l.reps || 0), 0);
  const prs = await findRecords(w, logs);

  const wrap = el('div', { class: 'stack' });

  wrap.appendChild(el('div', { class: 'summary-hero' }, [
    el('div', { class: 's-mark' }, [icon(prs.length ? ICONS.target : ICONS.dumbbell, 30)]),
    el('h2', { text: prs.length ? `${prs.length} שיאים חדשים` : 'אימון הושלם' }),
    el('p', { text: `${w.name} · ${new Date(w.finished_at || Date.now()).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}` })
  ]));

  wrap.appendChild(el('div', { class: 'summary-grid' }, [
    tile(fmtDuration(w.duration_seconds), 'משך', ICONS.timer),
    tile(String(logs.length), 'סטים', ICONS.dumbbell),
    tile(volume >= 1000 ? `${(volume / 1000).toFixed(1)} טון` : `${Math.round(volume)} ק״ג`, 'נפח כולל', ICONS.trend),
    tile(String(reps), 'חזרות', ICONS.spark)
  ]));

  if (prs.length) {
    wrap.appendChild(el('div', { class: 'section-title', text: 'שיאים אישיים' }));
    prs.forEach((p) => wrap.appendChild(el('div', { class: 'pr-row' }, [
      thumb(p.exercise_id, exerciseName(p.exercise_id)),
      el('div', { class: 'grow' }, [
        el('b', { style: { display: 'block', fontSize: '14.5px' }, text: exerciseName(p.exercise_id) }),
        el('small', { class: 'dim', text: `${round2(p.weight)} ק״ג × ${p.reps} · קודם ${round2(p.previous)} ק״ג` })
      ]),
      el('b', { class: 'num', style: { color: 'var(--accent)' }, text: `+${round2(p.e1rm - p.previous)}` })
    ])));
  }

  /* what the session trained */
  const trained = new Set();
  const assisted = new Set();
  w.slots.forEach((s) => {
    const ex = getExercise(s.ex);
    if (!ex) return;
    trained.add(ex.muscle === 'lats' ? 'lats' : ex.muscle);
    (ex.secondary || []).forEach((m) => assisted.add(m));
  });

  wrap.appendChild(el('div', { class: 'section-title', text: 'מה עבד היום' }));
  wrap.appendChild(el('div', { class: 'card' }, [
    muscleMap([...trained], [...assisted], { width: 220 }),
    el('div', { class: 'legend' }, [
      el('span', {}, [el('i', { style: { background: 'var(--accent)' } }), 'שרירים מובילים']),
      el('span', {}, [el('i', { style: { background: 'rgba(255,138,61,.35)' } }), 'שרירי עזר'])
    ]),
    el('p', {
      class: 'tiny dim',
      style: { textAlign: 'center', margin: '8px 0 0' },
      text: [...trained].map((m) => MUSCLES[m] || m).join(' · ')
    })
  ]));

  /* per-exercise breakdown */
  wrap.appendChild(el('div', { class: 'section-title', text: 'פירוט' }));
  const byEx = new Map();
  logs.sort((a, b) => a.set_order - b.set_order).forEach((l) => {
    if (!byEx.has(l.exercise_id)) byEx.set(l.exercise_id, []);
    byEx.get(l.exercise_id).push(l);
  });
  for (const [exId, rows] of byEx) {
    const top = rows.reduce((b, r) => (r.weight_kg > (b?.weight_kg ?? -1) ? r : b), null);
    wrap.appendChild(el('div', { class: 'ex-row' }, [
      thumb(exId, exerciseName(exId)),
      el('div', { class: 'grow' }, [
        el('div', { class: 'ex-name', text: exerciseName(exId) }),
        el('div', { class: 'ex-meta', text: `${rows.length} סטים · סט מוביל ${round2(top?.weight_kg || 0)} ק״ג × ${top?.reps || 0}` })
      ])
    ]));
  }

  wrap.appendChild(el('button', {
    class: 'btn primary full',
    style: { marginTop: '10px' },
    onclick: () => ctx.go('home')
  }, [icon(ICONS.check, 18), 'סיימתי']));

  return wrap;
}

const tile = (value, label, iconPath) => el('div', { class: 'card', style: { padding: '13px' } }, [
  el('div', { class: 'row', style: { gap: '7px', marginBottom: '5px', color: 'var(--text-3)' } }, [
    icon(iconPath, 15),
    el('span', { class: 'tiny', text: label })
  ]),
  el('b', { class: 'num', style: { fontSize: 'var(--fs-stat)', fontWeight: '800' }, text: value })
]);

/**
 * A record is a set in this session whose estimated 1RM beats everything
 * logged for that exercise before it.
 */
async function findRecords(w, logs) {
  const out = [];
  const seen = new Set();

  for (const l of logs) {
    if (!l.weight_kg || !l.reps || seen.has(l.exercise_id)) continue;

    const history = await db.byIndex('set_logs', 'exercise_id', IDBKeyRange.only(l.exercise_id));
    let previous = 0;
    for (const r of history) {
      if (r.is_warmup || r.workout_id === w.id) continue;
      previous = Math.max(previous, oneRM(r.weight_kg, r.reps));
    }
    if (previous <= 0) continue; // first time doing it is not a record

    const best = logs
      .filter((x) => x.exercise_id === l.exercise_id)
      .reduce((b, x) => (oneRM(x.weight_kg, x.reps) > oneRM(b.weight_kg, b.reps) ? x : b));
    const e1rm = oneRM(best.weight_kg, best.reps);

    if (e1rm > previous + 0.01) {
      out.push({ exercise_id: l.exercise_id, weight: best.weight_kg, reps: best.reps, e1rm, previous });
    }
    seen.add(l.exercise_id);
  }
  return out.sort((a, b) => (b.e1rm - b.previous) - (a.e1rm - a.previous));
}
