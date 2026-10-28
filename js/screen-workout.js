/* ==========================================================================
   screen-workout.js — Focus Mode: one exercise on screen at a time.
   Everything the lifter needs between sets lives on this card: last session,
   today's target, the set grid, plate maths, warm-up ramp, swap and notes.
   ========================================================================== */

import * as db from './db.js';
import {
  el, icon, ICONS, toast, buzz, openSheet, closeSheet,
  confirmSheet, celebratePR, emptyState, numberField
} from './ui.js';
import * as timer from './timer.js';
import { getExercise, substitutes, sameMuscle, CATEGORIES, search } from './exercises.js';
import { repRange, restFor, restAfterSet, restLabel, REST_MIN, REST_MAX, GOALS, goalList } from './programs.js';
import {
  platesFor, warmupSets, PLATE_COLORS, oneRM, fmtW, fmtDuration,
  stepFor, roundToStep, round2, todayISO
} from './logic.js';
import {
  getActive, saveWorkout, finishWorkout, abandonWorkout,
  setsOf, logSet, unlogSet, lastSessionSets, personalBest,
  getNote, setNote, addFreeSlot
} from './session.js';
import { demo, thumb, exerciseDetail, hasImages } from './media.js';
import { dayWater } from './food.js';

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
  flushDrafts();
}

/* ---------- typed but not yet ticked ----------
   A weight or a rep count is worth keeping the moment it is typed, not only
   when the set is ticked: leaving for the home screen, switching to the
   swipe view, or the phone killing the tab must all come back to the same
   numbers. Drafts live on the workout record itself, saved a beat after the
   last keystroke and immediately when the screen is left. */
let draftTimer = null;
const getDraft = (exId, order) => W?.drafts?.[logKey(exId, order)] || null;

function setDraft(exId, order, w, r) {
  if (!W) return;
  W.drafts = { ...(W.drafts || {}), [logKey(exId, order)]: { w, r } };
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => { draftTimer = null; saveWorkout(W); }, 250);
}

function clearDraft(exId, order) {
  if (W?.drafts?.[logKey(exId, order)]) delete W.drafts[logKey(exId, order)];
}

function flushDrafts() {
  if (!draftTimer) return;
  clearTimeout(draftTimer);
  draftTimer = null;
  if (W) saveWorkout(W);
}
window.addEventListener('pagehide', flushDrafts);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushDrafts(); });

/**
 * What an open set row starts with: what was typed into it; else the last
 * numbers set on an earlier set of this exercise — ticked or just typed —
 * so raising the reps on set 2 raises them for 3 and 4 as well; else
 * today's target.
 */
function rowDefaults(s, order, defWeight, defReps, isWarmup) {
  const d = getDraft(s.ex, order);
  if (d) return { w: d.w, r: d.r };
  if (!isWarmup) {
    for (let k = order - 1; k >= 1; k--) {
      const prev = getLog(s.ex, k);
      if (prev) return { w: prev.weight_kg ? round2(prev.weight_kg) : '', r: prev.reps || defReps || '' };
      const typed = getDraft(s.ex, k);
      if (typed) return { w: typed.w, r: typed.r };
    }
  }
  return { w: defWeight || '', r: defReps || '' };
}

/** Bodyweight: 0 (or empty) in the weight column is the body itself. */
const isBodyweight = (ex, s) => ex?.cat === 'Bodyweight' && !s?.seconds;

/**
 * Typing into one set carries to every later open set that was showing the
 * same numbers as it — the sets that follow it — at once, and into their
 * drafts, so the list, the swipe view and a reload all read the same thing.
 * A later set given numbers of its own keeps them.
 * @param {{w:string,r:string}} before what the typed set showed before this keystroke
 */
