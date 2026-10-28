/* ==========================================================================
   screen-home.js — "היום": what to train next, streak, week strip, quick stats.
   ========================================================================== */

import * as db from './db.js';
import { el, icon, ICONS, openSheet } from './ui.js';
import {
  DAY_TYPES, VENUES, VENUE_DAYS, restFor, goalList, resolveGoal, templateForIndex, planSlots, venueToday, sessionName, CHALLENGES,
  TEMPLATES, FUNCTIONAL, dayAt
} from './programs.js';
import { CARDIO, getActiveCardio, cardioElapsed, cardioPic, cardioLine, cardioDay, recommendCardio, plannedProgram, buildPhases, totalSeconds } from './cardio.js';
import { dayCard, restDayCard, cardioDayCard } from './screen-plan.js';
import { exerciseName, search, CATEGORIES } from './exercises.js';
import { frameUrl, hasImages, thumb } from './media.js';
import { fmtDuration, todayISO, HEB_DAYS } from './logic.js';
import { weighIns, weightStats, weighSheet } from './progress.js';
import {
  getActive, nextUp, createFromTemplate, createFreeWorkout, createChallenge,
  createQuickWorkout, challengeBest, advanceRotation, recentWorkouts, workoutSummary, streak
} from './session.js';

export async function render(ctx) {
  const { settings } = ctx;
  ctx.setTitle(
    settings.userName ? `היי ${settings.userName}` : 'היום',
    new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })
  );

  const wrap = el('div', { class: 'stack' });

  const active = await getActive();
  const cardio = await getActiveCardio();
  const up = await nextUp(settings);
  const done = await recentWorkouts(60);
  const stk = await streak();
  const venue = venueToday(settings, todayISO());

  /* ---- hero: resume or start ---- */
  wrap.appendChild(active
    ? heroResume(ctx, active)
    : cardio
      ? heroCardio(ctx, cardio)
      : up.template
        ? heroStart(ctx, up.template, settings, venue)
        : up.cardio
          ? heroPlannedCardio(ctx, up)
          : heroRest(ctx, up));

  /* A way out of the plan that doesn't require being on a rest day for it:
     a stretch, a posture session, a run, a really quick pass at whatever's
     next, a challenge, or whatever machine is free right now. Every one of
     these is off-plan by design, so none of them moves the rotation. (A day
     away from the gym is not off-plan — that is the venue choice on today's
     workout above, which keeps the rotation moving.) */
  if (!active && !cardio) {
    wrap.appendChild(el('div', { class: 'section-title', text: 'בלי קשר לתוכנית' }));
    wrap.appendChild(el('div', { class: 'quick' }, [
      quickTile(ICONS.run, 'ריצה / אירובי', 'שריפת שומן', () => ctx.go('cardio')),
      quickTile(ICONS.bolt, 'זריז', 'כ-10 דקות', () => quickWorkout(ctx, venue)),
      quickTile(ICONS.posture, 'יציבה', 'ניידות', () => startTemplate(ctx, 'posture')),
      quickTile(ICONS.stretch, 'מתיחות', '5 דקות', () => startTemplate(ctx, 'stretch')),
      quickTile(ICONS.flame, 'אתגר', 'שיא אישי', () => challengeSheet(ctx)),
      quickTile(ICONS.search, 'חופשי', 'בחר תרגיל', () => freeSheet(ctx))
    ]));
    /* Functional circuits get a full-width way in rather than a seventh
       tile: three different sessions sit behind it, and it is the one
       off-plan choice that is a whole workout rather than a filler. */
    wrap.appendChild(el('button', { class: 'func-wide', onclick: () => functionalSheet(ctx) }, [
      hasImages('kb_swing') ? el('img', { src: frameUrl('kb_swing', 1), alt: '', loading: 'lazy' }) : null,
      el('div', { class: 'grow' }, [
        el('b', { text: 'אימון פונקציונלי' }),
        el('small', { text: 'מעגלים: קטלבל, קפיצות, נשיאה ומשקל גוף' })
      ]),
      icon(ICONS.chevron, 18)
    ]));
  }

  /* What is coming, as information rather than controls: the list answers
     "what am I doing today" without adding a single thing to tap. A workout
     already under way is already trimmed to size; one not yet started is
     shown as planSlots() will build it — venue and session length applied —
     so this list never promises something "start" won't deliver. */
  const preview = active?.slots
    || (!cardio && up.template && planSlots(up.template, settings, venue));
  if (preview?.length) {
    wrap.appendChild(el('div', { class: 'section-title', text: 'התרגילים היום' }));
    wrap.appendChild(el('div', { class: 'today-list' }, preview.map((slot, i) => {
      const id = slot.ex;
      const reps = slot.seconds ? `${slot.seconds} שניות` : `${slot.sets || slot.s} סטים`;
      return el('div', { class: `today-row${slot.done ? ' done' : ''}` }, [
        hasImages(id) ? thumb(id, '') : el('div', { class: 'ex-ord', text: String(i + 1) }),
        el('div', { class: 'grow' }, [
          el('b', { text: exerciseName(id) }),
          el('small', { text: reps })
        ]),
        slot.done ? icon(ICONS.check, 16) : null
      ]);
    })));
  }

  /* A weigh-in a week is what makes the progress screen worth opening;
     after seven days without one, ask — once, quietly, with one tap. */
  const wst = weightStats(await weighIns(), settings.goalWeight);
  if (!wst || wst.daysSinceLast >= 7) {
    wrap.appendChild(el('button', { class: 'weigh-prompt', onclick: () => weighSheet(ctx) }, [
      icon(ICONS.scale, 22),
      el('div', { class: 'grow' }, [
        el('b', { text: 'שקילה שבועית' }),
        el('small', { text: wst ? `עברו ${wst.daysSinceLast} ימים מהשקילה האחרונה (${wst.last} ק״ג)` : 'שקילה ראשונה — ומהיום רואים מגמה ויעד' })
      ]),
      icon(ICONS.plus, 18)
    ]));
  }

  /* A peek at tomorrow: the next slot in the split after the one that's
     up now, so the plan never feels like a surprise. */
  const tomorrowKey = dayAt(settings, up.cursor + 1);
  const tomorrowTpl = TEMPLATES[tomorrowKey];
  wrap.appendChild(el('div', { class: 'section-title', text: 'מחר' }));
  wrap.appendChild(tomorrowTpl
    ? dayCard(ctx, tomorrowTpl, false, () => ctx.go('plan'))
    : tomorrowKey === 'cardio'
      ? cardioDayCard(settings, false, () => ctx.go('plan'))
      : restDayCard(false, 'יום מנוחה'));

  /* Everything below is a progress report, and a progress report with no
     progress in it is noise. It appears as there is something to say. */
  if (done.length) {
    const week = done.filter((w) => withinDays(w.date, 7));
    const weekVolume = (await Promise.all(week.map((w) => workoutSummary(w.id))))
      .reduce((s, x) => s + x.volume, 0);

    wrap.appendChild(el('div', { class: 'stats' }, [
      stat(String(stk), 'רצף ימים'),
      stat(String(week.length), 'אימונים השבוע'),
      stat(weekVolume >= 1000 ? `${(weekVolume / 1000).toFixed(1)}ט׳` : String(Math.round(weekVolume)), 'נפח שבועי')
    ]));

    wrap.appendChild(el('div', { class: 'section-title', text: '7 הימים האחרונים' }));
    wrap.appendChild(weekStrip(done));

    wrap.appendChild(el('div', { class: 'section-title', text: 'אימונים אחרונים' }));
    for (const w of done.slice(0, 3)) {
      const sum = await workoutSummary(w.id);
      const pic = w.cardio ? cardioPic(w.cardio) : w.slots?.find((s) => hasImages(s.ex))?.ex;
      const when = new Date(w.finished_at).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
      wrap.appendChild(el('button', {
        class: 'list-link',
        onclick: () => ctx.go('history')
      }, [
        pic ? thumb(pic, w.name) : el('div', { class: 'ex-ord', text: DAY_TYPES[w.type]?.short || '' }),
        el('div', { class: 'grow' }, [
          el('b', { text: w.name }),
          el('small', {
            text: w.cardio
              ? `${when} · ${cardioLine(w)}`
              : `${when} · ${sum.sets} סטים · ${sum.volume ? `${Math.round(sum.volume)} ק״ג נפח` : `${sum.reps} חזרות`}`
          })
        ]),
        icon(ICONS.chevron, 18)
      ]));
    }
  }

  return wrap;
}

