package app.osa.messaging;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.SystemClock;
import android.provider.Settings;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import org.json.JSONArray;
import org.json.JSONObject;
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
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * OSA Native Android Persistent Foreground Background Sync Service.
 * Ensures that across:
 * A) Foreground
 * B) Background (user using another app)
 * C) Screen locked
 * D) App completely closed / swiped from Recents
 * incoming messages, incoming audio/video calls, and call cancellations are delivered
 * reliably with zero phone-clock dependency and strict messageId/callId deduplication.
 */
public class OSABackgroundMessagingService extends Service {
    public static final int BG_SERVICE_NOTIFICATION_ID = 9090;

    private ScheduledExecutorService scheduler;
    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;
    private final Map<String, String> profileNameCache = new ConcurrentHashMap<>();
    private String lastSyncedFcmTokenKey = "";
    private volatile long lastServerDateMs = 0L;

    public static void ensureStarted(Context context) {
        if (context == null) return;
        try {
            Context appCtx = context.getApplicationContext();
            Intent intent = new Intent(appCtx, OSABackgroundMessagingService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ContextCompat.startForegroundService(appCtx, intent);
            } else {
                appCtx.startService(intent);
            }
        } catch (Exception e) {
            try {
                Intent intent = new Intent(context.getApplicationContext(), OSABackgroundMessagingService.class);
                context.getApplicationContext().startService(intent);
            } catch (Exception ignored) {
            }
        }
    }

    public static void syncFcmTokenToSupabaseAsync(final Context context) {
        if (context == null) return;
        final Context appCtx = context.getApplicationContext();
        Executors.newSingleThreadExecutor().execute(() -> syncFcmTokenToSupabaseInternal(appCtx));
    }

