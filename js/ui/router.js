// Navigation entre les pages
import { State } from '../core/state.js';
import { renderHome } from '../pages/home.js';
import { renderPlanning } from '../pages/planning.js';
import { renderHebdo, renderToday } from '../pages/quests.js';
import { renderSport } from '../pages/sport.js';
import { renderStats } from '../pages/stats.js';

export function navigate(route) {
  State.currentRoute = route;
  document.querySelectorAll('.tab').forEach(t => {
    const isActive = t.dataset.route === route;
    t.classList.toggle('active', isActive);
    // Swap entre version colorée (active) et version monochrome (inactive)
    const img = t.querySelector('.tab-icon');
    const iconName = t.dataset.icon;
    if (img && iconName) {
      img.src = isActive ? `icons/ui/${iconName}.png?v=4` : `icons/ui/${iconName}-mono.png?v=4`;
    }
  });
  render();
}

export function render() {
  const view = document.getElementById('view');
  view.innerHTML = '';
  switch (State.currentRoute) {
    case 'home': renderHome(view); break;
    case 'planning': renderPlanning(view); break;
    case 'today': renderToday(view); break;
    case 'hebdo': renderHebdo(view); break;
    case 'sport': renderSport(view); break;
    case 'stats': renderStats(view); break;
  }
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
    const routes = [...document.querySelectorAll('.tab')].map(x => x.dataset.route);
    const i = routes.indexOf(State.currentRoute) + (dx < 0 ? 1 : -1);
    if (i >= 0 && i < routes.length) { navigate(routes[i]); window.scrollTo(0, 0); }
  }, { passive: true });
}
