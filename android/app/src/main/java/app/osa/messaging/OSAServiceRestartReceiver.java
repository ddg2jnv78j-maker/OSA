package app.osa.messaging;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

/**
 * Ensures OSABackgroundMessagingService is started on device boot, app update,
 * or after task removal when a user is logged into OSA on Android.
 */
public class OSAServiceRestartReceiver extends BroadcastReceiver {
    public static final String ACTION_RESTART_BG_SERVICE = "app.osa.messaging.ACTION_RESTART_BG_SERVICE";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null) return;
        try {
            SharedPreferences prefs = context.getSharedPreferences(
                    OSAFirebaseMessagingService.PREFS_NAME,
                    Context.MODE_PRIVATE
            );
            String userId = prefs.getString("auth_user_id", "");
            if (userId != null && !userId.trim().isEmpty()) {
                OSABackgroundMessagingService.ensureStarted(context);
            }
        } catch (Exception ignored) {
        }
    }
}
