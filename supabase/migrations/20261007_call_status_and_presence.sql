-- ============================================================================
-- OSA — REALTIME CALL STATUS & ACCURATE MULTI-DEVICE ONLINE / LAST SEEN MIGRATION
-- File: supabase/migrations/20261007_call_status_and_presence.sql
-- Safe & Idempotent: Run this script in the Supabase SQL Editor.
-- ============================================================================

-- 1. Enhance public.profiles with last_seen_at and last_heartbeat_at
-- while keeping existing is_online and last_seen columns synchronized.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ;

ALTER TABLE public.profiles
  ALTER COLUMN is_online SET DEFAULT FALSE;

UPDATE public.profiles
SET last_seen_at = COALESCE(last_seen, updated_at, created_at, NOW())
WHERE last_seen_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_last_seen_at ON public.profiles(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_last_heartbeat_at ON public.profiles(last_heartbeat_at DESC);

-- Trigger to keep last_seen and last_seen_at in sync regardless of which column is updated
CREATE OR REPLACE FUNCTION public.sync_profile_last_seen_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.last_seen_at IS DISTINCT FROM OLD.last_seen_at AND NEW.last_seen IS NOT DISTINCT FROM OLD.last_seen THEN
    NEW.last_seen = NEW.last_seen_at;
  ELSIF NEW.last_seen IS DISTINCT FROM OLD.last_seen AND NEW.last_seen_at IS NOT DISTINCT FROM OLD.last_seen_at THEN
    NEW.last_seen_at = NEW.last_seen;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_profile_last_seen ON public.profiles;
CREATE TRIGGER trg_sync_profile_last_seen
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_last_seen_columns();

-- 2. Per-Session / Multi-Device Presence Tracking Table
CREATE TABLE IF NOT EXISTS public.user_presence_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_user_presence_sessions_user_id
  ON public.user_presence_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_presence_sessions_active_hb
  ON public.user_presence_sessions(user_id, is_active, last_heartbeat_at DESC);

DROP TRIGGER IF EXISTS trg_user_presence_sessions_updated_at ON public.user_presence_sessions;
CREATE TRIGGER trg_user_presence_sessions_updated_at
  BEFORE UPDATE ON public.user_presence_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.user_presence_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view allowed presence sessions" ON public.user_presence_sessions;
CREATE POLICY "Users can view allowed presence sessions"
  ON public.user_presence_sessions
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.privacy_settings ps
      WHERE ps.user_id = public.user_presence_sessions.user_id
        AND ps.online_status = TRUE
    )
    OR NOT EXISTS (
      SELECT 1 FROM public.privacy_settings ps
      WHERE ps.user_id = public.user_presence_sessions.user_id
    )
  );

DROP POLICY IF EXISTS "Users can insert own presence sessions" ON public.user_presence_sessions;
CREATE POLICY "Users can insert own presence sessions"
  ON public.user_presence_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own presence sessions" ON public.user_presence_sessions;
CREATE POLICY "Users can update own presence sessions"
  ON public.user_presence_sessions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own presence sessions" ON public.user_presence_sessions;
CREATE POLICY "Users can delete own presence sessions"
  ON public.user_presence_sessions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 3. Secure RPC: Sync per-device session presence & multi-device Last Seen
CREATE OR REPLACE FUNCTION public.sync_user_presence(
  p_session_id TEXT,
  p_is_active BOOLEAN,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_clean_session TEXT := COALESCE(NULLIF(trim(p_session_id), ''), 'default');
  v_active_count INTEGER := 0;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Clean up expired sessions across the table (older than 45 seconds)
  DELETE FROM public.user_presence_sessions
  WHERE last_heartbeat_at < (v_now - INTERVAL '45 seconds')
     OR is_active = FALSE;

  -- Mark any profiles whose sessions have all expired as offline
  UPDATE public.profiles p
  SET is_online = FALSE,
      last_seen = COALESCE(p.last_heartbeat_at, p.last_seen_at, p.last_seen, v_now),
      last_seen_at = COALESCE(p.last_heartbeat_at, p.last_seen_at, p.last_seen, v_now),
      updated_at = v_now
  WHERE p.is_online = TRUE
    AND p.id <> v_uid
    AND (p.last_heartbeat_at IS NULL OR p.last_heartbeat_at < (v_now - INTERVAL '45 seconds'))
    AND NOT EXISTS (
      SELECT 1 FROM public.user_presence_sessions s
      WHERE s.user_id = p.id
        AND s.is_active = TRUE
        AND s.last_heartbeat_at >= (v_now - INTERVAL '45 seconds')
    );

  IF p_is_active THEN
    INSERT INTO public.user_presence_sessions (
      user_id,
      session_id,
      is_active,
      last_heartbeat_at,
      user_agent,
      updated_at
    )
    VALUES (
      v_uid,
      v_clean_session,
      TRUE,
      v_now,
      p_user_agent,
      v_now
    )
    ON CONFLICT (user_id, session_id) DO UPDATE
      SET is_active = TRUE,
          last_heartbeat_at = v_now,
          user_agent = COALESCE(EXCLUDED.user_agent, public.user_presence_sessions.user_agent),
          updated_at = v_now;

    UPDATE public.profiles
    SET is_online = TRUE,
        last_heartbeat_at = v_now,
        last_seen = v_now,
        last_seen_at = v_now,
        updated_at = v_now
    WHERE id = v_uid;

    RETURN jsonb_build_object(
      'user_id', v_uid,
      'is_online', TRUE,
      'last_seen_at', v_now
    );
  ELSE
    DELETE FROM public.user_presence_sessions
    WHERE user_id = v_uid
      AND session_id = v_clean_session;

    SELECT COUNT(*) INTO v_active_count
    FROM public.user_presence_sessions
    WHERE user_id = v_uid
      AND is_active = TRUE
      AND last_heartbeat_at >= (v_now - INTERVAL '45 seconds');

    IF v_active_count > 0 THEN
      -- Another active OSA device/tab session remains open for this user
      UPDATE public.profiles
      SET is_online = TRUE,
          updated_at = v_now
      WHERE id = v_uid;

      RETURN jsonb_build_object(
        'user_id', v_uid,
        'is_online', TRUE,
        'active_sessions', v_active_count,
        'last_seen_at', v_now
      );
    ELSE
      -- Final active session closed -> mark user Offline and record server last_seen_at
      UPDATE public.profiles
      SET is_online = FALSE,
          last_seen = v_now,
          last_seen_at = v_now,
          updated_at = v_now
      WHERE id = v_uid;

      RETURN jsonb_build_object(
        'user_id', v_uid,
        'is_online', FALSE,
        'active_sessions', 0,
        'last_seen_at', v_now
      );
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql;
