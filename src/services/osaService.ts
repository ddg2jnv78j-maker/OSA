import { supabase, getSupabaseConfig } from '../lib/supabase';
import { syncServerPresence } from './presenceService';
import { dispatchWebPushNotification } from './pushNotificationService';
import { queueOfflineMessage } from './offlineMessagingService';
import {
  BlockRecord,
  CallRecord,
  CallStatus,
  CallType,
  Chat,
  ChatMember,
  Group,
  GroupMember,
  LanguageCode,
  Message,
  MessageAttachment,
  NotificationItem,
  PrivacySettings,
  Profile,
  ReportReason,
  ReportRecord,
  StatusItem,
  SupportTicket,
  ThemeMode,
  AffiliateMerchant,
  AffiliateProduct,
  ClickTrackingResult,
} from '../types/osa';

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function classifyFileType(mimeType: string, fileName: string): 'image' | 'video' | 'audio' | 'document' {
  const lower = mimeType.toLowerCase();
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (lower.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
  if (lower.startsWith('video/') || ['mp4', 'webm', 'mov', 'mkv'].includes(ext)) return 'video';
  if (lower.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'aac'].includes(ext)) return 'audio';
  return 'document';
}

// ============================================================================
// 1. AUTHENTICATION & ACCOUNT
// ============================================================================

export const OSA_PRODUCTION_SITE_URL = 'https://osa-chat.com/';
export const OSA_LOGIN_REDIRECT_URL = 'https://osa-chat.com/';
export const OSA_EMAIL_VERIFICATION_REDIRECT_URL = 'https://osa-chat.com/?type=signup';
export const OSA_PASSWORD_RESET_REDIRECT_URL = 'https://osa-chat.com/?type=recovery';

const ALLOWED_AUTH_REDIRECT_HOSTS = new Set(['osa-chat.com', 'www.osa-chat.com']);
const ALLOWED_AUTH_REDIRECT_PATHS = new Set([
  '/',
  '/login',
  '/verify-email',
  '/reset-password',
  '/auth/callback',
]);

let emailVerificationInProgress = false;

export function isEmailVerificationInProgress(): boolean {
  return emailVerificationInProgress;
}

export function setEmailVerificationInProgress(active: boolean): void {
  emailVerificationInProgress = active;
}

export function resolveSafeAuthRedirectUrl(
  candidateUrl?: string | null,
  fallbackUrl: string = OSA_PRODUCTION_SITE_URL
): string {
  const safeFallback = ALLOWED_AUTH_REDIRECT_HOSTS.has(
    (() => {
      try {
        return new URL(fallbackUrl).hostname.toLowerCase();
      } catch {
        return '';
      }
    })()
  )
    ? fallbackUrl
    : OSA_PRODUCTION_SITE_URL;

  if (!candidateUrl || typeof candidateUrl !== 'string') {
    return safeFallback;
  }

  const trimmed = candidateUrl.trim();
  if (
    !trimmed ||
    trimmed.startsWith('//') ||
    /^(javascript|data|vbscript|file|blob):/i.test(trimmed)
  ) {
    return safeFallback;
  }

  try {
    const parsed = trimmed.startsWith('/')
      ? new URL(trimmed, OSA_PRODUCTION_SITE_URL)
      : new URL(trimmed);

    if (parsed.protocol !== 'https:') {
      return safeFallback;
    }
    if (parsed.username || parsed.password) {
      return safeFallback;
    }

    const host = parsed.hostname.toLowerCase();
    if (!ALLOWED_AUTH_REDIRECT_HOSTS.has(host)) {
      return safeFallback;
    }

    const normalizedPath = parsed.pathname.replace(/\/+$/, '') || '/';
    if (!ALLOWED_AUTH_REDIRECT_PATHS.has(normalizedPath)) {
      return safeFallback;
    }

    const safeSearch = new URLSearchParams();
    const typeParam = parsed.searchParams.get('type');
    if (typeParam === 'signup' || typeParam === 'recovery') {
      safeSearch.set('type', typeParam);
    }
    const queryStr = safeSearch.toString();
    return `https://osa-chat.com${normalizedPath}${queryStr ? `?${queryStr}` : ''}`;
  } catch {
    return safeFallback;
  }
}

export function describeSupabaseError(
  err: unknown,
  fallbackMessage: string,
  context: 'general' | 'login' | 'register' | 'verify' | 'recovery' = 'general'
): string {
  const rawMessage = err instanceof Error ? err.message : String(err || '');
  const lower = rawMessage.toLowerCase();
  if (
    lower.includes('load failed') ||
    lower.includes('failed to fetch') ||
    lower.includes('networkerror')
  ) {
    return 'Network connection to OSA Chat failed. Please check your internet connection and try again.';
  }
  if (
    lower.includes('email not confirmed') ||
    lower.includes('email_not_confirmed')
  ) {
    return 'Your email address has not been verified yet. Please check your inbox for the OSA Chat verification email or enter your verification code.';
  }
  if (
    lower.includes('rate limit') ||
    lower.includes('over_email_send_rate_limit') ||
    lower.includes('for security purposes, you can only request this')
  ) {
    if (context === 'verify' || context === 'register') {
      return 'Email rate limit reached on Supabase Auth. Please wait a few minutes before requesting another verification email, or check your inbox/spam folder.';
    }
    return 'Email rate limit reached on Supabase Auth. Please wait a few minutes before requesting another password reset email, or check your inbox/spam folder for the recent reset link.';
  }
  if (
    lower.includes('otp_expired') ||
    lower.includes('link is invalid or has expired') ||
    lower.includes('token has expired') ||
    lower.includes('token is invalid') ||
    lower.includes('auth session missing')
  ) {
    if (context === 'verify') {
      return 'This verification code or confirmation link is invalid or has expired. Please request a new verification email and try again.';
    }
    return 'This password reset link is invalid or has expired. Please request a new password reset email.';
  }
  return rawMessage || fallbackMessage;
}

export async function signInWithEmail(email: string, password: string) {
  const cleanEmail = email.trim();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: cleanEmail,
    password,
  });
  if (error) {
    throw new Error(describeSupabaseError(error, 'Invalid login credentials.', 'login'));
  }
  if (!data.user || !data.session) {
    throw new Error('Unable to establish an authenticated session. Please try again.');
  }
  const confirmedAt =
    data.user.email_confirmed_at ||
    (data.user as { confirmed_at?: string | null }).confirmed_at;
  if (!confirmedAt) {
    await supabase.auth.signOut().catch(() => {});
    throw new Error(
      'Your email address has not been verified yet. Please check your inbox for the OSA Chat verification email or enter your verification code.'
    );
  }
  try {
    await ensureProfileAndPrivacy(
      data.user.id,
      data.user.email || cleanEmail,
      data.user.user_metadata?.full_name
    );
    await setUserOnlineStatus(data.user.id, true);
  } catch {
    // Profile trigger in schema.sql handles initial creation; loadAuthenticatedUser also syncs
  }
  return data;
}

export async function signUpWithEmail(fullName: string, email: string, password: string) {
  const cleanName = fullName.trim();
  const cleanEmail = email.trim();
  const redirectTo = resolveSafeAuthRedirectUrl(
    OSA_EMAIL_VERIFICATION_REDIRECT_URL,
    OSA_PRODUCTION_SITE_URL
  );
  const { data, error } = await supabase.auth.signUp({
    email: cleanEmail,
    password,
    options: {
      emailRedirectTo: redirectTo,
      data: {
        full_name: cleanName,
      },
    },
  });
  if (error) {
    throw new Error(describeSupabaseError(error, 'Registration failed.', 'register'));
  }
  if (!data.user) {
    throw new Error('Registration could not be completed. Please try again.');
  }
  // When Confirm Email is enabled in Supabase Auth, signing up with an already-confirmed email
  // returns an obfuscated user object with an empty identities array.
  if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    throw new Error(
      'An OSA Chat account with this email address already exists. Please sign in or reset your password.'
    );
  }

  if (data.user && data.session) {
    try {
      await ensureProfileAndPrivacy(data.user.id, cleanEmail, cleanName);
    } catch {
      // Handled by on_auth_user_created database trigger & loadAuthenticatedUser
    }
  }
  return data;
}

