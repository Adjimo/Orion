// Données statiques du planning : groupe 8, option SI (MP* lycée Malherbe 2026-2027).
// Sources : emploi du temps annuel MPET + planning des DS et des colles.

// Jour : 1 = lundi … 6 = samedi.
// rule : null (chaque semaine) | 'tdsi' (une semaine sur deux) | 'itcTP' | 'itcCours'.
export const BASE_COURSES = [
  { id: 'lun-maths',   day: 1, start: '08:00', end: '10:00', title: 'Mathématiques', subj: 'maths',    teacher: 'Pinguet A.', room: 'R 032' },
  { id: 'lun-tipe',    day: 1, start: '10:00', end: '12:00', title: 'TIPE',          subj: 'tipe',     teacher: 'Caldara G., Pinguet A.' },
  { id: 'lun-physique',day: 1, start: '13:00', end: '15:00', title: 'Physique',      subj: 'physique', teacher: 'Caldara G.' },
  { id: 'mar-maths',   day: 2, start: '08:00', end: '10:00', title: 'Mathématiques', subj: 'maths',    teacher: 'Pinguet A.', room: 'R 032' },
  { id: 'mar-anglais', day: 2, start: '10:00', end: '12:00', title: 'Anglais',       subj: 'anglais',  teacher: 'Fontan E.' },
  { id: 'mar-francais',day: 2, start: '13:00', end: '15:00', title: 'Français',      subj: 'francais', teacher: 'Tribouillard S.' },
  { id: 'mar-tpitc',   day: 2, start: '15:00', end: '17:00', title: 'TP ITC',        subj: 'itc',      teacher: 'Le Berre A.', rule: 'itcTP' },
  { id: 'mer-tpphys',  day: 3, start: '08:00', end: '10:00', title: 'TP de physique',subj: 'tp-physique', teacher: 'Caldara G.' },
  { id: 'mer-tdmaths', day: 3, start: '10:00', end: '12:00', title: 'TD de maths',   subj: 'maths',    teacher: 'Pinguet A.', room: 'R 032' },
  { id: 'jeu-maths',   day: 4, start: '08:00', end: '10:00', title: 'Mathématiques', subj: 'maths',    teacher: 'Pinguet A.', room: 'R 032' },
  { id: 'jeu-physique',day: 4, start: '10:00', end: '13:00', title: 'Physique',      subj: 'physique', teacher: 'Caldara G.' },
  { id: 'jeu-si',      day: 4, start: '14:00', end: '15:00', title: 'Sciences industrielles', subj: 'si', teacher: 'Le Bail J.' },
  { id: 'jeu-itc',     day: 4, start: '15:00', end: '16:00', title: 'ITC',           subj: 'itc',      teacher: 'Le Berre A.', rule: 'itcCours' },
  { id: 'ven-physique',day: 5, start: '08:00', end: '10:00', title: 'Physique',      subj: 'physique', teacher: 'Caldara G.' },
  { id: 'ven-maths',   day: 5, start: '10:00', end: '12:00', title: 'Mathématiques', subj: 'maths',    teacher: 'Pinguet A.', room: 'R 032' },
  { id: 'sam-maths',   day: 6, start: '08:00', end: '10:00', title: 'Mathématiques', subj: 'maths',    teacher: 'Pinguet A.', room: 'R 032' },
  { id: 'sam-tdsi',    day: 6, start: '10:00', end: '12:00', title: 'TD de SI',      subj: 'si',       teacher: 'Le Bail J.', rule: 'tdsi' }
];

export const TDSI_ANCHOR = '2026-11-14';      // samedi avec TD de SI, puis toutes les 2 semaines
export const ITC_COURS_END = '2027-01-24';    // ITC : semestre 1 (hypothèse : jusqu'à fin janvier)
export const ITC_TP_LAST_INDEX = 14;          // TP ITC du groupe 8 (pair) : semaines paires 0 à 14
export const DS_DAY = 3;                      // mercredi
export const DS_START = '13:00';

// Lundis des semaines numérotées du planning des DS (la semaine 19 = concours blanc).
export const WEEK_STARTS = [
  '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-11-02', '2026-11-09',
  '2026-11-16', '2026-11-23', '2026-11-30', '2026-12-07', '2026-12-14', '2027-01-04', '2027-01-11',
  '2027-01-18', '2027-01-25', '2027-02-01', '2027-02-08', '2027-02-15', '2027-03-08', '2027-03-15'
];
export function weekIndexOf(monday) { const i = WEEK_STARTS.indexOf(monday); return i < 0 ? null : i; }

