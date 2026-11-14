// Page Quêtes
import { dayKeyFromDate, formatDate, prevWeekKey, todayKey, weekKey, weekStartDate } from '../core/dates.js';
import { GHOST_BEFORE, dbAll, dbGet } from '../core/db.js';

import { State } from '../core/state.js';

import { PENALTIES_START, arePenaltiesActive, cancelExcuse, excuseQuestWeek, getMalusExcuses, setSubjectMinutesSmart } from '../features/penalties.js';
import { recomputeAutoQuests } from '../features/quests.js';
import { DAYS, SPORT_TYPES } from '../features/schedule.js';

import { loadAll } from '../features/seed.js';

import { RUNS_GOAL_MAX, getSleepLog, runsGoalFor, setRunsGoal, toggleSleepNight } from '../features/weekly-goals.js';

import { SUBJECTS, computeWorkXp, formatHours, formatMinutes, parseTimeInput } from '../features/work.js';

import { el, escapeHtml, showToast } from '../ui/helpers.js';

import { iconHtml } from '../ui/icons.js';
import { render } from '../ui/router.js';

import { renderDayTodo } from '../ui/todo-widgets.js';

import { dailyGoalHours } from '../features/work-goals.js';


// Page « Aujourd'hui » : tableau de bord du jour (sport, temps de travail par matière) + to-do du jour.
export function renderToday(root) {
  const page = el('div', { class: 'page' });
  page.appendChild(el('div', { class: 'page-title' }, [el('h1', {}, 'Aujourd\'hui')]));
  const dashWrap = el('div', { class: 'mb-3' });
  page.appendChild(dashWrap);
  const todoWrap = el('div', { class: 'mb-5' });
  page.appendChild(todoWrap);
  root.appendChild(page);
  return renderDayDashboard(dashWrap, (dateKey) => renderDayTodo(todoWrap, dateKey));
}


// Objectif de sorties d'une semaine (− / +) et justification d'une semaine sans sortie (malus). Utilisé par la page Sport.
// wk : semaine concernée (YYYY-Www) ; modifiable pour la semaine en cours et les suivantes ; justification : semaine en cours.
export async function buildRunsControls(q, wk = weekKey()) {
  const goal = await runsGoalFor(wk, q);
  const wrap = el('div', { class: 'hq-runs-ctl' });
  const gRow = el('div', { class: 'hq-goal-pick' });
  gRow.innerHTML = '<div class="dim text-xs">Objectif</div>';
  const ctr = el('div', { class: 'hq-count-row' });
  const minus = el('button', { class: 'cnt-btn' }, '−');
  const val = el('div', { class: 'cnt-val' }, String(goal));
  const plus = el('button', { class: 'cnt-btn plus' }, '+');
  minus.disabled = goal <= 1;
  plus.disabled = goal >= RUNS_GOAL_MAX;
  const changeGoal = async (delta) => { await setRunsGoal(wk, goal + delta); await loadAll(); render(); };
  minus.addEventListener('click', () => changeGoal(-1));
  plus.addEventListener('click', () => changeGoal(+1));
  ctr.appendChild(minus); ctr.appendChild(val); ctr.appendChild(plus);
  gRow.appendChild(ctr);
  wrap.appendChild(gRow);
  if (arePenaltiesActive() && wk === weekKey()) {
    const excuses = await getMalusExcuses();
    const cur = excuses[`${wk}|${q.id}`];
    const row = el('div', { class: 'hq-excuse-row' });
    row.innerHTML = cur ? `<span class="hq-excused">${iconHtml('tick')} Justifié : ${cur.reason === 'malade' ? 'malade' : 'autre'}</span>` : '<span></span>';
    const eb = el('button', { class: 'btn ghost sm' }, cur ? 'Modifier' : 'Justifier une semaine sans sortie');
    eb.addEventListener('click', () => showRunsExcuseModal(q));
    row.appendChild(eb);
    wrap.appendChild(row);
  }
  return wrap;
}

