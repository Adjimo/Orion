// To-do hebdomadaire : génération par rotation, report automatique, cases à cocher (sans XP).
// Store planTodo ; curseurs et historique dans meta 'todoState'.
import { dbAll, dbDelete, dbGet, dbPut } from '../core/db.js';
import { YEAR_END, SCHOOL_START, addDays, mondayOf, parseKey, weekMode } from '../core/calendar.js';
import { todayKey } from '../core/dates.js';
import { COLLES_G8, weekIndexOf } from './planning-data.js';
import { ANGLAIS_FIXED, ANGLAIS_ROTATION, DAY_PLAN, FRANCAIS_ROTATION, SI_LABEL, TODO_BUDGET, TODO_CATALOG, TODO_SUBJECTS, VOCAB_DAYS } from './todo-data.js';

const STATE_KEY = 'todoState';
const isoDay = (key) => parseKey(key).getDay() || 7;
let seq = 0;
const nextOrd = () => Date.now() * 1000 + (seq++ % 1000);
const uid = (w) => `${w}|c:${Date.now().toString(36)}${(seq++).toString(36)}`;

async function loadState() {
  const v = (await dbGet('meta', STATE_KEY))?.value;
  return { v: v?.v || 0, startDate: v?.startDate || null, lastWeek: v?.lastWeek || null, cursors: v?.cursors || {}, lastDone: v?.lastDone || {} };
}
const saveState = (st) => dbPut('meta', { key: STATE_KEY, value: st });

const hasAnglaisColle = (monday) => {
  const i = weekIndexOf(monday);
  return i !== null && (COLLES_G8[i] || []).some(c => c.startsWith('A'));
};

function makeItem(w, subj, key, label) {
  return { id: `${w}|${key}`, weekKey: w, subj, key, label, done: false, doneAt: null, carried: false, origin: null, carriedTo: null, custom: false, noCarry: false, day: 1, ord: nextOrd() };
}

// Répartition par jour : un chapitre de maths / de physique par jour, SI, anglais et français sur des jours fixes.
export function assignDays(items, fromDay = 1) {
  const byOrder = (a, b) => (b.carried - a.carried) || ((a.ord || 0) - (b.ord || 0));
  for (const subj of ['maths', 'physique']) {
    items.filter(i => i.subj === subj && i.key && !i.custom).sort(byOrder).forEach((it, idx) => { it.day = Math.min(7, fromDay + idx); });
  }
  for (const it of items) {
    if (!it.key || it.custom) { it.day = Math.max(it.day || 1, fromDay); continue; }
    if (it.key === 'si:main') it.day = Math.max(DAY_PLAN.si, fromDay);
    else if (it.key.startsWith('anglais:vocab')) { it.day = Number(it.key.split(':')[2]) || 1; it.noCarry = true; }
    else if (it.subj === 'anglais') it.day = Math.max(DAY_PLAN.anglaisSession, fromDay);
    else if (it.subj === 'francais') it.day = Math.max(DAY_PLAN.francais, fromDay);
  }
}

// Génère les éléments d'une semaine (les éléments reportés y sont déjà).
function generate(w, st, items, fromDay = 1) {
  const has = (key) => items.some(i => i.key === key);
  const add = (subj, key, label) => { if (!has(key)) items.push(makeItem(w, subj, key, label)); };

  for (const subj of ['maths', 'physique']) {
    const cat = TODO_CATALOG[subj];
    if (!cat.length) continue;
    const weight = (key) => cat.find(c => `${subj}:${c.name}` === key)?.w || 0;
    let pts = items.filter(i => i.subj === subj && i.key).reduce((s, i) => s + weight(i.key), 0);
    let cur = (st.cursors[subj] || 0) % cat.length;
    let guard = cat.length;
    while ((pts < TODO_BUDGET[subj] || !items.some(i => i.subj === subj)) && guard-- > 0) {
      const c = cat[cur];
      cur = (cur + 1) % cat.length;
      if (has(`${subj}:${c.name}`)) continue;
      add(subj, `${subj}:${c.name}`, c.name);
      pts += c.w;
    }
    st.cursors[subj] = cur;
  }

  // Rotation par élément le plus ancien non fait (jamais fait = prioritaire).
  const rotate = (subj, names, count) => {
    const have = items.filter(i => i.subj === subj && names.some(n => `${subj}:${n}` === i.key)).length;
    const pool = names.map((n, idx) => ({ n, idx, d: st.lastDone[`${subj}:${n}`] || '' }))
      .filter(x => !has(`${subj}:${x.n}`)).sort((a, b) => a.d.localeCompare(b.d) || a.idx - b.idx);
    for (const x of pool.slice(0, Math.max(0, count - have))) add(subj, `${subj}:${x.n}`, x.n);
  };

  for (const d of VOCAB_DAYS.filter(x => x >= fromDay)) { add('anglais', `anglais:vocab:${d}`, ANGLAIS_FIXED.vocab); const v = items.find(i => i.key === `anglais:vocab:${d}`); v.day = d; v.noCarry = true; }
  if (hasAnglaisColle(w)) { add('anglais', 'anglais:gram', ANGLAIS_FIXED.gram); rotate('anglais', ANGLAIS_ROTATION, 1); }
  else rotate('anglais', ANGLAIS_ROTATION, 2);
  rotate('francais', FRANCAIS_ROTATION, 1);
  add('si', 'si:main', SI_LABEL);
  assignDays(items, fromDay);
}

