// Réglages des caractéristiques (page Options) : pondérations internes, objectifs
// d'heures, jours de travail, sensibilité de l'allure, poids des écarts et de l'historique.
// Toute validation passe par saveCaracSettings() : recalcul complet de l'historique.
import { CARACS, DEFAULT_SETTINGS, getCaracSettings, saveCaracSettings } from '../features/caracs.js';
import { el, showToast } from '../ui/helpers.js';

// Libellés des parts pondérées de chaque caractéristique.
const PART_LABELS = {
  dex:  { volume: 'Volume', allure: 'Allure', regularite: 'Régularité' },
  math: { heures: 'Heures', todo: 'To-do' },
  phys: { heures: 'Heures', todo: 'To-do' },
  si:   { heures: 'Heures', todo: 'To-do' },
  verb: { heures: 'Heures', todo: 'To-do' },
  disc: { quetes: 'Quêtes', sommeil: 'Sommeil', jours: 'Jours travaillés', todo: 'To-do' }
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
  const fold = el('details', { class: 'card mb-4 cs-fold' }, [el('summary', { class: 'cs-fold-head' }, 'Réglage des caractéristiques')]);
  if (wasOpen) fold.setAttribute('open', '');
  const card = el('div', { class: 'cs-card' });
  fold.appendChild(card);

  card.appendChild(el('div', { class: 'dim text-xs mb-3' },
    'Ces valeurs pilotent le calcul des 6 caractéristiques. À la validation, tout l\'historique est recalculé depuis le 1er septembre ; l\'XP, les malus et tes données ne sont jamais modifiés.'));

  card.appendChild(group('Historique', [
    field('Poids de l\'historique', 'cs-alpha', Math.round(cfg.alpha * 100), { max: 100, unit: '%' })
  ]));

  card.appendChild(group('Objectifs hebdomadaires', [
    ...Object.keys(HOURS_LABELS).map(k => field(HOURS_LABELS[k], `cs-h-${k}`, cfg.hoursGoal[k], { max: 60, step: 0.5, unit: 'h' })),
    el('div', { class: 'cs-hint' }, 'Maths 15 h, Physique 11 h, SI 1,5 h et Verbe 4 h : valeurs confirmées, modifiables ici.'),
    field('Jours travaillés attendus', 'cs-days', cfg.workDaysGoal, { min: 1, max: 7, unit: 'j' })
  ]));

  card.appendChild(group('Cas particuliers', [
    el('label', { class: 'cs-row' }, [
      el('span', { class: 'cs-label' }, 'Proratiser la 1re semaine partielle'),
      el('span', { class: 'cs-input' }, [el('input', { id: 'cs-prorate', type: 'checkbox', checked: cfg.prorateFirstWeek ? 'checked' : null })])
    ]),
    el('div', { class: 'cs-hint' }, 'Semaine du 31/08 (comptée du 01/09) : objectifs d\'heures, de sorties, de jours et de nuits ramenés aux jours comptés.'),
    el('label', { class: 'cs-row' }, [
      el('span', { class: 'cs-label' }, 'Neutraliser les quêtes justifiées'),
      el('span', { class: 'cs-input' }, [el('input', { id: 'cs-excused', type: 'checkbox', checked: cfg.neutralizeExcused ? 'checked' : null })])
    ]),
    el('div', { class: 'cs-hint' }, 'Quêtes justifiées (maladie…) : ignorées dans la Discipline au lieu d\'être comptées ratées.')
  ]));

  const wBody = [];
  for (const c of CARACS) {
    const parts = PART_LABELS[c.id];
    wBody.push(el('div', { class: 'cs-sub' }, c.label));
    for (const p of Object.keys(parts)) wBody.push(field(parts[p], `cs-w-${c.id}-${p}`, cfg.weights[c.id][p], { max: 100, unit: '%' }));
  }
  wBody.push(el('div', { class: 'cs-hint' }, 'Si le total d\'une caractéristique n\'est pas 100, les parts sont normalisées.'));
  card.appendChild(group('Pondérations internes (%)', wBody));

  card.appendChild(group('Échelle des scores', [
    field('Score quand l\'objectif est atteint', 'cs-goalscore', cfg.goalScore, { min: 5, max: 20, step: 0.5 }),
    field('Score minimum (plancher)', 'cs-floor', cfg.scoreFloor, { min: 0, max: 10, step: 0.5 }),
    field('Score maximum (plafond)', 'cs-cap', cfg.scoreCap, { min: 10, max: 24, step: 0.5 }),
    el('div', { class: 'cs-hint' }, 'Échelle façon D&D : moyen 8 à 12, bon à partir de 15, très bon 17 à 20, mauvais sous 7. Objectif atteint = 12 par défaut.')
  ]));

  card.appendChild(group('Sensibilités', [
    field('Allure : % de score pour +1 % de VO2max', 'cs-allure', cfg.allureSensibilite, { min: 0, max: 30, step: 0.5, unit: '%' }),
    field('Écart perso : points de Discipline par %', 'cs-ecart', cfg.ecartPointsPerPct, { min: 0, max: 1, step: 0.05, unit: 'pt' })
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
    const days = Math.round(q('cs-days'));
    if (isNaN(days) || days < 1 || days > 7) return bad('Jours travaillés : entre 1 et 7.');
    patch.workDaysGoal = days;
    patch.prorateFirstWeek = card.querySelector('#cs-prorate').checked;
    patch.neutralizeExcused = card.querySelector('#cs-excused').checked;
    for (const c of CARACS) {
      patch.weights[c.id] = {};
      let total = 0;
      for (const p of Object.keys(PART_LABELS[c.id])) {
        const v = q(`cs-w-${c.id}-${p}`);
        if (isNaN(v) || v < 0) return bad(`Pondération invalide : ${c.label}.`);
        patch.weights[c.id][p] = v; total += v;
      }
      if (total <= 0) return bad(`${c.label} : au moins une pondération doit être > 0.`);
    }
    const gs = q('cs-goalscore'), fl = q('cs-floor'), cp = q('cs-cap');
    if (isNaN(gs) || isNaN(fl) || isNaN(cp) || fl < 0 || fl >= gs || gs > cp || cp > 24) return bad('Échelle : plancher < objectif atteint ≤ plafond ≤ 24.');
    patch.goalScore = gs; patch.scoreFloor = fl; patch.scoreCap = cp;
    const al = q('cs-allure'), ec = q('cs-ecart');
    if (isNaN(al) || al < 0 || isNaN(ec) || ec < 0) return bad('Sensibilités invalides.');
    patch.allureSensibilite = al; patch.ecartPointsPerPct = ec;
    await saveCaracSettings(patch);
    showToast({ type: 'xp', icon: 'check', title: 'Caractéristiques recalculées', text: 'Réglages enregistrés.' }, 3000);
  };
  const reset = async () => {
    if (!confirm('Rétablir tous les réglages par défaut et recalculer les caractéristiques ?')) return;
    await saveCaracSettings({
      alpha: DEFAULT_SETTINGS.alpha, hoursGoal: { ...DEFAULT_SETTINGS.hoursGoal }, workDaysGoal: DEFAULT_SETTINGS.workDaysGoal, prorateFirstWeek: DEFAULT_SETTINGS.prorateFirstWeek, neutralizeExcused: DEFAULT_SETTINGS.neutralizeExcused,
      goalScore: DEFAULT_SETTINGS.goalScore, scoreFloor: DEFAULT_SETTINGS.scoreFloor, scoreCap: DEFAULT_SETTINGS.scoreCap,
      weights: JSON.parse(JSON.stringify(DEFAULT_SETTINGS.weights)), allureSensibilite: DEFAULT_SETTINGS.allureSensibilite,
      ecartPointsPerPct: DEFAULT_SETTINGS.ecartPointsPerPct
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
