// Navigation entre les pages
import { State } from '../core/state.js';
import { renderHome } from '../pages/home.js';
import { renderOptions } from '../pages/options.js';
import { renderPlanning } from '../pages/planning.js';
import { renderToday } from '../pages/quests.js';
import { renderTodoSettings } from '../pages/todo-settings.js';
import { renderSport } from '../pages/sport.js';
import { renderStats } from '../pages/stats.js';
import { prefetchCaracs } from '../pages/caracs-card.js';

// ── Navigation ───────────────────────────────────────────────────────────────
// Transition « fondu enchaîné » en deux temps : l'ancienne page s'efface en glissant légèrement,
// la nouvelle est préparée pendant ce temps (données prêtes, pas de saut de mise en page),
// puis elle apparaît en glissant depuis le côté d'où l'on vient. Le défilement revient en haut
// pendant que la page est invisible : jamais de saut visible.
let navToken = 0;
let iconsPreloaded = false;
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function syncTabs(route) {
  document.querySelectorAll('.tab').forEach(t => {
    const isActive = t.dataset.route === route;
    t.classList.toggle('active', isActive);
    // Swap entre version colorée (active) et version monochrome (inactive)
    const img = t.querySelector('.tab-icon');
    const iconName = t.dataset.icon;
    if (img && iconName) {
      if (!iconsPreloaded) { new Image().src = `icons/ui/${iconName}.png?v=8`; new Image().src = `icons/ui/${iconName}-mono.png?v=8`; }
      img.src = isActive ? `icons/ui/${iconName}.png?v=8` : `icons/ui/${iconName}-mono.png?v=8`;
    }
  });
  iconsPreloaded = true;
}

// Données à charger avant d'afficher la page (évite qu'un bloc n'apparaisse après coup).
async function prefetchRoute(route) {
  if (route === 'home') await prefetchCaracs();
}

export function navigate(route) {
  const prev = State.currentRoute;
  State.currentRoute = route;
  State.navStamp = (State.navStamp || 0) + 1;   // identifie cette navigation (animations jouées une fois par navigation)
  syncTabs(route);
  const token = ++navToken;
  const view = document.getElementById('view');
  view.getAnimations?.().forEach(a => a.cancel());

  const prep = STAGED.has(route) ? buildStage(route) : prefetchRoute(route).then(() => null);
  const show = (stage) => {
    if (stage) { renderToken++; commit(view, stage); } else render();
  };

  if (!prev || prev === route || reduceMotion() || !view.animate) {
    prep.catch(() => null).then(stage => { if (token === navToken) { show(stage); if (prev !== route) window.scrollTo(0, 0); } });
    return;
  }

  const routes = [...document.querySelectorAll('.tab:not([hidden])')].map(t => t.dataset.route);
  const a = routes.indexOf(prev), b = routes.indexOf(route);
  const dir = (a < 0 || b < 0) ? 0 : (b > a ? 1 : -1);   // 0 : depuis ou vers Options → fondu simple
  const out = view.animate(
    [{ opacity: 1, transform: 'translate3d(0,0,0)' }, { opacity: 0, transform: `translate3d(${-dir * 14}px,0,0)` }],
    { duration: 120, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' }
  );
  Promise.all([out.finished.catch(() => {}), prep.catch(() => null)]).then(([, stage]) => {
    if (token !== navToken) return;   // une navigation plus récente a pris le relais
    out.cancel();
    show(stage);
    window.scrollTo(0, 0);
    const from = dir ? `translate3d(${dir * 20}px,0,0)` : 'translate3d(0,8px,0)';
    const inn = view.animate(
      [{ opacity: 0, transform: from }, { opacity: 1, transform: 'translate3d(0,0,0)' }],
      { duration: 280, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'both' }
    );
    inn.finished.then(() => inn.cancel()).catch(() => {});
  });
}

const PAGES = { home: renderHome, planning: renderPlanning, today: renderToday, todo: renderTodoSettings, sport: renderSport, stats: renderStats, options: renderOptions };
// Pages dont le contenu se remplit après coup (lectures de données) : on les construit hors écran,
// puis on les pose d'un seul bloc, pour qu'aucune carte n'apparaisse ni ne se déforme en cours de route.
const STAGED = new Set(['todo', 'today']);
let renderToken = 0;

async function buildStage(route) {
  const stage = document.createElement('div');
  await PAGES[route](stage);
  return stage;
}
const commit = (view, stage) => view.replaceChildren(...stage.childNodes);

export function render() {
  const view = document.getElementById('view');
  const route = State.currentRoute;
  if (!PAGES[route]) return;
  if (STAGED.has(route)) {
    const token = ++renderToken;
    return buildStage(route).then(stage => { if (token === renderToken) commit(view, stage); });
  }
  renderToken++;
  view.innerHTML = '';
  PAGES[route](view);
}

// ── Navigation par balayage horizontal entre les onglets ─────────────────────
const SWIPE_BLOCK = 'input, textarea, select, canvas, .map, .map-wrap, .maplibregl-map, .chart-wrap, .gpx-preview-overlay, [data-no-swipe]';

function scrollsHorizontally(node) {
  for (let n = node; n && n !== document.body; n = n.parentElement) {
    const ox = getComputedStyle(n).overflowX;
    if ((ox === 'auto' || ox === 'scroll') && n.scrollWidth > n.clientWidth + 2) return true;
  }
  return false;
}

export function initSwipeNav() {
  let start = null;
  document.addEventListener('touchstart', (e) => {
    start = null;
    if (e.touches.length !== 1 || document.querySelector('.gpx-preview-overlay')) return;
    const t = e.touches[0];
    if (e.target.closest(SWIPE_BLOCK) || scrollsHorizontally(e.target)) return;
    start = { x: t.clientX, y: t.clientY, time: Date.now() };
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x, dy = t.clientY - start.y, dt = Date.now() - start.time;
    start = null;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.8 || dt > 700) return;
    const routes = [...document.querySelectorAll('.tab:not([hidden])')].map(x => x.dataset.route);
    if (!routes.includes(State.currentRoute)) return;   // pas de balayage depuis Options
    const i = routes.indexOf(State.currentRoute) + (dx < 0 ? 1 : -1);
    if (i >= 0 && i < routes.length) navigate(routes[i]);
  }, { passive: true });
}
