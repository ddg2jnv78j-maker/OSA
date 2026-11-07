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
  Compass,
} from 'lucide-react';

interface LocationCoords {
  lat: number;
  lng: number;
}

const CITY_COORDINATES: Record<string, LocationCoords> = {
  'ফার্মগেট (Farmgate)': { lat: 23.7561, lng: 90.3872 },
  'ধানমন্ডি ২৭ (Dhanmondi 27)': { lat: 23.7538, lng: 90.3732 },
  'ধানমন্ডি ৩২ (Dhanmondi 32)': { lat: 23.7516, lng: 90.3777 },
  'শাহবাগ (Shahbagh)': { lat: 23.7388, lng: 90.3958 },
  'গুলশান ১ (Gulshan 1)': { lat: 23.7788, lng: 90.4168 },
  'গুলশান ২ (Gulshan 2)': { lat: 23.7925, lng: 90.4152 },
  'বনানী (Banani)': { lat: 23.7937, lng: 90.4066 },
  'উত্তরা সেক্টর ৩ (Uttara Sec 3)': { lat: 23.8681, lng: 90.3986 },
  'মিরপুর ১০ (Mirpur 10)': { lat: 23.8069, lng: 90.3687 },
  'মতিঝিল (Motijheel)': { lat: 23.7330, lng: 90.4172 },
  'মহাখালী (Mohakhali)': { lat: 23.7776, lng: 90.4005 },
  'মোহাম্মদপুর (Mohammadpur)': { lat: 23.7658, lng: 90.3584 },
  'নিউমার্কেট (New Market)': { lat: 23.7335, lng: 90.3838 },
  'বসুন্ধরা আবাসিক (Bashundhara)': { lat: 23.8191, lng: 90.4326 },
  'চট্টগ্রাম জিইসি (Chittagong GEC)': { lat: 22.3592, lng: 91.8219 },
  'সিলেট জিন্দাবাজার (Sylhet)': { lat: 24.8949, lng: 91.8687 },
};

// Real Haversine Distance formula in kilometers
function calculateHaversineDistance(c1: LocationCoords, c2: LocationCoords): number {
  const R = 6371; // Earth radius in km
  const dLat = ((c2.lat - c1.lat) * Math.PI) / 180;
  const dLon = ((c2.lng - c1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((c1.lat * Math.PI) / 180) *
      Math.cos((c2.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const straightLine = R * c;
  // Dhaka road distance factor is ~1.35x straight line
  return Number((straightLine * 1.35).toFixed(1));
}

interface FairRideMeterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FairRideMeterModal: React.FC<FairRideMeterModalProps> = ({ isOpen, onClose }) => {
  const places = Object.keys(CITY_COORDINATES);
  const [pickup, setPickup] = useState(places[0]);
  const [destination, setDestination] = useState(places[1]);
  const [vehicle, setVehicle] = useState<'rickshaw' | 'cng' | 'bike'>('rickshaw');

  if (!isOpen) return null;

  const coord1 = CITY_COORDINATES[pickup] || { lat: 23.75, lng: 90.38 };
  const coord2 = CITY_COORDINATES[destination] || { lat: 23.77, lng: 90.40 };
  const realDistanceKm = Math.max(0.8, calculateHaversineDistance(coord1, coord2));

  // Official BRTA / Dhaka City fare structures
  let fareMin = 40;
  let fareMax = 60;
  let etaMins = 15;
  let trafficStatus = 'মাঝারি ট্রাফিক';

  if (vehicle === 'rickshaw') {
    // Standard Dhaka Rickshaw: ৳30 base for first 1km, ~৳15-20 per additional km
    const base = 35;
    const perKm = 18;
    fareMin = Math.round(base + (realDistanceKm - 1) * perKm);
    fareMax = Math.round(fareMin * 1.25);
    etaMins = Math.round(realDistanceKm * 5.5 + 4);
  } else if (vehicle === 'cng') {
    // Official BRTA CNG Auto-rickshaw Meter:
    // Base ৳40 for first 2km, then ৳12/km, waiting charge ৳2/min
    const base = 40;
    const additionalKm = Math.max(0, realDistanceKm - 2);
    const waitingEst = Math.round(realDistanceKm * 3); // estimated traffic waiting minutes
    const meterFare = Math.round(base + additionalKm * 12 + waitingEst * 2);
    // Real Dhaka street negotiation is ~1.4x meter rate
    fareMin = Math.round(meterFare * 1.3);
    fareMax = Math.round(fareMin * 1.3);
    etaMins = Math.round(realDistanceKm * 3.5 + 6);
  } else {
    // Bike ride-sharing formula (Base ৳30 + ৳14/km + ৳1.5/min)
    const base = 30;
    const rideFare = Math.round(base + realDistanceKm * 14 + realDistanceKm * 2 * 1.5);
    fareMin = Math.max(40, rideFare);
    fareMax = Math.round(fareMin * 1.2);
    etaMins = Math.round(realDistanceKm * 2.8 + 3);
  }

  if (realDistanceKm > 8) {
    trafficStatus = 'দীর্ঘ রুট ও সম্ভাব্য ব্যস্ত ট্রাফিক';
  } else if (realDistanceKm > 4) {
    trafficStatus = 'মাঝারি জ্যাম';
  } else {
    trafficStatus = 'স্বাভাবিক ও ক্লিয়ার রুট';
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
                প্রকৃত জিপিএস দূরত্ব ও বিআরটিএ স্ট্যান্ডার্ড অনুযায়ী গণনাকৃত ভাড়া
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
                {places.map((p) => (
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
                {places.map((p) => (
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
                <TrendingDown className="w-4 h-4" /> প্রস্তাবিত ন্যায্য ভাড়া রেঞ্জ
              </span>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-white/20">
                প্রকৃত দূরত্ব: {realDistanceKm} কি.মি.
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
                {trafficStatus}
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-300">
            <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p>
              বিআরটিএ রেট এবং ঢাকা শহরের গড় দূরত্বের ভিত্তিতে এই হিসাব স্বয়ংক্রিয়ভাবে নির্ধারণ করা হয়। চালক অতিরিক্ত ভাড়া দাবি করলে এই হিসাব অনুযায়ী দরদাম করতে পারেন।
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
