/**
 * HOREB SECURE — SERVICE WORKER (PWA & RÉSILIENCE HORS-LIGNE)
 * Installation résiliente, Cache-first pour assets statiques, Network-first pour pages, exclusion stricte API
 */

const CACHE_NAME = 'horeb-secure-cache-v2.9.0';

const STATIC_ASSETS = [
  '/',
  '/login',
  '/manifest.webmanifest',
  '/manifest.json',
  '/favicon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/logo-shield.png',
  '/horeb-secure-logo.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Pré-mise en cache résiliente : un échec sur une ressource ne bloque pas l'installation du SW
      await Promise.allSettled(
        STATIC_ASSETS.map(async (asset) => {
          try {
            const response = await fetch(asset, { cache: 'no-cache' });
            if (response && response.ok) {
              await cache.put(asset, response);
            }
          } catch (err) {
            console.warn('[HOREB SECURE SW] Pré-cache facultatif ignoré pour:', asset);
          }
        })
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. NE JAMAIS intercepter ni mettre en cache les requêtes d'API, Supabase, Twilio ou les méthodes non-GET
  if (
    event.request.method !== 'GET' ||
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('twilio.com')
  ) {
    return;
  }

  // 1b. Ne jamais mettre en cache les flux RSC / données Next.js : ils contiennent des données
  // propres à l'utilisateur connecté et deviennent incohérents après chaque déploiement.
  if (
    url.searchParams.has('_rsc') ||
    event.request.headers.get('RSC') === '1' ||
    event.request.headers.get('Next-Router-Prefetch') ||
    url.pathname.startsWith('/_next/data/')
  ) {
    return;
  }

  // 2. Gestion Network-first pour la navigation (pages HTML)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        const indexCached = await caches.match('/');
        return indexCached || caches.match('/login');
      })
    );
    return;
  }

  // 3. Stale-while-revalidate pour assets statiques (images, css, scripts)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => cached);

      return cached || fetchPromise;
    })
  );
});
