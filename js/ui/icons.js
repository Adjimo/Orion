// Pack d'icônes Orion : remplace les emojis par des icônes SVG vectorielles, une couleur par icône.
// Source unique : ICONS (dessins), COLORS (palette chaude variée, sans bleu/violet/vert), (correspondances).
// installIconizer() remplace automatiquement tout emoji connu apparaissant dans le DOM (rendu initial et suivants).

const f = 'class="f"', s = 'class="s"';
const ICONS = {
  run: `<circle cx="15" cy="4.6" r="2" ${s}/><path d="M14 8.5 11.5 14M11.5 14 15 17l-.5 4M11.5 14 8 16.5 4.5 16M14 8.5l4 2.5 2-.5M14 8.5 10.5 10l-2 3"/>`,
  bolt: `<path ${f} d="M13 2.5 5 13.5h6l-1 8 8-11h-6z"/><path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z"/>`,
  books: `<rect x="3.5" y="4" width="4.5" height="17" rx="1"/><rect x="9.8" y="7" width="4.5" height="14" rx="1" ${f}/><rect x="9.8" y="7" width="4.5" height="14" rx="1"/><rect x="16" y="10" width="4.5" height="11" rx="1"/>`,
  book: `<path ${f} d="M12 6.5c-2.6-1.7-6-2-9-1v14c3-1 6.4-.7 9 1 2.6-1.7 6-2 9-1v-14c-3-1-6.4-.7-9 1z"/><path d="M12 6.5c-2.6-1.7-6-2-9-1v14c3-1 6.4-.7 9 1 2.6-1.7 6-2 9-1v-14c-3-1-6.4-.7-9 1zM12 6.5v14"/>`,
  chip: `<rect x="6.5" y="6.5" width="11" height="11" rx="2" ${f}/><rect x="6.5" y="6.5" width="11" height="11" rx="2"/><rect x="10" y="10" width="4" height="4" rx=".8"/><path d="M9.5 3v3.5M14.5 3v3.5M9.5 17.5V21M14.5 17.5V21M3 9.5h3.5M3 14.5h3.5M17.5 9.5H21M17.5 14.5H21"/>`,
  globe: `<circle cx="12" cy="12" r="9" ${f}/><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 2.6 4 5.6 4 9s-1.2 6.4-4 9c-2.8-2.6-4-5.6-4-9s1.2-6.4 4-9z"/>`,
  pen: `<path ${f} d="M12 3l5.5 6.5L12 21 6.5 9.5z"/><path d="M12 3l5.5 6.5L12 21 6.5 9.5zM12 3v10"/><circle cx="12" cy="14" r="1.3" ${s}/>`,
  stopwatch: `<circle cx="12" cy="13.5" r="7.5" ${f}/><circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9M9.5 2.5h5M18.2 6.3l1.3-1.3"/>`,
  warning: `<path ${f} d="M12 3.5 21.5 20h-19z"/><path d="M12 3.5 21.5 20h-19zM12 10v4.5"/><circle cx="12" cy="17.3" r="1" ${s}/>`,
  chart: `<rect x="3.5" y="12" width="4.2" height="8.5" rx="1"/><rect x="9.9" y="5.5" width="4.2" height="15" rx="1" ${f}/><rect x="9.9" y="5.5" width="4.2" height="15" rx="1"/><rect x="16.3" y="9" width="4.2" height="11.5" rx="1"/>`,
  moon: `<path ${f} d="M20 14.6A8.2 8.2 0 0 1 9.4 4a8.2 8.2 0 1 0 10.6 10.6z"/><path d="M20 14.6A8.2 8.2 0 0 1 9.4 4a8.2 8.2 0 1 0 10.6 10.6z"/>`,
  calendar: `<rect x="3.5" y="5" width="17" height="16" rx="3" ${f}/><rect x="3.5" y="5" width="17" height="16" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/><circle cx="8" cy="14" r=".9" ${s}/><circle cx="12" cy="14" r=".9" ${s}/><circle cx="16" cy="14" r=".9" ${s}/><circle cx="8" cy="17.5" r=".9" ${s}/><circle cx="12" cy="17.5" r=".9" ${s}/>`,
  sigma: `<path ${f} d="M18 5H6.5l6 7-6 7H18z"/><path d="M18 5H6.5l6 7-6 7H18"/>`,
  atom: `<ellipse cx="12" cy="12" rx="9.5" ry="3.8"/><ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(120 12 12)"/><circle cx="12" cy="12" r="1.8" ${s}/>`,
  mountain: `<path ${f} d="M2.5 20 9 8.5l4 6.5 2.5-3.5 6 8.5z"/><path d="M2.5 20 9 8.5l4 6.5 2.5-3.5 6 8.5z"/>`,
  peak: `<path ${f} d="M2.5 20 12 4l9.5 16z"/><path d="M2.5 20 12 4l9.5 16zM8.3 10.8l2.2 2 1.5-1.6 1.7 1.6 2.3-2"/>`,
  sunrise: `<path ${f} d="M4 18a8 8 0 0 1 16 0z"/><path d="M4 18a8 8 0 0 1 16 0M2.5 18h19M12 4.5V7M5 8.5l1.7 1.7M19 8.5l-1.7 1.7M7 21.5h10"/>`,
  gear: `<path ${f} d="M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8z"/><path d="M10.3 2.8h3.4l.5 2.4 1.5.7 2.1-1.3 2.4 2.4-1.3 2.1.7 1.5 2.4.5v3.4l-2.4.5-.7 1.5 1.3 2.1-2.4 2.4-2.1-1.3-1.5.7-.5 2.4h-3.4l-.5-2.4-1.5-.7-2.1 1.3-2.4-2.4 1.3-2.1-.7-1.5-2.4-.5v-3.4l2.4-.5.7-1.5-1.3-2.1 2.4-2.4 2.1 1.3 1.5-.7z"/><circle cx="12" cy="12" r="3.4"/>`,
  scale: `<path d="M12 4v16M7 20h10M4 7h16"/><path ${f} d="M4 7 1.8 13.3a3 3 0 0 0 4.4 0zM20 7l-2.2 6.3a3 3 0 0 0 4.4 0z"/><path d="M4 7 1.8 13.3a3 3 0 0 0 4.4 0zM20 7l-2.2 6.3a3 3 0 0 0 4.4 0z"/>`,
  cycle: `<path d="M20 12a8 8 0 0 1-13.7 5.6M4 12a8 8 0 0 1 13.7-5.6"/><path d="M17.7 3v3.6h-3.6M6.3 21v-3.6h3.6"/><path d="M12 9.2v5.6M9.2 12h5.6"/>`,
  bandage: `<g transform="rotate(-45 12 12)"><rect x="2" y="8" width="20" height="8" rx="4" ${f}/><rect x="2" y="8" width="20" height="8" rx="4"/><rect x="9" y="8" width="6" height="8"/><path d="M11 11h.01M13 11h.01M11 13h.01M13 13h.01" stroke-width="1.7"/></g>`,
  pencil: `<path ${f} d="M4 20l1-5L16.4 3.6a2.1 2.1 0 0 1 3 3L8 18z"/><path d="M4 20l1-5L16.4 3.6a2.1 2.1 0 0 1 3 3L8 18zM14.5 5.5l3 3"/>`,
  trophy: `<path ${f} d="M7 4h10v5.5a5 5 0 0 1-10 0z"/><path d="M7 4h10v5.5a5 5 0 0 1-10 0zM7 6H4v2.2A3.3 3.3 0 0 0 7.3 11.5M17 6h3v2.2a3.3 3.3 0 0 1-3.3 3.3M12 14.5V18M8 20.5h8M9.5 18h5"/>`,
  sparkles: `<path ${f} d="M10 3.5 12 10l6.5 2-6.5 2-2 6.5L8 14l-6.5-2L8 10z"/><path d="M10 3.5 12 10l6.5 2-6.5 2-2 6.5L8 14l-6.5-2L8 10zM18.5 3v4M16.5 5h4M19 16.5v4M17 18.5h4"/>`,
  party: `<path ${f} d="M3.5 20.5 8 8.5l7.5 7.5z"/><path d="M3.5 20.5 8 8.5l7.5 7.5zM11 5c.8 1.4.8 2.6 0 4M16 9c1.4-.8 2.6-.8 4 0M19 4.5 17.5 6"/><circle cx="14.5" cy="3.8" r=".9" ${s}/><circle cx="20.5" cy="14.5" r=".9" ${s}/>`,
  building: `<path ${f} d="M3 9.5 12 4l9 5.5z"/><path d="M3 9.5 12 4l9 5.5zM6 12v6M10 12v6M14 12v6M18 12v6M3.5 20.5h17"/>`,
  pickaxe: `<path d="M4.5 20.5 14.5 10.5"/><path ${f} d="M7.5 5C13 3.5 18.5 6 21 11.5c-2-1.3-4-1.8-6.2-1.3L12.5 7.8C11 6.2 9.4 5.4 7.5 5z"/><path d="M7.5 5C13 3.5 18.5 6 21 11.5c-2-1.3-4-1.8-6.2-1.3"/>`,
  boot: `<path ${f} d="M6 3h6v7.5c0 1 .6 1.8 1.6 2.2l4.6 1.8c1.1.4 1.8 1.4 1.8 2.5v2.5H5z"/><path d="M6 3h6v7.5c0 1 .6 1.8 1.6 2.2l4.6 1.8c1.1.4 1.8 1.4 1.8 2.5v2.5H5zM8.5 6.5h3.5M8.5 9h3.5"/>`,
  lotus: `<circle cx="12" cy="5.2" r="2.2" ${s}/><path d="M12 8.5v4.5M7 11.2c3.2 1.6 6.8 1.6 10 0M4.5 18.5c3-.2 5.2-2.2 7.5-5.5 2.3 3.3 4.5 5.3 7.5 5.5M7 20.5h10"/>`,
  stethoscope: `<path d="M6 3v6a4 4 0 0 0 8 0V3M10 13v2.5a4.5 4.5 0 0 0 9 0V14M5 3h2M13 3h2"/><circle cx="19" cy="12" r="2" ${f}/><circle cx="19" cy="12" r="2"/>`,
  thermo: `<path ${f} d="M10 4.5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0z"/><path d="M10 4.5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0zM12 8.5v6"/><circle cx="12" cy="17" r="1.4" ${s}/>`,
  bell: `<path ${f} d="M6 16.5v-5a6 6 0 0 1 12 0v5l1.8 2H4.2z"/><path d="M6 16.5v-5a6 6 0 0 1 12 0v5l1.8 2H4.2zM10 21h4"/>`,
  disk: `<path ${f} d="M5.5 3.5h11l3 3v12a2 2 0 0 1-2 2h-12a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2z"/><path d="M5.5 3.5h11l3 3v12a2 2 0 0 1-2 2h-12a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2z"/><rect x="8" y="3.5" width="7" height="5"/><rect x="7" y="13" width="10" height="7.5" rx="1"/>`,
  target: `<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5" ${f}/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.6" ${s}/>`,
  star: `<path ${f} d="M12 2.8l2.8 5.8 6.4.9-4.6 4.5 1.1 6.3-5.7-3-5.7 3 1.1-6.3-4.6-4.5 6.4-.9z"/><path d="M12 2.8l2.8 5.8 6.4.9-4.6 4.5 1.1 6.3-5.7-3-5.7 3 1.1-6.3-4.6-4.5 6.4-.9z"/>`,
  check: `<circle cx="12" cy="12" r="9" ${f}/><circle cx="12" cy="12" r="9"/><path d="M7.8 12.4l3 3 5.6-6.2"/>`,
  wind: `<path d="M3 8h10a2.5 2.5 0 1 0-2.5-2.5M3 12h15a2.5 2.5 0 1 1-2.5 2.5M3 16h8a2.2 2.2 0 1 1-2.2 2.2"/>`,
};

