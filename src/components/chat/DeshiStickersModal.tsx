import React, { useState } from 'react';
import {
  Sparkles,
  X,
  Smile,
  Coffee,
  Heart,
  Flame,
  Laugh,
  Send,
  Zap,
} from 'lucide-react';

interface DeshiStickersModalProps {
  isOpen: boolean;
  onClose: () => void;
  language?: string;
  onSendSticker: (stickerText: string, emoji: string) => Promise<void>;
}

export const DeshiStickersModal: React.FC<DeshiStickersModalProps> = ({
  isOpen,
  onClose,
  language = 'en',
  onSendSticker,
}) => {
  const isBn = language === 'bn';
  const [activeCategory, setActiveCategory] = useState<'dialogue' | 'food' | 'emotions' | 'fun'>('dialogue');

  if (!isOpen) return null;

  const STICKER_PACKS = {
    dialogue: [
      { text: 'চা খাবেন? ☕', sub: 'Cha khaben?', emoji: '☕', bg: 'from-amber-500 to-orange-500' },
      { text: 'ধুর ছাই! 🤦', sub: 'Dhur chai!', emoji: '🤦', bg: 'from-rose-500 to-red-600' },
      { text: 'একদম ঠিক! 💯', sub: 'Ekdom thik!', emoji: '💯', bg: 'from-emerald-500 to-teal-600' },
      { text: 'জোশ মামা! 🔥', sub: 'Josh mama!', emoji: '🔥', bg: 'from-orange-500 to-amber-600' },
      { text: 'খেলা হবে! ⚽', sub: 'Khela hobe!', emoji: '⚽', bg: 'from-blue-600 to-indigo-600' },
      { text: 'কংগ্র্যাটস ভাই! 🎉', sub: 'Congrats bhai!', emoji: '🎉', bg: 'from-purple-600 to-pink-600' },
      { text: 'এক কাপ চা হয়ে যাক! 🍵', sub: 'Ek cup cha!', emoji: '🍵', bg: 'from-yellow-600 to-amber-700' },
      { text: 'সব ঠিক আছে? 👍', sub: 'Sob thik ache?', emoji: '👍', bg: 'from-cyan-600 to-blue-600' },
    ],
    food: [
      { text: 'কাচ্চি বিরিয়ানি লোভ! 🍖', sub: 'Kacchi Biryani', emoji: '🍖', bg: 'from-amber-600 to-red-600' },
      { text: 'ফুচকা পার্টি চাই! 🥣', sub: 'Fuchka craving', emoji: '🥣', bg: 'from-orange-500 to-yellow-600' },
      { text: 'মাছের রাজা ইলিশ! 🐟', sub: 'Ilish mach', emoji: '🐟', bg: 'from-cyan-600 to-blue-700' },
      { text: 'গরম গরম জিলাপি! 🥨', sub: 'Jilapi treat', emoji: '🥨', bg: 'from-amber-500 to-orange-600' },
      { text: 'টংয়ের চা ও আড্ডা! ☕', sub: 'Tong er cha', emoji: '☕', bg: 'from-teal-600 to-emerald-700' },
      { text: 'মিষ্টি দই 🍧', sub: 'Mishti Doi', emoji: '🍧', bg: 'from-rose-500 to-pink-600' },
    ],
    emotions: [
      { text: 'অনেক অনেক ভালোবাসা ❤️', sub: 'Lots of love', emoji: '❤️', bg: 'from-rose-500 to-pink-600' },
      { text: 'হাসতে হাসতে শেষ! 🤣', sub: 'LMAO', emoji: '🤣', bg: 'from-amber-400 to-yellow-500' },
      { text: 'চোখের পানি থামে না 😭', sub: 'Emotional tears', emoji: '😭', bg: 'from-blue-500 to-indigo-600' },
      { text: 'মাথা নষ্ট! 🤯', sub: 'Mind blown', emoji: '🤯', bg: 'from-purple-600 to-violet-700' },
      { text: 'মাশাআল্লাহ! 🤲', sub: 'MashaAllah', emoji: '🤲', bg: 'from-emerald-600 to-teal-700' },
      { text: 'স্যালুট বস! 🫡', sub: 'Salute Boss', emoji: '🫡', bg: 'from-slate-700 to-slate-900' },
    ],
    fun: [
      { text: 'রিকশায় ঘুরাঘুরি 🚲', sub: 'Rickshaw ride', emoji: '🚲', bg: 'from-green-600 to-emerald-700' },
      { text: 'বৃষ্টির গান 🌧️', sub: 'Rain vibes', emoji: '🌧️', bg: 'from-blue-600 to-cyan-600' },
      { text: 'আজ ছুটি! 🏖️', sub: 'Day off!', emoji: '🏖️', bg: 'from-amber-500 to-orange-600' },
      { text: 'কোড কাজ করে না! 💻', sub: 'Bug found', emoji: '💻', bg: 'from-violet-600 to-purple-800' },
      { text: 'লুডু খেলবেন? 🎲', sub: 'Ludo match?', emoji: '🎲', bg: 'from-red-500 to-rose-600' },
      { text: 'বিল কে দিবে? 💸', sub: 'Who pays bill?', emoji: '💸', bg: 'from-teal-600 to-cyan-700' },
    ],
  };

  const handleSelect = async (item: { text: string; emoji: string }) => {
    try {
      await onSendSticker(item.text, item.emoji);
      onClose();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-pink-600 via-rose-600 to-amber-500 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-white shadow-inner">
              <Smile className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">
                {isBn ? 'দেশি বাংলা স্টিকার ও রিঅ্যাকশন' : 'Deshi Bangla Stickers & Avatar'}
              </h3>
              <p className="text-xs text-white/80">
                {isBn ? 'জনপ্রিয় বাংলা ডায়লগ ও ট্রেন্ডিং স্টিকার' : 'Authentic Bengali dialogues & stickers'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Categories Bar */}
        <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center gap-1.5 overflow-x-auto">
          {[
            { id: 'dialogue', label: isBn ? 'আড্ডা ও ডায়লগ' : 'Dialogues', icon: Zap },
            { id: 'food', label: isBn ? 'খাবার-দাবার' : 'Foodies', icon: Coffee },
            { id: 'emotions', label: isBn ? 'অনুভূতি' : 'Emotions', icon: Heart },
            { id: 'fun', label: isBn ? 'মজার ভাইবস' : 'Fun Vibes', icon: Laugh },
          ].map((cat) => {
            const Icon = cat.icon;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 transition-all ${
                  activeCategory === cat.id
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-700/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* Sticker Grid */}
        <div className="p-4 overflow-y-auto grid grid-cols-2 gap-2.5 max-h-96">
          {STICKER_PACKS[activeCategory].map((s, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSelect(s)}
              className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 hover:bg-rose-50/60 dark:hover:bg-rose-950/30 border border-slate-200 dark:border-slate-800 hover:border-rose-300 dark:hover:border-rose-700 transition-all text-left flex flex-col justify-between group active:scale-95"
            >
              <div className="text-2xl mb-2 group-hover:scale-110 transition-transform">
                {s.emoji}
              </div>
              <div>
                <p className="text-xs font-extrabold text-slate-800 dark:text-slate-100 group-hover:text-rose-600 dark:group-hover:text-rose-400">
                  {s.text}
                </p>
                <p className="text-[10px] text-slate-400 truncate mt-0.5">
                  {s.sub}
                </p>
              </div>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-200 dark:border-slate-800 text-center">
          <p className="text-[11px] text-slate-400">
            {isBn ? 'যেকোনো স্টিকারে চাপলে চ্যাটে সরাসরি চলে যাবে' : 'Tap any sticker to send directly in chat'}
          </p>
        </div>
      </div>
    </div>
  );
};
