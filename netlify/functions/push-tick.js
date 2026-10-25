/* ==========================================================================
   push-tick.js — once an hour, send the reminders that are due.

   Netlify runs this on the schedule below; nobody calls it over HTTP. Each
   subscription record says what the person wants and how far today has
   got; reminders.js decides, this sends and remembers what it sent. A push
   service that answers 404/410 means the phone unsubscribed — the record is
   dropped.
   ========================================================================== */

import { pushStore, vapid } from '../lib/push-store.js';
import { sendPush } from '../lib/webpush.js';
import { dueReminders } from '../lib/reminders.js';

export default async () => {
  let store;
  try { store = await pushStore(); } catch { return new Response('no store', { status: 200 }); }
  const keys = await vapid(store);
  const now = Date.now();
  const { blobs } = await store.list({ prefix: 'sub:' });
  let sent = 0, dropped = 0;

  for (const { key } of blobs) {
    const rec = await store.get(key, { type: 'json' }).catch(() => null);
    if (!rec?.subscription) continue;
    const { messages, sent: nextSent } = dueReminders(rec, now);
    let gone = false;
    for (const m of messages) {
      try {
        const res = await sendPush(rec.subscription, m, keys, keys.subject, { topic: m.kind });
        if (res.gone) { gone = true; break; }
        if (res.ok) sent++;
      } catch (err) {
        console.error('push failed', key, String(err?.message || err).slice(0, 200));
      }
    }
    if (gone) { await store.delete(key); dropped++; continue; }
    if (JSON.stringify(nextSent) !== JSON.stringify(rec.sent || {})) {
      rec.sent = nextSent;
      await store.setJSON(key, rec);
    }
  }
  console.log(`push-tick: ${blobs.length} subscriptions, ${sent} sent, ${dropped} dropped`);
  return new Response('ok');
};

export const config = { schedule: '@hourly' };
