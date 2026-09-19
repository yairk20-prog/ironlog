/* ==========================================================================
   backup.js — cloud backup without an account.

   Google Drive sync works, but it costs every user a trip through the Google
   Cloud Console to create an OAuth client, which is an absurd price for
   "don't lose my workout log". So the site backs itself up instead: the app
   holds a long random device id, this function stores one blob under it, and
   restoring on a new phone means pasting that id.

   The id is therefore a capability — whoever has it can read and overwrite
   that backup — which is why it is 30+ random characters and why the app
   presents it as a recovery code rather than a username. The data is a
   workout log, not a medical record, and the alternative in practice is no
   backup at all.

   With Netlify Blobs unavailable the function reports that plainly and the
   app keeps offering file export and Drive.
   ========================================================================== */

const MAX_BYTES = Number(process.env.BACKUP_MAX_BYTES || 4_000_000);
const DAILY_WRITES = Number(process.env.BACKUP_DAILY_WRITES || 60);

const memoryQuota = new Map();
const today = () => new Date().toISOString().slice(0, 10);

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

/** Long, random, and not derived from anything about the person. */
const validId = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{24,64}$/.test(id);

function sameOrigin(req) {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

async function store() {
  const { getStore } = await import('@netlify/blobs');
  return getStore('ironlog-backups');
}

async function overQuota(key) {
  const slot = `${today()}:${key}`;
  const used = memoryQuota.get(slot) || 0;
  if (used >= DAILY_WRITES) return true;
  memoryQuota.set(slot, used + 1);
  return false;
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (!sameOrigin(req)) return json(403, { error: 'cross-origin requests are not accepted' });

  const url = new URL(req.url);

  /* Discovery: the app asks once whether this deployment can store backups. */
  if (req.method === 'GET' && !url.searchParams.get('device')) {
    try {
      await store();
      return json(200, { available: true });
    } catch {
      return json(200, { available: false });
    }
  }

  let blobs;
  try {
    blobs = await store();
  } catch {
    return json(503, { error: 'backup_unconfigured' });
  }

  if (req.method === 'GET') {
    const id = url.searchParams.get('device');
    if (!validId(id)) return json(400, { error: 'קוד שחזור לא תקין' });
    const saved = await blobs.get(id);
    if (!saved) return json(404, { error: 'לא נמצא גיבוי לקוד הזה' });
    return new Response(saved, {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
    });
  }

  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });

  const raw = await req.text();
  if (raw.length > MAX_BYTES) return json(413, { error: 'הגיבוי גדול מדי' });

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json(400, { error: 'invalid JSON' });
  }

  const id = payload?.device;
  if (!validId(id)) return json(400, { error: 'קוד שחזור לא תקין' });
  if (!payload?.data) return json(400, { error: 'אין מה לגבות' });
  if (await overQuota(id)) return json(429, { error: 'יותר מדי גיבויים היום' });

  await blobs.set(id, JSON.stringify({
    saved_at: new Date().toISOString(),
    data: payload.data
  }));

  return json(200, { ok: true, saved_at: new Date().toISOString() });
};

export const config = { path: '/api/backup' };