    private static boolean syncFcmTokenToSupabaseInternal(Context context) {
        if (context == null) return false;
        try {
            SharedPreferences prefs = context.getSharedPreferences(OSAFirebaseMessagingService.PREFS_NAME, MODE_PRIVATE);
            String fcmToken = prefs.getString("fcm_token", "");
            String userId = prefs.getString("auth_user_id", "");
            String accessToken = prefs.getString("auth_access_token", "");
            String supabaseUrl = prefs.getString("auth_supabase_url", "");
            String anonKey = prefs.getString("auth_anon_key", "");

            if (fcmToken == null || fcmToken.trim().isEmpty()
                    || userId == null || userId.trim().isEmpty()
                    || accessToken == null || accessToken.trim().isEmpty()
                    || supabaseUrl == null || supabaseUrl.trim().isEmpty()
                    || anonKey == null || anonKey.trim().isEmpty()) {
                return false;
            }

            String androidId = Settings.Secure.getString(context.getContentResolver(), Settings.Secure.ANDROID_ID);
            String deviceId = androidId != null && !androidId.isEmpty() ? "android_" + androidId : "android_device";

            SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
            sdf.setTimeZone(TimeZone.getTimeZone("UTC"));
            String nowIso = sdf.format(new Date());

            // 1. Try RPC upsert_user_device
            try {
                URL rpcUrl = new URL(supabaseUrl + "/rest/v1/rpc/upsert_user_device");
                HttpURLConnection rpcConn = (HttpURLConnection) rpcUrl.openConnection();
                rpcConn.setConnectTimeout(6000);
                rpcConn.setReadTimeout(6000);
                rpcConn.setRequestMethod("POST");
                rpcConn.setRequestProperty("Content-Type", "application/json");
                rpcConn.setRequestProperty("apikey", anonKey);
                rpcConn.setRequestProperty("Authorization", "Bearer " + accessToken);
                rpcConn.setDoOutput(true);

                JSONObject rpcBody = new JSONObject();
                rpcBody.put("p_platform", "android");
                rpcBody.put("p_device_id", deviceId);
                rpcBody.put("p_push_token", fcmToken.trim());
                rpcBody.put("p_voip_token", JSONObject.NULL);
                rpcBody.put("p_app_version", "1.0.0");
                rpcBody.put("p_device_model", Build.MODEL);
                rpcBody.put("p_os_version", Build.VERSION.RELEASE);
                rpcBody.put("p_is_active", true);

                try (OutputStream os = rpcConn.getOutputStream()) {
                    os.write(rpcBody.toString().getBytes(StandardCharsets.UTF_8));
                }
                int code = rpcConn.getResponseCode();
                rpcConn.disconnect();
                android.util.Log.i("OSA_DIAG", "[OSA_FCM_TOKEN] rpc/upsert_user_device HTTP=" + code
                        + " userId=" + userId + " deviceId=" + deviceId);
                if (code >= 200 && code < 300) {
                    return true;
                }
            } catch (Exception ignored) {
            }

            // 2. Fallback: Direct POST upsert to /rest/v1/user_devices?on_conflict=user_id,device_id
            URL tableUrl = new URL(supabaseUrl + "/rest/v1/user_devices?on_conflict=user_id,device_id");
            HttpURLConnection conn = (HttpURLConnection) tableUrl.openConnection();
            conn.setConnectTimeout(6000);
            conn.setReadTimeout(6000);
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Prefer", "resolution=merge-duplicates,return=minimal");
            conn.setRequestProperty("apikey", anonKey);
            conn.setRequestProperty("Authorization", "Bearer " + accessToken);
            conn.setDoOutput(true);

            JSONObject body = new JSONObject();
            body.put("user_id", userId.trim());
            body.put("platform", "android");
            body.put("device_id", deviceId);
            body.put("push_token", fcmToken.trim());
            body.put("app_version", "1.0.0");
            body.put("device_model", Build.MODEL);
            body.put("os_version", Build.VERSION.RELEASE);
            body.put("is_active", true);
            body.put("last_seen_at", nowIso);
            body.put("updated_at", nowIso);

            try (OutputStream os = conn.getOutputStream()) {
                os.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }
            int code = conn.getResponseCode();
            conn.disconnect();
            android.util.Log.i("OSA_DIAG", "[OSA_FCM_TOKEN] rest/v1/user_devices HTTP=" + code
                    + " userId=" + userId + " deviceId=" + deviceId);
            return code >= 200 && code < 300;
        } catch (Exception ignored) {
            return false;
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        MainActivity.ensureNotificationChannels(this);
        promoteToForeground();
        acquireBackgroundLocks();
        startPollingLoop();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        MainActivity.ensureNotificationChannels(this);
        promoteToForeground();
        acquireBackgroundLocks();
        if (scheduler == null || scheduler.isShutdown()) {
            startPollingLoop();
        }
        return START_STICKY;
    }

    private void promoteToForeground() {
        try {
            MainActivity.ensureNotificationChannels(this);
            Intent openIntent = new Intent(this, MainActivity.class);
            openIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent pendingOpen = PendingIntent.getActivity(
                    this,
                    BG_SERVICE_NOTIFICATION_ID,
                    openIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

            Notification notification = new NotificationCompat.Builder(this, MainActivity.CHANNEL_BG_SYNC)
                    .setSmallIcon(android.R.drawable.sym_action_chat)
                    .setContentTitle("OSA")
                    .setContentText("Connected for messages and calls")
                    .setPriority(NotificationCompat.PRIORITY_MIN)
                    .setCategory(NotificationCompat.CATEGORY_SERVICE)
                    .setVisibility(NotificationCompat.VISIBILITY_SECRET)
                    .setSilent(true)
                    .setOngoing(true)
                    .setShowWhen(false)
                    .setContentIntent(pendingOpen)
                    .build();

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                try {
                    startForeground(
                            BG_SERVICE_NOTIFICATION_ID,
                            notification,
                            ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
                    );
                } catch (Exception e1) {
                    startForeground(BG_SERVICE_NOTIFICATION_ID, notification);
                }
            } else {
                startForeground(BG_SERVICE_NOTIFICATION_ID, notification);
            }
        } catch (Exception ignored) {
        }
    }

    private void acquireBackgroundLocks() {
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null && (wakeLock == null || !wakeLock.isHeld())) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "osa:bg_sync_wakelock");
                wakeLock.setReferenceCounted(false);
                wakeLock.acquire();
            }
        } catch (Exception ignored) {
        }

        try {
            WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm != null && (wifiLock == null || !wifiLock.isHeld())) {
                wifiLock = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "osa:bg_wifi_lock");
                wifiLock.setReferenceCounted(false);
                wifiLock.acquire();
            }
        } catch (Exception ignored) {
        }
    }

    private void releaseBackgroundLocks() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
            }
        } catch (Exception ignored) {
        }
        try {
            if (wifiLock != null && wifiLock.isHeld()) {
                wifiLock.release();
            }
        } catch (Exception ignored) {
        }
    }

    private void startPollingLoop() {
        if (scheduler != null && !scheduler.isShutdown()) {
            scheduler.shutdownNow();
        }
        scheduler = Executors.newSingleThreadScheduledExecutor();
        scheduler.scheduleWithFixedDelay(this::pollSupabaseEventsSafely, 800, 2000, TimeUnit.MILLISECONDS);
    }

    private void pollSupabaseEventsSafely() {
        try {
            SharedPreferences prefs = getSharedPreferences(OSAFirebaseMessagingService.PREFS_NAME, MODE_PRIVATE);
            String userId = prefs.getString("auth_user_id", "");
            String accessToken = prefs.getString("auth_access_token", "");
            String supabaseUrl = prefs.getString("auth_supabase_url", "");
            String anonKey = prefs.getString("auth_anon_key", "");
            String fcmToken = prefs.getString("fcm_token", "");

            if (userId == null || userId.isEmpty()
                    || accessToken == null || accessToken.isEmpty()
                    || supabaseUrl == null || supabaseUrl.isEmpty()
                    || anonKey == null || anonKey.isEmpty()) {
                return;
            }

            // Ensure real FCM token is synced to public.user_devices
            if (fcmToken != null && !fcmToken.isEmpty()) {
                String syncCandidateKey = userId + ":" + fcmToken;
                if (!syncCandidateKey.equals(lastSyncedFcmTokenKey)) {
                    if (syncFcmTokenToSupabaseInternal(this)) {
                        lastSyncedFcmTokenKey = syncCandidateKey;
                    }
                }
            }

            pollIncomingAndCancelledCalls(supabaseUrl, anonKey, accessToken, userId, prefs);
            pollIncomingMessages(supabaseUrl, anonKey, accessToken, userId, prefs);
            pollIncomingNotifications(supabaseUrl, anonKey, accessToken, userId, prefs);
        } catch (Exception ignored) {
        }
    }

    private void pollIncomingAndCancelledCalls(
            String supabaseUrl,
            String anonKey,
            String accessToken,
            String userId,
            SharedPreferences prefs
    ) {
        try {
            // Query latest 5 calls for receiver_id without any phone-clock filter
            String queryUrl = supabaseUrl
                    + "/rest/v1/calls?receiver_id=eq." + URLEncoder.encode(userId, "UTF-8")
                    + "&order=created_at.desc&limit=5";

            String responseJson = executeGetWithAutoRefresh(queryUrl, supabaseUrl, anonKey, accessToken, prefs);
            if (responseJson == null || responseJson.isEmpty()) return;

            JSONArray arr = new JSONArray(responseJson);
            String seedKey = "calls_baseline_seeded_" + userId;
            boolean alreadySeeded = prefs.getBoolean(seedKey, false);
            long referenceNowMs = lastServerDateMs > 0 ? lastServerDateMs : System.currentTimeMillis();

            if (!alreadySeeded) {
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject row = arr.optJSONObject(i);
                    if (row == null) continue;
                    String callId = row.optString("id", "").trim();
                    String status = row.optString("status", "").trim().toLowerCase(Locale.US);
                    String createdAt = row.optString("created_at", "").trim();
                    long createdMs = parseIsoTimestampMs(createdAt);
                    boolean isRecentActive = ("calling".equals(status) || "ringing".equals(status))
                            && createdMs > 0
                            && Math.abs(referenceNowMs - createdMs) <= 45000L;
                    if (!callId.isEmpty() && !isRecentActive) {
                        OSACallNotificationService.markCallTerminated(this, callId);
                    }
                }
                prefs.edit().putBoolean(seedKey, true).commit();
            }

            for (int i = 0; i < arr.length(); i++) {
                JSONObject row = arr.optJSONObject(i);
                if (row == null) continue;

                String callId = row.optString("id", "").trim();
                String status = row.optString("status", "").trim().toLowerCase(Locale.US);
                String callerId = row.optString("caller_id", "").trim();
                String receiverId = row.optString("receiver_id", "").trim();
                String callType = row.optString("call_type", "audio").trim();
                String chatId = row.isNull("chat_id") ? "" : row.optString("chat_id", "").trim();
                String createdAt = row.optString("created_at", "").trim();

                if (callId.isEmpty() || !userId.equals(receiverId) || userId.equals(callerId)) {
                    continue;
                }

                if ("ended".equals(status)
                        || "missed".equals(status)
                        || "rejected".equals(status)
                        || "failed".equals(status)
                        || "accepted".equals(status)
                        || "connected".equals(status)) {
                    if (OSACallNotificationService.isCallCurrentlyRinging(callId)) {
                        OSACallNotificationService.stopCallNotification(this, callId);
                    } else {
                        OSACallNotificationService.markCallTerminated(this, callId);
                    }
                    continue;
                }

                if ("calling".equals(status) || "ringing".equals(status)) {
                    long createdMs = parseIsoTimestampMs(createdAt);
                    // Ignore stale stuck calls older than 90 seconds compared to server time
                    if (createdMs > 0 && lastServerDateMs > 0 && (lastServerDateMs - createdMs) > 90000L) {
                        OSACallNotificationService.markCallTerminated(this, callId);
                        continue;
                    }

                    if (!OSACallNotificationService.isCallAlreadyHandledOrActive(this, callId)) {
                        String callerName = resolveProfileName(supabaseUrl, anonKey, prefs.getString("auth_access_token", accessToken), callerId, prefs);
                        Map<String, String> callData = new HashMap<>();
                        callData.put("type", "incoming_call");
                        callData.put("callId", callId);
                        callData.put("callType", callType);
                        callData.put("callerId", callerId);
                        callData.put("callerName", callerName);
                        callData.put("chatId", chatId);
                        OSACallNotificationService.startCallNotificationFromData(this, callData);

                        if ("calling".equals(status)) {
                            markCallRingingOnServer(
                                    supabaseUrl,
                                    anonKey,
                                    prefs.getString("auth_access_token", accessToken),
                                    callId,
                                    userId,
                                    callerId
                            );
                        }
                    }
                }
            }
        } catch (Exception ignored) {
        }
    }

    private void markCallRingingOnServer(
            String supabaseUrl,
            String anonKey,
            String accessToken,
            String callId,
            String userId,
            String callerId
    ) {
        try {
            URL patchUrl = new URL(supabaseUrl + "/rest/v1/calls?id=eq." + callId);
            HttpURLConnection conn = (HttpURLConnection) patchUrl.openConnection();
            conn.setConnectTimeout(6000);
            conn.setReadTimeout(6000);
            conn.setRequestMethod("POST");
            conn.setRequestProperty("X-HTTP-Method-Override", "PATCH");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Prefer", "return=minimal");
            conn.setRequestProperty("apikey", anonKey);
            conn.setRequestProperty("Authorization", "Bearer " + accessToken);
            conn.setDoOutput(true);

            JSONObject body = new JSONObject();
            body.put("status", "ringing");
            try (OutputStream os = conn.getOutputStream()) {
                os.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }
            conn.getResponseCode();
            conn.disconnect();

            URL sigUrl = new URL(supabaseUrl + "/rest/v1/call_signals");
            HttpURLConnection sigConn = (HttpURLConnection) sigUrl.openConnection();
            sigConn.setConnectTimeout(6000);
            sigConn.setReadTimeout(6000);
            sigConn.setRequestMethod("POST");
            sigConn.setRequestProperty("Content-Type", "application/json");
            sigConn.setRequestProperty("Prefer", "return=minimal");
            sigConn.setRequestProperty("apikey", anonKey);
            sigConn.setRequestProperty("Authorization", "Bearer " + accessToken);
            sigConn.setDoOutput(true);

            JSONObject sigBody = new JSONObject();
            sigBody.put("call_id", callId);
            sigBody.put("sender_id", userId);
            sigBody.put("receiver_id", callerId);
            sigBody.put("signal_type", "ringing");
            sigBody.put("payload", new JSONObject().put("reachable", true));
            try (OutputStream os = sigConn.getOutputStream()) {
                os.write(sigBody.toString().getBytes(StandardCharsets.UTF_8));
            }
            sigConn.getResponseCode();
            sigConn.disconnect();
        } catch (Exception ignored) {
        }
    }

    private void pollIncomingMessages(
            String supabaseUrl,
            String anonKey,
            String accessToken,
            String userId,
            SharedPreferences prefs
    ) {
        try {
            // Query latest 10 messages not sent by userId without any phone-clock filter
            String queryUrl = supabaseUrl
                    + "/rest/v1/messages?sender_id=neq." + URLEncoder.encode(userId, "UTF-8")
                    + "&order=created_at.desc&limit=10"
                    + "&select=id,chat_id,sender_id,content,message_type,created_at";

            String responseJson = executeGetWithAutoRefresh(queryUrl, supabaseUrl, anonKey, accessToken, prefs);
            if (responseJson == null || responseJson.isEmpty()) return;

            JSONArray arr = new JSONArray(responseJson);
            String seedKey = "msg_baseline_seeded_" + userId;
            boolean alreadySeeded = prefs.getBoolean(seedKey, false);

            // On first run after login, seed existing message IDs so historical messages do not notify
            if (!alreadySeeded) {
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject row = arr.optJSONObject(i);
                    if (row == null) continue;
                    String msgId = row.optString("id", "").trim();
                    if (!msgId.isEmpty()) {
                        OSAFirebaseMessagingService.checkAndMarkMessageDelivered(this, msgId);
                    }
                }
                prefs.edit().putBoolean(seedKey, true).commit();
                return;
            }

            // Iterate from oldest to newest among the latest 10 messages
            for (int i = arr.length() - 1; i >= 0; i--) {
                JSONObject row = arr.optJSONObject(i);
                if (row == null) continue;

                String msgId = row.optString("id", "").trim();
                String chatId = row.optString("chat_id", "").trim();
                String senderId = row.optString("sender_id", "").trim();
                String content = row.optString("content", "").trim();
                String messageType = row.optString("message_type", "text").trim().toLowerCase(Locale.US);
                String createdAt = row.optString("created_at", "").trim();

                if (msgId.isEmpty() || senderId.isEmpty() || userId.equals(senderId)) {
                    continue;
                }

                if (OSAFirebaseMessagingService.isRemoteControlSignal(content)) {
                    OSAFirebaseMessagingService.checkAndMarkMessageDelivered(this, msgId);
                    continue;
                }

                if (OSAFirebaseMessagingService.isMessageAlreadyDelivered(this, msgId)) {
                    continue;
                }

                // If a message is more than 10 minutes older than server time, mark it seen without alerting
                long createdMs = parseIsoTimestampMs(createdAt);
                if (createdMs > 0 && lastServerDateMs > 0 && (lastServerDateMs - createdMs) > 600000L) {
                    OSAFirebaseMessagingService.checkAndMarkMessageDelivered(this, msgId);
                    continue;
                }

                String senderName = resolveProfileName(
                        supabaseUrl,
                        anonKey,
                        prefs.getString("auth_access_token", accessToken),
                        senderId,
                        prefs
                );
                String preview;
                if ("image".equals(messageType)) {
                    preview = "Photo";
                } else if ("video".equals(messageType)) {
                    preview = "Video";
                } else if ("audio".equals(messageType)) {
                    preview = "Voice message";
                } else if ("document".equals(messageType)) {
                    preview = "File";
                } else {
                    preview = content.isEmpty() ? "New message" : content;
                }

                Map<String, String> msgData = new HashMap<>();
                msgData.put("type", "message");
                msgData.put("messageId", msgId);
                msgData.put("chatId", chatId);
                msgData.put("conversationId", chatId);
                msgData.put("senderId", senderId);
                msgData.put("senderName", senderName);
                msgData.put("messagePreview", preview);
                OSAFirebaseMessagingService.showGroupedMessageNotificationStatic(this, msgData);
            }
        } catch (Exception ignored) {
        }
    }

    private void pollIncomingNotifications(
            String supabaseUrl,
            String anonKey,
            String accessToken,
            String userId,
            SharedPreferences prefs
    ) {
        try {
            String queryUrl = supabaseUrl
                    + "/rest/v1/notifications?user_id=eq." + URLEncoder.encode(userId, "UTF-8")
                    + "&order=created_at.desc&limit=8";

            String responseJson = executeGetWithAutoRefresh(queryUrl, supabaseUrl, anonKey, accessToken, prefs);
            if (responseJson == null || responseJson.isEmpty()) return;

            JSONArray arr = new JSONArray(responseJson);
            String seedKey = "notif_baseline_seeded_" + userId;
            boolean alreadySeeded = prefs.getBoolean(seedKey, false);

            if (!alreadySeeded) {
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject row = arr.optJSONObject(i);
                    if (row == null) continue;
                    String notifId = row.optString("id", "").trim();
                    String refId = row.optString("reference_id", "").trim();
                    if (!notifId.isEmpty()) {
                        OSAFirebaseMessagingService.checkAndMarkMessageDelivered(this, notifId);
                    }
                    if (!refId.isEmpty()) {
                        OSAFirebaseMessagingService.checkAndMarkMessageDelivered(this, refId);
                    }
                }
                prefs.edit().putBoolean(seedKey, true).commit();
                return;
            }

            for (int i = arr.length() - 1; i >= 0; i--) {
                JSONObject row = arr.optJSONObject(i);
                if (row == null) continue;

                String notifId = row.optString("id", "").trim();
                String refId = row.optString("reference_id", "").trim();
                String type = row.optString("type", "message").trim();
                String title = row.optString("title", "OSA User").trim();
                String body = row.optString("body", "").trim();
                String chatId = row.isNull("chat_id") ? "" : row.optString("chat_id", "").trim();
                String actorId = row.isNull("actor_id") ? "" : row.optString("actor_id", "").trim();
                String createdAt = row.optString("created_at", "").trim();

                if ("incoming_call".equalsIgnoreCase(type)) {
                    continue;
                }
                if (OSAFirebaseMessagingService.isRemoteControlSignal(body)
                        || OSAFirebaseMessagingService.isRemoteControlSignal(title)) {
                    continue;
                }

                String dedupeId = !refId.isEmpty() ? refId : notifId;
                if (dedupeId.isEmpty()) continue;

                if (OSAFirebaseMessagingService.isMessageAlreadyDelivered(this, dedupeId)
                        || (!notifId.isEmpty() && OSAFirebaseMessagingService.isMessageAlreadyDelivered(this, notifId))) {
                    continue;
                }

                long createdMs = parseIsoTimestampMs(createdAt);
                if (createdMs > 0 && lastServerDateMs > 0 && (lastServerDateMs - createdMs) > 600000L) {
                    OSAFirebaseMessagingService.checkAndMarkMessageDelivered(this, dedupeId);
                    continue;
                }

                if (!notifId.isEmpty() && !notifId.equals(dedupeId)) {
                    OSAFirebaseMessagingService.checkAndMarkMessageDelivered(this, notifId);
                }

                Map<String, String> msgData = new HashMap<>();
                msgData.put("type", "message");
                msgData.put("messageId", dedupeId);
                msgData.put("chatId", chatId);
                msgData.put("conversationId", chatId);
                msgData.put("senderId", actorId);
                msgData.put("senderName", title.isEmpty() ? "OSA User" : title);
                msgData.put("messagePreview", body.isEmpty() ? "New message" : body);
                OSAFirebaseMessagingService.showGroupedMessageNotificationStatic(this, msgData);
            }
        } catch (Exception ignored) {
        }
    }

    private String resolveProfileName(
            String supabaseUrl,
            String anonKey,
            String accessToken,
            String profileId,
            SharedPreferences prefs
    ) {
        if (profileId == null || profileId.isEmpty()) return "OSA User";
        String cached = profileNameCache.get(profileId);
        if (cached != null && !cached.isEmpty()) return cached;

        try {
            String url = supabaseUrl
                    + "/rest/v1/profiles?id=eq." + URLEncoder.encode(profileId, "UTF-8")
                    + "&select=full_name&limit=1";
            String json = executeGetWithAutoRefresh(url, supabaseUrl, anonKey, accessToken, prefs);
            if (json != null && !json.isEmpty()) {
                JSONArray arr = new JSONArray(json);
                if (arr.length() > 0) {
                    JSONObject obj = arr.optJSONObject(0);
                    if (obj != null) {
                        String fullName = obj.optString("full_name", "").trim();
                        if (!fullName.isEmpty()) {
                            profileNameCache.put(profileId, fullName);
                            return fullName;
                        }
                    }
                }
            }
        } catch (Exception ignored) {
        }
        return "OSA User";
    }

    private String executeGetWithAutoRefresh(
            String urlStr,
            String supabaseUrl,
            String anonKey,
            String accessToken,
            SharedPreferences prefs
    ) {
        HttpResult res = executeGetRaw(urlStr, anonKey, accessToken);
        if (res.statusCode == 401 && prefs != null) {
            String refreshToken = prefs.getString("auth_refresh_token", "");
            if (refreshToken != null && !refreshToken.isEmpty()) {
                String newAccess = refreshSupabaseAccessToken(supabaseUrl, anonKey, refreshToken, prefs);
                if (newAccess != null && !newAccess.isEmpty()) {
                    res = executeGetRaw(urlStr, anonKey, newAccess);
                }
            }
        }
        return res.body;
    }

    private static class HttpResult {
        int statusCode;
        String body;

        HttpResult(int statusCode, String body) {
            this.statusCode = statusCode;
            this.body = body;
        }
    }

    private HttpResult executeGetRaw(String urlStr, String anonKey, String accessToken) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(urlStr);
            conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(6000);
            conn.setReadTimeout(6000);
            conn.setRequestMethod("GET");
            conn.setRequestProperty("Accept", "application/json");
            conn.setRequestProperty("apikey", anonKey);
            conn.setRequestProperty("Authorization", "Bearer " + accessToken);

            int code = conn.getResponseCode();
            long serverDate = conn.getHeaderFieldDate("Date", 0L);
            if (serverDate > 0L) {
                this.lastServerDateMs = serverDate;
            }

            if (code >= 200 && code < 300) {
                InputStream is = conn.getInputStream();
                BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line);
                }
                reader.close();
                return new HttpResult(code, sb.toString());
            }
            return new HttpResult(code, null);
        } catch (Exception ignored) {
            return new HttpResult(0, null);
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
    }

    public static String refreshSupabaseAccessToken(
            String supabaseUrl,
            String anonKey,
            String refreshToken,
            SharedPreferences prefs
    ) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(supabaseUrl + "/auth/v1/token?grant_type=refresh_token");
            conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(7000);
            conn.setReadTimeout(7000);
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("apikey", anonKey);
            conn.setDoOutput(true);

            JSONObject reqBody = new JSONObject();
            reqBody.put("refresh_token", refreshToken);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(reqBody.toString().getBytes(StandardCharsets.UTF_8));
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

                JSONObject resp = new JSONObject(sb.toString());
                String newAccess = resp.optString("access_token", "").trim();
                String newRefresh = resp.optString("refresh_token", "").trim();
                if (!newAccess.isEmpty() && prefs != null) {
                    SharedPreferences.Editor editor = prefs.edit();
                    editor.putString("auth_access_token", newAccess);
                    if (!newRefresh.isEmpty()) {
                        editor.putString("auth_refresh_token", newRefresh);
                    }
                    editor.commit();
                    return newAccess;
                }
            }
        } catch (Exception ignored) {
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
        return null;
    }

    private long parseIsoTimestampMs(String iso) {
        if (iso == null || iso.isEmpty()) return 0L;
        try {
            String normalized = iso.trim();
            if (normalized.endsWith("+00:00")) {
                normalized = normalized.substring(0, normalized.length() - 6) + "Z";
            }
            // Trim microseconds to milliseconds if present (e.g., .123456Z -> .123Z)
            int dotIdx = normalized.indexOf('.');
            int zIdx = normalized.indexOf('Z');
            if (dotIdx > 0 && zIdx > dotIdx + 4) {
                normalized = normalized.substring(0, dotIdx + 4) + "Z";
            }
            SimpleDateFormat sdf = new SimpleDateFormat(
                    dotIdx > 0 ? "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'" : "yyyy-MM-dd'T'HH:mm:ss'Z'",
                    Locale.US
            );
            sdf.setTimeZone(TimeZone.getTimeZone("UTC"));
            Date parsed = sdf.parse(normalized);
            return parsed != null ? parsed.getTime() : 0L;
        } catch (Exception ignored) {
            return 0L;
        }
    }

    private void scheduleImmediateServiceRestart() {
        try {
            Context appCtx = getApplicationContext();
            AlarmManager alarmManager = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            long triggerAt = SystemClock.elapsedRealtime() + 1000L;

            // 1. Broadcast restart via OSAServiceRestartReceiver
            Intent broadcastIntent = new Intent(appCtx, OSAServiceRestartReceiver.class);
            broadcastIntent.setAction(OSAServiceRestartReceiver.ACTION_RESTART_BG_SERVICE);
            PendingIntent broadcastPending = PendingIntent.getBroadcast(
                    appCtx,
                    9092,
                    broadcastIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            if (alarmManager != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    alarmManager.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, broadcastPending);
                } else {
                    alarmManager.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, broadcastPending);
                }
            }

            // 2. Direct ForegroundService PendingIntent on API 26+
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && alarmManager != null) {
                Intent fgIntent = new Intent(appCtx, OSABackgroundMessagingService.class);
                fgIntent.setPackage(getPackageName());
                PendingIntent fgPending = PendingIntent.getForegroundService(
                        appCtx,
                        9091,
                        fgIntent,
                        PendingIntent.FLAG_ONE_SHOT | PendingIntent.FLAG_IMMUTABLE
                );
                alarmManager.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt + 500L, fgPending);
            }
        } catch (Exception ignored) {
        }
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
        promoteToForeground();
        acquireBackgroundLocks();
        if (scheduler == null || scheduler.isShutdown()) {
            startPollingLoop();
        }
        scheduleImmediateServiceRestart();
    }

    @Override
    public void onDestroy() {
        if (scheduler != null) {
            scheduler.shutdownNow();
            scheduler = null;
        }
        releaseBackgroundLocks();
        scheduleImmediateServiceRestart();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
