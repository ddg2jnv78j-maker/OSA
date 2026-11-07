import React, { useState, useEffect } from 'react';
import {
  Droplet,
  Pill,
  Flame,
  CheckCircle2,
  Plus,
  RotateCcw,
  Sparkles,
  X,
  Clock,
  Bell,
  Trash2,
} from 'lucide-react';

interface MedicineItem {
  id: string;
  name: string;
  time: string;
  isTaken: boolean;
}

const INITIAL_MEDS: MedicineItem[] = [
  { id: '1', name: 'গ্যাস্ট্রিকের ওষুধ (Seclo 20)', time: 'সকাল ৮:০০ (খাবার আগে)', isTaken: false },
  { id: '2', name: 'ভিটামিন ডি ও মাল্টিভিটামিন', time: 'দুপুর ২:০০ (খাবার পর)', isTaken: false },
  { id: '3', name: 'প্রেসার / অ্যান্টাসিড', time: 'রাত ১০:০০ (ঘুমানোর আগে)', isTaken: false },
];

interface HealthHabitTrackerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HealthHabitTrackerModal: React.FC<HealthHabitTrackerModalProps> = ({
  isOpen,
  onClose,
}) => {
  const todayKey = new Date().toISOString().split('T')[0];

  const [glasses, setGlasses] = useState<number>(() => {
    try {
      const savedDate = localStorage.getItem('osa_water_date');
      if (savedDate !== todayKey) {
        localStorage.setItem('osa_water_date', todayKey);
        localStorage.setItem('osa_water_glasses', '0');
        return 0;
      }
      return Number(localStorage.getItem('osa_water_glasses') || '0');
    } catch {
      return 0;
    }
  });

  const [meds, setMeds] = useState<MedicineItem[]>(() => {
    try {
      const savedDate = localStorage.getItem('osa_meds_date');
      const savedMeds = localStorage.getItem('osa_daily_meds');
      if (savedDate !== todayKey) {
        localStorage.setItem('osa_meds_date', todayKey);
        if (savedMeds) {
          const parsed = JSON.parse(savedMeds);
          const reset = parsed.map((m: MedicineItem) => ({ ...m, isTaken: false }));
          localStorage.setItem('osa_daily_meds', JSON.stringify(reset));
          return reset;
        }
        return INITIAL_MEDS;
      }
      return savedMeds ? JSON.parse(savedMeds) : INITIAL_MEDS;
    } catch {
      return INITIAL_MEDS;
    }
  });

  const [newMedName, setNewMedName] = useState('');
  const [newMedTime, setNewMedTime] = useState('');
  const [isAddingMed, setIsAddingMed] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState<string>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'default';
  });

  const [streak, setStreak] = useState<number>(() => {
    try {
      return Number(localStorage.getItem('osa_health_streak') || '1');
    } catch {
      return 1;
    }
  });

  const targetGlasses = 8; // 2 Liters

  useEffect(() => {
    try {
      localStorage.setItem('osa_water_date', todayKey);
      localStorage.setItem('osa_water_glasses', String(glasses));

      // Calculate streak if today's water goal is achieved
      if (glasses >= targetGlasses) {
        const lastGoalAchieved = localStorage.getItem('osa_last_health_goal_date');
        if (lastGoalAchieved !== todayKey) {
          const currentStreak = Number(localStorage.getItem('osa_health_streak') || '0');
          const updated = currentStreak + 1;
          localStorage.setItem('osa_health_streak', String(updated));
          localStorage.setItem('osa_last_health_goal_date', todayKey);
          setStreak(updated);
        }
      }
    } catch {}
  }, [glasses, todayKey]);

  useEffect(() => {
    try {
      localStorage.setItem('osa_meds_date', todayKey);
      localStorage.setItem('osa_daily_meds', JSON.stringify(meds));
    } catch {}
  }, [meds, todayKey]);

  if (!isOpen) return null;

  const addGlass = () => {
    if (glasses < 16) {
      setGlasses((prev) => prev + 1);
    }
  };

  const resetWater = () => {
    setGlasses(0);
  };

  const toggleMed = (id: string) => {
    setMeds((prev) =>
      prev.map((m) => (m.id === id ? { ...m, isTaken: !m.isTaken } : m))
    );
  };

  const handleDeleteMed = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setMeds((prev) => prev.filter((m) => m.id !== id));
  };

  const handleAddMedSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMedName.trim()) return;
    const item: MedicineItem = {
      id: 'med_' + Date.now(),
      name: newMedName.trim(),
      time: newMedTime.trim() || 'সময়মতো',
      isTaken: false,
    };
    setMeds((prev) => [...prev, item]);
    setNewMedName('');
    setNewMedTime('');
    setIsAddingMed(false);
  };

  const handleEnableNotifications = async () => {
    if (!('Notification' in window)) {
      alert('আপনার ব্রাউজার নোটিফিকেশন সাপোর্ট করে না');
      return;
    }
    const perm = await Notification.requestPermission();
    setNotificationStatus(perm);
    if (perm === 'granted') {
      new Notification('OSA হেলথ রিমাইন্ডার সক্রিয়!', {
        body: 'প্রতি ২ ঘণ্টা পর পর পানি ও ওষুধের নিয়মিত নোটিফিকেশন পাবেন।',
        icon: '/icons/osa-icon.svg',
      });
    }
  };

  const percentWater = Math.min(100, Math.round((glasses / targetGlasses) * 100));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-cyan-500/10 via-blue-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 text-white flex items-center justify-center shadow-lg shadow-cyan-500/25">
              <Droplet className="w-6 h-6 fill-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                ওষুধ ও পানি পানের রিয়েল ট্র্যাকার
                <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 rounded-full flex items-center gap-1">
                  <Flame className="w-3 h-3 fill-amber-500 text-amber-500" /> {streak} দিন স্ট্রিক
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                প্রতিদিন স্বয়ংক্রিয়ভাবে রিসেট ও নিয়মিত স্বাস্থ্য হিসাব
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex-1 min-h-0 overflow-y-auto space-y-4">
          {/* Notification Permission Prompt if not granted */}
          {notificationStatus !== 'granted' && (
            <div className="p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-blue-800 dark:text-blue-200 font-medium">
                <Bell className="w-4 h-4 text-blue-600 shrink-0" />
                <span>ওষুধ ও পানি পানের সময়মতো নোটিফিকেশন পেতে চান?</span>
              </div>
              <button
                type="button"
                onClick={handleEnableNotifications}
                className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold shrink-0 transition"
              >
                অন করুন
              </button>
            </div>
          )}

          {/* Water Tracker Section */}
          <div className="p-5 rounded-3xl bg-gradient-to-br from-cyan-500 via-blue-500 to-indigo-600 text-white shadow-xl shadow-cyan-500/20 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-cyan-100 flex items-center gap-1.5">
                <Droplet className="w-4 h-4 fill-cyan-200" /> দৈনিক পানি পান (লক্ষ্য: ৮ গ্লাস / ২ লিটার)
              </span>
              <button
                onClick={resetWater}
                className="text-[10px] text-cyan-200 hover:text-white"
                title="রিসেট করুন"
              >
                আজকের রিসেট
              </button>
            </div>

            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-4xl font-black">{glasses}</span>
                <span className="text-base text-cyan-100 ml-1">/ ৮ গ্লাস ({glasses * 250} ml)</span>
              </div>
              <span className="text-sm font-bold bg-white/20 px-3 py-1 rounded-full">
                {percentWater}% সম্পন্ন
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-black/20 h-3 rounded-full overflow-hidden p-0.5">
              <div
                className="bg-white h-full rounded-full transition-all duration-300"
                style={{ width: `${percentWater}%` }}
              />
            </div>

            <button
              onClick={addGlass}
              className="w-full py-2.5 rounded-2xl bg-white text-blue-600 hover:bg-cyan-50 font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition"
            >
              <Plus className="w-4 h-4" /> এক গ্লাস পানি পান করলাম (+২৫০ml)
            </button>
          </div>

          {/* Daily Medicine Checklist */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Pill className="w-4 h-4 text-rose-500" />
                আজকের নিয়মিত ওষুধের চেকলিস্ট
              </h4>
              <button
                type="button"
                onClick={() => setIsAddingMed(!isAddingMed)}
                className="text-[11px] font-bold text-blue-600 hover:underline flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> নতুন ওষুধ যোগ করুন
              </button>
            </div>

            {/* Add Medicine Form */}
            {isAddingMed && (
              <form onSubmit={handleAddMedSubmit} className="mb-3 p-3 rounded-2xl bg-slate-100 dark:bg-slate-800 space-y-2">
                <input
                  type="text"
                  placeholder="ওষুধের নাম (যেমন: Napa Extra, Seclo...)"
                  value={newMedName}
                  onChange={(e) => setNewMedName(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                  required
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="খাওয়ার সময় (যেমন: রাত ৯:০০ খাবার পর)"
                    value={newMedTime}
                    onChange={(e) => setNewMedTime(e.target.value)}
                    className="flex-1 px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs"
                  >
                    যোগ করুন
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-2">
              {meds.map((m) => (
                <div
                  key={m.id}
                  onClick={() => toggleMed(m.id)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between group ${
                    m.isTaken
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 opacity-90'
                      : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition ${
                        m.isTaken
                          ? 'bg-emerald-500 text-white'
                          : 'border-2 border-slate-300 dark:border-slate-600'
                      }`}
                    >
                      {m.isTaken && <CheckCircle2 className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0">
                      <p
                        className={`text-xs font-bold truncate ${
                          m.isTaken
                            ? 'line-through text-slate-400 dark:text-slate-500'
                            : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {m.name}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5 truncate">
                        <Clock className="w-3 h-3 text-blue-500 shrink-0" />
                        {m.time}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        m.isTaken
                          ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {m.isTaken ? 'খাওয়া সম্পন্ন' : 'বাকি আছে'}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteMed(m.id, e)}
                      className="text-slate-400 hover:text-rose-500 p-1 opacity-0 group-hover:opacity-100 transition"
                      title="মুছুন"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
