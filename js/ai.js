/* ==========================================================================
   ai.js — optional Claude API layer.
   Everything here is additive: the app is fully usable with no key at all.

   Two ways the coach can be powered, checked in this order:
     1. A hosted proxy at /api/coach, when whoever deployed the site set an
        API key on the server. Nothing is asked of the visitor, and the key
        never reaches the browser.
     2. The user's own key, kept only in this device's IndexedDB and sent
        straight to api.anthropic.com.
   A bundled key is deliberately not an option: anything shipped to the
   browser can be read out of it.
   ========================================================================== */

import * as db from './db.js';

const DIRECT = 'https://api.anthropic.com/v1/messages';
const PROXY = '/api/coach';
const MODEL = 'claude-sonnet-5';

/** Cached answer to "does this deployment host a coach?" — asked once. */
let hostedPromise = null;

export function hosted() {
  if (hostedPromise) return hostedPromise;
  if (location.protocol === 'file:') return (hostedPromise = Promise.resolve(false));
  hostedPromise = fetch(PROXY, { method: 'GET' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => !!j?.available)
    .catch(() => false);
  return hostedPromise;
}

/** Re-ask on the next call — used after settings change. */
export const forgetHosted = () => { hostedPromise = null; };

/**
 * Ask the server to make one real, one-token call and report what came back.
 * This is the answer to "the AI says 400 and I can't see why" — nobody is
 * going to open Netlify's function logs from a phone.
 * @returns {Promise<{ok:boolean, model?:string, error?:string, detail?:string}>}
 */
export async function checkHosted() {
  try {
    const res = await fetch(`${PROXY}?check=1`, { method: 'GET', cache: 'no-store' });
    if (!res.ok) return { ok: false, error: `השרת החזיר ${res.status}` };
    return await res.json();
  } catch {
    return { ok: false, error: 'אין חיבור לשרת. האם האתר פרוס ב-Netlify עם פונקציות?' };
  }
}

export async function hasKey() {
  if (await hosted()) return true;
  const k = await db.setting('apiKey', '');
  return !!(k && k.length > 10);
}

export const getKey = () => db.setting('apiKey', '');
export const setKey = (k) => db.setSetting('apiKey', (k || '').trim());

/** Stable per-install id so the server can meter usage without accounts. */
async function deviceId() {
  let id = await db.setting('deviceId', '');
  if (!id) {
    id = db.uid('dev');
    await db.setSetting('deviceId', id);
  }
  return id;
}

async function call(messages, { system, maxTokens = 1200 } = {}) {
  /* No `temperature` (or top_p/top_k): current-generation models — Sonnet 5
     included — reject sampling params with a 400, on both the hosted proxy
     and a direct (BYOK) call. */
  const body = {
    model: MODEL,
    max_tokens: maxTokens,
    ...(system ? { system } : {}),
    messages
  };

  let res;
  if (await hosted()) {
    res = await fetch(PROXY, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...body, device: await deviceId() })
    });
    if (res.status === 503) {
      /* The key was removed after we asked; fall through to a personal one. */
      hostedPromise = Promise.resolve(false);
      return call(messages, { system, maxTokens });
    }
    if (!res.ok) {
      /* The proxy already turned the upstream failure into a sentence worth
         reading; `detail` is the API's own wording, kept because "credit
         balance too low" and "malformed request" both arrive as a 400 and
         only the text tells them apart. */
      const j = await res.json().catch(() => null);
      const msg = j?.error || `שגיאת AI ${res.status}`;
      throw new Error(j?.detail ? `${msg}\n(${j.detail})` : msg);
    }
  } else {
    const key = await getKey();
    if (!key) throw new Error('לא הוגדר מפתח API בהגדרות');
    res = await fetch(DIRECT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let detail = text.slice(0, 200);
      try { detail = JSON.parse(text)?.error?.message || detail; } catch { /* keep raw */ }
      throw new Error(`שגיאת API ${res.status}: ${detail}`);
    }
  }

  const data = await res.json();
  return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
}

