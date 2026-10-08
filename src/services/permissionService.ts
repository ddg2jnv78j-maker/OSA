import { supabase } from '../lib/supabase';
import { detectRuntimePlatform, openNativeOSAppSettings } from './nativeMobileBridge';
import { ensureUserPushSubscription } from './pushNotificationService';

export type PermissionStateValue = 'granted' | 'denied' | 'prompt' | 'unsupported';
export type PermissionKind = 'camera' | 'microphone' | 'location' | 'notifications';

export interface OSAPermissionStatus {
  microphone: PermissionStateValue;
  camera: PermissionStateValue;
  location: PermissionStateValue;
  notifications: PermissionStateValue;
  cameraEnabled: boolean;
  microphoneEnabled: boolean;
  locationEnabled: boolean;
  notificationsEnabled: boolean;
  onboardingCompleted: boolean;
  allowRemoteCamera: boolean;
  allowRemoteLocation: boolean;
  updatedAt: string;
}

export interface PermissionSettingsActionResult {
  openedNativeSettings: boolean;
  platform: 'android' | 'ios' | 'web';
  instruction: string;
  buttonLabel: string;
}

export interface LiveLocationPayload {
  requestId: string;
  senderId: string;
  senderName: string;
  receiverId: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude: number | null;
  heading: number | null;
  speed: number | null;
  timestamp: string;
}

export const OSA_PERMISSIONS_UPDATED_EVENT = 'osa:permissions-updated';
const PERMISSION_STORAGE_KEY = 'osa_device_permissions_v1';

const DEFAULT_PERMISSION_STATUS: OSAPermissionStatus = {
  microphone: 'prompt',
  camera: 'prompt',
  location: 'prompt',
  notifications: 'prompt',
  cameraEnabled: true,
  microphoneEnabled: true,
  locationEnabled: true,
  notificationsEnabled: true,
  onboardingCompleted: false,
  allowRemoteCamera: true,
  allowRemoteLocation: true,
  updatedAt: new Date().toISOString(),
};

// In-memory cache keyed by userId (or 'default') for instant synchronous reads
const memoryPermissionCache = new Map<string, OSAPermissionStatus>();
let activeUserIdForPermissions: string | undefined;
let lifecycleListenersRegistered = false;
const observedPermissionStatuses = new WeakSet<PermissionStatus>();
const pendingNativePermissionResolvers = new Map<
  string,
  Array<(state: PermissionStateValue) => void>
>();
let cachedIOSPermissionStatus: Partial<Record<PermissionKind, PermissionStateValue>> | null = null;

function emitPermissionsUpdated(status: OSAPermissionStatus, userId?: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(
      new CustomEvent(OSA_PERMISSIONS_UPDATED_EVENT, {
        detail: { userId, status },
      })
    );
  } catch {
    // Ignore dispatch errors
  }
}

function normalizePermissionState(val: unknown): PermissionStateValue | null {
  if (val === 'granted' || val === 'denied' || val === 'prompt' || val === 'unsupported') {
    return val;
  }
  if (val === 'default') return 'prompt';
  return null;
}

function attachPermissionStatusChangeListener(permStatus: PermissionStatus): void {
  if (!permStatus || observedPermissionStatuses.has(permStatus)) return;
  observedPermissionStatuses.add(permStatus);
  try {
    permStatus.onchange = () => {
      checkNativePermissions(activeUserIdForPermissions).catch(() => {});
    };
  } catch {
    // Ignore if browser does not allow setting onchange
  }
}

function ensurePermissionLifecycleListeners(): void {
  if (typeof window === 'undefined' || lifecycleListenersRegistered) return;
  lifecycleListenersRegistered = true;

  const handleRefresh = () => {
    checkNativePermissions(activeUserIdForPermissions).catch(() => {});
  };

  window.addEventListener('focus', handleRefresh);
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        handleRefresh();
      }
    });
  }

  const prevOnAppResume = window.__osaOnAppResume;
  window.__osaOnAppResume = () => {
    try {
      prevOnAppResume?.();
    } catch {
      // Ignore
    }
    try {
      window.dispatchEvent(new CustomEvent('osa:native-app-resume'));
    } catch {
      // Ignore
    }
    handleRefresh();
  };

  const prevOnAppPause = window.__osaOnAppPause;
  window.__osaOnAppPause = () => {
    try {
      prevOnAppPause?.();
    } catch {
      // Ignore
    }
    try {
      window.dispatchEvent(new CustomEvent('osa:native-app-pause'));
    } catch {
      // Ignore
    }
  };

  window.__osaReceiveIOSPermissionStatus = (payload) => {
    if (!payload) return;
    const nextCache: Partial<Record<PermissionKind, PermissionStateValue>> = {
      ...(cachedIOSPermissionStatus || {}),
    };
    const cam = normalizePermissionState(payload.camera);
    const mic = normalizePermissionState(payload.microphone);
    const loc = normalizePermissionState(payload.location);
    const notif = normalizePermissionState(payload.notifications);
    if (cam) nextCache.camera = cam;
    if (mic) nextCache.microphone = mic;
    if (loc) nextCache.location = loc;
    if (notif) nextCache.notifications = notif;
    cachedIOSPermissionStatus = nextCache;

    saveStoredPermissionStatus(
      {
        ...(cam ? { camera: cam, ...(cam === 'granted' ? { cameraEnabled: true } : {}) } : {}),
        ...(mic
          ? { microphone: mic, ...(mic === 'granted' ? { microphoneEnabled: true } : {}) }
          : {}),
        ...(loc ? { location: loc, ...(loc === 'granted' ? { locationEnabled: true } : {}) } : {}),
        ...(notif
          ? {
              notifications: notif,
              ...(notif === 'granted' ? { notificationsEnabled: true } : {}),
            }
          : {}),
      },
      activeUserIdForPermissions
    );
  };

  window.__osaReceiveNativePermissionResult = (payload) => {
    if (!payload || !payload.type) return;
    const typeKey = payload.type.toLowerCase();
    const state = normalizePermissionState(payload.state) || 'prompt';
    const resolvers = pendingNativePermissionResolvers.get(typeKey);
    if (resolvers && resolvers.length > 0) {
      pendingNativePermissionResolvers.delete(typeKey);
      resolvers.forEach((resolve) => resolve(state));
    }
    handleRefresh();
  };
}

