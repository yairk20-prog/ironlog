/* ==========================================================================
   programs.js — goal modes, PPL day templates and the weekly rotation.
   A "day template" is a list of slots; a slot is {ex, sets, repMin, repMax}.
   Rep ranges come from the active goal, so the same split serves
   hypertrophy / strength / cut without duplicating the templates.
   ========================================================================== */

export const GOALS = {
  /* Names are what people say they want ("להתחזק", "להתחטב"), not the
     training terms; the description says what that means in the gym. */
  hypertrophy: {
    id: 'hypertrophy',
    name: 'לבנות שריר',
    desc: 'להגדיל מסת שריר — 8–12 חזרות, נפח גבוה',
    reps: { compound: [6, 10], isolation: [10, 15] },
    restMul: 1,
    incCompound: 0.025,
    incIsolation: 0.05,
    rirTarget: 2
  },
  strength: {
    id: 'strength',
    name: 'להתחזק',
    desc: 'להרים יותר — משקלים כבדים, 3–6 חזרות, מנוחות ארוכות',
    reps: { compound: [3, 6], isolation: [8, 12] },
    restMul: 1.35,
    incCompound: 0.025,
    incIsolation: 0.05,
    rirTarget: 1
  },
  cut: {
    id: 'cut',
    name: 'להתחטב',
    desc: 'להוריד שומן ולשמור על השריר — גירעון קל, עצימות גבוהה, מנוחות קצרות',
    reps: { compound: [6, 10], isolation: [12, 18] },
    restMul: 0.8,
    incCompound: 0.02,
    incIsolation: 0.04,
    rirTarget: 2
  },
  /* Weight loss as the main aim: a bigger calorie deficit than a cut, cardio
     days in the plan, and lifting kept to moderate loads on short rests —
     the muscle stays, the number on the scale goes down. */
  lose: {
    id: 'lose',
    name: 'לרדת במשקל',
    desc: 'ירידה במשקל — גירעון קלורי, אירובי בתוכנית, אימוני כוח במנוחות קצרות',
    reps: { compound: [8, 12], isolation: [12, 20] },
    restMul: 0.75,
    incCompound: 0.02,
    incIsolation: 0.04,
    rirTarget: 2
  },
  abs: {
    id: 'abs',
    name: 'בטן וליבה',
    desc: 'דגש על ליבה ובטן לצד שמירת מסה',
    reps: { compound: [8, 12], isolation: [12, 20] },
    restMul: 0.85,
    incCompound: 0.025,
    incIsolation: 0.05,
    rirTarget: 2
  },
  /* Cardiovascular fitness is mostly built outside the weight room, so this
     goal's main effect is the aerobic sessions it puts on rest days. In the
     gym it means lighter, higher-rep work on short rests. */
  endurance: {
    id: 'endurance',
    name: 'כושר וסיבולת',
    desc: 'לב-ריאה — ריצה ואירובי בתוכנית, חזרות גבוהות ומנוחות קצרות',
    reps: { compound: [10, 15], isolation: [15, 20] },
    restMul: 0.7,
    incCompound: 0.025,
    incIsolation: 0.05,
    rirTarget: 2
  },
  /* Functional fitness: strength you use outside the gym — swinging,
     carrying, jumping, getting up off the floor — done as circuits with
     short rests, so the heart works as hard as the muscles. Choosing it
     offers the functional splits; any split can still run a functional day
     from the home screen. */
  functional: {
    id: 'functional',
    name: 'כושר פונקציונלי',
    desc: 'מעגלים של כוח מתפרץ, נשיאה, קפיצות ותנועה — מנוחות קצרות',
    reps: { compound: [8, 12], isolation: [12, 15] },
    restMul: 0.6,
    incCompound: 0.025,
    incIsolation: 0.05,
    rirTarget: 2
  }
};

export const DAY_TYPES = {
  Push: { name: 'דחיפה', short: 'A', color: '#FF8A3D' },
  Pull: { name: 'משיכה', short: 'B', color: '#4DA3FF' },
  Legs: { name: 'רגליים', short: 'C', color: '#34D06A' },
  Posture: { name: 'יציבה', short: 'Y', color: '#B98BFF' },
  Park: { name: 'פארק', short: 'P', color: '#2FD9C4' },
  Home: { name: 'בית', short: 'H', color: '#FF6FA8' },
  Cardio: { name: 'אירובי', short: 'R', color: '#FF4D6D' },
  Functional: { name: 'פונקציונלי', short: 'F', color: '#FFB020' },
  Custom: { name: 'מותאם', short: '★', color: '#FFC93D' }
};

