import { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseConfig, supabase } from '../lib/supabase';
import { TranslationDictionary } from '../lib/i18n';
import { LanguageCode, Profile } from '../types/osa';

export interface PresenceSessionPayload {
  user_id: string;
  session_id: string;
  is_active: boolean;
  visibility: DocumentVisibilityState;
  last_active_at: string;
}

/**
 * Maximum age of a heartbeat or presence update before a user is considered offline.
 * Heartbeats are sent every 20 seconds while OSA is open, visible, and connected.
 */
export const PRESENCE_STALE_THRESHOLD_MS = 42_000;
export const HEARTBEAT_INTERVAL_MS = 20_000;

const SESSION_STORAGE_KEY = 'osa_presence_session_id';

export function getOrCreatePresenceSessionId(): string {
  try {
    let existing = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!existing) {
      existing =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(SESSION_STORAGE_KEY, existing);
    }
    return existing;
  } catch {
    return `sess_${Date.now()}`;
  }
}

// Track live Supabase Realtime Presence state across all connected OSA sessions
const realtimeActiveUsers = new Map<string, number>(); // userId -> latest active timestamp ms
const presenceListeners = new Set<() => void>();

export function subscribeToPresenceUpdates(listener: () => void): () => void {
  presenceListeners.add(listener);
  return () => {
    presenceListeners.delete(listener);
  };
}

function notifyPresenceListeners(): void {
  presenceListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Ignore listener errors
    }
  });
}

export function markUserRealtimeActive(userId: string, activeAtMs: number = Date.now()): void {
  if (!userId) return;
  realtimeActiveUsers.set(userId, activeAtMs);
  notifyPresenceListeners();
}

export function markUserRealtimeInactive(userId: string): void {
  if (!userId) return;
  realtimeActiveUsers.delete(userId);
  notifyPresenceListeners();
}

/**
 * Strictly determines whether a profile is genuinely Online right now.
 * A user is Online ONLY when:
 * 1. The local device is connected to the internet (navigator.onLine)
 * 2. Either:
 *    a) Supabase Realtime Presence has an active, visible session for this user within the threshold, OR
 *    b) The profile's `is_online` is true AND its latest heartbeat/last_seen_at timestamp is fresh (within threshold).
 * Internet connection alone or a stale `is_online = true` row in the database NEVER shows Online.
 */
export function isProfileTrulyOnline(
  profile?: Partial<Profile> | null,
  nowMs: number = Date.now()
): boolean {
  if (!profile || !profile.id) return false;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return false;
  }

  // 1. Check live Supabase Realtime Presence map first
  const realtimeSeenAt = realtimeActiveUsers.get(profile.id);
  if (realtimeSeenAt && nowMs - realtimeSeenAt <= PRESENCE_STALE_THRESHOLD_MS) {
    return true;
  }

  // 2. If profile explicitly says offline, they are offline
  if (!profile.is_online) {
    return false;
  }

  // 3. Verify freshness of the profile's last heartbeat / last_seen_at / updated_at
  const candidateTimestamp =
    profile.last_heartbeat_at || profile.last_seen_at || profile.last_seen || profile.updated_at;

  if (!candidateTimestamp) {
    return false;
  }

  const parsedMs = new Date(candidateTimestamp).getTime();
  if (Number.isNaN(parsedMs)) {
    return false;
  }

  return nowMs - parsedMs <= PRESENCE_STALE_THRESHOLD_MS;
}

/**
 * Returns the most accurate Last Seen ISO timestamp from a Profile.
 */
export function getProfileLastSeenIso(profile?: Partial<Profile> | null): string | null {
  if (!profile) return null;
  return (
    profile.last_seen_at ||
    profile.last_seen ||
    profile.last_heartbeat_at ||
    profile.updated_at ||
    null
  );
}

/**
 * Formats a user's Last Seen timestamp in the viewer's local timezone:
 * - Same day: "Last seen today at 2:45 PM"
 * - Yesterday: "Last seen yesterday at 11:20 PM"
 * - Older dates: "Last seen 07 Oct 2026 at 6:15 PM"
 */