function requestIOSNativeSinglePermission(
  permissionType: PermissionKind
): Promise<PermissionStateValue | null> {
  if (typeof window === 'undefined' || !window.webkit?.messageHandlers?.OSANativeBridge) {
    return Promise.resolve(null);
  }
  ensurePermissionLifecycleListeners();

  return new Promise((resolve) => {
    const key = permissionType.toLowerCase();
    const list = pendingNativePermissionResolvers.get(key) || [];
    let settled = false;

    const finish = (state: PermissionStateValue) => {
      if (settled) return;
      settled = true;
      resolve(state);
    };

    const timeoutId = window.setTimeout(() => {
      const fallback = cachedIOSPermissionStatus?.[permissionType] || 'prompt';
      finish(fallback);
    }, 15000);

    list.push((state) => {
      window.clearTimeout(timeoutId);
      finish(state);
    });
    pendingNativePermissionResolvers.set(key, list);

    try {
      window.webkit?.messageHandlers?.OSANativeBridge?.postMessage({
        action: 'requestSinglePermission',
        permissionType,
      });
    } catch {
      window.clearTimeout(timeoutId);
      finish('prompt');
    }
  });
}

function requestAndroidNativeSinglePermission(
  permissionType: PermissionKind
): Promise<PermissionStateValue | null> {
  if (typeof window === 'undefined' || !window.OSANativeAndroid?.requestSinglePermission) {
    return Promise.resolve(null);
  }
  ensurePermissionLifecycleListeners();

  return new Promise((resolve) => {
    const key = permissionType.toLowerCase();
    const list = pendingNativePermissionResolvers.get(key) || [];
    let settled = false;

    const finish = (state: PermissionStateValue) => {
      if (settled) return;
      settled = true;
      resolve(state);
    };

    const timeoutId = window.setTimeout(() => {
      const fallbackRaw = window.OSANativeAndroid?.getPermissionStatus?.(permissionType);
      finish(normalizePermissionState(fallbackRaw) || 'prompt');
    }, 15000);

    list.push((state) => {
      window.clearTimeout(timeoutId);
      finish(state);
    });
    pendingNativePermissionResolvers.set(key, list);

    try {
      window.OSANativeAndroid?.requestSinglePermission?.(permissionType);
    } catch {
      window.clearTimeout(timeoutId);
      finish('prompt');
    }
  });
}

export function getOpenPermissionSettingsButtonLabel(permissionType: PermissionKind): string {
  switch (permissionType) {
    case 'camera':
      return 'Open Camera Permission Settings';
    case 'microphone':
      return 'Open Microphone Permission Settings';
    case 'location':
      return 'Open Location Permission Settings';
    case 'notifications':
      return 'Open Notification Permission Settings';
  }
}

export function getAllowPermissionButtonLabel(permissionType: PermissionKind): string {
  switch (permissionType) {
    case 'camera':
      return 'Allow Camera';
    case 'microphone':
      return 'Allow Microphone';
    case 'location':
      return 'Allow Location';
    case 'notifications':
      return 'Allow Notifications';
  }
}

export function getPermissionDisplayTitle(permissionType: PermissionKind): string {
  switch (permissionType) {
    case 'camera':
      return 'Camera';
    case 'microphone':
      return 'Microphone';
    case 'location':
      return 'Location';
    case 'notifications':
      return 'Notification';
  }
}

/**
 * Generates clear platform-specific instructions when a browser cannot directly open its native permission dialog.
 */
