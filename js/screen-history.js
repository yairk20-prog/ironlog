/* ==========================================================================
   screen-history.js — completed sessions, per-exercise records and
   a volume trend over the last eight weeks.
   ========================================================================== */

import * as db from './db.js';
import { el, icon, ICONS, emptyState, openSheet } from './ui.js';
import { DAY_TYPES } from './programs.js';
import { exerciseName, getExercise, EXERCISES } from './exercises.js';
import { thumb, exerciseDetail } from './media.js';
import { oneRM, fmtW, fmtDuration, round2, todayISO } from './logic.js';
import { recentWorkouts, workoutSummary, setsOf } from './session.js';

export async function render(ctx) {
  ctx.setTitle('היסטוריה');

  const wrap = el('div', { class: 'stack' });
  const workouts = await recentWorkouts(60);

  if (!workouts.length) {
    wrap.appendChild(emptyState('אין עדיין היסטוריה', 'אימונים שתסיים יופיעו כאן עם נפח, סטים ושיאים'));
    return wrap;
  }

  /* ---- volume trend ---- */
  const weeks = await volumeByWeek(workouts, 8);
  wrap.appendChild(el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [
      el('h3', { text: 'נפח שבועי' }),
      el('span', { class: 'badge', text: '8 שבועות' })
    ]),
    barChart(weeks)
  ]));

  /* ---- records ---- */
  const records = await topRecords();
  if (records.length) {
    wrap.appendChild(el('div', { class: 'section-title', text: 'שיאים אישיים (1RM משוער)' }));
    records.slice(0, 6).forEach((r) => {
      wrap.appendChild(el('button', {
        class: 'ex-row',
        style: { width: '100%', textAlign: 'start' },
        onclick: () => openSheet(exerciseName(r.exercise_id), () => exerciseDetail(r.exercise_id))
      }, [
        thumb(r.exercise_id, exerciseName(r.exercise_id)),
        el('div', { class: 'grow' }, [
          el('div', { class: 'ex-name', text: exerciseName(r.exercise_id) }),
          el('div', { class: 'ex-meta', text: `${round2(r.weight)} ק״ג × ${r.reps} · ${new Date(r.timestamp).toLocaleDateString('he-IL')}` })
        ]),
        el('b', { class: 'num', style: { color: 'var(--accent)' }, text: `${round2(r.e1rm)}` })
      ]));
    });
  }

  /* ---- sessions ---- */
  wrap.appendChild(el('div', { class: 'section-title', text: 'אימונים' }));
  for (const w of workouts) {
    const sum = await workoutSummary(w.id);
    const type = DAY_TYPES[w.type] || DAY_TYPES.Custom;
    wrap.appendChild(el('button', {
      class: 'list-link',
      onclick: () => sessionSheet(w, ctx)
    }, [
      el('div', { class: 'ex-ord', style: { color: type.color }, text: type.short }),
      el('div', { class: 'grow' }, [
        el('b', { text: w.name }),
        el('small', {
          text: `${new Date(w.finished_at).toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'short' })} · ${sum.sets} סטים · ${Math.round(sum.volume)} ק״ג · ${fmtDuration(w.duration_seconds)}`
        })
      ]),
      icon(ICONS.chevron, 18)
    ]));
  }

  return wrap;
}

/* ---------- session detail ---------- */

function sessionSheet(w, ctx) {
  openSheet(w.name, () => {
    const box = el('div', { class: 'stack' });
    box.appendChild(el('p', {
      class: 'tiny dim', style: { margin: 0 },
      text: `${new Date(w.finished_at).toLocaleString('he-IL')} · ${fmtDuration(w.duration_seconds)}`
    }));

    setsOf(w.id).then((logs) => {
      const byEx = new Map();
      logs.sort((a, b) => a.set_order - b.set_order).forEach((l) => {
        if (!byEx.has(l.exercise_id)) byEx.set(l.exercise_id, []);
        byEx.get(l.exercise_id).push(l);
      });

      for (const [exId, rows] of byEx) {
        const working = rows.filter((r) => !r.is_warmup);
        box.appendChild(el('div', { class: 'card' }, [
          el('div', { class: 'card-head' }, [
            el('div', { class: 'row', style: { gap: '10px' } }, [
              thumb(exId, exerciseName(exId)),
              el('h3', { text: exerciseName(exId) })
            ]),
            el('span', { class: 'badge', text: `${working.length} סטים` })
          ]),
          el('div', { class: 'stack', style: { gap: '4px' } },
            working.map((r) => el('div', { class: 'row between tiny' }, [
              el('span', { class: 'dim', text: `סט ${r.set_order}` }),
              el('b', { class: 'num', text: `${round2(r.weight_kg)} ק״ג × ${r.reps}${r.rir != null ? ` · RIR ${r.rir}` : ''}` })
            ])))
        ]));
      }
    });

    return box;
  });
}

/* ---------- analytics ---------- */

async function volumeByWeek(workouts, count) {
  const buckets = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const end = new Date(now); end.setDate(end.getDate() - i * 7);
    const start = new Date(end); start.setDate(start.getDate() - 6);
    buckets.push({ start, end, volume: 0, label: `${start.getDate()}/${start.getMonth() + 1}` });
  }
  for (const w of workouts) {
    const d = new Date(`${w.date}T12:00:00`);
    const b = buckets.find((x) => d >= x.start && d <= x.end);
    if (!b) continue;
    const sum = await workoutSummary(w.id);
    b.volume += sum.volume;
  }
  return buckets;
}

function barChart(buckets) {
  const max = Math.max(1, ...buckets.map((b) => b.volume));
  const chart = el('div', {
    style: { display: 'flex', alignItems: 'flex-end', gap: '6px', height: '110px', marginTop: '4px' }
  });
  buckets.forEach((b, i) => {
    const h = Math.max(3, (b.volume / max) * 88);
    chart.appendChild(el('div', {
      style: { flex: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }
    }, [
      el('div', {
        title: `${Math.round(b.volume)} ק״ג`,
        style: {
          width: '100%',
          height: `${h}px`,
          borderRadius: '5px 5px 2px 2px',
          background: i === buckets.length - 1 ? 'var(--accent)' : 'var(--surface-3)'
        }
      }),
      el('small', { style: { fontSize: '9px', color: 'var(--text-3)' }, text: b.label })
    ]));
  });
  return chart;
}

async function topRecords() {
  const rows = await db.all('set_logs');
  const best = new Map();
  for (const r of rows) {
    if (r.is_warmup || !r.weight_kg) continue;
    const e = oneRM(r.weight_kg, r.reps);
    const cur = best.get(r.exercise_id);
    if (!cur || e > cur.e1rm) {
      best.set(r.exercise_id, { exercise_id: r.exercise_id, e1rm: e, weight: r.weight_kg, reps: r.reps, timestamp: r.timestamp });
    }
  }
  return Array.from(best.values()).sort((a, b) => b.e1rm - a.e1rm);
}
