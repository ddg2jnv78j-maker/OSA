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
} from 'lucide-react';

interface MedicineItem {
  id: string;
  name: string;
  time: string;
  isTaken: boolean;
}

const DEFAULT_MEDS: MedicineItem[] = [
  { id: '1', name: 'গ্যাস্ট্রিকের ওষুধ (Seclo 20)', time: 'সকাল ৮:০০ (খাবার আগে)', isTaken: true },
  { id: '2', name: 'ভিটামিন ডি ও ক্যালসিয়াম', time: 'দুপুর ২:০০ (খাবার পর)', isTaken: false },
  { id: '3', name: 'প্রেসার / অ্যালার্জি ওষুধ', time: 'রাত ১০:০০ (ঘুমানোর আগে)', isTaken: false },
];

interface HealthHabitTrackerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HealthHabitTrackerModal: React.FC<HealthHabitTrackerModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [glasses, setGlasses] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('osa_water_glasses');
      return saved ? Number(saved) : 4;
    } catch {
      return 4;
    }
  });

  const [meds, setMeds] = useState<MedicineItem[]>(() => {
    try {
      const saved = localStorage.getItem('osa_daily_meds');
      return saved ? JSON.parse(saved) : DEFAULT_MEDS;
    } catch {
      return DEFAULT_MEDS;
    }
  });

  const targetGlasses = 8; // 2 Liters

  useEffect(() => {
    try {
      localStorage.setItem('osa_water_glasses', String(glasses));
    } catch {}
  }, [glasses]);

  useEffect(() => {
    try {
      localStorage.setItem('osa_daily_meds', JSON.stringify(meds));
    } catch {}
  }, [meds]);

  if (!isOpen) return null;

  const addGlass = () => {
    if (glasses < 16) setGlasses((prev) => prev + 1);
  };

  const resetWater = () => {
    setGlasses(0);
  };

  const toggleMed = (id: string) => {
    setMeds(meds.map((m) => (m.id === id ? { ...m, isTaken: !m.isTaken } : m)));
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
                ওষুধ ও পানি পানের স্মার্ট ট্র্যাকার
                <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 rounded-full flex items-center gap-1">
                  <Flame className="w-3 h-3 fill-amber-500 text-amber-500" /> ৫ দিন স্ট্রিক
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                দৈনিক সুস্বাস্থ্য ও নিয়মিত অভ্যাসের লাইভ মনিটর
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
                রিসেট
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
              <span className="text-[11px] text-slate-400">
                {meds.filter((m) => m.isTaken).length}/{meds.length} খাওয়া হয়েছে
              </span>
            </div>

            <div className="space-y-2">
              {meds.map((m) => (
                <div
                  key={m.id}
                  onClick={() => toggleMed(m.id)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                    m.isTaken
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 opacity-90'
                      : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center transition ${
                        m.isTaken
                          ? 'bg-emerald-500 text-white'
                          : 'border-2 border-slate-300 dark:border-slate-600'
                      }`}
                    >
                      {m.isTaken && <CheckCircle2 className="w-4 h-4" />}
                    </div>
                    <div>
                      <p
                        className={`text-xs font-bold ${
                          m.isTaken
                            ? 'line-through text-slate-400 dark:text-slate-500'
                            : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {m.name}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3 text-blue-500" />
                        {m.time}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      m.isTaken
                        ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {m.isTaken ? 'খাওয়া সম্পন্ন' : 'বাকি আছে'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
