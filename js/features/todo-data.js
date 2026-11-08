// Catalogue de la to-do hebdomadaire (page Planning, vue « À faire »).
// Physique : cycle dans l'ordre de la liste (EM8 = 12 pts, gros chapitre, seul dans sa semaine).

export const TODO_SUBJECTS = [
  { id: 'maths',    label: 'Mathématiques' },
  { id: 'physique', label: 'Physique' },
  { id: 'anglais',  label: 'Anglais' },
  { id: 'francais', label: 'Français' },
  { id: 'si',       label: 'Sciences de l\u2019ingénieur' },
  { id: 'autre',    label: 'Autre' }
];

// Chapitres avec poids ; le budget est en points par semaine.
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
  ]
};
export const TODO_BUDGET = { maths: 10, physique: 10 };

export const ANGLAIS_FIXED = { vocab: 'Vocabulaire', gram: 'Grammaire' };
export const ANGLAIS_ROTATION = ['Entraînement DS Centrale', 'Entraînement DS Mines-Ponts', 'Revoir les actualités de la semaine'];
export const FRANCAIS_ROTATION = ['Entraînement DS', 'Entraînement oral'];
export const SI_LABEL = 'Sciences de l\u2019ingénieur';

// Répartition par jour (1 = lundi … 7 = dimanche).
// Maths et physique : un chapitre par jour à partir du lundi, puis jours libres.
export const DAY_PLAN = { si: 5, anglaisSession: 6, francais: 7 };   // SI le vendredi, anglais (grammaire/rotation) le samedi, français le dimanche
export const VOCAB_DAYS = [1, 2, 3, 4, 5, 6, 7];                      // vocabulaire d'anglais tous les jours
