/* ==========================================================================
   media.js — exercise imagery.
   Every exercise ships an animated loop, built offline from its two stills by
   tools/build-motion.py, so the demo is a real movement rather than two
   photographs swapping places. Exercises without one fall back to the old
   cross-fade. Everything is local: it all works with the phone offline.
   ========================================================================== */

import { el, icon, ICONS } from './ui.js';
import { WITH_IMAGES, TWO_FRAMES } from './ex-images.js';
import { WITH_MOTION } from './ex-motion.js';
import { muscleMap, musclesFor } from './anatomy.js';
import { getExercise, CATEGORIES, MUSCLES, ytUrl } from './exercises.js';
import { lineChart } from './chart.js';
import * as db from './db.js';
import { oneRM, round2 } from './logic.js';

const BASE = 'img/ex';
const MOTION = 'img/motion';

export const hasImages = (id) => WITH_IMAGES.has(id);
export const hasMotion = (id) => WITH_MOTION.has(id);
export const frameUrl = (id, n = 0) => `${BASE}/${id}-${n}.webp`;
export const motionUrl = (id) => `${MOTION}/${id}.webp`;

/** Small square image for list rows. */
export function thumb(id, alt = '') {
  if (!hasImages(id)) return placeholder();
  return el('img', {
    class: 'ex-thumb',
    src: frameUrl(id, 0),
    alt,
    loading: 'lazy',
    decoding: 'async'
  });
}

const placeholder = () => el('div', { class: 'ex-thumb', style: { display: 'grid', placeItems: 'center' } }, [icon(ICONS.dumbbell, 18)]);

/**
 * The movement demo. An animated loop where one exists — the browser plays it,
 * so there is no timer to run or stop — and the old two-frame cross-fade where
 * there is not. Returns {node, stop}; callers must call stop() when the card is
 * replaced, or a fallback loop keeps ticking off-screen.
 */
export function demo(id, { interval = 1100, tag = 'הדגמת תנועה', expandable = true } = {}) {
  if (!hasImages(id)) return { node: null, stop: () => {} };

  const box = el('div', { class: 'ex-media' });
  const openPlayer = async (e) => {
    e.stopPropagation();
    const { openPlayer: open } = await import('./player.js');
    open(id);
  };

  const chrome = () => {
    box.appendChild(el('div', { class: 'ex-media-tag', text: tag }));
    if (expandable) {
      box.appendChild(el('button', {
        class: 'ex-media-play', 'aria-label': 'פתח הדגמה גדולה', onclick: openPlayer
      }, [icon(ICONS.expand, 18), el('span', { text: 'הגדל' })]));
    }
  };

  /* The common case: one animated file, no JavaScript driving it. */
  if (hasMotion(id)) {
    box.appendChild(el('img', {
      class: 'on', src: motionUrl(id), alt: 'הדגמת התרגיל', decoding: 'async', loading: 'lazy'
    }));
    chrome();
    return { node: box, stop: () => {} };
  }

  const frames = TWO_FRAMES.has(id) ? [0, 1] : [0];
  const imgs = frames.map((n, i) => el('img', {
    class: i === 0 ? 'on' : '',
    src: frameUrl(id, n),
    alt: '',
    loading: 'lazy',
    decoding: 'async'
  }));
  imgs.forEach((i) => box.appendChild(i));
  chrome();

  let at = 0;
  let timer = null;

  const tick = () => {
    imgs[at].classList.remove('on');
    at = (at + 1) % imgs.length;
    imgs[at].classList.add('on');
  };

  const play = () => {
    if (timer || imgs.length < 2) return;
    timer = setInterval(tick, interval);
  };
  const pause = () => { clearInterval(timer); timer = null; };

  play();
  const onVis = () => (document.hidden ? pause() : play());
  document.addEventListener('visibilitychange', onVis);

  return {
    node: box,
    stop: () => {
      pause();
      document.removeEventListener('visibilitychange', onVis);
    }
  };
}

