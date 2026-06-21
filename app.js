// ============================================================================
// Orion - app.js (vanilla JS)
// Webapp PWA pour gamifier prépa MP* + trail. Stockage local (IndexedDB).
// ============================================================================

'use strict';

// Version sémantique app affichée dans le profil. Incrémente à chaque release.
const APP_VERSION = '3.09';

// ============================================================================
// 1. ÉTAT GLOBAL
// ============================================================================

const State = {
  profile: null,
  quests: [],
  completions: [],
  activities: [],
  workLogs: [],
  exams: [],
  schedule: [],
  records: {},
  currentRoute: 'home',
  currentActivity: null,
  map: null,
  mapTrack: null,
  charts: {}
};

// ============================================================================
// 2. INDEXEDDB
// ============================================================================

const DB_NAME = 'orion';
const DB_VERSION = 3;
let _db;

function openDB() {
  return new Promise((resolve, reject) => {
    if (_db) return resolve(_db);
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('profile'))     db.createObjectStore('profile', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('quests'))      db.createObjectStore('quests', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('completions')) db.createObjectStore('completions', { keyPath: 'id', autoIncrement: true });
      if (!db.objectStoreNames.contains('activities'))  db.createObjectStore('activities', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('workLog'))     db.createObjectStore('workLog', { keyPath: 'date' });
      if (!db.objectStoreNames.contains('exams'))       db.createObjectStore('exams', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('schedule'))    db.createObjectStore('schedule', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('records'))     db.createObjectStore('records', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta'))        db.createObjectStore('meta', { keyPath: 'key' });
      // v3 : store dédié aux backups quotidiens automatiques. Clé = date YYYY-MM-DD.
      if (!db.objectStoreNames.contains('backups'))     db.createObjectStore('backups', { keyPath: 'date' });
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
  });
}

function tx(storeName, mode = 'readonly') {
  return openDB().then(db => db.transaction(storeName, mode).objectStore(storeName));
}

