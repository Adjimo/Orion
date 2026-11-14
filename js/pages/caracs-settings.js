// Dépliant « Objectifs » (page Options) : part du temps libre travaillée et part par matière.
// Poids de l'historique, échelle des scores, pondérations et cas particuliers sont fixes (voir getCaracSettings).
// Toute validation passe par saveCaracSettings() : recalcul complet de l'historique.
import { DEFAULT_SETTINGS, getCaracSettings, saveCaracSettings } from '../features/caracs.js';
import { el, showToast } from '../ui/helpers.js';
import { iconHtml } from '../ui/icons.js';

// Répartition du travail entre matières (poids en %, normalisés) ; l'objectif en heures vient du temps libre × % de travail.
const SUBJECT_LABELS = { maths: 'Maths', physique: 'Physique', si: 'SI / Info', langues: 'Anglais', francais: 'Français' };

const num = (v) => parseFloat(String(v).replace(',', '.'));

function field(label, id, value, { min = 0, max = 100, step = 1, unit = '' } = {}) {
  return el('label', { class: 'cs-row' }, [
    el('span', { class: 'cs-label' }, label),
    el('span', { class: 'cs-input' }, [
      el('input', { class: 'input', id, type: 'number', inputmode: 'decimal', min, max, step, value }),
      unit ? el('span', { class: 'dim text-xs' }, unit) : null
    ])
  ]);
}

export async function renderCaracsSettings(root, forceOpen = false) {
  const cfg = await getCaracSettings();
  const wasOpen = forceOpen || root.querySelector('.cs-fold')?.hasAttribute('open');
  const fold = el('details', { class: 'card mb-3 cs-fold opt-fold' }, [el('summary', { class: 'cs-fold-head', html: iconHtml('target') + '<span>Objectifs</span>' })]);
  if (wasOpen) fold.setAttribute('open', '');
  const card = el('div', { class: 'cs-card' });
  fold.appendChild(card);

  card.append(
    field('Part du temps libre travaillée', 'cs-pct', cfg.workPct, { min: 10, max: 100, step: 5, unit: '%' }),
    el('div', { class: 'cs-hint' }, 'Répartition par matière (en %) :'),
    ...Object.keys(SUBJECT_LABELS).map(k => field(SUBJECT_LABELS[k], `cs-sw-${k}`, cfg.subjectWeights[k], { max: 100, unit: '%' }))
  );

  const save = async () => {
    const q = (id) => num(card.querySelector('#' + id).value);
    const patch = { subjectWeights: {} };
    const pct = q('cs-pct');
    if (isNaN(pct) || pct < 10 || pct > 100) return bad('Part du temps libre entre 10 et 100 %.');
    patch.workPct = pct;
    let swTotal = 0;
    for (const k of Object.keys(SUBJECT_LABELS)) {
      const v = q(`cs-sw-${k}`);
      if (isNaN(v) || v < 0) return bad(`Poids invalide : ${SUBJECT_LABELS[k]}.`);
      patch.subjectWeights[k] = v; swTotal += v;
    }
    if (swTotal <= 0) return bad('Au moins une matière doit avoir un poids supérieur à 0.');
    await saveCaracSettings(patch);
    await (await import('../features/seed.js')).loadAll();
    showToast({ type: 'xp', icon: 'check', title: 'Caractéristiques recalculées', text: 'Réglages enregistrés.' }, 3000);
  };
  const reset = async () => {
    if (!confirm('Rétablir tous les réglages par défaut et recalculer les caractéristiques ?')) return;
    await saveCaracSettings({ workPct: DEFAULT_SETTINGS.workPct, subjectWeights: { ...DEFAULT_SETTINGS.subjectWeights } });
    const nx = fold.nextSibling; fold.remove();
    await renderCaracsSettings(root, true);
    if (nx) root.insertBefore(root.lastChild, nx);
    showToast({ type: 'xp', icon: 'check', title: 'Réglages par défaut', text: 'Caractéristiques recalculées.' }, 3000);
  };
  const bad = (text) => showToast({ type: 'err', title: 'Valeur invalide', text }, 3500);

  card.appendChild(el('div', { class: 'cs-actions' }, [
    el('button', { class: 'btn ghost', onclick: reset }, 'Par défaut'),
    el('button', { class: 'btn primary', onclick: save }, 'Enregistrer et recalculer')
  ]));
  root.appendChild(fold);
}
