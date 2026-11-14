// Quêtes hebdomadaires
import { startOfWeek, todayKey, weekKey, weekStartDate } from '../core/dates.js';
import { questGoalHours } from './work-goals.js';
import { GHOST_BEFORE, dbAll, dbAllLive, dbPut } from '../core/db.js';
import { awardXp, removeXp } from '../core/xp.js';
import { getSleepLog, runsGoalFor } from './weekly-goals.js';
import { computeWorkXp } from './work.js';
import { COLORS } from '../ui/icons.js';

export const SEED_WEEKLY_QUESTS = [
  // Principales — donnent des malus si pas faites (à partir du 2026-09-07)
  { id: 'wq-runs',    title: 'Sorties course', type: 'weekly-count', goalCount: 3, unit: 'sorties', skill: 'endurance',  icon: 'run', color: COLORS.run, autoFromActivities: true, category: 'main' },
  { id: 'wq-work',    title: 'Heures de travail', type: 'weekly-hours', goalHours: 35, skill: 'discipline', icon: 'stopwatch', color: COLORS.stopwatch, autoFromWorkLog: true, category: 'main' },
  { id: 'wq-sleep',   title: 'Couché à l’heure', type: 'weekly-count', goalCount: 7, unit: 'soirs', skill: 'discipline', icon: 'moon', color: COLORS.moon, autoFromSleep: true, category: 'main' },
  // Secondaires — donnent des bonus si dépassées (à partir du 2026-09-07)
  { id: 'wq-langues', title: 'Anglais', type: 'weekly-hours', goalHours: 2, skill: 'langues', icon: 'globe', color: COLORS.globe, autoFromLangues: true, category: 'secondary' },
  { id: 'wq-lettres', title: 'Lettres', type: 'weekly-hours', goalHours: 2, skill: 'lettres', icon: 'pen', color: COLORS.pen, autoFromLettres: true, category: 'secondary' },
  { id: 'wq-si',      title: 'SI / Info', type: 'weekly-hours', goalHours: 1.5, skill: 'si', icon: 'chip', color: COLORS.chip, autoFromSi: true, category: 'secondary' }
];

// XP de compétences d'une quête. Les quêtes « discipline » (heures de travail,
// sommeil) ne donnent que 20 % de leur XP en Discipline (avant : 70 %), sinon
// cette compétence dépassait largement les matières. Les autres : 70 % sur la
// compétence de la quête + 3 % de nudge Discipline.
export function questSkillXp(quest, xp) {
  const out = {};
  if (quest.skill === 'discipline') {
    out.discipline = Math.round(xp * 0.2);
    return out;
  }
  if (quest.skill) out[quest.skill] = Math.round(xp * 0.7);
  out.discipline = Math.round(xp * 0.03);
  return out;
}

export function computeCountXp(actualCount, goalCount) {
  if (!goalCount) return { xp: 0, ratio: 0 };
  const base = 60 + goalCount * 36;
  const ratio = actualCount / goalCount;
  let xp;
  if (ratio <= 1) xp = Math.round(ratio * base);
  else xp = Math.round(base + Math.log(1 + (ratio - 1)) * base * 0.4);
  return { xp, ratio };
}

export function computeHoursXp(actualMinutes, goalHours) {
  return computeWorkXp(actualMinutes, goalHours);
}

export async function getCurrentCompletion(quest, wk = weekKey()) {
  const all = await dbAll('completions');
  return all.find(c => c.questId === quest.id && c.weekKey === wk);
}

export async function setQuestValue(quest, newValue, wk = weekKey()) {
  const existing = await getCurrentCompletion(quest, wk);
  const lastXp = existing?.lastXp || 0;
  const lastSkillsXp = existing?.lastSkillsXp || {};

  let newXp, ratio;
  if (quest.type === 'weekly-hours') {
    const r = computeHoursXp(newValue, await questGoalHours(quest, wk));   // objectif de CETTE semaine
    newXp = r.xp; ratio = r.ratio;
  } else {
    const goalCount = quest.id === 'wq-runs' ? await runsGoalFor(wk, quest) : quest.goalCount;
    const r = computeCountXp(newValue, goalCount);
    newXp = r.xp; ratio = r.ratio;
  }

  const newSkillsXp = questSkillXp(quest, newXp);

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
    date: existing?.date || (wk === weekKey() ? todayKey() : todayKey(new Date(weekStartDate(wk).getTime() + 6 * 86400000))),
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

export async function recomputeAutoQuests(wk = weekKey()) {
  const isCurrent = wk === weekKey();
  const ws = isCurrent ? startOfWeek() : weekStartDate(wk);
  const we = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + 7);
  const weekEnd = todayKey(we);
  // todayKey() respecte la timezone locale, contrairement à toISOString().
  // Sans ça, lun 00:30 local renvoie un timestamp dimanche en UTC et la
  // quête de la nouvelle semaine pioche les workLogs de la semaine d'avant.
  const weekStart = todayKey(ws);
  const acts = await dbAllLive('activities');
  const logs = await dbAllLive('workLog');
  const quests = await dbAll('quests');

  const sortiesQ = quests.find(q => q.id === 'wq-runs');
  if (sortiesQ) {
    const weekActs = acts.filter(a => new Date(a.date) >= ws && new Date(a.date) < we);
    // On compte les sorties de course (ni renforcement ni randonnée).
    const courseCount = weekActs.filter(a =>
      ['footing', 'fractionne', 'sortie-longue', 'trail', 'course'].includes(a.type)
    ).length;
    await setQuestValue(sortiesQ, courseCount, wk);
  }
  const workQ = quests.find(q => q.id === 'wq-work');
  if (workQ) {
    const weekLogs = logs.filter(l => l.date >= weekStart && l.date < weekEnd);
    const totalMin = weekLogs.reduce((s, l) => s + (l.totalMinutes || 0), 0);
    await setQuestValue(workQ, totalMin, wk);
  }
  const langQ = quests.find(q => q.id === 'wq-langues');
  if (langQ) {
    const weekLogs = logs.filter(l => l.date >= weekStart && l.date < weekEnd);
    let langMin = 0;
    for (const l of weekLogs) {
      const bs = l.bySubject || {};
      langMin += (bs.langues || 0);
    }
    await setQuestValue(langQ, langMin, wk);
  }
  const lettresQ = quests.find(q => q.id === 'wq-lettres');
  if (lettresQ) {
    const weekLogs = logs.filter(l => l.date >= weekStart && l.date < weekEnd);
    let lettresMin = 0;
    for (const l of weekLogs) {
      const bs = l.bySubject || {};
      lettresMin += (bs.francais || 0);
    }
    await setQuestValue(lettresQ, lettresMin, wk);
  }
  const sleepQ = quests.find(q => q.id === 'wq-sleep');
  if (sleepQ) {
    const sleepLog = await getSleepLog();
    const nights = Object.keys(sleepLog).filter(d => sleepLog[d] && d >= weekStart && d < weekEnd && d >= GHOST_BEFORE).length;
    await setQuestValue(sleepQ, nights, wk);
  }
  const siQ = quests.find(q => q.id === 'wq-si');
  if (siQ) {
    const weekLogs = logs.filter(l => l.date >= weekStart && l.date < weekEnd);
    let siMin = 0;
    for (const l of weekLogs) {
      const bs = l.bySubject || {};
      siMin += (bs.si || 0);
    }
    await setQuestValue(siQ, siMin, wk);
  }
}
