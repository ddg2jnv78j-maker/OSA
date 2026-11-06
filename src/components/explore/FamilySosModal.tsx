import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldAlert,
  PhoneCall,
  Volume2,
  VolumeX,
  MapPin,
  Send,
  AlertOctagon,
  Users,
  X,
  Compass,
  CheckCircle,
} from 'lucide-react';

interface FamilySosModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserName?: string;
}

export const FamilySosModal: React.FC<FamilySosModalProps> = ({
  isOpen,
  onClose,
  currentUserName = 'User',
}) => {
  const [trustedName, setTrustedName] = useState('');
  const [trustedPhone, setTrustedPhone] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [isSirenPlaying, setIsSirenPlaying] = useState(false);
  const [isNightModeActive, setIsNightModeActive] = useState(false);
  const [checkInCountdown, setCheckInCountdown] = useState(600); // 10 mins
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sirenIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('osa_trusted_sos_contact');
      if (saved) {
        const parsed = JSON.parse(saved);
        setTrustedName(parsed.name || '');
        setTrustedPhone(parsed.phone || '');
        setIsSaved(true);
      }
    } catch {}
  }, []);

  // Fetch coordinates
  useEffect(() => {
    if (isOpen && 'geolocation' in navigator) {
      setLocationLoading(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCurrentCoords({
            lat: Number(pos.coords.latitude.toFixed(5)),
            lng: Number(pos.coords.longitude.toFixed(5)),
          });
          setLocationLoading(false);
        },
        () => {
          // Default Dhaka center fallback
          setCurrentCoords({ lat: 23.8103, lng: 90.4125 });
          setLocationLoading(false);
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }
  }, [isOpen]);

  const saveTrustedContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trustedPhone.trim()) return;
    try {
      localStorage.setItem(
        'osa_trusted_sos_contact',
        JSON.stringify({ name: trustedName.trim(), phone: trustedPhone.trim() })
      );
      setIsSaved(true);
    } catch {}
  };

  const startSiren = () => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();

      let freq = 600;
      let goingUp = true;
      sirenIntervalRef.current = window.setInterval(() => {
        if (goingUp) {
          freq += 60;
          if (freq >= 1200) goingUp = false;
        } else {
          freq -= 60;
          if (freq <= 500) goingUp = true;
        }
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
      }, 50);

      setIsSirenPlaying(true);
    } catch {}
  };

  const stopSiren = () => {
    if (sirenIntervalRef.current) clearInterval(sirenIntervalRef.current);
    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close();
      } catch {}
      audioCtxRef.current = null;
    }
    setIsSirenPlaying(false);
  };

  useEffect(() => {
    return () => {
      stopSiren();
    };
  }, []);

  if (!isOpen) return null;

  const googleMapsUrl = currentCoords
    ? `https://maps.google.com/?q=${currentCoords.lat},${currentCoords.lng}`
    : 'https://maps.google.com';

  const sosMessageBody = `🚨 জরুরি সাহায্য প্রয়োজন! আমি বিপদে আছি। আমার নাম ${currentUserName}। আমার লাইভ লোকেশন: ${googleMapsUrl}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-red-600/10 via-amber-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-red-600 to-amber-600 text-white flex items-center justify-center shadow-lg shadow-red-500/30">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                উইমেন অ্যান্ড ফ্যামিলি এসওএস শিল্ড
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                জরুরি বিপদ ও রাতের যাতায়াতের সার্বক্ষণিক নিরাপত্তা
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              stopSiren();
              onClose();
            }}
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex-1 min-h-0 overflow-y-auto space-y-4">
          {/* Main 999 Button */}
          <div className="p-4 rounded-3xl bg-gradient-to-br from-red-600 via-rose-600 to-red-700 text-white shadow-xl shadow-red-600/25 flex flex-col items-center text-center">
            <span className="px-3 py-1 rounded-full bg-white/20 text-white text-[11px] font-bold tracking-wider uppercase mb-2">
              National Emergency Service
            </span>
            <h3 className="text-2xl font-black mb-1">বাংলাদেশ জাতীয় জরুরি সেবা</h3>
            <p className="text-xs text-red-100 mb-4 max-w-xs">
              পুলিশ, অ্যাম্বুলেন্স বা ফায়ার সার্ভিসের জন্য এখনই সরাসরি ৯৯৯-এ ডায়াল করুন
            </p>
            <a
              href="tel:999"
              className="px-6 py-3 rounded-2xl bg-white text-red-600 font-extrabold text-sm flex items-center gap-2 shadow-lg hover:bg-red-50 active:scale-95 transition"
            >
              <PhoneCall className="w-5 h-5 animate-bounce" />
              সরাসরি 999-এ কল দিন
            </a>
          </div>

          {/* Siren Alert Button */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  isSirenPlaying
                    ? 'bg-red-600 text-white animate-pulse'
                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                }`}
              >
                <AlertOctagon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  উচ্চশব্দে সাইরেন অ্যালার্ম
                </p>
                <p className="text-xs text-slate-500">আশেপাশের মানুষের দৃষ্টি আকর্ষণের জন্য</p>
              </div>
            </div>

            <button
              onClick={() => {
                if (isSirenPlaying) {
                  stopSiren();
                } else {
                  startSiren();
                }
              }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                isSirenPlaying
                  ? 'bg-red-600 text-white hover:bg-red-700 shadow-md shadow-red-600/30'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-white hover:bg-slate-300'
              }`}
            >
              {isSirenPlaying ? (
                <>
                  <VolumeX className="w-4 h-4" /> সাইরেন বন্ধ
                </>
              ) : (
                <>
                  <Volume2 className="w-4 h-4" /> বাজান
                </>
              )}
            </button>
          </div>

          {/* Current GPS Coordinates */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-emerald-500" />
                আপনার লাইভ লোকেশন লিংক
              </span>
              {locationLoading && (
                <span className="text-[10px] text-slate-400 animate-pulse">খোঁজা হচ্ছে...</span>
              )}
            </div>
            <p className="text-xs font-mono bg-white dark:bg-slate-900 px-3 py-2 rounded-xl text-slate-600 dark:text-slate-300 truncate select-all">
              {googleMapsUrl}
            </p>
          </div>

          {/* Trusted Family Contact */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-blue-500" />
                বিশ্বস্ত পারিবারিক অভিভাবক কন্টাক্ট
              </h4>
              {isSaved && (
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> সেভ করা আছে
                </span>
              )}
            </div>

            <form onSubmit={saveTrustedContact} className="space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="অভিভাবকের নাম (যেমন: আব্বু / ভাই)"
                  value={trustedName}
                  onChange={(e) => setTrustedName(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                />
                <input
                  type="tel"
                  placeholder="মোবাইল নম্বর (+880...)"
                  value={trustedPhone}
                  onChange={(e) => setTrustedPhone(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-300 transition"
                >
                  কন্টাক্ট সেভ করুন
                </button>

                {trustedPhone && (
                  <div className="flex items-center gap-2">
                    <a
                      href={`tel:${trustedPhone}`}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1"
                    >
                      <PhoneCall className="w-3.5 h-3.5" /> কল দিন
                    </a>
                    <a
                      href={`sms:${trustedPhone}?body=${encodeURIComponent(sosMessageBody)}`}
                      className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1 shadow-sm"
                    >
                      <Send className="w-3.5 h-3.5" /> SOS SMS পাঠান
                    </a>
                  </div>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
