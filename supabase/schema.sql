-- ============================================================================
-- OSA — COMPLETE PRODUCTION SUPABASE POSTGRESQL SCHEMA, RLS, STORAGE & RPCs
-- File: supabase/schema.sql
-- Safe & Idempotent: Can be executed in the Supabase SQL Editor cleanly.
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. AUTOMATIC UPDATED_AT TRIGGER FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 2. CORE TABLES
-- ============================================================================

-- 2.1 PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE,
  full_name TEXT NOT NULL DEFAULT 'OSA User',
  avatar_url TEXT,
  about TEXT NOT NULL DEFAULT 'Available on OSA',
  phone TEXT,
  is_online BOOLEAN NOT NULL DEFAULT FALSE,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'bn')),
  theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_full_name ON public.profiles(full_name);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_is_online ON public.profiles(is_online);

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2.2 PRIVACY SETTINGS
CREATE TABLE IF NOT EXISTS public.privacy_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_seen_visibility TEXT NOT NULL DEFAULT 'everyone' CHECK (last_seen_visibility IN ('everyone', 'contacts', 'nobody')),
  profile_photo_visibility TEXT NOT NULL DEFAULT 'everyone' CHECK (profile_photo_visibility IN ('everyone', 'contacts', 'nobody')),
  about_visibility TEXT NOT NULL DEFAULT 'everyone' CHECK (about_visibility IN ('everyone', 'contacts', 'nobody')),
  status_visibility TEXT NOT NULL DEFAULT 'everyone' CHECK (status_visibility IN ('everyone', 'contacts', 'nobody')),
  read_receipts BOOLEAN NOT NULL DEFAULT TRUE,
  typing_indicator BOOLEAN NOT NULL DEFAULT TRUE,
  online_status BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_privacy_settings_user_id ON public.privacy_settings(user_id);

DROP TRIGGER IF EXISTS trg_privacy_settings_updated_at ON public.privacy_settings;
CREATE TRIGGER trg_privacy_settings_updated_at
  BEFORE UPDATE ON public.privacy_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2.3 GROUPS
CREATE TABLE IF NOT EXISTS public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(trim(name)) > 0),
  description TEXT DEFAULT '',
  avatar_url TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_groups_created_by ON public.groups(created_by);
CREATE INDEX IF NOT EXISTS idx_groups_name ON public.groups(name);

DROP TRIGGER IF EXISTS trg_groups_updated_at ON public.groups;
CREATE TRIGGER trg_groups_updated_at
  BEFORE UPDATE ON public.groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2.4 GROUP MEMBERS
CREATE TABLE IF NOT EXISTS public.group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON public.group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON public.group_members(user_id);

DROP TRIGGER IF EXISTS trg_group_members_updated_at ON public.group_members;
CREATE TRIGGER trg_group_members_updated_at
  BEFORE UPDATE ON public.group_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2.5 CHATS
CREATE TABLE IF NOT EXISTS public.chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL DEFAULT 'direct' CHECK (type IN ('direct', 'group')),
  group_id UUID UNIQUE REFERENCES public.groups(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  last_message_text TEXT,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chats_type ON public.chats(type);
CREATE INDEX IF NOT EXISTS idx_chats_group_id ON public.chats(group_id);
CREATE INDEX IF NOT EXISTS idx_chats_last_message_at ON public.chats(last_message_at DESC);

DROP TRIGGER IF EXISTS trg_chats_updated_at ON public.chats;
CREATE TRIGGER trg_chats_updated_at
  BEFORE UPDATE ON public.chats
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2.6 CHAT MEMBERS
CREATE TABLE IF NOT EXISTS public.chat_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  is_muted BOOLEAN NOT NULL DEFAULT FALSE,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  unread_count INTEGER NOT NULL DEFAULT 0,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cleared_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(chat_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_members_chat_id ON public.chat_members(chat_id);
CREATE INDEX IF NOT EXISTS idx_chat_members_user_id ON public.chat_members(user_id);

DROP TRIGGER IF EXISTS trg_chat_members_updated_at ON public.chat_members;
CREATE TRIGGER trg_chat_members_updated_at
  BEFORE UPDATE ON public.chat_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2.7 MESSAGES
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'video', 'audio', 'document', 'system')),
  reply_to_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  forwarded_from_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read')),
  is_deleted_for_everyone BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_for_user_ids UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_chat_id_created_at ON public.messages(chat_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_reply_to_id ON public.messages(reply_to_id);

DROP TRIGGER IF EXISTS trg_messages_updated_at ON public.messages;
CREATE TRIGGER trg_messages_updated_at
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2.8 MESSAGE ATTACHMENTS
CREATE TABLE IF NOT EXISTS public.message_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  uploader_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('image', 'video', 'audio', 'document')),
  mime_type TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  width INTEGER,
  height INTEGER,
  duration_seconds NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_message_attachments_message_id ON public.message_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_message_attachments_chat_id ON public.message_attachments(chat_id);