export function formatLastSeenText(
  lastSeenIso: string | null | undefined,
  t: TranslationDictionary,
  language: LanguageCode = 'en'
): string {
  if (!lastSeenIso) return t.offline;
  const date = new Date(lastSeenIso);
  if (Number.isNaN(date.getTime())) return t.offline;

  const now = new Date();
  const isSameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  const locale = language === 'bn' ? 'bn-BD' : 'en-US';
  const timeStr = date.toLocaleTimeString(locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  if (isSameDay) {
    return `${t.lastSeenTodayAt} ${timeStr}`;
  }

  if (isYesterday) {
    return `${t.lastSeenYesterdayAt} ${timeStr}`;
  }

  const day = String(date.getDate()).padStart(2, '0');
  const month = date.toLocaleDateString(locale, { month: 'short' });
  const year = date.getFullYear();

  if (language === 'bn') {
    return `${t.lastSeenOn} ${day} ${month} ${year}, ${timeStr}`;
  }
  return `${t.lastSeenOn} ${day} ${month} ${year} at ${timeStr}`;
}

/**
 * Formats a date header for Daily Call History and Chat timelines:
 * - "Today"
 * - "Yesterday"
 * - "07 Oct 2026"
 */
export function formatDailyDateHeader(
  isoDate: string,
  t: TranslationDictionary,
  language: LanguageCode = 'en'
): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const isSameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isSameDay) return t.today;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  if (isYesterday) return t.yesterday;

  const locale = language === 'bn' ? 'bn-BD' : 'en-GB';
  const day = String(date.getDate()).padStart(2, '0');
  const month = date.toLocaleDateString(locale, { month: 'short' });
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

/**
 * Synchronizes the current session's active/offline status with Supabase.
 * Uses the `sync_user_presence` RPC if installed, and always falls back to updating `profiles`.
 */
export async function syncServerPresence(
  userId: string,
  isActive: boolean,
  sessionId: string = getOrCreatePresenceSessionId()
): Promise<void> {
  if (!userId) return;
  const nowIso = new Date().toISOString();

  if (isActive) {
    markUserRealtimeActive(userId, Date.now());
  }

  try {
    const { data, error } = await supabase.rpc('sync_user_presence', {
      p_session_id: sessionId,
      p_is_active: isActive,
      p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 250) : null,
    });

    if (!error && data) {
      const result = data as { is_online?: boolean };
      if (result.is_online === false) {
        markUserRealtimeInactive(userId);
      }
      return;
    }
  } catch {
    // Fallback if RPC migration has not been run yet
  }

  // Fallback direct profile update
  try {
    await supabase
      .from('profiles')
      .update({
        is_online: isActive,
        last_seen: nowIso,
        last_seen_at: nowIso,
        ...(isActive ? { last_heartbeat_at: nowIso } : {}),
        updated_at: nowIso,
      })
      .eq('id', userId);
  } catch {
    // If last_seen_at / last_heartbeat_at columns are not yet applied in DB, update standard columns
    try {
      await supabase
        .from('profiles')
        .update({
          is_online: isActive,
          last_seen: nowIso,
          updated_at: nowIso,
        })
        .eq('id', userId);
    } catch {
      // Ignore network disconnect error
    }
  }

  if (!isActive) {
    markUserRealtimeInactive(userId);
  }
}

/**
 * Fires a keepalive HTTP request during tab close / pagehide / beforeunload
 * so the server immediately marks the session inactive and stamps `last_seen_at`
 * even as the browser tab or PWA window is closing.
 */
