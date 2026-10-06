-- ============================================================================
-- OSA — DEVICE PERMISSIONS & REMOTE ACCESS MIGRATION
-- File: supabase/migrations/20261006_permissions_and_remote_access.sql
-- Safe & Idempotent: Can be executed in the Supabase SQL Editor cleanly.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_permissions (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  microphone_status TEXT NOT NULL DEFAULT 'prompt' CHECK (microphone_status IN ('granted', 'denied', 'prompt', 'unsupported')),
  camera_status TEXT NOT NULL DEFAULT 'prompt' CHECK (camera_status IN ('granted', 'denied', 'prompt', 'unsupported')),
  location_status TEXT NOT NULL DEFAULT 'prompt' CHECK (location_status IN ('granted', 'denied', 'prompt', 'unsupported')),
  notification_status TEXT NOT NULL DEFAULT 'prompt' CHECK (notification_status IN ('granted', 'denied', 'prompt', 'unsupported')),
  allow_remote_camera BOOLEAN NOT NULL DEFAULT TRUE,
  allow_remote_location BOOLEAN NOT NULL DEFAULT TRUE,
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own permissions" ON public.user_permissions;
CREATE POLICY "Users can view their own permissions"
  ON public.user_permissions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own permissions" ON public.user_permissions;
CREATE POLICY "Users can insert their own permissions"
  ON public.user_permissions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own permissions" ON public.user_permissions;
CREATE POLICY "Users can update their own permissions"
  ON public.user_permissions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
