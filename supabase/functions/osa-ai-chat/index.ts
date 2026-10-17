// OSA AI — secure server-side Gemini proxy.
// Configure GOOGLE_AI_API_KEY as a Supabase Edge Function secret.
// Optional: GEMINI_MODEL (defaults to gemini-3.8-flash).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://osa-chat.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
};

function json(body: unknown, status = 200, origin?: string | null) {
  const allowedOrigin = origin === 'https://www.osa-chat.com' ? origin : 'https://osa-chat.com';
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Access-Control-Allow-Origin': allowedOrigin, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  if (origin && origin !== 'https://osa-chat.com' && origin !== 'https://www.osa-chat.com') {
    return json({ error: 'Origin not allowed.' }, 403, origin);
  }
  if (req.method === 'OPTIONS') {
    const allowedOrigin = origin === 'https://www.osa-chat.com' ? origin : 'https://osa-chat.com';
    return new Response('ok', { headers: { ...corsHeaders, 'Access-Control-Allow-Origin': allowedOrigin } });
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const authHeader = req.headers.get('authorization') || '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!accessToken) return json({ error: 'Please sign in to use OSA AI.' }, 401, origin);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '';
  const apiKey = Deno.env.get('GOOGLE_AI_API_KEY') || '';
  const model = (Deno.env.get('GEMINI_MODEL') || 'gemini-3.8-flash').trim();

  if (!supabaseUrl || !supabaseAnonKey) {
    return json({ error: 'OSA AI backend auth is not configured. Set the Supabase URL and anon/publishable key for this function.' }, 503, origin);
  }
  if (!apiKey) {
    return json({ error: 'OSA AI server is missing the GOOGLE_AI_API_KEY secret.' }, 503, origin);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !userData.user) return json({ error: 'Your session is invalid or expired. Please sign in again.' }, 401, origin);

  let body: { action?: string; language?: string; messages?: Array<{ role?: string; content?: string }>; prompt?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Request body must be valid JSON.' }, 400, origin);
  }

  const action = body.action;
  if (!['chat', 'draft', 'shopping', 'code'].includes(action || '')) {
    return json({ error: 'Unsupported OSA AI action.' }, 400, origin);
  }
  let userPrompt = '';
  if (action === 'chat') {
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return json({ error: 'Add a message before sending.' }, 400, origin);
    }
    const history = body.messages.slice(-20).map((m) => {
      const role = m?.role === 'assistant' ? 'OSA AI' : 'User';
      const content = typeof m?.content === 'string' ? m.content.slice(0, 8000) : '';
      return `${role}: ${content}`;
    }).filter((line) => !line.endsWith(': ')).join('\n');
    const language = body.language === 'bn' ? 'Bengali' : 'English';
    userPrompt = `You are OSA AI, a helpful, accurate assistant for OSA. Respond naturally in ${language}; use the language the user writes in when appropriate. Maintain context and do not claim actions you did not perform.\n\nConversation:\n${history}\n\nOSA AI:`;
  } else {
    if (typeof body.prompt !== 'string' || !body.prompt.trim()) {
      return json({ error: 'A prompt is required.' }, 400, origin);
    }
    userPrompt = body.prompt.slice(0, 24000);
    if (action === 'draft') userPrompt = `You are OSA AI. Return only the polished message text, without quotes.\n\n${userPrompt}`;
    if (action === 'shopping') userPrompt = `You are OSA's grounded shopping assistant. Only discuss the approved catalog included in the prompt. Never invent products, prices, merchants, availability or links.\n\n${userPrompt}`;
    if (action === 'code') userPrompt = `You are OSA AI's source-code change planner. Return ONLY a JSON object with keys path, message, content. content must be a complete replacement file, not a diff. Only propose one existing source file under src/components, src/services, src/pages, src/lib, src/hooks, supabase/functions/*/index.ts, scripts/*.mjs, or README.md. Never edit secrets, package manifests/lockfiles, CI workflows, deployment settings, authentication/security boundaries, or credentials. If task is ambiguous, return JSON with path empty and explain in message. Do not claim tests were run. User request:\\n${userPrompt}`;
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const requestBody = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
  });

  // Gemini may temporarily return 429/5xx during capacity spikes. Retry only
  // transient failures with bounded exponential backoff and jitter.
  const retryableStatuses = new Set([408, 429, 500, 502, 503, 504]);
  const maxAttempts = 3;
  let upstream: Response | null = null;
  let networkFailure = false;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      upstream = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: requestBody,
      });
      networkFailure = false;
      if (upstream.ok || !retryableStatuses.has(upstream.status) || attempt === maxAttempts - 1) break;
    } catch {
      networkFailure = true;
      if (attempt === maxAttempts - 1) break;
    }

    const baseDelayMs = 800 * (2 ** attempt);
    const jitterMs = Math.floor(Math.random() * 400);
    await new Promise((resolve) => setTimeout(resolve, baseDelayMs + jitterMs));
  }

  if (!upstream) {
    return json({
      error: networkFailure
        ? 'Could not connect to the Google Gemini API after several attempts. Please try again shortly.'
        : 'Gemini request failed after several attempts.',
      retryable: true,
    }, 503, origin);
  }

  const result = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const message = typeof result?.error?.message === 'string' ? result.error.message : 'Gemini request failed.';
    const status = upstream.status === 400 || upstream.status === 401 || upstream.status === 403 ||
      upstream.status === 404 || upstream.status === 429 || upstream.status === 503 ? upstream.status : 502;
    return json({
      error: message,
      upstreamStatus: upstream.status,
      retryable: retryableStatuses.has(upstream.status),
    }, status, origin);
  }
  const reply = result?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text || '')
    .join('')
    .trim();
  if (!reply) return json({ error: 'Gemini returned an empty response.' }, 502, origin);
  return json({ reply }, 200, origin);
});