/** Strip markdown fences and parse the first JSON object/array in a reply. */
function parseJSON(text) {
  const cleaned = text.replace(/^```(?:json)?/gm, '').replace(/```$/gm, '').trim();
  const start = cleaned.search(/[{[]/);
  if (start < 0) throw new Error('התשובה לא הכילה JSON');
  const slice = cleaned.slice(start);
  let depth = 0, end = -1, inStr = false, esc = false;
  for (let i = 0; i < slice.length; i++) {
    const ch = slice[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') { depth--; if (!depth) { end = i + 1; break; } }
  }
  return JSON.parse(slice.slice(0, end > 0 ? end : undefined));
}

/* ---------- nutrition ---------- */

const MEAL_SCHEMA = `החזר אך ורק JSON בצורה:
{"items":[{"label":"שם המאכל בעברית","amount":"כמות משוערת","grams":0,"cat":"protein|dairy|carb|produce|fat|sweet|drink|dish","kcal":0,"p":0,"c":0,"f":0}],
 "note":"הערה קצרה בעברית על רמת הוודאות"}
grams=המשקל המשוער של הפריט בגרמים (או מ״ל למשקה). p=חלבון בגרמים, c=פחמימות, f=שומן. cat=הקטגוריה הדומיננטית של הפריט מתוך האפשרויות בדיוק כפי שכתובות.
label=שם המאכל בלבד, בלי כמות (למשל "עוגת גבינה", לא "פרוסת עוגת גבינה גדולה").
אל תוסיף טקסט מחוץ ל-JSON.`;

export async function analyzeMealText(text) {
  const out = await call(
    [{ role: 'user', content: `נתח את הארוחה הבאה והערך ערכים תזונתיים:\n"${text}"` }],
    { system: `אתה תזונאי ספורט. ${MEAL_SCHEMA}` }
  );
  return parseJSON(out);
}

/**
 * @param {string} dataUrl base64 data URL of the photo
 */
export async function analyzeMealPhoto(dataUrl, hint = '') {
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(dataUrl);
  if (!m) throw new Error('פורמט תמונה לא נתמך');

  /* The API accepts exactly four media types, and rejects anything else with
     a 400 that says nothing useful on a phone. `image/jpg` in particular is
     what several cameras report and is not one of them. */
  const ALLOWED = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const type = m[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : m[1].toLowerCase();
  if (!ALLOWED.includes(type)) throw new Error(`סוג התמונה (${type}) לא נתמך — צלם מחדש או בחר קובץ JPEG/PNG`);

  const content = [
    { type: 'image', source: { type: 'base64', media_type: type, data: m[2] } },
    { type: 'text', text: `זהה את המרכיבים בצלחת והערך כמויות וערכים תזונתיים.${hint ? ` רמז מהמשתמש: ${hint}` : ''}` }
  ];
  const out = await call([{ role: 'user', content }], {
    system: `אתה תזונאי ספורט המעריך מנות מתמונה. ${MEAL_SCHEMA}`,
    maxTokens: 1500
  });
  return parseJSON(out);
}

/**
 * One food the offline database doesn't know, described per 100 g so it can
 * be stored beside the database's own foods and measured the same way.
 * @returns {Promise<{name:string,cat:string,kcal:number,p:number,c:number,f:number,unitG:number|null,unitLabel:string|null,defG:number,note?:string}>}
 */
export async function lookupFood(query) {
  const out = await call(
    [{ role: 'user', content: `המשתמש מחפש את המאכל: "${query}". תן ערכים תזונתיים ל-100 גרם (או 100 מ״ל למשקה), כפי שהם מופיעים בטבלה תזונתית או במאגר USDA. אם זה מוצר ישראלי מוכר — לפי התווית שלו.` }],
    {
      system: `אתה תזונאי. החזר אך ורק JSON בצורה:
{"name":"שם המאכל בעברית","cat":"protein|dairy|carb|produce|fat|sweet|drink|dish","kcal":0,"p":0,"c":0,"f":0,"unitG":null,"unitLabel":null,"defG":100,"note":"הערה קצרה"}
kcal/p/c/f ל-100 גרם. unitG=משקל יחידה טבעית אחת בגרמים (פרוסה, חטיף, גביע) ו-unitLabel=שמה, או null אם אין. defG=מנה רגילה בגרמים.
אל תוסיף טקסט מחוץ ל-JSON.`,
      maxTokens: 400
    }
  );
  const j = parseJSON(out);
  const n = (v) => Math.max(0, Number(v) || 0);
  if (!j || !j.name || !(n(j.kcal) || n(j.p) || n(j.c) || n(j.f))) throw new Error('לא התקבלו ערכים למאכל הזה');
  return {
    name: String(j.name).trim(), cat: j.cat || 'dish',
    kcal: n(j.kcal), p: n(j.p), c: n(j.c), f: n(j.f),
    unitG: n(j.unitG) || null, unitLabel: j.unitLabel || null,
    defG: n(j.defG) || 100, note: j.note || ''
  };
}

/* ---------- coach ---------- */

const COACH_SYSTEM = `אתה מאמן כושר אישי מקצועי שמדבר עברית.
אתה מקבל את מצב האימון הנוכחי של המתאמן ואת ההיסטוריה שלו.
ענה קצר, ענייני ומעשי. אל תמציא נתונים שלא קיבלת.

אם המשתמש מבקש שינוי מעשי באימון הנוכחי, סיים את תשובתך בבלוק פעולה בשורה נפרדת:
<<ACTION>>{"type":"swap","slot":<מספר התרגיל מ-0>,"to":"<exercise_id>"}<<END>>
<<ACTION>>{"type":"drop","slot":<מספר>}<<END>>
<<ACTION>>{"type":"sets","slot":<מספר>,"sets":<כמות>}<<END>>
<<ACTION>>{"type":"weight","slot":<מספר>,"weight":<ק״ג>}<<END>>
<<ACTION>>{"type":"rest","slot":<מספר>,"seconds":<שניות>}<<END>>
השתמש רק במזהי תרגילים מהרשימה שקיבלת. בלי בלוק פעולה אם לא נדרש שינוי.`;

/**
 * @returns {{text:string, actions:Array<object>}}
 */
export async function coach(messages, context) {
  const sys = `${COACH_SYSTEM}\n\nהקשר נוכחי:\n${JSON.stringify(context, null, 1)}`;
  const raw = await call(messages, { system: sys, maxTokens: 1400 });

  const actions = [];
  const text = raw.replace(/<<ACTION>>([\s\S]*?)<<END>>/g, (_, json) => {
    try { actions.push(JSON.parse(json.trim())); } catch { /* ignore malformed */ }
    return '';
  }).trim();

  return { text, actions };
}

/* ---------- weekly review ---------- */

export async function weeklyReview(summary) {
  return call(
    [{ role: 'user', content: `הנה סיכום האימונים שלי מהשבועות האחרונים:\n${JSON.stringify(summary, null, 1)}\n\nנתח מגמות נפח, זהה תקיעות והמלץ אם צריך שבוע דלואוד. ענה בעברית, עד 200 מילים, בנקודות.` }],
    { system: 'אתה מאמן כוח ומדען אימון. תשובות קצרות ומעשיות בעברית.', maxTokens: 900 }
  );
}
