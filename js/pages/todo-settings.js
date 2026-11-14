// Onglet « To-do » : cycles (matières à éléments pondérés) et éléments récurrents (jours + fréquence).
// Tout s'enregistre à chaque modification ; les changements comptent à partir de la semaine suivante.
import { DAY_LABELS } from '../features/planning.js';
import { loadCycle, saveCycle, TODO_SUBJECTS } from '../features/todo.js';
import { newSubjectId, resetCycle } from '../features/todo-cycle.js';
import { loadRecur, newRecurId, saveRecur } from '../features/todo-recur.js';
import { todayKey } from '../core/dates.js';
import { mondayOf, parseKey } from '../core/calendar.js';
import { el } from '../ui/helpers.js';
import { SUBJ_ICON, iconHtml, subjClass } from '../ui/icons.js';

const subjIcon = (id) => `<span class="${subjClass(id)}">${iconHtml(SUBJ_ICON[id] || 'book')}</span>`;
const DAY_SHORT = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

const stepper = (value, onChange, { min = 1, max = 99, fmt = String } = {}) => el('div', { class: 'cy-step' }, [
  el('button', { type: 'button', 'aria-label': 'Moins', disabled: value <= min ? 'disabled' : null, onclick: () => onChange(Math.max(min, value - 1)) }, '−'),
  el('span', { class: 'cy-val' }, fmt(value)),
  el('button', { type: 'button', 'aria-label': 'Plus', disabled: value >= max ? 'disabled' : null, onclick: () => onChange(Math.min(max, value + 1)) }, '+')
]);
const toggle = (on, onChange, label) => el('button', { type: 'button', class: 'sw' + (on ? ' on' : ''), role: 'switch', 'aria-checked': String(!!on), 'aria-label': label, onclick: () => onChange(!on) }, [el('span', { class: 'sw-knob' })]);

