// Éditeur d'horaires partagé (tutoriel page 3 et Options) : pastilles L→D + curseurs fin de travail / coucher (pas de 15 min).
// Modifie `hours` (7 × { bed, end }, minutes depuis minuit) sur place ; la fin de travail ne dépasse jamais le coucher.
import { el } from '../ui/helpers.js';
import { DAY_LABELS } from '../features/planning.js';

export const fmtMin = (m) => { const x = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, '0')}h${String(x % 60).padStart(2, '0')}`; };
const SHORT = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function slider(label, min, max, value, onInput) {
  const out = el('b', { class: 'ob-val' }, fmtMin(value));
  const input = el('input', { type: 'range', class: 'ob-range', min, max, step: 15, value, 'aria-label': label });
  input.addEventListener('input', () => { out.textContent = fmtMin(+input.value); onInput(+input.value); });
  return { wrap: el('div', { class: 'ob-slider' }, [el('div', { class: 'flex between' }, [el('span', { class: 'mute' }, label), out]), input]), input, out };
}

export function hoursEditor(hours, onChange = () => {}) {
  let day = 0;
  const root = el('div', {});
  const pills = el('div', { class: 'ob-days' });
  const panel = el('div', {});
  root.append(pills, panel);
  const draw = () => {
    const h = hours[day];
    pills.replaceChildren(...SHORT.map((l, k) => el('button', { type: 'button', class: 'ob-pill' + (k === day ? ' on' : ''), 'aria-label': DAY_LABELS[k], onclick: () => { day = k; draw(); } }, l)));
    const end = slider('Fin de travail', 14 * 60, 24 * 60, h.end, (v) => { h.end = v; if (h.bed < v) { h.bed = v; bed.input.value = v; bed.out.textContent = fmtMin(v); } onChange(); });
    const bed = slider('Coucher', 20 * 60, 26 * 60, h.bed, (v) => { h.bed = v; if (h.end > v) { h.end = v; end.input.value = v; end.out.textContent = fmtMin(v); } onChange(); });
    panel.replaceChildren(el('div', { class: 'ob-dayname' }, DAY_LABELS[day]), end.wrap, bed.wrap,
      el('button', { type: 'button', class: 'btn ghost sm', onclick: () => { const c = { ...hours[day] }; hours.forEach((_, k) => { hours[k] = { ...c }; }); onChange(); draw(); } }, 'Même chose tous les jours'));
  };
  draw();
  return root;
}
