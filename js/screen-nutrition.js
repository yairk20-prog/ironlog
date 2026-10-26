/* ==========================================================================
   screen-nutrition.js — daily calories, protein and water.
   Food is added four ways — database search, saved foods, a photo, free
   text. Search, saved foods and text work offline through food.js; the
   photo, the smarter text pass and lookups of unknown foods need the AI.
   ========================================================================== */

import * as db from './db.js';
import { el, icon, ICONS, toast, openSheet, closeSheet, confirmSheet, buzz } from './ui.js';
import {
  parseMeal, searchFoods, foodById, foodCount, POPULAR, norm, unitsFor, defaultPortion,
  portion, portionForGrams, foodFromItem, makeFood, foodFromAiItem, isKnownFood, describeAmount
} from './food.js';
import * as ai from './ai.js';
import * as reminders from './reminders.js';
import { goalList } from './programs.js';
import { proteinTarget, calorieTarget, todayISO, round2 } from './logic.js';
import { recentWorkouts } from './session.js';

/* A shape and a colour per macro group — not a photo (none exist for
   arbitrary typed food) and not an emoji (the app has none anywhere else),
   but still the "more colourful" cue the list otherwise lacks. */
const FOOD_CAT = {
  protein: { ico: ICONS.egg, color: 'var(--accent)' },
  dairy: { ico: ICONS.carton, color: '#4DA3FF' },
  carb: { ico: ICONS.grain, color: 'var(--warn)' },
  produce: { ico: ICONS.leaf, color: 'var(--ok)' },
  fat: { ico: ICONS.drop, color: '#B98BFF' },
  sweet: { ico: ICONS.candy, color: '#FF6FAE' },
  drink: { ico: ICONS.glass, color: '#5AC8FA' },
  dish: { ico: ICONS.plate, color: 'var(--text-2)' }
};
const foodIcon = (cat) => {
  const c = FOOD_CAT[cat] || { ico: ICONS.plate, color: 'var(--text-3)' };
  return el('div', { class: 'food-ico', style: { color: c.color } }, [icon(c.ico, 17)]);
};

export async function render(ctx) {
  const s = ctx.settings;
  const date = todayISO();
  ctx.setTitle('תזונה', new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }));

  const day = await loadDay(date);
  const trainedToday = (await recentWorkouts(10)).some((w) => w.date === date);
  const profile = { ...s, goals: goalList(s) };
  const pTarget = proteinTarget(profile, trainedToday);
  const kcalTarget = s.calorieTarget || calorieTarget(profile, trainedToday);

  /* Reminders compare the day against these; keep the server's copy true. */
  reminders.setTargets({ water_target: s.waterTarget || 3000, protein_target: pTarget });
  reminders.syncDay(day);

  const wrap = el('div', { class: 'stack' });

  /* ---- the day at a glance ----
     Two rings, read from across the room: protein and calories, the number
     eaten in the middle and what is left underneath. One button to add
     food, to the meal the clock says you are on. */
  wrap.appendChild(el('div', { class: 'card day-hero' }, [
    el('div', { class: 'card-head' }, [
      el('h3', { text: trainedToday ? 'יום אימון' : 'יום מנוחה' }),
      el('span', { class: 'badge accent', text: `${day.items.length} רישומים` })
    ]),
    el('div', { class: 'rings' }, [
      ring({ label: 'חלבון', value: day.protein_grams, target: pTarget, unit: 'גרם', short: 'ג׳', color: 'var(--accent)', cls: 'protein' }),
      ring({ label: 'קלוריות', value: day.calories_consumed, target: kcalTarget, unit: 'קק״ל', short: 'קק״ל', color: 'var(--ok)', cls: 'kcal', capped: true })
    ]),
    el('div', { class: 'macro-tiles' }, [
      macroTile('פחמימות', day.carbs_grams, 'var(--warn)'),
      macroTile('שומן', day.fat_grams, '#B98BFF')
    ]),
    el('button', {
      class: 'btn primary full',
      onclick: () => mealSheet(ctx, day, MEALS.find((m) => m.id === currentMeal()))
    }, [icon(ICONS.plus, 18), `הוסף מאכל · ${MEALS.find((m) => m.id === currentMeal()).name}`])
  ]));

  /* ---- water, counted the way people drink it ---- */
  wrap.appendChild(waterCard(ctx, day, s));

  /* ---- the one-tap way into reminders, until they are on ---- */
  const invite = await reminders.invite(ctx);
  if (invite) wrap.appendChild(invite);

  /* Adding food happens on the meal you are adding it to, so the two
     catch-all buttons that used to live here are gone. */

  /* ---- today's items ---- */
  /* The day is a set of meals, not a list of foods: a plus on each one, so
     adding lunch is one tap and the day reads back the way it was eaten. */
  wrap.appendChild(el('div', { class: 'section-title', text: 'הארוחות של היום' }));
  MEALS.forEach((meal) => wrap.appendChild(mealCard(ctx, day, meal)));

  /* ---- what to eat, given what you are training for ---- */
  wrap.appendChild(el('div', { class: 'section-title', text: 'מה כדאי לאכול' }));
  wrap.appendChild(guidanceCard(ctx, day, pTarget, kcalTarget, trainedToday));

  /* ---- coach / dietitian notes ---- */
  wrap.appendChild(el('div', { class: 'section-title', text: 'דגשים מהמאמן / תזונאית' }));
  wrap.appendChild(await notesTile(ctx));

  return wrap;
}

/* ---------- storage ---------- */

async function loadDay(date) {
  const rows = await db.byIndex('nutrition_logs', 'date', IDBKeyRange.only(date));
  if (rows.length) return normalize(rows[0]);
  return normalize({ id: db.uid('n'), date });
}

function normalize(row) {
  return {
    id: row.id,
    date: row.date,
    calories_consumed: row.calories_consumed || 0,
    protein_grams: row.protein_grams || 0,
    carbs_grams: row.carbs_grams || 0,
    fat_grams: row.fat_grams || 0,
    water_ml: row.water_ml || 0,
    items: (row.items || []).map((i) => ({ meal: i.meal || 'other', ...i })),
    ai_raw_analysis: row.ai_raw_analysis || null
  };
}

function recompute(day) {
  const t = day.items.reduce((a, i) => ({
    kcal: a.kcal + (i.kcal || 0), p: a.p + (i.p || 0), c: a.c + (i.c || 0), f: a.f + (i.f || 0)
  }), { kcal: 0, p: 0, c: 0, f: 0 });
  day.calories_consumed = Math.round(t.kcal);
  day.protein_grams = round2(t.p);
  day.carbs_grams = round2(t.c);
  day.fat_grams = round2(t.f);
}

const saveDay = async (day) => {
  await db.put('nutrition_logs', day);
  reminders.syncDay(day);
};

/* ---------- meals ---------- */

/* Times are when people actually eat, and the order is the order of the day —
   the card you want is the one nearest the top when you open the app. */
