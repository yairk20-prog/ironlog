/* ==========================================================================
   figure.js — the exercise demonstration, drawn rather than filmed.

   Exercise footage cannot be licensed from here, and morphing two
   photographs only ever looks like two photographs arguing. So the demo is an
   articulated figure: a side-view kinematic chain posed by joint angles, with
   a start pose and an end pose per movement pattern, interpolated every frame.

   It is drawn, so it is sharp at any size, weighs nothing, recolours with the
   theme, and — the point — actually shows the movement: the bar path, the
   hinge at the hip, which joint is doing the work.

   Angles are degrees in screen space, 0° pointing straight down, positive
   turning anticlockwise. A limb is a chain: each segment starts where the
   previous one ended.
   ========================================================================== */

const NS = 'http://www.w3.org/2000/svg';

/* Proportions in figure units; the viewBox is 100 wide and 120 tall. */
const BODY = {
  neck: 7, head: 7.6,
  torso: 30, upperArm: 17, foreArm: 16,
  thigh: 20, shin: 19, foot: 8
};

/**
 * A pose is the angle of each segment plus where the hips sit.
 * `grip` is where the hands are relative to the body, derived from the arm
 * chain, so the load is always drawn in the hands rather than guessed at.
 */
const BASE = {
  hip: [50, 66],
  torso: 180,      // straight up
  upperArm: 175,
  foreArm: 175,
  thigh: 5,
  shin: 0,
  foot: 90
};

const pose = (over) => ({ ...BASE, ...over });

/* ---------- the movements ----------
   Each entry: two poses, the equipment in the hands, and the prop under the
   body. Written as the lifter is seen from their left side, facing right. */
