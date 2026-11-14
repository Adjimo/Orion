// Page Options (rouage de l'Accueil) : Gamification et Sport (interrupteurs), puis dépliants Objectifs, Rappels, Sauvegarde
import { el, showToast } from '../ui/helpers.js';
import { iconHtml } from '../ui/icons.js';
import { navigate } from '../ui/router.js';
import { renderCaracsSettings } from './caracs-settings.js';
import { renderProfileSections } from './profile.js';
import { hoursEditor } from './hours-editor.js';
import { loadAll } from '../features/seed.js';
import { DEFAULT_HOURS, loadPrefs, prefsNow, savePrefs } from '../features/prefs.js';
import { startOnboarding } from './onboarding.js';
import { recomputeCaracs } from '../features/caracs.js';

export function renderOptions(root) {
  const page = el('div', { class: 'page' });
  page.appendChild(el('div', { class: 'flex between mb-3' }, [
    el('button', { class: 'btn ghost sm', onclick: () => navigate('home') }, '← Accueil'),
    el('h1', { class: 'opt-title', html: iconHtml('gear') + ' Options' })
  ]));
  const row = (key, icon, title, hint, after) => {
    const on = prefsNow()[key];
    return el('div', { class: 'card mb-3 opt-pref' }, [el('div', { class: 'flex between' }, [
      el('div', { class: 'opt-pref-t' }, [el('span', { class: 'opt-pico', html: iconHtml(icon) }), el('div', {}, [el('b', {}, title), el('small', { class: 'mute', style: 'display:block' }, hint)])]),
      el('button', { type: 'button', class: 'sw' + (on ? ' on' : ''), role: 'switch', 'aria-checked': String(on), 'aria-label': title, onclick: async () => {
        await savePrefs({ [key]: !prefsNow()[key] });
        if (after) await after();
        navigate('options');
      } }, [el('span', { class: 'sw-knob' })])
    ])]);
  };
  const switches = el('div', {});
  page.appendChild(switches);
  loadPrefs().then(() => {   // interrupteurs sans dépliant : Gamification et Sport
    switches.append(
      row('gamify', 'sparkles', 'Gamification', 'Niveau, toile des caractéristiques et notes /20'),
      row('sport', 'run', 'Sport', 'Onglet Sport, compétence Dextérité et quête de sorties', () => recomputeCaracs().catch(() => {}))
    );
  });
  const hoursFold = el('details', { class: 'card mb-3 cs-fold opt-fold' }, [el('summary', { class: 'cs-fold-head', html: iconHtml('moon') + '<span>Horaires</span>' })]);
  page.appendChild(hoursFold);
  loadPrefs().then(() => {   // dépliant Horaires : fin de travail (fin du temps libre) et coucher, par jour
    const hours = (prefsNow().hours || DEFAULT_HOURS()).map(h => ({ ...h }));
    hoursFold.appendChild(el('div', { class: 'cs-card' }, [
      hoursEditor(hours),
      el('div', { class: 'cs-hint' }, 'La fin de travail délimite ton temps libre (donc tes objectifs) ; le coucher sert à la quête sommeil et à son rappel.'),
      el('button', { class: 'btn primary', style: 'width:100%', onclick: async () => {
        await savePrefs({ hours });
        await recomputeCaracs().catch(() => {});
        await loadAll().catch(() => {});
        showToast({ type: 'xp', icon: 'check', title: 'Horaires enregistrés', text: 'Objectifs recalculés.' }, 3000);
      } }, 'Enregistrer les horaires')
    ]));
  });
  renderCaracsSettings(page).then(() => renderProfileSections(page)).then(() => page.appendChild(
    el('button', { class: 'btn ghost sm mb-3', style: 'width:100%', onclick: startOnboarding }, 'Relancer le tutoriel (sans perdre de données)')));   // d'abord les réglages des caractéristiques, puis rappels, sauvegarde, version
  root.appendChild(page);
}
