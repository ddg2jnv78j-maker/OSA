import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Navigation,
  MapPin,
  Clock,
  AlertTriangle,
  X,
  Bike,
  Car,
  TrendingDown,
  Info,
  Compass,
  Search,
  ArrowUpDown,
  Loader2,
  Play,
  Square,
  RotateCcw,
  Share2,
  Check,
  CloudRain,
  Moon,
  Users,
  Sparkles,
  Globe,
} from 'lucide-react';
import {
  BANGLADESH_PLACES,
  BD_DIVISIONS,
  BangladeshPlace,
  DivisionId,
  PlaceTier,
} from '../../data/bangladeshPlaces';

interface SelectedLocation {
  id: string;
  name: string;
  subtitle: string;
  lat: number;
  lng: number;
  tier: PlaceTier;
  isLiveSearch?: boolean;
}

// Haversine straight-line formula (km)
function calculateHaversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toSelectedLocation(place: BangladeshPlace): SelectedLocation {
  const div = BD_DIVISIONS.find((d) => d.id === place.division);
  return {
    id: place.id,
    name: place.nameBn,
    subtitle: `${place.districtBn} • ${div?.nameBn || ''}`,
    lat: place.lat,
    lng: place.lng,
    tier: place.tier,
  };
}

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
}

interface FairRideMeterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FairRideMeterModal: React.FC<FairRideMeterModalProps> = ({ isOpen, onClose }) => {
  // Mode: 'calculator' (Any two places in Bangladesh) | 'live_meter' (Real-time GPS tracker)
  const [activeMode, setActiveMode] = useState<'calculator' | 'live_meter'>('calculator');

  // Default pickup & destination
  const [pickup, setPickup] = useState<SelectedLocation>(() =>
    toSelectedLocation(BANGLADESH_PLACES[0])
  );
  const [destination, setDestination] = useState<SelectedLocation>(() =>
    toSelectedLocation(BANGLADESH_PLACES[1])
  );

  // Location Picker Modal state ('pickup' | 'destination' | null)
  const [pickingFor, setPickingFor] = useState<'pickup' | 'destination' | null>(null);
  const [pickerDivision, setPickerDivision] = useState<DivisionId | 'all'>('all');
  const [pickerQuery, setPickerQuery] = useState('');
  const [remoteResults, setRemoteResults] = useState<SelectedLocation[]>([]);
  const [isSearchingRemote, setIsSearchingRemote] = useState(false);

  // GPS Locator state
  const [isLocatingGps, setIsLocatingGps] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Route & Distance state
  const [roadDistanceKm, setRoadDistanceKm] = useState<number | null>(null);
  const [roadDurationMins, setRoadDurationMins] = useState<number | null>(null);
  const [isFetchingRoute, setIsFetchingRoute] = useState(false);
  const [routeSource, setRouteSource] = useState<'osrm' | 'gps_est'>('gps_est');

  // Vehicle & Ride Conditions
  const [vehicle, setVehicle] = useState<'rickshaw' | 'auto' | 'cng' | 'bike'>('rickshaw');
  const [trafficLevel, setTrafficLevel] = useState<'clear' | 'moderate' | 'heavy'>('moderate');
  const [isNightOrRain, setIsNightOrRain] = useState(false);
  const [rideSharingMode, setRideSharingMode] = useState<'reserve' | 'shared'>('reserve');
  const [copiedFare, setCopiedFare] = useState(false);

  // Live GPS Trip Meter states
  const [meterRunning, setMeterRunning] = useState(false);
  const [meterDistanceKm, setMeterDistanceKm] = useState(0);
  const [meterElapsedSecs, setMeterElapsedSecs] = useState(0);
  const [meterSpeedKmh, setMeterSpeedKmh] = useState(0);
  const [meterStatusMsg, setMeterStatusMsg] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const timerRef = useRef<number | null>(null);

