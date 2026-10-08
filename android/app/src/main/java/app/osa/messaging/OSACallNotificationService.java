package app.osa.messaging;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import androidx.core.app.NotificationCompat;
import androidx.core.app.Person;
import androidx.core.content.ContextCompat;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

/**
 * OSA Persistent Foreground Incoming Call Service for Android.
 * Displays a persistent NotificationCompat.CallStyle incoming-call notification with full-screen
 * lock-screen intent, Accept & Reject buttons, system ringtone + vibration, WakeLock for locked screen,
 * deduplication by callId, and 45s timeout.
 */
public class OSACallNotificationService extends Service {
    private static String currentRingingCallId = null;
    private static final Set<String> terminatedCallIds = new LinkedHashSet<>();

    private Ringtone activeRingtone;
    private Vibrator vibrator;
    private PowerManager.WakeLock wakeLock;
    private final Handler timeoutHandler = new Handler(Looper.getMainLooper());
    private String activeCallId;

    public static synchronized boolean isCallCurrentlyRinging(String callId) {
        return callId != null && !callId.isEmpty() && callId.equals(currentRingingCallId);
    }

    public static synchronized boolean isCallAlreadyHandledOrActive(String callId) {
        if (callId == null || callId.isEmpty()) return false;
        return callId.equals(currentRingingCallId) || terminatedCallIds.contains(callId);
    }

    private static synchronized void markCallTerminated(String callId) {
        if (callId == null || callId.isEmpty()) return;
        if (callId.equals(currentRingingCallId)) {
            currentRingingCallId = null;
        }
        terminatedCallIds.add(callId);
        while (terminatedCallIds.size() > 60) {
            String oldest = terminatedCallIds.iterator().next();
            terminatedCallIds.remove(oldest);
        }
    }

    public static synchronized void startCallNotificationFromData(Context context, Map<String, String> data) {
        if (context == null || data == null) return;
        String callId = data.get("callId") != null ? data.get("callId").trim() : "";
        if (callId.isEmpty()) return;

        // Deduplicate: do not restart or re-trigger if this callId is already ringing or already ended/rejected/cancelled
        if (isCallAlreadyHandledOrActive(callId)) {
            return;
        }

        String rawType = data.get("type") != null ? data.get("type").trim() : "incoming_call";
        String resolvedCallType = data.get("callType");
        if (resolvedCallType == null || resolvedCallType.isEmpty()) {
            resolvedCallType = "video_call".equalsIgnoreCase(rawType) ? "video" : "audio";
        }

        Intent serviceIntent = new Intent(context, OSACallNotificationService.class);
        serviceIntent.putExtra("callId", callId);
        serviceIntent.putExtra("callType", resolvedCallType);
        serviceIntent.putExtra("callerId", data.get("callerId") != null ? data.get("callerId") : data.get("senderId"));
        serviceIntent.putExtra("callerName", data.get("callerName") != null && !data.get("callerName").isEmpty()
                ? data.get("callerName")
                : (data.get("senderName") != null && !data.get("senderName").isEmpty() ? data.get("senderName") : "OSA Caller"));
        serviceIntent.putExtra("callerAvatar", data.get("callerAvatar") != null ? data.get("callerAvatar") : "");
        serviceIntent.putExtra("chatId", data.get("chatId") != null ? data.get("chatId") : data.get("conversationId"));
        serviceIntent.putExtra("rejectToken", data.get("rejectToken"));
        serviceIntent.putExtra("rejectEndpoint", data.get("rejectEndpoint"));
        serviceIntent.putExtra("anonKey", data.get("anonKey"));
        startCallNotification(context, serviceIntent);
    }

