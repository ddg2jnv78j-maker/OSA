// ============================================================================
// OSA — Supabase Edge Function: send-web-push
// Deploy with: supabase functions deploy send-web-push
// Server-Side Secrets (Supabase Dashboard -> Edge Functions -> Secrets):
//   - VAPID_PUBLIC_KEY (or VITE_VAPID_PUBLIC_KEY)
//   - VAPID_PRIVATE_KEY (NEVER exposed to browser)
//   - VAPID_SUBJECT (e.g., mailto:support@osa-messaging.app)
// ============================================================================

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

const recentEventKeys = new Map<string, number>();

function isEventRecentlyProcessed(eventKey: string): boolean {
  const now = Date.now();
  for (const [k, ts] of recentEventKeys.entries()) {
    if (now - ts > 120_000) recentEventKeys.delete(k);
  }
  if (recentEventKeys.has(eventKey)) {
    return true;
  }
  recentEventKeys.set(eventKey, now);
  return false;
}

function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const clean = base64Url.trim();
  const padding = '='.repeat((4 - (clean.length % 4)) % 4);
  const base64 = (clean + padding).replace(/-/g, '+').replace(/_/g, '/');
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

let cachedFcmAccessToken: { token: string; expiresAt: number; projectId: string } | null = null;

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const clean = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\\n/g, '')
    .replace(/\s+/g, '');
  const raw = atob(clean);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes.buffer;
}

function extractConfiguredFcmFields(): {
  projectId: string;
  clientEmail: string;
  privateKeyPem: string;
} {
  let projectId = (Deno.env.get('FCM_PROJECT_ID') || Deno.env.get('FIREBASE_PROJECT_ID') || '').trim();
  let clientEmail = (Deno.env.get('FCM_CLIENT_EMAIL') || Deno.env.get('FIREBASE_CLIENT_EMAIL') || '').trim();
  let privateKeyPem = (Deno.env.get('FCM_PRIVATE_KEY') || Deno.env.get('FIREBASE_PRIVATE_KEY') || '').trim();

  let rawJson = (
    Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON') ||
    Deno.env.get('FCM_SERVICE_ACCOUNT_JSON') ||
    Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON') ||
    ''
  ).trim();

  if (rawJson) {
    if (
      (rawJson.startsWith('"') && rawJson.endsWith('"')) ||
      (rawJson.startsWith("'") && rawJson.endsWith("'"))
    ) {
      rawJson = rawJson.slice(1, -1).trim();
    }
    if (!rawJson.startsWith('{')) {
      try {
        const decoded = atob(rawJson);
        if (decoded.trim().startsWith('{')) {
          rawJson = decoded.trim();
        }
      } catch {
        // Not base64
      }
    }
    try {
      const parsed = JSON.parse(rawJson);
      projectId = String(parsed.project_id || projectId).trim();
      clientEmail = String(parsed.client_email || clientEmail).trim();
      privateKeyPem = String(parsed.private_key || privateKeyPem).trim();
    } catch {
      const projMatch = rawJson.match(/"project_id"\s*:\s*"([^"]+)"/);
      const emailMatch = rawJson.match(/"client_email"\s*:\s*"([^"]+)"/);
      const keyMatch = rawJson.match(/"private_key"\s*:\s*"([\s\S]*?-----END PRIVATE KEY-----[\\n\s]*)"/);
      if (projMatch?.[1]) projectId = projMatch[1].trim();
      if (emailMatch?.[1]) clientEmail = emailMatch[1].trim();
      if (keyMatch?.[1]) privateKeyPem = keyMatch[1].trim();
    }
  }

  return { projectId, clientEmail, privateKeyPem };
}

async function resolveFcmV1AccessToken(
  customScope = 'https://www.googleapis.com/auth/firebase.messaging'
): Promise<{ accessToken: string; projectId: string } | null> {
  const isDefaultScope = customScope === 'https://www.googleapis.com/auth/firebase.messaging';
  if (
    isDefaultScope &&
    cachedFcmAccessToken &&
    Date.now() < cachedFcmAccessToken.expiresAt - 60_000
  ) {
    return {
      accessToken: cachedFcmAccessToken.token,
      projectId: cachedFcmAccessToken.projectId,
    };
  }

  const { projectId, clientEmail, privateKeyPem } = extractConfiguredFcmFields();

  if (!projectId || !clientEmail || !privateKeyPem) {
    return null;
  }

  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const claimSet = {
      iss: clientEmail,
      scope: customScope,
      aud: 'https://oauth2.googleapis.com/token',
      iat: nowSec,
      exp: nowSec + 3600,
    };

    const encoder = new TextEncoder();
    const encodedHeader = uint8ArrayToBase64Url(encoder.encode(JSON.stringify(header)));
    const encodedClaims = uint8ArrayToBase64Url(encoder.encode(JSON.stringify(claimSet)));
    const unsignedJwt = `${encodedHeader}.${encodedClaims}`;

    const cryptoKey = await crypto.subtle.importKey(
      'pkcs8',
      pemToArrayBuffer(privateKeyPem),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      encoder.encode(unsignedJwt)
    );
    const signedJwt = `${unsignedJwt}.${uint8ArrayToBase64Url(new Uint8Array(signature))}`;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: signedJwt,
      }).toString(),
    });

    if (!tokenRes.ok) return null;
    const tokenData = await tokenRes.json();
    if (!tokenData?.access_token) return null;

    const expiresInSec = Number(tokenData.expires_in || 3600);
    if (isDefaultScope) {
      cachedFcmAccessToken = {
        token: String(tokenData.access_token),
        expiresAt: Date.now() + expiresInSec * 1000,
        projectId,
      };
    }
    return {
      accessToken: String(tokenData.access_token),
      projectId,
    };
  } catch {
    return null;
  }
}

