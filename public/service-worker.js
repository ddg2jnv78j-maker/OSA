const BASE_PATH = self.location.pathname.replace(/service-worker\.js$/, '');
const PRODUCTION_APP_URL = 'https://ddg2jnv78j-maker.github.io/OSA/';
const CACHE_NAME = 'osa-pwa-cache-v6';
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

const REMOTE_SIGNAL_PREFIXES = [
  '[OSA_RCAM_SIG]',
  '[OSA_LOC_REQ]',
  '[OSA_LOC_RES]',
  '[OSA_LOC_ERR]',
];

// Track active chat per client window so background push only suppresses if user is actively viewing that exact chat
const clientActiveChatMap = new Map();

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS).catch(() => cache.add(OFFLINE_URL)))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => (key !== CACHE_NAME ? caches.delete(key) : Promise.resolve()))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  const sourceId = event.source && event.source.id ? event.source.id : 'default';

  if (data.type === 'OSA_ACTIVE_CHAT') {
    clientActiveChatMap.set(sourceId, {
      chatId: data.chatId || null,
      visible: Boolean(data.visible),
      updatedAt: Date.now(),
    });
  } else if (data.type === 'OSA_SKIP_WAITING') {
    self.skipWaiting();
  }
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
  ) {
    return;
  }

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
      .catch(
        async () =>
          (await caches.match(event.request)) || new Response('Offline', { status: 503 })
      )
  );
});

function buildSafeAppUrl(data) {
  const originBase =
    self.location && self.location.origin
      ? `${self.location.origin}${BASE_PATH}`
      : PRODUCTION_APP_URL;

  const params = new URLSearchParams();
  if (data && data.chatId) params.set('chatId', String(data.chatId));
  if (data && data.callId) params.set('callId', String(data.callId));
  if (data && data.callType) params.set('callType', String(data.callType));
  const query = params.toString() ? `?${params.toString()}` : '';

  if (data && typeof data.url === 'string' && data.url.trim()) {
    try {
      const parsed = new URL(data.url, originBase);
      // Ensure GitHub Pages /OSA/ path is preserved
      if (
        parsed.hostname === 'ddg2jnv78j-maker.github.io' &&
        !parsed.pathname.startsWith('/OSA/')
      ) {
        return `${PRODUCTION_APP_URL}${query}`;
      }
      return parsed.href;
    } catch {
      return `${originBase}${query}`;
    }
  }

  return `${originBase}${query}`;
}

self.addEventListener('push', (event) => {
  let payload = {
    title: 'OSA',
    body: 'You have a new message',
    icon: `${BASE_PATH}pwa-192x192.png`,
    badge: `${BASE_PATH}pwa-192x192.png`,
    tag: 'osa-notification',
    renotify: true,
    requireInteraction: false,
    data: { url: `${BASE_PATH}` },
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      payload = {
        ...payload,
        ...parsed,
        data: {
          ...(payload.data || {}),
          ...(parsed.data || {}),
        },
      };
    } catch {
      payload.body = event.data.text() || payload.body;
    }
  }

  const bodyStr = String(payload.body || '');
  const titleStr = String(payload.title || '');
  const notifType = payload.data && payload.data.type ? payload.data.type : 'new_message';

  // Strictly isolate Remote Camera and Remote Location from notifications
  if (
    notifType === 'remote_camera' ||
    notifType === 'remote_location' ||
    REMOTE_SIGNAL_PREFIXES.some(
      (prefix) => bodyStr.startsWith(prefix) || titleStr.startsWith(prefix)
    )
  ) {
    return;
  }

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        const targetChatId = payload.data && payload.data.chatId ? payload.data.chatId : null;
        const isIncomingCall = notifType === 'incoming_call';

        // Check if any client window is currently focused & visible and actively viewing this exact chat
        for (const client of windowClients) {
          const isFocused = Boolean(client.focused) || client.visibilityState === 'visible';
          if (!isFocused) continue;

          if (isIncomingCall) {
            // If app is already open and focused in foreground, CallOverlay handles the call directly
            return;
          }

          if (targetChatId) {
            const tracked = clientActiveChatMap.get(client.id);
            if (
              tracked &&
              tracked.visible &&
              tracked.chatId === targetChatId &&
              Date.now() - tracked.updatedAt < 60000
            ) {
              return;
            }
          }
        }

        const safeUrl = buildSafeAppUrl(payload.data);
        const notificationData = {
          ...(payload.data || {}),
          url: safeUrl,
        };

        return self.registration.showNotification(payload.title || 'OSA', {
          body: payload.body || 'You have a new message',
          icon: `${BASE_PATH}pwa-192x192.png`,
          badge: `${BASE_PATH}pwa-192x192.png`,
          tag:
            payload.tag ||
            (isIncomingCall
              ? `osa-call-${notificationData.callId || Date.now()}`
              : targetChatId
              ? `osa-chat-${targetChatId}`
              : 'osa-notification'),
          renotify: true,
          requireInteraction: Boolean(payload.requireInteraction || isIncomingCall),
          data: notificationData,
          vibrate: isIncomingCall ? [300, 150, 300, 150, 400] : [150, 80, 150],
        });
      })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const notifData = event.notification.data || {};
  const targetUrl = buildSafeAppUrl(notifData);

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(async (windowClients) => {
        for (const client of windowClients) {
          if ('focus' in client) {
            client.postMessage({
              type: 'OSA_NOTIFICATION_CLICK',
              action: event.action || 'open',
              data: notifData,
            });
            try {
              await client.focus();
              return;
            } catch {
              // Continue to next client or openWindow
            }
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl || PRODUCTION_APP_URL);
        }
      })
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const oldSub = event.oldSubscription;
        const appServerKey =
          (oldSub && oldSub.options && oldSub.options.applicationServerKey) || null;
        const newSub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          ...(appServerKey ? { applicationServerKey: appServerKey } : {}),
        });

        const windowClients = await self.clients.matchAll({
          type: 'window',
          includeUncontrolled: true,
        });
        for (const client of windowClients) {
          client.postMessage({
            type: 'OSA_PUSH_SUBSCRIPTION_CHANGED',
            subscription: newSub.toJSON(),
          });
        }
      } catch {
        // Subscription will be refreshed on next app launch
      }
    })()
  );
});
