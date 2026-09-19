/* ==========================================================================
   cloud.js — account-free backup.
   The site stores one blob per recovery code. No sign-in, no OAuth client, no
   Google Cloud Console: the code is generated on this device, kept here, and
   is the only thing needed to pull the data down on another phone.
   ========================================================================== */

import * as db from './db.js';

const ENDPOINT = '/api/backup';

let availability = null;

/** Does this deployment host backups? Asked once. */
export function available() {
  if (availability) return availability;
  if (location.protocol === 'file:') return (availability = Promise.resolve(false));
  availability = fetch(ENDPOINT)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => !!j?.available)
    .catch(() => false);
  return availability;
}

/** A capability, not a name: long enough that it cannot be guessed. */
function freshCode() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function recoveryCode() {
  let code = await db.setting('cloudCode', '');
  if (!code) {
    code = freshCode();
    await db.setSetting('cloudCode', code);
  }
  return code;
}

export const setRecoveryCode = (code) => db.setSetting('cloudCode', (code || '').trim());
export const lastBackup = () => db.setting('cloudBackupAt', null);

export async function backUp() {
  const code = await recoveryCode();
  const payload = await db.exportAll();

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ device: code, data: payload })
  });
  if (!res.ok) {
    const msg = await res.json().then((j) => j.error).catch(() => '');
    throw new Error(msg || `הגיבוי נכשל (${res.status})`);
  }

  const out = await res.json();
  await db.setSetting('cloudBackupAt', out.saved_at || new Date().toISOString());
  return out;
}

/**
 * Pull a backup down. Merges by default so restoring onto a phone that has
 * been used does not throw away what is already on it.
 */
export async function restore(code, { merge = true } = {}) {
  const res = await fetch(`${ENDPOINT}?device=${encodeURIComponent(code)}`);
  if (!res.ok) {
    const msg = await res.json().then((j) => j.error).catch(() => '');
    throw new Error(msg || `השחזור נכשל (${res.status})`);
  }
  const saved = await res.json();
  if (!saved?.data) throw new Error('הגיבוי ריק');

  const count = await db.importAll(saved.data, { merge });
  await db.setSetting('cloudCode', code);
  return { count, saved_at: saved.saved_at };
}

/** Called after a workout; silent by design — never blocks finishing a set. */
export async function autoBackUp() {
  try {
    if (!(await available())) return false;
    if ((await db.setting('cloudAuto', true)) === false) return false;
    await backUp();
    return true;
  } catch {
    return false;
  }
}
