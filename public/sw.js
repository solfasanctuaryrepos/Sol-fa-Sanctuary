// Sol-fa Sanctuary Service Worker v6
// Strategy: App shell caching + SPA offline support + CDN fallback

const APP_SHELL_CACHE = 'solfa-app-shell-v6';
const CDN_CACHE = 'solfa-cdn-v6';

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then(cache =>
      cache.addAll(['/', '/index.html'])
    )
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(
        names
          .filter(n => n !== APP_SHELL_CACHE && n !== CDN_CACHE)
          .map(n => caches.delete(n))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept non-GET
  if (request.method !== 'GET') return;

  // Never intercept Supabase
  if (url.hostname.includes('supabase.co')) return;

  // Navigation: serve index.html from cache (SPA offline support)
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html').then(cached => cached || fetch(request))
    );
    return;
  }

  // Same-origin assets (JS/CSS bundles): stale-while-revalidate
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(APP_SHELL_CACHE).then(async cache => {
        const cached = await cache.match(request);
        const networkFetch = fetch(request).then(response => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        }).catch(() => cached);
        return cached || networkFetch;
      })
    );
    return;
  }

  // External CDN: network-first with cache fallback
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          caches.open(CDN_CACHE).then(cache => cache.put(request, response.clone()));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
