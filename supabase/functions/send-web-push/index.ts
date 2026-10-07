// ============================================================================
// OSA — Supabase Edge Function: send-web-push
// Deploy with: supabase functions deploy send-web-push
// Required Server-Side Secrets (Supabase Dashboard -> Edge Functions -> Secrets):
//   - VAPID_PUBLIC_KEY (or VITE_VAPID_PUBLIC_KEY)
//   - VAPID_PRIVATE_KEY (NEVER exposed to browser)
//   - VAPID_SUBJECT (e.g., mailto:support@osa-messaging.app)
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const REMOTE_SIGNAL_PREFIXES = [
  '[OSA_RCAM_SIG]',
  '[OSA_LOC_REQ]',
  '[OSA_LOC_RES]',
  '[OSA_LOC_ERR]',
];

function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

function uint8ArrayToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concatUint8Arrays(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

async function hmacSha256(keyBytes: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, data);
  return new Uint8Array(sig);
}

/**
 * Creates a signed RFC 8292 VAPID JWT (ES256) using Web Crypto API.
 */
async function createVapidAuthorizationHeader(
  endpoint: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidSubject: string
): Promise<string> {
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const exp = Math.floor(Date.now() / 1000) + 12 * 60 * 60;

  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = {
    aud: audience,
    exp,
    sub: vapidSubject,
  };

  const encoder = new TextEncoder();
  const encodedHeader = uint8ArrayToBase64Url(encoder.encode(JSON.stringify(header)));
  const encodedPayload = uint8ArrayToBase64Url(encoder.encode(JSON.stringify(payload)));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  const pubBytes = base64UrlToUint8Array(vapidPublicKey);
  if (pubBytes.length !== 65 || pubBytes[0] !== 0x04) {
    throw new Error('Invalid uncompressed P-256 VAPID public key.');
  }

  const x = uint8ArrayToBase64Url(pubBytes.slice(1, 33));
  const y = uint8ArrayToBase64Url(pubBytes.slice(33, 65));
  const d = vapidPrivateKey.trim().replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const ecPrivateKey = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x,
      y,
      d,
      ext: true,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    ecPrivateKey,
    encoder.encode(unsignedToken)
  );

  const jwt = `${unsignedToken}.${uint8ArrayToBase64Url(new Uint8Array(signatureBuffer))}`;
  return `vapid t=${jwt}, k=${vapidPublicKey}`;
}

/**
 * Encrypts a UTF-8 JSON payload according to RFC 8291 (aes128gcm Web Push Encryption).
 */
async function encryptWebPushPayload(
  plaintextJson: string,
  p256dhBase64Url: string,
  authBase64Url: string
): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const uaPublicBytes = base64UrlToUint8Array(p256dhBase64Url);
  const authSecret = base64UrlToUint8Array(authBase64Url);

  const uaPublicKey = await crypto.subtle.importKey(
    'raw',
    uaPublicBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );

  const localKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );

  const asPublicRaw = new Uint8Array(
    await crypto.subtle.exportKey('raw', localKeyPair.publicKey)
  );

  const sharedSecretBuffer = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: uaPublicKey },
    localKeyPair.privateKey,
    256
  );
  const sharedSecret = new Uint8Array(sharedSecretBuffer);

  // RFC 8291 Section 3.3: Combining Shared and Authentication Secrets
  const keyInfo = concatUint8Arrays(
    encoder.encode('WebPush: info\0'),
    uaPublicBytes,
    asPublicRaw,
    new Uint8Array([1])
  );
  const prkKey = await hmacSha256(authSecret, sharedSecret);
  const ikm = await hmacSha256(prkKey, keyInfo);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmacSha256(salt, ikm);

  const cekInfo = concatUint8Arrays(
    encoder.encode('Content-Encoding: aes128gcm\0'),
    new Uint8Array([1])
  );
  const cekFull = await hmacSha256(prk, cekInfo);
  const cek = cekFull.slice(0, 16);

  const nonceInfo = concatUint8Arrays(
    encoder.encode('Content-Encoding: nonce\0'),
    new Uint8Array([1])
  );
  const nonceFull = await hmacSha256(prk, nonceInfo);
  const nonce = nonceFull.slice(0, 12);

  // Pad plaintext with 0x02 delimiter byte
  const paddedPlaintext = concatUint8Arrays(
    encoder.encode(plaintextJson),
    new Uint8Array([2])
  );

  const aesKey = await crypto.subtle.importKey(
    'raw',
    cek,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, tagLength: 128 },
    aesKey,
    paddedPlaintext
  );

  // Construct 86-byte aes128gcm header: salt (16) + rs (4, 4096) + idlen (1, 65) + keyid (65)
  const recordSize = new Uint8Array([0x00, 0x00, 0x10, 0x00]); // 4096
  const keyIdLen = new Uint8Array([asPublicRaw.length]);
  return concatUint8Arrays(
    salt,
    recordSize,
    keyIdLen,
    asPublicRaw,
    new Uint8Array(encryptedBuffer)
  );
}

