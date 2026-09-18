/* ==========================================================================
   onboarding.js — first-run questionnaire.
   Eight short steps that produce a real plan: the answers set the goal,
   the split, the rep ranges, which equipment the app is allowed to program,
   and which movements to route around. Nothing here is cosmetic.
   ========================================================================== */

import { el, icon, ICONS, buzz } from './ui.js';
import { frameUrl, hasImages } from './media.js';
import { GOALS, ROTATIONS } from './programs.js';
import { proteinTarget } from './logic.js';

/* Every option carries a real photo where one exists in the bundle, and a
   line-drawn icon otherwise — no emoji anywhere in the flow. */
export const EQUIPMENT = [
  { id: 'FreeWeights', pic: 'bb_bench', name: 'משקולות חופשיות', desc: 'מוט, משקולות יד, ספסל' },
  { id: 'Machine', pic: 'machine_chest_press', name: 'מכונות', desc: 'לחיצות, פולי מכני, האק' },
  { id: 'Cable', pic: 'lat_pulldown', name: 'כבלים / פולי', desc: 'פולי עליון ותחתון, קרוסאובר' },
  { id: 'Bodyweight', pic: 'pushup', name: 'משקל גוף', desc: 'מתח, מקבילים, שכיבות' },
  { id: 'Bands', pic: 'band_fly', name: 'רצועות התנגדות', desc: 'גומיות אימון' }
];

export const LIMITS = [
  { id: 'shoulder', pic: 'db_lateral', name: 'כתף רגישה', desc: 'נדלג על לחיצות מעל הראש כבדות' },
  { id: 'knee', pic: 'leg_press', name: 'ברך רגישה', desc: 'נעדיף לחיצת רגליים על סקוואט עמוק' },
  { id: 'back', pic: 'bb_row', name: 'גב תחתון רגיש', desc: 'נדלג על דדליפט וחתירה בכפיפה' },
  { id: 'wrist', pic: 'db_curl', name: 'שורש כף יד', desc: 'נעדיף אחיזה ניטרלית ומכונות' }
];

const EXPERIENCE = [
  { id: 'beginner', ico: 'spark', name: 'מתחיל', desc: 'פחות משנה של אימוני משקולות — נתחיל בנפח מתון' },
  { id: 'intermediate', ico: 'flame', name: 'בינוני', desc: '1–3 שנים — נפח מלא והעלאות שבועיות' },
  { id: 'advanced', ico: 'trend', name: 'מתקדם', desc: '3+ שנים — נפח גבוה ומעקב RIR מדויק' }
];

const DAYS = [
  { id: 'ppl3', num: '3', name: '3 ימים בשבוע', desc: 'אימון יום־כן־יום, מתאים ללו״ז עמוס' },
  { id: 'ppl5', num: '5', name: '5 ימים + יציבה', desc: 'סבב PPL עם יום יציבה ושתי מנוחות' },
  { id: 'ppl6', num: '6', name: '6 ימים בשבוע', desc: 'כל קבוצת שרירים פעמיים — הכי מהיר' }
];

const SEX = [
  { id: 'male', name: 'גבר' },
  { id: 'female', name: 'אישה' },
  { id: 'other', name: 'מעדיף לא לציין' }
];

/**
 * Show the wizard. Resolves with the answers once the user finishes.
 * @returns {Promise<object>}
 */
export function runOnboarding() {
  return new Promise((resolve) => {
    const a = {
      name: '',
      sex: 'male',
      age: 30,
      height: 175,
      bodyweight: 75,
      experience: 'intermediate',
      goal: 'hypertrophy',
      rotation: 'ppl6',
      equipment: ['FreeWeights', 'Machine', 'Cable', 'Bodyweight'],
      limits: [],
      posture: false
    };

    const steps = [stepWelcome, stepBody, stepExperience, stepGoal, stepDays, stepEquipment, stepLimits, stepDone];
    let at = 0;

    const root = el('div', { class: 'onb' });
    const progress = el('div', { class: 'onb-progress' });
    const body = el('div', { class: 'onb-body' });
    const foot = el('div', { class: 'onb-foot' });
    root.append(progress, body, foot);
    document.body.appendChild(root);

    const back = el('button', {
      class: 'btn', onclick: () => { if (at > 0) { at--; paint(); } }
    }, [icon(ICONS.chevronBack, 18), 'חזרה']);

    const next = el('button', { class: 'btn primary', onclick: () => advance() });

    function advance() {
      if (at === steps.length - 1) {
        buzz([0, 30, 60, 30]);
        root.remove();
        resolve(a);
        return;
      }
      at++;
      paint();
      buzz(10);
    }

    function paint() {
      progress.innerHTML = '';
      steps.forEach((_, i) => progress.appendChild(el('i', { class: i <= at ? 'on' : '' })));

      body.innerHTML = '';
      body.appendChild(steps[at](a, paint));
      body.scrollTop = 0;

      foot.innerHTML = '';
      if (at > 0) foot.appendChild(back);
      next.innerHTML = '';
      const last = at === steps.length - 1;
      next.append(document.createTextNode(last ? 'בוא נתחיל' : 'המשך'));
      if (!last) next.appendChild(icon(ICONS.chevron, 18));
      foot.appendChild(next);
    }

    paint();
  });
}

