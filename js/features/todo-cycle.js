// Cycle de la to-do : matières à éléments pondérés, entièrement éditables par l'utilisateur.
// meta `todoCycle` : { v:1, subjects:[{ id, label, budgetMode:'points'|'period', budget, endDate, items:[{ name, w }] }] }
//  - 'points'  : budget fixe de points par semaine ;
//  - 'period'  : le budget est recalculé chaque semaine pour finir le cycle avant `endDate`
//                (points restants du tour en cours ÷ semaines de to-do restantes).
// Par défaut : Maths et Physique, repris de todo-data.js (rien n'est perdu).
import { dbGet, dbPut } from '../core/db.js';
import { DEFAULT_CYCLE_DAYS, TODO_BUDGET, TODO_CATALOG, TODO_FIXED_SUBJECTS, TODO_SUBJECTS } from './todo-data.js';

const KEY = 'todoCycle';
let cache = null;

export function defaultCycle() {
  const lab = { maths: 'Maths', physique: 'Physique', anglais: 'Anglais', francais: 'Français' };
  return {
    v: 2,
    subjects: Object.keys(TODO_CATALOG).map(id => ({
      id, label: lab[id] || id, budgetMode: 'points', budget: TODO_BUDGET[id] || 10, endDate: null,
      items: TODO_CATALOG[id].map(c => ({ name: c.name, w: c.w }))
    }))
  };
}

function clean(v) {
  const base = v && Array.isArray(v.subjects) ? v : defaultCycle();
  // Migration v2 : anglais et français deviennent des matières à cycle (ajoutées une seule fois ; supprimables ensuite).
  if ((base.v || 1) < 2) {
    const def = defaultCycle().subjects;
    for (const id of ['anglais', 'francais']) if (!base.subjects.some(s => s.id === id)) base.subjects.push(def.find(s => s.id === id));
  }
  return {
    v: 2,
    subjects: base.subjects.map(s => ({
      id: String(s.id), label: String(s.label || 'Matière'),
      budgetMode: 'points', enabled: s.enabled !== false,
      days: [...new Set((s.days && s.days.length ? s.days : DEFAULT_CYCLE_DAYS[s.id] || [1, 2, 3, 4, 5, 6, 7]).map(Number).filter(d => d >= 1 && d <= 7))].sort((a, b) => a - b),
      budget: Math.max(1, Number(s.budget) || 10), endDate: null,
      items: (s.items || []).filter(i => i && String(i.name || '').trim()).map(i => ({ name: String(i.name).trim(), w: Math.max(1, Math.round(Number(i.w) || 1)) }))
    }))
  };
}

// Garde la liste des matières (libellés des cases et du récapitulatif) en phase avec le cycle.
function syncSubjects() {
  TODO_SUBJECTS.splice(0, TODO_SUBJECTS.length, ...cache.subjects.map(s => ({ id: s.id, label: s.label })), ...TODO_FIXED_SUBJECTS.filter(f => !cache.subjects.some(s => s.id === f.id)));
}

export async function loadCycle() {
  if (!cache) { cache = clean((await dbGet('meta', KEY))?.value); syncSubjects(); }
  return cache;
}
export const cycleNow = () => cache || (cache = clean(null), syncSubjects(), cache);

export async function saveCycle(cfg) {
  cache = clean(cfg);
  syncSubjects();
  await dbPut('meta', { key: KEY, value: cache });
  return cache;
}
export async function resetCycle() { return saveCycle(defaultCycle()); }
export const newSubjectId = () => 'c' + Date.now().toString(36);
