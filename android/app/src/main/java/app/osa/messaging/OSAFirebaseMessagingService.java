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
 * Handles real FCM data payloads for:
 * - "message": conversationId, messageId, senderId, senderName, message preview, unread count
 * - "call" / "incoming_call": callId, callerId, callerName, callType ("audio" | "video"), callerAvatar
 * - "call_cancel" / "cancel_call": callId
 */
public class OSAFirebaseMessagingService extends FirebaseMessagingService {
    public static final String PREFS_NAME = "osa_native_prefs";

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

        String rawType = data.get("type") != null ? data.get("type").trim() : "message";
        String callId = data.get("callId");

        // 1. Call Cancellation ("call_cancel" or "cancel_call")
        if (("call_cancel".equalsIgnoreCase(rawType) || "cancel_call".equalsIgnoreCase(rawType))
                && callId != null && !callId.isEmpty()) {
            OSACallNotificationService.stopCallNotification(this, callId);
            return;
        }

        // 2. Incoming Audio or Video Call ("call", "incoming_call", "audio_call", "video_call")
        if (("call".equalsIgnoreCase(rawType)
                || "incoming_call".equalsIgnoreCase(rawType)
                || "audio_call".equalsIgnoreCase(rawType)
                || "video_call".equalsIgnoreCase(rawType))
                && callId != null && !callId.isEmpty()) {
            String resolvedCallType = data.get("callType");
            if (resolvedCallType == null || resolvedCallType.isEmpty()) {
                resolvedCallType = "video_call".equalsIgnoreCase(rawType) ? "video" : "audio";
            }

            Intent serviceIntent = new Intent(this, OSACallNotificationService.class);
            serviceIntent.putExtra("callId", callId);
            serviceIntent.putExtra("callType", resolvedCallType);
            serviceIntent.putExtra("callerId", data.get("callerId") != null ? data.get("callerId") : data.get("senderId"));
            serviceIntent.putExtra("callerName", data.get("callerName") != null ? data.get("callerName") : "OSA Caller");
            serviceIntent.putExtra("callerAvatar", data.get("callerAvatar") != null ? data.get("callerAvatar") : "");
            serviceIntent.putExtra("chatId", data.get("chatId") != null ? data.get("chatId") : data.get("conversationId"));
            serviceIntent.putExtra("rejectToken", data.get("rejectToken"));
            serviceIntent.putExtra("rejectEndpoint", data.get("rejectEndpoint"));
            serviceIntent.putExtra("anonKey", data.get("anonKey"));
            OSACallNotificationService.startCallNotification(this, serviceIntent);
            return;
        }

        // 3. Message Notification ("message")
        showGroupedMessageNotification(data);
    }

    private void showGroupedMessageNotification(Map<String, String> data) {
        String conversationId = data.get("conversationId") != null && !data.get("conversationId").isEmpty()
                ? data.get("conversationId")
                : data.get("chatId");
        String messageId = data.get("messageId");
        String senderId = data.get("senderId");
        String senderName = data.get("senderName") != null && !data.get("senderName").isEmpty()
                ? data.get("senderName")
                : "OSA User";

        String latestPreview = data.get("messagePreview");
        if (latestPreview == null || latestPreview.isEmpty()) {
            latestPreview = data.get("latestPreview");
        }
        if (latestPreview == null || latestPreview.isEmpty()) {
            latestPreview = data.get("body");
        }
        if (latestPreview == null || latestPreview.isEmpty()) {
            latestPreview = "New message";
        }

        String threadKey = (conversationId != null && !conversationId.isEmpty())
                ? conversationId
                : (senderId != null && !senderId.isEmpty() ? senderId : senderName);

        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);

        // Deduplicate by messageId so the same FCM message never increments count twice
        if (messageId != null && !messageId.isEmpty()) {
            String lastMsgId = prefs.getString("last_msg_id_" + threadKey, "");
            if (messageId.equals(lastMsgId)) {
                return;
            }
            prefs.edit().putString("last_msg_id_" + threadKey, messageId).apply();
        }

        int serverCount = 0;
        try {
            String countStr = data.get("unreadCount") != null ? data.get("unreadCount") : data.get("messageCount");
            if (countStr != null && !countStr.isEmpty()) {
                serverCount = Integer.parseInt(countStr);
            }
        } catch (NumberFormatException ignored) {
        }

        int localCount = prefs.getInt("unread_" + threadKey, 0) + 1;
        int finalCount = Math.max(serverCount, localCount);
        prefs.edit().putInt("unread_" + threadKey, finalCount).apply();

        // Format:
        // 1 message:  OSA / User 2 / message preview
        // 2 messages: OSA / User 2 / 2 new messages
        // 5 messages: OSA / User 2 / 5 new messages
        String summaryLine = finalCount >= 2
                ? (finalCount + " new messages")
                : latestPreview;
        String expandedText = senderName + "\n" + summaryLine;

        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (conversationId != null && !conversationId.isEmpty()) {
            openIntent.putExtra("chatId", conversationId);
            openIntent.putExtra("conversationId", conversationId);
        }
        if (senderId != null && !senderId.isEmpty()) {
            openIntent.putExtra("senderId", senderId);
        }

        int notificationId = ("osa_chat_" + threadKey).hashCode();
        PendingIntent pendingOpen = PendingIntent.getActivity(
                this,
                notificationId,
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.InboxStyle inboxStyle = new NotificationCompat.InboxStyle()
                .setBigContentTitle("OSA")
                .setSummaryText(senderName)
                .addLine(senderName)
                .addLine(summaryLine);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, MainActivity.CHANNEL_MESSAGES)
                .setSmallIcon(android.R.drawable.sym_action_chat)
                .setContentTitle("OSA")
                .setSubText(senderName)
                .setContentText(expandedText)
                .setStyle(inboxStyle)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setGroup("osa_group_" + threadKey)
                .setNumber(finalCount)
                .setOnlyAlertOnce(false)
                .setAutoCancel(true)
                .setContentIntent(pendingOpen);

        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify("osa-chat-" + threadKey, notificationId, builder.build());
        }
    }
}
