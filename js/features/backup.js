// Export / import JSON, sauvegarde automatique, rappels
import { nextWeekKey, prevWeekKey, todayKey, weekDateKeys, weekKey, weekStartDate } from '../core/dates.js';
import { dailyGoalHours, makeGoalCtx, questGoalHours } from './work-goals.js';
import { GHOST_BEFORE, dbAll, dbAllLive, dbClear, dbDelete, dbGet, dbPut } from '../core/db.js';
import { State } from '../core/state.js';
import { awardXp } from '../core/xp.js';
import { activityXp } from './gpx.js';
import { PENALTIES_START, applyPendingPenalties, applyXpDelta, arePenaltiesActive, computeWeekPenalties, dailyWorkMalusXp, getMalusExcuses } from './penalties.js';
import { computeCountXp, computeHoursXp, recomputeAutoQuests } from './quests.js';
import { loadAll } from './seed.js';
import { runsGoalFor } from './weekly-goals.js';
import { SUBJECTS, computeWorkXp } from './work.js';
import { recomputeAllRecords, recomputeAllXp } from '../pages/sport.js';
import { el, escapeHtml, showToast } from '../ui/helpers.js';
import { iconHtml } from '../ui/icons.js';
import { markExport } from './storage.js';

// Construit le snapshot complet de l'app (utilisé par export et backup auto).
// `backups` lui-même est volontairement EXCLU pour éviter la récursion.
export async function buildSnapshot() {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    profile: await dbAll('profile'),
    quests: await dbAll('quests'),
    completions: await dbAll('completions'),
    activities: await dbAll('activities'),
    workLog: await dbAll('workLog'),
    exams: await dbAll('exams'),
    schedule: await dbAll('schedule'),
    records: await dbAll('records'),
    meta: await dbAll('meta'),
    planOverrides: await dbAll('planOverrides'),
    planTodo: await dbAll('planTodo'),
    caracHistory: await dbAll('caracHistory')
  };
}

export async function exportData() {
  const data = await buildSnapshot();
  await markExport();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `orion-backup-${todayKey()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Sauvegarde auto au premier lancement de la journée. Stockée en IndexedDB
// (store `backups`), garde les 7 dernières. Idempotent : si une sauvegarde
// du jour existe déjà, ne fait rien.
export async function maybeAutoBackup() {
  try {
    const today = todayKey();
    const existing = await dbGet('backups', today);
    if (existing) return { skipped: true };

    const snapshot = await buildSnapshot();
    const json = JSON.stringify(snapshot);
    await dbPut('backups', { date: today, json, size: json.length, createdAt: new Date().toISOString() });

    // Garde les 7 dernières sauvegardes.
    const all = await dbAll('backups');
    all.sort((a, b) => b.date.localeCompare(a.date));
    for (let i = 7; i < all.length; i++) {
      await dbDelete('backups', all[i].date);
    }
    await dbPut('meta', { key: 'lastAutoBackup', value: today });
    return { created: true, date: today, size: json.length };
  } catch (err) {
    return { error: err.message };
  }
}

// Télécharge un backup automatique précédemment stocké.
export async function downloadAutoBackup(date) {
  const b = await dbGet('backups', date);
  if (!b) return false;
  const blob = new Blob([b.json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `orion-backup-${date}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

export async function onImportFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  if (!confirm('Importer va REMPLACER toutes tes données actuelles. Continuer ?')) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data.version) throw new Error('Fichier invalide');
    for (const store of ['profile', 'quests', 'completions', 'activities', 'workLog', 'exams', 'schedule', 'records', 'meta', 'planOverrides', 'planTodo', 'caracHistory']) {
      await dbClear(store);
      const items = data[store] || [];
      for (const it of items) await dbPut(store, it);
    }
    showToast({ type: 'xp', icon: 'check', title: 'Importé', text: 'Rechargement…' }, 1500);
    setTimeout(() => location.reload(), 1500);
  } catch (err) {
    showToast({ type: 'err', title: 'Erreur', text: err.message }, 4000);
  }
}

