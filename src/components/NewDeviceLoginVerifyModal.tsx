import React, { useEffect, useState } from 'react';
import { Shield, KeyRound, Loader2, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';
import {
  createDeviceLoginRequest,
  checkDeviceLoginStatus,
  verifySecretRecoveryCode,
} from '../services/highSecurityService';
import { supabase } from '../lib/supabase';

interface NewDeviceLoginVerifyModalProps {
  userId: string;
  userEmail: string;
  onAuthorized: () => void;
  onCancel: () => void;
}

export const NewDeviceLoginVerifyModal: React.FC<NewDeviceLoginVerifyModalProps> = ({
  userId,
  userEmail,
  onAuthorized,
  onCancel,
}) => {
  const [requestId, setRequestId] = useState<string | null>(null);
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [secretCodeInput, setSecretCodeInput] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let timer: any = null;

    const initReq = async () => {
      const reqId = await createDeviceLoginRequest(userId);
      if (isMounted && reqId) {
        setRequestId(reqId);

        // Start polling status
        const poll = async () => {
          if (!isMounted) return;
          const currentStatus = await checkDeviceLoginStatus(reqId);
          if (!isMounted) return;
          setStatus(currentStatus);

          if (currentStatus === 'approved') {
            onAuthorized();
            return;
          }
          if (currentStatus === 'rejected') {
            setErrorMsg('Login request was blocked from your primary device.');
            return;
          }
          timer = setTimeout(poll, 3000);
        };
        poll();
      }
    };

    initReq();

    return () => {
      isMounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [userId, onAuthorized]);

  const handleVerifySecretCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secretCodeInput.trim()) {
      setErrorMsg('Please enter your Secret Recovery Code.');
      return;
    }
    setVerifying(true);
    setErrorMsg(null);

    const isValid = await verifySecretRecoveryCode(userId, secretCodeInput);
    setVerifying(false);

    if (isValid) {
      if (requestId) {
        // Approve request if any pending
        try {
          await supabase.from('device_login_requests').update({ status: 'approved' }).eq('id', requestId);
        } catch {}
      }
      onAuthorized();
    } else {
      setErrorMsg('Incorrect Secret Recovery Code. Please try again.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6 space-y-6 text-center">
        <div className="w-16 h-16 rounded-3xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto shadow-inner">
          <Shield className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">
            OSA High Security Verification
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            You are logging in from a new device. For your security, please approve this login on your primary registered device or use your Secret Recovery Code.
          </p>
        </div>

        {!useRecoveryCode ? (
          <div className="space-y-6 py-4">
            <div className="flex flex-col items-center justify-center space-y-3 p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
              {status === 'pending' && (
                <>
                  <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Waiting for approval on your primary device...
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Check your registered phone/device for the Yes/No prompt.
                  </p>
                </>
              )}
              {status === 'rejected' && (
                <>
                  <AlertCircle className="w-8 h-8 text-red-500" />
                  <p className="text-xs font-bold text-red-600 dark:text-red-400">
                    Login Blocked by Primary Device
                  </p>
                </>
              )}
            </div>

            {errorMsg && (
              <p className="text-xs text-red-500 font-semibold">{errorMsg}</p>
            )}

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setUseRecoveryCode(true)}
                className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1.5"
              >
                <KeyRound className="w-4 h-4" />
                <span>Lost your primary device? Use Secret Recovery Code</span>
              </button>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={onCancel}
                className="w-full py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold transition-colors"
              >
                Cancel Login
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleVerifySecretCode} className="space-y-4 py-2 text-left">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Enter Secret Recovery Code (Gopon Code)
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  placeholder="Enter your secret recovery passphrase..."
                  value={secretCodeInput}
                  onChange={(e) => setSecretCodeInput(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 border-0 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 font-mono"
                  required
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Account Email: <strong className="text-slate-600 dark:text-slate-300">{userEmail}</strong>
              </p>
            </div>

            {errorMsg && (
              <p className="text-xs text-red-500 font-semibold">{errorMsg}</p>
            )}

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setUseRecoveryCode(false)}
                className="py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold transition-colors"
              >
                Back to Approval
              </button>
              <button
                type="submit"
                disabled={verifying}
                className="py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors flex items-center justify-center gap-2 shadow-sm shadow-blue-600/30"
              >
                {verifying ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <span>Verify Code</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
