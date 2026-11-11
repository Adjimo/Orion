// Caractéristiques « façon D&D » : 6 valeurs recalculées UNE FOIS PAR SEMAINE CLOSE.
// Indépendant de l'XP, des malus et des niveaux : on part des données brutes
// (activités, temps de travail, quêtes, sommeil, to-do, écarts perso).
//
// Règles :
//  - semaine = lundi → dimanche ; une semaine n'est calculée qu'une fois close
//    (lundi suivant). Aucune valeur provisoire pendant la semaine.
//  - valeur(n) = α × valeur(n-1) + (1-α) × S(n), α réglable (0,75 par défaut) ;
//    toute modification de α recalcule tout l'historique depuis la date de départ.
//  - S ∈ [0 ; 24] ; atteindre l'objectif = 14, ≈ 1,45 × l'objectif = 20.
//  - recalcul déterministe depuis `start` (1er septembre 2026) : même données → mêmes valeurs.
//  - sorties justifiées (wq-runs) : volume, régularité et allure ignorés en Dextérité ; si rien n'est mesurable, la valeur reste inchangée.
//  - sommeil : max(cases cochées, compteur de la quête wq-sleep) car l'historique des cases ne commence qu'en nov. 2026.
//  - quêtes justifiées (meta `malusExcuses`) : ignorées dans la Discipline (réglage `neutralizeExcused`).
//  - semaine partielle (jours < 7) : objectifs d'heures, de jours travaillés, de sorties et de nuits
//    proratisés par jours comptés / 7 (réglage `prorateFirstWeek`).
import { weekKey } from '../core/dates.js';
import { addDays, mondayOf, parseKey } from '../core/calendar.js';
import { dbAll, dbAllLive, dbDelete, dbGet, dbPut } from '../core/db.js';
import { getMalusExcuses, getSelfMalus } from './penalties.js';
import { activityVO2maxPoints } from './records.js';
import { isRunActivity } from './schedule.js';
import { hasTodo } from './todo.js';
import { TODO_CATALOG } from './todo-data.js';
import { getRunsGoals, getSleepLog } from './weekly-goals.js';

// ── Définition des 6 caractéristiques (icônes et couleurs du pack : chaud, sans bleu/violet/vert)
export const CARACS = [
  { id: 'dex',  label: 'Dextérité',  short: 'DEX', icon: 'run',    color: '#E0794A' },
  { id: 'math', label: 'Maths',      short: 'MAT', icon: 'sigma',  color: '#E39A3B' },
  { id: 'phys', label: 'Physique',   short: 'PHY', icon: 'atom',   color: '#D2694B' },
  { id: 'si',   label: 'SI / Info',  short: 'SI',  icon: 'chip',   color: '#D4735F' },
  { id: 'verb', label: 'Verbe',      short: 'VER', icon: 'pen',    color: '#D68F86' },
  { id: 'disc', label: 'Discipline', short: 'DIS', icon: 'lotus',  color: '#E8A13A' }
];

// ── Réglages (meta `caracSettings`), tous modifiables ; toute modification → recalcul complet.
export const DEFAULT_SETTINGS = {
  start: '2026-09-01',          // 1er septembre (la semaine du 31/08 ne compte que depuis le 01/09)
  initial: 10,                  // valeur de départ
  alpha: 0.75,                  // poids de la valeur précédente (le reste va au score de la semaine)
  hoursGoal: { math: 15, phys: 11, si: 1.5, verb: 4 },   // objectifs d'heures par semaine (à ajuster)
  workDaysGoal: 6,              // jours avec du travail saisi attendus
  neutralizeExcused: true,      // quêtes justifiées (maladie…) : ignorées dans la Discipline au lieu d'être comptées ratées
  prorateFirstWeek: true,       // semaine partielle (début le 01/09) : objectifs proratisés au nombre de jours comptés
  weights: {                    // pondérations internes de chaque score (en %, normalisées si une part manque)
    dex:  { volume: 50, allure: 30, regularite: 20 },
    math: { heures: 60, todo: 40 },
    phys: { heures: 60, todo: 40 },
    si:   { heures: 60, todo: 40 },
    verb: { heures: 60, todo: 40 },
    disc: { quetes: 35, sommeil: 25, jours: 20, todo: 20 }
  },
  allureSensibilite: 5,         // +1 % de VO2max vs référence ⇒ +5 % du score de base (14)
  allureRefWeeks: 6,            // référence = meilleur VO2max des N semaines précédentes
  regulariteWeeks: 4,           // fenêtre de la régularité (semaines avec objectif de sorties atteint)
  ecartPointsPerPct: 0.1        // points de Discipline retirés par % d'écart perso (60 % ⇒ −6)
};

