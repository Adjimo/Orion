// Boîtes « Compétences » : une par caractéristique, sobres (même style que les cartes de Aujourd'hui).
// Chaque boîte = titre + note projetée, puis une barre par sous-matière (titre seul). Seule exception : Verbe garde
// le temps d'Anglais et de Français. Tout vient de projectCurrentWeek() (caracs.js), le même calcul que l'historique.
// extras = { <idCarac>: nœud DOM } : contrôles ajoutés en bas d'une boîte.
import { CARACS, projectCurrentWeek } from '../features/caracs.js';
import { SUBJECTS, formatHours, formatMinutes } from '../features/work.js';
import { CATEGORY_LABEL } from '../features/competences.js';
import { el } from '../ui/helpers.js';
import { COLORS, iconHtml } from '../ui/icons.js';

// Icônes des sous-matières : les mêmes que les anciennes cartes de quêtes hebdo.
const PICON = { volume: 'run', regularite: 'calendar', heures: 'stopwatch', quetes: 'trophy', todo: 'check', sommeil: 'moon' };

const ORDER = ['dex', 'disc', 'math', 'phys', 'si', 'verb'];
const LABEL = { volume: 'Sorties', regularite: 'Régularité', heures: 'Heures de travail', quetes: 'Quêtes tenues', todo: 'To-do faite', sommeil: 'Sommeil avant 23h30' };
const f1 = (n) => n.toFixed(1).replace('.', ',');
const clampPct = (x) => Math.max(0, Math.min(100, x));

// Valeur courte à droite du titre de la barre (réalisé / objectif), sans phrase.
function shortValue(info) {
  if (!info) return '';
  if (info.excused) return 'justifiée';
  if (info.kind === 'minutes') return `${formatMinutes(info.value || 0)} / ${formatHours((info.goal || 0) / 60)}`;
  if (info.kind === 'pct') return `${Math.round((info.value || 0) * 100)} %`;
  return info.goal > 0 ? `${info.value ?? 0} / ${info.goal}` : '';
}

// Taux de remplissage de la barre d'une sous-matière.
function ratioOf(info) {
  if (!info) return 0;
  if (info.kind === 'pct') return (info.value || 0) * 100;
  if (info.excused) return 0;
  return info.goal > 0 ? (info.value || 0) / info.goal * 100 : 0;
}

function partEl(c) {
  const ok = c.score != null && c.share > 0, ratio = ratioOf(c.info);
  const row = el('div', { class: 'hn-part' + (ok ? '' : ' off') + (ok && ratio >= 100 ? ' full' : '') });
  const parts = c.info?.parts?.length > 1   // Verbe : Anglais / Français (temps travaillé)
    ? `<div class="hn-sub">${c.info.parts.map(p => `${SUBJECTS[p.key]?.label || p.key} <b>${formatMinutes(p.minutes)}</b>`).join('<i>·</i>')}</div>` : '';
  row.innerHTML = `
    <div class="hn-line">
      <span class="hn-pico">${iconHtml(PICON[c.key] || 'target')}</span>
      <span class="hn-name">${LABEL[c.key] || c.key}</span>
      <span class="hn-pct">${ok ? Math.round(Math.min(ratio, 999)) + '%' : ''}</span>
    </div>
    <div class="hn-bar"><div class="hn-fill" style="width:${Math.max(0, Math.min(100, ratio))}%"></div></div>
    <div class="hn-info"><span class="hn-val">${ok ? shortValue(c.info) : ''}</span>${parts}</div>`;
  return row;
}

export async function renderCaracPanels(root, extras = {}) {
  root.replaceChildren();
  const proj = await projectCurrentWeek();
  for (const id of ORDER) {
    const c = CARACS.find(x => x.id === id), p = proj[id];
    const dd = Math.round(p.projected * 10) / 10 - Math.round(p.current * 10) / 10;   // même arrondi que l'affichage
    const delta = dd > 0.04 ? `<span class="hn-delta up">${iconHtml('up')}+${f1(dd)}</span>` : dd < -0.04 ? `<span class="hn-delta down">${iconHtml('down')}${f1(dd)}</span>` : '<span class="hn-delta eq">=</span>';
    const allFull = p.comps.every(x => x.score != null && x.share > 0 && ratioOf(x.info) >= 100);
    const card = el('div', { class: 'hn-card' + (allFull ? ' done' : ''), style: `--hn-c:${COLORS[c.icon] || c.color};` });
    card.innerHTML = `
      <div class="hn-head">
        <span class="hn-ico">${iconHtml(c.icon)}</span>
        <div class="hn-title"><div class="t1"><b>${c.label}</b>${c.cat ? `<i class="cat-chip">${CATEGORY_LABEL[c.cat]}</i>` : ''}</div></div>
        <span class="hn-note"><span class="hn-to">${f1(p.projected)}</span>${delta}</span>
      </div>`;
    card.appendChild(el('div', { class: 'hn-body' }, p.comps.map(partEl)));
    if (extras[id]) card.querySelector('.hn-body').appendChild(el('div', { class: 'hn-extra' }, [extras[id]]));
    root.appendChild(card);
  }
}