/* ---------- hero variants ---------- */

function heroResume(ctx, active) {
  const mins = Math.round((Date.now() - active.started_at) / 60000);
  const lead = active.slots.find((s) => hasImages(s.ex))?.ex;
  return el('div', { class: 'hero' }, [
    lead ? el('img', { class: 'hero-bg', src: frameUrl(lead, 0), alt: '', loading: 'lazy' }) : null,
    el('div', { class: 'hero-kicker', text: 'אימון פעיל' }),
    el('h2', { text: active.name }),
    el('p', { text: `התחיל לפני ${mins} דקות · ${active.slots.filter((s) => s.done).length}/${active.slots.length} תרגילים` }),
    el('button', {
      class: 'btn primary full',
      onclick: () => ctx.go('workout')
    }, [icon(ICONS.play, 18), 'המשך אימון'])
  ]);
}

function heroStart(ctx, tpl, settings, venue) {
  /* The exercises are listed below in full, so the hero says how big the
     session is instead of repeating the first three names — counted from
     what "start" will actually build at this venue and session length. */
  const slots = planSlots(tpl, settings, venue);
  const sets = slots.reduce((n, x) => n + (x.s || 3), 0);
  const mins = Math.round((sets * (restFor(goalList(settings), null) + 45)) / 60 / 5) * 5;
  const lead = slots.find((s) => hasImages(s.ex))?.ex;
  const away = venue !== 'gym' && VENUE_DAYS[venue]?.[tpl.type];
  const dayName = DAY_TYPES[tpl.type]?.name || '';

  /* Where today happens. A park or home pick builds this same day out of
     what's there and still counts as this day — so missing the gym costs
     nothing: the rotation moves on and the streak holds. The pick lasts
     only for today. */
  const seg = el('div', { class: 'venue-seg', role: 'radiogroup', 'aria-label': 'איפה מתאמנים היום' },
    Object.values(VENUES).map((v) => el('button', {
      class: venue === v.id ? 'on' : '',
      role: 'radio',
      'aria-checked': String(venue === v.id),
      onclick: async () => {
        if (venue === v.id) return;
        await ctx.saveSetting('venueToday', { date: todayISO(), venue: v.id });
        ctx.reload();
      }
    }, [icon(ICONS[v.id === 'gym' ? 'dumbbell' : v.id], 16), el('span', { text: v.short })])));

  return el('div', { class: 'hero' }, [
    lead ? el('img', { class: 'hero-bg', src: frameUrl(lead, 0), alt: '', loading: 'lazy' }) : null,
    el('div', { class: 'hero-kicker', text: `${dayName} · ${resolveGoal(goalList(settings)).name}` }),
    el('h2', { text: sessionName(tpl, venue) }),
    el('p', { text: `${slots.length} תרגילים · ${sets} סטים · כ-${mins} דקות` }),
    seg,
    away ? el('p', {
      class: 'venue-note',
      text: `גרסת ${VENUES[venue].name} של יום ה${dayName} — נספר כאימון של היום, והתוכנית ממשיכה כרגיל.`
    }) : null,
    el('button', {
      class: 'btn primary full',
      onclick: async () => {
        await createFromTemplate(tpl.id, settings, { venue });
        ctx.go('workout');
      }
    }, [icon(ICONS.play, 18), 'התחל אימון'])
  ]);
}

