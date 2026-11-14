// Records sportifs, VDOT et allures
import { dbGet, dbPut } from '../core/db.js';
import { analyseIntervals, formatDuration, formatPace, haversine } from './gpx.js';
import { isRunActivity } from './schedule.js';

export const RECORD_TYPES = [
  { id: 'longest',    label: 'Plus longue sortie', icon: 'sunrise', metric: 'distanceKm', mode: 'max' },
  { id: 'highest',    label: 'Plus gros D+',       icon: 'mountain', metric: 'elevGain',   mode: 'max' },
  { id: 'fastest5k',  label: 'Meilleur 5K',        icon: 'stopwatch', metric: 'best5k',     mode: 'min' },
  { id: 'fastest10k', label: 'Meilleur 10K',       icon: 'stopwatch', metric: 'best10k',    mode: 'min' },
  { id: 'longestDur', label: 'Plus long temps',    icon: 'stopwatch', metric: 'duration',   mode: 'max' }
];

export function bestSplit(points, distanceTarget) {
  if (!points || points.length < 2) return null;
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1] + haversine(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon));
  }
  if (cum[cum.length - 1] < distanceTarget) return null;
  let best = Infinity, j = 0;
  for (let i = 0; i < points.length; i++) {
    while (j < points.length && cum[j] - cum[i] < distanceTarget) j++;
    if (j >= points.length) break;
    if (!points[i].time || !points[j].time) continue;
    const dt = (points[j].time - points[i].time) / 1000;
    if (dt > 0 && dt < best) best = dt;
  }
  return best === Infinity ? null : best;
}

export function computeSplits(parsed) {
  const splits = {};
  const b1 = bestSplit(parsed.points, 1000);
  const b5 = bestSplit(parsed.points, 5000);
  const b10 = bestSplit(parsed.points, 10000);
  const bSemi = bestSplit(parsed.points, 21097);
  if (b1) splits.best1k = b1;
  if (b5) splits.best5k = b5;
  if (b10) splits.best10k = b10;
  if (bSemi) splits.bestSemi = bSemi;
  // Splits kilomètre par kilomètre (perfs par km).
  splits.kmSplits = computeKmSplits(parsed.points);
  return splits;
}

// Pour chaque km franchi, calcule durée, allure (s/km), et D+ partiel.
// Renvoie [{ km: 1, distance: 1000, duration: 312, pace: 312, elevGain: 5 }, ...]
export function computeKmSplits(points) {
  if (!points || points.length < 2) return [];
  const splits = [];
  let cumDist = 0;
  let kmStart = 0;        // index de début du km en cours
  let kmStartDist = 0;    // distance cumulée au début du km en cours
  let kmGain = 0;         // D+ accumulé dans le km en cours
  let lastEle = points[0].ele;
  const NOISE = 1.5;

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    cumDist += haversine(a.lat, a.lon, b.lat, b.lon);
    if (b.ele !== null && lastEle !== null) {
      const dEle = b.ele - lastEle;
      if (Math.abs(dEle) >= NOISE) {
        if (dEle > 0) kmGain += dEle;
        lastEle = b.ele;
      }
    } else if (b.ele !== null) {
      lastEle = b.ele;
    }
    // A-t-on franchi un nouveau km ?
    while (cumDist - kmStartDist >= 1000) {
      // Interpolation pour trouver le timestamp précis au km franchi.
      const tStart = points[kmStart].time;
      const tEnd = b.time;
      let dur = 0;
      if (tStart && tEnd) {
        // On approxime : la fraction du segment où on franchit le km.
        const distInSeg = haversine(a.lat, a.lon, b.lat, b.lon);
        const distLeftInKm = 1000 - (cumDist - distInSeg - kmStartDist);
        const fracInSeg = distInSeg > 0 ? distLeftInKm / distInSeg : 0;
        const tCross = a.time + (b.time - a.time) * fracInSeg;
        dur = (tCross - tStart) / 1000;
      }
      const km = splits.length + 1;
      splits.push({
        km,
        distance: 1000,
        duration: Math.round(dur),
        pace: dur > 0 ? Math.round(dur) : 0,
        elevGain: Math.round(kmGain)
      });
      kmStart = i;
      kmStartDist += 1000;
      kmGain = 0;
    }
  }

  // Optionnel : on n'inclut pas le km partiel final (< 1000 m), peu utile.
  return splits;
}

