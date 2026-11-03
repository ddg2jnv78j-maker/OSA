import React, { useState } from 'react';
import {
  Receipt,
  X,
  Plus,
  Trash2,
  Send,
  Download,
  Building,
  User,
  Phone,
  Calendar,
  CreditCard,
  CheckCircle,
  FileCheck,
} from 'lucide-react';
import confetti from 'canvas-confetti';

export interface CashMemoItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface CashMemoData {
  memoId: string;
  merchantName: string;
  merchantPhone?: string;
  customerName: string;
  customerPhone?: string;
  date: string;
  items: CashMemoItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paymentMethod: 'bKash' | 'Nagad' | 'Rocket' | 'Bank' | 'Cash';
  trxId?: string;
  notes?: string;
  status: 'paid' | 'pending';
}

interface InstantCashMemoModalProps {
  isOpen: boolean;
  onClose: () => void;
  language?: string;
  chatId: string;
  currentUserName: string;
  peerName?: string;
  onSendMemo: (memo: CashMemoData) => Promise<void>;
}

export const InstantCashMemoModal: React.FC<InstantCashMemoModalProps> = ({
  isOpen,
  onClose,
  language = 'en',
  chatId,
  currentUserName,
  peerName,
  onSendMemo,
}) => {
  const isBn = language === 'bn';

  const [merchantName, setMerchantName] = useState(currentUserName || 'OSA Store');
  const [merchantPhone, setMerchantPhone] = useState('');
  const [customerName, setCustomerName] = useState(peerName || '');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'bKash' | 'Nagad' | 'Rocket' | 'Bank' | 'Cash'>('bKash');
  const [trxId, setTrxId] = useState('');
  const [discount, setDiscount] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<'paid' | 'pending'>('paid');
  const [sending, setSending] = useState(false);

  const [items, setItems] = useState<CashMemoItem[]>([
    { id: 'item_1', name: 'Product / Service 1', quantity: 1, unitPrice: 500 },
  ]);

  if (!isOpen) return null;

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        name: '',
        quantity: 1,
        unitPrice: 0,
      },
    ]);
  };

  const removeItem = (id: string) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const updateItem = (id: string, field: keyof CashMemoItem, value: string | number) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, [field]: value } : it))
    );
  };

  const subtotal = items.reduce(
    (acc, it) => acc + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0),
    0
  );
  const total = Math.max(0, subtotal - (Number(discount) || 0));

  const handleSend = async () => {
    if (!merchantName.trim() || !customerName.trim() || items.length === 0) return;
    setSending(true);
    const memoId = `MEMO-${Date.now().toString().slice(-6)}`;
    const memoData: CashMemoData = {
      memoId,
      merchantName: merchantName.trim(),
      merchantPhone: merchantPhone.trim() || undefined,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim() || undefined,
      date: new Date().toLocaleDateString(isBn ? 'bn-BD' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
      items,
      subtotal,
      discount: Number(discount) || 0,
      tax: 0,
      total,
      paymentMethod,
      trxId: trxId.trim() || undefined,
      notes: notes.trim() || undefined,
      status,
    };

    try {
      await onSendMemo(memoData);
      confetti({ particleCount: 50, spread: 60 });
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
        <div className="px-5 py-4 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-white shadow-inner">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">
                {isBn ? 'ইনস্ট্যান্ট ক্যাশ মেমো / ইনভয়েস' : 'Instant Cash Memo & Invoice'}
              </h3>
              <p className="text-xs text-white/80">
                {isBn ? '১-ক্লিকে ডিজিটাল রসিদ বানিয়ে চ্যাটে পাঠান' : 'Create & send verified digital receipts in 1-click'}
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

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {/* Party details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/60">
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                <Building className="w-3.5 h-3.5 text-emerald-500" />
                {isBn ? 'বিক্রেতা / শপ নাম' : 'Seller / Shop Name'}
              </label>
              <input
                type="text"
                value={merchantName}
                onChange={(e) => setMerchantName(e.target.value)}
                placeholder="My Business Name"
                className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500"
              />
              <input
                type="text"
                value={merchantPhone}
                onChange={(e) => setMerchantPhone(e.target.value)}
                placeholder="Seller Phone (Optional)"
                className="w-full mt-2 px-3 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-300 outline-none focus:border-emerald-500"
              />
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/60">
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                <User className="w-3.5 h-3.5 text-teal-500" />
                {isBn ? 'ক্রেতা / কাস্টমার নাম' : 'Customer Name'}
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Customer Name"
                className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-800 dark:text-slate-100 outline-none focus:border-teal-500"
              />
              <input
                type="text"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="Customer Phone (Optional)"
                className="w-full mt-2 px-3 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-300 outline-none focus:border-teal-500"
              />
            </div>
          </div>

          {/* Items Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                {isBn ? 'পণ্য বা সেবার তালিকা' : 'Items & Quantity'}
              </span>
              <button
                type="button"
                onClick={addItem}
                className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-bold hover:underline"
              >
                <Plus className="w-3.5 h-3.5" />
                {isBn ? 'নতুন আইটেম যোগ' : 'Add Item'}
              </button>
            </div>

            <div className="space-y-2">
              {items.map((item, idx) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 p-2 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800"
                >
                  <span className="text-xs font-bold text-slate-400 w-4 text-center">
                    {idx + 1}
                  </span>
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) => updateItem(item.id, 'name', e.target.value)}
                    placeholder={isBn ? 'পণ্যের বিবরণ' : 'Item description'}
                    className="flex-1 px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-200 outline-none"
                  />
                  <div className="flex items-center gap-1 w-20">
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => updateItem(item.id, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                      placeholder="Qty"
                      className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-center font-bold text-slate-800 dark:text-slate-200 outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-1 w-24">
                    <span className="text-xs font-bold text-slate-400">৳</span>
                    <input
                      type="number"
                      min="0"
                      value={item.unitPrice}
                      onChange={(e) => updateItem(item.id, 'unitPrice', Math.max(0, parseFloat(e.target.value) || 0))}
                      placeholder="Price"
                      className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-right font-bold text-slate-800 dark:text-slate-200 outline-none"
                    />
                  </div>
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
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

          {/* Payment & Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                {isBn ? 'পেমেন্ট মাধ্যম' : 'Payment Method'}
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['bKash', 'Nagad', 'Rocket', 'Bank', 'Cash'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPaymentMethod(m)}
                    className={`py-1.5 text-xs font-bold rounded-xl border transition-all ${
                      paymentMethod === m
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>

              <input
                type="text"
                value={trxId}
                onChange={(e) => setTrxId(e.target.value)}
                placeholder={isBn ? 'ট্রানজেকশন আইডি (TrxID)' : 'TrxID (Optional)'}
                className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-200 outline-none"
              />

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setStatus('paid')}
                  className={`flex-1 py-1 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 border transition-all ${
                    status === 'paid'
                      ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  {isBn ? 'পরিশোধিত (PAID)' : 'PAID'}
                </button>
                <button
                  type="button"
                  onClick={() => setStatus('pending')}
                  className={`flex-1 py-1 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 border transition-all ${
                    status === 'pending'
                      ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  {isBn ? 'বাকি (DUE)' : 'DUE / PENDING'}
                </button>
              </div>
            </div>

            {/* Calculations Box */}
            <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 rounded-2xl flex flex-col justify-between">
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>{isBn ? 'সাবটোটাল:' : 'Subtotal:'}</span>
                  <span className="font-bold">৳{subtotal.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                  <span>{isBn ? 'ডিসকাউন্ট (ছাড়):' : 'Discount:'}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] font-bold">৳</span>
                    <input
                      type="number"
                      min="0"
                      value={discount}
                      onChange={(e) => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-16 px-1.5 py-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-right font-bold outline-none"
                    />
                  </div>
                </div>
                <div className="h-px bg-emerald-200 dark:bg-emerald-800/60 my-1" />
                <div className="flex justify-between text-emerald-900 dark:text-emerald-200 font-extrabold text-base">
                  <span>{isBn ? 'সর্বমোট (Total):' : 'Total Payable:'}</span>
                  <span>৳{total.toLocaleString()}</span>
                </div>
              </div>

              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={isBn ? 'ধন্যবাদ নোট বা শর্তাবলী...' : 'Thank you note or return policy...'}
                className="mt-3 w-full px-2.5 py-1 bg-white/80 dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800/60 rounded-xl text-[11px] text-slate-700 dark:text-slate-300 outline-none"
              />
            </div>
          </div>
        </div>

        {/* Footer actions */}
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
            onClick={handleSend}
            disabled={sending || !merchantName.trim() || !customerName.trim()}
            className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 rounded-xl shadow-lg shadow-emerald-600/30 flex items-center gap-1.5 transition-all disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            {sending ? (isBn ? 'তৈরি হচ্ছে...' : 'Generating...') : isBn ? 'মেমো চ্যাটে পাঠান' : 'Send Memo to Chat'}
          </button>
        </div>
      </div>
    </div>
  );
};
