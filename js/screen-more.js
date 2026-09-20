/* ==========================================================================
   screen-more.js — hub: coach, posture, calendar export, streak, settings.
   ========================================================================== */

import * as db from './db.js';
import { el, icon, ICONS, toast, openSheet } from './ui.js';
import { buildICS, downloadICS } from './calendar.js';
import { streak, recentWorkouts } from './session.js';
import { todayISO } from './logic.js';
import { ROTATIONS } from './programs.js';
import { EXERCISES } from './exercises.js';
import { BUILD } from './version.js';

export async function render(ctx) {
  ctx.setTitle('עוד');
  const wrap = el('div', { class: 'stack' });

  /* ---- streak card with forgiving freezes ---- */
  const stk = await streak();
  const freezes = await db.setting('streakFreezes', 3);
  const frozen = await db.setting('frozenDays', []);
  const best = await db.setting('bestStreak', 0);
  if (stk > best) await db.setSetting('bestStreak', stk);

  /* The streak is one number and one action; it does not need a panel. */
  const frozenToday = frozen.includes(todayISO());
  wrap.appendChild(el('div', { class: 'streak-row' }, [
    el('div', { class: 'grow' }, [
      el('b', { class: 'num', text: String(stk) }),
      el('span', { text: `ימים ברצף · שיא ${Math.max(best, stk)}` })
    ]),
    el('button', {
      class: 'btn sm',
      disabled: freezes <= 0 || frozenToday,
      text: frozenToday ? 'היום מוקפא' : `הקפא יום (${freezes})`,
      onclick: async () => {
        await db.setSetting('frozenDays', [...frozen, todayISO()]);
        await db.setSetting('streakFreezes', freezes - 1);
        toast('היום הוקפא — הרצף נשמר', 'ok');
        ctx.reload();
      }
    })
  ]));

  /* ---- links ---- */
  wrap.appendChild(el('div', { class: 'section-title', text: 'מודולים' }));
  wrap.appendChild(link(ICONS.library, 'ספריית תרגילים', `${EXERCISES.length} תרגילים עם תמונות, חיפוש וסינון`, () => ctx.go('library')));
  wrap.appendChild(link(ICONS.scale, 'מדידות גוף', 'משקל עם ממוצע נע, היקפים ותמונות התקדמות', () => ctx.go('body')));
  wrap.appendChild(link(ICONS.spark, 'מאמן אישי AI', 'שאל, שנה אימון, קבל סקירה שבועית', () => ctx.go('coach')));
  wrap.appendChild(link(ICONS.user, 'יציבה וניידות', 'הערכה עצמית ופרוטוקולים מתקנים', () => ctx.go('posture')));
  wrap.appendChild(link(ICONS.calendar, 'סנכרון ליומן', 'ייצוא התוכנית כקובץ ICS עם תזכורות', () => calendarSheet(ctx)));
  wrap.appendChild(link(ICONS.sync, 'הגדרות', 'מטרה, ציוד, חשבון Google וגיבוי', () => ctx.go('settings')));

  /* ---- install hint ---- */
  if (!window.matchMedia('(display-mode: standalone)').matches) {
    wrap.appendChild(el('div', { class: 'card stack' }, [
      el('h3', { style: { margin: 0, fontSize: '15px' }, text: 'התקנה למסך הבית' }),
      el('p', { class: 'tiny dim', style: { margin: 0 }, text: 'אנדרואיד: תפריט הדפדפן ואז "התקן אפליקציה". אייפון: שיתוף ואז "הוסף למסך הבית". אחרי ההתקנה האפליקציה נפתחת במסך מלא ועובדת גם בלי רשת.' })
    ]));
  }

  wrap.appendChild(el('p', {
    class: 'tiny dim', style: { textAlign: 'center', padding: '16px 0' },
    text: `IRONLOG · גרסה ${BUILD}`
  }));

  return wrap;
}

const link = (iconPath, title, sub, onclick) => el('button', { class: 'list-link', onclick }, [
  el('div', { class: 'ex-ord' }, [icon(iconPath, 20)]),
  el('div', { class: 'grow' }, [el('b', { text: title }), el('small', { text: sub })]),
  icon(ICONS.chevron, 18)
]);

function calendarSheet(ctx) {
  openSheet('סנכרון ליומן', (close) => {
    const box = el('div', { class: 'stack' });
    const time = el('input', { type: 'time', value: '18:00' });
    const weeks = el('input', { type: 'number', value: '8', min: '1', max: '26' });
    const dur = el('input', { type: 'number', value: '75', min: '20', max: '180' });
    let carb = true;

    box.appendChild(el('p', { class: 'tiny dim', style: { margin: 0 }, text: `הקובץ ייצור אירועים לפי הפיצול "${(ROTATIONS[ctx.settings.rotation] || ROTATIONS.ppl6).name}" ויתווסף ליומן של המכשיר (Google / Apple).` }));
    box.appendChild(el('div', {}, [el('label', { class: 'field-label', text: 'שעת אימון' }), time]));
    box.appendChild(el('div', {}, [el('label', { class: 'field-label', text: 'משך (דקות)' }), dur]));
    box.appendChild(el('div', {}, [el('label', { class: 'field-label', text: 'כמה שבועות קדימה' }), weeks]));

    const carbBtn = el('button', { class: 'chip on', text: 'תזכורת פחמימה שעה לפני' });
    carbBtn.addEventListener('click', () => {
      carb = !carb;
      carbBtn.classList.toggle('on', carb);
    });
    box.appendChild(carbBtn);

    box.appendChild(el('button', {
      class: 'btn primary full',
      text: 'צור קובץ יומן',
      onclick: async () => {
        const cursor = await db.setting('rotationCursor', 0);
        const ics = buildICS({
          rotation: ctx.settings.rotation,
          cursor,
          weeks: Number(weeks.value) || 8,
          time: time.value || '18:00',
          duration: Number(dur.value) || 75,
          carbAlarm: carb
        });
        downloadICS(ics);
        close();
        toast('הקובץ נוצר — פתח אותו כדי להוסיף ליומן', 'ok');
      }
    }));
    return box;
  });
}
