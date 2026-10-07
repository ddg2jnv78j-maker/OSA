package app.osa.messaging;

import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import androidx.core.app.NotificationCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

/**
 * OSA Firebase Cloud Messaging Service.
 * - Handles high-priority incoming audio/video call pushes by starting OSACallNotificationService.
 * - Handles call cancellation pushes ('cancel_call') by immediately stopping the call notification & ringtone.
 * - Handles conversation-grouped message notifications ("2 new messages", "5 new messages") with deep-linking.
 */
public class OSAFirebaseMessagingService extends FirebaseMessagingService {
    private static final String PREFS_NAME = "osa_native_prefs";

    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        prefs.edit().putString("fcm_token", token).apply();
    }

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);
        Map<String, String> data = remoteMessage.getData();
        if (data == null || data.isEmpty()) return;

        String type = data.get("type") != null ? data.get("type") : "message";
        String callId = data.get("callId");

        // 1. Call Cancelled / Ended by Caller -> dismiss incoming call UI & stop ringtone immediately
        if ("cancel_call".equals(type) && callId != null) {
            OSACallNotificationService.stopCallNotification(this, callId);
            return;
        }

        // 2. Incoming Audio or Video Call -> start persistent foreground call service
        if ("incoming_call".equals(type) && callId != null) {
            Intent serviceIntent = new Intent(this, OSACallNotificationService.class);
            serviceIntent.putExtra("callId", callId);
            serviceIntent.putExtra("callType", data.get("callType") != null ? data.get("callType") : "audio");
            serviceIntent.putExtra("callerId", data.get("callerId"));
            serviceIntent.putExtra("callerName", data.get("callerName") != null ? data.get("callerName") : "OSA Caller");
            serviceIntent.putExtra("callerAvatar", data.get("callerAvatar"));
            serviceIntent.putExtra("chatId", data.get("chatId"));
            serviceIntent.putExtra("rejectToken", data.get("rejectToken"));
            serviceIntent.putExtra("rejectEndpoint", data.get("rejectEndpoint"));
            serviceIntent.putExtra("anonKey", data.get("anonKey"));
            OSACallNotificationService.startCallNotification(this, serviceIntent);
            return;
        }

        // 3. Grouped Chat / Group Message Notification
        showGroupedMessageNotification(data);
    }

    private void showGroupedMessageNotification(Map<String, String> data) {
        String conversationId = data.get("conversationId") != null ? data.get("conversationId") : data.get("chatId");
        String senderName = data.get("senderName") != null ? data.get("senderName") : "OSA User";
        String latestPreview = data.get("latestPreview") != null ? data.get("latestPreview") : "New message";
        int serverCount = 1;
        try {
            if (data.get("messageCount") != null) {
                serverCount = Integer.parseInt(data.get("messageCount"));
            }
        } catch (NumberFormatException ignored) {
        }

        String threadKey = conversationId != null && !conversationId.isEmpty() ? conversationId : senderName;
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        int localCount = prefs.getInt("unread_" + threadKey, 0) + 1;
        int finalCount = Math.max(serverCount, localCount);
        prefs.edit().putInt("unread_" + threadKey, finalCount).apply();

        String contentText = finalCount >= 2
                ? senderName + "\n" + finalCount + " new messages"
                : senderName + "\n" + latestPreview;

        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (conversationId != null) {
            openIntent.putExtra("chatId", conversationId);
        }

        int notificationId = ("osa_chat_" + threadKey).hashCode();
        PendingIntent pendingOpen = PendingIntent.getActivity(
                this,
                notificationId,
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, MainActivity.CHANNEL_MESSAGES)
                .setSmallIcon(android.R.drawable.sym_action_chat)
                .setContentTitle("OSA")
                .setContentText(contentText)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(contentText))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setGroup("osa_group_" + threadKey)
                .setNumber(finalCount)
                .setAutoCancel(true)
                .setContentIntent(pendingOpen);

        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify("osa-chat-" + threadKey, notificationId, builder.build());
        }
    }
}