async function dbGet(store, key) {
  const s = await tx(store);
  return new Promise((resolve, reject) => {
    const r = s.get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function dbAll(store) {
  const s = await tx(store);
  return new Promise((resolve, reject) => {
    const r = s.getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
}

async function dbPut(store, value) {
  const s = await tx(store, 'readwrite');
  return new Promise((resolve, reject) => {
    const r = s.put(value);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function dbDelete(store, key) {
  const s = await tx(store, 'readwrite');
  return new Promise((resolve, reject) => {
    const r = s.delete(key);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

async function dbClear(store) {
  const s = await tx(store, 'readwrite');
  return new Promise((resolve, reject) => {
    const r = s.clear();
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

async function fullReset() {
  if (_db) _db.close();
  _db = null;
  await new Promise((resolve, reject) => {
    const r = indexedDB.deleteDatabase(DB_NAME);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
    r.onblocked = () => resolve();
  });
  location.reload();
}

// ============================================================================
// 3. UTILITAIRES DATE
// ============================================================================

function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function weekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function startOfWeek(d = new Date()) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function dayKeyFromDate(d = new Date()) {
  const map = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return map[d.getDay()];
}

// ============================================================================
// 4. XP / NIVEAUX / RANGS / COMPÉTENCES
// ============================================================================

function xpForLevelUp(level) {
  // Courbe quasi-linéaire : chaque niveau coûte ~1200 XP, +5 par level.
  // L1 = 1200, L100 = 1695, cumul L100 ≈ 145k.
  // Calibrée pour atteindre L100 aux concours avec 25-30h travail/sem
  // + 3 sorties/sem depuis sept 2026. Évite les level-ups instantanés en début
  // tout en restant tendu vers la fin (pas de plateau).
  return Math.round(1200 + (level - 1) * 5);
}

function deriveLevel(totalXp) {
  let level = 1, remaining = totalXp;
  while (remaining >= xpForLevelUp(level)) {
    remaining -= xpForLevelUp(level);
    level++;
    if (level > 200) break;
  }
  const need = xpForLevelUp(level);
  return { level, xpInLevel: remaining, xpToNext: need, progress: need > 0 ? remaining / need : 0 };
}

const SKILL_META = {
  endurance:  { label: 'Endurance',  icon: '🏃', color: '#5cc8ff', desc: 'Volume kilométrique.' },
  allure:     { label: 'Allure',     icon: '⚡', color: '#ff6a3d', desc: 'Performance pure.' },
  maths:      { label: 'Maths',      icon: '🧮', color: '#7c5cff', desc: 'DM, exos, démos.' },
  physique:   { label: 'Physique',   icon: '⚛️', color: '#a78bfa', desc: 'Mécanique, thermo, ondes.' },
  si:         { label: 'SI / Info',  icon: '🔬', color: '#f472b6', desc: 'Sciences ingé / info.' },
  langues:    { label: 'Anglais',    icon: '🌍', color: '#5cc8ff', desc: 'Anglais.' },
  lettres:    { label: 'Lettres',    icon: '✒️', color: '#ffd86b', desc: 'Français, philo.' },
  discipline: { label: 'Discipline', icon: '🧘', color: '#ff6a3d', desc: 'Régularité, focus.' }
};

const RANKS = [
  { from: 1,   to: 4,   title: 'Mortel',              color: '#a0a4b8' },
  { from: 5,   to: 9,   title: 'Initié',              color: '#5cc8ff' },
  { from: 10,  to: 14,  title: 'Aspirant',            color: '#7c5cff' },
  { from: 15,  to: 19,  title: 'Coureur',             color: '#ffb547' },
  { from: 20,  to: 29,  title: 'Marcheur du Soleil',  color: '#ffb547' },
  { from: 30,  to: 49,  title: 'Cendres',             color: '#ff6a3d' },
  { from: 50,  to: 74,  title: 'Renaissance',         color: '#ff6a3d' },
  { from: 75,  to: 99,  title: 'Phénix',              color: '#ffd86b' },
  { from: 100, to: 999, title: 'Orion',              color: '#ffd86b' }
];

function getRank(level) {
  for (const r of RANKS) if (level >= r.from && level <= r.to) return r;
  return RANKS[0];
}

function getNextRank(level) {
  for (const r of RANKS) if (level < r.from) return { rank: r, levelsAway: r.from - level };
  return null;
}

const DEFAULT_PROFILE = {
  id: 'me',
  name: 'Toi',
  createdAt: new Date().toISOString(),
  totalXp: 0,
  level: 1,
  skills: {
    endurance:  { xp: 0, level: 1 },
    allure:     { xp: 0, level: 1 },
    maths:      { xp: 0, level: 1 },
    physique:   { xp: 0, level: 1 },
    si:         { xp: 0, level: 1 },
    langues:    { xp: 0, level: 1 },
    lettres:    { xp: 0, level: 1 },
    discipline: { xp: 0, level: 1 }
  },
  lastActiveDate: null
};

async function awardXp(amount, skillGains = {}) {
  const profile = State.profile;
  if (!profile) return;
  const oldLevel = deriveLevel(profile.totalXp).level;
  profile.totalXp += amount;
  const nd = deriveLevel(profile.totalXp);
  profile.level = nd.level;
  const skillLevelUps = [];
  for (const [skill, gain] of Object.entries(skillGains)) {
    if (!profile.skills[skill]) continue;
    const oldL = deriveLevel(profile.skills[skill].xp).level;
    profile.skills[skill].xp += gain;
    const newL = deriveLevel(profile.skills[skill].xp).level;
    profile.skills[skill].level = newL;
    if (newL > oldL) skillLevelUps.push({ skill, from: oldL, to: newL });
  }
  await dbPut('profile', profile);
  return { leveledUp: nd.level > oldLevel, fromLevel: oldLevel, toLevel: nd.level, skillLevelUps };
}

async function removeXp(amount, skillGains = {}) {
  const profile = State.profile;
  if (!profile) return;
  profile.totalXp = Math.max(0, profile.totalXp - amount);
  for (const [skill, gain] of Object.entries(skillGains)) {
    if (!profile.skills[skill]) continue;
    profile.skills[skill].xp = Math.max(0, profile.skills[skill].xp - gain);
    profile.skills[skill].level = deriveLevel(profile.skills[skill].xp).level;
  }
  profile.level = deriveLevel(profile.totalXp).level;
  await dbPut('profile', profile);
}

// ============================================================================
// 5. SCHEDULE (programme hebdomadaire)
// ============================================================================

const DAYS = [
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
// - Sport (5 catégories alignées sur les zones Daniels qui ont une séance hebdo) :
//   * lun footing (E)         → endurance facile, récup mentale
//   * mar libre               → pas de séance course (renfo si tu veux, hors GPX)
//   * mer fractionné (I)      → VMA, intervalles courts
//   * jeu libre
//   * ven seuil (T)           → tempo, allure soutenue contrôlée
//   * sam OU dim sortie longue → volume, allure E/M
const DEFAULT_SCHEDULE = [
  { id: 'mon', sport: 'required', sportType: 'footing',       workHours: 4   },
  { id: 'tue', sport: 'free',     sportType: null,            workHours: 4   },
  { id: 'wed', sport: 'required', sportType: 'fractionne',    workHours: 2.5 },
  { id: 'thu', sport: 'free',     sportType: null,            workHours: 4   },
  { id: 'fri', sport: 'required', sportType: 'seuil',         workHours: 6   },
  { id: 'sat', sport: 'weekend',  sportType: 'sortie-longue', workHours: 8   },
  { id: 'sun', sport: 'weekend',  sportType: 'sortie-longue', workHours: 8   }
];

// 5 catégories de sport. Toutes correspondent à une séance hebdo régulière
// (footing/fractionne/seuil/sortie-longue) ou à une sortie spécifique (trail).
const SPORT_TYPES = {
  footing:        { label: 'Footing',         icon: '🏃',  desc: 'Endurance facile (zone E)',        zone: 'E' },
  seuil:          { label: 'Seuil',           icon: '🔥',  desc: 'Tempo, allure seuil (zone T)',     zone: 'T' },
  fractionne:     { label: 'Fractionné',      icon: '⚡',  desc: 'VMA, intervalles courts (zone I)', zone: 'I' },
  'sortie-longue':{ label: 'Sortie longue',   icon: '🌄',  desc: 'Volume long, allure E/M' },
  trail:          { label: 'Trail',           icon: '⛰️',  desc: 'D+ et terrain technique' }
};

async function getTodayPlan() {
  const sched = await dbAll('schedule');
  return sched.find(s => s.id === dayKeyFromDate());
}

// ============================================================================
// 6. WORK TIME (saisie de travail unifiée)
// ============================================================================

// Multiplicateurs calibrés pour que chaque skill progresse à un rythme proche
// du niveau global, étant donné une répartition réaliste du temps de travail
// (maths ~55%, physique ~40%, anglais ~5%, français ~5%, SI ~5%).
// Une matière qui prend une grande part du temps a un mult faible (déjà bcp d'XP),
// une matière minoritaire a un mult fort pour compenser.
const SUBJECTS = {
  maths:    { label: 'Maths',     icon: '🧮', skill: 'maths',      skillMult: 1.10 },
  physique: { label: 'Physique',  icon: '⚛️', skill: 'physique',   skillMult: 1.30 },
  si:       { label: 'SI / Info', icon: '🔬', skill: 'si',         skillMult: 4.00 },
  langues:  { label: 'Anglais',   icon: '🌍', skill: 'langues',    skillMult: 4.00 },
  francais: { label: 'Français',  icon: '✒️', skill: 'lettres',    skillMult: 4.00 },
  autre:    { label: 'Autre',     icon: '📖', skill: 'discipline', skillMult: 0.20 }
};

function baseXpForGoal(goalHours) {
  // Calibré pour atteindre L100 aux concours avec ~30h travail/semaine + sport.
  return Math.round(80 + goalHours * 60);
}

function computeWorkXp(actualMinutes, goalHours) {
  if (!goalHours || goalHours <= 0) return { xp: 0, ratio: 0, base: 0 };
  const goalMinutes = goalHours * 60;
  const base = baseXpForGoal(goalHours);
  const ratio = actualMinutes / goalMinutes;
  let xp;
  if (ratio <= 1) xp = Math.round(ratio * base);
  else xp = Math.round(base + Math.log(1 + (ratio - 1)) * base * 0.5);
  return { xp, ratio, base };
}

function formatMinutes(minutes) {
  if (!minutes) return '0';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, '0')}`;
}

function parseTimeInput(input) {
  if (!input) return 0;
  const str = String(input).trim().toLowerCase().replace(',', '.');
  let m = str.match(/^(\d+(?:\.\d+)?)\s*h\s*(\d+)?(?:min)?$/);
  if (m) return Math.round(parseFloat(m[1]) * 60 + (m[2] ? parseInt(m[2]) : 0));
  m = str.match(/^(\d+\.\d+)$/);
  if (m) return Math.round(parseFloat(m[1]) * 60);
  m = str.match(/^(\d+)\s*min$/);
  if (m) return parseInt(m[1]);
  const num = parseFloat(str);
  if (isNaN(num)) return 0;
  if (num <= 24) return Math.round(num * 60);
  return Math.round(num);
}

async function setSubjectMinutes(dateKey, subjectKey, newMinutes, goalHours) {
  const existing = await dbGet('workLog', dateKey);
  const bySubject = existing?.bySubject || {};
  bySubject[subjectKey] = Math.max(0, newMinutes || 0);
  if (bySubject[subjectKey] === 0) delete bySubject[subjectKey];
  return commitWorkLog(dateKey, bySubject, goalHours);
}

async function commitWorkLog(dateKey, bySubject, goalHours) {
  const existing = await dbGet('workLog', dateKey);
  const lastXp = existing?.lastXpAwarded || 0;
  const lastSkillsXp = existing?.lastSkillsAwarded || {};

  const totalMinutes = Object.values(bySubject).reduce((s, m) => s + m, 0);
  const { xp: newXp, ratio } = computeWorkXp(totalMinutes, goalHours);

  const newSkillsXp = {};
  if (totalMinutes > 0) {
    for (const [subj, mins] of Object.entries(bySubject)) {
      const meta = SUBJECTS[subj];
      if (!meta) continue;
      const portion = mins / totalMinutes;
      const mult = meta.skillMult ?? 0.6;
      newSkillsXp[meta.skill] = (newSkillsXp[meta.skill] || 0) + Math.round(newXp * portion * mult);
    }
  }
  // Discipline : juste un nudge (10%), pour ne pas qu'elle monte plus vite
  // que les matières avec une vraie charge horaire.
  newSkillsXp.discipline = (newSkillsXp.discipline || 0) + Math.round(newXp * 0.04);

  const xpDelta = newXp - lastXp;
  const skillsDelta = {};
  const allKeys = new Set([...Object.keys(lastSkillsXp), ...Object.keys(newSkillsXp)]);
  for (const k of allKeys) skillsDelta[k] = (newSkillsXp[k] || 0) - (lastSkillsXp[k] || 0);

  const posSkills = Object.fromEntries(Object.entries(skillsDelta).filter(([_, v]) => v > 0));
  const negSkills = Object.fromEntries(Object.entries(skillsDelta).filter(([_, v]) => v < 0).map(([k, v]) => [k, -v]));

  if (xpDelta > 0) {
    await awardXp(xpDelta, posSkills);
    if (Object.keys(negSkills).length) await removeXp(0, negSkills);
  } else if (xpDelta < 0) {
    await removeXp(-xpDelta, negSkills);
    if (Object.keys(posSkills).length) await awardXp(0, posSkills);
  } else {
    if (Object.keys(posSkills).length) await awardXp(0, posSkills);
    if (Object.keys(negSkills).length) await removeXp(0, negSkills);
  }

  await dbPut('workLog', {
    date: dateKey,
    totalMinutes,
    bySubject,
    goalHours,
    lastXpAwarded: newXp,
    lastSkillsAwarded: newSkillsXp,
    ratio,
    timestamp: new Date().toISOString()
  });

  return { totalMinutes, xp: newXp, xpDelta, ratio };
}

// ============================================================================
// 7. WEEKLY QUESTS
// ============================================================================

const SEED_WEEKLY_QUESTS = [
  // Principales — donnent des malus si pas faites (à partir du 2026-09-07)
  { id: 'wq-runs',    title: 'Sorties course', type: 'weekly-count', goalCount: 3, unit: 'sorties', skill: 'endurance',  icon: '🏃', color: '#ff6a3d', autoFromActivities: true, category: 'main' },
  { id: 'wq-work',    title: 'Heures de travail', type: 'weekly-hours', goalHours: 35, skill: 'discipline', icon: '⏱️', color: '#ffb547', autoFromWorkLog: true, category: 'main' },
  { id: 'wq-sleep',   title: 'Nuits ≥ 7h', type: 'weekly-count', goalCount: 7, unit: 'nuits', skill: 'discipline', icon: '🌙', color: '#5cc8ff', category: 'main' },
  // Secondaires — donnent des bonus si dépassées (à partir du 2026-09-07)
  { id: 'wq-langues', title: 'Anglais', type: 'weekly-hours', goalHours: 2, skill: 'langues', icon: '🌍', color: '#5cc8ff', autoFromLangues: true, category: 'secondary' },
  { id: 'wq-lettres', title: 'Lettres', type: 'weekly-hours', goalHours: 2, skill: 'lettres', icon: '✒️', color: '#ffd86b', autoFromLettres: true, category: 'secondary' },
  { id: 'wq-si',      title: 'SI / Info', type: 'weekly-hours', goalHours: 1.5, skill: 'si', icon: '🔬', color: '#f472b6', autoFromSi: true, category: 'secondary' }
];

function computeCountXp(actualCount, goalCount) {
  if (!goalCount) return { xp: 0, ratio: 0 };
  const base = 60 + goalCount * 36;
  const ratio = actualCount / goalCount;
  let xp;
  if (ratio <= 1) xp = Math.round(ratio * base);
  else xp = Math.round(base + Math.log(1 + (ratio - 1)) * base * 0.4);
  return { xp, ratio };
}

function computeHoursXp(actualMinutes, goalHours) {
  return computeWorkXp(actualMinutes, goalHours);
}

async function getCurrentCompletion(quest) {
  const wk = weekKey();
  const all = await dbAll('completions');
  return all.find(c => c.questId === quest.id && c.weekKey === wk);
}

async function setQuestValue(quest, newValue) {
  const wk = weekKey();
  const existing = await getCurrentCompletion(quest);
  const lastXp = existing?.lastXp || 0;
  const lastSkillsXp = existing?.lastSkillsXp || {};

  let newXp, ratio;
  if (quest.type === 'weekly-hours') {
    const r = computeHoursXp(newValue, quest.goalHours);
    newXp = r.xp; ratio = r.ratio;
  } else {
    const r = computeCountXp(newValue, quest.goalCount);
    newXp = r.xp; ratio = r.ratio;
  }

  const newSkillsXp = {};
  if (quest.skill) newSkillsXp[quest.skill] = Math.round(newXp * 0.7);
  newSkillsXp.discipline = (newSkillsXp.discipline || 0) + Math.round(newXp * 0.03);

  const xpDelta = newXp - lastXp;
  const skillsDelta = {};
  const allKeys = new Set([...Object.keys(lastSkillsXp), ...Object.keys(newSkillsXp)]);
  for (const k of allKeys) skillsDelta[k] = (newSkillsXp[k] || 0) - (lastSkillsXp[k] || 0);
  const posSkills = Object.fromEntries(Object.entries(skillsDelta).filter(([_, v]) => v > 0));
  const negSkills = Object.fromEntries(Object.entries(skillsDelta).filter(([_, v]) => v < 0).map(([k, v]) => [k, -v]));

  if (xpDelta > 0) {
    await awardXp(xpDelta, posSkills);
    if (Object.keys(negSkills).length) await removeXp(0, negSkills);
  } else if (xpDelta < 0) {
    await removeXp(-xpDelta, negSkills);
    if (Object.keys(posSkills).length) await awardXp(0, posSkills);
  } else {
    if (Object.keys(posSkills).length) await awardXp(0, posSkills);
    if (Object.keys(negSkills).length) await removeXp(0, negSkills);
  }

  const record = {
    questId: quest.id,
    date: todayKey(),
    weekKey: wk,
    actualValue: newValue,
    lastXp: newXp,
    lastSkillsXp: newSkillsXp,
    xp: newXp,
    skills: newSkillsXp,
    ratio,
    timestamp: new Date().toISOString()
  };
  if (existing) record.id = existing.id;
  await dbPut('completions', record);
  return { newXp, xpDelta, ratio };
}

async function recomputeAutoQuests() {
  const ws = startOfWeek();
  // todayKey() respecte la timezone locale, contrairement à toISOString().
  // Sans ça, lun 00:30 local renvoie un timestamp dimanche en UTC et la
  // quête de la nouvelle semaine pioche les workLogs de la semaine d'avant.
  const weekStart = todayKey(ws);
  const acts = await dbAll('activities');
  const logs = await dbAll('workLog');
  const quests = await dbAll('quests');

  const sortiesQ = quests.find(q => q.id === 'wq-runs');
  if (sortiesQ) {
    const weekActs = acts.filter(a => new Date(a.date) >= ws);
    // On compte toutes les sorties de course (renforcement n'en est pas une).
    const courseCount = weekActs.filter(a =>
      ['footing', 'seuil', 'fractionne', 'sortie-longue', 'trail', 'course'].includes(a.type)
    ).length;
    await setQuestValue(sortiesQ, courseCount);
  }
  const workQ = quests.find(q => q.id === 'wq-work');
  if (workQ) {
    const weekLogs = logs.filter(l => l.date >= weekStart);
    const totalMin = weekLogs.reduce((s, l) => s + (l.totalMinutes || 0), 0);
    await setQuestValue(workQ, totalMin);
  }
  const langQ = quests.find(q => q.id === 'wq-langues');
  if (langQ) {
    const weekLogs = logs.filter(l => l.date >= weekStart);
    let langMin = 0;
    for (const l of weekLogs) {
      const bs = l.bySubject || {};
      langMin += (bs.langues || 0);
    }
    await setQuestValue(langQ, langMin);
  }
  const lettresQ = quests.find(q => q.id === 'wq-lettres');
  if (lettresQ) {
    const weekLogs = logs.filter(l => l.date >= weekStart);
    let lettresMin = 0;
    for (const l of weekLogs) {
      const bs = l.bySubject || {};
      lettresMin += (bs.francais || 0);
    }
    await setQuestValue(lettresQ, lettresMin);
  }
  const siQ = quests.find(q => q.id === 'wq-si');
  if (siQ) {
    const weekLogs = logs.filter(l => l.date >= weekStart);
    let siMin = 0;
    for (const l of weekLogs) {
      const bs = l.bySubject || {};
      siMin += (bs.si || 0);
    }
    await setQuestValue(siQ, siMin);
  }
}

// ============================================================================
// 8. EXAMS (concours)
// ============================================================================

const SEED_EXAMS = [
  { id: 'exam-x-ens',       name: 'X — ENS',         short: 'X/ENS',      date: '2027-04-19', icon: '🏛️', enabled: true },
  { id: 'exam-mines-ponts', name: 'Mines-Ponts',     short: 'Mines-Ponts',date: '2027-04-26', icon: '⛏️', enabled: true },
  { id: 'exam-centrale',    name: 'Centrale-Supélec',short: 'Centrale',   date: '2027-05-03', icon: '⚡', enabled: true },
  { id: 'exam-ccinp',       name: 'CCINP',           short: 'CCINP',      date: '2027-05-10', icon: '🔬', enabled: true }
];

function daysUntil(dateStr) {
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((target.getTime() - today.getTime()) / 86400000);
}

function formatCountdown(days) {
  if (days < 0) return 'Passé';
  if (days === 0) return 'Aujourd\'hui';
  if (days === 1) return 'Demain';
  if (days < 60) return `J-${days}`;
  if (days < 365) return `${Math.floor(days / 30)} mois`;
  const years = Math.floor(days / 365);
  const remMonths = Math.floor((days % 365) / 30);
  return remMonths > 0 ? `${years}a ${remMonths}m` : `${years}a`;
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function computeYearProgress(firstExamDateStr) {
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

// ============================================================================
// 8.b BONUS / MALUS (à partir de la rentrée 2026-09-07)
// ============================================================================

// Date à partir de laquelle bonus et malus s'activent.
// Premier lundi de septembre 2026.
const PENALTIES_START = '2026-09-07';

function arePenaltiesActive(refDate = new Date()) {
  const start = new Date(PENALTIES_START + 'T00:00:00');
  return refDate >= start;
}

// Paliers de malus appliqués sur le XP qu'aurait rapporté la quête à 100%.
// Plus tu es loin de l'objectif, plus tu perds.
function malusFactorFromRatio(ratio) {
  if (ratio >= 1)    return 0;
  if (ratio >= 0.8)  return 0.10;
  if (ratio >= 0.5)  return 0.20;
  if (ratio >= 0.25) return 0.40;
  if (ratio > 0)     return 0.60;
  return 0.80;
}

// Bonus pour les quêtes secondaires : récompense le dépassement,
// proportionnel à (ratio - 1) × XP plafond × 0.5, capé à +50%.
function bonusFactorFromRatio(ratio) {
  if (ratio <= 1) return 0;
  return Math.min(0.5, (ratio - 1) * 0.5);
}

// Calcule le XP de référence (ce qu'une quête rapporterait à 100%).
function questFullXp(quest) {
  if (quest.type === 'weekly-hours') return computeHoursXp(quest.goalHours * 60, quest.goalHours).xp;
  return computeCountXp(quest.goalCount, quest.goalCount).xp;
}

// XP gagné un jour donné (l'unique source quotidienne suivie est le travail).
async function xpEarnedOnDay(dateKey) {
  const log = await dbGet('workLog', dateKey);
  return log?.lastXpAwarded || 0;
}

// XP gagné dans une semaine ISO donnée : workLogs + completions hebdo + activités.
async function xpEarnedInWeek(wk) {
  const logs = await dbAll('workLog');
  const completions = await dbAll('completions');
  const acts = await dbAll('activities');
  let total = 0;
  for (const l of logs) {
    if (weekKey(new Date(l.date + 'T00:00:00')) === wk) total += l.lastXpAwarded || 0;
  }
  for (const c of completions) {
    if (c.weekKey === wk) total += c.lastXp || 0;
  }
  for (const a of acts) {
    if (a.date && weekKey(new Date(a.date)) === wk) total += a.xpAwarded || 0;
  }
  return total;
}

// Tick : à chaque chargement de l'app, on regarde si on a passé une frontière
// jour/semaine et on applique malus + bonus pour les périodes terminées.
// Les ID de période traités sont stockés dans `meta` pour idempotence.
// Le malus principal est en POURCENTAGE du XP gagné dans la période — pas un
// montant fixe : c'est plus lisible et plus juste (semaine peu productive →
// malus petit en absolu, semaine intense → malus proportionnel).
// Note : éditer le workLog d'un jour déjà finalisé NE re-déclenche PAS le malus —
// l'évaluation est définitive au passage de minuit.
async function applyPendingPenalties() {
  if (!arePenaltiesActive()) return { applied: [], skipped: 'Avant le ' + PENALTIES_START };
  const today = new Date();
  const todayK = todayKey(today);
  const startK = PENALTIES_START;
  const applied = [];

  // ── Malus quotidien sur le travail (% du XP gagné ce jour-là) ────────────
  const lastDailyMeta = await dbGet('meta', 'lastDailyPenalty');
  const lastDaily = lastDailyMeta?.value || startK;
  let cursor = new Date(lastDaily + 'T00:00:00');
  cursor.setDate(cursor.getDate() + 1);
  while (cursor < new Date(todayK + 'T00:00:00')) {
    const dk = todayKey(cursor);
    if (dk >= startK) {
      const sched = await dbAll('schedule');
      const dayK = ['sun','mon','tue','wed','thu','fri','sat'][cursor.getDay()];
      const plan = sched.find(s => s.id === dayK);
      const goalHours = plan?.workHours || 0;
      if (goalHours > 0) {
        const log = await dbGet('workLog', dk);
        const actualMin = log?.totalMinutes || 0;
        const ratio = actualMin / (goalHours * 60);
        const factor = malusFactorFromRatio(ratio);
        if (factor > 0) {
          const dayXp = log?.lastXpAwarded || 0;
          const malusXp = Math.round(dayXp * factor);
          if (malusXp > 0) {
            await removeXp(malusXp, { discipline: Math.round(malusXp * 0.20) });
            applied.push({ kind: 'daily-work', date: dk, xp: malusXp, percent: factor, ratio });
          }
        }
      }
    }
    await dbPut('meta', { key: 'lastDailyPenalty', value: dk });
    cursor.setDate(cursor.getDate() + 1);
  }

  // ── Malus + bonus hebdo ──────────────────────────────────────────────────
  const lastWeeklyMeta = await dbGet('meta', 'lastWeeklyPenalty');
  const startWk = weekKey(new Date(startK + 'T00:00:00'));
  const lastWeekly = lastWeeklyMeta?.value || prevWeekKey(startWk);
  const currentWk = weekKey(today);
  let wk = nextWeekKey(lastWeekly);
  while (wk < currentWk) {
    if (wk >= startWk) {
      const completions = await dbAll('completions');
      const quests = await dbAll('quests');
      const weekXp = await xpEarnedInWeek(wk);

      // Cumule les facteurs des principales ratées, capé à 80%.
      let totalMalusFactor = 0;
      const malusDetails = [];
      for (const q of quests.filter(x => x.category === 'main')) {
        const c = completions.find(x => x.questId === q.id && x.weekKey === wk);
        const ratio = c?.ratio || 0;
        const f = malusFactorFromRatio(ratio);
        if (f > 0) {
          totalMalusFactor += f;
          malusDetails.push({ questId: q.id, factor: f, ratio });
        }
      }
      totalMalusFactor = Math.min(0.8, totalMalusFactor);
      if (totalMalusFactor > 0 && weekXp > 0) {
        const malusXp = Math.round(weekXp * totalMalusFactor);
        await removeXp(malusXp, { discipline: Math.round(malusXp * 0.20) });
        applied.push({ kind: 'weekly-malus', week: wk, xp: malusXp, percent: totalMalusFactor, weekXp, details: malusDetails });
      }

      // Bonus secondaires : un par quête, sur le XP de référence de la quête.
      for (const q of quests.filter(x => x.category === 'secondary')) {
        const c = completions.find(x => x.questId === q.id && x.weekKey === wk);
        const ratio = c?.ratio || 0;
        const f = bonusFactorFromRatio(ratio);
        if (f > 0) {
          const fullXp = questFullXp(q);
          const bonusXp = Math.round(fullXp * f);
          const skills = {};
          if (q.skill) skills[q.skill] = Math.round(bonusXp * 0.7);
          skills.discipline = (skills.discipline || 0) + Math.round(bonusXp * 0.03);
          await awardXp(bonusXp, skills);
          applied.push({ kind: 'weekly-bonus', questId: q.id, week: wk, xp: bonusXp, percent: f, ratio });
        }
      }
    }
    await dbPut('meta', { key: 'lastWeeklyPenalty', value: wk });
    wk = nextWeekKey(wk);
  }

  return { applied };
}

// Helpers semaine ISO : passer à la suivante / précédente sur format `YYYY-Www`.
function nextWeekKey(wk) {
  const m = wk.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return wk;
  const year = parseInt(m[1]);
  const week = parseInt(m[2]);
  // Repère un jeudi de la semaine donnée → +7j → re-format.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Mon = new Date(jan4); week1Mon.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
  const targetMon = new Date(week1Mon);
  targetMon.setUTCDate(week1Mon.getUTCDate() + (week - 1) * 7 + 7);
  return weekKey(targetMon);
}

function prevWeekKey(wk) {
  const m = wk.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return wk;
  const year = parseInt(m[1]);
  const week = parseInt(m[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Mon = new Date(jan4); week1Mon.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
  const targetMon = new Date(week1Mon);
  targetMon.setUTCDate(week1Mon.getUTCDate() + (week - 1) * 7 - 7);
  return weekKey(targetMon);
}

// ============================================================================
// 9. GPX PARSING
// ============================================================================

function parseGpx(text) {
  const xml = new DOMParser().parseFromString(text, 'application/xml');
  if (xml.querySelector('parsererror')) throw new Error('GPX invalide');

  const name = xml.querySelector('trk > name')?.textContent
            || xml.querySelector('metadata > name')?.textContent || 'Sortie';

  const trkpts = Array.from(xml.querySelectorAll('trkpt, rtept'));
  if (trkpts.length < 2) throw new Error('GPX trop court');

  const points = trkpts.map(pt => {
    const lat = parseFloat(pt.getAttribute('lat'));
    const lon = parseFloat(pt.getAttribute('lon'));
    const ele = pt.querySelector('ele') ? parseFloat(pt.querySelector('ele').textContent) : null;
    const time = pt.querySelector('time') ? new Date(pt.querySelector('time').textContent).getTime() : null;
    return { lat, lon, ele, time };
  }).filter(p => !isNaN(p.lat) && !isNaN(p.lon));

  let distance = 0, elevGain = 0, elevLoss = 0, lastEle = points[0].ele;
  const NOISE = 1.5;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    distance += haversine(a.lat, a.lon, b.lat, b.lon);
    if (b.ele !== null && lastEle !== null) {
      const diff = b.ele - lastEle;
      if (Math.abs(diff) >= NOISE) {
        if (diff > 0) elevGain += diff;
        else elevLoss += -diff;
        lastEle = b.ele;
      }
    } else if (b.ele !== null) lastEle = b.ele;
  }

  const firstTime = points.find(p => p.time)?.time;
  const lastTime = [...points].reverse().find(p => p.time)?.time;
  const duration = (firstTime && lastTime) ? Math.round((lastTime - firstTime) / 1000) : 0;
  const distanceKm = distance / 1000;
  const avgSpeed = duration > 0 ? distanceKm / (duration / 3600) : 0;
  const avgPace = duration > 0 && distanceKm > 0 ? duration / distanceKm : 0;

  return {
    name, points,
    distance: Math.round(distance),
    distanceKm: Math.round(distanceKm * 100) / 100,
    elevGain: Math.round(elevGain),
    elevLoss: Math.round(elevLoss),
    duration,
    avgPace: Math.round(avgPace),
    avgSpeed: Math.round(avgSpeed * 10) / 10,
    date: firstTime ? new Date(firstTime).toISOString() : new Date().toISOString()
  };
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = x => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Détecte la catégorie d'une sortie. Combine la date (week-end ?) à l'analyse
// de la trace (D+/km pour le trail, variance d'allure pour le fractionné).
// Retourne 'footing' | 'trail' | 'fractionne' | 'sortie-longue'.
function detectActivityType(parsed) {
  const date = new Date(parsed.date);
  const dayOfWeek = date.getDay(); // 0 = dimanche, 6 = samedi
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const dPlusPerKm = parsed.distanceKm > 0 ? parsed.elevGain / parsed.distanceKm : 0;
  const isLong = parsed.distanceKm >= 12; // sortie longue typique du week-end

  // Trail : beaucoup de D+ par km, prioritaire (peut être un trail le dimanche).
  if (dPlusPerKm > 25) return 'trail';

  // Sortie week-end : samedi ou dimanche ET distance "longue".
  if (isWeekend && isLong) return 'sortie-longue';

  // Fractionné : on regarde la variance des speeds entre points consécutifs.
  if (detectFractionnePattern(parsed.points)) return 'fractionne';

  return 'footing';
}

// Vrai si la trace présente une alternance significative entre phases rapides
// et phases lentes — signe d'un fractionné. Heuristique : on segmente en
// fenêtres de 30s, on calcule l'allure de chaque fenêtre, et si la dispersion
// (écart-type / moyenne) dépasse 0.18 ET qu'au moins 4 alternances ont lieu,
// c'est un fractionné.
function detectFractionnePattern(points) {
  if (!points || points.length < 30) return false;
  const windows = [];
  let winStart = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[winStart], b = points[i];
    if (!a.time || !b.time) { winStart = i; continue; }
    if ((b.time - a.time) >= 30000) { // fenêtre de 30s
      let dist = 0;
      for (let j = winStart + 1; j <= i; j++) {
        const p = points[j - 1], q = points[j];
        dist += haversine(p.lat, p.lon, q.lat, q.lon);
      }
      const dt = (b.time - a.time) / 1000;
      const speed = dist / dt; // m/s
      windows.push(speed);
      winStart = i;
    }
  }
  if (windows.length < 8) return false;
  const mean = windows.reduce((s, v) => s + v, 0) / windows.length;
  if (mean <= 0) return false;
  const variance = windows.reduce((s, v) => s + (v - mean) ** 2, 0) / windows.length;
  const cv = Math.sqrt(variance) / mean; // coefficient de variation
  // Compte les "alternances" : transitions au-dessus / au-dessous de la moyenne.
  let alt = 0;
  for (let i = 1; i < windows.length; i++) {
    if ((windows[i] >= mean) !== (windows[i - 1] >= mean)) alt++;
  }
  return cv >= 0.18 && alt >= 4;
}

// Génère un nom par défaut pour une activité importée selon sa catégorie + date.
function defaultActivityName(category, date) {
  const meta = SPORT_TYPES[category] || SPORT_TYPES.footing;
  const d = new Date(date);
  const dayLabel = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${meta.label} · ${dayLabel}`;
}

// Icône d'une activité selon son type (toutes catégories : nouvelles + legacy).
function activityTypeIcon(type) {
  return SPORT_TYPES[type]?.icon
    || (type === 'trail' ? '⛰️' : type === 'rando' ? '🥾' : '🏃');
}

// Analyse une trace de fractionné : segmente en phases d'effort et de récupération
// par seuillage de la vitesse autour d'une médiane glissante. Renvoie la liste
// des intervalles { kind: 'effort' | 'repos', duration: s, distance: m, avgPace: s/km }.
function analyseIntervals(points) {
  if (!points || points.length < 10) return [];
  // Construit une série de points avec speed instantanée (m/s) lissée sur 5s.
  const series = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (!a.time || !b.time) continue;
    const dt = (b.time - a.time) / 1000;
    if (dt <= 0) continue;
    const dist = haversine(a.lat, a.lon, b.lat, b.lon);
    series.push({ t: b.time, speed: dist / dt, dist, dt });
  }
  if (series.length < 10) return [];

  // Calcule la médiane des speeds.
  const sortedSpeeds = [...series.map(s => s.speed)].sort((a, b) => a - b);
  const median = sortedSpeeds[Math.floor(sortedSpeeds.length / 2)];
  // Seuils : effort > 1.15 × médiane, repos < 0.85 × médiane. Hystérésis.
  const effortThr = median * 1.15;
  const reposThr = median * 0.85;

  // Classe chaque échantillon, en évitant les sauts trop courts (< 8s).
  const intervals = [];
  let cur = null; // {kind, startIdx}
  for (let i = 0; i < series.length; i++) {
    const sp = series[i].speed;
    let kind;
    if (sp >= effortThr) kind = 'effort';
    else if (sp <= reposThr) kind = 'repos';
    else kind = cur?.kind || 'repos'; // zone neutre : on conserve le précédent
    if (!cur) {
      cur = { kind, startIdx: i };
    } else if (cur.kind !== kind) {
      // Ferme le précédent, ouvre le nouveau.
      const seg = series.slice(cur.startIdx, i);
      const dur = seg.reduce((s, p) => s + p.dt, 0);
      const dist = seg.reduce((s, p) => s + p.dist, 0);
      // On filtre les segments trop courts pour ne pas avoir de bruit.
      if (dur >= 8) {
        intervals.push({
          kind: cur.kind,
          duration: Math.round(dur),
          distance: Math.round(dist),
          avgPace: dist > 0 ? Math.round(dur / (dist / 1000)) : 0
        });
      }
      cur = { kind, startIdx: i };
    }
  }
  if (cur) {
    const seg = series.slice(cur.startIdx);
    const dur = seg.reduce((s, p) => s + p.dt, 0);
    const dist = seg.reduce((s, p) => s + p.dist, 0);
    if (dur >= 8) {
      intervals.push({
        kind: cur.kind,
        duration: Math.round(dur),
        distance: Math.round(dist),
        avgPace: dist > 0 ? Math.round(dur / (dist / 1000)) : 0
      });
    }
  }
  return intervals;
}

function formatDuration(seconds) {
  if (!seconds) return '—';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatPace(secondsPerKm) {
  if (!secondsPerKm) return '—';
  const m = Math.floor(secondsPerKm / 60);
  const s = Math.round(secondsPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}/km`;
}

// Calcul XP d'une activité GPX, basé sur deux dimensions séparées :
// - ENDURANCE : strictement proportionnel au volume kilométrique. Plus tu cours
//   loin, plus tu gagnes — indépendamment de la vitesse.
// - ALLURE : reflète la performance pure. Plus tu es rapide (allure plus
//   basse en s/km), plus tu gagnes. Référence : footing à 5:30/km = 0 bonus,
//   chaque seconde gagnée par km = bonus, plafonné à un seuil "élite" de 3:30/km.
//
// Le type de sortie module la pondération :
//   - footing       : équilibré
//   - fractionne    : prime à l'allure
//   - trail         : prime à l'endurance + bonus D+
//   - sortie-longue     : XP doublé (sortie longue, effort soutenu)
//   - renforcement  : forfait minimal (séance courte non-GPS)
function activityXp(parsed, category) {
  const cat = category || parsed.type || 'footing';
  const km = parsed.distanceKm || 0;
  const dPlus = parsed.elevGain || 0;
  const avgPaceSec = parsed.avgPace || 0; // s/km, 0 si pas de timing
  const PACE_REF = 5 * 60 + 30;     // 5:30/km = 0 bonus
  const PACE_MIN = 3 * 60 + 30;     // 3:30/km = bonus max
  const PACE_MAX = 7 * 60 + 30;     // au-delà : bonus négatif (très lent)

  // Endurance : 25 XP/km de base
  let enduranceXp = Math.round(km * 25);

  // Allure : intensité (0 = ref, 1 = élite, négatif = en deçà ref)
  let intensity = 0;
  if (avgPaceSec > 0) {
    if (avgPaceSec <= PACE_REF) {
      intensity = (PACE_REF - avgPaceSec) / (PACE_REF - PACE_MIN);
    } else {
      intensity = (PACE_REF - avgPaceSec) / (PACE_MAX - PACE_REF);
    }
    intensity = Math.max(-0.5, Math.min(1, intensity));
  }
  // Allure XP scale linéairement avec le kilométrage : courir 10 km à 4:00 vaut
  // plus que 3 km à 4:00, mais l'XP ne dépend QUE de la vitesse via intensity.
  let allureXp = Math.round(km * 25 * intensity);

  // Modulations par catégorie. Les bonus reflètent la difficulté physiologique :
  // les zones plus intenses (T, I) sont plus dures donc allure XP majorée.
  let categoryBonus = 0;
  if (cat === 'trail') {
    enduranceXp = Math.round(enduranceXp * 1.1);
    categoryBonus = Math.round(dPlus * 1.2); // bonus D+ exclusif au trail
  } else if (cat === 'seuil') {
    // Zone T : tempo, allure soutenue contrôlée
    allureXp = Math.round(allureXp * 1.30);
  } else if (cat === 'fractionne') {
    // Zone I : VMA
    allureXp = Math.round(allureXp * 1.5);
  } else if (cat === 'sortie-longue') {
    enduranceXp = Math.round(enduranceXp * 2);
    allureXp = Math.round(allureXp * 1.3);
  }
  // 'footing' (E) : pas de modulation, baseline

  const totalXp = Math.max(0, enduranceXp + Math.max(0, allureXp) + categoryBonus);
  return {
    xp: totalXp,
    skills: {
      endurance: enduranceXp,
      allure: Math.max(0, allureXp),
      discipline: 8
    }
  };
}

// ============================================================================
// 10. RECORDS (sport)
// ============================================================================

const RECORD_TYPES = [
  { id: 'longest',    label: 'Plus longue sortie', icon: '🌄', metric: 'distanceKm', mode: 'max' },
  { id: 'highest',    label: 'Plus gros D+',       icon: '⛰️', metric: 'elevGain',   mode: 'max' },
  { id: 'fastest5k',  label: 'Meilleur 5K',        icon: '⏱️', metric: 'best5k',     mode: 'min' },
  { id: 'fastest10k', label: 'Meilleur 10K',       icon: '⏱️', metric: 'best10k',    mode: 'min' },
  { id: 'longestDur', label: 'Plus long temps',    icon: '⏱️', metric: 'duration',   mode: 'max' }
];

function bestSplit(points, distanceTarget) {
  if (!points || points.length < 2) return null;
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1] + haversine(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon));
  }
  if (cum[cum.length - 1] < distanceTarget) return null;
  let best = Infinity, j = 0;
  for (let i = 0; i < points.length; i++) {
    while (j < points.length && cum[j] - cum[i] < distanceTarget) j++;
    if (j >= points.length) break;
    if (!points[i].time || !points[j].time) continue;
    const dt = (points[j].time - points[i].time) / 1000;
    if (dt > 0 && dt < best) best = dt;
  }
  return best === Infinity ? null : best;
}

function computeSplits(parsed) {
  const splits = {};
  const b1 = bestSplit(parsed.points, 1000);
  const b5 = bestSplit(parsed.points, 5000);
  const b10 = bestSplit(parsed.points, 10000);
  const bSemi = bestSplit(parsed.points, 21097);
  if (b1) splits.best1k = b1;
  if (b5) splits.best5k = b5;
  if (b10) splits.best10k = b10;
  if (bSemi) splits.bestSemi = bSemi;
  // Splits kilomètre par kilomètre (perfs par km).
  splits.kmSplits = computeKmSplits(parsed.points);
  return splits;
}

// Pour chaque km franchi, calcule durée, allure (s/km), et D+ partiel.
// Renvoie [{ km: 1, distance: 1000, duration: 312, pace: 312, elevGain: 5 }, ...]
function computeKmSplits(points) {
  if (!points || points.length < 2) return [];
  const splits = [];
  let cumDist = 0;
  let kmStart = 0;        // index de début du km en cours
  let kmStartDist = 0;    // distance cumulée au début du km en cours
  let kmGain = 0;         // D+ accumulé dans le km en cours
  let lastEle = points[0].ele;
  const NOISE = 1.5;

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    cumDist += haversine(a.lat, a.lon, b.lat, b.lon);
    if (b.ele !== null && lastEle !== null) {
      const dEle = b.ele - lastEle;
      if (Math.abs(dEle) >= NOISE) {
        if (dEle > 0) kmGain += dEle;
        lastEle = b.ele;
      }
    } else if (b.ele !== null) {
      lastEle = b.ele;
    }
    // A-t-on franchi un nouveau km ?
    while (cumDist - kmStartDist >= 1000) {
      // Interpolation pour trouver le timestamp précis au km franchi.
      const tStart = points[kmStart].time;
      const tEnd = b.time;
      let dur = 0;
      if (tStart && tEnd) {
        // On approxime : la fraction du segment où on franchit le km.
        const distInSeg = haversine(a.lat, a.lon, b.lat, b.lon);
        const distLeftInKm = 1000 - (cumDist - distInSeg - kmStartDist);
        const fracInSeg = distInSeg > 0 ? distLeftInKm / distInSeg : 0;
        const tCross = a.time + (b.time - a.time) * fracInSeg;
        dur = (tCross - tStart) / 1000;
      }
      const km = splits.length + 1;
      splits.push({
        km,
        distance: 1000,
        duration: Math.round(dur),
        pace: dur > 0 ? Math.round(dur) : 0,
        elevGain: Math.round(kmGain)
      });
      kmStart = i;
      kmStartDist += 1000;
      kmGain = 0;
    }
  }

  // Optionnel : on n'inclut pas le km partiel final (< 1000 m), peu utile.
  return splits;
}

// Estimateur VO2max basé sur la formule de Riegel + Daniels.
// Pour un effort sur distance D (m) en temps T (s), on calcule la VO2max
// approximée par : VO2 = -4.60 + 0.182258 × v + 0.000104 × v²
//                 où v = D / T × 60 (m/min)
// puis on divise par la fraction d'utilisation de la VO2max selon la durée
// (formule Daniels) : %max = 0.8 + 0.1894 × exp(-0.012778 × T_min)
//                          + 0.2989 × exp(-0.1932 × T_min)
function estimateVO2max(distanceM, timeS) {
  if (!distanceM || !timeS || timeS < 60) return null;
  const v = distanceM / timeS * 60; // m/min
  const vo2 = -4.60 + 0.182258 * v + 0.000104 * v * v;
  const tMin = timeS / 60;
  const pctMax = 0.8
    + 0.1894 * Math.exp(-0.012778 * tMin)
    + 0.2989 * Math.exp(-0.1932 * tMin);
  if (pctMax <= 0) return null;
  return vo2 / pctMax;
}

// Estime le VO2max actuel depuis les meilleurs splits récents (90j).
// Prend la meilleure estimation parmi 5K, 10K, semi (le 1K seul est trop court).
function currentVO2max(activities) {
  if (!activities || activities.length === 0) return null;
  const cutoff = Date.now() - 90 * 86400000;
  const recent = activities.filter(a => new Date(a.date).getTime() >= cutoff);
  let best = null;
  for (const a of recent) {
    const candidates = [
      { d: 5000, t: a.best5k },
      { d: 10000, t: a.best10k },
      { d: 21097, t: a.bestSemi }
    ];
    for (const c of candidates) {
      if (!c.t) continue;
      const vo2 = estimateVO2max(c.d, c.t);
      if (vo2 != null && (best == null || vo2 > best.value)) {
        best = { value: vo2, distance: c.d, time: c.t, activity: a };
      }
    }
  }
  return best;
}

// VDOT calibré (Jack Daniels). Mixe deux signaux pour la fiabilité :
//   - Splits PR récents (5K/10K/semi sur 90j) → VDOT "course"
//   - Allure moyenne d'effort en fractionné récent (30j) → VDOT "VMA"
// La moyenne pondérée (60% course, 40% VMA) corrige les biais : si tu as un
// vieux 10K mais des fractios récents qui montent, ton VDOT remonte.
//
// Renvoie { vdot, paceVdot, intervalVdot, source, confidence } ou null.
// confidence ∈ ['high','medium','low'] : combien on doit faire confiance au chiffre.
function currentVDOT(activities) {
  if (!activities || activities.length === 0) return null;
  const cutoffPerf = Date.now() - 90 * 86400000;   // splits PR : 90j
  const cutoffSpeed = Date.now() - 30 * 86400000;  // fractios : 30j

  // 1) VDOT depuis splits récents
  let bestPerf = null; // { vdot, distance, time, date }
  for (const a of activities) {
    if (new Date(a.date).getTime() < cutoffPerf) continue;
    const candidates = [
      { d: 5000, t: a.best5k },
      { d: 10000, t: a.best10k },
      { d: 21097, t: a.bestSemi }
    ];
    for (const c of candidates) {
      if (!c.t) continue;
      const v = estimateVO2max(c.d, c.t);
      if (v != null && (bestPerf == null || v > bestPerf.vdot)) {
        bestPerf = { vdot: v, distance: c.d, time: c.t, date: a.date };
      }
    }
  }

  // 2) VDOT depuis fractionnés récents : VMA approchée via allure d'effort.
  //    On considère que l'allure d'effort soutenue ~6 min équivaut à 95% VO2max.
  const fractios = activities.filter(a =>
    a.type === 'fractionne' &&
    new Date(a.date).getTime() >= cutoffSpeed &&
    Array.isArray(a.intervals) && a.intervals.length > 0
  );
  let intervalVdot = null;
  if (fractios.length > 0) {
    const efforts = [];
    for (const f of fractios) {
      for (const i of f.intervals) {
        if (i.kind === 'effort' && i.duration >= 30 && i.distance >= 100) {
          efforts.push(i);
        }
      }
    }
    if (efforts.length > 0) {
      // Allure d'effort moyenne pondérée par durée
      const totalDur = efforts.reduce((s, e) => s + e.duration, 0);
      const totalDist = efforts.reduce((s, e) => s + e.distance, 0);
      // Estime un VDOT comme si l'effort total était une course continue
      // (correction Daniels intègre déjà la durée).
      if (totalDur >= 60 && totalDist >= 200) {
        intervalVdot = estimateVO2max(totalDist, totalDur);
      }
    }
  }

  // 3) Combinaison
  let vdot, source, confidence;
  if (bestPerf && intervalVdot != null) {
    vdot = bestPerf.vdot * 0.6 + intervalVdot * 0.4;
    source = `${bestPerf.distance / 1000}K en ${formatDuration(bestPerf.time)} + ${fractios.length} fractionné${fractios.length > 1 ? 's' : ''}`;
    confidence = 'high';
  } else if (bestPerf) {
    vdot = bestPerf.vdot;
    source = `${bestPerf.distance / 1000}K en ${formatDuration(bestPerf.time)}`;
    confidence = 'medium';
  } else if (intervalVdot != null) {
    vdot = intervalVdot;
    source = `${fractios.length} fractionné${fractios.length > 1 ? 's' : ''} récent${fractios.length > 1 ? 's' : ''}`;
    confidence = 'low';
  } else {
    return null;
  }

  return {
    vdot: Math.round(vdot * 10) / 10,
    paceVdot: bestPerf ? Math.round(bestPerf.vdot * 10) / 10 : null,
    intervalVdot: intervalVdot ? Math.round(intervalVdot * 10) / 10 : null,
    source,
    confidence
  };
}

// Le VDOT correspondant à un chrono cible sur une distance (= ce qu'il faut
// pour réaliser ce chrono). Utilisé pour calculer les allures d'entraînement
// d'un objectif que l'utilisateur n'a pas encore atteint.
function daniels_solveVDOTfromTime(distanceM, timeS) {
  return estimateVO2max(distanceM, timeS);
}

// Parse un chrono d'objectif. Accepte "45:00", "45min", "1h30", "1h30:00", "1:30:00", "90".
function parseGoalTimeInput(str) {
  if (!str) return null;
  const s = String(str).trim().toLowerCase();
  // 1h30 ou 1h30:00 ou 1h30m
  let m = s.match(/^(\d+)\s*h\s*(\d+)?(?::(\d+))?/);
  if (m) {
    const h = parseInt(m[1]);
    const min = m[2] ? parseInt(m[2]) : 0;
    const sec = m[3] ? parseInt(m[3]) : 0;
    return h * 3600 + min * 60 + sec;
  }
  // 1:30:00
  m = s.match(/^(\d+):(\d+):(\d+)$/);
  if (m) return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]);
  // 45:00
  m = s.match(/^(\d+):(\d+)$/);
  if (m) return parseInt(m[1]) * 60 + parseInt(m[2]);
  // 45min
  m = s.match(/^(\d+)\s*min$/);
  if (m) return parseInt(m[1]) * 60;
  // Nombre brut → minutes
  const n = parseFloat(s);
  if (!isNaN(n)) return Math.round(n * 60);
  return null;
}

// Rendu HTML actionnable pour un objectif : situation actuelle, séances types
// pour y arriver, volume hebdo cible, et faisabilité d'après le kilométrage
// récent. Beaucoup plus concret que la liste de zones d'allure brutes.
function renderGoalPacesHtml(goal, goalPaces, currentPaces, currentVdot, activities) {
  const DIST_LABELS = { 5000: '5 km', 10000: '10 km', 15000: '15 km', 21097: 'Semi-marathon', 42195: 'Marathon' };
  const distLabel = DIST_LABELS[goal.distance] || (goal.distance / 1000 + ' km');
  const goalPace = Math.round(goal.timeS / (goal.distance / 1000));

  // Distance type pour chaque dimension d'entraînement (heuristique Daniels),
  // bornée pour rester sous ~30 km/sem en 4 sorties max.
  const km = goal.distance / 1000;
  const longKm = Math.round(Math.min(km * 1.2, 14));
  const tempoKm = km <= 10 ? 4 : km <= 21 ? 5 : 6;
  let fractioFormat;
  if (km <= 5)        fractioFormat = `6 × 400 m allure ${formatPace(goalPaces.I)} · récup 200 m lent`;
  else if (km <= 10)  fractioFormat = `5 × 800 m allure ${formatPace(goalPaces.I)} · récup 400 m lent`;
  else if (km <= 15)  fractioFormat = `4 × 1000 m allure ${formatPace(goalPaces.I)} · récup 400 m lent`;
  else if (km <= 21)  fractioFormat = `3 × 1500 m allure ${formatPace(goalPaces.I)} · récup 600 m lent`;
  else                fractioFormat = `4 × 1000 m allure ${formatPace(goalPaces.I)} · récup 400 m lent`;
  const easyKm = km <= 10 ? 5 : 6;

  // Volume hebdo cible : volontairement modeste, plafonné à 30 km / 4 sorties.
  let weeklyKm;
  if (km <= 5)        weeklyKm = 20;
  else if (km <= 10)  weeklyKm = 25;
  else if (km <= 15)  weeklyKm = 28;
  else                weeklyKm = 30;

  // Volume hebdo récent (4 dernières semaines), juste pour la faisabilité courte.
  const fourWeeksAgo = Date.now() - 28 * 86400000;
  const recentActs = (activities || []).filter(a => new Date(a.date).getTime() >= fourWeeksAgo);
  const recentKm = recentActs.reduce((s, a) => s + (a.distanceKm || 0), 0);
  const avgWeekKm = Math.round(recentKm / 4 * 10) / 10;

  let feasibility;
  if (avgWeekKm === 0) {
    feasibility = { tone: 'cool', text: `Vise progressivement ${weeklyKm} km/sem pour préparer cet objectif.` };
  } else if (avgWeekKm >= weeklyKm * 0.85) {
    feasibility = { tone: 'gold', text: `Volume actuel (~${avgWeekKm} km/sem) compatible avec cet objectif.` };
  } else if (avgWeekKm >= weeklyKm * 0.6) {
    feasibility = { tone: 'warm', text: `Volume actuel ~${avgWeekKm} km/sem. Vise progressivement ${weeklyKm} km/sem.` };
  } else {
    feasibility = { tone: 'warm', text: `Volume ~${avgWeekKm} km/sem trop bas. Construis ta base avant de viser ce chrono.` };
  }
  const feasColor = feasibility.tone === 'gold' ? 'var(--gold)'
                  : feasibility.tone === 'warm' ? 'var(--accent-warm)'
                  : 'var(--accent-cool)';

  // Icônes emojis alignées sur SPORT_TYPES pour cohérence partout dans l'app.
  return `
    <div class="goal-output-head">
      <div>
        <div><strong>${distLabel} en ${formatDuration(goal.timeS)}</strong></div>
        <div class="dim text-xs">allure cible : <span class="mono">${formatPace(goalPace)}</span></div>
      </div>
    </div>
    <div class="goal-feas" style="border-left-color: ${feasColor}">${escapeHtml(feasibility.text)}</div>

    <div class="goal-section-title">Plan-type hebdomadaire (~${weeklyKm} km / 4 sorties)</div>
    <div class="goal-sessions">
      <div class="goal-session">
        <div class="goal-session-icon">🏃</div>
        <div class="goal-session-body">
          <div class="goal-session-title">1× Footing facile</div>
          <div class="goal-session-detail">${easyKm} km à <span class="mono">${formatPace(goalPaces.E)}</span></div>
        </div>
      </div>
      <div class="goal-session">
        <div class="goal-session-icon">🔥</div>
        <div class="goal-session-body">
          <div class="goal-session-title">1× Séance de seuil</div>
          <div class="goal-session-detail">Échauffement 2 km + ${tempoKm} km à <span class="mono">${formatPace(goalPaces.T)}</span> + retour calme</div>
        </div>
      </div>
      <div class="goal-session">
        <div class="goal-session-icon">⚡</div>
        <div class="goal-session-body">
          <div class="goal-session-title">1× Fractionné VMA</div>
          <div class="goal-session-detail">Échauffement 2 km + ${fractioFormat} + retour calme</div>
        </div>
      </div>
      <div class="goal-session">
        <div class="goal-session-icon">🌄</div>
        <div class="goal-session-body">
          <div class="goal-session-title">1× Sortie longue</div>
          <div class="goal-session-detail">${longKm} km à <span class="mono">${formatPace(goalPaces.E)}</span>${km >= 21 ? ` (avec ${Math.round(longKm/3)} km finaux à ${formatPace(goalPaces.M)} si possible)` : ''}</div>
        </div>
      </div>
    </div>
  `;
}

// Allures d'entraînement Daniels (E/M/T/I/R) à partir du VDOT.
// Renvoie chaque zone en s/km. Calcul empirique calibré sur la table Daniels.
function trainingPaces(vdot) {
  if (!vdot) return null;
  // Vitesse à 100% VDOT (m/min) en utilisant l'inverse Daniels sur ~6 min d'effort.
  // On approxime : à 6 min d'effort, %max ≈ 0.95, donc VO2(6min) ≈ vdot × 0.95.
  // Et VO2 = -4.6 + 0.182258·v + 0.000104·v². On résout en v.
  const targetVO2 = vdot;
  // Résoudre 0.000104·v² + 0.182258·v - (targetVO2 + 4.6) = 0
  const a = 0.000104, b = 0.182258, c = -(targetVO2 + 4.6);
  const v100 = (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a); // m/min à 100% VDOT
  if (!isFinite(v100) || v100 <= 0) return null;

  // Coefficients Daniels (approximations consensus) :
  //   E  : 65% v100 (plage 59-74%, on prend le milieu)
  //   M  : 80% v100
  //   T  : 88% v100
  //   I  : 100% v100
  //   R  : 110% v100
  const speedToPace = (v) => Math.round(60 / (v / 1000)); // m/min → s/km
  return {
    E: speedToPace(v100 * 0.65),
    M: speedToPace(v100 * 0.80),
    T: speedToPace(v100 * 0.88),
    I: speedToPace(v100 * 1.00),
    R: speedToPace(v100 * 1.10)
  };
}

// Inverse Daniels : pour un VDOT donné, prédit le temps sur une distance D (m).
// Recherche dichotomique sur T (1 min → 5 h).
function predictTime(vdot, distanceM) {
  if (!vdot || !distanceM) return null;
  let lo = 60, hi = 5 * 3600;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const v = estimateVO2max(distanceM, mid);
    if (v == null) return null;
    if (v > vdot) lo = mid; // T trop court → on rallonge
    else hi = mid;
  }
  return Math.round((lo + hi) / 2);
}

// Prédictions complètes (5K, 10K, 15K, semi, marathon) à partir du VDOT.
function predictRaceTimes(vdot) {
  if (!vdot) return null;
  return {
    '5K':       { distance: 5000,  time: predictTime(vdot, 5000) },
    '10K':      { distance: 10000, time: predictTime(vdot, 10000) },
    '15K':      { distance: 15000, time: predictTime(vdot, 15000) },
    'Semi':     { distance: 21097, time: predictTime(vdot, 21097) },
    'Marathon': { distance: 42195, time: predictTime(vdot, 42195) }
  };
}

// Pour la courbe d'évolution : pour chaque activité chronométrée, retourne
// le meilleur VO2max obtenable depuis ses propres splits (5K/10K/semi/1K).
function activityVO2maxPoints(activities) {
  return activities
    .map(a => {
      const candidates = [
        { d: 5000, t: a.best5k },
        { d: 10000, t: a.best10k },
        { d: 21097, t: a.bestSemi }
      ];
      let best = null;
      for (const c of candidates) {
        if (!c.t) continue;
        const vo2 = estimateVO2max(c.d, c.t);
        if (vo2 != null && (best == null || vo2 > best)) best = vo2;
      }
      // Fallback : si pas de splits internes mais durée + distance complète, on essaie.
      if (best == null && a.duration && a.distanceKm > 1) {
        const vo2 = estimateVO2max(a.distanceKm * 1000, a.duration);
        if (vo2 != null) best = vo2;
      }
      return best != null ? { date: a.date, vo2: Math.round(best * 10) / 10, name: a.name } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
}
// ============================================================================
// CATALOGUE DE PARCOURS — détection des tracés récurrents
// ============================================================================
//
// Objectif : reconnaître quand deux sorties suivent ~le même tracé, les
// regrouper en "parcours", et permettre comparer les perfs entre elles.
//
// Algo : pour chaque activité, on calcule une signature spatiale (downsample
// à N points équirépartis). Deux activités appartiennent au même parcours si
// leur distance Hausdorff approximée est < seuil ET leur distance totale
// similaire (±20%).

const ROUTE_SIGNATURE_POINTS = 30;
const ROUTE_MATCH_DIST_M = 150;        // tolérance entre points appariés
const ROUTE_MATCH_DIST_RATIO = 0.20;   // tolérance distance totale (±20%)

// Downsample N points équirépartis le long de la trace (par distance, pas par index).
function downsampleTrack(points, n = ROUTE_SIGNATURE_POINTS) {
  if (!points || points.length < 2) return [];
  // Distances cumulées
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1] + haversine(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon));
  }
  const total = cum[cum.length - 1];
  if (total === 0) return [];
  const out = [];
  for (let k = 0; k < n; k++) {
    const target = (k / (n - 1)) * total;
    // Recherche binaire ou linéaire (on a peu de points)
    let i = 0;
    while (i < cum.length - 1 && cum[i + 1] < target) i++;
    out.push({ lat: points[i].lat, lon: points[i].lon });
  }
  return out;
}

// Distance moyenne entre deux signatures de même taille (sens forward).
function sigDistanceForward(sigA, sigB) {
  if (sigA.length !== sigB.length) return Infinity;
  let total = 0;
  for (let i = 0; i < sigA.length; i++) {
    total += haversine(sigA[i].lat, sigA[i].lon, sigB[i].lat, sigB[i].lon);
  }
  return total / sigA.length;
}

// Idem en parcourant B à l'envers (parcours réalisé dans l'autre sens).
function sigDistanceReverse(sigA, sigB) {
  if (sigA.length !== sigB.length) return Infinity;
  let total = 0;
  const n = sigA.length;
  for (let i = 0; i < n; i++) {
    const j = n - 1 - i;
    total += haversine(sigA[i].lat, sigA[i].lon, sigB[j].lat, sigB[j].lon);
  }
  return total / n;
}

// Deux activités sont sur le même parcours ?
function isSameRoute(a, b) {
  if (!a._sig || !b._sig) return false;
  if (a.distanceKm <= 0 || b.distanceKm <= 0) return false;
  const ratio = Math.abs(a.distanceKm - b.distanceKm) / Math.max(a.distanceKm, b.distanceKm);
  if (ratio > ROUTE_MATCH_DIST_RATIO) return false;
  const dF = sigDistanceForward(a._sig, b._sig);
  const dR = sigDistanceReverse(a._sig, b._sig);
  return Math.min(dF, dR) < ROUTE_MATCH_DIST_M;
}

// Regroupe les activités en clusters (parcours), retourne les routes
// triées par fréquence décroissante. Chaque route :
//   { id, activities, count, avgDistanceKm, bestTime, bestPace, lastDate, name }
function detectRoutes(activities) {
  // Pré-calcul des signatures + filtre des activités sans points GPS.
  const acts = activities
    .filter(a => a.points && Array.isArray(a.points) && a.points.length > 5 && a.distanceKm > 0)
    .map(a => ({ ...a, _sig: downsampleTrack(a.points) }))
    .filter(a => a._sig.length === ROUTE_SIGNATURE_POINTS);

  // Algo glouton : on parcourt, pour chaque activité on cherche un cluster qui
  // accepte (distance moy au membre représentatif < seuil), sinon nouveau cluster.
  const clusters = [];
  for (const a of acts) {
    let placed = false;
    for (const c of clusters) {
      if (isSameRoute(a, c.repr)) {
        c.activities.push(a);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push({ repr: a, activities: [a] });
  }
  // On ne garde que les clusters avec ≥ 2 sorties (un parcours, c'est plusieurs fois).
  const routes = clusters
    .filter(c => c.activities.length >= 2)
    .map((c, idx) => {
      const acts = c.activities.sort((a, b) => a.date.localeCompare(b.date));
      const distances = acts.map(a => a.distanceKm);
      const avgKm = distances.reduce((s, v) => s + v, 0) / distances.length;
      const timed = acts.filter(a => a.duration > 0);
      let bestTime = null, bestPace = null, bestActId = null;
      for (const a of timed) {
        const p = a.duration / a.distanceKm;
        if (bestPace == null || p < bestPace) {
          bestPace = p; bestTime = a.duration; bestActId = a.id;
        }
      }
      const last = acts[acts.length - 1];
      // Nom : on déduit du type majoritaire + distance arrondie.
      const typeCounts = {};
      for (const a of acts) typeCounts[a.type] = (typeCounts[a.type] || 0) + 1;
      const dominantType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0][0];
      const typeLabel = SPORT_TYPES[dominantType]?.label || 'Course';
      return {
        id: 'route-' + idx,
        activities: acts,
        count: acts.length,
        avgDistanceKm: Math.round(avgKm * 10) / 10,
        bestTime,
        bestPace,
        bestActId,
        lastDate: last.date,
        name: `${typeLabel} ${avgKm.toFixed(1)} km`,
        dominantType
      };
    })
    .sort((a, b) => b.count - a.count || b.lastDate.localeCompare(a.lastDate));
  return routes;
}

// ============================================================================
// CHARGE D'ENTRAÎNEMENT
// ============================================================================

// Charge d'entraînement style TSS (Training Stress Score). Pour chaque sortie,
// on calcule un score basé sur la durée pondérée par l'intensité d'allure.
// IF (Intensity Factor) ≈ allure_seuil / allure_actuelle (plus tu vas vite, plus c'est élevé).
// Le seuil personnel est calibré dynamiquement sur l'historique de l'utilisateur :
// on prend l'allure médiane des sorties chronométrées (= allure typique). Sans
// historique suffisant, fallback à 5:30/km (= rythme footing courant).
const THRESHOLD_PACE_FALLBACK_S = 330; // 5:30/km

function thresholdPaceFor(activities) {
  const paces = (activities || [])
    .filter(a => a.duration > 0 && a.distanceKm > 0)
    .map(a => a.duration / a.distanceKm);
  if (paces.length < 5) return THRESHOLD_PACE_FALLBACK_S;
  paces.sort((a, b) => a - b);
  // Médiane (= allure typique de l'utilisateur). On l'utilise comme seuil pour
  // que ses sorties habituelles soient ~1.0 d'intensité, pas 1.3.
  return paces[Math.floor(paces.length / 2)];
}

function activityLoad(activity, thresholdS) {
  if (!activity || !activity.duration || !activity.distanceKm) return 0;
  const pace = activity.duration / activity.distanceKm; // s/km
  if (pace <= 0) return 0;
  const ref = thresholdS || THRESHOLD_PACE_FALLBACK_S;
  let intensity = ref / pace; // > 1 si plus rapide que le seuil perso
  intensity = Math.max(0.5, Math.min(1.3, intensity));
  // Bonus D+ : 100m de D+ ≈ 30 s d'effort supplémentaire en pénibilité.
  const dPlusBonus = (activity.elevGain || 0) / 100 * 30;
  const effectiveDur = activity.duration + dPlusBonus;
  // TSS = (durée × IF²) / 36 → un effort 1h au seuil = 100 points
  return Math.round((effectiveDur * intensity * intensity) / 36);
}

// Calcule CTL (Chronic Training Load = moyenne charge/jour sur 28j) et
// ATL (Acute Training Load = moyenne 7j). TSB = CTL - ATL = "freshness".
function trainingLoadStats(activities, refDate = new Date()) {
  const ref = refDate.getTime();
  const ctlCutoff = ref - 28 * 86400000;
  const atlCutoff = ref - 7 * 86400000;
  // Seuil personnalisé sur les 60 derniers jours pour suivre la progression.
  const recent60 = activities.filter(a => new Date(a.date).getTime() >= ref - 60 * 86400000);
  const thresholdS = thresholdPaceFor(recent60);
  let ctlSum = 0, atlSum = 0;
  for (const a of activities) {
    const t = new Date(a.date).getTime();
    if (t > ref) continue;
    const load = activityLoad(a, thresholdS);
    if (t >= ctlCutoff) ctlSum += load;
    if (t >= atlCutoff) atlSum += load;
  }
  const ctl = ctlSum / 28;
  const atl = atlSum / 7;
  const tsb = ctl - atl;
  // Recommandation textuelle selon TSB. Seuils plus tolérants — la fatigue
  // ne devrait être signalée qu'avec un déséquilibre vraiment marqué.
  let advice;
  if (atl < 3) advice = { tone: 'cool', text: 'Tu n\'as pas encore couru régulièrement cette semaine. Relance progressivement.' };
  else if (tsb < -25) advice = { tone: 'warm', text: 'Tu as beaucoup couru récemment vs ton volume habituel. Si tu te sens bien, ne change rien — sinon glisse une séance facile.' };
  else if (tsb < -10) advice = { tone: 'gold', text: 'Bonne charge cette semaine. Tu construis ta forme.' };
  else if (tsb < 10) advice = { tone: 'gold', text: 'Charge équilibrée par rapport à ton habitude. Continue à ce rythme.' };
  else advice = { tone: 'cool', text: 'Volume récent en baisse. Si tu veux progresser, c\'est le moment d\'enchaîner.' };
  return {
    ctl: Math.round(ctl * 10) / 10,
    atl: Math.round(atl * 10) / 10,
    tsb: Math.round(tsb * 10) / 10,
    thresholdS,
    advice
  };
}

// Calcule les meilleurs splits dans une fenêtre temporelle glissante (en jours).
// Renvoie { best1k, best5k, best10k, bestSemi } en secondes (null si rien).
function getRollingRecords(activities, windowDays) {
  const cutoff = Date.now() - windowDays * 86400000;
  const recent = activities.filter(a => new Date(a.date).getTime() >= cutoff);
  const fields = ['best1k', 'best5k', 'best10k', 'bestSemi'];
  const out = {};
  for (const f of fields) {
    let best = null;
    for (const a of recent) {
      const v = a[f];
      if (v && (best == null || v < best)) best = v;
    }
    out[f] = best;
  }
  return out;
}

// Dispatch du rendu détaillé d'une sortie selon sa catégorie. Footings et
// sorties week-end → splits km par km. Fractionné → tableau des intervalles
// (effort / repos). Trail → profil de dénivelé.
function renderActivityDetailHtml(activity) {
  if (!activity) return '';
  const type = activity.type || 'footing';
  if (type === 'fractionne') {
    return renderFractionneIntervalsHtml(activity);
  }
  if (type === 'trail') {
    return renderTrailElevHtml(activity);
  }
  // footing, sortie-longue, course (legacy), renforcement avec splits si dispo
  if (activity.kmSplits && activity.kmSplits.length > 0) {
    return renderKmSplitsHtml(activity.kmSplits);
  }
  return '';
}

// Tableau des intervalles d'un fractionné (issues de analyseIntervals stockées
// dans activity.intervals à l'import). Effort en orange, repos en violet.
function renderFractionneIntervalsHtml(activity) {
  let intervals = activity.intervals;
  // Fallback : si l'activité a été importée avant que l'analyse soit faite,
  // on essaie de la calculer maintenant à partir des points si dispos.
  if ((!intervals || intervals.length === 0) && activity.points) {
    intervals = analyseIntervals(activity.points);
  }
  if (!intervals || intervals.length === 0) {
    return `<div class="km-splits"><div class="km-splits-title">Tours d'effort</div>
      <div class="dim text-xs" style="padding: 12px 0;">Pas d'intervalles détectés sur cette sortie.</div>
    </div>`;
  }
  const efforts = intervals.filter(i => i.kind === 'effort');
  const totalEffort = efforts.reduce((s, i) => s + i.duration, 0);
  const totalRepos = intervals.filter(i => i.kind === 'repos').reduce((s, i) => s + i.duration, 0);
  const avgEffortPace = efforts.length > 0
    ? Math.round(efforts.reduce((s, i) => s + i.avgPace, 0) / efforts.length)
    : 0;

  let lapNum = 0;
  const rows = intervals.map(it => {
    const isEffort = it.kind === 'effort';
    if (isEffort) lapNum++;
    return `
      <div class="interval-row ${isEffort ? 'effort' : 'repos'}">
        <div class="interval-label">${isEffort ? '⚡ Tour ' + lapNum : '😮‍💨 Récup'}</div>
        <div class="interval-meta">${formatDuration(it.duration)} · ${(it.distance / 1000).toFixed(2)} km · ${formatPace(it.avgPace)}</div>
      </div>
    `;
  }).join('');

  return `
    <div class="km-splits">
      <div class="km-splits-title">Tours d'effort · ${efforts.length} série${efforts.length > 1 ? 's' : ''}</div>
      <div class="totals" style="margin-bottom: 10px;">
        <div><div class="t-val grad-text">${formatDuration(totalEffort)}</div><div class="t-lbl">effort total</div></div>
        <div><div class="t-val grad-text">${formatDuration(totalRepos)}</div><div class="t-lbl">repos total</div></div>
        <div><div class="t-val grad-text">${formatPace(avgEffortPace)}</div><div class="t-lbl">allure effort</div></div>
      </div>
      <div class="intervals-list">${rows}</div>
    </div>
  `;
}

// Profil de dénivelé pour un trail : pour chaque km on affiche la barre de D+
// (positive vers le haut). Couleur ambre. Inclut un résumé montée totale,
// km le plus pentu, descente totale (depuis la trace).
function renderTrailElevHtml(activity) {
  const splits = activity.kmSplits || [];
  if (splits.length === 0) {
    return '';
  }
  const dPlusBars = splits.map(s => s.elevGain || 0);
  const maxBar = Math.max(1, ...dPlusBars);
  const totalDplus = activity.elevGain || 0;
  // Calcule descente totale depuis les points si possible.
  let descent = 0;
  if (activity.points && activity.points.length > 1) {
    let lastEle = activity.points[0].ele;
    for (let i = 1; i < activity.points.length; i++) {
      const e = activity.points[i].ele;
      if (e == null || lastEle == null) continue;
      const d = e - lastEle;
      if (Math.abs(d) >= 1.5) {
        if (d < 0) descent += -d;
        lastEle = e;
      } else if (e !== null) {
        // skip (noise)
      }
    }
  }
  // km le plus pentu
  const steepestKm = splits.reduce((max, s) => (s.elevGain || 0) > (max?.elevGain || 0) ? s : max, null);

  let html = '<div class="km-splits">';
  html += '<div class="km-splits-title">Profil dénivelé · km par km</div>';
  html += `
    <div class="totals" style="margin-bottom: 10px;">
      <div><div class="t-val grad-text">+${Math.round(totalDplus)}</div><div class="t-lbl">m D+</div></div>
      <div><div class="t-val grad-text">−${Math.round(descent)}</div><div class="t-lbl">m D−</div></div>
      <div><div class="t-val grad-text">${steepestKm ? '+' + steepestKm.elevGain : '—'}</div><div class="t-lbl">km le + raide (km ${steepestKm ? steepestKm.km : '—'})</div></div>
    </div>
  `;
  for (const s of splits) {
    const dPlus = s.elevGain || 0;
    const widthPct = 30 + (dPlus / maxBar) * 70;
    html += `
      <div class="km-split">
        <div class="km-split-label">km ${s.km}</div>
        <div class="km-split-bar-wrap">
          <div class="km-split-bar trail" style="width: ${dPlus > 0 ? widthPct : 0}%"></div>
        </div>
        <div class="km-split-pace mono">+${dPlus} m</div>
        <div class="km-split-elev dim mono">${formatPaceShort(s.pace)}/km</div>
      </div>
    `;
  }
  html += '</div>';
  return html;
}

// Helper : format "M:SS" pour une allure en s/km.
function formatPaceShort(seconds) {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Rendu HTML des splits km par km : barre horizontale par km, longueur
// inversement proportionnelle à l'allure (km le plus rapide = barre pleine).
// Le plus rapide est en or, le plus lent en ambre/orange.
function renderKmSplitsHtml(splits) {
  if (!splits || splits.length === 0) return '';
  const valid = splits.filter(s => s.duration > 0);
  if (valid.length === 0) return '';
  const paces = valid.map(s => s.pace);
  const fastest = Math.min(...paces);
  const slowest = Math.max(...paces);
  const range = Math.max(1, slowest - fastest);

  const formatPaceShort = (sec) => {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  let html = '<div class="km-splits">';
  html += '<div class="km-splits-title">Splits km par km</div>';
  for (const s of splits) {
    const isFastest = s.pace === fastest && s.duration > 0;
    const isSlowest = s.pace === slowest && s.duration > 0 && slowest !== fastest;
    // Largeur barre : 100% pour le fastest, décroît linéairement.
    const t = (slowest - s.pace) / range; // 1 = fastest, 0 = slowest
    const width = 30 + t * 70;
    const cls = isFastest ? 'fastest' : isSlowest ? 'slowest' : '';
    html += `
      <div class="km-split ${cls}">
        <div class="km-split-label">km ${s.km}</div>
        <div class="km-split-bar-wrap">
          <div class="km-split-bar" style="width: ${width}%"></div>
        </div>
        <div class="km-split-pace mono">${formatPaceShort(s.pace)}/km</div>
        <div class="km-split-elev dim mono">${s.elevGain > 0 ? '+' + s.elevGain + 'm' : ''}</div>
      </div>
    `;
  }
  html += '</div>';
  return html;
}

async function checkAndUpdateRecords(activity) {
  const broken = [];
  for (const t of RECORD_TYPES) {
    const newValue = activity[t.metric];
    if (newValue == null || newValue === 0) continue;
    const existing = await dbGet('records', t.id);
    let isBetter = !existing
      || (t.mode === 'max' && newValue > existing.value)
      || (t.mode === 'min' && newValue < existing.value);
    if (isBetter) {
      await dbPut('records', {
        id: t.id, value: newValue, activityId: activity.id,
        date: activity.date, previousValue: existing?.value || null
      });
      broken.push({ type: t, value: newValue, previous: existing?.value, first: !existing });
    }
  }
  return broken;
}

function formatRecordValue(type, value) {
  if (type.metric === 'distanceKm') return `${value.toFixed(2)} km`;
  if (type.metric === 'elevGain')   return `${Math.round(value)} m`;
  if (type.metric === 'duration') {
    const h = Math.floor(value / 3600), m = Math.floor((value % 3600) / 60);
    return `${h}h${String(m).padStart(2, '0')}`;
  }
  if (type.metric === 'best5k' || type.metric === 'best10k') {
    const m = Math.floor(value / 60), s = Math.round(value % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  return value;
}

// ============================================================================
// 11. SEEDING (initialisation)
// ============================================================================

async function initSeed() {
  const initFlag = await dbGet('meta', 'initialized');
  if (!initFlag?.value) {
    await dbPut('profile', DEFAULT_PROFILE);
    await dbPut('meta', { key: 'initialized', value: true });
    await dbPut('meta', { key: 'createdAt', value: new Date().toISOString() });
  }
  // Schedule
  const sched = await dbAll('schedule');
  if (sched.length === 0) {
    for (const d of DEFAULT_SCHEDULE) await dbPut('schedule', d);
  }
  // Exams
  const ex = await dbAll('exams');
  if (ex.length === 0) {
    for (const e of SEED_EXAMS) await dbPut('exams', e);
  }
  // Quests
  for (const q of SEED_WEEKLY_QUESTS) {
    const existing = await dbGet('quests', q.id);
    if (!existing) await dbPut('quests', q);
  }
  await migrateData();
}

// ============================================================================
// 11.b MIGRATION DES DONNÉES (idempotent, exécuté à chaque démarrage)
// ============================================================================

async function migrateData() {
  // Profil : structure des skills + nettoyage streak.
  const profile = await dbGet('profile', 'me');
  if (profile) {
    let dirty = false;
    profile.skills = profile.skills || {};
    // Ajout des nouveaux skills
    if (!profile.skills.lettres) { profile.skills.lettres = { xp: 0, level: 1 }; dirty = true; }
    if (!profile.skills.allure)  { profile.skills.allure  = { xp: 0, level: 1 }; dirty = true; }
    // Suppression de l'ancien skill `montagne` (s'il existait, son XP est jeté).
    if (profile.skills.montagne) { delete profile.skills.montagne; dirty = true; }
    // Suppression des streaks (n'apportent rien).
    if ('streak'     in profile) { delete profile.streak;     dirty = true; }
    if ('bestStreak' in profile) { delete profile.bestStreak; dirty = true; }
    if (dirty) await dbPut('profile', profile);
  }

  // Quêtes : resynchronise les champs déclaratifs (title, goal*, category, flags auto*)
  // depuis SEED_WEEKLY_QUESTS à chaque démarrage. La completion (XP gagné, ratio, etc.)
  // n'est PAS touchée — elle vit dans le store `completions`. Cela permet de modifier
  // un objectif (ex: anglais 3h → 2h) sans laisser des incohérences en base.
  const quests = await dbAll('quests');
  const seedFields = ['title', 'type', 'goalHours', 'goalCount', 'unit', 'skill', 'icon', 'color',
                      'autoFromActivities', 'autoFromWorkLog', 'autoFromLangues', 'autoFromLettres', 'autoFromSi', 'category'];
  for (const q of quests) {
    const seed = SEED_WEEKLY_QUESTS.find(s => s.id === q.id);
    if (!seed) continue;
    let dirty = false;
    for (const f of seedFields) {
      if (q[f] !== seed[f]) {
        // On normalise les undefined : ne pas re-puter si les deux sont absents.
        if (q[f] === undefined && seed[f] === undefined) continue;
        q[f] = seed[f];
        dirty = true;
      }
    }
    if (dirty) await dbPut('quests', q);
  }

  // Schedule : resynchronise depuis DEFAULT_SCHEDULE (ex: pour appliquer les
  // nouvelles heures de travail / sportType à la rentrée).
  const sched = await dbAll('schedule');
  for (const s of sched) {
    const seed = DEFAULT_SCHEDULE.find(d => d.id === s.id);
    if (!seed) continue;
    let dirty = false;
    for (const f of ['sport', 'sportType', 'workHours']) {
      if (s[f] !== seed[f]) { s[f] = seed[f]; dirty = true; }
    }
    if (dirty) await dbPut('schedule', s);
  }

  // Activités : backfill xpAwarded/skillsAwarded pour permettre la suppression
  // réversible. Backfill aussi les nouveaux best splits (1k, semi) et les
  // splits km par km pour les sorties importées avant ces fonctionnalités.
  // Renomme aussi l'ancien type 'sortie-we' en 'sortie-longue'.
  const acts = await dbAll('activities');
  for (const a of acts) {
    let dirty = false;
    if (a.type === 'sortie-we') {
      a.type = 'sortie-longue';
      dirty = true;
    }
    // Catégories supprimées (v2.04 → v2.05) : on rebascule sur footing.
    if (a.type === 'endurance' || a.type === 'vitesse' || a.type === 'renforcement') {
      a.type = 'footing';
      dirty = true;
    }
    if (a.xpAwarded == null) {
      const { xp, skills } = activityXp(a, a.type);
      a.xpAwarded = xp;
      a.skillsAwarded = skills;
      dirty = true;
    }
    if (a.points && Array.isArray(a.points)) {
      if (a.kmSplits == null) {
        a.kmSplits = computeKmSplits(a.points);
        dirty = true;
      }
      if (a.best1k == null) {
        const b1 = bestSplit(a.points, 1000);
        if (b1) { a.best1k = b1; dirty = true; }
      }
      if (a.bestSemi == null) {
        const bs = bestSplit(a.points, 21097);
        if (bs) { a.bestSemi = bs; dirty = true; }
      }
    }
    if (dirty) await dbPut('activities', a);
  }
}

async function loadAll() {
  State.profile = await dbGet('profile', 'me');
  State.quests = await dbAll('quests');
  State.completions = await dbAll('completions');
  State.activities = await dbAll('activities');
  State.workLogs = await dbAll('workLog');
  State.exams = await dbAll('exams');
  State.schedule = await dbAll('schedule');
  const recs = await dbAll('records');
  State.records = {};
  for (const r of recs) State.records[r.id] = r;
  // Objectif de course personnel (course cible).
  const goalRace = await dbGet('meta', 'goalRace');
  State._goalRace = goalRace?.value || null;
}

// ============================================================================
// 12. UI HELPERS
// ============================================================================

function el(tag, props = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k === 'style') e.setAttribute('style', v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') e.innerHTML = v;
    else if (v !== undefined && v !== null) e.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    if (typeof c === 'string' || typeof c === 'number') e.appendChild(document.createTextNode(c));
    else e.appendChild(c);
  }
  return e;
}

function showToast(toast, duration = 2500) {
  const root = document.getElementById('toast');
  root.className = 'toast' + (toast.type === 'levelup' ? ' levelup' : '');
  root.innerHTML = `
    <div class="icon">${toast.type === 'levelup' ? '🎉' : '✨'}</div>
    <div class="body">
      <div class="title">${escapeHtml(toast.title)}</div>
      <div class="text">${escapeHtml(toast.text || '')}</div>
    </div>
  `;
  root.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => root.classList.add('hidden'), duration);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function progressBar(value, height = 10) {
  const w = Math.min(100, Math.max(0, value * 100));
  return `<div class="progress" style="height:${height}px;"><div class="fill" style="width:${w}%;"></div></div>`;
}

// ============================================================================
// 13. ROUTING
// ============================================================================

function navigate(route) {
  State.currentRoute = route;
  document.querySelectorAll('.tab').forEach(t => {
    const isActive = t.dataset.route === route;
    t.classList.toggle('active', isActive);
    // Swap entre version colorée (active) et version monochrome (inactive)
    const img = t.querySelector('.tab-icon');
    const iconName = t.dataset.icon;
    if (img && iconName) {
      img.src = isActive ? `icons/ui/${iconName}.png?v=2` : `icons/ui/${iconName}-mono.png?v=2`;
    }
  });
  render();
}

function render() {
  const view = document.getElementById('view');
  view.innerHTML = '';
  switch (State.currentRoute) {
    case 'home': renderHome(view); break;
    case 'quetes': renderQuetes(view); break;
    case 'sport': renderSport(view); break;
    case 'stats': renderStats(view); break;
    case 'profil': renderProfil(view); break;
  }
}

// ============================================================================
// 14. VIEW : ACCUEIL
// ============================================================================

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return 'Encore debout ?';
  if (h < 12) return 'Bonjour';
  if (h < 18) return 'Bon après-midi';
  if (h < 22) return 'Bonsoir';
  return 'Bonne nuit';
}

function renderHome(root) {
  const p = State.profile;
  if (!p) return;
  const li = deriveLevel(p.totalXp);
  const rank = getRank(li.level);
  const nextR = getNextRank(li.level);

  const ws = startOfWeek();
  const weekActs = State.activities.filter(a => new Date(a.date) >= ws);
  const weekKm = weekActs.reduce((s, a) => s + (a.distanceKm || 0), 0);
  const weekDplus = weekActs.reduce((s, a) => s + (a.elevGain || 0), 0);
  const weekStart = todayKey(ws);
  const weekLogs = State.workLogs.filter(l => l.date >= weekStart);
  const weekWorkMin = weekLogs.reduce((s, l) => s + (l.totalMinutes || 0), 0);
  const todayLog = State.workLogs.find(l => l.date === todayKey());
  const todayWorkMin = todayLog?.totalMinutes || 0;

  const futureExams = State.exams
    .filter(e => e.enabled !== false)
    .map(e => ({ ...e, days: daysUntil(e.date) }))
    .filter(e => e.days >= 0)
    .sort((a, b) => a.days - b.days);
  const nextExam = futureExams[0];

  const page = el('div', { class: 'page' });

  // Header
  page.appendChild(el('div', { class: 'header' }, [
    el('div', { class: 'dim text-sm' }, greeting()),
    el('div', { class: 'text-2xl' }, p.name),
    rank ? el('div', { class: 'rank-pill', style: `--rank-c: ${rank.color};` }, '✦ ' + rank.title) : null
  ]));

  // Hero niveau
  page.appendChild(el('div', { class: 'card hero mb-3' }, [
    el('div', { class: 'flex between mb-3' }, [
      el('div', {}, [
        el('div', { class: 'dim text-xs' }, 'Niveau'),
        el('div', { class: 'text-3xl grad-text' }, String(li.level)),
        nextR ? el('div', { class: 'text-xs mute mt-1', html: `Encore ${nextR.levelsAway} niv. avant <strong style="color:${nextR.rank.color}">${escapeHtml(nextR.rank.title)}</strong>` }) : null
      ]),
      el('div', { style: 'text-align:right;' }, [
        el('div', { class: 'dim text-xs' }, 'Cette semaine'),
        el('div', { class: 'text-xl' }, formatMinutes(weekWorkMin)),
        el('div', { class: 'text-xs mute' }, `${weekActs.length} sortie${weekActs.length > 1 ? 's' : ''}`)
      ])
    ]),
    el('div', { class: '', html: progressBar(li.progress, 12) }),
    el('div', { class: 'flex between mt-2 text-xs dim' }, [
      el('span', {}, `${li.xpInLevel} / ${li.xpToNext} XP`),
      el('span', {}, `Total : ${p.totalXp} XP`)
    ])
  ]));

  // Countdown concours
  if (nextExam) {
    const yearProgress = computeYearProgress(nextExam.date);
    const yearPct = Math.round(yearProgress * 100);
    const pctColor = yearPct < 25 ? '#7c5cff' : yearPct < 50 ? '#5cc8ff' : yearPct < 75 ? '#ffb547' : '#ff6a3d';
    const urg = nextExam.days < 30 ? '#ff4d6d' : nextExam.days < 90 ? '#ff6a3d' : nextExam.days < 180 ? '#ffb547' : '#7c5cff';

    page.appendChild(el('div', { class: 'mb-4', html: `
      <div class="cd-card">
        <div class="cd-main">
          <div class="cd-info">
            <div class="cd-label">Prochaine échéance</div>
            <div class="cd-name">${nextExam.icon} ${escapeHtml(nextExam.short)}</div>
            <div class="cd-date">${formatDate(nextExam.date)}</div>
          </div>
          <div class="cd-stats">
            <div class="cd-pct" style="color: ${pctColor};">${yearPct}<span class="pct-sign">%</span></div>
            <div class="cd-pct-label">année écoulée</div>
            <div class="cd-days" style="color: ${urg};">J-${nextExam.days}</div>
            <div class="cd-days-sub">${formatCountdown(nextExam.days)}</div>
          </div>
        </div>
        <div class="year-bar-wrap">
          <div class="year-bar"><div class="year-fill" style="width: ${yearPct}%;"></div></div>
        </div>
      </div>
    `}));
  }

  // Synthèse semaine
  page.appendChild(el('h3', { class: 'mb-3' }, 'Cette semaine'));

  page.appendChild(el('div', { class: 'dim text-xs mb-2' }, '🏃 Sport'));
  page.appendChild(el('div', { class: 'stats-grid mb-4', html: `
    <div class="stat"><div class="stat-val grad-text">${weekKm.toFixed(1)}</div><div class="stat-label">km</div></div>
    <div class="stat"><div class="stat-val grad-text">${Math.round(weekDplus)}</div><div class="stat-label">m D+</div></div>
    <div class="stat"><div class="stat-val grad-text">${weekActs.length}</div><div class="stat-label">sorties</div></div>
  `}));

  page.appendChild(el('div', { class: 'dim text-xs mb-2' }, '📚 Travail'));
  page.appendChild(el('div', { class: 'stats-grid mb-4', html: `
    <div class="stat"><div class="stat-val grad-text">${formatMinutes(todayWorkMin)}</div><div class="stat-label">aujourd'hui</div></div>
    <div class="stat"><div class="stat-val grad-text">${formatMinutes(weekWorkMin)}</div><div class="stat-label">cette semaine</div></div>
    <div class="stat"><div class="stat-val grad-text">${(weekWorkMin / 60).toFixed(1)}</div><div class="stat-label">heures cumulées</div></div>
  `}));

  // Compétences
  page.appendChild(el('h3', { class: 'mb-2' }, 'Compétences'));
  const skillsHtml = Object.entries(p.skills).map(([k, sk]) => {
    const meta = SKILL_META[k];
    const info = deriveLevel(sk.xp);
    return `
      <div class="skill-card" style="--c: ${meta.color}">
        <div class="skill-top">
          <span class="skill-icon">${meta.icon}</span>
          <span class="skill-lvl" style="color:${meta.color}">Niv. ${info.level}</span>
        </div>
        <div class="skill-name">${meta.label}</div>
        ${progressBar(info.progress, 6)}
      </div>
    `;
  }).join('');
  page.appendChild(el('div', { class: 'skills mb-3', html: skillsHtml }));

  root.appendChild(page);
}

// ============================================================================
// 15. VIEW : QUÊTES
// ============================================================================

function renderQuetes(root) {
  const page = el('div', { class: 'page' });
  page.appendChild(el('div', { class: 'page-title' }, [el('h1', {}, 'Objectifs')]));

  // Aujourd'hui (sport + travail)
  page.appendChild(el('h3', { class: 'mb-2' }, '📆 Aujourd\'hui'));
  const dashWrap = el('div', { class: 'mb-5' });
  page.appendChild(dashWrap);

  // Mon objectif de course — carte cliquable qui ouvre une sous-page modale
  const goalMeta = State._goalRace || null;
  page.appendChild(el('h3', { class: 'mb-2' }, '🏁 Mon objectif de course'));
  const goalCardWrap = el('div', { class: 'mb-5' });
  goalCardWrap.innerHTML = goalMeta
    ? `
      <button class="goal-summary-card" id="open-goal-detail">
        <div class="goal-summary-icon">🎯</div>
        <div class="goal-summary-body">
          <div class="goal-summary-title">${({ 5000: '5 km', 10000: '10 km', 15000: '15 km', 21097: 'Semi-marathon', 42195: 'Marathon' })[goalMeta.distance] || (goalMeta.distance/1000+' km')} en ${formatDuration(goalMeta.timeS)}</div>
          <div class="goal-summary-meta dim text-xs">Tape pour voir le plan d'entraînement</div>
        </div>
        <div class="goal-summary-chevron">›</div>
      </button>
    `
    : `
      <button class="goal-summary-card empty" id="open-goal-detail">
        <div class="goal-summary-icon">🎯</div>
        <div class="goal-summary-body">
          <div class="goal-summary-title">Définir un objectif</div>
          <div class="goal-summary-meta dim text-xs">Choisis une distance et un chrono cible</div>
        </div>
        <div class="goal-summary-chevron">›</div>
      </button>
    `;
  page.appendChild(goalCardWrap);
  setTimeout(() => {
    goalCardWrap.querySelector('#open-goal-detail').addEventListener('click', () => showGoalDetailModal());
  }, 0);

  // ── 🏃 SPORT (quête sorties principales) ─────────────────────────────
  page.appendChild(el('h3', { class: 'mb-1' }, '🏃 Sport'));
  page.appendChild(el('div', { class: 'dim text-xs mb-2' }, 'Sorties de course de la semaine'));
  const sportWrap = el('div', { class: 'flex col gap-2 mb-5' });
  page.appendChild(sportWrap);

  // ── 📚 TRAVAIL (quêtes travail + sommeil + secondaires) ──────────────
  page.appendChild(el('h3', { class: 'mb-1' }, '📚 Travail & autres'));
  page.appendChild(el('div', { class: 'dim text-xs mb-2' },
    arePenaltiesActive()
      ? 'Malus si principaux non atteints · bonus si secondaires dépassés.'
      : `À partir du ${formatDate(PENALTIES_START)}, malus si principaux ratés, bonus si secondaires dépassés.`));
  const travailWrap = el('div', { class: 'flex col gap-2 mb-5' });
  page.appendChild(travailWrap);

  root.appendChild(page);

  // Render async, en filtrant par questId pour chaque section
  renderDayDashboard(dashWrap);
  renderWeeklyQuestsFiltered(sportWrap, ['wq-runs']);
  renderWeeklyQuestsFiltered(travailWrap, ['wq-work', 'wq-sleep', 'wq-langues', 'wq-lettres', 'wq-si']);
}

// Sous-page modale pour configurer + visualiser le détail de l'objectif de course.
async function showGoalDetailModal() {
  const overlay = el('div', { class: 'gpx-preview-overlay' });
  const modal = el('div', { class: 'gpx-preview-modal goal-modal' });
  const goal = State._goalRace || null;
  const vdotInfo = currentVDOT(State.activities);
  const currentVdot = vdotInfo ? vdotInfo.vdot : null;
  const paces = currentVdot ? trainingPaces(currentVdot) : null;
  const goalVdot = goal && goal.distance && goal.timeS
    ? daniels_solveVDOTfromTime(goal.distance, goal.timeS)
    : null;
  const goalPaces = goalVdot ? trainingPaces(goalVdot) : null;

  modal.innerHTML = `
    <div class="gpx-preview-head">
      <div class="gpx-preview-title">
        <span class="gpx-preview-icon">🏁</span>
        <span>Mon objectif de course</span>
      </div>
      <button class="gpx-preview-close" aria-label="Fermer">✕</button>
    </div>
    <div style="padding: 14px 18px; overflow-y: auto;">
      <p class="dim text-sm mb-3">Définis une course cible pour voir le plan d'entraînement adapté.</p>
      <div class="goal-form">
        <select class="input" id="goal-distance">
          <option value="">— Distance —</option>
          <option value="5000" ${goal && goal.distance == 5000 ? 'selected' : ''}>5 km</option>
          <option value="10000" ${goal && goal.distance == 10000 ? 'selected' : ''}>10 km</option>
          <option value="15000" ${goal && goal.distance == 15000 ? 'selected' : ''}>15 km</option>
          <option value="21097" ${goal && goal.distance == 21097 ? 'selected' : ''}>Semi-marathon</option>
          <option value="42195" ${goal && goal.distance == 42195 ? 'selected' : ''}>Marathon</option>
        </select>
        <input class="input" id="goal-time" type="text" placeholder="Chrono (ex: 45:00, 1h30)" value="${goal && goal.timeS ? formatDuration(goal.timeS) : ''}" />
        <button class="btn primary sm" id="goal-save">Définir</button>
        ${goal ? `<button class="btn ghost sm" id="goal-clear">Effacer</button>` : ''}
      </div>
      <div id="goal-output">${goalPaces && goal ? renderGoalPacesHtml(goal, goalPaces, paces, currentVdot, State.activities) : ''}</div>
    </div>
  `;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  modal.querySelector('.gpx-preview-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  modal.querySelector('#goal-save').addEventListener('click', async () => {
    const dist = parseInt(modal.querySelector('#goal-distance').value);
    const timeStr = modal.querySelector('#goal-time').value.trim();
    const timeS = parseGoalTimeInput(timeStr);
    if (!dist || !timeS) {
      showToast({ type: 'err', title: 'Incomplet', text: 'Choisis une distance et un chrono.' });
      return;
    }
    await dbPut('meta', { key: 'goalRace', value: { distance: dist, timeS } });
    State._goalRace = { distance: dist, timeS };
    close();
    render();
    showToast({ type: 'xp', title: 'Objectif défini', text: `${(dist/1000)}K en ${formatDuration(timeS)}` });
  });
  const clearBtn = modal.querySelector('#goal-clear');
  if (clearBtn) clearBtn.addEventListener('click', async () => {
    await dbDelete('meta', 'goalRace');
    State._goalRace = null;
    close();
    render();
  });
}

// Variante de renderWeeklyQuests qui filtre par liste d'IDs (au lieu de catégorie main/secondary).
async function renderWeeklyQuestsFiltered(root, questIds) {
  const wks = State.quests.filter(q =>
    (q.type === 'weekly-hours' || q.type === 'weekly-count') && questIds.includes(q.id)
  );
  // Réutilise la logique de renderWeeklyQuests mais avec un set explicite
  root.innerHTML = '';
  for (const q of wks) {
    await _renderOneQuest(root, q, null);
  }
}

async function renderDayDashboard(root) {
  const todayPlan = await getTodayPlan();
  if (!todayPlan) return;
  const dateKey = todayKey();
  const dayLabel = DAYS.find(d => d.key === dayKeyFromDate())?.label || '';
  const workLog = await dbGet('workLog', dateKey);
  const actualMinutes = workLog?.totalMinutes || 0;
  const goalHours = todayPlan.workHours || 0;
  const wi = computeWorkXp(actualMinutes, goalHours);
  const progress = goalHours > 0 ? Math.min(1, actualMinutes / (goalHours * 60)) : 0;
  // On affiche le sport du jour pour required ET weekend (sortie longue flexible).
  const showSport = todayPlan.sport === 'required' || todayPlan.sport === 'weekend';
  const todayActs = State.activities.filter(a => a.date.slice(0, 10) === dateKey);
  const sportDone = todayActs.length > 0;

  const barColor = wi.ratio < 0.5 ? '#5e6480' : wi.ratio < 1 ? '#7c5cff' : '#ffb547';

  let sportBlock = '';
  if (showSport) {
    const sportMeta = SPORT_TYPES[todayPlan.sportType] || SPORT_TYPES.footing;
    const isWeekend = todayPlan.sport === 'weekend';
    const subtitle = sportDone
      ? '✓ Sortie validée'
      : isWeekend
        ? 'Sortie longue à caser samedi ou dimanche'
        : 'Importe ton GPX quand c\'est fait';
    sportBlock = `
      <div class="block sport ${sportDone ? 'done' : ''}">
        <div class="block-icon">${sportMeta.icon}</div>
        <div class="block-body">
          <div class="block-title">${sportMeta.label}<span class="pill warm" style="margin-left:8px;">${isWeekend ? 'Week-end' : 'Sport du jour'}</span></div>
          <div class="dim text-xs">${subtitle}</div>
        </div>
      </div>
    `;
  }

  let workBlock = '';
  if (goalHours > 0) {
    const workDone = wi.ratio >= 1;
    workBlock = `
      <div class="block work ${workDone ? 'done' : ''}">
        <div class="block-icon">📚</div>
        <div class="block-body">
          <div class="flex between">
            <div class="block-title">Travail · objectif ${goalHours}h${workDone ? ' <span class="pill warm" style="margin-left:8px;">✓</span>' : ''}</div>
            <div class="work-pct" style="color:${barColor};">${Math.round(wi.ratio * 100)}%</div>
          </div>
          <div class="work-bar">
            <div class="work-fill" style="width:${Math.min(100, progress * 100)}%; background:${barColor};"></div>
          </div>
          <div class="dim text-xs mt-1">
            ${formatMinutes(actualMinutes)} / ${goalHours}h
            ${wi.xp > 0 ? ` · <span style="color:var(--accent);">${wi.xp} XP</span>` : ''}
          </div>
        </div>
      </div>
      <div class="subjects">
        <div class="dim text-xs mb-2">Détaille par matière (le total se calcule tout seul)</div>
        <div class="subjects-grid" id="subjects-grid"></div>
      </div>
    `;
  }

  root.innerHTML = `
    <div class="dash">
      <div class="dash-head">
        <div class="dim text-xs">Aujourd'hui · ${dayLabel}</div>
        ${wi.ratio >= 1 ? '<span class="text-xs" style="color:var(--accent);">Objectif atteint ✓</span>' : ''}
      </div>
      ${sportBlock}
      ${workBlock}
    </div>
  `;

  if (goalHours > 0) {
    const grid = root.querySelector('#subjects-grid');
    for (const [key, meta] of Object.entries(SUBJECTS)) {
      const minutes = workLog?.bySubject?.[key] || 0;
      const sub = el('div', { class: 'sub' });
      sub.innerHTML = `<label class="sub-label">${meta.icon} ${meta.label}</label>`;
      const input = el('input', {
        class: 'sub-input',
        type: 'text',
        placeholder: '0',
        value: minutes ? formatMinutes(minutes) : ''
      });
      input.addEventListener('blur', async () => {
        const newMin = parseTimeInput(input.value);
        await setSubjectMinutes(dateKey, key, newMin, goalHours);
        await recomputeAutoQuests();
        await loadAll();
        // Re-render entier de la vue : maintient header + sections principales/secondaires.
        render();
        showToast({ type: 'xp', title: 'Mis à jour', text: `${meta.label}: ${formatMinutes(newMin)}` });
      });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
      sub.appendChild(input);
      grid.appendChild(sub);
    }
  }
}

async function renderWeeklyQuests(root, category = null) {
  const wks = State.quests.filter(q =>
    (q.type === 'weekly-hours' || q.type === 'weekly-count') &&
    (category == null || q.category === category)
  );
  root.innerHTML = '';
  for (const q of wks) {
    await _renderOneQuest(root, q, category);
  }
}

// Rendu d'une carte quête individuelle. Utilisé par renderWeeklyQuests et renderWeeklyQuestsFiltered.
async function _renderOneQuest(root, q, category) {
  const c = await getCurrentCompletion(q);
  const actual = c?.actualValue || 0;
  const xp = c?.lastXp || 0;
  const ratio = c?.ratio || 0;
  const isHours = q.type === 'weekly-hours';
  const goal = isHours ? q.goalHours : q.goalCount;
  const unit = isHours ? 'h' : (q.unit || 'fois');
  const progress = goal > 0 ? Math.min(1, actual / (isHours ? goal * 60 : goal)) : 0;
  const isAuto = q.autoFromActivities || q.autoFromWorkLog || q.autoFromLangues || q.autoFromLettres || q.autoFromSi;

  let forecast = '';
  if (arePenaltiesActive()) {
    if (q.category === 'main') {
      const f = malusFactorFromRatio(ratio);
      if (f > 0) {
        forecast = `<span class="hq-malus">−${Math.round(f * 100)}% XP semaine prévu</span>`;
      }
    } else if (q.category === 'secondary') {
      const f = bonusFactorFromRatio(ratio);
      if (f > 0) {
        const fullXp = questFullXp(q);
        const bonusXp = Math.round(fullXp * f);
        forecast = `<span class="hq-bonus">+${bonusXp} XP bonus</span>`;
      }
    }
  }

  const div = el('div', {
    class: 'hq' + (ratio >= 1 ? ' done' : ''),
    style: `--hq-c: ${q.color || '#ffb547'};`
  });
  div.innerHTML = `
    <div class="hq-head">
      <span class="hq-icon">${q.icon}</span>
      <div class="hq-titles">
        <div class="hq-title">${escapeHtml(q.title)}</div>
        <div class="hq-goal">Objectif : ${goal} ${unit}${isAuto ? '<span class="auto-tag">auto</span>' : ''}</div>
      </div>
      <div class="hq-pct" style="color:${q.color}">${Math.round(ratio * 100)}%</div>
    </div>
    <div class="hq-bar">
      <div class="hq-fill" style="width:${Math.min(100, progress * 100)}%; background:${q.color};"></div>
    </div>
    <div class="hq-info">
      ${isHours
        ? `<span class="dim text-xs">${formatMinutes(actual)} / ${goal}h</span>`
        : `<span class="dim text-xs">${actual} / ${goal} ${unit}</span>`}
      ${xp > 0 ? `<span class="hq-xp">+${xp} XP</span>` : '<span></span>'}
    </div>
    ${forecast ? `<div class="hq-forecast">${forecast}</div>` : ''}
  `;

  if (!isAuto) {
    if (isHours) {
      const row = el('div', { class: 'hq-input-row' });
      const input = el('input', {
        class: 'input', type: 'text',
        placeholder: 'ex: 2h30, 1.5',
        value: actual ? formatMinutes(actual) : ''
      });
      const btn = el('button', { class: 'btn primary sm' }, 'Valider');
      const save = async () => {
        const min = parseTimeInput(input.value);
        await setQuestValue(q, min);
        await loadAll();
        render();
        showToast({ type: 'xp', title: 'Mis à jour', text: q.title });
      };
      btn.addEventListener('click', save);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
      row.appendChild(input);
      row.appendChild(btn);
      div.appendChild(row);
    } else {
      const row = el('div', { class: 'hq-count-row' });
      const minus = el('button', { class: 'cnt-btn' }, '−');
      const val = el('div', { class: 'cnt-val' }, String(actual));
      const plus = el('button', { class: 'cnt-btn plus' }, '+');
      minus.disabled = actual <= 0;
      const change = async (delta) => {
        const nv = Math.max(0, actual + delta);
        await setQuestValue(q, nv);
        await loadAll();
        render();
      };
      minus.addEventListener('click', () => change(-1));
      plus.addEventListener('click', () => change(+1));
      row.appendChild(minus);
      row.appendChild(val);
      row.appendChild(plus);
      div.appendChild(row);
    }
  }

  root.appendChild(div);
}

// ============================================================================
// 16. VIEW : SPORT
// ============================================================================

function renderSport(root) {
  const page = el('div', { class: 'page' });
  const title = el('div', { class: 'page-title' }, [el('h1', {}, 'Sport')]);
  const importLabel = el('label', {
    class: 'btn-gpx',
    title: 'Importer un fichier GPX'
  });
  importLabel.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
    <span>GPX</span>
  `;
  const fileInput = el('input', { type: 'file', accept: '.gpx', hidden: 'true' });
  fileInput.addEventListener('change', onGpxFile);
  importLabel.appendChild(fileInput);
  title.appendChild(importLabel);
  page.appendChild(title);

  if (State.activities.length === 0) {
    const empty = el('div', { class: 'card center', style: 'padding:40px; text-align:center;', html: `
      <div class="text-2xl mb-2">🏔️</div>
      <h3 class="mb-2">Aucune sortie</h3>
      <div class="dim text-sm mb-4">Importe ton premier fichier GPX.</div>
    `});
    page.appendChild(empty);
    root.appendChild(page);
    return;
  }

  if (!State.currentActivity) State.currentActivity = State.activities[0];

  // Map
  const mapWrap = el('div', { class: 'map-wrap mb-3' });
  const mapEl = el('div', { class: 'map', id: 'sport-map' });
  mapWrap.appendChild(mapEl);
  page.appendChild(mapWrap);

  // Selected activity card
  const sel = State.currentActivity;
  if (sel) {
    const typeIcon = activityTypeIcon(sel.type);
    const detailHtml = renderActivityDetailHtml(sel);
    const hasDetail = !!detailHtml && detailHtml.trim().length > 0;
    const isExpanded = !!State._detailsExpanded;
    const card = el('div', { class: 'card mb-4', html: `
      <div class="flex between mb-2">
        <div>
          <div class="text-lg" style="font-weight:600;">${typeIcon} ${escapeHtml(sel.name)}</div>
          <div class="dim text-sm">${formatDate(sel.date)} · ${SPORT_TYPES[sel.type]?.label || sel.type}</div>
        </div>
        <div class="flex gap-2">
          <button class="btn ghost sm" id="edit-act" title="Modifier">✏️</button>
          <button class="btn ghost sm danger" id="del-act">Suppr.</button>
        </div>
      </div>
      <div class="metrics">
        <div class="metric"><div class="m-val grad-text">${sel.distanceKm}</div><div class="m-lbl">km</div></div>
        <div class="metric"><div class="m-val grad-text">${sel.elevGain}</div><div class="m-lbl">m D+</div></div>
        <div class="metric"><div class="m-val grad-text">${formatDuration(sel.duration)}</div><div class="m-lbl">durée</div></div>
        <div class="metric"><div class="m-val grad-text">${formatPace(sel.avgPace)}</div><div class="m-lbl">allure</div></div>
      </div>
      ${hasDetail ? `
        <button class="details-toggle" id="details-toggle">
          <span>Détails</span>
          <span class="details-chevron">${isExpanded ? '▴' : '▾'}</span>
        </button>
        <div class="details-content ${isExpanded ? '' : 'hidden'}" id="details-content">
          ${detailHtml}
        </div>
      ` : ''}
    `});
    page.appendChild(card);
    setTimeout(() => {
      card.querySelector('#edit-act').addEventListener('click', () => editActivity(sel));
      card.querySelector('#del-act').addEventListener('click', async () => {
        if (!confirm(`Supprimer "${sel.name}" ?`)) return;
        const ok = await deleteActivity(sel);
        if (!ok) return;
        State.currentActivity = State.activities[0] || null;
        showToast({ type: 'xp', title: 'Sortie supprimée', text: `−${sel.xpAwarded || 0} XP rendus` });
        render();
      });
      const toggle = card.querySelector('#details-toggle');
      if (toggle) {
        toggle.addEventListener('click', () => {
          State._detailsExpanded = !State._detailsExpanded;
          const content = card.querySelector('#details-content');
          const chev = card.querySelector('.details-chevron');
          content.classList.toggle('hidden', !State._detailsExpanded);
          chev.textContent = State._detailsExpanded ? '▴' : '▾';
        });
      }
    }, 0);
  }

  // History
  page.appendChild(el('h3', { class: 'mb-2' }, `Historique (${State.activities.length})`));
  const list = el('div', { class: 'flex col gap-2' });
  const sortedActs = [...State.activities].sort((a, b) => b.date.localeCompare(a.date));
  for (const a of sortedActs) {
    const ti = activityTypeIcon(a.type);
    const btn = el('button', {
      class: 'act' + (sel?.id === a.id ? ' sel' : ''),
      onclick: () => {
        // Si on change de sortie, on referme le détail. Si on reclique sur la
        // même, on bascule (geste naturel : tap pour déplier, retap pour replier).
        if (State.currentActivity?.id === a.id) {
          State._detailsExpanded = !State._detailsExpanded;
        } else {
          State._detailsExpanded = false;
        }
        State.currentActivity = a;
        render();
      }
    });
    btn.innerHTML = `
      <div class="act-icon">${ti}</div>
      <div class="act-body">
        <div class="act-title">${escapeHtml(a.name)}</div>
        <div class="act-meta">${formatDate(a.date)} • ${a.distanceKm} km • ${a.elevGain} m D+</div>
      </div>
      <div class="act-pace">${formatDuration(a.duration)}</div>
    `;
    list.appendChild(btn);
  }
  page.appendChild(list);

  root.appendChild(page);

  // Render map
  setTimeout(() => renderMap(sel), 50);
}

// Style JSON MapLibre 100% custom Orion. Couleurs alignées sur la palette
// de l'app (--bg-*, --accent-*) — fond charbon profond, eau bleu nuit, routes
// violet pâle, parcs vert sombre. Source de tiles vectorielles : OpenFreeMap
// (gratuit, sans clé, basé sur OpenMapTiles).
const ORION_MAP_STYLE = {
  version: 8,
  name: 'Orion',
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {
    openmaptiles: {
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet'
    }
  },
  layers: [
    // Fond général (charbon profond — comme --bg-1)
    { id: 'bg', type: 'background', paint: { 'background-color': '#0a0e1a' } },

    // Eau (bleu nuit, légèrement plus clair que le fond)
    { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water',
      paint: { 'fill-color': '#1a2a4a', 'fill-opacity': 1 } },

    // Zones boisées et parcs (vert sombre désaturé, palette froide)
    { id: 'wood', type: 'fill', source: 'openmaptiles', 'source-layer': 'landcover',
      filter: ['==', 'class', 'wood'],
      paint: { 'fill-color': '#162420', 'fill-opacity': 0.7 } },
    { id: 'grass', type: 'fill', source: 'openmaptiles', 'source-layer': 'landcover',
      filter: ['in', 'class', 'grass', 'park'],
      paint: { 'fill-color': '#142028', 'fill-opacity': 0.6 } },

    // Bâti (très subtil, juste un nuance plus claire)
    { id: 'buildings', type: 'fill', source: 'openmaptiles', 'source-layer': 'building',
      minzoom: 13,
      paint: { 'fill-color': '#1a2238', 'fill-outline-color': '#2a3458' } },

    // Routes — hiérarchie en violets/gris pâle, plus claires aux gros niveaux
    { id: 'road-minor', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation',
      filter: ['in', 'class', 'minor', 'service', 'track'],
      minzoom: 12,
      paint: { 'line-color': '#3a4060', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.5, 18, 2] } },
    { id: 'road-secondary', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation',
      filter: ['in', 'class', 'secondary', 'tertiary'],
      paint: { 'line-color': '#4d5478', 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 18, 3] } },
    { id: 'road-primary', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation',
      filter: ['in', 'class', 'primary', 'trunk', 'motorway'],
      paint: { 'line-color': '#7c5cff', 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.6, 18, 4], 'line-opacity': 0.6 } },

    // Frontières administratives (violet pâle, fines)
    { id: 'admin-bounds', type: 'line', source: 'openmaptiles', 'source-layer': 'boundary',
      filter: ['<=', 'admin_level', 4],
      paint: { 'line-color': '#7c5cff', 'line-width': 0.6, 'line-opacity': 0.4, 'line-dasharray': [2, 2] } },

    // Étiquettes des villes (or pâle, discret)
    { id: 'place-labels', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place',
      filter: ['in', 'class', 'city', 'town', 'village'],
      layout: {
        'text-field': ['get', 'name:latin'],
        'text-font': ['Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 4, 9, 12, 14],
        'text-anchor': 'center'
      },
      paint: {
        'text-color': '#ffd86b',
        'text-halo-color': '#0a0e1a',
        'text-halo-width': 1.4,
        'text-opacity': 0.85
      } }
  ]
};

// Rend une carte Orion-stylée dans un conteneur DOM. Renvoie l'instance MapLibre.
function renderMapInto(mapEl, activity) {
  if (!activity || !window.maplibregl || !mapEl) return null;
  const map = new maplibregl.Map({
    container: mapEl,
    style: ORION_MAP_STYLE,
    center: [2.5, 46.5],
    zoom: 5,
    attributionControl: false
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  map.addControl(new maplibregl.AttributionControl({
    customAttribution: '© OSM · OpenMapTiles · OpenFreeMap',
    compact: true
  }), 'bottom-right');

  const coords = activity.points.map(p => [p.lon, p.lat]);

  map.on('load', () => {
    // Source GeoJSON pour le tracé.
    map.addSource('track', {
      type: 'geojson',
      data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } }
    });

    // Halo doré large (glow extérieur)
    map.addLayer({
      id: 'track-halo', type: 'line', source: 'track',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#ffd86b', 'line-width': 14, 'line-opacity': 0.30, 'line-blur': 4 }
    });
    // Halo orange intermédiaire
    map.addLayer({
      id: 'track-glow', type: 'line', source: 'track',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#ff6a3d', 'line-width': 8, 'line-opacity': 0.5 }
    });
    // Trait principal or vif
    map.addLayer({
      id: 'track-main', type: 'line', source: 'track',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#ffd86b', 'line-width': 3 }
    });

    // Markers départ (or sur orange) et arrivée (violet)
    if (coords.length > 0) {
      const startEl = document.createElement('div');
      startEl.className = 'orion-marker orion-marker-start';
      new maplibregl.Marker({ element: startEl }).setLngLat(coords[0]).addTo(map);
      const endEl = document.createElement('div');
      endEl.className = 'orion-marker orion-marker-end';
      new maplibregl.Marker({ element: endEl }).setLngLat(coords[coords.length - 1]).addTo(map);
    }

    // Cadrer sur le tracé
    if (coords.length >= 2) {
      const lons = coords.map(c => c[0]);
      const lats = coords.map(c => c[1]);
      map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
                    { padding: 30, duration: 600 });
    }
  });

  return map;
}

function renderMap(activity) {
  const mapEl = document.getElementById('sport-map');
  if (!mapEl) return;
  if (State.map) { try { State.map.remove(); } catch {} State.map = null; }
  State.map = renderMapInto(mapEl, activity);
}

// Preview modale : montre la carte + métriques + XP attendu, demande confirmation.
// Résout à `true` si l'utilisateur confirme l'import, `false` sinon.
function showGpxPreview(parsed, type, splits, xp) {
  return new Promise((resolve) => {
    const typeIcon = activityTypeIcon(type);
    const overlay = el('div', { class: 'gpx-preview-overlay' });
    const modal = el('div', { class: 'gpx-preview-modal' });
    modal.innerHTML = `
      <div class="gpx-preview-head">
        <div class="gpx-preview-title">
          <span class="gpx-preview-icon">${typeIcon}</span>
          <span>${escapeHtml(parsed.name)}</span>
        </div>
        <button class="gpx-preview-close" aria-label="Fermer">✕</button>
      </div>
      <div class="gpx-preview-map" id="gpx-preview-map"></div>
      <div class="gpx-preview-metrics">
        <div class="metric"><div class="m-val grad-text">${parsed.distanceKm}</div><div class="m-lbl">km</div></div>
        <div class="metric"><div class="m-val grad-text">${parsed.elevGain}</div><div class="m-lbl">m D+</div></div>
        <div class="metric"><div class="m-val grad-text">${formatDuration(parsed.duration)}</div><div class="m-lbl">durée</div></div>
        <div class="metric"><div class="m-val grad-text">${formatPace(parsed.avgPace)}</div><div class="m-lbl">allure</div></div>
      </div>
      ${splits.best5k || splits.best10k ? `
        <div class="gpx-preview-splits">
          ${splits.best5k ? `<span>⚡ 5K · ${formatDuration(Math.round(splits.best5k))}</span>` : ''}
          ${splits.best10k ? `<span>🏃 10K · ${formatDuration(Math.round(splits.best10k))}</span>` : ''}
        </div>
      ` : ''}
      <div class="gpx-preview-actions">
        <button class="btn ghost" id="gpx-cancel">Annuler</button>
        <button class="btn-gpx" id="gpx-confirm">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          Importer · +${xp} XP
        </button>
      </div>
    `;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    let map;
    setTimeout(() => {
      map = renderMapInto(modal.querySelector('#gpx-preview-map'), { points: parsed.points });
    }, 30);

    const close = (ok) => {
      if (map) map.remove();
      overlay.remove();
      resolve(ok);
    };
    modal.querySelector('.gpx-preview-close').addEventListener('click', () => close(false));
    modal.querySelector('#gpx-cancel').addEventListener('click', () => close(false));
    modal.querySelector('#gpx-confirm').addEventListener('click', () => close(true));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
  });
}

async function onGpxFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = parseGpx(text);
    const splits = computeSplits(parsed);
    const type = detectActivityType(parsed);
    const { xp, skills } = activityXp(parsed, type);
    // Si fractionné, on calcule les intervalles maintenant pour les stocker.
    const intervals = type === 'fractionne' ? analyseIntervals(parsed.points) : null;
    const autoName = defaultActivityName(type, parsed.date);

    // Preview avant import : l'utilisateur peut annuler.
    const confirmed = await showGpxPreview({ ...parsed, name: autoName }, type, splits, xp);
    if (!confirmed) {
      e.target.value = '';
      return;
    }

    // On stocke ce qui a été gagné pour permettre une suppression réversible.
    const activity = {
      id: 'act-' + Date.now(),
      type,
      ...parsed,
      name: autoName,
      ...splits,
      intervals,
      xpAwarded: xp,
      skillsAwarded: skills
    };
    await dbPut('activities', activity);
    const result = await awardXp(xp, skills);
    const broken = await checkAndUpdateRecords(activity);
    await recomputeAutoQuests();
    await loadAll();
    State.currentActivity = activity;

    if (broken.length > 0) showPRCelebration(broken);
    else showToast({
      type: result.leveledUp ? 'levelup' : 'xp',
      title: result.leveledUp ? `Niveau ${result.toLevel} !` : `+${xp} XP`,
      text: `${parsed.distanceKm} km • ${parsed.elevGain} m D+`
    }, 4000);
    render();
  } catch (err) {
    showToast({ type: 'err', title: 'Erreur', text: err.message }, 4000);
  } finally {
    e.target.value = '';
  }
}

function showPRCelebration(records) {
  const overlay = document.getElementById('pr-overlay');
  const list = document.getElementById('pr-list');
  list.innerHTML = records.map(r => `
    <div class="pr-item">
      <span class="pr-icon">${r.type.icon}</span>
      <span class="pr-label">${r.type.label}</span>
      <span class="pr-value">${formatRecordValue(r.type, r.value)}</span>
    </div>
  `).join('');
  overlay.classList.remove('hidden');
  overlay.onclick = () => overlay.classList.add('hidden');
  setTimeout(() => overlay.classList.add('hidden'), 5500);
}

async function recomputeAllRecords() {
  // Re-scanne toutes les activités et reconstruit le store records (utile après une suppression).
  const acts = await dbAll('activities');
  await dbClear('records');
  for (const t of RECORD_TYPES) {
    let best = null;
    for (const a of acts) {
      const v = a[t.metric];
      if (v == null || v === 0) continue;
      if (!best
        || (t.mode === 'max' && v > best.value)
        || (t.mode === 'min' && v < best.value)) {
        best = { id: t.id, value: v, activityId: a.id, date: a.date, previousValue: null };
      }
    }
    if (best) await dbPut('records', best);
  }
}

// Recalcule TOUT depuis zéro à partir de l'historique (workLogs + completions
// + activities), en appliquant les barèmes XP courants. Utile quand on a
// modifié les multiplicateurs (ex: passage de Montagne → Allure) et qu'on
// veut que les anciennes données rétroagissent.
//
// Étapes :
//  1) Reset profile.totalXp = 0 + reset chaque skill XP/level à 0/1.
//  2) Pour chaque activity : recalcule activityXp(act, type), met à jour
//     act.xpAwarded/skillsAwarded, applique au profil.
//  3) Pour chaque workLog : recalcule via computeWorkXp + portions
//     SUBJECTS, met à jour log.lastXpAwarded/lastSkillsAwarded, applique.
//  4) Pour chaque completion : recalcule selon le type de quête et
//     applique aussi.
//  5) Reset les meta.lastDailyPenalty/lastWeeklyPenalty pour que les malus/bonus
//     soient ré-évalués lors du prochain applyPendingPenalties().
async function recomputeAllXp() {
  const profile = State.profile;
  if (!profile) return { success: false, reason: 'no profile' };

  // 1) Reset profil
  profile.totalXp = 0;
  profile.level = 1;
  for (const skillKey of Object.keys(profile.skills || {})) {
    profile.skills[skillKey] = { xp: 0, level: 1 };
  }
  await dbPut('profile', profile);
  // Recharge State.profile pour que les awardXp suivants opèrent sur l'objet à jour.
  State.profile = profile;

  let totalActivities = 0;
  let totalWorkLogs = 0;
  let totalCompletions = 0;
  let totalXp = 0;

  // 2) Activités : on recalcule l'XP pour chaque, on met à jour la fiche
  //    en base, puis on applique l'XP au profil.
  const acts = await dbAll('activities');
  // Trie chronologiquement pour que les level-ups soient cohérents.
  acts.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  for (const a of acts) {
    const type = a.type || 'footing';
    const { xp, skills } = activityXp(a, type);
    a.xpAwarded = xp;
    a.skillsAwarded = skills;
    await dbPut('activities', a);
    if (xp > 0) {
      await awardXp(xp, skills);
      totalXp += xp;
    }
    totalActivities++;
  }

  // 3) Work logs : on recalcule chaque jour avec computeWorkXp +
  //    pondération par matière. On stocke le nouveau lastXpAwarded.
  const logs = await dbAll('workLog');
  logs.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  for (const l of logs) {
    const bySubject = l.bySubject || {};
    const totalMin = Object.values(bySubject).reduce((s, m) => s + m, 0);
    if (totalMin === 0) {
      l.lastXpAwarded = 0;
      l.lastSkillsAwarded = {};
      await dbPut('workLog', l);
      continue;
    }
    const goalHours = l.goalHours || 0;
    const { xp: newXp } = computeWorkXp(totalMin, goalHours);
    const newSkillsXp = {};
    for (const [subj, mins] of Object.entries(bySubject)) {
      const meta = SUBJECTS[subj];
      if (!meta) continue;
      const portion = mins / totalMin;
      const mult = meta.skillMult ?? 0.6;
      newSkillsXp[meta.skill] = (newSkillsXp[meta.skill] || 0) + Math.round(newXp * portion * mult);
    }
    newSkillsXp.discipline = (newSkillsXp.discipline || 0) + Math.round(newXp * 0.04);
    l.lastXpAwarded = newXp;
    l.lastSkillsAwarded = newSkillsXp;
    await dbPut('workLog', l);
    if (newXp > 0) {
      await awardXp(newXp, newSkillsXp);
      totalXp += newXp;
    }
    totalWorkLogs++;
  }

  // 4) Completions hebdo : on recalcule chacune et on applique l'XP.
  //    On les trie par weekKey + questId pour stabilité.
  const completions = await dbAll('completions');
  const quests = await dbAll('quests');
  completions.sort((a, b) => (a.weekKey || '').localeCompare(b.weekKey || ''));
  for (const c of completions) {
    const q = quests.find(x => x.id === c.questId);
    if (!q) continue;
    const value = c.actualValue || 0;
    let xp, ratio;
    if (q.type === 'weekly-hours') {
      const r = computeHoursXp(value, q.goalHours);
      xp = r.xp; ratio = r.ratio;
    } else {
      const r = computeCountXp(value, q.goalCount);
      xp = r.xp; ratio = r.ratio;
    }
    const skillsXp = {};
    if (q.skill) skillsXp[q.skill] = Math.round(xp * 0.7);
    skillsXp.discipline = (skillsXp.discipline || 0) + Math.round(xp * 0.03);
    // Met à jour la completion en base avec les nouvelles valeurs.
    c.lastXp = xp;
    c.lastSkillsXp = skillsXp;
    c.xp = xp;
    c.skills = skillsXp;
    c.ratio = ratio;
    await dbPut('completions', c);
    if (xp > 0) {
      await awardXp(xp, skillsXp);
      totalXp += xp;
    }
    totalCompletions++;
  }

  // 5) Reset les marqueurs de fin-de-période pour que les malus/bonus passés
  //    soient réappliqués lors du prochain applyPendingPenalties.
  await dbDelete('meta', 'lastDailyPenalty');
  await dbDelete('meta', 'lastWeeklyPenalty');

  // Recharge tout en mémoire et ré-applique les pénalités historiques.
  await loadAll();
  await applyPendingPenalties();
  await loadAll();

  return {
    success: true,
    totalActivities,
    totalWorkLogs,
    totalCompletions,
    finalXp: State.profile.totalXp,
    rawXpBeforePenalties: totalXp
  };
}

async function deleteActivity(activity) {
  // Avant de retirer l'XP, anticipe la perte de niveau pour confirmer.
  const profile = State.profile;
  const before = deriveLevel(profile.totalXp).level;
  const xpAwarded = activity.xpAwarded ?? 0;
  const skillsAwarded = activity.skillsAwarded ?? {};
  const projectedXp = Math.max(0, profile.totalXp - xpAwarded);
  const after = deriveLevel(projectedXp).level;
  if (after < before) {
    if (!confirm(`⚠️ Supprimer cette sortie te fera perdre ${before - after} niveau${before - after > 1 ? 'x' : ''} (du ${before} au ${after}). Continuer ?`)) {
      return false;
    }
  }
  await dbDelete('activities', activity.id);
  if (xpAwarded > 0) await removeXp(xpAwarded, skillsAwarded);
  await recomputeAllRecords();
  await recomputeAutoQuests();
  await loadAll();
  return true;
}

// Édite le nom et la catégorie d'une sortie passée. Si la catégorie change,
// l'XP est recalculé et le delta est appliqué (réversible).
async function editActivity(activity) {
  const overlay = el('div', { class: 'gpx-preview-overlay' });
  const modal = el('div', { class: 'gpx-preview-modal' });
  // Liste des 5 catégories de sport.
  const cats = ['footing', 'seuil', 'fractionne', 'sortie-longue', 'trail'];
  modal.innerHTML = `
    <div class="gpx-preview-head">
      <div class="gpx-preview-title">
        <span class="gpx-preview-icon">✏️</span>
        <span>Catégorie de la sortie</span>
      </div>
      <button class="gpx-preview-close" aria-label="Fermer">✕</button>
    </div>
    <div style="padding: 16px 18px;">
      <label class="dim text-xs" style="display:block; margin-bottom:6px;">Catégorie</label>
      <select class="input" id="edit-cat" style="width:100%;">
        ${cats.map(c => `<option value="${c}" ${c === activity.type ? 'selected' : ''}>${SPORT_TYPES[c]?.icon || ''} ${SPORT_TYPES[c]?.label || c}</option>`).join('')}
      </select>
      <p class="dim text-xs mt-3">Le nom de la sortie sera mis à jour automatiquement selon la catégorie. Si la catégorie change, l'XP est recalculé et la différence appliquée à ton niveau.</p>
    </div>
    <div class="gpx-preview-actions">
      <button class="btn ghost" id="edit-cancel">Annuler</button>
      <button class="btn-gpx" id="edit-save">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        Enregistrer
      </button>
    </div>
  `;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  modal.querySelector('.gpx-preview-close').addEventListener('click', close);
  modal.querySelector('#edit-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  modal.querySelector('#edit-save').addEventListener('click', async () => {
    const newCat = modal.querySelector('#edit-cat').value;
    const newName = defaultActivityName(newCat, activity.date);
    const oldXp = activity.xpAwarded || 0;
    const oldSkills = activity.skillsAwarded || {};
    let updated = { ...activity, name: newName, type: newCat };
    // Recalcule l'XP si la catégorie change.
    if (newCat !== activity.type) {
      const { xp, skills } = activityXp(activity, newCat);
      updated.xpAwarded = xp;
      updated.skillsAwarded = skills;
      const xpDelta = xp - oldXp;
      const skillsDelta = {};
      const allKeys = new Set([...Object.keys(oldSkills), ...Object.keys(skills)]);
      for (const k of allKeys) skillsDelta[k] = (skills[k] || 0) - (oldSkills[k] || 0);
      const posS = Object.fromEntries(Object.entries(skillsDelta).filter(([_, v]) => v > 0));
      const negS = Object.fromEntries(Object.entries(skillsDelta).filter(([_, v]) => v < 0).map(([k, v]) => [k, -v]));
      if (xpDelta > 0) await awardXp(xpDelta, posS);
      else if (xpDelta < 0) await removeXp(-xpDelta, negS);
      if (xpDelta === 0 && Object.keys(posS).length) await awardXp(0, posS);
      if (xpDelta === 0 && Object.keys(negS).length) await removeXp(0, negS);
    }
    await dbPut('activities', updated);
    await recomputeAutoQuests();
    await loadAll();
    State.currentActivity = updated;
    close();
    render();
    showToast({ type: 'xp', title: 'Catégorie mise à jour', text: newName });
  });
}

// ============================================================================
// 17. VIEW : STATS
// ============================================================================

function renderStats(root) {
  const page = el('div', { class: 'page' });
  page.appendChild(el('div', { class: 'page-title' }, [el('h1', {}, 'Stats')]));

  const acts = State.activities;
  const logs = State.workLogs;

  // Travail
  const totalWorkMin = logs.reduce((s, l) => s + (l.totalMinutes || 0), 0);
  const bestDayMin = logs.reduce((m, l) => Math.max(m, l.totalMinutes || 0), 0);
  const workDays = logs.filter(l => (l.totalMinutes || 0) > 0).length;
  const workByWeek = {};
  for (const l of logs) {
    const wk = weekKey(new Date(l.date));
    workByWeek[wk] = (workByWeek[wk] || 0) + (l.totalMinutes || 0);
  }
  const bestWeekMin = Math.max(0, ...Object.values(workByWeek));
  const weekValues = Object.values(workByWeek);
  const avgWeekMin = weekValues.length > 0
    ? weekValues.reduce((s, v) => s + v, 0) / weekValues.length
    : 0;
  // Progression : moyenne des 4 dernières semaines vs les 4 précédentes
  const sortedWeeks = Object.entries(workByWeek).sort((a, b) => a[0].localeCompare(b[0]));
  const recent4 = sortedWeeks.slice(-4).map(e => e[1]);
  const prev4 = sortedWeeks.slice(-8, -4).map(e => e[1]);
  const recent4Avg = recent4.length > 0 ? recent4.reduce((s, v) => s + v, 0) / recent4.length : 0;
  const prev4Avg = prev4.length > 0 ? prev4.reduce((s, v) => s + v, 0) / prev4.length : 0;
  const trendPct = prev4Avg > 0 ? Math.round((recent4Avg - prev4Avg) / prev4Avg * 100) : 0;

  page.appendChild(el('h3', { class: 'section-h work' }, '📚 Travail'));
  page.appendChild(el('div', { class: 'card mb-3', html: `
    <div class="totals">
      <div><div class="t-val grad-text">${(totalWorkMin/60).toFixed(1)}</div><div class="t-lbl">heures cumulées</div></div>
      <div><div class="t-val grad-text">${(avgWeekMin/60).toFixed(1)}</div><div class="t-lbl">moy. / semaine (h)</div></div>
      <div><div class="t-val grad-text">${(totalWorkMin/60/Math.max(1,workDays)).toFixed(1)}</div><div class="t-lbl">moy. / jour actif (h)</div></div>
      <div><div class="t-val grad-text" style="color: ${trendPct >= 0 ? 'var(--accent)' : 'var(--danger)'}">${trendPct >= 0 ? '+' : ''}${trendPct}%</div><div class="t-lbl">tendance 4 sem.</div></div>
    </div>
  `}));

  // Heatmap calendaire — visualise la régularité sur 12 semaines
  page.appendChild(el('div', { class: 'chart-card mb-3' }, [
    el('div', { class: 'chart-title' }, '🗓️ Régularité · 12 dernières semaines'),
    el('div', { class: 'work-heatmap', id: 'work-heatmap' })
  ]));

  // Graph: répartition matières (30 derniers jours)
  page.appendChild(el('div', { class: 'chart-card mb-3' }, [
    el('div', { class: 'chart-title' }, '🎯 Répartition des matières · 30 derniers jours'),
    el('div', { class: 'chart-wrap chart-wrap-donut' }, [el('canvas', { id: 'chart-work-subjects' })])
  ]));

  page.appendChild(el('h3', { class: 'mb-2' }, 'Records personnels'));
  page.appendChild(el('div', { class: 'card mb-5', html: `
    <div class="rec-row"><div class="rec-left"><span class="rec-icon">📅</span><span class="rec-label">Plus grosse journée</span></div><div class="rec-value">${bestDayMin > 0 ? formatMinutes(bestDayMin) : '—'}</div></div>
    <div class="rec-row"><div class="rec-left"><span class="rec-icon">🗓️</span><span class="rec-label">Plus grosse semaine</span></div><div class="rec-value">${bestWeekMin > 0 ? (bestWeekMin/60).toFixed(1) + 'h' : '—'}</div></div>
  `}));

  // Sport — refonte complète : focus sur les métriques runner
  const totalKm = acts.reduce((s, a) => s + (a.distanceKm || 0), 0);
  const totalDplus = acts.reduce((s, a) => s + (a.elevGain || 0), 0);
  const totalDur = acts.reduce((s, a) => s + (a.duration || 0), 0);

  page.appendChild(el('h3', { class: 'section-h sport' }, '🏃 Sport'));
  page.appendChild(el('div', { class: 'card mb-3', html: `
    <div class="totals">
      <div><div class="t-val grad-text">${totalKm.toFixed(1)}</div><div class="t-lbl">km cumulés</div></div>
      <div><div class="t-val grad-text">${Math.round(totalDplus)}</div><div class="t-lbl">m de D+</div></div>
      <div><div class="t-val grad-text">${formatDuration(totalDur)}</div><div class="t-lbl">temps en sport</div></div>
      <div><div class="t-val grad-text">${acts.length}</div><div class="t-lbl">sorties</div></div>
    </div>
  `}));

  // ── Records absolus / 30j / 90j ────────────────────────────────────────
  const r30 = getRollingRecords(acts, 30);
  const r90 = getRollingRecords(acts, 90);
  const rAll = getRollingRecords(acts, 99999);
  const fmtT = (s) => {
    if (!s) return '—';
    const m = Math.floor(s / 60), sec = Math.round(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };
  page.appendChild(el('h3', { class: 'mb-2 mt-4' }, '🏆 Records glissants'));
  page.appendChild(el('div', { class: 'card mb-3', html: `
    <div class="rolling-table">
      <div class="rolling-header"><div></div><div>Absolu</div><div>90 j</div><div>30 j</div></div>
      <div class="rolling-row"><div class="rolling-dist">1 km</div><div class="mono">${fmtT(rAll.best1k)}</div><div class="mono">${fmtT(r90.best1k)}</div><div class="mono">${fmtT(r30.best1k)}</div></div>
      <div class="rolling-row"><div class="rolling-dist">5 km</div><div class="mono">${fmtT(rAll.best5k)}</div><div class="mono">${fmtT(r90.best5k)}</div><div class="mono">${fmtT(r30.best5k)}</div></div>
      <div class="rolling-row"><div class="rolling-dist">10 km</div><div class="mono">${fmtT(rAll.best10k)}</div><div class="mono">${fmtT(r90.best10k)}</div><div class="mono">${fmtT(r30.best10k)}</div></div>
      <div class="rolling-row"><div class="rolling-dist">Semi</div><div class="mono">${fmtT(rAll.bestSemi)}</div><div class="mono">${fmtT(r90.bestSemi)}</div><div class="mono">${fmtT(r30.bestSemi)}</div></div>
    </div>
  `}));

  // ── Catalogue parcours ─────────────────────────────────────────────────
  const routes = detectRoutes(acts);
  if (routes.length > 0) {
    page.appendChild(el('h3', { class: 'mb-2 mt-4' }, '🗺️ Parcours récurrents'));
    const routesHtml = routes.slice(0, 5).map(r => `
      <button class="route-card" data-route-id="${r.id}">
        <div class="route-card-head">
          <div class="route-card-name">${activityTypeIcon(r.dominantType)} ${escapeHtml(r.name)}</div>
          <div class="route-card-count">${r.count}× <span class="dim">parcouru</span></div>
        </div>
        <div class="route-card-meta dim text-xs">
          Meilleur : <span class="mono">${formatPace(r.bestPace || 0)}</span>
          · Dernier : ${formatDate(r.lastDate)}
        </div>
      </button>
    `).join('');
    const routesContainer = el('div', { class: 'routes-list mb-3' });
    routesContainer.innerHTML = routesHtml;
    page.appendChild(routesContainer);
    setTimeout(() => {
      routesContainer.querySelectorAll('[data-route-id]').forEach(btn => {
        btn.addEventListener('click', () => {
          const r = routes.find(x => x.id === btn.dataset.routeId);
          if (r) showRouteCompare(r);
        });
      });
    }, 0);
    // On garde une référence pour pouvoir lookup l'objet à l'open de modale.
    State._routesCache = routes;
  }

  // ── Records personnels (existant, fin de page) ─────────────────────────
  page.appendChild(el('h3', { class: 'mb-2 mt-4' }, 'Records personnels'));
  let recsHtml = '';
  for (const t of RECORD_TYPES) {
    const r = State.records[t.id];
    recsHtml += `
      <div class="rec-row">
        <div class="rec-left"><span class="rec-icon">${t.icon}</span><span class="rec-label">${t.label}</span></div>
        <div class="rec-value">${r ? formatRecordValue(t, r.value) : '—'}</div>
      </div>
    `;
  }
  page.appendChild(el('div', { class: 'card mb-3', html: recsHtml }));

  root.appendChild(page);

  // Render des graphes après que le DOM soit attaché.
  setTimeout(() => renderStatsCharts(logs, acts), 30);
}

// Helpers de styling Chart.js cohérents avec la palette Orion.
const CHART_COLORS = {
  text: '#a0a4b8',
  textMute: '#5e6480',
  grid: 'rgba(31, 42, 68, 0.7)',
  gold: '#ffd86b',
  goldFade: 'rgba(255, 216, 107, 0.18)',
  warm: '#ff6a3d',
  cool: '#5cc8ff',
  violet: '#7c5cff',
  pink: '#f472b6',
  bg: '#11172a'
};

function chartCommonOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: CHART_COLORS.text, font: { family: 'system-ui, -apple-system, sans-serif', size: 11 } } },
      tooltip: {
        backgroundColor: 'rgba(10,14,26,0.95)',
        titleColor: CHART_COLORS.gold,
        bodyColor: '#f0eee6',
        borderColor: 'rgba(255,216,107,0.2)',
        borderWidth: 1,
        padding: 10,
        displayColors: true,
        cornerRadius: 8
      }
    },
    scales: {
      x: {
        ticks: { color: CHART_COLORS.textMute, font: { size: 10 } },
        grid: { color: CHART_COLORS.grid, drawBorder: false }
      },
      y: {
        ticks: { color: CHART_COLORS.textMute, font: { size: 10 } },
        grid: { color: CHART_COLORS.grid, drawBorder: false },
        beginAtZero: true
      }
    }
  };
}

function renderStatsCharts(logs, acts) {
  // Détruit les anciennes instances pour permettre un re-render propre.
  for (const inst of Object.values(State.charts || {})) {
    try { inst?.destroy(); } catch {}
  }
  State.charts = {};

  // Travail : heatmap calendaire + donut matières
  renderWorkHeatmap(logs);
  if (!window.Chart) return;
  renderSubjectsDonut(logs);

  // Sport : courbe VO2max
  renderVO2maxChart(acts);
}

// Courbe d'évolution du VO2max (extraite de chaque sortie chronométrée).
function renderVO2maxChart(acts) {
  const ctx = document.getElementById('chart-vo2');
  if (!ctx) return;
  const points = activityVO2maxPoints(acts);
  if (points.length < 2) return;
  const labels = points.map(p => new Date(p.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }));
  const data = points.map(p => p.vo2);
  const ctxC = ctx.getContext('2d');
  const grad = ctxC.createLinearGradient(0, 0, 0, 160);
  grad.addColorStop(0, 'rgba(124, 92, 255, 0.4)');
  grad.addColorStop(1, 'rgba(124, 92, 255, 0)');
  State.charts.vo2 = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'VO₂max',
        data,
        borderColor: CHART_COLORS.violet,
        backgroundColor: grad,
        borderWidth: 2.5,
        tension: 0.35,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: '#ffd86b',
        pointBorderColor: CHART_COLORS.bg,
        pointBorderWidth: 1.5,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...chartCommonOptions().plugins.tooltip,
          callbacks: {
            label: (c) => `${c.parsed.y} ml/kg/min`,
            title: (items) => points[items[0].dataIndex].name || items[0].label
          }
        }
      },
      scales: {
        x: { ticks: { color: CHART_COLORS.textMute, font: { size: 10 }, maxRotation: 0 }, grid: { display: false } },
        y: { ticks: { color: CHART_COLORS.textMute, font: { size: 10 } }, grid: { color: CHART_COLORS.grid, drawBorder: false } }
      }
    }
  });
}

