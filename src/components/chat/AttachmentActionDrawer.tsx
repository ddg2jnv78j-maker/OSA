import React, { useState } from 'react';
import {
  FileText,
  Image as ImageIcon,
  Camera,
  Music,
  Eye,
  Zap,
  Radio,
  Tv,
  Palette,
  Heart,
  Clock,
  Lock,
  ShieldAlert,
  Calculator,
  FileCheck,
  Scale,
  Handshake,
  Calendar,
  BarChart2,
  Receipt,
  Languages,
  Sparkles,
  Sliders,
  MapPin,
  User,
  Search,
  X,
} from 'lucide-react';

export type AttachmentCategory = 'all' | 'media' | 'live' | 'security' | 'deals' | 'ai';

interface AttachmentActionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  isGroup: boolean;
  language: string;
  onOpenFilePicker: () => void;
  onOpenCaptureCamera: () => void;
  onEnableViewOnce: () => void;
  onOpenCreatePoll: () => void;
  onOpenSplitBill: () => void;
  onShareLocation: () => void;
  onAiDraft: () => void;
  onShareContactCard: () => void;
  onOpenCanvas: () => void;
  onOpenVoiceFilter: () => void;
  onOpenSecretVault: () => void;
  onOpenEventPlanner: () => void;
  onOpenFileBeam: () => void;
  onOpenIou: () => void;
  onOpenWalkieTalkie: () => void;
  onOpenTimeCapsule: () => void;
  onOpenCoWatch: () => void;
  onOpenTruthShield: () => void;
  onOpenHeartbeat: () => void;
  onOpenDigitalDeed: () => void;
  onOpenDuressStealth: () => void;
  onOpenBanglaDialect: () => void;
  onOpenBargainArbiter: () => void;
}

