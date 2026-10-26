/* ==========================================================================
   logic.js — pure training maths. No DOM, no storage: everything here is a
   function of its inputs, which keeps it unit-testable.
     · progressive overload
     · plate loading
     · warm-up ramp
     · 1RM estimates, volume, moving average
   ========================================================================== */

import { GOALS, repRange, resolveGoal } from './programs.js';
import { bodyFatPct } from './body.js';

/* ---------- rounding ---------- */

/** Smallest weight jump the gym actually allows (2 × smallest plate for a bar). */
export function stepFor(exercise, settings) {
  if (exercise?.bar) return (settings.plates?.[settings.plates.length - 1] ?? 1.25) * 2;
  if (exercise?.cat === 'Machine' || exercise?.cat === 'Cable') return settings.increment ?? 2.5;
  return settings.increment ?? 2.5;
}

export function roundToStep(weight, step) {
  if (!step || step <= 0) return Math.round(weight * 2) / 2;
  return Math.round(weight / step) * step;
}

/* ---------- progressive overload ---------- */

/**
 * Decide the target for the next session of one exercise.
 * Rule: every working set hit the top of the rep range → add load.
 *       Missed the bottom of the range on most sets → back off 5%.
 *       Otherwise → same load, aim for one more rep.
 *
 * @param {object} p
 * @param {Array<{weight_kg:number,reps:number,is_warmup?:boolean}>} p.lastSets working sets of the previous session
 * @param {object} p.exercise
 * @param {string} p.goal
 * @param {object} p.settings
 * @returns {{weight:number, reps:number, action:'increase'|'hold'|'deload'|'start', note:string}}
 */
export function nextTarget({ lastSets, exercise, goal, settings }) {
  const range = repRange(goal, exercise);
  const g = resolveGoal(goal);
  const step = stepFor(exercise, settings);

  const working = (lastSets || []).filter((s) => !s.is_warmup && s.reps > 0);
  /* Bodyweight work: the body is the load, so 0 in the weight column means
     "my bodyweight" and a number there is only what is added on top (a
     belt, a backpack). Progress is one more rep — never a heavier body. */
  if (exercise?.cat === 'Bodyweight') {
    if (!working.length) {
      return { weight: 0, reps: range.min, action: 'start', note: 'משקל גוף — 0 בשדה הק״ג הוא משקל הגוף שלך' };
    }
    const bw = Number(settings?.bodyweight) || 0;
    let top = Math.max(...working.map((s) => s.weight_kg || 0));
    /* sets logged with the bodyweight typed in as the weight: that was the body */
    if (bw && Math.abs(top - bw) <= 1) top = 0;
    const best = Math.max(...working.map((s) => s.reps));
    return {
      weight: top, reps: best + 1, action: 'hold',
      note: top ? `משקל גוף + ${fmtW(top)} — נסה ${best + 1} חזרות` : `משקל גוף — נסה ${best + 1} חזרות`
    };
  }
  if (!working.length) {
    return { weight: 0, reps: range.min, action: 'start', note: 'אימון ראשון — קבע משקל התחלתי נוח' };
  }

  const top = Math.max(...working.map((s) => s.weight_kg || 0));
  const atTop = working.filter((s) => (s.weight_kg || 0) >= top - 0.01);
  const allHitMax = atTop.every((s) => s.reps >= range.max);
  const mostMissedMin = atTop.filter((s) => s.reps < range.min).length > atTop.length / 2;

  if (allHitMax) {
    const pct = exercise?.compound ? g.incCompound : g.incIsolation;
    const raw = top * (1 + pct);
    const weight = Math.max(top + step, roundToStep(raw, step));
    return {
      weight,
      reps: range.min,
      action: 'increase',
      note: `סגרת את כל הסטים על ${range.max} — עלייה ל-${fmtW(weight)}`
    };
  }

  if (mostMissedMin) {
    const weight = roundToStep(top * 0.9, step);
    return {
      weight,
      reps: range.min,
      action: 'deload',
      note: `ירדת מתחת ל-${range.min} חזרות — הורדה ל-${fmtW(weight)} לשיקום הטכניקה`
    };
  }

  const best = Math.max(...atTop.map((s) => s.reps));
  return {
    weight: top,
    reps: Math.min(range.max, best + 1),
    action: 'hold',
    note: `אותו משקל — נסה ${Math.min(range.max, best + 1)} חזרות`
  };
}

