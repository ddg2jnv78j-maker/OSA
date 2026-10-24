import React, { useEffect, useState } from 'react';
import { ShieldAlert, Check, X, Smartphone, Globe } from 'lucide-react';
import { Profile } from '../types/osa';
import {
  DeviceLoginRequest,
  respondToLoginRequest,
} from '../services/highSecurityService';
import { supabase } from '../lib/supabase';

interface DeviceLoginApprovalModalProps {
  currentUser: Profile | null;
}

export const DeviceLoginApprovalModal: React.FC<DeviceLoginApprovalModalProps> = ({ currentUser }) => {
  const [pendingRequest, setPendingRequest] = useState<DeviceLoginRequest | null>(null);

  useEffect(() => {
    if (!currentUser?.id) return;

    // Poll for pending requests on primary device
    const checkPending = async () => {
      try {
        const { data, error } = await supabase
          .from('device_login_requests')
          .select('*')
          .eq('user_id', currentUser.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(1);

        if (!error && data && data.length > 0) {
          const req = data[0] as DeviceLoginRequest;
          // Don't prompt if it's the current device's own request
          const currentFp = localStorage.getItem('osa_device_fingerprint');
          if (req.device_fingerprint !== currentFp) {
            setPendingRequest(req);
          }
        }
      } catch {}
    };

    checkPending();
    const interval = setInterval(checkPending, 4000);

    // Also subscribe to realtime inserts on device_login_requests
    const channel = supabase
      .channel('device_login_requests_' + currentUser.id)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'device_login_requests',
          filter: `user_id=eq.${currentUser.id}`,
        },
        (payload) => {
          const req = payload.new as DeviceLoginRequest;
          const currentFp = localStorage.getItem('osa_device_fingerprint');
          if (req.device_fingerprint !== currentFp && req.status === 'pending') {
            setPendingRequest(req);
          }
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [currentUser?.id]);

  const handleResponse = async (status: 'approved' | 'rejected') => {
    if (!pendingRequest) return;
    await respondToLoginRequest(pendingRequest.id, status);
    setPendingRequest(null);
  };

  if (!pendingRequest) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6 space-y-6 text-center">
        <div className="w-16 h-16 rounded-3xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto shadow-inner">
          <ShieldAlert className="w-8 h-8 animate-pulse" />
        </div>

        <div className="space-y-2">
          <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">
            New Login Attempt Detected
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Someone is trying to log in to your OSA account from another device:
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 flex items-center gap-3.5 text-left">
          <div className="w-10 h-10 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Globe className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
              {pendingRequest.device_name}
            </p>
            <p className="text-xs text-slate-400 font-mono truncate">
              ID: {pendingRequest.device_fingerprint}
            </p>
          </div>
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">
          Is this you? If you did not request this, tap <strong className="text-red-500">No, Block</strong> immediately.
        </p>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <button
            type="button"
            onClick={() => handleResponse('rejected')}
            className="py-3 rounded-2xl bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 text-xs font-bold transition-colors flex items-center justify-center gap-2"
          >
            <X className="w-4 h-4" />
            <span>No, Block</span>
          </button>
          <button
            type="button"
            onClick={() => handleResponse('approved')}
            className="py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20"
          >
            <Check className="w-4 h-4" />
            <span>Yes, It&apos;s Me</span>
          </button>
        </div>
      </div>
    </div>
  );
};
