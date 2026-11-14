import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Download,
  Library,
  Mic,
  MicOff,
  Music2,
  Play,
  Radio,
  Repeat,
  RotateCcw,
  Save,
  Share2,
  Sliders,
  Square,
  Trash2,
  Volume2,
  Waves,
  X,
} from 'lucide-react';
import {
  buildCallerScript,
  DEFAULT_MIX_SETTINGS,
  formatCallerDisplayName,
  getActiveCallerTune,
  getPresetById,
  LiveCallerTuneEngine,
  loadSavedCallerTunes,
  renderCallerTuneToWavBlob,
  saveCallerTunesList,
  SavedCallerTune,
  SCRIPT_TEMPLATES,
  setActiveCallerTune,
  StudioMixSettings,
  SYNTH_PRESETS,
  SynthPresetId,
} from '../../services/callerTuneStudioService';

interface AiCallerTuneModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserName?: string;
}

const HONORIFIC_OPTIONS = [
  { id: '', label: 'শুধু নাম' },
  { id: 'ভাইয়া', label: 'ভাইয়া' },
  { id: 'সাহেব', label: 'সাহেব' },
  { id: 'স্যার', label: 'স্যার' },
  { id: 'ম্যাডাম', label: 'ম্যাডাম' },
  { id: 'আপা', label: 'আপা' },
  { id: 'ডাক্তার', label: 'ডাক্তার' },
];

type VoiceMode = 'tts' | 'mic';
type RightPanelTab = 'presets' | 'mixer' | 'library';

