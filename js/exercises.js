/* ==========================================================================
   exercises.js — exercise catalogue (Hebrew), equipment categories,
   rest defaults, bar-loaded flag (drives the plate calculator) and
   substitution groups (drives "the machine is taken" quick swap).

   pattern  — movement pattern; swaps are offered inside the same pattern.
   bar      — true when the load sits on a barbell (plate calculator applies).
   rest     — default rest in seconds (compound ≈ 180, isolation ≈ 90).
   ========================================================================== */

export const CATEGORIES = {
  FreeWeights: 'משקולות חופשיות',
  Machine: 'מכונה',
  Cable: 'כבלים / פולי',
  Bodyweight: 'משקל גוף',
  Bands: 'רצועות'
};

export const MUSCLES = {
  chest: 'חזה',
  shoulders: 'כתפיים',
  triceps: 'טריצפס',
  back: 'גב',
  lats: 'גב רחב',
  traps: 'טרפז',
  biceps: 'ביצפס',
  forearms: 'אמות',
  quads: 'ארבע ראשי',
  hamstrings: 'מיתר הברך',
  glutes: 'ישבן',
  calves: 'תאומים',
  core: 'ליבה',
  abs: 'בטן',
  hipflexors: 'כופפי ירך',
  spine: 'יישור גו'
};