function carryForward(rows, from, before) {
  const src = rows[from];
  for (let j = from + 1; j < rows.length; j++) {
    const r = rows[j];
    if (r.logged || r.wInput.value !== before.w || r.rInput.value !== before.r) continue;
    r.wInput.value = src.wInput.value;
    r.rInput.value = src.rInput.value;
    r.last = { w: r.wInput.value, r: r.rInput.value };
    setDraft(r.ex, r.order, r.wInput.value, r.rInput.value);
  }
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
    el('button', {
      class: 'btn sm', 'aria-label': 'מצב גלילה',
      onclick: () => openFeedMode(ctx)
    }, [icon(ICONS.feed, 16)]),
    el('button', { class: 'btn sm primary', text: 'סיים', onclick: () => finishFlow(ctx) })
  ]);

  DOTS = el('div', { class: 'progress-dots' });
  PANE = el('div', { id: 'exPane' });

  /* Tapping the dock's clock reopens the full rest screen for the set that
     is actually resting. */
  timer.setExpandHandler(() => {
    const s = slot();
    const ex = getExercise(s.ex);
    if (ex) showRest({ slot: s, exercise: ex, allDone: !!s.done });
  });

  /* One way to finish, in the bar, always reachable without scrolling.
     Abandoning lives inside that flow — it is not a peer of finishing. */
  const root = el('div', { class: 'focus' });
  root.appendChild(DOTS);
  root.appendChild(PANE);

  paintExercise();
  return root;
}

/**
 * The same workout, swiped instead of scrolled. It writes through the same
 * logging path as the list, so the two are never out of step — switching
 * between them mid-session is just a change of view.
 */
