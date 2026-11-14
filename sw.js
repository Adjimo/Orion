// ============================================================================
// Orion — Service Worker
// Cache l'app pour qu'elle marche hors-ligne, se charge instantanément,
// et se met à jour automatiquement dès qu'une nouvelle version est déployée.
// ============================================================================

const VERSION = 'orion-v134';
// Cache des bibliothèques externes (MapLibre, Chart.js, polices) : jamais supprimé lors d'une mise à jour
// de l'app, pour que la carte et les graphiques marchent hors ligne dès la 1re ouverture en ligne.
const CDN_CACHE = 'orion-cdn-v1';
const CDN_URLS = [
  'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css',
  'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
  'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700&family=Cormorant+Garamond:wght@500;600;700&display=swap',
];
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './js/core/calendar.js',
  './js/core/dates.js',
  './js/core/db.js',
  './js/core/state.js',
  './js/core/xp.js',
  './js/features/backup.js',
  './js/features/caracs.js',
  './js/features/work-goals.js',
  './js/features/exams.js',
  './js/features/gpx.js',
  './js/features/penalties.js',
  './js/features/planning-data.js',
  './js/features/planning.js',
  './js/features/quests.js',
  './js/features/records.js',
  './js/features/storage.js',
  './js/features/schedule.js',
  './js/features/seed.js',
  './js/features/todo-cycle.js',
  './js/features/competences.js',
  './js/features/todo-recur.js',
  './js/features/prefs.js',
  './js/features/todo-data.js',
  './js/features/todo.js',
  './js/features/weekly-goals.js',
  './js/features/work.js',
  './js/main.js',
  './js/pages/todo-settings.js',
  './js/ui/todo-widgets.js',
  './js/pages/caracs-card.js',
  './js/pages/caracs-settings.js',
  './js/pages/home.js',
  './js/pages/options.js',
  './js/pages/onboarding.js', './js/pages/hours-editor.js',
  './js/pages/planning.js',
  './js/pages/profile.js',
  './js/pages/quests.js',
  './js/pages/skills-panels.js',
  './js/pages/sport.js',
  './js/pages/stats.js',
  './js/ui/helpers.js',
  './js/ui/icons.js',
  './js/ui/router.js',
  './manifest.json',
  './icons/orion-favicon.png?v=5',
  './icons/logo.png',
  './icons/orion-192.png?v=5',
  './icons/orion-512.png?v=5',
  './icons/orion-maskable-512.png?v=5',
  './icons/badge.png',
  './icons/ui/tab-planning.png',
  './icons/ui/tab-planning-mono.png',
  './icons/ui/tab-todo.png',
  './icons/ui/tab-todo-mono.png',
];

// ── Installation : on précharge tous les assets locaux dans un cache versionné.
// skipWaiting() pour ne pas rester bloqué en "waiting" derrière l'ancien SW.
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION).then(cache => Promise.all(ASSETS.map(u => fetch(new Request(u, { cache: 'reload' })).then(r => r.ok && cache.put(u, r)).catch(() => {}))))   // 'reload' : jamais depuis le cache HTTP du navigateur
  );
  // Préchargement best-effort des bibliothèques externes (réponses « opaques » acceptées).
  e.waitUntil(caches.open(CDN_CACHE).then(cache => Promise.all(CDN_URLS.map(u =>
    cache.match(u).then(hit => hit || fetch(u, { mode: 'no-cors' }).then(r => cache.put(u, r))).catch(() => {})
  ))));
  self.skipWaiting();
});

// ── Activation : on supprime les caches des anciennes versions, on prend la main
// sur tous les clients déjà ouverts, puis on leur envoie un message pour qu'ils
// se rechargent eux-mêmes avec la nouvelle version.
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION && k !== CDN_CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const client of clients) {
      client.postMessage({ type: 'SW_ACTIVATED', version: VERSION });
    }
  })());
});

