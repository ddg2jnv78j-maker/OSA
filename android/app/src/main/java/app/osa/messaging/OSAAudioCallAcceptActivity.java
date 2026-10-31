package app.osa.messaging;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

/**
 * Translucent, zero-UI, isolated-task Activity (`taskAffinity=""`, `Theme.Translucent.NoTitleBar`)
 * that handles the Incoming Audio Call notification "Accept" action on Android 12/13/14+.
 *
 * Why this exists:
 * - Android 12+ (API 31–34) enforces `WHILE_IN_USE` restrictions on `FOREGROUND_SERVICE_TYPE_MICROPHONE`
 *   and hardware microphone capture when an app is in the background or cold-started.
 * - By routing the Audio Call "Accept" PendingIntent through this transparent, separate-task Activity
 *   that finishes immediately in `onCreate()`, Android grants the app process `PROCESS_STATE_TOP`
 *   privilege to promote `OSACallNotificationService` with `FOREGROUND_SERVICE_TYPE_MICROPHONE` and
 *   capture WebRTC microphone audio in the background WITHOUT bringing `MainActivity` to the foreground
 *   or showing any OSA UI over the app the user is currently using.
 */
public class OSAAudioCallAcceptActivity extends Activity {
    private static final int REQ_RECORD_AUDIO = 2041;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        overridePendingTransition(0, 0);

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                setShowWhenLocked(true);
            }
            getWindow().addFlags(
                    WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                            | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
            );
        } catch (Exception ignored) {
        }

        Intent intent = getIntent();
        String callId = intent != null ? intent.getStringExtra("callId") : null;
        if (callId == null || callId.trim().isEmpty()) {
            finishSilently();
            return;
        }

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED) {
            OSACallNotificationService.acceptIncomingAudioCallInBackground(getApplicationContext(), intent);
            finishSilently();
        } else {
            ActivityCompat.requestPermissions(
                    this,
                    new String[]{Manifest.permission.RECORD_AUDIO},
                    REQ_RECORD_AUDIO
            );
        }
    }

    @Override
    public void onRequestPermissionsResult(
            int requestCode,
            @NonNull String[] permissions,
            @NonNull int[] grantResults
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_RECORD_AUDIO) {
            Intent intent = getIntent();
            if (intent != null) {
                OSACallNotificationService.acceptIncomingAudioCallInBackground(getApplicationContext(), intent);
            }
            finishSilently();
        }
    }

    private void finishSilently() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                finishAndRemoveTask();
            } else {
                finish();
            }
        } catch (Exception e) {
            finish();
        }
        overridePendingTransition(0, 0);
    }
}
