/* ==========================================================================
   screen-posture.js — assessment, protocols, and running a corrective block
   either as a standalone session or appended to the active workout.
   ========================================================================== */

import * as db from './db.js';
import { el, icon, ICONS, toast, openSheet, emptyState } from './ui.js';
import { PROTOCOLS, QUESTIONS, scoreAssessment, protocolToSlots, estimatedMinutes } from './posture.js';
import { getExercise, ytUrl } from './exercises.js';
import { thumb, exerciseDetail } from './media.js';
import { getActive, saveWorkout } from './session.js';
import { todayISO } from './logic.js';

export async function render(ctx) {
  ctx.setTitle('יציבה וניידות');
  const wrap = el('div', { class: 'stack' });

  const result = await db.setting('postureAssessment', null);
  const active = await getActive();

  /* ---- assessment card ---- */
  wrap.appendChild(el('div', { class: 'card stack' }, [
    el('div', { class: 'card-head' }, [
      el('h3', { text: 'הערכה עצמית' }),
      result ? el('span', { class: 'badge accent', text: new Date(result.at).toLocaleDateString('he-IL') }) : null
    ]),
    result
      ? el('div', { class: 'stack', style: { gap: '8px' } }, [
        bar('הטיית אגן קדמית', result.apt),
        bar('ראש קדמי / כתפיים', result.fhp),
        el('p', { class: 'tiny dim', style: { margin: 0 }, text: `הפרוטוקול המומלץ: ${PROTOCOLS[result.primary].name}${result.secondary ? ` + ${PROTOCOLS[result.secondary].name}` : ''}` })
      ])
      : el('p', { class: 'tiny dim', style: { margin: 0 }, text: '7 שאלות קצרות שמכוונות את דגשי המתיחות אליך.' }),
    el('button', {
      class: 'btn full',
      text: result ? 'בצע הערכה מחדש' : 'התחל הערכה',
      onclick: () => assessmentSheet(ctx)
    })
  ]));

  /* ---- protocols ---- */
  wrap.appendChild(el('div', { class: 'section-title', text: 'פרוטוקולים' }));
  Object.values(PROTOCOLS).forEach((p) => {
    const recommended = result && (result.primary === p.id || result.secondary === p.id);
    wrap.appendChild(el('button', {
      class: 'list-link',
      style: recommended ? { borderColor: 'var(--accent)' } : {},
      onclick: () => protocolSheet(ctx, p, !!active)
    }, [
      el('div', { class: 'ex-ord', text: p.id === 'apt' ? '🦴' : p.id === 'fhp' ? '🧍' : '🤸' }),
      el('div', { class: 'grow' }, [
        el('b', { text: p.name }),
        el('small', { text: `${p.short} · ${estimatedMinutes(p.id, false)} דקות${recommended ? ' · מומלץ לך' : ''}` })
      ]),
      icon(ICONS.chevron, 18)
    ]));
  });

  wrap.appendChild(el('p', {
    class: 'tiny dim',
    style: { padding: '10px 4px', lineHeight: '1.6' },
    text: 'אפשר להריץ בלוק של 5–10 דקות כחימום לפני אימון, כסיום אחרי אימון, או כסשן עצמאי ביום מנוחה. תרגילי היציבה נרשמים כמו כל תרגיל אחר ונכנסים להיסטוריה.'
  }));

  return wrap;
}

/* ---------- pieces ---------- */

function bar(label, pct) {
  const color = pct >= 60 ? 'var(--bad)' : pct >= 40 ? 'var(--warn)' : 'var(--ok)';
  return el('div', {}, [
    el('div', { class: 'row between', style: { marginBottom: '4px' } }, [
      el('span', { class: 'tiny muted', text: label }),
      el('b', { class: 'tiny num', style: { color }, text: `${pct}%` })
    ]),
    el('div', { style: { height: '7px', borderRadius: '7px', background: 'var(--surface-3)', overflow: 'hidden' } }, [
      el('i', { style: { display: 'block', height: '100%', width: `${pct}%`, background: color } })
    ])
  ]);
}

