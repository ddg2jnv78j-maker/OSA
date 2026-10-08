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

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;

        String action = intent.getAction();
        String callId = intent.getStringExtra("callId");
        if (callId == null || callId.isEmpty()) return;

        // Always stop the ringing notification first
        OSACallNotificationService.stopCallNotification(context, callId);

        if (ACTION_ACCEPT_CALL.equals(action)) {
            Intent launchIntent = new Intent(context, MainActivity.class);
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            launchIntent.putExtra("callId", callId);
            launchIntent.putExtra("callType", intent.getStringExtra("callType"));
            launchIntent.putExtra("callerId", intent.getStringExtra("callerId"));
            launchIntent.putExtra("callerName", intent.getStringExtra("callerName"));
            launchIntent.putExtra("chatId", intent.getStringExtra("chatId"));
            launchIntent.putExtra("callAction", "accept");
            context.startActivity(launchIntent);
        } else if (ACTION_REJECT_CALL.equals(action)) {
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

            final PendingResult pendingResult = goAsync();
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

                        // 2a. PATCH public.calls -> status = "rejected"
                        try {
                            URL patchUrl = new URL(supabaseUrl + "/rest/v1/calls?id=eq." + callId);
                            HttpURLConnection patchConn = (HttpURLConnection) patchUrl.openConnection();
                            patchConn.setConnectTimeout(8000);
                            patchConn.setReadTimeout(8000);
                            patchConn.setRequestMethod("POST");
                            patchConn.setRequestProperty("X-HTTP-Method-Override", "PATCH");
                            patchConn.setRequestProperty("Content-Type", "application/json");
                            patchConn.setRequestProperty("Prefer", "return=minimal");
                            patchConn.setRequestProperty("apikey", storedAnonKey);
                            patchConn.setRequestProperty("Authorization", "Bearer " + accessToken);
                            patchConn.setDoOutput(true);

                            JSONObject updateObj = new JSONObject();
                            updateObj.put("status", "rejected");
                            updateObj.put("ended_at", nowIso);
                            updateObj.put("updated_at", nowIso);

                            try (OutputStream os = patchConn.getOutputStream()) {
                                os.write(updateObj.toString().getBytes(StandardCharsets.UTF_8));
                            }
                            patchConn.getResponseCode();
                            patchConn.disconnect();
                        } catch (Exception ignored) {
                        }

                        // 2b. POST public.call_signals -> signal_type = "reject"
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
                                sigConn.setRequestProperty("Authorization", "Bearer " + accessToken);
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
                } catch (Exception ignored) {
                } finally {
                    pendingResult.finish();
                }
            });
        }
    }
}