/** Day templates. `s` = working sets. Order matters: compounds first. */
export const TEMPLATES = {
  push_a: {
    id: 'push_a', type: 'Push', name: 'דחיפה A · חזה מוביל',
    slots: [
      { ex: 'bb_bench', s: 4 },
      { ex: 'db_incline', s: 3 },
      { ex: 'db_shoulder_press', s: 3 },
      { ex: 'cable_fly', s: 3 },
      { ex: 'db_lateral', s: 3 },
      { ex: 'rope_pushdown', s: 3 }
    ]
  },
  push_b: {
    id: 'push_b', type: 'Push', name: 'דחיפה B · כתפיים מובילות',
    slots: [
      { ex: 'bb_ohp', s: 4 },
      { ex: 'machine_chest_press', s: 3 },
      { ex: 'cable_lateral', s: 4 },
      { ex: 'pec_deck', s: 3 },
      { ex: 'cable_face_pull', s: 3 },
      { ex: 'db_overhead_tri', s: 3 }
    ]
  },
  pull_a: {
    id: 'pull_a', type: 'Pull', name: 'משיכה A · רוחב',
    slots: [
      { ex: 'pullup', s: 4 },
      { ex: 'bb_row', s: 4 },
      { ex: 'cable_row', s: 3 },
      { ex: 'rear_delt_fly', s: 3 },
      { ex: 'bb_curl', s: 3 },
      { ex: 'hammer_curl', s: 3 }
    ]
  },
  pull_b: {
    id: 'pull_b', type: 'Pull', name: 'משיכה B · עובי',
    slots: [
      { ex: 'lat_pulldown', s: 4 },
      { ex: 'machine_row', s: 4 },
      { ex: 'straight_arm_pulldown', s: 3 },
      { ex: 'reverse_pec_deck', s: 3 },
      { ex: 'preacher_curl', s: 3 },
      { ex: 'db_shrug', s: 3 }
    ]
  },
  legs_a: {
    id: 'legs_a', type: 'Legs', name: 'רגליים A · סקוואט',
    slots: [
      { ex: 'bb_squat', s: 4 },
      { ex: 'rdl', s: 3 },
      { ex: 'leg_press', s: 3 },
      { ex: 'leg_curl', s: 3 },
      { ex: 'standing_calf', s: 4 },
      { ex: 'hanging_leg_raise', s: 3 }
    ]
  },
  legs_b: {
    id: 'legs_b', type: 'Legs', name: 'רגליים B · ציר ירך',
    slots: [
      { ex: 'rdl', s: 4 },
      { ex: 'hack_squat', s: 3 },
      { ex: 'hip_thrust', s: 3 },
      { ex: 'seated_leg_curl', s: 3 },
      { ex: 'leg_extension', s: 3 },
      { ex: 'seated_calf', s: 4 }
    ]
  },
  posture: {
    id: 'posture', type: 'Posture', name: 'יציבה וניידות',
    slots: [
      { ex: 'hip_flexor_stretch', s: 2, seconds: 45 },
      { ex: 'glute_activation', s: 2 },
      { ex: 'dead_bug', s: 3 },
      { ex: 'chin_tuck', s: 2 },
      { ex: 'wall_angel', s: 2 },
      { ex: 'thoracic_ext', s: 2, seconds: 45 },
      { ex: 'side_plank', s: 2, seconds: 30 }
    ]
  },

  /* Functional days. A: power and carrying with a kettlebell; B: a
     bodyweight metcon that needs nothing; C: control — getting up, holding
     a position, moving well under load. Timed slots are carries, crawls and
     ropes, where a rep count means nothing. */
  func_a: {
    id: 'func_a', type: 'Functional', name: 'פונקציונלי A · כוח מתפרץ',
    slots: [
      { ex: 'kb_swing', s: 4 },
      { ex: 'kb_thruster', s: 3 },
      { ex: 'box_jump', s: 3 },
      { ex: 'renegade_row', s: 3 },
      { ex: 'farmer_carry', s: 3, seconds: 40 },
      { ex: 'med_ball_slam', s: 3 }
    ]
  },
  func_b: {
    id: 'func_b', type: 'Functional', name: 'פונקציונלי B · מטקון משקל גוף',
    slots: [
      { ex: 'burpee', s: 4 },
      { ex: 'jump_squat', s: 3 },
      { ex: 'pushup_side_plank', s: 3 },
      { ex: 'mountain_climbers', s: 3, seconds: 30 },
      { ex: 'bw_lunge', s: 3 },
      { ex: 'bear_crawl', s: 3, seconds: 30 }
    ]
  },
  func_c: {
    id: 'func_c', type: 'Functional', name: 'פונקציונלי C · תנועה ושליטה',
    slots: [
      { ex: 'turkish_getup', s: 3 },
      { ex: 'goblet_squat', s: 3 },
      { ex: 'kb_clean', s: 3 },
      { ex: 'inchworm', s: 3 },
      { ex: 'battle_ropes', s: 3, seconds: 30 },
      { ex: 'pallof_press', s: 3 }
    ]
  },

  /* Stretching is not the posture routine with the strength work removed —
     it is what you want after a session or on a stiff evening: holds only,
     no activation drills, no core. Five minutes, nothing to think about. */
  stretch: {
    id: 'stretch', type: 'Mobility', name: 'מתיחות',
    slots: [
      { ex: 'hip_flexor_stretch', s: 2, seconds: 45 },
      { ex: 'hamstring_stretch', s: 2, seconds: 45 },
      { ex: 'pigeon_stretch', s: 2, seconds: 45 },
      { ex: 'thoracic_ext', s: 2, seconds: 45 },
      { ex: 'wall_angel', s: 2, seconds: 30 }
    ]
  }
};

