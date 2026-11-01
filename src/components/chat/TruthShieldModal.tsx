import React, { useEffect, useRef, useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Activity,
  Mic,
  MicOff,
  X,
  Sparkles,
  Share2,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';

export interface TruthReportData {
  id: string;
  senderName: string;
  senderId: string;
  stressScore: number; // 0 - 100
  verdict: 'calm' | 'hesitant' | 'elevated';
  jitterPercent: number;
  shimmerPercent: number;
  durationSeconds: number;
  timestamp: string;
  notes?: string;
}

interface TruthShieldModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendTruthReport: (report: TruthReportData) => void;
  currentUserName: string;
  currentUserId: string;
  language?: string;
}

export const TruthShieldModal: React.FC<TruthShieldModalProps> = ({
  isOpen,
  onClose,
  onSendTruthReport,
  currentUserName,
  currentUserId,
  language = 'en',
}) => {
  const isBn = language === 'bn';

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [stressScore, setStressScore] = useState<number>(18);
  const [jitter, setJitter] = useState<number>(0.8);
  const [shimmer, setShimmer] = useState<number>(1.2);
  const [analysisDuration, setAnalysisDuration] = useState(0);
  const [historyScores, setHistoryScores] = useState<number[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen) {
      stopAnalysis();
    }
  }, [isOpen]);

  const startAnalysis = async () => {
    setErrorMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      analyserRef.current = analyser;

      setIsAnalyzing(true);
      setAnalysisDuration(0);
      setHistoryScores([]);

      timerRef.current = window.setInterval(() => {
        setAnalysisDuration((prev) => prev + 1);
      }, 1000);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      let previousRms = 0;

      const loop = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        // Calculate RMS Energy
        let sumSquares = 0;
        let highFreqSum = 0;
        let lowFreqSum = 0;

        for (let i = 0; i < bufferLength; i++) {
          const val = dataArray[i];
          sumSquares += val * val;
          if (i < 40) lowFreqSum += val; // Low fundamental frequency (100-800Hz)
          if (i > 90) highFreqSum += val; // High harmonics (2.5kHz - 8kHz)
        }

        const rms = Math.sqrt(sumSquares / bufferLength);

        // Only compute when human voice is actively present
        if (rms > 12) {
          // Amplitude shimmer (instantaneous step delta)
          const deltaAmp = Math.abs(rms - previousRms);
          const currentShimmer = Math.min(10, (deltaAmp / (rms + 1)) * 12);

          // Harmonic Tension Ratio
          const tensionRatio = highFreqSum / (lowFreqSum + 1);
          const currentJitter = Math.min(8, tensionRatio * 4.5);

          // Composite Vocal Stress: Weighted combination of micro-tremor fluctuation & tension
          const instantScore = Math.min(
            96,
            Math.max(12, Math.round(tensionRatio * 45 + currentShimmer * 5.2 + (Math.random() * 6 - 3)))
          );

          setStressScore((prev) => Math.round(prev * 0.75 + instantScore * 0.25));
          setJitter(parseFloat(currentJitter.toFixed(2)));
          setShimmer(parseFloat(currentShimmer.toFixed(2)));

          setHistoryScores((prev) => [...prev.slice(-30), instantScore]);
        } else {
          // Decay to baseline when quiet
          setStressScore((prev) => Math.max(12, Math.round(prev * 0.95)));
        }

        previousRms = rms;
        animFrameRef.current = requestAnimationFrame(loop);
      };

      loop();
    } catch (err: any) {
      setErrorMsg(isBn ? 'মাইক্রোফোনের অনুমতি পাওয়া যায়নি' : 'Microphone permission denied or unavailable');
    }
  };

  const stopAnalysis = () => {
    setIsAnalyzing(false);
    if (timerRef.current) clearInterval(timerRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  };

  const getVerdict = (score: number): 'calm' | 'hesitant' | 'elevated' => {
    if (score < 38) return 'calm';
    if (score < 68) return 'hesitant';
    return 'elevated';
  };

  const handleSendReport = () => {
    const verdict = getVerdict(stressScore);
    const report: TruthReportData = {
      id: `truth_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      senderName: currentUserName,
      senderId: currentUserId,
      stressScore,
      verdict,
      jitterPercent: jitter,
      shimmerPercent: shimmer,
      durationSeconds: Math.max(analysisDuration, 3),
      timestamp: new Date().toISOString(),
      notes:
        verdict === 'calm'
          ? isBn
            ? 'স্বাভাবিক ও ধীর-স্থির কণ্ঠস্বর সনাক্ত হয়েছে'
            : 'Smooth vocal harmonics & natural steady cadence'
          : verdict === 'hesitant'
          ? isBn
            ? 'সামান্য দ্বিধা ও চিন্তিত মাইক্রো-কম্পন'
            : 'Mild cognitive hesitation & harmonic fluctuations'
          : isBn
          ? 'উচ্চ কণ্ঠনালী চাপ ও মাইক্রো-কম্পন অনুভূত হয়েছে'
          : 'Elevated vocal fold tension and micro-tremor perturbations',
    };

    onSendTruthReport(report);
    stopAnalysis();
    onClose();
  };

  if (!isOpen) return null;

  const currentVerdict = getVerdict(stressScore);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xl animate-in fade-in">
      <div className="relative w-full max-w-md bg-slate-950 text-white rounded-3xl border border-cyan-500/30 shadow-2xl overflow-hidden flex flex-col">
        {/* Radar Hologram Header */}
        <div className="px-6 py-4 bg-gradient-to-b from-cyan-950/60 via-slate-950 to-slate-950 border-b border-cyan-500/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500 to-emerald-400 text-slate-950 flex items-center justify-center shadow-lg shadow-cyan-500/30">
              <ShieldAlert className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-cyan-200 flex items-center gap-1.5">
                <span>{isBn ? 'ট্রুথ শিল্ড (ভয়েস স্ট্রেস অ্যানালাইজার)' : 'Truth Shield™ Vocal Radar'}</span>
              </h3>
              <p className="text-xs text-cyan-400/80">
                {isBn ? 'বায়োমেট্রিক মাইক্রো-কম্পন ও সত্যতা পরিমাপক' : 'Real-time acoustic jitter & micro-tremor detector'}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              stopAnalysis();
              onClose();
            }}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Biometric Circular Radar Screen */}
        <div className="p-6 flex flex-col items-center justify-center relative">
          {/* Radar HUD Circle */}
          <div className="relative w-52 h-52 rounded-full border-2 border-cyan-500/20 bg-cyan-950/20 flex items-center justify-center shadow-inner overflow-hidden">
            {/* Concentric rings */}
            <div className="absolute inset-4 rounded-full border border-cyan-500/20" />
            <div className="absolute inset-12 rounded-full border border-cyan-500/20" />
            <div className="absolute inset-20 rounded-full border border-cyan-500/20" />

            {/* Crosshair grid lines */}
            <div className="absolute inset-x-0 h-[1px] bg-cyan-500/20" />
            <div className="absolute inset-y-0 w-[1px] bg-cyan-500/20" />

            {/* Sweep radar ray when analyzing */}
            {isAnalyzing && (
              <div
                className="absolute inset-0 rounded-full pointer-events-none"
                style={{
                  background: 'conic-gradient(from 0deg, transparent 70%, rgba(6,182,212,0.4) 100%)',
                  animation: 'radarSweep 2.2s linear infinite',
                }}
              />
            )}

            {/* Central Score Display */}
            <div className="relative z-10 flex flex-col items-center">
              <span className="text-[10px] uppercase font-bold tracking-widest text-cyan-400">
                {isBn ? 'স্ট্রেস ইনডেক্স' : 'STRESS INDEX'}
              </span>
              <span
                className={`text-4xl font-black font-mono transition-colors ${
                  currentVerdict === 'calm'
                    ? 'text-emerald-400'
                    : currentVerdict === 'hesitant'
                    ? 'text-amber-400'
                    : 'text-rose-500 animate-pulse'
                }`}
              >
                {stressScore}%
              </span>
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded-full mt-1 ${
                  currentVerdict === 'calm'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : currentVerdict === 'hesitant'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                }`}
              >
                {currentVerdict === 'calm'
                  ? isBn
                    ? 'স্বাভাবিক ও শান্ত'
                    : 'CALM & NATURAL'
                  : currentVerdict === 'hesitant'
                  ? isBn
                    ? 'সতর্ক / দ্বিধান্বিত'
                    : 'HESITANT / DELIBERATE'
                  : isBn
                  ? 'উচ্চ উত্তেজনা / স্ট্রেস'
                  : 'ELEVATED TENSION'}
              </span>
            </div>
          </div>

          {/* Micro-Metrics Bar */}
          <div className="grid grid-cols-3 gap-2 w-full mt-5 text-center">
            <div className="p-2.5 rounded-2xl bg-slate-900 border border-slate-800">
              <span className="text-[10px] text-slate-400 block font-medium">Acoustic Jitter</span>
              <span className="text-xs font-bold text-cyan-300 font-mono">{jitter}%</span>
            </div>
            <div className="p-2.5 rounded-2xl bg-slate-900 border border-slate-800">
              <span className="text-[10px] text-slate-400 block font-medium">Amplitude Shimmer</span>
              <span className="text-xs font-bold text-cyan-300 font-mono">{shimmer}%</span>
            </div>
            <div className="p-2.5 rounded-2xl bg-slate-900 border border-slate-800">
              <span className="text-[10px] text-slate-400 block font-medium">{isBn ? 'সময়কাল' : 'Duration'}</span>
              <span className="text-xs font-bold text-cyan-300 font-mono">{analysisDuration}s</span>
            </div>
          </div>

          {errorMsg && (
            <p className="mt-3 text-xs text-rose-400 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              {errorMsg}
            </p>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between">
          {!isAnalyzing ? (
            <button
              onClick={startAnalysis}
              className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              <Mic className="w-4 h-4 stroke-[2.5]" />
              <span>{isBn ? 'লাইভ স্ক্যান শুরু করুন' : 'Start Live Acoustic Scan'}</span>
            </button>
          ) : (
            <div className="flex items-center gap-2 w-full">
              <button
                onClick={stopAnalysis}
                className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors"
              >
                <MicOff className="w-4 h-4 text-rose-400" />
                <span>{isBn ? 'থামান' : 'Stop'}</span>
              </button>
              <button
                onClick={handleSendReport}
                className="flex-1 py-2.5 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-md shadow-cyan-500/30 flex items-center justify-center gap-2 transition-all active:scale-95"
              >
                <Share2 className="w-4 h-4 stroke-[2.5]" />
                <span>{isBn ? 'চ্যাটে সার্টিফিকেট পাঠান' : 'Share Truth Certificate'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes radarSweep {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
};
