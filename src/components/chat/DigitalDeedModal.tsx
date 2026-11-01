import React, { useRef, useState, useEffect } from 'react';
import {
  FileCheck,
  CheckCircle,
  X,
  PenTool,
  RotateCcw,
  Shield,
  Download,
  Award,
  Sparkles,
} from 'lucide-react';
import confetti from 'canvas-confetti';

export interface DigitalDeedData {
  id: string;
  deedNumber: string;
  title: string;
  partyAName: string;
  partyAId: string;
  partyASignature: string; // base64 png
  partyBName: string;
  partyBId?: string;
  partyBSignature?: string; // base64 png
  terms: string[];
  amountOrValue?: string;
  status: 'pending_countersign' | 'ratified';
  createdAt: string;
  ratifiedAt?: string;
}

interface DigitalDeedModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateDeed: (deed: DigitalDeedData) => void;
  partyAName: string;
  partyAId: string;
  partyBName: string;
  partyBId?: string;
  language?: string;
}

export const DigitalDeedModal: React.FC<DigitalDeedModalProps> = ({
  isOpen,
  onClose,
  onCreateDeed,
  partyAName,
  partyAId,
  partyBName,
  partyBId,
  language = 'en',
}) => {
  const isBn = language === 'bn';

  const [title, setTitle] = useState('');
  const [amountOrValue, setAmountOrValue] = useState('');
  const [termInputs, setTermInputs] = useState<string[]>([
    isBn ? 'উভয় পক্ষ পারস্পরিক সম্মতিতে এই চুক্তিতে একমত হয়েছেন।' : 'Both parties agree to uphold the terms in mutual good faith.',
    isBn ? 'প্রতিশ্রুত কাজ বা লেনদেন নির্ধারিত সময়ে সম্পন্ন করা হবে।' : 'The agreed deliverable or payment shall be settled by the agreed deadline.',
  ]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    if (isOpen && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.strokeStyle = '#1e3a8a'; // Deep official blue ink
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
    }
  }, [isOpen]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    setHasSignature(true);

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasSignature(false);
    }
  };

  const handleCreate = () => {
    if (!title.trim() || !hasSignature || !canvasRef.current) return;

    const sigData = canvasRef.current.toDataURL('image/png');
    const deedId = `deed_${Date.now()}`;
    const deedNumber = `OSA-PACT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const newDeed: DigitalDeedData = {
      id: deedId,
      deedNumber,
      title: title.trim(),
      partyAName,
      partyAId,
      partyASignature: sigData,
      partyBName,
      partyBId,
      terms: termInputs.filter((t) => t.trim().length > 0),
      amountOrValue: amountOrValue.trim() || undefined,
      status: 'pending_countersign',
      createdAt: new Date().toISOString(),
    };

    confetti({
      particleCount: 40,
      spread: 60,
      origin: { y: 0.7 },
      colors: ['#3b82f6', '#10b981', '#f59e0b'],
    });

    onCreateDeed(newDeed);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-lg bg-amber-50/95 dark:bg-slate-950 text-slate-900 dark:text-slate-100 rounded-3xl border-2 border-amber-600/30 dark:border-amber-500/20 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Notary Stamp Top Banner */}
        <div className="px-6 py-4 bg-gradient-to-r from-amber-900 via-amber-800 to-amber-900 text-amber-100 border-b border-amber-700/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-400 text-amber-950 flex items-center justify-center shadow-lg font-black text-sm">
              <FileCheck className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-amber-100 flex items-center gap-2">
                {isBn ? 'ডিজিটাল ডিড ও নন-জুডিশিয়াল স্ট্যাম্প' : 'OSA Digital Deed & Mutual Pact'}
              </h3>
              <p className="text-[11px] text-amber-300/80">
                {isBn ? 'অন-স্ক্রিন ডিজিটাল স্বাক্ষর ও পারস্পরিক অঙ্গীকার' : 'Cryptographic pact with live finger signature'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-amber-200 hover:text-white hover:bg-amber-800/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Document Body Styled Like Legal Bond Paper */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs flex-1">
          {/* Header watermark notice */}
          <div className="p-3 rounded-2xl bg-amber-100/70 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 flex items-center justify-between font-mono">
            <span className="font-bold">NON-JUDICIAL DIGITAL BOND</span>
            <span className="text-[10px] bg-amber-200 dark:bg-amber-900/80 px-2 py-0.5 rounded-md font-semibold">
              STANDARD B-7
            </span>
          </div>

          {/* Deed Title */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              {isBn ? 'চুক্তির নাম / শিরোনাম' : 'Deed / Agreement Title'}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                isBn
                  ? 'যেমন: ফ্রিল্যান্স প্রজেক্টের ডেলিভারি ও পেমেন্ট শর্ত'
                  : 'e.g., Freelance Project Agreement / Shared Apartment Rules'
              }
              className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-amber-300 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {/* Parties Meta */}
          <div className="grid grid-cols-2 gap-3 p-3 rounded-2xl bg-white/60 dark:bg-slate-900/60 border border-black/5 dark:border-white/5">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                {isBn ? 'প্রথম পক্ষ (আপনি)' : 'First Party (You)'}
              </span>
              <p className="font-bold text-sm text-amber-800 dark:text-amber-400">{partyAName}</p>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                {isBn ? 'দ্বিতীয় পক্ষ' : 'Second Party'}
              </span>
              <p className="font-bold text-sm text-slate-800 dark:text-slate-200">{partyBName}</p>
            </div>
          </div>

          {/* Value / Amount */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              {isBn ? 'মূল্যমান / লেনদেন (যদি থাকে)' : 'Consideration / Value (Optional)'}
            </label>
            <input
              type="text"
              value={amountOrValue}
              onChange={(e) => setAmountOrValue(e.target.value)}
              placeholder="e.g. ৳15,000 / 50% Revenue Share"
              className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-amber-300 dark:border-slate-700 text-sm focus:outline-none"
            />
          </div>

          {/* Terms & Clauses */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              {isBn ? 'চুক্তির শর্তসমূহ' : 'Terms & Clauses'}
            </label>
            <div className="space-y-2">
              {termInputs.map((term, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-amber-200 dark:bg-amber-900 text-amber-800 dark:text-amber-200 text-[10px] font-bold flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <input
                    type="text"
                    value={term}
                    onChange={(e) => {
                      const next = [...termInputs];
                      next[idx] = e.target.value;
                      setTermInputs(next);
                    }}
                    className="flex-1 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs focus:outline-none"
                  />
                  {termInputs.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setTermInputs(termInputs.filter((_, i) => i !== idx))}
                      className="p-1 text-slate-400 hover:text-rose-500"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setTermInputs([...termInputs, ''])}
                className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 hover:underline"
              >
                + {isBn ? 'নতুন শর্ত যোগ করুন' : 'Add another clause'}
              </button>
            </div>
          </div>

          {/* Finger Signature Canvas */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <PenTool className="w-3.5 h-3.5 text-blue-600" />
                <span>{isBn ? 'প্রথম পক্ষের স্বাক্ষর (স্ক্রিনে আঙুল দিয়ে আঁকুন)' : 'Party A Signature (Draw with finger)'}</span>
              </label>
              {hasSignature && (
                <button
                  type="button"
                  onClick={clearSignature}
                  className="text-[10px] text-rose-500 hover:underline flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>{isBn ? 'পুনরায় মুছুন' : 'Clear'}</span>
                </button>
              )}
            </div>

            <div className="relative rounded-2xl border-2 border-dashed border-amber-400 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden shadow-inner">
              <canvas
                ref={canvasRef}
                width={420}
                height={120}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                className="w-full h-[100px] touch-none cursor-crosshair"
              />
              {!hasSignature && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center text-slate-400 text-xs italic">
                  {isBn ? 'এখানে আঙুল দিয়ে সই করুন ✍️' : 'Sign here with finger / stylus ✍️'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-amber-100/80 dark:bg-slate-900 border-t border-amber-300 dark:border-slate-800 flex items-center justify-between">
          <div className="text-[11px] text-slate-500 flex items-center gap-1">
            <Shield className="w-3.5 h-3.5 text-amber-600" />
            <span>{isBn ? 'দ্বিতীয় পক্ষ চ্যাট থেকে পাল্টা স্বাক্ষর করবেন' : 'Party B will countersign in chat'}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-black/5"
            >
              {isBn ? 'বাতিল' : 'Cancel'}
            </button>
            <button
              disabled={!title.trim() || !hasSignature}
              onClick={handleCreate}
              className="px-5 py-2.5 rounded-2xl bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs shadow-md shadow-amber-700/30 disabled:opacity-40 flex items-center gap-2 transition-all active:scale-95"
            >
              <FileCheck className="w-4 h-4" />
              <span>{isBn ? 'ডিড জারি করুন' : 'Issue Deed'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