const MEALS = [
  { id: 'breakfast', name: 'ארוחת בוקר', hint: 'חלבון + פחמימה מורכבת', from: 5, to: 11 },
  { id: 'snack1', name: 'ביניים · בוקר', hint: 'פרי, יוגורט, אגוזים', from: 11, to: 13 },
  { id: 'lunch', name: 'ארוחת צהריים', hint: 'העיקרית — חלבון, פחמימה, ירק', from: 13, to: 17 },
  { id: 'snack2', name: 'ביניים · אחה״צ', hint: 'לפני או אחרי האימון', from: 17, to: 20 },
  { id: 'dinner', name: 'ארוחת ערב', hint: 'חלבון וירקות, פחמימה קלה', from: 20, to: 23 },
  { id: 'other', name: 'נשנושים', hint: 'כל מה שנאכל בדרך', from: 0, to: 5 }
];

/** The meal the clock says you are probably adding to. */
function currentMeal() {
  const h = new Date().getHours();
  return (MEALS.find((m) => h >= m.from && h < m.to) || MEALS[0]).id;
}

function mealCard(ctx, day, meal) {
  const items = day.items.filter((i) => (i.meal || 'other') === meal.id);
  const kcal = Math.round(items.reduce((a, i) => a + (i.kcal || 0), 0));
  const protein = round2(items.reduce((a, i) => a + (i.p || 0), 0));
  const now = currentMeal() === meal.id;

  const rows = items.map((it) => {
    const index = day.items.indexOf(it);
    /* Tapping a logged food reopens its portion: "it was two, not one" is
       the commonest correction, and deleting and re-adding is the long way. */
    return el('div', { class: 'meal-item' }, [
      el('button', { class: 'meal-item-main', 'aria-label': `ערוך ${it.label}`, onclick: () => editItem(ctx, day, index) }, [
        foodIcon(it.cat),
        el('div', { class: 'grow' }, [
          el('b', { text: it.label }),
          el('small', { text: `${it.amount || ''} · ${Math.round(it.kcal)} קק״ל · ${round2(it.p)} ג׳ חלבון` })
        ])
      ]),
      el('button', {
        class: 'meal-del', 'aria-label': `מחק ${it.label}`,
        onclick: async () => {
          day.items.splice(index, 1);
          recompute(day);
          await saveDay(day);
          ctx.reload();
        }
      }, [icon(ICONS.trash, 14)])
    ]);
  });

  return el('div', { class: `meal${now ? ' now' : ''}${items.length ? ' filled' : ''}` }, [
    el('div', { class: 'meal-head' }, [
      el('div', { class: 'grow' }, [
        el('b', { text: meal.name }),
        el('small', { text: items.length ? `${kcal} קק״ל · ${protein} ג׳ חלבון` : meal.hint })
      ]),
      el('button', {
        class: 'meal-add', 'aria-label': `הוסף ל${meal.name}`,
        onclick: () => mealSheet(ctx, day, meal)
      }, [icon(ICONS.plus, 20)])
    ]),
    ...rows
  ]);
}

/* ---------- what to eat ---------- */

/**
 * Guidance that follows the goals actually selected, and the gap left in the
 * day. Generic advice is ignorable; "you are 60 g of protein short and it is
 * eight in the evening" is not.
 */
function guidanceCard(ctx, day, pTarget, kcalTarget, trainedToday) {
  const goals = goalList(ctx.settings);
  const proteinLeft = Math.max(0, Math.round(pTarget - day.protein_grams));
  const kcalLeft = Math.round(kcalTarget - day.calories_consumed);
  const hour = new Date().getHours();

  const lines = [];

  if (proteinLeft > 0) {
    const portions = Math.max(1, Math.round(proteinLeft / 25));
    lines.push({
      icon: ICONS.target,
      title: `חסרים ${proteinLeft} גרם חלבון`,
      text: `זה בערך ${portions} מנות: חזה עוף 150 ג׳, 200 ג׳ קוטג׳, סקופ אבקת חלבון או 3 ביצים.`
    });
  }

  if ((goals.includes('cut') || goals.includes('lose')) && kcalLeft < 0) {
    lines.push({
      icon: ICONS.flame,
      title: `חריגה של ${Math.abs(kcalLeft)} קק״ל`,
      text: 'בגירעון שווה לסגור את היום בחלבון וירקות — הם משביעים על הכי מעט קלוריות.'
    });
  } else if (goals.includes('hypertrophy') && kcalLeft > 400 && hour >= 19) {
    lines.push({
      icon: ICONS.plus,
      title: `נשארו ${kcalLeft} קק״ל`,
      text: 'לבניית שריר צריך עודף. ארוחה נוספת עכשיו עדיפה על לסיים את היום בחוסר.'
    });
  }

  if (goals.includes('strength') && trainedToday) {
    lines.push({
      icon: ICONS.plate,
      title: 'פחמימה אחרי אימון כוח',
      text: 'אורז, פסטה, תפוח אדמה או פירות בשעתיים שאחרי — זה מה שממלא את מאגרי הגליקוגן לאימון הבא.'
    });
  }

  if (goals.includes('abs') || goals.includes('cut') || goals.includes('lose')) {
    lines.push({
      icon: ICONS.glass,
      title: 'סיבים ומים',
      text: 'ירקות בכל ארוחה ושתייה לפני האוכל — הדרך הזולה ביותר להרגיש שבע בגירעון.'
    });
  }

  if (!lines.length) {
    lines.push({
      icon: ICONS.check,
      title: 'היום סגור',
      text: 'החלבון והקלוריות בטווח. כל מה שנשאר זה לחזור על זה מחר.'
    });
  }

  return el('div', { class: 'stack' }, lines.map((l) => el('div', { class: 'rest-tip' }, [
    el('div', { class: 'rest-tip-ico' }, [icon(l.icon, 18)]),
    el('div', { class: 'grow' }, [el('b', { text: l.title }), el('p', { text: l.text })])
  ])));
}

/* ---------- UI bits ---------- */

/* Nobody thinks in millilitres. A glass is 250 ml, a sports bottle is 750:
   the card counts glasses and stores the millilitres behind them. */
const GLASS_ML = 250;
const BOTTLE_ML = 750;

