// Éléments récurrents de la to-do : jours de la semaine, fréquence (toutes les N semaines), activables / supprimables.
// meta `todoRecur` : { v:2, items:[{ id, label, subj, days:[1..7], every, phase, anchor, enabled, noCarry, cond, legacyKey }] }
// Par défaut : Vocabulaire, Grammaire (semaines de colle d'anglais), Sciences de l'ingénieur, puis (v2) les éléments d'anglais et de français.
// `phase` ('A' | 'B') : quand `every` = 2, choisit laquelle des deux semaines porte l'élément (semaines A/B alternées depuis AB_REF).
import { dbGet, dbPut } from '../core/db.js';
import { mondayOf, parseKey } from '../core/calendar.js';
import { todayKey } from '../core/dates.js';
import { WORK_IDS } from './competences.js';
import { ANGLAIS_FIXED, DEFAULT_VOCAB_DAYS, SI_LABEL } from './todo-data.js';

const KEY = 'todoRecur';
let cache = null;

// Semaine de référence A : toutes les semaines paires depuis ce lundi sont des semaines A, les autres des semaines B.
export const AB_REF = '2026-01-05';
export const weekParity = (monday) => (((Math.round((parseKey(monday) - parseKey(AB_REF)) / 604800000) % 2) + 2) % 2) === 0 ? 'A' : 'B';

// Éléments d'anglais et de français (v4.48) : alternance A/B le dimanche, actualités chaque samedi.
const movedDefaults = (anchor) => [
  { id: 'ang-mines', label: 'Entraînement DS Mines-Ponts', subj: 'anglais', days: [7], every: 2, phase: 'A', anchor, enabled: true, noCarry: false },
  { id: 'ang-centrale', label: 'Entraînement DS Centrale', subj: 'anglais', days: [7], every: 2, phase: 'B', anchor, enabled: true, noCarry: false },
  { id: 'ang-actus', label: 'Revoir les actualités de la semaine', subj: 'anglais', days: [6], every: 1, phase: null, anchor, enabled: true, noCarry: false },
  { id: 'fr-ds', label: 'Entraînement DS', subj: 'francais', days: [7], every: 2, phase: 'A', anchor, enabled: true, noCarry: false },
  { id: 'fr-oral', label: 'Entraînement oral', subj: 'francais', days: [7], every: 2, phase: 'B', anchor, enabled: true, noCarry: false }
];

export function defaultRecur() {
  const anchor = mondayOf(todayKey());
  return {
    v: 2,
    items: [
      { id: 'vocab', label: ANGLAIS_FIXED.vocab, subj: 'anglais', days: [...DEFAULT_VOCAB_DAYS], every: 1, phase: null, anchor, enabled: true, noCarry: true },
      { id: 'gram', label: ANGLAIS_FIXED.gram, subj: 'anglais', days: [6], every: 1, phase: null, anchor, enabled: true, noCarry: false, cond: 'colle', legacyKey: 'anglais:gram' },
      { id: 'si', label: SI_LABEL, subj: 'si', days: [5], every: 1, phase: null, anchor, enabled: true, noCarry: false, legacyKey: 'si:main' },
      ...movedDefaults(anchor)
    ]
  };
}

function clean(v) {
  const base = v && Array.isArray(v.items) ? v : defaultRecur();
  const items = [...base.items];
  // Migration v2 : ajout (une seule fois) des éléments d'anglais / français déplacés depuis les cycles.
  if ((base.v || 1) < 2) for (const d of movedDefaults(mondayOf(todayKey()))) if (!items.some(r => String(r.id) === d.id)) items.push(d);
  return {
    v: 2,
    items: items.map(r => {
      const every = Math.max(1, Math.min(12, Math.round(Number(r.every) || 1)));
      return {
        id: String(r.id), label: String(r.label || 'Élément'), subj: WORK_IDS.includes(String(r.subj)) ? String(r.subj) : WORK_IDS[0],   // matière = une matière de travail
        days: [...new Set((r.days || []).map(Number).filter(d => d >= 1 && d <= 7))].sort((a, b) => a - b),
        every, phase: every === 2 && (r.phase === 'A' || r.phase === 'B') ? r.phase : null, anchor: r.anchor || mondayOf(todayKey()),
        enabled: r.enabled !== false, noCarry: r.noCarry !== false, cond: r.cond || null, legacyKey: r.legacyKey || null
      };
    })
  };
}

export async function loadRecur() { if (!cache) cache = clean((await dbGet('meta', KEY))?.value); return cache; }
export const recurNow = () => cache || (cache = clean(null));
export async function saveRecur(cfg) { cache = clean(cfg); await dbPut('meta', { key: KEY, value: cache }); return cache; }
export const newRecurId = () => 'r' + Date.now().toString(36);

// Clé d'élément (compatible avec les anciens éléments : anglais:vocab:<jour>, anglais:gram, si:main).
export function recKey(r, day) {
  if (r.id === 'vocab') return `anglais:vocab:${day}`;
  if (r.legacyKey && r.days.length <= 1) return r.legacyKey;
  return `r:${r.id}:${day}`;
}
// La semaine `monday` tombe-t-elle sur le rythme de l'élément ? (toutes les N semaines à partir de l'ancre)
export function recurDue(r, monday) {
  if (r.every === 2 && r.phase) return weekParity(monday) === r.phase;   // semaine A / B
  const n = Math.round((parseKey(monday) - parseKey(r.anchor)) / 604800000);
  return (((n % r.every) + r.every) % r.every) === 0;
}