const MOVES = {
  horiz_push: {
    prop: 'bench', load: 'bar', lying: true,
    a: pose({ hip: [46, 74], torso: 90, upperArm: 168, foreArm: 250, thigh: 44, shin: 96, foot: 150 }),
    b: pose({ hip: [46, 74], torso: 90, upperArm: 178, foreArm: 182, thigh: 44, shin: 96, foot: 150 })
  },
  incline_push: {
    prop: 'incline', load: 'db', lying: true,
    a: pose({ hip: [42, 78], torso: 118, upperArm: 150, foreArm: 232, thigh: 60, shin: 104, foot: 150 }),
    b: pose({ hip: [42, 78], torso: 118, upperArm: 168, foreArm: 168, thigh: 60, shin: 104, foot: 150 })
  },
  chest_fly: {
    prop: 'bench', load: 'db', lying: true,
    a: pose({ hip: [46, 74], torso: 90, upperArm: 120, foreArm: 150, thigh: 44, shin: 96, foot: 150 }),
    b: pose({ hip: [46, 74], torso: 90, upperArm: 176, foreArm: 186, thigh: 44, shin: 96, foot: 150 })
  },
  vert_push: {
    prop: 'none', load: 'bar',
    a: pose({ upperArm: 236, foreArm: 130 }),
    b: pose({ upperArm: 188, foreArm: 186 })
  },
  lateral_raise: {
    prop: 'none', load: 'db',
    a: pose({ upperArm: 172, foreArm: 172 }),
    b: pose({ upperArm: 96, foreArm: 92 })
  },
  horiz_pull: {
    prop: 'none', load: 'bar',
    a: pose({ hip: [50, 60], torso: 214, upperArm: 172, foreArm: 176, thigh: 12, shin: 2, foot: 90 }),
    b: pose({ hip: [50, 60], torso: 214, upperArm: 214, foreArm: 268, thigh: 12, shin: 2, foot: 90 })
  },
  vert_pull: {
    prop: 'bar-above', load: 'none',
    a: pose({ hip: [50, 82], torso: 184, upperArm: 188, foreArm: 186, thigh: 30, shin: 352, foot: 76 }),
    b: pose({ hip: [50, 64], torso: 184, upperArm: 214, foreArm: 274, thigh: 30, shin: 352, foot: 76 })
  },
  lat_iso: {
    prop: 'cable-high', load: 'bar',
    a: pose({ torso: 194, upperArm: 214, foreArm: 212 }),
    b: pose({ torso: 194, upperArm: 172, foreArm: 172 })
  },
  squat: {
    prop: 'none', load: 'bar-back',
    a: pose({ hip: [50, 58], torso: 182, thigh: 4, shin: 2, foot: 90, upperArm: 214, foreArm: 262 }),
    b: pose({ hip: [46, 80], torso: 206, thigh: 82, shin: 342, foot: 90, upperArm: 214, foreArm: 262 })
  },
  lunge: {
    prop: 'none', load: 'db',
    a: pose({ hip: [50, 62], torso: 184, thigh: 10, shin: 2, foot: 90 }),
    b: pose({ hip: [50, 80], torso: 190, thigh: 62, shin: 340, foot: 90 })
  },
  hinge: {
    prop: 'none', load: 'bar',
    a: pose({ hip: [50, 62], torso: 184, thigh: 8, shin: 2, foot: 90, upperArm: 176, foreArm: 178 }),
    b: pose({ hip: [50, 66], torso: 250, thigh: 22, shin: 350, foot: 90, upperArm: 176, foreArm: 178 })
  },
  knee_ext: {
    prop: 'seat', load: 'pad-shin', seated: true,
    a: pose({ hip: [44, 70], torso: 186, thigh: 88, shin: 8, foot: 74 }),
    b: pose({ hip: [44, 70], torso: 186, thigh: 88, shin: 88, foot: 96 })
  },
  knee_flex: {
    prop: 'seat', load: 'pad-shin', seated: true,
    a: pose({ hip: [44, 70], torso: 186, thigh: 88, shin: 86, foot: 96 }),
    b: pose({ hip: [44, 70], torso: 186, thigh: 88, shin: 10, foot: 70 })
  },
  hip_ext: {
    prop: 'bench-low', load: 'bar-hip', lying: true,
    a: pose({ hip: [50, 84], torso: 118, thigh: 58, shin: 348, foot: 76, upperArm: 150, foreArm: 168 }),
    b: pose({ hip: [50, 70], torso: 96, thigh: 76, shin: 348, foot: 76, upperArm: 150, foreArm: 168 })
  },
  hip_abd: {
    prop: 'seat', load: 'none', seated: true,
    /* Abduction happens across the body, which a side view cannot show, so it
       is drawn as the knee travelling out and the shin following. */
    a: pose({ hip: [44, 70], torso: 186, thigh: 92, shin: 16, foot: 74 }),
    b: pose({ hip: [44, 70], torso: 186, thigh: 58, shin: 340, foot: 74 })
  },
  elbow_flex: {
    prop: 'none', load: 'db',
    a: pose({ upperArm: 176, foreArm: 178 }),
    b: pose({ upperArm: 168, foreArm: 268 })
  },
  tri_ext: {
    prop: 'cable-high', load: 'bar',
    a: pose({ upperArm: 172, foreArm: 244 }),
    b: pose({ upperArm: 172, foreArm: 176 })
  },
  rear_delt: {
    prop: 'none', load: 'db',
    a: pose({ torso: 216, upperArm: 178, foreArm: 176, thigh: 16, shin: 356 }),
    b: pose({ torso: 216, upperArm: 112, foreArm: 108, thigh: 16, shin: 356 })
  },
  shrug: {
    prop: 'none', load: 'db',
    /* The travel is small in life; drawn small it reads as nothing at all, so
       the shoulders lift further than they would. */
    a: pose({ torso: 180, upperArm: 178, foreArm: 178 }),
    b: pose({ hip: [50, 60], torso: 180, upperArm: 178, foreArm: 178 })
  },
  calf: {
    prop: 'step', load: 'none',
    a: pose({ hip: [50, 68], foot: 92 }),
    b: pose({ hip: [50, 54], foot: 142 })
  },
  ab_flex: {
    prop: 'mat', load: 'none', lying: true,
    a: pose({ hip: [52, 88], torso: 96, thigh: 88, shin: 92, foot: 130, upperArm: 150, foreArm: 158 }),
    b: pose({ hip: [52, 88], torso: 96, thigh: 30, shin: 20, foot: 110, upperArm: 150, foreArm: 158 })
  },
  ab_brace: {
    prop: 'mat', load: 'none', lying: true,
    a: pose({ hip: [50, 86], torso: 74, thigh: 100, shin: 96, foot: 140, upperArm: 130, foreArm: 210 }),
    b: pose({ hip: [50, 82], torso: 74, thigh: 100, shin: 96, foot: 140, upperArm: 130, foreArm: 210 })
  },
  mobility: {
    prop: 'mat', load: 'none',
    a: pose({ hip: [50, 70], torso: 190, thigh: 40, shin: 10, foot: 96, upperArm: 178, foreArm: 178 }),
    b: pose({ hip: [50, 70], torso: 214, thigh: 62, shin: 350, foot: 96, upperArm: 206, foreArm: 206 })
  }
};

