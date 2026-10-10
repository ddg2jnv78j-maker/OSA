import { supabase } from '../lib/supabase';
import { notifyNativeIncomingCallDismissed } from './nativeMobileBridge';

export interface OSANotificationPreferences {
  pushEnabled: boolean;
  messageNotifications: boolean;
  groupNotifications: boolean;
  callNotifications: boolean;
  statusNotifications: boolean;
  updatedAt: string;
}

export interface StoredPushSubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  device_metadata: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const NOTIF_PREFS_STORAGE_KEY = 'osa_notification_preferences_v1';
const VAPID_PUB_CACHE_KEY = 'osa_cached_vapid_public_key';

const REMOTE_SIGNAL_PREFIXES = [
  '[OSA_RCAM_SIG]',
  '[OSA_LOC_REQ]',
  '[OSA_LOC_RES]',
  '[OSA_LOC_ERR]',
];

const DEFAULT_NOTIFICATION_PREFS: OSANotificationPreferences = {
  pushEnabled: true,
  messageNotifications: true,
  groupNotifications: true,
  callNotifications: true,
  statusNotifications: true,
  updatedAt: new Date().toISOString(),
};

let cachedVapidPublicKey: string | null = null;
let inFlightSubscribePromise: Promise<StoredPushSubscriptionRow | null> | null = null;
const deliveredEventKeys = new Map<string, number>();
const foregroundUnreadCountByChat = new Map<string, number>();

interface QueuedMessageBatch {
  firstQueuedAt: number;
  timerId: number;
  count: number;
  latestParams: Parameters<typeof executeWebPushInvoke>[0];
}

const pendingMessageBatches = new Map<string, QueuedMessageBatch>();
const MESSAGE_BATCH_WINDOW_MS = 2000;
const MESSAGE_BATCH_MAX_WAIT_MS = 5000;

export function markNotificationEventDelivered(eventKey: string | null | undefined): boolean {
  if (!eventKey) return false;
  const now = Date.now();
  for (const [k, ts] of deliveredEventKeys.entries()) {
    if (now - ts > 120_000) deliveredEventKeys.delete(k);
  }
  if (deliveredEventKeys.has(eventKey)) {
    return true;
  }
  deliveredEventKeys.set(eventKey, now);
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((reg) => {
        reg.active?.postMessage({
          type: 'OSA_REGISTER_NOTIFICATION_EVENT',
          eventKey,
        });
      })
      .catch(() => {});
  }
  return false;
}

if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    const data = event.data;
    if (data && data.type === 'OSA_PUSH_DELIVERED' && data.eventKey) {
      deliveredEventKeys.set(String(data.eventKey), Date.now());
    }
  });
}

/**
 * Converts a URL-safe base64 VAPID public key string into a Uint8Array for PushManager.subscribe.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const clean = base64String.trim();
  const padding = '='.repeat((4 - (clean.length % 4)) % 4);
  const base64 = (clean + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Detects non-sensitive device/browser metadata for multi-device subscription management.
 */
export function getSanitizedDeviceMetadata(): Record<string, unknown> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { platform: 'unknown' };
  }
  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const isStandalonePWA =
    window.matchMedia?.('(display-mode: standalone)')?.matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;

  let deviceType = 'Desktop';
  if (isIOS) deviceType = 'iOS';
  else if (isAndroid) deviceType = 'Android';

  let browser = 'Browser';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';

  return {
    deviceType,
    browser,
    isStandalonePWA,
    language: navigator.language || 'en',
  };
}

/**
 * Checks whether the current browser/OS supports Web Push notifications.
 */
export function getWebPushSupportInfo(): {
  supported: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isStandalonePWA: boolean;
  permission: NotificationPermission | 'unsupported';
  requiresHomeScreenInstallOnIOS: boolean;
} {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      supported: false,
      isIOS: false,
      isAndroid: false,
      isStandalonePWA: false,
      permission: 'unsupported',
      requiresHomeScreenInstallOnIOS: false,
    };
  }

  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const isStandalonePWA =
    window.matchMedia?.('(display-mode: standalone)')?.matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;

  const hasSW = 'serviceWorker' in navigator;
  const hasPush = 'PushManager' in window;
  const hasNotification = 'Notification' in window;
  const supported = hasSW && hasPush && hasNotification;
  const permission: NotificationPermission | 'unsupported' = hasNotification
    ? Notification.permission
    : 'unsupported';

  return {
    supported,
    isIOS,
    isAndroid,
    isStandalonePWA,
    permission,
    requiresHomeScreenInstallOnIOS: isIOS && !isStandalonePWA,
  };
}

