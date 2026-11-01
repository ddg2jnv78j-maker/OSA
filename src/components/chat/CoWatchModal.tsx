import React, { useEffect, useRef, useState } from 'react';
import {
  Film,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  X,
  Users,
  Sparkles,
  RefreshCw,
  Share2,
  Flame,
  Heart,
  Smile,
  Tv,
} from 'lucide-react';
import { Profile } from '../../types/osa';

interface CoWatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  channel: any;
  chatId: string;
  chatTitle: string;
  currentUser: Profile;
  language?: string;
}

interface ReactionBubble {
  id: string;
  emoji: string;
  senderName: string;
  x: number;
}

const SAMPLE_MOVIES = [
  {
    title: 'Cosmic Cyberpunk Odyssey (4K)',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    category: 'Sci-Fi / Animation',
  },
  {
    title: 'Tears of Steel (VFX Sci-Fi)',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
    category: 'Cyberpunk Action',
  },
  {
    title: 'Elephant Dream (Surreal 3D)',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    category: 'Fantasy 3D',
  },
  {
    title: 'For Bigger Blazes (Action Demo)',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    category: 'Demo Short',
  },
];

export const CoWatchModal: React.FC<CoWatchModalProps> = ({
  isOpen,
  onClose,
  channel,
  chatId,
  chatTitle,
  currentUser,
  language = 'en',
}) => {
  const isBn = language === 'bn';
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [videoUrl, setVideoUrl] = useState(SAMPLE_MOVIES[0].url);
  const [inputUrl, setInputUrl] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [reactions, setReactions] = useState<ReactionBubble[]>([]);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'seeking' | 'idle'>('synced');
  const [theatreMode, setTheatreMode] = useState(true);
  const [watcherCount, setWatcherCount] = useState(2);

  const isLocalActionRef = useRef(false);

  // Supabase Realtime synchronization
  useEffect(() => {
    if (!isOpen || !channel) return;

    const subscription = channel.on(
      'broadcast',
      { event: `cowatch_event_${chatId}` },
      (payload: any) => {
        const { type, time, url, senderId, senderName, emoji } = payload.payload;
        if (senderId === currentUser.id) return; // ignore self

        if (type === 'play' && videoRef.current) {
          isLocalActionRef.current = true;
          if (typeof time === 'number' && Math.abs(videoRef.current.currentTime - time) > 1.0) {
            videoRef.current.currentTime = time;
          }
          videoRef.current.play().catch(() => {});
          setIsPlaying(true);
          setSyncStatus('synced');
          setTimeout(() => {
            isLocalActionRef.current = false;
          }, 300);
        } else if (type === 'pause' && videoRef.current) {
          isLocalActionRef.current = true;
          if (typeof time === 'number') {
            videoRef.current.currentTime = time;
          }
          videoRef.current.pause();
          setIsPlaying(false);
          setSyncStatus('synced');
          setTimeout(() => {
            isLocalActionRef.current = false;
          }, 300);
        } else if (type === 'seek' && videoRef.current) {
          isLocalActionRef.current = true;
          videoRef.current.currentTime = time;
          setSyncStatus('seeking');
          setTimeout(() => {
            setSyncStatus('synced');
            isLocalActionRef.current = false;
          }, 400);
        } else if (type === 'change_source') {
          setVideoUrl(url);
          setSyncStatus('synced');
        } else if (type === 'reaction') {
          triggerReaction(emoji, senderName, false);
        }
      }
    );

    return () => {
      // Keep channel alive, broadcast unmount if needed
    };
  }, [isOpen, channel, chatId, currentUser.id]);

  const broadcastEvent = (type: string, extra: Record<string, any> = {}) => {
    if (!channel) return;
    try {
      channel.send({
        type: 'broadcast',
        event: `cowatch_event_${chatId}`,
        payload: {
          type,
          senderId: currentUser.id,
          senderName: currentUser.full_name,
          time: videoRef.current ? videoRef.current.currentTime : 0,
          ...extra,
        },
      });
    } catch {}
  };

  const handleTogglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play().then(() => {
        setIsPlaying(true);
        broadcastEvent('play', { time: video.currentTime });
      }).catch(() => {});
    } else {
      video.pause();
      setIsPlaying(false);
      broadcastEvent('pause', { time: video.currentTime });
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      broadcastEvent('seek', { time });
    }
  };

  const handleLoadCustomUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputUrl.trim()) return;
    setVideoUrl(inputUrl.trim());
    broadcastEvent('change_source', { url: inputUrl.trim() });
    setInputUrl('');
  };

  const handleSelectSample = (url: string) => {
    setVideoUrl(url);
    broadcastEvent('change_source', { url });
  };

  const triggerReaction = (emoji: string, senderName: string = currentUser.full_name, shouldBroadcast = true) => {
    const newBubble: ReactionBubble = {
      id: `${Date.now()}_${Math.random()}`,
      emoji,
      senderName,
      x: 15 + Math.random() * 70, // percent
    };

    setReactions((prev) => [...prev.slice(-15), newBubble]);
    setTimeout(() => {
      setReactions((prev) => prev.filter((r) => r.id !== newBubble.id));
    }, 2500);

    if (shouldBroadcast) {
      broadcastEvent('reaction', { emoji });
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-xl animate-in fade-in">
      <div
        className={`relative w-full max-w-4xl rounded-3xl overflow-hidden shadow-2xl border transition-all flex flex-col max-h-[95vh] ${
          theatreMode
            ? 'bg-slate-950 border-purple-500/30 shadow-purple-500/10'
            : 'bg-slate-900 border-slate-700'
        }`}
      >
        {/* Cinema Room Header */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-purple-950/70 via-slate-950 to-indigo-950/70 border-b border-purple-500/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-500 text-white flex items-center justify-center shadow-lg shadow-purple-600/30">
              <Tv className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white flex items-center gap-1.5">
                  <span>{isBn ? 'কো-ওয়াচ সিনেমা রুম' : 'Co-Watch Cinema Room'}</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    LIVE SYNC
                  </span>
                </h3>
              </div>
              <p className="text-xs text-purple-300/80 flex items-center gap-2">
                <span>{chatTitle}</span>
                <span>•</span>
                <span className="flex items-center gap-1 text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
                  {isBn ? 'রিয়েল-টাইম সিঙ্ক অ্যাক্টিভ' : 'In-Sync with chat'}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setTheatreMode(!theatreMode)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                theatreMode
                  ? 'bg-purple-600/30 border-purple-500 text-purple-200'
                  : 'bg-slate-800 border-slate-700 text-slate-300'
              }`}
            >
              {theatreMode ? '🎬 Theatre' : '💡 Normal'}
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Video Canvas & Floating Reactions Area */}
        <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden group">
          <video
            ref={videoRef}
            src={videoUrl}
            playsInline
            onTimeUpdate={() => {
              if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
            }}
            onLoadedMetadata={() => {
              if (videoRef.current) setDuration(videoRef.current.duration);
            }}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onClick={handleTogglePlay}
            className="w-full h-full object-contain cursor-pointer"
          />

          {/* Floating Emoji Reactions Layer */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
            {reactions.map((r) => (
              <div
                key={r.id}
                className="absolute bottom-8 flex flex-col items-center animate-out fade-out"
                style={{
                  left: `${r.x}%`,
                  animation: 'floatUp 2.4s cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
                }}
              >
                <span className="text-3xl filter drop-shadow-lg">{r.emoji}</span>
                <span className="text-[10px] font-bold text-white/90 bg-black/60 px-2 py-0.5 rounded-full mt-1">
                  {r.senderName.split(' ')[0]}
                </span>
              </div>
            ))}
          </div>

          {/* Big Center Play Icon Overlay when paused */}
          {!isPlaying && (
            <button
              onClick={handleTogglePlay}
              className="absolute w-16 h-16 rounded-full bg-purple-600/80 hover:bg-purple-600 text-white flex items-center justify-center shadow-2xl backdrop-blur-sm transform transition-all hover:scale-110 active:scale-95 z-10"
            >
              <Play className="w-8 h-8 fill-current ml-1" />
            </button>
          )}

          {/* Video Controls Bar Overlay */}
          <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex flex-col gap-2 opacity-95 group-hover:opacity-100 transition-opacity z-10">
            {/* Progress Slider */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-slate-300 w-10 text-right">
                {formatTime(currentTime)}
              </span>
              <input
                type="range"
                min="0"
                max={duration || 100}
                step="0.1"
                value={currentTime}
                onChange={handleSeek}
                className="flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
              <span className="text-[11px] font-mono text-slate-400 w-10">
                {formatTime(duration)}
              </span>
            </div>

            {/* Bottom Controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleTogglePlay}
                  className="p-1.5 rounded-lg text-white hover:bg-white/20 transition-colors"
                >
                  {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
                </button>

                <button
                  onClick={() => {
                    if (videoRef.current) {
                      videoRef.current.muted = !isMuted;
                      setIsMuted(!isMuted);
                    }
                  }}
                  className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/20 transition-colors"
                >
                  {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>

                <div className="hidden sm:flex items-center gap-1.5 text-xs text-purple-300 font-semibold bg-purple-950/60 px-2.5 py-1 rounded-xl border border-purple-500/20">
                  <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                  <span>{syncStatus === 'synced' ? 'Synchronized' : 'Syncing...'}</span>
                </div>
              </div>

              {/* Quick Cinema Reactions */}
              <div className="flex items-center gap-1 sm:gap-1.5 bg-black/60 p-1 rounded-2xl border border-white/10">
                {['🍿', '❤️', '🔥', '😱', '😂', '👏'].map((em) => (
                  <button
                    key={em}
                    onClick={() => triggerReaction(em)}
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl hover:bg-white/20 active:scale-125 transition-transform flex items-center justify-center text-base sm:text-lg"
                    title={`Send ${em}`}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Channels & Custom Video Input */}
        <div className="p-4 bg-slate-950/90 border-t border-slate-800 space-y-3 overflow-y-auto">
          {/* Custom URL Input */}
          <form onSubmit={handleLoadCustomUrl} className="flex gap-2">
            <input
              type="url"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder={isBn ? 'কোনো ভিডিও লিংক (MP4 / WebM / Stream) দিন...' : 'Paste custom MP4, WebM or stream video link...'}
              className="flex-1 px-4 py-2 rounded-2xl bg-slate-900 border border-slate-800 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-purple-500"
            />
            <button
              type="submit"
              disabled={!inputUrl.trim()}
              className="px-4 py-2 rounded-2xl bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white text-xs font-bold transition-colors"
            >
              {isBn ? 'লোড করুন' : 'Load Video'}
            </button>
          </form>

          {/* Quick Cinema Demo Trailers */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-purple-400 mb-2">
              {isBn ? 'ইনস্ট্যান্ট প্রিভিউ ট্রেইলারসমূহ (১-ক্লিক প্লে)' : 'Instant Demo Cinema Channels'}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {SAMPLE_MOVIES.map((m) => (
                <button
                  key={m.url}
                  onClick={() => handleSelectSample(m.url)}
                  className={`p-2.5 rounded-2xl text-left border transition-all flex flex-col justify-between ${
                    videoUrl === m.url
                      ? 'bg-purple-950/60 border-purple-500 text-white ring-1 ring-purple-500/40'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white'
                  }`}
                >
                  <p className="text-xs font-bold line-clamp-1">{m.title}</p>
                  <span className="text-[10px] text-purple-400 mt-1">{m.category}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes floatUp {
          0% {
            transform: translateY(0) scale(0.6);
            opacity: 0;
          }
          15% {
            transform: translateY(-20px) scale(1.2);
            opacity: 1;
          }
          85% {
            opacity: 0.9;
          }
          100% {
            transform: translateY(-160px) scale(1.4);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
};
