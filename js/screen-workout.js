/* ==========================================================================
   screen-workout.js — Focus Mode: one exercise on screen at a time.
   Everything the lifter needs between sets lives on this card: last session,
   today's target, the set grid, plate maths, warm-up ramp, swap and notes.
   ========================================================================== */

import * as db from './db.js';
import {
  el, icon, ICONS, toast, buzz, openSheet, closeSheet,
  confirmSheet, celebratePR, emptyState
} from './ui.js';
import * as timer from './timer.js';
import { getExercise, substitutes, sameMuscle, CATEGORIES, ytUrl, search } from './exercises.js';
import { repRange, restFor, GOALS } from './programs.js';
import {
  platesFor, warmupSets, PLATE_COLORS, oneRM, fmtW, fmtDuration,
  stepFor, roundToStep, round2
} from './logic.js';
import {
  getActive, saveWorkout, finishWorkout, abandonWorkout,
  setsOf, logSet, unlogSet, lastSessionSets, personalBest,
  getNote, setNote
} from './session.js';
import { demo, thumb, exerciseDetail, hasImages } from './media.js';

/** In-memory view state for the session; rebuilt on every mount. */
let W = null;          // workout record
let LOGS = new Map();  // `${exercise_id}|${set_order}` → log row
let CTX = null;
let PANE = null;       // the exercise card container
let DOTS = null;       // the progress-dot strip
let DEMO = null;       // running image loop, stopped on every repaint

/** Called by the router when this screen is replaced. */
export function cleanup() {
  DEMO?.stop();
  DEMO = null;
}

export async function render(ctx) {
  CTX = ctx;
  cleanup();
  W = await getActive();
  if (!W) {
    ctx.setTitle('אימון');
    return emptyState('אין אימון פעיל', 'חזור למסך "היום" כדי להתחיל אימון');
  }

  await loadLogs();

  ctx.setTitle(W.name, `${W.slots.filter((s) => s.done).length}/${W.slots.length} תרגילים`);
  ctx.setActions([
    el('button', { class: 'btn sm', text: 'סיים', onclick: () => finishFlow(ctx) })
  ]);

  DOTS = el('div', { class: 'progress-dots' });
  PANE = el('div', { id: 'exPane' });

  const root = el('div', { class: 'focus' });
  root.appendChild(DOTS);
  root.appendChild(PANE);
  root.appendChild(el('div', { class: 'divider' }));
  root.appendChild(el('button', {
    class: 'btn full',
    text: 'סיום ושמירת האימון',
    onclick: () => finishFlow(ctx)
  }));
  root.appendChild(el('button', {
    class: 'btn full ghost danger',
    style: { marginTop: '4px' },
    text: 'בטל אימון',
    onclick: async () => {
      if (await confirmSheet('לבטל את האימון?', 'כל הסטים שנרשמו יימחקו.', 'בטל אימון')) {
        await abandonWorkout(W);
        ctx.go('home');
      }
    }
  }));

  paintExercise();
  return root;
}

/* ---------- data ---------- */

async function loadLogs() {
  const rows = await setsOf(W.id);
  LOGS = new Map(rows.map((r) => [`${r.exercise_id}|${r.set_order}`, r]));
}

const slot = () => W.slots[W.cursor];
const logKey = (exId, order) => `${exId}|${order}`;
const getLog = (exId, order) => LOGS.get(logKey(exId, order)) || null;

/* ---------- chrome ---------- */

function paintDots() {
  if (!DOTS) return;
  DOTS.innerHTML = '';
  W.slots.forEach((s, i) => {
    DOTS.appendChild(el('i', { class: s.done ? 'done' : (i === W.cursor ? 'on' : '') }));
  });
}

/* ---------- the exercise pane ---------- */