// Durées en heures : null = non communiquée.
const DUR = { physique: 3, maths: 3, anglais: 4, si: 2, francais: null, blanc: null };
// Un DS par index de semaine (indexé comme WEEK_STARTS ; 20 = aucun).
export const DS_BY_INDEX = [
  ['Physique', DUR.physique], ['Mathématiques (simulation)', DUR.maths], ['Français', DUR.francais],
  ['Mathématiques', DUR.maths], ['Physique', DUR.physique], ['Anglais', DUR.anglais],
  ['Mathématiques', DUR.maths], ['Français', DUR.francais], ['Physique', DUR.physique],
  ['Mathématiques', DUR.maths], ['SI', DUR.si], ['Anglais', DUR.anglais], ['Physique', DUR.physique],
  ['Français', DUR.francais], ['Mathématiques', DUR.maths], ['Physique', DUR.physique],
  ['Anglais', DUR.anglais], ['Mathématiques', DUR.maths], ['Physique', DUR.physique],
  ['Concours blanc', DUR.blanc], null
];

// Créneaux de colles (durée supposée : 1 h). day/start null = créneau personnel à choisir.
const h = (day, hour, who, room, subject) => ({ day, start: `${String(hour).padStart(2, '0')}:00`, teacher: who, room: room || null, subject });
export const COLLE_SLOTS = {
  M0: { day: 1, start: '07:20', teacher: 'M. Pinguet', room: 'R 032', subject: 'Mathématiques', note: 'Oral blanc (1er passage, lundi 7h20)' },
  M1: { day: 4, start: '07:20', teacher: 'M. Pinguet', room: 'R 032', subject: 'Mathématiques', note: 'Oral blanc (1er passage, jeudi 7h20)' },
  M2: h(1, 15, 'M. Pétel', '148', 'Mathématiques'),   M3: h(1, 16, 'M. Pétel', '148', 'Mathématiques'),
  M4: h(5, 13, 'M. Bardet', '407', 'Mathématiques'),  M5: h(5, 14, 'M. Bardet', '407', 'Mathématiques'),
  M6: h(5, 15, 'M. Bardet', '407', 'Mathématiques'),  M7: h(5, 14, 'M. Durdek', '153', 'Mathématiques'),
  M8: h(5, 15, 'M. Durdek', '153', 'Mathématiques'),  M9: h(5, 13, 'M. Fontaine', '410', 'Mathématiques'),
  M10: h(5, 14, 'M. Fontaine', '410', 'Mathématiques'), M11: h(2, 15, 'M. Pontreau', '410', 'Mathématiques'),
  M12: h(2, 16, 'M. Pontreau', '410', 'Mathématiques'), M13: h(2, 17, 'M. Pontreau', '410', 'Mathématiques'),
  P0: h(1, 15, 'M. Caldara', null, 'Physique'),    P1: h(1, 16, 'M. Caldara', null, 'Physique'),
  P2: h(4, 16, 'M. Caldara', null, 'Physique'),    P3: h(1, 17, 'M. Macquaire', null, 'Physique'),
  P4: h(2, 15, 'Mme Colombier', null, 'Physique'), P5: h(5, 14, 'M. Guillaume', null, 'Physique'),
  P6: h(5, 15, 'M. Guillaume', null, 'Physique'),
  A0: h(4, 16, 'Mme Fontan', '309', 'Anglais'),    A1: h(4, 17, 'Mme Fontan', '309', 'Anglais'),
  A2: h(5, 15, 'Mme Fontan', '148', 'Anglais'),    A3: h(1, 16, 'M. Menou', '108', 'Anglais'),
  A4: h(2, 16, 'M. Menou', '109', 'Anglais'),      A5: h(5, 13, 'Mme Zimmerman', '152', 'Anglais'),
  A6: h(5, 14, 'Mme Zimmerman', '152', 'Anglais'),
  F0: h(2, 15, 'Mme Tribouillard', null, 'Français')
};

// Rotation du groupe 8, par index de semaine (0-18, 20 ; la 19 n'a pas de colle).
export const COLLES_G8 = {
  0: ['M1', 'P3'], 1: ['M11', 'A3'], 2: ['M10', 'P6'], 3: ['M2', 'A4'], 4: ['M6', 'P1'],
  5: ['M7', 'A2', 'F0'], 6: ['M13', 'P5'], 7: ['M0', 'A4'], 8: ['M5', 'P2'], 9: ['M12', 'A6'],
  10: ['M10', 'P0'], 11: ['M7', 'A4'], 12: ['M5', 'P6'], 13: ['M3', 'A0'], 14: ['M1', 'P1'],
  15: ['M11', 'A4'], 16: ['M6', 'P3'], 17: ['M8', 'A1'], 18: ['M10', 'P4'], 20: ['M6', 'A6']
};
