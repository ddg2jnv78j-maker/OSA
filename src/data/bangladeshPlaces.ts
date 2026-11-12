export type DivisionId =
  | 'dhaka'
  | 'chattogram'
  | 'rajshahi'
  | 'khulna'
  | 'sylhet'
  | 'barishal'
  | 'rangpur'
  | 'mymensingh';

export type PlaceTier = 'metro' | 'district' | 'upazila';

export type LocalPlaceCategory =
  | 'mor'
  | 'road'
  | 'bazar'
  | 'station'
  | 'stand'
  | 'campus'
  | 'hospital'
  | 'area';

export interface BangladeshPlace {
  id: string;
  nameBn: string;
  nameEn: string;
  districtBn: string;
  upazilaBn?: string;
  division: DivisionId;
  lat: number;
  lng: number;
  tier: PlaceTier;
  category?: LocalPlaceCategory;
}

export interface DivisionInfo {
  id: DivisionId;
  nameBn: string;
  nameEn: string;
}

export const BD_DIVISIONS: DivisionInfo[] = [
  { id: 'dhaka', nameBn: 'ঢাকা বিভাগ', nameEn: 'Dhaka' },
  { id: 'chattogram', nameBn: 'চট্টগ্রাম বিভাগ', nameEn: 'Chattogram' },
  { id: 'rajshahi', nameBn: 'রাজশাহী বিভাগ', nameEn: 'Rajshahi' },
  { id: 'khulna', nameBn: 'খুলনা বিভাগ', nameEn: 'Khulna' },
  { id: 'sylhet', nameBn: 'সিলেট বিভাগ', nameEn: 'Sylhet' },
  { id: 'barishal', nameBn: 'বরিশাল বিভাগ', nameEn: 'Barishal' },
  { id: 'rangpur', nameBn: 'রংপুর বিভাগ', nameEn: 'Rangpur' },
  { id: 'mymensingh', nameBn: 'ময়মনসিংহ বিভাগ', nameEn: 'Mymensingh' },
];

