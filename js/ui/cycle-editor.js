// Éditeur du cycle de la to-do : matières, éléments pondérés, budget par semaine ou date de fin.
import { addDays, mondayOf } from '../core/calendar.js';
import { todayKey } from '../core/dates.js';
import { cycleBudget, loadCycle, saveCycle } from '../features/todo.js';
import { newSubjectId, resetCycle } from '../features/todo-cycle.js';
import { el } from './helpers.js';
import { iconHtml } from './icons.js';

const stepper = (value, onChange, { min = 1, max = 99 } = {}) => el('div', { class: 'cy-step' }, [
  el('button', { type: 'button', 'aria-label': 'Moins', disabled: value <= min ? 'disabled' : null, onclick: () => onChange(Math.max(min, value - 1)) }, '−'),
  el('span', { class: 'cy-val' }, String(value)),
  el('button', { type: 'button', 'aria-label': 'Plus', disabled: value >= max ? 'disabled' : null, onclick: () => onChange(Math.min(max, value + 1)) }, '+')
]);

export async function openCycleEditor(onClose) {
  const cfg = JSON.parse(JSON.stringify(await loadCycle()));
  let sel = 0;
  const overlay = el('div', { class: 'gpx-preview-overlay', onclick: (e) => { if (e.target === overlay) close(); } });
  const close = () => { overlay.remove(); onClose?.(); };
  const body = el('div', { class: 'pl-form cy-body' });
  const persist = () => saveCycle(cfg);

  const draw = () => {
    const keep = body.scrollTop;
    body.replaceChildren();
    if (sel >= cfg.subjects.length) sel = Math.max(0, cfg.subjects.length - 1);
    const sub = cfg.subjects[sel];

    // Matières
    body.appendChild(el('div', { class: 'td-pick' }, [
      ...cfg.subjects.map((s, i) => el('button', { class: 'pl-seg' + (i === sel ? ' active' : ''), onclick: () => { sel = i; draw(); } }, s.label)),
      el('button', { class: 'pl-seg cy-new', onclick: async () => {
        cfg.subjects.push({ id: newSubjectId(), label: 'Nouvelle matière', budgetMode: 'points', budget: 6, endDate: null, items: [] });
        sel = cfg.subjects.length - 1; await persist(); draw();
      } }, '+ Matière')
    ]));
    if (!sub) { body.appendChild(el('div', { class: 'pl-note' }, 'Aucune matière à cycle. Ajoute-en une avec « + Matière ».')); return; }

    // Nom + suppression
    const name = el('input', { class: 'input', type: 'text', value: sub.label, maxlength: 40, 'aria-label': 'Nom de la matière' });
    name.addEventListener('change', async () => { sub.label = name.value.trim() || sub.label; await persist(); draw(); });
    body.appendChild(el('div', { class: 'cy-line' }, [name, el('button', { class: 'cy-del-subj', 'aria-label': 'Supprimer la matière', onclick: async () => {
      if (!confirm(`Supprimer « ${sub.label} » et ses ${sub.items.length} éléments du cycle ? Les éléments déjà dans les to-do passées restent.`)) return;
      cfg.subjects.splice(sel, 1); await persist(); draw();
    } }, '✕')]));

    // Budget
    body.appendChild(el('div', { class: 'td-pick-head' }, 'Rythme'));
    body.appendChild(el('div', { class: 'pl-scope' }, [
      el('button', { class: 'pl-seg' + (sub.budgetMode === 'points' ? ' active' : ''), onclick: async () => { sub.budgetMode = 'points'; await persist(); draw(); } }, 'Points par semaine'),
      el('button', { class: 'pl-seg' + (sub.budgetMode === 'period' ? ' active' : ''), onclick: async () => {
        sub.budgetMode = 'period';
        if (!sub.endDate) sub.endDate = addDays(mondayOf(todayKey()), 7 * 20);
        await persist(); draw();
      } }, 'Finir avant le…')
    ]));
    const monday = mondayOf(todayKey());
    const total = sub.items.reduce((s, c) => s + c.w, 0);
    if (sub.budgetMode === 'points') {
      body.appendChild(el('div', { class: 'cy-line' }, [el('span', { class: 'cy-lab' }, 'Budget hebdomadaire'), stepper(sub.budget, async (v) => { sub.budget = v; await persist(); draw(); }, { max: 60 }), el('span', { class: 'dim text-xs' }, 'pts')]));
    } else {
      const date = el('input', { class: 'input', type: 'date', value: sub.endDate || '', style: 'color-scheme: dark; width: auto;' });
      date.addEventListener('change', async () => { if (date.value) { sub.endDate = date.value; await persist(); draw(); } });
      body.appendChild(el('div', { class: 'cy-line' }, [el('span', { class: 'cy-lab' }, 'Cycle terminé le'), date]));
      body.appendChild(el('div', { class: 'pl-hint' }, `Le budget s'ajuste chaque semaine pour finir à temps (vacances et révisions déduites) : environ ${cycleBudget(sub, monday)} pts cette semaine.`));
    }
    const per = Math.max(1, cycleBudget(sub, monday));
    body.appendChild(el('div', { class: 'cy-sum' }, `${sub.items.length} élément${sub.items.length > 1 ? 's' : ''} · ${total} pts · un tour ≈ ${Math.ceil(total / per) || 0} semaine${Math.ceil(total / per) > 1 ? 's' : ''}`));

    // Éléments
    body.appendChild(el('div', { class: 'td-pick-head' }, 'Éléments du cycle (dans l\u2019ordre)'));
    if (!sub.items.length) body.appendChild(el('div', { class: 'pl-note' }, 'Aucun élément. Ajoute chapitres, thèmes ou exercices ci-dessous.'));
    const list = el('div', { class: 'cy-list' });
    sub.items.forEach((it, i) => {
      const nm = el('input', { class: 'cy-name', type: 'text', value: it.name, maxlength: 60, 'aria-label': 'Nom' });
      nm.addEventListener('change', async () => { const v = nm.value.trim(); if (v) it.name = v; await persist(); draw(); });
      list.appendChild(el('div', { class: 'cy-row' }, [
        el('div', { class: 'cy-move' }, [
          el('button', { 'aria-label': 'Monter', disabled: i === 0 ? 'disabled' : null, onclick: async () => { [sub.items[i - 1], sub.items[i]] = [sub.items[i], sub.items[i - 1]]; await persist(); draw(); } }, '▲'),
          el('button', { 'aria-label': 'Descendre', disabled: i === sub.items.length - 1 ? 'disabled' : null, onclick: async () => { [sub.items[i + 1], sub.items[i]] = [sub.items[i], sub.items[i + 1]]; await persist(); draw(); } }, '▼')
        ]),
        nm,
        stepper(it.w, async (v) => { it.w = v; await persist(); draw(); }, { max: 30 }),
        el('button', { class: 'td-del', 'aria-label': 'Retirer', onclick: async () => { sub.items.splice(i, 1); await persist(); draw(); } }, '✕')
      ]));
    });
    body.appendChild(list);

    // Ajout d'un élément
    const addName = el('input', { class: 'input', type: 'text', placeholder: 'Nouvel élément (ex. Chapitre 7)', maxlength: 60 });
    let addW = 3;
    const wBox = el('div');
    const drawW = () => { wBox.replaceChildren(stepper(addW, (v) => { addW = v; drawW(); }, { max: 30 })); };
    drawW();
    const doAdd = async () => {
      const v = addName.value.trim(); if (!v) return;
      if (sub.items.some(c => c.name.toLowerCase() === v.toLowerCase())) { addName.value = ''; return; }
      sub.items.push({ name: v, w: addW }); await persist(); draw();
      body.querySelector('.cy-add input')?.focus();
    };
    addName.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });
    body.appendChild(el('div', { class: 'cy-add' }, [addName, wBox, el('button', { class: 'add-btn cy-add-btn', onclick: doAdd, html: '<span class="add-plus">+</span>' })]));
    body.appendChild(el('div', { class: 'pl-hint' }, 'Le poids (pts) mesure la taille d\u2019un élément : un gros chapitre pèse plus. Les changements s\u2019appliquent aux prochaines semaines générées.'));
    body.appendChild(el('button', { class: 'cy-reset', onclick: async () => {
      if (!confirm('Remettre le cycle par défaut (Maths, Physique, Anglais, Français) ? Tes matières et éléments actuels seront remplacés.')) return;
      const d = await resetCycle(); cfg.subjects = JSON.parse(JSON.stringify(d.subjects)); sel = 0; draw();
    } }, 'Remettre le cycle par défaut'));
    body.scrollTop = keep;
  };

  overlay.appendChild(el('div', { class: 'gpx-preview-modal' }, [
    el('div', { class: 'gpx-preview-head' }, [
      el('div', { class: 'gpx-preview-title', html: `<span class="gpx-preview-icon">${iconHtml('cycle')}</span><span>Cycle de la to-do</span>` }),
      el('button', { class: 'gpx-preview-close', 'aria-label': 'Fermer', onclick: close }, '✕')
    ]), body
  ]));
  document.body.appendChild(overlay);
  draw();
}
