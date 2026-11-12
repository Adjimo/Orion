// Caractéristiques « façon D&D » : 6 valeurs recalculées UNE FOIS PAR SEMAINE CLOSE.
// Indépendant de l'XP, des malus et des niveaux : on part des données brutes
// (activités, temps de travail, quêtes, sommeil, écarts perso).
//
// Règles :
//  - semaine = lundi → dimanche ; une semaine n'est calculée qu'une fois close
//    (lundi suivant). Aucune valeur provisoire pendant la semaine.
//  - valeur(n) = α × valeur(n-1) + (1-α) × S(n), α réglable (0,75 par défaut) ;
//    toute modification de α recalcule tout l'historique depuis la date de départ.
//  - Score S d'une part, selon le ratio r = réalisé / objectif de la semaine :
//      r = 0 → 4 ; r = 1 (objectif atteint) → 15 ; r = 1,25 → 18 ; plafond 20 (≈ r = 1,42).
//    Interpolation linéaire entre ces points. Tout est réglable (Options › Échelle des scores).
//  - La to-do ne compte plus dans le calcul. L'allure (VO2max) ne compte plus non plus.
//  - Maths, Physique, SI / Info, Verbe : 100 % heures de travail vs objectif de la semaine.
//  - Dextérité : 60 % volume (sorties de la semaine / objectif de sorties) + 40 % régularité
//    (moyenne, sur les 4 dernières semaines non justifiées, de sorties / objectif de chaque semaine).
//  - Discipline : 70 % quêtes réussies + 30 % sommeil (7 nuits sur 7 avant 23h30 = objectif atteint = 15),
//    moins les écarts perso.
//  - sorties justifiées (wq-runs) : volume et régularité ignorés ; la semaine sort de la fenêtre de
//    régularité ; si rien n'est mesurable, la valeur reste inchangée.
//  - sommeil : max(cases cochées, compteur de la quête wq-sleep) car l'historique des cases ne commence qu'en nov. 2026.
//  - quêtes justifiées (meta `malusExcuses`) : ignorées dans la Discipline (réglage `neutralizeExcused`).
//  - semaine partielle (jours < 7) : objectifs d'heures, de sorties et de nuits proratisés par
//    jours comptés / 7 (réglage `prorateFirstWeek`).
//  - recalcul déterministe depuis `start` (1er septembre 2026) : même données → mêmes valeurs.
import { weekKey } from '../core/dates.js';
import { addDays, mondayOf, parseKey } from '../core/calendar.js';
import { dbAll, dbAllLive, dbDelete, dbGet, dbPut } from '../core/db.js';
import { getMalusExcuses, getSelfMalus } from './penalties.js';
import { isRunActivity } from './schedule.js';
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
const SETTINGS_VERSION = 2;       // v2 : échelle 4/15/18, sans to-do ni allure (les réglages plus anciens sont ignorés, sauf α)
export const DEFAULT_SETTINGS = {
  start: '2026-09-01',          // 1er septembre (la semaine du 31/08 ne compte que depuis le 01/09)
  initial: 10,                  // valeur de départ
  alpha: 0.75,                  // poids de la valeur précédente (le reste va au score de la semaine)
  hoursGoal: { math: 19, phys: 11, si: 1, verb: 3 },   // heures par semaine : Maths 19, Physique 11, SI 1 (Info 0), Verbe 3 (anglais 2 + français 1)
  neutralizeExcused: true,      // quêtes justifiées (maladie…) : ignorées au lieu d'être comptées ratées
  prorateFirstWeek: true,       // semaine partielle (début le 01/09) : objectifs proratisés au nombre de jours comptés
  weights: {                    // pondérations (en %, normalisées si une part manque)
    dex:  { volume: 60, regularite: 40 },
    disc: { quetes: 70, sommeil: 30 }
  },
  scoreZero: 4,                 // score quand rien n'est fait (et plancher de tout score)
  goalScore: 15,                // score quand l'objectif est atteint
  overScore: 18,                // score quand l'objectif est dépassé de 25 %
  overRatio: 1.25,
  scoreCap: 20,                 // score maximum
  regulariteWeeks: 4,           // fenêtre de la régularité (semaines)
  ecartPointsPerPct: 0.1        // points de Discipline retirés par % d'écart perso (60 % ⇒ −6)
};

