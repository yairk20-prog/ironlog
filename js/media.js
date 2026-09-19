/* ==========================================================================
   media.js — exercise imagery.
   Photographs are used where a photograph is best — as a thumbnail, so a row
   is recognisable at a glance. The demonstration itself is drawn: see
   figure.js for why, and for what it buys.
   ========================================================================== */

import { el, icon, ICONS } from './ui.js';
import { WITH_IMAGES, TWO_FRAMES } from './ex-images.js';
import { figureDemo } from './figure.js';
import { muscleMap, musclesFor } from './anatomy.js';
import { getExercise, CATEGORIES, MUSCLES, ytUrl } from './exercises.js';
import { lineChart } from './chart.js';
import * as db from './db.js';
import { oneRM, round2 } from './logic.js';

const BASE = 'img/ex';

export const hasImages = (id) => WITH_IMAGES.has(id);
export const frameUrl = (id, n = 0) => `${BASE}/${id}-${n}.webp`;

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
 * Two real photographs of the start and end position, crossfaded — used only
 * for the exercises `TWO_FRAMES` actually has both frames for. A profile
 * stick figure reads as an abstraction; a real photo of the position reads as
 * an instruction, which is the point of a demo.
 * @returns {{node, stop, play, pause, isRunning}}
 */
function photoDemo(id, { period = 2600 } = {}) {
  const frameStyle = {
    position: 'absolute', inset: '0', width: '100%', height: '100%',
    objectFit: 'contain', opacity: '0', transition: 'opacity .38s ease'
  };
  const a = el('img', { src: frameUrl(id, 0), alt: '', loading: 'lazy', decoding: 'async', style: { ...frameStyle, opacity: '1' } });
  const b = el('img', { src: frameUrl(id, 1), alt: '', loading: 'lazy', decoding: 'async', style: frameStyle });
  const node = el('div', { style: { position: 'relative', width: '100%', height: '100%' } }, [a, b]);

  let timer = null;
  let onB = false;
  const isRunning = () => timer != null;

  const swap = () => {
    onB = !onB;
    a.style.opacity = onB ? '0' : '1';
    b.style.opacity = onB ? '1' : '0';
  };

  const play = () => { if (!isRunning()) timer = setInterval(swap, Math.max(600, period / 2)); };
  const stop = () => { clearInterval(timer); timer = null; };

  play();
  const onVis = () => (document.hidden ? stop() : play());
  document.addEventListener('visibilitychange', onVis);

  return {
    node, play, pause: stop, isRunning,
    stop: () => { stop(); document.removeEventListener('visibilitychange', onVis); }
  };
}

/**
 * Whichever demo is clearer for this exercise: real before/after photos when
 * both frames exist, the drawn figure otherwise (unfilmed movements, or where
 * only one bundled photo exists).
 * @returns {{node, stop, play, pause}}
 */
export function exerciseDemo(exOrId, opts = {}) {
  const ex = typeof exOrId === 'string' ? getExercise(exOrId) : exOrId;
  if (!ex) return { node: null, stop: () => {}, play: () => {}, pause: () => {} };
  return TWO_FRAMES.has(ex.id) ? photoDemo(ex.id, opts) : figureDemo(ex, opts);
}

/**
 * The movement demo, in its own labelled, expandable frame.
 * @returns {{node, stop, play, pause}}
 */
export function demo(id, { tag = 'הדגמת תנועה', expandable = true } = {}) {
  const ex = getExercise(id);
  if (!ex) return { node: null, stop: () => {}, play: () => {}, pause: () => {} };

  const box = el('div', { class: 'ex-media' });
  const fig = exerciseDemo(ex);
  box.appendChild(fig.node);
  box.appendChild(el('div', { class: 'ex-media-tag', text: tag }));

  if (expandable) {
    box.appendChild(el('button', {
      class: 'ex-media-play', 'aria-label': 'פתח הדגמה גדולה',
      onclick: async (e) => {
        e.stopPropagation();
        const { openPlayer } = await import('./player.js');
        openPlayer(id);
      }
    }, [icon(ICONS.expand, 18), el('span', { text: 'הגדל' })]));
  }

  return { node: box, stop: fig.stop, play: fig.play, pause: fig.pause };
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
