// Panneaux « Notes » de Hebdo : pour chaque caractéristique, ses sous-matières (réalisé / objectif, poids,
// sous-note, apport) dont la somme donne le score de la semaine, puis la note projetée sur 20.
// Lecture seule : tout vient de projectCurrentWeek() (caracs.js), le même calcul que l'historique.
import { CARACS, getCaracSettings, projectCurrentWeek } from '../features/caracs.js';
import { SUBJECTS, formatHours, formatMinutes } from '../features/work.js';
import { el } from '../ui/helpers.js';
import { COLORS, iconHtml } from '../ui/icons.js';

const ORDER = ['dex', 'disc', 'math', 'phys', 'si', 'verb'];
const LABEL = { volume: 'Sorties', regularite: 'Régularité', heures: 'Heures', quetes: 'Quêtes tenues', todo: 'To-do faite', sommeil: 'Sommeil (avant 23h30)' };
const f1 = (n) => n.toFixed(1).replace('.', ',');
const clampPct = (x) => Math.max(0, Math.min(100, x));

// Texte de la valeur et remplissage de la barre d'une sous-matière.
function measure(info) {
  if (!info) return { text: '', ratio: 0 };
  if (info.kind === 'minutes') return { text: `${formatMinutes(info.value || 0)} / ${formatHours((info.goal || 0) / 60)}`, ratio: info.goal > 0 ? info.value / info.goal * 100 : 0 };
  if (info.kind === 'pct') return { text: `${Math.round((info.value || 0) * 100)} % de l'objectif`, ratio: (info.value || 0) * 100 };
  return { text: info.goal > 0 ? `${info.value ?? 0} / ${info.goal} ${info.unit || ''}`.trim() : `aucun ${info.unit ? info.unit.replace(/s$/, '') : 'élément'}`, ratio: info.goal > 0 ? info.value / info.goal * 100 : 0 };
}

function partHtml(c, multi, col) {
  const m = measure(c.info), mesurable = c.score != null && c.share > 0;
  const weight = multi && mesurable ? `<span class="cp-w">${Math.round(c.share * 100)} %</span>` : '';
  const sub = mesurable
    ? `sous-note ${f1(c.score)}${multi ? ` · apporte ${f1(c.contrib)}` : ''}${c.note ? ` · ${c.note}` : ''}`
    : `ignorée cette semaine${c.note ? ` (${c.note})` : ''} : son poids est reparti sur les autres`;
  let html = `
  <div class="cp-line"><span>${LABEL[c.key] || c.key} ${weight}</span><span class="cp-val">${m.text}</span></div>
  <div class="cp-bar"><div class="cp-fill" style="width:${clampPct(m.ratio)}%; background:${col};${mesurable ? '' : ' opacity:.35;'}"></div></div>
  <div class="cp-sub">${sub}</div>`;
  if (c.info?.parts?.length > 1) {
    html += `<div class="cp-sub">${c.info.parts.map(p => `${SUBJECTS[p.key]?.label || p.key} ${formatMinutes(p.minutes)}`).join(' · ')}</div>`;
  }
  return html;
}

export async function renderCaracPanels(root) {
  root.replaceChildren();
  const [proj, cfg] = await Promise.all([projectCurrentWeek(), getCaracSettings()]);
  for (const id of ORDER) {
    const c = CARACS.find(x => x.id === id), p = proj[id];
    const col = COLORS[c.icon] || c.color;
    const d = Math.round(p.projected * 10) / 10 - Math.round(p.current * 10) / 10;   // même arrondi que l'affichage
    const arrow = d > 0 ? '<span class="cr-up">▲</span>' : d < 0 ? '<span class="cr-down">▼</span>' : '<span class="cr-eq">=</span>';
    const multi = p.comps.length > 1;
    const total = multi ? `<div class="cp-total"><span>Score de la semaine</span><b style="color:${col}">${f1(p.S)} / 20</b></div>` : '';
    const card = el('div', { class: 'cp', style: `--hq-c:${col};` });
    card.innerHTML = `
      <div class="cp-head">
        <span class="cp-icon">${iconHtml(c.icon)}</span>
        <div class="cp-title">${c.label}</div>
        <div class="cp-note"><span class="dim">${f1(p.current)}</span> → <b style="color:${col}">${f1(p.projected)}</b> ${arrow}</div>
      </div>
      <div class="cp-body">${p.comps.map(x => partHtml(x, multi, col)).join('')}${total}</div>`;
    root.appendChild(card);
  }
  root.appendChild(el('div', { class: 'dim text-xs' }, `Note si la semaine s'arrêtait maintenant : ${Math.round(cfg.alpha * 100)} % de l'historique + ${Math.round((1 - cfg.alpha) * 100)} % du score de la semaine.`));
}
