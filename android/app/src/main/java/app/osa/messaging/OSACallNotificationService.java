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
import android.os.VibrationEffect;
import android.os.Vibrator;
import androidx.core.app.NotificationCompat;
import androidx.core.app.Person;
import androidx.core.content.ContextCompat;

/**
 * OSA Persistent Foreground Incoming Call Service for Android.
 * Displays a persistent NotificationCompat.CallStyle incoming-call notification with full-screen
 * lock-screen intent, Answer & Decline buttons, system ringtone + vibration, and remains active
 * until Accepted, Rejected, Cancelled (call_cancel), Ended, or 45s timeout.
 */
public class OSACallNotificationService extends Service {
    private Ringtone activeRingtone;
    private Vibrator vibrator;
    private final Handler timeoutHandler = new Handler(Looper.getMainLooper());
    private String activeCallId;

    public static void startCallNotification(Context context, Intent intent) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ContextCompat.startForegroundService(context, intent);
        } else {
            context.startService(intent);
        }
    }

    public static void stopCallNotification(Context context, String callId) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null && callId != null && !callId.isEmpty()) {
            int notificationId = ("osa_call_" + callId).hashCode();
            manager.cancel("osa-call-" + callId, notificationId);
            manager.cancel(notificationId);
        }
        Intent stopIntent = new Intent(context, OSACallNotificationService.class);
        context.stopService(stopIntent);
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
        this.activeCallId = callId;

        String callType = intent.getStringExtra("callType") != null ? intent.getStringExtra("callType") : "audio";
        String callerId = intent.getStringExtra("callerId");
        String callerName = intent.getStringExtra("callerName") != null ? intent.getStringExtra("callerName") : "OSA Caller";
        String callerAvatar = intent.getStringExtra("callerAvatar");
        String chatId = intent.getStringExtra("chatId");
        String rejectToken = intent.getStringExtra("rejectToken");
        String rejectEndpoint = intent.getStringExtra("rejectEndpoint");
        String anonKey = intent.getStringExtra("anonKey");

        int notificationId = ("osa_call_" + callId).hashCode();

        // Full-screen / tap intent to open OSA Incoming Call UI
        Intent fullScreenIntent = new Intent(this, MainActivity.class);
        fullScreenIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        fullScreenIntent.putExtra("callId", callId);
        fullScreenIntent.putExtra("callType", callType);
        fullScreenIntent.putExtra("callerId", callerId);
        fullScreenIntent.putExtra("callerName", callerName);
        fullScreenIntent.putExtra("callerAvatar", callerAvatar);
        fullScreenIntent.putExtra("chatId", chatId);
        fullScreenIntent.putExtra("callAction", "open");
        PendingIntent fullScreenPending = PendingIntent.getActivity(
                this,
                notificationId + 1,
                fullScreenIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // Answer Action -> Opens MainActivity with callAction="accept" to connect real WebRTC call
        Intent acceptIntent = new Intent(this, OSACallActionReceiver.class);
        acceptIntent.setAction(OSACallActionReceiver.ACTION_ACCEPT_CALL);
        acceptIntent.putExtra("callId", callId);
        acceptIntent.putExtra("callType", callType);
        acceptIntent.putExtra("callerId", callerId);
        acceptIntent.putExtra("callerName", callerName);
        acceptIntent.putExtra("chatId", chatId);
        PendingIntent acceptPending = PendingIntent.getBroadcast(
                this,
                notificationId + 2,
                acceptIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // Decline Action -> Updates Supabase call state, sends reject signal, stops ringtone & service
        Intent rejectIntent = new Intent(this, OSACallActionReceiver.class);
        rejectIntent.setAction(OSACallActionReceiver.ACTION_REJECT_CALL);
        rejectIntent.putExtra("callId", callId);
        rejectIntent.putExtra("callType", callType);
        rejectIntent.putExtra("callerId", callerId);
        rejectIntent.putExtra("chatId", chatId);
        rejectIntent.putExtra("rejectToken", rejectToken);
        rejectIntent.putExtra("rejectEndpoint", rejectEndpoint);
        rejectIntent.putExtra("anonKey", anonKey);
        PendingIntent rejectPending = PendingIntent.getBroadcast(
                this,
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

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, MainActivity.CHANNEL_CALLS)
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

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                startForeground(notificationId, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL);
            } catch (Exception ignored) {
                startForeground(notificationId, notification);
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

    private void startRingtoneAndVibration() {
        try {
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
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