// Modale qui détaille un parcours récurrent : liste des sorties classées
// (meilleur temps en haut), tableau d'écart au record, et un petit graphe
// d'évolution de l'allure sur ce parcours.
function showRouteCompare(route) {
  const overlay = el('div', { class: 'gpx-preview-overlay' });
  const modal = el('div', { class: 'gpx-preview-modal' });
  const acts = [...route.activities].sort((a, b) => b.date.localeCompare(a.date));
  const timed = acts.filter(a => a.duration > 0);
  // Classement par allure
  const ranked = [...timed].sort((a, b) => (a.duration / a.distanceKm) - (b.duration / b.distanceKm));
  const bestPace = ranked[0] ? ranked[0].duration / ranked[0].distanceKm : 0;

  const rowsHtml = acts.map(a => {
    const isPR = ranked[0] && a.id === ranked[0].id;
    const pace = a.duration > 0 ? a.duration / a.distanceKm : 0;
    const gap = pace > 0 && bestPace > 0 ? pace - bestPace : null;
    const gapTxt = gap == null ? '—' : gap === 0 ? '🥇 record' : `+${Math.round(gap)}s/km`;
    const gapClass = gap === 0 ? 'gap-best' : gap > 30 ? 'gap-slow' : '';
    return `
      <div class="route-comp-row ${isPR ? 'is-pr' : ''}">
        <div class="route-comp-date">${formatDate(a.date)}</div>
        <div class="route-comp-pace mono">${pace > 0 ? formatPace(pace) : '—'}</div>
        <div class="route-comp-dur dim mono">${formatDuration(a.duration || 0)}</div>
        <div class="route-comp-gap ${gapClass}">${gapTxt}</div>
      </div>
    `;
  }).join('');

  modal.innerHTML = `
    <div class="gpx-preview-head">
      <div class="gpx-preview-title">
        <span class="gpx-preview-icon">🗺️</span>
        <span>${escapeHtml(route.name)}</span>
      </div>
      <button class="gpx-preview-close" aria-label="Fermer">✕</button>
    </div>
    <div style="padding: 14px 18px;">
      <div class="totals" style="margin-bottom: 12px;">
        <div><div class="t-val grad-text">${route.count}</div><div class="t-lbl">parcours</div></div>
        <div><div class="t-val grad-text">${formatPace(route.bestPace || 0)}</div><div class="t-lbl">meilleure allure</div></div>
        <div><div class="t-val grad-text">${formatDuration(route.bestTime || 0)}</div><div class="t-lbl">meilleur temps</div></div>
      </div>
      <div class="chart-wrap" style="height: 140px; margin-bottom: 12px;">
        <canvas id="chart-route-pace"></canvas>
      </div>
      <div class="route-comp-table">
        <div class="route-comp-header"><div>Date</div><div>Allure</div><div>Durée</div><div>Écart</div></div>
        ${rowsHtml}
      </div>
    </div>
    <div class="gpx-preview-actions">
      <button class="btn ghost" id="route-close">Fermer</button>
    </div>
  `;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = () => {
    if (State._routeChart) { try { State._routeChart.destroy(); } catch {} State._routeChart = null; }
    overlay.remove();
  };
  modal.querySelector('.gpx-preview-close').addEventListener('click', close);
  modal.querySelector('#route-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  // Petit graphe d'évolution de l'allure sur ce parcours.
  setTimeout(() => {
    if (!window.Chart) return;
    const ctx = modal.querySelector('#chart-route-pace');
    if (!ctx || timed.length < 2) return;
    const ordered = [...timed].sort((a, b) => a.date.localeCompare(b.date));
    const labels = ordered.map(a => new Date(a.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }));
    const paces = ordered.map(a => Number(((a.duration / a.distanceKm) / 60).toFixed(2)));
    const ctxC = ctx.getContext('2d');
    const grad = ctxC.createLinearGradient(0, 0, 0, 140);
    grad.addColorStop(0, 'rgba(255, 216, 107, 0.4)');
    grad.addColorStop(1, 'rgba(255, 216, 107, 0)');
    State._routeChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Allure',
          data: paces,
          borderColor: CHART_COLORS.gold,
          backgroundColor: grad,
          borderWidth: 2.5,
          tension: 0.35,
          pointRadius: 4,
          pointBackgroundColor: '#ffd86b',
          pointBorderColor: CHART_COLORS.bg,
          pointBorderWidth: 1.5,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: chartCommonOptions().plugins.tooltip },
        scales: {
          x: { ticks: { color: CHART_COLORS.textMute, font: { size: 9 }, maxRotation: 0 }, grid: { display: false } },
          y: {
            reverse: true,
            ticks: { color: CHART_COLORS.textMute, font: { size: 9 }, callback: (v) => {
              const m = Math.floor(v); const s = Math.round((v - m) * 60);
              return `${m}:${String(s).padStart(2, '0')}`;
            }},
            grid: { color: CHART_COLORS.grid, drawBorder: false }
          }
        }
      }
    });
  }, 30);
}

