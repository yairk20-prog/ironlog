/* ==========================================================================
   screen-cardio.js — pick a run, run it, log it.

   Three states on one route: the program list, the session in progress, and
   the log form once it ends. Which one shows is decided by the stored run,
   not by navigation, so leaving mid-run and coming back lands in the run.
   ========================================================================== */

import * as db from './db.js';
import { el, icon, ICONS, toast, buzz, chime, openSheet, confirmSheet, celebratePR } from './ui.js';
import { photoDemo, thumb } from './media.js';
import { fmtTime, fmtDuration } from './logic.js';
import { recentWorkouts } from './session.js';
import { tile } from './screen-summary.js';
import {
  CARDIO, ZONES, buildPhases, totalSeconds, phaseAt, kcalFor, cardioElapsed, cardioName, cardioPic,
  getActiveCardio, saveActiveCardio, clearActiveCardio, startCardio, finishCardio, paceOf,
  recommendCardio, weeklyCardioMinutes, WEEKLY_CARDIO_TARGET, plannedCardioCursor, plannedProgram,
  upcomingCues
} from './cardio.js';
import * as gps from './gps.js';
import * as timer from './timer.js';

let LOOP = null;     // the 250 ms ticker
let WAKE = null;     // screen wake lock
let WATCH = null;    // geolocation watch id
let DEMO = null;     // photo crossfade
let POCKET = null;   // closes the pocket-mode screen
let LIVE = null;     // the run on screen — saved on the way out, so GPS
                     // distance since the last periodic save isn't lost

/* ---------- phase notifications ----------
   The service worker shows them (sw.js, group "cardio"); it can hold a wait
   for about five minutes, so what is due in the next ~5 minutes is handed
   over now and again every minute while the app runs — on any screen, not
   only this one, so leaving the run screen does not silence the run. */
const HORIZON = 280;
let ARM = null;

export function armCues(run) {
  if (!timer.noticesOn() || !run || run.pausedAt || run.ending) {
    timer.toWorker({ type: 'cardio-cancel' });
    return false;
  }
  timer.toWorker({ type: 'cardio-schedule', cues: upcomingCues(run, Date.now(), HORIZON) });
  if (!ARM) {
    ARM = setInterval(async () => {
      const live = LIVE || await getActiveCardio().catch(() => null);
      if (!live || live.pausedAt || live.ending) { clearInterval(ARM); ARM = null; }
      armCues(live);
    }, 60000);
  }
  return true;
}

export function cleanup() {
  if (LIVE) saveActiveCardio(LIVE);
  LIVE = null;
  POCKET?.();
  clearInterval(LOOP); LOOP = null;
  DEMO?.stop(); DEMO = null;
  if (WATCH != null) navigator.geolocation?.clearWatch(WATCH);
  WATCH = null;
  WAKE?.release?.().catch(() => {}); WAKE = null;
  document.removeEventListener('visibilitychange', onVisible);
}

export async function render(ctx) {
  cleanup();
  const run = await getActiveCardio();
  if (!run) return pickView(ctx);
  if (run.ending || phaseAt(run.phases, cardioElapsed(run)).done) return logView(ctx, run);
  return runView(ctx, run);
}

/* ==========================================================================
   1 · choose
   ========================================================================== */

