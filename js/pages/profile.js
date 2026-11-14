// Page Profil
import { formatDate } from '../core/dates.js';
import { dbAll } from '../core/db.js';
import { APP_VERSION, State } from '../core/state.js';
import { storageStatus, daysSince } from '../features/storage.js';
import { downloadAutoBackup, exportData, onImportFile, renderRemindersCard } from '../features/backup.js';
import { el } from '../ui/helpers.js';
import { iconHtml } from '../ui/icons.js';

// Sections du profil (compétences, bilan, rappels, sauvegarde), affichées en bas de l'Accueil.
export function renderProfileSections(page) {
  const p = State.profile;

  // Rappels
  const fold = (icon, title) => {
    const d = el('details', { class: 'card mb-3 cs-fold opt-fold' }, [el('summary', { class: 'cs-fold-head', html: iconHtml(icon) + `<span>${title}</span>` })]);
    const body = el('div', { class: 'opt-fold-body' });
    d.appendChild(body); page.appendChild(d);
    return body;
  };
  const remCard = fold('bell', 'Rappels');
  renderRemindersCard(remCard);

  // Sauvegarde
  const saveCard = fold('disk', 'Sauvegarde');
  saveCard.innerHTML = `
    <div class="save-actions">
      <button class="btn-gpx" id="btn-export">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        <span>Exporter</span>
      </button>
      <label class="btn-gpx" id="btn-import-label">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        <span>Importer</span>
        <input type="file" accept=".json" hidden id="import-file" />
      </label>
    </div>
    <div class="dim text-xs mt-3" id="auto-backup-info">Chargement…</div>
    <div class="dim text-xs mt-3" id="storage-info"></div>
  `;
  setTimeout(async () => {
    saveCard.querySelector('#btn-export').addEventListener('click', exportData);
    saveCard.querySelector('#import-file').addEventListener('change', onImportFile);
    // État de la protection des données (stockage persistant, dernier export).
    const st = await storageStatus();
    const d = daysSince(st.lastExport);
    saveCard.querySelector('#storage-info').innerHTML =
      `Stockage protégé : <strong>${st.persisted ? 'oui' : 'non demandé ou refusé'}</strong><br>` +
      `Dernier export : <strong>${d === null ? 'jamais' : d === 0 ? 'aujourd\'hui' : 'il y a ' + d + ' j'}</strong>`;
    // Affiche la dernière sauvegarde auto.
    const infoEl = saveCard.querySelector('#auto-backup-info');
    const backups = await dbAll('backups');
    backups.sort((a, b) => b.date.localeCompare(a.date));
    if (backups.length === 0) {
      infoEl.textContent = 'Aucune sauvegarde auto pour l\'instant.';
    } else {
      const last = backups[0];
      const sizeKb = Math.round(last.size / 1024);
      const items = backups.map(b => `<button class="auto-backup-item" data-date="${b.date}">${formatDate(b.date)}</button>`).join('');
      infoEl.innerHTML = `
        Dernière sauvegarde auto : <strong>${formatDate(last.date)}</strong> · ${sizeKb} Ko<br>
        <div class="mt-2">Télécharger une sauvegarde :</div><div class="auto-backup-list">${items}</div>
      `;
      infoEl.querySelectorAll('.auto-backup-item').forEach(btn => {
        btn.addEventListener('click', async () => {
          await downloadAutoBackup(btn.dataset.date);
        });
      });
    }
  }, 0);

  // Footer version : juste l'info, discret.
  page.appendChild(el('div', {
    class: 'dim text-xs mt-5',
    style: 'text-align:center; padding-top: 12px; border-top: 1px solid var(--border);'
  }, `DailyUp v${APP_VERSION}`));

}