// Estimateur VO2max basé sur la formule de Riegel + Daniels.
// Pour un effort sur distance D (m) en temps T (s), on calcule la VO2max
// approximée par : VO2 = -4.60 + 0.182258 × v + 0.000104 × v²
//                 où v = D / T × 60 (m/min)
// puis on divise par la fraction d'utilisation de la VO2max selon la durée
// (formule Daniels) : %max = 0.8 + 0.1894 × exp(-0.012778 × T_min)
//                          + 0.2989 × exp(-0.1932 × T_min)
export function estimateVO2max(distanceM, timeS) {
  if (!distanceM || !timeS || timeS < 60) return null;
  const v = distanceM / timeS * 60; // m/min
  const vo2 = -4.60 + 0.182258 * v + 0.000104 * v * v;
  const tMin = timeS / 60;
  const pctMax = 0.8
    + 0.1894 * Math.exp(-0.012778 * tMin)
    + 0.2989 * Math.exp(-0.1932 * tMin);
  if (pctMax <= 0) return null;
  return vo2 / pctMax;
}

// Pour la courbe d'évolution : pour chaque activité chronométrée, retourne
// le meilleur VO2max obtenable depuis ses propres splits (5K/10K/semi/1K).
export function activityVO2maxPoints(activities) {
  return activities
    .map(a => {
      const candidates = [
        { d: 5000, t: a.best5k },
        { d: 10000, t: a.best10k },
        { d: 21097, t: a.bestSemi }
      ];
      let best = null;
      for (const c of candidates) {
        if (!c.t) continue;
        const vo2 = estimateVO2max(c.d, c.t);
        if (vo2 != null && (best == null || vo2 > best)) best = vo2;
      }
      // Fallback : si pas de splits internes mais durée + distance complète, on essaie.
      if (best == null && a.duration && a.distanceKm > 1) {
        const vo2 = estimateVO2max(a.distanceKm * 1000, a.duration);
        if (vo2 != null) best = vo2;
      }
      return best != null ? { date: a.date, vo2: Math.round(best * 10) / 10, name: a.name } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Calcule les meilleurs splits dans une fenêtre temporelle glissante (en jours).
// Renvoie { best1k, best5k, best10k, bestSemi } en secondes (null si rien).
export function getRollingRecords(activities, windowDays) {
  const cutoff = Date.now() - windowDays * 86400000;
  const recent = activities.filter(a => isRunActivity(a) && new Date(a.date).getTime() >= cutoff);
  const fields = ['best1k', 'best5k', 'best10k', 'bestSemi'];
  const out = {};
  for (const f of fields) {
    let best = null;
    for (const a of recent) {
      const v = a[f];
      if (v && (best == null || v < best)) best = v;
    }
    out[f] = best;
  }
  return out;
}

// Dispatch du rendu détaillé d'une sortie selon sa catégorie. Footings et
// sorties week-end → splits km par km. Fractionné → tableau des intervalles
// (effort / repos). Trail → profil de dénivelé.
export function renderActivityDetailHtml(activity) {
  if (!activity) return '';
  const type = activity.type || 'footing';
  if (type === 'fractionne') {
    return renderFractionneIntervalsHtml(activity);
  }
  if (type === 'trail' || type === 'rando') {
    return renderTrailElevHtml(activity);
  }
  // footing, sortie-longue, course (legacy), renforcement avec splits si dispo
  if (activity.kmSplits && activity.kmSplits.length > 0) {
    return renderKmSplitsHtml(activity.kmSplits);
  }
  return '';
}

// Tableau des intervalles d'un fractionné (issues de analyseIntervals stockées
// dans activity.intervals à l'import). Effort en orange, repos en violet.
export function renderFractionneIntervalsHtml(activity) {
  let intervals = activity.intervals;
  // Fallback : si l'activité a été importée avant que l'analyse soit faite,
  // on essaie de la calculer maintenant à partir des points si dispos.
  if ((!intervals || intervals.length === 0) && activity.points) {
    intervals = analyseIntervals(activity.points);
  }
  if (!intervals || intervals.length === 0) {
    return `<div class="km-splits"><div class="km-splits-title">Tours d'effort</div>
      <div class="dim text-xs" style="padding: 12px 0;">Pas d'intervalles détectés sur cette sortie.</div>
    </div>`;
  }
  const efforts = intervals.filter(i => i.kind === 'effort');
  const totalEffort = efforts.reduce((s, i) => s + i.duration, 0);
  const totalRepos = intervals.filter(i => i.kind === 'repos').reduce((s, i) => s + i.duration, 0);
  const avgEffortPace = efforts.length > 0
    ? Math.round(efforts.reduce((s, i) => s + i.avgPace, 0) / efforts.length)
    : 0;

  let lapNum = 0;
  const rows = intervals.map(it => {
    const isEffort = it.kind === 'effort';
    if (isEffort) lapNum++;
    return `
      <div class="interval-row ${isEffort ? 'effort' : 'repos'}">
        <div class="interval-label">${isEffort ? 'Tour ' + lapNum : 'Récup'}</div>
        <div class="interval-meta">${formatDuration(it.duration)} · ${(it.distance / 1000).toFixed(2)} km · ${formatPace(it.avgPace)}</div>
      </div>
    `;
  }).join('');

  return `
    <div class="km-splits">
      <div class="km-splits-title">Tours d'effort · ${efforts.length} série${efforts.length > 1 ? 's' : ''}</div>
      <div class="totals" style="margin-bottom: 10px;">
        <div><div class="t-val grad-text">${formatDuration(totalEffort)}</div><div class="t-lbl">effort total</div></div>
        <div><div class="t-val grad-text">${formatDuration(totalRepos)}</div><div class="t-lbl">repos total</div></div>
        <div><div class="t-val grad-text">${formatPace(avgEffortPace)}</div><div class="t-lbl">allure effort</div></div>
      </div>
      <div class="intervals-list">${rows}</div>
    </div>
  `;
}

// Profil de dénivelé pour un trail : pour chaque km on affiche la barre de D+
// (positive vers le haut). Couleur ambre. Inclut un résumé montée totale,
// km le plus pentu, descente totale (depuis la trace).
export function renderTrailElevHtml(activity) {
  const splits = activity.kmSplits || [];
  if (splits.length === 0) {
    return '';
  }
  const dPlusBars = splits.map(s => s.elevGain || 0);
  const maxBar = Math.max(1, ...dPlusBars);
  const totalDplus = activity.elevGain || 0;
  // Calcule descente totale depuis les points si possible.
  let descent = 0;
  if (activity.points && activity.points.length > 1) {
    let lastEle = activity.points[0].ele;
    for (let i = 1; i < activity.points.length; i++) {
      const e = activity.points[i].ele;
      if (e == null || lastEle == null) continue;
      const d = e - lastEle;
      if (Math.abs(d) >= 1.5) {
        if (d < 0) descent += -d;
        lastEle = e;
      } else if (e !== null) {
        // skip (noise)
      }
    }
  }
  // km le plus pentu
  const steepestKm = splits.reduce((max, s) => (s.elevGain || 0) > (max?.elevGain || 0) ? s : max, null);

  let html = '<div class="km-splits">';
  html += '<div class="km-splits-title">Profil dénivelé · km par km</div>';
  html += `
    <div class="totals" style="margin-bottom: 10px;">
      <div><div class="t-val grad-text">+${Math.round(totalDplus)}</div><div class="t-lbl">m D+</div></div>
      <div><div class="t-val grad-text">−${Math.round(descent)}</div><div class="t-lbl">m D−</div></div>
      <div><div class="t-val grad-text">${steepestKm ? '+' + steepestKm.elevGain : '—'}</div><div class="t-lbl">km le + raide (km ${steepestKm ? steepestKm.km : '—'})</div></div>
    </div>
  `;
  for (const s of splits) {
    const dPlus = s.elevGain || 0;
    const widthPct = 30 + (dPlus / maxBar) * 70;
    html += `
      <div class="km-split">
        <div class="km-split-label">km ${s.km}</div>
        <div class="km-split-bar-wrap">
          <div class="km-split-bar trail" style="width: ${dPlus > 0 ? widthPct : 0}%"></div>
        </div>
        <div class="km-split-pace mono">+${dPlus} m</div>
        <div class="km-split-elev dim mono">${formatPaceShort(s.pace)}/km</div>
      </div>
    `;
  }
  html += '</div>';
  return html;
}

// Helper : format "M:SS" pour une allure en s/km.
export function formatPaceShort(seconds) {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Rendu HTML des splits km par km : barre horizontale par km, longueur
// inversement proportionnelle à l'allure (km le plus rapide = barre pleine).
// Le plus rapide est en or, le plus lent en ambre/orange.
export function renderKmSplitsHtml(splits) {
  if (!splits || splits.length === 0) return '';
  const valid = splits.filter(s => s.duration > 0);
  if (valid.length === 0) return '';
  const paces = valid.map(s => s.pace);
  const fastest = Math.min(...paces);
  const slowest = Math.max(...paces);
  const range = Math.max(1, slowest - fastest);

  const formatPaceShort = (sec) => {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  let html = '<div class="km-splits">';
  html += '<div class="km-splits-title">Splits km par km</div>';
  for (const s of splits) {
    const isFastest = s.pace === fastest && s.duration > 0;
    const isSlowest = s.pace === slowest && s.duration > 0 && slowest !== fastest;
    // Largeur barre : 100% pour le fastest, décroît linéairement.
    const t = (slowest - s.pace) / range; // 1 = fastest, 0 = slowest
    const width = 30 + t * 70;
    const cls = isFastest ? 'fastest' : isSlowest ? 'slowest' : '';
    html += `
      <div class="km-split ${cls}">
        <div class="km-split-label">km ${s.km}</div>
        <div class="km-split-bar-wrap">
          <div class="km-split-bar" style="width: ${width}%"></div>
        </div>
        <div class="km-split-pace mono">${formatPaceShort(s.pace)}/km</div>
        <div class="km-split-elev dim mono">${s.elevGain > 0 ? '+' + s.elevGain + 'm' : ''}</div>
      </div>
    `;
  }
  html += '</div>';
  return html;
}

export async function checkAndUpdateRecords(activity) {
  const broken = [];
  if (!isRunActivity(activity)) return broken;
  for (const t of RECORD_TYPES) {
    const newValue = activity[t.metric];
    if (newValue == null || newValue === 0) continue;
    const existing = await dbGet('records', t.id);
    let isBetter = !existing
      || (t.mode === 'max' && newValue > existing.value)
      || (t.mode === 'min' && newValue < existing.value);
    if (isBetter) {
      await dbPut('records', {
        id: t.id, value: newValue, activityId: activity.id,
        date: activity.date, previousValue: existing?.value || null
      });
      broken.push({ type: t, value: newValue, previous: existing?.value, first: !existing });
    }
  }
  return broken;
}

export function formatRecordValue(type, value) {
  if (type.metric === 'distanceKm') return `${value.toFixed(2)} km`;
  if (type.metric === 'elevGain')   return `${Math.round(value)} m`;
  if (type.metric === 'duration') {
    const h = Math.floor(value / 3600), m = Math.floor((value % 3600) / 60);
    return `${h}h${String(m).padStart(2, '0')}`;
  }
  if (type.metric === 'best5k' || type.metric === 'best10k') {
    const m = Math.floor(value / 60), s = Math.round(value % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  return value;
}
