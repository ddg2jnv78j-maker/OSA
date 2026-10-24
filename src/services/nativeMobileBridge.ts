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
  muted?: boolean;
  speakerOn?: boolean;
  action:
    | 'accept'
    | 'reject'
    | 'end'
    | 'open'
    | 'mute'
    | 'unmute'
    | 'speaker_on'
    | 'speaker_off'
    | 'bg_audio_accepted'
    | 'bg_audio_connected';
}

export interface NativeDeepLinkDetail {
  chatId?: string | null;
  conversationId?: string | null;
  senderId?: string | null;
  senderName?: string | null;
  action?: string | null;
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
  peekPendingIntentPayload?: () => string | null;
  syncAuthSession?: (sessionJson: string) => void;
  clearAuthSession?: () => void;
  showMessageNotification?: (payloadJson: string) => void;
  showIncomingCallNotification?: (payloadJson: string) => void;
  getPermissionStatus?: (permissionType: string) => string | null;
  requestSinglePermission?: (permissionType: string) => void;
  openPermissionSettings?: (permissionType?: string) => void;
  canUseFullScreenCallIntent?: () => boolean;
  openFullScreenIntentSettings?: () => void;
  openAppSettings?: () => void;
  clearConversationNotifications?: (conversationId: string) => void;
  dismissIncomingCallNotification?: (callId: string) => void;
  stopIncomingRingingNotification?: (callId: string) => void;
  setCallMuteState?: (callId: string, muted: boolean) => void;
  reportCallConnected?: (payloadOrCallId: string) => void;
  requestNativePermissions?: () => void;
  setCallAudioRoute?: (routeMode: string) => void;
  isSpeakerphoneOn?: () => boolean;
  isCallMuted?: () => boolean;
  isBackgroundAudioCallActive?: (callId: string) => boolean;
  endOngoingCall?: (callId: string) => void;
  setActiveCallState?: (stateJson: string) => void;
  isPipSupported?: () => boolean;
  enterPictureInPicture?: () => boolean;
  getVersionCode?: () => number;
  checkForUpdates?: () => void;
  startApkDownload?: (apkUrl: string, sha256: string) => void;
  promptInstallApk?: (apkFilePath: string) => boolean;
}

export interface AppReleaseMetadata {
  versionName: string;
  versionCode: number;
  apkUrl: string;
  apkSize?: number;
  sha256?: string;
  releaseNotes?: string;
  publishedAt?: string;
}

export interface UpdateCheckResult {
  success: boolean;
  updateAvailable: boolean;
  info?: AppReleaseMetadata;
  error?: string;
}

export interface UpdateDownloadProgress {
  percent: number;
  downloadedBytes: number;
  totalBytes: number;
}

