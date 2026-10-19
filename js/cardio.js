/* ==========================================================================
   cardio.js — running and aerobic sessions.

   A cardio session is a timeline of phases (warm up, work, recover, cool
   down), not sets and reps, so it lives beside the lifting engine rather
   than inside it. The timeline is computed from the wall clock — elapsed =
   now − start − time spent paused — never from a ticking counter, so a
   phone that locks, sleeps or reloads mid-run comes back to the right
   phase with the right time left.

   Calories are MET × kg × hours per phase (Compendium of Physical
   Activities values): an estimate, and labelled as one.
   ========================================================================== */

import * as db from './db.js';
import { getExercise } from './exercises.js';
import { goalList } from './programs.js';
import { fmtDuration, todayISO } from './logic.js';

export const ZONES = {
  warm: { name: 'חימום', color: '#FFC93D' },
  walk: { name: 'הליכה', color: '#4DA3FF' },
  run: { name: 'ריצה', color: '#34D06A' },
  steady: { name: 'קצב יציב', color: '#34D06A' },
  hard: { name: 'מאמץ', color: '#FF4D6D' },
  recover: { name: 'התאוששות', color: '#4DA3FF' },
  rest: { name: 'מנוחה', color: '#4DA3FF' },
  cool: { name: 'שחרור', color: '#B98BFF' }
};

const ph = (label, minutes, zone, cue = '', pic = null) =>
  ({ label, seconds: Math.round(minutes * 60), zone, cue, pic });

/** Repeat a block `n` times, flattening. */
const reps = (n, block) => Array.from({ length: n }, (_, i) => block(i)).flat();

/* How the session-length setting stretches a cardio session: only the main
   block scales — a warm-up is not something to cut short. */
const SCALE = { quick: 0.5, short: 0.75, medium: 1, long: 1.4 };
const scaled = (base, duration, min = 1) => Math.max(min, Math.round(base * (SCALE[duration] ?? 1)));

const HIIT_MOVES = ['star_jump', 'mountain_climbers', 'jump_squat', 'split_jump'];