/**
 * Generates or retrieves server-side VAPID keys:
 * 1. Always prefers VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT from Edge Function secrets.
 * 2. If not set in env secrets, reads or generates once in `public.push_vapid_keys` via service_role.
 * NEVER exposes privateKey to clients.
 */
async function resolveServerVapidConfig(adminClient: SupabaseClient): Promise<{
  publicKey: string;
  privateKey: string;
  subject: string;
} | null> {
  const envPublic = (
    Deno.env.get('VAPID_PUBLIC_KEY') ||
    Deno.env.get('VITE_VAPID_PUBLIC_KEY') ||
    ''
  ).trim();
  const envPrivate = (Deno.env.get('VAPID_PRIVATE_KEY') || '').trim();
  const envSubject = (
    Deno.env.get('VAPID_SUBJECT') || 'mailto:support@osa-messaging.app'
  ).trim();

  if (envPublic && envPrivate) {
    return {
      publicKey: envPublic,
      privateKey: envPrivate,
      subject: envSubject,
    };
  }

  try {
    const { data: existing } = await adminClient
      .from('push_vapid_keys')
      .select('public_key, private_key, subject')
      .eq('id', 1)
      .maybeSingle();

    if (existing?.public_key && existing?.private_key) {
      return {
        publicKey: String(existing.public_key).trim(),
        privateKey: String(existing.private_key).trim(),
        subject: String(existing.subject || envSubject).trim(),
      };
    }

    // Generate a standard P-256 ECDSA VAPID keypair using Web Crypto API
    const keyPair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    );
    const rawPublic = new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey));
    const jwkPrivate = await crypto.subtle.exportKey('jwk', keyPair.privateKey);

    if (rawPublic.length === 65 && jwkPrivate.d) {
      const publicKey = uint8ArrayToBase64Url(rawPublic);
      const privateKey = jwkPrivate.d;

      await adminClient.from('push_vapid_keys').upsert(
        {
          id: 1,
          public_key: publicKey,
          private_key: privateKey,
          subject: envSubject,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );

      return {
        publicKey,
        privateKey,
        subject: envSubject,
      };
    }
  } catch {
    // Table not yet created or permission error
  }

  return null;
}

/**
 * Creates a signed HMAC token allowing the Service Worker to reject an incoming call
 * directly when the user taps [ Reject ] on a closed-app notification.
 */
async function createCallRejectToken(
  callId: string,
  receiverId: string,
  callerId: string,
  secretKey: string
): Promise<string> {
  const encoder = new TextEncoder();
  const exp = Math.floor(Date.now() / 1000) + 180; // Valid for 3 minutes
  const dataStr = `${callId}:${receiverId}:${callerId}:${exp}`;
  const sigBytes = await hmacSha256(encoder.encode(secretKey), encoder.encode(dataStr));
  return `${exp}.${uint8ArrayToBase64Url(sigBytes)}`;
}