/**
 * Retrieves the configured VAPID Public Key from VITE_VAPID_PUBLIC_KEY or the send-web-push Edge Function.
 */
export async function resolveVapidPublicKey(): Promise<string | null> {
  const envKey = (import.meta.env.VITE_VAPID_PUBLIC_KEY || '').trim();
  if (envKey) {
    cachedVapidPublicKey = envKey;
    return envKey;
  }

  if (cachedVapidPublicKey) {
    return cachedVapidPublicKey;
  }

  try {
    const stored = localStorage.getItem(VAPID_PUB_CACHE_KEY);
    if (stored && stored.trim()) {
      cachedVapidPublicKey = stored.trim();
      return cachedVapidPublicKey;
    }
  } catch {
    // Ignore storage error
  }

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    const { data, error } = await supabase.functions.invoke('send-web-push', {
      body: { action: 'get_vapid_public_key' },
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    });
    if (!error && data && typeof data.vapidPublicKey === 'string' && data.vapidPublicKey.trim()) {
      const resolvedKey = data.vapidPublicKey.trim();
      cachedVapidPublicKey = resolvedKey;
      try {
        localStorage.setItem(VAPID_PUB_CACHE_KEY, resolvedKey);
      } catch {
        // Ignore
      }
      return resolvedKey;
    }
  } catch {
    // Edge Function not yet deployed or unreachable
  }

  try {
    const { data: rpcKey, error: rpcErr } = await supabase.rpc('get_public_vapid_key');
    if (!rpcErr && typeof rpcKey === 'string' && rpcKey.trim()) {
      const resolvedKey = rpcKey.trim();
      cachedVapidPublicKey = resolvedKey;
      try {
        localStorage.setItem(VAPID_PUB_CACHE_KEY, resolvedKey);
      } catch {
        // Ignore
      }
      return resolvedKey;
    }
  } catch {
    // Ignore if RPC not yet created
  }

  return null;
}

/**
 * Ensures the existing unified OSA Service Worker (`service-worker.js`) is registered under `/OSA/` or `/`.
 * Never registers a second competing service worker.
 */
async function getActiveServiceWorkerRegistration(
  timeoutMs = 1500
): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  try {
    const baseUrl = import.meta.env.BASE_URL || '/';
    const existing = await navigator.serviceWorker.getRegistration(baseUrl);
    if (existing && (existing.active || existing.waiting || existing.installing)) {
      return existing;
    }
    const readyRace = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    return readyRace;
  } catch {
    return null;
  }
}

export async function getOrRegisterOSAServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const baseUrl = import.meta.env.BASE_URL || '/';
    const swUrl = `${baseUrl}service-worker.js`;
    const existing = await navigator.serviceWorker.getRegistration(baseUrl);
    if (existing) {
      return existing;
    }
    const reg = await navigator.serviceWorker.register(swUrl, { scope: baseUrl });
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
    ]);
    return reg;
  } catch {
    return null;
  }
}

/**
 * Extracts base64url-encoded `p256dh` and `auth` keys from a browser PushSubscription.
 */
function extractSubscriptionKeys(sub: PushSubscription): {
  endpoint: string;
  p256dh: string;
  auth: string;
} | null {
  const json = sub.toJSON();
  const endpoint = (sub.endpoint || json.endpoint || '').trim();
  const p256dh = (json.keys?.p256dh || '').trim();
  const auth = (json.keys?.auth || '').trim();
  if (!endpoint || !p256dh || !auth) return null;
  return { endpoint, p256dh, auth };
}

/**
 * Saves or updates a PushSubscription in Supabase for `userId`, preventing duplicate endpoints
 * while supporting multiple active devices per user account.
 */
