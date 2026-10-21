import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Bell,
  Camera,
  CheckCircle2,
  ExternalLink,
  MapPin,
  Mic,
  RefreshCw,
  Settings,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  checkNativePermissions,
  getAllowPermissionButtonLabel,
  getOpenPermissionSettingsButtonLabel,
  getPermissionSettingsInstruction,
  getStoredPermissionStatus,
  handleOneTapPermissionAction,
  openPermissionSettings,
  OSA_PERMISSIONS_UPDATED_EVENT,
  OSAPermissionStatus,
  PermissionKind,
  PermissionStateValue,
  requestAllPermissions,
  saveStoredPermissionStatus,
  syncPermissionsToSupabase,
} from '../services/permissionService';

interface PermissionSetupModalProps {
  isOpen: boolean;
  userId?: string;
  isFirstTimeOnboarding?: boolean;
  onComplete: (status: OSAPermissionStatus) => void;
  onClose?: () => void;
}

export const PermissionSetupModal: React.FC<PermissionSetupModalProps> = ({
  isOpen,
  userId,
  isFirstTimeOnboarding = false,
  onComplete,
  onClose,
}) => {
  const [status, setStatus] = useState<OSAPermissionStatus | null>(null);
  const [requestingAll, setRequestingAll] = useState(false);
  const [busyKey, setBusyKey] = useState<PermissionKind | null>(null);
  const [infoMessage, setInfoMessage] = useState('');
  const [expandedDeniedKey, setExpandedDeniedKey] = useState<PermissionKind | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const refresh = () => {
      checkNativePermissions(userId)
        .then((res) => {
          setStatus(res);
        })
        .catch(() => {});
    };

    refresh();

    const handlePermUpdated = () => {
      setStatus(getStoredPermissionStatus(userId));
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refresh();
      }
    };

    window.addEventListener(OSA_PERMISSIONS_UPDATED_EVENT, handlePermUpdated);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener(OSA_PERMISSIONS_UPDATED_EVENT, handlePermUpdated);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isOpen, userId]);

  if (!isOpen || !status) return null;

  const refreshStatus = async () => {
    const updated = await checkNativePermissions(userId);
    setStatus(updated);
    return updated;
  };

  const handlePermissionAction = async (key: PermissionKind) => {
    setBusyKey(key);
    setInfoMessage('');
    try {
      const result = await handleOneTapPermissionAction(key, userId);
      const next = await refreshStatus();
      await syncPermissionsToSupabase(userId, next);

      if (result.state === 'denied' || next[key] === 'denied') {
        setExpandedDeniedKey(key);
        if (result.instruction) {
          setInfoMessage(result.instruction);
        }
      } else if (next[key] === 'granted') {
        if (expandedDeniedKey === key) {
          setExpandedDeniedKey(null);
        }
      }
    } finally {
      setBusyKey(null);
    }
  };

  const handleOpenSettingsForPermission = async (key: PermissionKind) => {
    setBusyKey(key);
    try {
      // First re-check in case user already unblocked the permission in browser address bar
      const latest = await checkNativePermissions(userId);
      setStatus(latest);

      if (latest[key] === 'granted') {
        setExpandedDeniedKey(null);
        setInfoMessage('');
        return;
      }

      if (latest[key] === 'prompt') {
        await handlePermissionAction(key);
        return;
      }

      const settingsResult = openPermissionSettings(key);
      setExpandedDeniedKey(key);
      setInfoMessage(settingsResult.instruction);
    } finally {
      setBusyKey(null);
    }
  };

  const handleToggleFeatureEnabled = async (
    key: PermissionKind,
    enabledKey: 'cameraEnabled' | 'microphoneEnabled' | 'locationEnabled' | 'notificationsEnabled',
    nextVal: boolean
  ) => {
    setInfoMessage('');
    const latest = await checkNativePermissions(userId);
    const currentPerm = latest[key];

    if (nextVal && currentPerm === 'prompt') {
      await handlePermissionAction(key);
      return;
    }

    if (nextVal && currentPerm === 'denied') {
      const settingsResult = openPermissionSettings(key);
      setExpandedDeniedKey(key);
      setInfoMessage(settingsResult.instruction);
      setStatus(latest);
      return;
    }

    const updated = saveStoredPermissionStatus({ [enabledKey]: nextVal }, userId);
    setStatus(updated);
    await syncPermissionsToSupabase(userId, updated);
  };

  const handleAllowAll = async () => {
    setRequestingAll(true);
    setInfoMessage('');
    try {
      const finalStatus = await requestAllPermissions(userId);
      setStatus(finalStatus);
      const anyDenied =
        finalStatus.camera === 'denied' ||
        finalStatus.microphone === 'denied' ||
        finalStatus.location === 'denied' ||
        finalStatus.notifications === 'denied';
      if (!anyDenied) {
        onComplete(finalStatus);
      } else {
        const firstDenied: PermissionKind =
          finalStatus.camera === 'denied'
            ? 'camera'
            : finalStatus.microphone === 'denied'
            ? 'microphone'
            : finalStatus.location === 'denied'
            ? 'location'
            : 'notifications';
        setExpandedDeniedKey(firstDenied);
        setInfoMessage(getPermissionSettingsInstruction(firstDenied));
      }
    } finally {
      setRequestingAll(false);
    }
  };

  const handleContinue = async () => {
    const completed = saveStoredPermissionStatus(
      {
        ...status,
        onboardingCompleted: true,
      },
      userId
    );
    await syncPermissionsToSupabase(userId, completed);
    setStatus(completed);
    onComplete(completed);
  };

  const handleToggleRemoteOption = async (
    field: 'allowRemoteCamera' | 'allowRemoteLocation',
    value: boolean
  ) => {
    const updated = saveStoredPermissionStatus({ [field]: value }, userId);
    setStatus(updated);
    await syncPermissionsToSupabase(userId, updated);
  };

  const renderBadge = (val: PermissionStateValue) => {
    if (val === 'granted') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Allowed
        </span>
      );
    }
    if (val === 'denied') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-500/15 text-red-600 dark:text-red-400">
          <AlertCircle className="w-3.5 h-3.5" />
          Blocked
        </span>
      );
    }
    if (val === 'unsupported') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-200 dark:bg-slate-800 text-slate-500">
          Unsupported
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400">
        Tap to Allow
      </span>
    );
  };

  const permissionItems: Array<{
    key: PermissionKind;
    enabledKey: 'microphoneEnabled' | 'cameraEnabled' | 'locationEnabled' | 'notificationsEnabled';
    title: string;
    subtitleBn: string;
    description: string;
    icon: React.ReactNode;
    state: PermissionStateValue;
    enabled: boolean;
  }> = [
    {
      key: 'camera',
      enabledKey: 'cameraEnabled',
      title: 'Camera Access',
      subtitleBn: 'ভিডিও কল, স্ট্যাটাস এবং রিমোট ক্যামেরার জন্য প্রয়োজন',
      description:
        'Required for HD Video Calls, Status photo/video capture, and authorized Remote Camera streaming.',
      icon: <Camera className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />,
      state: status.camera,
      enabled: status.cameraEnabled,
    },
    {
      key: 'microphone',
      enabledKey: 'microphoneEnabled',
      title: 'Microphone Access',
      subtitleBn: 'অডিও/ভিডিও কল এবং ভয়েস মেসেজের জন্য প্রয়োজন',
      description:
        'Required for real-time WebRTC Audio Calls, Video Calls, and Voice Messages.',
      icon: <Mic className="w-5 h-5 text-blue-600 dark:text-blue-400" />,
      state: status.microphone,
      enabled: status.microphoneEnabled,
    },
    {
      key: 'location',
      enabledKey: 'locationEnabled',
      title: 'Location (GPS) Access',
      subtitleBn: 'লাইভ লোকেশন শেয়ার এবং রিমোট লোকেশনের জন্য প্রয়োজন',
      description:
        'Required for sharing your live GPS position in chat and responding to authorized Remote Location requests.',
      icon: <MapPin className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />,
      state: status.location,
      enabled: status.locationEnabled,
    },
    {
      key: 'notifications',
      enabledKey: 'notificationsEnabled',
      title: 'Push Notifications',
      subtitleBn: 'ইনকামিং কল এবং নতুন মেসেজ অ্যালার্টের জন্য প্রয়োজন',
      description:
        'Required to alert you immediately when a call or message arrives in background.',
      icon: <Bell className="w-5 h-5 text-amber-600 dark:text-amber-400" />,
      state: status.notifications,
      enabled: status.notificationsEnabled,
    },
  ];

  const allGranted =
    status.microphone === 'granted' &&
    status.camera === 'granted' &&
    status.location === 'granted' &&
    (status.notifications === 'granted' || status.notifications === 'unsupported');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 overflow-hidden">
      <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden max-h-dvh-modal flex flex-col">
        {/* Top Header */}
        <div className="shrink-0 p-6 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-xs flex items-center justify-center shrink-0">
              <ShieldCheck className="w-7 h-7 text-white" />
            </div>
            <div>
              <span className="inline-block text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md bg-white/20 text-white mb-1">
                {isFirstTimeOnboarding ? 'Step 2 of 2 · Account Setup' : 'Device Permissions'}
              </span>
              <h2 className="text-lg sm:text-xl font-extrabold tracking-tight">
                OSA Permission &amp; Remote Setup
              </h2>
              <p className="text-xs text-blue-100 mt-0.5">
                Tap any permission below to automatically allow or open its settings.
              </p>
            </div>
          </div>

          {onClose && !isFirstTimeOnboarding && (
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 min-h-0 p-5 sm:p-6 overflow-y-auto space-y-4">
          {infoMessage && (
            <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 p-3.5 text-xs text-amber-800 dark:text-amber-200 flex items-start justify-between gap-2.5">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                <span className="leading-relaxed">{infoMessage}</span>
              </div>
              <button
                type="button"
                onClick={refreshStatus}
                className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold shrink-0"
              >
                Check Now
              </button>
            </div>
          )}

          {/* Permission Cards */}
          <div className="space-y-2.5">
            {permissionItems.map((item) => (
              <div
                key={item.key}
                className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 p-3.5 space-y-2.5"
              >
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    disabled={busyKey === item.key || requestingAll}
                    onClick={() => {
                      if (item.state === 'denied') {
                        handleOpenSettingsForPermission(item.key);
                      } else {
                        handlePermissionAction(item.key);
                      }
                    }}
                    className="flex items-start gap-3 min-w-0 text-left flex-1 cursor-pointer"
                  >
                    <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                      {item.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-slate-900 dark:text-white">
                          {item.title}
                        </p>
                        {renderBadge(item.state)}
                      </div>
                      <p className="text-[11px] font-medium text-blue-600 dark:text-blue-400 mt-0.5">
                        {item.subtitleBn}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                        {item.description}
                      </p>
                    </div>
                  </button>

                  <div className="flex items-center gap-2 shrink-0">
                    {item.state === 'granted' && (
                      <span className="px-3 py-1.5 min-h-[34px] rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-xs font-bold inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Allowed
                      </span>
                    )}

                    {item.state === 'prompt' && (
                      <button
                        type="button"
                        disabled={busyKey === item.key || requestingAll}
                        onClick={() => handlePermissionAction(item.key)}
                        className="px-3 py-1.5 min-h-[34px] rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
                      >
                        {busyKey === item.key
                          ? 'Requesting...'
                          : getAllowPermissionButtonLabel(item.key)}
                      </button>
                    )}

                    <input
                      type="checkbox"
                      checked={item.enabled && item.state !== 'denied'}
                      onChange={(e) =>
                        handleToggleFeatureEnabled(item.key, item.enabledKey, e.target.checked)
                      }
                      aria-label={`Toggle ${item.title}`}
                      className="w-5 h-5 accent-blue-600 rounded cursor-pointer shrink-0"
                    />
                  </div>
                </div>

                {item.state === 'denied' && (
                  <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold text-red-700 dark:text-red-300">
                        {item.title} is currently blocked on this device/browser.
                      </p>
                      <button
                        type="button"
                        disabled={busyKey === item.key}
                        onClick={() => handleOpenSettingsForPermission(item.key)}
                        className="w-full sm:w-auto px-3.5 py-2 min-h-[36px] rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 shadow-sm transition-colors shrink-0"
                      >
                        <Settings className="w-3.5 h-3.5" />
                        <span>{getOpenPermissionSettingsButtonLabel(item.key)}</span>
                        <ExternalLink className="w-3 h-3 opacity-80" />
                      </button>
                    </div>
                    <p className="text-[11px] text-red-700/90 dark:text-red-300/90 leading-relaxed">
                      {getPermissionSettingsInstruction(item.key)}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Remote Access Preferences */}
          <div className="rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/70 dark:border-blue-900/60 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-blue-900 dark:text-blue-300">
                Remote Access Authorization
              </h3>
              <button
                type="button"
                onClick={refreshStatus}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
              >
                <RefreshCw className="w-3 h-3" />
                Refresh Status
              </button>
            </div>

            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white">
                  Allow Remote Camera Access (রিমোট ক্যামেরা অ্যাক্সেস)
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Automatically connect live camera stream when an OSA peer initiates Remote Camera while app is active.
                </p>
              </div>
              <input
                type="checkbox"
                checked={status.allowRemoteCamera}
                onChange={(e) => handleToggleRemoteOption('allowRemoteCamera', e.target.checked)}
                className="w-5 h-5 accent-blue-600 rounded cursor-pointer shrink-0"
              />
            </label>

            <label className="flex items-center justify-between gap-3 cursor-pointer pt-2 border-t border-blue-200/50 dark:border-blue-900/40">
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white">
                  Allow Remote Location Access (রিমোট লোকেশন অ্যাক্সেস)
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Automatically share real-time GPS coordinates when an OSA peer requests Remote Location.
                </p>
              </div>
              <input
                type="checkbox"
                checked={status.allowRemoteLocation}
                onChange={(e) => handleToggleRemoteOption('allowRemoteLocation', e.target.checked)}
                className="w-5 h-5 accent-blue-600 rounded cursor-pointer shrink-0"
              />
            </label>
          </div>
        </div>

        {/* Footer Buttons */}
        <div className="shrink-0 p-5 bg-slate-50 dark:bg-slate-900/90 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center gap-2.5">
          {!allGranted ? (
            <>
              <button
                type="button"
                disabled={requestingAll}
                onClick={handleAllowAll}
                className="w-full py-3 min-h-[46px] rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold shadow-lg shadow-blue-600/25 transition-colors"
              >
                {requestingAll
                  ? 'Requesting Native Permissions...'
                  : 'Allow All Permissions (সব পারমিশন দিন)'}
              </button>
              <button
                type="button"
                disabled={requestingAll}
                onClick={handleContinue}
                className="w-full sm:w-auto px-5 py-3 min-h-[46px] rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
              >
                Continue to OSA
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleContinue}
              className="w-full py-3 min-h-[46px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold shadow-lg shadow-emerald-600/25 transition-colors flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>All Permissions Ready · Continue to OSA</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
