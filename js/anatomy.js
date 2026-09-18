/* ==========================================================================
   anatomy.js — anatomical muscle map.
   Draws a real muscular figure (front and back) and lights up the muscles an
   exercise works. The outlines come from an MIT-licensed anatomical dataset
   (see body-paths.js); everything else here is ours.
   ========================================================================== */

import { BODY_FRONT, BODY_BACK, FRONT_VIEWBOX, BACK_VIEWBOX } from './body-paths.js';

const NS = 'http://www.w3.org/2000/svg';

/** Our muscle ids → the parts of the anatomical figure that should light up. */
const MUSCLE_PARTS = {
  chest: ['chest'],
  shoulders: ['deltoids'],
  triceps: ['triceps'],
  biceps: ['biceps'],
  forearms: ['forearm'],
  back: ['upper-back', 'lower-back'],
  lats: ['upper-back'],
  traps: ['trapezius'],
  quads: ['quadriceps'],
  hamstrings: ['hamstring'],
  glutes: ['gluteal'],
  calves: ['calves'],
  abs: ['abs'],
  core: ['abs', 'obliques'],
  hipflexors: ['quadriceps', 'adductors'],
  spine: ['lower-back']
};

/* Drawn first, in flat grey, so the figure reads as a body rather than a
   floating set of muscles. */
const SILHOUETTE = ['head', 'neck', 'hands', 'feet', 'ankles', 'knees', 'tibialis'];

const node = (name, attrs = {}) => {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

function drawBody(parts, viewBox, highlight) {
  const [vx, vy, vw, vh] = viewBox;
  const g = node('g');

  const layer = (slug, cls) => {
    const paths = parts[slug];
    if (!paths) return;
    paths.forEach((d) => g.appendChild(node('path', { d, class: cls })));
  };

  /* base body first, then muscles, then the highlighted ones on top */
  SILHOUETTE.forEach((s) => layer(s, 'mm-skin'));
  Object.keys(parts).forEach((s) => {
    if (SILHOUETTE.includes(s) || s === 'hair') return;
    layer(s, 'mm-muscle');
  });
  Object.entries(highlight).forEach(([slug, level]) => {
    layer(slug, level === 'primary' ? 'mm-primary' : 'mm-secondary');
  });

  return { g, viewBox: `${vx} ${vy} ${vw} ${vh}` };
}

/** Which anatomical parts each side should highlight, and at what strength. */
function resolve(primary = [], secondary = []) {
  const out = {};
  secondary.filter(Boolean).forEach((m) => {
    (MUSCLE_PARTS[m] || []).forEach((p) => { out[p] = 'secondary'; });
  });
  primary.filter(Boolean).forEach((m) => {
    (MUSCLE_PARTS[m] || []).forEach((p) => { out[p] = 'primary'; });
  });
  return out;
}

/**
 * Build the muscle map: front and back side by side.
 * @param {string[]} primary    muscle ids worked as the main target
 * @param {string[]} secondary  supporting muscle ids
 */
export function muscleMap(primary = [], secondary = [], { labels = true } = {}) {
  const highlight = resolve(primary, secondary);

  const wrap = document.createElement('div');
  wrap.className = 'muscle-map';

  [[BODY_FRONT, FRONT_VIEWBOX, 'קדמי'], [BODY_BACK, BACK_VIEWBOX, 'אחורי']].forEach(([parts, vb, label]) => {
    const { g, viewBox } = drawBody(parts, vb, highlight);
    const svg = node('svg', {
      viewBox,
      class: 'mm-figure',
      role: 'img',
      'aria-label': `שרירים פעילים — מבט ${label}`,
      preserveAspectRatio: 'xMidYMid meet'
    });
    svg.appendChild(g);

    const cell = document.createElement('div');
    cell.className = 'mm-cell';
    cell.appendChild(svg);
    if (labels) {
      const cap = document.createElement('span');
      cap.className = 'mm-caption';
      cap.textContent = label;
      cell.appendChild(cap);
    }
    wrap.appendChild(cell);
  });

  return wrap;
}

/** Muscle ids an exercise trains, ready for muscleMap(). */
export function musclesFor(exercise) {
  if (!exercise) return { primary: [], secondary: [] };
  return {
    primary: [exercise.muscle],
    secondary: exercise.secondary || []
  };
}
