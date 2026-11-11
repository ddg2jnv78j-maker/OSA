import React, { useState } from 'react';
import {
  Compass,
  Search,
  Heart,
  ShieldAlert,
  Wallet,
  Share2,
  FileSearch,
  Mic,
  Music,
  Navigation,
  Droplet,
  Radio,
  GraduationCap,
  Repeat,
  UserCheck,
  Film,
  Briefcase,
  Sparkles,
  ChevronRight,
  Flame,
  ShieldCheck,
  CheckCircle,
} from 'lucide-react';
import { BloodDonorModal } from '../components/explore/BloodDonorModal';
import { FamilySosModal } from '../components/explore/FamilySosModal';
import { PocketKhataModal } from '../components/explore/PocketKhataModal';
import { OfflineP2PShareModal } from '../components/explore/OfflineP2PShareModal';
import { AiPrescriptionScannerModal } from '../components/explore/AiPrescriptionScannerModal';
import { BanglaVoiceTypistModal } from '../components/explore/BanglaVoiceTypistModal';
import { AiCallerTuneModal } from '../components/explore/AiCallerTuneModal';
import { FairRideMeterModal } from '../components/explore/FairRideMeterModal';
import { HealthHabitTrackerModal } from '../components/explore/HealthHabitTrackerModal';
import { PublicNewsChannelsModal } from '../components/explore/PublicNewsChannelsModal';
import { CampusNoticeBoardModal } from '../components/explore/CampusNoticeBoardModal';
import { BarterClubModal } from '../components/explore/BarterClubModal';
import { AttendanceTrackerModal } from '../components/explore/AttendanceTrackerModal';
import { WatchPartyModal } from '../components/explore/WatchPartyModal';
import { DigitalBusinessCardModal } from '../components/explore/DigitalBusinessCardModal';
import { Profile } from '../types/osa';

interface ExploreHubPageProps {
  currentUser: Profile;
  onOpenDirectChat?: (targetUserId: string, initialMessage?: string) => Promise<void> | void;
}

