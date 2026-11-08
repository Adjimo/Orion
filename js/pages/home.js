// Page Accueil
import { daysUntil, formatCountdown, formatDate, startOfWeek, todayKey } from '../core/dates.js';
import { State } from '../core/state.js';
import { SKILL_META, deriveLevel, getNextRank, getRank } from '../core/xp.js';
import { computeYearProgress } from '../features/exams.js';
import { formatMinutes } from '../features/work.js';
import { el, escapeHtml, progressBar } from '../ui/helpers.js';

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
  const rank = getRank(li.level);
  const nextR = getNextRank(li.level);

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

  // Header
  page.appendChild(el('div', { class: 'header' }, [
    el('div', { class: 'dim text-sm' }, greeting()),
    el('div', { class: 'text-2xl' }, p.name),
    rank ? el('div', { class: 'rank-pill', style: `--rank-c: ${rank.color};` }, '✦ ' + rank.title) : null
  ]));

  // Hero niveau
  page.appendChild(el('div', { class: 'card hero mb-3' }, [
    el('div', { class: 'flex between mb-3' }, [
      el('div', {}, [
        el('div', { class: 'dim text-xs' }, 'Niveau'),
        el('div', { class: 'text-3xl grad-text' }, String(li.level)),
        nextR ? el('div', { class: 'text-xs mute mt-1', html: `Encore ${nextR.levelsAway} niv. avant <strong style="color:${nextR.rank.color}">${escapeHtml(nextR.rank.title)}</strong>` }) : null
      ]),
      el('div', { style: 'text-align:right;' }, [
        el('div', { class: 'dim text-xs' }, 'Cette semaine'),
        el('div', { class: 'text-xl' }, formatMinutes(weekWorkMin)),
        el('div', { class: 'text-xs mute' }, `${weekActs.length} sortie${weekActs.length > 1 ? 's' : ''}`)
      ])
    ]),
    el('div', { class: '', html: progressBar(li.progress, 12) }),
    el('div', { class: 'flex between mt-2 text-xs dim' }, [
      el('span', {}, `${li.xpInLevel} / ${li.xpToNext} XP`),
      el('span', {}, `Total : ${p.totalXp} XP`)
    ])
  ]));

  // Countdown concours
  if (nextExam) {
    const yearProgress = computeYearProgress(nextExam.date);
    const yearPct = Math.round(yearProgress * 100);
    const pctColor = yearPct < 25 ? '#d8c797' : yearPct < 50 ? '#bba677' : yearPct < 75 ? '#d9a441' : '#a8742a';
    const urg = nextExam.days < 30 ? '#b8453a' : nextExam.days < 90 ? '#a8742a' : nextExam.days < 180 ? '#d9a441' : '#d8c797';

    page.appendChild(el('div', { class: 'mb-4', html: `
      <div class="cd-card">
        <div class="cd-main">
          <div class="cd-info">
            <div class="cd-label">Prochaine échéance</div>
            <div class="cd-name">${nextExam.icon} ${escapeHtml(nextExam.short)}</div>
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

  // Synthèse semaine
  page.appendChild(el('h3', { class: 'mb-3' }, 'Cette semaine'));

  page.appendChild(el('div', { class: 'dim text-xs mb-2' }, '🏃 Sport'));
  page.appendChild(el('div', { class: 'stats-grid mb-4', html: `
    <div class="stat"><div class="stat-val grad-text">${weekKm.toFixed(1)}</div><div class="stat-label">km</div></div>
    <div class="stat"><div class="stat-val grad-text">${weekActs.length}</div><div class="stat-label">sorties</div></div>
  `}));

  page.appendChild(el('div', { class: 'dim text-xs mb-2' }, '📚 Travail'));
  page.appendChild(el('div', { class: 'stats-grid mb-4', html: `
    <div class="stat"><div class="stat-val grad-text">${formatMinutes(todayWorkMin)}</div><div class="stat-label">aujourd'hui</div></div>
    <div class="stat"><div class="stat-val grad-text">${formatMinutes(weekWorkMin)}</div><div class="stat-label">cette semaine</div></div>
  `}));

  // Compétences
  page.appendChild(el('h3', { class: 'mb-2' }, 'Compétences'));
  const skillsHtml = Object.entries(p.skills).map(([k, sk]) => {
    const meta = SKILL_META[k];
    const info = deriveLevel(sk.xp);
    return `
      <div class="skill-card" style="--c: ${meta.color}">
        <div class="skill-top">
          <span class="skill-icon">${meta.icon}</span>
          <span class="skill-lvl" style="color:${meta.color}">Niv. ${info.level}</span>
        </div>
        <div class="skill-name">${meta.label}</div>
        ${progressBar(info.progress, 6)}
      </div>
    `;
  }).join('');
  page.appendChild(el('div', { class: 'skills mb-3', html: skillsHtml }));

  root.appendChild(page);
}