// Palette chaude et variée : jaunes, ambres, orangés, terres, rosés, sables. Aucun bleu, violet ni vert.
export const COLORS = {
  run: '#E0794A', bolt: '#F4D06F', books: '#C99A5B', book: '#D9B77E', chip: '#D4735F', globe: '#E8A13A',
  pen: '#D68F86', stopwatch: '#E3C07A', warning: '#F0A030', chart: '#D08A5A', moon: '#E8D3A0', calendar: '#C9A27A',
  sigma: '#E39A3B', atom: '#D2694B', mountain: '#B98A5C', peak: '#C4A27A', sunrise: '#F09A5B', scale: '#BBA677', cycle: '#E8B25E', gear: '#C9A27A',
  bandage: '#E5A08A', pencil: '#C9B27C', trophy: '#F0B93B', sparkles: '#F6D98A', party: '#E67A6B', building: '#CDB68A',
  pickaxe: '#C8794A', boot: '#A87A4E', lotus: '#E0A39A', stethoscope: '#D07A6A', thermo: '#E0735E', bell: '#F0C46A',
  disk: '#D5C09A', target: '#DE6F4A', star: '#F2C14E', check: '#E8B86A', wind: '#C9B79A',
};

export function iconHtml(name) {
  const body = ICONS[name];
  if (!body) return '';
  return `<span class="ico ico-${name}" style="color:${COLORS[name]}" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false">${body}</svg></span>`;
}

// Remplit les emplacements statiques du HTML : <span data-ico="trophy"></span>.
export function hydrateStaticIcons(root = document) {
  root.querySelectorAll('[data-ico]').forEach(n => { n.innerHTML = iconHtml(n.dataset.ico); });
}
