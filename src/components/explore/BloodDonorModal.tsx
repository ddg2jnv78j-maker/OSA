import React, { useState, useEffect, useMemo } from 'react';
import {
  Heart,
  Search,
  MapPin,
  Phone,
  MessageCircle,
  PlusCircle,
  X,
  CheckCircle2,
  UserCheck,
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
  Download,
  Trash2,
  Award,
  Activity,
  PhoneCall,
  RefreshCw,
  Stethoscope,
  Sparkles,
  IdCard,
  ArrowRight,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Profile } from '../../types/osa';
import { OSAAvatar } from '../OSAAvatar';
import { BD_DIVISIONS, DivisionId } from '../../data/bangladeshPlaces';
import {
  BLOOD_GROUP_LIST,
  BLOOD_COMPATIBILITY,
  BloodGroupType,
  BloodComponentType,
  UrgencyLevel,
  ALL_BD_DISTRICTS,
  getDistrictsByDivision,
  getDistrictCoordinates,
  findNearestBangladeshPlace,
  calculateDonorReadiness,
  formatRelativeTimeBn,
  fetchNearbyMedicalCenters,
  NearbyMedicalCenter,
  generateBloodAppealPosterDataUrl,
  generateDonorIdCardDataUrl,
} from './bloodNetworkUtils';

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
  bloodComponent?: BloodComponentType;
  urgencyLevel?: UrgencyLevel;
  hospital: string;
  wardInfo?: string;
  division?: DivisionId;
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
  division?: DivisionId;
  district: string;
  area: string;
  phone: string;
  lastDonated: string;
  lastDonatedDate?: string;
  isAvailable: boolean;
  totalDonations: number;
  registeredAt: string;
}

type ActiveTab = 'requests' | 'donors' | 'guide' | 'banks';

const BLOOD_GROUPS_FILTER = ['ALL', ...BLOOD_GROUP_LIST];
const BLOOD_COMPONENTS: BloodComponentType[] = [
  'Whole Blood',
  'Platelets',
  'Plasma',
  'Red Cells',
];

