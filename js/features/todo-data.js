// Catalogue par défaut de la to-do hebdomadaire (cycles, éditables dans l'onglet To-do).
// Physique : cycle dans l'ordre de la liste (EM8 = 12 pts, gros chapitre, seul dans sa semaine).

// Matières fixes (SI, autre, et anglais / français tant qu'ils n'ont pas de cycle) ; les matières à cycle (maths, physique, anglais, français et celles de l'utilisateur)
// viennent de todo-cycle.js, qui tient TODO_SUBJECTS à jour.
export const TODO_FIXED_SUBJECTS = [
  { id: 'anglais',  label: 'Anglais' },
  { id: 'francais', label: 'Français' },
  { id: 'si',       label: 'SI / Info' },
  { id: 'autre',    label: 'Autre' }
];
export const TODO_SUBJECTS = [...TODO_FIXED_SUBJECTS];   // remplacé par les matières du cycle + les fixes absentes (todo-cycle.js)

// Valeurs par défaut du cycle (chapitres avec poids ; budget en points par semaine).
export const TODO_CATALOG = {
  maths: [
    { name: 'Applications linéaires / matricielle', w: 2 }, { name: 'Réduction', w: 4 }, { name: 'Dualité', w: 1 },
    { name: 'Convexité', w: 1 }, { name: 'Espace euclidien', w: 4 }, { name: 'Espace normé', w: 5 },
    { name: 'Suites de fonctions', w: 1 }, { name: 'Intégration', w: 3 }, { name: 'Séries', w: 6 },
    { name: 'Probabilités', w: 4 }, { name: 'Équations différentielles', w: 4 }, { name: 'Calcul différentiel', w: 4 },
    { name: 'Groupes', w: 4 }, { name: 'Topologie induite', w: 1 }
  ],
  physique: [
    { name: 'Électrocinétique 1', w: 1 }, { name: 'Électrocinétique 2', w: 3 },
    { name: 'Mécanique 2', w: 4 }, { name: 'Mécanique 3', w: 2 },
    { name: 'Électromagnétisme 1', w: 3 }, { name: 'Électromagnétisme 2', w: 3 }, { name: 'Électromagnétisme 3', w: 3 },
    { name: 'Électromagnétisme 4', w: 3 }, { name: 'Électromagnétisme 5', w: 3 }, { name: 'Électromagnétisme 6', w: 3 },
    { name: 'Électromagnétisme 7', w: 4 }, { name: 'Électromagnétisme 8', w: 12 },
    { name: 'Optique 2', w: 4 }, { name: 'Optique 3', w: 4 }, { name: 'Optique 4', w: 4 }, { name: 'Optique 5', w: 4 },
    { name: 'Diffusion thermique', w: 5 },
    { name: 'Mécanique quantique 1', w: 4 }, { name: 'Mécanique quantique 2', w: 4 },
    { name: 'Physique statistique', w: 4 }, { name: 'Électrochimie', w: 4 },
    { name: 'Thermochimie 1', w: 3 }, { name: 'Thermochimie 2', w: 4 }
  ],
  // Anglais et français (v4.42) : cycles pondérés comme maths et physique (les DS pèsent plus que les actualités).
  anglais: [
    { name: 'Entraînement DS Centrale', w: 4 }, { name: 'Entraînement DS Mines-Ponts', w: 4 }, { name: 'Revoir les actualités de la semaine', w: 1 }
  ],
  francais: [
    { name: 'Entraînement DS', w: 4 }, { name: 'Entraînement oral', w: 3 }
  ]
};
export const TODO_BUDGET = { maths: 10, physique: 10, anglais: 8, francais: 4 };

export const ANGLAIS_FIXED = { vocab: 'Vocabulaire', gram: 'Grammaire' };
export const SI_LABEL = 'Sciences de l\u2019ingénieur';

// Jours par défaut des séances de chaque cycle (1 = lundi … 7 = dimanche) : réglables dans l'onglet To-do.
export const DEFAULT_CYCLE_DAYS = { maths: [1, 2, 3, 4, 5, 6, 7], physique: [1, 2, 3, 4, 5, 6, 7], anglais: [6], francais: [7] };
export const DEFAULT_VOCAB_DAYS = [1, 4, 5, 6, 7];   // vocabulaire d'anglais : tous les jours sauf mardi et mercredi