export async function verifyEmailOtpCode(
  email: string,
  token: string
): Promise<{ verified: true; email: string }> {
  const cleanEmail = email.trim();
  const cleanToken = token.replace(/\s+/g, '').trim();
  if (!cleanEmail) {
    throw new Error('Please enter the email address you registered with.');
  }
  if (!cleanToken || cleanToken.length < 6) {
    throw new Error('Please enter a valid 6-digit verification code.');
  }

  emailVerificationInProgress = true;
  try {
    const { data, error } = await supabase.auth.verifyOtp({
      email: cleanEmail,
      token: cleanToken,
      type: 'signup',
    });

    if (error || !data?.user) {
      throw new Error(
        describeSupabaseError(
          error,
          'Invalid or expired verification code. Please check the code and try again.',
          'verify'
        )
      );
    }

    const confirmedAt =
      data.user.email_confirmed_at ||
      (data.user as { confirmed_at?: string | null }).confirmed_at;
    if (!confirmedAt && !data.session) {
      throw new Error(
        'Email verification could not be confirmed. Please request a new verification code and try again.'
      );
    }

    try {
      await ensureProfileAndPrivacy(
        data.user.id,
        data.user.email || cleanEmail,
        data.user.user_metadata?.full_name
      );
    } catch {
      // Trigger in schema.sql also creates profile on auth.users confirmation
    }

    // Sign out the temporary verification session so the user is cleanly directed to the Login page
    await supabase.auth.signOut().catch(() => {});

    return {
      verified: true,
      email: data.user.email || cleanEmail,
    };
  } finally {
    emailVerificationInProgress = false;
  }
}

export async function resendVerificationEmail(email: string): Promise<void> {
  const cleanEmail = email.trim();
  if (!cleanEmail) {
    throw new Error('Please enter your registered email address.');
  }
  const redirectTo = resolveSafeAuthRedirectUrl(
    OSA_EMAIL_VERIFICATION_REDIRECT_URL,
    OSA_PRODUCTION_SITE_URL
  );
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: cleanEmail,
    options: {
      emailRedirectTo: redirectTo,
    },
  });
  if (error) {
    throw new Error(
      describeSupabaseError(error, 'Failed to resend verification email.', 'verify')
    );
  }
}

export async function sendPasswordResetEmail(email: string) {
  const cleanEmail = email.trim();
  const redirectTo = resolveSafeAuthRedirectUrl(
    OSA_PASSWORD_RESET_REDIRECT_URL,
    OSA_PRODUCTION_SITE_URL
  );
  const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
    redirectTo,
  });
  if (error) {
    throw new Error(
      describeSupabaseError(error, 'Failed to send password reset email.', 'recovery')
    );
  }
}

export async function updateUserPassword(newPassword: string) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) {
    throw new Error(
      'This password reset link is invalid or has expired. Please request a new password reset email.'
    );
  }
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    throw new Error(describeSupabaseError(error, 'Failed to update password.', 'recovery'));
  }
}

export async function updateUserEmail(newEmail: string, userId: string) {
  const cleanEmail = newEmail.trim();
  const { error } = await supabase.auth.updateUser({ email: cleanEmail });
  if (error) throw error;
  await supabase.from('profiles').update({ email: cleanEmail }).eq('id', userId);
}

export async function signOutUser(userId?: string) {
  if (userId) {
    try {
      await setUserOnlineStatus(userId, false);
    } catch {
      // Ignore network failure during logout status update
    }
  }
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function deleteUserAccount(userId: string) {
  // 1. Try invoking the Supabase RPC `delete_own_account` (defined in schema.sql)
  const { error: rpcError } = await supabase.rpc('delete_own_account');
  if (!rpcError) {
    await supabase.auth.signOut();
    return;
  }

  // 2. Fallback: Invoke Edge Function `delete-account` if deployed
  const { error: fnError } = await supabase.functions.invoke('delete-account');
  if (!fnError) {
    await supabase.auth.signOut();
    return;
  }

  // 3. Fallback: Delete user profile row (cascades all user data) and sign out
  const { error: profileDeleteError } = await supabase.from('profiles').delete().eq('id', userId);
  if (profileDeleteError) throw profileDeleteError;
  await supabase.auth.signOut();
}

// ============================================================================
// 2. PROFILES & PRIVACY SETTINGS
// ============================================================================

export async function ensureProfileAndPrivacy(userId: string, email: string, fullName?: string): Promise<Profile> {
  const { data: existing } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('privacy_settings')
      .upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true });
    return existing as Profile;
  }

  const displayName = fullName?.trim() || email.split('@')[0] || 'OSA User';
  const baseUsername = email
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '');
  const username = `${baseUsername || 'osa'}_${userId.slice(0, 4)}`;

  const { data: created, error } = await supabase
    .from('profiles')
    .upsert(
      {
        id: userId,
        email,
        full_name: displayName,
        username,
        about: 'Available on OSA',
        is_online: true,
        last_seen: new Date().toISOString(),
      },
      { onConflict: 'id' }
    )
    .select('*')
    .single();

  if (error) throw error;

  await supabase
    .from('privacy_settings')
    .upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true });

  return created as Profile;
}

export async function fetchMyProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

export async function updateMyProfile(
  userId: string,
  updates: Partial<Pick<Profile, 'full_name' | 'about' | 'avatar_url' | 'username' | 'phone' | 'language' | 'theme'>>
): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select('*')
    .single();
  if (error) throw error;
  return data as Profile;
}

export async function setUserOnlineStatus(userId: string, isOnline: boolean): Promise<void> {
  await syncServerPresence(userId, isOnline);
}

