-- ============================================================================
-- OSA — NATIVE MOBILE DEVICES (ANDROID FCM / iOS APNs & VOIP CALLKIT) MIGRATION
-- File: supabase/migrations/20261007_native_devices_and_push_grouping.sql
-- Safe & Idempotent: Preserves all existing OSA tables, data, and RLS policies.
-- ============================================================================

-- 1. Create public.user_devices table for native Android (FCM) & iOS (APNs + PushKit VoIP) tokens
CREATE TABLE IF NOT EXISTS public.user_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('android', 'ios', 'web')),
  device_id TEXT NOT NULL,
  push_token TEXT,
  voip_token TEXT,
  app_version TEXT DEFAULT '1.0.0',
  device_model TEXT,
  os_version TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_user_devices_user_id
  ON public.user_devices(user_id);

CREATE INDEX IF NOT EXISTS idx_user_devices_active_user
  ON public.user_devices(user_id, is_active);

DROP TRIGGER IF EXISTS trg_user_devices_updated_at ON public.user_devices;
CREATE TRIGGER trg_user_devices_updated_at
  BEFORE UPDATE ON public.user_devices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Strict Row Level Security: users can only view and manage their own device rows
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own devices" ON public.user_devices;
CREATE POLICY "Users can view own devices"
  ON public.user_devices FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own devices" ON public.user_devices;
CREATE POLICY "Users can insert own devices"
  ON public.user_devices FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own devices" ON public.user_devices;
CREATE POLICY "Users can update own devices"
  ON public.user_devices FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own devices" ON public.user_devices;
CREATE POLICY "Users can delete own devices"
  ON public.user_devices FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- 3. Secure RPC to register or refresh a native Android/iOS device token
CREATE OR REPLACE FUNCTION public.upsert_user_device(
  p_platform TEXT,
  p_device_id TEXT,
  p_push_token TEXT DEFAULT NULL,
  p_voip_token TEXT DEFAULT NULL,
  p_app_version TEXT DEFAULT '1.0.0',
  p_device_model TEXT DEFAULT NULL,
  p_os_version TEXT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT TRUE
)
RETURNS public.user_devices
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.user_devices;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.user_devices (
    user_id,
    platform,
    device_id,
    push_token,
    voip_token,
    app_version,
    device_model,
    os_version,
    is_active,
    last_seen_at,
    updated_at
  )
  VALUES (
    v_uid,
    LOWER(TRIM(p_platform)),
    TRIM(p_device_id),
    NULLIF(TRIM(COALESCE(p_push_token, '')), ''),
    NULLIF(TRIM(COALESCE(p_voip_token, '')), ''),
    COALESCE(NULLIF(TRIM(p_app_version), ''), '1.0.0'),
    p_device_model,
    p_os_version,
    COALESCE(p_is_active, TRUE),
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id, device_id) DO UPDATE
    SET platform = EXCLUDED.platform,
        push_token = COALESCE(EXCLUDED.push_token, public.user_devices.push_token),
        voip_token = COALESCE(EXCLUDED.voip_token, public.user_devices.voip_token),
        app_version = EXCLUDED.app_version,
        device_model = COALESCE(EXCLUDED.device_model, public.user_devices.device_model),
        os_version = COALESCE(EXCLUDED.os_version, public.user_devices.os_version),
        is_active = EXCLUDED.is_active,
        last_seen_at = NOW(),
        updated_at = NOW()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql;

-- 4. Enable Realtime on public.notifications and public.calls if not already added
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.call_signals;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;
