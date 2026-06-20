// ============================================================================
// Hélios — Service Worker
// Cache l'app pour qu'elle marche hors-ligne, se charge instantanément,
// et se met à jour automatiquement dès qu'une nouvelle version est déployée.
// ============================================================================

const VERSION = 'helios-v5';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// ── Installation : on précharge tous les assets locaux dans un cache versionné.
// skipWaiting() pour ne pas rester bloqué en "waiting" derrière l'ancien SW.
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION).then(cache => cache.addAll(ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

// ── Activation : on supprime les caches des anciennes versions, on prend la main
// sur tous les clients déjà ouverts, puis on leur envoie un message pour qu'ils
// se rechargent eux-mêmes avec la nouvelle version.
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)));
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
    e.respondWith(networkFirst(req));
    return;
  }

  // Navigation HTML : on tente le réseau d'abord pour ne pas servir une vieille app.
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    e.respondWith(networkFirst(req, './index.html'));
    return;
  }

  // Autres assets locaux (JS/CSS/SVG) : stale-while-revalidate.
  e.respondWith(staleWhileRevalidate(req));
});

async function networkFirst(req, fallbackPath) {
  try {
    const resp = await fetch(req);
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