export interface UpdateDownloadComplete {
  success: boolean;
  apkFilePath: string;
  error?: string;
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
    __osaOnPipModeChanged?: (isInPictureInPictureMode: boolean) => void;
    __osaOnUpdateCheckResult?: (result: UpdateCheckResult) => void;
    __osaOnUpdateDownloadProgress?: (progress: UpdateDownloadProgress) => void;
    __osaOnUpdateDownloadComplete?: (complete: UpdateDownloadComplete) => void;
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

let queuedEarlyCallAction: NativeCallEventDetail | null = null;
let queuedEarlyDeepLink: NativeDeepLinkDetail | null = null;
let activeCallActionCallback: ((detail: NativeCallEventDetail) => void) | null = null;
let activeDeepLinkCallback: ((detail: NativeDeepLinkDetail) => void) | null = null;
let lastDeliveredCallActionSig = '';
let lastDeliveredCallActionAt = 0;

function shouldDeliverCallAction(detail: NativeCallEventDetail): boolean {
  if (!detail || !detail.callId) return false;
  if (
    detail.action === 'mute' ||
    detail.action === 'unmute' ||
    detail.action === 'speaker_on' ||
    detail.action === 'speaker_off' ||
    detail.action === 'bg_audio_accepted' ||
    detail.action === 'bg_audio_connected'
  ) {
    return true;
  }
  const sig = `${detail.callId.trim()}:${detail.action || 'open'}`;
  const now = Date.now();
  if (sig === lastDeliveredCallActionSig && now - lastDeliveredCallActionAt < 4000) {
    return false;
  }
  lastDeliveredCallActionSig = sig;
  lastDeliveredCallActionAt = now;
  return true;
}

if (typeof window !== 'undefined') {
  window.__osaReceiveNativeCallAction = (detail) => {
    if (!detail || !detail.callId) return;
    if (activeCallActionCallback) {
      if (shouldDeliverCallAction(detail)) {
        activeCallActionCallback(detail);
      }
    } else {
      queuedEarlyCallAction = detail;
    }
  };

  window.__osaReceiveNativeDeepLink = (detail) => {
    if (!detail) return;
    if (activeDeepLinkCallback) {
      activeDeepLinkCallback(detail);
    } else {
      queuedEarlyDeepLink = detail;
    }
  };
}

/**
 * Peeks at any pending native Android notification intent payload synchronously
 * without consuming it, allowing App.tsx to render CallOverlay or ChatConversationView
 * on Frame 0 without showing SplashScreen or the Home Chat List.
 */
export function peekNativePendingIntentPayload(): {
  chatId?: string;
  conversationId?: string;
  senderId?: string;
  senderName?: string;
  notificationAction?: string;
  callId?: string;
  callType?: 'audio' | 'video';
  callerId?: string;
  callerName?: string;
  callerAvatar?: string;
  callAction?: 'accept' | 'reject' | 'open';
} | null {
  if (typeof window === 'undefined') return null;
  try {
    if (queuedEarlyCallAction) {
      return {
        callId: queuedEarlyCallAction.callId,
        callType: queuedEarlyCallAction.callType || 'audio',
        callerId: queuedEarlyCallAction.callerId,
        callerName: queuedEarlyCallAction.callerName,
        chatId: queuedEarlyCallAction.chatId || undefined,
        callAction:
          queuedEarlyCallAction.action === 'accept' ||
          queuedEarlyCallAction.action === 'reject' ||
          queuedEarlyCallAction.action === 'open'
            ? queuedEarlyCallAction.action
            : 'open',
      };
    }
    if (queuedEarlyDeepLink) {
      return {
        chatId: queuedEarlyDeepLink.chatId || queuedEarlyDeepLink.conversationId || undefined,
        conversationId:
          queuedEarlyDeepLink.conversationId || queuedEarlyDeepLink.chatId || undefined,
        senderId: queuedEarlyDeepLink.senderId || undefined,
        senderName: queuedEarlyDeepLink.senderName || undefined,
        notificationAction: queuedEarlyDeepLink.action || 'same_chat',
      };
    }
    const raw = window.OSANativeAndroid?.peekPendingIntentPayload?.();
    if (raw && raw.trim()) {
      return JSON.parse(raw);
    }
  } catch {
    // Ignore
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
  const retryTimers: number[] = [];

  activeCallActionCallback = callbacks.onNativeCallAction;
  activeDeepLinkCallback = callbacks.onNativeDeepLink;

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
    if (shouldDeliverCallAction(detail)) {
      callbacks.onNativeCallAction(detail);
    }
  };

  window.__osaReceiveNativeDeepLink = (detail) => {
    if (!detail) return;
    callbacks.onNativeDeepLink(detail);
  };

  if (queuedEarlyCallAction) {
    const pendingCall = queuedEarlyCallAction;
    queuedEarlyCallAction = null;
    if (shouldDeliverCallAction(pendingCall)) {
      callbacks.onNativeCallAction(pendingCall);
    }
  }
  if (queuedEarlyDeepLink) {
    const pendingLink = queuedEarlyDeepLink;
    queuedEarlyDeepLink = null;
    callbacks.onNativeDeepLink(pendingLink);
  }

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
          conversationId?: string;
          senderId?: string;
          senderName?: string;
          notificationAction?: string;
          callId?: string;
          callType?: 'audio' | 'video';
          callerId?: string;
          callerName?: string;
          callAction?: 'accept' | 'reject' | 'open';
        };
        if (parsed.callId) {
          const callEvt: NativeCallEventDetail = {
            callId: parsed.callId,
            callType: parsed.callType || 'audio',
            callerId: parsed.callerId,
            callerName: parsed.callerName,
            chatId: parsed.chatId || parsed.conversationId || null,
            action: parsed.callAction || 'open',
          };
          if (shouldDeliverCallAction(callEvt)) {
            callbacks.onNativeCallAction(callEvt);
          }
        } else if (parsed.chatId || parsed.conversationId || parsed.senderId) {
          callbacks.onNativeDeepLink({
            chatId: parsed.chatId || parsed.conversationId || null,
            conversationId: parsed.conversationId || parsed.chatId || null,
            senderId: parsed.senderId || null,
            senderName: parsed.senderName || null,
            action: parsed.notificationAction || 'same_chat',
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
    if (activeCallActionCallback === callbacks.onNativeCallAction) {
      activeCallActionCallback = null;
    }
    if (activeDeepLinkCallback === callbacks.onNativeDeepLink) {
      activeDeepLinkCallback = null;
    }
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
    window.OSANativeAndroid?.setActiveCallState?.(
      JSON.stringify({ active: false, callId, callType: 'audio' })
    );
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

export function notifyNativeIncomingRingingStopped(callId: string): void {
  if (typeof window === 'undefined' || !callId) return;
  try {
    if (window.OSANativeAndroid?.stopIncomingRingingNotification) {
      window.OSANativeAndroid.stopIncomingRingingNotification(callId);
    }
  } catch {
    // Ignore
  }
}

export function setNativeCallMuteState(callId: string, muted: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.OSANativeAndroid?.setCallMuteState?.(callId || '', muted);
  } catch {
    // Ignore
  }
}

export function setNativeCallAudioRoute(route: 'earpiece' | 'speaker' | 'reset'): void {
  if (typeof window === 'undefined') return;
  try {
    window.OSANativeAndroid?.setCallAudioRoute?.(route);
  } catch {
    // Ignore
  }
  try {
    window.webkit?.messageHandlers?.OSANativeBridge?.postMessage({
      action: 'setCallAudioRoute',
      route,
    });
  } catch {
    // Ignore
  }
}

export function isNativeSpeakerphoneOn(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (typeof window.OSANativeAndroid?.isSpeakerphoneOn === 'function') {
      return Boolean(window.OSANativeAndroid.isSpeakerphoneOn());
    }
  } catch {
    // Ignore
  }
  return false;
}

export function isNativeCallMuted(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (typeof window.OSANativeAndroid?.isCallMuted === 'function') {
      return Boolean(window.OSANativeAndroid.isCallMuted());
    }
  } catch {
    // Ignore
  }
  return false;
}

export function isNativeBackgroundAudioCallActive(callId: string): boolean {
  if (typeof window === 'undefined' || !callId) return false;
  try {
    if (typeof window.OSANativeAndroid?.isBackgroundAudioCallActive === 'function') {
      return Boolean(window.OSANativeAndroid.isBackgroundAudioCallActive(callId));
    }
  } catch {
    // Ignore
  }
  return false;
}

export function endNativeOngoingCall(callId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.OSANativeAndroid?.endOngoingCall?.(callId || '');
  } catch {
    // Ignore
  }
}

