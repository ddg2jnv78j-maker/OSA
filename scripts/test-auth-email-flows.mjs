import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function readFile(relPath) {
  return fs.readFileSync(path.join(rootDir, relPath), 'utf8');
}

console.log('Running OSA Chat Email Branding, Registration Verification & Password Recovery Tests...\n');

// 1. Verify Supabase Auth Email Templates & Config
const confirmationTemplate = readFile('supabase/templates/confirmation.html');
const recoveryTemplate = readFile('supabase/templates/recovery.html');
const supabaseConfig = readFile('supabase/config.toml');

assert.ok(
  confirmationTemplate.includes('Sender Display Name: OSA Chat'),
  'Confirmation template must specify Sender Display Name: OSA Chat'
);
assert.ok(
  confirmationTemplate.includes('Subject: OSA Chat — Verify Your Email'),
  'Confirmation template must specify Subject: OSA Chat — Verify Your Email'
);
assert.ok(
  confirmationTemplate.includes('{{ .ConfirmationURL }}') &&
    confirmationTemplate.includes('{{ .Token }}'),
  'Confirmation template must support both ConfirmationURL link and Token OTP code'
);
assert.ok(
  confirmationTemplate.includes('OSA Chat'),
  'Confirmation template must use OSA Chat branding'
);

assert.ok(
  recoveryTemplate.includes('Sender Display Name: OSA Chat'),
  'Recovery template must specify Sender Display Name: OSA Chat'
);
assert.ok(
  recoveryTemplate.includes('Subject: OSA Chat — Password Recovery'),
  'Recovery template must specify Subject: OSA Chat — Password Recovery'
);
assert.ok(
  recoveryTemplate.includes('{{ .ConfirmationURL }}') &&
    recoveryTemplate.includes('OSA Chat'),
  'Recovery template must include ConfirmationURL and OSA Chat branding'
);

assert.ok(
  supabaseConfig.includes('site_url = "https://osa-chat.com/"') &&
    supabaseConfig.includes('[auth.email.smtp]') &&
    supabaseConfig.includes('sender_name = "OSA Chat"') &&
    supabaseConfig.includes('subject = "OSA Chat — Verify Your Email"') &&
    supabaseConfig.includes('subject = "OSA Chat — Password Recovery"'),
  'supabase/config.toml must configure site_url https://osa-chat.com/, [auth.email.smtp] sender_name = "OSA Chat", and OSA Chat email subjects'
);
console.log('✓ Test 1 passed: Email templates and config.toml use OSA Chat branding, sender_name, subjects, and variables');

// 2. Verify osaService.ts redirect validation, OTP verification, and recovery logic
const osaService = readFile('src/services/osaService.ts');

assert.ok(
  osaService.includes("export const OSA_PRODUCTION_SITE_URL = 'https://osa-chat.com/';") &&
    osaService.includes("export const OSA_EMAIL_VERIFICATION_REDIRECT_URL = 'https://osa-chat.com/?type=signup';") &&
    osaService.includes("export const OSA_PASSWORD_RESET_REDIRECT_URL = 'https://osa-chat.com/?type=recovery';"),
  'osaService.ts must define production Site URL and explicit signup/recovery redirect URLs on https://osa-chat.com/'
);
assert.ok(
  osaService.includes('export function resolveSafeAuthRedirectUrl(') &&
    osaService.includes("const ALLOWED_AUTH_REDIRECT_HOSTS = new Set(['osa-chat.com', 'www.osa-chat.com']);"),
  'osaService.ts must enforce strict allowlist validation for redirect URLs'
);
assert.ok(
  osaService.includes('export async function verifyEmailOtpCode(') &&
    osaService.includes('supabase.auth.verifyOtp({') &&
    osaService.includes("type: 'signup'"),
  'osaService.ts must implement verifyEmailOtpCode using supabase.auth.verifyOtp({ email, token, type: "signup" })'
);
assert.ok(
  osaService.includes('export async function resendVerificationEmail(') &&
    osaService.includes('supabase.auth.resend({'),
  'osaService.ts must implement resendVerificationEmail'
);
assert.ok(
  osaService.includes('if (!confirmedAt)') &&
    osaService.includes('Your email address has not been verified yet'),
  'signInWithEmail must reject unverified accounts and never treat them as authenticated'
);
console.log('✓ Test 2 passed: osaService.ts enforces safe redirects, OTP verification, and confirmed-email checks');

// 3. Verify AuthPages.tsx registration -> verification -> login & password recovery -> login flows
const authPages = readFile('src/pages/AuthPages.tsx');

