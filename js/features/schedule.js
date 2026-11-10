// Programme hebdomadaire

export const DAYS = [
  { key: 'mon', label: 'Lundi' },
  { key: 'tue', label: 'Mardi' },
  { key: 'wed', label: 'Mercredi' },
  { key: 'thu', label: 'Jeudi' },
  { key: 'fri', label: 'Vendredi' },
  { key: 'sat', label: 'Samedi' },
  { key: 'sun', label: 'Dimanche' }
];

// Schedule recalibré pour la rentrée :
// - Travail : lun 4h / mar 4h / mer 2h30 / jeu 4h / ven 6h / sam 8h / dim 8h = 35h
// - Sport (catégories alignées sur les zones Daniels qui ont une séance hebdo) :
//   * lun : libre (plus d'objectif imposé)
//   * mar libre               → pas de séance course (renfo si tu veux, hors GPX)
//   * mer : libre (plus d'objectif imposé)
//   * jeu libre
//   * ven : libre
//   * sam / dim : libres (c'est toi qui choisis tes sorties)
export const DEFAULT_SCHEDULE = [
  { id: 'mon', sport: 'free',     sportType: null,            workHours: 4   },
  { id: 'tue', sport: 'free',     sportType: null,            workHours: 4   },
  { id: 'wed', sport: 'free',     sportType: null,            workHours: 2.5 },
  { id: 'thu', sport: 'free',     sportType: null,            workHours: 4   },
  { id: 'fri', sport: 'free',     sportType: null,            workHours: 6 },
  { id: 'sat', sport: 'free',     sportType: null,            workHours: 8 },
  { id: 'sun', sport: 'free',     sportType: null,            workHours: 8 }
];

// 5 catégories de sport. Toutes correspondent à une séance hebdo régulière
// (footing/fractionne/sortie-longue) ou à une sortie spécifique (trail).
export const SPORT_TYPES = {
  footing:        { label: 'Footing',         icon: 'run',  desc: 'Endurance facile (zone E)',        zone: 'E' },
  fractionne:     { label: 'Fractionné',      icon: 'bolt',  desc: 'VMA, intervalles courts (zone I)', zone: 'I' },
  'sortie-longue':{ label: 'Sortie longue',   icon: 'sunrise',  desc: 'Volume long, allure E/M' },
  trail:          { label: 'Trail',           icon: 'mountain',  desc: 'D+ et terrain technique' },
  rando:          { label: 'Randonnée',       icon: 'boot',  desc: 'Marche en terrain varié, D+' }
};

// Une randonnée est de la marche : elle donne de l'endurance mais ne compte ni
// comme « sortie course », ni pour les records, le VDOT ou l'allure de référence.
export function isRunActivity(a) {
  return !!a && a.type !== 'rando';
}