// BILAN DE FIN DE SEMAINE
// meta `weekReportSeen` : dernière semaine dont le bilan a été affiché.
export async function buildWeekReport(wk) {
  const pen = await computeWeekPenalties(wk);
  const [quests, completions, sched, excuses] = await Promise.all([
    dbAll('quests'), dbAll('completions'), dbAll('schedule'), getMalusExcuses()
  ]);
  // Malus quotidiens du travail (jours évalués, à partir de PENALTIES_START).
  const gctx = await makeGoalCtx();
  let dailyMalus = 0;
  const today = todayKey();
  for (const dk of weekDateKeys(wk)) {
    if (dk >= today || dk < PENALTIES_START) continue;
    const goalHours = await dailyGoalHours(dk, gctx);
    dailyMalus += dailyWorkMalusXp(await dbGet('workLog', dk), goalHours);
  }
  const bonusXp = pen.bonuses.reduce((a, b) => a + b.xp, 0);
  const malusTotal = dailyMalus + pen.malusXp + pen.selfXp;
  const net = pen.weekXp - malusTotal + bonusXp;
  const list = quests.map(q => {
    const c = completions.find(x => x.questId === q.id && x.weekKey === wk);
    const ratio = c?.ratio || 0;
    return { q, ratio, ok: ratio >= 1, excused: !!excuses[`${wk}|${q.id}`], bonus: pen.bonuses.find(b => b.questId === q.id)?.xp || 0 };
  }).sort((a, b) => (a.q.category === 'main' ? 0 : 1) - (b.q.category === 'main' ? 0 : 1));
  return { wk, gained: pen.weekXp, dailyMalus, weeklyMalus: pen.malusXp, selfMalus: pen.selfXp, bonusXp, malusTotal, net, list, okCount: list.filter(x => x.ok).length };
}

