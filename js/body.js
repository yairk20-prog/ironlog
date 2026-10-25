/* ==========================================================================
   body.js — body types: the picture you pick, and what it tells the plan.

   Weight and height alone can't tell a muscular 90 kg from a soft 90 kg —
   BMI calls them the same. A picture can: people are surprisingly good at
   pointing to the shape that looks like them, and that is enough to place
   body fat within a few percent, which is what the protein target and the
   cardio emphasis actually need.

   The figures are drawn, not photographed — a neutral, consistent set that
   differs only in the thing being asked about. Each is one smooth contour
   generated from a handful of widths (shoulders, waist, hips, thighs), so
   the five types read as one family.
   ========================================================================== */

export const BODY_TYPES = [
  { id: 0, name: 'רזה', desc: 'מעט שומן ומעט מסה', bf: { male: 10, female: 18 }, range: { male: '8–12%', female: '16–20%' } },
  { id: 1, name: 'חטוב', desc: 'קווי שריר נראים, בטן שטוחה', bf: { male: 14, female: 22 }, range: { male: '12–16%', female: '20–24%' } },
  { id: 2, name: 'ממוצע', desc: 'מעט שומן סביב הבטן', bf: { male: 20, female: 28 }, range: { male: '17–23%', female: '25–31%' } },
  { id: 3, name: 'מעט עודף', desc: 'בטן רכה, מותניים רחבים', bf: { male: 27, female: 35 }, range: { male: '24–30%', female: '32–38%' } },
  { id: 4, name: 'עודף משקל', desc: 'מותניים רחבים כמו הכתפיים', bf: { male: 35, female: 43 }, range: { male: '31%+', female: '39%+' } }
];

/** Goals worth suggesting for a body type, before the user picks their own. */
export const SUGGESTED_GOALS = [
  ['hypertrophy'],
  ['hypertrophy'],
  ['hypertrophy'],
  ['cut', 'hypertrophy'],
  ['lose']
];

const sexKey = (sex) => (sex === 'female' ? 'female' : 'male');

/* ---------- the figures ---------- */

/* Half-widths from the body's centre line, per type. S shoulder, C chest
   under the arm, W waist, H hip, T upper thigh, K knee, F calf, A arm. */
const SHAPES = {
  male: [
    { S: 19, C: 15, W: 12.5, H: 14.5, T: 12, K: 8, F: 8.4, A: 4.6, def: 0.35, belly: 0, head: 9 },
    { S: 23.5, C: 19, W: 13.5, H: 15.5, T: 14.5, K: 9.4, F: 10, A: 6.6, def: 1, belly: 0, head: 9 },
    { S: 21.5, C: 18.5, W: 16, H: 17, T: 15, K: 9.6, F: 9.8, A: 6, def: 0.12, belly: 0.3, head: 9.4 },
    { S: 22, C: 20.5, W: 19.5, H: 19.5, T: 17, K: 10.6, F: 10.6, A: 7.1, def: 0, belly: 0.65, head: 9.9 },
    { S: 23, C: 22.5, W: 24, H: 23, T: 19.5, K: 11.6, F: 11.6, A: 8.3, def: 0, belly: 1, head: 10.5 }
  ],
  female: [
    { S: 16, C: 13.8, W: 10.4, H: 17, T: 15.2, K: 7.8, F: 8, A: 4, def: 0.2, belly: 0, bust: 0.35, head: 8.6 },
    { S: 17.5, C: 15.2, W: 11.4, H: 18.8, T: 16.9, K: 8.8, F: 9.2, A: 4.8, def: 0.6, belly: 0, bust: 0.55, head: 8.6 },
    { S: 18, C: 16.6, W: 13.6, H: 20.5, T: 18.6, K: 9.4, F: 9.6, A: 5.4, def: 0, belly: 0.25, bust: 0.75, head: 8.9 },
    { S: 19, C: 18.4, W: 16.8, H: 22.6, T: 20.6, K: 10.5, F: 10.5, A: 6.4, def: 0, belly: 0.55, bust: 0.9, head: 9.3 },
    { S: 20, C: 20.8, W: 21, H: 25, T: 23, K: 11.6, F: 11.6, A: 7.8, def: 0, belly: 0.9, bust: 1, head: 9.8 }
  ]
};