CREATE INDEX IF NOT EXISTS idx_message_attachments_uploader_id ON public.message_attachments(uploader_id);

DROP TRIGGER IF EXISTS trg_message_attachments_updated_at ON public.message_attachments;
CREATE TRIGGER trg_message_attachments_updated_at
  BEFORE UPDATE ON public.message_attachments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2.9 STATUSES
CREATE TABLE IF NOT EXISTS public.statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL DEFAULT 'text' CHECK (media_type IN ('text', 'image', 'video')),
  content TEXT DEFAULT '',
  media_url TEXT,
  storage_path TEXT,
  background_color TEXT NOT NULL DEFAULT '#2563eb',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_statuses_user_id ON public.statuses(user_id);
CREATE INDEX IF NOT EXISTS idx_statuses_expires_at ON public.statuses(expires_at);

DROP TRIGGER IF EXISTS trg_statuses_updated_at ON public.statuses;
CREATE TRIGGER trg_statuses_updated_at
  BEFORE UPDATE ON public.statuses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2.10 STATUS VIEWS
CREATE TABLE IF NOT EXISTS public.status_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status_id UUID NOT NULL REFERENCES public.statuses(id) ON DELETE CASCADE,
  viewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(status_id, viewer_id)
);

CREATE INDEX IF NOT EXISTS idx_status_views_status_id ON public.status_views(status_id);
CREATE INDEX IF NOT EXISTS idx_status_views_viewer_id ON public.status_views(viewer_id);

DROP TRIGGER IF EXISTS trg_status_views_updated_at ON public.status_views;
CREATE TRIGGER trg_status_views_updated_at
  BEFORE UPDATE ON public.status_views
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2.11 BLOCKS
CREATE TABLE IF NOT EXISTS public.blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_blocks_blocker_id ON public.blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked_id ON public.blocks(blocked_id);

DROP TRIGGER IF EXISTS trg_blocks_updated_at ON public.blocks;
CREATE TRIGGER trg_blocks_updated_at
  BEFORE UPDATE ON public.blocks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2.12 REPORTS
CREATE TABLE IF NOT EXISTS public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reported_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  chat_id UUID REFERENCES public.chats(id) ON DELETE SET NULL,
  reason TEXT NOT NULL CHECK (reason IN ('Spam', 'Harassment', 'Inappropriate Content', 'Fake Profile', 'Other')),
  details TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'reviewing', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_reporter_id ON public.reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_reported_user_id ON public.reports(reported_user_id);

DROP TRIGGER IF EXISTS trg_reports_updated_at ON public.reports;
CREATE TRIGGER trg_reports_updated_at
  BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2.13 CALLS
