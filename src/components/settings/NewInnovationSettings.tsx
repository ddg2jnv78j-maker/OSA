import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Eye,
  EyeOff,
  Lock,
  Smartphone,
  Cpu,
  Sparkles,
  Zap,
  Wifi,
  CloudRain,
  Waves,
  Coffee,
  Trees,
  Volume2,
  VolumeX,
  Languages,
  Activity,
  Sliders,
  Check,
  Radio,
  FileCheck,
  Play,
  Pause,
  AlertTriangle,
} from 'lucide-react';
import { Profile } from '../../types/osa';

export type InnovationSettingsSubPage =
  | 'stealth_shield'
  | 'ai_studio'
  | 'data_turbo'
  | 'haptics_sound';

interface NewInnovationSettingsProps {
  subPage: InnovationSettingsSubPage;
  currentUser: Profile;
  language: string;
  onBack: () => void;
  renderSubHeader: (title: string) => React.ReactNode;
}

export const NewInnovationSettings: React.FC<NewInnovationSettingsProps> = ({
  subPage,
  currentUser,
  language,
  onBack,
  renderSubHeader,
}) => {
  const isBn = language === 'bn';

  // 1. Stealth Shield Settings State
  const [appDisguise, setAppDisguise] = useState<string>(() => {
    return localStorage.getItem('osa_stealth_disguise') || 'default';
  });
  const [decoyPin, setDecoyPin] = useState<string>(() => {
    return localStorage.getItem('osa_decoy_pin') || '9999';
  });
  const [antiScreenshot, setAntiScreenshot] = useState<boolean>(() => {
    return localStorage.getItem('osa_anti_screenshot') === 'true';
  });
  const [faceDownFreeze, setFaceDownFreeze] = useState<boolean>(() => {
    return localStorage.getItem('osa_facedown_freeze') === 'true';
  });
  const [stealthSosActive, setStealthSosActive] = useState<boolean>(() => {
    return localStorage.getItem('osa_stealth_sos_enabled') !== 'false';
  });

  // 2. AI Intelligence Studio Settings State
  const [aiTone, setAiTone] = useState<string>(() => {
    return localStorage.getItem('osa_ai_tone') || 'friendly_bn';
  });
  const [autoDialectTranslate, setAutoDialectTranslate] = useState<boolean>(() => {
    return localStorage.getItem('osa_auto_dialect') !== 'false';
  });
  const [voiceAutoTranscribe, setVoiceAutoTranscribe] = useState<boolean>(() => {
    return localStorage.getItem('osa_auto_transcribe') === 'true';
  });
  const [shoppingDealRadar, setShoppingDealRadar] = useState<boolean>(() => {
    return localStorage.getItem('osa_deal_radar') !== 'false';
  });

  // 3. Turbo P2P & Data Saver Settings State
  const [ultraDataSaver, setUltraDataSaver] = useState<boolean>(() => {
    return localStorage.getItem('osa_ultra_data_saver') === 'true';
  });
  const [localWifiMesh, setLocalWifiMesh] = useState<boolean>(() => {
    return localStorage.getItem('osa_wifi_mesh') !== 'false';
  });
  const [lowBandwidthVoip, setLowBandwidthVoip] = useState<boolean>(() => {
    return localStorage.getItem('osa_low_bandwidth_voip') !== 'false';
  });
  const [autoDownloadPhotos, setAutoDownloadPhotos] = useState<string>(() => {
    return localStorage.getItem('osa_auto_download_photos') || 'wifi_cellular';
  });

  // 4. Haptics & Sensory Soundscapes State
  const [hapticIntensity, setHapticIntensity] = useState<string>(() => {
    return localStorage.getItem('osa_haptic_intensity') || 'crisp';
  });
  const [soundPack, setSoundPack] = useState<string>(() => {
    return localStorage.getItem('osa_sound_pack') || 'glass';
  });
  const [activeSoundscape, setActiveSoundscape] = useState<string | null>(null);
  const [ambientVolume, setAmbientVolume] = useState<number>(0.6);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const soundscapeGainRef = useRef<GainNode | null>(null);
  const soundscapeTimerRef = useRef<number | null>(null);

  // Persistence helpers
  const updateSetting = (key: string, val: any) => {
    localStorage.setItem(key, typeof val === 'boolean' ? String(val) : val);
  };

  // Haptic feedback trigger test
  const testHaptic = (type: string) => {
    if (!('vibrate' in navigator)) return;
    if (type === 'crisp') navigator.vibrate(30);
    else if (type === 'heavy') navigator.vibrate(80);
    else if (type === 'heartbeat') navigator.vibrate([60, 40, 100]);
    else if (type === 'soft') navigator.vibrate(15);
  };

  // Web Audio Synthesizer for Ambient Soundscapes
  const toggleSoundscape = (type: string) => {
    if (activeSoundscape === type) {
      stopSoundscape();
      setActiveSoundscape(null);
      return;
    }

    stopSoundscape();
    setActiveSoundscape(type);

    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      // Ambient pink noise generator for rain / waves
      const bufferSize = ctx.sampleRate * 2;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      let b0 = 0,
        b1 = 0,
        b2 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.969 * b2 + white * 0.153852;
        output[i] = b0 + b1 + b2 + white * 0.5362;
        output[i] *= 0.11;
      }

      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;
      whiteNoise.loop = true;

      const filter = ctx.createBiquadFilter();
      if (type === 'rain') {
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, ctx.currentTime);
      } else if (type === 'waves') {
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(450, ctx.currentTime);
      } else if (type === 'cafe') {
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1200, ctx.currentTime);
      } else {
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(600, ctx.currentTime);
      }

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(ambientVolume * 0.4, ctx.currentTime);
      soundscapeGainRef.current = gain;

      whiteNoise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      whiteNoise.start();
    } catch {}
  };

  const stopSoundscape = () => {
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      stopSoundscape();
    };
  }, []);

  // ==========================================
  // SUBPAGE 1: STEALTH SHIELD & SECURITY
  // ==========================================
  if (subPage === 'stealth_shield') {
    return (
      <div className="space-y-5 animate-in fade-in duration-200">
        {renderSubHeader(isBn ? 'স্টিলথ শিল্ড ও ছদ্মবেশী নিরাপত্তা' : 'Stealth Shield & Anti-Snoop Vault')}

        <div className="rounded-3xl bg-gradient-to-r from-red-950/40 via-slate-900 to-rose-950/40 border border-red-500/30 p-5 space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-red-600/20 text-red-400 flex items-center justify-center">
              <ShieldAlert className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">
                {isBn ? 'ব্যক্তিগত নিরাপত্তা ও নজরদারি প্রতিরোধ' : 'Anti-Snooping & Duress Protection'}
              </h4>
              <p className="text-xs text-red-300/80">
                {isBn
                  ? 'অন্যের সামনে চ্যাট গোপন রাখতে ও জরুরি সুরক্ষায় বিশেষ টুলস'
                  : 'Camouflage your app, set decoy codes, and deter surveillance'}
              </p>
            </div>
          </div>
        </div>

        {/* Setting Card: App Disguise */}
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-4">
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
              {isBn ? 'অ্যাপ ছদ্মবেশ মোড (App Disguise)' : 'App Switcher Disguise'}
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isBn
                ? 'টাস্কবার বা রিসেন্ট অ্যাপস তালিকায় ওএসএ কোন রূপে প্রদর্শিত হবে'
                : 'How OSA presents itself in task switchers and notifications'}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {[
              { id: 'default', label: 'Default OSA', icon: '💬' },
              { id: 'calc', label: 'Calculator Pro', icon: '🔢' },
              { id: 'notes', label: 'Quick Notes', icon: '📝' },
              { id: 'weather', label: 'Daily Weather', icon: '⛅' },
            ].map((d) => (
              <button
                key={d.id}
                onClick={() => {
                  setAppDisguise(d.id);
                  updateSetting('osa_stealth_disguise', d.id);
                }}
                className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all ${
                  appDisguise === d.id
                    ? 'border-red-500 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-300 font-bold'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300'
                }`}
              >
                <span className="text-2xl">{d.icon}</span>
                <span className="mt-2 text-[11px]">{d.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Setting Card: Decoy Emergency PIN */}
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                {isBn ? 'ডিকয় জরুরি পিন (Decoy Fake PIN)' : 'Decoy Emergency PIN'}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isBn
                  ? 'চাপের মুখে এই পিন দিলে সম্পূর্ণ খালি একটি নিরীহ ডেমো অ্যাকাউন্ট খুলবে'
                  : 'Entering this PIN unlocks a completely innocent empty decoy workspace'}
              </p>
            </div>
            <Lock className="w-5 h-5 text-red-500" />
          </div>

          <div className="flex items-center gap-3">
            <input
              type="text"
              maxLength={4}
              value={decoyPin}
              onChange={(e) => {
                setDecoyPin(e.target.value);
                updateSetting('osa_decoy_pin', e.target.value);
              }}
              className="w-32 px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono text-center font-bold tracking-widest text-sm text-slate-900 dark:text-white"
            />
            <span className="text-xs text-slate-400">
              {isBn ? 'ডিফল্ট: ৯৯৯৯ (যে কোনো ৪ সংখ্যার পিন)' : 'Default: 9999 (4-digit code)'}
            </span>
          </div>
        </div>

        {/* Setting Toggles */}
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-4">
          {/* Anti-screenshot Watermark */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5 pr-4">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                {isBn ? 'স্ক্রিনশট নিরুৎসাহিত ওয়াটারমার্ক' : 'Dynamic Chat Screen Watermark'}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isBn
                  ? 'চ্যাট ব্যাকগ্রাউন্ডে সূক্ষ্ম টাইমস্ট্যাম্প ও ইউজার আইডি দেখিয়ে স্ক্রিনশট ফাঁস রোধ করে'
                  : 'Overlays translucent user ID & live timestamp across chat backgrounds'}
              </p>
            </div>
            <input
              type="checkbox"
              checked={antiScreenshot}
              onChange={(e) => {
                setAntiScreenshot(e.target.checked);
                updateSetting('osa_anti_screenshot', e.target.checked);
              }}
              className="w-5 h-5 accent-red-600 rounded cursor-pointer"
            />
          </div>

          {/* Face-down Quick Freeze */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="space-y-0.5 pr-4">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                {isBn ? 'ফেস-ডাউন অটো লক (Face-Down Freeze)' : 'Face-Down Flip Stealth Lock'}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isBn
                  ? 'ফোন টেবিলে উল্টো করে রাখলেই তাৎক্ষণিক চ্যাট হাইড বা কল মিউট হবে'
                  : 'Flipping phone screen-down immediately minimizes active chats and mutes rings'}
              </p>
            </div>
            <input
              type="checkbox"
              checked={faceDownFreeze}
              onChange={(e) => {
                setFaceDownFreeze(e.target.checked);
                updateSetting('osa_facedown_freeze', e.target.checked);
              }}
              className="w-5 h-5 accent-red-600 rounded cursor-pointer"
            />
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // SUBPAGE 2: AI STUDIO & DIALECT INTELLIGENCE
  // ==========================================
  if (subPage === 'ai_studio') {
    return (
      <div className="space-y-5 animate-in fade-in duration-200">
        {renderSubHeader(isBn ? 'এআই বুদ্ধিমত্তা ও আঞ্চলিক অনুবাদ' : 'AI Studio & Dialect Engine')}

        <div className="rounded-3xl bg-gradient-to-r from-emerald-950/40 via-slate-900 to-teal-950/40 border border-emerald-500/30 p-5 space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center">
              <Sparkles className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">
                {isBn ? 'স্মার্ট এআই ড্রাফটিং ও উপভাষা কন্ট্রোল' : 'Autonomous AI Reply & Dialects'}
              </h4>
              <p className="text-xs text-emerald-300/80">
                {isBn
                  ? 'চ্যাট সাজেশন পার্সোনা ও আঞ্চলিক ভাষা ডিটেকশন সমন্বয় করুন'
                  : 'Configure personality tones and regional language automation'}
              </p>
            </div>
          </div>
        </div>

        {/* AI Reply Persona Tone */}
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-4">
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
              {isBn ? 'স্মার্ট রিপ্লাইয়ের বাচনভঙ্গি (AI Reply Persona)' : 'Smart Reply Tone Personality'}
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isBn
                ? 'ড্রাফট সাজেশনের সময় এআই কোন স্টাইলে কথা বলবে'
                : 'Select the primary voice style for autonomous draft suggestions'}
            </p>
          </div>

          <div className="space-y-2 text-xs">
            {[
              { id: 'friendly_bn', label: 'আন্তরিক ও বন্ধুবৎসল (Warm & Friendly Bengali)', desc: 'সহজ, মিষ্টি ও প্রাত্যহিক বাংলা ভাষা' },
              { id: 'formal_en', label: 'Corporate Executive (Formal English)', desc: 'Polished, professional, and business-ready' },
              { id: 'witty', label: 'রসাত্মক ও প্লেফুল (Witty & Humorous)', desc: 'মজার কথা, ইমোজি ও হালকা মেজাজ' },
              { id: 'concise', label: 'সংক্ষিপ্ত বুলেট পয়েন্ট (Concise Bullets)', desc: 'টু-দ্য-পয়েন্ট ও সময় সাশ্রয়ী' },
            ].map((tone) => (
              <button
                key={tone.id}
                onClick={() => {
                  setAiTone(tone.id);
                  updateSetting('osa_ai_tone', tone.id);
                }}
                className={`w-full p-3.5 rounded-2xl border text-left flex items-center justify-between transition-all ${
                  aiTone === tone.id
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 font-bold'
                    : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                }`}
              >
                <div>
                  <p className="text-xs font-bold">{tone.label}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">{tone.desc}</p>
                </div>
                {aiTone === tone.id && <Check className="w-4 h-4 text-emerald-500 shrink-0" />}
              </button>
            ))}
          </div>
        </div>

        {/* Dialect Automation & Speech */}
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5 pr-4">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                {isBn ? 'আঞ্চলিক উপভাষা স্বয়ংক্রিয় সনাক্তকরণ' : 'Auto-Detect Regional Dialects'}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isBn
                  ? 'নোয়াখালী, চট্টগ্রাম, সিলেট, বরিশাল বা পুরান ঢাকার মেসেজে তাৎক্ষণিক অনুবাদের অপশন দেখাবে'
                  : 'Automatically flags regional slang & shows one-tap translation chip in chat'}
              </p>
            </div>
            <input
              type="checkbox"
              checked={autoDialectTranslate}
              onChange={(e) => {
                setAutoDialectTranslate(e.target.checked);
                updateSetting('osa_auto_dialect', e.target.checked);
              }}
              className="w-5 h-5 accent-emerald-600 rounded cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="space-y-0.5 pr-4">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                {isBn ? 'ভয়েস মেসেজ অটো-ট্রান্সক্রিপ্ট' : 'Voice Message Auto-Transcription'}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isBn
                  ? 'আসা ভয়েস মেসেজের নিচে স্বয়ংক্রিয় বাংলা/ইংরেজি লিখিত রূপ প্রস্তুত রাখা'
                  : 'Pre-transcribes incoming voice memos into readable text'}
              </p>
            </div>
            <input
              type="checkbox"
              checked={voiceAutoTranscribe}
              onChange={(e) => {
                setVoiceAutoTranscribe(e.target.checked);
                updateSetting('osa_auto_transcribe', e.target.checked);
              }}
              className="w-5 h-5 accent-emerald-600 rounded cursor-pointer"
            />
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // SUBPAGE 3: DATA TURBO & P2P MESH
  // ==========================================
  if (subPage === 'data_turbo') {
    return (
      <div className="space-y-5 animate-in fade-in duration-200">
        {renderSubHeader(isBn ? 'টার্বো পি২পি ও ডাটা সাশ্রয়' : 'Turbo P2P & Data Saver Engine')}

        <div className="rounded-3xl bg-gradient-to-r from-blue-950/40 via-slate-900 to-cyan-950/40 border border-blue-500/30 p-5 space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600/20 text-blue-400 flex items-center justify-center">
              <Zap className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">
                {isBn ? 'হাই-স্পিড শেয়ারিং ও কম ডাটা খরচ' : 'Bandwidth Optimization & Local Transfer'}
              </h4>
              <p className="text-xs text-blue-300/80">
                {isBn
                  ? 'দুর্বল নেটওয়ার্কে দ্রুত সংযোগ এবং লোকাল ওয়াইফাইতে অফলাইন ট্রান্সফার'
                  : 'Save mobile bandwidth and beam large files over local Wi-Fi'}
              </p>
            </div>
          </div>
        </div>

        {/* Toggles */}
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-4">
          {/* Ultra Data Saver */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5 pr-4">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                {isBn ? 'আল্ট্রা ডাটা সেভার মোড (৭৫% সাশ্রয়)' : 'Ultra Data Saver Mode (75% Saving)'}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isBn
                  ? '২জি/৩জি বা মোবাইল ডাটাতে ফটো ও অডিও সর্বোচ্চ কম্প্রেশনে পাঠায়'
                  : 'Compresses outgoing media with WebP / Opus to conserve mobile data packages'}
              </p>
            </div>
            <input
              type="checkbox"
              checked={ultraDataSaver}
              onChange={(e) => {
                setUltraDataSaver(e.target.checked);
                updateSetting('osa_ultra_data_saver', e.target.checked);
              }}
              className="w-5 h-5 accent-blue-600 rounded cursor-pointer"
            />
          </div>

          {/* Local Wi-Fi Mesh */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="space-y-0.5 pr-4">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                {isBn ? 'লোকাল ওয়াইফাই মেশ শেয়ারিং (P2P Mesh)' : 'Local Wi-Fi P2P Mesh Sharing'}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isBn
                  ? 'একই ওয়াইফাই বা হটস্পটে থাকা বন্ধুদের কোনো ইন্টারনেট ডাটা ছাড়াই ফাইল পাঠায়'
                  : 'Transfer multi-gigabyte files directly between devices on the same Wi-Fi'}
              </p>
            </div>
            <input
              type="checkbox"
              checked={localWifiMesh}
              onChange={(e) => {
                setLocalWifiMesh(e.target.checked);
                updateSetting('osa_wifi_mesh', e.target.checked);
              }}
              className="w-5 h-5 accent-blue-600 rounded cursor-pointer"
            />
          </div>

          {/* Low Bandwidth VoIP */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="space-y-0.5 pr-4">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                {isBn ? 'লো-ব্যান্ডউইথ ভয়েস কলিং (Low Bitrate Call)' : 'Adaptive Low-Bitrate Voice Calling'}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isBn
                  ? 'গ্রামাঞ্চল বা পাহাড়ি এলাকায় দুর্বল নেটওয়ার্কেও কল ড্রপ হওয়া রোধ করে'
                  : 'Adapts WebRTC audio codecs down to 8kbps so calls never drop on weak signals'}
              </p>
            </div>
            <input
              type="checkbox"
              checked={lowBandwidthVoip}
              onChange={(e) => {
                setLowBandwidthVoip(e.target.checked);
                updateSetting('osa_low_bandwidth_voip', e.target.checked);
              }}
              className="w-5 h-5 accent-blue-600 rounded cursor-pointer"
            />
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // SUBPAGE 4: HAPTICS & AMBIENT SOUNDSCAPES
  // ==========================================
  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {renderSubHeader(isBn ? 'হ্যাপটিক ভাইব্রেশন ও অ্যাম্বিয়েন্ট ল্যাব' : 'Haptics & Sensory Soundscapes')}

      <div className="rounded-3xl bg-gradient-to-r from-purple-950/40 via-slate-900 to-indigo-950/40 border border-purple-500/30 p-5 space-y-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-purple-600/20 text-purple-400 flex items-center justify-center">
            <Activity className="w-6 h-6 stroke-[2.5]" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">
              {isBn ? 'স্পর্শীয় অনুভূতি ও প্রশান্তিময় ব্যাকগ্রাউন্ড' : 'Physical Touch & Relaxing Acoustics'}
            </h4>
            <p className="text-xs text-purple-300/80">
              {isBn
                ? 'টাইপিং ও নোটিফিকেশনে ভাইব্রেশন এবং রাতে চ্যাটের সময় রিল্যাক্সিং সাউন্ড'
                : 'Fine-tune tactile feedback intensity and late-night focus soundscapes'}
            </p>
          </div>
        </div>
      </div>

      {/* Haptic Vibration Intensity */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-4">
        <div>
          <h4 className="text-sm font-bold text-slate-900 dark:text-white">
            {isBn ? 'হ্যাপটিক ভাইব্রেশনের তীব্রতা (Haptic Feedback)' : 'Haptic Vibration Intensity'}
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isBn
              ? 'বাটনে ট্যাপ ও নোটিফিকেশনে ডিভাইসের ভাইব্রেশন রেসপন্স'
              : 'Physical motor vibration feedback when touching buttons and receiving events'}
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          {[
            { id: 'crisp', label: 'Crisp & Clicky' },
            { id: 'heavy', label: 'Deep Rumble' },
            { id: 'heartbeat', label: 'Heartbeat Pulse' },
            { id: 'soft', label: 'Feather Soft' },
          ].map((h) => (
            <button
              key={h.id}
              onClick={() => {
                setHapticIntensity(h.id);
                updateSetting('osa_haptic_intensity', h.id);
                testHaptic(h.id);
              }}
              className={`p-3 rounded-2xl border text-center transition-all ${
                hapticIntensity === h.id
                  ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-300 font-bold'
                  : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300'
              }`}
            >
              <p className="font-bold text-xs">{h.label}</p>
              <span className="text-[10px] text-purple-400 block mt-1">Tap to test 📳</span>
            </button>
          ))}
        </div>
      </div>

      {/* Late-Night Ambient Soundscapes Player */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
              {isBn ? 'লেট-নাইট অ্যাম্বিয়েন্ট সাউন্ডস্কেপ (Focus Ambience)' : 'Late-Night Focus Soundscapes'}
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isBn
                ? 'গভীর রাতে চ্যাট বা পড়ার সময় পেছনে শান্ত পরিবেশের শব্দ বাজবে'
                : 'Plays calming acoustic backgrounds via Web Audio API during quiet sessions'}
            </p>
          </div>
          {activeSoundscape && (
            <button
              onClick={stopSoundscape}
              className="text-xs font-bold text-rose-500 hover:underline flex items-center gap-1"
            >
              <VolumeX className="w-3.5 h-3.5" />
              <span>Stop</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          {[
            { id: 'rain', label: isBn ? 'বর্ষার বৃষ্টি' : 'Monsoon Rain', icon: CloudRain },
            { id: 'waves', label: isBn ? 'সাগরের ঢেউ' : 'Ocean Waves', icon: Waves },
            { id: 'cafe', label: isBn ? 'শান্ত ক্যাফে' : 'Cozy Cafe', icon: Coffee },
            { id: 'forest', label: isBn ? 'বনভূমির বাতাস' : 'Forest Breeze', icon: Trees },
          ].map((snd) => {
            const Icon = snd.icon;
            const isPlaying = activeSoundscape === snd.id;
            return (
              <button
                key={snd.id}
                onClick={() => toggleSoundscape(snd.id)}
                className={`p-3 rounded-2xl border text-center flex flex-col items-center justify-center gap-2 transition-all ${
                  isPlaying
                    ? 'border-purple-500 bg-purple-500 text-white font-bold shadow-lg shadow-purple-500/25 scale-[1.02]'
                    : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                }`}
              >
                <Icon className={`w-6 h-6 ${isPlaying ? 'animate-bounce' : 'text-purple-400'}`} />
                <span className="text-xs">{snd.label}</span>
                <span className="text-[10px] opacity-80">{isPlaying ? 'Playing 🔊' : 'Play ▶'}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
