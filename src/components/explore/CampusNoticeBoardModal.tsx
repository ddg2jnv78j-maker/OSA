import React, { useState, useEffect } from 'react';
import {
  GraduationCap,
  Plus,
  Search,
  BookOpen,
  HelpCircle,
  Calendar,
  Phone,
  MessageCircle,
  X,
  MapPin,
  Tag,
} from 'lucide-react';

interface CampusNotice {
  id: string;
  category: 'টিউশন' | 'হারানো' | 'নোট' | 'ইভেন্ট';
  title: string;
  description: string;
  campus: string;
  author: string;
  contact: string;
  date: string;
}

const DEFAULT_NOTICES: CampusNotice[] = [];

interface CampusNoticeBoardModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserName?: string;
}

export const CampusNoticeBoardModal: React.FC<CampusNoticeBoardModalProps> = ({
  isOpen,
  onClose,
  currentUserName = 'User',
}) => {
  const [notices, setNotices] = useState<CampusNotice[]>(() => {
    try {
      const saved = localStorage.getItem('osa_campus_notices');
      if (saved) {
        const parsed: CampusNotice[] = JSON.parse(saved);
        const demoIds = new Set(['n1', 'n2', 'n3']);
        return parsed.filter(
          (n) =>
            !demoIds.has(n.id) &&
            n.author !== 'আহসান হাবিব' &&
            n.author !== 'সোহাগ রানা' &&
            n.author !== 'ফারহান চৌধুরী'
        );
      }
    } catch {}
    return [];
  });

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState(false);

  // Form states
  const [formCategory, setFormCategory] = useState<'টিউশন' | 'হারানো' | 'নোট' | 'ইভেন্ট'>('টিউশন');
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formCampus, setFormCampus] = useState('ঢাকা বিশ্ববিদ্যালয়');
  const [formContact, setFormContact] = useState('+880');

  useEffect(() => {
    try {
      localStorage.setItem('osa_campus_notices', JSON.stringify(notices));
    } catch {}
  }, [notices]);

  if (!isOpen) return null;

  const handleAddNotice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formDesc.trim()) return;

    const newN: CampusNotice = {
      id: 'cn_' + Date.now(),
      category: formCategory,
      title: formTitle.trim(),
      description: formDesc.trim(),
      campus: formCampus.trim(),
      author: currentUserName,
      contact: formContact.trim(),
      date: 'এইমাত্র',
    };

    setNotices([newN, ...notices]);
    setFormTitle('');
    setFormDesc('');
    setShowAddModal(false);
  };

  const filteredNotices =
    selectedCategory === 'all'
      ? notices
      : notices.filter((n) => n.category === selectedCategory);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-indigo-500/10 via-purple-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/25">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                ক্যাম্পাস ও লোকাল নোটিশ বোর্ড
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                টিউশন, হারানো বিজ্ঞপ্তি, স্টাডি নোট ও ক্যাম্পাস আপডেট
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

        {/* Filter Pills */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {['all', 'টিউশন', 'হারানো', 'নোট', 'ইভেন্ট'].map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                  selectedCategory === cat
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                {cat === 'all' ? 'সব নোটিশ' : cat}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1 shadow-sm shrink-0"
          >
            <Plus className="w-3.5 h-3.5" /> নোটিশ দিন
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex-1 min-h-0 overflow-y-auto space-y-3">
          {filteredNotices.length === 0 ? (
            <div className="text-center py-8 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 space-y-1.5">
              <GraduationCap className="w-8 h-8 text-indigo-500 mx-auto" />
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">কোনো ক্যাম্পাস নোটিশ নেই</p>
              <p className="text-[11px] text-slate-400">টিউশন, নোট বা হারানো বিজ্ঞপ্তির জন্য উপরের "+ নোটিশ দিন" বাটনে চাপ দিন</p>
            </div>
          ) : (
            filteredNotices.map((n) => (
              <div
                key={n.id}
                className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold">
                    {n.category}
                  </span>
                  <span className="text-[10px] text-slate-400">{n.date}</span>
                </div>

                <h4 className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
                  {n.title}
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-300">{n.description}</p>

                <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="flex items-center gap-1 truncate max-w-[200px]">
                    <MapPin className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                    {n.campus}
                  </span>
                  <div className="flex items-center gap-2">
                    <a
                      href={`tel:${n.contact}`}
                      className="px-2.5 py-1 rounded-xl bg-emerald-600 text-white font-bold text-[10px] flex items-center gap-1"
                    >
                      <Phone className="w-3 h-3" /> কল
                    </a>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Create Modal */}
        {showAddModal && (
          <div className="absolute inset-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md z-20 p-5 flex flex-col justify-center">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                নতুন ক্যাম্পাস নোটিশ লিখুন
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddNotice} className="space-y-2.5">
              <div>
                <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                  ক্যাটাগরি:
                </label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  <option value="টিউশন">টিউশন</option>
                  <option value="হারানো">হারানো বিজ্ঞপ্তি</option>
                  <option value="নোট">স্টাডি নোট</option>
                  <option value="ইভেন্ট">ইভেন্ট</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                  শিরোনাম:
                </label>
                <input
                  type="text"
                  required
                  placeholder="স্পষ্ট শিরোনাম লিখুন"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                  বিস্তারিত তথ্য:
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="বিস্তারিত বিবরণ..."
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                    ক্যাম্পাস বা এলাকা:
                  </label>
                  <input
                    type="text"
                    required
                    value={formCampus}
                    onChange={(e) => setFormCampus(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                    মোবাইল নম্বর:
                  </label>
                  <input
                    type="tel"
                    required
                    value={formContact}
                    onChange={(e) => setFormContact(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold"
                >
                  পোস্ট করুন
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
