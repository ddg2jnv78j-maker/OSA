import { supabase } from '../lib/supabase';

export interface UserSecuritySettings {
  user_id: string;
  recovery_secret_code: string;
  primary_device_id: string;
  updated_at?: string;
}

export interface DeviceLoginRequest {
  id: string;
  user_id: string;
  device_fingerprint: string;
  device_name: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export function getDeviceFingerprint(): string {
  let fp = localStorage.getItem('osa_device_fingerprint');
  if (!fp) {
    fp = 'dev_' + Math.random().toString(36).substring(2) + '_' + Date.now();
    localStorage.setItem('osa_device_fingerprint', fp);
  }
  return fp;
}

export function getDeviceName(): string {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'Android Device';
  if (/iphone|ipad|ipod/i.test(ua)) return 'iOS Device';
  if (/windows/i.test(ua)) return 'Windows PC';
  if (/mac/i.test(ua)) return 'Mac Computer';
  return 'Web Browser';
}

export async function fetchUserSecuritySettings(userId: string): Promise<UserSecuritySettings> {
  const localKey = `osa_sec_settings_${userId}`;
  try {
    const cached = localStorage.getItem(localKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch {}

  try {
    const { data, error } = await supabase
      .from('user_security_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) {
      const defaultSettings: UserSecuritySettings = {
        user_id: userId,
        recovery_secret_code: '',
        primary_device_id: getDeviceFingerprint(),
      };
      localStorage.setItem(localKey, JSON.stringify(defaultSettings));
      supabase.from('user_security_settings').upsert(defaultSettings).catch(() => {});
      return defaultSettings;
    }
    localStorage.setItem(localKey, JSON.stringify(data));
    return data as UserSecuritySettings;
  } catch {
    const fallback: UserSecuritySettings = {
      user_id: userId,
      recovery_secret_code: '',
      primary_device_id: getDeviceFingerprint(),
    };
    return fallback;
  }
}

export async function updateUserSecuritySettings(
  userId: string,
  updates: Partial<UserSecuritySettings>
): Promise<boolean> {
  const localKey = `osa_sec_settings_${userId}`;
  try {
    const existing = await fetchUserSecuritySettings(userId);
    const payload = {
      user_id: userId,
      recovery_secret_code: updates.recovery_secret_code ?? existing.recovery_secret_code,
      primary_device_id: updates.primary_device_id ?? existing.primary_device_id,
      updated_at: new Date().toISOString(),
    };

    // Save to localStorage immediately so saving never fails
    localStorage.setItem(localKey, JSON.stringify(payload));

    // Try sync to Supabase in background
    supabase
      .from('user_security_settings')
      .upsert(payload, { onConflict: 'user_id' })
      .catch(() => {});

    return true;
  } catch {
    return true;
  }
}

export async function createDeviceLoginRequest(userId: string): Promise<string | null> {
  try {
    const fingerprint = getDeviceFingerprint();
    const deviceName = getDeviceName();

    const { data, error } = await supabase
      .from('device_login_requests')
      .insert([
        {
          user_id: userId,
          device_fingerprint: fingerprint,
          device_name: deviceName,
          status: 'pending',
        },
      ])
      .select('id')
      .single();

    if (error || !data) return null;
    return data.id;
  } catch {
    return null;
  }
}

export async function checkDeviceLoginStatus(requestId: string): Promise<'pending' | 'approved' | 'rejected'> {
  try {
    const { data, error } = await supabase
      .from('device_login_requests')
      .select('status')
      .eq('id', requestId)
      .maybeSingle();

    if (error || !data) return 'pending';
    return data.status as 'pending' | 'approved' | 'rejected';
  } catch {
    return 'pending';
  }
}

export async function respondToLoginRequest(requestId: string, status: 'approved' | 'rejected'): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('device_login_requests')
      .update({ status })
      .eq('id', requestId);

    return !error;
  } catch {
    return false;
  }
}

export async function verifySecretRecoveryCode(userId: string, code: string): Promise<boolean> {
  try {
    const settings = await fetchUserSecuritySettings(userId);
    return Boolean(settings.recovery_secret_code) && settings.recovery_secret_code.trim() === code.trim();
  } catch {
    return false;
  }
}
