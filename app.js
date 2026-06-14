// ============================================================================
// Orion - app.js (vanilla JS)
// Webapp PWA pour gamifier prépa MP* + trail. Stockage local (IndexedDB).
// ============================================================================

'use strict';

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
const DB_VERSION = 2;
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
      // v2 : pas de nouveau store, juste un nouveau skill `lettres` + champs sur quêtes/activités.
      // La migration des données est gérée hors-onupgradeneeded dans migrateData().
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
  endurance:  { label: 'Endurance',  icon: '🏃', color: '#5cc8ff', desc: 'Distance au sol.' },
  montagne:   { label: 'Montagne',   icon: '⛰️', color: '#ffb547', desc: 'Dénivelé conquis.' },
  maths:      { label: 'Maths',      icon: '🧮', color: '#7c5cff', desc: 'DM, exos, démos.' },
  physique:   { label: 'Physique',   icon: '⚛️', color: '#a78bfa', desc: 'Mécanique, thermo, ondes.' },
  si:         { label: 'SI / Info',  icon: '🔬', color: '#f472b6', desc: 'Sciences ingé / info.' },
  langues:    { label: 'Langues',    icon: '🌍', color: '#5cc8ff', desc: 'LV1, LV2, oraux.' },
  lettres:    { label: 'Lettres',    icon: '✒️', color: '#ffd86b', desc: 'Français, philo.' },
  discipline: { label: 'Discipline', icon: '🧘', color: '#ff6a3d', desc: 'Régularité, focus.' }
};

const RANKS = [
  { from: 1,   to: 4,   title: 'Mortel',              color: '#a0a4b8' },
  { from: 5,   to: 9,   title: 'Initié',              color: '#5cc8ff' },
  { from: 10,  to: 14,  title: 'Aspirant',            color: '#7c5cff' },
  { from: 15,  to: 19,  title: 'Chasseur',            color: '#ffb547' },
  { from: 20,  to: 29,  title: 'Marcheur des Crêtes', color: '#ffb547' },
  { from: 30,  to: 49,  title: 'Géant',               color: '#ff6a3d' },
  { from: 50,  to: 74,  title: 'Fils de Poséidon',    color: '#ff6a3d' },
  { from: 75,  to: 99,  title: 'Constellation',       color: '#ffd86b' },
  { from: 100, to: 999, title: 'Orion',               color: '#ffd86b' }
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
    montagne:   { xp: 0, level: 1 },
    maths:      { xp: 0, level: 1 },
    physique:   { xp: 0, level: 1 },
    si:         { xp: 0, level: 1 },
    langues:    { xp: 0, level: 1 },
    lettres:    { xp: 0, level: 1 },
    discipline: { xp: 0, level: 1 }
  },
  streak: 0,
  lastActiveDate: null,
  bestStreak: 0
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

const DEFAULT_SCHEDULE = [
  { id: 'mon', sport: 'required', sportType: 'course', workHours: 4 },
  { id: 'tue', sport: 'required', sportType: 'course', workHours: 4 },
  { id: 'wed', sport: 'free',     sportType: null,     workHours: 6 },
  { id: 'thu', sport: 'free',     sportType: null,     workHours: 5 },
  { id: 'fri', sport: 'required', sportType: 'course', workHours: 4 },
  { id: 'sat', sport: 'free',     sportType: null,     workHours: 8 },
  { id: 'sun', sport: 'free',     sportType: null,     workHours: 6 }
];

const SPORT_TYPES = {
  course: { label: 'Course', icon: '🏃' },
  fractionne: { label: 'Fractionné', icon: '⚡' },
  long: { label: 'Sortie longue', icon: '🛤️' },
  trail: { label: 'Trail', icon: '⛰️' },
  rando: { label: 'Randonnée', icon: '🥾' }
};

async function getTodayPlan() {
  const sched = await dbAll('schedule');
  return sched.find(s => s.id === dayKeyFromDate());
}

// ============================================================================
// 6. WORK TIME (saisie de travail unifiée)
// ============================================================================

