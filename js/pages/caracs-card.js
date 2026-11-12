// Carte « Caractéristiques » (page Accueil) : toile d'araignée SVG, sans dépendance.
// Un appui sur un sommet (point, icône) affiche un mini détail à côté de ce sommet.
import { CARACS, fmtMod, getCaracSettings, loadCaracHistory, modifier } from '../features/caracs.js';
import { el, escapeHtml } from '../ui/helpers.js';
import { iconHtml } from '../ui/icons.js';
import { navigate } from '../ui/router.js';

// Échelle du graphe : 0 → 20 (anneau extérieur = 20) ; une valeur au-delà est écrêtée au bord.
const SIZE = 320, C = SIZE / 2, RMAX = 20, R_OUT = 126, ICON_R = 144;
const polar = (i, v) => {
  const a = (-90 + i * 60) * Math.PI / 180, r = R_OUT * Math.min(RMAX, Math.max(0, v)) / RMAX;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
};
const pts = (vals) => CARACS.map((c, i) => polar(i, vals[c.id]).map(n => n.toFixed(1)).join(',')).join(' ');
const ring = (v) => CARACS.map((_, i) => polar(i, v).map(n => n.toFixed(1)).join(',')).join(' ');
const COMP_LABEL = { volume: 'Volume', regularite: 'Régularité', heures: 'Heures', quetes: 'Quêtes', sommeil: 'Sommeil', ecarts: 'Écarts' };
const f1 = (n) => n.toFixed(1).replace('.', ',');

function arrow(d) { return d > 0.05 ? '<span class="cr-up">▲</span>' : d < -0.05 ? '<span class="cr-down">▼</span>' : '<span class="cr-eq">=</span>'; }

export async function renderCaracsCard(root) {
  const [hist, cfg] = await Promise.all([loadCaracHistory(), getCaracSettings()]);
  const card = el('div', { class: 'card carac-card mb-4' });
  card.appendChild(el('div', { class: 'flex between mb-2' }, [
    el('h3', {}, 'Caractéristiques'),
    el('button', { class: 'btn ghost sm', 'aria-label': 'Réglages des caractéristiques', html: iconHtml('gear'), onclick: () => { navigate('options'); window.scrollTo(0, 0); } })
  ]));
  root.appendChild(card);

  if (!hist.length) {
    card.appendChild(el('div', { class: 'dim text-sm' }, 'Premier calcul le lundi 7 septembre (une fois la première semaine terminée). Les valeurs ne bougent qu\'à la clôture de chaque semaine.'));
    return;
  }
  const last = hist[hist.length - 1], prev = hist[hist.length - 2], old = hist[hist.length - 5];

  const rings = [5, 10, 15, 20].map(v => `<polygon points="${ring(v)}" class="cr-ring"/>`).join('');
  const axes = CARACS.map((_, i) => { const [x, y] = polar(i, RMAX); return `<line x1="${C}" y1="${C}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="cr-axis"/>`; }).join('');
  const ghost = old ? `<polygon points="${pts(old.values)}" class="cr-ghost"/>` : '';
  const dots = CARACS.map((c, i) => { const [x, y] = polar(i, last.values[c.id]); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="${c.color}" class="cr-dot"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="18" fill="transparent" data-i="${i}" class="cr-hit"/>`; }).join('');
  const icons = CARACS.map((c, i) => {
    const a = (-90 + i * 60) * Math.PI / 180;
    const side = (i === 4 || i === 5) ? 'l' : 'r';          // la valeur s'écrit du côté extérieur de l'icône
    return `<span class="cr-ico" data-i="${i}" style="left:${((C + ICON_R * Math.cos(a)) / SIZE * 100).toFixed(2)}%;top:${((C + ICON_R * Math.sin(a)) / SIZE * 100).toFixed(2)}%">${iconHtml(c.icon)}<span class="cr-val ${side}" style="color:${c.color}">${Math.round(last.values[c.id])}</span></span>`;
  }).join('');
  const wrap = el('div', { class: 'cr-wrap', html: `<svg viewBox="0 0 ${SIZE} ${SIZE}" role="img" aria-label="Graphe des caractéristiques">${rings}${axes}${ghost}<polygon points="${pts(last.values)}" class="cr-poly"/>${dots}</svg>${icons}` });
  card.appendChild(wrap);
  if (old) card.appendChild(el('div', { class: 'dim text-xs', style: 'text-align:center' }, 'Filigrane : il y a 4 semaines'));

  // Mini détail d'un sommet : valeur, variation, score de la semaine et ses parts, à côté du sommet.
  const tip = el('div', { class: 'cr-tip hidden' });
  wrap.appendChild(tip);
  let openI = null;
  const hide = () => { tip.classList.add('hidden'); openI = null; };
  const show = (i) => {
    if (openI === i) return hide();
    openI = i;
    const c = CARACS[i], v = last.values[c.id], d = prev ? v - prev.values[c.id] : null;
    const parts = last.details[c.id].filter(x => x.score != null).map(x => `${COMP_LABEL[x.key] || x.key} ${f1(x.score)}`).join(' · ');
    tip.innerHTML = `<div class="cr-tip-title" style="color:${c.color}">${iconHtml(c.icon)} <strong>${c.label}</strong> ${Math.round(v)} (${fmtMod(modifier(v))}) ${d == null ? '' : arrow(d)}</div>`
      + `<div class="cr-tip-line">Semaine : ${f1(last.scores[c.id])} / ${cfg.scoreCap}${d == null ? '' : ` · ${d >= 0 ? '+' : ''}${f1(d)}`}</div>`
      + (parts ? `<div class="cr-tip-line mute">${escapeHtml(parts)}</div>` : '');
    const [x, y] = polar(i, v);
    const left = Math.min(78, Math.max(22, x / SIZE * 100));
    tip.style.left = left + '%';
    tip.style.top = (y / SIZE * 100) + '%';
    tip.classList.toggle('below', y < C);          // sommet en haut : le détail s'ouvre en dessous, sinon au-dessus
    tip.classList.remove('hidden');
  };
  wrap.querySelectorAll('.cr-hit, .cr-ico').forEach(n => n.addEventListener('click', (e) => { e.stopPropagation(); show(+n.dataset.i); }));
  card.addEventListener('click', (e) => { if (!e.target.closest('.cr-tip')) hide(); });
}