export async function getCaracSettings() {
  const stored = (await dbGet('meta', 'caracSettings'))?.value || {};
  const s = stored.ver === SETTINGS_VERSION ? stored
    : { alpha: stored.alpha, neutralizeExcused: stored.neutralizeExcused, prorateFirstWeek: stored.prorateFirstWeek };
  const clean = Object.fromEntries(Object.entries(s).filter(([k, v]) => v !== undefined && k !== 'ver'));
  return {
    ...DEFAULT_SETTINGS, ...clean,
    hoursGoal: { ...DEFAULT_SETTINGS.hoursGoal, ...(clean.hoursGoal || {}) },
    weights: Object.fromEntries(Object.entries(DEFAULT_SETTINGS.weights).map(([k, v]) => [k, { ...v, ...(clean.weights?.[k] || {}) }]))
  };
}

// Modifie un ou plusieurs réglages puis recalcule tout l'historique.
export async function saveCaracSettings(patch) {
  const cur = await getCaracSettings();
  const next = { ...cur, ...patch, ver: SETTINGS_VERSION };
  await dbPut('meta', { key: 'caracSettings', value: next });
  return recomputeCaracs();
}

// ── Outils de calcul ─────────────────────────────────────────────────────────
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// Score de base d'un ratio réalisé / objectif : 0 → rien (4), 1 → objectif (15), 1,25 → dépassé (18), plafonné (20).
export function baseScore(ratio, cfg = DEFAULT_SETTINGS) {
  const r = Math.max(0, ratio || 0), z = cfg.scoreZero, g = cfg.goalScore, o = cfg.overScore, ro = cfg.overRatio;
  const s = r <= 1 ? z + (g - z) * r : g + (o - g) * (r - 1) / (ro - 1);
  return clamp(s, z, cfg.scoreCap);
}
export const modifier = (value) => Math.floor((Math.round(value) - 10) / 2);
export const fmtMod = (m) => (m >= 0 ? `+${m}` : `${m}`);

// Combine des parts { key, w, score|null } : une part absente (null) est ignorée et les poids sont renormalisés.
export function combine(parts, cap = DEFAULT_SETTINGS.scoreCap) {
  const ok = parts.filter(p => p.score != null && p.w > 0);
  const tw = ok.reduce((s, p) => s + p.w, 0);
  const comps = parts.map(p => ({ key: p.key, w: p.w, score: p.score, contrib: (p.score != null && tw > 0 && p.w > 0) ? (p.w / tw) * p.score : 0, note: p.note || '' }));
  const S = clamp(comps.reduce((s, c) => s + c.contrib, 0), 0, cap);
  return { S, comps, empty: ok.length === 0 };   // empty : aucune part mesurable → la valeur n'est pas mise à jour
}

// ── Chargement des données brutes (une seule fois par recalcul) ───────────────
async function loadRaw() {
  const [acts, logs, comps, quests, sleep, self, runsGoals, excuses] = await Promise.all([
    dbAllLive('activities'), dbAllLive('workLog'), dbAll('completions'),
    dbAll('quests'), getSleepLog(), getSelfMalus(), getRunsGoals(), getMalusExcuses()
  ]);
  return { acts: acts.filter(isRunActivity), logs, comps, quests, sleep, self, runsGoals, excuses };
}

const sumMinutes = (logs, days, subjects) => logs
  .filter(l => days.includes(l.date))
  .reduce((s, l) => s + subjects.reduce((t, k) => t + (l.bySubject?.[k] || 0), 0), 0);

