import React, { useState } from 'react';
import {
  Scale,
  Handshake,
  ArrowRight,
  Sparkles,
  Check,
  X,
  DollarSign,
  TrendingUp,
  Percent,
} from 'lucide-react';
import confetti from 'canvas-confetti';

export interface BargainDealData {
  id: string;
  itemTitle: string;
  sellerName: string;
  sellerPrice: number;
  buyerName: string;
  buyerOffer: number;
  compromisePrice: number;
  buyerSavings: number;
  sellerConcession: number;
  shippingOption: 'split' | 'buyer' | 'seller';
  shippingCost?: number;
  finalTotal: number;
  status: 'pending' | 'accepted';
  createdAt: string;
}

interface BargainArbiterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendDeal: (deal: BargainDealData) => void;
  sellerName: string;
  buyerName: string;
  language?: string;
}

export const BargainArbiterModal: React.FC<BargainArbiterModalProps> = ({
  isOpen,
  onClose,
  onSendDeal,
  sellerName,
  buyerName,
  language = 'en',
}) => {
  const isBn = language === 'bn';

  const [itemTitle, setItemTitle] = useState('');
  const [sellerPrice, setSellerPrice] = useState('');
  const [buyerOffer, setBuyerOffer] = useState('');
  const [shippingCost, setShippingCost] = useState('100');
  const [shippingOption, setShippingOption] = useState<'split' | 'buyer' | 'seller'>('split');

  if (!isOpen) return null;

  const sPrice = parseFloat(sellerPrice) || 0;
  const bOffer = parseFloat(buyerOffer) || 0;
  const ship = parseFloat(shippingCost) || 0;

  // Fair Midpoint Compromise
  const compromisePrice = sPrice > 0 && bOffer > 0 ? Math.round((sPrice + bOffer) / 2) : 0;
  const buyerSavings = sPrice > 0 ? Math.max(0, sPrice - compromisePrice) : 0;
  const sellerConcession = sPrice > 0 ? Math.max(0, sPrice - compromisePrice) : 0;

  let calculatedShip = 0;
  if (shippingOption === 'split') calculatedShip = Math.round(ship / 2);
  else if (shippingOption === 'buyer') calculatedShip = ship;

  const finalTotal = compromisePrice + calculatedShip;

  const handleProposeDeal = () => {
    if (!itemTitle.trim() || compromisePrice <= 0) return;

    const deal: BargainDealData = {
      id: `bargain_${Date.now()}`,
      itemTitle: itemTitle.trim(),
      sellerName,
      sellerPrice: sPrice,
      buyerName,
      buyerOffer: bOffer,
      compromisePrice,
      buyerSavings,
      sellerConcession,
      shippingOption,
      shippingCost: ship,
      finalTotal,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    confetti({
      particleCount: 40,
      spread: 60,
      origin: { y: 0.7 },
      colors: ['#10b981', '#6366f1', '#f59e0b'],
    });

    onSendDeal(deal);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-md bg-slate-950 text-white rounded-3xl border border-indigo-500/30 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-indigo-950/70 via-slate-950 to-blue-950/70 border-b border-indigo-500/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-500 to-blue-500 text-white flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <Scale className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-indigo-200">
                {isBn ? 'দরদাম ও সমঝোতা সালিশদার' : 'Fair Bargain & Deal Arbiter'}
              </h3>
              <p className="text-xs text-indigo-400/80">
                {isBn
                  ? 'গাণিতিক উইন-উইন মধ্যস্থতা ও ন্যায্য মূল্য নির্ধারণ'
                  : 'Nash-equilibrium algorithmic midpoint compromise'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs flex-1">
          {/* Item Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              {isBn ? 'পণ্য বা সার্ভিসের নাম' : 'Item / Service Title'}
            </label>
            <input
              type="text"
              value={itemTitle}
              onChange={(e) => setItemTitle(e.target.value)}
              placeholder={isBn ? 'যেমন: কাশ্মীরি শাল / ওয়েব ডিজাইন প্রজেক্ট' : 'e.g. Smartphone / Freelance Logo / Rent'}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Pricing Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-amber-400 mb-1">
                {isBn ? 'বিক্রেতার চাওয়া মূল্য' : 'Seller Ask Price (৳)'}
              </label>
              <input
                type="number"
                value={sellerPrice}
                onChange={(e) => setSellerPrice(e.target.value)}
                placeholder="e.g. 2500"
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm font-mono focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-cyan-400 mb-1">
                {isBn ? 'ক্রেতার অফার মূল্য' : 'Buyer Bid Offer (৳)'}
              </label>
              <input
                type="number"
                value={buyerOffer}
                onChange={(e) => setBuyerOffer(e.target.value)}
                placeholder="e.g. 1800"
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Shipping / Extra Cost Split */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              {isBn ? 'ডেলিভারি বা অতিরিক্ত খরচ' : 'Delivery / Extra Handling Fee'}
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                value={shippingCost}
                onChange={(e) => setShippingCost(e.target.value)}
                placeholder="100"
                className="w-24 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm font-mono focus:outline-none"
              />
              <div className="flex-1 grid grid-cols-3 gap-1">
                {[
                  { id: 'split', label: isBn ? '৫০/৫০ ভাগ' : '50/50 Split' },
                  { id: 'buyer', label: isBn ? 'ক্রেতা দিবে' : 'Buyer Pays' },
                  { id: 'seller', label: isBn ? 'ফ্রি (বিক্রেতা)' : 'Free Ship' },
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setShippingOption(s.id as any)}
                    className={`py-1.5 px-2 rounded-xl text-[10px] font-bold border transition-all ${
                      shippingOption === s.id
                        ? 'bg-indigo-600 text-white border-indigo-500'
                        : 'bg-slate-900 text-slate-400 border-slate-800'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Algorithmic Compromise Card Preview */}
          {compromisePrice > 0 && (
            <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-950/70 via-slate-900 to-indigo-950/70 border border-indigo-500/40 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-indigo-500/20">
                <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-400 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{isBn ? 'সালিশদারের ন্যায্য প্রস্তাব' : 'ARBITER PROPOSED FAIR PRICE'}</span>
                </span>
                <span className="text-xl font-black font-mono text-emerald-400">৳{finalTotal}</span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2 rounded-xl bg-emerald-950/40 border border-emerald-500/20 text-emerald-300">
                  <span className="block font-bold">
                    {isBn ? 'ক্রেতার লাভ (বাঁচল)' : 'Buyer Savings'}
                  </span>
                  <span className="text-base font-black font-mono">৳{buyerSavings}</span>
                </div>
                <div className="p-2 rounded-xl bg-blue-950/40 border border-blue-500/20 text-blue-300">
                  <span className="block font-bold">
                    {isBn ? 'ন্যায্য মধ্যমান দর' : 'Midpoint Split'}
                  </span>
                  <span className="text-base font-black font-mono">৳{compromisePrice}</span>
                </div>
              </div>

              <p className="text-[10px] text-slate-400 text-center">
                {isBn
                  ? 'উভয় পক্ষ চ্যাট থেকে ১-ক্লিকে এই সমঝোতা প্রস্তাব গ্রহণ করতে পারবেন'
                  : 'Both parties can mutually accept this compromise card in chat'}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
          >
            {isBn ? 'বাতিল' : 'Cancel'}
          </button>
          <button
            disabled={!itemTitle.trim() || compromisePrice <= 0}
            onClick={handleProposeDeal}
            className="px-5 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 disabled:opacity-40 flex items-center gap-2 transition-all active:scale-95"
          >
            <Handshake className="w-4 h-4" />
            <span>{isBn ? 'চ্যাটে সমঝোতা প্রস্তাব পাঠান' : 'Propose Compromise Deal'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
