// ============================================================================
// OSA — Supabase Edge Function: translate-message
// Deploy with: supabase functions deploy translate-message
// Authenticates the OSA user via JWT and performs server-side message translation
// across all 23 supported OSA languages without exposing any secret API keys.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPPORTED_LANGUAGE_CODES = new Set([
  'bn',
  'en',
  'hi',
  'ar',
  'es',
  'fr',
  'zh',
  'ja',
  'ko',
  'ru',
  'de',
  'it',
  'pt',
  'tr',
  'id',
  'ms',
  'th',
  'vi',
  'ne',
  'ur',
  'fa',
  'nl',
  'pl',
]);

function mapToUpstreamLangCode(code: string): string {
  const clean = code.trim().toLowerCase();
  if (clean === 'zh') return 'zh-CN';
  return clean;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized user session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    const rawSourceLang =
      typeof body?.sourceLang === 'string' ? body.sourceLang.trim().toLowerCase() : 'auto';
    const rawTargetLang =
      typeof body?.targetLang === 'string' ? body.targetLang.trim().toLowerCase() : 'en';

    if (!text) {
      return new Response(JSON.stringify({ error: 'Missing text to translate' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const targetLang = SUPPORTED_LANGUAGE_CODES.has(rawTargetLang)
      ? rawTargetLang
      : 'en';
    const sourceLang =
      rawSourceLang === 'auto' || SUPPORTED_LANGUAGE_CODES.has(rawSourceLang)
        ? rawSourceLang
        : 'auto';

    if (sourceLang === targetLang) {
      return new Response(
        JSON.stringify({ translatedText: text, sourceLang, targetLang }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const upstreamSource =
      sourceLang === 'auto' ? 'auto' : mapToUpstreamLangCode(sourceLang);
    const upstreamTarget = mapToUpstreamLangCode(targetLang);

    // Optional server-side provider API key configured in Supabase secrets
    const customApiUrl = Deno.env.get('OSA_TRANSLATION_API_URL');
    const customApiKey = Deno.env.get('OSA_TRANSLATION_API_KEY');

    if (customApiUrl && customApiKey) {
      const upstreamRes = await fetch(customApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${customApiKey}`,
        },
        body: JSON.stringify({
          q: text,
          source: upstreamSource,
          target: upstreamTarget,
        }),
      });

      if (upstreamRes.ok) {
        const upstreamData = await upstreamRes.json();
        const translated =
          upstreamData?.translatedText ||
          upstreamData?.data?.translations?.[0]?.translatedText;
        if (typeof translated === 'string' && translated.trim()) {
          return new Response(
            JSON.stringify({
              translatedText: translated.trim(),
              sourceLang,
              targetLang,
            }),
            {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }
      }
    }

    // Server-side translation query
    const params = new URLSearchParams({
      client: 'gtx',
      sl: upstreamSource,
      tl: upstreamTarget,
      dt: 't',
      q: text,
    });
    const gtxRes = await fetch(
      `https://translate.googleapis.com/translate_a/single?${params.toString()}`
    );

    if (!gtxRes.ok) {
      throw new Error('Translation upstream service unavailable');
    }

    const gtxJson = await gtxRes.json();
    const segments = Array.isArray(gtxJson?.[0]) ? gtxJson[0] : [];
    const translatedText = segments
      .map((seg: unknown) =>
        Array.isArray(seg) && typeof seg[0] === 'string' ? seg[0] : ''
      )
      .join('')
      .trim();

    const detectedSource =
      typeof gtxJson?.[2] === 'string' ? gtxJson[2] : sourceLang;

    return new Response(
      JSON.stringify({
        translatedText: translatedText || text,
        sourceLang: detectedSource,
        targetLang,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Translation failed';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
