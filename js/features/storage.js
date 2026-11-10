// Protection des données : stockage persistant et rappel d'export
import { todayKey } from '../core/dates.js';
import { dbGet, dbPut } from '../core/db.js';
import { State } from '../core/state.js';

const REMINDER_AFTER_DAYS = 14;

// Demande au navigateur de ne pas effacer les données d'Orion quand l'espace manque.
export async function ensurePersistentStorage() {
  if (!navigator.storage?.persist) return false;
  let persisted = await navigator.storage.persisted();
  if (!persisted) persisted = await navigator.storage.persist();
  await dbPut('meta', { key: 'storagePersisted', value: persisted });
  return persisted;
}

export async function storageStatus() {
  const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : false;
  const lastExport = (await dbGet('meta', 'lastExport'))?.value || null;
  return { persisted, lastExport };
}

export async function markExport() {
  await dbPut('meta', { key: 'lastExport', value: todayKey() });
}

// Nombre de jours depuis le dernier export JSON (null = jamais exporté).
export function daysSince(dateKey) {
  if (!dateKey) return null;
  return Math.floor((new Date(todayKey() + 'T12:00:00') - new Date(dateKey + 'T12:00:00')) / 86400000);
}

// Renvoie un message de rappel (au plus une fois par jour) si l'export JSON est ancien.
export async function backupReminder() {
  if (!(State.profile?.totalXp > 0)) return null;
  const today = todayKey();
  if ((await dbGet('meta', 'backupNagDay'))?.value === today) return null;
  const last = (await dbGet('meta', 'lastExport'))?.value || null;
  const days = daysSince(last);
  if (days !== null && days < REMINDER_AFTER_DAYS) return null;
  await dbPut('meta', { key: 'backupNagDay', value: today });
  return {
    title: 'Pense à exporter tes données',
    text: (days === null ? 'Aucun export pour l\'instant' : `Dernier export il y a ${days} jours`) + ' · Profil → Exporter'
  };
}
