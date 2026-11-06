import React, { useState } from 'react';
import {
  Radio,
  Briefcase,
  Trophy,
  GraduationCap,
  Bell,
  BellOff,
  Eye,
  Heart,
  Share2,
  X,
  Sparkles,
} from 'lucide-react';

interface ChannelPost {
  id: string;
  channelId: string;
  title: string;
  body: string;
  time: string;
  views: number;
  likes: number;
}

const CHANNELS = [
  {
    id: 'jobs',
    name: 'বিডি সরকারি ও টেক জব সার্কুলার',
    category: 'ক্যারিয়ার ও চাকরি',
    subscribers: '১২৮.৪k',
    icon: Briefcase,
    color: 'from-blue-600 to-indigo-600',
  },
  {
    id: 'news',
    name: 'ব্রেকিং নিউজ বাংলাদেশ ২৪/৭',
    category: 'জাতীয় ও আন্তর্জাতিক',
    subscribers: '২৫৪.১k',
    icon: Radio,
    color: 'from-red-600 to-rose-600',
  },
  {
    id: 'sports',
    name: 'ক্রিকেট ও স্পোর্টস লাইভ স্কোর',
    category: 'খেলাধুলা',
    subscribers: '১৮৯.৭k',
    icon: Trophy,
    color: 'from-emerald-600 to-teal-600',
  },
  {
    id: 'edu',
    name: 'বিসিএস ও বিশ্ববিদ্যালয় ভর্তি প্রস্তুতি',
    category: 'শিক্ষা ও প্রস্তুতি',
    subscribers: '৯৮.৩k',
    icon: GraduationCap,
    color: 'from-amber-600 to-orange-600',
  },
];

const INITIAL_POSTS: ChannelPost[] = [
  {
    id: 'p1',
    channelId: 'jobs',
    title: 'বাংলাদেশ ব্যাংকে সহকারী পরিচালক (সাধারণ) পদে নিয়োগ বিজ্ঞপ্তি প্রকাশ',
    body: 'বেতন স্কেল ২২,০০০-৫৩,০৬০ টাকা। আবেদন করার শেষ সময় আগামী ২৫ নভেম্বর। অনলাইন আবেদনের লিংক অফিশিয়াল সাইটে দেওয়া হয়েছে।',
    time: '১ ঘন্টা আগে',
    views: 4210,
    likes: 312,
  },
  {
    id: 'p2',
    channelId: 'news',
    title: 'মেট্রোরেলের নতুন সময়সূচি ও সাপ্তাহিক ছুটির দিন নির্ধারণ',
    body: 'যাত্রীদের সুবিধার জন্য সকালে ট্রেনের ব্যবধান কমিয়ে প্রতি ৪ মিনিটে একটি ট্রেন চালানোর সিদ্ধান্ত নিয়েছে কর্তৃপক্ষ।',
    time: '২ ঘন্টা আগে',
    views: 8940,
    likes: 745,
  },
  {
    id: 'p3',
    channelId: 'sports',
    title: 'টি-টোয়েন্টি সিরিজের দ্বিতীয় ম্যাচে শান্তর দুর্দান্ত অপরাজিত ৭২ রান',
    body: 'শেষ ওভারে চার মেরে ৫ উইকেটে ম্যাচ জিতে নিল বাংলাদেশ। ম্যাচ সেরা নির্বাচিত হয়েছেন নাজমুল হোসেন শান্ত।',
    time: '৩ ঘন্টা আগে',
    views: 12400,
    likes: 1890,
  },
  {
    id: 'p4',
    channelId: 'edu',
    title: '৪৭তম বিসিএস প্রিলিমিনারি পরীক্ষার সাধারণ বিজ্ঞান ও তথ্যপ্রযুক্তি মডেল টেস্ট',
    body: 'ডেইলি প্র্যাকটিস কুইজ নং ১৪ আপলোড করা হয়েছে। ১০টি বহুনির্বাচনি প্রশ্নের উত্তর কমেন্টে আলোচনা করুন।',
    time: '৪ ঘন্টা আগে',
    views: 3150,
    likes: 240,
  },
];

