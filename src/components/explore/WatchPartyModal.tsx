import React, { useState } from 'react';
import {
  Film,
  Play,
  Pause,
  Users,
  Send,
  Heart,
  Smile,
  X,
  Sparkles,
  Tv,
} from 'lucide-react';

interface WatchPartyModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserName?: string;
}

const PRESET_VIDEOS = [
  { id: '1', title: 'বাংলাদেশ ক্রিকেট রোমাঞ্চকর শেষ ওভারের জয়', channel: 'টি-টোয়েন্টি হাইলাইটস', views: '১.২ মিলিয়ন' },
  { id: '2', title: 'বাংলা কমেডি নাটক - ব্যাচেলর আড্ডা', channel: 'নাটক ড্রামা ক্লাব', views: '৮৫০ হাজার' },
  { id: '3', title: 'বৃষ্টির দিনে রিল্যাক্সিং বাংলা ও লফি মেলোডি', channel: 'OSA মিউজিক স্টেশন', views: '২.৫ মিলিয়ন' },
];

export const WatchPartyModal: React.FC<WatchPartyModalProps> = ({
  isOpen,
  onClose,
  currentUserName = 'User',
}) => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState(PRESET_VIDEOS[0]);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<{ id: string; user: string; text: string }[]>([
    { id: '1', user: 'সাকিব', text: 'কী দারুণ ম্যাচ ভাই!' },
    { id: '2', user: 'সাদিয়া', text: 'শেষের ছক্কাটা অসাধারণ ছিল 🔥' },
  ]);
  const [flyingEmojis, setFlyingEmojis] = useState<{ id: number; char: string }[]>([]);

  if (!isOpen) return null;

  const triggerEmoji = (char: string) => {
    const newId = Date.now();
    setFlyingEmojis((prev) => [...prev, { id: newId, char }]);
    setTimeout(() => {
      setFlyingEmojis((prev) => prev.filter((e) => e.id !== newId));
    }, 1500);
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    setMessages([...messages, { id: 'm_' + Date.now(), user: currentUserName, text: chatInput.trim() }]);
    setChatInput('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-purple-500/10 via-pink-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-purple-600 to-pink-600 text-white flex items-center justify-center shadow-lg shadow-purple-500/25">
              <Film className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                OSA ওয়াচ পার্টি ও রেডিও রুম
                <span className="px-2 py-0.5 text-[10px] font-bold bg-purple-100 dark:bg-purple-950/80 text-purple-600 dark:text-purple-400 rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" /> ৩ জন লাইভ
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                বন্ধুরা মিলে একসাথে নাটক, খেলা ও সিনেমা দেখার ভার্চুয়াল রুম
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Video Canvas Simulation */}
        <div className="relative aspect-video bg-slate-950 flex flex-col items-center justify-center text-white p-4 overflow-hidden">
          {/* Flying emojis */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {flyingEmojis.map((e) => (
              <span
                key={e.id}
                className="absolute text-3xl animate-bounce"
                style={{
                  left: `${20 + Math.random() * 60}%`,
                  bottom: '20px',
                  transition: 'transform 1s ease-out, opacity 1s',
                }}
              >
                {e.char}
              </span>
            ))}
          </div>

          <div className="flex flex-col items-center z-10">
            <Tv className="w-12 h-12 text-purple-400 mb-2 animate-pulse" />
            <p className="text-sm font-bold text-center max-w-sm">{selectedVideo.title}</p>
            <p className="text-xs text-purple-300 mt-1">{selectedVideo.channel} • {selectedVideo.views}</p>
          </div>

          {/* Controls overlay */}
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-2xl">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-white" />}
            </button>
            <span className="text-xs font-mono text-purple-200">
              {isPlaying ? '● লাইভ স্ট্রিমিং হচ্ছে' : 'বিরতি'}
            </span>
            <div className="flex gap-1.5">
              {['🔥', '❤️', '👏', '😂'].map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => triggerEmoji(emoji)}
                  className="hover:scale-125 transition text-base"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Room Chat & Presets */}
        <div className="p-4 flex-1 min-h-0 flex flex-col space-y-3">
          {/* Preset list */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {PRESET_VIDEOS.map((v) => (
              <button
                key={v.id}
                onClick={() => setSelectedVideo(v)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                  selectedVideo.id === v.id
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                {v.title.slice(0, 20)}...
              </button>
            ))}
          </div>

          {/* Mini Room Chat */}
          <div className="flex-1 min-h-[100px] overflow-y-auto space-y-1.5 bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-2xl border border-slate-200 dark:border-slate-700">
            {messages.map((m) => (
              <p key={m.id} className="text-xs">
                <span className="font-bold text-purple-600 dark:text-purple-400 mr-1.5">
                  {m.user}:
                </span>
                <span className="text-slate-700 dark:text-slate-200">{m.text}</span>
              </p>
            ))}
          </div>

          {/* Chat input */}
          <form onSubmit={handleSendChat} className="flex gap-2">
            <input
              type="text"
              placeholder="রুমের বন্ধুদের কিছু বলুন..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              className="flex-1 px-3 py-2 text-xs rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-purple-500"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-sm"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