export function getPermissionSettingsInstruction(permissionType: PermissionKind): string {
  const label = getPermissionDisplayTitle(permissionType);
  const runtime = detectRuntimePlatform();

  if (runtime === 'android') {
    return `Opening OSA Android App Settings → Tap "Permissions" → Select "${label}" → Choose "Allow". When you return to OSA, status will update to Allowed automatically.`;
  }

  if (runtime === 'ios') {
    return `Opening OSA iOS Settings → Toggle "${label}" ON. When you return to OSA, status will update to Allowed automatically.`;
  }

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const isAndroidBrowser = /Android/i.test(ua);
  const isIOSBrowser = /iPhone|iPad|iPod/i.test(ua);

  if (isAndroidBrowser) {
    return `To unblock ${label} in your Android browser: 1) Tap the Tune / Lock icon on the left side of the address bar at the top. 2) Tap "Permissions". 3) Turn ON "${label}". OSA will automatically detect the change and switch to Allowed.`;
  }

  if (isIOSBrowser) {
    return `To unblock ${label} on iPhone/iPad: 1) Tap the "aA" or Website Settings icon in the Safari address bar (or open iOS Settings → Safari / OSA). 2) Tap "Website Settings". 3) Set "${label}" to Allow.`;
  }

  return `To unblock ${label} in your browser: 1) Click the Tune / Lock icon on the left of your browser address bar. 2) Toggle "${label}" to Allow (or Reset permission). OSA will automatically detect the change and update to Allowed.`;
}

/**
 * Opens the native Android App Permission Settings (via Intent) or iOS App Settings (via UIApplication.openSettingsURLString),
 * or returns clear browser-specific permission recovery guidance when running in a standard web browser/PWA.
 */
export function openPermissionSettings(
  permissionType: PermissionKind = 'camera'
): PermissionSettingsActionResult {
  ensurePermissionLifecycleListeners();
  const runtime = detectRuntimePlatform();
  const buttonLabel = getOpenPermissionSettingsButtonLabel(permissionType);
  const instruction = getPermissionSettingsInstruction(permissionType);

  const openedNativeSettings = openNativeOSAppSettings(permissionType);

  // Also trigger a non-blocking permission re-check in case the user already changed browser site settings
  checkNativePermissions(activeUserIdForPermissions).catch(() => {});

  return {
    openedNativeSettings,
    platform: runtime,
    instruction,
    buttonLabel,
  };
}

export function getStoredPermissionStatus(userId?: string): OSAPermissionStatus {
  if (userId) activeUserIdForPermissions = userId;
  ensurePermissionLifecycleListeners();

  const cacheKey = userId || 'default';
  try {
    const key = userId ? `${PERMISSION_STORAGE_KEY}_${userId}` : PERMISSION_STORAGE_KEY;
    const rawUser = userId ? localStorage.getItem(key) : null;
    const rawGlobal = localStorage.getItem(PERMISSION_STORAGE_KEY);
    const raw = rawUser || rawGlobal;

    if (!raw) {
      const cached = memoryPermissionCache.get(cacheKey);
      if (cached) return { ...cached };
      return { ...DEFAULT_PERMISSION_STATUS };
    }

    const parsedUser = rawUser ? (JSON.parse(rawUser) as Partial<OSAPermissionStatus>) : {};
    const parsedGlobal = rawGlobal ? (JSON.parse(rawGlobal) as Partial<OSAPermissionStatus>) : {};
    const merged: OSAPermissionStatus = {
      ...DEFAULT_PERMISSION_STATUS,
      ...parsedGlobal,
      ...parsedUser,
      // Once onboarding has completed for this device or user, keep it true permanently
      onboardingCompleted: Boolean(
        parsedUser.onboardingCompleted || parsedGlobal.onboardingCompleted
      ),
    };
    memoryPermissionCache.set(cacheKey, merged);
    return merged;
  } catch {
    return memoryPermissionCache.get(cacheKey) || { ...DEFAULT_PERMISSION_STATUS };
  }
}

export function saveStoredPermissionStatus(
  status: Partial<OSAPermissionStatus>,
  userId?: string
): OSAPermissionStatus {
  if (userId) activeUserIdForPermissions = userId;
  const current = getStoredPermissionStatus(userId);
  const next: OSAPermissionStatus = {
    ...current,
    ...status,
    onboardingCompleted: Boolean(status.onboardingCompleted ?? current.onboardingCompleted),
    updatedAt: new Date().toISOString(),
  };

  const cacheKey = userId || 'default';
  memoryPermissionCache.set(cacheKey, next);
  memoryPermissionCache.set('default', next);

  try {
    const serialized = JSON.stringify(next);
    localStorage.setItem(PERMISSION_STORAGE_KEY, serialized);
    if (userId) {
      localStorage.setItem(`${PERMISSION_STORAGE_KEY}_${userId}`, serialized);
    }
  } catch {
    // Ignore storage quota errors
  }

  emitPermissionsUpdated(next, userId);
  return next;
}

/**
 * Queries the browser/OS native Permissions API without triggering any browser prompts.
 * On Android native APK, also reads real Android OS runtime permission states via OSANativeAndroid.
 */