export const CARDIO = {
  walk: {
    id: 'walk', name: 'הליכה מהירה', pic: 'cardio_walk', outdoor: true, level: 'לכל רמה',
    desc: 'נקודת הפתיחה הבטוחה ביותר: דופק מוגבר ונשימה מהירה, אבל עדיין אפשר לדבר.',
    met: { warm: 3.0, steady: 4.3, cool: 2.8 },
    build: (d) => [
      ph('הליכה רגילה', 5, 'warm', 'צעדים נינוחים — לחמם קרסוליים וברכיים'),
      ph('הליכה מהירה', scaled(25, d, 8), 'steady', 'קצב שבו אפשר לדבר, אבל לא לשיר'),
      ph('הליכה איטית', 5, 'cool', 'להוריד דופק בהדרגה')
    ]
  },
  runwalk: {
    id: 'runwalk', name: 'ריצה-הליכה למתחילים', pic: 'cardio_run', outdoor: true, level: 'מתחילים',
    desc: 'מקטעי ריצה קצרים עם הליכה ביניהם — כך עוברים מאפס לריצה רציפה בלי להיפצע.',
    met: { warm: 3.0, run: 8.0, walk: 3.5, cool: 2.8 },
    build: (d) => [
      ph('הליכה מהירה', 5, 'warm', 'חימום — הליכה בקצב עולה'),
      ...reps(scaled(8, d, 3), () => [
        ph('ריצה', 1, 'run', 'ריצה קלה וקצרה — לא ספרינט'),
        ph('הליכה', 1.5, 'walk', 'לנשום ולהתאושש')
      ]),
      ph('הליכה איטית', 5, 'cool', 'שחרור')
    ]
  },
  easyrun: {
    id: 'easyrun', name: 'ריצה קלה (אזור 2)', pic: 'cardio_run', outdoor: true, level: 'בינוני',
    desc: 'ריצה רציפה בקצב שיחה — הבסיס של כושר לב-ריאה ושל שריפת שומן.',
    met: { warm: 4.0, run: 8.3, cool: 3.0 },
    build: (d) => [
      ph('הליכה מהירה וריצה איטית', 5, 'warm', 'להתחיל לאט, להעלות בהדרגה'),
      ph('ריצה בקצב שיחה', scaled(25, d, 8), 'run', 'אם אי אפשר לדבר במשפטים מלאים — להאט'),
      ph('הליכה', 5, 'cool', 'להוריד דופק לפני שעוצרים')
    ]
  },
  intervals: {
    id: 'intervals', name: 'אינטרוולים', pic: 'cardio_treadmill', outdoor: true, level: 'מתקדם',
    desc: 'מקטעים מהירים קצרים עם התאוששות — הכי הרבה כושר בהכי מעט זמן.',
    met: { warm: 7.0, hard: 11.0, recover: 6.0, cool: 3.0 },
    build: (d) => [
      ph('ריצה קלה', 8, 'warm', 'חימום ארוך — המקטעים המהירים דורשים אותו'),
      ...reps(scaled(6, d, 3), () => [
        ph('ריצה מהירה', 1, 'hard', '85–90% מאמץ — מהר, אבל לא ספרינט מלא'),
        ph('ריצה איטית', 2, 'recover', 'להמשיך לזוז, לנשום עמוק')
      ]),
      ph('הליכה', 5, 'cool', 'שחרור')
    ]
  },
  hiit: {
    id: 'hiit', name: 'HIIT בלי ציוד', pic: 'star_jump', outdoor: false, level: 'בינוני',
    desc: '40 שניות עבודה, 20 מנוחה — בסלון, בפארק או בחדר במלון.',
    met: { warm: 4.0, hard: 8.0, rest: 3.0, cool: 2.5 },
    /* Thirty-odd phases read better as the rounds they are. */
    outline: (d) => [
      'קפיצות קלות במקום · 03:00',
      `${scaled(4, d, 2)} סבבים: ${HIIT_MOVES.map((id) => getExercise(id).name).join(' · ')}`,
      '40 שניות עבודה ו-20 מנוחה בכל תרגיל, דקה מנוחה בין סבבים',
      'הליכה במקום ומתיחה · 03:00'
    ],
    build: (d) => {
      const rounds = scaled(4, d, 2);
      const out = [ph('קפיצות קלות במקום', 3, 'warm', 'להעלות דופק ולשחרר כתפיים', 'star_jump')];
      for (let r = 0; r < rounds; r++) {
        HIIT_MOVES.forEach((id, i) => {
          const ex = getExercise(id);
          out.push(ph(ex.name, 40 / 60, 'hard', ex.cue || `סבב ${r + 1} מתוך ${rounds}`, id));
          const last = i === HIIT_MOVES.length - 1;
          if (!last) out.push(ph('מנוחה', 20 / 60, 'rest', `הבא: ${getExercise(HIIT_MOVES[i + 1]).name}`, HIIT_MOVES[i + 1]));
          else if (r < rounds - 1) out.push(ph('מנוחה בין סבבים', 1, 'rest', `עוד ${rounds - r - 1} סבבים`, HIIT_MOVES[0]));
        });
      }
      out.push(ph('הליכה במקום ומתיחה', 3, 'cool', 'נשימות ארוכות', null));
      return out;
    }
  },
  rope: {
    id: 'rope', name: 'קפיצה בחבל', pic: 'cardio_rope', outdoor: false, level: 'בינוני',
    desc: 'דקה קפיצה, דקה מנוחה — שורף הרבה בזמן קצר, וחבל נכנס לכל תיק.',
    met: { warm: 4.0, run: 11.8, rest: 3.0, cool: 2.5 },
    build: (d) => [
      ph('קפיצות קלות', 3, 'warm', 'קפיצות נמוכות, מפרקי כף היד מסובבים את החבל'),
      ...reps(scaled(10, d, 4), () => [
        ph('קפיצה בחבל', 1, 'run', 'נחיתה על כרית כף הרגל, מרפקים צמודים'),
        ph('מנוחה', 1, 'rest', 'לנשום')
      ]),
      ph('הליכה ומתיחת תאומים', 3, 'cool', '')
    ]
  },
  machine: {
    id: 'machine', name: 'מכשיר אירובי', pic: 'cardio_bike', outdoor: false, level: 'לכל רמה',
    desc: 'אופניים, אליפטיקל, חתירה או הליכון — עומס קבוע וידידותי למפרקים.',
    variants: {
      bike: { name: 'אופני כושר', pic: 'cardio_bike', met: 6.8 },
      elliptical: { name: 'אליפטיקל', pic: 'cardio_elliptical', met: 5.0 },
      rower: { name: 'חתירה', pic: 'cardio_rower', met: 7.0 },
      treadmill: { name: 'הליכון', pic: 'cardio_treadmill', met: 8.0 }
    },
    met: { warm: 0.6, steady: 1, cool: 0.45 }, // × the variant's MET
    build: (d) => [
      ph('קצב קל', 5, 'warm', 'התנגדות נמוכה'),
      ph('קצב יציב', scaled(20, d, 6), 'steady', 'מאמץ 6 מתוך 10 — מזיע ונושם מהר, אבל יציב'),
      ph('שחרור', 5, 'cool', 'התנגדות נמוכה, להוריד דופק')
    ]
  }
};

export const variantOf = (run) => CARDIO[run.program]?.variants?.[run.variant] || null;

/** The photo for a run in progress or a saved cardio record. */
export function cardioPic(run) {
  const prog = CARDIO[run?.program];
  if (!prog) return 'cardio_run';
  return variantOf(run)?.pic || prog.pic;
}

export function cardioName(run) {
  const prog = CARDIO[run.program];
  const v = variantOf(run);
  return v ? `${prog.name} · ${v.name}` : prog?.name || 'אירובי';
}

export function buildPhases(programId, duration) {
  return CARDIO[programId].build(duration);
}

export const totalSeconds = (phases) => phases.reduce((s, p) => s + p.seconds, 0);

