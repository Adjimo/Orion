// Réglages des caractéristiques (page Options) : poids de l'historique, objectifs d'heures,
// échelle des scores, pondérations (Dextérité, Discipline) et cas particuliers.
// Toute validation passe par saveCaracSettings() : recalcul complet de l'historique.
import { CARACS, DEFAULT_SETTINGS, getCaracSettings, saveCaracSettings } from '../features/caracs.js';
import { el, showToast } from '../ui/helpers.js';

// Libellés des parts pondérées (seules la Dextérité et la Discipline ont plusieurs parts).
const PART_LABELS = {
  dex:  { volume: 'Volume (sorties de la semaine)', regularite: 'Régularité (4 dernières semaines)' },
  disc: { quetes: 'Quêtes', todo: 'To-do (éléments faits)', sommeil: 'Sommeil (nuits avant 23h30)' }
};
const HOURS_LABELS = { math: 'Maths', phys: 'Physique', si: 'SI / Info', verb: 'Verbe (anglais + français)' };

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

// Section dépliable (fermée par défaut) : titre cliquable + contenu.
function group(title, children, open = false) {
  const d = el('details', { class: 'cs-group' }, [el('summary', { class: 'cs-group-head' }, title), el('div', { class: 'cs-group-body' }, children)]);
  if (open) d.setAttribute('open', '');
  return d;
}