export async function savePushSubscriptionToSupabase(
  userId: string,
  sub: PushSubscription,
  isActive = true
): Promise<StoredPushSubscriptionRow | null> {
  if (!userId) return null;
  const extracted = extractSubscriptionKeys(sub);
  if (!extracted) return null;

  const userAgent =
    typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 250) : null;
  const deviceMetadata = getSanitizedDeviceMetadata();

  // 1. Try SECURITY DEFINER RPC `upsert_push_subscription`
  try {
    const { data: rpcRow, error: rpcError } = await supabase.rpc(
      'upsert_push_subscription',
      {
        p_endpoint: extracted.endpoint,
        p_p256dh: extracted.p256dh,
        p_auth: extracted.auth,
        p_user_agent: userAgent,
        p_device_metadata: deviceMetadata,
        p_is_active: isActive,
      }
    );
    if (!rpcError && rpcRow) {
      return rpcRow as StoredPushSubscriptionRow;
    }
  } catch {
    // Fallback to direct table upsert
  }

  // 2. Fallback: Direct upsert on public.push_subscriptions
  try {
    const { data, error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: userId,
          endpoint: extracted.endpoint,
          p256dh: extracted.p256dh,
          auth: extracted.auth,
          user_agent: userAgent,
          device_metadata: deviceMetadata,
          is_active: isActive,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'endpoint' }
      )
      .select('*')
      .maybeSingle();

    if (!error && data) {
      return data as StoredPushSubscriptionRow;
    }

    // Backwards-compatible fallback if migration adding device_metadata/is_active hasn't been run yet
    const { data: minimalData } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: userId,
          endpoint: extracted.endpoint,
          p256dh: extracted.p256dh,
          auth: extracted.auth,
          user_agent: userAgent,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'endpoint' }
      )
      .select('*')
      .maybeSingle();

    return (minimalData as StoredPushSubscriptionRow) || null;
  } catch {
    return null;
  }
}

/**
 * Registers the existing OSA Service Worker, creates or reuses a Web Push subscription,
 * and stores it in Supabase when Notification permission is granted.
 */
export async function ensureUserPushSubscription(
  userId?: string
): Promise<StoredPushSubscriptionRow | null> {
  if (!userId) return null;
  const prefs = getNotificationPreferences(userId);
  if (!prefs.pushEnabled) return null;

  const support = getWebPushSupportInfo();
  if (!support.supported || support.permission !== 'granted') {
    return null;
  }

  if (inFlightSubscribePromise) {
    return inFlightSubscribePromise;
  }

  inFlightSubscribePromise = (async () => {
    try {
      const registration = await getOrRegisterOSAServiceWorker();
      if (!registration || !registration.pushManager) {
        return null;
      }

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        const vapidPublicKey = await resolveVapidPublicKey();
        if (!vapidPublicKey) {
          return null;
        }
        const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
        try {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: applicationServerKey as unknown as BufferSource,
          });
        } catch {
          // If an old subscription with a mismatched applicationServerKey exists, reset and resubscribe
          const staleSub = await registration.pushManager.getSubscription();
          if (staleSub) {
            await staleSub.unsubscribe().catch(() => {});
          }
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: applicationServerKey as unknown as BufferSource,
          });
        }
      }

      return await savePushSubscriptionToSupabase(userId, subscription, true);
    } catch {
      return null;
    } finally {
      inFlightSubscribePromise = null;
    }
  })();

  return inFlightSubscribePromise;
}

/**
 * Deactivates or unsubscribes the current device's PushSubscription when Push Notifications are turned OFF.
 */
export async function deactivateCurrentDevicePushSubscription(
  userId?: string
): Promise<void> {
  try {
    const registration = await getOrRegisterOSAServiceWorker();
    if (!registration || !registration.pushManager) return;

    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;

    const endpoint = subscription.endpoint;
    if (userId && endpoint) {
      await supabase
        .from('push_subscriptions')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('endpoint', endpoint);
    }
  } catch {
    // Ignore
  }
}

/**
 * Fetches all active push subscriptions registered for `userId` across their devices.
 */
export async function fetchMyPushSubscriptions(
  userId: string
): Promise<StoredPushSubscriptionRow[]> {
  if (!userId) return [];
  try {
    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error || !data) return [];
    return (data as StoredPushSubscriptionRow[]).filter((row) => row.is_active !== false);
  } catch {
    return [];
  }
}

