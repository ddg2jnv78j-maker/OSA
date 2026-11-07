import React, { useState, useEffect } from 'react';
import {
  Briefcase,
  QrCode,
  Share2,
  Copy,
  Check,
  Globe,
  Phone,
  Mail,
  Edit2,
  X,
  Sparkles,
  Download,
  Smartphone,
} from 'lucide-react';

interface DigitalBusinessCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserName?: string;
  currentUserAvatar?: string | null;
}

export const DigitalBusinessCardModal: React.FC<DigitalBusinessCardModalProps> = ({
  isOpen,
  onClose,
  currentUserName = 'রাকিব হাসান',
  currentUserAvatar,
}) => {
  const [title, setTitle] = useState('Full-Stack Web & App Developer');
  const [skills, setSkills] = useState(['React', 'Node.js', 'UI/UX Design', 'Tailwind', 'Python']);
  const [phone, setPhone] = useState('+880 1711-234567');
  const [email, setEmail] = useState('rakib.developer@gmail.com');
  const [website, setWebsite] = useState('https://osa-profile.me/rakib');
  const [bio, setBio] = useState('৫ বছরের অভিজ্ঞ প্রফেশনাল সফটওয়্যার ইঞ্জিনিয়ার ও টেক কনসালট্যান্ট।');

  const [isEditing, setIsEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('osa_digital_business_card');
      if (saved) {
        const p = JSON.parse(saved);
        if (p.title) setTitle(p.title);
        if (p.skills) setSkills(p.skills);
        if (p.phone) setPhone(p.phone);
        if (p.email) setEmail(p.email);
        if (p.website) setWebsite(p.website);
        if (p.bio) setBio(p.bio);
      }
    } catch {}
  }, []);

  if (!isOpen) return null;

  const handleSave = () => {
    try {
      localStorage.setItem(
        'osa_digital_business_card',
        JSON.stringify({ title, skills, phone, email, website, bio })
      );
    } catch {}
    setIsEditing(false);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(website);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Generate 100% real standard vCard 3.0 specification file
  const generateVCardString = () => {
    return [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${currentUserName}`,
      `TITLE:${title}`,
      `TEL;TYPE=CELL,VOICE:${phone}`,
      `EMAIL;TYPE=INTERNET,PREF:${email}`,
      `URL:${website}`,
      `NOTE:${bio.replace(/\r?\n/g, ' ')}`,
      'END:VCARD',
    ].join('\r\n');
  };

  // Real vCard .vcf file download directly saving contact into phonebook
  const handleDownloadVCard = () => {
    const vcardContent = generateVCardString();
    const blob = new Blob([vcardContent], { type: 'text/vcard;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    const cleanFileName = currentUserName.trim().replace(/\s+/g, '_') || 'Contact';
    link.download = `${cleanFileName}.vcf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
  };

  // Real Web Share API
  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${currentUserName} - Digital Card`,
          text: `${currentUserName}\n${title}\nPhone: ${phone}\nEmail: ${email}`,
          url: website,
        });
      } catch {
        // User cancelled share
      }
    } else {
      handleCopyLink();
    }
  };

  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
    website || `tel:${phone}`
  )}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-blue-600/10 via-cyan-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-blue-600 to-cyan-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/25">
              <Briefcase className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                ডিজিটাল বিজনেস কার্ড ও কন্টাক্ট
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                সরাসরি ফোনের কন্টাক্টে সেভ করুন (.vcf) অথবা QR স্ক্যান করুন
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

        {/* Content */}
        <div className="p-5 flex-1 min-h-0 overflow-y-auto space-y-4">
          {/* Card Preview */}
          <div className="p-6 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950 text-white shadow-2xl border border-white/10 relative overflow-hidden space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-500 to-cyan-400 text-white flex items-center justify-center text-xl font-black shadow-lg">
                  {currentUserName.charAt(0)}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-1.5">
                    {currentUserName}
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  </h3>
                  <p className="text-xs text-blue-300 font-medium">{title}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowQrModal(!showQrModal)}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-md transition-colors"
                title="QR কোড বড় করে দেখুন"
              >
                <QrCode className="w-7 h-7 text-white" />
              </button>
            </div>

            {/* Live QR popup if toggled */}
            {showQrModal && (
              <div className="p-4 rounded-2xl bg-white text-slate-900 text-center space-y-2 animate-in fade-in">
                <img
                  src={qrImageUrl}
                  alt="Contact QR"
                  className="w-40 h-40 mx-auto rounded-xl border border-slate-200 shadow"
                />
                <p className="text-[11px] font-semibold text-slate-600">
                  যেকোনো ক্যামেরা দিয়ে স্ক্যান করলেই কন্টাক্ট ও লিঙ্ক খুলবে
                </p>
              </div>
            )}

            <p className="text-xs text-slate-300 leading-relaxed italic">{bio}</p>

            {/* Skills */}
            <div className="flex flex-wrap gap-1.5">
              {skills.map((s) => (
                <span
                  key={s}
                  className="px-2.5 py-1 rounded-lg bg-white/10 text-white text-[10px] font-semibold tracking-wide border border-white/10"
                >
                  {s}
                </span>
              ))}
            </div>

            {/* Contacts strip */}
            <div className="pt-3 border-t border-white/10 grid grid-cols-2 gap-2 text-xs text-slate-300">
              <a
                href={`tel:${phone.replace(/\s+/g, '')}`}
                className="flex items-center gap-1.5 hover:text-white transition-colors"
              >
                <Phone className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span className="truncate">{phone}</span>
              </a>
              <a
                href={`mailto:${email}`}
                className="flex items-center gap-1.5 hover:text-white transition-colors"
              >
                <Mail className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span className="truncate">{email}</span>
              </a>
            </div>
          </div>

          {/* Edit Form Toggle */}
          {isEditing ? (
            <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-800 space-y-3">
              <div className="flex justify-between items-center">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                  কার্ডের তথ্য পরিবর্তন করুন
                </h4>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="text-xs text-slate-400"
                >
                  বাতিল
                </button>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-500 block mb-1">পদবি / পেশা:</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-500 block mb-1">সংক্ষিপ্ত পরিচিতি:</label>
                <textarea
                  rows={2}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <input
                  type="tel"
                  placeholder="ফোন নম্বর"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
                <input
                  type="email"
                  placeholder="ইমেইল"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              <button
                type="button"
                onClick={handleSave}
                className="w-full py-2 rounded-xl bg-blue-600 text-white font-bold text-xs"
              >
                পরিবর্তন সেভ করুন
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="w-full py-2 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center justify-center gap-1.5 transition"
            >
              <Edit2 className="w-3.5 h-3.5" /> কার্ডের তথ্য এডিট করুন
            </button>
          )}

          {/* Real Actions: Download vCard & Share */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleDownloadVCard}
              className="py-3 px-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20 transition active:scale-95"
            >
              <Download className="w-4 h-4" /> ফোনে সেভ করুন (.vcf)
            </button>

            <button
              type="button"
              onClick={handleNativeShare}
              className="py-3 px-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-blue-600/20 transition active:scale-95"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-300" /> লিংক কপি হয়েছে
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4" /> কার্ড শেয়ার করুন
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
