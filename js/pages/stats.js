// Page Statistiques
import { todayKey, weekKey } from '../core/dates.js';

import { State } from '../core/state.js';
import { sportOn } from '../features/prefs.js';

import { formatDuration } from '../features/gpx.js';

import { RECORD_TYPES, activityVO2maxPoints, formatRecordValue, getRollingRecords } from '../features/records.js';

import { SUBJECTS, formatMinutes } from '../features/work.js';

import { el } from '../ui/helpers.js';

import { iconHtml, subjColor } from '../ui/icons.js';
import { render } from '../ui/router.js';


export function renderStats(root) {
  const page = el('div', { class: 'page' });
  page.appendChild(el('div', { class: 'page-title' }, [el('h1', {}, 'Stats')]));

  const acts = State.activities;
  const logs = State.workLogs;

  // Travail
  const totalWorkMin = logs.reduce((s, l) => s + (l.totalMinutes || 0), 0);
  const bestDayMin = logs.reduce((m, l) => Math.max(m, l.totalMinutes || 0), 0);
  const workDays = logs.filter(l => (l.totalMinutes || 0) > 0).length;
  const workByWeek = {};
  for (const l of logs) {
    const wk = weekKey(new Date(l.date));
    workByWeek[wk] = (workByWeek[wk] || 0) + (l.totalMinutes || 0);
  }
  const bestWeekMin = Math.max(0, ...Object.values(workByWeek));
  const weekValues = Object.values(workByWeek);
  const avgWeekMin = weekValues.length > 0
    ? weekValues.reduce((s, v) => s + v, 0) / weekValues.length
    : 0;
  // Progression : moyenne des 4 dernières semaines vs les 4 précédentes
  const sortedWeeks = Object.entries(workByWeek).sort((a, b) => a[0].localeCompare(b[0]));
  const recent4 = sortedWeeks.slice(-4).map(e => e[1]);
  const prev4 = sortedWeeks.slice(-8, -4).map(e => e[1]);
  const recent4Avg = recent4.length > 0 ? recent4.reduce((s, v) => s + v, 0) / recent4.length : 0;
  const prev4Avg = prev4.length > 0 ? prev4.reduce((s, v) => s + v, 0) / prev4.length : 0;
  const trendPct = prev4Avg > 0 ? Math.round((recent4Avg - prev4Avg) / prev4Avg * 100) : 0;

  page.appendChild(el('h3', { class: 'section-h work', html: iconHtml('books') + ' Travail' }));
  page.appendChild(el('div', { class: 'card mb-3', html: `
    <div class="totals">
      <div><div class="t-val grad-text">${(totalWorkMin/60).toFixed(1)}</div><div class="t-lbl">heures cumulées</div></div>
      <div><div class="t-val grad-text">${(avgWeekMin/60).toFixed(1)}</div><div class="t-lbl">moy. / semaine (h)</div></div>
      <div><div class="t-val grad-text">${(totalWorkMin/60/Math.max(1,workDays)).toFixed(1)}</div><div class="t-lbl">moy. / jour actif (h)</div></div>
      <div><div class="t-val grad-text" style="color: ${trendPct >= 0 ? 'var(--accent)' : 'var(--danger)'}">${trendPct >= 0 ? '+' : ''}${trendPct}%</div><div class="t-lbl">tendance 4 sem.</div></div>
    </div>
  `}));

  // Heatmap calendaire — visualise la régularité sur 12 semaines
  page.appendChild(el('div', { class: 'chart-card mb-3' }, [
    el('div', { class: 'chart-title', html: iconHtml('calendar') + ' Régularité · 12 dernières semaines' }),
    el('div', { class: 'work-heatmap', id: 'work-heatmap' })
  ]));

  // Graph: répartition matières (30 derniers jours)
  page.appendChild(el('div', { class: 'chart-card mb-3' }, [
    el('div', { class: 'chart-title', html: iconHtml('target') + ' Répartition des matières · 30 derniers jours' }),
    el('div', { class: 'chart-wrap chart-wrap-donut' }, [el('canvas', { id: 'chart-work-subjects' })])
  ]));

  page.appendChild(el('h3', { class: 'mb-2', html: iconHtml('trophy') + ' Records de travail' }));
  page.appendChild(el('div', { class: 'card mb-5', html: `
    <div class="rec-row"><div class="rec-left"><span class="rec-icon">${iconHtml('calendar')}</span><span class="rec-label">Plus grosse journée</span></div><div class="rec-value">${bestDayMin > 0 ? formatMinutes(bestDayMin) : '—'}</div></div>
    <div class="rec-row"><div class="rec-left"><span class="rec-icon">${iconHtml('calendar')}</span><span class="rec-label">Plus grosse semaine</span></div><div class="rec-value">${bestWeekMin > 0 ? (bestWeekMin/60).toFixed(1) + 'h' : '—'}</div></div>
  `}));

  if (sportOn()) {   // sans sport : ni statistiques ni records sportifs
  // Sport — refonte complète : focus sur les métriques runner
  const totalKm = acts.reduce((s, a) => s + (a.distanceKm || 0), 0);
  const totalDplus = acts.reduce((s, a) => s + (a.elevGain || 0), 0);
  const totalDur = acts.reduce((s, a) => s + (a.duration || 0), 0);

  page.appendChild(el('h3', { class: 'section-h sport', html: iconHtml('run') + ' Sport' }));
  page.appendChild(el('div', { class: 'card mb-3', html: `
    <div class="totals">
      <div><div class="t-val grad-text">${totalKm.toFixed(1)}</div><div class="t-lbl">km cumulés</div></div>
      <div><div class="t-val grad-text">${Math.round(totalDplus)}</div><div class="t-lbl">m de D+</div></div>
      <div><div class="t-val grad-text">${totalDur > 0 ? formatDuration(totalDur) : '0 h'}</div><div class="t-lbl">temps en sport</div></div>
      <div><div class="t-val grad-text">${acts.length}</div><div class="t-lbl">sorties</div></div>
    </div>
  `}));

  // ── Records absolus / 30j / 90j ────────────────────────────────────────
  const r30 = getRollingRecords(acts, 30);
  const r90 = getRollingRecords(acts, 90);
  const rAll = getRollingRecords(acts, 99999);
  const fmtT = (s) => {
    if (!s) return '—';
    const m = Math.floor(s / 60), sec = Math.round(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };
  page.appendChild(el('h3', { class: 'mb-2 mt-4', html: iconHtml('trophy') + ' Records glissants' }));
  page.appendChild(el('div', { class: 'card mb-3', html: `
    <div class="rolling-table">
      <div class="rolling-header"><div></div><div>Absolu</div><div>90 j</div><div>30 j</div></div>
      <div class="rolling-row"><div class="rolling-dist">1 km</div><div class="mono">${fmtT(rAll.best1k)}</div><div class="mono">${fmtT(r90.best1k)}</div><div class="mono">${fmtT(r30.best1k)}</div></div>
      <div class="rolling-row"><div class="rolling-dist">5 km</div><div class="mono">${fmtT(rAll.best5k)}</div><div class="mono">${fmtT(r90.best5k)}</div><div class="mono">${fmtT(r30.best5k)}</div></div>
      <div class="rolling-row"><div class="rolling-dist">10 km</div><div class="mono">${fmtT(rAll.best10k)}</div><div class="mono">${fmtT(r90.best10k)}</div><div class="mono">${fmtT(r30.best10k)}</div></div>
      <div class="rolling-row"><div class="rolling-dist">Semi</div><div class="mono">${fmtT(rAll.bestSemi)}</div><div class="mono">${fmtT(r90.bestSemi)}</div><div class="mono">${fmtT(r30.bestSemi)}</div></div>
    </div>
  `}));

  // ── Records personnels (existant, fin de page) ─────────────────────────
  page.appendChild(el('h3', { class: 'mb-2 mt-4', html: iconHtml('trophy') + ' Records sportifs' }));
  let recsHtml = '';
  for (const t of RECORD_TYPES) {
    const r = State.records[t.id];
    recsHtml += `
      <div class="rec-row">
        <div class="rec-left"><span class="rec-icon">${iconHtml(t.icon)}</span><span class="rec-label">${t.label}</span></div>
        <div class="rec-value">${r ? formatRecordValue(t, r.value) : '—'}</div>
      </div>
    `;
  }
  page.appendChild(el('div', { class: 'card mb-3', html: recsHtml }));
  }

  root.appendChild(page);

  // Graphes tracés tout de suite (le contenu est déjà dans la page) : rien ne saute après l'affichage.
  renderStatsCharts(logs, acts);
}

// Helpers de styling Chart.js cohérents avec la palette Orion.
const isLight = () => document.documentElement.dataset.theme === 'light';
export const CHART_COLORS = {
  get text() { return isLight() ? '#5E5242' : '#B8B2A7'; },
  get textMute() { return isLight() ? '#857A68' : '#8C8579'; },
  get grid() { return isLight() ? 'rgba(90, 70, 40, 0.14)' : 'rgba(187, 166, 119, 0.12)'; },
  get gold() { return isLight() ? '#8E5128' : '#E3B089'; },
  get goldFade() { return isLight() ? 'rgba(142, 81, 40, 0.16)' : 'rgba(230,195,106, 0.18)'; },
  warm: '#D08A4E',
  cool: '#C8814A',
  violet: '#b0705a',
  pink: '#B5703B',
  get bg() { return isLight() ? '#FBF8F2' : '#1E1E1E'; }
};

export function chartCommonOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: CHART_COLORS.text, font: { family: 'system-ui, -apple-system, sans-serif', size: 11 } } },
      tooltip: {
        backgroundColor: 'rgba(20,20,19,0.95)',
        titleColor: CHART_COLORS.gold,
        bodyColor: '#f0eee6',
        borderColor: 'rgba(230,195,106,0.2)',
        borderWidth: 1,
        padding: 10,
        displayColors: true,
        cornerRadius: 8
      }
    },
    scales: {
      x: {
        ticks: { color: CHART_COLORS.textMute, font: { size: 10 } },
        grid: { color: CHART_COLORS.grid, drawBorder: false }
      },
      y: {
        ticks: { color: CHART_COLORS.textMute, font: { size: 10 } },
        grid: { color: CHART_COLORS.grid, drawBorder: false },
        beginAtZero: true
      }
    }
  };
}