// Heatmap style GitHub : 12 semaines × 7 jours, intensité selon heures travaillées.
function renderWorkHeatmap(logs) {
  const root = document.getElementById('work-heatmap');
  if (!root) return;
  const today = new Date(); today.setHours(0,0,0,0);
  // Trouve le lundi de la semaine actuelle, recule de 11 semaines → début de grille.
  const day = today.getDay();
  const diffToMonday = (day === 0 ? -6 : 1) - day;
  const thisMonday = new Date(today); thisMonday.setDate(thisMonday.getDate() + diffToMonday);
  const startMonday = new Date(thisMonday); startMonday.setDate(startMonday.getDate() - 11 * 7);

  // Échelle d'intensité : 0, <2h, 2-4h, 4-6h, ≥6h.
  const bucket = (h) => {
    if (h <= 0) return 0;
    if (h < 2) return 1;
    if (h < 4) return 2;
    if (h < 6) return 3;
    return 4;
  };

  const cells = [];
  const monthLabels = [];
  let lastMonth = -1;
  for (let w = 0; w < 12; w++) {
    const colDays = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(startMonday);
      date.setDate(date.getDate() + w * 7 + d);
      const k = todayKey(date);
      const log = logs.find(l => l.date === k);
      const hours = (log?.totalMinutes || 0) / 60;
      const isFuture = date > today;
      colDays.push({ date, k, hours, level: bucket(hours), future: isFuture });
    }
    cells.push(colDays);
    // Label mois sur la première semaine où il change
    const firstOfWeek = colDays[0].date;
    const m = firstOfWeek.getMonth();
    if (m !== lastMonth) {
      monthLabels.push({ col: w, label: firstOfWeek.toLocaleDateString('fr-FR', { month: 'short' }) });
      lastMonth = m;
    } else {
      monthLabels.push(null);
    }
  }

  const dayLabels = ['L', '', 'M', '', 'V', '', 'D'];
  let html = '<div class="heatmap-grid">';
  // Ligne des labels de mois
  html += '<div class="heatmap-months">';
  html += '<div class="heatmap-corner"></div>';
  for (const m of monthLabels) {
    html += `<div class="heatmap-month">${m ? m.label : ''}</div>`;
  }
  html += '</div>';
  // Lignes : une par jour de la semaine
  for (let d = 0; d < 7; d++) {
    html += '<div class="heatmap-row">';
    html += `<div class="heatmap-daylabel">${dayLabels[d]}</div>`;
    for (let w = 0; w < 12; w++) {
      const cell = cells[w][d];
      const cls = cell.future ? 'future' : `lvl-${cell.level}`;
      const tip = cell.future
        ? ''
        : `${cell.date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} · ${cell.hours.toFixed(1)} h`;
      // data-key permet de retrouver le workLog au clic.
      const dataAttr = cell.future ? '' : `data-key="${cell.k}"`;
      html += `<div class="heatmap-cell ${cls}" title="${tip}" ${dataAttr}></div>`;
    }
    html += '</div>';
  }
  html += '</div>';
  // Légende
  html += `<div class="heatmap-legend">
    <span>moins</span>
    <div class="heatmap-cell lvl-0"></div>
    <div class="heatmap-cell lvl-1"></div>
    <div class="heatmap-cell lvl-2"></div>
    <div class="heatmap-cell lvl-3"></div>
    <div class="heatmap-cell lvl-4"></div>
    <span>plus</span>
  </div>`;
  root.innerHTML = html;

  // Click sur une cellule : popover détaillé (heures + matières).
  root.querySelectorAll('.heatmap-cell[data-key]').forEach(cellEl => {
    cellEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const k = cellEl.dataset.key;
      const log = logs.find(l => l.date === k);
      showHeatmapPopover(cellEl, k, log);
    });
  });
}

