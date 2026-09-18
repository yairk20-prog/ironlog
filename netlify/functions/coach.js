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
const MODEL = process.env.COACH_MODEL || 'claude-sonnet-4-5';

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
    /* Lets the app discover, on load, whether a hosted coach exists here. */
    return json(200, { available: !!process.env.ANTHROPIC_API_KEY, model: MODEL });
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

  const { messages, system, max_tokens: want, temperature } = payload || {};
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
        temperature: Math.min(Math.max(Number(temperature) || 0.2, 0), 1),
        ...(typeof system === 'string' && system ? { system } : {}),
        messages
      })
    });
  } catch {
    return json(502, { error: 'לא ניתן להגיע לשירות ה-AI' });
  }

  const body = await upstream.text();
  /* Upstream errors can quote the key back in some failure modes; never relay
     an error body verbatim, only its status. */
  if (!upstream.ok) return json(upstream.status === 429 ? 429 : 502, { error: `שגיאת AI (${upstream.status})` });

  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
};

export const config = { path: '/api/coach' };