export async function showWeekReport(wk) {
  const r = await buildWeekReport(wk);
  const prev = await buildWeekReport(prevWeekKey(wk));
  const chk = (await dbGet('meta', 'xpCheckResult'))?.value;
  const chkTxt = !chk ? '' : chk.diff === 0 ? 'XP vérifiée : tout est cohérent'
    : `XP vérifiée : écart de ${chk.diff > 0 ? '+' : '−'}${Math.abs(chk.diff)} corrigé`;
  const ws = weekStartDate(wk);
  const we = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + 6);
  const fd = (d) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  const sign = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n);
  const hasPrev = prev.gained > 0 || prev.malusTotal > 0 || prev.list.some(x => x.ratio > 0);
  const dNet = r.net - prev.net, dOk = r.okCount - prev.okCount;
  const overlay = el('div', { class: 'gpx-preview-overlay' });
  const modal = el('div', { class: 'gpx-preview-modal' });
  const rows = r.list.map(x => `
    <div class="rg-row wr-quest">
      <span class="wr-ico">${x.q.icon ? iconHtml(x.q.icon) : '•'}</span>
      <span class="rg-reason">${escapeHtml(x.q.title)}${x.excused ? ' <span class="dim text-xs">(justifiée)</span>' : ''}</span>
      <span class="mono text-xs ${x.ok ? 'wr-ok' : 'wr-ko'}">${Math.round(x.ratio * 100)}% ${iconHtml(x.ok ? 'tick' : 'close')}</span>
    </div>`).join('');
  modal.innerHTML = `
    <div class="gpx-preview-head">
      <div class="gpx-preview-title"><span class="gpx-preview-icon">${iconHtml('chart')}</span><span>Bilan · ${fd(ws)} – ${fd(we)}</span></div>
      <button class="gpx-preview-close" aria-label="Fermer">${iconHtml('close')}</button>
    </div>
    <div style="padding: 16px 18px; overflow-y: auto;">
      <div class="wr-net grad-text">${sign(r.net)} XP</div>
      <div class="dim text-xs" style="text-align:center;">net sur la semaine</div>
      <div class="wr-grid">
        <div><div class="dim text-xs">Gagné</div><div class="mono">+${r.gained}</div></div>
        <div><div class="dim text-xs">Malus</div><div class="mono ${r.malusTotal ? 'wr-ko' : ''}">${r.malusTotal ? '−' + r.malusTotal : '0'}</div></div>
        <div><div class="dim text-xs">Bonus</div><div class="mono">${r.bonusXp ? '+' + r.bonusXp : '0'}</div></div>
      </div>
      ${r.malusTotal ? `<div class="dim text-xs mt-1">Détail malus : travail quotidien −${r.dailyMalus} · quêtes −${r.weeklyMalus} ${r.selfMalus ? `· rigueur −${r.selfMalus}` : ''}</div>` : ''}
      <div class="wr-title">Quêtes · ${r.okCount}/${r.list.length} réussies</div>
      <div class="rg-list">${rows}</div>
      <div class="wr-title">Vs semaine précédente</div>
      ${hasPrev ? `<div class="rg-row"><span class="rg-reason">XP net</span><span class="mono text-xs">${sign(prev.net)} → ${sign(r.net)} (${sign(dNet)})</span></div>
      <div class="rg-row" style="margin-top:6px;"><span class="rg-reason">Quêtes réussies</span><span class="mono text-xs">${prev.okCount} → ${r.okCount} (${sign(dOk)})</span></div>`
        : '<div class="dim text-xs">Pas de semaine précédente à comparer.</div>'}
      ${chkTxt ? `<div class="dim text-xs mt-3" style="text-align:center;">${chkTxt}</div>` : ''}
      <button class="btn primary sm mt-3 wr-close" style="width:100%;">Fermer</button>
    </div>`;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  modal.querySelector('.gpx-preview-close').addEventListener('click', close);
  modal.querySelector('.wr-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}

// Au lancement : si la semaine précédente vient d'être évaluée et que son bilan n'a pas été vu.
// ── Vérification hebdomadaire de l'XP ────────────────────────────────────────
// computeExpectedXp() : recalcule, SANS rien écrire, l'XP totale attendue d'après les
// données (activités, travail, complétions, malus/bonus déjà appliqués). Même logique que
// recomputeAllXp(), mais en lecture seule.
export async function computeExpectedXp() {
  const gctx = await makeGoalCtx();
  let total = 0;
  for (const a of await dbAllLive('activities')) total += activityXp(a, a.type || 'footing').xp || 0;
  for (const l of await dbAllLive('workLog')) {
    const totalMin = Object.values(l.bySubject || {}).reduce((s, m) => s + m, 0);
    if (totalMin > 0) total += computeWorkXp(totalMin, l.goalHours || 0).xp || 0;
  }
  const quests = await dbAll('quests');
  for (const c of await dbAllLive('completions')) {
    const q = quests.find(x => x.id === c.questId);
    if (!q) continue;
    const value = c.actualValue || 0;
    total += (q.type === 'weekly-hours'
      ? computeHoursXp(value, await questGoalHours(q, c.weekKey, gctx))
      : computeCountXp(value, q.id === 'wq-runs' ? await runsGoalFor(c.weekKey, q) : q.goalCount)).xp || 0;
  }
  if (arePenaltiesActive()) {
    // Malus quotidiens déjà appliqués (jusqu'à lastDailyPenalty inclus).
    const lastDaily = (await dbGet('meta', 'lastDailyPenalty'))?.value || '';
    const sched = await dbAll('schedule');
    for (const l of await dbAllLive('workLog')) {
      // Comme applyPendingPenalties : le jour PENALTIES_START lui-même n'est jamais évalué (le curseur démarre le lendemain).
      if (!l.date || l.date <= PENALTIES_START || l.date > lastDaily) continue;
      total -= dailyWorkMalusXp(l, await dailyGoalHours(l.date, gctx));
    }
    // Jours planifiés sans aucune saisie (malus sur 0 XP gagné = 0) : rien à retirer.
    // Malus / rigueur / bonus des semaines déjà évaluées.
    const lastWeekly = (await dbGet('meta', 'lastWeeklyPenalty'))?.value || '';
    const startWk = weekKey(new Date(PENALTIES_START + 'T00:00:00'));
    for (let wk = startWk; lastWeekly && wk <= lastWeekly; wk = nextWeekKey(wk)) {
      const pen = await computeWeekPenalties(wk);
      total -= pen.malusXp + pen.selfXp;
      total += pen.bonuses.reduce((a, b) => a + b.xp, 0);
    }
  }
  return Math.max(0, Math.round(total));
}

// Une fois par semaine (meta `xpCheckWeek`) : compare l'XP du profil à l'XP attendue.
// Si un écart existe, le total est corrigé et l'écart est mémorisé (meta `xpCheckResult`).
// ── Intégration unique des données du 15 au 31 août 2026 ─────────────────────
// Ces données étaient « fantômes » (XP à 0 / non comptées). Une seule fois (meta
// `augustIntegrated`), on leur accorde l'XP, on recalcule les quêtes des semaines concernées,
// les records et le VDOT. Les semaines à partir du 1er septembre ne sont pas recalculées
// (sauf la semaine du 31 août, dont la quête change car le 31 août devient compté).
export const AUGUST_END = '2026-09-01';

export async function integrateAugustData() {
  if ((await dbGet('meta', 'augustIntegrated'))?.value) return null;
  if (!State.profile) return null;
  const inRange = (d) => { const k = String(d || '').slice(0, 10); return k >= GHOST_BEFORE && k < AUGUST_END; };
  const before = Math.round(State.profile.totalXp);
  const counts = { activities: 0, workLogs: 0, completions: 0 };

  // 1) Activités
  const acts = (await dbAll('activities')).filter(a => inRange(a.date)).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  for (const a of acts) {
    const { xp, skills } = activityXp(a, a.type || 'footing');
    a.xpAwarded = xp; a.skillsAwarded = skills;
    await dbPut('activities', a);
    if (xp > 0) await awardXp(xp, skills);
    counts.activities++;
  }
  // 2) Travail (même formule que recomputeAllXp)
  const logs = (await dbAll('workLog')).filter(l => inRange(l.date)).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  for (const l of logs) {
    const bySubject = l.bySubject || {};
    const totalMin = Object.values(bySubject).reduce((s, m) => s + m, 0);
    if (totalMin === 0) { l.lastXpAwarded = 0; l.lastSkillsAwarded = {}; await dbPut('workLog', l); continue; }
    const { xp: newXp } = computeWorkXp(totalMin, l.goalHours || 0);
    const sk = {};
    for (const [subj, mins] of Object.entries(bySubject)) {
      const meta = SUBJECTS[subj];
      if (!meta) continue;
      sk[meta.skill] = (sk[meta.skill] || 0) + Math.round(newXp * (mins / totalMin) * (meta.skillMult ?? 0.6));
    }
    sk.discipline = (sk.discipline || 0) + Math.round(newXp * 0.04);
    l.lastXpAwarded = newXp; l.lastSkillsAwarded = sk;
    await dbPut('workLog', l);
    if (newXp > 0) await awardXp(newXp, sk);
    counts.workLogs++;
  }
  // 3) Quêtes : les complétions datées d'août n'ont jamais été comptées → on repart de 0 XP
  //    puis recomputeAutoQuests accorde l'XP complète de chaque semaine.
  for (const c of (await dbAll('completions')).filter(c => inRange(c.date))) {
    c.lastXp = 0; c.lastSkillsXp = {}; c.xp = 0; c.skills = {};
    await dbPut('completions', c);
    counts.completions++;
  }
  const lastWk = weekKey(new Date(AUGUST_END + 'T12:00:00'));
  for (let wk = weekKey(new Date(GHOST_BEFORE + 'T12:00:00')); wk <= lastWk; wk = nextWeekKey(wk)) {
    await recomputeAutoQuests(wk);
  }
  // 4) Records et VDOT (le VDOT se déduit des activités rechargées)
  await recomputeAllRecords();
  await loadAll();
  const after = Math.round(State.profile.totalXp);
  const res = { before, after, delta: after - before, counts, at: new Date().toISOString() };
  await dbPut('meta', { key: 'augustIntegration', value: res });
  await dbPut('meta', { key: 'augustIntegrated', value: true });
  return res;
}

export async function weeklyXpCheck() {
  const wk = weekKey();
  if ((await dbGet('meta', 'xpCheckWeek'))?.value === wk) return;
  if (!State.profile) return;
  const expected = await computeExpectedXp();
  const actual = Math.round(State.profile.totalXp);
  const diff = actual - expected;
  if (diff !== 0) {
    await applyXpDelta(-diff, {});
    await loadAll();
  }
  await dbPut('meta', { key: 'xpCheckResult', value: { wk, diff, actual, expected } });
  await dbPut('meta', { key: 'xpCheckWeek', value: wk });
}

export async function showWeekReportIfDue() {
  if (!arePenaltiesActive()) return;
  const wk = prevWeekKey(weekKey());
  if (wk < weekKey(new Date(PENALTIES_START + 'T00:00:00'))) return;
  const lastWeekly = (await dbGet('meta', 'lastWeeklyPenalty'))?.value || '';
  const seen = (await dbGet('meta', 'weekReportSeen'))?.value || '';
  if (lastWeekly < wk || seen >= wk) return;
  await dbPut('meta', { key: 'weekReportSeen', value: wk });
  await showWeekReport(wk);
}

// RAPPELS (notifications locales)
// meta `reminders` : { work: {on, time}, sleep: {on, time}, lastFired: { work: 'YYYY-MM-DD', sleep: ... } }
// Sans serveur push, l'app ne peut notifier QUE lorsqu'elle est ouverte (ou en arrière-plan récent).
// Notifications personnalisées (meta `customReminders`) : [{ id, label, time, daily, date, lastFired }].
export const REMINDER_DEFS = {
  work:  { icon: 'books', label: 'Saisir le travail du jour', title: 'Orion · Travail', body: "N'oublie pas de saisir ton travail d'aujourd'hui.", def: '21:30' },
  sleep: { icon: 'moon', label: 'Se coucher avant 23h30', title: 'Orion · Sommeil', body: 'Il est temps de se préparer : couché avant 23h30.', def: '22:45' },
};

export const REMINDER_WINDOW_MIN = 90;   // rattrapage : on déclenche jusqu'à 90 min après l'heure prévue

export async function getReminders() {
  const v = (await dbGet('meta', 'reminders'))?.value || {};
  const out = { lastFired: v.lastFired || {} };
  for (const k of Object.keys(REMINDER_DEFS)) out[k] = { on: !!v[k]?.on, time: v[k]?.time || REMINDER_DEFS[k].def };
  return out;
}

export async function saveReminders(r) { await dbPut('meta', { key: 'reminders', value: r }); }

export function timeToMin(t) { const [h, m] = String(t).split(':').map(Number); return (h || 0) * 60 + (m || 0); }

async function notify({ icon, title, body, tag }) {
  showToast({ type: 'xp', icon, title: title.replace('Orion · ', ''), text: body }, 6000);
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      const opts = { body, icon: 'icons/orion-192.png', badge: 'icons/badge.png', tag };
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg?.showNotification) await reg.showNotification(title, opts);
      else new Notification(title, opts);
    }
  } catch (e) { /* silencieux */ }
}

