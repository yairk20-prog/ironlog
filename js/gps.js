/* ==========================================================================
   gps.js — making sure the GPS is really on before a run, and saying why
   when it is not.

   A website cannot switch the phone's location on; it can only ask for it
   and read what comes back. So before an outdoor run the app asks, waits for
   a fix good enough to measure with, and names the problem in plain words
   when there is one: location blocked for the site, location (GPS) off on
   the phone, or no signal yet.
   ========================================================================== */

/** A fix this accurate (metres) is good enough to measure distance with. */
export const GOOD_ACCURACY = 35;

export const supported = () => 'geolocation' in navigator;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

/** 'granted' | 'denied' | 'prompt' | 'unknown' — without asking. */
export async function permissionState() {
  try {
    const p = await navigator.permissions?.query({ name: 'geolocation' });
    return p?.state || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * What the person sees for each state.
 * @returns {{title:string, text:string, ok:boolean, tone:'ok'|'warn'|'bad'|'wait'}}
 */
export function describe(state, accuracy = null) {
  switch (state) {
    case 'ok':
      return { ok: true, tone: 'ok', title: 'ה-GPS מחובר', text: `דיוק ${Math.round(accuracy)} מ׳ — אפשר לצאת לדרך.` };
    case 'weak':
      return { ok: false, tone: 'warn', title: 'יש GPS, האות עוד חלש', text: `דיוק ${Math.round(accuracy)} מ׳. בשטח פתוח, הרחק מבניינים גבוהים, זה מתחדד תוך כמה שניות.` };
    case 'denied':
      return {
        ok: false, tone: 'bad', title: 'הגישה למיקום חסומה לאפליקציה',
        text: isIOS()
          ? 'הגדרות ← פרטיות ← שירותי מיקום ← Safari / האפליקציה ← "בזמן השימוש", ואז "בדוק שוב".'
          : 'בכרום: נגיעה במנעול שליד הכתובת (או הגדרות ← הגדרות אתר ← מיקום) ← "אפשר", ואז "בדוק שוב".'
      };
    case 'off':
      return {
        ok: false, tone: 'bad', title: 'ה-GPS כבוי בטלפון',
        text: isIOS()
          ? 'הדלק אותו: הגדרות ← פרטיות ← שירותי מיקום ← פועל. ואז "בדוק שוב".'
          : 'הדלק אותו: משיכה של התפריט העליון ← "מיקום" (Location). ואז "בדוק שוב".'
      };
    case 'timeout':
      return { ok: false, tone: 'warn', title: 'עוד אין אות GPS', text: 'צא לשטח פתוח ובדוק שה"מיקום" דולק בתפריט העליון של הטלפון.' };
    case 'unsupported':
      return { ok: false, tone: 'bad', title: 'אין GPS בדפדפן הזה', text: 'אפשר לרוץ בלי מדידה ולהזין את המרחק בסוף.' };
    default:
      return { ok: false, tone: 'wait', title: 'מחפש GPS…', text: 'אם הטלפון שואל — לאשר גישה למיקום.' };
  }
}

/**
 * Ask for the location and keep reporting until stopped: each fix, or the
 * reason there is none. Asking is what makes the phone show its own
 * "allow location" (and, on many Android phones, "turn on location") prompt.
 * @param {(state:string, fix:GeolocationPosition|null) => void} onState
 * @returns {() => void} stop
 */
export function probe(onState) {
  if (!supported()) { onState('unsupported', null); return () => {}; }
  onState('searching', null);
  let id = null;
  let stopped = false;
  let got = false;
  /* No answer at all within 25 s: not an error the browser reports, but
     the person needs to hear something. */
  const quiet = setTimeout(() => { if (!got && !stopped) onState('timeout', null); }, 25000);
  try {
    id = navigator.geolocation.watchPosition((pos) => {
      got = true;
      onState(pos.coords.accuracy <= GOOD_ACCURACY ? 'ok' : 'weak', pos);
    }, (err) => {
      if (stopped) return;
      if (err.code === 1) onState('denied', null);
      else if (err.code === 2) onState('off', null);
      else onState('timeout', null);
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
  } catch {
    onState('unsupported', null);
  }
  return () => {
    stopped = true;
    clearTimeout(quiet);
    if (id != null) navigator.geolocation.clearWatch(id);
  };
}

/** Metres between two { lat, lon }. */
export function haversine(a, b) {
  const R = 6371000;
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Add one fix to a run's distance. Plausible movement only: a fix worse than
 * GOOD_ACCURACY is noise, under 4 m is standing still with a wobbling
 * signal, and faster than 7 m/s (25 km/h) is a GPS jump. A gap — the screen
 * was off, the browser paused the GPS — is bridged in a straight line when
 * the speed across it is still a running speed; that undercounts a winding
 * route, and the run counts it so the screen can say so.
 * Mutates run: distanceM, lastFix, gapM.
 * @returns {boolean} whether the fix was used
 */
export function addFix(run, { lat, lon, accuracy, t }) {
  if (accuracy > GOOD_ACCURACY) return false;
  const fix = { lat, lon, t };
  const last = run.lastFix;
  if (last) {
    const d = haversine(last, fix);
    const dt = Math.max(1, (fix.t - last.t) / 1000);
    if (d < 4) return false;
    if (d / dt < 7) {
      run.distanceM += d;
      if (dt > 20) run.gapM = (run.gapM || 0) + d;
    }
  }
  run.lastFix = fix;
  return true;
}