const ELIGIBILITY_QUESTIONS = [
  { id: 'age', label: 'আপনার বয়স কি ১৮ থেকে ৬০ বছরের মধ্যে?' },
  { id: 'weight', label: 'আপনার ওজন কি কমপক্ষে ৪৮ কেজি বা তার বেশি?' },
  { id: 'cooldown', label: 'শেষ রক্তদানের পর কি অন্তত ১২০ দিন (৪ মাস) পার হয়েছে (বা প্রথমবার দিচ্ছেন)?' },
  { id: 'healthy', label: 'গত ১৪ দিনে কি আপনার কোনো জ্বর, সর্দি-কাশি বা বড় সংক্রমণ ছিল না?' },
  { id: 'pressure', label: 'আপনার রক্তচাপ ও হিমোগ্লোবিন কি বর্তমানে স্বাভাবিক আছে?' },
  { id: 'surgery', label: 'গত ৬ মাসে কোনো বড় অপারেশন, ট্যাটু বা রক্তগ্রহণ করেননি?' },
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
  const effectiveUserId = currentUser?.id || 'guest_user_local';
  const effectiveUserName = currentUser?.full_name || currentUserName;
  const effectiveAvatar = currentUser?.avatar_url || null;

  const [activeTab, setActiveTab] = useState<ActiveTab>('requests');

  // Persisted Requests
  const [requests, setRequests] = useState<BloodRequest[]>(() => {
    try {
      const saved = localStorage.getItem('osa_blood_requests_v3');
      if (saved) {
        const parsed: BloodRequest[] = JSON.parse(saved);
        const demoIds = new Set(['req_1', 'req_2', 'req_3']);
        return parsed.filter(
          (r) =>
            !demoIds.has(r.id) &&
            !r.posterId?.startsWith('user_') &&
            r.posterName !== 'তানভীর আহমেদ' &&
            r.posterName !== 'মাহমুদুল করিম' &&
            r.posterName !== 'সাদেকুর রহমান'
        );
      }
      return [];
    } catch {
      return [];
    }
  });

  // Persisted Donors
  const [donors, setDonors] = useState<Donor[]>(() => {
    try {
      const saved = localStorage.getItem('osa_verified_blood_donors_v3');
      if (saved) {
        const parsed: Donor[] = JSON.parse(saved);
        const demoIds = new Set(['d1', 'd2', 'd3', 'd4', 'd5', 'd6']);
        return parsed.filter(
          (d) =>
            !demoIds.has(d.id) &&
            !d.userId?.startsWith('donor_') &&
            d.name !== 'তানভীর আহমেদ' &&
            d.name !== 'ফারহানা ইসলাম' &&
            d.name !== 'মাহমুদুল হাসান' &&
            d.name !== 'নাজমুল সাকিব' &&
            d.name !== 'আরিফুল হক' &&
            d.name !== 'সাদিয়া আক্তার'
        );
      }
      return [];
    } catch {
      return [];
    }
  });

  // User's saved own blood group for smart compatibility matching
  const [myBloodGroup, setMyBloodGroup] = useState<BloodGroupType | ''>(() => {
    try {
      const saved = localStorage.getItem('osa_my_blood_group_v1');
      if (saved && BLOOD_GROUP_LIST.includes(saved as BloodGroupType)) {
        return saved as BloodGroupType;
      }
      return '';
    } catch {
      return '';
    }
  });

  // Filters
  const [selectedGroup, setSelectedGroup] = useState('ALL');
  const [selectedDivision, setSelectedDivision] = useState<DivisionId | 'all'>('all');
  const [selectedDistrict, setSelectedDistrict] = useState('সব জেলা');
  const [statusFilter, setStatusFilter] = useState<'all' | 'urgent' | 'managed'>('all');
  const [onlyMyCompatible, setOnlyMyCompatible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isGpsLocating, setIsGpsLocating] = useState(false);
  const [gpsStatusNote, setGpsStatusNote] = useState<string>('');
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Modals & Interactive States
  const [showPostRequestModal, setShowPostRequestModal] = useState(false);
  const [showRegisterDonorModal, setShowRegisterDonorModal] = useState(false);
  const [shareTargetRequest, setShareTargetRequest] = useState<BloodRequest | null>(null);
  const [sharePosterUrl, setSharePosterUrl] = useState<string>('');
  const [donorIdCardTarget, setDonorIdCardTarget] = useState<Donor | null>(null);
  const [donorIdCardUrl, setDonorIdCardUrl] = useState<string>('');
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [copySuccess, setCopySuccess] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Compatibility Matrix & Eligibility Self-Check
  const [matrixGroup, setMatrixGroup] = useState<BloodGroupType>('O+');
  const [eligibilityAnswers, setEligibilityAnswers] = useState<Record<string, boolean>>({
    age: true,
    weight: true,
    cooldown: true,
    healthy: true,
    pressure: true,
    surgery: true,
  });

  // Nearby Medical Centers / Blood Banks State
  const [nearbyCenters, setNearbyCenters] = useState<NearbyMedicalCenter[]>([]);
  const [isLoadingCenters, setIsLoadingCenters] = useState(false);
  const [centersError, setCentersError] = useState<string>('');
  const [centersSearchedDistrict, setCentersSearchedDistrict] = useState<string>('');
  const [centerSearchInput, setCenterSearchInput] = useState<string>('');
  const [centerTypeFilter, setCenterTypeFilter] = useState<'all' | 'blood_bank' | 'hospital' | 'clinic'>('all');
  const [hasLoadedCenters, setHasLoadedCenters] = useState(false);

  // Form states for posting a blood request
  const [reqPatientName, setReqPatientName] = useState('');
  const [reqBloodGroup, setReqBloodGroup] = useState<BloodGroupType>('O+');
  const [reqBloodComponent, setReqBloodComponent] = useState<BloodComponentType>('Whole Blood');
  const [reqUrgency, setReqUrgency] = useState<UrgencyLevel>('critical');
  const [reqBags, setReqBags] = useState(1);
  const [reqHospital, setReqHospital] = useState('');
  const [reqWardInfo, setReqWardInfo] = useState('');
  const [reqDistrict, setReqDistrict] = useState('ঢাকা');
  const [reqArea, setReqArea] = useState('');
  const [reqNeededTime, setReqNeededTime] = useState('জরুরি — আজকের মধ্যেই');
  const [reqPhone, setReqPhone] = useState(currentUser?.phone || '+8801');
  const [reqNotes, setReqNotes] = useState('');

  // Form states for donor registration
  const [regName, setRegName] = useState(effectiveUserName);
  const [regGroup, setRegGroup] = useState<BloodGroupType>('O+');
  const [regDistrict, setRegDistrict] = useState('ঢাকা');
  const [regArea, setRegArea] = useState('');
  const [regPhone, setRegPhone] = useState(currentUser?.phone || '+8801');
  const [regLastDonatedDate, setRegLastDonatedDate] = useState('');
  const [regTotalDonations, setRegTotalDonations] = useState(0);
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

  useEffect(() => {
    try {
      if (myBloodGroup) {
        localStorage.setItem('osa_my_blood_group_v1', myBloodGroup);
      } else {
        localStorage.removeItem('osa_my_blood_group_v1');
      }
    } catch {}
  }, [myBloodGroup]);

  // Districts dropdown options based on selected Division
  const availableDistrictOptions = useMemo(
    () => getDistrictsByDivision(selectedDivision),
    [selectedDivision]
  );

  // Reset selectedDistrict if division narrows it out
  useEffect(() => {
    if (
      selectedDistrict !== 'সব জেলা' &&
      !availableDistrictOptions.some((d) => d.districtBn === selectedDistrict)
    ) {
      setSelectedDistrict('সব জেলা');
    }
  }, [selectedDivision, availableDistrictOptions, selectedDistrict]);

  // Generate Poster PNG whenever shareTargetRequest changes
  useEffect(() => {
    if (!shareTargetRequest) {
      setSharePosterUrl('');
      return;
    }
    const url = generateBloodAppealPosterDataUrl({
      bloodGroup: shareTargetRequest.bloodGroup,
      bagsNeeded: shareTargetRequest.bagsNeeded,
      patientName: shareTargetRequest.patientName,
      hospital: shareTargetRequest.hospital,
      area: shareTargetRequest.area,
      district: shareTargetRequest.district,
      neededTime: shareTargetRequest.neededTime,
      contactPhone: shareTargetRequest.contactPhone,
      notes: shareTargetRequest.notes,
      posterName: shareTargetRequest.posterName,
      component: shareTargetRequest.bloodComponent,
    });
    setSharePosterUrl(url);
  }, [shareTargetRequest]);

  // Generate Donor ID Card PNG whenever donorIdCardTarget changes
  useEffect(() => {
    if (!donorIdCardTarget) {
      setDonorIdCardUrl('');
      return;
    }
    const readiness = calculateDonorReadiness(donorIdCardTarget.lastDonatedDate);
    const url = generateDonorIdCardDataUrl({
      name: donorIdCardTarget.name,
      bloodGroup: donorIdCardTarget.bloodGroup,
      district: donorIdCardTarget.district,
      area: donorIdCardTarget.area,
      phone: donorIdCardTarget.phone,
      totalDonations: donorIdCardTarget.totalDonations,
      readinessLabel: donorIdCardTarget.isAvailable
        ? readiness.isReady
          ? 'রক্তদানে প্রস্তুত'
          : `বিশ্রামে (${readiness.daysRemaining} দিন বাকি)`
        : 'সাময়িক বিরতিতে',
    });
    setDonorIdCardUrl(url);
  }, [donorIdCardTarget]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2800);
  };

  // Load nearby blood banks & hospitals using Overpass mirrors + Nominatim Search
  const handleLoadNearbyCenters = async (opts?: {
    overrideDistrict?: string;
    overrideCoords?: { lat: number; lng: number };
    customQuery?: string;
  }) => {
    const targetDist =
      opts?.overrideDistrict ||
      (selectedDistrict !== 'সব জেলা' ? selectedDistrict : 'ঢাকা');
    const coords =
      opts?.overrideCoords ||
      (!opts?.overrideDistrict && userCoords
        ? userCoords
        : getDistrictCoordinates(targetDist));

    const queryText =
      opts?.customQuery !== undefined ? opts.customQuery : centerSearchInput;

    setIsLoadingCenters(true);
    setCentersError('');
    setHasLoadedCenters(true);
    setCentersSearchedDistrict(
      queryText.trim()
        ? `"${queryText.trim()}" (${targetDist})`
        : opts?.overrideCoords || (!opts?.overrideDistrict && userCoords)
          ? `আপনার বর্তমান জিপিএস লোকেশন (${targetDist})`
          : targetDist
    );

    try {
      const results = await fetchNearbyMedicalCenters(coords.lat, coords.lng, {
        districtBn: targetDist,
        customQuery: queryText,
      });
      setNearbyCenters(results);
      if (results.length === 0) {
        setCentersError(
          'নির্বাচিত এলাকায় ওপেনস্ট্রিটম্যাপ ডাটাবেজে কোনো কেন্দ্র পাওয়া যায়নি। নিচের বাটন থেকে সরাসরি Google Maps-এ খুঁজুন বা অন্য নাম দিয়ে চেষ্টা করুন।'
        );
      }
    } catch {
      setCentersError(
        'নেটওয়ার্কের কারণে কেন্দ্রের তালিকা লোড করা যায়নি। নিচের বাটনে ক্লিক করে Google Maps-এ সরাসরি খুঁজুন।'
      );
    } finally {
      setIsLoadingCenters(false);
    }
  };

  // Detect GPS and immediately load nearby hospitals & blood banks
  const handleGpsLoadNearbyCenters = () => {
    if (!('geolocation' in navigator)) {
      showToast('আপনার ব্রাউজারে জিপিএস লোকেশন সাপোর্ট করে না');
      return;
    }
    setIsGpsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserCoords(coords);
        const { place, distanceKm } = findNearestBangladeshPlace(coords.lat, coords.lng);
        setSelectedDivision(place.division);
        setSelectedDistrict(place.districtBn);
        setGpsStatusNote(`শনাক্ত: ${place.districtBn} (${place.nameBn}, ~${distanceKm} কি.মি.)`);
        setIsGpsLocating(false);
        void handleLoadNearbyCenters({
          overrideDistrict: place.districtBn,
          overrideCoords: coords,
          customQuery: '',
        });
      },
      () => {
        setIsGpsLocating(false);
        showToast('লোকেশন অনুমতি মেলেনি — জেলা নির্বাচন করে খুঁজুন');
      },
      { timeout: 8000, enableHighAccuracy: false }
    );
  };

  // Auto-load medical centers when user opens the 'banks' tab first time
  useEffect(() => {
    if (isOpen && activeTab === 'banks' && !hasLoadedCenters && !isLoadingCenters) {
      void handleLoadNearbyCenters();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  // Real Haversine GPS District Detection across ALL 64 Districts
  const handleDetectGpsDistrict = () => {
    if (!('geolocation' in navigator)) {
      showToast('আপনার ব্রাউজারে জিপিএস লোকেশন সাপোর্ট করে না');
      return;
    }

    setIsGpsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setUserCoords({ lat, lng });

        const { place, distanceKm } = findNearestBangladeshPlace(lat, lng);
        setSelectedDivision(place.division);
        setSelectedDistrict(place.districtBn);
        setReqDistrict(place.districtBn);
        setRegDistrict(place.districtBn);
        setGpsStatusNote(`শনাক্ত: ${place.districtBn} (${place.nameBn}, ~${distanceKm} কি.মি.)`);
        setIsGpsLocating(false);
        showToast(`আপনার জেলা শনাক্ত হয়েছে: ${place.districtBn}`);
      },
      () => {
        setIsGpsLocating(false);
        showToast('লোকেশন অনুমতি মেলেনি — ম্যানুয়ালি জেলা নির্বাচন করুন');
      },
      { timeout: 8000, enableHighAccuracy: false }
    );
  };

  // Compatibility helper for "myBloodGroup"
  const myCompatibleTargets = myBloodGroup
    ? BLOOD_COMPATIBILITY[myBloodGroup].canDonateTo
    : [];

  // Metrics
  const activeUrgentCount = requests.filter((r) => r.status === 'urgent').length;
  const managedCount = requests.filter((r) => r.status === 'managed').length;
  const availableDonorsCount = donors.filter(
    (d) => d.isAvailable && calculateDonorReadiness(d.lastDonatedDate).isReady
  ).length;
  const compatibleUrgentMatchesCount = myBloodGroup
    ? requests.filter(
        (r) =>
          r.status === 'urgent' &&
          myCompatibleTargets.includes(r.bloodGroup as BloodGroupType)
      ).length
    : 0;

  const myDonorListing = donors.find(
    (d) => d.userId === effectiveUserId || (currentUser?.phone && d.phone === currentUser.phone)
  );

  // Filtered Requests
  const filteredRequests = requests.filter((r) => {
    const districtObj = ALL_BD_DISTRICTS.find((d) => d.districtBn === r.district);
    const matchDivision =
      selectedDivision === 'all' ||
      r.division === selectedDivision ||
      districtObj?.division === selectedDivision;
    const matchDistrict = selectedDistrict === 'সব জেলা' || r.district === selectedDistrict;
    const matchGroup = selectedGroup === 'ALL' || r.bloodGroup === selectedGroup;
    const matchStatus = statusFilter === 'all' || r.status === statusFilter;
    const matchCompatible =
      !onlyMyCompatible ||
      !myBloodGroup ||
      myCompatibleTargets.includes(r.bloodGroup as BloodGroupType);

    const q = searchQuery.trim().toLowerCase();
    const matchQuery =
      !q ||
      r.patientName.toLowerCase().includes(q) ||
      r.hospital.toLowerCase().includes(q) ||
      r.area.toLowerCase().includes(q) ||
      r.district.toLowerCase().includes(q) ||
      r.notes.toLowerCase().includes(q);

    return (
      matchDivision &&
      matchDistrict &&
      matchGroup &&
      matchStatus &&
      matchCompatible &&
      matchQuery
    );
  });

  // Filtered Donors
  const filteredDonors = donors.filter((d) => {
    const districtObj = ALL_BD_DISTRICTS.find((dist) => dist.districtBn === d.district);
    const matchDivision =
      selectedDivision === 'all' ||
      d.division === selectedDivision ||
      districtObj?.division === selectedDivision;
    const matchDistrict = selectedDistrict === 'সব জেলা' || d.district === selectedDistrict;
    const matchGroup = selectedGroup === 'ALL' || d.bloodGroup === selectedGroup;

    const q = searchQuery.trim().toLowerCase();
    const matchQuery =
      !q ||
      d.name.toLowerCase().includes(q) ||
      d.area.toLowerCase().includes(q) ||
      d.district.toLowerCase().includes(q);

    return matchDivision && matchDistrict && matchGroup && matchQuery;
  });

  // Post New Blood Request
  const handlePostBloodRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reqPatientName.trim() || !reqHospital.trim() || !reqPhone.trim()) return;

    const matchedDistrict = ALL_BD_DISTRICTS.find((d) => d.districtBn === reqDistrict);

    const newRequest: BloodRequest = {
      id: 'req_' + Date.now(),
      patientName: reqPatientName.trim(),
      bloodGroup: reqBloodGroup,
      bagsNeeded: Number(reqBags) || 1,
      bloodComponent: reqBloodComponent,
      urgencyLevel: reqUrgency,
      hospital: reqHospital.trim(),
      wardInfo: reqWardInfo.trim() || undefined,
      division: matchedDistrict?.division,
      district: reqDistrict,
      area: reqArea.trim() || reqDistrict,
      neededTime: reqNeededTime.trim() || 'জরুরি প্রয়োজন',
      contactPhone: reqPhone.trim(),
      notes: reqNotes.trim() || 'জরুরি রক্তের প্রয়োজন। দয়া করে দ্রুত যোগাযোগ করুন।',
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

    setReqPatientName('');
    setReqHospital('');
    setReqWardInfo('');
    setReqArea('');
    setReqNotes('');
    setShowPostRequestModal(false);
    setActiveTab('requests');
    showToast('রক্তের জরুরি আবেদন সফলভাবে প্রকাশিত হয়েছে');
  };

  // Toggle Request Status
  const handleToggleRequestStatus = (requestId: string) => {
    setRequests((prev) =>
      prev.map((r) => {
        if (r.id === requestId) {
          const nextStatus = r.status === 'urgent' ? 'managed' : 'urgent';
          if (nextStatus === 'managed') {
            try {
              confetti({ particleCount: 70, spread: 80, origin: { y: 0.7 } });
            } catch {}
            showToast('আলহামদুলিল্লাহ! আবেদনটি ম্যানেজ হয়েছে হিসেবে চিহ্নিত করা হয়েছে');
          } else {
            showToast('আবেদনটি পুনরায় জরুরি তালিকায় চালু করা হয়েছে');
          }
          return { ...r, status: nextStatus };
        }
        return r;
      })
    );
  };

  // Delete Own Request
  const handleDeleteRequest = (requestId: string) => {
    setRequests((prev) => prev.filter((r) => r.id !== requestId));
    showToast('রক্তের আবেদনটি মুছে ফেলা হয়েছে');
  };

  // Add Comment
  const handleAddComment = (requestId: string, overrideText?: string) => {
    const text = (overrideText ?? commentInputs[requestId] ?? '').trim();
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

    if (!overrideText) {
      setCommentInputs((prev) => ({ ...prev, [requestId]: '' }));
    }
    setExpandedComments((prev) => ({ ...prev, [requestId]: true }));
  };

  // Register as Voluntary Donor
  const handleRegisterDonor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName.trim() || !regPhone.trim() || !regArea.trim()) return;

    const matchedDistrict = ALL_BD_DISTRICTS.find((d) => d.districtBn === regDistrict);
    const readiness = calculateDonorReadiness(regLastDonatedDate || undefined);

    const newDonor: Donor = {
      id: 'donor_' + Date.now(),
      userId: effectiveUserId,
      name: regName.trim(),
      avatarUrl: effectiveAvatar,
      bloodGroup: regGroup,
      division: matchedDistrict?.division,
      district: regDistrict,
      area: regArea.trim(),
      phone: regPhone.trim(),
      lastDonated: regLastDonatedDate
        ? new Date(`${regLastDonatedDate}T00:00:00`).toLocaleDateString('bn-BD', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })
        : 'নতুন / প্রথমবার রক্তদাতা',
      lastDonatedDate: regLastDonatedDate || undefined,
      isAvailable: readiness.isReady,
      totalDonations: Math.max(0, Number(regTotalDonations) || 0),
      registeredAt: new Date().toISOString(),
    };

    setDonors([newDonor, ...donors]);
    setMyBloodGroup(regGroup);
    setRegSuccess(true);
    try {
      confetti({ particleCount: 60, spread: 70, origin: { y: 0.6 } });
    } catch {}
    setTimeout(() => {
      setRegSuccess(false);
      setShowRegisterDonorModal(false);
      setActiveTab('donors');
      showToast('রক্তদাতা হিসেবে আপনার নাম সফলভাবে যুক্ত হয়েছে');
    }, 900);
  };

  // Donor Own Listing Actions
  const handleToggleDonorAvailability = (donorId: string) => {
    setDonors((prev) =>
      prev.map((d) => (d.id === donorId ? { ...d, isAvailable: !d.isAvailable } : d))
    );
  };

  const handleRecordDonationToday = (donorId: string) => {
    const todayIso = new Date().toISOString().slice(0, 10);
    setDonors((prev) =>
      prev.map((d) =>
        d.id === donorId
          ? {
              ...d,
              totalDonations: d.totalDonations + 1,
              lastDonatedDate: todayIso,
              lastDonated: new Date().toLocaleDateString('bn-BD', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              }),
              isAvailable: false,
            }
          : d
      )
    );
    try {
      confetti({ particleCount: 70, spread: 75, origin: { y: 0.65 } });
    } catch {}
    showToast('অভিনন্দন! আপনার আজকের রক্তদান রেকর্ড করা হয়েছে ও ১২০ দিনের বিশ্রাম সক্রিয় হয়েছে');
  };

  const handleDeleteDonor = (donorId: string) => {
    setDonors((prev) => prev.filter((d) => d.id !== donorId));
    showToast('রক্তদাতার তালিকা থেকে প্রোফাইল সরানো হয়েছে');
  };

  // Share Helpers
  const getFormattedShareText = (req: BloodRequest) => {
    return [
      `জরুরি রক্তের প্রয়োজন!`,
      `রক্তের গ্রুপ: ${req.bloodGroup} (${req.bagsNeeded} ব্যাগ · ${req.bloodComponent || 'Whole Blood'})`,
      `রোগী: ${req.patientName}`,
      `হাসপাতাল: ${req.hospital}${req.wardInfo ? ` (${req.wardInfo})` : ''}, ${req.area}, ${req.district}`,
      `সময়: ${req.neededTime}`,
      `যোগাযোগ: ${req.contactPhone}`,
      `বিবরণ: ${req.notes}`,
      `পোস্টদাতা: ${req.posterName} — OSA জরুরি ব্লাড নেটওয়ার্ক`,
    ].join('\n');
  };

  const handleShareEverywhere = async (req: BloodRequest) => {
    setShareTargetRequest(req);
  };

  const handleNativeShareWithPoster = async (req: BloodRequest) => {
    const text = getFormattedShareText(req);
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        if (sharePosterUrl && typeof fetch === 'function') {
          const res = await fetch(sharePosterUrl);
          const blob = await res.blob();
          const file = new File([blob], `osa-blood-${req.bloodGroup}.png`, {
            type: 'image/png',
          });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
              title: `জরুরি ${req.bloodGroup} রক্তের প্রয়োজন`,
              text,
              files: [file],
            });
            return;
          }
        }
        await navigator.share({
          title: `জরুরি ${req.bloodGroup} রক্তের প্রয়োজন`,
          text,
          url: window.location.href,
        });
      } catch {
        // User cancelled or share unsupported
      }
    }
  };

  const handleDownloadDataUrl = (dataUrl: string, filename: string) => {
    if (!dataUrl) return;
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('ছবিটি ডাউনলোড করা হয়েছে');
  };

  const handleCopyShareText = (req: BloodRequest) => {
    const text = getFormattedShareText(req);
    navigator.clipboard.writeText(text);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleStartOsaChat = (targetUserId: string, targetName: string, subject: string) => {
    const message = `আসসালামু আলাইকুম ${targetName}, OSA জরুরি ব্লাড নেটওয়ার্কে আপনার "${subject}" বিষয়টি দেখে যোগাযোগ করছি।`;
    if (onOpenDirectChat && targetUserId && targetUserId !== effectiveUserId) {
      onClose();
      onOpenDirectChat(targetUserId, message);
    } else if (targetUserId === effectiveUserId) {
      showToast('এটি আপনার নিজের পোস্ট করা তথ্য');
    } else {
      window.location.href = `tel:${subject.match(/\+?[0-9]{10,14}/)?.[0] || ''}`;
    }
  };

  const getGoogleMapsSearchUrl = (query: string) =>
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

  // Eligibility Score
  const passedQuestionsCount = Object.values(eligibilityAnswers).filter(Boolean).length;
  const isEligibleToday = passedQuestionsCount === ELIGIBILITY_QUESTIONS.length;

  const matrixInfo = BLOOD_COMPATIBILITY[matrixGroup];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-sm sm:p-4">
      <div className="w-full max-w-6xl h-full sm:h-[92vh] sm:rounded-3xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden relative">
        {/* Top Toast */}
        {toastMessage && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold shadow-xl flex items-center gap-2 whitespace-nowrap">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 dark:text-emerald-600 shrink-0" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Header Bar */}
        <header className="px-4 sm:px-6 py-3.5 sm:py-4 bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-red-600 text-white flex items-center justify-center shadow-sm shadow-red-600/20 shrink-0">
              <Droplet className="w-6 h-6 fill-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight truncate">
                OSA জরুরি রক্তদান ও রক্তদাতা নেটওয়ার্ক
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                বাংলাদেশের ৬৪ জেলা · রক্তের আবেদন, যাচাইকৃত ডোনার, ম্যাচিং গাইড ও ব্লাড ব্যাংক
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Desktop Quick Primary CTAs */}
            <button
              type="button"
              onClick={() => setShowRegisterDonorModal(true)}
              className="hidden md:inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-bold whitespace-nowrap shrink-0 transition"
            >
              <Heart className="w-4 h-4 text-red-600" />
              ডোনার নিবন্ধন
            </button>
            <button
              type="button"
              onClick={() => setShowPostRequestModal(true)}
              className="hidden sm:inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-sm whitespace-nowrap shrink-0 transition active:scale-[0.98]"
            >
              <PlusCircle className="w-4 h-4" />
              রক্তের আবেদন পোস্ট
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="বন্ধ করুন"
              className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition shrink-0"
            >
              <X className="w-5 h-5 stroke-[2.25]" />
            </button>
          </div>
        </header>

        {/* Navigation Tabs Strip */}
        <nav className="px-4 sm:px-6 py-2.5 bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3 overflow-x-auto no-scrollbar shrink-0">
          <div className="flex items-center gap-1.5">
            {(
              [
                {
                  id: 'requests',
                  label: 'জরুরি আবেদন',
                  count: requests.length,
                  icon: Droplet,
                },
                {
                  id: 'donors',
                  label: 'রক্তদাতা তালিকা',
                  count: donors.length,
                  icon: UserCheck,
                },
                {
                  id: 'guide',
                  label: 'ম্যাচিং ও যোগ্যতা',
                  count: null,
                  icon: Stethoscope,
                },
                {
                  id: 'banks',
                  label: 'ব্লাড ব্যাংক ও হটলাইন',
                  count: null,
                  icon: Building2,
                },
              ] as Array<{
                id: ActiveTab;
                label: string;
                count: number | null;
                icon: React.ComponentType<{ className?: string }>;
              }>
            ).map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`min-h-[40px] px-3.5 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition ${
                    isActive
                      ? 'bg-red-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{tab.label}</span>
                  {tab.count !== null && (
                    <span
                      className={`tabular-nums text-[11px] font-bold px-1.5 py-0.5 rounded-md ${
                        isActive
                          ? 'bg-red-700/80 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="hidden lg:flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 shrink-0 tabular-nums">
            <span>সক্রিয় জরুরি: <strong className="text-red-600 dark:text-red-400">{activeUrgentCount}</strong></span>
            <span>·</span>
            <span>সক্ষম ডোনার: <strong className="text-emerald-600 dark:text-emerald-400">{availableDonorsCount}</strong></span>
            <span>·</span>
            <span>ম্যানেজ হয়েছে: <strong className="text-slate-800 dark:text-slate-200">{managedCount}</strong></span>
          </div>
        </nav>

        {/* Main Workspace Body */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5 pb-24 sm:pb-8">
            {/* LEFT / MAIN WORKSPACE (8 Cols) */}
            <div className="lg:col-span-8 space-y-4">
              {/* Mobile Quick "My Blood Group" & Stats Strip */}
              <div className="lg:hidden bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    আমার রক্তের গ্রুপ (স্মার্ট ম্যাচিং)
                  </p>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate mt-0.5">
                    {myBloodGroup
                      ? `${myBloodGroup} — আপনার গ্রুপে ${compatibleUrgentMatchesCount}টি জরুরি আবেদন ম্যাচ করে`
                      : 'আপনার গ্রুপ সেট করে ম্যাচিং দেখুন'}
                  </p>
                </div>
                <select
                  aria-label="আমার রক্তের গ্রুপ"
                  value={myBloodGroup}
                  onChange={(e) => setMyBloodGroup(e.target.value as BloodGroupType | '')}
                  className="min-h-[40px] px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-red-600 dark:text-red-400 focus:outline-none focus:border-red-500 shrink-0"
                >
                  <option value="">বাছাই করুন</option>
                  {BLOOD_GROUP_LIST.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filter Panel (Shown on Requests & Donors tabs) */}
              {(activeTab === 'requests' || activeTab === 'donors') && (
                <section className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 space-y-3">
                  {/* Blood Group Bar */}
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 shrink-0 mr-1">
                      গ্রুপ:
                    </span>
                    {BLOOD_GROUPS_FILTER.map((grp) => {
                      const isSelected = selectedGroup === grp;
                      return (
                        <button
                          key={grp}
                          type="button"
                          onClick={() => setSelectedGroup(grp)}
                          className={`min-h-[36px] px-3 rounded-xl text-xs font-bold tabular-nums whitespace-nowrap shrink-0 transition ${
                            isSelected
                              ? 'bg-red-600 text-white shadow-sm'
                              : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                          }`}
                        >
                          {grp === 'ALL' ? 'সব গ্রুপ' : grp}
                        </button>
                      );
                    })}
                  </div>

                  {/* Division, 64 Districts, GPS, Search */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                    <div className="relative sm:col-span-5">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder={
                          activeTab === 'requests'
                            ? 'হাসপাতাল, রোগীর নাম বা এলাকা...'
                            : 'ডোনারের নাম বা এলাকা...'
                        }
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full min-h-[42px] pl-9 pr-3 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 focus:border-red-500 focus:outline-none"
                      />
                    </div>

                    <select
                      aria-label="বিভাগ নির্বাচন করুন"
                      value={selectedDivision}
                      onChange={(e) =>
                        setSelectedDivision(e.target.value as DivisionId | 'all')
                      }
                      className="sm:col-span-3 min-h-[42px] px-3 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 focus:border-red-500 focus:outline-none"
                    >
                      <option value="all">সকল বিভাগ (৮)</option>
                      {BD_DIVISIONS.map((div) => (
                        <option key={div.id} value={div.id}>
                          {div.nameBn}
                        </option>
                      ))}
                    </select>

                    <div className="sm:col-span-4 flex items-center gap-1.5">
                      <select
                        aria-label="জেলা নির্বাচন করুন"
                        value={selectedDistrict}
                        onChange={(e) => setSelectedDistrict(e.target.value)}
                        className="flex-1 min-h-[42px] px-3 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 focus:border-red-500 focus:outline-none"
                      >
                        <option value="সব জেলা">
                          সব জেলা ({availableDistrictOptions.length})
                        </option>
                        {availableDistrictOptions.map((dist) => (
                          <option key={dist.districtBn} value={dist.districtBn}>
                            {dist.districtBn}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={handleDetectGpsDistrict}
                        disabled={isGpsLocating}
                        title="জিপিএস দিয়ে কাছের জেলা শনাক্ত করুন"
                        className="min-h-[42px] px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1 whitespace-nowrap shrink-0 transition"
                      >
                        <Compass
                          className={`w-4 h-4 text-red-600 ${
                            isGpsLocating ? 'animate-spin' : ''
                          }`}
                        />
                        <span className="hidden sm:inline">জিপিএস</span>
                      </button>
                    </div>
                  </div>

                  {/* Secondary Filters for Requests */}
                  {activeTab === 'requests' && (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-1.5">
                        {(
                          [
                            { id: 'all', label: 'সব আবেদন' },
                            { id: 'urgent', label: 'জরুরি চলমান' },
                            { id: 'managed', label: 'ম্যানেজ হয়েছে' },
                          ] as const
                        ).map((st) => (
                          <button
                            key={st.id}
                            type="button"
                            onClick={() => setStatusFilter(st.id)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap shrink-0 transition ${
                              statusFilter === st.id
                                ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                          >
                            {st.label}
                          </button>
                        ))}
                      </div>

                      {myBloodGroup && (
                        <button
                          type="button"
                          onClick={() => setOnlyMyCompatible((v) => !v)}
                          className={`px-3 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition ${
                            onlyMyCompatible
                              ? 'bg-red-600 text-white'
                              : 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900'
                          }`}
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          আমার {myBloodGroup} গ্রুপে দিতে পারব ({compatibleUrgentMatchesCount})
                        </button>
                      )}
                    </div>
                  )}

                  {gpsStatusNote && (
                    <p className="text-[11px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      <span>{gpsStatusNote}</span>
                    </p>
                  )}
                </section>
              )}

              {/* ======================= TAB 1: EMERGENCY REQUESTS ======================= */}
              {activeTab === 'requests' && (
                <div className="space-y-4">
                  {filteredRequests.length === 0 ? (
                    <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-8 sm:p-10 text-center">
                      <div className="w-14 h-14 rounded-2xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto mb-3.5">
                        <Droplet className="w-7 h-7" />
                      </div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">
                        {requests.length === 0
                          ? 'এখনো কোনো রক্তের আবেদন নেই'
                          : 'নির্বাচিত ফিল্টারে কোনো আবেদন মেলেনি'}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 max-w-md mx-auto leading-relaxed">
                        জরুরি প্রয়োজনে রক্তের আবেদন পোস্ট করলে জেলার স্বেচ্ছাসেবী রক্তদাতারা সরাসরি কল, এসএমএস ও OSA চ্যাটে যোগাযোগ করতে পারবেন।
                      </p>
                      <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => setShowPostRequestModal(true)}
                          className="min-h-[44px] px-5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition"
                        >
                          <PlusCircle className="w-4 h-4" />
                          জরুরি রক্তের আবেদন করুন
                        </button>
                        {requests.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedGroup('ALL');
                              setSelectedDivision('all');
                              setSelectedDistrict('সব জেলা');
                              setStatusFilter('all');
                              setOnlyMyCompatible(false);
                              setSearchQuery('');
                            }}
                            className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 transition"
                          >
                            ফিল্টার রিসেট করুন
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    filteredRequests.map((req) => {
                      const isExpanded = !!expandedComments[req.id];
                      const isManaged = req.status === 'managed';
                      const isOwner = req.posterId === effectiveUserId;
                      const isCompatibleWithMe =
                        !!myBloodGroup &&
                        myCompatibleTargets.includes(req.bloodGroup as BloodGroupType);

                      const urgencyText = isManaged
                        ? 'ম্যানেজ হয়েছে'
                        : req.urgencyLevel === 'critical'
                          ? 'অতি জরুরি (এখনই)'
                          : req.urgencyLevel === 'today'
                            ? 'আজকের মধ্যে প্রয়োজন'
                            : 'নির্ধারিত সময়';

                      return (
                        <article
                          key={req.id}
                          className={`bg-white dark:bg-slate-900 rounded-2xl border transition overflow-hidden ${
                            isManaged
                              ? 'border-slate-200 dark:border-slate-800 opacity-85'
                              : 'border-slate-200/90 dark:border-slate-800 shadow-xs'
                          }`}
                        >
                          <div className="p-4 sm:p-5 space-y-4">
                            {/* Top Poster Meta + Status */}
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <OSAAvatar
                                  avatarUrl={req.posterAvatar}
                                  name={req.posterName}
                                  size="md"
                                />
                                <div className="min-w-0">
                                  <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                                    {req.posterName}
                                  </h4>
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 flex-wrap">
                                    <span>{formatRelativeTimeBn(req.createdAt)}</span>
                                    <span>·</span>
                                    <span>{req.district}</span>
                                    {isCompatibleWithMe && !isManaged && (
                                      <>
                                        <span>·</span>
                                        <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                                          আপনার {myBloodGroup} রক্ত ম্যাচ করে
                                        </span>
                                      </>
                                    )}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <span
                                  className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg whitespace-nowrap ${
                                    isManaged
                                      ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                                      : 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300'
                                  }`}
                                >
                                  {isManaged ? (
                                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                  ) : (
                                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                  )}
                                  {urgencyText}
                                </span>

                                {isOwner && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteRequest(req.id)}
                                    title="আবেদন মুছুন"
                                    className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Core Clinical Snapshot */}
                            <div className="flex items-start gap-3.5 pt-1">
                              {/* Blood Group Emblem */}
                              <div
                                className={`w-16 h-16 sm:w-[70px] sm:h-[70px] rounded-2xl flex flex-col items-center justify-center shrink-0 tabular-nums border ${
                                  isManaged
                                    ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'
                                    : 'bg-red-600 border-red-700 text-white shadow-sm'
                                }`}
                              >
                                <span className="text-xl sm:text-2xl font-black leading-none tracking-tight">
                                  {req.bloodGroup}
                                </span>
                                <span
                                  className={`text-[10px] font-bold mt-1 ${
                                    isManaged ? 'text-slate-500' : 'text-red-100'
                                  }`}
                                >
                                  {req.bagsNeeded} ব্যাগ
                                </span>
                              </div>

                              {/* Patient & Location Specs */}
                              <div className="flex-1 min-w-0 space-y-1.5">
                                <div className="flex flex-wrap items-baseline justify-between gap-2">
                                  <h3 className="text-base font-bold text-slate-900 dark:text-white leading-snug">
                                    রোগী: {req.patientName}
                                  </h3>
                                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                    {req.bloodComponent || 'Whole Blood'}
                                  </span>
                                </div>

                                <div className="text-xs text-slate-700 dark:text-slate-300 flex items-start gap-1.5">
                                  <Building2 className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                                  <span>
                                    <strong className="font-semibold">{req.hospital}</strong>
                                    {req.wardInfo ? ` · ${req.wardInfo}` : ''} — {req.area},{' '}
                                    {req.district}
                                  </span>
                                </div>

                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                                  <span className="inline-flex items-center gap-1">
                                    <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                    প্রয়োজন: <strong className="text-slate-800 dark:text-slate-200">{req.neededTime}</strong>
                                  </span>
                                  <a
                                    href={getGoogleMapsSearchUrl(
                                      `${req.hospital}, ${req.area}, ${req.district}, Bangladesh`
                                    )}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 hover:underline font-semibold"
                                  >
                                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                                    ম্যাপে হাসপাতাল দেখুন
                                  </a>
                                </div>

                                {req.notes && (
                                  <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 px-3 py-2 rounded-xl mt-2 leading-relaxed">
                                    {req.notes}
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Action Buttons Grid (Clean 44px touch targets) */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                              <a
                                href={`tel:${req.contactPhone}`}
                                className="min-h-[44px] px-3 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition"
                              >
                                <Phone className="w-3.5 h-3.5 shrink-0" />
                                সরাসরি কল
                              </a>

                              <button
                                type="button"
                                onClick={() =>
                                  handleStartOsaChat(
                                    req.posterId,
                                    req.posterName,
                                    `${req.bloodGroup} রক্ত (${req.patientName})`
                                  )
                                }
                                className="min-h-[44px] px-3 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition"
                              >
                                <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                                OSA চ্যাট
                              </button>

                              <a
                                href={`sms:${req.contactPhone}?body=${encodeURIComponent(
                                  `আসসালামু আলাইকুম, আপনার ${req.bloodGroup} রক্তের আবেদন দেখে যোগাযোগ করছি (${req.hospital})।`
                                )}`}
                                className="min-h-[44px] px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition"
                              >
                                <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                                এসএমএস
                              </a>

                              <button
                                type="button"
                                onClick={() => void handleShareEverywhere(req)}
                                className="min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition"
                              >
                                <Share2 className="w-3.5 h-3.5 shrink-0" />
                                শেয়ার ও পোস্টার
                              </button>
                            </div>

                            {/* Comments Toggle & Own Status Control */}
                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedComments((prev) => ({
                                    ...prev,
                                    [req.id]: !prev[req.id],
                                  }))
                                }
                                className="min-h-[36px] px-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold inline-flex items-center gap-1.5"
                              >
                                <MessageSquare className="w-3.5 h-3.5 text-red-600" />
                                <span className="tabular-nums">
                                  মন্তব্য ({req.comments.length})
                                </span>
                                {isExpanded ? (
                                  <ChevronUp className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                )}
                              </button>

                              {isOwner && (
                                <button
                                  type="button"
                                  onClick={() => handleToggleRequestStatus(req.id)}
                                  className="min-h-[36px] px-3 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 hover:text-emerald-700 dark:hover:text-emerald-300 inline-flex items-center gap-1.5 transition"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  {isManaged
                                    ? 'পুনরায় জরুরি চালু করুন'
                                    : 'ম্যানেজ হয়েছে চিহ্নিত করুন'}
                                </button>
                              )}
                            </div>

                            {/* Expandable Comments Section */}
                            {isExpanded && (
                              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                                {req.comments.length === 0 ? (
                                  <p className="text-xs text-slate-400">
                                    প্রথম মন্তব্য করে রোগীর পরিবারকে আশ্বস্ত করুন।
                                  </p>
                                ) : (
                                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                    {req.comments.map((comm) => (
                                      <div
                                        key={comm.id}
                                        className="flex items-start gap-2.5 text-xs bg-slate-50 dark:bg-slate-800/70 p-2.5 rounded-xl"
                                      >
                                        <OSAAvatar
                                          avatarUrl={comm.userAvatar}
                                          name={comm.userName}
                                          size="xs"
                                        />
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center justify-between gap-2">
                                            <span className="font-bold text-slate-900 dark:text-white truncate">
                                              {comm.userName}
                                            </span>
                                            <span className="text-[10px] text-slate-400 shrink-0">
                                              {formatRelativeTimeBn(comm.createdAt)}
                                            </span>
                                          </div>
                                          <p className="text-slate-700 dark:text-slate-300 mt-0.5">
                                            {comm.text}
                                          </p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* Quick Assurance Chips */}
                                <div className="flex flex-wrap gap-1.5">
                                  {[
                                    'আমি রক্ত দিতে আগ্রহী, কল করছি',
                                    'গ্রুপে শেয়ার করছি',
                                    'হাসপাতালে আসছি ইনশাআল্লাহ',
                                  ].map((quickText) => (
                                    <button
                                      key={quickText}
                                      type="button"
                                      onClick={() => handleAddComment(req.id, quickText)}
                                      className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-950/50 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:text-red-700 dark:hover:text-red-300 transition"
                                    >
                                      {quickText}
                                    </button>
                                  ))}
                                </div>

                                {/* Comment Input */}
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    placeholder="মন্তব্য লিখুন..."
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
                                    className="flex-1 min-h-[40px] px-3 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-red-500 text-slate-900 dark:text-white"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleAddComment(req.id)}
                                    className="min-h-[40px] px-3.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1 shrink-0 transition"
                                  >
                                    <Send className="w-3.5 h-3.5" />
                                    পাঠান
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              )}

              {/* ======================= TAB 2: DONORS DIRECTORY ======================= */}
              {activeTab === 'donors' && (
                <div className="space-y-4">
                  {filteredDonors.length === 0 ? (
                    <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-8 sm:p-10 text-center">
                      <div className="w-14 h-14 rounded-2xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto mb-3.5">
                        <Heart className="w-7 h-7" />
                      </div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">
                        {donors.length === 0
                          ? 'এখনো কোনো স্বেচ্ছাসেবী ডোনার যুক্ত হননি'
                          : 'এই ফিল্টারে কোনো রক্তদাতা পাওয়া যায়নি'}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 max-w-md mx-auto leading-relaxed">
                        স্বেচ্ছাসেবী রক্তদাতা হিসেবে নাম যুক্ত করুন — ডিজিটাল ডোনার আইডি কার্ড পাবেন এবং বিপদের সময় মানুষ সহজেই আপনার সাথে যোগাযোগ করতে পারবে।
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowRegisterDonorModal(true)}
                        className="mt-5 min-h-[44px] px-5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition"
                      >
                        <Heart className="w-4 h-4 fill-white" />
                        স্বেচ্ছাসেবী ডোনার হিসেবে যুক্ত হন
                      </button>
                    </div>
                  ) : (
                    filteredDonors.map((donor) => {
                      const readiness = calculateDonorReadiness(donor.lastDonatedDate);
                      const isReadyNow = donor.isAvailable && readiness.isReady;
                      const isOwnDonor =
                        donor.userId === effectiveUserId ||
                        (currentUser?.phone && donor.phone === currentUser.phone);

                      return (
                        <article
                          key={donor.id}
                          className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-start gap-3.5 min-w-0">
                              <OSAAvatar
                                avatarUrl={donor.avatarUrl}
                                name={donor.name}
                                size="lg"
                              />
                              <div className="min-w-0 space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="text-base font-bold text-slate-900 dark:text-white truncate">
                                    {donor.name}
                                  </h4>
                                  <span className="text-xs font-black px-2 py-0.5 rounded-lg bg-red-600 text-white tabular-nums">
                                    {donor.bloodGroup}
                                  </span>
                                </div>

                                <p className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                                  <MapPin className="w-3.5 h-3.5 text-red-600 shrink-0" />
                                  <span>
                                    {donor.area}, {donor.district}
                                  </span>
                                </p>

                                <p className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-1 tabular-nums">
                                  <span
                                    className={`font-bold ${
                                      isReadyNow
                                        ? 'text-emerald-600 dark:text-emerald-400'
                                        : 'text-amber-600 dark:text-amber-400'
                                    }`}
                                  >
                                    {donor.isAvailable
                                      ? readiness.labelBn
                                      : 'সাময়িক বিরতিতে আছেন'}
                                  </span>
                                  <span>·</span>
                                  <span>মোট রক্তদান: {donor.totalDonations} বার</span>
                                  <span>·</span>
                                  <span>শেষ দান: {donor.lastDonated}</span>
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0 flex-wrap">
                              <a
                                href={`tel:${donor.phone}`}
                                className="min-h-[44px] px-3.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition"
                              >
                                <Phone className="w-3.5 h-3.5" />
                                কল করুন
                              </a>
                              <button
                                type="button"
                                onClick={() =>
                                  handleStartOsaChat(
                                    donor.userId || donor.id,
                                    donor.name,
                                    `${donor.bloodGroup} রক্তদান সহায়তা`
                                  )
                                }
                                className="min-h-[44px] px-3.5 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                                OSA চ্যাট
                              </button>
                              <a
                                href={`sms:${donor.phone}?body=${encodeURIComponent(
                                  `আসসালামু আলাইকুম ${donor.name}, আমাদের জরুরি ${donor.bloodGroup} রক্তের প্রয়োজন (${donor.district})। অনুগ্রহ করে সাহায্য করতে পারবেন?`
                                )}`}
                                className="min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                                এসএমএস
                              </a>
                            </div>
                          </div>

                          {/* Donor Management Strip for Own Profile */}
                          {isOwnDonor && (
                            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleRecordDonationToday(donor.id)}
                                  className="min-h-[38px] px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition"
                                >
                                  <Award className="w-3.5 h-3.5" />
                                  আজ রক্ত দিয়েছি (+১)
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleToggleDonorAvailability(donor.id)}
                                  className="min-h-[38px] px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold whitespace-nowrap shrink-0 transition"
                                >
                                  {donor.isAvailable ? 'বিরতিতে যান' : 'সক্রিয় করুন'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDonorIdCardTarget(donor)}
                                  className="min-h-[38px] px-3 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition"
                                >
                                  <IdCard className="w-3.5 h-3.5" />
                                  ডোনার আইডি কার্ড
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDeleteDonor(donor.id)}
                                className="min-h-[38px] px-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 inline-flex items-center gap-1 transition"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                সরান
                              </button>
                            </div>
                          )}
                        </article>
                      );
                    })
                  )}
                </div>
              )}

              {/* ======================= TAB 3: COMPATIBILITY & ELIGIBILITY ======================= */}
              {activeTab === 'guide' && (
                <div className="space-y-5">
                  {/* Interactive Blood Compatibility Matrix */}
                  <section className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 space-y-4">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <Activity className="w-4 h-4 text-red-600" />
                        রক্তের গ্রুপ ম্যাচিং ম্যাট্রিক্স
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        যেকোনো গ্রুপ নির্বাচন করে দেখুন কাদের রক্ত দিতে পারবেন এবং কাদের থেকে নিতে পারবেন
                      </p>
                    </div>

                    <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                      {BLOOD_GROUP_LIST.map((grp) => {
                        const isSelected = matrixGroup === grp;
                        return (
                          <button
                            key={grp}
                            type="button"
                            onClick={() => setMatrixGroup(grp)}
                            className={`min-h-[46px] rounded-xl text-sm font-black tabular-nums transition ${
                              isSelected
                                ? 'bg-red-600 text-white shadow-sm'
                                : 'bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:border-red-300'
                            }`}
                          >
                            {grp}
                          </button>
                        );
                      })}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700 space-y-2.5">
                        <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                          <ArrowRight className="w-3.5 h-3.5" />
                          {matrixGroup} যাদের রক্ত দিতে পারবেন ({matrixInfo.canDonateTo.length}টি গ্রুপ)
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {matrixInfo.canDonateTo.map((target) => (
                            <span
                              key={target}
                              className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-black text-slate-900 dark:text-white tabular-nums"
                            >
                              {target}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700 space-y-2.5">
                        <p className="text-xs font-bold text-red-700 dark:text-red-400 flex items-center gap-1.5">
                          <Droplet className="w-3.5 h-3.5" />
                          {matrixGroup} যাদের থেকে রক্ত নিতে পারবেন ({matrixInfo.canReceiveFrom.length}টি গ্রুপ)
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {matrixInfo.canReceiveFrom.map((source) => (
                            <span
                              key={source}
                              className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-black text-slate-900 dark:text-white tabular-nums"
                            >
                              {source}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <p className="text-xs text-slate-700 dark:text-slate-300 bg-red-50/70 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 rounded-xl p-3 leading-relaxed">
                      {matrixInfo.noteBn}
                    </p>
                  </section>

                  {/* Pre-Donation Eligibility Self Check */}
                  <section className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          <ShieldCheck className="w-4 h-4 text-red-600" />
                          রক্তদানের যোগ্যতা যাচাই (সেল্ফ-চেক)
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          নিচের ৬টি সাধারণ স্বাস্থ্য শর্ত যাচাই করে দেখে নিন আপনি আজ রক্তদান করতে পারবেন কি না
                        </p>
                      </div>
                      <span
                        className={`text-xs font-bold px-3 py-1 rounded-lg tabular-nums ${
                          isEligibleToday
                            ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                            : 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {passedQuestionsCount}/{ELIGIBILITY_QUESTIONS.length} শর্ত পূরণ
                      </span>
                    </div>

                    <div className="space-y-2">
                      {ELIGIBILITY_QUESTIONS.map((q) => {
                        const isYes = !!eligibilityAnswers[q.id];
                        return (
                          <div
                            key={q.id}
                            className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between gap-3"
                          >
                            <span className="text-xs font-medium text-slate-800 dark:text-slate-200 leading-snug">
                              {q.label}
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() =>
                                  setEligibilityAnswers((prev) => ({
                                    ...prev,
                                    [q.id]: true,
                                  }))
                                }
                                className={`min-h-[34px] px-3 rounded-lg text-xs font-bold transition ${
                                  isYes
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                                }`}
                              >
                                হ্যাঁ
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setEligibilityAnswers((prev) => ({
                                    ...prev,
                                    [q.id]: false,
                                  }))
                                }
                                className={`min-h-[34px] px-3 rounded-lg text-xs font-bold transition ${
                                  !isYes
                                    ? 'bg-red-600 text-white'
                                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                                }`}
                              >
                                না
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div
                      className={`p-4 rounded-xl border text-xs leading-relaxed ${
                        isEligibleToday
                          ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900 text-emerald-900 dark:text-emerald-200'
                          : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200'
                      }`}
                    >
                      {isEligibleToday ? (
                        <p className="font-semibold">
                          আপনি প্রাথমিক মানদণ্ড অনুযায়ী আজই রক্তদানে সক্ষম। রক্তদানের ৩০ মিনিট আগে অন্তত ২ গ্লাস পানি ও হালকা পুষ্টিকর খাবার গ্রহণ করুন এবং রক্তদানের পর ১৫ মিনিট বিশ্রাম নিন।
                        </p>
                      ) : (
                        <p className="font-semibold">
                          বর্তমানে কিছুদিন বিশ্রাম নেওয়ার পরামর্শ রইল। জরুরি ক্ষেত্রে হাসপাতালের ব্লাড ব্যাংকের দায়িত্বরত চিকিৎসকের পরামর্শ নিন।
                        </p>
                      )}
                    </div>
                  </section>
                </div>
              )}

              {/* ======================= TAB 4: BLOOD BANKS & HOTLINES ======================= */}
              {activeTab === 'banks' && (
                <div className="space-y-5">
                  {/* National Emergency Helplines */}
                  <section className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 space-y-3.5">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <PhoneCall className="w-4 h-4 text-red-600" />
                      বাংলাদেশ জাতীয় জরুরি স্বাস্থ্য ও অ্যাম্বুলেন্স হটলাইন
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-slate-900 dark:text-white">
                            ৯৯৯ — জাতীয় জরুরি সেবা
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            ফ্রি কল · জরুরি অ্যাম্বুলেন্স, পুলিশ ও উদ্ধার সহায়তা (২৪/৭)
                          </p>
                        </div>
                        <a
                          href="tel:999"
                          className="min-h-[42px] px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shrink-0"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          ৯৯৯
                        </a>
                      </div>

                      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-slate-900 dark:text-white">
                            ১৬২৬৩ — স্বাস্থ্য বাতায়ন
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            স্বাস্থ্য অধিদপ্তরের ২৪/৭ সরকারি চিকিৎসক ও হাসপাতাল তথ্য সেবা
                          </p>
                        </div>
                        <a
                          href="tel:16263"
                          className="min-h-[42px] px-4 rounded-xl bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-1.5 shrink-0"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          ১৬২৬৩
                        </a>
                      </div>
                    </div>

                    {/* Trusted National Voluntary Networks Quick Maps Search */}
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-2">
                      {[
                        { label: 'সন্ধানী ব্লাড ব্যাংক (নিকটস্থ)', q: 'Sandhani Blood Bank Bangladesh' },
                        { label: 'রেড ক্রিসেন্ট ব্লাড সেন্টার', q: 'Bangladesh Red Crescent Blood Bank' },
                        { label: 'কোয়ান্টাম ল্যাব', q: 'Quantum Blood Lab Bangladesh' },
                        { label: 'বাঁধন (বিশ্ববিদ্যালয় শাখা)', q: 'Badhan Blood Donor Bangladesh' },
                      ].map((org) => (
                        <a
                          key={org.label}
                          href={getGoogleMapsSearchUrl(org.q)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-h-[38px] px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-red-400 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 transition"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-red-600 shrink-0" />
                          {org.label}
                        </a>
                      ))}
                    </div>
                  </section>

                  {/* Live Nearby Hospitals & Blood Banks via OpenStreetMap Overpass + Nominatim */}
                  <section className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-red-600" />
                          কাছের হাসপাতাল ও ব্লাড ব্যাংক খুঁজুন
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {centersSearchedDistrict
                            ? `ফলাফল দেখানো হচ্ছে: ${centersSearchedDistrict}`
                            : 'জিপিএস, জেলা বা এলাকার নাম দিয়ে নিকটস্থ হাসপাতাল ও ব্লাড ব্যাংক খুঁজুন'}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={handleGpsLoadNearbyCenters}
                        disabled={isGpsLocating || isLoadingCenters}
                        className="min-h-[40px] px-3.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition"
                      >
                        <Compass
                          className={`w-4 h-4 text-red-600 ${
                            isGpsLocating ? 'animate-spin' : ''
                          }`}
                        />
                        আমার লোকেশন (GPS)
                      </button>
                    </div>

                    {/* Search Bar + 64 District Selector */}
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                      <div className="relative sm:col-span-6">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder="এলাকা, হাসপাতাল বা ব্লাড ব্যাংকের নাম (যেমন: বিরামপুর, সন্ধানী)..."
                          value={centerSearchInput}
                          onChange={(e) => setCenterSearchInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void handleLoadNearbyCenters({ customQuery: centerSearchInput });
                            }
                          }}
                          className="w-full min-h-[42px] pl-9 pr-3 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 focus:border-red-500 focus:outline-none"
                        />
                      </div>

                      <select
                        aria-label="ব্লাড ব্যাংক খোঁজার জেলা"
                        value={selectedDistrict === 'সব জেলা' ? 'ঢাকা' : selectedDistrict}
                        onChange={(e) => {
                          setSelectedDistrict(e.target.value);
                          setCenterSearchInput('');
                          void handleLoadNearbyCenters({
                            overrideDistrict: e.target.value,
                            customQuery: '',
                          });
                        }}
                        className="sm:col-span-4 min-h-[42px] px-3 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:border-red-500 focus:outline-none"
                      >
                        {ALL_BD_DISTRICTS.map((d) => (
                          <option key={d.districtBn} value={d.districtBn}>
                            {d.districtBn}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() =>
                          void handleLoadNearbyCenters({ customQuery: centerSearchInput })
                        }
                        disabled={isLoadingCenters}
                        className="sm:col-span-2 min-h-[42px] px-3.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition"
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 ${
                            isLoadingCenters ? 'animate-spin' : ''
                          }`}
                        />
                        খুঁজুন
                      </button>
                    </div>

                    {/* Category Filter Chips */}
                    {nearbyCenters.length > 0 && (
                      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                        {(
                          [
                            {
                              id: 'all',
                              label: 'সবগুলো',
                              count: nearbyCenters.length,
                            },
                            {
                              id: 'blood_bank',
                              label: 'ব্লাড ব্যাংক',
                              count: nearbyCenters.filter((c) => c.type === 'blood_bank').length,
                            },
                            {
                              id: 'hospital',
                              label: 'হাসপাতাল',
                              count: nearbyCenters.filter((c) => c.type === 'hospital').length,
                            },
                            {
                              id: 'clinic',
                              label: 'ক্লিনিক ও ডক্টর',
                              count: nearbyCenters.filter((c) => c.type === 'clinic').length,
                            },
                          ] as const
                        ).map((cat) => (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => setCenterTypeFilter(cat.id)}
                            className={`min-h-[34px] px-3 rounded-xl text-[11px] font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition tabular-nums ${
                              centerTypeFilter === cat.id
                                ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                            }`}
                          >
                            <span>{cat.label}</span>
                            <span className="opacity-75">({cat.count})</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {isLoadingCenters ? (
                      <div className="py-10 text-center space-y-2">
                        <RefreshCw className="w-6 h-6 text-red-600 animate-spin mx-auto" />
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          নিকটস্থ হাসপাতাল ও ব্লাড ব্যাংকের তথ্য সংগ্রহ করা হচ্ছে...
                        </p>
                      </div>
                    ) : centersError && nearbyCenters.length === 0 ? (
                      <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-800/70 text-center space-y-3">
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                          {centersError}
                        </p>
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          <a
                            href={getGoogleMapsSearchUrl(
                              `blood bank near ${
                                centerSearchInput.trim() ||
                                (selectedDistrict === 'সব জেলা' ? 'Bangladesh' : selectedDistrict)
                              }`
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="min-h-[40px] px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold inline-flex items-center gap-1.5"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            ব্লাড ব্যাংক (Google Maps)
                          </a>
                          <a
                            href={getGoogleMapsSearchUrl(
                              `hospital near ${
                                centerSearchInput.trim() ||
                                (selectedDistrict === 'সব জেলা' ? 'Bangladesh' : selectedDistrict)
                              }`
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="min-h-[40px] px-4 rounded-xl bg-slate-900 dark:bg-slate-700 text-white text-xs font-bold inline-flex items-center gap-1.5"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            হাসপাতাল (Google Maps)
                          </a>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                          {nearbyCenters
                            .filter(
                              (c) => centerTypeFilter === 'all' || c.type === centerTypeFilter
                            )
                            .map((center) => (
                              <div
                                key={center.id}
                                className="py-3.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                              >
                                <div className="min-w-0 space-y-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span
                                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0 ${
                                        center.type === 'blood_bank'
                                          ? 'bg-red-600 text-white'
                                          : center.type === 'hospital'
                                            ? 'bg-slate-900 dark:bg-slate-700 text-white'
                                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                                      }`}
                                    >
                                      {center.type === 'blood_bank'
                                        ? 'ব্লাড ব্যাংক'
                                        : center.type === 'hospital'
                                          ? 'হাসপাতাল'
                                          : 'ক্লিনিক'}
                                    </span>
                                    <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white leading-snug">
                                      {center.name}
                                    </h4>
                                    {center.hasEmergency && (
                                      <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                                        · জরুরি বিভাগ
                                      </span>
                                    )}
                                  </div>

                                  <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                                    দূরত্ব ~{center.distanceKm} কি.মি.
                                    {center.address ? ` · ${center.address}` : ''}
                                    {center.openingHours ? ` · সময়: ${center.openingHours}` : ''}
                                  </p>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  {center.phone && (
                                    <a
                                      href={`tel:${center.phone}`}
                                      className="min-h-[38px] px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1 whitespace-nowrap"
                                    >
                                      <Phone className="w-3.5 h-3.5" />
                                      কল
                                    </a>
                                  )}
                                  <a
                                    href={`https://www.google.com/maps/dir/?api=1&destination=${center.lat},${center.lng}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="min-h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
                                  >
                                    <MapPin className="w-3.5 h-3.5 text-red-600" />
                                    পথ দেখুন
                                  </a>
                                </div>
                              </div>
                            ))}
                        </div>

                        {/* Quick Google Maps Deep Links */}
                        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            আরও বিস্তারিত লাইভ ম্যাপ দেখতে:
                          </span>
                          <div className="flex flex-wrap gap-2">
                            <a
                              href={getGoogleMapsSearchUrl(
                                `blood bank near ${
                                  centerSearchInput.trim() ||
                                  (selectedDistrict === 'সব জেলা' ? 'Bangladesh' : selectedDistrict)
                                }`
                              )}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="min-h-[34px] px-3 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-[11px] font-bold inline-flex items-center gap-1 hover:underline"
                            >
                              <ExternalLink className="w-3 h-3" />
                              Google Maps-এ ব্লাড ব্যাংক
                            </a>
                            <a
                              href={getGoogleMapsSearchUrl(
                                `hospital near ${
                                  centerSearchInput.trim() ||
                                  (selectedDistrict === 'সব জেলা' ? 'Bangladesh' : selectedDistrict)
                                }`
                              )}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="min-h-[34px] px-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-bold inline-flex items-center gap-1 hover:underline"
                            >
                              <ExternalLink className="w-3 h-3" />
                              Google Maps-এ হাসপাতাল
                            </a>
                          </div>
                        </div>
                      </>
                    )}
                  </section>
                </div>
              )}
            </div>

            {/* RIGHT SIDEBAR COMPANION (Desktop 4 Cols) */}
            <aside className="hidden lg:block lg:col-span-4 space-y-4">
              <div className="sticky top-6 space-y-4">
                {/* Smart Personal Blood Profile Card */}
                <section className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      আমার রক্তের প্রোফাইল
                    </h3>
                    {myBloodGroup && (
                      <span className="px-2.5 py-1 rounded-lg bg-red-600 text-white text-xs font-black tabular-nums">
                        {myBloodGroup}
                      </span>
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                      আপনার রক্তের গ্রুপ নির্বাচন করুন
                    </label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {BLOOD_GROUP_LIST.map((grp) => (
                        <button
                          key={grp}
                          type="button"
                          onClick={() =>
                            setMyBloodGroup((prev) => (prev === grp ? '' : grp))
                          }
                          className={`min-h-[36px] rounded-xl text-xs font-bold tabular-nums transition ${
                            myBloodGroup === grp
                              ? 'bg-red-600 text-white shadow-xs'
                              : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-red-300'
                          }`}
                        >
                          {grp}
                        </button>
                      ))}
                    </div>
                  </div>

                  {myBloodGroup ? (
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 space-y-2">
                      <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
                        আপনি{' '}
                        <strong className="text-red-600 dark:text-red-400">
                          {myCompatibleTargets.join(', ')}
                        </strong>{' '}
                        গ্রুপের রোগীদের রক্ত দিতে পারবেন।
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('requests');
                          setOnlyMyCompatible(true);
                        }}
                        className="w-full min-h-[38px] rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition tabular-nums"
                      >
                        ম্যাচিং জরুরি আবেদন দেখুন ({compatibleUrgentMatchesCount})
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      আপনার গ্রুপ বাছাই করলে সাথে সাথে দেখতে পারবেন কোন রোগীদের আপনি রক্ত দিয়ে সাহায্য করতে পারবেন।
                    </p>
                  )}

                  {myDonorListing && (
                    <button
                      type="button"
                      onClick={() => setDonorIdCardTarget(myDonorListing)}
                      className="w-full min-h-[42px] rounded-xl border border-red-200 dark:border-red-900 bg-red-50/70 dark:bg-red-950/30 hover:bg-red-100/80 dark:hover:bg-red-950/60 text-red-700 dark:text-red-300 text-xs font-bold flex items-center justify-center gap-2 transition"
                    >
                      <IdCard className="w-4 h-4" />
                      আমার ডিজিটাল ডোনার আইডি কার্ড
                    </button>
                  )}
                </section>

                {/* Live Impact Summary */}
                <section className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 space-y-3">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    নেটওয়ার্ক সারসংক্ষেপ
                  </h3>
                  <div className="grid grid-cols-3 gap-2 text-center tabular-nums">
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70">
                      <p className="text-lg font-black text-red-600 dark:text-red-400">
                        {activeUrgentCount}
                      </p>
                      <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        চলমান জরুরি
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70">
                      <p className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                        {availableDonorsCount}
                      </p>
                      <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        সক্ষম ডোনার
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70">
                      <p className="text-lg font-black text-slate-900 dark:text-white">
                        {managedCount}
                      </p>
                      <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        সফল সংগ্রহ
                      </p>
                    </div>
                  </div>
                </section>

                {/* Safety Notice */}
                <section className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 space-y-2.5">
                  <div className="flex items-center gap-2 text-slate-900 dark:text-white">
                    <ShieldCheck className="w-4 h-4 text-red-600 shrink-0" />
                    <h4 className="text-xs font-bold">নিরাপদ রক্তদান নির্দেশিকা</h4>
                  </div>
                  <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1.5 leading-relaxed">
                    <li>• রক্ত সম্পূর্ণ মানবিক সেবা — কোনো ধরনের অর্থ লেনদেন করবেন না।</li>
                    <li>• রক্ত দেওয়ার আগে হাসপাতালের নির্ধারিত ক্রস-ম্যাচিং ও স্ক্রিনিং নিশ্চিত করুন।</li>
                    <li>• দুবার রক্তদানের মাঝে কমপক্ষে ১২০ দিন (৪ মাস) বিরতি রাখুন।</li>
                  </ul>
                </section>
              </div>
            </aside>
          </div>
        </div>

        {/* Mobile Bottom Ergonomic Thumb Action Bar (Slim height <10% viewport) */}
        <div className="sm:hidden px-4 py-2.5 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowRegisterDonorModal(true)}
            className="flex-1 min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            <Heart className="w-4 h-4 text-red-600" />
            ডোনার হোন
          </button>
          <button
            type="button"
            onClick={() => setShowPostRequestModal(true)}
            className="flex-[1.3] min-h-[44px] rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap shadow-sm"
          >
            <PlusCircle className="w-4 h-4" />
            রক্তের আবেদন পোস্ট
          </button>
        </div>
      </div>

      {/* ================= SUB-MODAL 1: POST BLOOD REQUEST ================= */}
      {showPostRequestModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-3 sm:p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Droplet className="w-5 h-5 text-red-600" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  জরুরি রক্তের আবেদন পোস্ট করুন
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPostRequestModal(false)}
                className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition"
              >
                <X className="w-5 h-5 stroke-[2.25]" />
              </button>
            </div>

            <form
              onSubmit={handlePostBloodRequest}
              className="p-5 space-y-3.5 overflow-y-auto text-xs"
            >
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  রোগীর নাম / সংক্ষিপ্ত পরিচয় *
                </label>
                <input
                  required
                  type="text"
                  placeholder="যেমন: মোছা. রহিমা বেগম (অপারেশন)"
                  value={reqPatientName}
                  onChange={(e) => setReqPatientName(e.target.value)}
                  className="w-full min-h-[42px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:border-red-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    রক্তের গ্রুপ *
                  </label>
                  <select
                    value={reqBloodGroup}
                    onChange={(e) => setReqBloodGroup(e.target.value as BloodGroupType)}
                    className="w-full min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold text-red-600 dark:text-red-400"
                  >
                    {BLOOD_GROUP_LIST.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    প্রয়োজনীয় ব্যাগ *
                  </label>
                  <input
                    required
                    type="number"
                    min={1}
                    max={15}
                    value={reqBags}
                    onChange={(e) => setReqBags(Number(e.target.value))}
                    className="w-full min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white tabular-nums"
                  />
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    রক্তের ধরন
                  </label>
                  <select
                    value={reqBloodComponent}
                    onChange={(e) =>
                      setReqBloodComponent(e.target.value as BloodComponentType)
                    }
                    className="w-full min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  >
                    {BLOOD_COMPONENTS.map((comp) => (
                      <option key={comp} value={comp}>
                        {comp}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    হাসপাতালের নাম *
                  </label>
                  <input
                    required
                    type="text"
                    placeholder="যেমন: ঢাকা মেডিকেল কলেজ হাসপাতাল"
                    value={reqHospital}
                    onChange={(e) => setReqHospital(e.target.value)}
                    className="w-full min-h-[42px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    ওয়ার্ড / বেড (ঐচ্ছিক)
                  </label>
                  <input
                    type="text"
                    placeholder="যেমন: কেবিন ১২ / জরুরি বিভাগ"
                    value={reqWardInfo}
                    onChange={(e) => setReqWardInfo(e.target.value)}
                    className="w-full min-h-[42px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    জেলা *
                  </label>
                  <select
                    value={reqDistrict}
                    onChange={(e) => setReqDistrict(e.target.value)}
                    className="w-full min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  >
                    {ALL_BD_DISTRICTS.map((d) => (
                      <option key={d.districtBn} value={d.districtBn}>
                        {d.districtBn}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    উপজেলা / এলাকা *
                  </label>
                  <input
                    required
                    type="text"
                    placeholder="যেমন: শাহবাগ / বিরামপুর"
                    value={reqArea}
                    onChange={(e) => setReqArea(e.target.value)}
                    className="w-full min-h-[42px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    জরুরি পর্যায়
                  </label>
                  <select
                    value={reqUrgency}
                    onChange={(e) => setReqUrgency(e.target.value as UrgencyLevel)}
                    className="w-full min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  >
                    <option value="critical">অতি জরুরি (এখনই)</option>
                    <option value="today">আজকের মধ্যে</option>
                    <option value="scheduled">নির্ধারিত তারিখ</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    কখন প্রয়োজন *
                  </label>
                  <input
                    required
                    type="text"
                    placeholder="যেমন: আজ বিকাল ৫টার আগে"
                    value={reqNeededTime}
                    onChange={(e) => setReqNeededTime(e.target.value)}
                    className="w-full min-h-[42px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  যোগাযোগের মোবাইল নম্বর *
                </label>
                <input
                  required
                  type="tel"
                  placeholder="+8801XXXXXXXXX"
                  value={reqPhone}
                  onChange={(e) => setReqPhone(e.target.value)}
                  className="w-full min-h-[42px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white tabular-nums"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  রোগীর অবস্থা / বিশেষ নোট
                </label>
                <textarea
                  rows={2}
                  placeholder="যেমন: থ্যালাসেমিয়া রোগী বা ডেলিভারি অপারেশন। যাতায়াত খরচ দেওয়া হবে।"
                  value={reqNotes}
                  onChange={(e) => setReqNotes(e.target.value)}
                  className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white resize-none"
                />
              </div>

              <button
                type="submit"
                className="w-full min-h-[46px] rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm shadow-sm transition active:scale-[0.99]"
              >
                জরুরি রক্তের আবেদন প্রকাশ করুন
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ================= SUB-MODAL 2: REGISTER DONOR ================= */}
      {showRegisterDonorModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-3 sm:p-4">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Heart className="w-5 h-5 text-red-600 fill-red-600" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  স্বেচ্ছাসেবী রক্তদাতা নিবন্ধন
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRegisterDonorModal(false)}
                className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition"
              >
                <X className="w-5 h-5 stroke-[2.25]" />
              </button>
            </div>

            {regSuccess ? (
              <div className="p-8 text-center space-y-3">
                <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
                <h4 className="text-base font-bold text-slate-900 dark:text-white">
                  নিবন্ধন সম্পন্ন হয়েছে!
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  আপনার স্বেচ্ছাসেবী রক্তদাতা প্রোফাইল ও ডিজিটাল আইডি কার্ড তৈরি করা হয়েছে।
                </p>
              </div>
            ) : (
              <form
                onSubmit={handleRegisterDonor}
                className="p-5 space-y-3.5 overflow-y-auto text-xs"
              >
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    আপনার পূর্ণ নাম *
                  </label>
                  <input
                    required
                    type="text"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    className="w-full min-h-[42px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      রক্তের গ্রুপ *
                    </label>
                    <select
                      value={regGroup}
                      onChange={(e) => setRegGroup(e.target.value as BloodGroupType)}
                      className="w-full min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold text-red-600 dark:text-red-400"
                    >
                      {BLOOD_GROUP_LIST.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      জেলা *
                    </label>
                    <select
                      value={regDistrict}
                      onChange={(e) => setRegDistrict(e.target.value)}
                      className="w-full min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    >
                      {ALL_BD_DISTRICTS.map((d) => (
                        <option key={d.districtBn} value={d.districtBn}>
                          {d.districtBn}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    বর্তমান এলাকা / উপজেলা *
                  </label>
                  <input
                    required
                    type="text"
                    placeholder="যেমন: উত্তরা / কলেজ বাজার, বিরামপুর"
                    value={regArea}
                    onChange={(e) => setRegArea(e.target.value)}
                    className="w-full min-h-[42px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    মোবাইল নম্বর *
                  </label>
                  <input
                    required
                    type="tel"
                    placeholder="+8801XXXXXXXXX"
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    className="w-full min-h-[42px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white tabular-nums"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      সর্বশেষ রক্তদানের তারিখ
                    </label>
                    <input
                      type="date"
                      max={new Date().toISOString().slice(0, 10)}
                      value={regLastDonatedDate}
                      onChange={(e) => setRegLastDonatedDate(e.target.value)}
                      className="w-full min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      মোট রক্তদান (বার)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={regTotalDonations}
                      onChange={(e) => setRegTotalDonations(Number(e.target.value))}
                      className="w-full min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white tabular-nums"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full min-h-[46px] rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm shadow-sm transition active:scale-[0.99]"
                >
                  নিবন্ধন সম্পন্ন করুন
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ================= SUB-MODAL 3: SHARE & APPEAL POSTER ================= */}
      {shareTargetRequest && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-3 sm:p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Share2 className="w-4 h-4 text-red-600" />
                রক্তের আবেদন ও পোস্টার শেয়ার করুন
              </h3>
              <button
                type="button"
                onClick={() => setShareTargetRequest(null)}
                className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition"
              >
                <X className="w-5 h-5 stroke-[2.25]" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              {/* Generated Poster Image Preview */}
              {sharePosterUrl && (
                <div className="space-y-2">
                  <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                    <img
                      src={sharePosterUrl}
                      alt={`জরুরি ${shareTargetRequest.bloodGroup} রক্তের পোস্টার`}
                      className="w-full max-h-64 object-contain mx-auto"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        handleDownloadDataUrl(
                          sharePosterUrl,
                          `osa-blood-sos-${shareTargetRequest.bloodGroup}.png`
                        )
                      }
                      className="flex-1 min-h-[42px] px-3 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center justify-center gap-1.5"
                    >
                      <Download className="w-4 h-4" />
                      পোস্টার ডাউনলোড (PNG)
                    </button>
                    {typeof navigator !== 'undefined' &&
                      typeof navigator.share === 'function' && (
                        <button
                          type="button"
                          onClick={() => void handleNativeShareWithPoster(shareTargetRequest)}
                          className="flex-1 min-h-[42px] px-3 rounded-xl bg-slate-900 dark:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-1.5"
                        >
                          <Share2 className="w-4 h-4" />
                          অ্যাপে শেয়ার করুন
                        </button>
                      )}
                  </div>
                </div>
              )}

              {/* Shareable Text & Copy */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  টেক্সট মেসেজ কপি বা সোশ্যাল মিডিয়ায় পাঠান:
                </p>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-line max-h-36 overflow-y-auto">
                  {getFormattedShareText(shareTargetRequest)}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopyShareText(shareTargetRequest)}
                    className={`min-h-[42px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                      copySuccess
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {copySuccess ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                    {copySuccess ? 'কপি হয়েছে!' : 'তথ্য কপি করুন'}
                  </button>

                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(
                      getFormattedShareText(shareTargetRequest)
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[42px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5"
                  >
                    <ExternalLink className="w-4 h-4" />
                    WhatsApp
                  </a>

                  <a
                    href={`https://t.me/share/url?url=${encodeURIComponent(
                      window.location.href
                    )}&text=${encodeURIComponent(
                      getFormattedShareText(shareTargetRequest)
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[42px] rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold flex items-center justify-center gap-1.5"
                  >
                    <Send className="w-4 h-4" />
                    Telegram
                  </a>

                  <a
                    href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
                      window.location.href
                    )}&quote=${encodeURIComponent(
                      getFormattedShareText(shareTargetRequest)
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[42px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center justify-center gap-1.5"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Facebook
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= SUB-MODAL 4: DIGITAL DONOR ID CARD ================= */}
      {donorIdCardTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-3 sm:p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <IdCard className="w-4 h-4 text-red-600" />
                ডিজিটাল স্বেচ্ছাসেবী রক্তদাতা কার্ড
              </h3>
              <button
                type="button"
                onClick={() => setDonorIdCardTarget(null)}
                className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition"
              >
                <X className="w-5 h-5 stroke-[2.25]" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {donorIdCardUrl && (
                <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800">
                  <img
                    src={donorIdCardUrl}
                    alt={`${donorIdCardTarget.name} Donor Card`}
                    className="w-full h-auto"
                  />
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    handleDownloadDataUrl(
                      donorIdCardUrl,
                      `osa-donor-id-${donorIdCardTarget.bloodGroup}.png`
                    )
                  }
                  className="flex-1 min-h-[44px] px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <Download className="w-4 h-4" />
                  আইডি কার্ড সেভ করুন (PNG)
                </button>
                <button
                  type="button"
                  onClick={() => setDonorIdCardTarget(null)}
                  className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200"
                >
                  বন্ধ করুন
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
