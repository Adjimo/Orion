// Tutoriel d'inscription (v5) : pages courtes, sans clavier.
// 1 Sport ? · 2 Gamifier ? · 3 Horaires par jour (coucher + fin de travail) · 4 Volume de travail (%) · 5 Emploi du temps (sans colles).
// Relançable à tout moment depuis Options (bouton admin) sans toucher aux données.
import { el } from '../ui/helpers.js';
import { iconHtml } from '../ui/icons.js';
import { navigate } from '../ui/router.js';
import { DEFAULT_HOURS, prefsNow, savePrefs } from '../features/prefs.js';
import { DAY_LABELS, buildWeek, formatDuration } from '../features/planning.js';
import { getCaracSettings, recomputeCaracs, saveCaracSettings } from '../features/caracs.js';
import { hoursEditor } from './hours-editor.js';
import { loadAll } from '../features/seed.js';
import { mondayOf } from '../core/calendar.js';
import { todayKey } from '../core/dates.js';

const PAGES = [
  { key: 'sport', type: 'yesno', icon: 'run', title: 'Veux-tu suivre ton sport ?', text: 'Sorties, Dextérité et onglet Sport. Tu pourras le changer dans Options.' },
  { key: 'gamify', type: 'yesno', icon: 'sparkles', title: 'Veux-tu gamifier ton travail ?', text: 'Niveau, toile des caractéristiques et notes /20. Sinon : une simple liste de compétences avec barres de progression.' },
  { key: 'hours', type: 'hours', icon: 'moon', title: 'Tes horaires', text: 'Choisis un jour, puis règle l’heure de fin de travail et l’heure du coucher (qui sert à la quête sommeil et au rappel).' },
  { key: 'workPct', type: 'pct', icon: 'target', title: 'Ton volume de travail', text: 'Quelle part de ton temps libre veux-tu consacrer au travail ?' },
  { key: 'colles', type: 'edt', icon: 'calendar', title: 'Ton emploi du temps', text: 'Cours, TD, TP et DS de la classe sont prêts. Les colles ne sont pas incluses : elles dépendent de chaque groupe.' }
];


export async function startOnboarding() {
  if (document.querySelector('.ob-overlay')) return;
  const cfg = await getCaracSettings();
  const draft = { sport: prefsNow().sport, gamify: prefsNow().gamify, hours: prefsNow().hours || DEFAULT_HOURS(), workPct: cfg.workPct, colles: false };
  draft.hours = draft.hours.map(h => ({ ...h }));
  let i = 0;
  const overlay = el('div', { class: 'ob-overlay', role: 'dialog', 'aria-modal': 'true' });
  document.body.appendChild(overlay);

  const finish = async () => {
    await savePrefs({ sport: draft.sport, gamify: draft.gamify, hours: draft.hours, colles: draft.colles, onboarded: true });
    if (draft.workPct !== cfg.workPct) await saveCaracSettings({ workPct: draft.workPct }).catch(() => {});
    await recomputeCaracs().catch(() => {});
    await loadAll().catch(() => {});
    overlay.remove();
    navigate('home');
  };
  const next = () => (i === PAGES.length - 1 ? finish() : (i++, paint()));

  const body = (pg) => {
    if (pg.type === 'yesno') return el('div', { class: 'ob-actions' }, [
      el('button', { class: 'btn primary', onclick: () => { draft[pg.key] = true; next(); } }, 'Oui'),
      el('button', { class: 'btn ghost', onclick: () => { draft[pg.key] = false; next(); } }, 'Non')
    ]);
    if (pg.type === 'hours') return el('div', {}, [hoursEditor(draft.hours), el('div', { class: 'ob-actions' }, [el('button', { class: 'btn primary', onclick: async () => { await savePrefs({ hours: draft.hours }); next(); } }, 'Suivant')])]);
    if (pg.type === 'pct') {
      const out = el('b', { class: 'ob-big' }, draft.workPct + ' %');
      const est = el('small', { class: 'mute', style: 'display:block;min-height:1.4em' }, '');
      const upd = async () => {
        const wk = await buildWeek(mondayOf(todayKey()));
        est.textContent = `≈ ${formatDuration(Math.round(wk.freeMinutes * draft.workPct / 100 / 15) * 15)} de travail par semaine (sur ${formatDuration(wk.freeMinutes)} libres)`;
      };
      const input = el('input', { type: 'range', class: 'ob-range', min: 30, max: 100, step: 5, value: draft.workPct, 'aria-label': 'Part du temps libre travaillée' });
      input.addEventListener('input', () => { draft.workPct = +input.value; out.textContent = draft.workPct + ' %'; upd(); });
      upd();
      return el('div', {}, [out, input, est, el('div', { class: 'ob-actions' }, [el('button', { class: 'btn primary', onclick: next }, 'Suivant')])]);
    }
    return el('div', { class: 'ob-actions', style: 'flex-direction:column' }, [   // page 5
      el('button', { class: 'btn primary', onclick: () => { draft.colles = false; next(); } }, 'Terminer'),
      el('button', { class: 'btn ghost sm', onclick: () => { draft.colles = true; next(); } }, 'Garder mes colles (admin)')
    ]);
  };

  const paint = () => {
    const pg = PAGES[i];
    overlay.replaceChildren(
      el('div', { class: 'ob-dots' }, PAGES.map((_, k) => el('span', { class: 'ob-dot' + (k === i ? ' on' : '') }))),
      el('div', { class: 'ob-card' }, [
        el('div', { class: 'ob-ico', html: iconHtml(pg.icon) }),
        el('h2', {}, pg.title),
        el('p', { class: 'mute' }, pg.text),
        body(pg)
      ]),
      i > 0 ? el('button', { class: 'btn ghost sm ob-back', onclick: () => { i--; paint(); } }, 'Retour') : null
    );
  };
  paint();
}