/* ---------- plate calculator ---------- */

export const PLATE_COLORS = {
  25: '#E8453C', 20: '#3B7DD8', 15: '#F2C230', 10: '#3FAE5A',
  5: '#E6E6EA', 2.5: '#B0454A', 1.25: '#9AA0A6', 1: '#7A7F86', 0.5: '#5E636A'
};

/**
 * Plates per side for a target barbell weight.
 * @returns {{perSide:Array<{plate:number,count:number}>, achieved:number, leftover:number}}
 */
export function platesFor(target, { barWeight = 20, plates = [25, 20, 15, 10, 5, 2.5, 1.25] } = {}) {
  const perSideWeight = (target - barWeight) / 2;
  if (!(perSideWeight > 0)) {
    return { perSide: [], achieved: barWeight, leftover: Math.max(0, target - barWeight) };
  }
  const sorted = [...plates].sort((a, b) => b - a);
  let left = perSideWeight;
  const perSide = [];
  for (const p of sorted) {
    const n = Math.floor((left + 1e-9) / p);
    if (n > 0) { perSide.push({ plate: p, count: n }); left -= n * p; }
  }
  const loaded = perSide.reduce((sum, x) => sum + x.plate * x.count, 0);
  return {
    perSide,
    achieved: round2(barWeight + loaded * 2),
    leftover: round2(left * 2)
  };
}

/* ---------- warm-up ramp ---------- */

/**
 * Warm-up sets before a heavy working set.
 * Empty bar ×10 → 50% ×5 → 75% ×3 → 90% ×1, trimmed for light targets.
 */
export function warmupSets(target, exercise, settings) {
  const bar = settings.barWeight ?? 20;
  const step = stepFor(exercise, settings);
  const out = [];
  if (!target || target <= 0) return out;

  if (exercise?.bar) {
    if (target > bar * 1.6) out.push({ weight: bar, reps: 10, label: 'מוט ריק' });
  } else if (target > step * 4) {
    out.push({ weight: roundToStep(target * 0.35, step), reps: 10, label: 'קל' });
  }

  const ramp = [[0.5, 5], [0.75, 3], [0.9, 1]];
  for (const [pct, reps] of ramp) {
    const w = roundToStep(target * pct, step);
    if (w <= (out[out.length - 1]?.weight ?? 0)) continue;
    if (w >= target) continue;
    out.push({ weight: w, reps, label: `${Math.round(pct * 100)}%` });
  }
  return out;
}

/* ---------- strength maths ---------- */

export const epley = (w, r) => (r > 0 ? w * (1 + r / 30) : 0);
export const brzycki = (w, r) => (r > 0 && r < 37 ? (w * 36) / (37 - r) : 0);

/** Average of the two common formulas; single reps return the lift itself. */
export function oneRM(weight, reps) {
  if (!weight || !reps) return 0;
  if (reps === 1) return weight;
  const b = brzycki(weight, reps);
  const e = epley(weight, reps);
  return round2(b && e ? (b + e) / 2 : b || e);
}

export const volume = (sets) =>
  (sets || []).filter((s) => !s.is_warmup).reduce((sum, s) => sum + (s.weight_kg || 0) * (s.reps || 0), 0);

