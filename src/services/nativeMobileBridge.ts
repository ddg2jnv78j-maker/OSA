import { getSupabaseConfig, supabase } from '../lib/supabase';

export type NativePlatformType = 'android' | 'ios' | 'web';

export interface UserDeviceRow {
  id: string;
  user_id: string;
  platform: NativePlatformType;
  device_id: string;
  push_token: string | null;
  voip_token: string | null;
  app_version: string;
  device_model: string | null;
  os_version: string | null;
  is_active: boolean;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

export interface NativeCallEventDetail {
  callId: string;
  callType?: 'audio' | 'video';
  callerId?: string;
  callerName?: string;
  chatId?: string | null;
  action: 'accept' | 'reject' | 'end' | 'open';
}

export interface NativeDeepLinkDetail {
  chatId?: string | null;
  callId?: string | null;
  callType?: 'audio' | 'video' | null;
  callAction?: 'accept' | 'reject' | 'open' | null;
}

interface AndroidJavascriptBridge {
  getPushToken?: () => string | null;
  syncPushToken?: () => void;
  getDeviceId?: () => string | null;
  getAppVersion?: () => string | null;
  getDeviceModel?: () => string | null;
  getOsVersion?: () => string | null;
  consumePendingIntentPayload?: () => string | null;
  syncAuthSession?: (sessionJson: string) => void;
  clearAuthSession?: () => void;
  showMessageNotification?: (payloadJson: string) => void;
  showIncomingCallNotification?: (payloadJson: string) => void;
  getPermissionStatus?: (permissionType: string) => string | null;
  requestSinglePermission?: (permissionType: string) => void;
  openPermissionSettings?: (permissionType?: string) => void;
  openAppSettings?: () => void;
  clearConversationNotifications?: (conversationId: string) => void;
  dismissIncomingCallNotification?: (callId: string) => void;
  reportCallConnected?: (callId: string) => void;
  requestNativePermissions?: () => void;
}

declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      getPlatform?: () => string;
      Plugins?: Record<string, unknown>;
    };
    OSANativeAndroid?: AndroidJavascriptBridge;
    webkit?: {
      messageHandlers?: {
        OSANativeBridge?: {
          postMessage: (message: Record<string, unknown>) => void;
        };
      };
    };
    __osaReceiveNativePushToken?: (payload: {
      platform: 'android' | 'ios';
      deviceId?: string;
      pushToken?: string;
      voipToken?: string;
      appVersion?: string;
      deviceModel?: string;
      osVersion?: string;
    }) => void;
    __osaReceiveNativeCallAction?: (payload: NativeCallEventDetail) => void;
    __osaReceiveNativeDeepLink?: (payload: NativeDeepLinkDetail) => void;
    __osaReceiveNativePermissionResult?: (payload: {
      type: string;
      state: 'granted' | 'denied' | 'prompt';
    }) => void;
    __osaReceiveIOSPermissionStatus?: (payload: {
      camera?: 'granted' | 'denied' | 'prompt';
      microphone?: 'granted' | 'denied' | 'prompt';
      location?: 'granted' | 'denied' | 'prompt';
      notifications?: 'granted' | 'denied' | 'prompt';
    }) => void;
    __osaOnAppResume?: () => void;
    __osaOnAppPause?: () => void;
  }
}

const DEVICE_ID_STORAGE_KEY = 'osa_native_device_id_v1';

/**
 * Detects whether OSA is running inside the native Android or iOS shell or standard Web/PWA.
 */
export function detectRuntimePlatform(): NativePlatformType {
  if (typeof window === 'undefined') return 'web';

  if (window.OSANativeAndroid) {
    return 'android';
  }

  if (window.webkit?.messageHandlers?.OSANativeBridge) {
    return 'ios';
  }

  if (window.Capacitor?.isNativePlatform?.()) {
    const p = (window.Capacitor.getPlatform?.() || '').toLowerCase();
    if (p === 'android') return 'android';
    if (p === 'ios') return 'ios';
  }

  return 'web';
}

export function isNativeMobileRuntime(): boolean {
  return detectRuntimePlatform() !== 'web';
}

