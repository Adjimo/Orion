// Page Quêtes
import { dayKeyFromDate, formatDate, prevWeekKey, todayKey, weekDateKeys, weekKey, weekStartDate } from '../core/dates.js';
import { GHOST_BEFORE, dbAll, dbGet } from '../core/db.js';
import { State } from '../core/state.js';
import { PENALTIES_START, SELF_PCT_CAP, arePenaltiesActive, bonusFactorFromRatio, cancelExcuse, excuseQuestWeek, getMalusExcuses, getSelfMalus, malusFactorFromRatio, questFullXp, saveSelfMalus, setSubjectMinutesSmart, usesFullMalusRules, xpEarnedInWeek } from '../features/penalties.js';
import { getCurrentCompletion, recomputeAutoQuests, setQuestValue } from '../features/quests.js';
import { DAYS, SPORT_TYPES } from '../features/schedule.js';
import { loadAll } from '../features/seed.js';
import { RUNS_GOAL_MAX, getSleepLog, runsGoalFor, setRunsGoal, toggleSleepNight } from '../features/weekly-goals.js';
import { SUBJECTS, computeWorkXp, formatMinutes, parseTimeInput } from '../features/work.js';
import { el, escapeHtml, showToast } from '../ui/helpers.js';
import { iconHtml } from '../ui/icons.js';
import { render } from '../ui/router.js';
import { renderDayTodo, renderWeekTodo } from '../ui/todo-widgets.js';
import { mondayOf } from '../core/calendar.js';

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

// Page « Hebdo » : bloc manuel (sport, coucher avant 23h30, rigueur), bloc automatique (travail), to-do de la semaine.
export function renderHebdo(root) {
  const page = el('div', { class: 'page' });
  page.appendChild(el('div', { class: 'page-title' }, [el('h1', {}, 'Hebdo')]));

  const blockTitle = (title, sub, first = false) => el('div', { class: 'hebdo-block' + (first ? ' first' : ''), html: `${title}<span>${sub}</span>` });

  // ── BLOC MANUEL : ce que tu règles ou coches toi-même ─────────────
  page.appendChild(blockTitle('Manuel', 'à régler et à cocher', true));

  page.appendChild(el('h3', { class: 'mb-1', html: iconHtml('run') + ' Sport' }));
  page.appendChild(el('div', { class: 'dim text-xs mb-2' }, 'Sorties de course de la semaine'));
  const sportWrap = el('div', { class: 'flex col gap-2 mb-5' });
  page.appendChild(sportWrap);

  page.appendChild(el('h3', { class: 'mb-1', html: iconHtml('moon') + ' Coucher avant 23h30' }));
  page.appendChild(el('div', { class: 'dim text-xs mb-2' }, 'Coche chaque nuit tenue.'));
  const sleepWrap = el('div', { class: 'flex col gap-2 mb-5' });
  page.appendChild(sleepWrap);

  page.appendChild(el('h3', { class: 'mb-1', html: iconHtml('scale') + ' Rigueur' }));
  page.appendChild(el('div', { class: 'dim text-xs mb-2' }, 'Pourcentage d\'XP de la semaine retiré à son terme.'));
  const rigueurWrap = el('div', { class: 'flex col gap-2 mb-5' });
  page.appendChild(rigueurWrap);

  // ── BLOC AUTOMATIQUE : calculé depuis ton temps de travail ────────
  page.appendChild(blockTitle('Automatique', 'calculé pour toi'));

  page.appendChild(el('h3', { class: 'mb-1', html: iconHtml('books') + ' Travail' }));
  page.appendChild(el('div', { class: 'dim text-xs mb-2' },
    arePenaltiesActive()
      ? 'Malus si non atteint · bonus si dépassé.'
      : `À partir du ${formatDate(PENALTIES_START)} : malus si non atteint, bonus si dépassé.`));
  const travailWrap = el('div', { class: 'flex col gap-2 mb-5' });
  page.appendChild(travailWrap);

  page.appendChild(el('h3', { class: 'mb-2', html: iconHtml('check') + ' To-do de la semaine' }));
  const todoWrap = el('div', { class: 'mb-5' });
  page.appendChild(todoWrap);

  root.appendChild(page);
  return Promise.all([
    renderRigueurSection(rigueurWrap),
    renderWeekTodo(todoWrap, mondayOf(todayKey())),
    renderWeeklyQuestsFiltered(sportWrap, ['wq-runs']),
    renderWeeklyQuestsFiltered(sleepWrap, ['wq-sleep']),
    renderWeeklyQuestsFiltered(travailWrap, ['wq-work', 'wq-langues', 'wq-lettres', 'wq-si'])
  ]);
}