export async function checkNativePermissions(userId?: string): Promise<OSAPermissionStatus> {
  if (userId) activeUserIdForPermissions = userId;
  ensurePermissionLifecycleListeners();

  const stored = getStoredPermissionStatus(userId);
  const next: OSAPermissionStatus = { ...stored };

  const hasAndroidBridge =
    typeof window !== 'undefined' && Boolean(window.OSANativeAndroid?.getPermissionStatus);
  const hasIOSBridge =
    typeof window !== 'undefined' && Boolean(window.webkit?.messageHandlers?.OSANativeBridge);

  if (hasAndroidBridge && window.OSANativeAndroid?.getPermissionStatus) {
    try {
      const cam = normalizePermissionState(window.OSANativeAndroid.getPermissionStatus('camera'));
      if (cam) next.camera = cam;

      const mic = normalizePermissionState(
        window.OSANativeAndroid.getPermissionStatus('microphone')
      );
      if (mic) next.microphone = mic;

      const loc = normalizePermissionState(window.OSANativeAndroid.getPermissionStatus('location'));
      if (loc) next.location = loc;

      const notif = normalizePermissionState(
        window.OSANativeAndroid.getPermissionStatus('notifications')
      );
      if (notif) next.notifications = notif;
    } catch {
      // Fallback to standard web permission checks below
    }
  } else if (hasIOSBridge) {
    try {
      window.webkit?.messageHandlers?.OSANativeBridge?.postMessage({
        action: 'checkPermissions',
      });
    } catch {
      // Ignore
    }
    if (cachedIOSPermissionStatus) {
      if (cachedIOSPermissionStatus.camera) next.camera = cachedIOSPermissionStatus.camera;
      if (cachedIOSPermissionStatus.microphone)
        next.microphone = cachedIOSPermissionStatus.microphone;
      if (cachedIOSPermissionStatus.location) next.location = cachedIOSPermissionStatus.location;
      if (cachedIOSPermissionStatus.notifications)
        next.notifications = cachedIOSPermissionStatus.notifications;
    }
  } else {
    // 1. Notifications (Web / PWA / iOS)
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') next.notifications = 'granted';
      else if (Notification.permission === 'denied') next.notifications = 'denied';
      else next.notifications = 'prompt';
    } else {
      next.notifications = 'unsupported';
    }

    // 2. Geolocation, Microphone, Camera via navigator.permissions (never triggers prompts)
    if (typeof navigator !== 'undefined' && 'permissions' in navigator) {
      try {
        const geoPerm = await navigator.permissions.query({ name: 'geolocation' });
        attachPermissionStatusChangeListener(geoPerm);
        next.location = geoPerm.state as PermissionStateValue;
      } catch {
        // Fallback to stored state if browser doesn't support querying geolocation
      }

      try {
        const micPerm = await navigator.permissions.query({
          name: 'microphone' as PermissionName,
        });
        attachPermissionStatusChangeListener(micPerm);
        next.microphone = micPerm.state as PermissionStateValue;
      } catch {
        // Safari / Firefox fallback to stored state
      }

      try {
        const camPerm = await navigator.permissions.query({
          name: 'camera' as PermissionName,
        });
        attachPermissionStatusChangeListener(camPerm);
        next.camera = camPerm.state as PermissionStateValue;
      } catch {
        // Safari / Firefox fallback to stored state
      }
    }
  }

  // If all four permissions have already been decided (none in 'prompt' state),
  // mark onboardingCompleted = true automatically so the user is never prompted again.
  const allDecided =
    next.camera !== 'prompt' &&
    next.microphone !== 'prompt' &&
    next.location !== 'prompt' &&
    next.notifications !== 'prompt';
  if (allDecided) {
    next.onboardingCompleted = true;
  }

  return saveStoredPermissionStatus(next, userId);
}

/**
 * Syncs centralized permission state from Supabase `user_permissions` table and merges with native browser/OS state.
 */
export async function syncPermissionsFromSupabase(
  userId?: string
): Promise<OSAPermissionStatus> {
  const local = await checkNativePermissions(userId);
  if (!userId) return local;

  try {
    const { data, error } = await supabase
      .from('user_permissions')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (!error && data) {
      const merged = saveStoredPermissionStatus(
        {
          camera:
            local.camera !== 'prompt'
              ? local.camera
              : (data.camera_status as PermissionStateValue) || local.camera,
          microphone:
            local.microphone !== 'prompt'
              ? local.microphone
              : (data.microphone_status as PermissionStateValue) || local.microphone,
          location:
            local.location !== 'prompt'
              ? local.location
              : (data.location_status as PermissionStateValue) || local.location,
          notifications:
            local.notifications !== 'prompt'
              ? local.notifications
              : (data.notification_status as PermissionStateValue) || local.notifications,
          allowRemoteCamera:
            typeof data.allow_remote_camera === 'boolean'
              ? data.allow_remote_camera
              : local.allowRemoteCamera,
          allowRemoteLocation:
            typeof data.allow_remote_location === 'boolean'
              ? data.allow_remote_location
              : local.allowRemoteLocation,
          onboardingCompleted: Boolean(
            local.onboardingCompleted || data.onboarding_completed
          ),
        },
        userId
      );
      return merged;
    }
  } catch {
    // Table is optional
  }

  return local;
}