/** Today the plan says cardio: the planned session, one tap to start it. */
function heroPlannedCardio(ctx, up) {
  const p = CARDIO[plannedProgram(ctx.settings)];
  const mins = Math.round(totalSeconds(buildPhases(p.id, ctx.settings.duration)) / 60);
  return el('div', { class: 'hero' }, [
    el('img', { class: 'hero-bg', src: frameUrl(p.pic, 0), alt: '', loading: 'lazy' }),
    el('div', { class: 'hero-kicker', text: `אירובי · לפי התוכנית · ${resolveGoal(goalList(ctx.settings)).name}` }),
    el('h2', { text: p.name }),
    el('p', { text: `כ-${mins} דקות · ${p.desc}` }),
    el('button', {
      class: 'btn primary full', style: { marginTop: '14px' },
      onclick: async () => {
        const { startProgram } = await import('./screen-cardio.js');
        await startProgram(ctx, p.id);
      }
    }, [icon(ICONS.play, 18), 'התחל']),
    el('div', { class: 'row', style: { marginTop: '8px', gap: '8px' } }, [
      el('button', { class: 'btn full', style: { flex: '1' }, onclick: () => ctx.go('cardio') }, [icon(ICONS.run, 17), 'בחר אחר']),
      el('button', {
        class: 'btn full', style: { flex: '1' },
        onclick: async () => { await advanceRotation(1); ctx.reload(); }
      }, [icon(ICONS.chevron, 17), 'דלג ליום הבא'])
    ])
  ]);
}