// Popover flottant qui affiche les détails d'une cellule heatmap.
function showHeatmapPopover(anchorEl, dateKey, log) {
  // Ferme tout popover déjà ouvert.
  document.querySelectorAll('.heatmap-popover').forEach(p => p.remove());

  const date = new Date(dateKey + 'T00:00:00');
  const dateLabel = date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const totalMin = log?.totalMinutes || 0;
  const bySubject = log?.bySubject || {};
  let subjectsHtml = '';
  if (totalMin > 0) {
    const sorted = Object.entries(bySubject).filter(([_, m]) => m > 0).sort((a, b) => b[1] - a[1]);
    subjectsHtml = sorted.map(([k, m]) => {
      const meta = SUBJECTS[k];
      return `
        <div class="popover-subject">
          <span>${meta?.icon || '📖'} ${meta?.label || k}</span>
          <span class="mono">${formatMinutes(m)}</span>
        </div>
      `;
    }).join('');
  }

  const popover = el('div', { class: 'heatmap-popover' });
  popover.innerHTML = `
    <div class="popover-head">${dateLabel}</div>
    <div class="popover-total">${totalMin > 0 ? formatMinutes(totalMin) : 'Pas de travail enregistré'}</div>
    ${subjectsHtml ? `<div class="popover-subjects">${subjectsHtml}</div>` : ''}
  `;

  // Positionnement : sous la cellule, recentré horizontalement, avec marge bord d'écran.
  document.body.appendChild(popover);
  const rect = anchorEl.getBoundingClientRect();
  const popRect = popover.getBoundingClientRect();
  let left = rect.left + rect.width / 2 - popRect.width / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - popRect.width - 8));
  let top = rect.bottom + 6;
  if (top + popRect.height > window.innerHeight - 8) {
    top = rect.top - popRect.height - 6;
  }
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;

  // Fermeture au clic ailleurs / scroll / esc.
  const close = () => {
    popover.remove();
    document.removeEventListener('click', onDocClick, true);
    document.removeEventListener('scroll', close, true);
    document.removeEventListener('keydown', onEsc);
  };
  const onDocClick = (e) => {
    if (!popover.contains(e.target) && e.target !== anchorEl) close();
  };
  const onEsc = (e) => { if (e.key === 'Escape') close(); };
  setTimeout(() => {
    document.addEventListener('click', onDocClick, true);
    document.addEventListener('scroll', close, true);
    document.addEventListener('keydown', onEsc);
  }, 0);
}

