import React, { useState, useEffect } from 'react';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  Plus,
  Trash2,
  Calendar,
  X,
  PieChart,
  Tag,
  DollarSign,
} from 'lucide-react';

interface Transaction {
  id: string;
  type: 'income' | 'expense';
  title: string;
  amount: number;
  category: string;
  date: string;
}

const DEFAULT_TRANSACTIONS: Transaction[] = [
  { id: '1', type: 'income', title: 'টিউশন ফি / বেতন', amount: 15000, category: 'বেতন', date: '২০২৬-১১-০১' },
  { id: '2', type: 'expense', title: 'দুপুরের খাবার ও নাস্তা', amount: 350, category: 'খাবার', date: '২০২৬-১১-০২' },
  { id: '3', type: 'expense', title: 'রিকশা ও বাস ভাড়া', amount: 120, category: 'যাতায়াত', date: '২০২৬-১১-০২' },
  { id: '4', type: 'expense', title: 'মোবাইল রিচার্জ ও ডাটা', amount: 299, category: 'বিল', date: '২০২৬-১১-০৩' },
  { id: '5', type: 'expense', title: 'সুপারশপ বাজার', amount: 1450, category: 'কেনাকাটা', date: '২০২৬-১১-০৪' },
];

const CATEGORIES = ['খাবার', 'যাতায়াত', 'বিল', 'কেনাকাটা', 'চিকিৎসা', 'বিনোদন', 'বেতন', 'অন্যান্য'];

interface PocketKhataModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PocketKhataModal: React.FC<PocketKhataModalProps> = ({ isOpen, onClose }) => {
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    try {
      const saved = localStorage.getItem('osa_pocket_khata_txs');
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_TRANSACTIONS;
  });

  const [showAddForm, setShowAddForm] = useState(false);
  const [txType, setTxType] = useState<'income' | 'expense'>('expense');
  const [txTitle, setTxTitle] = useState('');
  const [txAmount, setTxAmount] = useState('');
  const [txCategory, setTxCategory] = useState('খাবার');

  useEffect(() => {
    try {
      localStorage.setItem('osa_pocket_khata_txs', JSON.stringify(transactions));
    } catch {}
  }, [transactions]);

  if (!isOpen) return null;

  const totalIncome = transactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpense = transactions
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  const balance = totalIncome - totalExpense;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmt = parseFloat(txAmount);
    if (!txTitle.trim() || isNaN(parsedAmt) || parsedAmt <= 0) return;

    const newTx: Transaction = {
      id: 'tx_' + Date.now(),
      type: txType,
      title: txTitle.trim(),
      amount: parsedAmt,
      category: txCategory,
      date: new Date().toISOString().split('T')[0],
    };

    setTransactions([newTx, ...transactions]);
    setTxTitle('');
    setTxAmount('');
    setShowAddForm(false);
  };

  const handleDelete = (id: string) => {
    setTransactions(transactions.filter((t) => t.id !== id));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-emerald-500/10 via-blue-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/25">
              <Wallet className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                দৈনিক ব্যক্তিগত হিসাব খাতা
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                আয় ও ব্যয়ের নির্ভুল ট্র্যাকার ও আর্থিক ডায়রি
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

        {/* Balance Summary Cards */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 grid grid-cols-3 gap-2 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="p-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
            <span className="text-[11px] font-semibold text-slate-500 block">বর্তমান ব্যালেন্স</span>
            <p className={`text-base font-black mt-0.5 ${balance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600'}`}>
              ৳{balance.toLocaleString('en-US')}
            </p>
          </div>
          <div className="p-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <ArrowDownLeft className="w-3 h-3" /> মোট আয়
            </span>
            <p className="text-base font-black text-slate-900 dark:text-white mt-0.5">
              ৳{totalIncome.toLocaleString('en-US')}
            </p>
          </div>
          <div className="p-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
            <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1">
              <ArrowUpRight className="w-3 h-3" /> মোট ব্যয়
            </span>
            <p className="text-base font-black text-slate-900 dark:text-white mt-0.5">
              ৳{totalExpense.toLocaleString('en-US')}
            </p>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 flex-1 min-h-0 overflow-y-auto space-y-4">
          {/* Add Transaction Button or Form */}
          {!showAddForm ? (
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/25 transition active:scale-95"
            >
              <Plus className="w-4 h-4" /> নতুন হিসাব লিখুন
            </button>
          ) : (
            <form onSubmit={handleAdd} className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  নতুন এন্ট্রি যোগ করুন
                </span>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="text-slate-400 hover:text-slate-600 text-xs"
                >
                  বাতিল
                </button>
              </div>

              {/* Type Switcher */}
              <div className="grid grid-cols-2 gap-2 bg-white dark:bg-slate-900 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setTxType('expense')}
                  className={`py-1.5 rounded-lg text-xs font-bold transition ${
                    txType === 'expense'
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  ব্যয় (Expense)
                </button>
                <button
                  type="button"
                  onClick={() => setTxType('income')}
                  className={`py-1.5 rounded-lg text-xs font-bold transition ${
                    txType === 'income'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  আয় (Income)
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  placeholder="বিবরণ (যেমন: নাস্তা / রিকশা)"
                  value={txTitle}
                  onChange={(e) => setTxTitle(e.target.value)}
                  className="px-3 py-2 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                />
                <input
                  type="number"
                  required
                  min="1"
                  step="any"
                  placeholder="টাকার পরিমাণ (৳)"
                  value={txAmount}
                  onChange={(e) => setTxAmount(e.target.value)}
                  className="px-3 py-2 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                  ক্যাটাগরি নির্বাচন করুন:
                </label>
                <div className="flex flex-wrap gap-1">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setTxCategory(cat)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition ${
                        txCategory === cat
                          ? 'bg-emerald-600 text-white'
                          : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm"
              >
                হিসাবে সেভ করুন
              </button>
            </form>
          )}

          {/* Transactions List */}
          <div>
            <h4 className="text-xs font-bold text-slate-500 mb-2">সাম্প্রতিক লেনদেনের তালিকা</h4>
            <div className="space-y-2">
              {transactions.length === 0 ? (
                <p className="text-center py-6 text-xs text-slate-400">
                  এখনো কোনো হিসাব লেখা হয়নি
                </p>
              ) : (
                transactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${
                          tx.type === 'income'
                            ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400'
                            : 'bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {tx.type === 'income' ? '+' : '-'}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900 dark:text-white">
                          {tx.title}
                        </p>
                        <p className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                          <span className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                            {tx.category}
                          </span>
                          <span>• {tx.date}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        className={`text-sm font-black ${
                          tx.type === 'income'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {tx.type === 'income' ? '+' : '-'}৳{tx.amount.toLocaleString('en-US')}
                      </span>
                      <button
                        onClick={() => handleDelete(tx.id)}
                        className="text-slate-400 hover:text-red-500 transition"
                        title="মুছুন"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
