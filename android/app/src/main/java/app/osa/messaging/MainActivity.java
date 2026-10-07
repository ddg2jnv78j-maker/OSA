package app.osa.messaging;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.google.firebase.messaging.FirebaseMessaging;
import org.json.JSONObject;

/**
 * OSA Native Android Activity & WebView Bridge.
 * Creates high-importance notification channels for Messages and Incoming Audio/Video Calls,
 * exposes OSANativeAndroid JavascriptInterface to the React app, and handles deep-links from notifications.
 */
public class MainActivity extends AppCompatActivity {
    public static final String CHANNEL_MESSAGES = "osa_messages_channel";
    public static final String CHANNEL_CALLS = "osa_incoming_calls_high";
    private static final String PREFS_NAME = "osa_native_prefs";

    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createNotificationChannels();

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(true);

        webView.addJavascriptInterface(new OSANativeAndroidBridge(), "OSANativeAndroid");
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> request.grant(request.getResources()));
            }
        });

        String startUrl = buildLaunchUrl(getIntent());
        webView.loadUrl(startUrl);

        fetchAndSyncFcmToken();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        dispatchIntentToWebApp(intent);
    }

    private String buildLaunchUrl(Intent intent) {
        String base = "https://ddg2jnv78j-maker.github.io/OSA/";
        if (intent == null) return base;

        String chatId = intent.getStringExtra("chatId");
        String callId = intent.getStringExtra("callId");
        String callType = intent.getStringExtra("callType");
        String callAction = intent.getStringExtra("callAction");

        Uri.Builder builder = Uri.parse(base).buildUpon();
        if (chatId != null && !chatId.isEmpty()) builder.appendQueryParameter("chatId", chatId);
        if (callId != null && !callId.isEmpty()) builder.appendQueryParameter("callId", callId);
        if (callType != null && !callType.isEmpty()) builder.appendQueryParameter("callType", callType);
        if (callAction != null && !callAction.isEmpty()) builder.appendQueryParameter("callAction", callAction);
        return builder.build().toString();
    }

    private void dispatchIntentToWebApp(Intent intent) {
        if (intent == null || webView == null) return;
        try {
            String chatId = intent.getStringExtra("chatId");
            String callId = intent.getStringExtra("callId");
            String callType = intent.getStringExtra("callType");
            String callAction = intent.getStringExtra("callAction");

            if (callId != null && !callId.isEmpty()) {
                JSONObject obj = new JSONObject();
                obj.put("callId", callId);
                obj.put("callType", callType != null ? callType : "audio");
                obj.put("action", callAction != null ? callAction : "open");
                String js = "window.__osaReceiveNativeCallAction && window.__osaReceiveNativeCallAction(" + obj.toString() + ");";
                webView.post(() -> webView.evaluateJavascript(js, null));
            } else if (chatId != null && !chatId.isEmpty()) {
                JSONObject obj = new JSONObject();
                obj.put("chatId", chatId);
                String js = "window.__osaReceiveNativeDeepLink && window.__osaReceiveNativeDeepLink(" + obj.toString() + ");";
                webView.post(() -> webView.evaluateJavascript(js, null));
            }
        } catch (Exception ignored) {
        }
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;

        NotificationChannel messagesChannel = new NotificationChannel(
                CHANNEL_MESSAGES,
                "OSA Messages",
                NotificationManager.IMPORTANCE_HIGH
        );
        messagesChannel.setDescription("Real-time chat and group message notifications");
        messagesChannel.enableVibration(true);
        manager.createNotificationChannel(messagesChannel);

        NotificationChannel callsChannel = new NotificationChannel(
                CHANNEL_CALLS,
                "OSA Incoming Calls",
                NotificationManager.IMPORTANCE_HIGH
        );
        callsChannel.setDescription("Incoming audio and video call alerts");
        callsChannel.enableVibration(true);
        callsChannel.setVibrationPattern(new long[]{0, 400, 200, 400, 200, 600});
        Uri ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        AudioAttributes audioAttributes = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
        callsChannel.setSound(ringtoneUri, audioAttributes);
        manager.createNotificationChannel(callsChannel);
    }

    private void fetchAndSyncFcmToken() {
        try {
            FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
                if (!task.isSuccessful()) return;
                String token = task.getResult();
                if (token == null || token.isEmpty()) return;

                SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
                prefs.edit().putString("fcm_token", token).apply();

                if (webView != null) {
                    try {
                        JSONObject payload = new JSONObject();
                        payload.put("platform", "android");
                        payload.put("deviceId", getStableHardwareDeviceId());
                        payload.put("pushToken", token);
                        payload.put("appVersion", "1.0.0");
                        payload.put("deviceModel", Build.MODEL);
                        payload.put("osVersion", Build.VERSION.RELEASE);
                        String js = "window.__osaReceiveNativePushToken && window.__osaReceiveNativePushToken(" + payload.toString() + ");";
                        webView.post(() -> webView.evaluateJavascript(js, null));
                    } catch (Exception ignored) {
                    }
                }
            });
        } catch (Exception ignored) {
        }
    }

    private String getStableHardwareDeviceId() {
        String androidId = Settings.Secure.getString(getContentResolver(), Settings.Secure.ANDROID_ID);
        return androidId != null ? "android_" + androidId : "android_device";
    }

    public class OSANativeAndroidBridge {
        @JavascriptInterface
        public String getPushToken() {
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            return prefs.getString("fcm_token", null);
        }

        @JavascriptInterface
        public String getDeviceId() {
            return getStableHardwareDeviceId();
        }

        @JavascriptInterface
        public String getAppVersion() {
            return "1.0.0";
        }

        @JavascriptInterface
        public void openAppSettings() {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            Uri uri = Uri.fromParts("package", getPackageName(), null);
            intent.setData(uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        }

        @JavascriptInterface
        public void dismissIncomingCallNotification(String callId) {
            OSACallNotificationService.stopCallNotification(MainActivity.this, callId);
        }

        @JavascriptInterface
        public void reportCallConnected(String callId) {
            OSACallNotificationService.stopCallNotification(MainActivity.this, callId);
        }

        @JavascriptInterface
        public void requestNativePermissions() {
            String[] perms;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                perms = new String[]{
                        Manifest.permission.CAMERA,
                        Manifest.permission.RECORD_AUDIO,
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.POST_NOTIFICATIONS
                };
            } else {
                perms = new String[]{
                        Manifest.permission.CAMERA,
                        Manifest.permission.RECORD_AUDIO,
                        Manifest.permission.ACCESS_FINE_LOCATION
                };
            }
            boolean needsRequest = false;
            for (String p : perms) {
                if (ContextCompat.checkSelfPermission(MainActivity.this, p) != PackageManager.PERMISSION_GRANTED) {
                    needsRequest = true;
                    break;
                }
            }
            if (needsRequest) {
                ActivityCompat.requestPermissions(MainActivity.this, perms, 1001);
            }
        }
    }
}