// ============================================================================
// NOTIFICATION PREFERENCES (SETTINGS -> NOTIFICATIONS)
// ============================================================================

export function getNotificationPreferences(userId?: string): OSANotificationPreferences {
  try {
    const key = userId ? `${NOTIF_PREFS_STORAGE_KEY}_${userId}` : NOTIF_PREFS_STORAGE_KEY;
    const raw = localStorage.getItem(key) || localStorage.getItem(NOTIF_PREFS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_NOTIFICATION_PREFS };
    const parsed = JSON.parse(raw) as Partial<OSANotificationPreferences>;
    return {
      ...DEFAULT_NOTIFICATION_PREFS,
      ...parsed,
    };
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFS };
  }
}

export async function saveNotificationPreferences(
  updates: Partial<OSANotificationPreferences>,
  userId?: string
): Promise<OSANotificationPreferences> {
  const current = getNotificationPreferences(userId);
  const next: OSANotificationPreferences = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  try {
    const serialized = JSON.stringify(next);
    localStorage.setItem(NOTIF_PREFS_STORAGE_KEY, serialized);
    if (userId) {
      localStorage.setItem(`${NOTIF_PREFS_STORAGE_KEY}_${userId}`, serialized);
    }
  } catch {
    // Ignore storage error
  }

  if (userId) {
    try {
      await supabase.from('user_notification_settings').upsert(
        {
          user_id: userId,
          push_enabled: next.pushEnabled,
          message_notifications: next.messageNotifications,
          group_notifications: next.groupNotifications,
          call_notifications: next.callNotifications,
          status_notifications: next.statusNotifications,
          updated_at: next.updatedAt,
        },
        { onConflict: 'user_id' }
      );
    } catch {
      // Optional table before migration is applied
    }

    if (updates.pushEnabled === false) {
      await deactivateCurrentDevicePushSubscription(userId);
    } else if (updates.pushEnabled === true) {
      await ensureUserPushSubscription(userId);
    }
  }

  return next;
}

export async function syncNotificationPreferencesFromSupabase(
  userId?: string
): Promise<OSANotificationPreferences> {
  const local = getNotificationPreferences(userId);
  if (!userId) return local;

  try {
    const { data, error } = await supabase
      .from('user_notification_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (!error && data) {
      const synced: OSANotificationPreferences = {
        pushEnabled: data.push_enabled ?? local.pushEnabled,
        messageNotifications: data.message_notifications ?? local.messageNotifications,
        groupNotifications: data.group_notifications ?? local.groupNotifications,
        callNotifications: data.call_notifications ?? local.callNotifications,
        statusNotifications: data.status_notifications ?? local.statusNotifications,
        updatedAt: data.updated_at || local.updatedAt,
      };
      const serialized = JSON.stringify(synced);
      localStorage.setItem(NOTIF_PREFS_STORAGE_KEY, serialized);
      localStorage.setItem(`${NOTIF_PREFS_STORAGE_KEY}_${userId}`, serialized);
      return synced;
    }
  } catch {
    // Ignore if table not yet migrated
  }
  return local;
}

/**
 * Informs the Service Worker and Supabase which conversation the user is currently viewing
 * so background push is only delivered when the user is NOT actively viewing that exact chat.
 */
