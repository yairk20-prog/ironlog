/* ==========================================================================
   push.js — turning water and protein reminders on and off.

   GET            → { available, publicKey } — the key the browser subscribes with
   POST subscribe → keep the subscription, the reminder settings and today's numbers
   POST progress  → today's water and protein, so a reminder knows the gap
   POST test      → send one reminder now, to prove the whole path works
   POST off       → forget the subscription

   The record is keyed by a long random id the app makes for itself; it holds
   a push endpoint and a few numbers about today, nothing else. The sending
   happens in push-tick.js, once an hour.
   ========================================================================== */

import { pushStore, vapid, validId } from '../lib/push-store.js';
import { sendPush } from '../lib/webpush.js';

const MAX_BODY = 8000;

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

function sameOrigin(req) {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

const num = (v, lo, hi, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

function cleanPrefs(p = {}) {
  return {
    water: p.water !== false,
    protein: p.protein !== false,
    from: num(p.from, 5, 12, 9),
    to: num(p.to, 15, 24, 21),
    every: num(p.every, 1, 4, 2)
  };
}

function cleanProgress(p = {}) {
  return {
    date: /^\d{4}-\d{2}-\d{2}$/.test(p.date || '') ? p.date : '',
    water_ml: num(p.water_ml, 0, 20000, 0),
    water_target: num(p.water_target, 500, 8000, 3000),
    protein: num(p.protein, 0, 1000, 0),
    protein_target: num(p.protein_target, 20, 500, 120)
  };
}

function cleanSubscription(s) {
  if (!s || typeof s.endpoint !== 'string' || !s.endpoint.startsWith('https://')) return null;
  if (!s.keys || typeof s.keys.p256dh !== 'string' || typeof s.keys.auth !== 'string') return null;
  return { endpoint: s.endpoint.slice(0, 1000), keys: { p256dh: s.keys.p256dh.slice(0, 200), auth: s.keys.auth.slice(0, 100) } };
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (!sameOrigin(req)) return json(403, { error: 'cross-origin requests are not accepted' });
  const origin = new URL(req.url).origin;

  let store;
  try {
    store = await pushStore();
  } catch {
    return json(req.method === 'GET' ? 200 : 503, { available: false, error: 'push_unconfigured' });
  }

  if (req.method === 'GET') {
    try {
      const keys = await vapid(store, origin);
      return json(200, { available: true, publicKey: keys.publicKey });
    } catch {
      return json(200, { available: false });
    }
  }
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });

  const raw = await req.text();
  if (raw.length > MAX_BODY) return json(413, { error: 'too large' });
  let body;
  try { body = JSON.parse(raw); } catch { return json(400, { error: 'invalid JSON' }); }
  if (!validId(body?.id)) return json(400, { error: 'invalid id' });
  const key = `sub:${body.id}`;

  if (body.action === 'off') {
    await store.delete(key);
    return json(200, { ok: true });
  }

  const rec = await store.get(key, { type: 'json' }).catch(() => null);

  if (body.action === 'subscribe') {
    const subscription = cleanSubscription(body.subscription);
    if (!subscription) return json(400, { error: 'invalid subscription' });
    await store.setJSON(key, {
      subscription,
      prefs: cleanPrefs(body.prefs),
      tz: String(body.tz || 'Asia/Jerusalem').slice(0, 64),
      progress: cleanProgress(body.progress),
      sent: rec?.sent || {},
      updated: Date.now()
    });
    return json(200, { ok: true });
  }

  if (!rec) return json(404, { error: 'not subscribed' });

  if (body.action === 'progress') {
    rec.progress = cleanProgress(body.progress);
    if (body.prefs) rec.prefs = cleanPrefs(body.prefs);
    if (body.tz) rec.tz = String(body.tz).slice(0, 64);
    rec.updated = Date.now();
    await store.setJSON(key, rec);
    return json(200, { ok: true });
  }

  if (body.action === 'test') {
    const keys = await vapid(store, origin);
    try {
      const res = await sendPush(rec.subscription, {
        title: 'התזכורות פועלות',
        body: 'כך ייראו תזכורות המים והחלבון — רק כשבאמת חסר משהו להיום.',
        tag: 'ironlog-test',
        url: '/#/nutrition'
      }, keys, keys.subject, { ttl: 600, urgency: 'high' });
      if (res.gone) await store.delete(key);
      return json(200, { ok: res.ok, status: res.status, gone: res.gone });
    } catch (err) {
      return json(200, { ok: false, error: String(err?.message || err).slice(0, 200) });
    }
  }

  return json(400, { error: 'unknown action' });
};

export const config = { path: '/api/push' };
