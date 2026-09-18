/* ==========================================================================
   anatomy.js — original muscle-map illustration.
   A simplified front/back figure drawn as inline SVG: no image requests, no
   licensing questions, and it recolours instantly for any target muscle.
   Regions are keyed by the same muscle ids exercises.js uses.
   ========================================================================== */

const NS = 'http://www.w3.org/2000/svg';

/* One body, drawn in a local 90 × 192 box. `f` = front, `b` = back. */
function bodyShapes(view) {
  const mirror = (d, at = 45) => d; // shapes are declared per side explicitly

  const common = {
    head: { t: 'circle', a: { cx: 45, cy: 16, r: 11 } },
    neck: { t: 'path', a: { d: 'M39 25 h12 v9 h-12 z' } },
    pelvis: { t: 'path', a: { d: 'M33 88 h24 l2 15 h-28 z' } },
    knee_l: { t: 'ellipse', a: { cx: 37, cy: 143, rx: 7, ry: 5 } },
    knee_r: { t: 'ellipse', a: { cx: 53, cy: 143, rx: 7, ry: 5 } },
    foot_l: { t: 'path', a: { d: 'M31 180 h12 v8 h-14 z' } },
    foot_r: { t: 'path', a: { d: 'M47 180 h12 v8 h-14 z' } }
  };

  const muscles = view === 'front' ? {
    shoulders: [
      { t: 'ellipse', a: { cx: 24, cy: 41, rx: 9.5, ry: 8.5 } },
      { t: 'ellipse', a: { cx: 66, cy: 41, rx: 9.5, ry: 8.5 } }
    ],
    chest: [
      { t: 'path', a: { d: 'M44 35 v22 l-13 -4 q-4 -9 1 -17 z' } },
      { t: 'path', a: { d: 'M46 35 v22 l13 -4 q4 -9 -1 -17 z' } }
    ],
    biceps: [
      { t: 'ellipse', a: { cx: 19, cy: 61, rx: 6.5, ry: 13 } },
      { t: 'ellipse', a: { cx: 71, cy: 61, rx: 6.5, ry: 13 } }
    ],
    forearms: [
      { t: 'ellipse', a: { cx: 15, cy: 87, rx: 5.5, ry: 14 } },
      { t: 'ellipse', a: { cx: 75, cy: 87, rx: 5.5, ry: 14 } }
    ],
    abs: [
      { t: 'path', a: { d: 'M37 58 h16 v29 q-8 4 -16 0 z' } }
    ],
    core: [
      { t: 'path', a: { d: 'M37 58 h16 v29 q-8 4 -16 0 z' } },
      { t: 'path', a: { d: 'M30 57 l6 2 v26 l-6 -6 z' } },
      { t: 'path', a: { d: 'M60 57 l-6 2 v26 l6 -6 z' } }
    ],
    hipflexors: [
      { t: 'path', a: { d: 'M34 90 l10 3 l-3 16 l-9 -6 z' } },
      { t: 'path', a: { d: 'M56 90 l-10 3 l3 16 l9 -6 z' } }
    ],
    quads: [
      { t: 'ellipse', a: { cx: 37, cy: 122, rx: 9.5, ry: 23 } },
      { t: 'ellipse', a: { cx: 53, cy: 122, rx: 9.5, ry: 23 } }
    ],
    calves: [
      { t: 'ellipse', a: { cx: 36, cy: 163, rx: 6.5, ry: 16 } },
      { t: 'ellipse', a: { cx: 54, cy: 163, rx: 6.5, ry: 16 } }
    ]
  } : {
    traps: [
      { t: 'path', a: { d: 'M45 30 l18 10 l-6 16 h-24 l-6 -16 z' } }
    ],
    shoulders: [
      { t: 'ellipse', a: { cx: 24, cy: 41, rx: 9.5, ry: 8.5 } },
      { t: 'ellipse', a: { cx: 66, cy: 41, rx: 9.5, ry: 8.5 } }
    ],
    lats: [
      { t: 'path', a: { d: 'M32 48 l11 6 v26 l-13 -8 q-4 -13 2 -24 z' } },
      { t: 'path', a: { d: 'M58 48 l-11 6 v26 l13 -8 q4 -13 -2 -24 z' } }
    ],
    back: [
      { t: 'path', a: { d: 'M32 48 l11 6 v26 l-13 -8 q-4 -13 2 -24 z' } },
      { t: 'path', a: { d: 'M58 48 l-11 6 v26 l13 -8 q4 -13 -2 -24 z' } },
      { t: 'path', a: { d: 'M45 30 l18 10 l-6 16 h-24 l-6 -16 z' } }
    ],
    spine: [
      { t: 'path', a: { d: 'M41 56 h8 v32 h-8 z' } }
    ],
    triceps: [
      { t: 'ellipse', a: { cx: 19, cy: 61, rx: 6.5, ry: 13 } },
      { t: 'ellipse', a: { cx: 71, cy: 61, rx: 6.5, ry: 13 } }
    ],
    forearms: [
      { t: 'ellipse', a: { cx: 15, cy: 87, rx: 5.5, ry: 14 } },
      { t: 'ellipse', a: { cx: 75, cy: 87, rx: 5.5, ry: 14 } }
    ],
    glutes: [
      { t: 'path', a: { d: 'M45 90 q-14 0 -13 11 q1 9 13 9 z' } },
      { t: 'path', a: { d: 'M45 90 q14 0 13 11 q-1 9 -13 9 z' } }
    ],
    hamstrings: [
      { t: 'ellipse', a: { cx: 37, cy: 124, rx: 9, ry: 21 } },
      { t: 'ellipse', a: { cx: 53, cy: 124, rx: 9, ry: 21 } }
    ],
    calves: [
      { t: 'ellipse', a: { cx: 36, cy: 163, rx: 6.5, ry: 16 } },
      { t: 'ellipse', a: { cx: 54, cy: 163, rx: 6.5, ry: 16 } }
    ]
  };

  return { common, muscles, mirror };
}

