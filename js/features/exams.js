// Concours : compte à rebours et progression de l'année

export const SEED_EXAMS = [
  // Écrits 2027 (dates confirmées) : X/ENS 12-16 avril, CCINP 19-23 avril, Centrale 26-29 avril, Mines-Ponts 30 avril puis 3-5 mai.
  { id: 'exam-x-ens',       name: 'X — ENS',         short: 'X/ENS',      date: '2027-04-12', endDate: '2027-04-16', icon: '🏛️', enabled: true },
  { id: 'exam-ccinp',       name: 'CCINP',           short: 'CCINP',      date: '2027-04-19', endDate: '2027-04-23', icon: '🔬', enabled: true },
  { id: 'exam-centrale',    name: 'Centrale-Supélec',short: 'Centrale',   date: '2027-04-26', endDate: '2027-04-29', icon: '⚡', enabled: true },
  { id: 'exam-mines-ponts', name: 'Mines-Ponts',     short: 'Mines-Ponts',date: '2027-04-30', endDate: '2027-05-05', icon: '⛏️', enabled: true }
];

export function computeYearProgress(firstExamDateStr) {
  if (!firstExamDateStr) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const examDate = new Date(firstExamDateStr);
  examDate.setHours(0, 0, 0, 0);
  let candidateSept = new Date(examDate.getFullYear(), 8, 1);
  if (candidateSept > examDate) candidateSept = new Date(examDate.getFullYear() - 1, 8, 1);
  if (today < candidateSept) return 0;
  if (today >= examDate) return 1;
  const total = examDate - candidateSept;
  const elapsed = today - candidateSept;
  return total > 0 ? elapsed / total : 0;
}
