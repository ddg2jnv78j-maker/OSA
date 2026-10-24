package app.osa.messaging;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.PictureInPictureParams;
import android.app.RemoteAction;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.drawable.Icon;
import android.media.AudioAttributes;
import android.media.AudioDeviceInfo;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.util.Base64;
import android.util.Rational;
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
import java.io.InputStream;
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
    public static final String CHANNEL_CALLS = "osa_incoming_calls_high_v3";
    public static final String CHANNEL_BG_SYNC = "osa_background_sync_silent_v2";
    private static final String PREFS_NAME = "osa_native_prefs";
    private static final String VIRTUAL_ASSET_HOST = "appassets.androidplatform.net";
    private static final String PRODUCTION_WEB_URL = "https://osa-chat.com/";
    private static final String BUNDLED_HTTPS_WEB_URL = "https://appassets.androidplatform.net/OSA/index.html";
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
    private static volatile boolean isAppInForeground = false;
    private static volatile String activeForegroundChatId = null;

    private WebView webView;
    private PermissionRequest pendingWebPermissionRequest;
    private GeolocationPermissions.Callback pendingGeoCallback;
    private String pendingGeoOrigin;
    private String pendingIntentPayloadJson = null;
    private String lastDispatchedCallSignature = null;
    private int fcmTokenRetryCount = 0;

    // Active Call & Picture-in-Picture (PiP) / Audio Route State
    private volatile boolean isCallActiveInWebView = false;
    private volatile String activeCallTypeInWebView = "audio";
    private volatile String activeCallIdInWebView = "";
    private volatile boolean speakerphoneEnabled = false;
    private AudioFocusRequest activeAudioFocusRequest = null;

    public static boolean isUserActivelyViewingChat(String conversationId) {
        if (!isAppInForeground || conversationId == null || conversationId.trim().isEmpty()) {
            return false;
        }
        String current = activeForegroundChatId;
        return current != null && current.equals(conversationId.trim());
    }

    public static boolean isAppActiveInForeground() {
        return isAppInForeground;
    }

    public static void notifyAuthSessionRefreshedFromService(String newAccessToken, String newRefreshToken) {
        MainActivity activity = activeInstanceRef != null ? activeInstanceRef.get() : null;
        if (activity != null) {
            activity.pushRefreshedAuthSessionToWebView(newAccessToken, newRefreshToken);
        }
    }

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

        // Delete legacy call channels that had channel-level sound enabled to prevent duplicate ringtones
        try {
            manager.deleteNotificationChannel("osa_incoming_calls_high_v2");
            manager.deleteNotificationChannel("osa_calls_high_v2");
        } catch (Exception ignored) {
        }

        NotificationChannel callsChannel = new NotificationChannel(
                CHANNEL_CALLS,
                "OSA Incoming Calls",
                NotificationManager.IMPORTANCE_HIGH
        );
        callsChannel.setDescription("Incoming and ongoing audio/video call alerts");
        // OSACallNotificationService is the single authoritative ringtone & vibration owner on Android.
        // Keeping channel sound null prevents Android System UI from playing a second overlapping ringtone.
        callsChannel.enableVibration(false);
        callsChannel.setSound(null, null);
        callsChannel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
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

    public static void notifyCallEndedFromNotification(String callId, String callType) {
        MainActivity activity = activeInstanceRef != null ? activeInstanceRef.get() : null;
        if (activity != null && activity.webView != null) {
            try {
                JSONObject obj = new JSONObject();
                obj.put("callId", callId);
                obj.put("callType", callType != null ? callType : "audio");
                obj.put("action", "end");
                String js = "window.__osaReceiveNativeCallAction && window.__osaReceiveNativeCallAction(" + obj.toString() + ");";
                activity.webView.post(() -> activity.webView.evaluateJavascript(js, null));
            } catch (Exception ignored) {
            }
        }
    }

    public static void dispatchToggleMuteCallToActiveWebView(Context context, String callId, boolean muted) {
        MainActivity activity = activeInstanceRef != null ? activeInstanceRef.get() : null;
        if (activity != null && activity.webView != null) {
            try {
                JSONObject obj = new JSONObject();
                obj.put("callId", callId != null ? callId : "");
                obj.put("muted", muted);
                obj.put("action", muted ? "mute" : "unmute");
                String js = "(function(){"
                        + "if (window.__osaReceiveNativeCallAction) { window.__osaReceiveNativeCallAction(" + obj.toString() + "); }"
                        + "window.dispatchEvent(new CustomEvent('osa:native-call-mute-changed', { detail: " + obj.toString() + " }));"
                        + "})();";
                activity.webView.post(() -> activity.webView.evaluateJavascript(js, null));
            } catch (Exception ignored) {
            }
        }
        try {
            if (context != null) {
                AudioManager am = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
                if (am != null) {
                    am.setMicrophoneMute(muted);
                }
            }
        } catch (Exception ignored) {
        }
    }

    public static void dispatchToggleSpeakerCallToActiveWebView(Context context, String callId, boolean speakerOn) {
        MainActivity activity = activeInstanceRef != null ? activeInstanceRef.get() : null;
        if (activity != null) {
            activity.speakerphoneEnabled = speakerOn;
            if (activity.webView != null) {
                try {
                    JSONObject obj = new JSONObject();
                    obj.put("callId", callId != null ? callId : "");
                    obj.put("speakerOn", speakerOn);
                    obj.put("action", speakerOn ? "speaker_on" : "speaker_off");
                    String js = "(function(){"
                            + "if (window.__osaReceiveNativeCallAction) { window.__osaReceiveNativeCallAction(" + obj.toString() + "); }"
                            + "window.dispatchEvent(new CustomEvent('osa:native-call-speaker-changed', { detail: " + obj.toString() + " }));"
                            + "})();";
                    activity.webView.post(() -> activity.webView.evaluateJavascript(js, null));
                } catch (Exception ignored) {
                }
            }
        }
    }

    public static void notifyAudioCallAcceptedInBackgroundService(
            String callId,
            String callerId,
            String callerName,
            String chatId
    ) {
        MainActivity activity = activeInstanceRef != null ? activeInstanceRef.get() : null;
        if (activity != null && activity.webView != null) {
            activity.isCallActiveInWebView = true;
            activity.activeCallIdInWebView = callId != null ? callId : "";
            activity.activeCallTypeInWebView = "audio";
            try {
                JSONObject obj = new JSONObject();
                obj.put("callId", callId != null ? callId : "");
                obj.put("callType", "audio");
                obj.put("callerId", callerId != null ? callerId : "");
                obj.put("callerName", callerName != null ? callerName : "");
                obj.put("chatId", chatId != null ? chatId : "");
                obj.put("status", "accepted");
                obj.put("action", "bg_audio_accepted");
                String js = "(function(){"
                        + "if (window.__osaReceiveNativeCallAction) { window.__osaReceiveNativeCallAction(" + obj.toString() + "); }"
                        + "window.dispatchEvent(new CustomEvent('osa:native-bg-call-state', { detail: " + obj.toString() + " }));"
                        + "})();";
                activity.webView.post(() -> activity.webView.evaluateJavascript(js, null));
            } catch (Exception ignored) {
            }
        }
    }

    public static void notifyNativeBgCallConnected(String callId) {
        MainActivity activity = activeInstanceRef != null ? activeInstanceRef.get() : null;
        if (activity != null && activity.webView != null) {
            try {
                JSONObject obj = new JSONObject();
                obj.put("callId", callId != null ? callId : "");
                obj.put("callType", "audio");
                obj.put("status", "connected");
                obj.put("action", "bg_audio_connected");
                String js = "(function(){"
                        + "if (window.__osaReceiveNativeCallAction) { window.__osaReceiveNativeCallAction(" + obj.toString() + "); }"
                        + "window.dispatchEvent(new CustomEvent('osa:native-bg-call-state', { detail: " + obj.toString() + " }));"
                        + "})();";
                activity.webView.post(() -> activity.webView.evaluateJavascript(js, null));
            } catch (Exception ignored) {
            }
        }
    }

    public static void notifyInlineReplySentFromNotification(String chatId, String messageId, String content) {
        MainActivity activity = activeInstanceRef != null ? activeInstanceRef.get() : null;
        if (activity != null && activity.webView != null) {
            try {
                JSONObject obj = new JSONObject();
                obj.put("chatId", chatId != null ? chatId : "");
                obj.put("messageId", messageId != null ? messageId : "");
                obj.put("content", content != null ? content : "");
                String js = "(function(){"
                        + "if (window.__osaOnAppResume) { window.__osaOnAppResume(); }"
                        + "window.dispatchEvent(new CustomEvent('osa:native-inline-reply-sent', { detail: " + obj.toString() + " }));"
                        + "})();";
                activity.webView.post(() -> activity.webView.evaluateJavascript(js, null));
            } catch (Exception ignored) {
            }
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                setShowWhenLocked(true);
                setTurnScreenOn(true);
            }
            getWindow().addFlags(
                    android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                            | android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            );
        } catch (Exception ignored) {
        }
        activeInstanceRef = new WeakReference<>(this);
        ensureNotificationChannels(this);
        Intent launchIntent = getIntent();
        boolean isIncomingCallLaunch = launchIntent != null
                && launchIntent.getStringExtra("callId") != null
                && !launchIntent.getStringExtra("callId").trim().isEmpty();
        if (!isIncomingCallLaunch) {
            requestInitialNotificationPermissionIfNeeded();
        }
        OSABackgroundMessagingService.ensureStarted(this);

        webView = new WebView(this) {
            @Override
            protected void onWindowVisibilityChanged(int visibility) {
                if (visibility != android.view.View.VISIBLE
                        && (isCallActiveInWebView || OSACallNotificationService.isAnyCallOngoing())) {
                    super.onWindowVisibilityChanged(android.view.View.VISIBLE);
                    return;
                }
                super.onWindowVisibilityChanged(visibility);
            }
        };
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
                        Uri reqUri = request.getUrl();
                        if (VIRTUAL_ASSET_HOST.equalsIgnoreCase(reqUri.getHost())) {
                            WebResourceResponse localResp = serveBundledPublicAsset(reqUri);
                            if (localResp != null) {
                                return localResp;
                            }
                        }
                        inspectSupabaseRequestHeaders(request);
                    }
                } catch (Exception ignored) {
                }
                return super.shouldInterceptRequest(view, request);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                syncNativeSessionToWebViewIfNewer();
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
                        view.loadUrl(BUNDLED_HTTPS_WEB_URL);
                    } else if (!failingUrl.startsWith(BUNDLED_HTTPS_WEB_URL) && !failingUrl.startsWith(LOCAL_ASSET_URL)) {
                        view.loadUrl(BUNDLED_HTTPS_WEB_URL);
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
        isAppInForeground = true;
        activeInstanceRef = new WeakReference<>(this);
        OSABackgroundMessagingService.ensureStarted(this);
        fetchAndSyncFcmToken();
        if (webView != null) {
            webView.onResume();
            webView.resumeTimers();
            syncNativeSessionToWebViewIfNewer();
            probeSupabaseSessionFromWebView();
            dispatchIntentToWebApp(getIntent());
            webView.post(() -> webView.evaluateJavascript(
                    "window.__osaOnAppResume && window.__osaOnAppResume();",
                    null
            ));
        }
    }

        @Override
        protected void onPause() {
            super.onPause();
            isAppInForeground = false;
            activeForegroundChatId = null;
            probeSupabaseSessionFromWebView();
            OSABackgroundMessagingService.ensureStarted(this);
            // Keep WebView rendering, timers, and WebRTC media active after super.onPause() when in a call or PiP
            if ((isCallActiveInWebView || (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && isInPictureInPictureMode()))
                    && webView != null) {
                webView.onResume();
                webView.resumeTimers();
            }
        }

        @Override
        protected void onStop() {
            super.onStop();
            isAppInForeground = false;
            activeForegroundChatId = null;
            OSABackgroundMessagingService.ensureStarted(this);
            if ((isCallActiveInWebView || (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && isInPictureInPictureMode()))
                    && webView != null) {
                webView.onResume();
                webView.resumeTimers();
            }
        }

        @Override
        protected void onUserLeaveHint() {
            super.onUserLeaveHint();
            // Automatically enter Android system Picture-in-Picture when user switches to another app during an active video call
            if (isCallActiveInWebView && "video".equalsIgnoreCase(activeCallTypeInWebView)) {
                enterVideoCallPipMode();
            }
        }

        @Override
        public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode, Configuration newConfig) {
            super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);
            if (webView != null) {
                webView.onResume();
                webView.resumeTimers();
                final String js = "(function(pip){"
                        + "if (window.__osaOnPipModeChanged) { window.__osaOnPipModeChanged(pip); }"
                        + "window.dispatchEvent(new CustomEvent('osa:pip-mode-changed', { detail: { isInPictureInPictureMode: pip } }));"
                        + "})(" + (isInPictureInPictureMode ? "true" : "false") + ");";
                webView.post(() -> webView.evaluateJavascript(js, null));
            }
        }

        @Override
        protected void onNewIntent(Intent intent) {
            super.onNewIntent(intent);
            setIntent(intent);
            lastDispatchedCallSignature = null;
            handleIncomingCallAcceptOrOpenIntent(intent);
            clearNotificationCountFromIntent(intent);
            capturePendingIntentPayload(intent);
            dispatchIntentToWebApp(intent);
        }

        private void handleIncomingCallAcceptOrOpenIntent(Intent intent) {
            if (intent == null) return;
            String callId = intent.getStringExtra("callId");
            String callAction = intent.getStringExtra("callAction");
            String callType = intent.getStringExtra("callType");
            if (callId != null && !callId.trim().isEmpty()) {
                OSAIncomingCallActivity.finishIfMatchingCall(callId.trim());
                if ("accept".equalsIgnoreCase(callAction)) {
                    isCallActiveInWebView = true;
                    activeCallIdInWebView = callId.trim();
                    activeCallTypeInWebView = callType != null && !callType.trim().isEmpty()
                            ? callType.trim().toLowerCase()
                            : "audio";
                    // Configure audio routing immediately: earpiece for audio calls, speakerphone for video calls
                    applyCallAudioRoute("video".equalsIgnoreCase(activeCallTypeInWebView) ? "speaker" : "earpiece");
                    updatePipAutoEnterState();
                    // Stop the ringtone immediately and transition notification to Ongoing Call (with End Call action)
                    OSACallNotificationService.startOngoingCallNotification(
                            this,
                            callId.trim(),
                            callType,
                            intent.getStringExtra("callerId"),
                            intent.getStringExtra("callerName"),
                            intent.getStringExtra("chatId")
                    );
                } else if ("open".equalsIgnoreCase(callAction)) {
                    isCallActiveInWebView = true;
                    activeCallIdInWebView = callId.trim();
                    if (callType != null && !callType.trim().isEmpty()) {
                        activeCallTypeInWebView = callType.trim().toLowerCase();
                    }
                    speakerphoneEnabled = OSACallNotificationService.isCurrentOngoingCallSpeakerOn();
                    updatePipAutoEnterState();
                } else if ("reject".equalsIgnoreCase(callAction) || "end".equalsIgnoreCase(callAction)) {
                    isCallActiveInWebView = false;
                    activeCallIdInWebView = "";
                    applyCallAudioRoute("reset");
                    updatePipAutoEnterState();
                    OSACallNotificationService.stopCallNotification(this, callId.trim());
                }
            }
        }

        private void applyCallAudioRoute(String routeMode) {
            try {
                AudioManager audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
                if (audioManager == null) return;

                if ("reset".equalsIgnoreCase(routeMode)) {
                    speakerphoneEnabled = false;
                    try {
                        audioManager.setMicrophoneMute(false);
                    } catch (Exception ignored) {
                    }
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        try {
                            audioManager.clearCommunicationDevice();
                        } catch (Exception ignored) {
                        }
                    }
                    audioManager.setSpeakerphoneOn(false);
                    audioManager.setMode(AudioManager.MODE_NORMAL);
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && activeAudioFocusRequest != null) {
                        try {
                            audioManager.abandonAudioFocusRequest(activeAudioFocusRequest);
                        } catch (Exception ignored) {
                        }
                        activeAudioFocusRequest = null;
                    } else {
                        audioManager.abandonAudioFocus(null);
                    }
                    setVolumeControlStream(AudioManager.USE_DEFAULT_STREAM_TYPE);
                    android.util.Log.i("OSA_DIAG", "[OSA_AUDIO_ROUTE] reset completed");
                    return;
                }

                boolean wantSpeaker = "speaker".equalsIgnoreCase(routeMode);
                speakerphoneEnabled = wantSpeaker;

                setVolumeControlStream(AudioManager.STREAM_VOICE_CALL);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    if (activeAudioFocusRequest == null) {
                        AudioAttributes attrs = new AudioAttributes.Builder()
                                .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                                .build();
                        activeAudioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                                .setAudioAttributes(attrs)
                                .setAcceptsDelayedFocusGain(true)
                                .setOnAudioFocusChangeListener(focusChange -> {})
                                .build();
                    }
                    audioManager.requestAudioFocus(activeAudioFocusRequest);
                } else {
                    audioManager.requestAudioFocus(
                            null,
                            AudioManager.STREAM_VOICE_CALL,
                            AudioManager.AUDIOFOCUS_GAIN_TRANSIENT
                    );
                }

                audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
                audioManager.setSpeakerphoneOn(wantSpeaker);

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    try {
                        if (!wantSpeaker) {
                            audioManager.clearCommunicationDevice();
                        }
                        List<AudioDeviceInfo> devices = audioManager.getAvailableCommunicationDevices();
                        AudioDeviceInfo targetDevice = null;
                        if (wantSpeaker) {
                            for (AudioDeviceInfo dev : devices) {
                                if (dev.getType() == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) {
                                    targetDevice = dev;
                                    break;
                                }
                            }
                        } else {
                            // Prefer wired headset or Bluetooth headset if connected; otherwise built-in earpiece
                            for (AudioDeviceInfo dev : devices) {
                                int t = dev.getType();
                                if (t == AudioDeviceInfo.TYPE_WIRED_HEADSET
                                        || t == AudioDeviceInfo.TYPE_WIRED_HEADPHONES
                                        || t == AudioDeviceInfo.TYPE_USB_HEADSET
                                        || t == AudioDeviceInfo.TYPE_BLUETOOTH_SCO
                                        || t == AudioDeviceInfo.TYPE_BLE_HEADSET) {
                                    targetDevice = dev;
                                    break;
                                }
                            }
                            if (targetDevice == null) {
                                for (AudioDeviceInfo dev : devices) {
                                    if (dev.getType() == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE) {
                                        targetDevice = dev;
                                        break;
                                    }
                                }
                            }
                        }
                        if (targetDevice != null) {
                            boolean ok = audioManager.setCommunicationDevice(targetDevice);
                            android.util.Log.i("OSA_DIAG", "[OSA_AUDIO_ROUTE] mode=" + routeMode
                                    + " deviceType=" + targetDevice.getType() + " setCommDevice=" + ok);
                        }
                    } catch (Exception ignored) {
                    }
                }
            } catch (Exception ignored) {
            }
        }

        private boolean isDevicePipSupported() {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false;
            return getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE);
        }

        private PictureInPictureParams buildVideoPipParams(boolean enableAutoEnter) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return null;
            PictureInPictureParams.Builder builder = new PictureInPictureParams.Builder()
                    .setAspectRatio(new Rational(9, 16));

            try {
                if (webView != null && webView.getWidth() > 0 && webView.getHeight() > 0) {
                    android.graphics.Rect sourceRect = new android.graphics.Rect();
                    if (webView.getGlobalVisibleRect(sourceRect)
                            && sourceRect.width() > 0
                            && sourceRect.height() > 0) {
                        builder.setSourceRectHint(sourceRect);
                    }
                }
            } catch (Exception ignored) {
            }

            if (activeCallIdInWebView != null && !activeCallIdInWebView.isEmpty()) {
                Intent endIntent = new Intent(this, OSACallActionReceiver.class);
                endIntent.setAction(OSACallActionReceiver.ACTION_END_CALL);
                endIntent.putExtra("callId", activeCallIdInWebView);
                endIntent.putExtra("callType", activeCallTypeInWebView);
                PendingIntent endPending = PendingIntent.getBroadcast(
                        this,
                        9911,
                        endIntent,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                );
                RemoteAction endAction = new RemoteAction(
                        Icon.createWithResource(this, android.R.drawable.ic_menu_close_clear_cancel),
                        "End Call",
                        "End active OSA call",
                        endPending
                );
                List<RemoteAction> actions = new ArrayList<>();
                actions.add(endAction);
                builder.setActions(actions);
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                builder.setAutoEnterEnabled(enableAutoEnter);
                builder.setSeamlessResizeEnabled(true);
            }
            return builder.build();
        }

        private void updatePipAutoEnterState() {
            if (!isDevicePipSupported() || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
            runOnUiThread(() -> {
                try {
                    boolean shouldAutoPip = isCallActiveInWebView && "video".equalsIgnoreCase(activeCallTypeInWebView);
                    PictureInPictureParams params = buildVideoPipParams(shouldAutoPip);
                    if (params != null) {
                        setPictureInPictureParams(params);
                    }
                } catch (Exception ignored) {
                }
            });
        }

        private boolean enterVideoCallPipMode() {
            if (!isDevicePipSupported() || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false;
            if (isInPictureInPictureMode()) return true;
            try {
                PictureInPictureParams params = buildVideoPipParams(
                        isCallActiveInWebView && "video".equalsIgnoreCase(activeCallTypeInWebView)
                );
                if (params != null) {
                    return enterPictureInPictureMode(params);
                }
            } catch (Exception ignored) {
            }
            return false;
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
                    String existingJwt = prefs.getString("auth_access_token", "");
                    String existingUserId = prefs.getString("auth_user_id", "");
                    long incomingExp = extractExpFromJwt(jwt);
                    long existingExp = extractExpFromJwt(existingJwt);
                    if (!extractedUserId.equals(existingUserId) || incomingExp >= existingExp) {
                        if (!jwt.equals(existingJwt)) {
                            editor.putString("auth_access_token", jwt);
                            changed = true;
                        }
                        if (!extractedUserId.equals(existingUserId)) {
                            editor.putString("auth_user_id", extractedUserId);
                            changed = true;
                        }
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

    public static long extractExpFromJwt(String jwt) {
        if (jwt == null || jwt.isEmpty()) return 0L;
        try {
            String[] parts = jwt.split("\\.");
            if (parts.length < 2) return 0L;
            byte[] decoded = Base64.decode(parts[1], Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
            String payloadJson = new String(decoded, StandardCharsets.UTF_8);
            JSONObject obj = new JSONObject(payloadJson);
            return obj.optLong("exp", 0L);
        } catch (Exception ignored) {
            return 0L;
        }
    }

    private void pushRefreshedAuthSessionToWebView(String newAccessToken, String newRefreshToken) {
        if (webView == null || newAccessToken == null || newAccessToken.isEmpty()) return;
        try {
            long newExp = extractExpFromJwt(newAccessToken);
            JSONObject payload = new JSONObject();
            payload.put("accessToken", newAccessToken);
            payload.put("refreshToken", newRefreshToken != null ? newRefreshToken : "");
            payload.put("expiresAt", newExp);
            String js = "(function(p){"
                    + "try {"
                    + "  var raw = localStorage.getItem('osa-auth-token');"
                    + "  if (!raw) return;"
                    + "  var parsed = JSON.parse(raw);"
                    + "  var s = parsed.currentSession || parsed.session || parsed;"
                    + "  if (!s) return;"
                    + "  var curExp = Number(s.expires_at || 0);"
                    + "  if (p.expiresAt > 0 && p.expiresAt >= curExp) {"
                    + "    s.access_token = p.accessToken;"
                    + "    if (p.refreshToken) s.refresh_token = p.refreshToken;"
                    + "    s.expires_at = p.expiresAt;"
                    + "    localStorage.setItem('osa-auth-token', JSON.stringify(parsed));"
                    + "    window.dispatchEvent(new CustomEvent('osa:native-auth-refreshed', { detail: p }));"
                    + "  }"
                    + "} catch(e){}"
                    + "})(" + payload.toString() + ");";
            webView.post(() -> webView.evaluateJavascript(js, null));
        } catch (Exception ignored) {
        }
    }

    private void syncNativeSessionToWebViewIfNewer() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        String nativeAccess = prefs.getString("auth_access_token", "");
        String nativeRefresh = prefs.getString("auth_refresh_token", "");
        if (nativeAccess != null && !nativeAccess.isEmpty()) {
            pushRefreshedAuthSessionToWebView(nativeAccess, nativeRefresh);
        }
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

        if ("full_screen_intent".equalsIgnoreCase(permType)) {
            return OSAIncomingCallActivity.canUseFullScreenIntentOnDevice(this) ? "granted" : "prompt";
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
            if (grantResults.length > 0) {
                getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                        .edit()
                        .putBoolean("perm_asked_notifications", true)
                        .apply();
            }
            String state = evaluateOsPermissionState("notifications");
            if ("granted".equals(state)) {
                fetchAndSyncFcmToken();
                OSABackgroundMessagingService.ensureStarted(this);
            }
            notifyWebPermissionResult("notifications", state);
            requestBatteryOptimizationExemptionIfNeeded();
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
                ActivityCompat.requestPermissions(
                        this,
                        new String[]{Manifest.permission.POST_NOTIFICATIONS},
                        REQ_INITIAL_NOTIFICATIONS
                );
                // Do not start battery optimization activity while POST_NOTIFICATIONS dialog is active;
                // onRequestPermissionsResult will trigger requestBatteryOptimizationExemptionIfNeeded().
                return;
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
        String senderId = intent.getStringExtra("senderId");
        if (chatId != null && !chatId.isEmpty()) {
            clearConversationUnreadCounter(chatId);
        }
        if (senderId != null && !senderId.isEmpty() && !senderId.equals(chatId)) {
            clearConversationUnreadCounter(senderId);
        }
    }

    private void clearConversationUnreadCounter(String conversationId) {
        if (conversationId == null || conversationId.isEmpty()) return;
        if (isAppInForeground) {
            activeForegroundChatId = conversationId.trim();
        }
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        prefs.edit()
                .remove("unread_" + conversationId)
                .remove("last_msg_id_" + conversationId)
                .commit();
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            int notificationId = ((("osa_chat_" + conversationId).hashCode()) & 0x7FFFFFFF) % 1000000 + 2000;
            manager.cancel("osa-chat-" + conversationId, 0);
            manager.cancel("osa-chat-" + conversationId, notificationId);
        }
    }

    @Nullable
    private WebResourceResponse serveBundledPublicAsset(Uri uri) {
        if (uri == null) return null;
        String rawPath = uri.getPath();
        if (rawPath == null || rawPath.isEmpty() || "/".equals(rawPath)) {
            rawPath = "/index.html";
        }
        if (rawPath.startsWith("/OSA/")) {
            rawPath = rawPath.substring(4);
        } else if ("/OSA".equals(rawPath)) {
            rawPath = "/index.html";
        }
        String relPath = rawPath.startsWith("/") ? rawPath.substring(1) : rawPath;
        if (relPath.isEmpty()) {
            relPath = "index.html";
        }

        InputStream stream = null;
        String resolvedPath = relPath;
        try {
            stream = getAssets().open("public/" + relPath);
        } catch (Exception e1) {
            if (!relPath.contains(".")) {
                try {
                    resolvedPath = "index.html";
                    stream = getAssets().open("public/index.html");
                } catch (Exception ignored) {
                }
            }
        }
        if (stream == null) return null;

        String mimeType = resolveMimeType(resolvedPath);
        WebResourceResponse response = new WebResourceResponse(mimeType, "UTF-8", stream);
        Map<String, String> headers = new HashMap<>();
        headers.put("Access-Control-Allow-Origin", "*");
        headers.put("Cache-Control", "no-cache");
        response.setResponseHeaders(headers);
        return response;
    }

    private String resolveMimeType(String path) {
        String lower = path != null ? path.toLowerCase() : "";
        if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html";
        if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "application/javascript";
        if (lower.endsWith(".css")) return "text/css";
        if (lower.endsWith(".json") || lower.endsWith(".webmanifest")) return "application/json";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".ico")) return "image/x-icon";
        if (lower.endsWith(".wav")) return "audio/wav";
        if (lower.endsWith(".mp3")) return "audio/mpeg";
        if (lower.endsWith(".woff2")) return "font/woff2";
        if (lower.endsWith(".woff")) return "font/woff";
        return "application/octet-stream";
    }

    private void capturePendingIntentPayload(Intent intent) {
        if (intent == null) return;
        try {
            String chatId = intent.getStringExtra("chatId");
            if (chatId == null || chatId.isEmpty()) {
                chatId = intent.getStringExtra("conversationId");
            }
            String senderId = intent.getStringExtra("senderId");
            String senderName = intent.getStringExtra("senderName");
            String notificationAction = intent.getStringExtra("notificationAction");
            String callId = intent.getStringExtra("callId");
            String callType = intent.getStringExtra("callType");
            String callerId = intent.getStringExtra("callerId");
            String callerName = intent.getStringExtra("callerName");
            String callAction = intent.getStringExtra("callAction");

            Uri dataUri = intent.getData();
            if (dataUri != null) {
                if (chatId == null) chatId = dataUri.getQueryParameter("chatId");
                if (chatId == null) chatId = dataUri.getQueryParameter("conversationId");
                if (senderId == null) senderId = dataUri.getQueryParameter("senderId");
                if (notificationAction == null) notificationAction = dataUri.getQueryParameter("action");
                if (callId == null) callId = dataUri.getQueryParameter("callId");
                if (callType == null) callType = dataUri.getQueryParameter("callType");
                if (callerId == null) callerId = dataUri.getQueryParameter("callerId");
                if (callerName == null) callerName = dataUri.getQueryParameter("callerName");
                if (callAction == null) callAction = dataUri.getQueryParameter("callAction");
            }

            if ((callId != null && !callId.isEmpty())
                    || (chatId != null && !chatId.isEmpty())
                    || (senderId != null && !senderId.isEmpty())) {
                JSONObject obj = new JSONObject();
                if (chatId != null && !chatId.isEmpty()) {
                    obj.put("chatId", chatId);
                    obj.put("conversationId", chatId);
                }
                if (senderId != null && !senderId.isEmpty()) obj.put("senderId", senderId);
                if (senderName != null && !senderName.isEmpty()) obj.put("senderName", senderName);
                if (notificationAction != null && !notificationAction.isEmpty()) {
                    obj.put("notificationAction", notificationAction);
                }
                if (callId != null && !callId.isEmpty()) obj.put("callId", callId);
                if (callType != null && !callType.isEmpty()) obj.put("callType", callType);
                if (callerId != null && !callerId.isEmpty()) obj.put("callerId", callerId);
                if (callerName != null && !callerName.isEmpty()) obj.put("callerName", callerName);
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
        String senderId = intent.getStringExtra("senderId");
        String notificationAction = intent.getStringExtra("notificationAction");
        String callId = intent.getStringExtra("callId");
        String callType = intent.getStringExtra("callType");
        String callerId = intent.getStringExtra("callerId");
        String callerName = intent.getStringExtra("callerName");
        String callAction = intent.getStringExtra("callAction");

        Uri dataUri = intent.getData();
        if (dataUri != null) {
            if (chatId == null) chatId = dataUri.getQueryParameter("chatId");
            if (chatId == null) chatId = dataUri.getQueryParameter("conversationId");
            if (senderId == null) senderId = dataUri.getQueryParameter("senderId");
            if (notificationAction == null) notificationAction = dataUri.getQueryParameter("action");
            if (callId == null) callId = dataUri.getQueryParameter("callId");
            if (callType == null) callType = dataUri.getQueryParameter("callType");
            if (callerId == null) callerId = dataUri.getQueryParameter("callerId");
            if (callerName == null) callerName = dataUri.getQueryParameter("callerName");
            if (callAction == null) callAction = dataUri.getQueryParameter("callAction");
        }

        Uri.Builder builder = Uri.parse(base).buildUpon();
        if (chatId != null && !chatId.isEmpty()) {
            builder.appendQueryParameter("chatId", chatId);
            builder.appendQueryParameter("conversationId", chatId);
        }
        if (senderId != null && !senderId.isEmpty()) {
            builder.appendQueryParameter("senderId", senderId);
        }
        if (notificationAction != null && !notificationAction.isEmpty()) {
            builder.appendQueryParameter("action", notificationAction);
        }
        if (callId != null && !callId.isEmpty()) builder.appendQueryParameter("callId", callId);
        if (callType != null && !callType.isEmpty()) builder.appendQueryParameter("callType", callType);
        if (callerId != null && !callerId.isEmpty()) builder.appendQueryParameter("callerId", callerId);
        if (callerName != null && !callerName.isEmpty()) builder.appendQueryParameter("callerName", callerName);
        if (callAction != null && !callAction.isEmpty()) builder.appendQueryParameter("callAction", callAction);
        return builder.build().toString();
    }

    private void clearConsumedIntentExtras(Intent intent) {
        if (intent == null) return;
        try {
            intent.removeExtra("chatId");
            intent.removeExtra("conversationId");
            intent.removeExtra("senderId");
            intent.removeExtra("senderName");
            intent.removeExtra("notificationAction");
            intent.removeExtra("callId");
            intent.removeExtra("callType");
            intent.removeExtra("callerId");
            intent.removeExtra("callerName");
            intent.removeExtra("callerAvatar");
            intent.removeExtra("callAction");
            if (intent.getData() != null) {
                intent.setData(null);
            }
        } catch (Exception ignored) {
        }
    }

    private void dispatchIntentToWebApp(Intent intent) {
        if (intent == null || webView == null) return;
        try {
            String chatId = intent.getStringExtra("chatId");
            if (chatId == null || chatId.isEmpty()) {
                chatId = intent.getStringExtra("conversationId");
            }
            String senderId = intent.getStringExtra("senderId");
            String senderName = intent.getStringExtra("senderName");
            String notificationAction = intent.getStringExtra("notificationAction");
            String callId = intent.getStringExtra("callId");
            String callType = intent.getStringExtra("callType");
            String callerId = intent.getStringExtra("callerId");
            String callerName = intent.getStringExtra("callerName");
            String callAction = intent.getStringExtra("callAction");

            if (callId != null && !callId.isEmpty()) {
                String actionVal = callAction != null && !callAction.isEmpty() ? callAction : "open";
                final String callSig = callId.trim() + ":" + actionVal;
                if (callSig.equals(lastDispatchedCallSignature)) {
                    return;
                }
                JSONObject obj = new JSONObject();
                obj.put("callId", callId);
                obj.put("callType", callType != null ? callType : "audio");
                if (callerId != null && !callerId.isEmpty()) obj.put("callerId", callerId);
                if (callerName != null && !callerName.isEmpty()) obj.put("callerName", callerName);
                if (chatId != null && !chatId.isEmpty()) obj.put("chatId", chatId);
                obj.put("action", actionVal);
                String js = "(function(){ if (window.__osaReceiveNativeCallAction) { window.__osaReceiveNativeCallAction("
                        + obj.toString() + "); return 'delivered'; } return 'pending'; })()";
                webView.post(() -> webView.evaluateJavascript(js, value -> {
                    if (value != null && value.contains("delivered")) {
                        lastDispatchedCallSignature = callSig;
                        pendingIntentPayloadJson = null;
                        clearConsumedIntentExtras(intent);
                    }
                }));
            } else if ((chatId != null && !chatId.isEmpty()) || (senderId != null && !senderId.isEmpty())) {
                JSONObject obj = new JSONObject();
                if (chatId != null && !chatId.isEmpty()) {
                    obj.put("chatId", chatId);
                    obj.put("conversationId", chatId);
                }
                if (senderId != null && !senderId.isEmpty()) obj.put("senderId", senderId);
                if (senderName != null && !senderName.isEmpty()) obj.put("senderName", senderName);
                obj.put("action", notificationAction != null && !notificationAction.isEmpty() ? notificationAction : "same_chat");
                String js = "(function(){ if (window.__osaReceiveNativeDeepLink) { window.__osaReceiveNativeDeepLink("
                        + obj.toString() + "); return 'delivered'; } return 'pending'; })()";
                webView.post(() -> webView.evaluateJavascript(js, value -> {
                    if (value != null && value.contains("delivered")) {
                        pendingIntentPayloadJson = null;
                        clearConsumedIntentExtras(intent);
                    }
                }));
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

            requestFcmTokenInternal(prefs);
        } catch (Exception ignored) {
        }
    }

    private void requestFcmTokenInternal(SharedPreferences prefs) {
        try {
            FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
                if (!task.isSuccessful()) {
                    android.util.Log.w("OSA_DIAG", "[OSA_FCM_TOKEN] getToken() failed: "
                            + (task.getException() != null ? task.getException().getMessage() : "unknown"));
                    if (fcmTokenRetryCount < 4 && webView != null) {
                        fcmTokenRetryCount++;
                        long delayMs = fcmTokenRetryCount * 4000L;
                        webView.postDelayed(() -> requestFcmTokenInternal(prefs), delayMs);
                    }
                    return;
                }
                String token = task.getResult();
                if (token == null || token.trim().isEmpty()) {
                    android.util.Log.w("OSA_DIAG", "[OSA_FCM_TOKEN] getToken() returned empty token");
                    return;
                }

                fcmTokenRetryCount = 0;
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
        public String peekPendingIntentPayload() {
            return pendingIntentPayloadJson;
        }

        @JavascriptInterface
        public String consumePendingIntentPayload() {
            String payload = pendingIntentPayloadJson;
            pendingIntentPayloadJson = null;
            if (payload != null && !payload.isEmpty()) {
                try {
                    JSONObject parsed = new JSONObject(payload);
                    String cid = parsed.optString("callId", "").trim();
                    String cact = parsed.optString("callAction", "open").trim();
                    if (!cid.isEmpty()) {
                        lastDispatchedCallSignature = cid + ":" + cact;
                    }
                } catch (Exception ignored) {
                }
                runOnUiThread(() -> clearConsumedIntentExtras(getIntent()));
            }
            return payload;
        }

        @JavascriptInterface
        public void setCallAudioRoute(String routeMode) {
            String normalized = routeMode != null ? routeMode.trim().toLowerCase() : "earpiece";
            if (!"reset".equals(normalized)) {
                boolean wantSpeaker = "speaker".equals(normalized);
                speakerphoneEnabled = wantSpeaker;
                OSACallNotificationService.updateOngoingCallSpeakerState(
                        MainActivity.this,
                        activeCallIdInWebView,
                        wantSpeaker
                );
            }
            runOnUiThread(() -> applyCallAudioRoute(normalized));
        }

        @JavascriptInterface
        public boolean isSpeakerphoneOn() {
            if (OSACallNotificationService.isAnyCallOngoing()) {
                return OSACallNotificationService.isCurrentOngoingCallSpeakerOn();
            }
            return speakerphoneEnabled;
        }

        @JavascriptInterface
        public boolean isCallMuted() {
            return OSACallNotificationService.isCurrentOngoingCallMuted();
        }

        @JavascriptInterface
        public boolean isBackgroundAudioCallActive(String callId) {
            return OSACallNotificationService.isBackgroundAudioSessionActiveForCall(callId);
        }

        @JavascriptInterface
        public void endOngoingCall(String callId) {
            String targetCallId = callId != null && !callId.trim().isEmpty()
                    ? callId.trim()
                    : activeCallIdInWebView;
            OSACallNotificationService.endCallAndCleanup(MainActivity.this, targetCallId);
            if (targetCallId != null && !targetCallId.isEmpty()) {
                Intent endIntent = new Intent(MainActivity.this, OSACallActionReceiver.class);
                endIntent.setAction(OSACallActionReceiver.ACTION_END_CALL);
                endIntent.putExtra("callId", targetCallId);
                sendBroadcast(endIntent);
            }
        }

        @JavascriptInterface
        public void setActiveCallState(String stateJson) {
            if (stateJson == null || stateJson.trim().isEmpty()) return;
            try {
                JSONObject obj = new JSONObject(stateJson);
                boolean active = obj.optBoolean("active", false);
                String cId = obj.optString("callId", "").trim();
                String cType = obj.optString("callType", "audio").trim().toLowerCase();
                isCallActiveInWebView = active;
                activeCallIdInWebView = active ? cId : "";
                activeCallTypeInWebView = cType;
                runOnUiThread(() -> {
                    try {
                        if (active) {
                            getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                        } else {
                            getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                            applyCallAudioRoute("reset");
                        }
                    } catch (Exception ignored) {
                    }
                });
                updatePipAutoEnterState();
            } catch (Exception ignored) {
            }
        }

        @JavascriptInterface
        public boolean isPipSupported() {
            return isDevicePipSupported();
        }

        @JavascriptInterface
        public boolean enterPictureInPicture() {
            runOnUiThread(MainActivity.this::enterVideoCallPipMode);
            return isDevicePipSupported();
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
                    String existingUserId = prefs.getString("auth_user_id", "");
                    String existingAccess = prefs.getString("auth_access_token", "");
                    long incomingExp = extractExpFromJwt(accessToken);
                    long existingExp = extractExpFromJwt(existingAccess);

                    SharedPreferences.Editor editor = prefs.edit();
                    if (!userId.equals(existingUserId) || incomingExp >= existingExp) {
                        editor.putString("auth_user_id", userId);
                        editor.putString("auth_access_token", accessToken);
                        if (!refreshToken.isEmpty()) {
                            editor.putString("auth_refresh_token", refreshToken);
                        }
                    } else if (!existingAccess.isEmpty()) {
                        pushRefreshedAuthSessionToWebView(
                                existingAccess,
                                prefs.getString("auth_refresh_token", "")
                        );
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
            runOnUiThread(() -> {
                if ("full_screen_intent".equalsIgnoreCase(permissionType)) {
                    OSAIncomingCallActivity.openFullScreenIntentPermissionSettings(MainActivity.this);
                } else {
                    MainActivity.this.launchAndroidAppPermissionSettings();
                }
            });
        }

        @JavascriptInterface
        public boolean canUseFullScreenCallIntent() {
            return OSAIncomingCallActivity.canUseFullScreenIntentOnDevice(MainActivity.this);
        }

        @JavascriptInterface
        public void openFullScreenIntentSettings() {
            runOnUiThread(() -> OSAIncomingCallActivity.openFullScreenIntentPermissionSettings(MainActivity.this));
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
        public void stopIncomingRingingNotification(String callId) {
            OSACallNotificationService.stopIncomingRingingOnly(MainActivity.this, callId);
        }

        @JavascriptInterface
        public void setCallMuteState(String callId, boolean muted) {
            OSACallNotificationService.updateOngoingCallMuteState(MainActivity.this, callId, muted);
            try {
                AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
                if (am != null) {
                    am.setMicrophoneMute(muted);
                }
            } catch (Exception ignored) {
            }
        }

        @JavascriptInterface
        public void reportCallConnected(String payloadOrCallId) {
            if (payloadOrCallId == null || payloadOrCallId.trim().isEmpty()) return;
            String trimmed = payloadOrCallId.trim();
            if (trimmed.startsWith("{")) {
                try {
                    JSONObject obj = new JSONObject(trimmed);
                    String callId = obj.optString("callId", "").trim();
                    String callType = obj.optString("callType", "audio").trim();
                    String peerId = obj.optString("peerId", "").trim();
                    String peerName = obj.optString("peerName", "OSA Active Call").trim();
                    String chatId = obj.optString("chatId", "").trim();
                    if (!callId.isEmpty()) {
                        OSACallNotificationService.startOngoingCallNotification(
                                MainActivity.this,
                                callId,
                                callType,
                                peerId,
                                peerName,
                                chatId
                        );
                        return;
                    }
                } catch (Exception ignored) {
                }
            }
            OSACallNotificationService.startOngoingCallNotification(
                    MainActivity.this,
                    trimmed,
                    "audio",
                    "",
                    "OSA Active Call",
                    ""
            );
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

        @JavascriptInterface
        public int getVersionCode() {
            return OSAUpdateManager.getCurrentVersionCode(MainActivity.this);
        }

        @JavascriptInterface
        public void checkForUpdates() {
            OSAUpdateManager.checkForUpdatesAsync(MainActivity.this, (success, updateAvailable, infoJson, errorMessage) -> {
                if (webView != null) {
                    runOnUiThread(() -> {
                        try {
                            JSONObject eventObj = new JSONObject();
                            eventObj.put("success", success);
                            eventObj.put("updateAvailable", updateAvailable);
                            if (infoJson != null) {
                                eventObj.put("info", new JSONObject(infoJson));
                            }
                            if (errorMessage != null) {
                                eventObj.put("error", errorMessage);
                            }
                            String js = "(function(){"
                                    + "if (window.__osaOnUpdateCheckResult) { window.__osaOnUpdateCheckResult(" + eventObj.toString() + "); }"
                                    + "window.dispatchEvent(new CustomEvent('osa:update-check-result', { detail: " + eventObj.toString() + " }));"
                                    + "})();";
                            webView.evaluateJavascript(js, null);
                        } catch (Exception ignored) {
                        }
                    });
                }
            });
        }

        @JavascriptInterface
        public void startApkDownload(String apkUrl, String sha256) {
            OSAUpdateManager.downloadAndVerifyApkAsync(
                    MainActivity.this,
                    apkUrl,
                    sha256,
                    new OSAUpdateManager.DownloadProgressCallback() {
                        @Override
                        public void onProgress(int percent, long downloadedBytes, long totalBytes) {
                            if (webView != null) {
                                runOnUiThread(() -> {
                                    try {
                                        JSONObject progObj = new JSONObject();
                                        progObj.put("percent", percent);
                                        progObj.put("downloadedBytes", downloadedBytes);
                                        progObj.put("totalBytes", totalBytes);
                                        String js = "(function(){"
                                                + "if (window.__osaOnUpdateDownloadProgress) { window.__osaOnUpdateDownloadProgress(" + progObj.toString() + "); }"
                                                + "window.dispatchEvent(new CustomEvent('osa:update-download-progress', { detail: " + progObj.toString() + " }));"
                                                + "})();";
                                        webView.evaluateJavascript(js, null);
                                    } catch (Exception ignored) {
                                    }
                                });
                            }
                        }

                        @Override
                        public void onComplete(boolean success, String apkFilePath, String errorMessage) {
                            if (webView != null) {
                                runOnUiThread(() -> {
                                    try {
                                        JSONObject compObj = new JSONObject();
                                        compObj.put("success", success);
                                        compObj.put("apkFilePath", apkFilePath != null ? apkFilePath : "");
                                        if (errorMessage != null) {
                                            compObj.put("error", errorMessage);
                                        }
                                        String js = "(function(){"
                                                + "if (window.__osaOnUpdateDownloadComplete) { window.__osaOnUpdateDownloadComplete(" + compObj.toString() + "); }"
                                                + "window.dispatchEvent(new CustomEvent('osa:update-download-complete', { detail: " + compObj.toString() + " }));"
                                                + "})();";
                                        webView.evaluateJavascript(js, null);
                                    } catch (Exception ignored) {
                                    }
                                });
                            }
                        }
                    }
            );
        }

        @JavascriptInterface
        public boolean promptInstallApk(String apkFilePath) {
            return OSAUpdateManager.promptInstallApk(MainActivity.this, apkFilePath);
        }
    }
}
