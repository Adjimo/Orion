// To-do hebdomadaire : génération par rotation, report automatique, cases à cocher (sans XP).
// Store planTodo ; curseurs et historique dans meta 'todoState'.
import { dbAll, dbDelete, dbGet, dbPut } from '../core/db.js';
import { YEAR_END, SCHOOL_START, addDays, mondayOf, weekMode } from '../core/calendar.js';
import { todayKey } from '../core/dates.js';
import { COLLES_G8, weekIndexOf } from './planning-data.js';
import { ANGLAIS_FIXED, ANGLAIS_ROTATION, FRANCAIS_ROTATION, SI_LABEL, TODO_BUDGET, TODO_CATALOG, TODO_SUBJECTS } from './todo-data.js';

const STATE_KEY = 'todoState';
let seq = 0;
const nextOrd = () => Date.now() * 1000 + (seq++ % 1000);
const uid = (w) => `${w}|c:${Date.now().toString(36)}${(seq++).toString(36)}`;

async function loadState() {
  const v = (await dbGet('meta', STATE_KEY))?.value;
  return { lastWeek: v?.lastWeek || null, cursors: v?.cursors || {}, lastDone: v?.lastDone || {} };
}
const saveState = (st) => dbPut('meta', { key: STATE_KEY, value: st });

const hasAnglaisColle = (monday) => {
  const i = weekIndexOf(monday);
  return i !== null && (COLLES_G8[i] || []).some(c => c.startsWith('A'));
};

function makeItem(w, subj, key, label) {
  return { id: `${w}|${key}`, weekKey: w, subj, key, label, done: false, doneAt: null, carried: false, origin: null, carriedTo: null, custom: false, ord: nextOrd() };
}

// Génère les éléments d'une semaine (les éléments reportés y sont déjà).
function generate(w, st, items) {
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

  add('anglais', 'anglais:vocab', ANGLAIS_FIXED.vocab);
  if (hasAnglaisColle(w)) { add('anglais', 'anglais:gram', ANGLAIS_FIXED.gram); rotate('anglais', ANGLAIS_ROTATION, 1); }
  else rotate('anglais', ANGLAIS_ROTATION, 2);
  rotate('francais', FRANCAIS_ROTATION, 1);
  add('si', 'si:main', SI_LABEL);
}

// Pas de to-do pendant les deux semaines de révisions ni pendant les concours.
export const hasTodo = (monday) => { const m = weekMode(monday); return m === 'normal' || m === 'allege'; };

async function run(today) {
  const first = mondayOf(SCHOOL_START), last = mondayOf(YEAR_END);
  let target = mondayOf(today);
  if (target < first) return;
  if (target > last) target = last;
  const st = await loadState();
  if (st.lastWeek && st.lastWeek >= target) return;
  const all = await dbAll('planTodo');
  let w = st.lastWeek ? addDays(st.lastWeek, 7) : target;
  while (w <= target) {
    const items = all.filter(i => i.weekKey === w);
    if (!items.length && hasTodo(w)) {
      // Report : les éléments non cochés de la semaine précédente (les semaines closes ne sont que marquées).
      const prevWeek = all.filter(i => i.weekKey < w).reduce((m, i) => (i.weekKey > m ? i.weekKey : m), '');
      for (const p of all.filter(i => i.weekKey === prevWeek && !i.done && !i.carriedTo)) {
        if (p.key && items.some(i => i.key === p.key)) continue;
        const n = { ...p, id: p.key ? `${w}|${p.key}` : uid(w), weekKey: w, done: false, doneAt: null, carried: true, origin: p.origin || p.weekKey, carriedTo: null };
        items.push(n);
        p.carriedTo = w;
        await dbPut('planTodo', p);
      }
      generate(w, st, items);
      for (const it of items) { await dbPut('planTodo', it); all.push(it); }
    }
    st.lastWeek = w;
    await saveState(st);
    w = addDays(w, 7);
  }
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

// Éléments du catalogue absents de la semaine, par matière.
export function availableCatalog(items) {
  const present = new Set(items.map(i => i.key).filter(Boolean));
  const groups = [];
  const push = (subj, entries) => { const e = entries.filter(x => !present.has(x.key)); if (e.length) groups.push({ subj, entries: e }); };
  push('maths', TODO_CATALOG.maths.map(c => ({ key: `maths:${c.name}`, label: c.name })));
  push('physique', TODO_CATALOG.physique.map(c => ({ key: `physique:${c.name}`, label: c.name })));
  push('anglais', [{ key: 'anglais:vocab', label: ANGLAIS_FIXED.vocab }, { key: 'anglais:gram', label: ANGLAIS_FIXED.gram }, ...ANGLAIS_ROTATION.map(n => ({ key: `anglais:${n}`, label: n }))]);
  push('francais', FRANCAIS_ROTATION.map(n => ({ key: `francais:${n}`, label: n })));
  push('si', [{ key: 'si:main', label: SI_LABEL }]);
  return groups;
}

export async function addTodo(monday, subj, key, label) {
  const it = key ? makeItem(monday, subj, key, label) : { ...makeItem(monday, 'autre', 'x', label), id: uid(monday), key: null, custom: true };
  await dbPut('planTodo', it);
}
export { TODO_SUBJECTS };
