import { BANGLADESH_PLACES, BD_DIVISIONS, DivisionId } from '../../data/bangladeshPlaces';

export type BloodGroupType = 'A+' | 'A-' | 'B+' | 'B-' | 'O+' | 'O-' | 'AB+' | 'AB-';

export const BLOOD_GROUP_LIST: BloodGroupType[] = [
  'A+',
  'A-',
  'B+',
  'B-',
  'O+',
  'O-',
  'AB+',
  'AB-',
];

export type BloodComponentType = 'Whole Blood' | 'Platelets' | 'Plasma' | 'Red Cells';

export type UrgencyLevel = 'critical' | 'today' | 'scheduled';

export interface BloodCompatibilityInfo {
  group: BloodGroupType;
  canDonateTo: BloodGroupType[];
  canReceiveFrom: BloodGroupType[];
  noteBn: string;
}

export const BLOOD_COMPATIBILITY: Record<BloodGroupType, BloodCompatibilityInfo> = {
  'O-': {
    group: 'O-',
    canDonateTo: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'],
    canReceiveFrom: ['O-'],
    noteBn: 'সর্বজনীন দাতা (Universal Donor) — জরুরি অবস্থায় যেকোনো গ্রুপকে রক্ত দিতে পারেন, তবে কেবল O- নিতে পারেন।',
  },
  'O+': {
    group: 'O+',
    canDonateTo: ['O+', 'A+', 'B+', 'AB+'],
    canReceiveFrom: ['O+', 'O-'],
    noteBn: 'বাংলাদেশে সবচেয়ে বেশি চাহিদাসম্পন্ন পজিটিভ গ্রুপ — সকল পজিটিভ গ্রুপকে রক্ত দিতে পারেন।',
  },
  'A-': {
    group: 'A-',
    canDonateTo: ['A+', 'A-', 'AB+', 'AB-'],
    canReceiveFrom: ['A-', 'O-'],
    noteBn: 'দুর্লভ নেগেটিভ গ্রুপ — A এবং AB উভয় পজিটিভ/নেগেটিভ রোগীদের জীবন বাঁচাতে পারেন।',
  },
  'A+': {
    group: 'A+',
    canDonateTo: ['A+', 'AB+'],
    canReceiveFrom: ['A+', 'A-', 'O+', 'O-'],
    noteBn: 'সুপরিচিত পজিটিভ গ্রুপ — A+ ও AB+ রোগীদের রক্ত দিতে পারেন এবং চারটি গ্রুপ থেকে নিতে পারেন।',
  },
  'B-': {
    group: 'B-',
    canDonateTo: ['B+', 'B-', 'AB+', 'AB-'],
    canReceiveFrom: ['B-', 'O-'],
    noteBn: 'দুর্লভ নেগেটিভ গ্রুপ — জরুরি সার্জারি ও প্রসূতি মায়েদের জন্য অত্যন্ত মূল্যবান।',
  },
  'B+': {
    group: 'B+',
    canDonateTo: ['B+', 'AB+'],
    canReceiveFrom: ['B+', 'B-', 'O+', 'O-'],
    noteBn: 'বাংলাদেশের অন্যতম প্রচলিত রক্তের গ্রুপ — B+ ও AB+ রোগীদের রক্ত দিতে পারেন।',
  },
  'AB-': {
    group: 'AB-',
    canDonateTo: ['AB+', 'AB-'],
    canReceiveFrom: ['AB-', 'A-', 'B-', 'O-'],
    noteBn: 'বিরলতম গ্রুপগুলোর একটি — সব নেগেটিভ গ্রুপ থেকে রক্ত নিতে পারেন এবং প্লাজমা দানে দারুণ কার্যকর।',
  },
  'AB+': {
    group: 'AB+',
    canDonateTo: ['AB+'],
    canReceiveFrom: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'],
    noteBn: 'সর্বজনীন গ্রহীতা (Universal Recipient) — প্রয়োজনে যেকোনো গ্রুপের রক্ত গ্রহণ করতে পারেন।',
  },
};

export interface DistrictSummary {
  districtBn: string;
  division: DivisionId;
  divisionNameBn: string;
  lat: number;
  lng: number;
}