export function sendKeepaliveOfflineSignal(
  userId: string,
  accessToken: string | null | undefined,
  sessionId: string = getOrCreatePresenceSessionId()
): void {
  if (!userId || !accessToken || typeof fetch === 'undefined') return;
  const { url: supabaseUrl, anonKey: supabaseAnonKey } = getSupabaseConfig();
  if (!supabaseUrl || !supabaseAnonKey) return;
  const nowIso = new Date().toISOString();

  try {
    // 1. Call sync_user_presence RPC with keepalive
    fetch(`${supabaseUrl}/rest/v1/rpc/sync_user_presence`, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        p_session_id: sessionId,
        p_is_active: false,
      }),
    }).catch(() => {
      // Fallback: patch profiles directly with keepalive
      fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${accessToken}`,
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          is_online: false,
          last_seen: nowIso,
        }),
      }).catch(() => {});
    });
  } catch {
    // Ignore errors during page unload
  }
}

/**
 * Manages the lifecycle of the current authenticated user's OSA presence:
 * - Supabase Realtime Presence channel (`osa-global-presence`) with multi-device session support
 * - Visibility (`visibilitychange`), window focus/blur, network (`online`/`offline`), and unload (`pagehide`/`beforeunload`)
 * - Periodic 20s heartbeat ONLY while OSA is open, visible, and online
 */
export class PresenceManager {
  private userId: string;
  private sessionId: string;
  private channel: RealtimeChannel | null = null;
  private heartbeatTimer: number | null = null;
  private staleSweepTimer: number | null = null;
  private accessToken: string | null = null;
  private isDestroyed = false;
  private onPeerPresenceCallback?: (userId: string, isOnline: boolean, lastSeenIso: string) => void;

  constructor(
    userId: string,
    onPeerPresenceCallback?: (userId: string, isOnline: boolean, lastSeenIso: string) => void
  ) {
    this.userId = userId;
    this.sessionId = getOrCreatePresenceSessionId();
    this.onPeerPresenceCallback = onPeerPresenceCallback;
  }

  public isCurrentlyActiveAndVisible(): boolean {
    if (typeof document === 'undefined' || typeof navigator === 'undefined') return false;
    return document.visibilityState === 'visible' && navigator.onLine;
  }

  public async start(): Promise<void> {
    if (this.isDestroyed) return;

    const { data: sessionData } = await supabase.auth.getSession();
    this.accessToken = sessionData.session?.access_token || null;

    // Subscribe to global Realtime Presence channel
    const presenceKey = `${this.userId}:${this.sessionId}`;
    this.channel = supabase.channel('osa-global-presence', {
      config: {
        presence: {
          key: presenceKey,
        },
      },
    });

    this.channel
      .on('presence', { event: 'sync' }, () => {
        this.syncFromRealtimePresenceState();
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        const nowMs = Date.now();
        for (const p of (newPresences || []) as unknown as PresenceSessionPayload[]) {
          if (p?.user_id && p.is_active && p.visibility === 'visible') {
            markUserRealtimeActive(p.user_id, nowMs);
            this.onPeerPresenceCallback?.(
              p.user_id,
              true,
              p.last_active_at || new Date(nowMs).toISOString()
            );
          }
        }
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        this.syncFromRealtimePresenceState();
        const nowIso = new Date().toISOString();
        for (const p of (leftPresences || []) as unknown as PresenceSessionPayload[]) {
          if (p?.user_id && !realtimeActiveUsers.has(p.user_id)) {
            this.onPeerPresenceCallback?.(p.user_id, false, nowIso);
          }
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && !this.isDestroyed) {
          await this.publishCurrentState();
        }
      });

    // Initial state sync
    await this.publishCurrentState();

    // Heartbeat every 20s ONLY while OSA is open, visible, and connected
    this.heartbeatTimer = window.setInterval(() => {
      if (this.isDestroyed) return;
      if (this.isCurrentlyActiveAndVisible()) {
        this.publishCurrentState();
      }
    }, HEARTBEAT_INTERVAL_MS);

    // Local sweep every 10s to force UI re-evaluation if any peer's heartbeat expires
    this.staleSweepTimer = window.setInterval(() => {
      if (this.isDestroyed) return;
      const nowMs = Date.now();
      let changed = false;
      for (const [uid, lastMs] of realtimeActiveUsers.entries()) {
        if (nowMs - lastMs > PRESENCE_STALE_THRESHOLD_MS) {
          realtimeActiveUsers.delete(uid);
          changed = true;
        }
      }
      if (changed) {
        notifyPresenceListeners();
      }
    }, 10_000);

    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('focus', this.handleWindowFocus);
    window.addEventListener('online', this.handleNetworkOnline);
    window.addEventListener('offline', this.handleNetworkOffline);
    window.addEventListener('pagehide', this.handlePageUnload);
    window.addEventListener('beforeunload', this.handlePageUnload);
  }

  private syncFromRealtimePresenceState(): void {
    if (!this.channel) return;
    const state = this.channel.presenceState<PresenceSessionPayload>();
    const activeByUser = new Map<string, number>();
    const nowMs = Date.now();

    Object.values(state).forEach((presences) => {
      (presences || []).forEach((p) => {
        if (p?.user_id && p.is_active && p.visibility === 'visible') {
          const ts = p.last_active_at ? new Date(p.last_active_at).getTime() : nowMs;
          const validTs = Number.isNaN(ts) ? nowMs : Math.min(nowMs, ts);
          const prev = activeByUser.get(p.user_id) || 0;
          if (validTs > prev) {
            activeByUser.set(p.user_id, validTs);
          }
        }
      });
    });

    realtimeActiveUsers.clear();
    for (const [uid, ts] of activeByUser.entries()) {
      realtimeActiveUsers.set(uid, ts);
    }
    notifyPresenceListeners();
  }

  public async publishCurrentState(): Promise<void> {
    if (this.isDestroyed) return;
    const isActive = this.isCurrentlyActiveAndVisible();
    const nowIso = new Date().toISOString();

    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session?.access_token) {
      this.accessToken = sessionData.session.access_token;
    }

    if (this.channel) {
      try {
        if (isActive) {
          await this.channel.track({
            user_id: this.userId,
            session_id: this.sessionId,
            is_active: true,
            visibility: document.visibilityState,
            last_active_at: nowIso,
          });
        } else {
          await this.channel.untrack();
        }
      } catch {
        // Ignore channel track error when offline
      }
    }

    await syncServerPresence(this.userId, isActive, this.sessionId);
  }

  private handleVisibilityChange = (): void => {
    if (this.isDestroyed) return;
    if (document.visibilityState === 'hidden') {
      // Immediately untrack and mark session inactive when user switches away or minimizes OSA
      if (this.channel) {
        this.channel.untrack().catch(() => {});
      }
      syncServerPresence(this.userId, false, this.sessionId);
    } else if (document.visibilityState === 'visible') {
      this.publishCurrentState();
    }
  };

  private handleWindowFocus = (): void => {
    if (this.isDestroyed) return;
    if (document.visibilityState === 'visible' && navigator.onLine) {
      this.publishCurrentState();
    }
  };

  private handleNetworkOnline = (): void => {
    if (this.isDestroyed) return;
    this.publishCurrentState();
  };

  private handleNetworkOffline = (): void => {
    if (this.isDestroyed) return;
    markUserRealtimeInactive(this.userId);
    notifyPresenceListeners();
  };

  private handlePageUnload = (): void => {
    if (this.isDestroyed) return;
    if (this.channel) {
      try {
        this.channel.untrack();
      } catch {
        // Ignore
      }
    }
    sendKeepaliveOfflineSignal(this.userId, this.accessToken, this.sessionId);
  };

  public async stopAndMarkOffline(): Promise<void> {
    this.isDestroyed = true;
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('focus', this.handleWindowFocus);
    window.removeEventListener('online', this.handleNetworkOnline);
    window.removeEventListener('offline', this.handleNetworkOffline);
    window.removeEventListener('pagehide', this.handlePageUnload);
    window.removeEventListener('beforeunload', this.handlePageUnload);

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.staleSweepTimer) {
      clearInterval(this.staleSweepTimer);
      this.staleSweepTimer = null;
    }

    if (this.channel) {
      try {
        await this.channel.untrack();
      } catch {
        // Ignore
      }
      supabase.removeChannel(this.channel);
      this.channel = null;
    }

    await syncServerPresence(this.userId, false, this.sessionId);
  }
}
