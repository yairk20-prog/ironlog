/* ==========================================================================
   media.js — exercise imagery.
   Two bundled frames per exercise are cross-faded into a slow loop, which
   reads as a movement demo without shipping video or GIF weight. Everything
   is local, so it works with the phone offline.
   ========================================================================== */

import { el, icon, ICONS } from './ui.js';
import { WITH_IMAGES, TWO_FRAMES } from './ex-images.js';
import { muscleMap, musclesFor } from './anatomy.js';
import { getExercise, CATEGORIES, MUSCLES, ytUrl } from './exercises.js';

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
 * Cross-fading two-frame demo. Returns {node, stop} — callers must call stop()
 * when the card is replaced, or the interval keeps running off-screen.
 */
export function demo(id, { interval = 1100, tag = 'הדגמת תנועה' } = {}) {
  if (!hasImages(id)) return { node: null, stop: () => {} };

  const box = el('div', { class: 'ex-media' });
  const frames = TWO_FRAMES.has(id) ? [0, 1] : [0];
  const imgs = frames.map((n, i) => el('img', {
    class: i === 0 ? 'on' : '',
    src: frameUrl(id, n),
    alt: '',
    loading: 'lazy',
    decoding: 'async'
  }));
  imgs.forEach((i) => box.appendChild(i));
  box.appendChild(el('div', { class: 'ex-media-tag', text: tag }));

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
    box.classList.remove('paused');
  };
  const pause = () => {
    clearInterval(timer);
    timer = null;
    box.classList.add('paused');
  };

  box.addEventListener('click', () => (timer ? pause() : play()));
  play();

  /* stop looping while the tab is in the background */
  const onVis = () => (document.hidden ? pause() : play());
  document.addEventListener('visibilitychange', onVis);

  return {
    node: box,
    stop: () => {
      clearInterval(timer);
      timer = null;
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
    box.appendChild(el('div', { class: 'media-row' }, [
      el('img', { src: frameUrl(id, 0), alt: 'תנוחת פתיחה', loading: 'lazy' }),
      TWO_FRAMES.has(id) ? el('img', { src: frameUrl(id, 1), alt: 'תנוחת סיום', loading: 'lazy' }) : null
    ]));
    box.appendChild(el('div', { class: 'row between tiny dim' }, [
      el('span', { text: 'פתיחה' }),
      el('span', { text: 'סיום' })
    ]));
  }

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

  box.appendChild(el('a', {
    class: 'btn full', href: ytUrl(ex), target: '_blank', rel: 'noopener', text: '▶ צפה בהדגמת וידאו'
  }));

  return box;
}