function assessmentSheet(ctx) {
  openSheet('הערכת יציבה', (close) => {
    const box = el('div', { class: 'stack' });
    const answers = new Array(QUESTIONS.length).fill(0);

    QUESTIONS.forEach((q, i) => {
      const row = el('div', { class: 'card stack', style: { gap: '9px' } });
      row.appendChild(el('div', { class: 'tiny', text: `${i + 1}. ${q.q}` }));
      const opts = el('div', { class: 'row', style: { gap: '6px' } });
      [['לא', 0], ['לפעמים', 1], ['כן', 2]].forEach(([label, val]) => {
        opts.appendChild(el('button', {
          class: `chip grow${val === 0 ? ' on' : ''}`,
          style: { justifyContent: 'center' },
          onclick: (e) => {
            answers[i] = val;
            opts.querySelectorAll('.chip').forEach((c) => c.classList.remove('on'));
            e.currentTarget.classList.add('on');
          },
          text: label
        }));
      });
      row.appendChild(opts);
      box.appendChild(row);
    });

    box.appendChild(el('button', {
      class: 'btn primary full',
      text: 'קבל תוצאה',
      onclick: async () => {
        const res = { ...scoreAssessment(answers), at: Date.now(), date: todayISO() };
        await db.setSetting('postureAssessment', res);
        close();
        toast(`הפרוטוקול המומלץ: ${PROTOCOLS[res.primary].name}`, 'ok');
        ctx.reload();
      }
    }));
    return box;
  });
}

function protocolSheet(ctx, p, hasActive) {
  openSheet(p.name, (close) => {
    const box = el('div', { class: 'stack' });
    box.appendChild(el('p', { class: 'tiny dim', style: { margin: 0 }, text: p.why }));

    p.blocks.forEach((b, i) => {
      const ex = getExercise(b.ex);
      if (!ex) return;
      box.appendChild(el('button', {
        class: 'ex-row',
        style: { width: '100%', textAlign: 'start' },
        onclick: () => openSheet(ex.name, () => exerciseDetail(ex.id))
      }, [
        thumb(ex.id, ex.name),
        el('div', { class: 'grow' }, [
          el('div', { class: 'ex-name', text: ex.name }),
          el('div', { class: 'ex-meta', text: `${b.sets} × ${b.seconds ? `${b.seconds} שניות` : `${b.reps} חזרות`}${b.note ? ` · ${b.note}` : ''}` })
        ])
      ]));
    });

    box.appendChild(el('button', {
      class: 'btn primary full',
      style: { marginTop: '6px' },
      text: 'סשן עצמאי מלא',
      onclick: async () => { await startStandalone(ctx, p, false); close(); }
    }));
    box.appendChild(el('button', {
      class: 'btn full',
      text: `גרסה קצרה (${estimatedMinutes(p.id, true)} דקות)`,
      onclick: async () => { await startStandalone(ctx, p, true); close(); }
    }));

    if (hasActive) {
      box.appendChild(el('button', {
        class: 'btn full',
        text: 'הוסף לסוף האימון הפעיל',
        onclick: async () => {
          const w = await getActive();
          w.slots.push(...protocolToSlots(p.id, { short: true }));
          await saveWorkout(w);
          close();
          toast('נוסף לאימון הפעיל', 'ok');
          ctx.go('workout');
        }
      }));
    }

    return box;
  });
}

async function startStandalone(ctx, p, short) {
  const active = await getActive();
  if (active) { toast('יש אימון פעיל — סיים אותו קודם', 'bad'); return; }

  const workout = {
    id: db.uid('w'),
    date: todayISO(),
    type: 'Posture',
    template_id: `posture_${p.id}`,
    name: `יציבה · ${p.name}`,
    started_at: Date.now(),
    finished_at: null,
    duration_seconds: 0,
    completed: 0,
    cursor: 0,
    slots: protocolToSlots(p.id, { short })
  };
  await db.put('workouts', workout);
  await db.setSetting('activeWorkoutId', workout.id);
  ctx.go('workout');
}
