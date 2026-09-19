/* ==========================================================================
   player.js — the movement demo, large.
   One thing only: the exercise, looping, big enough to study. Tap to hold the
   position, tap to resume, close.
   ========================================================================== */

import { el, icon, ICONS } from './ui.js';
import { getExercise, MUSCLES, CATEGORIES } from './exercises.js';
import { exerciseDemo } from './media.js';

let closeCurrent = null;

/** Open the looping demo for an exercise. Returns a close function. */
export function openPlayer(id) {
  const ex = getExercise(id);
  if (!ex) return () => {};
  closeCurrent?.();

  const fig = exerciseDemo(ex, { period: 3000 });
  const stage = el('div', { class: 'pl-stage' }, [fig.node]);
  const hint = el('div', { class: 'pl-hint', text: 'הקש כדי לעצור' });

  stage.addEventListener('click', () => {
    if (fig.isRunning()) {
      fig.pause();
      stage.classList.add('paused');
      hint.textContent = 'הקש כדי להמשיך';
    } else {
      fig.play();
      stage.classList.remove('paused');
      hint.textContent = 'הקש כדי לעצור';
    }
  });

  const close = () => {
    fig.stop();
    document.removeEventListener('keydown', onKey);
    wrap.remove();
    document.body.classList.remove('player-open');
    closeCurrent = null;
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };

  const wrap = el('div', { class: 'player', role: 'dialog', 'aria-modal': 'true', 'aria-label': ex.name }, [
    el('div', { class: 'pl-top' }, [
      el('div', { class: 'grow' }, [
        el('h2', { class: 'pl-title', text: ex.name }),
        el('div', { class: 'tiny dim', text: `${MUSCLES[ex.muscle] || ex.muscle} · ${CATEGORIES[ex.cat]}` })
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

  closeCurrent = close;
  return close;
}
