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
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.ToneGenerator;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.RemoteInput;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Standalone Native Voice Message Notification & Playback Service for Android.
 *
 * Requirements satisfied:
 * 1. Tapping the Voice Message notification will NEVER launch MainActivity, Home,
 *    Chat List, or Conversation screen.
 * 2. Provides direct in-notification Play/Pause controls with live progress updates.
 * 3. Provides direct in-notification inline reply via RemoteInput without foregrounding the app.
 * 4. Displays sender name, voice duration, and message details.
 * 5. Uses native MediaPlayer with synthetic tone preview fallback for playback reliability.
 */
public class OSAVoiceNotificationService extends Service {
    public static final int STATE_IDLE = 0;
    public static final int STATE_PLAYING = 1;
    public static final int STATE_PAUSED = 2;

    private static final Pattern DURATION_PATTERN = Pattern.compile("(\\d{1,2}:\\d{2})");
    private static final Handler mainHandler = new Handler(Looper.getMainLooper());

    private static volatile int playState = STATE_IDLE;
    private static volatile int elapsedSec = 0;
    private static volatile int totalSec = 5;
    private static volatile MediaPlayer activeMediaPlayer = null;
    private static volatile ToneGenerator activeToneGenerator = null;
    private static volatile AudioFocusRequest activeAudioFocusRequest = null;
    private static volatile PowerManager.WakeLock activeWakeLock = null;

    private static String activeSenderName = "OSA User";
    private static String activeSenderId = "";
    private static String activeChatId = "";
    private static String activeMessageId = "";
    private static String activeThreadKey = "";
    private static String activeNotificationTag = "";
    private static int activeNotificationId = 0;
    private static String activeAudioUrl = "";
    private static String activeDurationStr = "0:05";
    private static boolean activeIsBn = false;

    private static final Runnable tickerRunnable = new Runnable() {
        @Override
        public void run() {
            if (playState != STATE_PLAYING) return;

            elapsedSec++;
            if (elapsedSec >= totalSec) {
                stopPlaybackInternal(null, true);
                return;
            }

            Context ctx = activeContextRef != null ? activeContextRef : null;
            if (ctx != null) {
                updateNotificationUI(ctx, STATE_PLAYING, elapsedSec, totalSec);
            }
            mainHandler.postDelayed(this, 1000L);
        }
    };

    private static Context activeContextRef = null;

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        activeContextRef = getApplicationContext();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_NOT_STICKY;

        activeContextRef = getApplicationContext();
        String action = intent.getAction();
        if (action == null) return START_NOT_STICKY;