/** @type {Array<{id:string,name:string,muscle:string,secondary?:string[],cat:string,pattern:string,bar?:boolean,rest:number,compound:boolean,yt:string,cue?:string}>} */
export const EXERCISES = [
  /* ================= PUSH — chest ================= */
  { id: 'bb_bench', name: 'לחיצת חזה במוט', muscle: 'chest', secondary: ['triceps', 'shoulders'], cat: 'FreeWeights', pattern: 'horiz_push', bar: true, rest: 180, compound: true, yt: 'barbell bench press form', cue: 'שכמות נעולות אחורה, מוט לקו הפטמות' },
  { id: 'db_bench', name: 'לחיצת חזה עם משקולות', muscle: 'chest', secondary: ['triceps', 'shoulders'], cat: 'FreeWeights', pattern: 'horiz_push', rest: 150, compound: true, yt: 'dumbbell bench press form' },
  { id: 'machine_chest_press', name: 'לחיצת חזה במכונה', muscle: 'chest', secondary: ['triceps'], cat: 'Machine', pattern: 'horiz_push', rest: 120, compound: true, yt: 'machine chest press form' },
  { id: 'smith_bench', name: 'לחיצת חזה בסמית׳', muscle: 'chest', secondary: ['triceps'], cat: 'Machine', pattern: 'horiz_push', rest: 150, compound: true, yt: 'smith machine bench press' },
  { id: 'pushup', name: 'שכיבות סמיכה', muscle: 'chest', secondary: ['triceps', 'core'], cat: 'Bodyweight', pattern: 'horiz_push', rest: 90, compound: true, yt: 'push up proper form' },

  { id: 'bb_incline', name: 'לחיצת חזה עליון במוט', muscle: 'chest', secondary: ['shoulders'], cat: 'FreeWeights', pattern: 'incline_push', bar: true, rest: 180, compound: true, yt: 'incline barbell bench press' },
  { id: 'db_incline', name: 'לחיצת חזה עליון משקולות', muscle: 'chest', secondary: ['shoulders'], cat: 'FreeWeights', pattern: 'incline_push', rest: 150, compound: true, yt: 'incline dumbbell press form' },
  { id: 'machine_incline', name: 'לחיצת חזה עליון במכונה', muscle: 'chest', cat: 'Machine', pattern: 'incline_push', rest: 120, compound: true, yt: 'incline machine press' },

  { id: 'cable_fly', name: 'פרפר בכבלים', muscle: 'chest', cat: 'Cable', pattern: 'chest_fly', rest: 90, compound: false, yt: 'cable chest fly form' },
  { id: 'pec_deck', name: 'פרפר במכונה (Pec Deck)', muscle: 'chest', cat: 'Machine', pattern: 'chest_fly', rest: 90, compound: false, yt: 'pec deck machine form' },
  { id: 'db_fly', name: 'פרפר עם משקולות', muscle: 'chest', cat: 'FreeWeights', pattern: 'chest_fly', rest: 90, compound: false, yt: 'dumbbell fly form' },
  { id: 'band_fly', name: 'פרפר ברצועות', muscle: 'chest', cat: 'Bands', pattern: 'chest_fly', rest: 75, compound: false, yt: 'resistance band chest fly' },

  /* ================= PUSH — shoulders ================= */
  { id: 'bb_ohp', name: 'לחיצת כתפיים במוט', muscle: 'shoulders', secondary: ['triceps', 'core'], cat: 'FreeWeights', pattern: 'vert_push', bar: true, rest: 180, compound: true, yt: 'overhead press barbell form' },
  { id: 'db_shoulder_press', name: 'לחיצת כתפיים משקולות', muscle: 'shoulders', secondary: ['triceps'], cat: 'FreeWeights', pattern: 'vert_push', rest: 150, compound: true, yt: 'dumbbell shoulder press seated' },
  { id: 'machine_shoulder_press', name: 'לחיצת כתפיים במכונה', muscle: 'shoulders', cat: 'Machine', pattern: 'vert_push', rest: 120, compound: true, yt: 'machine shoulder press' },

  { id: 'db_lateral', name: 'הרחקת זרועות לצדדים', muscle: 'shoulders', cat: 'FreeWeights', pattern: 'lateral_raise', rest: 75, compound: false, yt: 'dumbbell lateral raise form' },
  { id: 'cable_lateral', name: 'הרחקה לצד בכבל', muscle: 'shoulders', cat: 'Cable', pattern: 'lateral_raise', rest: 75, compound: false, yt: 'cable lateral raise' },
  { id: 'machine_lateral', name: 'הרחקה לצד במכונה', muscle: 'shoulders', cat: 'Machine', pattern: 'lateral_raise', rest: 75, compound: false, yt: 'lateral raise machine' },
  { id: 'band_lateral', name: 'הרחקה לצד ברצועה', muscle: 'shoulders', cat: 'Bands', pattern: 'lateral_raise', rest: 60, compound: false, yt: 'band lateral raise' },

  { id: 'rear_delt_fly', name: 'פרפר הפוך (כתף אחורית)', muscle: 'shoulders', secondary: ['traps'], cat: 'FreeWeights', pattern: 'rear_delt', rest: 75, compound: false, yt: 'rear delt fly form' },
  { id: 'cable_face_pull', name: 'משיכת פנים בכבל', muscle: 'shoulders', secondary: ['traps', 'back'], cat: 'Cable', pattern: 'rear_delt', rest: 75, compound: false, yt: 'face pull form', cue: 'מרפקים גבוהים, סיבוב חיצוני בסוף' },
  { id: 'reverse_pec_deck', name: 'פרפר הפוך במכונה', muscle: 'shoulders', cat: 'Machine', pattern: 'rear_delt', rest: 75, compound: false, yt: 'reverse pec deck' },
  { id: 'band_pull_apart', name: 'פתיחת רצועה', muscle: 'shoulders', secondary: ['traps'], cat: 'Bands', pattern: 'rear_delt', rest: 60, compound: false, yt: 'band pull apart' },

  /* ================= PUSH — triceps ================= */
  { id: 'cable_pushdown', name: 'פשיטת מרפקים בפולי', muscle: 'triceps', cat: 'Cable', pattern: 'tri_ext', rest: 90, compound: false, yt: 'triceps pushdown form' },
  { id: 'rope_pushdown', name: 'פשיטת מרפקים בחבל', muscle: 'triceps', cat: 'Cable', pattern: 'tri_ext', rest: 90, compound: false, yt: 'rope triceps pushdown' },
  { id: 'skullcrusher', name: 'מכסחי גולגולת', muscle: 'triceps', cat: 'FreeWeights', pattern: 'tri_ext', bar: true, rest: 90, compound: false, yt: 'skull crusher ez bar' },
  { id: 'db_overhead_tri', name: 'פשיטת מרפק מעל הראש', muscle: 'triceps', cat: 'FreeWeights', pattern: 'tri_ext', rest: 90, compound: false, yt: 'overhead dumbbell triceps extension' },
  { id: 'dips', name: 'מקבילים (דיפס)', muscle: 'triceps', secondary: ['chest'], cat: 'Bodyweight', pattern: 'tri_ext', rest: 120, compound: true, yt: 'triceps dips form' },
  { id: 'close_grip_bench', name: 'לחיצת חזה אחיזה צרה', muscle: 'triceps', secondary: ['chest'], cat: 'FreeWeights', pattern: 'tri_ext', bar: true, rest: 150, compound: true, yt: 'close grip bench press' },

  /* ================= PULL — back ================= */
  { id: 'pullup', name: 'מתח', muscle: 'lats', secondary: ['biceps'], cat: 'Bodyweight', pattern: 'vert_pull', rest: 180, compound: true, yt: 'pull up form' },
  { id: 'lat_pulldown', name: 'פולי עליון', muscle: 'lats', secondary: ['biceps'], cat: 'Cable', pattern: 'vert_pull', rest: 150, compound: true, yt: 'lat pulldown form' },
  { id: 'neutral_pulldown', name: 'פולי עליון אחיזה ניטרלית', muscle: 'lats', cat: 'Cable', pattern: 'vert_pull', rest: 150, compound: true, yt: 'neutral grip lat pulldown' },
  { id: 'assisted_pullup', name: 'מתח בעזרת מכונה', muscle: 'lats', cat: 'Machine', pattern: 'vert_pull', rest: 150, compound: true, yt: 'assisted pull up machine' },

  { id: 'bb_row', name: 'חתירה במוט', muscle: 'back', secondary: ['lats', 'biceps'], cat: 'FreeWeights', pattern: 'horiz_pull', bar: true, rest: 180, compound: true, yt: 'barbell row form', cue: 'גב ניטרלי, מוט לטבור' },
  { id: 'db_row', name: 'חתירה עם משקולת', muscle: 'back', secondary: ['lats'], cat: 'FreeWeights', pattern: 'horiz_pull', rest: 120, compound: true, yt: 'one arm dumbbell row' },
  { id: 'cable_row', name: 'חתירה בפולי תחתון', muscle: 'back', secondary: ['biceps'], cat: 'Cable', pattern: 'horiz_pull', rest: 120, compound: true, yt: 'seated cable row form' },
  { id: 'machine_row', name: 'חתירה במכונה', muscle: 'back', cat: 'Machine', pattern: 'horiz_pull', rest: 120, compound: true, yt: 'chest supported row machine' },
  { id: 'tbar_row', name: 'חתירת T-Bar', muscle: 'back', cat: 'FreeWeights', pattern: 'horiz_pull', rest: 150, compound: true, yt: 't bar row form' },

  { id: 'straight_arm_pulldown', name: 'משיכת פולי זרוע ישרה', muscle: 'lats', cat: 'Cable', pattern: 'lat_iso', rest: 75, compound: false, yt: 'straight arm pulldown' },
  { id: 'db_shrug', name: 'משיכת כתפיים (שראגס)', muscle: 'traps', cat: 'FreeWeights', pattern: 'shrug', rest: 90, compound: false, yt: 'dumbbell shrug form' },

  /* ================= PULL — biceps ================= */
  { id: 'bb_curl', name: 'כפיפת מרפקים במוט', muscle: 'biceps', cat: 'FreeWeights', pattern: 'elbow_flex', bar: true, rest: 90, compound: false, yt: 'barbell curl form' },
  { id: 'db_curl', name: 'כפיפת מרפקים משקולות', muscle: 'biceps', cat: 'FreeWeights', pattern: 'elbow_flex', rest: 90, compound: false, yt: 'dumbbell biceps curl' },
  { id: 'hammer_curl', name: 'כפיפת פטיש', muscle: 'biceps', secondary: ['forearms'], cat: 'FreeWeights', pattern: 'elbow_flex', rest: 90, compound: false, yt: 'hammer curl form' },
  { id: 'cable_curl', name: 'כפיפת מרפקים בכבל', muscle: 'biceps', cat: 'Cable', pattern: 'elbow_flex', rest: 90, compound: false, yt: 'cable biceps curl' },
  { id: 'preacher_curl', name: 'כפיפה בכיסא סקוט', muscle: 'biceps', cat: 'Machine', pattern: 'elbow_flex', rest: 90, compound: false, yt: 'preacher curl form' },
  { id: 'band_curl', name: 'כפיפת מרפקים ברצועה', muscle: 'biceps', cat: 'Bands', pattern: 'elbow_flex', rest: 75, compound: false, yt: 'resistance band curl' },

  /* ================= LEGS ================= */
  { id: 'bb_squat', name: 'סקוואט במוט', muscle: 'quads', secondary: ['glutes', 'core'], cat: 'FreeWeights', pattern: 'squat', bar: true, rest: 210, compound: true, yt: 'barbell back squat form', cue: 'ברכיים החוצה, גו זקוף' },
  { id: 'front_squat', name: 'סקוואט קדמי', muscle: 'quads', secondary: ['core'], cat: 'FreeWeights', pattern: 'squat', bar: true, rest: 210, compound: true, yt: 'front squat form' },
  { id: 'hack_squat', name: 'האק סקוואט', muscle: 'quads', cat: 'Machine', pattern: 'squat', rest: 180, compound: true, yt: 'hack squat machine' },
  { id: 'leg_press', name: 'לחיצת רגליים', muscle: 'quads', secondary: ['glutes'], cat: 'Machine', pattern: 'squat', rest: 180, compound: true, yt: 'leg press form' },
  { id: 'goblet_squat', name: 'גובלט סקוואט', muscle: 'quads', cat: 'FreeWeights', pattern: 'squat', rest: 120, compound: true, yt: 'goblet squat form' },
  { id: 'bulgarian_split', name: 'סקוואט בולגרי', muscle: 'quads', secondary: ['glutes'], cat: 'FreeWeights', pattern: 'lunge', rest: 120, compound: true, yt: 'bulgarian split squat' },
  { id: 'walking_lunge', name: 'מכרעים בהליכה', muscle: 'quads', secondary: ['glutes'], cat: 'FreeWeights', pattern: 'lunge', rest: 120, compound: true, yt: 'walking lunge form' },
  { id: 'step_up', name: 'עליית מדרגה', muscle: 'glutes', secondary: ['quads'], cat: 'Bodyweight', pattern: 'lunge', rest: 90, compound: true, yt: 'step up exercise form' },

  { id: 'rdl', name: 'דדליפט רומני', muscle: 'hamstrings', secondary: ['glutes', 'spine'], cat: 'FreeWeights', pattern: 'hinge', bar: true, rest: 180, compound: true, yt: 'romanian deadlift form', cue: 'ירכיים אחורה, מוט צמוד לרגל' },
  { id: 'deadlift', name: 'דדליפט', muscle: 'hamstrings', secondary: ['back', 'glutes'], cat: 'FreeWeights', pattern: 'hinge', bar: true, rest: 240, compound: true, yt: 'conventional deadlift form' },
  { id: 'db_rdl', name: 'דדליפט רומני משקולות', muscle: 'hamstrings', cat: 'FreeWeights', pattern: 'hinge', rest: 150, compound: true, yt: 'dumbbell romanian deadlift' },
  { id: 'back_extension', name: 'יישור גו (היפר)', muscle: 'spine', secondary: ['glutes', 'hamstrings'], cat: 'Bodyweight', pattern: 'hinge', rest: 90, compound: false, yt: 'back extension form' },

  { id: 'leg_curl', name: 'כפיפת ברכיים במכונה', muscle: 'hamstrings', cat: 'Machine', pattern: 'knee_flex', rest: 90, compound: false, yt: 'lying leg curl form' },
  { id: 'seated_leg_curl', name: 'כפיפת ברכיים בישיבה', muscle: 'hamstrings', cat: 'Machine', pattern: 'knee_flex', rest: 90, compound: false, yt: 'seated leg curl' },
  { id: 'nordic_curl', name: 'נורדיק קרל', muscle: 'hamstrings', cat: 'Bodyweight', pattern: 'knee_flex', rest: 120, compound: false, yt: 'nordic hamstring curl' },

  { id: 'leg_extension', name: 'פשיטת ברכיים', muscle: 'quads', cat: 'Machine', pattern: 'knee_ext', rest: 90, compound: false, yt: 'leg extension form' },

  { id: 'hip_thrust', name: 'הרמת אגן (היפ ת׳רסט)', muscle: 'glutes', secondary: ['hamstrings'], cat: 'FreeWeights', pattern: 'hip_ext', bar: true, rest: 150, compound: true, yt: 'barbell hip thrust form' },
  { id: 'glute_bridge', name: 'גשר ישבן', muscle: 'glutes', cat: 'Bodyweight', pattern: 'hip_ext', rest: 90, compound: false, yt: 'glute bridge form' },
  { id: 'cable_kickback', name: 'בעיטה אחורה בכבל', muscle: 'glutes', cat: 'Cable', pattern: 'hip_ext', rest: 75, compound: false, yt: 'cable glute kickback' },
  { id: 'band_abduction', name: 'הרחקת ירך ברצועה', muscle: 'glutes', cat: 'Bands', pattern: 'hip_abd', rest: 60, compound: false, yt: 'banded hip abduction' },
  { id: 'machine_abduction', name: 'הרחקת ירך במכונה', muscle: 'glutes', cat: 'Machine', pattern: 'hip_abd', rest: 75, compound: false, yt: 'hip abduction machine' },

  { id: 'standing_calf', name: 'עליות עקב בעמידה', muscle: 'calves', cat: 'Machine', pattern: 'calf', rest: 75, compound: false, yt: 'standing calf raise form' },
  { id: 'seated_calf', name: 'עליות עקב בישיבה', muscle: 'calves', cat: 'Machine', pattern: 'calf', rest: 75, compound: false, yt: 'seated calf raise' },
  { id: 'bw_calf', name: 'עליות עקב על מדרגה', muscle: 'calves', cat: 'Bodyweight', pattern: 'calf', rest: 60, compound: false, yt: 'bodyweight calf raise' },

  /* ================= CORE ================= */
  { id: 'hanging_leg_raise', name: 'הרמת רגליים בתלייה', muscle: 'abs', secondary: ['hipflexors'], cat: 'Bodyweight', pattern: 'ab_flex', rest: 75, compound: false, yt: 'hanging leg raise form' },
  { id: 'cable_crunch', name: 'כפיפות בטן בכבל', muscle: 'abs', cat: 'Cable', pattern: 'ab_flex', rest: 75, compound: false, yt: 'cable crunch form' },
  { id: 'reverse_crunch', name: 'כפיפת בטן הפוכה', muscle: 'abs', cat: 'Bodyweight', pattern: 'ab_flex', rest: 60, compound: false, yt: 'reverse crunch form' },
  { id: 'plank', name: 'פלאנק', muscle: 'core', cat: 'Bodyweight', pattern: 'ab_brace', rest: 60, compound: false, yt: 'plank proper form' },
  { id: 'dead_bug', name: 'דד באג', muscle: 'core', cat: 'Bodyweight', pattern: 'ab_brace', rest: 45, compound: false, yt: 'dead bug exercise', cue: 'גב תחתון צמוד לרצפה' },
  { id: 'pallof_press', name: 'לחיצת פאלוף', muscle: 'core', cat: 'Cable', pattern: 'ab_brace', rest: 60, compound: false, yt: 'pallof press form' },
  { id: 'side_plank', name: 'פלאנק צד', muscle: 'core', cat: 'Bodyweight', pattern: 'ab_brace', rest: 45, compound: false, yt: 'side plank form' },

  /* ================= POSTURE / MOBILITY ================= */
  { id: 'hip_flexor_stretch', name: 'מתיחת כופפי ירך', muscle: 'hipflexors', cat: 'Bodyweight', pattern: 'mobility', rest: 30, compound: false, yt: 'couch stretch hip flexor', cue: 'הטיית אגן אחורה לפני המתיחה' },
  { id: 'glute_activation', name: 'אקטיבציית ישבן', muscle: 'glutes', cat: 'Bands', pattern: 'mobility', rest: 30, compound: false, yt: 'glute activation exercises' },
  { id: 'chin_tuck', name: 'משיכת סנטר', muscle: 'spine', cat: 'Bodyweight', pattern: 'mobility', rest: 30, compound: false, yt: 'chin tuck exercise forward head' },
  { id: 'wall_angel', name: 'מלאך קיר', muscle: 'shoulders', cat: 'Bodyweight', pattern: 'mobility', rest: 30, compound: false, yt: 'wall angels exercise' },
  { id: 'thoracic_ext', name: 'פתיחת גב עליון על גליל', muscle: 'spine', cat: 'Bodyweight', pattern: 'mobility', rest: 30, compound: false, yt: 'thoracic extension foam roller' },
  { id: 'pigeon_stretch', name: 'מתיחת יונה', muscle: 'glutes', cat: 'Bodyweight', pattern: 'mobility', rest: 30, compound: false, yt: 'pigeon pose stretch' },
  { id: 'hamstring_stretch', name: 'מתיחת מיתר הברך', muscle: 'hamstrings', cat: 'Bodyweight', pattern: 'mobility', rest: 30, compound: false, yt: 'hamstring stretch standing' }
];

