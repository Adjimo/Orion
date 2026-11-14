// Page Planning : emploi du temps de la semaine (cours, colles, DS, temps de travail personnel)
import { MODE_LABELS, SCHOOL_START, YEAR_END, addDays, mondayOf, parseKey } from '../core/calendar.js';

import { todayKey, weekKey } from '../core/dates.js';

import { iconHtml } from '../ui/icons.js';

import { DAY_LABELS, buildWeek, formatDuration, loadOverrides, removeOverride, saveOverride, toMin } from '../features/planning.js';

import { el } from '../ui/helpers.js';


const view = { monday: null, day: null };
const MIN_MONDAY = mondayOf(SCHOOL_START);
const MAX_MONDAY = mondayOf(YEAR_END);

const fmtShort = (k) => parseKey(k).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const hhmm = (t) => t.replace(':00', ' h').replace(':', ' h ');
const range = (a, b) => `${hhmm(a)} – ${hhmm(b)}`;

function eventCard(ev, onTap) {
  const meta = [ev.teacher, ev.room ? `salle ${ev.room}` : null].filter(Boolean).join(' · ');
  const dur = ev.type === 'ds' ? (ev.hours ? `${ev.hours} h` : 'durée à préciser') : null;
  return el('div', { class: `pl-card pl-${ev.type} pl-tap`, onclick: () => onTap(ev) }, [
    el('div', { class: 'pl-time' }, [el('span', {}, hhmm(ev.start)), el('span', { class: 'pl-time-end' }, ev.end ? hhmm(ev.end) : '')]),
    el('div', { class: 'pl-body' }, [
      el('div', { class: 'pl-title' }, [ev.title, dur ? el('span', { class: 'pl-chip' }, dur) : null, ev.modified ? el('span', { class: 'pl-chip' }, 'modifié') : null]),
      meta ? el('div', { class: 'pl-meta' }, meta) : null
    ])
  ]);
}

function freeCard(b) {
  const min = toMin(b.end) - toMin(b.start);
  return el('div', { class: 'pl-card pl-free' }, [
    el('div', { class: 'pl-time' }, [el('span', {}, hhmm(b.start)), el('span', { class: 'pl-time-end' }, hhmm(b.end))]),
    el('div', { class: 'pl-body' }, [el('div', { class: 'pl-title' }, ['Travail personnel', el('span', { class: 'pl-chip' }, formatDuration(min))])])
  ]);
}

function pauseCard(b) {
  return el('div', { class: 'pl-card pl-pause' }, [
    el('div', { class: 'pl-time' }, [el('span', {}, hhmm(b.start)), el('span', { class: 'pl-time-end' }, hhmm(b.end))]),
    el('div', { class: 'pl-body' }, [el('div', { class: 'pl-title' }, 'Pause repas')])
  ]);
}

function dayList(day, mode, onTap) {
  const items = [...day.events.map(e => ({ t: toMin(e.start), node: eventCard(e, onTap) })), ...day.free.map(b => ({ t: toMin(b.start), node: freeCard(b) })), ...day.pauses.map(b => ({ t: toMin(b.start), node: pauseCard(b) }))]
    .sort((a, b) => a.t - b.t).map(x => x.node);
  const wrap = el('div', { class: 'pl-list' });
  const note = day.info.holiday ? `Jour férié · ${day.info.holiday}` : day.info.vacation ? `Vacances · ${day.info.vacation}` : null;
  if (note) wrap.appendChild(el('div', { class: 'pl-note' }, note));
  if (!day.events.length && !note && mode !== 'normal') wrap.appendChild(el('div', { class: 'pl-note' }, 'Pas de cours : journée libre.'));
  items.forEach(n => wrap.appendChild(n));
  return wrap;
}

export async function renderPlanning(root) {
  if (!root.classList.contains('page')) { const pg = el('div', { class: 'page' }); root.innerHTML = ''; root.appendChild(pg); root = pg; }
  const today = todayKey();
  if (!view.monday) view.monday = mondayOf(today);
  const rerender = () => { root.innerHTML = ''; renderPlanning(root); };
  const week = await buildWeek(view.monday);
  if (view.day === null || view.day === undefined) view.day = (today >= week.monday && today <= addDays(week.monday, 6)) ? week.days.findIndex(d => d.date === today) : 0;
  root.innerHTML = '';

  const go = (delta) => {
    const next = addDays(view.monday, delta * 7);
    if (next < MIN_MONDAY || next > MAX_MONDAY) return;
    view.monday = next; view.day = 0; root.innerHTML = ''; renderPlanning(root);
  };
  const title = week.index !== null ? `Semaine ${week.index}` : 'Semaine';
  root.appendChild(el('div', { class: 'pl-head' }, [
    el('button', { class: 'pl-nav', onclick: () => go(-1), 'aria-label': 'Semaine précédente', html: iconHtml('chevl') }),
    el('div', { class: 'pl-head-mid' }, [
      el('div', { class: 'pl-week' }, `${title !== 'Semaine' ? title + ' · ' : ''}${fmtShort(week.monday)} – ${fmtShort(addDays(week.monday, 6))}`),
      MODE_LABELS[week.mode] ? el('div', { class: 'pl-mode' }, MODE_LABELS[week.mode]) : null
    ]),
    el('button', { class: 'pl-nav', onclick: () => go(1), 'aria-label': 'Semaine suivante', html: iconHtml('chevr') })
  ]));
  root.appendChild(el('div', { class: 'pl-days' }, week.days.map((d, i) => el('button', {
    class: `pl-day${i === view.day ? ' active' : ''}${d.date === today ? ' today' : ''}`,
    onclick: () => { view.day = i; root.innerHTML = ''; renderPlanning(root); }
  }, [el('span', {}, d.label.slice(0, 3)), el('b', {}, String(parseKey(d.date).getDate())),
      el('i', { class: (d.events.length || d.info.vacation || d.info.holiday) ? 'on' : '' })]))));

  root.appendChild(el('div', { class: 'pl-legend' }, [['Cours', 'var(--ev-cours)'], ['Colle', 'var(--ev-colle)'], ['DS', 'var(--ev-ds)'], ['Libre', 'var(--border-strong)']].map(([l, c]) => el('span', { style: `--c:${c}` }, l))));

  if (week.unscheduled.length) {
    root.appendChild(el('div', { class: 'pl-card pl-colle pl-unsched pl-tap' }, [
      el('div', { class: 'pl-body' }, week.unscheduled.map(e => el('div', { onclick: () => openEditor(e, week, rerender) }, [
        el('div', { class: 'pl-title' }, [e.title, el('span', { class: 'pl-chip' }, 'créneau à choisir')]),
        el('div', { class: 'pl-meta' }, [e.teacher, e.note].filter(Boolean).join(' · '))
      ])))
    ]));
  }
  root.appendChild(dayList(week.days[view.day], week.mode, (ev) => openEditor(ev, week, rerender)));
  root.appendChild(el('button', { class: 'add-btn pl-add', onclick: () => openEditor(null, week, rerender), html: '<span class="add-plus">+</span> Ajouter un créneau' }));
}

