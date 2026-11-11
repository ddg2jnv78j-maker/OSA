import React, { useState, useEffect } from 'react';
import {
  Heart,
  Search,
  MapPin,
  Phone,
  MessageCircle,
  PlusCircle,
  X,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  Filter,
  Compass,
  Share2,
  MessageSquare,
  Clock,
  Building2,
  Send,
  Check,
  Copy,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Droplet,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Profile } from '../../types/osa';
import { OSAAvatar } from '../OSAAvatar';

export interface BloodComment {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string | null;
  text: string;
  createdAt: string;
}

export interface BloodRequest {
  id: string;
  patientName: string;
  bloodGroup: string;
  bagsNeeded: number;
  hospital: string;
  district: string;
  area: string;
  neededTime: string;
  contactPhone: string;
  notes: string;
  posterId: string;
  posterName: string;
  posterAvatar: string | null;
  status: 'urgent' | 'managed';
  createdAt: string;
  comments: BloodComment[];
}

export interface Donor {
  id: string;
  userId?: string;
  name: string;
  avatarUrl?: string | null;
  bloodGroup: string;
  district: string;
  area: string;
  phone: string;
  lastDonated: string;
  isAvailable: boolean;
  totalDonations: number;
  registeredAt: string;
}

const BLOOD_GROUPS = ['ALL', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
const DISTRICTS = [
  'সব জেলা',
  'ঢাকা',
  'চট্টগ্রাম',
  'সিলেট',
  'রাজশাহী',
  'খুলনা',
  'বরিশাল',
  'রংপুর',
  'ময়মনসিংহ',
  'কুমিল্লা',
  'বগুড়া',
  'গাজীপুর',
  'নারায়ণগঞ্জ',
];

const INITIAL_REQUESTS: BloodRequest[] = [
  {
    id: 'req_1',
    patientName: 'রহিমা বেগম (৫৫)',
    bloodGroup: 'O+',
    bagsNeeded: 2,
    hospital: 'ঢাকা মেডিকেল কলেজ হাসপাতাল (জরুরি বিভাগ)',
    district: 'ঢাকা',
    area: 'বকশীবাজার',
    neededTime: 'আজ বিকাল ৪:০০ টার মধ্যে',
    contactPhone: '+8801712345678',
    notes: 'জরুরি ওপেন হার্ট সার্জারির জন্য ২ ব্যাগ ফ্রেশ রক্তের প্রয়োজন। রক্তদাতাকে গাড়িভাড়া দেওয়া হবে।',
    posterId: 'user_rahim',
    posterName: 'তানভীর আহমেদ',
    posterAvatar: null,
    status: 'urgent',
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    comments: [
      {
        id: 'c_1',
        userId: 'u_donor1',
        userName: 'সাকিব আল হাসান',
        userAvatar: null,
        text: 'আমি ১ ব্যাগ দিতে পারব, হাসপাতালে রওনা দিচ্ছি। ফোন নম্বরটা চালু রাখবেন।',
        createdAt: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        id: 'c_2',
        userId: 'u_donor2',
        userName: 'তানজিলা হক',
        userAvatar: null,
        text: 'আমাদের ফ্রেন্ডস গ্রুপে শেয়ার করে দিয়েছি ভাই, দ্রুত ম্যানেজ হয়ে যাবে ইনশাআল্লাহ।',
        createdAt: new Date(Date.now() - 1800000).toISOString(),
      },
    ],
  },
  {
    id: 'req_2',
    patientName: 'ছোট্ট শিশু আরিয়ান (৪ বছর)',
    bloodGroup: 'B-',
    bagsNeeded: 1,
    hospital: 'চট্টগ্রাম মা ও শিশু হাসপাতাল',
    district: 'চট্টগ্রাম',
    area: 'আগ্রাবাদ',
    neededTime: 'আগামীকাল সকাল ১০:০০ টার আগে',
    contactPhone: '+8801819876543',
    notes: 'থ্যালাসেমিয়া নিয়মিত রক্ত গ্রহণকারী বাচ্চা। নেগেটিভ গ্রুপের রক্তদাতা অতি জরুরি।',
    posterId: 'user_karim',
    posterName: 'মাহমুদুল করিম',
    posterAvatar: null,
    status: 'urgent',
    createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
    comments: [
      {
        id: 'c_3',
        userId: 'u_donor3',
        userName: 'ফাহিম আহমেদ',
        userAvatar: null,
        text: 'আমার B- গ্রুপ, শেষ রক্ত দিয়েছি ৪ মাস আগে। সকালে যেতে পারব ইনশাআল্লাহ।',
        createdAt: new Date(Date.now() - 3600000 * 3).toISOString(),
      },
    ],
  },
  {
    id: 'req_3',
    patientName: 'আবুল কালাম আজাদ',
    bloodGroup: 'A+',
    bagsNeeded: 2,
    hospital: 'সিলেট এম এ জি ওসমানী মেডিকেল কলেজ',
    district: 'সিলেট',
    area: 'কাজীর বাজার',
    neededTime: 'আজ রাত ৮:০০ টার মধ্যে',
    contactPhone: '+8801615556677',
    notes: 'রোড এক্সিডেন্টে রক্তক্ষরণ। এ পজিটিভ রক্তদাতা এগিয়ে আসুন।',
    posterId: 'user_sadek',
    posterName: 'সাদেকুর রহমান',
    posterAvatar: null,
    status: 'managed',
    createdAt: new Date(Date.now() - 3600000 * 8).toISOString(),
    comments: [
      {
        id: 'c_4',
        userId: 'u_donor4',
        userName: 'নাজমুল হাসান',
        userAvatar: null,
        text: 'আলহামদুলিল্লাহ প্রয়োজনীয় ২ ব্যাগ রক্ত ম্যানেজ হয়েছে। সবাইকে ধন্যবাদ।',
        createdAt: new Date(Date.now() - 3600000 * 1).toISOString(),
      },
    ],
  },
];

const INITIAL_DONORS: Donor[] = [
  {
    id: 'd1',
    userId: 'donor_tanvir',
    name: 'তানভীর আহমেদ',
    avatarUrl: null,
    bloodGroup: 'O+',
    district: 'ঢাকা',
    area: 'ধানমন্ডি',
    phone: '+8801712345678',
    lastDonated: '৩ মাস আগে',
    isAvailable: true,
    totalDonations: 8,
    registeredAt: new Date(Date.now() - 86400000 * 45).toISOString(),
  },
  {
    id: 'd2',
    userId: 'donor_farhana',
    name: 'ফারহানা ইসলাম',
    avatarUrl: null,
    bloodGroup: 'A+',
    district: 'ঢাকা',
    area: 'মিরপুর-১০',
    phone: '+8801819876543',
    lastDonated: '৫ মাস আগে',
    isAvailable: true,
    totalDonations: 4,
    registeredAt: new Date(Date.now() - 86400000 * 20).toISOString(),
  },
  {
    id: 'd3',
    userId: 'donor_mahmud',
    name: 'মাহমুদুল হাসান',
    avatarUrl: null,
    bloodGroup: 'B+',
    district: 'চট্টগ্রাম',
    area: 'জিইসি মোড়',
    phone: '+8801911223344',
    lastDonated: '১ মাস আগে',
    isAvailable: false,
    totalDonations: 12,
    registeredAt: new Date(Date.now() - 86400000 * 90).toISOString(),
  },
  {
    id: 'd4',
    userId: 'donor_sakib',
    name: 'নাজমুল সাকিব',
    avatarUrl: null,
    bloodGroup: 'AB+',
    district: 'সিলেট',
    area: 'জিন্দাবাজার',
    phone: '+8801615556677',
    lastDonated: '৪ মাস আগে',
    isAvailable: true,
    totalDonations: 6,
    registeredAt: new Date(Date.now() - 86400000 * 15).toISOString(),
  },
  {
    id: 'd5',
    userId: 'donor_arif',
    name: 'আরিফুল হক',
    avatarUrl: null,
    bloodGroup: 'O-',
    district: 'ঢাকা',
    area: 'উত্তরা',
    phone: '+8801518889900',
    lastDonated: '৬ মাস আগে',
    isAvailable: true,
    totalDonations: 5,
    registeredAt: new Date(Date.now() - 86400000 * 60).toISOString(),
  },
  {
    id: 'd6',
    userId: 'donor_sadia',
    name: 'সাদিয়া আক্তার',
    avatarUrl: null,
    bloodGroup: 'A-',
    district: 'রাজশাহী',
    area: 'সাহেব বাজার',
    phone: '+8801710998877',
    lastDonated: '২ মাস আগে',
    isAvailable: true,
    totalDonations: 3,
    registeredAt: new Date(Date.now() - 86400000 * 10).toISOString(),
  },
];

interface BloodDonorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: Profile;
  currentUserName?: string;
  onOpenDirectChat?: (targetUserId: string, initialMessage?: string) => Promise<void> | void;
}

