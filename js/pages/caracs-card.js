// Carte « Caractéristiques » (page Accueil) : toile d'araignée SVG, sans dépendance.
import { formatDate } from '../core/dates.js';
import { addDays } from '../core/calendar.js';
import { CARACS, fmtMod, getCaracSettings, loadCaracHistory, modifier, saveCaracSettings } from '../features/caracs.js';
import { el, escapeHtml, showToast } from '../ui/helpers.js';
import { iconHtml } from '../ui/icons.js';

const SIZE = 320, C = SIZE / 2, R24 = 108, ICON_R = 138;
const polar = (i, v) => {
  const a = (-90 + i * 60) * Math.PI / 180, r = R24 * Math.min(24, Math.max(0, v)) / 24;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
};
const pts = (vals) => CARACS.map((c, i) => polar(i, vals[c.id]).map(n => n.toFixed(1)).join(',')).join(' ');
const ring = (v) => CARACS.map((_, i) => polar(i, v).map(n => n.toFixed(1)).join(',')).join(' ');
const COMP_LABEL = { volume: 'Volume', allure: 'Allure', regularite: 'Régularité', heures: 'Heures', todo: 'Chapitres / to-do', quetes: 'Quêtes', sommeil: 'Sommeil', jours: 'Jours de travail', ecarts: 'Écarts' };

function arrow(d) { return d > 0.05 ? '<span class="cr-up">▲</span>' : d < -0.05 ? '<span class="cr-down">▼</span>' : '<span class="cr-eq">=</span>'; }

// Ce qui a le plus fait bouger la valeur : plus grand écart de contribution vs la semaine précédente.
function topMover(entry, prev, id) {
  const cur = entry.details[id];
  const before = prev?.details[id] || [];
  let best = null;
  for (const c of cur) {
    const d = c.contrib - (before.find(b => b.key === c.key)?.contrib || 0);
    if (!best || Math.abs(d) > Math.abs(best.d)) best = { key: c.key, d };
  }
  if (!prev) best = [...cur].sort((a, b) => b.contrib - a.contrib)[0] && { key: [...cur].sort((a, b) => b.contrib - a.contrib)[0].key, d: null };
  return best;
}