/* ==========================================================================
   Where today's session happens.

   Not at the gym is not a reason to lose the day. A park or living-room
   session is today's *planned* day — push stays push, pull stays pull —
   rebuilt from what that place actually has, and it counts: the rotation
   advances and the streak holds, exactly as if the gym had been open.

   These are explicit lists rather than the equipment-swap logic, because
   "closest movement pattern that needs no equipment" picks wall angels for
   lateral raises. A push day at the park is push-ups and dips, on purpose.
   ========================================================================== */
export const VENUES = {
  gym: { id: 'gym', name: 'חדר כושר', short: 'חדר כושר', desc: 'התוכנית כפי שהיא' },
  park: { id: 'park', name: 'פארק', short: 'פארק', desc: 'מתח, מקבילים וספסל', suffix: 'בפארק' },
  home: { id: 'home', name: 'בית', short: 'בית', desc: 'רצפה, כיסא ושולחן', suffix: 'בבית' }
};

export const VENUE_DAYS = {
  park: {
    Push: [
      { ex: 'pushup', s: 4 },
      { ex: 'dips', s: 3 },
      { ex: 'decline_pushup', s: 3 },
      { ex: 'diamond_pushup', s: 3 },
      { ex: 'plank', s: 2, seconds: 45 }
    ],
    Pull: [
      { ex: 'pullup', s: 4 },
      { ex: 'inverted_row', s: 3 },
      { ex: 'chin_up', s: 3 },
      { ex: 'hanging_leg_raise', s: 3 },
      { ex: 'side_plank', s: 2, seconds: 30 }
    ],
    Legs: [
      { ex: 'bw_squat', s: 4 },
      { ex: 'step_up', s: 3 },
      { ex: 'bw_lunge', s: 3 },
      { ex: 'single_leg_bridge', s: 3 },
      { ex: 'bw_calf', s: 4 },
      { ex: 'hanging_leg_raise', s: 3 }
    ],
    Functional: [
      { ex: 'burpee', s: 4 },
      { ex: 'pullup', s: 3 },
      { ex: 'jump_squat', s: 3 },
      { ex: 'pushup_side_plank', s: 3 },
      { ex: 'bear_crawl', s: 3, seconds: 30 },
      { ex: 'mountain_climbers', s: 3, seconds: 30 }
    ]
  },
  /* No bar at home, so there is no vertical pull: the table row carries the
     back work, and the rest of a pull day becomes core rather than nothing. */
  home: {
    Push: [
      { ex: 'pushup', s: 4 },
      { ex: 'decline_pushup', s: 3 },
      { ex: 'bench_dips', s: 3 },
      { ex: 'diamond_pushup', s: 3 },
      { ex: 'plank', s: 2, seconds: 45 }
    ],
    Pull: [
      { ex: 'inverted_row', s: 4 },
      { ex: 'reverse_crunch', s: 3 },
      { ex: 'dead_bug', s: 3 },
      { ex: 'crunches', s: 3 },
      { ex: 'side_plank', s: 2, seconds: 30 }
    ],
    Legs: [
      { ex: 'bw_squat', s: 4 },
      { ex: 'bw_lunge', s: 3 },
      { ex: 'step_up', s: 3 },
      { ex: 'single_leg_bridge', s: 3 },
      { ex: 'glute_bridge', s: 3 },
      { ex: 'bw_calf', s: 4 }
    ],
    Functional: [
      { ex: 'burpee', s: 4 },
      { ex: 'jump_squat', s: 3 },
      { ex: 'pushup_side_plank', s: 3 },
      { ex: 'inchworm', s: 3 },
      { ex: 'bw_lunge', s: 3 },
      { ex: 'mountain_climbers', s: 3, seconds: 30 }
    ]
  }
};

