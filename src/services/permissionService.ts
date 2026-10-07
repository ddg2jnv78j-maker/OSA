import { supabase } from '../lib/supabase';
import { ensureUserPushSubscription } from './pushNotificationService';

export type PermissionStateValue = 'granted' | 'denied' | 'prompt' | 'unsupported';

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

export function getStoredPermissionStatus(userId?: string): OSAPermissionStatus {
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
 */
export async function checkNativePermissions(userId?: string): Promise<OSAPermissionStatus> {
  const stored = getStoredPermissionStatus(userId);
  const next: OSAPermissionStatus = { ...stored };

  // 1. Notifications
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
      next.location = geoPerm.state as PermissionStateValue;
    } catch {
      // Fallback to stored state if browser doesn't support querying geolocation
    }

    try {
      const micPerm = await navigator.permissions.query({
        name: 'microphone' as PermissionName,
      });
      next.microphone = micPerm.state as PermissionStateValue;
    } catch {
      // Safari / Firefox fallback to stored state
    }

    try {
      const camPerm = await navigator.permissions.query({
        name: 'camera' as PermissionName,
      });
      next.camera = camPerm.state as PermissionStateValue;
    } catch {
      // Safari / Firefox fallback to stored state
    }
  }

  // If all four permissions have already been decided in the browser (none in 'prompt' state),
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
 * Syncs centralized permission state from Supabase `user_permissions` table and merges with native browser state.
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
 * Respects existing granted/denied browser permission state without re-prompting if already decided.
 */
export async function requestMicrophonePermission(
  userId?: string,
  forceManualFromSettings = false
): Promise<PermissionStateValue> {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    saveStoredPermissionStatus({ microphone: 'unsupported' }, userId);
    return 'unsupported';
  }

  const current = await checkNativePermissions(userId);
  if (current.microphone === 'denied') {
    saveStoredPermissionStatus({ microphone: 'denied' }, userId);
    return 'denied';
  }
  if (current.microphone === 'granted' && !forceManualFromSettings) {
    saveStoredPermissionStatus({ microphone: 'granted', microphoneEnabled: true }, userId);
    return 'granted';
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
 * Respects existing granted/denied browser permission state without re-prompting if already decided.
 */
export async function requestCameraPermission(
  userId?: string,
  forceManualFromSettings = false
): Promise<PermissionStateValue> {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    saveStoredPermissionStatus({ camera: 'unsupported' }, userId);
    return 'unsupported';
  }

  const current = await checkNativePermissions(userId);
  if (current.camera === 'denied') {
    saveStoredPermissionStatus({ camera: 'denied' }, userId);
    return 'denied';
  }
  if (current.camera === 'granted' && !forceManualFromSettings) {
    saveStoredPermissionStatus({ camera: 'granted', cameraEnabled: true }, userId);
    return 'granted';
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
 * Respects existing granted/denied browser permission state.
 */
export async function requestLocationPermission(
  userId?: string,
  forceManualFromSettings = false
): Promise<{
  state: PermissionStateValue;
  coords?: GeolocationCoordinates;
}> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    saveStoredPermissionStatus({ location: 'unsupported' }, userId);
    return { state: 'unsupported' };
  }

  const current = await checkNativePermissions(userId);
  if (current.location === 'denied') {
    saveStoredPermissionStatus({ location: 'denied' }, userId);
    return { state: 'denied' };
  }
  if (current.location === 'granted' && !forceManualFromSettings) {
    saveStoredPermissionStatus({ location: 'granted', locationEnabled: true }, userId);
    return { state: 'granted' };
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