interface PushRequestBody {
  action?: 'send' | 'get_vapid_public_key';
  senderId?: string;
  recipientIds?: string[];
  type?: 'new_message' | 'group_message' | 'incoming_call' | 'missed_call' | 'status_update' | 'system';
  title?: string;
  body?: string;
  chatId?: string | null;
  callId?: string | null;
  callType?: 'audio' | 'video' | null;
  tag?: string;
  url?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const vapidPublicKey =
      Deno.env.get('VAPID_PUBLIC_KEY') ||
      Deno.env.get('VITE_VAPID_PUBLIC_KEY') ||
      '';
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') || '';
    const vapidSubject =
      Deno.env.get('VAPID_SUBJECT') || 'mailto:support@osa-messaging.app';

    const body: PushRequestBody = req.method === 'POST' ? await req.json().catch(() => ({})) : {};

    // Public VAPID key endpoint (safe for browser PushManager.subscribe; never exposes private key)
    if (body.action === 'get_vapid_public_key') {
      return new Response(
        JSON.stringify({
          vapidPublicKey: vapidPublicKey || null,
          configured: Boolean(vapidPublicKey && vapidPrivateKey),
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const bearerJwt = authHeader.replace(/^Bearer\s+/i, '').trim();
    const {
      data: { user: authUser },
    } = await userClient.auth.getUser(bearerJwt);

    const senderUserId = authUser?.id || (body.senderId && body.senderId.trim()) || '';
    if (!senderUserId) {
      return new Response(JSON.stringify({ error: 'Unauthorized user session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!vapidPublicKey || !vapidPrivateKey) {
      return new Response(
        JSON.stringify({
          sent: 0,
          skipped: true,
          reason:
            'VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be configured in Supabase Edge Function secrets.',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Never allow Remote Camera or Remote Location signals to trigger Web Push notifications
    const rawBodyText = (body.body || '').trim();
    const rawTitleText = (body.title || '').trim();
    if (
      REMOTE_SIGNAL_PREFIXES.some(
        (prefix) => rawBodyText.startsWith(prefix) || rawTitleText.startsWith(prefix)
      )
    ) {
      return new Response(
        JSON.stringify({
          sent: 0,
          skipped: true,
          reason: 'Remote Camera and Remote Location signals are isolated from Push Notifications.',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const rawRecipients = Array.isArray(body.recipientIds) ? body.recipientIds : [];
    // Never notify the sender
    const recipientIds = Array.from(
      new Set(rawRecipients.filter((id) => Boolean(id) && id !== senderUserId))
    );

    if (recipientIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0, skipped: true, reason: 'No recipients' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    // 1. Exclude blocked users (either direction)
    const { data: blockRows } = await adminClient
      .from('blocks')
      .select('blocker_id, blocked_id')
      .or(`blocker_id.eq.${senderUserId},blocked_id.eq.${senderUserId}`);

    const blockedSet = new Set<string>();
    for (const row of blockRows || []) {
      if (row.blocker_id === senderUserId) blockedSet.add(row.blocked_id);
      if (row.blocked_id === senderUserId) blockedSet.add(row.blocker_id);
    }

    let allowedIds = recipientIds.filter((id) => !blockedSet.has(id));
    if (allowedIds.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, skipped: true, reason: 'Blocked between users' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Check muted chat memberships if chatId is provided for message/group notifications
    const notifType = body.type || 'new_message';
    if (
      body.chatId &&
      (notifType === 'new_message' || notifType === 'group_message')
    ) {
      const { data: chatMembers } = await adminClient
        .from('chat_members')
        .select('user_id, is_muted')
        .eq('chat_id', body.chatId)
        .in('user_id', allowedIds);

      if (chatMembers && chatMembers.length > 0) {
        const mutedSet = new Set(
          chatMembers.filter((m) => m.is_muted).map((m) => m.user_id)
        );
        allowedIds = allowedIds.filter((id) => !mutedSet.has(id));
      }
    }

    if (allowedIds.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, skipped: true, reason: 'Conversation is muted by recipient' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Check per-user notification settings (foreground active-chat check is performed on-device in service-worker.js)
    const { data: userSettingsRows } = await adminClient
      .from('user_notification_settings')
      .select('*')
      .in('user_id', allowedIds);

    const settingsMap = new Map<string, Record<string, unknown>>();
    for (const row of userSettingsRows || []) {
      settingsMap.set(row.user_id as string, row);
    }

    allowedIds = allowedIds.filter((uid) => {
      const s = settingsMap.get(uid);
      if (!s) return true; // Default is enabled
      if (s.push_enabled === false) return false;
      if (notifType === 'new_message' && s.message_notifications === false) return false;
      if (notifType === 'group_message' && s.group_notifications === false) return false;
      if (
        (notifType === 'incoming_call' || notifType === 'missed_call') &&
        s.call_notifications === false
      ) {
        return false;
      }
      if (
        (notifType === 'status_update' || notifType === 'system') &&
        s.status_notifications === false
      ) {
        return false;
      }
      return true;
    });

    if (allowedIds.length === 0) {
      return new Response(
        JSON.stringify({
          sent: 0,
          skipped: true,
          reason: 'Filtered by user notification preferences',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Query all active push subscriptions across all devices for allowed recipients
    const { data: rawSubscriptions, error: subError } = await adminClient
      .from('push_subscriptions')
      .select('*')
      .in('user_id', allowedIds);

    const subscriptions = (rawSubscriptions || []).filter(
      (sub) => sub.is_active !== false
    );

    if (subError || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, skipped: true, reason: 'No active push subscriptions found' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build target URL respecting GitHub Pages /OSA/ base path
    const baseAppUrl = 'https://ddg2jnv78j-maker.github.io/OSA/';
    const urlParams = new URLSearchParams();
    if (body.chatId) urlParams.set('chatId', body.chatId);
    if (body.callId) urlParams.set('callId', body.callId);
    if (body.callType) urlParams.set('callType', body.callType);
    const querySuffix = urlParams.toString() ? `?${urlParams.toString()}` : '';
    const targetUrl = body.url || `${baseAppUrl}${querySuffix}`;

    const isCall = notifType === 'incoming_call';
    const pushPayload = JSON.stringify({
      title: rawTitleText || 'OSA',
      body: rawBodyText || 'You have a new message',
      icon: `${baseAppUrl}pwa-192x192.png`,
      badge: `${baseAppUrl}pwa-192x192.png`,
      tag:
        body.tag ||
        (isCall
          ? `osa-call-${body.callId || Date.now()}`
          : body.chatId
          ? `osa-chat-${body.chatId}`
          : 'osa-notification'),
      renotify: true,
      requireInteraction: isCall,
      data: {
        type: notifType,
        chatId: body.chatId || null,
        callId: body.callId || null,
        callType: body.callType || null,
        senderId: senderUserId,
        url: targetUrl,
      },
    });

    let sentCount = 0;
    let cleanedCount = 0;

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          const encryptedBody = await encryptWebPushPayload(
            pushPayload,
            sub.p256dh,
            sub.auth
          );
          const vapidAuth = await createVapidAuthorizationHeader(
            sub.endpoint,
            vapidPublicKey,
            vapidPrivateKey,
            vapidSubject
          );

          const res = await fetch(sub.endpoint, {
            method: 'POST',
            headers: {
              Authorization: vapidAuth,
              'Content-Encoding': 'aes128gcm',
              'Content-Type': 'application/octet-stream',
              TTL: isCall ? '60' : '86400',
              Urgency: isCall ? 'high' : 'normal',
            },
            body: encryptedBody,
          });

          if (res.status >= 200 && res.status < 300) {
            sentCount++;
          } else if (res.status === 404 || res.status === 410) {
            // Subscription is expired or unsubscribed — clean up automatically
            cleanedCount++;
            await adminClient
              .from('push_subscriptions')
              .update({ is_active: false, updated_at: new Date().toISOString() })
              .eq('id', sub.id);
            await adminClient.from('push_subscriptions').delete().eq('id', sub.id);
          }
        } catch {
          // Ignore individual endpoint network failure so other user devices still receive push
        }
      })
    );

    return new Response(
      JSON.stringify({
        sent: sentCount,
        cleanedInvalidSubscriptions: cleanedCount,
        totalTargetedSubscriptions: subscriptions.length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Web Push delivery failed';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