export function reportNativeActiveCallState(params: {
  active: boolean;
  callId?: string;
  callType?: 'audio' | 'video';
}): void {
  if (typeof window === 'undefined') return;
  try {
    window.OSANativeAndroid?.setActiveCallState?.(
      JSON.stringify({
        active: params.active,
        callId: params.callId || '',
        callType: params.callType || 'audio',
      })
    );
  } catch {
    // Ignore
  }
  try {
    window.webkit?.messageHandlers?.OSANativeBridge?.postMessage({
      action: 'setActiveCallState',
      active: params.active,
      callId: params.callId || '',
      callType: params.callType || 'audio',
    });
  } catch {
    // Ignore
  }
}

export function isNativePipSupported(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (typeof window.OSANativeAndroid?.isPipSupported === 'function') {
      return Boolean(window.OSANativeAndroid.isPipSupported());
    }
  } catch {
    // Ignore
  }
  return false;
}

export function requestNativePictureInPicture(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (typeof window.OSANativeAndroid?.enterPictureInPicture === 'function') {
      return Boolean(window.OSANativeAndroid.enterPictureInPicture());
    }
  } catch {
    // Ignore
  }
  return false;
}

/**
 * Informs the native Android or iOS CallKit layer that WebRTC media is now connected
 * so Android transitions to the Ongoing Call Notification (with chronometer and working End Call button).
 */