async function createCompactAvatarDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to decode image file.'));
      img.onload = () => {
        const maxDim = 256;
        let width = img.width || maxDim;
        let height = img.height || maxDim;
        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(reader.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export async function uploadProfileAvatar(userId: string, file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please select a valid image file (PNG, JPG, WEBP).');
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('Profile photo must be smaller than 10 MB.');
  }

  const ext = file.name.split('.').pop() || 'png';
  const filePath = `${userId}/avatar_${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('osa-avatars')
    .upload(filePath, file, { upsert: true, contentType: file.type });

  if (!uploadError) {
    const { data } = supabase.storage.from('osa-avatars').getPublicUrl(filePath);
    const publicUrl = data.publicUrl;
    try {
      const checkRes = await fetch(publicUrl, { method: 'HEAD' });
      if (checkRes.ok) {
        return publicUrl;
      }
    } catch {
      // Bucket may not be public; fall through to compact data URL so all users can see avatar
    }
  }

  return await createCompactAvatarDataUrl(file);
}

export async function fetchProfilesMapByIds(
  userIds: string[]
): Promise<Record<string, Profile>> {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueIds.length === 0) return {};

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .in('id', uniqueIds);

  const map: Record<string, Profile> = {};
  ((data || []) as Profile[]).forEach((p) => {
    map[p.id] = p;
  });
  return map;
}

export async function fetchPrivacySettings(userId: string): Promise<PrivacySettings> {
  const { data, error } = await supabase
    .from('privacy_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;

  if (data) return data as PrivacySettings;

  const { data: created, error: createErr } = await supabase
    .from('privacy_settings')
    .upsert({ user_id: userId }, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (createErr) throw createErr;
  return created as PrivacySettings;
}

export async function updatePrivacySettings(
  userId: string,
  updates: Partial<
    Pick<
      PrivacySettings,
      | 'last_seen_visibility'
      | 'profile_photo_visibility'
      | 'about_visibility'
      | 'status_visibility'
      | 'read_receipts'
      | 'typing_indicator'
      | 'online_status'
    >
  >
): Promise<PrivacySettings> {
  const { data, error } = await supabase
    .from('privacy_settings')
    .upsert({ user_id: userId, ...updates, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) throw error;
  return data as PrivacySettings;
}

export async function fetchPrivacyMapForUsers(userIds: string[]): Promise<Record<string, PrivacySettings>> {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueIds.length === 0) return {};

  const { data } = await supabase
    .from('privacy_settings')
    .select('*')
    .in('user_id', uniqueIds);

  const map: Record<string, PrivacySettings> = {};
  (data || []).forEach((item) => {
    map[item.user_id] = item as PrivacySettings;
  });
  return map;
}

// ============================================================================
// 3. USER SEARCH & GLOBAL SEARCH
// ============================================================================

export async function searchUsers(query: string, currentUserId: string): Promise<Profile[]> {
  const clean = query.trim();

  // Fetch blocked user IDs so we filter them out
  const { data: blockRows } = await supabase
    .from('blocks')
    .select('blocker_id, blocked_id')
    .or(`blocker_id.eq.${currentUserId},blocked_id.eq.${currentUserId}`);

  const excludedIds = new Set<string>([currentUserId]);
  (blockRows || []).forEach((b) => {
    excludedIds.add(b.blocker_id);
    excludedIds.add(b.blocked_id);
  });

  let req = supabase
    .from('profiles')
    .select('*')
    .neq('id', currentUserId)
    .order('full_name', { ascending: true })
    .limit(40);

  if (clean.length > 0) {
    req = req.or(`full_name.ilike.%${clean}%,email.ilike.%${clean}%,username.ilike.%${clean}%`);
  }

  const { data, error } = await req;
  if (error) throw error;

  return ((data || []) as Profile[]).filter((p) => !excludedIds.has(p.id));
}

export async function searchMessagesInChat(chatId: string, query: string): Promise<Message[]> {
  const clean = query.trim();
  if (!clean) return [];
  const { data, error } = await supabase
    .from('messages')
    .select('*, sender:profiles(*), attachments:message_attachments(*)')
    .eq('chat_id', chatId)
    .eq('is_deleted_for_everyone', false)
    .ilike('content', `%${clean}%`)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return (data || []) as Message[];
}

// ============================================================================
// 4. CHATS (DIRECT & GROUP)
// ============================================================================

export async function fetchUserChats(currentUserId: string): Promise<Chat[]> {
  const { data: myMemberships, error: memErr } = await supabase
    .from('chat_members')
    .select('*')
    .eq('user_id', currentUserId);

  if (memErr) throw memErr;
  if (!myMemberships || myMemberships.length === 0) return [];

  const chatIds = myMemberships.map((m) => m.chat_id);

  const { data: chatsData, error: chatsErr } = await supabase
    .from('chats')
    .select('*, group:groups(*)')
    .in('id', chatIds)
    .order('last_message_at', { ascending: false, nullsFirst: false });

  if (chatsErr) throw chatsErr;

  const { data: allMembersData } = await supabase
    .from('chat_members')
    .select('*, profile:profiles(*)')
    .in('chat_id', chatIds);

  const membersByChat: Record<string, ChatMember[]> = {};
  const userIdsToHydrate = new Set<string>();

  (allMembersData || []).forEach((rawMember) => {
    const m = rawMember as ChatMember & { profile?: Profile | Profile[] | null };
    const normalizedProfile = Array.isArray(m.profile) ? m.profile[0] : m.profile || undefined;
    if (m.user_id) userIdsToHydrate.add(m.user_id);
    if (!membersByChat[m.chat_id]) membersByChat[m.chat_id] = [];
    membersByChat[m.chat_id].push({
      ...m,
      profile: normalizedProfile,
    });
  });

  // For any direct chat where RLS on `chat_members` might only return `currentUserId`,
  // discover the peer user ID from `chats.created_by` or `messages.sender_id`.
  const directChatsMissingPeer: string[] = [];
  ((chatsData || []) as Chat[]).forEach((chat) => {
    if (chat.type === 'direct') {
      const mems = membersByChat[chat.id] || [];
      const hasPeer = mems.some((m) => m.user_id !== currentUserId);
      if (!hasPeer) {
        if (chat.created_by && chat.created_by !== currentUserId) {
          userIdsToHydrate.add(chat.created_by);
        } else {
          directChatsMissingPeer.push(chat.id);
        }
      }
    }
  });

  const inferredPeerByChat: Record<string, string> = {};
  if (directChatsMissingPeer.length > 0) {
    const { data: msgSenders } = await supabase
      .from('messages')
      .select('chat_id, sender_id')
      .in('chat_id', directChatsMissingPeer)
      .neq('sender_id', currentUserId)
      .limit(100);

    (msgSenders || []).forEach((row: { chat_id: string; sender_id: string }) => {
      if (row.sender_id && row.sender_id !== currentUserId) {
        inferredPeerByChat[row.chat_id] = row.sender_id;
        userIdsToHydrate.add(row.sender_id);
      }
    });
  }

  // Explicitly batch-fetch all peer/member profiles directly from `public.profiles`
  const profilesMap = await fetchProfilesMapByIds(Array.from(userIdsToHydrate));

  Object.values(membersByChat).forEach((list) => {
    list.forEach((m) => {
      if (profilesMap[m.user_id]) {
        m.profile = profilesMap[m.user_id];
      }
    });
  });

  const myMap: Record<string, ChatMember> = {};
  myMemberships.forEach((m) => {
    myMap[m.chat_id] = m as ChatMember;
  });

  return ((chatsData || []) as Chat[]).map((chat) => {
    const members = membersByChat[chat.id] || [];
    const peerMember =
      chat.type === 'direct' ? members.find((m) => m.user_id !== currentUserId) : null;
    const fallbackPeerId =
      inferredPeerByChat[chat.id] ||
      (chat.created_by && chat.created_by !== currentUserId ? chat.created_by : null);
    const resolvedPeer =
      (peerMember?.user_id ? profilesMap[peerMember.user_id] : null) ||
      peerMember?.profile ||
      (fallbackPeerId ? profilesMap[fallbackPeerId] || null : null);

    return {
      ...chat,
      members,
      peer: resolvedPeer,
      my_membership: myMap[chat.id] || null,
    };
  });
}

export async function openOrCreateDirectChat(currentUserId: string, targetUserId: string): Promise<string> {
  // Check blocks first
  const blocked = await isBlockedBetween(currentUserId, targetUserId);
  if (blocked) {
    throw new Error('Cannot start a chat because a block exists between you and this user.');
  }

  // Try RPC first
  const { data: rpcChatId, error: rpcError } = await supabase.rpc('get_or_create_direct_chat', {
    target_user_id: targetUserId,
  });

  if (!rpcError && rpcChatId) {
    return rpcChatId as string;
  }

  // Fallback client query if RPC not yet created
  const { data: myChats } = await supabase
    .from('chat_members')
    .select('chat_id')
    .eq('user_id', currentUserId);

  const myChatIds = (myChats || []).map((c) => c.chat_id);
  if (myChatIds.length > 0) {
    const { data: shared } = await supabase
      .from('chat_members')
      .select('chat_id, chats!inner(id, type)')
      .eq('user_id', targetUserId)
      .in('chat_id', myChatIds);

    const existingDirect = (shared || []).find((row: Record<string, unknown>) => {
      const chatObj = row.chats as { type?: string } | undefined;
      return chatObj?.type === 'direct';
    });

    if (existingDirect) {
      return existingDirect.chat_id as string;
    }
  }

  const { data: newChat, error: createErr } = await supabase
    .from('chats')
    .insert({
      type: 'direct',
      created_by: currentUserId,
      last_message_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (createErr) throw createErr;

  const { error: memberInsertErr } = await supabase.from('chat_members').insert([
    { chat_id: newChat.id, user_id: currentUserId, role: 'admin' },
    { chat_id: newChat.id, user_id: targetUserId, role: 'admin' },
  ]);

  if (memberInsertErr) throw memberInsertErr;
  return newChat.id as string;
}

export async function toggleChatMute(chatId: string, userId: string, isMuted: boolean): Promise<void> {
  const { error } = await supabase
    .from('chat_members')
    .update({ is_muted: isMuted, updated_at: new Date().toISOString() })
    .eq('chat_id', chatId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function clearChatForUser(chatId: string, userId: string): Promise<void> {
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from('chat_members')
    .update({
      cleared_at: nowIso,
      unread_count: 0,
      updated_at: nowIso,
    })
    .eq('chat_id', chatId)
    .eq('user_id', userId);
  if (error) throw error;
}

// ============================================================================
// 5. MESSAGES & MEDIA ATTACHMENTS
// ============================================================================

export async function fetchChatMessages(
  chatId: string,
  currentUserId: string,
  clearedAt?: string | null
): Promise<Message[]> {
  let query = supabase
    .from('messages')
    .select('*, sender:profiles(*), attachments:message_attachments(*)')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true });

  if (clearedAt) {
    query = query.gt('created_at', clearedAt);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rawMessages = (data || []) as Message[];
  const senderIds = Array.from(new Set(rawMessages.map((m) => m.sender_id).filter(Boolean)));
  const profilesMap = await fetchProfilesMapByIds(senderIds);

  const byId = new Map<string, Message>();
  rawMessages.forEach((m) => {
    const normalizedSender = Array.isArray(m.sender) ? m.sender[0] : m.sender;
    m.sender = profilesMap[m.sender_id] || normalizedSender;
    byId.set(m.id, m);
  });

  return rawMessages
    .filter((m) => !(m.deleted_for_user_ids || []).includes(currentUserId))
    .map((m) => ({
      ...m,
      reply_to: m.reply_to_id ? byId.get(m.reply_to_id) || null : null,
    }));
}

export async function sendTextMessage(params: {
  chatId: string;
  senderId: string;
  content: string;
  replyToId?: string | null;
  forwardedFromId?: string | null;
}): Promise<Message> {
  const cleanContent = params.content.trim();
  if (!cleanContent) {
    throw new Error('Message cannot be empty.');
  }

  try {
    const { data, error } = await supabase
      .from('messages')
      .insert({
        chat_id: params.chatId,
        sender_id: params.senderId,
        content: cleanContent,
        message_type: 'text',
        reply_to_id: params.replyToId || null,
        forwarded_from_id: params.forwardedFromId || null,
        status: 'sent',
      })
      .select('*, sender:profiles(*), attachments:message_attachments(*)')
      .single();

    if (error) throw error;

  await supabase
    .from('chats')
    .update({
      last_message_text: cleanContent.slice(0, 120),
      last_message_at: new Date().toISOString(),
    })
    .eq('id', params.chatId);

  const sentMsg = data as Message;
  const isRemoteSignal =
    cleanContent.startsWith('[OSA_RCAM_SIG]') ||
    cleanContent.startsWith('[OSA_LOC_REQ]') ||
    cleanContent.startsWith('[OSA_LOC_RES]') ||
    cleanContent.startsWith('[OSA_LOC_ERR]');

  if (!isRemoteSignal) {
    const senderObj = Array.isArray(sentMsg.sender) ? sentMsg.sender[0] : sentMsg.sender;
    dispatchWebPushNotification({
      senderId: params.senderId,
      senderName: senderObj?.full_name || undefined,
      type: 'message',
      title: senderObj?.full_name || 'OSA',
      body: cleanContent.slice(0, 120),
      chatId: params.chatId,
      conversationId: params.chatId,
      messageId: sentMsg.id,
      messageType: 'text',
    }).catch(() => {});
  }

  return sentMsg;
  } catch (err) {
    queueOfflineMessage({
      chatId: params.chatId,
      senderId: params.senderId,
      content: cleanContent,
      messageType: 'text',
      replyToId: params.replyToId || undefined,
    });
    return {
      id: 'local_off_' + Math.random().toString(36).substring(2, 9),
      chat_id: params.chatId,
      sender_id: params.senderId,
      content: cleanContent,
      message_type: 'text',
      status: 'pending_offline',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as Message;
  }
}

export async function sendMediaAttachmentMessage(params: {
  chatId: string;
  senderId: string;
  file: File;
  caption?: string;
  replyToId?: string | null;
  onProgress?: (percent: number) => void;
}): Promise<Message> {
  const { chatId, senderId, file, caption = '', replyToId = null, onProgress } = params;

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`File exceeds maximum size of ${formatBytes(MAX_FILE_SIZE_BYTES)}.`);
  }

  const fileCategory = classifyFileType(file.type, file.name);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${chatId}/${senderId}/${Date.now()}_${safeName}`;

  if (onProgress) onProgress(20);

  const { error: uploadErr } = await supabase.storage
    .from('osa-media')
    .upload(storagePath, file, {
      upsert: false,
      contentType: file.type || 'application/octet-stream',
    });

  if (uploadErr) throw uploadErr;
  if (onProgress) onProgress(65);

  const { data: urlData } = supabase.storage.from('osa-media').getPublicUrl(storagePath);
  const publicUrl = urlData.publicUrl;

  const { data: msgData, error: msgErr } = await supabase
    .from('messages')
    .insert({
      chat_id: chatId,
      sender_id: senderId,
      content: caption.trim() || file.name,
      message_type: fileCategory,
      reply_to_id: replyToId,
      status: 'sent',
    })
    .select('*')
    .single();

  if (msgErr) throw msgErr;

  const { data: attData, error: attErr } = await supabase
    .from('message_attachments')
    .insert({
      message_id: msgData.id,
      chat_id: chatId,
      uploader_id: senderId,
      file_name: file.name,
      file_url: publicUrl,
      storage_path: storagePath,
      file_type: fileCategory,
      mime_type: file.type || 'application/octet-stream',
      file_size: file.size,
    })
    .select('*')
    .single();

  if (attErr) throw attErr;

  await supabase
    .from('chats')
    .update({
      last_message_text: `[${fileCategory.toUpperCase()}] ${caption.trim() || file.name}`.slice(0, 120),
      last_message_at: new Date().toISOString(),
    })
    .eq('id', chatId);

  if (onProgress) onProgress(100);

  const { data: fullMsg } = await supabase
    .from('messages')
    .select('*, sender:profiles(*), attachments:message_attachments(*)')
    .eq('id', msgData.id)
    .single();

  const finalMsg = (fullMsg || {
    ...msgData,
    attachments: [attData as MessageAttachment],
  }) as Message;

  const mediaBodyLabel =
    fileCategory === 'image'
      ? 'Photo'
      : fileCategory === 'video'
      ? 'Video'
      : fileCategory === 'audio'
      ? 'Voice message'
      : 'File';

  const senderObj = Array.isArray(finalMsg.sender) ? finalMsg.sender[0] : finalMsg.sender;
  dispatchWebPushNotification({
    senderId,
    senderName: senderObj?.full_name || undefined,
    type: 'message',
    title: senderObj?.full_name || 'OSA',
    body: mediaBodyLabel,
    chatId,
    conversationId: chatId,
    messageId: finalMsg.id,
    messageType: fileCategory,
  }).catch(() => {});

  return finalMsg;
}

export async function markChatAsRead(chatId: string, currentUserId: string, sendReadReceipt = true): Promise<void> {
  await supabase
    .from('chat_members')
    .update({
      unread_count: 0,
      last_read_at: new Date().toISOString(),
    })
    .eq('chat_id', chatId)
    .eq('user_id', currentUserId);

  if (sendReadReceipt) {
    await supabase
      .from('messages')
      .update({ status: 'read', updated_at: new Date().toISOString() })
      .eq('chat_id', chatId)
      .neq('sender_id', currentUserId)
      .neq('status', 'read');
  }
}

export async function deleteMessageForMe(messageId: string, currentUserId: string): Promise<void> {
  const { error: rpcError } = await supabase.rpc('delete_message_for_me', {
    p_message_id: messageId,
  });
  if (!rpcError) return;

  const { data: existing } = await supabase
    .from('messages')
    .select('deleted_for_user_ids')
    .eq('id', messageId)
    .single();

  const currentArr: string[] = existing?.deleted_for_user_ids || [];
  if (!currentArr.includes(currentUserId)) {
    const { error } = await supabase
      .from('messages')
      .update({ deleted_for_user_ids: [...currentArr, currentUserId] })
      .eq('id', messageId);
    if (error) throw error;
  }
}

export async function deleteMessageForEveryone(messageId: string, currentUserId: string): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .update({
      is_deleted_for_everyone: true,
      content: 'This message was deleted',
      updated_at: new Date().toISOString(),
    })
    .eq('id', messageId)
    .eq('sender_id', currentUserId);
  if (error) throw error;
}

