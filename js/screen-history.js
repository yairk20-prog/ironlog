/* ==========================================================================
   screen-history.js — "התקדמות": bodyweight against a goal, the week in
   numbers, strength trends, then completed sessions, records and volume.
   ========================================================================== */

import * as db from './db.js';
import { el, icon, ICONS, emptyState, openSheet } from './ui.js';
import { DAY_TYPES, goalList } from './programs.js';
import { exerciseName, getExercise, EXERCISES } from './exercises.js';
import { thumb, exerciseDetail } from './media.js';
import { oneRM, fmtW, fmtDuration, round2, todayISO, hebDate, proteinTarget } from './logic.js';
import { lineChart } from './chart.js';
import { weighIns, weightStats, goalLine, weighSheet, weekNumbers } from './progress.js';
import { recentWorkouts, workoutSummary, setsOf, streak } from './session.js';
import { cardioLine, cardioPic, paceOf, weeklyCardioMinutes, WEEKLY_CARDIO_TARGET } from './cardio.js';

export async function render(ctx) {
  ctx.setTitle('התקדמות');

  const wrap = el('div', { class: 'stack' });
  const workouts = await recentWorkouts(60);

  /* ---- bodyweight, against the goal ---- */
  wrap.appendChild(weightCard(ctx, await weighIns()));

  /* ---- the last seven days ---- */
  const profile = { ...ctx.settings, goals: goalList(ctx.settings) };
  const week = await weekNumbers(ctx.settings, (trained) => proteinTarget(profile, trained));
  const stk = await streak();
  wrap.appendChild(el('div', { class: 'section-title', text: '7 הימים האחרונים' }));
  wrap.appendChild(el('div', { class: 'week-nums' }, [
    weekNum(ICONS.dumbbell, week.workouts, 'אימונים', 'var(--accent)'),
    weekNum(ICONS.target, `${week.protein}/7`, 'ימי חלבון ביעד', 'var(--accent)'),
    weekNum(ICONS.glass, `${week.water}/7`, 'ימי מים ביעד', '#4DA3FF'),
    weekNum(ICONS.flame, stk, 'ימים ברצף', 'var(--warn)')
  ]));

  if (!workouts.length) {
    wrap.appendChild(emptyState('אין עדיין אימונים', 'אימונים שתסיים יופיעו כאן עם נפח, סטים ושיאים'));
    return wrap;
  }

  /* ---- strength, lift by lift ---- */
  const lifts = await strengthTrends(3);
  if (lifts.length) {
    wrap.appendChild(el('div', { class: 'section-title', text: 'כוח · 1RM משוער' }));
    wrap.appendChild(el('div', { class: 'card lift-trends' }, lifts.map((l) => el('button', {
      class: 'lift-row', onclick: () => openSheet(exerciseName(l.id), () => exerciseDetail(l.id))
    }, [
      thumb(l.id, exerciseName(l.id)),
      el('div', { class: 'grow' }, [
        el('b', { text: exerciseName(l.id) }),
        el('small', { text: `${l.sessions} אימונים · ${l.delta == null ? 'עוד אין השוואה' : `\u2066${l.delta >= 0 ? '+' : '−'}${Math.abs(Math.round(l.delta * 10) / 10)}\u2069 ק״ג מאז ${l.sinceLabel}`}` })
      ]),
      sparkline(l.points),
      el('b', { class: 'num lift-now', text: String(Math.round(l.now)) })
    ]))));
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

  /* Lifting volume says nothing about a run, so cardio gets its own line —
     only once there is some, so a lifting-only history stays uncluttered. */
  if (workouts.some((w) => w.cardio)) {
    const mins = weeklyCardioMinutes(workouts);
    wrap.appendChild(el('div', { class: 'card stack', style: { gap: '8px' } }, [
      el('div', { class: 'row between' }, [
        el('h3', { style: { margin: 0 }, text: 'אירובי · 7 ימים' }),
        el('b', { class: 'num', text: `${mins} מתוך ${WEEKLY_CARDIO_TARGET} דק׳` })
      ]),
      el('div', { class: 'meter-track' }, [el('i', { style: { width: `${Math.min(100, Math.round((mins / WEEKLY_CARDIO_TARGET) * 100))}%` } })])
    ]));
  }

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
          text: `${new Date(w.finished_at).toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'short' })} · ${w.cardio
            ? cardioLine(w)
            : `${sum.sets} סטים · ${sum.volume ? `${Math.round(sum.volume)} ק״ג` : `${sum.reps} חזרות`} · ${fmtDuration(w.duration_seconds)}`}`
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

    if (w.cardio) {
      const c = w.cardio;
      const pace = paceOf(w.duration_seconds, c.distance_km);
      const rows = [
        ['מרחק', c.distance_km ? `${c.distance_km} ק״מ` : '—'],
        ['קצב ממוצע', pace ? `${pace} לק״מ` : '—'],
        ['קלוריות (הערכה)', `${c.kcal || 0} קק״ל`],
        ['מאמץ', { 2: 'קל מאוד', 4: 'קל', 6: 'בינוני', 8: 'קשה', 10: 'מקסימלי' }[c.rpe] || '—']
      ];
      box.appendChild(el('div', { class: 'card stack', style: { gap: '7px' } }, [
        el('div', { class: 'row', style: { gap: '10px' } }, [thumb(cardioPic(c), ''), el('h3', { text: w.name })]),
        ...rows.map(([k, v]) => el('div', { class: 'row between tiny' }, [el('span', { class: 'dim', text: k }), el('b', { text: v })]))
      ]));
      return box;
    }

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
              el('b', { class: 'num', text: `${r.weight_kg ? `${round2(r.weight_kg)} ק״ג` : (getExercise(exId)?.cat === 'Bodyweight' ? 'משקל גוף' : '0 ק״ג')} × ${r.reps}${r.rir != null ? ` · RIR ${r.rir}` : ''}` })
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

/* ---------- progress pieces ---------- */

function weightCard(ctx, entries) {
  const st = weightStats(entries, ctx.settings.goalWeight);
  const weigh = el('button', { class: 'btn primary grow', onclick: () => weighSheet(ctx) }, [icon(ICONS.scale, 18), 'שקילה']);
  const more = el('button', { class: 'btn grow', onclick: () => ctx.go('body') }, [icon(ICONS.ruler, 18), 'מדידות']);

  if (!st) {
    return el('div', { class: 'card stack weight-card' }, [
      el('div', { class: 'card-head' }, [el('h3', { text: 'משקל' })]),
      el('p', { class: 'tiny dim', style: { margin: 0, lineHeight: '1.55' }, text: 'שקילה פעם-פעמיים בשבוע, בבוקר, מספיקה כדי לראות מגמה אמיתית — ולדעת מתי תגיע ליעד.' }),
      el('div', { class: 'row', style: { gap: '8px' } }, [weigh, more])
    ]);
  }

  /* Down is good when the goal is below where you started, up when it is
     above; with no goal, a change is just a change. */
  const goodDir = st.goal ? Math.sign(st.goal - st.start) : 0;
  const tone = (n) => (!goodDir || !n ? '' : Math.sign(n) === goodDir ? 'good' : 'off');
  const delta = (n, label) => n == null ? null : el('div', { class: 'w-delta' }, [
    el('b', { class: `num ${tone(n)}`, text: `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}` }),
    el('small', { text: label })
  ]);

  const recent = entries.slice(-30);
  const chart = recent.length >= 2 ? lineChart(recent.map((e) => ({ y: e.weight, label: hebDate(e.date) })), { unit: 'ק״ג', height: 120 }) : null;

  return el('div', { class: 'card stack weight-card' }, [
    el('div', { class: 'card-head' }, [
      el('h3', { text: 'משקל' }),
      el('span', { class: 'badge', text: st.daysSinceLast === 0 ? 'נשקלת היום' : `לפני ${st.daysSinceLast} ימים` })
    ]),
    el('div', { class: 'w-top' }, [
      el('div', { class: 'w-now' }, [
        el('b', { class: 'num', text: String(st.current) }),
        el('span', { text: 'ק״ג · ממוצע שבוע' })
      ]),
      el('div', { class: 'w-deltas' }, [
        delta(st.month, 'ב-4 שבועות'),
        delta(st.total, 'מההתחלה')
      ])
    ]),
    st.goal ? el('div', { class: 'goal-bar', role: 'progressbar', 'aria-valuenow': String(st.goalPct), 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': `התקדמות ליעד ${st.goal} ק״ג` }, [
      el('div', { class: 'goal-track' }, [el('i', { style: { width: `${st.goalPct}%` } })]),
      el('div', { class: 'goal-ends' }, [el('small', { text: `${st.start}` }), el('small', { text: `יעד ${st.goal}` })])
    ]) : null,
    el('p', { class: 'tiny w-line', text: goalLine(st) }),
    chart,
    el('div', { class: 'row', style: { gap: '8px' } }, [weigh, more])
  ]);
}

const weekNum = (ico, value, label, color) => el('div', { class: 'week-num', style: { '--c': color } }, [
  icon(ico, 18),
  el('b', { class: 'num', text: String(value) }),
  el('small', { text: label })
]);

/**
 * The lifts done most often, each as its best estimated 1RM per session,
 * and how far it has moved over about a month.
 */
async function strengthTrends(limit = 3) {
  const rows = (await db.all('set_logs')).filter((r) => !r.is_warmup && r.weight_kg > 0 && r.reps > 0);
  const byEx = new Map();
  for (const r of rows) {
    if (!byEx.has(r.exercise_id)) byEx.set(r.exercise_id, new Map());
    const sessions = byEx.get(r.exercise_id);
    const e = oneRM(r.weight_kg, r.reps);
    const cur = sessions.get(r.workout_id);
    if (!cur || e > cur.e) sessions.set(r.workout_id, { e, t: r.timestamp });
  }
  const out = [];
  for (const [id, sessions] of byEx) {
    const pts = [...sessions.values()].sort((a, b) => a.t - b.t);
    if (pts.length < 2) continue;
    const last = pts[pts.length - 1];
    const ref = [...pts].reverse().find((p) => p.t <= last.t - 26 * 86400000) || pts[0];
    out.push({
      id,
      sessions: pts.length,
      now: round2(last.e),
      delta: round2(last.e - ref.e),
      sinceLabel: new Date(ref.t).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' }),
      points: pts.slice(-12).map((p) => p.e)
    });
  }
  return out.sort((a, b) => b.sessions - a.sessions || b.now - a.now).slice(0, limit);
}

/** A trend in 64×24, no axes: the shape is the whole message. */
function sparkline(values) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 64 24');
  svg.setAttribute('class', 'spark');
  svg.setAttribute('aria-hidden', 'true');
  const lo = Math.min(...values), hi = Math.max(...values);
  const span = hi - lo || 1;
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * 62 + 1},${22 - ((v - lo) / span) * 20}`).join(' ');
  svg.innerHTML = `<polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2"/>`;
  return svg;
}
