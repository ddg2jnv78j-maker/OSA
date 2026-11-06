import React, { useState, useEffect } from 'react';
import {
  UserCheck,
  UserX,
  Clock,
  Plus,
  Share2,
  Copy,
  Check,
  Calendar,
  X,
  Users,
} from 'lucide-react';

interface Member {
  id: string;
  name: string;
  roll: string;
  status: 'present' | 'absent' | 'late';
}

const DEFAULT_MEMBERS: Member[] = [
  { id: '1', name: 'তানভীর আহমেদ', roll: '০১', status: 'present' },
  { id: '2', name: 'সাদিয়া ইসলাম', roll: '০২', status: 'present' },
  { id: '3', name: 'মাহমুদুল হাসান', roll: '০৩', status: 'absent' },
  { id: '4', name: 'নাজমুল সাকিব', roll: '০৪', status: 'late' },
  { id: '5', name: 'ফারহানা চৌধুরী', roll: '০৫', status: 'present' },
];

interface AttendanceTrackerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AttendanceTrackerModal: React.FC<AttendanceTrackerModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [members, setMembers] = useState<Member[]>(() => {
    try {
      const saved = localStorage.getItem('osa_attendance_roster');
      return saved ? JSON.parse(saved) : DEFAULT_MEMBERS;
    } catch {
      return DEFAULT_MEMBERS;
    }
  });

  const [sessionTitle, setSessionTitle] = useState('টিউশন ব্যাচ / টিম মিটিং');
  const [copied, setCopied] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRoll, setNewMemberRoll] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem('osa_attendance_roster', JSON.stringify(members));
    } catch {}
  }, [members]);

  if (!isOpen) return null;

  const setStatus = (id: string, status: 'present' | 'absent' | 'late') => {
    setMembers(members.map((m) => (m.id === id ? { ...m, status } : m)));
  };

  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName.trim()) return;

    const newM: Member = {
      id: 'm_' + Date.now(),
      name: newMemberName.trim(),
      roll: newMemberRoll.trim() || String(members.length + 1).padStart(2, '০'),
      status: 'present',
    };

    setMembers([...members, newM]);
    setNewMemberName('');
    setNewMemberRoll('');
    setShowAddMember(false);
  };

  const total = members.length;
  const presentCount = members.filter((m) => m.status === 'present').length;
  const absentCount = members.filter((m) => m.status === 'absent').length;
  const lateCount = members.filter((m) => m.status === 'late').length;
  const percentage = total > 0 ? Math.round((presentCount / total) * 100) : 0;

  const generateReportText = () => {
    const date = new Date().toLocaleDateString('bn-BD');
    let text = `📋 ${sessionTitle} - উপস্থিতি রিপোর্ট (${date})\n`;
    text += `মোট: ${total} | উপস্থিত: ${presentCount} | অনুপস্থিত: ${absentCount} | লেট: ${lateCount}\n`;
    text += `উপস্থিতির হার: ${percentage}%\n\n`;
    members.forEach((m) => {
      const icon = m.status === 'present' ? '✅' : m.status === 'absent' ? '❌' : '⏳';
      text += `${icon} [রোল ${m.roll}] ${m.name}\n`;
    });
    return text;
  };

  const copyReport = () => {
    navigator.clipboard.writeText(generateReportText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-600 text-white flex items-center justify-center shadow-lg shadow-emerald-500/25">
              <UserCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                ক্লাস/অফিস হাজিরা ট্র্যাকার
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                ১-ট্যাপে উপস্থিতি রেকর্ড করুন ও চ্যাটে রিপোর্ট পাঠান
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

        {/* Summary Metric Strip */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 grid grid-cols-4 gap-2 bg-slate-50/50 dark:bg-slate-900/50 text-center">
          <div className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <span className="text-[10px] text-slate-400 block">উপস্থিত</span>
            <span className="text-base font-black text-emerald-600 dark:text-emerald-400">
              {presentCount}
            </span>
          </div>
          <div className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <span className="text-[10px] text-slate-400 block">অনুপস্থিত</span>
            <span className="text-base font-black text-rose-600 dark:text-rose-400">
              {absentCount}
            </span>
          </div>
          <div className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <span className="text-[10px] text-slate-400 block">লেট</span>
            <span className="text-base font-black text-amber-500">{lateCount}</span>
          </div>
          <div className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <span className="text-[10px] text-slate-400 block">শতাংশ</span>
            <span className="text-base font-black text-blue-600 dark:text-blue-400">
              {percentage}%
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 flex-1 min-h-0 overflow-y-auto space-y-3">
          <div className="flex items-center justify-between">
            <input
              type="text"
              value={sessionTitle}
              onChange={(e) => setSessionTitle(e.target.value)}
              className="text-xs font-bold text-slate-900 dark:text-white bg-transparent border-b border-dashed border-slate-300 dark:border-slate-700 pb-0.5 focus:outline-none"
            />
            <button
              onClick={() => setShowAddMember(true)}
              className="px-2.5 py-1 rounded-xl bg-emerald-600 text-white font-bold text-[10px] flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> নতুন শিক্ষার্থী/সদস্য
            </button>
          </div>

          {/* Members List */}
          <div className="space-y-2">
            {members.map((m) => (
              <div
                key={m.id}
                className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center justify-between"
              >
                <div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white">
                    [রোল {m.roll}] {m.name}
                  </p>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setStatus(m.id, 'present')}
                    className={`px-2.5 py-1 rounded-xl text-[10px] font-bold transition ${
                      m.status === 'present'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    উপস্থিত
                  </button>
                  <button
                    onClick={() => setStatus(m.id, 'absent')}
                    className={`px-2.5 py-1 rounded-xl text-[10px] font-bold transition ${
                      m.status === 'absent'
                        ? 'bg-rose-600 text-white shadow-sm'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    অনুপস্থিত
                  </button>
                  <button
                    onClick={() => setStatus(m.id, 'late')}
                    className={`px-2.5 py-1 rounded-xl text-[10px] font-bold transition ${
                      m.status === 'late'
                        ? 'bg-amber-500 text-white shadow-sm'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    লেট
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Add member form */}
          {showAddMember && (
            <form onSubmit={handleAddMember} className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-800 space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="রোল / আইডি"
                  value={newMemberRoll}
                  onChange={(e) => setNewMemberRoll(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
                <input
                  type="text"
                  required
                  placeholder="শিক্ষার্থীর নাম"
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  className="col-span-2 px-2.5 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddMember(false)}
                  className="px-2.5 py-1 rounded-lg text-xs"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  className="px-3 py-1 rounded-lg bg-emerald-600 text-white font-bold text-xs"
                >
                  যুক্ত করুন
                </button>
              </div>
            </form>
          )}

          {/* Action copy */}
          <button
            onClick={copyReport}
            className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 transition active:scale-95"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-200" /> রিপোর্ট কপি করা হয়েছে
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" /> চ্যাটে পাঠানোর জন্য সম্পূর্ণ রিপোর্ট কপি করুন
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