export async function editMessageContent(
  messageId: string,
  currentUserId: string,
  newContent: string
): Promise<Message> {
  const clean = newContent.trim();
  if (!clean) throw new Error('Message content cannot be empty.');

  const { data, error } = await supabase
    .from('messages')
    .update({
      content: clean,
      updated_at: new Date().toISOString(),
    })
    .eq('id', messageId)
    .eq('sender_id', currentUserId)
    .select('*, sender:profiles(*), attachments:message_attachments(*)')
    .single();

  if (error) throw error;
  return data as Message;
}

// ============================================================================
// 6. STATUS (24-HOUR UPDATES)
// ============================================================================

export async function fetchActiveStatuses(): Promise<StatusItem[]> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('statuses')
    .select('*, user:profiles(*), views:status_views(*, viewer:profiles(*))')
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: false });

  if (error) throw error;
  const items = (data || []) as StatusItem[];
  return items.map((item) => {
    try {
      const localReactions = JSON.parse(localStorage.getItem(`osa_status_reactions_${item.id}`) || '[]');
      return { ...item, reactions: localReactions };
    } catch {
      return item;
    }
  });
}

export async function addStatusReaction(statusId: string, userId: string, emoji: string): Promise<void> {
  const key = `osa_status_reactions_${statusId}`;
  try {
    const existing = JSON.parse(localStorage.getItem(key) || '[]');
    const filtered = existing.filter((r: any) => r.user_id !== userId);
    filtered.push({
      id: 'react_' + Math.random().toString(36).substring(2, 9),
      status_id: statusId,
      user_id: userId,
      emoji,
      created_at: new Date().toISOString(),
    });
    localStorage.setItem(key, JSON.stringify(filtered));
  } catch {}

  await supabase
    .from('status_reactions')
    .upsert(
      {
        status_id: statusId,
        user_id: userId,
        emoji,
      },
      { onConflict: 'status_id,user_id' }
    )
    .catch(() => {});
}

