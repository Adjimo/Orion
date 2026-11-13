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
  const fit = el('div', { class: 'home-fit' });   // en-tête + 3 blocs : occupe exactement l'écran
  page.appendChild(fit);

  // Header compact (nom modifiable, ancienneté, rouage Options)
  const editBtn = el('button', { class: 'btn ghost sm', 'aria-label': 'Modifier le nom', onclick: async () => {
    const name = prompt('Ton nom :', p.name);
    if (name && name.trim()) { p.name = name.trim(); await dbPut('profile', p); await loadAll(); render(); }
  }, html: iconHtml('pencil') });
  fit.appendChild(el('div', { class: 'header home-head flex between' }, [
    el('div', {}, [
      el('div', { class: 'dim text-xs home-since' }, `${greeting()} · membre depuis ${new Date(p.createdAt).toLocaleDateString('fr-FR')}`),
      el('div', { class: 'text-xl home-name' }, p.name)
    ]),
    el('div', { class: 'flex gap-2' }, [editBtn, el('button', { class: 'btn ghost sm', 'aria-label': 'Options', onclick: () => navigate('options'), html: iconHtml('gear') })])
  ]));

  // Deux blocs côte à côte : niveau (dégradé) et prochaine échéance, puis le graphique en dessous.
  const top = el('div', { class: 'home-top' });
  fit.appendChild(top);

  top.appendChild(el('div', { class: 'card hero hm-card hm-level', html: `
    <div>
      <div class="hm-label hm-label-row"><span>Niveau</span><span>${p.totalXp} XP</span></div>
      <div class="hm-big grad-text">${li.level}<span class="hm-of"> / ${MAX_LEVEL}</span></div>
    </div>
    <div>
      ${progressBar(li.progress, 8)}
      <div class="hm-sub mt-2">${li.max ? 'Niveau maximum atteint' : `${li.xpInLevel} / ${li.xpToNext} XP`}</div>
      ${li.max ? '' : `<div class="hm-sub mute">Niv. ${li.level + 1} dans ${li.xpToNext - li.xpInLevel} XP</div>`}
    </div>
  ` }));

  // Prochaine échéance
  if (nextExam) {
    const yearProgress = computeYearProgress(nextExam.date);
    const yearPct = Math.round(yearProgress * 100);
    const pctColor = yearPct < 25 ? '#E3B089' : yearPct < 50 ? '#C8814A' : yearPct < 75 ? '#D08A4E' : '#B5703B';
    const urg = nextExam.days < 30 ? '#b8453a' : nextExam.days < 90 ? '#B5703B' : nextExam.days < 180 ? '#D08A4E' : '#E3B089';
    top.appendChild(el('div', { class: 'cd-card hm-card', html: `
      <div class="cd-info">
        <div class="hm-label">Prochaine échéance</div>
        <div class="hm-name">${iconHtml(nextExam.icon)} ${escapeHtml(nextExam.short)}</div>
        <div class="hm-sub">${nextExam.endDate ? new Date(nextExam.date + 'T00:00:00').getDate() + ' – ' + formatDate(nextExam.endDate) : formatDate(nextExam.date)}</div>
      </div>
      <div class="hm-bottom">
        <div class="hm-days-row"><span class="hm-days" style="color:${pctColor};">${yearPct}<span class="hm-pct">%</span></span><span class="hm-sub">année écoulée</span></div>
        <div class="year-bar-wrap"><div class="year-bar"><div class="year-fill" style="width:${yearPct}%;"></div></div></div>
        <div class="hm-sub mt-2"><b style="color:${urg};">J-${nextExam.days}</b> avant échéance · ${formatCountdown(nextExam.days)}</div>
      </div>
    ` }));
  } else {
    top.firstChild.classList.add('full');
  }

  // Caractéristiques hebdomadaires (recalculées à la clôture de chaque semaine)
  const caracsBox = el('div', { class: 'home-radar' });
  fit.appendChild(caracsBox);
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
