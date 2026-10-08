package app.osa.messaging;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.util.Base64;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.google.firebase.messaging.FirebaseMessaging;
import java.lang.ref.WeakReference;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import org.json.JSONObject;

/**
 * OSA Native Android Activity & WebView Bridge.
 * - Configures high-importance notification channels for Messages and Incoming Audio/Video Calls
 * - Automatically captures Supabase URL, anonKey, accessToken, refreshToken, and userId from both
 *   WebView network headers (shouldInterceptRequest) and localStorage so OSABackgroundMessagingService
 *   always operates even if the user closes OSA immediately
 * - Syncs the real Android FCM token to public.user_devices via both JS and native Java REST
 */
public class MainActivity extends AppCompatActivity {
    public static final String CHANNEL_MESSAGES = "osa_messages_high_v2";
    public static final String CHANNEL_CALLS = "osa_incoming_calls_high_v2";
    public static final String CHANNEL_BG_SYNC = "osa_background_sync_silent_v2";
    private static final String PREFS_NAME = "osa_native_prefs";
    private static final String PRODUCTION_WEB_URL = "https://ddg2jnv78j-maker.github.io/OSA/";
    private static final String LOCAL_ASSET_URL = "file:///android_asset/public/index.html";

    private static final int REQ_INITIAL_NOTIFICATIONS = 1000;
    private static final int REQ_ALL_PERMISSIONS = 1001;
    private static final int REQ_SINGLE_CAMERA = 1011;
    private static final int REQ_SINGLE_MICROPHONE = 1012;
    private static final int REQ_SINGLE_LOCATION = 1013;
    private static final int REQ_SINGLE_NOTIFICATIONS = 1014;
    private static final int REQ_WEBVIEW_MEDIA = 1020;
    private static final int REQ_WEBVIEW_GEO = 1021;

    private static WeakReference<MainActivity> activeInstanceRef;

    private WebView webView;
    private PermissionRequest pendingWebPermissionRequest;
    private GeolocationPermissions.Callback pendingGeoCallback;
    private String pendingGeoOrigin;
    private String pendingIntentPayloadJson = null;

    public static void ensureNotificationChannels(Context context) {
        if (context == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;

        NotificationChannel messagesChannel = new NotificationChannel(
                CHANNEL_MESSAGES,
                "OSA Messages",
                NotificationManager.IMPORTANCE_HIGH
        );
        messagesChannel.setDescription("Real-time chat and group message notifications");
        messagesChannel.enableVibration(true);
        messagesChannel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        manager.createNotificationChannel(messagesChannel);

        NotificationChannel callsChannel = new NotificationChannel(
                CHANNEL_CALLS,
                "OSA Incoming Calls",
                NotificationManager.IMPORTANCE_HIGH
        );
        callsChannel.setDescription("Incoming audio and video call alerts");
        callsChannel.enableVibration(true);
        callsChannel.setVibrationPattern(new long[]{0, 400, 200, 400, 200, 600});
        callsChannel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        Uri ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        AudioAttributes audioAttributes = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
        callsChannel.setSound(ringtoneUri, audioAttributes);
        manager.createNotificationChannel(callsChannel);

        NotificationChannel bgSyncChannel = new NotificationChannel(
                CHANNEL_BG_SYNC,
                "OSA Background Connection",
                NotificationManager.IMPORTANCE_LOW
        );
        bgSyncChannel.setDescription("Keeps OSA connected for calls and messages when closed");
        bgSyncChannel.enableVibration(false);
        bgSyncChannel.setSound(null, null);
        bgSyncChannel.setShowBadge(false);
        bgSyncChannel.setLockscreenVisibility(android.app.Notification.VISIBILITY_SECRET);
        manager.createNotificationChannel(bgSyncChannel);
    }

    public static void notifyTokenUpdatedFromService(String token) {
        MainActivity activity = activeInstanceRef != null ? activeInstanceRef.get() : null;
        if (activity != null) {
            activity.pushTokenToWebView(token);
        }
    }

    public static void notifyCallRejectedFromNotification(String callId, String callType) {
        MainActivity activity = activeInstanceRef != null ? activeInstanceRef.get() : null;
        if (activity != null && activity.webView != null) {
            try {
                JSONObject obj = new JSONObject();
                obj.put("callId", callId);
                obj.put("callType", callType != null ? callType : "audio");
                obj.put("action", "reject");
                String js = "window.__osaReceiveNativeCallAction && window.__osaReceiveNativeCallAction(" + obj.toString() + ");";
                activity.webView.post(() -> activity.webView.evaluateJavascript(js, null));
            } catch (Exception ignored) {
            }
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        activeInstanceRef = new WeakReference<>(this);
        ensureNotificationChannels(this);
        requestInitialNotificationPermissionIfNeeded();
        OSABackgroundMessagingService.ensureStarted(this);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setGeolocationEnabled(true);

        webView.addJavascriptInterface(new OSANativeAndroidBridge(), "OSANativeAndroid");
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> handleWebViewPermissionRequest(request));
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(
                    final String origin,
                    final GeolocationPermissions.Callback callback
            ) {
                runOnUiThread(() -> handleWebViewGeolocationPrompt(origin, callback));
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Nullable
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                try {
                    if (request != null && request.getUrl() != null) {
                        inspectSupabaseRequestHeaders(request);
                    }
                } catch (Exception ignored) {
                }
                return super.shouldInterceptRequest(view, request);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                probeSupabaseSessionFromWebView();
                fetchAndSyncFcmToken();
                dispatchIntentToWebApp(getIntent());
            }

            @Override
            public void onReceivedError(
                    WebView view,
                    WebResourceRequest request,
                    WebResourceError error
            ) {
                super.onReceivedError(view, request, error);
                if (request != null && request.isForMainFrame()) {
                    String failingUrl = request.getUrl() != null ? request.getUrl().toString() : "";
                    if (failingUrl.startsWith(PRODUCTION_WEB_URL)) {
                        view.loadUrl(LOCAL_ASSET_URL);
                    }
                }
            }
        });