function paintExercise() {
  const pane = PANE;
  if (!pane) return;
  DEMO?.stop();
  DEMO = null;
  pane.innerHTML = '';

  const s = slot();
  const ex = getExercise(s.ex);
  const range = repRange(CTX.settings.goal, ex);

  /* nav */
  pane.appendChild(el('div', { class: 'focus-nav' }, [
    el('button', {
      'aria-label': 'התרגיל הקודם',
      disabled: W.cursor === 0,
      onclick: () => move(-1)
    }, [icon(ICONS.chevronBack, 20)]),
    el('div', { class: 'name' }, [
      el('b', { text: ex.name }),
      el('small', { text: `${CATEGORIES[ex.cat]} · ${s.sets} סטים · ${range.min}–${range.max} חזרות` })
    ]),
    el('button', {
      'aria-label': 'התרגיל הבא',
      disabled: W.cursor >= W.slots.length - 1,
      onclick: () => move(1)
    }, [icon(ICONS.chevron, 20)])
  ]));

  /* movement demo */
  if (hasImages(s.ex)) {
    DEMO = demo(s.ex);
    if (DEMO.node) {
      DEMO.node.addEventListener('dblclick', () => detailSheet(ex));
      pane.appendChild(DEMO.node);
    }
  }

  /* previous session */
  const hint = el('div', { class: 'prev-hint' }, [
    icon(ICONS.info, 15),
    el('span', { text: 'טוען ביצוע קודם…' })
  ]);
  pane.appendChild(hint);
  fillPrevHint(s.ex, hint);

  /* today's target */
  pane.appendChild(el('div', { class: 'target-box' }, [
    el('div', {}, [
      el('div', { class: 't-lbl', text: 'יעד להיום' }),
      el('div', {
        class: 't-val num',
        text: s.seconds
          ? `${s.seconds} שניות`
          : s.targetWeight
            ? `${fmtW(s.targetWeight)} × ${s.targetReps}`
            : `${s.targetReps || range.min} חזרות`
      })
    ]),
    el('div', { style: { textAlign: 'end', maxWidth: '52%' } }, [
      el('span', {
        class: `badge ${s.action === 'increase' ? 'ok' : s.action === 'deload' ? '' : 'accent'}`,
        text: s.action === 'increase' ? 'עלייה' : s.action === 'deload' ? 'הורדה' : s.action === 'start' ? 'חדש' : 'שמירה'
      }),
      el('div', { class: 'tiny dim', style: { marginTop: '4px' }, text: s.note || '' })
    ])
  ]));

  /* tools */
  const tools = el('div', { class: 'tool-row' });
  if (ex.bar) tools.appendChild(chip(ICONS.plate, 'פלטות', () => platesSheet(s, ex)));
  tools.appendChild(chip(ICONS.flame, s.warmups?.length ? 'חימום ✓' : 'חימום', () => toggleWarmup(s, ex)));
  tools.appendChild(chip(ICONS.swap, 'החלף תרגיל', () => swapSheet(s, ex)));
  tools.appendChild(chip(ICONS.note, 'הערת כיוונון', () => noteSheet(ex)));
  tools.appendChild(chip(ICONS.timer, 'מנוחה', () => restSheet(s, ex)));
  tools.appendChild(el('button', { class: 'chip', text: '🫀 שרירים', onclick: () => detailSheet(ex) }));
  tools.appendChild(el('a', {
    class: 'chip', href: ytUrl(ex), target: '_blank', rel: 'noopener', text: '▶ וידאו'
  }));
  pane.appendChild(tools);

  if (ex.cue) {
    pane.appendChild(el('div', { class: 'tiny dim', style: { padding: '0 4px' }, text: `💡 ${ex.cue}` }));
  }

  /* sets */
  pane.appendChild(setList(s, ex));

  /* add / remove set */
  pane.appendChild(el('div', { class: 'row', style: { gap: '8px' } }, [
    el('button', {
      class: 'btn sm grow', text: '+ סט נוסף',
      onclick: async () => { s.sets += 1; await saveWorkout(W); paintExercise(); }
    }),
    el('button', {
      class: 'btn sm ghost', text: '− סט',
      onclick: async () => {
        if (s.sets <= 1) return;
        const last = getLog(s.ex, s.sets);
        if (last) { await unlogSet(last.id); LOGS.delete(logKey(s.ex, s.sets)); }
        s.sets -= 1;
        await saveWorkout(W);
        paintExercise();
      }
    })
  ]));

  paintDots();
}

const chip = (iconPath, label, onclick) =>
  el('button', { class: 'chip', onclick }, [icon(iconPath, 15), label]);

async function fillPrevHint(exId, box) {
  const prev = await lastSessionSets(exId, W.id);
  if (!box) return;
  box.innerHTML = '';
  box.appendChild(icon(ICONS.info, 15));
  if (!prev.length) {
    box.appendChild(el('span', { text: 'אין ביצוע קודם לתרגיל הזה' }));
    return;
  }
  const when = new Date(prev[0].timestamp).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
  box.appendChild(el('span', { text: `פעם קודמת (${when}):` }));
  prev.forEach((p) => {
    box.appendChild(el('b', { class: 'num', text: `${round2(p.weight_kg)}×${p.reps}` }));
  });
}

