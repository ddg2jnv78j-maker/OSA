import React, { useState } from 'react';
import {
  Navigation,
  MapPin,
  Clock,
  AlertTriangle,
  CheckCircle,
  X,
  Bike,
  Car,
  TrendingDown,
  Info,
} from 'lucide-react';

interface FairRideMeterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const COMMON_PLACES = [
  'ফার্মগেট',
  'ধানমন্ডি ২৭',
  'ধানমন্ডি ৩২',
  'শাহবাগ',
  'গুলশান ১',
  'গুলশান ২',
  'বনানী',
  'উত্তরা সেক্টর ৩',
  'মিরপুর ১০',
  'মতিঝিল',
  'মহাখালী',
  'মোহাম্মদপুর',
  'নিউমার্কেট',
  'বসুন্ধরা আবাসিক',
];

export const FairRideMeterModal: React.FC<FairRideMeterModalProps> = ({ isOpen, onClose }) => {
  const [pickup, setPickup] = useState('ফার্মগেট');
  const [destination, setDestination] = useState('ধানমন্ডি ২৭');
  const [vehicle, setVehicle] = useState<'rickshaw' | 'cng' | 'bike'>('rickshaw');

  if (!isOpen) return null;

  // Dynamic estimate calculation based on fake distance
  const isFar =
    (pickup.includes('উত্তরা') && destination.includes('মতিঝিল')) ||
    (pickup.includes('মিরপুর') && destination.includes('গুলশান'));

  let estKm = isFar ? 14 : 4.5;
  let fareMin = 50;
  let fareMax = 70;
  let etaMins = 20;
  let jamLevel: 'heavy' | 'moderate' | 'light' = 'moderate';

  if (vehicle === 'rickshaw') {
    fareMin = Math.round(estKm * 18);
    fareMax = Math.round(fareMin + 25);
    etaMins = Math.round(estKm * 5);
  } else if (vehicle === 'cng') {
    fareMin = Math.round(estKm * 28 + 60);
    fareMax = Math.round(fareMin + 40);
    etaMins = Math.round(estKm * 3);
  } else {
    // bike
    fareMin = Math.round(estKm * 15 + 40);
    fareMax = Math.round(fareMin + 20);
    etaMins = Math.round(estKm * 2.5);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-600 text-white flex items-center justify-center shadow-lg shadow-emerald-500/25">
              <Navigation className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                ন্যায্য রিকশা/সিএনজি ভাড়া ও ট্রাফিক মিটার
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                অতিরিক্ত ভাড়া পরিহার করুন এবং লাইভ জ্যামের আপডেট জানুন
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
          {/* Pickup and Drop inputs */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5 mb-1">
                <MapPin className="w-3.5 h-3.5 text-emerald-500" />
                কোথা থেকে রওনা হবেন:
              </label>
              <select
                value={pickup}
                onChange={(e) => setPickup(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-medium focus:outline-none focus:border-emerald-500"
              >
                {COMMON_PLACES.map((p) => (
                  <option key={'from_' + p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5 mb-1">
                <MapPin className="w-3.5 h-3.5 text-red-500" />
                গন্তব্য স্থান:
              </label>
              <select
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-medium focus:outline-none focus:border-emerald-500"
              >
                {COMMON_PLACES.map((p) => (
                  <option key={'to_' + p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Vehicle Selector */}
          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">
              যানবাহন নির্বাচন করুন:
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setVehicle('rickshaw')}
                className={`p-3 rounded-2xl text-center border transition ${
                  vehicle === 'rickshaw'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-700 dark:text-emerald-400 font-bold shadow-sm'
                    : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                }`}
              >
                <span className="text-xl block mb-1">🛺</span>
                <span className="text-xs block">রিকশা</span>
              </button>
              <button
                type="button"
                onClick={() => setVehicle('cng')}
                className={`p-3 rounded-2xl text-center border transition ${
                  vehicle === 'cng'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-700 dark:text-emerald-400 font-bold shadow-sm'
                    : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                }`}
              >
                <Car className="w-5 h-5 mx-auto mb-1 text-emerald-600" />
                <span className="text-xs block">সিএনজি</span>
              </button>
              <button
                type="button"
                onClick={() => setVehicle('bike')}
                className={`p-3 rounded-2xl text-center border transition ${
                  vehicle === 'bike'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-700 dark:text-emerald-400 font-bold shadow-sm'
                    : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                }`}
              >
                <Bike className="w-5 h-5 mx-auto mb-1 text-blue-600" />
                <span className="text-xs block">বাইক</span>
              </button>
            </div>
          </div>

          {/* Fare Card Result */}
          <div className="p-5 rounded-3xl bg-gradient-to-br from-emerald-600 via-teal-600 to-emerald-700 text-white shadow-xl shadow-emerald-600/25 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-100 flex items-center gap-1">
                <TrendingDown className="w-4 h-4" /> প্রস্তাবিত ন্যায্য ভাড়া
              </span>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-white/20">
                আনুমানিক {estKm} কি.মি.
              </span>
            </div>

            <div className="flex items-baseline gap-2">
              <h3 className="text-3xl font-black">৳{fareMin} - ৳{fareMax}</h3>
              <span className="text-xs text-emerald-100">টাকা</span>
            </div>

            <div className="pt-2 border-t border-white/20 flex items-center justify-between text-xs text-emerald-50">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> আনুমানিক সময়: {etaMins} মিনিট
              </span>
              <span className="flex items-center gap-1 font-bold">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-300" />
                ট্রাফিক: মাঝারি জ্যাম
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-300">
            <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p>
              বৃষ্টি বা অফিস ছুটির সময়ে ভাড়া কিছুটা বাড়তে পারে। তবে স্বাভাবিক সময়ে এর চেয়ে অতিরিক্ত ভাড়া চাওয়া হলে দরদাম করে এই রেঞ্জে রাখার পরামর্শ দেওয়া হচ্ছে।
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
