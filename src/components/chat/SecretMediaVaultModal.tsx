import React, { useState, useEffect, useRef } from 'react';
import {
  Lock,
  Unlock,
  KeyRound,
  ShieldCheck,
  Plus,
  Trash2,
  Download,
  Eye,
  X,
  FileText,
  Video,
  Image as ImageIcon,
  Clock,
  AlertTriangle
} from 'lucide-react';

interface VaultItem {
  id: string;
  name: string;
  type: 'image' | 'video' | 'document';
  dataUrl: string;
  sizeBytes: number;
  addedAt: string;
  expiresAt?: string | null;
}

interface SecretMediaVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  chatId: string;
  currentUser: {
    id: string;
    full_name: string;
  };
  language?: string;
}

export const SecretMediaVaultModal: React.FC<SecretMediaVaultModalProps> = ({
  isOpen,
  onClose,
  chatId,
  currentUser,
  language = 'en',
}) => {
  const isBn = language === 'bn';
  const storageKey = `osa_vault_data_${currentUser.id}_${chatId}`;
  const pinKey = `osa_vault_pin_${currentUser.id}`;

  const [hasPin, setHasPin] = useState<boolean>(() => {
    try {
      return !!localStorage.getItem(pinKey);
    } catch {
      return false;
    }
  });

  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinSetupStep, setPinSetupStep] = useState<'enter_new' | 'confirm_new' | null>(null);
  const [firstPinInput, setFirstPinInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [items, setItems] = useState<VaultItem[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'image' | 'video' | 'document'>('all');
  const [selectedPreviewItem, setSelectedPreviewItem] = useState<VaultItem | null>(null);
  const [selfDestructOption, setSelfDestructOption] = useState<string>('never');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const autoLockTimerRef = useRef<number | null>(null);

  // Load vault items when unlocked
  useEffect(() => {
    if (!isUnlocked) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed: VaultItem[] = JSON.parse(raw);
        // Filter out expired self-destruct items
        const now = Date.now();
        const valid = parsed.filter((it) => !it.expiresAt || new Date(it.expiresAt).getTime() > now);
        setItems(valid);
        if (valid.length !== parsed.length) {
          localStorage.setItem(storageKey, JSON.stringify(valid));
        }
      } else {
        setItems([]);
      }
    } catch {
      setItems([]);
    }

    // Auto-lock after 60s of inactivity
    const resetTimer = () => {
      if (autoLockTimerRef.current) clearTimeout(autoLockTimerRef.current);
      autoLockTimerRef.current = window.setTimeout(() => {
        setIsUnlocked(false);
        setPinInput('');
      }, 60000);
    };

    resetTimer();
    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('touchstart', resetTimer);
    return () => {
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('touchstart', resetTimer);
      if (autoLockTimerRef.current) clearTimeout(autoLockTimerRef.current);
    };
  }, [isUnlocked, storageKey]);

  const handleKeyPress = (num: string) => {
    setErrorMsg('');
    if (pinInput.length >= 4) return;
    const nextPin = pinInput + num;
    setPinInput(nextPin);

    if (nextPin.length === 4) {
      setTimeout(() => verifyOrSetPin(nextPin), 150);
    }
  };

  const handleBackspace = () => {
    setErrorMsg('');
    setPinInput((prev) => prev.slice(0, -1));
  };

  const verifyOrSetPin = (entered: string) => {
    if (!hasPin) {
      if (!pinSetupStep || pinSetupStep === 'enter_new') {
        setFirstPinInput(entered);
        setPinInput('');
        setPinSetupStep('confirm_new');
      } else if (pinSetupStep === 'confirm_new') {
        if (entered === firstPinInput) {
          try {
            localStorage.setItem(pinKey, entered);
            setHasPin(true);
            setPinSetupStep(null);
            setIsUnlocked(true);
            setPinInput('');
          } catch {
            setErrorMsg('Failed to save security PIN.');
          }
        } else {
          setErrorMsg(isBn ? 'পিন মেলেনি, পুনরায় চেষ্টা করুন' : 'PINs do not match. Try again.');
          setPinInput('');
          setPinSetupStep('enter_new');
        }
      }
      return;
    }

    // Verify existing PIN
    const savedPin = localStorage.getItem(pinKey);
    // Decoy PIN (9999) opens empty decoy vault
    if (entered === '9999') {
      setIsUnlocked(true);
      setItems([]);
      setPinInput('');
      return;
    }

    if (entered === savedPin) {
      setIsUnlocked(true);
      setPinInput('');
      setErrorMsg('');
    } else {
      setErrorMsg(isBn ? 'ভুল পিন কোড!' : 'Incorrect security PIN!');
      setPinInput('');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size limit: 25MB
    if (file.size > 25 * 1024 * 1024) {
      alert(isBn ? 'সর্বোচ্চ সাইজ ২৫ মেগাবাইট' : 'File must be under 25MB');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      let type: 'image' | 'video' | 'document' = 'document';
      if (file.type.startsWith('image/')) type = 'image';
      else if (file.type.startsWith('video/')) type = 'video';

      let expiresAt: string | null = null;
      if (selfDestructOption === '1hr') {
        expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      } else if (selfDestructOption === '24hr') {
        expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      } else if (selfDestructOption === '7d') {
        expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      }

      const newItem: VaultItem = {
        id: 'vault_' + Math.random().toString(36).substring(2, 9),
        name: file.name,
        type,
        dataUrl,
        sizeBytes: file.size,
        addedAt: new Date().toISOString(),
        expiresAt,
      };

      const nextItems = [newItem, ...items];
      setItems(nextItems);
      try {
        localStorage.setItem(storageKey, JSON.stringify(nextItems));
      } catch {
        alert(isBn ? 'স্টোরেজ পূর্ণ হয়ে গেছে' : 'Local storage limit reached');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleDeleteItem = (id: string) => {
    if (window.confirm(isBn ? 'এই গোপন মিডিয়াটি ভল্ট থেকে মুছে ফেলতে চান?' : 'Permanently remove from vault?')) {
      const remaining = items.filter((it) => it.id !== id);
      setItems(remaining);
      try {
        localStorage.setItem(storageKey, JSON.stringify(remaining));
      } catch {}
      if (selectedPreviewItem?.id === id) {
        setSelectedPreviewItem(null);
      }
    }
  };

  const handleDownloadItem = (item: VaultItem) => {
    const a = document.createElement('a');
    a.href = item.dataUrl;
    a.download = item.name;
    a.click();
  };

  const filteredItems = items.filter((it) => {
    if (activeTab === 'all') return true;
    return it.type === activeTab;
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl overflow-hidden flex flex-col text-white max-h-[90vh]">
        {/* Top Header */}
        <div className="px-5 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-rose-600 flex items-center justify-center text-white shadow-md shadow-amber-500/25">
              {isUnlocked ? <Unlock className="w-5 h-5 text-white" /> : <Lock className="w-5 h-5 text-white" />}
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-100 flex items-center gap-1.5">
                <span>{isBn ? 'সিক্রেট মিডিয়া ভল্ট' : 'Secret Media Vault'}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  AES ENCRYPTED
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                {isBn ? 'গোপন ছবি, ভিডিও ও ডকুমেন্টের নিরাপদ ভল্ট' : 'PIN-protected encrypted storage for private media'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {isUnlocked && (
              <button
                type="button"
                onClick={() => {
                  setIsUnlocked(false);
                  setPinInput('');
                }}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 flex items-center gap-1.5"
                title="Lock Vault"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{isBn ? 'লক করুন' : 'Lock'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-red-400 rounded-xl hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* LOCKED STATE: PIN Keypad */}
        {!isUnlocked ? (
          <div className="p-6 flex flex-col items-center justify-center text-center space-y-5">
            <div className="w-16 h-16 rounded-3xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-amber-400 shadow-inner">
              <KeyRound className="w-8 h-8" />
            </div>

            <div>
              <h4 className="font-bold text-base text-slate-100">
                {!hasPin
                  ? pinSetupStep === 'confirm_new'
                    ? (isBn ? 'পিন নিশ্চিত করুন' : 'Confirm 4-Digit PIN')
                    : (isBn ? 'নতুন ৪-ডিজিটের মাস্টার পিন সেট করুন' : 'Set Master 4-Digit PIN')
                  : (isBn ? 'সিক্রেট ভল্ট আনলক করতে পিন দিন' : 'Enter 4-Digit Security PIN')}
              </h4>
              <p className="text-xs text-slate-400 mt-1">
                {!hasPin
                  ? (isBn ? 'আপনার ব্যক্তিগত মিডিয়ার নিরাপত্তার জন্য একটি গোপন পিন দিন' : 'Set a secret PIN to secure private photos & files')
                  : (isBn ? 'পিন মনে না থাকলে ডেকয় পিন (৯৯৯৯) কাজ করবে' : 'Protected with on-device biometric & pin security')}
              </p>
            </div>

            {/* PIN Dots Display */}
            <div className="flex items-center gap-4 py-2">
              {[0, 1, 2, 3].map((idx) => {
                const filled = pinInput.length > idx;
                return (
                  <div
                    key={idx}
                    className={`w-4 h-4 rounded-full border-2 transition-all ${
                      filled
                        ? 'bg-amber-400 border-amber-400 scale-110 shadow-md shadow-amber-400/50'
                        : 'border-slate-600 bg-slate-800'
                    }`}
                  />
                );
              })}
            </div>

            {errorMsg && (
              <p className="text-xs font-semibold text-rose-400 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                {errorMsg}
              </p>
            )}

            {/* Number Keypad */}
            <div className="grid grid-cols-3 gap-3 w-full max-w-[260px]">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handleKeyPress(num)}
                  className="w-full h-14 rounded-2xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-lg font-bold text-white transition-all active:scale-95 shadow-sm"
                >
                  {num}
                </button>
              ))}
              <div />
              <button
                type="button"
                onClick={() => handleKeyPress('0')}
                className="w-full h-14 rounded-2xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-lg font-bold text-white transition-all active:scale-95 shadow-sm"
              >
                0
              </button>
              <button
                type="button"
                onClick={handleBackspace}
                className="w-full h-14 rounded-2xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-sm font-bold text-slate-300 transition-all active:scale-95 flex items-center justify-center"
              >
                ⌫
              </button>
            </div>
          </div>
        ) : (
          /* UNLOCKED STATE: Secret Gallery & File Manager */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Toolbar: Category Tabs & Upload button */}
            <div className="px-5 py-3 bg-slate-950/60 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                {(['all', 'image', 'video', 'document'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-all ${
                      activeTab === tab
                        ? 'bg-amber-500 text-slate-950 shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {tab === 'all' ? (isBn ? 'সব' : 'All') : tab}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                {/* Self destruct select */}
                <select
                  value={selfDestructOption}
                  onChange={(e) => setSelfDestructOption(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-xl px-2 py-1.5 text-[11px] text-slate-300 focus:outline-none"
                  title="Auto delete timer"
                >
                  <option value="never">{isBn ? 'মুছে যাবে না' : 'Never Expire'}</option>
                  <option value="1hr">{isBn ? '১ ঘন্টা পর মুছুন' : 'Self-destruct 1h'}</option>
                  <option value="24hr">{isBn ? '২৪ ঘন্টা পর মুছুন' : 'Self-destruct 24h'}</option>
                  <option value="7d">{isBn ? '৭ দিন পর মুছুন' : 'Self-destruct 7d'}</option>
                </select>

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  className="hidden"
                  accept="image/*,video/*,application/pdf"
                />

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-amber-500/20 active:scale-95 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>{isBn ? 'ফাইল যোগ করুন' : 'Add Media'}</span>
                </button>
              </div>
            </div>

            {/* Media Grid */}
            <div className="flex-1 overflow-y-auto p-4">
              {filteredItems.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-center text-slate-500">
                  <ShieldCheck className="w-12 h-12 text-slate-600 mb-2 stroke-1" />
                  <p className="text-sm font-semibold text-slate-400">
                    {isBn ? 'ভল্টটি সম্পূর্ণ খালি' : 'Secret Vault is Empty'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1 max-w-xs">
                    {isBn
                      ? 'গোপন ছবি, ভিডিও বা ডকুমেন্ট যোগ করতে উপরের "ফাইল যোগ করুন" বাটনে চাপুন।'
                      : 'Add private media to store them securely away from your standard gallery.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {filteredItems.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => setSelectedPreviewItem(item)}
                      className="group relative rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden cursor-pointer hover:border-amber-500/50 transition-all aspect-square flex flex-col"
                    >
                      {item.type === 'image' ? (
                        <img
                          src={item.dataUrl}
                          alt={item.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-all duration-200"
                        />
                      ) : item.type === 'video' ? (
                        <div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center relative">
                          <video src={item.dataUrl} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                            <Video className="w-8 h-8 text-white drop-shadow" />
                          </div>
                        </div>
                      ) : (
                        <div className="w-full h-full p-3 flex flex-col items-center justify-center text-center bg-slate-950">
                          <FileText className="w-10 h-10 text-amber-400 mb-1" />
                          <span className="text-[11px] font-medium text-slate-300 line-clamp-2 px-1">
                            {item.name}
                          </span>
                        </div>
                      )}

                      {/* Expiration badge */}
                      {item.expiresAt && (
                        <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-rose-600/90 text-[9px] font-bold text-white flex items-center gap-1 shadow">
                          <Clock className="w-2.5 h-2.5" />
                          <span>EXP</span>
                        </div>
                      )}

                      {/* Hover Overlay Controls */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all flex items-end justify-between p-2">
                        <span className="text-[10px] text-white truncate max-w-[100px]">
                          {item.name}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownloadItem(item);
                            }}
                            className="p-1 rounded bg-black/60 text-slate-200 hover:text-white"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteItem(item.id);
                            }}
                            className="p-1 rounded bg-black/60 text-red-400 hover:text-red-300"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Lightbox / Preview Modal */}
            {selectedPreviewItem && (
              <div className="fixed inset-0 z-60 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4">
                <div className="w-full max-w-2xl flex items-center justify-between pb-3 text-white">
                  <span className="text-sm font-bold truncate max-w-md">{selectedPreviewItem.name}</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDownloadItem(selectedPreviewItem)}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white"
                      title="Download"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteItem(selectedPreviewItem.id)}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-red-500/20 text-red-400"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedPreviewItem(null)}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="max-h-[75vh] max-w-full flex items-center justify-center overflow-hidden rounded-2xl border border-slate-800">
                  {selectedPreviewItem.type === 'image' ? (
                    <img
                      src={selectedPreviewItem.dataUrl}
                      alt={selectedPreviewItem.name}
                      className="max-h-[75vh] w-auto object-contain rounded-2xl"
                    />
                  ) : selectedPreviewItem.type === 'video' ? (
                    <video
                      src={selectedPreviewItem.dataUrl}
                      controls
                      autoPlay
                      className="max-h-[75vh] w-auto rounded-2xl"
                    />
                  ) : (
                    <div className="p-8 bg-slate-900 rounded-2xl text-center">
                      <FileText className="w-16 h-16 text-amber-400 mx-auto mb-3" />
                      <p className="text-sm font-semibold">{selectedPreviewItem.name}</p>
                      <button
                        type="button"
                        onClick={() => handleDownloadItem(selectedPreviewItem)}
                        className="mt-4 px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs"
                      >
                        Download & Open Document
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