interface PublicNewsChannelsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PublicNewsChannelsModal: React.FC<PublicNewsChannelsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [selectedChannelId, setSelectedChannelId] = useState('all');
  const [subscribedChannels, setSubscribedChannels] = useState<string[]>(['jobs', 'news']);
  const [posts, setPosts] = useState<ChannelPost[]>(INITIAL_POSTS);

  if (!isOpen) return null;

  const toggleSubscribe = (channelId: string) => {
    if (subscribedChannels.includes(channelId)) {
      setSubscribedChannels(subscribedChannels.filter((c) => c !== channelId));
    } else {
      setSubscribedChannels([...subscribedChannels, channelId]);
    }
  };

  const handleLike = (postId: string) => {
    setPosts(
      posts.map((p) => (p.id === postId ? { ...p, likes: p.likes + 1 } : p))
    );
  };

  const filteredPosts =
    selectedChannelId === 'all'
      ? posts
      : posts.filter((p) => p.channelId === selectedChannelId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-blue-600/10 via-purple-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-blue-600 to-purple-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/25">
              <Radio className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                পাবলিক নিউজ ও জব ব্রডকাস্ট চ্যানেল
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                ভেরিফায়েড ওয়ান-ওয়ে চ্যানেল থেকে লেটেস্ট আপডেট পান
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

        {/* Channels horizontal slider */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 overflow-x-auto flex gap-2 bg-slate-50/50 dark:bg-slate-900/50 no-scrollbar">
          <button
            onClick={() => setSelectedChannelId('all')}
            className={`px-3.5 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition ${
              selectedChannelId === 'all'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            সব চ্যানেল ({posts.length})
          </button>
          {CHANNELS.map((ch) => {
            const Icon = ch.icon;
            const isSelected = selectedChannelId === ch.id;
            const isSub = subscribedChannels.includes(ch.id);
            return (
              <button
                key={ch.id}
                onClick={() => setSelectedChannelId(ch.id)}
                className={`px-3 py-2 rounded-2xl text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {ch.name}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="p-5 flex-1 min-h-0 overflow-y-auto space-y-4">
          {filteredPosts.map((post) => {
            const ch = CHANNELS.find((c) => c.id === post.channelId);
            const isSub = ch ? subscribedChannels.includes(ch.id) : false;

            return (
              <div
                key={post.id}
                className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2.5"
              >
                {/* Channel Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-7 h-7 rounded-xl bg-gradient-to-tr ${
                        ch?.color || 'from-blue-600 to-indigo-600'
                      } text-white flex items-center justify-center`}
                    >
                      {ch && <ch.icon className="w-4 h-4" />}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">
                        {ch?.name}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {ch?.subscribers} সাবস্ক্রাইবার • {post.time}
                      </p>
                    </div>
                  </div>

                  {ch && (
                    <button
                      onClick={() => toggleSubscribe(ch.id)}
                      className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition flex items-center gap-1 ${
                        isSub
                          ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                    >
                      {isSub ? (
                        <>
                          <BellOff className="w-3 h-3" /> যুক্ত আছেন
                        </>
                      ) : (
                        <>
                          <Bell className="w-3 h-3" /> সাবস্ক্রাইব
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Post Body */}
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {post.title}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {post.body}
                </p>

                {/* Footer Reactions */}
                <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between text-xs text-slate-400">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 text-[11px]">
                      <Eye className="w-3.5 h-3.5" /> {post.views} ভিউ
                    </span>
                    <button
                      onClick={() => handleLike(post.id)}
                      className="flex items-center gap-1 text-[11px] hover:text-red-500 transition"
                    >
                      <Heart className="w-3.5 h-3.5 fill-red-500 text-red-500" /> {post.likes}
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      if (navigator.share) {
                        navigator.share({ title: post.title, text: post.body });
                      }
                    }}
                    className="flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    <Share2 className="w-3.5 h-3.5" /> শেয়ার করুন
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
