// Page Profil
import { formatDate, prevWeekKey, weekKey } from '../core/dates.js';
import { dbAll } from '../core/db.js';
import { APP_VERSION, State } from '../core/state.js';
import { SKILL_META, deriveLevel } from '../core/xp.js';
import { storageStatus, daysSince } from '../features/storage.js';
import { downloadAutoBackup, exportData, onImportFile, renderRemindersCard, showWeekReport } from '../features/backup.js';
import { el, progressBar } from '../ui/helpers.js';
import { iconHtml } from '../ui/icons.js';

// Sections du profil (compétences, bilan, rappels, sauvegarde), affichées en bas de l'Accueil.
export function renderProfileSections(page) {
  const p = State.profile;

  // Compétences
  page.appendChild(el('h3', { class: 'mb-2', html: iconHtml('star') + ' Compétences' }));
  const skCard = el('div', { class: 'card mb-4' });
  let skHtml = '';
  for (const [k, sk] of Object.entries(p.skills)) {
    const meta = SKILL_META[k];
    const info = deriveLevel(sk.xp);
    skHtml += `
      <div class="skill-row">
        <div class="flex between mb-1">
          <div class="flex gap-2"><span class="skill-icon">${iconHtml(meta.icon)}</span><span style="font-weight:500;">${meta.label}</span></div>
          <span class="mono text-sm" style="color:${meta.color}; font-weight:700;">Niveau ${info.level}</span>
        </div>
        ${progressBar(info.progress, 6)}
        <div class="flex between mt-1">
          <span class="text-xs mute">${meta.desc}</span>
          <span class="text-xs mute mono">${info.xpInLevel}/${info.xpToNext} XP</span>
        </div>
      </div>
    `;
  }
  skCard.innerHTML = skHtml;
  page.appendChild(skCard);

  // Bilan
  page.appendChild(el('h3', { class: 'mb-2', html: iconHtml('chart') + ' Bilan hebdo' }));
  const wrCard = el('div', { class: 'card mb-4' });
  wrCard.innerHTML = '<div class="dim text-sm mb-2">Affiché automatiquement à chaque changement de semaine.</div><button class="btn ghost sm" id="wr-open">Voir le bilan de la semaine dernière</button>';
  wrCard.querySelector('#wr-open').addEventListener('click', () => showWeekReport(prevWeekKey(weekKey())));
  page.appendChild(wrCard);

  // Rappels
  page.appendChild(el('h3', { class: 'mb-2', html: iconHtml('bell') + ' Rappels' }));
  const remCard = el('div', { class: 'card mb-4' });
  page.appendChild(remCard);
  renderRemindersCard(remCard);

  // Sauvegarde
  page.appendChild(el('h3', { class: 'mb-2', html: iconHtml('disk') + ' Sauvegarde' }));
  const saveCard = el('div', { class: 'card mb-4' });
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
  page.appendChild(saveCard);
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
        <div class="auto-backup-list">${items}</div>
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
  }, `Orion v${APP_VERSION}`));

}