export async function renderCaracsCard(root) {
  const [hist, cfg] = await Promise.all([loadCaracHistory(), getCaracSettings()]);
  const card = el('div', { class: 'card carac-card mb-4' });
  card.appendChild(el('div', { class: 'flex between mb-2' }, [
    el('h3', {}, 'Caractéristiques'),
    el('button', { class: 'btn ghost sm', 'aria-label': 'Réglages', html: iconHtml('scale'), onclick: () => editSettings(card, root) })
  ]));
  root.appendChild(card);

  if (!hist.length) {
    card.appendChild(el('div', { class: 'dim text-sm' }, 'Premier calcul le lundi 7 septembre (une fois la première semaine terminée). Les valeurs ne bougent qu\'à la clôture de chaque semaine.'));
    return;
  }
  const last = hist[hist.length - 1], prev = hist[hist.length - 2], old = hist[hist.length - 5];
  card.appendChild(el('div', { class: 'dim text-xs mb-2' }, `Bilan de la semaine du ${formatDate(last.week)} au ${formatDate(addDays(last.week, 6))} · poids de l'historique ${Math.round(cfg.alpha * 100)} %`));

  const rings = [5, 10, 15, 20].map(v => `<polygon points="${ring(v)}" class="cr-ring"/>`).join('') + `<polygon points="${ring(24)}" class="cr-ring dashed"/>`;
  const axes = CARACS.map((_, i) => { const [x, y] = polar(i, 24); return `<line x1="${C}" y1="${C}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="cr-axis"/>`; }).join('');
  const ghost = old ? `<polygon points="${pts(old.values)}" class="cr-ghost"/>` : '';
  const dots = CARACS.map((c, i) => { const [x, y] = polar(i, last.values[c.id]); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="${c.color}" class="cr-dot"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="16" fill="transparent" data-i="${i}" class="cr-hit"/>`; }).join('');
  const icons = CARACS.map((c, i) => {
    const a = (-90 + i * 60) * Math.PI / 180;
    return `<span class="cr-ico" style="left:${((C + ICON_R * Math.cos(a)) / SIZE * 100).toFixed(2)}%;top:${((C + ICON_R * Math.sin(a)) / SIZE * 100).toFixed(2)}%">${iconHtml(c.icon)}</span>`;
  }).join('');
  card.appendChild(el('div', { class: 'cr-wrap', html: `<svg viewBox="0 0 ${SIZE} ${SIZE}" role="img" aria-label="Graphe des caractéristiques">${rings}${axes}${ghost}<polygon points="${pts(last.values)}" class="cr-poly"/>${dots}</svg>${icons}` }));
  if (old) card.appendChild(el('div', { class: 'dim text-xs', style: 'text-align:center' }, 'Filigrane : il y a 4 semaines'));

  const detail = el('div', { class: 'cr-detail mt-2' });
  const list = el('div', { class: 'cr-list mt-2' });
  const show = (i) => {
    const c = CARACS[i], v = last.values[c.id], d = prev ? v - prev.values[c.id] : null, m = topMover(last, prev, c.id);
    const rows = last.details[c.id].map(x => `<div class="flex between text-xs"><span>${COMP_LABEL[x.key] || x.key}${x.note ? ` <span class="mute">(${escapeHtml(x.note)})</span>` : ''}</span><span>${x.score == null ? '—' : x.score.toFixed(1)}</span></div>`).join('');
    detail.innerHTML = `<div class="cr-detail-card" style="border-color:${c.color}">
      <div class="flex between"><strong>${iconHtml(c.icon)} ${c.label}</strong><span>${Math.round(v)} (${fmtMod(modifier(v))}) ${d == null ? '' : arrow(d)}</span></div>
      <div class="text-xs dim mt-1">Score de la semaine : ${last.scores[c.id].toFixed(1)} / 24${d == null ? '' : ` · variation ${d >= 0 ? '+' : ''}${d.toFixed(2)}`}</div>
      ${m ? `<div class="text-xs mt-1">Moteur principal : <strong>${COMP_LABEL[m.key] || m.key}</strong>${m.d == null ? '' : ` (${m.d >= 0 ? '+' : ''}${m.d.toFixed(1)} pt)`}</div>` : ''}
      <div class="mt-2">${rows}</div></div>`;
  };
  CARACS.forEach((c, i) => {
    const v = last.values[c.id], d = prev ? v - prev.values[c.id] : 0;
    list.appendChild(el('button', { class: 'cr-row', onclick: () => show(i), html: `<span>${iconHtml(c.icon)} ${c.label}</span><span><strong>${Math.round(v)}</strong> (${fmtMod(modifier(v))}) ${arrow(d)}</span>` }));
  });
  card.appendChild(list);
  card.appendChild(detail);
  card.querySelectorAll('.cr-hit').forEach(n => n.addEventListener('click', () => show(+n.dataset.i)));
}

// Réglage du poids de l'historique (α) : recalcul complet à la validation.
async function editSettings(card, root) {
  const cfg = await getCaracSettings();
  const inp = prompt('Poids de l\'historique en % (0–100) ; le reste va au score de la semaine.\nActuel : ' + Math.round(cfg.alpha * 100) + ' (défaut : 75)', String(Math.round(cfg.alpha * 100)));
  if (inp == null) return;
  const pct = parseFloat(String(inp).replace(',', '.'));
  if (isNaN(pct) || pct < 0 || pct > 100) { showToast({ type: 'err', title: 'Valeur invalide', text: 'Entre un nombre entre 0 et 100.' }, 3000); return; }
  await saveCaracSettings({ alpha: pct / 100 });
  const next = card.nextSibling, tmp = el('div');
  card.remove();
  await renderCaracsCard(tmp);
  root.insertBefore(tmp.firstChild, next);
  showToast({ type: 'xp', icon: 'check', title: 'Caractéristiques recalculées', text: `${Math.round(pct)} % historique · ${100 - Math.round(pct)} % semaine` }, 3000);
}
