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

export async function render(ctx) {
  ctx.setTitle('עוד');
  const wrap = el('div', { class: 'stack' });

  /* ---- streak card with forgiving freezes ---- */
  const stk = await streak();
  const freezes = await db.setting('streakFreezes', 3);
  const frozen = await db.setting('frozenDays', []);
  const best = await db.setting('bestStreak', 0);
  if (stk > best) await db.setSetting('bestStreak', stk);

  wrap.appendChild(el('div', { class: 'card stack' }, [
    el('div', { class: 'card-head' }, [
      el('h3', { text: '🔥 רצף' }),
      el('span', { class: 'badge accent', text: `שיא: ${Math.max(best, stk)} ימים` })
    ]),
    el('div', { class: 'row between' }, [
      el('div', {}, [
        el('b', { class: 'num', style: { fontSize: '30px' }, text: String(stk) }),
        el('div', { class: 'tiny dim', text: 'ימים ברצף' })
      ]),
      el('div', { style: { textAlign: 'end' } }, [
        el('b', { class: 'num', style: { fontSize: '22px', color: '#4DA3FF' }, text: String(freezes) }),
        el('div', { class: 'tiny dim', text: 'הקפאות זמינות' })
      ])
    ]),
    el('p', { class: 'tiny dim', style: { margin: 0 }, text: 'יום מחלה או מנוחה מתוכננת לא אמור לשבור רצף. הקפאה מסמנת את היום כ"תקין" בלי אימון.' }),
    el('button', {
      class: 'btn full',
      disabled: freezes <= 0 || frozen.includes(todayISO()),
      text: frozen.includes(todayISO()) ? 'היום כבר מוקפא' : freezes > 0 ? 'הקפא את היום' : 'נגמרו ההקפאות החודש',
      onclick: async () => {
        const list = [...frozen, todayISO()];
        await db.setSetting('frozenDays', list);
        await db.setSetting('streakFreezes', freezes - 1);
        toast('היום הוקפא — הרצף נשמר', 'ok');
        ctx.reload();
      }
    })
  ]));

  /* ---- links ---- */
  wrap.appendChild(el('div', { class: 'section-title', text: 'מודולים' }));
  wrap.appendChild(link('📚', 'ספריית תרגילים', `${EXERCISES.length} תרגילים עם תמונות, חיפוש וסינון`, () => ctx.go('library')));
  wrap.appendChild(link('⚖️', 'מדידות גוף', 'משקל עם ממוצע נע, היקפים ותמונות התקדמות', () => ctx.go('body')));
  wrap.appendChild(link('🏆', 'סיכום האימון האחרון', 'נפח, שיאים ומפת שרירים', () => ctx.go('summary')));
  wrap.appendChild(link('🤖', 'מאמן אישי AI', 'שאל, שנה אימון, קבל סקירה שבועית', () => ctx.go('coach')));
  wrap.appendChild(link('🧍', 'יציבה וניידות', 'הערכה עצמית ופרוטוקולים מתקנים', () => ctx.go('posture')));
  wrap.appendChild(link('📅', 'סנכרון ליומן', 'ייצוא התוכנית כקובץ ICS עם תזכורות', () => calendarSheet(ctx)));
  wrap.appendChild(link('⚙️', 'הגדרות', 'מטרה, ציוד, חשבון Google וגיבוי', () => ctx.go('settings')));

  /* ---- install hint ---- */
  if (!window.matchMedia('(display-mode: standalone)').matches) {
    wrap.appendChild(el('div', { class: 'card stack' }, [
      el('h3', { style: { margin: 0, fontSize: '15px' }, text: 'התקנה למסך הבית' }),
      el('p', { class: 'tiny dim', style: { margin: 0 }, text: 'אנדרואיד: תפריט ⋮ → "התקן אפליקציה". אייפון: שיתוף → "הוסף למסך הבית". אחרי ההתקנה האפליקציה נפתחת במסך מלא ועובדת גם בלי רשת.' })
    ]));
  }

  wrap.appendChild(el('p', {
    class: 'tiny dim', style: { textAlign: 'center', padding: '16px 0' },
    text: 'IRONLOG · גרסה 1.0'
  }));

  return wrap;
}

const link = (emoji, title, sub, onclick) => el('button', { class: 'list-link', onclick }, [
  el('div', { class: 'ex-ord', text: emoji }),
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

    const carbBtn = el('button', { class: 'chip on', text: '✓ תזכורת פחמימה שעה לפני' });
    carbBtn.addEventListener('click', () => {
      carb = !carb;
      carbBtn.classList.toggle('on', carb);
      carbBtn.textContent = `${carb ? '✓' : ''} תזכורת פחמימה שעה לפני`;
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
