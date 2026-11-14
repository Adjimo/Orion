// Aides d'interface (éléments DOM, toasts, modales)
import { iconHtml } from './icons.js';

export function el(tag, props = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k === 'style') e.setAttribute('style', v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') e.innerHTML = v;
    else if (v !== undefined && v !== null) e.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    if (typeof c === 'string' || typeof c === 'number') e.appendChild(document.createTextNode(c));
    else e.appendChild(c);
  }
  return e;
}

export function showToast(toast, duration = 2500) {
  const root = document.getElementById('toast');
  root.className = 'toast' + (toast.type === 'levelup' ? ' levelup' : '');
  root.innerHTML = `
    <div class="icon">${iconHtml(toast.icon || (toast.type === 'levelup' ? 'party' : 'sparkles'))}</div>
    <div class="body">
      <div class="title">${escapeHtml(toast.title)}</div>
      <div class="text">${escapeHtml(toast.text || '')}</div>
    </div>
  `;
  root.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => root.classList.add('hidden'), duration);
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function progressBar(value, height = 10) {
  const w = Math.min(100, Math.max(0, value * 100));
  return `<div class="progress" style="height:${height}px;"><div class="fill" style="width:${w}%;"></div></div>`;
}

// Bouton d'ajout unique de l'app : pointillés cuivre + pastille « + » (celui de la to-do). À utiliser partout où l'on ajoute un élément.
export function addBtn(label, onclick, extra = '') {
  return el('button', { type: 'button', class: ('add-btn ' + extra).trim(), onclick }, [el('span', { class: 'add-plus' }, '+'), ' ' + label]);
}
