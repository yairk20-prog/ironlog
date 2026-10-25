/* Reminders, server side: the encryption a browser must be able to decrypt,
   the VAPID signature a push service must accept, which reminders are due
   when, and the /api/push + hourly tick functions end to end against an
   in-memory store and a fake push service.

   The decryption below is written from RFC 8291 independently of
   netlify/lib/webpush.js — a round trip through the same code would prove
   only that it agrees with itself.

   Run: node tools/test-push.mjs */
import crypto from 'node:crypto';
import { encrypt, vapidHeader, makeVapidKeys, b64u, unb64u } from '../netlify/lib/webpush.js';
import { dueReminders, localClock } from '../netlify/lib/reminders.js';

const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };

/* ---------- a "browser": its key pair, its auth secret, its decryption ---------- */
function browser() {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = crypto.randomBytes(16);
  return { ecdh, auth, keys: { p256dh: b64u(ecdh.getPublicKey()), auth: b64u(auth) } };
}

function hkdf(salt, ikm, info, len) {
  return Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, len));
}

function decrypt(body, ua) {
  const salt = body.subarray(0, 16);
  const rs = body.readUInt32BE(16);
  const idlen = body[20];
  const asPublic = body.subarray(21, 21 + idlen);
  const ct = body.subarray(21 + idlen);
  const shared = ua.ecdh.computeSecret(asPublic);
  const ikm = hkdf(ua.auth, shared, Buffer.concat([Buffer.from('WebPush: info\0'), ua.ecdh.getPublicKey(), asPublic]), 32);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(ct.subarray(ct.length - 16));
  const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  const end = plain.lastIndexOf(2);
  return { rs, text: plain.subarray(0, end).toString() };
}

function verifyVapid(header, publicKey, endpoint) {
  const m = /^vapid t=([^,]+), k=(.+)$/.exec(header);
  if (!m || m[2] !== publicKey) return false;
  const [h, c, sig] = m[1].split('.');
  const raw = unb64u(publicKey);
  const key = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(raw.subarray(1, 33)), y: b64u(raw.subarray(33)) }, format: 'jwk' });
  const ok = crypto.verify('sha256', Buffer.from(`${h}.${c}`), { key, dsaEncoding: 'ieee-p1363' }, unb64u(sig));
  const claims = JSON.parse(unb64u(c).toString());
  return ok && claims.aud === new URL(endpoint).origin && claims.exp > Date.now() / 1000 && !!claims.sub;
}

/* ---------- 1. encryption round trip ---------- */
{
  const ua = browser();
  const msg = JSON.stringify({ title: 'זמן לכוס מים', body: 'שתית 3 מתוך 12 כוסות' });
  const out = decrypt(encrypt(msg, ua.keys), ua);
  check(out.text === msg, 'a browser cannot decrypt the payload');
  check(out.rs === 4096, 'record size header is wrong');
  const other = browser();
  let leaked = true;
  try { decrypt(encrypt(msg, ua.keys), other); } catch { leaked = false; }
  check(!leaked, 'a different browser could decrypt the payload');
}

/* ---------- 2. VAPID ---------- */
{
  const keys = makeVapidKeys();
  check(unb64u(keys.publicKey).length === 65 && unb64u(keys.publicKey)[0] === 4, 'the public key is not an uncompressed P-256 point');
  const ep = 'https://fcm.googleapis.com/fcm/send/abc';
  check(verifyVapid(vapidHeader(ep, keys, 'https://ironlog.example'), keys.publicKey, ep), 'the VAPID signature does not verify');
}