function renderSubjectsDonut(logs) {
  const ctx = document.getElementById('chart-work-subjects');
  if (!ctx) return;
  const today = new Date(); today.setHours(0,0,0,0);
  const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() - 30);
  const cutoffK = todayKey(cutoff);
  const totals = {};
  for (const l of logs) {
    if (l.date < cutoffK) continue;
    for (const [subj, mins] of Object.entries(l.bySubject || {})) {
      totals[subj] = (totals[subj] || 0) + mins;
    }
  }
  const entries = Object.entries(totals).filter(([_, m]) => m > 0);
  if (entries.length === 0) {
    ctx.parentElement.innerHTML = '<div class="chart-empty">Pas encore de données</div>';
    return;
  }
  const palette = {
    maths: CHART_COLORS.violet,
    physique: '#a78bfa',
    si: CHART_COLORS.pink,
    langues: CHART_COLORS.cool,
    francais: CHART_COLORS.gold,
    autre: '#5e6480'
  };
  const totalH = entries.reduce((s, [_, m]) => s + m, 0) / 60;
  State.charts.subjects = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: entries.map(([s]) => SUBJECTS[s]?.label || s),
      datasets: [{
        data: entries.map(([_, m]) => Math.round(m / 60 * 10) / 10),
        backgroundColor: entries.map(([s]) => palette[s] || '#999'),
        borderColor: CHART_COLORS.bg,
        borderWidth: 3,
        hoverOffset: 10,
        hoverBorderColor: CHART_COLORS.bg
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: { position: 'right', labels: { color: CHART_COLORS.text, font: { size: 11 }, boxWidth: 10, padding: 10, usePointStyle: true, pointStyle: 'circle' } },
        tooltip: {
          ...chartCommonOptions().plugins.tooltip,
          callbacks: {
            label: (c) => {
              const pct = totalH > 0 ? Math.round(c.parsed / totalH * 100) : 0;
              return `${c.label} · ${c.parsed} h (${pct}%)`;
            }
          }
        }
      }
    }
  });
}