/* ---------- set grid ---------- */

function setList(s, ex) {
  const list = el('div', { class: 'setlist' });

  (s.warmups || []).forEach((w, i) => {
    list.appendChild(setRow(s, ex, -(i + 1), w.weight, w.reps, true, w.label));
  });

  for (let i = 1; i <= s.sets; i++) {
    list.appendChild(setRow(s, ex, i, s.targetWeight, s.seconds || s.targetReps, false));
  }
  return list;
}

function setRow(s, ex, order, defWeight, defReps, isWarmup, label) {
  const timed = !isWarmup && !!s.seconds;
  const log = getLog(s.ex, order);
  const done = !!log;
  const active = !done && !isWarmup && firstOpenOrder(s) === order;

  const wInput = el('input', {
    type: 'number', inputmode: 'decimal', step: '0.5', min: '0',
    value: log ? round2(log.weight_kg) : (defWeight || ''),
    placeholder: '0'
  });
  const rInput = el('input', {
    type: 'number', inputmode: 'numeric', step: '1', min: '0',
    value: log ? log.reps : (defReps || ''),
    placeholder: '0'
  });

  const rirSel = el('select', {},
    [el('option', { value: '', text: 'RIR' })].concat(
      [0, 1, 2, 3, 4, 5].map((n) => el('option', { value: String(n), text: String(n) }))
    ));
  if (log?.rir != null) rirSel.value = String(log.rir);

  const row = el('div', { class: `set${done ? ' done' : ''}${active ? ' active' : ''}${isWarmup ? ' warmup' : ''}` }, [
    el('div', { class: 'set-idx', text: isWarmup ? (label || 'W') : String(order) }),
    el('div', { class: 'set-field' }, [el('label', { text: 'ק״ג' }), wInput]),
    el('div', { class: 'set-field' }, [el('label', { text: timed ? 'שניות' : 'חזרות' }), rInput]),
    el('div', { class: 'set-rir' }, [isWarmup ? el('div') : rirSel]),
    el('button', {
      class: 'set-go',
      'aria-label': done ? 'בטל סט' : 'סיים סט',
      onclick: () => toggleSet(s, ex, order, { wInput, rInput, rirSel, isWarmup, log })
    }, [icon(ICONS.check, 20)])
  ]);

  return row;
}

/** Weight typed into the first working set row, if any. */
function firstTypedWeight() {
  if (!PANE) return 0;
  const row = PANE.querySelector('.set:not(.warmup)');
  const input = row?.querySelector('.set-field input');
  return Number(input?.value) || 0;
}

function firstOpenOrder(s) {
  for (let i = 1; i <= s.sets; i++) if (!getLog(s.ex, i)) return i;
  return null;
}

async function toggleSet(s, ex, order, refs) {
  const existing = getLog(s.ex, order);

  if (existing) {
    await unlogSet(existing.id);
    LOGS.delete(logKey(s.ex, order));
    s.done = false;
    await saveWorkout(W);
    paintExercise();
    return;
  }

  const weight = Number(refs.wInput.value) || 0;
  const reps = Number(refs.rInput.value) || 0;
  if (reps <= 0) { toast('הזן מספר חזרות', 'bad'); refs.rInput.focus(); return; }

  const pbBefore = refs.isWarmup ? null : await personalBest(s.ex, W.id);

  const row = await logSet({
    workout_id: W.id,
    exercise_id: s.ex,
    set_order: order,
    weight_kg: weight,
    reps,
    rir: refs.isWarmup ? null : refs.rirSel.value,
    is_warmup: refs.isWarmup
  });
  LOGS.set(logKey(s.ex, order), row);
  buzz(14);

  /* PR check on working sets only */
  if (!refs.isWarmup && pbBefore && weight > 0) {
    const e1 = oneRM(weight, reps);
    if (pbBefore.e1rm > 0 && e1 > pbBefore.e1rm + 0.01) {
      celebratePR(`שיא! ${round2(e1)} ק״ג 1RM`);
    }
  }

  /* mark the exercise finished when every working set is in */
  const allDone = Array.from({ length: s.sets }, (_, i) => getLog(s.ex, i + 1)).every(Boolean);
  s.done = allDone;
  await saveWorkout(W);

  /* rest timer */
  if (CTX.settings.autoTimer !== false) {
    const rest = refs.isWarmup ? 45 : (s.rest || restFor(CTX.settings.goal, ex));
    timer.start(rest, `מנוחה · ${ex.name}`);
  }

  paintExercise();
  CTX.setTitle(W.name, `${W.slots.filter((x) => x.done).length}/${W.slots.length} תרגילים`);

  if (allDone && W.cursor < W.slots.length - 1) {
    toast('תרגיל הושלם — עובר לתרגיל הבא', 'ok');
    setTimeout(() => move(1), 700);
  }
}

