/* ==========================================================================
   screen-nutrition.js — daily calories, protein and water.
   Text entry works offline through food.js; the photo path and the smarter
   text path are added only when an API key exists.
   ========================================================================== */

import * as db from './db.js';
import { el, icon, ICONS, toast, openSheet, confirmSheet, emptyState, buzz } from './ui.js';
import { parseMeal } from './food.js';
import * as ai from './ai.js';
import { goalList } from './programs.js';
import { proteinTarget, todayISO, round2 } from './logic.js';
import { recentWorkouts } from './session.js';

export async function render(ctx) {
  const s = ctx.settings;
  const date = todayISO();
  ctx.setTitle('תזונה', new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }));

  const day = await loadDay(date);
  const trainedToday = (await recentWorkouts(10)).some((w) => w.date === date);
  const pTarget = proteinTarget(s.bodyweight, trainedToday, goalList(s));
  const kcalTarget = s.calorieTarget || estimateCalories(s, trainedToday);

  const wrap = el('div', { class: 'stack' });

  /* ---- rings ---- */
  wrap.appendChild(el('div', { class: 'card stack' }, [
    el('div', { class: 'card-head' }, [
      el('h3', { text: trainedToday ? 'יום אימון' : 'יום מנוחה' }),
      el('span', { class: 'badge accent', text: `${day.items.length} רישומים` })
    ]),
    meter('חלבון', day.protein_grams, pTarget, 'גרם', 'var(--accent)'),
    meter('קלוריות', day.calories_consumed, kcalTarget, 'קק״ל', 'var(--ok)')
  ]));

  /* ---- water, counted the way people drink it ---- */
  wrap.appendChild(waterCard(ctx, day, s));

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

