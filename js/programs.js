/* ==========================================================================
   programs.js — goal modes, PPL day templates and the weekly rotation.
   A "day template" is a list of slots; a slot is {ex, sets, repMin, repMax}.
   Rep ranges come from the active goal, so the same split serves
   hypertrophy / strength / cut without duplicating the templates.
   ========================================================================== */

export const GOALS = {
  hypertrophy: {
    id: 'hypertrophy',
    name: 'היפרטרופיה',
    desc: 'בניית שריר — טווח 8–12, נפח גבוה',
    reps: { compound: [6, 10], isolation: [10, 15] },
    restMul: 1,
    incCompound: 0.025,
    incIsolation: 0.05,
    rirTarget: 2
  },
  strength: {
    id: 'strength',
    name: 'כוח גולמי',
    desc: 'שיאים — טווח 3–6, מנוחות ארוכות',
    reps: { compound: [3, 6], isolation: [8, 12] },
    restMul: 1.35,
    incCompound: 0.025,
    incIsolation: 0.05,
    rirTarget: 1
  },
  cut: {
    id: 'cut',
    name: 'חיטוב / ירידה במשקל',
    desc: 'שמירה על עצימות, מנוחות קצרות, נפח מתון',
    reps: { compound: [6, 10], isolation: [12, 18] },
    restMul: 0.8,
    incCompound: 0.02,
    incIsolation: 0.04,
    rirTarget: 2
  },
  abs: {
    id: 'abs',
    name: 'חיטוב בטני / ליבה',
    desc: 'דגש על ליבה ובטן לצד שמירת מסה',
    reps: { compound: [8, 12], isolation: [12, 20] },
    restMul: 0.85,
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
  },

  /* Same reasoning as stretch vs. posture: a park workout is not "the gym
     split with the machines removed" — it's built around what a park
     actually has (a pull-up bar, dip bars, a bench or ledge) so nothing in
     it silently swaps to something that isn't there. */
  park: {
    id: 'park', type: 'Park', name: 'אימון בפארק',
    slots: [
      { ex: 'pullup', s: 3 },
      { ex: 'dips', s: 3 },
      { ex: 'bw_squat', s: 3 },
      { ex: 'step_up', s: 3 },
      { ex: 'hanging_leg_raise', s: 3 },
      { ex: 'plank', s: 2, seconds: 45 }
    ]
  },

  /* No bar, no bench — a table and a wall are what most living rooms
     actually offer. */
  home: {
    id: 'home', type: 'Home', name: 'אימון בבית',
    slots: [
      { ex: 'pushup', s: 3 },
      { ex: 'inverted_row', s: 3 },
      { ex: 'bw_squat', s: 3 },
      { ex: 'bw_lunge', s: 3 },
      { ex: 'glute_bridge', s: 3 },
      { ex: 'plank', s: 2, seconds: 45 }
    ]
  }
};

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
  }
};

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

/** Which template is scheduled for a given day index in the rotation. */
export function templateForIndex(rotationId, index) {
  const rot = ROTATIONS[rotationId] || ROTATIONS.ppl6;
  const key = rot.days[((index % rot.days.length) + rot.days.length) % rot.days.length];
  return key === 'rest' ? null : TEMPLATES[key];
}

export const rotationLength = (rotationId) => (ROTATIONS[rotationId] || ROTATIONS.ppl6).days.length;
