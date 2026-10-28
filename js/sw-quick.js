/* ==========================================================================
   sw-quick.js — quick add without opening the app.

   A plain script, not a module, because it is loaded in two places: the
   service worker (importScripts) where a notification button adds a glass
   of water with the app closed, and the app itself, which uses the same
   code to draw the quick-add card — one implementation, so the card and the
   app can never disagree about what "a glass" or "today" is.

   It writes the same nutrition_logs record the app writes (same fields,
   same id shape, the local date as the key) and only ever touches water_ml,
   so it cannot disturb food logged in the app. The day's whole water is
   water_ml plus drinks_ml — what coffee, tea and other drinks logged as
   food brought (the app keeps drinks_ml in step with the items).
   ========================================================================== */

(function (scope) {
  const DB_NAME = 'ironlog';
  const GLASS_ML = 250;

  /** The local calendar date — the same rule as todayISO() in logic.js. */
  function todayISO(d = new Date()) {
    const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return z.toISOString().slice(0, 10);
  }

  /** Glasses and bottles plus the water in logged drinks. */
  const totalWater = (rec) => (rec ? (rec.water_ml || 0) + (rec.drinks_ml || 0) : 0);

  const uid = () => `n_${(scope.crypto && scope.crypto.randomUUID) ? scope.crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)}`;

  /** Open the app's database as it is — never create or upgrade it from here. */
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME);
      req.onupgradeneeded = () => { req.transaction.abort(); };
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('nutrition_logs') || !db.objectStoreNames.contains('settings')) {
          db.close();
          reject(new Error('האפליקציה עוד לא נפתחה במכשיר הזה'));
          return;
        }
        resolve(db);
      };
      req.onerror = () => reject(req.error || new Error('db'));
    });
  }

  const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

  async function settings(db, keys) {
    const tx = db.transaction('settings');
    const store = tx.objectStore('settings');
    const out = {};
    for (const k of keys) {
      const row = await reqP(store.get(k));
      out[k] = row ? row.value : null;
    }
    return out;
  }

  /** Today's record, or null. */
  async function today(db) {
    const tx = db.transaction('nutrition_logs');
    return (await reqP(tx.objectStore('nutrition_logs').index('date').get(todayISO()))) || null;
  }

  /**
   * Add (or with a negative amount, take back) water on today's record, in
   * one read-modify-write transaction. Creates the day if it has no record.
   * @returns {Promise<object>} the saved record
   */
  async function addWater(ml = GLASS_ML) {
    const db = await openDB();
    try {
      const tx = db.transaction('nutrition_logs', 'readwrite');
      const store = tx.objectStore('nutrition_logs');
      const date = todayISO();
      const rec = (await reqP(store.index('date').get(date))) || {
        id: uid(), date, items: [],
        calories_consumed: 0, protein_grams: 0, carbs_grams: 0, fat_grams: 0, water_ml: 0
      };
      rec.water_ml = Math.max(0, (rec.water_ml || 0) + ml);
      store.put(rec);
      await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
      return rec;
    } finally {
      db.close();
    }
  }

  /** "6 מתוך 12 כוסות · 80/130 ג׳ חלבון" — what today looks like right now. */
  async function status() {
    const db = await openDB();
    try {
      const rec = await today(db);
      const s = await settings(db, ['waterTarget', 'reminderTargets', 'quickCard']);
      const waterTarget = s.waterTarget || 3000;
      const proteinTarget = (s.reminderTargets && s.reminderTargets.protein_target) || null;
      const water = totalWater(rec);
      const protein = Math.round((rec && rec.protein_grams) || 0);
      const glasses = Math.floor(water / GLASS_ML + 0.001);
      const total = Math.max(1, Math.round(waterTarget / GLASS_ML));
      return {
        rec, glasses, total, protein, proteinTarget, card: !!s.quickCard,
        text: `${glasses} מתוך ${total} כוסות מים · ${protein}${proteinTarget ? `/${Math.round(proteinTarget)}` : ''} ג׳ חלבון`
      };
    } finally {
      db.close();
    }
  }

  /** The always-there quick-add card in the notification shade. */
  async function cardNotification() {
    const st = await status();
    return {
      title: 'IRONLOG · היום',
      options: {
        body: st.text,
        tag: 'ironlog-quick',
        renotify: false,
        silent: true,
        requireInteraction: true,
        dir: 'rtl',
        lang: 'he',
        icon: './icons/icon-192.png',
        actions: [
          { action: 'water', title: '+ כוס מים' },
          { action: 'food', title: '+ מאכל' }
        ],
        data: { url: './index.html#/nutrition', quick: true }
      }
    };
  }

  /**
   * Tell the reminders server today's new water total, so a reminder never
   * nags about a glass just logged from a notification. Only when reminders
   * are on; the app does the same from inside.
   */
  async function syncProgress(rec) {
    const db = await openDB();
    let s;
    try { s = await settings(db, ['pushId', 'reminders', 'reminderTargets']); } finally { db.close(); }
    if (!s.pushId || !(s.reminders && s.reminders.on)) return false;
    const t = s.reminderTargets || {};
    try {
      await fetch('/api/push', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'progress', id: s.pushId,
          progress: {
            date: rec.date, water_ml: totalWater(rec), protein: rec.protein_grams || 0,
            water_target: t.water_target || 3000, protein_target: t.protein_target || 120
          }
        })
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  scope.IronlogQuick = { GLASS_ML, todayISO, totalWater, addWater, status, cardNotification, syncProgress };
})(self);