/** "דחיפה A · בפארק" — the gym template's emphasis ("חזה מוביל") describes
    the gym version, so an away session keeps only the day and its letter. */
export function sessionName(tpl, venue = 'gym') {
  if (venue === 'gym' || !VENUE_DAYS[venue]?.[tpl.type]) return tpl.name;
  return `${tpl.name.split(' · ')[0]} · ${VENUES[venue].suffix}`;
}

/** The venue picked for today; any other day's pick has expired. */
export const venueToday = (settings, today) =>
  (settings?.venueToday?.date === today && VENUES[settings.venueToday.venue])
    ? settings.venueToday.venue
    : 'gym';

/**
 * The slots a session of this template will actually contain: the venue's
 * version of the day when there is one (posture days are already
 * equipment-free and stay as they are), cut to the session-length setting.
 * Shared by the preview and by createFromTemplate so the two never disagree.
 */
export function planSlots(tpl, settings, venue = 'gym') {
  const base = (venue !== 'gym' && VENUE_DAYS[venue]?.[tpl.type]) || tpl.slots;
  return base.slice(0, durationFor(settings?.duration).slots);
}

/* ==========================================================================
   Challenges — one set, all out, and a number to beat next time.

   Deliberately bodyweight and equipment-free: the point is that it can be
   done anywhere, on a rest day, without planning. The score is the rep count
   (or the hold in seconds), so the app's existing set log is the record book
   and no new storage is needed.
   ========================================================================== */
export const CHALLENGES = [
  { id: 'max_pushups', ex: 'pushup', name: 'שכיבות סמיכה מקסימום', metric: 'reps', desc: 'סט אחד עד כישלון טכני' },
  { id: 'max_pullups', ex: 'pullup', name: 'מתח מקסימום', metric: 'reps', desc: 'סט אחד, בלי קיפינג' },
  { id: 'max_plank', ex: 'plank', name: 'פלאנק מקסימלי', metric: 'seconds', desc: 'אחיזה אחת עד שהגב מתחיל לשקוע' },
  { id: 'max_leg_raise', ex: 'hanging_leg_raise', name: 'הרמות רגליים בתלייה', metric: 'reps', desc: 'סט אחד, רגליים ישרות' }
];

export const challengeById = (id) => CHALLENGES.find((c) => c.id === id) || null;

/* ==========================================================================
   Session length — how much of a template actually gets built.

   Trimming a template to fewer exercises always keeps the exercises the
   template lists first, which is why every template is written compounds
   first: a short session drops the isolation work, not a compound.
   ========================================================================== */
export const DURATIONS = {
  quick: { id: 'quick', name: 'זריז', desc: '2 תרגילים, מנוחות קצרות · כ-10 דקות', slots: 2, setDelta: -2, restCap: 45 },
  short: { id: 'short', name: 'קצר', desc: 'עד 4 תרגילים · כ-25 דקות', slots: 4, setDelta: -1, restCap: null },
  medium: { id: 'medium', name: 'בינוני', desc: 'האימון המלא כפי שתוכנן · כ-45 דקות', slots: Infinity, setDelta: 0, restCap: null },
  long: { id: 'long', name: 'ארוך', desc: 'האימון המלא ועוד סט לכל תרגיל · כ-65 דקות', slots: Infinity, setDelta: 1, restCap: null }
};