async function verifyCallRejectToken(
  token: string,
  callId: string,
  receiverId: string,
  callerId: string,
  secretKey: string
): Promise<boolean> {
  if (!token || !token.includes('.')) return false;
  const [expStr, providedSig] = token.split('.');
  const exp = Number(expStr);
  if (!exp || Number.isNaN(exp) || Math.floor(Date.now() / 1000) > exp) {
    return false;
  }
  const encoder = new TextEncoder();
  const dataStr = `${callId}:${receiverId}:${callerId}:${exp}`;
  const expectedSigBytes = await hmacSha256(encoder.encode(secretKey), encoder.encode(dataStr));
  const expectedSig = uint8ArrayToBase64Url(expectedSigBytes);
  return expectedSig === providedSig;
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

function formatMediaPreviewBody(
  messageType: string | null | undefined,
  rawBody: string
): string {
  const mt = (messageType || '').toLowerCase();
  if (mt === 'image') return 'Photo';
  if (mt === 'video') return 'Video';
  if (mt === 'audio') return 'Voice message';
  if (mt === 'document') return 'File';

  if (rawBody.startsWith('[IMAGE]')) return 'Photo';
  if (rawBody.startsWith('[VIDEO]')) return 'Video';
  if (rawBody.startsWith('[AUDIO]')) return 'Voice message';
  if (rawBody.startsWith('[DOCUMENT]')) return 'File';

  return rawBody || 'New message';
}

interface PushRequestBody {
  action?: 'send' | 'get_vapid_public_key' | 'reject_call' | 'verify_and_sync_android_fcm';
  extraSha1s?: string[];
  senderId?: string;
  senderName?: string;
  recipientIds?: string[];
  type?:
    | 'message'
    | 'new_message'
    | 'group_message'
    | 'incoming_call'
    | 'cancel_call'
    | 'missed_call'
    | 'status_update'
    | 'system'
    | 'INSERT'
    | 'UPDATE';
  table?: string;
  record?: Record<string, unknown>;
  title?: string;
  body?: string;
  chatId?: string | null;
  conversationId?: string | null;
  messageId?: string | null;
  messageType?: string | null;
  messageCount?: number | null;
  callId?: string | null;
  callType?: 'audio' | 'video' | null;
  callerId?: string | null;
  callerName?: string | null;
  callerAvatar?: string | null;
  rejectToken?: string | null;
  tag?: string;
  url?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);
    const body: PushRequestBody =
      req.method === 'POST' ? await req.json().catch(() => ({})) : {};

    const vapidConfig = await resolveServerVapidConfig(adminClient);

    // 1. Public VAPID key endpoint (safe for browser PushManager.subscribe; never exposes private key)
    if (body.action === 'get_vapid_public_key') {
      const fcmFields = extractConfiguredFcmFields();
      const fcmAuth = fcmFields.projectId ? await resolveFcmV1AccessToken() : null;
      return new Response(
        JSON.stringify({
          vapidPublicKey: vapidConfig?.publicKey || null,
          configured: Boolean(vapidConfig?.publicKey && vapidConfig?.privateKey),
          fcmConfigured: Boolean(fcmAuth?.accessToken && fcmAuth?.projectId),
          fcmProjectId: fcmAuth?.projectId || fcmFields.projectId || null,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 1b. Verify and synchronize Android API Key SHA-1 fingerprints & validate registered device tokens
    if (body.action === 'verify_and_sync_android_fcm') {
      const cloudAuth = await resolveFcmV1AccessToken(
        'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/firebase https://www.googleapis.com/auth/firebase.messaging'
      );
      const fcmAuth = await resolveFcmV1AccessToken();
      const requiredSha1s = Array.from(
        new Set([
          'C8:F9:A0:D5:01:3F:CB:61:E4:AD:93:45:A6:8C:9F:39:12:B2:2D:8B',
          'D2:A8:4F:20:FC:36:04:12:DB:1E:EA:82:DF:3D:0A:0D:1E:3E:B5:88',
          'DA:23:0B:6D:9D:BF:06:16:08:7A:A0:41:5E:E0:C2:BC:10:64:AD:C6',
          'BA:89:DF:3A:DC:13:AC:C0:4D:82:F3:92:13:94:52:4B:DF:6B:33:A7',
          '38:B7:D4:8B:63:48:66:58:E3:49:62:6A:61:70:C8:58:23:81:67:AC',
          ...(Array.isArray(body.extraSha1s) ? body.extraSha1s : []),
        ])
      );

      let keySyncStatus: Record<string, unknown> = { synced: false };
      if (cloudAuth?.accessToken) {
        try {
          const keyName = 'projects/935163585205/locations/global/keys/osa-android-fcm-key-v2';
          const getKeyRes = await fetch(`https://apikeys.googleapis.com/v2/${keyName}`, {
            headers: { Authorization: `Bearer ${cloudAuth.accessToken}` },
          });
          const currentKey = await getKeyRes.json();
          const apiTargets = currentKey?.restrictions?.apiTargets || [
            { service: 'firebaseinstallations.googleapis.com' },
            { service: 'fcmregistrations.googleapis.com' },
            { service: 'firebase.googleapis.com' },
            { service: 'firebaselogging-pa.googleapis.com' },
          ];
          const patchRes = await fetch(
            `https://apikeys.googleapis.com/v2/${keyName}?updateMask=restrictions`,
            {
              method: 'PATCH',
              headers: {
                Authorization: `Bearer ${cloudAuth.accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                restrictions: {
                  androidKeyRestrictions: {
                    allowedApplications: requiredSha1s.map((sha1Fingerprint) => ({
                      packageName: 'app.osa.messaging',
                      sha1Fingerprint,
                    })),
                  },
                  apiTargets,
                },
              }),
            }
          );
          const patchData = await patchRes.json();
          keySyncStatus = {
            synced: patchRes.ok,
            status: patchRes.status,
            allowedApplicationsCount: requiredSha1s.length,
            operation: patchData?.name || null,
          };

          // Also ensure SHA-1s are registered on Firebase Android App
          const appShaUrl =
            'https://firebase.googleapis.com/v1beta1/projects/osa-app-88c1e/androidApps/1:935163585205:android:b677da9c8886d371a76a61/sha';
          for (const sha1 of requiredSha1s) {
            await fetch(appShaUrl, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${cloudAuth.accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                shaHash: sha1.replace(/:/g, '').toLowerCase(),
                certType: 'SHA_1',
              }),
            }).catch(() => {});
          }
        } catch (e) {
          keySyncStatus = {
            synced: false,
            error: e instanceof Error ? e.message : String(e),
          };
        }
      }

      const { data: devices } = await adminClient
        .from('user_devices')
        .select('id, user_id, platform, device_id, device_model, os_version, is_active, updated_at, push_token')
        .eq('platform', 'android');

      const tokenChecks: Array<Record<string, unknown>> = [];
      if (fcmAuth?.accessToken && devices) {
        for (const dev of devices) {
          const checkRes = await fetch(
            `https://fcm.googleapis.com/v1/projects/${fcmAuth.projectId}/messages:send`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${fcmAuth.accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                validate_only: true,
                message: {
                  token: dev.push_token,
                  notification: {
                    title: 'OSA',
                    body: 'Validation check',
                  },
                  data: { type: 'ping' },
                  android: {
                    priority: 'HIGH',
                    ttl: '60s',
                    collapse_key: 'osa-ping',
                    notification: {
                      channel_id: 'osa_messages_high_v2',
                      tag: 'osa-ping',
                      sound: 'default',
                      default_sound: true,
                      default_vibrate_timings: true,
                      notification_priority: 'PRIORITY_MAX',
                      visibility: 'PUBLIC',
                    },
                  },
                },
              }),
            }
          );
          const checkJson = await checkRes.json().catch(() => ({}));
          tokenChecks.push({
            id: dev.id,
            user_id: dev.user_id,
            device_id: dev.device_id,
            device_model: dev.device_model,
            is_active: dev.is_active,
            updated_at: dev.updated_at,
            fcmStatus: checkRes.status,
            fcmOk: checkRes.ok,
            fcmError: checkRes.ok ? null : checkJson?.error?.message || checkJson,
          });
        }
      }

      return new Response(
        JSON.stringify({
          keySyncStatus,
          tokenChecks,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 2. Closed-App Incoming Call Reject Action from Service Worker notificationclick
    if (body.action === 'reject_call' && body.callId) {
      const callId = String(body.callId).trim();
      const { data: callRow } = await adminClient
        .from('calls')
        .select('id, caller_id, receiver_id, status')
        .eq('id', callId)
        .maybeSingle();

      if (!callRow) {
        return new Response(JSON.stringify({ rejected: false, error: 'Call not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let authorized = false;
      const rejectSigningSecret =
        vapidConfig?.privateKey || supabaseServiceRoleKey || 'osa-call-reject-secret';
      if (body.rejectToken) {
        authorized = await verifyCallRejectToken(
          String(body.rejectToken),
          callRow.id,
          callRow.receiver_id,
          callRow.caller_id,
          rejectSigningSecret
        );
      }

      const authHeader = req.headers.get('Authorization') || '';
      if (!authorized && authHeader) {
        const bearerJwt = authHeader.replace(/^Bearer\s+/i, '').trim();
        const userClient = createClient(supabaseUrl, supabaseAnonKey, {
          global: { headers: { Authorization: authHeader } },
        });
        const {
          data: { user: authUser },
        } = await userClient.auth.getUser(bearerJwt);
        if (authUser?.id === callRow.receiver_id) {
          authorized = true;
        }
      }

      if (!authorized) {
        return new Response(JSON.stringify({ error: 'Unauthorized call reject action' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const nowIso = new Date().toISOString();
      await adminClient
        .from('calls')
        .update({
          status: 'rejected',
          ended_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', callRow.id);

      await adminClient.from('call_signals').insert({
        call_id: callRow.id,
        sender_id: callRow.receiver_id,
        receiver_id: callRow.caller_id,
        signal_type: 'reject',
        payload: { source: 'push_notification' },
      });

      return new Response(JSON.stringify({ rejected: true, callId: callRow.id }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Authenticate sender or database webhook
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const bearerJwt = authHeader.replace(/^Bearer\s+/i, '').trim();
    let senderUserId = '';

    // Support both Supabase Database Webhooks (service_role) and authenticated client sessions
    if (supabaseServiceRoleKey && bearerJwt === supabaseServiceRoleKey) {
      if (body.record && typeof body.record === 'object') {
        senderUserId = String(
          body.record.sender_id || body.record.caller_id || body.record.actor_id || ''
        );
      } else if (body.senderId) {
        senderUserId = String(body.senderId).trim();
      }
    } else {
      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const {
        data: { user: authUser },
      } = await userClient.auth.getUser(bearerJwt);
      senderUserId = authUser?.id || (body.senderId && body.senderId.trim()) || '';
    }

    // Normalize Database Webhook / pg_net trigger payloads on messages or calls
    if (
      (body.type === 'INSERT' || body.type === 'UPDATE') &&
      body.record &&
      typeof body.record === 'object'
    ) {
      const rec = body.record;
      if (body.table === 'messages' && rec.id) {
        const { data: verifiedMsg } = await adminClient
          .from('messages')
          .select('id, chat_id, sender_id, content, message_type')
          .eq('id', String(rec.id))
          .maybeSingle();
        if (verifiedMsg) {
          body.type = 'message';
          body.messageId = String(verifiedMsg.id);
          body.chatId = String(verifiedMsg.chat_id);
          body.conversationId = String(verifiedMsg.chat_id);
          body.messageType = String(verifiedMsg.message_type || 'text');
          body.body = String(verifiedMsg.content || '');
          senderUserId = String(verifiedMsg.sender_id);
        }
      } else if (body.table === 'calls' && rec.id) {
        const { data: verifiedCall } = await adminClient
          .from('calls')
          .select('id, chat_id, caller_id, receiver_id, call_type, status')
          .eq('id', String(rec.id))
          .maybeSingle();
        if (verifiedCall) {
          const st = String(verifiedCall.status || '');
          if (body.type === 'UPDATE' && ['ended', 'missed', 'rejected', 'cancelled'].includes(st)) {
            body.type = 'cancel_call';
          } else {
            body.type = 'incoming_call';
          }
          body.callId = String(verifiedCall.id);
          body.callType = (verifiedCall.call_type === 'video' ? 'video' : 'audio') as
            | 'audio'
            | 'video';
          body.chatId = verifiedCall.chat_id ? String(verifiedCall.chat_id) : null;
          body.callerId = String(verifiedCall.caller_id);
          body.recipientIds = verifiedCall.receiver_id ? [String(verifiedCall.receiver_id)] : [];
          senderUserId = String(verifiedCall.caller_id);
        }
      }
    }

    if (!senderUserId) {
      return new Response(JSON.stringify({ error: 'Unauthorized user session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const hasVapidKeys = Boolean(vapidConfig && vapidConfig.publicKey && vapidConfig.privateKey);
    const rejectSigningSecret =
      vapidConfig?.privateKey || supabaseServiceRoleKey || 'osa-call-reject-secret';

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

    const resolvedChatId = (body.conversationId || body.chatId || '').trim() || null;
    const rawType = body.type || 'new_message';
    const isMessagePush =
      rawType === 'message' || rawType === 'new_message' || rawType === 'group_message';
    const isIncomingCall = rawType === 'incoming_call';
    const isCancelCall = rawType === 'cancel_call';

    // Deduplicate by messageId or callId so we never send two push notifications for the same event,
    // while keeping different callIds completely separate.
    const dedupKey =
      isMessagePush && body.messageId && (!body.messageCount || body.messageCount <= 1)
        ? `msg:${body.messageId}`
        : isIncomingCall && body.callId
        ? `call:${body.callId}:incoming`
        : isCancelCall && body.callId
        ? `call:${body.callId}:cancel`
        : null;

    if (dedupKey) {
      if (isEventRecentlyProcessed(dedupKey)) {
        return new Response(
          JSON.stringify({ sent: 0, skipped: true, deduplicated: true, eventKey: dedupKey }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      try {
        const { error: logErr } = await adminClient
          .from('push_delivery_log')
          .insert({ event_key: dedupKey });
        if (logErr) {
          return new Response(
            JSON.stringify({ sent: 0, skipped: true, deduplicated: true, eventKey: dedupKey }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch {
        // Ignore if push_delivery_log migration is not applied yet
      }
    }

    // Look up sender profile name & avatar
    let senderDisplayName = (body.senderName || body.callerName || '').trim();
    let senderAvatarUrl = (body.callerAvatar || '').trim() || null;
    const { data: senderProfile } = await adminClient
      .from('profiles')
      .select('full_name, avatar_url')
      .eq('id', senderUserId)
      .maybeSingle();

    if (!senderDisplayName) {
      senderDisplayName = (senderProfile?.full_name || '').trim() || 'OSA User';
    }
    if (!senderAvatarUrl && senderProfile?.avatar_url) {
      senderAvatarUrl = String(senderProfile.avatar_url);
    }

    // Resolve recipients & per-recipient unread counts from chat_members
    let rawRecipients = Array.isArray(body.recipientIds) ? body.recipientIds : [];
    let isGroupConversation = rawType === 'group_message';
    let groupTitle = '';
    const unreadCountByUser = new Map<string, number>();

    if (resolvedChatId && (rawRecipients.length === 0 || isMessagePush)) {
      const [{ data: chatRow }, { data: memberRows }] = await Promise.all([
        adminClient
          .from('chats')
          .select('id, type, group_id')
          .eq('id', resolvedChatId)
          .maybeSingle(),
        adminClient
          .from('chat_members')
          .select('user_id, is_muted, unread_count')
          .eq('chat_id', resolvedChatId)
          .neq('user_id', senderUserId),
      ]);

      if (chatRow?.type === 'group') {
        isGroupConversation = true;
        if (chatRow.group_id) {
          const { data: grp } = await adminClient
            .from('groups')
            .select('name')
            .eq('id', chatRow.group_id)
            .maybeSingle();
          groupTitle = (grp?.name || '').trim();
        }
      }

      for (const m of memberRows || []) {
        const uid = String(m.user_id);
        const dbUnread = Number(m.unread_count || 1);
        unreadCountByUser.set(uid, Math.max(1, body.messageCount || dbUnread));
      }

      if (rawRecipients.length === 0 && memberRows) {
        rawRecipients = memberRows
          .filter((m) => !m.is_muted)
          .map((m) => String(m.user_id));
      }
    }

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
    if (resolvedChatId && isMessagePush) {
      const { data: chatMembers } = await adminClient
        .from('chat_members')
        .select('user_id, is_muted')
        .eq('chat_id', resolvedChatId)
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

    // 3. Check per-user notification settings
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
      if (!s) return true;
      if (s.push_enabled === false) return false;
      if (isMessagePush && !isGroupConversation && s.message_notifications === false) {
        return false;
      }
      if (isMessagePush && isGroupConversation && s.group_notifications === false) {
        return false;
      }
      if (
        (isIncomingCall || isCancelCall || rawType === 'missed_call') &&
        s.call_notifications === false
      ) {
        return false;
      }
      if (
        (rawType === 'status_update' || rawType === 'system') &&
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

    // 4. Query both Web Push subscriptions and Native Mobile Devices (Android FCM & iOS APNs/VoIP)
    const [{ data: rawSubscriptions }, { data: rawNativeDevices }] = await Promise.all([
      adminClient.from('push_subscriptions').select('*').in('user_id', allowedIds),
      adminClient
        .from('user_devices')
        .select('*')
        .in('user_id', allowedIds)
        .eq('is_active', true),
    ]);

    const subscriptions = (rawSubscriptions || []).filter(
      (sub) => sub.is_active !== false
    );
    const nativeDevices = rawNativeDevices || [];

    if (subscriptions.length === 0 && nativeDevices.length === 0) {
      return new Response(
        JSON.stringify({
          sent: 0,
          skipped: true,
          reason: 'No active Web Push subscriptions or native devices found',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Build target URL & payload for Message vs Audio/Video Call
    const baseAppUrl = 'https://ddg2jnv78j-maker.github.io/OSA/';
    const urlParams = new URLSearchParams();
    if (resolvedChatId) urlParams.set('chatId', resolvedChatId);
    if (body.callId) urlParams.set('callId', body.callId);
    if (body.callType) urlParams.set('callType', body.callType);
    const querySuffix = urlParams.toString() ? `?${urlParams.toString()}` : '';
    const targetUrl = body.url || `${baseAppUrl}${querySuffix}`;

    const resolvedCallType: 'audio' | 'video' =
      body.callType === 'video' || rawTitleText.toLowerCase().includes('video')
        ? 'video'
        : 'audio';

    const senderHeader =
      isGroupConversation && groupTitle
        ? `${senderDisplayName} (${groupTitle})`
        : senderDisplayName;

    const previewLine = formatMediaPreviewBody(body.messageType, rawBodyText);

    const buildUserMessageTitleAndBody = (recipientId: string) => {
      const count = Math.max(
        1,
        Number(body.messageCount || unreadCountByUser.get(recipientId) || 1)
      );
      if (count >= 2) {
        return {
          title: 'OSA',
          body: `${senderHeader}\n${count} new messages`,
          messageCount: count,
        };
      }
      return {
        title: 'OSA',
        body: `${senderHeader}\n${previewLine}`,
        messageCount: 1,
      };
    };

    const callNotificationTitle =
      resolvedCallType === 'video' ? 'Incoming video call' : 'Incoming audio call';
    const callNotificationBody = `${senderDisplayName} is calling you`;

    let sentCount = 0;
    let nativeSentCount = 0;
    let cleanedCount = 0;

    // 6. Deliver Web Push to all active browser/PWA subscriptions
    if (hasVapidKeys && vapidConfig) {
      await Promise.all(
        subscriptions.map(async (sub) => {
          try {
            const recipientUid = String(sub.user_id);
            let rejectToken: string | null = null;
            if ((isIncomingCall || isCancelCall) && body.callId) {
              rejectToken = await createCallRejectToken(
                body.callId,
                recipientUid,
                senderUserId,
                rejectSigningSecret
              );
            }

          const msgFormatted = buildUserMessageTitleAndBody(recipientUid);
          const notificationTag =
            body.tag ||
            (isIncomingCall || isCancelCall
              ? `osa-call-${body.callId || Date.now()}`
              : resolvedChatId
              ? `osa-chat-${resolvedChatId}`
              : body.messageId
              ? `osa-msg-${body.messageId}`
              : 'osa-notification');

          const payloadType = isCancelCall
            ? 'cancel_call'
            : isIncomingCall
            ? 'incoming_call'
            : isMessagePush
            ? 'message'
            : rawType;

          const pushPayloadObj =
            isIncomingCall || isCancelCall
              ? {
                  type: payloadType,
                  callType: resolvedCallType,
                  callId: body.callId || null,
                  callerId: senderUserId,
                  callerName: senderDisplayName,
                  callerAvatar: senderAvatarUrl,
                  title: callNotificationTitle,
                  body: callNotificationBody,
                  icon: senderAvatarUrl || `${baseAppUrl}pwa-192x192.png`,
                  badge: `${baseAppUrl}pwa-192x192.png`,
                  tag: notificationTag,
                  renotify: true,
                  requireInteraction: isIncomingCall,
                  data: {
                    type: payloadType,
                    callType: resolvedCallType,
                    callId: body.callId || null,
                    callerId: senderUserId,
                    callerName: senderDisplayName,
                    callerAvatar: senderAvatarUrl,
                    chatId: resolvedChatId,
                    conversationId: resolvedChatId,
                    rejectToken,
                    rejectEndpoint: `${supabaseUrl}/functions/v1/send-web-push`,
                    anonKey: supabaseAnonKey,
                    url: targetUrl,
                  },
                }
              : {
                  type: payloadType,
                  conversationId: resolvedChatId,
                  chatId: resolvedChatId,
                  senderId: senderUserId,
                  senderName: senderHeader,
                  messageId: body.messageId || null,
                  messageCount: msgFormatted.messageCount,
                  latestPreview: previewLine,
                  title: msgFormatted.title,
                  body: msgFormatted.body,
                  icon: senderAvatarUrl || `${baseAppUrl}pwa-192x192.png`,
                  badge: `${baseAppUrl}pwa-192x192.png`,
                  tag: notificationTag,
                  renotify: true,
                  requireInteraction: false,
                  data: {
                    type: payloadType,
                    conversationId: resolvedChatId,
                    chatId: resolvedChatId,
                    threadId: resolvedChatId,
                    senderId: senderUserId,
                    senderName: senderHeader,
                    messageId: body.messageId || null,
                    messageCount: msgFormatted.messageCount,
                    latestPreview: previewLine,
                    url: targetUrl,
                  },
                };

          const encryptedBody = await encryptWebPushPayload(
            JSON.stringify(pushPayloadObj),
            sub.p256dh,
            sub.auth
          );
          const vapidAuth = await createVapidAuthorizationHeader(
            sub.endpoint,
            vapidConfig.publicKey,
            vapidConfig.privateKey,
            vapidConfig.subject
          );

          const res = await fetch(sub.endpoint, {
            method: 'POST',
            headers: {
              Authorization: vapidAuth,
              'Content-Encoding': 'aes128gcm',
              'Content-Type': 'application/octet-stream',
              TTL: isIncomingCall || isCancelCall ? '60' : '86400',
              Urgency: isIncomingCall || isCancelCall ? 'high' : 'normal',
            },
            body: encryptedBody,
          });

          if (res.status >= 200 && res.status < 300) {
            sentCount++;
          } else if (res.status === 401 || res.status === 403 || res.status === 404 || res.status === 410) {
            cleanedCount++;
            await adminClient
              .from('push_subscriptions')
              .update({ is_active: false, updated_at: new Date().toISOString() })
              .eq('id', sub.id);
            await adminClient.from('push_subscriptions').delete().eq('id', sub.id);
          }
        } catch {
          // Ignore individual endpoint network failure
        }
      })
    );
    }

    // 7. Deliver to Native Android (FCM HTTP v1 & Legacy FCM) and iOS (APNs / PushKit VoIP) registered in public.user_devices
    const fcmServerKey = (Deno.env.get('FCM_SERVER_KEY') || '').trim();
    const fcmV1Auth = nativeDevices.some((d) => d.platform === 'android')
      ? await resolveFcmV1AccessToken()
      : null;
    const apnsAuthToken = (Deno.env.get('APNS_BEARER_TOKEN') || '').trim();
    const apnsBundleId = (Deno.env.get('APNS_BUNDLE_ID') || 'app.osa.messaging').trim();

    if (nativeDevices.length > 0 && (fcmV1Auth || fcmServerKey || apnsAuthToken)) {
      await Promise.all(
        nativeDevices.map(async (dev) => {
          try {
            const recipientUid = String(dev.user_id);
            const msgFormatted = buildUserMessageTitleAndBody(recipientUid);
            let rejectToken: string | null = null;
            if ((isIncomingCall || isCancelCall) && body.callId) {
              rejectToken = await createCallRejectToken(
                body.callId,
                recipientUid,
                senderUserId,
                rejectSigningSecret
              );
            }

            if (dev.platform === 'android' && dev.push_token) {
              const dataStrings: Record<string, string> = {
                type: isCancelCall
                  ? 'cancel_call'
                  : isIncomingCall
                  ? 'incoming_call'
                  : 'message',
                title: isIncomingCall ? callNotificationTitle : msgFormatted.title,
                body: isIncomingCall ? callNotificationBody : msgFormatted.body,
                senderId: senderUserId,
                senderName: senderHeader,
                callerId: senderUserId,
                callerName: senderDisplayName,
                callerAvatar: senderAvatarUrl || '',
                conversationId: resolvedChatId || '',
                chatId: resolvedChatId || '',
                messageId: body.messageId || '',
                messageCount: String(msgFormatted.messageCount),
                unreadCount: String(msgFormatted.messageCount),
                messagePreview: previewLine,
                latestPreview: previewLine,
                callId: body.callId || '',
                callType: resolvedCallType,
                rejectToken: rejectToken || '',
                rejectEndpoint: `${supabaseUrl}/functions/v1/send-web-push`,
                anonKey: supabaseAnonKey,
              };

              let deliveredAndroid = false;

              // 7a. Prefer Firebase Cloud Messaging HTTP v1 API if service account is configured
              if (fcmV1Auth) {
                const fcmEndpoint = `https://fcm.googleapis.com/v1/projects/${fcmV1Auth.projectId}/messages:send`;
                const fcmHeaders = {
                  Authorization: `Bearer ${fcmV1Auth.accessToken}`,
                  'Content-Type': 'application/json',
                };

                // Packet 1: System-tray guaranteed notification payload handled directly by Google Play Services
                // even when the app is swiped closed or force-stopped by OEM battery savers (TECNO, Xiaomi, etc.).
                // Sent FIRST at (tag: sysTag, id: 0) so that when Packet 2 wakes OSAFirebaseMessagingService /
                // OSACallNotificationService milliseconds later, the native service either upgrades (tag, 0)
                // in-place (for messages) or cancels (tag, 0) and starts full-screen call ringing (for calls).
                if (!isCancelCall && (isMessagePush || isIncomingCall)) {
                  const sysTitle = isIncomingCall ? callNotificationTitle : msgFormatted.title;
                  const sysBody = isIncomingCall ? callNotificationBody : msgFormatted.body;
                  const sysChannelId = isIncomingCall
                    ? 'osa_incoming_calls_high_v2'
                    : 'osa_messages_high_v2';
                  const sysTag = isIncomingCall
                    ? `osa-call-${body.callId || senderUserId}`
                    : `osa-chat-${resolvedChatId || senderUserId}`;

                  const sysNotifRes = await fetch(fcmEndpoint, {
                    method: 'POST',
                    headers: fcmHeaders,
                    body: JSON.stringify({
                      message: {
                        token: dev.push_token,
                        notification: {
                          title: sysTitle,
                          body: sysBody,
                        },
                        data: dataStrings,
                        android: {
                          priority: 'HIGH',
                          ttl: isIncomingCall ? '35s' : '86400s',
                          collapse_key: sysTag,
                          notification: {
                            channel_id: sysChannelId,
                            tag: sysTag,
                            sound: 'default',
                            default_sound: true,
                            default_vibrate_timings: true,
                            notification_priority: 'PRIORITY_MAX',
                            visibility: 'PUBLIC',
                          },
                        },
                      },
                    }),
                  });
                  if (sysNotifRes.ok) {
                    deliveredAndroid = true;
                    nativeSentCount++;
                  } else if (sysNotifRes.status === 404) {
                    const errBody = await sysNotifRes.text().catch(() => '');
                    if (errBody.includes('UNREGISTERED')) {
                      await adminClient
                        .from('user_devices')
                        .update({ is_active: false, updated_at: new Date().toISOString() })
                        .eq('id', dev.id);
                    }
                  }
                }

                // Packet 2: High-priority data-only FCM message to wake OSAFirebaseMessagingService
                // (starts OSACallNotificationService for incoming calls, stops it for cancel_call,
                // or upgrades the message notification to rich InboxStyle).
                const dataOnlyRes = await fetch(fcmEndpoint, {
                  method: 'POST',
                  headers: fcmHeaders,
                  body: JSON.stringify({
                    message: {
                      token: dev.push_token,
                      data: dataStrings,
                      android: {
                        priority: 'HIGH',
                        ttl: isIncomingCall || isCancelCall ? '60s' : '86400s',
                      },
                    },
                  }),
                });

                if (dataOnlyRes.ok && !deliveredAndroid) {
                  deliveredAndroid = true;
                  nativeSentCount++;
                } else if (dataOnlyRes.status === 404) {
                  const errBody = await dataOnlyRes.text().catch(() => '');
                  if (errBody.includes('UNREGISTERED')) {
                    await adminClient
                      .from('user_devices')
                      .update({ is_active: false, updated_at: new Date().toISOString() })
                      .eq('id', dev.id);
                  }
                }
              }

              // 7b. Fallback to FCM Legacy HTTP API if FCM_SERVER_KEY is configured
              if (!deliveredAndroid && fcmServerKey) {
                const fcmPayload = {
                  to: dev.push_token,
                  priority: 'high',
                  data: dataStrings,
                };

                const fcmRes = await fetch('https://fcm.googleapis.com/fcm/send', {
                  method: 'POST',
                  headers: {
                    Authorization: `key=${fcmServerKey}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify(fcmPayload),
                });
                if (fcmRes.ok) nativeSentCount++;
              }
            } else if (dev.platform === 'ios' && apnsAuthToken) {
              const isVoipPush = (isIncomingCall || isCancelCall) && Boolean(dev.voip_token);
              const targetToken = isVoipPush ? dev.voip_token : dev.push_token;
              if (!targetToken) return;

              const apnsTopic = isVoipPush ? `${apnsBundleId}.voip` : apnsBundleId;
              const apnsBody = isVoipPush
                ? {
                    aps: { 'content-available': 1 },
                    type: isCancelCall ? 'cancel_call' : 'incoming_call',
                    callId: body.callId || '',
                    callType: resolvedCallType,
                    callerId: senderUserId,
                    callerName: senderDisplayName,
                    callerAvatar: senderAvatarUrl || '',
                    chatId: resolvedChatId || '',
                    rejectToken: rejectToken || '',
                    rejectEndpoint: `${supabaseUrl}/functions/v1/send-web-push`,
                    anonKey: supabaseAnonKey,
                  }
                : {
                    aps: {
                      alert: {
                        title: 'OSA',
                        subtitle: senderHeader,
                        body:
                          msgFormatted.messageCount >= 2
                            ? `${msgFormatted.messageCount} new messages`
                            : previewLine,
                      },
                      sound: 'default',
                      'thread-id': resolvedChatId || senderUserId,
                      'mutable-content': 1,
                    },
                    type: 'message',
                    conversationId: resolvedChatId || '',
                    chatId: resolvedChatId || '',
                    senderId: senderUserId,
                    senderName: senderHeader,
                    messageId: body.messageId || '',
                    messageCount: msgFormatted.messageCount,
                  };

              const apnsRes = await fetch(`https://api.push.apple.com/3/device/${targetToken}`, {
                method: 'POST',
                headers: {
                  authorization: `bearer ${apnsAuthToken}`,
                  'apns-topic': apnsTopic,
                  'apns-push-type': isVoipPush ? 'voip' : 'alert',
                  'apns-priority': '10',
                },
                body: JSON.stringify(apnsBody),
              });
              if (apnsRes.ok) nativeSentCount++;
            }
          } catch {
            // Ignore individual native device network error
          }
        })
      );
    }

    return new Response(
      JSON.stringify({
        sent: sentCount,
        nativeSent: nativeSentCount,
        cleanedInvalidSubscriptions: cleanedCount,
        totalTargetedSubscriptions: subscriptions.length,
        totalTargetedNativeDevices: nativeDevices.length,
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