export const AttachmentActionDrawer: React.FC<AttachmentActionDrawerProps> = ({
  isOpen,
  onClose,
  isGroup,
  language,
  onOpenFilePicker,
  onOpenCaptureCamera,
  onEnableViewOnce,
  onOpenCreatePoll,
  onOpenSplitBill,
  onShareLocation,
  onAiDraft,
  onShareContactCard,
  onOpenCanvas,
  onOpenVoiceFilter,
  onOpenSecretVault,
  onOpenEventPlanner,
  onOpenFileBeam,
  onOpenIou,
  onOpenWalkieTalkie,
  onOpenTimeCapsule,
  onOpenCoWatch,
  onOpenTruthShield,
  onOpenHeartbeat,
  onOpenDigitalDeed,
  onOpenDuressStealth,
  onOpenBanglaDialect,
  onOpenBargainArbiter,
}) => {
  const isBn = language === 'bn';
  const [activeCategory, setActiveCategory] = useState<AttachmentCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');

  if (!isOpen) return null;

  const CATEGORY_TABS: { id: AttachmentCategory; label: string; icon: string }[] = [
    { id: 'all', label: isBn ? 'সকল ফিচার' : 'All Features', icon: '🌟' },
    { id: 'media', label: isBn ? 'মিডিয়া ও ফাইল' : 'Media & Files', icon: '📁' },
    { id: 'live', label: isBn ? 'লাইভ ও পিটিটি' : 'Live & PTT', icon: '⚡' },
    { id: 'security', label: isBn ? 'নিরাপত্তা ও ভল্ট' : 'Vault & Safety', icon: '🔐' },
    { id: 'deals', label: isBn ? 'চুক্তি ও হিসাব' : 'Deals & Tasks', icon: '🤝' },
    { id: 'ai', label: isBn ? 'এআই ও ভাষা' : 'AI & Dialects', icon: '🌐' },
  ];

  const ALL_ITEMS = [
    // 📁 MEDIA
    {
      id: 'gallery',
      name: 'Gallery',
      nameBn: 'গ্যালারি',
      category: 'media',
      gradient: 'from-blue-600 to-cyan-500',
      icon: ImageIcon,
      sub: 'Photos & Videos',
      onClick: () => {
        onClose();
        onOpenFilePicker();
      },
    },
    {
      id: 'camera',
      name: 'Camera',
      nameBn: 'ক্যামেরা',
      category: 'media',
      gradient: 'from-pink-500 to-rose-600',
      icon: Camera,
      sub: 'Snap Photo',
      onClick: () => {
        onClose();
        onOpenCaptureCamera();
      },
    },
    {
      id: 'doc',
      name: 'Document',
      nameBn: 'ডকুমেন্ট',
      category: 'media',
      gradient: 'from-purple-600 to-indigo-500',
      icon: FileText,
      sub: 'PDF, Word, Zip',
      onClick: () => {
        onClose();
        onOpenFilePicker();
      },
    },
    {
      id: 'audio',
      name: 'Audio File',
      nameBn: 'অডিও ফাইল',
      category: 'media',
      gradient: 'from-amber-500 to-orange-500',
      icon: Music,
      sub: 'Music & Voice',
      onClick: () => {
        onClose();
        onOpenFilePicker();
      },
    },
    {
      id: 'view_once',
      name: 'View Once',
      nameBn: 'ভিউ ওয়ান্স',
      category: 'media',
      gradient: 'from-teal-500 to-emerald-500',
      icon: Eye,
      sub: 'Self-Destruct',
      onClick: () => {
        onClose();
        onEnableViewOnce();
      },
    },
    {
      id: 'file_beam',
      name: 'File Beam',
      nameBn: 'ফাইল বীম',
      category: 'media',
      gradient: 'from-cyan-500 to-blue-600',
      icon: Zap,
      sub: 'Direct P2P',
      badge: 'FAST',
      onClick: () => {
        onClose();
        onOpenFileBeam();
      },
    },

    // ⚡ LIVE & PTT
    {
      id: 'walkie',
      name: 'Walkie-Talkie',
      nameBn: 'ওয়াকি-টকি',
      category: 'live',
      gradient: 'from-emerald-600 to-teal-600',
      icon: Radio,
      sub: 'Radio Channel',
      badge: 'PTT',
      onClick: () => {
        onClose();
        onOpenWalkieTalkie();
      },
    },
    {
      id: 'cowatch',
      name: 'Co-Watch',
      nameBn: 'কো-ওয়াচ সিনেমা',
      category: 'live',
      gradient: 'from-purple-600 to-indigo-600',
      icon: Tv,
      sub: 'Sync Video',
      badge: 'CINEMA',
      onClick: () => {
        onClose();
        onOpenCoWatch();
      },
    },
    {
      id: 'whiteboard',
      name: 'Whiteboard',
      nameBn: 'হোয়াইটবোর্ড',
      category: 'live',
      gradient: 'from-sky-500 to-blue-600',
      icon: Palette,
      sub: 'Live Canvas',
      onClick: () => {
        onClose();
        onOpenCanvas();
      },
    },
    {
      id: 'heartbeat',
      name: 'Heartbeat',
      nameBn: 'হার্টবিট টাচ',
      category: 'live',
      gradient: 'from-rose-500 to-pink-600',
      icon: Heart,
      sub: 'Sensory Pulse',
      badge: 'TOUCH',
      onClick: () => {
        onClose();
        onOpenHeartbeat();
      },
    },

    // 🔐 PRIVACY & SECURITY
    {
      id: 'time_capsule',
      name: 'Time Capsule',
      nameBn: 'টাইম ক্যাপসুল',
      category: 'security',
      gradient: 'from-amber-500 to-yellow-500',
      icon: Clock,
      sub: 'Future Unlock',
      badge: 'SEALED',
      onClick: () => {
        onClose();
        onOpenTimeCapsule();
      },
    },
    {
      id: 'vault',
      name: 'Secret Vault',
      nameBn: 'সিক্রেট ভল্ট',
      category: 'security',
      gradient: 'from-amber-600 to-rose-600',
      icon: Lock,
      sub: 'PIN Protected',
      badge: '4-PIN',
      onClick: () => {
        onClose();
        onOpenSecretVault();
      },
    },
    {
      id: 'truth_shield',
      name: 'Truth Shield',
      nameBn: 'ট্রুথ শিল্ড',
      category: 'security',
      gradient: 'from-cyan-500 to-teal-500',
      icon: ShieldAlert,
      sub: 'Vocal Stress',
      badge: 'RADAR',
      onClick: () => {
        onClose();
        onOpenTruthShield();
      },
    },
    {
      id: 'stealth_sos',
      name: 'Stealth SOS',
      nameBn: 'সাইলেন্ট এসওএস',
      category: 'security',
      gradient: 'from-red-600 to-rose-700',
      icon: Calculator,
      sub: 'Emergency GPS',
      badge: 'STEALTH',
      onClick: () => {
        onClose();
        onOpenDuressStealth();
      },
    },

    // 🤝 DEALS & SOCIAL
    {
      id: 'deed',
      name: 'Digital Deed',
      nameBn: 'ডিজিটাল ডিড',
      category: 'deals',
      gradient: 'from-amber-700 to-yellow-600',
      icon: FileCheck,
      sub: 'Signed Bond',
      badge: 'LEGAL',
      onClick: () => {
        onClose();
        onOpenDigitalDeed();
      },
    },
    {
      id: 'arbiter',
      name: 'Deal Arbiter',
      nameBn: 'দরদাম সালিশ',
      category: 'deals',
      gradient: 'from-indigo-600 to-blue-600',
      icon: Scale,
      sub: '50/50 Midpoint',
      badge: 'ARBITER',
      onClick: () => {
        onClose();
        onOpenBargainArbiter();
      },
    },
    {
      id: 'iou',
      name: 'IOU Note',
      nameBn: 'লেনদেন নোট',
      category: 'deals',
      gradient: 'from-amber-500 to-yellow-600',
      icon: Handshake,
      sub: 'Promise / Loan',
      onClick: () => {
        onClose();
        onOpenIou();
      },
    },
    {
      id: 'event',
      name: 'Plan Event',
      nameBn: 'ইভেন্ট প্ল্যান',
      category: 'deals',
      gradient: 'from-indigo-600 to-purple-600',
      icon: Calendar,
      sub: 'RSVP Card',
      onClick: () => {
        onClose();
        onOpenEventPlanner();
      },
    },
    {
      id: 'poll',
      name: 'Group Poll',
      nameBn: 'ভোট / পোল',
      category: 'deals',
      gradient: 'from-amber-500 to-orange-500',
      icon: BarChart2,
      sub: 'Live Voting',
      onClick: () => {
        onClose();
        onOpenCreatePoll();
      },
    },
    {
      id: 'split_bill',
      name: 'Split Bill',
      nameBn: 'বিল ভাগ',
      category: 'deals',
      gradient: 'from-teal-500 to-emerald-600',
      icon: Receipt,
      sub: 'Group Expense',
      hide: !isGroup,
      onClick: () => {
        onClose();
        onOpenSplitBill();
      },
    },

    // 🌐 AI & LANGUAGES
    {
      id: 'dialect',
      name: 'Dialect AI',
      nameBn: 'আঞ্চলিক ভাষা',
      category: 'ai',
      gradient: 'from-emerald-600 to-teal-500',
      icon: Languages,
      sub: '6 Accents',
      badge: 'BANGLA',
      onClick: () => {
        onClose();
        onOpenBanglaDialect();
      },
    },
    {
      id: 'ai_draft',
      name: 'AI Smart Reply',
      nameBn: 'এআই ড্রাফট',
      category: 'ai',
      gradient: 'from-violet-600 to-indigo-600',
      icon: Sparkles,
      sub: 'Instant Draft',
      onClick: () => {
        onClose();
        onAiDraft();
      },
    },
    {
      id: 'voice_filter',
      name: 'Voice Effects',
      nameBn: 'ভয়েস ফিল্টার',
      category: 'ai',
      gradient: 'from-violet-600 to-fuchsia-600',
      icon: Sliders,
      sub: 'Morph Voice',
      onClick: () => {
        onClose();
        onOpenVoiceFilter();
      },
    },
    {
      id: 'location',
      name: 'Location',
      nameBn: 'লাইভ লোকেশন',
      category: 'ai',
      gradient: 'from-emerald-500 to-green-600',
      icon: MapPin,
      sub: 'GPS Share',
      onClick: () => {
        onClose();
        onShareLocation();
      },
    },
    {
      id: 'contact',
      name: 'Contact',
      nameBn: 'কন্টাক্ট কার্ড',
      category: 'ai',
      gradient: 'from-blue-500 to-indigo-600',
      icon: User,
      sub: 'Share Profile',
      onClick: () => {
        onClose();
        onShareContactCard();
      },
    },
  ];

  const q = searchQuery.toLowerCase().trim();
  const visibleItems = ALL_ITEMS.filter((item) => {
    if (item.hide) return false;
    const matchCat = activeCategory === 'all' || item.category === activeCategory;
    const matchQ =
      !q ||
      item.name.toLowerCase().includes(q) ||
      item.nameBn.toLowerCase().includes(q) ||
      item.sub.toLowerCase().includes(q) ||
      item.category.includes(q);
    return matchCat && matchQ;
  });

  return (
    <div className="shrink-0 p-3 sm:p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200 select-none">
      <div className="max-w-4xl mx-auto space-y-3">
        {/* Top Controls: Search Bar & Horizontal Category Tabs */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
          {/* Search Bar */}
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isBn ? 'টুল বা ফিচার খুঁজুন (যেমন: ভল্ট, ওয়াকি, ডিড)...' : 'Search tools & attachments...'}
              className="w-full pl-8 pr-7 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 border border-transparent focus:border-blue-500 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
              >
                &times;
              </button>
            )}
          </div>

          {/* Horizontal Category Tab Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            {CATEGORY_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveCategory(tab.id)}
                className={`px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap transition-all flex items-center gap-1 ${
                  activeCategory === tab.id
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Clean, Well-Spaced Button Grid */}
        {visibleItems.length > 0 ? (
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3 sm:gap-4 max-h-[250px] overflow-y-auto p-1">
            {visibleItems.map((item) => {
              const IconComponent = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.onClick}
                  className="flex flex-col items-center gap-1 group focus:outline-none relative"
                  title={item.name}
                >
                  <div
                    className={`w-12 h-12 rounded-2xl bg-gradient-to-tr ${item.gradient} text-white flex items-center justify-center shadow-md shadow-black/10 group-hover:scale-105 active:scale-95 transition-all relative`}
                  >
                    <IconComponent className="w-5 h-5 stroke-[2.2]" />
                    {item.badge && (
                      <span className="absolute -top-1 -right-1 px-1.5 py-0.2 bg-amber-400 text-slate-950 font-black text-[8px] rounded-full shadow-xs">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 text-center truncate max-w-[70px]">
                    {isBn ? item.nameBn : item.name}
                  </span>
                  <span className="text-[9px] text-slate-400 text-center truncate max-w-[70px] -mt-0.5">
                    {item.sub}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="py-6 text-center text-xs text-slate-400">
            {isBn ? 'কোনো টুল পাওয়া যায়নি' : 'No matching tools found'}
          </div>
        )}
      </div>
    </div>
  );
};
