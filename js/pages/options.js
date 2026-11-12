// Page Options (rouage de l'Accueil) : bilan hebdo, rappels, sauvegarde, numéro de version
import { el } from '../ui/helpers.js';
import { iconHtml } from '../ui/icons.js';
import { navigate } from '../ui/router.js';
import { renderCaracsSettings } from './caracs-settings.js';
import { renderProfileSections } from './profile.js';

export function renderOptions(root) {
  const page = el('div', { class: 'page' });
  page.appendChild(el('div', { class: 'flex between mb-3' }, [
    el('button', { class: 'btn ghost sm', onclick: () => { navigate('home'); window.scrollTo(0, 0); } }, '← Accueil'),
    el('h1', { class: 'opt-title', html: iconHtml('gear') + ' Options' })
  ]));
  renderCaracsSettings(page).then(() => renderProfileSections(page));   // d'abord les réglages des caractéristiques, puis bilan hebdo, rappels, sauvegarde, version
  root.appendChild(page);
}