const FALLBACK = MOVES.elbow_flex;

/* ---------- geometry ---------- */

const rad = (deg) => (deg * Math.PI) / 180;

/** Walk a chain of segments from a point, returning every joint. */
function chain(start, segments) {
  const pts = [start];
  let [x, y] = start;
  for (const [angle, length] of segments) {
    x += Math.sin(rad(angle)) * length;
    y += Math.cos(rad(angle)) * length;
    pts.push([x, y]);
  }
  return pts;
}

const lerp = (a, b, t) => a + (b - a) * t;

function blend(a, b, t) {
  const out = {};
  for (const k of Object.keys(a)) {
    out[k] = Array.isArray(a[k])
      ? a[k].map((v, i) => lerp(v, b[k][i], t))
      : lerp(a[k], b[k], t);
  }
  return out;
}

/** Everything the renderer needs for one frame. */
function skeleton(p) {
  const hip = p.hip;
  const spine = chain(hip, [[p.torso, BODY.torso]]);
  const shoulder = spine[1];
  const neck = chain(shoulder, [[p.torso, BODY.neck]])[1];
  const head = chain(shoulder, [[p.torso, BODY.neck + BODY.head * 0.95]])[1];
  const arm = chain(shoulder, [[p.upperArm, BODY.upperArm], [p.foreArm, BODY.foreArm]]);
  const leg = chain(hip, [[p.thigh, BODY.thigh], [p.shin, BODY.shin], [p.foot, BODY.foot]]);
  /* The head leans with the spine, which is most of what makes a lying or
     hinged figure look like a person rather than a mannequin. */
  const tilt = 180 - p.torso;
  return { hip, shoulder, neck, head, tilt, spine, arm, leg, hand: arm[2], knee: leg[1], ankle: leg[2] };
}

/* ---------- drawing ----------
   Limbs are solid tapered shapes rather than strokes, so the figure has bulk:
   a quadrilateral between two joints, narrowing along its length, with a disc
   at each joint so the corners read as a shoulder or a knee instead of a
   mitre. Every shape is drawn twice — once offset and darkened underneath for
   the far side of the body, once on top — which is what makes a flat drawing
   look like it has a front and a back. */

const path = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');

const n = (v) => v.toFixed(1);

/** Widths of each segment at its start and end, in figure units. */
const GIRTH = {
  torso: [12, 17],
  upperArm: [7.4, 6.2],
  foreArm: [6, 4.4],
  thigh: [11.5, 8],
  shin: [8, 5.4],
  foot: [5, 3.4]
};

/** A tapered slab from a to b, plus the joint discs that round it off. */
function limb(a, b, w1, w2) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const h1 = w1 / 2;
  const h2 = w2 / 2;
  const quad = `M${n(a[0] + nx * h1)} ${n(a[1] + ny * h1)}`
    + ` L${n(b[0] + nx * h2)} ${n(b[1] + ny * h2)}`
    + ` L${n(b[0] - nx * h2)} ${n(b[1] - ny * h2)}`
    + ` L${n(a[0] - nx * h1)} ${n(a[1] - ny * h1)} Z`;
  return { quad, caps: [[a, h1], [b, h2]] };
}

