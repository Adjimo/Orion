// ============================================================================
// Orion — Service Worker
// Cache l'app pour qu'elle marche hors-ligne et se charge instantanément.
// ============================================================================

const VERSION = 'orion-v5';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  // Externes (Leaflet, Chart.js, fonts) - mises en cache au premier accès
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION).then(cache => cache.addAll(ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== VERSION).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Stratégie : Cache First, fallback Network. Pour les CDN externes : network-first.
  const url = new URL(e.request.url);
  const isExternal = url.origin !== self.location.origin;

  if (isExternal) {
    // Network-first pour les CDN, mais cache les réponses
    e.respondWith(
      fetch(e.request).then(resp => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(VERSION).then(c => c.put(e.request, clone)).catch(() => {});
        }
        return resp;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Cache-first pour les assets locaux
  e.respondWith(
    caches.match(e.request).then(cached => {
      return cached || fetch(e.request).then(resp => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(VERSION).then(c => c.put(e.request, clone)).catch(() => {});
        }
        return resp;
      }).catch(() => {
        // Fallback à index.html pour la navigation SPA
        if (e.request.mode === 'navigate') return caches.match('./index.html');
      });
    })
  );
});
