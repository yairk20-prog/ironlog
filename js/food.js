/* ==========================================================================
   food.js — offline Hebrew food parser.
   Turns free text like "שתי ביצים וסקופ חלבון" into macro rows without any
   network call. The AI path (vision / chat) refines this when a key is set,
   but the app must stay useful with the phone in airplane mode.
   ========================================================================== */

/* per: 'unit' → macros are per single item; 'g100' → per 100 g */
const DB = [
  // protein
  { cat: 'protein', k: ['ביצה', 'ביצים'], name: 'ביצה', per: 'unit', g: 55, kcal: 78, p: 6.3, c: 0.6, f: 5.3 },
  { cat: 'protein', k: ['חלבון בלבן', 'חלבון ביצה'], name: 'חלבון ביצה', per: 'unit', g: 33, kcal: 17, p: 3.6, c: 0.2, f: 0.1 },
  { cat: 'protein', k: ['סקופ חלבון', 'אבקת חלבון', 'שייק חלבון', 'סקופ', 'ווי', 'whey'], name: 'סקופ אבקת חלבון', per: 'unit', g: 30, kcal: 120, p: 24, c: 2.5, f: 1.5 },
  { cat: 'protein', k: ['חזה עוף', 'עוף'], name: 'חזה עוף', per: 'g100', kcal: 165, p: 31, c: 0, f: 3.6, defG: 150 },
  { cat: 'protein', k: ['שוקיים', 'ירך עוף'], name: 'ירך עוף', per: 'g100', kcal: 209, p: 26, c: 0, f: 11, defG: 150 },
  { cat: 'protein', k: ['בקר', 'בשר', 'אנטריקוט', 'סטייק', 'המבורגר'], name: 'בשר בקר', per: 'g100', kcal: 250, p: 26, c: 0, f: 17, defG: 150 },
  { cat: 'protein', k: ['הודו'], name: 'הודו', per: 'g100', kcal: 135, p: 29, c: 0, f: 1.7, defG: 150 },
  { cat: 'protein', k: ['סלמון'], name: 'סלמון', per: 'g100', kcal: 208, p: 20, c: 0, f: 13, defG: 150 },
  { cat: 'protein', k: ['טונה'], name: 'טונה במים', per: 'g100', kcal: 116, p: 26, c: 0, f: 1, defG: 140 },
  { cat: 'protein', k: ['דג', 'דניס', 'מושט'], name: 'דג לבן', per: 'g100', kcal: 120, p: 22, c: 0, f: 3, defG: 150 },
  { cat: 'protein', k: ['טופו'], name: 'טופו', per: 'g100', kcal: 76, p: 8, c: 1.9, f: 4.8, defG: 150 },
  { cat: 'protein', k: ['שניצל'], name: 'שניצל', per: 'g100', kcal: 290, p: 20, c: 18, f: 15, defG: 150 },

  // dairy
  { cat: 'dairy', k: ['קוטג', 'קוטג׳'], name: 'קוטג׳ 5%', per: 'g100', kcal: 103, p: 11, c: 3.5, f: 5, defG: 250 },
  { cat: 'dairy', k: ['יוגורט יווני', 'סקיר'], name: 'יוגורט יווני', per: 'g100', kcal: 59, p: 10, c: 3.6, f: 0.4, defG: 170 },
  { cat: 'dairy', k: ['יוגורט'], name: 'יוגורט', per: 'g100', kcal: 61, p: 3.5, c: 4.7, f: 3.3, defG: 150 },
  { cat: 'dairy', k: ['גבינה צהובה', 'גבינה'], name: 'גבינה צהובה', per: 'g100', kcal: 350, p: 25, c: 1.3, f: 27, defG: 30 },
  { cat: 'dairy', k: ['גבינה לבנה'], name: 'גבינה לבנה 5%', per: 'g100', kcal: 92, p: 9, c: 3.8, f: 5, defG: 100 },
  { cat: 'dairy', k: ['חלב'], name: 'חלב 3%', per: 'g100', kcal: 61, p: 3.3, c: 4.7, f: 3.3, defG: 200 },
  { cat: 'dairy', k: ['לבן', 'אשל'], name: 'לבן 3%', per: 'g100', kcal: 62, p: 3.3, c: 4, f: 3, defG: 200 },

  // carbs
  { cat: 'carb', k: ['אורז'], name: 'אורז מבושל', per: 'g100', kcal: 130, p: 2.7, c: 28, f: 0.3, defG: 200 },
  { cat: 'carb', k: ['פסטה', 'ספגטי'], name: 'פסטה מבושלת', per: 'g100', kcal: 158, p: 5.8, c: 31, f: 0.9, defG: 200 },
  { cat: 'carb', k: ['תפוח אדמה', 'תפוחי אדמה', 'פירה'], name: 'תפוח אדמה', per: 'g100', kcal: 87, p: 2, c: 20, f: 0.1, defG: 200 },
  { cat: 'carb', k: ['בטטה'], name: 'בטטה', per: 'g100', kcal: 90, p: 2, c: 21, f: 0.2, defG: 200 },
  { cat: 'carb', k: ['קוסקוס'], name: 'קוסקוס', per: 'g100', kcal: 112, p: 3.8, c: 23, f: 0.2, defG: 200 },
  { cat: 'carb', k: ['קינואה'], name: 'קינואה', per: 'g100', kcal: 120, p: 4.4, c: 21, f: 1.9, defG: 180 },
  { cat: 'carb', k: ['לחם', 'פרוסת לחם', 'פרוסות לחם'], name: 'פרוסת לחם', per: 'unit', g: 30, kcal: 80, p: 3, c: 15, f: 1 },
  { cat: 'carb', k: ['פיתה', 'פיתות'], name: 'פיתה', per: 'unit', g: 70, kcal: 190, p: 6, c: 38, f: 1 },
  { cat: 'carb', k: ['לחמניה', 'לחמנייה', 'לחמניות'], name: 'לחמנייה', per: 'unit', g: 70, kcal: 200, p: 6, c: 37, f: 3 },
  { cat: 'carb', k: ['שיבולת שועל', 'קוואקר', 'שיבולת'], name: 'שיבולת שועל', per: 'g100', kcal: 380, p: 13, c: 67, f: 7, defG: 60 },
  { cat: 'carb', k: ['גרנולה'], name: 'גרנולה', per: 'g100', kcal: 450, p: 9, c: 64, f: 17, defG: 50 },
  { cat: 'carb', k: ['קורנפלקס', 'דגני בוקר'], name: 'דגני בוקר', per: 'g100', kcal: 380, p: 7, c: 84, f: 1, defG: 40 },
  { cat: 'carb', k: ['חומוס'], name: 'חומוס', per: 'g100', kcal: 166, p: 9, c: 27, f: 2.6, defG: 100 },
  { cat: 'carb', k: ['עדשים'], name: 'עדשים מבושלות', per: 'g100', kcal: 116, p: 9, c: 20, f: 0.4, defG: 150 },
  { cat: 'carb', k: ['שעועית'], name: 'שעועית', per: 'g100', kcal: 127, p: 8.7, c: 23, f: 0.5, defG: 150 },

  // fruit & veg
  { cat: 'produce', k: ['בננה', 'בננות'], name: 'בננה', per: 'unit', g: 120, kcal: 105, p: 1.3, c: 27, f: 0.4 },
  { cat: 'produce', k: ['תפוח', 'תפוחים'], name: 'תפוח', per: 'unit', g: 180, kcal: 95, p: 0.5, c: 25, f: 0.3 },
  { cat: 'produce', k: ['תמר', 'תמרים'], name: 'תמר', per: 'unit', g: 24, kcal: 66, p: 0.4, c: 18, f: 0 },
  { cat: 'produce', k: ['אבוקדו'], name: 'אבוקדו', per: 'unit', g: 150, kcal: 240, p: 3, c: 12, f: 22 },
  { cat: 'produce', k: ['עגבניה', 'עגבנייה', 'עגבניות'], name: 'עגבנייה', per: 'unit', g: 120, kcal: 22, p: 1.1, c: 4.8, f: 0.2 },
  { cat: 'produce', k: ['מלפפון', 'מלפפונים'], name: 'מלפפון', per: 'unit', g: 100, kcal: 15, p: 0.7, c: 3.6, f: 0.1 },
  { cat: 'produce', k: ['סלט ירקות', 'סלט'], name: 'סלט ירקות', per: 'g100', kcal: 30, p: 1.2, c: 5, f: 0.5, defG: 200 },
  { cat: 'produce', k: ['ברוקולי'], name: 'ברוקולי', per: 'g100', kcal: 34, p: 2.8, c: 7, f: 0.4, defG: 150 },

  // fats & extras
  { cat: 'fat', k: ['שמן זית', 'שמן'], name: 'שמן זית', per: 'g100', kcal: 884, p: 0, c: 0, f: 100, defG: 10 },
  { cat: 'fat', k: ['טחינה'], name: 'טחינה', per: 'g100', kcal: 595, p: 17, c: 21, f: 54, defG: 20 },
  { cat: 'fat', k: ['חמאת בוטנים', 'חמאת אגוזים'], name: 'חמאת בוטנים', per: 'g100', kcal: 588, p: 25, c: 20, f: 50, defG: 20 },
  { cat: 'fat', k: ['שקדים'], name: 'שקדים', per: 'g100', kcal: 579, p: 21, c: 22, f: 50, defG: 30 },
  { cat: 'fat', k: ['אגוזים', 'אגוז'], name: 'אגוזים', per: 'g100', kcal: 654, p: 15, c: 14, f: 65, defG: 30 },
  { cat: 'fat', k: ['שוקולד'], name: 'שוקולד', per: 'g100', kcal: 546, p: 5, c: 61, f: 31, defG: 30 },
  { cat: 'fat', k: ['חלבון בר', 'חטיף חלבון', 'פרוטאין בר'], name: 'חטיף חלבון', per: 'unit', g: 60, kcal: 200, p: 20, c: 20, f: 6 },
  { cat: 'fat', k: ['במבה'], name: 'במבה', per: 'g100', kcal: 550, p: 13, c: 50, f: 33, defG: 60 },
  { cat: 'fat', k: ['פיצה'], name: 'משולש פיצה', per: 'unit', g: 120, kcal: 285, p: 12, c: 36, f: 10 },
  { cat: 'fat', k: ['שווארמה'], name: 'מנת שווארמה', per: 'unit', g: 300, kcal: 700, p: 40, c: 55, f: 35 },
  { cat: 'fat', k: ['פלאפל'], name: 'כדור פלאפל', per: 'unit', g: 25, kcal: 80, p: 3, c: 7, f: 5 },
  { cat: 'fat', k: ['בירה'], name: 'בירה', per: 'unit', g: 330, kcal: 140, p: 1.5, c: 11, f: 0 },
  { cat: 'fat', k: ['קפה הפוך', 'קפוצ׳ינו'], name: 'קפה הפוך', per: 'unit', g: 200, kcal: 90, p: 5, c: 8, f: 4 }
];