export function getOrCreateStableDeviceId(): string {
  if (typeof window === 'undefined') return 'server';

  try {
    const androidHwId = window.OSANativeAndroid?.getDeviceId?.();
    if (androidHwId && androidHwId.trim()) {
      return androidHwId.trim();
    }
  } catch {
    // Ignore
  }

  try {
    const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing && existing.trim()) {
      return existing.trim();
    }
    const generated = `osa_dev_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 10)}`;
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, generated);
    return generated;
  } catch {
    return `osa_dev_${Date.now().toString(36)}`;
  }
}

/**
 * Saves or updates a device record in `public.user_devices` (with strict RLS `auth.uid() = user_id`).
 * Never generates or stores fake push tokens.
 */
export async function registerUserDeviceInSupabase(params: {
  userId: string;
  platform: NativePlatformType;
  deviceId?: string;
  pushToken?: string | null;
  voipToken?: string | null;
  appVersion?: string;
  deviceModel?: string | null;
  osVersion?: string | null;
  isActive?: boolean;
}): Promise<UserDeviceRow | null> {
  if (!params.userId) return null;
  const deviceId = (params.deviceId || getOrCreateStableDeviceId()).trim();
  const appVersion = (params.appVersion || '1.0.0').trim();
  const cleanPushToken =
    params.pushToken && params.pushToken.trim() ? params.pushToken.trim() : null;
  const cleanVoipToken =
    params.voipToken && params.voipToken.trim() ? params.voipToken.trim() : null;

  // 1. Try SECURITY DEFINER RPC `upsert_user_device`
  try {
    const { data: rpcRow, error: rpcErr } = await supabase.rpc('upsert_user_device', {
      p_platform: params.platform,
      p_device_id: deviceId,
      p_push_token: cleanPushToken,
      p_voip_token: cleanVoipToken,
      p_app_version: appVersion,
      p_device_model: params.deviceModel || null,
      p_os_version: params.osVersion || null,
      p_is_active: params.isActive ?? true,
    });
    if (!rpcErr && rpcRow) {
      console.info('[OSA_FCM_TOKEN] rpc/upsert_user_device succeeded for platform=' + params.platform);
      return rpcRow as UserDeviceRow;
    }
    if (rpcErr) {
      console.warn('[OSA_FCM_TOKEN] rpc/upsert_user_device failed:', rpcErr.code, rpcErr.message);
    }
  } catch {
    // Fallback to direct table upsert
  }

  // 2. Fallback: Direct upsert on public.user_devices
  try {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('user_devices')
      .upsert(
        {
          user_id: params.userId,
          platform: params.platform,
          device_id: deviceId,
          ...(cleanPushToken ? { push_token: cleanPushToken } : {}),
          ...(cleanVoipToken ? { voip_token: cleanVoipToken } : {}),
          app_version: appVersion,
          device_model: params.deviceModel || null,
          os_version: params.osVersion || null,
          is_active: params.isActive ?? true,
          last_seen_at: nowIso,
          updated_at: nowIso,
        },
        { onConflict: 'user_id,device_id' }
      )
      .select('*')
      .maybeSingle();

    if (!error && data) {
      console.info('[OSA_FCM_TOKEN] rest/v1/user_devices upsert succeeded for platform=' + params.platform);
      return data as UserDeviceRow;
    }
    if (error) {
      console.warn('[OSA_FCM_TOKEN] rest/v1/user_devices upsert failed:', error.code, error.message);
    }
  } catch {
    // Ignore if migration has not been run yet
  }

  return null;
}

/**
 * Syncs the authenticated Supabase session to the Android native layer so
 * OSABackgroundMessagingService and OSACallActionReceiver can operate when the app is backgrounded/locked/closed.
 */
async function syncAndroidNativeAuthSession(userId: string): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const { data } = await supabase.auth.getSession();
    const accessToken = data?.session?.access_token;
    const refreshToken = data?.session?.refresh_token || '';
    const sbConfig = getSupabaseConfig();
    if (sbConfig.url && sbConfig.anonKey && sbConfig.isConfigured) {
      (window as unknown as Record<string, unknown>).__OSA_SUPABASE_CONFIG__ = {
        url: sbConfig.url,
        anonKey: sbConfig.anonKey,
      };
    }
    if (accessToken && sbConfig.url && sbConfig.anonKey && window.OSANativeAndroid?.syncAuthSession) {
      window.OSANativeAndroid.syncAuthSession(
        JSON.stringify({
          userId,
          accessToken,
          refreshToken,
          supabaseUrl: sbConfig.url,
          anonKey: sbConfig.anonKey,
        })
      );
    }
  } catch {
    // Ignore
  }
}