/* ---------- 3. which reminders are due ---------- */
{
  const at = (h, m = 7) => Date.parse(`2026-10-25T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+02:00`);
  check(localClock(at(14), 'Asia/Jerusalem').hour === 14, 'local hour in Israel is wrong');
  const base = { tz: 'Asia/Jerusalem', prefs: { water: true, protein: true, from: 9, to: 21, every: 2 } };
  const prog = (water, protein) => ({ date: '2026-10-25', water_ml: water, water_target: 3000, protein, protein_target: 150 });

  check(!dueReminders({ ...base, progress: prog(0, 0) }, at(7)).messages.length, 'reminded before the waking window');
  check(!dueReminders({ ...base, progress: prog(0, 0) }, at(22)).messages.length, 'reminded after the waking window');

  const r1 = dueReminders({ ...base, progress: prog(250, 0) }, at(11));
  const w1 = r1.messages.find((m) => m.kind === 'water');
  check(w1 && /1 מתוך 12/.test(w1.body), `behind on water at 11 should remind with the count: ${JSON.stringify(r1.messages)}`);

  const r2 = dueReminders({ ...base, progress: prog(250, 0), sent: r1.sent }, at(12));
  check(!r2.messages.some((m) => m.kind === 'water'), 'water reminded again within the interval');
  const r3 = dueReminders({ ...base, progress: prog(250, 0), sent: r1.sent }, at(13, 30));
  check(r3.messages.some((m) => m.kind === 'water'), 'water not reminded after the interval');

  check(!dueReminders({ ...base, progress: prog(1500, 0) }, at(13)).messages.some((m) => m.kind === 'water'), 'on track for water but reminded anyway');

  check(!dueReminders({ ...base, progress: prog(3000, 0) }, at(11)).messages.some((m) => m.kind === 'protein'), 'protein reminded before noon');
  const p1 = dueReminders({ ...base, progress: prog(3000, 20) }, at(12, 20));
  const pm = p1.messages.find((m) => m.kind === 'protein');
  check(pm && /חסרים 130/.test(pm.title), `behind on protein at noon should name the gap: ${JSON.stringify(p1.messages)}`);
  check(!dueReminders({ ...base, progress: prog(3000, 20), sent: p1.sent }, at(13)).messages.some((m) => m.kind === 'protein'), 'protein reminded twice for one checkpoint');
  check(dueReminders({ ...base, progress: prog(3000, 60), sent: p1.sent }, at(16, 5)).messages.some((m) => m.kind === 'protein'), 'no protein reminder at the 4pm checkpoint while behind');
  check(!dueReminders({ ...base, progress: prog(3000, 140) }, at(20)).messages.some((m) => m.kind === 'protein'), 'protein reminded while on track');

  const stale = dueReminders({ ...base, progress: { ...prog(3000, 150), date: '2026-10-24' } }, at(12, 30));
  check(stale.messages.some((m) => m.kind === 'water') && stale.messages.some((m) => m.kind === 'protein'), 'yesterday\'s numbers counted as today\'s');

  check(!dueReminders({ ...base, prefs: { ...base.prefs, water: false, protein: false }, progress: prog(0, 0) }, at(14)).messages.length, 'reminded with both kinds switched off');
}

