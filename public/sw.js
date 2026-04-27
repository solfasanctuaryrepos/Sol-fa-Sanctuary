// Sol-fa Sanctuary Service Worker v7.0
// Strategy: App shell caching + SPA offline support + CDN fallback + offline sheet PDFs

const APP_SHELL_CACHE    = 'solfa-app-shell-v7.0';
const CDN_CACHE          = 'solfa-cdn-v7.0';
const OFFLINE_SHEETS_CACHE = 'solfa-offline-sheets-v1'; // never versioned — user data

// A guaranteed fallback Response so we never return undefined to the browser
const offlineResponse = () => new Response('Offline — please check your connection.', {
  status: 503,
  headers: { 'Content-Type': 'text/plain' },
});

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then(cache =>
      cache.addAll(['/', '/index.html']).catch(() => {
        // Non-fatal: cache may fail on first install if offline
      })
    )
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(
        names
          // Keep offline-sheets cache across SW versions — it holds user data
          .filter(n => n !== APP_SHELL_CACHE && n !== CDN_CACHE && n !== OFFLINE_SHEETS_CACHE)
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

  // ── Offline sheets: check user-saved cache FIRST for Supabase storage URLs ──
  // This runs before the "never intercept Supabase" bail-out so saved PDFs
  // and thumbnails are served from cache even without a network connection.
  const isSupabaseStorage = (
    url.hostname === 'api.solfasanctuary.com' &&
    (url.pathname.startsWith('/storage/') || url.pathname.startsWith('/object/'))
  ) || (
    url.hostname.includes('supabasekong') &&
    (url.pathname.startsWith('/storage/') || url.pathname.startsWith('/object/'))
  );

  if (isSupabaseStorage) {
    event.respondWith(
      caches.open(OFFLINE_SHEETS_CACHE).then(async cache => {
        const cached = await cache.match(request);
        if (cached) return cached;
        // Not saved offline — try network normally
        return fetch(request).catch(() => offlineResponse());
      })
    );
    return;
  }

  // Never intercept other Supabase API calls (auth, realtime, DB queries)
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('supabasekong') ||
    url.hostname === '76.13.138.43' ||
    url.hostname === 'api.solfasanctuary.com'
  ) return;

  // Navigation requests: serve index.html from cache for SPA offline support
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html').then(cached => {
        if (cached) return cached;
        return fetch(request).catch(() => offlineResponse());
      })
    );
    return;
  }

  // Same-origin assets (JS/CSS/images): stale-while-revalidate
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(APP_SHELL_CACHE).then(async cache => {
        const cached = await cache.match(request);
        const networkPromise = fetch(request).then(response => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        }).catch(() => null);
        if (cached) return cached;
        return networkPromise.then(res => res || offlineResponse());
      })
    );
    return;
  }

  // External CDN (PDF.js, fonts, etc): network-first with cache fallback
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CDN_CACHE).then(cache => cache.put(request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then(cached => cached || offlineResponse())
      )
  );
});
