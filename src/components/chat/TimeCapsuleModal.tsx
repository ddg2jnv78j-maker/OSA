import React, { useState } from 'react';
import { Clock, Lock, Sparkles, X, Gift, Key, Calendar, AlertCircle } from 'lucide-react';
import confetti from 'canvas-confetti';

export interface TimeCapsuleData {
  id: string;
  title: string;
  secretMessage: string;
  hint?: string;
  unlockAt: string; // ISO string
  createdAt: string;
  sealedBy: string;
  sealedById: string;
  theme: 'gold' | 'cyber' | 'cosmic' | 'rose';
  isRevealed?: boolean;
}

interface TimeCapsuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendCapsule: (capsule: TimeCapsuleData) => void;
  currentUserName: string;
  currentUserId: string;
  language?: string;
}

export const TimeCapsuleModal: React.FC<TimeCapsuleModalProps> = ({
  isOpen,
  onClose,
  onSendCapsule,
  currentUserName,
  currentUserId,
  language = 'en',
}) => {
  const [title, setTitle] = useState('');
  const [secretMessage, setSecretMessage] = useState('');
  const [hint, setHint] = useState('');
  const [unlockType, setUnlockType] = useState<'preset' | 'custom'>('preset');
  const [presetDuration, setPresetDuration] = useState<number>(3600 * 24); // 24h default
  const [customDateTime, setCustomDateTime] = useState('');
  const [theme, setTheme] = useState<'gold' | 'cyber' | 'cosmic' | 'rose'>('gold');

  if (!isOpen) return null;

  const isBn = language === 'bn';

  const PRESETS = [
    { label: isBn ? '১ ঘন্টা পর' : 'In 1 Hour', seconds: 3600 },
    { label: isBn ? '২৪ ঘন্টা পর (কালকে)' : 'In 24 Hours (Tomorrow)', seconds: 86400 },
    { label: isBn ? '৭ দিন পর' : 'In 7 Days', seconds: 86400 * 7 },
    { label: isBn ? '১ মাস পর (৩০ দিন)' : 'In 1 Month (30 Days)', seconds: 86400 * 30 },
    { label: isBn ? 'নতুন বছর ২০২৭' : 'New Year', seconds: 86400 * 90 },
  ];

  const handleSealAndSend = () => {
    if (!title.trim() || !secretMessage.trim()) return;

    let unlockTime: Date;
    if (unlockType === 'preset') {
      unlockTime = new Date(Date.now() + presetDuration * 1000);
    } else {
      if (!customDateTime) return;
      unlockTime = new Date(customDateTime);
      if (unlockTime.getTime() <= Date.now() + 60000) {
        alert(isBn ? 'অনুগ্রহ করে ভবিষ্যতের কোনো সময় নির্বাচন করুন' : 'Please select a future date and time');
        return;
      }
    }

    const capsule: TimeCapsuleData = {
      id: `capsule_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title: title.trim(),
      secretMessage: secretMessage.trim(),
      hint: hint.trim() || undefined,
      unlockAt: unlockTime.toISOString(),
      createdAt: new Date().toISOString(),
      sealedBy: currentUserName,
      sealedById: currentUserId,
      theme,
    };

    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.8 },
      colors: ['#f59e0b', '#ec4899', '#6366f1', '#10b981'],
    });

    onSendCapsule(capsule);
    setTitle('');
    setSecretMessage('');
    setHint('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-slate-950 text-white rounded-3xl border border-amber-500/30 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Glowing Header */}
        <div className="relative px-6 pt-6 pb-4 bg-gradient-to-b from-amber-950/60 via-slate-900 to-slate-950 border-b border-amber-500/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-300 text-slate-950 flex items-center justify-center shadow-lg shadow-amber-500/30">
                <Lock className="w-6 h-6 stroke-[2.5]" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-amber-200 flex items-center gap-2">
                  {isBn ? 'টাইম ক্যাপসুল (ভবিষ্যতের গোপন বার্তা)' : 'Time Capsule (Sealed Vault)'}
                  <Sparkles className="w-4 h-4 text-amber-400 animate-spin" style={{ animationDuration: '6s' }} />
                </h3>
                <p className="text-xs text-amber-400/80">
                  {isBn
                    ? 'নির্দিষ্ট সময়ের আগে কেউ এই বার্তা পড়তে পারবে না'
                    : 'Cryptographically sealed until your chosen future time'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Form Body */}
        <div className="p-6 overflow-y-auto space-y-4 text-sm flex-1">
          {/* Capsule Title */}
          <div>
            <label className="block text-xs font-semibold text-amber-300 mb-1.5">
              {isBn ? 'ক্যাপসুলের শিরোনাম / উপলক্ষ' : 'Capsule Title / Occasion'}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={isBn ? 'যেমন: আমাদের আগামী ঈদের সারপ্রাইজ' : 'e.g., Open on Eid 2027 / 5th Anniversary'}
              className="w-full px-4 py-2.5 rounded-2xl bg-slate-900 border border-slate-700 focus:border-amber-500 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
          </div>

          {/* Secret Message */}
          <div>
            <label className="block text-xs font-semibold text-amber-300 mb-1.5 flex items-center justify-between">
              <span>{isBn ? 'গোপন বার্তা (লক থাকবে)' : 'Secret Message (Stays Sealed)'}</span>
              <span className="text-[10px] text-amber-400/70 flex items-center gap-1">
                <Key className="w-3 h-3" /> {isBn ? 'এনক্রিপ্টেড' : 'End-to-End Vault'}
              </span>
            </label>
            <textarea
              rows={4}
              value={secretMessage}
              onChange={(e) => setSecretMessage(e.target.value)}
              placeholder={
                isBn
                  ? 'এখানে আপনার মনের কথা, প্রতিশ্রুতি বা গোপন সারপ্রাইজ লিখুন...'
                  : 'Write your heartfelt message, secret promise, or future confession here...'
              }
              className="w-full px-4 py-3 rounded-2xl bg-slate-900 border border-slate-700 focus:border-amber-500 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 resize-none"
            />
          </div>

          {/* Optional Teaser Hint */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              {isBn ? 'কৌতূহলোদ্দীপক ইঙ্গিত (ঐচ্ছিক)' : 'Teaser Hint (Visible before unlock - Optional)'}
            </label>
            <input
              type="text"
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              placeholder={isBn ? 'যেমন: কক্সবাজারের সেই রাতের কথা মনে আছে?' : 'e.g. Think of the promise we made in 2024...'}
              className="w-full px-4 py-2.5 rounded-2xl bg-slate-900 border border-slate-700 focus:border-amber-500 text-white placeholder-slate-500 text-sm focus:outline-none"
            />
          </div>

          {/* Unlock Timing Selector */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-amber-300">
              {isBn ? 'কখন আনলক হবে?' : 'When should it unlock?'}
            </label>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setUnlockType('preset')}
                className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all ${
                  unlockType === 'preset'
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md font-bold'
                    : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                }`}
              >
                {isBn ? 'নির্দিষ্ট সময় পর' : 'Quick Presets'}
              </button>
              <button
                type="button"
                onClick={() => setUnlockType('custom')}
                className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all ${
                  unlockType === 'custom'
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md font-bold'
                    : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                }`}
              >
                {isBn ? 'কাস্টম তারিখ ও সময়' : 'Exact Date & Time'}
              </button>
            </div>

            {unlockType === 'preset' ? (
              <div className="grid grid-cols-2 gap-1.5 pt-1">
                {PRESETS.map((p) => (
                  <button
                    key={p.seconds}
                    type="button"
                    onClick={() => setPresetDuration(p.seconds)}
                    className={`py-2 px-3 rounded-xl text-xs text-left border transition-all flex items-center justify-between ${
                      presetDuration === p.seconds
                        ? 'bg-amber-950/60 border-amber-500 text-amber-200 font-semibold'
                        : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span>{p.label}</span>
                    <Clock className="w-3.5 h-3.5 opacity-60" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="pt-1">
                <input
                  type="datetime-local"
                  value={customDateTime}
                  onChange={(e) => setCustomDateTime(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-2xl bg-slate-900 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-500"
                />
              </div>
            )}
          </div>

          {/* Theme Visual Style */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              {isBn ? 'ক্যাপসুলের স্টাইল' : 'Vault Hologram Style'}
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { id: 'gold', label: 'Gold', color: 'from-amber-500 to-yellow-600' },
                { id: 'cyber', label: 'Cyber', color: 'from-cyan-500 to-blue-600' },
                { id: 'cosmic', label: 'Cosmic', color: 'from-purple-500 to-indigo-600' },
                { id: 'rose', label: 'Rose', color: 'from-pink-500 to-rose-600' },
              ].map((th) => (
                <button
                  key={th.id}
                  type="button"
                  onClick={() => setTheme(th.id as any)}
                  className={`py-2 px-1 rounded-xl text-xs font-medium border flex flex-col items-center gap-1 transition-all ${
                    theme === th.id
                      ? 'border-amber-400 bg-amber-500/10 text-white font-bold ring-2 ring-amber-400/40'
                      : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full bg-gradient-to-tr ${th.color}`} />
                  <span className="text-[10px]">{th.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-900/80 border-t border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <AlertCircle className="w-4 h-4 text-amber-400" />
            <span>{isBn ? 'সিল করার পর পরিবর্তন অসম্ভব' : 'Cannot be altered once sealed'}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              {isBn ? 'বাতিল' : 'Cancel'}
            </button>
            <button
              type="button"
              disabled={!title.trim() || !secretMessage.trim()}
              onClick={handleSealAndSend}
              className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600 text-slate-950 text-xs font-bold shadow-lg shadow-amber-500/30 hover:scale-[1.02] active:scale-95 disabled:opacity-40 transition-all flex items-center gap-2"
            >
              <Lock className="w-4 h-4 stroke-[2.5]" />
              <span>{isBn ? 'ক্যাপসুল সিল করে পাঠান' : 'Seal & Send Capsule'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