export async function renderDayDashboard(root, afterRender) {
  // Jour affiché : aujourd'hui par défaut, ou un jour choisi (entre GHOST_BEFORE et aujourd'hui).
  let dateKey = State.dashDate || todayKey();
  if (dateKey > todayKey() || dateKey < GHOST_BEFORE) dateKey = todayKey();
  State.dashDate = dateKey === todayKey() ? null : dateKey;
  const isToday = dateKey === todayKey();
  const dayDate = new Date(dateKey + 'T12:00:00');
  const sched = await dbAll('schedule');
  const todayPlan = sched.find(s => s.id === dayKeyFromDate(dayDate));
  if (!todayPlan) return;
  const inCurrentWeek = weekKey(dayDate) === weekKey();
  const dayName = DAYS.find(d => d.key === dayKeyFromDate(dayDate))?.label || '';
  const dayLabel = isToday ? dayName : `${dayName} ${dayDate.getDate()} ${dayDate.toLocaleDateString('fr-FR', { month: 'long' })}`;
  const workLog = await dbGet('workLog', dateKey);
  const slept = !!(await getSleepLog())[dateKey];       // case cochée = couché avant 23h30 la veille au soir
  const actualMinutes = workLog?.totalMinutes || 0;
  const goalHours = await dailyGoalHours(dateKey);          // % du temps libre du jour (cf. work-goals.js)
  const wi = computeWorkXp(actualMinutes, goalHours);
  const progress = goalHours > 0 ? Math.min(1, actualMinutes / (goalHours * 60)) : 0;
  // On affiche le sport du jour pour required ET weekend (sortie longue flexible).
  const showSport = isToday && (todayPlan.sport === 'required' || todayPlan.sport === 'weekend');
  const todayActs = State.activities.filter(a => a.date.slice(0, 10) === dateKey);
  const sportDone = todayActs.length > 0;

  const barColor = wi.ratio < 0.5 ? '#7d7664' : wi.ratio < 1 ? '#E3B089' : '#D08A4E';

  let sportBlock = '';
  if (showSport) {
    const sportMeta = SPORT_TYPES[todayPlan.sportType] || SPORT_TYPES.footing;
    const isWeekend = todayPlan.sport === 'weekend';
    const subtitle = sportDone
      ? iconHtml('tick') + ' Sortie validée'
      : isWeekend
        ? 'Sortie longue à caser samedi ou dimanche'
        : 'Importe ton GPX quand c\'est fait';
    sportBlock = `
      <div class="block sport ${sportDone ? 'done' : ''}">
        <div class="block-icon">${iconHtml(sportMeta.icon)}</div>
        <div class="block-body">
          <div class="block-title">${sportMeta.label}<span class="pill warm" style="margin-left:8px;">${isWeekend ? 'Week-end' : 'Sport du jour'}</span></div>
          <div class="dim text-xs">${subtitle}</div>
        </div>
      </div>
    `;
  }

  const sleepBlock = `
      <div class="block sleep ${slept ? 'done' : ''}">
        <div class="block-icon">${iconHtml('moon')}</div>
        <div class="block-body">
          <div class="block-title">Couché avant 23h30</div>
          <div class="dim text-xs">${isToday ? 'Hier soir' : 'La veille de ce jour'} · alimente la Discipline</div>
        </div>
        <button class="btn sm ${slept ? '' : 'ghost'}" id="sleep-toggle">${slept ? iconHtml('tick') + ' Oui' : 'Cocher'}</button>
      </div>`;

  let workBlock = '';
  if (goalHours > 0) {
    const workDone = wi.ratio >= 1;
    workBlock = `
      <div class="block work ${workDone ? 'done' : ''}">
        <div class="block-icon">${iconHtml('books')}</div>
        <div class="block-body">
          <div class="flex between">
            <div class="block-title">Travail · objectif ${formatHours(goalHours)}${workDone ? ` <span class="pill warm" style="margin-left:8px;">${iconHtml('tick')}</span>` : ''}</div>
            <div class="work-pct" style="color:${barColor};">${Math.round(wi.ratio * 100)}%</div>
          </div>
          <div class="work-bar">
            <div class="work-fill" style="width:${Math.min(100, progress * 100)}%; background:${barColor};"></div>
          </div>
          <div class="dim text-xs mt-1">
            ${formatMinutes(actualMinutes)} / ${formatHours(goalHours)}
            ${wi.xp > 0 ? ` · <span style="color:var(--accent);">${wi.xp} XP</span>` : ''}
          </div>
        </div>
      </div>
      <div class="subjects">
        <div class="dim text-xs mb-2">Détaille par matière (le total se calcule tout seul)</div>
        <div class="subjects-grid" id="subjects-grid"></div>
      </div>
    `;
  }

  root.innerHTML = `
    <div class="dash">
      <div class="dash-head">
        <div class="dim text-xs">${isToday ? dayLabel : 'Jour modifié · ' + dayLabel}</div>
        ${wi.ratio >= 1 ? `<span class="text-xs" style="color:var(--accent);">Objectif atteint ${iconHtml('tick')}</span>` : ''}
      </div>
      <div class="day-picker">
        <button class="btn ghost sm" id="dp-prev" aria-label="Jour précédent" ${dateKey <= GHOST_BEFORE ? 'disabled' : ''}>${iconHtml('chevl')}</button>
        <input class="input" id="dp-date" type="date" min="${GHOST_BEFORE}" max="${todayKey()}" value="${dateKey}" />
        <button class="btn ghost sm" id="dp-next" aria-label="Jour suivant" ${isToday ? 'disabled' : ''}>${iconHtml('chevr')}</button>
        ${isToday ? '' : '<button class="btn ghost sm" id="dp-today">Aujourd\'hui</button>'}
      </div>
      ${!isToday && !inCurrentWeek ? '<div class="dim text-xs day-warn">Semaine passée : quêtes et notes de cette semaine sont recalculées automatiquement.</div>' : ''}
      ${sportBlock}
      ${sleepBlock}
      ${workBlock}
    </div>
  `;

  root.querySelector('#sleep-toggle')?.addEventListener('click', async () => {
    await toggleSleepNight(dateKey);
    await loadAll();
    render();
  });

  // Sélecteur de jour
  const gotoDay = async (key) => {
    State.dashDate = key >= todayKey() ? null : key;
    await renderDayDashboard(root, afterRender);
  };
  const shiftDay = (n) => {
    const d = new Date(dateKey + 'T12:00:00'); d.setDate(d.getDate() + n);
    return todayKey(d);
  };
  root.querySelector('#dp-prev')?.addEventListener('click', () => gotoDay(shiftDay(-1)));
  root.querySelector('#dp-next')?.addEventListener('click', () => gotoDay(shiftDay(1)));
  root.querySelector('#dp-today')?.addEventListener('click', () => gotoDay(todayKey()));
  root.querySelector('#dp-date')?.addEventListener('change', (e) => {
    const v = e.target.value;
    if (v && v >= GHOST_BEFORE && v <= todayKey()) gotoDay(v);
  });

  afterRender?.(dateKey);

  if (goalHours > 0) {
    const grid = root.querySelector('#subjects-grid');
    for (const [key, meta] of Object.entries(SUBJECTS)) {
      const minutes = workLog?.bySubject?.[key] || 0;
      const sub = el('div', { class: 'sub' });
      sub.innerHTML = `<label class="sub-label">${iconHtml(meta.icon)} ${meta.label}</label>`;
      const input = el('input', {
        class: 'sub-input',
        type: 'text',
        placeholder: '0',
        value: minutes ? formatMinutes(minutes) : ''
      });
      input.addEventListener('blur', async () => {
        const newMin = parseTimeInput(input.value);
        await setSubjectMinutesSmart(dateKey, key, newMin, goalHours);
        await recomputeAutoQuests();
        await loadAll();
        // Re-render entier de la vue : maintient header + sections principales/secondaires.
        render();
        showToast({ type: 'xp', title: 'Mis à jour', text: `${meta.label}: ${formatMinutes(newMin)}` });
      });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
      sub.appendChild(input);
      grid.appendChild(sub);
    }
  }
}