async function pickView(ctx) {
  const s = ctx.settings;
  ctx.setTitle('ריצה ואירובי', 'לשריפת שומן ולכושר לב-ריאה');
  const wrap = el('div', { class: 'stack' });

  const mins = weeklyCardioMinutes(await recentWorkouts(60));
  const pct = Math.min(100, Math.round((mins / WEEKLY_CARDIO_TARGET) * 100));
  wrap.appendChild(el('div', { class: 'card stack', style: { gap: '8px' } }, [
    el('div', { class: 'row between' }, [
      el('b', { text: 'אירובי ב-7 הימים האחרונים' }),
      el('b', { class: 'num', text: `${mins} מתוך ${WEEKLY_CARDIO_TARGET} דק׳` })
    ]),
    el('div', { class: 'meter-track' }, [el('i', { style: { width: `${pct}%` } })]),
    el('p', {
      class: 'tiny dim', style: { margin: 0, lineHeight: '1.5' },
      text: '150 דקות בשבוע בקצב בינוני זו ההמלצה של ארגון הבריאות העולמי — לבריאות הלב, ולשריפת שומן כשמשלבים עם תזונה.'
    })
  ]));

  /* On a planned cardio day, say that whichever session is picked here is
     the day's session — and lead with the one the plan named. */
  const planned = (await plannedCardioCursor(s)) != null;
  if (planned) {
    wrap.appendChild(el('div', { class: 'planned-note' }, [
      icon(ICONS.calendar, 18),
      el('span', { text: 'היום יום אירובי בתוכנית — כל אימון שתבחר כאן נספר, והתוכנית תתקדם ליום הבא.' })
    ]));
  }

  const best = planned ? plannedProgram(s) : recommendCardio(s);
  wrap.appendChild(el('div', { class: 'section-title', text: planned ? 'לפי התוכנית' : 'מומלץ לך' }));
  wrap.appendChild(programCard(ctx, CARDIO[best], true));

  wrap.appendChild(el('div', { class: 'section-title', text: 'כל האפשרויות' }));
  Object.values(CARDIO).filter((p) => p.id !== best).forEach((p) => wrap.appendChild(programCard(ctx, p, false)));
  return wrap;
}

function programCard(ctx, p, featured) {
  const minutes = Math.round(totalSeconds(buildPhases(p.id, ctx.settings.duration)) / 60);
  return el('button', { class: `cardio-card${featured ? ' featured' : ''}`, onclick: () => programSheet(ctx, p) }, [
    el('img', { src: `img/ex/${p.pic}-0.webp`, alt: '', loading: 'lazy' }),
    el('div', { class: 'cardio-card-body' }, [
      el('div', { class: 'row', style: { gap: '6px', flexWrap: 'wrap' } }, [
        el('span', { class: 'badge', text: `${minutes} דק׳` }),
        el('span', { class: 'badge', text: p.level }),
        p.outdoor ? el('span', { class: 'badge', text: 'GPS' }) : null
      ]),
      el('b', { text: p.name }),
      el('small', { text: p.desc })
    ])
  ]);
}

function programSheet(ctx, p) {
  openSheet(p.name, (close) => {
    let variant = p.variants ? Object.keys(p.variants)[0] : null;
    let gps = p.outdoor;
    const phases = buildPhases(p.id, ctx.settings.duration);
    const total = totalSeconds(phases);

    const box = el('div', { class: 'stack' });
    box.appendChild(el('p', { class: 'tiny dim', style: { margin: 0, lineHeight: '1.55' }, text: p.desc }));

    if (p.variants) {
      const chips = el('div', { class: 'row', style: { gap: '7px', flexWrap: 'wrap' } });
      const paint = () => {
        chips.replaceChildren(...Object.entries(p.variants).map(([id, v]) => el('button', {
          class: `chip${variant === id ? ' on' : ''}`,
          onclick: () => { variant = id; paint(); }
        }, [thumb(v.pic, ''), el('span', { text: v.name })])));
      };
      paint();
      box.appendChild(el('label', { class: 'field-label', text: 'על איזה מכשיר?' }));
      box.appendChild(chips);
    }

    box.appendChild(el('label', { class: 'field-label', text: `המבנה · ${fmtDuration(total)}` }));
    box.appendChild(timeline(phases, -1, 0));
    box.appendChild(p.outline
      ? el('div', { class: 'phase-outline' }, p.outline(ctx.settings.duration).map((t) => el('div', { text: t })))
      : phaseOutline(phases));

    if (p.outdoor) {
      const gpsRow = el('button', { class: 'opt on', onclick: () => {
        gps = !gps;
        gpsRow.classList.toggle('on', gps);
        gpsRow.querySelector('.opt-check').classList.toggle('on', gps);
      } }, [
        el('div', { class: 'grow' }, [
          el('b', { text: 'מדידת מרחק וקצב ב-GPS' }),
          el('small', { text: 'בריצה או הליכה בחוץ — לפני היציאה נוודא שה-GPS באמת מחובר.' })
        ]),
        el('span', { class: 'opt-check on' }, [icon(ICONS.check, 16)])
      ]);
      box.appendChild(gpsRow);
    }

    box.appendChild(noticeRow(ctx));

    box.appendChild(el('button', {
      class: 'btn primary full',
      onclick: async () => {
        /* outdoors with GPS: make sure it really works first */
        if (gps) { gpsSheet(ctx, p, variant); return; }
        await startCardio(p.id, ctx.settings, { variant, gps: false });
        close();
        buzz([0, 30, 60, 30]);
        ctx.reload();
      }
    }, [icon(ICONS.play, 18), gps ? 'המשך — בדיקת GPS' : 'התחל']));
    return box;
  });
}