// ============================================================================
// 18. VIEW : PROFIL
// ============================================================================

function renderProfil(root) {
  const p = State.profile;
  const li = deriveLevel(p.totalXp);
  const rank = getRank(li.level);

  const page = el('div', { class: 'page' });
  page.appendChild(el('div', { class: 'page-title' }, [el('h1', {}, 'Profil')]));

  // Carte
  const card = el('div', { class: 'card glow mb-4' });
  card.innerHTML = `
    <div class="flex between">
      <div>
        <div class="text-2xl">${escapeHtml(p.name)}</div>
        <div class="rank-pill" style="--rank-c:${rank.color};">✦ ${rank.title}</div>
        <div class="dim text-xs mt-2">Membre depuis ${formatDate(p.createdAt)}</div>
      </div>
      <button class="btn ghost sm" id="edit-name">✎</button>
    </div>
    <div class="flex gap-3 mt-3">
      <div><div class="dim text-xs">Niveau</div><div class="text-xl grad-text">${li.level}</div></div>
      <div><div class="dim text-xs">XP total</div><div class="text-xl">${p.totalXp}</div></div>
    </div>
  `;
  page.appendChild(card);
  setTimeout(() => {
    card.querySelector('#edit-name').addEventListener('click', async () => {
      const name = prompt('Ton nom :', p.name);
      if (name && name.trim()) {
        p.name = name.trim();
        await dbPut('profile', p);
        await loadAll();
        render();
      }
    });
  }, 0);

  // ── Profil sportif (chronos prédits + allures Daniels actuelles) ──────
  const vdot = currentVDOT(State.activities);
  if (vdot) {
    const races = predictRaceTimes(vdot.vdot);
    const paces = trainingPaces(vdot.vdot);
    page.appendChild(el('h3', { class: 'mb-2' }, '⚡ Profil sportif'));
    const sportCard = el('div', { class: 'card mb-4' });
    const racesHtml = races ? Object.entries(races).map(([k, r]) => `
      <div class="race-row">
        <div class="race-dist">${k}</div>
        <div class="race-time mono">${formatDuration(r.time)}</div>
        <div class="race-pace dim mono">${formatPace(r.time / (r.distance / 1000))}</div>
      </div>
    `).join('') : '';
    const pacesHtml = paces ? `
      <div class="paces-grid">
        <div class="pace-cell"><div class="pace-key">E</div><div class="pace-val mono">${formatPace(paces.E)}</div><div class="pace-desc">Footing</div></div>
        <div class="pace-cell"><div class="pace-key">M</div><div class="pace-val mono">${formatPace(paces.M)}</div><div class="pace-desc">Marathon</div></div>
        <div class="pace-cell"><div class="pace-key">T</div><div class="pace-val mono">${formatPace(paces.T)}</div><div class="pace-desc">Seuil</div></div>
        <div class="pace-cell"><div class="pace-key">I</div><div class="pace-val mono">${formatPace(paces.I)}</div><div class="pace-desc">VMA</div></div>
        <div class="pace-cell"><div class="pace-key">R</div><div class="pace-val mono">${formatPace(paces.R)}</div><div class="pace-desc">Sprint</div></div>
      </div>
    ` : '';
    sportCard.innerHTML = `
      <div class="dim text-xs mb-2">Estimations basées sur tes meilleures sorties récentes</div>
      <div class="perf-section-title" style="margin-top:0; padding-top:0; border-top:0;">⏱ Chronos prédits</div>
      <div class="races-list">${racesHtml}</div>
      <div class="perf-section-title">🎯 Allures actuelles</div>
      ${pacesHtml}
    `;
    page.appendChild(sportCard);
  }

  // Compétences
  page.appendChild(el('h3', { class: 'mb-2' }, '⭐ Compétences'));
  const skCard = el('div', { class: 'card mb-4' });
  let skHtml = '';
  for (const [k, sk] of Object.entries(p.skills)) {
    const meta = SKILL_META[k];
    const info = deriveLevel(sk.xp);
    skHtml += `
      <div class="skill-row">
        <div class="flex between mb-1">
          <div class="flex gap-2"><span class="skill-icon">${meta.icon}</span><span style="font-weight:500;">${meta.label}</span></div>
          <span class="mono text-sm" style="color:${meta.color}; font-weight:700;">Niveau ${info.level}</span>
        </div>
        ${progressBar(info.progress, 6)}
        <div class="flex between mt-1">
          <span class="text-xs mute">${meta.desc}</span>
          <span class="text-xs mute mono">${info.xpInLevel}/${info.xpToNext} XP</span>
        </div>
      </div>
    `;
  }
  skCard.innerHTML = skHtml;
  page.appendChild(skCard);

  // Sauvegarde
  page.appendChild(el('h3', { class: 'mb-2' }, '💾 Sauvegarde'));
  const saveCard = el('div', { class: 'card mb-4' });
  saveCard.innerHTML = `
    <p class="dim text-sm mb-3">Données stockées localement. Sauvegarde auto au premier lancement de chaque journée (gardé 7 jours).</p>
    <div class="save-actions">
      <button class="btn-gpx" id="btn-export">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        <span>Exporter</span>
      </button>
      <label class="btn-gpx" id="btn-import-label">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        <span>Importer</span>
        <input type="file" accept=".json" hidden id="import-file" />
      </label>
    </div>
    <div class="dim text-xs mt-3" id="auto-backup-info">Chargement…</div>
  `;
  page.appendChild(saveCard);
  setTimeout(async () => {
    saveCard.querySelector('#btn-export').addEventListener('click', exportData);
    saveCard.querySelector('#import-file').addEventListener('change', onImportFile);
    // Affiche la dernière sauvegarde auto.
    const infoEl = saveCard.querySelector('#auto-backup-info');
    const backups = await dbAll('backups');
    backups.sort((a, b) => b.date.localeCompare(a.date));
    if (backups.length === 0) {
      infoEl.textContent = 'Aucune sauvegarde auto pour l\'instant.';
    } else {
      const last = backups[0];
      const sizeKb = Math.round(last.size / 1024);
      const items = backups.map(b => `<button class="auto-backup-item" data-date="${b.date}">${formatDate(b.date)}</button>`).join('');
      infoEl.innerHTML = `
        Dernière sauvegarde auto : <strong>${formatDate(last.date)}</strong> · ${sizeKb} Ko<br>
        <div class="auto-backup-list">${items}</div>
      `;
      infoEl.querySelectorAll('.auto-backup-item').forEach(btn => {
        btn.addEventListener('click', async () => {
          await downloadAutoBackup(btn.dataset.date);
        });
      });
    }
  }, 0);

  // Outils avancés (recalcul total, etc.)
  page.appendChild(el('h3', { class: 'mb-2' }, '⚙️ Outils'));
  const toolsCard = el('div', { class: 'card mb-4' });
  toolsCard.innerHTML = `
    <p class="dim text-sm mb-3">
      Recalcule l'XP total et les niveaux à partir de l'historique complet (sorties, work logs, quêtes), avec les barèmes courants.
      Utile après une mise à jour des compétences ou des règles XP. Aucune donnée n'est perdue, seuls les niveaux sont recalculés.
    </p>
    <button class="btn-gpx" id="btn-recompute" style="width:100%; justify-content:center;">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
      <span>Recalculer XP totale</span>
    </button>
  `;
  page.appendChild(toolsCard);
  setTimeout(() => {
    toolsCard.querySelector('#btn-recompute').addEventListener('click', async () => {
      if (!confirm('Recalculer XP et niveaux depuis l\'historique complet ?\n\nTes données restent intactes, seul le calcul est refait avec les barèmes courants. Cette opération peut prendre quelques secondes.')) return;
      const btn = toolsCard.querySelector('#btn-recompute');
      btn.disabled = true;
      btn.querySelector('span').textContent = 'Recalcul…';
      try {
        const r = await recomputeAllXp();
        if (r.success) {
          showToast({
            type: 'levelup',
            title: 'Recalcul terminé',
            text: `${r.totalActivities} sorties · ${r.totalWorkLogs} work logs · ${r.totalCompletions} quêtes · ${r.finalXp} XP`
          }, 5000);
          render();
        } else {
          showToast({ type: 'err', title: 'Échec', text: r.reason || 'Erreur inconnue' });
        }
      } catch (err) {
        showToast({ type: 'err', title: 'Erreur', text: err.message });
      } finally {
        btn.disabled = false;
        btn.querySelector('span').textContent = 'Recalculer XP totale';
      }
    });
  }, 0);

  // Footer version : juste l'info, discret.
  page.appendChild(el('div', {
    class: 'dim text-xs mt-5',
    style: 'text-align:center; padding-top: 12px; border-top: 1px solid var(--border);'
  }, `Orion v${APP_VERSION}`));

  root.appendChild(page);
}

