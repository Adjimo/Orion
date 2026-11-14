// Malus, bonus, justifications et recalculs de semaine
import { sportOn } from './prefs.js';
import { nextWeekKey, prevWeekKey, todayKey, weekDateKeys, weekKey, weekStartDate } from '../core/dates.js';
import { dailyGoalHours, makeGoalCtx, questGoalHours } from './work-goals.js';
import { dbAll, dbAllLive, dbGet, dbPut } from '../core/db.js';
import { awardXp, removeXp } from '../core/xp.js';
import { computeCountXp, computeHoursXp, questSkillXp, recomputeAutoQuests } from './quests.js';
import { setSubjectMinutes } from './work.js';

// 8.b BONUS / MALUS (à partir de la rentrée 2026-09-07)

// Date à partir de laquelle bonus et malus s'activent.
// Premier lundi de septembre 2026.
export const PENALTIES_START = '2026-09-07';

export function arePenaltiesActive(refDate = new Date()) {
  const start = new Date(PENALTIES_START + 'T00:00:00');
  return refDate >= start;
}

// Paliers de malus appliqués sur le XP qu'aurait rapporté la quête à 100%.
// Plus tu es loin de l'objectif, plus tu perds.
export function malusFactorFromRatio(ratio) {
  if (ratio >= 1)    return 0;
  if (ratio >= 0.8)  return 0.10;
  if (ratio >= 0.5)  return 0.20;
  if (ratio >= 0.25) return 0.40;
  if (ratio > 0)     return 0.60;
  return 0.80;
}

// Bonus pour les quêtes secondaires : récompense le dépassement,
// proportionnel à (ratio - 1) × XP plafond × 0.5, capé à +50%.
export function bonusFactorFromRatio(ratio) {
  if (ratio <= 1) return 0;
  return Math.min(0.5, (ratio - 1) * 0.5);
}

// Calcule le XP de référence (ce qu'une quête rapporterait à 100%).
export function questFullXp(quest, goalHours = quest.goalHours) {
  if (quest.type === 'weekly-hours') return computeHoursXp(goalHours * 60, goalHours).xp;
  return computeCountXp(quest.goalCount, quest.goalCount).xp;
}