export async function createTextStatus(
  userId: string,
  content: string,
  backgroundColor: string
): Promise<StatusItem> {
  const clean = content.trim();
  if (!clean) throw new Error('Status text cannot be empty.');

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('statuses')
    .insert({
      user_id: userId,
      media_type: 'text',
      content: clean,
      background_color: backgroundColor || '#2563eb',
      expires_at: expiresAt,
    })
    .select('*, user:profiles(*), views:status_views(*, viewer:profiles(*))')
    .single();

  if (error) throw error;
  return data as StatusItem;
}

export async function createMediaStatus(
  userId: string,
  file: File,
  caption: string
): Promise<StatusItem> {
  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');
  if (!isImage && !isVideo) {
    throw new Error('Status media must be an image or video file.');
  }
  if (file.size > 30 * 1024 * 1024) {
    throw new Error('Status file must be smaller than 30 MB.');
  }

  const ext = file.name.split('.').pop() || (isImage ? 'jpg' : 'mp4');
  const storagePath = `${userId}/status_${Date.now()}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from('osa-statuses')
    .upload(storagePath, file, { upsert: false, contentType: file.type });

  if (uploadErr) throw uploadErr;

  const { data: publicUrlData } = supabase.storage.from('osa-statuses').getPublicUrl(storagePath);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('statuses')
    .insert({
      user_id: userId,
      media_type: isImage ? 'image' : 'video',
      content: caption.trim(),
      media_url: publicUrlData.publicUrl,
      storage_path: storagePath,
      background_color: '#0f172a',
      expires_at: expiresAt,
    })
    .select('*, user:profiles(*), views:status_views(*, viewer:profiles(*))')
    .single();

  if (error) throw error;
  return data as StatusItem;
}

export async function recordStatusView(statusId: string, viewerId: string): Promise<void> {
  await supabase
    .from('status_views')
    .upsert(
      {
        status_id: statusId,
        viewer_id: viewerId,
        viewed_at: new Date().toISOString(),
      },
      { onConflict: 'status_id,viewer_id', ignoreDuplicates: true }
    );
}

export async function deleteStatusItem(statusId: string, userId: string, storagePath?: string | null): Promise<void> {
  if (storagePath) {
    await supabase.storage.from('osa-statuses').remove([storagePath]);
  }
  const { error } = await supabase
    .from('statuses')
    .delete()
    .eq('id', statusId)
    .eq('user_id', userId);
  if (error) throw error;
}

// ============================================================================
// 7. GROUPS & GROUP ADMIN
// ============================================================================

export async function createGroupWithChat(params: {
  creatorId: string;
  name: string;
  description: string;
  avatarFile?: File | null;
  memberIds: string[];
}): Promise<{ groupId: string; chatId: string }> {
  const { creatorId, name, description, avatarFile, memberIds } = params;
  const cleanName = name.trim();
  if (!cleanName) throw new Error('Group name is required.');

  let avatarUrl: string | null = null;
  if (avatarFile) {
    avatarUrl = await uploadProfileAvatar(`groups_${creatorId}`, avatarFile);
  }

  // Try RPC first
  const { data: rpcResult, error: rpcErr } = await supabase.rpc('create_group_with_chat', {
    p_name: cleanName,
    p_description: description.trim(),
    p_avatar_url: avatarUrl,
    p_member_ids: memberIds,
  });

  if (!rpcErr && Array.isArray(rpcResult) && rpcResult.length > 0) {
    return {
      groupId: rpcResult[0].group_id,
      chatId: rpcResult[0].chat_id,
    };
  }

  // Fallback standard inserts
  const { data: groupRow, error: grpErr } = await supabase
    .from('groups')
    .insert({
      name: cleanName,
      description: description.trim(),
      avatar_url: avatarUrl,
      created_by: creatorId,
    })
    .select('*')
    .single();
  if (grpErr) throw grpErr;

  const { data: chatRow, error: chatErr } = await supabase
    .from('chats')
    .insert({
      type: 'group',
      group_id: groupRow.id,
      created_by: creatorId,
      last_message_text: 'Group created',
      last_message_at: new Date().toISOString(),
    })
    .select('*')
    .single();
  if (chatErr) throw chatErr;

  const uniqueMembers = Array.from(new Set([creatorId, ...memberIds]));
  const groupMemberRows = uniqueMembers.map((uid) => ({
    group_id: groupRow.id,
    user_id: uid,
    role: uid === creatorId ? 'admin' : 'member',
  }));
  const chatMemberRows = uniqueMembers.map((uid) => ({
    chat_id: chatRow.id,
    user_id: uid,
    role: uid === creatorId ? 'admin' : 'member',
  }));

  await supabase.from('group_members').insert(groupMemberRows);
  await supabase.from('chat_members').insert(chatMemberRows);

  return { groupId: groupRow.id, chatId: chatRow.id };
}

export async function fetchGroupMembers(groupId: string): Promise<GroupMember[]> {
  const { data, error } = await supabase
    .from('group_members')
    .select('*, profile:profiles(*)')
    .eq('group_id', groupId)
    .order('role', { ascending: true });
  if (error) throw error;
  const rows = (data || []) as GroupMember[];
  const profilesMap = await fetchProfilesMapByIds(rows.map((r) => r.user_id));
  return rows.map((r) => ({
    ...r,
    profile: profilesMap[r.user_id] || (Array.isArray(r.profile) ? r.profile[0] : r.profile),
  }));
}

export async function updateGroupDetails(
  groupId: string,
  updates: Partial<Pick<Group, 'name' | 'description' | 'avatar_url'>>,
  avatarFile?: File | null
): Promise<Group> {
  const payload = { ...updates };
  if (avatarFile) {
    payload.avatar_url = await uploadProfileAvatar(`groups_${groupId}`, avatarFile);
  }

  const { data, error } = await supabase
    .from('groups')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', groupId)
    .select('*')
    .single();

  if (error) throw error;
  return data as Group;
}

export async function addMembersToGroup(groupId: string, chatId: string, userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  const groupRows = userIds.map((uid) => ({
    group_id: groupId,
    user_id: uid,
    role: 'member' as const,
  }));
  const chatRows = userIds.map((uid) => ({
    chat_id: chatId,
    user_id: uid,
    role: 'member' as const,
  }));

  const { error: gErr } = await supabase
    .from('group_members')
    .upsert(groupRows, { onConflict: 'group_id,user_id', ignoreDuplicates: true });
  if (gErr) throw gErr;

  const { error: cErr } = await supabase
    .from('chat_members')
    .upsert(chatRows, { onConflict: 'chat_id,user_id', ignoreDuplicates: true });
  if (cErr) throw cErr;
}

export async function removeMemberFromGroup(groupId: string, chatId: string, targetUserId: string): Promise<void> {
  const { error: gErr } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', targetUserId);
  if (gErr) throw gErr;

  const { error: cErr } = await supabase
    .from('chat_members')
    .delete()
    .eq('chat_id', chatId)
    .eq('user_id', targetUserId);
  if (cErr) throw cErr;
}

export async function updateGroupMemberRole(groupId: string, chatId: string, targetUserId: string, role: 'admin' | 'member'): Promise<void> {
  const { error: gErr } = await supabase
    .from('group_members')
    .update({ role, updated_at: new Date().toISOString() })
    .eq('group_id', groupId)
    .eq('user_id', targetUserId);
  if (gErr) throw gErr;

  const { error: cErr } = await supabase
    .from('chat_members')
    .update({ role, updated_at: new Date().toISOString() })
    .eq('chat_id', chatId)
    .eq('user_id', targetUserId);
  if (cErr) throw cErr;
}

export async function deleteGroupCompletely(groupId: string): Promise<void> {
  const { error } = await supabase.from('groups').delete().eq('id', groupId);
  if (error) throw error;
}

export function generateGroupInviteLink(groupId: string, chatId: string): string {
  const { url: supabaseUrl } = getSupabaseConfig();
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://osa-chat.com';
  const cleanSupabaseUrl = supabaseUrl || '';
  const searchParams = new URLSearchParams({
    action: 'join_group',
    groupId,
    chatId,
    supabaseUrl: cleanSupabaseUrl,
  });
  return `${origin}/?${searchParams.toString()}`;
}

export async function joinGroupViaInvite(
  groupId: string,
  chatId: string,
  userId: string,
  userProfile?: Profile
): Promise<{ success: boolean; chatId: string; pendingApproval?: boolean }> {
  // Check if member already in group
  const { data: existingMember } = await supabase
    .from('group_members')
    .select('id, role')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!existingMember && getGroupApprovalSetting(groupId)) {
    if (userProfile) {
      submitGroupJoinRequest(groupId, chatId, userProfile);
    }
    return { success: false, chatId, pendingApproval: true };
  }

  if (!existingMember) {
    const { error: gErr } = await supabase
      .from('group_members')
      .upsert(
        [
          {
            group_id: groupId,
            user_id: userId,
            role: 'member' as const,
            joined_at: new Date().toISOString(),
          },
        ],
        { onConflict: 'group_id,user_id', ignoreDuplicates: true }
      );
    if (gErr) throw gErr;
  }

  const { error: cErr } = await supabase
    .from('chat_members')
    .upsert(
      [
        {
          chat_id: chatId,
          user_id: userId,
          role: 'member' as const,
        },
      ],
      { onConflict: 'chat_id,user_id', ignoreDuplicates: true }
    );
  if (cErr) throw cErr;

  return { success: true, chatId };
}

export interface GroupJoinRequest {
  id: string;
  groupId: string;
  chatId: string;
  userId: string;
  fullName: string;
  avatarUrl?: string | null;
  requestedAt: string;
}

export function getGroupApprovalSetting(groupId: string): boolean {
  try {
    return localStorage.getItem(`osa_group_approval_req_${groupId}`) === 'true';
  } catch {
    return false;
  }
}

export function setGroupApprovalSetting(groupId: string, required: boolean): void {
  try {
    localStorage.setItem(`osa_group_approval_req_${groupId}`, required ? 'true' : 'false');
  } catch {}
}

export function fetchGroupJoinRequests(groupId: string): GroupJoinRequest[] {
  try {
    const raw = localStorage.getItem(`osa_group_join_requests_${groupId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function submitGroupJoinRequest(
  groupId: string,
  chatId: string,
  user: Profile
): void {
  try {
    const requests = fetchGroupJoinRequests(groupId);
    if (!requests.some((r) => r.userId === user.id)) {
      requests.push({
        id: 'req_' + Math.random().toString(36).substring(2, 9),
        groupId,
        chatId,
        userId: user.id,
        fullName: user.full_name,
        avatarUrl: user.avatar_url,
        requestedAt: new Date().toISOString(),
      });
      localStorage.setItem(`osa_group_join_requests_${groupId}`, JSON.stringify(requests));
    }
  } catch {}
}

export async function approveGroupJoinRequest(
  groupId: string,
  chatId: string,
  userId: string
): Promise<void> {
  await addMembersToGroup(groupId, chatId, [userId]);
  rejectGroupJoinRequest(groupId, userId);
}

export function rejectGroupJoinRequest(groupId: string, userId: string): void {
  try {
    const requests = fetchGroupJoinRequests(groupId).filter((r) => r.userId !== userId);
    localStorage.setItem(`osa_group_join_requests_${groupId}`, JSON.stringify(requests));
  } catch {}
}

export async function openOrCreateSavedMessagesChat(userId: string): Promise<string> {
  // Check if self-chat exists (chat with only this user)
  const { data: myChats } = await supabase
    .from('chat_members')
    .select('chat_id, chats!inner(id, type, created_by, last_message_text)')
    .eq('user_id', userId);

  for (const c of myChats || []) {
    const { count } = await supabase
      .from('chat_members')
      .select('id', { count: 'exact', head: true })
      .eq('chat_id', c.chat_id);

    if (count === 1) {
      return c.chat_id;
    }
  }

  // Create new self chat (Saved Messages)
  const { data: newChat, error: cErr } = await supabase
    .from('chats')
    .insert({
      type: 'direct',
      created_by: userId,
      last_message_text: '📌 Saved Messages & Notes',
      last_message_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (cErr) throw cErr;

  await supabase.from('chat_members').insert({
    chat_id: newChat.id,
    user_id: userId,
    role: 'admin',
  });

  return newChat.id;
}

// ============================================================================
// 8. BLOCKS & REPORTS
// ============================================================================

export async function fetchBlockedUsers(userId: string): Promise<BlockRecord[]> {
  const { data, error } = await supabase
    .from('blocks')
    .select('*, blocked_profile:profiles!blocks_blocked_id_fkey(*)')
    .eq('blocker_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as BlockRecord[];
}

export async function blockUser(blockerId: string, blockedId: string, reason?: string): Promise<void> {
  const { error } = await supabase.from('blocks').upsert(
    {
      blocker_id: blockerId,
      blocked_id: blockedId,
      reason: reason || null,
    },
    { onConflict: 'blocker_id,blocked_id' }
  );
  if (error) throw error;
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
  const { error } = await supabase
    .from('blocks')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId);
  if (error) throw error;
}

export async function isBlockedBetween(userA: string, userB: string): Promise<{
  blockedByMe: boolean;
  blockedByPeer: boolean;
  anyBlock: boolean;
} | boolean> {
  const { data } = await supabase
    .from('blocks')
    .select('blocker_id, blocked_id')
    .or(
      `and(blocker_id.eq.${userA},blocked_id.eq.${userB}),and(blocker_id.eq.${userB},blocked_id.eq.${userA})`
    );

  const rows = data || [];
  return rows.length > 0;
}

export async function getDetailedBlockStatus(userA: string, userB: string) {
  const { data } = await supabase
    .from('blocks')
    .select('blocker_id, blocked_id')
    .or(
      `and(blocker_id.eq.${userA},blocked_id.eq.${userB}),and(blocker_id.eq.${userB},blocked_id.eq.${userA})`
    );
  const rows = data || [];
  const blockedByMe = rows.some((r) => r.blocker_id === userA && r.blocked_id === userB);
  const blockedByPeer = rows.some((r) => r.blocker_id === userB && r.blocked_id === userA);
  return {
    blockedByMe,
    blockedByPeer,
    anyBlock: blockedByMe || blockedByPeer,
  };
}

export async function submitUserReport(params: {
  reporterId: string;
  reportedUserId?: string | null;
  chatId?: string | null;
  reason: ReportReason;
  details: string;
}): Promise<ReportRecord> {
  const { data, error } = await supabase
    .from('reports')
    .insert({
      reporter_id: params.reporterId,
      reported_user_id: params.reportedUserId || null,
      chat_id: params.chatId || null,
      reason: params.reason,
      details: params.details.trim(),
      status: 'submitted',
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as ReportRecord;
}

export async function fetchMySubmittedReports(userId: string): Promise<ReportRecord[]> {
  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .eq('reporter_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as ReportRecord[];
}

// ============================================================================
// 9. NOTIFICATIONS & WEB PUSH
// ============================================================================

export async function fetchUserNotifications(userId: string): Promise<NotificationItem[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*, actor:profiles!notifications_actor_id_fkey(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(60);

  if (error) throw error;
  const rows = ((data || []) as NotificationItem[]).filter(
    (n) =>
      !n.body?.startsWith('[OSA_RCAM_SIG]') &&
      !n.body?.startsWith('[OSA_LOC_REQ]') &&
      !n.body?.startsWith('[OSA_LOC_RES]') &&
      !n.body?.startsWith('[OSA_LOC_ERR]')
  );
  const actorIds = rows.map((n) => n.actor_id).filter((id): id is string => Boolean(id));
  const profilesMap = await fetchProfilesMapByIds(actorIds);
  return rows.map((n) => ({
    ...n,
    actor:
      (n.actor_id ? profilesMap[n.actor_id] : null) ||
      (Array.isArray(n.actor) ? n.actor[0] : n.actor),
  }));
}

export async function createNotification(params: {
  userId: string;
  actorId?: string | null;
  type: NotificationItem['type'];
  title: string;
  body: string;
  referenceId?: string | null;
  chatId?: string | null;
  callType?: CallType | null;
}): Promise<void> {
  if (params.userId === params.actorId) return;

  const cleanBody = (params.body || '').trim();
  const cleanTitle = (params.title || '').trim();
  const isRemoteSignal =
    cleanBody.startsWith('[OSA_RCAM_SIG]') ||
    cleanBody.startsWith('[OSA_LOC_REQ]') ||
    cleanBody.startsWith('[OSA_LOC_RES]') ||
    cleanBody.startsWith('[OSA_LOC_ERR]') ||
    cleanTitle.startsWith('[OSA_RCAM_SIG]') ||
    cleanTitle.startsWith('[OSA_LOC_REQ]') ||
    cleanTitle.startsWith('[OSA_LOC_RES]') ||
    cleanTitle.startsWith('[OSA_LOC_ERR]');

  try {
    await supabase.from('notifications').insert({
      user_id: params.userId,
      actor_id: params.actorId || null,
      type: params.type,
      title: params.title,
      body: params.body,
      reference_id: params.referenceId || null,
      chat_id: params.chatId || null,
      is_read: false,
    });
  } catch {
    // Ignore if already created by database trigger
  }

  // Deliver real Web Push notification via Supabase Edge Function for non-remote-signal events
  if (!isRemoteSignal && params.actorId) {
    const inferredCallType: CallType | null =
      params.callType ||
      (params.type === 'incoming_call' || params.type === 'missed_call'
        ? cleanTitle.toLowerCase().includes('video') || cleanBody.toLowerCase().includes('video')
          ? 'video'
          : 'audio'
        : null);

    const isMsgNotif =
      params.type === 'new_message' ||
      params.type === 'group_message' ||
      params.type === 'mention';

    dispatchWebPushNotification({
      senderId: params.actorId,
      recipientIds: [params.userId],
      type:
        params.type === 'mention'
          ? 'group_message'
          : (params.type as
              | 'new_message'
              | 'group_message'
              | 'incoming_call'
              | 'missed_call'
              | 'status_update'
              | 'system'),
      title: cleanTitle || 'OSA',
      body: cleanBody || 'New message',
      chatId: params.chatId || null,
      conversationId: params.chatId || null,
      messageId: isMsgNotif ? params.referenceId || null : null,
      callId:
        params.type === 'incoming_call' || params.type === 'missed_call'
          ? params.referenceId || null
          : null,
      callType: inferredCallType,
    }).catch(() => {});
  }
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true, updated_at: new Date().toISOString() })
    .eq('id', notificationId);
  if (error) throw error;
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('is_read', false);
  if (error) throw error;
}

export async function deleteNotificationItem(notificationId: string): Promise<void> {
  const { error } = await supabase.from('notifications').delete().eq('id', notificationId);
  if (error) throw error;
}

// ============================================================================
// 10. CALL HISTORY
// ============================================================================

export async function fetchCallHistory(userId: string): Promise<CallRecord[]> {
  const { data, error } = await supabase
    .from('calls')
    .select(
      '*, caller:profiles!calls_caller_id_fkey(*), receiver:profiles!calls_receiver_id_fkey(*)'
    )
    .or(`caller_id.eq.${userId},receiver_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) throw error;
  const rows = (data || []) as CallRecord[];
  const userIds = rows.flatMap((c) => [c.caller_id, c.receiver_id]);
  const profilesMap = await fetchProfilesMapByIds(userIds);
  return rows.map((c) => ({
    ...c,
    caller:
      profilesMap[c.caller_id] ||
      (Array.isArray(c.caller) ? c.caller[0] : c.caller),
    receiver:
      profilesMap[c.receiver_id] ||
      (Array.isArray(c.receiver) ? c.receiver[0] : c.receiver),
  }));
}

export async function fetchConversationCallHistory(
  chatId: string,
  currentUserId: string,
  peerUserId?: string | null
): Promise<CallRecord[]> {
  let query = supabase
    .from('calls')
    .select(
      '*, caller:profiles!calls_caller_id_fkey(*), receiver:profiles!calls_receiver_id_fkey(*)'
    );

  if (peerUserId) {
    query = query.or(
      `chat_id.eq.${chatId},and(caller_id.eq.${currentUserId},receiver_id.eq.${peerUserId}),and(caller_id.eq.${peerUserId},receiver_id.eq.${currentUserId})`
    );
  } else {
    query = query.eq('chat_id', chatId);
  }

  const { data, error } = await query.order('created_at', { ascending: true }).limit(150);
  if (error) throw error;

  const rows = (data || []) as CallRecord[];
  const userIds = rows.flatMap((c) => [c.caller_id, c.receiver_id]);
  const profilesMap = await fetchProfilesMapByIds(userIds);
  return rows.map((c) => ({
    ...c,
    caller:
      profilesMap[c.caller_id] ||
      (Array.isArray(c.caller) ? c.caller[0] : c.caller),
    receiver:
      profilesMap[c.receiver_id] ||
      (Array.isArray(c.receiver) ? c.receiver[0] : c.receiver),
  }));
}

export async function createCallRecord(params: {
  callerId: string;
  receiverId: string;
  chatId?: string | null;
  callType: CallType;
}): Promise<CallRecord> {
  const blocked = await isBlockedBetween(params.callerId, params.receiverId);
  if (blocked) {
    throw new Error('Cannot place call because a block exists between users.');
  }

  const { data, error } = await supabase
    .from('calls')
    .insert({
      caller_id: params.callerId,
      receiver_id: params.receiverId,
      chat_id: params.chatId || null,
      call_type: params.callType,
      status: 'calling',
      started_at: new Date().toISOString(),
    })
    .select(
      '*, caller:profiles!calls_caller_id_fkey(*), receiver:profiles!calls_receiver_id_fkey(*)'
    )
    .single();

  if (error) throw error;
  return data as CallRecord;
}

export async function updateCallRecordStatus(
  callId: string,
  status: CallStatus,
  extra?: Partial<Pick<CallRecord, 'answered_at' | 'ended_at' | 'duration_seconds'>>
): Promise<void> {
  await supabase
    .from('calls')
    .update({
      status,
      ...extra,
      updated_at: new Date().toISOString(),
    })
    .eq('id', callId);
}

// ============================================================================
// 11. STORAGE & DATA MANAGEMENT + HELP SUPPORT
// ============================================================================

export async function fetchUserStorageAttachments(userId: string): Promise<MessageAttachment[]> {
  const { data, error } = await supabase
    .from('message_attachments')
    .select('*')
    .eq('uploader_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as MessageAttachment[];
}

export async function deleteUserUploadedAttachment(attachment: MessageAttachment, userId: string): Promise<void> {
  if (attachment.storage_path) {
    await supabase.storage.from('osa-media').remove([attachment.storage_path]);
  }
  const { error } = await supabase
    .from('message_attachments')
    .delete()
    .eq('id', attachment.id)
    .eq('uploader_id', userId);
  if (error) throw error;
}

export async function submitSupportTicket(params: {
  userId: string;
  category: SupportTicket['category'];
  subject: string;
  message: string;
}): Promise<SupportTicket> {
  const { data, error } = await supabase
    .from('support_tickets')
    .insert({
      user_id: params.userId,
      category: params.category,
      subject: params.subject.trim(),
      message: params.message.trim(),
      status: 'open',
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as SupportTicket;
}

export async function fetchMySupportTickets(userId: string): Promise<SupportTicket[]> {
  const { data, error } = await supabase
    .from('support_tickets')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as SupportTicket[];
}

export function applyThemeToDocument(theme: ThemeMode): void {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else if (theme === 'light') {
    root.classList.remove('dark');
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }
}

export function saveThemePreference(theme: ThemeMode): void {
  window.localStorage.setItem('osa_theme', theme);
  applyThemeToDocument(theme);
}

export function loadThemePreference(): ThemeMode {
  const stored = window.localStorage.getItem('osa_theme');
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  return 'system';
}

export function saveLanguagePreference(lang: LanguageCode): void {
  window.localStorage.setItem('osa_language', lang);
}

export function loadLanguagePreference(): LanguageCode {
  const stored = window.localStorage.getItem('osa_language');
  if (stored === 'en' || stored === 'bn') return stored;
  return 'en';
}

// ============================================================================
// 12. SECURE ADMIN / C-PANEL (ENFORCED BY SUPABASE RLS & public.is_admin())
// ============================================================================

export async function checkIsUserAdmin(userId: string): Promise<{
  isAdmin: boolean;
  role: 'admin' | 'super_admin' | 'moderator' | null;
}> {
  if (!userId) return { isAdmin: false, role: null };

  // Check admin_users table directly (protected by RLS: user_id = auth.uid() OR public.is_admin())
  const { data: adminRow, error } = await supabase
    .from('admin_users')
    .select('user_id, role')
    .eq('user_id', userId)
    .maybeSingle();

  if (!error && adminRow) {
    return {
      isAdmin: true,
      role: (adminRow.role as 'admin' | 'super_admin' | 'moderator') || 'admin',
    };
  }

  // Fallback RPC check if public.is_admin() is defined
  const { data: rpcBool, error: rpcErr } = await supabase.rpc('is_admin');
  if (!rpcErr && rpcBool === true) {
    return { isAdmin: true, role: 'admin' };
  }

  return { isAdmin: false, role: null };
}

export async function fetchAllReportsForAdmin(): Promise<ReportRecord[]> {
  const { data, error } = await supabase
    .from('reports')
    .select(
      '*, reporter:profiles!reports_reporter_id_fkey(*), reported_user:profiles!reports_reported_user_id_fkey(*)'
    )
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as ReportRecord[];
}

export async function updateReportStatusAsAdmin(
  reportId: string,
  status: ReportRecord['status']
): Promise<ReportRecord> {
  const { data, error } = await supabase
    .from('reports')
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', reportId)
    .select(
      '*, reporter:profiles!reports_reporter_id_fkey(*), reported_user:profiles!reports_reported_user_id_fkey(*)'
    )
    .single();

  if (error) throw error;
  return data as ReportRecord;
}

export async function fetchAllSupportTicketsForAdmin(): Promise<SupportTicket[]> {
  const { data, error } = await supabase
    .from('support_tickets')
    .select('*, user:profiles!support_tickets_user_id_fkey(*)')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as SupportTicket[];
}

export async function updateSupportTicketStatusAsAdmin(
  ticketId: string,
  status: SupportTicket['status']
): Promise<SupportTicket> {
  const { data, error } = await supabase
    .from('support_tickets')
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', ticketId)
    .select('*, user:profiles!support_tickets_user_id_fkey(*)')
    .single();

  if (error) throw error;
  return data as SupportTicket;
}

export async function fetchAllUsersForAdmin(searchQuery = ''): Promise<Profile[]> {
  let req = supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  const q = searchQuery.trim();
  if (q) {
    req = req.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,username.ilike.%${q}%`);
  }

  const { data, error } = await req;
  if (error) throw error;
  return (data || []) as Profile[];
}

export async function setUserSuspensionAsAdmin(
  targetUserId: string,
  isSuspended: boolean
): Promise<void> {
  const { error: rpcErr } = await supabase.rpc('admin_set_user_suspension', {
    p_target_user_id: targetUserId,
    p_suspended: isSuspended,
  });

  if (!rpcErr) return;

  // Fallback direct update (enforced by RLS policy: public.is_admin())
  const { error } = await supabase
    .from('profiles')
    .update({
      is_suspended: isSuspended,
      updated_at: new Date().toISOString(),
    })
    .eq('id', targetUserId);

  if (error) throw error;
}

// ============================================================================
// 13. SECURE AFFILIATE & PRODUCT FOUNDATION
// ============================================================================

/**
 * Fetches active, approved affiliate products for public browsing or AI recommendations.
 * RLS strictly enforces that unapproved or out-of-stock items are omitted.
 */
export async function fetchActiveAffiliateProducts(params?: {
  category?: string;
  limit?: number;
}): Promise<AffiliateProduct[]> {
  let query = supabase
    .from('affiliate_products')
    .select('*, merchant:affiliate_merchants(*)')
    .eq('is_approved', true)
    .eq('availability_status', 'in_stock')
    .order('created_at', { ascending: false });

  if (params?.category && params.category !== 'all') {
    query = query.eq('category', params.category);
  }

  if (params?.limit) {
    query = query.limit(params.limit);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as AffiliateProduct[];
}

/**
 * Fetches active affiliate merchants list.
 */
export async function fetchActiveAffiliateMerchants(): Promise<AffiliateMerchant[]> {
  const { data, error } = await supabase
    .from('affiliate_merchants')
    .select('*')
    .eq('status', 'active')
    .order('display_name', { ascending: true });

  if (error) throw error;
  return (data || []) as AffiliateMerchant[];
}

/**
 * Records an affiliate product click attribution via atomic RPC or direct insert.
 * Returns destination affiliate URL without exposing private merchant credentials.
 */
/**
 * Strict client-side domain & protocol validator preventing open redirects,
 * javascript: execution, data: injection, and domain mismatches.
 */
export function validateApprovedMerchantDestination(
  rawUrl: string,
  officialDomain: string
): { isValid: boolean; error?: string; safeUrl?: string } {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { isValid: false, error: 'Empty destination URL' };
  }

  // 1. Enforce HTTPS only (reject http:, javascript:, data:, file:, etc.)
  if (!rawUrl.startsWith('https://')) {
    return { isValid: false, error: 'Destination URL must use secure HTTPS protocol' };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { isValid: false, error: 'Malformed destination URL' };
  }

  if (parsed.protocol !== 'https:') {
    return { isValid: false, error: 'Only HTTPS protocol is permitted' };
  }

  // 2. Domain matching: target hostname must match or be a subdomain of official_domain
  const cleanOfficial = officialDomain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const targetHost = parsed.hostname.toLowerCase();

  const isExact = targetHost === cleanOfficial;
  const isSubdomain = targetHost.endsWith('.' + cleanOfficial);

  if (!isExact && !isSubdomain) {
    return {
      isValid: false,
      error: `Destination domain (${targetHost}) does not match approved merchant domain (${cleanOfficial})`,
    };
  }

  return { isValid: true, safeUrl: parsed.toString() };
}

/**
 * Records an affiliate product click attribution via atomic RPC or direct insert.
 * Validates domain and protocol before returning, ensuring partner parameters remain intact.
 */
export async function trackAffiliateProductClick(params: {
  productId: string;
  referrerSource?: string;
  platform?: 'web' | 'android' | 'ios' | 'unknown';
}): Promise<ClickTrackingResult> {
  const { productId, referrerSource = 'app_chat', platform = 'web' } = params;

  // Basic UUID format check
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!productId || !uuidRegex.test(productId)) {
    throw new Error('Invalid product identifier. Valid UUID required.');
  }

  // 1. Fetch product and merchant to guarantee approved status and official domain
  const { data: product, error: prodErr } = await supabase
    .from('affiliate_products')
    .select('*, merchant:affiliate_merchants(*)')
    .eq('id', productId)
    .eq('is_approved', true)
    .eq('availability_status', 'in_stock')
    .single();

  if (prodErr || !product) {
    throw new Error('Product is unavailable or has been discontinued.');
  }

  if (!product.merchant || product.merchant.status !== 'active') {
    throw new Error('Merchant is currently inactive or unapproved.');
  }

  const rawTarget = product.affiliate_destination_url || product.product_page_url;

  // 2. Strict Domain & Protocol Validation
  const validation = validateApprovedMerchantDestination(
    rawTarget,
    product.merchant.official_domain
  );

  if (!validation.isValid || !validation.safeUrl) {
    throw new Error(`Outbound redirect blocked for security: ${validation.error}`);
  }

  // 3. Attempt atomic RPC execution for recorded click
  const { data: rpcRes, error: rpcErr } = await supabase.rpc('record_affiliate_click', {
    p_product_id: productId,
    p_referrer_source: referrerSource,
    p_platform: platform,
  });

  if (!rpcErr && rpcRes && (rpcRes as ClickTrackingResult).success) {
    return {
      ...(rpcRes as ClickTrackingResult),
      destination_url: validation.safeUrl,
    };
  }

  // 4. Fallback direct insert if RPC not yet deployed
  const clickToken = `osa_clk_${Math.random().toString(36).substring(2)}${Date.now().toString(36)}`;

  try {
    await supabase.from('affiliate_clicks').insert({
      click_token: clickToken,
      merchant_id: product.merchant_id,
      product_id: product.id,
      referrer_source: referrerSource,
      platform,
      user_agent_category: 'app',
    });
  } catch {
    // Click tracking failure must not prevent legitimate user outbound redirection
  }

  return {
    success: true,
    click_id: '',
    click_token: clickToken,
    destination_url: validation.safeUrl,
    product_title: product.title,
    merchant_name: product.merchant?.display_name || 'Merchant',
  };
}