/** One body part: the slab and its joints, as a single path plus circles. */
function part(cls, a, b, w1, w2, extra = '') {
  const { quad, caps } = limb(a, b, w1, w2);
  const discs = caps.map(([c, r]) => `<circle class="${cls}" cx="${n(c[0])}" cy="${n(c[1])}" r="${n(r)}"${extra}/>`).join('');
  return `<path class="${cls}" d="${quad}"${extra}/>${discs}`;
}

/**
 * Where the working muscle sits: a segment, how far along it, and how big a
 * belly to draw. Drawn as an ellipse turned to lie along the limb, because a
 * muscle follows the bone rather than sitting on it as a dot.
 */
const HIGHLIGHT = {
  chest: (s) => [s.hip, s.shoulder, 0.74, 9, 6.5],
  shoulders: (s) => [s.shoulder, s.arm[1], 0.08, 6.6, 6],
  triceps: (s) => [s.shoulder, s.arm[1], 0.52, 6.4, 4.6],
  biceps: (s) => [s.shoulder, s.arm[1], 0.55, 6.4, 4.6],
  forearms: (s) => [s.arm[1], s.hand, 0.45, 5.6, 3.8],
  back: (s) => [s.hip, s.shoulder, 0.62, 9.5, 6.6],
  lats: (s) => [s.hip, s.shoulder, 0.68, 9.5, 6.4],
  traps: (s) => [s.shoulder, s.neck, 0.5, 5.6, 4.6],
  quads: (s) => [s.hip, s.knee, 0.5, 8.5, 6],
  hamstrings: (s) => [s.hip, s.knee, 0.55, 8.5, 6],
  glutes: (s) => [s.hip, s.knee, 0.1, 7.6, 6.6],
  calves: (s) => [s.knee, s.ankle, 0.4, 6.6, 4.4],
  abs: (s) => [s.hip, s.shoulder, 0.34, 8.5, 6],
  core: (s) => [s.hip, s.shoulder, 0.34, 8.5, 6],
  hipflexors: (s) => [s.hip, s.knee, 0.24, 7, 5.4],
  spine: (s) => [s.hip, s.shoulder, 0.46, 9, 6]
};

const mid = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

function workedMuscle(s, muscle) {
  const spec = HIGHLIGHT[muscle]?.(s);
  if (!spec) return '';
  const [a, b, at, along, across] = spec;
  const c = mid(a, b, at);
  const deg = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  return `<ellipse class="fg-work" cx="${n(c[0])}" cy="${n(c[1])}" rx="${n(along)}" ry="${n(across)}"`
    + ` transform="rotate(${deg.toFixed(1)} ${n(c[0])} ${n(c[1])})"/>`;
}

function drawProp(kind, s) {
  switch (kind) {
    case 'bench':
      return `<rect class="fg-prop" x="20" y="80" width="62" height="6"/>
              <rect class="fg-prop" x="26" y="86" width="5" height="26"/>
              <rect class="fg-prop" x="71" y="86" width="5" height="26"/>`;
    case 'bench-low':
      return `<rect class="fg-prop" x="14" y="62" width="34" height="6"/>`;
    case 'incline':
      return `<path class="fg-prop" d="M22 112 L30 74 L58 88 L44 112 Z"/>`;
    case 'seat':
      return `<rect class="fg-prop" x="22" y="78" width="38" height="6"/>
              <rect class="fg-prop" x="22" y="46" width="6" height="34"/>
              <rect class="fg-prop" x="36" y="84" width="6" height="28"/>`;
    case 'mat':
      return `<rect class="fg-prop" x="8" y="108" width="84" height="5"/>`;
    case 'step':
      return `<rect class="fg-prop" x="30" y="108" width="40" height="6"/>`;
    case 'bar-above': {
      /* The bar is wherever the hands are: on a pull-up the body moves and the
         bar does not, so it is pinned to the highest the hands ever reach. */
      const y = s.barY ?? (s.hand[1] - 2);
      return `<rect class="fg-load" x="${(s.hand[0] - 30).toFixed(1)}" y="${y.toFixed(1)}" width="60" height="4"/>`;
    }
    case 'cable-high':
      return `<rect class="fg-prop" x="72" y="6" width="20" height="8"/>
              <path class="fg-cable" d="M82 14 L${s.hand[0].toFixed(1)} ${s.hand[1].toFixed(1)}"/>`;
    default:
      return '';
  }
}

