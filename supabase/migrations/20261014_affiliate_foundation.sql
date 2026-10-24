-- ============================================================================
-- OSA — DATABASE MIGRATION: SECURE AFFILIATE FOUNDATION
-- File: supabase/migrations/20261014_affiliate_foundation.sql
-- Safe & Idempotent: Can be run cleanly in Supabase SQL Editor or CLI.
--
-- Tables created:
--   1. public.affiliate_merchants
--   2. public.affiliate_products
--   3. public.affiliate_clicks
--   4. public.affiliate_conversions
--
-- Security:
--   - Row Level Security (RLS) enabled on all 4 tables.
--   - Public/regular authenticated users can ONLY SELECT active, approved products and active merchants.
--   - Full administrative control (INSERT/UPDATE/DELETE) restricted to authenticated admins
--     verified via public.is_admin() or server-side service role.
--   - Ordinary users have zero write, modification, or commission tampering capabilities.
-- ============================================================================

-- Ensure required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. AFFILIATE MERCHANTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.affiliate_merchants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  program_identifier TEXT NOT NULL,
  official_domain TEXT NOT NULL,
  logo_url TEXT,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending_approval', 'suspended')),
  feed_config JSONB DEFAULT '{}'::jsonb,
  commission_terms TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_merchants_slug ON public.affiliate_merchants(slug);
CREATE INDEX IF NOT EXISTS idx_affiliate_merchants_status ON public.affiliate_merchants(status);

DROP TRIGGER IF EXISTS trg_affiliate_merchants_updated_at ON public.affiliate_merchants;
CREATE TRIGGER trg_affiliate_merchants_updated_at
  BEFORE UPDATE ON public.affiliate_merchants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.affiliate_merchants ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone (anon or authenticated) can view active merchants
DROP POLICY IF EXISTS "Active merchants are viewable by everyone" ON public.affiliate_merchants;
CREATE POLICY "Active merchants are viewable by everyone"
  ON public.affiliate_merchants FOR SELECT
  USING (status = 'active');

-- Policy: Admins can view all merchants (including inactive/pending)
DROP POLICY IF EXISTS "Admins can view all merchants" ON public.affiliate_merchants;
CREATE POLICY "Admins can view all merchants"
  ON public.affiliate_merchants FOR SELECT TO authenticated
  USING (public.is_admin());

-- Policy: Only verified admins can insert merchants
DROP POLICY IF EXISTS "Only admins can insert merchants" ON public.affiliate_merchants;
CREATE POLICY "Only admins can insert merchants"
  ON public.affiliate_merchants FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

-- Policy: Only verified admins can update merchants
DROP POLICY IF EXISTS "Only admins can update merchants" ON public.affiliate_merchants;
CREATE POLICY "Only admins can update merchants"
  ON public.affiliate_merchants FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Policy: Only verified admins can delete merchants
DROP POLICY IF EXISTS "Only admins can delete merchants" ON public.affiliate_merchants;
CREATE POLICY "Only admins can delete merchants"
  ON public.affiliate_merchants FOR DELETE TO authenticated
  USING (public.is_admin());

-- ============================================================================
-- 2. AFFILIATE PRODUCTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.affiliate_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.affiliate_merchants(id) ON DELETE CASCADE,
  external_product_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT NOT NULL DEFAULT 'general',
  image_url TEXT,
  original_price NUMERIC(12, 2) CHECK (original_price >= 0),
  current_price NUMERIC(12, 2) NOT NULL CHECK (current_price >= 0),
  currency TEXT NOT NULL DEFAULT 'BDT' CHECK (char_length(currency) BETWEEN 3 AND 5),
  product_page_url TEXT NOT NULL,
  affiliate_destination_url TEXT,
  destination_metadata JSONB DEFAULT '{}'::jsonb,
  is_approved BOOLEAN NOT NULL DEFAULT TRUE,
  availability_status TEXT NOT NULL DEFAULT 'in_stock' CHECK (availability_status IN ('in_stock', 'out_of_stock', 'pre_order', 'discontinued')),
  last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(merchant_id, external_product_id)
);

