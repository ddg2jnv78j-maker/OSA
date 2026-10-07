const BASE_PATH = self.location.pathname.replace(/service-worker\.js$/, '');
const PRODUCTION_APP_URL = 'https://ddg2jnv78j-maker.github.io/OSA/';
const CACHE_NAME = 'osa-pwa-cache-v8';
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

// Track recently displayed notification keys (messageId / callId) to prevent duplicate notifications
const deliveredEventKeys = new Map();

function markAndCheckDuplicateEvent(eventKey) {
  if (!eventKey) return false;
  const now = Date.now();
  for (const [key, ts] of deliveredEventKeys.entries()) {
    if (now - ts > 120000) {
      deliveredEventKeys.delete(key);
    }
  }
  if (deliveredEventKeys.has(eventKey)) {
    return true;
  }
  deliveredEventKeys.set(eventKey, now);
  return false;
}

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
  } else if (data.type === 'OSA_REGISTER_NOTIFICATION_EVENT' && data.eventKey) {
    deliveredEventKeys.set(String(data.eventKey), Date.now());
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

function buildSafeAppUrl(data, action) {
  const originBase =
    self.location && self.location.origin
      ? `${self.location.origin}${BASE_PATH}`
      : PRODUCTION_APP_URL;

  const params = new URLSearchParams();
  const chatId = data && (data.conversationId || data.chatId);
  if (chatId) params.set('chatId', String(chatId));
  if (data && data.callId) params.set('callId', String(data.callId));
  if (data && data.callType) params.set('callType', String(data.callType));
  if (action && action !== 'open') params.set('callAction', String(action));
  const query = params.toString() ? `?${params.toString()}` : '';

  if (data && typeof data.url === 'string' && data.url.trim() && (!action || action === 'open')) {
    try {
      const parsed = new URL(data.url, originBase);
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
    type: 'message',
    title: 'OSA',
    body: 'New message',
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
  const rawType =
    (payload.data && payload.data.type) || payload.type || 'message';

  // Strictly isolate Remote Camera and Remote Location from notifications
  if (
    rawType === 'remote_camera' ||
    rawType === 'remote_location' ||
    REMOTE_SIGNAL_PREFIXES.some(
      (prefix) => bodyStr.startsWith(prefix) || titleStr.startsWith(prefix)
    )
  ) {
    return;
  }

  const targetChatId =
    (payload.data && (payload.data.conversationId || payload.data.chatId)) ||
    payload.conversationId ||
    payload.chatId ||
    null;
  const messageId =
    (payload.data && payload.data.messageId) || payload.messageId || null;
  const callId =
    (payload.data && payload.data.callId) || payload.callId || null;
  const callType =
    (payload.data && payload.data.callType) || payload.callType || null;
  const senderId =
    (payload.data && (payload.data.senderId || payload.data.callerId)) ||
    payload.senderId ||
    payload.callerId ||
    null;
  const senderName =
    (payload.data && (payload.data.senderName || payload.data.callerName)) ||
    payload.senderName ||
    payload.callerName ||
    null;

  const isIncomingCall = rawType === 'incoming_call';

  // Deduplicate by messageId or callId
  const dedupKey = isIncomingCall && callId
    ? `call:${callId}`
    : messageId
    ? `msg:${messageId}`
    : null;

  if (dedupKey && markAndCheckDuplicateEvent(dedupKey)) {
    return;
  }

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Always wake/notify open client tabs when an incoming call or message arrives
        for (const client of windowClients) {
          try {
            if (isIncomingCall) {
              client.postMessage({
                type: 'OSA_INCOMING_CALL_PUSH',
                data: {
                  ...(payload.data || {}),
                  type: 'incoming_call',
                  callId,
                  callType: callType || 'audio',
                  callerId: senderId,
                  callerName: senderName,
                  chatId: targetChatId,
                  conversationId: targetChatId,
                },
              });
            } else if (dedupKey) {
              client.postMessage({
                type: 'OSA_PUSH_DELIVERED',
                eventKey: dedupKey,
                chatId: targetChatId,
                messageId,
              });
            }
          } catch {
            // Ignore
          }
        }

        // Check if any client window is currently focused & visible in the foreground
        for (const client of windowClients) {
          const isActivelyFocused =
            Boolean(client.focused) && client.visibilityState === 'visible';
          if (!isActivelyFocused) continue;

          if (isIncomingCall) {
            // App is actively focused in foreground — CallOverlay is already visible
            return;
          }

          if (targetChatId) {
            const tracked = clientActiveChatMap.get(client.id);
            if (
              tracked &&
              tracked.visible &&
              tracked.chatId === targetChatId &&
              Date.now() - tracked.updatedAt < 45000
            ) {
              // Recipient is inside OSA and actively viewing this exact conversation
              return;
            }
          }
        }

        const safeUrl = buildSafeAppUrl(
          {
            ...(payload.data || {}),
            chatId: targetChatId,
            conversationId: targetChatId,
            callId,
            callType,
          },
          'open'
        );

        const notificationData = {
          ...(payload.data || {}),
          type: isIncomingCall ? 'incoming_call' : 'message',
          chatId: targetChatId,
          conversationId: targetChatId,
          messageId,
          callId,
          callType: isIncomingCall ? callType || 'audio' : callType,
          senderId,
          senderName,
          callerId: isIncomingCall ? senderId : null,
          callerName: isIncomingCall ? senderName : null,
          url: safeUrl,
        };

        const computedTitle = isIncomingCall
          ? payload.title ||
            (callType === 'video' ? 'Incoming video call' : 'Incoming audio call')
          : payload.title || senderName || 'OSA';

        const computedBody = isIncomingCall
          ? payload.body || `${senderName || 'Someone'} is calling you`
          : payload.body || 'New message';

        const options = {
          body: computedBody,
          icon: `${BASE_PATH}pwa-192x192.png`,
          badge: `${BASE_PATH}pwa-192x192.png`,
          tag:
            payload.tag ||
            (isIncomingCall
              ? `osa-call-${callId || Date.now()}`
              : messageId
              ? `osa-msg-${messageId}`
              : targetChatId
              ? `osa-chat-${targetChatId}`
              : 'osa-notification'),
          renotify: true,
          requireInteraction: Boolean(payload.requireInteraction || isIncomingCall),
          data: notificationData,
          vibrate: isIncomingCall ? [300, 150, 300, 150, 400] : [150, 80, 150],
        };

        if (isIncomingCall) {
          options.actions = [
            { action: 'accept', title: 'Accept' },
            { action: 'reject', title: 'Reject' },
          ];
        }

        return self.registration.showNotification(computedTitle, options);
      })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const notifData = event.notification.data || {};
  const clickedAction = event.action || 'open';
  const targetUrl = buildSafeAppUrl(notifData, clickedAction);

  event.waitUntil(
    (async () => {
      // If user tapped Reject on an incoming call notification while OSA is closed or backgrounded,
      // immediately reject the call on the server via send-web-push Edge Function
      if (
        clickedAction === 'reject' &&
        notifData.callId &&
        notifData.rejectEndpoint &&
        notifData.rejectToken
      ) {
        try {
          await fetch(notifData.rejectEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(notifData.anonKey
                ? {
                    apikey: notifData.anonKey,
                    Authorization: `Bearer ${notifData.anonKey}`,
                  }
                : {}),
            },
            body: JSON.stringify({
              action: 'reject_call',
              callId: notifData.callId,
              rejectToken: notifData.rejectToken,
            }),
          });
        } catch {
          // Fallback to client window if available
        }
      }

      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      for (const client of windowClients) {
        if ('focus' in client) {
          client.postMessage({
            type: 'OSA_NOTIFICATION_CLICK',
            action: clickedAction,
            data: notifData,
          });
          if (clickedAction !== 'reject') {
            try {
              await client.focus();
              return;
            } catch {
              // Continue to next client or openWindow
            }
          } else {
            return;
          }
        }
      }

      // If no window is open and action is not reject, open OSA to the conversation or incoming call screen
      if (clickedAction !== 'reject' && self.clients.openWindow) {
        return self.clients.openWindow(targetUrl || PRODUCTION_APP_URL);
      }
    })()
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