export async function reportActiveChatForPush(
  userId: string | undefined,
  chatId: string | null,
  isVisible = true
): Promise<void> {
  if (isVisible && chatId) {
    foregroundUnreadCountByChat.delete(chatId);
    if (typeof window !== 'undefined') {
      try {
        window.OSANativeAndroid?.clearConversationNotifications?.(chatId);
      } catch {
        // Ignore
      }
      try {
        window.webkit?.messageHandlers?.OSANativeBridge?.postMessage({
          action: 'clearConversationNotifications',
          conversationId: chatId,
        });
      } catch {
        // Ignore
      }
    }
  }
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    getActiveServiceWorkerRegistration(1000)
      .then((reg) => {
        reg?.active?.postMessage({
          type: 'OSA_ACTIVE_CHAT',
          chatId: isVisible ? chatId : null,
          visible: isVisible,
        });
      })
      .catch(() => {});
  }

  if (!userId) return;
  try {
    await supabase.from('user_notification_settings').upsert(
      {
        user_id: userId,
        active_chat_id: isVisible ? chatId : null,
        active_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
  } catch {
    // Ignore if table not yet migrated
  }
}

/**
 * Triggers server-side Web Push delivery via the `send-web-push` Supabase Edge Function.
 * Strictly isolates Remote Camera & Remote Location signals and never notifies the sender.
 */
async function executeWebPushInvoke(params: {
  senderId: string;
  senderName?: string;
  recipientIds: string[];
  type:
    | 'message'
    | 'new_message'
    | 'group_message'
    | 'incoming_call'
    | 'cancel_call'
    | 'missed_call'
    | 'status_update'
    | 'system';
  title: string;
  body: string;
  chatId: string | null;
  conversationId: string | null;
  messageId?: string | null;
  messageType?: string | null;
  messageCount?: number | null;
  callId?: string | null;
  callType?: 'audio' | 'video' | null;
}): Promise<void> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    const { data: invokeData, error: invokeErr } = await supabase.functions.invoke('send-web-push', {
      body: {
        action: 'send',
        senderId: params.senderId,
        senderName: params.senderName || params.title || undefined,
        recipientIds: params.recipientIds,
        type: params.type,
        title: params.title || 'OSA',
        body: params.body || 'New message',
        chatId: params.chatId,
        conversationId: params.conversationId,
        messageId: params.messageId || null,
        messageType: params.messageType || null,
        messageCount: params.messageCount || null,
        callId: params.callId || null,
        callType: params.callType || null,
      },
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    });
    if (invokeErr) {
      console.warn('[OSA_FCM_SEND] send-web-push error:', invokeErr.message);
    } else {
      console.info('[OSA_FCM_SEND] send-web-push response:', invokeData);
    }
  } catch {
    // Fail gracefully if Edge Function is not yet deployed
  }
}

/**
 * Triggers server-side Web Push + Native FCM/APNs delivery via `send-web-push`.
 * - Incoming calls and call cancellations are dispatched IMMEDIATELY (0ms delay).
 * - Messages use a 2-second batching window (maximum 5 seconds) per conversation to group rapid bursts ("2 new messages", "5 new messages").
 * - Strictly isolates Remote Camera & Remote Location signals and never notifies the sender.
 */
export async function dispatchWebPushNotification(params: {
  senderId: string;
  senderName?: string;
  recipientIds?: string[];
  type:
    | 'message'
    | 'new_message'
    | 'group_message'
    | 'incoming_call'
    | 'cancel_call'
    | 'missed_call'
    | 'status_update'
    | 'system';
  title: string;
  body: string;
  chatId?: string | null;
  conversationId?: string | null;
  messageId?: string | null;
  messageType?: string | null;
  messageCount?: number | null;
  callId?: string | null;
  callType?: 'audio' | 'video' | null;
}): Promise<void> {
  const cleanBody = (params.body || '').trim();
  const cleanTitle = (params.title || '').trim();

  // Never send Web Push for Remote Camera or Remote Location signals
  if (
    REMOTE_SIGNAL_PREFIXES.some(
      (prefix) => cleanBody.startsWith(prefix) || cleanTitle.startsWith(prefix)
    )
  ) {
    return;
  }

  const resolvedChatId = params.conversationId || params.chatId || null;
  const targetIds = Array.from(
    new Set((params.recipientIds || []).filter((id) => Boolean(id) && id !== params.senderId))
  );

  // Allow server-side recipient resolution via chat_members when resolvedChatId is present
  if (targetIds.length === 0 && !resolvedChatId) return;

  const isCallImmediate =
    params.type === 'incoming_call' ||
    params.type === 'cancel_call' ||
    params.type === 'missed_call';

  const invokeParams = {
    senderId: params.senderId,
    senderName: params.senderName || cleanTitle || undefined,
    recipientIds: targetIds,
    type: params.type,
    title: cleanTitle || 'OSA',
    body: cleanBody || 'New message',
    chatId: resolvedChatId,
    conversationId: resolvedChatId,
    messageId: params.messageId || null,
    messageType: params.messageType || null,
    messageCount: params.messageCount || 1,
    callId: params.callId || null,
    callType: params.callType || null,
  };

  // Calls MUST be immediate — never delayed by message batching window
  if (isCallImmediate || !resolvedChatId || typeof window === 'undefined') {
    await executeWebPushInvoke(invokeParams);
    return;
  }

  const batchKey = `${params.senderId}:${resolvedChatId}`;
  const now = Date.now();
  const existingBatch = pendingMessageBatches.get(batchKey);

  if (existingBatch) {
    window.clearTimeout(existingBatch.timerId);
    // Only increment count if this is a distinct messageId (not a duplicate invocation for the same messageId)
    if (
      params.messageId &&
      existingBatch.latestParams.messageId &&
      params.messageId !== existingBatch.latestParams.messageId
    ) {
      existingBatch.count += 1;
    }
    existingBatch.latestParams = {
      ...invokeParams,
      messageCount: existingBatch.count,
    };

    const elapsed = now - existingBatch.firstQueuedAt;
    const remainingMax = Math.max(0, MESSAGE_BATCH_MAX_WAIT_MS - elapsed);
    const delayMs = Math.min(MESSAGE_BATCH_WINDOW_MS, remainingMax);

    existingBatch.timerId = window.setTimeout(() => {
      const finished = pendingMessageBatches.get(batchKey);
      pendingMessageBatches.delete(batchKey);
      if (finished) {
        executeWebPushInvoke(finished.latestParams).catch(() => {});
      }
    }, delayMs);
    return;
  }

  // Dispatch the first message immediately so single messages never wait 2 seconds,
  // while opening a 2-second batch window to coalesce any rapid follow-up messages.
  executeWebPushInvoke(invokeParams).catch(() => {});

  const timerId = window.setTimeout(() => {
    const finished = pendingMessageBatches.get(batchKey);
    pendingMessageBatches.delete(batchKey);
    if (finished && finished.count > 1) {
      executeWebPushInvoke(finished.latestParams).catch(() => {});
    }
  }, MESSAGE_BATCH_WINDOW_MS);

  pendingMessageBatches.set(batchKey, {
    firstQueuedAt: now,
    timerId,
    count: 1,
    latestParams: invokeParams,
  });
}

