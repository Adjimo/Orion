// Vue « À faire » de la page Planning : to-do de la semaine affichée, groupée par matière.
import { addDays, mondayOf } from '../core/calendar.js';
import { todayKey } from '../core/dates.js';
import { TODO_SUBJECTS, addTodo, availableCatalog, ensureTodo, hasTodo, loadWeekTodo, removeTodo, toggleTodo } from '../features/todo.js';
import { formatDuration } from '../features/planning.js';
import { el } from '../ui/helpers.js';

const fmtShort = (k) => new Date(k + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

export async function renderTodoView(root, week, rerender) {
  const today = todayKey();
  await ensureTodo(today);
  const items = await loadWeekTodo(week.monday);
  const current = week.monday === mondayOf(today);
  const past = week.monday < mondayOf(today);
  const live = items.filter(i => !i.carriedTo);
  const doneN = live.filter(i => i.done).length;

  root.appendChild(el('div', { class: 'pl-summary' }, [
    el('span', {}, 'Travail personnel disponible'), el('strong', {}, formatDuration(week.freeMinutes))
  ]));

  if (!items.length) {
    root.appendChild(el('div', { class: 'pl-note' }, !hasTodo(week.monday) ? 'Pas de to-do pendant les révisions et les concours.' : past ? 'Aucune to-do pour cette semaine.' : 'La to-do de cette semaine sera générée à son ouverture.'));
    return;
  }

  root.appendChild(el('div', { class: 'td-total' }, [
    el('div', { class: 'td-total-row' }, [
      el('span', {}, past ? 'Bilan de la semaine' : 'Cette semaine'),
      el('strong', {}, `${doneN}/${live.length}`)
    ]),
    el('div', { class: 'td-bar' }, el('div', { class: 'td-bar-fill', style: `width:${live.length ? doneN / live.length * 100 : 0}%` })),
    live.some(i => i.carried && !i.done) ? el('div', { class: 'pl-hint' }, `${live.filter(i => i.carried && !i.done).length} reporté(s) de la semaine précédente`) : null
  ]));

  const change = async (fn) => { await fn(); rerender(); };
  for (const s of TODO_SUBJECTS) {
    const rows = items.filter(i => i.subj === s.id)
      .sort((a, b) => (b.carried - a.carried) || (a.ord || 0) - (b.ord || 0));
    if (!rows.length) continue;
    const act = rows.filter(i => !i.carriedTo);
    const group = el('div', { class: 'td-group' }, [
      el('div', { class: 'td-group-head' }, [
        el('span', {}, s.label),
        el('span', { class: `td-count${act.length && act.every(i => i.done) ? ' full' : ''}` }, `${act.filter(i => i.done).length}/${act.length}`)
      ])
    ]);
    for (const it of rows) {
      const moved = !!it.carriedTo;
      group.appendChild(el('div', { class: `td-item${it.done ? ' done' : ''}${moved ? ' moved' : ''}` }, [
        el('button', {
          class: 'td-check', 'aria-label': 'Cocher', disabled: (!current || moved) ? 'disabled' : null,
          onclick: () => change(() => toggleTodo(it))
        }, it.done ? '✓' : ''),
        el('div', { class: 'td-label' }, [
          el('span', {}, it.label),
          it.carried && !moved ? el('span', { class: 'pl-chip td-carried' }, 'reporté') : null,
          moved ? el('span', { class: 'pl-chip' }, `reporté au ${fmtShort(it.carriedTo)}`) : null
        ]),
        (current && !moved) ? el('button', { class: 'td-del', 'aria-label': 'Retirer', onclick: () => change(() => removeTodo(it.id)) }, '✕') : null
      ]));
    }
    root.appendChild(group);
  }
  if (current) root.appendChild(el('button', { class: 'btn full sm pl-add', onclick: () => openPicker(week, items, rerender) }, '+ Ajouter à la to-do'));
}

function openPicker(week, items, rerender) {
  const overlay = el('div', { class: 'gpx-preview-overlay', onclick: (e) => { if (e.target === overlay) close(); } });
  const close = () => { overlay.remove(); rerender(); };
  const body = el('div', { class: 'pl-form' });
  const inFree = el('input', { type: 'text', placeholder: 'Élément libre (dernier recours)' });
  const fill = async () => {
    body.innerHTML = '';
    const groups = availableCatalog(await loadWeekTodo(week.monday));
    if (!groups.length) body.appendChild(el('div', { class: 'pl-note' }, 'Tout le catalogue est déjà dans la to-do.'));
    for (const g of groups) {
      body.appendChild(el('div', { class: 'td-pick-head' }, TODO_SUBJECTS.find(s => s.id === g.subj).label));
      body.appendChild(el('div', { class: 'td-pick' }, g.entries.map(e => el('button', {
        class: 'pl-seg', onclick: async () => { await addTodo(week.monday, g.subj, e.key, e.label); fill(); }
      }, e.label))));
    }
    body.appendChild(el('div', { class: 'td-pick-head' }, 'Autre'));
    body.appendChild(inFree);
    body.appendChild(el('button', { class: 'btn full', onclick: async () => {
      const v = inFree.value.trim(); if (!v) return;
      await addTodo(week.monday, 'autre', null, v); inFree.value = ''; fill();
    } }, 'Ajouter'));
  };
  overlay.appendChild(el('div', { class: 'gpx-preview-modal' }, [
    el('div', { class: 'gpx-preview-head' }, [
      el('div', { class: 'gpx-preview-title' }, 'Ajouter à la to-do'),
      el('button', { class: 'gpx-preview-close', 'aria-label': 'Fermer', onclick: close }, '✕')
    ]), body
  ]));
  document.body.appendChild(overlay);
  fill();
}
