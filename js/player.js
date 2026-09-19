/* ==========================================================================
   player.js — the movement demo.
   One thing only: the exercise, looping, large. Tap to hold a frame, tap to
   resume, close. No tabs, no speeds, no stepping — a demo you have to operate
   is a demo you stop opening.
   ========================================================================== */

import { el, icon, ICONS } from './ui.js';
import { hasImages, hasMotion, frameUrl, motionUrl } from './media.js';
import { TWO_FRAMES } from './ex-images.js';
import { getExercise, MUSCLES } from './exercises.js';

const INTERVAL = 900;

let closeCurrent = null;

/** Open the looping demo for an exercise. Returns a close function. */
export function openPlayer(id) {
  const ex = getExercise(id);
  if (!ex || !hasImages(id)) return () => {};
  closeCurrent?.();

  const stage = el('div', { class: 'pl-stage' });
  const hint = el('div', { class: 'pl-hint' });
  let stop = () => {};

  if (hasMotion(id)) {
    /* The browser animates the file; pausing means showing a still instead. */
    const loop = el('img', { class: 'on', src: motionUrl(id), alt: 'הדגמת התרגיל', decoding: 'async' });
    stage.appendChild(loop);
    hint.textContent = 'הקש כדי לעצור';
    let running = true;
    stage.addEventListener('click', () => {
      running = !running;
      loop.src = running ? motionUrl(id) : frameUrl(id, 1);
      hint.textContent = running ? 'הקש כדי לעצור' : 'הקש כדי להמשיך';
      stage.classList.toggle('paused', !running);
    });
  } else {
    const frames = TWO_FRAMES.has(id) ? [0, 1] : [0];
    const imgs = frames.map((n, i) => el('img', {
      class: i === 0 ? 'on' : '',
      src: frameUrl(id, n),
      alt: i === 0 ? 'תנוחת פתיחה' : 'תנוחת סיום',
      decoding: 'async'
    }));
    imgs.forEach((img) => stage.appendChild(img));

    let at = 0;
    let timer = null;
    const paint = () => imgs.forEach((img, i) => img.classList.toggle('on', i === at));
    const tick = () => { at = (at + 1) % imgs.length; paint(); };
    const play = () => {
      if (imgs.length < 2 || timer) return;
      timer = setInterval(tick, INTERVAL);
      stage.classList.remove('paused');
      hint.textContent = 'הקש כדי לעצור';
    };
    const pause = () => {
      clearInterval(timer);
      timer = null;
      stage.classList.add('paused');
      hint.textContent = 'הקש כדי להמשיך';
    };
    if (imgs.length > 1) {
      stage.addEventListener('click', () => (timer ? pause() : play()));
      play();
    } else {
      hint.textContent = 'לתרגיל הזה יש תמונה אחת';
    }
    stop = pause;
  }

  const close = () => {
    stop();
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVis);
    wrap.remove();
    document.body.classList.remove('player-open');
    closeCurrent = null;
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const onVis = () => { if (document.hidden) stop(); };

  const wrap = el('div', { class: 'player', role: 'dialog', 'aria-modal': 'true', 'aria-label': ex.name }, [
    el('div', { class: 'pl-top' }, [
      el('div', { class: 'grow' }, [
        el('h2', { class: 'pl-title', text: ex.name }),
        el('div', { class: 'tiny dim', text: MUSCLES[ex.muscle] || ex.muscle })
      ]),
      el('button', { class: 'pl-close', onclick: close, 'aria-label': 'סגור' }, [icon(ICONS.close, 22)])
    ]),
    stage,
    hint,
    ex.cue ? el('div', { class: 'prev-hint' }, [icon(ICONS.info, 15), el('span', { text: ex.cue })]) : null
  ]);

  document.body.appendChild(wrap);
  document.body.classList.add('player-open');
  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVis);

  closeCurrent = close;
  return close;
}