/** Simple moving average — used to smooth daily bodyweight noise. */
export function movingAverage(series, window = 7) {
  const out = [];
  for (let i = 0; i < series.length; i++) {
    const from = Math.max(0, i - window + 1);
    const slice = series.slice(from, i + 1);
    out.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  return out;
}

/* Grams of protein per kg of *lean* mass, by goal. Per-kg-of-bodyweight
   rules (the usual 1.6–2.2) over-feed protein to someone carrying a lot of
   fat and under-feed a lean lifter; lean mass is what protein is for.
   A cut needs the most — protein is what keeps muscle in a deficit. */
const PROTEIN_PER_LEAN_KG = { cut: 2.6, lose: 2.4, hypertrophy: 2.4, abs: 2.4, strength: 2.3, functional: 2.2, endurance: 1.9 };

/**
 * The daily protein target and how it was reached.
 * @param {{bodyweight:number, height?:number, age?:number, sex?:string, bodyType?:number|null, goals?:string[], goal?:string}} p
 * @param {boolean} isTrainingDay
 * @returns {{grams:number, leanKg:number, bodyFat:number, perLeanKg:number, fromPicture:boolean}}
 */
export function proteinPlan(p, isTrainingDay = true) {
  const bw = p.bodyweight || 75;
  const bodyFat = bodyFatPct(p);
  const leanKg = bw * (1 - bodyFat / 100);
  const goals = Array.isArray(p.goals) && p.goals.length ? p.goals : [p.goal || 'hypertrophy'];
  const perLeanKg = Math.max(...goals.map((g) => PROTEIN_PER_LEAN_KG[g] ?? 2.2));

  let grams = leanKg * perLeanKg;
  /* Rest days still need protein — muscle is built the day after — but
     a little less of it. */
  if (!isTrainingDay) grams *= 0.9;
  /* Past 50 the same meal builds less muscle (anabolic resistance), so the
     target goes up rather than down with age. */
  if ((p.age || 30) >= 50) grams *= 1.1;
  /* Guard rails, per kg of total bodyweight: never below the 1.2 g/kg that
     preserves muscle for anyone training, never past 2.6 g/kg where more
     stops doing anything. */
  grams = Math.min(bw * 2.6, Math.max(bw * 1.2, grams));

  return {
    grams: Math.round(grams / 5) * 5,
    leanKg: Math.round(leanKg * 10) / 10,
    bodyFat: Math.round(bodyFat),
    perLeanKg,
    fromPicture: p.bodyType != null
  };
}

export const proteinTarget = (p, isTrainingDay = true) => proteinPlan(p, isTrainingDay).grams;

/**
 * Daily calories. With a body-fat estimate from the picture, Katch-McArdle
 * (from lean mass) is the better resting rate; without one, Mifflin-St Jeor
 * from weight, height, age and sex.
 */
export function calorieTarget(p, isTrainingDay = true) {
  const bw = p.bodyweight || 75;
  const sexTerm = p.sex === 'female' ? -161 : p.sex === 'other' ? -78 : 5;
  const bmr = p.bodyType != null
    ? 370 + 21.6 * (bw * (1 - bodyFatPct(p) / 100))
    : 10 * bw + 6.25 * (p.height || 175) - 5 * (p.age || 30) + sexTerm;
  const tdee = bmr * (isTrainingDay ? 1.55 : 1.35);
  /* A deficit wins over a surplus when both are selected — you cannot eat
     above and below maintenance at the same time. */
  const goals = Array.isArray(p.goals) && p.goals.length ? p.goals : [p.goal || 'hypertrophy'];
  /* Weight loss asks for the larger deficit (~22%); a cut for a gentler one
     that keeps training quality up. */
  const adj = goals.includes('lose') ? -0.22 : goals.includes('cut') ? -0.18 : goals.includes('hypertrophy') ? 0.1 : 0;
  return Math.round(tdee * (1 + adj));
}

/* ---------- helpers ---------- */

export const round2 = (n) => Math.round(n * 100) / 100;

export function fmtW(w) {
  if (w == null) return '—';
  const n = round2(w);
  return `${Number.isInteger(n) ? n : n.toFixed(2).replace(/0$/, '')} ק״ג`;
}

export const fmtTime = (sec) => {
  const s = Math.max(0, Math.round(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export function fmtDuration(sec) {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${h} ש׳ ${m} ד׳`;
  return `${m} דקות`;
}

export const todayISO = (d = new Date()) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};

export function hebDate(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' });
}

export const HEB_DAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