// ── Réception de messages depuis l'app (utilisés pour debug / forçage manuel).
self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (e.data?.type === 'GET_VERSION') {
    e.source?.postMessage({ type: 'VERSION', version: VERSION });
  } else if (e.data?.type === 'CLEAR_CACHE') {
    e.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
      e.source?.postMessage({ type: 'CACHE_CLEARED' });
    })());
  }
});

// ── Stratégie de fetch.
// Local : "stale-while-revalidate" — on sert le cache immédiatement (rapide),
// puis on rafraîchit en arrière-plan pour la prochaine ouverture.
// Externe : network-first avec fallback cache, MAIS on laisse passer
// directement les tiles map (basemaps.cartocdn.com) sans interception —
// l'interception cassait le rendu d'images cross-origin sur certains navigateurs.
// HTML (navigation) : network-first pour récupérer les updates au plus vite.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Tiles map et autres ressources sensibles au CORS : on n'intercepte pas du tout.
  // Le navigateur les fait passer directement au réseau comme d'habitude.
  if (url.hostname.endsWith('basemaps.cartocdn.com') ||
      url.hostname.endsWith('tile.openstreetmap.org') ||
      url.hostname.endsWith('maps.wikimedia.org') ||
      url.hostname.endsWith('tiles.openfreemap.org')) {
    return;
  }

  const isExternal = url.origin !== self.location.origin;
  if (isExternal) {
    e.respondWith(externalCached(req));
    return;
  }

  // Navigation HTML : on tente le réseau d'abord pour ne pas servir une vieille app.
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    e.respondWith(networkFirst(req, './index.html'));
    return;
  }

  // Manifeste : toujours le réseau d'abord (sinon l'ancienne icône peut revenir après l'installation).
  if (/manifest\.json$/.test(url.pathname)) {
    e.respondWith(networkFirst(req));
    return;
  }

  // JS / CSS : réseau d'abord (cache en secours hors-ligne), pour ne jamais mélanger d'anciens
  // et de nouveaux modules après une mise à jour (écran vide sur une page).
  if (/\.(js|css)$/.test(url.pathname)) {
    e.respondWith(networkFirst(req));
    return;
  }

  // Autres assets locaux (images, icônes) : stale-while-revalidate.
  e.respondWith(staleWhileRevalidate(req));
});

// Ressources externes : cache d'abord (versions épinglées dans l'URL), rafraîchi en arrière-plan.
// Les réponses opaques (script/CSS sans CORS) sont acceptées : resp.ok y vaut toujours false.
async function externalCached(req) {
  const cache = await caches.open(CDN_CACHE);
  const cached = await cache.match(req);
  const network = fetch(req).then(resp => {
    if (resp.ok || resp.type === 'opaque') cache.put(req, resp.clone()).catch(() => {});
    return resp;
  }).catch(() => null);
  return cached || (await network) || Response.error();
}

async function networkFirst(req, fallbackPath) {
  try {
    const resp = await fetch(new Request(req, { cache: 'no-cache' }));   // revalide toujours auprès du serveur : plus de vieux scripts servis par le cache HTTP
    if (resp.ok) {
      const cache = await caches.open(VERSION);
      cache.put(req, resp.clone()).catch(() => {});
    }
    return resp;
  } catch {
    const cached = await caches.match(req);
    if (cached) return cached;
    if (fallbackPath) return caches.match(fallbackPath);
    return Response.error();
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(req);
  const networkPromise = fetch(req).then(resp => {
    if (resp.ok) cache.put(req, resp.clone()).catch(() => {});
    return resp;
  }).catch(() => null);
  // Sert le cache si dispo (rapide), sinon attend le réseau.
  return cached || (await networkPromise) || Response.error();
}

// ── Clic sur une notification : on ramène l'app au premier plan.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (all.length) return all[0].focus();
    return self.clients.openWindow('./');
  })());
});
