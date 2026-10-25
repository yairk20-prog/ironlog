/* ==========================================================================
   reminders.js — which reminders are due for one person, right now.

   Pure: given a stored subscription record and a moment, it says what to
   send and what to remember having sent. The hourly scheduled function does
   the sending; the tests call this directly with chosen times.

   A reminder is only worth sending when it says something true about the
   day, so both kinds compare what was logged against where the day should
   be by now:
   · water — the target spread evenly over the waking window; behind that
     line, at most once every `every` hours, a nudge to drink.
   · protein — three checkpoints (noon, four, eight) at 30%, 55% and 80% of
     the target; behind at a checkpoint, one message naming the gap.
   If the app has not reported today at all, nothing is logged yet — which
   is exactly when a reminder helps.
   ========================================================================== */

const GLASS_ML = 250;
const PROTEIN_CHECKS = [[12, 0.3], [16, 0.55], [20, 0.8]];

/** Local date and hour in the person's own time zone. */
export function localClock(now, tz) {
  let zone = tz;
  try { new Intl.DateTimeFormat('en-CA', { timeZone: zone }); } catch { zone = 'Asia/Jerusalem'; }
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(now)).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) % 24 };
}

/**
 * @param {object} rec  { prefs:{water,protein,from,to,every}, tz, progress:{date,water_ml,water_target,protein,protein_target}, sent:{water, protein:{date,slots}} }
 * @param {number} now  epoch ms
 * @returns {{messages:Array<{kind:string,title:string,body:string,tag:string,url:string}>, sent:object}}
 */
export function dueReminders(rec, now = Date.now()) {
  const prefs = { water: true, protein: true, from: 9, to: 21, every: 2, ...(rec.prefs || {}) };
  const { date, hour } = localClock(now, rec.tz);
  const sent = { water: 0, protein: { date: '', slots: [] }, ...(rec.sent || {}) };
  const messages = [];
  if (hour < prefs.from || hour >= prefs.to) return { messages, sent };

  const p = rec.progress || {};
  const today = p.date === date;
  const water = today ? p.water_ml || 0 : 0;
  const waterTarget = p.water_target || 3000;
  const protein = today ? p.protein || 0 : 0;
  const proteinTarget = p.protein_target || 120;

  if (prefs.water && water < waterTarget) {
    const span = Math.max(1, prefs.to - prefs.from);
    const expected = waterTarget * Math.min(1, (hour - prefs.from + 1) / span);
    const gapOk = now - (sent.water || 0) >= prefs.every * 3600000 - 5 * 60000;
    if (water < expected * 0.9 && gapOk) {
      const drunk = Math.floor(water / GLASS_ML);
      const total = Math.round(waterTarget / GLASS_ML);
      messages.push({
        kind: 'water',
        title: 'זמן לכוס מים',
        body: drunk ? `שתית ${drunk} מתוך ${total} כוסות היום. עוד כוס עכשיו?` : `עוד לא נרשמו מים היום — היעד ${total} כוסות. מתחילים בכוס אחת.`,
        tag: 'ironlog-water',
        url: '/#/nutrition'
      });
      sent.water = now;
    }
  }

  if (prefs.protein && protein < proteinTarget) {
    const done = sent.protein?.date === date ? sent.protein.slots || [] : [];
    /* The latest checkpoint already passed today and not yet reported. */
    const check = [...PROTEIN_CHECKS].reverse().find(([h]) => hour >= h);
    if (check && !done.includes(check[0]) && protein < proteinTarget * check[1]) {
      const left = Math.round(proteinTarget - protein);
      messages.push({
        kind: 'protein',
        title: `חסרים ${left} ג׳ חלבון להיום`,
        body: left <= 30
          ? `${Math.round(protein)} מתוך ${Math.round(proteinTarget)} ג׳. יוגורט חלבון או קוטג׳ יסגרו את הפער.`
          : `${Math.round(protein)} מתוך ${Math.round(proteinTarget)} ג׳. בארוחה הבאה: חזה עוף, טונה, ביצים או סקופ חלבון.`,
        tag: 'ironlog-protein',
        url: '/#/nutrition'
      });
      sent.protein = { date, slots: [...done, check[0]] };
    } else if (check && !done.includes(check[0])) {
      /* On track at this checkpoint: nothing to say, and nothing to say
         later about this checkpoint either. */
      sent.protein = { date, slots: [...done, check[0]] };
    }
  }

  return { messages, sent };
}
