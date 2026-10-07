package app.osa.messaging;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import org.json.JSONObject;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;

/**
 * Handles Accept and Reject actions from the native Android incoming-call notification.
 * - On ACCEPT: Stops the foreground ringtone service and launches MainActivity with callAction="accept".
 * - On REJECT: Stops the foreground ringtone service and posts reject_call to Supabase Edge Function so caller sees Rejected immediately.
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
            launchIntent.putExtra("chatId", intent.getStringExtra("chatId"));
            launchIntent.putExtra("callAction", "accept");
            context.startActivity(launchIntent);
        } else if (ACTION_REJECT_CALL.equals(action)) {
            String rejectToken = intent.getStringExtra("rejectToken");
            String rejectEndpoint = intent.getStringExtra("rejectEndpoint");
            String anonKey = intent.getStringExtra("anonKey");

            if (rejectEndpoint != null && !rejectEndpoint.isEmpty() && rejectToken != null && !rejectToken.isEmpty()) {
                final PendingResult pendingResult = goAsync();
                Executors.newSingleThreadExecutor().execute(() -> {
                    try {
                        URL url = new URL(rejectEndpoint);
                        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
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
                    } finally {
                        pendingResult.finish();
                    }
                });
            }
        }
    }
}