/* ---------- 4. the functions, against an in-memory store and a fake push service ---------- */
{
  const mem = new Map();
  globalThis.__ironlogPushStore = {
    get: async (k, o) => (mem.has(k) ? (o?.type === 'json' ? JSON.parse(mem.get(k)) : mem.get(k)) : null),
    set: async (k, v) => { mem.set(k, String(v)); },
    setJSON: async (k, v) => { mem.set(k, JSON.stringify(v)); },
    delete: async (k) => { mem.delete(k); },
    list: async ({ prefix }) => ({ blobs: [...mem.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) })
  };
  const pushed = [];
  const realFetch = globalThis.fetch;
  let pushStatus = 201;
  globalThis.fetch = async (url, init) => {
    pushed.push({ url, headers: init.headers, body: Buffer.from(init.body) });
    return new Response('', { status: pushStatus });
  };

  const { default: push } = await import('../netlify/functions/push.js');
  const { default: tick } = await import('../netlify/functions/push-tick.js');
  const call = (method, body) => push(new Request('https://ironlog.example/api/push', {
    method, headers: { 'content-type': 'application/json', origin: 'https://ironlog.example' },
    body: body ? JSON.stringify(body) : undefined
  })).then((r) => r.json());

  const disc = await call('GET');
  check(disc.available && unb64u(disc.publicKey).length === 65, `discovery: ${JSON.stringify(disc)}`);
  check((await call('GET')).publicKey === disc.publicKey, 'the VAPID key changed between calls');

  const ua = browser();
  const id = 'p_' + crypto.randomBytes(18).toString('base64url');
  const endpoint = 'https://push.example/send/xyz';
  /* The tick reads the real clock, so pick a time zone where it is daytime
     right now — the suite must not fail because it ran at 3am. */
  const ZONES = ['Asia/Jerusalem', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo', 'Asia/Kolkata', 'Pacific/Auckland', 'America/Sao_Paulo'];
  const tz = ZONES.find((z) => { const h = localClock(Date.now(), z).hour; return h >= 10 && h <= 19; }) || 'Asia/Jerusalem';
  const today = localClock(Date.now(), tz).date;
  check((await call('POST', { action: 'subscribe', id, subscription: { endpoint, keys: ua.keys }, prefs: { from: 9, to: 21, every: 1 }, tz, progress: { date: today, water_ml: 0, water_target: 3000, protein: 0, protein_target: 150 } })).ok, 'subscribe failed');
  check((await call('POST', { action: 'subscribe', id: 'short', subscription: { endpoint, keys: ua.keys } })).error, 'a short id was accepted');
  check((await call('POST', { action: 'subscribe', id, subscription: { endpoint: 'http://insecure', keys: ua.keys } })).error, 'an http endpoint was accepted');

  const t = await call('POST', { action: 'test', id });
  check(t.ok, `test push failed: ${JSON.stringify(t)}`);
  const sentTest = pushed.pop();
  check(sentTest && sentTest.url === endpoint, 'the test push went somewhere else');
  check(sentTest && verifyVapid(sentTest.headers.authorization, disc.publicKey, endpoint), 'the test push is not VAPID-signed with the published key');
  check(sentTest && sentTest.headers['content-encoding'] === 'aes128gcm', 'the test push is not aes128gcm');
  check(sentTest && JSON.parse(decrypt(sentTest.body, ua).text).title === 'התזכורות פועלות', 'the test push does not decrypt to the test message');

  /* an hour's tick: the person is behind on water */
  pushed.length = 0;
  await tick();
  const kinds = pushed.map((p) => JSON.parse(decrypt(p.body, ua).text).tag);
  check(kinds.includes('ironlog-water'), `the tick did not remind about water: ${kinds}`);
  check(pushed.every((p) => p.headers.topic), 'reminders do not carry a topic, so stale ones would pile up');
  const recAfter = JSON.parse(mem.get(`sub:${id}`));
  check(recAfter.sent?.water > 0, 'the tick did not remember sending');

  /* progress caught up: no water reminder on the next tick */
  pushed.length = 0;
  await call('POST', { action: 'progress', id, progress: { date: today, water_ml: 3000, water_target: 3000, protein: 150, protein_target: 150 } });
  mem.set(`sub:${id}`, JSON.stringify({ ...JSON.parse(mem.get(`sub:${id}`)), sent: {} }));
  await tick();
  check(!pushed.length, `reminded after the day's targets were met: ${pushed.length}`);

  /* the phone unsubscribed: the push service says 410 and the record goes */
  await call('POST', { action: 'progress', id, progress: { date: today, water_ml: 0, water_target: 3000, protein: 0, protein_target: 150 } });
  pushStatus = 410;
  await tick();
  check(!mem.has(`sub:${id}`), 'a gone subscription was kept');

  /* off forgets */
  pushStatus = 201;
  await call('POST', { action: 'subscribe', id, subscription: { endpoint, keys: ua.keys } });
  await call('POST', { action: 'off', id });
  check(!mem.has(`sub:${id}`), 'turning reminders off did not forget the subscription');

  globalThis.fetch = realFetch;
}

if (fails.length) {
  console.error('FAIL:', fails.join(' | '));
  process.exitCode = 1;
} else {
  console.log('PASS');
}