CREATE TABLE IF NOT EXISTS public.calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID REFERENCES public.chats(id) ON DELETE SET NULL,
  caller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  call_type TEXT NOT NULL DEFAULT 'audio' CHECK (call_type IN ('audio', 'video')),
  status TEXT NOT NULL DEFAULT 'calling' CHECK (status IN ('calling', 'ringing', 'accepted', 'connected', 'rejected', 'missed', 'ended', 'failed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answered_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calls_caller_id ON public.calls(caller_id);
CREATE INDEX IF NOT EXISTS idx_calls_receiver_id ON public.calls(receiver_id);
CREATE INDEX IF NOT EXISTS idx_calls_created_at ON public.calls(created_at DESC);

DROP TRIGGER IF EXISTS trg_calls_updated_at ON public.calls;
CREATE TRIGGER trg_calls_updated_at
  BEFORE UPDATE ON public.calls
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2.14 CALL SIGNALS (WebRTC Signaling via Supabase Realtime)
CREATE TABLE IF NOT EXISTS public.call_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL CHECK (signal_type IN ('offer', 'answer', 'ice-candidate', 'hangup', 'renegotiate', 'ringing', 'reject')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_signals_call_id ON public.call_signals(call_id);
CREATE INDEX IF NOT EXISTS idx_call_signals_receiver_id ON public.call_signals(receiver_id);

DROP TRIGGER IF EXISTS trg_call_signals_updated_at ON public.call_signals;
CREATE TRIGGER trg_call_signals_updated_at
  BEFORE UPDATE ON public.call_signals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2.15 NOTIFICATIONS
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('new_message', 'group_message', 'mention', 'incoming_call', 'missed_call', 'status_update', 'system')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  reference_id UUID,
  chat_id UUID REFERENCES public.chats(id) ON DELETE SET NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id_is_read ON public.notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);

DROP TRIGGER IF EXISTS trg_notifications_updated_at ON public.notifications;
CREATE TRIGGER trg_notifications_updated_at
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2.16 SUPPORT TICKETS (Help & Support / Report a Problem)
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('support', 'bug', 'account', 'feedback')),
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON public.support_tickets(user_id);

DROP TRIGGER IF EXISTS trg_support_tickets_updated_at ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2.17 PUSH SUBSCRIPTIONS (Web Push API)
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON public.push_subscriptions(user_id);

-- ============================================================================
-- 3. AUTH USER REGISTRATION TRIGGER & RPC FUNCTIONS
-- ============================================================================

-- Automatically create profile & default privacy settings on Auth signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_name TEXT;
BEGIN
  v_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    SPLIT_PART(NEW.email, '@', 1),
    'OSA User'
  );

  INSERT INTO public.profiles (id, email, full_name, username, is_online, last_seen)
  VALUES (
    NEW.id,
    NEW.email,
    v_full_name,
    LOWER(REGEXP_REPLACE(SPLIT_PART(NEW.email, '@', 1), '[^a-zA-Z0-9_]', '', 'g')) || '_' || SUBSTR(NEW.id::text, 1, 4),
    TRUE,
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(NULLIF(public.profiles.full_name, 'OSA User'), EXCLUDED.full_name);

  INSERT INTO public.privacy_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update chat summary & unread counts when a new message arrives
CREATE OR REPLACE FUNCTION public.handle_new_message()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_preview TEXT;
BEGIN
  IF NEW.message_type = 'text' THEN
    v_preview := LEFT(NEW.content, 120);
  ELSE
    v_preview := '[' || UPPER(NEW.message_type) || '] ' || COALESCE(NULLIF(NEW.content, ''), 'Attachment');
  END IF;

  UPDATE public.chats
  SET last_message_text = v_preview,
      last_message_at = NEW.created_at,
      updated_at = NOW()
  WHERE id = NEW.chat_id;

  UPDATE public.chat_members
  SET unread_count = unread_count + 1,
      updated_at = NOW()
  WHERE chat_id = NEW.chat_id
    AND user_id <> NEW.sender_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_message_inserted ON public.messages;
CREATE TRIGGER on_message_inserted
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_message();

-- RPC: Get or create a direct 1-to-1 chat between auth.uid() and target_user_id
CREATE OR REPLACE FUNCTION public.get_or_create_direct_chat(target_user_id UUID)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_user UUID := auth.uid();
  v_chat_id UUID;
  v_is_blocked BOOLEAN;
BEGIN
  IF v_current_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_current_user = target_user_id THEN
    RAISE EXCEPTION 'Cannot create direct chat with yourself';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.blocks
    WHERE (blocker_id = v_current_user AND blocked_id = target_user_id)
       OR (blocker_id = target_user_id AND blocked_id = v_current_user)
  ) INTO v_is_blocked;

  IF v_is_blocked THEN
    RAISE EXCEPTION 'Cannot start conversation because a block exists between users';
  END IF;

  SELECT c.id INTO v_chat_id
  FROM public.chats c
  JOIN public.chat_members cm1 ON cm1.chat_id = c.id AND cm1.user_id = v_current_user
  JOIN public.chat_members cm2 ON cm2.chat_id = c.id AND cm2.user_id = target_user_id
  WHERE c.type = 'direct'
  LIMIT 1;

  IF v_chat_id IS NOT NULL THEN
    RETURN v_chat_id;
  END IF;

  INSERT INTO public.chats (type, created_by, last_message_at)
  VALUES ('direct', v_current_user, NOW())
  RETURNING id INTO v_chat_id;

  INSERT INTO public.chat_members (chat_id, user_id, role)
  VALUES
    (v_chat_id, v_current_user, 'admin'),
    (v_chat_id, target_user_id, 'admin');

  RETURN v_chat_id;
