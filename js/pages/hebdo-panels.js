// Boîtes « Compétences » : une par caractéristique, sobres (même style que les cartes de Aujourd'hui).
// Chaque boîte = titre + note projetée, puis une barre par sous-matière (titre seul). Seule exception : Verbe garde
// le temps d'Anglais et de Français. Tout vient de projectCurrentWeek() (caracs.js), le même calcul que l'historique.
// extras = { <idCarac>: nœud DOM } : contrôles ajoutés en bas d'une boîte.
import { CARACS, projectCurrentWeek } from '../features/caracs.js';
import { SUBJECTS, formatMinutes } from '../features/work.js';
import { el } from '../ui/helpers.js';
import { iconHtml } from '../ui/icons.js';

const ORDER = ['dex', 'disc', 'math', 'phys', 'si', 'verb'];
const LABEL = { volume: 'Sorties', regularite: 'Régularité', heures: 'Heures de travail', quetes: 'Quêtes tenues', todo: 'To-do faite', sommeil: 'Sommeil avant 23h30' };
const f1 = (n) => n.toFixed(1).replace('.', ',');
const clampPct = (x) => Math.max(0, Math.min(100, x));

// Taux de remplissage de la barre d'une sous-matière.
function ratioOf(info) {
  if (!info) return 0;
  if (info.kind === 'pct') return (info.value || 0) * 100;
  if (info.excused) return 0;
  return info.goal > 0 ? (info.value || 0) / info.goal * 100 : 0;
}

function partEl(c) {
  const ok = c.score != null && c.share > 0, ratio = ratioOf(c.info);
  const row = el('div', { class: 'hn-part' + (ok ? '' : ' off') });
  // Verbe : on garde le détail Anglais / Français (temps travaillé), rien d'autre.
  const parts = c.info?.parts?.length > 1
    ? `<div class="hn-sub">${c.info.parts.map(p => `${SUBJECTS[p.key]?.label || p.key} <b>${formatMinutes(p.minutes)}</b>`).join('<i>·</i>')}</div>` : '';
  row.innerHTML = `
    <div class="hn-line"><span class="hn-name">${LABEL[c.key] || c.key}</span></div>
    <div class="hn-bar"><div class="hn-fill" style="width:${Math.max(0, Math.min(100, ratio))}%"></div></div>${parts}`;
  return row;
}

export async function renderCaracPanels(root, extras = {}) {
  root.replaceChildren();
  const proj = await projectCurrentWeek();
  for (const id of ORDER) {
    const c = CARACS.find(x => x.id === id), p = proj[id];
    const card = el('div', { class: 'hn-card' });
    card.innerHTML = `
      <div class="hn-head">
        <span class="hn-ico">${iconHtml(c.icon)}</span>
        <div class="hn-title"><b>${c.label}</b></div>
        <span class="hn-to">${p.projected.toFixed(1).replace('.', ',')}</span>
      </div>`;
    card.appendChild(el('div', { class: 'hn-body' }, p.comps.map(partEl)));
    if (extras[id]) card.querySelector('.hn-body').appendChild(el('div', { class: 'hn-extra' }, [extras[id]]));
    root.appendChild(card);
  }
}
