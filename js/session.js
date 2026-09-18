/* ==========================================================================
   session.js — workout lifecycle on top of db.js.
   Creating, resuming, logging and finishing a session lives here so the
   screens stay presentational.
   ========================================================================== */

import * as db from './db.js';
import { TEMPLATES, ROTATIONS, repRange, restFor } from './programs.js';
import { getExercise, isAllowed, substitutes, sameMuscle } from './exercises.js';
import { nextTarget, oneRM, volume, todayISO } from './logic.js';

/* ---------- active workout ---------- */

export async function getActive() {
  const id = await db.setting('activeWorkoutId', null);
  if (!id) return null;
  const w = await db.get('workouts', id);
  if (!w || w.completed) { await db.setSetting('activeWorkoutId', null); return null; }
  return w;
}

/** Next template in the rotation (null on a rest slot). */
export async function nextUp(settings) {
  const rot = ROTATIONS[settings.rotation] || ROTATIONS.ppl6;
  const cursor = (await db.setting('rotationCursor', 0)) % rot.days.length;
  const key = rot.days[cursor];
  return { cursor, key, template: key === 'rest' ? null : TEMPLATES[key] };
}

export async function advanceRotation(by = 1) {
  const cur = await db.setting('rotationCursor', 0);
  await db.setSetting('rotationCursor', cur + by);
}

/**
 * Swap an exercise the user cannot or should not do for the closest one they
 * can: same movement pattern first, then same muscle. Falls back to the
 * original rather than dropping the slot, so a session is never short.
 */
export function resolveExercise(id, settings, taken = new Set()) {
  const filter = { equipment: settings.equipment, limits: settings.limits || [] };
  if (isAllowed(id, filter)) return id;

  const ok = (o) => isAllowed(o.id, filter);
  const fresh = (o) => ok(o) && !taken.has(o.id);

  return substitutes(id).find(fresh)?.id
    ?? sameMuscle(id).find(fresh)?.id
    ?? substitutes(id).find(ok)?.id
    ?? sameMuscle(id).find(ok)?.id
    ?? id;
}

/** Working-set count adjusted for training age. */
function setsFor(base, settings) {
  if (settings.experience === 'beginner') return Math.max(2, base - 1);
  if (settings.experience === 'advanced') return Math.min(6, base + 1);
  return base;
}

/**
 * Build a workout from a template, resolving each slot's target from the
 * previous session of that exercise (progressive overload).
 */
export async function createFromTemplate(templateId, settings) {
  const tpl = TEMPLATES[templateId];
  if (!tpl) throw new Error('תבנית לא נמצאה');

  const slots = [];
  const taken = new Set(tpl.slots.map((x) => x.ex));
  for (const raw of tpl.slots) {
    const exId = resolveExercise(raw.ex, settings, taken);
    /* A swap that lands on something already in the session adds nothing —
       five distinct exercises beat six with one repeated. */
    if (exId !== raw.ex && slots.some((x) => x.ex === exId)) continue;
    taken.add(exId);
    const slot = { ...raw, ex: exId };
    const ex = getExercise(exId);
    if (!ex) continue;
    const prev = await lastSessionSets(slot.ex);
    const target = nextTarget({ lastSets: prev, exercise: ex, goal: settings.goal, settings });
    const range = repRange(settings.goal, ex);
    const swapped = exId !== raw.ex;
    slots.push({
      ex: slot.ex,
      sets: slot.seconds ? slot.s : setsFor(slot.s, settings),
      seconds: slot.seconds || null,
      targetWeight: target.weight,
      targetReps: slot.seconds ? 0 : (target.reps || range.min),
      action: target.action,
      note: swapped ? `הוחלף אוטומטית לפי הציוד והמגבלות שלך · ${target.note}` : target.note,
      rest: restFor(settings.goal, ex),
      done: false
    });
  }

  const workout = {
    id: db.uid('w'),
    date: todayISO(),
    type: tpl.type,
    template_id: tpl.id,
    name: tpl.name,
    started_at: Date.now(),
    finished_at: null,
    duration_seconds: 0,
    completed: 0,
    cursor: 0,
    slots
  };

  await db.put('workouts', workout);
  await db.setSetting('activeWorkoutId', workout.id);
  return workout;
}

