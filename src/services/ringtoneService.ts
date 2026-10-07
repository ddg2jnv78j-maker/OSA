import { supabase } from '../lib/supabase';

export type OSARingtoneId =
  | 'osa-ringtone-01'
  | 'osa-ringtone-02'
  | 'osa-ringtone-03'
  | 'osa-ringtone-04'
  | 'osa-ringtone-05'
  | 'osa-ringtone-06'
  | 'osa-ringtone-07'
  | 'osa-ringtone-08'
  | 'osa-ringtone-09'
  | 'osa-ringtone-10'
  | 'osa-ringtone-11'
  | 'osa-ringtone-12'
  | 'osa-ringtone-13'
  | 'osa-ringtone-14'
  | 'osa-ringtone-15'
  | 'osa-ringtone-16'
  | 'osa-ringtone-17'
  | 'osa-ringtone-18'
  | 'osa-ringtone-19'
  | 'osa-ringtone-20';

export const DEFAULT_RINGTONE_ID: OSARingtoneId = 'osa-ringtone-01';

export interface OSARingtoneItem {
  id: OSARingtoneId;
  number: string;
  name: string;
  subtitle: string;
  filename: string;
  url: string;
}

const RINGTONE_SUBTITLES: Record<OSARingtoneId, string> = {
  'osa-ringtone-01': 'Signature Crystal Chime (Default)',
  'osa-ringtone-02': 'Warm Marimba Cascade',
  'osa-ringtone-03': 'Modern Pulse Dual-Tone',
  'osa-ringtone-04': 'Crystal Glass Harmonic',
  'osa-ringtone-05': 'Silk Kalimba Pluck',
  'osa-ringtone-06': 'Horizon Synth Arpeggio',
  'osa-ringtone-07': 'Executive Digital Ring',
  'osa-ringtone-08': 'Emerald Harp Strum',
  'osa-ringtone-09': 'Aurora Vibraphone',
  'osa-ringtone-10': 'Velocity Syncopation',
  'osa-ringtone-11': 'Morning Dew Drops',
  'osa-ringtone-12': 'Zenith Bell Chorus',
  'osa-ringtone-13': 'Acoustic Wood Chime',
  'osa-ringtone-14': 'Breeze Celesta',
  'osa-ringtone-15': 'Metro Staccato Alert',
  'osa-ringtone-16': 'Starlight Echo',
  'osa-ringtone-17': 'Sonar Harmonic Wave',
  'osa-ringtone-18': 'Fiesta Marimba',
  'osa-ringtone-19': 'Serene Lotus Chime',
  'osa-ringtone-20': 'OSA Finale Fanfare',
};

const baseUrl = import.meta.env.BASE_URL || '/';
const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

export const OSA_RINGTONES: OSARingtoneItem[] = Array.from({ length: 20 }, (_, i) => {
  const num = String(i + 1).padStart(2, '0');
  const id = `osa-ringtone-${num}` as OSARingtoneId;
  const filename = `osa-ringtone-${num}.mp3`;
  return {
    id,
    number: num,
    name: `OSA Ringtone ${num}`,
    subtitle: RINGTONE_SUBTITLES[id],
    filename,
    url: `${normalizedBase}ringtones/${filename}`,
  };
});

export function isValidRingtoneId(value: unknown): value is OSARingtoneId {
  return (
    typeof value === 'string' &&
    OSA_RINGTONES.some((item) => item.id === value)
  );
}

export function getRingtoneById(id?: string | null): OSARingtoneItem {
  if (id && isValidRingtoneId(id)) {
    const found = OSA_RINGTONES.find((r) => r.id === id);
    if (found) return found;
  }
  return OSA_RINGTONES[0];
}

const STORAGE_KEY_PREFIX = 'osa_selected_ringtone_';
const STORAGE_KEY_DEFAULT = 'osa_selected_ringtone_default';
export const RINGTONE_CHANGED_EVENT = 'osa-ringtone-changed';

