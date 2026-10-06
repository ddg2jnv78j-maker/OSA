const BASE_PATH = self.location.pathname.replace(/service-worker\\.js$/, '');
const CACHE_NAME = 'osa-pwa-cache-v4';
const OFFLINE_URL = `${BASE_PATH}offline.html`;
const PRECACHE_ASSETS = [
  'offline.html',
  'manifest.webmanifest',
  'icon.svg',
  'icons/osa-icon.svg',
  'pwa-192x192.png',
  'pwa-512x512.png',
  'apple-touch-icon.png',
].map((asset) => `${BASE_PATH}${asset}`);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS).catch(() => cache.add(OFFLINE_URL)))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => key !== CACHE_NAME ? caches.delete(key) : Promise.resolve()))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (
    url.pathname.startsWith(`${BASE_PATH}src/`) ||
    url.pathname.startsWith(`${BASE_PATH}node_modules/`) ||
    url.pathname.startsWith(`${BASE_PATH}@`) ||
    url.search.includes('v=') ||
    url.search.includes('t=')
  ) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match(OFFLINE_URL)) || Response.error();
      })
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(async () => (await caches.match(event.request)) || new Response('Offline', { status: 503 }))
  );
});

self.addEventListener('push', (event) => {
  let payload = {
    title: 'OSA',
    body: 'You have a new message on OSA.',
    icon: `${BASE_PATH}pwa-192x192.png`,
    badge: `${BASE_PATH}pwa-192x192.png`,
    tag: 'osa-notification',
    data: { url: BASE_PATH },
  };
  if (event.data) {
    try { payload = { ...payload, ...event.data.json() }; }
    catch { payload.body = event.data.text(); }
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || 'OSA', {
      body: payload.body,
      icon: payload.icon || `${BASE_PATH}pwa-192x192.png`,
      badge: payload.badge || `${BASE_PATH}pwa-192x192.png`,
      tag: payload.tag || 'osa-notification',
      data: payload.data || { url: BASE_PATH },
      vibrate: [150, 80, 150],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || BASE_PATH;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.postMessage({ type: 'OSA_NOTIFICATION_CLICK', data: event.notification.data });
          return client.focus();
        }
      }
      return self.clients.openWindow ? self.clients.openWindow(targetUrl) : undefined;
    })
  );
});