/**
 * Start a program from outside this screen (the home screen's planned
 * session): outdoors, through the same GPS check; then to the run.
 */
export async function startProgram(ctx, programId) {
  const p = CARDIO[programId];
  if (p.outdoor) { gpsSheet(ctx, p, null, () => ctx.go('cardio')); return; }
  await startCardio(p.id, ctx.settings, { gps: false });
  ctx.go('cardio');
}

/** "Notify me at every change" — on, or one tap to turn on. */
function noticeRow(ctx) {
  const row = el('div', { class: 'notice-row' });
  const paint = () => {
    const on = timer.noticesOn();
    row.replaceChildren(
      el('div', { class: 'notice-ico' }, [icon(ICONS.bell, 18)]),
      el('div', { class: 'grow' }, [
        el('b', { text: 'התראה בכל מעבר: מנוחה, שינוי קצב, סיום' }),
        el('small', { text: on ? 'פעיל — עם רטט וצליל, גם כשהמסך כבוי ושומעים מוזיקה' : 'עם רטט וצליל, גם כשהמסך כבוי ושומעים מוזיקה' })
      ]),
      on ? el('span', { class: 'badge ok', text: 'פעיל' })
        : el('button', {
          class: 'btn sm primary', onclick: async (e) => {
            e.currentTarget.disabled = true;
            const why = await timer.askNotices(ctx.saveSetting);
            if (why) toast(why, 'bad');
            paint();
          }
        }, ['הפעל'])
    );
  };
  paint();
  return row;
}

/**
 * Before an outdoor run: ask for the location, wait for a real fix, and say
 * exactly what to do when there is none — the site can ask, but only the
 * person can switch the phone's location on.
 */