function waterCard(ctx, day, s) {
  const targetMl = s.waterTarget || 3000;
  const targetGlasses = Math.max(1, Math.round(targetMl / GLASS_ML));
  const drunk = day.water_ml / GLASS_ML;
  const full = Math.floor(drunk + 0.001);
  const pct = Math.min(1, day.water_ml / targetMl);
  const left = Math.max(0, targetGlasses - full);
  const litres = (ml) => (Math.round(ml / 100) / 10).toLocaleString('he-IL');

  const add = async (ml) => {
    day.water_ml = Math.max(0, day.water_ml + ml);
    await saveDay(day);
    buzz(10);
    ctx.reload();
  };

  /* One glass per tap, so the row is both the readout and the control. */
  const glasses = el('div', { class: 'glasses' });
  for (let i = 0; i < targetGlasses; i++) {
    const filled = i < full;
    glasses.appendChild(el('button', {
      class: `glass${filled ? ' full' : ''}`,
      'aria-label': filled ? `כוס ${i + 1}, שתויה` : `כוס ${i + 1}`,
      onclick: () => add(filled ? -GLASS_ML : (i + 1 - full) * GLASS_ML)
    }, [icon(ICONS.glass, 20)]));
  }

  /* The tank fills as the day does — the one picture that says "drink"
     without reading anything. */
  const tank = el('div', {
    class: `tank${left ? '' : ' done'}`,
    role: 'progressbar', 'aria-label': `מים: ${full} מתוך ${targetGlasses} כוסות`,
    'aria-valuemin': '0', 'aria-valuemax': String(targetGlasses), 'aria-valuenow': String(full)
  }, [
    el('div', { class: 'tank-fill', style: { height: `${Math.round(pct * 100)}%` } }),
    el('div', { class: 'tank-text' }, [
      el('b', { class: 'num', text: String(full) }),
      el('small', { text: `מתוך ${targetGlasses}` })
    ])
  ]);

  return el('div', { class: 'card water-card' }, [
    el('div', { class: 'water-top' }, [
      tank,
      el('div', { class: 'water-info' }, [
        el('div', { class: 'card-head' }, [
          el('h3', { text: 'מים' }),
          el('span', { class: `badge ${left ? 'water' : 'ok'}`, text: left ? `עוד ${left} כוסות` : 'הושלם' })
        ]),
        el('div', { class: 'water-line' }, [
          el('b', { class: 'num', text: litres(day.water_ml) }),
          el('span', { text: ` מתוך ${litres(targetMl)} ליטר` })
        ]),
        el('button', { class: 'btn water-add full', onclick: () => add(GLASS_ML) }, [icon(ICONS.plus, 18), 'כוס מים']),
        el('div', { class: 'row', style: { gap: '8px' } }, [
          el('button', { class: 'btn sm grow', onclick: () => add(BOTTLE_ML) }, [icon(ICONS.bottle, 15), 'בקבוק']),
          full ? el('button', { class: 'btn sm ghost', 'aria-label': 'בטל כוס אחרונה', onclick: () => add(-GLASS_ML) }, [icon(ICONS.minus, 15), 'בטל']) : null
        ])
      ])
    ]),
    glasses,
    el('div', { class: 'tiny dim', text: `כוס = ${GLASS_ML} מ״ל · בקבוק = ${BOTTLE_ML} מ״ל` })
  ]);
}

/**
 * A progress ring. `capped` is for a ceiling (calories): going past it turns
 * the ring amber and says by how much, instead of celebrating.
 */
function ring({ label, value, target, unit, short, color, cls, capped = false }) {
  const v = Math.round(value);
  const t = Math.round(target) || 1;
  const pct = Math.min(1, v / t);
  const over = capped && v > t;
  const done = !capped && v >= t;
  const R = 50;
  const C = 2 * Math.PI * R;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 120 120');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `<circle class="ring-track" cx="60" cy="60" r="${R}"/>`
    + `<circle class="ring-fill" cx="60" cy="60" r="${R}" stroke-dasharray="${C.toFixed(1)}"`
    + ` stroke-dashoffset="${(C * (1 - pct)).toFixed(1)}" transform="rotate(-90 60 60)"`
    + ` style="stroke:${over ? 'var(--warn)' : color}"/>`;

  const left = t - v;
  const foot = over ? `חריגה של ${-left} ${short}`
    : done ? 'היעד הושג'
      : `נשארו ${left} ${short}`;

  return el('div', {
    class: `ring ${cls}${done ? ' done' : ''}${over ? ' over' : ''}`,
    role: 'progressbar', 'aria-label': `${label}: ${v} מתוך ${t} ${unit}`,
    'aria-valuemin': '0', 'aria-valuemax': String(t), 'aria-valuenow': String(v)
  }, [
    el('div', { class: 'ring-dial' }, [
      svg,
      el('div', { class: 'ring-center' }, [
        el('b', { class: 'num', text: String(v) }),
        el('small', { text: `מתוך ${t}` })
      ])
    ]),
    el('div', { class: 'ring-label' }, [
      el('b', { text: label }),
      el('small', {}, [done ? icon(ICONS.check, 12) : null, foot])
    ])
  ]);
}

const macroTile = (label, grams, color) => el('div', { class: 'macro-tile', style: { '--c': color } }, [
  el('small', { text: label }),
  el('b', { class: 'num', text: `${Math.round(grams)} ג׳` })
]);

/* ---------- adding food ----------
   Four ways in, because people remember a meal in four different ways: by
   name ("קוטג׳"), by habit (the same breakfast every day), by looking at it
   (a photo), or as a sentence. Every one of them ends in the same item
   shape, with calories, protein, carbs and fat computed from per-100 g
   values — so the day's totals mean the same thing whichever way was used. */

/** The user's own foods: saved favourites and foods they defined. */
const savedFoods = () => db.setting('savedFoods', []);
const customFoods = () => db.setting('customFoods', []);

async function myFoods() {
  const [saved, custom] = await Promise.all([savedFoods(), customFoods()]);
  const seen = new Set();
  return [...custom, ...saved].filter((f) => (seen.has(f.id) ? false : seen.add(f.id)));
}

/** Resolve a food id: the database first, so a fixed value is never stale. */
const resolver = (mine) => (id) => foodById(id) || mine.find((f) => f.id === id) || null;

async function isSaved(food) {
  return (await savedFoods()).some((f) => f.id === food.id);
}

async function toggleSaved(food) {
  const list = await savedFoods();
  const on = list.some((f) => f.id === food.id);
  const next = on ? list.filter((f) => f.id !== food.id) : [{ ...food }, ...list].slice(0, 60);
  await db.setSetting('savedFoods', next);
  return !on;
}

async function addCustomFood(food) {
  const list = await customFoods();
  const same = list.find((f) => norm(f.name) === norm(food.name));
  const keep = same ? { ...food, id: same.id } : food;
  await db.setSetting('customFoods', [keep, ...list.filter((f) => f.id !== keep.id)].slice(0, 200));
  return keep;
}

/**
 * Foods eaten lately, most often first — the list that makes the third
 * identical breakfast a single tap.
 */
async function recentFoods(limit = 12) {
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const days = (await db.all('nutrition_logs')).filter((d) => d.date >= since)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const map = new Map();
  for (const d of days) {
    for (const it of d.items || []) {
      if (!it.label || it.amount === 'ידני') continue;
      const key = it.fid || `${it.label}|${it.amount}`;
      const row = map.get(key);
      if (row) row.count++;
      else map.set(key, { item: it, count: 1, date: d.date });
    }
  }
  return [...map.values()]
    .sort((a, b) => b.count - a.count || (a.date < b.date ? 1 : -1))
    .slice(0, limit)
    .map((r) => r.item);
}