// ── Édition d'un créneau (sans jamais toucher à l'emploi du temps de base) ───
const field = (label, input) => el('label', { class: 'pl-field' }, [el('span', {}, label), input]);

function openEditor(ev, week, rerender) {
  const isNew = !ev;
  const cur = ev || { title: '', start: '', end: '', teacher: '', room: '', date: week.days[view.day].date };
  const dayIdx = cur.date ? Math.max(0, Math.round((parseKey(cur.date) - parseKey(week.monday)) / 86400000)) : view.day;
  const close = () => overlay.remove();
  const inTitle = el('input', { type: 'text', value: cur.title || '', placeholder: 'Intitulé' });
  const inDay = el('select', {}, DAY_LABELS.map((l, i) => el('option', i === dayIdx ? { value: i + 1, selected: 'selected' } : { value: i + 1 }, l)));
  const inStart = el('input', { type: 'time', value: cur.start || '' });
  const inEnd = el('input', { type: 'time', value: cur.end || '' });
  const inTeacher = el('input', { type: 'text', value: cur.teacher || '', placeholder: 'Professeur' });
  const inRoom = el('input', { type: 'text', value: cur.room || '', placeholder: 'Salle' });
  const recurring = isNew || !!ev.recurKey;
  let scope = 'week';
  const scopeBox = recurring ? el('div', { class: 'pl-scope' }, [
    el('button', { class: 'pl-seg active', onclick: (e) => setScope('week', e) }, 'Cette semaine'),
    el('button', { class: 'pl-seg', onclick: (e) => setScope('all', e) }, 'Toutes les semaines')
  ]) : null;
  function setScope(v, e) { scope = v; scopeBox.querySelectorAll('.pl-seg').forEach(b => b.classList.toggle('active', b === e.currentTarget)); }

  const fields = () => ({ day: Number(inDay.value), start: inStart.value, end: inEnd.value, title: inTitle.value.trim(), teacher: inTeacher.value.trim() || null, room: inRoom.value.trim() || null });
  const stamp = () => new Date().toISOString();
  const done = () => { close(); rerender(); };

  const save = async () => {
    const f = fields();
    if (!f.title || !f.start || !f.end || f.end <= f.start) { inEnd.classList.add('pl-bad'); return; }
    const id = `ov-${Date.now()}`;
    if (isNew) await saveOverride({ id, scope, weekKey: week.monday, op: 'add', fields: f, createdAt: stamp() });
    else await saveOverride({ id, scope, weekKey: week.monday, op: 'modify', targetId: scope === 'all' ? ev.recurKey : ev.id, fields: f, createdAt: stamp() });
    done();
  };
  const remove = async () => {
    await saveOverride({ id: `ov-${Date.now()}`, scope, weekKey: week.monday, op: 'delete', targetId: scope === 'all' ? ev.recurKey : ev.id, createdAt: stamp() });
    done();
  };
  const revert = async () => {
    for (const ov of await loadOverrides()) {
      if ((ov.scope === 'week' && ov.targetId === ev.id) || (ov.scope === 'all' && ov.targetId === ev.recurKey)) await removeOverride(ov.id);
    }
    done();
  };

  const overlay = el('div', { class: 'gpx-preview-overlay', onclick: (e) => { if (e.target === overlay) close(); } });
  const modal = el('div', { class: 'gpx-preview-modal' }, [
    el('div', { class: 'gpx-preview-head' }, [
      el('div', { class: 'gpx-preview-title' }, isNew ? 'Nouveau créneau' : 'Modifier le créneau'),
      el('button', { class: 'gpx-preview-close', 'aria-label': 'Fermer', onclick: close, html: iconHtml('close') })
    ]),
    el('div', { class: 'pl-form' }, [
      field('Intitulé', inTitle), field('Jour', inDay),
      el('div', { class: 'pl-row2' }, [field('Début', inStart), field('Fin', inEnd)]),
      field('Professeur', inTeacher), field('Salle', inRoom),
      scopeBox ? el('div', { class: 'pl-hint' }, 'S\u2019applique à :') : null, scopeBox,
      el('button', { class: 'btn full', onclick: save }, 'Enregistrer'),
      !isNew ? el('button', { class: 'btn full danger', onclick: remove }, 'Supprimer') : null,
      (!isNew && ev.modified) ? el('button', { class: 'btn full', onclick: revert }, 'Rétablir l\u2019original') : null
    ])
  ]);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}
