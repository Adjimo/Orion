// Saisie du temps de travail
import { dbGet, dbPut, isGhostDate } from '../core/db.js';
import { awardXp, removeXp } from '../core/xp.js';

// Multiplicateurs calibrés pour que chaque skill progresse à un rythme proche
// du niveau global, étant donné une répartition réaliste du temps de travail
// (maths ~55%, physique ~40%, anglais ~5%, français ~5%, SI ~5%).
// Une matière qui prend une grande part du temps a un mult faible (déjà bcp d'XP),
// une matière minoritaire a un mult fort pour compenser.
export const SUBJECTS = {
  maths:    { label: 'Maths',     icon: 'sigma', skill: 'maths',      skillMult: 1.10 },
  physique: { label: 'Physique',  icon: 'atom', skill: 'physique',   skillMult: 1.30 },
  si:       { label: 'SI / Info', icon: 'chip', skill: 'si',         skillMult: 4.00 },
  langues:  { label: 'Anglais',   icon: 'globe', skill: 'langues',    skillMult: 4.00 },
  francais: { label: 'Français',  icon: 'pen', skill: 'lettres',    skillMult: 4.00 },
  autre:    { label: 'Autre',     icon: 'book', skill: 'discipline', skillMult: 0.20 }
};

export function baseXpForGoal(goalHours) {
  // Calibré pour atteindre L100 aux concours avec ~30h travail/semaine + sport.
  return Math.round(80 + goalHours * 60);
}

export function computeWorkXp(actualMinutes, goalHours) {
  if (!goalHours || goalHours <= 0) return { xp: 0, ratio: 0, base: 0 };
  const goalMinutes = goalHours * 60;
  const base = baseXpForGoal(goalHours);
  const ratio = actualMinutes / goalMinutes;
  let xp;
  if (ratio <= 1) xp = Math.round(ratio * base);
  else xp = Math.round(base + Math.log(1 + (ratio - 1)) * base * 0.5);
  return { xp, ratio, base };
}

export function formatMinutes(minutes) {
  if (!minutes) return '0';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, '0')}`;
}

export function parseTimeInput(input) {
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

export async function setSubjectMinutes(dateKey, subjectKey, newMinutes, goalHours) {
  const existing = await dbGet('workLog', dateKey);
  const bySubject = existing?.bySubject || {};
  bySubject[subjectKey] = Math.max(0, newMinutes || 0);
  if (bySubject[subjectKey] === 0) delete bySubject[subjectKey];
  return commitWorkLog(dateKey, bySubject, goalHours);
}

export async function commitWorkLog(dateKey, bySubject, goalHours) {
  // Jour fantôme (avant le 15 août) : on stocke sans aucune XP.
  if (isGhostDate(dateKey)) {
    const totalMinutes = Object.values(bySubject).reduce((s, m) => s + m, 0);
    await dbPut('workLog', {
      date: dateKey, totalMinutes, bySubject, goalHours,
      lastXpAwarded: 0, lastSkillsAwarded: {}, ratio: 0,
      timestamp: new Date().toISOString()
    });
    return { totalMinutes, xp: 0, xpDelta: 0, ratio: 0 };
  }
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
