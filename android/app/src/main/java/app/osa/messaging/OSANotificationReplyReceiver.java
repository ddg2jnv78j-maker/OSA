package app.osa.messaging;

import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;
import androidx.core.app.RemoteInput;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Handles inline message replies directly from Android notifications using RemoteInput
 * without opening the OSA app UI.
 *
 * - Authenticates against the existing OSA Supabase backend (with automatic JWT refresh on 401/403).
 * - Resolves or verifies the target conversation ID safely (never sends as an unauthenticated user
 *   or to an ambiguous conversation).
 * - Deduplicates rapid repeated taps of the inline reply action.
 * - Inserts the message into public.messages, updates public.chats, marks the conversation read,
 *   and triggers push notification delivery to the recipient.
 * - Shows clear sending/success/failure feedback in the notification and synchronizes with MainActivity
 *   if the WebView is active in memory.
 */
public class OSANotificationReplyReceiver extends BroadcastReceiver {
    public static final String ACTION_INLINE_REPLY = "app.osa.messaging.ACTION_INLINE_REPLY";
    public static final String KEY_TEXT_REPLY = "osa_key_text_reply";

    private static final long DEDUP_WINDOW_MS = 8000L;
    private static final Map<String, Long> recentReplyFingerprints = new ConcurrentHashMap<>();

