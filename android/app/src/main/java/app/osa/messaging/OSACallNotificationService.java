package app.osa.messaging;

import android.Manifest;
import android.app.KeyguardManager;
import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioDeviceCallback;
import android.media.AudioDeviceInfo;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import java.io.ByteArrayInputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.json.JSONObject;

/**
 * OSA Persistent Foreground Incoming & Ongoing Call Service for Android.
 * - Uses FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK | FOREGROUND_SERVICE_TYPE_MICROPHONE for active calls.
 * - Incoming Audio Calls:
 *   - Shows an incoming-call notification/banner with Accept and Reject when using another app,
 *     and wakes the lock screen when locked.
 *   - Tapping Accept answers the audio call directly in the background without opening or foregrounding
 *     MainActivity, the OSA homepage, chat list, or chat screen.
 *   - Provides a self-contained background WebRTC Audio Call Engine (OsaBackgroundCallWebView) hosted
 *     inside this Foreground Service so microphone capture, remote audio playback, ICE/SDP negotiation,
 *     Mute/Unmute, Speaker ON/OFF, and End Call work reliably from both cold start and background.
 * - Ongoing Call Notification provides working controls directly from the notification:
 *   - Mute / Unmute
 *   - Speaker ON / OFF
 *   - End Call
 */
public class OSACallNotificationService extends Service {
    public static final String ACTION_START_ONGOING_CALL = "app.osa.messaging.action.START_ONGOING_CALL";
    private static final String KEY_TERMINATED_CALL_IDS = "terminated_call_ids_v1";
    private static final String BG_CALL_HOST = "appassets.androidplatform.net";
    private static final String BG_CALL_PATH = "/osa-bg-audio-call.html";
    private static final String BG_CALL_URL = "https://" + BG_CALL_HOST + BG_CALL_PATH;

    private static String currentRingingCallId = null;
    private static String currentOngoingCallId = null;
    private static String activeBackgroundWebRtcCallId = null;
    private static String activeCallerId = null;
    private static String activeCallType = "audio";
    private static boolean currentOngoingMuted = false;
    private static boolean currentOngoingSpeakerOn = false;
    private static long currentOngoingStartTimeMs = 0L;
    private static Intent lastOngoingIntent = null;
    private static Ringtone globalActiveRingtone = null;
    private static Vibrator globalActiveVibrator = null;
    private static String globalRingingCallId = null;
    private static final Set<String> terminatedCallIds = new LinkedHashSet<>();

    private static AudioFocusRequest activeAudioFocusRequest = null;
    private static AudioDeviceCallback activeAudioDeviceCallback = null;
    private static WebView backgroundCallWebView = null;
    private static final Handler mainThreadHandler = new Handler(Looper.getMainLooper());

    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;
    private final Handler timeoutHandler = new Handler(Looper.getMainLooper());
    private String activeCallId;
    private boolean isOngoingCallMode = false;

    public static synchronized boolean isCallCurrentlyRinging(String callId) {
        return callId != null && !callId.isEmpty() && callId.trim().equals(currentRingingCallId);
    }

    public static synchronized boolean isCallCurrentlyOngoing(String callId) {
        return callId != null && !callId.isEmpty() && callId.trim().equals(currentOngoingCallId);
    }

    public static synchronized boolean isAnyCallOngoing() {
        return currentOngoingCallId != null && !currentOngoingCallId.isEmpty();
    }

    public static synchronized boolean isBackgroundWebRtcHandlingCall(String callId) {
        return callId != null
                && !callId.trim().isEmpty()
                && callId.trim().equals(activeBackgroundWebRtcCallId);
    }

    public static synchronized boolean isBackgroundAudioSessionActiveForCall(String callId) {
        return isBackgroundWebRtcHandlingCall(callId);
    }

    public static synchronized String getCurrentOngoingCallId() {
        return currentOngoingCallId;
    }

    public static synchronized String getActiveCallId() {
        if (currentOngoingCallId != null && !currentOngoingCallId.isEmpty()) {
            return currentOngoingCallId;
        }
        return currentRingingCallId;
    }

    public static synchronized String getActiveCallerId() {
        return activeCallerId;
    }

    public static synchronized String getActiveCallType() {
        return activeCallType != null ? activeCallType : "audio";
    }

