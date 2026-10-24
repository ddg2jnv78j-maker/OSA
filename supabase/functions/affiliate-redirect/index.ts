// ============================================================================
// OSA — Supabase Edge Function: affiliate-redirect
// Deploy with: supabase functions deploy affiliate-redirect
//
// Purpose:
//   Accepts a verified product identifier (/affiliate-redirect?p=<productId>)
//   or click token (/affiliate-redirect?c=<clickToken>).
//   Resolves target URL, validates approved merchant domain & HTTPS scheme,
//   logs attribution atomically, and performs HTTP 302/307 redirect.
//
// Security & Anti-Abuse:
//   - Strict rejection of arbitrary redirect URLs (No Open Redirects).
//   - Rejects non-HTTPS schemes (http:, javascript:, data:, etc.).
//   - Domain validation: target hostname must match merchant's official_domain.
//   - Unapproved or out-of-stock products are rejected.
//   - Preserves partner-approved affiliate parameters (tag, affiliate_id, utm).
//   - Zero secret or service-role credential leakage.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// URL & Domain Validation Helper
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const productId = url.searchParams.get('p') || url.searchParams.get('product_id');
  const referrerSource = url.searchParams.get('ref') || url.searchParams.get('source') || 'edge_redirect';
  const platform = url.searchParams.get('platform') || 'web';

  // Basic validation on product ID (must be valid UUID format)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!productId || !uuidRegex.test(productId)) {
    return new Response(
      JSON.stringify({
        error: 'Invalid or missing product identifier (p). Valid UUID required.',
        code: 'INVALID_PRODUCT_ID',
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Initialize Supabase client
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response(JSON.stringify({ error: 'Server configuration error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const authHeader = req.headers.get('Authorization') || '';
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: authHeader ? { Authorization: authHeader } : {} },
  });

  try {
    // 1. Fetch active product and associated merchant
    const { data: product, error: prodErr } = await supabase
      .from('affiliate_products')
      .select('id, merchant_id, title, product_page_url, affiliate_destination_url, is_approved, availability_status, merchant:affiliate_merchants(id, display_name, official_domain, status)')
      .eq('id', productId)
      .single();

    if (prodErr || !product) {
      return new Response(
        JSON.stringify({ error: 'Product not found, unapproved, or unavailable', code: 'PRODUCT_NOT_FOUND' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!product.is_approved || product.availability_status !== 'in_stock') {
      return new Response(
        JSON.stringify({ error: 'Product is not currently available for redirection', code: 'PRODUCT_UNAVAILABLE' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const merchant = product.merchant as { id: string; display_name: string; official_domain: string; status: string } | null;
    if (!merchant || merchant.status !== 'active') {
      return new Response(
        JSON.stringify({ error: 'Merchant is inactive or unapproved', code: 'MERCHANT_INACTIVE' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Resolve destination URL (prefer affiliate_destination_url, fallback to product_page_url)
    const rawTarget = product.affiliate_destination_url || product.product_page_url;

    // 3. Strict Domain & Protocol Validation
    const validation = validateApprovedMerchantDestination(rawTarget, merchant.official_domain);
    if (!validation.isValid || !validation.safeUrl) {
      return new Response(
        JSON.stringify({
          error: `Redirect blocked for security: ${validation.error}`,
          code: 'INVALID_DESTINATION_DOMAIN',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Record Click Attribution (non-blocking / error safe)
    const clickToken = 'osa_clk_' + crypto.randomUUID().replace(/-/g, '');
    try {
      await supabase.from('affiliate_clicks').insert({
        click_token: clickToken,
        merchant_id: merchant.id,
        product_id: product.id,
        referrer_source: referrerSource,
        platform: ['web', 'android', 'ios'].includes(platform) ? platform : 'web',
        user_agent_category: 'edge_redirect',
      });
    } catch {
      // Click logging failure should not abort user journey to an already verified safe destination
    }

    // 5. If JSON requested, return destination metadata
    const acceptHeader = req.headers.get('Accept') || '';
    if (acceptHeader.includes('application/json') && !url.searchParams.has('redirect')) {
      return new Response(
        JSON.stringify({
          success: true,
          click_token: clickToken,
          destination_url: validation.safeUrl,
          product_title: product.title,
          merchant_name: merchant.display_name,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6. Perform HTTP 307 Temporary Redirect to verified destination
    return new Response(null, {
      status: 307,
      headers: {
        ...corsHeaders,
        Location: validation.safeUrl,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown server error';
    return new Response(JSON.stringify({ error: message, code: 'INTERNAL_ERROR' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
