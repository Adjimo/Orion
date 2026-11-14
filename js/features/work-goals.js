// Objectifs de travail dérivés du temps libre de l'emploi du temps (planning) :
//   journée  = temps libre du jour    × % de travail
//   semaine  = temps libre de la semaine × % de travail, réparti entre matières (poids des matières, cf. caracs.js)
// Chaque jour / semaine a son propre objectif, indépendant des autres. Avant `dynamicFrom` : anciens objectifs fixes
// (schedule.workHours par jour, hoursGoal par semaine) pour ne pas modifier l'historique ni l'XP déjà calculés.
import { mondayOf, parseKey } from '../core/calendar.js';
import { dbAll } from '../core/db.js';
import { weekDateKeys } from '../core/dates.js';
import { dayGoalMinutes, getCaracSettings, weekGoals } from './caracs.js';
import { buildWeek, loadOverrides } from './planning.js';

const DAY_IDS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const QUEST_GOAL_KEY = { 'wq-work': 'total', 'wq-langues': 'langues', 'wq-lettres': 'francais', 'wq-si': 'si' };

// Contexte réutilisable dans une boucle (évite de relire réglages, modifications de planning et semaines).
export async function makeGoalCtx() {
  return { cfg: await getCaracSettings(), ovs: await loadOverrides(), sched: await dbAll('schedule'), weeks: new Map() };
}
async function weekOf(ctx, monday) {
  if (!ctx.weeks.has(monday)) ctx.weeks.set(monday, await buildWeek(monday, ctx.ovs));
  return ctx.weeks.get(monday);
}

// Objectif de travail d'un jour (heures).
export async function dailyGoalHours(dateKey, ctx = null) {
  ctx = ctx || await makeGoalCtx();
  if (dateKey < ctx.cfg.dynamicFrom) return ctx.sched.find(x => x.id === DAY_IDS[parseKey(dateKey).getDay()])?.workHours || 0;
  const day = (await weekOf(ctx, mondayOf(dateKey))).days.find(d => d.date === dateKey);
  return day ? dayGoalMinutes(ctx.cfg, day.freeMinutes) / 60 : 0;
}

// Objectifs d'une semaine (minutes) : { math, phys, si, verb, langues, francais, total, dynamic, freeMinutes }.
export async function weekGoalsFor(monday, ctx = null) {
  ctx = ctx || await makeGoalCtx();
  const free = monday >= ctx.cfg.dynamicFrom ? (await weekOf(ctx, monday)).freeMinutes : null;
  return { ...weekGoals(ctx.cfg, monday, free), freeMinutes: free };
}

// Objectif (heures) d'une quête hebdo pour la semaine `wk` (format YYYY-Www) ; les quêtes non liées au travail gardent le leur.
export async function questGoalHours(quest, wk, ctx = null) {
  const key = QUEST_GOAL_KEY[quest.id];
  if (!key || quest.type !== 'weekly-hours') return quest.goalHours;
  return (await weekGoalsFor(weekDateKeys(wk)[0], ctx))[key] / 60;
}
