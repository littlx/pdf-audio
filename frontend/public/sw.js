const STATIC_CACHE = 'sub-pdf-static-v1';
const OFFLINE_CACHE = 'sub-pdf-offline-audio-v1';
const STATIC_ASSETS = ['/', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys
      .filter((key) => ![STATIC_CACHE, OFFLINE_CACHE].includes(key))
      .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'CLEAR_OFFLINE_CACHE') {
    event.waitUntil(caches.delete(event.data.cacheName || OFFLINE_CACHE));
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle http and https requests to avoid chrome-extension and devtools errors
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  // Handle proactive offline cached audio files and subtitle files
  if (url.pathname.includes('/api/audios/') && (url.pathname.endsWith('/file') || url.pathname.includes('/subtitles.'))) {
    event.respondWith(
      caches.open(OFFLINE_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        return fetch(event.request);
      })
    );
    return;
  }

  // Handle static assets (JS, CSS, manifest, icons) with stale-while-revalidate
  const isStaticAsset =
    url.pathname.startsWith('/assets/') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.webmanifest') ||
    url.pathname === '/' ||
    url.pathname === '/index.html';

  if (isStaticAsset) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          if (networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => undefined);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Fallback for navigation requests
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/'))
    );
  }
});
