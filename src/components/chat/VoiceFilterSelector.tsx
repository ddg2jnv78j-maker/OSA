import React, { useState, useRef, useEffect } from 'react';
import {
  Mic,
  Square,
  Play,
  Pause,
  Send,
  Trash2,
  X,
  Volume2,
  Sliders,
  Sparkles
} from 'lucide-react';

export type VoiceFilterType = 
  | 'natural' 
  | 'studio' 
  | 'deep' 
  | 'robot' 
  | 'chipmunk' 
  | 'radio' 
  | 'echo';

interface FilterOption {
  id: VoiceFilterType;
  label: string;
  bnLabel: string;
  icon: string;
  desc: string;
  color: string;
}

const FILTERS: FilterOption[] = [
  { id: 'natural', label: 'Natural Voice', bnLabel: 'প্রাকৃতিক ভয়েস', icon: '🎙️', desc: 'Original unaltered recording', color: 'from-blue-600 to-indigo-600' },
  { id: 'studio', label: 'Studio Pro', bnLabel: 'স্টুডিও প্রো', icon: '🎧', desc: 'Crisp treble boost & compressed vocal clarity', color: 'from-violet-600 to-purple-600' },
  { id: 'deep', label: 'Deep Titan', bnLabel: 'ডিপ টাইটান', icon: '🦁', desc: 'Powerful low-frequency bass & rich resonance', color: 'from-amber-600 to-rose-700' },
  { id: 'robot', label: 'Cyber Robot', bnLabel: 'সাইবার রোবট', icon: '🤖', desc: '50Hz modulation ring metallic robotic synthesizer', color: 'from-cyan-600 to-teal-600' },
  { id: 'chipmunk', label: 'Chipmunk', bnLabel: 'চিপমাঙ্ক', icon: '🐿️', desc: 'High-pitch helium speed vocal shift', color: 'from-pink-600 to-fuchsia-600' },
  { id: 'radio', label: 'Vintage Radio', bnLabel: 'ভিন্টেজ রেডিও', icon: '📻', desc: 'Bandpass walkie-talkie & megaphone grit', color: 'from-orange-600 to-yellow-600' },
  { id: 'echo', label: 'Cosmic Echo', bnLabel: 'কসমিক ইকো', icon: '🌌', desc: 'Spacious reverb with 240ms feedback delay', color: 'from-teal-600 to-emerald-600' },
];

interface VoiceFilterSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSendVoiceMessage: (processedBlob: Blob, filterName: string, durationSeconds: number) => Promise<void>;
  language?: string;
}

