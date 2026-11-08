// Import et analyse des fichiers GPX
import { SPORT_TYPES } from './schedule.js';

export function parseGpx(text) {
  const xml = new DOMParser().parseFromString(text, 'application/xml');
  if (xml.querySelector('parsererror')) throw new Error('GPX invalide');

  const name = xml.querySelector('trk > name')?.textContent
            || xml.querySelector('metadata > name')?.textContent || 'Sortie';

  const trkpts = Array.from(xml.querySelectorAll('trkpt, rtept'));
  if (trkpts.length < 2) throw new Error('GPX trop court');

  const points = trkpts.map(pt => {
    const lat = parseFloat(pt.getAttribute('lat'));
    const lon = parseFloat(pt.getAttribute('lon'));
    const ele = pt.querySelector('ele') ? parseFloat(pt.querySelector('ele').textContent) : null;
    const time = pt.querySelector('time') ? new Date(pt.querySelector('time').textContent).getTime() : null;
    return { lat, lon, ele, time };
  }).filter(p => !isNaN(p.lat) && !isNaN(p.lon));

  let distance = 0, elevGain = 0, elevLoss = 0, lastEle = points[0].ele;
  const NOISE = 1.5;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    distance += haversine(a.lat, a.lon, b.lat, b.lon);
    if (b.ele !== null && lastEle !== null) {
      const diff = b.ele - lastEle;
      if (Math.abs(diff) >= NOISE) {
        if (diff > 0) elevGain += diff;
        else elevLoss += -diff;
        lastEle = b.ele;
      }
    } else if (b.ele !== null) lastEle = b.ele;
  }

  const firstTime = points.find(p => p.time)?.time;
  const lastTime = [...points].reverse().find(p => p.time)?.time;
  const duration = (firstTime && lastTime) ? Math.round((lastTime - firstTime) / 1000) : 0;
  const distanceKm = distance / 1000;
  const avgSpeed = duration > 0 ? distanceKm / (duration / 3600) : 0;
  const avgPace = duration > 0 && distanceKm > 0 ? duration / distanceKm : 0;

  return {
    name, points,
    distance: Math.round(distance),
    distanceKm: Math.round(distanceKm * 100) / 100,
    elevGain: Math.round(elevGain),
    elevLoss: Math.round(elevLoss),
    duration,
    avgPace: Math.round(avgPace),
    avgSpeed: Math.round(avgSpeed * 10) / 10,
    date: firstTime ? new Date(firstTime).toISOString() : new Date().toISOString()
  };
}

export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = x => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Détecte la catégorie d'une sortie. Combine la date (week-end ?) à l'analyse
// de la trace (D+/km pour le trail, variance d'allure pour le fractionné).
// Retourne 'footing' | 'trail' | 'rando' | 'fractionne' | 'sortie-longue'.
export function detectActivityType(parsed) {
  const date = new Date(parsed.date);
  const dayOfWeek = date.getDay(); // 0 = dimanche, 6 = samedi
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const dPlusPerKm = parsed.distanceKm > 0 ? parsed.elevGain / parsed.distanceKm : 0;
  const isLong = parsed.distanceKm >= 12; // sortie longue typique du week-end

  // Randonnée : allure de marche (≥ 10:00/km) sur une distance significative.
  if (parsed.avgPace >= 600 && parsed.distanceKm >= 3) return 'rando';

  // Trail : beaucoup de D+ par km, prioritaire (peut être un trail le dimanche).
  if (dPlusPerKm > 25) return 'trail';

  // Sortie week-end : samedi ou dimanche ET distance "longue".
  if (isWeekend && isLong) return 'sortie-longue';

  // Fractionné : on regarde la variance des speeds entre points consécutifs.
  if (detectFractionnePattern(parsed.points)) return 'fractionne';

  return 'footing';
}