    public static synchronized boolean isCallAlreadyHandledOrActive(Context context, String callId) {
        if (callId == null || callId.trim().isEmpty()) return false;
        String cleanId = callId.trim();
        if (cleanId.equals(currentRingingCallId)
                || cleanId.equals(currentOngoingCallId)
                || terminatedCallIds.contains(cleanId)) {
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

    public static synchronized boolean isCallTerminated(Context context, String callId) {
        if (callId == null || callId.trim().isEmpty()) return false;
        String cleanId = callId.trim();
        if (terminatedCallIds.contains(cleanId)) return true;
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

    public static synchronized void stopGlobalRingtoneAndVibration() {
        try {
            if (globalActiveRingtone != null) {
                if (globalActiveRingtone.isPlaying()) {
                    globalActiveRingtone.stop();
                }
                globalActiveRingtone = null;
            }
        } catch (Exception ignored) {
        }
        globalRingingCallId = null;
        try {
            if (globalActiveVibrator != null) {
                globalActiveVibrator.cancel();
                globalActiveVibrator = null;
            }
        } catch (Exception ignored) {
        }
    }

    public static synchronized void markCallTerminated(Context context, String callId) {
        if (callId == null || callId.trim().isEmpty()) return;
        String cleanId = callId.trim();
        if (cleanId.equals(currentRingingCallId)) {
            currentRingingCallId = null;
        }
        if (cleanId.equals(currentOngoingCallId)) {
            currentOngoingCallId = null;
        }
        if (cleanId.equals(globalRingingCallId)) {
            stopGlobalRingtoneAndVibration();
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

    private static boolean isDeviceLockedOrScreenOff(Context context) {
        if (context == null) return false;
        try {
            KeyguardManager km = (KeyguardManager) context.getSystemService(Context.KEYGUARD_SERVICE);
            if (km != null && km.isKeyguardLocked()) {
                return true;
            }
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            if (pm != null && !pm.isInteractive()) {
                return true;
            }
        } catch (Exception ignored) {
        }
        return false;
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

        String callerId = data.get("callerId") != null ? data.get("callerId") : data.get("senderId");
        Intent serviceIntent = new Intent(context, OSACallNotificationService.class);
        serviceIntent.putExtra("callId", callId);
        serviceIntent.putExtra("callType", resolvedCallType);
        serviceIntent.putExtra("callerId", callerId);
        serviceIntent.putExtra("callerName", data.get("callerName") != null && !data.get("callerName").isEmpty()
                ? data.get("callerName")
                : (data.get("senderName") != null && !data.get("senderName").isEmpty() ? data.get("senderName") : "OSA Caller"));
        serviceIntent.putExtra("callerAvatar", data.get("callerAvatar") != null ? data.get("callerAvatar") : "");
        serviceIntent.putExtra("chatId", data.get("chatId") != null ? data.get("chatId") : data.get("conversationId"));
        serviceIntent.putExtra("rejectToken", data.get("rejectToken"));
        serviceIntent.putExtra("rejectEndpoint", data.get("rejectEndpoint"));
        serviceIntent.putExtra("anonKey", data.get("anonKey"));
        startCallNotification(context, serviceIntent);
        reportCallRingingAsync(callId, data.get("rejectEndpoint"), data.get("rejectToken"), data.get("anonKey"));
    }

    private static void reportCallRingingAsync(
            final String callId,
            final String rejectEndpoint,
            final String rejectToken,
            final String anonKey
    ) {
        if (callId == null || callId.isEmpty() || rejectEndpoint == null || rejectEndpoint.isEmpty()
                || rejectToken == null || rejectToken.isEmpty()) {
            return;
        }
        new Thread(() -> {
            try {
                URL url = new URL(rejectEndpoint);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(6000);
                conn.setReadTimeout(6000);
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                if (anonKey != null && !anonKey.isEmpty()) {
                    conn.setRequestProperty("apikey", anonKey);
                    conn.setRequestProperty("Authorization", "Bearer " + anonKey);
                }
                conn.setDoOutput(true);
                JSONObject body = new JSONObject();
                body.put("action", "ringing_call");
                body.put("callId", callId);
                body.put("rejectToken", rejectToken);
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(body.toString().getBytes(StandardCharsets.UTF_8));
                }
                conn.getResponseCode();
                conn.disconnect();
            } catch (Exception ignored) {
            }
        }).start();
    }

    public static synchronized void startCallNotification(Context context, Intent intent) {
        if (context == null || intent == null) return;
        String callId = intent.getStringExtra("callId");
        if (callId == null || callId.trim().isEmpty()) return;
        if (isCallAlreadyHandledOrActive(context, callId.trim())) {
            return;
        }
        currentRingingCallId = callId.trim();
        String incomingCallerId = intent.getStringExtra("callerId");
        if (incomingCallerId != null && !incomingCallerId.trim().isEmpty()) {
            activeCallerId = incomingCallerId.trim();
        }
        String incomingCallType = intent.getStringExtra("callType");
        activeCallType = (incomingCallType != null && !incomingCallType.trim().isEmpty())
                ? incomingCallType.trim()
                : "audio";
        MainActivity.ensureNotificationChannels(context);

        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.cancel("osa-call-" + callId.trim(), 0);
        }

        String callType = intent.getStringExtra("callType");
        boolean isVideo = "video".equalsIgnoreCase(callType);
        // For video calls, or when the device is locked / screen is off, launch the full-screen incoming call UI.
        // For audio calls while the user is actively using another app (unlocked & interactive), show the
        // heads-up notification banner with Accept & Reject without hijacking the foreground app.
        if (isVideo || isDeviceLockedOrScreenOff(context)) {
            OSAIncomingCallActivity.startFromService(context, intent);
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ContextCompat.startForegroundService(context.getApplicationContext(), intent);
            } else {
                context.getApplicationContext().startService(intent);
            }
        } catch (Exception ignored) {
            postDirectCallNotificationFallback(context, intent);
        }
    }

    /**
     * Answers an incoming audio call directly in the background without opening or foregrounding
     * MainActivity, the OSA homepage, chat list, or chat screen.
     */
    public static synchronized void acceptIncomingAudioCallInBackground(Context context, Intent intent) {
        if (context == null || intent == null) return;
        final Context appCtx = context.getApplicationContext();
        final String rawCallId = intent.getStringExtra("callId");
        if (rawCallId == null || rawCallId.trim().isEmpty()) return;
        final String cleanCallId = rawCallId.trim();

        if (isCallTerminated(appCtx, cleanCallId)) {
            stopCallNotification(appCtx, cleanCallId);
            return;
        }

        // Prevent duplicate accept actions for the same callId
        if (cleanCallId.equals(activeBackgroundWebRtcCallId) && cleanCallId.equals(currentOngoingCallId)) {
            return;
        }

        final String rawCallerId = intent.getStringExtra("callerId") != null ? intent.getStringExtra("callerId").trim() : "";
        final String callerId = !rawCallerId.isEmpty() ? rawCallerId : (activeCallerId != null ? activeCallerId : "");
        final String callerName = intent.getStringExtra("callerName") != null && !intent.getStringExtra("callerName").trim().isEmpty()
                ? intent.getStringExtra("callerName").trim()
                : "OSA Audio Call";
        final String chatId = intent.getStringExtra("chatId") != null ? intent.getStringExtra("chatId").trim() : "";

        activeBackgroundWebRtcCallId = cleanCallId;
        if (!callerId.isEmpty()) {
            activeCallerId = callerId;
        }
        activeCallType = "audio";
        currentOngoingMuted = false;
        currentOngoingSpeakerOn = false;

        // 1. Immediately transition notification to Ongoing Audio Call (stops ringtone, keeps foreground service alive)
        startOngoingCallNotification(appCtx, cleanCallId, "audio", callerId, callerName, chatId);

        // 2. Configure default audio route to Earpiece (respecting connected Bluetooth/wired headsets)
        applyCallAudioRoute(appCtx, "earpiece");
        setMicrophoneHardwareMute(appCtx, false);

        // 3. Notify MainActivity (if in memory in background) so it detaches any ringing listener and syncs state without foregrounding
        MainActivity.notifyAudioCallAcceptedInBackgroundService(cleanCallId, callerId, callerName, chatId);

        // 4. Start the self-contained background WebRTC audio session on the main looper
        mainThreadHandler.post(() -> startBackgroundWebRtcAudioSession(appCtx, cleanCallId, callerId, callerName, chatId));
    }

    /**
     * Transitions an accepted/connected call into an Ongoing Call Notification with a live chronometer
     * and working Mute/Unmute, Speaker ON/OFF, and End Call action buttons, immediately stopping any incoming ringtone.
     */
    public static synchronized void startOngoingCallNotification(
            Context context,
            String callId,
            String callType,
            String peerId,
            String peerName,
            String chatId
    ) {
        if (context == null || callId == null || callId.trim().isEmpty()) return;
        String cleanId = callId.trim();
        stopGlobalRingtoneAndVibration();
        if (cleanId.equals(currentRingingCallId)) {
            currentRingingCallId = null;
        }
        boolean isVideo = "video".equalsIgnoreCase(callType);
        if (!cleanId.equals(currentOngoingCallId)) {
            currentOngoingMuted = false;
            currentOngoingSpeakerOn = isVideo;
            currentOngoingStartTimeMs = System.currentTimeMillis();
        }
        currentOngoingCallId = cleanId;
        if (peerId != null && !peerId.trim().isEmpty()) {
            activeCallerId = peerId.trim();
        }
        activeCallType = isVideo ? "video" : "audio";
        OSAIncomingCallActivity.finishIfMatchingCall(cleanId);
        MainActivity.ensureNotificationChannels(context);

        Intent ongoingIntent = new Intent(context.getApplicationContext(), OSACallNotificationService.class);
        ongoingIntent.setAction(ACTION_START_ONGOING_CALL);
        ongoingIntent.putExtra("callId", cleanId);
        ongoingIntent.putExtra("callType", callType != null ? callType : "audio");
        ongoingIntent.putExtra("callerId", peerId != null ? peerId : "");
        ongoingIntent.putExtra("callerName", peerName != null && !peerName.trim().isEmpty() ? peerName.trim() : "OSA Active Call");
        ongoingIntent.putExtra("chatId", chatId != null ? chatId : "");
        ongoingIntent.putExtra("isMuted", currentOngoingMuted);
        ongoingIntent.putExtra("isSpeakerOn", currentOngoingSpeakerOn);
        ongoingIntent.putExtra("startTimeMs", currentOngoingStartTimeMs);
        lastOngoingIntent = ongoingIntent;

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ContextCompat.startForegroundService(context.getApplicationContext(), ongoingIntent);
            } else {
                context.getApplicationContext().startService(ongoingIntent);
            }
        } catch (Exception ignored) {
            int notificationId = computeCallNotificationId(cleanId);
            Notification ongoingNotif = buildOngoingCallNotification(context, ongoingIntent, notificationId);
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.notify(notificationId, ongoingNotif);
            }
        }
    }

    public static synchronized void updateOngoingCallMuteState(Context context, String callId, boolean isMuted) {
        setOngoingCallMuteState(context, callId, isMuted, true);
    }

    public static synchronized boolean toggleOngoingCallMuteState(Context context, String callId) {
        boolean nextMuted = !currentOngoingMuted;
        setOngoingCallMuteState(context, callId, nextMuted, true);
        return nextMuted;
    }

    public static synchronized void updateOngoingCallSpeakerState(Context context, String callId, boolean isSpeakerOn) {
        setOngoingCallSpeakerState(context, callId, isSpeakerOn, true);
    }

    public static synchronized boolean toggleOngoingCallSpeakerState(Context context, String callId) {
        boolean nextSpeakerOn = !currentOngoingSpeakerOn;
        setOngoingCallSpeakerState(context, callId, nextSpeakerOn, true);
        return nextSpeakerOn;
    }

    public static synchronized void setOngoingCallMuteState(
            Context context,
            String callId,
            boolean isMuted,
            boolean applyToBackgroundWebRtc
    ) {
        if (context == null) return;
        currentOngoingMuted = isMuted;
        setMicrophoneHardwareMute(context, isMuted);
        if (applyToBackgroundWebRtc) {
            setBackgroundWebRtcMuted(isMuted);
        }
        String cleanId = callId != null && !callId.trim().isEmpty() ? callId.trim() : currentOngoingCallId;
        if (cleanId == null || cleanId.isEmpty() || !cleanId.equals(currentOngoingCallId)) return;
        refreshOngoingNotificationInPlace(context, cleanId);
    }

    public static synchronized void setOngoingCallSpeakerState(
            Context context,
            String callId,
            boolean isSpeakerOn,
            boolean applyRouteNow
    ) {
        if (context == null) return;
        currentOngoingSpeakerOn = isSpeakerOn;
        if (applyRouteNow) {
            applyCallAudioRoute(context, isSpeakerOn ? "speaker" : "earpiece");
        }
        String cleanId = callId != null && !callId.trim().isEmpty() ? callId.trim() : currentOngoingCallId;
        if (cleanId == null || cleanId.isEmpty() || !cleanId.equals(currentOngoingCallId)) return;
        refreshOngoingNotificationInPlace(context, cleanId);
    }

    private static synchronized void refreshOngoingNotificationInPlace(Context context, String cleanId) {
        if (context == null || lastOngoingIntent == null) return;
        lastOngoingIntent.putExtra("isMuted", currentOngoingMuted);
        lastOngoingIntent.putExtra("isSpeakerOn", currentOngoingSpeakerOn);
        lastOngoingIntent.putExtra("startTimeMs", currentOngoingStartTimeMs);
        int notificationId = computeCallNotificationId(cleanId);
        Notification ongoingNotif = buildOngoingCallNotification(context, lastOngoingIntent, notificationId);
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.notify(notificationId, ongoingNotif);
        }
    }

    public static synchronized boolean isCurrentOngoingCallMuted() {
        return currentOngoingMuted;
    }

    public static synchronized boolean isCurrentOngoingCallSpeakerOn() {
        return currentOngoingSpeakerOn;
    }

    private static void setMicrophoneHardwareMute(Context context, boolean muted) {
        if (context == null) return;
        try {
            AudioManager am = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                am.setMicrophoneMute(muted);
            }
        } catch (Exception ignored) {
        }
    }

    /**
     * Authoritative Android Audio Focus & Communication Device router shared across
     * OSACallNotificationService (background/cold-start calls) and MainActivity (foreground calls).
     */
    public static synchronized void applyCallAudioRoute(Context context, String routeMode) {
        if (context == null) return;
        final Context appCtx = context.getApplicationContext();
        try {
            final AudioManager audioManager = (AudioManager) appCtx.getSystemService(Context.AUDIO_SERVICE);
            if (audioManager == null) return;

            if ("reset".equalsIgnoreCase(routeMode)) {
                currentOngoingSpeakerOn = false;
                currentOngoingMuted = false;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && activeAudioDeviceCallback != null) {
                    try {
                        audioManager.unregisterAudioDeviceCallback(activeAudioDeviceCallback);
                    } catch (Exception ignored) {
                    }
                    activeAudioDeviceCallback = null;
                }
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
                try {
                    if (audioManager.isBluetoothScoOn()) {
                        audioManager.stopBluetoothSco();
                        audioManager.setBluetoothScoOn(false);
                    }
                } catch (Exception ignored) {
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
                android.util.Log.i("OSA_DIAG", "[OSA_AUDIO_ROUTE] reset completed");
                return;
            }

            final boolean wantSpeaker = "speaker".equalsIgnoreCase(routeMode);
            currentOngoingSpeakerOn = wantSpeaker;

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
                        // Prefer connected Bluetooth or wired/USB headset when Speaker is OFF; otherwise built-in earpiece
                        for (AudioDeviceInfo dev : devices) {
                            int t = dev.getType();
                            if (t == AudioDeviceInfo.TYPE_BLUETOOTH_SCO
                                    || t == AudioDeviceInfo.TYPE_BLE_HEADSET
                                    || t == AudioDeviceInfo.TYPE_WIRED_HEADSET
                                    || t == AudioDeviceInfo.TYPE_WIRED_HEADPHONES
                                    || t == AudioDeviceInfo.TYPE_USB_HEADSET) {
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
            } else {
                // Pre-Android 12 Bluetooth SCO / wired headset / earpiece handling
                try {
                    if (wantSpeaker) {
                        if (audioManager.isBluetoothScoOn()) {
                            audioManager.stopBluetoothSco();
                            audioManager.setBluetoothScoOn(false);
                        }
                        audioManager.setSpeakerphoneOn(true);
                    } else {
                        audioManager.setSpeakerphoneOn(false);
                        if (audioManager.isBluetoothScoAvailableOffCall() && isBluetoothHeadsetConnected(audioManager)) {
                            audioManager.startBluetoothSco();
                            audioManager.setBluetoothScoOn(true);
                        }
                    }
                } catch (Exception ignored) {
                }
            }

            // Register AudioDeviceCallback once so connecting/disconnecting a Bluetooth or wired headset mid-call
            // automatically routes audio appropriately when Speaker is OFF
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && activeAudioDeviceCallback == null) {
                activeAudioDeviceCallback = new AudioDeviceCallback() {
                    @Override
                    public void onAudioDevicesAdded(AudioDeviceInfo[] addedDevices) {
                        if (isAnyCallOngoing() && !currentOngoingSpeakerOn) {
                            applyCallAudioRoute(appCtx, "earpiece");
                        }
                    }

                    @Override
                    public void onAudioDevicesRemoved(AudioDeviceInfo[] removedDevices) {
                        if (isAnyCallOngoing() && !currentOngoingSpeakerOn) {
                            applyCallAudioRoute(appCtx, "earpiece");
                        }
                    }
                };
                audioManager.registerAudioDeviceCallback(activeAudioDeviceCallback, mainThreadHandler);
            }

            if (currentOngoingCallId != null && !currentOngoingCallId.isEmpty()) {
                refreshOngoingNotificationInPlace(appCtx, currentOngoingCallId);
            }
        } catch (Exception ignored) {
        }
    }

    private static boolean isBluetoothHeadsetConnected(AudioManager audioManager) {
        if (audioManager == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return false;
        try {
            AudioDeviceInfo[] outputs = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS);
            for (AudioDeviceInfo dev : outputs) {
                int t = dev.getType();
                if (t == AudioDeviceInfo.TYPE_BLUETOOTH_SCO || t == AudioDeviceInfo.TYPE_BLE_HEADSET) {
                    return true;
                }
            }
        } catch (Exception ignored) {
        }
        return false;
    }

    /**
     * Stops only the incoming ringtone/vibrator and incoming ringing UI if this call was answered.
     * If this device is already hosting the call as an active ongoing call, preserves the ongoing
     * call notification and foreground service instead of marking the call terminated.
     */
    public static synchronized void stopIncomingRingingOnly(Context context, String callId) {
        stopGlobalRingtoneAndVibration();
        String cleanId = callId != null ? callId.trim() : "";
        OSAIncomingCallActivity.finishIfMatchingCall(cleanId);
        if (!cleanId.isEmpty() && cleanId.equals(currentOngoingCallId)) {
            if (cleanId.equals(currentRingingCallId)) {
                currentRingingCallId = null;
            }
            return;
        }
        // Not an ongoing call on this device — cancel any ringing notification without marking terminated
        if (cleanId.equals(currentRingingCallId)) {
            currentRingingCallId = null;
        }
        if (context == null) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null && !cleanId.isEmpty()) {
            int notificationId = computeCallNotificationId(cleanId);
            manager.cancel("osa-call-" + cleanId, 0);
            manager.cancel(notificationId);
        }
        if (currentOngoingCallId == null && currentRingingCallId == null) {
            try {
                Intent stopIntent = new Intent(context.getApplicationContext(), OSACallNotificationService.class);
                context.getApplicationContext().stopService(stopIntent);
            } catch (Exception ignored) {
            }
        }
    }

    public static synchronized void endCallAndCleanup(Context context, String callId) {
        stopCallNotification(context, callId);
    }

    public static synchronized void stopCallNotification(Context context, String callId) {
        stopGlobalRingtoneAndVibration();
        String cleanId = callId != null ? callId.trim() : "";
        if (!cleanId.isEmpty()) {
            markCallTerminated(context, cleanId);
        } else {
            currentRingingCallId = null;
            currentOngoingCallId = null;
        }
        if (cleanId.isEmpty() || cleanId.equals(activeBackgroundWebRtcCallId)) {
            activeBackgroundWebRtcCallId = null;
            mainThreadHandler.post(OSACallNotificationService::stopBackgroundWebRtcAudioSession);
        }
        currentOngoingMuted = false;
        currentOngoingSpeakerOn = false;
        currentOngoingStartTimeMs = 0L;
        activeCallerId = null;
        lastOngoingIntent = null;
        OSAIncomingCallActivity.finishIfMatchingCall(callId);
        if (context != null) {
            applyCallAudioRoute(context, "reset");
            NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null && !cleanId.isEmpty()) {
                int notificationId = computeCallNotificationId(cleanId);
                manager.cancel("osa-call-" + cleanId, 0);
                manager.cancel("osa-call-" + cleanId, notificationId);
                manager.cancel(notificationId);
            }
            try {
                Intent stopIntent = new Intent(context.getApplicationContext(), OSACallNotificationService.class);
                context.getApplicationContext().stopService(stopIntent);
            } catch (Exception ignored) {
            }
        }
    }

    private static Notification buildOngoingCallNotification(Context context, Intent intent, int notificationId) {
        MainActivity.ensureNotificationChannels(context);
        String callId = intent.getStringExtra("callId") != null ? intent.getStringExtra("callId").trim() : "";
        String callType = intent.getStringExtra("callType") != null ? intent.getStringExtra("callType").trim() : "audio";
        String peerId = intent.getStringExtra("callerId");
        String peerName = intent.getStringExtra("callerName") != null && !intent.getStringExtra("callerName").trim().isEmpty()
                ? intent.getStringExtra("callerName").trim()
                : "OSA Active Call";
        String chatId = intent.getStringExtra("chatId");
        boolean isMuted = intent.getBooleanExtra("isMuted", currentOngoingMuted);
        boolean isSpeakerOn = intent.getBooleanExtra("isSpeakerOn", currentOngoingSpeakerOn);
        long startTimeMs = intent.getLongExtra(
                "startTimeMs",
                currentOngoingStartTimeMs > 0L ? currentOngoingStartTimeMs : System.currentTimeMillis()
        );

        boolean isVideo = "video".equalsIgnoreCase(callType);

        // For VIDEO calls, tapping the notification body opens MainActivity.
        // For AUDIO calls, tapping the notification body is a no-op Broadcast so MainActivity/WebView never opens!
        PendingIntent contentPending;
        if (isVideo) {
            Intent openCallIntent = new Intent(context, MainActivity.class);
            openCallIntent.setAction("app.osa.messaging.ACTION_OPEN_ONGOING_CALL_" + callId);
            openCallIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            openCallIntent.putExtra("callId", callId);
            openCallIntent.putExtra("callType", callType);
            openCallIntent.putExtra("callerId", peerId);
            openCallIntent.putExtra("callerName", peerName);
            openCallIntent.putExtra("chatId", chatId);
            openCallIntent.putExtra("callAction", "open");
            contentPending = PendingIntent.getActivity(
                    context,
                    notificationId + 10,
                    openCallIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
        } else {
            Intent noopIntent = new Intent(context, OSACallActionReceiver.class);
            noopIntent.setAction(OSACallActionReceiver.ACTION_NOOP_CALL_NOTIFICATION);
            noopIntent.putExtra("callId", callId);
            contentPending = PendingIntent.getBroadcast(
                    context,
                    notificationId + 10,
                    noopIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
        }

        // 1. END CALL button -> Broadcast to OSACallActionReceiver.ACTION_END_CALL
        Intent endCallIntent = new Intent(context, OSACallActionReceiver.class);
        endCallIntent.setAction(OSACallActionReceiver.ACTION_END_CALL);
        endCallIntent.putExtra("callId", callId);
        endCallIntent.putExtra("callType", callType);
        endCallIntent.putExtra("callerId", peerId);
        endCallIntent.putExtra("chatId", chatId);
        PendingIntent endCallPending = PendingIntent.getBroadcast(
                context,
                notificationId + 11,
                endCallIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // 2. MUTE / UNMUTE button -> Broadcast to OSACallActionReceiver.ACTION_TOGGLE_MUTE_CALL
        Intent muteCallIntent = new Intent(context, OSACallActionReceiver.class);
        muteCallIntent.setAction(OSACallActionReceiver.ACTION_TOGGLE_MUTE_CALL);
        muteCallIntent.putExtra("callId", callId);
        muteCallIntent.putExtra("callType", callType);
        muteCallIntent.putExtra("callerId", peerId);
        muteCallIntent.putExtra("callerName", peerName);
        muteCallIntent.putExtra("chatId", chatId);
        PendingIntent muteCallPending = PendingIntent.getBroadcast(
                context,
                notificationId + 12,
                muteCallIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        String muteActionTitle = isMuted ? "Unmute" : "Mute";
        int muteIconRes = isMuted
                ? android.R.drawable.ic_lock_silent_mode
                : android.R.drawable.ic_btn_speak_now;

        // 3. SPEAKER ON / OFF button -> Broadcast to OSACallActionReceiver.ACTION_TOGGLE_SPEAKER_CALL
        Intent speakerCallIntent = new Intent(context, OSACallActionReceiver.class);
        speakerCallIntent.setAction(OSACallActionReceiver.ACTION_TOGGLE_SPEAKER_CALL);
        speakerCallIntent.putExtra("callId", callId);
        speakerCallIntent.putExtra("callType", callType);
        speakerCallIntent.putExtra("callerId", peerId);
        speakerCallIntent.putExtra("callerName", peerName);
        speakerCallIntent.putExtra("chatId", chatId);
        PendingIntent speakerCallPending = PendingIntent.getBroadcast(
                context,
                notificationId + 13,
                speakerCallIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        String speakerActionTitle = isSpeakerOn ? "Speaker OFF" : "Speaker ON";
        int speakerIconRes = isSpeakerOn
                ? android.R.drawable.ic_lock_silent_mode_off
                : android.R.drawable.stat_sys_speakerphone;

        String subtitle = (isVideo ? "Ongoing Video Call" : "Ongoing Audio Call")
                + " · " + (isMuted ? "Muted" : "Mic ON")
                + " · " + (isSpeakerOn ? "Speaker ON" : "Earpiece");

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                android.app.Person peerPerson = new android.app.Person.Builder()
                        .setName(peerName)
                        .setImportant(true)
                        .build();

                android.app.Notification.CallStyle ongoingStyle =
                        android.app.Notification.CallStyle.forOngoingCall(
                                peerPerson,
                                endCallPending
                        );
                ongoingStyle.setIsVideo(isVideo);

                android.app.Notification.Action muteAction = new android.app.Notification.Action.Builder(
                        android.graphics.drawable.Icon.createWithResource(context, muteIconRes),
                        muteActionTitle,
                        muteCallPending
                ).build();

                android.app.Notification.Action speakerAction = new android.app.Notification.Action.Builder(
                        android.graphics.drawable.Icon.createWithResource(context, speakerIconRes),
                        speakerActionTitle,
                        speakerCallPending
                ).build();

                Notification.Builder nativeBuilder = new Notification.Builder(context, MainActivity.CHANNEL_CALLS)
                        .setSmallIcon(isVideo ? android.R.drawable.presence_video_online : android.R.drawable.sym_action_call)
                        .setContentTitle(peerName)
                        .setContentText(subtitle)
                        .setSubText("OSA")
                        .setCategory(Notification.CATEGORY_CALL)
                        .setVisibility(Notification.VISIBILITY_PUBLIC)
                        .setUsesChronometer(true)
                        .setWhen(startTimeMs)
                        .setOngoing(true)
                        .setAutoCancel(false)
                        .setOnlyAlertOnce(true)
                        .setContentIntent(contentPending)
                        .setStyle(ongoingStyle)
                        .addAction(muteAction)
                        .addAction(speakerAction);

                Notification ongoingNotif = nativeBuilder.build();
                ongoingNotif.flags |= Notification.FLAG_NO_CLEAR | Notification.FLAG_ONGOING_EVENT;
                return ongoingNotif;
            } catch (Exception ignored) {
                // Fall through to NotificationCompat
            }
        }

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, MainActivity.CHANNEL_CALLS)
                .setSmallIcon(android.R.drawable.sym_action_call)
                .setContentTitle(peerName)
                .setContentText(subtitle)
                .setSubText("OSA")
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setUsesChronometer(true)
                .setWhen(startTimeMs)
                .setOngoing(true)
                .setAutoCancel(false)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setContentIntent(contentPending)
                .addAction(muteIconRes, muteActionTitle, muteCallPending)
                .addAction(speakerIconRes, speakerActionTitle, speakerCallPending)
                .addAction(android.R.drawable.ic_menu_close_clear_cancel, "End Call", endCallPending);

        Notification notification = builder.build();
        notification.flags |= Notification.FLAG_NO_CLEAR | Notification.FLAG_ONGOING_EVENT;
        return notification;
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
        boolean isVideo = "video".equalsIgnoreCase(callType);

        // 1. Full-screen intent -> wakes lock screen with dedicated native OSAIncomingCallActivity when locked/screen off,
        // and triggers the system heads-up call banner when unlocked.
        Intent fullScreenIntent = OSAIncomingCallActivity.buildLaunchIntent(context, intent);
        PendingIntent fullScreenPending = PendingIntent.getActivity(
                context,
                notificationId + 1,
                fullScreenIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // Content intent when tapping the banner body:
        // For audio calls on an unlocked device, use a no-op Broadcast so tapping the banner never opens MainActivity or a full-screen UI.
        PendingIntent contentPending;
        if (!isVideo && !isDeviceLockedOrScreenOff(context)) {
            Intent noopIntent = new Intent(context, OSACallActionReceiver.class);
            noopIntent.setAction(OSACallActionReceiver.ACTION_NOOP_CALL_NOTIFICATION);
            noopIntent.putExtra("callId", callId);
            contentPending = PendingIntent.getBroadcast(
                    context,
                    notificationId + 4,
                    noopIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
        } else {
            contentPending = fullScreenPending;
        }

        // 2. ACCEPT button:
        // - For AUDIO calls: uses PendingIntent.getBroadcast directly to OSACallActionReceiver.ACTION_ACCEPT_CALL
        //   so tapping Accept answers the call in the background service WITHOUT launching any Activity or foregrounding MainActivity!
        // - For VIDEO calls: opens MainActivity directly to the full-screen video call UI.
        PendingIntent acceptPending;
        if (!isVideo) {
            Intent audioAcceptIntent = new Intent(context, OSACallActionReceiver.class);
            audioAcceptIntent.setAction(OSACallActionReceiver.ACTION_ACCEPT_CALL);
            audioAcceptIntent.putExtra("callId", callId);
            audioAcceptIntent.putExtra("callType", "audio");
            audioAcceptIntent.putExtra("callerId", callerId);
            audioAcceptIntent.putExtra("callerName", callerName);
            audioAcceptIntent.putExtra("callerAvatar", callerAvatar);
            audioAcceptIntent.putExtra("chatId", chatId);
            audioAcceptIntent.putExtra("callAction", "accept");
            acceptPending = PendingIntent.getBroadcast(
                    context,
                    notificationId + 2,
                    audioAcceptIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
        } else {
            Intent acceptActivityIntent = new Intent(context, MainActivity.class);
            acceptActivityIntent.setAction("app.osa.messaging.ACTION_ACCEPT_CALL_UI_" + callId);
            acceptActivityIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            acceptActivityIntent.putExtra("callId", callId);
            acceptActivityIntent.putExtra("callType", callType);
            acceptActivityIntent.putExtra("callerId", callerId);
            acceptActivityIntent.putExtra("callerName", callerName);
            acceptActivityIntent.putExtra("callerAvatar", callerAvatar);
            acceptActivityIntent.putExtra("chatId", chatId);
            acceptActivityIntent.putExtra("callAction", "accept");
            acceptPending = PendingIntent.getActivity(
                    context,
                    notificationId + 2,
                    acceptActivityIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
        }

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

        String titleText = isVideo ? "Incoming Video Call · OSA" : "Incoming Audio Call · OSA";
        String bodyText = callerName + (isVideo ? " is video calling you" : " is audio calling you");

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                android.app.Person callerPerson = new android.app.Person.Builder()
                        .setName(callerName)
                        .setImportant(true)
                        .build();

                android.app.Notification.CallStyle callStyle =
                        android.app.Notification.CallStyle.forIncomingCall(
                                callerPerson,
                                rejectPending,
                                acceptPending
                        );
                callStyle.setIsVideo(isVideo);

                Notification.Builder nativeBuilder = new Notification.Builder(context, MainActivity.CHANNEL_CALLS)
                        .setSmallIcon(isVideo ? android.R.drawable.presence_video_online : android.R.drawable.sym_call_incoming)
                        .setContentTitle(callerName)
                        .setContentText(isVideo ? "OSA Video Call" : "OSA Audio Call")
                        .setSubText("OSA")
                        .setCategory(Notification.CATEGORY_CALL)
                        .setVisibility(Notification.VISIBILITY_PUBLIC)
                        .setOngoing(true)
                        .setAutoCancel(false)
                        .setContentIntent(contentPending)
                        .setFullScreenIntent(fullScreenPending, true)
                        .setStyle(callStyle);

                Notification callNotif = nativeBuilder.build();
                callNotif.flags |= Notification.FLAG_NO_CLEAR;
                return callNotif;
            } catch (Exception ignored) {
                // Fall through to NotificationCompat.Builder below
            }
        }

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, MainActivity.CHANNEL_CALLS)
                .setSmallIcon(android.R.drawable.sym_call_incoming)
                .setContentTitle(titleText)
                .setContentText(bodyText)
                .setSubText("OSA")
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setAutoCancel(false)
                .setDefaults(NotificationCompat.DEFAULT_VIBRATE)
                .setContentIntent(contentPending)
                .setFullScreenIntent(fullScreenPending, true)
                .addAction(android.R.drawable.sym_call_incoming, "Accept", acceptPending)
                .addAction(android.R.drawable.sym_call_missed, "Reject", rejectPending);

        Notification notification = builder.build();
        notification.flags |= Notification.FLAG_NO_CLEAR;
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

    /**
     * Starts a self-contained background WebRTC Audio Call engine inside OSACallNotificationService
     * using an offscreen WebView whose window visibility is pinned to View.VISIBLE so Chromium
     * captures microphone audio and plays remote WebRTC audio while the user remains in another app.
     */
    private static void startBackgroundWebRtcAudioSession(
            final Context appCtx,
            final String callId,
            final String callerId,
            final String callerName,
            final String chatId
    ) {
        try {
            stopBackgroundWebRtcAudioSession();
            activeBackgroundWebRtcCallId = callId;

            WebView wv = new WebView(appCtx) {
                @Override
                protected void onWindowVisibilityChanged(int visibility) {
                    // Always report VISIBLE to Chromium so WebRTC getUserMedia, AudioContext, and <audio> playback
                    // are never suspended while OSA has no foreground Activity.
                    super.onWindowVisibilityChanged(View.VISIBLE);
                }
            };

            WebSettings settings = wv.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setMediaPlaybackRequiresUserGesture(false);

            wv.setWebChromeClient(new WebChromeClient() {
                @Override
                public void onPermissionRequest(final PermissionRequest request) {
                    mainThreadHandler.post(() -> {
                        try {
                            if (ContextCompat.checkSelfPermission(appCtx, Manifest.permission.RECORD_AUDIO)
                                    == PackageManager.PERMISSION_GRANTED) {
                                request.grant(request.getResources());
                            } else {
                                request.deny();
                            }
                        } catch (Exception ignored) {
                        }
                    });
                }
            });

            final String pageHtml = buildBackgroundAudioWebRtcHtml();
            wv.setWebViewClient(new WebViewClient() {
                @Nullable
                @Override
                public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                    if (request != null && request.getUrl() != null) {
                        Uri u = request.getUrl();
                        if (BG_CALL_HOST.equalsIgnoreCase(u.getHost()) && BG_CALL_PATH.equals(u.getPath())) {
                            ByteArrayInputStream bais = new ByteArrayInputStream(pageHtml.getBytes(StandardCharsets.UTF_8));
                            WebResourceResponse resp = new WebResourceResponse("text/html", "UTF-8", bais);
                            Map<String, String> headers = new HashMap<>();
                            headers.put("Access-Control-Allow-Origin", "*");
                            headers.put("Cache-Control", "no-store");
                            resp.setResponseHeaders(headers);
                            return resp;
                        }
                    }
                    return super.shouldInterceptRequest(view, request);
                }
            });

            wv.addJavascriptInterface(new Object() {
                @JavascriptInterface
                public String getCallConfigJson() {
                    try {
                        SharedPreferences prefs = appCtx.getSharedPreferences(
                                OSAFirebaseMessagingService.PREFS_NAME,
                                Context.MODE_PRIVATE
                        );
                        JSONObject cfg = new JSONObject();
                        cfg.put("callId", callId);
                        cfg.put("callerId", callerId != null ? callerId : "");
                        cfg.put("callerName", callerName != null ? callerName : "OSA Audio Call");
                        cfg.put("chatId", chatId != null ? chatId : "");
                        cfg.put("supabaseUrl", prefs.getString("auth_supabase_url", ""));
                        cfg.put("anonKey", prefs.getString("auth_anon_key", ""));
                        cfg.put("accessToken", prefs.getString("auth_access_token", ""));
                        cfg.put("refreshToken", prefs.getString("auth_refresh_token", ""));
                        cfg.put("userId", prefs.getString("auth_user_id", ""));
                        cfg.put("isMuted", isCurrentOngoingCallMuted());
                        return cfg.toString();
                    } catch (Exception e) {
                        return "{}";
                    }
                }

                @JavascriptInterface
                public String refreshAccessToken() {
                    try {
                        SharedPreferences prefs = appCtx.getSharedPreferences(
                                OSAFirebaseMessagingService.PREFS_NAME,
                                Context.MODE_PRIVATE
                        );
                        String sbUrl = prefs.getString("auth_supabase_url", "");
                        String anon = prefs.getString("auth_anon_key", "");
                        String refresh = prefs.getString("auth_refresh_token", "");
                        if (sbUrl != null && !sbUrl.isEmpty() && anon != null && !anon.isEmpty()
                                && refresh != null && !refresh.isEmpty()) {
                            String refreshed = OSABackgroundMessagingService.refreshSupabaseAccessToken(
                                    sbUrl,
                                    anon,
                                    refresh,
                                    prefs
                            );
                            if (refreshed != null) {
                                return refreshed;
                            }
                        }
                    } catch (Exception ignored) {
                    }
                    return "";
                }

                @JavascriptInterface
                public void onCallConnected(String connectedCallId) {
                    android.util.Log.i("OSA_DIAG", "[OSA_BG_AUDIO_CALL] WebRTC connected callId=" + connectedCallId);
                    MainActivity.notifyNativeBgCallConnected(connectedCallId);
                }

                @JavascriptInterface
                public void onCallEnded(String endedCallId, String reason) {
                    android.util.Log.i("OSA_DIAG", "[OSA_BG_AUDIO_CALL] ended callId=" + endedCallId + " reason=" + reason);
                    String targetId = (endedCallId != null && !endedCallId.isEmpty()) ? endedCallId : callId;
                    MainActivity.notifyCallEndedFromNotification(targetId, "audio");
                    stopCallNotification(appCtx, targetId);
                }
            }, "OSANativeBgCall");

            backgroundCallWebView = wv;
            wv.onResume();
            wv.resumeTimers();
            wv.loadUrl(BG_CALL_URL);
        } catch (Exception e) {
            android.util.Log.e("OSA_DIAG", "[OSA_BG_AUDIO_CALL] Failed to start background WebRTC engine: " + e.getMessage());
        }
    }

    private static void setBackgroundWebRtcMuted(final boolean muted) {
        mainThreadHandler.post(() -> {
            if (backgroundCallWebView != null) {
                try {
                    backgroundCallWebView.evaluateJavascript(
                            "window.__osaBgSetMuted && window.__osaBgSetMuted(" + (muted ? "true" : "false") + ");",
                            null
                    );
                } catch (Exception ignored) {
                }
            }
        });
    }

    private static void stopBackgroundWebRtcAudioSession() {
        if (backgroundCallWebView != null) {
            final WebView wv = backgroundCallWebView;
            backgroundCallWebView = null;
            try {
                wv.evaluateJavascript("window.__osaBgEndCall && window.__osaBgEndCall();", null);
            } catch (Exception ignored) {
            }
            mainThreadHandler.postDelayed(() -> {
                try {
                    wv.loadUrl("about:blank");
                    wv.stopLoading();
                    wv.destroy();
                } catch (Exception ignored) {
                }
            }, 350);
        }
    }

    private static String buildBackgroundAudioWebRtcHtml() {
        return "<!DOCTYPE html><html><head><meta charset='utf-8'></head><body>"
                + "<audio id='remoteAudio' autoplay playsinline></audio>"
                + "<script>\n"
                + "(function() {\n"
                + "  var pc = null;\n"
                + "  var localStream = null;\n"
                + "  var remoteStream = null;\n"
                + "  var audioCtx = null;\n"
                + "  var remoteSourceNode = null;\n"
                + "  var pollTimer = null;\n"
                + "  var connectTimer = null;\n"
                + "  var isEnded = false;\n"
                + "  var isConnected = false;\n"
                + "  var isMuted = false;\n"
                + "  var processedSignals = {};\n"
                + "  var pendingCandidates = [];\n"
                + "  var cfg = {};\n"
                + "  try {\n"
                + "    cfg = JSON.parse(window.OSANativeBgCall.getCallConfigJson() || '{}');\n"
                + "  } catch (e) {}\n"
                + "  isMuted = !!cfg.isMuted;\n"
                + "\n"
                + "  function ensureWebAudioOutput() {\n"
                + "    try {\n"
                + "      var AC = window.AudioContext || window.webkitAudioContext;\n"
                + "      if (!AC || !remoteStream) return;\n"
                + "      if (!audioCtx) audioCtx = new AC();\n"
                + "      if (audioCtx.state === 'suspended') audioCtx.resume().catch(function() {});\n"
                + "      if (!remoteSourceNode && remoteStream.getAudioTracks().length > 0) {\n"
                + "        remoteSourceNode = audioCtx.createMediaStreamSource(remoteStream);\n"
                + "        remoteSourceNode.connect(audioCtx.destination);\n"
                + "      }\n"
                + "    } catch (e) {}\n"
                + "  }\n"
                + "\n"
                + "  window.__osaBgSetMuted = function(muted) {\n"
                + "    isMuted = !!muted;\n"
                + "    if (localStream) {\n"
                + "      var tracks = localStream.getAudioTracks();\n"
                + "      for (var i = 0; i < tracks.length; i++) {\n"
                + "        tracks[i].enabled = !isMuted;\n"
                + "      }\n"
                + "    }\n"
                + "  };\n"
                + "\n"
                + "  function cleanupOnly() {\n"
                + "    isEnded = true;\n"
                + "    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }\n"
                + "    if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }\n"
                + "    if (remoteSourceNode) {\n"
                + "      try { remoteSourceNode.disconnect(); } catch (e) {}\n"
                + "      remoteSourceNode = null;\n"
                + "    }\n"
                + "    if (audioCtx) {\n"
                + "      try { audioCtx.close(); } catch (e) {}\n"
                + "      audioCtx = null;\n"
                + "    }\n"
                + "    if (localStream) {\n"
                + "      try { localStream.getTracks().forEach(function(t) { t.stop(); }); } catch (e) {}\n"
                + "      localStream = null;\n"
                + "    }\n"
                + "    if (pc) {\n"
                + "      try { pc.close(); } catch (e) {}\n"
                + "      pc = null;\n"
                + "    }\n"
                + "    var aud = document.getElementById('remoteAudio');\n"
                + "    if (aud) { try { aud.srcObject = null; } catch (e) {} }\n"
                + "  }\n"
                + "\n"
                + "  window.__osaBgEndCall = function() {\n"
                + "    if (!isEnded) {\n"
                + "      try { sendSignal('hangup', { reason: 'ended' }); } catch (e) {}\n"
                + "      try { updateCallStatus('ended', { ended_at: new Date().toISOString() }); } catch (e) {}\n"
                + "    }\n"
                + "    cleanupOnly();\n"
                + "  };\n"
                + "\n"
                + "  function endAndNotify(reason) {\n"
                + "    if (isEnded) return;\n"
                + "    cleanupOnly();\n"
                + "    try { window.OSANativeBgCall.onCallEnded(cfg.callId || '', reason || 'ended'); } catch (e) {}\n"
                + "  }\n"
                + "\n"
                + "  async function sbFetch(path, options) {\n"
                + "    var url = cfg.supabaseUrl + path;\n"
                + "    var headers = Object.assign({\n"
                + "      'Content-Type': 'application/json',\n"
                + "      'apikey': cfg.anonKey,\n"
                + "      'Authorization': 'Bearer ' + cfg.accessToken\n"
                + "    }, (options && options.headers) || {});\n"
                + "    var res = await fetch(url, Object.assign({}, options, { headers: headers }));\n"
                + "    if (res.status === 401 && window.OSANativeBgCall && window.OSANativeBgCall.refreshAccessToken) {\n"
                + "      var refreshed = window.OSANativeBgCall.refreshAccessToken();\n"
                + "      if (refreshed) {\n"
                + "        cfg.accessToken = refreshed;\n"
                + "        headers['Authorization'] = 'Bearer ' + cfg.accessToken;\n"
                + "        res = await fetch(url, Object.assign({}, options, { headers: headers }));\n"
                + "      }\n"
                + "    }\n"
                + "    return res;\n"
                + "  }\n"
                + "\n"
                + "  function genUuidOrNull() {\n"
                + "    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();\n"
                + "    return null;\n"
                + "  }\n"
                + "\n"
                + "  async function sendSignal(signalType, payload) {\n"
                + "    if (!cfg.callId || !cfg.callerId || !cfg.userId) return;\n"
                + "    var sigId = genUuidOrNull();\n"
                + "    if (sigId) processedSignals[sigId] = true;\n"
                + "    var row = {\n"
                + "      call_id: cfg.callId,\n"
                + "      sender_id: cfg.userId,\n"
                + "      receiver_id: cfg.callerId,\n"
                + "      signal_type: signalType,\n"
                + "      payload: payload || {}\n"
                + "    };\n"
                + "    if (sigId) row.id = sigId;\n"
                + "    try {\n"
                + "      await sbFetch('/rest/v1/call_signals', {\n"
                + "        method: 'POST',\n"
                + "        headers: { 'Prefer': 'return=minimal' },\n"
                + "        body: JSON.stringify(row)\n"
                + "      });\n"
                + "    } catch (e) {}\n"
                + "  }\n"
                + "\n"
                + "  async function updateCallStatus(status, extra) {\n"
                + "    var body = Object.assign({ status: status, updated_at: new Date().toISOString() }, extra || {});\n"
                + "    try {\n"
                + "      await sbFetch('/rest/v1/calls?id=eq.' + encodeURIComponent(cfg.callId), {\n"
                + "        method: 'PATCH',\n"
                + "        headers: { 'Prefer': 'return=minimal' },\n"
                + "        body: JSON.stringify(body)\n"
                + "      });\n"
                + "    } catch (e) {}\n"
                + "  }\n"
                + "\n"
                + "  async function markConnected() {\n"
                + "    if (isConnected || isEnded) return;\n"
                + "    isConnected = true;\n"
                + "    if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }\n"
                + "    ensureWebAudioOutput();\n"
                + "    await updateCallStatus('connected', { answered_at: new Date().toISOString() });\n"
                + "    try { window.OSANativeBgCall.onCallConnected(cfg.callId); } catch (e) {}\n"
                + "  }\n"
                + "\n"
                + "  async function pollSignalsAndCall() {\n"
                + "    if (isEnded || !cfg.callId) return;\n"
                + "    try {\n"
                + "      var [sigRes, callRes] = await Promise.all([\n"
                + "        sbFetch('/rest/v1/call_signals?call_id=eq.' + encodeURIComponent(cfg.callId) + '&select=*&order=created_at.asc', { method: 'GET' }),\n"
                + "        sbFetch('/rest/v1/calls?id=eq.' + encodeURIComponent(cfg.callId) + '&select=id,status,caller_id', { method: 'GET' })\n"
                + "      ]);\n"
                + "      if (callRes.ok) {\n"
                + "        var callRows = await callRes.json();\n"
                + "        if (callRows && callRows.length > 0) {\n"
                + "          var st = callRows[0].status;\n"
                + "          if (st === 'ended' || st === 'rejected' || st === 'missed' || st === 'failed' || st === 'cancelled') {\n"
                + "            endAndNotify('remote_' + st);\n"
                + "            return;\n"
                + "          }\n"
                + "        }\n"
                + "      }\n"
                + "      if (sigRes.ok) {\n"
                + "        var sigs = await sigRes.json();\n"
                + "        for (var i = 0; i < (sigs || []).length; i++) {\n"
                + "          var s = sigs[i];\n"
                + "          if (!s || s.sender_id === cfg.userId || processedSignals[s.id]) continue;\n"
                + "          processedSignals[s.id] = true;\n"
                + "          if (s.signal_type === 'hangup' || s.signal_type === 'reject') {\n"
                + "            endAndNotify('signal_' + s.signal_type);\n"
                + "            return;\n"
                + "          }\n"
                + "          if (s.signal_type === 'ice-candidate' && s.payload && s.payload.candidate) {\n"
                + "            if (pc && pc.remoteDescription) {\n"
                + "              try { await pc.addIceCandidate(new RTCIceCandidate(s.payload.candidate)); } catch (e) {}\n"
                + "            } else {\n"
                + "              pendingCandidates.push(s.payload.candidate);\n"
                + "            }\n"
                + "          }\n"
                + "        }\n"
                + "      }\n"
                + "    } catch (e) {}\n"
                + "  }\n"
                + "\n"
                + "  async function start() {\n"
                + "    if (!cfg.callId || !cfg.supabaseUrl || !cfg.anonKey || !cfg.accessToken) {\n"
                + "      endAndNotify('missing_config');\n"
                + "      return;\n"
                + "    }\n"
                + "    try {\n"
                + "      // Ensure callerId is known and call is still active\n"
                + "      var callCheck = await sbFetch('/rest/v1/calls?id=eq.' + encodeURIComponent(cfg.callId) + '&select=*&limit=1', { method: 'GET' });\n"
                + "      if (callCheck.ok) {\n"
                + "        var rows = await callCheck.json();\n"
                + "        if (!rows || rows.length === 0) { endAndNotify('call_not_found'); return; }\n"
                + "        var cRow = rows[0];\n"
                + "        if (cRow.status === 'ended' || cRow.status === 'rejected' || cRow.status === 'missed' || cRow.status === 'failed') {\n"
                + "          endAndNotify('call_already_ended');\n"
                + "          return;\n"
                + "        }\n"
                + "        if (!cfg.callerId && cRow.caller_id) cfg.callerId = cRow.caller_id;\n"
                + "        if (!cfg.userId && cRow.receiver_id) cfg.userId = cRow.receiver_id;\n"
                + "      }\n"
                + "\n"
                + "      // Mark call accepted immediately\n"
                + "      updateCallStatus('accepted');\n"
                + "      sendSignal('renegotiate', { status: 'accepted' });\n"
                + "\n"
                + "      pc = new RTCPeerConnection({\n"
                + "        iceServers: [\n"
                + "          { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },\n"
                + "          {\n"
                + "            urls: [\n"
                + "              'stun:openrelay.metered.ca:80',\n"
                + "              'turn:openrelay.metered.ca:80',\n"
                + "              'turn:openrelay.metered.ca:443',\n"
                + "              'turns:openrelay.metered.ca:443'\n"
                + "            ],\n"
                + "            username: 'openrelayproject',\n"
                + "            credential: 'openrelayproject'\n"
                + "          }\n"
                + "        ],\n"
                + "        iceCandidatePoolSize: 4\n"
                + "      });\n"
                + "\n"
                + "      remoteStream = new MediaStream();\n"
                + "      var audEl = document.getElementById('remoteAudio');\n"
                + "      if (audEl) audEl.srcObject = remoteStream;\n"
                + "\n"
                + "      pc.ontrack = function(ev) {\n"
                + "        if (ev.streams && ev.streams[0]) {\n"
                + "          ev.streams[0].getTracks().forEach(function(t) {\n"
                + "            if (!remoteStream.getTracks().some(function(x) { return x.id === t.id; })) {\n"
                + "              remoteStream.addTrack(t);\n"
                + "            }\n"
                + "          });\n"
                + "        }\n"
                + "        if (ev.track && !remoteStream.getTracks().some(function(x) { return x.id === ev.track.id; })) {\n"
                + "          remoteStream.addTrack(ev.track);\n"
                + "        }\n"
                + "        if (audEl) {\n"
                + "          if (audEl.srcObject !== remoteStream) audEl.srcObject = remoteStream;\n"
                + "          audEl.play().catch(function() {});\n"
                + "        }\n"
                + "        ensureWebAudioOutput();\n"
                + "      };\n"
                + "\n"
                + "      pc.onicecandidate = function(ev) {\n"
                + "        if (ev.candidate) {\n"
                + "          sendSignal('ice-candidate', { candidate: ev.candidate.toJSON() });\n"
                + "        }\n"
                + "      };\n"
                + "\n"
                + "      pc.oniceconnectionstatechange = function() {\n"
                + "        if (!pc) return;\n"
                + "        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {\n"
                + "          markConnected();\n"
                + "        } else if (pc.iceConnectionState === 'failed') {\n"
                + "          endAndNotify('ice_failed');\n"
                + "        }\n"
                + "      };\n"
                + "\n"
                + "      pc.onconnectionstatechange = function() {\n"
                + "        if (!pc) return;\n"
                + "        if (pc.connectionState === 'connected') {\n"
                + "          markConnected();\n"
                + "        } else if (pc.connectionState === 'failed') {\n"
                + "          endAndNotify('conn_failed');\n"
                + "        }\n"
                + "      };\n"
                + "\n"
                + "      var fetchOffer = async function() {\n"
                + "        var offerSig = null;\n"
                + "        var allSigs = [];\n"
                + "        for (var a = 0; a < 20; a++) {\n"
                + "          if (isEnded) return null;\n"
                + "          var r = await sbFetch('/rest/v1/call_signals?call_id=eq.' + encodeURIComponent(cfg.callId) + '&select=*&order=created_at.asc', { method: 'GET' });\n"
                + "          if (r.ok) {\n"
                + "            allSigs = await r.json();\n"
                + "            for (var j = 0; j < allSigs.length; j++) {\n"
                + "              if (allSigs[j].signal_type === 'offer' && allSigs[j].payload && allSigs[j].payload.sdp) {\n"
                + "                offerSig = allSigs[j];\n"
                + "                break;\n"
                + "              }\n"
                + "            }\n"
                + "            if (offerSig) break;\n"
                + "          }\n"
                + "          await new Promise(function(res) { setTimeout(res, 220); });\n"
                + "        }\n"
                + "        return { offerSig: offerSig, allSigs: allSigs };\n"
                + "      };\n"
                + "\n"
                + "      var [mediaStream, sigData] = await Promise.all([\n"
                + "        navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }),\n"
                + "        fetchOffer()\n"
                + "      ]);\n"
                + "\n"
                + "      if (isEnded) { mediaStream.getTracks().forEach(function(t) { t.stop(); }); return; }\n"
                + "      localStream = mediaStream;\n"
                + "      localStream.getAudioTracks().forEach(function(t) {\n"
                + "        t.enabled = !isMuted;\n"
                + "        pc.addTrack(t, localStream);\n"
                + "      });\n"
                + "\n"
                + "      if (!sigData || !sigData.offerSig) {\n"
                + "        await updateCallStatus('failed', { ended_at: new Date().toISOString() });\n"
                + "        endAndNotify('offer_missing');\n"
                + "        return;\n"
                + "      }\n"
                + "\n"
                + "      processedSignals[sigData.offerSig.id] = true;\n"
                + "      await pc.setRemoteDescription(new RTCSessionDescription({\n"
                + "        type: sigData.offerSig.payload.type || 'offer',\n"
                + "        sdp: sigData.offerSig.payload.sdp\n"
                + "      }));\n"
                + "\n"
                + "      for (var k = 0; k < sigData.allSigs.length; k++) {\n"
                + "        var cs = sigData.allSigs[k];\n"
                + "        if (cs.signal_type === 'ice-candidate' && cs.sender_id === cfg.callerId && cs.payload && cs.payload.candidate) {\n"
                + "          processedSignals[cs.id] = true;\n"
                + "          pendingCandidates.push(cs.payload.candidate);\n"
                + "        }\n"
                + "      }\n"
                + "\n"
                + "      var cands = pendingCandidates.slice();\n"
                + "      pendingCandidates = [];\n"
                + "      for (var m = 0; m < cands.length; m++) {\n"
                + "        try { await pc.addIceCandidate(new RTCIceCandidate(cands[m])); } catch (e) {}\n"
                + "      }\n"
                + "\n"
                + "      var answer = await pc.createAnswer();\n"
                + "      await pc.setLocalDescription(answer);\n"
                + "      await sendSignal('answer', { type: answer.type, sdp: answer.sdp });\n"
                + "\n"
                + "      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed' || pc.connectionState === 'connected') {\n"
                + "        await markConnected();\n"
                + "      } else {\n"
                + "        connectTimer = setTimeout(function() {\n"
                + "          if (!isConnected && !isEnded) {\n"
                + "            updateCallStatus('failed', { ended_at: new Date().toISOString() });\n"
                + "            endAndNotify('connect_timeout');\n"
                + "          }\n"
                + "        }, 25000);\n"
                + "      }\n"
                + "\n"
                + "      pollTimer = setInterval(pollSignalsAndCall, 750);\n"
                + "    } catch (err) {\n"
                + "      await updateCallStatus('failed', { ended_at: new Date().toISOString() });\n"
                + "      endAndNotify('exception');\n"
                + "    }\n"
                + "  }\n"
                + "\n"
                + "  start();\n"
                + "})();\n"
                + "</script></body></html>";
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
        String action = intent.getAction();

        if (ACTION_START_ONGOING_CALL.equals(action)) {
            this.isOngoingCallMode = true;
            timeoutHandler.removeCallbacksAndMessages(null);
            stopGlobalRingtoneAndVibration();
            acquireOngoingCallWakeLock();
            synchronized (OSACallNotificationService.class) {
                if (this.activeCallId.equals(currentRingingCallId)) {
                    currentRingingCallId = null;
                }
                currentOngoingCallId = this.activeCallId;
            }
            int notificationId = computeCallNotificationId(this.activeCallId);
            Notification ongoingNotification = buildOngoingCallNotification(this, intent, notificationId);
            startForegroundSafely(notificationId, ongoingNotification, intent, true);
            return START_STICKY;
        }

        this.isOngoingCallMode = false;
        synchronized (OSACallNotificationService.class) {
            currentRingingCallId = this.activeCallId;
        }

        acquireCallWakeLock();
        int notificationId = computeCallNotificationId(this.activeCallId);
        Notification notification = buildIncomingCallNotification(this, intent, notificationId);
        startForegroundSafely(notificationId, notification, intent, false);

        startRingtoneAndVibration(this.activeCallId);

        // Automatically stop ringing after 45 seconds if unanswered, and keep ringtone looping on OEM ROMs
        timeoutHandler.removeCallbacksAndMessages(null);
        scheduleRingtoneKeepAlive();
        timeoutHandler.postDelayed(() -> stopCallNotification(OSACallNotificationService.this, activeCallId), 45000);

        return START_NOT_STICKY;
    }

    private void startForegroundSafely(int notificationId, Notification notification, Intent intent, boolean isOngoing) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                try {
                    int fgsType = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK;
                    if (Build.VERSION.SDK_INT >= 34) {
                        // ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL == 4
                        fgsType |= 4;
                    }
                    if (isOngoing && ContextCompat.checkSelfPermission(this, android.Manifest.permission.RECORD_AUDIO)
                            == android.content.pm.PackageManager.PERMISSION_GRANTED) {
                        fgsType |= ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
                    }
                    String cType = intent != null ? intent.getStringExtra("callType") : "audio";
                    if (isOngoing && "video".equalsIgnoreCase(cType)
                            && ContextCompat.checkSelfPermission(this, android.Manifest.permission.CAMERA)
                            == android.content.pm.PackageManager.PERMISSION_GRANTED) {
                        fgsType |= ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA;
                    }
                    startForeground(notificationId, notification, fgsType);
                    return;
                } catch (Exception ignored) {
                    // Fall through to mediaPlayback fallback
                }
            }
            try {
                startForeground(notificationId, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
                return;
            } catch (Exception e1) {
                try {
                    startForeground(notificationId, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
                    return;
                } catch (Exception e2) {
                    try {
                        startForeground(notificationId, notification);
                        return;
                    } catch (Exception ignored) {
                    }
                }
            }
        } else {
            try {
                startForeground(notificationId, notification);
                return;
            } catch (Exception ignored) {
            }
        }
        if (!isOngoing) {
            postDirectCallNotificationFallback(this, intent);
        } else {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.notify(notificationId, ongoingNotificationOrFallback(notification));
            }
        }
    }

    private Notification ongoingNotificationOrFallback(Notification notification) {
        return notification;
    }

    private void scheduleRingtoneKeepAlive() {
        timeoutHandler.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (isOngoingCallMode || activeCallId == null || !activeCallId.equals(currentRingingCallId)) return;
                synchronized (OSACallNotificationService.class) {
                    try {
                        if (globalActiveRingtone != null && !globalActiveRingtone.isPlaying()) {
                            globalActiveRingtone.play();
                        }
                    } catch (Exception ignored) {
                    }
                }
                timeoutHandler.postDelayed(this, 2500);
            }
        }, 2500);
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

    private void acquireOngoingCallWakeLock() {
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                if (wakeLock != null && wakeLock.isHeld()) {
                    wakeLock.release();
                }
                wakeLock = pm.newWakeLock(
                        PowerManager.PARTIAL_WAKE_LOCK,
                        "osa:ongoing_call_wakelock"
                );
                // Keep CPU awake during active audio/video calls (up to 4 hours safety ceiling)
                wakeLock.acquire(4 * 60 * 60 * 1000L);
            }
        } catch (Exception ignored) {
        }
        try {
            WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm != null) {
                if (wifiLock != null && wifiLock.isHeld()) {
                    wifiLock.release();
                }
                int lockMode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                        ? WifiManager.WIFI_MODE_FULL_LOW_LATENCY
                        : WifiManager.WIFI_MODE_FULL_HIGH_PERF;
                wifiLock = wm.createWifiLock(lockMode, "osa:ongoing_call_wifilock");
                wifiLock.setReferenceCounted(false);
                wifiLock.acquire();
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
        try {
            if (wifiLock != null && wifiLock.isHeld()) {
                wifiLock.release();
            }
            wifiLock = null;
        } catch (Exception ignored) {
        }
    }

    private synchronized void startRingtoneAndVibration(String callId) {
        synchronized (OSACallNotificationService.class) {
            if (callId != null
                    && callId.equals(globalRingingCallId)
                    && globalActiveRingtone != null
                    && globalActiveRingtone.isPlaying()) {
                return;
            }
            stopGlobalRingtoneAndVibration();
            globalRingingCallId = callId;

            try {
                Uri ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
                globalActiveRingtone = RingtoneManager.getRingtone(getApplicationContext(), ringtoneUri);
                if (globalActiveRingtone != null) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                        globalActiveRingtone.setAudioAttributes(
                                new AudioAttributes.Builder()
                                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                                        .build()
                        );
                    }
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                        globalActiveRingtone.setLooping(true);
                    }
                    if (!globalActiveRingtone.isPlaying()) {
                        globalActiveRingtone.play();
                    }
                }
            } catch (Exception ignored) {
            }

            try {
                globalActiveVibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                if (globalActiveVibrator != null && globalActiveVibrator.hasVibrator()) {
                    long[] pattern = new long[]{0, 500, 300, 500, 300, 600};
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        globalActiveVibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
                    } else {
                        globalActiveVibrator.vibrate(pattern, 0);
                    }
                }
            } catch (Exception ignored) {
            }
        }
    }

    @Override
    public void onDestroy() {
        timeoutHandler.removeCallbacksAndMessages(null);
        stopGlobalRingtoneAndVibration();
        releaseCallWakeLock();
        mainThreadHandler.post(OSACallNotificationService::stopBackgroundWebRtcAudioSession);
        synchronized (OSACallNotificationService.class) {
            if (activeCallId != null && activeCallId.equals(currentRingingCallId)) {
                currentRingingCallId = null;
            }
            if (activeCallId != null && activeCallId.equals(currentOngoingCallId)) {
                currentOngoingCallId = null;
            }
            if (activeCallId != null && activeCallId.equals(activeBackgroundWebRtcCallId)) {
                activeBackgroundWebRtcCallId = null;
            }
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
