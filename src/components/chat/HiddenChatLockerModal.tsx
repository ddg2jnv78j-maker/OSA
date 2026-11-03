import React, { useState } from 'react';
import {
  Lock,
  Unlock,
  KeyRound,
  EyeOff,
  Eye,
  X,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';

interface HiddenChatLockerModalProps {
  isOpen: boolean;
  onClose: () => void;
  language?: string;
  chatId: string;
  chatTitle: string;
  onLockUpdated?: (isLocked: boolean) => void;
}

export const HiddenChatLockerModal: React.FC<HiddenChatLockerModalProps> = ({
  isOpen,
  onClose,
  language = 'en',
  chatId,
  chatTitle,
  onLockUpdated,
}) => {
  const isBn = language === 'bn';

  const storageKey = `osa_chat_lock_${chatId}`;
  const existingPin = (() => {
    try {
      return localStorage.getItem(storageKey) || '';
    } catch {
      return '';
    }
  })();

  const [pin, setPin] = useState(existingPin);
  const [confirmPin, setConfirmPin] = useState('');
  const [hideFromList, setHideFromList] = useState(() => {
    try {
      return localStorage.getItem(`osa_chat_invisible_${chatId}`) === 'true';
    } catch {
      return false;
    }
  });
  const [errorMsg, setErrorMsg] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSave = () => {
    setErrorMsg('');
    if (!pin.trim()) {
      // Remove lock
      try {
        localStorage.removeItem(storageKey);
        localStorage.removeItem(`osa_chat_invisible_${chatId}`);
      } catch {}
      setSavedSuccess(true);
      if (onLockUpdated) onLockUpdated(false);
      setTimeout(onClose, 800);
      return;
    }

    if (pin.length < 4) {
      setErrorMsg(isBn ? 'পিন অন্তত ৪ ডিজিট হতে হবে' : 'PIN must be at least 4 digits');
      return;
    }

    if (!existingPin && pin !== confirmPin) {
      setErrorMsg(isBn ? 'কনফার্ম পিন মেলেনি' : 'Confirm PIN does not match');
      return;
    }

    try {
      localStorage.setItem(storageKey, pin);
      localStorage.setItem(`osa_chat_invisible_${chatId}`, hideFromList ? 'true' : 'false');
    } catch {}

    setSavedSuccess(true);
    if (onLockUpdated) onLockUpdated(true);
    setTimeout(onClose, 900);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-slate-800 to-slate-950 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center text-amber-400 shadow-inner">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">
                {isBn ? 'ইনভিজিবল চ্যাট লকার' : 'Ghost / PIN Chat Locker'}
              </h3>
              <p className="text-xs text-white/70">
                {isBn ? `"${chatTitle}" চ্যাটটি সুরক্ষিত করুন` : `Protect "${chatTitle}" with secure PIN`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-2xl flex items-start gap-2.5">
            <EyeOff className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
              {isBn
                ? 'চ্যাট লক করলে এটি খোলার সময় পিন চাইবে। "ইনভিজিবল" চালু করলে চ্যাটলিস্ট থেকে অদৃশ্য হয়ে যাবে, সার্চ বারে পিন লিখলে তবেই আসবে।'
                : 'Locked chats require a PIN to open. Enabling "Invisible" hides it from the main list until you search your secret PIN.'}
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">
                {existingPin ? (isBn ? 'নতুন পিন (খালি রাখলে লক উঠে যাবে)' : 'New PIN (Leave blank to remove)') : (isBn ? '৪-ডিজিট সিক্রেট পিন' : '4-Digit Secret PIN')}
              </label>
              <input
                type="password"
                maxLength={8}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-center text-lg tracking-widest font-mono text-slate-800 dark:text-slate-100 outline-none focus:border-amber-500"
              />
            </div>

            {!existingPin && (
              <div>
                <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">
                  {isBn ? 'পিন নিশ্চিত করুন (Confirm PIN)' : 'Confirm PIN'}
                </label>
                <input
                  type="password"
                  maxLength={8}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-center text-lg tracking-widest font-mono text-slate-800 dark:text-slate-100 outline-none focus:border-amber-500"
                />
              </div>
            )}

            {/* Invisible Toggle */}
            <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                  {isBn ? 'চ্যাট সম্পূর্ণ অদৃশ্য রাখুন (Ghost Mode)' : 'Hide Chat From List'}
                </span>
                <span className="text-[11px] text-slate-400">
                  {isBn ? 'সার্চ বারে পিন না দিলে দেখা যাবে না' : 'Only appears when searching PIN'}
                </span>
              </div>
              <input
                type="checkbox"
                checked={hideFromList}
                onChange={(e) => setHideFromList(e.target.checked)}
                className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
              />
            </div>

            {errorMsg && (
              <p className="text-xs font-bold text-rose-500 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                {errorMsg}
              </p>
            )}

            {savedSuccess && (
              <p className="text-xs font-bold text-emerald-500 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                {isBn ? 'সফলভাবে সংরক্ষিত হয়েছে!' : 'Settings saved successfully!'}
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
          >
            {isBn ? 'বাতিল' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 dark:bg-amber-600 dark:hover:bg-amber-500 rounded-xl shadow-lg transition-all"
          >
            {isBn ? 'সংরক্ষণ করুন' : 'Save PIN'}
          </button>
        </div>
      </div>
    </div>
  );
};
