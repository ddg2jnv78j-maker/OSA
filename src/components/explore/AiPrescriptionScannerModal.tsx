import React, { useState } from 'react';
import {
  FileSearch,
  Camera,
  Upload,
  CheckCircle,
  Clock,
  Sparkles,
  Calendar,
  AlertCircle,
  X,
  Pill,
} from 'lucide-react';

interface Medicine {
  id: string;
  name: string;
  dosage: string; // e.g. 1 + 0 + 1
  timing: string; // খাবার পর
  duration: string; // ৭ দিন
}

interface AiPrescriptionScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AiPrescriptionScannerModal: React.FC<AiPrescriptionScannerModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const [scannedImage, setScannedImage] = useState<string | null>(null);
  const [extractedMeds, setExtractedMeds] = useState<Medicine[] | null>(null);
  const [scheduledSuccess, setScheduledSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSimulateScan = () => {
    setIsScanning(true);
    setScheduledSuccess(false);

    setTimeout(() => {
      setIsScanning(false);
      setExtractedMeds([
        {
          id: 'm1',
          name: 'Napa Extend 665mg (Paracetamol)',
          dosage: '১ + ০ + ১ (সকাল ও রাত)',
          timing: 'ভরা পেটে',
          duration: '৫ দিন',
        },
        {
          id: 'm2',
          name: 'Seclo 20mg (Omeprazole)',
          dosage: '১ + ০ + ১ (সকাল ও রাত)',
          timing: 'খাবার ২০ মিনিট আগে',
          duration: '১৪ দিন',
        },
        {
          id: 'm3',
          name: 'Monas 10mg (Montelukast)',
          dosage: '০ + ০ + ১ (শুধু রাতে)',
          timing: 'ঘুমানোর আগে',
          duration: '৩০ দিন',
        },
        {
          id: 'm4',
          name: 'Fexo 120mg (Fexofenadine)',
          dosage: '১ + ০ + ০ (সকালে)',
          timing: 'খাবারের পর',
          duration: '৭ দিন',
        },
      ]);
    }, 2000);
  };

  const handleAddToSchedule = () => {
    setScheduledSuccess(true);
    try {
      if (extractedMeds) {
        localStorage.setItem('osa_prescription_meds', JSON.stringify(extractedMeds));
      }
    } catch {}
    setTimeout(() => {
      setScheduledSuccess(false);
    }, 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-teal-500/10 via-emerald-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-teal-600 to-emerald-600 text-white flex items-center justify-center shadow-lg shadow-teal-500/25">
              <Pill className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                প্রেসক্রিপশন ও ডকুমেন্ট স্ক্যানার
                <span className="px-2 py-0.5 text-[10px] font-bold bg-teal-100 dark:bg-teal-950/80 text-teal-600 dark:text-teal-400 rounded-full flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> AI Powered
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                ডাক্তারের পেঁচানো হাতের লেখা থেকে ওষুধের নাম ও শিডিউল বের করুন
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
          {!extractedMeds ? (
            <div className="space-y-4">
              <div
                onClick={handleSimulateScan}
                className="p-8 rounded-2xl border-2 border-dashed border-teal-500/50 hover:border-teal-500 bg-teal-50/40 dark:bg-teal-950/20 text-center cursor-pointer transition"
              >
                <div className="w-14 h-14 rounded-2xl bg-teal-500/10 text-teal-600 flex items-center justify-center mx-auto mb-3">
                  <Camera className="w-7 h-7" />
                </div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  প্রেসক্রিপশন বা দলিলের ছবি আপলোড করুন
                </p>
                <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                  ক্যামেরা দিয়ে স্পষ্ট ছবি তুলুন অথবা গ্যালারি থেকে সিলেক্ট করুন
                </p>
              </div>

              {isScanning && (
                <div className="p-5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-center space-y-2">
                  <div className="w-8 h-8 rounded-full border-2 border-teal-600 border-t-transparent animate-spin mx-auto" />
                  <p className="text-xs font-bold text-slate-900 dark:text-white">
                    এআই প্রেসক্রিপশন বিশ্লেষণ করছে...
                  </p>
                  <p className="text-[11px] text-slate-400">ওষুধের নাম, ডোজ ও নিয়ম আলাদা করা হচ্ছে</p>
                </div>
              )}

              <button
                onClick={handleSimulateScan}
                disabled={isScanning}
                className="w-full py-3 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-teal-600/25 transition active:scale-95"
              >
                <Sparkles className="w-4 h-4" />
                {isScanning ? 'স্ক্যান হচ্ছে...' : 'ডেমো প্রেসক্রিপশন ডিজিটাইজ করুন'}
              </button>
            </div>
          ) : (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4" /> ৪টি ওষুধ সফলভাবে সনাক্ত হয়েছে
                </span>
                <button
                  onClick={() => setExtractedMeds(null)}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  নতুন স্ক্যান
                </button>
              </div>

              {/* Medicines list */}
              <div className="space-y-2.5">
                {extractedMeds.map((med, idx) => (
                  <div
                    key={med.id}
                    className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                        {idx + 1}. {med.name}
                      </h4>
                      <span className="px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-950 text-teal-600 dark:text-teal-400 text-[10px] font-bold">
                        {med.duration}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                      <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-1.5 rounded-xl border border-slate-200/50 dark:border-slate-800">
                        <Clock className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                        <span>ডোজ: {med.dosage}</span>
                      </div>
                      <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-1.5 rounded-xl border border-slate-200/50 dark:border-slate-800">
                        <Calendar className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        <span>নিয়ম: {med.timing}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {scheduledSuccess && (
                <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-center">
                  <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    ✓ ওষুধের সময়সূচি ও অ্যালার্মে যুক্ত করা হয়েছে!
                  </p>
                </div>
              )}

              <button
                onClick={handleAddToSchedule}
                className="w-full py-3 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-teal-600/25 transition active:scale-95"
              >
                <Clock className="w-4 h-4" />
                দৈনিক রিমাইন্ডার ও অ্যালার্মে সেট করুন
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