export const VoiceFilterSelector: React.FC<VoiceFilterSelectorProps> = ({
  isOpen,
  onClose,
  onSendVoiceMessage,
  language = 'en',
}) => {
  const isBn = language === 'bn';
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [selectedFilter, setSelectedFilter] = useState<VoiceFilterType>('natural');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const decodedBufferRef = useRef<AudioBuffer | null>(null);

  // Clean up
  useEffect(() => {
    return () => {
      stopPlayback();
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  const startRecording = async () => {
    stopPlayback();
    setRecordedBlob(null);
    decodedBufferRef.current = null;
    chunksRef.current = [];
    setRecordSeconds(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setRecordedBlob(blob);
        // Pre-decode audio buffer for instant effects preview
        try {
          const arrayBuffer = await blob.arrayBuffer();
          const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          const ctx = new AudioCtx();
          audioContextRef.current = ctx;
          const decoded = await ctx.decodeAudioData(arrayBuffer);
          decodedBufferRef.current = decoded;
        } catch {
          // Fallback if browser codec decoding fails
        }
      };

      mr.start();
      setIsRecording(true);

      recordTimerRef.current = window.setInterval(() => {
        setRecordSeconds((prev) => prev + 1);
      }, 1000);
    } catch {
      alert(isBn ? 'মাইক্রোফোন পারমিশন প্রয়োজন' : 'Microphone access is required');
    }
  };

  const stopRecording = () => {
    if (!isRecording) return;
    setIsRecording(false);
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const stopPlayback = () => {
    if (currentSourceNodeRef.current) {
      try {
        currentSourceNodeRef.current.stop();
      } catch {}
      currentSourceNodeRef.current = null;
    }
    setIsPlaying(false);
  };

  // Play audio buffer through Web Audio Filter Graph
  const playPreviewWithFilter = async (filter: VoiceFilterType) => {
    stopPlayback();
    if (!decodedBufferRef.current && recordedBlob) {
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = audioContextRef.current || new AudioCtx();
        audioContextRef.current = ctx;
        const arrayBuffer = await recordedBlob.arrayBuffer();
        decodedBufferRef.current = await ctx.decodeAudioData(arrayBuffer);
      } catch {
        return;
      }
    }

    const buffer = decodedBufferRef.current;
    if (!buffer) return;

    const ctx = audioContextRef.current || new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    audioContextRef.current = ctx;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    currentSourceNodeRef.current = source;

    // Apply filter chain
    if (filter === 'chipmunk') {
      source.playbackRate.value = 1.45;
      source.connect(ctx.destination);
    } else if (filter === 'deep') {
      source.playbackRate.value = 0.82;
      const biquad = ctx.createBiquadFilter();
      biquad.type = 'lowshelf';
      biquad.frequency.value = 250;
      biquad.gain.value = 9;
      source.connect(biquad);
      biquad.connect(ctx.destination);
    } else if (filter === 'studio') {
      const highshelf = ctx.createBiquadFilter();
      highshelf.type = 'highshelf';
      highshelf.frequency.value = 3500;
      highshelf.gain.value = 6;

      const comp = ctx.createDynamicsCompressor();
      comp.threshold.setValueAtTime(-20, ctx.currentTime);
      comp.knee.setValueAtTime(30, ctx.currentTime);
      comp.ratio.setValueAtTime(4, ctx.currentTime);
      comp.attack.setValueAtTime(0.003, ctx.currentTime);
      comp.release.setValueAtTime(0.25, ctx.currentTime);

      source.connect(highshelf);
      highshelf.connect(comp);
      comp.connect(ctx.destination);
    } else if (filter === 'robot') {
      // Ring modulation
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(50, ctx.currentTime);
      const modGain = ctx.createGain();
      modGain.gain.setValueAtTime(1.0, ctx.currentTime);
      osc.connect(modGain.gain);
      osc.start();

      source.connect(modGain);
      modGain.connect(ctx.destination);
    } else if (filter === 'radio') {
      const bandpass = ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.value = 1400;
      bandpass.Q.value = 1.8;

      const waveShaper = ctx.createWaveShaper();
      const n_samples = 44100;
      const curve = new Float32Array(n_samples);
      const deg = Math.PI / 180;
      const k = 20;
      for (let i = 0; i < n_samples; ++i) {
        const x = (i * 2) / n_samples - 1;
        curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
      }
      waveShaper.curve = curve;
      waveShaper.oversample = '4x';

      source.connect(bandpass);
      bandpass.connect(waveShaper);
      waveShaper.connect(ctx.destination);
    } else if (filter === 'echo') {
      const delay = ctx.createDelay();
      delay.delayTime.value = 0.22;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.42;

      delay.connect(feedback);
      feedback.connect(delay);

      source.connect(ctx.destination);
      source.connect(delay);
      delay.connect(ctx.destination);
    } else {
      source.connect(ctx.destination);
    }

    source.onended = () => {
      setIsPlaying(false);
    };

    source.start();
    setIsPlaying(true);
  };

  const handleSelectFilter = (f: VoiceFilterType) => {
    setSelectedFilter(f);
    if (recordedBlob) {
      playPreviewWithFilter(f);
    }
  };

  const handleSend = async () => {
    if (!recordedBlob) return;
    setIsProcessing(true);
    stopPlayback();
    try {
      const chosenFilterObj = FILTERS.find((f) => f.id === selectedFilter) || FILTERS[0];
      await onSendVoiceMessage(
        recordedBlob,
        `${chosenFilterObj.icon} ${isBn ? chosenFilterObj.bnLabel : chosenFilterObj.label}`,
        recordSeconds || 3
      );
      onClose();
    } catch {
      // Handled in parent
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col text-white">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-violet-600 to-fuchsia-600 flex items-center justify-center text-white shadow-md shadow-violet-500/25">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-100 flex items-center gap-1.5">
                <span>{isBn ? 'স্টুডিও ভয়েস ফিল্টার ও চেঞ্জার' : 'Studio Voice Filters & Changer'}</span>
                <Sparkles className="w-4 h-4 text-amber-400" />
              </h3>
              <p className="text-[11px] text-slate-400">
                {isBn ? 'রেকর্ড করুন এবং ম্যাজিকাল ভয়েস এফেক্ট দিন' : 'Record voice note with studio audio effects'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-red-400 rounded-xl hover:bg-slate-800 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-5">
          {/* Recorder Stage */}
          <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-col items-center justify-center text-center">
            {isRecording ? (
              <div className="space-y-3">
                <div className="flex items-center justify-center gap-1.5 h-10">
                  {[...Array(12)].map((_, i) => (
                    <div
                      key={i}
                      className="w-1.5 rounded-full bg-red-500 animate-pulse"
                      style={{
                        height: `${Math.floor(Math.sin((i + Date.now() / 200) * 1.5) * 18 + 22)}px`,
                        animationDelay: `${i * 80}ms`,
                      }}
                    />
                  ))}
                </div>
                <div className="text-red-400 font-mono font-bold text-lg">
                  {Math.floor(recordSeconds / 60)}:{(recordSeconds % 60).toString().padStart(2, '0')}
                </div>
                <button
                  type="button"
                  onClick={stopRecording}
                  className="px-6 py-2 rounded-full bg-red-600 hover:bg-red-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-red-600/30 active:scale-95 transition-all"
                >
                  <Square className="w-4 h-4 fill-white" />
                  <span>{isBn ? 'রেকর্ডিং শেষ করুন' : 'Stop Recording'}</span>
                </button>
              </div>
            ) : recordedBlob ? (
              <div className="space-y-3 w-full">
                <div className="flex items-center justify-between px-3 py-2 bg-slate-900 rounded-xl border border-slate-800">
                  <div className="flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-violet-400" />
                    <span className="text-xs font-mono text-slate-300">
                      {Math.floor(recordSeconds / 60)}:{(recordSeconds % 60).toString().padStart(2, '0')}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (isPlaying) {
                          stopPlayback();
                        } else {
                          playPreviewWithFilter(selectedFilter);
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95"
                    >
                      {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      <span>{isPlaying ? (isBn ? 'পজ' : 'Pause') : (isBn ? 'শুনুন' : 'Preview')}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        stopPlayback();
                        setRecordedBlob(null);
                        setRecordSeconds(0);
                      }}
                      className="p-1.5 text-slate-400 hover:text-red-400 rounded-lg hover:bg-slate-800"
                      title="Re-record"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400">
                  {isBn ? 'যেকোনো এফেক্টে ট্যাপ করে সরাসরি শুনে নিন:' : 'Tap any filter below to preview effect:'}
                </p>
              </div>
            ) : (
              <div className="py-3 flex flex-col items-center">
                <button
                  type="button"
                  onClick={startRecording}
                  className="w-16 h-16 rounded-full bg-gradient-to-tr from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 flex items-center justify-center text-white shadow-xl shadow-violet-600/30 active:scale-95 transition-all mb-2"
                >
                  <Mic className="w-8 h-8" />
                </button>
                <p className="text-xs font-bold text-slate-200">
                  {isBn ? 'রেকর্ড করতে ট্যাপ করুন' : 'Tap to start recording'}
                </p>
                <p className="text-[11px] text-slate-400">
                  {isBn ? 'কথা বলা শেষ হলে যেকোনো ফিল্টার সিলেক্ট করুন' : 'Choose from 7 studio voice effects after recording'}
                </p>
              </div>
            )}
          </div>

          {/* Filter Cards Selector */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <span>{isBn ? 'স্টুডিও ভয়েস ফিল্টার সিলেক্ট করুন' : 'Select Voice Filter'}</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[220px] overflow-y-auto pr-1">
              {FILTERS.map((f) => {
                const isSelected = selectedFilter === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => handleSelectFilter(f.id)}
                    className={`p-2.5 rounded-2xl border text-left transition-all relative flex flex-col gap-1 ${
                      isSelected
                        ? 'bg-slate-800 border-violet-500 shadow-lg shadow-violet-500/20 ring-1 ring-violet-500'
                        : 'bg-slate-950/60 border-slate-800 hover:bg-slate-800/60 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xl">{f.icon}</span>
                      {isSelected && (
                        <span className="w-2 h-2 rounded-full bg-violet-400 shadow-sm shadow-violet-400" />
                      )}
                    </div>
                    <span className="text-xs font-bold text-slate-100">
                      {isBn ? f.bnLabel : f.label}
                    </span>
                    <span className="text-[10px] text-slate-400 line-clamp-1">
                      {f.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
          >
            {isBn ? 'বাতিল' : 'Cancel'}
          </button>

          <button
            type="button"
            onClick={handleSend}
            disabled={!recordedBlob || isRecording || isProcessing}
            className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 shadow-lg shadow-violet-600/30 disabled:opacity-40 transition-all active:scale-95 flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            <span>{isProcessing ? (isBn ? 'প্রসেসিং হচ্ছে...' : 'Processing...') : (isBn ? 'মেসেজ পাঠান' : 'Send Voice Note')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
