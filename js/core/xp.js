// XP, niveaux, rangs et compétences
import { dbPut } from './db.js';
import { State } from './state.js';

// ── Niveaux façon Donjons & Dragons (5e) : niveau 1 → 20, courbe très progressive.
// Seuils D&D 5e (XP cumulés pour atteindre chaque niveau), remis à l'échelle pour que le
// niveau 20 tombe aux oraux (mi/fin juin 2027) : seuil(n) = DND_XP[n] × LEVEL20_XP / 355 000.
// Calibrage : l'ancien système donnait niveau 35 au 11/11/2026 ≈ 43 600 XP (≈ 3 600 XP/sem depuis
// le 15 août). À ce rythme, vacances et semaines allégées déduites, on atteint ≈ 140-150 k XP fin juin.
// Pour décaler la date du niveau 20, ne changer que LEVEL20_XP (aucune XP stockée n'est modifiée).
export const MAX_LEVEL = 20;
export const LEVEL20_XP = 145000;
const DND_XP = [0, 0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];
export const LEVEL_THRESHOLDS = DND_XP.map(x => Math.round(x * LEVEL20_XP / 355000));   // index = niveau

export function deriveLevel(totalXp) {
  let level = 1;
  while (level < MAX_LEVEL && totalXp >= LEVEL_THRESHOLDS[level + 1]) level++;
  if (level >= MAX_LEVEL) return { level, xpInLevel: totalXp - LEVEL_THRESHOLDS[MAX_LEVEL], xpToNext: 0, progress: 1, max: true };
  const from = LEVEL_THRESHOLDS[level], need = LEVEL_THRESHOLDS[level + 1] - from;
  return { level, xpInLevel: totalXp - from, xpToNext: need, progress: (totalXp - from) / need, max: false };
}

// Niveaux de compétence (non affichés, conservés pour les données existantes) : ancienne courbe linéaire.
export function xpForLevelUp(level) { return Math.round(1200 + (level - 1) * 5); }
export function deriveSkillLevel(xp) {
  let level = 1, remaining = xp;
  while (remaining >= xpForLevelUp(level) && level <= 200) { remaining -= xpForLevelUp(level); level++; }
  return { level };
}

export const SKILL_META = {
  endurance:  { label: 'Endurance',  icon: 'run', color: '#C8814A', desc: 'Volume kilométrique.' },
  allure:     { label: 'Allure',     icon: 'bolt', color: '#D08A4E', desc: 'Performance pure.' },
  maths:      { label: 'Maths',      icon: 'sigma', color: '#EBCDB0', desc: 'DM, exos, démos.' },
  physique:   { label: 'Physique',   icon: 'atom', color: '#b0705a', desc: 'Mécanique, thermo, ondes.' },
  si:         { label: 'SI / Info',  icon: 'chip', color: '#B5703B', desc: 'Sciences ingé / info.' },
  langues:    { label: 'Anglais',    icon: 'globe', color: '#E3B089', desc: 'Anglais.' },
  lettres:    { label: 'Lettres',    icon: 'pen', color: '#c8975a', desc: 'Français, philo.' },
  discipline: { label: 'Discipline', icon: 'lotus', color: '#9C6335', desc: 'Régularité, focus.' }
};

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
    const oldL = deriveSkillLevel(profile.skills[skill].xp).level;
    profile.skills[skill].xp += gain;
    const newL = deriveSkillLevel(profile.skills[skill].xp).level;
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
    profile.skills[skill].level = deriveSkillLevel(profile.skills[skill].xp).level;
  }
  profile.level = deriveLevel(profile.totalXp).level;
  await dbPut('profile', profile);
}
