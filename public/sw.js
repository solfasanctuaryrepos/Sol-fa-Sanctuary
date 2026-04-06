// Sol-fa Sanctuary Service Worker v5.1
// Strategy: Bypass all app data and navigation. Only cache external CDN assets.

const CACHE_NAME = 'solfa-sanctuary-v5';

self.addEventListener('install', (event) => {
  console.log('SW v5.1 installing...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('SW v5.1 activating and cleaning old caches...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // RULE 1: Never intercept non-GET or navigation
  if (event.request.method !== 'GET' || event.request.mode === 'navigate') {
    return;
  }

  // RULE 2: Never intercept Supabase or Localhost (Dev)
  if (url.hostname.includes('supabase.co') || url.hostname === 'localhost') {
    return;
  }

  // RULE 3: Never intercept same-origin assets (JS/CSS bundles)
  if (url.origin === self.location.origin) {
    return;
  }

  // RULE 4: For everything else (CDN scripts like PDF.js, Fonts, Images),
  // use Network-First but FALLBACK to cache if offline.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Only cache successful external responses
        if (response.ok && url.origin !== self.location.origin) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});