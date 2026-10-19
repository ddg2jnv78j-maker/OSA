package app.osa.messaging;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import androidx.core.content.FileProvider;
import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * OSA Android Auto-Update Manager.
 * Checks for stable releases from GitHub Releases API or static release metadata,
 * verifies SHA-256 checksums, downloads securely, and prompts the Android package installer.
 * No private secrets or tokens are embedded.
 */
public class OSAUpdateManager {

    public static final String GITHUB_RELEASES_URL = "https://api.github.com/repos/ddg2jnv78j-maker/OSA/releases/latest";
    public static final String STATIC_METADATA_URL = "https://osa-chat.com/app-release-metadata.json";

    public interface UpdateCheckCallback {
        void onResult(boolean success, boolean updateAvailable, String infoJson, String errorMessage);
    }

    public interface DownloadProgressCallback {
        void onProgress(int percent, long downloadedBytes, long totalBytes);
        void onComplete(boolean success, String apkFilePath, String errorMessage);
    }

    public static int getCurrentVersionCode(Context context) {
        try {
            PackageManager pm = context.getPackageManager();
            PackageInfo pInfo = pm.getPackageInfo(context.getPackageName(), 0);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                return (int) pInfo.getLongVersionCode();
            } else {
                return pInfo.versionCode;
            }
        } catch (Exception e) {
            return 1;
        }
    }

    public static String getCurrentVersionName(Context context) {
        try {
            PackageManager pm = context.getPackageManager();
            PackageInfo pInfo = pm.getPackageInfo(context.getPackageName(), 0);
            return pInfo.versionName != null ? pInfo.versionName : "1.0.0";
        } catch (Exception e) {
            return "1.0.0";
        }
    }

    public static void checkForUpdatesAsync(final Context context, final UpdateCheckCallback callback) {
        new Thread(() -> {
            try {
                JSONObject releaseData = fetchLatestReleaseMetadata();
                if (releaseData == null) {
                    if (callback != null) {
                        callback.onResult(false, false, null, "Could not fetch release metadata from GitHub or site");
                    }
                    return;
                }

                int currentCode = getCurrentVersionCode(context);
                int remoteCode = releaseData.optInt("versionCode", 0);
                String remoteVersionName = releaseData.optString("versionName", "");

                // Check version difference
                boolean isNewer = remoteCode > currentCode;
                if (!isNewer && !remoteVersionName.isEmpty()) {
                    String currentName = getCurrentVersionName(context);
                    if (compareSemanticVersions(remoteVersionName, currentName) > 0) {
                        isNewer = true;
                    }
                }

                JSONObject resultObj = new JSONObject();
                resultObj.put("updateAvailable", isNewer);
                resultObj.put("currentVersionCode", currentCode);
                resultObj.put("currentVersionName", getCurrentVersionName(context));
                resultObj.put("versionCode", remoteCode);
                resultObj.put("versionName", remoteVersionName);
                resultObj.put("apkUrl", releaseData.optString("apkUrl", ""));
                resultObj.put("sha256", releaseData.optString("sha256", ""));
                resultObj.put("releaseNotes", releaseData.optString("releaseNotes", ""));
                resultObj.put("publishedAt", releaseData.optString("publishedAt", ""));

                if (callback != null) {
                    callback.onResult(true, isNewer, resultObj.toString(), null);
                }
            } catch (Exception e) {
                if (callback != null) {
                    callback.onResult(false, false, null, e.getMessage());
                }
            }
        }).start();
    }

    private static JSONObject fetchLatestReleaseMetadata() {
        // Attempt 2: Fetch from GitHub Releases API
        try {
            String ghJson = fetchUrlString(GITHUB_RELEASES_URL, 8000);
            if (ghJson != null && !ghJson.trim().isEmpty()) {
                JSONObject ghObj = new JSONObject(ghJson);
                String tagName = ghObj.optString("tag_name", "").replaceFirst("^v", "");
                String body = ghObj.optString("body", "");
                String publishedAt = ghObj.optString("published_at", "");

                String apkUrl = "";
                long apkSize = 0;
                JSONArray assets = ghObj.optJSONArray("assets");
                if (assets != null) {
                    for (int i = 0; i < assets.length(); i++) {
                        JSONObject asset = assets.getJSONObject(i);
                        String name = asset.optString("name", "");
                        if (name.endsWith(".apk")) {
                            apkUrl = asset.optString("browser_download_url", "");
                            apkSize = asset.optLong("size", 0);
                            break;
                        }
                    }
                }

                // Extract SHA-256 and versionCode from release notes body if documented
                String sha256 = "";
                int versionCode = parseVersionCodeFromNotes(body, tagName);
                if (body != null) {
                    java.util.regex.Matcher mSha = java.util.regex.Pattern.compile("(?i)sha-?256[:\\s=]+([a-f0-9]{64})").matcher(body);
                    if (mSha.find()) {
                        sha256 = mSha.group(1).toLowerCase();
                    }
                }

                if (!apkUrl.isEmpty()) {
                    JSONObject parsed = new JSONObject();
                    parsed.put("versionName", tagName.isEmpty() ? "1.0.0" : tagName);
                    parsed.put("versionCode", versionCode);
                    parsed.put("apkUrl", apkUrl);
                    parsed.put("apkSize", apkSize);
                    parsed.put("sha256", sha256);
                    parsed.put("releaseNotes", body);
                    parsed.put("publishedAt", publishedAt);
                    return parsed;
                }
            }
        } catch (Exception ignored) {
        }

        // Fallback only: use site metadata if GitHub Releases API is unavailable.
        // GitHub is checked first so stale website metadata cannot mask a newer release.
        try {
            String jsonStr = fetchUrlString(STATIC_METADATA_URL, 6000);
            if (jsonStr != null && !jsonStr.trim().isEmpty()) {
                JSONObject obj = new JSONObject(jsonStr);
                String apkUrl = obj.optString("apkUrl", "");
                String sha256 = obj.optString("sha256", "");
                if (apkUrl.startsWith("https://") && sha256.matches("(?i)[a-f0-9]{64}")) {
                    return obj;
                }
            }
        } catch (Exception ignored) {
        }

        return null;
    }

    private static int parseVersionCodeFromNotes(String body, String tagName) {
        if (body != null) {
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("(?i)versionCode[:\\s=]+([0-9]+)").matcher(body);
            if (m.find()) {
                try {
                    return Integer.parseInt(m.group(1));
                } catch (Exception ignored) {
                }
            }
        }
        // Fallback: semantic version to code (e.g. 1.0.2 -> 10002)
        try {
            String[] parts = tagName.split("\\.");
            if (parts.length >= 3) {
                return Integer.parseInt(parts[0]) * 10000 + Integer.parseInt(parts[1]) * 100 + Integer.parseInt(parts[2]);
            }
        } catch (Exception ignored) {
        }
        return 1;
    }

    private static int compareSemanticVersions(String v1, String v2) {
        try {
            String[] p1 = v1.replaceFirst("^v", "").split("[.-]");
            String[] p2 = v2.replaceFirst("^v", "").split("[.-]");
            int maxLen = Math.max(p1.length, p2.length);
            for (int i = 0; i < maxLen; i++) {
                int num1 = i < p1.length ? Integer.parseInt(p1[i].replaceAll("\\D", "")) : 0;
                int num2 = i < p2.length ? Integer.parseInt(p2[i].replaceAll("\\D", "")) : 0;
                if (num1 != num2) {
                    return Integer.compare(num1, num2);
                }
            }
        } catch (Exception ignored) {
        }
        return 0;
    }

    public static void downloadAndVerifyApkAsync(
            final Context context,
            final String apkUrl,
            final String expectedSha256,
            final DownloadProgressCallback callback
    ) {
        new Thread(() -> {
            File outFile = null;
            try {
                if (apkUrl == null || !apkUrl.startsWith("https://")) {
                    if (callback != null) {
                        callback.onComplete(false, null, "Invalid download URL. HTTPS required.");
                    }
                    return;
                }

                if (expectedSha256 == null || !expectedSha256.trim().matches("(?i)[a-f0-9]{64}")) {
                    if (callback != null) callback.onComplete(false, null, "Missing or invalid SHA-256 checksum. Update blocked for safety.");
                    return;
                }

                File updateDir = new File(context.getCacheDir(), "updates");
                if (!updateDir.exists()) {
                    updateDir.mkdirs();
                }

                outFile = new File(updateDir, "osa-update.apk");
                if (outFile.exists()) {
                    outFile.delete();
                }

                URL url = new URL(apkUrl);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestProperty("User-Agent", "OSA-Android-Updater/1.0");
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(30000);
                conn.setInstanceFollowRedirects(true);
                conn.connect();

                int responseCode = conn.getResponseCode();
                if (responseCode == HttpURLConnection.HTTP_MOVED_TEMP ||
                    responseCode == HttpURLConnection.HTTP_MOVED_PERM ||
                    responseCode == 307 || responseCode == 308) {
                    String redirectUrl = conn.getHeaderField("Location");
                    if (redirectUrl != null) {
                        conn.disconnect();
                        url = new URL(redirectUrl);
                        conn = (HttpURLConnection) url.openConnection();
                        conn.setRequestProperty("User-Agent", "OSA-Android-Updater/1.0");
                        conn.setConnectTimeout(15000);
                        conn.setReadTimeout(30000);
                        conn.connect();
                    }
                }

                int finalResponseCode = conn.getResponseCode();
                if (finalResponseCode != HttpURLConnection.HTTP_OK || !conn.getURL().getProtocol().equalsIgnoreCase("https")) {
                    conn.disconnect();
                    throw new java.io.IOException("Download server returned HTTP " + finalResponseCode + " or an insecure redirect.");
                }

                long totalBytes = conn.getContentLength();
                InputStream in = new BufferedInputStream(conn.getInputStream());
                FileOutputStream out = new FileOutputStream(outFile);

                byte[] buffer = new byte[8192];
                long downloadedBytes = 0;
                int bytesRead;
                int lastReportedPercent = -1;

                while ((bytesRead = in.read(buffer)) != -1) {
                    out.write(buffer, 0, bytesRead);
                    downloadedBytes += bytesRead;
                    if (totalBytes > 0 && callback != null) {
                        int percent = (int) ((downloadedBytes * 100) / totalBytes);
                        if (percent != lastReportedPercent) {
                            lastReportedPercent = percent;
                            callback.onProgress(percent, downloadedBytes, totalBytes);
                        }
                    }
                }

                out.flush();
                out.close();
                in.close();
                conn.disconnect();

                // SHA-256 is mandatory: never install an unverified APK.
                {
                    String actualSha256 = calculateFileSha256(outFile);
                    if (!expectedSha256.trim().equalsIgnoreCase(actualSha256)) {
                        outFile.delete();
                        if (callback != null) {
                            callback.onComplete(
                                    false,
                                    null,
                                    "Checksum verification failed! Expected: " + expectedSha256 + ", got: " + actualSha256
                            );
                        }
                        return;
                    }
                }

                if (callback != null) {
                    callback.onComplete(true, outFile.getAbsolutePath(), null);
                }

            } catch (Exception e) {
                if (outFile != null && outFile.exists()) {
                    outFile.delete();
                }
                if (callback != null) {
                    callback.onComplete(false, null, "Download failed: " + e.getMessage());
                }
            }
        }).start();
    }

    public static boolean promptInstallApk(Context context, String apkFilePath) {
        try {
            if (apkFilePath == null || apkFilePath.trim().isEmpty()) return false;
            File apkFile = new File(apkFilePath);
            if (!apkFile.exists()) return false;

            // Check unknown app sources permission on Android 8.0+
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (!context.getPackageManager().canRequestPackageInstalls()) {
                    Intent settingsIntent = new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES_SPECIFIC_APPS_OPS);
                    settingsIntent.setData(Uri.parse("package:" + context.getPackageName()));
                    settingsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    context.startActivity(settingsIntent);
                    return false;
                }
            }

            Uri apkUri = FileProvider.getUriForFile(
                    context,
                    context.getPackageName() + ".fileprovider",
                    apkFile
            );

            Intent installIntent = new Intent(Intent.ACTION_VIEW);
            installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(installIntent);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    public static String calculateFileSha256(File file) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            FileInputStream fis = new FileInputStream(file);
            byte[] byteArray = new byte[8192];
            int bytesCount;
            while ((bytesCount = fis.read(byteArray)) != -1) {
                digest.update(byteArray, 0, bytesCount);
            }
            fis.close();
            byte[] bytes = digest.digest();
            StringBuilder sb = new StringBuilder();
            for (byte b : bytes) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception e) {
            return "";
        }
    }

    private static String fetchUrlString(String urlStr, int timeoutMs) throws Exception {
        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestProperty("User-Agent", "OSA-Android-Updater/1.0");
        conn.setRequestProperty("Accept", "application/vnd.github+json, application/json");
        conn.setConnectTimeout(timeoutMs);
        conn.setReadTimeout(timeoutMs);
        conn.connect();

        if (conn.getResponseCode() != 200) {
            conn.disconnect();
            return null;
        }

        InputStream in = conn.getInputStream();
        byte[] buffer = new byte[4096];
        int read;
        StringBuilder sb = new StringBuilder();
        while ((read = in.read(buffer)) != -1) {
            sb.append(new String(buffer, 0, read, java.nio.charset.StandardCharsets.UTF_8));
        }
        in.close();
        conn.disconnect();
        return sb.toString();
    }
}
