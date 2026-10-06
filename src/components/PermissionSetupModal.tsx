import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Bell,
  Camera,
  CheckCircle2,
  MapPin,
  Mic,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  checkNativePermissions,
  OSAPermissionStatus,
  PermissionStateValue,
  requestAllOSAPermissions,
  requestCameraPermission,
  requestLocationPermission,
  requestMicrophonePermission,
  requestNotificationPermission,
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
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    checkNativePermissions(userId).then((res) => {
      setStatus(res);
    });
  }, [isOpen, userId]);

  if (!isOpen || !status) return null;

  const refreshStatus = async () => {
    const updated = await checkNativePermissions(userId);
    setStatus(updated);
    return updated;
  };

  const handleRequestSingle = async (
    key: 'microphone' | 'camera' | 'location' | 'notifications'
  ) => {
    setBusyKey(key);
    setInfoMessage('');
    try {
      if (key === 'microphone') {
        const res = await requestMicrophonePermission(userId);
        if (res === 'denied') {
          setInfoMessage(
            'Microphone access is blocked by your browser/device. Tap the lock/settings icon in your browser address bar to allow Microphone.'
          );
        }
      } else if (key === 'camera') {
        const res = await requestCameraPermission(userId);
        if (res === 'denied') {
          setInfoMessage(
            'Camera access is blocked by your browser/device. Tap the lock/settings icon in your browser address bar to allow Camera.'
          );
        }
      } else if (key === 'location') {
        const res = await requestLocationPermission(userId);
        if (res.state === 'denied') {
          setInfoMessage(
            'Location access is blocked by your browser/device. Please enable Location/GPS in your device and browser settings.'
          );
        }
      } else if (key === 'notifications') {
        const res = await requestNotificationPermission(userId);
        if (res === 'denied') {
          setInfoMessage(
            'Notification access is blocked by your browser/device. Enable Notifications in site settings to receive call and message alerts.'
          );
        }
      }
      const next = await refreshStatus();
      await syncPermissionsToSupabase(userId, next);
    } finally {
      setBusyKey(null);
    }
  };

  const handleAllowAll = async () => {
    setRequestingAll(true);
    setInfoMessage('');
    try {
      const finalStatus = await requestAllOSAPermissions(userId);
      setStatus(finalStatus);
      onComplete(finalStatus);
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
        Required
      </span>
    );
  };

  const permissionItems: Array<{
    key: 'microphone' | 'camera' | 'location' | 'notifications';
    title: string;
    subtitleBn: string;
    description: string;
    icon: React.ReactNode;
    state: PermissionStateValue;
  }> = [
    {
      key: 'microphone',
      title: 'Microphone Access',
      subtitleBn: 'অডিও/ভিডিও কল এবং ভয়েস মেসেজের জন্য প্রয়োজন',
      description:
        'Required for real-time WebRTC Audio Calls, Video Calls, and Voice Messages.',
      icon: <Mic className="w-5 h-5 text-blue-600 dark:text-blue-400" />,
      state: status.microphone,
    },
    {
      key: 'camera',
      title: 'Camera Access',
      subtitleBn: 'ভিডিও কল, স্ট্যাটাস এবং রিমোট ক্যামেরার জন্য প্রয়োজন',
      description:
        'Required for HD Video Calls, Status photo/video capture, and authorized Remote Camera streaming.',
      icon: <Camera className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />,
      state: status.camera,
    },
    {
      key: 'location',
      title: 'Location (GPS) Access',
      subtitleBn: 'লাইভ লোকেশন শেয়ার এবং রিমোট লোকেশনের জন্য প্রয়োজন',
      description:
        'Required for sharing your live GPS position in chat and responding to authorized Remote Location requests.',
      icon: <MapPin className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />,
      state: status.location,
    },
    {
      key: 'notifications',
      title: 'Push Notifications',
      subtitleBn: 'ইনকামিং কল এবং নতুন মেসেজ অ্যালার্টের জন্য প্রয়োজন',
      description:
        'Required to alert you immediately when a call, message, or remote access request arrives.',
      icon: <Bell className="w-5 h-5 text-amber-600 dark:text-amber-400" />,
      state: status.notifications,
    },
  ];

  const allGranted =
    status.microphone === 'granted' &&
    status.camera === 'granted' &&
    status.location === 'granted' &&
    (status.notifications === 'granted' || status.notifications === 'unsupported');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Top Header */}
        <div className="p-6 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-start justify-between gap-4">
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
                Allow permissions once so Calls, Remote Camera, and Remote Location work seamlessly.
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
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {infoMessage && (
            <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 p-3.5 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <span>{infoMessage}</span>
            </div>
          )}

          {/* Permission Cards */}
          <div className="space-y-2.5">
            {permissionItems.map((item) => (
              <div
                key={item.key}
                className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 p-3.5 flex items-center justify-between gap-3"
              >
                <div className="flex items-start gap-3 min-w-0">
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
                </div>

                {item.state !== 'granted' && item.state !== 'unsupported' && (
                  <button
                    type="button"
                    disabled={busyKey === item.key || requestingAll}
                    onClick={() => handleRequestSingle(item.key)}
                    className="px-3.5 py-2 min-h-[38px] rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold shrink-0 transition-colors"
                  >
                    {busyKey === item.key ? 'Requesting...' : 'Allow'}
                  </button>
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
        <div className="p-5 bg-slate-50 dark:bg-slate-900/90 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center gap-2.5">
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
