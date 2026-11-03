import React, { useState, useEffect } from 'react';
import {
  Compass,
  X,
  Moon,
  Sun,
  Sunrise,
  Sunset,
  Clock,
  MapPin,
  Send,
  Volume2,
  VolumeX,
  Sparkles,
  Share2,
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface PrayerTimesModalProps {
  isOpen: boolean;
  onClose: () => void;
  language?: string;
  onShareToChat?: (prayerText: string) => Promise<void>;
}

export const PrayerTimesModal: React.FC<PrayerTimesModalProps> = ({
  isOpen,
  onClose,
  language = 'en',
  onShareToChat,
}) => {
  const isBn = language === 'bn';

  const [selectedCity, setSelectedCity] = useState('Dhaka');
  const [compassHeading, setCompassHeading] = useState(278); // Approx Qibla angle from Bangladesh
  const [sharing, setSharing] = useState(false);

  // Prayer times based on city offset
  const CITY_OFFSETS: Record<string, number> = {
    Dhaka: 0,
    Chittagong: -5,
    Sylhet: -7,
    Rajshahi: +6,
    Khulna: +4,
    Barisal: +1,
    Rangpur: +4,
    Mymensingh: +1,
  };

  const getAdjustedTime = (baseHour: number, baseMinute: number, offsetMinutes: number) => {
    let totalMinutes = baseHour * 60 + baseMinute + offsetMinutes;
    if (totalMinutes < 0) totalMinutes += 1440;
    const h = Math.floor(totalMinutes / 60) % 24;
    const m = totalMinutes % 60;
    const period = h >= 12 ? 'PM' : 'AM';
    const displayH = h % 12 === 0 ? 12 : h % 12;
    return `${displayH}:${m.toString().padStart(2, '0')} ${period}`;
  };

  const offset = CITY_OFFSETS[selectedCity] || 0;

  const PRAYER_SCHEDULE = [
    { name: isBn ? 'ফজর (Fajr)' : 'Fajr', time: getAdjustedTime(4, 55, offset), icon: Sunrise, color: 'text-indigo-400' },
    { name: isBn ? 'সূর্যোদয় (Sunrise)' : 'Sunrise', time: getAdjustedTime(6, 10, offset), icon: Sun, color: 'text-amber-400' },
    { name: isBn ? 'যোহর (Dhuhr)' : 'Dhuhr', time: getAdjustedTime(11, 55, offset), icon: Sun, color: 'text-yellow-400' },
    { name: isBn ? 'আসর (Asr)' : 'Asr', time: getAdjustedTime(15, 45, offset), icon: Sun, color: 'text-orange-400' },
    { name: isBn ? 'মাগরিব / ইফতার (Maghrib)' : 'Maghrib (Iftar)', time: getAdjustedTime(17, 30, offset), icon: Sunset, color: 'text-rose-400' },
    { name: isBn ? 'ইশা (Isha)' : 'Isha', time: getAdjustedTime(18, 50, offset), icon: Moon, color: 'text-purple-400' },
  ];

  const sehriTime = getAdjustedTime(4, 45, offset);
  const iftarTime = getAdjustedTime(17, 30, offset);

  // Compass device orientation support if available
  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.alpha !== null) {
        setCompassHeading(Math.round(e.alpha));
      }
    };
    if (window.DeviceOrientationEvent) {
      window.addEventListener('deviceorientation', handleOrientation);
    }
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, []);

  if (!isOpen) return null;

  const handleShare = async () => {
    if (!onShareToChat) return;
    setSharing(true);
    const text = `🕌 [OSA Prayer Times - ${selectedCity}]\n` +
      `📅 Date: ${new Date().toLocaleDateString(isBn ? 'bn-BD' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}\n` +
      `🌅 Sehri Ends: ${sehriTime} | 🌇 Iftar: ${iftarTime}\n` +
      `----------------------------\n` +
      PRAYER_SCHEDULE.map((p) => `• ${p.name}: ${p.time}`).join('\n') +
      `\n🧭 Qibla Direction: ~278° (West-North-West)\n✨ Shared via OSA Islamic Lifestyle`;

    try {
      await onShareToChat(text);
      confetti({ particleCount: 50, spread: 60 });
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-emerald-600 via-teal-600 to-green-700 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-white shadow-inner">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">
                {isBn ? 'নামাজের সময়সূচি ও কিবলা কম্পাস' : 'Prayer Times & Qibla Compass'}
              </h3>
              <p className="text-xs text-white/80">
                {isBn ? 'সঠিক ওয়াক্ত, সেহরি/ইফতার ও কিবলা নির্দেশক' : 'Accurate prayer times & Qibla bearing'}
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
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {/* City Selector */}
          <div className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
              <MapPin className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>{isBn ? 'জেলা / অঞ্চল:' : 'Location:'}</span>
            </div>
            <select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              className="px-3 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-emerald-600 dark:text-emerald-400 outline-none"
            >
              {Object.keys(CITY_OFFSETS).map((city) => (
                <option key={city} value={city}>
                  {city} {CITY_OFFSETS[city] !== 0 ? `(${CITY_OFFSETS[city] > 0 ? '+' : ''}${CITY_OFFSETS[city]}m)` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Ramadan / Sehri & Iftar Banner */}
          <div className="grid grid-cols-2 gap-2.5 p-3 rounded-2xl bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 text-center">
            <div className="space-y-0.5">
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                {isBn ? 'সেহরি শেষ' : 'Sehri Ends'}
              </p>
              <p className="text-base font-extrabold text-emerald-700 dark:text-emerald-300">
                {sehriTime}
              </p>
            </div>
            <div className="space-y-0.5 border-l border-emerald-200 dark:border-emerald-800">
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                {isBn ? 'ইফতার / মাগরিব' : 'Iftar Time'}
              </p>
              <p className="text-base font-extrabold text-teal-700 dark:text-teal-300">
                {iftarTime}
              </p>
            </div>
          </div>

          {/* Prayer Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {PRAYER_SCHEDULE.map((p, idx) => {
              const Icon = p.icon;
              return (
                <div
                  key={idx}
                  className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate">
                      {p.name}
                    </span>
                    <Icon className={`w-3.5 h-3.5 ${p.color}`} />
                  </div>
                  <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100 mt-2">
                    {p.time}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Interactive Qibla Compass Visual */}
          <div className="p-4 rounded-2xl bg-slate-900 text-white flex flex-col items-center justify-center space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between w-full text-xs text-slate-400">
              <span className="font-semibold">{isBn ? 'কিবলা কম্পাস' : 'Qibla Compass'}</span>
              <span className="font-mono text-emerald-400 font-bold">~278° WNW (মক্কা)</span>
            </div>

            <div className="w-28 h-28 rounded-full border-2 border-slate-700 relative flex items-center justify-center shadow-inner">
              <span className="absolute top-1 text-[10px] font-bold text-rose-500">N</span>
              <span className="absolute bottom-1 text-[10px] font-bold text-slate-500">S</span>
              <span className="absolute right-1 text-[10px] font-bold text-slate-500">E</span>
              <span className="absolute left-1 text-[10px] font-bold text-emerald-400 font-extrabold">W (কিবলা)</span>

              {/* Kaaba Direction Needle */}
              <div
                className="w-1.5 h-18 bg-gradient-to-t from-emerald-500 to-emerald-300 rounded-full transition-transform duration-700 shadow-lg shadow-emerald-500/50"
                style={{ transform: `rotate(${278 - compassHeading}deg)` }}
              />
              <div className="w-3.5 h-3.5 rounded-full bg-slate-950 border-2 border-emerald-400 absolute" />
            </div>

            <p className="text-[11px] text-slate-400 text-center">
              {isBn ? 'বাংলাদেশ থেকে কিবলা দিক প্রায় ২৭৮° (পশ্চিম-উত্তর-পশ্চিম)' : 'From Bangladesh, Qibla is approx 278° towards West'}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <p className="text-[11px] text-slate-400">
            {isBn ? 'নামাজের রিমাইন্ডার বন্ধুদের সাথে শেয়ার করুন' : 'Share prayer reminder in conversation'}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              {isBn ? 'বন্ধ' : 'Close'}
            </button>
            {onShareToChat && (
              <button
                type="button"
                onClick={handleShare}
                disabled={sharing}
                className="px-4 py-1.5 text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 rounded-xl shadow-md shadow-emerald-600/30 flex items-center gap-1.5 transition-all"
              >
                <Share2 className="w-3.5 h-3.5" />
                {sharing ? (isBn ? 'পাঠানো হচ্ছে...' : 'Sharing...') : isBn ? 'চ্যাটে শেয়ার করুন' : 'Share to Chat'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