export async function showReminderNotification(kind) {
  const d = REMINDER_DEFS[kind];
  await notify({ icon: d.icon, title: d.title, body: d.body, tag: 'orion-' + kind });
}

export async function getCustomReminders() {
  const v = (await dbGet('meta', 'customReminders'))?.value;
  return Array.isArray(v) ? v : [];
}
export async function saveCustomReminders(list) { await dbPut('meta', { key: 'customReminders', value: list }); }

// Vérifie si un rappel doit partir maintenant (appelé au lancement, au retour au premier plan et toutes les 30 s).
export async function checkReminders() {
  const r = await getReminders();
  const now = new Date();
  const today = todayKey(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  let changed = false;
  for (const kind of Object.keys(REMINDER_DEFS)) {
    const c = r[kind];
    if (!c.on || r.lastFired[kind] === today) continue;
    const t = timeToMin(c.time);
    if (nowMin < t || nowMin > t + REMINDER_WINDOW_MIN) continue;
    r.lastFired[kind] = today; changed = true;
    if (kind === 'work') {
      const log = await dbGet('workLog', today);
      if ((log?.totalMinutes || 0) > 0) continue;   // déjà saisi : pas de rappel
    }
    await showReminderNotification(kind);
  }
  if (changed) await saveReminders(r);

  // Notifications personnalisées : une seule fois (à la date prévue) ou tous les jours.
  const list = await getCustomReminders();
  const keep = []; let listChanged = false;
  for (const c of list) {
    const t = timeToMin(c.time);
    const inWindow = nowMin >= t && nowMin <= t + REMINDER_WINDOW_MIN;
    if (c.daily) {
      if (c.lastFired !== today && inWindow) { c.lastFired = today; listChanged = true; await notify({ icon: 'bell', title: 'Orion · ' + c.label, body: c.label, tag: 'orion-c-' + c.id }); }
      keep.push(c);
    } else if (c.date === today && inWindow) {
      listChanged = true; await notify({ icon: 'bell', title: 'Orion · ' + c.label, body: c.label, tag: 'orion-c-' + c.id });
    } else if (c.date < today || (c.date === today && nowMin > t + REMINDER_WINDOW_MIN)) {
      listChanged = true;   // date passée : on la retire sans notifier
    } else keep.push(c);
  }
  if (listChanged) await saveCustomReminders(keep);
}

export let _reminderTimer = null;

export function startReminderLoop() {
  if (_reminderTimer) return;
  checkReminders().catch(() => {});
  _reminderTimer = setInterval(() => checkReminders().catch(() => {}), 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkReminders().catch(() => {}); });
}

