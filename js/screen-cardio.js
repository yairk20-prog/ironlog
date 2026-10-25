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
  recommendCardio, weeklyCardioMinutes, WEEKLY_CARDIO_TARGET, plannedCardioCursor, plannedProgram
} from './cardio.js';

let LOOP = null;     // the 250 ms ticker
let WAKE = null;     // screen wake lock
let WATCH = null;    // geolocation watch id
let DEMO = null;     // photo crossfade
let LIVE = null;     // the run on screen — saved on the way out, so GPS
                     // distance since the last periodic save isn't lost

export function cleanup() {
  if (LIVE) saveActiveCardio(LIVE);
  LIVE = null;
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
          el('small', { text: 'בריצה בחוץ. המדידה רצה כל עוד המסך הזה פתוח.' })
        ]),
        el('span', { class: 'opt-check on' }, [icon(ICONS.check, 16)])
      ]);
      box.appendChild(gpsRow);
    }

    box.appendChild(el('button', {
      class: 'btn primary full',
      onclick: async () => {
        await startCardio(p.id, ctx.settings, { variant, gps });
        close();
        buzz([0, 30, 60, 30]);
        ctx.reload();
      }
    }, [icon(ICONS.play, 18), 'התחל']));
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
  const gpsNote = el('p', { class: 'tiny dim', style: { margin: 0, textAlign: 'center' } });

  const pauseBtn = el('button', { class: 'btn primary full cardio-pause', onclick: () => togglePause() });
  const skipBtn = el('button', { class: 'btn full', onclick: () => skip() }, [icon(ICONS.chevron, 17), 'דלג']);

  let lastIndex = -1;
  let lastPic = null;
  let lastSave = 0;
  let lastFix = null;

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

    if (Date.now() - lastSave > 5000) { lastSave = Date.now(); saveActiveCardio(run); }
  }

  function announce(phase) {
    chime();
    buzz([0, 120, 80, 120]);
    speak(phase.label);
  }

  async function togglePause() {
    if (run.pausedAt) {
      run.pausedMs += Date.now() - run.pausedAt;
      run.pausedAt = null;
      lastFix = null; // the gap while paused is not distance run
      acquireWake();
    } else {
      run.pausedAt = Date.now();
    }
    buzz(15);
    await saveActiveCardio(run);
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
    ctx.reload();
  }

  /* GPS — accumulate only plausible movement: a fix worse than 35 m is
     noise, a jump implying faster than 25 km/h is a GPS teleport, and under
     4 m is standing still with a wobbling signal. */
  if (run.gps && 'geolocation' in navigator) {
    gpsNote.textContent = 'מחפש GPS…';
    WATCH = navigator.geolocation.watchPosition((pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      gpsNote.textContent = accuracy > 35 ? 'אות GPS חלש — מחכה לדיוק טוב יותר' : '';
      if (run.pausedAt || accuracy > 35) return;
      const fix = { lat: latitude, lon: longitude, t: pos.timestamp || Date.now() };
      if (lastFix) {
        const d = haversine(lastFix, fix);
        const dt = Math.max(1, (fix.t - lastFix.t) / 1000);
        if (d < 4) return;
        if (d / dt < 7) run.distanceM += d;
      }
      lastFix = fix;
    }, (err) => {
      gpsNote.textContent = err.code === 1
        ? 'אין הרשאת מיקום — אפשר להזין מרחק ידנית בסוף'
        : 'GPS לא זמין כרגע — אפשר להזין מרחק ידנית בסוף';
    }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
  }

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
    gpsNote,
    el('div', { class: 'cardio-controls' }, [pauseBtn, skipBtn]),
    el('p', {
      class: 'tiny dim', style: { margin: '2px 0 0', textAlign: 'center', lineHeight: '1.5' },
      text: 'צליל ורטט בכל מעבר שלב — נשמע גם עם אוזניות. המסך נשאר דולק; אם הטלפון ננעל, הזמן ממשיך להימדד נכון.'
    })
  ]);
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

function haversine(a, b) {
  const R = 6371000;
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function endEarly(ctx, run) {
  const ok = await confirmSheet('לסיים את האימון?', 'מה שעשית עד עכשיו יישמר.', 'סיים', false);
  if (!ok) return;
  if (!run.pausedAt) run.pausedAt = Date.now();
  run.ending = true;
  await saveActiveCardio(run);
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
