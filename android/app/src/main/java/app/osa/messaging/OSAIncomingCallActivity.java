package app.osa.messaging;

import android.app.KeyguardManager;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.lang.ref.WeakReference;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Dedicated WhatsApp-Style Native Full-Screen Incoming Call Activity for OSA.
 * - Opens over lock screen and in front of other apps when permitted by Android OS.
 * - Displays Caller Name, Circular Profile Avatar (or initials), and Audio/Video Call type.
 * - Provides prominent Accept and Reject controls that synchronize with OSACallNotificationService,
 *   MainActivity (active WebRTC call screen), and Supabase call state.
 * - Checks Android 14+ (API 34+) full-screen intent permission and provides a direct setting path
 *   if restricted by the OS.
 * - Automatically closes when the call is cancelled, rejected, accepted, or expires.
 */
public class OSAIncomingCallActivity extends AppCompatActivity {
    private static WeakReference<OSAIncomingCallActivity> activeInstanceRef;

    private String callId = "";
    private String callType = "audio";
    private String callerId = "";
    private String callerName = "OSA Caller";
    private String callerAvatar = "";
    private String chatId = "";
    private String rejectToken = "";
    private String rejectEndpoint = "";
    private String anonKey = "";

    private TextView callerNameView;
    private TextView callTypeBadgeView;
    private TextView callSubtitleView;
    private TextView avatarInitialsView;
    private ImageView avatarImageView;
    private LinearLayout fsiWarningBanner;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private ExecutorService backgroundExecutor;
    private boolean actionTaken = false;

    private final Runnable callStateWatchdogRunnable = new Runnable() {
        @Override
        public void run() {
            if (isFinishing() || isDestroyed() || actionTaken) return;
            if (!TextUtils.isEmpty(callId) && !OSACallNotificationService.isCallCurrentlyRinging(callId)) {
                finishCallScreen();
                return;
            }
            checkRemoteCallStatusAsync();
            mainHandler.postDelayed(this, 2000L);
        }
    };

    public static void startFromService(Context context, Intent sourceIntent) {
        if (context == null || sourceIntent == null) return;
        String cid = sourceIntent.getStringExtra("callId");
        if (cid == null || cid.trim().isEmpty()) return;

        try {
            Intent activityIntent = buildLaunchIntent(context, sourceIntent);
            context.startActivity(activityIntent);
        } catch (Exception e) {
            android.util.Log.w("OSA_DIAG", "[OSA_CALL_UI] Direct startActivity blocked or deferred to FullScreenIntent: " + e.getMessage());
        }
    }

