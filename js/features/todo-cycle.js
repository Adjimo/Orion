// Cycle de la to-do : matières à éléments pondérés, entièrement éditables par l'utilisateur.
// meta `todoCycle` : { v:1, subjects:[{ id, label, budgetMode:'points'|'period', budget, endDate, items:[{ name, w }] }] }
//  - 'points'  : budget fixe de points par semaine ;
//  - 'period'  : le budget est recalculé chaque semaine pour finir le cycle avant `endDate`
//                (points restants du tour en cours ÷ semaines de to-do restantes).
// Par défaut : Maths et Physique, repris de todo-data.js (rien n'est perdu).
import { dbGet, dbPut } from '../core/db.js';
import { WORK_IDS, WORK_SUBJECTS } from './competences.js';
import { CYCLE_OFF_BY_DEFAULT, DEFAULT_CYCLE_DAYS, MOVED_CYCLE_ITEMS, TODO_BUDGET, TODO_CATALOG } from './todo-data.js';

const KEY = 'todoCycle';
let cache = null;

const labelOf = (id) => WORK_SUBJECTS.find(s => s.id === id)?.label || id;

export function defaultCycle() {
  return {
    v: 4,
    subjects: WORK_IDS.map(id => ({
      id, label: labelOf(id), budgetMode: 'points', budget: TODO_BUDGET[id] || 3, endDate: null,
      enabled: !CYCLE_OFF_BY_DEFAULT.includes(id),
      items: (TODO_CATALOG[id] || []).map(c => ({ name: c.name, w: c.w, enabled: true }))
    }))
  };
}

// Les cycles sont ceux des matières de catégorie « travail » (competences.js) : Maths, Physique, SI / Info, Anglais, Français.
// Chaque cycle et chaque élément a un interrupteur (`enabled`) ; un élément désactivé reste dans la liste mais n'est plus généré.
function clean(v) {
  const base = v && Array.isArray(v.subjects) ? v : defaultCycle();
  const def = defaultCycle().subjects;
  const migrate4 = (base.v || 0) < 4;   // v4 : les éléments par défaut d'anglais / français passent dans les récurrents
  const byId = new Map(base.subjects.map(s => [String(s.id), s]));
  // Migration v3 : toutes les matières de travail ont leur cycle (SI / Info ajouté désactivé et vide) ; les autres matières disparaissent.
  const subjects = WORK_IDS.map(id => byId.get(id) || def.find(d => d.id === id));
  return {
    v: 4,
    subjects: subjects.map(s => ({
      id: String(s.id), label: labelOf(String(s.id)),
      budgetMode: 'points', enabled: s.enabled !== false,
      days: [...new Set((s.days && s.days.length ? s.days : DEFAULT_CYCLE_DAYS[s.id] || [1, 2, 3, 4, 5, 6, 7]).map(Number).filter(d => d >= 1 && d <= 7))].sort((a, b) => a - b),
      budget: Math.max(1, Number(s.budget) || 10), endDate: null,
      items: (s.items || []).filter(i => i && String(i.name || '').trim() && !(migrate4 && (MOVED_CYCLE_ITEMS[String(s.id)] || []).includes(String(i.name).trim()))).map(i => ({ name: String(i.name).trim(), w: Math.max(1, Math.round(Number(i.w) || 1)), enabled: i.enabled !== false }))
    }))
  };
}

export async function loadCycle() {
  if (!cache) cache = clean((await dbGet('meta', KEY))?.value);
  return cache;
}
export const cycleNow = () => cache || (cache = clean(null));

export async function saveCycle(cfg) {
  cache = clean(cfg);
  await dbPut('meta', { key: KEY, value: cache });
  return cache;
}
export async function resetCycle() { return saveCycle(defaultCycle()); }
