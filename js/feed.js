/* ==========================================================================
   feed.js — the workout as a vertical feed.

   One card per screen, swiped like a feed: the exercise, then its rest, then
   the next exercise. It is the same workout and the same data as the list —
   this is a way of moving through it, not a second app — and it exists
   because during a session you are holding a phone in one hand and want the
   next thing to be one thumb-flick away, not a scroll and a tap.

   The compromise the pattern usually forces is that a feed is for consuming
   and a set grid is for editing. So the editing stays: every exercise card
   carries its real inputs, and the swipe only moves between cards. Vertical
   drags on an input do nothing; the card tracks the finger everywhere else.
   ========================================================================== */

import { el, icon, ICONS, buzz, toast } from './ui.js';
import * as timer from './timer.js';
import { getExercise, MUSCLES, CATEGORIES } from './exercises.js';
import { exerciseDemo } from './media.js';
import { fmtTime, fmtW, round2, platesFor } from './logic.js';

/** How far a drag must go before it counts as a swipe. */
const THRESHOLD = 70;

/**
 * Open the feed over the current workout.
 * @param {object} p
 * @param {object} p.workout
 * @param {(slotIndex:number, setOrder:number, weight:number, reps:number) => Promise<any>} p.onLogSet
 * @param {(slotIndex:number, setOrder:number) => object|null} p.getLog
 * @param {() => void} p.onFinish
 * @param {object} p.settings
 * @param {Object<string,string>} [p.notes]  exercise id → saved note from last time
 * @param {number} [p.glassesLeft]  water glasses still owed today
 */
