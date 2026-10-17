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

// Authoritative singleton Caller Ringback Tone ("pooo... pooo...") state
let ringbackAudioCtx: AudioContext | null = null;
let activeRingbackCallId: string | null = null;
let ringbackIntervalId: number | null = null;
let activeRingbackOsc1: OscillatorNode | null = null;
let activeRingbackOsc2: OscillatorNode | null = null;
let activeRingbackGain: GainNode | null = null;
let fallbackRingbackAudio: HTMLAudioElement | null = null;
let fallbackRingbackWavUrl: string | null = null;
let pendingRingbackUnlockHandler: (() => void) | null = null;

function isAndroidNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as { OSANativeAndroid?: unknown };
  return Boolean(w.OSANativeAndroid);
}

/**
 * Generates an in-memory PCM WAV data URL containing one cycle of a standard
 * dual-tone (440 Hz + 480 Hz) telecommunications ringback tone:
 * 1.8s smooth "pooo..." tone burst followed by 3.0s silence.
 */
function getOrCreateRingbackWavUrl(): string {
  if (fallbackRingbackWavUrl) return fallbackRingbackWavUrl;
  const sampleRate = 8000;
  const toneSeconds = 1.8;
  const silenceSeconds = 3.0;
  const totalSeconds = toneSeconds + silenceSeconds;
  const numSamples = Math.floor(sampleRate * totalSeconds);
  const toneSamples = Math.floor(sampleRate * toneSeconds);
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  const fadeSamples = Math.floor(sampleRate * 0.04);
  for (let i = 0; i < numSamples; i++) {
    let sample = 0;
    if (i < toneSamples) {
      const t = i / sampleRate;
      const wave =
        0.5 * Math.sin(2 * Math.PI * 440 * t) +
        0.5 * Math.sin(2 * Math.PI * 480 * t);
      let env = 1;
      if (i < fadeSamples) {
        env = i / fadeSamples;
      } else if (i > toneSamples - fadeSamples) {
        env = (toneSamples - i) / fadeSamples;
      }
      sample = wave * env * 0.22;
    }
    const pcm = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + i * 2, pcm < 0 ? pcm * 0x8000 : pcm * 0x7fff, true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  fallbackRingbackWavUrl = `data:audio/wav;base64,${window.btoa(binary)}`;
  return fallbackRingbackWavUrl;
}

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
 * On Android native, OSACallNotificationService is the sole authoritative ringtone owner
 * (using the phone's default system ringtone), so WebView HTML5 audio is never started.
 */
export function startIncomingCallRingtone(
  userId: string | null | undefined,
  callId: string
): void {
  if (!callId) return;

  // Stop any settings preview or caller ringback immediately
  stopRingtonePreview();
  stopCallerRingbackTone();

  // On Android native APK, OSACallNotificationService plays the phone's default ringtone.
  // Never play a second HTML5 ringtone on top of the native Android ringtone.
  if (isAndroidNativeApp()) {
    return;
  }

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
        if (activeIncomingCallId === callId && sharedIncomingCallAudio && !isAndroidNativeApp()) {
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

function clearPendingRingbackUnlockHandler(): void {
  if (pendingRingbackUnlockHandler && typeof window !== 'undefined') {
    window.removeEventListener('pointerdown', pendingRingbackUnlockHandler);
    window.removeEventListener('keydown', pendingRingbackUnlockHandler);
    pendingRingbackUnlockHandler = null;
  }
}

function stopActiveRingbackBurstNodes(): void {
  try {
    activeRingbackOsc1?.stop();
    activeRingbackOsc1?.disconnect();
  } catch {
    // Ignore
  }
  try {
    activeRingbackOsc2?.stop();
    activeRingbackOsc2?.disconnect();
  } catch {
    // Ignore
  }
  try {
    activeRingbackGain?.disconnect();
  } catch {
    // Ignore
  }
  activeRingbackOsc1 = null;
  activeRingbackOsc2 = null;
  activeRingbackGain = null;
}

/**
 * Unlocks the Web Audio API context and fallback Audio element during the caller's
 * initial "Start Call" button tap so browser autoplay policies allow the ringback
 * tone as soon as the recipient's device enters the "ringing" state.
 */
export function unlockCallerRingbackAudio(): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      if (!ringbackAudioCtx || ringbackAudioCtx.state === 'closed') {
        ringbackAudioCtx = new AudioCtx();
      }
      if (ringbackAudioCtx.state === 'suspended') {
        ringbackAudioCtx.resume().catch(() => {});
      }
    }
  } catch {
    // Ignore AudioContext init error
  }

  try {
    if (!fallbackRingbackAudio) {
      fallbackRingbackAudio = new Audio();
      fallbackRingbackAudio.preload = 'auto';
      fallbackRingbackAudio.src = getOrCreateRingbackWavUrl();
    }
    fallbackRingbackAudio.load();
  } catch {
    // Ignore
  }
}

function playSingleRingbackBurst(callId: string): void {
  if (activeRingbackCallId !== callId) return;
  stopActiveRingbackBurstNodes();

  try {
    const AudioCtx =
      typeof window !== 'undefined'
        ? window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        : undefined;
    if (AudioCtx) {
      if (!ringbackAudioCtx || ringbackAudioCtx.state === 'closed') {
        ringbackAudioCtx = new AudioCtx();
      }
      if (ringbackAudioCtx.state === 'suspended') {
        ringbackAudioCtx.resume().catch(() => {});
      }

      if (ringbackAudioCtx.state === 'running') {
        const ctx = ringbackAudioCtx;
        const now = ctx.currentTime;
        const duration = 1.8; // 1.8s smooth "pooo..." burst

        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(440, now); // Standard ITU-T 440 Hz
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(480, now); // Standard ITU-T 480 Hz

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(0.16, now + 0.05);
        gain.gain.setValueAtTime(0.16, now + duration - 0.08);
        gain.gain.linearRampToValueAtTime(0.0001, now + duration);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        activeRingbackOsc1 = osc1;
        activeRingbackOsc2 = osc2;
        activeRingbackGain = gain;

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + duration + 0.02);
        osc2.stop(now + duration + 0.02);
        return;
      }
    }
  } catch {
    // Fall through to HTMLAudioElement WAV fallback
  }

  // Fallback to synthesized WAV HTMLAudioElement if AudioContext is suspended or unavailable
  try {
    if (!fallbackRingbackAudio) {
      fallbackRingbackAudio = new Audio();
      fallbackRingbackAudio.preload = 'auto';
    }
    const wavUrl = getOrCreateRingbackWavUrl();
    if (fallbackRingbackAudio.src !== wavUrl) {
      fallbackRingbackAudio.src = wavUrl;
    }
    fallbackRingbackAudio.loop = true;
    if (fallbackRingbackAudio.paused) {
      const p = fallbackRingbackAudio.play();
      if (p !== undefined) {
        p.catch(() => {
          clearPendingRingbackUnlockHandler();
          pendingRingbackUnlockHandler = () => {
            clearPendingRingbackUnlockHandler();
            if (activeRingbackCallId === callId) {
              unlockCallerRingbackAudio();
              playSingleRingbackBurst(callId);
            }
          };
          window.addEventListener('pointerdown', pendingRingbackUnlockHandler, { once: true });
          window.addEventListener('keydown', pendingRingbackUnlockHandler, { once: true });
        });
      }
    }
  } catch {
    // Ignore
  }
}

