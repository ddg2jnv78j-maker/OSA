package app.osa.messaging;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
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
import androidx.core.content.ContextCompat;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

/**
 * OSA Persistent Foreground Incoming Call Service for Android.
 * - Uses FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK so Android 14 (targetSdk 34) never throws
 *   SecurityException when OSA is not the system default dialer (ROLE_DIALER).
 * - Uses direct PendingIntent.getActivity for Accept (eliminating Android 12+ Notification
 *   Trampoline restrictions) and PendingIntent.getBroadcast for Reject.
 * - Uses explicit Accept & Reject NotificationCompat actions + FullScreenIntent so Android 12/13/14
 *   never drops the notification even if posted via NotificationManager fallback.
 */
public class OSACallNotificationService extends Service {
    private static final String KEY_TERMINATED_CALL_IDS = "terminated_call_ids_v1";
    private static String currentRingingCallId = null;
    private static final Set<String> terminatedCallIds = new LinkedHashSet<>();

    private Ringtone activeRingtone;
    private Vibrator vibrator;
    private PowerManager.WakeLock wakeLock;
    private final Handler timeoutHandler = new Handler(Looper.getMainLooper());
    private String activeCallId;

    public static synchronized boolean isCallCurrentlyRinging(String callId) {
        return callId != null && !callId.isEmpty() && callId.trim().equals(currentRingingCallId);
    }

    public static synchronized boolean isCallAlreadyHandledOrActive(Context context, String callId) {
        if (callId == null || callId.trim().isEmpty()) return false;
        String cleanId = callId.trim();
        if (cleanId.equals(currentRingingCallId) || terminatedCallIds.contains(cleanId)) {
            return true;
        }
        if (context != null) {
            SharedPreferences prefs = context.getSharedPreferences(OSAFirebaseMessagingService.PREFS_NAME, MODE_PRIVATE);
            String csv = prefs.getString(KEY_TERMINATED_CALL_IDS, "");
            if (csv != null && !csv.isEmpty()) {
                for (String id : csv.split(",")) {
                    if (cleanId.equals(id)) {
                        terminatedCallIds.add(cleanId);
                        return true;
                    }
                }
            }
        }
        return false;
    }

    public static synchronized boolean isCallAlreadyHandledOrActive(String callId) {
        return isCallAlreadyHandledOrActive(null, callId);
    }

    public static synchronized void markCallTerminated(Context context, String callId) {
        if (callId == null || callId.trim().isEmpty()) return;
        String cleanId = callId.trim();
        if (cleanId.equals(currentRingingCallId)) {
            currentRingingCallId = null;
        }
        terminatedCallIds.add(cleanId);
        if (context != null) {
            SharedPreferences prefs = context.getSharedPreferences(OSAFirebaseMessagingService.PREFS_NAME, MODE_PRIVATE);
            String csv = prefs.getString(KEY_TERMINATED_CALL_IDS, "");
            if (csv != null && !csv.isEmpty()) {
                terminatedCallIds.addAll(Arrays.asList(csv.split(",")));
            }
            terminatedCallIds.add(cleanId);
            while (terminatedCallIds.size() > 80) {
                String oldest = terminatedCallIds.iterator().next();
                terminatedCallIds.remove(oldest);
            }
            StringBuilder sb = new StringBuilder();
            for (String id : terminatedCallIds) {
                if (id == null || id.isEmpty()) continue;
                if (sb.length() > 0) sb.append(",");
                sb.append(id);
            }
            prefs.edit().putString(KEY_TERMINATED_CALL_IDS, sb.toString()).commit();
        }
    }

    public static int computeCallNotificationId(String callId) {
        String clean = callId != null ? callId.trim() : "default";
        return ((("osa_call_" + clean).hashCode()) & 0x7FFFFFFF) % 1000000 + 3000;
    }

