// Éléments récurrents de la to-do : jours de la semaine, fréquence (toutes les N semaines), activables / supprimables.
// meta `todoRecur` : { v:1, items:[{ id, label, subj, days:[1..7], every, anchor, enabled, noCarry, cond, legacyKey }] }
// Par défaut : Vocabulaire, Grammaire (semaines de colle d'anglais), Sciences de l'ingénieur (= les anciens éléments fixes).
import { dbGet, dbPut } from '../core/db.js';
import { mondayOf, parseKey } from '../core/calendar.js';
import { todayKey } from '../core/dates.js';
import { ANGLAIS_FIXED, DEFAULT_VOCAB_DAYS, SI_LABEL } from './todo-data.js';

const KEY = 'todoRecur';
let cache = null;

export function defaultRecur() {
  const anchor = mondayOf(todayKey());
  return {
    v: 1,
    items: [
      { id: 'vocab', label: ANGLAIS_FIXED.vocab, subj: 'anglais', days: [...DEFAULT_VOCAB_DAYS], every: 1, anchor, enabled: true, noCarry: true },
      { id: 'gram', label: ANGLAIS_FIXED.gram, subj: 'anglais', days: [6], every: 1, anchor, enabled: true, noCarry: false, cond: 'colle', legacyKey: 'anglais:gram' },
      { id: 'si', label: SI_LABEL, subj: 'si', days: [5], every: 1, anchor, enabled: true, noCarry: false, legacyKey: 'si:main' }
    ]
  };
}

function clean(v) {
  const base = v && Array.isArray(v.items) ? v : defaultRecur();
  return {
    v: 1,
    items: base.items.map(r => ({
      id: String(r.id), label: String(r.label || 'Élément'), subj: String(r.subj || 'autre'),
      days: [...new Set((r.days || []).map(Number).filter(d => d >= 1 && d <= 7))].sort((a, b) => a - b),
      every: Math.max(1, Math.min(12, Math.round(Number(r.every) || 1))), anchor: r.anchor || mondayOf(todayKey()),
      enabled: r.enabled !== false, noCarry: r.noCarry !== false, cond: r.cond || null, legacyKey: r.legacyKey || null
    }))
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
  const n = Math.round((parseKey(monday) - parseKey(r.anchor)) / 604800000);
  return (((n % r.every) + r.every) % r.every) === 0;
}
