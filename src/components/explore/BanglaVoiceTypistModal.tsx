import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Copy,
  Check,
  RotateCcw,
  Sparkles,
  Volume2,
  X,
  VolumeX,
} from 'lucide-react';

interface BanglaVoiceTypistModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BanglaVoiceTypistModal: React.FC<BanglaVoiceTypistModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [isListening, setIsListening] = useState(false);
  const [text, setText] = useState('');
  const [copied, setCopied] = useState(false);
  const [isSpeakingBack, setIsSpeakingBack] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState<number>(0);

  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'bn-BD'; // Standard Bengali (Bangladesh)

      rec.onresult = (event: any) => {
        let currentTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript;
        }

        if (currentTranscript.trim()) {
          setText((prev) => {
            const trimmed = prev.trim();
            // Automatically append punctuation if pausing
            return trimmed ? `${trimmed} ${currentTranscript.trim()}` : currentTranscript.trim();
          });
        }
      };

      rec.onerror = (e: any) => {
        console.warn('Speech recognition error:', e.error);
        if (e.error === 'not-allowed') {
          setMicError('মাইক্রোফোন পারমিশন প্রয়োজন। দয়া করে ব্রাউজারে মাইক ব্যবহারের অনুমতি দিন।');
        }
        stopRecording();
      };

      rec.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = rec;
    } else {
      setMicError('আপনার ব্রাউজারে সরাসরি Web Speech API সমর্থিত নয়। ক্রোম বা এজ ব্রাউজার ব্যবহার করুন।');
    }

    return () => {
      stopRecording();
    };
  }, []);

  const startRecording = async () => {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      // Audio Level visualizer
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        audioContextRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const checkVolume = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          setAudioLevel(Math.min(100, Math.round(avg * 1.5)));
          animFrameRef.current = requestAnimationFrame(checkVolume);
        };
        checkVolume();
      }

      if (recognitionRef.current) {
        recognitionRef.current.start();
      }
      setIsListening(true);
    } catch (err: any) {
      console.warn('Mic access denied:', err);
      setMicError('মাইক্রোফোন চালু করা যায়নি। দয়া করে মাইক পারমিশন চেক করুন।');
      setIsListening(false);
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }
    setAudioLevel(0);
    setIsListening(false);
  };

  const toggleListen = () => {
    if (isListening) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const handleCopy = () => {
    if (!text.trim()) return;
    navigator.clipboard.writeText(text.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSpeakText = () => {
    if (!text.trim() || !('speechSynthesis' in window)) return;

    if (isSpeakingBack) {
      window.speechSynthesis.cancel();
      setIsSpeakingBack(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text.trim());
    utterance.lang = 'bn-BD';
    utterance.rate = 0.95;
    utterance.onend = () => setIsSpeakingBack(false);
    utterance.onerror = () => setIsSpeakingBack(false);

    setIsSpeakingBack(true);
    window.speechSynthesis.speak(utterance);
  };

  if (!isOpen) return null;

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const charCount = text.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-violet-500/10 via-purple-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-violet-600 to-purple-600 text-white flex items-center justify-center shadow-lg shadow-violet-500/25">
              <Mic className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                বাংলা স্মার্ট ভয়েস টাইপিস্ট
                <span className="px-2 py-0.5 text-[10px] font-bold bg-violet-100 dark:bg-violet-950/80 text-violet-600 dark:text-violet-400 rounded-full flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Live Bengali STT
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                মাইকে বাংলায় কথা বলুন, রিয়েলটাইমে নির্ভুল টেক্সট টাইপ হবে
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              stopRecording();
              if ('speechSynthesis' in window) window.speechSynthesis.cancel();
              onClose();
            }}
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex-1 min-h-0 overflow-y-auto space-y-4">
          {micError && (
            <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300">
              {micError}
            </div>
          )}

          {/* Mic Button Center with Live Soundwave */}
          <div className="flex flex-col items-center justify-center py-4">
            <div className="relative mb-3">
              {isListening && (
                <div
                  className="absolute -inset-4 rounded-full bg-red-500/20 transition-transform duration-75"
                  style={{ transform: `scale(${1 + audioLevel / 100})` }}
                />
              )}
              <button
                onClick={toggleListen}
                className={`w-20 h-20 rounded-full flex items-center justify-center text-white shadow-xl transition-all active:scale-95 ${
                  isListening
                    ? 'bg-gradient-to-tr from-red-600 to-rose-500 shadow-red-500/40 animate-pulse'
                    : 'bg-gradient-to-tr from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 shadow-violet-500/30'
                }`}
              >
                {isListening ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
              </button>
            </div>
            <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {isListening ? 'শুনছি... বাংলায় স্পষ্ট কথা বলুন' : 'কথা বলতে মাইকে চাপুন'}
            </p>
            {isListening && (
              <div className="flex items-center gap-1 mt-2">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                <span className="text-[11px] font-mono text-red-500">ভয়েস ইনপুট সক্রিয় ({audioLevel}%)</span>
              </div>
            )}
          </div>

          {/* Text Area Output */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>টাইপকৃত টেক্সট:</span>
              <span>
                {wordCount} শব্দ • {charCount} অক্ষর
              </span>
            </div>
            <textarea
              rows={6}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="আপনি যা বলবেন তা এখানে স্পষ্ট বাংলায় টাইপ হবে..."
              className="w-full p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-violet-500"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              disabled={!text.trim()}
              className="flex-1 py-3 rounded-2xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-violet-600/25 transition active:scale-95"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-300" /> কপি সম্পন্ন হয়েছে
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" /> টেক্সট কপি করুন
                </>
              )}
            </button>

            <button
              onClick={handleSpeakText}
              disabled={!text.trim()}
              className={`px-4 py-3 rounded-2xl text-xs font-bold flex items-center gap-1.5 transition ${
                isSpeakingBack
                  ? 'bg-amber-500 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300'
              }`}
              title="শুনুন"
            >
              {isSpeakingBack ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              <span>{isSpeakingBack ? 'থামুন' : 'শুনুন'}</span>
            </button>

            <button
              onClick={() => setText('')}
              disabled={!text.trim()}
              className="px-3.5 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold disabled:opacity-50 transition"
              title="মুছুন"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