const X0 = 60;

/** Closed Catmull-Rom spline through the points, as an SVG path. */
function smooth(pts) {
  const n = pts.length;
  const p = (i) => pts[(i + n) % n];
  let d = `M${p(0)[0].toFixed(1)} ${p(0)[1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = p(i - 1);
    const [x1, y1] = p(i);
    const [x2, y2] = p(i + 1);
    const [x3, y3] = p(i + 2);
    const c1 = [x1 + (x2 - x0) / 6, y1 + (y2 - y0) / 6];
    const c2 = [x2 - (x3 - x1) / 6, y2 - (y3 - y1) / 6];
    d += `C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  }
  return `${d}Z`;
}

/** Right half of a contour → the full, symmetric contour. A point on the
    centre line belongs to both halves, so it is only emitted once. */
const mirror = (half) => [
  ...half.map(([x, y]) => [X0 + x, y]),
  ...half.slice().reverse().filter(([x]) => x !== 0).map(([x, y]) => [X0 - x, y])
];

function torso(s, female) {
  const bellyY = 92 + s.belly * 3;
  return mirror([
    [4.4 + s.belly * 0.8, 27],
    [5 + s.belly * 1, 32],
    [s.S * 0.58, 35.5],
    [s.S - 2, 39.5],
    [s.C + (female ? 0.6 * (s.bust || 0) : 0.4), 52],
    [s.C - (female ? 1.6 : 0.6) + s.belly * 0.8, 66],
    [s.W, 82],
    [s.W + s.belly * 1.4, bellyY],
    [s.H, 104],
    [s.T + 0.4, 118],
    [s.T - 2.4, 134],
    [s.K, 150],
    [s.F, 166],
    [s.F - 3.2, 184],
    [5, 197],
    [6.6, 204],
    [1.8, 206],
    [2.2, 197],
    [2.9, 184],
    [3.2, 166],
    [2.6, 150],
    [2.4, 132],
    [1.4, 118],
    [0, 113]
  ]);
}

/* Arms hang slightly away from the body, always clear of the waist and
   hips — an arm resting on a wide waist merges into it and the figure
   stops reading as a body. */
function arm(s, side) {
  const sx = (x) => X0 + side * x;
  const A = s.A;
  const iA = s.S - 1;                                   // armpit
  const iE = Math.max(s.S + 1.2, s.W + s.belly * 1.4 + 2.4); // inner elbow
  const iW = Math.max(iE + 2.2, s.H + 2.6);             // inner wrist
  const pts = [
    [s.S - 3.2, 37.5],
    [s.S + A * 0.5, 41.5],
    [iA + A + 0.6, 52],
    [iE + A * 0.8, 80],
    [iW + A * 0.6, 103],
    [iW + A * 0.6 + 0.9, 112],
    [iW + A * 0.32, 120],
    [iW - 0.4, 112],
    [iW, 103],
    [iE, 80],
    [iA, 53],
    [s.S - 4, 45]
  ];
  return smooth(pts.map(([x, y]) => [sx(x), y]));
}

/**
 * One body-type figure as SVG markup. Colour comes from CSS `color`, so a
 * selected tile can recolour its figure without redrawing it.
 */
