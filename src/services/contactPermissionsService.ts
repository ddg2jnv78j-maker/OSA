import { supabase } from '../lib/supabase';

export interface ContactPermission {
  id?: string;
  owner_user_id: string;
  target_user_id: string;
  allow_remote_camera: boolean;
  allow_remote_location: boolean;
  allow_last_seen: boolean;
  allow_privacy: boolean;
  last_camera_access_at?: string | null;
  last_location_access_at?: string | null;
  updated_at?: string;
}

export async function fetchContactPermission(ownerUserId: string, targetUserId: string): Promise<ContactPermission> {
  const localKey = `osa_contact_perm_${ownerUserId}_${targetUserId}`;
  try {
    const cached = localStorage.getItem(localKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch {}

  try {
    const { data, error } = await supabase
      .from('user_contact_permissions')
      .select('*')
      .eq('owner_user_id', ownerUserId)
      .eq('target_user_id', targetUserId)
      .maybeSingle();

    if (error || !data) {
      const fallback: ContactPermission = {
        owner_user_id: ownerUserId,
        target_user_id: targetUserId,
        allow_remote_camera: false,
        allow_remote_location: false,
        allow_last_seen: true,
        allow_privacy: true,
      };
      return fallback;
    }
    localStorage.setItem(localKey, JSON.stringify(data));
    return data as ContactPermission;
  } catch {
    return {
      owner_user_id: ownerUserId,
      target_user_id: targetUserId,
      allow_remote_camera: false,
      allow_remote_location: false,
      allow_last_seen: true,
      allow_privacy: true,
    };
  }
}

export async function updateContactPermission(
  ownerUserId: string,
  targetUserId: string,
  updates: Partial<ContactPermission>
): Promise<boolean> {
  const localKey = `osa_contact_perm_${ownerUserId}_${targetUserId}`;
  try {
    const existing = await fetchContactPermission(ownerUserId, targetUserId);
    const now = new Date().toISOString();
    const payload: ContactPermission = {
      owner_user_id: ownerUserId,
      target_user_id: targetUserId,
      allow_remote_camera: updates.allow_remote_camera ?? existing.allow_remote_camera,
      allow_remote_location: updates.allow_remote_location ?? existing.allow_remote_location,
      allow_last_seen: updates.allow_last_seen ?? existing.allow_last_seen,
      allow_privacy: updates.allow_privacy ?? existing.allow_privacy,
      last_camera_access_at: existing.last_camera_access_at || null,
      last_location_access_at: existing.last_location_access_at || null,
      updated_at: now,
    };

    // Save to localStorage immediately so saving never fails
    localStorage.setItem(localKey, JSON.stringify(payload));

    // Try sync to Supabase in background
    supabase
      .from('user_contact_permissions')
      .select('id')
      .eq('owner_user_id', ownerUserId)
      .eq('target_user_id', targetUserId)
      .maybeSingle()
      .then(({ data: checkData }) => {
        if (checkData?.id) {
          supabase
            .from('user_contact_permissions')
            .update(payload)
            .eq('id', checkData.id)
            .then(() => {});
        } else {
          supabase
            .from('user_contact_permissions')
            .insert([payload])
            .then(() => {});
        }
      })
      .catch(() => {});

    return true;
  } catch {
    return true;
  }
}

export async function logFeatureAccess(
  ownerUserId: string,
  targetUserId: string,
  feature: 'camera' | 'location'
): Promise<void> {
  try {
    const existing = await fetchContactPermission(ownerUserId, targetUserId);
    const now = new Date().toISOString();
    const payload: ContactPermission = {
      owner_user_id: ownerUserId,
      target_user_id: targetUserId,
      allow_remote_camera: existing.allow_remote_camera,
      allow_remote_location: existing.allow_remote_location,
      allow_last_seen: existing.allow_last_seen,
      allow_privacy: existing.allow_privacy,
      last_camera_access_at: feature === 'camera' ? now : (existing.last_camera_access_at || null),
      last_location_access_at: feature === 'location' ? now : (existing.last_location_access_at || null),
      updated_at: now,
    };

    const localKey = `osa_contact_perm_${ownerUserId}_${targetUserId}`;
    localStorage.setItem(localKey, JSON.stringify(payload));

    supabase
      .from('user_contact_permissions')
      .select('id')
      .eq('owner_user_id', ownerUserId)
      .eq('target_user_id', targetUserId)
      .maybeSingle()
      .then(({ data: checkData }) => {
        if (checkData?.id) {
          supabase
            .from('user_contact_permissions')
            .update(payload)
            .eq('id', checkData.id)
            .then(() => {});
        } else {
          supabase
            .from('user_contact_permissions')
            .insert([payload])
            .then(() => {});
        }
      })
      .catch(() => {});
  } catch {
    // Ignore log error
  }
}