function draw(doc, spec, cls) {
  const node = document.createElementNS(NS, spec.t);
  for (const [k, v] of Object.entries(spec.a)) node.setAttribute(k, v);
  if (cls) node.setAttribute('class', cls);
  return node;
}

/**
 * Build the muscle map.
 * @param {string[]} primary    muscle ids to paint as the main target
 * @param {string[]} secondary  muscle ids to paint as supporting
 * @param {object} opts
 * @returns {SVGElement}
 */
export function muscleMap(primary = [], secondary = [], { width = 200, labels = true } = {}) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 196 210');
  svg.setAttribute('width', width);
  svg.setAttribute('height', Math.round((width * 210) / 196));
  svg.setAttribute('class', 'muscle-map');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'מפת שרירים');

  const prim = new Set(primary.filter(Boolean));
  const sec = new Set(secondary.filter(Boolean));

  [['front', 2], ['back', 104]].forEach(([view, dx]) => {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('transform', `translate(${dx},4)`);

    const { common, muscles } = bodyShapes(view);

    /* base silhouette */
    Object.values(common).forEach((s) => g.appendChild(draw(document, s, 'mm-base')));
    Object.entries(muscles).forEach(([, shapes]) => {
      shapes.forEach((s) => g.appendChild(draw(document, s, 'mm-base')));
    });

    /* highlights on top */
    Object.entries(muscles).forEach(([muscle, shapes]) => {
      const cls = prim.has(muscle) ? 'mm-primary' : sec.has(muscle) ? 'mm-secondary' : null;
      if (!cls) return;
      shapes.forEach((s) => g.appendChild(draw(document, s, cls)));
    });

    if (labels) {
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('x', 45);
      t.setAttribute('y', 205);
      t.setAttribute('class', 'mm-label');
      t.setAttribute('text-anchor', 'middle');
      t.textContent = view === 'front' ? 'קדמי' : 'אחורי';
      g.appendChild(t);
    }

    svg.appendChild(g);
  });

  return svg;
}

/** Muscle ids an exercise trains, ready for muscleMap(). */
export function musclesFor(exercise) {
  if (!exercise) return { primary: [], secondary: [] };
  const alias = { lats: ['lats', 'back'], back: ['back'], abs: ['abs'], core: ['core'] };
  const expand = (m) => alias[m] || [m];
  return {
    primary: expand(exercise.muscle),
    secondary: (exercise.secondary || []).flatMap(expand)
  };
}