function gpsSheet(ctx, p, variant, started = () => ctx.reload()) {
  let stop = () => {};
  openSheet('בדיקת GPS', (close) => {
    const box = el('div', { class: 'stack gps-check' });
    const status = el('div', { class: 'gps-status' });
    const startBtn = el('button', { class: 'btn primary full', disabled: true }, [icon(ICONS.play, 18), 'התחל']);
    const retry = el('button', { class: 'btn full', hidden: true }, [icon(ICONS.target, 18), 'בדוק שוב']);
    let state = 'searching';

    const paint = (st, fix) => {
      state = st;
      const d = gps.describe(st, fix?.coords?.accuracy);
      status.className = `gps-status ${d.tone}`;
      status.replaceChildren(
        el('div', { class: 'gps-dot' }),
        el('div', { class: 'grow' }, [el('b', { text: d.title }), el('small', { text: d.text })])
      );
      startBtn.disabled = !d.ok;
      retry.hidden = !['denied', 'off', 'timeout', 'unsupported'].includes(st);
    };
    const look = () => { stop(); stop = gps.probe(paint); };

    retry.addEventListener('click', look);
    startBtn.addEventListener('click', async () => {
      stop();
      await startCardio(p.id, ctx.settings, { variant, gps: true });
      close();
      buzz([0, 30, 60, 30]);
      started();
    });

    look();
    /* the sheet closed or moved on, any way at all: stop asking for the location */
    const guard = setInterval(() => {
      if (!box.isConnected || document.querySelector('#sheet')?.hidden) { stop(); clearInterval(guard); }
    }, 800);
    box.append(
      status,
      startBtn,
      retry,
      el('p', { class: 'tiny dim', style: { margin: 0, lineHeight: '1.6' }, text: 'במהלך הריצה: כדי שהמרחק יימדד, הדפדפן צריך את המסך דולק — "מצב כיס" משאיר אותו שחור ונעול בכיס, חוסך סוללה, והמוזיקה ממשיכה. אם המסך בכל זאת כבה, הזמן וההתראות ממשיכים, והקטע הזה נמדד בקו ישר כשהמסך חוזר.' }),
      el('button', {
        class: 'btn ghost full', onclick: async () => {
          stop();
          await startCardio(p.id, ctx.settings, { variant, gps: false });
          close();
          started();
        }
      }, ['התחל בלי GPS (מרחק ידני בסוף)'])
    );
    return box;
  });
}

/** Phases merged into readable lines: "8 × (ריצה 1:00 · הליכה 1:30)". */
function phaseOutline(phases) {
  const lines = [];
  let i = 0;
  while (i < phases.length) {
    const a = phases[i];
    const b = phases[i + 1];
    let n = 1;
    if (b) {
      while (phases[i + n * 2]?.label === a.label && phases[i + n * 2 + 1]?.label === b.label) n++;
    }
    if (n > 1) {
      lines.push(`${n} × (${a.label} ${fmtTime(a.seconds)} · ${b.label} ${fmtTime(b.seconds)})`);
      i += n * 2;
    } else {
      lines.push(`${a.label} · ${fmtTime(a.seconds)}`);
      i++;
    }
  }
  return el('div', { class: 'phase-outline' }, lines.map((t) => el('div', { text: t })));
}

/** The whole session as one bar, each phase in its zone colour. */
function timeline(phases, current, fraction) {
  const total = totalSeconds(phases);
  return el('div', { class: 'cardio-timeline' }, phases.map((p, i) => el('i', {
    class: i < current ? 'past' : i === current ? 'now' : '',
    style: {
      flexGrow: String(p.seconds / total),
      '--zone': ZONES[p.zone]?.color || '#888',
      '--fill': i === current ? `${Math.round(fraction * 100)}%` : '0%'
    }
  })));
}

/* ==========================================================================
   2 · run
   ========================================================================== */

let REFRESH = null;
const onVisible = () => {
  if (document.hidden) { if (LIVE) saveActiveCardio(LIVE); }
  else REFRESH?.();
};

