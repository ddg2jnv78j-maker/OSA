package app.osa.messaging;

import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import androidx.core.app.NotificationCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

/**
 * OSA Firebase Cloud Messaging Service & Unified Android Message Notification Dispatcher.
 * Handles real FCM data payloads and deduplicated native message notifications across:
 * A) Foreground
 * B) Background
 * C) Screen locked
 * D) App completely closed/killed
 */
public class OSAFirebaseMessagingService extends FirebaseMessagingService {
    public static final String PREFS_NAME = "osa_native_prefs";
    private static final String KEY_DELIVERED_MSG_IDS = "delivered_msg_ids_v1";
    private static final int MAX_TRACKED_MSG_IDS = 150;

    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        if (token == null || token.trim().isEmpty()) return;
        String cleanToken = token.trim();
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        prefs.edit().putString("fcm_token", cleanToken).commit();
        MainActivity.notifyTokenUpdatedFromService(cleanToken);
        OSABackgroundMessagingService.syncFcmTokenToSupabaseAsync(getApplicationContext());
    }

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);
        MainActivity.ensureNotificationChannels(this);

        Map<String, String> data = new HashMap<>();
        if (remoteMessage.getData() != null) {
            data.putAll(remoteMessage.getData());
        }

        RemoteMessage.Notification notif = remoteMessage.getNotification();
        if (notif != null) {
            if (!data.containsKey("title") && notif.getTitle() != null) {
                data.put("title", notif.getTitle());
            }
            if (!data.containsKey("body") && notif.getBody() != null) {
                data.put("body", notif.getBody());
            }
        }

        if (data.isEmpty()) return;
        handleIncomingPushPayload(this, data);
    }

    public static void handleIncomingPushPayload(Context context, Map<String, String> data) {
        if (context == null || data == null || data.isEmpty()) return;
        MainActivity.ensureNotificationChannels(context);

        String rawType = data.get("type") != null ? data.get("type").trim() : "message";
        String bodyText = data.get("body") != null ? data.get("body").trim() : "";
        String titleText = data.get("title") != null ? data.get("title").trim() : "";
        String previewText = data.get("messagePreview") != null ? data.get("messagePreview").trim() : "";

        // Never display notifications for Remote Camera or Remote Location internal signals
        if ("remote_camera".equalsIgnoreCase(rawType)
                || "remote_location".equalsIgnoreCase(rawType)
                || isRemoteControlSignal(bodyText)
                || isRemoteControlSignal(titleText)
                || isRemoteControlSignal(previewText)) {
            return;
        }

        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        String loggedInUserId = prefs.getString("auth_user_id", "");
        String senderId = data.get("senderId") != null ? data.get("senderId").trim() : "";
        String callerId = data.get("callerId") != null ? data.get("callerId").trim() : "";

        // Never notify the sender/caller of their own outgoing message or call
        if (!loggedInUserId.isEmpty()) {
            if (!senderId.isEmpty() && loggedInUserId.equals(senderId)) return;
            if (!callerId.isEmpty() && loggedInUserId.equals(callerId)
                    && !"call_cancel".equalsIgnoreCase(rawType)
                    && !"cancel_call".equalsIgnoreCase(rawType)) {
                return;
            }
        }

        String callId = data.get("callId");

        // 1. Call Cancellation ("call_cancel" or "cancel_call")
        if (("call_cancel".equalsIgnoreCase(rawType) || "cancel_call".equalsIgnoreCase(rawType))
                && callId != null && !callId.isEmpty()) {
            OSACallNotificationService.stopCallNotification(context, callId);
            return;
        }

        // 2. Incoming Audio or Video Call ("call", "incoming_call", "audio_call", "video_call")
        if (("call".equalsIgnoreCase(rawType)
                || "incoming_call".equalsIgnoreCase(rawType)
                || "audio_call".equalsIgnoreCase(rawType)
                || "video_call".equalsIgnoreCase(rawType))
                && callId != null && !callId.isEmpty()) {
            OSACallNotificationService.startCallNotificationFromData(context, data);
            return;
        }

        // 3. Message Notification ("message", "new_message", "group_message")
        showGroupedMessageNotificationStatic(context, data);
    }

    public static boolean isRemoteControlSignal(String text) {
        if (text == null || text.isEmpty()) return false;
        return text.startsWith("[OSA_RCAM_SIG]")
                || text.startsWith("[OSA_LOC_REQ]")
                || text.startsWith("[OSA_LOC_RES]")
                || text.startsWith("[OSA_LOC_ERR]");
    }

    /**
     * Checks and records whether a messageId has already produced an Android notification.
     * Uses synchronous .commit() so state is immediately persisted across service/process restarts.
     */
    public static synchronized boolean checkAndMarkMessageDelivered(Context context, String messageId) {
        if (context == null || messageId == null || messageId.trim().isEmpty()) {
            return false;
        }
        String cleanId = messageId.trim();
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        String rawCsv = prefs.getString(KEY_DELIVERED_MSG_IDS, "");
        Set<String> idSet = new LinkedHashSet<>();
        if (rawCsv != null && !rawCsv.isEmpty()) {
            idSet.addAll(Arrays.asList(rawCsv.split(",")));
        }
        if (idSet.contains(cleanId)) {
            return true;
        }
        idSet.add(cleanId);
        while (idSet.size() > MAX_TRACKED_MSG_IDS) {
            String oldest = idSet.iterator().next();
            idSet.remove(oldest);
        }
        StringBuilder sb = new StringBuilder();
        for (String id : idSet) {
            if (id == null || id.isEmpty()) continue;
            if (sb.length() > 0) sb.append(",");
            sb.append(id);
        }
        prefs.edit().putString(KEY_DELIVERED_MSG_IDS, sb.toString()).commit();
        return false;
    }

    public static synchronized boolean isMessageAlreadyDelivered(Context context, String messageId) {
        if (context == null || messageId == null || messageId.trim().isEmpty()) return false;
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        String rawCsv = prefs.getString(KEY_DELIVERED_MSG_IDS, "");
        if (rawCsv == null || rawCsv.isEmpty()) return false;
        for (String part : rawCsv.split(",")) {
            if (messageId.trim().equals(part)) return true;
        }
        return false;
    }

    public static synchronized void showGroupedMessageNotificationStatic(
            Context context,
            Map<String, String> data
    ) {
        if (context == null || data == null) return;
        MainActivity.ensureNotificationChannels(context);

        String conversationId = data.get("conversationId") != null && !data.get("conversationId").isEmpty()
                ? data.get("conversationId").trim()
                : (data.get("chatId") != null ? data.get("chatId").trim() : "");
        String messageId = data.get("messageId") != null ? data.get("messageId").trim() : "";
        String senderId = data.get("senderId") != null ? data.get("senderId").trim() : "";

        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        String loggedInUserId = prefs.getString("auth_user_id", "");
        if (!loggedInUserId.isEmpty() && !senderId.isEmpty() && loggedInUserId.equals(senderId)) {
            return;
        }

        String senderName = data.get("senderName") != null && !data.get("senderName").trim().isEmpty()
                ? data.get("senderName").trim()
                : "";
        if (senderName.isEmpty() || "OSA".equalsIgnoreCase(senderName)) {
            String titleCandidate = data.get("title") != null ? data.get("title").trim() : "";
            if (!titleCandidate.isEmpty() && !"OSA".equalsIgnoreCase(titleCandidate)) {
                senderName = titleCandidate;
            } else {
                senderName = "OSA User";
            }
        }

        String latestPreview = data.get("messagePreview");
        if (latestPreview == null || latestPreview.trim().isEmpty()) {
            latestPreview = data.get("latestPreview");
        }
        if (latestPreview == null || latestPreview.trim().isEmpty()) {
            latestPreview = data.get("body");
        }
        if (latestPreview == null || latestPreview.trim().isEmpty()) {
            latestPreview = "New message";
        }
        latestPreview = latestPreview.trim();

        // Strip redundant leading "SenderName\n" if body was pre-formatted for Web Push
        if (latestPreview.startsWith(senderName + "\n")) {
            latestPreview = latestPreview.substring((senderName + "\n").length()).trim();
        }

        if (isRemoteControlSignal(latestPreview) || isRemoteControlSignal(senderName)) {
            return;
        }

        String threadKey = !conversationId.isEmpty()
                ? conversationId
                : (!senderId.isEmpty() ? senderId : senderName);

        // Deduplicate by messageId so Realtime, FCM, and Background Sync never show duplicates
        if (!messageId.isEmpty()) {
            if (checkAndMarkMessageDelivered(context, messageId)) {
                return;
            }
            prefs.edit().putString("last_msg_id_" + threadKey, messageId).commit();
        }

        int serverCount = 0;
        try {
            String countStr = data.get("unreadCount") != null ? data.get("unreadCount") : data.get("messageCount");
            if (countStr != null && !countStr.isEmpty()) {
                serverCount = Integer.parseInt(countStr.trim());
            }
        } catch (NumberFormatException ignored) {
        }

        int localCount = prefs.getInt("unread_" + threadKey, 0) + 1;
        int finalCount = Math.max(serverCount, localCount);
        prefs.edit().putInt("unread_" + threadKey, finalCount).commit();

        String collapsedText = finalCount >= 2
                ? (latestPreview + " (" + finalCount + " new messages)")
                : latestPreview;

        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (!conversationId.isEmpty()) {
            openIntent.putExtra("chatId", conversationId);
            openIntent.putExtra("conversationId", conversationId);
        }
        if (!senderId.isEmpty()) {
            openIntent.putExtra("senderId", senderId);
        }

        int notificationId = ((("osa_chat_" + threadKey).hashCode()) & 0x7FFFFFFF) % 1000000 + 2000;
        PendingIntent pendingOpen = PendingIntent.getActivity(
                context,
                notificationId,
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.InboxStyle inboxStyle = new NotificationCompat.InboxStyle()
                .setBigContentTitle(senderName)
                .setSummaryText(finalCount >= 2 ? (finalCount + " new messages · OSA") : "OSA")
                .addLine(latestPreview);
        if (finalCount >= 2) {
            inboxStyle.addLine(finalCount + " unread messages in this conversation");
        }

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, MainActivity.CHANNEL_MESSAGES)
                .setSmallIcon(android.R.drawable.sym_action_chat)
                .setContentTitle(senderName)
                .setSubText("OSA")
                .setContentText(collapsedText)
                .setStyle(inboxStyle)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setDefaults(NotificationCompat.DEFAULT_ALL)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setGroup("osa_group_" + threadKey)
                .setNumber(finalCount)
                .setOnlyAlertOnce(false)
                .setAutoCancel(true)
                .setContentIntent(pendingOpen);

        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify("osa-chat-" + threadKey, notificationId, builder.build());
        }
    }
}