END;
$$ LANGUAGE plpgsql;

-- RPC: Create a group and its backing group chat atomically
CREATE OR REPLACE FUNCTION public.create_group_with_chat(
  p_name TEXT,
  p_description TEXT DEFAULT '',
  p_avatar_url TEXT DEFAULT NULL,
  p_member_ids UUID[] DEFAULT '{}'
)
RETURNS TABLE(group_id UUID, chat_id UUID)
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_user UUID := auth.uid();
  v_group_id UUID;
  v_chat_id UUID;
  v_member_id UUID;
BEGIN
  IF v_current_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.groups (name, description, avatar_url, created_by)
  VALUES (trim(p_name), COALESCE(p_description, ''), p_avatar_url, v_current_user)
  RETURNING id INTO v_group_id;

  INSERT INTO public.chats (type, group_id, created_by, last_message_text, last_message_at)
  VALUES ('group', v_group_id, v_current_user, 'Group created', NOW())
  RETURNING id INTO v_chat_id;

  -- Add creator as admin
  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (v_group_id, v_current_user, 'admin')
  ON CONFLICT (group_id, user_id) DO NOTHING;

  INSERT INTO public.chat_members (chat_id, user_id, role)
  VALUES (v_chat_id, v_current_user, 'admin')
  ON CONFLICT (chat_id, user_id) DO NOTHING;

  -- Add invited members
  FOREACH v_member_id IN ARRAY p_member_ids LOOP
    IF v_member_id <> v_current_user THEN
      INSERT INTO public.group_members (group_id, user_id, role)
      VALUES (v_group_id, v_member_id, 'member')
      ON CONFLICT (group_id, user_id) DO NOTHING;

      INSERT INTO public.chat_members (chat_id, user_id, role)
      VALUES (v_chat_id, v_member_id, 'member')
      ON CONFLICT (chat_id, user_id) DO NOTHING;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_group_id, v_chat_id;
END;
$$ LANGUAGE plpgsql;

-- RPC: Mark all messages in a chat as read for the current user
CREATE OR REPLACE FUNCTION public.mark_chat_messages_read(p_chat_id UUID)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_user UUID := auth.uid();
BEGIN
  IF v_current_user IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.chat_members
  SET unread_count = 0,
      last_read_at = NOW(),
      updated_at = NOW()
  WHERE chat_id = p_chat_id AND user_id = v_current_user;

  UPDATE public.messages
  SET status = 'read',
      updated_at = NOW()
  WHERE chat_id = p_chat_id
    AND sender_id <> v_current_user
    AND status <> 'read';
END;
$$ LANGUAGE plpgsql;

-- RPC: Delete message for current user only ("Delete for me")
CREATE OR REPLACE FUNCTION public.delete_message_for_me(p_message_id UUID)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_user UUID := auth.uid();
BEGIN
  IF v_current_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.messages
  SET deleted_for_user_ids = array_append(deleted_for_user_ids, v_current_user),
      updated_at = NOW()
  WHERE id = p_message_id
    AND NOT (v_current_user = ANY(deleted_for_user_ids));
END;
$$ LANGUAGE plpgsql;

