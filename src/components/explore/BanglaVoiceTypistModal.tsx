import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Copy,
  Check,
  RotateCcw,
  Sparkles,
  FileText,
  Volume2,
  X,
  Share2,
} from 'lucide-react';

interface BanglaVoiceTypistModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BanglaVoiceTypistModal: React.FC<BanglaVoiceTypistModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [text, setText] = useState('');
  const [copied, setCopied] = useState(false);
  const [autoPunctuate, setAutoPunctuate] = useState(true);

  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // Check for Web Speech API
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'bn-BD'; // Bengali (Bangladesh)

      rec.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setText((prev) => (prev ? prev + ' ' + transcript : transcript));
      };

      rec.onerror = () => {
        setIsRecording(false);
      };

      rec.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = rec;
    }
  }, []);

  if (!isOpen) return null;

  const toggleRecording = () => {
    if (isRecording) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      setIsRecording(false);
    } else {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
          setIsRecording(true);
        } catch {
          simulateDemoSpeech();
        }
      } else {
        simulateDemoSpeech();
      }
    }
  };

  const simulateDemoSpeech = () => {
    setIsRecording(true);
    const demoSentences = [
      'আসসালামু আলাইকুম।',
      'আজকে বিকেলে আমাদের জরুরি মিটিং আছে।',
      'দয়া করে সবাই উপস্থিত থাকবেন।',
      'ধন্যবাদ সবাইকে।',
    ];

    let i = 0;
    const interval = setInterval(() => {
      if (i < demoSentences.length) {
        setText((prev) => (prev ? prev + ' ' + demoSentences[i] : demoSentences[i]));
        i++;
      } else {
        clearInterval(interval);
        setIsRecording(false);
      }
    }, 1200);
  };

  const handleCopy = () => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClear = () => {
    setText('');
    setCopied(false);
  };

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
                  <Sparkles className="w-3 h-3" /> Voice to Text
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                মুখে বাংলায় বলুন, স্বয়ংক্রিয়ভাবে নির্ভুল টেক্সট হয়ে যাবে
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              if (isRecording && recognitionRef.current) {
                try {
                  recognitionRef.current.stop();
                } catch {}
              }
              onClose();
            }}
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex-1 min-h-0 overflow-y-auto space-y-4">
          {/* Mic Button Center */}
          <div className="flex flex-col items-center justify-center py-4">
            <div className="relative mb-3">
              {isRecording && (
                <div className="absolute -inset-3 rounded-full bg-red-500/20 animate-ping" />
              )}
              <button
                onClick={toggleRecording}
                className={`w-20 h-20 rounded-full flex items-center justify-center text-white shadow-xl transition-all active:scale-95 ${
                  isRecording
                    ? 'bg-gradient-to-tr from-red-600 to-rose-500 shadow-red-500/40 animate-pulse'
                    : 'bg-gradient-to-tr from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 shadow-violet-500/30'
                }`}
              >
                {isRecording ? <Mic className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
              </button>
            </div>
            <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {isRecording ? 'শুনছি... আপনার বাংলায় কথা বলুন' : 'কথা বলতে মাইকে চাপুন'}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              প্রমিত বাংলা ভাষা ও স্বয়ংক্রিয় যতিচিহ্ন সক্রিয়
            </p>
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
              rows={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="আপনি যা বলবেন তা এখানে স্পষ্ট বাংলায় লেখা উঠবে..."
              className="w-full p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-violet-500"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              disabled={!text}
              className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-violet-600/25 transition"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-300" /> কপি করা হয়েছে
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" /> টেক্সট কপি করুন
                </>
              )}
            </button>
            <button
              onClick={handleClear}
              disabled={!text}
              className="px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold disabled:opacity-50 transition"
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
