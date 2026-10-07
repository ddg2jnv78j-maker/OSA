import { supabase } from '../lib/supabase';

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
  getDeviceId?: () => string | null;
  getAppVersion?: () => string | null;
  openAppSettings?: () => void;
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

  // 1. Try SECURITY DEFINER RPC `upsert_user_device`
  try {
    const { data: rpcRow, error: rpcErr } = await supabase.rpc('upsert_user_device', {
      p_platform: params.platform,
      p_device_id: deviceId,
      p_push_token: params.pushToken || null,
      p_voip_token: params.voipToken || null,
      p_app_version: appVersion,
      p_device_model: params.deviceModel || null,
      p_os_version: params.osVersion || null,
      p_is_active: params.isActive ?? true,
    });
    if (!rpcErr && rpcRow) {
      return rpcRow as UserDeviceRow;
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
          push_token: params.pushToken || null,
          voip_token: params.voipToken || null,
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
      return data as UserDeviceRow;
    }
  } catch {
    // Ignore if migration has not been run yet
  }

  return null;
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

  // Expose global hooks invoked by Android MainActivity.evaluateJavascript and iOS WKWebView evaluateJavaScript
  window.__osaReceiveNativePushToken = (payload) => {
    registerUserDeviceInSupabase({
      userId,
      platform: payload.platform || (platform === 'web' ? 'android' : platform),
      deviceId: payload.deviceId || getOrCreateStableDeviceId(),
      pushToken: payload.pushToken || null,
      voipToken: payload.voipToken || null,
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

  // If running on Android Native shell, pull initial FCM token immediately
  if (platform === 'android' && window.OSANativeAndroid) {
    try {
      const fcmToken = window.OSANativeAndroid.getPushToken?.();
      const deviceId = window.OSANativeAndroid.getDeviceId?.() || getOrCreateStableDeviceId();
      const appVersion = window.OSANativeAndroid.getAppVersion?.() || '1.0.0';
      if (fcmToken) {
        registerUserDeviceInSupabase({
          userId,
          platform: 'android',
          deviceId,
          pushToken: fcmToken,
          appVersion,
          isActive: true,
        }).catch(() => {});
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
export function openNativeOSAppSettings(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.OSANativeAndroid?.openAppSettings) {
      window.OSANativeAndroid.openAppSettings();
      return true;
    }
    if (window.webkit?.messageHandlers?.OSANativeBridge) {
      window.webkit.messageHandlers.OSANativeBridge.postMessage({
        action: 'openAppSettings',
      });
      return true;
    }
  } catch {
    // Ignore
  }
  return false;
}
