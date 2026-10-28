/* ==========================================================================
   progress.js — bodyweight trend, the weigh-in sheet, and the week in numbers.

   Daily weight swings by a kilo or more with water and salt, so nothing here
   reads a single weigh-in as the answer: "now" is the average of the last
   week of entries, and the rate is a least-squares line through the last
   four weeks. That rate is what makes "when do I reach my goal" a real
   number instead of a guess.
   ========================================================================== */

import * as db from './db.js';
import { el, icon, ICONS, toast, openSheet, buzz } from './ui.js';
import { todayISO, round2 } from './logic.js';
import { dayWater } from './food.js';

const DAY = 86400000;
const dayNum = (iso) => Math.round(new Date(`${iso}T12:00:00`).getTime() / DAY);

/** Weigh-ins, oldest first. Entries with only circumferences or a photo are skipped. */
export async function weighIns() {
  const rows = await db.all('body_logs').catch(() => []);
  return rows.filter((r) => r.weight > 0).sort((a, b) => a.date.localeCompare(b.date) || (a.timestamp || 0) - (b.timestamp || 0));
}

/**
 * Where the weight is and where it is heading.
 * @param {Array<{date:string, weight:number}>} entries oldest first
 * @param {number|null} goal goal weight in kg
 */
export function weightStats(entries, goal = null) {
  if (!entries.length) return null;
  const last = entries[entries.length - 1];
  const lastDay = dayNum(last.date);
  const avgSince = (from) => {
    const xs = entries.filter((e) => dayNum(e.date) > from && dayNum(e.date) <= from + 7);
    return xs.length ? xs.reduce((a, e) => a + e.weight, 0) / xs.length : null;
  };
  const current = avgSince(lastDay - 7) ?? last.weight;
  const start = entries[0].weight;
  const monthAgo = entries.filter((e) => dayNum(e.date) <= lastDay - 28).pop();

  /* Rate: least squares over the last 28 days, once there are at least
     three weigh-ins spread over at least a week. */
  const recent = entries.filter((e) => dayNum(e.date) > lastDay - 28);
  let perWeek = null;
  if (recent.length >= 3 && dayNum(recent[recent.length - 1].date) - dayNum(recent[0].date) >= 7) {
    const xs = recent.map((e) => dayNum(e.date));
    const ys = recent.map((e) => e.weight);
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    let num = 0, den = 0;
    xs.forEach((x, i) => { num += (x - mx) * (ys[i] - my); den += (x - mx) ** 2; });
    perWeek = den ? round2((num / den) * 7) : null;
  }

  let toGoal = null, weeksToGoal = null, goalPct = null, onTrack = null;
  if (goal > 0) {
    toGoal = round2(goal - current);
    const total = goal - start;
    goalPct = total ? Math.max(0, Math.min(100, Math.round(((current - start) / total) * 100))) : 100;
    if (Math.abs(toGoal) < 0.3) { onTrack = true; weeksToGoal = 0; }
    else if (perWeek != null && Math.abs(perWeek) >= 0.05) {
      onTrack = Math.sign(perWeek) === Math.sign(toGoal);
      if (onTrack) weeksToGoal = Math.ceil(Math.abs(toGoal / perWeek));
    }
  }

  return {
    current: round2(current),
    last: last.weight,
    lastDate: last.date,
    start: round2(start),
    total: round2(current - start),
    month: monthAgo ? round2(current - monthAgo.weight) : null,
    perWeek, goal: goal || null, toGoal, goalPct, weeksToGoal, onTrack,
    daysSinceLast: Math.max(0, dayNum(todayISO()) - lastDay),
    count: entries.length
  };
}

/* The sign stays on the left of the number inside Hebrew text only inside
   a left-to-right isolate (U+2066 … U+2069). */
const signed = (n, unit = 'ק״ג') => `\u2066${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(round2(n))}\u2069 ${unit}`;

/** The sentence under the goal bar. */
export function goalLine(st) {
  if (!st?.goal) return 'הגדר משקל יעד כדי לראות כמה נשאר ומתי תגיע.';
  if (st.weeksToGoal === 0) return 'הגעת ליעד. עכשיו שומרים עליו.';
  const left = `נשארו ${Math.abs(st.toGoal)} ק״ג ליעד ${st.goal}`;
  if (st.perWeek == null) return `${left}. עוד כמה שקילות ונדע את הקצב.`;
  if (!st.onTrack) return `${left}. בשבועות האחרונים המגמה הפוכה ליעד (${signed(st.perWeek)} לשבוע).`;
  return `${left} · בקצב של ${signed(st.perWeek)} לשבוע — בעוד כ-${st.weeksToGoal} שבועות.`;
}