const macroLine = (i) => `${Math.round(i.kcal)} קק״ל · ${round1(i.p)} ג׳ חלבון`;
const round1 = (n) => Math.round((n || 0) * 10) / 10;

/** Put items on the meal, keep the day's totals true, and say so. */
async function addItems(flow, items) {
  if (!items.length) return;
  const learned = await learnFoods(items);
  items = items.map((i) => learned.get(i) || i);
  flow.day.items.push(...items.map((i) => ({ ...i, meal: flow.meal.id })));
  recompute(flow.day);
  await saveDay(flow.day);
  flow.added.push(...items);
  buzz(12);
  const names = [...learned.values()].map((i) => i.label);
  toast(names.length
    ? `נוסף, ונשמר במאגר שלך: ${names.join(', ')}`
    : (items.length === 1 ? `נוסף: ${items[0].label}` : `נוספו ${items.length} פריטים`), 'ok');
  flow.ctx.reload();
}

/**
 * Whatever the AI recognised that the database doesn't know is kept as one
 * of the user's own foods — so the next time it is a search hit, a word the
 * free-text parser understands, and works with no connection and no credit.
 * The logged item is re-pointed at that food, so it reopens in its units.
 * @returns {Map<object, object>} original item → item linked to its food
 */
async function learnFoods(items) {
  const out = new Map();
  const fresh = items.filter((i) => i.src === 'ai' && !i.fid && !isKnownFood(i.label));
  if (!fresh.length) return out;
  let list = await customFoods();
  for (const item of fresh) {
    const made = foodFromAiItem(item);
    if (!made) continue;
    /* Seen before under the same name: refresh its values, keep its id. */
    const same = list.find((f) => norm(f.name) === norm(made.food.name));
    const food = same ? { ...made.food, id: same.id } : made.food;
    list = [food, ...list.filter((f) => f.id !== food.id)];
    const { src: _s, ...rest } = item;
    out.set(item, { ...rest, fid: food.id, grams: made.grams });
  }
  await db.setSetting('customFoods', list.slice(0, 300));
  return out;
}

/**
 * One page of the add-food flow: a way back to the four options on top, and
 * — once something has been added — a running total and a way out below.
 */
function page(flow, title, build, { back = () => mealSheet(flow.ctx, flow.day, flow.meal, flow) } = {}) {
  openSheet(title, (close) => {
    const box = el('div', { class: 'stack' });
    box.appendChild(el('button', { class: 'linkish add-back', onclick: back }, [icon(ICONS.chevron, 16), 'חזרה']));
    const body = build(close);
    (Array.isArray(body) ? body : [body]).filter(Boolean).forEach((n) => box.appendChild(n));
    if (flow.added.length) box.appendChild(doneBar(flow, close));
    return box;
  });
}

function doneBar(flow, close) {
  const t = sum(flow.added);
  return el('div', { class: 'add-done' }, [
    el('div', { class: 'grow' }, [
      el('b', { text: `נוספו ל${flow.meal.name}: ${flow.added.length}` }),
      el('small', { text: `${Math.round(t.kcal)} קק״ל · ${round1(t.p)} ג׳ חלבון` })
    ]),
    el('button', { class: 'btn sm primary', text: 'סיום', onclick: close })
  ]);
}

function mealSheet(ctx, day, meal = MEALS.find((m) => m.id === currentMeal()), flow = null) {
  flow = flow || { ctx, day, meal, added: [] };
  openSheet(`הוספת מאכל · ${meal.name}`, (close) => {
    const box = el('div', { class: 'stack' });
    const tile = (ico, title, sub, onclick) => el('button', { class: 'add-tile', onclick }, [
      el('span', { class: 'add-tile-ico' }, [icon(ico, 26)]),
      el('b', { text: title }),
      el('small', { text: sub })
    ]);
    box.appendChild(el('div', { class: 'add-grid' }, [
      tile(ICONS.search, 'חיפוש במאגר', `${foodCount} מאכלים, ועוד עם AI`, () => searchSheet(flow)),
      tile(ICONS.heart, 'מאכלים שמורים', 'מועדפים ואחרונים', () => savedSheet(flow)),
      tile(ICONS.camera, 'צילום', 'AI מזהה מה בצלחת', () => photoSheet(flow)),
      tile(ICONS.pen, 'תיאור חופשי', 'כתוב מה אכלת', () => textSheet(flow))
    ]));

    /* The last few things eaten, one tap each — most meals repeat. */
    const quick = el('div', { class: 'stack' });
    box.appendChild(quick);
    recentFoods(4).then((list) => {
      if (!list.length) return;
      quick.appendChild(el('div', { class: 'section-title', text: 'שוב אותו דבר?' }));
      const rows = el('div', { class: 'food-list' });
      list.forEach((it) => rows.appendChild(el('div', { class: 'food-row' }, [
        foodIcon(it.cat),
        el('div', { class: 'grow' }, [el('b', { text: it.label }), el('small', { text: `${it.amount} · ${macroLine(it)}` })]),
        el('button', {
          class: 'food-quick', 'aria-label': `הוסף שוב ${it.label}`,
          onclick: async (e) => {
            const btn = e.currentTarget;   // gone once the handler awaits
            btn.disabled = true;
            const { meal: _m, ...copy } = it;
            await addItems(flow, [copy]);
            btn.replaceChildren(icon(ICONS.check, 18));
          }
        }, [icon(ICONS.plus, 18)])
      ])));
      quick.appendChild(rows);
    });

    if (flow.added.length) box.appendChild(doneBar(flow, close));
    return box;
  });
}

/* ---------- 1. search the database ---------- */

function foodRow(food, onclick, extra = null) {
  const def = defaultPortion(food);
  const it = portion(food, def.unit, def.qty);
  return el('div', { class: 'food-row' }, [
    el('button', { class: 'food-row-main', onclick }, [
      foodIcon(food.cat),
      el('div', { class: 'grow' }, [
        el('b', { text: food.name }),
        el('small', { text: `${it.amount} · ${macroLine(it)}` })
      ]),
      food.custom ? el('span', { class: 'badge', text: food.src === 'ai' ? 'AI' : 'שלי' }) : null
    ]),
    extra
  ]);
}

