package app.osa.messaging;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import org.json.JSONObject;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.Executors;

/**
 * Handles Accept and Reject actions from the native Android incoming-call notification.
 * - On ACCEPT: Stops the foreground ringtone service and launches MainActivity with callAction="accept".
 * - On REJECT: Stops the foreground ringtone service, notifies MainActivity if active, and updates
 *   Supabase via Edge Function (if rejectToken present) AND direct REST API (using stored user session)
 *   so the caller immediately sees Call Rejected even when OSA was closed or locked.
 */
public class OSACallActionReceiver extends BroadcastReceiver {
    public static final String ACTION_ACCEPT_CALL = "app.osa.messaging.ACTION_ACCEPT_CALL";
    public static final String ACTION_REJECT_CALL = "app.osa.messaging.ACTION_REJECT_CALL";
    public static final String ACTION_END_CALL = "app.osa.messaging.ACTION_END_CALL";
    public static final String ACTION_TOGGLE_MUTE_CALL = "app.osa.messaging.ACTION_TOGGLE_MUTE_CALL";
    public static final String ACTION_TOGGLE_SPEAKER_CALL = "app.osa.messaging.ACTION_TOGGLE_SPEAKER_CALL";
    public static final String ACTION_NOOP_CALL_NOTIFICATION = "app.osa.messaging.ACTION_NOOP_CALL_NOTIFICATION";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;

        String action = intent.getAction();
        if (ACTION_NOOP_CALL_NOTIFICATION.equals(action)) {
            return;
        }
        String callId = intent.getStringExtra("callId");
        if (callId == null || callId.isEmpty()) {
            callId = OSACallNotificationService.getActiveCallId();
            if (callId != null && !callId.isEmpty()) {
                intent.putExtra("callId", callId);
            }
        }
        if (callId == null || callId.isEmpty()) return;

        String callerIdExtra = intent.getStringExtra("callerId");
        if (callerIdExtra == null || callerIdExtra.isEmpty()) {
            String activePeerId = OSACallNotificationService.getActiveCallerId();
            if (activePeerId != null && !activePeerId.isEmpty()) {
                intent.putExtra("callerId", activePeerId);
            }
        }
        String callTypeExtra = intent.getStringExtra("callType");
        if (callTypeExtra == null || callTypeExtra.isEmpty()) {
            String activeType = OSACallNotificationService.getActiveCallType();
            if (activeType != null && !activeType.isEmpty()) {
                intent.putExtra("callType", activeType);
            }
        }

        if (ACTION_TOGGLE_MUTE_CALL.equals(action)) {
            boolean nextMuted = OSACallNotificationService.toggleOngoingCallMuteState(context, callId);
            MainActivity.dispatchToggleMuteCallToActiveWebView(context, callId, nextMuted);
            return;
        }

        if (ACTION_TOGGLE_SPEAKER_CALL.equals(action)) {
            boolean nextSpeakerOn = OSACallNotificationService.toggleOngoingCallSpeakerState(context, callId);
            MainActivity.dispatchToggleSpeakerCallToActiveWebView(context, callId, nextSpeakerOn);
            return;
        }

