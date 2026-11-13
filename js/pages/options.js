// Page Options (rouage de l'Accueil) : caractéristiques, rappels, sauvegarde, numéro de version
import { el } from '../ui/helpers.js';
import { iconHtml } from '../ui/icons.js';
import { navigate } from '../ui/router.js';
import { renderCaracsSettings } from './caracs-settings.js';
import { renderProfileSections } from './profile.js';

export function renderOptions(root) {
  const page = el('div', { class: 'page' });
  page.appendChild(el('div', { class: 'flex between mb-3' }, [
    el('button', { class: 'btn ghost sm', onclick: () => navigate('home') }, '← Accueil'),
    el('h1', { class: 'opt-title', html: iconHtml('gear') + ' Options' })
  ]));
  renderCaracsSettings(page).then(() => renderProfileSections(page));   // d'abord les réglages des caractéristiques, puis rappels, sauvegarde, version
  root.appendChild(page);
}
