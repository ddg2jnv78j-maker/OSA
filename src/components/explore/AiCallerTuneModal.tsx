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
  Download,
} from 'lucide-react';

interface AiCallerTuneModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserName?: string;
}

const TUNES = [
  {
    id: 'formal',
    name: 'অফিসিয়াল ও মার্জিত বাংলা',
    phrase: 'আসসালামু আলাইকুম। {name} কে কল করার জন্য ধন্যবাদ। আপনার কলটি পৌঁছানো হচ্ছে, অনুগ্রহ করে লাইনে অপেক্ষা করুন।',
    theme: 'পেশাদার সুর',
    chimeFreqs: [440, 554.37, 659.25, 880], // A Major chord
  },
  {
    id: 'friendly',
    name: 'বন্ধুত্বপূর্ণ দেশি আড্ডা',
    phrase: 'হ্যালো বন্ধু! {name} হয়তো একটু ব্যস্ত আছে, লাইন কাটবেন না, এখনই কলটা ধরছি!',
    theme: 'আনন্দময় সুর',
    chimeFreqs: [523.25, 659.25, 783.99, 1046.5], // C Major
  },
  {
    id: 'radio',
    name: 'রেডিও আরজে স্টাইল',
    phrase: 'ওয়েলকাম টু OSA রেডিও স্টেশন! {name} এর ফোনে কল করার জন্য স্পেশাল থ্যাংকস। বাজাচ্ছি আপনার পছন্দের গান...',
    theme: 'ইলেকট্রনিক বিট',
    chimeFreqs: [392.0, 493.88, 587.33, 783.99], // G Major
  },
  {
    id: 'melody',
    name: 'সৌম্য ক্লাসিক্যাল সুর',
    phrase: 'একটু অপেক্ষা করুন, {name} এর সাথে আপনার কথোপকথন শুরু হচ্ছে।',
    theme: 'ক্লাসিক্যাল হারমোনি',
    chimeFreqs: [349.23, 440.0, 523.25, 698.46], // F Major
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

  const formattedPhrase = selectedTune.phrase.replace('{name}', userName.trim() || 'ইউজার');

  const playCallerTuneWithVoice = () => {
    if (isPlaying) {
      stopTune();
      return;
    }

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      if (AudioCtx) {
        const ctx = new AudioCtx();
        audioCtxRef.current = ctx;

        // Play gentle chime harmonic sequence
        selectedTune.chimeFreqs.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.2);
          gain.gain.setValueAtTime(0.08, ctx.currentTime + idx * 0.2);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.2 + 0.6);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(ctx.currentTime + idx * 0.2);
          osc.stop(ctx.currentTime + idx * 0.2 + 0.6);
        });
      }

      // Real Speech Synthesis in Bengali
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(formattedPhrase);
        utterance.lang = 'bn-BD';
        utterance.rate = 0.95;
        utterance.pitch = 1.05;

        utterance.onend = () => {
          setIsPlaying(false);
        };
        utterance.onerror = () => {
          setIsPlaying(false);
        };

        setIsPlaying(true);
        // Small delay to let initial chime resonate
        setTimeout(() => {
          window.speechSynthesis.speak(utterance);
        }, 400);
      } else {
        setIsPlaying(true);
        setTimeout(() => setIsPlaying(false), 3000);
      }
    } catch {
      setIsPlaying(false);
    }
  };

  const stopTune = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
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
        JSON.stringify({
          name: userName.trim(),
          tuneId: selectedTune.id,
          phrase: formattedPhrase,
        })
      );
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2500);
    } catch {}
  };

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
                  <Sparkles className="w-3 h-3" /> Live Bengali TTS
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                যাঁরা আপনাকে কল করবেন তাঁদের জন্য আকর্ষণীয় বাংলা কলার টিউন
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
              আপনার নাম (কলার টিউনে যা উচ্চারিত হবে):
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
              টিউনের ধরন নির্বাচন করুন:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {TUNES.map((tune) => {
                const isSelected = selectedTune.id === tune.id;
                return (
                  <button
                    key={tune.id}
                    type="button"
                    onClick={() => {
                      stopTune();
                      setSelectedTune(tune);
                    }}
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
              লাইভ উচ্চারণ ও ডায়লগ:
            </span>
            <p className="text-xs font-medium text-slate-800 dark:text-slate-200 italic bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 leading-relaxed">
              "{formattedPhrase}"
            </p>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={playCallerTuneWithVoice}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
                  isPlaying
                    ? 'bg-red-600 text-white shadow-md'
                    : 'bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-500/25'
                }`}
              >
                {isPlaying ? (
                  <>
                    <Square className="w-3.5 h-3.5 fill-white" /> বন্ধ করুন
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-white" /> ভয়েস ডায়লগ শুনুন
                  </>
                )}
              </button>

              <span className="text-[11px] text-slate-400 flex items-center gap-1 font-medium">
                <Radio className="w-3.5 h-3.5 text-amber-500" />
                {selectedTune.theme}
              </span>
            </div>
          </div>

          {isSaved && (
            <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-center animate-in fade-in">
              <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1">
                <CheckCircle className="w-4 h-4" /> আপনার কলার টিউন সফলভাবে প্রোফাইলে সক্রিয় হয়েছে!
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
