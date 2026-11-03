import React, { useState, useEffect, useRef } from 'react';
import {
  PhoneCall,
  PhoneOff,
  Phone,
  X,
  Volume2,
  Clock,
  User,
  ShieldAlert,
  Play,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import {
  startIncomingCallRingtone,
  stopIncomingCallRingtone,
} from '../../services/ringtoneService';

interface FakeCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  language?: string;
  defaultCallerName?: string;
}

export const FakeCallModal: React.FC<FakeCallModalProps> = ({
  isOpen,
  onClose,
  language = 'en',
  defaultCallerName,
}) => {
  const isBn = language === 'bn';

  const [callerName, setCallerName] = useState(defaultCallerName || 'Boss / অফিস');
  const [callerPhone, setCallerPhone] = useState('+880 1711-234567');
  const [delaySeconds, setDelaySeconds] = useState<number>(5);
  const [isCountingDown, setIsCountingDown] = useState(false);
  const [countdownLeft, setCountdownLeft] = useState(0);
  const [isCallRinging, setIsCallRinging] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const countdownTimerRef = useRef<number | null>(null);
  const callDurationTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      if (callDurationTimerRef.current) clearInterval(callDurationTimerRef.current);
      stopIncomingCallRingtone();
    };
  }, []);

  if (!isOpen) return null;

  const startCountdown = () => {
    if (delaySeconds === 0) {
      triggerRinging();
      return;
    }
    setIsCountingDown(true);
    setCountdownLeft(delaySeconds);

    countdownTimerRef.current = window.setInterval(() => {
      setCountdownLeft((prev) => {
        if (prev <= 1) {
          clearInterval(countdownTimerRef.current!);
          setIsCountingDown(false);
          triggerRinging();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const triggerRinging = () => {
    setIsCallRinging(true);
    startIncomingCallRingtone('fake_emergency_caller', 'fake_call_' + Date.now());
    try {
      if ('vibrate' in navigator) {
        navigator.vibrate([800, 400, 800, 400, 800]);
      }
    } catch {}
  };

  const acceptCall = () => {
    stopIncomingCallRingtone();
    setIsCallRinging(false);
    setIsCallActive(true);
    setCallDuration(0);

    callDurationTimerRef.current = window.setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
  };

  const declineOrEndCall = () => {
    stopIncomingCallRingtone();
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    if (callDurationTimerRef.current) clearInterval(callDurationTimerRef.current);
    setIsCallRinging(false);
    setIsCallActive(false);
    setIsCountingDown(false);
    onClose();
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Full Screen Incoming Call Simulation Screen
  if (isCallRinging) {
    return (
      <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col justify-between items-center py-16 px-6 text-white animate-fade-in select-none">
        <div className="text-center space-y-3 mt-8">
          <div className="w-28 h-28 mx-auto rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 border-4 border-white/20 shadow-2xl flex items-center justify-center text-4xl font-extrabold animate-pulse">
            {callerName.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{callerName}</h2>
            <p className="text-sm text-slate-400 font-mono mt-0.5">{callerPhone}</p>
            <p className="text-xs text-blue-400 font-semibold tracking-wide uppercase mt-2 animate-bounce">
              {isBn ? 'ইনকামিং কল...' : 'Incoming Call...'}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="w-full max-w-xs flex items-center justify-around mb-8">
          {/* Decline */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={declineOrEndCall}
              className="w-18 h-18 rounded-full bg-rose-600 hover:bg-rose-500 active:scale-95 transition-all shadow-xl shadow-rose-600/40 flex items-center justify-center"
            >
              <PhoneOff className="w-8 h-8 text-white" />
            </button>
            <span className="text-xs font-semibold text-slate-400">
              {isBn ? 'কেটে দিন' : 'Decline'}
            </span>
          </div>

          {/* Accept */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={acceptCall}
              className="w-18 h-18 rounded-full bg-emerald-600 hover:bg-emerald-500 active:scale-95 transition-all shadow-xl shadow-emerald-600/40 flex items-center justify-center animate-pulse"
            >
              <PhoneCall className="w-8 h-8 text-white" />
            </button>
            <span className="text-xs font-semibold text-slate-400">
              {isBn ? 'রিসিভ করুন' : 'Accept'}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Active Simulated Call Screen
  if (isCallActive) {
    return (
      <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col justify-between items-center py-16 px-6 text-white animate-fade-in select-none">
        <div className="text-center space-y-3 mt-8">
          <div className="w-24 h-24 mx-auto rounded-full bg-slate-800 border-2 border-emerald-500/50 flex items-center justify-center text-3xl font-extrabold text-slate-200">
            {callerName.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{callerName}</h2>
            <p className="text-sm text-emerald-400 font-mono mt-1 font-bold">
              {formatSeconds(callDuration)}
            </p>
            <p className="text-xs text-slate-400 mt-2">
              {isBn ? 'জরুরি কল চালু আছে (কথা বলার ভান করুন)' : 'Simulated call connected (Pretend to talk)'}
            </p>
          </div>
        </div>

        {/* Audio Wave Simulation */}
        <div className="flex items-center gap-1.5 h-12">
          {[40, 75, 100, 60, 85, 45, 95, 30, 70, 50].map((h, i) => (
            <div
              key={i}
              className="w-1.5 bg-emerald-500/80 rounded-full animate-pulse"
              style={{
                height: `${h}%`,
                animationDelay: `${i * 100}ms`,
                animationDuration: '800ms',
              }}
            />
          ))}
        </div>

        {/* Hang Up Button */}
        <div className="mb-8 flex flex-col items-center gap-2">
          <button
            onClick={declineOrEndCall}
            className="w-18 h-18 rounded-full bg-rose-600 hover:bg-rose-500 active:scale-95 transition-all shadow-xl shadow-rose-600/40 flex items-center justify-center"
          >
            <PhoneOff className="w-8 h-8 text-white" />
          </button>
          <span className="text-xs font-semibold text-slate-400">
            {isBn ? 'কল শেষ করুন' : 'End Call'}
          </span>
        </div>
      </div>
    );
  }

  // Setup Modal
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-rose-600 to-pink-600 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-white shadow-inner">
              <PhoneCall className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">
                {isBn ? 'ফেক ইনকামিং কল সেভিয়র' : 'Fake Call Escape Savior'}
              </h3>
              <p className="text-xs text-white/80">
                {isBn ? 'জরুরি পরিস্থিতি বা মিটিং থেকে বাঁচার স্মার্ট কল' : 'Escape awkward situations with a realistic call'}
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
          {/* Quick presets */}
          <div>
            <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
              {isBn ? 'কলার প্রিসেট পছন্দ করুন' : 'Select Caller Identity'}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { name: isBn ? 'অফিস / বস' : 'Boss', phone: '+880 1711-234567' },
                { name: isBn ? 'আম্মু (বাসা)' : 'Mom (Home)', phone: '+880 1819-876543' },
                { name: isBn ? 'জরুরি ডাক্তার' : 'Doctor / Clinic', phone: '+880 1912-345678' },
              ].map((p, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setCallerName(p.name);
                    setCallerPhone(p.phone);
                  }}
                  className={`p-2 rounded-2xl border text-left transition-all ${
                    callerName === p.name
                      ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300'
                      : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <p className="text-xs font-bold truncate">{p.name}</p>
                  <p className="text-[10px] text-slate-400 truncate">{p.phone}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Caller Details */}
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">
                {isBn ? 'কলার নাম' : 'Caller Name'}
              </label>
              <input
                type="text"
                value={callerName}
                onChange={(e) => setCallerName(e.target.value)}
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-800 dark:text-slate-100 outline-none"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">
                {isBn ? 'কলার ফোন নম্বর' : 'Caller Phone Number'}
              </label>
              <input
                type="text"
                value={callerPhone}
                onChange={(e) => setCallerPhone(e.target.value)}
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-mono text-slate-800 dark:text-slate-100 outline-none"
              />
            </div>

            {/* Delay selector */}
            <div>
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-rose-500" />
                {isBn ? 'কতক্ষণ পর কল বাজবে?' : 'Ring Delay'}
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: isBn ? 'তৎক্ষণাৎ' : 'Instant', sec: 0 },
                  { label: isBn ? '৫ সেকেন্ড' : '5 sec', sec: 5 },
                  { label: isBn ? '১৫ সেকেন্ড' : '15 sec', sec: 15 },
                  { label: isBn ? '৩০ সেকেন্ড' : '30 sec', sec: 30 },
                ].map((d) => (
                  <button
                    key={d.sec}
                    type="button"
                    onClick={() => setDelaySeconds(d.sec)}
                    className={`py-1.5 text-xs font-bold rounded-xl border transition-all ${
                      delaySeconds === d.sec
                        ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Countdown notice if active */}
          {isCountingDown && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-2xl flex items-center justify-between animate-pulse">
              <span className="text-xs font-bold text-amber-800 dark:text-amber-300">
                {isBn ? `কল বাজতে বাকি: ${countdownLeft} সেকেন্ড` : `Calling in: ${countdownLeft}s...`}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
                  setIsCountingDown(false);
                }}
                className="text-xs font-bold text-rose-600 hover:underline"
              >
                {isBn ? 'বাতিল' : 'Cancel'}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
          >
            {isBn ? 'বন্ধ করুন' : 'Close'}
          </button>
          <button
            type="button"
            onClick={startCountdown}
            disabled={isCountingDown}
            className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 rounded-xl shadow-lg shadow-rose-600/30 flex items-center gap-1.5 transition-all"
          >
            <PhoneCall className="w-3.5 h-3.5" />
            {isBn ? 'কল ট্রিগার করুন' : 'Trigger Fake Call'}
          </button>
        </div>
      </div>
    </div>
  );
};
