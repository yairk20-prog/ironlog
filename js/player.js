/* ==========================================================================
   player.js — the exercise demo player.
   A real window inside the app: a looping motion demo built from the two
   bundled frames (works offline, no YouTube), and a video tab that embeds a
   clip in place once the user saves a link for that exercise. Nothing here
   opens an external page unless the user asks for it explicitly.
   ========================================================================== */

import { el, icon, ICONS, toast } from './ui.js';
import { hasImages, frameUrl } from './media.js';
import { TWO_FRAMES } from './ex-images.js';
import { getExercise, ytUrl } from './exercises.js';
import { getVideo, setVideo } from './session.js';

const SPEEDS = [
  { label: '0.5×', ms: 1800 },
  { label: '1×', ms: 1000 },
  { label: '2×', ms: 520 }
];

let closeCurrent = null;

/** youtu.be/ID, watch?v=ID, /embed/ID, /shorts/ID → ID */
export function youtubeId(url = '') {
  const m = String(url).trim().match(
    /(?:youtu\.be\/|v=|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/
  );
  return m ? m[1] : '';
}

/* ---------- the looping demo ---------- */

function buildLoop(id) {
  const frames = TWO_FRAMES.has(id) ? [0, 1] : [0];
  const stage = el('div', { class: 'pl-stage' });
  const imgs = frames.map((n, i) => el('img', {
    class: i === 0 ? 'on' : '',
    src: frameUrl(id, n),
    alt: i === 0 ? 'תנוחת פתיחה' : 'תנוחת סיום',
    decoding: 'async'
  }));
  imgs.forEach((img) => stage.appendChild(img));

  const phase = el('div', { class: 'pl-phase' }, [
    el('span', { class: 'on', text: 'פתיחה' }),
    frames.length > 1 ? el('span', { text: 'סיום' }) : null
  ]);
  const bar = el('div', { class: 'pl-bar' }, [el('i')]);
  stage.appendChild(bar);

  const still = frames.length < 2;
  let at = 0;
  let timer = null;
  let ms = SPEEDS[1].ms;

  const paint = () => {
    imgs.forEach((img, i) => img.classList.toggle('on', i === at));
    phase.querySelectorAll('span').forEach((s, i) => s.classList.toggle('on', i === at));
    bar.style.setProperty('--at', at);
    bar.firstChild.style.transitionDuration = `${ms}ms`;
  };

  const tick = () => { at = (at + 1) % imgs.length; paint(); };

  const play = () => {
    if (still || timer) return;
    timer = setInterval(tick, ms);
    stage.classList.remove('paused');
    btn.replaceChildren(icon(ICONS.pause, 26, 'solid'));
    btn.setAttribute('aria-label', 'השהה');
  };
  const pause = () => {
    clearInterval(timer);
    timer = null;
    stage.classList.add('paused');
    btn.replaceChildren(icon(ICONS.play, 26, 'solid'));
    btn.setAttribute('aria-label', 'נגן');
  };
  const toggle = () => (timer ? pause() : play());

  const btn = el('button', { class: 'pl-play', onclick: toggle, 'aria-label': 'נגן' }, [icon(ICONS.play, 26, 'solid')]);
  stage.addEventListener('click', toggle);

  const speedRow = el('div', { class: 'pl-speeds' }, SPEEDS.map((s, i) => el('button', {
    class: `chip${i === 1 ? ' on' : ''}`,
    text: s.label,
    onclick: (e) => {
      ms = s.ms;
      speedRow.querySelectorAll('.chip').forEach((c) => c.classList.remove('on'));
      e.currentTarget.classList.add('on');
      if (timer) { clearInterval(timer); timer = setInterval(tick, ms); }
      paint();
    }
  })));

  const step = el('button', {
    class: 'btn ghost', text: 'פריים הבא',
    onclick: (e) => { e.stopPropagation(); pause(); tick(); }
  });

  const controls = el('div', { class: 'pl-controls' }, [
    phase,
    el('div', { class: 'row', style: { gap: '8px' } }, [btn, ...(still ? [] : [speedRow])]),
    still ? null : step
  ]);

  paint();
  if (!still) play(); else pause();

  const onVis = () => { if (document.hidden) pause(); };
  document.addEventListener('visibilitychange', onVis);

  return {
    node: el('div', { class: 'pl-loop' }, [
      stage,
      controls,
      still ? el('div', { class: 'tiny dim', text: 'לתרגיל הזה יש תמונה אחת בלבד.' }) : null
    ]),
    stop: () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVis); }
  };
}