// Vrai si la trace présente une alternance significative entre phases rapides
// et phases lentes — signe d'un fractionné. Heuristique : on segmente en
// fenêtres de 30s, on calcule l'allure de chaque fenêtre, et si la dispersion
// (écart-type / moyenne) dépasse 0.18 ET qu'au moins 4 alternances ont lieu,
// c'est un fractionné.
export function detectFractionnePattern(points) {
  if (!points || points.length < 30) return false;
  const windows = [];
  let winStart = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[winStart], b = points[i];
    if (!a.time || !b.time) { winStart = i; continue; }
    if ((b.time - a.time) >= 30000) { // fenêtre de 30s
      let dist = 0;
      for (let j = winStart + 1; j <= i; j++) {
        const p = points[j - 1], q = points[j];
        dist += haversine(p.lat, p.lon, q.lat, q.lon);
      }
      const dt = (b.time - a.time) / 1000;
      const speed = dist / dt; // m/s
      windows.push(speed);
      winStart = i;
    }
  }
  if (windows.length < 8) return false;
  const mean = windows.reduce((s, v) => s + v, 0) / windows.length;
  if (mean <= 0) return false;
  const variance = windows.reduce((s, v) => s + (v - mean) ** 2, 0) / windows.length;
  const cv = Math.sqrt(variance) / mean; // coefficient de variation
  // Compte les "alternances" : transitions au-dessus / au-dessous de la moyenne.
  let alt = 0;
  for (let i = 1; i < windows.length; i++) {
    if ((windows[i] >= mean) !== (windows[i - 1] >= mean)) alt++;
  }
  return cv >= 0.18 && alt >= 4;
}

// Génère un nom par défaut pour une activité importée selon sa catégorie + date.
export function defaultActivityName(category, date) {
  const meta = SPORT_TYPES[category] || SPORT_TYPES.footing;
  const d = new Date(date);
  const dayLabel = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${meta.label} · ${dayLabel}`;
}

// Icône d'une activité selon son type (toutes catégories : nouvelles + legacy).
export function activityTypeIcon(type) {
  return SPORT_TYPES[type]?.icon
    || '🏃';
}

// Analyse une trace de fractionné : segmente en phases d'effort et de récupération
// par seuillage de la vitesse autour d'une médiane glissante. Renvoie la liste
// des intervalles { kind: 'effort' | 'repos', duration: s, distance: m, avgPace: s/km }.
export function analyseIntervals(points) {
  if (!points || points.length < 10) return [];
  // Construit une série de points avec speed instantanée (m/s) lissée sur 5s.
  const series = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (!a.time || !b.time) continue;
    const dt = (b.time - a.time) / 1000;
    if (dt <= 0) continue;
    const dist = haversine(a.lat, a.lon, b.lat, b.lon);
    series.push({ t: b.time, speed: dist / dt, dist, dt });
  }
  if (series.length < 10) return [];

  // Calcule la médiane des speeds.
  const sortedSpeeds = [...series.map(s => s.speed)].sort((a, b) => a - b);
  const median = sortedSpeeds[Math.floor(sortedSpeeds.length / 2)];
  // Seuils : effort > 1.15 × médiane, repos < 0.85 × médiane. Hystérésis.
  const effortThr = median * 1.15;
  const reposThr = median * 0.85;

  // Classe chaque échantillon, en évitant les sauts trop courts (< 8s).
  const intervals = [];
  let cur = null; // {kind, startIdx}
  for (let i = 0; i < series.length; i++) {
    const sp = series[i].speed;
    let kind;
    if (sp >= effortThr) kind = 'effort';
    else if (sp <= reposThr) kind = 'repos';
    else kind = cur?.kind || 'repos'; // zone neutre : on conserve le précédent
    if (!cur) {
      cur = { kind, startIdx: i };
    } else if (cur.kind !== kind) {
      // Ferme le précédent, ouvre le nouveau.
      const seg = series.slice(cur.startIdx, i);
      const dur = seg.reduce((s, p) => s + p.dt, 0);
      const dist = seg.reduce((s, p) => s + p.dist, 0);
      // On filtre les segments trop courts pour ne pas avoir de bruit.
      if (dur >= 8) {
        intervals.push({
          kind: cur.kind,
          duration: Math.round(dur),
          distance: Math.round(dist),
          avgPace: dist > 0 ? Math.round(dur / (dist / 1000)) : 0
        });
      }
      cur = { kind, startIdx: i };
    }
  }
  if (cur) {
    const seg = series.slice(cur.startIdx);
    const dur = seg.reduce((s, p) => s + p.dt, 0);
    const dist = seg.reduce((s, p) => s + p.dist, 0);
    if (dur >= 8) {
      intervals.push({
        kind: cur.kind,
        duration: Math.round(dur),
        distance: Math.round(dist),
        avgPace: dist > 0 ? Math.round(dur / (dist / 1000)) : 0
      });
    }
  }
  return intervals;
}

export function formatDuration(seconds) {
  if (!seconds) return '—';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatPace(secondsPerKm) {
  if (!secondsPerKm) return '—';
  const m = Math.floor(secondsPerKm / 60);
  const s = Math.round(secondsPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}/km`;
}