export async function renderCaracsSettings(root, forceOpen = false) {
  const cfg = await getCaracSettings();
  const wasOpen = forceOpen || root.querySelector('.cs-fold')?.hasAttribute('open');
  const fold = el('details', { class: 'card mb-4 cs-fold' }, [el('summary', { class: 'cs-fold-head' }, 'Caractéristiques et objectifs')]);
  if (wasOpen) fold.setAttribute('open', '');
  const card = el('div', { class: 'cs-card' });
  fold.appendChild(card);

  card.appendChild(el('div', { class: 'dim text-xs mb-3' },
    'Ces valeurs pilotent le calcul des 6 caractéristiques. À la validation, tout l\'historique est recalculé depuis le 1er septembre ; l\'XP, les malus et tes données ne sont jamais modifiés.'));

  card.appendChild(group('Historique', [
    field('Poids de l\'historique', 'cs-alpha', Math.round(cfg.alpha * 100), { max: 100, unit: '%' }),
    el('div', { class: 'cs-hint' }, 'Part de la valeur précédente dans la nouvelle valeur ; le reste vient du score de la semaine.')
  ]));

  card.appendChild(group('Objectifs hebdomadaires', [
    ...Object.keys(HOURS_LABELS).map(k => field(HOURS_LABELS[k], `cs-h-${k}`, cfg.hoursGoal[k], { max: 60, step: 0.5, unit: 'h' })),
    el('div', { class: 'cs-hint' }, 'Par défaut : Maths 19 h, Physique 11 h, SI 1 h (Info 0 h), Verbe 3 h (anglais 2 h + français 1 h).')
  ]));

  card.appendChild(group('Échelle des scores', [
    field('Rien de fait', 'cs-zero', cfg.scoreZero, { min: 0, max: 10, step: 0.5 }),
    field('Objectif atteint', 'cs-goalscore', cfg.goalScore, { min: 5, max: 20, step: 0.5 }),
    field('Objectif dépassé de 25 %', 'cs-over', cfg.overScore, { min: 5, max: 20, step: 0.5 }),
    el('div', { class: 'cs-hint' }, 'Échelle façon D&D : moyen 8 à 12, bon à partir de 15, très bon 17 à 20, mauvais sous 7. Le score maximum est 20.')
  ]));

  const wBody = [];
  for (const id of Object.keys(PART_LABELS)) {
    wBody.push(el('div', { class: 'cs-sub' }, CARACS.find(c => c.id === id).label));
    for (const p of Object.keys(PART_LABELS[id])) wBody.push(field(PART_LABELS[id][p], `cs-w-${id}-${p}`, cfg.weights[id][p], { max: 100, unit: '%' }));
  }
  wBody.push(el('div', { class: 'cs-hint' }, 'Maths, Physique, SI / Info et Verbe : 100 % heures de travail. Si le total n\'est pas 100, les parts sont normalisées.'));
  card.appendChild(group('Pondérations (%)', wBody));

  card.appendChild(group('Cas particuliers', [
    el('label', { class: 'cs-row' }, [
      el('span', { class: 'cs-label' }, 'Proratiser la 1re semaine partielle'),
      el('span', { class: 'cs-input' }, [el('input', { id: 'cs-prorate', type: 'checkbox', checked: cfg.prorateFirstWeek ? 'checked' : null })])
    ]),
    el('div', { class: 'cs-hint' }, 'Semaine du 31/08 (comptée du 01/09) : objectifs d\'heures, de sorties et de nuits ramenés aux jours comptés.'),
    el('label', { class: 'cs-row' }, [
      el('span', { class: 'cs-label' }, 'Neutraliser les semaines justifiées'),
      el('span', { class: 'cs-input' }, [el('input', { id: 'cs-excused', type: 'checkbox', checked: cfg.neutralizeExcused ? 'checked' : null })])
    ]),
    el('div', { class: 'cs-hint' }, 'Quêtes justifiées (maladie…) : ignorées dans la Discipline ; sorties justifiées : Dextérité inchangée cette semaine-là.')
  ]));

  const save = async () => {
    const q = (id) => num(card.querySelector('#' + id).value);
    const patch = { hoursGoal: {}, weights: {} };
    const alpha = q('cs-alpha');
    if (isNaN(alpha) || alpha < 0 || alpha > 100) return bad('Poids de l\'historique entre 0 et 100.');
    patch.alpha = alpha / 100;
    for (const k of Object.keys(HOURS_LABELS)) {
      const v = q(`cs-h-${k}`);
      if (isNaN(v) || v <= 0) return bad(`Objectif d'heures invalide : ${HOURS_LABELS[k]}.`);
      patch.hoursGoal[k] = v;
    }
    const z = q('cs-zero'), gs = q('cs-goalscore'), ov = q('cs-over');
    if (isNaN(z) || isNaN(gs) || isNaN(ov) || z < 0 || z >= gs || gs >= ov || ov > DEFAULT_SETTINGS.scoreCap) return bad('Échelle : rien de fait < objectif atteint < objectif dépassé ≤ 20.');
    patch.scoreZero = z; patch.goalScore = gs; patch.overScore = ov;
    for (const id of Object.keys(PART_LABELS)) {
      patch.weights[id] = {};
      let total = 0;
      for (const p of Object.keys(PART_LABELS[id])) {
        const v = q(`cs-w-${id}-${p}`);
        if (isNaN(v) || v < 0) return bad('Pondération invalide.');
        patch.weights[id][p] = v; total += v;
      }
      if (total <= 0) return bad('Au moins une pondération doit être supérieure à 0.');
    }
    patch.prorateFirstWeek = card.querySelector('#cs-prorate').checked;
    patch.neutralizeExcused = card.querySelector('#cs-excused').checked;
    await saveCaracSettings(patch);
    await (await import('../features/seed.js')).loadAll();
    showToast({ type: 'xp', icon: 'check', title: 'Caractéristiques recalculées', text: 'Réglages enregistrés.' }, 3000);
  };
  const reset = async () => {
    if (!confirm('Rétablir tous les réglages par défaut et recalculer les caractéristiques ?')) return;
    await saveCaracSettings({
      alpha: DEFAULT_SETTINGS.alpha, hoursGoal: { ...DEFAULT_SETTINGS.hoursGoal },
      prorateFirstWeek: DEFAULT_SETTINGS.prorateFirstWeek, neutralizeExcused: DEFAULT_SETTINGS.neutralizeExcused,
      scoreZero: DEFAULT_SETTINGS.scoreZero, goalScore: DEFAULT_SETTINGS.goalScore, overScore: DEFAULT_SETTINGS.overScore,
      weights: JSON.parse(JSON.stringify(DEFAULT_SETTINGS.weights))
    });
    fold.remove();
    await renderCaracsSettings(root, true);
    showToast({ type: 'xp', icon: 'check', title: 'Réglages par défaut', text: 'Caractéristiques recalculées.' }, 3000);
  };
  const bad = (text) => showToast({ type: 'err', title: 'Valeur invalide', text }, 3500);

  card.appendChild(el('div', { class: 'cs-actions' }, [
    el('button', { class: 'btn ghost', onclick: reset }, 'Par défaut'),
    el('button', { class: 'btn primary', onclick: save }, 'Enregistrer et recalculer')
  ]));
  root.appendChild(fold);
}
