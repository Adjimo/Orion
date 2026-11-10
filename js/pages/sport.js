// Page Sport
import { formatDate, weekKey } from '../core/dates.js';
import { dbAll, dbAllLive, dbClear, dbDelete, dbPut, isGhostDate } from '../core/db.js';
import { State } from '../core/state.js';
import { awardXp, deriveLevel, removeXp } from '../core/xp.js';
import { activityTypeIcon, activityXp, analyseIntervals, defaultActivityName, detectActivityType, formatDuration, formatPace, parseGpx } from '../features/gpx.js';
import { applyPendingPenalties, withWeekRecalc } from '../features/penalties.js';
import { computeCountXp, computeHoursXp, questSkillXp, recomputeAutoQuests } from '../features/quests.js';
import { RECORD_TYPES, checkAndUpdateRecords, computeSplits, formatRecordValue, renderActivityDetailHtml } from '../features/records.js';
import { SPORT_TYPES, isRunActivity } from '../features/schedule.js';
import { loadAll } from '../features/seed.js';
import { runsGoalFor } from '../features/weekly-goals.js';
import { SUBJECTS, computeWorkXp } from '../features/work.js';
import { el, escapeHtml, showToast } from '../ui/helpers.js';
import { render } from '../ui/router.js';

export function renderSport(root) {
  const page = el('div', { class: 'page' });
  const title = el('div', { class: 'page-title' }, [el('h1', {}, 'Sport')]);
  const importLabel = el('label', {
    class: 'btn-gpx',
    title: 'Importer un fichier GPX'
  });
  importLabel.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
    <span>GPX</span>
  `;
  const fileInput = el('input', { type: 'file', accept: '.gpx', hidden: 'true' });
  fileInput.addEventListener('change', onGpxFile);
  importLabel.appendChild(fileInput);
  title.appendChild(importLabel);
  page.appendChild(title);

  if (State.activities.length === 0) {
    const empty = el('div', { class: 'card center', style: 'padding:40px; text-align:center;', html: `
      <div class="text-2xl mb-2">🏔️</div>
      <h3 class="mb-2">Aucune sortie</h3>
      <div class="dim text-sm mb-4">Importe ton premier fichier GPX.</div>
    `});
    page.appendChild(empty);
    root.appendChild(page);
    return;
  }

  if (!State.currentActivity) State.currentActivity = State.activities[0];

  // Map
  const mapWrap = el('div', { class: 'map-wrap mb-3' });
  const mapEl = el('div', { class: 'map', id: 'sport-map' });
  mapWrap.appendChild(mapEl);
  page.appendChild(mapWrap);

  // Selected activity card
  const sel = State.currentActivity;
  if (sel) {
    const typeIcon = activityTypeIcon(sel.type);
    const detailHtml = renderActivityDetailHtml(sel);
    const hasDetail = !!detailHtml && detailHtml.trim().length > 0;
    const isExpanded = !!State._detailsExpanded;
    const card = el('div', { class: 'card mb-4', html: `
      <div class="flex between mb-2">
        <div>
          <div class="text-lg" style="font-weight:600;">${typeIcon} ${escapeHtml(sel.name)}</div>
          <div class="dim text-sm">${formatDate(sel.date)} · ${SPORT_TYPES[sel.type]?.label || sel.type}</div>
        </div>
        <div class="flex gap-2">
          <button class="btn ghost sm" id="edit-act" title="Modifier">✏️</button>
          <button class="btn ghost sm danger" id="del-act">Suppr.</button>
        </div>
      </div>
      <div class="metrics">
        <div class="metric"><div class="m-val grad-text">${sel.distanceKm}</div><div class="m-lbl">km</div></div>
        <div class="metric"><div class="m-val grad-text">${sel.elevGain}</div><div class="m-lbl">m D+</div></div>
        <div class="metric"><div class="m-val grad-text">${formatDuration(sel.duration)}</div><div class="m-lbl">durée</div></div>
        <div class="metric"><div class="m-val grad-text">${formatPace(sel.avgPace)}</div><div class="m-lbl">allure</div></div>
      </div>
      ${hasDetail ? `
        <button class="details-toggle" id="details-toggle">
          <span>Détails</span>
          <span class="details-chevron">${isExpanded ? '▴' : '▾'}</span>
        </button>
        <div class="details-content ${isExpanded ? '' : 'hidden'}" id="details-content">
          ${detailHtml}
        </div>
      ` : ''}
    `});
    page.appendChild(card);
    setTimeout(() => {
      card.querySelector('#edit-act').addEventListener('click', () => editActivity(sel));
      card.querySelector('#del-act').addEventListener('click', async () => {
        if (!confirm(`Supprimer "${sel.name}" ?`)) return;
        const ok = await deleteActivity(sel);
        if (!ok) return;
        State.currentActivity = State.activities[0] || null;
        showToast({ type: 'xp', title: 'Sortie supprimée', text: `−${sel.xpAwarded || 0} XP rendus` });
        render();
      });
      const toggle = card.querySelector('#details-toggle');
      if (toggle) {
        toggle.addEventListener('click', () => {
          State._detailsExpanded = !State._detailsExpanded;
          const content = card.querySelector('#details-content');
          const chev = card.querySelector('.details-chevron');
          content.classList.toggle('hidden', !State._detailsExpanded);
          chev.textContent = State._detailsExpanded ? '▴' : '▾';
        });
      }
    }, 0);
  }

  // History : un dépliant par mois
  page.appendChild(el('h3', { class: 'mb-2' }, `Historique (${State.activities.length})`));
  const sortedActs = [...State.activities].sort((a, b) => b.date.localeCompare(a.date));
  const months = [];
  for (const a of sortedActs) {
    const ym = a.date.slice(0, 7);
    let m = months[months.length - 1];
    if (!m || m.ym !== ym) { m = { ym, acts: [] }; months.push(m); }
    m.acts.push(a);
  }
  State._monthsOpen = State._monthsOpen || {};
  const selYm = sel?.date?.slice(0, 7);
  months.forEach((m, idx) => {
    if (State._monthsOpen[m.ym] === undefined) State._monthsOpen[m.ym] = (idx === 0 || m.ym === selYm);
    const open = !!State._monthsOpen[m.ym];
    const monthName = new Date(m.ym + '-01T12:00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    const km = Math.round(m.acts.reduce((t, a) => t + (parseFloat(a.distanceKm) || 0), 0) * 10) / 10;
    const group = el('div', { class: 'month-group' });
    const head = el('button', { class: 'month-head', 'aria-expanded': String(open) });
    head.innerHTML = `<span class="month-name">${monthName.charAt(0).toUpperCase() + monthName.slice(1)}</span>
      <span class="dim text-xs">${m.acts.length} sortie${m.acts.length > 1 ? 's' : ''} · ${km} km</span>
      <span class="month-chev">${open ? '▴' : '▾'}</span>`;
    const body = el('div', { class: 'flex col gap-2 month-body' + (open ? '' : ' hidden') });
    for (const a of m.acts) {
      const ti = activityTypeIcon(a.type);
      const btn = el('button', {
        class: 'act' + (sel?.id === a.id ? ' sel' : ''),
        onclick: () => {
          if (State.currentActivity?.id === a.id) {
            State._detailsExpanded = !State._detailsExpanded;
          } else {
            State._detailsExpanded = false;
          }
          State.currentActivity = a;
          render();
        }
      });
      btn.innerHTML = `
        <div class="act-icon">${ti}</div>
        <div class="act-body">
          <div class="act-title">${escapeHtml(a.name)}</div>
          <div class="act-meta">${formatDate(a.date)} • ${a.distanceKm} km • ${a.elevGain} m D+</div>
        </div>
        <div class="act-pace">${formatDuration(a.duration)}</div>
      `;
      body.appendChild(btn);
    }
    head.addEventListener('click', () => {
      const nowOpen = body.classList.toggle('hidden') === false;
      State._monthsOpen[m.ym] = nowOpen;
      head.setAttribute('aria-expanded', String(nowOpen));
      head.querySelector('.month-chev').textContent = nowOpen ? '▴' : '▾';
    });
    group.appendChild(head);
    group.appendChild(body);
    page.appendChild(group);
  });

  root.appendChild(page);

  // Render map
  setTimeout(() => renderMap(sel), 50);
}

// Style JSON MapLibre 100% custom Orion. Couleurs alignées sur la palette
// de l'app (sombre, accents brun/khaki). Source de tiles vectorielles : OpenFreeMap
// (gratuit, sans clé, basé sur OpenMapTiles).
export const ORION_MAP_STYLE = {
  version: 8,
  name: 'Orion',
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {
    openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' }
  },
  layers: [
    // Fond sombre neutre
    { id: 'bg', type: 'background', paint: { 'background-color': '#181818' } },
    // Eau : gris-brun plus profond que la terre
    { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water',
      paint: { 'fill-color': '#0f0f0e', 'fill-opacity': 1 } },
    // Forêts et parcs : brun-olive très discret
    { id: 'wood', type: 'fill', source: 'openmaptiles', 'source-layer': 'landcover',
      filter: ['==', 'class', 'wood'],
      paint: { 'fill-color': '#2a2719', 'fill-opacity': 0.8 } },
    { id: 'grass', type: 'fill', source: 'openmaptiles', 'source-layer': 'landcover',
      filter: ['in', 'class', 'grass', 'park'],
      paint: { 'fill-color': '#25231a', 'fill-opacity': 0.7 } },
    // Bâti
    { id: 'buildings', type: 'fill', source: 'openmaptiles', 'source-layer': 'building',
      minzoom: 13,
      paint: { 'fill-color': '#2b2a26', 'fill-outline-color': '#333231' } },
    // Routes : de gris-brun à khaki selon l'importance
    { id: 'road-minor', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation',
      filter: ['in', 'class', 'minor', 'service', 'track'],
      minzoom: 12,
      paint: { 'line-color': '#3d3a33', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.6, 18, 2.5] } },
    { id: 'road-secondary', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation',
      filter: ['in', 'class', 'secondary', 'tertiary'],
      paint: { 'line-color': '#5a5446', 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.6, 18, 3.5] } },
    { id: 'road-primary', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation',
      filter: ['in', 'class', 'primary', 'trunk', 'motorway'],
      paint: { 'line-color': '#8a7a4c', 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.7, 18, 4.5], 'line-opacity': 0.9 } },
    // Frontières
    { id: 'admin-bounds', type: 'line', source: 'openmaptiles', 'source-layer': 'boundary',
      filter: ['<=', 'admin_level', 4],
      paint: { 'line-color': '#C8814A', 'line-width': 0.7, 'line-opacity': 0.35, 'line-dasharray': [2, 2] } },
    // Noms de lieux : khaki
    { id: 'place-labels', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place',
      filter: ['in', 'class', 'city', 'town', 'village'],
      layout: {
        'text-field': ['get', 'name:latin'],
        'text-font': ['Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 4, 9, 12, 14],
        'text-anchor': 'center'
      },
      paint: { 'text-color': '#C8814A', 'text-halo-color': '#121212', 'text-halo-width': 1.4, 'text-opacity': 0.9 } }
  ]
};

// Rend une carte Orion-stylée dans un conteneur DOM. Renvoie l'instance MapLibre.
export function renderMapInto(mapEl, activity) {
  if (!activity || !window.maplibregl || !mapEl) return null;
  const map = new maplibregl.Map({
    container: mapEl,
    style: ORION_MAP_STYLE,
    center: [2.5, 46.5],
    zoom: 5,
    attributionControl: false
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  map.addControl(new maplibregl.AttributionControl({
    customAttribution: '© OSM · OpenMapTiles · OpenFreeMap',
    compact: true
  }), 'bottom-right');

  const coords = activity.points.map(p => [p.lon, p.lat]);

  map.on('load', () => {
    // Source GeoJSON pour le tracé.
    map.addSource('track', {
      type: 'geojson',
      data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } }
    });

    // Halo doré diffus
    map.addLayer({
      id: 'track-halo', type: 'line', source: 'track',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#E3B089', 'line-width': 12, 'line-opacity': 0.28, 'line-blur': 4 }
    });
    // Halo brun intermédiaire
    map.addLayer({
      id: 'track-glow', type: 'line', source: 'track',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#B5703B', 'line-width': 7, 'line-opacity': 0.55 }
    });
    // Trait principal khaki clair
    map.addLayer({
      id: 'track-main', type: 'line', source: 'track',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#EBC29C', 'line-width': 3 }
    });

    // Markers départ (crème) et arrivée (brun)
    if (coords.length > 0) {
      const startEl = document.createElement('div');
      startEl.className = 'orion-marker orion-marker-start';
      new maplibregl.Marker({ element: startEl }).setLngLat(coords[0]).addTo(map);
      const endEl = document.createElement('div');
      endEl.className = 'orion-marker orion-marker-end';
      new maplibregl.Marker({ element: endEl }).setLngLat(coords[coords.length - 1]).addTo(map);
    }

    // Cadrer sur le tracé
    if (coords.length >= 2) {
      const lons = coords.map(c => c[0]);
      const lats = coords.map(c => c[1]);
      map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
                    { padding: 30, duration: 600 });
    }
  });

  return map;
}

export function renderMap(activity) {
  const mapEl = document.getElementById('sport-map');
  if (!mapEl) return;
  if (State.map) { try { State.map.remove(); } catch {} State.map = null; }
  State.map = renderMapInto(mapEl, activity);
}

// Preview modale : montre la carte + métriques + XP attendu, demande confirmation.
// Résout à `true` si l'utilisateur confirme l'import, `false` sinon.
export function showGpxPreview(parsed, type, splits, xp) {
  return new Promise((resolve) => {
    const typeIcon = activityTypeIcon(type);
    const overlay = el('div', { class: 'gpx-preview-overlay' });
    const modal = el('div', { class: 'gpx-preview-modal' });
    modal.innerHTML = `
      <div class="gpx-preview-head">
        <div class="gpx-preview-title">
          <span class="gpx-preview-icon">${typeIcon}</span>
          <span>${escapeHtml(parsed.name)}</span>
        </div>
        <button class="gpx-preview-close" aria-label="Fermer">✕</button>
      </div>
      <div class="gpx-preview-map" id="gpx-preview-map"></div>
      <div class="gpx-preview-metrics">
        <div class="metric"><div class="m-val grad-text">${parsed.distanceKm}</div><div class="m-lbl">km</div></div>
        <div class="metric"><div class="m-val grad-text">${parsed.elevGain}</div><div class="m-lbl">m D+</div></div>
        <div class="metric"><div class="m-val grad-text">${formatDuration(parsed.duration)}</div><div class="m-lbl">durée</div></div>
        <div class="metric"><div class="m-val grad-text">${formatPace(parsed.avgPace)}</div><div class="m-lbl">allure</div></div>
      </div>
      ${splits.best5k || splits.best10k ? `
        <div class="gpx-preview-splits">
          ${splits.best5k ? `<span>⚡ 5K · ${formatDuration(Math.round(splits.best5k))}</span>` : ''}
          ${splits.best10k ? `<span>🏃 10K · ${formatDuration(Math.round(splits.best10k))}</span>` : ''}
        </div>
      ` : ''}
      <div class="gpx-preview-actions">
        <button class="btn ghost" id="gpx-cancel">Annuler</button>
        <button class="btn-gpx" id="gpx-confirm">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          Importer · +${xp} XP
        </button>
      </div>
    `;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    let map;
    setTimeout(() => {
      map = renderMapInto(modal.querySelector('#gpx-preview-map'), { points: parsed.points });
    }, 30);

    const close = (ok) => {
      if (map) map.remove();
      overlay.remove();
      resolve(ok);
    };
    modal.querySelector('.gpx-preview-close').addEventListener('click', () => close(false));
    modal.querySelector('#gpx-cancel').addEventListener('click', () => close(false));
    modal.querySelector('#gpx-confirm').addEventListener('click', () => close(true));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
  });
}

export async function onGpxFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = parseGpx(text);
    const splits = computeSplits(parsed);
    const type = detectActivityType(parsed);
    const { xp, skills } = activityXp(parsed, type);
    // Si fractionné, on calcule les intervalles maintenant pour les stocker.
    const intervals = type === 'fractionne' ? analyseIntervals(parsed.points) : null;
    const autoName = defaultActivityName(type, parsed.date);

    // Preview avant import : l'utilisateur peut annuler.
    const confirmed = await showGpxPreview({ ...parsed, name: autoName }, type, splits, xp);
    if (!confirmed) {
      e.target.value = '';
      return;
    }

    // On stocke ce qui a été gagné pour permettre une suppression réversible.
    const activity = {
      id: 'act-' + Date.now(),
      type,
      ...parsed,
      name: autoName,
      ...splits,
      intervals,
      xpAwarded: xp,
      skillsAwarded: skills
    };
    if (isGhostDate(activity.date)) {
      activity.xpAwarded = 0;
      activity.skillsAwarded = {};
      await dbPut('activities', activity);
      showToast({ type: 'xp', title: 'Sortie archivée', text: 'Antérieure au 15 août : stockée mais non comptée.' }, 4000);
      await loadAll();
      render();
      return;
    }
    // Passe par withWeekRecalc : si la sortie tombe dans une semaine déjà évaluée,
    // quêtes, malus et bonus de cette semaine sont recalculés.
    let result, broken;
    await withWeekRecalc(weekKey(new Date(activity.date)), async () => {
      await dbPut('activities', activity);
      result = await awardXp(xp, skills);
      broken = await checkAndUpdateRecords(activity);
    });
    await recomputeAutoQuests();
    await loadAll();
    State.currentActivity = activity;

    if (broken.length > 0) showPRCelebration(broken);
    else showToast({
      type: result.leveledUp ? 'levelup' : 'xp',
      title: result.leveledUp ? `Niveau ${result.toLevel} !` : `+${xp} XP`,
      text: `${parsed.distanceKm} km • ${parsed.elevGain} m D+`
    }, 4000);
    render();
  } catch (err) {
    showToast({ type: 'err', title: 'Erreur', text: err.message }, 4000);
  } finally {
    e.target.value = '';
  }
}

export function showPRCelebration(records) {
  const overlay = document.getElementById('pr-overlay');
  const list = document.getElementById('pr-list');
  list.innerHTML = records.map(r => `
    <div class="pr-item">
      <span class="pr-icon">${r.type.icon}</span>
      <span class="pr-label">${r.type.label}</span>
      <span class="pr-value">${formatRecordValue(r.type, r.value)}</span>
    </div>
  `).join('');
  overlay.classList.remove('hidden');
  overlay.onclick = () => overlay.classList.add('hidden');
  setTimeout(() => overlay.classList.add('hidden'), 5500);
}

export async function recomputeAllRecords() {
  // Re-scanne toutes les activités et reconstruit le store records (utile après une suppression).
  const acts = await dbAllLive('activities');
  await dbClear('records');
  for (const t of RECORD_TYPES) {
    let best = null;
    for (const a of acts) {
      if (!isRunActivity(a)) continue;
      const v = a[t.metric];
      if (v == null || v === 0) continue;
      if (!best
        || (t.mode === 'max' && v > best.value)
        || (t.mode === 'min' && v < best.value)) {
        best = { id: t.id, value: v, activityId: a.id, date: a.date, previousValue: null };
      }
    }
    if (best) await dbPut('records', best);
  }
}

// Recalcule TOUT depuis zéro à partir de l'historique (workLogs + completions
// + activities), en appliquant les barèmes XP courants. Utile quand on a
// modifié les multiplicateurs (ex: passage de Montagne → Allure) et qu'on
// veut que les anciennes données rétroagissent.
//
// Étapes :
//  1) Reset profile.totalXp = 0 + reset chaque skill XP/level à 0/1.
//  2) Pour chaque activity : recalcule activityXp(act, type), met à jour
//     act.xpAwarded/skillsAwarded, applique au profil.
//  3) Pour chaque workLog : recalcule via computeWorkXp + portions
//     SUBJECTS, met à jour log.lastXpAwarded/lastSkillsAwarded, applique.
//  4) Pour chaque completion : recalcule selon le type de quête et
//     applique aussi.
//  5) Reset les meta.lastDailyPenalty/lastWeeklyPenalty pour que les malus/bonus
//     soient ré-évalués lors du prochain applyPendingPenalties().
export async function recomputeAllXp() {
  const profile = State.profile;
  if (!profile) return { success: false, reason: 'no profile' };

  // 1) Reset profil
  profile.totalXp = 0;
  profile.level = 1;
  for (const skillKey of Object.keys(profile.skills || {})) {
    profile.skills[skillKey] = { xp: 0, level: 1 };
  }
  await dbPut('profile', profile);
  // Recharge State.profile pour que les awardXp suivants opèrent sur l'objet à jour.
  State.profile = profile;

  let totalActivities = 0;
  let totalWorkLogs = 0;
  let totalCompletions = 0;
  let totalXp = 0;

  // 2) Activités : on recalcule l'XP pour chaque, on met à jour la fiche
  //    en base, puis on applique l'XP au profil.
  const acts = await dbAllLive('activities');
  // Trie chronologiquement pour que les level-ups soient cohérents.
  acts.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  for (const a of acts) {
    const type = a.type || 'footing';
    const { xp, skills } = activityXp(a, type);
    a.xpAwarded = xp;
    a.skillsAwarded = skills;
    await dbPut('activities', a);
    if (xp > 0) {
      await awardXp(xp, skills);
      totalXp += xp;
    }
    totalActivities++;
  }

  // 3) Work logs : on recalcule chaque jour avec computeWorkXp +
  //    pondération par matière. On stocke le nouveau lastXpAwarded.
  const logs = await dbAllLive('workLog');
  logs.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  for (const l of logs) {
    const bySubject = l.bySubject || {};
    const totalMin = Object.values(bySubject).reduce((s, m) => s + m, 0);
    if (totalMin === 0) {
      l.lastXpAwarded = 0;
      l.lastSkillsAwarded = {};
      await dbPut('workLog', l);
      continue;
    }
    const goalHours = l.goalHours || 0;
    const { xp: newXp } = computeWorkXp(totalMin, goalHours);
    const newSkillsXp = {};
    for (const [subj, mins] of Object.entries(bySubject)) {
      const meta = SUBJECTS[subj];
      if (!meta) continue;
      const portion = mins / totalMin;
      const mult = meta.skillMult ?? 0.6;
      newSkillsXp[meta.skill] = (newSkillsXp[meta.skill] || 0) + Math.round(newXp * portion * mult);
    }
    newSkillsXp.discipline = (newSkillsXp.discipline || 0) + Math.round(newXp * 0.04);
    l.lastXpAwarded = newXp;
    l.lastSkillsAwarded = newSkillsXp;
    await dbPut('workLog', l);
    if (newXp > 0) {
      await awardXp(newXp, newSkillsXp);
      totalXp += newXp;
    }
    totalWorkLogs++;
  }

  // 4) Completions hebdo : on recalcule chacune et on applique l'XP.
  //    On les trie par weekKey + questId pour stabilité.
  const completions = await dbAllLive('completions');
  const quests = await dbAll('quests');
  completions.sort((a, b) => (a.weekKey || '').localeCompare(b.weekKey || ''));
  for (const c of completions) {
    const q = quests.find(x => x.id === c.questId);
    if (!q) continue;
    const value = c.actualValue || 0;
    let xp, ratio;
    if (q.type === 'weekly-hours') {
      const r = computeHoursXp(value, q.goalHours);
      xp = r.xp; ratio = r.ratio;
    } else {
      const r = computeCountXp(value, q.id === 'wq-runs' ? await runsGoalFor(c.weekKey, q) : q.goalCount);
      xp = r.xp; ratio = r.ratio;
    }
    const skillsXp = questSkillXp(q, xp);
    // Met à jour la completion en base avec les nouvelles valeurs.
    c.lastXp = xp;
    c.lastSkillsXp = skillsXp;
    c.xp = xp;
    c.skills = skillsXp;
    c.ratio = ratio;
    await dbPut('completions', c);
    if (xp > 0) {
      await awardXp(xp, skillsXp);
      totalXp += xp;
    }
    totalCompletions++;
  }

  // 5) Reset les marqueurs de fin-de-période pour que les malus/bonus passés
  //    soient réappliqués lors du prochain applyPendingPenalties.
  await dbDelete('meta', 'lastDailyPenalty');
  await dbDelete('meta', 'lastWeeklyPenalty');

  // Recharge tout en mémoire et ré-applique les pénalités historiques.
  await loadAll();
  await applyPendingPenalties();
  await loadAll();

  return {
    success: true,
    totalActivities,
    totalWorkLogs,
    totalCompletions,
    finalXp: State.profile.totalXp,
    rawXpBeforePenalties: totalXp
  };
}

export async function deleteActivity(activity) {
  // Avant de retirer l'XP, anticipe la perte de niveau pour confirmer.
  const profile = State.profile;
  const before = deriveLevel(profile.totalXp).level;
  const xpAwarded = activity.xpAwarded ?? 0;
  const skillsAwarded = activity.skillsAwarded ?? {};
  const projectedXp = Math.max(0, profile.totalXp - xpAwarded);
  const after = deriveLevel(projectedXp).level;
  if (after < before) {
    if (!confirm(`⚠️ Supprimer cette sortie te fera perdre ${before - after} niveau${before - after > 1 ? 'x' : ''} (du ${before} au ${after}). Continuer ?`)) {
      return false;
    }
  }
  await withWeekRecalc(weekKey(new Date(activity.date)), async () => {
    await dbDelete('activities', activity.id);
    if (xpAwarded > 0) await removeXp(xpAwarded, skillsAwarded);
    await recomputeAllRecords();
  });
  await recomputeAutoQuests();
  await loadAll();
  return true;
}

// Édite le nom et la catégorie d'une sortie passée. Si la catégorie change,
// l'XP est recalculé et le delta est appliqué (réversible).
export async function editActivity(activity) {
  const overlay = el('div', { class: 'gpx-preview-overlay' });
  const modal = el('div', { class: 'gpx-preview-modal' });
  // Liste des catégories de sport.
  const cats = ['footing', 'fractionne', 'sortie-longue', 'trail', 'rando'];
  modal.innerHTML = `
    <div class="gpx-preview-head">
      <div class="gpx-preview-title">
        <span class="gpx-preview-icon">✏️</span>
        <span>Catégorie de la sortie</span>
      </div>
      <button class="gpx-preview-close" aria-label="Fermer">✕</button>
    </div>
    <div style="padding: 16px 18px;">
      <label class="dim text-xs" style="display:block; margin-bottom:6px;">Catégorie</label>
      <select class="input" id="edit-cat" style="width:100%;">
        ${cats.map(c => `<option value="${c}" ${c === activity.type ? 'selected' : ''}>${SPORT_TYPES[c]?.icon || ''} ${SPORT_TYPES[c]?.label || c}</option>`).join('')}
      </select>
      <p class="dim text-xs mt-3">Le nom de la sortie sera mis à jour automatiquement selon la catégorie. Si la catégorie change, l'XP est recalculé et la différence appliquée à ton niveau.</p>
    </div>
    <div class="gpx-preview-actions">
      <button class="btn ghost" id="edit-cancel">Annuler</button>
      <button class="btn-gpx" id="edit-save">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        Enregistrer
      </button>
    </div>
  `;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  modal.querySelector('.gpx-preview-close').addEventListener('click', close);
  modal.querySelector('#edit-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  modal.querySelector('#edit-save').addEventListener('click', async () => {
    const newCat = modal.querySelector('#edit-cat').value;
    const newName = defaultActivityName(newCat, activity.date);
    const oldXp = activity.xpAwarded || 0;
    const oldSkills = activity.skillsAwarded || {};
    let updated = { ...activity, name: newName, type: newCat };
    await withWeekRecalc(weekKey(new Date(activity.date)), async () => {
    // Recalcule l'XP si la catégorie change.
    if (newCat !== activity.type) {
      const { xp, skills } = activityXp(activity, newCat);
      updated.xpAwarded = xp;
      updated.skillsAwarded = skills;
      const xpDelta = xp - oldXp;
      const skillsDelta = {};
      const allKeys = new Set([...Object.keys(oldSkills), ...Object.keys(skills)]);
      for (const k of allKeys) skillsDelta[k] = (skills[k] || 0) - (oldSkills[k] || 0);
      const posS = Object.fromEntries(Object.entries(skillsDelta).filter(([_, v]) => v > 0));
      const negS = Object.fromEntries(Object.entries(skillsDelta).filter(([_, v]) => v < 0).map(([k, v]) => [k, -v]));
      if (xpDelta > 0) await awardXp(xpDelta, posS);
      else if (xpDelta < 0) await removeXp(-xpDelta, negS);
      if (xpDelta === 0 && Object.keys(posS).length) await awardXp(0, posS);
      if (xpDelta === 0 && Object.keys(negS).length) await removeXp(0, negS);
    }
    await dbPut('activities', updated);
    });
    await recomputeAutoQuests();
    await loadAll();
    State.currentActivity = updated;
    close();
    render();
    showToast({ type: 'xp', title: 'Catégorie mise à jour', text: newName });
  });
}