// Calcul XP d'une activité GPX, basé sur deux dimensions séparées :
// - ENDURANCE : strictement proportionnel au volume kilométrique. Plus tu cours
//   loin, plus tu gagnes — indépendamment de la vitesse.
// - ALLURE : reflète la performance pure. Plus tu es rapide (allure plus
//   basse en s/km), plus tu gagnes. Référence : footing à 5:30/km = 0 bonus,
//   chaque seconde gagnée par km = bonus, plafonné à un seuil "élite" de 3:30/km.
//
// Le type de sortie module la pondération :
//   - footing       : équilibré
//   - fractionne    : prime à l'allure
//   - trail         : prime à l'endurance + bonus D+
//   - sortie-longue     : XP doublé (sortie longue, effort soutenu)
//   - renforcement  : forfait minimal (séance courte non-GPS)
export function activityXp(parsed, category) {
  const cat = category || parsed.type || 'footing';
  const km = parsed.distanceKm || 0;
  const dPlus = parsed.elevGain || 0;
  const avgPaceSec = parsed.avgPace || 0; // s/km, 0 si pas de timing
  const PACE_REF = 5 * 60 + 30;     // 5:30/km = 0 bonus
  const PACE_MIN = 3 * 60 + 30;     // 3:30/km = bonus max
  const PACE_MAX = 7 * 60 + 30;     // au-delà : bonus négatif (très lent)

  // Endurance : 25 XP/km de base
  let enduranceXp = Math.round(km * 25);

  // Randonnée : marche, donc aucune XP d'allure ; endurance réduite + bonus D+.
  if (cat === 'rando') {
    const hikeEndurance = Math.round(km * 12);
    const hikeBonus = Math.round(dPlus * 0.6);
    return {
      xp: hikeEndurance + hikeBonus,
      skills: { endurance: hikeEndurance + hikeBonus, allure: 0, discipline: 4 }
    };
  }

  // Allure : intensité (0 = ref, 1 = élite, négatif = en deçà ref)
  let intensity = 0;
  if (avgPaceSec > 0) {
    if (avgPaceSec <= PACE_REF) {
      intensity = (PACE_REF - avgPaceSec) / (PACE_REF - PACE_MIN);
    } else {
      intensity = (PACE_REF - avgPaceSec) / (PACE_MAX - PACE_REF);
    }
    intensity = Math.max(-0.5, Math.min(1, intensity));
  }
  // Allure XP scale linéairement avec le kilométrage : courir 10 km à 4:00 vaut
  // plus que 3 km à 4:00, mais l'XP ne dépend QUE de la vitesse via intensity.
  let allureXp = Math.round(km * 25 * intensity);

  // Modulations par catégorie. Les bonus reflètent la difficulté physiologique :
  // les zones plus intenses (T, I) sont plus dures donc allure XP majorée.
  let categoryBonus = 0;
  if (cat === 'trail') {
    enduranceXp = Math.round(enduranceXp * 1.1);
    categoryBonus = Math.round(dPlus * 1.2); // bonus D+ exclusif au trail
  } else if (cat === 'fractionne') {
    // Zone I : VMA
    allureXp = Math.round(allureXp * 1.5);
  } else if (cat === 'sortie-longue') {
    enduranceXp = Math.round(enduranceXp * 2);
    allureXp = Math.round(allureXp * 1.3);
  }
  // 'footing' (E) : pas de modulation, baseline

  // XP de la compétence Allure (indépendante de l'XP globale ci-dessous) :
  //  - une base de 5 XP/km pour toute sortie de course (la régularité compte) ;
  //  - la partie « intensité » multipliée par 4 (avant : ×1) ;
  //  - fractionné / seuil / sortie longue gardent leur modulation via allureXp.
  const ALLURE_SKILL_MULT = 4;
  const allureSkillXp = Math.round(km * 5 + Math.max(0, allureXp) * ALLURE_SKILL_MULT);

  const totalXp = Math.max(0, enduranceXp + Math.max(0, allureXp) + categoryBonus);
  return {
    xp: totalXp,
    skills: {
      endurance: enduranceXp,
      allure: allureSkillXp,
      discipline: 4
    }
  };
}