-- RPC: Delete own authenticated user account safely on server side without exposing service_role key
CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS VOID
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_user UUID := auth.uid();
BEGIN
  IF v_current_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM public.profiles WHERE id = v_current_user;
  DELETE FROM auth.users WHERE id = v_current_user;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. ROW LEVEL SECURITY (RLS) HELPER FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_chat_member(p_chat_id UUID)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.chat_members
    WHERE chat_id = p_chat_id AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.is_group_member(p_group_id UUID)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group_id AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.is_group_admin(p_group_id UUID)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group_id AND user_id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. ENABLE ROW LEVEL SECURITY & POLICIES ON ALL TABLES
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.privacy_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.status_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- PROFILES POLICIES
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;
CREATE POLICY "Authenticated users can view profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (TRUE);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own profile" ON public.profiles;
CREATE POLICY "Users can delete own profile"
  ON public.profiles FOR DELETE
  TO authenticated
  USING (id = auth.uid());

-- PRIVACY SETTINGS POLICIES
DROP POLICY IF EXISTS "Authenticated users can view privacy settings to enforce rules" ON public.privacy_settings;
CREATE POLICY "Authenticated users can view privacy settings to enforce rules"
  ON public.privacy_settings FOR SELECT
  TO authenticated
  USING (TRUE);

DROP POLICY IF EXISTS "Users can insert own privacy settings" ON public.privacy_settings;
CREATE POLICY "Users can insert own privacy settings"
  ON public.privacy_settings FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own privacy settings" ON public.privacy_settings;
CREATE POLICY "Users can update own privacy settings"
  ON public.privacy_settings FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- GROUPS POLICIES
DROP POLICY IF EXISTS "Group members can view groups" ON public.groups;
CREATE POLICY "Group members can view groups"
  ON public.groups FOR SELECT
  TO authenticated
  USING (public.is_group_member(id) OR created_by = auth.uid());

DROP POLICY IF EXISTS "Authenticated users can create groups" ON public.groups;
CREATE POLICY "Authenticated users can create groups"
  ON public.groups FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Group admins can update groups" ON public.groups;
CREATE POLICY "Group admins can update groups"
  ON public.groups FOR UPDATE
  TO authenticated
  USING (public.is_group_admin(id))
  WITH CHECK (public.is_group_admin(id));

DROP POLICY IF EXISTS "Group admins can delete groups" ON public.groups;
CREATE POLICY "Group admins can delete groups"
  ON public.groups FOR DELETE
  TO authenticated
  USING (public.is_group_admin(id));

-- GROUP MEMBERS POLICIES
DROP POLICY IF EXISTS "Group members can view membership" ON public.group_members;
CREATE POLICY "Group members can view membership"
  ON public.group_members FOR SELECT
  TO authenticated
  USING (public.is_group_member(group_id) OR user_id = auth.uid());

DROP POLICY IF EXISTS "Group admins can add members" ON public.group_members;
CREATE POLICY "Group admins can add members"
  ON public.group_members FOR INSERT
  TO authenticated
  WITH CHECK (public.is_group_admin(group_id) OR user_id = auth.uid());

DROP POLICY IF EXISTS "Group admins can update member roles" ON public.group_members;
CREATE POLICY "Group admins can update member roles"
  ON public.group_members FOR UPDATE
  TO authenticated
  USING (public.is_group_admin(group_id));

DROP POLICY IF EXISTS "Group admins can remove members or member can leave" ON public.group_members;
CREATE POLICY "Group admins can remove members or member can leave"
  ON public.group_members FOR DELETE
  TO authenticated
  USING (public.is_group_admin(group_id) OR user_id = auth.uid());

-- CHATS POLICIES
DROP POLICY IF EXISTS "Chat members can view chats" ON public.chats;
CREATE POLICY "Chat members can view chats"
  ON public.chats FOR SELECT
  TO authenticated
  USING (public.is_chat_member(id) OR created_by = auth.uid());

DROP POLICY IF EXISTS "Authenticated users can create chats" ON public.chats;
CREATE POLICY "Authenticated users can create chats"
  ON public.chats FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Chat members can update chat metadata" ON public.chats;
CREATE POLICY "Chat members can update chat metadata"
  ON public.chats FOR UPDATE
  TO authenticated
  USING (public.is_chat_member(id));

