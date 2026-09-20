/* ==========================================================================
   coach.js — the AI coach's server side.

   Why this exists: a static PWA cannot hold an API key. Anything shipped to
   the browser is readable by anyone who opens devtools, and a leaked key is
   someone else's bill. So when the site owner wants the coach to work for
   every visitor, the key lives here — in a Netlify environment variable that
   never leaves the server — and the browser talks to this function instead of
   to Anthropic.

   The function is deliberately narrow. It pins the model, caps the tokens and
   the payload, refuses anything but same-origin POSTs, and meters usage per
   device and per address, because an open pipe to a paid API is an open pipe
   to the owner's credit card.

   With no ANTHROPIC_API_KEY set it returns 503, and the app quietly falls back
   to the key the user entered themselves. Publishing the site without a key is
   therefore safe and costs nothing.
   ========================================================================== */

const ENDPOINT = 'https://api.anthropic.com/v1/messages';

/* Pinned here, not taken from the request: the caller must not be able to ask
   for a more expensive model than the owner agreed to pay for. */
const MODEL = process.env.COACH_MODEL || 'claude-sonnet-5';

const MAX_TOKENS = Number(process.env.COACH_MAX_TOKENS || 1500);
const MAX_BODY_BYTES = Number(process.env.COACH_MAX_BODY || 1_500_000); // a meal photo is ~1 MB
const DAILY_PER_DEVICE = Number(process.env.COACH_DAILY_PER_DEVICE || 40);
const DAILY_PER_IP = Number(process.env.COACH_DAILY_PER_IP || 120);

/* Warm-instance fallback for when durable storage is unavailable. It resets on
   every cold start, so it is a speed bump, not the real limit. */
const memory = new Map();

const today = () => new Date().toISOString().slice(0, 10);

const json = (status, body, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra }
});

/**
 * Count one request against a key and say whether it is over the cap.
 * Uses Netlify Blobs when the runtime provides it; an in-process map otherwise.
 */
async function overQuota(key, cap) {
  if (!cap) return false;
  const slot = `${today()}:${key}`;
  try {
    const { getStore } = await import('@netlify/blobs');
    const store = getStore('coach-quota');
    const used = Number((await store.get(slot)) || 0);
    if (used >= cap) return true;
    await store.set(slot, String(used + 1));
    return false;
  } catch {
    const used = memory.get(slot) || 0;
    if (used >= cap) return true;
    memory.set(slot, used + 1);
    return false;
  }
}

/* An API key never appears in an upstream error body — but a bug upstream, or
   a future field, could put one there, and this text is about to be shown on
   someone's phone. Scrub anything key-shaped before it leaves the server. */
const scrub = (s) => String(s || '').replace(/sk-ant-[A-Za-z0-9_-]+/g, 'sk-ant-***');

/**
 * Turn an upstream failure into something the person reading it can act on.
 * Hiding the reason behind a bare status code is what made "AI error (400)"
 * unfixable from the outside: 400 covers a malformed request, an exhausted
 * credit balance and a hit spend limit, and they need opposite responses.
 */
function explain(status, rawBody) {
  let type = '';
  let message = '';
  try {
    const parsed = JSON.parse(rawBody);
    type = parsed?.error?.type || '';
    message = parsed?.error?.message || '';
  } catch { /* not JSON — fall back to the status alone */ }

  const m = message.toLowerCase();
  let hebrew;
  if (/credit balance/.test(m)) {
    hebrew = 'אין יתרת קרדיט בחשבון ה-API. היכנס ל-console.anthropic.com ← Plans & Billing וטען קרדיט.';
  } else if (/spend limit|usage limit/.test(m)) {
    hebrew = 'הגעת לתקרת ההוצאה שהוגדרה בחשבון ה-API. אפשר להעלות אותה ב-console.anthropic.com ← Limits.';
  } else if (status === 401 || type === 'authentication_error') {
    hebrew = 'המפתח שהוגדר בשרת אינו תקין. בדוק את ANTHROPIC_API_KEY בהגדרות Netlify.';
  } else if (status === 402 || type === 'billing_error') {
    hebrew = 'בעיית חיוב בחשבון ה-API. בדוק את אמצעי התשלום ב-console.anthropic.com.';
  } else if (status === 404 || type === 'not_found_error') {
    hebrew = `שם המודל אינו מוכר לשרת (${MODEL}). אפשר לשנות אותו במשתנה הסביבה COACH_MODEL.`;
  } else if (status === 429) {
    hebrew = 'חרגת ממגבלת הקצב של ה-API. נסה שוב בעוד רגע.';
  } else if (status >= 500) {
    hebrew = 'שירות ה-AI אינו זמין כרגע. נסה שוב בעוד כמה דקות.';
  } else {
    hebrew = `שגיאת AI (${status}).`;
  }

  /* The API's own wording is passed on only for the error types that describe
     the request or the account — the ones where the sentence is the fix. An
     unrecognised type gets the status and nothing else, so a future error
     shape cannot relay anything unexamined to a browser. */
  const SAFE = ['invalid_request_error', 'authentication_error', 'billing_error', 'not_found_error', 'rate_limit_error', 'permission_error'];
  const detail = SAFE.includes(type) ? scrub(message).slice(0, 300) : '';

  return { error: hebrew, detail, kind: type, upstream: status };
}

