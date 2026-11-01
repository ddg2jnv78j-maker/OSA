import React, { useState, useEffect, useRef } from 'react';
import { 
  Radio, 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  X, 
  Minimize2, 
  Maximize2, 
  Activity, 
  Users, 
  Wifi, 
  ShieldCheck 
} from 'lucide-react';
import { RealtimeChannel } from '@supabase/supabase-js';

interface WalkieTalkieModalProps {
  isOpen: boolean;
  onClose: () => void;
  channel: RealtimeChannel | null;
  chatId: string;
  chatTitle: string;
  currentUser: {
    id: string;
    full_name: string;
    avatar_url?: string | null;
  };
  language?: string;
}

// Tactical audio synthesizer for walkie-talkie squelch & beeps
const playRadioSound = (type: 'start' | 'end' | 'chirp') => {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    if (type === 'start') {
      // Roger beep tone
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1760, ctx.currentTime); // A6
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } else if (type === 'end') {
      // Dual squelch tone
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      osc1.type = 'triangle';
      osc2.type = 'square';
      osc1.frequency.setValueAtTime(880, ctx.currentTime);
      osc2.frequency.setValueAtTime(440, ctx.currentTime);
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);
      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + 0.18);
      osc2.stop(ctx.currentTime + 0.18);
    } else {
      // Channel chirp
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, ctx.currentTime);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    }
  } catch {
    // Audio context may require prior user interaction
  }
};

