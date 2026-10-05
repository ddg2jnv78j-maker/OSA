import { createClient, SupabaseClient } from '@supabase/supabase-js';

const STORAGE_URL_KEY = 'osa_supabase_url';
const STORAGE_ANON_KEY = 'osa_supabase_anon_key';

function sanitizeValue(val: string | undefined | null): string {
  if (!val) return '';
  // Strip surrounding whitespace and any accidental wrapping quotes
  const trimmed = val.trim().replace(/^["']+|["']+$/g, '').trim();
  if (
    !trimmed ||
    trimmed === 'https://your-project-id.supabase.co' ||
    trimmed === 'your-public-anon-key' ||
    trimmed === 'MY_SUPABASE_URL' ||
    trimmed === 'MY_SUPABASE_ANON_KEY' ||
    trimmed.includes('placeholder-unconfigured') ||
    trimmed.includes('your-project-id')
  ) {
    return '';
  }
  return trimmed;
}

export function normalizeSupabaseUrl(rawUrl: string | undefined | null): string {
  const cleaned = sanitizeValue(rawUrl);
  if (!cleaned) return '';
  const withProtocol =
    cleaned.startsWith('http://') || cleaned.startsWith('https://')
      ? cleaned
      : `https://${cleaned}`;
  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return '';
    }
    if (!parsed.hostname) {
      return '';
    }
    // Always return only the origin (https://<project-ref>.supabase.co)
    // Automatically strips /rest/v1, /auth/v1, /realtime/v1, /storage/v1, and any trailing slashes
    return parsed.origin;
  } catch {
    // Fallback regex strip for any API subpath or trailing slashes
    return withProtocol
      .replace(/\/(rest|auth|realtime|storage|functions)\/v1(\/.*)?$/i, '')
      .replace(/\/+$/, '');
  }
}

function isValidSupabaseUrl(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return (
      (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      Boolean(parsed.hostname) &&
      parsed.pathname === '/'
    );
  } catch {
    return false;
  }
}

function migrateStaleLocalStorageUrl(): string {
  if (typeof window === 'undefined') return '';
  try {
    const rawStored = window.localStorage.getItem(STORAGE_URL_KEY);
    if (!rawStored) return '';
    const normalized = normalizeSupabaseUrl(rawStored);
    if (!normalized || !isValidSupabaseUrl(normalized)) {
      window.localStorage.removeItem(STORAGE_URL_KEY);
      return '';
    }
    if (rawStored !== normalized) {
      window.localStorage.setItem(STORAGE_URL_KEY, normalized);
    }
    return normalized;
  } catch {
    return '';
  }
}

export function getSupabaseConfig(): {
  url: string;
  anonKey: string;
  isConfigured: boolean;
  source: 'env' | 'runtime' | 'unconfigured';
} {
  // 1. Safely migrate and check runtime credentials in localStorage
  if (typeof window !== 'undefined') {
    const storedUrl = migrateStaleLocalStorageUrl();
    const storedKey = sanitizeValue(window.localStorage.getItem(STORAGE_ANON_KEY));
    if (isValidSupabaseUrl(storedUrl) && storedKey.length >= 20) {
      return { url: storedUrl, anonKey: storedKey, isConfigured: true, source: 'runtime' };
    }
  }

  // 2. Check Vite environment variables (.env) — normalized to pure origin
  const envUrl = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL);
  const envAnonKey = sanitizeValue(import.meta.env.VITE_SUPABASE_ANON_KEY);

  if (isValidSupabaseUrl(envUrl) && envAnonKey.length >= 20) {
    return { url: envUrl, anonKey: envAnonKey, isConfigured: true, source: 'env' };
  }

  return {
    url: 'https://placeholder-unconfigured.supabase.co',
    anonKey: 'placeholder-anon-key',
    isConfigured: false,
    source: 'unconfigured',
  };
}

let supabaseInstance: SupabaseClient | null = null;
let currentUrl = '';
let currentKey = '';

export function getSupabaseClient(): SupabaseClient {
  const { url, anonKey } = getSupabaseConfig();
  const originUrl = normalizeSupabaseUrl(url) || 'https://placeholder-unconfigured.supabase.co';
  if (!supabaseInstance || currentUrl !== originUrl || currentKey !== anonKey) {
    currentUrl = originUrl;
    currentKey = anonKey;
    supabaseInstance = createClient(originUrl, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'osa-auth-token',
      },
      global: {
        fetch: (...args) => window.fetch(...args),
      },
      realtime: {
        params: {
          eventsPerSecond: 20,
        },
      },
    });
  }
  return supabaseInstance;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getSupabaseClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

export function saveRuntimeSupabaseConfig(url: string, anonKey: string): void {
  const cleanUrl = normalizeSupabaseUrl(url);
  const cleanKey = sanitizeValue(anonKey);
  window.localStorage.setItem(STORAGE_URL_KEY, cleanUrl);
  window.localStorage.setItem(STORAGE_ANON_KEY, cleanKey);
  supabaseInstance = null;
}

export function clearRuntimeSupabaseConfig(): void {
  window.localStorage.removeItem(STORAGE_URL_KEY);
  window.localStorage.removeItem(STORAGE_ANON_KEY);
  supabaseInstance = null;
}

export function getIceServers(): RTCIceServer[] {
  const stunEnv =
    (import.meta.env.VITE_WEBRTC_STUN_URLS as string | undefined) ||
    'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302';
  const stunUrls = stunEnv
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^stuns?:/i.test(s));

  const iceServers: RTCIceServer[] = [
    {
      urls:
        stunUrls.length > 0
          ? stunUrls
          : ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'],
    },
  ];

  const turnUrl = (import.meta.env.VITE_WEBRTC_TURN_URL as string | undefined)?.trim();
  const turnUsername = (import.meta.env.VITE_WEBRTC_TURN_USERNAME as string | undefined)?.trim();
  const turnCredential = (
    import.meta.env.VITE_WEBRTC_TURN_CREDENTIAL as string | undefined
  )?.trim();

  if (turnUrl && /^turns?:/i.test(turnUrl)) {
    const turnServer: RTCIceServer = { urls: turnUrl };
    if (turnUsername) turnServer.username = turnUsername;
    if (turnCredential) turnServer.credential = turnCredential;
    iceServers.push(turnServer);
  }

  return iceServers;
}