// Fenêtre « Ajouter une notification » : motif + heure (+ répétition quotidienne).
const NOTIF_MOTIFS = ['Saisir mon travail', 'Se coucher', 'Sortie running', 'Réviser', 'Préparer une colle', 'Rendre un devoir'];

function openNotificationModal(onAdded) {
  const overlay = el('div', { class: 'gpx-preview-overlay' });
  const modal = el('div', { class: 'gpx-preview-modal' });
  const nextHour = new Date(Date.now() + 3600e3);
  const defTime = `${String(nextHour.getHours()).padStart(2, '0')}:00`;
  modal.innerHTML = `
    <div class="gpx-preview-head">
      <div class="gpx-preview-title"><span class="gpx-preview-icon">${iconHtml('bell')}</span><span>Nouvelle notification</span></div>
      <button class="gpx-preview-close" aria-label="Fermer">${iconHtml('close')}</button>
    </div>
    <div style="padding: 16px 18px; overflow-y: auto;">
      <div class="dim text-xs mb-1">Motif</div>
      <input class="input nt-label" type="text" maxlength="60" placeholder="Ex. : Réviser les séries" style="width:100%;" />
      <div class="nt-chips mt-2">${NOTIF_MOTIFS.map(m => `<button type="button" class="nt-chip">${m}</button>`).join('')}</div>
      <div class="dim text-xs mb-1 mt-3">Heure</div>
      <input class="input nt-time" type="time" value="${defTime}" style="color-scheme: dark;" />
      <label class="nt-daily mt-3"><input class="nt-daily-on" type="checkbox" /> Répéter tous les jours</label>
      <div class="dim text-xs mt-2 nt-err" style="color:#c4584a;"></div>
      <div class="cs-actions">
        <button class="btn ghost nt-cancel">Annuler</button>
        <button class="btn primary nt-ok">Ajouter</button>
      </div>
    </div>`;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  const input = modal.querySelector('.nt-label');
  modal.querySelectorAll('.nt-chip').forEach(b => b.addEventListener('click', () => { input.value = b.textContent; input.focus(); }));
  modal.querySelector('.gpx-preview-close').addEventListener('click', close);
  modal.querySelector('.nt-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  modal.querySelector('.nt-ok').addEventListener('click', async () => {
    const label = input.value.trim();
    const time = modal.querySelector('.nt-time').value;
    if (!label) { modal.querySelector('.nt-err').textContent = 'Choisis ou écris un motif.'; return; }
    if (!time) { modal.querySelector('.nt-err').textContent = 'Choisis une heure.'; return; }
    const daily = modal.querySelector('.nt-daily-on').checked;
    const now = new Date();
    const when = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (now.getHours() * 60 + now.getMinutes() < timeToMin(time) ? 0 : 1));
    const list = await getCustomReminders();
    list.push({ id: Date.now().toString(36), label, time, daily, date: todayKey(when) });
    await saveCustomReminders(list);
    if ('Notification' in window && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch (e) {} }
    close();
    showToast({ type: 'xp', icon: 'bell', title: 'Notification ajoutée', text: `${label} · ${time}${daily ? ' · tous les jours' : ''}` }, 3000);
    onAdded?.();
    checkReminders().catch(() => {});
  });
}

