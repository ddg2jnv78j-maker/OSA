import React, { useEffect, useState } from 'react';
import { Camera, MapPin, Eye, Shield, Clock, X, Check, ArrowLeft } from 'lucide-react';
import { Profile } from '../types/osa';
import {
  ContactPermission,
  fetchContactPermission,
  updateContactPermission,
} from '../services/contactPermissionsService';

interface UserPermissionDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: Profile;
  targetUser: Profile;
}

export const UserPermissionDetailModal: React.FC<UserPermissionDetailModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  targetUser,
}) => {
  const [perm, setPerm] = useState<ContactPermission>({
    owner_user_id: currentUser.id,
    target_user_id: targetUser.id,
    allow_remote_camera: false,
    allow_remote_location: false,
    allow_last_seen: true,
    allow_privacy: true,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && currentUser?.id && targetUser?.id) {
      fetchContactPermission(currentUser.id, targetUser.id).then((data) => {
        setPerm(data);
      });
    }
  }, [isOpen, currentUser?.id, targetUser?.id]);

  const handleToggle = async (key: keyof ContactPermission, val: boolean) => {
    const next = { ...perm, [key]: val };
    setPerm(next);
    setSaving(true);

    try {
      const payload = { owner_user_id: currentUser.id, target_user_id: targetUser.id, ...next };
      localStorage.setItem(`osa_contact_perm_${currentUser.id}_${targetUser.id}`, JSON.stringify(payload));
    } catch {}

    await updateContactPermission(currentUser.id, targetUser.id, { [key]: val });
    setSaving(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="relative">
              {targetUser.avatar_url ? (
                <img
                  src={targetUser.avatar_url}
                  alt={targetUser.full_name}
                  className="w-11 h-11 rounded-2xl object-cover"
                />
              ) : (
                <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white font-bold flex items-center justify-center text-sm">
                  {targetUser.full_name?.[0]?.toUpperCase() || 'U'}
                </div>
              )}
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                {targetUser.full_name}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                @{targetUser.username} {saving && '• Saving...'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Per-User Access Control
            </h4>

            {/* Remote Camera */}
            <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    Remote Camera
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Allow this user to access live camera stream
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleToggle('allow_remote_camera', !perm.allow_remote_camera)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  perm.allow_remote_camera ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    perm.allow_remote_camera ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Location */}
            <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    Location
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Allow this user to request live GPS location
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleToggle('allow_remote_location', !perm.allow_remote_location)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  perm.allow_remote_location ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    perm.allow_remote_location ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Last Seen */}
            <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    Last Seen
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Allow this user to see your online status & last seen
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleToggle('allow_last_seen', !perm.allow_last_seen)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  perm.allow_last_seen ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    perm.allow_last_seen ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Privacy */}
            <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-600/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    Privacy & Read Receipts
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Allow this user read receipts and profile visibility
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleToggle('allow_privacy', !perm.allow_privacy)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  perm.allow_privacy ? 'bg-purple-600' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    perm.allow_privacy ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Activity Log */}
          <div className="space-y-3 pt-2">
            <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              <span>Access Activity Log</span>
            </h4>
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-300 font-medium">Last Remote Camera Access:</span>
                <span className="text-slate-500 dark:text-slate-400 font-mono">
                  {perm.last_camera_access_at
                    ? new Date(perm.last_camera_access_at).toLocaleString()
                    : 'Never accessed'}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-slate-200/60 dark:border-slate-800/60 pt-2.5">
                <span className="text-slate-600 dark:text-slate-300 font-medium">Last Location Access:</span>
                <span className="text-slate-500 dark:text-slate-400 font-mono">
                  {perm.last_location_access_at
                    ? new Date(perm.last_location_access_at).toLocaleString()
                    : 'Never accessed'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors shadow-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