export const AiCallerTuneModal: React.FC<AiCallerTuneModalProps> = ({
  isOpen,
  onClose,
  currentUserName = 'ইউজার',
}) => {
  const initialActive = useMemo(() => getActiveCallerTune(), []);

  const [userName, setUserName] = useState<string>(
    initialActive?.userName || currentUserName || 'ইউজার'
  );
  const [honorific, setHonorific] = useState<string>(initialActive?.honorific || '');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    initialActive?.templateId || SCRIPT_TEMPLATES[0].id
  );
  const [selectedPresetId, setSelectedPresetId] = useState<SynthPresetId>(
    initialActive?.presetId || 'crystal-corporate'
  );
  const [customScript, setCustomScript] = useState<string>(
    initialActive?.script ||
      buildCallerScript(
        SCRIPT_TEMPLATES[0].template,
        initialActive?.userName || currentUserName || 'ইউজার',
        initialActive?.honorific || ''
      )
  );
  const [isScriptManuallyEdited, setIsScriptManuallyEdited] = useState<boolean>(
    Boolean(initialActive?.script)
  );
  const [mixSettings, setMixSettings] = useState<StudioMixSettings>(
    initialActive?.settings || { ...DEFAULT_MIX_SETTINGS }
  );
  const [useAsIncomingRingtone, setUseAsIncomingRingtone] = useState<boolean>(
    Boolean(initialActive?.useAsIncomingRingtone)
  );

  const [voiceMode, setVoiceMode] = useState<VoiceMode>('tts');
  const [rightTab, setRightTab] = useState<RightPanelTab>('presets');
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  // Mic Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);
  const [recordedBuffer, setRecordedBuffer] = useState<AudioBuffer | null>(null);
  const [recordedDurationSec, setRecordedDurationSec] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);

  // Export & Library State
  const [isExportingWav, setIsExportingWav] = useState(false);
  const [savedLibrary, setSavedLibrary] = useState<SavedCallerTune[]>(() =>
    loadSavedCallerTunes()
  );
  const [activeTuneId, setActiveTuneId] = useState<string | null>(
    initialActive?.id || null
  );
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const engineRef = useRef<LiveCallerTuneEngine | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const playbackTimerRef = useRef<number | null>(null);
  const ttsDelayRef = useRef<number | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);

  const selectedPreset = useMemo(
    () => getPresetById(selectedPresetId),
    [selectedPresetId]
  );

  const selectedTemplate = useMemo(
    () =>
      SCRIPT_TEMPLATES.find((t) => t.id === selectedTemplateId) ||
      SCRIPT_TEMPLATES[0],
    [selectedTemplateId]
  );

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 3000);
  }, []);

  // Load real system TTS voices
  useEffect(() => {
    if (!isOpen || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }
    const loadVoices = () => {
      const list = window.speechSynthesis.getVoices();
      if (list.length > 0) {
        const sorted = [...list].sort((a, b) => {
          const score = (v: SpeechSynthesisVoice) => {
            if (v.lang.toLowerCase().startsWith('bn')) return 0;
            if (v.lang.toLowerCase().startsWith('en')) return 1;
            return 2;
          };
          return score(a) - score(b);
        });
        setAvailableVoices(sorted);
      }
    };
    loadVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener?.('voiceschanged', loadVoices);
    };
  }, [isOpen]);

  // Sync script when user changes name, honorific, or template (unless manually edited)
  useEffect(() => {
    if (!isScriptManuallyEdited) {
      setCustomScript(buildCallerScript(selectedTemplate.template, userName, honorific));
    }
  }, [userName, honorific, selectedTemplate, isScriptManuallyEdited]);

  const stopAllAudio = useCallback(() => {
    if (ttsDelayRef.current !== null) {
      window.clearTimeout(ttsDelayRef.current);
      ttsDelayRef.current = null;
    }
    if (playbackTimerRef.current !== null) {
      window.clearInterval(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    if (engineRef.current) {
      engineRef.current.stop();
    }
    setIsPlaying(false);
    setElapsedSec(0);
  }, []);

  const stopRecordingCleanup = useCallback(() => {
    if (recordTimerRef.current !== null) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((tr) => tr.stop());
      micStreamRef.current = null;
    }
    setIsRecording(false);
  }, []);

  // Cleanup when modal closes
  useEffect(() => {
    if (!isOpen) {
      stopAllAudio();
      stopRecordingCleanup();
    }
  }, [isOpen, stopAllAudio, stopRecordingCleanup]);

  useEffect(() => {
    return () => {
      stopAllAudio();
      stopRecordingCleanup();
    };
  }, [stopAllAudio, stopRecordingCleanup]);

  // Live Canvas Digital Spectrum + Waveform Visualizer
  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    let phase = 0;

    const renderFrame = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        if (canvas.width !== Math.floor(rect.width * dpr)) {
          canvas.width = Math.floor(rect.width * dpr);
          canvas.height = Math.floor(rect.height * dpr);
        }
      }

      const w = canvas.width;
      const h = canvas.height;
      ctx2d.clearRect(0, 0, w, h);

      // Subtle digital grid lines
      ctx2d.strokeStyle = 'rgba(148, 163, 184, 0.12)';
      ctx2d.lineWidth = 1;
      for (let row = 1; row < 4; row++) {
        const y = (h / 4) * row;
        ctx2d.beginPath();
        ctx2d.moveTo(0, y);
        ctx2d.lineTo(w, y);
        ctx2d.stroke();
      }

      const barCount = 44;
      const gap = 3 * dpr;
      const barWidth = Math.max(2, (w - gap * (barCount - 1)) / barCount);

      const analyser = engineRef.current?.getAnalyser();
      let freqData: Uint8Array<ArrayBuffer> | null = null;
      if (isPlaying && analyser) {
        freqData = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
        analyser.getByteFrequencyData(freqData);
      }

      for (let i = 0; i < barCount; i++) {
        let norm = 0.08;
        if (isPlaying && freqData) {
          const binIdx = Math.min(
            freqData.length - 1,
            Math.floor((i / barCount) * (freqData.length * 0.8))
          );
          const rawVal = freqData[binIdx] / 255;
          // Boost upper bins subtly + add subtle speech envelope pulse
          const harmonic = Math.abs(Math.sin(phase * 1.9 + i * 0.28)) * 0.18;
          norm = Math.min(1, Math.max(0.1, rawVal * 1.15 + harmonic));
        } else if (isRecording) {
          norm = 0.18 + Math.abs(Math.sin(phase * 3.2 + i * 0.45)) * 0.65;
        } else if (!prefersReducedMotion) {
          norm = 0.09 + (Math.sin(phase * 0.9 + i * 0.32) + 1) * 0.07;
        }

        const barH = Math.max(4 * dpr, norm * (h - 14 * dpr));
        const x = i * (barWidth + gap);
        const y = (h - barH) / 2;

        const grad = ctx2d.createLinearGradient(0, y, 0, y + barH);
        if (isRecording) {
          grad.addColorStop(0, '#f43f5e');
          grad.addColorStop(1, '#fb7185');
        } else {
          grad.addColorStop(0, selectedPreset.accentColor);
          grad.addColorStop(1, '#fb923c');
        }

        ctx2d.fillStyle = grad;
        ctx2d.beginPath();
        ctx2d.roundRect(x, y, barWidth, barH, Math.min(4 * dpr, barWidth / 2));
        ctx2d.fill();
      }

      phase += isPlaying ? 0.09 : 0.03;
      rafRef.current = window.requestAnimationFrame(renderFrame);
    };

    rafRef.current = window.requestAnimationFrame(renderFrame);
    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, [isOpen, isPlaying, isRecording, selectedPreset.accentColor]);

  // Update live mix volume if user drags sliders while playing
  useEffect(() => {
    if (isPlaying && engineRef.current) {
      engineRef.current.updateMix(selectedPreset, mixSettings);
    }
  }, [isPlaying, selectedPreset, mixSettings]);

  const speakDialogue = useCallback(
    (textToSpeak: string) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.lang = selectedTemplate.lang;
      utterance.rate = mixSettings.voiceRate;
      utterance.pitch = mixSettings.voicePitch;
      utterance.volume = Math.max(0, Math.min(1, mixSettings.voiceVolume / 100));

      if (mixSettings.voiceURI) {
        const picked = availableVoices.find(
          (v) => v.voiceURI === mixSettings.voiceURI
        );
        if (picked) {
          utterance.voice = picked;
        }
      } else {
        const bnVoice = availableVoices.find((v) =>
          v.lang.toLowerCase().startsWith(selectedTemplate.lang.slice(0, 2))
        );
        if (bnVoice) utterance.voice = bnVoice;
      }

      utterance.onend = () => {
        if (!mixSettings.loopPlayback) {
          // Allow music outro for 1.5s then stop cleanly
          ttsDelayRef.current = window.setTimeout(() => {
            stopAllAudio();
          }, 1500);
        }
      };

      window.speechSynthesis.speak(utterance);
    },
    [
      availableVoices,
      mixSettings.loopPlayback,
      mixSettings.voicePitch,
      mixSettings.voiceRate,
      mixSettings.voiceURI,
      mixSettings.voiceVolume,
      selectedTemplate.lang,
      stopAllAudio,
    ]
  );

  const startStudioPlayback = useCallback(
    (overridePresetId?: SynthPresetId) => {
      stopAllAudio();
      const activePreset = overridePresetId
        ? getPresetById(overridePresetId)
        : selectedPreset;

      if (!engineRef.current) {
        engineRef.current = new LiveCallerTuneEngine();
      }

      const useRecBuf = voiceMode === 'mic' ? recordedBuffer : null;
      engineRef.current.start(activePreset, mixSettings, useRecBuf);
      setIsPlaying(true);
      setElapsedSec(0);

      const startedAt = Date.now();
      playbackTimerRef.current = window.setInterval(() => {
        setElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
      }, 250);

      // Play AI Speech if in TTS mode
      if (voiceMode === 'tts' && customScript.trim()) {
        ttsDelayRef.current = window.setTimeout(() => {
          speakDialogue(customScript.trim());
        }, 420);
      } else if (!mixSettings.loopPlayback) {
        const autoStopMs =
          voiceMode === 'mic' && recordedDurationSec > 0
            ? (recordedDurationSec + 1.5) * 1000
            : 10000;
        ttsDelayRef.current = window.setTimeout(() => {
          stopAllAudio();
        }, autoStopMs);
      }
    },
    [
      customScript,
      mixSettings,
      recordedBuffer,
      recordedDurationSec,
      selectedPreset,
      speakDialogue,
      stopAllAudio,
      voiceMode,
    ]
  );

  const handleTogglePlay = () => {
    if (isPlaying) {
      stopAllAudio();
    } else {
      startStudioPlayback();
    }
  };

  const handleSelectPreset = (presetId: SynthPresetId) => {
    const preset = getPresetById(presetId);
    setSelectedPresetId(presetId);
    setMixSettings((prev) => ({ ...prev, bpm: preset.defaultBpm }));
    if (isPlaying) {
      startStudioPlayback(presetId);
    }
  };

  const handleSelectTemplate = (templateId: string) => {
    const tpl =
      SCRIPT_TEMPLATES.find((t) => t.id === templateId) || SCRIPT_TEMPLATES[0];
    setSelectedTemplateId(tpl.id);
    setIsScriptManuallyEdited(false);
    setCustomScript(buildCallerScript(tpl.template, userName, honorific));
    const recPreset = getPresetById(tpl.recommendedPreset);
    setSelectedPresetId(recPreset.id);
    setMixSettings((prev) => ({ ...prev, bpm: recPreset.defaultBpm }));
    if (isPlaying) {
      stopAllAudio();
    }
  };

  const handleStartMicRecording = async () => {
    setMicError(null);
    stopAllAudio();
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setMicError('এই ব্রাউজারে মাইক্রোফোন রেকর্ডিং সমর্থিত নয়। AI বাংলা ভয়েস ব্যবহার করুন।');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      micChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      const startTime = Date.now();
      setRecordingSec(0);
      setIsRecording(true);

      recordTimerRef.current = window.setInterval(() => {
        const secs = Math.floor((Date.now() - startTime) / 1000);
        setRecordingSec(secs);
        if (secs >= 20) {
          stopRecordingCleanup();
        }
      }, 250);

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          micChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const blob = new Blob(micChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        stream.getTracks().forEach((tr) => tr.stop());
        micStreamRef.current = null;
        if (recordTimerRef.current !== null) {
          window.clearInterval(recordTimerRef.current);
          recordTimerRef.current = null;
        }
        setIsRecording(false);

        try {
          const arr = await blob.arrayBuffer();
          const AudioCtx =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext })
              .webkitAudioContext;
          const tempCtx = new AudioCtx();
          const decoded = await tempCtx.decodeAudioData(arr);
          await tempCtx.close();
          setRecordedBuffer(decoded);
          setRecordedDurationSec(Math.round(decoded.duration * 10) / 10);
          setVoiceMode('mic');
          showToast('আপনার নিজের ভয়েস সফলভাবে স্টুডিওতে যুক্ত হয়েছে!');
        } catch {
          setMicError('রেকর্ডিং প্রসেস করা যায়নি, অনুগ্রহ করে আবার চেষ্টা করুন।');
        }
      };

      recorder.start();
    } catch {
      setIsRecording(false);
      setMicError('মাইক্রোফোন অনুমতি পাওয়া যায়নি। ব্রাউজার সেটিংস থেকে অনুমতি দিন।');
    }
  };

  const handleDownloadWav = async () => {
    if (isExportingWav) return;
    setIsExportingWav(true);
    try {
      const wavBlob = await renderCallerTuneToWavBlob(
        selectedPreset,
        mixSettings,
        voiceMode === 'mic' ? recordedBuffer : null,
        2
      );
      const url = URL.createObjectURL(wavBlob);
      const safeName = (userName.trim() || 'osa-user')
        .toLowerCase()
        .replace(/[^a-z0-9\u0980-\u09ff]+/gi, '-');
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName}-osa-caller-tune.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('ডিজিটাল WAV অডিও ফাইল ডাউনলোড হয়েছে!');
    } catch {
      showToast('WAV তৈরি করতে সমস্যা হয়েছে, আবার চেষ্টা করুন।');
    } finally {
      setIsExportingWav(false);
    }
  };

  const buildCurrentTuneObject = (idOverride?: string): SavedCallerTune => {
    const display = formatCallerDisplayName(userName, honorific);
    return {
      id: idOverride || `tune_${Date.now()}`,
      title: `${display} · ${selectedPreset.nameBn}`,
      userName: userName.trim() || 'ইউজার',
      honorific,
      script: customScript.trim(),
      presetId: selectedPresetId,
      templateId: selectedTemplateId,
      settings: { ...mixSettings },
      useAsIncomingRingtone,
      createdAt: new Date().toISOString(),
    };
  };

  const handleActivateCallerTune = () => {
    const tune = buildCurrentTuneObject(activeTuneId || undefined);
    setActiveCallerTune(tune);
    setActiveTuneId(tune.id);

    // Upsert into library so user never loses active tune
    setSavedLibrary((prev) => {
      const exists = prev.some((item) => item.id === tune.id);
      const next = exists
        ? prev.map((item) => (item.id === tune.id ? tune : item))
        : [tune, ...prev].slice(0, 20);
      saveCallerTunesList(next);
      return next;
    });

    showToast(
      useAsIncomingRingtone
        ? 'কলার টিউন ও ইনকামিং রিংটোন সক্রিয় হয়েছে!'
        : 'আপনার ডিজিটাল কলার টিউন প্রোফাইলে সক্রিয় হয়েছে!'
    );
  };

  const handleSaveToLibrary = () => {
    const tune = buildCurrentTuneObject();
    setSavedLibrary((prev) => {
      const next = [tune, ...prev].slice(0, 20);
      saveCallerTunesList(next);
      return next;
    });
    setActiveTuneId(tune.id);
    setRightTab('library');
    showToast('নতুন কলার টিউন লাইব্রেরিতে সেভ হয়েছে!');
  };

  const handleLoadLibraryTune = (tune: SavedCallerTune) => {
    stopAllAudio();
    setUserName(tune.userName);
    setHonorific(tune.honorific);
    setSelectedTemplateId(tune.templateId);
    setSelectedPresetId(tune.presetId);
    setCustomScript(tune.script);
    setIsScriptManuallyEdited(true);
    setMixSettings({ ...tune.settings });
    setUseAsIncomingRingtone(tune.useAsIncomingRingtone);
    setActiveTuneId(tune.id);
    showToast(`লোড হয়েছে: ${tune.title}`);
  };

  const handleDeleteLibraryTune = (id: string) => {
    setSavedLibrary((prev) => {
      const next = prev.filter((item) => item.id !== id);
      saveCallerTunesList(next);
      return next;
    });
    if (activeTuneId === id) {
      setActiveTuneId(null);
    }
  };

  const handleShareOrCopy = async () => {
    const shareText = `OSA ডিজিটাল কলার টিউন (${formatCallerDisplayName(
      userName,
      honorific
    )}):\n"${customScript.trim()}"\nসুর: ${selectedPreset.nameBn} (${mixSettings.bpm} BPM)`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'OSA ডিজিটাল কলার টিউন স্টুডিও',
          text: shareText,
        });
        return;
      } catch {
        // Fallback to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(shareText);
      showToast('কলার টিউন স্ক্রিপ্ট কপি হয়েছে!');
    } catch {
      showToast('শেয়ার/কপি করা সম্ভব হয়নি।');
    }
  };

  if (!isOpen) return null;

  const formatTimer = (sec: number) => {
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-md p-2 sm:p-4">
      <div className="w-full max-w-5xl rounded-3xl bg-slate-950 text-slate-100 border border-slate-800 shadow-2xl flex flex-col max-h-[94vh] overflow-hidden">
        {/* Studio Header */}
        <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-600 text-white flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/20">
              <Radio className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-white truncate">
                নিজের নামের কলার টিউন স্টুডিও
              </h2>
              <p className="text-xs text-slate-400 truncate">
                ডিজিটাল সিন্থেসাইজার · লাইভ স্পেকট্রাম · ভয়েস মিক্সার ও WAV এক্সপোর্ট
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              stopAllAudio();
              stopRecordingCleanup();
              onClose();
            }}
            aria-label="স্টুডিও বন্ধ করুন"
            className="w-11 h-11 rounded-full flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 transition shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main Scrollable Console Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
          {toastMsg && (
            <div
              role="status"
              aria-live="polite"
              className="mb-4 px-4 py-3 rounded-2xl bg-emerald-950/80 border border-emerald-700/70 text-emerald-200 text-xs font-semibold flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{toastMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* LEFT COLUMN: Digital Visualizer + Transport + Name & Script Composer */}
            <div className="lg:col-span-7 space-y-5">
              {/* Digital Audio Spectrum Console */}
              <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4 sm:p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <Waves className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="font-semibold text-white truncate">
                      {selectedPreset.nameBn}
                    </span>
                    <span className="text-slate-500" aria-hidden="true">
                      ·
                    </span>
                    <span className="text-slate-400 font-mono tabular-nums">
                      {selectedPreset.musicalKey} · {mixSettings.bpm} BPM
                    </span>
                  </div>
                  <div className="font-mono tabular-nums text-xs font-semibold text-amber-400">
                    {isRecording
                      ? `REC ${formatTimer(recordingSec)}`
                      : isPlaying
                        ? `PLAYING ${formatTimer(elapsedSec)}`
                        : 'READY 00:00'}
                  </div>
                </div>

                {/* Live Audio-Reactive Spectrum Canvas */}
                <div className="relative h-28 sm:h-32 w-full rounded-xl bg-slate-950 border border-slate-800/90 overflow-hidden p-2">
                  <canvas
                    ref={canvasRef}
                    className="w-full h-full block"
                    aria-label="ডিজিটাল সাউন্ড স্পেকট্রাম"
                  />
                </div>

                {/* Transport & Export Buttons */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleTogglePlay}
                    className={`flex-1 min-w-[170px] min-h-[44px] px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition ${
                      isPlaying
                        ? 'bg-rose-600 hover:bg-rose-500 text-white'
                        : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                    }`}
                  >
                    {isPlaying ? (
                      <>
                        <Square className="w-4 h-4 fill-current" />
                        <span>প্লেব্যাক বন্ধ করুন</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 fill-current" />
                        <span>ডিজিটাল স্টুডিও প্রিভিউ শুনুন</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setMixSettings((prev) => ({
                        ...prev,
                        loopPlayback: !prev.loopPlayback,
                      }))
                    }
                    aria-pressed={mixSettings.loopPlayback}
                    title="লুপ মোড"
                    className={`min-h-[44px] px-3.5 py-2.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition whitespace-nowrap ${
                      mixSettings.loopPlayback
                        ? 'bg-slate-800 border-amber-500/60 text-amber-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Repeat className="w-4 h-4" />
                    <span>লুপ</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadWav}
                    disabled={isExportingWav}
                    className="min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap disabled:opacity-50"
                  >
                    <Download className="w-4 h-4 text-emerald-400" />
                    <span>{isExportingWav ? 'তৈরি হচ্ছে...' : '.WAV ডাউনলোড'}</span>
                  </button>
                </div>
              </div>

              {/* Name & Caller Script Composer */}
              <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4 sm:p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-7">
                    <label
                      htmlFor="caller-tune-name-input"
                      className="text-xs font-semibold text-slate-300 block mb-1.5"
                    >
                      আপনার নাম (কলার যা শুনবে)
                    </label>
                    <input
                      id="caller-tune-name-input"
                      type="text"
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                      placeholder="আপনার নাম লিখুন..."
                      className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm font-semibold text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="sm:col-span-5">
                    <label
                      htmlFor="caller-tune-honorific"
                      className="text-xs font-semibold text-slate-300 block mb-1.5"
                    >
                      নামের সাথে উপাধি / সম্বোধন
                    </label>
                    <select
                      id="caller-tune-honorific"
                      value={honorific}
                      onChange={(e) => setHonorific(e.target.value)}
                      className="w-full min-h-[44px] px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm font-medium text-white focus:outline-none focus:border-amber-500"
                    >
                      {HONORIFIC_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Template Category Switcher */}
                <div>
                  <span className="text-xs font-semibold text-slate-300 block mb-2">
                    স্মার্ট ডায়লগ টেমপ্লেট বাছাই করুন
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {SCRIPT_TEMPLATES.map((tpl) => {
                      const active = selectedTemplateId === tpl.id;
                      return (
                        <button
                          key={tpl.id}
                          type="button"
                          onClick={() => handleSelectTemplate(tpl.id)}
                          className={`min-h-[44px] px-3 py-2 rounded-xl text-left border transition ${
                            active
                              ? 'bg-amber-500/15 border-amber-500 text-white'
                              : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <span className="text-[11px] text-slate-400 block truncate">
                            {tpl.categoryBn}
                          </span>
                          <span className="text-xs font-semibold block truncate">
                            {tpl.nameBn}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Editable Live Script */}
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <label
                      htmlFor="caller-tune-script-box"
                      className="text-xs font-semibold text-slate-300"
                    >
                      কাস্টম কলার ডায়লগ (সম্পাদনাযোগ্য)
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono tabular-nums text-slate-400">
                        {customScript.length} অক্ষর
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setIsScriptManuallyEdited(false);
                          setCustomScript(
                            buildCallerScript(
                              selectedTemplate.template,
                              userName,
                              honorific
                            )
                          );
                        }}
                        className="text-xs text-amber-400 hover:text-amber-300 font-medium inline-flex items-center gap-1 py-1 px-2 rounded-lg hover:bg-slate-800"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>রিসেট</span>
                      </button>
                    </div>
                  </div>
                  <textarea
                    id="caller-tune-script-box"
                    rows={3}
                    value={customScript}
                    onChange={(e) => {
                      setIsScriptManuallyEdited(true);
                      setCustomScript(e.target.value);
                    }}
                    placeholder="আপনার পছন্দের ডায়লগ লিখুন..."
                    className="w-full px-3.5 py-3 rounded-xl bg-slate-950 border border-slate-700 text-sm text-slate-100 leading-relaxed focus:outline-none focus:border-amber-500 resize-none"
                  />
                  <div className="flex items-center justify-between gap-2 pt-2">
                    <button
                      type="button"
                      onClick={handleShareOrCopy}
                      className="min-h-[40px] px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium inline-flex items-center gap-1.5 transition"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>স্ক্রিপ্ট শেয়ার / কপি</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveToLibrary}
                      className="min-h-[40px] px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-semibold inline-flex items-center gap-1.5 transition"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>লাইব্রেরিতে সেভ করুন</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: Digital Studio Tabs (Presets / Audio Mixer & Mic / Saved Library) */}
            <div className="lg:col-span-5 space-y-4">
              {/* Segmented Studio Console Tabs */}
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-900 border border-slate-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => setRightTab('presets')}
                  className={`min-h-[44px] px-2 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition whitespace-nowrap ${
                    rightTab === 'presets'
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Music2 className="w-4 h-4 shrink-0" />
                  <span>সিন্থ ট্র্যাক</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRightTab('mixer')}
                  className={`min-h-[44px] px-2 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition whitespace-nowrap ${
                    rightTab === 'mixer'
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Sliders className="w-4 h-4 shrink-0" />
                  <span>মিক্সার ও মাইক</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRightTab('library')}
                  className={`min-h-[44px] px-2 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition whitespace-nowrap ${
                    rightTab === 'library'
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Library className="w-4 h-4 shrink-0" />
                  <span>সেভ ({savedLibrary.length})</span>
                </button>
              </div>

              {/* TAB 1: Digital Synth Presets */}
              {rightTab === 'presets' && (
                <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4 space-y-2.5">
                  <div className="flex items-center justify-between text-xs text-slate-400 pb-1">
                    <span className="font-semibold text-slate-200">
                      ৬টি ডিজিটাল মিউজিক ইঞ্জিন
                    </span>
                    <span>ট্যাপ করলে প্রিভিউ বদলাবে</span>
                  </div>
                  <div className="space-y-2">
                    {SYNTH_PRESETS.map((preset) => {
                      const active = selectedPresetId === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => handleSelectPreset(preset.id)}
                          className={`w-full min-h-[60px] p-3 rounded-xl text-left border flex items-center justify-between gap-3 transition ${
                            active
                              ? 'bg-amber-500/12 border-amber-500 text-white'
                              : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-bold truncate">
                              {preset.nameBn}
                            </p>
                            <p className="text-[11px] text-slate-400 truncate mt-0.5">
                              {preset.subtitleBn}
                            </p>
                            <p className="text-[11px] font-mono tabular-nums text-slate-500 mt-1">
                              {preset.musicalKey} · {preset.defaultBpm} BPM
                            </p>
                          </div>
                          <span
                            className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border ${
                              active
                                ? 'bg-amber-500 border-amber-400 text-slate-950'
                                : 'bg-slate-900 border-slate-700 text-slate-400'
                            }`}
                          >
                            {active ? (
                              <Check className="w-4 h-4 stroke-[3]" />
                            ) : (
                              <Play className="w-3.5 h-3.5 fill-current" />
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 2: Voice Source (AI TTS vs Mic Record) & Digital Mixer Sliders */}
              {rightTab === 'mixer' && (
                <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4 space-y-4">
                  {/* Voice Source Selector */}
                  <div>
                    <span className="text-xs font-semibold text-slate-300 block mb-2">
                      ভয়েস সোর্স নির্বাচন করুন
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setVoiceMode('tts')}
                        className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition ${
                          voiceMode === 'tts'
                            ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                            : 'bg-slate-950 border-slate-800 text-slate-400'
                        }`}
                      >
                        <Volume2 className="w-4 h-4" />
                        <span>AI ডিজিটাল ভয়েস</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setVoiceMode('mic')}
                        className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition ${
                          voiceMode === 'mic'
                            ? 'bg-rose-500/15 border-rose-500 text-rose-300'
                            : 'bg-slate-950 border-slate-800 text-slate-400'
                        }`}
                      >
                        <Mic className="w-4 h-4" />
                        <span>নিজের ভয়েস রেকর্ড</span>
                      </button>
                    </div>
                  </div>

                  {/* Mode Specific Controls */}
                  {voiceMode === 'tts' ? (
                    <div className="space-y-3 pt-1">
                      <div>
                        <label
                          htmlFor="tts-voice-picker"
                          className="text-xs font-medium text-slate-400 block mb-1"
                        >
                          সিস্টেম ভয়েস ইঞ্জিন ({availableVoices.length}টি পাওয়া গেছে)
                        </label>
                        <select
                          id="tts-voice-picker"
                          value={mixSettings.voiceURI}
                          onChange={(e) =>
                            setMixSettings((prev) => ({
                              ...prev,
                              voiceURI: e.target.value,
                            }))
                          }
                          className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                        >
                          <option value="">অটো বাংলা / সেরা ভয়েস</option>
                          {availableVoices.map((v) => (
                            <option key={v.voiceURI} value={v.voiceURI}>
                              {v.name} ({v.lang})
                            </option>
                          ))}
                        </select>
                      </div>

                      <SliderRow
                        label="ভয়েস গতি (Speed)"
                        valueDisplay={`${mixSettings.voiceRate.toFixed(2)}x`}
                        min={0.75}
                        max={1.35}
                        step={0.05}
                        value={mixSettings.voiceRate}
                        onChange={(v) =>
                          setMixSettings((prev) => ({ ...prev, voiceRate: v }))
                        }
                      />

                      <SliderRow
                        label="ভয়েস পিচ (Tone Pitch)"
                        valueDisplay={`${mixSettings.voicePitch.toFixed(2)}`}
                        min={0.7}
                        max={1.4}
                        step={0.05}
                        value={mixSettings.voicePitch}
                        onChange={(v) =>
                          setMixSettings((prev) => ({ ...prev, voicePitch: v }))
                        }
                      />
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                      <p className="text-xs text-slate-300 leading-relaxed">
                        মাইক্রোফোনে আপনার কলার গ্রিটিংস রেকর্ড করুন (সর্বোচ্চ ২০ সেকেন্ড)। সেটি স্বয়ংক্রিয়ভাবে সিন্থ মিউজিক ও ইকোর সাথে মিক্স হয়ে যাবে এবং WAV-এ ডাউনলোড করা যাবে।
                      </p>

                      {micError && (
                        <p className="text-xs text-rose-400 font-medium">{micError}</p>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        {isRecording ? (
                          <button
                            type="button"
                            onClick={stopRecordingCleanup}
                            className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center justify-center gap-2"
                          >
                            <MicOff className="w-4 h-4" />
                            <span className="font-mono tabular-nums">
                              থামান ({recordingSec}s)
                            </span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={handleStartMicRecording}
                            className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center justify-center gap-2"
                          >
                            <Mic className="w-4 h-4" />
                            <span>
                              {recordedBuffer
                                ? 'আবার রেকর্ড করুন'
                                : 'ভয়েস রেকর্ড শুরু করুন'}
                            </span>
                          </button>
                        )}

                        {recordedBuffer && !isRecording && (
                          <button
                            type="button"
                            onClick={() => {
                              setRecordedBuffer(null);
                              setRecordedDurationSec(0);
                            }}
                            className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                          >
                            মুছুন ({recordedDurationSec}s)
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Shared Audio Console DSP Sliders */}
                  <div className="pt-2 border-t border-slate-800 space-y-3">
                    <SliderRow
                      label="ব্যাকগ্রাউন্ড সিন্থ ভলিউম"
                      valueDisplay={`${mixSettings.bgmVolume}%`}
                      min={0}
                      max={100}
                      step={2}
                      value={mixSettings.bgmVolume}
                      onChange={(v) =>
                        setMixSettings((prev) => ({ ...prev, bgmVolume: v }))
                      }
                    />
                    <SliderRow
                      label="ভয়েস ভলিউম"
                      valueDisplay={`${mixSettings.voiceVolume}%`}
                      min={10}
                      max={100}
                      step={2}
                      value={mixSettings.voiceVolume}
                      onChange={(v) =>
                        setMixSettings((prev) => ({ ...prev, voiceVolume: v }))
                      }
                    />
                    <SliderRow
                      label="স্টুডিও ইকো / রিভার্ব (Echo)"
                      valueDisplay={`${mixSettings.echoMix}%`}
                      min={0}
                      max={90}
                      step={2}
                      value={mixSettings.echoMix}
                      onChange={(v) =>
                        setMixSettings((prev) => ({ ...prev, echoMix: v }))
                      }
                    />
                    <SliderRow
                      label="মিউজিক টেম্পো (BPM)"
                      valueDisplay={`${mixSettings.bpm} BPM`}
                      min={75}
                      max={145}
                      step={1}
                      value={mixSettings.bpm}
                      onChange={(v) =>
                        setMixSettings((prev) => ({ ...prev, bpm: v }))
                      }
                    />
                  </div>
                </div>
              )}

              {/* TAB 3: Saved Tunes Library */}
              {rightTab === 'library' && (
                <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-200">
                      আমার সেভ করা ডিজিটাল টিউন
                    </span>
                    <span className="text-slate-400 font-mono tabular-nums">
                      {savedLibrary.length} টি
                    </span>
                  </div>

                  {savedLibrary.length === 0 ? (
                    <div className="py-8 px-4 text-center rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                      <Library className="w-7 h-7 text-slate-600 mx-auto" />
                      <p className="text-xs text-slate-400">
                        এখনও কোনো কলার টিউন সেভ করা হয়নি। বাম দিক থেকে "লাইব্রেরিতে সেভ করুন" বাটনে ট্যাপ করুন।
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                      {savedLibrary.map((item) => {
                        const isCurrent = activeTuneId === item.id;
                        return (
                          <div
                            key={item.id}
                            className={`p-3 rounded-xl border flex items-start justify-between gap-2 transition ${
                              isCurrent
                                ? 'bg-amber-500/10 border-amber-500/70'
                                : 'bg-slate-950 border-slate-800'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => handleLoadLibraryTune(item)}
                              className="flex-1 text-left min-w-0"
                            >
                              <p className="text-xs font-bold text-white truncate">
                                {item.title}
                              </p>
                              <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5">
                                {item.script}
                              </p>
                              <p className="text-[11px] font-mono tabular-nums text-slate-500 mt-1">
                                {item.settings.bpm} BPM · Echo {item.settings.echoMix}%
                              </p>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteLibraryTune(item.id)}
                              aria-label="টিউন ডিলিট করুন"
                              className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-slate-800 shrink-0"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Activation & Ringtone Sync Card */}
              <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4 space-y-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useAsIncomingRingtone}
                    onChange={(e) => setUseAsIncomingRingtone(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded accent-amber-500 shrink-0"
                  />
                  <span className="text-xs text-slate-300 leading-relaxed">
                    <strong className="text-white block">
                      OSA ইনকামিং কল রিংটোন হিসেবেও ব্যবহার করুন
                    </strong>
                    চালু করলে আপনার কাস্টম ডিজিটাল সিন্থ টিউনটি ইনকামিং অডিও ও ভিডিও কলে বাজবে।
                  </span>
                </label>

                <button
                  type="button"
                  onClick={handleActivateCallerTune}
                  className="w-full min-h-[48px] py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition active:scale-[0.99]"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>এই ডিজিটাল কলার টিউনটি সক্রিয় করুন</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface SliderRowProps {
  label: string;
  valueDisplay: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (val: number) => void;
}

const SliderRow: React.FC<SliderRowProps> = ({
  label,
  valueDisplay,
  min,
  max,
  step,
  value,
  onChange,
}) => (
  <div>
    <div className="flex items-center justify-between text-xs mb-1">
      <span className="text-slate-300 font-medium">{label}</span>
      <span className="font-mono tabular-nums text-amber-400 font-semibold">
        {valueDisplay}
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full h-2 rounded-lg accent-amber-500 bg-slate-800 cursor-pointer"
    />
  </div>
);
