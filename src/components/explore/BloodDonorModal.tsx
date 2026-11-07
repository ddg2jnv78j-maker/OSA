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
} from 'lucide-react';

interface Donor {
  id: string;
  name: string;
  bloodGroup: string;
  district: string;
  area: string;
  phone: string;
  lastDonated: string;
  isAvailable: boolean;
  totalDonations: number;
}

const DEFAULT_DONORS: Donor[] = [
  {
    id: 'd1',
    name: 'তানভীর আহমেদ',
    bloodGroup: 'O+',
    district: 'ঢাকা',
    area: 'ধানমন্ডি',
    phone: '+8801712345678',
    lastDonated: '৩ মাস আগে',
    isAvailable: true,
    totalDonations: 8,
  },
  {
    id: 'd2',
    name: 'ফারহানা ইসলাম',
    bloodGroup: 'A+',
    district: 'ঢাকা',
    area: 'মিরপুর-১০',
    phone: '+8801819876543',
    lastDonated: '৫ মাস আগে',
    isAvailable: true,
    totalDonations: 4,
  },
  {
    id: 'd3',
    name: 'মাহমুদুল হাসান',
    bloodGroup: 'B+',
    district: 'চট্টগ্রাম',
    area: 'জিইসি মোড়',
    phone: '+8801911223344',
    lastDonated: '১ মাস আগে',
    isAvailable: false,
    totalDonations: 12,
  },
  {
    id: 'd4',
    name: 'নাজমুল সাকিব',
    bloodGroup: 'AB+',
    district: 'সিলেট',
    area: 'জিন্দাবাজার',
    phone: '+8801615556677',
    lastDonated: '৪ মাস আগে',
    isAvailable: true,
    totalDonations: 6,
  },
  {
    id: 'd5',
    name: 'আরিফুল হক',
    bloodGroup: 'O-',
    district: 'ঢাকা',
    area: 'উত্তরা',
    phone: '+8801518889900',
    lastDonated: '৬ মাস আগে',
    isAvailable: true,
    totalDonations: 5,
  },
  {
    id: 'd6',
    name: 'সাদিয়া আক্তার',
    bloodGroup: 'A-',
    district: 'রাজশাহী',
    area: 'সাহেব বাজার',
    phone: '+8801710998877',
    lastDonated: '২ মাস আগে',
    isAvailable: true,
    totalDonations: 3,
  },
];

const BLOOD_GROUPS = ['ALL', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
const DISTRICTS = ['সব জেলা', 'ঢাকা', 'চট্টগ্রাম', 'সিলেট', 'রাজশাহী', 'খুলনা', 'বরিশাল', 'রংপুর', 'ময়মনসিংহ'];

interface BloodDonorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserName?: string;
}