export async function renderTodoSettings(root) {
  const cycle = JSON.parse(JSON.stringify(await loadCycle()));
  const recur = JSON.parse(JSON.stringify(await loadRecur()));
  let tab = 'cycles';
  const open = new Set();
  const page = el('div', { class: 'page' });
  const body = el('div', { class: 'ts-body' });
  const segs = el('div', { class: 'ts-segs' });
  page.append(el('div', { class: 'page-title' }, [el('h1', {}, 'To-do')]), segs, body);
  root.appendChild(page);

  const keepScroll = (fn) => { const y = window.scrollY; fn(); window.scrollTo(0, y); };
  const saveC = () => saveCycle(cycle);
  const saveR = () => saveRecur(recur);

  // ── Cycles ────────────────────────────────────────────────────────────────
  function cycleCard(sub, si) {
    const isOpen = open.has(sub.id);
    const card = el('div', { class: 'ts-card' + (sub.enabled === false ? ' off' : '') });
    const total = sub.items.reduce((s, i) => s + i.w, 0);
    card.appendChild(el('div', { class: 'ts-head', onclick: () => { isOpen ? open.delete(sub.id) : open.add(sub.id); draw(); } }, [
      el('span', { class: 'ts-ico', html: subjIcon(sub.id) }),
      el('div', { class: 'ts-title' }, [el('b', {}, sub.label), el('small', {}, `${sub.items.length} éléments · ${sub.budget} pts / sem.`)]),
      el('span', { onclick: (e) => e.stopPropagation() }, [toggle(sub.enabled !== false, async (v) => { sub.enabled = v; await saveC(); keepScroll(draw); }, 'Activer le cycle')]),
      el('span', { class: 'ts-chev' + (isOpen ? ' open' : ''), html: iconHtml('chevr') })
    ]));
    if (!isOpen) return card;
    const b = el('div', { class: 'ts-inner' });
    b.appendChild(el('div', { class: 'cy-line' }, [
      el('span', { class: 'cy-lab' }, 'Points par semaine'),
      stepper(sub.budget, async (v) => { sub.budget = v; await saveC(); keepScroll(draw); }, { min: 1, max: 60 })
    ]));
    const list = el('div', { class: 'cy-list' });
    sub.items.forEach((it, i) => {
      const input = el('input', { class: 'cy-name', value: it.name, 'aria-label': 'Nom' });
      input.addEventListener('change', async () => { it.name = input.value.trim() || it.name; await saveC(); });
      list.appendChild(el('div', { class: 'cy-row' }, [
        el('div', { class: 'cy-move' }, [
          el('button', { 'aria-label': 'Monter', disabled: i === 0 ? 'disabled' : null, onclick: async () => { [sub.items[i - 1], sub.items[i]] = [sub.items[i], sub.items[i - 1]]; await saveC(); keepScroll(draw); }, html: iconHtml('chevu') }),
          el('button', { 'aria-label': 'Descendre', disabled: i === sub.items.length - 1 ? 'disabled' : null, onclick: async () => { [sub.items[i + 1], sub.items[i]] = [sub.items[i], sub.items[i + 1]]; await saveC(); keepScroll(draw); }, html: iconHtml('chevd') })
        ]),
        input,
        stepper(it.w, async (v) => { it.w = v; await saveC(); keepScroll(draw); }, { min: 1, max: 20 }),
        el('button', { class: 'td-del', 'aria-label': 'Retirer', onclick: async () => { sub.items.splice(i, 1); await saveC(); keepScroll(draw); }, html: iconHtml('close') })
      ]));
    });
    b.appendChild(list);
    b.appendChild(el('button', { class: 'add-btn', onclick: async () => { sub.items.push({ name: 'Nouvel élément', w: 3 }); await saveC(); keepScroll(draw); } }, [el('span', { class: 'add-plus' }, '+'), ' Ajouter un élément']));
    b.appendChild(el('button', { class: 'ts-danger', onclick: async () => { if (!confirm(`Supprimer le cycle « ${sub.label} » ?`)) return; cycle.subjects.splice(si, 1); await saveC(); keepScroll(draw); } }, 'Supprimer ce cycle'));
    card.appendChild(b);
    return card;
  }

  function drawCycles() {
    cycle.subjects.forEach((s, i) => body.appendChild(cycleCard(s, i)));
    body.appendChild(el('button', { class: 'add-btn solid', onclick: async () => {
      const name = prompt('Nom de la matière :'); if (!name?.trim()) return;
      const id = newSubjectId(); cycle.subjects.push({ id, label: name.trim(), budgetMode: 'points', budget: 6, enabled: true, items: [{ name: 'Premier élément', w: 3 }] });
      open.add(id); await saveC(); TODO_SUBJECTS.length; keepScroll(draw);
    } }, [el('span', { class: 'add-plus' }, '+'), ' Ajouter une matière']));
    body.appendChild(el('button', { class: 'ts-danger', onclick: async () => {
      if (!confirm('Remplacer tous les cycles par les valeurs par défaut ?')) return;
      Object.assign(cycle, JSON.parse(JSON.stringify(await resetCycle()))); keepScroll(draw);
    } }, 'Valeurs par défaut'));
  }

  // ── Récurrents ────────────────────────────────────────────────────────────
  function recurCard(r, ri) {
    const isOpen = open.has(r.id);
    const card = el('div', { class: 'ts-card' + (r.enabled ? '' : ' off') });
    const when = r.days.length ? r.days.map(d => DAY_SHORT[d - 1]).join(' ') : 'aucun jour';
    const rhythm = r.every > 1 ? `toutes les ${r.every} sem.` : 'chaque semaine';
    card.appendChild(el('div', { class: 'ts-head', onclick: () => { isOpen ? open.delete(r.id) : open.add(r.id); draw(); } }, [
      el('span', { class: 'ts-ico', html: subjIcon(r.subj) }),
      el('div', { class: 'ts-title' }, [el('b', {}, r.label), el('small', {}, `${when} · ${rhythm}`)]),
      el('span', { onclick: (e) => e.stopPropagation() }, [toggle(r.enabled, async (v) => { r.enabled = v; await saveR(); keepScroll(draw); }, 'Activer l\u2019élément')]),
      el('span', { class: 'ts-chev' + (isOpen ? ' open' : ''), html: iconHtml('chevr') })
    ]));
    if (!isOpen) return card;
    const b = el('div', { class: 'ts-inner' });
    const name = el('input', { class: 'input', value: r.label, 'aria-label': 'Nom' });
    name.addEventListener('change', async () => { r.label = name.value.trim() || r.label; await saveR(); keepScroll(draw); });
    b.appendChild(name);
    b.appendChild(el('div', { class: 'ts-sub' }, 'Jours'));
    b.appendChild(el('div', { class: 'ts-days' }, DAY_SHORT.map((l, i) => el('button', {
      type: 'button', class: 'ts-day' + (r.days.includes(i + 1) ? ' active' : ''), 'aria-label': DAY_LABELS[i],
      onclick: async () => { r.days = r.days.includes(i + 1) ? r.days.filter(d => d !== i + 1) : [...r.days, i + 1].sort((a, c) => a - c); await saveR(); keepScroll(draw); }
    }, l))));
    b.appendChild(el('div', { class: 'cy-line' }, [
      el('span', { class: 'cy-lab' }, 'Répéter'),
      stepper(r.every, async (v) => { r.every = v; r.anchor = mondayOf(todayKey()); await saveR(); keepScroll(draw); }, { min: 1, max: 12, fmt: (v) => v === 1 ? 'chaque sem.' : `${v} sem.` })
    ]));
    b.appendChild(el('div', { class: 'ts-sub' }, 'Matière'));
    b.appendChild(el('div', { class: 'td-pick' }, TODO_SUBJECTS.map(s => el('button', { type: 'button', class: 'pl-seg' + (r.subj === s.id ? ' active' : ''), onclick: async () => { r.subj = s.id; await saveR(); keepScroll(draw); } }, s.label))));
    b.appendChild(el('div', { class: 'cy-line' }, [
      el('span', { class: 'cy-lab' }, 'Reporter si non fait'),
      toggle(!r.noCarry, async (v) => { r.noCarry = !v; await saveR(); keepScroll(draw); }, 'Reporter')
    ]));
    b.appendChild(el('button', { class: 'ts-danger', onclick: async () => { if (!confirm(`Supprimer « ${r.label} » ?`)) return; recur.items.splice(ri, 1); await saveR(); keepScroll(draw); } }, 'Supprimer cet élément'));
    card.appendChild(b);
    return card;
  }

  // Séances d'un cycle : les jours où ses éléments tombent (anglais, français, maths, physique…).
  function sessionCard(sub) {
    const id = 'ses-' + sub.id, isOpen = open.has(id);
    const when = sub.days.length ? sub.days.map(d => DAY_SHORT[d - 1]).join(' ') : 'aucun jour';
    const card = el('div', { class: 'ts-card' + (sub.enabled === false ? ' off' : '') });
    card.appendChild(el('div', { class: 'ts-head', onclick: () => { isOpen ? open.delete(id) : open.add(id); draw(); } }, [
      el('span', { class: 'ts-ico', html: subjIcon(sub.id) }),
      el('div', { class: 'ts-title' }, [el('b', {}, `${sub.label} · séances`), el('small', {}, `${when} · cycle`)]),
      el('span', { class: 'ts-chev' + (isOpen ? ' open' : ''), html: iconHtml('chevr') })
    ]));
    if (isOpen) card.appendChild(el('div', { class: 'ts-inner' }, [
      el('div', { class: 'ts-sub' }, 'Jours des éléments du cycle'),
      el('div', { class: 'ts-days' }, DAY_SHORT.map((l, i) => el('button', {
        type: 'button', class: 'ts-day' + (sub.days.includes(i + 1) ? ' active' : ''), 'aria-label': DAY_LABELS[i],
        onclick: async () => { sub.days = sub.days.includes(i + 1) ? sub.days.filter(d => d !== i + 1) : [...sub.days, i + 1].sort((a, c) => a - c); await saveC(); keepScroll(draw); }
      }, l)))
    ]));
    return card;
  }

  function drawRecur() {
    cycle.subjects.forEach(sub => body.appendChild(sessionCard(sub)));
    recur.items.forEach((r, i) => body.appendChild(recurCard(r, i)));
    body.appendChild(el('button', { class: 'add-btn solid', onclick: async () => {
      const id = newRecurId();
      recur.items.push({ id, label: 'Nouvel élément', subj: 'autre', days: [parseKey(todayKey()).getDay() || 7], every: 1, anchor: mondayOf(todayKey()), enabled: true, noCarry: true });
      open.add(id); await saveR(); keepScroll(draw);
    } }, [el('span', { class: 'add-plus' }, '+'), ' Ajouter un élément récurrent']));
  }

  function draw() {
    segs.replaceChildren(...[['cycles', 'Cycles', 'cycle'], ['recur', 'Récurrents', 'calendar']].map(([id, label, ico]) =>
      el('button', { class: 'ts-seg' + (tab === id ? ' active' : ''), onclick: () => { tab = id; draw(); } }, [el('span', { html: iconHtml(ico) }), label])));
    body.replaceChildren();
    tab === 'cycles' ? drawCycles() : drawRecur();
  }
  draw();
}