export function getSelectedRingtoneId(userId?: string | null): OSARingtoneId {
  try {
    if (userId) {
      const userSaved = localStorage.getItem(`${STORAGE_KEY_PREFIX}${userId}`);
      if (isValidRingtoneId(userSaved)) {
        return userSaved;
      }
    }
    const defaultSaved = localStorage.getItem(STORAGE_KEY_DEFAULT);
    if (isValidRingtoneId(defaultSaved)) {
      return defaultSaved;
    }
  } catch {
    // Ignore storage access errors
  }
  return DEFAULT_RINGTONE_ID;
}

export async function saveSelectedRingtoneId(
  userId: string | null | undefined,
  ringtoneId: OSARingtoneId
): Promise<OSARingtoneId> {
  const validId: OSARingtoneId = isValidRingtoneId(ringtoneId)
    ? ringtoneId
    : DEFAULT_RINGTONE_ID;

  try {
    if (userId) {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${userId}`, validId);
    }
    localStorage.setItem(STORAGE_KEY_DEFAULT, validId);
    window.dispatchEvent(
      new CustomEvent(RINGTONE_CHANGED_EVENT, {
        detail: { userId, ringtoneId: validId },
      })
    );
  } catch {
    // Ignore localStorage write errors
  }

  if (userId) {
    try {
      await supabase.auth.updateUser({
        data: { osa_ringtone_id: validId },
      });
    } catch {
      // Ignore network/auth metadata update error; localStorage persists locally
    }
  }

  return validId;
}

export async function syncUserRingtoneFromSupabase(
  userId: string
): Promise<OSARingtoneId> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const metaRingtone = user?.user_metadata?.osa_ringtone_id;
    if (isValidRingtoneId(metaRingtone)) {
      try {
        localStorage.setItem(`${STORAGE_KEY_PREFIX}${userId}`, metaRingtone);
        localStorage.setItem(STORAGE_KEY_DEFAULT, metaRingtone);
        window.dispatchEvent(
          new CustomEvent(RINGTONE_CHANGED_EVENT, {
            detail: { userId, ringtoneId: metaRingtone },
          })
        );
      } catch {
        // Ignore
      }
      return metaRingtone;
    }
  } catch {
    // Ignore
  }
  return getSelectedRingtoneId(userId);
}

// ============================================================================
// SINGLETON RINGTONE AUDIO ENGINE (Prevents duplicate/overlapping playback)
// ============================================================================

let sharedPreviewAudio: HTMLAudioElement | null = null;
let currentPreviewId: OSARingtoneId | null = null;
let isPreviewPlaying = false;
const previewListeners = new Set<
  (state: { ringtoneId: OSARingtoneId | null; playing: boolean }) => void
>();

let sharedIncomingCallAudio: HTMLAudioElement | null = null;
let activeIncomingCallId: string | null = null;
let pendingUnlockHandler: (() => void) | null = null;

function notifyPreviewListeners() {
  const snapshot = {
    ringtoneId: currentPreviewId,
    playing: isPreviewPlaying,
  };
  previewListeners.forEach((cb) => {
    try {
      cb(snapshot);
    } catch {
      // Ignore listener error
    }
  });
}

export function subscribeRingtonePreview(
  listener: (state: { ringtoneId: OSARingtoneId | null; playing: boolean }) => void
): () => void {
  previewListeners.add(listener);
  listener({ ringtoneId: currentPreviewId, playing: isPreviewPlaying });
  return () => {
    previewListeners.delete(listener);
  };
}

export function stopRingtonePreview(): void {
  if (sharedPreviewAudio) {
    try {
      sharedPreviewAudio.pause();
      sharedPreviewAudio.currentTime = 0;
      sharedPreviewAudio.onended = null;
      sharedPreviewAudio.onerror = null;
    } catch {
      // Ignore
    }
  }
  if (currentPreviewId !== null || isPreviewPlaying) {
    currentPreviewId = null;
    isPreviewPlaying = false;
    notifyPreviewListeners();
  }
}

export async function toggleRingtonePreview(
  ringtoneId: OSARingtoneId
): Promise<boolean> {
  // Do not interrupt an active incoming call ringtone
  if (activeIncomingCallId) {
    return false;
  }

  const item = getRingtoneById(ringtoneId);

  // If the same ringtone is currently playing, pause/stop it
  if (currentPreviewId === item.id && isPreviewPlaying && sharedPreviewAudio) {
    stopRingtonePreview();
    return false;
  }

  // Stop any previously playing preview first
  stopRingtonePreview();

  if (!sharedPreviewAudio) {
    sharedPreviewAudio = new Audio();
    sharedPreviewAudio.preload = 'auto';
  }

  sharedPreviewAudio.loop = false;
  sharedPreviewAudio.src = item.url;
  sharedPreviewAudio.currentTime = 0;
  currentPreviewId = item.id;
  isPreviewPlaying = true;
  notifyPreviewListeners();

  sharedPreviewAudio.onended = () => {
    if (currentPreviewId === item.id) {
      currentPreviewId = null;
      isPreviewPlaying = false;
      notifyPreviewListeners();
    }
  };

  sharedPreviewAudio.onerror = () => {
    if (currentPreviewId === item.id) {
      currentPreviewId = null;
      isPreviewPlaying = false;
      notifyPreviewListeners();
    }
  };

  try {
    await sharedPreviewAudio.play();
    return true;
  } catch {
    currentPreviewId = null;
    isPreviewPlaying = false;
    notifyPreviewListeners();
    return false;
  }
}

function clearPendingUnlockHandler() {
  if (pendingUnlockHandler) {
    window.removeEventListener('pointerdown', pendingUnlockHandler);
    window.removeEventListener('keydown', pendingUnlockHandler);
    pendingUnlockHandler = null;
  }
}

/**
 * Starts looping the user's selected OSA ringtone for an incoming Audio or Video Call.
 * Guarantees a single audio instance and prevents duplicate overlapping ringtones.
 */
export function startIncomingCallRingtone(
  userId: string | null | undefined,
  callId: string
): void {
  if (!callId) return;

  // Stop any settings preview immediately
  stopRingtonePreview();

  // Prevent duplicate playback if already ringing for this exact call
  if (
    activeIncomingCallId === callId &&
    sharedIncomingCallAudio &&
    !sharedIncomingCallAudio.paused
  ) {
    return;
  }

  // Stop any previous call ringtone instance first
  stopIncomingCallRingtone();

  const selectedId = getSelectedRingtoneId(userId);
  const item = getRingtoneById(selectedId);

  if (!sharedIncomingCallAudio) {
    sharedIncomingCallAudio = new Audio();
    sharedIncomingCallAudio.preload = 'auto';
  }

  activeIncomingCallId = callId;
  sharedIncomingCallAudio.loop = true;
  sharedIncomingCallAudio.src = item.url;
  sharedIncomingCallAudio.currentTime = 0;

  const playPromise = sharedIncomingCallAudio.play();
  if (playPromise !== undefined) {
    playPromise.catch(() => {
      // Respect mobile/browser autoplay policies gracefully without breaking call UI.
      // If user interacts with the page while still ringing, start playback if call is still active.
      clearPendingUnlockHandler();
      pendingUnlockHandler = () => {
        clearPendingUnlockHandler();
        if (activeIncomingCallId === callId && sharedIncomingCallAudio) {
          sharedIncomingCallAudio.play().catch(() => {});
        }
      };
      window.addEventListener('pointerdown', pendingUnlockHandler, { once: true });
      window.addEventListener('keydown', pendingUnlockHandler, { once: true });
    });
  }
}

/**
 * Immediately stops any incoming call ringtone playback.
 */
export function stopIncomingCallRingtone(): void {
  clearPendingUnlockHandler();
  activeIncomingCallId = null;

  if (sharedIncomingCallAudio) {
    try {
      sharedIncomingCallAudio.pause();
      sharedIncomingCallAudio.currentTime = 0;
      sharedIncomingCallAudio.loop = false;
    } catch {
      // Ignore
    }
  }
}

/**
 * Stops both preview and incoming call ringtones (used on logout or app unmount).
 */
export function stopAllRingtoneAudio(): void {
  stopRingtonePreview();
  stopIncomingCallRingtone();
}
