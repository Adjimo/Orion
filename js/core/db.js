// Couche IndexedDB

export const DB_NAME = 'orion';

export const DB_VERSION = 4;

export let _db;

export function openDB() {
  return new Promise((resolve, reject) => {
    if (_db) return resolve(_db);
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('profile'))     db.createObjectStore('profile', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('quests'))      db.createObjectStore('quests', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('completions')) db.createObjectStore('completions', { keyPath: 'id', autoIncrement: true });
      if (!db.objectStoreNames.contains('activities'))  db.createObjectStore('activities', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('workLog'))     db.createObjectStore('workLog', { keyPath: 'date' });
      if (!db.objectStoreNames.contains('exams'))       db.createObjectStore('exams', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('schedule'))    db.createObjectStore('schedule', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('records'))     db.createObjectStore('records', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta'))        db.createObjectStore('meta', { keyPath: 'key' });
      // v3 : store dédié aux backups quotidiens automatiques. Clé = date YYYY-MM-DD.
      if (!db.objectStoreNames.contains('backups'))     db.createObjectStore('backups', { keyPath: 'date' });
      // v4 : page Planning (modifications d'emploi du temps, to-do hebdomadaire).
      if (!db.objectStoreNames.contains('planOverrides')) db.createObjectStore('planOverrides', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('planTodo'))      db.createObjectStore('planTodo', { keyPath: 'id' });
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
  });
}

export function tx(storeName, mode = 'readonly') {
  return openDB().then(db => db.transaction(storeName, mode).objectStore(storeName));
}

export async function dbGet(store, key) {
  const s = await tx(store);
  return new Promise((resolve, reject) => {
    const r = s.get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function dbAll(store) {
  const s = await tx(store);
  return new Promise((resolve, reject) => {
    const r = s.getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
}

export async function dbPut(store, value) {
  const s = await tx(store, 'readwrite');
  return new Promise((resolve, reject) => {
    const r = s.put(value);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function dbDelete(store, key) {
  const s = await tx(store, 'readwrite');
  return new Promise((resolve, reject) => {
    const r = s.delete(key);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

export async function dbClear(store) {
  const s = await tx(store, 'readwrite');
  return new Promise((resolve, reject) => {
    const r = s.clear();
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

// ── Données « fantômes » : tout ce qui précède le 15 août 2026 reste
// stocké en base (export, sauvegardes) mais n'est jamais affiché ni compté
// (niveaux, XP, heures, stats, records, VDOT...). Les lectures « live » passent
// par dbAllLive() ; seules les sauvegardes lisent la base complète.
export const GHOST_BEFORE = '2026-08-15';

export function isGhostDate(dateStr) {
  return !!dateStr && String(dateStr).slice(0, 10) < GHOST_BEFORE;
}

export async function dbAllLive(store) {
  const rows = await dbAll(store);
  return rows.filter(r => !isGhostDate(r.date));
}
