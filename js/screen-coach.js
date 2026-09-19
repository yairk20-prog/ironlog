/* ==========================================================================
   screen-coach.js — conversational coach.
   The model is given the live workout state and may return actions that this
   screen applies to the active session (swap, drop, sets, weight, rest).
   Every action is applied locally and is visible in the workout immediately.
   ========================================================================== */

import * as db from './db.js';
import { el, icon, ICONS, toast, emptyState } from './ui.js';
import * as ai from './ai.js';
import { EXERCISES, getExercise, exerciseName, substitutes } from './exercises.js';
import { goalList, resolveGoal } from './programs.js';
import { getActive, saveWorkout, recentWorkouts, workoutSummary, setsOf } from './session.js';
import { restFor } from './programs.js';
import { fmtW, round2 } from './logic.js';

let HISTORY = [];   // [{role, content}]

export async function render(ctx) {
  ctx.setTitle('מאמן אישי');

  const wrap = el('div', { class: 'stack' });
  const keyed = await ai.hasKey();

  if (!keyed) {
    wrap.appendChild(el('div', { class: 'card stack' }, [
      el('h3', { style: { margin: 0 }, text: 'נדרש מפתח Claude API' }),
      el('p', { class: 'tiny dim', style: { margin: 0 }, text: 'המאמן שולח את מצב האימון שלך ישירות ל-api.anthropic.com מהמכשיר הזה. המפתח נשמר מקומית בלבד ולא נשלח לשום מקום אחר.' }),
      el('button', { class: 'btn primary full', text: 'פתח הגדרות', onclick: () => ctx.go('settings') })
    ]));
    wrap.appendChild(quickTools(ctx));
    return wrap;
  }

  const active = await getActive();

  /* quick prompts */
  wrap.appendChild(el('div', { class: 'tool-row' },
    ['כואבת לי הכתף', 'אין לי זמן היום', 'תקוע בלחיצת חזה', 'איך הנפח שלי השבוע?']
      .map((t) => el('button', { class: 'chip', text: t, onclick: () => send(ctx, t, log, active) }))
  ));

  const log = el('div', { class: 'stack' });
  wrap.appendChild(log);
  HISTORY.forEach((m) => log.appendChild(bubble(m.role, typeof m.content === 'string' ? m.content : '')));
  if (!HISTORY.length) {
    log.appendChild(el('div', { class: 'card' }, [
      el('p', { class: 'tiny dim', style: { margin: 0 }, text: active
        ? `אני רואה את האימון הפעיל: ${active.name}. אפשר לבקש ממני לשנות תרגילים, לקצר את האימון או להתאים משקלים.`
        : 'אין אימון פעיל כרגע. אפשר לשאול על התוכנית, על תקיעות או על התאמות לשבוע הקרוב.' })
    ]));
  }

  /* composer */
  const input = el('textarea', { rows: '2', placeholder: 'מה תרצה לשאול?' });
  const sendBtn = el('button', {
    class: 'btn primary', text: 'שלח',
    onclick: () => { const v = input.value.trim(); if (v) { input.value = ''; send(ctx, v, log, active); } }
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) sendBtn.click();
  });
  wrap.appendChild(el('div', { class: 'row', style: { gap: '8px', alignItems: 'flex-end' } }, [
    el('div', { class: 'grow' }, [input]),
    sendBtn
  ]));

  wrap.appendChild(el('button', {
    class: 'btn full ghost', text: 'נקה שיחה',
    onclick: () => { HISTORY = []; ctx.reload(); }
  }));

  wrap.appendChild(quickTools(ctx));
  return wrap;
}

/* ---------- sending ---------- */

async function send(ctx, text, log, active) {
  HISTORY.push({ role: 'user', content: text });
  log.appendChild(bubble('user', text));

  const pending = bubble('assistant', 'חושב…');
  log.appendChild(pending);
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });

  try {
    const context = await buildContext(ctx, active);
    const { text: reply, actions } = await ai.coach(HISTORY, context);
    HISTORY.push({ role: 'assistant', content: reply });
    pending.remove();
    log.appendChild(bubble('assistant', reply));

    if (actions.length && active) {
      const applied = await applyActions(active, actions);
      if (applied.length) {
        log.appendChild(el('div', {
          class: 'card',
          style: { borderColor: 'var(--ok)' }
        }, [
          el('b', { class: 'tiny', style: { color: 'var(--ok)' }, text: 'בוצע באימון:' }),
          ...applied.map((a) => el('div', { class: 'tiny dim', text: `· ${a}` })),
          el('button', { class: 'btn sm full', style: { marginTop: '8px' }, text: 'פתח את האימון', onclick: () => ctx.go('workout') })
        ]));
      }
    }
  } catch (err) {
    pending.remove();
    log.appendChild(bubble('assistant', `שגיאה: ${err.message}`));
  }
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

function bubble(role, text) {
  const mine = role === 'user';
  return el('div', {
    class: 'card',
    style: {
      background: mine ? 'var(--accent-dim)' : 'var(--surface)',
      borderColor: mine ? 'rgba(255,138,61,.35)' : 'var(--line-soft)',
      marginInlineStart: mine ? '32px' : '0',
      marginInlineEnd: mine ? '0' : '32px'
    }
  }, [el('div', { style: { whiteSpace: 'pre-wrap', fontSize: '14.5px' }, text })]);
}

