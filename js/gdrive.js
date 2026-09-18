/* ==========================================================================
   gdrive.js — Google sign-in and backup sync, with no server of our own.

   The whole sync lives in Drive's hidden appDataFolder: a private per-user
   folder only this app can read, invisible in the user's Drive listing. That
   gives cross-device sync and a real account without anyone hosting a backend.

   Needs one thing from the user: an OAuth Client ID from Google Cloud Console
   with this app's origin whitelisted. It is stored locally like any setting.
   ========================================================================== */

import * as db from './db.js';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata openid email profile';
const FILE_NAME = 'ironlog-backup.json';
const TOKEN_KEY = 'ironlog.gtoken';

let gisReady = null;
let tokenClient = null;
let token = null;       // { access_token, expires_at }
let profile = null;     // { email, name, picture }

/* ---------- configuration ---------- */

export const getClientId = () => db.setting('googleClientId', '');
export const setClientId = (id) => db.setSetting('googleClientId', (id || '').trim());
export async function configured() {
  const id = await getClientId();
  return !!(id && id.includes('.apps.googleusercontent.com'));
}

/* ---------- script loading ---------- */

function loadGis() {
  if (gisReady) return gisReady;
  gisReady = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => (window.google?.accounts?.oauth2
      ? resolve()
      : reject(new Error('ספריית Google נטענה אך לא אותחלה')));
    s.onerror = () => reject(new Error(
      'לא ניתן לטעון את ספריית Google. זה קורה כשהדף מוגש מדומיין שחוסם סקריפטים חיצוניים — נסה מהאתר ב-Netlify.'
    ));
    document.head.appendChild(s);
  });
  return gisReady;
}

/* ---------- token ---------- */

function restoreToken() {
  if (token && token.expires_at > Date.now() + 30000) return token;
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (saved.expires_at > Date.now() + 30000) { token = saved; return token; }
    sessionStorage.removeItem(TOKEN_KEY);
  } catch { /* private mode */ }
  return null;
}

function storeToken(t) {
  token = t;
  try { sessionStorage.setItem(TOKEN_KEY, JSON.stringify(t)); } catch { /* ignore */ }
}

/**
 * @param {boolean} interactive false tries a silent refresh of an existing grant
 */
async function getToken({ interactive = true } = {}) {
  const existing = restoreToken();
  if (existing) return existing.access_token;

  const clientId = await getClientId();
  if (!clientId) throw new Error('לא הוגדר Google Client ID בהגדרות');
  await loadGis();

  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: () => {} // replaced per request below
    });
  }

  return new Promise((resolve, reject) => {
    tokenClient.callback = (res) => {
      if (res.error) {
        reject(new Error(res.error === 'popup_closed_by_user'
          ? 'ההתחברות בוטלה'
          : `שגיאת התחברות: ${res.error}`));
        return;
      }
      storeToken({
        access_token: res.access_token,
        expires_at: Date.now() + (Number(res.expires_in || 3600) - 60) * 1000
      });
      resolve(res.access_token);
    };
    try {
      tokenClient.requestAccessToken({ prompt: interactive ? '' : 'none' });
    } catch (err) {
      reject(err);
    }
  });
}

/* ---------- account ---------- */

export async function currentAccount() {
  if (profile) return profile;
  try {
    const cached = await db.setting('googleAccount', null);
    if (cached) { profile = cached; return profile; }
  } catch { /* ignore */ }
  return null;
}

export async function signIn() {
  const access = await getToken({ interactive: true });
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${access}` }
  });
  if (!res.ok) throw new Error('לא ניתן לקרוא את פרטי החשבון');
  const info = await res.json();
  profile = { email: info.email, name: info.name, picture: info.picture };
  await db.setSetting('googleAccount', profile);
  return profile;
}

export async function signOut() {
  try {
    const t = restoreToken();
    if (t && window.google?.accounts?.oauth2) {
      window.google.accounts.oauth2.revoke(t.access_token, () => {});
    }
  } catch { /* ignore */ }
  token = null;
  profile = null;
  try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  await db.setSetting('googleAccount', null);
  await db.setSetting('lastSync', null);
}

/* ---------- Drive appDataFolder ---------- */

async function driveFetch(path, opts = {}, access) {
  const res = await fetch(`https://www.googleapis.com/${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${access}`, ...(opts.headers || {}) }
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Drive ${res.status}: ${body.slice(0, 140)}`);
  }
  return res;
}

async function findFile(access) {
  const res = await driveFetch(
    `drive/v3/files?spaces=appDataFolder&fields=files(id,name,modifiedTime)&q=${encodeURIComponent(`name='${FILE_NAME}'`)}`,
    {}, access
  );
  const data = await res.json();
  return data.files?.[0] || null;
}

/** Push this device's data up, replacing the cloud copy. */
export async function syncUp() {
  const access = await getToken();
  const payload = await db.exportAll();
  const body = JSON.stringify(payload);

  const existing = await findFile(access);
  const meta = existing
    ? {}
    : { name: FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/json' };

  const boundary = `ironlog${Date.now()}`;
  const multipart =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;

  const path = existing
    ? `upload/drive/v3/files/${existing.id}?uploadType=multipart`
    : 'upload/drive/v3/files?uploadType=multipart';

  await driveFetch(path, {
    method: existing ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: multipart
  }, access);

  const at = Date.now();
  await db.setSetting('lastSync', { at, dir: 'up' });
  return { at, bytes: body.length };
}

/** Pull the cloud copy down and merge it into this device. */
export async function syncDown({ merge = true } = {}) {
  const access = await getToken();
  const file = await findFile(access);
  if (!file) throw new Error('אין עדיין גיבוי בענן');

  const res = await driveFetch(`drive/v3/files/${file.id}?alt=media`, {}, access);
  const payload = await res.json();
  const count = await db.importAll(payload, { merge });

  const at = Date.now();
  await db.setSetting('lastSync', { at, dir: 'down' });
  return { at, count, modifiedTime: file.modifiedTime };
}

/** Best-effort upload after a workout; never blocks or throws into the UI. */
export async function autoSync() {
  try {
    if (!(await configured())) return null;
    if (!(await db.setting('autoSync', false))) return null;
    if (!(await currentAccount())) return null;
    await getToken({ interactive: false });
    return await syncUp();
  } catch (err) {
    console.warn('[gdrive] auto-sync skipped', err);
    return null;
  }
}

export const lastSync = () => db.setting('lastSync', null);