function runView(ctx, run) {
  LIVE = run;
  const s = ctx.settings;
  const total = totalSeconds(run.phases);
  ctx.setTitle(cardioName(run), 'אירובי');
  ctx.setActions([el('button', { class: 'btn sm primary', text: 'סיים', onclick: () => endEarly(ctx, run) })]);

  const media = el('div', { class: 'cardio-media' });
  const zone = el('span', { class: 'zone-pill' });
  const label = el('h2', { class: 'cardio-label' });
  const clock = el('div', { class: 'cardio-clock num' });
  const cue = el('p', { class: 'cardio-cue' });
  const bar = el('div');
  const next = el('div', { class: 'cardio-next' });
  const stats = el('div', { class: 'cardio-stats' });
  const gpsNote = el('div', { class: 'gps-live' });

  const pauseBtn = el('button', { class: 'btn primary full cardio-pause', onclick: () => togglePause() });
  const skipBtn = el('button', { class: 'btn full', onclick: () => skip() }, [icon(ICONS.chevron, 17), 'דלג']);

  let lastIndex = -1;
  let lastPic = null;
  let lastSave = 0;
  let lastFixAt = 0;     // when the GPS last answered with a usable fix
  let gpsProblem = null; // 'denied' | 'off' | null

  function paint() {
    const elapsed = cardioElapsed(run);
    const at = phaseAt(run.phases, elapsed);
    if (at.done) { finishedAll(); return; }

    if (at.i !== lastIndex) {
      if (lastIndex !== -1) announce(at.phase);
      lastIndex = at.i;
      const pic = at.phase.pic || cardioPic(run);
      if (pic !== lastPic) {
        lastPic = pic;
        DEMO?.stop();
        DEMO = photoDemo(pic, { period: at.phase.zone === 'hard' ? 1200 : 2600 });
        media.replaceChildren(DEMO.node);
      }
      const z = ZONES[at.phase.zone] || ZONES.steady;
      zone.textContent = z.name;
      zone.style.setProperty('--zone', z.color);
      label.textContent = at.phase.label;
      cue.textContent = at.phase.cue || '';
      const n = run.phases[at.i + 1];
      next.textContent = n ? `הבא: ${n.label} · ${fmtTime(n.seconds)}` : 'זה השלב האחרון';
    }

    clock.textContent = fmtTime(at.left);
    bar.replaceChildren(timeline(run.phases, at.i, at.into / at.phase.seconds));

    const kcal = kcalFor(run, elapsed, s.bodyweight || 75);
    const km = run.distanceM / 1000;
    /* Outdoors, distance and pace are what a runner glances at; the phase
       clock above already says how long is left. */
    const cells = run.gps
      ? [[km.toFixed(2), 'ק״מ'], [paceOf(elapsed, km) || '—', 'קצב לק״מ'], [fmtTime(elapsed), 'זמן'], [String(kcal), 'קק״ל']]
      : [[fmtTime(elapsed), 'זמן'], [fmtTime(total - elapsed), 'נותר'], [String(kcal), 'קק״ל']];
    stats.classList.toggle('four', run.gps);
    stats.replaceChildren(...cells.map(([v, k]) => el('div', {}, [el('b', { class: 'num', text: v }), el('small', { text: k })])));

    pauseBtn.replaceChildren(icon(run.pausedAt ? ICONS.play : ICONS.pause, 18), el('span', { text: run.pausedAt ? 'המשך' : 'השהה' }));
    media.classList.toggle('paused', !!run.pausedAt);

    if (run.gps) paintGps();
    if (Date.now() - lastSave > 5000) { lastSave = Date.now(); saveActiveCardio(run); }
  }

  /* What the GPS is doing, in a line — and the one button that helps when it is not. */
  let gpsShown = '';
  function paintGps() {
    let text;
    let tone = '';
    let fix = false;
    if (gpsProblem) {
      const d = gps.describe(gpsProblem);
      text = `${d.title} — ${d.text}`;
      tone = 'bad';
      fix = true;
    } else if (run.pausedAt) {
      text = 'GPS · מושהה';
    } else if (!lastFixAt) {
      text = 'מחפש GPS…';
      tone = 'warn';
    } else if (Date.now() - lastFixAt > 20000) {
      text = `אין אות GPS כבר ${Math.round((Date.now() - lastFixAt) / 1000)} שניות — בדוק שה"מיקום" דולק`;
      tone = 'warn';
      fix = true;
    } else {
      text = `GPS מחובר${run.gapM > 30 ? ` · ${Math.round(run.gapM)} מ׳ נמדדו בקו ישר כשהמסך היה כבוי` : ''}`;
      tone = 'ok';
    }
    const key = `${tone}|${text}|${fix}`;
    if (key === gpsShown) return;
    gpsShown = key;
    gpsNote.className = `gps-live ${tone}`;
    gpsNote.replaceChildren(...[
      el('span', { class: 'gps-dot' }),
      el('span', { class: 'grow', text }),
      fix ? el('button', { class: 'btn sm', onclick: () => watchGps() }, ['בדוק שוב']) : null
    ].filter(Boolean));
  }

  function announce(phase) {
    /* With the app hidden the notification (sw.js) has already said it, on
       time; a chime from a throttled page would only come late. */
    if (document.hidden) return;
    chime();
    buzz([0, 120, 80, 120]);
    speak(phase.label);
  }

  /** Every whole kilometre: the distance and the pace so far. */
  function split(km) {
    const pace = paceOf(cardioElapsed(run), run.distanceM / 1000);
    const text = `קילומטר ${km}${pace ? ` · קצב ממוצע ${pace}` : ''}`;
    if (!document.hidden) { chime(); buzz([0, 150, 80, 150]); speak(text.replace(' · ', ', ')); }
    if (timer.noticesOn()) {
      navigator.serviceWorker?.ready.then((reg) => reg.showNotification(text, {
        body: cardioName(run), tag: 'ironlog-split', renotify: true, silent: false,
        vibrate: [300, 150, 300], dir: 'rtl', lang: 'he', icon: './icons/icon-192.png',
        data: { url: './index.html#/cardio', focusOnly: true }
      })).catch(() => {});
    }
  }

  async function togglePause() {
    if (run.pausedAt) {
      run.pausedMs += Date.now() - run.pausedAt;
      run.pausedAt = null;
      run.lastFix = null; // the gap while paused is not distance run
      acquireWake();
    } else {
      run.pausedAt = Date.now();
    }
    buzz(15);
    await saveActiveCardio(run);
    armCues(run);   // paused: the cues are cancelled; resumed: re-timed
    paint();
  }

  async function skip() {
    const elapsed = cardioElapsed(run);
    const at = phaseAt(run.phases, elapsed);
    /* Skipping moves the clock, not the phases: the time not spent is taken
       off the session by pretending it was spent paused. */
    run.pausedMs -= at.left * 1000;
    if (run.pausedAt) run.pausedAt = Date.now();
    await saveActiveCardio(run);
    armCues(run);
    paint();
  }

  async function finishedAll() {
    clearInterval(LOOP); LOOP = null;
    chime();
    buzz([0, 200, 100, 200, 100, 400]);
    speak('סיימת. כל הכבוד');
    run.ending = true;
    if (!run.pausedAt) run.pausedAt = run.startedAt + run.pausedMs + total * 1000;
    await saveActiveCardio(run);
    armCues(run);
    ctx.reload();
  }

  /* GPS: each usable fix adds plausible movement (gps.addFix); the last
     fix lives on the run, so a reload or a frozen page bridges the gap. */
  function watchGps() {
    if (WATCH != null) navigator.geolocation?.clearWatch(WATCH);
    WATCH = null;
    gpsProblem = null;
    gpsShown = '';
    if (!gps.supported()) { gpsProblem = 'unsupported'; return; }
    WATCH = navigator.geolocation.watchPosition((pos) => {
      gpsProblem = null;
      if (pos.coords.accuracy <= gps.GOOD_ACCURACY) lastFixAt = Date.now();
      if (run.pausedAt) return;
      const km = Math.floor(run.distanceM / 1000);
      gps.addFix(run, { lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy, t: pos.timestamp || Date.now() });
      const now = Math.floor(run.distanceM / 1000);
      if (now > km && now > (run.splitKm || 0)) { run.splitKm = now; split(now); }
    }, (err) => {
      if (err.code === 1) gpsProblem = 'denied';
      else if (err.code === 2) gpsProblem = 'off';
    }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
  }
  if (run.gps) watchGps();

  /* The cues for the next few minutes go to the service worker now. */
  armCues(run);

  acquireWake();
  REFRESH = () => { acquireWake(); paint(); };
  document.addEventListener('visibilitychange', onVisible);
  LOOP = setInterval(paint, 250);
  paint();

  return el('div', { class: 'cardio-run stack' }, [
    media,
    el('div', { class: 'cardio-head' }, [zone, label, clock, cue]),
    bar,
    next,
    stats,
    run.gps ? gpsNote : null,
    el('div', { class: 'cardio-controls' }, [pauseBtn, skipBtn]),
    el('button', { class: 'btn full ghost', onclick: () => pocketMode(() => fmtTime(phaseAt(run.phases, cardioElapsed(run)).left)) }, [icon(ICONS.lock, 17), 'מצב כיס — מסך שחור ונעול']),
    timer.noticesOn() ? null : noticeRow(ctx),
    el('p', {
      class: 'tiny dim', style: { margin: '2px 0 0', textAlign: 'center', lineHeight: '1.5' },
      text: run.gps
        ? 'בכל מעבר שלב: צליל, רטט והתראה לטלפון — גם עם מוזיקה באוזניות. למדידת מרחק המסך צריך להישאר דולק: "מצב כיס" שומר אותו שחור ונעול בכיס.'
        : 'בכל מעבר שלב: צליל, רטט והתראה לטלפון — גם עם מוזיקה באוזניות ועם מסך כבוי.'
    })
  ]);
}

/**
 * Pocket mode: the screen stays on (so the browser keeps the GPS going) but
 * black and locked against a pocket's touches; holding a finger on it for
 * two seconds brings the run back. Black pixels are off on most phone
 * screens, so it costs little battery. The clock is drawn faintly, for a
 * glance.
 */
function pocketMode(clockText) {
  POCKET?.();
  const clock = el('b', { class: 'pocket-clock num' });
  const bar = el('div', { class: 'pocket-hold' });
  const wrap = el('div', { class: 'pocket', role: 'dialog', 'aria-label': 'מצב כיס' }, [
    clock,
    el('small', { text: 'מצב כיס · החזק אצבע 2 שניות כדי לחזור' }),
    bar
  ]);
  const paint = () => { clock.textContent = clockText(); };
  const tick = setInterval(paint, 1000);
  let hold = null;
  const exit = () => {
    clearInterval(tick);
    clearTimeout(hold);
    wrap.remove();
    POCKET = null;
  };
  wrap.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    wrap.classList.add('holding');
    hold = setTimeout(() => { buzz(30); exit(); }, 2000);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => wrap.addEventListener(ev, () => {
    clearTimeout(hold);
    wrap.classList.remove('holding');
  }));
  wrap.addEventListener('contextmenu', (e) => e.preventDefault());
  paint();
  document.body.appendChild(wrap);
  acquireWake();
  POCKET = exit;
}

