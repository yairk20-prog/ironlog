/* ==========================================================================
   screen-body.js — bodyweight, circumferences and progress photos.
   Daily weight is noisy, so the headline number is the 7-day moving average;
   the raw entries stay visible underneath.
   ========================================================================== */

import * as db from './db.js';
import { el, icon, ICONS, toast, openSheet, confirmSheet, emptyState } from './ui.js';
import { lineChart } from './chart.js';
import { movingAverage, todayISO, round2, hebDate } from './logic.js';

const SITES = [
  { id: 'waist', name: 'מותן' },
  { id: 'chest', name: 'חזה' },
  { id: 'arm', name: 'זרוע' },
  { id: 'thigh', name: 'ירך' },
  { id: 'hips', name: 'ירכיים' },
  { id: 'neck', name: 'צוואר' }
];

export async function render(ctx) {
  ctx.setTitle('מדידות גוף');
  ctx.setActions([
    el('button', { class: 'btn sm primary', onclick: () => logSheet(ctx) }, [icon(ICONS.plus, 15), 'רישום'])
  ]);

  const entries = await load();
  const wrap = el('div', { class: 'stack' });

  if (!entries.length) {
    wrap.appendChild(emptyState(
      'עוד לא רשמת מדידות',
      'רישום משקל פעם-פעמיים בשבוע מספיק כדי לראות מגמה אמיתית',
      ICONS.scale
    ));
    wrap.appendChild(el('button', {
      class: 'btn primary full', onclick: () => logSheet(ctx)
    }, [icon(ICONS.plus, 18), 'רישום ראשון']));
    return wrap;
  }

  /* ---- weight trend ---- */
  const weights = entries.filter((e) => e.weight > 0);
  if (weights.length) {
    const avg = movingAverage(weights.map((e) => e.weight), 7);
    const current = avg[avg.length - 1];
    const weekAgo = avg[Math.max(0, avg.length - 8)];
    const diff = round2(current - weekAgo);

    const card = el('div', { class: 'card stack' }, [
      el('div', { class: 'card-head' }, [
        el('h3', { text: 'משקל גוף' }),
        el('span', { class: 'badge accent', text: 'ממוצע נע 7 ימים' })
      ]),
      el('div', { class: 'row between' }, [
        el('div', {}, [
          el('b', { class: 'num', style: { fontSize: 'clamp(26px,7vw,34px)', fontWeight: '800' }, text: `${round2(current)}` }),
          el('span', { class: 'tiny dim', text: ' ק״ג' })
        ]),
        el('div', { style: { textAlign: 'end' } }, [
          el('b', {
            class: `delta ${diff < 0 ? 'down' : diff > 0 ? 'up' : ''}`,
            style: { fontSize: '15px' },
            text: `${diff > 0 ? '+' : ''}${diff} ק״ג`
          }),
          el('div', { class: 'tiny dim', text: 'מול שבוע שעבר' })
        ])
      ])
    ]);

    if (weights.length >= 2) {
      const points = weights.slice(-20).map((e, i, arr) => ({
        y: round2(movingAverage(weights.map((x) => x.weight), 7)[weights.length - arr.length + i]),
        label: hebDate(e.date)
      }));
      const chart = lineChart(points, { unit: 'ק״ג' });
      if (chart) card.appendChild(chart);
      card.appendChild(el('div', { class: 'tiny dim', text: `${weights.length} מדידות · אחרונה ${hebDate(weights[weights.length - 1].date)}` }));
    } else {
      card.appendChild(el('div', { class: 'tiny dim', text: 'עוד מדידה אחת והגרף יופיע.' }));
    }
    wrap.appendChild(card);
  }

  /* ---- circumferences ---- */
  const latest = [...entries].reverse().find((e) => e.sites && Object.keys(e.sites).length);
  if (latest) {
    const before = entries.find((e) => e.sites && Object.keys(e.sites).length);
    wrap.appendChild(el('div', { class: 'section-title', text: 'היקפים (ס״מ)' }));
    wrap.appendChild(el('div', { class: 'meas-grid' },
      SITES.filter((s) => latest.sites[s.id] > 0).map((s) => {
        const now = latest.sites[s.id];
        const then = before?.sites?.[s.id];
        const d = then ? round2(now - then) : null;
        return el('div', { class: 'meas-cell' }, [
          el('small', { text: `${s.name}` }),
          el('b', { class: 'num', text: String(round2(now)) }),
          d !== null && d !== 0
            ? el('span', { class: `delta ${d > 0 ? 'up' : 'down'}`, text: `${d > 0 ? '+' : ''}${d}` })
            : null
        ]);
      })
    ));
  }

  /* ---- photos ---- */
  const photos = entries.filter((e) => e.photo).slice(-8).reverse();
  wrap.appendChild(el('div', { class: 'section-title', text: 'תמונות התקדמות' }));
  if (!photos.length) {
    wrap.appendChild(el('div', { class: 'card' }, [
      el('p', { class: 'tiny dim', style: { margin: 0 }, text: 'תמונה כל 4 שבועות, באותה תאורה ובאותה שעה ביום, מראה יותר מכל מספר. התמונות נשמרות רק במכשיר הזה.' })
    ]));
  } else {
    wrap.appendChild(el('div', { class: 'lib-grid' },
      photos.map((e) => el('button', {
        class: 'lib-card',
        onclick: () => openSheet(hebDate(e.date), () => el('div', { class: 'stack' }, [
          el('img', { src: e.photo, style: { width: '100%', borderRadius: 'var(--r-m)' }, alt: '' }),
          el('div', { class: 'tiny dim', text: e.weight ? `${round2(e.weight)} ק״ג` : '' })
        ]))
      }, [
        el('img', { src: e.photo, alt: '', loading: 'lazy' }),
        el('div', { class: 'lib-card-body' }, [
          el('b', { text: hebDate(e.date) }),
          el('small', { text: e.weight ? `${round2(e.weight)} ק״ג` : '' })
        ])
      ]))
    ));
  }

  /* ---- history ---- */
  wrap.appendChild(el('div', { class: 'section-title', text: 'כל המדידות' }));
  [...entries].reverse().slice(0, 20).forEach((e) => {
    wrap.appendChild(el('div', { class: 'ex-row' }, [
      el('div', { class: 'ex-ord' }, [icon(ICONS.scale, 18)]),
      el('div', { class: 'grow' }, [
        el('div', { class: 'ex-name', text: e.weight ? `${round2(e.weight)} ק״ג` : 'מדידת היקפים' }),
        el('div', { class: 'ex-meta', text: hebDate(e.date) })
      ]),
      el('button', {
        class: 'chip', 'aria-label': 'מחק',
        onclick: async () => {
          if (!await confirmSheet('למחוק את המדידה?', hebDate(e.date), 'מחק')) return;
          await db.del('body_logs', e.id);
          ctx.reload();
        }
      }, [icon(ICONS.trash, 14)])
    ]));
  });

  return wrap;
}

