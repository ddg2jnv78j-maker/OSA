import React, { useState } from 'react';
import {
  PieChart,
  X,
  Plus,
  Trash2,
  Send,
  Users,
  Target,
  CheckCircle2,
  Clock,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import confetti from 'canvas-confetti';

export interface FundContributor {
  id: string;
  name: string;
  amount: number;
  status: 'paid' | 'pending';
  method?: string;
  paidAt?: string;
}

export interface TripFundLedgerData {
  ledgerId: string;
  title: string;
  targetAmount: number;
  currency: string;
  creatorName: string;
  contributors: FundContributor[];
  notes?: string;
  createdAt: string;
}

interface TripFundLedgerModalProps {
  isOpen: boolean;
  onClose: () => void;
  language?: string;
  chatId: string;
  currentUserName: string;
  membersList?: { id: string; name: string }[];
  onShareLedger: (ledger: TripFundLedgerData) => Promise<void>;
}

export const TripFundLedgerModal: React.FC<TripFundLedgerModalProps> = ({
  isOpen,
  onClose,
  language = 'en',
  chatId,
  currentUserName,
  membersList = [],
  onShareLedger,
}) => {
  const isBn = language === 'bn';

  const [title, setTitle] = useState('');
  const [targetAmount, setTargetAmount] = useState<number>(10000);
  const [notes, setNotes] = useState('');
  const [sending, setSending] = useState(false);

  const [contributors, setContributors] = useState<FundContributor[]>(() => {
    if (membersList.length > 0) {
      return membersList.map((m) => ({
        id: m.id,
        name: m.name,
        amount: 0,
        status: 'pending' as const,
      }));
    }
    return [
      { id: 'c1', name: currentUserName || 'Me', amount: 2000, status: 'paid', paidAt: new Date().toISOString() },
      { id: 'c2', name: 'Member 2', amount: 0, status: 'pending' },
    ];
  });

  if (!isOpen) return null;

  const addContributor = () => {
    setContributors((prev) => [
      ...prev,
      {
        id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        name: '',
        amount: 0,
        status: 'pending',
      },
    ]);
  };

  const removeContributor = (id: string) => {
    if (contributors.length <= 1) return;
    setContributors((prev) => prev.filter((c) => c.id !== id));
  };

  const updateContributor = (id: string, field: keyof FundContributor, value: unknown) => {
    setContributors((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        if (field === 'status' && value === 'paid') {
          return { ...c, status: 'paid', paidAt: new Date().toISOString() };
        }
        return { ...c, [field]: value };
      })
    );
  };

  const collectedTotal = contributors
    .filter((c) => c.status === 'paid')
    .reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

  const pledgedTotal = contributors.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
  const target = Math.max(1, Number(targetAmount) || 1);
  const progressPercent = Math.min(100, Math.round((collectedTotal / target) * 100));

  const handleShare = async () => {
    if (!title.trim()) return;
    setSending(true);
    const ledgerId = `LEDGER-${Date.now().toString().slice(-6)}`;
    const ledgerData: TripFundLedgerData = {
      ledgerId,
      title: title.trim(),
      targetAmount: target,
      currency: '৳',
      creatorName: currentUserName || 'Group Admin',
      contributors,
      notes: notes.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    try {
      await onShareLedger(ledgerData);
      confetti({ particleCount: 60, spread: 70, origin: { y: 0.6 } });
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-white shadow-inner">
              <PieChart className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">
                {isBn ? 'গ্রুপ চাঁদা ও ট্যুর ফান্ড ট্র্যাকার' : 'Trip & Group Fund Ledger'}
              </h3>
              <p className="text-xs text-white/80">
                {isBn ? 'ট্যুর, পিকনিক ও পার্টির কালেকশন লাইভ হিসাব' : 'Live group pool tracking with progress bars'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {/* Title & Target */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1">
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                {isBn ? 'ইভেন্ট / ট্যুরের নাম' : 'Event / Tour Title'}
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={isBn ? 'যেমন: সাজেক ভ্যালি ট্যুর ২০২৬' : 'e.g., Sajek Valley Trip 2026'}
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-semibold text-slate-800 dark:text-slate-100 outline-none focus:border-purple-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                {isBn ? 'টার্গেট বাজেট (৳)' : 'Goal Budget (৳)'}
              </label>
              <input
                type="number"
                min="100"
                value={targetAmount}
                onChange={(e) => setTargetAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-purple-500"
              />
            </div>
          </div>

          {/* Progress Card */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-50 to-indigo-50/50 dark:from-purple-950/30 dark:to-indigo-950/20 border border-purple-200/80 dark:border-purple-800/40 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-purple-900 dark:text-purple-300 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                {isBn ? 'কালেকশন প্রগ্রেস:' : 'Fund Progress:'}
              </span>
              <span className="font-extrabold text-purple-700 dark:text-purple-300 text-sm">
                ৳{collectedTotal.toLocaleString()} / ৳{target.toLocaleString()} ({progressPercent}%)
              </span>
            </div>

            <div className="w-full h-3 bg-purple-200/70 dark:bg-purple-950/80 rounded-full overflow-hidden p-0.5">
              <div
                className="h-full bg-gradient-to-r from-purple-600 to-indigo-500 rounded-full transition-all duration-500 shadow-sm"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span>{isBn ? 'বাকি আছে:' : 'Remaining:'} ৳{Math.max(0, target - collectedTotal).toLocaleString()}</span>
              <span>{contributors.filter((c) => c.status === 'paid').length} of {contributors.length} {isBn ? 'জন পরিশোধ করেছে' : 'paid'}</span>
            </div>
          </div>

          {/* Members Contribution List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-purple-600" />
                {isBn ? 'সদস্যদের চাঁদার তালিকা' : 'Member Contribution List'}
              </span>
              <button
                type="button"
                onClick={addContributor}
                className="flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400 font-bold hover:underline"
              >
                <Plus className="w-3.5 h-3.5" />
                {isBn ? 'সদস্য যোগ' : 'Add Member'}
              </button>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {contributors.map((c, idx) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2 p-2 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800"
                >
                  <span className="text-xs font-bold text-slate-400 w-5 text-center">
                    {idx + 1}
                  </span>
                  <input
                    type="text"
                    value={c.name}
                    onChange={(e) => updateContributor(c.id, 'name', e.target.value)}
                    placeholder={isBn ? 'সদস্যের নাম' : 'Member Name'}
                    className="flex-1 px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-200 outline-none"
                  />
                  <div className="flex items-center gap-1 w-24">
                    <span className="text-xs font-bold text-slate-400">৳</span>
                    <input
                      type="number"
                      min="0"
                      value={c.amount}
                      onChange={(e) => updateContributor(c.id, 'amount', Math.max(0, parseFloat(e.target.value) || 0))}
                      placeholder="Amount"
                      className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-right font-bold text-slate-800 dark:text-slate-200 outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => updateContributor(c.id, 'status', c.status === 'paid' ? 'pending' : 'paid')}
                    className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 border transition-all ${
                      c.status === 'paid'
                        ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                        : 'bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                    }`}
                  >
                    {c.status === 'paid' ? (
                      <>
                        <CheckCircle2 className="w-3 h-3" />
                        {isBn ? 'পেইড' : 'Paid'}
                      </>
                    ) : (
                      <>
                        <Clock className="w-3 h-3" />
                        {isBn ? 'বাকি' : 'Due'}
                      </>
                    )}
                  </button>
                  {contributors.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeContributor(c.id)}
                      className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors"
                      title="Remove"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={isBn ? 'বিকাশ/নগদ নম্বর বা জরুরি নির্দেশনা...' : 'bKash/Nagad number or payment guidelines...'}
            className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs text-slate-700 dark:text-slate-300 outline-none"
          />
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
          >
            {isBn ? 'বাতিল' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={handleShare}
            disabled={sending || !title.trim()}
            className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded-xl shadow-lg shadow-purple-600/30 flex items-center gap-1.5 transition-all disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            {sending ? (isBn ? 'পোস্ট হচ্ছে...' : 'Posting...') : isBn ? 'লেজার গ্রুপে পাঠান' : 'Share Ledger to Chat'}
          </button>
        </div>
      </div>
    </div>
  );
};