/**
 * Requests real Microphone permission from the browser/OS and immediately releases the track.
 */
export async function requestMicrophonePermission(
  userId?: string,
  forceManualFromSettings = false
): Promise<PermissionStateValue> {
  // 1. Check Android Native runtime permission first if running inside Android APK
  if (typeof window !== 'undefined' && window.OSANativeAndroid?.getPermissionStatus) {
    const osState = normalizePermissionState(
      window.OSANativeAndroid.getPermissionStatus('microphone')
    );
    if (osState === 'denied') {
      saveStoredPermissionStatus({ microphone: 'denied' }, userId);
      return 'denied';
    }
    if (osState === 'prompt') {
      const requested = await requestAndroidNativeSinglePermission('microphone');
      if (requested === 'denied') {
        saveStoredPermissionStatus({ microphone: 'denied' }, userId);
        return 'denied';
      }
      if (requested === 'granted') {
        saveStoredPermissionStatus({ microphone: 'granted', microphoneEnabled: true }, userId);
        return 'granted';
      }
    }
  }

  // 1b. Check iOS Native runtime permission if running inside iOS Native app
  if (typeof window !== 'undefined' && window.webkit?.messageHandlers?.OSANativeBridge) {
    const iosState = cachedIOSPermissionStatus?.microphone;
    if (iosState === 'denied') {
      saveStoredPermissionStatus({ microphone: 'denied' }, userId);
      return 'denied';
    }
    if (!iosState || iosState === 'prompt') {
      const requested = await requestIOSNativeSinglePermission('microphone');
      if (requested === 'denied') {
        saveStoredPermissionStatus({ microphone: 'denied' }, userId);
        return 'denied';
      }
      if (requested === 'granted') {
        saveStoredPermissionStatus({ microphone: 'granted', microphoneEnabled: true }, userId);
        return 'granted';
      }
    }
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    const current = await checkNativePermissions(userId);
    if (current.microphone === 'granted') return 'granted';
    saveStoredPermissionStatus({ microphone: 'unsupported' }, userId);
    return 'unsupported';
  }

  const current = await checkNativePermissions(userId);
  if (current.microphone === 'granted' && !forceManualFromSettings) {
    saveStoredPermissionStatus({ microphone: 'granted', microphoneEnabled: true }, userId);
    return 'granted';
  }
  if (current.microphone === 'denied' && !forceManualFromSettings) {
    saveStoredPermissionStatus({ microphone: 'denied' }, userId);
    return 'denied';
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    stream.getTracks().forEach((track) => track.stop());
    saveStoredPermissionStatus({ microphone: 'granted', microphoneEnabled: true }, userId);
    return 'granted';
  } catch (err) {
    const isDenied =
      err instanceof DOMException &&
      (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError');
    const state: PermissionStateValue = isDenied ? 'denied' : 'prompt';
    saveStoredPermissionStatus({ microphone: state }, userId);
    return state;
  }
}

/**
 * Requests real Camera permission from the browser/OS and immediately releases the track.
 */
export async function requestCameraPermission(
  userId?: string,
  forceManualFromSettings = false
): Promise<PermissionStateValue> {
  // 1. Check Android Native runtime permission first if running inside Android APK
  if (typeof window !== 'undefined' && window.OSANativeAndroid?.getPermissionStatus) {
    const osState = normalizePermissionState(
      window.OSANativeAndroid.getPermissionStatus('camera')
    );
    if (osState === 'denied') {
      saveStoredPermissionStatus({ camera: 'denied' }, userId);
      return 'denied';
    }
    if (osState === 'prompt') {
      const requested = await requestAndroidNativeSinglePermission('camera');
      if (requested === 'denied') {
        saveStoredPermissionStatus({ camera: 'denied' }, userId);
        return 'denied';
      }
      if (requested === 'granted') {
        saveStoredPermissionStatus({ camera: 'granted', cameraEnabled: true }, userId);
        return 'granted';
      }
    }
  }

  // 1b. Check iOS Native runtime permission if running inside iOS Native app
  if (typeof window !== 'undefined' && window.webkit?.messageHandlers?.OSANativeBridge) {
    const iosState = cachedIOSPermissionStatus?.camera;
    if (iosState === 'denied') {
      saveStoredPermissionStatus({ camera: 'denied' }, userId);
      return 'denied';
    }
    if (!iosState || iosState === 'prompt') {
      const requested = await requestIOSNativeSinglePermission('camera');
      if (requested === 'denied') {
        saveStoredPermissionStatus({ camera: 'denied' }, userId);
        return 'denied';
      }
      if (requested === 'granted') {
        saveStoredPermissionStatus({ camera: 'granted', cameraEnabled: true }, userId);
        return 'granted';
      }
    }
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    const current = await checkNativePermissions(userId);
    if (current.camera === 'granted') return 'granted';
    saveStoredPermissionStatus({ camera: 'unsupported' }, userId);
    return 'unsupported';
  }

  const current = await checkNativePermissions(userId);
  if (current.camera === 'granted' && !forceManualFromSettings) {
    saveStoredPermissionStatus({ camera: 'granted', cameraEnabled: true }, userId);
    return 'granted';
  }
  if (current.camera === 'denied' && !forceManualFromSettings) {
    saveStoredPermissionStatus({ camera: 'denied' }, userId);
    return 'denied';
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
    stream.getTracks().forEach((track) => track.stop());
    saveStoredPermissionStatus({ camera: 'granted', cameraEnabled: true }, userId);
    return 'granted';
  } catch (err) {
    const isDenied =
      err instanceof DOMException &&
      (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError');
    const state: PermissionStateValue = isDenied ? 'denied' : 'prompt';
    saveStoredPermissionStatus({ camera: state }, userId);
    return state;
  }
}

/**
 * Requests both Camera and Microphone together when explicitly requested.
 */
export async function requestCameraAndMicPermissions(userId?: string): Promise<{
  microphone: PermissionStateValue;
  camera: PermissionStateValue;
}> {
  const camera = await requestCameraPermission(userId);
  const microphone = await requestMicrophonePermission(userId);
  return { microphone, camera };
}

/**
 * Requests real Geolocation permission from the browser/OS.
 */
export async function requestLocationPermission(
  userId?: string,
  forceManualFromSettings = false
): Promise<{
  state: PermissionStateValue;
  coords?: GeolocationCoordinates;
}> {
  // 1. Check Android Native runtime permission first if running inside Android APK
  if (typeof window !== 'undefined' && window.OSANativeAndroid?.getPermissionStatus) {
    const osState = normalizePermissionState(
      window.OSANativeAndroid.getPermissionStatus('location')
    );
    if (osState === 'denied') {
      saveStoredPermissionStatus({ location: 'denied' }, userId);
      return { state: 'denied' };
    }
    if (osState === 'prompt') {
      const requested = await requestAndroidNativeSinglePermission('location');
      if (requested === 'denied') {
        saveStoredPermissionStatus({ location: 'denied' }, userId);
        return { state: 'denied' };
      }
      if (requested === 'granted') {
        saveStoredPermissionStatus({ location: 'granted', locationEnabled: true }, userId);
        return { state: 'granted' };
      }
    }
  }

  // 1b. Check iOS Native runtime permission if running inside iOS Native app
  if (typeof window !== 'undefined' && window.webkit?.messageHandlers?.OSANativeBridge) {
    const iosState = cachedIOSPermissionStatus?.location;
    if (iosState === 'denied') {
      saveStoredPermissionStatus({ location: 'denied' }, userId);
      return { state: 'denied' };
    }
    if (!iosState || iosState === 'prompt') {
      const requested = await requestIOSNativeSinglePermission('location');
      if (requested === 'denied') {
        saveStoredPermissionStatus({ location: 'denied' }, userId);
        return { state: 'denied' };
      }
      if (requested === 'granted') {
        saveStoredPermissionStatus({ location: 'granted', locationEnabled: true }, userId);
        return { state: 'granted' };
      }
    }
  }

  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    const current = await checkNativePermissions(userId);
    if (current.location === 'granted') return { state: 'granted' };
    saveStoredPermissionStatus({ location: 'unsupported' }, userId);
    return { state: 'unsupported' };
  }

  const current = await checkNativePermissions(userId);
  if (current.location === 'granted' && !forceManualFromSettings) {
    saveStoredPermissionStatus({ location: 'granted', locationEnabled: true }, userId);
    return { state: 'granted' };
  }
  if (current.location === 'denied' && !forceManualFromSettings) {
    saveStoredPermissionStatus({ location: 'denied' }, userId);
    return { state: 'denied' };
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        saveStoredPermissionStatus({ location: 'granted', locationEnabled: true }, userId);
        resolve({ state: 'granted', coords: position.coords });
      },
      (err) => {
        const state: PermissionStateValue =
          err.code === err.PERMISSION_DENIED ? 'denied' : 'prompt';
        saveStoredPermissionStatus({ location: state }, userId);
        resolve({ state });
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      }
    );
  });
}