-- CHAT MEMBERS POLICIES
DROP POLICY IF EXISTS "Chat members can view participants" ON public.chat_members;
CREATE POLICY "Chat members can view participants"
  ON public.chat_members FOR SELECT
  TO authenticated
  USING (public.is_chat_member(chat_id) OR user_id = auth.uid());

DROP POLICY IF EXISTS "Users can join or be added to chats" ON public.chat_members;
CREATE POLICY "Users can join or be added to chats"
  ON public.chat_members FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_chat_member(chat_id));

DROP POLICY IF EXISTS "Users can update own chat member settings" ON public.chat_members;
CREATE POLICY "Users can update own chat member settings"
  ON public.chat_members FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can leave chat or be removed by group admin" ON public.chat_members;
CREATE POLICY "Users can leave chat or be removed by group admin"
  ON public.chat_members FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() OR public.is_chat_member(chat_id));

-- MESSAGES POLICIES
DROP POLICY IF EXISTS "Chat members can read messages" ON public.messages;
CREATE POLICY "Chat members can read messages"
  ON public.messages FOR SELECT
  TO authenticated
  USING (public.is_chat_member(chat_id));

DROP POLICY IF EXISTS "Chat members can send messages if not blocked" ON public.messages;
CREATE POLICY "Chat members can send messages if not blocked"
  ON public.messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.is_chat_member(chat_id)
  );

DROP POLICY IF EXISTS "Sender or chat member can update message status/delete" ON public.messages;
CREATE POLICY "Sender or chat member can update message status/delete"
  ON public.messages FOR UPDATE
  TO authenticated
  USING (public.is_chat_member(chat_id));

DROP POLICY IF EXISTS "Sender can delete own message" ON public.messages;
CREATE POLICY "Sender can delete own message"
  ON public.messages FOR DELETE
  TO authenticated
  USING (sender_id = auth.uid());

-- MESSAGE ATTACHMENTS POLICIES
DROP POLICY IF EXISTS "Chat members can view attachments" ON public.message_attachments;
CREATE POLICY "Chat members can view attachments"
  ON public.message_attachments FOR SELECT
  TO authenticated
  USING (public.is_chat_member(chat_id) OR uploader_id = auth.uid());

DROP POLICY IF EXISTS "Uploader can insert attachments" ON public.message_attachments;
CREATE POLICY "Uploader can insert attachments"
  ON public.message_attachments FOR INSERT
  TO authenticated
  WITH CHECK (uploader_id = auth.uid() AND public.is_chat_member(chat_id));

DROP POLICY IF EXISTS "Uploader can delete own attachments" ON public.message_attachments;
CREATE POLICY "Uploader can delete own attachments"
  ON public.message_attachments FOR DELETE
  TO authenticated
  USING (uploader_id = auth.uid());

-- STATUSES POLICIES
DROP POLICY IF EXISTS "Authenticated users can view active statuses not blocked" ON public.statuses;
CREATE POLICY "Authenticated users can view active statuses not blocked"
  ON public.statuses FOR SELECT
  TO authenticated
  USING (
    expires_at > NOW()
    AND NOT EXISTS (
      SELECT 1 FROM public.blocks b
      WHERE (b.blocker_id = statuses.user_id AND b.blocked_id = auth.uid())
         OR (b.blocker_id = auth.uid() AND b.blocked_id = statuses.user_id)
    )
  );

DROP POLICY IF EXISTS "Users can create own statuses" ON public.statuses;
CREATE POLICY "Users can create own statuses"
  ON public.statuses FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own statuses" ON public.statuses;
CREATE POLICY "Users can delete own statuses"
  ON public.statuses FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- STATUS VIEWS POLICIES