export const BloodDonorModal: React.FC<BloodDonorModalProps> = ({
  isOpen,
  onClose,
  currentUserName = 'User',
}) => {
  const [donors, setDonors] = useState<Donor[]>(() => {
    try {
      const saved = localStorage.getItem('osa_verified_blood_donors');
      return saved ? JSON.parse(saved) : DEFAULT_DONORS;
    } catch {
      return DEFAULT_DONORS;
    }
  });

  const [selectedGroup, setSelectedGroup] = useState('ALL');
  const [selectedDistrict, setSelectedDistrict] = useState('সব জেলা');
  const [searchQuery, setSearchQuery] = useState('');
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [isGpsLocating, setIsGpsLocating] = useState(false);

  // New donor registration state
  const [regName, setRegName] = useState(currentUserName);
  const [regGroup, setRegGroup] = useState('O+');
  const [regDistrict, setRegDistrict] = useState('ঢাকা');
  const [regArea, setRegArea] = useState('');
  const [regPhone, setRegPhone] = useState('+880');
  const [regSuccess, setRegSuccess] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem('osa_verified_blood_donors', JSON.stringify(donors));
    } catch {}
  }, [donors]);

  if (!isOpen) return null;

  const handleDetectGpsDistrict = () => {
    if ('geolocation' in navigator) {
      setIsGpsLocating(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;

          // Realistic district bounding in Bangladesh
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
        { timeout: 5000 }
      );
    }
  };

  const filteredDonors = donors.filter((d) => {
    const matchGroup = selectedGroup === 'ALL' || d.bloodGroup === selectedGroup;
    const matchDistrict = selectedDistrict === 'সব জেলা' || d.district === selectedDistrict;
    const matchQuery =
      d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.area.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.district.toLowerCase().includes(searchQuery.toLowerCase());
    return matchGroup && matchDistrict && matchQuery;
  });

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName.trim() || !regPhone.trim() || !regArea.trim()) return;

    const newDonor: Donor = {
      id: 'donor_' + Date.now(),
      name: regName.trim(),
      bloodGroup: regGroup,
      district: regDistrict,
      area: regArea.trim(),
      phone: regPhone.trim(),
      lastDonated: 'এখনো দেননি (নতুন ডোনার)',
      isAvailable: true,
      totalDonations: 1,
    };

    const nextList = [newDonor, ...donors];
    setDonors(nextList);
    setRegSuccess(true);
    setTimeout(() => {
      setRegSuccess(false);
      setShowRegisterModal(false);
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-red-500/10 via-pink-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-red-600 to-rose-500 text-white flex items-center justify-center shadow-md shadow-red-500/25">
              <Heart className="w-6 h-6 fill-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                জরুরি রক্তদাতা নেটওয়ার্ক
                <span className="px-2 py-0.5 text-[10px] font-bold bg-red-100 dark:bg-red-950/80 text-red-600 dark:text-red-400 rounded-full">
                  Emergency Live SOS
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                মুহূর্তেই খুঁজে নিন আপনার এলাকার রক্তের ডোনার
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

        {/* Content Body */}
        <div className="p-5 flex-1 min-h-0 overflow-y-auto space-y-4">
          {/* Action Banner: Register as Donor */}
          <div className="p-4 rounded-3xl bg-gradient-to-r from-red-600 via-rose-600 to-red-700 text-white flex items-center justify-between shadow-lg shadow-red-500/20">
            <div className="flex items-center gap-3">
              <UserCheck className="w-6 h-6 shrink-0" />
              <div>
                <p className="text-sm font-bold">আপনি কি স্বেচ্ছায় রক্ত দিতে ইচ্ছুক?</p>
                <p className="text-xs text-red-100">আপনার রক্তে বেঁচে যেতে পারে একটি মূল্যবান জীবন</p>
              </div>
            </div>
            <button
              onClick={() => setShowRegisterModal(true)}
              className="px-4 py-2 rounded-xl bg-white text-red-600 font-bold text-xs hover:bg-red-50 active:scale-95 transition shadow-sm shrink-0"
            >
              রক্তদাতা হিসেবে যুক্ত হন
            </button>
          </div>

          {/* Blood Group Filter Pills */}
          <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 block">
              রক্তের গ্রুপ নির্বাচন করুন:
            </label>
            <div className="flex flex-wrap gap-1.5">
              {BLOOD_GROUPS.map((grp) => {
                const isSelected = selectedGroup === grp;
                return (
                  <button
                    key={grp}
                    onClick={() => setSelectedGroup(grp)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      isSelected
                        ? 'bg-red-600 text-white shadow-md shadow-red-600/30 scale-105'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {grp}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Search & District Filter */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="এলাকা বা ডোনারের নাম..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 text-xs rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-transparent focus:border-red-500 focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Filter className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <select
                  value={selectedDistrict}
                  onChange={(e) => setSelectedDistrict(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 text-xs rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-transparent focus:border-red-500 focus:outline-none"
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
                className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1 shrink-0"
                title="জিপিএস দিয়ে জেলা নির্বাচন করুন"
              >
                <Compass className={`w-4 h-4 text-red-500 ${isGpsLocating ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">জিপিএস</span>
              </button>
            </div>
          </div>

          {/* Donors List */}
          <div className="space-y-2.5">
            <p className="text-xs font-semibold text-slate-500">
              পাওয়া গেছে: {filteredDonors.length} জন নিবন্ধিত রক্তদাতা
            </p>

            {filteredDonors.length === 0 ? (
              <div className="text-center py-10 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  এই গ্রুপ বা এলাকায় কোনো ডোনার পাওয়া যায়নি
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  অন্য কোনো রক্তের গ্রুপ বা পাশের জেলা নির্বাচন করে দেখুন
                </p>
              </div>
            ) : (
              filteredDonors.map((donor) => (
                <div
                  key={donor.id}
                  className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between hover:border-red-300 dark:hover:border-red-800 transition"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-red-600 text-white font-extrabold text-base flex items-center justify-center shadow-md shadow-red-500/20 shrink-0">
                      {donor.bloodGroup}
                    </div>
                    <div>
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
                        <MapPin className="w-3.5 h-3.5 text-red-500" />
                        {donor.area}, {donor.district} • {donor.totalDonations} বার রক্ত দিয়েছেন
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        সর্বশেষ দান: {donor.lastDonated}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <a
                      href={`tel:${donor.phone}`}
                      className="w-10 h-10 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center transition shadow-sm"
                      title="কল করুন"
                    >
                      <Phone className="w-4 h-4" />
                    </a>
                    <a
                      href={`sms:${donor.phone}?body=জরুরি রক্তের প্রয়োজন: আপনার গ্রুপ ${donor.bloodGroup}। দয়া করে সহায়তা করবেন কি?`}
                      className="w-10 h-10 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center transition shadow-sm"
                      title="মেসেজ পাঠান"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Register Modal Backdrop */}
        {showRegisterModal && (
          <div className="absolute inset-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md z-20 p-5 flex flex-col justify-center animate-in fade-in duration-150">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-red-500" />
                স্বেচ্ছাসেবী রক্তদাতা নিবন্ধন
              </h3>
              <button
                onClick={() => setShowRegisterModal(false)}
                className="w-8 h-8 rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {regSuccess ? (
              <div className="text-center py-8">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-2" />
                <p className="text-base font-bold text-slate-900 dark:text-white">
                  নিবন্ধন সফলভাবে সম্পন্ন ও ডাটাবেজে যুক্ত হয়েছে!
                </p>
                <p className="text-xs text-slate-500 mt-1">ধন্যবাদ আপনার এই মহৎ উদ্যোগের জন্য।</p>
              </div>
            ) : (
              <form onSubmit={handleRegister} className="space-y-3">
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
                      className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-900 dark:text-white border border-transparent focus:border-red-500 focus:outline-none"
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
                    নির্দিষ্ট এলাকা (যেমন: ধানমন্ডি, বাড্ডা):
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
                    onClick={() => setShowRegisterModal(false)}
                    className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300"
                  >
                    বাতিল
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-md shadow-red-500/20"
                  >
                    নিবন্ধন সম্পন্ন করুন
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
