-- ============================================================================
-- OSA — SERVER-SIDE BACKGROUND / CLOSED-APP WEB PUSH PIPELINE MIGRATION
-- File: supabase/migrations/20261007_fix_background_web_push.sql
-- Safe & Idempotent: Run this script in the Supabase SQL Editor.
-- Does NOT drop or reset any existing tables or features.
-- ============================================================================

-- 1. Server-only VAPID Key Storage (Fallback when Edge Function env secrets are not set)
-- RLS is enabled with NO policies for anon/authenticated, so private_key is ONLY readable
-- by service_role inside the send-web-push Edge Function.
CREATE TABLE IF NOT EXISTS public.push_vapid_keys (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  public_key TEXT NOT NULL,
  private_key TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT 'mailto:support@osa-messaging.app',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.push_vapid_keys ENABLE ROW LEVEL SECURITY;

-- Safe RPC that exposes ONLY the public VAPID key to authenticated clients for PushManager.subscribe
CREATE OR REPLACE FUNCTION public.get_public_vapid_key()
RETURNS TEXT
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pub TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT public_key INTO v_pub FROM public.push_vapid_keys WHERE id = 1 LIMIT 1;
  RETURN v_pub;
END;
$$ LANGUAGE plpgsql;

-- 2. Idempotent Push Delivery Log (Prevents duplicate notifications per messageId / callId)
CREATE TABLE IF NOT EXISTS public.push_delivery_log (
  event_key TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_delivery_log_created_at
  ON public.push_delivery_log(created_at DESC);

ALTER TABLE public.push_delivery_log ENABLE ROW LEVEL SECURITY;

-- 3. Server-Side Message Notification Trigger Function
-- Automatically creates recipient notification rows when a message is inserted into public.messages
-- (excluding internal Remote Camera / Remote Location control signals) and prevents duplicates.
CREATE OR REPLACE FUNCTION public.handle_new_message()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_preview TEXT;
  v_notif_body TEXT;
  v_chat_type TEXT;
  v_group_id UUID;
  v_group_name TEXT;
  v_sender_name TEXT;
  v_notif_title TEXT;
  v_notif_type TEXT;
  v_is_remote_signal BOOLEAN := FALSE;
  v_member RECORD;
BEGIN
  -- Determine chat preview text
  IF NEW.message_type = 'text' THEN
    v_preview := LEFT(NEW.content, 120);
  ELSIF NEW.message_type = 'image' THEN
    v_preview := 'Photo';
  ELSIF NEW.message_type = 'video' THEN
    v_preview := 'Video';
  ELSIF NEW.message_type = 'audio' THEN
    v_preview := 'Voice message';
  ELSIF NEW.message_type = 'document' THEN
    v_preview := 'File';
  ELSE
    v_preview := '[' || UPPER(NEW.message_type) || '] ' || COALESCE(NULLIF(NEW.content, ''), 'Attachment');
  END IF;

  -- Update chat summary
  UPDATE public.chats
  SET last_message_text = v_preview,
      last_message_at = NEW.created_at,
      updated_at = NOW()
  WHERE id = NEW.chat_id;

  -- Increment unread count for all other chat members
  UPDATE public.chat_members
  SET unread_count = unread_count + 1,
      updated_at = NOW()
  WHERE chat_id = NEW.chat_id
    AND user_id <> NEW.sender_id;

  -- Never create notifications for Remote Camera or Remote Location control signals
  IF NEW.content LIKE '[OSA_RCAM_SIG]%'
     OR NEW.content LIKE '[OSA_LOC_REQ]%'
     OR NEW.content LIKE '[OSA_LOC_RES]%'
     OR NEW.content LIKE '[OSA_LOC_ERR]%' THEN
    v_is_remote_signal := TRUE;
  END IF;

  IF v_is_remote_signal THEN
    RETURN NEW;
  END IF;

  -- Look up chat type, group name, and sender full_name
  SELECT c.type, c.group_id INTO v_chat_type, v_group_id
  FROM public.chats c
  WHERE c.id = NEW.chat_id;

  SELECT COALESCE(NULLIF(trim(p.full_name), ''), 'OSA User') INTO v_sender_name
  FROM public.profiles p
  WHERE p.id = NEW.sender_id;

  IF v_chat_type = 'group' THEN
    SELECT COALESCE(NULLIF(trim(g.name), ''), 'OSA Group') INTO v_group_name
    FROM public.groups g
    WHERE g.id = v_group_id;
    v_notif_type := 'group_message';
    v_notif_title := v_sender_name || ' in ' || COALESCE(v_group_name, 'OSA Group');
  ELSE
    v_notif_type := 'new_message';
    v_notif_title := COALESCE(v_sender_name, 'OSA');
  END IF;

  IF NEW.message_type = 'image' THEN
    v_notif_body := 'Photo';
  ELSIF NEW.message_type = 'video' THEN
    v_notif_body := 'Video';
  ELSIF NEW.message_type = 'audio' THEN
    v_notif_body := 'Voice message';
  ELSIF NEW.message_type = 'document' THEN
    v_notif_body := 'File';
  ELSE
    v_notif_body := COALESCE(NULLIF(LEFT(trim(NEW.content), 100), ''), 'New message');
  END IF;

  -- Insert notification row for each eligible recipient (deduplicated by reference_id = NEW.id)
  FOR v_member IN
    SELECT cm.user_id
    FROM public.chat_members cm
    WHERE cm.chat_id = NEW.chat_id
      AND cm.user_id <> NEW.sender_id
      AND COALESCE(cm.is_muted, FALSE) = FALSE
      AND NOT EXISTS (
        SELECT 1 FROM public.blocks b
        WHERE (b.blocker_id = NEW.sender_id AND b.blocked_id = cm.user_id)
           OR (b.blocker_id = cm.user_id AND b.blocked_id = NEW.sender_id)
      )
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.user_id = v_member.user_id
        AND n.reference_id = NEW.id
    ) THEN
      INSERT INTO public.notifications (
        user_id,
        actor_id,
        type,
        title,
        body,
        reference_id,
        chat_id,
        is_read
      )
      VALUES (
        v_member.user_id,
        NEW.sender_id,
        v_notif_type,
        v_notif_title,
        v_notif_body,
        NEW.id,
        NEW.chat_id,
        FALSE
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_message_inserted ON public.messages;
CREATE TRIGGER on_message_inserted
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_message();
