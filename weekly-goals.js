// Objectifs de sorties et compteur de sommeil
import { startOfWeek, todayKey, weekKey } from '../core/dates.js';
import { GHOST_BEFORE, dbAll, dbGet, dbPut } from '../core/db.js';
import { withWeekRecalc } from './penalties.js';
import { getCurrentCompletion } from './quests.js';

// ── Sommeil : une case par soir (« couché avant 23h30 ») ─────────────────────
// meta `sleepLog` : { 'YYYY-MM-DD': true } — le soir du jour indiqué.
// ── Objectif « Sorties course » choisi chaque semaine ───────────────────────
// meta `runsGoal` : { 'YYYY-Www': n } ; sans choix, l'objectif par défaut de la quête (3) s'applique.
export const RUNS_GOAL_MAX = 7;

export async function getRunsGoals() { return (await dbGet('meta', 'runsGoal'))?.value || {}; }

export async function runsGoalFor(wk, quest) {
  const g = (await getRunsGoals())[wk];
  return g >= 1 ? g : (quest?.goalCount || 3);
}

export async function setRunsGoal(wk, n) {
  const goal = Math.max(1, Math.min(RUNS_GOAL_MAX, Math.round(n) || 1));
  await withWeekRecalc(wk, async () => {
    const all = await getRunsGoals();
    all[wk] = goal;
    await dbPut('meta', { key: 'runsGoal', value: all });
  });
}

export async function getSleepLog() { return (await dbGet('meta', 'sleepLog'))?.value || {}; }

export async function saveSleepLog(m) { await dbPut('meta', { key: 'sleepLog', value: m }); }

export async function toggleSleepNight(dateKey) {
  if (dateKey > todayKey() || dateKey < GHOST_BEFORE) return;
  const wk = weekKey(new Date(dateKey + 'T12:00:00'));
  await withWeekRecalc(wk, async () => {
    const log = await getSleepLog();
    if (log[dateKey]) delete log[dateKey]; else log[dateKey] = true;
    await saveSleepLog(log);
  });
}

// Import unique : l'ancien compteur de la semaine en cours devient des soirs cochés
// (les premiers soirs de la semaine), pour ne rien perdre au passage aux cases.
export async function migrateSleepCounter() {
  if ((await dbGet('meta', 'sleepLogImported'))?.value) return;
  const q = (await dbAll('quests')).find(x => x.id === 'wq-sleep');
  const c = q ? await getCurrentCompletion(q) : null;
  const n = Math.min(7, Math.round(c?.actualValue || 0));
  if (n > 0) {
    const log = await getSleepLog();
    const ws = startOfWeek();
    for (let i = 0; i < n; i++) {
      const d = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + i);
      const k = todayKey(d);
      if (k <= todayKey() && k >= GHOST_BEFORE) log[k] = true;
    }
    await saveSleepLog(log);
  }
  await dbPut('meta', { key: 'sleepLogImported', value: true });
}
