import React, { useState, useRef } from 'react';
import {
  WifiOff,
  Radio,
  Share2,
  Download,
  UploadCloud,
  FileCheck,
  QrCode,
  Smartphone,
  X,
  CheckCircle,
  FileText,
  Image as ImageIcon,
} from 'lucide-react';

interface OfflineP2PShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserName?: string;
}

export const OfflineP2PShareModal: React.FC<OfflineP2PShareModalProps> = ({
  isOpen,
  onClose,
  currentUserName = 'User',
}) => {
  const [activeMode, setActiveMode] = useState<'send' | 'receive'>('send');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [transferProgress, setTransferProgress] = useState(0);
  const [transferSpeed, setTransferSpeed] = useState('');
  const [transferComplete, setTransferComplete] = useState(false);
  const [connectedPeer, setConnectedPeer] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setTransferProgress(0);
      setTransferComplete(false);
    }
  };

  const startSharing = () => {
    if (!selectedFile) return;
    setIsScanning(true);
    setConnectedPeer(null);

    // Simulate discovering nearby peer
    setTimeout(() => {
      setConnectedPeer('OSA-Galaxy-Nearby (সাকিব)');
      setIsScanning(false);

      // Simulate high-speed local transfer
      let prog = 0;
      const interval = setInterval(() => {
        prog += 12;
        if (prog >= 100) {
          prog = 100;
          clearInterval(interval);
          setTransferComplete(true);
          setTransferSpeed('28.5 MB/s');
        } else {
          setTransferSpeed(`${(22 + Math.random() * 8).toFixed(1)} MB/s`);
        }
        setTransferProgress(prog);
      }, 250);
    }, 1800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-blue-600/10 via-indigo-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/25">
              <Share2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                অফলাইন পিয়ার-টু-পিয়ার ফাইল শেয়ার
                <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 rounded-full flex items-center gap-1">
                  <WifiOff className="w-3 h-3" /> No Internet
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                ইন্টারনেট ছাড়াই এয়ারড্রপ স্টাইলে হাই-স্পিড ফাইল পাঠানো
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

        {/* Send / Receive Tab Switcher */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 bg-slate-50/50 dark:bg-slate-900/50">
          <button
            onClick={() => {
              setActiveMode('send');
              setTransferComplete(false);
            }}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
              activeMode === 'send'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            <UploadCloud className="w-4 h-4" /> ফাইল পাঠান (Send)
          </button>
          <button
            onClick={() => {
              setActiveMode('receive');
              setTransferComplete(false);
            }}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
              activeMode === 'receive'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            <Download className="w-4 h-4" /> রিসিভ করুন (Receive)
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex-1 min-h-0 overflow-y-auto space-y-4">
          {activeMode === 'send' ? (
            <div className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileChange}
                className="hidden"
              />

              {/* File Dropzone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="p-6 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 bg-slate-50 dark:bg-slate-800/40 text-center cursor-pointer transition"
              >
                {selectedFile ? (
                  <div className="flex flex-col items-center">
                    <FileCheck className="w-10 h-10 text-emerald-500 mb-2" />
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate max-w-xs">
                      {selectedFile.name}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • ট্যাপ করে পরিবর্তন করুন
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-600 flex items-center justify-center mb-2">
                      <UploadCloud className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      যেকোনো ফটো, ভিডিও বা ফাইল নির্বাচন করুন
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      হটস্পট বা লোকাল ওয়াইফাই মেশে ট্রান্সফার হবে
                    </p>
                  </div>
                )}
              </div>

              {/* Nearby Radar Scan Visual */}
              {isScanning && (
                <div className="p-6 rounded-2xl bg-slate-100 dark:bg-slate-800/70 flex flex-col items-center justify-center text-center">
                  <div className="relative w-16 h-16 flex items-center justify-center mb-3">
                    <div className="absolute inset-0 rounded-full bg-blue-500/20 animate-ping" />
                    <div className="relative w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center">
                      <Radio className="w-6 h-6 animate-spin" />
                    </div>
                  </div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    আশেপাশের OSA ডিভাইস খোঁজা হচ্ছে...
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    রিসিভারের ফোনে Receive মোড অন রাখুন
                  </p>
                </div>
              )}

              {/* Connected Peer & Progress */}
              {connectedPeer && (
                <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-blue-600" />
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        {connectedPeer}
                      </span>
                    </div>
                    {transferComplete ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> সফল
                      </span>
                    ) : (
                      <span className="text-xs font-mono font-bold text-blue-600">
                        {transferSpeed}
                      </span>
                    )}
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-slate-200 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-blue-600 to-indigo-600 h-full transition-all duration-200 rounded-full"
                      style={{ width: `${transferProgress}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>প্রগ্রেস: {transferProgress}%</span>
                    <span>{transferComplete ? 'ফাইল ট্রান্সফার শেষ' : 'পাঠানো হচ্ছে...'}</span>
                  </div>
                </div>
              )}

              {/* Action Button */}
              <button
                disabled={!selectedFile || isScanning || (connectedPeer !== null && !transferComplete)}
                onClick={startSharing}
                className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-600/25 transition active:scale-95"
              >
                <Share2 className="w-4 h-4" />
                {transferComplete
                  ? 'আবার পাঠান'
                  : isScanning
                  ? 'ডিভাইস খোঁজা হচ্ছে...'
                  : 'অফলাইন ট্রান্সফার শুরু করুন'}
              </button>
            </div>
          ) : (
            /* Receive Mode */
            <div className="flex flex-col items-center text-center p-4 space-y-4">
              <div className="p-4 rounded-3xl bg-white dark:bg-slate-800 border-2 border-dashed border-blue-500/50 shadow-md">
                <QrCode className="w-40 h-40 text-slate-800 dark:text-white" />
              </div>

              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  আপনার ডিভাইস: OSA-{currentUserName}
                </p>
                <p className="text-xs text-slate-400 mt-1 max-w-xs">
                  সেন্ডারকে আপনার এই কিউআর কোডটি স্ক্যান করতে বলুন অথবা পাশের ডিভাইস সিলেক্ট করতে বলুন
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2">
                <WifiOff className="w-4 h-4 text-amber-500 shrink-0" />
                <span>কোনো মোবাইল ডাটা বা এমবি কাটবে না</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