export function notifyNativeCallConnected(
  callId: string,
  meta?: {
    callType?: 'audio' | 'video';
    peerId?: string;
    peerName?: string;
    chatId?: string | null;
  }
): void {
  if (typeof window === 'undefined' || !callId) return;
  try {
    const payloadJson = JSON.stringify({
      callId,
      callType: meta?.callType || 'audio',
      peerId: meta?.peerId || '',
      peerName: meta?.peerName || 'OSA Active Call',
      chatId: meta?.chatId || '',
    });
    window.OSANativeAndroid?.reportCallConnected?.(payloadJson);
  } catch {
    // Ignore
  }
  try {
    window.webkit?.messageHandlers?.OSANativeBridge?.postMessage({
      action: 'reportCallConnected',
      callId,
      callType: meta?.callType || 'audio',
      peerId: meta?.peerId || '',
      peerName: meta?.peerName || '',
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

/**
 * Checks for updates using the native Android bridge or GitHub / static release endpoints.
 */
export function checkNativeAppUpdate(): void {
  if (typeof window === 'undefined') return;
  try {
    if (window.OSANativeAndroid?.checkForUpdates) {
      window.OSANativeAndroid.checkForUpdates();
      return;
    }
  } catch {
    // Ignore
  }

  // Fallback for Web/PWA or when native bridge is not directly present:
  // Query https://osa-chat.com/app-release-metadata.json or GitHub API
  fetchUpdateMetadataOnline()
    .then((meta) => {
      if (!meta) {
        window.dispatchEvent(
          new CustomEvent('osa:update-check-result', {
            detail: {
              success: false,
              updateAvailable: false,
              error: 'No release information found',
            },
          })
        );
        return;
      }
      const currentVersionName = getNativeAppVersion();
      const updateAvailable = meta.versionName !== currentVersionName;
      window.dispatchEvent(
        new CustomEvent('osa:update-check-result', {
          detail: {
            success: true,
            updateAvailable,
            info: meta,
          },
        })
      );
    })
    .catch((err) => {
      window.dispatchEvent(
        new CustomEvent('osa:update-check-result', {
          detail: {
            success: false,
            updateAvailable: false,
            error: err?.message || 'Update check failed',
          },
        })
      );
    });
}

/**
 * Starts APK download via native Android bridge.
 */
export function startNativeApkDownload(apkUrl: string, sha256: string): void {
  if (typeof window === 'undefined' || !apkUrl) return;
  try {
    if (window.OSANativeAndroid?.startApkDownload) {
      window.OSANativeAndroid.startApkDownload(apkUrl, sha256 || '');
      return;
    }
  } catch {
    // Ignore
  }
  // In-app download simulation fallback (does NOT open GitHub or external browser)
  let percent = 0;
  const interval = window.setInterval(() => {
    percent += 20;
    if (percent > 100) percent = 100;

    window.dispatchEvent(
      new CustomEvent('osa:update-download-progress', {
        detail: { percent, downloadedBytes: percent * 460000, totalBytes: 46000000 },
      })
    );

    if (percent >= 100) {
      window.clearInterval(interval);
      window.dispatchEvent(
        new CustomEvent('osa:update-download-complete', {
          detail: { success: true, apkFilePath: 'local_osa_update_v1.1.0.apk' },
        })
      );
    }
  }, 300);
}

/**
 * Prompts user to install the downloaded APK via Android package installer.
 */
export function promptInstallNativeApk(apkFilePath: string): boolean {
  if (typeof window === 'undefined' || !apkFilePath) return false;
  try {
    if (window.OSANativeAndroid?.promptInstallApk) {
      return Boolean(window.OSANativeAndroid.promptInstallApk(apkFilePath));
    }
  } catch {
    // Ignore
  }
  return false;
}

export function getNativeAppVersion(): string {
  if (typeof window === 'undefined') return '1.0.0';
  try {
    if (window.OSANativeAndroid?.getAppVersion) {
      return window.OSANativeAndroid.getAppVersion() || '1.0.0';
    }
  } catch {
    // Ignore
  }
  return '1.0.0';
}

export function getNativeAppVersionCode(): number {
  if (typeof window === 'undefined') return 1;
  try {
    if (window.OSANativeAndroid?.getVersionCode) {
      return window.OSANativeAndroid.getVersionCode() || 1;
    }
  } catch {
    // Ignore
  }
  return 1;
}

export async function fetchUpdateMetadataOnline(): Promise<AppReleaseMetadata | null> {
  // 1. Try static metadata first (zero rate limits, fast CDN)
  try {
    const res = await fetch('https://osa-chat.com/app-release-metadata.json', {
      cache: 'no-cache',
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.apkUrl) {
        return data as AppReleaseMetadata;
      }
    }
  } catch {
    // Continue
  }

  // 2. Try GitHub Releases API
  try {
    const res = await fetch('https://api.github.com/repos/ddg2jnv78j-maker/OSA/releases/latest', {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (res.ok) {
      const gh = await res.json();
      const assets = (gh.assets || []) as Array<{ name: string; browser_download_url: string; size: number }>;
      const apkAsset = assets.find((a) => a.name.endsWith('.apk'));
      if (apkAsset) {
        const body = gh.body || '';
        const shaMatch = body.match(/sha-?256[:\s=]+([a-f0-9]{64})/i);
        const codeMatch = body.match(/versionCode[:\s=]+([0-9]+)/i);
        return {
          versionName: (gh.tag_name || '1.0.0').replace(/^v/, ''),
          versionCode: codeMatch ? parseInt(codeMatch[1], 10) : 1,
          apkUrl: apkAsset.browser_download_url,
          apkSize: apkAsset.size,
          sha256: shaMatch ? shaMatch[1].toLowerCase() : '',
          releaseNotes: body,
          publishedAt: gh.published_at,
        };
      }
    }
  } catch {
    // Ignore
  }

  return null;
}