function heroRest(ctx, up) {
  /* Rest from lifting is not rest from everything. When the goals ask for
     cardio — a cut, or cardiovascular fitness itself — the rest day is
     where it goes, so it's the first thing offered. */
  const wantsCardio = cardioDay(ctx.settings);
  const pick = CARDIO[recommendCardio(ctx.settings)];
  return el('div', { class: 'hero' }, [
    wantsCardio ? el('img', { class: 'hero-bg', src: frameUrl(pick.pic, 0), alt: '', loading: 'lazy' }) : null,
    el('div', { class: 'hero-kicker', text: wantsCardio ? 'מנוחה מכוח · לפי התוכנית' : 'לפי התוכנית' }),
    el('h2', { text: wantsCardio ? 'יום אירובי' : 'יום מנוחה' }),
    el('p', {
      text: wantsCardio
        ? `מנוחה לשרירים, לא ללב. מומלץ לך: ${pick.name} — ${pick.desc}`
        : 'השריר גדל במנוחה. אפשר לעשות סשן יציבה קצר, אירובי קל, או לדלג ליום הבא.'
    }),
    wantsCardio ? el('button', {
      class: 'btn primary full',
      style: { marginTop: '14px' },
      onclick: () => ctx.go('cardio')
    }, [icon(ICONS.run, 18), 'לאימון האירובי']) : null,
    el('div', { class: 'row', style: { marginTop: wantsCardio ? '8px' : '14px', gap: '8px' } }, [
      el('button', {
        class: 'btn full',
        style: { flex: '1' },
        onclick: async () => {
          await createFromTemplate('posture', ctx.settings);
          ctx.go('workout');
        }
      }, [icon(ICONS.spark, 17), 'סשן יציבה']),
      el('button', {
        class: `btn full${wantsCardio ? '' : ' primary'}`,
        style: { flex: '1' },
        onclick: async () => { await advanceRotation(1); ctx.reload(); }
      }, [icon(ICONS.chevron, 17), 'דלג ליום הבא'])
    ])
  ]);
}

function heroCardio(ctx, run) {
  const prog = CARDIO[run.program] || CARDIO.walk;
  const mins = Math.round(cardioElapsed(run) / 60);
  return el('div', { class: 'hero' }, [
    el('img', { class: 'hero-bg', src: frameUrl(cardioPic(run), 0), alt: '', loading: 'lazy' }),
    el('div', { class: 'hero-kicker', text: run.pausedAt ? 'אירובי · מושהה' : 'אירובי פעיל' }),
    el('h2', { text: prog.name }),
    el('p', { text: `${mins} דקות עד עכשיו${run.distanceM ? ` · ${(run.distanceM / 1000).toFixed(2)} ק״מ` : ''}` }),
    el('button', { class: 'btn primary full', onclick: () => ctx.go('cardio') }, [icon(ICONS.play, 18), 'חזרה לאימון'])
  ]);
}

/* ---------- off-plan starts ----------
   Every one of these passes offPlan, so finishing them never advances the
   weekly rotation past a day that has not actually been trained. */

const quickTile = (iconPath, title, sub, onclick) => el('button', { class: 'quick-tile', onclick }, [
  icon(iconPath, 22),
  el('b', { text: title }),
  el('small', { text: sub })
]);

async function startTemplate(ctx, templateId) {
  await createFromTemplate(templateId, ctx.settings, { offPlan: true });
  ctx.go('workout');
}

/** The three functional sessions, each a whole workout, off-plan. */
function functionalSheet(ctx) {
  const WHAT = {
    func_a: 'קטלבל, קופסה וכדור כוח · כוח מתפרץ ונשיאה',
    func_b: 'בלי שום ציוד · ברפי, קפיצות, זחילות',
    func_c: 'קטלבל וכבל · טורקיש גט-אפ, קלין, יציבות'
  };
  openSheet('אימון פונקציונלי', () => el('div', { class: 'stack' }, [
    el('p', { class: 'tiny dim', style: { margin: 0, lineHeight: '1.55' }, text: 'תרגילים שעובדים על כל הגוף יחד, עם מנוחות קצרות — כוח, סיבולת וקואורדינציה באימון אחד. מחוץ לתוכנית: הסבב השבועי לא זז.' }),
    ...FUNCTIONAL.map((id) => {
      const tpl = TEMPLATES[id];
      return el('button', { class: 'opt func-opt', onclick: () => startTemplate(ctx, id) }, [
        thumb(tpl.slots[0].ex, exerciseName(tpl.slots[0].ex)),
        el('div', { class: 'grow' }, [
          el('b', { text: tpl.name }),
          el('small', { text: WHAT[id] }),
          el('small', { text: tpl.slots.map((x) => exerciseName(x.ex)).join(' · ') })
        ]),
        icon(ICONS.play, 18)
      ]);
    })
  ]));
}