export async function getCaracSettings() {
  const s = (await dbGet('meta', 'caracSettings'))?.value || {};
  return {
    ...DEFAULT_SETTINGS, ...s,
    hoursGoal: { ...DEFAULT_SETTINGS.hoursGoal, ...(s.hoursGoal || {}) },
    weights: Object.fromEntries(Object.entries(DEFAULT_SETTINGS.weights).map(([k, v]) => [k, { ...v, ...(s.weights?.[k] || {}) }]))
  };
}

// Modifie un ou plusieurs réglages puis recalcule tout l'historique.
export async function saveCaracSettings(patch) {
  const cur = await getCaracSettings();
  const next = { ...cur, ...patch };
  await dbPut('meta', { key: 'caracSettings', value: next });
  return recomputeCaracs();
}

// ── Outils de calcul ─────────────────────────────────────────────────────────
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// Score de base : objectif atteint = 14, 1,45 × objectif ≈ 20, plafonné à 24.
export const baseScore = (ratio) => clamp(14 * (ratio || 0), 0, 24);
export const modifier = (value) => Math.floor((Math.round(value) - 10) / 2);
export const fmtMod = (m) => (m >= 0 ? `+${m}` : `${m}`);

// Combine des parts { key, w, score|null } : une part absente (null) est ignorée et les poids sont renormalisés.
export function combine(parts) {
  const ok = parts.filter(p => p.score != null && p.w > 0);
  const tw = ok.reduce((s, p) => s + p.w, 0);
  const comps = parts.map(p => ({ key: p.key, w: p.w, score: p.score, contrib: (p.score != null && tw > 0 && p.w > 0) ? (p.w / tw) * p.score : 0, note: p.note || '' }));
  const S = clamp(comps.reduce((s, c) => s + c.contrib, 0), 0, 24);
  return { S, comps, empty: ok.length === 0 };   // empty : aucune part mesurable → la valeur n'est pas mise à jour
}

// ── Chargement des données brutes (une seule fois par recalcul) ───────────────
async function loadRaw() {
  const [acts, logs, comps, todo, quests, sleep, self, runsGoals, excuses] = await Promise.all([
    dbAllLive('activities'), dbAllLive('workLog'), dbAll('completions'), dbAll('planTodo'),
    dbAll('quests'), getSleepLog(), getSelfMalus(), getRunsGoals(), getMalusExcuses()
  ]);
  return { acts: acts.filter(isRunActivity), logs, comps, todo, quests, sleep, self, runsGoals, excuses };
}

const sumMinutes = (logs, days, subjects) => logs
  .filter(l => days.includes(l.date))
  .reduce((s, l) => s + subjects.reduce((t, k) => t + (l.bySubject?.[k] || 0), 0), 0);

// Ratio de chapitres faits (pondérés par leurs points) ; null s'il n'y a pas d'éléments cette semaine-là.
function todoRatio(items, subjects) {
  const its = items.filter(i => subjects.includes(i.subj));
  const wOf = (i) => TODO_CATALOG[i.subj]?.find(c => `${i.subj}:${c.name}` === i.key)?.w || 1;
  const tot = its.reduce((s, i) => s + wOf(i), 0);
  if (!tot) return null;
  return its.filter(i => i.done).reduce((s, i) => s + wOf(i), 0) / tot;
}

