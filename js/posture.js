/* ==========================================================================
   posture.js — corrective protocols and the self-assessment that picks them.
   Two of the most common desk/lifting patterns are covered explicitly:
   anterior pelvic tilt and forward-head / rounded shoulders.
   ========================================================================== */

export const PROTOCOLS = {
  apt: {
    id: 'apt',
    name: 'אגן בהטיה קדמית (APT)',
    short: 'בטן בולטת, ישבן בולט, גב תחתון מקושת',
    why: 'כופפי ירך קצרים + ישבן וליבה חלשים מטים את האגן קדימה. הפרוטוקול מאריך את הקדמי ומחזק את האחורי.',
    blocks: [
      { ex: 'hip_flexor_stretch', sets: 2, seconds: 45, note: 'הטה אגן אחורה לפני שאתה נכנס למתיחה' },
      { ex: 'pigeon_stretch', sets: 2, seconds: 40 },
      { ex: 'glute_activation', sets: 2, reps: 15 },
      { ex: 'glute_bridge', sets: 3, reps: 12, note: 'סחוט ישבן שנייה בשיא' },
      { ex: 'dead_bug', sets: 3, reps: 8, note: 'גב תחתון צמוד לרצפה לאורך כל התנועה' },
      { ex: 'hamstring_stretch', sets: 2, seconds: 40 }
    ]
  },
  fhp: {
    id: 'fhp',
    name: 'ראש קדמי וכתפיים כפופות',
    short: 'סנטר קדימה, כתפיים מגולגלות פנימה',
    why: 'גב עליון נוקשה וכתף אחורית חלשה. משלבים ניידות חזה־גבית עם חיזוק מייצבי השכמה.',
    blocks: [
      { ex: 'thoracic_ext', sets: 2, seconds: 45 },
      { ex: 'chin_tuck', sets: 3, reps: 10, note: 'החזק 3 שניות בכל חזרה' },
      { ex: 'wall_angel', sets: 3, reps: 10 },
      { ex: 'band_pull_apart', sets: 3, reps: 15 },
      { ex: 'cable_face_pull', sets: 3, reps: 15, note: 'מרפקים גבוהים, סיבוב חיצוני בסוף' }
    ]
  },
  general: {
    id: 'general',
    name: 'ניידות כללית',
    short: 'שגרה קצרה לימי מנוחה',
    why: 'שמירה על טווחי תנועה בין אימונים, בלי עומס משמעותי.',
    blocks: [
      { ex: 'thoracic_ext', sets: 2, seconds: 40 },
      { ex: 'hip_flexor_stretch', sets: 2, seconds: 40 },
      { ex: 'pigeon_stretch', sets: 2, seconds: 40 },
      { ex: 'hamstring_stretch', sets: 2, seconds: 40 },
      { ex: 'side_plank', sets: 2, seconds: 30 }
    ]
  }
};

/** Self-assessment. Each answer adds weight to one pattern. */
export const QUESTIONS = [
  { q: 'כשאתה עומד זקוף מול מראה מהצד, הגב התחתון נראה מקושת בבירור?', tag: 'apt' },
  { q: 'הבטן התחתונה בולטת קדימה גם כשאתה לא רפוי?', tag: 'apt' },
  { q: 'כואב לך בגב התחתון אחרי עמידה ממושכת?', tag: 'apt' },
  { q: 'כשאתה נשען לקיר, קשה להצמיד את החלק האחורי של הראש בלי להרים את הסנטר?', tag: 'fhp' },
  { q: 'הכתפיים שלך מגולגלות פנימה כשהידיים משוחררות לצדדים?', tag: 'fhp' },
  { q: 'יש נוקשות או כאב בין השכמות אחרי יום מול מחשב?', tag: 'fhp' },
  { q: 'קשה להרים ידיים ישר מעל הראש בלי לקשת את הגב התחתון?', tag: 'both' }
];

/**
 * @param {Array<0|1|2>} answers  0 = לא, 1 = לפעמים, 2 = כן
 * @returns {{apt:number, fhp:number, primary:string, secondary:string|null}}
 */
export function scoreAssessment(answers) {
  let apt = 0, fhp = 0, maxApt = 0, maxFhp = 0;
  QUESTIONS.forEach((q, i) => {
    const v = answers[i] ?? 0;
    if (q.tag === 'apt' || q.tag === 'both') { apt += v; maxApt += 2; }
    if (q.tag === 'fhp' || q.tag === 'both') { fhp += v; maxFhp += 2; }
  });
  const aptPct = maxApt ? Math.round((apt / maxApt) * 100) : 0;
  const fhpPct = maxFhp ? Math.round((fhp / maxFhp) * 100) : 0;

  let primary = 'general';
  let secondary = null;
  if (aptPct >= 40 || fhpPct >= 40) {
    primary = aptPct >= fhpPct ? 'apt' : 'fhp';
    const other = primary === 'apt' ? 'fhp' : 'apt';
    if ((primary === 'apt' ? fhpPct : aptPct) >= 40) secondary = other;
  }
  return { apt: aptPct, fhp: fhpPct, primary, secondary };
}

/** Turn a protocol into workout slots the normal engine can run. */
export function protocolToSlots(protocolId, { short = false } = {}) {
  const p = PROTOCOLS[protocolId] || PROTOCOLS.general;
  const blocks = short ? p.blocks.slice(0, 4) : p.blocks;
  return blocks.map((b) => ({
    ex: b.ex,
    sets: short ? Math.max(1, b.sets - 1) : b.sets,
    seconds: b.seconds || null,
    targetWeight: 0,
    targetReps: b.reps || 0,
    action: 'hold',
    note: b.note || p.name,
    rest: 30,
    done: false
  }));
}

export const estimatedMinutes = (protocolId, short) => {
  const slots = protocolToSlots(protocolId, { short });
  return Math.max(4, Math.round(slots.reduce((m, s) => m + s.sets * ((s.seconds || 30) + 25) / 60, 0)));
};