export const WalkieTalkieModal: React.FC<WalkieTalkieModalProps> = ({
  isOpen,
  onClose,
  channel,
  chatId,
  chatTitle,
  currentUser,
  language = 'en',
}) => {
  const isBn = language === 'bn';
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const [activeSpeaker, setActiveSpeaker] = useState<{ id: string; name: string } | null>(null);
  const [frequencyChannel] = useState(() => `CH-${chatId.slice(0, 4).toUpperCase()}`);
  const [activeMembers, setActiveMembers] = useState<string[]>([currentUser.full_name]);
  const [volumeLevel, setVolumeLevel] = useState<number>(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const animFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const incomingAudioRef = useRef<HTMLAudioElement | null>(null);

  // Set up Supabase Realtime listeners for walkie-talkie
  useEffect(() => {
    if (!channel || !isOpen) return;

    // Join presence
    playRadioSound('chirp');

    const handleTransmission = (payload: { payload: { senderId: string; senderName: string; audioBase64: string; isStart?: boolean; isEnd?: boolean } }) => {
      const data = payload.payload;
      if (data.senderId === currentUser.id) return;

      if (data.isStart) {
        setActiveSpeaker({ id: data.senderId, name: data.senderName });
        playRadioSound('start');
      } else if (data.isEnd) {
        setActiveSpeaker(null);
        playRadioSound('end');
      } else if (data.audioBase64 && !isMuted) {
        setActiveSpeaker({ id: data.senderId, name: data.senderName });
        try {
          const audio = new Audio(`data:audio/webm;base64,${data.audioBase64}`);
          incomingAudioRef.current = audio;
          audio.play().catch(() => {});
          audio.onended = () => {
            setActiveSpeaker(null);
          };
        } catch {
          // ignore playback errors
        }
      }
    };

    channel.on('broadcast', { event: 'walkie_talkie_stream' }, handleTransmission);

    return () => {
      if (incomingAudioRef.current) {
        incomingAudioRef.current.pause();
        incomingAudioRef.current = null;
      }
    };
  }, [channel, isOpen, currentUser.id, isMuted]);

  // Clean up mic stream on unmount
  useEffect(() => {
    return () => {
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  // Keyboard shortcut: Hold Spacebar to talk
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && !isTalking && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        startTransmitting();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && isTalking) {
        e.preventDefault();
        stopTransmitting();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isOpen, isTalking]);

  const startTransmitting = async () => {
    if (activeSpeaker && activeSpeaker.id !== currentUser.id) {
      // Channel busy
      return;
    }
    try {
      playRadioSound('start');
      setIsTalking(true);

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          echoCancellation: true, 
          noiseSuppression: true, 
          autoGainControl: true 
        } 
      });
      audioStreamRef.current = stream;

      // Setup audio analyzer for volume meter
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((acc, v) => acc + v, 0) / dataArray.length;
        setVolumeLevel(Math.min(100, Math.round((avg / 255) * 150)));
        animFrameRef.current = requestAnimationFrame(updateVolume);
      };
      updateVolume();

      // Broadcast start signal
      channel?.send({
        type: 'broadcast',
        event: 'walkie_talkie_stream',
        payload: {
          senderId: currentUser.id,
          senderName: currentUser.full_name,
          isStart: true,
        },
      });

      // Start MediaRecorder
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (audioBlob.size > 0) {
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = () => {
            const base64data = (reader.result as string).split(',')[1];
            channel?.send({
              type: 'broadcast',
              event: 'walkie_talkie_stream',
              payload: {
                senderId: currentUser.id,
                senderName: currentUser.full_name,
                audioBase64: base64data,
              },
            });
          };
        }
      };

      recorder.start();
    } catch {
      setIsTalking(false);
    }
  };

  const stopTransmitting = () => {
    if (!isTalking) return;
    setIsTalking(false);
    setVolumeLevel(0);
    playRadioSound('end');

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    // Broadcast end signal
    channel?.send({
      type: 'broadcast',
      event: 'walkie_talkie_stream',
      payload: {
        senderId: currentUser.id,
        senderName: currentUser.full_name,
        isEnd: true,
      },
    });
  };

  if (!isOpen) return null;

  // Minimized floating widget
  if (isMinimized) {
    return (
      <div className="fixed bottom-24 right-4 z-50 bg-slate-900/95 backdrop-blur-md border border-emerald-500/40 rounded-2xl p-2.5 shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-3 duration-200">
        <div className="relative">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isTalking ? 'bg-red-500 animate-pulse text-white' : activeSpeaker ? 'bg-amber-500 text-white animate-bounce' : 'bg-emerald-600/30 text-emerald-400'}`}>
            <Radio className="w-5 h-5" />
          </div>
          <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-slate-900" />
        </div>

        <div className="text-left pr-2">
          <p className="text-[11px] font-bold text-emerald-400 tracking-wider">
            {frequencyChannel}
          </p>
          <p className="text-[10px] text-slate-300 font-medium truncate max-w-[110px]">
            {isTalking ? (isBn ? 'ট্রান্সমিট হচ্ছে...' : 'Transmitting...') : activeSpeaker ? activeSpeaker.name : isBn ? 'অনলাইন' : 'Standby'}
          </p>
        </div>

        {/* Quick Hold to Talk button */}
        <button
          type="button"
          onMouseDown={startTransmitting}
          onMouseUp={stopTransmitting}
          onTouchStart={startTransmitting}
          onTouchEnd={stopTransmitting}
          className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs transition-all active:scale-95 ${
            isTalking 
              ? 'bg-red-600 text-white ring-2 ring-red-400 shadow-lg shadow-red-500/50' 
              : 'bg-emerald-600 hover:bg-emerald-500 text-white'
          }`}
          title="Hold to talk"
        >
          <Mic className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => setIsMinimized(false)}
          className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
          title="Expand"
        >
          <Maximize2 className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onClose}
          className="p-1.5 text-slate-400 hover:text-red-400 rounded-lg hover:bg-slate-800"
          title="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // Full Tactical Walkie-Talkie Modal
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border border-emerald-500/30 rounded-3xl shadow-2xl overflow-hidden relative text-white">
        {/* Tactical Accent Bars */}
        <div className="h-1.5 w-full bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-500" />

        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between border-b border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-wide flex items-center gap-1.5">
                <span>{isBn ? 'ওয়াকি-টকি পিটিটি' : 'PTT Walkie-Talkie'}</span>
                <span className="px-1.5 py-0.2 text-[9px] bg-emerald-500/20 text-emerald-300 rounded border border-emerald-500/30">
                  LIVE
                </span>
              </h3>
              <p className="text-[11px] text-slate-400 truncate max-w-[160px]">{chatTitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setIsMuted(!isMuted)}
              className={`p-2 rounded-xl transition-all ${isMuted ? 'text-red-400 bg-red-500/10' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
              title={isMuted ? 'Unmute Speaker' : 'Mute Speaker'}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => setIsMinimized(true)}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-all"
              title="Minimize"
            >
              <Minimize2 className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-red-400 rounded-xl hover:bg-slate-800 transition-all"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tactical LCD Radio Screen */}
        <div className="p-5">
          <div className="p-4 rounded-2xl bg-black/60 border border-emerald-500/25 shadow-inner relative overflow-hidden">
            {/* Scanlines effect */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(18,25,23,0)_50%,rgba(0,0,0,0.5)_50%)] bg-[length:100%_4px] pointer-events-none opacity-40" />

            <div className="flex items-center justify-between text-[11px] text-emerald-400 font-mono mb-2">
              <span className="flex items-center gap-1">
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                FREQUENCY: {frequencyChannel}
              </span>
              <span className="flex items-center gap-1 text-[10px] text-emerald-300 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/60">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                SECURE
              </span>
            </div>

            {/* Status Center Banner */}
            <div className="py-4 text-center">
              {isTalking ? (
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 font-mono text-xs font-bold animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                    TRANSMITTING LIVE
                  </div>
                  <p className="text-xs text-slate-300 font-medium pt-1">
                    {isBn ? 'আপনার ভয়েস সরাসরি শোনা যাচ্ছে' : 'You are broadcasting audio'}
                  </p>
                </div>
              ) : activeSpeaker ? (
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 font-mono text-xs font-bold animate-bounce">
                    <Activity className="w-3.5 h-3.5 text-amber-400" />
                    INCOMING AUDIO
                  </div>
                  <p className="text-sm text-amber-200 font-bold">
                    {activeSpeaker.name} {isBn ? 'কথা বলছেন...' : 'is talking...'}
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <span className="text-xs font-mono text-emerald-400/80 tracking-widest">
                    READY • STANDBY
                  </span>
                  <p className="text-[11px] text-slate-400">
                    {isBn ? 'কথা বলতে নিচে প্রেস করে ধরে রাখুন' : 'Hold the button below to talk'}
                  </p>
                </div>
              )}
            </div>

            {/* Realtime Audio Volume Meter */}
            <div className="h-2 w-full bg-slate-800/80 rounded-full overflow-hidden flex gap-0.5 p-0.5">
              {[...Array(20)].map((_, i) => {
                const threshold = (i / 20) * 100;
                const isLit = isTalking ? volumeLevel >= threshold : activeSpeaker ? Math.random() > 0.4 : false;
                const color = i < 12 ? 'bg-emerald-400' : i < 16 ? 'bg-amber-400' : 'bg-red-500';
                return (
                  <div
                    key={i}
                    className={`flex-1 rounded-sm transition-all duration-75 ${isLit ? color : 'bg-slate-700/40'}`}
                  />
                );
              })}
            </div>
          </div>

          {/* Big Circular Push-to-Talk Button */}
          <div className="py-6 flex flex-col items-center justify-center">
            <button
              type="button"
              onMouseDown={startTransmitting}
              onMouseUp={stopTransmitting}
              onTouchStart={(e) => {
                e.preventDefault();
                startTransmitting();
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                stopTransmitting();
              }}
              className={`relative w-28 h-28 rounded-full flex flex-col items-center justify-center transition-all select-none focus:outline-none ${
                isTalking
                  ? 'bg-gradient-to-tr from-red-600 to-rose-500 shadow-2xl shadow-red-500/60 scale-95 ring-4 ring-red-400/50'
                  : 'bg-gradient-to-tr from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 shadow-xl shadow-emerald-500/30 hover:scale-105 active:scale-95 ring-4 ring-emerald-500/20'
              }`}
            >
              {/* Outer Pulse Rings when Talking */}
              {isTalking && (
                <div className="absolute inset-0 rounded-full border-4 border-red-500 animate-ping opacity-60 pointer-events-none" />
              )}
              
              <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center mb-1">
                {isTalking ? (
                  <Mic className="w-6 h-6 text-white animate-pulse" />
                ) : (
                  <Radio className="w-6 h-6 text-white" />
                )}
              </div>
              <span className="text-[11px] font-black tracking-wider uppercase text-white">
                {isTalking ? (isBn ? 'কথা বলুন' : 'TALKING') : (isBn ? 'ধরে রাখুন' : 'HOLD PTT')}
              </span>
            </button>

            <p className="mt-3 text-[11px] text-slate-400 text-center font-mono">
              {isBn ? 'স্পেসবার চেপে ধরেও কথা বলতে পারবেন' : 'Or press & hold Spacebar on keyboard'}
            </p>
          </div>

          {/* Active Members Footer */}
          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-slate-400" />
              {activeMembers.length} {isBn ? 'জন চ্যানেল শুনছেন' : 'Listening on Channel'}
            </span>
            <span className="text-[11px] text-emerald-400 font-medium">
              ● {isBn ? 'সক্রিয়' : 'Connected'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
