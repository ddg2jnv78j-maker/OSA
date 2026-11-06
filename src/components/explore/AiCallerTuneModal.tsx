import React, { useState, useRef } from 'react';
import {
  Music,
  Play,
  Square,
  Sparkles,
  CheckCircle,
  Volume2,
  X,
  Radio,
  Sliders,
} from 'lucide-react';

interface AiCallerTuneModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserName?: string;
}

const TUNES = [
  {
    id: 'formal',
    name: 'অফিসিয়াল ও ভদ্র বাংলা',
    phrase: 'আসসালামু আলাইকুম, {name} ভাইকে ফোন করার জন্য ধন্যবাদ। উনি শীঘ্রই আপনার কলটি রিসিভ করবেন।',
    theme: 'সৌম্য বেহালা ও পিয়ানো',
  },
  {
    id: 'friendly',
    name: 'বন্ধুত্বপূর্ণ দেশি আড্ডা',
    phrase: 'হ্যালো বন্ধু! {name} হয়তো একটু ব্যস্ত আছে, লাইনে থাকুন, কলটা ধরছি এখনই!',
    theme: 'অ্যাকোস্টিক গিটার ও বাঁশি',
  },
  {
    id: 'radio',
    name: 'রেডিও আরজে স্টাইল',
    phrase: 'ইউ আর লিসেনিং টু OSA এফএম! {name} এর ফোনে কল করার জন্য স্পেশাল থ্যাংকস। বাজাচ্ছি আপনার প্রিয় সুর...',
    theme: 'আপবিট ইলেকট্রো বিট',
  },
  {
    id: 'melody',
    name: 'রোমান্টিক ও ক্লাসিক্যাল সুর',
    phrase: 'একটু অপেক্ষা করুন, {name} এর কাছে আপনার বার্তা পৌঁছে যাচ্ছে।',
    theme: 'সফট সান্তুর ও জলতরঙ্গ',
  },
];

export const AiCallerTuneModal: React.FC<AiCallerTuneModalProps> = ({
  isOpen,
  onClose,
  currentUserName = 'রাকিব',
}) => {
  const [userName, setUserName] = useState(currentUserName);
  const [selectedTune, setSelectedTune] = useState(TUNES[0]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);

  if (!isOpen) return null;

  const playSyntheticTune = () => {
    if (isPlaying) {
      stopTune();
      return;
    }

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;

      const notes = [261.63, 329.63, 392.0, 523.25, 392.0, 329.63]; // C E G C G E
      let noteIndex = 0;

      const interval = setInterval(() => {
        if (!audioCtxRef.current || noteIndex >= notes.length * 3) {
          clearInterval(interval);
          stopTune();
          return;
        }

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(notes[noteIndex % notes.length], ctx.currentTime);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.35);

        noteIndex++;
      }, 350);

      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
    }
  };

  const stopTune = () => {
    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close();
      } catch {}
      audioCtxRef.current = null;
    }
    setIsPlaying(false);
  };

  const handleSaveCallerTune = () => {
    try {
      localStorage.setItem(
        'osa_custom_caller_tune',
        JSON.stringify({ name: userName, tuneId: selectedTune.id })
      );
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2500);
    } catch {}
  };

  const formattedPhrase = selectedTune.phrase.replace('{name}', userName || 'ইউজার');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-lg shadow-amber-500/25">
              <Music className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                নিজের নামের কলার টিউন স্টুডিও
                <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 rounded-full flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> AI Voice & Tunes
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                যাঁরা আপনাকে কল করবেন তাঁদের জন্য কাস্টম বাংলা সুর
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              stopTune();
              onClose();
            }}
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex-1 min-h-0 overflow-y-auto space-y-4">
          {/* Name input */}
          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
              আপনার নাম (যেটি ডায়লগে উচ্চারিত হবে):
            </label>
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="আপনার নাম লিখুন..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Select Style */}
          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">
              কলার টিউনের ধরন নির্বাচন করুন:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {TUNES.map((tune) => {
                const isSelected = selectedTune.id === tune.id;
                return (
                  <button
                    key={tune.id}
                    type="button"
                    onClick={() => setSelectedTune(tune)}
                    className={`p-3 rounded-2xl text-left border transition ${
                      isSelected
                        ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-500 text-slate-900 dark:text-white shadow-sm'
                        : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <p className="text-xs font-bold">{tune.name}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{tune.theme}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Audio Preview Card */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent border border-amber-300/50 dark:border-amber-800/50 space-y-3">
            <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 block uppercase tracking-wide">
              লাইভ প্রিভিউ ও ডায়লগ:
            </span>
            <p className="text-xs font-medium text-slate-800 dark:text-slate-200 italic bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
              "{formattedPhrase}"
            </p>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={playSyntheticTune}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
                  isPlaying
                    ? 'bg-red-600 text-white'
                    : 'bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-500/25'
                }`}
              >
                {isPlaying ? (
                  <>
                    <Square className="w-3.5 h-3.5 fill-white" /> বন্ধ করুন
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-white" /> টেস্ট শুনুন
                  </>
                )}
              </button>

              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <Radio className="w-3.5 h-3.5 text-amber-500" />
                {selectedTune.theme}
              </span>
            </div>
          </div>

          {isSaved && (
            <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-center">
              <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1">
                <CheckCircle className="w-4 h-4" /> আপনার কলার টিউন সফলভাবে সেট হয়েছে!
              </p>
            </div>
          )}

          <button
            onClick={handleSaveCallerTune}
            className="w-full py-3 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 transition active:scale-95"
          >
            <Music className="w-4 h-4" />
            এই কলার টিউনটি সক্রিয় করুন
          </button>
        </div>
      </div>
    </div>
  );
};