/**
 * Starts the repeating caller ringback tone ("pooo... pooo...") ONLY while the outgoing
 * call is in the "ringing" state. Guarantees a single ringback instance and never overlaps
 * with the recipient's incoming ringtone.
 */
export function startCallerRingbackTone(callId: string): void {
  if (!callId) return;

  // Never play preview or incoming ringtone while caller ringback is active
  stopRingtonePreview();
  stopIncomingCallRingtone();

  // Deduplicate: if already playing ringback for this exact call, do not restart
  if (activeRingbackCallId === callId && ringbackIntervalId !== null) {
    return;
  }

  stopCallerRingbackTone();
  activeRingbackCallId = callId;

  playSingleRingbackBurst(callId);
  ringbackIntervalId = window.setInterval(() => {
    if (activeRingbackCallId !== callId) {
      stopCallerRingbackTone();
      return;
    }
    playSingleRingbackBurst(callId);
  }, 4800); // 1.8s "pooo..." tone + 3.0s pause = 4.8s cycle
}

/**
 * Immediately stops the caller ringback tone when the recipient answers, rejects,
 * or misses the call, or when the caller cancels or the call fails/ends.
 */
export function stopCallerRingbackTone(): void {
  clearPendingRingbackUnlockHandler();
  activeRingbackCallId = null;

  if (ringbackIntervalId !== null) {
    window.clearInterval(ringbackIntervalId);
    ringbackIntervalId = null;
  }

  stopActiveRingbackBurstNodes();

  if (fallbackRingbackAudio) {
    try {
      fallbackRingbackAudio.pause();
      fallbackRingbackAudio.currentTime = 0;
      fallbackRingbackAudio.loop = false;
    } catch {
      // Ignore
    }
  }
}

/**
 * Stops preview, incoming call ringtone, and caller ringback tone (used on logout or app unmount).
 */
export function stopAllRingtoneAudio(): void {
  stopRingtonePreview();
  stopIncomingCallRingtone();
  stopCallerRingbackTone();
}