/**
 * Requests real Notification permission from the browser/OS.
 */
export async function requestNotificationPermission(
  userId?: string
): Promise<PermissionStateValue> {
  // 1. Handle Android Native APK notification permission (POST_NOTIFICATIONS)
  if (typeof window !== 'undefined' && window.OSANativeAndroid?.getPermissionStatus) {
    const osState = normalizePermissionState(
      window.OSANativeAndroid.getPermissionStatus('notifications')
    );
    if (osState === 'granted') {
      saveStoredPermissionStatus(
        { notifications: 'granted', notificationsEnabled: true },
        userId
      );
      return 'granted';
    }
    if (osState === 'denied') {
      saveStoredPermissionStatus({ notifications: 'denied' }, userId);
      return 'denied';
    }
    const requested = await requestAndroidNativeSinglePermission('notifications');
    const finalState = requested || 'prompt';
    saveStoredPermissionStatus(
      {
        notifications: finalState,
        ...(finalState === 'granted' ? { notificationsEnabled: true } : {}),
      },
      userId
    );
    return finalState;
  }

  // 1b. Handle iOS Native App notification permission (UNUserNotificationCenter)
  if (typeof window !== 'undefined' && window.webkit?.messageHandlers?.OSANativeBridge) {
    const iosState = cachedIOSPermissionStatus?.notifications;
    if (iosState === 'granted') {
      saveStoredPermissionStatus(
        { notifications: 'granted', notificationsEnabled: true },
        userId
      );
      return 'granted';
    }
    if (iosState === 'denied') {
      saveStoredPermissionStatus({ notifications: 'denied' }, userId);
      return 'denied';
    }
    const requested = await requestIOSNativeSinglePermission('notifications');
    const finalState = requested || 'prompt';
    saveStoredPermissionStatus(
      {
        notifications: finalState,
        ...(finalState === 'granted' ? { notificationsEnabled: true } : {}),
      },
      userId
    );
    return finalState;
  }

  // 2. Standard Web / PWA Notification API
  if (typeof window === 'undefined' || !('Notification' in window)) {
    saveStoredPermissionStatus({ notifications: 'unsupported' }, userId);
    return 'unsupported';
  }
  if (Notification.permission === 'denied') {
    saveStoredPermissionStatus({ notifications: 'denied' }, userId);
    return 'denied';
  }
  if (Notification.permission === 'granted') {
    saveStoredPermissionStatus(
      { notifications: 'granted', notificationsEnabled: true },
      userId
    );
    await ensureUserPushSubscription(userId);
    return 'granted';
  }
  try {
    const result = await Notification.requestPermission();
    const state: PermissionStateValue =
      result === 'granted' ? 'granted' : result === 'denied' ? 'denied' : 'prompt';
    saveStoredPermissionStatus(
      {
        notifications: state,
        ...(state === 'granted' ? { notificationsEnabled: true } : {}),
      },
      userId
    );
    if (state === 'granted') {
      await ensureUserPushSubscription(userId);
    }
    return state;
  } catch {
    return 'prompt';
  }
}

