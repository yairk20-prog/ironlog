/* ==========================================================================
   calendar.js — ICS export.
   Produces a standards-compliant .ics the phone's calendar imports, including
   a pre-workout carb reminder alarm. No account linking, no network.
   ========================================================================== */

import { ROTATIONS, TEMPLATES, DAY_TYPES } from './programs.js';

const pad = (n) => String(n).padStart(2, '0');

const stamp = (d) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;

const esc = (s) => String(s).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');

/** RFC 5545 requires folding at 75 octets. */
function fold(line) {
  const out = [];
  let rest = line;
  while (rest.length > 73) {
    out.push(rest.slice(0, 73));
    rest = ` ${rest.slice(73)}`;
  }
  out.push(rest);
  return out.join('\r\n');
}

/**
 * @param {object} opts
 * @param {string} opts.rotation   rotation id
 * @param {number} opts.cursor     index of the next day in the rotation
 * @param {number} opts.weeks      how many weeks to generate
 * @param {string} opts.time       "HH:MM" local start time
 * @param {number} opts.duration   minutes
 * @param {boolean} opts.carbAlarm add a 60-minute-before reminder
 */
export function buildICS({ rotation = 'ppl6', cursor = 0, weeks = 8, time = '18:00', duration = 75, carbAlarm = true } = {}) {
  const rot = ROTATIONS[rotation] || ROTATIONS.ppl6;
  const [hh, mm] = time.split(':').map(Number);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//IRONLOG//Training Plan//HE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:IRONLOG · תוכנית אימונים'
  ];

  const total = weeks * 7;
  const now = new Date();

  for (let i = 0; i < total; i++) {
    const key = rot.days[(cursor + i) % rot.days.length];
    if (key === 'rest') continue;
    const tpl = TEMPLATES[key];
    if (!tpl) continue;

    const start = new Date(now);
    start.setDate(start.getDate() + i);
    start.setHours(hh, mm, 0, 0);
    const end = new Date(start.getTime() + duration * 60000);

    const desc = tpl.slots
      .map((s, n) => `${n + 1}. ${s.ex}`)
      .join('\n');

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:ironlog-${start.getTime()}-${key}@ironlog.local`);
    lines.push(`DTSTAMP:${stamp(new Date())}`);
    lines.push(`DTSTART:${stamp(start)}`);
    lines.push(`DTEND:${stamp(end)}`);
    lines.push(fold(`SUMMARY:${esc(`${DAY_TYPES[tpl.type]?.name || 'אימון'} · ${tpl.name}`)}`));
    lines.push(fold(`DESCRIPTION:${esc(`${tpl.slots.length} תרגילים\n${desc}`)}`));
    lines.push('CATEGORIES:FITNESS');

    lines.push('BEGIN:VALARM');
    lines.push('TRIGGER:-PT15M');
    lines.push('ACTION:DISPLAY');
    lines.push(fold(`DESCRIPTION:${esc(`${tpl.name} מתחיל בקרוב`)}`));
    lines.push('END:VALARM');

    if (carbAlarm) {
      lines.push('BEGIN:VALARM');
      lines.push('TRIGGER:-PT60M');
      lines.push('ACTION:DISPLAY');
      lines.push(fold(`DESCRIPTION:${esc('אכול פחמימה קלה לפני האימון')}`));
      lines.push('END:VALARM');
    }

    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadICS(content, filename = 'ironlog-plan.ics') {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