export function openFeed({ workout, onLogSet, getLog, onFinish, onClose, settings = {}, notes = {}, glassesLeft = 0 }) {
  const cards = [];
  const figures = [];
  let at = 0;

  const track = el('div', { class: 'feed-track' });
  const counter = el('div', { class: 'feed-count' });

  /* One tick per exercise in the split — not per card, so rest cards don't
     inflate the count. Lets a lifter see the whole session's shape: what's
     behind, what's now, and — distinctly — what's immediately next versus
     everything further out. */
  const progress = el('div', { class: 'feed-progress' },
    workout.slots.map((slot, i) => el('i', { title: getExercise(slot.ex)?.name || '' })));

  /* ---------- cards ---------- */

  const exerciseCard = (slot, index) => {
    const ex = getExercise(slot.ex);
    const fig = exerciseDemo(ex, { period: 2800 });
    figures.push(fig);

    const rows = el('div', { class: 'feed-sets' });
    const paintRows = () => {
      rows.replaceChildren();
      for (let order = 1; order <= slot.sets; order++) {
        const log = getLog(index, order);
        const w = el('input', {
          type: 'number', inputmode: 'decimal', step: '0.5',
          value: log ? round2(log.weight_kg) : (slot.targetWeight || ''),
          placeholder: '0', 'aria-label': `משקל סט ${order}`
        });
        const r = el('input', {
          type: 'number', inputmode: 'numeric',
          value: log ? log.reps : (slot.targetReps || ''),
          placeholder: '0', 'aria-label': `חזרות סט ${order}`
        });
        rows.appendChild(el('div', { class: `feed-set${log ? ' done' : ''}` }, [
          el('span', { class: 'feed-set-n', text: String(order) }),
          w, el('span', { class: 'feed-x', text: '×' }), r,
          el('button', {
            class: 'feed-tick', 'aria-label': log ? 'בטל סט' : 'סיים סט',
            onclick: async () => {
              await onLogSet(index, order, Number(w.value), Number(r.value));
              paintRows();
            }
          }, [icon(ICONS.check, 20)])
        ]));
      }
    };
    paintRows();

    return el('div', { class: 'feed-card' }, [
      el('div', { class: 'feed-fig' }, [fig.node]),
      el('div', { class: 'feed-head' }, [
        el('span', { class: 'eyebrow', text: `${index + 1} מתוך ${workout.slots.length} · ${MUSCLES[ex.muscle] || ex.muscle}` }),
        el('h2', { text: ex.name }),
        el('p', {
          text: slot.targetWeight
            ? `יעד: ${fmtW(slot.targetWeight)} × ${slot.targetReps}`
            : `יעד: ${slot.targetReps || ''} חזרות · ${CATEGORIES[ex.cat]}`
        })
      ]),
      rows,
      ex.cue ? el('div', { class: 'feed-cue' }, [icon(ICONS.info, 15), el('span', { text: ex.cue })]) : null
    ]);
  };

  const restCard = (slot, index) => {
    const next = workout.slots[index + 1];
    const nextEx = next ? getExercise(next.ex) : null;
    const fig = nextEx ? exerciseDemo(nextEx, { period: 2800 }) : null;
    if (fig) figures.push(fig);

    const clock = el('b', { class: 'feed-clock num', text: '—' });

    /* The same clock as everywhere else; this card only listens. */
    const off = timer.onTick((remain) => {
      clock.textContent = remain > 0 ? fmtTime(remain) : 'קדימה';
      clock.classList.toggle('done', remain <= 0);
    });
    figures.push({ stop: off });

    /* Everything worth knowing before the next set, stacked short — the
       note from last time (seat height, pin, grip) first, since it's the
       one thing you'd otherwise have to rediscover by hand. */
    const lines = [];
    const savedNote = nextEx && notes[nextEx.id];
    if (savedNote) lines.push(`שמרת בפעם הקודמת: ${savedNote}`);
    if (nextEx?.bar && next.targetWeight) {
      const { perSide } = platesFor(next.targetWeight, {
        barWeight: settings.barWeight, plates: settings.plates
      });
      if (perSide.length) {
        lines.push(`תכין ${fmtW(next.targetWeight)} — ${perSide.map((p) => `${p.plate}×${p.count}`).join(' · ')} לכל צד`);
      }
    }
    if (!lines.length) lines.push(nextEx?.cue || 'נשימה עמוקה, ואז הבא בתור.');
    if (glassesLeft > 0) lines.push(`נשארו ${glassesLeft} כוסות מים להיום — עכשיו זה הזמן`);

    return el('div', { class: 'feed-card feed-rest' }, [
      el('span', { class: 'eyebrow', text: 'מנוחה' }),
      clock,
      el('div', { class: 'row', style: { gap: '8px' } }, [
        el('button', { class: 'btn sm', text: '−20', onclick: () => timer.add(-20) }),
        el('button', { class: 'btn sm', text: '+20', onclick: () => timer.add(20) })
      ]),
      fig ? el('div', { class: 'feed-fig small' }, [fig.node]) : null,
      nextEx ? el('h3', { text: `הבא: ${nextEx.name}` }) : el('h3', { text: 'זה האחרון' }),
      ...lines.map((text) => el('p', { class: 'feed-rest-note', text }))
    ]);
  };

  /* Maps a card index to where it leaves the *exercise* sequence: which
     slots are behind us, which one is showing now, which is immediately
     next. Built alongside `cards` so the progress strip and the swipe
     track never disagree about position. */
  const focusForCard = [];

  workout.slots.forEach((slot, i) => {
    cards.push(exerciseCard(slot, i));
    focusForCard.push({ doneUpTo: i - 1, now: i, next: i + 1 < workout.slots.length ? i + 1 : -1 });
    if (i < workout.slots.length - 1) {
      cards.push(restCard(slot, i));
      focusForCard.push({ doneUpTo: i, now: -1, next: i + 1 });
    }
  });
  focusForCard.push({ doneUpTo: workout.slots.length - 1, now: -1, next: -1 }); // the end card

  cards.push(el('div', { class: 'feed-card feed-end' }, [
    el('span', { class: 'eyebrow', text: 'סיום' }),
    el('h2', { text: 'זהו, סיימת' }),
    el('p', { text: 'כל הסטים נשמרו. אפשר לסגור את האימון ולראות את הסיכום.' }),
    el('button', { class: 'btn primary full', text: 'סיים ושמור', onclick: () => { close(); onFinish(); } })
  ]));

  cards.forEach((c) => track.appendChild(c));

  /* ---------- movement ---------- */

  const paint = () => {
    track.style.transform = `translateY(${-at * 100}%)`;
    counter.textContent = `${Math.min(at + 1, cards.length)} / ${cards.length}`;
    cards.forEach((c, i) => c.classList.toggle('on', i === at));

    const focus = focusForCard[at];
    progress.childNodes.forEach((tick, i) => {
      tick.classList.toggle('done', i <= focus.doneUpTo);
      tick.classList.toggle('now', i === focus.now);
      tick.classList.toggle('next', i === focus.next);
    });
  };

  const go = (delta) => {
    const next = Math.max(0, Math.min(cards.length - 1, at + delta));
    if (next === at) return;
    at = next;
    buzz(10);
    paint();
  };

  /* A drag that starts on a field is the field's; everything else is a swipe. */
  let startY = 0;
  let dragging = false;

  const down = (e) => {
    if (e.target.closest('input, button')) return;
    dragging = true;
    startY = e.clientY;
    track.classList.add('dragging');
  };
  const move = (e) => {
    if (!dragging) return;
    const dy = e.clientY - startY;
    track.style.transform = `translateY(calc(${-at * 100}% + ${dy * 0.55}px))`;
  };
  const up = (e) => {
    if (!dragging) return;
    dragging = false;
    track.classList.remove('dragging');
    const dy = e.clientY - startY;
    if (dy < -THRESHOLD) go(1);
    else if (dy > THRESHOLD) go(-1);
    else paint();
  };

  const onKey = (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowDown') go(1);
    if (e.key === 'ArrowUp') go(-1);
  };

  const close = () => {
    figures.forEach((f) => f.stop?.());
    document.removeEventListener('keydown', onKey);
    wrap.remove();
    document.body.classList.remove('feed-open');
    onClose?.();
  };

  const wrap = el('div', { class: 'feed', role: 'dialog', 'aria-label': 'אימון' }, [
    el('div', { class: 'feed-bar' }, [
      el('button', { class: 'feed-close', onclick: close, 'aria-label': 'חזרה לרשימה' }, [icon(ICONS.close, 20)]),
      counter,
      el('button', { class: 'btn sm primary', text: 'סיים', onclick: () => { close(); onFinish(); } })
    ]),
    progress,
    track,
    el('div', { class: 'feed-hint' }, [icon(ICONS.chevronUp, 16), el('span', { text: 'החלק למעלה להמשך, למטה כדי לחזור' })])
  ]);

  wrap.addEventListener('pointerdown', down);
  wrap.addEventListener('pointermove', move);
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => wrap.addEventListener(ev, up));

  document.body.appendChild(wrap);
  document.body.classList.add('feed-open');
  document.addEventListener('keydown', onKey);
  paint();

  /* When a set completes the rest starts, so the feed should already be on
     the rest card when the lifter looks up. */
  return { close, advance: () => go(1), goTo: (i) => { at = i; paint(); } };
}