/**
 * Dismisses any active incoming call notification in both the Service Worker and Native Android/iOS CallKit layer.
 */
export async function dismissIncomingCallSystemNotification(
  callId: string | null | undefined
): Promise<void> {
  if (!callId) return;
  notifyNativeIncomingCallDismissed(callId);

  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const reg = await getActiveServiceWorkerRegistration(1200);
      reg?.active?.postMessage({
        type: 'OSA_DISMISS_CALL_NOTIFICATION',
        callId,
      });
      if (reg?.getNotifications) {
        const list = await reg.getNotifications({ tag: `osa-call-${callId}` });
        list.forEach((n) => n.close());
      }
    } catch {
      // Ignore
    }
  }
}

/**
 * Shows a native system notification via the unified OSA Service Worker when OSA is in another
 * browser tab or backgrounded PWA, using WhatsApp-style conversation grouping ("2 new messages", "5 new messages")
 * and deterministic tags per conversation or callId.
 */
export async function showBackgroundSystemNotification(params: {
  userId: string;
  senderId?: string | null;
  senderName?: string | null;
  type:
    | 'message'
    | 'new_message'
    | 'group_message'
    | 'incoming_call'
    | 'missed_call'
    | 'status_update'
    | 'system';
  title: string;
  body: string;
  chatId?: string | null;
  messageId?: string | null;
  callId?: string | null;
  callType?: 'audio' | 'video' | null;
}): Promise<void> {
  if (typeof window === 'undefined') return;

  const cleanBody = (params.body || '').trim();
  const cleanTitle = (params.title || '').trim();
  if (
    REMOTE_SIGNAL_PREFIXES.some(
      (prefix) => cleanBody.startsWith(prefix) || cleanTitle.startsWith(prefix)
    )
  ) {
    return;
  }

  // Never notify the sender of their own message or call
  if (params.senderId && params.senderId === params.userId) {
    return;
  }

  const prefs = getNotificationPreferences(params.userId);
  if (!prefs.pushEnabled) return;
  if (
    (params.type === 'new_message' || params.type === 'message') &&
    !prefs.messageNotifications
  ) {
    return;
  }
  if (params.type === 'group_message' && !prefs.groupNotifications) return;
  if (
    (params.type === 'incoming_call' || params.type === 'missed_call') &&
    !prefs.callNotifications
  ) {
    return;
  }
  if (
    (params.type === 'status_update' || params.type === 'system') &&
    !prefs.statusNotifications
  ) {
    return;
  }

  const isCall = params.type === 'incoming_call';
  const eventKey = isCall && params.callId
    ? `call:${params.callId}`
    : params.messageId
    ? `msg:${params.messageId}`
    : null;

  if (eventKey && markNotificationEventDelivered(eventKey)) {
    return;
  }

  // Native Android Bridge path (works in Foreground, Background, and Screen Locked with shared SharedPreferences dedup)
  if (window.OSANativeAndroid) {
    try {
      if (isCall && params.callId && window.OSANativeAndroid.showIncomingCallNotification) {
        const callerName =
          (params.senderName && params.senderName.trim()) ||
          cleanBody.replace(/\s+is calling you.*$/i, '').trim() ||
          cleanTitle ||
          'OSA Caller';
        window.OSANativeAndroid.showIncomingCallNotification(
          JSON.stringify({
            type: 'incoming_call',
            callId: params.callId,
            callType: params.callType || 'audio',
            callerId: params.senderId || '',
            callerName,
            chatId: params.chatId || '',
          })
        );
        return;
      }

      if (!isCall && window.OSANativeAndroid.showMessageNotification) {
        const senderName =
          (params.senderName && params.senderName.trim()) ||
          (cleanTitle && cleanTitle !== 'OSA' ? cleanTitle : 'OSA User');
        window.OSANativeAndroid.showMessageNotification(
          JSON.stringify({
            type: 'message',
            conversationId: params.chatId || '',
            chatId: params.chatId || '',
            messageId: params.messageId || '',
            senderId: params.senderId || '',
            senderName,
            messagePreview: cleanBody || 'New message',
          })
        );
        return;
      }
    } catch {
      // Fall through if bridge method fails
    }
  }

  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const baseUrl = import.meta.env.BASE_URL || '/';
  const tag = isCall
    ? `osa-call-${params.callId || 'incoming'}`
    : params.chatId
    ? `osa-chat-${params.chatId}`
    : params.messageId
    ? `osa-msg-${params.messageId}`
    : 'osa-notification';

  let displayTitle = cleanTitle || 'OSA';
  let displayBody = cleanBody || 'New message';
  let messageCount = 1;

  if (!isCall && params.chatId) {
    const prevCount = foregroundUnreadCountByChat.get(params.chatId) || 0;
    messageCount = prevCount + 1;
    foregroundUnreadCountByChat.set(params.chatId, messageCount);

    const senderHeader = cleanTitle && cleanTitle !== 'OSA' ? cleanTitle : 'OSA User';
    displayTitle = 'OSA';
    if (messageCount >= 2) {
      displayBody = `${senderHeader}\n${messageCount} new messages`;
    } else {
      displayBody = `${senderHeader}\n${cleanBody || 'New message'}`;
    }
  }

  const notifData = {
    type: isCall ? 'incoming_call' : 'message',
    chatId: params.chatId || null,
    conversationId: params.chatId || null,
    threadId: params.chatId || null,
    messageId: params.messageId || null,
    messageCount,
    callId: params.callId || null,
    callType: params.callType || null,
  };

  try {
    const reg = await getOrRegisterOSAServiceWorker();
    if (reg && reg.showNotification) {
      await reg.showNotification(displayTitle, {
        body: displayBody,
        icon: `${baseUrl}pwa-192x192.png`,
        badge: `${baseUrl}pwa-192x192.png`,
        tag,
        renotify: true,
        requireInteraction: isCall,
        data: notifData,
        ...(isCall
          ? {
              actions: [
                { action: 'accept', title: 'Accept' },
                { action: 'reject', title: 'Reject' },
              ],
            }
          : {}),
      } as NotificationOptions);
      return;
    }
  } catch {
    // Fallback to window Notification if SW showNotification is unavailable
  }

  try {
    const n = new Notification(displayTitle, {
      body: displayBody,
      icon: `${baseUrl}pwa-192x192.png`,
      tag,
      requireInteraction: isCall,
      data: notifData,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    // Ignore
  }
}