function drawLoad(kind, s) {
  const [hx, hy] = s.hand;
  switch (kind) {
    case 'bar':
      return `<rect class="fg-load" x="${(hx - 20).toFixed(1)}" y="${(hy - 2).toFixed(1)}" width="40" height="4"/>
              <rect class="fg-load" x="${(hx - 24).toFixed(1)}" y="${(hy - 9).toFixed(1)}" width="6" height="18"/>
              <rect class="fg-load" x="${(hx + 18).toFixed(1)}" y="${(hy - 9).toFixed(1)}" width="6" height="18"/>`;
    case 'bar-back': {
      const [sx, sy] = s.shoulder;
      return `<rect class="fg-load" x="${(sx - 22).toFixed(1)}" y="${(sy - 4).toFixed(1)}" width="44" height="4"/>
              <rect class="fg-load" x="${(sx - 27).toFixed(1)}" y="${(sy - 11).toFixed(1)}" width="7" height="18"/>
              <rect class="fg-load" x="${(sx + 20).toFixed(1)}" y="${(sy - 11).toFixed(1)}" width="7" height="18"/>`;
    }
    case 'bar-hip': {
      const [x, y] = s.hip;
      return `<rect class="fg-load" x="${(x - 16).toFixed(1)}" y="${(y - 6).toFixed(1)}" width="32" height="5"/>
              <rect class="fg-load" x="${(x - 21).toFixed(1)}" y="${(y - 12).toFixed(1)}" width="6" height="16"/>
              <rect class="fg-load" x="${(x + 15).toFixed(1)}" y="${(y - 12).toFixed(1)}" width="6" height="16"/>`;
    }
    case 'db':
      return `<rect class="fg-load" x="${(hx - 7).toFixed(1)}" y="${(hy - 3).toFixed(1)}" width="14" height="6"/>
              <rect class="fg-load" x="${(hx - 10).toFixed(1)}" y="${(hy - 6).toFixed(1)}" width="4" height="12"/>
              <rect class="fg-load" x="${(hx + 6).toFixed(1)}" y="${(hy - 6).toFixed(1)}" width="4" height="12"/>`;
    case 'pad-shin': {
      const [x, y] = s.ankle;
      return `<rect class="fg-load" x="${(x - 5).toFixed(1)}" y="${(y - 5).toFixed(1)}" width="10" height="10"/>`;
    }
    default:
      return '';
  }
}

/** Shift a polyline sideways and back, for the limbs on the far side. */
const shift = (pts, dx, dy) => pts.map(([x, y]) => [x + dx, y + dy]);

/**
 * Bounding box over both extremes of a movement, so the framing is chosen
 * once and the figure does not drift inside it while it moves.
 */
function viewBoxFor(move) {
  let minX = 999, minY = 999, maxX = -999, maxY = -999;
  const see = (pts) => pts.forEach(([x, y]) => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  });

  [0, 0.5, 1].forEach((t) => {
    const s = skeleton(blend(move.a, move.b, t));
    see([...s.spine, ...s.arm, ...s.leg, s.neck, s.head]);
    /* the body has width, so the box has to allow for it */
    see([[s.head[0] - 10, s.head[1] - 10], [s.head[0] + 10, s.head[1] + 10]]);
    /* The bar is wider than the body and is the thing that must not clip. */
    see([[s.hand[0] - 28, s.hand[1]], [s.hand[0] + 28, s.hand[1]]]);
    if (move.load === 'bar-back') see([[s.shoulder[0] - 30, s.shoulder[1]], [s.shoulder[0] + 30, s.shoulder[1]]]);
  });

  if (move.prop !== 'none') { see([[8, 6], [92, 114]]); }

  const pad = 9;
  const x = minX - pad;
  const y = minY - pad;
  return `${x.toFixed(1)} ${y.toFixed(1)} ${(maxX - minX + pad * 2).toFixed(1)} ${(maxY - minY + pad * 2).toFixed(1)}`;
}