export function renderStatsCharts(logs, acts) {
  // Détruit les anciennes instances pour permettre un re-render propre.
  for (const inst of Object.values(State.charts || {})) {
    try { inst?.destroy(); } catch {}
  }
  State.charts = {};
  if (window.Chart) Chart.defaults.animation = false;   // pas de tracé animé : les graphes apparaissent déjà formés

  // Travail : heatmap calendaire + donut matières
  renderWorkHeatmap(logs);
  if (!window.Chart) return;
  renderSubjectsDonut(logs);

  // Sport : courbe VO2max
  if (sportOn()) renderVO2maxChart(acts);
}

// Courbe d'évolution du VO2max (extraite de chaque sortie chronométrée).
export function renderVO2maxChart(acts) {
  const ctx = document.getElementById('chart-vo2');
  if (!ctx) return;
  const points = activityVO2maxPoints(acts);
  if (points.length < 2) return;
  const labels = points.map(p => new Date(p.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }));
  const data = points.map(p => p.vo2);
  const ctxC = ctx.getContext('2d');
  const grad = ctxC.createLinearGradient(0, 0, 0, 160);
  grad.addColorStop(0, 'rgba(200,129,74, 0.4)');
  grad.addColorStop(1, 'rgba(200,129,74, 0)');
  State.charts.vo2 = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'VO₂max',
        data,
        borderColor: CHART_COLORS.violet,
        backgroundColor: grad,
        borderWidth: 2.5,
        tension: 0.35,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: '#E3B089',
        pointBorderColor: CHART_COLORS.bg,
        pointBorderWidth: 1.5,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...chartCommonOptions().plugins.tooltip,
          callbacks: {
            labelColor: (c) => { const col = c.dataset.backgroundColor[c.dataIndex]; return { borderColor: col, backgroundColor: col, borderWidth: 0, borderRadius: 3 }; },
            label: (c) => `${c.parsed.y} ml/kg/min`,
            title: (items) => points[items[0].dataIndex].name || items[0].label
          }
        }
      },
      scales: {
        x: { ticks: { color: CHART_COLORS.textMute, font: { size: 10 }, maxRotation: 0 }, grid: { display: false } },
        y: { ticks: { color: CHART_COLORS.textMute, font: { size: 10 } }, grid: { color: CHART_COLORS.grid, drawBorder: false } }
      }
    }
  });
}