/* ---------- the video tab ---------- */

function buildVideo(id, ex) {
  const box = el('div', { class: 'pl-video stack' });

  const show = (vid) => {
    box.replaceChildren(
      el('div', { class: 'video-frame' }, [
        el('iframe', {
          src: `https://www.youtube-nocookie.com/embed/${vid}?rel=0&playsinline=1&modestbranding=1`,
          title: `וידאו — ${ex.name}`,
          allow: 'accelerometer; encrypted-media; gyroscope; picture-in-picture',
          allowfullscreen: true,
          loading: 'lazy',
          referrerpolicy: 'strict-origin-when-cross-origin'
        })
      ]),
      el('button', {
        class: 'btn ghost full', text: 'החלף סרטון',
        onclick: () => { setVideo(id, ''); ask(); }
      })
    );
  };

  const ask = () => {
    const field = el('input', {
      class: 'input', type: 'url', inputmode: 'url', dir: 'ltr',
      placeholder: 'https://youtu.be/…', 'aria-label': 'קישור לסרטון'
    });
    const save = async () => {
      const vid = youtubeId(field.value);
      if (!vid) return toast('הקישור לא נראה כמו סרטון יוטיוב', 'bad');
      await setVideo(id, vid);
      show(vid);
      toast('הסרטון נשמר לתרגיל');
    };
    field.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });

    box.replaceChildren(
      el('div', { class: 'pl-empty' }, [
        icon(ICONS.play, 30, 'solid'),
        el('b', { text: 'הדבק קישור לסרטון' }),
        el('div', { class: 'tiny dim', text: 'הסרטון יתנגן כאן בתוך האפליקציה, ויישמר לתרגיל הזה לתמיד.' })
      ]),
      field,
      el('button', { class: 'btn primary full', text: 'הצג בתוך האפליקציה', onclick: save }),
      el('a', {
        class: 'btn ghost full', href: ytUrl(ex), target: '_blank', rel: 'noopener',
        text: 'חפש סרטון ביוטיוב ↗'
      }),
      el('div', { class: 'tiny dim', text: 'הכפתור האחרון יוצא מהאפליקציה — העתק משם קישור והדבק כאן.' })
    );
  };

  getVideo(id).then((saved) => (saved ? show(saved) : ask()));
  return { node: box, stop: () => box.replaceChildren() };
}

/* ---------- the window ---------- */

/** Open the demo player for an exercise. Returns a close function. */
export function openPlayer(id) {
  const ex = getExercise(id);
  if (!ex) return () => {};
  closeCurrent?.();

  let active = null;
  const pane = el('div', { class: 'pl-pane' });

  const mount = (builder) => {
    active?.stop();
    active = builder();
    pane.replaceChildren(active.node);
  };

  const tabs = el('div', { class: 'pl-tabs' });
  const tab = (label, builder) => {
    const b = el('button', {
      class: 'pl-tab', text: label,
      onclick: () => {
        tabs.querySelectorAll('.pl-tab').forEach((t) => t.classList.remove('on'));
        b.classList.add('on');
        mount(builder);
      }
    });
    tabs.appendChild(b);
    return b;
  };

  const demoTab = hasImages(id) ? tab('הדגמה', () => buildLoop(id)) : null;
  const videoTab = tab('וידאו', () => buildVideo(id, ex));

  const close = () => {
    active?.stop();
    active = null;
    document.removeEventListener('keydown', onKey);
    wrap.remove();
    document.body.classList.remove('player-open');
    closeCurrent = null;
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };

  const wrap = el('div', { class: 'player', role: 'dialog', 'aria-modal': 'true', 'aria-label': ex.name }, [
    el('div', { class: 'pl-top' }, [
      el('div', { class: 'stack', style: { gap: '2px' } }, [
        el('span', { class: 'eyebrow', text: 'הדגמת תרגיל' }),
        el('h2', { class: 'pl-title', text: ex.name })
      ]),
      el('button', { class: 'pl-close', onclick: close, 'aria-label': 'סגור' }, [icon(ICONS.close, 22)])
    ]),
    tabs,
    pane,
    ex.cue ? el('div', { class: 'prev-hint' }, [icon(ICONS.info, 15), el('span', { text: ex.cue })]) : null
  ]);

  document.body.appendChild(wrap);
  document.body.classList.add('player-open');
  document.addEventListener('keydown', onKey);
  (demoTab || videoTab).click();

  closeCurrent = close;
  return close;
}