// ============================================================================
// 19. EXPORT/IMPORT JSON
// ============================================================================

// Construit le snapshot complet de l'app (utilisé par export et backup auto).
// `backups` lui-même est volontairement EXCLU pour éviter la récursion.
async function buildSnapshot() {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    profile: await dbAll('profile'),
    quests: await dbAll('quests'),
    completions: await dbAll('completions'),
    activities: await dbAll('activities'),
    workLog: await dbAll('workLog'),
    exams: await dbAll('exams'),
    schedule: await dbAll('schedule'),
    records: await dbAll('records'),
    meta: await dbAll('meta')
  };
}

async function exportData() {
  const data = await buildSnapshot();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `orion-backup-${todayKey()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Sauvegarde auto au premier lancement de la journée. Stockée en IndexedDB
// (store `backups`), garde les 7 dernières. Idempotent : si une sauvegarde
// du jour existe déjà, ne fait rien.
async function maybeAutoBackup() {
  try {
    const today = todayKey();
    const existing = await dbGet('backups', today);
    if (existing) return { skipped: true };

    const snapshot = await buildSnapshot();
    const json = JSON.stringify(snapshot);
    await dbPut('backups', { date: today, json, size: json.length, createdAt: new Date().toISOString() });

    // Garde les 7 dernières sauvegardes.
    const all = await dbAll('backups');
    all.sort((a, b) => b.date.localeCompare(a.date));
    for (let i = 7; i < all.length; i++) {
      await dbDelete('backups', all[i].date);
    }
    await dbPut('meta', { key: 'lastAutoBackup', value: today });
    return { created: true, date: today, size: json.length };
  } catch (err) {
    return { error: err.message };
  }
}

// Télécharge un backup automatique précédemment stocké.
async function downloadAutoBackup(date) {
  const b = await dbGet('backups', date);
  if (!b) return false;
  const blob = new Blob([b.json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `orion-backup-${date}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

async function onImportFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  if (!confirm('⚠️ Importer va REMPLACER toutes tes données actuelles. Continuer ?')) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data.version) throw new Error('Fichier invalide');
    for (const store of ['profile', 'quests', 'completions', 'activities', 'workLog', 'exams', 'schedule', 'records', 'meta']) {
      await dbClear(store);
      const items = data[store] || [];
      for (const it of items) await dbPut(store, it);
    }
    showToast({ type: 'xp', title: '✅ Importé', text: 'Rechargement…' }, 1500);
    setTimeout(() => location.reload(), 1500);
  } catch (err) {
    showToast({ type: 'err', title: 'Erreur', text: err.message }, 4000);
  }
}

// ============================================================================
// 20. SPLASH + INIT
// ============================================================================

function showSplash() {
  const splash = document.getElementById('splash');
  const content = splash.querySelector('.splash-content');
  setTimeout(() => content.classList.add('show'), 50);
  setTimeout(() => splash.classList.add('fade-out'), 900);
  setTimeout(() => splash.classList.add('hidden'), 1300);
  splash.addEventListener('click', () => {
    splash.classList.add('fade-out');
    setTimeout(() => splash.classList.add('hidden'), 250);
  });
}

async function init() {
  showSplash();
  await initSeed();
  await loadAll();
  await recomputeAutoQuests();

  // Applique les malus/bonus pour les jours/semaines déjà passés depuis la rentrée.
  const tick = await applyPendingPenalties();
  await loadAll();

  // Sauvegarde automatique : 1× par jour au premier lancement.
  // Silencieuse : on ne notifie que si elle a réellement créé un snapshot.
  maybeAutoBackup().catch(() => {});

  document.getElementById('app').classList.remove('hidden');
  document.getElementById('tabbar').classList.remove('hidden');

  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => navigate(t.dataset.route));
  });

  navigate('home');

  // Si des malus/bonus viennent d'être appliqués, le signaler.
  if (tick?.applied?.length) {
    const totalMalus = tick.applied.filter(a => a.kind !== 'weekly-bonus').reduce((s, a) => s + a.xp, 0);
    const totalBonus = tick.applied.filter(a => a.kind === 'weekly-bonus').reduce((s, a) => s + a.xp, 0);
    setTimeout(() => {
      showToast({
        type: 'xp',
        title: 'Bilan période',
        text: (totalBonus > 0 ? `+${totalBonus} XP bonus` : '') +
              (totalBonus > 0 && totalMalus > 0 ? ' · ' : '') +
              (totalMalus > 0 ? `−${totalMalus} XP malus` : '')
      }, 4500);
    }, 1500);
  }
}

document.addEventListener('DOMContentLoaded', init);
