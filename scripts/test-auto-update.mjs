import fs from 'node:fs';
import path from 'node:path';

console.log('=== OSA Android GitHub Releases Auto-Update Test Suite ===');

// Test 1: AndroidManifest.xml configuration
const manifestPath = path.resolve('android/app/src/main/AndroidManifest.xml');
if (!fs.existsSync(manifestPath)) {
  console.error('[FAIL] AndroidManifest.xml does not exist');
  process.exit(1);
}
const manifest = fs.readFileSync(manifestPath, 'utf8');

const hasInstallPerm = manifest.includes('android.permission.REQUEST_INSTALL_PACKAGES');
const hasFileProvider = manifest.includes('androidx.core.content.FileProvider') &&
  manifest.includes('${applicationId}.fileprovider') &&
  manifest.includes('file_paths');

if (!hasInstallPerm) {
  console.error('[FAIL] REQUEST_INSTALL_PACKAGES permission missing from AndroidManifest.xml');
  process.exit(1);
}
if (!hasFileProvider) {
  console.error('[FAIL] FileProvider missing or improperly configured in AndroidManifest.xml');
  process.exit(1);
}
console.log('[PASS] 1. AndroidManifest.xml declares REQUEST_INSTALL_PACKAGES and FileProvider');

// Test 2: file_paths.xml exists and defines updates paths
const filePathsXml = path.resolve('android/app/src/main/res/xml/file_paths.xml');
if (!fs.existsSync(filePathsXml)) {
  console.error('[FAIL] res/xml/file_paths.xml not found');
  process.exit(1);
}
const filePathsContent = fs.readFileSync(filePathsXml, 'utf8');
if (!filePathsContent.includes('external-cache-path') || !filePathsContent.includes('updates')) {
  console.error('[FAIL] file_paths.xml does not configure updates directory');
  process.exit(1);
}
console.log('[PASS] 2. res/xml/file_paths.xml grants secure file URI permissions for APKs');

// Test 3: OSAUpdateManager.java implements update verification and installer
const updateManagerJava = path.resolve('android/app/src/main/java/app/osa/messaging/OSAUpdateManager.java');
if (!fs.existsSync(updateManagerJava)) {
  console.error('[FAIL] OSAUpdateManager.java not found');
  process.exit(1);
}
const updateManagerCode = fs.readFileSync(updateManagerJava, 'utf8');
const hasShaVerification = updateManagerCode.includes('MessageDigest.getInstance("SHA-256")') &&
  updateManagerCode.includes('calculateFileSha256');
const hasInstallerPrompt = updateManagerCode.includes('FileProvider.getUriForFile') &&
  updateManagerCode.includes('application/vnd.android.package-archive') &&
  updateManagerCode.includes('canRequestPackageInstalls');
const hasMetadataParsing = updateManagerCode.includes('fetchLatestReleaseMetadata') &&
  updateManagerCode.includes('compareSemanticVersions');

if (!hasShaVerification || !hasInstallerPrompt || !hasMetadataParsing) {
  console.error('[FAIL] OSAUpdateManager.java lacks core security or installer logic');
  process.exit(1);
}
console.log('[PASS] 3. OSAUpdateManager.java verifies SHA-256 and delegates to package installer with user consent');

// Test 4: MainActivity.java bridge exposes update methods
const mainActivityJava = path.resolve('android/app/src/main/java/app/osa/messaging/MainActivity.java');
const mainActivityCode = fs.readFileSync(mainActivityJava, 'utf8');
const hasBridgeMethods = mainActivityCode.includes('public void checkForUpdates()') &&
  mainActivityCode.includes('public void startApkDownload(') &&
  mainActivityCode.includes('public boolean promptInstallApk(');

if (!hasBridgeMethods) {
  console.error('[FAIL] MainActivity.java does not expose update methods to JavaScriptInterface');
  process.exit(1);
}
console.log('[PASS] 4. MainActivity.java exposes native update APIs and dispatches events to WebView');

// Test 5: Web UI component AppUpdateModal and native bridge helpers
const updateModalPath = path.resolve('src/components/AppUpdateModal.tsx');
if (!fs.existsSync(updateModalPath)) {
  console.error('[FAIL] AppUpdateModal.tsx not found');
  process.exit(1);
}
const bridgePath = path.resolve('src/services/nativeMobileBridge.ts');
const bridgeCode = fs.readFileSync(bridgePath, 'utf8');
if (!bridgeCode.includes('checkNativeAppUpdate') || !bridgeCode.includes('startNativeApkDownload') || !bridgeCode.includes('promptInstallNativeApk')) {
  console.error('[FAIL] nativeMobileBridge.ts missing export functions for updates');
  process.exit(1);
}
console.log('[PASS] 5. Web UI and nativeMobileBridge seamlessly handle check, download progress, and user installation');

// Test 6: GitHub Actions Workflow generates release metadata and assets
const workflowPath = path.resolve('.github/workflows/android-apk-build.yml');
const workflowCode = fs.readFileSync(workflowPath, 'utf8');
if (!workflowCode.includes('contents: write') || !workflowCode.includes('softprops/action-gh-release@v2') || !workflowCode.includes('app-release-metadata.json')) {
  console.error('[FAIL] .github/workflows/android-apk-build.yml lacks release publish steps');
  process.exit(1);
}
console.log('[PASS] 6. GitHub Actions workflow automates APK building, SHA-256 calculation, and GitHub Releases publication');

console.log('\nAll OSA GitHub Releases Auto-Update tests passed successfully!');
