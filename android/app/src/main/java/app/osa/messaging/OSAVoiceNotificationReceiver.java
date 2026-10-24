package app.osa.messaging;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.core.content.ContextCompat;

/**
 * BroadcastReceiver for handling Voice Message notification actions:
 * - Play / Pause / Stop / Toggle Play
 * - NOOP action for tap on notification body (prevents opening MainActivity/Home/Chat list)
 */
public class OSAVoiceNotificationReceiver extends BroadcastReceiver {
    public static final String ACTION_PLAY_VOICE = "app.osa.messaging.ACTION_PLAY_VOICE";
    public static final String ACTION_PAUSE_VOICE = "app.osa.messaging.ACTION_PAUSE_VOICE";
    public static final String ACTION_STOP_VOICE = "app.osa.messaging.ACTION_STOP_VOICE";
    public static final String ACTION_TOGGLE_PLAY_VOICE = "app.osa.messaging.ACTION_TOGGLE_PLAY_VOICE";
    public static final String ACTION_NOOP_VOICE = "app.osa.messaging.ACTION_NOOP_VOICE";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) return;
        String action = intent.getAction();
        if (action == null || ACTION_NOOP_VOICE.equals(action)) {
            // Absorb tap on voice notification body without opening MainActivity or any screen
            return;
        }

        Intent serviceIntent = new Intent(context, OSAVoiceNotificationService.class);
        serviceIntent.setAction(action);
        serviceIntent.putExtras(intent);

        try {
            if (ACTION_PLAY_VOICE.equals(action) || ACTION_TOGGLE_PLAY_VOICE.equals(action)) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    ContextCompat.startForegroundService(context, serviceIntent);
                } else {
                    context.startService(serviceIntent);
                }
            } else {
                context.startService(serviceIntent);
            }
        } catch (Exception e) {
            android.util.Log.w("OSA_VOICE", "Failed to start OSAVoiceNotificationService for action=" + action, e);
        }
    }
}
