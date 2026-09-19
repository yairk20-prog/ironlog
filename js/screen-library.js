/* ==========================================================================
   screen-library.js — browse every exercise.
   Search, filter by muscle and equipment, and start a one-off session from
   anything in the catalogue without touching the programmed split.
   ========================================================================== */

import * as db from './db.js';
import { el, icon, ICONS, toast, openSheet, emptyState } from './ui.js';
import { EXERCISES, CATEGORIES, MUSCLES, getExercise, isAllowed } from './exercises.js';
import { thumb, exerciseDetail, hasImages, frameUrl } from './media.js';
import { getActive, saveWorkout } from './session.js';
import { restFor, goalList } from './programs.js';
import { todayISO } from './logic.js';

let state = { q: '', muscle: null, cat: null, mineOnly: false };

export async function render(ctx) {
  ctx.setTitle('ספריית תרגילים', `${EXERCISES.length} תרגילים`);

  const wrap = el('div', { class: 'stack' });
  const grid = el('div', { class: 'lib-grid' });
  const count = el('div', { class: 'tiny dim' });

  /* search */
  const search = el('input', {
    type: 'search', placeholder: 'חפש תרגיל…', value: state.q,
    oninput: (e) => { state.q = e.target.value; paint(); }
  });
  wrap.appendChild(el('div', { class: 'row', style: { gap: '8px' } }, [
    el('div', { class: 'grow' }, [search])
  ]));

  /* Filter chips used to be built once with their starting state and never
     updated, so tapping one filtered the list but left every chip looking
     unselected. Each chip now carries the test for its own state and is
     re-checked on every paint. */
  const chips = [];
  const filterChip = (label, isOn, onclick) => {
    const node = el('button', { class: 'chip', text: label, onclick });
    chips.push({ node, isOn });
    return node;
  };
  const syncChips = () => chips.forEach(({ node, isOn }) => node.classList.toggle('on', !!isOn()));

  /* equipment filter */
  const catRow = el('div', { class: 'filter-row' });
  catRow.appendChild(filterChip('כל הציוד', () => state.cat === null, () => { state.cat = null; paint(); }));
  Object.entries(CATEGORIES).forEach(([id, name]) => {
    catRow.appendChild(filterChip(name, () => state.cat === id, () => { state.cat = state.cat === id ? null : id; paint(); }));
  });
  wrap.appendChild(catRow);

  /* muscle filter */
  const muscleRow = el('div', { class: 'filter-row' });
  muscleRow.appendChild(filterChip('כל השרירים', () => state.muscle === null, () => { state.muscle = null; paint(); }));
  const usedMuscles = [...new Set(EXERCISES.map((e) => e.muscle))];
  usedMuscles.forEach((m) => {
    muscleRow.appendChild(filterChip(MUSCLES[m] || m, () => state.muscle === m, () => { state.muscle = state.muscle === m ? null : m; paint(); }));
  });
  wrap.appendChild(muscleRow);

  /* only what I can actually do */
  wrap.appendChild(el('div', { class: 'row between' }, [
    filterChip('רק מה שמתאים לציוד שלי', () => state.mineOnly, () => { state.mineOnly = !state.mineOnly; paint(); }),
    count
  ]));

  wrap.appendChild(grid);

  function paint() {
    syncChips();
    const q = state.q.trim();
    const filter = { equipment: ctx.settings.equipment, limits: ctx.settings.limits || [] };

    const list = EXERCISES.filter((e) => {
      if (state.cat && e.cat !== state.cat) return false;
      if (state.muscle && e.muscle !== state.muscle) return false;
      if (state.mineOnly && !isAllowed(e.id, filter)) return false;
      if (q && !e.name.includes(q) && !e.id.includes(q.toLowerCase())) return false;
      return true;
    });

    count.textContent = `${list.length} תוצאות`;
    grid.innerHTML = '';

    if (!list.length) {
      grid.appendChild(emptyState('לא נמצאו תרגילים', 'נסה לנקות את הסינון', ICONS.search));
      return;
    }

    list.forEach((e) => {
      grid.appendChild(el('button', {
        class: 'lib-card',
        onclick: () => detailSheet(ctx, e.id)
      }, [
        hasImages(e.id)
          ? el('img', { src: frameUrl(e.id, 0), alt: e.name, loading: 'lazy', decoding: 'async' })
          : el('div', { style: { aspectRatio: '4/3', display: 'grid', placeItems: 'center', background: 'var(--surface-2)' } }, [icon(ICONS.dumbbell, 26)]),
        el('div', { class: 'lib-card-body' }, [
          el('b', { text: e.name }),
          el('small', { text: `${MUSCLES[e.muscle] || e.muscle} · ${CATEGORIES[e.cat]}` })
        ])
      ]));
    });
  }

  paint();
  return wrap;
}

function detailSheet(ctx, id) {
  const ex = getExercise(id);
  openSheet(ex.name, (close) => {
    const box = exerciseDetail(id);

    box.insertBefore(el('button', {
      class: 'btn primary full',
      onclick: async () => {
        const active = await getActive();
        if (active) {
          active.slots.push(makeSlot(ctx, id));
          active.cursor = active.slots.length - 1;
          await saveWorkout(active);
          close();
          toast('נוסף לאימון הפעיל', 'ok');
          ctx.go('workout');
          return;
        }
        await startSingle(ctx, id);
        close();
      }
    }, [icon(ICONS.plus, 18), 'הוסף לאימון']), box.firstChild);

    return box;
  });
}

function makeSlot(ctx, id) {
  const ex = getExercise(id);
  return {
    ex: id,
    sets: 3,
    seconds: null,
    targetWeight: 0,
    targetReps: 0,
    action: 'start',
    note: 'נוסף מהספרייה',
    rest: restFor(goalList(ctx.settings), ex),
    done: false
  };
}

/** Freestyle session built around one exercise. */
async function startSingle(ctx, id) {
  const ex = getExercise(id);
  const workout = {
    id: db.uid('w'),
    date: todayISO(),
    type: 'Custom',
    template_id: `single_${id}`,
    name: ex.name,
    started_at: Date.now(),
    finished_at: null,
    duration_seconds: 0,
    completed: 0,
    cursor: 0,
    slots: [makeSlot(ctx, id)]
  };
  await db.put('workouts', workout);
  await db.setSetting('activeWorkoutId', workout.id);
  ctx.go('workout');
}