/** Where `elapsed` seconds lands in the timeline. */
export function phaseAt(phases, elapsed) {
  let t = 0;
  for (let i = 0; i < phases.length; i++) {
    const end = t + phases[i].seconds;
    if (elapsed < end) return { i, phase: phases[i], into: elapsed - t, left: end - elapsed, done: false };
    t = end;
  }
  return { i: phases.length - 1, phase: phases[phases.length - 1], into: 0, left: 0, done: true };
}

/** MET for one phase of a run, variant-aware. */
function metFor(run, phase) {
  const prog = CARDIO[run.program];
  const base = prog.met[phase.zone] ?? 3;
  const v = variantOf(run);
  return v ? base * v.met : base;
}

/** Calories for the part of the timeline actually done. */
export function kcalFor(run, elapsed, weightKg) {
  let t = 0;
  let kcal = 0;
  for (const p of run.phases) {
    const spent = Math.max(0, Math.min(p.seconds, elapsed - t));
    kcal += metFor(run, p) * weightKg * (spent / 3600);
    t += p.seconds;
    if (t >= elapsed) break;
  }
  return Math.round(kcal);
}

/** Seconds of the session actually spent moving (pauses excluded). */
export function cardioElapsed(run, now = Date.now()) {
  const end = run.pausedAt || now;
  return Math.max(0, (end - run.startedAt - (run.pausedMs || 0)) / 1000);
}

/* ---------- the run in progress ---------- */

export const getActiveCardio = () => db.setting('activeCardio', null);
export const saveActiveCardio = (run) => db.setSetting('activeCardio', run);
export const clearActiveCardio = () => db.setSetting('activeCardio', null);

export async function startCardio(programId, settings, { variant = null, gps = false } = {}) {
  const prog = CARDIO[programId];
  const run = {
    id: db.uid('c'),
    program: programId,
    variant: prog.variants ? (variant || Object.keys(prog.variants)[0]) : null,
    duration: settings.duration || 'medium',
    phases: buildPhases(programId, settings.duration),
    startedAt: Date.now(),
    pausedAt: null,
    pausedMs: 0,
    gps: !!(gps && prog.outdoor),
    distanceM: 0
  };
  await saveActiveCardio(run);
  return run;
}

/**
 * Save the run as a completed workout. Off-plan — a run on a lifting day
 * must not consume the lifting day — but it is a completed session, so it
 * counts toward the streak like any other.
 */
export async function finishCardio(run, { distanceKm = null, rpe = null } = {}, weightKg = 75) {
  const now = run.pausedAt || Date.now();
  const elapsed = Math.round(cardioElapsed(run, now));
  const km = distanceKm != null && distanceKm > 0 ? Math.round(distanceKm * 100) / 100 : null;
  const workout = {
    id: db.uid('w'),
    date: todayISO(),
    type: 'Cardio',
    template_id: null,
    name: cardioName(run),
    started_at: run.startedAt,
    finished_at: now,
    duration_seconds: elapsed,
    completed: 1,
    cursor: 0,
    offPlan: true,
    slots: [],
    cardio: {
      program: run.program,
      variant: run.variant,
      distance_km: km,
      rpe,
      kcal: kcalFor(run, elapsed, weightKg),
      gps: run.gps
    }
  };
  await db.put('workouts', workout);
  await clearActiveCardio();
  return workout;
}

/* ---------- reading it back ---------- */

/** min/km, or null when there's no distance to divide by. */
export function paceOf(seconds, km) {
  if (!km || km < 0.05) return null;
  const s = seconds / km;
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
}

export function cardioLine(w) {
  const c = w.cardio || {};
  const parts = [];
  if (c.distance_km) parts.push(`${c.distance_km} ק״מ`);
  parts.push(fmtDuration(w.duration_seconds));
  if (c.kcal) parts.push(`${c.kcal} קק״ל`);
  return parts.join(' · ');
}

/** Minutes of cardio in the last 7 days — measured against the WHO's 150. */
export function weeklyCardioMinutes(workouts, today = new Date()) {
  const from = new Date(today);
  from.setDate(from.getDate() - 6);
  const fromIso = todayISO(from);
  return Math.round(workouts
    .filter((w) => w.cardio && w.date >= fromIso)
    .reduce((s, w) => s + (w.duration_seconds || 0), 0) / 60);
}

export const WEEKLY_CARDIO_TARGET = 150;

/* ---------- what to suggest ---------- */

/** Rest days become cardio days when the goals or the body type call for it. */
export function cardioDay(settings) {
  const goals = goalList(settings);
  return goals.includes('cut') || goals.includes('endurance') || (settings.bodyType ?? 2) >= 3;
}

/**
 * The one session to put first. Someone carrying a lot of weight starts
 * with walking, because running impact on joints is the classic way a fat-
 * loss plan ends in week two; a beginner gets run-walk; an experienced
 * endurance goal gets intervals; everyone else, the easy run.
 */
export function recommendCardio(settings) {
  const body = settings.bodyType ?? 2;
  const goals = goalList(settings);
  if (body >= 4) return 'walk';
  if (settings.experience === 'beginner' || body === 3) return 'runwalk';
  if (goals.includes('endurance') && settings.experience === 'advanced') return 'intervals';
  return 'easyrun';
}