async function acquireWake() {
  try {
    if ('wakeLock' in navigator && !WAKE && !document.hidden) {
      WAKE = await navigator.wakeLock.request('screen');
      WAKE.addEventListener?.('release', () => { WAKE = null; });
    }
  } catch { /* not supported, or the tab is hidden — the timeline is wall-clock anyway */ }
}

/** Spoken phase names, only when the device actually has a Hebrew voice —
    an English voice reading Hebrew letters is worse than the chime alone. */
function speak(text) {
  try {
    const synth = window.speechSynthesis;
    const voice = synth?.getVoices().find((v) => v.lang?.toLowerCase().startsWith('he'));
    if (!voice) return;
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang;
    synth.cancel();
    synth.speak(u);
  } catch { /* speech is a bonus */ }
}

async function endEarly(ctx, run) {
  const ok = await confirmSheet('לסיים את האימון?', 'מה שעשית עד עכשיו יישמר.', 'סיים', false);
  if (!ok) return;
  if (!run.pausedAt) run.pausedAt = Date.now();
  run.ending = true;
  await saveActiveCardio(run);
  armCues(run);
  ctx.reload();
}

/* ==========================================================================
   3 · log
   ========================================================================== */

const EFFORT = [
  { rpe: 2, name: 'קל מאוד' },
  { rpe: 4, name: 'קל' },
  { rpe: 6, name: 'בינוני' },
  { rpe: 8, name: 'קשה' },
  { rpe: 10, name: 'מקסימלי' }
];