// ── Score S d'une semaine ─────────────────────────────────────────────────────
// ctx : { monday, days, raw, cfg, prevRunWeeks (bool[] des semaines précédentes avec objectif sorties atteint), refVo2 }
export function scoreWeek(ctx) {
  const { monday, days, raw, cfg } = ctx;
  const wk = weekKey(parseKey(monday));
  const todoOn = hasTodo(monday);
  const items = todoOn ? raw.todo.filter(i => i.weekKey === monday) : [];
  const W = cfg.weights;
  const out = {};
  const f = cfg.prorateFirstWeek ? days.length / 7 : 1;          // facteur de proratisation (1 = semaine complète)
  const hoursPart = (id, subjects) => {
    const goal = cfg.hoursGoal[id] * 60 * f;
    return goal > 0 ? baseScore(sumMinutes(raw.logs, days, subjects) / goal) : null;
  };
  const todoPart = (subjects) => { const r = todoRatio(items, subjects); return r == null ? null : baseScore(r); };

  // Dextérité : volume (sorties vs objectif), allure (progrès du VO2max/VDOT), régularité (semaines tenues)
  const runs = raw.acts.filter(a => days.includes(String(a.date).slice(0, 10)));
  const runsQuest = raw.quests.find(q => q.id === 'wq-runs');
  const runsGoalFull = (raw.runsGoals[wk] >= 1 ? raw.runsGoals[wk] : (runsQuest?.goalCount || 3));
  const runsGoal = f < 1 ? Math.max(1, Math.round(runsGoalFull * f)) : runsGoalFull;
  const runsExcused = !!cfg.neutralizeExcused && !!raw.excuses?.[`${wk}|wq-runs`];   // sorties justifiées (maladie…)
  const vo2s = activityVO2maxPoints(runs).map(p => p.vo2);
  const vo2Week = vo2s.length ? Math.max(...vo2s) : null;
  let allure = null, allureNote = '';
  if (runsExcused) allureNote = 'sorties justifiées';             // semaine justifiée : allure ignorée
  else if (vo2Week != null && ctx.refVo2 != null) allure = clamp(14 * (1 + cfg.allureSensibilite * (vo2Week / ctx.refVo2 - 1)), 0, 24);
  else if (vo2Week != null) allure = 14;                       // première mesure : neutre
  else allureNote = 'aucune sortie chronométrée';              // pas de mesure → part ignorée (pas pénalisée)
  const hit = runs.length >= runsGoal;
  const window = [...ctx.prevRunWeeks.slice(-(cfg.regulariteWeeks - 1)), hit];
  out.dex = combine([
    { key: 'volume', w: W.dex.volume, score: runsExcused ? null : baseScore(runs.length / runsGoal), note: runsExcused ? 'sorties justifiées' : '' },
    { key: 'allure', w: W.dex.allure, score: allure, note: allureNote },
    { key: 'regularite', w: W.dex.regularite, score: runsExcused ? null : baseScore(window.filter(Boolean).length / window.length), note: runsExcused ? 'sorties justifiées' : '' }
  ]);
  out.dex.meta = { runsHit: hit, runsExcused, vo2Week };

  // Matières : heures (objectif de la matière) + chapitres cochés (pondérés)
  const subj = { math: ['maths'], phys: ['physique'], si: ['si'], verb: ['langues', 'francais'] };
  const todoSubj = { math: ['maths'], phys: ['physique'], si: ['si'], verb: ['anglais', 'francais'] };
  for (const id of ['math', 'phys', 'si', 'verb']) {
    out[id] = combine([
      { key: 'heures', w: W[id].heures, score: hoursPart(id, subj[id]) },
      { key: 'todo', w: W[id].todo, score: todoPart(todoSubj[id]), note: todoOn ? '' : 'pas de to-do cette semaine' }
    ]);
  }

  // Discipline : quêtes réussies, nuits avant 23h30, jours de travail, to-do sans report, − écarts perso
  const isExcused = (q) => cfg.neutralizeExcused && !!raw.excuses?.[`${wk}|${q.id}`];
  const allQs = raw.quests.filter(q => q.category === 'main' || q.category === 'secondary');
  const qs = allQs.filter(q => !isExcused(q));                 // quêtes justifiées neutralisées (hors dénominateur)
  const nbExcused = allQs.length - qs.length;
  const done = qs.filter(q => {
    const c = raw.comps.find(x => x.questId === q.id && x.weekKey === wk);
    const goal = q.id === 'wq-runs' ? runsGoalFull : (q.type === 'weekly-hours' ? q.goalHours * 60 : q.goalCount);
    return c && goal > 0 && (c.actualValue || 0) >= goal;
  }).length;
  // Nuits : cases cochées (sleepLog, seulement depuis nov. 2026) ; avant, seul le compteur de la quête
  // sommeil de la semaine existe → on retient le plus grand des deux (jamais plus que les jours comptés).
  const sleepComp = raw.comps.find(x => x.questId === 'wq-sleep' && x.weekKey === wk);
  const nights = Math.min(days.length, Math.max(days.filter(d => raw.sleep[d]).length, Math.round(sleepComp?.actualValue || 0)));
  const workDays = raw.logs.filter(l => days.includes(l.date) && (l.totalMinutes || 0) > 0).length;
  const late = items.filter(i => i.carried || i.rolled || i.carriedTo).length;
  const disc = combine([
    { key: 'quetes', w: W.disc.quetes, score: qs.length ? baseScore(done / qs.length) : null, note: nbExcused ? `${nbExcused} quête(s) justifiée(s) ignorée(s)` : '' },
    { key: 'sommeil', w: W.disc.sommeil, score: baseScore(nights / days.length) },
    { key: 'jours', w: W.disc.jours, score: baseScore(workDays / Math.max(1, cfg.workDaysGoal * f)) },
    { key: 'todo', w: W.disc.todo, score: items.length ? baseScore(1 - late / items.length) : null, note: todoOn ? '' : 'pas de to-do cette semaine' }
  ]);
  const selfPct = Math.min(60, (raw.self[wk] || []).reduce((s, e) => s + (e.percent || 0), 0));
  const ecart = selfPct * cfg.ecartPointsPerPct;
  disc.comps.push({ key: 'ecarts', w: 0, score: null, contrib: -ecart, note: selfPct ? `${selfPct} % d'écarts` : '' });
  disc.S = clamp(disc.S - ecart, 0, 24);
  out.disc = disc;
  return out;
}

