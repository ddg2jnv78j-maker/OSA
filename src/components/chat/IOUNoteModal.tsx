import React, { useState } from 'react';
import {
  Handshake,
  DollarSign,
  Calendar,
  FileText,
  X,
  Send,
  Sparkles,
  ArrowRightLeft
} from 'lucide-react';

export interface IOUNoteData {
  id: string;
  type: 'lent' | 'borrowed' | 'promise';
  amountOrItem: string;
  category: string;
  creatorId: string;
  creatorName: string;
  counterpartyName: string;
  dueDate?: string;
  note?: string;
  status: 'pending' | 'settled';
  settledAt?: string | null;
  settledByName?: string | null;
  createdAt: string;
}

interface IOUNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateIOU: (iouData: IOUNoteData) => Promise<void>;
  chatTitle: string;
  currentUser: {
    id: string;
    full_name: string;
  };
  language?: string;
}

export const IOUNoteModal: React.FC<IOUNoteModalProps> = ({
  isOpen,
  onClose,
  onCreateIOU,
  chatTitle,
  currentUser,
  language = 'en',
}) => {
  const isBn = language === 'bn';

  const [type, setType] = useState<IOUNoteData['type']>('lent');
  const [amountOrItem, setAmountOrItem] = useState('');
  const [category, setCategory] = useState('Food & Lunch');
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amountOrItem.trim()) {
      setError(isBn ? 'টাকা বা ধার দেওয়া জিনিসের বিবরণ লিখুন' : 'Please specify the amount or borrowed item');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const iouData: IOUNoteData = {
        id: 'iou_' + Math.random().toString(36).substring(2, 9),
        type,
        amountOrItem: amountOrItem.trim(),
        category,
        creatorId: currentUser.id,
        creatorName: currentUser.full_name,
        counterpartyName: chatTitle,
        dueDate: dueDate.trim() || undefined,
        note: note.trim() || undefined,
        status: 'pending',
        settledAt: null,
        createdAt: new Date().toISOString(),
      };

      await onCreateIOU(iouData);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record IOU note');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-amber-500/30 rounded-3xl shadow-2xl overflow-hidden flex flex-col text-white">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-600 flex items-center justify-center text-slate-950 shadow-md shadow-amber-500/25">
              <Handshake className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-100 flex items-center gap-1.5">
                <span>{isBn ? 'ফ্রেন্ডলি আইওইউ ও হ্যান্ডশেক নোট' : 'Friendly IOU & Handshake'}</span>
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              </h3>
              <p className="text-[11px] text-slate-400">
                {isBn ? 'ধার-দেনা বা প্রতিশ্রুতির পরিষ্কার সমঝোতা কার্ড' : 'Track friendly debts & mutual promises easily'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-red-400 rounded-xl hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-300">
              {error}
            </div>
          )}

          {/* Type Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              {isBn ? 'সমঝোতার ধরন' : 'Agreement Type'}
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setType('lent')}
                className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-center ${
                  type === 'lent'
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:text-white'
                }`}
              >
                {isBn ? 'আমি ধার দিয়েছি' : 'I Lent'}
              </button>

              <button
                type="button"
                onClick={() => setType('borrowed')}
                className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-center ${
                  type === 'borrowed'
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:text-white'
                }`}
              >
                {isBn ? 'আমি ধার নিয়েছি' : 'I Borrowed'}
              </button>

              <button
                type="button"
                onClick={() => setType('promise')}
                className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-center ${
                  type === 'promise'
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:text-white'
                }`}
              >
                {isBn ? 'হ্যান্ডশেক প্রমিজ' : 'Handshake'}
              </button>
            </div>
          </div>

          {/* Amount or Item */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              {isBn ? 'টাকার পরিমাণ বা ধার নেওয়া জিনিস' : 'Amount or Borrowed Item'} *
            </label>
            <input
              type="text"
              value={amountOrItem}
              onChange={(e) => setAmountOrItem(e.target.value)}
              placeholder={isBn ? 'যেমন: ৳ ৫০০ অথবা "ডিএসএলআর ক্যামেরা"' : 'e.g., $25 Lunch or "Sony Headphones"'}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700/80 text-sm text-white focus:outline-none focus:border-amber-500"
              required
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              {isBn ? 'ক্যাটাগরি' : 'Category'}
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700/80 text-xs text-white focus:outline-none focus:border-amber-500"
            >
              <option value="Food & Lunch">🍔 Food & Lunch</option>
              <option value="Uber & Travel">🚗 Uber & Travel</option>
              <option value="Gadgets & Gear">🎧 Gadgets & Electronics</option>
              <option value="Books & Notes">📚 Books & Study</option>
              <option value="Cash / Personal Loan">💵 Cash Loan</option>
              <option value="Project / Task Pledge">🤝 Project Pledge</option>
            </select>
          </div>

          {/* Due Date */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>{isBn ? 'ফেরতের তারিখ (ঐচ্ছিক)' : 'Due Date (Optional)'}</span>
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700/80 text-xs text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span>{isBn ? 'নোট / বিবরণ' : 'Note'}</span>
            </label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={isBn ? 'কোনো বিশেষ স্মরণিকা থাকলে লিখুন...' : 'Any details or reminders...'}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700/80 text-xs text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Submit */}
          <div className="pt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
            >
              {isBn ? 'বাতিল' : 'Cancel'}
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/25 flex items-center gap-2 active:scale-95 disabled:opacity-50 transition-all"
            >
              <Send className="w-4 h-4" />
              <span>{submitting ? (isBn ? 'পোস্ট হচ্ছে...' : 'Creating...') : (isBn ? 'আইওইউ কার্ড পাঠান' : 'Post IOU Card')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