// XP gagné dans une semaine ISO donnée : workLogs + completions hebdo + activités.
export async function xpEarnedInWeek(wk) {
  const logs = await dbAllLive('workLog');
  const completions = await dbAllLive('completions');
  const acts = await dbAllLive('activities');
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

// Exécute `fn` (qui modifie des données d'une semaine) puis recalcule les quêtes
// de cette semaine et ajuste malus / rigueur / bonus si elle était déjà évaluée.
export async function withWeekRecalc(wk, fn) {
  const startWk = weekKey(new Date(PENALTIES_START + 'T00:00:00'));
  const lastWeekly = (await dbGet('meta', 'lastWeeklyPenalty'))?.value || '';
  const weekFinal = arePenaltiesActive() && wk >= startWk && lastWeekly >= wk;
  const before = weekFinal ? await computeWeekPenalties(wk) : null;
  await fn();
  await recomputeAutoQuests(wk);
  if (!weekFinal) return;
  const after = await computeWeekPenalties(wk);
  const penDelta = (after.malusXp + after.selfXp) - (before.malusXp + before.selfXp);
  if (penDelta > 0) await removeXp(penDelta, { discipline: Math.round(penDelta * 0.08) });
  else if (penDelta < 0) await awardXp(-penDelta, { discipline: Math.round(-penDelta * 0.08) });
  const sumB = (p) => p.bonuses.reduce((a, b) => a + b.xp, 0);
  const skillsB = (p) => { const o = {}; for (const b of p.bonuses) for (const [k, v] of Object.entries(b.skills)) o[k] = (o[k] || 0) + v; return o; };
  const sa = skillsB(after), sb = skillsB(before), sd = {};
  for (const k of new Set([...Object.keys(sa), ...Object.keys(sb)])) sd[k] = (sa[k] || 0) - (sb[k] || 0);
  await applyXpDelta(sumB(after) - sumB(before), sd);
  await saveMalusLogEntry(wk, after);
}

// Calcule (sans rien modifier) les malus / bonus d'une semaine à partir de l'état
// courant de la base : malus principaux, rigueur (écarts) et bonus secondaires.
// À partir de cette semaine : les quêtes secondaires (Anglais, Lettres, SI) donnent aussi un malus si
// l'objectif n'est pas atteint, et le total des malus (quotidien + quêtes + rigueur) est plafonné à 100 %
// de l'XP de la semaine. Les semaines antérieures gardent les anciennes règles (pas de rétroactivité).
export const SECONDARY_MALUS_START = '2026-11-09';

export function usesFullMalusRules(wk) { return todayKey(weekStartDate(wk)) >= SECONDARY_MALUS_START; }

// Somme des malus quotidiens du travail déjà appliqués sur une semaine (jours évalués).
export async function weekDailyMalusXp(wk) {
  const gctx = await makeGoalCtx();
  const today = todayKey();
  let sum = 0;
  for (const dk of weekDateKeys(wk)) {
    if (dk >= today || dk <= PENALTIES_START) continue;
    sum += dailyWorkMalusXp(await dbGet('workLog', dk), await dailyGoalHours(dk, gctx));
  }
  return sum;
}

export async function computeWeekPenalties(wk) {
  const completions = await dbAll('completions');
  const quests = await dbAll('quests');
  const weekXp = await xpEarnedInWeek(wk);
  const extra = await computeSelfWeekPenalty(wk);
  const selfXp = (extra.total > 0 && weekXp > 0) ? Math.round(weekXp * extra.total) : 0;

  // Quêtes non atteintes (principales ; + secondaires dès SECONDARY_MALUS_START). Une quête justifiée est ignorée.
  const fullRules = usesFullMalusRules(wk);
  const excuses = await getMalusExcuses();
  const excusedKeys = [];
  let malusFactor = 0;
  const malusDetails = [];
  for (const q of quests.filter(x => (x.category === 'main' || (fullRules && x.category === 'secondary')) && (sportOn() || x.id !== 'wq-runs'))) {
    const c = completions.find(x => x.questId === q.id && x.weekKey === wk);
    const ratio = c?.ratio || 0;
    const exKey = `${wk}|${q.id}`;
    if (excuses[exKey]) { excusedKeys.push(exKey); continue; }
    const f = malusFactorFromRatio(ratio);
    if (f > 0) { malusFactor += f; malusDetails.push({ questId: q.id, factor: f, ratio }); }
  }
  malusFactor = Math.min(fullRules ? 1 : 0.8, malusFactor);
  let malusXp = (malusFactor > 0 && weekXp > 0) ? Math.round(weekXp * malusFactor) : 0;
  let selfXpFinal = selfXp;
  let dailyMalus = 0;
  if (fullRules) {
    // Plafond global : quotidien + quêtes + rigueur ≤ 100 % de l'XP de la semaine.
    dailyMalus = await weekDailyMalusXp(wk);
    const budget = Math.max(0, weekXp - dailyMalus);
    malusXp = Math.min(malusXp, budget);
    selfXpFinal = Math.min(selfXp, budget - malusXp);
  }

  // Bonus des secondaires : un par quête, sur l'XP de référence de la quête.
  const bonuses = [];
  const gctx2 = await makeGoalCtx();
  for (const q of quests.filter(x => x.category === 'secondary')) {
    const c = completions.find(x => x.questId === q.id && x.weekKey === wk);
    const ratio = c?.ratio || 0;
    const f = bonusFactorFromRatio(ratio);
    if (f > 0) {
      const bonusXp = Math.round(questFullXp(q, await questGoalHours(q, wk, gctx2)) * f);
      bonuses.push({ questId: q.id, xp: bonusXp, skills: questSkillXp(q, bonusXp), percent: f, ratio });
    }
  }
  return {
    weekXp, selfXp: selfXpFinal, selfPercent: extra.total, selfDetails: extra,
    malusXp, malusFactor, malusDetails, excusedKeys, bonuses, dailyMalus
  };
}

// Journal des malus (sert aux justifications et aux recalculs).
export async function saveMalusLogEntry(wk, pen) {
  const log = (await dbGet('meta', 'malusLog'))?.value || {};
  if (pen.malusXp > 0) {
    log[wk] = { xp: pen.malusXp, weekXp: pen.weekXp, factors: Object.fromEntries(pen.malusDetails.map(d => [d.questId, d.factor])) };
  } else {
    delete log[wk];
  }
  await dbPut('meta', { key: 'malusLog', value: log });
}

// Applique une variation d'XP (positive ou négative) avec ses compétences.
export async function applyXpDelta(xpDelta, skillsDelta) {
  const pos = Object.fromEntries(Object.entries(skillsDelta).filter(([_, v]) => v > 0));
  const neg = Object.fromEntries(Object.entries(skillsDelta).filter(([_, v]) => v < 0).map(([k, v]) => [k, -v]));
  if (xpDelta > 0) { await awardXp(xpDelta, pos); if (Object.keys(neg).length) await removeXp(0, neg); }
  else if (xpDelta < 0) { await removeXp(-xpDelta, neg); if (Object.keys(pos).length) await awardXp(0, pos); }
  else {
    if (Object.keys(pos).length) await awardXp(0, pos);
    if (Object.keys(neg).length) await removeXp(0, neg);
  }
}

// Malus quotidien d'un jour de travail, d'après son journal.
export function dailyWorkMalusXp(log, goalHours) {
  if (!goalHours || goalHours <= 0) return 0;
  const f = malusFactorFromRatio((log?.totalMinutes || 0) / (goalHours * 60));
  return f > 0 ? Math.round((log?.lastXpAwarded || 0) * f) : 0;
}

// Modifie le temps d'une matière sur un jour quelconque et met tout à jour :
// XP du jour, quêtes de la semaine concernée et malus / bonus déjà appliqués.
export async function setSubjectMinutesSmart(dateKey, subjectKey, newMinutes, goalHours) {
  const wk = weekKey(new Date(dateKey + 'T12:00:00'));
  const isPast = wk !== weekKey();
  const startWk = weekKey(new Date(PENALTIES_START + 'T00:00:00'));
  const lastWeekly = (await dbGet('meta', 'lastWeeklyPenalty'))?.value || '';
  const lastDaily = (await dbGet('meta', 'lastDailyPenalty'))?.value || '';
  const weekFinal = arePenaltiesActive() && wk >= startWk && lastWeekly >= wk;
  const dayFinal = arePenaltiesActive() && dateKey >= PENALTIES_START && lastDaily >= dateKey;

  const before = weekFinal ? await computeWeekPenalties(wk) : null;
  const oldLog = await dbGet('workLog', dateKey);

  const res = await setSubjectMinutes(dateKey, subjectKey, newMinutes, goalHours);
  await recomputeAutoQuests(wk);

  // Jour déjà évalué : on ajuste son malus quotidien.
  if (dayFinal) {
    const newLog = await dbGet('workLog', dateKey);
    const delta = dailyWorkMalusXp(newLog, goalHours) - dailyWorkMalusXp(oldLog, goalHours);
    if (delta > 0) await removeXp(delta, { discipline: Math.round(delta * 0.08) });
    else if (delta < 0) await awardXp(-delta, { discipline: Math.round(-delta * 0.08) });
  }

  // Semaine déjà évaluée : on ajuste malus, rigueur et bonus.
  if (weekFinal) {
    const after = await computeWeekPenalties(wk);
    const penDelta = (after.malusXp + after.selfXp) - (before.malusXp + before.selfXp);
    if (penDelta > 0) await removeXp(penDelta, { discipline: Math.round(penDelta * 0.08) });
    else if (penDelta < 0) await awardXp(-penDelta, { discipline: Math.round(-penDelta * 0.08) });

    const sumB = (p) => p.bonuses.reduce((a, b) => a + b.xp, 0);
    const skillsB = (p) => { const o = {}; for (const b of p.bonuses) for (const [k, v] of Object.entries(b.skills)) o[k] = (o[k] || 0) + v; return o; };
    const sa = skillsB(after), sb = skillsB(before);
    const sd = {};
    for (const k of new Set([...Object.keys(sa), ...Object.keys(sb)])) sd[k] = (sa[k] || 0) - (sb[k] || 0);
    await applyXpDelta(sumB(after) - sumB(before), sd);
    await saveMalusLogEntry(wk, after);
  }
  return { ...res, recalculatedPastWeek: isPast && weekFinal };
}

// Tick : à chaque chargement de l'app, on regarde si on a passé une frontière
// jour/semaine et on applique malus + bonus pour les périodes terminées.
// Les ID de période traités sont stockés dans `meta` pour idempotence.
// Le malus principal est en POURCENTAGE du XP gagné dans la période — pas un
// montant fixe : c'est plus lisible et plus juste (semaine peu productive →
// malus petit en absolu, semaine intense → malus proportionnel).
// Note : éditer le workLog d'un jour déjà finalisé NE re-déclenche PAS le malus —
// l'évaluation est définitive au passage de minuit.
export async function applyPendingPenalties() {
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
  const goalCtx = await makeGoalCtx();
  while (cursor < new Date(todayK + 'T00:00:00')) {
    const dk = todayKey(cursor);
    if (dk >= startK) {
      const goalHours = await dailyGoalHours(dk, goalCtx);   // objectif du jour = % du temps libre du jour (cf. work-goals.js)
      if (goalHours > 0) {
        const log = await dbGet('workLog', dk);
        const actualMin = log?.totalMinutes || 0;
        const ratio = actualMin / (goalHours * 60);
        const factor = malusFactorFromRatio(ratio);
        if (factor > 0) {
          const dayXp = log?.lastXpAwarded || 0;
          const malusXp = Math.round(dayXp * factor);
          if (malusXp > 0) {
            await removeXp(malusXp, { discipline: Math.round(malusXp * 0.08) });
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
      const pen = await computeWeekPenalties(wk);

      // Les quêtes justifiées n'ont plus rien à rembourser : on remet le compteur à zéro.
      if (pen.excusedKeys.length) {
        const excuses = await getMalusExcuses();
        let dirty = false;
        for (const k of pen.excusedKeys) if (excuses[k]?.refundedXp) { excuses[k].refundedXp = 0; dirty = true; }
        if (dirty) await saveMalusExcuses(excuses);
      }

      // Rigueur : auto-sanctions (% de l'XP de la semaine).
      if (pen.selfXp > 0) {
        await removeXp(pen.selfXp, { discipline: Math.round(pen.selfXp * 0.08) });
        applied.push({ kind: 'weekly-self', week: wk, xp: pen.selfXp, percent: pen.selfPercent, weekXp: pen.weekXp, details: pen.selfDetails });
      }

      // Malus des quêtes principales ratées.
      if (pen.malusXp > 0) {
        await removeXp(pen.malusXp, { discipline: Math.round(pen.malusXp * 0.08) });
        applied.push({ kind: 'weekly-malus', week: wk, xp: pen.malusXp, percent: pen.malusFactor, weekXp: pen.weekXp, details: pen.malusDetails });
      }
      await saveMalusLogEntry(wk, pen);

      // Bonus des quêtes secondaires dépassées.
      for (const bn of pen.bonuses) {
        await awardXp(bn.xp, bn.skills);
        applied.push({ kind: 'weekly-bonus', questId: bn.questId, week: wk, xp: bn.xp, percent: bn.percent, ratio: bn.ratio });
      }
    }
    await dbPut('meta', { key: 'lastWeeklyPenalty', value: wk });
    wk = nextWeekKey(wk);
  }

  return { applied };
}

// ── Rigueur : auto-sanctions (appliquées en fin de semaine) ──
// meta `selfMalus`  : { 'YYYY-Www': [ { id, percent, reason, createdAt } ] }
// Les deux retirent un % de l'XP gagnée dans la semaine, au passage de la semaine.
export const SELF_PCT_CAP = 60;         // plafond cumulé des auto-sanctions

export async function getSelfMalus() { return (await dbGet('meta', 'selfMalus'))?.value || {}; }

// Pourcentage total (0-1) retiré à la fin de la semaine `wk`.
export async function computeSelfWeekPenalty(wk) {
  const entries = (await getSelfMalus())[wk] || [];
  const selfPct = Math.min(SELF_PCT_CAP, entries.reduce((a, e) => a + (e.percent || 0), 0));
  return { selfPct, screenPct: 0, total: selfPct / 100 };
}

// ── Justification des malus hebdo (ex : sorties manquées car malade) ─────────
// Stockage : meta `malusExcuses` { 'YYYY-Www|questId': { reason, note, factor, refundedXp } }
// et meta `malusLog` { 'YYYY-Www': { xp, weekXp, factors } } alimenté à chaque malus.
export async function getMalusExcuses() {
  return (await dbGet('meta', 'malusExcuses'))?.value || {};
}

export async function saveMalusExcuses(map) {
  await dbPut('meta', { key: 'malusExcuses', value: map });
}

// Justifie une quête principale pour une semaine : son malus est supprimé.
// Si le malus de la semaine a déjà été appliqué, l'XP correspondante est rendue.
export async function excuseQuestWeek(questId, wk, reason, note) {
  const excuses = await getMalusExcuses();
  const key = `${wk}|${questId}`;
  if (excuses[key]) return { refund: 0 };
  let refund = 0, factor = 0;
  const logs = (await dbGet('meta', 'malusLog'))?.value || {};
  const entry = logs[wk];
  if (entry?.factors && entry.factors[questId] != null) {
    factor = entry.factors[questId];
    const rest = { ...entry.factors };
    delete rest[questId];
    const newTotal = Math.min(0.8, Object.values(rest).reduce((a, v) => a + v, 0));
    const newMalus = Math.round(entry.weekXp * newTotal);
    refund = Math.max(0, entry.xp - newMalus);
    if (refund > 0) await awardXp(refund, { discipline: Math.round(refund * 0.08) });
    logs[wk] = { ...entry, xp: newMalus, factors: rest };
    await dbPut('meta', { key: 'malusLog', value: logs });
  }
  excuses[key] = { reason, note: note || '', factor, refundedXp: refund, createdAt: new Date().toISOString() };
  await saveMalusExcuses(excuses);
  return { refund };
}

// Annule une justification : le malus est ré-appliqué s'il avait été remboursé.
export async function cancelExcuse(questId, wk) {
  const excuses = await getMalusExcuses();
  const key = `${wk}|${questId}`;
  const ex = excuses[key];
  if (!ex) return;
  if (ex.refundedXp > 0) {
    await removeXp(ex.refundedXp, { discipline: Math.round(ex.refundedXp * 0.08) });
    const logs = (await dbGet('meta', 'malusLog'))?.value || {};
    if (logs[wk]) {
      logs[wk] = { ...logs[wk], xp: logs[wk].xp + ex.refundedXp, factors: { ...logs[wk].factors, [questId]: ex.factor } };
      await dbPut('meta', { key: 'malusLog', value: logs });
    }
  }
  delete excuses[key];
  await saveMalusExcuses(excuses);
}
