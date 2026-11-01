import React, { useEffect, useRef, useState } from 'react';
import { Heart, Activity, X, Sparkles, Send, Volume2, VolumeX, Flame } from 'lucide-react';
import { Profile } from '../../types/osa';

interface HeartbeatTouchModalProps {
  isOpen: boolean;
  onClose: () => void;
  channel: any;
  chatId: string;
  chatTitle: string;
  currentUser: Profile;
  onSendHeartbeatNote?: (bpm: number, message: string) => void;
  language?: string;
}

export const HeartbeatTouchModal: React.FC<HeartbeatTouchModalProps> = ({
  isOpen,
  onClose,
  channel,
  chatId,
  chatTitle,
  currentUser,
  onSendHeartbeatNote,
  language = 'en',
}) => {
  const isBn = language === 'bn';

  const [bpm, setBpm] = useState<number>(75);
  const [isPressing, setIsPressing] = useState(false);
  const [isPeerPressing, setIsPeerPressing] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [pulseCount, setPulseCount] = useState(0);
  const [resonanceLevel, setResonanceLevel] = useState(1);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<number | null>(null);

  // Play realistic physiological lub-dub heartbeat sound via Web Audio API synth
  const playLubDub = (currentBpm: number) => {
    if (!soundEnabled) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const now = ctx.currentTime;

      // "Lub" (S1 - first heart sound, lower pitch)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(65, now);
      osc1.frequency.exponentialRampToValueAtTime(35, now + 0.12);

      gain1.gain.setValueAtTime(0.7, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.13);

      // "Dub" (S2 - second heart sound, slightly higher and crisper, 140ms later)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(80, now + 0.14);
      osc2.frequency.exponentialRampToValueAtTime(45, now + 0.24);

      gain2.gain.setValueAtTime(0.6, now + 0.14);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.14);
      osc2.stop(now + 0.25);

      // Haptic Vibration if supported
      if ('vibrate' in navigator) {
        navigator.vibrate([60, 50, 90]);
      }
    } catch {}
  };

  // Heartbeat loop timer
  useEffect(() => {
    if (!isOpen) return;

    const intervalMs = (60 / bpm) * 1000;
    intervalRef.current = window.setInterval(() => {
      setPulseCount((c) => c + 1);
      if (isPressing || isPeerPressing) {
        playLubDub(bpm);
      }
    }, intervalMs);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isOpen, bpm, isPressing, isPeerPressing, soundEnabled]);

  // Realtime Supabase channel sync
  useEffect(() => {
    if (!isOpen || !channel) return;

    const sub = channel.on('broadcast', { event: `heartbeat_touch_${chatId}` }, (payload: any) => {
      const data = payload.payload;
      if (data.senderId === currentUser.id) return;

      if (data.type === 'touch_start') {
        setIsPeerPressing(true);
        setResonanceLevel(2);
      } else if (data.type === 'touch_end') {
        setIsPeerPressing(false);
        setResonanceLevel(1);
      } else if (data.type === 'bpm_change') {
        setBpm(data.bpm);
      }
    });

    return () => {
      // Cleanup
    };
  }, [isOpen, channel, chatId, currentUser.id]);

  const broadcastTouch = (isStart: boolean) => {
    if (!channel) return;
    try {
      channel.send({
        type: 'broadcast',
        event: `heartbeat_touch_${chatId}`,
        payload: {
          type: isStart ? 'touch_start' : 'touch_end',
          senderId: currentUser.id,
          senderName: currentUser.full_name,
          bpm,
        },
      });
    } catch {}
  };

  const handleStartPress = () => {
    setIsPressing(true);
    broadcastTouch(true);
    playLubDub(bpm);
  };

  const handleEndPress = () => {
    setIsPressing(false);
    broadcastTouch(false);
  };

  const handleSendHeartbeatToChat = () => {
    if (onSendHeartbeatNote) {
      onSendHeartbeatNote(
        bpm,
        isBn
          ? `আমার হৃদস্পন্দন (${bpm} BPM) তোমার কাছে পৌঁছাল ❤️`
          : `Sent a live heartbeat pulse of ${bpm} BPM ❤️`
      );
    }
    onClose();
  };

  if (!isOpen) return null;

  const isSynchronized = isPressing && isPeerPressing;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/90 backdrop-blur-2xl animate-in fade-in select-none">
      <div className="relative w-full max-w-sm bg-slate-950 text-white rounded-3xl border border-rose-500/30 shadow-2xl shadow-rose-950/40 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-b from-rose-950/60 via-slate-950 to-slate-950 border-b border-rose-500/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-rose-500 to-pink-600 text-white flex items-center justify-center shadow-lg shadow-rose-500/30">
              <Heart className="w-6 h-6 fill-current animate-pulse" />
            </div>
            <div>
              <h3 className="text-base font-bold text-rose-200">
                {isBn ? 'হার্টবিট ও হ্যাপটিক স্পর্শ' : 'Heartbeat & Haptic Touch'}
              </h3>
              <p className="text-xs text-rose-400/80">
                {isSynchronized
                  ? isBn
                    ? '✨ দুইজন একসাথে স্পর্শ করছেন!'
                    : '✨ Dual Touch Synchronized!'
                  : isBn
                  ? 'স্ক্রিনে আঙুল ধরে হৃদস্পন্দন পাঠান'
                  : 'Hold screen to transmit pulse'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              {soundEnabled ? <Volume2 className="w-4 h-4 text-rose-400" /> : <VolumeX className="w-4 h-4" />}
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Live ECG Telemetry Monitor Bar */}
        <div className="px-6 py-2 bg-slate-900/60 border-b border-slate-800 flex items-center justify-between text-xs font-mono">
          <span className="flex items-center gap-1.5 text-rose-400">
            <Activity className="w-4 h-4 animate-pulse" />
            <span>ECG LEAD II</span>
          </span>
          <span className="font-bold text-rose-300 text-sm">{bpm} BPM</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              isSynchronized
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse'
                : 'bg-rose-500/10 text-rose-300'
            }`}
          >
            {isSynchronized ? 'RESONATING' : 'LIVE'}
          </span>
        </div>

        {/* Interactive Glowing Heart Section */}
        <div className="py-10 px-6 flex flex-col items-center justify-center relative min-h-[280px]">
          {/* Bioluminescent Radiant Halo */}
          <div
            className={`absolute w-60 h-60 rounded-full blur-3xl transition-all duration-300 pointer-events-none ${
              isSynchronized
                ? 'bg-amber-500/30 scale-125'
                : isPressing
                ? 'bg-rose-500/35 scale-110'
                : 'bg-rose-600/15 scale-90'
            }`}
          />

          {/* Central Pulsing Heart Button */}
          <button
            onMouseDown={handleStartPress}
            onMouseUp={handleEndPress}
            onTouchStart={handleStartPress}
            onTouchEnd={handleEndPress}
            className={`relative z-10 w-40 h-40 rounded-full flex items-center justify-center transition-transform select-none cursor-pointer focus:outline-none ${
              isPressing ? 'scale-110' : 'scale-100 hover:scale-105'
            }`}
            style={{
              animation: `heartbeatAnim ${(60 / bpm).toFixed(2)}s ease-in-out infinite`,
            }}
          >
            <div
              className={`w-32 h-32 rounded-full flex items-center justify-center shadow-2xl transition-all ${
                isSynchronized
                  ? 'bg-gradient-to-tr from-amber-500 via-rose-500 to-pink-500 shadow-amber-500/50'
                  : 'bg-gradient-to-tr from-rose-600 via-pink-600 to-rose-400 shadow-rose-600/50'
              }`}
            >
              <Heart
                className={`w-16 h-16 fill-white text-white drop-shadow-md transition-transform ${
                  isPressing ? 'scale-125' : 'scale-100'
                }`}
              />
            </div>
          </button>

          <p className="mt-6 text-xs text-center text-slate-400 max-w-[220px]">
            {isPressing
              ? isBn
                ? 'হৃদস্পন্দন প্রবাহিত হচ্ছে... চেপে ধরে রাখুন'
                : 'Pulse transmitting... keep holding'
              : isBn
              ? 'স্পর্শ করে ধরে রাখুন'
              : 'Press and hold with your finger'}
          </p>
        </div>

        {/* BPM Speed Slider */}
        <div className="px-6 py-3 bg-slate-900/60 border-t border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-300">
            <span>{isBn ? 'গতি নিয়ন্ত্রণ' : 'Pulse Rate'}</span>
            <span className="font-mono text-rose-400 font-bold">{bpm} BPM</span>
          </div>
          <input
            type="range"
            min="50"
            max="150"
            value={bpm}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              setBpm(val);
              if (channel) {
                channel.send({
                  type: 'broadcast',
                  event: `heartbeat_touch_${chatId}`,
                  payload: { type: 'bpm_change', bpm: val, senderId: currentUser.id },
                });
              }
            }}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-rose-500"
          />
        </div>

        {/* Footer Send */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-end">
          <button
            onClick={handleSendHeartbeatToChat}
            className="w-full py-2.5 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white font-bold text-xs shadow-lg shadow-rose-500/25 flex items-center justify-center gap-2 transition-all active:scale-95"
          >
            <Send className="w-4 h-4" />
            <span>{isBn ? 'চ্যাটে হার্টবিট স্টিকার পাঠান' : 'Send Pulse to Chat'}</span>
          </button>
        </div>
      </div>

      <style>{`
        @keyframes heartbeatAnim {
          0%, 100% {
            transform: scale(1);
          }
          15% {
            transform: scale(1.15);
          }
          30% {
            transform: scale(1.05);
          }
          45% {
            transform: scale(1.22);
          }
          60% {
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
};