function logView(ctx, run) {
  const s = ctx.settings;
  const prog = CARDIO[run.program];
  const elapsed = cardioElapsed(run);
  const kcal = kcalFor(run, elapsed, s.bodyweight || 75);
  const gpsKm = run.distanceM ? Math.round(run.distanceM / 10) / 100 : null;
  const distanceMatters = prog.outdoor || ['treadmill', 'bike', 'rower'].includes(run.variant);
  let rpe = 6;

  ctx.setTitle('סיום אירובי', cardioName(run));
  ctx.setActions([]);

  const km = el('input', {
    type: 'number', inputmode: 'decimal', step: '0.01', min: '0', placeholder: '0.00',
    value: gpsKm != null ? String(gpsKm) : ''
  });
  const paceLine = el('small', { class: 'dim' });
  const paintPace = () => {
    const p = paceOf(elapsed, Number(km.value));
    paceLine.textContent = p ? `קצב ממוצע: ${p} לק״מ` : '';
  };
  km.addEventListener('input', paintPace);
  paintPace();

  const effort = el('div', { class: 'effort-row' });
  const paintEffort = () => effort.replaceChildren(...EFFORT.map((e) => el('button', {
    class: `chip${rpe === e.rpe ? ' on' : ''}`,
    onclick: () => { rpe = e.rpe; paintEffort(); }
  }, [el('span', { text: e.name })])));
  paintEffort();

  return el('div', { class: 'stack' }, [
    el('div', { class: 'summary-hero' }, [
      el('div', { class: 's-mark' }, [icon(ICONS.run, 30)]),
      el('h2', { text: 'כל הכבוד' }),
      el('p', { text: cardioName(run) })
    ]),
    el('div', { class: 'summary-grid' }, [
      tile(fmtDuration(elapsed), 'זמן תנועה', ICONS.timer),
      tile(`${kcal}`, 'קק״ל (הערכה)', ICONS.flame)
    ]),
    distanceMatters ? el('div', { class: 'card stack', style: { gap: '8px' } }, [
      el('label', { class: 'field-label', text: gpsKm != null ? 'מרחק (נמדד ב-GPS, אפשר לתקן)' : 'מרחק בק״מ (לא חובה)' }),
      km,
      paceLine
    ]) : null,
    el('div', { class: 'card stack', style: { gap: '8px' } }, [
      el('label', { class: 'field-label', text: 'כמה קשה זה היה?' }),
      effort
    ]),
    el('button', {
      class: 'btn primary full',
      onclick: async (e) => {
        e.currentTarget.disabled = true;
        const w = await finishCardio(run, { distanceKm: distanceMatters ? Number(km.value) || null : null, rpe }, s.bodyweight || 75);
        await db.setSetting('lastFinishedWorkout', w.id);
        celebratePR('אירובי הושלם');
        import('./cloud.js').then((c) => c.autoBackUp()).catch(() => {});
        import('./gdrive.js').then((g) => g.autoSync()).catch(() => {});
        setTimeout(() => ctx.go('summary'), 600);
      }
    }, [icon(ICONS.check, 18), 'שמור']),
    el('button', {
      class: 'btn ghost full danger',
      onclick: async () => {
        if (!await confirmSheet('למחוק את האימון?', 'האימון לא יישמר בהיסטוריה.', 'מחק')) return;
        await clearActiveCardio();
        toast('האימון נמחק');
        ctx.go('home');
      }
    }, [icon(ICONS.trash, 17), 'לא לשמור'])
  ]);
}