const saveDay = (day) => db.put('nutrition_logs', day);

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
    return el('div', { class: 'meal-item' }, [
      el('div', { class: 'grow' }, [
        el('b', { text: it.label }),
        el('small', { text: `${it.amount || ''} · ${Math.round(it.kcal)} קק״ל · ${round2(it.p)} ג׳ חלבון` })
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

  if (goals.includes('cut') && kcalLeft < 0) {
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

  if (goals.includes('abs') || goals.includes('cut')) {
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

  const left = Math.max(0, targetGlasses - full);

  return el('div', { class: 'card stack' }, [
    el('div', { class: 'card-head' }, [
      el('h3', { text: 'מים' }),
      el('span', {
        class: `badge ${left ? '' : 'ok'}`,
        text: left ? `עוד ${left} כוסות` : 'הושלם'
      })
    ]),
    glasses,
    el('div', { class: 'row', style: { gap: '8px' } }, [
      el('button', { class: 'btn sm grow', onclick: () => add(GLASS_ML) }, [icon(ICONS.glass, 15), 'כוס']),
      el('button', { class: 'btn sm grow', onclick: () => add(BOTTLE_ML) }, [icon(ICONS.bottle, 15), 'בקבוק']),
      full ? el('button', { class: 'btn sm ghost', text: 'בטל', onclick: () => add(-GLASS_ML) }) : null
    ]),
    el('div', { class: 'tiny dim', text: `${full} מתוך ${targetGlasses} כוסות · כוס = ${GLASS_ML} מ״ל` })
  ]);
}

function meter(label, value, target, unit, color) {
  const pct = Math.min(100, target > 0 ? (value / target) * 100 : 0);
  return el('div', {}, [
    el('div', { class: 'row between', style: { marginBottom: '5px' } }, [
      el('span', { class: 'tiny muted', text: label }),
      el('b', { class: 'num tiny', text: `${Math.round(value)} / ${Math.round(target)} ${unit}` })
    ]),
    el('div', { style: { height: '8px', borderRadius: '8px', background: 'var(--surface-3)', overflow: 'hidden' } }, [
      el('i', { style: { display: 'block', height: '100%', width: `${pct}%`, background: color, borderRadius: '8px', transition: 'width .3s' } })
    ])
  ]);
}

function estimateCalories(s, trainedToday) {
  // Mifflin-St Jeor with a moderate activity factor; adjusted by goal.
  const bmr = 10 * s.bodyweight + 6.25 * (s.height || 175) - 5 * (s.age || 30) + 5;
  const tdee = bmr * (trainedToday ? 1.55 : 1.35);
  /* A deficit wins over a surplus when both are selected — you cannot eat
     above and below maintenance at the same time. */
  const goals = goalList(s);
  const adj = goals.includes('cut') ? -0.18 : goals.includes('hypertrophy') ? 0.1 : 0;
  return Math.round(tdee * (1 + adj));
}

/* ---------- meal entry ---------- */

function mealSheet(ctx, day, meal = { id: currentMeal(), name: 'ארוחה' }) {
  openSheet(`הוסף ל${meal.name}`, (close) => {
    const box = el('div', { class: 'stack' });

    ai.hasKey().then((keyed) => {
      if (!keyed) return;
      box.insertBefore(el('button', {
        class: 'btn full',
        onclick: () => { close(); photoSheet(ctx, day, meal); }
      }, [icon(ICONS.camera, 18), 'צלם את הצלחת במקום']), box.firstChild);
    });
    const ta = el('textarea', { rows: '3', placeholder: 'לדוגמה: שתי ביצים, 150 גרם חזה עוף וכוס אורז' });
    const preview = el('div', { class: 'stack' });

    let parsed = { items: [], total: { kcal: 0, p: 0, c: 0, f: 0 }, unmatched: [] };

    const draw = () => {
      preview.innerHTML = '';
      if (!parsed.items.length) return;
      parsed.items.forEach((i) => preview.appendChild(el('div', { class: 'ex-row' }, [
        el('div', { class: 'grow' }, [
          el('div', { class: 'ex-name', text: i.label }),
          el('div', { class: 'ex-meta', text: `${i.amount} · ${Math.round(i.kcal)} קק״ל · ${i.p} ג׳ חלבון` })
        ])
      ])));
      preview.appendChild(el('div', { class: 'target-box' }, [
        el('div', { class: 't-lbl', text: 'סה״כ' }),
        el('div', { class: 't-val num', text: `${Math.round(parsed.total.kcal)} קק״ל · ${parsed.total.p} ג׳` })
      ]));
      if (parsed.unmatched?.length) {
        preview.appendChild(el('div', { class: 'tiny', style: { color: 'var(--warn)' }, text: `לא זוהו: ${parsed.unmatched.join(', ')}` }));
      }
    };

    ta.addEventListener('input', () => { parsed = parseMeal(ta.value); draw(); });

    const save = async () => {
      if (!parsed.items.length) { toast('לא זוהה אוכל בטקסט', 'bad'); return; }
      day.items.push(...parsed.items.map((i) => ({ ...i, meal: meal.id })));
      recompute(day);
      await saveDay(day);
      close();
      toast('נרשם', 'ok');
      ctx.reload();
    };

    box.appendChild(ta);
    box.appendChild(preview);
    box.appendChild(el('button', { class: 'btn primary full', text: 'הוסף ליום', onclick: save }));
    box.appendChild(el('button', {
      class: 'btn full',
      text: 'דיוק בעזרת AI',
      onclick: async (e) => {
        if (!(await ai.hasKey())) { toast('הגדר מפתח API בהגדרות', 'bad'); return; }
        const btn = e.currentTarget;
        btn.disabled = true; btn.textContent = 'מנתח…';
        try {
          const out = await ai.analyzeMealText(ta.value);
          parsed = { items: out.items || [], total: sum(out.items || []), unmatched: [] };
          draw();
          if (out.note) toast(out.note);
        } catch (err) {
          toast(err.message, 'bad');
        } finally {
          btn.disabled = false; btn.textContent = 'דיוק בעזרת AI';
        }
      }
    }));

    /* manual override */
    box.appendChild(el('div', { class: 'section-title', text: 'או הזנה ידנית' }));
    const kc = el('input', { type: 'number', inputmode: 'numeric', placeholder: 'קלוריות' });
    const pr = el('input', { type: 'number', inputmode: 'decimal', placeholder: 'חלבון (גרם)' });
    const nm = el('input', { type: 'text', placeholder: 'שם הארוחה' });
    box.appendChild(el('div', { class: 'row', style: { gap: '8px' } }, [nm]));
    box.appendChild(el('div', { class: 'row', style: { gap: '8px' } }, [kc, pr]));
    box.appendChild(el('button', {
      class: 'btn full', text: 'הוסף ידנית',
      onclick: async () => {
        const kcal = Number(kc.value) || 0;
        const p = Number(pr.value) || 0;
        if (!kcal && !p) { toast('הזן ערכים', 'bad'); return; }
        day.items.push({ label: nm.value.trim() || 'ארוחה', amount: 'ידני', kcal, p, c: 0, f: 0, meal: meal.id });
        recompute(day);
        await saveDay(day);
        close();
        ctx.reload();
      }
    }));

    return box;
  });
}

const sum = (items) => items.reduce((a, i) => ({
  kcal: a.kcal + (i.kcal || 0), p: a.p + (i.p || 0), c: a.c + (i.c || 0), f: a.f + (i.f || 0)
}), { kcal: 0, p: 0, c: 0, f: 0 });

/* ---------- photo analysis ---------- */

function photoSheet(ctx, day, meal = { id: currentMeal(), name: 'ארוחה' }) {
  openSheet('ניתוח צלחת', (close) => {
    const box = el('div', { class: 'stack' });
    const file = el('input', { type: 'file', accept: 'image/*', capture: 'environment' });
    const hint = el('input', { type: 'text', placeholder: 'רמז אופציונלי (למשל: זו צלחת גדולה)' });
    const out = el('div', { class: 'stack' });
    let items = [];

    file.addEventListener('change', async () => {
      const f = file.files?.[0];
      if (!f) return;
      out.innerHTML = '';
      out.appendChild(el('div', { class: 'tiny dim', text: 'מנתח את התמונה…' }));
      try {
        const dataUrl = await shrink(f, 1024);
        out.innerHTML = '';
        out.appendChild(el('img', { src: dataUrl, style: { width: '100%', borderRadius: '14px' } }));
        const res = await ai.analyzeMealPhoto(dataUrl, hint.value);
        items = res.items || [];
        items.forEach((i) => out.appendChild(el('div', { class: 'ex-row' }, [
          el('div', { class: 'grow' }, [
            el('div', { class: 'ex-name', text: i.label }),
            el('div', { class: 'ex-meta', text: `${i.amount || ''} · ${Math.round(i.kcal)} קק״ל · ${i.p} ג׳ חלבון` })
          ])
        ])));
        const t = sum(items);
        out.appendChild(el('div', { class: 'target-box' }, [
          el('div', { class: 't-lbl', text: 'סה״כ' }),
          el('div', { class: 't-val num', text: `${Math.round(t.kcal)} קק״ל · ${Math.round(t.p)} ג׳` })
        ]));
        if (res.note) out.appendChild(el('div', { class: 'tiny dim', text: res.note }));
      } catch (err) {
        out.innerHTML = '';
        out.appendChild(el('div', { class: 'tiny', style: { color: 'var(--bad)' }, text: err.message }));
      }
    });

    box.appendChild(hint);
    box.appendChild(file);
    box.appendChild(out);
    box.appendChild(el('button', {
      class: 'btn primary full', text: 'הוסף ליום',
      onclick: async () => {
        if (!items.length) { toast('אין תוצאות לשמירה', 'bad'); return; }
        day.items.push(...items.map((i) => ({ ...i, meal: meal.id })));
        recompute(day);
        await saveDay(day);
        close();
        ctx.reload();
      }
    }));
    return box;
  });
}

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
