import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowDownCircle,
  CheckCircle2,
  Download,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { TranslationDictionary } from '../lib/i18n';
import {
  AppReleaseMetadata,
  checkNativeAppUpdate,
  detectRuntimePlatform,
  getNativeAppVersion,
  promptInstallNativeApk,
  startNativeApkDownload,
  UpdateCheckResult,
  UpdateDownloadComplete,
  UpdateDownloadProgress,
} from '../services/nativeMobileBridge';

interface AppUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  t: TranslationDictionary;
  autoCheckOnMount?: boolean;
}

export const AppUpdateModal: React.FC<AppUpdateModalProps> = ({
  isOpen,
  onClose,
  t,
  autoCheckOnMount = false,
}) => {
  const [checking, setChecking] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<AppReleaseMetadata | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState<boolean | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [downloadedApkPath, setDownloadedApkPath] = useState<string | null>(null);
  const [installPrompted, setInstallPrompted] = useState(false);

  const currentVersion = getNativeAppVersion();
  const platform = detectRuntimePlatform();

  useEffect(() => {
    const handleUpdateCheckResult = (e: Event) => {
      const detail = (e as CustomEvent<UpdateCheckResult>).detail;
      setChecking(false);
      if (detail.success) {
        setUpdateAvailable(detail.updateAvailable);
        setUpdateInfo(detail.info || null);
        setErrorMsg(null);
      } else {
        setErrorMsg(detail.error || 'Failed to check for updates');
      }
    };

    const handleDownloadProgress = (e: Event) => {
      const detail = (e as CustomEvent<UpdateDownloadProgress>).detail;
      setDownloading(true);
      setDownloadProgress(detail.percent || 0);
    };

    const handleDownloadComplete = (e: Event) => {
      const detail = (e as CustomEvent<UpdateDownloadComplete>).detail;
      setDownloading(false);
      setDownloadedApkPath(detail.apkFilePath || 'success');
      setErrorMsg(null);
      setInstallPrompted(true);
      if (updateInfo?.versionName) {
        try {
          localStorage.setItem('osa_running_version', updateInfo.versionName);
          localStorage.setItem('osa_running_version_code', String(updateInfo.versionCode || 3));
          localStorage.setItem('osa_last_installed_version', updateInfo.versionName);
        } catch {}
      }
      window.setTimeout(() => {
        onClose();
        window.location.reload();
      }, 800);
    };

    window.addEventListener('osa:update-check-result', handleUpdateCheckResult);
    window.addEventListener('osa:update-download-progress', handleDownloadProgress);
    window.addEventListener('osa:update-download-complete', handleDownloadComplete);

    return () => {
      window.removeEventListener('osa:update-check-result', handleUpdateCheckResult);
      window.removeEventListener('osa:update-download-progress', handleDownloadProgress);
      window.removeEventListener('osa:update-download-complete', handleDownloadComplete);
    };
  }, []);

  useEffect(() => {
    if (isOpen && (autoCheckOnMount || updateAvailable === null)) {
      handleTriggerCheck();
    }
  }, [isOpen]);

  const handleTriggerCheck = () => {
    setChecking(true);
    setErrorMsg(null);
    setDownloadedApkPath(null);
    setInstallPrompted(false);
    checkNativeAppUpdate();
  };

  const handleStartDownload = () => {
    if (!updateInfo?.apkUrl) return;
    if (updateInfo?.versionName) {
      try {
        localStorage.setItem('osa_last_installed_version', updateInfo.versionName);
      } catch {}
    }
    setDownloading(true);
    setDownloadProgress(0);
    setErrorMsg(null);
    startNativeApkDownload(updateInfo.apkUrl, updateInfo.sha256 || '');
  };

  const handleInstallApk = () => {
    setInstallPrompted(true);
    setErrorMsg(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-xl animate-fade-in">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                {t.checkForUpdates}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Current version: v{currentVersion} {updateInfo ? `→ New: v${updateInfo.versionName}` : ''}
              </p>
            </div>
          </div>
          {!updateAvailable && (
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {checking && (
            <div className="flex flex-col items-center justify-center py-8 space-y-3 text-center">
              <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {t.checkingForUpdates}
              </p>
              <p className="text-xs text-slate-500">Checking GitHub Releases &amp; osa-chat.com...</p>
            </div>
          )}

          {!checking && errorMsg && (
            <div className="rounded-2xl p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="text-xs text-red-700 dark:text-red-300 space-y-1">
                <p className="font-semibold">Update Check Notice</p>
                <p>{errorMsg}</p>
              </div>
            </div>
          )}

          {!checking && updateAvailable === false && (
            <div className="flex flex-col items-center justify-center py-6 space-y-3 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h4 className="font-bold text-base text-slate-900 dark:text-white">
                {t.upToDate}
              </h4>
              <p className="text-xs text-slate-500 max-w-xs">
                You are running the latest stable release (v{currentVersion}).
              </p>
            </div>
          )}

          {!checking && updateAvailable === true && updateInfo && (
            <div className="space-y-4">
              <div className="rounded-2xl p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                    {t.updateAvailable}
                  </span>
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-blue-600 text-white">
                    v{updateInfo.versionName}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  A new stable APK version is available for your device.
                </p>
              </div>


              {/* Progress bar when downloading */}
              {downloading && (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <span>{t.downloadingUpdate}</span>
                    <span>{downloadProgress}%</span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-blue-600 transition-all duration-300 rounded-full"
                      style={{ width: `${downloadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Downloaded successfully banner */}
              {downloadedApkPath && !downloading && (
                <div className="rounded-2xl p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>APK downloaded and verified. Ready to install.</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleTriggerCheck}
            disabled={checking || downloading}
            className="px-4 py-2.5 min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
            <span>{t.checkForUpdates}</span>
          </button>

          {updateAvailable === true && updateInfo && (
            <>
              {!downloadedApkPath ? (
                <button
                  type="button"
                  onClick={handleStartDownload}
                  disabled={downloading}
                  className="px-5 py-2.5 min-h-[42px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors inline-flex items-center gap-2 shadow-sm disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  <span>{downloading ? `${downloadProgress}%` : t.updateNow}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleInstallApk}
                  className="px-5 py-2.5 min-h-[42px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors inline-flex items-center gap-2 shadow-sm"
                >
                  <ArrowDownCircle className="w-4 h-4" />
                  <span>{t.installUpdate}</span>
                </button>
              )}
            </>
          )}

          {updateAvailable !== true && (
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 min-h-[42px] rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold hover:opacity-90 transition-opacity"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
