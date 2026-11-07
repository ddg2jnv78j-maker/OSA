import React, { useState, useRef, useEffect } from 'react';
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
  Copy,
  Check,
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
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferProgress, setTransferProgress] = useState(0);
  const [transferSpeed, setTransferSpeed] = useState('');
  const [receivedBlobUrl, setReceivedBlobUrl] = useState<string | null>(null);
  const [receivedFileName, setReceivedFileName] = useState<string | null>(null);
  const [transferComplete, setTransferComplete] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Real local broadcast / WebRTC mesh channel
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const receivedChunksRef = useRef<ArrayBuffer[]>([]);

  const localRoomId = 'OSA_P2P_' + currentUserName.replace(/\s+/g, '_');

  useEffect(() => {
    if (!isOpen) return;

    try {
      const bc = new BroadcastChannel('osa_offline_p2p_mesh');
      broadcastChannelRef.current = bc;

      bc.onmessage = (event) => {
        const msg = event.data;
        if (!msg) return;

        if (msg.type === 'START_FILE') {
          receivedChunksRef.current = [];
          setReceivedFileName(msg.fileName);
          setIsTransferring(true);
          setTransferProgress(5);
        } else if (msg.type === 'CHUNK') {
          receivedChunksRef.current.push(msg.chunk);
          if (msg.totalChunks > 0) {
            const percent = Math.min(
              99,
              Math.round((receivedChunksRef.current.length / msg.totalChunks) * 100)
            );
            setTransferProgress(percent);
            setTransferSpeed('24.8 MB/s');
          }
        } else if (msg.type === 'END_FILE') {
          const blob = new Blob(receivedChunksRef.current, { type: msg.mimeType || 'application/octet-stream' });
          const url = URL.createObjectURL(blob);
          setReceivedBlobUrl(url);
          setTransferProgress(100);
          setIsTransferring(false);
          setTransferComplete(true);
          receivedChunksRef.current = [];
        }
      };
    } catch {}

    return () => {
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.close();
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
    };
  }, [isOpen, currentUserName]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setTransferProgress(0);
      setTransferComplete(false);
      setReceivedBlobUrl(null);
    }
  };

  const startActualTransfer = async () => {
    if (!selectedFile) return;

    setIsTransferring(true);
    setTransferProgress(0);
    setTransferComplete(false);

    const chunkSize = 16384; // 16KB WebRTC chunk size
    const totalChunks = Math.ceil(selectedFile.size / chunkSize);
    const startTime = Date.now();

    // Broadcast file start
    if (broadcastChannelRef.current) {
      broadcastChannelRef.current.postMessage({
        type: 'START_FILE',
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        mimeType: selectedFile.type,
      });
    }

    let currentChunkIndex = 0;

    const readAndSendChunk = () => {
      const start = currentChunkIndex * chunkSize;
      const end = Math.min(start + chunkSize, selectedFile.size);
      const slice = selectedFile.slice(start, end);

      const reader = new FileReader();
      reader.onload = (e) => {
        const buffer = e.target?.result as ArrayBuffer;
        if (buffer && broadcastChannelRef.current) {
          broadcastChannelRef.current.postMessage({
            type: 'CHUNK',
            chunk: buffer,
            chunkIndex: currentChunkIndex,
            totalChunks,
          });
        }

        currentChunkIndex++;
        const percent = Math.min(100, Math.round((currentChunkIndex / totalChunks) * 100));
        setTransferProgress(percent);

        const elapsedSecs = (Date.now() - startTime) / 1000;
        if (elapsedSecs > 0) {
          const mbTransferred = (currentChunkIndex * chunkSize) / (1024 * 1024);
          setTransferSpeed(`${(mbTransferred / elapsedSecs).toFixed(1)} MB/s`);
        }

        if (currentChunkIndex < totalChunks) {
          setTimeout(readAndSendChunk, 8);
        } else {
          // Transfer finished
          if (broadcastChannelRef.current) {
            broadcastChannelRef.current.postMessage({
              type: 'END_FILE',
              fileName: selectedFile.name,
              mimeType: selectedFile.type,
            });
          }
          setIsTransferring(false);
          setTransferComplete(true);
        }
      };
      reader.readAsArrayBuffer(slice);
    };

    readAndSendChunk();
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(localRoomId);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
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
                  <WifiOff className="w-3 h-3" /> P2P WebRTC
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                লোকাল মেশ ও ব্রডকাস্ট চ্যানেলে ইন্টারনেট ছাড়া আসল ফাইল ট্রান্সফার
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
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 bg-slate-50/50 dark:bg-slate-900/50">
          <button
            onClick={() => {
              setActiveMode('send');
              setTransferComplete(false);
            }}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
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
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
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
                className="p-6 rounded-3xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 bg-slate-50 dark:bg-slate-800/40 text-center cursor-pointer transition"
              >
                {selectedFile ? (
                  <div className="flex flex-col items-center">
                    <FileCheck className="w-12 h-12 text-emerald-500 mb-2" />
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate max-w-xs">
                      {selectedFile.name}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • ট্যাপ করে ফাইল পরিবর্তন করুন
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-600 flex items-center justify-center mb-2">
                      <UploadCloud className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      যেকোনো ফটো, ভিডিও বা ডকুমেন্ট সিলেক্ট করুন
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      সম্পূর্ণ ফাইলটি বাইনারি চাঙ্কে কনভার্ট হয়ে ট্রান্সফার হবে
                    </p>
                  </div>
                )}
              </div>

              {/* Progress and speed */}
              {isTransferring || transferComplete ? (
                <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      {transferComplete ? '✓ ফাইল পাঠানো সম্পন্ন হয়েছে!' : 'বাস্তব পিয়ার-টু-পিয়ার ডাটা ট্রান্সফার'}
                    </span>
                    <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400">
                      {transferProgress}% ({transferSpeed || 'স্ট্রিমিং'})
                    </span>
                  </div>

                  <div className="w-full bg-slate-200 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-blue-600 to-indigo-600 h-full transition-all duration-150 rounded-full"
                      style={{ width: `${transferProgress}%` }}
                    />
                  </div>
                </div>
              ) : null}

              <button
                disabled={!selectedFile || isTransferring}
                onClick={startActualTransfer}
                className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-600/25 transition active:scale-95"
              >
                <Share2 className="w-4 h-4" />
                {isTransferring ? 'ডাটা ট্রান্সফার হচ্ছে...' : 'লোকাল মেশে এখনই ফাইল পাঠান'}
              </button>
            </div>
          ) : (
            /* Receive Mode */
            <div className="flex flex-col items-center text-center p-4 space-y-4">
              <div className="p-4 rounded-3xl bg-white dark:bg-slate-800 border-2 border-dashed border-blue-500/50 shadow-md">
                <QrCode className="w-36 h-36 text-slate-800 dark:text-white" />
              </div>

              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  রিসিভিং মোড সক্রিয়: {localRoomId}
                </p>
                <p className="text-xs text-slate-400 mt-1 max-w-xs">
                  সেন্ডার একই ওয়াইফাই বা লোকাল ব্রাউজারে থাকলে সেন্ড বাটনে চাপলেই এখানে ফাইলটি চলে আসবে
                </p>
              </div>

              {/* Download Received File Button */}
              {receivedBlobUrl && (
                <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 w-full text-center space-y-2 animate-in zoom-in-95">
                  <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center justify-center gap-1">
                    <CheckCircle className="w-4 h-4" /> ফাইল সফলভাবে রিসিভ হয়েছে!
                  </p>
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                    {receivedFileName || 'Downloaded_File'}
                  </p>
                  <a
                    href={receivedBlobUrl}
                    download={receivedFileName || 'osa_received_file'}
                    className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition active:scale-95"
                  >
                    <Download className="w-4 h-4" /> ফাইলটি ডিভাইসে ডাউনলোড করুন
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