function searchSheet(flow) {
  page(flow, 'חיפוש במאגר', () => {
    const input = el('input', { type: 'search', placeholder: 'חפש מאכל — קוטג׳, פיתה, שקדים…', enterkeyhint: 'search' });
    input.value = flow.query || '';
    const list = el('div', { class: 'food-list' });
    const more = el('div', { class: 'stack' });
    let mine = [];

    const draw = () => {
      const q = input.value.trim();
      flow.query = q;
      list.replaceChildren();
      more.replaceChildren();
      const found = q ? searchFoods(q, mine) : POPULAR;
      /* Before anything is typed: the foods the app has learned for this
         user come first — that is what "I won't have to look it up again"
         means. */
      const own = q ? [] : mine.filter((f) => f.custom).slice(0, 8);
      if (own.length) {
        list.appendChild(el('div', { class: 'section-title', text: 'המאכלים שלי' }));
        own.forEach((f) => list.appendChild(foodRow(f, () => portionSheet(flow, f, { back: () => searchSheet(flow) }))));
      }
      if (!q) list.appendChild(el('div', { class: 'section-title', text: 'נפוצים' }));
      found.forEach((f) => list.appendChild(foodRow(f, () => portionSheet(flow, f, { back: () => searchSheet(flow) }))));
      if (!q) return;

      if (!found.length) more.appendChild(el('div', { class: 'tiny dim', text: `"${q}" לא נמצא במאגר.` }));
      /* Not in the database is not a dead end: ask the AI for its label
         values, or type them off the package. Either way it is kept, so the
         next search finds it offline. */
      const aiBtn = el('button', { class: 'btn full' }, [icon(ICONS.spark, 18), `חפש "${q}" עם AI`]);
      aiBtn.addEventListener('click', async () => {
        if (!(await ai.hasKey())) {
          toast('חיפוש AI דורש חיבור — הגדר מפתח API בהגדרות, או צור את המאכל ידנית', 'bad');
          return;
        }
        aiBtn.disabled = true;
        aiBtn.replaceChildren(icon(ICONS.spark, 18), 'מחפש ערכים…');
        try {
          const r = await ai.lookupFood(q);
          const food = await addCustomFood(makeFood({
            name: r.name, cat: r.cat, kcal: r.kcal, p: r.p, c: r.c, f: r.f,
            g: r.unitG, ul: r.unitLabel, d: r.defG, src: 'ai'
          }));
          if (r.note) toast(r.note);
          portionSheet(flow, food, { back: () => searchSheet(flow) });
        } catch (err) {
          toast(err.message, 'bad');
          aiBtn.disabled = false;
          aiBtn.replaceChildren(icon(ICONS.spark, 18), `חפש "${q}" עם AI`);
        }
      });
      more.appendChild(aiBtn);
      more.appendChild(el('button', {
        class: 'btn full ghost', onclick: () => customFoodSheet(flow, q)
      }, [icon(ICONS.plus, 18), 'צור מאכל חדש מהתווית']));
    };

    input.addEventListener('input', draw);
    myFoods().then((m) => { mine = m; draw(); });
    draw();
    requestAnimationFrame(() => input.focus({ preventScroll: true }));
    return [input, list, more];
  });
}

/* ---------- the portion picker ---------- */

/**
 * Choose how much, see what it comes to. Every number on the page is
 * computed from the food's per-100 g values as the amount changes.
 * @param {object} opts back: where "חזרה" goes; grams: start amount;
 *                      onSave: replace an existing item instead of adding.
 */
function portionSheet(flow, food, { back, grams = null, onSave = null } = {}) {
  page(flow, food.name, (close) => {
    const units = unitsFor(food);
    let { unit, qty } = grams ? portionForGrams(food, grams) : defaultPortion(food);

    /* The title already names the food; the head says what the numbers
       are per, so the label on the package can be checked against it. */
    const perTitle = food.serving ? `מנה · ${food.serving}` : `ערכים ל-100 ${food.ml ? 'מ״ל' : 'גרם'}`;
    const per = `${Math.round(food.kcal)} קק״ל · חלבון ${round1(food.p)} · פחמימות ${round1(food.c)} · שומן ${round1(food.f)}`;

    const chips = el('div', { class: 'unit-chips' });
    const qtyIn = el('input', { type: 'number', inputmode: 'decimal', min: '0', step: 'any', class: 'qty-in', 'aria-label': 'כמות' });
    const unitLbl = el('span', { class: 'qty-unit' });
    const grid = el('div', { class: 'macro-grid' });
    /* What the amount is, in the other language: grams said as a plate or a
       cup, a plate said in grams. */
    const grams_ = el('div', { class: 'amount-like' });

    const step = () => (unit.id === 'g' ? (qty >= 100 ? 10 : 5) : 0.5);
    const draw = () => {
      /* Each measure carries its weight, so "a plate" and "250 g" are never
         apart. */
      chips.replaceChildren(...units.map((u) => el('button', {
        class: `chip unit-chip${u.id === unit.id ? ' on' : ''}`,
        'aria-label': u.id === 'g' || u.id === 'serving' ? u.label : `${u.label}, ${Math.round(u.g)} ${food.ml ? 'מ״ל' : 'גרם'}`,
        onclick: () => {
          if (u.id === unit.id) return;
          /* Switching measure keeps the amount on the plate the same,
             rounded to something you could actually serve. */
          const g = unit.g * qty;
          unit = u;
          qty = u.id === 'g' ? Math.round(g) : Math.max(0.5, Math.round((g / u.g) * 2) / 2);
          qtyIn.value = qty;
          draw();
        }
      }, [
        el('span', { text: u.label }),
        u.id === 'g' || u.id === 'serving' ? null : el('small', { text: `${Math.round(u.g)} ${food.ml ? 'מ״ל' : 'ג׳'}` })
      ])));
      unitLbl.textContent = unit.label;
      const it = portion(food, unit, qty || 0);
      grid.replaceChildren(
        cell('קלוריות', Math.round(it.kcal), 'קק״ל', 'kcal'),
        cell('חלבון', round1(it.p), 'ג׳', 'p'),
        cell('פחמימות', round1(it.c), 'ג׳', 'c'),
        cell('שומן', round1(it.f), 'ג׳', 'f')
      );
      const like = unit.id === 'g' ? describeAmount(food, it.grams) : null;
      grams_.replaceChildren(...(food.serving ? [] : unit.id === 'g'
        ? (like ? [icon(ICONS.plate, 15), el('span', { text: `זה בערך ${like}` })] : [])
        : [el('span', { text: `= ${Math.round(it.grams)} ${food.ml ? 'מ״ל' : 'גרם'}` })]));
      grams_.hidden = !grams_.childNodes.length;
    };
    const cell = (label, value, unitText, cls) => el('div', { class: `macro-cell ${cls}` }, [
      el('small', { text: label }), el('b', { class: 'num', text: String(value) }), el('span', { text: unitText })
    ]);

    qtyIn.value = qty;
    qtyIn.addEventListener('input', () => { qty = Math.max(0, Number(qtyIn.value) || 0); draw(); });
    const nudge = (dir) => {
      qty = Math.max(unit.id === 'g' ? 5 : 0.5, Math.round((qty + dir * step()) * 10) / 10);
      qtyIn.value = qty;
      draw();
    };

    const heart = el('button', { class: 'btn sm ghost heart-btn', 'aria-pressed': 'false' });
    const paintHeart = (on) => {
      heart.classList.toggle('on', on);
      heart.setAttribute('aria-pressed', String(on));
      heart.replaceChildren(icon(ICONS.heart, 16), on ? 'שמור במועדפים' : 'שמור למועדפים');
    };
    isSaved(food).then(paintHeart);
    heart.addEventListener('click', async () => {
      const on = await toggleSaved(food);
      paintHeart(on);
      buzz(8);
      toast(on ? 'נשמר במאכלים השמורים' : 'הוסר מהשמורים');
    });

    const go = el('button', {
      class: 'btn primary full',
      text: onSave ? 'עדכן' : `הוסף ל${flow.meal.name}`,
      onclick: async () => {
        if (!(qty > 0)) { toast('בחר כמות', 'bad'); return; }
        const item = portion(food, unit, qty);
        if (onSave) { await onSave(item); close(); return; }
        await addItems(flow, [item]);
        back();
      }
    });

    draw();
    return [
      el('div', { class: 'portion-head' }, [
        foodIcon(food.cat),
        el('div', { class: 'grow' }, [el('b', { text: perTitle }), el('small', { text: per })]),
        heart
      ]),
      chips,
      el('div', { class: 'qty-row' }, [
        el('button', { class: 'qty-btn', 'aria-label': 'פחות', onclick: () => nudge(-1) }, [icon(ICONS.minus, 18)]),
        qtyIn, unitLbl,
        el('button', { class: 'qty-btn', 'aria-label': 'יותר', onclick: () => nudge(1) }, [icon(ICONS.plus, 18)])
      ]),
      grams_,
      grid,
      go
    ];
  }, { back });
}