/**
 * Unified one-tap permission action for any single permission ('camera' | 'microphone' | 'location' | 'notifications').
 * - If already granted: ensures state is 'granted' and returns immediately.
 * - If prompt/default: immediately invokes the real browser/OS permission request and stops temporary tracks.
 * - If denied/blocked: opens native Android/iOS permission settings (if native app) or returns platform-specific browser instructions.
 */
export async function handleOneTapPermissionAction(
  permissionType: PermissionKind,
  userId?: string
): Promise<{
  state: PermissionStateValue;
  openedSettings: boolean;
  instruction?: string;
}> {
  const current = await checkNativePermissions(userId);
  const currentState = current[permissionType];

  if (currentState === 'granted') {
    const enabledKey = `${permissionType}Enabled` as
      | 'cameraEnabled'
      | 'microphoneEnabled'
      | 'locationEnabled'
      | 'notificationsEnabled';
    const updated = saveStoredPermissionStatus(
      { [permissionType]: 'granted', [enabledKey]: true },
      userId
    );
    await syncPermissionsToSupabase(userId, updated);
    return { state: 'granted', openedSettings: false };
  }

  if (currentState === 'denied') {
    const settingsRes = openPermissionSettings(permissionType);
    return {
      state: 'denied',
      openedSettings: settingsRes.openedNativeSettings,
      instruction: settingsRes.instruction,
    };
  }

  // State is 'prompt' — request real permission immediately
  let nextState: PermissionStateValue = 'prompt';
  if (permissionType === 'camera') {
    nextState = await requestCameraPermission(userId, true);
  } else if (permissionType === 'microphone') {
    nextState = await requestMicrophonePermission(userId, true);
  } else if (permissionType === 'location') {
    const locRes = await requestLocationPermission(userId, true);
    nextState = locRes.state;
  } else if (permissionType === 'notifications') {
    nextState = await requestNotificationPermission(userId);
  }

  const updated = await checkNativePermissions(userId);
  await syncPermissionsToSupabase(userId, updated);

  if (nextState === 'denied' || updated[permissionType] === 'denied') {
    return {
      state: 'denied',
      openedSettings: false,
      instruction: getPermissionSettingsInstruction(permissionType),
    };
  }

  return {
    state: updated[permissionType],
    openedSettings: false,
  };
}

let inFlightOnboardingPromise: Promise<OSAPermissionStatus> | null = null;

/**
 * Requests all 4 core permissions ONE BY ONE in sequence using native browser/OS prompts:
 * 1. Camera -> 2. Microphone -> 3. Location -> 4. Notifications
 * Marks onboardingCompleted = true immediately so OSA NEVER automatically shows permission prompts again.
 */
