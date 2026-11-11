import React, { useState, useEffect } from 'react';
import {
  Repeat,
  Book,
  Gift,
  Plus,
  Search,
  MessageCircle,
  Phone,
  X,
  Sparkles,
  Tag,
} from 'lucide-react';

interface BarterItem {
  id: string;
  title: string;
  type: 'বই' | 'গ্যাজেট' | 'অন্যান্য';
  condition: string;
  wantsInReturn: string;
  owner: string;
  phone: string;
  isGift: boolean;
}

const DEFAULT_ITEMS: BarterItem[] = [];

interface BarterClubModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserName?: string;
}

export const BarterClubModal: React.FC<BarterClubModalProps> = ({
  isOpen,
  onClose,
  currentUserName = 'User',
}) => {
  const [items, setItems] = useState<BarterItem[]>(() => {
    try {
      const saved = localStorage.getItem('osa_barter_items');
      if (saved) {
        const parsed: BarterItem[] = JSON.parse(saved);
        const demoIds = new Set(['b1', 'b2', 'b3']);
        return parsed.filter(
          (item) =>
            !demoIds.has(item.id) &&
            item.owner !== 'তানভীর' &&
            item.owner !== 'সাদিয়া' &&
            item.owner !== 'রাকিবুল'
        );
      }
    } catch {}
    return [];
  });
  const [showAddForm, setShowAddForm] = useState(false);

  const [title, setTitle] = useState('');
  const [type, setType] = useState<'বই' | 'গ্যাজেট' | 'অন্যান্য'>('বই');
  const [condition, setCondition] = useState('ভালো');
  const [wantsInReturn, setWantsInReturn] = useState('');
  const [phone, setPhone] = useState('+880');
  const [isGift, setIsGift] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem('osa_barter_items', JSON.stringify(items));
    } catch {}
  }, [items]);

  if (!isOpen) return null;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const newItem: BarterItem = {
      id: 'bi_' + Date.now(),
      title: title.trim(),
      type,
      condition,
      wantsInReturn: isGift ? 'সম্পূর্ণ ফ্রি উপহার' : wantsInReturn.trim() || 'অন্য কোনো বই',
      owner: currentUserName,
      phone: phone.trim(),
      isGift,
    };

    setItems([newItem, ...items]);
    setTitle('');
    setWantsInReturn('');
    setShowAddForm(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-amber-500/10 via-emerald-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-500 to-emerald-600 text-white flex items-center justify-center shadow-lg shadow-amber-500/25">
              <Repeat className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                বই ও জিনিসপত্র অদল-বদল ক্লাব
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                পড়া বই বা অপ্রয়োজনীয় জিনিস ফ্রিতে অদল-বদল করুন
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Button */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
          <p className="text-xs text-slate-500">
            বর্তমানে বিনিময়ের জন্য রয়েছে {items.length}টি আইটেম
          </p>
          <button
            onClick={() => setShowAddForm(true)}
            className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center gap-1 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" /> নতুন আইটেম যুক্ত করুন
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex-1 min-h-0 overflow-y-auto space-y-3">
          {items.length === 0 ? (
            <div className="text-center py-8 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 space-y-1.5">
              <Repeat className="w-8 h-8 text-amber-500 mx-auto" />
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">কোনো বিনিময় বা গিফটের আইটেম নেই</p>
              <p className="text-[11px] text-slate-400">আপনার অপ্রয়োজনীয় বই বা গ্যাজেট শেয়ার করতে উপরের "+ নতুন আইটেম যুক্ত করুন" বাটনে চাপ দিন</p>
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2"
              >
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-[10px] font-bold">
                  {item.type} • {item.condition}
                </span>
                {item.isGift ? (
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold flex items-center gap-1">
                    <Gift className="w-3 h-3" /> ফ্রি গিফট
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 text-[10px] font-bold">
                    বিনিময়যোগ্য
                  </span>
                )}
              </div>

              <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                {item.title}
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1">
                <Repeat className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                বিনিময়ে চান: <span className="font-semibold text-slate-800 dark:text-slate-200">{item.wantsInReturn}</span>
              </p>

              <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between text-[11px] text-slate-400">
                <span>মালিক: {item.owner}</span>
                <a
                  href={`tel:${item.phone}`}
                  className="px-2.5 py-1 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-[10px] flex items-center gap-1"
                >
                  <Phone className="w-3 h-3" /> যোগাযোগ করুন
                </a>
              </div>
            </div>
          ))
        )}
        </div>

        {/* Add Modal */}
        {showAddForm && (
          <div className="absolute inset-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md z-20 p-5 flex flex-col justify-center">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                বিনিময়ের জন্য আইটেম যুক্ত করুন
              </h3>
              <button onClick={() => setShowAddForm(false)} className="text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAdd} className="space-y-2.5">
              <div>
                <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                  আইটেমের নাম ও লেখক/মডেল:
                </label>
                <input
                  type="text"
                  required
                  placeholder="যেমন: মিসির আলি সমগ্র ১"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                    ক্যাটাগরি:
                  </label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="বই">বই</option>
                    <option value="গ্যাজেট">গ্যাজেট</option>
                    <option value="অন্যান্য">অন্যান্য</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                    কন্ডিশন:
                  </label>
                  <input
                    type="text"
                    value={condition}
                    onChange={(e) => setCondition(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-100 dark:bg-slate-800">
                <input
                  type="checkbox"
                  id="isGift"
                  checked={isGift}
                  onChange={(e) => setIsGift(e.target.checked)}
                  className="rounded text-amber-500"
                />
                <label htmlFor="isGift" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  সম্পূর্ণ বিনামূল্যে উপহার দিতে চাই (ফ্রি গিফট)
                </label>
              </div>

              {!isGift && (
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                    বিনিময়ে কোন বই বা জিনিস চান:
                  </label>
                  <input
                    type="text"
                    placeholder="যেমন: সায়েন্স ফিকশন বা গল্পের বই"
                    value={wantsInReturn}
                    onChange={(e) => setWantsInReturn(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              )}

              <div>
                <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                  যোগাযোগের নম্বর:
                </label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold"
                >
                  যুক্ত করুন
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