// ── Recalcul complet, déterministe, des semaines CLOSES uniquement ───────────
let lock = null;
export function recomputeCaracs(today = new Date()) {
  if (!lock) lock = run(today).finally(() => { lock = null; });
  return lock;
}

async function run(today) {
  const cfg = await getCaracSettings();
  const raw = await loadRaw();
  const todayKeyStr = (() => { const d = today; return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  const lastClosed = addDays(mondayOf(todayKeyStr), -7);          // dernier lundi dont la semaine est terminée
  let monday = mondayOf(cfg.start);
  const hist = [];
  const prevRunWeeks = [];
  const vo2History = [];                                          // meilleurs VO2max par semaine précédente
  let values = Object.fromEntries(CARACS.map(c => [c.id, cfg.initial]));
  while (monday <= lastClosed) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i)).filter(d => d >= cfg.start);
    const refVo2 = (() => { const r = vo2History.slice(-cfg.allureRefWeeks).filter(v => v != null); return r.length ? Math.max(...r) : null; })();
    const res = scoreWeek({ monday, days, raw, cfg, prevRunWeeks, refVo2 });
    const scores = {}, nextValues = {}, details = {};
    for (const c of CARACS) {
      const S = res[c.id].empty ? values[c.id] : res[c.id].S;     // rien de mesurable : la valeur reste inchangée
      scores[c.id] = Math.round(S * 100) / 100;
      nextValues[c.id] = Math.round((cfg.alpha * values[c.id] + (1 - cfg.alpha) * S) * 100) / 100;
      details[c.id] = res[c.id].comps.map(x => ({ key: x.key, score: x.score == null ? null : Math.round(x.score * 100) / 100, contrib: Math.round(x.contrib * 100) / 100, note: x.note }));
    }
    if (!res.dex.meta.runsExcused) prevRunWeeks.push(!!res.dex.meta.runsHit);   // une semaine justifiée sort de la fenêtre de régularité
    vo2History.push(res.dex.meta.runsExcused ? null : res.dex.meta.vo2Week);   // une sortie en semaine justifiée ne sert pas de référence
    values = nextValues;
    hist.push({ week: monday, scores, values: { ...values }, details, alpha: cfg.alpha });
    monday = addDays(monday, 7);
  }
  // On remplace tout l'historique (déterministe) : mêmes données ⇒ mêmes valeurs.
  const old = await dbAll('caracHistory');
  for (const o of old) if (!hist.some(h => h.week === o.week)) await dbDelete('caracHistory', o.week);
  for (const h of hist) await dbPut('caracHistory', h);
  return hist;
}

export async function loadCaracHistory() {
  return (await dbAll('caracHistory')).sort((a, b) => a.week.localeCompare(b.week));
}