/** Only our own pages may call this; a stolen endpoint is a stolen budget. */
function sameOrigin(req) {
  const origin = req.headers.get('origin');
  if (!origin) return true; // same-origin fetch without an Origin header
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (req.method === 'GET') {
    const wantsCheck = new URL(req.url).searchParams.has('check');
    /* Lets the app discover, on load, whether a hosted coach exists here. */
    if (!wantsCheck) return json(200, { available: !!process.env.ANTHROPIC_API_KEY, model: MODEL });

    /* ?check runs one real, one-token call. Reading a function log from a
       phone is not something anyone will do, so the diagnosis has to be
       available from inside the app. It costs a fraction of a cent. */
    if (!sameOrigin(req)) return json(403, { error: 'cross-origin requests are not accepted' });
    if (!process.env.ANTHROPIC_API_KEY) {
      return json(200, { ok: false, model: MODEL, error: 'לא הוגדר ANTHROPIC_API_KEY בהגדרות Netlify.' });
    }
    let probe;
    try {
      probe = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({ model: MODEL, max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] })
      });
    } catch {
      return json(200, { ok: false, model: MODEL, error: 'השרת לא הצליח להגיע ל-api.anthropic.com.' });
    }
    const probeBody = await probe.text();
    if (probe.ok) return json(200, { ok: true, model: MODEL });
    console.error(`coach check: upstream ${probe.status}`, probeBody.slice(0, 1000));
    return json(200, { ok: false, model: MODEL, ...explain(probe.status, probeBody) });
  }
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });
  if (!sameOrigin(req)) return json(403, { error: 'cross-origin requests are not accepted' });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return json(503, { error: 'hosted_coach_unconfigured' });

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json(413, { error: 'הבקשה גדולה מדי' });

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json(400, { error: 'invalid JSON' });
  }

  const { messages, system, max_tokens: want } = payload || {};
  if (!Array.isArray(messages) || !messages.length) return json(400, { error: 'messages required' });

  const device = String(payload.device || '').slice(0, 64) || 'anon';
  const ip = req.headers.get('x-nf-client-connection-ip')
    || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim()
    || 'unknown';

  if (await overQuota(`d:${device}`, DAILY_PER_DEVICE) || await overQuota(`i:${ip}`, DAILY_PER_IP)) {
    return json(429, { error: 'הגעת למכסת ההודעות היומית של המאמן. נסה שוב מחר.' });
  }

  let upstream;
  try {
    upstream = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: Math.min(Number(want) || 1200, MAX_TOKENS),
        /* No `temperature` (or top_p/top_k): current-generation models
           (Sonnet 5 included) reject sampling params with a 400. */
        ...(typeof system === 'string' && system ? { system } : {}),
        messages
      })
    });
  } catch {
    return json(502, { error: 'לא ניתן להגיע לשירות ה-AI' });
  }

  const body = await upstream.text();
  /* Upstream errors can quote the key back in some failure modes; never relay
     an error body verbatim to the browser, only its status. The full body is
     safe to log server-side (Netlify function logs) and is the only way to
     see *why* a call failed without reading source on every report. */
  if (!upstream.ok) {
    console.error(`coach: upstream ${upstream.status}`, body.slice(0, 1000));
    return json(upstream.status === 429 ? 429 : 502, explain(upstream.status, body));
  }

  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
};

export const config = { path: '/api/coach' };
