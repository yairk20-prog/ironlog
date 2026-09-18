/* ==========================================================================
   db.js — IndexedDB layer (offline-first).
   Stores map 1:1 to the agreed schema:
     workouts, set_logs, exercise_notes, nutrition_logs, settings
   All writes are local and synchronous-feeling; nothing here touches network.
   ========================================================================== */

const DB_NAME = 'ironlog';
const DB_VERSION = 2;

/** @type {IDBDatabase|null} */
let _db = null;

export function open() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = req.result;
      const tx = req.transaction;

      if (!db.objectStoreNames.contains('workouts')) {
        const s = db.createObjectStore('workouts', { keyPath: 'id' });
        s.createIndex('date', 'date');
        s.createIndex('completed', 'completed');
        s.createIndex('type', 'type');
      }
      if (!db.objectStoreNames.contains('set_logs')) {
        const s = db.createObjectStore('set_logs', { keyPath: 'id' });
        s.createIndex('workout_id', 'workout_id');
        s.createIndex('exercise_id', 'exercise_id');
        s.createIndex('ex_ts', ['exercise_id', 'timestamp']);
      }
      if (!db.objectStoreNames.contains('exercise_notes')) {
        db.createObjectStore('exercise_notes', { keyPath: 'exercise_id' });
      }
      if (!db.objectStoreNames.contains('nutrition_logs')) {
        const s = db.createObjectStore('nutrition_logs', { keyPath: 'id' });
        s.createIndex('date', 'date', { unique: true });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('body_logs')) {
        const s = db.createObjectStore('body_logs', { keyPath: 'id' });
        s.createIndex('date', 'date');
      }
      if (e.oldVersion < 1 && tx) { /* fresh install */ }
    };

    req.onsuccess = () => {
      _db = req.result;
      _db.onversionchange = () => { _db.close(); _db = null; };
      resolve(_db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('DB blocked by another tab'));
  });
}

function tx(store, mode = 'readonly') {
  return open().then((db) => db.transaction(store, mode).objectStore(store));
}

function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/* ---------- generic CRUD ---------- */

export const put = (store, value) => tx(store, 'readwrite').then((s) => wrap(s.put(value)));
export const get = (store, key) => tx(store).then((s) => wrap(s.get(key)));
export const del = (store, key) => tx(store, 'readwrite').then((s) => wrap(s.delete(key)));
export const all = (store) => tx(store).then((s) => wrap(s.getAll()));
export const clear = (store) => tx(store, 'readwrite').then((s) => wrap(s.clear()));

export function byIndex(store, index, query, dir = 'next', limit = Infinity) {
  return tx(store).then((s) => new Promise((resolve, reject) => {
    const out = [];
    const req = s.index(index).openCursor(query ?? null, dir);
    req.onsuccess = () => {
      const c = req.result;
      if (!c || out.length >= limit) return resolve(out);
      out.push(c.value);
      c.continue();
    };
    req.onerror = () => reject(req.error);
  }));
}

export function putMany(store, values) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readwrite');
    const s = t.objectStore(store);
    values.forEach((v) => s.put(v));
    t.oncomplete = () => resolve(values.length);
    t.onerror = () => reject(t.error);
  }));
}

/* ---------- settings helpers ---------- */

export async function setting(key, fallback = null) {
  const row = await get('settings', key);
  return row === undefined || row === null ? fallback : row.value;
}

export function setSetting(key, value) {
  return put('settings', { key, value });
}

export async function settingsAll() {
  const rows = await all('settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/* ---------- ids ---------- */

export function uid(prefix = '') {
  const rand = (crypto?.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36));
  return prefix ? `${prefix}_${rand}` : rand;
}

/* ---------- backup / restore ---------- */

const EXPORTED = ['workouts', 'set_logs', 'exercise_notes', 'nutrition_logs', 'body_logs', 'settings'];

/** Never leaves the device in a backup file. */
const SECRET_SETTINGS = new Set(['apiKey']);

export async function exportAll() {
  const data = {};
  for (const s of EXPORTED) data[s] = await all(s);
  data.settings = (data.settings || []).filter((row) => !SECRET_SETTINGS.has(row.key));
  return {
    app: 'ironlog',
    schema: DB_VERSION,
    exported_at: new Date().toISOString(),
    data
  };
}

export async function importAll(payload, { merge = true } = {}) {
  if (!payload || payload.app !== 'ironlog' || !payload.data) {
    throw new Error('קובץ גיבוי לא תקין');
  }
  let count = 0;
  for (const s of EXPORTED) {
    const rows = payload.data[s];
    if (!Array.isArray(rows)) continue;
    if (!merge) await clear(s);
    count += await putMany(s, rows);
  }
  return count;
}

export async function wipe() {
  for (const s of EXPORTED) await clear(s);
}