const BY_ID = new Map(EXERCISES.map((e) => [e.id, e]));

/**
 * Movements to route around when the user reports a sensitive joint.
 * These are programming defaults, not medical advice — every one of them can
 * still be chosen by hand from the library.
 */
export const LIMIT_BLOCKS = {
  shoulder: ['bb_ohp', 'db_shoulder_press', 'dips', 'db_fly', 'bb_incline'],
  knee: ['bb_squat', 'front_squat', 'walking_lunge', 'bulgarian_split', 'step_up', 'hack_squat'],
  back: ['deadlift', 'bb_row', 'rdl', 'tbar_row', 'bb_squat'],
  wrist: ['bb_curl', 'skullcrusher', 'front_squat', 'pushup', 'close_grip_bench']
};

/** True when this exercise is allowed under the user's equipment and limits. */
export function isAllowed(id, { equipment = null, limits = [] } = {}) {
  const ex = BY_ID.get(id);
  if (!ex) return false;
  if (equipment && equipment.length && !equipment.includes(ex.cat)) return false;
  for (const l of limits) {
    if (LIMIT_BLOCKS[l]?.includes(id)) return false;
  }
  return true;
}

/* ---------- lookups ---------- */

export const getExercise = (id) => BY_ID.get(id) || null;

export const exerciseName = (id) => BY_ID.get(id)?.name || id;

/** Alternatives with the same movement pattern — this is the quick-swap list. */
export function substitutes(id) {
  const ex = BY_ID.get(id);
  if (!ex) return [];
  return EXERCISES
    .filter((o) => o.id !== id && o.pattern === ex.pattern)
    .sort((a, b) => (a.muscle === ex.muscle ? -1 : 1) - (b.muscle === ex.muscle ? -1 : 1));
}

/** Everything that trains the same primary muscle — the wider swap list. */
export function sameMuscle(id) {
  const ex = BY_ID.get(id);
  if (!ex) return [];
  return EXERCISES.filter((o) => o.id !== id && o.muscle === ex.muscle);
}

export function search(term, { cat = null, muscle = null } = {}) {
  const t = (term || '').trim();
  return EXERCISES.filter((e) => {
    if (cat && e.cat !== cat) return false;
    if (muscle && e.muscle !== muscle) return false;
    if (!t) return true;
    return e.name.includes(t) || e.id.includes(t.toLowerCase());
  });
}

export const ytUrl = (ex) =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(ex.yt || ex.name)}`;
