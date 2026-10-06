import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Database,
  Eye,
  EyeOff,
  Lock,
  Mail,
  MessageSquare,
  User,
} from 'lucide-react';
import { PWAInstallButton } from '../components/PWAInstallButton';
import { PermissionSetupModal } from '../components/PermissionSetupModal';
import { TranslationDictionary } from '../lib/i18n';
import { getSupabaseConfig } from '../lib/supabase';
import {
  describeSupabaseError,
  sendPasswordResetEmail,
  signInWithEmail,
  signUpWithEmail,
  updateUserPassword,
} from '../services/osaService';

export type AuthScreenMode = 'login' | 'register' | 'forgot' | 'reset';

interface AuthPagesProps {
  initialMode?: AuthScreenMode;
  onAuthenticated: () => void;
  onOpenSupabaseConfig: () => void;
  t: TranslationDictionary;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const AuthPages: React.FC<AuthPagesProps> = ({
  initialMode = 'login',
  onAuthenticated,
  onOpenSupabaseConfig,
  t,
}) => {
  const [mode, setMode] = useState<AuthScreenMode>(initialMode);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [showPermissionOnboarding, setShowPermissionOnboarding] = useState(false);
  const [registeredUserId, setRegisteredUserId] = useState<string | undefined>(undefined);

  const sbConfig = getSupabaseConfig();

  const switchMode = (nextMode: AuthScreenMode) => {
    setError('');
    setSuccessMessage('');
    setMode(nextMode);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    const currentConfig = getSupabaseConfig();
    if (!currentConfig.isConfigured) {
      setError('Supabase is not configured yet. Please connect your Supabase URL and Anon Key first.');
      return;
    }

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError('Email address is required.');
      return;
    }
    if (!EMAIL_REGEX.test(cleanEmail)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!password) {
      setError('Password is required.');
      return;
    }

    setLoading(true);
    try {
      await signInWithEmail(cleanEmail, password);
      onAuthenticated();
    } catch (err) {
      setError(describeSupabaseError(err, 'Unable to sign in. Check your network or credentials.'));
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    const currentConfig = getSupabaseConfig();
    if (!currentConfig.isConfigured) {
      setError('Supabase is not configured yet. Please connect your Supabase URL and Anon Key first.');
      return;
    }

    const cleanName = fullName.trim();
    const cleanEmail = email.trim();

    if (!cleanName || cleanName.length < 2) {
      setError('Please enter your full name (at least 2 characters).');
      return;
    }
    if (!cleanEmail) {
      setError('Email address is required.');
      return;
    }
    if (!EMAIL_REGEX.test(cleanEmail)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const result = await signUpWithEmail(cleanName, cleanEmail, password);
      try {
        localStorage.setItem('osa_needs_permission_onboarding', 'true');
      } catch {
        // Ignore storage error
      }
      if (result.session) {
        onAuthenticated();
      } else {
        setRegisteredUserId(result.user?.id);
        setShowPermissionOnboarding(true);
        setSuccessMessage(
          'Your OSA account has been created! Please check your email inbox to verify your account before logging in.'
        );
        setPassword('');
        setConfirmPassword('');
      }
    } catch (err) {
      setError(describeSupabaseError(err, 'Registration failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    const currentConfig = getSupabaseConfig();
    if (!currentConfig.isConfigured) {
      setError('Supabase is not configured yet. Please connect your Supabase URL and Anon Key first.');
      return;
    }

    const cleanEmail = email.trim();
    if (!cleanEmail || !EMAIL_REGEX.test(cleanEmail)) {
      setError('Please enter a valid registered email address.');
      return;
    }

    setLoading(true);
    try {
      await sendPasswordResetEmail(cleanEmail);
      setSuccessMessage(
        'Password reset instructions have been sent to your email via Supabase Auth.'
      );
    } catch (err) {
      setError(describeSupabaseError(err, 'Failed to send password reset email.'));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    if (!password || password.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await updateUserPassword(password);
      setSuccessMessage('Your OSA password has been updated! Redirecting...');
      setTimeout(() => {
        onAuthenticated();
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col justify-between bg-slate-50 dark:bg-slate-950 px-4 py-8">
      {/* Top Bar */}
      <header className="w-full max-w-md mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
            <MessageSquare className="w-5 h-5" />
          </div>
          <span className="font-display text-xl font-extrabold tracking-wider text-slate-900 dark:text-white">
            OSA
          </span>
        </div>

        <div className="flex items-center gap-2">
          <PWAInstallButton compact />
          <button
            type="button"
            onClick={onOpenSupabaseConfig}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[38px] rounded-xl text-xs font-semibold border transition-colors ${
              sbConfig.isConfigured
                ? 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900'
                : 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>{sbConfig.isConfigured ? 'Database Ready' : 'Connect Supabase'}</span>
          </button>
        </div>
      </header>

      {/* Main Card */}
      <main className="w-full max-w-md mx-auto my-8">
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-6 sm:p-8 shadow-xl shadow-slate-900/5">
          {/* Brand Header */}
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto mb-3 shadow-lg shadow-blue-600/25">
              <MessageSquare className="w-8 h-8" />
            </div>
            <h1 className="font-display text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              {mode === 'login' && 'Welcome to OSA'}
              {mode === 'register' && 'Create Your OSA Account'}
              {mode === 'forgot' && t.resetPassword}
              {mode === 'reset' && 'Set New OSA Password'}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {t.tagline}
            </p>
          </div>

          {!sbConfig.isConfigured && (
            <div className="mb-5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 p-4 text-xs text-amber-800 dark:text-amber-200">
              <p className="font-semibold mb-1">Supabase Backend Required</p>
              <p className="mb-2.5 text-amber-700 dark:text-amber-300">
                OSA uses real Supabase Auth, PostgreSQL, Realtime, and Storage. Connect your project credentials to sign in or register.
              </p>
              <button
                type="button"
                onClick={onOpenSupabaseConfig}
                className="px-3.5 py-2 min-h-[38px] rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold transition-colors"
              >
                Configure Supabase Connection
              </button>
            </div>
          )}

          {error && (
            <div className="mb-4 flex items-start gap-2.5 rounded-2xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800/80 p-3.5 text-xs text-red-700 dark:text-red-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="mb-4 flex items-start gap-2.5 rounded-2xl bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-800/80 p-3.5 text-xs text-green-700 dark:text-green-300">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-green-600 dark:text-green-400" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* LOGIN FORM */}
          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4" noValidate>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {t.email}
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-10 pr-4 py-3 min-h-[46px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {t.password}
                  </label>
                  <button
                    type="button"
                    onClick={() => switchMode('forgot')}
                    className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {t.forgotPassword}
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full pl-10 pr-11 py-3 min-h-[46px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 absolute right-1.5 top-1/2 -translate-y-1/2"
                    aria-label="Toggle password visibility"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 min-h-[48px] rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold shadow-md shadow-blue-600/20 transition-colors"
              >
                {loading ? 'Signing in to OSA...' : t.login}
              </button>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-center">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2.5">
                  New to OSA?
                </p>
                <button
                  type="button"
                  onClick={() => switchMode('register')}
                  className="w-full py-2.5 min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  {t.createAccount}
                </button>
              </div>
            </form>
          )}

          {/* REGISTRATION FORM */}
          {mode === 'register' && (
            <form onSubmit={handleRegister} className="space-y-4" noValidate>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {t.fullName}
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter your full name"
                    className="w-full pl-10 pr-4 py-3 min-h-[46px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {t.email}
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-10 pr-4 py-3 min-h-[46px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {t.password}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="w-full pl-10 pr-11 py-3 min-h-[46px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 absolute right-1.5 top-1/2 -translate-y-1/2"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {t.confirmPassword}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    className="w-full pl-10 pr-4 py-3 min-h-[46px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 min-h-[48px] rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold shadow-md shadow-blue-600/20 transition-colors"
              >
                {loading ? 'Creating OSA Account...' : t.createAccount}
              </button>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-center">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2.5">
                  Already have an OSA account?
                </p>
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="w-full py-2.5 min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  {t.login}
                </button>
              </div>
            </form>
          )}

          {/* FORGOT PASSWORD FORM */}
          {mode === 'forgot' && (
            <form onSubmit={handleForgotPassword} className="space-y-4" noValidate>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {t.email}
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your OSA account email"
                    className="w-full pl-10 pr-4 py-3 min-h-[46px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 min-h-[48px] rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold shadow-md shadow-blue-600/20 transition-colors"
              >
                {loading ? 'Sending Reset Email...' : t.sendResetLink}
              </button>

              <button
                type="button"
                onClick={() => switchMode('login')}
                className="w-full py-2.5 min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>{t.backToLogin}</span>
              </button>
            </form>
          )}

          {/* RESET PASSWORD FORM */}
          {mode === 'reset' && (
            <form onSubmit={handleResetPassword} className="space-y-4" noValidate>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {t.newPassword}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="w-full px-4 py-3 min-h-[46px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {t.confirmPassword}
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="w-full px-4 py-3 min-h-[46px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 min-h-[48px] rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold"
              >
                {loading ? 'Updating Password...' : t.updatePassword}
              </button>
            </form>
          )}
        </div>
      </main>

      <footer className="w-full max-w-md mx-auto text-center text-xs text-slate-400">
        OSA &middot; Real-Time Encrypted Messaging &amp; Calling
      </footer>

      <PermissionSetupModal
        isOpen={showPermissionOnboarding}
        userId={registeredUserId}
        isFirstTimeOnboarding
        onComplete={() => {
          setShowPermissionOnboarding(false);
          try {
            localStorage.removeItem('osa_needs_permission_onboarding');
          } catch {
            // Ignore
          }
        }}
        onClose={() => setShowPermissionOnboarding(false)}
      />
    </div>
  );
};