async function quickWorkout(ctx, venue) {
  await createQuickWorkout(ctx.settings, venue);
  ctx.go('workout');
}

/** One set, all out, against your own previous best for that movement. */
function challengeSheet(ctx) {
  openSheet('אתגר', (close) => {
    const box = el('div', { class: 'stack' });
    box.appendChild(el('p', {
      class: 'tiny dim', style: { margin: 0, lineHeight: '1.55' },
      text: 'סט יחיד עד כישלון. התוצאה נשמרת כמו כל סט אחר, כך שבפעם הבאה יש מספר לשבור. לא משפיע על התוכנית השבועית.'
    }));

    for (const ch of CHALLENGES) {
      const row = el('button', {
        class: 'opt',
        onclick: async () => {
          await createChallenge(ch.id, ctx.settings);
          close();
          ctx.go('workout');
        }
      }, [
        thumb(ch.ex, ''),
        el('div', { class: 'grow' }, [
          el('b', { text: ch.name }),
          el('small', { text: ch.desc })
        ]),
        el('span', { class: 'badge', text: '…' })
      ]);
      box.appendChild(row);

      /* The record is looked up per row rather than up front so the sheet
         opens immediately; an empty badge simply becomes a dash. */
      challengeBest(ch.ex).then((best) => {
        const badge = row.querySelector('.badge');
        if (!badge) return;
        if (!best) { badge.textContent = '—'; badge.classList.add('dim'); return; }
        badge.textContent = ch.metric === 'seconds' ? `${best.reps} שנ׳` : `${best.reps}`;
        badge.classList.add('accent');
      });
    }
    return box;
  });
}

/** One exercise picked freely, with more addable once it is running
    (screen-workout.js's "הוסף תרגיל לאימון"). */
function freeSheet(ctx) {
  openSheet('תרגיל חופשי', (close) => {
    const box = el('div', { class: 'stack' });
    const q = el('input', { type: 'search', placeholder: 'שם תרגיל… בטן, סקוואט, כל דבר' });
    const results = el('div');

    const paint = (list) => {
      results.innerHTML = '';
      list.slice(0, 12).forEach((o) => {
        results.appendChild(el('button', {
          class: 'opt',
          onclick: async () => {
            await createFreeWorkout(o.id, ctx.settings);
            close();
            ctx.go('workout');
          }
        }, [
          thumb(o.id, o.name),
          el('div', { class: 'grow' }, [
            el('b', { text: o.name }),
            el('small', { text: CATEGORIES[o.cat] })
          ])
        ]));
      });
    };

    q.addEventListener('input', () => {
      const term = q.value.trim();
      /* An empty search used to show an empty sheet, which reads as broken.
         Bodyweight movements need no equipment and are what someone reaching
         for a spontaneous exercise most often wants. */
      paint(term.length < 2 ? search('', { cat: 'Bodyweight' }) : search(term));
    });

    box.appendChild(q);
    box.appendChild(el('div', { class: 'section-title', text: 'ללא ציוד' }));
    box.appendChild(results);
    paint(search('', { cat: 'Bodyweight' }));
    return box;
  });
}

/* ---------- bits ---------- */

const stat = (value, label) => el('div', { class: 'stat' }, [
  el('b', { class: 'num', text: value }),
  el('span', { text: label })
]);

function weekStrip(done) {
  const doneDates = new Map(done.map((w) => [w.date, w]));
  const strip = el('div', { class: 'week' });
  const today = todayISO();
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = todayISO(d);
    const w = doneDates.get(iso);
    strip.appendChild(el('div', {
      class: `day${w ? ' done' : ''}${iso === today ? ' today' : ''}${!w && iso !== today ? ' rest' : ''}`
    }, [
      el('small', { text: HEB_DAYS[d.getDay()] }),
      el('b', { text: w ? (DAY_TYPES[w.type]?.short || '✓') : String(d.getDate()) })
    ]));
  }
  return strip;
}

function withinDays(iso, days) {
  const then = new Date(`${iso}T00:00:00`).getTime();
  return Date.now() - then <= days * 86400000;
}