// Heatmap style GitHub : 12 semaines × 7 jours, intensité selon heures travaillées.
export function renderWorkHeatmap(logs) {
  const root = document.getElementById('work-heatmap');
  if (!root) return;
  const today = new Date(); today.setHours(0,0,0,0);
  // Trouve le lundi de la semaine actuelle, recule de 11 semaines → début de grille.
  const day = today.getDay();
  const diffToMonday = (day === 0 ? -6 : 1) - day;
  const thisMonday = new Date(today); thisMonday.setDate(thisMonday.getDate() + diffToMonday);
  const startMonday = new Date(thisMonday); startMonday.setDate(startMonday.getDate() - 11 * 7);

  // Échelle d'intensité : 0, <2h, 2-4h, 4-6h, ≥6h.
  const bucket = (h) => {
    if (h <= 0) return 0;
    if (h < 2) return 1;
    if (h < 4) return 2;
    if (h < 6) return 3;
    return 4;
  };

  const cells = [];
  const monthLabels = [];
  let lastMonth = -1;
  for (let w = 0; w < 12; w++) {
    const colDays = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(startMonday);
      date.setDate(date.getDate() + w * 7 + d);
      const k = todayKey(date);
      const log = logs.find(l => l.date === k);
      const hours = (log?.totalMinutes || 0) / 60;
      const isFuture = date > today;
      colDays.push({ date, k, hours, level: bucket(hours), future: isFuture });
    }
    cells.push(colDays);
    // Label mois sur la première semaine où il change
    const firstOfWeek = colDays[0].date;
    const m = firstOfWeek.getMonth();
    if (m !== lastMonth) {
      monthLabels.push({ col: w, label: firstOfWeek.toLocaleDateString('fr-FR', { month: 'short' }) });
      lastMonth = m;
    } else {
      monthLabels.push(null);
    }
  }

  const dayLabels = ['L', '', 'M', '', 'V', '', 'D'];
  let html = '<div class="heatmap-grid">';
  // Ligne des labels de mois
  html += '<div class="heatmap-months">';
  html += '<div class="heatmap-corner"></div>';
  for (const m of monthLabels) {
    html += `<div class="heatmap-month">${m ? m.label : ''}</div>`;
  }
  html += '</div>';
  // Lignes : une par jour de la semaine
  for (let d = 0; d < 7; d++) {
    html += '<div class="heatmap-row">';
    html += `<div class="heatmap-daylabel">${dayLabels[d]}</div>`;
    for (let w = 0; w < 12; w++) {
      const cell = cells[w][d];
      const cls = cell.future ? 'future' : `lvl-${cell.level}`;
      const tip = cell.future
        ? ''
        : `${cell.date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} · ${cell.hours.toFixed(1)} h`;
      // data-key permet de retrouver le workLog au clic.
      const dataAttr = cell.future ? '' : `data-key="${cell.k}"`;
      html += `<div class="heatmap-cell ${cls}" title="${tip}" ${dataAttr}></div>`;
    }
    html += '</div>';
  }
  html += '</div>';
  // Légende
  html += `<div class="heatmap-legend">
    <span>moins</span>
    <div class="heatmap-cell lvl-0"></div>
    <div class="heatmap-cell lvl-1"></div>
    <div class="heatmap-cell lvl-2"></div>
    <div class="heatmap-cell lvl-3"></div>
    <div class="heatmap-cell lvl-4"></div>
    <span>plus</span>
  </div>`;
  root.innerHTML = html;

  // Click sur une cellule : popover détaillé (heures + matières).
  root.querySelectorAll('.heatmap-cell[data-key]').forEach(cellEl => {
    cellEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const k = cellEl.dataset.key;
      const log = logs.find(l => l.date === k);
      showHeatmapPopover(cellEl, k, log);
    });
  });
}