const NUM_WORDS = {
  'חצי': 0.5, 'רבע': 0.25,
  'אחת': 1, 'אחד': 1, 'אחדת': 1,
  'שתי': 2, 'שני': 2, 'שניים': 2, 'שתיים': 2, 'זוג': 2,
  'שלוש': 3, 'שלושה': 3, 'שלש': 3,
  'ארבע': 4, 'ארבעה': 4,
  'חמש': 5, 'חמישה': 5,
  'שש': 6, 'שישה': 6,
  'שבע': 7, 'שבעה': 7,
  'שמונה': 8,
  'תשע': 9, 'תשעה': 9,
  'עשר': 10, 'עשרה': 10
};

/* unit → grams (approximate household measures) */
const UNIT_G = {
  'כוס': 200, 'כוסות': 200,
  'כף': 15, 'כפות': 15,
  'כפית': 5, 'כפיות': 5,
  'סקופ': 30, 'סקופים': 30,
  'פרוסה': 30, 'פרוסות': 30,
  'קופסה': 150, 'קופסת': 150,
  'מנה': 200, 'מנות': 200,
  'קילו': 1000, 'קילוגרם': 1000,
  'יחידה': 0, 'יחידות': 0
};

const GRAM_WORDS = new Set(['גרם', 'גר', 'ג׳', 'ג', 'g', 'גראם']);

