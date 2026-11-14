// Composants de la to-do : liste du jour, liste de la semaine, sélecteur d'ajout.
import { mondayOf, parseKey } from '../core/calendar.js';
import { todayKey } from '../core/dates.js';
import { DAY_LABELS } from '../features/planning.js';
import { OTHER_SUBJECT, TODO_SUBJECTS, addTodo, availableCatalog, ensureTodo, hasTodo, loadWeekTodo, removeTodo, toggleTodo } from '../features/todo.js';
import { addBtn, el } from './helpers.js';
import { iconHtml, subjClass } from './icons.js';

// Couleur de chaque matière = celle de son icône (maths = sigma, physique = atome…).

const subjLabel = (id) => [...TODO_SUBJECTS, OTHER_SUBJECT].find(s => s.id === id)?.label || '';
const fmtShort = (k) => parseKey(k).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const isoDay = (dateKey) => parseKey(dateKey).getDay() || 7;

// Identifiant de la case qui vient d'être cochée : la ligne rejoue une animation « pop » au rendu suivant.
let justChecked = null;

function itemRow(it, { editable, chip, showSubj }, change) {
  const pop = it.done && justChecked === it.id;
  if (pop) justChecked = null;
  return el('div', { class: `td-item${it.done ? ' done' : ''}${pop ? ' pop' : ''}` }, [
    el('button', { class: 'td-check', 'aria-label': 'Cocher', disabled: editable ? null : 'disabled', onclick: () => change(async () => { await toggleTodo(it); if (it.done) justChecked = it.id; }) }),
    el('div', { class: 'td-label' }, [
      showSubj ? el('span', { class: `td-subj ${subjClass(it.subj)}` }, subjLabel(it.subj)) : null,
      el('span', { class: 'td-name' }, it.label),
      (it.carried || it.rolled) ? el('span', { class: 'pl-chip td-carried' }, 'reporté') : null,
      chip ? el('span', { class: 'pl-chip td-carried' }, chip) : null
    ]),
    editable ? el('button', { class: 'td-del', 'aria-label': 'Retirer', onclick: () => change(() => removeTodo(it.id)), html: iconHtml('close') }) : null
  ]);
}

const countHead = (title, items) => {
  const d = items.filter(i => i.done).length;
  return el('div', { class: 'td-group-head' }, [el('span', { html: title }), el('span', { class: `td-count${items.length && d === items.length ? ' full' : ''}` }, `${d}/${items.length}`)]);
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
  box.appendChild(countHead(iconHtml('check') + ' À faire', mine));
  if (!hasTodo(monday)) box.appendChild(el('div', { class: 'pl-note' }, 'Pas de to-do pendant les révisions et les concours.'));
  else if (!mine.length) box.appendChild(el('div', { class: 'pl-note' }, 'Rien de prévu : journée libre.'));
  mine.sort((a, b) => (a.ord || 0) - (b.ord || 0)).forEach(it => box.appendChild(itemRow(it, { editable, showSubj: true }, change)));
  root.appendChild(box);
  if (editable && hasTodo(monday)) root.appendChild(addBtn('Ajouter à ce jour', () => openTodoPicker(monday, day, false, rerender), 'pl-add'));
}

// ── To-do de la semaine (page Hebdo) ─────────────────────────────────────────
function openTodoPicker(monday, day, withDayChoice, onClose) {
  let curDay = day;
  const overlay = el('div', { class: 'gpx-preview-overlay', onclick: (e) => { if (e.target === overlay) close(); } });
  const close = () => { overlay.remove(); onClose(); };
  const body = el('div', { class: 'pl-form' });
  const inFree = el('input', { class: 'input', type: 'text', placeholder: 'Élément libre (dernier recours)', maxlength: 80 });
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
    body.appendChild(addBtn('Ajouter', async () => {
      const v = inFree.value.trim(); if (!v) return;
      await addTodo(monday, 'autre', null, v, curDay); inFree.value = ''; fill();
    }));
  };
  overlay.appendChild(el('div', { class: 'gpx-preview-modal' }, [
    el('div', { class: 'gpx-preview-head' }, [
      el('div', { class: 'gpx-preview-title' }, 'Ajouter à la to-do'),
      el('button', { class: 'gpx-preview-close', 'aria-label': 'Fermer', onclick: close, html: iconHtml('close') })
    ]), body
  ]));
  document.body.appendChild(overlay);
  fill();
}
