/**
 * HOREB SECURE — SERVICE WORKER (PWA & RÉSILIENCE HORS-LIGNE)
 * Installation résiliente, Cache-first pour assets statiques, Network-first pour pages, exclusion stricte API
 */

const CACHE_NAME = 'horeb-secure-cache-v3.0.0';

// Pré-cache léger : page hors ligne et icônes (l'ancien pré-cache tirait un logo de 1,6 Mo à
// l'installation, coûteux sur forfait mobile).
const OFFLINE_URL = '/offline.html';
const STATIC_ASSETS = [
  OFFLINE_URL,
  '/login',
  '/manifest.webmanifest',
  '/favicon.png',
  '/icon-192.png',
  '/icon-512.png',
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
        // Hors ligne : page déjà en cache si elle existe, sinon page « Pas de connexion »
        // (plutôt que la page d'accueil commerciale, qui laissait croire à une déconnexion).
        const cached = await caches.match(event.request);
        return cached || (await caches.match(OFFLINE_URL)) || Response.error();
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