/* ---------- context ---------- */

async function buildContext(ctx, active) {
  const recent = await recentWorkouts(8);
  const history = [];
  for (const w of recent) {
    const sum = await workoutSummary(w.id);
    history.push({ date: w.date, name: w.name, sets: sum.sets, volume: Math.round(sum.volume) });
  }

  const context = {
    goal: resolveGoal(goalList(ctx.settings)).name,
    bodyweight: ctx.settings.bodyweight,
    rotation: ctx.settings.rotation,
    recent_workouts: history
  };

  if (active) {
    context.active_workout = {
      name: active.name,
      cursor: active.cursor,
      slots: active.slots.map((s, i) => ({
        slot: i,
        exercise_id: s.ex,
        name: exerciseName(s.ex),
        sets: s.sets,
        target_weight: s.targetWeight,
        target_reps: s.targetReps,
        done: !!s.done
      }))
    };
    /* keep the id list small: only plausible swaps for what is in the session */
    const ids = new Set();
    active.slots.forEach((s) => {
      ids.add(s.ex);
      substitutes(s.ex).slice(0, 6).forEach((o) => ids.add(o.id));
    });
    context.available_exercise_ids = Array.from(ids).map((id) => ({ id, name: exerciseName(id) }));
  } else {
    context.available_exercise_ids = EXERCISES.slice(0, 40).map((e) => ({ id: e.id, name: e.name }));
  }

  return context;
}

/* ---------- actions ---------- */

async function applyActions(w, actions) {
  const done = [];
  for (const a of actions) {
    const i = Number(a.slot);
    const s = w.slots[i];
    if (!s && a.type !== 'append') continue;

    switch (a.type) {
      case 'swap': {
        const target = getExercise(a.to);
        if (!target) break;
        const from = exerciseName(s.ex);
        s.ex = a.to;
        s.warmups = [];
        s.rest = target.rest;
        s.note = 'הוחלף על ידי המאמן';
        done.push(`${from} → ${target.name}`);
        break;
      }
      case 'drop':
        done.push(`הוסר: ${exerciseName(s.ex)}`);
        w.slots.splice(i, 1);
        if (w.cursor >= w.slots.length) w.cursor = Math.max(0, w.slots.length - 1);
        break;
      case 'sets':
        if (a.sets > 0 && a.sets <= 10) { s.sets = Number(a.sets); done.push(`${exerciseName(s.ex)}: ${a.sets} סטים`); }
        break;
      case 'weight':
        if (a.weight >= 0) { s.targetWeight = Number(a.weight); done.push(`${exerciseName(s.ex)}: ${fmtW(a.weight)}`); }
        break;
      case 'rest':
        if (a.seconds >= 15 && a.seconds <= 600) { s.rest = Number(a.seconds); done.push(`${exerciseName(s.ex)}: מנוחה ${a.seconds} שניות`); }
        break;
      default:
        break;
    }
  }
  if (done.length) await saveWorkout(w);
  return done;
}

/* ---------- offline tools ---------- */

function quickTools(ctx) {
  return el('div', { class: 'card stack' }, [
    el('h3', { style: { margin: 0, fontSize: '15px' }, text: 'כלים שעובדים גם בלי אינטרנט' }),
    el('button', { class: 'btn sm full', text: 'ניתוח נפח שבועי מקומי', onclick: async () => {
      const recent = await recentWorkouts(20);
      const byWeek = new Map();
      for (const w of recent) {
        const sum = await workoutSummary(w.id);
        const week = weekKey(w.date);
        byWeek.set(week, (byWeek.get(week) || 0) + sum.volume);
      }
      const arr = Array.from(byWeek.entries()).sort().slice(-4);
      if (arr.length < 2) { toast('צריך לפחות שבועיים של נתונים'); return; }
      const trend = arr[arr.length - 1][1] - arr[arr.length - 2][1];
      const pct = arr[arr.length - 2][1] ? Math.round((trend / arr[arr.length - 2][1]) * 100) : 0;
      toast(pct >= 0 ? `הנפח עלה ב-${pct}% מול השבוע הקודם` : `הנפח ירד ב-${Math.abs(pct)}% — שקול דלואוד`, pct >= 0 ? 'ok' : '');
    } }),
    el('button', { class: 'btn sm full', text: 'סקירת AI שבועית', onclick: async (e) => {
      if (!(await ai.hasKey())) { toast('נדרש מפתח API', 'bad'); return; }
      const btn = e.currentTarget;
      btn.disabled = true; btn.textContent = 'מנתח…';
      try {
        const recent = await recentWorkouts(12);
        const data = [];
        for (const w of recent) {
          const sum = await workoutSummary(w.id);
          data.push({ date: w.date, name: w.name, sets: sum.sets, volume: Math.round(sum.volume) });
        }
        const out = await ai.weeklyReview(data);
        ctx.setActions([]);
        toast('הסקירה מוכנה');
        HISTORY.push({ role: 'assistant', content: out });
        ctx.reload();
      } catch (err) {
        toast(err.message, 'bad');
      } finally {
        btn.disabled = false; btn.textContent = 'סקירת AI שבועית';
      }
    } })
  ]);
}

function weekKey(iso) {
  const d = new Date(`${iso}T00:00:00`);
  const day = (d.getDay() + 1) % 7; // week starts Sunday
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}