  // Filtered built-in places across all 64 districts
  const filteredBuiltInPlaces = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    return BANGLADESH_PLACES.filter((p) => {
      if (pickerDivision !== 'all' && p.division !== pickerDivision) return false;
      if (!q) return true;
      return (
        p.nameBn.toLowerCase().includes(q) ||
        p.nameEn.toLowerCase().includes(q) ||
        p.districtBn.toLowerCase().includes(q)
      );
    });
  }, [pickerDivision, pickerQuery]);

  // Live OpenStreetMap Nominatim search across ALL of Bangladesh
  useEffect(() => {
    if (!pickingFor) return;
    const q = pickerQuery.trim();
    if (q.length < 2) {
      setRemoteResults([]);
      setIsSearchingRemote(false);
      return;
    }

    const controller = new AbortController();
    setIsSearchingRemote(true);

    const timer = window.setTimeout(async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=bd&limit=8&accept-language=bn,en&q=${encodeURIComponent(
          q
        )}`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error('Search failed');
        const data: NominatimResult[] = await res.json();

        const mapped: SelectedLocation[] = data.map((item) => {
          const parts = item.display_name.split(',').map((s) => s.trim());
          const mainName = parts[0] || item.display_name;
          const rest = parts.slice(1, 3).join(', ') || 'বাংলাদেশ';
          const isMetro =
            /dhaka|ঢাকা|chattogram|chittagong|চট্টগ্রাম/i.test(item.display_name);
          const isDistrict =
            /district|জেলা|city|শহর|rajshahi|khulna|sylhet|barishal|rangpur|mymensingh|রাজশাহী|খুলনা|সিলেট|বরিশাল|রংপুর|ময়মনসিংহ/i.test(
              item.display_name
            );

          return {
            id: `osm_${item.place_id}`,
            name: mainName,
            subtitle: `${rest} (লাইভ ম্যাপ)`,
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon),
            tier: isMetro ? 'metro' : isDistrict ? 'district' : 'upazila',
            isLiveSearch: true,
          };
        });
        setRemoteResults(mapped);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setRemoteResults([]);
        }
      } finally {
        setIsSearchingRemote(false);
      }
    }, 450);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [pickerQuery, pickingFor]);

  // Fetch real driving route via OSRM whenever pickup or destination changes
  useEffect(() => {
    if (!isOpen) return;

    const straightKm = calculateHaversineKm(
      pickup.lat,
      pickup.lng,
      destination.lat,
      destination.lng
    );

    if (straightKm < 0.05) {
      setRoadDistanceKm(0.5);
      setRoadDurationMins(4);
      setRouteSource('gps_est');
      return;
    }

    const controller = new AbortController();
    setIsFetchingRoute(true);

    // Immediate fallback estimate while waiting
    const fallbackKm = Number(Math.max(0.5, straightKm * 1.32).toFixed(1));
    setRoadDistanceKm(fallbackKm);
    setRoadDurationMins(Math.max(3, Math.round(fallbackKm * 3.5)));
    setRouteSource('gps_est');

    fetch(
      `https://router.project-osrm.org/route/v1/driving/${pickup.lng},${pickup.lat};${destination.lng},${destination.lat}?overview=false`,
      { signal: controller.signal }
    )
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('OSRM failed'))))
      .then((data) => {
        if (data?.routes?.[0]) {
          const distKm = Number(Math.max(0.4, data.routes[0].distance / 1000).toFixed(1));
          const durMins = Math.max(2, Math.round(data.routes[0].duration / 60));
          setRoadDistanceKm(distKm);
          setRoadDurationMins(durMins);
          setRouteSource('osrm');
        }
      })
      .catch(() => {
        // Keep Haversine road estimate silently
      })
      .finally(() => {
        setIsFetchingRoute(false);
      });

    return () => controller.abort();
  }, [pickup.lat, pickup.lng, destination.lat, destination.lng, isOpen]);

  // Live Trip Meter GPS watcher + timer
  useEffect(() => {
    if (!meterRunning) {
      if (watchIdRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    if (!('geolocation' in navigator)) {
      setMeterStatusMsg('আপনার ডিভাইসে GPS সাপোর্ট নেই।');
      setMeterRunning(false);
      return;
    }

    setMeterStatusMsg('লাইভ GPS সিগন্যাল সংযুক্ত হচ্ছে...');
    timerRef.current = window.setInterval(() => {
      setMeterElapsedSecs((prev) => prev + 1);
    }, 1000);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, speed } = pos.coords;
        setMeterStatusMsg('লাইভ GPS সক্রিয় আছে');

        if (speed !== null && !Number.isNaN(speed)) {
          setMeterSpeedKmh(Math.round(speed * 3.6));
        }

        if (lastCoordsRef.current) {
          const deltaKm = calculateHaversineKm(
            lastCoordsRef.current.lat,
            lastCoordsRef.current.lng,
            latitude,
            longitude
          );
          // Filter GPS drift noise (count movement >= 10 meters)
          if (deltaKm >= 0.01 && deltaKm < 2) {
            setMeterDistanceKm((prev) => Number((prev + deltaKm).toFixed(2)));
            lastCoordsRef.current = { lat: latitude, lng: longitude };
          }
        } else {
          lastCoordsRef.current = { lat: latitude, lng: longitude };
        }
      },
      (err) => {
        setMeterStatusMsg(`GPS ত্রুটি: ${err.message || 'লোকেশন অনুমতি দিন'}`);
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
    );

    return () => {
      if (watchIdRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [meterRunning]);

  // Cleanup when modal closes
  useEffect(() => {
    if (!isOpen && meterRunning) {
      setMeterRunning(false);
    }
  }, [isOpen, meterRunning]);

  if (!isOpen) return null;

  // Detect My Real GPS Location & Reverse Geocode across Bangladesh
  const handleDetectCurrentGps = (target: 'pickup' | 'destination') => {
    if (!('geolocation' in navigator)) {
      setGpsError('আপনার ডিভাইসে GPS সুবিধা পাওয়া যায়নি।');
      return;
    }

    setIsLocatingGps(true);
    setGpsError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        let placeName = `আমার বর্তমান অবস্থান (${latitude.toFixed(3)}, ${longitude.toFixed(3)})`;
        let placeSub = 'জিপিএস লাইভ লোকেশন';
        let tier: PlaceTier = 'district';

        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=bn,en`
          );
          if (res.ok) {
            const data = await res.json();
            if (data?.address) {
              const addr = data.address;
              const area =
                addr.suburb ||
                addr.neighbourhood ||
                addr.village ||
                addr.town ||
                addr.city_district ||
                addr.road ||
                addr.city;
              const district = addr.state_district || addr.city || addr.state || 'বাংলাদেশ';
              if (area) {
                placeName = area;
                placeSub = `${district} (লাইভ GPS)`;
              }
              if (/dhaka|ঢাকা|chattogram|chittagong|চট্টগ্রাম/i.test(district)) {
                tier = 'metro';
              }
            }
          }
        } catch {
          // Fallback: find nearest built-in place in Bangladesh
          let nearest = BANGLADESH_PLACES[0];
          let minD = Infinity;
          for (const p of BANGLADESH_PLACES) {
            const d = calculateHaversineKm(latitude, longitude, p.lat, p.lng);
            if (d < minD) {
              minD = d;
              nearest = p;
            }
          }
          placeName = `${nearest.nameBn}-এর নিকটবর্তী`;
          placeSub = `${nearest.districtBn} (GPS ~${minD.toFixed(1)} কিমি)`;
          tier = nearest.tier;
        }

        const loc: SelectedLocation = {
          id: `gps_${Date.now()}`,
          name: placeName,
          subtitle: placeSub,
          lat: latitude,
          lng: longitude,
          tier,
        };

        if (target === 'pickup') {
          setPickup(loc);
        } else {
          setDestination(loc);
        }
        setIsLocatingGps(false);
        setPickingFor(null);
      },
      (err) => {
        setIsLocatingGps(false);
        setGpsError(
          err.code === 1
            ? 'লোকেশন অনুমতি (Permission) চালু করুন।'
            : 'লোকেশন শনাক্ত করা যায়নি, ম্যানুয়ালি এলাকা নির্বাচন করুন।'
        );
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Swap Pickup & Destination
  const handleSwapLocations = () => {
    const temp = pickup;
    setPickup(destination);
    setDestination(temp);
  };

  // Determine regional pricing tier (Metro vs District vs Upazila/Rural)
  const effectiveTier: PlaceTier =
    pickup.tier === 'metro' || destination.tier === 'metro'
      ? 'metro'
      : pickup.tier === 'district' || destination.tier === 'district'
      ? 'district'
      : 'upazila';

  const activeDistanceKm =
    activeMode === 'live_meter'
      ? Math.max(0.2, meterDistanceKm)
      : roadDistanceKm ?? 1.5;

  // Calculate Fare Breakdown across all of Bangladesh
  const computeFare = (distKm: number) => {
    const trafficMult =
      trafficLevel === 'heavy' ? 1.25 : trafficLevel === 'moderate' ? 1.1 : 1.0;
    const nightRainMult = isNightOrRain ? 1.15 : 1.0;
    const combinedMult = trafficMult * nightRainMult;

    const isIntercityLong = distKm > 25;

    let minFare = 30;
    let maxFare = 50;
    let eta = roadDurationMins || Math.round(distKm * 4);
    let formulaNote = '';

    if (vehicle === 'rickshaw') {
      const base = effectiveTier === 'metro' ? 30 : effectiveTier === 'district' ? 20 : 15;
      const perKm = effectiveTier === 'metro' ? 18 : effectiveTier === 'district' ? 14 : 12;
      const raw = base + Math.max(0, distKm - 1) * perKm;
      minFare = Math.round(raw * nightRainMult * (trafficLevel === 'heavy' ? 1.15 : 1));
      maxFare = Math.round(minFare * 1.25);
      eta = Math.round(distKm * (trafficLevel === 'heavy' ? 7 : 5) + 3);
      formulaNote =
        effectiveTier === 'metro'
          ? 'মেট্রো রিকশা রেট: প্রথম ১ কিমি ৳৩০, পরবর্তী প্রতি কিমি ~৳১৮'
          : effectiveTier === 'district'
          ? 'জেলা শহর রিকশা/ভ্যান: প্রথম ১ কিমি ৳২০, পরবর্তী প্রতি কিমি ~৳১৪'
          : 'উপজেলা/মফস্বল রিকশা/ভ্যান: প্রথম ১ কিমি ৳১৫, পরবর্তী প্রতি কিমি ~৳১২';
    } else if (vehicle === 'auto') {
      if (rideSharingMode === 'shared') {
        // Shared Auto / Easybike per seat rate across Bangladesh districts
        const perSeatBase = effectiveTier === 'metro' ? 15 : 10;
        const perSeatKm = effectiveTier === 'metro' ? 4.5 : 3.5;
        const raw = perSeatBase + Math.max(0, distKm - 1.5) * perSeatKm;
        minFare = Math.max(10, Math.round(raw * nightRainMult));
        maxFare = Math.round(minFare * 1.2 + 5);
        formulaNote = 'লোকাল ইজিবাইক/অটো শেয়ার (জনপ্রতি সিট ভাড়া) অনুযায়ী হিসাব';
      } else {
        // Reserve Auto / Easybike
        const base = effectiveTier === 'metro' ? 50 : 40;
        const perKm = effectiveTier === 'metro' ? 18 : 15;
        const raw = base + Math.max(0, distKm - 1.5) * perKm;
        minFare = Math.round(raw * combinedMult);
        maxFare = Math.round(minFare * 1.25);
        formulaNote = 'সম্পূর্ণ অটো/ইজিবাইক রিজার্ভ ভাড়া হিসাব';
      }
      eta = Math.round(distKm * (trafficLevel === 'heavy' ? 4.8 : 3.2) + 4);
    } else if (vehicle === 'cng') {
      if (rideSharingMode === 'shared') {
        const perSeatBase = effectiveTier === 'metro' ? 20 : 15;
        const perSeatKm = effectiveTier === 'metro' ? 6 : 4.5;
        const raw = perSeatBase + Math.max(0, distKm - 2) * perSeatKm;
        minFare = Math.max(15, Math.round(raw * nightRainMult));
        maxFare = Math.round(minFare * 1.2 + 5);
        formulaNote = 'লোকাল শেয়ার সিএনজি (জনপ্রতি সিট) অনুযায়ী প্রচলিত রেট';
      } else if (effectiveTier === 'metro' && !isIntercityLong) {
        // Official BRTA CNG Meter formula (Base 40 for first 2km, 12/km, waiting 2/min)
        const base = 40;
        const addKm = Math.max(0, distKm - 2);
        const waitMins =
          trafficLevel === 'heavy'
            ? Math.round(distKm * 4)
            : trafficLevel === 'moderate'
            ? Math.round(distKm * 2.2)
            : Math.round(distKm * 1);
        const officialMeter = base + addKm * 12 + waitMins * 2;
        minFare = Math.round(officialMeter * nightRainMult);
        maxFare = Math.round(officialMeter * 1.35 * nightRainMult);
        formulaNote = `বিআরটিএ অফিসিয়াল মিটার: প্রথম ২ কিমি ৳৪০ + ৳১২/কিমি + ওয়েটিং ৳২/মিনিট (আনুমানিক মিটার: ৳${Math.round(
          officialMeter
        )})`;
      } else {
        // Outside Metro or Inter-district CNG Reserve
        const base = 50;
        const perKm = isIntercityLong ? 14 : 18;
        const raw = base + Math.max(0, distKm - 2) * perKm;
        minFare = Math.round(raw * combinedMult);
        maxFare = Math.round(minFare * 1.25);
        formulaNote = isIntercityLong
          ? 'দূরপাল্লা/হাইওয়ে সিএনজি রিজার্ভ রেট (~৳১৪-৳১৮/কিমি)'
          : 'জেলা ও মফস্বল সিএনজি রিজার্ভ রেট: ভিত্তি ৳৫০ + ৳১৮/কিমি';
      }
      eta = Math.round(distKm * (trafficLevel === 'heavy' ? 4.2 : 2.6) + 5);
    } else {
      // Bike ride-sharing / rent
      const base = effectiveTier === 'metro' ? 30 : 25;
      const perKm = effectiveTier === 'metro' ? 14 : 12;
      const raw = base + distKm * perKm;
      minFare = Math.max(30, Math.round(raw * (trafficLevel === 'heavy' ? 1.12 : 1) * nightRainMult));
      maxFare = Math.round(minFare * 1.2);
      eta = Math.round(distKm * 2.3 + 3);
      formulaNote = 'বাইক রাইড রেট: বেস ৳২৫-৳৩০ + ৳১২-৳১৪/কিমি';
    }

    // Round to nearest 5 taka for realistic cash bargaining
    const roundTo5 = (n: number) => Math.max(10, Math.round(n / 5) * 5);
    return {
      min: roundTo5(minFare),
      max: Math.max(roundTo5(minFare) + 5, roundTo5(maxFare)),
      eta,
      formulaNote,
      isIntercityLong,
    };
  };

  const fareResult = computeFare(activeDistanceKm);

  const vehicleLabel =
    vehicle === 'rickshaw'
      ? 'রিকশা/ভ্যান'
      : vehicle === 'auto'
      ? `অটো/ইজিবাইক (${rideSharingMode === 'shared' ? 'শেয়ার' : 'রিজার্ভ'})`
      : vehicle === 'cng'
      ? `সিএনজি (${rideSharingMode === 'shared' ? 'শেয়ার' : 'রিজার্ভ'})`
      : 'মোটরসাইকেল';

  const handleCopyOrShareFare = async () => {
    const text = [
      `🇧🇩 OSA বাংলাদেশ ন্যায্য ভাড়া হিসাব`,
      `📍 রুট: ${pickup.name} ➔ ${destination.name}`,
      `📏 দূরত্ব: ${activeDistanceKm} কিমি (${routeSource === 'osrm' ? 'OSRM রোড ম্যাপ' : 'GPS'})`,
      `🚕 বাহন: ${vehicleLabel}`,
      `💰 ন্যায্য ভাড়া: ৳${fareResult.min} - ৳${fareResult.max} টাকা`,
      `⏱️ সম্ভাব্য সময়: ${fareResult.eta} মিনিট`,
    ].join('\n');

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'OSA ন্যায্য ভাড়া হিসাব', text });
        return;
      } catch {
        // Fallback to copy
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopiedFare(true);
      setTimeout(() => setCopiedFare(false), 2000);
    } catch {}
  };

  const formatMeterTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4">
      <div className="w-full max-w-2xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[93vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200 relative">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-600 text-white flex items-center justify-center shadow-lg shadow-emerald-500/25 shrink-0">
              <Navigation className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                ন্যায্য ভাড়া ও ট্রাফিক মিটার
                <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 rounded-full">
                  সারা বাংলাদেশ (৬৪ জেলা)
                </span>
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                দেশের যেকোনো গ্রাম, উপজেলা ও শহরের রিকশা, অটো, সিএনজি ও বাইক ভাড়া
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switch Tabs */}
        <div className="px-4 sm:px-5 pt-3 border-b border-slate-200 dark:border-slate-800 flex gap-2 bg-slate-50/70 dark:bg-slate-900/50">
          <button
            type="button"
            onClick={() => setActiveMode('calculator')}
            className={`flex-1 pb-2.5 text-xs sm:text-sm font-bold border-b-2 transition flex items-center justify-center gap-1.5 ${
              activeMode === 'calculator'
                ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <MapPin className="w-4 h-4" />
            <span>যেকোনো স্থানের ভাড়া হিসাব</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveMode('live_meter')}
            className={`flex-1 pb-2.5 text-xs sm:text-sm font-bold border-b-2 transition flex items-center justify-center gap-1.5 ${
              activeMode === 'live_meter'
                ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Compass className={`w-4 h-4 ${meterRunning ? 'animate-spin' : ''}`} />
            <span>লাইভ GPS চলন্ত মিটার</span>
            {meterRunning && (
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
            )}
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 flex-1 min-h-0 overflow-y-auto space-y-4">
          {gpsError && (
            <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between gap-2">
              <span>{gpsError}</span>
              <button type="button" onClick={() => setGpsError(null)} className="font-bold">
                ✕
              </button>
            </div>
          )}

          {activeMode === 'calculator' ? (
            /* Route Pickup & Destination Card */
            <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2.5 relative">
              {/* Pickup */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                    কোথা থেকে রওনা হবেন:
                  </label>
                  <button
                    type="button"
                    onClick={() => handleDetectCurrentGps('pickup')}
                    disabled={isLocatingGps}
                    className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 disabled:opacity-50"
                  >
                    {isLocatingGps ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Compass className="w-3 h-3" />
                    )}
                    আমার বর্তমান GPS অবস্থান
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPickingFor('pickup');
                    setPickerQuery('');
                    setRemoteResults([]);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-emerald-500 text-left transition flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                      {pickup.name}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">{pickup.subtitle}</p>
                  </div>
                  <span className="text-[11px] font-bold text-emerald-600 shrink-0 px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60">
                    বদলান
                  </span>
                </button>
              </div>

              {/* Swap Button */}
              <div className="flex justify-center -my-1.5 relative z-10">
                <button
                  type="button"
                  onClick={handleSwapLocations}
                  title="উৎস ও গন্তব্য অদলবদল করুন"
                  className="w-8 h-8 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-emerald-600 hover:border-emerald-400 transition active:scale-90"
                >
                  <ArrowUpDown className="w-4 h-4" />
                </button>
              </div>

              {/* Destination */}
              <div>
                <label className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5 mb-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
                  গন্তব্য স্থান (বাংলাদেশের যেকোনো স্থান):
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setPickingFor('destination');
                    setPickerQuery('');
                    setRemoteResults([]);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-emerald-500 text-left transition flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                      {destination.name}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">{destination.subtitle}</p>
                  </div>
                  <span className="text-[11px] font-bold text-red-600 shrink-0 px-2 py-1 rounded-lg bg-red-50 dark:bg-red-950/60">
                    গন্তব্য বাছুন
                  </span>
                </button>
              </div>
            </div>
          ) : (
            /* Live GPS Trip Meter Controls */
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Globe className="w-4 h-4 text-emerald-600" />
                    রিয়েল-টাইম GPS মিটার
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    গাড়িতে উঠে "মিটার শুরু করুন" চাপলে ফোনের GPS দূরত্ব ও ভাড়া লাইভ হিসাব করবে
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                  {meterSpeedKmh} কিমি/ঘণ্টা
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5 text-center">
                <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                  <span className="text-[11px] text-slate-400 block">অতিক্রান্ত দূরত্ব</span>
                  <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                    {meterDistanceKm.toFixed(2)} <span className="text-xs font-bold">কি.মি.</span>
                  </span>
                </div>
                <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                  <span className="text-[11px] text-slate-400 block">চলমান সময়</span>
                  <span className="text-2xl font-black text-slate-800 dark:text-white font-mono">
                    {formatMeterTime(meterElapsedSecs)}
                  </span>
                </div>
              </div>

              {meterStatusMsg && (
                <p className="text-[11px] text-center font-medium text-emerald-700 dark:text-emerald-400">
                  {meterStatusMsg}
                </p>
              )}

              <div className="flex gap-2">
                {!meterRunning ? (
                  <button
                    type="button"
                    onClick={() => {
                      lastCoordsRef.current = null;
                      setMeterRunning(true);
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    লাইভ মিটার শুরু করুন
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setMeterRunning(false)}
                    className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md"
                  >
                    <Square className="w-4 h-4 fill-white" />
                    মিটার থামান
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setMeterRunning(false);
                    setMeterDistanceKm(0);
                    setMeterElapsedSecs(0);
                    setMeterSpeedKmh(0);
                    lastCoordsRef.current = null;
                    setMeterStatusMsg(null);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> রিসেট
                </button>
              </div>
            </div>
          )}

          {/* Vehicle Selector (4 Bangladeshi Vehicles) */}
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
              যানবাহন নির্বাচন করুন:
            </label>
            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setVehicle('rickshaw')}
                className={`p-2.5 rounded-2xl text-center border transition ${
                  vehicle === 'rickshaw'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-700 dark:text-emerald-400 font-bold shadow-sm'
                    : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                }`}
              >
                <span className="text-lg block mb-0.5">🛺</span>
                <span className="text-[11px] block">রিকশা/ভ্যান</span>
              </button>

              <button
                type="button"
                onClick={() => setVehicle('auto')}
                className={`p-2.5 rounded-2xl text-center border transition ${
                  vehicle === 'auto'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-700 dark:text-emerald-400 font-bold shadow-sm'
                    : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                }`}
              >
                <span className="text-lg block mb-0.5">🚐</span>
                <span className="text-[11px] block">অটো/ইজিবাইক</span>
              </button>

              <button
                type="button"
                onClick={() => setVehicle('cng')}
                className={`p-2.5 rounded-2xl text-center border transition ${
                  vehicle === 'cng'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-700 dark:text-emerald-400 font-bold shadow-sm'
                    : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                }`}
              >
                <Car className="w-5 h-5 mx-auto mb-1 text-emerald-600" />
                <span className="text-[11px] block">সিএনজি</span>
              </button>

              <button
                type="button"
                onClick={() => setVehicle('bike')}
                className={`p-2.5 rounded-2xl text-center border transition ${
                  vehicle === 'bike'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-700 dark:text-emerald-400 font-bold shadow-sm'
                    : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                }`}
              >
                <Bike className="w-5 h-5 mx-auto mb-1 text-blue-600" />
                <span className="text-[11px] block">বাইক</span>
              </button>
            </div>
          </div>

          {/* Ride & Traffic Options Row */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Traffic Switch */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-[11px] font-bold">
              {(['clear', 'moderate', 'heavy'] as const).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setTrafficLevel(lvl)}
                  className={`px-2.5 py-1 rounded-lg transition ${
                    trafficLevel === lvl
                      ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-xs'
                      : 'text-slate-500'
                  }`}
                >
                  {lvl === 'clear' ? 'রাস্তা ফাঁকা' : lvl === 'moderate' ? 'মাঝারি জ্যাম' : 'তীব্র জ্যাম'}
                </button>
              ))}
            </div>

            {/* Night / Rain Toggle */}
            <button
              type="button"
              onClick={() => setIsNightOrRain(!isNightOrRain)}
              className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border flex items-center gap-1 transition ${
                isNightOrRain
                  ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-400 text-indigo-700 dark:text-indigo-300'
                  : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
              }`}
            >
              <Moon className="w-3 h-3" />
              <CloudRain className="w-3 h-3" />
              রাত/বৃষ্টি (+১৫%)
            </button>

            {/* Reserve vs Shared Toggle for Auto & CNG */}
            {(vehicle === 'auto' || vehicle === 'cng') && (
              <div className="flex items-center gap-1 p-1 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => setRideSharingMode('reserve')}
                  className={`px-2 py-1 rounded-lg transition ${
                    rideSharingMode === 'reserve'
                      ? 'bg-amber-600 text-white'
                      : 'text-amber-700 dark:text-amber-300'
                  }`}
                >
                  রিজার্ভ
                </button>
                <button
                  type="button"
                  onClick={() => setRideSharingMode('shared')}
                  className={`px-2 py-1 rounded-lg transition flex items-center gap-1 ${
                    rideSharingMode === 'shared'
                      ? 'bg-amber-600 text-white'
                      : 'text-amber-700 dark:text-amber-300'
                  }`}
                >
                  <Users className="w-3 h-3" /> শেয়ার (সিট)
                </button>
              </div>
            )}
          </div>

          {/* Fare Card Result */}
          <div className="p-5 rounded-3xl bg-gradient-to-br from-emerald-600 via-teal-600 to-emerald-700 text-white shadow-xl shadow-emerald-600/25 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-100 flex items-center gap-1">
                <TrendingDown className="w-4 h-4" /> প্রস্তাবিত ন্যায্য ভাড়া রেঞ্জ
              </span>
              <div className="flex items-center gap-1.5">
                {isFetchingRoute && <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-100" />}
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-white/20">
                  {routeSource === 'osrm' ? 'রাস্তার দূরত্ব' : 'দূরত্ব'}: {activeDistanceKm} কি.মি.
                </span>
              </div>
            </div>

            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <div className="flex items-baseline gap-2">
                <h3 className="text-3xl sm:text-4xl font-black">
                  ৳{fareResult.min} - ৳{fareResult.max}
                </h3>
                <span className="text-xs text-emerald-100">
                  টাকা {rideSharingMode === 'shared' && (vehicle === 'auto' || vehicle === 'cng') ? '(জনপ্রতি)' : ''}
                </span>
              </div>

              <button
                type="button"
                onClick={handleCopyOrShareFare}
                className="px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-bold flex items-center gap-1.5 transition active:scale-95"
              >
                {copiedFare ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
                {copiedFare ? 'কপি হয়েছে' : 'শেয়ার/কপি'}
              </button>
            </div>

            <div className="pt-2.5 border-t border-white/20 flex items-center justify-between text-xs text-emerald-50 flex-wrap gap-2">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> সম্ভাব্য সময়: ~{fareResult.eta} মিনিট
              </span>
              <span className="flex items-center gap-1 font-bold">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-300" />
                {effectiveTier === 'metro'
                  ? 'মেট্রো সিটি রেট'
                  : effectiveTier === 'district'
                  ? 'জেলা শহর রেট'
                  : 'উপজেলা/মফস্বল রেট'}
              </span>
            </div>
          </div>

          {fareResult.isIntercityLong && (
            <div className="p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 flex items-start gap-2 text-xs text-blue-800 dark:text-blue-200">
              <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <p>
                এটি একটি দীর্ঘ/আন্তঃজেলা রুট ({activeDistanceKm} কি.মি.)। এই দূরত্বে সাধারণত সিএনজি রিজার্ভ, বাস বা রেন্ট-এ-কার ব্যবহার করা বেশি সাশ্রয়ী।
              </p>
            </div>
          )}

          {/* Formula Info Box */}
          <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-300">
            <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold">{fareResult.formulaNote}</p>
              <p className="text-[11px] opacity-90">
                বিআরটিএ নীতিমালা এবং বাংলাদেশের ৬৪ জেলার বর্তমান গড় ভাড়ার ভিত্তিতে এই হিসাব তৈরি। চালক অতিরিক্ত ভাড়া চাইলে এই ন্যায্য হিসাব দেখিয়ে দরদাম করতে পারেন।
              </p>
            </div>
          </div>
        </div>

        {/* Full-Bangladesh Search & 8-Division Picker Overlay */}
        {pickingFor && (
          <div className="absolute inset-0 z-30 bg-white dark:bg-slate-900 flex flex-col animate-in fade-in duration-150">
            {/* Picker Header */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  {pickingFor === 'pickup' ? 'রওনা হওয়ার স্থান বাছুন' : 'গন্তব্য স্থান বাছুন'}
                </h3>
                <p className="text-[11px] text-slate-400">
                  বাংলাদেশের যেকোনো জেলা, উপজেলা, বাজার, রাস্তা বা এলাকার নাম লিখুন
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPickingFor(null)}
                className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Live Search Box + GPS button */}
            <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 space-y-2.5">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  autoFocus
                  value={pickerQuery}
                  onChange={(e) => setPickerQuery(e.target.value)}
                  placeholder="যেমন: পাথরঘাটা, কক্সবাজার, মিরপুর ১০, কুমিল্লা, সিলেট..."
                  className="w-full pl-10 pr-9 py-2.5 text-xs sm:text-sm rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-transparent focus:border-emerald-500 focus:outline-none"
                />
                {pickerQuery && (
                  <button
                    type="button"
                    onClick={() => setPickerQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handleDetectCurrentGps(pickingFor)}
                  disabled={isLocatingGps}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shrink-0"
                >
                  {isLocatingGps ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Compass className="w-3.5 h-3.5" />
                  )}
                  আমার বর্তমান GPS লোকেশন ব্যবহার করুন
                </button>
                <span className="text-[11px] text-slate-400 truncate">
                  {isSearchingRemote ? 'অনলাইন ম্যাপে খোঁজা হচ্ছে...' : '৬৪ জেলা + লাইভ সার্চ'}
                </span>
              </div>

              {/* 8 Divisions Filter Chips */}
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar pt-0.5">
                <button
                  type="button"
                  onClick={() => setPickerDivision('all')}
                  className={`px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap transition ${
                    pickerDivision === 'all'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  সব বিভাগ (৬৪ জেলা)
                </button>
                {BD_DIVISIONS.map((div) => (
                  <button
                    key={div.id}
                    type="button"
                    onClick={() => setPickerDivision(div.id)}
                    className={`px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap transition ${
                      pickerDivision === div.id
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {div.nameBn.replace(' বিভাগ', '')}
                  </button>
                ))}
              </div>
            </div>

            {/* Results List */}
            <div className="flex-1 min-h-0 overflow-y-auto p-3.5 space-y-3">
              {/* Live Online Map Results (Any street/village/upazila in BD) */}
              {pickerQuery.trim().length >= 2 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1">
                      <Globe className="w-3.5 h-3.5" />
                      সারা বাংলাদেশের লাইভ ম্যাপ ফলাফল
                    </span>
                    {isSearchingRemote && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />}
                  </div>

                  {remoteResults.length > 0 ? (
                    remoteResults.map((loc) => (
                      <button
                        key={loc.id}
                        type="button"
                        onClick={() => {
                          if (pickingFor === 'pickup') setPickup(loc);
                          else setDestination(loc);
                          setPickingFor(null);
                        }}
                        className="w-full p-2.5 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-950/60 border border-blue-200/70 dark:border-blue-900 text-left flex items-center gap-2.5 transition"
                      >
                        <MapPin className="w-4 h-4 text-blue-600 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {loc.name}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {loc.subtitle}
                          </p>
                        </div>
                      </button>
                    ))
                  ) : !isSearchingRemote ? (
                    <p className="text-[11px] text-slate-400 px-1">
                      অতিরিক্ত কোনো লাইভ ম্যাপ ফলাফল পাওয়া যায়নি (বাংলা বা ইংরেজিতে আরেকটু স্পষ্ট করে লিখুন)।
                    </p>
                  ) : null}
                </div>
              )}

              {/* Built-in 64 Districts & Major Hubs */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-bold text-slate-500 px-1">
                  বাংলাদেশের জেলা, উপজেলা ও গুরুত্বপূর্ণ কেন্দ্র ({filteredBuiltInPlaces.length}টি)
                </p>

                {filteredBuiltInPlaces.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">
                    তালিকায় এই নামে কিছু পাওয়া যায়নি — উপরের "লাইভ ম্যাপ ফলাফল" থেকে নির্বাচন করুন।
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {filteredBuiltInPlaces.map((p) => {
                      const loc = toSelectedLocation(p);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            if (pickingFor === 'pickup') setPickup(loc);
                            else setDestination(loc);
                            setPickingFor(null);
                          }}
                          className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border border-slate-200 dark:border-slate-700 hover:border-emerald-400 text-left flex items-center gap-2.5 transition"
                        >
                          <MapPin className="w-4 h-4 text-emerald-600 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                              {loc.name}
                            </p>
                            <p className="text-[10px] text-slate-400 truncate">{loc.subtitle}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
