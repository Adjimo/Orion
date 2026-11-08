// Utilitaires de dates et de semaines

export function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function weekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

export function startOfWeek(d = new Date()) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function dayKeyFromDate(d = new Date()) {
  const map = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return map[d.getDay()];
}

export function daysUntil(dateStr) {
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((target.getTime() - today.getTime()) / 86400000);
}

export function formatCountdown(days) {
  if (days < 0) return 'Passé';
  if (days === 0) return 'Aujourd\'hui';
  if (days === 1) return 'Demain';
  if (days < 60) return `J-${days}`;
  if (days < 365) return `${Math.floor(days / 30)} mois`;
  const years = Math.floor(days / 365);
  const remMonths = Math.floor((days % 365) / 30);
  return remMonths > 0 ? `${years}a ${remMonths}m` : `${years}a`;
}

export function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Les 7 dates (YYYY-MM-DD) d'une semaine, du lundi au dimanche.
export function weekDateKeys(wk) {
  const ws = weekStartDate(wk);
  return Array.from({ length: 7 }, (_, i) => todayKey(new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + i)));
}

// Lundi de la semaine ISO `YYYY-Www` (Date locale).
export function weekStartDate(wk) {
  const m = wk.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return new Date();
  const jan4 = new Date(Date.UTC(parseInt(m[1]), 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const mon = new Date(jan4);
  mon.setUTCDate(jan4.getUTCDate() - (jan4Day - 1) + (parseInt(m[2]) - 1) * 7);
  return new Date(mon.getUTCFullYear(), mon.getUTCMonth(), mon.getUTCDate());
}

// Helpers semaine ISO : passer à la suivante / précédente sur format `YYYY-Www`.
export function nextWeekKey(wk) {
  const m = wk.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return wk;
  const year = parseInt(m[1]);
  const week = parseInt(m[2]);
  // Repère un jeudi de la semaine donnée → +7j → re-format.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Mon = new Date(jan4); week1Mon.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
  const targetMon = new Date(week1Mon);
  targetMon.setUTCDate(week1Mon.getUTCDate() + (week - 1) * 7 + 7);
  return weekKey(targetMon);
}

export function prevWeekKey(wk) {
  const m = wk.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return wk;
  const year = parseInt(m[1]);
  const week = parseInt(m[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Mon = new Date(jan4); week1Mon.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
  const targetMon = new Date(week1Mon);
  targetMon.setUTCDate(week1Mon.getUTCDate() + (week - 1) * 7 - 7);
  return weekKey(targetMon);
}