    public static synchronized void startCallNotificationFromData(Context context, Map<String, String> data) {
        if (context == null || data == null) return;
        String callId = data.get("callId") != null ? data.get("callId").trim() : "";
        if (callId.isEmpty()) return;

        // Deduplicate: do not restart or re-trigger if this callId is already ringing or already ended/rejected/cancelled
        if (isCallAlreadyHandledOrActive(context, callId)) {
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
        if (isCallAlreadyHandledOrActive(context, callId.trim())) {
            return;
        }
        currentRingingCallId = callId.trim();
        MainActivity.ensureNotificationChannels(context);

        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.cancel("osa-call-" + callId.trim(), 0);
        }

        // Immediately post the high-priority heads-up/full-screen notification first so there is zero delay
        postDirectCallNotificationFallback(context, intent);

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ContextCompat.startForegroundService(context.getApplicationContext(), intent);
            } else {
                context.getApplicationContext().startService(intent);
            }
        } catch (Exception ignored) {
            // Direct notification is already posted above
        }
    }

    public static synchronized void stopCallNotification(Context context, String callId) {
        if (callId != null && !callId.isEmpty()) {
            markCallTerminated(context, callId.trim());
        } else {
            currentRingingCallId = null;
        }
        if (context == null) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null && callId != null && !callId.isEmpty()) {
            int notificationId = computeCallNotificationId(callId);
            manager.cancel("osa-call-" + callId.trim(), 0);
            manager.cancel("osa-call-" + callId.trim(), notificationId);
            manager.cancel(notificationId);
        }
        try {
            Intent stopIntent = new Intent(context.getApplicationContext(), OSACallNotificationService.class);
            context.getApplicationContext().stopService(stopIntent);
        } catch (Exception ignored) {
        }
    }

    private static Notification buildIncomingCallNotification(Context context, Intent intent, int notificationId) {
        MainActivity.ensureNotificationChannels(context);
        String callId = intent.getStringExtra("callId") != null ? intent.getStringExtra("callId").trim() : "";
        String callType = intent.getStringExtra("callType") != null ? intent.getStringExtra("callType").trim() : "audio";
        String callerId = intent.getStringExtra("callerId");
        String callerName = intent.getStringExtra("callerName") != null && !intent.getStringExtra("callerName").trim().isEmpty()
                ? intent.getStringExtra("callerName").trim()
                : "OSA Caller";
        String callerAvatar = intent.getStringExtra("callerAvatar");
        String chatId = intent.getStringExtra("chatId");
        String rejectToken = intent.getStringExtra("rejectToken");
        String rejectEndpoint = intent.getStringExtra("rejectEndpoint");
        String anonKey = intent.getStringExtra("anonKey");

        // 1. Full-screen / tap intent -> opens MainActivity on the incoming call screen
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

        // 2. ACCEPT button -> Direct PendingIntent.getActivity to MainActivity (avoids Android 12+ Notification Trampoline block!)
        Intent acceptActivityIntent = new Intent(context, MainActivity.class);
        acceptActivityIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        acceptActivityIntent.putExtra("callId", callId);
        acceptActivityIntent.putExtra("callType", callType);
        acceptActivityIntent.putExtra("callerId", callerId);
        acceptActivityIntent.putExtra("callerName", callerName);
        acceptActivityIntent.putExtra("callerAvatar", callerAvatar);
        acceptActivityIntent.putExtra("chatId", chatId);
        acceptActivityIntent.putExtra("callAction", "accept");
        PendingIntent acceptPending = PendingIntent.getActivity(
                context,
                notificationId + 2,
                acceptActivityIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // 3. REJECT button -> PendingIntent.getBroadcast to OSACallActionReceiver (rejects in background without opening UI)
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
        String titleText = isVideo ? "Incoming Video Call · OSA" : "Incoming Audio Call · OSA";
        String bodyText = callerName + (isVideo ? " is video calling you" : " is audio calling you");

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, MainActivity.CHANNEL_CALLS)
                .setSmallIcon(android.R.drawable.sym_call_incoming)
                .setContentTitle(titleText)
                .setContentText(bodyText)
                .setSubText("OSA")
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setDefaults(NotificationCompat.DEFAULT_ALL)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setAutoCancel(false)
                .setContentIntent(fullScreenPending)
                .setFullScreenIntent(fullScreenPending, true)
                .addAction(android.R.drawable.sym_call_incoming, "Accept", acceptPending)
                .addAction(android.R.drawable.sym_call_missed, "Reject", rejectPending);

        Notification notification = builder.build();
        notification.flags |= Notification.FLAG_INSISTENT | Notification.FLAG_NO_CLEAR;
        return notification;
    }

    private static void postDirectCallNotificationFallback(Context context, Intent intent) {
        String callId = intent.getStringExtra("callId");
        if (callId == null || callId.trim().isEmpty()) return;
        int notificationId = computeCallNotificationId(callId);
        Notification notification = buildIncomingCallNotification(context, intent, notificationId);
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify(notificationId, notification);
            android.util.Log.i("OSA_DIAG", "[OSA_NOTIFICATION_POSTED] type=call channel="
                    + MainActivity.CHANNEL_CALLS + " notificationId=" + notificationId
                    + " callId=" + callId + " callType=" + intent.getStringExtra("callType"));
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            stopSelf();
            return START_NOT_STICKY;
        }

        String callId = intent.getStringExtra("callId");
        if (callId == null || callId.trim().isEmpty()) {
            stopSelf();
            return START_NOT_STICKY;
        }
        this.activeCallId = callId.trim();
        synchronized (OSACallNotificationService.class) {
            currentRingingCallId = this.activeCallId;
        }

        acquireCallWakeLock();
        int notificationId = computeCallNotificationId(this.activeCallId);
        Notification notification = buildIncomingCallNotification(this, intent, notificationId);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                startForeground(notificationId, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } catch (Exception e1) {
                try {
                    startForeground(notificationId, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
                } catch (Exception e2) {
                    try {
                        startForeground(notificationId, notification);
                    } catch (Exception e3) {
                        postDirectCallNotificationFallback(this, intent);
                    }
                }
            }
        } else {
            try {
                startForeground(notificationId, notification);
            } catch (Exception e) {
                postDirectCallNotificationFallback(this, intent);
            }
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
            if (activeRingtone != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    activeRingtone.setAudioAttributes(
                            new AudioAttributes.Builder()
                                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                                    .build()
                    );
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    activeRingtone.setLooping(true);
                }
                if (!activeRingtone.isPlaying()) {
                    activeRingtone.play();
                }
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
            activeRingtone = null;
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