export async function saveWorkout(workout) {
  await db.put('workouts', workout);
  return workout;
}

export async function finishWorkout(workout) {
  workout.finished_at = Date.now();
  workout.duration_seconds = Math.round((workout.finished_at - workout.started_at) / 1000);
  workout.completed = 1;
  await db.put('workouts', workout);
  await db.setSetting('activeWorkoutId', null);
  await advanceRotation(1);
  return workout;
}

export async function abandonWorkout(workout) {
  const logs = await setsOf(workout.id);
  for (const l of logs) await db.del('set_logs', l.id);
  await db.del('workouts', workout.id);
  await db.setSetting('activeWorkoutId', null);
}

/* ---------- set logs ---------- */

export const setsOf = (workoutId) =>
  db.byIndex('set_logs', 'workout_id', IDBKeyRange.only(workoutId));

export async function logSet(entry) {
  const row = {
    id: entry.id || db.uid('s'),
    workout_id: entry.workout_id,
    exercise_id: entry.exercise_id,
    set_order: entry.set_order,
    weight_kg: Number(entry.weight_kg) || 0,
    reps: Number(entry.reps) || 0,
    rir: entry.rir === '' || entry.rir == null ? null : Number(entry.rir),
    is_warmup: !!entry.is_warmup,
    is_completed: 1,
    timestamp: entry.timestamp || Date.now()
  };
  await db.put('set_logs', row);
  return row;
}

export const unlogSet = (id) => db.del('set_logs', id);

/** Working sets from the most recent *completed* session of an exercise. */
export async function lastSessionSets(exerciseId, excludeWorkoutId = null) {
  const rows = await db.byIndex('set_logs', 'exercise_id', IDBKeyRange.only(exerciseId));
  const usable = rows.filter((r) => !r.is_warmup && r.workout_id !== excludeWorkoutId);
  if (!usable.length) return [];
  usable.sort((a, b) => b.timestamp - a.timestamp);
  const lastWorkout = usable[0].workout_id;
  return usable.filter((r) => r.workout_id === lastWorkout).sort((a, b) => a.set_order - b.set_order);
}

/** Best estimated 1RM ever recorded for an exercise. */
export async function personalBest(exerciseId, excludeWorkoutId = null) {
  const rows = await db.byIndex('set_logs', 'exercise_id', IDBKeyRange.only(exerciseId));
  let best = { e1rm: 0, weight: 0, reps: 0 };
  for (const r of rows) {
    if (r.is_warmup || r.workout_id === excludeWorkoutId) continue;
    const e = oneRM(r.weight_kg, r.reps);
    if (e > best.e1rm) best = { e1rm: e, weight: r.weight_kg, reps: r.reps };
  }
  return best;
}

/* ---------- notes ---------- */

export async function getNote(exerciseId) {
  const row = await db.get('exercise_notes', exerciseId);
  return row?.text || '';
}

export async function setNote(exerciseId, text) {
  const row = (await db.get('exercise_notes', exerciseId)) || { exercise_id: exerciseId };
  return db.put('exercise_notes', { ...row, text, updated_at: Date.now() });
}

/* ---------- history / stats ---------- */

export async function recentWorkouts(limit = 30) {
  const all = await db.all('workouts');
  return all
    .filter((w) => w.completed)
    .sort((a, b) => (b.finished_at || 0) - (a.finished_at || 0))
    .slice(0, limit);
}

export async function workoutSummary(workoutId) {
  const logs = await setsOf(workoutId);
  const working = logs.filter((l) => !l.is_warmup);
  return {
    sets: working.length,
    volume: volume(logs),
    reps: working.reduce((s, l) => s + (l.reps || 0), 0)
  };
}

/** Streak of consecutive calendar days ending today or yesterday. */
export async function streak() {
  const all = await db.all('workouts');
  const days = new Set(all.filter((w) => w.completed).map((w) => w.date));
  if (!days.size) return 0;
  let n = 0;
  const d = new Date();
  if (!days.has(todayISO(d))) d.setDate(d.getDate() - 1);
  for (;;) {
    if (!days.has(todayISO(d))) break;
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