async function openFeedMode(ctx) {
  const { openFeed } = await import('./feed.js');
  await db.setSetting('feedMode', true);

  const notes = {};
  await Promise.all([...new Set(W.slots.map((s) => s.ex))].map(async (id) => {
    const text = await getNote(id).catch(() => '');
    if (text) notes[id] = text;
  }));

  let glassesLeft = 0;
  try {
    const today = await db.byIndex('nutrition_logs', 'date', IDBKeyRange.only(todayISO()));
    const ml = dayWater(today?.[0]);
    const targetMl = ctx.settings.waterTarget || 3000;
    glassesLeft = Math.max(0, Math.round((targetMl - ml) / 250));
  } catch { /* the nutrition log is optional */ }

  openFeed({
    workout: W,
    settings: ctx.settings,
    notes,
    glassesLeft,
    getLog: (slotIndex, order) => getLog(W.slots[slotIndex].ex, order),
    /* the swipe view reads and writes the same drafts as the list */
    defaults: (slotIndex, order) => {
      const s = W.slots[slotIndex];
      return rowDefaults(s, order, s.targetWeight, s.seconds || s.targetReps, false);
    },
    onDraft: (slotIndex, order, w, r) => setDraft(W.slots[slotIndex].ex, order, w, r),
    onLogSet: async (slotIndex, order, weight, reps) => {
      const s = W.slots[slotIndex];
      const ex = getExercise(s.ex);
      const existing = getLog(s.ex, order);
      if (existing) {
        await unlogSet(existing.id);
        LOGS.delete(logKey(s.ex, order));
        s.done = false;
        await saveWorkout(W);
        return;
      }
      if (!(reps > 0)) { toast('הזן מספר חזרות', 'bad'); return; }
      const row = await logSet({
        workout_id: W.id, exercise_id: s.ex, set_order: order,
        weight_kg: weight || 0, reps, rir: null, is_warmup: false
      });
      LOGS.set(logKey(s.ex, order), row);
      clearDraft(s.ex, order);
      buzz(14);
      s.done = Array.from({ length: s.sets }, (_, i) => getLog(s.ex, i + 1)).every(Boolean);
      await saveWorkout(W);
      if (ctx.settings.autoTimer !== false) {
        timer.start(restAfterSet(ctx.settings, s, ex), `מנוחה · ${ex.name}`);
      }
    },
    onFinish: () => finishFlow(ctx),
    onClose: async () => {
      flushDrafts();
      await db.setSetting('feedMode', false);
      await loadLogs();
      paintExercise();
    }
  });
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
  const range = repRange(goalList(CTX.settings), ex);

  /* nav */
  pane.appendChild(el('div', { class: 'focus-nav' }, [
    el('button', {
      'aria-label': 'התרגיל הקודם',
      disabled: W.cursor === 0,
      onclick: () => move(-1)
    }, [icon(ICONS.chevronBack, 20)]),
    el('div', { class: 'name' }, [
      el('b', { text: ex.name }),
      el('small', { text: `${s.sets} סטים · ${range.min}–${range.max} חזרות` })
    ]),
    el('button', {
      'aria-label': 'התרגיל הבא',
      disabled: W.cursor >= W.slots.length - 1,
      onclick: () => move(1)
    }, [icon(ICONS.chevron, 20)])
  ]));

  /* movement demo — one tap opens it large, no separate button for it */
  if (hasImages(s.ex)) {
    DEMO = demo(s.ex, { expandable: false, tag: 'הקש להגדלה' });
    if (DEMO.node) {
      DEMO.node.addEventListener('click', async () => {
        const { openPlayer } = await import('./player.js');
        openPlayer(s.ex);
      });
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
      el('div', { class: 't-lbl', text: isBodyweight(ex, s) ? 'יעד להיום · משקל גוף' : 'יעד להיום' }),
      el('div', {
        class: 't-val num',
        text: s.seconds
          ? `${s.seconds} שניות`
          : isBodyweight(ex, s)
            ? (s.targetWeight ? `+${fmtW(s.targetWeight)} × ${s.targetReps}` : `${s.targetReps || range.min} חזרות`)
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

  /* sets — the reason this screen exists, so nothing competes with it */
  pane.appendChild(setList(s, ex));

  pane.appendChild(el('div', { class: 'set-actions' }, [
    el('button', {
      class: 'linkish', text: '+ הוסף סט',
      onclick: async () => { s.sets += 1; await saveWorkout(W); paintExercise(); }
    }),
    el('button', {
      class: 'linkish', text: 'עוד אפשרויות',
      onclick: () => toolsSheet(s, ex)
    })
  ]));

  paintDots();
}

/* Everything that is occasionally useful lives behind one door. Seven chips
   on the main card made the set grid — the thing you are actually here for —
   compete for attention with the plate calculator. */
function toolsSheet(s, ex) {
  const item = (iconPath, title, sub, onclick) => el('button', { class: 'list-link', onclick: () => { closeSheet(); onclick(); } }, [
    el('div', { class: 'ex-ord' }, [icon(iconPath, 18)]),
    el('div', { class: 'grow' }, [el('b', { text: title }), el('small', { text: sub })]),
    icon(ICONS.chevron, 16)
  ]);

  openSheet(ex.name, () => {
    const box = el('div', { class: 'stack' });
    if (ex.bar) box.appendChild(item(ICONS.plate, 'מחשבון פלטות', 'איזה דיסקיות לשים על המוט', () => platesSheet(s, ex)));
    box.appendChild(item(ICONS.flame, s.warmups?.length ? 'הסר סטי חימום' : 'הוסף סטי חימום', 'סולם עליות עד משקל העבודה', () => toggleWarmup(s, ex)));
    box.appendChild(item(ICONS.swap, 'החלף תרגיל', 'המכונה תפוסה או משהו כואב', () => swapSheet(s, ex)));
    box.appendChild(item(ICONS.timer, 'זמן מנוחה', `כרגע ${restLabel(restAfterSet(CTX.settings, s, ex))}`, () => restSheet(s, ex)));
    box.appendChild(item(ICONS.muscle, 'שרירים ופרטים', 'מפת שרירים, היסטוריה וטיפים', () => detailSheet(ex)));
    box.appendChild(item(ICONS.note, 'הערת כיוונון', 'גובה ספסל, אחיזה, מספר מושב', () => noteSheet(ex)));
    box.appendChild(item(ICONS.plus, 'הוסף תרגיל לאימון', 'תרגיל נוסף שלא בתוכנית — מתיחה, בטן, כל דבר', () => addExerciseSheet()));
    if (s.sets > 1) {
      box.appendChild(item(ICONS.trash, 'הסר את הסט האחרון', `${s.sets} סטים כרגע`, async () => {
        const last = getLog(s.ex, s.sets);
        if (last) { await unlogSet(last.id); LOGS.delete(logKey(s.ex, s.sets)); }
        s.sets -= 1;
        await saveWorkout(W);
        paintExercise();
      }));
    }
    box.appendChild(el('button', {
      class: 'btn full ghost danger', style: { marginTop: '6px' }, text: 'בטל את האימון',
      onclick: async () => {
        closeSheet();
        if (await confirmSheet('לבטל את האימון?', 'כל הסטים שנרשמו יימחקו.', 'בטל אימון')) {
          await abandonWorkout(W);
          timer.stop();
          CTX.go('home');
        }
      }
    }));
    return box;
  });
}

async function fillPrevHint(exId, box) {
  const prev = await lastSessionSets(exId, W.id);
  if (!box) return;
  if (!prev.length) { box.remove(); return; }
  box.innerHTML = '';
  box.appendChild(icon(ICONS.info, 15));
  const when = new Date(prev[0].timestamp).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
  box.appendChild(el('span', { text: `פעם קודמת (${when}):` }));
  prev.forEach((p) => {
    box.appendChild(el('b', { class: 'num', text: `${p.weight_kg ? round2(p.weight_kg) : (getExercise(exId)?.cat === 'Bodyweight' ? 'גוף' : 0)}×${p.reps}` }));
  });
}

/* ---------- set grid ---------- */

function setList(s, ex) {
  const timed = !!s.seconds;
  const withRir = CTX?.settings?.trackRir === true;
  const list = el('div', { class: 'setlist' });

  /* One header instead of the same two labels repeated on every row. */
  const bw = isBodyweight(ex, s);
  list.appendChild(el('div', { class: `set-head${withRir ? ' with-rir' : ''}` }, [
    el('span', { text: 'סט' }),
    el('span', { text: bw ? 'ק״ג נוסף' : 'ק״ג' }),
    el('span', { text: timed ? 'שניות' : 'חזרות' }),
    withRir ? el('span', { text: 'RIR' }) : null,
    el('span', { text: '' })
  ]));

  (s.warmups || []).forEach((w, i) => {
    list.appendChild(setRow(s, ex, -(i + 1), w.weight, w.reps, true, w.label));
  });

  const rows = [];
  for (let i = 1; i <= s.sets; i++) {
    list.appendChild(setRow(s, ex, i, s.targetWeight, s.seconds || s.targetReps, false, null, rows));
  }
  if (bw) {
    list.appendChild(el('div', { class: 'bw-hint' }, [
      icon(ICONS.info, 14),
      el('span', { text: '0 = משקל הגוף שלך. מוסיפים משקל (חגורה, תיק)? כותבים רק את התוספת.' })
    ]));
  }
  return list;
}

function setRow(s, ex, order, defWeight, defReps, isWarmup, label, rows = null) {
  const timed = !isWarmup && !!s.seconds;
  const log = getLog(s.ex, order);
  const done = !!log;
  const active = !done && !isWarmup && firstOpenOrder(s) === order;

  const start = log ? null : rowDefaults(s, order, defWeight, defReps, isWarmup);
  const bw = isBodyweight(ex, s);
  /* For bodyweight, an empty field reads "גוף" — the 0 that means the body. */
  const shownW = (v) => (bw && !(Number(v) > 0) ? '' : v);
  const wInput = el('input', {
    type: 'number', inputmode: 'decimal', step: '0.5', min: '0',
    value: log ? shownW(round2(log.weight_kg)) : shownW(start.w),
    /* an empty field reads as empty — a grey 0 looked like a typed one */
    placeholder: bw ? 'גוף' : '–',
    'aria-label': bw ? `משקל נוסף על משקל הגוף, סט ${order}` : `משקל, סט ${isWarmup ? (label || 'חימום') : order}`
  });
  const rInput = el('input', {
    type: 'number', inputmode: 'numeric', step: '1', min: '0',
    value: log ? log.reps : start.r,
    placeholder: '–', 'aria-label': `${timed ? 'שניות' : 'חזרות'}, סט ${isWarmup ? (label || 'חימום') : order}`
  });
  numberField(wInput);
  numberField(rInput);
  const me = { ex: s.ex, order, wInput, rInput, logged: !!log };
  me.last = { w: wInput.value, r: rInput.value };
  if (rows && !isWarmup) rows.push(me);
  if (!log) {
    const keep = () => {
      const before = me.last;
      me.last = { w: wInput.value, r: rInput.value };
      setDraft(s.ex, order, wInput.value, rInput.value);
      if (rows && !isWarmup) carryForward(rows, rows.indexOf(me), before);
    };
    wInput.addEventListener('input', keep);
    rInput.addEventListener('input', keep);
  }

  const withRir = CTX?.settings?.trackRir === true;
  const rirSel = el('select', {},
    [el('option', { value: '', text: 'RIR' })].concat(
      [0, 1, 2, 3, 4, 5].map((n) => el('option', { value: String(n), text: String(n) }))
    ));
  if (log?.rir != null) rirSel.value = String(log.rir);

  const row = el('div', {
    class: `set${withRir ? ' with-rir' : ''}${done ? ' done' : ''}${active ? ' active' : ''}${isWarmup ? ' warmup' : ''}`
  }, [
    el('div', { class: 'set-idx', text: isWarmup ? (label || 'W') : String(order) }),
    el('div', { class: 'set-field' }, [wInput]),
    el('div', { class: 'set-field' }, [rInput]),
    withRir ? el('div', { class: 'set-rir' }, [isWarmup ? el('div') : rirSel]) : null,
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
  clearDraft(s.ex, order);
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
  let rest = 0;
  if (CTX.settings.autoTimer !== false) {
    rest = refs.isWarmup ? 45 : restAfterSet(CTX.settings, s, ex);
    timer.start(rest, `מנוחה · ${ex.name}`);
  }

  paintExercise();
  CTX.setTitle(W.name, `${W.slots.filter((x) => x.done).length}/${W.slots.length} תרגילים`);

  if (allDone && W.cursor < W.slots.length - 1) {
    toast('תרגיל הושלם — עובר לתרגיל הבא', 'ok');
    setTimeout(() => move(1), 700);
  }

  /* Every working set opens the rest screen — short rests included: a
     bodyweight set on a 45-second rest is still a rest, and lifters asked
     for it. Warm-up pauses stay on the small dock timer. */
  if (rest >= 20 && !refs.isWarmup && CTX.settings.restScreen !== false) {
    showRest({ slot: s, exercise: ex, allDone });
  }
}

let noticeOfferedFor = null;   // the workout whose rest screen already offered it

/** Turn on the notification at the end of each rest (asks for permission). */
async function enableRestNotice() {
  if (!('Notification' in window)) { toast('הדפדפן הזה לא תומך בהתראות', 'bad'); return false; }
  const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission().catch(() => 'denied');
  if (perm !== 'granted') { toast('ההתראות נחסמו — אפשר לאשר אותן בהגדרות הטלפון', 'bad'); return false; }
  await CTX.saveSetting('bgNotify', true);
  toast('תקבל התראה בסוף כל מנוחה', 'ok');
  return true;
}

/** Hand the rest screen everything it needs to be worth looking at. */
async function showRest({ slot: s, exercise: ex, allDone }) {
  const upcoming = allDone && W.cursor < W.slots.length - 1 ? W.slots[W.cursor + 1] : null;
  const nextId = upcoming ? upcoming.ex : s.ex;
  const target = upcoming ? upcoming.targetWeight : s.targetWeight;

  let glassesLeft = 0;
  try {
    const today = await db.byIndex('nutrition_logs', 'date', IDBKeyRange.only(todayISO()));
    const ml = dayWater(today?.[0]);
    const targetMl = CTX.settings.waterTarget || 3000;
    glassesLeft = Math.max(0, Math.round((targetMl - ml) / 250));
  } catch { /* the nutrition log is optional */ }

  const done = Array.from({ length: s.sets }, (_, i) => getLog(s.ex, i + 1)).filter(Boolean).length;
  const note = await getNote(nextId).catch(() => '');

  const { openRest } = await import('./rest.js');
  openRest({
    nextId,
    isLastSet: allDone,
    setLabel: allDone
      ? `${ex.name} הושלם`
      : `סט ${Math.min(done + 1, s.sets)} מתוך ${s.sets} · ${ex.name}`,
    glassesLeft,
    note,
    /* offered on the first rest of a workout only: the rest screen stays three controls */
    onNotify: CTX.settings.bgNotify === true || noticeOfferedFor === W.id ? null : (noticeOfferedFor = W.id, enableRestNotice),
    settings: {
      barWeight: CTX.settings.barWeight,
      plates: CTX.settings.plates,
      nextWeight: target
    }
  });
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

/** Add an ad-hoc exercise to the running workout — the point isn't in the
    plan, so there's nothing to resolve or swap: pick, and it's the next slot. */
function addExerciseSheet() {
  openSheet('הוספת תרגיל', (close) => {
    const box = el('div', { class: 'stack' });
    const pick = async (id) => {
      await addFreeSlot(W, id, CTX.settings);
      W.cursor = W.slots.length - 1;
      close();
      toast(`${getExercise(id).name} נוסף לאימון`, 'ok');
      paintExercise();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    box.appendChild(el('div', { class: 'section-title', text: 'חיפוש' }));
    const q = el('input', { type: 'search', placeholder: 'שם תרגיל…' });
    const results = el('div');
    q.addEventListener('input', () => {
      results.innerHTML = '';
      if (q.value.trim().length < 2) return;
      search(q.value).slice(0, 10).forEach((o) => {
        results.appendChild(el('button', { class: 'opt', onclick: () => pick(o.id) }, [
          thumb(o.id, o.name),
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

function swapSheet(s, ex) {
  openSheet('החלפת תרגיל', (close) => {
    const box = el('div', { class: 'stack' });
    const pick = async (id) => {
      const target = getExercise(id);
      const prev = await lastSessionSets(id, W.id);
      s.ex = id;
      s.rest = restFor(goalList(CTX.settings), target);
      s.restSet = false;
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

/**
 * Rest for this exercise in this workout only. The first option is the
 * default (the fixed rest from Settings, or the plan's); the others, or a
 * number typed in, override it for this exercise until it is swapped.
 */
function restSheet(s, ex) {
  openSheet('זמן מנוחה', (close) => {
    const box = el('div', { class: 'stack' });
    const settings = CTX.settings;
    const fallback = restAfterSet(settings, { ...s, restSet: false }, ex);
    const current = restAfterSet(settings, s, ex);
    const pick = async (sec, own) => {
      s.rest = own ? sec : restFor(goalList(settings), ex);
      s.restSet = own;
      await saveWorkout(W);
      close();
      timer.start(sec, `מנוחה · ${ex.name}`);
    };
    box.appendChild(el('button', { class: `opt${s.restSet ? '' : ' on'}`, onclick: () => pick(fallback, false) }, [
      el('div', { class: 'grow' }, [
        el('b', { text: `ברירת המחדל · ${restLabel(fallback)}` }),
        el('small', { text: settings.restFixed ? 'המנוחה הקבועה שבחרת בהגדרות' : 'לפי התרגיל והמטרה שלך' })
      ])
    ]));
    [60, 90, 120, 180, 240].filter((sec) => sec !== fallback).forEach((sec) => {
      box.appendChild(el('button', {
        class: `opt${s.restSet && current === sec ? ' on' : ''}`,
        onclick: () => pick(sec, true)
      }, [
        el('div', { class: 'grow' }, [
          el('b', { text: restLabel(sec) }),
          el('small', { text: sec >= 180 ? 'תרגילים מורכבים / כוח' : sec >= 120 ? 'מורכב בינוני' : 'תרגילי בידוד' })
        ])
      ]));
    });
    /* any other number */
    const input = el('input', {
      type: 'number', inputmode: 'numeric', min: String(REST_MIN), max: String(REST_MAX), step: '5',
      placeholder: 'שניות', 'aria-label': 'מנוחה בשניות', class: 'rest-own-in'
    });
    if (s.restSet && ![60, 90, 120, 180, 240].includes(current)) input.value = String(current);
    box.appendChild(el('div', { class: 'row', style: { gap: '8px' } }, [
      input,
      el('button', {
        class: 'btn grow', text: 'קבע לתרגיל הזה',
        onclick: () => {
          const sec = Math.round(Number(input.value));
          if (!(sec >= REST_MIN && sec <= REST_MAX)) { toast(`בין ${REST_MIN} ל-${REST_MAX} שניות`, 'bad'); return; }
          pick(sec, true);
        }
      })
    ]));
    box.appendChild(el('p', { class: 'tiny dim', style: { margin: 0 }, text: 'לכל האימונים: הגדרות ← התנהגות ← אורך מנוחה.' }));
    return box;
  });
}

/* ---------- finish ---------- */

async function finishFlow(ctx) {
  const logs = await setsOf(W.id);
  const working = logs.filter((l) => !l.is_warmup);

  /* Nothing logged: finishing is meaningless, so the only real choice here is
     whether to throw the session away. */
  if (!working.length) {
    const drop = await confirmSheet(
      'לא נרשם אף סט',
      'אפשר להמשיך להתאמן, או לבטל את האימון ולחזור למסך הבית.',
      'בטל את האימון'
    );
    if (drop) {
      await abandonWorkout(W);
      timer.stop();
      ctx.go('home');
    }
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
  celebratePR('אימון הושלם');

  /* Fire and forget, both of them: finishing a workout must never wait on a
     network round trip. */
  import('./cloud.js').then((c) => c.autoBackUp()).catch(() => {});
  import('./gdrive.js').then((g) => g.autoSync()).catch(() => {});

  setTimeout(() => ctx.go('summary'), 700);
}
