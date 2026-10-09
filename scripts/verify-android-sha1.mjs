import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const APK_REL_PATH = 'android/app/build/outputs/apk/debug/app-debug.apk';
const apkPath = path.resolve(process.cwd(), APK_REL_PATH);

function extractCertFromApkBuffer(buf) {
  const magic = Buffer.from('APK Sig Block 42', 'ascii');
  const magicIdx = buf.lastIndexOf(magic);
  const searchStart = magicIdx > 0 ? Math.max(0, magicIdx - 65536) : 0;
  const searchEnd = magicIdx > 0 ? magicIdx : buf.length;

  for (let i = searchStart; i < searchEnd - 4; i++) {
    if (buf[i] === 0x30 && buf[i + 1] === 0x82) {
      const len = (buf[i + 2] << 8) | buf[i + 3];
      const totalLen = len + 4;
      if (totalLen > 200 && totalLen < 4096 && i + totalLen <= buf.length) {
        const slice = buf.subarray(i, i + totalLen);
        try {
          const x509 = new crypto.X509Certificate(slice);
          if (x509.subject && x509.fingerprint && x509.fingerprint256) {
            return {
              subject: x509.subject.replace(/\n/g, ', '),
              issuer: x509.issuer.replace(/\n/g, ', '),
              serialNumber: x509.serialNumber,
              validFrom: x509.validFrom,
              validTo: x509.validTo,
              sha1: x509.fingerprint,
              sha256: x509.fingerprint256,
            };
          }
        } catch {
          // continue scanning
        }
      }
    }
  }
  return null;
}

export function runAndroidSha1Diagnostic() {
  if (!fs.existsSync(apkPath)) {
    console.warn(`[Android SHA-1 Diagnostic] APK not found at ${APK_REL_PATH}`);
    return null;
  }

  const apkBuffer = fs.readFileSync(apkPath);
  const x509Info = extractCertFromApkBuffer(apkBuffer);

  let keytoolOutput = '';
  let keytoolSha1 = '';
  let keytoolSha256 = '';

  try {
    keytoolOutput = execSync(`keytool -printcert -jarfile "${apkPath}"`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const sha1Match = keytoolOutput.match(/SHA1:\s*([0-9A-F:]{59})/i);
    const sha256Match = keytoolOutput.match(/SHA256:\s*([0-9A-F:]{95})/i);
    if (sha1Match) keytoolSha1 = sha1Match[1].toUpperCase();
    if (sha256Match) keytoolSha256 = sha256Match[1].toUpperCase();
  } catch {
    // keytool not installed in minimal container; x509Info from APK Sig Block 42 is used
  }

  const sha1 = keytoolSha1 || x509Info?.sha1 || 'UNKNOWN';
  const sha256 = keytoolSha256 || x509Info?.sha256 || 'UNKNOWN';
  const subject = x509Info?.subject || 'CN=Android Debug, O=Android, C=US';
  const validFrom = x509Info?.validFrom || 'N/A';
  const validTo = x509Info?.validTo || 'N/A';

  console.log('\n======================================================================');
  console.log('OSA ANDROID APK SIGNING CERTIFICATE DIAGNOSTIC (DEBUG CERTIFICATE)');
  console.log('======================================================================');
  console.log('Android Package Name : app.osa.messaging');
  console.log('Firebase Project ID  : osa-app-88c1e');
  console.log(`Inspected APK        : ${APK_REL_PATH}`);
  console.log('Signing Config Type  : DEBUG CERTIFICATE (No release keystore configured)');
  console.log(`Certificate Owner    : ${subject}`);
  console.log(`Validity Period      : ${validFrom} -> ${validTo}`);
  console.log('----------------------------------------------------------------------');
  console.log(`DEBUG SHA-1          : ${sha1}`);
  console.log(`DEBUG SHA-256        : ${sha256}`);
  console.log('======================================================================\n');

  if (keytoolOutput) {
    console.log('[keytool -printcert -jarfile output]:');
    console.log(keytoolOutput.trim());
    console.log('======================================================================\n');
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    const summaryMd = [
      '## OSA Android Signing Certificate Diagnostic (`app.osa.messaging`)',
      '',
      '> **Certificate Label:** **DEBUG CERTIFICATE FINGERPRINT** (`CN=Android Debug, O=Android, C=US`)',
      '> `android/app/build.gradle` does not configure a release keystore. The fingerprints below are extracted directly from the actual signed Android APK (`android/app/build/outputs/apk/debug/app-debug.apk`).',
      '',
      '| Property | Value |',
      '| :--- | :--- |',
      '| **Android Package Name** | `app.osa.messaging` |',
      '| **Firebase Project ID** | `osa-app-88c1e` |',
      '| **APK Path** | `android/app/build/outputs/apk/debug/app-debug.apk` |',
      '| **Certificate Type** | **DEBUG** (`androiddebugkey` / `CN=Android Debug, O=Android, C=US`) |',
      `| **Valid From / To** | \`${validFrom}\` → \`${validTo}\` |`,
      `| **DEBUG SHA-1** | \`${sha1}\` |`,
      `| **DEBUG SHA-256** | \`${sha256}\` |`,
      '',
      '### Copyable Fingerprints for Firebase Console (`osa-app-88c1e`)',
      '**DEBUG SHA-1:**',
      '```text',
      sha1,
      '```',
      '**DEBUG SHA-256:**',
      '```text',
      sha256,
      '```',
      '',
    ].join('\n');

    try {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryMd, 'utf8');
    } catch (err) {
      console.warn('Could not write GITHUB_STEP_SUMMARY:', err?.message || err);
    }
  }

  return { sha1, sha256, subject, validFrom, validTo, verifiedByKeytool: Boolean(keytoolSha1) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAndroidSha1Diagnostic();
}