/* ---------- a food from the package label ---------- */

const CATS = [
  ['protein', 'חלבון'], ['dairy', 'חלב'], ['carb', 'פחמימה'], ['produce', 'פרי / ירק'],
  ['fat', 'שומן'], ['sweet', 'מתוק / חטיף'], ['drink', 'משקה'], ['dish', 'מנה']
];

function customFoodSheet(flow, name = '') {
  page(flow, 'מאכל חדש', () => {
    let cat = 'dish';
    const nm = el('input', { type: 'text', placeholder: 'שם המאכל', value: name });
    nm.value = name;
    const num = (ph) => el('input', { type: 'number', inputmode: 'decimal', min: '0', step: 'any', placeholder: ph });
    const kc = num('קלוריות'), pr = num('חלבון'), cb = num('פחמימות'), ft = num('שומן');
    const ug = num('משקל יחידה (גרם)');
    const ul = el('input', { type: 'text', placeholder: 'שם היחידה (חטיף, פרוסה…)' });
    const chips = el('div', { class: 'unit-chips' });
    const drawCats = () => chips.replaceChildren(...CATS.map(([id, label]) => el('button', {
      class: `chip${id === cat ? ' on' : ''}`, text: label, onclick: () => { cat = id; drawCats(); }
    })));
    drawCats();

    const save = el('button', {
      class: 'btn primary full', text: 'שמור והמשך לכמות',
      onclick: async () => {
        const p = Number(pr.value) || 0, c = Number(cb.value) || 0, f = Number(ft.value) || 0;
        /* No calories on the label (or not typed)? They follow from the
           macros: 4 per gram of protein and carbs, 9 per gram of fat. */
        const kcal = Number(kc.value) || Math.round(p * 4 + c * 4 + f * 9);
        if (!nm.value.trim()) { toast('תן שם למאכל', 'bad'); return; }
        if (!kcal) { toast('הזן לפחות קלוריות או ערכי מאקרו', 'bad'); return; }
        const food = await addCustomFood(makeFood({
          name: nm.value, cat, kcal, p, c, f, g: Number(ug.value) || null, ul: ul.value.trim() || null
        }));
        portionSheet(flow, food, { back: () => searchSheet(flow) });
      }
    });

    return [
      el('p', { class: 'tiny dim', style: { margin: 0 }, text: 'הערכים כמו בטבלה התזונתית על האריזה — ל-100 גרם. המאכל נשמר ויופיע בחיפוש הבא, גם בלי אינטרנט.' }),
      nm,
      chips,
      el('div', { class: 'field-label', text: 'ל-100 גרם' }),
      el('div', { class: 'grid-2' }, [kc, pr, cb, ft]),
      el('div', { class: 'field-label', text: 'יחידה (לא חובה)' }),
      el('div', { class: 'grid-2' }, [ug, ul]),
      save
    ];
  }, { back: () => searchSheet(flow) });
}

/* ---------- 2. saved and recent ---------- */

function savedSheet(flow) {
  page(flow, 'מאכלים שמורים', () => {
    const box = el('div', { class: 'stack' });
    const here = () => savedSheet(flow);
    Promise.all([savedFoods(), customFoods(), recentFoods(15)]).then(([saved, custom, recent]) => {
      const mine = [...custom, ...saved];
      const lookup = resolver(mine);
      const section = (title) => box.appendChild(el('div', { class: 'section-title', text: title }));

      section('מועדפים');
      if (!saved.length) {
        box.appendChild(el('p', { class: 'tiny dim', style: { margin: 0 }, text: 'עוד אין מועדפים. בכל מאכל יש כפתור לב — מה שמסומן בו מחכה כאן.' }));
      } else {
        const list = el('div', { class: 'food-list' });
        saved.forEach((s) => {
          const food = lookup(s.id) || s;
          list.appendChild(foodRow(food, () => portionSheet(flow, food, { back: here }), el('button', {
            class: 'food-quick on', 'aria-label': `הסר ${food.name} מהמועדפים`,
            onclick: async () => { await toggleSaved(food); here(); }
          }, [icon(ICONS.heart, 18)])));
        });
        box.appendChild(list);
      }

      if (recent.length) {
        section('אכלת לאחרונה');
        const list = el('div', { class: 'food-list' });
        recent.forEach((it) => {
          const { food, grams } = foodFromItem(it, lookup);
          list.appendChild(el('div', { class: 'food-row' }, [
            el('button', { class: 'food-row-main', onclick: () => portionSheet(flow, food, { back: here, grams }) }, [
              foodIcon(it.cat),
              el('div', { class: 'grow' }, [el('b', { text: it.label }), el('small', { text: `${it.amount} · ${macroLine(it)}` })])
            ]),
            el('button', {
              class: 'food-quick', 'aria-label': `הוסף שוב ${it.label}`,
              onclick: async (e) => {
                const btn = e.currentTarget;
                btn.disabled = true;
                const { meal: _m, ...copy } = it;
                await addItems(flow, [copy]);
                btn.replaceChildren(icon(ICONS.check, 18));
              }
            }, [icon(ICONS.plus, 18)])
          ]));
        });
        box.appendChild(list);
      }

      if (custom.length) {
        section('המאכלים שלי — מה-AI ומתוויות');
        const list = el('div', { class: 'food-list' });
        custom.forEach((food) => list.appendChild(foodRow(food, () => portionSheet(flow, food, { back: here }), el('button', {
          class: 'food-quick', 'aria-label': `מחק ${food.name}`,
          onclick: async () => {
            if (!(await confirmSheet('מחיקת מאכל', `למחוק את "${food.name}" מהמאכלים שלך? מה שכבר נרשם ביומן נשאר.`, 'מחק'))) { here(); return; }
            await db.setSetting('customFoods', (await customFoods()).filter((f) => f.id !== food.id));
            await db.setSetting('savedFoods', (await savedFoods()).filter((f) => f.id !== food.id));
            here();
          }
        }, [icon(ICONS.trash, 16)]))));
        box.appendChild(list);
      }
    });
    return box;
  });
}

