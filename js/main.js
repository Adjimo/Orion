// Point d'entrée : splash et initialisation
import { GHOST_BEFORE, dbGet, dbPut } from './core/db.js';
import { integrateAugustData, maybeAutoBackup, showWeekReportIfDue, startReminderLoop, weeklyXpCheck } from './features/backup.js';
import { ensureTodo } from './features/todo.js';
import { applyPendingPenalties } from './features/penalties.js';
import { recomputeAutoQuests } from './features/quests.js';
import { initSeed, loadAll } from './features/seed.js';
import { migrateSleepCounter } from './features/weekly-goals.js';
import { recomputeAllRecords, recomputeAllXp } from './pages/sport.js';
import { showToast } from './ui/helpers.js';
import { navigate } from './ui/router.js';

export function showSplash() {
  const splash = document.getElementById('splash');
  const content = splash.querySelector('.splash-content');
  setTimeout(() => content.classList.add('show'), 50);
  setTimeout(() => splash.classList.add('fade-out'), 900);
  setTimeout(() => splash.classList.add('hidden'), 1300);
  splash.addEventListener('click', () => {
    splash.classList.add('fade-out');
    setTimeout(() => splash.classList.add('hidden'), 250);
  });
}

export async function init() {
  showSplash();
  await initSeed();
  await loadAll();

  // Bascule « données fantômes » : une seule fois, on recalcule XP, niveaux et
  // records en ignorant tout ce qui précède GHOST_BEFORE (rien n'est supprimé).
  // Le recalcul global ne tourne qu'une seule fois (installation sans flag). Quand GHOST_BEFORE
  // recule (1er sept. → 15 août), c'est integrateAugustData() qui s'en charge, sans tout refaire.
  const ghostFlag = await dbGet('meta', 'ghostCutoffApplied');
  if (!ghostFlag?.value) {
    try {
      await recomputeAllXp();
      await recomputeAllRecords();
      await dbPut('meta', { key: 'ghostCutoffApplied', value: GHOST_BEFORE });
      await dbPut('meta', { key: 'augustIntegrated', value: true });   // déjà inclus dans ce recalcul
      await loadAll();
    } catch (err) { console.error('Ghost recompute failed', err); }
  }
  try {
    const aug = await integrateAugustData();
    if (aug) showToast({ type: 'xp', title: 'Données du 15 août intégrées', text: `XP ${aug.before} → ${aug.after} (${aug.delta >= 0 ? '+' : '−'}${Math.abs(aug.delta)})` }, 7000);
  } catch (err) { console.error('August integration failed', err); }
  await migrateSleepCounter();
  await recomputeAutoQuests();

  // Applique les malus/bonus pour les jours/semaines déjà passés depuis la rentrée.
  const tick = await applyPendingPenalties();
  await loadAll();
  try { await weeklyXpCheck(); } catch (err) { console.error('XP check failed', err); }

  // To-do du Planning : génération de la semaine et report des éléments non cochés.
  await ensureTodo();

  // Sauvegarde automatique : 1× par jour au premier lancement.
  // Silencieuse : on ne notifie que si elle a réellement créé un snapshot.
  maybeAutoBackup().catch(() => {});

  document.getElementById('app').classList.remove('hidden');
  document.getElementById('tabbar').classList.remove('hidden');

  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => navigate(t.dataset.route));
  });

  navigate('home');
  startReminderLoop();
  setTimeout(() => showWeekReportIfDue().catch(() => {}), 1200);

  // Si des malus/bonus viennent d'être appliqués, le signaler.
  if (tick?.applied?.length) {
    const totalMalus = tick.applied.filter(a => a.kind !== 'weekly-bonus').reduce((s, a) => s + a.xp, 0);
    const totalBonus = tick.applied.filter(a => a.kind === 'weekly-bonus').reduce((s, a) => s + a.xp, 0);
    setTimeout(() => {
      showToast({
        type: 'xp',
        title: 'Bilan période',
        text: (totalBonus > 0 ? `+${totalBonus} XP bonus` : '') +
              (totalBonus > 0 && totalMalus > 0 ? ' · ' : '') +
              (totalMalus > 0 ? `−${totalMalus} XP malus` : '')
      }, 4500);
    }, 1500);
  }
}

document.addEventListener('DOMContentLoaded', init);

document.addEventListener('DOMContentLoaded', init);
