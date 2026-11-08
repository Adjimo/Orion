// Initialisation des données par défaut
import { dbAll, dbAllLive, dbGet, dbPut } from '../core/db.js';
import { State } from '../core/state.js';
import { DEFAULT_PROFILE } from '../core/xp.js';
import { SEED_EXAMS } from './exams.js';
import { activityXp } from './gpx.js';
import { SEED_WEEKLY_QUESTS } from './quests.js';
import { bestSplit, computeKmSplits } from './records.js';
import { DEFAULT_SCHEDULE } from './schedule.js';

export async function initSeed() {
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
  await migrateData();
}

// 11.b MIGRATION DES DONNÉES (idempotent, exécuté à chaque démarrage)

export async function migrateData() {
  // Calendrier des écrits (v3.15) + quête sommeil « couché avant 23h30 ».
  for (const seed of SEED_EXAMS) {
    const cur = await dbGet('exams', seed.id);
    if (!cur) { await dbPut('exams', seed); continue; }
    if (cur.date !== seed.date || cur.endDate !== seed.endDate) {
      await dbPut('exams', { ...cur, date: seed.date, endDate: seed.endDate });
    }
  }
  const sleepQ = await dbGet('quests', 'wq-sleep');
  if (sleepQ && sleepQ.title !== 'Couché avant 23h30') {
    await dbPut('quests', { ...sleepQ, title: 'Couché avant 23h30', unit: 'soirs' });
  }
  // Profil : structure des skills + nettoyage streak.
  const profile = await dbGet('profile', 'me');
  if (profile) {
    let dirty = false;
    profile.skills = profile.skills || {};
    // Ajout des nouveaux skills
    if (!profile.skills.lettres) { profile.skills.lettres = { xp: 0, level: 1 }; dirty = true; }
    if (!profile.skills.allure)  { profile.skills.allure  = { xp: 0, level: 1 }; dirty = true; }
    // Suppression de l'ancien skill `montagne` (s'il existait, son XP est jeté).
    if (profile.skills.montagne) { delete profile.skills.montagne; dirty = true; }
    // Suppression des streaks (n'apportent rien).
    if ('streak'     in profile) { delete profile.streak;     dirty = true; }
    if ('bestStreak' in profile) { delete profile.bestStreak; dirty = true; }
    if (dirty) await dbPut('profile', profile);
  }

  // Quêtes : resynchronise les champs déclaratifs (title, goal*, category, flags auto*)
  // depuis SEED_WEEKLY_QUESTS à chaque démarrage. La completion (XP gagné, ratio, etc.)
  // n'est PAS touchée — elle vit dans le store `completions`. Cela permet de modifier
  // un objectif (ex: anglais 3h → 2h) sans laisser des incohérences en base.
  const quests = await dbAll('quests');
  const seedFields = ['title', 'type', 'goalHours', 'goalCount', 'unit', 'skill', 'icon', 'color',
                      'autoFromActivities', 'autoFromWorkLog', 'autoFromLangues', 'autoFromLettres', 'autoFromSi', 'autoFromSleep', 'category'];
  for (const q of quests) {
    const seed = SEED_WEEKLY_QUESTS.find(s => s.id === q.id);
    if (!seed) continue;
    let dirty = false;
    for (const f of seedFields) {
      if (q[f] !== seed[f]) {
        // On normalise les undefined : ne pas re-puter si les deux sont absents.
        if (q[f] === undefined && seed[f] === undefined) continue;
        q[f] = seed[f];
        dirty = true;
      }
    }
    if (dirty) await dbPut('quests', q);
  }

  // Schedule : resynchronise depuis DEFAULT_SCHEDULE (ex: pour appliquer les
  // nouvelles heures de travail / sportType à la rentrée).
  const sched = await dbAll('schedule');
  for (const s of sched) {
    const seed = DEFAULT_SCHEDULE.find(d => d.id === s.id);
    if (!seed) continue;
    let dirty = false;
    for (const f of ['sport', 'sportType', 'workHours']) {
      if (s[f] !== seed[f]) { s[f] = seed[f]; dirty = true; }
    }
    if (dirty) await dbPut('schedule', s);
  }

  // Activités : backfill xpAwarded/skillsAwarded pour permettre la suppression
  // réversible. Backfill aussi les nouveaux best splits (1k, semi) et les
  // splits km par km pour les sorties importées avant ces fonctionnalités.
  // Renomme aussi l'ancien type 'sortie-we' en 'sortie-longue'.
  const acts = await dbAll('activities');
  for (const a of acts) {
    let dirty = false;
    if (a.type === 'sortie-we') {
      a.type = 'sortie-longue';
      dirty = true;
    }
    // Catégories supprimées (v2.04 → v2.05) : on rebascule sur footing.
    // Catégorie « seuil » supprimée (v3.10) : les anciennes sorties deviennent des footings.
    if (a.type === 'endurance' || a.type === 'vitesse' || a.type === 'renforcement' || a.type === 'seuil') {
      a.type = 'footing';
      dirty = true;
    }
    if (a.xpAwarded == null) {
      const { xp, skills } = activityXp(a, a.type);
      a.xpAwarded = xp;
      a.skillsAwarded = skills;
      dirty = true;
    }
    if (a.points && Array.isArray(a.points)) {
      if (a.kmSplits == null) {
        a.kmSplits = computeKmSplits(a.points);
        dirty = true;
      }
      if (a.best1k == null) {
        const b1 = bestSplit(a.points, 1000);
        if (b1) { a.best1k = b1; dirty = true; }
      }
      if (a.bestSemi == null) {
        const bs = bestSplit(a.points, 21097);
        if (bs) { a.bestSemi = bs; dirty = true; }
      }
    }
    if (dirty) await dbPut('activities', a);
  }
}

export async function loadAll() {
  State.profile = await dbGet('profile', 'me');
  State.quests = await dbAll('quests');
  State.completions = await dbAllLive('completions');
  State.activities = await dbAllLive('activities');
  State.workLogs = await dbAllLive('workLog');
  State.exams = await dbAll('exams');
  State.schedule = await dbAll('schedule');
  const recs = await dbAll('records');
  State.records = {};
  for (const r of recs) State.records[r.id] = r;
  // Objectif de course personnel (course cible).
  const goalRace = await dbGet('meta', 'goalRace');
  State._goalRace = goalRace?.value || null;
}
