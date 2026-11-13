// Boîtes « Notes » de Hebdo : une par caractéristique. Chaque boîte montre ses sous-matières (réalisé / objectif, poids,
// sous-note, apport), la somme = score de la semaine, puis la note actuelle → projetée sur 20.
// Lecture seule : tout vient de projectCurrentWeek() (caracs.js), le même calcul que l'historique.
// extras = { <idCarac>: nœud DOM } : contrôles ajoutés en bas d'une boîte (ex. objectif de sorties dans Dextérité).
import { CARACS, getCaracSettings, projectCurrentWeek, saveCaracSettings } from '../features/caracs.js';
import { addDays, mondayOf } from '../core/calendar.js';
import { todayKey } from '../core/dates.js';
import { freeMinutesOf, makeGoalCtx, weekGoalsFor } from '../features/work-goals.js';
import { SUBJECTS, formatHours, formatMinutes } from '../features/work.js';
import { el } from '../ui/helpers.js';
import { COLORS, iconHtml } from '../ui/icons.js';

const ORDER = ['dex', 'disc', 'math', 'phys', 'si', 'verb'];
const LABEL = { volume: 'Sorties', regularite: 'Régularité', heures: 'Heures de travail', quetes: 'Quêtes tenues', todo: 'To-do faite', sommeil: 'Sommeil avant 23h30' };
// D'où vient chaque sous-note (une phrase, affichée sous la barre).
const HINT = {
  volume: 'Sorties faites cette semaine ÷ ton objectif de la semaine',
  regularite: "Sorties faites ÷ visées sur les 4 dernières semaines (semaines justifiées retirées)",
  heures: 'Heures de la semaine ÷ objectif de la matière',
  quetes: 'Quêtes de la semaine déjà atteintes',
  todo: 'Éléments de la to-do cochés (reportés compris)',
  sommeil: 'Nuits cochées dans Aujourd\'hui ÷ nuits de la semaine'
};
const f1 = (n) => n.toFixed(1).replace('.', ',');
const clampPct = (x) => Math.max(0, Math.min(100, x));

// Texte de la valeur et remplissage de la barre d'une sous-matière.
function measure(info) {
  if (!info) return { text: '', ratio: 0 };
  if (info.excused) return { text: info.kind === 'pct' ? `${Math.round((info.value || 0) * 100)} % conservé` : 'objectif 0 · semaine justifiée', ratio: info.kind === 'pct' ? (info.value || 0) * 100 : 0 };
  if (info.kind === 'minutes') return { text: `${formatMinutes(info.value || 0)} / ${formatHours((info.goal || 0) / 60)}`, ratio: info.goal > 0 ? info.value / info.goal * 100 : 0 };
  if (info.kind === 'pct') return { text: `${Math.round((info.value || 0) * 100)} % · moy. ${info.window} sem.`, ratio: (info.value || 0) * 100 };
  return { text: info.goal > 0 ? `${info.value ?? 0} / ${info.goal} ${info.unit || ''}`.trim() : 'rien cette semaine', ratio: info.goal > 0 ? info.value / info.goal * 100 : 0 };
}

function partEl(c, multi) {
  const m = measure(c.info), ok = c.score != null && c.share > 0, full = ok && m.ratio >= 100;
  const row = el('div', { class: 'hn-part' + (ok ? '' : ' off') + (full ? ' full' : '') });
  const chips = (multi && ok ? `<span class="hn-chip">poids ${Math.round(c.share * 100)} %</span>` : '');
  const result = ok
    ? `<span class="hn-score">${f1(c.score)}<small>/20</small></span>${multi ? `<span class="hn-gain">+${f1(c.contrib)} pt</span>` : ''}`
    : `<span class="hn-gain">${c.info?.excused ? 'neutralisée' : 'ignorée'}</span>`;
  row.innerHTML = `
    <div class="hn-line"><span class="hn-name">${LABEL[c.key] || c.key}${chips}</span><span class="hn-val">${m.text}</span></div>
    <div class="hn-bar"><div class="hn-fill" style="width:${clampPct(m.ratio)}%"></div></div>
    <div class="hn-foot"><span class="hn-hint">${ok ? HINT[c.key] : c.info?.excused ? 'Semaine justifiée : ne compte ni en bien ni en mal, ta Dextérité est conservée' : 'Pas de donnée cette semaine : son poids est reparti sur les autres'}${c.note ? ` · ${c.note}` : ''}</span><span class="hn-res">${result}</span></div>
    ${c.info?.parts?.length > 1 ? `<div class="hn-sub">${c.info.parts.map(p => `${SUBJECTS[p.key]?.label || p.key} <b>${formatMinutes(p.minutes)}</b>`).join('<i>·</i>')}</div>` : ''}`;
  return row;
}

