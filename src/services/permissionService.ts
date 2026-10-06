import { supabase } from '../lib/supabase';

export type PermissionStateValue = 'granted' | 'denied' | 'prompt' | 'unsupported';

export interface OSAPermissionStatus {
  microphone: PermissionStateValue;
  camera: PermissionStateValue;
  location: PermissionStateValue;
  notifications: PermissionStateValue;
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

const PERMISSION_STORAGE_KEY = 'osa_device_permissions_v1';

const DEFAULT_PERMISSION_STATUS: OSAPermissionStatus = {
  microphone: 'prompt',
  camera: 'prompt',
  location: 'prompt',
  notifications: 'prompt',
  onboardingCompleted: false,
  allowRemoteCamera: true,
  allowRemoteLocation: true,
  updatedAt: new Date().toISOString(),
};

export function getStoredPermissionStatus(userId?: string): OSAPermissionStatus {
  try {
    const key = userId ? `${PERMISSION_STORAGE_KEY}_${userId}` : PERMISSION_STORAGE_KEY;
    const raw = localStorage.getItem(key) || localStorage.getItem(PERMISSION_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PERMISSION_STATUS };
    const parsed = JSON.parse(raw) as Partial<OSAPermissionStatus>;
    return {
      ...DEFAULT_PERMISSION_STATUS,
      ...parsed,
    };
  } catch {
    return { ...DEFAULT_PERMISSION_STATUS };
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
    updatedAt: new Date().toISOString(),
  };
  try {
    const serialized = JSON.stringify(next);
    localStorage.setItem(PERMISSION_STORAGE_KEY, serialized);
    if (userId) {
      localStorage.setItem(`${PERMISSION_STORAGE_KEY}_${userId}`, serialized);
    }
  } catch {
    // Ignore storage quota errors
  }
  return next;
}

/**
 * Queries the browser/OS native Permissions API without triggering prompts.
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

  // 2. Geolocation via navigator.permissions
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

  return saveStoredPermissionStatus(next, userId);
}

/**
 * Requests real Microphone permission from the browser/OS and immediately releases the track.
 */
export async function requestMicrophonePermission(userId?: string): Promise<PermissionStateValue> {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    saveStoredPermissionStatus({ microphone: 'unsupported' }, userId);
    return 'unsupported';
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    stream.getTracks().forEach((track) => track.stop());
    saveStoredPermissionStatus({ microphone: 'granted' }, userId);
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
export async function requestCameraPermission(userId?: string): Promise<PermissionStateValue> {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    saveStoredPermissionStatus({ camera: 'unsupported' }, userId);
    return 'unsupported';
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
    stream.getTracks().forEach((track) => track.stop());
    saveStoredPermissionStatus({ camera: 'granted' }, userId);
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
 * Requests both Camera and Microphone together in a single prompt when possible,
 * falling back to individual requests if one hardware device is missing.
 */
export async function requestCameraAndMicPermissions(userId?: string): Promise<{
  microphone: PermissionStateValue;
  camera: PermissionStateValue;
}> {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    saveStoredPermissionStatus({ microphone: 'unsupported', camera: 'unsupported' }, userId);
    return { microphone: 'unsupported', camera: 'unsupported' };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    stream.getTracks().forEach((track) => track.stop());
    saveStoredPermissionStatus({ microphone: 'granted', camera: 'granted' }, userId);
    return { microphone: 'granted', camera: 'granted' };
  } catch {
    const microphone = await requestMicrophonePermission(userId);
    const camera = await requestCameraPermission(userId);
    return { microphone, camera };
  }
}

/**
 * Requests real Geolocation permission from the browser/OS.
 */
export async function requestLocationPermission(userId?: string): Promise<{
  state: PermissionStateValue;
  coords?: GeolocationCoordinates;
}> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    saveStoredPermissionStatus({ location: 'unsupported' }, userId);
    return { state: 'unsupported' };
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        saveStoredPermissionStatus({ location: 'granted' }, userId);
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
  try {
    const result = await Notification.requestPermission();
    const state: PermissionStateValue =
      result === 'granted' ? 'granted' : result === 'denied' ? 'denied' : 'prompt';
    saveStoredPermissionStatus({ notifications: state }, userId);
    return state;
  } catch {
    return 'prompt';
  }
}

/**
 * Requests all 4 core permissions in sequence for first-time registration / onboarding.
 */
export async function requestAllOSAPermissions(userId?: string): Promise<OSAPermissionStatus> {
  await requestCameraAndMicPermissions(userId);
  await requestLocationPermission(userId);
  await requestNotificationPermission(userId);
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
}

/**
 * Gets current GPS coordinates from the device.
 */
export async function getCurrentDeviceLocation(): Promise<GeolocationPosition> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    throw new Error('Geolocation is not supported on this browser/device.');
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(
            new Error(
              'Location permission was denied. Please allow Location access in your browser/device settings.'
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