        handleIncomingCallAcceptOrOpenIntent(getIntent());
        clearNotificationCountFromIntent(getIntent());
        capturePendingIntentPayload(getIntent());
        String startUrl = buildLaunchUrl(getIntent());
        webView.loadUrl(startUrl);

        fetchAndSyncFcmToken();
    }

    @Override
    protected void onResume() {
        super.onResume();
        activeInstanceRef = new WeakReference<>(this);
        OSABackgroundMessagingService.ensureStarted(this);
        fetchAndSyncFcmToken();
        if (webView != null) {
            webView.onResume();
            webView.resumeTimers();
            probeSupabaseSessionFromWebView();
            webView.post(() -> webView.evaluateJavascript(
                    "window.__osaOnAppResume && window.__osaOnAppResume();",
                    null
            ));
        }
    }

    @Override
    protected void onPause() {
        probeSupabaseSessionFromWebView();
        OSABackgroundMessagingService.ensureStarted(this);
        super.onPause();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIncomingCallAcceptOrOpenIntent(intent);
        clearNotificationCountFromIntent(intent);
        capturePendingIntentPayload(intent);
        dispatchIntentToWebApp(intent);
    }

    private void handleIncomingCallAcceptOrOpenIntent(Intent intent) {
        if (intent == null) return;
        String callId = intent.getStringExtra("callId");
        String callAction = intent.getStringExtra("callAction");
        if (callId != null && !callId.trim().isEmpty() && "accept".equalsIgnoreCase(callAction)) {
            // Stop the ringing notification immediately when user taps Accept
            OSACallNotificationService.stopCallNotification(this, callId.trim());
        }
    }

    /**
     * Automatically captures Supabase URL, anonKey, accessToken, and userId from any
     * outgoing WebView request to *.supabase.co so native background services work immediately.
     */
    private void inspectSupabaseRequestHeaders(WebResourceRequest request) {
        Uri uri = request.getUrl();
        if (uri == null || uri.getHost() == null) return;
        String host = uri.getHost().toLowerCase();
        if (!host.endsWith(".supabase.co")) return;

        String origin = uri.getScheme() + "://" + host;
        Map<String, String> headers = request.getRequestHeaders();
        if (headers == null || headers.isEmpty()) return;

        String apiKey = null;
        String authHeader = null;
        for (Map.Entry<String, String> entry : headers.entrySet()) {
            if (entry.getKey() == null || entry.getValue() == null) continue;
            String k = entry.getKey().trim().toLowerCase();
            if ("apikey".equals(k)) {
                apiKey = entry.getValue().trim();
            } else if ("authorization".equals(k)) {
                authHeader = entry.getValue().trim();
            }
        }

        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();
        boolean changed = false;

        if (!origin.isEmpty() && !origin.equals(prefs.getString("auth_supabase_url", ""))) {
            editor.putString("auth_supabase_url", origin);
            changed = true;
        }
        if (apiKey != null && apiKey.length() > 20 && !apiKey.equals(prefs.getString("auth_anon_key", ""))) {
            editor.putString("auth_anon_key", apiKey);
            changed = true;
        }

        if (authHeader != null && authHeader.toLowerCase().startsWith("bearer ")) {
            String jwt = authHeader.substring(7).trim();
            if (!jwt.isEmpty() && (apiKey == null || !jwt.equals(apiKey))) {
                String extractedUserId = extractUserIdFromJwt(jwt);
                if (extractedUserId != null && !extractedUserId.isEmpty()) {
                    if (!jwt.equals(prefs.getString("auth_access_token", ""))) {
                        editor.putString("auth_access_token", jwt);
                        changed = true;
                    }
                    if (!extractedUserId.equals(prefs.getString("auth_user_id", ""))) {
                        editor.putString("auth_user_id", extractedUserId);
                        changed = true;
                    }
                }
            }
        }

        if (changed) {
            editor.commit();
            OSABackgroundMessagingService.ensureStarted(this);
            OSABackgroundMessagingService.syncFcmTokenToSupabaseAsync(this);
            runOnUiThread(this::probeSupabaseSessionFromWebView);
        }
    }

    private String extractUserIdFromJwt(String jwt) {
        try {
            String[] parts = jwt.split("\\.");
            if (parts.length < 2) return null;
            byte[] decoded = Base64.decode(parts[1], Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
            String payloadJson = new String(decoded, StandardCharsets.UTF_8);
            JSONObject obj = new JSONObject(payloadJson);
            String role = obj.optString("role", "");
            String sub = obj.optString("sub", "").trim();
            if ("authenticated".equals(role) && sub.length() >= 32) {
                return sub;
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    /**
     * Reads localStorage directly from WebView to extract access_token, refresh_token, and user.id
     * even if the WebView served a cached page.
     */
    private void probeSupabaseSessionFromWebView() {
        if (webView == null) return;
        String js = "(function(){"
                + "try {"
                + "  var raw = localStorage.getItem('osa-auth-token');"
                + "  if (!raw) {"
                + "    for (var i = 0; i < localStorage.length; i++) {"
                + "      var k = localStorage.key(i);"
                + "      if (k && k.indexOf('auth-token') !== -1) { raw = localStorage.getItem(k); break; }"
                + "    }"
                + "  }"
                + "  if (!raw) return;"
                + "  var parsed = JSON.parse(raw);"
                + "  var session = parsed.currentSession || parsed.session || parsed;"
                + "  var accessToken = session && session.access_token ? session.access_token : '';"
                + "  var refreshToken = session && session.refresh_token ? session.refresh_token : '';"
                + "  var userId = session && session.user && session.user.id ? session.user.id : '';"
                + "  var sbUrl = localStorage.getItem('osa_supabase_url') || (window.__OSA_SUPABASE_CONFIG__ && window.__OSA_SUPABASE_CONFIG__.url) || '';"
                + "  var sbKey = localStorage.getItem('osa_supabase_anon_key') || (window.__OSA_SUPABASE_CONFIG__ && window.__OSA_SUPABASE_CONFIG__.anonKey) || '';"
                + "  if (userId && accessToken && window.OSANativeAndroid && window.OSANativeAndroid.syncAuthSession) {"
                + "    window.OSANativeAndroid.syncAuthSession(JSON.stringify({"
                + "      userId: userId, accessToken: accessToken, refreshToken: refreshToken, supabaseUrl: sbUrl, anonKey: sbKey"
                + "    }));"
                + "  }"
                + "} catch (e) {}"
                + "})();";
        webView.post(() -> webView.evaluateJavascript(js, null));
    }

    private void handleWebViewPermissionRequest(final PermissionRequest request) {
        String[] resources = request.getResources();
        List<String> neededOsPerms = new ArrayList<>();
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);

        for (String res : resources) {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(res)) {
                if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                        != PackageManager.PERMISSION_GRANTED) {
                    neededOsPerms.add(Manifest.permission.CAMERA);
                    prefs.edit().putBoolean("perm_asked_camera", true).apply();
                }
            } else if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(res)) {
                if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                        != PackageManager.PERMISSION_GRANTED) {
                    neededOsPerms.add(Manifest.permission.RECORD_AUDIO);
                    prefs.edit().putBoolean("perm_asked_microphone", true).apply();
                }
            }
        }

        if (neededOsPerms.isEmpty()) {
            request.grant(resources);
        } else {
            pendingWebPermissionRequest = request;
            ActivityCompat.requestPermissions(
                    this,
                    neededOsPerms.toArray(new String[0]),
                    REQ_WEBVIEW_MEDIA
            );
        }
    }

    private void handleWebViewGeolocationPrompt(
            final String origin,
            final GeolocationPermissions.Callback callback
    ) {
        if (hasLocationOsPermission()) {
            callback.invoke(origin, true, false);
            return;
        }
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        prefs.edit().putBoolean("perm_asked_location", true).apply();
        pendingGeoOrigin = origin;
        pendingGeoCallback = callback;
        ActivityCompat.requestPermissions(
                this,
                new String[]{
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION
                },
                REQ_WEBVIEW_GEO
        );
    }

    private boolean hasLocationOsPermission() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED
                || ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    private String evaluateOsPermissionState(String permType) {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        if ("camera".equalsIgnoreCase(permType)) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                    == PackageManager.PERMISSION_GRANTED) {
                return "granted";
            }
            boolean asked = prefs.getBoolean("perm_asked_camera", false);
            boolean rationale = ActivityCompat.shouldShowRequestPermissionRationale(
                    this,
                    Manifest.permission.CAMERA
            );
            return (asked && !rationale) ? "denied" : "prompt";
        }

        if ("microphone".equalsIgnoreCase(permType)) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                    == PackageManager.PERMISSION_GRANTED) {
                return "granted";
            }
            boolean asked = prefs.getBoolean("perm_asked_microphone", false);
            boolean rationale = ActivityCompat.shouldShowRequestPermissionRationale(
                    this,
                    Manifest.permission.RECORD_AUDIO
            );
            return (asked && !rationale) ? "denied" : "prompt";
        }

        if ("location".equalsIgnoreCase(permType)) {
            if (hasLocationOsPermission()) {
                return "granted";
            }
            boolean asked = prefs.getBoolean("perm_asked_location", false);
            boolean rationale = ActivityCompat.shouldShowRequestPermissionRationale(
                    this,
                    Manifest.permission.ACCESS_FINE_LOCATION
            );
            return (asked && !rationale) ? "denied" : "prompt";
        }

        if ("notifications".equalsIgnoreCase(permType)) {
            boolean notificationsEnabled = NotificationManagerCompat.from(this).areNotificationsEnabled();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                boolean postGranted = ContextCompat.checkSelfPermission(
                        this,
                        Manifest.permission.POST_NOTIFICATIONS
                ) == PackageManager.PERMISSION_GRANTED;
                if (postGranted && notificationsEnabled) {
                    return "granted";
                }
                boolean asked = prefs.getBoolean("perm_asked_notifications", false);
                boolean rationale = ActivityCompat.shouldShowRequestPermissionRationale(
                        this,
                        Manifest.permission.POST_NOTIFICATIONS
                );
                return (asked && !rationale) ? "denied" : "prompt";
            } else {
                return notificationsEnabled ? "granted" : "denied";
            }
        }

        return "prompt";
    }

    private void notifyWebPermissionResult(String type, String state) {
        if (webView == null) return;
        try {
            JSONObject obj = new JSONObject();
            obj.put("type", type);
            obj.put("state", state);
            String js = "window.__osaReceiveNativePermissionResult && window.__osaReceiveNativePermissionResult("
                    + obj.toString() + ");";
            webView.post(() -> webView.evaluateJavascript(js, null));
        } catch (Exception ignored) {
        }
    }

    @Override
    public void onRequestPermissionsResult(
            int requestCode,
            @NonNull String[] permissions,
            @NonNull int[] grantResults
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        if (requestCode == REQ_WEBVIEW_MEDIA) {
            if (pendingWebPermissionRequest != null) {
                boolean allGranted = grantResults.length > 0;
                for (int r : grantResults) {
                    if (r != PackageManager.PERMISSION_GRANTED) {
                        allGranted = false;
                        break;
                    }
                }
                if (allGranted) {
                    pendingWebPermissionRequest.grant(pendingWebPermissionRequest.getResources());
                } else {
                    pendingWebPermissionRequest.deny();
                }
                pendingWebPermissionRequest = null;
            }
        } else if (requestCode == REQ_WEBVIEW_GEO) {
            if (pendingGeoCallback != null) {
                boolean granted = hasLocationOsPermission();
                pendingGeoCallback.invoke(pendingGeoOrigin, granted, false);
                pendingGeoCallback = null;
                pendingGeoOrigin = null;
            }
        } else if (requestCode == REQ_SINGLE_CAMERA) {
            notifyWebPermissionResult("camera", evaluateOsPermissionState("camera"));
        } else if (requestCode == REQ_SINGLE_MICROPHONE) {
            notifyWebPermissionResult("microphone", evaluateOsPermissionState("microphone"));
        } else if (requestCode == REQ_SINGLE_LOCATION) {
            notifyWebPermissionResult("location", evaluateOsPermissionState("location"));
        } else if (requestCode == REQ_SINGLE_NOTIFICATIONS || requestCode == REQ_INITIAL_NOTIFICATIONS) {
            String state = evaluateOsPermissionState("notifications");
            if ("granted".equals(state)) {
                fetchAndSyncFcmToken();
            }
            notifyWebPermissionResult("notifications", state);
        }

        if (webView != null) {
            webView.post(() -> webView.evaluateJavascript(
                    "window.__osaOnAppResume && window.__osaOnAppResume();",
                    null
            ));
        }
    }

    private void requestInitialNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
                boolean alreadyAsked = prefs.getBoolean("perm_asked_notifications", false);
                if (!alreadyAsked) {
                    prefs.edit().putBoolean("perm_asked_notifications", true).apply();
                    ActivityCompat.requestPermissions(
                            this,
                            new String[]{Manifest.permission.POST_NOTIFICATIONS},
                            REQ_INITIAL_NOTIFICATIONS
                    );
                }
            }
        }
        requestBatteryOptimizationExemptionIfNeeded();
    }

    private void requestBatteryOptimizationExemptionIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
        try {
            android.os.PowerManager pm = (android.os.PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null && !pm.isIgnoringBatteryOptimizations(getPackageName())) {
                SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
                boolean alreadyAskedBattery = prefs.getBoolean("perm_asked_battery_opt_v1", false);
                if (!alreadyAskedBattery) {
                    prefs.edit().putBoolean("perm_asked_battery_opt_v1", true).apply();
                    Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                    intent.setData(Uri.parse("package:" + getPackageName()));
                    startActivity(intent);
                }
            }
        } catch (Exception ignored) {
        }
    }

    private void clearNotificationCountFromIntent(Intent intent) {
        if (intent == null) return;
        String chatId = intent.getStringExtra("chatId");
        if (chatId == null || chatId.isEmpty()) {
            chatId = intent.getStringExtra("conversationId");
        }
        if (chatId != null && !chatId.isEmpty()) {
            clearConversationUnreadCounter(chatId);
        }
    }

    private void clearConversationUnreadCounter(String conversationId) {
        if (conversationId == null || conversationId.isEmpty()) return;
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        prefs.edit()
                .remove("unread_" + conversationId)
                .remove("last_msg_id_" + conversationId)
                .commit();
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            int notificationId = ((("osa_chat_" + conversationId).hashCode()) & 0x7FFFFFFF) % 1000000 + 2000;
            manager.cancel("osa-chat-" + conversationId, notificationId);
        }
    }

    private void capturePendingIntentPayload(Intent intent) {
        if (intent == null) return;
        try {
            String chatId = intent.getStringExtra("chatId");
            if (chatId == null || chatId.isEmpty()) {
                chatId = intent.getStringExtra("conversationId");
            }
            String callId = intent.getStringExtra("callId");
            String callType = intent.getStringExtra("callType");
            String callAction = intent.getStringExtra("callAction");

            Uri dataUri = intent.getData();
            if (dataUri != null) {
                if (chatId == null) chatId = dataUri.getQueryParameter("chatId");
                if (callId == null) callId = dataUri.getQueryParameter("callId");
                if (callType == null) callType = dataUri.getQueryParameter("callType");
                if (callAction == null) callAction = dataUri.getQueryParameter("callAction");
            }

            if ((callId != null && !callId.isEmpty()) || (chatId != null && !chatId.isEmpty())) {
                JSONObject obj = new JSONObject();
                if (chatId != null && !chatId.isEmpty()) obj.put("chatId", chatId);
                if (callId != null && !callId.isEmpty()) obj.put("callId", callId);
                if (callType != null && !callType.isEmpty()) obj.put("callType", callType);
                if (callAction != null && !callAction.isEmpty()) obj.put("callAction", callAction);
                pendingIntentPayloadJson = obj.toString();
            }
        } catch (Exception ignored) {
        }
    }

    private String buildLaunchUrl(Intent intent) {
        String base = PRODUCTION_WEB_URL;
        if (intent == null) return base;

        String chatId = intent.getStringExtra("chatId");
        if (chatId == null || chatId.isEmpty()) {
            chatId = intent.getStringExtra("conversationId");
        }
        String callId = intent.getStringExtra("callId");
        String callType = intent.getStringExtra("callType");
        String callAction = intent.getStringExtra("callAction");

        Uri dataUri = intent.getData();
        if (dataUri != null) {
            if (chatId == null) chatId = dataUri.getQueryParameter("chatId");
            if (callId == null) callId = dataUri.getQueryParameter("callId");
            if (callType == null) callType = dataUri.getQueryParameter("callType");
            if (callAction == null) callAction = dataUri.getQueryParameter("callAction");
        }

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
            if (chatId == null || chatId.isEmpty()) {
                chatId = intent.getStringExtra("conversationId");
            }
            String callId = intent.getStringExtra("callId");
            String callType = intent.getStringExtra("callType");
            String callAction = intent.getStringExtra("callAction");

            if (callId != null && !callId.isEmpty()) {
                JSONObject obj = new JSONObject();
                obj.put("callId", callId);
                obj.put("callType", callType != null ? callType : "audio");
                if (chatId != null && !chatId.isEmpty()) obj.put("chatId", chatId);
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

    private void fetchAndSyncFcmToken() {
        try {
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            String cachedToken = prefs.getString("fcm_token", null);
            if (cachedToken != null && !cachedToken.trim().isEmpty()) {
                pushTokenToWebView(cachedToken.trim());
                OSABackgroundMessagingService.syncFcmTokenToSupabaseAsync(this);
            }

            FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
                if (!task.isSuccessful()) {
                    android.util.Log.w("OSA_DIAG", "[OSA_FCM_TOKEN] getToken() failed: "
                            + (task.getException() != null ? task.getException().getMessage() : "unknown"));
                    return;
                }
                String token = task.getResult();
                if (token == null || token.trim().isEmpty()) {
                    android.util.Log.w("OSA_DIAG", "[OSA_FCM_TOKEN] getToken() returned empty token");
                    return;
                }

                String cleanToken = token.trim();
                android.util.Log.i("OSA_DIAG", "[OSA_FCM_TOKEN] generated len=" + cleanToken.length()
                        + " prefix=" + cleanToken.substring(0, Math.min(8, cleanToken.length())) + "...");
                prefs.edit().putString("fcm_token", cleanToken).commit();
                pushTokenToWebView(cleanToken);
                OSABackgroundMessagingService.syncFcmTokenToSupabaseAsync(MainActivity.this);
            });
        } catch (Exception ignored) {
        }
    }

    private void pushTokenToWebView(String token) {
        if (webView == null || token == null || token.trim().isEmpty()) return;
        try {
            JSONObject payload = new JSONObject();
            payload.put("platform", "android");
            payload.put("deviceId", getStableHardwareDeviceId());
            payload.put("pushToken", token.trim());
            payload.put("appVersion", "1.0.0");
            payload.put("deviceModel", Build.MODEL);
            payload.put("osVersion", Build.VERSION.RELEASE);
            String js = "window.__osaReceiveNativePushToken && window.__osaReceiveNativePushToken(" + payload.toString() + ");";
            webView.post(() -> webView.evaluateJavascript(js, null));
        } catch (Exception ignored) {
        }
    }

    private String getStableHardwareDeviceId() {
        String androidId = Settings.Secure.getString(getContentResolver(), Settings.Secure.ANDROID_ID);
        return androidId != null ? "android_" + androidId : "android_device";
    }

    private void launchAndroidAppPermissionSettings() {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        Uri uri = Uri.fromParts("package", getPackageName(), null);
        intent.setData(uri);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(intent);
    }

    private Map<String, String> parseJsonToStringMap(String jsonStr) {
        Map<String, String> map = new HashMap<>();
        if (jsonStr == null || jsonStr.trim().isEmpty()) return map;
        try {
            JSONObject obj = new JSONObject(jsonStr);
            Iterator<String> keys = obj.keys();
            while (keys.hasNext()) {
                String k = keys.next();
                if (!obj.isNull(k)) {
                    map.put(k, String.valueOf(obj.get(k)));
                }
            }
        } catch (Exception ignored) {
        }
        return map;
    }

    public class OSANativeAndroidBridge {
        @JavascriptInterface
        public String getPushToken() {
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            return prefs.getString("fcm_token", null);
        }

        @JavascriptInterface
        public void syncPushToken() {
            runOnUiThread(MainActivity.this::fetchAndSyncFcmToken);
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
        public String getDeviceModel() {
            return Build.MODEL;
        }

        @JavascriptInterface
        public String getOsVersion() {
            return Build.VERSION.RELEASE;
        }

        @JavascriptInterface
        public String consumePendingIntentPayload() {
            String payload = pendingIntentPayloadJson;
            pendingIntentPayloadJson = null;
            return payload;
        }

        @JavascriptInterface
        public void syncAuthSession(String sessionJson) {
            if (sessionJson == null || sessionJson.trim().isEmpty()) return;
            try {
                JSONObject obj = new JSONObject(sessionJson);
                String userId = obj.optString("userId", "").trim();
                String accessToken = obj.optString("accessToken", "").trim();
                String refreshToken = obj.optString("refreshToken", "").trim();
                String supabaseUrl = obj.optString("supabaseUrl", "").trim();
                String anonKey = obj.optString("anonKey", "").trim();

                if (!userId.isEmpty() && !accessToken.isEmpty()) {
                    SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
                    SharedPreferences.Editor editor = prefs.edit();
                    editor.putString("auth_user_id", userId);
                    editor.putString("auth_access_token", accessToken);
                    if (!refreshToken.isEmpty()) {
                        editor.putString("auth_refresh_token", refreshToken);
                    }
                    if (!supabaseUrl.isEmpty() && !supabaseUrl.contains("placeholder")) {
                        editor.putString("auth_supabase_url", supabaseUrl);
                    }
                    if (!anonKey.isEmpty() && !anonKey.contains("placeholder")) {
                        editor.putString("auth_anon_key", anonKey);
                    }
                    editor.commit();
                    OSABackgroundMessagingService.ensureStarted(MainActivity.this);
                    OSABackgroundMessagingService.syncFcmTokenToSupabaseAsync(MainActivity.this);
                }
            } catch (Exception ignored) {
            }
        }

        @JavascriptInterface
        public void clearAuthSession() {
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            prefs.edit()
                    .remove("auth_user_id")
                    .remove("auth_access_token")
                    .remove("auth_refresh_token")
                    .commit();
        }

        @JavascriptInterface
        public void showMessageNotification(String payloadJson) {
            Map<String, String> data = parseJsonToStringMap(payloadJson);
            if (data.isEmpty()) return;
            OSAFirebaseMessagingService.showGroupedMessageNotificationStatic(MainActivity.this, data);
        }

        @JavascriptInterface
        public void showIncomingCallNotification(String payloadJson) {
            Map<String, String> data = parseJsonToStringMap(payloadJson);
            if (data.isEmpty()) return;
            OSACallNotificationService.startCallNotificationFromData(MainActivity.this, data);
        }

        @JavascriptInterface
        public String getPermissionStatus(String permissionType) {
            return evaluateOsPermissionState(permissionType);
        }

        @JavascriptInterface
        public void requestSinglePermission(String permissionType) {
            runOnUiThread(() -> {
                SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
                if ("camera".equalsIgnoreCase(permissionType)) {
                    prefs.edit().putBoolean("perm_asked_camera", true).apply();
                    ActivityCompat.requestPermissions(
                            MainActivity.this,
                            new String[]{Manifest.permission.CAMERA},
                            REQ_SINGLE_CAMERA
                    );
                } else if ("microphone".equalsIgnoreCase(permissionType)) {
                    prefs.edit().putBoolean("perm_asked_microphone", true).apply();
                    ActivityCompat.requestPermissions(
                            MainActivity.this,
                            new String[]{Manifest.permission.RECORD_AUDIO},
                            REQ_SINGLE_MICROPHONE
                    );
                } else if ("location".equalsIgnoreCase(permissionType)) {
                    prefs.edit().putBoolean("perm_asked_location", true).apply();
                    ActivityCompat.requestPermissions(
                            MainActivity.this,
                            new String[]{
                                    Manifest.permission.ACCESS_FINE_LOCATION,
                                    Manifest.permission.ACCESS_COARSE_LOCATION
                            },
                            REQ_SINGLE_LOCATION
                    );
                } else if ("notifications".equalsIgnoreCase(permissionType)) {
                    prefs.edit().putBoolean("perm_asked_notifications", true).apply();
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        ActivityCompat.requestPermissions(
                                MainActivity.this,
                                new String[]{Manifest.permission.POST_NOTIFICATIONS},
                                REQ_SINGLE_NOTIFICATIONS
                        );
                    } else {
                        String state = evaluateOsPermissionState("notifications");
                        if (!"granted".equals(state)) {
                            launchAndroidAppPermissionSettings();
                        }
                        notifyWebPermissionResult("notifications", state);
                    }
                }
            });
        }

        @JavascriptInterface
        public void openPermissionSettings(String permissionType) {
            runOnUiThread(MainActivity.this::launchAndroidAppPermissionSettings);
        }

        @JavascriptInterface
        public void openAppSettings() {
            runOnUiThread(MainActivity.this::launchAndroidAppPermissionSettings);
        }

        @JavascriptInterface
        public void clearConversationNotifications(String conversationId) {
            clearConversationUnreadCounter(conversationId);
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
            runOnUiThread(() -> {
                SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
                prefs.edit()
                        .putBoolean("perm_asked_camera", true)
                        .putBoolean("perm_asked_microphone", true)
                        .putBoolean("perm_asked_location", true)
                        .putBoolean("perm_asked_notifications", true)
                        .apply();
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
                    if (ContextCompat.checkSelfPermission(MainActivity.this, p)
                            != PackageManager.PERMISSION_GRANTED) {
                        needsRequest = true;
                        break;
                    }
                }
                if (needsRequest) {
                    ActivityCompat.requestPermissions(MainActivity.this, perms, REQ_ALL_PERMISSIONS);
                }
            });
        }
    }
}