export function silhouette(type, sex = 'male') {
  const female = sexKey(sex) === 'female';
  const s = SHAPES[female ? 'female' : 'male'][type] || SHAPES.male[2];
  const uid = `bt${female ? 'f' : 'm'}${type}`;
  const body = smooth(torso(s, female));
  const arms = arm(s, 1) + arm(s, -1);
  const hr = s.head;

  const details = [];
  if (s.def > 0) {
    const o = s.def.toFixed(2);
    details.push(`<g opacity="${o}">`);
    if (!female) {
      details.push(`<path d="M${X0 - s.C + 4} 58 Q${X0 - 6} 64 ${X0} 60 Q${X0 + 6} 64 ${X0 + s.C - 4} 58"/>`);
    }
    details.push(`<path d="M${X0} 65 V91" opacity=".7"/>`);
    [71, 78, 85].forEach((y) => details.push(
      `<path opacity=".55" d="M${X0 - 5.5} ${y - 1} Q${X0 - 2.6} ${y + 1.2} ${X0} ${y} Q${X0 + 2.6} ${y + 1.2} ${X0 + 5.5} ${y - 1}"/>`
    ));
    details.push(`<path opacity=".6" d="M${X0 - s.W + 2.5} 97 Q${X0 - 4} 103 ${X0 - 1} 108 M${X0 + s.W - 2.5} 97 Q${X0 + 4} 103 ${X0 + 1} 108"/>`);
    details.push('</g>');
  }
  if (female && s.bust) {
    const w = 6 + s.bust * 3;
    details.push(`<path opacity="${(0.35 + s.bust * 0.4).toFixed(2)}" d="M${X0 - 2} 63 Q${X0 - w} ${64 + s.bust * 3} ${X0 - w - 4} 56 M${X0 + 2} 63 Q${X0 + w} ${64 + s.bust * 3} ${X0 + w + 4} 56"/>`);
  }
  if (s.belly > 0.2) {
    const y = 96 + s.belly * 3;
    const w = s.W * 0.78;
    details.push(`<path opacity="${(0.25 + s.belly * 0.45).toFixed(2)}" d="M${X0 - w} ${y - 3} Q${X0} ${y + 4 + s.belly * 3} ${X0 + w} ${y - 3}"/>`);
  }
  details.push(`<circle cx="${X0}" cy="${86 + s.belly * 3}" r="0.9" fill="currentColor" stroke="none" opacity=".55"/>`);

  const hair = female
    ? `<path fill="currentColor" opacity=".55" d="M${X0 - hr - 1.6} 15 Q${X0 - hr - 3.5} 32 ${X0 - hr + 0.5} 43 Q${X0} 46 ${X0 + hr - 0.5} 43 Q${X0 + hr + 3.5} 32 ${X0 + hr + 1.6} 15 Q${X0} -3 ${X0 - hr - 1.6} 15Z"/>`
    : '';

  return `<svg class="bt-fig" viewBox="0 0 120 212" aria-hidden="true">
  <defs><linearGradient id="${uid}" x1="0" x2="1" y1="0" y2="0">
    <stop offset="0" stop-color="#000" stop-opacity=".42"/>
    <stop offset=".32" stop-color="#000" stop-opacity="0"/>
    <stop offset=".68" stop-color="#000" stop-opacity="0"/>
    <stop offset="1" stop-color="#000" stop-opacity=".42"/>
  </linearGradient></defs>
  ${hair}
  <g fill="currentColor">
    <path d="${arms}"/>
    <path d="${body}"/>
    <ellipse cx="${X0}" cy="16" rx="${hr}" ry="${hr * 1.17}"/>
  </g>
  <g fill="url(#${uid})">
    <path d="${arms}"/>
    <path d="${body}"/>
  </g>
  <g class="bt-lines" fill="none" stroke="#000" stroke-width="1.1" stroke-linecap="round">${details.join('')}</g>
</svg>`;
}

/* ---------- what it tells the maths ---------- */

/**
 * Body fat %, from the picked body type when there is one, otherwise from
 * BMI, age and sex (Deurenberg et al., 1991). The picture wins because BMI
 * can't see muscle — it rates a heavy lifter the same as a heavy sitter.
 */
export function bodyFatPct(p) {
  const female = sexKey(p.sex) === 'female';
  if (p.bodyType != null && BODY_TYPES[p.bodyType]) {
    const bt = BODY_TYPES[p.bodyType].bf;
    return p.sex === 'other' ? (bt.male + bt.female) / 2 : bt[female ? 'female' : 'male'];
  }
  const h = (p.height || 175) / 100;
  const bmi = (p.bodyweight || 75) / (h * h);
  const sexTerm = p.sex === 'other' ? 5.4 : female ? 0 : 10.8;
  const est = 1.2 * bmi + 0.23 * (p.age || 30) - sexTerm - 5.4;
  return Math.min(50, Math.max(6, Math.round(est * 10) / 10));
}

export const leanMass = (p) => (p.bodyweight || 75) * (1 - bodyFatPct(p) / 100);