export const BloodDonorModal: React.FC<BloodDonorModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  currentUserName = 'User',
  onOpenDirectChat,
}) => {
  const effectiveUserId = currentUser?.id || 'guest_user_' + Date.now();
  const effectiveUserName = currentUser?.full_name || currentUserName;
  const effectiveAvatar = currentUser?.avatar_url || null;

  // Active view tab: 'requests' (Emergency blood requests) | 'donors' (Registered donors list)
  const [activeTab, setActiveTab] = useState<'requests' | 'donors'>('requests');

  // Blood Requests List (saved in localStorage)
  const [requests, setRequests] = useState<BloodRequest[]>(() => {
    try {
      const saved = localStorage.getItem('osa_blood_requests_v3');
      return saved ? JSON.parse(saved) : INITIAL_REQUESTS;
    } catch {
      return INITIAL_REQUESTS;
    }
  });

  // Donors List (saved in localStorage)
  const [donors, setDonors] = useState<Donor[]>(() => {
    try {
      const saved = localStorage.getItem('osa_verified_blood_donors_v3');
      return saved ? JSON.parse(saved) : INITIAL_DONORS;
    } catch {
      return INITIAL_DONORS;
    }
  });

  // Filters
  const [selectedGroup, setSelectedGroup] = useState('ALL');
  const [selectedDistrict, setSelectedDistrict] = useState('সব জেলা');
  const [searchQuery, setSearchQuery] = useState('');
  const [isGpsLocating, setIsGpsLocating] = useState(false);

  // Modals & sub-views
  const [showPostRequestModal, setShowPostRequestModal] = useState(false);
  const [showRegisterDonorModal, setShowRegisterDonorModal] = useState(false);
  const [shareTargetRequest, setShareTargetRequest] = useState<BloodRequest | null>(null);
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [copySuccess, setCopySuccess] = useState(false);

  // Form states for posting a blood request
  const [reqPatientName, setReqPatientName] = useState('');
  const [reqBloodGroup, setReqBloodGroup] = useState('O+');
  const [reqBags, setReqBags] = useState(1);
  const [reqHospital, setReqHospital] = useState('');
  const [reqDistrict, setReqDistrict] = useState('ঢাকা');
  const [reqArea, setReqArea] = useState('');
  const [reqNeededTime, setReqNeededTime] = useState('আজ বিকাল ৪:০০ টার মধ্যে');
  const [reqPhone, setReqPhone] = useState(currentUser?.phone || '+8801');
  const [reqNotes, setReqNotes] = useState('');

  // Form states for donor registration
  const [regName, setRegName] = useState(effectiveUserName);
  const [regGroup, setRegGroup] = useState('O+');
  const [regDistrict, setRegDistrict] = useState('ঢাকা');
  const [regArea, setRegArea] = useState('');
  const [regPhone, setRegPhone] = useState(currentUser?.phone || '+8801');
  const [regSuccess, setRegSuccess] = useState(false);

  // Sync to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('osa_blood_requests_v3', JSON.stringify(requests));
    } catch {}
  }, [requests]);

  useEffect(() => {
    try {
      localStorage.setItem('osa_verified_blood_donors_v3', JSON.stringify(donors));
    } catch {}
  }, [donors]);

  if (!isOpen) return null;

  // Real GPS District Detection
  const handleDetectGpsDistrict = () => {
    if ('geolocation' in navigator) {
      setIsGpsLocating(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;

          if (lat >= 23.6 && lat <= 24.1 && lng >= 90.2 && lng <= 90.6) {
            setSelectedDistrict('ঢাকা');
          } else if (lat >= 22.1 && lat <= 22.6 && lng >= 91.6 && lng <= 92.1) {
            setSelectedDistrict('চট্টগ্রাম');
          } else if (lat >= 24.7 && lat <= 25.1 && lng >= 91.7 && lng <= 92.0) {
            setSelectedDistrict('সিলেট');
          } else if (lat >= 24.2 && lat <= 24.6 && lng >= 88.4 && lng <= 88.8) {
            setSelectedDistrict('রাজশাহী');
          } else {
            setSelectedDistrict('ঢাকা');
          }
          setIsGpsLocating(false);
        },
        () => {
          setIsGpsLocating(false);
          setSelectedDistrict('ঢাকা');
        },
        { timeout: 6000 }
      );
    }
  };

  // Filter requests
  const filteredRequests = requests.filter((r) => {
    const matchGroup = selectedGroup === 'ALL' || r.bloodGroup === selectedGroup;
    const matchDistrict = selectedDistrict === 'সব জেলা' || r.district === selectedDistrict;
    const matchQuery =
      r.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.hospital.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.area.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.district.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.notes.toLowerCase().includes(searchQuery.toLowerCase());
    return matchGroup && matchDistrict && matchQuery;
  });

  // Filter donors
  const filteredDonors = donors.filter((d) => {
    const matchGroup = selectedGroup === 'ALL' || d.bloodGroup === selectedGroup;
    const matchDistrict = selectedDistrict === 'সব জেলা' || d.district === selectedDistrict;
    const matchQuery =
      d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.area.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.district.toLowerCase().includes(searchQuery.toLowerCase());
    return matchGroup && matchDistrict && matchQuery;
  });

  // Submit Blood Request
  const handlePostBloodRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reqPatientName.trim() || !reqHospital.trim() || !reqPhone.trim()) return;

    const newRequest: BloodRequest = {
      id: 'req_' + Date.now(),
      patientName: reqPatientName.trim(),
      bloodGroup: reqBloodGroup,
      bagsNeeded: Number(reqBags) || 1,
      hospital: reqHospital.trim(),
      district: reqDistrict,
      area: reqArea.trim() || reqDistrict,
      neededTime: reqNeededTime.trim() || 'জরুরি প্রয়োজন',
      contactPhone: reqPhone.trim(),
      notes: reqNotes.trim() || 'জরুরি রক্তের প্রয়োজন। সাহায্য করুন।',
      posterId: effectiveUserId,
      posterName: effectiveUserName,
      posterAvatar: effectiveAvatar,
      status: 'urgent',
      createdAt: new Date().toISOString(),
      comments: [],
    };

    setRequests([newRequest, ...requests]);
    try {
      confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 } });
    } catch {}

    // Reset form
    setReqPatientName('');
    setReqHospital('');
    setReqArea('');
    setReqNotes('');
    setShowPostRequestModal(false);
    setActiveTab('requests');
  };

  // Toggle Request status (Urgent <-> Managed)
  const handleToggleRequestStatus = (requestId: string) => {
    setRequests((prev) =>
      prev.map((r) => {
        if (r.id === requestId) {
          const nextStatus = r.status === 'urgent' ? 'managed' : 'urgent';
          if (nextStatus === 'managed') {
            try {
              confetti({ particleCount: 70, spread: 80, origin: { y: 0.7 } });
            } catch {}
          }
          return { ...r, status: nextStatus };
        }
        return r;
      })
    );
  };

  // Add Comment to Request
  const handleAddComment = (requestId: string) => {
    const text = (commentInputs[requestId] || '').trim();
    if (!text) return;

    const newComment: BloodComment = {
      id: 'comm_' + Date.now(),
      userId: effectiveUserId,
      userName: effectiveUserName,
      userAvatar: effectiveAvatar,
      text,
      createdAt: new Date().toISOString(),
    };

    setRequests((prev) =>
      prev.map((r) =>
        r.id === requestId ? { ...r, comments: [...r.comments, newComment] } : r
      )
    );

    setCommentInputs((prev) => ({ ...prev, [requestId]: '' }));
    setExpandedComments((prev) => ({ ...prev, [requestId]: true }));
  };

  // Register as Donor
  const handleRegisterDonor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName.trim() || !regPhone.trim() || !regArea.trim()) return;

    const newDonor: Donor = {
      id: 'donor_' + Date.now(),
      userId: effectiveUserId,
      name: regName.trim(),
      avatarUrl: effectiveAvatar,
      bloodGroup: regGroup,
      district: regDistrict,
      area: regArea.trim(),
      phone: regPhone.trim(),
      lastDonated: 'এখনো দেননি (নতুন ডোনার)',
      isAvailable: true,
      totalDonations: 1,
      registeredAt: new Date().toISOString(),
    };

    setDonors([newDonor, ...donors]);
    setRegSuccess(true);
    try {
      confetti({ particleCount: 60, spread: 70, origin: { y: 0.6 } });
    } catch {}
    setTimeout(() => {
      setRegSuccess(false);
      setShowRegisterDonorModal(false);
      setActiveTab('donors');
    }, 1200);
  };

  // Format share message
  const getFormattedShareText = (req: BloodRequest) => {
    return [
      `🚨 জরুরি রক্তের প্রয়োজন! 🚨`,
      `🩸 রক্তের গ্রুপ: ${req.bloodGroup} (${req.bagsNeeded} ব্যাগ)`,
      `👤 রোগী: ${req.patientName}`,
      `🏥 হাসপাতাল: ${req.hospital}, ${req.area}, ${req.district}`,
      `⏰ প্রয়োজন: ${req.neededTime}`,
      `📞 যোগাযোগ: ${req.contactPhone}`,
      `📝 বিবরণ: ${req.notes}`,
      `পোস্টদাতা: ${req.posterName} (OSA ব্লাড নেটওয়ার্ক)`,
    ].join('\n');
  };

  // Real Share Handler
  const handleShareEverywhere = async (req: BloodRequest) => {
    const text = getFormattedShareText(req);
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: `জরুরি রক্তের প্রয়োজন (${req.bloodGroup})`,
          text: text,
          url: window.location.href,
        });
        return;
      } catch {
        // Fallback to share modal
      }
    }
    setShareTargetRequest(req);
  };

  const handleCopyShareText = (req: BloodRequest) => {
    const text = getFormattedShareText(req);
    navigator.clipboard.writeText(text);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  // Start Chat on OSA
  const handleStartOsaChat = (targetUserId: string, targetName: string, subject: string) => {
    const message = `আসসালামু আলাইকুম ${targetName}, OSA জরুরি ব্লাড নেটওয়ার্কে আপনার "${subject}" পোস্ট দেখে যোগাযোগ করছি।`;
    if (onOpenDirectChat && targetUserId) {
      onClose();
      onOpenDirectChat(targetUserId, message);
    } else {
      // Fallback: prompt to connect or dial
      window.location.href = `tel:${subject.match(/\+?[0-9]{10,14}/)?.[0] || ''}`;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4">
      <div className="w-full max-w-3xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[94vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-red-600/10 via-rose-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-red-600 to-rose-500 text-white flex items-center justify-center shadow-lg shadow-red-500/25 shrink-0">
              <Heart className="w-6 h-6 fill-white" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                OSA জরুরি রক্তদান ও রক্তদাতা নেটওয়ার্ক
                <span className="px-2 py-0.5 text-[10px] font-bold bg-red-100 dark:bg-red-950/80 text-red-600 dark:text-red-400 rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" /> লাইভ SOS
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                রক্তের আবেদন পোস্ট করুন, ডোনার খুঁজুন, কল ও চ্যাট করুন সরাসরি
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Bar: Post Request or Register */}
        <div className="px-4 py-3 bg-red-50/70 dark:bg-red-950/30 border-b border-red-100 dark:border-red-900/40 flex flex-wrap items-center justify-between gap-2.5">
          {/* Tabs */}
          <div className="flex items-center bg-white dark:bg-slate-800 p-1 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs">
            <button
              type="button"
              onClick={() => setActiveTab('requests')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 ${
                activeTab === 'requests'
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-red-600'
              }`}
            >
              <Droplet className="w-3.5 h-3.5" />
              জরুরি রক্তের আবেদন ({requests.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('donors')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 ${
                activeTab === 'donors'
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-red-600'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              রক্তদাতা তালিকা ({donors.length})
            </button>
          </div>

          {/* Action CTAs */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPostRequestModal(true)}
              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-red-500/25 active:scale-95 transition"
            >
              <PlusCircle className="w-4 h-4" />
              রক্তের আবেদন পোস্ট করুন
            </button>
            <button
              type="button"
              onClick={() => setShowRegisterDonorModal(true)}
              className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 font-bold text-xs flex items-center gap-1 active:scale-95 transition"
            >
              <Heart className="w-3.5 h-3.5 fill-red-500 text-red-500" />
              ডোনার নিবন্ধন
            </button>
          </div>
        </div>

        {/* Filters strip */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 space-y-2.5">
          {/* Blood Group Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <span className="text-xs font-bold text-slate-500 shrink-0 mr-1">গ্রুপ:</span>
            {BLOOD_GROUPS.map((grp) => {
              const isSelected = selectedGroup === grp;
              return (
                <button
                  key={grp}
                  type="button"
                  onClick={() => setSelectedGroup(grp)}
                  className={`px-3 py-1 rounded-xl text-xs font-black tracking-wide transition-all shrink-0 ${
                    isSelected
                      ? 'bg-red-600 text-white shadow-md shadow-red-600/30 scale-105'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {grp}
                </button>
              );
            })}
          </div>

          {/* Search + District + GPS */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="relative sm:col-span-2">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder={
                  activeTab === 'requests'
                    ? 'হাসপাতাল, রোগীর নাম বা এলাকা...'
                    : 'এলাকা বা ডোনারের নাম...'
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 focus:border-red-500 focus:outline-none"
              />
            </div>
            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <Filter className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <select
                  value={selectedDistrict}
                  onChange={(e) => setSelectedDistrict(e.target.value)}
                  className="w-full pl-8 pr-2 py-2 text-xs rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 focus:border-red-500 focus:outline-none"
                >
                  {DISTRICTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={handleDetectGpsDistrict}
                className="px-2.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1 shrink-0"
                title="জিপিএস দিয়ে জেলা নির্বাচন"
              >
                <Compass className={`w-3.5 h-3.5 text-red-500 ${isGpsLocating ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">GPS</span>
              </button>
            </div>
          </div>
        </div>

        {/* Main List Body */}
        <div className="p-4 sm:p-5 flex-1 min-h-0 overflow-y-auto space-y-4">
          {/* TAB 1: EMERGENCY BLOOD REQUESTS */}
          {activeTab === 'requests' && (
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
                  মোট রক্তের আবেদন: {filteredRequests.length} টি
                </span>
                <span className="text-[11px] text-red-600 dark:text-red-400 font-semibold flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  সরাসরি কল বা চ্যাট করে সহায়তা করুন
                </span>
              </div>

              {filteredRequests.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 dark:bg-slate-800/40 rounded-3xl border border-dashed border-slate-200 dark:border-slate-700 space-y-2">
                  <Droplet className="w-10 h-10 text-red-400 mx-auto" />
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                    এই ফিল্টারে কোনো রক্তের আবেদন নেই
                  </p>
                  <p className="text-xs text-slate-400">
                    অন্য গ্রুপ বেছে নিন অথবা নিজেই একটি আবেদন পোস্ট করুন
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowPostRequestModal(true)}
                    className="mt-2 px-4 py-2 rounded-xl bg-red-600 text-white font-bold text-xs"
                  >
                    নতুন আবেদন পোস্ট করুন
                  </button>
                </div>
              ) : (
                filteredRequests.map((req) => {
                  const isManaged = req.status === 'managed';
                  const isMyPost = req.posterId === effectiveUserId;
                  const showComments = expandedComments[req.id];

                  return (
                    <div
                      key={req.id}
                      className={`p-4 sm:p-5 rounded-3xl border transition-all shadow-sm ${
                        isManaged
                          ? 'bg-slate-50/80 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 opacity-80'
                          : 'bg-white dark:bg-slate-800/90 border-red-200/80 dark:border-red-950 hover:shadow-md'
                      }`}
                    >
                      {/* Top Poster & Status Strip */}
                      <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-700/60 pb-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <OSAAvatar
                            name={req.posterName}
                            avatarUrl={req.posterAvatar}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                                {req.posterName}
                              </h4>
                              {isMyPost && (
                                <span className="px-1.5 py-0.5 text-[9px] font-bold bg-blue-100 dark:bg-blue-950 text-blue-600 rounded">
                                  আমার পোস্ট
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-400 flex items-center gap-1">
                              <Clock className="w-3 h-3 text-slate-400" />
                              {new Date(req.createdAt).toLocaleDateString([], {
                                month: 'short',
                                day: 'numeric',
                              })}{' '}
                              • {new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {isManaged ? (
                            <span className="px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              রক্ত ম্যানেজ হয়েছে
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full bg-red-100 dark:bg-red-950/80 text-red-600 dark:text-red-400 text-[11px] font-extrabold flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
                              জরুরি প্রয়োজন
                            </span>
                          )}

                          {isMyPost && (
                            <button
                              type="button"
                              onClick={() => handleToggleRequestStatus(req.id)}
                              className="text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200"
                              title="স্ট্যাটাস পরিবর্তন করুন"
                            >
                              {isManaged ? 'পুনরায় সক্রিয় করুন' : 'ম্যানেজ হয়েছে চিহ্নিত করুন'}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Request Details Card */}
                      <div className="pt-3.5 space-y-2.5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                              রোগীর নাম:
                            </span>
                            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                              {req.patientName}
                            </h3>
                          </div>

                          {/* Large Blood Group Badge */}
                          <div className="px-3.5 py-1.5 rounded-2xl bg-gradient-to-tr from-red-600 to-rose-600 text-white shadow-md shadow-red-600/30 text-center shrink-0">
                            <span className="text-lg font-black leading-none block">{req.bloodGroup}</span>
                            <span className="text-[10px] font-bold text-red-100 block">
                              {req.bagsNeeded} ব্যাগ
                            </span>
                          </div>
                        </div>

                        {/* Hospital & Area */}
                        <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-700/80 space-y-1 text-xs">
                          <p className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-red-500 shrink-0" />
                            {req.hospital}
                          </p>
                          <p className="text-slate-600 dark:text-slate-400 flex items-center gap-1.5 text-[11px]">
                            <MapPin className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            {req.area}, {req.district}
                          </p>
                          <p className="text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1.5 text-[11px]">
                            <Clock className="w-3.5 h-3.5 shrink-0" />
                            প্রয়োজনীয় সময়: {req.neededTime}
                          </p>
                        </div>

                        {/* Notes */}
                        {req.notes && (
                          <p className="text-xs text-slate-700 dark:text-slate-300 italic leading-relaxed bg-red-50/40 dark:bg-red-950/20 p-2.5 rounded-xl border border-red-100 dark:border-red-950/40">
                            "{req.notes}"
                          </p>
                        )}
                      </div>

                      {/* 4 Real Action Buttons: Call, OSA Chat, SMS, Share Everywhere */}
                      <div className="mt-3.5 pt-3 border-t border-slate-100 dark:border-slate-700/60 grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {/* 1. Direct Phone Call */}
                        <a
                          href={`tel:${req.contactPhone}`}
                          className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition"
                          title="সরাসরি ফোন করুন"
                        >
                          <Phone className="w-4 h-4" />
                          <span>কল করুন</span>
                        </a>

                        {/* 2. Direct OSA Chat */}
                        <button
                          type="button"
                          onClick={() =>
                            handleStartOsaChat(
                              req.posterId,
                              req.posterName,
                              `${req.patientName} (${req.bloodGroup})`
                            )
                          }
                          className="py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition"
                          title="OSA-তে ১-অন-১ চ্যাট শুরু করুন"
                        >
                          <MessageCircle className="w-4 h-4" />
                          <span>OSA চ্যাট</span>
                        </button>

                        {/* 3. SMS */}
                        <a
                          href={`sms:${req.contactPhone}?body=আসসালামু আলাইকুম, OSA ব্লাড নেটওয়ার্কে আপনার ${req.bloodGroup} রক্তের পোস্ট দেখেছি।`}
                          className="py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-800 dark:text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition"
                          title="এসএমএস পাঠান"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>এসএমএস</span>
                        </a>

                        {/* 4. Share Everywhere */}
                        <button
                          type="button"
                          onClick={() => handleShareEverywhere(req)}
                          className="py-2.5 px-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-100 font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition"
                          title="সব জায়গায় জরুরি শেয়ার করুন"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          <span>শেয়ার করুন</span>
                        </button>
                      </div>

                      {/* Interactive Comments & Assistance Accordion */}
                      <div className="mt-3 pt-2.5 border-t border-dashed border-slate-200 dark:border-slate-700/80">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedComments((prev) => ({
                              ...prev,
                              [req.id]: !prev[req.id],
                            }))
                          }
                          className="w-full flex items-center justify-between text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white py-1"
                        >
                          <span className="flex items-center gap-1.5">
                            <MessageSquare className="w-3.5 h-3.5 text-blue-500" />
                            মন্তব্য ও সহায়তার আশ্বাস ({req.comments.length})
                          </span>
                          {showComments ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>

                        {/* Collapsible Comment List & Input */}
                        {showComments && (
                          <div className="mt-2.5 space-y-2.5 animate-in fade-in">
                            {/* Comments list */}
                            {req.comments.length > 0 ? (
                              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                                {req.comments.map((comm) => (
                                  <div
                                    key={comm.id}
                                    className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800 text-xs space-y-1"
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-1.5">
                                        <OSAAvatar
                                          name={comm.userName}
                                          avatarUrl={comm.userAvatar}
                                          size="xs"
                                        />
                                        <span className="font-bold text-slate-900 dark:text-white text-[11px]">
                                          {comm.userName}
                                        </span>
                                      </div>
                                      <span className="text-[10px] text-slate-400">
                                        {new Date(comm.createdAt).toLocaleTimeString([], {
                                          hour: '2-digit',
                                          minute: '2-digit',
                                        })}
                                      </span>
                                    </div>
                                    <p className="text-slate-700 dark:text-slate-300 text-xs pl-6">
                                      {comm.text}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-[11px] text-slate-400 italic py-1">
                                এখনো কোনো মন্তব্য করা হয়নি। প্রথম সহায়তা বার্তা দিন।
                              </p>
                            )}

                            {/* Quick response chips */}
                            <div className="flex flex-wrap gap-1">
                              {[
                                'আমি রক্ত দিতে পারব 🩸',
                                'হাসপাতাল কোন ওয়ার্ডে?',
                                'ম্যানেজ হয়েছে কি ভাই?',
                                'গ্রুপে শেয়ার দিয়েছি',
                              ].map((chip) => (
                                <button
                                  key={chip}
                                  type="button"
                                  onClick={() =>
                                    setCommentInputs((prev) => ({
                                      ...prev,
                                      [req.id]: chip,
                                    }))
                                  }
                                  className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-400 text-[10px] font-medium"
                                >
                                  {chip}
                                </button>
                              ))}
                            </div>

                            {/* Comment Input Box */}
                            <div className="flex gap-1.5 pt-1">
                              <OSAAvatar
                                name={effectiveUserName}
                                avatarUrl={effectiveAvatar}
                                size="xs"
                              />
                              <input
                                type="text"
                                placeholder="একটি মন্তব্য বা সহায়তার আশ্বাস লিখুন..."
                                value={commentInputs[req.id] || ''}
                                onChange={(e) =>
                                  setCommentInputs((prev) => ({
                                    ...prev,
                                    [req.id]: e.target.value,
                                  }))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleAddComment(req.id);
                                  }
                                }}
                                className="flex-1 px-3 py-1.5 text-xs rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-transparent focus:border-blue-500 focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => handleAddComment(req.id)}
                                className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shrink-0 flex items-center gap-1"
                              >
                                <Send className="w-3 h-3" />
                                <span>পাঠান</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 2: REGISTERED DONORS DIRECTORY */}
          {activeTab === 'donors' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500">
                  পাওয়া গেছে: {filteredDonors.length} জন নিবন্ধিত রক্তদাতা
                </p>
                <button
                  type="button"
                  onClick={() => setShowRegisterDonorModal(true)}
                  className="text-xs font-bold text-red-600 hover:underline flex items-center gap-1"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  নিজে রক্তদাতা হিসেবে যুক্ত হন
                </button>
              </div>

              {filteredDonors.length === 0 ? (
                <div className="text-center py-10 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                  <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    এই গ্রুপ বা এলাকায় কোনো ডোনার পাওয়া যায়নি
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    অন্য গ্রুপ বা পাশের জেলা নির্বাচন করে দেখুন
                  </p>
                </div>
              ) : (
                filteredDonors.map((donor) => (
                  <div
                    key={donor.id}
                    className="p-3.5 rounded-2xl bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-red-300 dark:hover:border-red-800 transition shadow-2xs"
                  >
                    <div className="flex items-center gap-3">
                      {/* Avatar with Blood Group badge overlay */}
                      <div className="relative shrink-0">
                        <OSAAvatar
                          name={donor.name}
                          avatarUrl={donor.avatarUrl}
                          size="md"
                        />
                        <span className="absolute -bottom-1 -right-1 px-1.5 py-0.2 bg-red-600 text-white font-black text-[10px] rounded-md shadow">
                          {donor.bloodGroup}
                        </span>
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                            {donor.name}
                          </h4>
                          {donor.isAvailable ? (
                            <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              প্রস্তুত
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-500 rounded-full">
                              বিশ্রামে
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3.5 h-3.5 text-red-500 shrink-0" />
                          {donor.area}, {donor.district} • {donor.totalDonations} বার রক্ত দিয়েছেন
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          সর্বশেষ দান: {donor.lastDonated}
                        </p>
                      </div>
                    </div>

                    {/* Action buttons on donor card: Call, OSA Chat, SMS */}
                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <a
                        href={`tel:${donor.phone}`}
                        className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition active:scale-95"
                        title="সরাসরি ফোন করুন"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>কল</span>
                      </a>

                      <button
                        type="button"
                        onClick={() =>
                          handleStartOsaChat(
                            donor.userId || '',
                            donor.name,
                            `রক্তদাতা হিসেবে (${donor.bloodGroup})`
                          )
                        }
                        className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition active:scale-95"
                        title="OSA তে চ্যাট করুন"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>চ্যাট</span>
                      </button>

                      <a
                        href={`sms:${donor.phone}?body=জরুরি রক্তের প্রয়োজন: আপনার রক্তের গ্রুপ ${donor.bloodGroup}। সহায়তা করতে পারবেন কি?`}
                        className="p-2 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-300 transition"
                        title="এসএমএস পাঠান"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* MODAL 1: POST BLOOD REQUEST */}
        {showPostRequestModal && (
          <div className="fixed inset-0 z-60 bg-black/70 backdrop-blur-sm p-4 flex items-center justify-center animate-in fade-in duration-150">
            <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 max-h-[90vh] overflow-y-auto space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-red-600 text-white flex items-center justify-center">
                    <Droplet className="w-5 h-5 fill-white" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      রক্তের জরুরি আবেদন পোস্ট করুন
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      আপনার প্রোফাইল ছবি ও নম্বর সহ পোস্ট সরাসরি লাইভ হবে
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPostRequestModal(false)}
                  className="w-8 h-8 rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Author badge preview */}
              <div className="p-3 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/40 flex items-center gap-3">
                <OSAAvatar
                  name={effectiveUserName}
                  avatarUrl={effectiveAvatar}
                  size="sm"
                />
                <div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white">
                    পোস্টদাতা: {effectiveUserName}
                  </p>
                  <p className="text-[11px] text-red-600 dark:text-red-400 font-medium">
                    OSA ভেরিফাইড ইউজার অ্যাকাউন্ট
                  </p>
                </div>
              </div>

              <form onSubmit={handlePostBloodRequest} className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                    রোগীর নাম ও বয়স:
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="যেমন: মিসেস রোকেয়া (৪৫)"
                    value={reqPatientName}
                    onChange={(e) => setReqPatientName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-900 dark:text-white border border-transparent focus:border-red-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                      প্রয়োজনীয় রক্তের গ্রুপ:
                    </label>
                    <select
                      value={reqBloodGroup}
                      onChange={(e) => setReqBloodGroup(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-900 dark:text-white border border-transparent focus:border-red-500 focus:outline-none font-bold text-red-600"
                    >
                      {BLOOD_GROUPS.filter((g) => g !== 'ALL').map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                      কত ব্যাগ প্রয়োজন:
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      required
                      value={reqBags}
                      onChange={(e) => setReqBags(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-900 dark:text-white border border-transparent focus:border-red-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                    হাসপাতালের নাম ও ঠিকানা:
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="যেমন: ঢাকা মেডিকেল কলেজ হাসপাতাল, জরুরি বিভাগ"
                    value={reqHospital}
                    onChange={(e) => setReqHospital(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-900 dark:text-white border border-transparent focus:border-red-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                      জেলা:
                    </label>
                    <select
                      value={reqDistrict}
                      onChange={(e) => setReqDistrict(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-900 dark:text-white border border-transparent focus:border-red-500 focus:outline-none"
                    >
                      {DISTRICTS.filter((d) => d !== 'সব জেলা').map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                      এলাকা / থানা:
                    </label>
                    <input
                      type="text"
                      placeholder="যেমন: ধানমন্ডি"
                      value={reqArea}
                      onChange={(e) => setReqArea(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-900 dark:text-white border border-transparent focus:border-red-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                      কখন লাগবে (সময়):
                    </label>
                    <input
                      type="text"
                      placeholder="যেমন: আজ বিকাল ৪:০০ টায়"
                      value={reqNeededTime}
                      onChange={(e) => setReqNeededTime(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-900 dark:text-white border border-transparent focus:border-red-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                      জরুরি যোগাযোগের নম্বর:
                    </label>
                    <input
                      type="tel"
                      required
                      placeholder="+8801..."
                      value={reqPhone}
                      onChange={(e) => setReqPhone(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-900 dark:text-white border border-transparent focus:border-red-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                    রোগীর সমস্যা / অতিরিক্ত বিবরণ:
                  </label>
                  <textarea
                    rows={2}
                    placeholder="অপারেশন বা সমস্যার বিবরণ লিখুন..."
                    value={reqNotes}
                    onChange={(e) => setReqNotes(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-900 dark:text-white border border-transparent focus:border-red-500 focus:outline-none"
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPostRequestModal(false)}
                    className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300"
                  >
                    বাতিল
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-md shadow-red-500/20 active:scale-95 transition"
                  >
                    লাইভ পোস্ট করুন
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 2: REGISTER AS DONOR */}
        {showRegisterDonorModal && (
          <div className="fixed inset-0 z-60 bg-black/70 backdrop-blur-sm p-4 flex items-center justify-center animate-in fade-in duration-150">
            <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-red-500" />
                  স্বেচ্ছাসেবী রক্তদাতা নিবন্ধন
                </h3>
                <button
                  type="button"
                  onClick={() => setShowRegisterDonorModal(false)}
                  className="w-8 h-8 rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {regSuccess ? (
                <div className="text-center py-8 space-y-2">
                  <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
                  <p className="text-base font-bold text-slate-900 dark:text-white">
                    ধন্যবাদ! নিবন্ধন সফলভাবে সম্পন্ন হয়েছে
                  </p>
                  <p className="text-xs text-slate-500">
                    রক্তের প্রয়োজনে যে-কেউ আপনাকে কল বা OSA চ্যাটে নক দিতে পারবে।
                  </p>
                </div>
              ) : (
                <form onSubmit={handleRegisterDonor} className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                      আপনার নাম:
                    </label>
                    <input
                      type="text"
                      required
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-900 dark:text-white border border-transparent focus:border-red-500 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                        রক্তের গ্রুপ:
                      </label>
                      <select
                        value={regGroup}
                        onChange={(e) => setRegGroup(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-900 dark:text-white border border-transparent focus:border-red-500 focus:outline-none font-bold text-red-600"
                      >
                        {BLOOD_GROUPS.filter((g) => g !== 'ALL').map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                        জেলা:
                      </label>
                      <select
                        value={regDistrict}
                        onChange={(e) => setRegDistrict(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-900 dark:text-white border border-transparent focus:border-red-500 focus:outline-none"
                      >
                        {DISTRICTS.filter((d) => d !== 'সব জেলা').map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                      নির্দিষ্ট এলাকা (যেমন: ধানমন্ডি, মিরপুর):
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="আপনার বর্তমান এলাকা"
                      value={regArea}
                      onChange={(e) => setRegArea(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-900 dark:text-white border border-transparent focus:border-red-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                      মোবাইল নম্বর:
                    </label>
                    <input
                      type="tel"
                      required
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-900 dark:text-white border border-transparent focus:border-red-500 focus:outline-none"
                    />
                  </div>

                  <div className="pt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowRegisterDonorModal(false)}
                      className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300"
                    >
                      বাতিল
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-md shadow-red-500/20 active:scale-95 transition"
                    >
                      নিবন্ধন নিশ্চিত করুন
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* MODAL 3: SHARE EVERYWHERE */}
        {shareTargetRequest && (
          <div className="fixed inset-0 z-60 bg-black/70 backdrop-blur-sm p-4 flex items-center justify-center animate-in fade-in duration-150">
            <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Share2 className="w-5 h-5 text-red-500" />
                  সব জায়গায় জরুরি শেয়ার করুন
                </h3>
                <button
                  type="button"
                  onClick={() => setShareTargetRequest(null)}
                  className="w-8 h-8 rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Formatted Preview Box */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs font-mono whitespace-pre-line text-slate-800 dark:text-slate-200 leading-relaxed max-h-48 overflow-y-auto">
                {getFormattedShareText(shareTargetRequest)}
              </div>

              {/* 1-Tap Share Buttons */}
              <div className="grid grid-cols-1 gap-2">
                {/* Native Share */}
                {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
                  <button
                    type="button"
                    onClick={() => handleShareEverywhere(shareTargetRequest)}
                    className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm"
                  >
                    <Share2 className="w-4 h-4" />
                    <span>ফোনের অন্যান্য অ্যাপে শেয়ার করুন</span>
                  </button>
                )}

                {/* WhatsApp */}
                <a
                  href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                    getFormattedShareText(shareTargetRequest)
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>WhatsApp এ মেসেজ পাঠান</span>
                </a>

                {/* Facebook / Messenger */}
                <a
                  href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
                    window.location.href
                  )}&quote=${encodeURIComponent(getFormattedShareText(shareTargetRequest))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Facebook / Messenger এ পোস্ট</span>
                </a>

                {/* Copy Text */}
                <button
                  type="button"
                  onClick={() => handleCopyShareText(shareTargetRequest)}
                  className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 font-bold text-xs flex items-center justify-center gap-2"
                >
                  {copySuccess ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-500" />
                      <span>টেক্সট কপি সম্পন্ন হয়েছে!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>সম্পূর্ণ টেক্সট কপি করুন</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
