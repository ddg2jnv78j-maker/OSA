// OSA AI GitHub agent: authenticated, admin-only, branch/PR-only source changes.
// Required Edge Function secrets: GITHUB_TOKEN, GITHUB_REPOSITORY (owner/repo).
// Never grants the model direct shell, Actions-secret, workflow, or main-branch write access.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://osa-chat.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
};
const json = (body: unknown, status = 200, origin?: string | null) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Access-Control-Allow-Origin': origin === 'https://www.osa-chat.com' ? origin : 'https://osa-chat.com', 'Content-Type': 'application/json; charset=utf-8' },
});
const allowedOrigin = (o: string | null) => !o || o === 'https://osa-chat.com' || o === 'https://www.osa-chat.com';
const ghHeaders = (token: string) => ({ Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' });
const api = 'https://api.github.com';

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  if (!allowedOrigin(origin)) return json({ error: 'Origin not allowed.' }, 403, origin);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { ...corsHeaders, 'Access-Control-Allow-Origin': origin || 'https://osa-chat.com' } });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, origin);

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ error: 'Please sign in.' }, 401, origin);
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '';
  const githubToken = Deno.env.get('GITHUB_TOKEN') || '';
  const repo = Deno.env.get('GITHUB_REPOSITORY') || '';
  if (!supabaseUrl || !anon || !githubToken || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
    return json({ error: 'GitHub agent is not configured. Set GITHUB_TOKEN and GITHUB_REPOSITORY secrets.' }, 503, origin);
  }
  const sb = createClient(supabaseUrl, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await sb.auth.getUser(token);
  if (authError || !authData.user) return json({ error: 'Session invalid or expired.' }, 401, origin);
  const { data: admin } = await sb.from('admin_users').select('user_id, role').eq('user_id', authData.user.id).maybeSingle();
  const { data: rpcAdmin } = await sb.rpc('is_admin');
  if (!admin && rpcAdmin !== true) return json({ error: 'GitHub source-code actions require an OSA administrator account.' }, 403, origin);

  let body: { action?: string; path?: string; content?: string; message?: string; confirmed?: boolean; base?: string };
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON.' }, 400, origin); }
  const action = body.action;
  const path = (body.path || '').trim();
  // Only ordinary source/config documentation files; never secrets, dependency locks, CI workflows or deployment controls.
  const safePath = /^(src\/(components|services|pages|lib|hooks)\/[A-Za-z0-9_./-]+\.(tsx?|css)|scripts\/[A-Za-z0-9_.-]+\.mjs|README\.md)$/.test(path)
    && !path.split('/').some((part) => part === '..' || part.startsWith('.'))
    && !/(secret|credential|\.env|service-account|\.jks|\.keystore|workflow|deploy|package-lock|yarn\.lock|pnpm-lock)/i.test(path);
    && !/(auth|supabase|permission|admin|privacy|security|nativeMobileBridge|pushNotification|osaService|webrtc|remoteCamera)/i.test(path);
  if (action !== 'inspect_file' && action !== 'create_change') return json({ error: 'Unsupported action.' }, 400, origin);
  if (!safePath) return json({ error: 'This path is outside the approved source-code allowlist.' }, 403, origin);

  const gh = ghHeaders(githubToken);
  const repoUrl = `${api}/repos/${repo}`;
  const base = 'main';
  const fileRes = await fetch(`${repoUrl}/contents/${encodeURIComponent(path).replace(/%2F/g, '/') }?ref=${base}`, { headers: gh });
  if (action === 'inspect_file') {
    if (fileRes.status === 404) return json({ error: 'File not found on main.' }, 404, origin);
    if (!fileRes.ok) return json({ error: 'GitHub file read failed.', status: fileRes.status }, 502, origin);
    const file = await fileRes.json();
    const decoded = typeof file.content === 'string' ? atob(file.content.replace(/\n/g, '')) : '';
    return json({ path, sha: file.sha, content: decoded, base, readOnly: true }, 200, origin);
  }

  if (body.confirmed !== true) return json({ error: 'Explicit confirmation is required before creating a source-code change.' }, 400, origin);
  if (typeof body.content !== 'string' || !body.content.trim() || body.content.length > 250000) return json({ error: 'Provide non-empty source content under 250 KB.' }, 400, origin);
  if (!fileRes.ok) return json({ error: 'Target file must already exist on main; new-file creation is disabled for safety.' }, 400, origin);
  const original = await fileRes.json();
  const currentContent = atob(String(original.content || '').replace(/\n/g, ''));
  if (currentContent === body.content) return json({ error: 'No changes detected.' }, 400, origin);

  const baseRes = await fetch(`${repoUrl}/git/ref/heads/main`, { headers: gh });
  if (!baseRes.ok) return json({ error: 'Could not resolve main branch SHA.' }, 502, origin);
  const baseRef = await baseRes.json();
  const short = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
  const branchName = `osa-ai/approved-change-${short}`;
  const createBranch = await fetch(`${repoUrl}/git/refs`, { method: 'POST', headers: gh, body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: baseRef.object.sha }) });
  if (!createBranch.ok) return json({ error: 'Could not create isolated review branch.', status: createBranch.status }, 502, origin);

  const update = await fetch(`${repoUrl}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`, {
    method: 'PUT', headers: gh,
    body: JSON.stringify({ message: (body.message || `OSA AI: update ${path}`).slice(0, 120), content: btoa(Array.from(new TextEncoder().encode(body.content), b => String.fromCharCode(b)).join('')), sha: original.sha, branch: branchName }),
  });
  if (!update.ok) {
    const detail = await update.text();
    return json({ error: 'GitHub rejected the proposed file update; the isolated branch may remain empty.', status: update.status, detail: detail.slice(0, 500) }, 502, origin);
  }
  const pr = await fetch(`${repoUrl}/pulls`, {
    method: 'POST', headers: gh,
    body: JSON.stringify({ title: (body.message || `OSA AI source change: ${path}`).slice(0, 120), head: branchName, base, body: `## OSA AI proposed change\n\n- File: \`${path}\`\n- Requested by authenticated OSA administrator.\n- Created on an isolated branch; main was not modified.\n- Review and CI are required before merge.\n\nPlease inspect the diff and CI results before merging.` }),
  });
  const prData = await pr.json().catch(() => ({}));
  if (!pr.ok) return json({ error: 'Source branch updated but pull request creation failed. No changes were made to main.', branch: branchName, status: pr.status }, 502, origin);
  return json({ success: true, branch: branchName, pullRequestUrl: prData.html_url, pullRequestNumber: prData.number, mainModified: false, requiresReview: true }, 200, origin);
});