        switch (action) {
            case OSAVoiceNotificationReceiver.ACTION_PLAY_VOICE:
                handlePlayAction(this, intent);
                break;
            case OSAVoiceNotificationReceiver.ACTION_PAUSE_VOICE:
                handlePauseAction(this);
                break;
            case OSAVoiceNotificationReceiver.ACTION_TOGGLE_PLAY_VOICE:
                if (playState == STATE_PLAYING) {
                    handlePauseAction(this);
                } else {
                    handlePlayAction(this, intent);
                }
                break;
            case OSAVoiceNotificationReceiver.ACTION_STOP_VOICE:
                stopPlaybackInternal(this, true);
                stopSelf();
                break;
            default:
                break;
        }

        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        stopPlaybackInternal(this, false);
    }

    /**
     * Determines whether an incoming push or background payload represents a Voice Message.
     */
    public static boolean isVoiceMessagePayload(Map<String, String> data) {
        if (data == null || data.isEmpty()) return false;

        String msgType = data.get("messageType");
        if (msgType != null && ("audio".equalsIgnoreCase(msgType.trim()) || "voice".equalsIgnoreCase(msgType.trim()))) {
            return true;
        }

        String rawType = data.get("type");
        if (rawType != null && ("voice_message".equalsIgnoreCase(rawType.trim()) || "voice".equalsIgnoreCase(rawType.trim()))) {
            return true;
        }

        String preview = data.get("messagePreview");
        if (preview == null || preview.trim().isEmpty()) {
            preview = data.get("latestPreview");
        }
        if (preview == null || preview.trim().isEmpty()) {
            preview = data.get("body");
        }
        if (preview != null) {
            String p = preview.trim();
            if (p.startsWith("🎤") || p.toLowerCase().contains("voice message") || p.contains("ভয়েস বার্তা")) {
                return true;
            }
        }

        String content = data.get("content");
        if (content != null) {
            String c = content.trim();
            if (c.startsWith("🎤") || c.toLowerCase().contains("voice message") || c.contains("ভয়েস বার্তা")) {
                return true;
            }
        }

        return false;
    }

    /**
     * Extracts voice duration string (e.g. "0:15") from data extras or preview text.
     */
    public static String extractDurationString(Map<String, String> data) {
        if (data == null) return "0:05";

        String dur = data.get("duration");
        if (dur != null && !dur.trim().isEmpty()) {
            return dur.trim();
        }

        String durSecStr = data.get("durationSeconds");
        if (durSecStr != null && !durSecStr.trim().isEmpty()) {
            try {
                int sec = Integer.parseInt(durSecStr.trim());
                return formatSeconds(sec);
            } catch (Exception ignored) {
            }
        }

        String candidate = data.get("messagePreview");
        if (candidate == null || candidate.isEmpty()) candidate = data.get("latestPreview");
        if (candidate == null || candidate.isEmpty()) candidate = data.get("body");
        if (candidate == null || candidate.isEmpty()) candidate = data.get("content");

        if (candidate != null) {
            Matcher m = DURATION_PATTERN.matcher(candidate);
            if (m.find()) {
                return m.group(1);
            }
        }

        return "0:05";
    }

    public static int parseDurationSeconds(String durStr) {
        if (durStr == null || durStr.trim().isEmpty()) return 5;
        try {
            String[] parts = durStr.trim().split(":");
            if (parts.length == 2) {
                int mins = Integer.parseInt(parts[0].trim());
                int secs = Integer.parseInt(parts[1].trim());
                return Math.max(2, (mins * 60) + secs);
            } else if (parts.length == 1) {
                return Math.max(2, Integer.parseInt(parts[0].replaceAll("[^0-9]", "")));
            }
        } catch (Exception ignored) {
        }
        return 5;
    }

    public static String formatSeconds(int totalSecs) {
        int m = Math.max(0, totalSecs / 60);
        int s = Math.max(0, totalSecs % 60);
        return String.format(java.util.Locale.US, "%d:%02d", m, s);
    }

    /**
     * Posts the initial standalone native Voice Message notification.
     * Note: ContentIntent is strictly attached to OSAVoiceNotificationReceiver (Toggle Play/Pause)
     * and NEVER opens MainActivity or any screen.
     */
    public static synchronized void postVoiceMessageNotification(Context context, Map<String, String> data) {
        if (context == null || data == null) return;
        MainActivity.ensureNotificationChannels(context);

        String conversationId = data.get("conversationId") != null && !data.get("conversationId").isEmpty()
                ? data.get("conversationId").trim()
                : (data.get("chatId") != null ? data.get("chatId").trim() : "");
        String senderId = data.get("senderId") != null ? data.get("senderId").trim() : "";
        String messageId = data.get("messageId") != null ? data.get("messageId").trim() : "";

        SharedPreferences prefs = context.getSharedPreferences(OSAFirebaseMessagingService.PREFS_NAME, MODE_PRIVATE);
        String loggedInUserId = prefs.getString("auth_user_id", "");
        if (!loggedInUserId.isEmpty() && !senderId.isEmpty() && loggedInUserId.equals(senderId)) {
            return;
        }

        String senderName = data.get("senderName") != null && !data.get("senderName").trim().isEmpty()
                ? data.get("senderName").trim()
                : "";
        if (senderName.isEmpty() || "OSA".equalsIgnoreCase(senderName)) {
            String titleCandidate = data.get("title") != null ? data.get("title").trim() : "";
            if (!titleCandidate.isEmpty() && !"OSA".equalsIgnoreCase(titleCandidate)) {
                senderName = titleCandidate;
            } else {
                senderName = "OSA User";
            }
        }

        String threadKey = !conversationId.isEmpty()
                ? conversationId
                : (!senderId.isEmpty() ? senderId : senderName);

        String audioUrl = data.get("audioUrl");
        if (audioUrl == null || audioUrl.trim().isEmpty()) audioUrl = data.get("fileUrl");
        if (audioUrl == null || audioUrl.trim().isEmpty()) audioUrl = data.get("mediaUrl");
        if (audioUrl == null) audioUrl = "";
        audioUrl = audioUrl.trim();

        String durationStr = extractDurationString(data);
        int durationSec = parseDurationSeconds(durationStr);

        String preview = data.get("messagePreview");
        if (preview == null || preview.isEmpty()) preview = data.get("body");
        boolean isBn = preview != null && preview.contains("ভয়েস বার্তা");

        // Cache active metadata
        activeSenderName = senderName;
        activeSenderId = senderId;
        activeChatId = conversationId;
        activeMessageId = messageId;
        activeThreadKey = threadKey;
        activeNotificationTag = "osa-chat-" + threadKey;
        activeNotificationId = 0;
        activeAudioUrl = audioUrl;
        activeDurationStr = durationStr;
        activeIsBn = isBn;
        totalSec = durationSec;
        elapsedSec = 0;
        playState = STATE_IDLE;

        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        Notification notification = buildVoiceNotification(
                context,
                STATE_IDLE,
                0,
                durationSec,
                senderName,
                conversationId,
                senderId,
                messageId,
                threadKey,
                activeNotificationTag,
                activeNotificationId,
                audioUrl,
                durationStr,
                isBn
        );

        manager.notify(activeNotificationTag, activeNotificationId, notification);
        android.util.Log.i("OSA_VOICE", "[VOICE_NOTIFICATION_POSTED] tag=" + activeNotificationTag
                + " sender=" + senderName + " duration=" + durationStr);
    }

    /**
     * Builds the Notification object with Play/Pause and inline Reply actions.
     * The notification body's contentIntent is bound to OSAVoiceNotificationReceiver
     * so user taps do NOT launch MainActivity.
     */
    private static Notification buildVoiceNotification(
            Context context,
            int state,
            int currentElapsed,
            int maxDuration,
            String senderName,
            String chatId,
            String senderId,
            String messageId,
            String threadKey,
            String notificationTag,
            int notificationId,
            String audioUrl,
            String durationStr,
            boolean isBn
    ) {
        String title = senderName;
        String subText = isBn ? "ভয়েস বার্তা · OSA" : "Voice Message · OSA";
        String contentText;
        String bigBody;

        if (state == STATE_PLAYING) {
            String timeProgress = formatSeconds(currentElapsed) + " / " + formatSeconds(maxDuration);
            contentText = isBn
                    ? "▶ চলছে (" + timeProgress + ")"
                    : "▶ Playing (" + timeProgress + ")…";
            bigBody = isBn
                    ? "▶ ভয়েস বার্তা চলছে (" + timeProgress + ")\nনোটিফিকেশন থেকেই শুনুন এবং সরাসরি উত্তর দিন।"
                    : "▶ Playing voice message (" + timeProgress + ")\nListen and reply directly from this notification.";
        } else if (state == STATE_PAUSED) {
            String timeProgress = formatSeconds(currentElapsed) + " / " + formatSeconds(maxDuration);
            contentText = isBn
                    ? "⏸ থামানো হয়েছে (" + timeProgress + ")"
                    : "⏸ Paused (" + timeProgress + ")";
            bigBody = isBn
                    ? "⏸ ভয়েস বার্তা থামানো হয়েছে (" + timeProgress + ")\nচালানোর জন্য Play চাপুন।"
                    : "⏸ Paused voice message (" + timeProgress + ")\nTap Play to resume listening.";
        } else {
            contentText = isBn
                    ? "🎤 ভয়েস বার্তা (" + durationStr + ")"
                    : "🎤 Voice Message (" + durationStr + ")";
            bigBody = isBn
                    ? "🎤 ভয়েস বার্তা (" + durationStr + ") এসেছে।\nঅ্যাপ না খুলে সরাসরি এখান থেকেই শুনুন এবং উত্তর দিন।"
                    : "🎤 Voice message (" + durationStr + ") received.\nListen and reply directly from this notification without opening the app.";
        }

        NotificationCompat.BigTextStyle style = new NotificationCompat.BigTextStyle()
                .setBigContentTitle(title)
                .setSummaryText(subText)
                .bigText(bigBody);

        // Safe Body Tap: Intent points to OSAVoiceNotificationReceiver (Toggle Play/Pause)
        // and NEVER launches MainActivity or any conversation view.
        Intent bodyTapIntent = new Intent(context, OSAVoiceNotificationReceiver.class);
        bodyTapIntent.setAction(OSAVoiceNotificationReceiver.ACTION_TOGGLE_PLAY_VOICE);
        bodyTapIntent.putExtra("chatId", chatId);
        bodyTapIntent.putExtra("conversationId", chatId);
        bodyTapIntent.putExtra("senderId", senderId);
        bodyTapIntent.putExtra("senderName", senderName);
        bodyTapIntent.putExtra("messageId", messageId);
        bodyTapIntent.putExtra("threadKey", threadKey);
        bodyTapIntent.putExtra("audioUrl", audioUrl);
        bodyTapIntent.putExtra("duration", durationStr);
        bodyTapIntent.putExtra("isBn", isBn);

        int bodyFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            bodyFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pendingBodyTap = PendingIntent.getBroadcast(
                context,
                ((("voice_body_" + threadKey).hashCode()) & 0x7FFFFFFF) % 1000000 + 4000,
                bodyTapIntent,
                bodyFlags
        );

        // Delete Intent: stop playback if dismissed
        Intent deleteIntent = new Intent(context, OSAVoiceNotificationReceiver.class);
        deleteIntent.setAction(OSAVoiceNotificationReceiver.ACTION_STOP_VOICE);
        PendingIntent pendingDelete = PendingIntent.getBroadcast(
                context,
                ((("voice_del_" + threadKey).hashCode()) & 0x7FFFFFFF) % 1000000 + 4001,
                deleteIntent,
                bodyFlags
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, MainActivity.CHANNEL_MESSAGES)
                .setSmallIcon(android.R.drawable.sym_action_chat)
                .setContentTitle(title)
                .setSubText(subText)
                .setContentText(contentText)
                .setStyle(style)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(state == STATE_PLAYING ? NotificationCompat.CATEGORY_TRANSPORT : NotificationCompat.CATEGORY_MESSAGE)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setGroup("osa_group_" + threadKey)
                .setOnlyAlertOnce(state != STATE_IDLE)
                .setSilent(state != STATE_IDLE)
                .setAutoCancel(false)
                .setOngoing(state == STATE_PLAYING)
                .setContentIntent(pendingBodyTap)
                .setDeleteIntent(pendingDelete);

        // Action 1: Play / Pause Control
        Intent playPauseIntent = new Intent(context, OSAVoiceNotificationReceiver.class);
        if (state == STATE_PLAYING) {
            playPauseIntent.setAction(OSAVoiceNotificationReceiver.ACTION_PAUSE_VOICE);
        } else {
            playPauseIntent.setAction(OSAVoiceNotificationReceiver.ACTION_PLAY_VOICE);
            playPauseIntent.putExtra("chatId", chatId);
            playPauseIntent.putExtra("conversationId", chatId);
            playPauseIntent.putExtra("senderId", senderId);
            playPauseIntent.putExtra("senderName", senderName);
            playPauseIntent.putExtra("messageId", messageId);
            playPauseIntent.putExtra("threadKey", threadKey);
            playPauseIntent.putExtra("audioUrl", audioUrl);
            playPauseIntent.putExtra("duration", durationStr);
            playPauseIntent.putExtra("isBn", isBn);
        }

        PendingIntent pendingPlayPause = PendingIntent.getBroadcast(
                context,
                ((("voice_pp_" + threadKey).hashCode()) & 0x7FFFFFFF) % 1000000 + 4002,
                playPauseIntent,
                bodyFlags
        );

        int playIcon = state == STATE_PLAYING
                ? android.R.drawable.ic_media_pause
                : android.R.drawable.ic_media_play;
        String playTitle = state == STATE_PLAYING
                ? (isBn ? "Pause" : "Pause")
                : (isBn ? "Play" : "Play");

        builder.addAction(playIcon, playTitle, pendingPlayPause);

        // Action 2: In-Notification Inline Reply via RemoteInput
        RemoteInput remoteInput = new RemoteInput.Builder(OSANotificationReplyReceiver.KEY_TEXT_REPLY)
                .setLabel(isBn ? (senderName + "-কে উত্তর দিন") : ("Reply to " + senderName))
                .build();

        Intent replyIntent = new Intent(context, OSANotificationReplyReceiver.class);
        replyIntent.setAction(OSANotificationReplyReceiver.ACTION_INLINE_REPLY);
        if (chatId != null && !chatId.isEmpty()) {
            replyIntent.putExtra("chatId", chatId);
            replyIntent.putExtra("conversationId", chatId);
        }
        if (senderId != null && !senderId.isEmpty()) {
            replyIntent.putExtra("senderId", senderId);
        }
        if (senderName != null && !senderName.isEmpty()) {
            replyIntent.putExtra("senderName", senderName);
        }
        if (messageId != null && !messageId.isEmpty()) {
            replyIntent.putExtra("replyToMessageId", messageId);
        }
        replyIntent.putExtra("threadKey", threadKey);
        replyIntent.putExtra("notificationTag", notificationTag);
        replyIntent.putExtra("notificationId", notificationId);
        replyIntent.putExtra("isVoiceMessage", true);

        int replyFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            replyFlags |= PendingIntent.FLAG_MUTABLE;
        }
        PendingIntent pendingReply = PendingIntent.getBroadcast(
                context,
                ((("voice_reply_" + threadKey).hashCode()) & 0x7FFFFFFF) % 1000000 + 4003,
                replyIntent,
                replyFlags
        );

        NotificationCompat.Action replyAction = new NotificationCompat.Action.Builder(
                android.R.drawable.ic_menu_send,
                isBn ? "Reply" : "Reply",
                pendingReply
        )
                .addRemoteInput(remoteInput)
                .setAllowGeneratedReplies(true)
                .build();

        builder.addAction(replyAction);

        return builder.build();
    }

    private static synchronized void updateNotificationUI(Context context, int state, int current, int max) {
        if (context == null) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        Notification notification = buildVoiceNotification(
                context,
                state,
                current,
                max,
                activeSenderName,
                activeChatId,
                activeSenderId,
                activeMessageId,
                activeThreadKey,
                activeNotificationTag,
                activeNotificationId,
                activeAudioUrl,
                activeDurationStr,
                activeIsBn
        );

        manager.notify(activeNotificationTag, activeNotificationId, notification);
    }

    private void handlePlayAction(Context context, Intent intent) {
        if (intent.hasExtra("senderName")) activeSenderName = intent.getStringExtra("senderName");
        if (intent.hasExtra("chatId")) activeChatId = intent.getStringExtra("chatId");
        if (intent.hasExtra("senderId")) activeSenderId = intent.getStringExtra("senderId");
        if (intent.hasExtra("messageId")) activeMessageId = intent.getStringExtra("messageId");
        if (intent.hasExtra("threadKey")) activeThreadKey = intent.getStringExtra("threadKey");
        if (intent.hasExtra("audioUrl")) activeAudioUrl = intent.getStringExtra("audioUrl");
        if (intent.hasExtra("duration")) {
            activeDurationStr = intent.getStringExtra("duration");
            totalSec = parseDurationSeconds(activeDurationStr);
        }
        if (intent.hasExtra("isBn")) activeIsBn = intent.getBooleanExtra("isBn", false);

        if (activeNotificationTag.isEmpty()) {
            activeNotificationTag = "osa-chat-" + activeThreadKey;
        }

        // Acquire WakeLock
        try {
            if (activeWakeLock == null) {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                if (pm != null) {
                    activeWakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "osa:voice_playback_wakelock");
                }
            }
            if (activeWakeLock != null && !activeWakeLock.isHeld()) {
                activeWakeLock.acquire((totalSec + 10) * 1000L);
            }
        } catch (Exception ignored) {
        }

        requestAudioFocus();

        // If resuming paused playback
        if (playState == STATE_PAUSED && activeMediaPlayer != null) {
            try {
                activeMediaPlayer.start();
                playState = STATE_PLAYING;
                startForegroundIfNeeded();
                updateNotificationUI(context, STATE_PLAYING, elapsedSec, totalSec);
                mainHandler.removeCallbacks(tickerRunnable);
                mainHandler.postDelayed(tickerRunnable, 1000L);
                return;
            } catch (Exception e) {
                android.util.Log.w("OSA_VOICE", "Error resuming MediaPlayer, will restart", e);
            }
        }

        // Start fresh playback
        playState = STATE_PLAYING;
        elapsedSec = 0;
        startForegroundIfNeeded();
        updateNotificationUI(context, STATE_PLAYING, elapsedSec, totalSec);

        mainHandler.removeCallbacks(tickerRunnable);

        if (activeAudioUrl != null && (activeAudioUrl.startsWith("http://") || activeAudioUrl.startsWith("https://"))) {
            startMediaPlayerPlayback(activeAudioUrl);
        } else {
            // Simulated voice message tone preview
            startTonePreviewPlayback();
        }

        mainHandler.postDelayed(tickerRunnable, 1000L);
    }

    private void handlePauseAction(Context context) {
        if (playState != STATE_PLAYING) return;

        playState = STATE_PAUSED;
        mainHandler.removeCallbacks(tickerRunnable);

        if (activeMediaPlayer != null) {
            try {
                if (activeMediaPlayer.isPlaying()) {
                    activeMediaPlayer.pause();
                }
            } catch (Exception ignored) {
            }
        }

        releaseToneGenerator();
        abandonAudioFocus();
        stopForeground(false);
        updateNotificationUI(context, STATE_PAUSED, elapsedSec, totalSec);
    }

    private static synchronized void stopPlaybackInternal(Context context, boolean resetNotification) {
        playState = STATE_IDLE;
        mainHandler.removeCallbacks(tickerRunnable);

        if (activeMediaPlayer != null) {
            try {
                if (activeMediaPlayer.isPlaying()) {
                    activeMediaPlayer.stop();
                }
                activeMediaPlayer.release();
            } catch (Exception ignored) {
            }
            activeMediaPlayer = null;
        }

        releaseToneGenerator();
        abandonAudioFocus();

        try {
            if (activeWakeLock != null && activeWakeLock.isHeld()) {
                activeWakeLock.release();
            }
        } catch (Exception ignored) {
        }
        activeWakeLock = null;

        Context ctx = context != null ? context : activeContextRef;
        if (resetNotification && ctx != null) {
            elapsedSec = 0;
            updateNotificationUI(ctx, STATE_IDLE, 0, totalSec);
        }
    }

    private void startMediaPlayerPlayback(String url) {
        try {
            if (activeMediaPlayer != null) {
                activeMediaPlayer.release();
                activeMediaPlayer = null;
            }

            MediaPlayer player = new MediaPlayer();
            AudioAttributes attrs = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build();
            player.setAudioAttributes(attrs);
            player.setDataSource(this, Uri.parse(url));

            player.setOnPreparedListener(mp -> {
                if (playState == STATE_PLAYING) {
                    try {
                        int dur = mp.getDuration();
                        if (dur > 1000) {
                            totalSec = dur / 1000;
                            activeDurationStr = formatSeconds(totalSec);
                        }
                        mp.start();
                    } catch (Exception ignored) {
                    }
                }
            });

            player.setOnCompletionListener(mp -> stopPlaybackInternal(this, true));

            player.setOnErrorListener((mp, what, extra) -> {
                android.util.Log.w("OSA_VOICE", "MediaPlayer error what=" + what + ", falling back to tone");
                startTonePreviewPlayback();
                return true;
            });

            activeMediaPlayer = player;
            player.prepareAsync();
        } catch (Exception e) {
            android.util.Log.w("OSA_VOICE", "Failed to start MediaPlayer for url=" + url, e);
            startTonePreviewPlayback();
        }
    }

    private void startTonePreviewPlayback() {
        try {
            if (activeToneGenerator == null) {
                activeToneGenerator = new ToneGenerator(AudioManager.STREAM_MUSIC, 65);
            }
            // Gentle double-pip indicating voice message playback start
            activeToneGenerator.startTone(ToneGenerator.TONE_PROP_BEEP2, 200);
        } catch (Exception ignored) {
        }
    }

    private static void releaseToneGenerator() {
        if (activeToneGenerator != null) {
            try {
                activeToneGenerator.stopTone();
                activeToneGenerator.release();
            } catch (Exception ignored) {
            }
            activeToneGenerator = null;
        }
    }

    private void startForegroundIfNeeded() {
        try {
            Notification notification = buildVoiceNotification(
                    this,
                    STATE_PLAYING,
                    elapsedSec,
                    totalSec,
                    activeSenderName,
                    activeChatId,
                    activeSenderId,
                    activeMessageId,
                    activeThreadKey,
                    activeNotificationTag,
                    activeNotificationId,
                    activeAudioUrl,
                    activeDurationStr,
                    activeIsBn
            );

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(
                        activeNotificationId == 0 ? 8888 : activeNotificationId,
                        notification,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
                );
            } else {
                startForeground(activeNotificationId == 0 ? 8888 : activeNotificationId, notification);
            }
        } catch (Exception e) {
            android.util.Log.w("OSA_VOICE", "startForeground failed", e);
        }
    }

    private void requestAudioFocus() {
        try {
            AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (am == null) return;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                AudioAttributes attrs = new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build();
                activeAudioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                        .setAudioAttributes(attrs)
                        .setOnAudioFocusChangeListener(focusChange -> {
                            if (focusChange == AudioManager.AUDIOFOCUS_LOSS
                                    || focusChange == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
                                handlePauseAction(getApplicationContext());
                            }
                        })
                        .build();
                am.requestAudioFocus(activeAudioFocusRequest);
            } else {
                am.requestAudioFocus(
                        focusChange -> {
                            if (focusChange == AudioManager.AUDIOFOCUS_LOSS
                                    || focusChange == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
                                handlePauseAction(getApplicationContext());
                            }
                        },
                        AudioManager.STREAM_MUSIC,
                        AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK
                );
            }
        } catch (Exception ignored) {
        }
    }

    private static void abandonAudioFocus() {
        try {
            Context ctx = activeContextRef;
            if (ctx == null) return;
            AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
            if (am == null) return;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && activeAudioFocusRequest != null) {
                am.abandonAudioFocusRequest(activeAudioFocusRequest);
                activeAudioFocusRequest = null;
            }
        } catch (Exception ignored) {
        }
    }
}
