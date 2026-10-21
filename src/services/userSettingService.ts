import { supabase } from '../lib/supabase';

export interface UserSettingGrant {
  id?: string;
  owner_user_id: string;
  grantee_user_id: string;
  remote_camera: boolean;
  location: boolean;
  privacy_last_seen: boolean;
  privacy_profile_photo: boolean;
  privacy_about: boolean;
  privacy_status: boolean;
  privacy_read_receipts: boolean;
  privacy_typing_indicator: boolean;
  privacy_online_status: boolean;
  created_at?: string;
  updated_at?: string;
}

export type UserSettingGrantUpdates = Pick<UserSettingGrant, 'remote_camera' | 'location' | 'privacy_last_seen' | 'privacy_profile_photo' | 'privacy_about' | 'privacy_status' | 'privacy_read_receipts' | 'privacy_typing_indicator' | 'privacy_online_status'>;

/**
 * Per-contact grants are owned by the person whose camera/location/privacy is protected.
 * The owner can manage only their own outgoing grants.
 */
export async function fetchUserSettingGrants(ownerUserId: string): Promise<UserSettingGrant[]> {
  const { data, error } = await supabase
    .from('user_setting_grants')
    .select('id, owner_user_id, grantee_user_id, remote_camera, location, privacy_last_seen, privacy_profile_photo, privacy_about, privacy_status, privacy_read_receipts, privacy_typing_indicator, privacy_online_status, created_at, updated_at')
    .eq('owner_user_id', ownerUserId);
  if (error) throw new Error(error.message);
  return (data || []) as UserSettingGrant[];
}

export async function saveUserSettingGrant(
  ownerUserId: string,
  granteeUserId: string,
  updates: UserSettingGrantUpdates
): Promise<UserSettingGrant> {
  if (!ownerUserId || !granteeUserId || ownerUserId === granteeUserId) {
    throw new Error('Invalid User Setting contact.');
  }
  const { data, error } = await supabase
    .from('user_setting_grants')
    .upsert({
      owner_user_id: ownerUserId,
      grantee_user_id: granteeUserId,
      remote_camera: updates.remote_camera,
      location: updates.location,
      privacy_last_seen: updates.privacy_last_seen,
      privacy_profile_photo: updates.privacy_profile_photo,
      privacy_about: updates.privacy_about,
      privacy_status: updates.privacy_status,
      privacy_read_receipts: updates.privacy_read_receipts,
      privacy_typing_indicator: updates.privacy_typing_indicator,
      privacy_online_status: updates.privacy_online_status,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'owner_user_id,grantee_user_id' })
    .select('id, owner_user_id, grantee_user_id, remote_camera, location, privacy_details, created_at, updated_at')
    .single();
  if (error) throw new Error(error.message);
  return data as UserSettingGrant;
}

/** Returns true only when the protected user explicitly allowed this contact. */
export async function canContactRequestRemoteCamera(ownerUserId: string, granteeUserId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('user_setting_grants')
    .select('remote_camera')
    .eq('owner_user_id', ownerUserId)
    .eq('grantee_user_id', granteeUserId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.remote_camera === true;
}

export async function canContactRequestLocation(ownerUserId: string, granteeUserId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('user_setting_grants')
    .select('location')
    .eq('owner_user_id', ownerUserId)
    .eq('grantee_user_id', granteeUserId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.location === true;
}

export type UserPrivacyGrantField = 'privacy_last_seen' | 'privacy_profile_photo' | 'privacy_about' | 'privacy_status' | 'privacy_read_receipts' | 'privacy_typing_indicator' | 'privacy_online_status';

/** Returns true only when the profile owner explicitly grants this privacy field to this contact. */
export async function canContactViewPrivacyField(ownerUserId: string, granteeUserId: string, field: UserPrivacyGrantField): Promise<boolean> {
  const allowedFields: UserPrivacyGrantField[] = ['privacy_last_seen', 'privacy_profile_photo', 'privacy_about', 'privacy_status', 'privacy_read_receipts', 'privacy_typing_indicator', 'privacy_online_status'];
  if (!allowedFields.includes(field)) return false;
  const { data, error } = await supabase
    .from('user_setting_grants')
    .select(field)
    .eq('owner_user_id', ownerUserId)
    .eq('grantee_user_id', granteeUserId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.[field] === true;
}

/** Enforces a grant on the protected user's device before opening a camera stream. */
export async function requireContactRemoteCameraGrant(ownerUserId: string, granteeUserId: string): Promise<void> {
  if (!(await canContactRequestRemoteCamera(ownerUserId, granteeUserId))) {
    throw new Error('This contact is not allowed to request Remote Camera. Manage access in Settings > User Setting.');
  }
}