export async function renderRemindersCard(card) {
  const r = await getReminders();
  const custom = await getCustomReminders();
  const perm = ('Notification' in window) ? Notification.permission : 'unsupported';
  const permTxt = perm === 'granted' ? 'Notifications autorisées' : perm === 'denied' ? 'Notifications bloquées : autorise-les pour ce site dans les réglages du téléphone ou du navigateur' : perm === 'unsupported' ? 'Notifications non disponibles ici' : 'Notifications non autorisées';
  card.innerHTML = `
    <div class="rem-list">
      ${Object.keys(REMINDER_DEFS).map(k => `
        <div class="rg-row rem-row" data-kind="${k}">
          <span class="rg-reason">${iconHtml(REMINDER_DEFS[k].icon)} ${REMINDER_DEFS[k].label}</span>
          <input class="input rem-time" type="time" value="${r[k].time}" />
          <input class="rem-on" type="checkbox" ${r[k].on ? 'checked' : ''} aria-label="Activer" />
        </div>`).join('')}
      ${custom.map(c => `
        <div class="rg-row rem-row" data-cid="${c.id}">
          <span class="rg-reason">${iconHtml('bell')} ${escapeHtml(c.label)}</span>
          <span class="mono text-xs dim">${c.time}${c.daily ? ' · chaque jour' : ''}</span>
          <button class="btn ghost sm rem-del" aria-label="Supprimer">${iconHtml('close')}</button>
        </div>`).join('')}
    </div>
    <div class="dim text-xs mt-2">${permTxt}.</div>
    <div class="save-actions mt-2">
      ${perm === 'default' ? '<button class="btn ghost sm" id="rem-perm">Autoriser les notifications</button>' : ''}
      <button class="add-btn" id="rem-add"><span class="add-plus">+</span> Ajouter une notification</button>
    </div>
  `;
  card.querySelectorAll('.rem-row[data-kind]').forEach(row => {
    const k = row.dataset.kind;
    const save = async () => {
      const cur = await getReminders();
      cur[k].on = row.querySelector('.rem-on').checked;
      cur[k].time = row.querySelector('.rem-time').value || REMINDER_DEFS[k].def;
      delete cur.lastFired[k];
      await saveReminders(cur);
      if (cur[k].on && 'Notification' in window && Notification.permission === 'default') {
        try { await Notification.requestPermission(); } catch (e) {}
        renderRemindersCard(card);
      }
      checkReminders().catch(() => {});
    };
    row.querySelectorAll('input').forEach(i => i.addEventListener('change', save));
  });
  card.querySelector('#rem-perm')?.addEventListener('click', async () => {
    try { await Notification.requestPermission(); } catch (e) {}
    renderRemindersCard(card);
  });
  card.querySelector('#rem-add').addEventListener('click', () => openNotificationModal(() => renderRemindersCard(card)));
  card.querySelectorAll('.rem-del').forEach(btn => btn.addEventListener('click', async () => {
    const id = btn.closest('.rem-row').dataset.cid;
    await saveCustomReminders((await getCustomReminders()).filter(c => c.id !== id));
    renderRemindersCard(card);
  }));
}