const SUBJECTS = {
  maths:    { label: 'Maths',     icon: '🧮', skill: 'maths',      skillMult: 0.55 },
  physique: { label: 'Physique',  icon: '⚛️', skill: 'physique',   skillMult: 0.65 },
  si:       { label: 'SI / Info', icon: '🔬', skill: 'si',         skillMult: 1.40 },
  langues:  { label: 'Langues',   icon: '🌍', skill: 'langues',    skillMult: 0.90 },
  francais: { label: 'Français',  icon: '✒️', skill: 'lettres',    skillMult: 0.90 },
  autre:    { label: 'Autre',     icon: '📖', skill: 'discipline', skillMult: 0.50 }
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
  newSkillsXp.discipline = (newSkillsXp.discipline || 0) + Math.round(newXp * 0.25);

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
  { id: 'wq-work',    title: 'Heures de travail', type: 'weekly-hours', goalHours: 30, skill: 'discipline', icon: '⏱️', color: '#ffb547', autoFromWorkLog: true, category: 'main' },
  { id: 'wq-sleep',   title: 'Nuits ≥ 7h', type: 'weekly-count', goalCount: 7, unit: 'nuits', skill: 'discipline', icon: '🌙', color: '#5cc8ff', category: 'main' },
  // Secondaires — donnent des bonus si dépassées (à partir du 2026-09-07)
  { id: 'wq-langues', title: 'Langues', type: 'weekly-hours', goalHours: 3, skill: 'langues', icon: '🌍', color: '#5cc8ff', autoFromLangues: true, category: 'secondary' },
  { id: 'wq-lettres', title: 'Lettres', type: 'weekly-hours', goalHours: 2, skill: 'lettres', icon: '✒️', color: '#ffd86b', autoFromLettres: true, category: 'secondary' }
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
  newSkillsXp.discipline = (newSkillsXp.discipline || 0) + Math.round(newXp * 0.2);

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
  const weekStart = ws.toISOString().slice(0, 10);
  const acts = await dbAll('activities');
  const logs = await dbAll('workLog');
  const quests = await dbAll('quests');

  const sortiesQ = quests.find(q => q.id === 'wq-runs');
  if (sortiesQ) {
    const weekActs = acts.filter(a => new Date(a.date) >= ws);
    const courseCount = weekActs.filter(a => a.type === 'course' || a.type === 'trail').length;
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
            await removeXp(malusXp, { discipline: Math.round(malusXp * 0.5) });
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
        await removeXp(malusXp, { discipline: Math.round(malusXp * 0.5) });
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
          skills.discipline = (skills.discipline || 0) + Math.round(bonusXp * 0.2);
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

function detectActivityType(parsed) {
  const dPlusPerKm = parsed.distanceKm > 0 ? parsed.elevGain / parsed.distanceKm : 0;
  if (dPlusPerKm > 30) return 'trail';
  if (parsed.avgSpeed < 6) return 'rando';
  return 'course';
}

function formatDuration(seconds) {
  if (!seconds) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatPace(secondsPerKm) {
  if (!secondsPerKm) return '—';
  const m = Math.floor(secondsPerKm / 60);
  const s = Math.round(secondsPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}/km`;
}

function activityXp(parsed) {
  // Calibré pour 3 sorties/semaine moyenne (10 km, 200 m D+) ≈ 1800 XP/sem sport.
  // Montagne fortement boostée pour compenser le faible volume de D+.
  const xp = Math.round(parsed.distanceKm * 28 + parsed.elevGain * 1.6);
  return {
    xp,
    skills: {
      endurance: Math.round(parsed.distanceKm * 20),
      montagne: Math.round(parsed.elevGain * 1.8),
      discipline: 30
    }
  };
}

// ============================================================================
// 10. RECORDS (sport)
// ============================================================================

const RECORD_TYPES = [
  { id: 'longest',    label: 'Plus longue sortie', icon: '🛣️', metric: 'distanceKm', mode: 'max' },
  { id: 'highest',    label: 'Plus gros D+',       icon: '🏔️', metric: 'elevGain',   mode: 'max' },
  { id: 'fastest5k',  label: 'Meilleur 5K',        icon: '⚡', metric: 'best5k',     mode: 'min' },
  { id: 'fastest10k', label: 'Meilleur 10K',       icon: '🏃', metric: 'best10k',    mode: 'min' },
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
  const b5 = bestSplit(parsed.points, 5000);
  const b10 = bestSplit(parsed.points, 10000);
  if (b5) splits.best5k = b5;
  if (b10) splits.best10k = b10;
  return splits;
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
  // Profil : ajoute le skill `lettres` si absent.
  const profile = await dbGet('profile', 'me');
  if (profile && !profile.skills.lettres) {
    profile.skills.lettres = { xp: 0, level: 1 };
    await dbPut('profile', profile);
  }

  // Quêtes : backfill `category` sur seeds existants.
  const quests = await dbAll('quests');
  for (const q of quests) {
    const seed = SEED_WEEKLY_QUESTS.find(s => s.id === q.id);
    if (seed && !q.category) {
      Object.assign(q, seed); // on remet aussi flags auto*, skill, etc. à jour
      await dbPut('quests', q);
    }
  }

  // Activités : backfill xpAwarded/skillsAwarded pour permettre la suppression réversible.
  const acts = await dbAll('activities');
  for (const a of acts) {
    if (a.xpAwarded == null) {
      const { xp, skills } = activityXp(a);
      a.xpAwarded = xp;
      a.skillsAwarded = skills;
      await dbPut('activities', a);
    }
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
    t.classList.toggle('active', t.dataset.route === route);
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
  const weekStart = ws.toISOString().slice(0, 10);
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
        el('div', { class: 'dim text-xs' }, 'Streak'),
        el('div', { class: 'text-xl' }, '🔥 ' + (p.streak || 0)),
        el('div', { class: 'text-xs mute' }, 'Record : ' + (p.bestStreak || 0))
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

  // Principales — donnent des malus si pas faites
  page.appendChild(el('h3', { class: 'mb-1' }, '🎯 Principales'));
  page.appendChild(el('div', { class: 'dim text-xs mb-2' },
    arePenaltiesActive()
      ? 'Malus appliqué la semaine prochaine si non atteintes.'
      : `À partir du ${formatDate(PENALTIES_START)}, malus si non atteintes.`));
  const mainWrap = el('div', { class: 'flex col gap-2 mb-5' });
  page.appendChild(mainWrap);

  // Secondaires — donnent des bonus si dépassées
  page.appendChild(el('h3', { class: 'mb-1' }, '✨ Secondaires'));
  page.appendChild(el('div', { class: 'dim text-xs mb-2' },
    arePenaltiesActive()
      ? 'Bonus de XP si dépassées.'
      : `À partir du ${formatDate(PENALTIES_START)}, bonus si dépassées.`));
  const secWrap = el('div', { class: 'flex col gap-2 mb-5' });
  page.appendChild(secWrap);

  root.appendChild(page);

  // Render async
  renderDayDashboard(dashWrap);
  renderWeeklyQuests(mainWrap, 'main');
  renderWeeklyQuests(secWrap, 'secondary');
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
  const showSport = todayPlan.sport === 'required';
  const todayActs = State.activities.filter(a => a.date.slice(0, 10) === dateKey);
  const sportDone = todayActs.length > 0;

  const barColor = wi.ratio < 0.5 ? '#5e6480' : wi.ratio < 1 ? '#7c5cff' : '#ffb547';

  let sportBlock = '';
  if (showSport) {
    const sportMeta = SPORT_TYPES[todayPlan.sportType] || SPORT_TYPES.course;
    sportBlock = `
      <div class="block sport ${sportDone ? 'done' : ''}">
        <div class="block-icon">${sportMeta.icon}</div>
        <div class="block-body">
          <div class="block-title">${sportMeta.label}<span class="pill warm" style="margin-left:8px;">Sport du jour</span></div>
          <div class="dim text-xs">${sportDone ? '✓ Sortie validée' : 'Importe ton GPX quand c\'est fait'}</div>
        </div>
      </div>
    `;
  }

  let workBlock = '';
  if (goalHours > 0) {
    workBlock = `
      <div class="block work">
        <div class="block-icon">📚</div>
        <div class="block-body">
          <div class="flex between">
            <div class="block-title">Travail · objectif ${goalHours}h</div>
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
    const c = await getCurrentCompletion(q);
    const actual = c?.actualValue || 0;
    const xp = c?.lastXp || 0;
    const ratio = c?.ratio || 0;
    const isHours = q.type === 'weekly-hours';
    const goal = isHours ? q.goalHours : q.goalCount;
    const unit = isHours ? 'h' : (q.unit || 'fois');
    const progress = goal > 0 ? Math.min(1, actual / (isHours ? goal * 60 : goal)) : 0;
    const isAuto = q.autoFromActivities || q.autoFromWorkLog || q.autoFromLangues || q.autoFromLettres;

    // Aperçu malus/bonus, uniquement à partir de la rentrée.
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
          renderWeeklyQuests(root, category);
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
          renderWeeklyQuests(root, category);
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
    const typeIcon = sel.type === 'trail' ? '⛰️' : sel.type === 'rando' ? '🥾' : '🏃';
    const card = el('div', { class: 'card mb-4', html: `
      <div class="flex between mb-2">
        <div>
          <div class="text-lg" style="font-weight:600;">${typeIcon} ${escapeHtml(sel.name)}</div>
          <div class="dim text-sm">${formatDate(sel.date)}</div>
        </div>
        <button class="btn ghost sm danger" id="del-act">Suppr.</button>
      </div>
      <div class="metrics">
        <div class="metric"><div class="m-val grad-text">${sel.distanceKm}</div><div class="m-lbl">km</div></div>
        <div class="metric"><div class="m-val grad-text">${sel.elevGain}</div><div class="m-lbl">m D+</div></div>
        <div class="metric"><div class="m-val grad-text">${formatDuration(sel.duration)}</div><div class="m-lbl">durée</div></div>
        <div class="metric"><div class="m-val grad-text">${formatPace(sel.avgPace)}</div><div class="m-lbl">allure</div></div>
      </div>
    `});
    page.appendChild(card);
    setTimeout(() => {
      card.querySelector('#del-act').addEventListener('click', async () => {
        if (!confirm(`Supprimer "${sel.name}" ?`)) return;
        const ok = await deleteActivity(sel);
        if (!ok) return;
        State.currentActivity = State.activities[0] || null;
        showToast({ type: 'xp', title: 'Sortie supprimée', text: `−${sel.xpAwarded || 0} XP rendus` });
        render();
      });
    }, 0);
  }

  // History
  page.appendChild(el('h3', { class: 'mb-2' }, `Historique (${State.activities.length})`));
  const list = el('div', { class: 'flex col gap-2' });
  const sortedActs = [...State.activities].sort((a, b) => b.date.localeCompare(a.date));
  for (const a of sortedActs) {
    const ti = a.type === 'trail' ? '⛰️' : a.type === 'rando' ? '🥾' : '🏃';
    const btn = el('button', {
      class: 'act' + (sel?.id === a.id ? ' sel' : ''),
      onclick: () => { State.currentActivity = a; render(); }
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

// Rend une carte Orion-stylée dans un conteneur DOM. Renvoie l'instance Leaflet.
function renderMapInto(mapEl, activity) {
  if (!activity || !window.L || !mapEl) return null;
  const map = L.map(mapEl, { zoomControl: true, attributionControl: true }).setView([46.5, 2.5], 6);
  // Wikimedia Maps : tile vectoriel rendu, palette nuit naturelle (bleu nuit /
  // beige crème / cyan eau), pas de filtres CSS destructifs nécessaires.
  // CC BY-SA 3.0 · OSM contributors · Wikimedia Foundation.
  L.tileLayer('https://maps.wikimedia.org/osm-intl/{z}/{x}/{y}{r}.png', {
    attribution: '© OSM · Wikimedia',
    maxZoom: 18
  }).addTo(map);
  const latlngs = activity.points.map(p => [p.lat, p.lon]);
  // Tracé : halo doré + ligne ambre éclatante. Bordure foncée subtile pour
  // découper proprement le tracé du fond plus clair de cette tile.
  L.polyline(latlngs, { color: '#0a0e1a', weight: 7, opacity: 0.5, lineJoin: 'round', lineCap: 'round' }).addTo(map);
  L.polyline(latlngs, { color: '#ffd86b', weight: 11, opacity: 0.20, lineJoin: 'round', lineCap: 'round' }).addTo(map);
  const track = L.polyline(latlngs, { color: '#ff6a3d', weight: 4, opacity: 1, lineJoin: 'round', lineCap: 'round' }).addTo(map);
  if (latlngs.length > 0) {
    L.circleMarker(latlngs[0], { radius: 7, color: '#ffd86b', weight: 2.5, fillColor: '#0a0e1a', fillOpacity: 1 }).addTo(map);
    L.circleMarker(latlngs[latlngs.length - 1], { radius: 7, color: '#7c5cff', weight: 2.5, fillColor: '#0a0e1a', fillOpacity: 1 }).addTo(map);
  }
  map.fitBounds(track.getBounds(), { padding: [20, 20] });
  setTimeout(() => map.invalidateSize(), 100);
  return map;
}

function renderMap(activity) {
  const mapEl = document.getElementById('sport-map');
  if (!mapEl) return;
  if (State.map) { State.map.remove(); State.map = null; }
  State.map = renderMapInto(mapEl, activity);
}

// Preview modale : montre la carte + métriques + XP attendu, demande confirmation.
// Résout à `true` si l'utilisateur confirme l'import, `false` sinon.
function showGpxPreview(parsed, type, splits, xp) {
  return new Promise((resolve) => {
    const typeIcon = type === 'trail' ? '⛰️' : type === 'rando' ? '🥾' : '🏃';
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
    const { xp, skills } = activityXp(parsed);

    // Preview avant import : l'utilisateur peut annuler.
    const confirmed = await showGpxPreview(parsed, type, splits, xp);
    if (!confirmed) {
      e.target.value = '';
      return;
    }

    // On stocke ce qui a été gagné pour permettre une suppression réversible.
    const activity = { id: 'act-' + Date.now(), type, ...parsed, ...splits, xpAwarded: xp, skillsAwarded: skills };
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
  // Streak max
  let bestWorkStreak = 0;
  const dates = logs.filter(l => (l.totalMinutes || 0) > 0).map(l => l.date).sort();
  if (dates.length > 0) {
    let cur = 1; bestWorkStreak = 1;
    for (let i = 1; i < dates.length; i++) {
      const dd = Math.round((new Date(dates[i]) - new Date(dates[i - 1])) / 86400000);
      if (dd === 1) { cur++; bestWorkStreak = Math.max(bestWorkStreak, cur); }
      else cur = 1;
    }
  }

  page.appendChild(el('h3', { class: 'section-h work' }, '📚 Travail'));
  page.appendChild(el('div', { class: 'card mb-3', html: `
    <div class="totals">
      <div><div class="t-val grad-text">${(totalWorkMin/60).toFixed(1)}</div><div class="t-lbl">heures cumulées</div></div>
      <div><div class="t-val grad-text">${workDays}</div><div class="t-lbl">jours actifs</div></div>
      <div><div class="t-val grad-text">${(totalWorkMin/60/Math.max(1,workDays)).toFixed(1)}</div><div class="t-lbl">moyenne / jour (h)</div></div>
      <div><div class="t-val grad-text">${bestWorkStreak}</div><div class="t-lbl">jours d'affilée max</div></div>
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
    <div class="rec-row"><div class="rec-left"><span class="rec-icon">🔥</span><span class="rec-label">Plus longue série</span></div><div class="rec-value">${bestWorkStreak > 0 ? bestWorkStreak + ' j' : '—'}</div></div>
    <div class="rec-row"><div class="rec-left"><span class="rec-icon">📚</span><span class="rec-label">Jours travaillés</span></div><div class="rec-value">${workDays > 0 ? workDays : '—'}</div></div>
  `}));

  // Sport
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

  // Volume hebdo : aire distance + ligne allure moyenne
  page.appendChild(el('div', { class: 'chart-card mb-3' }, [
    el('div', { class: 'chart-title' }, '📊 Volume & allure · 12 dernières semaines'),
    el('div', { class: 'chart-wrap' }, [el('canvas', { id: 'chart-sport-volume' })])
  ]));

  // Pace progression : ligne allure des 20 dernières sorties
  page.appendChild(el('div', { class: 'chart-card mb-3' }, [
    el('div', { class: 'chart-title' }, '⚡ Allure moyenne · dernières sorties'),
    el('div', { class: 'chart-wrap' }, [el('canvas', { id: 'chart-sport-pace' })])
  ]));

  page.appendChild(el('h3', { class: 'mb-2' }, 'Records personnels'));
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

  // ── 1. Heatmap calendaire travail (12 semaines × 7 jours) ─────────────────
  renderWorkHeatmap(logs);

  if (!window.Chart) return;

  // ── 2. Donut matières (30 derniers jours) ─────────────────────────────────
  renderSubjectsDonut(logs);

  // ── 3. Volume hebdo : aire distance + ligne allure (12 semaines) ──────────
  renderSportVolume(acts);

  // ── 4. Pace progression : 20 dernières sorties ────────────────────────────
  renderSportPace(acts);
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
      html += `<div class="heatmap-cell ${cls}" title="${tip}"></div>`;
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

function renderSportVolume(acts) {
  const ctx = document.getElementById('chart-sport-volume');
  if (!ctx) return;
  const monday = startOfWeek();
  const weeks = [];
  for (let i = 11; i >= 0; i--) {
    const m = new Date(monday); m.setDate(m.getDate() - i * 7);
    weeks.push({ start: m, end: new Date(m.getTime() + 7 * 86400000), label: m.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) });
  }
  const distances = [];
  const paces = [];
  for (const w of weeks) {
    const wActs = acts.filter(a => { const d = new Date(a.date); return d >= w.start && d < w.end; });
    const km = wActs.reduce((s, a) => s + (a.distanceKm || 0), 0);
    distances.push(Number(km.toFixed(1)));
    // Allure moyenne pondérée par distance, en min/km
    let totalSec = 0, totalKm = 0;
    for (const a of wActs) {
      if (a.duration && a.distanceKm) {
        totalSec += a.duration;
        totalKm += a.distanceKm;
      }
    }
    paces.push(totalKm > 0 ? Number((totalSec / totalKm / 60).toFixed(2)) : null);
  }
  // Si jamais aucune sortie : message vide.
  if (distances.every(d => d === 0)) {
    ctx.parentElement.innerHTML = '<div class="chart-empty">Pas encore de sorties</div>';
    return;
  }

  const ctxC = ctx.getContext('2d');
  const gradFill = ctxC.createLinearGradient(0, 0, 0, 220);
  gradFill.addColorStop(0, 'rgba(255, 106, 61, 0.55)');
  gradFill.addColorStop(1, 'rgba(255, 106, 61, 0.04)');

  State.charts.sportVolume = new Chart(ctx, {
    data: {
      labels: weeks.map(w => w.label),
      datasets: [
        {
          type: 'line',
          label: 'Distance (km)',
          data: distances,
          yAxisID: 'y',
          borderColor: CHART_COLORS.warm,
          backgroundColor: gradFill,
          borderWidth: 2.5,
          tension: 0.35,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: '#ffd86b',
          pointBorderColor: CHART_COLORS.warm,
          pointBorderWidth: 1.5,
          fill: true,
          order: 2
        },
        {
          type: 'line',
          label: 'Allure (min/km)',
          data: paces,
          yAxisID: 'y1',
          borderColor: CHART_COLORS.cool,
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [4, 4],
          tension: 0.3,
          pointRadius: 3,
          pointBackgroundColor: CHART_COLORS.cool,
          pointBorderColor: CHART_COLORS.bg,
          pointBorderWidth: 1.5,
          spanGaps: true,
          fill: false,
          order: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: CHART_COLORS.text, font: { size: 11 }, usePointStyle: true, padding: 14 } },
        tooltip: chartCommonOptions().plugins.tooltip
      },
      scales: {
        x: {
          ticks: { color: CHART_COLORS.textMute, font: { size: 10 }, maxRotation: 0, autoSkipPadding: 12 },
          grid: { display: false }
        },
        y: {
          position: 'left',
          beginAtZero: true,
          ticks: { color: CHART_COLORS.warm, font: { size: 10 }, callback: (v) => v + ' km' },
          grid: { color: CHART_COLORS.grid, drawBorder: false }
        },
        y1: {
          position: 'right',
          reverse: true, // allure plus rapide = plus haut visuellement
          ticks: { color: CHART_COLORS.cool, font: { size: 10 }, callback: (v) => {
            const m = Math.floor(v); const s = Math.round((v - m) * 60);
            return `${m}:${String(s).padStart(2, '0')}`;
          }},
          grid: { display: false }
        }
      }
    }
  });
}

function renderSportPace(acts) {
  const ctx = document.getElementById('chart-sport-pace');
  if (!ctx) return;
  const sorted = [...acts]
    .filter(a => a.duration > 0 && a.distanceKm > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-20);
  if (sorted.length < 2) {
    ctx.parentElement.innerHTML = '<div class="chart-empty">Au moins 2 sorties chronométrées pour voir la progression</div>';
    return;
  }
  // Allure en min/km
  const paces = sorted.map(a => a.duration / a.distanceKm / 60);
  const labels = sorted.map(a => new Date(a.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }));
  // Couleur par sortie selon le type
  const pointColors = sorted.map(a =>
    a.type === 'trail' ? '#ffb547' :
    a.type === 'rando' ? '#5cc8ff' :
    '#ffd86b'
  );

  const best = Math.min(...paces);
  const worst = Math.max(...paces);

  const ctxC = ctx.getContext('2d');
  const grad = ctxC.createLinearGradient(0, 0, 0, 220);
  grad.addColorStop(0, 'rgba(255, 216, 107, 0.35)');
  grad.addColorStop(1, 'rgba(255, 216, 107, 0)');

  State.charts.sportPace = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Allure',
          data: paces.map(p => Number(p.toFixed(2))),
          borderColor: CHART_COLORS.gold,
          backgroundColor: grad,
          borderWidth: 2.5,
          tension: 0.35,
          pointRadius: 5,
          pointHoverRadius: 7,
          pointBackgroundColor: pointColors,
          pointBorderColor: CHART_COLORS.bg,
          pointBorderWidth: 2,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...chartCommonOptions().plugins.tooltip,
          callbacks: {
            label: (c) => {
              const a = sorted[c.dataIndex];
              const m = Math.floor(c.parsed.y);
              const s = Math.round((c.parsed.y - m) * 60);
              const pace = `${m}:${String(s).padStart(2, '0')}/km`;
              return [`${pace}`, `${a.distanceKm} km · ${formatDuration(a.duration)}`];
            },
            title: (items) => sorted[items[0].dataIndex].name || items[0].label
          }
        }
      },
      scales: {
        x: {
          ticks: { color: CHART_COLORS.textMute, font: { size: 10 }, maxRotation: 0, autoSkipPadding: 12 },
          grid: { display: false }
        },
        y: {
          reverse: true,
          ticks: { color: CHART_COLORS.textMute, font: { size: 10 }, callback: (v) => {
            const m = Math.floor(v); const s = Math.round((v - m) * 60);
            return `${m}:${String(s).padStart(2, '0')}`;
          }},
          grid: { color: CHART_COLORS.grid, drawBorder: false },
          // Étend un peu pour donner de l'air visuel
          suggestedMin: best - 0.3,
          suggestedMax: worst + 0.3
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
      <div><div class="dim text-xs">Streak</div><div class="text-xl">🔥 ${p.streak || 0}</div></div>
      <div><div class="dim text-xs">Record</div><div class="text-xl">${p.bestStreak || 0}</div></div>
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
    <p class="dim text-sm mb-3">Données stockées localement. Pense à exporter régulièrement.</p>
    <button class="btn primary full mb-2" id="btn-export">📥 Exporter (JSON)</button>
    <label class="btn ghost full">
      📤 Importer une sauvegarde
      <input type="file" accept=".json" hidden id="import-file" />
    </label>
  `;
  page.appendChild(saveCard);
  setTimeout(() => {
    saveCard.querySelector('#btn-export').addEventListener('click', exportData);
    saveCard.querySelector('#import-file').addEventListener('change', onImportFile);
  }, 0);

  // À propos / maintenance
  page.appendChild(el('h3', { class: 'mb-2' }, '🛠️ Maintenance'));
  const mntCard = el('div', { class: 'card mb-4' });
  mntCard.innerHTML = `
    <div class="flex between mb-2">
      <span class="dim text-sm">Version</span>
      <span class="mono text-sm" id="sw-version">…</span>
    </div>
    <div class="flex between mb-3">
      <span class="dim text-sm">Statut</span>
      <span class="text-sm" id="sw-status">…</span>
    </div>
    <p class="dim text-xs mb-3">
      Si l'app n'a pas l'air à jour après une mise en ligne, vide le cache pour forcer le téléchargement de la dernière version. Tes données ne sont pas effacées.
    </p>
    <button class="btn ghost full mb-2" id="btn-check-update">🔄 Vérifier la mise à jour</button>
    <button class="btn ghost full" id="btn-clear-cache">🧹 Vider le cache et recharger</button>
  `;
  page.appendChild(mntCard);
  setTimeout(async () => {
    const versionEl = mntCard.querySelector('#sw-version');
    const statusEl = mntCard.querySelector('#sw-status');
    if (window.OrionSW) {
      const info = await window.OrionSW.getInfo();
      if (info.version) {
        versionEl.textContent = info.version;
      } else if (info.hasRegistration) {
        versionEl.textContent = '(installé · ancienne version)';
      } else {
        versionEl.textContent = 'non installé';
      }
      // Statut : actif / en attente / installation / aucun
      let statusHtml;
      if (info.hasController) {
        statusHtml = '<span style="color: var(--accent);">✓ actif</span>';
      } else if (info.hasRegistration) {
        statusHtml = '<span style="color: var(--accent-cool);">⏳ ' + (info.state || 'en cours') + '</span>';
      } else {
        statusHtml = '<span style="color: var(--text-mute);">aucun</span>';
      }
      statusEl.innerHTML = statusHtml;
    } else {
      versionEl.textContent = 'non supporté';
      statusEl.textContent = '—';
    }
    mntCard.querySelector('#btn-check-update').addEventListener('click', async () => {
      if (!window.OrionSW) {
        showToast({ type: 'err', title: 'Indisponible', text: 'Service Worker non supporté' });
        return;
      }
      showToast({ type: 'xp', title: 'Vérification…', text: 'Recherche d\'une mise à jour' });
      await window.OrionSW.forceCheckUpdate();
      // Si une nouvelle version est trouvée, le SW va activer et postMessage déclenchera un reload.
      // Sinon on signale qu'on est à jour.
      setTimeout(() => {
        showToast({ type: 'xp', title: 'À jour', text: 'Aucune nouvelle version disponible' });
      }, 2000);
    });
    mntCard.querySelector('#btn-clear-cache').addEventListener('click', async () => {
      if (!confirm('Vider le cache et recharger l\'app ? Tes données restent intactes.')) return;
      if (window.OrionSW) {
        await window.OrionSW.clearCacheAndReload();
      } else {
        location.reload();
      }
    });
  }, 0);

  // Reset
  page.appendChild(el('h3', { class: 'mb-2' }, '⚠️ Zone dangereuse'));
  const dangerCard = el('div', { class: 'card mb-4' });
  dangerCard.innerHTML = `
    <p class="dim text-sm mb-3">Effacer toutes les données.</p>
    <button class="btn danger full" id="btn-reset">🗑️ Tout effacer</button>
  `;
  page.appendChild(dangerCard);
  setTimeout(() => {
    dangerCard.querySelector('#btn-reset').addEventListener('click', async () => {
      if (!confirm('⚠️ Effacer TOUTES tes données ? Irréversible.')) return;
      if (!confirm('Vraiment sûr ? Pense à exporter avant.')) return;
      await fullReset();
    });
  }, 0);

  root.appendChild(page);
}

// ============================================================================
// 19. EXPORT/IMPORT JSON
// ============================================================================

async function exportData() {
  const data = {
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
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `orion-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