/* ---------- steps ---------- */

function head(kicker, title, sub) {
  return [
    el('div', { class: 'onb-kicker', text: kicker }),
    el('h2', { text: title }),
    sub ? el('p', { text: sub }) : null
  ];
}

function stepWelcome(a, repaint) {
  const box = el('div', {}, [
    el('div', { class: 'onb-hero' }, [el('img', { src: frameUrl('bb_bench', 0), alt: '' })]),
    ...head('ברוך הבא', 'IRONLOG', 'שבע שאלות קצרות, ואני בונה לך תוכנית אימון שמתאימה לציוד, לניסיון ולמטרה שלך. אפשר לשנות הכל אחר כך.'),
    el('div', { class: 'num-field', style: { marginTop: '6px' } }, [
      el('label', { text: 'איך לקרוא לך? (אופציונלי)' }),
      el('input', {
        type: 'text', placeholder: 'השם שלך', value: a.name,
        oninput: (e) => { a.name = e.target.value.trim(); }
      })
    ])
  ]);
  return box;
}

function stepBody(a, repaint) {
  return el('div', {}, [
    ...head('שלב 1', 'קצת עליך', 'הנתונים האלה מחשבים את יעד החלבון והקלוריות. הכל נשאר על המכשיר.'),
    el('div', { class: 'stack' }, [
      el('div', {}, [
        el('label', { class: 'field-label', text: 'מין' }),
        el('div', { class: 'row', style: { gap: '7px' } },
          SEX.map((s) => el('button', {
            class: `chip grow${a.sex === s.id ? ' on' : ''}`,
            style: { justifyContent: 'center' },
            onclick: () => { a.sex = s.id; repaint(); },
            text: s.name
          })))
      ]),
      el('div', { class: 'num-grid' }, [
        numField('גיל', a.age, (v) => { a.age = v; }),
        numField('גובה (ס״מ)', a.height, (v) => { a.height = v; }),
        numField('משקל (ק״ג)', a.bodyweight, (v) => { a.bodyweight = v; }, '0.1'),
        el('div', { class: 'num-field' }, [
          el('label', { text: 'יעד חלבון יומי' }),
          el('div', {
            class: 'num',
            style: {
              height: 'var(--btn-h)', display: 'grid', placeItems: 'center',
              borderRadius: 'var(--r-s)', background: 'var(--accent-dim)',
              color: 'var(--accent)', fontWeight: '800', fontSize: 'clamp(15px,4vw,18px)'
            },
            text: `${proteinTarget(a.bodyweight, true, a.goal)} גרם`
          })
        ])
      ])
    ])
  ]);
}

const numField = (label, value, onInput, step = '1') => el('div', { class: 'num-field' }, [
  el('label', { text: label }),
  el('input', {
    type: 'number', inputmode: 'decimal', step, value: String(value),
    oninput: (e) => { const v = Number(e.target.value); if (v > 0) onInput(v); }
  })
]);

function stepExperience(a, repaint) {
  return el('div', {}, [
    ...head('שלב 2', 'מה הוותק שלך?', 'קובע כמה סטים נתחיל איתם וכמה מהר נעלה במשקלים.'),
    ...EXPERIENCE.map((o) => pick(o, a.experience === o.id, () => { a.experience = o.id; repaint(); }))
  ]);
}

function stepGoal(a, repaint) {
  return el('div', {}, [
    ...head('שלב 3', 'מה המטרה?', 'קובע את טווח החזרות, זמני המנוחה וקצב העלאת המשקל.'),
    ...Object.values(GOALS).map((g) => pick(
      { pic: g.id === 'hypertrophy' ? 'db_curl' : g.id === 'strength' ? 'bb_squat' : g.id === 'cut' ? 'plank' : 'hip_thrust', name: g.name, desc: g.desc },
      a.goal === g.id,
      () => { a.goal = g.id; repaint(); }
    ))
  ]);
}

function stepDays(a, repaint) {
  return el('div', {}, [
    ...head('שלב 4', 'כמה ימים בשבוע?', 'תבחר משהו שתצליח לעמוד בו לאורך זמן — עקביות מנצחת נפח.'),
    ...DAYS.map((o) => pick(o, a.rotation === o.id, () => { a.rotation = o.id; repaint(); }))
  ]);
}