/**
 * The weigh-in: one number with big ± buttons, starting from the last one,
 * and the goal weight beside it. Saves to body_logs and keeps the profile's
 * bodyweight (which the protein and calorie targets read) current.
 */
export function weighSheet(ctx, { onSaved } = {}) {
  weighIns().then((entries) => openSheet('שקילה', (close) => {
    const box = el('div', { class: 'stack' });
    const last = entries[entries.length - 1]?.weight || ctx.settings.bodyweight || 75;
    let w = Math.round(last * 10) / 10;

    const input = el('input', {
      type: 'number', inputmode: 'decimal', step: '0.1', class: 'weigh-in', 'aria-label': 'משקל בקילוגרם'
    });
    input.value = w;
    input.addEventListener('input', () => { w = Number(input.value) || 0; });
    const nudge = (d) => { w = round2(Math.max(20, (Number(input.value) || w) + d)); input.value = w; buzz(6); };

    const goal = el('input', {
      type: 'number', inputmode: 'decimal', step: '0.5', placeholder: 'לא הוגדר', 'aria-label': 'משקל יעד'
    });
    if (ctx.settings.goalWeight) goal.value = ctx.settings.goalWeight;
    const date = el('input', { type: 'date', value: todayISO(), 'aria-label': 'תאריך' });

    box.append(
      el('div', { class: 'weigh-row' }, [
        el('button', { class: 'qty-btn', 'aria-label': 'פחות 0.1', onclick: () => nudge(-0.1) }, [icon(ICONS.minus, 20)]),
        el('div', { class: 'weigh-box' }, [input, el('span', { text: 'ק״ג' })]),
        el('button', { class: 'qty-btn', 'aria-label': 'יותר 0.1', onclick: () => nudge(0.1) }, [icon(ICONS.plus, 20)])
      ]),
      el('p', { class: 'tiny dim', style: { margin: 0, textAlign: 'center' }, text: entries.length ? `שקילה קודמת: ${round2(last)} ק״ג` : 'בבוקר, אחרי שירותים ולפני אוכל — כך המספרים בני השוואה.' }),
      el('div', { class: 'grid-2' }, [
        el('div', {}, [el('label', { class: 'field-label', text: 'משקל יעד (ק״ג)' }), goal]),
        el('div', {}, [el('label', { class: 'field-label', text: 'תאריך' }), date])
      ]),
      el('button', {
        class: 'btn primary full',
        onclick: async () => {
          const kg = round2(Number(input.value) || 0);
          if (kg < 20 || kg > 400) { toast('משקל לא תקין', 'bad'); return; }
          await db.put('body_logs', { id: db.uid('b'), date: date.value || todayISO(), weight: kg, sites: {}, photo: null, timestamp: Date.now() });
          const latest = (await weighIns()).pop();
          if (latest) await ctx.saveSetting('bodyweight', latest.weight);
          const g = Number(goal.value) || null;
          await ctx.saveSetting('goalWeight', g && g > 20 ? g : null);
          close();
          toast('נשמר', 'ok');
          onSaved ? onSaved() : ctx.reload();
        }
      }, [icon(ICONS.check, 18), 'שמור'])
    );
    return box;
  }));
}

/**
 * The last seven days in four numbers: workouts, days protein was hit,
 * days water was hit, and the streak.
 */
export async function weekNumbers(settings, proteinFor) {
  const since = todayISO(new Date(Date.now() - 6 * DAY));
  const workouts = (await db.all('workouts')).filter((w) => w.completed && w.date >= since);
  const trained = new Set(workouts.map((w) => w.date));
  const days = (await db.all('nutrition_logs')).filter((d) => d.date >= since);
  const waterTarget = settings.waterTarget || 3000;
  let protein = 0, water = 0;
  for (const d of days) {
    if ((d.protein_grams || 0) >= proteinFor(trained.has(d.date)) * 0.95) protein++;
    if (dayWater(d) >= waterTarget) water++;
  }
  return { workouts: workouts.length, protein, water };
}