/* ---------- 3. photo ---------- */

function photoSheet(flow) {
  page(flow, 'צילום הצלחת', () => {
    const box = el('div', { class: 'stack' });
    ai.hasKey().then((keyed) => {
      if (keyed) { box.append(...photoBody(flow)); return; }
      /* Without a model nothing can look at the photo, and pretending
         otherwise wastes a picture. Say so, and point at the two ways that
         work offline. */
      box.append(
        el('div', { class: 'rest-tip' }, [
          el('div', { class: 'rest-tip-ico' }, [icon(ICONS.camera, 18)]),
          el('div', { class: 'grow' }, [
            el('b', { text: 'זיהוי מתמונה עובד דרך AI' }),
            el('p', { text: 'צריך חיבור ל-AI (מפתח API בהגדרות, או שרת שמגיע עם האפליקציה). עד אז — חיפוש במאגר או תיאור חופשי עובדים גם בלי אינטרנט.' })
          ])
        ]),
        el('button', { class: 'btn full', onclick: () => { closeSheet(); flow.ctx.go('settings'); } }, [icon(ICONS.spark, 18), 'להגדרות ה-AI']),
        el('button', { class: 'btn full ghost', onclick: () => searchSheet(flow) }, [icon(ICONS.search, 18), 'חיפוש במאגר'])
      );
    });
    return box;
  });
}

function photoBody(flow) {
  const file = el('input', { type: 'file', accept: 'image/*', capture: 'environment', style: { display: 'none' } });
  const pick = el('button', {
    type: 'button', class: 'btn photo-pick',
    onclick: () => file.click()
  }, [icon(ICONS.camera, 24), el('span', { text: 'צלם או בחר תמונה של הצלחת' })]);
  const hint = el('input', { type: 'text', placeholder: 'רמז אופציונלי (למשל: צלחת גדולה, בלי רוטב)' });
  const out = el('div', { class: 'stack' });
  const results = el('div', { class: 'stack' });
  let items = [];

  const save = el('button', {
    class: 'btn primary full', text: `הוסף ל${flow.meal.name}`, disabled: true,
    onclick: async () => {
      if (!items.length) { toast('אין מה להוסיף', 'bad'); return; }
      await addItems(flow, items);
      mealSheet(flow.ctx, flow.day, flow.meal, flow);
    }
  });
  const drawItems = () => {
    results.replaceChildren(...itemRows(items, (i) => { items.splice(i, 1); drawItems(); }));
    save.disabled = !items.length;
  };

  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    if (!f) return;
    pick.remove();
    out.replaceChildren();

    let dataUrl;
    try {
      dataUrl = await shrink(f, 1024);
    } catch (err) {
      out.appendChild(el('div', { class: 'tiny', style: { color: 'var(--bad)' }, text: err.message }));
      return;
    }
    /* The photo stays on screen through analysis and stays put on failure
       too — losing sight of what you photographed while reading an error
       is its own small annoyance. */
    out.appendChild(el('img', { src: dataUrl, class: 'photo-preview', alt: 'הצלחת שצולמה' }));
    const status = el('div', { class: 'tiny dim', text: 'מנתח את התמונה…' });
    out.appendChild(status);

    try {
      const res = await ai.analyzeMealPhoto(dataUrl, hint.value);
      items = (res.items || []).map(cleanItem);
      status.remove();
      drawItems();
      if (res.note) out.appendChild(el('div', { class: 'tiny dim', text: res.note }));
    } catch (err) {
      status.remove();
      out.appendChild(el('div', { class: 'tiny', style: { color: 'var(--bad)' }, text: err.message }));
    }
  });

  return [hint, pick, file, out, results, save];
}

/** AI rows arrive as whatever the model wrote; make them numbers. */
const cleanItem = (i) => ({
  label: String(i.label || 'פריט'), amount: String(i.amount || 'מנה'), cat: i.cat || 'dish',
  kcal: round1(Number(i.kcal) || 0), p: round1(Number(i.p) || 0), c: round1(Number(i.c) || 0), f: round1(Number(i.f) || 0),
  ...(Number(i.grams) > 0 ? { grams: Number(i.grams) } : {}),
  src: 'ai'
});

/** Detected or parsed items, each removable, with the total under them. */
function itemRows(items, onRemove) {
  if (!items.length) return [];
  const t = sum(items);
  return [
    el('div', { class: 'food-list' }, items.map((it, i) => el('div', { class: 'food-row' }, [
      el('div', { class: 'food-row-main' }, [
        foodIcon(it.cat),
        el('div', { class: 'grow' }, [
          el('b', { text: it.label }),
          el('small', { text: `${it.amount} · ${macroLine(it)}` })
        ])
      ]),
      el('button', { class: 'food-quick', 'aria-label': `הסר ${it.label}`, onclick: () => onRemove(i) }, [icon(ICONS.close, 16)])
    ]))),
    el('div', { class: 'target-box' }, [
      el('div', { class: 't-lbl', text: 'סה״כ' }),
      el('div', {}, [
        el('div', { class: 't-val num', text: `${Math.round(t.kcal)} קק״ל · ${round1(t.p)} ג׳ חלבון` }),
        el('div', { class: 'tiny dim', text: `פחמימות ${Math.round(t.c)} ג׳ · שומן ${Math.round(t.f)} ג׳` })
      ])
    ])
  ];
}

/* ---------- 4. free text ---------- */