/* ---------- storage ---------- */

async function load() {
  const rows = await db.all('body_logs').catch(() => []);
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

/* ---------- entry sheet ---------- */

function logSheet(ctx) {
  openSheet('רישום מדידה', (close) => {
    const box = el('div', { class: 'stack' });
    const date = el('input', { type: 'date', value: todayISO() });
    const weight = el('input', {
      type: 'number', inputmode: 'decimal', step: '0.1',
      placeholder: String(ctx.settings.bodyweight || 75)
    });
    const siteInputs = {};
    let photo = null;

    box.appendChild(el('div', {}, [el('label', { class: 'field-label', text: 'תאריך' }), date]));
    box.appendChild(el('div', {}, [el('label', { class: 'field-label', text: 'משקל גוף (ק״ג)' }), weight]));

    box.appendChild(el('div', { class: 'section-title', text: 'היקפים (אופציונלי)' }));
    const grid = el('div', { class: 'num-grid' });
    SITES.forEach((s) => {
      const input = el('input', { type: 'number', inputmode: 'decimal', step: '0.5', placeholder: '—' });
      siteInputs[s.id] = input;
      grid.appendChild(el('div', { class: 'num-field' }, [
        el('label', { text: `${s.name}` }),
        input
      ]));
    });
    box.appendChild(grid);

    box.appendChild(el('div', { class: 'section-title', text: 'תמונת התקדמות (אופציונלי)' }));
    const preview = el('div');
    const file = el('input', { type: 'file', accept: 'image/*' });
    file.addEventListener('change', async () => {
      const f = file.files?.[0];
      if (!f) return;
      try {
        photo = await shrink(f, 720);
        preview.innerHTML = '';
        preview.appendChild(el('img', { src: photo, style: { width: '100%', borderRadius: 'var(--r-m)' }, alt: '' }));
      } catch (err) {
        toast(err.message, 'bad');
      }
    });
    box.appendChild(file);
    box.appendChild(preview);

    box.appendChild(el('button', {
      class: 'btn primary full',
      style: { marginTop: '8px' },
      onclick: async () => {
        const w = Number(weight.value) || 0;
        const sites = {};
        for (const [id, input] of Object.entries(siteInputs)) {
          const v = Number(input.value);
          if (v > 0) sites[id] = v;
        }
        if (!w && !Object.keys(sites).length && !photo) {
          toast('הזן משקל, היקף או תמונה', 'bad');
          return;
        }
        await db.put('body_logs', {
          id: db.uid('b'),
          date: date.value || todayISO(),
          weight: w,
          sites,
          photo,
          timestamp: Date.now()
        });
        if (w) await ctx.saveSetting('bodyweight', w);
        close();
        toast('נרשם', 'ok');
        ctx.reload();
      }
    }, [icon(ICONS.check, 18), 'שמור מדידה']));

    return box;
  });
}

/** Progress photos are stored locally, so keep them small. */
function shrink(file, max) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => { img.src = reader.result; };
    reader.onerror = () => reject(new Error('קריאת הקובץ נכשלה'));
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => reject(new Error('התמונה לא נטענה'));
    reader.readAsDataURL(file);
  });
}