export const boxFor = (pattern) => viewBoxFor(MOVES[pattern] || FALLBACK);

/** The whole body on one side, as solid shapes. */
function side(s, cls, dx = 0, dy = 0) {
  const o = ([x, y]) => [x + dx, y + dy];
  const arm = s.arm.map(o);
  const leg = s.leg.map(o);
  return [
    part(cls, o(s.hip), o(s.knee), GIRTH.thigh[0], GIRTH.thigh[1]),
    part(cls, leg[1], leg[2], GIRTH.shin[0], GIRTH.shin[1]),
    part(cls, leg[2], leg[3], GIRTH.foot[0], GIRTH.foot[1]),
    part(cls, o(s.shoulder), arm[1], GIRTH.upperArm[0], GIRTH.upperArm[1]),
    part(cls, arm[1], arm[2], GIRTH.foreArm[0], GIRTH.foreArm[1])
  ].join('');
}

/** One frame as SVG markup. */
export function frame(pattern, t, muscle) {
  const move = MOVES[pattern] || FALLBACK;
  const p = blend(move.a, move.b, t);
  const s = skeleton(p);

  /* A fixed bar has to be computed from the pose where the arms are longest,
     not from this frame, or it rides up and down with the lifter. */
  if (move.prop === 'bar-above') {
    s.barY = skeleton(move.a).hand[1] - 2;
  }

  const glow = workedMuscle(s, muscle);

  return [
    drawProp(move.prop, s),

    /* far side first, shifted back and down */
    side(s, 'fg-far', -5.5, 3.5),

    /* torso, then neck and head, then the near limbs on top */
    part('fg-body', s.hip, s.shoulder, GIRTH.torso[0], GIRTH.torso[1]),
    glow,
    part('fg-body', s.shoulder, s.neck, 7.5, 6.4),
    `<ellipse class="fg-body" cx="${n(s.head[0])}" cy="${n(s.head[1])}" rx="${BODY.head}" ry="${(BODY.head * 1.12).toFixed(1)}"`
      + ` transform="rotate(${s.tilt.toFixed(1)} ${n(s.head[0])} ${n(s.head[1])})"/>`,
    side(s, 'fg-body'),

    drawLoad(move.load, s)
  ].join('');
}

export const hasMove = (pattern) => !!MOVES[pattern];

/* ---------- the live element ---------- */

/** Slow at the turnaround, quicker through the middle — like a real rep. */
const ease = (x) => x * x * (3 - 2 * x);

/**
 * An animated demo for an exercise.
 * @returns {{node: SVGElement, stop: () => void}}
 */
export function figureDemo(exercise, { period = 2600 } = {}) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', boxFor(exercise?.pattern));
  svg.setAttribute('class', 'fg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `הדגמת ${exercise?.name || 'תרגיל'}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  const pattern = exercise?.pattern;
  const muscle = exercise?.muscle;
  let raf = null;
  let started = 0;
  let running = false;

  const draw = (t) => { svg.innerHTML = frame(pattern, t, muscle); };

  const tick = (now) => {
    if (!started) started = now;
    const phase = ((now - started) % period) / period;
    /* Out and back: one rep per period. */
    const tri = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
    draw(ease(tri));
    raf = requestAnimationFrame(tick);
  };

  const play = () => {
    if (running) return;
    running = true;
    started = 0;
    raf = requestAnimationFrame(tick);
  };
  const stop = () => {
    running = false;
    cancelAnimationFrame(raf);
    raf = null;
  };

  draw(0);
  play();

  const onVis = () => (document.hidden ? stop() : play());
  document.addEventListener('visibilitychange', onVis);

  return {
    node: svg,
    play,
    pause: stop,
    isRunning: () => running,
    stop: () => {
      stop();
      document.removeEventListener('visibilitychange', onVis);
    }
  };
}