// Variante de renderWeeklyQuests qui filtre par liste d'IDs (au lieu de catégorie main/secondary).
export async function renderWeeklyQuestsFiltered(root, questIds) {
  const wks = State.quests.filter(q =>
    (q.type === 'weekly-hours' || q.type === 'weekly-count') && questIds.includes(q.id)
  );
  // Réutilise la logique de renderWeeklyQuests mais avec un set explicite
  root.innerHTML = '';
  for (const q of wks) {
    await _renderOneQuest(root, q, null);
  }
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
  const actualMinutes = workLog?.totalMinutes || 0;
  const goalHours = todayPlan.workHours || 0;
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
      ? '✓ Sortie validée'
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

  let workBlock = '';
  if (goalHours > 0) {
    const workDone = wi.ratio >= 1;
    workBlock = `
      <div class="block work ${workDone ? 'done' : ''}">
        <div class="block-icon">${iconHtml('books')}</div>
        <div class="block-body">
          <div class="flex between">
            <div class="block-title">Travail · objectif ${goalHours}h${workDone ? ' <span class="pill warm" style="margin-left:8px;">✓</span>' : ''}</div>
            <div class="work-pct" style="color:${barColor};">${Math.round(wi.ratio * 100)}%</div>
          </div>
          <div class="work-bar">
            <div class="work-fill" style="width:${Math.min(100, progress * 100)}%; background:${barColor};"></div>
          </div>
          <div class="dim text-xs mt-1">
            ${formatMinutes(actualMinutes)} / ${goalHours}h
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
        <div class="dim text-xs">${isToday ? 'Aujourd\'hui' : 'Jour modifié'} · ${dayLabel}</div>
        ${wi.ratio >= 1 ? '<span class="text-xs" style="color:var(--accent);">Objectif atteint ✓</span>' : ''}
      </div>
      <div class="day-picker">
        <button class="btn ghost sm" id="dp-prev" aria-label="Jour précédent" ${dateKey <= GHOST_BEFORE ? 'disabled' : ''}>‹</button>
        <input class="input" id="dp-date" type="date" min="${GHOST_BEFORE}" max="${todayKey()}" value="${dateKey}" />
        <button class="btn ghost sm" id="dp-next" aria-label="Jour suivant" ${isToday ? 'disabled' : ''}>›</button>
        ${isToday ? '' : '<button class="btn ghost sm" id="dp-today">Aujourd\'hui</button>'}
      </div>
      ${!isToday && !inCurrentWeek ? '<div class="dim text-xs day-warn">Semaine passée : quêtes, malus et bonus de cette semaine sont recalculés automatiquement.</div>' : ''}
      ${sportBlock}
      ${workBlock}
    </div>
  `;

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

export async function renderWeeklyQuests(root, category = null) {
  const wks = State.quests.filter(q =>
    (q.type === 'weekly-hours' || q.type === 'weekly-count') &&
    (category == null || q.category === category)
  );
  root.innerHTML = '';
  for (const q of wks) {
    await _renderOneQuest(root, q, category);
  }
}

// Rendu d'une carte quête individuelle. Utilisé par renderWeeklyQuests et renderWeeklyQuestsFiltered.
export async function _renderOneQuest(root, q, category) {
  const c = await getCurrentCompletion(q);
  const actual = c?.actualValue || 0;
  const xp = c?.lastXp || 0;
  const ratio = c?.ratio || 0;
  const isHours = q.type === 'weekly-hours';
  const goal = isHours ? q.goalHours : (q.id === 'wq-runs' ? await runsGoalFor(weekKey(), q) : q.goalCount);
  const unit = isHours ? 'h' : (q.unit || 'fois');
  const progress = goal > 0 ? Math.min(1, actual / (isHours ? goal * 60 : goal)) : 0;
  const isAuto = q.autoFromActivities || q.autoFromWorkLog || q.autoFromLangues || q.autoFromLettres || q.autoFromSi || q.autoFromSleep;

  let forecast = '';
  if (arePenaltiesActive()) {
    if (q.category === 'main') {
      const f = malusFactorFromRatio(ratio);
      if (f > 0) {
        forecast = `<span class="hq-malus">−${Math.round(f * 100)}% XP semaine prévu</span>`;
      }
    } else if (q.category === 'secondary') {
      const f = bonusFactorFromRatio(ratio);
      const mf = usesFullMalusRules(weekKey()) ? malusFactorFromRatio(ratio) : 0;
      if (mf > 0) {
        forecast = `<span class="hq-malus">−${Math.round(mf * 100)}% XP semaine prévu</span>`;
      } else if (f > 0) {
        const fullXp = questFullXp(q);
        const bonusXp = Math.round(fullXp * f);
        forecast = `<span class="hq-bonus">+${bonusXp} XP bonus</span>`;
      }
    }
  }

  const div = el('div', {
    class: 'hq' + (ratio >= 1 ? ' done' : ''),
    style: `--hq-c: ${q.color || '#D08A4E'};`
  });
  div.innerHTML = `
    <div class="hq-head">
      <span class="hq-icon">${iconHtml(q.icon)}</span>
      <div class="hq-titles">
        <div class="hq-title">${escapeHtml(q.title)}</div>
        <div class="hq-goal">Objectif : ${goal} ${unit}${isAuto ? '<span class="auto-tag">auto</span>' : ''}</div>
      </div>
      <div class="hq-pct" style="color:${q.color}">${Math.round(ratio * 100)}%</div>
    </div>
    <div class="hq-bar">
      <div class="hq-fill" style="width:${Math.min(100, progress * 100)}%; background:${q.color};"></div>
    </div>
    <div class="hq-info">
      ${isHours
        ? `<span class="dim text-xs">${formatMinutes(actual)} / ${goal}h</span>`
        : `<span class="dim text-xs">${actual} / ${goal} ${unit}</span>`}
      ${xp > 0 ? `<span class="hq-xp">+${xp} XP</span>` : '<span></span>'}
    </div>
    ${forecast ? `<div class="hq-forecast">${forecast}</div>` : ''}
  `;

  if (!isAuto) {
    if (isHours) {
      const row = el('div', { class: 'hq-input-row' });
      const input = el('input', {
        class: 'input', type: 'text',
        placeholder: 'ex: 2h30, 1.5',
        value: actual ? formatMinutes(actual) : ''
      });
      const btn = el('button', { class: 'btn primary sm' }, 'Valider');
      const save = async () => {
        const min = parseTimeInput(input.value);
        await setQuestValue(q, min);
        await loadAll();
        render();
        showToast({ type: 'xp', title: 'Mis à jour', text: q.title });
      };
      btn.addEventListener('click', save);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
      row.appendChild(input);
      row.appendChild(btn);
      div.appendChild(row);
    } else {
      const row = el('div', { class: 'hq-count-row' });
      const minus = el('button', { class: 'cnt-btn' }, '−');
      const val = el('div', { class: 'cnt-val' }, String(actual));
      const plus = el('button', { class: 'cnt-btn plus' }, '+');
      minus.disabled = actual <= 0;
      const change = async (delta) => {
        const nv = Math.max(0, actual + delta);
        await setQuestValue(q, nv);
        await loadAll();
        render();
      };
      minus.addEventListener('click', () => change(-1));
      plus.addEventListener('click', () => change(+1));
      row.appendChild(minus);
      row.appendChild(val);
      row.appendChild(plus);
      div.appendChild(row);
    }
  }

  // Quête « Couché avant 23h30 » : compteur de la semaine en cours uniquement.
  if (q.id === 'wq-sleep') {
    const sleepLog = await getSleepLog();
    const dayKeys = weekDateKeys(weekKey(new Date()));
    const eligible = dayKeys.filter(k => k <= todayKey() && k >= GHOST_BEFORE);
    const ticked = eligible.filter(k => sleepLog[k]);
    const free = eligible.filter(k => !sleepLog[k]);
    const row = el('div', { class: 'sleep-wrap' });
    row.innerHTML = `
      <div class="sleep-row">
        <div class="hq-count-row sleep-counter">
          <button class="cnt-btn" id="sl-minus" ${ticked.length ? '' : 'disabled'} aria-label="Retirer une nuit">−</button>
          <div class="cnt-val">${ticked.length}/7</div>
          <button class="cnt-btn plus" id="sl-plus" ${free.length ? '' : 'disabled'} aria-label="Ajouter une nuit">+</button>
        </div>
      </div>
      <div class="dim text-xs sleep-cap">Cette semaine · appuie sur + pour ajouter une nuit couché avant 23h30</div>`;
    // + ajoute la nuit la plus récente encore non cochée ; − retire la dernière cochée.
    row.querySelector('#sl-plus').addEventListener('click', async () => {
      if (!free.length) return;
      await toggleSleepNight(free[free.length - 1]);
      await loadAll();
      render();
    });
    row.querySelector('#sl-minus').addEventListener('click', async () => {
      if (!ticked.length) return;
      await toggleSleepNight(ticked[ticked.length - 1]);
      await loadAll();
      render();
    });
    div.appendChild(row);
  }

  // Quête « Sorties course » : je choisis mon nombre de sorties de la semaine ;
  // si je n'en fais aucune, le malus ne saute qu'avec une justification (malade, autre).
  if (q.id === 'wq-runs') {
    const gRow = el('div', { class: 'hq-goal-pick' });
    gRow.innerHTML = '<div class="dim text-xs">Mon objectif de la semaine (sorties)</div>';
    const ctr = el('div', { class: 'hq-count-row' });
    const minus = el('button', { class: 'cnt-btn' }, '−');
    const val = el('div', { class: 'cnt-val' }, String(goal));
    const plus = el('button', { class: 'cnt-btn plus' }, '+');
    minus.disabled = goal <= 1;
    plus.disabled = goal >= RUNS_GOAL_MAX;
    const changeGoal = async (delta) => {
      await setRunsGoal(weekKey(), goal + delta);
      await loadAll();
      render();
    };
    minus.addEventListener('click', () => changeGoal(-1));
    plus.addEventListener('click', () => changeGoal(+1));
    ctr.appendChild(minus); ctr.appendChild(val); ctr.appendChild(plus);
    gRow.appendChild(ctr);
    div.appendChild(gRow);
  }
  if (q.id === 'wq-runs' && arePenaltiesActive()) {
    const excuses = await getMalusExcuses();
    const cur = excuses[`${weekKey()}|${q.id}`];
    const row = el('div', { class: 'hq-excuse-row' });
    row.innerHTML = cur
      ? `<span class="hq-excused">✓ Justifié : ${cur.reason === 'malade' ? 'malade' : 'autre'}</span>`
      : '<span></span>';
    const eb = el('button', { class: 'btn ghost sm' }, cur ? 'Modifier' : 'Justifier une semaine sans sortie');
    eb.addEventListener('click', () => showRunsExcuseModal(q));
    row.appendChild(eb);
    div.appendChild(row);
  }

  root.appendChild(div);
}

// Section « Rigueur » : carte auto-sanctions.
export async function renderRigueurSection(root) {
  root.innerHTML = '';
  const wk = weekKey();
  const weekXp = await xpEarnedInWeek(wk);
  const selfAll = await getSelfMalus();
  const entries = selfAll[wk] || [];
  const selfPct = Math.min(SELF_PCT_CAP, entries.reduce((a, e) => a + (e.percent || 0), 0));
  const xpOf = (pct) => Math.round(weekXp * pct / 100);

  // ── Carte 1 : mes écarts ──
  const c1 = el('div', { class: 'card rg-card' });
  c1.innerHTML = `
    <div class="rg-head">
      <div><div class="rg-title">${iconHtml('bandage')} Mes écarts</div>
      <div class="dim text-xs">Une mauvaise action ? Inflige-toi un malus.</div></div>
      <div class="rg-total">${selfPct ? '−' + selfPct + '%' : '—'}</div>
    </div>
    <div class="rg-list">
      ${entries.length ? entries.map(e => `
        <div class="rg-row" data-id="${e.id}">
          <span class="rg-reason">${escapeHtml(e.reason)}</span>
          <span class="rg-pct">−${e.percent}%</span>
          <button class="rg-del" aria-label="Supprimer">✕</button>
        </div>`).join('') : '<div class="dim text-xs">Aucun écart déclaré cette semaine.</div>'}
    </div>
    ${selfPct ? `<div class="dim text-xs mt-2">Impact estimé : −${xpOf(selfPct)} XP (sur ${weekXp} XP gagnés cette semaine)</div>` : ''}
    <button class="btn ghost sm mt-2" id="rg-add">+ Ajouter un écart</button>
  `;
  root.appendChild(c1);

  // Événements
  c1.querySelectorAll('.rg-del').forEach(b => b.addEventListener('click', async () => {
    const id = b.closest('.rg-row').dataset.id;
    const all = await getSelfMalus();
    all[wk] = (all[wk] || []).filter(e => e.id !== id);
    await saveSelfMalus(all);
    renderRigueurSection(root);
  }));
  c1.querySelector('#rg-add').addEventListener('click', () => showSelfMalusModal(wk, () => renderRigueurSection(root)));
}

// Modal : déclarer un écart (motif + pourcentage).
export function showSelfMalusModal(wk, onDone) {
  const overlay = el('div', { class: 'gpx-preview-overlay' });
  const modal = el('div', { class: 'gpx-preview-modal' });
  modal.innerHTML = `
    <div class="gpx-preview-head">
      <div class="gpx-preview-title"><span class="gpx-preview-icon">${iconHtml('bandage')}</span><span>Déclarer un écart</span></div>
      <button class="gpx-preview-close" aria-label="Fermer">✕</button>
    </div>
    <div style="padding: 16px 18px;">
      <label class="dim text-xs" style="display:block; margin-bottom:6px;">Qu'est-ce qui n'allait pas ?</label>
      <input class="input" id="sm-reason" type="text" maxlength="80" placeholder="ex : soirée jeux au lieu de réviser" style="width:100%;" />
      <label class="dim text-xs" style="display:block; margin:14px 0 6px;">Malus : <b id="sm-val">10</b> % de l'XP de la semaine</label>
      <input id="sm-pct" type="range" min="1" max="30" value="10" style="width:100%;" />
      <div class="rg-chips">
        ${[5, 10, 15, 20, 30].map(v => `<button class="btn ghost sm" data-v="${v}">${v}%</button>`).join('')}
      </div>
      <p class="dim text-xs mt-3">Appliqué à la fin de la semaine. Tu peux le supprimer d'ici là.</p>
    </div>
    <div class="gpx-preview-actions">
      <button class="btn primary" id="sm-save">Ajouter</button>
    </div>
  `;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  modal.querySelector('.gpx-preview-close').addEventListener('click', close);
  const range = modal.querySelector('#sm-pct'), val = modal.querySelector('#sm-val');
  range.addEventListener('input', () => { val.textContent = range.value; });
  modal.querySelectorAll('[data-v]').forEach(b => b.addEventListener('click', () => { range.value = b.dataset.v; val.textContent = b.dataset.v; }));
  modal.querySelector('#sm-save').addEventListener('click', async () => {
    const reason = modal.querySelector('#sm-reason').value.trim();
    if (!reason) { showToast({ type: 'err', title: 'Motif requis', text: 'Décris brièvement l\'écart.' }); return; }
    const all = await getSelfMalus();
    (all[wk] = all[wk] || []).push({ id: Date.now().toString(36), percent: parseInt(range.value), reason, createdAt: new Date().toISOString() });
    await saveSelfMalus(all);
    close();
    onDone && onDone();
  });
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
      <button class="gpx-preview-close" aria-label="Fermer">✕</button>
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