DROP POLICY IF EXISTS "Status owner and viewer can see status views" ON public.status_views;
CREATE POLICY "Status owner and viewer can see status views"
  ON public.status_views FOR SELECT
  TO authenticated
  USING (
    viewer_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.statuses s
      WHERE s.id = status_views.status_id AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can record own status view" ON public.status_views;
CREATE POLICY "Users can record own status view"
  ON public.status_views FOR INSERT
  TO authenticated
  WITH CHECK (viewer_id = auth.uid());

-- BLOCKS POLICIES
DROP POLICY IF EXISTS "Users can view blocks involving themselves" ON public.blocks;
CREATE POLICY "Users can view blocks involving themselves"
  ON public.blocks FOR SELECT
  TO authenticated
  USING (blocker_id = auth.uid() OR blocked_id = auth.uid());

DROP POLICY IF EXISTS "Users can block others" ON public.blocks;
CREATE POLICY "Users can block others"
  ON public.blocks FOR INSERT
  TO authenticated
  WITH CHECK (blocker_id = auth.uid());

DROP POLICY IF EXISTS "Users can unblock others" ON public.blocks;
CREATE POLICY "Users can unblock others"
  ON public.blocks FOR DELETE
  TO authenticated
  USING (blocker_id = auth.uid());

-- REPORTS POLICIES
DROP POLICY IF EXISTS "Users can view own submitted reports" ON public.reports;
CREATE POLICY "Users can view own submitted reports"
  ON public.reports FOR SELECT
  TO authenticated
  USING (reporter_id = auth.uid());

DROP POLICY IF EXISTS "Users can submit reports" ON public.reports;
CREATE POLICY "Users can submit reports"
  ON public.reports FOR INSERT
  TO authenticated
  WITH CHECK (reporter_id = auth.uid());

-- CALLS POLICIES
DROP POLICY IF EXISTS "Caller and receiver can view calls" ON public.calls;
CREATE POLICY "Caller and receiver can view calls"
  ON public.calls FOR SELECT
  TO authenticated
  USING (caller_id = auth.uid() OR receiver_id = auth.uid());

DROP POLICY IF EXISTS "Caller can initiate call if not blocked" ON public.calls;
CREATE POLICY "Caller can initiate call if not blocked"
  ON public.calls FOR INSERT
  TO authenticated
  WITH CHECK (
    caller_id = auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM public.blocks b
      WHERE (b.blocker_id = caller_id AND b.blocked_id = receiver_id)
         OR (b.blocker_id = receiver_id AND b.blocked_id = caller_id)
    )
  );

DROP POLICY IF EXISTS "Caller and receiver can update call state" ON public.calls;
CREATE POLICY "Caller and receiver can update call state"
  ON public.calls FOR UPDATE
  TO authenticated
  USING (caller_id = auth.uid() OR receiver_id = auth.uid());

-- CALL SIGNALS POLICIES
DROP POLICY IF EXISTS "Call participants can view signals" ON public.call_signals;
CREATE POLICY "Call participants can view signals"
  ON public.call_signals FOR SELECT
  TO authenticated
  USING (sender_id = auth.uid() OR receiver_id = auth.uid());

DROP POLICY IF EXISTS "Call participants can send signals" ON public.call_signals;
CREATE POLICY "Call participants can send signals"
  ON public.call_signals FOR INSERT
  TO authenticated
  WITH CHECK (sender_id = auth.uid());

-- NOTIFICATIONS POLICIES
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Authenticated users can trigger notifications" ON public.notifications;
CREATE POLICY "Authenticated users can trigger notifications"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (actor_id = auth.uid() OR user_id = auth.uid());

DROP POLICY IF EXISTS "Users can mark own notifications read" ON public.notifications;
CREATE POLICY "Users can mark own notifications read"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;
CREATE POLICY "Users can delete own notifications"
  ON public.notifications FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- SUPPORT TICKETS POLICIES
DROP POLICY IF EXISTS "Users can view own support tickets" ON public.support_tickets;
CREATE POLICY "Users can view own support tickets"
  ON public.support_tickets FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can create support tickets" ON public.support_tickets;
CREATE POLICY "Users can create support tickets"
  ON public.support_tickets FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- PUSH SUBSCRIPTIONS POLICIES
DROP POLICY IF EXISTS "Users manage own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users manage own push subscriptions"
  ON public.push_subscriptions FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- 6. SUPABASE STORAGE BUCKETS & STORAGE RLS POLICIES
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES
  ('osa-avatars', 'osa-avatars', true, 10485760),
  ('osa-media', 'osa-media', true, 52428800),
  ('osa-statuses', 'osa-statuses', true, 31457280)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read access for OSA buckets" ON storage.objects;
