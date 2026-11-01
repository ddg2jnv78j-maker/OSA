import React from 'react';
import {
  Palette,
  Sparkles,
  X,
  Check,
  Moon,
  Sun,
  Zap,
  Sliders
} from 'lucide-react';
import { ChatThemeType } from './AnimatedChatWallpaper';

interface ChatThemeSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTheme: ChatThemeType;
  onSelectTheme: (theme: ChatThemeType) => void;
  opacity: number;
  onOpacityChange: (opacity: number) => void;
  speed: 'off' | 'low' | 'normal' | 'fast';
  onSpeedChange: (speed: 'off' | 'low' | 'normal' | 'fast') => void;
  language?: string;
}

interface ThemeCard {
  id: ChatThemeType;
  title: string;
  bnTitle: string;
  desc: string;
  previewClass: string;
  icon: string;
}

const THEMES: ThemeCard[] = [
  {
    id: 'default',
    title: 'Classic WhatsApp',
    bnTitle: 'ক্লাসিক চ্যাট',
    desc: 'Default clean minimalist background',
    previewClass: 'bg-slate-900 border-slate-700',
    icon: '💬',
  },
  {
    id: 'aurora',
    title: 'Midnight Aurora',
    bnTitle: 'মিডনাইট অরোরা',
    desc: 'Bioluminescent northern light ribbons',
    previewClass: 'bg-gradient-to-tr from-emerald-900 via-teal-900 to-indigo-950 border-emerald-500/40',
    icon: '🌌',
  },
  {
    id: 'cyberpunk',
    title: 'Cyberpunk Neon',
    bnTitle: 'সাইবারপাঙ্ক নিয়ন',
    desc: 'Synthwave 3D neon grid and sunset',
    previewClass: 'bg-gradient-to-b from-purple-950 via-slate-950 to-pink-950 border-pink-500/40',
    icon: '⚡',
  },
  {
    id: 'forest',
    title: 'Emerald Forest',
    bnTitle: 'এমেরাল্ড ফরেস্ট',
    desc: 'Drifting glowing fireflies in serene dark canopy',
    previewClass: 'bg-gradient-to-b from-green-950 via-emerald-950 to-slate-950 border-emerald-500/40',
    icon: '🌲',
  },
  {
    id: 'sunset',
    title: 'Rose Sunset',
    bnTitle: 'রোজ সানসেট',
    desc: 'Warm golden hour aura with floating dust motes',
    previewClass: 'bg-gradient-to-b from-rose-950 via-amber-950 to-purple-950 border-rose-500/40',
    icon: '🌅',
  },
  {
    id: 'matrix',
    title: 'Matrix Code Rain',
    bnTitle: 'ম্যাট্রিক্স কোড রেইন',
    desc: 'Digital cascading green glyph rain',
    previewClass: 'bg-black border-emerald-500/60 font-mono text-emerald-400',
    icon: '💻',
  },
  {
    id: 'galaxy',
    title: 'Starry Galaxy',
    bnTitle: 'স্টাররি গ্যালাক্সি',
    desc: 'Twinkling cosmos stars & deep purple nebula',
    previewClass: 'bg-gradient-to-tr from-slate-950 via-indigo-950 to-black border-indigo-500/40',
    icon: '✨',
  },
  {
    id: 'oled',
    title: 'Pure OLED Dark',
    bnTitle: 'পিওর ওলেড ডার্ক',
    desc: 'Absolute battery-saving pitch dark mode',
    previewClass: 'bg-black border-slate-800',
    icon: '🌑',
  },
];

export const ChatThemeSelectorModal: React.FC<ChatThemeSelectorModalProps> = ({
  isOpen,
  onClose,
  currentTheme,
  onSelectTheme,
  opacity,
  onOpacityChange,
  speed,
  onSpeedChange,
  language = 'en',
}) => {
  const isBn = language === 'bn';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col text-white max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-fuchsia-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-fuchsia-500/25">
              <Palette className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-100 flex items-center gap-1.5">
                <span>{isBn ? 'ডায়নামিক চ্যাট থিম ও ওয়ালপেপার' : 'Animated Chat Themes & Wallpaper'}</span>
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              </h3>
              <p className="text-[11px] text-slate-400">
                {isBn ? 'প্রতিটি চ্যাটের জন্য লাইভ অ্যানিমেটেড ব্যাকগ্রাউন্ড নির্বাচন করুন' : 'Individualized live canvas backgrounds'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-red-400 rounded-xl hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Themes Grid */}
        <div className="p-5 overflow-y-auto space-y-5">
          <div className="grid grid-cols-2 gap-3">
            {THEMES.map((th) => {
              const isSelected = currentTheme === th.id;
              return (
                <button
                  key={th.id}
                  type="button"
                  onClick={() => onSelectTheme(th.id)}
                  className={`p-3.5 rounded-2xl border text-left transition-all relative flex flex-col gap-1.5 group overflow-hidden ${th.previewClass} ${
                    isSelected
                      ? 'ring-2 ring-cyan-400 shadow-xl scale-[1.02]'
                      : 'hover:scale-[1.01] hover:border-slate-500'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xl">{th.icon}</span>
                    {isSelected ? (
                      <div className="w-5 h-5 rounded-full bg-cyan-400 text-slate-950 flex items-center justify-center shadow">
                        <Check className="w-3.5 h-3.5 stroke-3" />
                      </div>
                    ) : null}
                  </div>

                  <span className="text-xs font-bold text-white drop-shadow">
                    {isBn ? th.bnTitle : th.title}
                  </span>
                  <span className="text-[10px] text-slate-300 line-clamp-1 opacity-80">
                    {th.desc}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Controls: Opacity & Animation Speed */}
          {currentTheme !== 'default' && (
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{isBn ? 'ব্যাকগ্রাউন্ড উজ্জ্বলতা' : 'Wallpaper Opacity'}</span>
                </span>
                <span className="text-xs font-mono text-cyan-400">{Math.round(opacity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.2"
                max="1.0"
                step="0.05"
                value={opacity}
                onChange={(e) => onOpacityChange(parseFloat(e.target.value))}
                className="w-full accent-cyan-400 cursor-pointer"
              />

              <div className="pt-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">
                  {isBn ? 'অ্যানিমেশন স্পিড' : 'Animation Speed'}
                </span>
                <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-xl border border-slate-800">
                  {(['off', 'low', 'normal', 'fast'] as const).map((sp) => (
                    <button
                      key={sp}
                      type="button"
                      onClick={() => onSpeedChange(sp)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition-all ${
                        speed === sp
                          ? 'bg-cyan-500 text-slate-950 shadow'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {sp}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-950 border-t border-slate-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-md shadow-cyan-500/25 active:scale-95 transition-all"
          >
            {isBn ? 'সম্পন্ন' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
};
