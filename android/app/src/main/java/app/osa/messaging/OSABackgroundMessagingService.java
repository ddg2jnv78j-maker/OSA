package app.osa.messaging;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.IBinder;
import android.os.SystemClock;
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
 * OSA Native Android Background Notification & Call Sync Service.
 * Works alongside OSAFirebaseMessagingService so that across:
 * A) Foreground
 * B) Background
 * C) Screen locked
 * D) App closed/swiped from Recents
 * incoming messages, incoming audio/video calls, and call cancellations are delivered
 * reliably with strict messageId/callId deduplication (zero duplicate notifications).
 */
public class OSABackgroundMessagingService extends Service {
    private ScheduledExecutorService scheduler;
    private final Map<String, String> profileNameCache = new ConcurrentHashMap<>();
    private String lastCheckedMessageIso = null;
    private String activeUserId = null;

    public static void ensureStarted(Context context) {
        if (context == null) return;
        try {
            Intent intent = new Intent(context, OSABackgroundMessagingService.class);
            context.startService(intent);
        } catch (Exception ignored) {
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        MainActivity.ensureNotificationChannels(this);
        resetWatermarkNow();
        startPollingLoop();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        MainActivity.ensureNotificationChannels(this);
        if (scheduler == null || scheduler.isShutdown()) {
            startPollingLoop();
        }
        return START_STICKY;
    }

    private void resetWatermarkNow() {
        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        sdf.setTimeZone(TimeZone.getTimeZone("UTC"));
        // Start watermark 5 seconds in the past so only newly arriving messages trigger notifications
        this.lastCheckedMessageIso = sdf.format(new Date(System.currentTimeMillis() - 5000L));
    }

    private void startPollingLoop() {
        if (scheduler != null && !scheduler.isShutdown()) {
            scheduler.shutdownNow();
        }
        scheduler = Executors.newSingleThreadScheduledExecutor();
        scheduler.scheduleWithFixedDelay(this::pollSupabaseEventsSafely, 1500, 2500, TimeUnit.MILLISECONDS);
    }

    private void pollSupabaseEventsSafely() {
        try {
            SharedPreferences prefs = getSharedPreferences(OSAFirebaseMessagingService.PREFS_NAME, MODE_PRIVATE);
            String userId = prefs.getString("auth_user_id", "");
            String accessToken = prefs.getString("auth_access_token", "");
            String supabaseUrl = prefs.getString("auth_supabase_url", "");
            String anonKey = prefs.getString("auth_anon_key", "");

            if (userId == null || userId.isEmpty()
                    || accessToken == null || accessToken.isEmpty()
                    || supabaseUrl == null || supabaseUrl.isEmpty()
                    || anonKey == null || anonKey.isEmpty()) {
                return;
            }

            if (!userId.equals(activeUserId)) {
                activeUserId = userId;
                resetWatermarkNow();
            }

            if (lastCheckedMessageIso == null) {
                resetWatermarkNow();
            }

            pollIncomingAndCancelledCalls(supabaseUrl, anonKey, accessToken, userId);
            pollIncomingMessages(supabaseUrl, anonKey, accessToken, userId);
        } catch (Exception ignored) {
        }
    }

    private void pollIncomingAndCancelledCalls(
            String supabaseUrl,
            String anonKey,
            String accessToken,
            String userId
    ) {
        try {
            SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
            sdf.setTimeZone(TimeZone.getTimeZone("UTC"));
            String cutoffIso = sdf.format(new Date(System.currentTimeMillis() - 50000L));

            String queryUrl = supabaseUrl
                    + "/rest/v1/calls?receiver_id=eq." + URLEncoder.encode(userId, "UTF-8")
                    + "&created_at=gt." + URLEncoder.encode(cutoffIso, "UTF-8")
                    + "&order=created_at.desc&limit=5";

            String responseJson = executeGet(queryUrl, anonKey, accessToken);
            if (responseJson == null || responseJson.isEmpty()) return;

            JSONArray arr = new JSONArray(responseJson);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject row = arr.optJSONObject(i);
                if (row == null) continue;

                String callId = row.optString("id", "").trim();
                String status = row.optString("status", "").trim().toLowerCase(Locale.US);
                String callerId = row.optString("caller_id", "").trim();
                String receiverId = row.optString("receiver_id", "").trim();
                String callType = row.optString("call_type", "audio").trim();
                String chatId = row.isNull("chat_id") ? "" : row.optString("chat_id", "").trim();

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
                    }
                    continue;
                }

                if ("calling".equals(status) || "ringing".equals(status)) {
                    if (!OSACallNotificationService.isCallAlreadyHandledOrActive(callId)) {
                        String callerName = resolveProfileName(supabaseUrl, anonKey, accessToken, callerId);
                        Map<String, String> callData = new HashMap<>();
                        callData.put("type", "incoming_call");
                        callData.put("callId", callId);
                        callData.put("callType", callType);
                        callData.put("callerId", callerId);
                        callData.put("callerName", callerName);
                        callData.put("chatId", chatId);
                        OSACallNotificationService.startCallNotificationFromData(this, callData);

                        if ("calling".equals(status)) {
                            markCallRingingOnServer(supabaseUrl, anonKey, accessToken, callId, userId, callerId);
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
            String userId
    ) {
        try {
            String queryUrl = supabaseUrl
                    + "/rest/v1/messages?sender_id=neq." + URLEncoder.encode(userId, "UTF-8")
                    + "&created_at=gt." + URLEncoder.encode(lastCheckedMessageIso, "UTF-8")
                    + "&order=created_at.asc&limit=10"
                    + "&select=id,chat_id,sender_id,content,message_type,created_at";

            String responseJson = executeGet(queryUrl, anonKey, accessToken);
            if (responseJson == null || responseJson.isEmpty()) return;

            JSONArray arr = new JSONArray(responseJson);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject row = arr.optJSONObject(i);
                if (row == null) continue;

                String msgId = row.optString("id", "").trim();
                String chatId = row.optString("chat_id", "").trim();
                String senderId = row.optString("sender_id", "").trim();
                String content = row.optString("content", "").trim();
                String messageType = row.optString("message_type", "text").trim().toLowerCase(Locale.US);
                String createdAt = row.optString("created_at", "").trim();

                if (!createdAt.isEmpty()) {
                    lastCheckedMessageIso = createdAt;
                }

                if (msgId.isEmpty() || senderId.isEmpty() || userId.equals(senderId)) {
                    continue;
                }

                if (OSAFirebaseMessagingService.isRemoteControlSignal(content)) {
                    continue;
                }

                if (OSAFirebaseMessagingService.isMessageAlreadyDelivered(this, msgId)) {
                    continue;
                }

                String senderName = resolveProfileName(supabaseUrl, anonKey, accessToken, senderId);
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

    private String resolveProfileName(
            String supabaseUrl,
            String anonKey,
            String accessToken,
            String profileId
    ) {
        if (profileId == null || profileId.isEmpty()) return "OSA User";
        String cached = profileNameCache.get(profileId);
        if (cached != null && !cached.isEmpty()) return cached;

        try {
            String url = supabaseUrl
                    + "/rest/v1/profiles?id=eq." + URLEncoder.encode(profileId, "UTF-8")
                    + "&select=full_name&limit=1";
            String json = executeGet(url, anonKey, accessToken);
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

    private String executeGet(String urlStr, String anonKey, String accessToken) {
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
            if (code >= 200 && code < 300) {
                InputStream is = conn.getInputStream();
                BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line);
                }
                reader.close();
                return sb.toString();
            }
        } catch (Exception ignored) {
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
        return null;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
        try {
            Intent restartIntent = new Intent(getApplicationContext(), OSABackgroundMessagingService.class);
            restartIntent.setPackage(getPackageName());
            PendingIntent restartPending = PendingIntent.getService(
                    getApplicationContext(),
                    9091,
                    restartIntent,
                    PendingIntent.FLAG_ONE_SHOT | PendingIntent.FLAG_IMMUTABLE
            );
            AlarmManager alarmManager = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            if (alarmManager != null) {
                alarmManager.set(
                        AlarmManager.ELAPSED_REALTIME,
                        SystemClock.elapsedRealtime() + 1500L,
                        restartPending
                );
            }
        } catch (Exception ignored) {
        }
    }

    @Override
    public void onDestroy() {
        if (scheduler != null) {
            scheduler.shutdownNow();
            scheduler = null;
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
