// Onglet « To-do » : cycles (matières à éléments pondérés) et éléments récurrents (jours + fréquence).
// Tout s'enregistre à chaque modification ; les changements comptent à partir de la semaine suivante.
import { DAY_LABELS } from '../features/planning.js';
import { loadCycle, purgeDisabledTodo, saveCycle, TODO_SUBJECTS } from '../features/todo.js';
import { resetCycle } from '../features/todo-cycle.js';
import { CATEGORY_LABEL, WORK_IDS } from '../features/competences.js';
import { loadRecur, newRecurId, saveRecur, weekParity } from '../features/todo-recur.js';
import { todayKey } from '../core/dates.js';
import { mondayOf, parseKey } from '../core/calendar.js';
import { addBtn, el } from '../ui/helpers.js';
import { SUBJ_ICON, iconHtml, subjClass } from '../ui/icons.js';

const subjIcon = (id) => `<span class="${subjClass(id)}">${iconHtml(SUBJ_ICON[id] || 'book')}</span>`;
const DAY_SHORT = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

const stepper = (value, onChange, { min = 1, max = 99, fmt = String } = {}) => el('div', { class: 'cy-step' }, [
  el('button', { type: 'button', 'aria-label': 'Moins', disabled: value <= min ? 'disabled' : null, onclick: () => onChange(Math.max(min, value - 1)) }, '−'),
  el('span', { class: 'cy-val' }, fmt(value)),
  el('button', { type: 'button', 'aria-label': 'Plus', disabled: value >= max ? 'disabled' : null, onclick: () => onChange(Math.min(max, value + 1)) }, '+')
]);
const toggle = (on, onChange, label, size = '') => el('button', { type: 'button', class: 'sw' + size + (on ? ' on' : ''), role: 'switch', 'aria-checked': String(!!on), 'aria-label': label, onclick: () => onChange(!on) }, [el('span', { class: 'sw-knob' })]);

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
  const saveC = async () => { await saveCycle(cycle); await purgeDisabledTodo(); };   // un élément désactivé quitte Aujourd'hui et les jours suivants
  const saveR = () => saveRecur(recur);

  // ── Cycles ────────────────────────────────────────────────────────────────
  function cycleCard(sub, si) {
    const isOpen = open.has(sub.id);
    const card = el('div', { class: 'ts-card' + (sub.enabled === false ? ' off' : '') });
    const total = sub.items.reduce((s, i) => s + i.w, 0);
    card.appendChild(el('div', { class: 'ts-head', onclick: () => { isOpen ? open.delete(sub.id) : open.add(sub.id); draw(); } }, [
      el('span', { class: 'ts-ico', html: subjIcon(sub.id) }),
      el('div', { class: 'ts-title' }, [el('div', { class: 't1' }, [el('b', {}, sub.label), el('i', { class: 'cat-chip' }, CATEGORY_LABEL.travail)]), el('small', {}, `${sub.items.filter(i => i.enabled !== false).length === sub.items.length ? sub.items.length : sub.items.filter(i => i.enabled !== false).length + '/' + sub.items.length} éléments · ${sub.budget} pts / sem.`)]),
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
      list.appendChild(el('div', { class: 'cy-row' + (it.enabled === false ? ' off' : '') }, [
        input,
        el('button', { class: 'td-del', 'aria-label': 'Retirer', onclick: async () => { sub.items.splice(i, 1); await saveC(); keepScroll(draw); }, html: iconHtml('close') }),
        el('div', { class: 'cy-ctl' }, [
          el('div', { class: 'cy-move' }, [
            el('button', { 'aria-label': 'Monter', disabled: i === 0 ? 'disabled' : null, onclick: async () => { [sub.items[i - 1], sub.items[i]] = [sub.items[i], sub.items[i - 1]]; await saveC(); keepScroll(draw); }, html: iconHtml('chevu') }),
            el('button', { 'aria-label': 'Descendre', disabled: i === sub.items.length - 1 ? 'disabled' : null, onclick: async () => { [sub.items[i + 1], sub.items[i]] = [sub.items[i], sub.items[i + 1]]; await saveC(); keepScroll(draw); }, html: iconHtml('chevd') })
          ]),
          stepper(it.w, async (v) => { it.w = v; await saveC(); keepScroll(draw); }, { min: 1, max: 20 }),
          el('span', { class: 'cy-on' }, [el('small', {}, it.enabled === false ? 'Désactivé' : 'Actif'), toggle(it.enabled !== false, async (v) => { it.enabled = v; await saveC(); keepScroll(draw); }, 'Activer l\u2019élément', ' sm')])
        ])
      ]));
    });
    b.appendChild(list);
    b.appendChild(addBtn('Ajouter un élément', async () => { sub.items.push({ name: 'Nouvel élément', w: 3, enabled: true }); await saveC(); keepScroll(draw); }));
    // Séances : les jours où les éléments du cycle tombent (un par jour, le dernier jour reçoit le reste).
    b.appendChild(el('div', { class: 'ts-sub' }, 'Jours des séances'));
    b.appendChild(el('div', { class: 'ts-days' }, DAY_SHORT.map((l, i) => el('button', {
      type: 'button', class: 'ts-day' + (sub.days.includes(i + 1) ? ' active' : ''), 'aria-label': DAY_LABELS[i],
      onclick: async () => { sub.days = sub.days.includes(i + 1) ? sub.days.filter(d => d !== i + 1) : [...sub.days, i + 1].sort((a, c) => a - c); await saveC(); keepScroll(draw); }
    }, l))));
    card.appendChild(b);
    return card;
  }

  function drawCycles() {
    cycle.subjects.forEach((sub, i) => body.appendChild(cycleCard(sub, i)));
    body.appendChild(el('button', { class: 'ts-danger', onclick: async () => {
      if (!confirm('Remplacer tous les cycles par les valeurs par défaut ?')) return;
      Object.assign(cycle, JSON.parse(JSON.stringify(await resetCycle()))); await purgeDisabledTodo(); keepScroll(draw);
    } }, 'Valeurs par défaut'));
  }

  // ── Récurrents ────────────────────────────────────────────────────────────
  function recurCard(r, ri) {
    const isOpen = open.has(r.id);
    const card = el('div', { class: 'ts-card' + (r.enabled ? '' : ' off') });
    const when = r.days.length ? r.days.map(d => DAY_SHORT[d - 1]).join(' ') : 'aucun jour';
    const rhythm = r.every === 2 && r.phase ? `semaine ${r.phase}` : r.every > 1 ? `toutes les ${r.every} sem.` : 'chaque semaine';
    card.appendChild(el('div', { class: 'ts-head', onclick: () => { isOpen ? open.delete(r.id) : open.add(r.id); draw(); } }, [
      el('span', { class: 'ts-ico', html: subjIcon(r.subj) }),
      el('div', { class: 'ts-title' }, [el('div', { class: 't1' }, [el('b', {}, r.label)]), el('small', {}, `${when} · ${rhythm}`)]),
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
      stepper(r.every, async (v) => { r.every = v; r.anchor = mondayOf(todayKey()); r.phase = v === 2 ? (r.phase || weekParity(mondayOf(todayKey()))) : null; await saveR(); keepScroll(draw); }, { min: 1, max: 12, fmt: (v) => v === 1 ? 'chaque sem.' : `${v} sem.` })
    ]));
    if (r.every === 2) {   // une semaine sur deux : choix de la semaine A ou B (la semaine en cours est indiquée)
      b.appendChild(el('div', { class: 'ts-sub' }, `Quelle semaine ? (actuelle : ${weekParity(mondayOf(todayKey()))})`));
      b.appendChild(el('div', { class: 'td-pick' }, ['A', 'B'].map(ph => el('button', { type: 'button', class: 'pl-seg' + (r.phase === ph ? ' active' : ''), onclick: async () => { r.phase = ph; await saveR(); keepScroll(draw); } }, `Semaine ${ph}`))));
    }
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

  function drawRecur() {   // même boîte que les cycles : en-tête de matière (icône, titre, nombre d'éléments) puis contenu
    for (const sj of TODO_SUBJECTS) {
      const mine = recur.items.map((r, i) => [r, i]).filter(([r]) => r.subj === sj.id);
      const key = 'rs:' + sj.id, isOpen = open.has(key);
      const card = el('div', { class: 'ts-card' + (mine.length && mine.every(([r]) => !r.enabled) ? ' off' : '') });
      card.appendChild(el('div', { class: 'ts-head', onclick: () => { isOpen ? open.delete(key) : open.add(key); draw(); } }, [
        el('span', { class: 'ts-ico', html: subjIcon(sj.id) }),
        el('div', { class: 'ts-title' }, [el('div', { class: 't1' }, [el('b', {}, sj.label), el('i', { class: 'cat-chip' }, CATEGORY_LABEL.travail)]), el('small', {}, mine.length ? `${mine.length} élément${mine.length > 1 ? 's' : ''} · ${mine.filter(([r]) => r.enabled).length} actif${mine.filter(([r]) => r.enabled).length > 1 ? 's' : ''}` : 'Aucun élément')]),
        el('span', { class: 'ts-chev' + (isOpen ? ' open' : ''), html: iconHtml('chevr') })
      ]));
      if (isOpen) {
        const b = el('div', { class: 'ts-inner' });
        mine.forEach(([r, i]) => b.appendChild(recurCard(r, i)));
        b.appendChild(addBtn(`Ajouter en ${sj.label}`, async () => {
          const id = newRecurId();
          recur.items.push({ id, label: 'Nouvel élément', subj: sj.id, days: [parseKey(todayKey()).getDay() || 7], every: 1, anchor: mondayOf(todayKey()), enabled: true, noCarry: true });
          open.add(id); await saveR(); keepScroll(draw);
        }));
        card.appendChild(b);
      }
      body.appendChild(card);
    }
  }

  function draw() {
    segs.replaceChildren(...[['cycles', 'Cycles', 'cycle'], ['recur', 'Récurrents', 'calendar']].map(([id, label, ico]) =>
      el('button', { class: 'ts-seg' + (tab === id ? ' active' : ''), onclick: () => { tab = id; draw(); } }, [el('span', { html: iconHtml(ico) }), label])));
    body.replaceChildren();
    tab === 'cycles' ? drawCycles() : drawRecur();
  }
  draw();
}