const divisionMap = new Map<DivisionId, string>(
  BD_DIVISIONS.map((d) => [d.id, d.nameBn])
);

const districtSummaryMap = new Map<string, DistrictSummary>();
for (const place of BANGLADESH_PLACES) {
  if (!districtSummaryMap.has(place.districtBn)) {
    districtSummaryMap.set(place.districtBn, {
      districtBn: place.districtBn,
      division: place.division,
      divisionNameBn: divisionMap.get(place.division) || place.division,
      lat: place.lat,
      lng: place.lng,
    });
  }
}

export const ALL_BD_DISTRICTS: DistrictSummary[] = Array.from(
  districtSummaryMap.values()
).sort((a, b) => a.districtBn.localeCompare(b.districtBn, 'bn'));

export function getDistrictsByDivision(division: DivisionId | 'all'): DistrictSummary[] {
  if (division === 'all') return ALL_BD_DISTRICTS;
  return ALL_BD_DISTRICTS.filter((d) => d.division === division);
}

export function getDistrictCoordinates(districtBn: string): { lat: number; lng: number } {
  const found = districtSummaryMap.get(districtBn);
  if (found) return { lat: found.lat, lng: found.lng };
  return { lat: 23.7561, lng: 90.3872 };
}

export function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function findNearestBangladeshPlace(lat: number, lng: number) {
  let closest = BANGLADESH_PLACES[0];
  let minDistance = Infinity;
  for (const place of BANGLADESH_PLACES) {
    const dist = haversineDistanceKm(lat, lng, place.lat, place.lng);
    if (dist < minDistance) {
      minDistance = dist;
      closest = place;
    }
  }
  return {
    place: closest,
    distanceKm: Math.round(minDistance * 10) / 10,
  };
}

export interface ReadinessStatus {
  isReady: boolean;
  daysSince: number | null;
  daysRemaining: number;
  labelBn: string;
}

export const SAFE_DONATION_COOLDOWN_DAYS = 120;

export function calculateDonorReadiness(lastDonatedDate?: string): ReadinessStatus {
  if (!lastDonatedDate || !/^\d{4}-\d{2}-\d{2}$/.test(lastDonatedDate)) {
    return {
      isReady: true,
      daysSince: null,
      daysRemaining: 0,
      labelBn: 'রক্তদানে প্রস্তুত',
    };
  }

  const parsed = new Date(`${lastDonatedDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return {
      isReady: true,
      daysSince: null,
      daysRemaining: 0,
      labelBn: 'রক্তদানে প্রস্তুত',
    };
  }

  const now = new Date();
  const diffMs = now.getTime() - parsed.getTime();
  const daysSince = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  const daysRemaining = Math.max(0, SAFE_DONATION_COOLDOWN_DAYS - daysSince);

  if (daysRemaining === 0) {
    return {
      isReady: true,
      daysSince,
      daysRemaining: 0,
      labelBn: `রক্তদানে প্রস্তুত (${daysSince} দিন পূর্বে দান করেছেন)`,
    };
  }

  return {
    isReady: false,
    daysSince,
    daysRemaining,
    labelBn: `বিশ্রামে (${daysRemaining} দিন বাকি)`,
  };
}

export function formatRelativeTimeBn(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    const diffMin = Math.floor((Date.now() - date.getTime()) / 60000);
    if (diffMin < 1) return 'এইমাত্র';
    if (diffMin < 60) return `${diffMin} মিনিট আগে`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr} ঘণ্টা আগে`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 30) return `${diffDay} দিন আগে`;
    return date.toLocaleDateString('bn-BD', { day: 'numeric', month: 'short' });
  } catch {
    return 'সম্প্রতি';
  }
}

export interface NearbyMedicalCenter {
  id: string;
  name: string;
  type: 'blood_bank' | 'hospital' | 'clinic';
  lat: number;
  lng: number;
  distanceKm: number;
  phone?: string;
  address?: string;
}