    @Override
    public void onReceive(final Context context, final Intent intent) {
        if (context == null || intent == null) return;
        if (!ACTION_INLINE_REPLY.equals(intent.getAction())) return;

        Bundle remoteInputResults = RemoteInput.getResultsFromIntent(intent);
        if (remoteInputResults == null) return;

        CharSequence rawSeq = remoteInputResults.getCharSequence(KEY_TEXT_REPLY);
        final String replyText = rawSeq != null ? rawSeq.toString().trim() : "";
        if (replyText.isEmpty()) return;

        final String rawChatId = intent.getStringExtra("chatId") != null
                ? intent.getStringExtra("chatId").trim()
                : (intent.getStringExtra("conversationId") != null
                ? intent.getStringExtra("conversationId").trim()
                : "");
        final String senderId = intent.getStringExtra("senderId") != null
                ? intent.getStringExtra("senderId").trim()
                : "";
        final String senderName = intent.getStringExtra("senderName") != null
                && !intent.getStringExtra("senderName").trim().isEmpty()
                ? intent.getStringExtra("senderName").trim()
                : "OSA User";
        final String replyToMessageId = intent.getStringExtra("replyToMessageId") != null
                ? intent.getStringExtra("replyToMessageId").trim()
                : "";
        final String threadKey = intent.getStringExtra("threadKey") != null
                && !intent.getStringExtra("threadKey").trim().isEmpty()
                ? intent.getStringExtra("threadKey").trim()
                : (!rawChatId.isEmpty() ? rawChatId : (!senderId.isEmpty() ? senderId : senderName));
        final String notificationTag = intent.getStringExtra("notificationTag") != null
                && !intent.getStringExtra("notificationTag").trim().isEmpty()
                ? intent.getStringExtra("notificationTag").trim()
                : ("osa-chat-" + threadKey);
        final int notificationId = intent.getIntExtra("notificationId", 0);
        final boolean isVoiceMessage = intent.getBooleanExtra("isVoiceMessage", false);

        // Prevent duplicate message sends if the action is triggered more than once
        String dedupKey = threadKey + "|" + replyToMessageId + "|" + replyText;
        long nowMs = System.currentTimeMillis();
        Long previousMs = recentReplyFingerprints.put(dedupKey, nowMs);
        if (previousMs != null && (nowMs - previousMs) < DEDUP_WINDOW_MS) {
            android.util.Log.i("OSA_DIAG", "[OSA_INLINE_REPLY] Ignored duplicate inline reply tap for threadKey=" + threadKey);
            return;
        }

        // Show immediate "Sending reply..." state on the notification so RemoteInput spinner updates cleanly
        updateNotificationFeedback(
                context,
                notificationTag,
                notificationId,
                threadKey,
                rawChatId,
                senderId,
                senderName,
                "Sending reply…",
                false,
                false,
                isVoiceMessage
        );

        final PendingResult pendingResult = goAsync();
        final Context appCtx = context.getApplicationContext();

        Executors.newSingleThreadExecutor().execute(() -> {
            PowerManager.WakeLock wakeLock = null;
            try {
                PowerManager pm = (PowerManager) appCtx.getSystemService(Context.POWER_SERVICE);
                if (pm != null) {
                    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "osa:inline_reply_wakelock");
                    wakeLock.acquire(12000L);
                }

                SharedPreferences prefs = appCtx.getSharedPreferences(OSAFirebaseMessagingService.PREFS_NAME, Context.MODE_PRIVATE);
                String userId = prefs.getString("auth_user_id", "").trim();
                String accessToken = prefs.getString("auth_access_token", "").trim();
                String refreshToken = prefs.getString("auth_refresh_token", "").trim();
                String supabaseUrl = prefs.getString("auth_supabase_url", "").trim();
                String anonKey = prefs.getString("auth_anon_key", "").trim();

                if (supabaseUrl.isEmpty()) {
                    supabaseUrl = "https://wldwnchorvymaulzzlya.supabase.co";
                }

                // Never send messages as an unauthenticated user
                if (userId.isEmpty() || (accessToken.isEmpty() && refreshToken.isEmpty()) || anonKey.isEmpty()) {
                    recentReplyFingerprints.remove(dedupKey);
                    updateNotificationFeedback(
                            appCtx,
                            notificationTag,
                            notificationId,
                            threadKey,
                            rawChatId,
                            senderId,
                            senderName,
                            "Could not send reply — please sign in to OSA.",
                            true,
                            false,
                            isVoiceMessage
                    );
                    return;
                }

                if (accessToken.isEmpty() && !refreshToken.isEmpty()) {
                    String refreshed = OSABackgroundMessagingService.refreshSupabaseAccessToken(
                            supabaseUrl,
                            anonKey,
                            refreshToken,
                            prefs
                    );
                    if (refreshed != null && !refreshed.isEmpty()) {
                        accessToken = refreshed;
                    }
                }

                // Resolve target conversation ID if only senderId was present
                String targetChatId = rawChatId;
                if (targetChatId.isEmpty() && !senderId.isEmpty()) {
                    targetChatId = resolveDirectChatIdWithRetry(
                            supabaseUrl,
                            anonKey,
                            accessToken,
                            refreshToken,
                            senderId,
                            prefs
                    );
                    // Refresh local accessToken reference if token was refreshed during lookup
                    accessToken = prefs.getString("auth_access_token", accessToken).trim();
                }

                if (targetChatId == null || targetChatId.trim().isEmpty()) {
                    recentReplyFingerprints.remove(dedupKey);
                    updateNotificationFeedback(
                            appCtx,
                            notificationTag,
                            notificationId,
                            threadKey,
                            rawChatId,
                            senderId,
                            senderName,
                            "Could not send reply — conversation unavailable. Tap to open chat.",
                            true,
                            false,
                            isVoiceMessage
                    );
                    return;
                }
                targetChatId = targetChatId.trim();

                // Insert message into public.messages with automatic token refresh on 401/403
                SendReplyResult sendResult = insertMessageWithRetry(
                        supabaseUrl,
                        anonKey,
                        accessToken,
                        refreshToken,
                        userId,
                        targetChatId,
                        replyText,
                        replyToMessageId,
                        prefs
                );

                if (!sendResult.success) {
                    recentReplyFingerprints.remove(dedupKey);
                    updateNotificationFeedback(
                            appCtx,
                            notificationTag,
                            notificationId,
                            threadKey,
                            targetChatId,
                            senderId,
                            senderName,
                            "Reply failed to send. Check connection or tap to open chat.",
                            true,
                            false,
                            isVoiceMessage
                    );
                    return;
                }

                String effectiveAccessToken = prefs.getString("auth_access_token", accessToken).trim();
                if (!sendResult.messageId.isEmpty()) {
                    OSAFirebaseMessagingService.checkAndMarkMessageDelivered(appCtx, sendResult.messageId);
                }

                SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
                sdf.setTimeZone(TimeZone.getTimeZone("UTC"));
                String nowIso = sdf.format(new Date());

                // Update conversation preview & timestamp and mark incoming messages read
                updateChatAndMarkRead(
                        supabaseUrl,
                        anonKey,
                        effectiveAccessToken,
                        targetChatId,
                        userId,
                        replyText,
                        nowIso
                );

                // Reset local unread counter for this conversation thread
                prefs.edit().putInt("unread_" + threadKey, 0).commit();

                // Dispatch push notification to the recipient(s)
                dispatchPushNotificationForReply(
                        supabaseUrl,
                        anonKey,
                        effectiveAccessToken,
                        userId,
                        targetChatId,
                        sendResult.messageId,
                        replyText
                );

                // Synchronize with MainActivity WebView if alive in memory
                MainActivity.notifyInlineReplySentFromNotification(
                        targetChatId,
                        sendResult.messageId,
                        replyText
                );

                // Update notification with sent confirmation and auto-dismiss after 3.5 seconds
                updateNotificationFeedback(
                        appCtx,
                        notificationTag,
                        notificationId,
                        threadKey,
                        targetChatId,
                        senderId,
                        senderName,
                        "You: " + replyText,
                        false,
                        true,
                        isVoiceMessage
                );
            } catch (Exception e) {
                recentReplyFingerprints.remove(dedupKey);
                updateNotificationFeedback(
                        appCtx,
                        notificationTag,
                        notificationId,
                        threadKey,
                        rawChatId,
                        senderId,
                        senderName,
                        "Reply failed to send. Tap to open chat.",
                        true,
                        false,
                        isVoiceMessage
                );
            } finally {
                try {
                    if (wakeLock != null && wakeLock.isHeld()) {
                        wakeLock.release();
                    }
                } catch (Exception ignored) {
                }
                try {
                    pendingResult.finish();
                } catch (Exception ignored) {
                }
            }
        });
    }

    private static class SendReplyResult {
        final boolean success;
        final String messageId;

        SendReplyResult(boolean success, String messageId) {
            this.success = success;
            this.messageId = messageId != null ? messageId : "";
        }
    }

    private static String resolveDirectChatIdWithRetry(
            String supabaseUrl,
            String anonKey,
            String accessToken,
            String refreshToken,
            String targetUserId,
            SharedPreferences prefs
    ) {
        String chatId = executeGetOrCreateDirectChatRpc(supabaseUrl, anonKey, accessToken, targetUserId);
        if (chatId != null && !chatId.isEmpty()) {
            return chatId;
        }
        if (refreshToken != null && !refreshToken.isEmpty()) {
            String newAccess = OSABackgroundMessagingService.refreshSupabaseAccessToken(
                    supabaseUrl,
                    anonKey,
                    refreshToken,
                    prefs
            );
            if (newAccess != null && !newAccess.isEmpty()) {
                return executeGetOrCreateDirectChatRpc(supabaseUrl, anonKey, newAccess, targetUserId);
            }
        }
        return null;
    }

    private static String executeGetOrCreateDirectChatRpc(
            String supabaseUrl,
            String anonKey,
            String accessToken,
            String targetUserId
    ) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(supabaseUrl + "/rest/v1/rpc/get_or_create_direct_chat");
            conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(7000);
            conn.setReadTimeout(7000);
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("apikey", anonKey);
            conn.setRequestProperty("Authorization", "Bearer " + accessToken);
            conn.setDoOutput(true);

            JSONObject body = new JSONObject();
            body.put("target_user_id", targetUserId);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }

            int code = conn.getResponseCode();
            if (code >= 200 && code < 300) {
                InputStream is = conn.getInputStream();
                BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line);
                }
                reader.close();
                String raw = sb.toString().trim();
                if (raw.startsWith("\"") && raw.endsWith("\"") && raw.length() > 2) {
                    raw = raw.substring(1, raw.length() - 1);
                }
                return raw.trim();
            }
        } catch (Exception ignored) {
        } finally {
            if (conn != null) conn.disconnect();
        }
        return null;
    }

    private static SendReplyResult insertMessageWithRetry(
            String supabaseUrl,
            String anonKey,
            String accessToken,
            String refreshToken,
            String senderId,
            String chatId,
            String content,
            String replyToMessageId,
            SharedPreferences prefs
    ) {
        HttpInsertAttempt first = executeInsertMessage(
                supabaseUrl,
                anonKey,
                accessToken,
                senderId,
                chatId,
                content,
                replyToMessageId
        );
        if (first.httpCode >= 200 && first.httpCode < 300) {
            return new SendReplyResult(true, first.messageId);
        }
        if ((first.httpCode == 401 || first.httpCode == 403) && refreshToken != null && !refreshToken.isEmpty()) {
            String refreshed = OSABackgroundMessagingService.refreshSupabaseAccessToken(
                    supabaseUrl,
                    anonKey,
                    refreshToken,
                    prefs
            );
            if (refreshed != null && !refreshed.isEmpty()) {
                HttpInsertAttempt second = executeInsertMessage(
                        supabaseUrl,
                        anonKey,
                        refreshed,
                        senderId,
                        chatId,
                        content,
                        replyToMessageId
                );
                if (second.httpCode >= 200 && second.httpCode < 300) {
                    return new SendReplyResult(true, second.messageId);
                }
            }
        }
        return new SendReplyResult(false, "");
    }

    private static class HttpInsertAttempt {
        final int httpCode;
        final String messageId;

        HttpInsertAttempt(int httpCode, String messageId) {
            this.httpCode = httpCode;
            this.messageId = messageId != null ? messageId : "";
        }
    }

    private static HttpInsertAttempt executeInsertMessage(
            String supabaseUrl,
            String anonKey,
            String accessToken,
            String senderId,
            String chatId,
            String content,
            String replyToMessageId
    ) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(supabaseUrl + "/rest/v1/messages");
            conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Prefer", "return=representation");
            conn.setRequestProperty("apikey", anonKey);
            conn.setRequestProperty("Authorization", "Bearer " + accessToken);
            conn.setDoOutput(true);

            JSONObject body = new JSONObject();
            body.put("chat_id", chatId);
            body.put("sender_id", senderId);
            body.put("content", content);
            body.put("message_type", "text");
            if (replyToMessageId != null && !replyToMessageId.isEmpty()) {
                body.put("reply_to_id", replyToMessageId);
            } else {
                body.put("reply_to_id", JSONObject.NULL);
            }
            body.put("status", "sent");

            try (OutputStream os = conn.getOutputStream()) {
                os.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }

            int code = conn.getResponseCode();
            String msgId = "";
            if (code >= 200 && code < 300) {
                InputStream is = conn.getInputStream();
                BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line);
                }
                reader.close();
                String raw = sb.toString().trim();
                if (raw.startsWith("[")) {
                    JSONArray arr = new JSONArray(raw);
                    if (arr.length() > 0) {
                        JSONObject row = arr.optJSONObject(0);
                        if (row != null) {
                            msgId = row.optString("id", "");
                        }
                    }
                } else if (raw.startsWith("{")) {
                    JSONObject row = new JSONObject(raw);
                    msgId = row.optString("id", "");
                }
            }
            android.util.Log.i("OSA_DIAG", "[OSA_INLINE_REPLY] POST /rest/v1/messages HTTP=" + code
                    + " chatId=" + chatId + " messageId=" + msgId);
            return new HttpInsertAttempt(code, msgId);
        } catch (Exception e) {
            android.util.Log.w("OSA_DIAG", "[OSA_INLINE_REPLY] Exception inserting reply: " + e.getMessage());
            return new HttpInsertAttempt(0, "");
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static void updateChatAndMarkRead(
            String supabaseUrl,
            String anonKey,
            String accessToken,
            String chatId,
            String userId,
            String content,
            String nowIso
    ) {
        // 1. Update chats.last_message_text and chats.last_message_at
        try {
            URL chatUrl = new URL(supabaseUrl + "/rest/v1/chats?id=eq." + URLEncoder.encode(chatId, "UTF-8"));
            HttpURLConnection conn = (HttpURLConnection) chatUrl.openConnection();
            conn.setConnectTimeout(6000);
            conn.setReadTimeout(6000);
            conn.setRequestMethod("PATCH");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Prefer", "return=minimal");
            conn.setRequestProperty("apikey", anonKey);
            conn.setRequestProperty("Authorization", "Bearer " + accessToken);
            conn.setDoOutput(true);

            JSONObject patch = new JSONObject();
            patch.put("last_message_text", content.length() > 120 ? content.substring(0, 120) : content);
            patch.put("last_message_at", nowIso);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(patch.toString().getBytes(StandardCharsets.UTF_8));
            }
            conn.getResponseCode();
            conn.disconnect();
        } catch (Exception ignored) {
        }

        // 2. Reset chat_members.unread_count for the user who replied
        try {
            URL memberUrl = new URL(
                    supabaseUrl
                            + "/rest/v1/chat_members?chat_id=eq." + URLEncoder.encode(chatId, "UTF-8")
                            + "&user_id=eq." + URLEncoder.encode(userId, "UTF-8")
            );
            HttpURLConnection conn = (HttpURLConnection) memberUrl.openConnection();
            conn.setConnectTimeout(6000);
            conn.setReadTimeout(6000);
            conn.setRequestMethod("PATCH");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Prefer", "return=minimal");
            conn.setRequestProperty("apikey", anonKey);
            conn.setRequestProperty("Authorization", "Bearer " + accessToken);
            conn.setDoOutput(true);

            JSONObject patch = new JSONObject();
            patch.put("unread_count", 0);
            patch.put("last_read_at", nowIso);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(patch.toString().getBytes(StandardCharsets.UTF_8));
            }
            conn.getResponseCode();
            conn.disconnect();
        } catch (Exception ignored) {
        }

        // 3. Mark peer messages in this conversation as 'read'
        try {
            URL msgReadUrl = new URL(
                    supabaseUrl
                            + "/rest/v1/messages?chat_id=eq." + URLEncoder.encode(chatId, "UTF-8")
                            + "&sender_id=neq." + URLEncoder.encode(userId, "UTF-8")
                            + "&status=neq.read"
            );
            HttpURLConnection conn = (HttpURLConnection) msgReadUrl.openConnection();
            conn.setConnectTimeout(6000);
            conn.setReadTimeout(6000);
            conn.setRequestMethod("PATCH");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Prefer", "return=minimal");
            conn.setRequestProperty("apikey", anonKey);
            conn.setRequestProperty("Authorization", "Bearer " + accessToken);
            conn.setDoOutput(true);

            JSONObject patch = new JSONObject();
            patch.put("status", "read");
            patch.put("updated_at", nowIso);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(patch.toString().getBytes(StandardCharsets.UTF_8));
            }
            conn.getResponseCode();
            conn.disconnect();
        } catch (Exception ignored) {
        }
    }

    private static void dispatchPushNotificationForReply(
            String supabaseUrl,
            String anonKey,
            String accessToken,
            String senderId,
            String chatId,
            String messageId,
            String content
    ) {
        String preview = content.length() > 120 ? content.substring(0, 120) : content;
        String[] endpoints = new String[]{
                supabaseUrl + "/functions/v1/send-push-notification",
                supabaseUrl + "/functions/v1/send-web-push"
        };
        for (String endpoint : endpoints) {
            try {
                URL url = new URL(endpoint);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(6000);
                conn.setReadTimeout(6000);
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setRequestProperty("apikey", anonKey);
                conn.setRequestProperty("Authorization", "Bearer " + accessToken);
                conn.setDoOutput(true);

                JSONObject payload = new JSONObject();
                payload.put("senderId", senderId);
                payload.put("type", "message");
                payload.put("body", preview);
                payload.put("chatId", chatId);
                payload.put("conversationId", chatId);
                if (messageId != null && !messageId.isEmpty()) {
                    payload.put("messageId", messageId);
                }
                payload.put("messageType", "text");

                try (OutputStream os = conn.getOutputStream()) {
                    os.write(payload.toString().getBytes(StandardCharsets.UTF_8));
                }
                int code = conn.getResponseCode();
                conn.disconnect();
                if (code >= 200 && code < 300) {
                    break;
                }
            } catch (Exception ignored) {
            }
        }
    }

    private static void updateNotificationFeedback(
            Context context,
            String notificationTag,
            int notificationId,
            String threadKey,
            String chatId,
            String senderId,
            String senderName,
            String statusLine,
            boolean isError,
            boolean autoDismiss,
            boolean isVoiceMessage
    ) {
        try {
            MainActivity.ensureNotificationChannels(context);
            NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager == null) return;

            PendingIntent contentPendingIntent;
            if (isVoiceMessage) {
                // Tapping Voice Message notification feedback must NEVER launch MainActivity
                Intent noopIntent = new Intent(context, OSAVoiceNotificationReceiver.class);
                noopIntent.setAction(OSAVoiceNotificationReceiver.ACTION_NOOP_VOICE);
                int noopReq = ((("osa_voice_noop_" + threadKey).hashCode()) & 0x7FFFFFFF) % 1000000 + 4004;
                int noopFlags = PendingIntent.FLAG_UPDATE_CURRENT;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    noopFlags |= PendingIntent.FLAG_IMMUTABLE;
                }
                contentPendingIntent = PendingIntent.getBroadcast(context, noopReq, noopIntent, noopFlags);
            } else {
                Intent openIntent = new Intent(context, MainActivity.class);
                openIntent.setAction("app.osa.messaging.ACTION_OPEN_SAME_CHAT");
                openIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                if (chatId != null && !chatId.isEmpty()) {
                    openIntent.putExtra("chatId", chatId);
                    openIntent.putExtra("conversationId", chatId);
                }
                if (senderId != null && !senderId.isEmpty()) {
                    openIntent.putExtra("senderId", senderId);
                }
                if (senderName != null && !senderName.isEmpty()) {
                    openIntent.putExtra("senderName", senderName);
                }
                openIntent.putExtra("notificationAction", "same_chat");

                int reqCode = ((("osa_chat_" + threadKey).hashCode()) & 0x7FFFFFFF) % 1000000 + 2000;
                contentPendingIntent = PendingIntent.getActivity(
                        context,
                        reqCode,
                        openIntent,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                );
            }

            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, MainActivity.CHANNEL_MESSAGES)
                    .setSmallIcon(android.R.drawable.sym_action_chat)
                    .setContentTitle(senderName)
                    .setSubText(isVoiceMessage ? "Voice Message · OSA" : "OSA")
                    .setContentText(statusLine)
                    .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                    .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                    .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                    .setGroup("osa_group_" + threadKey)
                    .setOnlyAlertOnce(true)
                    .setSilent(true)
                    .setAutoCancel(true)
                    .setContentIntent(contentPendingIntent);

            if (isError && !isVoiceMessage) {
                builder.addAction(android.R.drawable.sym_action_chat, "Same Chat", contentPendingIntent);
            }
            if (autoDismiss) {
                builder.setTimeoutAfter(3500L);
            }

            manager.notify(notificationTag, notificationId, builder.build());
        } catch (Exception ignored) {
        }
    }
}
