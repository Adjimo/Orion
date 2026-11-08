// Composants de la to-do : liste du jour, liste de la semaine, sélecteur d'ajout.
import { mondayOf, parseKey } from '../core/calendar.js';
import { todayKey } from '../core/dates.js';
import { DAY_LABELS } from '../features/planning.js';
import { TODO_SUBJECTS, addTodo, availableCatalog, ensureTodo, hasTodo, loadWeekTodo, removeTodo, toggleTodo } from '../features/todo.js';
import { el } from './helpers.js';

const subjLabel = (id) => TODO_SUBJECTS.find(s => s.id === id)?.label || '';
const fmtShort = (k) => parseKey(k).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const isoDay = (dateKey) => parseKey(dateKey).getDay() || 7;

function itemRow(it, { editable, chip, showSubj }, change) {
  return el('div', { class: `td-item${it.done ? ' done' : ''}` }, [
    el('button', { class: 'td-check', 'aria-label': 'Cocher', disabled: editable ? null : 'disabled', onclick: () => change(() => toggleTodo(it)) }, it.done ? '✓' : ''),
    el('div', { class: 'td-label' }, [
      showSubj ? el('span', { class: 'td-subj' }, subjLabel(it.subj)) : null,
      el('span', { class: 'td-name' }, it.label),
      it.carried ? el('span', { class: 'pl-chip td-carried' }, 'reporté') : null,
      chip ? el('span', { class: 'pl-chip td-carried' }, chip) : null
    ]),
    editable ? el('button', { class: 'td-del', 'aria-label': 'Retirer', onclick: () => change(() => removeTodo(it.id)) }, '✕') : null
  ]);
}

const countHead = (title, items) => {
  const d = items.filter(i => i.done).length;
  return el('div', { class: 'td-group-head' }, [el('span', {}, title), el('span', { class: `td-count${items.length && d === items.length ? ' full' : ''}` }, `${d}/${items.length}`)]);
};

// ── To-do du jour (page Aujourd'hui) ─────────────────────────────────────────
export async function renderDayTodo(root, dateKey) {
  await ensureTodo();
  root.innerHTML = '';
  const today = todayKey();
  const monday = mondayOf(dateKey);
  const editable = monday === mondayOf(today);
  const day = isoDay(dateKey);
  const rerender = () => renderDayTodo(root, dateKey);
  const change = async (fn) => { await fn(); rerender(); };
  const items = (await loadWeekTodo(monday)).filter(i => !i.carriedTo);

  const box = el('div', { class: 'td-group' });
  const mine = items.filter(i => i.day === day);
  box.appendChild(countHead('✅ À faire', mine));
  if (!hasTodo(monday)) box.appendChild(el('div', { class: 'pl-note' }, 'Pas de to-do pendant les révisions et les concours.'));
  else if (!mine.length) box.appendChild(el('div', { class: 'pl-note' }, 'Rien de prévu : journée libre.'));
  mine.sort((a, b) => (a.ord || 0) - (b.ord || 0)).forEach(it => box.appendChild(itemRow(it, { editable, showSubj: true }, change)));
  root.appendChild(box);
  if (editable && hasTodo(monday)) root.appendChild(el('button', { class: 'btn full sm pl-add', onclick: () => openTodoPicker(monday, day, false, rerender) }, '+ Ajouter à ce jour'));
}

// ── To-do de la semaine (page Hebdo) ─────────────────────────────────────────
export async function renderWeekTodo(root, monday) {
  await ensureTodo();
  root.innerHTML = '';
  const editable = monday === mondayOf(todayKey());
  const rerender = () => renderWeekTodo(root, monday);
  const change = async (fn) => { await fn(); rerender(); };
  const all = await loadWeekTodo(monday);
  const items = all.filter(i => !i.carriedTo);
  if (!hasTodo(monday)) { root.appendChild(el('div', { class: 'pl-note' }, 'Pas de to-do pendant les révisions et les concours.')); return; }
  if (!items.length) { root.appendChild(el('div', { class: 'pl-note' }, 'La to-do de cette semaine sera générée à son ouverture.')); return; }

  const done = items.filter(i => i.done).length;
  const carried = items.filter(i => i.carried && !i.done).length;
  const subjChips = TODO_SUBJECTS.map(s => {
    const l = items.filter(i => i.subj === s.id);
    return l.length ? el('span', { class: `pl-chip td-sum${l.every(i => i.done) ? ' full' : ''}` }, `${s.label.split(' ')[0]} ${l.filter(i => i.done).length}/${l.length}`) : null;
  });
  root.appendChild(el('div', { class: 'td-total' }, [
    el('div', { class: 'td-total-row' }, [el('span', {}, 'Cette semaine'), el('strong', {}, `${done}/${items.length}`)]),
    el('div', { class: 'td-bar' }, el('div', { class: 'td-bar-fill', style: `width:${done / items.length * 100}%` })),
    el('div', { class: 'td-chips' }, subjChips),
    carried ? el('div', { class: 'pl-hint' }, `${carried} reporté(s) de la semaine précédente`) : null
  ]));

  for (let d = 1; d <= 7; d++) {
    const rows = items.filter(i => i.day === d).sort((a, b) => (a.ord || 0) - (b.ord || 0));
    if (!rows.length) continue;
    const g = el('div', { class: 'td-group' }, [countHead(`${DAY_LABELS[d - 1]}`, rows)]);
    rows.forEach(it => g.appendChild(itemRow(it, { editable, showSubj: true }, change)));
    root.appendChild(g);
  }
  if (editable) root.appendChild(el('button', { class: 'btn full sm pl-add', onclick: () => openTodoPicker(monday, isoDay(todayKey()), true, rerender) }, '+ Ajouter à la to-do'));
}

// ── Sélecteur d'ajout (catalogue d'abord, élément libre en dernier recours) ──
function openTodoPicker(monday, day, withDayChoice, onClose) {
  let curDay = day;
  const overlay = el('div', { class: 'gpx-preview-overlay', onclick: (e) => { if (e.target === overlay) close(); } });
  const close = () => { overlay.remove(); onClose(); };
  const body = el('div', { class: 'pl-form' });
  const inFree = el('input', { type: 'text', placeholder: 'Élément libre (dernier recours)' });
  const fill = async () => {
    body.innerHTML = '';
    if (withDayChoice) {
      body.appendChild(el('div', { class: 'td-pick-head' }, 'Jour'));
      body.appendChild(el('div', { class: 'td-pick' }, DAY_LABELS.map((l, i) => el('button', {
        class: `pl-seg${curDay === i + 1 ? ' active' : ''}`, onclick: () => { curDay = i + 1; fill(); }
      }, l.slice(0, 3)))));
    }
    const groups = availableCatalog(await loadWeekTodo(monday), curDay);
    if (!groups.length) body.appendChild(el('div', { class: 'pl-note' }, 'Tout le catalogue est déjà dans la to-do.'));
    for (const g of groups) {
      body.appendChild(el('div', { class: 'td-pick-head' }, subjLabel(g.subj)));
      body.appendChild(el('div', { class: 'td-pick' }, g.entries.map(e => el('button', {
        class: 'pl-seg', onclick: async () => { await addTodo(monday, g.subj, e.key, e.label, curDay); fill(); }
      }, e.label))));
    }
    body.appendChild(el('div', { class: 'td-pick-head' }, 'Autre'));
    body.appendChild(inFree);
    body.appendChild(el('button', { class: 'btn full', onclick: async () => {
      const v = inFree.value.trim(); if (!v) return;
      await addTodo(monday, 'autre', null, v, curDay); inFree.value = ''; fill();
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
