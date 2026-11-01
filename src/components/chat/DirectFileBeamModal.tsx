import React, { useState, useEffect, useRef } from 'react';
import {
  Zap,
  Upload,
  Download,
  X,
  File,
  CheckCircle2,
  AlertCircle,
  Wifi,
  HardDrive,
  RefreshCw,
  Share2
} from 'lucide-react';
import { RealtimeChannel } from '@supabase/supabase-js';

interface DirectFileBeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  channel: RealtimeChannel | null;
  chatId: string;
  currentUser: {
    id: string;
    full_name: string;
  };
  language?: string;
}

const CHUNK_SIZE = 64 * 1024; // 64 KB binary chunks

export const DirectFileBeamModal: React.FC<DirectFileBeamModalProps> = ({
  isOpen,
  onClose,
  channel,
  chatId,
  currentUser,
  language = 'en',
}) => {
  const isBn = language === 'bn';

  const [mode, setMode] = useState<'send' | 'receive'>('send');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [transferStatus, setTransferStatus] = useState<'idle' | 'transferring' | 'completed' | 'error'>('idle');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [speedMBps, setSpeedMBps] = useState<number>(0);
  const [receivedFileInfo, setReceivedFileInfo] = useState<{ name: string; size: number; blobUrl: string } | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const incomingChunksRef = useRef<Map<number, string>>(new Map());
  const incomingMetaRef = useRef<{ id: string; name: string; size: number; totalChunks: number; type: string } | null>(null);
  const startTimeRef = useRef<number>(0);

  // Set up listeners for incoming beam chunks over channel
  useEffect(() => {
    if (!channel || !isOpen) return;

    const handleBeam = (payload: { payload: { 
      senderId: string; 
      type: 'meta' | 'chunk' | 'complete';
      transferId?: string;
      fileName?: string;
      fileSize?: number;
      fileType?: string;
      totalChunks?: number;
      chunkIndex?: number;
      dataBase64?: string;
    } }) => {
      const data = payload.payload;
      if (data.senderId === currentUser.id) return;

      if (data.type === 'meta') {
        // Start receiving file
        setMode('receive');
        setTransferStatus('transferring');
        setProgressPercent(0);
        incomingChunksRef.current.clear();
        incomingMetaRef.current = {
          id: data.transferId || '',
          name: data.fileName || 'received-file',
          size: data.fileSize || 0,
          totalChunks: data.totalChunks || 1,
          type: data.fileType || 'application/octet-stream',
        };
        setStatusMessage(isBn ? `ফাইল আসছে: ${data.fileName}` : `Receiving: ${data.fileName}`);
        startTimeRef.current = Date.now();
      } else if (data.type === 'chunk') {
        if (!incomingMetaRef.current || incomingMetaRef.current.id !== data.transferId) return;
        if (typeof data.chunkIndex === 'number' && data.dataBase64) {
          incomingChunksRef.current.set(data.chunkIndex, data.dataBase64);
          const total = incomingMetaRef.current.totalChunks;
          const currentCount = incomingChunksRef.current.size;
          const pct = Math.min(99, Math.round((currentCount / total) * 100));
          setProgressPercent(pct);

          const elapsedSec = (Date.now() - startTimeRef.current) / 1000;
          if (elapsedSec > 0.5) {
            const bytesReceived = currentCount * CHUNK_SIZE;
            setSpeedMBps(Math.round((bytesReceived / (1024 * 1024 * elapsedSec)) * 10) / 10);
          }
        }
      } else if (data.type === 'complete') {
        if (!incomingMetaRef.current || incomingMetaRef.current.id !== data.transferId) return;
        // Assemble all chunks
        try {
          const total = incomingMetaRef.current.totalChunks;
          const byteArrays: Uint8Array[] = [];
          for (let i = 0; i < total; i++) {
            const b64 = incomingChunksRef.current.get(i);
            if (b64) {
              const binary = atob(b64);
              const bytes = new Uint8Array(binary.length);
              for (let j = 0; j < binary.length; j++) {
                bytes[j] = binary.charCodeAt(j);
              }
              byteArrays.push(bytes);
            }
          }

          const blob = new Blob(byteArrays as BlobPart[], { type: incomingMetaRef.current.type });
          const blobUrl = URL.createObjectURL(blob);
          setReceivedFileInfo({
            name: incomingMetaRef.current.name,
            size: incomingMetaRef.current.size,
            blobUrl,
          });
          setProgressPercent(100);
          setTransferStatus('completed');
          setStatusMessage(isBn ? 'ফাইল স্থানান্তর সফল!' : 'File received successfully!');
        } catch {
          setTransferStatus('error');
          setStatusMessage('Failed to assemble incoming file chunks.');
        }
      }
    };

    channel.on('broadcast', { event: 'direct_file_beam' }, handleBeam);

    return () => {
      // cleanup
    };
  }, [channel, isOpen, currentUser.id, isBn]);

  const handleStartBeam = async () => {
    if (!selectedFile || !channel) return;
    setTransferStatus('transferring');
    setProgressPercent(0);
    setStatusMessage(isBn ? 'ফাইল ট্রান্সমিশন শুরু হচ্ছে...' : 'Initializing direct file beam...');
    startTimeRef.current = Date.now();

    const transferId = 'beam_' + Math.random().toString(36).substring(2, 9);
    const totalChunks = Math.ceil(selectedFile.size / CHUNK_SIZE);

    try {
      // 1. Send metadata
      channel.send({
        type: 'broadcast',
        event: 'direct_file_beam',
        payload: {
          senderId: currentUser.id,
          type: 'meta',
          transferId,
          fileName: selectedFile.name,
          fileSize: selectedFile.size,
          fileType: selectedFile.type,
          totalChunks,
        },
      });

      // 2. Read and stream chunks
      let offset = 0;
      let chunkIdx = 0;

      while (offset < selectedFile.size) {
        const slice = selectedFile.slice(offset, offset + CHUNK_SIZE);
        const buffer = await slice.arrayBuffer();
        
        // Convert to base64
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const dataBase64 = btoa(binary);

        channel.send({
          type: 'broadcast',
          event: 'direct_file_beam',
          payload: {
            senderId: currentUser.id,
            type: 'chunk',
            transferId,
            chunkIndex: chunkIdx,
            dataBase64,
          },
        });

        chunkIdx++;
        offset += CHUNK_SIZE;
        const pct = Math.min(99, Math.round((chunkIdx / totalChunks) * 100));
        setProgressPercent(pct);

        const elapsedSec = (Date.now() - startTimeRef.current) / 1000;
        if (elapsedSec > 0.5) {
          const bytesSent = chunkIdx * CHUNK_SIZE;
          setSpeedMBps(Math.round((bytesSent / (1024 * 1024 * elapsedSec)) * 10) / 10);
        }

        // Small yield to prevent blocking UI & socket flooding
        if (chunkIdx % 4 === 0) {
          await new Promise((r) => setTimeout(r, 20));
        }
      }

      // 3. Send complete signal
      channel.send({
        type: 'broadcast',
        event: 'direct_file_beam',
        payload: {
          senderId: currentUser.id,
          type: 'complete',
          transferId,
        },
      });

      setProgressPercent(100);
      setTransferStatus('completed');
      setStatusMessage(isBn ? 'ফাইল সফলভাবে পাঠানো সম্পন্ন হয়েছে!' : 'Direct beam transfer completed!');
    } catch {
      setTransferStatus('error');
      setStatusMessage('Transmission interrupted.');
    }
  };

  const handleDownloadReceived = () => {
    if (!receivedFileInfo) return;
    const a = document.createElement('a');
    a.href = receivedFileInfo.blobUrl;
    a.download = receivedFileInfo.name;
    a.click();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-cyan-500/30 rounded-3xl shadow-2xl overflow-hidden flex flex-col text-white">
        {/* Sci-fi Accent Bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500" />

        {/* Header */}
        <div className="px-5 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center shadow-md shadow-cyan-500/20">
              <Zap className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-100 flex items-center gap-1.5">
                <span>{isBn ? 'ডাইরেক্ট ফাইল বিম (P2P)' : 'Direct P2P File Beam'}</span>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-mono">
                  ZERO-DATA
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                {isBn ? 'সীমাহীন সাইজের ফাইল সরাসরি ডিভাইস টু ডিভাইসে পাঠান' : 'Direct zero-server device to device transfer'}
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

        {/* Mode Toggle Tabs */}
        <div className="px-5 pt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setMode('send')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              mode === 'send'
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/25'
                : 'bg-slate-800/80 text-slate-400 hover:text-white'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>{isBn ? 'ফাইল পাঠান' : 'Beam Send'}</span>
          </button>

          <button
            type="button"
            onClick={() => setMode('receive')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              mode === 'receive'
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/25'
                : 'bg-slate-800/80 text-slate-400 hover:text-white'
            }`}
          >
            <Download className="w-4 h-4" />
            <span>{isBn ? 'রিসিভ মোড' : 'Beam Receive'}</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 space-y-4">
          {mode === 'send' ? (
            <div className="space-y-4">
              <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    setSelectedFile(e.target.files[0]);
                    setTransferStatus('idle');
                    setProgressPercent(0);
                  }
                }}
                className="hidden"
              />

              {!selectedFile ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="p-8 border-2 border-dashed border-slate-700 hover:border-cyan-500/50 rounded-2xl bg-slate-950/50 flex flex-col items-center justify-center text-center cursor-pointer group transition-all"
                >
                  <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center group-hover:scale-110 transition-all mb-3">
                    <Upload className="w-7 h-7" />
                  </div>
                  <p className="text-xs font-bold text-slate-200">
                    {isBn ? 'যেকোনো সাইজের ফাইল সিলেক্ট করুন' : 'Select any large file to Beam'}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {isBn ? 'ভিডিও, জিপ, সফটওয়্যার বা বড় ডকুমেন্ট' : 'Videos, ZIP archives, APKs or large documents'}
                  </p>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
                        <File className="w-5 h-5" />
                      </div>
                      <div className="truncate">
                        <p className="text-xs font-bold text-white truncate">{selectedFile.name}</p>
                        <p className="text-[10px] text-slate-400">
                          {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={transferStatus === 'transferring'}
                      onClick={() => {
                        setSelectedFile(null);
                        setTransferStatus('idle');
                      }}
                      className="p-1.5 text-slate-400 hover:text-red-400 rounded-lg hover:bg-slate-800"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Beam Progress bar */}
                  {transferStatus !== 'idle' && (
                    <div className="space-y-1.5 pt-2">
                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <span className="text-cyan-400">{progressPercent}% Transferred</span>
                        <span className="text-slate-400">{speedMBps} MB/s</span>
                      </div>
                      <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div
                          style={{ width: `${progressPercent}%` }}
                          className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-150"
                        />
                      </div>
                    </div>
                  )}

                  {statusMessage && (
                    <p className="text-xs font-medium text-slate-300 flex items-center gap-1.5 pt-1">
                      {transferStatus === 'completed' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : transferStatus === 'error' ? (
                        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      ) : (
                        <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin shrink-0" />
                      )}
                      <span>{statusMessage}</span>
                    </p>
                  )}
                </div>
              )}

              {selectedFile && (
                <button
                  type="button"
                  disabled={transferStatus === 'transferring'}
                  onClick={handleStartBeam}
                  className="w-full py-3 rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 transition-all"
                >
                  <Zap className="w-4 h-4 fill-slate-950" />
                  <span>
                    {transferStatus === 'transferring'
                      ? (isBn ? 'বিম ট্রান্সমিশন চলছে...' : 'Beaming Direct Stream...')
                      : (isBn ? 'সরাসরি পিটুপি ট্রান্সফার শুরু করুন' : 'Start Direct Beam Transfer')}
                  </span>
                </button>
              )}
            </div>
          ) : (
            /* Receive Mode HUD */
            <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col items-center justify-center text-center space-y-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                  <Wifi className="w-8 h-8 animate-pulse" />
                </div>
                <div className="absolute inset-0 rounded-full border border-cyan-500/40 animate-ping pointer-events-none" />
              </div>

              <div>
                <h4 className="font-bold text-sm text-slate-200">
                  {isBn ? 'রিসিভিং বিম চ্যানেল সক্রিয়' : 'Beam Receiver Listening'}
                </h4>
                <p className="text-xs text-slate-400 mt-1 max-w-xs">
                  {isBn
                    ? 'অন্য প্রান্ত থেকে ফাইল বিম পাঠালে স্বয়ংক্রিয়ভাবে এখানে ডাউনলোড হবে।'
                    : 'Whenever your chat peer starts a direct file beam, it will stream right here.'}
                </p>
              </div>

              {/* Progress if receiving */}
              {transferStatus === 'transferring' && (
                <div className="w-full space-y-2 pt-2">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-cyan-400">{progressPercent}%</span>
                    <span className="text-slate-400">{speedMBps} MB/s</span>
                  </div>
                  <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${progressPercent}%` }}
                      className="h-full bg-cyan-500 rounded-full transition-all"
                    />
                  </div>
                  <p className="text-xs text-slate-300">{statusMessage}</p>
                </div>
              )}

              {receivedFileInfo && (
                <div className="w-full p-3 rounded-xl bg-slate-900 border border-emerald-500/40 flex items-center justify-between">
                  <div className="text-left truncate pr-2">
                    <p className="text-xs font-bold text-emerald-400 truncate">{receivedFileInfo.name}</p>
                    <p className="text-[10px] text-slate-400">
                      {(receivedFileInfo.size / (1024 * 1024)).toFixed(2)} MB
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadReceived}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