        if (ACTION_ACCEPT_CALL.equals(action)) {
            String callType = intent.getStringExtra("callType");
            boolean isVideo = "video".equalsIgnoreCase(callType);
            if (!isVideo) {
                // Audio call: answer directly in the background without opening or foregrounding MainActivity
                OSACallNotificationService.acceptIncomingAudioCallInBackground(context, intent);
                return;
            }

            // Video call: transition notification to Ongoing Call and launch MainActivity video call screen
            OSACallNotificationService.startOngoingCallNotification(
                    context,
                    callId,
                    callType,
                    intent.getStringExtra("callerId"),
                    intent.getStringExtra("callerName"),
                    intent.getStringExtra("chatId")
            );
            OSAIncomingCallActivity.finishIfMatchingCall(callId);

            Intent launchIntent = new Intent(context, MainActivity.class);
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            launchIntent.putExtra("callId", callId);
            launchIntent.putExtra("callType", callType);
            launchIntent.putExtra("callerId", intent.getStringExtra("callerId"));
            launchIntent.putExtra("callerName", intent.getStringExtra("callerName"));
            launchIntent.putExtra("callerAvatar", intent.getStringExtra("callerAvatar"));
            launchIntent.putExtra("chatId", intent.getStringExtra("chatId"));
            launchIntent.putExtra("callAction", "accept");
            context.startActivity(launchIntent);
        } else if (ACTION_REJECT_CALL.equals(action)) {
            OSACallNotificationService.endCallAndCleanup(context, callId);
            OSAIncomingCallActivity.finishIfMatchingCall(callId);
            final PendingResult pendingResult = goAsync();
            executeRejectCallAsync(context, intent, pendingResult);
        } else if (ACTION_END_CALL.equals(action)) {
            OSACallNotificationService.endCallAndCleanup(context, callId);
            OSAIncomingCallActivity.finishIfMatchingCall(callId);
            final PendingResult pendingResult = goAsync();
            executeEndCallAsync(context, intent, pendingResult);
        }
    }

    public static void handleEndCallIntent(Context context, Intent intent) {
        if (context == null || intent == null) return;
        String callId = intent.getStringExtra("callId");
        if (callId == null || callId.isEmpty()) return;
        OSACallNotificationService.endCallAndCleanup(context, callId);
        OSAIncomingCallActivity.finishIfMatchingCall(callId);
        executeEndCallAsync(context.getApplicationContext(), intent, null);
    }

    public static void handleRejectCallIntent(Context context, Intent intent) {
        if (context == null || intent == null) return;
        String callId = intent.getStringExtra("callId");
        if (callId == null || callId.isEmpty()) return;
        OSACallNotificationService.endCallAndCleanup(context, callId);
        OSAIncomingCallActivity.finishIfMatchingCall(callId);
        executeRejectCallAsync(context.getApplicationContext(), intent, null);
    }

    private static void executeEndCallAsync(
            final Context context,
            final Intent intent,
            final PendingResult pendingResult
    ) {
        final String callId = intent.getStringExtra("callId");
        if (callId == null || callId.isEmpty()) {
            if (pendingResult != null) pendingResult.finish();
            return;
        }
        final String peerId = intent.getStringExtra("callerId");
        final String callType = intent.getStringExtra("callType");

        MainActivity.notifyCallEndedFromNotification(callId, callType);

        final SharedPreferences prefs = context.getSharedPreferences(
                OSAFirebaseMessagingService.PREFS_NAME,
                Context.MODE_PRIVATE
        );
        final String supabaseUrl = prefs.getString("auth_supabase_url", "");
        final String storedAnonKey = prefs.getString("auth_anon_key", "");
        final String accessToken = prefs.getString("auth_access_token", "");
        final String userId = prefs.getString("auth_user_id", "");

        Executors.newSingleThreadExecutor().execute(() -> {
            try {
                if (supabaseUrl != null && !supabaseUrl.isEmpty()
                        && storedAnonKey != null && !storedAnonKey.isEmpty()
                        && accessToken != null && !accessToken.isEmpty()) {
                    SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
                    sdf.setTimeZone(TimeZone.getTimeZone("UTC"));
                    String nowIso = sdf.format(new Date());

                    String currentToken = accessToken;
                    boolean rpcHandled = false;
                    try {
                        int rpcCode = executeRespondToCallRpc(supabaseUrl, storedAnonKey, currentToken, callId, "ended");
                        if (rpcCode == 401) {
                            String refreshToken = prefs.getString("auth_refresh_token", "");
                            if (refreshToken != null && !refreshToken.isEmpty()) {
                                String refreshed = OSABackgroundMessagingService.refreshSupabaseAccessToken(
                                        supabaseUrl,
                                        storedAnonKey,
                                        refreshToken,
                                        prefs
                                );
                                if (refreshed != null && !refreshed.isEmpty()) {
                                    currentToken = refreshed;
                                    rpcCode = executeRespondToCallRpc(supabaseUrl, storedAnonKey, currentToken, callId, "ended");
                                }
                            }
                        }
                        if (rpcCode >= 200 && rpcCode < 300) {
                            rpcHandled = true;
                        }
                    } catch (Exception ignored) {
                    }

                    if (!rpcHandled) {
                        try {
                            executeStatusPatch(supabaseUrl, storedAnonKey, currentToken, callId, "ended", nowIso);
                        } catch (Exception ignored) {
                        }

                        if (peerId != null && !peerId.isEmpty() && userId != null && !userId.isEmpty()) {
                            try {
                                URL sigUrl = new URL(supabaseUrl + "/rest/v1/call_signals");
                                HttpURLConnection sigConn = (HttpURLConnection) sigUrl.openConnection();
                                sigConn.setConnectTimeout(8000);
                                sigConn.setReadTimeout(8000);
                                sigConn.setRequestMethod("POST");
                                sigConn.setRequestProperty("Content-Type", "application/json");
                                sigConn.setRequestProperty("Prefer", "return=minimal");
                                sigConn.setRequestProperty("apikey", storedAnonKey);
                                sigConn.setRequestProperty("Authorization", "Bearer " + currentToken);
                                sigConn.setDoOutput(true);

                                JSONObject sigObj = new JSONObject();
                                sigObj.put("call_id", callId);
                                sigObj.put("sender_id", userId);
                                sigObj.put("receiver_id", peerId);
                                sigObj.put("signal_type", "hangup");
                                sigObj.put("payload", new JSONObject().put("source", "android_ongoing_notification"));

                                try (OutputStream os = sigConn.getOutputStream()) {
                                    os.write(sigObj.toString().getBytes(StandardCharsets.UTF_8));
                                }
                                sigConn.getResponseCode();
                                sigConn.disconnect();
                            } catch (Exception ignored) {
                            }
                        }
                    }
                }
            } catch (Exception ignored) {
            } finally {
                if (pendingResult != null) {
                    pendingResult.finish();
                }
            }
        });
    }

    private static void executeRejectCallAsync(
            final Context context,
            final Intent intent,
            final PendingResult pendingResult
    ) {
        final String callId = intent.getStringExtra("callId");
        if (callId == null || callId.isEmpty()) {
            if (pendingResult != null) pendingResult.finish();
            return;
        }
        final String callerId = intent.getStringExtra("callerId");
        final String callType = intent.getStringExtra("callType");
        final String rejectToken = intent.getStringExtra("rejectToken");
        final String rejectEndpoint = intent.getStringExtra("rejectEndpoint");
        final String anonKey = intent.getStringExtra("anonKey");

        MainActivity.notifyCallRejectedFromNotification(callId, callType);

        final SharedPreferences prefs = context.getSharedPreferences(
                OSAFirebaseMessagingService.PREFS_NAME,
                Context.MODE_PRIVATE
        );
        final String supabaseUrl = prefs.getString("auth_supabase_url", "");
        final String storedAnonKey = prefs.getString("auth_anon_key", "");
        final String accessToken = prefs.getString("auth_access_token", "");
        final String userId = prefs.getString("auth_user_id", "");

        Executors.newSingleThreadExecutor().execute(() -> {
            try {
                // 1. If Edge Function rejectToken is present, invoke send-web-push reject_call
                if (rejectEndpoint != null && !rejectEndpoint.isEmpty()
                        && rejectToken != null && !rejectToken.isEmpty()) {
                    try {
                        URL url = new URL(rejectEndpoint);
                        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                        conn.setConnectTimeout(8000);
                        conn.setReadTimeout(8000);
                        conn.setRequestMethod("POST");
                        conn.setRequestProperty("Content-Type", "application/json");
                        if (anonKey != null && !anonKey.isEmpty()) {
                            conn.setRequestProperty("apikey", anonKey);
                            conn.setRequestProperty("Authorization", "Bearer " + anonKey);
                        }
                        conn.setDoOutput(true);

                        JSONObject body = new JSONObject();
                        body.put("action", "reject_call");
                        body.put("callId", callId);
                        body.put("rejectToken", rejectToken);

                        try (OutputStream os = conn.getOutputStream()) {
                            os.write(body.toString().getBytes(StandardCharsets.UTF_8));
                        }
                        conn.getResponseCode();
                        conn.disconnect();
                    } catch (Exception ignored) {
                    }
                }

                // 2. Also update Supabase REST API directly using authenticated user session
                if (supabaseUrl != null && !supabaseUrl.isEmpty()
                        && storedAnonKey != null && !storedAnonKey.isEmpty()
                        && accessToken != null && !accessToken.isEmpty()) {
                    SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
                    sdf.setTimeZone(TimeZone.getTimeZone("UTC"));
                    String nowIso = sdf.format(new Date());

                    // 2a. First call atomic RPC respond_to_call_native (uses standard POST, updates calls + call_signals)
                    String currentToken = accessToken;
                    boolean rpcHandled = false;
                    try {
                        int rpcCode = executeRespondToCallRpc(supabaseUrl, storedAnonKey, currentToken, callId, "rejected");
                        if (rpcCode == 401) {
                            String refreshToken = prefs.getString("auth_refresh_token", "");
                            if (refreshToken != null && !refreshToken.isEmpty()) {
                                String refreshed = OSABackgroundMessagingService.refreshSupabaseAccessToken(
                                        supabaseUrl,
                                        storedAnonKey,
                                        refreshToken,
                                        prefs
                                );
                                if (refreshed != null && !refreshed.isEmpty()) {
                                    currentToken = refreshed;
                                    rpcCode = executeRespondToCallRpc(supabaseUrl, storedAnonKey, currentToken, callId, "rejected");
                                }
                            }
                        }
                        if (rpcCode >= 200 && rpcCode < 300) {
                            rpcHandled = true;
                        }
                    } catch (Exception ignored) {
                    }

                    // 2b. Fallback: PATCH public.calls -> status = "rejected" + POST public.call_signals
                    if (!rpcHandled) {
                        try {
                            int patchCode = executeRejectPatch(supabaseUrl, storedAnonKey, currentToken, callId, nowIso);
                            if (patchCode == 401) {
                                String refreshToken = prefs.getString("auth_refresh_token", "");
                                if (refreshToken != null && !refreshToken.isEmpty()) {
                                    String refreshed = OSABackgroundMessagingService.refreshSupabaseAccessToken(
                                            supabaseUrl,
                                            storedAnonKey,
                                            refreshToken,
                                            prefs
                                    );
                                    if (refreshed != null && !refreshed.isEmpty()) {
                                        currentToken = refreshed;
                                        executeRejectPatch(supabaseUrl, storedAnonKey, currentToken, callId, nowIso);
                                    }
                                }
                            }
                        } catch (Exception ignored) {
                        }

                        if (callerId != null && !callerId.isEmpty() && userId != null && !userId.isEmpty()) {
                            try {
                                URL sigUrl = new URL(supabaseUrl + "/rest/v1/call_signals");
                                HttpURLConnection sigConn = (HttpURLConnection) sigUrl.openConnection();
                                sigConn.setConnectTimeout(8000);
                                sigConn.setReadTimeout(8000);
                                sigConn.setRequestMethod("POST");
                                sigConn.setRequestProperty("Content-Type", "application/json");
                                sigConn.setRequestProperty("Prefer", "return=minimal");
                                sigConn.setRequestProperty("apikey", storedAnonKey);
                                sigConn.setRequestProperty("Authorization", "Bearer " + currentToken);
                                sigConn.setDoOutput(true);

                                JSONObject sigObj = new JSONObject();
                                sigObj.put("call_id", callId);
                                sigObj.put("sender_id", userId);
                                sigObj.put("receiver_id", callerId);
                                sigObj.put("signal_type", "reject");
                                sigObj.put("payload", new JSONObject().put("source", "android_notification"));

                                try (OutputStream os = sigConn.getOutputStream()) {
                                    os.write(sigObj.toString().getBytes(StandardCharsets.UTF_8));
                                }
                                sigConn.getResponseCode();
                                sigConn.disconnect();
                            } catch (Exception ignored) {
                            }
                        }
                    }
                }
            } catch (Exception ignored) {
            } finally {
                if (pendingResult != null) {
                    pendingResult.finish();
                }
            }
        });
    }

    private static int executeRespondToCallRpc(
            String supabaseUrl,
            String anonKey,
            String accessToken,
            String callId,
            String status
    ) throws Exception {
        URL rpcUrl = new URL(supabaseUrl + "/rest/v1/rpc/respond_to_call_native");
        HttpURLConnection conn = (HttpURLConnection) rpcUrl.openConnection();
        conn.setConnectTimeout(8000);
        conn.setReadTimeout(8000);
        conn.setRequestMethod("POST");
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setRequestProperty("apikey", anonKey);
        conn.setRequestProperty("Authorization", "Bearer " + accessToken);
        conn.setDoOutput(true);

        JSONObject req = new JSONObject();
        req.put("p_call_id", callId);
        req.put("p_status", status);

        try (OutputStream os = conn.getOutputStream()) {
            os.write(req.toString().getBytes(StandardCharsets.UTF_8));
        }
        int code = conn.getResponseCode();
        conn.disconnect();
        return code;
    }

    private static int executeRejectPatch(
            String supabaseUrl,
            String anonKey,
            String accessToken,
            String callId,
            String nowIso
    ) throws Exception {
        return executeStatusPatch(supabaseUrl, anonKey, accessToken, callId, "rejected", nowIso);
    }

    private static int executeStatusPatch(
            String supabaseUrl,
            String anonKey,
            String accessToken,
            String callId,
            String status,
            String nowIso
    ) throws Exception {
        URL patchUrl = new URL(supabaseUrl + "/rest/v1/calls?id=eq." + callId);
        HttpURLConnection patchConn = (HttpURLConnection) patchUrl.openConnection();
        patchConn.setConnectTimeout(8000);
        patchConn.setReadTimeout(8000);
        patchConn.setRequestMethod("PATCH");
        patchConn.setRequestProperty("Content-Type", "application/json");
        patchConn.setRequestProperty("Prefer", "return=minimal");
        patchConn.setRequestProperty("apikey", anonKey);
        patchConn.setRequestProperty("Authorization", "Bearer " + accessToken);
        patchConn.setDoOutput(true);

        JSONObject updateObj = new JSONObject();
        updateObj.put("status", status);
        updateObj.put("ended_at", nowIso);
        updateObj.put("updated_at", nowIso);

        try (OutputStream os = patchConn.getOutputStream()) {
            os.write(updateObj.toString().getBytes(StandardCharsets.UTF_8));
        }
        int code = patchConn.getResponseCode();
        patchConn.disconnect();
        return code;
    }
}