    public static synchronized void startCallNotification(Context context, Intent intent) {
        if (context == null || intent == null) return;
        String callId = intent.getStringExtra("callId");
        if (callId == null || callId.trim().isEmpty()) return;
        if (isCallAlreadyHandledOrActive(callId.trim())) {
            return;
        }
        currentRingingCallId = callId.trim();
        MainActivity.ensureNotificationChannels(context);

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ContextCompat.startForegroundService(context, intent);
            } else {
                context.startService(intent);
            }
        } catch (Exception e) {
            // Fallback if Android 12+ background foreground-service restriction applies: post high-priority full-screen notification directly
            postDirectCallNotificationFallback(context, intent);
        }
    }

    public static synchronized void stopCallNotification(Context context, String callId) {
        if (callId != null && !callId.isEmpty()) {
            markCallTerminated(callId.trim());
        } else {
            currentRingingCallId = null;
        }
        if (context == null) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null && callId != null && !callId.isEmpty()) {
            int notificationId = ("osa_call_" + callId.trim()).hashCode();
            manager.cancel("osa-call-" + callId.trim(), notificationId);
            manager.cancel(notificationId);
        }
        try {
            Intent stopIntent = new Intent(context, OSACallNotificationService.class);
            context.stopService(stopIntent);
        } catch (Exception ignored) {
        }
    }

    private static Notification buildIncomingCallNotification(Context context, Intent intent, int notificationId) {
        MainActivity.ensureNotificationChannels(context);
        String callId = intent.getStringExtra("callId");
        String callType = intent.getStringExtra("callType") != null ? intent.getStringExtra("callType") : "audio";
        String callerId = intent.getStringExtra("callerId");
        String callerName = intent.getStringExtra("callerName") != null ? intent.getStringExtra("callerName") : "OSA Caller";
        String callerAvatar = intent.getStringExtra("callerAvatar");
        String chatId = intent.getStringExtra("chatId");
        String rejectToken = intent.getStringExtra("rejectToken");
        String rejectEndpoint = intent.getStringExtra("rejectEndpoint");
        String anonKey = intent.getStringExtra("anonKey");

        Intent fullScreenIntent = new Intent(context, MainActivity.class);
        fullScreenIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        fullScreenIntent.putExtra("callId", callId);
        fullScreenIntent.putExtra("callType", callType);
        fullScreenIntent.putExtra("callerId", callerId);
        fullScreenIntent.putExtra("callerName", callerName);
        fullScreenIntent.putExtra("callerAvatar", callerAvatar);
        fullScreenIntent.putExtra("chatId", chatId);
        fullScreenIntent.putExtra("callAction", "open");
        PendingIntent fullScreenPending = PendingIntent.getActivity(
                context,
                notificationId + 1,
                fullScreenIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent acceptIntent = new Intent(context, OSACallActionReceiver.class);
        acceptIntent.setAction(OSACallActionReceiver.ACTION_ACCEPT_CALL);
        acceptIntent.putExtra("callId", callId);
        acceptIntent.putExtra("callType", callType);
        acceptIntent.putExtra("callerId", callerId);
        acceptIntent.putExtra("callerName", callerName);
        acceptIntent.putExtra("chatId", chatId);
        PendingIntent acceptPending = PendingIntent.getBroadcast(
                context,
                notificationId + 2,
                acceptIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent rejectIntent = new Intent(context, OSACallActionReceiver.class);
        rejectIntent.setAction(OSACallActionReceiver.ACTION_REJECT_CALL);
        rejectIntent.putExtra("callId", callId);
        rejectIntent.putExtra("callType", callType);
        rejectIntent.putExtra("callerId", callerId);
        rejectIntent.putExtra("chatId", chatId);
        rejectIntent.putExtra("rejectToken", rejectToken);
        rejectIntent.putExtra("rejectEndpoint", rejectEndpoint);
        rejectIntent.putExtra("anonKey", anonKey);
        PendingIntent rejectPending = PendingIntent.getBroadcast(
                context,
                notificationId + 3,
                rejectIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        boolean isVideo = "video".equalsIgnoreCase(callType);
        String titleText = isVideo ? "Incoming video call" : "Incoming audio call";
        String bodyText = callerName + (isVideo ? " (OSA Video Call)" : " (OSA Audio Call)");

        Person callerPerson = new Person.Builder()
                .setName(callerName)
                .setImportant(true)
                .build();

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, MainActivity.CHANNEL_CALLS)
                .setSmallIcon(android.R.drawable.sym_call_incoming)
                .setContentTitle(titleText)
                .setContentText(bodyText)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setAutoCancel(false)
                .setContentIntent(fullScreenPending)
                .setFullScreenIntent(fullScreenPending, true)
                .setStyle(NotificationCompat.CallStyle.forIncomingCall(callerPerson, rejectPending, acceptPending));

        Notification notification = builder.build();
        notification.flags |= Notification.FLAG_INSISTENT | Notification.FLAG_NO_CLEAR;
        return notification;
    }

    private static void postDirectCallNotificationFallback(Context context, Intent intent) {
        String callId = intent.getStringExtra("callId");
        if (callId == null || callId.isEmpty()) return;
        int notificationId = ("osa_call_" + callId).hashCode();
        Notification notification = buildIncomingCallNotification(context, intent, notificationId);
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify("osa-call-" + callId, notificationId, notification);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            stopSelf();
            return START_NOT_STICKY;
        }

        String callId = intent.getStringExtra("callId");
        if (callId == null || callId.isEmpty()) {
            stopSelf();
            return START_NOT_STICKY;
        }
        this.activeCallId = callId.trim();
        synchronized (OSACallNotificationService.class) {
            currentRingingCallId = this.activeCallId;
        }

        acquireCallWakeLock();
        int notificationId = ("osa_call_" + this.activeCallId).hashCode();
        Notification notification = buildIncomingCallNotification(this, intent, notificationId);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                startForeground(notificationId, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL);
            } catch (Exception ignored) {
                try {
                    startForeground(notificationId, notification);
                } catch (Exception e2) {
                    postDirectCallNotificationFallback(this, intent);
                }
            }
        } else {
            startForeground(notificationId, notification);
        }

        startRingtoneAndVibration();

        // Automatically stop ringing after 45 seconds if unanswered
        timeoutHandler.removeCallbacksAndMessages(null);
        timeoutHandler.postDelayed(() -> stopCallNotification(OSACallNotificationService.this, activeCallId), 45000);

        return START_NOT_STICKY;
    }

    private void acquireCallWakeLock() {
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                if (wakeLock != null && wakeLock.isHeld()) {
                    wakeLock.release();
                }
                wakeLock = pm.newWakeLock(
                        PowerManager.PARTIAL_WAKE_LOCK,
                        "osa:incoming_call_wakelock"
                );
                wakeLock.acquire(46000L);
            }
        } catch (Exception ignored) {
        }
    }

    private void releaseCallWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
            }
            wakeLock = null;
        } catch (Exception ignored) {
        }
    }

    private void startRingtoneAndVibration() {
        try {
            if (activeRingtone != null && activeRingtone.isPlaying()) {
                activeRingtone.stop();
            }
            Uri ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            activeRingtone = RingtoneManager.getRingtone(getApplicationContext(), ringtoneUri);
            if (activeRingtone != null && !activeRingtone.isPlaying()) {
                activeRingtone.play();
            }
        } catch (Exception ignored) {
        }

        try {
            vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (vibrator != null && vibrator.hasVibrator()) {
                long[] pattern = new long[]{0, 500, 300, 500, 300, 600};
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
                } else {
                    vibrator.vibrate(pattern, 0);
                }
            }
        } catch (Exception ignored) {
        }
    }

    private void stopRingtoneAndVibration() {
        try {
            if (activeRingtone != null && activeRingtone.isPlaying()) {
                activeRingtone.stop();
            }
        } catch (Exception ignored) {
        }
        try {
            if (vibrator != null) {
                vibrator.cancel();
            }
        } catch (Exception ignored) {
        }
    }

    @Override
    public void onDestroy() {
        timeoutHandler.removeCallbacksAndMessages(null);
        stopRingtoneAndVibration();
        releaseCallWakeLock();
        synchronized (OSACallNotificationService.class) {
            if (activeCallId != null && activeCallId.equals(currentRingingCallId)) {
                currentRingingCallId = null;
            }
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
