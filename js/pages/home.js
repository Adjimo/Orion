// Page Accueil
import { daysUntil, formatCountdown, formatDate, startOfWeek, todayKey } from '../core/dates.js';
import { State } from '../core/state.js';
import { dbPut } from '../core/db.js';
import { MAX_LEVEL, deriveLevel } from '../core/xp.js';
import { computeYearProgress } from '../features/exams.js';
import { loadAll } from '../features/seed.js';
import { formatMinutes } from '../features/work.js';
import { el, escapeHtml, progressBar } from '../ui/helpers.js';
import { iconHtml } from '../ui/icons.js';
import { navigate, render } from '../ui/router.js';
import { renderCaracsCard } from './caracs-card.js';

export function greeting() {
  const h = new Date().getHours();
  if (h < 6) return 'Encore debout ?';
  if (h < 12) return 'Bonjour';
  if (h < 18) return 'Bon après-midi';
  if (h < 22) return 'Bonsoir';
  return 'Bonne nuit';
}

export function renderHome(root) {
  const p = State.profile;
  if (!p) return;
  const li = deriveLevel(p.totalXp);

  const ws = startOfWeek();
  const weekActs = State.activities.filter(a => new Date(a.date) >= ws);
  const weekKm = weekActs.reduce((s, a) => s + (a.distanceKm || 0), 0);
  const weekStart = todayKey(ws);
  const weekLogs = State.workLogs.filter(l => l.date >= weekStart);
  const weekWorkMin = weekLogs.reduce((s, l) => s + (l.totalMinutes || 0), 0);
  const todayLog = State.workLogs.find(l => l.date === todayKey());
  const todayWorkMin = todayLog?.totalMinutes || 0;

  const futureExams = State.exams
    .filter(e => e.enabled !== false)
    .map(e => ({ ...e, days: daysUntil(e.date) }))
    .filter(e => e.days >= 0)
    .sort((a, b) => a.days - b.days);
  const nextExam = futureExams[0];

  const page = el('div', { class: 'page' });

  // Header (nom modifiable, ancienneté, rouage Options)
  const editBtn = el('button', { class: 'btn ghost sm', 'aria-label': 'Modifier le nom', onclick: async () => {
    const name = prompt('Ton nom :', p.name);
    if (name && name.trim()) { p.name = name.trim(); await dbPut('profile', p); await loadAll(); render(); }
  }, html: iconHtml('pencil') });
  page.appendChild(el('div', { class: 'header flex between' }, [
    el('div', {}, [
      el('div', { class: 'dim text-sm' }, greeting()),
      el('div', { class: 'text-2xl' }, p.name),
      el('div', { class: 'dim text-xs mt-2' }, `Membre depuis ${formatDate(p.createdAt)}`)
    ]),
    el('div', { class: 'flex gap-2' }, [editBtn, el('button', { class: 'btn ghost sm', 'aria-label': 'Options', onclick: () => navigate('options'), html: iconHtml('gear') })])
  ]));

  // Hero niveau
  page.appendChild(el('div', { class: 'card hero mb-3' }, [
    el('div', { class: 'flex between mb-3' }, [
      el('div', {}, [
        el('div', { class: 'dim text-xs' }, 'Niveau'),
        el('div', { class: 'text-3xl grad-text' }, String(li.level) + ' / ' + MAX_LEVEL),
        el('div', { class: 'text-xs mute mt-1' }, li.max ? 'Niveau maximum atteint' : `Niveau ${li.level + 1} dans ${li.xpToNext - li.xpInLevel} XP`)
      ]),
      el('div', { style: 'text-align:right;' }, [
        el('div', { class: 'dim text-xs' }, 'Cette semaine'),
        el('div', { class: 'text-xl' }, formatMinutes(weekWorkMin)),
        el('div', { class: 'text-xs mute' }, `${weekActs.length} sortie${weekActs.length > 1 ? 's' : ''}`)
      ])
    ]),
    el('div', { class: '', html: progressBar(li.progress, 12) }),
    el('div', { class: 'flex between mt-2 text-xs dim' }, [
      el('span', {}, li.max ? 'Niveau maximum' : `${li.xpInLevel} / ${li.xpToNext} XP`),
      el('span', {}, `Total : ${p.totalXp} XP`)
    ])
  ]));

  // Countdown concours
  if (nextExam) {
    const yearProgress = computeYearProgress(nextExam.date);
    const yearPct = Math.round(yearProgress * 100);
    const pctColor = yearPct < 25 ? '#E3B089' : yearPct < 50 ? '#C8814A' : yearPct < 75 ? '#D08A4E' : '#B5703B';
    const urg = nextExam.days < 30 ? '#b8453a' : nextExam.days < 90 ? '#B5703B' : nextExam.days < 180 ? '#D08A4E' : '#E3B089';

    page.appendChild(el('div', { class: 'mb-4', html: `
      <div class="cd-card">
        <div class="cd-main">
          <div class="cd-info">
            <div class="cd-label">Prochaine échéance</div>
            <div class="cd-name">${iconHtml(nextExam.icon)} ${escapeHtml(nextExam.short)}</div>
            <div class="cd-date">${nextExam.endDate ? new Date(nextExam.date + 'T00:00:00').getDate() + ' – ' + formatDate(nextExam.endDate) : formatDate(nextExam.date)}</div>
          </div>
          <div class="cd-stats">
            <div class="cd-pct" style="color: ${pctColor};">${yearPct}<span class="pct-sign">%</span></div>
            <div class="cd-pct-label">année écoulée</div>
            <div class="cd-days" style="color: ${urg};">J-${nextExam.days}</div>
            <div class="cd-days-sub">${formatCountdown(nextExam.days)}</div>
          </div>
        </div>
        <div class="year-bar-wrap">
          <div class="year-bar"><div class="year-fill" style="width: ${yearPct}%;"></div></div>
        </div>
      </div>
    `}));
  }

  // Caractéristiques hebdomadaires (recalculées à la clôture de chaque semaine)
  const caracsBox = el('div');
  page.appendChild(caracsBox);
  renderCaracsCard(caracsBox).catch(err => console.error('Caracs card failed', err));

  // Synthèse semaine
  page.appendChild(el('h3', { class: 'mb-3' }, 'Cette semaine'));

  page.appendChild(el('div', { class: 'dim text-xs mb-2', html: iconHtml('run') + ' Sport' }));
  page.appendChild(el('div', { class: 'stats-grid mb-4', html: `
    <div class="stat"><div class="stat-val grad-text">${weekKm.toFixed(1)}</div><div class="stat-label">km</div></div>
    <div class="stat"><div class="stat-val grad-text">${weekActs.length}</div><div class="stat-label">sorties</div></div>
  `}));

  page.appendChild(el('div', { class: 'dim text-xs mb-2', html: iconHtml('books') + ' Travail' }));
  page.appendChild(el('div', { class: 'stats-grid mb-4', html: `
    <div class="stat"><div class="stat-val grad-text">${formatMinutes(todayWorkMin)}</div><div class="stat-label">aujourd'hui</div></div>
    <div class="stat"><div class="stat-val grad-text">${formatMinutes(weekWorkMin)}</div><div class="stat-label">cette semaine</div></div>
  `}));

  root.appendChild(page);
}
