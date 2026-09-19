/* ==========================================================================
   rest.js — the screen between sets.

   Rest is two or three minutes of standing there, and the app spends it
   showing a set grid nobody is looking at. This takes the screen over for the
   duration and uses it: the countdown large enough to read across the gym,
   what is coming next with its loop playing, and one thing worth knowing —
   the cue for the next lift, the plates it needs, or a reminder to drink.

   It never blocks: a tap on the card, the close button or the end of the
   countdown returns you to the grid, and the dock keeps the time either way.
   ========================================================================== */

import { el, icon, ICONS, buzz } from './ui.js';
import * as timer from './timer.js';
import { getExercise, MUSCLES } from './exercises.js';
import { figureDemo } from './figure.js';
import { platesFor, fmtTime, fmtW } from './logic.js';

let closeCurrent = null;

/** The one useful thing to say during this particular rest. */
function tips({ next, isLastSet, settings, glassesLeft }) {
  const out = [];

  if (next?.cue) {
    out.push({ icon: ICONS.info, title: 'דגש לביצוע', text: next.cue });
  }

  if (next?.bar && settings?.nextWeight) {
    const { perSide } = platesFor(settings.nextWeight, {
      barWeight: settings.barWeight,
      plates: settings.plates
    });
    if (perSide.length) {
      out.push({
        icon: ICONS.plate,
        title: `תכין ${fmtW(settings.nextWeight)}`,
        text: `${perSide.map((p) => `${p.plate}×${p.count}`).join(' · ')} לכל צד`
      });
    }
  }

  if (glassesLeft > 0) {
    out.push({
      icon: ICONS.glass,
      title: 'לגימה',
      text: `נשארו ${glassesLeft} כוסות להיום — עכשיו זה הזמן`
    });
  }

  if (isLastSet && next) {
    out.push({
      icon: ICONS.swap,
      title: 'התרגיל הבא',
      text: `${next.name} — ${MUSCLES[next.muscle] || next.muscle}`
    });
  }

  if (!out.length) {
    out.push({
      icon: ICONS.timer,
      title: 'נשימה',
      text: 'שתי נשימות עמוקות דרך האף מורידות את הדופק מהר יותר מלהסתכל בטלפון'
    });
  }
  return out;
}

/**
 * Show the rest screen.
 * @param {object} p
 * @param {string} p.nextId      exercise to preview (the next set's, or the next exercise's)
 * @param {boolean} p.isLastSet  whether the set just logged finished the exercise
 * @param {number}  p.setLabel   e.g. "סט 3 מתוך 4" for the line under the clock
 * @param {object}  p.settings   bar weight, plates and the next target
 * @param {number}  p.glassesLeft
 */
export function openRest({ nextId, isLastSet = false, setLabel = '', settings = {}, glassesLeft = 0 }) {
  closeCurrent?.();

  const next = getExercise(nextId);
  const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  const CIRC = 2 * Math.PI * 52;

  const clock = el('b', { class: 'rest-clock num', text: fmtTime(Math.max(0, timer.remaining())) });
  const sub = el('span', { class: 'rest-sub', text: setLabel });

  const dial = el('div', { class: 'rest-dial' }, [
    (() => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 120 120');
      svg.setAttribute('class', 'rest-ring');
      const track = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      for (const [k, v] of Object.entries({ cx: 60, cy: 60, r: 52, class: 'rest-track' })) track.setAttribute(k, v);
      for (const [k, v] of Object.entries({
        cx: 60, cy: 60, r: 52, class: 'rest-progress',
        'stroke-dasharray': CIRC, 'stroke-dashoffset': 0
      })) ring.setAttribute(k, v);
      svg.append(track, ring);
      return svg;
    })(),
    el('div', { class: 'rest-face' }, [clock, sub])
  ]);

  const list = tips({ next, isLastSet, settings, glassesLeft });
  let at = 0;
  const tipBox = el('div', { class: 'rest-tip' });
  const paintTip = () => {
    const t = list[at % list.length];
    tipBox.replaceChildren(
      el('div', { class: 'rest-tip-ico' }, [icon(t.icon, 18)]),
      el('div', { class: 'grow' }, [
        el('b', { text: t.title }),
        el('p', { text: t.text })
      ])
    );
    tipBox.classList.remove('in');
    void tipBox.offsetWidth;
    tipBox.classList.add('in');
  };
  paintTip();

  /* Rotate slowly: long enough to read, short enough to be worth watching. */
  const rotate = list.length > 1 ? setInterval(() => { at += 1; paintTip(); }, 6000) : null;

  const nextFig = next ? figureDemo(next, { period: 2800 }) : null;
  const preview = next
    ? el('div', { class: 'rest-next' }, [
      el('div', { class: 'rest-next-fig' }, [nextFig.node]),
      el('div', { class: 'rest-next-body' }, [
        el('span', { class: 'eyebrow', text: isLastSet ? 'התרגיל הבא' : 'הסט הבא' }),
        el('b', { text: next.name })
      ])
    ])
    : null;

  const close = () => {
    clearInterval(rotate);
    nextFig?.stop();
    off();
    document.removeEventListener('keydown', onKey);
    wrap.remove();
    document.body.classList.remove('rest-open');
    closeCurrent = null;
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };

  const wrap = el('div', { class: 'rest-screen', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'מנוחה' }, [
    el('button', { class: 'rest-close', onclick: close, 'aria-label': 'חזרה לאימון' }, [icon(ICONS.close, 22)]),
    dial,
    el('div', { class: 'rest-actions' }, [
      el('button', { class: 'btn sm', text: '+30 שניות', onclick: () => { timer.add(30); buzz(8); } }),
      el('button', { class: 'btn sm primary', text: 'דלג על המנוחה', onclick: () => { timer.stop(); close(); } })
    ]),
    preview,
    tipBox
  ]);

  /* One clock for the whole app: this screen listens, it does not count. */
  const off = timer.onTick((remain, span) => {
    if (!span) return close();
    const left = Math.max(0, remain);
    clock.textContent = remain <= 0 ? 'קדימה' : fmtTime(left);
    wrap.classList.toggle('done', remain <= 0);
    ring.setAttribute('stroke-dashoffset', String(CIRC * (1 - Math.min(1, left / span))));
    if (remain <= 0) {
      /* Let it land on "go" for a moment, then get out of the way. */
      setTimeout(close, 2200);
    }
  });

  document.body.appendChild(wrap);
  document.body.classList.add('rest-open');
  document.addEventListener('keydown', onKey);
  closeCurrent = close;
  return close;
}

export const closeRest = () => closeCurrent?.();
