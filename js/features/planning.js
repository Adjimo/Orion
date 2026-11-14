// Moteur du planning : assemble cours, colles, DS, périodes et modifications d'une semaine.
import { dbAll, dbDelete, dbPut } from '../core/db.js';
import { EDT_END, SCHOOL_START, addDays, dayInfo, diffDays, mondayOf, parseKey, weekMode } from '../core/calendar.js';
import { colleProgramNow, prefsNow } from './prefs.js';
import { BASE_COURSES, COLLE_SLOTS, DS_BY_INDEX, DS_DAY, DS_START, ITC_COURS_END, ITC_TP_LAST_INDEX, TDSI_ANCHOR, weekIndexOf } from './planning-data.js';

export const DAY_LABELS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
// Fenêtre de la journée dans laquelle on calcule le temps libre.
const COLLE_TITLES = { 'Mathématiques': 'Colle de maths', 'Physique': 'Colle de physique', 'Anglais': 'Colle d\u2019anglais', 'Français': 'Colle de français' };
const ALLEGE_SUBJECTS = ['maths', 'physique', 'tp-physique'];

export const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
export const fromMin = (n) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
export function formatDuration(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return h ? (m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`) : `${m} min`;
}

function courseActive(c, date, monday) {
  if (c.rule === 'tdsi') return diffDays(date, TDSI_ANCHOR) % 14 === 0;
  if (c.rule === 'itcTP') { const i = weekIndexOf(monday); return i !== null && i % 2 === colleProgramNow().itcParity && i <= ITC_TP_LAST_INDEX + colleProgramNow().itcParity; }
  if (c.rule === 'itcCours') return date <= ITC_COURS_END;
  return true;
}

// Événements de base d'une semaine (avant modifications).
function baseEvents(monday, mode) {
  const events = [];
  if (mode === 'normal') {
    for (const c of BASE_COURSES) {
      const date = addDays(monday, c.day - 1);
      if (date < SCHOOL_START || date > EDT_END) continue;
      const info = dayInfo(date);
      if (info.vacation || info.holiday || !courseActive(c, date, monday)) continue;
      events.push({ id: `c:${c.id}:${date}`, recurKey: `c:${c.id}`, type: 'cours', subj: c.subj, date, start: c.start, end: c.end, title: c.title, teacher: c.teacher, room: c.room || null });
    }
  } else if (mode === 'allege') {
    for (const c of BASE_COURSES) {
      if (!ALLEGE_SUBJECTS.includes(c.subj)) continue;
      const date = addDays(monday, c.day - 1);
      if (dayInfo(date).vacation || dayInfo(date).holiday) continue;
      events.push({ id: `c:${c.id}:${date}`, recurKey: `c:${c.id}`, type: 'cours', subj: c.subj, date, start: c.start, end: c.end, title: c.title, teacher: c.teacher, room: c.room || null });
    }
  }
  const idx = weekIndexOf(monday);
  if (mode === 'normal' && idx !== null) {
    if (prefsNow().colles !== false) for (const code of colleProgramNow().rotation[idx] || []) {
      const s = COLLE_SLOTS[code];
      const date = s.day ? addDays(monday, s.day - 1) : null;
      events.push({
        id: `k:${monday}:${code}`, type: 'colle', subj: s.subject, code, date,
        start: s.start, end: s.start ? `${String(parseInt(s.start) + 1).padStart(2, '0')}:00` : null,
        title: COLLE_TITLES[s.subject], teacher: s.teacher, room: s.room, note: s.note || null
      });
    }
    const ds = DS_BY_INDEX[idx];
    if (ds) {
      const date = addDays(monday, DS_DAY - 1);
      const [name, hours] = ds;
      events.push({
        id: `d:${date}`, type: 'ds', date, start: DS_START,
        end: hours ? `${String(13 + hours).padStart(2, '0')}:00` : '17:00', approx: !hours,
        title: name === 'Concours blanc' ? name : `DS ${name}`, hours: hours || null
      });
    }
  }
  return events;
}

// ── Modifications (planOverrides) ────────────────────────────────────────────
// { id, scope: 'all'|'week', weekKey, targetId, op: 'modify'|'delete'|'add', fields }
export async function loadOverrides() { return dbAll('planOverrides'); }
export async function saveOverride(ov) { await dbPut('planOverrides', ov); }
export async function removeOverride(id) { await dbDelete('planOverrides', id); }

function applyOverrides(events, monday, overrides) {
  const ordered = [...overrides].sort((a, b) => (a.scope === b.scope ? (a.createdAt || '').localeCompare(b.createdAt || '') : a.scope === 'all' ? -1 : 1));
  let out = events;
  for (const ov of ordered) {
    if (ov.scope === 'week' && ov.weekKey !== monday) continue;
    if (ov.op === 'add') {
      const f = ov.fields || {};
      const date = f.date || (f.day ? addDays(monday, f.day - 1) : null);
      if (date) out.push({ id: `x:${ov.id}:${date}`, recurKey: ov.scope === 'all' ? `x:${ov.id}` : null, type: f.type || 'cours', custom: true, date, start: f.start || null, end: f.end || null, title: f.title || 'Créneau', teacher: f.teacher || null, room: f.room || null });
      continue;
    }
    out = out.filter(ev => {
      const hit = ov.scope === 'all' ? ev.recurKey === ov.targetId : ev.id === ov.targetId;
      if (!hit) return true;
      if (ov.op === 'delete') return false;
      const f = ov.fields || {};
      if (f.day) ev.date = addDays(monday, f.day - 1);
      for (const k of ['start', 'end', 'title', 'teacher', 'room']) if (f[k] !== undefined) ev[k] = f[k];
      ev.modified = true;
      return true;
    });
  }
  return out;
}

// ── Temps libre ──────────────────────────────────────────────────────────────
// Plages de travail personnel et pauses repas par jour (0 = lundi … 6 = dimanche).
// Le temps libre = plages de travail moins les événements ; une plage < 30 min est ignorée.
const R = (a, b) => [toMin(a), toMin(b)];
const EVENING = R('18:30', '19:30');
export const DAY_RULES = [
  { work: [R('08:00', '12:00'), R('12:30', '18:30'), R('19:30', '22:00')], pauses: [R('12:00', '12:30'), EVENING] },   // lundi
  { work: [R('08:00', '12:00'), R('13:00', '18:30'), R('19:30', '22:00')], pauses: [R('12:00', '13:00'), EVENING] },   // mardi
  { work: [R('08:00', '12:00'), R('13:00', '18:30'), R('19:30', '22:00')], pauses: [R('12:00', '13:00'), EVENING] },   // mercredi (DS l'après-midi)
  { work: [R('08:00', '12:00'), R('14:00', '18:30'), R('19:30', '22:00')], pauses: [R('13:00', '14:00'), EVENING] },   // jeudi (pause repas 13h-14h)
  { work: [R('08:00', '12:00'), R('12:30', '18:30'), R('19:30', '22:00')], pauses: [R('12:00', '12:30'), EVENING] },   // vendredi
  { work: [R('11:00', '12:00'), R('13:30', '17:30')], pauses: [R('12:00', '13:30')] },                                 // samedi (11h-12h si pas de TD de SI)
  { work: [R('08:00', '12:00'), R('13:30', '18:00')], pauses: [R('12:00', '13:30')] }                                  // dimanche
];

function subtractBusy(windows, busy, minLen) {
  const out = [];
  for (const [w0, w1] of windows) {
    let cur = w0;
    for (const [a, b] of busy) {
      if (b <= cur || a >= w1) continue;
      if (a - cur >= minLen) out.push({ start: fromMin(cur), end: fromMin(a) });
      cur = Math.max(cur, b);
    }
    if (w1 - cur >= minLen) out.push({ start: fromMin(cur), end: fromMin(w1) });
  }
  return out;
}

function freeBlocks(events, dayIndex) {
  const busy = events.filter(e => e.start && e.end).map(e => [toMin(e.start), toMin(e.end)]).sort((x, y) => x[0] - y[0]);
  const rules = DAY_RULES[dayIndex];
  const end = prefsNow().hours?.[dayIndex]?.end;   // fin de travail choisie (tutoriel) : remplace l'heure d'origine
  let work = rules.work;
  if (end) { work = work.filter(w => w[0] < end).map(w => [w[0], Math.min(w[1], end)]); const last = work[work.length - 1]; if (last && last[1] < end && rules.work.at(-1)[1] < end) last[1] = end; }
  return { free: subtractBusy(work, busy, 30), pauses: subtractBusy(rules.pauses, busy, 15) };
}

// Semaine complète : 7 jours, événements triés, temps libre (« travail personnel »).
export async function buildWeek(monday, overrides) {
  const ovs = overrides || await loadOverrides();
  const mode = weekMode(monday);
  const all = applyOverrides(baseEvents(monday, mode), monday, ovs);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(monday, i);
    const events = all.filter(e => e.date === date && e.start).sort((a, b) => a.start.localeCompare(b.start));
    const { free, pauses } = freeBlocks(events, i);
    days.push({ date, index: i, label: DAY_LABELS[i], info: dayInfo(date), events, free, pauses, freeMinutes: free.reduce((s, b) => s + toMin(b.end) - toMin(b.start), 0) });
  }
  return {
    monday, mode, index: weekIndexOf(monday), days,
    unscheduled: all.filter(e => !e.date || !e.start),
    freeMinutes: days.reduce((s, d) => s + d.freeMinutes, 0)
  };
}

export { mondayOf, parseKey };
