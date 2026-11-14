// Catégories des compétences : « sport » ou « travail » (la Discipline n'en a pas).
// Les sous-compétences de catégorie travail (Maths, Physique, SI / Info, Anglais, Français) sont les seules
// matières de la to-do, des cycles, des éléments récurrents et du temps de travail saisi dans Aujourd'hui.
export const CATEGORY_LABEL = { sport: 'Sport', travail: 'Travail' };

export const COMPETENCES = [
  { id: 'dex',  cat: 'sport',   subjects: [] },
  { id: 'math', cat: 'travail', subjects: [{ id: 'maths',    label: 'Maths',     work: 'maths' }] },
  { id: 'phys', cat: 'travail', subjects: [{ id: 'physique', label: 'Physique',  work: 'physique' }] },
  { id: 'si',   cat: 'travail', subjects: [{ id: 'si',       label: 'SI / Info', work: 'si' }] },
  { id: 'verb', cat: 'travail', subjects: [{ id: 'anglais',  label: 'Anglais',   work: 'langues' }, { id: 'francais', label: 'Français', work: 'francais' }] },
  { id: 'disc', cat: null,      subjects: [] }
];

export const categoryOf = (caracId) => COMPETENCES.find(c => c.id === caracId)?.cat || null;

// Matières de catégorie travail : `id` = clé de la to-do / des cycles ; `work` = clé du temps de travail (workLog.bySubject).
export const WORK_SUBJECTS = COMPETENCES.filter(c => c.cat === 'travail').flatMap(c => c.subjects);
export const WORK_IDS = WORK_SUBJECTS.map(s => s.id);
export const WORK_KEYS = WORK_SUBJECTS.map(s => s.work);
