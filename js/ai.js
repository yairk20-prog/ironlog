/* ==========================================================================
   ai.js — optional Claude API layer.
   Everything here is additive: the app is fully usable with no key at all.
   The key is stored only in this device's IndexedDB and sent directly to
   api.anthropic.com from the browser.
   ========================================================================== */

import * as db from './db.js';

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-5';

export async function hasKey() {
  const k = await db.setting('apiKey', '');
  return !!(k && k.length > 10);
}

export const getKey = () => db.setting('apiKey', '');
export const setKey = (k) => db.setSetting('apiKey', (k || '').trim());

async function call(messages, { system, maxTokens = 1200, temperature = 0.2 } = {}) {
  const key = await getKey();
  if (!key) throw new Error('לא הוגדר מפתח API בהגדרות');

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      temperature,
      ...(system ? { system } : {}),
      messages
    })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`שגיאת API ${res.status}: ${body.slice(0, 160)}`);
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
{"items":[{"label":"שם המאכל בעברית","amount":"כמות משוערת","kcal":0,"p":0,"c":0,"f":0}],
 "note":"הערה קצרה בעברית על רמת הוודאות"}
p=חלבון בגרמים, c=פחמימות, f=שומן. אל תוסיף טקסט מחוץ ל-JSON.`;

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
  const m = /^data:(image\/[a-z]+);base64,(.+)$/i.exec(dataUrl);
  if (!m) throw new Error('פורמט תמונה לא נתמך');
  const content = [
    { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } },
    { type: 'text', text: `זהה את המרכיבים בצלחת והערך כמויות וערכים תזונתיים.${hint ? ` רמז מהמשתמש: ${hint}` : ''}` }
  ];
  const out = await call([{ role: 'user', content }], {
    system: `אתה תזונאי ספורט המעריך מנות מתמונה. ${MEAL_SCHEMA}`,
    maxTokens: 1500
  });
  return parseJSON(out);
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
  const raw = await call(messages, { system: sys, maxTokens: 1400, temperature: 0.4 });

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
    { system: 'אתה מאמן כוח ומדען אימון. תשובות קצרות ומעשיות בעברית.', maxTokens: 900, temperature: 0.5 }
  );
}