// Pas de to-do pendant les deux semaines de révisions ni pendant les concours.
export const hasTodo = (monday) => { const m = weekMode(monday); return m === 'normal' || m === 'allege'; };

// Anciennes données (sans jour) : on répartit les éléments par jour.
async function migrateDays(all) {
  const weeks = [...new Set(all.filter(i => !i.day).map(i => i.weekKey))];
  for (const w of weeks) {
    const items = all.filter(i => i.weekKey === w);
    assignDays(items);
    for (const it of items) await dbPut('planTodo', it);
  }
}

// Les éléments non faits d'un jour passé de la semaine en cours passent au jour courant.
async function rollover(all, today) {
  const monday = mondayOf(today);
  if (!hasTodo(monday)) return;
  const day = isoDay(today);
  for (const it of all) {
    if (it.weekKey !== monday || it.done || it.carriedTo || it.noCarry || it.day >= day) continue;
    it.day = day; it.rolled = true;
    await dbPut('planTodo', it);
  }
}

async function run(today) {
  const first = mondayOf(SCHOOL_START), last = mondayOf(YEAR_END);
  let target = mondayOf(today);
  if (target < first) return;
  if (target > last) target = last;
  let st = await loadState();
  let all = await dbAll('planTodo');
  // Remise à zéro unique : la to-do démarre aujourd'hui (pas de reports d'avant la fonctionnalité).
  if (st.v !== 2) {
    for (const it of all) await dbDelete('planTodo', it.id);
    all = [];
    st = { v: 2, startDate: today, lastWeek: null, cursors: {}, lastDone: {} };
    await saveState(st);
  }
  await migrateDays(all);
  const startMonday = mondayOf(st.startDate || today);
  let w = st.lastWeek ? addDays(st.lastWeek, 7) : target;
  while (w <= target) {
    const items = all.filter(i => i.weekKey === w);
    if (!items.length && hasTodo(w)) {
      // Report : les éléments non cochés de la semaine précédente (les semaines closes ne sont que marquées).
      const prevWeek = all.filter(i => i.weekKey < w).reduce((m, i) => (i.weekKey > m ? i.weekKey : m), '');
      for (const p of all.filter(i => i.weekKey === prevWeek && !i.done && !i.carriedTo && !i.noCarry)) {
        if (p.key && items.some(i => i.key === p.key)) continue;
        const n = { ...p, id: p.key ? `${w}|${p.key}` : uid(w), weekKey: w, done: false, doneAt: null, carried: true, rolled: false, origin: p.origin || p.weekKey, carriedTo: null };
        items.push(n);
        p.carriedTo = w;
        await dbPut('planTodo', p);
      }
      generate(w, st, items, w === startMonday ? isoDay(st.startDate || today) : 1);
      for (const it of items) { await dbPut('planTodo', it); all.push(it); }
    }
    st.lastWeek = w;
    await saveState(st);
    w = addDays(w, 7);
  }
  await rollover(all, today);
}

let lock = null;
export function ensureTodo(today = todayKey()) {
  if (!lock) lock = run(today).catch(err => console.error('Todo failed', err)).finally(() => { lock = null; });
  return lock;
}

export async function loadWeekTodo(monday) {
  return (await dbAll('planTodo')).filter(i => i.weekKey === monday);
}

export async function toggleTodo(item) {
  item.done = !item.done;
  item.doneAt = item.done ? todayKey() : null;
  await dbPut('planTodo', item);
  if (item.done && item.key) {
    const st = await loadState();
    st.lastDone[item.key] = item.doneAt;
    await saveState(st);
  }
}
export const removeTodo = (id) => dbDelete('planTodo', id);

// Éléments du catalogue absents de la semaine, par matière (le vocabulaire se choisit par jour).
export function availableCatalog(items, day = 1) {
  const present = new Set(items.map(i => i.key).filter(Boolean));
  const groups = [];
  const push = (subj, entries) => { const e = entries.filter(x => !present.has(x.key)); if (e.length) groups.push({ subj, entries: e }); };
  push('maths', TODO_CATALOG.maths.map(c => ({ key: `maths:${c.name}`, label: c.name })));
  push('physique', TODO_CATALOG.physique.map(c => ({ key: `physique:${c.name}`, label: c.name })));
  push('anglais', [{ key: `anglais:vocab:${day}`, label: ANGLAIS_FIXED.vocab }, { key: 'anglais:gram', label: ANGLAIS_FIXED.gram }, ...ANGLAIS_ROTATION.map(n => ({ key: `anglais:${n}`, label: n }))]);
  push('francais', FRANCAIS_ROTATION.map(n => ({ key: `francais:${n}`, label: n })));
  push('si', [{ key: 'si:main', label: SI_LABEL }]);
  return groups;
}

export async function addTodo(monday, subj, key, label, day = 1) {
  const it = key
    ? { ...makeItem(monday, subj, key, label), day, noCarry: key.startsWith('anglais:vocab') }
    : { ...makeItem(monday, 'autre', 'x', label), id: uid(monday), key: null, custom: true, day };
  await dbPut('planTodo', it);
}
export { TODO_SUBJECTS };
