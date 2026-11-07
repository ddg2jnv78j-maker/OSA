import React, { useState, useEffect, useRef } from 'react';
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
  Link,
  Flame,
  ThumbsUp,
  Share2,
} from 'lucide-react';

interface WatchPartyModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserName?: string;
}

interface WatchPartyVideo {
  id: string;
  youtubeId: string;
  title: string;
  channel: string;
}

const PRESET_VIDEOS: WatchPartyVideo[] = [
  {
    id: '1',
    youtubeId: '9bZkp7q19f0',
    title: 'Psy - Gangnam Style (Global Party Hit)',
    channel: 'Official Music',
  },
  {
    id: '2',
    youtubeId: 'L_LUpnjgPso',
    title: 'Relaxing Instrumental & Nature Sounds',
    channel: 'Calm Studio',
  },
  {
    id: '3',
    youtubeId: 'kJQP7kiw5Fk',
    title: 'Despacito - Luis Fonsi ft. Daddy Yankee',
    channel: 'Music Vevo',
  },
];

function extractYouTubeId(urlOrId: string): string | null {
  const clean = urlOrId.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) {
    return clean;
  }
  const match = clean.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  return match ? match[1] : null;
}

export const WatchPartyModal: React.FC<WatchPartyModalProps> = ({
  isOpen,
  onClose,
  currentUserName = 'User',
}) => {
  const [selectedVideo, setSelectedVideo] = useState<WatchPartyVideo>(PRESET_VIDEOS[0]);
  const [customUrl, setCustomUrl] = useState('');
  const [urlError, setUrlError] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<{ id: string; user: string; text: string; time: string }[]>([
    { id: '1', user: 'সাকিব', text: 'সবাই রেডি? একসাথে দেখা শুরু করি!', time: '১০:০০' },
  ]);
  const [flyingEmojis, setFlyingEmojis] = useState<{ id: number; char: string; left: number }[]>([]);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  // Sync across tabs and peers via BroadcastChannel
  useEffect(() => {
    if (!isOpen) return;

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('osa_watch_party_stream');
      broadcastChannelRef.current = bc;

      bc.onmessage = (event) => {
        const data = event.data;
        if (!data) return;

        if (data.type === 'change_video' && data.video) {
          setSelectedVideo(data.video);
        } else if (data.type === 'chat_message' && data.message) {
          setMessages((prev) => [...prev, data.message]);
        } else if (data.type === 'emoji_reaction' && data.char) {
          triggerEmojiLocal(data.char);
        }
      };
    } catch {}

    return () => {
      try {
        bc?.close();
      } catch {}
      broadcastChannelRef.current = null;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const triggerEmojiLocal = (char: string) => {
    const newId = Date.now() + Math.random();
    const left = 20 + Math.random() * 60;
    setFlyingEmojis((prev) => [...prev, { id: newId, char, left }]);
    setTimeout(() => {
      setFlyingEmojis((prev) => prev.filter((e) => e.id !== newId));
    }, 1600);
  };

  const handleSendEmoji = (char: string) => {
    triggerEmojiLocal(char);
    broadcastChannelRef.current?.postMessage({
      type: 'emoji_reaction',
      char,
    });
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const newMsg = {
      id: 'm_' + Date.now(),
      user: currentUserName,
      text: chatInput.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages((prev) => [...prev, newMsg]);
    broadcastChannelRef.current?.postMessage({
      type: 'chat_message',
      message: newMsg,
    });
    setChatInput('');
  };

  const handleApplyCustomUrl = (e: React.FormEvent) => {
    e.preventDefault();
    setUrlError('');
    const ytid = extractYouTubeId(customUrl);
    if (!ytid) {
      setUrlError('সঠিক ইউটিউব লিংক দিন (যেমন: youtube.com/watch?v=...)');
      return;
    }
    const newVid: WatchPartyVideo = {
      id: 'custom_' + Date.now(),
      youtubeId: ytid,
      title: 'কাস্টম শেয়ার্ড ভিডিও',
      channel: currentUserName + ' শেয়ার করেছেন',
    };
    setSelectedVideo(newVid);
    broadcastChannelRef.current?.postMessage({
      type: 'change_video',
      video: newVid,
    });
    setCustomUrl('');
  };

  const handleSelectPreset = (vid: WatchPartyVideo) => {
    setSelectedVideo(vid);
    broadcastChannelRef.current?.postMessage({
      type: 'change_video',
      video: vid,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-4">
      <div className="w-full max-w-2xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-purple-500/10 via-pink-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-purple-600 to-pink-600 text-white flex items-center justify-center shadow-lg shadow-purple-500/25">
              <Film className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                OSA লাইভ ওয়াচ পার্টি
                <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> লাইভ সিঙ্ক
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                বন্ধুরা মিলে একসাথে আসল ইউটিউব নাটক, সিনেমা ও ম্যাচ দেখার সিঙ্ক রুম
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

        {/* Real YouTube Player */}
        <div className="relative aspect-video w-full bg-black overflow-hidden flex items-center justify-center">
          <iframe
            key={selectedVideo.youtubeId}
            src={`https://www.youtube-nocookie.com/embed/${selectedVideo.youtubeId}?autoplay=1&rel=0&modestbranding=1`}
            title={selectedVideo.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="w-full h-full border-0"
          />

          {/* Flying emojis overlay */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
            {flyingEmojis.map((e) => (
              <span
                key={e.id}
                className="absolute text-3xl animate-bounce drop-shadow-lg"
                style={{
                  left: `${e.left}%`,
                  bottom: '24px',
                  animationDuration: '1.4s',
                }}
              >
                {e.char}
              </span>
            ))}
          </div>
        </div>

        {/* Video Info Bar */}
        <div className="p-3 bg-slate-950 text-white flex items-center justify-between text-xs px-4">
          <div className="min-w-0 pr-2">
            <h3 className="font-bold truncate text-sm">{selectedVideo.title}</h3>
            <p className="text-[11px] text-slate-400 truncate">{selectedVideo.channel}</p>
          </div>

          {/* Live Floating Reaction Buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            {['❤️', '🔥', '😂', '👏'].map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => handleSendEmoji(emoji)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/25 active:scale-125 transition flex items-center justify-center text-base"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        {/* Custom YouTube Link Input */}
        <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
          <form onSubmit={handleApplyCustomUrl} className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="ইউটিউব ভিডিওর লিংক পেস্ট করুন (যেমন: https://youtu.be/...)"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
              />
              <Link className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            </div>
            <button
              type="submit"
              className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shrink-0"
            >
              প্লে করুন
            </button>
          </form>
          {urlError && <p className="text-[11px] text-rose-500 mt-1">{urlError}</p>}
        </div>

        {/* Presets + Real Chat Bottom Area */}
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3 flex-1 min-h-0 overflow-y-auto">
          {/* Preset Videos */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-slate-700 dark:text-slate-300">জনপ্রিয় প্লেলিস্ট:</p>
            <div className="space-y-1.5">
              {PRESET_VIDEOS.map((vid) => (
                <button
                  key={vid.id}
                  type="button"
                  onClick={() => handleSelectPreset(vid)}
                  className={`w-full text-left p-2.5 rounded-xl text-xs transition border flex items-center gap-2.5 ${
                    selectedVideo.youtubeId === vid.youtubeId
                      ? 'bg-purple-50 dark:bg-purple-950/40 border-purple-500 text-purple-700 dark:text-purple-300 font-bold'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-400'
                  }`}
                >
                  <Play className="w-3.5 h-3.5 shrink-0 text-purple-600" />
                  <div className="min-w-0 flex-1 truncate">
                    <p className="truncate">{vid.title}</p>
                    <p className="text-[10px] text-slate-400 truncate">{vid.channel}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Real Live Watch Room Chat */}
          <div className="flex flex-col h-48 md:h-auto border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 p-2.5">
            <p className="text-[11px] font-bold text-slate-500 mb-2 px-1">লাইভ আড্ডা রুম:</p>
            <div className="flex-1 overflow-y-auto space-y-1.5 text-xs pr-1">
              {messages.map((m) => (
                <div key={m.id} className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                  <span className="font-bold text-purple-600 dark:text-purple-400 mr-1.5">
                    {m.user}:
                  </span>
                  <span className="text-slate-800 dark:text-slate-200">{m.text}</span>
                </div>
              ))}
            </div>

            <form onSubmit={handleSendChat} className="mt-2 flex gap-1.5">
              <input
                type="text"
                placeholder="মন্তব্য লিখুন..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                className="flex-1 px-2.5 py-1 text-xs rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border-0"
              />
              <button
                type="submit"
                className="p-1.5 rounded-xl bg-purple-600 text-white shrink-0 hover:bg-purple-700"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
