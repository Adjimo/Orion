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
const DB_VERSION = 1;
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
  return 100 + (level - 1) * 40 + Math.pow(level - 1, 2) * 5;
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
  langues:    { label: 'Lettres',    icon: '📚', color: '#ffd86b', desc: 'Langues, français, philo.' },
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
  maths:    { label: 'Maths',     icon: '🧮', skill: 'maths' },
  physique: { label: 'Physique',  icon: '⚛️', skill: 'physique' },
  si:       { label: 'SI / Info', icon: '🔬', skill: 'si' },
  langues:  { label: 'Langues',   icon: '🌍', skill: 'langues' },
  francais: { label: 'Français',  icon: '✒️', skill: 'langues' },
  autre:    { label: 'Autre',     icon: '📖', skill: 'discipline' }
};

function baseXpForGoal(goalHours) {
  return Math.round(20 + goalHours * 15);
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
      newSkillsXp[meta.skill] = (newSkillsXp[meta.skill] || 0) + Math.round(newXp * portion * 0.6);
    }
  }
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
  { id: 'wq-runs',    title: 'Sorties course', type: 'weekly-count', goalCount: 3, unit: 'sorties', skill: 'endurance',  icon: '🏃', color: '#ff6a3d', autoFromActivities: true },
  { id: 'wq-work',    title: 'Heures de travail', type: 'weekly-hours', goalHours: 30, skill: 'discipline', icon: '⏱️', color: '#ffb547', autoFromWorkLog: true },
  { id: 'wq-langues', title: 'Langues', type: 'weekly-hours', goalHours: 3, skill: 'langues', icon: '🌍', color: '#ffd86b', autoFromLangues: true },
  { id: 'wq-sleep',   title: 'Nuits ≥ 7h', type: 'weekly-count', goalCount: 7, unit: 'nuits', skill: 'discipline', icon: '🌙', color: '#5cc8ff' }
];

function computeCountXp(actualCount, goalCount) {
  if (!goalCount) return { xp: 0, ratio: 0 };
  const base = 20 + goalCount * 12;
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
      langMin += (bs.langues || 0) + (bs.francais || 0);
    }
    await setQuestValue(langQ, langMin);
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
  const xp = Math.round(parsed.distanceKm * 5 + parsed.elevGain * 0.1);
  return {
    xp,
    skills: {
      endurance: Math.round(parsed.distanceKm * 3),
      montagne: Math.round(parsed.elevGain * 0.08),
      discipline: 5
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
  page.appendChild(el('div', { class: 'page-title' }, [el('h1', {}, 'Quêtes')]));

  // Aujourd'hui (sport + travail)
  page.appendChild(el('h3', { class: 'mb-2' }, '📆 Aujourd\'hui'));
  const dashWrap = el('div', { class: 'mb-5' });
  page.appendChild(dashWrap);

  // Cette semaine
  page.appendChild(el('h3', { class: 'mb-2' }, '🎯 Cette semaine'));
  const weeklyWrap = el('div', { class: 'flex col gap-2 mb-5' });
  page.appendChild(weeklyWrap);

  root.appendChild(page);

  // Render async
  renderDayDashboard(dashWrap);
  renderWeeklyQuests(weeklyWrap);
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
        renderDayDashboard(root);
        renderWeeklyQuests(document.querySelector('.page > .flex.col.gap-2'));
        showToast({ type: 'xp', title: 'Mis à jour', text: `${meta.label}: ${formatMinutes(newMin)}` });
      });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
      sub.appendChild(input);
      grid.appendChild(sub);
    }
  }
}

async function renderWeeklyQuests(root) {
  const wks = State.quests.filter(q => q.type === 'weekly-hours' || q.type === 'weekly-count');
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
    const isAuto = q.autoFromActivities || q.autoFromWorkLog || q.autoFromLangues;

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
          renderWeeklyQuests(root);
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
          renderWeeklyQuests(root);
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
  const importLabel = el('label', { class: 'btn primary sm' }, '+ GPX');
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
        await dbDelete('activities', sel.id);
        await loadAll();
        State.currentActivity = State.activities[0] || null;
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

function renderMap(activity) {
  if (!activity || !window.L) return;
  const mapEl = document.getElementById('sport-map');
  if (!mapEl) return;
  if (State.map) { State.map.remove(); State.map = null; }
  State.map = L.map(mapEl, { zoomControl: true, attributionControl: false }).setView([46.5, 2.5], 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(State.map);
  const latlngs = activity.points.map(p => [p.lat, p.lon]);
  State.mapTrack = L.polyline(latlngs, { color: '#39ff88', weight: 4, opacity: 0.9 }).addTo(State.map);
  if (latlngs.length > 0) {
    L.circleMarker(latlngs[0], { radius: 6, color: '#39ff88', fillColor: '#39ff88', fillOpacity: 1 }).addTo(State.mapTrack);
    L.circleMarker(latlngs[latlngs.length - 1], { radius: 6, color: '#a855f7', fillColor: '#a855f7', fillOpacity: 1 }).addTo(State.mapTrack);
  }
  State.map.fitBounds(State.mapTrack.getBounds(), { padding: [20, 20] });
  setTimeout(() => State.map.invalidateSize(), 100);
}

async function onGpxFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = parseGpx(text);
    const splits = computeSplits(parsed);
    const type = detectActivityType(parsed);
    const activity = { id: 'act-' + Date.now(), type, ...parsed, ...splits };
    await dbPut('activities', activity);
    const { xp, skills } = activityXp(parsed);
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
  await loadAll();

  document.getElementById('app').classList.remove('hidden');
  document.getElementById('tabbar').classList.remove('hidden');

  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => navigate(t.dataset.route));
  });

  navigate('home');
}

document.addEventListener('DOMContentLoaded', init);
