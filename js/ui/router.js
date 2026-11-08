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
      img.src = isActive ? `icons/ui/${iconName}.png?v=3` : `icons/ui/${iconName}-mono.png?v=3`;
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