// Popover flottant qui affiche les détails d'une cellule heatmap.
export function showHeatmapPopover(anchorEl, dateKey, log) {
  // Ferme tout popover déjà ouvert.
  document.querySelectorAll('.heatmap-popover').forEach(p => p.remove());

  const date = new Date(dateKey + 'T00:00:00');
  const dateLabel = date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const totalMin = log?.totalMinutes || 0;
  const bySubject = log?.bySubject || {};
  let subjectsHtml = '';
  if (totalMin > 0) {
    const sorted = Object.entries(bySubject).filter(([_, m]) => m > 0).sort((a, b) => b[1] - a[1]);
    subjectsHtml = sorted.map(([k, m]) => {
      const meta = SUBJECTS[k];
      return `
        <div class="popover-subject">
          <span>${iconHtml(meta?.icon || 'book')} ${meta?.label || k}</span>
          <span class="mono">${formatMinutes(m)}</span>
        </div>
      `;
    }).join('');
  }

  const popover = el('div', { class: 'heatmap-popover' });
  popover.innerHTML = `
    <div class="popover-head">${dateLabel}</div>
    <div class="popover-total">${totalMin > 0 ? formatMinutes(totalMin) : 'Pas de travail enregistré'}</div>
    ${subjectsHtml ? `<div class="popover-subjects">${subjectsHtml}</div>` : ''}
  `;

  // Positionnement : sous la cellule, recentré horizontalement, avec marge bord d'écran.
  document.body.appendChild(popover);
  const rect = anchorEl.getBoundingClientRect();
  const popRect = popover.getBoundingClientRect();
  let left = rect.left + rect.width / 2 - popRect.width / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - popRect.width - 8));
  let top = rect.bottom + 6;
  if (top + popRect.height > window.innerHeight - 8) {
    top = rect.top - popRect.height - 6;
  }
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;

  // Fermeture au clic ailleurs / scroll / esc.
  const close = () => {
    popover.remove();
    document.removeEventListener('click', onDocClick, true);
    document.removeEventListener('scroll', close, true);
    document.removeEventListener('keydown', onEsc);
  };
  const onDocClick = (e) => {
    if (!popover.contains(e.target) && e.target !== anchorEl) close();
  };
  const onEsc = (e) => { if (e.key === 'Escape') close(); };
  setTimeout(() => {
    document.addEventListener('click', onDocClick, true);
    document.addEventListener('scroll', close, true);
    document.addEventListener('keydown', onEsc);
  }, 0);
}