/* alias → entry, keyed by the exact token phrase */
const ALIAS = new Map();
let MAX_WORDS = 1;
for (const entry of DB) {
  for (const alias of entry.k) {
    ALIAS.set(alias, entry);
    MAX_WORDS = Math.max(MAX_WORDS, alias.split(' ').length);
  }
}

const clean = (w) => w.replace(/[.,!?;:״"׳'()]/g, '').trim();

/** "ובננה" → "בננה". Only the conjunctive vav, and only when something is left. */
const dropVav = (w) => (w.length > 2 && w.startsWith('ו') ? w.slice(1) : null);

/**
 * Parse a free-text meal description into macro rows.
 * Scans the whole sentence for food phrases rather than splitting on
 * punctuation, so "שתי ביצים וסקופ חלבון" yields both foods.
 *
 * @returns {{items:Array, total:{kcal:number,p:number,c:number,f:number}, unmatched:string[]}}
 */
export function parseMeal(text) {
  const raw = (text || '').replace(/\s+/g, ' ').trim();
  if (!raw) return { items: [], total: zero(), unmatched: [] };

  const tokens = raw.split(' ').map(clean).filter(Boolean);

  /* 1. locate non-overlapping food phrases, longest phrase first */
  const matches = [];
  let i = 0;
  while (i < tokens.length) {
    let hit = null;
    for (let n = Math.min(MAX_WORDS, tokens.length - i); n >= 1 && !hit; n--) {
      const slice = tokens.slice(i, i + n);
      const candidates = [slice.join(' ')];
      const stripped = dropVav(slice[0]);
      if (stripped) candidates.push([stripped, ...slice.slice(1)].join(' '));
      for (const c of candidates) {
        const entry = ALIAS.get(c);
        if (entry) { hit = { entry, start: i, end: i + n }; break; }
      }
    }
    if (hit) { matches.push(hit); i = hit.end; } else i++;
  }

  if (!matches.length) return { items: [], total: zero(), unmatched: [raw] };

  /* 2. give each match the quantity words nearest to it */
  const items = [];
  const used = new Set();
  matches.forEach((m, idx) => {
    for (let k = m.start; k < m.end; k++) used.add(k);
    const prevEnd = idx === 0 ? 0 : matches[idx - 1].end;
    const nextStart = idx === matches.length - 1 ? tokens.length : matches[idx + 1].start;
    const before = tokens.slice(prevEnd, m.start);
    const after = tokens.slice(m.end, nextStart);
    const qty = readQuantity(before, after, used, prevEnd, m.end);
    items.push(toItem(m.entry, qty));
  });

  /* 3. report words that matched nothing, so the user can correct them */
  const unmatched = tokens
    .map((t, k) => (used.has(k) ? null : t))
    .filter((t) => t && t.length > 2 && !NUM_WORDS[t] && !UNIT_G[t] && !GRAM_WORDS.has(t) && !/^\d/.test(t) && !isFiller(t));

  const total = items.reduce((t, it) => ({
    kcal: t.kcal + it.kcal, p: t.p + it.p, c: t.c + it.c, f: t.f + it.f
  }), zero());

  return { items, total: roundAll(total), unmatched: Array.from(new Set(unmatched)) };
}

const FILLERS = new Set(['עם', 'ועוד', 'ואז', 'של', 'בערך', 'בערן', 'אכלתי', 'שתיתי', 'היום', 'בבוקר', 'בצהריים', 'בערב', 'ארוחת', 'ארוחה']);
const isFiller = (w) => FILLERS.has(w) || FILLERS.has(dropVav(w) || '');

/**
 * Read a quantity from the words around a food phrase.
 * Preference: explicit grams → household unit → bare count → default portion.
 */
function readQuantity(before, after, used, beforeStart, afterStart) {
  const scan = (list, offset) => {
    let count = null, unit = null, grams = null;
    list.forEach((w, k) => {
      const bare = dropVav(w) || w;
      const num = /^\d+(?:\.\d+)?$/.test(w) ? Number(w) : (NUM_WORDS[bare] ?? null);
      if (num != null && count == null) { count = num; used.add(offset + k); }
      if (GRAM_WORDS.has(bare) && count != null && grams == null) { grams = count; used.add(offset + k); }
      if (UNIT_G[bare] != null && UNIT_G[bare] > 0 && unit == null) { unit = UNIT_G[bare]; used.add(offset + k); }
    });
    return { count, unit, grams };
  };

  const b = scan(before, beforeStart);
  if (b.grams != null || b.unit != null || b.count != null) return b;
  return scan(after, afterStart);
}

function toItem(entry, { count, unit, grams }) {
  let kcal, p, c, f, amount;

  if (grams != null) {
    if (entry.per === 'unit') {
      const n = grams / entry.g;
      ({ kcal, p, c, f } = scaleUnit(entry, n));
      amount = `${Math.round(grams)} גרם`;
    } else {
      const n = grams / 100;
      ({ kcal, p, c, f } = scaleUnit(entry, n));
      amount = `${Math.round(grams)} גרם`;
    }
  } else if (unit != null) {
    const g = unit * (count || 1);
    const n = entry.per === 'unit' ? g / entry.g : g / 100;
    ({ kcal, p, c, f } = scaleUnit(entry, n));
    amount = `${Math.round(g)} גרם`;
  } else if (entry.per === 'unit') {
    const n = count || 1;
    ({ kcal, p, c, f } = scaleUnit(entry, n));
    amount = n === 1 ? 'יחידה אחת' : `${round1(n)} יחידות`;
  } else {
    const g = (entry.defG || 100) * (count || 1);
    ({ kcal, p, c, f } = scaleUnit(entry, g / 100));
    amount = `${Math.round(g)} גרם`;
  }

  return { label: entry.name, amount, cat: entry.cat, kcal: round1(kcal), p: round1(p), c: round1(c), f: round1(f) };
}

const scaleUnit = (e, n) => ({ kcal: e.kcal * n, p: e.p * n, c: e.c * n, f: e.f * n });

const zero = () => ({ kcal: 0, p: 0, c: 0, f: 0 });
const round1 = (n) => Math.round(n * 10) / 10;
const roundAll = (t) => ({ kcal: Math.round(t.kcal), p: round1(t.p), c: round1(t.c), f: round1(t.f) });

export const foodCount = DB.length;