    public static Intent buildLaunchIntent(Context context, Intent sourceIntent) {
        Intent intent = new Intent(context, OSAIncomingCallActivity.class);
        intent.addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK
                        | Intent.FLAG_ACTIVITY_SINGLE_TOP
                        | Intent.FLAG_ACTIVITY_CLEAR_TOP
                        | Intent.FLAG_ACTIVITY_NO_USER_ACTION
        );
        if (sourceIntent != null && sourceIntent.getExtras() != null) {
            intent.putExtras(sourceIntent.getExtras());
        }
        return intent;
    }

    public static void finishIfMatchingCall(final String targetCallId) {
        final OSAIncomingCallActivity instance = activeInstanceRef != null ? activeInstanceRef.get() : null;
        if (instance == null) return;
        instance.runOnUiThread(() -> {
            if (targetCallId == null
                    || targetCallId.trim().isEmpty()
                    || targetCallId.trim().equals(instance.callId)) {
                instance.finishCallScreen();
            }
        });
    }

    public static boolean canUseFullScreenIntentOnDevice(Context context) {
        if (context == null) return false;
        if (Build.VERSION.SDK_INT >= 34) {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            return nm != null && nm.canUseFullScreenIntent();
        }
        return true;
    }

    public static void openFullScreenIntentPermissionSettings(Context context) {
        if (context == null) return;
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                Intent intent = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT);
                intent.setData(Uri.parse("package:" + context.getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);
                return;
            }
        } catch (Exception ignored) {
        }
        try {
            Intent fallback = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            fallback.putExtra(Settings.EXTRA_APP_PACKAGE, context.getPackageName());
            fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(fallback);
        } catch (Exception ignored) {
        }
    }

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        configureLockScreenAndWakeFlags();
        activeInstanceRef = new WeakReference<>(this);
        backgroundExecutor = Executors.newCachedThreadPool();

        extractCallExtras(getIntent());
        if (TextUtils.isEmpty(callId)) {
            finishCallScreen();
            return;
        }

        setContentView(buildWhatsAppStyleCallView());
        bindCallDetailsToViews();
        resolveCallerProfileAndAvatarAsync();

        mainHandler.postDelayed(callStateWatchdogRunnable, 1800L);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        extractCallExtras(intent);
        bindCallDetailsToViews();
        resolveCallerProfileAndAvatarAsync();
    }

    @Override
    protected void onResume() {
        super.onResume();
        activeInstanceRef = new WeakReference<>(this);
        if (fsiWarningBanner != null) {
            fsiWarningBanner.setVisibility(canUseFullScreenIntentOnDevice(this) ? View.GONE : View.VISIBLE);
        }
        if (!TextUtils.isEmpty(callId) && OSACallNotificationService.isCallAlreadyHandledOrActive(this, callId)
                && !OSACallNotificationService.isCallCurrentlyRinging(callId)) {
            finishCallScreen();
        }
    }

    private void configureLockScreenAndWakeFlags() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                setShowWhenLocked(true);
                setTurnScreenOn(true);
            }
            getWindow().addFlags(
                    WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                            | WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                            | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                            | WindowManager.LayoutParams.FLAG_ALLOW_LOCK_WHILE_SCREEN_ON
            );
        } catch (Exception ignored) {
        }
    }

    private void extractCallExtras(Intent intent) {
        if (intent == null) return;
        String cid = intent.getStringExtra("callId");
        if (cid != null && !cid.trim().isEmpty()) {
            this.callId = cid.trim();
        }
        String ctype = intent.getStringExtra("callType");
        if (ctype != null && !ctype.trim().isEmpty()) {
            this.callType = ctype.trim().toLowerCase(Locale.US);
        }
        String crId = intent.getStringExtra("callerId");
        if (crId != null && !crId.trim().isEmpty()) {
            this.callerId = crId.trim();
        }
        String crName = intent.getStringExtra("callerName");
        if (crName != null && !crName.trim().isEmpty()) {
            this.callerName = crName.trim();
        }
        String crAvatar = intent.getStringExtra("callerAvatar");
        if (crAvatar != null && !crAvatar.trim().isEmpty()) {
            this.callerAvatar = crAvatar.trim();
        }
        String chId = intent.getStringExtra("chatId");
        if (chId == null || chId.trim().isEmpty()) {
            chId = intent.getStringExtra("conversationId");
        }
        if (chId != null && !chId.trim().isEmpty()) {
            this.chatId = chId.trim();
        }
        String rTok = intent.getStringExtra("rejectToken");
        if (rTok != null) this.rejectToken = rTok.trim();
        String rEp = intent.getStringExtra("rejectEndpoint");
        if (rEp != null) this.rejectEndpoint = rEp.trim();
        String aKey = intent.getStringExtra("anonKey");
        if (aKey != null) this.anonKey = aKey.trim();
    }

    private View buildWhatsAppStyleCallView() {
        FrameLayout root = new FrameLayout(this);
        GradientDrawable bgGradient = new GradientDrawable(
                GradientDrawable.Orientation.TOP_BOTTOM,
                new int[]{
                        Color.parseColor("#0B141A"),
                        Color.parseColor("#111B21"),
                        Color.parseColor("#0A1014")
                }
        );
        root.setBackground(bgGradient);

        LinearLayout mainColumn = new LinearLayout(this);
        mainColumn.setOrientation(LinearLayout.VERTICAL);
        mainColumn.setGravity(Gravity.CENTER_HORIZONTAL);
        mainColumn.setPadding(dp(24), dp(48), dp(24), dp(44));
        root.addView(mainColumn, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        // 1. Encrypted header label
        TextView encryptedLabel = new TextView(this);
        encryptedLabel.setText("End-to-end encrypted");
        encryptedLabel.setTextColor(Color.parseColor("#8696A0"));
        encryptedLabel.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        encryptedLabel.setGravity(Gravity.CENTER);
        mainColumn.addView(encryptedLabel, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        // 2. Call Type Badge (OSA AUDIO CALL / OSA VIDEO CALL)
        callTypeBadgeView = new TextView(this);
        callTypeBadgeView.setTextColor(Color.parseColor("#00A884"));
        callTypeBadgeView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        callTypeBadgeView.setTypeface(Typeface.DEFAULT_BOLD);
        callTypeBadgeView.setGravity(Gravity.CENTER);
        callTypeBadgeView.setPadding(dp(14), dp(6), dp(14), dp(6));
        GradientDrawable badgeBg = new GradientDrawable();
        badgeBg.setColor(Color.parseColor("#142924"));
        badgeBg.setCornerRadius(dp(18));
        badgeBg.setStroke(dp(1), Color.parseColor("#1F5145"));
        callTypeBadgeView.setBackground(badgeBg);
        LinearLayout.LayoutParams badgeParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        badgeParams.topMargin = dp(14);
        mainColumn.addView(callTypeBadgeView, badgeParams);

        // 3. Caller Name
        callerNameView = new TextView(this);
        callerNameView.setTextColor(Color.WHITE);
        callerNameView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 30);
        callerNameView.setTypeface(Typeface.DEFAULT_BOLD);
        callerNameView.setGravity(Gravity.CENTER);
        callerNameView.setMaxLines(2);
        LinearLayout.LayoutParams nameParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        nameParams.topMargin = dp(20);
        mainColumn.addView(callerNameView, nameParams);

        // 4. Incoming Call Subtitle
        callSubtitleView = new TextView(this);
        callSubtitleView.setTextColor(Color.parseColor("#D1D7DB"));
        callSubtitleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        callSubtitleView.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams subParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        subParams.topMargin = dp(8);
        mainColumn.addView(callSubtitleView, subParams);

        // 5. Center Circular Avatar Container with pulsing ring
        FrameLayout avatarCenterWrapper = new FrameLayout(this);
        LinearLayout.LayoutParams centerWrapParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1.0f
        );
        mainColumn.addView(avatarCenterWrapper, centerWrapParams);

        FrameLayout outerRing = new FrameLayout(this);
        GradientDrawable outerRingDrawable = new GradientDrawable();
        outerRingDrawable.setShape(GradientDrawable.OVAL);
        outerRingDrawable.setColor(Color.parseColor("#132824"));
        outerRingDrawable.setStroke(dp(2), Color.parseColor("#00A884"));
        outerRing.setBackground(outerRingDrawable);
        FrameLayout.LayoutParams outerRingParams = new FrameLayout.LayoutParams(dp(156), dp(156));
        outerRingParams.gravity = Gravity.CENTER;
        avatarCenterWrapper.addView(outerRing, outerRingParams);

        FrameLayout avatarCircle = new FrameLayout(this);
        GradientDrawable avatarBg = new GradientDrawable();
        avatarBg.setShape(GradientDrawable.OVAL);
        avatarBg.setColor(Color.parseColor("#005C4B"));
        avatarCircle.setBackground(avatarBg);
        FrameLayout.LayoutParams avatarParams = new FrameLayout.LayoutParams(dp(136), dp(136));
        avatarParams.gravity = Gravity.CENTER;
        outerRing.addView(avatarCircle, avatarParams);

        avatarInitialsView = new TextView(this);
        avatarInitialsView.setTextColor(Color.WHITE);
        avatarInitialsView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 44);
        avatarInitialsView.setTypeface(Typeface.DEFAULT_BOLD);
        avatarInitialsView.setGravity(Gravity.CENTER);
        avatarCircle.addView(avatarInitialsView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        avatarImageView = new ImageView(this);
        avatarImageView.setScaleType(ImageView.ScaleType.CENTER_CROP);
        avatarImageView.setVisibility(View.GONE);
        avatarCircle.addView(avatarImageView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        // 6. Optional Android 14+ Full-Screen Intent permission notice banner (only shown if restricted)
        fsiWarningBanner = new LinearLayout(this);
        fsiWarningBanner.setOrientation(LinearLayout.VERTICAL);
        fsiWarningBanner.setGravity(Gravity.CENTER);
        fsiWarningBanner.setPadding(dp(14), dp(10), dp(14), dp(10));
        GradientDrawable warnBg = new GradientDrawable();
        warnBg.setColor(Color.parseColor("#2A1E17"));
        warnBg.setCornerRadius(dp(12));
        warnBg.setStroke(dp(1), Color.parseColor("#F59E0B"));
        fsiWarningBanner.setBackground(warnBg);
        fsiWarningBanner.setVisibility(canUseFullScreenIntentOnDevice(this) ? View.GONE : View.VISIBLE);

        TextView warnText = new TextView(this);
        warnText.setText("Allow full-screen call alerts in Android Settings so calls always appear over lock screen.");
        warnText.setTextColor(Color.parseColor("#FDE68A"));
        warnText.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        warnText.setGravity(Gravity.CENTER);
        fsiWarningBanner.addView(warnText);

        TextView warnAction = new TextView(this);
        warnAction.setText("Enable Full-Screen Call Access");
        warnAction.setTextColor(Color.parseColor("#34D399"));
        warnAction.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        warnAction.setTypeface(Typeface.DEFAULT_BOLD);
        warnAction.setPadding(0, dp(6), 0, 0);
        warnAction.setOnClickListener(v -> openFullScreenIntentPermissionSettings(OSAIncomingCallActivity.this));
        fsiWarningBanner.addView(warnAction);

        LinearLayout.LayoutParams warnParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        warnParams.bottomMargin = dp(20);
        mainColumn.addView(fsiWarningBanner, warnParams);

        // 7. Bottom Row: Prominent Reject (Red) and Accept (Green) Controls
        LinearLayout actionsRow = new LinearLayout(this);
        actionsRow.setOrientation(LinearLayout.HORIZONTAL);
        actionsRow.setGravity(Gravity.CENTER);
        actionsRow.setWeightSum(2.0f);
        LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        rowParams.bottomMargin = dp(12);
        mainColumn.addView(actionsRow, rowParams);

        // Left: Reject Button Column
        LinearLayout rejectCol = buildActionButtonColumn(
                "Reject",
                Color.parseColor("#EA0038"),
                android.R.drawable.sym_call_missed,
                v -> onRejectCallClicked()
        );
        actionsRow.addView(rejectCol, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1.0f));

        // Right: Accept Button Column
        boolean isVideo = "video".equalsIgnoreCase(callType);
        int acceptIconRes = isVideo
                ? android.R.drawable.presence_video_online
                : android.R.drawable.sym_call_incoming;
        LinearLayout acceptCol = buildActionButtonColumn(
                "Accept",
                Color.parseColor("#00A884"),
                acceptIconRes,
                v -> onAcceptCallClicked()
        );
        actionsRow.addView(acceptCol, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1.0f));

        return root;
    }

    private LinearLayout buildActionButtonColumn(
            String labelText,
            int circleColor,
            int iconResId,
            View.OnClickListener clickListener
    ) {
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER_HORIZONTAL);

        FrameLayout circleBtn = new FrameLayout(this);
        GradientDrawable circleBg = new GradientDrawable();
        circleBg.setShape(GradientDrawable.OVAL);
        circleBg.setColor(circleColor);
        circleBtn.setBackground(circleBg);
        circleBtn.setElevation(dp(8));
        circleBtn.setClickable(true);
        circleBtn.setFocusable(true);
        circleBtn.setContentDescription(labelText);
        circleBtn.setOnClickListener(clickListener);

        ImageView icon = new ImageView(this);
        icon.setImageResource(iconResId);
        icon.setColorFilter(Color.WHITE);
        FrameLayout.LayoutParams iconParams = new FrameLayout.LayoutParams(dp(34), dp(34));
        iconParams.gravity = Gravity.CENTER;
        circleBtn.addView(icon, iconParams);

        col.addView(circleBtn, new LinearLayout.LayoutParams(dp(76), dp(76)));

        TextView label = new TextView(this);
        label.setText(labelText);
        label.setTextColor(Color.WHITE);
        label.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        label.setTypeface(Typeface.DEFAULT_BOLD);
        label.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams labelParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        labelParams.topMargin = dp(12);
        col.addView(label, labelParams);

        return col;
    }

    private void bindCallDetailsToViews() {
        boolean isVideo = "video".equalsIgnoreCase(callType);
        if (callTypeBadgeView != null) {
            callTypeBadgeView.setText(isVideo ? "OSA VIDEO CALL" : "OSA AUDIO CALL");
        }
        String displayCaller = !TextUtils.isEmpty(callerName) ? callerName : "OSA Caller";
        if (callerNameView != null) {
            callerNameView.setText(displayCaller);
        }
        if (callSubtitleView != null) {
            callSubtitleView.setText(isVideo ? "Incoming video call..." : "Incoming audio call...");
        }
        if (avatarInitialsView != null) {
            avatarInitialsView.setText(extractInitials(displayCaller));
        }
    }

    private String extractInitials(String name) {
        if (name == null || name.trim().isEmpty()) return "O";
        String[] parts = name.trim().split("\\s+");
        if (parts.length >= 2 && !parts[0].isEmpty() && !parts[1].isEmpty()) {
            return ("" + parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase(Locale.US);
        }
        return ("" + name.trim().charAt(0)).toUpperCase(Locale.US);
    }

    private void onAcceptCallClicked() {
        if (actionTaken) return;
        actionTaken = true;
        mainHandler.removeCallbacksAndMessages(null);

        boolean isVideo = "video".equalsIgnoreCase(callType);
        if (!isVideo) {
            Intent bgAcceptIntent = new Intent();
            bgAcceptIntent.putExtra("callId", callId);
            bgAcceptIntent.putExtra("callType", "audio");
            bgAcceptIntent.putExtra("callerId", callerId);
            bgAcceptIntent.putExtra("callerName", callerName);
            bgAcceptIntent.putExtra("callerAvatar", callerAvatar);
            bgAcceptIntent.putExtra("chatId", chatId);
            OSACallNotificationService.acceptIncomingAudioCallInBackground(getApplicationContext(), bgAcceptIntent);
            finishCallScreen();
            return;
        }

        // Video call: transition notification to Ongoing Call and open MainActivity video call screen
        OSACallNotificationService.startOngoingCallNotification(
                this,
                callId,
                callType,
                callerId,
                callerName,
                chatId
        );

        // Dismiss keyguard if possible so transition into active call is seamless
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
                if (km != null && km.isKeyguardLocked()) {
                    km.requestDismissKeyguard(this, null);
                }
            }
        } catch (Exception ignored) {
        }

        Intent acceptIntent = new Intent(this, MainActivity.class);
        acceptIntent.setAction("app.osa.messaging.ACTION_ACCEPT_CALL_UI_" + callId);
        acceptIntent.addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK
                        | Intent.FLAG_ACTIVITY_SINGLE_TOP
                        | Intent.FLAG_ACTIVITY_CLEAR_TOP
        );
        acceptIntent.putExtra("callId", callId);
        acceptIntent.putExtra("callType", callType);
        acceptIntent.putExtra("callerId", callerId);
        acceptIntent.putExtra("callerName", callerName);
        acceptIntent.putExtra("callerAvatar", callerAvatar);
        acceptIntent.putExtra("chatId", chatId);
        acceptIntent.putExtra("callAction", "accept");
        startActivity(acceptIntent);
        finishCallScreen();
    }

    private void onRejectCallClicked() {
        if (actionTaken) return;
        actionTaken = true;
        mainHandler.removeCallbacksAndMessages(null);

        Intent rejectIntent = new Intent(this, OSACallActionReceiver.class);
        rejectIntent.setAction(OSACallActionReceiver.ACTION_REJECT_CALL);
        rejectIntent.putExtra("callId", callId);
        rejectIntent.putExtra("callType", callType);
        rejectIntent.putExtra("callerId", callerId);
        rejectIntent.putExtra("callerName", callerName);
        rejectIntent.putExtra("chatId", chatId);
        rejectIntent.putExtra("rejectToken", rejectToken);
        rejectIntent.putExtra("rejectEndpoint", rejectEndpoint);
        rejectIntent.putExtra("anonKey", anonKey);

        OSACallActionReceiver.handleRejectCallIntent(getApplicationContext(), rejectIntent);
        finishCallScreen();
    }

    private void resolveCallerProfileAndAvatarAsync() {
        if (backgroundExecutor == null || backgroundExecutor.isShutdown()) return;
        backgroundExecutor.execute(() -> {
            try {
                String avatarUrlToLoad = callerAvatar;
                SharedPreferences prefs = getSharedPreferences(OSAFirebaseMessagingService.PREFS_NAME, MODE_PRIVATE);
                String supabaseUrl = prefs.getString("auth_supabase_url", "");
                String storedAnonKey = prefs.getString("auth_anon_key", anonKey);
                String accessToken = prefs.getString("auth_access_token", "");

                if (!TextUtils.isEmpty(callerId)
                        && !TextUtils.isEmpty(supabaseUrl)
                        && !TextUtils.isEmpty(storedAnonKey)
                        && (TextUtils.isEmpty(avatarUrlToLoad)
                                || "OSA Caller".equalsIgnoreCase(callerName)
                                || "OSA User".equalsIgnoreCase(callerName))) {
                    String profileUrl = supabaseUrl
                            + "/rest/v1/profiles?id=eq." + URLEncoder.encode(callerId, "UTF-8")
                            + "&select=full_name,avatar_url&limit=1";
                    HttpURLConnection conn = (HttpURLConnection) new URL(profileUrl).openConnection();
                    conn.setConnectTimeout(5000);
                    conn.setReadTimeout(5000);
                    conn.setRequestMethod("GET");
                    conn.setRequestProperty("Accept", "application/json");
                    conn.setRequestProperty("apikey", storedAnonKey);
                    conn.setRequestProperty(
                            "Authorization",
                            "Bearer " + (!TextUtils.isEmpty(accessToken) ? accessToken : storedAnonKey)
                    );
                    if (conn.getResponseCode() >= 200 && conn.getResponseCode() < 300) {
                        BufferedReader reader = new BufferedReader(
                                new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8)
                        );
                        StringBuilder sb = new StringBuilder();
                        String line;
                        while ((line = reader.readLine()) != null) {
                            sb.append(line);
                        }
                        reader.close();
                        JSONArray arr = new JSONArray(sb.toString());
                        if (arr.length() > 0) {
                            JSONObject obj = arr.optJSONObject(0);
                            if (obj != null) {
                                final String dbName = obj.optString("full_name", "").trim();
                                final String dbAvatar = obj.isNull("avatar_url")
                                        ? ""
                                        : obj.optString("avatar_url", "").trim();
                                if (!dbName.isEmpty()) {
                                    callerName = dbName;
                                    runOnUiThread(this::bindCallDetailsToViews);
                                }
                                if (!dbAvatar.isEmpty() && TextUtils.isEmpty(avatarUrlToLoad)) {
                                    avatarUrlToLoad = dbAvatar;
                                    callerAvatar = dbAvatar;
                                }
                            }
                        }
                    }
                    conn.disconnect();
                }

                if (!TextUtils.isEmpty(avatarUrlToLoad)
                        && (avatarUrlToLoad.startsWith("http://") || avatarUrlToLoad.startsWith("https://"))) {
                    HttpURLConnection imgConn = (HttpURLConnection) new URL(avatarUrlToLoad).openConnection();
                    imgConn.setConnectTimeout(6000);
                    imgConn.setReadTimeout(6000);
                    imgConn.setDoInput(true);
                    if (imgConn.getResponseCode() >= 200 && imgConn.getResponseCode() < 300) {
                        InputStream is = imgConn.getInputStream();
                        Bitmap rawBitmap = BitmapFactory.decodeStream(is);
                        is.close();
                        if (rawBitmap != null) {
                            final Bitmap circularBitmap = createCircularBitmap(rawBitmap);
                            runOnUiThread(() -> {
                                if (avatarImageView != null && circularBitmap != null) {
                                    avatarImageView.setImageBitmap(circularBitmap);
                                    avatarImageView.setVisibility(View.VISIBLE);
                                    if (avatarInitialsView != null) {
                                        avatarInitialsView.setVisibility(View.GONE);
                                    }
                                }
                            });
                        }
                    }
                    imgConn.disconnect();
                }
            } catch (Exception ignored) {
            }
        });
    }

    private void checkRemoteCallStatusAsync() {
        if (TextUtils.isEmpty(callId) || backgroundExecutor == null || backgroundExecutor.isShutdown()) return;
        backgroundExecutor.execute(() -> {
            try {
                SharedPreferences prefs = getSharedPreferences(OSAFirebaseMessagingService.PREFS_NAME, MODE_PRIVATE);
                String supabaseUrl = prefs.getString("auth_supabase_url", "");
                String storedAnonKey = prefs.getString("auth_anon_key", anonKey);
                String accessToken = prefs.getString("auth_access_token", "");
                if (TextUtils.isEmpty(supabaseUrl) || TextUtils.isEmpty(storedAnonKey) || TextUtils.isEmpty(accessToken)) {
                    return;
                }

                String url = supabaseUrl
                        + "/rest/v1/calls?id=eq." + URLEncoder.encode(callId, "UTF-8")
                        + "&select=status&limit=1";
                HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setConnectTimeout(4500);
                conn.setReadTimeout(4500);
                conn.setRequestMethod("GET");
                conn.setRequestProperty("Accept", "application/json");
                conn.setRequestProperty("apikey", storedAnonKey);
                conn.setRequestProperty("Authorization", "Bearer " + accessToken);

                if (conn.getResponseCode() >= 200 && conn.getResponseCode() < 300) {
                    BufferedReader reader = new BufferedReader(
                            new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8)
                    );
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null) {
                        sb.append(line);
                    }
                    reader.close();
                    JSONArray arr = new JSONArray(sb.toString());
                    if (arr.length() > 0) {
                        JSONObject row = arr.optJSONObject(0);
                        String st = row != null ? row.optString("status", "").trim().toLowerCase(Locale.US) : "";
                        if ("ended".equals(st)
                                || "missed".equals(st)
                                || "rejected".equals(st)
                                || "cancelled".equals(st)
                                || "failed".equals(st)) {
                            OSACallNotificationService.stopCallNotification(getApplicationContext(), callId);
                            runOnUiThread(this::finishCallScreen);
                        } else if ("accepted".equals(st) || "connected".equals(st)) {
                            if (!OSACallNotificationService.isCallCurrentlyOngoing(callId)) {
                                OSACallNotificationService.stopCallNotification(getApplicationContext(), callId);
                            }
                            runOnUiThread(this::finishCallScreen);
                        }
                    }
                }
                conn.disconnect();
            } catch (Exception ignored) {
            }
        });
    }

    private Bitmap createCircularBitmap(Bitmap src) {
        int size = Math.min(src.getWidth(), src.getHeight());
        int x = (src.getWidth() - size) / 2;
        int y = (src.getHeight() - size) / 2;
        Bitmap squared = Bitmap.createBitmap(src, x, y, size, size);
        Bitmap output = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(output);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setShader(new BitmapShader(squared, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP));
        float r = size / 2f;
        canvas.drawCircle(r, r, r, paint);
        return output;
    }

    private void finishCallScreen() {
        mainHandler.removeCallbacksAndMessages(null);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                finishAndRemoveTask();
            } else {
                finish();
            }
        } catch (Exception e) {
            finish();
        }
    }

    @Override
    protected void onDestroy() {
        mainHandler.removeCallbacksAndMessages(null);
        if (backgroundExecutor != null) {
            backgroundExecutor.shutdownNow();
        }
        OSAIncomingCallActivity current = activeInstanceRef != null ? activeInstanceRef.get() : null;
        if (current == this) {
            activeInstanceRef = null;
        }
        super.onDestroy();
    }

    private int dp(int value) {
        return Math.round(
                TypedValue.applyDimension(
                        TypedValue.COMPLEX_UNIT_DIP,
                        value,
                        getResources().getDisplayMetrics()
                )
        );
    }
}