export const durationFor = (id) => DURATIONS[id] || DURATIONS.medium;

/** Weekly rotations the user can pick. Each entry is a template id or 'rest'. */
export const ROTATIONS = {
  ppl6: {
    id: 'ppl6',
    name: 'PPL · 6 ימים',
    desc: 'דחיפה/משיכה/רגליים ×2, יום מנוחה אחד',
    days: ['push_a', 'pull_a', 'legs_a', 'push_b', 'pull_b', 'legs_b', 'rest']
  },
  ppl5: {
    id: 'ppl5',
    name: 'PPL · 5 ימים + יציבה',
    desc: 'סבב PPL עם יום יציבה ושתי מנוחות',
    days: ['push_a', 'pull_a', 'legs_a', 'rest', 'push_b', 'pull_b', 'posture']
  },
  ppl3: {
    id: 'ppl3',
    name: 'PPL · 3 ימים',
    desc: 'אימון יום־כן־יום, מתאים ללו״ז עמוס',
    days: ['push_a', 'rest', 'pull_a', 'rest', 'legs_a', 'posture', 'rest']
  },
  hybrid5: {
    id: 'hybrid5',
    name: 'כוח + פונקציונלי · 5 ימים',
    desc: 'דחיפה, משיכה ורגליים, ושני ימי מעגלים פונקציונליים',
    days: ['push_a', 'func_a', 'legs_a', 'rest', 'pull_a', 'func_b', 'rest']
  },
  func4: {
    id: 'func4',
    name: 'פונקציונלי · 4 ימים',
    desc: 'שלושה סוגי מעגלים — כוח מתפרץ, מטקון ותנועה',
    days: ['func_a', 'func_b', 'rest', 'func_c', 'rest', 'func_b', 'rest']
  }
};

/** Templates for a functional day picked off-plan, from the home screen. */
export const FUNCTIONAL = ['func_a', 'func_b', 'func_c'];

export const DEFAULTS = {
  goal: 'hypertrophy',
  /* Several goals can run at once; `goal` stays for older saved settings. */
  goals: ['hypertrophy'],
  rotation: 'ppl6',
  duration: 'medium',
  barWeight: 20,
  plates: [25, 20, 15, 10, 5, 2.5, 1.25],
  increment: 2.5,
  units: 'kg',
  warmupOn: true,
  vibrate: true,
  soundAlert: true,
  bgNotify: false,
  autoTimer: true,
  themeColor: '#FF5C00',
  /* RIR is a coach's tool, not a beginner's. Off by default so the set grid
     stays weight × reps × done. */
  trackRir: false,
  bodyweight: 75
};

/**
 * Blend several goals into one training profile.
 *
 * People rarely want exactly one thing — "get stronger but also lean out" is
 * the normal case, and running two programmes at once is how you make no
 * progress at either. So the selected goals collapse into a single coherent
 * prescription rather than alternating:
 *
 *   compounds follow the *heaviest* goal chosen (its range is the lowest),
 *   isolation follows the *highest-volume* goal chosen,
 *   rest is the longest any goal asks for, because the heavy work needs it,
 *   load increases take the most conservative number, and
 *   protein follows the most demanding goal (a cut needs the most).
 *
 * Accepts a single id, a list of ids, or a settings-shaped object.
 */
export function resolveGoal(goal) {
  const list = (Array.isArray(goal) ? goal : [goal])
    .map((g) => GOALS[g])
    .filter(Boolean);

  if (!list.length) return GOALS.hypertrophy;
  if (list.length === 1) return list[0];

  const compound = [
    Math.min(...list.map((g) => g.reps.compound[0])),
    Math.min(...list.map((g) => g.reps.compound[1]))
  ];
  const isolation = [
    Math.max(...list.map((g) => g.reps.isolation[0])),
    Math.max(...list.map((g) => g.reps.isolation[1]))
  ];

  return {
    id: list.map((g) => g.id).join('+'),
    ids: list.map((g) => g.id),
    name: list.map((g) => g.name).join(' + '),
    desc: 'שילוב מטרות — מורכבים כבדים, בידוד בנפח גבוה',
    reps: { compound, isolation },
    restMul: Math.max(...list.map((g) => g.restMul)),
    incCompound: Math.min(...list.map((g) => g.incCompound)),
    incIsolation: Math.min(...list.map((g) => g.incIsolation)),
    rirTarget: Math.min(...list.map((g) => g.rirTarget))
  };
}

