// Page Accueil
import { daysUntil, formatDate } from '../core/dates.js';
import { State } from '../core/state.js';
import { dbPut } from '../core/db.js';
import { MAX_LEVEL, deriveLevel } from '../core/xp.js';
import { computeYearProgress } from '../features/exams.js';
import { loadAll } from '../features/seed.js';
import { el, escapeHtml, progressBar } from '../ui/helpers.js';
import { iconHtml } from '../ui/icons.js';
import { navigate, render } from '../ui/router.js';
import { renderCaracsCard } from './caracs-card.js';
import { renderCaracPanels } from './skills-panels.js';
import { gamifyOn } from '../features/prefs.js';

export function greeting() {
  const h = new Date().getHours();
  if (h < 6) return 'Encore debout ?';
  if (h < 12) return 'Bonjour';
  if (h < 18) return 'Bon après-midi';
  if (h < 22) return 'Bonsoir';
  return 'Bonne nuit';
}

export function renderHome(root) {
  const p = State.profile;
  if (!p) return;
  const li = deriveLevel(p.totalXp);

  const futureExams = State.exams
    .filter(e => e.enabled !== false)
    .map(e => ({ ...e, days: daysUntil(e.date) }))
    .filter(e => e.days >= 0)
    .sort((a, b) => a.days - b.days);
  const nextExam = futureExams[0];

  const page = el('div', { class: 'page' });
  const fit = el('div', { class: 'home-fit' });   // en-tête + 3 blocs : occupe exactement l'écran
  page.appendChild(fit);

  // Header compact (nom modifiable, ancienneté, rouage Options)
  const editBtn = el('button', { class: 'btn ghost sm', 'aria-label': 'Modifier le nom', onclick: async () => {
    const name = prompt('Ton nom :', p.name);
    if (name && name.trim()) { p.name = name.trim(); await dbPut('profile', p); await loadAll(); render(); }
  }, html: iconHtml('pencil') });
  fit.appendChild(el('div', { class: 'header home-head flex between' }, [
    el('div', {}, [
      el('div', { class: 'dim text-xs home-since' }, greeting()),
      el('div', { class: 'text-xl home-name' }, p.name)
    ]),
    el('div', { class: 'flex gap-2' }, [editBtn, el('button', { class: 'btn ghost sm', 'aria-label': 'Options', onclick: () => navigate('options'), html: iconHtml('gear') })])
  ]));

  // Deux blocs côte à côte : niveau (dégradé) et prochaine échéance, puis le graphique en dessous.
  const top = el('div', { class: 'home-top' + (gamifyOn() ? '' : ' no-gam') });
  fit.appendChild(top);

  const card = (cls, label, right, big, pct, sub1, sub2) => el('div', { class: `card hm-card ${cls}`, html: `
    <div class="hm-label hm-label-row"><span>${label}</span><span>${right}</span></div>
    <div class="hm-big">${big}</div>
    <div class="hm-meter">${progressBar(pct, 8)}</div>
    <div class="hm-subs"><div class="hm-sub">${sub1}</div><div class="hm-sub mute">${sub2}</div></div>` });

  const gam = gamifyOn();   // gamification désactivée : ni niveau ni toile, seulement l'échéance et les barres de compétences
  if (gam) top.appendChild(card('hm-level', 'Niveau', `${p.totalXp} XP`,
    `<span style="color:var(--accent)">${li.level}</span><span class="hm-of"> / ${MAX_LEVEL}</span>`, li.progress,
    li.max ? 'Niveau maximum atteint' : `${li.xpInLevel} / ${li.xpToNext} XP`,
    li.max ? '&nbsp;' : `Niv. ${li.level + 1} dans ${li.xpToNext - li.xpInLevel} XP`));

  if (nextExam) {
    const yearPct = Math.round(computeYearProgress(nextExam.date) * 100);
    const urg = nextExam.days < 30 ? '#b8453a' : nextExam.days < 90 ? '#B5703B' : nextExam.days < 180 ? '#D08A4E' : '#E3B089';
    top.appendChild(card('hm-exam', 'Échéance', `${iconHtml(nextExam.icon)} ${escapeHtml(nextExam.short)}`,
      `<span style="color:var(--accent)">${yearPct}</span><span class="hm-of"> %</span>`, yearPct / 100,
      `<span style="color:${urg};font-weight:700">J-${nextExam.days}</span> avant échéance`,
      nextExam.endDate ? new Date(nextExam.date + 'T00:00:00').getDate() + ' – ' + formatDate(nextExam.endDate) : formatDate(nextExam.date)));
  } else {
    top.firstChild?.classList.add('full');
  }

  // Caractéristiques hebdomadaires (recalculées à la clôture de chaque semaine)
  const caracsBox = el('div', { class: 'home-radar' });
  if (gam) { fit.appendChild(caracsBox); renderCaracsCard(caracsBox).catch(err => console.error('Caracs card failed', err)); }
  else { fit.classList.add('no-gam'); top.firstChild?.classList.add('full'); }

  // Compétences : une carte par caractéristique, sous la toile
  const skills = el('div', { class: 'hebdo-notes home-skills' });
  page.appendChild(el('h3', { class: 'mb-3 mt-4' }, 'Compétences'));
  page.appendChild(skills);
  renderCaracPanels(skills).catch(err => console.error('Skills failed', err));

  root.appendChild(page);
}