CREATE POLICY "Public read access for OSA buckets"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id IN ('osa-avatars', 'osa-media', 'osa-statuses'));

DROP POLICY IF EXISTS "Authenticated users can upload to OSA buckets" ON storage.objects;
CREATE POLICY "Authenticated users can upload to OSA buckets"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id IN ('osa-avatars', 'osa-media', 'osa-statuses'));

DROP POLICY IF EXISTS "Users can update own uploaded files" ON storage.objects;
CREATE POLICY "Users can update own uploaded files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner);

DROP POLICY IF EXISTS "Users can delete own uploaded files" ON storage.objects;
CREATE POLICY "Users can delete own uploaded files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (auth.uid() = owner);

-- ============================================================================
-- 7. SUPABASE REALTIME PUBLICATION (IDEMPOTENT)
-- ============================================================================
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'profiles',
    'chats',
    'chat_members',
    'messages',
    'message_attachments',
    'groups',
    'group_members',
    'statuses',
    'status_views',
    'blocks',
    'calls',
    'call_signals',
    'notifications'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

-- ============================================================================
-- 8. SECURE ADMIN / C-PANEL, MODERATION & BLOCK ENFORCEMENT (MIGRATION)
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_profiles_is_suspended ON public.profiles(is_suspended);

CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'super_admin', 'moderator')),
  notes TEXT DEFAULT '',
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_admin_users_updated_at ON public.admin_users;
CREATE TRIGGER trg_admin_users_updated_at
  BEFORE UPDATE ON public.admin_users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.can_send_to_chat(p_chat_id UUID)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chat_type TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  IF NOT public.is_chat_member(p_chat_id) THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_suspended = TRUE
  ) THEN
    RETURN FALSE;
  END IF;

  SELECT type INTO v_chat_type FROM public.chats WHERE id = p_chat_id;

  IF v_chat_type = 'direct' THEN
    IF EXISTS (
      SELECT 1
      FROM public.chat_members cm
      JOIN public.blocks b
        ON (b.blocker_id = auth.uid() AND b.blocked_id = cm.user_id)
        OR (b.blocker_id = cm.user_id AND b.blocked_id = auth.uid())
      WHERE cm.chat_id = p_chat_id
        AND cm.user_id <> auth.uid()
    ) THEN
      RETURN FALSE;
    END IF;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.admin_set_user_suspension(
  p_target_user_id UUID,
  p_suspended BOOLEAN
)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden: Administrator privileges required';
  END IF;

  IF p_target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Administrators cannot suspend their own account';
  END IF;

  UPDATE public.profiles
  SET is_suspended = p_suspended,
      updated_at = NOW()
  WHERE id = p_target_user_id;
END;
$$ LANGUAGE plpgsql;

DROP POLICY IF EXISTS "Users can check own admin status or admins can view all" ON public.admin_users;
CREATE POLICY "Users can check own admin status or admins can view all"
  ON public.admin_users FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Super admins can manage admin_users" ON public.admin_users;
CREATE POLICY "Super admins can manage admin_users"
  ON public.admin_users FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users a
      WHERE a.user_id = auth.uid() AND a.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_users a
      WHERE a.user_id = auth.uid() AND a.role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "Chat members can send messages if not blocked" ON public.messages;
CREATE POLICY "Chat members can send messages if not blocked"
  ON public.messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.can_send_to_chat(chat_id)
  );

DROP POLICY IF EXISTS "Users can view own submitted reports" ON public.reports;
DROP POLICY IF EXISTS "Users can view own reports or admins can view all" ON public.reports;
CREATE POLICY "Users can view own reports or admins can view all"
  ON public.reports FOR SELECT
  TO authenticated
  USING (reporter_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Admins can update report status" ON public.reports;
CREATE POLICY "Admins can update report status"
  ON public.reports FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Users can view own support tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Users can view own tickets or admins can view all" ON public.support_tickets;
CREATE POLICY "Users can view own tickets or admins can view all"
  ON public.support_tickets FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Admins can update support ticket status" ON public.support_tickets;
CREATE POLICY "Admins can update support ticket status"
  ON public.support_tickets FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid() OR public.is_admin())
  WITH CHECK (id = auth.uid() OR public.is_admin());