/** The goals a settings object selects, always as a list. */
export const goalList = (settings) => {
  const list = Array.isArray(settings?.goals) && settings.goals.length
    ? settings.goals
    : [settings?.goal || 'hypertrophy'];
  return list.filter((id) => GOALS[id]);
};

/** Rep range for a slot, resolved against the active goal(s). */
export function repRange(goal, exercise) {
  const g = resolveGoal(goal);
  const [lo, hi] = exercise?.compound ? g.reps.compound : g.reps.isolation;
  return { min: lo, max: hi };
}

export function restFor(goal, exercise) {
  const g = resolveGoal(goal);
  return Math.round((exercise?.rest ?? 90) * g.restMul);
}

/** Bounds of a rest someone types in: a quarter minute to ten minutes. */
export const REST_MIN = 15;
export const REST_MAX = 600;

/**
 * The rest after a work set, in seconds. A rest picked for this exercise
 * during the workout wins; then the fixed rest chosen in Settings
 * (restFixed + restSeconds); then the plan's own, by exercise and goal.
 */
export function restAfterSet(settings, slot, exercise) {
  if (slot?.restSet && slot.rest > 0) return slot.rest;
  if (settings?.restFixed && settings.restSeconds > 0) return settings.restSeconds;
  return slot?.rest || restFor(goalList(settings), exercise);
}

/** The rest after a warm-up set: the fixed rest when one is chosen, else 45 s. */
export const warmupRest = (settings) => (settings?.restFixed && settings.restSeconds > 0 ? settings.restSeconds : 45);

/** 90 → "1:30 דק׳", 45 → "45 שניות". */
export const restLabel = (sec) => (sec < 60 ? `${sec} שניות` : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')} דק׳`);

/* ==========================================================================
   Cardio days in the plan.

   Running or other cardio can be part of the week rather than an extra on
   the side: `cardioDays` (0–4) puts that many 'cardio' days into the split.
   They take rest days first — a run is what a lifting rest day is for —
   but one full rest day always stays; any more are inserted after lifting
   days, spread through the week. A planned cardio day is done by finishing
   any cardio session that day, and it moves the rotation like a lift does.
   ========================================================================== */

/** n items from a list, evenly spread. */
function spread(list, n) {
  if (n <= 0) return [];
  if (n >= list.length) return [...list];
  return [...new Set(Array.from({ length: n }, (_, k) => list[Math.floor(((k + 0.5) * list.length) / n)]))];
}

/** The days of the week as planned: the split, with its cardio days in it. */
export function planDays(settings) {
  const base = [...(ROTATIONS[settings?.rotation] || ROTATIONS.ppl6).days];
  const want = Math.max(0, Math.min(4, Math.round(Number(settings?.cardioDays) || 0)));
  if (!want) return base;
  const days = [...base];
  const rests = days.map((d, i) => (d === 'rest' ? i : -1)).filter((i) => i >= 0);
  const convertible = rests.slice(0, Math.max(0, rests.length - 1));
  const converted = spread(convertible, Math.min(want, convertible.length));
  converted.forEach((i) => { days[i] = 'cardio'; });
  const more = want - converted.length;
  if (more > 0) {
    const lifts = days.map((d, i) => (d !== 'rest' && d !== 'cardio' ? i : -1)).filter((i) => i >= 0);
    spread(lifts, more).sort((a, b) => b - a).forEach((i) => days.splice(i + 1, 0, 'cardio'));
  }
  return days;
}

/** The key planned for a day index: a template id, 'cardio' or 'rest'. */
export function dayAt(settings, index) {
  const days = planDays(settings);
  return days[((index % days.length) + days.length) % days.length];
}

/** Which template is scheduled for a given day index in the rotation. */
export function templateForIndex(rotationId, index) {
  const rot = ROTATIONS[rotationId] || ROTATIONS.ppl6;
  const key = rot.days[((index % rot.days.length) + rot.days.length) % rot.days.length];
  return key === 'rest' ? null : TEMPLATES[key];
}

export const rotationLength = (rotationId) => (ROTATIONS[rotationId] || ROTATIONS.ppl6).days.length;