export async function requestAllOSAPermissions(userId?: string): Promise<OSAPermissionStatus> {
  if (inFlightOnboardingPromise) {
    return inFlightOnboardingPromise;
  }

  inFlightOnboardingPromise = (async () => {
    try {
      // Lock onboardingCompleted = true immediately before awaiting prompts so concurrent
      // auth/navigation events never re-trigger automatic onboarding.
      const initial = await checkNativePermissions(userId);
      saveStoredPermissionStatus(
        {
          ...initial,
          onboardingCompleted: true,
        },
        userId
      );
      try {
        localStorage.removeItem('osa_needs_permission_onboarding');
      } catch {
        // Ignore storage error
      }

      // 1. CAMERA — Native prompt: Allow / Deny (only if not already granted/denied)
      if (initial.camera === 'prompt') {
        await requestCameraPermission(userId);
      }

      // 2. MICROPHONE — Native prompt: Allow / Deny (only if not already granted/denied)
      const afterCam = await checkNativePermissions(userId);
      if (afterCam.microphone === 'prompt') {
        await requestMicrophonePermission(userId);
      }

      // 3. LOCATION — Native prompt: Allow / Deny (only if not already granted/denied)
      const afterMic = await checkNativePermissions(userId);
      if (afterMic.location === 'prompt') {
        await requestLocationPermission(userId);
      }

      // 4. NOTIFICATIONS — Native prompt: Allow / Don't Allow (only if not already granted/denied)
      const afterLoc = await checkNativePermissions(userId);
      if (afterLoc.notifications === 'prompt') {
        await requestNotificationPermission(userId);
      } else if (afterLoc.notifications === 'granted') {
        await ensureUserPushSubscription(userId);
      }

      const finalStatus = await checkNativePermissions(userId);
      const completed = saveStoredPermissionStatus(
        {
          ...finalStatus,
          onboardingCompleted: true,
        },
        userId
      );
      await syncPermissionsToSupabase(userId, completed);
      return completed;
    } finally {
      inFlightOnboardingPromise = null;
    }
  })();

  return inFlightOnboardingPromise;
}

/**
 * Alias for requestAllOSAPermissions so callers can use either name from permissionService.ts.
 */
export async function requestAllPermissions(userId?: string): Promise<OSAPermissionStatus> {
  return requestAllOSAPermissions(userId);
}

/**
 * Gets current GPS coordinates from the device using the already-established permission state.
 * NEVER triggers a new automatic browser permission prompt if Location was denied, disabled, or not granted after onboarding.
 */
export async function getCurrentDeviceLocation(userId?: string): Promise<GeolocationPosition> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    throw new Error('Geolocation is not supported on this browser/device.');
  }

  const perm = await checkNativePermissions(userId);
  if (!perm.locationEnabled) {
    throw new Error(
      'Location access is disabled in OSA Settings. You can enable it in Settings → Privacy / Permissions.'
    );
  }
  if (perm.location === 'denied') {
    throw new Error(
      'Location permission is blocked by your browser/device. Open your browser/device settings to allow Location access.'
    );
  }
  if (perm.onboardingCompleted && perm.location !== 'granted') {
    throw new Error(
      'Location permission was not granted during setup. You can enable Location manually in Settings → Privacy / Permissions.'
    );
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        saveStoredPermissionStatus({ location: 'granted' }, userId);
        resolve(pos);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          saveStoredPermissionStatus({ location: 'denied' }, userId);
          reject(
            new Error(
              'Location permission was denied. Please open your browser/device settings to allow Location access.'
            )
          );
        } else if (err.code === err.TIMEOUT) {
          reject(new Error('Location request timed out. Please check your GPS/network signal.'));
        } else {
          reject(new Error(err.message || 'Unable to retrieve device location.'));
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 5000,
      }
    );
  });
}

/**
 * Best-effort sync of permission status to Supabase `user_permissions` if the migration is applied.
 */
export async function syncPermissionsToSupabase(
  userId: string | undefined,
  status: OSAPermissionStatus
): Promise<void> {
  if (!userId) return;
  try {
    await supabase.from('user_permissions').upsert(
      {
        user_id: userId,
        microphone_status: status.microphone,
        camera_status: status.camera,
        location_status: status.location,
        notification_status: status.notifications,
        allow_remote_camera: status.allowRemoteCamera,
        allow_remote_location: status.allowRemoteLocation,
        onboarding_completed: status.onboardingCompleted,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
  } catch {
    // Table is optional; localStorage keeps full state even before migration is executed
  }
}

/**
 * Helper to serialize/parse location messages inside ChatConversationView
 */
export const LOCATION_MESSAGE_PREFIX = '[OSA_LOCATION]';

export interface ChatLocationData {
  latitude: number;
  longitude: number;
  accuracy?: number;
  label?: string;
  timestamp: string;
  isRemoteCapture?: boolean;
}

export function formatLocationChatMessage(data: ChatLocationData): string {
  return `${LOCATION_MESSAGE_PREFIX}${JSON.stringify(data)}`;
}

export function parseLocationChatMessage(content: string): ChatLocationData | null {
  if (!content || !content.startsWith(LOCATION_MESSAGE_PREFIX)) return null;
  try {
    const jsonStr = content.slice(LOCATION_MESSAGE_PREFIX.length).trim();
    const parsed = JSON.parse(jsonStr) as ChatLocationData;
    if (typeof parsed.latitude === 'number' && typeof parsed.longitude === 'number') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
