// Préférences de l'utilisateur (meta `userPrefs`) : sport suivi ou non, gamification (v5, à venir).
// `sport` = false : plus d'onglet Sport, plus de compétence sport (Dextérité), plus de quête de sorties ni de malus associé.
// Les données déjà enregistrées ne sont jamais supprimées : elles sont seulement masquées.
import { dbGet, dbPut } from '../core/db.js';
import { COLLE_PROGRAMS } from './planning-data.js';

const KEY = 'userPrefs';
// hours : null = horaires d'origine ; sinon 7 jours (lundi → dimanche) { bed, end } en minutes depuis minuit (bed peut dépasser 1440).
// colles : false = emploi du temps de la classe sans les colles du groupe 8.
// theme : 'dark' (par défaut) | 'light'. planColors : couleurs du planning choisies par l'utilisateur (clé = catégorie).
const DEFAULTS = { v: 1, sport: true, gamify: true, onboarded: false, hours: null, colles: true, who: 'thomas', theme: 'dark', planColors: {} };
export const DEFAULT_HOURS = () => [22 * 60, 22 * 60, 22 * 60, 22 * 60, 22 * 60, 17 * 60 + 30, 18 * 60].map(end => ({ bed: 23 * 60 + 30, end }))   // fins de travail d'origine du planning;
let cache = null;

const clean = (v) => ({ ...DEFAULTS, ...(v || {}), v: 1, sport: v?.sport !== false, gamify: v?.gamify !== false, colles: v?.colles !== false, who: COLLE_PROGRAMS[v?.who] ? v.who : 'thomas', hours: Array.isArray(v?.hours) && v.hours.length === 7 ? v.hours : null, theme: v?.theme === 'light' ? 'light' : 'dark', planColors: (v?.planColors && typeof v.planColors === 'object') ? v.planColors : {} });

export async function loadPrefs() { if (!cache) cache = clean((await dbGet('meta', KEY))?.value); return cache; }
export const prefsNow = () => cache || (cache = clean(null));
export const sportOn = () => prefsNow().sport;
// Programme de colles choisi (Thomas = groupe 8, Daphné = groupe 11).
export const colleProgramNow = () => COLLE_PROGRAMS[prefsNow().who] || COLLE_PROGRAMS.thomas;
export const gamifyOn = () => prefsNow().gamify;

export async function savePrefs(patch) {
  cache = clean({ ...prefsNow(), ...patch });
  await dbPut('meta', { key: KEY, value: cache });
  applyPrefsToShell();
  return cache;
}

// Thème : posé sur <html data-theme>, recopié dans localStorage (lu par index.html avant l'affichage : pas de flash).
export const themeNow = () => prefsNow().theme;
export function applyTheme(t = themeNow()) {
  const light = t === 'light';
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
  try { localStorage.setItem('dailyup-theme', light ? 'light' : 'dark'); } catch {}
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', light ? '#F4EFE7' : '#121212');
}

// Couleurs du planning : catégories modifiables (cours, colle, DS, temps libre) + « autre » pour les créneaux ajoutés.
export const PLAN_CATS = [
  { key: 'cours', label: 'Cours', def: '#8C8579' },
  { key: 'colle', label: 'Colle', def: '#C8814A' },
  { key: 'ds',    label: 'DS',    def: '#D95F36' },
  { key: 'libre', label: 'Temps libre', def: '#6F6859' },
  { key: 'autre', label: 'Autre', def: '#B0705A' }
];
export const PLAN_SWATCHES = ['#8C8579', '#C8814A', '#D95F36', '#B5703B', '#E3B089', '#B0705A', '#9C6335', '#C8975A', '#6F6859', '#B8453A'];
export const planColor = (key) => prefsNow().planColors?.[key] || PLAN_CATS.find(c => c.key === key)?.def || '#8C8579';
export function applyPlanColors() {
  const st = document.documentElement.style;
  for (const c of PLAN_CATS) st.setProperty(`--ev-${c.key}`, planColor(c.key));
}

// Onglet Sport masqué quand le sport est désactivé (le routeur ignore les onglets masqués).
export function applyPrefsToShell() {
  document.querySelectorAll('.tab[data-route="sport"]').forEach(t => { t.hidden = !sportOn(); });
  applyTheme();
  applyPlanColors();
}

// Coucher choisi (tutoriel) pour le SOIR du jour `dateKey` (YYYY-MM-DD), en minutes depuis minuit (peut dépasser 1440). Sans réglage : 23h30.
export function bedMinFor(dateKey) {
  const h = prefsNow().hours;
  if (!h) return 23 * 60 + 30;
  return h[(new Date(dateKey + 'T12:00:00').getDay() + 6) % 7]?.bed ?? 23 * 60 + 30;
}
export function bedLabelFor(dateKey) {
  const m = bedMinFor(dateKey) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}h${String(m % 60).padStart(2, '0')}`;
}