async function move(delta) {
  const next = Math.min(W.slots.length - 1, Math.max(0, W.cursor + delta));
  if (next === W.cursor) return;
  W.cursor = next;
  await saveWorkout(W);
  paintExercise();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- sheets ---------- */

function platesSheet(s, ex) {
  openSheet('מחשבון פלטות', () => {
    const box = el('div', { class: 'stack' });
    const input = el('input', {
      type: 'number', inputmode: 'decimal', step: '0.5',
      value: s.targetWeight || CTX.settings.barWeight
    });
    const out = el('div');

    const draw = () => {
      const target = Number(input.value) || 0;
      const res = platesFor(target, CTX.settings);
      out.innerHTML = '';

      const vis = el('div', { class: 'bar-vis' });
      const side = [...res.perSide].reverse();
      const stack = (arr) => arr.flatMap((p) => Array.from({ length: p.count }, () => p.plate));
      stack(side).forEach((p) => vis.appendChild(plateEl(p)));
      vis.appendChild(el('div', { class: 'bar-rod' }));
      stack([...res.perSide]).forEach((p) => vis.appendChild(plateEl(p)));
      out.appendChild(vis);

      out.appendChild(el('div', {
        class: 'row between',
        style: { marginTop: '12px' }
      }, [
        el('span', { class: 'muted tiny', text: `מוט ${CTX.settings.barWeight} ק״ג` }),
        el('b', { class: 'num', text: `סה״כ ${fmtW(res.achieved)}` })
      ]));

      if (res.leftover > 0.01) {
        out.appendChild(el('div', {
          class: 'tiny', style: { color: 'var(--warn)', marginTop: '6px' },
          text: `לא ניתן להרכיב במדויק — חסרים ${res.leftover} ק״ג`
        }));
      }

      const list = el('div', { class: 'plate-list' });
      res.perSide.forEach((p) => list.appendChild(el('div', { class: 'plate-item' }, [
        el('div', { class: 'row' }, [
          el('i', { class: 'plate-swatch', style: { background: PLATE_COLORS[p.plate] || '#888' } }),
          el('span', { text: `${p.plate} ק״ג` })
        ]),
        el('b', { text: `× ${p.count} לכל צד` })
      ])));
      if (!res.perSide.length) list.appendChild(el('div', { class: 'tiny dim', text: 'מוט ריק בלבד' }));
      out.appendChild(list);
    };

    input.addEventListener('input', draw);
    box.appendChild(el('label', { class: 'field-label', text: 'משקל יעד (כולל מוט)' }));
    box.appendChild(input);
    box.appendChild(out);
    draw();
    return box;
  });
}

const plateEl = (p) => el('div', {
  class: 'plate',
  style: {
    background: PLATE_COLORS[p] || '#888',
    height: `${Math.min(92, 34 + p * 2.2)}px`
  },
  text: String(p)
});

async function toggleWarmup(s, ex) {
  if (s.warmups?.length) {
    for (let i = 1; i <= s.warmups.length; i++) {
      const log = getLog(s.ex, -i);
      if (log) { await unlogSet(log.id); LOGS.delete(logKey(s.ex, -i)); }
    }
    s.warmups = [];
    await saveWorkout(W);
    paintExercise();
    return;
  }
  /* On a first session there is no target yet — take what the lifter typed. */
  let base = s.targetWeight;
  if (!base) {
    base = firstTypedWeight();
    if (base > 0) s.targetWeight = base;
  }
  if (!base) { toast('הזן קודם את משקל העבודה בסט הראשון', 'bad'); return; }

  const sets = warmupSets(base, ex, CTX.settings);
  if (!sets.length) { toast('המשקל נמוך מדי לחימום מדורג'); return; }
  s.warmups = sets;
  await saveWorkout(W);
  toast(`${sets.length} סטי חימום נוספו`, 'ok');
  paintExercise();
}

function swapSheet(s, ex) {
  openSheet('החלפת תרגיל', (close) => {
    const box = el('div', { class: 'stack' });
    const pick = async (id) => {
      const target = getExercise(id);
      const prev = await lastSessionSets(id, W.id);
      s.ex = id;
      s.rest = restFor(CTX.settings.goal, target);
      s.warmups = [];
      if (prev.length) {
        const top = Math.max(...prev.map((p) => p.weight_kg));
        s.targetWeight = top;
        s.note = 'לפי הביצוע הקודם בתרגיל החלופי';
      } else {
        s.targetWeight = 0;
        s.note = 'תרגיל חלופי — קבע משקל נוח';
      }
      s.action = 'hold';
      await saveWorkout(W);
      await loadLogs();
      close();
      toast(`הוחלף ל${target.name}`, 'ok');
      paintExercise();
    };

    const subs = substitutes(s.ex);
    box.appendChild(el('p', { class: 'tiny dim', style: { margin: 0 }, text: 'דפוס תנועה זהה — נפח מקביל:' }));
    (subs.length ? subs : sameMuscle(s.ex)).slice(0, 8).forEach((o) => {
      box.appendChild(el('button', { class: 'opt', onclick: () => pick(o.id) }, [
        thumb(o.id, o.name),
        el('div', { class: 'grow' }, [
          el('b', { text: o.name }),
          el('small', { text: CATEGORIES[o.cat] })
        ])
      ]));
    });

    box.appendChild(el('div', { class: 'section-title', text: 'חיפוש חופשי' }));
    const q = el('input', { type: 'search', placeholder: 'שם תרגיל…' });
    const results = el('div');
    q.addEventListener('input', () => {
      results.innerHTML = '';
      if (q.value.trim().length < 2) return;
      search(q.value).slice(0, 10).forEach((o) => {
        results.appendChild(el('button', { class: 'opt', onclick: () => pick(o.id) }, [
          el('div', { class: 'grow' }, [
            el('b', { text: o.name }),
            el('small', { text: CATEGORIES[o.cat] })
          ])
        ]));
      });
    });
    box.appendChild(q);
    box.appendChild(results);
    return box;
  });
}

function detailSheet(ex) {
  openSheet(ex.name, () => exerciseDetail(ex.id));
}

function noteSheet(ex) {
  openSheet(`הערת כיוונון · ${ex.name}`, (close) => {
    const box = el('div', { class: 'stack' });
    const ta = el('textarea', { rows: '4', placeholder: 'לדוגמה: כיסא על חור 4, אחיזה רחבה' });
    getNote(ex.id).then((t) => { ta.value = t; });
    box.appendChild(ta);
    box.appendChild(el('button', {
      class: 'btn primary full', text: 'שמור',
      onclick: async () => { await setNote(ex.id, ta.value.trim()); close(); toast('ההערה נשמרה', 'ok'); }
    }));
    return box;
  });
}

function restSheet(s, ex) {
  openSheet('זמן מנוחה', (close) => {
    const box = el('div', { class: 'stack' });
    [60, 90, 120, 180, 240].forEach((sec) => {
      box.appendChild(el('button', {
        class: `opt${s.rest === sec ? ' on' : ''}`,
        onclick: async () => {
          s.rest = sec;
          await saveWorkout(W);
          close();
          timer.start(sec, `מנוחה · ${ex.name}`);
        }
      }, [
        el('div', { class: 'grow' }, [
          el('b', { text: `${sec >= 60 ? `${sec / 60} דקות` : `${sec} שניות`}` }),
          el('small', { text: sec >= 180 ? 'תרגילים מורכבים / כוח' : sec >= 120 ? 'מורכב בינוני' : 'תרגילי בידוד' })
        ])
      ]));
    });
    return box;
  });
}

/* ---------- finish ---------- */

async function finishFlow(ctx) {
  const logs = await setsOf(W.id);
  const working = logs.filter((l) => !l.is_warmup);
  if (!working.length) {
    toast('לא נרשם אף סט', 'bad');
    return;
  }
  const vol = working.reduce((s, l) => s + l.weight_kg * l.reps, 0);
  const mins = Math.round((Date.now() - W.started_at) / 60000);

  const ok = await confirmSheet(
    'לסיים את האימון?',
    `${working.length} סטים · ${Math.round(vol)} ק״ג נפח · ${mins} דקות`,
    'סיים ושמור',
    false
  );
  if (!ok) return;

  await finishWorkout(W);
  await db.setSetting('lastFinishedWorkout', W.id);
  timer.stop();
  celebratePR('אימון הושלם 💪');

  /* fire-and-forget: never make the user wait on the network to finish a set */
  import('./gdrive.js').then((g) => g.autoSync()).catch(() => {});

  setTimeout(() => ctx.go('summary'), 700);
}