function textSheet(flow) {
  page(flow, 'תיאור חופשי', () => {
    const ta = el('textarea', { rows: '3', placeholder: 'לדוגמה: שתי ביצים, צלחת אורז, 150 גרם חזה עוף וספל קפה הפוך' });
    const preview = el('div', { class: 'stack' });
    let items = [];
    let unmatched = [];
    let aiAvailable = false;
    ai.hasKey().then((k) => { aiAvailable = k; draw(); });

    /* The offline dictionary knows a couple of hundred foods; everything
       else needs the AI pass. Rather than a dead-end "not found", point
       straight at what handles the rest. */
    const draw = () => {
      preview.replaceChildren(...itemRows(items, (i) => { items.splice(i, 1); draw(); }));
      if (unmatched.length) {
        preview.appendChild(el('div', { class: 'tiny', style: { color: 'var(--warn)' } }, aiAvailable
          ? [`לא זוהו: ${unmatched.join(', ')}. `, el('b', { text: '"נתח עם AI"' }), ' יבין גם אותם.']
          : [`לא זוהו: ${unmatched.join(', ')}. אפשר לחפש אותם במאגר או להזין ידנית למטה.`]));
      }
    };

    let mine = [];
    customFoods().then((c) => { mine = c; });
    ta.addEventListener('input', () => {
      const r = parseMeal(ta.value, mine);
      items = r.items;
      unmatched = r.unmatched;
      draw();
    });

    const aiBtn = el('button', { class: 'btn full' }, [icon(ICONS.spark, 18), 'נתח עם AI']);
    aiBtn.addEventListener('click', async () => {
      if (!ta.value.trim()) { toast('כתוב קודם מה אכלת', 'bad'); return; }
      if (!(await ai.hasKey())) { toast('הגדר מפתח API בהגדרות', 'bad'); return; }
      aiBtn.disabled = true;
      aiBtn.replaceChildren(icon(ICONS.spark, 18), 'מנתח…');
      try {
        const out = await ai.analyzeMealText(ta.value);
        items = (out.items || []).map(cleanItem);
        unmatched = [];
        draw();
        if (out.note) toast(out.note);
      } catch (err) {
        toast(err.message, 'bad');
      } finally {
        aiBtn.disabled = false;
        aiBtn.replaceChildren(icon(ICONS.spark, 18), 'נתח עם AI');
      }
    });

    const save = el('button', {
      class: 'btn primary full', text: `הוסף ל${flow.meal.name}`,
      onclick: async () => {
        if (!items.length) { toast('לא זוהה אוכל בטקסט — נסה AI או הזנה ידנית', 'bad'); return; }
        await addItems(flow, items);
        mealSheet(flow.ctx, flow.day, flow.meal, flow);
      }
    });

    /* manual override — when you already know the numbers */
    const num = (ph) => el('input', { type: 'number', inputmode: 'decimal', min: '0', step: 'any', placeholder: ph });
    const nm = el('input', { type: 'text', placeholder: 'שם הארוחה' });
    const kc = num('קלוריות'), pr = num('חלבון (ג׳)'), cb = num('פחמימות (ג׳)'), ft = num('שומן (ג׳)');
    const manual = el('button', {
      class: 'btn full', text: 'הוסף ידנית',
      onclick: async () => {
        const p = Number(pr.value) || 0, c = Number(cb.value) || 0, f = Number(ft.value) || 0;
        const kcal = Number(kc.value) || Math.round(p * 4 + c * 4 + f * 9);
        if (!kcal && !p) { toast('הזן ערכים', 'bad'); return; }
        await addItems(flow, [{ label: nm.value.trim() || 'ארוחה', amount: 'ידני', cat: 'dish', kcal, p, c, f }]);
        mealSheet(flow.ctx, flow.day, flow.meal, flow);
      }
    });

    return [
      ta, preview, save, aiBtn,
      el('div', { class: 'section-title', text: 'או הזנה ידנית' }),
      nm,
      el('div', { class: 'grid-2' }, [kc, pr, cb, ft]),
      manual
    ];
  });
}

/* ---------- editing a logged item ---------- */

async function editItem(ctx, day, index) {
  const it = day.items[index];
  if (!it) return;
  const meal = MEALS.find((m) => m.id === (it.meal || 'other')) || MEALS[0];
  const flow = { ctx, day, meal, added: [] };
  const { food, grams } = foodFromItem(it, resolver(await myFoods()));
  portionSheet(flow, food, {
    grams,
    back: closeSheet,
    onSave: async (item) => {
      day.items[index] = { ...item, meal: it.meal };
      recompute(day);
      await saveDay(day);
      ctx.reload();
    }
  });
}

const sum = (items) => items.reduce((a, i) => ({
  kcal: a.kcal + (i.kcal || 0), p: a.p + (i.p || 0), c: a.c + (i.c || 0), f: a.f + (i.f || 0)
}), { kcal: 0, p: 0, c: 0, f: 0 });

/** Downscale before upload: keeps the request small and fast on mobile data. */
function shrink(file, max) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => { img.src = reader.result; };
    reader.onerror = () => reject(new Error('קריאת הקובץ נכשלה'));
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => reject(new Error('התמונה לא נטענה'));
    reader.readAsDataURL(file);
  });
}

/* ---------- dietitian notes ---------- */

async function notesTile(ctx) {
  const notes = await db.setting('dietNotes', '');
  const todos = await db.setting('dietTodos', []);

  const card = el('div', { class: 'card stack' });

  if (notes) card.appendChild(el('p', { class: 'tiny', style: { margin: 0, whiteSpace: 'pre-wrap' }, text: notes }));
  else card.appendChild(el('p', { class: 'tiny dim', style: { margin: 0 }, text: 'אין דגשים שמורים. אפשר להדביק כאן הנחיות מהתזונאית.' }));

  todos.forEach((t, i) => {
    card.appendChild(el('button', {
      class: 'row',
      style: { gap: '10px', width: '100%', padding: '6px 0', textAlign: 'start' },
      onclick: async () => {
        todos[i].done = !todos[i].done;
        await db.setSetting('dietTodos', todos);
        ctx.reload();
      }
    }, [
      el('span', {
        style: {
          width: '20px', height: '20px', borderRadius: '6px', flex: 'none',
          border: '1px solid var(--line)', display: 'grid', placeItems: 'center',
          background: t.done ? 'var(--ok)' : 'transparent', color: '#04220f', fontSize: '12px'
        },
        text: t.done ? '✓' : ''
      }),
      el('span', {
        class: 'grow tiny',
        style: { textDecoration: t.done ? 'line-through' : 'none', color: t.done ? 'var(--text-3)' : 'var(--text)' },
        text: t.text
      })
    ]));
  });

  card.appendChild(el('button', {
    class: 'btn sm full ghost', text: 'ערוך דגשים ומשימות',
    onclick: () => openSheet('דגשים מהמאמן / תזונאית', (close) => {
      const b = el('div', { class: 'stack' });
      const ta = el('textarea', { rows: '5', placeholder: 'הנחיות כלליות…' });
      ta.value = notes;
      const list = el('textarea', { rows: '4', placeholder: 'משימה בכל שורה…' });
      list.value = todos.map((t) => t.text).join('\n');
      b.appendChild(el('label', { class: 'field-label', text: 'הנחיות' }));
      b.appendChild(ta);
      b.appendChild(el('label', { class: 'field-label', text: 'משימות יומיות (שורה לכל משימה)' }));
      b.appendChild(list);
      b.appendChild(el('button', {
        class: 'btn primary full', text: 'שמור',
        onclick: async () => {
          await db.setSetting('dietNotes', ta.value.trim());
          const lines = list.value.split('\n').map((x) => x.trim()).filter(Boolean);
          const prev = new Map(todos.map((t) => [t.text, t.done]));
          await db.setSetting('dietTodos', lines.map((text) => ({ text, done: prev.get(text) || false })));
          close();
          ctx.reload();
        }
      }));
      return b;
    })
  }));

  return card;
}