export const BANGLADESH_PLACES: BangladeshPlace[] = [
  // ======================== ঢাকা বিভাগ (১৩ জেলা + গুরুত্বপূর্ণ এলাকা) ========================
  { id: 'dhk_farmgate', nameBn: 'ফার্মগেট', nameEn: 'Farmgate', districtBn: 'ঢাকা', division: 'dhaka', lat: 23.7561, lng: 90.3872, tier: 'metro' },
  { id: 'dhk_dhanmondi27', nameBn: 'ধানমন্ডি ২৭', nameEn: 'Dhanmondi 27', districtBn: 'ঢাকা', division: 'dhaka', lat: 23.7538, lng: 90.3732, tier: 'metro' },
  { id: 'dhk_dhanmondi32', nameBn: 'ধানমন্ডি ৩২', nameEn: 'Dhanmondi 32', districtBn: 'ঢাকা', division: 'dhaka', lat: 23.7516, lng: 90.3777, tier: 'metro' },
  { id: 'dhk_shahbagh', nameBn: 'শাহবাগ', nameEn: 'Shahbagh', districtBn: 'ঢাকা', division: 'dhaka', lat: 23.7388, lng: 90.3958, tier: 'metro' },
  { id: 'dhk_newmarket', nameBn: 'নিউমার্কেট', nameEn: 'New Market', districtBn: 'ঢাকা', division: 'dhaka', lat: 23.7335, lng: 90.3838, tier: 'metro' },
  { id: 'dhk_gulshan1', nameBn: 'গুলশান ১', nameEn: 'Gulshan 1', districtBn: 'ঢাকা', division: 'dhaka', lat: 23.7788, lng: 90.4168, tier: 'metro' },
  { id: 'dhk_gulshan2', nameBn: 'গুলশান ২', nameEn: 'Gulshan 2', districtBn: 'ঢাকা', division: 'dhaka', lat: 23.7925, lng: 90.4152, tier: 'metro' },
  { id: 'dhk_banani', nameBn: 'বনানী', nameEn: 'Banani', districtBn: 'ঢাকা', division: 'dhaka', lat: 23.7937, lng: 90.4066, tier: 'metro' },
  { id: 'dhk_uttara', nameBn: 'উত্তরা (হাউজ বিল্ডিং / সেক্টর ৩)', nameEn: 'Uttara', districtBn: 'ঢাকা', division: 'dhaka', lat: 23.8681, lng: 90.3986, tier: 'metro' },
  { id: 'dhk_airport', nameBn: 'হযরত শাহজালাল বিমানবন্দর', nameEn: 'Dhaka Airport', districtBn: 'ঢাকা', division: 'dhaka', lat: 23.8433, lng: 90.4029, tier: 'metro' },
  { id: 'dhk_mirpur10', nameBn: 'মিরপুর ১০', nameEn: 'Mirpur 10', districtBn: 'ঢাকা', division: 'dhaka', lat: 23.8069, lng: 90.3687, tier: 'metro' },
  { id: 'dhk_mirpur1', nameBn: 'মিরপুর ১', nameEn: 'Mirpur 1', districtBn: 'ঢাকা', division: 'dhaka', lat: 23.7956, lng: 90.3537, tier: 'metro' },
  { id: 'dhk_gabtoli', nameBn: 'গাবতলী বাস টার্মিনাল', nameEn: 'Gabtoli', districtBn: 'ঢাকা', division: 'dhaka', lat: 23.7837, lng: 90.3442, tier: 'metro' },
  { id: 'dhk_motijheel', nameBn: 'মতিঝিল', nameEn: 'Motijheel', districtBn: 'ঢাকা', division: 'dhaka', lat: 23.733, lng: 90.4172, tier: 'metro' },
  { id: 'dhk_kamalapur', nameBn: 'কমলাপুর রেলস্টেশন', nameEn: 'Kamalapur Station', districtBn: 'ঢাকা', division: 'dhaka', lat: 23.7314, lng: 90.4263, tier: 'metro' },
  { id: 'dhk_mohakhali', nameBn: 'মহাখালী বাস টার্মিনাল', nameEn: 'Mohakhali', districtBn: 'ঢাকা', division: 'dhaka', lat: 23.7776, lng: 90.4005, tier: 'metro' },
  { id: 'dhk_mohammadpur', nameBn: 'মোহাম্মদপুর', nameEn: 'Mohammadpur', districtBn: 'ঢাকা', division: 'dhaka', lat: 23.7658, lng: 90.3584, tier: 'metro' },
  { id: 'dhk_bashundhara', nameBn: 'বসুন্ধরা আবাসিক', nameEn: 'Bashundhara R/A', districtBn: 'ঢাকা', division: 'dhaka', lat: 23.8191, lng: 90.4326, tier: 'metro' },
  { id: 'dhk_sadarghat', nameBn: 'সদরঘাট লঞ্চ টার্মিনাল', nameEn: 'Sadarghat', districtBn: 'ঢাকা', division: 'dhaka', lat: 23.7058, lng: 90.4106, tier: 'metro' },
  { id: 'dhk_sayedabad', nameBn: 'সায়েদাবাদ বাস টার্মিনাল', nameEn: 'Sayedabad', districtBn: 'ঢাকা', division: 'dhaka', lat: 23.7153, lng: 90.4272, tier: 'metro' },
  { id: 'dhk_jatrabari', nameBn: 'যাত্রাবাড়ী', nameEn: 'Jatrabari', districtBn: 'ঢাকা', division: 'dhaka', lat: 23.7104, lng: 90.4354, tier: 'metro' },
  { id: 'dhk_badda', nameBn: 'বাড্ডা লিংক রোড', nameEn: 'Badda', districtBn: 'ঢাকা', division: 'dhaka', lat: 23.7806, lng: 90.4266, tier: 'metro' },
  { id: 'dhk_rampura', nameBn: 'রামপুরা ব্রিজ', nameEn: 'Rampura', districtBn: 'ঢাকা', division: 'dhaka', lat: 23.7618, lng: 90.4203, tier: 'metro' },
  { id: 'dhk_savar', nameBn: 'সাভার সিটি সেন্টার', nameEn: 'Savar', districtBn: 'ঢাকা', division: 'dhaka', lat: 23.8583, lng: 90.2667, tier: 'upazila' },
  { id: 'dhk_ashulia', nameBn: 'আশুলিয়া (বাইপাইল)', nameEn: 'Ashulia Baipayl', districtBn: 'ঢাকা', division: 'dhaka', lat: 23.9437, lng: 90.2704, tier: 'upazila' },
  { id: 'dhk_keraniganj', nameBn: 'কেরানীগঞ্জ (কদমতলী)', nameEn: 'Keraniganj', districtBn: 'ঢাকা', division: 'dhaka', lat: 23.6961, lng: 90.3885, tier: 'upazila' },
  { id: 'dhk_dhamrai', nameBn: 'ধামরাই', nameEn: 'Dhamrai', districtBn: 'ঢাকা', division: 'dhaka', lat: 23.9163, lng: 90.2116, tier: 'upazila' },
  { id: 'dhk_dohar', nameBn: 'দোহার (জয়পাড়া)', nameEn: 'Dohar', districtBn: 'ঢাকা', division: 'dhaka', lat: 23.5973, lng: 90.1235, tier: 'upazila' },
  { id: 'dhk_nawabganj', nameBn: 'নবাবগঞ্জ', nameEn: 'Nawabganj Dhaka', districtBn: 'ঢাকা', division: 'dhaka', lat: 23.6602, lng: 90.1725, tier: 'upazila' },
  // গাজীপুর
  { id: 'gzp_sadar', nameBn: 'গাজীপুর (জয়দেবপুর / চৌরাস্তা)', nameEn: 'Gazipur Chowrasta', districtBn: 'গাজীপুর', division: 'dhaka', lat: 23.9912, lng: 90.3822, tier: 'district' },
  { id: 'gzp_tongi', nameBn: 'টঙ্গী (স্টেশন রোড)', nameEn: 'Tongi', districtBn: 'গাজীপুর', division: 'dhaka', lat: 23.8915, lng: 90.4023, tier: 'upazila' },
  { id: 'gzp_kaliakoir', nameBn: 'কালিয়াকৈর', nameEn: 'Kaliakoir', districtBn: 'গাজীপুর', division: 'dhaka', lat: 24.075, lng: 90.2167, tier: 'upazila' },
  { id: 'gzp_sreepur', nameBn: 'শ্রীপুর (মাওনা)', nameEn: 'Sreepur Mawna', districtBn: 'গাজীপুর', division: 'dhaka', lat: 24.205, lng: 90.4719, tier: 'upazila' },
  // নারায়ণগঞ্জ
  { id: 'nyg_chashara', nameBn: 'নারায়ণগঞ্জ (চাষাঢ়া)', nameEn: 'Narayanganj Chashara', districtBn: 'নারায়ণগঞ্জ', division: 'dhaka', lat: 23.6238, lng: 90.499, tier: 'district' },
  { id: 'nyg_siddhirganj', nameBn: 'সিদ্ধিরগঞ্জ (চিটাগাং রোড)', nameEn: 'Siddhirganj', districtBn: 'নারায়ণগঞ্জ', division: 'dhaka', lat: 23.6947, lng: 90.5177, tier: 'upazila' },
  { id: 'nyg_sonargaon', nameBn: 'সোনারগাঁও (মোগরাপাড়া)', nameEn: 'Sonargaon', districtBn: 'নারায়ণগঞ্জ', division: 'dhaka', lat: 23.6494, lng: 90.6134, tier: 'upazila' },
  { id: 'nyg_rupganj', nameBn: 'রূপগঞ্জ (ভুলতা গাউছিয়া)', nameEn: 'Rupganj Bhulta', districtBn: 'নারায়ণগঞ্জ', division: 'dhaka', lat: 23.7905, lng: 90.5621, tier: 'upazila' },
  // নরসিংদী
  { id: 'nrs_sadar', nameBn: 'নরসিংদী সদর', nameEn: 'Narsingdi', districtBn: 'নরসিংদী', division: 'dhaka', lat: 23.9193, lng: 90.7176, tier: 'district' },
  { id: 'nrs_madhabdi', nameBn: 'মাধবদী', nameEn: 'Madhabdi', districtBn: 'নরসিংদী', division: 'dhaka', lat: 23.8511, lng: 90.6687, tier: 'upazila' },
  // মুন্সীগঞ্জ
  { id: 'mun_sadar', nameBn: 'মুন্সীগঞ্জ সদর', nameEn: 'Munshiganj', districtBn: 'মুন্সীগঞ্জ', division: 'dhaka', lat: 23.5422, lng: 90.5305, tier: 'district' },
  { id: 'mun_mawa', nameBn: 'মাওয়া ঘাট (পদ্মা সেতু উত্তর)', nameEn: 'Mawa Ghat', districtBn: 'মুন্সীগঞ্জ', division: 'dhaka', lat: 23.4706, lng: 90.2647, tier: 'upazila' },
  { id: 'mun_sreenagar', nameBn: 'শ্রীনগর', nameEn: 'Sreenagar', districtBn: 'মুন্সীগঞ্জ', division: 'dhaka', lat: 23.5356, lng: 90.2896, tier: 'upazila' },
  // মানিকগঞ্জ
  { id: 'mnk_sadar', nameBn: 'মানিকগঞ্জ সদর', nameEn: 'Manikganj', districtBn: 'মানিকগঞ্জ', division: 'dhaka', lat: 23.8617, lng: 90.0003, tier: 'district' },
  { id: 'mnk_paturia', nameBn: 'পাটুরিয়া ফেরি ঘাট', nameEn: 'Paturia Ghat', districtBn: 'মানিকগঞ্জ', division: 'dhaka', lat: 23.7885, lng: 89.7764, tier: 'upazila' },
  // টাঙ্গাইল
  { id: 'tng_sadar', nameBn: 'টাঙ্গাইল সদর (নিরালা মোড়)', nameEn: 'Tangail', districtBn: 'টাঙ্গাইল', division: 'dhaka', lat: 24.2513, lng: 89.9167, tier: 'district' },
  { id: 'tng_mirzapur', nameBn: 'মির্জাপুর', nameEn: 'Mirzapur', districtBn: 'টাঙ্গাইল', division: 'dhaka', lat: 24.1045, lng: 90.0972, tier: 'upazila' },
  { id: 'tng_madhupur', nameBn: 'মধুপুর', nameEn: 'Madhupur', districtBn: 'টাঙ্গাইল', division: 'dhaka', lat: 24.6143, lng: 90.0258, tier: 'upazila' },
  // কিশোরগঞ্জ
  { id: 'ksh_sadar', nameBn: 'কিশোরগঞ্জ সদর (গুরুদয়াল)', nameEn: 'Kishoreganj', districtBn: 'কিশোরগঞ্জ', division: 'dhaka', lat: 24.4331, lng: 90.7866, tier: 'district' },
  { id: 'ksh_bhairab', nameBn: 'ভৈরব বাজার', nameEn: 'Bhairab', districtBn: 'কিশোরগঞ্জ', division: 'dhaka', lat: 24.0518, lng: 90.9764, tier: 'upazila' },
  // ফরিদপুর
  { id: 'frd_sadar', nameBn: 'ফরিদপুর সদর (জনতা ব্যাংকের মোড়)', nameEn: 'Faridpur', districtBn: 'ফরিদপুর', division: 'dhaka', lat: 23.6071, lng: 89.8429, tier: 'district' },
  { id: 'frd_bhanga', nameBn: 'ভাঙ্গা গোলচত্বর', nameEn: 'Bhanga', districtBn: 'ফরিদপুর', division: 'dhaka', lat: 23.3852, lng: 89.9854, tier: 'upazila' },
  // গোপালগঞ্জ
  { id: 'gpg_sadar', nameBn: 'গোপালগঞ্জ সদর', nameEn: 'Gopalganj', districtBn: 'গোপালগঞ্জ', division: 'dhaka', lat: 23.0051, lng: 89.8266, tier: 'district' },
  { id: 'gpg_tungipara', nameBn: 'টুঙ্গিপাড়া', nameEn: 'Tungipara', districtBn: 'গোপালগঞ্জ', division: 'dhaka', lat: 22.8994, lng: 89.8861, tier: 'upazila' },
  // মাদারীপুর
  { id: 'mad_sadar', nameBn: 'মাদারীপুর সদর', nameEn: 'Madaripur', districtBn: 'মাদারীপুর', division: 'dhaka', lat: 23.1641, lng: 90.1897, tier: 'district' },
  { id: 'mad_shibchar', nameBn: 'শিবচর (পাচ্চর)', nameEn: 'Shibchar', districtBn: 'মাদারীপুর', division: 'dhaka', lat: 23.3471, lng: 90.1613, tier: 'upazila' },
  // রাজবাড়ী
  { id: 'rjb_sadar', nameBn: 'রাজবাড়ী সদর', nameEn: 'Rajbari', districtBn: 'রাজবাড়ী', division: 'dhaka', lat: 23.7574, lng: 89.6445, tier: 'district' },
  { id: 'rjb_daulatdia', nameBn: 'দৌলতদিয়া ঘাট', nameEn: 'Daulatdia Ghat', districtBn: 'রাজবাড়ী', division: 'dhaka', lat: 23.7704, lng: 89.7766, tier: 'upazila' },
  // শরীয়তপুর
  { id: 'shr_sadar', nameBn: 'শরীয়তপুর সদর (পালং)', nameEn: 'Shariatpur', districtBn: 'শরীয়তপুর', division: 'dhaka', lat: 23.2423, lng: 90.4348, tier: 'district' },
  { id: 'shr_zajira', nameBn: 'জাজিরা (পদ্মা সেতু দক্ষিণ)', nameEn: 'Zajira', districtBn: 'শরীয়তপুর', division: 'dhaka', lat: 23.3941, lng: 90.3037, tier: 'upazila' },

  // ======================== চট্টগ্রাম বিভাগ (১১ জেলা + গুরুত্বপূর্ণ এলাকা) ========================
  { id: 'ctg_gec', nameBn: 'চট্টগ্রাম জিইসি মোড়', nameEn: 'Chattogram GEC', districtBn: 'চট্টগ্রাম', division: 'chattogram', lat: 22.3592, lng: 91.8219, tier: 'metro' },
  { id: 'ctg_agrabad', nameBn: 'আগ্রাবাদ বাণিজ্যিক এলাকা', nameEn: 'Agrabad', districtBn: 'চট্টগ্রাম', division: 'chattogram', lat: 22.3239, lng: 91.8124, tier: 'metro' },
  { id: 'ctg_newmarket', nameBn: 'চট্টগ্রাম নিউমার্কেট / রেলস্টেশন', nameEn: 'Chattogram New Market', districtBn: 'চট্টগ্রাম', division: 'chattogram', lat: 22.3348, lng: 91.8323, tier: 'metro' },
  { id: 'ctg_bahaddarhat', nameBn: 'বহদ্দারহাট', nameEn: 'Bahaddarhat', districtBn: 'চট্টগ্রাম', division: 'chattogram', lat: 22.3687, lng: 91.8442, tier: 'metro' },
  { id: 'ctg_chawkbazar', nameBn: 'চকবাজার (চট্টগ্রাম)', nameEn: 'Chawkbazar Chattogram', districtBn: 'চট্টগ্রাম', division: 'chattogram', lat: 22.358, lng: 91.8384, tier: 'metro' },
  { id: 'ctg_patenga', nameBn: 'পতেঙ্গা সমুদ্র সৈকত', nameEn: 'Patenga Beach', districtBn: 'চট্টগ্রাম', division: 'chattogram', lat: 22.2356, lng: 91.7915, tier: 'metro' },
  { id: 'ctg_cu', nameBn: 'চট্টগ্রাম বিশ্ববিদ্যালয় (হাটহাজারী)', nameEn: 'Chittagong University', districtBn: 'চট্টগ্রাম', division: 'chattogram', lat: 22.4638, lng: 91.7959, tier: 'upazila' },
  { id: 'ctg_sitakunda', nameBn: 'সীতাকুণ্ড', nameEn: 'Sitakunda', districtBn: 'চট্টগ্রাম', division: 'chattogram', lat: 22.6164, lng: 91.6634, tier: 'upazila' },
  { id: 'ctg_patiya', nameBn: 'পটিয়া', nameEn: 'Patiya', districtBn: 'চট্টগ্রাম', division: 'chattogram', lat: 22.2974, lng: 91.9794, tier: 'upazila' },
  // কক্সবাজার
  { id: 'cxb_sadar', nameBn: 'কক্সবাজার (কলাতলী / সুগন্ধা বিচ)', nameEn: "Cox's Bazar Kolatoli", districtBn: "কক্সবাজার", division: 'chattogram', lat: 21.4184, lng: 91.9832, tier: 'district' },
  { id: 'cxb_chakaria', nameBn: 'চকরিয়া', nameEn: 'Chakaria', districtBn: 'কক্সবাজার', division: 'chattogram', lat: 21.7711, lng: 92.0752, tier: 'upazila' },
  { id: 'cxb_teknaf', nameBn: 'টেকনাফ', nameEn: 'Teknaf', districtBn: 'কক্সবাজার', division: 'chattogram', lat: 20.8622, lng: 92.2994, tier: 'upazila' },
  // কুমিল্লা
  { id: 'cum_kandirpar', nameBn: 'কুমিল্লা (কান্দিরপাড়)', nameEn: 'Cumilla Kandirpar', districtBn: 'কুমিল্লা', division: 'chattogram', lat: 23.4607, lng: 91.1809, tier: 'district' },
  { id: 'cum_kotbari', nameBn: 'কুমিল্লা কোটবাড়ি / কুবি', nameEn: 'Cumilla Kotbari', districtBn: 'কুমিল্লা', division: 'chattogram', lat: 23.4316, lng: 91.1329, tier: 'upazila' },
  { id: 'cum_daudkandi', nameBn: 'দাউদকান্দি (গৌরীপুর)', nameEn: 'Daudkandi', districtBn: 'কুমিল্লা', division: 'chattogram', lat: 23.5326, lng: 90.7136, tier: 'upazila' },
  { id: 'cum_laksam', nameBn: 'লাকসাম', nameEn: 'Laksam', districtBn: 'কুমিল্লা', division: 'chattogram', lat: 23.2403, lng: 91.1243, tier: 'upazila' },
  // ব্রাহ্মণবাড়িয়া
  { id: 'bra_sadar', nameBn: 'ব্রাহ্মণবাড়িয়া সদর', nameEn: 'Brahmanbaria', districtBn: 'ব্রাহ্মণবাড়িয়া', division: 'chattogram', lat: 23.9608, lng: 91.1115, tier: 'district' },
  { id: 'bra_ashuganj', nameBn: 'আশুগঞ্জ', nameEn: 'Ashuganj', districtBn: 'ব্রাহ্মণবাড়িয়া', division: 'chattogram', lat: 24.0355, lng: 91.0063, tier: 'upazila' },
  // চাঁদপুর
  { id: 'chd_sadar', nameBn: 'চাঁদপুর সদর (বড় স্টেশন / লঞ্চঘাট)', nameEn: 'Chandpur', districtBn: 'চাঁদপুর', division: 'chattogram', lat: 23.2333, lng: 90.6713, tier: 'district' },
  { id: 'chd_hajiganj', nameBn: 'হাজীগঞ্জ', nameEn: 'Hajiganj', districtBn: 'চাঁদপুর', division: 'chattogram', lat: 23.2512, lng: 90.8511, tier: 'upazila' },
  // ফেনী
  { id: 'fen_sadar', nameBn: 'ফেনী সদর (মহিপাল / ট্রাংক রোড)', nameEn: 'Feni Mahipal', districtBn: 'ফেনী', division: 'chattogram', lat: 23.0159, lng: 91.3976, tier: 'district' },
  // নোয়াখালী
  { id: 'noa_maijdee', nameBn: 'নোয়াখালী (মাইজদী)', nameEn: 'Noakhali Maijdee', districtBn: 'নোয়াখালী', division: 'chattogram', lat: 22.8724, lng: 91.0973, tier: 'district' },
  { id: 'noa_chowmuhani', nameBn: 'চৌমুহনী', nameEn: 'Chowmuhani', districtBn: 'নোয়াখালী', division: 'chattogram', lat: 22.9438, lng: 91.1246, tier: 'upazila' },
  // লক্ষ্মীপুর
  { id: 'lak_sadar', nameBn: 'লক্ষ্মীপুর সদর (ঝুমুর)', nameEn: 'Lakshmipur', districtBn: 'লক্ষ্মীপুর', division: 'chattogram', lat: 22.9447, lng: 90.8282, tier: 'district' },
  // রাঙ্গামাটি
  { id: 'rng_sadar', nameBn: 'রাঙ্গামাটি সদর (রিজার্ভ বাজার / তবলছড়ি)', nameEn: 'Rangamati', districtBn: 'রাঙ্গামাটি', division: 'chattogram', lat: 22.6533, lng: 92.1789, tier: 'district' },
  { id: 'rng_kaptai', nameBn: 'কাপ্তাই', nameEn: 'Kaptai', districtBn: 'রাঙ্গামাটি', division: 'chattogram', lat: 22.4958, lng: 92.2266, tier: 'upazila' },
  // খাগড়াছড়ি
  { id: 'khg_sadar', nameBn: 'খাগড়াছড়ি সদর (শাপলা চত্বর)', nameEn: 'Khagrachhari', districtBn: 'খাগড়াছড়ি', division: 'chattogram', lat: 23.1193, lng: 91.9847, tier: 'district' },
  { id: 'khg_sajek', nameBn: 'সাজেক ভ্যালি', nameEn: 'Sajek Valley', districtBn: 'খাগড়াছড়ি', division: 'chattogram', lat: 23.3818, lng: 92.2938, tier: 'upazila' },
  // বান্দরবান
  { id: 'bnd_sadar', nameBn: 'বান্দরবান সদর', nameEn: 'Bandarban', districtBn: 'বান্দরবান', division: 'chattogram', lat: 22.1953, lng: 92.2184, tier: 'district' },
  { id: 'bnd_nilgiri', nameBn: 'নীলগিরি / চিম্বুক', nameEn: 'Nilgiri Bandarban', districtBn: 'বান্দরবান', division: 'chattogram', lat: 21.9117, lng: 92.3237, tier: 'upazila' },

  // ======================== রাজশাহী বিভাগ (৮ জেলা + গুরুত্বপূর্ণ এলাকা) ========================
  { id: 'raj_saheb', nameBn: 'রাজশাহী (সাহেব বাজার / জিরো পয়েন্ট)', nameEn: 'Rajshahi Shaheb Bazar', districtBn: 'রাজশাহী', division: 'rajshahi', lat: 24.3636, lng: 88.6011, tier: 'metro' },
  { id: 'raj_ru', nameBn: 'রাজশাহী বিশ্ববিদ্যালয় / কাজলা', nameEn: 'Rajshahi University', districtBn: 'রাজশাহী', division: 'rajshahi', lat: 24.3688, lng: 88.6368, tier: 'metro' },
  { id: 'raj_shiroil', nameBn: 'রাজশাহী রেলস্টেশন / শিরোইল', nameEn: 'Rajshahi Railway Station', districtBn: 'রাজশাহী', division: 'rajshahi', lat: 24.3746, lng: 88.6085, tier: 'metro' },
  { id: 'bog_satmatha', nameBn: 'বগুড়া (সাতমাথা)', nameEn: 'Bogura Satmatha', districtBn: 'বগুড়া', division: 'rajshahi', lat: 24.8481, lng: 89.373, tier: 'district' },
  { id: 'bog_sherpur', nameBn: 'বগুড়া (শেরপুর)', nameEn: 'Sherpur Bogura', districtBn: 'বগুড়া', division: 'rajshahi', lat: 24.6716, lng: 89.4184, tier: 'upazila' },
  { id: 'pab_sadar', nameBn: 'পাবনা সদর (ট্রাফিক মোড়)', nameEn: 'Pabna', districtBn: 'পাবনা', division: 'rajshahi', lat: 24.0063, lng: 89.2372, tier: 'district' },
  { id: 'pab_ishwardi', nameBn: 'ঈশ্বরদী (রূপপুর)', nameEn: 'Ishwardi', districtBn: 'পাবনা', division: 'rajshahi', lat: 24.1292, lng: 89.0697, tier: 'upazila' },
  { id: 'sir_sadar', nameBn: 'সিরাজগঞ্জ সদর (বাজার স্টেশন)', nameEn: 'Sirajganj', districtBn: 'সিরাজগঞ্জ', division: 'rajshahi', lat: 24.4534, lng: 89.7007, tier: 'district' },
  { id: 'sir_hatikumrul', nameBn: 'হাটিকুমরুল গোলচত্বর', nameEn: 'Hatikumrul', districtBn: 'সিরাজগঞ্জ', division: 'rajshahi', lat: 24.4322, lng: 89.4969, tier: 'upazila' },
  { id: 'nat_sadar', nameBn: 'নাটোর সদর (মাদ্রাসা মোড়)', nameEn: 'Natore', districtBn: 'নাটোর', division: 'rajshahi', lat: 24.4102, lng: 88.9818, tier: 'district' },
  { id: 'nao_sadar', nameBn: 'নওগাঁ সদর (তাজের মোড়)', nameEn: 'Naogaon', districtBn: 'নওগাঁ', division: 'rajshahi', lat: 24.8053, lng: 88.9466, tier: 'district' },
  { id: 'chp_sadar', nameBn: 'চাঁপাইনবাবগঞ্জ সদর', nameEn: 'Chapainawabganj', districtBn: 'চাঁপাইনবাবগঞ্জ', division: 'rajshahi', lat: 24.5965, lng: 88.2775, tier: 'district' },
  { id: 'joy_sadar', nameBn: 'জয়পুরহাট সদর', nameEn: 'Joypurhat', districtBn: 'জয়পুরহাট', division: 'rajshahi', lat: 25.0968, lng: 89.0227, tier: 'district' },

  // ======================== খুলনা বিভাগ (১০ জেলা + গুরুত্বপূর্ণ এলাকা) ========================
  { id: 'khl_shibbari', nameBn: 'খুলনা (শিববাড়ী মোড়)', nameEn: 'Khulna Shibbari', districtBn: 'খুলনা', division: 'khulna', lat: 22.8186, lng: 89.5535, tier: 'metro' },
  { id: 'khl_sonadanga', nameBn: 'সোনাডাঙ্গা বাস টার্মিনাল', nameEn: 'Sonadanga Khulna', districtBn: 'খুলনা', division: 'khulna', lat: 22.8135, lng: 89.5396, tier: 'metro' },
  { id: 'khl_daulatpur', nameBn: 'দৌলতপুর (খুলনা)', nameEn: 'Daulatpur Khulna', districtBn: 'খুলনা', division: 'khulna', lat: 22.8722, lng: 89.5194, tier: 'metro' },
  { id: 'khl_ku', nameBn: 'খুলনা বিশ্ববিদ্যালয় / গল্লামারী', nameEn: 'Khulna University', districtBn: 'খুলনা', division: 'khulna', lat: 22.8022, lng: 89.5338, tier: 'metro' },
  { id: 'jas_sadar', nameBn: 'যশোর সদর (দড়াটানা / মণিহার)', nameEn: 'Jashore', districtBn: 'যশোর', division: 'khulna', lat: 23.1664, lng: 89.2081, tier: 'district' },
  { id: 'jas_benapole', nameBn: 'বেনাপোল স্থলবন্দর', nameEn: 'Benapole', districtBn: 'যশোর', division: 'khulna', lat: 23.0419, lng: 88.8961, tier: 'upazila' },
  { id: 'sat_sadar', nameBn: 'সাতক্ষীরা সদর (নিউমার্কেট মোড়)', nameEn: 'Satkhira', districtBn: 'সাতক্ষীরা', division: 'khulna', lat: 22.7185, lng: 89.0705, tier: 'district' },
  { id: 'sat_shyamnagar', nameBn: 'শ্যামনগর (মুন্সিগঞ্জ / সুন্দরবন)', nameEn: 'Shyamnagar Sundarban', districtBn: 'সাতক্ষীরা', division: 'khulna', lat: 22.3335, lng: 89.1023, tier: 'upazila' },
  { id: 'bag_sadar', nameBn: 'বাগেরহাট সদর (ষাট গম্বুজ)', nameEn: 'Bagerhat', districtBn: 'বাগেরহাট', division: 'khulna', lat: 22.6516, lng: 89.7859, tier: 'district' },
  { id: 'bag_mongla', nameBn: 'মোংলা বন্দর', nameEn: 'Mongla Port', districtBn: 'বাগেরহাট', division: 'khulna', lat: 22.4875, lng: 89.6019, tier: 'upazila' },
  { id: 'kus_sadar', nameBn: 'কুষ্টিয়া সদর (মজমপুর গেট)', nameEn: 'Kushtia', districtBn: 'কুষ্টিয়া', division: 'khulna', lat: 23.9013, lng: 89.1204, tier: 'district' },
  { id: 'kus_iu', nameBn: 'ইসলামী বিশ্ববিদ্যালয় (শান্তিডাঙ্গা)', nameEn: 'Islamic University', districtBn: 'কুষ্টিয়া', division: 'khulna', lat: 23.723, lng: 89.1519, tier: 'upazila' },
  { id: 'jhn_sadar', nameBn: 'ঝিনাইদহ সদর (পায়রা চত্বর)', nameEn: 'Jhenaidah', districtBn: 'ঝিনাইদহ', division: 'khulna', lat: 23.545, lng: 89.1726, tier: 'district' },
  { id: 'chu_sadar', nameBn: 'চুয়াডাঙ্গা সদর (শহীদ হাসান চত্বর)', nameEn: 'Chuadanga', districtBn: 'চুয়াডাঙ্গা', division: 'khulna', lat: 23.6402, lng: 88.8418, tier: 'district' },
  { id: 'meh_sadar', nameBn: 'মেহেরপুর সদর', nameEn: 'Meherpur', districtBn: 'মেহেরপুর', division: 'khulna', lat: 23.7622, lng: 88.6318, tier: 'district' },
  { id: 'mag_sadar', nameBn: 'মাগুরা সদর (ভায়না মোড়)', nameEn: 'Magura', districtBn: 'মাগুরা', division: 'khulna', lat: 23.4855, lng: 89.4198, tier: 'district' },
  { id: 'nar_sadar', nameBn: 'নড়াইল সদর (রূপগঞ্জ)', nameEn: 'Narail', districtBn: 'নড়াইল', division: 'khulna', lat: 23.1725, lng: 89.5127, tier: 'district' },

  // ======================== সিলেট বিভাগ (৪ জেলা + গুরুত্বপূর্ণ এলাকা) ========================
  { id: 'syl_zindabazar', nameBn: 'সিলেট (জিন্দাবাজার / বন্দরবাজার)', nameEn: 'Sylhet Zindabazar', districtBn: 'সিলেট', division: 'sylhet', lat: 24.8949, lng: 91.8687, tier: 'metro' },
  { id: 'syl_ambarkhana', nameBn: 'আম্বরখানা পয়েন্ট', nameEn: 'Sylhet Ambarkhana', districtBn: 'সিলেট', division: 'sylhet', lat: 24.9044, lng: 91.8684, tier: 'metro' },
  { id: 'syl_sust', nameBn: 'শাবিপ্রবি (SUST) গেট', nameEn: 'SUST Sylhet', districtBn: 'সিলেট', division: 'sylhet', lat: 24.9172, lng: 91.8319, tier: 'metro' },
  { id: 'syl_kadamtali', nameBn: 'কদমতলী বাস টার্মিনাল / রেলস্টেশন', nameEn: 'Sylhet Kadamtali', districtBn: 'সিলেট', division: 'sylhet', lat: 24.8819, lng: 91.8675, tier: 'metro' },
  { id: 'syl_jaflong', nameBn: 'জাফলং', nameEn: 'Jaflong', districtBn: 'সিলেট', division: 'sylhet', lat: 25.1636, lng: 92.0175, tier: 'upazila' },
  { id: 'mol_sadar', nameBn: 'মৌলভীবাজার সদর (চৌমুহনা)', nameEn: 'Moulvibazar', districtBn: 'মৌলভীবাজার', division: 'sylhet', lat: 24.4829, lng: 91.7774, tier: 'district' },
  { id: 'mol_sreemangal', nameBn: 'শ্রীমঙ্গল (চৌমুহনা)', nameEn: 'Sreemangal', districtBn: 'মৌলভীবাজার', division: 'sylhet', lat: 24.3065, lng: 91.7296, tier: 'upazila' },
  { id: 'hab_sadar', nameBn: 'হবিগঞ্জ সদর', nameEn: 'Habiganj', districtBn: 'হবিগঞ্জ', division: 'sylhet', lat: 24.3749, lng: 91.4155, tier: 'district' },
  { id: 'hab_shaistaganj', nameBn: 'শায়েস্তাগঞ্জ', nameEn: 'Shaistaganj', districtBn: 'হবিগঞ্জ', division: 'sylhet', lat: 24.2747, lng: 91.4547, tier: 'upazila' },
  { id: 'sun_sadar', nameBn: 'সুনামগঞ্জ সদর (ট্রাফিক পয়েন্ট)', nameEn: 'Sunamganj', districtBn: 'সুনামগঞ্জ', division: 'sylhet', lat: 25.0658, lng: 91.395, tier: 'district' },
  { id: 'sun_tanguar', nameBn: 'তাহিরপুর (টাঙ্গুয়ার হাওর)', nameEn: 'Tahirpur Tanguar Haor', districtBn: 'সুনামগঞ্জ', division: 'sylhet', lat: 25.1319, lng: 91.1583, tier: 'upazila' },

  // ======================== বরিশাল বিভাগ (৬ জেলা + গুরুত্বপূর্ণ এলাকা) ========================
  { id: 'bar_sadar', nameBn: 'বরিশাল (সদর রোড / বিবির পুকুর)', nameEn: 'Barishal Sadar Road', districtBn: 'বরিশাল', division: 'barishal', lat: 22.701, lng: 90.3535, tier: 'metro' },
  { id: 'bar_nathullabad', nameBn: 'নথুল্লাবাদ বাস টার্মিনাল', nameEn: 'Nathullabad Barishal', districtBn: 'বরিশাল', division: 'barishal', lat: 22.7235, lng: 90.3442, tier: 'metro' },
  { id: 'bar_rupatali', nameBn: 'রূপাতলী / বরিশাল বিশ্ববিদ্যালয়', nameEn: 'Rupatali Barishal', districtBn: 'বরিশাল', division: 'barishal', lat: 22.6713, lng: 90.3461, tier: 'metro' },
  { id: 'pat_sadar', nameBn: 'পটুয়াখালী সদর (চৌরাস্তা)', nameEn: 'Patuakhali', districtBn: 'পটুয়াখালী', division: 'barishal', lat: 22.3596, lng: 90.3299, tier: 'district' },
  { id: 'pat_kuakata', nameBn: 'কুয়াকাটা সমুদ্র সৈকত', nameEn: 'Kuakata', districtBn: 'পটুয়াখালী', division: 'barishal', lat: 21.8167, lng: 90.1167, tier: 'upazila' },
  { id: 'bho_sadar', nameBn: 'ভোলা সদর (নতুন বাজার)', nameEn: 'Bhola', districtBn: 'ভোলা', division: 'barishal', lat: 22.6859, lng: 90.6482, tier: 'district' },
  { id: 'bho_charfasson', nameBn: 'চরফ্যাশন', nameEn: 'Charfasson', districtBn: 'ভোলা', division: 'barishal', lat: 22.1869, lng: 90.7611, tier: 'upazila' },
  { id: 'brg_sadar', nameBn: 'বরগুনা সদর', nameEn: 'Barguna', districtBn: 'বরগুনা', division: 'barishal', lat: 22.1591, lng: 90.1264, tier: 'district' },
  { id: 'brg_patharghata', nameBn: 'পাথরঘাটা', nameEn: 'Patharghata', districtBn: 'বরগুনা', division: 'barishal', lat: 22.0439, lng: 89.9692, tier: 'upazila' },
  { id: 'pir_sadar', nameBn: 'পিরোজপুর সদর', nameEn: 'Pirojpur', districtBn: 'পিরোজপুর', division: 'barishal', lat: 22.5791, lng: 89.9759, tier: 'district' },
  { id: 'jhl_sadar', nameBn: 'ঝালকাঠি সদর', nameEn: 'Jhalokathi', districtBn: 'ঝালকাঠি', division: 'barishal', lat: 22.6406, lng: 90.1987, tier: 'district' },

  // ======================== রংপুর বিভাগ (৮ জেলা + গুরুত্বপূর্ণ এলাকা) ========================
  { id: 'ran_jahaj', nameBn: 'রংপুর (জাহাজ কোম্পানি / শাপলা চত্বর)', nameEn: 'Rangpur City', districtBn: 'রংপুর', division: 'rangpur', lat: 25.7439, lng: 89.2752, tier: 'metro' },
  { id: 'ran_modern', nameBn: 'মডার্ন মোড় / বেগম রোকেয়া বিশ্ববিদ্যালয়', nameEn: 'Rangpur Modern Mor', districtBn: 'রংপুর', division: 'rangpur', lat: 25.7166, lng: 89.2602, tier: 'metro' },
  // দিনাজপুর ও বিরামপুর (স্থানীয় মোড়, মেইন রোড, বাজার, স্টেশন)
  { id: 'din_sadar', nameBn: 'দিনাজপুর সদর (বাহাদুর বাজার)', nameEn: 'Dinajpur Bahadur Bazar', districtBn: 'দিনাজপুর', division: 'rangpur', lat: 25.6217, lng: 88.6354, tier: 'district', category: 'bazar' },
  { id: 'din_station', nameBn: 'দিনাজপুর রেলওয়ে স্টেশন', nameEn: 'Dinajpur Railway Station', districtBn: 'দিনাজপুর', division: 'rangpur', lat: 25.6251, lng: 88.6382, tier: 'district', category: 'station' },
  { id: 'din_lilir_mor', nameBn: 'লিলির মোড় (দিনাজপুর)', nameEn: 'Lilir Mor Dinajpur', districtBn: 'দিনাজপুর', division: 'rangpur', lat: 25.6279, lng: 88.6368, tier: 'district', category: 'mor' },
  { id: 'din_hospital_mor', nameBn: 'হাসপাতাল মোড় (দিনাজপুর মেডিকেল)', nameEn: 'Dinajpur Medical Mor', districtBn: 'দিনাজপুর', division: 'rangpur', lat: 25.6416, lng: 88.6502, tier: 'district', category: 'hospital' },
  { id: 'din_kalitola', nameBn: 'কালিতলা / বড়মাঠ (দিনাজপুর)', nameEn: 'Kalitola Dinajpur', districtBn: 'দিনাজপুর', division: 'rangpur', lat: 25.6203, lng: 88.6419, tier: 'district', category: 'area' },
  { id: 'din_hstu', nameBn: 'হাবিপ্রবি (HSTU) / বাঁশেরহাট', nameEn: 'HSTU Dinajpur', districtBn: 'দিনাজপুর', division: 'rangpur', lat: 25.6967, lng: 88.6512, tier: 'upazila', category: 'campus' },
  // বিরামপুর (উপজেলা ও লোকাল সব জায়গা)
  { id: 'bir_dhaka_mor', nameBn: 'ঢাকা মোড় (বিরামপুর)', nameEn: 'Dhaka Mor Birampur', districtBn: 'দিনাজপুর', upazilaBn: 'বিরামপুর', division: 'rangpur', lat: 25.3836, lng: 88.9936, tier: 'upazila', category: 'mor' },
  { id: 'bir_college_bazar', nameBn: 'কলেজ বাজার (বিরামপুর)', nameEn: 'College Bazar Birampur', districtBn: 'দিনাজপুর', upazilaBn: 'বিরামপুর', division: 'rangpur', lat: 25.3895, lng: 88.9912, tier: 'upazila', category: 'bazar' },
  { id: 'bir_station', nameBn: 'বিরামপুর রেলওয়ে স্টেশন', nameEn: 'Birampur Railway Station', districtBn: 'দিনাজপুর', upazilaBn: 'বিরামপুর', division: 'rangpur', lat: 25.3849, lng: 88.9838, tier: 'upazila', category: 'station' },
  { id: 'bir_puratan_bazar', nameBn: 'পুরাতন বাজার / শালবাগান (বিরামপুর)', nameEn: 'Puratan Bazar Birampur', districtBn: 'দিনাজপুর', upazilaBn: 'বিরামপুর', division: 'rangpur', lat: 25.3868, lng: 88.9869, tier: 'upazila', category: 'bazar' },
  { id: 'bir_bus_stand', nameBn: 'বিরামপুর বাসস্ট্যান্ড / কলাবাগান মোড়', nameEn: 'Birampur Bus Stand Kalabagan', districtBn: 'দিনাজপুর', upazilaBn: 'বিরামপুর', division: 'rangpur', lat: 25.3792, lng: 88.9942, tier: 'upazila', category: 'stand' },
  { id: 'bir_govt_college', nameBn: 'বিরামপুর সরকারি কলেজ ও উপজেলা পরিষদ', nameEn: 'Birampur Govt College', districtBn: 'দিনাজপুর', upazilaBn: 'বিরামপুর', division: 'rangpur', lat: 25.3924, lng: 88.9922, tier: 'upazila', category: 'campus' },
  { id: 'bir_hospital', nameBn: 'বিরামপুর উপজেলা স্বাস্থ্য কমপ্লেক্স', nameEn: 'Birampur Upazila Hospital', districtBn: 'দিনাজপুর', upazilaBn: 'বিরামপুর', division: 'rangpur', lat: 25.3885, lng: 88.9965, tier: 'upazila', category: 'hospital' },
  { id: 'bir_notun_bazar', nameBn: 'নতুন বাজার / পাইলট স্কুল মোড় (বিরামপুর)', nameEn: 'Notun Bazar Birampur', districtBn: 'দিনাজপুর', upazilaBn: 'বিরামপুর', division: 'rangpur', lat: 25.3821, lng: 88.9895, tier: 'upazila', category: 'bazar' },
  { id: 'bir_doyel_mor', nameBn: 'দোয়েল মোড় / মদিনা মোড় (বিরামপুর)', nameEn: 'Doyel Mor Birampur', districtBn: 'দিনাজপুর', upazilaBn: 'বিরামপুর', division: 'rangpur', lat: 25.3808, lng: 88.9915, tier: 'upazila', category: 'mor' },
  { id: 'bir_ghoraghat_railgate', nameBn: 'ঘোড়াঘাট রেলগেট / দিনাজপুর মেইন রোড (বিরামপুর)', nameEn: 'Ghoraghat Railgate Birampur Main Road', districtBn: 'দিনাজপুর', upazilaBn: 'বিরামপুর', division: 'rangpur', lat: 25.3965, lng: 88.9905, tier: 'upazila', category: 'road' },
  { id: 'bir_hili_road', nameBn: 'হিলি মেইন রোড / চাঁদপুর মোড় (বিরামপুর)', nameEn: 'Hili Main Road Chandpur Mor Birampur', districtBn: 'দিনাজপুর', upazilaBn: 'বিরামপুর', division: 'rangpur', lat: 25.3728, lng: 88.9965, tier: 'upazila', category: 'road' },
  { id: 'bir_phulbari_road', nameBn: 'ফুলবাড়ী রোড / বেনীপুর মোড় (বিরামপুর)', nameEn: 'Phulbari Road Birampur', districtBn: 'দিনাজপুর', upazilaBn: 'বিরামপুর', division: 'rangpur', lat: 25.4055, lng: 88.9852, tier: 'upazila', category: 'road' },
  { id: 'bir_nawabganj_road', nameBn: 'নবাবগঞ্জ মেইন রোড / বিরামপুর পূর্ব', nameEn: 'Nawabganj Road Birampur', districtBn: 'দিনাজপুর', upazilaBn: 'বিরামপুর', division: 'rangpur', lat: 25.3845, lng: 89.0125, tier: 'upazila', category: 'road' },
  { id: 'bir_katla', nameBn: 'কাটলা বাজার (বিরামপুর)', nameEn: 'Katla Bazar Birampur', districtBn: 'দিনাজপুর', upazilaBn: 'বিরামপুর', division: 'rangpur', lat: 25.3621, lng: 88.9585, tier: 'upazila', category: 'bazar' },
  // দিনাজপুরের অন্যান্য উপজেলা ও আশেপাশে
  { id: 'phl_nimnagar', nameBn: 'ফুলবাড়ী (নিমতলা মোড় / বাসস্ট্যান্ড)', nameEn: 'Phulbari Dinajpur', districtBn: 'দিনাজপুর', upazilaBn: 'ফুলবাড়ী', division: 'rangpur', lat: 25.4956, lng: 88.9541, tier: 'upazila', category: 'mor' },
  { id: 'hil_bazar', nameBn: 'হিলি স্থলবন্দর / চারমাথা মোড়', nameEn: 'Hili Land Port Hakimpur', districtBn: 'দিনাজপুর', upazilaBn: 'হাকিমপুর', division: 'rangpur', lat: 25.2804, lng: 89.0172, tier: 'upazila', category: 'mor' },
  { id: 'par_station', nameBn: 'পার্বতীপুর রেলওয়ে জংশন / বাস টার্মিনাল', nameEn: 'Parbatipur Junction', districtBn: 'দিনাজপুর', upazilaBn: 'পার্বতীপুর', division: 'rangpur', lat: 25.6612, lng: 88.9189, tier: 'upazila', category: 'station' },
  { id: 'nil_sadar', nameBn: 'নীলফামারী সদর', nameEn: 'Nilphamari', districtBn: 'নীলফামারী', division: 'rangpur', lat: 25.9318, lng: 88.8561, tier: 'district', category: 'mor' },
  { id: 'nil_saidpur', nameBn: 'সৈয়দপুর (বিমানবন্দর / টার্মিনাল / রেলস্টেশন)', nameEn: 'Saidpur', districtBn: 'নীলফামারী', upazilaBn: 'সৈয়দপুর', division: 'rangpur', lat: 25.7777, lng: 88.8917, tier: 'upazila', category: 'station' },
  { id: 'kur_sadar', nameBn: 'কুড়িগ্রাম সদর (শাপলা চত্বর)', nameEn: 'Kurigram', districtBn: 'কুড়িগ্রাম', division: 'rangpur', lat: 25.8054, lng: 89.6362, tier: 'district', category: 'mor' },
  { id: 'gai_sadar', nameBn: 'গাইবান্ধা সদর (১নং ট্রাফিক মোড়)', nameEn: 'Gaibandha', districtBn: 'গাইবান্ধা', division: 'rangpur', lat: 25.3287, lng: 89.528, tier: 'district', category: 'mor' },
  { id: 'lal_sadar', nameBn: 'লালমনিরহাট সদর (মিশন মোড়)', nameEn: 'Lalmonirhat', districtBn: 'লালমনিরহাট', division: 'rangpur', lat: 25.9923, lng: 89.2847, tier: 'district', category: 'mor' },
  { id: 'tha_sadar', nameBn: 'ঠাকুরগাঁও সদর (চৌরাস্তা)', nameEn: 'Thakurgaon', districtBn: 'ঠাকুরগাঁও', division: 'rangpur', lat: 26.0337, lng: 88.4617, tier: 'district', category: 'mor' },
  { id: 'pan_sadar', nameBn: 'পঞ্চগড় সদর (চৌরঙ্গী মোড়)', nameEn: 'Panchagarh', districtBn: 'পঞ্চগড়', division: 'rangpur', lat: 26.3411, lng: 88.5542, tier: 'district', category: 'mor' },
  { id: 'pan_tetulia', nameBn: 'তেঁতুলিয়া / বাংলাবান্ধা', nameEn: 'Tetulia Panchagarh', districtBn: 'পঞ্চগড়', upazilaBn: 'তেঁতুলিয়া', division: 'rangpur', lat: 26.4945, lng: 88.3489, tier: 'upazila', category: 'area' },

  // ======================== ময়মনসিংহ বিভাগ (৪ জেলা + গুরুত্বপূর্ণ এলাকা) ========================
  { id: 'mym_ganginar', nameBn: 'ময়মনসিংহ (গাঙ্গিনারপাড় / চরপাড়া)', nameEn: 'Mymensingh Town', districtBn: 'ময়মনসিংহ', division: 'mymensingh', lat: 24.7471, lng: 90.4203, tier: 'metro' },
  { id: 'mym_bau', nameBn: 'বাংলাদেশ কৃষি বিশ্ববিদ্যালয় (বাকৃবি)', nameEn: 'BAU Mymensingh', districtBn: 'ময়মনসিংহ', division: 'mymensingh', lat: 24.7244, lng: 90.4372, tier: 'metro' },
  { id: 'mym_bhaluka', nameBn: 'ভালুকা', nameEn: 'Bhaluka', districtBn: 'ময়মনসিংহ', division: 'mymensingh', lat: 24.3752, lng: 90.3789, tier: 'upazila' },
  { id: 'mym_trishal', nameBn: 'ত্রিশাল (কবি নজরুল বিশ্ববিদ্যালয়)', nameEn: 'Trishal', districtBn: 'ময়মনসিংহ', division: 'mymensingh', lat: 24.5811, lng: 90.3944, tier: 'upazila' },
  { id: 'jam_sadar', nameBn: 'জামালপুর সদর (দয়াময়ী / ফৌজদারী)', nameEn: 'Jamalpur', districtBn: 'জামালপুর', division: 'mymensingh', lat: 24.9375, lng: 89.9378, tier: 'district' },
  { id: 'shrp_sadar', nameBn: 'শেরপুর সদর (নিউমার্কেট / খোয়ারপাড়)', nameEn: 'Sherpur Town', districtBn: 'শেরপুর', division: 'mymensingh', lat: 25.0205, lng: 90.0153, tier: 'district' },
  { id: 'net_sadar', nameBn: 'নেত্রকোনা সদর (সাতপাই / বড়বাজার)', nameEn: 'Netrokona', districtBn: 'নেত্রকোনা', division: 'mymensingh', lat: 24.8709, lng: 90.7279, tier: 'district' },
  { id: 'net_birishiri', nameBn: 'দুর্গাপুর (বিরিশিরি)', nameEn: 'Birishiri Durgapur', districtBn: 'নেত্রকোনা', division: 'mymensingh', lat: 25.1258, lng: 90.6656, tier: 'upazila' },
];