// ── Score S d'une semaine ─────────────────────────────────────────────────────
// ctx : { monday, days, raw, cfg, prevRunRatios (sorties / objectif des semaines précédentes non justifiées) }
export function scoreWeek(ctx) {
  const { monday, days, raw, cfg } = ctx;
  const wk = weekKey(parseKey(monday));
  const W = cfg.weights;
  const out = {};
  const bs = (r) => baseScore(r, cfg);
  const f = cfg.prorateFirstWeek ? days.length / 7 : 1;          // facteur de proratisation (1 = semaine complète)

  // Dextérité : volume (sorties de la semaine vs objectif) + régularité (moyenne glissante des mêmes ratios)
  const runs = raw.acts.filter(a => days.includes(String(a.date).slice(0, 10)));
  const runsQuest = raw.quests.find(q => q.id === 'wq-runs');
  const runsGoalFull = (raw.runsGoals[wk] >= 1 ? raw.runsGoals[wk] : (runsQuest?.goalCount || 3));
  const runsGoal = f < 1 ? Math.max(1, Math.round(runsGoalFull * f)) : runsGoalFull;
  const runsExcused = !!cfg.neutralizeExcused && !!raw.excuses?.[`${wk}|wq-runs`];   // sorties justifiées (maladie…)
  const ratio = Math.min(runs.length / runsGoal, cfg.overRatio);
  const win = [...ctx.prevRunRatios.slice(-(cfg.regulariteWeeks - 1)), ratio];
  const regAvg = win.reduce((s, x) => s + x, 0) / win.length;
  const exNote = runsExcused ? 'sorties justifiées' : '';
  out.dex = combine([
    { key: 'volume', w: W.dex.volume, score: runsExcused ? null : bs(runs.length / runsGoal), note: exNote },
    { key: 'regularite', w: W.dex.regularite, score: runsExcused ? null : bs(regAvg), note: exNote }
  ], cfg.scoreCap);
  out.dex.meta = { runRatio: ratio, runsExcused };

  // Matières : 100 % heures de travail vs objectif de la matière
  const subj = { math: ['maths'], phys: ['physique'], si: ['si'], verb: ['langues', 'francais'] };
  for (const id of ['math', 'phys', 'si', 'verb']) {
    const goal = cfg.hoursGoal[id] * 60 * f;
    out[id] = combine([{ key: 'heures', w: 100, score: goal > 0 ? bs(sumMinutes(raw.logs, days, subj[id]) / goal) : null }], cfg.scoreCap);
  }

  // Discipline : quêtes réussies + nuits avant 23h30 (7/7 = objectif), − écarts perso
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
  const disc = combine([
    { key: 'quetes', w: W.disc.quetes, score: qs.length ? bs(done / qs.length) : null, note: nbExcused ? `${nbExcused} quête(s) justifiée(s) ignorée(s)` : '' },
    { key: 'sommeil', w: W.disc.sommeil, score: bs(nights / days.length) }
  ], cfg.scoreCap);
  const selfPct = Math.min(60, (raw.self[wk] || []).reduce((s, e) => s + (e.percent || 0), 0));
  const ecart = selfPct * cfg.ecartPointsPerPct;
  disc.comps.push({ key: 'ecarts', w: 0, score: null, contrib: -ecart, note: selfPct ? `${selfPct} % d'écarts` : '' });
  disc.S = clamp(disc.S - ecart, 0, cfg.scoreCap);
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
  const prevRunRatios = [];
  let values = Object.fromEntries(CARACS.map(c => [c.id, cfg.initial]));
  while (monday <= lastClosed) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i)).filter(d => d >= cfg.start);
    const res = scoreWeek({ monday, days, raw, cfg, prevRunRatios });
    const scores = {}, nextValues = {}, details = {};
    for (const c of CARACS) {
      const S = res[c.id].empty ? values[c.id] : clamp(res[c.id].S, cfg.scoreZero, cfg.scoreCap);   // plancher / plafond ; rien de mesurable : valeur inchangée
      scores[c.id] = Math.round(S * 100) / 100;
      nextValues[c.id] = Math.round((cfg.alpha * values[c.id] + (1 - cfg.alpha) * S) * 100) / 100;
      details[c.id] = res[c.id].comps.map(x => ({ key: x.key, score: x.score == null ? null : Math.round(x.score * 100) / 100, contrib: Math.round(x.contrib * 100) / 100, note: x.note }));
    }
    if (!res.dex.meta.runsExcused) prevRunRatios.push(res.dex.meta.runRatio);   // une semaine justifiée sort de la fenêtre de régularité
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