export async function renderCaracPanels(root, extras = {}) {
  root.replaceChildren();
  const [proj, cfg] = await Promise.all([projectCurrentWeek(), getCaracSettings()]);
  for (const id of ORDER) {
    const c = CARACS.find(x => x.id === id), p = proj[id];
    const col = COLORS[c.icon] || c.color;
    const dd = Math.round(p.projected * 10) / 10 - Math.round(p.current * 10) / 10;   // même arrondi que l'affichage
    const delta = dd > 0.04 ? `<span class="hn-delta up">▲ +${f1(dd)}</span>` : dd < -0.04 ? `<span class="hn-delta down">▼ ${f1(dd)}</span>` : '<span class="hn-delta eq">= stable</span>';
    const multi = p.comps.length > 1;
    const card = el('div', { class: 'hn-card', style: `--hn-c:${col};` });
    card.innerHTML = `
      <div class="hn-head">
        <span class="hn-ico">${iconHtml(c.icon)}</span>
        <div class="hn-title"><b>${c.label}</b><span>score de la semaine ${f1(p.S)} / 20</span></div>
        <div class="hn-note"><span class="hn-from">${f1(p.current)}</span><span class="hn-arrow">→</span><span class="hn-to">${f1(p.projected)}</span>${delta}</div>
      </div>`;
    const body = el('div', { class: 'hn-body' }, p.comps.map(x => partEl(x, multi)));
    if (multi) {   // barre empilée : ce que chaque sous-matière apporte au score de la semaine (sur 20)
      const segs = p.comps.filter(x => x.contrib > 0).map((x, i) => `<i style="width:${clampPct(x.contrib / 20 * 100)}%;opacity:${1 - i * 0.28}" title="${LABEL[x.key]} +${f1(x.contrib)}"></i>`).join('');
      body.appendChild(el('div', { class: 'hn-total', html: `<div class="hn-stack">${segs}</div><div class="hn-sum"><span>Somme des apports</span><b>${f1(p.S)} / 20</b></div>` }));
    }
    if (extras[id]) body.appendChild(el('div', { class: 'hn-extra' }, [extras[id]]));
    card.appendChild(body);
    root.appendChild(card);
  }
  root.appendChild(el('div', { class: 'dim text-xs hn-legend' }, `Note si la semaine s'arrêtait maintenant : ${Math.round(cfg.alpha * 100)} % de l'historique + ${Math.round((1 - cfg.alpha) * 100)} % du score de la semaine.`));
}

// Carte « Objectifs de la semaine » : temps libre du planning × % de travail = heures de la semaine, réparties par matière.
// onChange : appelé après un changement du % (recalcul de l'historique puis nouveau rendu de la page).
export async function renderWorkPlan(root, onChange) {
  root.replaceChildren();
  const ctx = await makeGoalCtx(), cfg = ctx.cfg;
  const monday = mondayOf(todayKey()), G = await weekGoalsFor(monday, ctx);
  const free = G.freeMinutes ?? await freeMinutesOf(monday, ctx);
  const fh = (min) => formatHours(min / 60);
  const rows = [['maths', 'math', 'Maths'], ['physique', 'phys', 'Physique'], ['si', 'si', 'SI / Info'], ['langues', 'langues', 'Anglais'], ['francais', 'francais', 'Français']];
  const sw = cfg.subjectWeights, sum = Object.values(sw).reduce((a, b) => a + b, 0) || 1;
  const col = (k) => COLORS[SUBJECTS[k]?.icon] || 'var(--accent)';
  const card = el('div', { class: 'wp-card' });
  card.innerHTML = `<div class="wp-title">Objectifs de la semaine<span>${G.dynamic ? 'calcul automatique' : 'objectifs fixes cette semaine'}</span></div>`;
  const pct = el('span', { class: 'wp-pct' });
  const mk = (t, d) => el('button', { class: 'cnt-btn' + (d > 0 ? ' plus' : ''), 'aria-label': d > 0 ? 'Plus de travail' : 'Moins de travail', onclick: async () => {
    await saveCaracSettings({ workPct: Math.max(10, Math.min(100, cfg.workPct + d)) }); onChange?.();
  } }, t);
  pct.append(mk('−', -5), el('b', {}, `${cfg.workPct} %`), mk('+', 5));
  const calc = el('div', { class: 'wp-calc' });
  const box = (b, small) => el('div', { class: 'wp-box', html: `<b>${b}</b><small>${small}</small>` });
  calc.append(box(fh(free), 'temps libre'), el('span', { class: 'wp-op' }, '×'), el('div', { class: 'wp-box' }, [pct, el('small', {}, 'travaillé')]), el('span', { class: 'wp-op' }, '='), el('div', { class: 'wp-box wp-res', html: `<b>${fh(free * cfg.workPct / 100)}</b><small>de travail</small>` }));
  card.appendChild(calc);
  const list = el('div', { class: 'wp-rows' });
  for (const [sk, gk, label] of rows) {
    const share = G.dynamic ? (sw[sk] || 0) / sum : (G.total ? G[gk] / G.total : 0);
    list.appendChild(el('div', { class: 'wp-row', style: `--c:${col(sk)}`, html: `<span>${label}</span><div class="wp-bar"><i style="width:${Math.round(share * 100)}%"></i></div><span class="wp-h">${fh(G[gk])}<small>${Math.round(share * 100)} %</small></span>` }));
  }
  card.appendChild(list);
  let note = 'Poids des matières : Options → Réglage des caractéristiques.';
  if (!G.dynamic) {
    const nextMon = addDays(monday, 7), nf = await freeMinutesOf(nextMon, ctx);
    note = `Le calcul automatique démarre le ${cfg.dynamicFrom.split('-').reverse().slice(0, 2).join('/')}. ${monday < cfg.dynamicFrom && nextMon >= cfg.dynamicFrom ? `Semaine prochaine : ${fh(nf)} libres × ${cfg.workPct} % = ${fh(nf * cfg.workPct / 100)}. ` : ''}` + note;
  }
  card.appendChild(el('div', { class: 'wp-note' }, note));
  root.appendChild(card);
}