export const ExploreHubPage: React.FC<ExploreHubPageProps> = ({ currentUser, onOpenDirectChat }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'safety' | 'khata' | 'ai' | 'community' | 'lifestyle'>('all');

  // Modals visibility state
  const [showBloodDonor, setShowBloodDonor] = useState(false);
  const [showFamilySos, setShowFamilySos] = useState(false);
  const [showPocketKhata, setShowPocketKhata] = useState(false);
  const [showOfflineShare, setShowOfflineShare] = useState(false);
  const [showAiPrescription, setShowAiPrescription] = useState(false);
  const [showVoiceTypist, setShowVoiceTypist] = useState(false);
  const [showCallerTune, setShowCallerTune] = useState(false);
  const [showFairRide, setShowFairRide] = useState(false);
  const [showHealthHabit, setShowHealthHabit] = useState(false);
  const [showPublicNews, setShowPublicNews] = useState(false);
  const [showCampusNotice, setShowCampusNotice] = useState(false);
  const [showBarterClub, setShowBarterClub] = useState(false);
  const [showAttendance, setShowAttendance] = useState(false);
  const [showWatchParty, setShowWatchParty] = useState(false);
  const [showBusinessCard, setShowBusinessCard] = useState(false);

  const HUB_ITEMS = [
    {
      id: 'blood_donor',
      title: 'জরুরি রক্তদাতা নেটওয়ার্ক',
      subtitle: 'বিভাগ ও জেলা অনুযায়ী ব্লাড গ্রুপের ডোনার খুঁজুন বা স্বেচ্ছায় যুক্ত হন',
      icon: Heart,
      badge: 'Emergency SOS',
      category: 'safety',
      gradient: 'from-red-500 to-rose-600',
      action: () => setShowBloodDonor(true),
    },
    {
      id: 'family_sos',
      title: 'উইমেন অ্যান্ড ফ্যামিলি এসওএস শিল্ড',
      subtitle: 'রাতের যাতায়াতে জরুরি অ্যালার্ম, ৯৯৯ কল ও লাইভ লোকেশন এসএমএস',
      icon: ShieldAlert,
      badge: '999 Safety',
      category: 'safety',
      gradient: 'from-rose-600 to-red-700',
      action: () => setShowFamilySos(true),
    },
    {
      id: 'pocket_khata',
      title: 'দৈনিক ব্যক্তিগত হিসাব খাতা',
      subtitle: 'আয় ও ব্যয়ের দৈনিক ডায়রি, ব্যালেন্স ট্র্যাকার ও খরচের হিসাব',
      icon: Wallet,
      badge: 'Pocket Khata',
      category: 'khata',
      gradient: 'from-emerald-500 to-teal-600',
      action: () => setShowPocketKhata(true),
    },
    {
      id: 'offline_share',
      title: 'অফলাইন পিয়ার-টু-পিয়ার ফাইল শেয়ার',
      subtitle: 'ইন্টারনেট ছাড়াই এয়ারড্রপ স্টাইলে হাই-স্পিড ফটো ও ভিডিও ট্রান্সফার',
      icon: Share2,
      badge: 'No Internet',
      category: 'community',
      gradient: 'from-blue-600 to-indigo-600',
      action: () => setShowOfflineShare(true),
    },
    {
      id: 'ai_prescription',
      title: 'প্রেসক্রিপশন ও ডকুমেন্ট স্ক্যানার',
      subtitle: 'ডাক্তারের হাতের লেখা থেকে ওষুধের নাম ও সকাল-দুপুর-রাত ডোজ আলাদা করুন',
      icon: FileSearch,
      badge: 'AI Powered',
      category: 'ai',
      gradient: 'from-teal-500 to-emerald-600',
      action: () => setShowAiPrescription(true),
    },
    {
      id: 'voice_typist',
      title: 'বাংলা স্মার্ট ভয়েস টাইপিস্ট',
      subtitle: 'মুখে বাংলায় বলুন, স্বয়ংক্রিয়ভাবে নির্ভুল দাড়ি-কমা সহ টেক্সট কপি করুন',
      icon: Mic,
      badge: 'Speech to Text',
      category: 'ai',
      gradient: 'from-violet-600 to-purple-600',
      action: () => setShowVoiceTypist(true),
    },
    {
      id: 'caller_tune',
      title: 'নিজের নামের কলার টিউন স্টুডিও',
      subtitle: 'এআই সাউন্ড দিয়ে নিজের নামে কাস্টম কলার টিউন ও মিউজিক্যাল ডায়লগ সেট করুন',
      icon: Music,
      badge: 'AI Voice',
      category: 'ai',
      gradient: 'from-amber-500 to-orange-500',
      action: () => setShowCallerTune(true),
    },
    {
      id: 'fair_ride',
      title: 'ন্যায্য রিকশা/সিএনজি ভাড়া ও ট্রাফিক মিটার',
      subtitle: 'বিভিন্ন রুটে রিকশা ও সিএনজির সঠিক ভাড়া রেঞ্জ এবং লাইভ জ্যাম সতর্কবার্তা',
      icon: Navigation,
      badge: 'Ride Meter',
      category: 'lifestyle',
      gradient: 'from-emerald-600 to-teal-600',
      action: () => setShowFairRide(true),
    },
    {
      id: 'health_habit',
      title: 'ওষুধ ও পানি পানের স্মার্ট ট্র্যাকার',
      subtitle: 'দৈনিক ৮ গ্লাস পানি পান লক্ষ্য এবং নিয়মিত ওষুধের চেকলিস্ট ও স্ট্রিক',
      icon: Droplet,
      badge: 'Health Streak',
      category: 'lifestyle',
      gradient: 'from-cyan-500 to-blue-600',
      action: () => setShowHealthHabit(true),
    },
    {
      id: 'public_news',
      title: 'পাবলিক নিউজ ও জব ব্রডকাস্ট চ্যানেল',
      subtitle: 'সরকারি চাকরি, ব্রেকিং নিউজ ও ক্রিকেট লাইভ স্কোরের পাবলিক চ্যানেল',
      icon: Radio,
      badge: 'Live Channels',
      category: 'community',
      gradient: 'from-blue-600 to-purple-600',
      action: () => setShowPublicNews(true),
    },
    {
      id: 'campus_notice',
      title: 'ক্যাম্পাস ও লোকাল নোটিশ বোর্ড',
      subtitle: 'টিউশন খোঁজা, হারানো বিজ্ঞপ্তি, স্টাডি নোট ও ক্যাম্পাস ইভেন্ট বুলেটিন',
      icon: GraduationCap,
      badge: 'Campus Board',
      category: 'community',
      gradient: 'from-indigo-600 to-purple-600',
      action: () => setShowCampusNotice(true),
    },
    {
      id: 'barter_club',
      title: 'বই ও জিনিসপত্র অদল-বদল ক্লাব',
      subtitle: 'পড়া বই ও অব্যবহৃত গ্যাজেট বন্ধুদের সাথে ফ্রিতে বিনিময় বা উপহার দিন',
      icon: Repeat,
      badge: 'Free Barter',
      category: 'community',
      gradient: 'from-amber-500 to-emerald-600',
      action: () => setShowBarterClub(true),
    },
    {
      id: 'attendance',
      title: 'ক্লাস/অফিস হাজিরা ট্র্যাকার',
      subtitle: '১-ট্যাপে শিক্ষার্থীদের উপস্থিতি লিপিবদ্ধ করুন ও বিস্তারিত রিপোর্ট কপি করুন',
      icon: UserCheck,
      badge: 'Attendance RSVP',
      category: 'lifestyle',
      gradient: 'from-emerald-600 to-teal-600',
      action: () => setShowAttendance(true),
    },
    {
      id: 'watch_party',
      title: 'OSA ওয়াচ পার্টি ও রেডিও রুম',
      subtitle: 'বন্ধুরা একসাথে বসে নাটক, ম্যাচ ও গান শুনুন এবং লাইভ রিঅ্যাকশন দিন',
      icon: Film,
      badge: 'Watch Together',
      category: 'community',
      gradient: 'from-purple-600 to-pink-600',
      action: () => setShowWatchParty(true),
    },
    {
      id: 'business_card',
      title: 'ডিজিটাল বিজনেস কার্ড ও পোর্টফোলিও',
      subtitle: '১-ক্লিকে নিজের প্রফেশনাল প্রোফাইল, স্কিল ও কিউআর কার্ড বানিয়ে শেয়ার করুন',
      icon: Briefcase,
      badge: 'Smart vCard',
      category: 'lifestyle',
      gradient: 'from-blue-600 to-cyan-600',
      action: () => setShowBusinessCard(true),
    },
  ];

  const filteredItems = HUB_ITEMS.filter((item) => {
    const matchCategory = selectedCategory === 'all' || item.category === selectedCategory;
    const matchSearch =
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.subtitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.badge.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCategory && matchSearch;
  });

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 overflow-y-auto">
      {/* Top Header */}
      <div className="p-5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-blue-500/25">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                OSA এক্সপ্লোর ও সুপার সেবা
                <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 rounded-full">
                  Hub
                </span>
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                দৈনন্দিন জীবন, জরুরি নিরাপত্তা ও আধুনিক এআই সুপার টুলস
              </p>
            </div>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative mb-3">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="যেকোনো সেবা বা টুল খুঁজুন (যেমন: রক্তদাতা, হিসাব, সাইরেন)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-900 dark:text-white border border-transparent focus:border-blue-500 focus:outline-none"
          />
        </div>

        {/* Category Tabs */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {[
            { id: 'all', label: 'সবকিছু (All)' },
            { id: 'safety', label: 'নিরাপত্তা ও SOS 🚑' },
            { id: 'khata', label: 'হিসাব খাতা 💰' },
            { id: 'ai', label: 'এআই টুলস 🤖' },
            { id: 'community', label: 'কমিউনিটি 🌐' },
            { id: 'lifestyle', label: 'লাইফস্টাইল 🌿' },
          ].map((tab) => {
            const isSelected = selectedCategory === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSelectedCategory(tab.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid of Tools */}
      <div className="p-4 space-y-2.5 flex-1">
        {filteredItems.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.id}
              onClick={item.action}
              className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 hover:border-blue-400 dark:hover:border-blue-700 shadow-sm hover:shadow-md transition cursor-pointer flex items-center justify-between group active:scale-[0.99]"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div
                  className={`w-12 h-12 rounded-2xl bg-gradient-to-tr ${item.gradient} text-white flex items-center justify-center shadow-md shrink-0 group-hover:scale-105 transition`}
                >
                  <Icon className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {item.title}
                    </h3>
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-bold shrink-0">
                      {item.badge}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                    {item.subtitle}
                  </p>
                </div>
              </div>

              <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 group-hover:text-blue-600 group-hover:bg-blue-50 dark:group-hover:bg-blue-950/50 transition shrink-0 ml-2">
                <ChevronRight className="w-4 h-4" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Render Modals */}
      <BloodDonorModal
        isOpen={showBloodDonor}
        onClose={() => setShowBloodDonor(false)}
        currentUser={currentUser}
        currentUserName={currentUser.full_name}
        onOpenDirectChat={onOpenDirectChat}
      />
      <FamilySosModal
        isOpen={showFamilySos}
        onClose={() => setShowFamilySos(false)}
        currentUserName={currentUser.full_name}
      />
      <PocketKhataModal
        isOpen={showPocketKhata}
        onClose={() => setShowPocketKhata(false)}
      />
      <OfflineP2PShareModal
        isOpen={showOfflineShare}
        onClose={() => setShowOfflineShare(false)}
        currentUserName={currentUser.full_name}
      />
      <AiPrescriptionScannerModal
        isOpen={showAiPrescription}
        onClose={() => setShowAiPrescription(false)}
      />
      <BanglaVoiceTypistModal
        isOpen={showVoiceTypist}
        onClose={() => setShowVoiceTypist(false)}
      />
      <AiCallerTuneModal
        isOpen={showCallerTune}
        onClose={() => setShowCallerTune(false)}
        currentUserName={currentUser.full_name}
      />
      <FairRideMeterModal
        isOpen={showFairRide}
        onClose={() => setShowFairRide(false)}
      />
      <HealthHabitTrackerModal
        isOpen={showHealthHabit}
        onClose={() => setShowHealthHabit(false)}
      />
      <PublicNewsChannelsModal
        isOpen={showPublicNews}
        onClose={() => setShowPublicNews(false)}
      />
      <CampusNoticeBoardModal
        isOpen={showCampusNotice}
        onClose={() => setShowCampusNotice(false)}
        currentUserName={currentUser.full_name}
      />
      <BarterClubModal
        isOpen={showBarterClub}
        onClose={() => setShowBarterClub(false)}
        currentUserName={currentUser.full_name}
      />
      <AttendanceTrackerModal
        isOpen={showAttendance}
        onClose={() => setShowAttendance(false)}
      />
      <WatchPartyModal
        isOpen={showWatchParty}
        onClose={() => setShowWatchParty(false)}
        currentUserName={currentUser.full_name}
      />
      <DigitalBusinessCardModal
        isOpen={showBusinessCard}
        onClose={() => setShowBusinessCard(false)}
        currentUserName={currentUser.full_name}
        currentUserAvatar={currentUser.avatar_url}
      />
    </div>
  );
};
