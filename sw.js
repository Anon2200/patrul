'use strict';

const CACHE_NAME = 'patrul-static-20261115-03';
const ASSETS = [
  '/', '/index.html', '/icon-180.png', '/icon-192.png', '/icon-512.png',
  '/cloud-sync.js', '/ops-workspace.js', '/personal-workspace.js', '/staff-workspace.js', '/mail.html', '/mail.js', '/mail-viewer.html', '/mail-viewer.js',
  '/zam.html', '/zam.webmanifest',
  '/dokumentoved.html', '/dokumentoved.webmanifest',
  '/patrol-senior.html', '/patrol-senior.js',
  '/nachalnik.html', '/nachalnik.webmanifest',
  '/uchet.html', '/uchet.webmanifest'
];
const ASSET_PATHS = new Set(ASSETS);

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Никогда не кешируем API: ответы могут содержать служебные данные.
  if (url.pathname.startsWith('/api/')) return;

  // Кешируем только заранее перечисленные статические файлы.
  if (!ASSET_PATHS.has(url.pathname)) return;

  // Versioned script URLs force a fresh deployment fetch. Store by path so
  // the same current asset remains available when the browser is offline.
  const cacheKey = new Request(url.origin + url.pathname);
  event.respondWith(
    fetch(request).then(response => {
      if (response.ok && response.type === 'basic') {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(cacheKey, copy));
      }
      return response;
    }).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match(request)) || cache.match(cacheKey);
    })
  );
});
