// To-do hebdomadaire : génération par rotation, report automatique, cases à cocher (sans XP).
// Store planTodo ; curseurs et historique dans meta 'todoState'.
import { dbAll, dbDelete, dbGet, dbPut } from '../core/db.js';
import { YEAR_END, SCHOOL_START, addDays, mondayOf, parseKey, weekMode } from '../core/calendar.js';
import { todayKey } from '../core/dates.js';
import { COLLES_G8, weekIndexOf } from './planning-data.js';
import { OTHER_SUBJECT, TODO_SUBJECTS } from './todo-data.js';
import { cycleNow, loadCycle } from './todo-cycle.js';
import { loadRecur, recKey, recurDue, recurNow } from './todo-recur.js';

const STATE_KEY = 'todoState';
const isoDay = (key) => parseKey(key).getDay() || 7;
let seq = 0;
const nextOrd = () => Date.now() * 1000 + (seq++ % 1000);
const uid = (w) => `${w}|c:${Date.now().toString(36)}${(seq++).toString(36)}`;

async function loadState() {
  const v = (await dbGet('meta', STATE_KEY))?.value;
  return { v: v?.v || 0, startDate: v?.startDate || null, lastWeek: v?.lastWeek || null, cursors: v?.cursors || {}, lastDone: v?.lastDone || {}, cursorNames: v?.cursorNames || {} };
}
const saveState = (st) => dbPut('meta', { key: STATE_KEY, value: st });

const hasAnglaisColle = (monday) => {
  const i = weekIndexOf(monday);
  return i !== null && (COLLES_G8[i] || []).some(c => c.startsWith('A'));
};

function makeItem(w, subj, key, label) {
  return { id: `${w}|${key}`, weekKey: w, subj, key, label, done: false, doneAt: null, carried: false, origin: null, carriedTo: null, custom: false, noCarry: false, day: 1, ord: nextOrd() };
}

// Répartition par jour : les éléments d'un cycle suivent les jours réglés pour sa matière (un par jour, le dernier jour reçoit le reste) ;
// les éléments récurrents ont leurs propres jours ; les éléments ajoutés à la main gardent leur jour.
export function assignDays(items, fromDay = 1) {
  const byOrder = (a, b) => (b.carried - a.carried) || ((a.ord || 0) - (b.ord || 0));
  for (const sub of cycleNow().subjects) {
    const days = (sub.days || [1, 2, 3, 4, 5, 6, 7]).filter(d => d >= fromDay);
    const pool = days.length ? days : [Math.max(fromDay, 1)];
    items.filter(i => i.subj === sub.id && i.key && !i.custom && !i.rec).sort(byOrder).forEach((it, idx) => { it.day = pool[Math.min(idx, pool.length - 1)]; });
  }
  for (const it of items) {
    if (it.rec) continue;
    if (it.key?.startsWith('anglais:vocab')) { it.day = Number(it.key.split(':')[2]) || 1; it.noCarry = true; }
    else if (!it.key || it.custom) it.day = Math.max(it.day || 1, fromDay);
  }
}

// Clé d'un élément de cycle désactivé (lui-même ou son cycle) : jamais généré ni reporté.
const isOffKey = (key) => { const [sid, ...n] = String(key || '').split(':'); const sub = cycleNow().subjects.find(x => x.id === sid); const name = n.join(':'); const c = sub?.items.find(x => x.name === name); return !!c && (sub.enabled === false || c.enabled === false); };