export async function fetchNearbyMedicalCenters(
  lat: number,
  lng: number
): Promise<NearbyMedicalCenter[]> {
  const radiusMeters = 12000;
  const query = `
    [out:json][timeout:12];
    (
      node["amenity"="hospital"](around:${radiusMeters},${lat},${lng});
      way["amenity"="hospital"](around:${radiusMeters},${lat},${lng});
      node["healthcare"="blood_bank"](around:${radiusMeters},${lat},${lng});
      way["healthcare"="blood_bank"](around:${radiusMeters},${lat},${lng});
      node["amenity"="clinic"](around:6000,${lat},${lng});
    );
    out center 25;
  `;

  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!response.ok) {
    throw new Error('Failed to load nearby centers');
  }

  const data = (await response.json()) as {
    elements?: Array<{
      id: number;
      type: string;
      lat?: number;
      lon?: number;
      center?: { lat: number; lon: number };
      tags?: Record<string, string>;
    }>;
  };

  const results: NearbyMedicalCenter[] = [];
  const seenNames = new Set<string>();

  for (const el of data.elements || []) {
    const tags = el.tags || {};
    const name = tags['name:bn'] || tags.name || '';
    if (!name || seenNames.has(name.toLowerCase())) continue;

    const itemLat = el.lat ?? el.center?.lat;
    const itemLng = el.lon ?? el.center?.lon;
    if (typeof itemLat !== 'number' || typeof itemLng !== 'number') continue;

    seenNames.add(name.toLowerCase());
    const isBloodBank =
      tags.healthcare === 'blood_bank' ||
      /blood|রক্ত|সন্ধানী|sandhani|badhan|বাঁধন|quantum|কোয়ান্টাম|red crescent/i.test(name);

    results.push({
      id: `${el.type}_${el.id}`,
      name,
      type: isBloodBank
        ? 'blood_bank'
        : tags.amenity === 'hospital'
          ? 'hospital'
          : 'clinic',
      lat: itemLat,
      lng: itemLng,
      distanceKm: Math.round(haversineDistanceKm(lat, lng, itemLat, itemLng) * 10) / 10,
      phone: tags.phone || tags['contact:phone'],
      address: tags['addr:full'] || tags['addr:street'] || tags['addr:city'],
    });
  }

  results.sort((a, b) => {
    if (a.type === 'blood_bank' && b.type !== 'blood_bank') return -1;
    if (a.type !== 'blood_bank' && b.type === 'blood_bank') return 1;
    return a.distanceKm - b.distanceKm;
  });

  return results.slice(0, 18);
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function generateBloodAppealPosterDataUrl(params: {
  bloodGroup: string;
  bagsNeeded: number;
  patientName: string;
  hospital: string;
  area: string;
  district: string;
  neededTime: string;
  contactPhone: string;
  notes: string;
  posterName: string;
  component?: string;
}): string {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Clean medical editorial backdrop
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 1080, 1080);

  // Top crimson banner
  const grad = ctx.createLinearGradient(0, 0, 1080, 290);
  grad.addColorStop(0, '#b91c1c');
  grad.addColorStop(1, '#dc2626');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1080, 290);

  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText('OSA EMERGENCY BLOOD NETWORK · BANGLADESH', 72, 80);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 62px sans-serif';
  ctx.fillText('জরুরি রক্তের প্রয়োজন', 72, 165);

  ctx.fillStyle = '#fee2e2';
  ctx.font = '600 30px sans-serif';
  ctx.fillText('এক ব্যাগ রক্ত বাঁচাতে পারে একটি মূল্যবান প্রাণ', 72, 224);

  // Blood group badge box on right
  ctx.fillStyle = '#ffffff';
  drawRoundedRect(ctx, 790, 62, 220, 180, 28);
  ctx.fill();

  ctx.fillStyle = '#dc2626';
  ctx.font = 'bold 84px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(params.bloodGroup, 900, 165);
  ctx.fillStyle = '#475569';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText(`${params.bagsNeeded} ব্যাগ`, 900, 218);
  ctx.textAlign = 'left';

  // Main details card
  ctx.fillStyle = '#ffffff';
  drawRoundedRect(ctx, 64, 330, 952, 570, 32);
  ctx.fill();
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 3;
  ctx.stroke();

  const rows: Array<[string, string]> = [
    ['রোগীর নাম', params.patientName],
    ['রক্তের ধরন', params.component || 'Whole Blood'],
    ['হাসপাতাল', params.hospital],
    ['এলাকা ও জেলা', `${params.area}, ${params.district}`],
    ['কখন প্রয়োজন', params.neededTime],
    ['জরুরি যোগাযোগ', params.contactPhone],
  ];

  let y = 408;
  for (const [label, val] of rows) {
    ctx.fillStyle = '#64748b';
    ctx.font = '600 26px sans-serif';
    ctx.fillText(label, 112, y);

    ctx.fillStyle = label === 'জরুরি যোগাযোগ' ? '#b91c1c' : '#0f172a';
    ctx.font = label === 'জরুরি যোগাযোগ' ? 'bold 38px sans-serif' : 'bold 32px sans-serif';
    ctx.fillText(val.slice(0, 40), 370, y);

    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(112, y + 26);
    ctx.lineTo(968, y + 26);
    ctx.stroke();

    y += 78;
  }

  // Notes strip
  ctx.fillStyle = '#fef2f2';
  drawRoundedRect(ctx, 112, 822, 856, 56, 14);
  ctx.fill();
  ctx.fillStyle = '#991b1b';
  ctx.font = '600 24px sans-serif';
  ctx.fillText(`নোট: ${(params.notes || '').slice(0, 65)}`, 132, 858);

  // Footer
  ctx.fillStyle = '#475569';
  ctx.font = '600 26px sans-serif';
  ctx.fillText(`আবেদনকারী: ${params.posterName}`, 72, 972);
  ctx.fillStyle = '#dc2626';
  ctx.font = 'bold 26px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('OSA — Oikya Social App', 1008, 972);
  ctx.textAlign = 'left';

  return canvas.toDataURL('image/png');
}