CREATE INDEX IF NOT EXISTS idx_affiliate_products_merchant_id ON public.affiliate_products(merchant_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_products_category ON public.affiliate_products(category);
CREATE INDEX IF NOT EXISTS idx_affiliate_products_approved_avail ON public.affiliate_products(is_approved, availability_status);
CREATE INDEX IF NOT EXISTS idx_affiliate_products_price ON public.affiliate_products(current_price);

DROP TRIGGER IF EXISTS trg_affiliate_products_updated_at ON public.affiliate_products;
CREATE TRIGGER trg_affiliate_products_updated_at
  BEFORE UPDATE ON public.affiliate_products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.affiliate_products ENABLE ROW LEVEL SECURITY;

-- Policy: Public and authenticated users can view active, approved, in-stock products
DROP POLICY IF EXISTS "Approved in-stock products are viewable by everyone" ON public.affiliate_products;
CREATE POLICY "Approved in-stock products are viewable by everyone"
  ON public.affiliate_products FOR SELECT
  USING (
    is_approved = TRUE
    AND availability_status = 'in_stock'
    AND EXISTS (
      SELECT 1 FROM public.affiliate_merchants m
      WHERE m.id = affiliate_products.merchant_id
      AND m.status = 'active'
    )
  );

-- Policy: Admins can view all products
DROP POLICY IF EXISTS "Admins can view all products" ON public.affiliate_products;
CREATE POLICY "Admins can view all products"
  ON public.affiliate_products FOR SELECT TO authenticated
  USING (public.is_admin());

-- Policy: Only verified admins can insert products
DROP POLICY IF EXISTS "Only admins can insert products" ON public.affiliate_products;
CREATE POLICY "Only admins can insert products"
  ON public.affiliate_products FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

-- Policy: Only verified admins can update products
DROP POLICY IF EXISTS "Only admins can update products" ON public.affiliate_products;
CREATE POLICY "Only admins can update products"
  ON public.affiliate_products FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Policy: Only verified admins can delete products
DROP POLICY IF EXISTS "Only admins can delete products" ON public.affiliate_products;
CREATE POLICY "Only admins can delete products"
  ON public.affiliate_products FOR DELETE TO authenticated
  USING (public.is_admin());

-- ============================================================================
-- 3. AFFILIATE CLICKS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.affiliate_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  click_token TEXT UNIQUE NOT NULL,
  merchant_id UUID NOT NULL REFERENCES public.affiliate_merchants(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.affiliate_products(id) ON DELETE SET NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  referrer_source TEXT DEFAULT 'direct',
  platform TEXT CHECK (platform IN ('web', 'android', 'ios', 'unknown')),
  user_agent_category TEXT DEFAULT 'mobile',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_token ON public.affiliate_clicks(click_token);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_merchant_id ON public.affiliate_clicks(merchant_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_product_id ON public.affiliate_clicks(product_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_user_id ON public.affiliate_clicks(user_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_created_at ON public.affiliate_clicks(created_at);

ALTER TABLE public.affiliate_clicks ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can insert their own click event (via client or tracking redirect)
-- Privacy safeguard: user_id must either be NULL or match auth.uid()
DROP POLICY IF EXISTS "Users can record click attribution" ON public.affiliate_clicks;
CREATE POLICY "Users can record click attribution"
  ON public.affiliate_clicks FOR INSERT TO authenticated
  WITH CHECK (
    user_id IS NULL OR user_id = auth.uid()
  );

-- Policy: Anon/guest users can record anonymous click events
DROP POLICY IF EXISTS "Anon can record anonymous click events" ON public.affiliate_clicks;
CREATE POLICY "Anon can record anonymous click events"
  ON public.affiliate_clicks FOR INSERT TO anon
  WITH CHECK (
    user_id IS NULL
  );

-- Policy: Users can view their own recorded clicks
DROP POLICY IF EXISTS "Users can view own clicks" ON public.affiliate_clicks;
CREATE POLICY "Users can view own clicks"
  ON public.affiliate_clicks FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Policy: Admins can view all clicks for analytics
DROP POLICY IF EXISTS "Admins can view all clicks" ON public.affiliate_clicks;
CREATE POLICY "Admins can view all clicks"
  ON public.affiliate_clicks FOR SELECT TO authenticated
  USING (public.is_admin());

-- Policy: Click logs are immutable; no updates or deletes allowed except by admin
DROP POLICY IF EXISTS "Only admins can delete click logs" ON public.affiliate_clicks;
CREATE POLICY "Only admins can delete click logs"
  ON public.affiliate_clicks FOR DELETE TO authenticated
  USING (public.is_admin());

-- ============================================================================
-- 4. AFFILIATE CONVERSIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.affiliate_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.affiliate_merchants(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.affiliate_products(id) ON DELETE SET NULL,
  click_id UUID REFERENCES public.affiliate_clicks(id) ON DELETE SET NULL,
  external_order_id TEXT NOT NULL,
  order_amount NUMERIC(12, 2) NOT NULL CHECK (order_amount >= 0),
  commission_amount NUMERIC(12, 2) NOT NULL CHECK (commission_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'BDT' CHECK (char_length(currency) BETWEEN 3 AND 5),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'reversed', 'paid')),
  partner_event_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reconciliation_metadata JSONB DEFAULT '{}'::jsonb,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(merchant_id, external_order_id)
);

CREATE INDEX IF NOT EXISTS idx_affiliate_conversions_merchant_id ON public.affiliate_conversions(merchant_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_conversions_product_id ON public.affiliate_conversions(product_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_conversions_status ON public.affiliate_conversions(status);
CREATE INDEX IF NOT EXISTS idx_affiliate_conversions_partner_ts ON public.affiliate_conversions(partner_event_timestamp);

DROP TRIGGER IF EXISTS trg_affiliate_conversions_updated_at ON public.affiliate_conversions;
CREATE TRIGGER trg_affiliate_conversions_updated_at
  BEFORE UPDATE ON public.affiliate_conversions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.affiliate_conversions ENABLE ROW LEVEL SECURITY;

-- Strict Financial Isolation:
-- Ordinary users have NO access to conversions table (0 rows readable or writable).
-- Only verified administrators or server-side service-role can view, reconcile, or modify conversions.

DROP POLICY IF EXISTS "Only admins can view conversions" ON public.affiliate_conversions;
CREATE POLICY "Only admins can view conversions"
  ON public.affiliate_conversions FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Only admins can insert conversions" ON public.affiliate_conversions;
CREATE POLICY "Only admins can insert conversions"
  ON public.affiliate_conversions FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Only admins can update conversions" ON public.affiliate_conversions;
CREATE POLICY "Only admins can update conversions"
  ON public.affiliate_conversions FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Only admins can delete conversions" ON public.affiliate_conversions;
CREATE POLICY "Only admins can delete conversions"
  ON public.affiliate_conversions FOR DELETE TO authenticated
  USING (public.is_admin());

-- ============================================================================
-- 5. RPC HELPER: public.record_affiliate_click
-- ============================================================================
-- Atomically creates a unique click tracking record and returns destination URL
CREATE OR REPLACE FUNCTION public.record_affiliate_click(
  p_product_id UUID,
  p_referrer_source TEXT DEFAULT 'direct',
  p_platform TEXT DEFAULT 'web'
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product public.affiliate_products;
  v_merchant public.affiliate_merchants;
  v_click_token TEXT;
  v_click_id UUID;
  v_target_url TEXT;
BEGIN
  -- 1. Fetch active approved product
  SELECT * INTO v_product
  FROM public.affiliate_products
  WHERE id = p_product_id
    AND is_approved = TRUE
    AND availability_status = 'in_stock';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found or unavailable';
  END IF;

  -- 2. Fetch merchant
  SELECT * INTO v_merchant
  FROM public.affiliate_merchants
  WHERE id = v_product.merchant_id
    AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Merchant is inactive';
  END IF;

  -- 3. Determine target URL (prefer affiliate_destination_url, fallback to product_page_url)
  v_target_url := COALESCE(v_product.affiliate_destination_url, v_product.product_page_url);

  -- 4. Generate random unique click token (e.g. osa_clk_...)
  v_click_token := 'osa_clk_' || encode(gen_random_bytes(16), 'hex');

  -- 5. Insert click record
  INSERT INTO public.affiliate_clicks (
    click_token,
    merchant_id,
    product_id,
    user_id,
    referrer_source,
    platform,
    user_agent_category
  ) VALUES (
    v_click_token,
    v_merchant.id,
    v_product.id,
    auth.uid(),
    COALESCE(p_referrer_source, 'direct'),
    COALESCE(p_platform, 'unknown'),
    'app'
  )
  RETURNING id INTO v_click_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'click_id', v_click_id,
    'click_token', v_click_token,
    'destination_url', v_target_url,
    'product_title', v_product.title,
    'merchant_name', v_merchant.display_name
  );
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.record_affiliate_click(UUID, TEXT, TEXT) TO anon, authenticated;