// Modal : choisir une semaine, un motif (Malade / Autre) et une note facultative.
export async function showRunsExcuseModal(q) {
  const startWk = weekKey(new Date(PENALTIES_START + 'T00:00:00'));
  const weeks = [];
  let wk = weekKey();
  while (wk >= startWk && weeks.length < 10) { weeks.push(wk); wk = prevWeekKey(wk); }
  if (!weeks.length) { showToast({ type: 'err', title: 'Aucune semaine', text: 'Les malus démarrent le ' + formatDate(PENALTIES_START) }); return; }

  const excuses = await getMalusExcuses();
  const completions = await dbAll('completions');
  for (let i = weeks.length - 1; i >= 0; i--) {
    const c = completions.find(x => x.questId === q.id && x.weekKey === weeks[i]);
    if ((c?.actualValue || 0) > 0 && !excuses[`${weeks[i]}|${q.id}`]) weeks.splice(i, 1);
  }
  if (!weeks.length) { showToast({ type: 'xp', title: 'Rien à justifier', text: 'Tu as fait au moins une sortie chaque semaine.' }, 3500); return; }
  const logs = (await dbGet('meta', 'malusLog'))?.value || {};
  const label = (w) => {
    const d = weekStartDate(w);
    const base = 'Sem. du ' + d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    const ex = excuses[`${w}|${q.id}`];
    return base + (w === weekKey() ? ' (en cours)' : '') + (ex ? ' · justifié' : '');
  };

  const overlay = el('div', { class: 'gpx-preview-overlay' });
  const modal = el('div', { class: 'gpx-preview-modal' });
  modal.innerHTML = `
    <div class="gpx-preview-head">
      <div class="gpx-preview-title"><span class="gpx-preview-icon">${iconHtml('stethoscope')}</span><span>Justifier une semaine sans sortie</span></div>
      <button class="gpx-preview-close" aria-label="Fermer">${iconHtml('close')}</button>
    </div>
    <div style="padding: 16px 18px;">
      <label class="dim text-xs" style="display:block; margin-bottom:6px;">Semaine</label>
      <select class="input" id="ex-week" style="width:100%;">
        ${weeks.map(w => `<option value="${w}">${label(w)}</option>`).join('')}
      </select>
      <div id="ex-info" class="dim text-xs mt-2"></div>
      <label class="dim text-xs" style="display:block; margin:14px 0 6px;">Motif</label>
      <select class="input" id="ex-reason" style="width:100%;">
        <option value="malade">Malade</option>
        <option value="autre">Autre</option>
      </select>
      <label class="dim text-xs" style="display:block; margin:14px 0 6px;">Précision <span id="ex-req"></span></label>
      <input class="input" id="ex-note" type="text" placeholder="ex : grippe, blessure, voyage…" style="width:100%;" />
      <p class="dim text-xs mt-3">Le malus de cette quête est supprimé pour la semaine choisie. S'il a déjà été appliqué, l'XP est rendue.</p>
    </div>
    <div class="gpx-preview-actions">
      <button class="btn ghost" id="ex-cancel-excuse">Annuler la justification</button>
      <button class="btn primary" id="ex-save">Valider</button>
    </div>
  `;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  const $ = (id) => modal.querySelector(id);
  const close = () => overlay.remove();
  $('.gpx-preview-close').addEventListener('click', close);

  const refresh = () => {
    const w = $('#ex-week').value;
    const ex = excuses[`${w}|${q.id}`];
    const entry = logs[w];
    const bits = [];
    if (entry?.xp) bits.push(`Malus hebdo appliqué : −${entry.xp} XP`);
    if (ex) bits.push(`Déjà justifié (${ex.reason}${ex.note ? ' : ' + escapeHtml(ex.note) : ''})`);
    $('#ex-info').innerHTML = bits.join(' · ') || 'Aucun malus appliqué pour cette semaine.';
    $('#ex-cancel-excuse').style.display = ex ? '' : 'none';
    $('#ex-save').disabled = !!ex;
    if (ex) { $('#ex-reason').value = ex.reason; $('#ex-note').value = ex.note || ''; }
  };
  const syncReq = () => { $('#ex-req').textContent = $('#ex-reason').value === 'autre' ? '(obligatoire)' : '(facultatif)'; };
  $('#ex-week').addEventListener('change', refresh);
  $('#ex-reason').addEventListener('change', syncReq);
  syncReq(); refresh();

  $('#ex-save').addEventListener('click', async () => {
    const reason = $('#ex-reason').value;
    const note = $('#ex-note').value.trim();
    if (reason === 'autre' && !note) { showToast({ type: 'err', title: 'Précision requise', text: 'Explique le motif « Autre ».' }); return; }
    const { refund } = await excuseQuestWeek(q.id, $('#ex-week').value, reason, note);
    await loadAll();
    close();
    render();
    showToast({ type: 'xp', title: 'Malus justifié', text: refund > 0 ? `+${refund} XP rendus` : 'Aucun malus pour cette semaine' });
  });
  $('#ex-cancel-excuse').addEventListener('click', async () => {
    await cancelExcuse(q.id, $('#ex-week').value);
    await loadAll();
    close();
    render();
    showToast({ type: 'xp', title: 'Justification annulée', text: 'Le malus s\'applique de nouveau' });
  });
}
