// Calendrier scolaire (Normandie, zone B) et périodes de l'année 2026-2027.
// Module pur : aucune dépendance. Les dates sont des clés « YYYY-MM-DD ».

export const pad2 = (n) => String(n).padStart(2, '0');
export const dateKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export function parseKey(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
export function addDays(k, n) { const d = parseKey(k); d.setDate(d.getDate() + n); return dateKey(d); }
export function diffDays(a, b) {
  const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
  return Math.round((Date.UTC(pa[0], pa[1] - 1, pa[2]) - Date.UTC(pb[0], pb[1] - 1, pb[2])) / 86400000);
}
// Lundi (clé) de la semaine contenant la date `k`.
export function mondayOf(k) { const d = parseKey(k); d.setDate(d.getDate() - ((d.getDay() || 7) - 1)); return dateKey(d); }

export const SCHOOL_START = '2026-09-01';
export const EDT_END = '2027-03-28';            // dernier jour de l'emploi du temps fixe

// Vacances scolaires, zone B (Normandie), bornes incluses.
export const VACATIONS = [
  { name: 'Toussaint', from: '2026-10-17', to: '2026-11-01' },
  { name: 'Noël',      from: '2026-12-19', to: '2027-01-03' },
  { name: 'Hiver',     from: '2027-02-20', to: '2027-03-07' },
  { name: 'Printemps', from: '2027-04-17', to: '2027-05-02' }
];

// Jours fériés tombant sur un jour de classe.
export const HOLIDAYS = [
  { date: '2026-11-11', name: 'Armistice' },
  { date: '2026-12-25', name: 'Noël' },
  { date: '2027-01-01', name: 'Jour de l\u2019an' },
  { date: '2027-03-29', name: 'Lundi de Pâques' },
  { date: '2027-05-06', name: 'Ascension' },
  { date: '2027-05-17', name: 'Lundi de Pentecôte' }
];

// Périodes spéciales (par lundi de semaine). Dates des écrits : cf. features/exams.js.
export const REVISION_START = '2027-03-29';     // 2 semaines avant les écrits
export const CONCOURS_START = '2027-04-12';
export const ALLEGE_START = '2027-05-10';       // après les concours
export const YEAR_END = '2027-07-03';

export const MODE_LABELS = {
  normal: '', revision: 'Révisions', concours: 'Semaine de concours', allege: 'Emploi du temps allégé'
};

export function weekMode(monday) {
  if (monday >= ALLEGE_START) return 'allege';
  if (monday >= CONCOURS_START) return 'concours';
  if (monday >= REVISION_START) return 'revision';
  return 'normal';
}

export function dayInfo(k) {
  const vac = VACATIONS.find(v => k >= v.from && k <= v.to);
  const hol = HOLIDAYS.find(h => h.date === k);
  return { vacation: vac ? vac.name : null, holiday: hol ? hol.name : null };
}
