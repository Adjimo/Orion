// XP, niveaux, rangs et compétences
import { dbPut } from './db.js';
import { State } from './state.js';

export function xpForLevelUp(level) {
  // Courbe quasi-linéaire : chaque niveau coûte ~1200 XP, +5 par level.
  // L1 = 1200, L100 = 1695, cumul L100 ≈ 145k.
  // Calibrée pour atteindre L100 aux concours avec 25-30h travail/sem
  // + 3 sorties/sem depuis sept 2026. Évite les level-ups instantanés en début
  // tout en restant tendu vers la fin (pas de plateau).
  return Math.round(1200 + (level - 1) * 5);
}

export function deriveLevel(totalXp) {
  let level = 1, remaining = totalXp;
  while (remaining >= xpForLevelUp(level)) {
    remaining -= xpForLevelUp(level);
    level++;
    if (level > 200) break;
  }
  const need = xpForLevelUp(level);
  return { level, xpInLevel: remaining, xpToNext: need, progress: need > 0 ? remaining / need : 0 };
}

export const SKILL_META = {
  endurance:  { label: 'Endurance',  icon: '🏃', color: '#bba677', desc: 'Volume kilométrique.' },
  allure:     { label: 'Allure',     icon: '⚡', color: '#d9a441', desc: 'Performance pure.' },
  maths:      { label: 'Maths',      icon: '🧮', color: '#e6d9b0', desc: 'DM, exos, démos.' },
  physique:   { label: 'Physique',   icon: '⚛️', color: '#b0705a', desc: 'Mécanique, thermo, ondes.' },
  si:         { label: 'SI / Info',  icon: '🔬', color: '#a8742a', desc: 'Sciences ingé / info.' },
  langues:    { label: 'Anglais',    icon: '🌍', color: '#d8c797', desc: 'Anglais.' },
  lettres:    { label: 'Lettres',    icon: '✒️', color: '#c8975a', desc: 'Français, philo.' },
  discipline: { label: 'Discipline', icon: '🧘', color: '#9c7424', desc: 'Régularité, focus.' }
};

export const RANKS = [
  { from: 1,   to: 4,   title: 'Mortel',              color: '#8a8270' },
  { from: 5,   to: 9,   title: 'Initié',              color: '#a8956a' },
  { from: 10,  to: 14,  title: 'Aspirant',            color: '#bba677' },
  { from: 15,  to: 19,  title: 'Coureur',             color: '#d8c797' },
  { from: 20,  to: 29,  title: 'Marcheur du Soleil',  color: '#e6c36a' },
  { from: 30,  to: 49,  title: 'Cendres',             color: '#b0705a' },
  { from: 50,  to: 74,  title: 'Renaissance',         color: '#d9a441' },
  { from: 75,  to: 99,  title: 'Phénix',              color: '#e89a3c' },
  { from: 100, to: 999, title: 'Orion',               color: '#f3e3ab' }
];

export function getRank(level) {
  for (const r of RANKS) if (level >= r.from && level <= r.to) return r;
  return RANKS[0];
}

export function getNextRank(level) {
  for (const r of RANKS) if (level < r.from) return { rank: r, levelsAway: r.from - level };
  return null;
}

export const DEFAULT_PROFILE = {
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

export async function awardXp(amount, skillGains = {}) {
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

export async function removeXp(amount, skillGains = {}) {
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