/**
 * Initializes native Android (FCM + CallNotificationService) and iOS (APNs + PushKit VoIP + CallKit)
 * bridge callbacks for the authenticated user without affecting Web/PWA behavior.
 */
export function initializeNativeMobileBridge(
  userId: string,
  callbacks: {
    onNativeCallAction: (detail: NativeCallEventDetail) => void;
    onNativeDeepLink: (detail: NativeDeepLinkDetail) => void;
  }
): () => void {
  if (typeof window === 'undefined') return () => {};

  const platform = detectRuntimePlatform();
  const retryTimers: number[] = [];

  // Expose global hooks invoked by Android MainActivity.evaluateJavascript and iOS WKWebView evaluateJavaScript
  window.__osaReceiveNativePushToken = (payload) => {
    const cleanToken = payload.pushToken && payload.pushToken.trim() ? payload.pushToken.trim() : null;
    const cleanVoip = payload.voipToken && payload.voipToken.trim() ? payload.voipToken.trim() : null;
    if (!cleanToken && !cleanVoip) return;

    registerUserDeviceInSupabase({
      userId,
      platform: payload.platform || (platform === 'web' ? 'android' : platform),
      deviceId: payload.deviceId || getOrCreateStableDeviceId(),
      pushToken: cleanToken,
      voipToken: cleanVoip,
      appVersion: payload.appVersion || '1.0.0',
      deviceModel: payload.deviceModel || null,
      osVersion: payload.osVersion || null,
      isActive: true,
    }).catch(() => {});
  };

  window.__osaReceiveNativeCallAction = (detail) => {
    if (!detail || !detail.callId) return;
    callbacks.onNativeCallAction(detail);
  };

  window.__osaReceiveNativeDeepLink = (detail) => {
    if (!detail) return;
    callbacks.onNativeDeepLink(detail);
  };

  const handleCustomCallEvent = (e: Event) => {
    const custom = e as CustomEvent<NativeCallEventDetail>;
    if (custom.detail?.callId) {
      callbacks.onNativeCallAction(custom.detail);
    }
  };

  const handleCustomDeepLinkEvent = (e: Event) => {
    const custom = e as CustomEvent<NativeDeepLinkDetail>;
    if (custom.detail) {
      callbacks.onNativeDeepLink(custom.detail);
    }
  };

  window.addEventListener('osa:native-call-action', handleCustomCallEvent);
  window.addEventListener('osa:native-deep-link', handleCustomDeepLinkEvent);

  let authSub: { unsubscribe: () => void } | null = null;

  // If running on Android Native shell:
  // 1. Sync Supabase auth session for background/closed-app notifications and call reject actions
  // 2. Pull & sync real FCM token to public.user_devices (platform = 'android')
  // 3. Consume any pending cold-start notification tap intent payload
  if (platform === 'android' && window.OSANativeAndroid) {
    syncAndroidNativeAuthSession(userId).catch(() => {});

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        try {
          window.OSANativeAndroid?.clearAuthSession?.();
        } catch {
          // Ignore
        }
      } else if (session?.access_token && session.user?.id === userId) {
        const sbConfig = getSupabaseConfig();
        try {
          window.OSANativeAndroid?.syncAuthSession?.(
            JSON.stringify({
              userId,
              accessToken: session.access_token,
              refreshToken: session.refresh_token || '',
              supabaseUrl: sbConfig.url,
              anonKey: sbConfig.anonKey,
            })
          );
        } catch {
          // Ignore
        }
      }
    });
    authSub = listener.subscription;

    const trySyncAndroidFcmToken = () => {
      try {
        window.OSANativeAndroid?.syncPushToken?.();
        const fcmToken = window.OSANativeAndroid?.getPushToken?.();
        const deviceId = window.OSANativeAndroid?.getDeviceId?.() || getOrCreateStableDeviceId();
        const appVersion = window.OSANativeAndroid?.getAppVersion?.() || '1.0.0';
        const deviceModel = window.OSANativeAndroid?.getDeviceModel?.() || null;
        const osVersion = window.OSANativeAndroid?.getOsVersion?.() || null;

        if (fcmToken && fcmToken.trim()) {
          registerUserDeviceInSupabase({
            userId,
            platform: 'android',
            deviceId,
            pushToken: fcmToken.trim(),
            appVersion,
            deviceModel,
            osVersion,
            isActive: true,
          }).catch(() => {});
        }
      } catch {
        // Ignore
      }
    };

    trySyncAndroidFcmToken();
    for (const delayMs of [1500, 4000, 8000]) {
      retryTimers.push(window.setTimeout(trySyncAndroidFcmToken, delayMs));
    }

    // Consume pending notification intent payload if the app was launched from a killed state
    try {
      const pendingRaw = window.OSANativeAndroid.consumePendingIntentPayload?.();
      if (pendingRaw && pendingRaw.trim()) {
        const parsed = JSON.parse(pendingRaw) as {
          chatId?: string;
          callId?: string;
          callType?: 'audio' | 'video';
          callerId?: string;
          callerName?: string;
          callAction?: 'accept' | 'reject' | 'open';
        };
        if (parsed.callId) {
          callbacks.onNativeCallAction({
            callId: parsed.callId,
            callType: parsed.callType || 'audio',
            callerId: parsed.callerId,
            callerName: parsed.callerName,
            chatId: parsed.chatId || null,
            action: parsed.callAction || 'open',
          });
        } else if (parsed.chatId) {
          callbacks.onNativeDeepLink({
            chatId: parsed.chatId,
          });
        }
      }
    } catch {
      // Ignore
    }
  }

  // If running on iOS Native shell, request APNs + PushKit VoIP tokens from Swift bridge
  if (platform === 'ios' && window.webkit?.messageHandlers?.OSANativeBridge) {
    try {
      window.webkit.messageHandlers.OSANativeBridge.postMessage({
        action: 'registerTokens',
        userId,
      });
    } catch {
      // Ignore
    }
  }

  return () => {
    retryTimers.forEach((id) => window.clearTimeout(id));
    authSub?.unsubscribe();
    window.removeEventListener('osa:native-call-action', handleCustomCallEvent);
    window.removeEventListener('osa:native-deep-link', handleCustomDeepLinkEvent);
  };
}

