export type LanguageCode = 'en' | 'bn';
export type ThemeMode = 'light' | 'dark' | 'system';
export type VisibilityScope = 'everyone' | 'contacts' | 'nobody';
export type MainTab = 'chats' | 'status' | 'groups' | 'calls' | 'settings';

export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'document' | 'system';
export type MessageDeliveryStatus = 'sent' | 'delivered' | 'read';

export type CallType = 'audio' | 'video';
export type CallStatus =
  | 'calling'
  | 'ringing'
  | 'accepted'
  | 'connected'
  | 'rejected'
  | 'missed'
  | 'ended'
  | 'failed';

export type SignalType =
  | 'offer'
  | 'answer'
  | 'ice-candidate'
  | 'hangup'
  | 'renegotiate'
  | 'ringing'
  | 'reject';

export type ReportReason =
  | 'Spam'
  | 'Harassment'
  | 'Inappropriate Content'
  | 'Fake Profile'
  | 'Other';

export type NotificationType =
  | 'new_message'
  | 'group_message'
  | 'mention'
  | 'incoming_call'
  | 'missed_call'
  | 'status_update'
  | 'system';

export interface Profile {
  id: string;
  email: string;
  username: string | null;
  full_name: string;
  avatar_url: string | null;
  about: string;
  phone: string | null;
  is_online: boolean;
  last_seen: string;
  language: LanguageCode;
  theme: ThemeMode;
  created_at: string;
  updated_at: string;
}

export interface PrivacySettings {
  id: string;
  user_id: string;
  last_seen_visibility: VisibilityScope;
  profile_photo_visibility: VisibilityScope;
  about_visibility: VisibilityScope;
  status_visibility: VisibilityScope;
  read_receipts: boolean;
  typing_indicator: boolean;
  online_status: boolean;
  created_at: string;
  updated_at: string;
}

export interface Group {
  id: string;
  name: string;
  description: string;
  avatar_url: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  role: 'admin' | 'member';
  joined_at: string;
  profile?: Profile;
}

export interface ChatMember {
  id: string;
  chat_id: string;
  user_id: string;
  role: 'admin' | 'member';
  is_muted: boolean;
  is_pinned: boolean;
  unread_count: number;
  last_read_at: string;
  cleared_at: string | null;
  joined_at: string;
  profile?: Profile;
}

export interface Chat {
  id: string;
  type: 'direct' | 'group';
  group_id: string | null;
  created_by: string | null;
  last_message_text: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
  group?: Group | null;
  members?: ChatMember[];
  peer?: Profile | null;
  my_membership?: ChatMember | null;
}

export interface MessageAttachment {
  id: string;
  message_id: string;
  chat_id: string;
  uploader_id: string;
  file_name: string;
  file_url: string;
  storage_path: string;
  file_type: 'image' | 'video' | 'audio' | 'document';
  mime_type: string;
  file_size: number;
  width?: number | null;
  height?: number | null;
  duration_seconds?: number | null;
  created_at: string;
}

export interface Message {
  id: string;
  chat_id: string;
  sender_id: string;
  content: string;
  message_type: MessageType;
  reply_to_id: string | null;
  forwarded_from_id: string | null;
  status: MessageDeliveryStatus;
  is_deleted_for_everyone: boolean;
  deleted_for_user_ids: string[];
  created_at: string;
  updated_at: string;
  sender?: Profile;
  reply_to?: Message | null;
  attachments?: MessageAttachment[];
}

export interface StatusView {
  id: string;
  status_id: string;
  viewer_id: string;
  viewed_at: string;
  viewer?: Profile;
}

export interface StatusItem {
  id: string;
  user_id: string;
  media_type: 'text' | 'image' | 'video';
  content: string;
  media_url: string | null;
  storage_path: string | null;
  background_color: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
  user?: Profile;
  views?: StatusView[];
}

export interface BlockRecord {
  id: string;
  blocker_id: string;
  blocked_id: string;
  reason: string | null;
  created_at: string;
  blocked_profile?: Profile;
}

export interface ReportRecord {
  id: string;
  reporter_id: string;
  reported_user_id: string | null;
  chat_id: string | null;
  reason: ReportReason;
  details: string;
  status: 'submitted' | 'reviewing' | 'resolved';
  created_at: string;
}

export interface CallRecord {
  id: string;
  chat_id: string | null;
  caller_id: string;
  receiver_id: string;
  call_type: CallType;
  status: CallStatus;
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
  duration_seconds: number;
  created_at: string;
  caller?: Profile;
  receiver?: Profile;
}

export interface CallSignal {
  id: string;
  call_id: string;
  sender_id: string;
  receiver_id: string;
  signal_type: SignalType;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface NotificationItem {
  id: string;
  user_id: string;
  actor_id: string | null;
  type: NotificationType;
  title: string;
  body: string;
  reference_id: string | null;
  chat_id: string | null;
  is_read: boolean;
  created_at: string;
  actor?: Profile | null;
}

export interface SupportTicket {
  id: string;
  user_id: string;
  category: 'support' | 'bug' | 'account' | 'feedback';
  subject: string;
  message: string;
  status: 'open' | 'in_progress' | 'closed';
  created_at: string;
}