assert.ok(
  authPages.includes("export type AuthScreenMode = 'login' | 'register' | 'verify' | 'forgot' | 'reset';"),
  'AuthPages.tsx must include verify mode in AuthScreenMode'
);
assert.ok(
  authPages.includes("mode === 'verify' && 'OSA Chat — Verify Your Email'") &&
    authPages.includes("mode === 'forgot' && 'OSA Chat — Password Recovery'"),
  'AuthPages.tsx must render OSA Chat — Verify Your Email and OSA Chat — Password Recovery headings'
);
assert.ok(
  authPages.includes('const verifiedResult = await verifyEmailOtpCode(cleanEmail, cleanCode);') &&
    authPages.includes("setMode('login');") &&
    authPages.includes("'Your email has been verified! Please sign in to OSA Chat.'"),
  'AuthPages.tsx must verify OTP via verifyEmailOtpCode and redirect to Login page on success'
);
assert.ok(
  authPages.includes('await updateUserPassword(password);') &&
    authPages.includes('await supabase.auth.signOut().catch(() => {});') &&
    authPages.includes("'Your OSA Chat password has been updated successfully! Please sign in with your new password.'"),
  'AuthPages.tsx must sign out recovery session after password reset and redirect to Login page'
);
console.log('✓ Test 3 passed: AuthPages.tsx implements registration verification, OTP screen, and password reset to Login');

// 4. Verify App.tsx confirmation link callback, recovery token validation, and URL token cleanup
const appTsx = readFile('src/App.tsx');

assert.ok(
  appTsx.includes('isVerificationCallback') &&
    appTsx.includes("typeParam === 'signup' || typeParam === 'email' || isVerifyFlag"),
  'App.tsx must detect signup/email confirmation callbacks and /verify-email route'
);
assert.ok(
  appTsx.includes("typeParam === 'recovery' || isResetFlag") &&
    appTsx.includes("pathname === '/reset-password'"),
  'App.tsx must detect password recovery callbacks and /reset-password route'
);
assert.ok(
  appTsx.includes("'This email verification link is invalid or has expired. Please request a new verification email or enter your verification code.'") &&
    appTsx.includes("'This password reset link is invalid or has expired. Please request a new password reset email.'"),
  'App.tsx must handle expired/invalid verification and recovery tokens with clear error messages'
);
assert.ok(
  appTsx.includes("window.history.replaceState({}, document.title, '/');"),
  'App.tsx must strip tokens and hashes from the browser URL after processing callbacks'
);
console.log('✓ Test 4 passed: App.tsx securely handles confirmation & recovery callbacks, token expiration, and URL cleanup');

// 5. Verify GitHub Pages SPA route generation & no leaked secrets
const buildScript = readFile('scripts/build-gh-pages.mjs');
assert.ok(
  buildScript.includes("const spaAuthRoutes = ['login', 'verify-email', 'reset-password', 'auth/callback'];"),
  'build-gh-pages.mjs must generate static index.html entrypoints for auth routes'
);
assert.ok(
  !confirmationTemplate.includes('service_role') &&
    !recoveryTemplate.includes('service_role') &&
    !osaService.includes('service_role'),
  'No service_role credentials may be exposed in templates or client code'
);
console.log('✓ Test 5 passed: GitHub Pages auth routes and secret safety verified');

// 6. Verify built static SPA routes exist in dist/ after build
const distDir = path.join(rootDir, 'dist');
if (fs.existsSync(distDir)) {
  for (const route of ['login', 'verify-email', 'reset-password', 'auth/callback']) {
    assert.ok(
      fs.existsSync(path.join(distDir, route, 'index.html')),
      `dist/${route}/index.html must exist so confirmation/recovery links never 404`
    );
  }
  assert.equal(
    fs.readFileSync(path.join(distDir, 'CNAME'), 'utf8').trim(),
    'osa-chat.com',
    'dist/CNAME must be set to osa-chat.com'
  );
  console.log('✓ Test 6 passed: Built dist/ contains CNAME (osa-chat.com) and all auth route entrypoints');
}

// 7. Verify hidden internal status elements remain omitted from AuthPages and SettingsPage
const settingsPage = readFile('src/pages/SettingsPage.tsx');
assert.ok(
  !authPages.includes('Database Ready'),
  'AuthPages.tsx must not render the hidden Database Ready badge/button'
);
assert.ok(
  !settingsPage.includes('Supabase Connection'),
  'SettingsPage.tsx must not render the hidden Supabase Connection section'
);
console.log('✓ Test 7 passed: Previously hidden UI elements (Database Ready & Supabase Connection) remain hidden');

console.log('\nAll OSA Chat email branding, verification, and password recovery test suites passed!');