/** Full exercise card for a bottom sheet: frames, muscle map, metadata. */
export function exerciseDetail(id) {
  const ex = getExercise(id);
  const box = el('div', { class: 'stack' });
  if (!ex) return box;

  if (hasImages(id)) {
    const { node } = demo(id, { expandable: false, tag: 'הדגמת תנועה' });
    if (node) box.appendChild(node);
  }

  /* progress, filled in once the history query returns */
  const progress = el('div', { class: 'card stack' }, [
    el('div', { class: 'card-head' }, [
      el('h3', { text: 'התקדמות' }),
      el('span', { class: 'badge', text: '1RM משוער' })
    ]),
    el('div', { class: 'tiny dim', text: 'טוען…' })
  ]);
  box.appendChild(progress);
  fillProgress(id, progress);

  const { primary, secondary } = musclesFor(ex);
  box.appendChild(el('div', { class: 'card' }, [
    muscleMap(primary, secondary, { width: 210 }),
    el('div', { class: 'legend' }, [
      el('span', {}, [el('i', { style: { background: 'var(--accent)' } }), 'שריר מוביל']),
      el('span', {}, [el('i', { style: { background: 'rgba(255,138,61,.35)' } }), 'שרירי עזר'])
    ])
  ]));

  const meta = [
    ['שריר יעד', MUSCLES[ex.muscle] || ex.muscle],
    ['ציוד', CATEGORIES[ex.cat]],
    ['סוג', ex.compound ? 'תרגיל מורכב' : 'תרגיל בידוד'],
    ['מנוחה מומלצת', `${ex.rest} שניות`]
  ];
  if (ex.secondary?.length) {
    meta.splice(1, 0, ['שרירי עזר', ex.secondary.map((m) => MUSCLES[m] || m).join(', ')]);
  }

  box.appendChild(el('div', { class: 'card stack', style: { gap: '7px' } },
    meta.map(([k, v]) => el('div', { class: 'row between tiny' }, [
      el('span', { class: 'dim', text: k }),
      el('b', { text: v })
    ]))
  ));

  if (ex.cue) {
    box.appendChild(el('div', { class: 'prev-hint' }, [icon(ICONS.info, 15), el('span', { text: ex.cue })]));
  }

  box.appendChild(el('button', {
    class: 'btn primary full',
    onclick: async () => {
      const { openPlayer } = await import('./player.js');
      openPlayer(id);
    }
  }, [icon(ICONS.play, 18, 'solid'), el('span', { text: 'פתח נגן הדגמה' })]));

  return box;
}

/**
 * Best estimated 1RM per session, oldest first — the honest way to show
 * progress when both weight and reps move around between sessions.
 */
async function fillProgress(exerciseId, card) {
  const body = card.lastChild;
  try {
    const rows = await db.byIndex('set_logs', 'exercise_id', IDBKeyRange.only(exerciseId));
    const perWorkout = new Map();
    for (const r of rows) {
      if (r.is_warmup || !r.weight_kg || !r.reps) continue;
      const e = oneRM(r.weight_kg, r.reps);
      const cur = perWorkout.get(r.workout_id);
      if (!cur || e > cur.y) perWorkout.set(r.workout_id, { y: e, t: r.timestamp });
    }

    const points = Array.from(perWorkout.values())
      .sort((a, b) => a.t - b.t)
      .slice(-12)
      .map((p) => ({
        y: round2(p.y),
        label: new Date(p.t).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })
      }));

    body.remove();

    if (points.length < 2) {
      card.appendChild(el('div', {
        class: 'tiny dim',
        text: points.length
          ? 'עוד אימון אחד והגרף יתחיל להראות מגמה.'
          : 'אין עדיין נתונים לתרגיל הזה.'
      }));
      return;
    }

    const chart = lineChart(points, { unit: 'ק״ג' });
    if (chart) card.appendChild(chart);

    const first = points[0].y;
    const last = points[points.length - 1].y;
    const diff = round2(last - first);
    const pct = first ? Math.round((diff / first) * 100) : 0;
    card.appendChild(el('div', { class: 'row between tiny' }, [
      el('span', { class: 'dim', text: `${points.length} אימונים אחרונים` }),
      el('b', {
        style: { color: diff >= 0 ? 'var(--ok)' : 'var(--bad)' },
        text: `${diff >= 0 ? '+' : ''}${diff} ק״ג (${pct >= 0 ? '+' : ''}${pct}%)`
      })
    ]));
  } catch (err) {
    body.textContent = 'לא ניתן לטעון היסטוריה';
  }
}
