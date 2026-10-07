-- ============================================================================
-- OSA — REAL WEB PUSH BACKGROUND NOTIFICATIONS & NOTIFICATION SETTINGS MIGRATION
-- File: supabase/migrations/20261007_web_push_notifications.sql
-- Safe & Idempotent: Run this script in the Supabase SQL Editor.
-- ============================================================================

-- 1. Enhance public.push_subscriptions for multi-device Web Push & lifecycle tracking
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  device_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS device_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON public.push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_active ON public.push_subscriptions(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON public.push_subscriptions(endpoint);

DROP TRIGGER IF EXISTS trg_push_subscriptions_updated_at ON public.push_subscriptions;
CREATE TRIGGER trg_push_subscriptions_updated_at
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable strict Row Level Security on public.push_subscriptions
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Normal users can ONLY view, insert, update, or delete their own push subscriptions
DROP POLICY IF EXISTS "Users manage own push subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Users can view own push subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Users can insert own push subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Users can update own push subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Users can delete own push subscriptions" ON public.push_subscriptions;

CREATE POLICY "Users can view own push subscriptions"
  ON public.push_subscriptions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own push subscriptions"
  ON public.push_subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own push subscriptions"
  ON public.push_subscriptions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own push subscriptions"
  ON public.push_subscriptions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Safe RPC to upsert a push subscription for the currently authenticated user,
-- preventing duplicate endpoints and handling multi-device / account switching cleanly.
CREATE OR REPLACE FUNCTION public.upsert_push_subscription(
  p_endpoint TEXT,
  p_p256dh TEXT,
  p_auth TEXT,
  p_user_agent TEXT DEFAULT NULL,
  p_device_metadata JSONB DEFAULT '{}'::jsonb,
  p_is_active BOOLEAN DEFAULT TRUE
)
RETURNS public.push_subscriptions
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.push_subscriptions;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_endpoint IS NULL OR char_length(trim(p_endpoint)) = 0 THEN
    RAISE EXCEPTION 'Push subscription endpoint is required';
  END IF;

  INSERT INTO public.push_subscriptions (
    user_id,
    endpoint,
    p256dh,
    auth,
    user_agent,
    device_metadata,
    is_active,
    updated_at
  )
  VALUES (
    v_uid,
    trim(p_endpoint),
    p_p256dh,
    p_auth,
    p_user_agent,
    COALESCE(p_device_metadata, '{}'::jsonb),
    COALESCE(p_is_active, TRUE),
    NOW()
  )
  ON CONFLICT (endpoint) DO UPDATE
    SET user_id = v_uid,
        p256dh = EXCLUDED.p256dh,
        auth = EXCLUDED.auth,
        user_agent = COALESCE(EXCLUDED.user_agent, public.push_subscriptions.user_agent),
        device_metadata = COALESCE(EXCLUDED.device_metadata, public.push_subscriptions.device_metadata),
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql;

-- 2. Per-user Notification Settings & Active Chat tracking for background push filtering
CREATE TABLE IF NOT EXISTS public.user_notification_settings (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  push_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  message_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  group_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  call_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  status_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  active_chat_id UUID REFERENCES public.chats(id) ON DELETE SET NULL,
  active_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_user_notification_settings_updated_at ON public.user_notification_settings;
CREATE TRIGGER trg_user_notification_settings_updated_at
  BEFORE UPDATE ON public.user_notification_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.user_notification_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notification settings" ON public.user_notification_settings;
CREATE POLICY "Users can view own notification settings"
  ON public.user_notification_settings
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own notification settings" ON public.user_notification_settings;
CREATE POLICY "Users can insert own notification settings"
  ON public.user_notification_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notification settings" ON public.user_notification_settings;
CREATE POLICY "Users can update own notification settings"
  ON public.user_notification_settings
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