function stepEquipment(a, repaint) {
  const toggle = (id) => {
    const i = a.equipment.indexOf(id);
    if (i >= 0) { if (a.equipment.length > 1) a.equipment.splice(i, 1); }
    else a.equipment.push(id);
    repaint();
  };
  return el('div', {}, [
    ...head('שלב 5', 'איזה ציוד יש לך?', 'אפשר לבחור כמה. תרגילים שדורשים ציוד שאין לך יוחלפו אוטומטית בחלופה עם אותו דפוס תנועה.'),
    ...EQUIPMENT.map((o) => pick(o, a.equipment.includes(o.id), () => toggle(o.id)))
  ]);
}

function stepLimits(a, repaint) {
  const toggle = (id) => {
    const i = a.limits.indexOf(id);
    if (i >= 0) a.limits.splice(i, 1); else a.limits.push(id);
    repaint();
  };
  return el('div', {}, [
    ...head('שלב 6', 'יש משהו שכואב?', 'לא חובה. מה שתסמן — נעקוף בתכנון, ותמיד אפשר להחזיר ידנית.'),
    ...LIMITS.map((o) => pick(o, a.limits.includes(o.id), () => toggle(o.id))),
    el('div', { class: 'divider', style: { margin: '14px 0 10px' } }),
    pick(
      { ico: 'user', name: 'מעניין אותי לשפר יציבה', desc: 'נוסיף יום יציבה ותרגילים מתקנים לאגן ולגב העליון' },
      a.posture,
      () => { a.posture = !a.posture; repaint(); }
    )
  ]);
}

function stepDone(a) {
  const rot = ROTATIONS[a.rotation];
  const goal = GOALS[a.goal];
  const equipNames = a.equipment.map((id) => EQUIPMENT.find((e) => e.id === id)?.name).filter(Boolean);
  const limitNames = a.limits.map((id) => LIMITS.find((l) => l.id === id)?.name).filter(Boolean);

  return el('div', {}, [
    el('div', { class: 'onb-hero' }, [el('img', { src: frameUrl('bb_squat', 1), alt: '' })]),
    ...head('מוכן', a.name ? `יאללה ${a.name}` : 'התוכנית שלך מוכנה', 'אפשר לשנות כל דבר מהגדרות בכל רגע.'),
    el('div', { class: 'card stack', style: { gap: '9px' } }, [
      summaryRow('מטרה', goal.name),
      summaryRow('פיצול', rot.name),
      summaryRow('טווח חזרות', `${goal.reps.compound[0]}–${goal.reps.compound[1]} במורכבים · ${goal.reps.isolation[0]}–${goal.reps.isolation[1]} בבידוד`),
      summaryRow('ציוד', equipNames.join(' · ')),
      summaryRow('יעד חלבון', `${proteinTarget(a.bodyweight, true, a.goal)} גרם ביום אימון`),
      limitNames.length ? summaryRow('נעקוף', limitNames.join(' · ')) : null,
      a.posture ? summaryRow('תוספת', 'מודול יציבה וניידות') : null
    ])
  ]);
}

const summaryRow = (k, v) => el('div', { class: 'row between', style: { gap: '12px', alignItems: 'flex-start' } }, [
  el('span', { class: 'tiny dim', style: { flex: 'none' }, text: k }),
  el('b', { class: 'tiny', style: { textAlign: 'end' }, text: v })
]);

/** Photo when the bundle has one, icon or number otherwise. Never an emoji. */
function pickIcon(o) {
  if (o.pic && hasImages(o.pic)) {
    return el('div', { class: 'pick-ico' }, [el('img', { src: frameUrl(o.pic, 0), alt: '', loading: 'lazy' })]);
  }
  if (o.num) return el('div', { class: 'pick-ico num', text: o.num });
  return el('div', { class: 'pick-ico' }, [icon(ICONS[o.ico] || ICONS.dumbbell, 24)]);
}

function pick(o, on, onclick) {
  return el('button', { class: `pick${on ? ' on' : ''}`, onclick }, [
    pickIcon(o),
    el('div', { class: 'grow' }, [
      el('b', { text: o.name }),
      o.desc ? el('small', { text: o.desc }) : null
    ]),
    el('span', { class: 'pick-check' }, [icon(ICONS.check, 20)])
  ]);
}

/** Persist the answers as app settings. */
export async function applyAnswers(ctx, a) {
  const entries = {
    userName: a.name,
    sex: a.sex,
    age: a.age,
    height: a.height,
    bodyweight: a.bodyweight,
    experience: a.experience,
    goal: a.goal,
    rotation: a.rotation,
    equipment: a.equipment,
    limits: a.limits,
    postureFocus: a.posture,
    onboarded: true
  };
  for (const [k, v] of Object.entries(entries)) await ctx.saveSetting(k, v);
}
