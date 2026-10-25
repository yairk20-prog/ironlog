/* ==========================================================================
   push-store.js — where reminder subscriptions and the VAPID keys live.

   One Netlify Blobs store. The VAPID key pair is made on first use and kept
   there, so turning reminders on needs no setup in the Netlify dashboard;
   VAPID_PUBLIC_KEY / VAPID_PRIVATE_JWK in the environment override it.
   ========================================================================== */

import { makeVapidKeys } from './webpush.js';

export async function pushStore() {
  /* tools/test-push.mjs runs the functions against an in-memory store. */
  if (globalThis.__ironlogPushStore) return globalThis.__ironlogPushStore;
  const { getStore } = await import('@netlify/blobs');
  return getStore('ironlog-push');
}

/** The key pair and the contact ("sub") the push services see. */
export async function vapid(store, origin = '') {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_JWK) {
    return {
      publicKey: process.env.VAPID_PUBLIC_KEY,
      privateJwk: JSON.parse(process.env.VAPID_PRIVATE_JWK),
      subject: process.env.VAPID_SUBJECT || origin || 'mailto:admin@example.com'
    };
  }
  const saved = await store.get('vapid', { type: 'json' }).catch(() => null);
  if (saved?.publicKey) return saved;
  const keys = { ...makeVapidKeys(), subject: process.env.VAPID_SUBJECT || origin || 'mailto:admin@example.com' };
  await store.setJSON('vapid', keys);
  return keys;
}

/** Long, random, and not derived from anything about the person. */
export const validId = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{24,64}$/.test(id);