export function renderSubjectsDonut(logs) {
  const ctx = document.getElementById('chart-work-subjects');
  if (!ctx) return;
  const today = new Date(); today.setHours(0,0,0,0);
  const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() - 30);
  const cutoffK = todayKey(cutoff);
  const totals = {};
  for (const l of logs) {
    if (l.date < cutoffK) continue;
    for (const [subj, mins] of Object.entries(l.bySubject || {})) {
      totals[subj] = (totals[subj] || 0) + mins;
    }
  }
  const entries = Object.entries(totals).filter(([_, m]) => m > 0);
  if (entries.length === 0) {
    ctx.parentElement.innerHTML = '<div class="chart-empty">Pas encore de données</div>';
    return;
  }
  const palette = {
    maths: subjColor('maths'),
    physique: subjColor('physique'),
    si: subjColor('si'),
    langues: subjColor('langues'),
    francais: subjColor('francais'),
    autre: '#7d7664'
  };
  const totalH = entries.reduce((s, [_, m]) => s + m, 0) / 60;
  State.charts.subjects = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: entries.map(([s]) => SUBJECTS[s]?.label || s),
      datasets: [{
        data: entries.map(([_, m]) => Math.round(m / 60 * 10) / 10),
        backgroundColor: entries.map(([s]) => palette[s] || '#999'),
        hoverBackgroundColor: entries.map(([s]) => palette[s] || '#999'),   // la couleur ne s'éclaircit plus au toucher
        borderColor: CHART_COLORS.bg,
        borderWidth: 3,
        hoverOffset: 10,
        hoverBorderColor: CHART_COLORS.bg
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: { position: 'right', labels: { color: CHART_COLORS.text, font: { size: 11 }, boxWidth: 10, padding: 10, usePointStyle: true, pointStyle: 'circle' } },
        tooltip: {
          ...chartCommonOptions().plugins.tooltip,
          callbacks: {
            labelColor: (c) => { const col = c.dataset.backgroundColor[c.dataIndex]; return { borderColor: col, backgroundColor: col, borderWidth: 0, borderRadius: 3 }; },
            label: (c) => {
              const pct = totalH > 0 ? Math.round(c.parsed / totalH * 100) : 0;
              return `${c.label} · ${c.parsed} h (${pct}%)`;
            }
          }
        }
      }
    }
  });
}