export function generateDonorIdCardDataUrl(params: {
  name: string;
  bloodGroup: string;
  district: string;
  area: string;
  phone: string;
  totalDonations: number;
  readinessLabel: string;
}): string {
  const canvas = document.createElement('canvas');
  canvas.width = 1040;
  canvas.height = 620;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Clean architectural slate card background
  const bg = ctx.createLinearGradient(0, 0, 1040, 620);
  bg.addColorStop(0, '#0f172a');
  bg.addColorStop(1, '#1e293b');
  ctx.fillStyle = bg;
  drawRoundedRect(ctx, 0, 0, 1040, 620, 36);
  ctx.fill();

  // Crimson accent header bar
  const topGrad = ctx.createLinearGradient(0, 0, 1040, 0);
  topGrad.addColorStop(0, '#dc2626');
  topGrad.addColorStop(1, '#991b1b');
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, 1040, 130);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 34px sans-serif';
  ctx.fillText('OSA স্বেচ্ছাসেবী রক্তদাতা কার্ড', 56, 62);
  ctx.fillStyle = '#fecaca';
  ctx.font = '600 22px sans-serif';
  ctx.fillText('VOLUNTARY BLOOD DONOR IDENTITY · BANGLADESH', 56, 100);

  // Blood Group emblem on right
  ctx.fillStyle = '#ffffff';
  drawRoundedRect(ctx, 780, 175, 204, 210, 28);
  ctx.fill();
  ctx.fillStyle = '#dc2626';
  ctx.font = 'bold 86px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(params.bloodGroup, 882, 295);
  ctx.fillStyle = '#475569';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('BLOOD GROUP', 882, 355);
  ctx.textAlign = 'left';

  // Donor Details
  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 22px sans-serif';
  ctx.fillText('রক্তদাতার নাম', 56, 210);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 42px sans-serif';
  ctx.fillText(params.name.slice(0, 32), 56, 260);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 22px sans-serif';
  ctx.fillText('অবস্থান', 56, 330);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText(`${params.area}, ${params.district}`, 56, 372);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 22px sans-serif';
  ctx.fillText('জরুরি নম্বর', 56, 440);
  ctx.fillStyle = '#fca5a5';
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText(params.phone, 56, 482);

  // Footer status bar
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(0, 526, 1040, 94);
  ctx.fillStyle = '#4ade80';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText(`স্ট্যাটাস: ${params.readinessLabel}`, 56, 582);

  ctx.fillStyle = '#f8fafc';
  ctx.textAlign = 'right';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText(`মোট রক্তদান: ${params.totalDonations} বার`, 984, 582);
  ctx.textAlign = 'left';

  return canvas.toDataURL('image/png');
}