// Génère les éléments d'une semaine (les éléments reportés y sont déjà).
function generate(w, st, items, fromDay = 1) {
  const has = (key) => items.some(i => i.key === key);
  const add = (subj, key, label) => { if (!has(key)) items.push(makeItem(w, subj, key, label)); };

  for (const sub of cycleNow().subjects) {
    const subj = sub.id, cat = sub.items;
    if (!cat.some(c => c.enabled !== false) || sub.enabled === false) continue;   // cycle désactivé : rien n'est généré
    const weight = (key) => cat.find(c => `${subj}:${c.name}` === key)?.w || 0;
    let pts = items.filter(i => i.subj === subj && i.key && !i.rec).reduce((s, i) => s + weight(i.key), 0);
    let cur = (st.cursors[subj] || 0) % cat.length;
    const named = cat.findIndex(c => c.name === st.cursorNames?.[subj]);   // le curseur suit le nom du chapitre : insérer ou déplacer ne décale plus le cycle
    if (named >= 0) cur = named;
    const period = sub.budgetMode === 'period' && sub.endDate && w <= sub.endDate;
    let budget = cycleBudget(sub, w, cur);
    if (subj === 'anglais' && hasAnglaisColle(w)) budget = Math.ceil(budget / 2);   // semaine de colle d'anglais : la grammaire prend la place
    let guard = cat.length;
    while ((pts < budget || !items.some(i => i.subj === subj && !i.rec)) && guard-- > 0) {
      const c = cat[cur];
      cur = (cur + 1) % cat.length;
      if (c.enabled === false || has(`${subj}:${c.name}`)) continue;   // élément désactivé : reste dans le cycle, mais n'est plus généré
      add(subj, `${subj}:${c.name}`, c.name);
      pts += c.w;
      if (period && cur === 0) break;   // fin du tour : on ne recommence pas avant la date de fin
    }
    st.cursors[subj] = cur;
    (st.cursorNames ||= {})[subj] = cat[cur].name;
  }

  // Éléments récurrents (onglet To-do) : jours choisis, toutes les N semaines.
  for (const r of recurNow().items) {
    if (!r.enabled || (r.cond === 'colle' && !hasAnglaisColle(w)) || !recurDue(r, w)) continue;
    for (const d of r.days.filter(x => x >= fromDay)) {
      const key = recKey(r, d);
      add(r.subj, key, r.label);
      const it = items.find(i => i.key === key);
      it.day = d; it.noCarry = r.noCarry; it.rec = r.id;
    }
  }
  assignDays(items, fromDay);
}

// Semaines de to-do restantes (vacances, révisions et concours exclus) de la semaine `from` jusqu'à `end` incluse.
function weeksLeft(from, end) {
  let n = 0;
  for (let m = from; m <= end; m = addDays(m, 7)) if (hasTodo(m)) n++;
  return Math.max(1, n);
}

// Budget de points d'une matière pour la semaine `monday` (le curseur indique où en est le tour en cours).
export function cycleBudget(sub, monday, cursor = 0) {
  if (sub.budgetMode === 'period' && sub.endDate && monday <= sub.endDate && sub.items.length) {
    const remaining = sub.items.slice(cursor % sub.items.length).reduce((s, c) => s + c.w, 0);
    return Math.max(1, Math.ceil(remaining / weeksLeft(monday, sub.endDate)));
  }
  return sub.budget;
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
  await loadCycle();
  await loadRecur();
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
        if (p.key && (items.some(i => i.key === p.key) || (!p.rec && !p.custom && isOffKey(p.key)))) continue;
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

// Un élément de cycle désactivé disparaît d'Aujourd'hui et des jours suivants de la semaine en cours (les éléments déjà faits et
// les jours passés restent). Il reste dans le cycle (onglet To-do) et revient à la réactivation, dans le tour suivant.
export async function purgeDisabledTodo(today = todayKey()) {
  await loadCycle();
  const off = new Set(cycleNow().subjects.flatMap(sub => sub.items.filter(c => c.enabled === false || sub.enabled === false).map(c => `${sub.id}:${c.name}`)));
  if (!off.size) return;
  const monday = mondayOf(today), day = isoDay(today);
  for (const it of await dbAll('planTodo')) {
    if (!it.key || it.custom || it.rec || it.done || !off.has(it.key)) continue;
    if (it.weekKey > monday || (it.weekKey === monday && it.day >= day)) await dbDelete('planTodo', it.id);
  }
}

// Éléments du catalogue absents de la semaine, par matière (le vocabulaire se choisit par jour).
export function availableCatalog(items, day = 1) {
  const present = new Set(items.map(i => i.key).filter(Boolean));
  const groups = [];
  const push = (subj, entries) => {
    const e = entries.filter(x => !present.has(x.key));
    const g = groups.find(x => x.subj === subj);
    if (g) g.entries.push(...e); else if (e.length) groups.push({ subj, entries: e });
  };
  for (const sub of cycleNow().subjects) push(sub.id, sub.items.map(c => ({ key: `${sub.id}:${c.name}`, label: c.name })));
  for (const r of recurNow().items) push(r.subj, [{ key: recKey(r, r.id === 'vocab' || r.days.length > 1 ? day : r.days[0] || day), label: r.label }]);
  return groups;
}

export async function addTodo(monday, subj, key, label, day = 1) {
  const it = key
    ? { ...makeItem(monday, subj, key, label), day, noCarry: key.startsWith('anglais:vocab') }
    : { ...makeItem(monday, 'autre', 'x', label), id: uid(monday), key: null, custom: true, day };
  await dbPut('planTodo', it);
}
export { OTHER_SUBJECT, TODO_SUBJECTS, cycleNow, loadCycle };
export { saveCycle } from './todo-cycle.js';
