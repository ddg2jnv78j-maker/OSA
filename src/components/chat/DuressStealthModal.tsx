import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldAlert,
  MapPin,
  Battery,
  Mic,
  AlertTriangle,
  X,
  VolumeX,
  Radio,
  Lock,
} from 'lucide-react';
import { getCurrentDeviceLocation } from '../../services/permissionService';

export interface DuressAlertData {
  id: string;
  senderName: string;
  senderId: string;
  timestamp: string;
  latitude: number;
  longitude: number;
  mapsUrl: string;
  batteryLevel?: number;
  isSilent: boolean;
  notes: string;
}

interface DuressStealthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendDuressAlert: (alert: DuressAlertData) => void;
  currentUserName: string;
  currentUserId: string;
  language?: string;
}

export const DuressStealthModal: React.FC<DuressStealthModalProps> = ({
  isOpen,
  onClose,
  onSendDuressAlert,
  currentUserName,
  currentUserId,
  language = 'en',
}) => {
  const isBn = language === 'bn';

  // Working disguised calculator state
  const [calcDisplay, setCalcDisplay] = useState('0');
  const [prevVal, setPrevVal] = useState<number | null>(null);
  const [operation, setOperation] = useState<string | null>(null);
  const [clearOnNext, setClearOnNext] = useState(false);

  // Stealth Trigger State
  const [isTriggering, setIsTriggering] = useState(false);
  const [triggerProgress, setTriggerProgress] = useState(0);
  const [beaconSent, setBeaconSent] = useState(false);
  const pressTimerRef = useRef<number | null>(null);

  if (!isOpen) return null;

  const handleCalcNumber = (num: string) => {
    if (calcDisplay === '0' || clearOnNext) {
      setCalcDisplay(num);
      setClearOnNext(false);
    } else {
      setCalcDisplay((prev) => prev + num);
    }
  };

  const handleCalcOp = (op: string) => {
    setPrevVal(parseFloat(calcDisplay));
    setOperation(op);
    setClearOnNext(true);
  };

  const handleCalcEquals = () => {
    // Secret trigger code check e.g. 911 or 000
    if (calcDisplay === '911' || calcDisplay === '999' || calcDisplay === '0000') {
      executeSilentSos();
      return;
    }

    if (operation && prevVal !== null) {
      const current = parseFloat(calcDisplay);
      let res = current;
      if (operation === '+') res = prevVal + current;
      if (operation === '-') res = prevVal - current;
      if (operation === '×') res = prevVal * current;
      if (operation === '÷') res = current !== 0 ? prevVal / current : 0;
      setCalcDisplay(String(Math.round(res * 10000) / 10000));
      setPrevVal(null);
      setOperation(null);
      setClearOnNext(true);
    }
  };

  const handleCalcClear = () => {
    setCalcDisplay('0');
    setPrevVal(null);
    setOperation(null);
  };

  const executeSilentSos = async () => {
    setIsTriggering(true);

    let lat = 23.8103;
    let lon = 90.4125;
    try {
      const loc = await getCurrentDeviceLocation(currentUserId);
      lat = loc.coords.latitude;
      lon = loc.coords.longitude;
    } catch {
      // Fallback
    }

    let batteryLvl: number | undefined;
    try {
      if ('getBattery' in navigator) {
        const b = await (navigator as any).getBattery();
        batteryLvl = Math.round(b.level * 100);
      }
    } catch {}

    const alertData: DuressAlertData = {
      id: `duress_${Date.now()}`,
      senderName: currentUserName,
      senderId: currentUserId,
      timestamp: new Date().toISOString(),
      latitude: lat,
      longitude: lon,
      mapsUrl: `https://www.google.com/maps?q=${lat},${lon}`,
      batteryLevel: batteryLvl,
      isSilent: true,
      notes: isBn
        ? '⚠️ জরুরি নীরব সতর্কতা: প্রেরক ছদ্মবেশী মোড থেকে এসওএস সক্রিয় করেছেন।'
        : '⚠️ EMERGENCY SILENT BEACON: Sender triggered duress alert under stealth mode.',
    };

    if ('vibrate' in navigator) {
      navigator.vibrate([100, 50, 100, 50, 200]);
    }

    onSendDuressAlert(alertData);
    setBeaconSent(true);
    setIsTriggering(false);

    setTimeout(() => {
      setBeaconSent(false);
      onClose();
    }, 1500);
  };

  const startHoldSos = () => {
    let p = 0;
    pressTimerRef.current = window.setInterval(() => {
      p += 10;
      setTriggerProgress(p);
      if (p >= 100) {
        if (pressTimerRef.current) clearInterval(pressTimerRef.current);
        executeSilentSos();
      }
    }, 150);
  };

  const cancelHoldSos = () => {
    if (pressTimerRef.current) clearInterval(pressTimerRef.current);
    setTriggerProgress(0);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-xs bg-slate-950 text-white rounded-3xl border border-slate-800 shadow-2xl overflow-hidden flex flex-col">
        {/* Stealth Calculator Top Bar */}
        <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-600 inline-block" />
            <span className="text-xs font-mono font-bold text-slate-400">Calculator Pro</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Calculator Display Screen */}
        <div className="p-4 bg-slate-950 text-right min-h-[90px] flex flex-col justify-end">
          <span className="text-[10px] text-slate-500 font-mono">
            {prevVal !== null && operation ? `${prevVal} ${operation}` : ''}
          </span>
          <span className="text-3xl font-mono font-bold tracking-tight text-white truncate">
            {calcDisplay}
          </span>
        </div>

        {/* Calculator Keypad */}
        <div className="p-3 bg-slate-900/90 grid grid-cols-4 gap-2 text-sm font-semibold select-none">
          <button
            onClick={handleCalcClear}
            className="p-3 rounded-2xl bg-slate-800 text-rose-400 active:bg-slate-700"
          >
            AC
          </button>
          <button
            onClick={() => {
              const val = parseFloat(calcDisplay);
              setCalcDisplay(String(-val));
            }}
            className="p-3 rounded-2xl bg-slate-800 text-slate-300 active:bg-slate-700"
          >
            ±
          </button>
          <button
            onClick={() => {
              const val = parseFloat(calcDisplay);
              setCalcDisplay(String(val / 100));
            }}
            className="p-3 rounded-2xl bg-slate-800 text-slate-300 active:bg-slate-700"
          >
            %
          </button>
          <button
            onClick={() => handleCalcOp('÷')}
            className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 active:bg-amber-500/30"
          >
            ÷
          </button>

          {['7', '8', '9'].map((n) => (
            <button
              key={n}
              onClick={() => handleCalcNumber(n)}
              className="p-3 rounded-2xl bg-slate-800 text-white active:bg-slate-700"
            >
              {n}
            </button>
          ))}
          <button
            onClick={() => handleCalcOp('×')}
            className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 active:bg-amber-500/30"
          >
            ×
          </button>

          {['4', '5', '6'].map((n) => (
            <button
              key={n}
              onClick={() => handleCalcNumber(n)}
              className="p-3 rounded-2xl bg-slate-800 text-white active:bg-slate-700"
            >
              {n}
            </button>
          ))}
          <button
            onClick={() => handleCalcOp('-')}
            className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 active:bg-amber-500/30"
          >
            −
          </button>

          {['1', '2', '3'].map((n) => (
            <button
              key={n}
              onClick={() => handleCalcNumber(n)}
              className="p-3 rounded-2xl bg-slate-800 text-white active:bg-slate-700"
            >
              {n}
            </button>
          ))}
          <button
            onClick={() => handleCalcOp('+')}
            className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 active:bg-amber-500/30"
          >
            +
          </button>

          <button
            onClick={() => handleCalcNumber('0')}
            className="col-span-2 p-3 rounded-2xl bg-slate-800 text-white active:bg-slate-700"
          >
            0
          </button>
          <button
            onClick={() => {
              if (!calcDisplay.includes('.')) setCalcDisplay(calcDisplay + '.');
            }}
            className="p-3 rounded-2xl bg-slate-800 text-white active:bg-slate-700"
          >
            .
          </button>
          <button
            onClick={handleCalcEquals}
            onMouseDown={startHoldSos}
            onMouseUp={cancelHoldSos}
            onTouchStart={startHoldSos}
            onTouchEnd={cancelHoldSos}
            className={`p-3 rounded-2xl font-bold transition-all ${
              triggerProgress > 0
                ? 'bg-rose-600 text-white'
                : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
            }`}
          >
            =
          </button>
        </div>

        {/* Discreet Silent Beacon Progress or Notice */}
        <div className="px-4 py-3 bg-slate-950 border-t border-slate-800/80 text-[11px] text-slate-500 flex items-center justify-between">
          {beaconSent ? (
            <span className="text-emerald-400 font-bold flex items-center gap-1.5 animate-pulse">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>{isBn ? 'নীরব এসওএস পাঠানো হয়েছে' : 'Silent Beacon Transmitted ✓'}</span>
            </span>
          ) : triggerProgress > 0 ? (
            <div className="w-full space-y-1">
              <div className="flex justify-between text-[10px] text-rose-400 font-bold">
                <span>Silent SOS Arming...</span>
                <span>{triggerProgress}%</span>
              </div>
              <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-rose-500 transition-all"
                  style={{ width: `${triggerProgress}%` }}
                />
              </div>
            </div>
          ) : (
            <span className="text-[10px] text-slate-500 flex items-center gap-1">
              <Lock className="w-3 h-3" />
              <span>Type 911= or hold '=' for Silent SOS</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