/**
 * Informs the native Android Foreground Call Service or iOS CallKit provider that a call has ended/disconnected
 * so the native lock-screen or persistent call UI is dismissed immediately.
 */
export function notifyNativeIncomingCallDismissed(callId: string): void {
  if (typeof window === 'undefined' || !callId) return;
  try {
    window.OSANativeAndroid?.dismissIncomingCallNotification?.(callId);
  } catch {
    // Ignore
  }
  try {
    window.webkit?.messageHandlers?.OSANativeBridge?.postMessage({
      action: 'endCallKitCall',
      callId,
    });
  } catch {
    // Ignore
  }
}

/**
 * Informs the native Android or iOS CallKit layer that WebRTC media is now connected.
 */
export function notifyNativeCallConnected(callId: string): void {
  if (typeof window === 'undefined' || !callId) return;
  try {
    window.OSANativeAndroid?.reportCallConnected?.(callId);
  } catch {
    // Ignore
  }
  try {
    window.webkit?.messageHandlers?.OSANativeBridge?.postMessage({
      action: 'reportCallConnected',
      callId,
    });
  } catch {
    // Ignore
  }
}

/**
 * Opens the native Android or iOS App Settings screen when a user needs to re-enable a denied OS permission.
 */
export function openNativeOSAppSettings(permissionType?: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.OSANativeAndroid?.openPermissionSettings) {
      window.OSANativeAndroid.openPermissionSettings(permissionType || '');
      return true;
    }
    if (window.OSANativeAndroid?.openAppSettings) {
      window.OSANativeAndroid.openAppSettings();
      return true;
    }
    if (window.webkit?.messageHandlers?.OSANativeBridge) {
      window.webkit.messageHandlers.OSANativeBridge.postMessage({
        action: 'openPermissionSettings',
        permissionType: permissionType || '',
      });
      return true;
    }
  } catch {
    // Ignore
  }
  return false;
}
