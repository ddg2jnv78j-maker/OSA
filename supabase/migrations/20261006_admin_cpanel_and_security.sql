-- ============================================================================
-- OSA — DATABASE MIGRATION: SECURE ADMIN / C-PANEL, MODERATION & BLOCK RLS
-- File: supabase/migrations/20261006_admin_cpanel_and_security.sql
-- Safe & Idempotent: Run this in the Supabase SQL Editor to enable the
-- RLS-protected Admin C-Panel, report/support moderation, and block enforcement.
-- ============================================================================

-- 1. Add suspension column to profiles if not already present
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_profiles_is_suspended ON public.profiles(is_suspended);

-- 2. Create admin_users table for database-enforced administrator roles
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

-- 3. Secure SECURITY DEFINER helper function: public.is_admin()
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

-- 4. Secure helper function to enforce block & suspension restrictions on messaging
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

-- 5. Admin RPC: Suspend or unsuspend a user account (enforced by public.is_admin())
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

-- 6. RLS Policies for admin_users
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

-- 7. Update MESSAGES INSERT policy to enforce block & suspension rules at DB level
DROP POLICY IF EXISTS "Chat members can send messages if not blocked" ON public.messages;
CREATE POLICY "Chat members can send messages if not blocked"
  ON public.messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.can_send_to_chat(chat_id)
  );

-- 8. Update REPORTS RLS policies so admins can view & update all reports, while normal users only see their own
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

-- 9. Update SUPPORT TICKETS RLS policies so admins can view & update all tickets, while normal users only see their own
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

-- 10. Allow Admins to update user profiles for moderation
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid() OR public.is_admin())
  WITH CHECK (id = auth.uid() OR public.is_admin());

-- ============================================================================
-- TO GRANT ADMIN ACCESS TO YOUR ACCOUNT:
-- Replace 'your-email@example.com' below and run in the Supabase SQL Editor:
--
-- INSERT INTO public.admin_users (user_id, role)
-- SELECT id, 'super_admin' FROM public.profiles WHERE email = 'mdrazuislam64@gmail.com'
-- ON CONFLICT (user_id) DO UPDATE SET role = 'super_admin';
-- ============================================================================
