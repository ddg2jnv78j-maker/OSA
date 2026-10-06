import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Download,
  Eye,
  Loader2,
  RefreshCw,
  ShieldAlert,
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  RCAM_SIG_PREFIX,
  RemoteCameraSessionManager,
  RemoteCameraSignalPayload,
  RemoteCameraStatus,
} from '../services/remoteCameraService';
import { Profile } from '../types/osa';
import { OSAAvatar } from './OSAAvatar';

interface RemoteCameraModalProps {
  isOpen: boolean;
  currentUser: Profile;
  peerUser: Profile;
  onClose: () => void;
}

export const RemoteCameraModal: React.FC<RemoteCameraModalProps> = ({
  isOpen,
  currentUser,
  peerUser,
  onClose,
}) => {
  const [status, setStatus] = useState<RemoteCameraStatus>('requesting');
  const [statusMessage, setStatusMessage] = useState(
    'Requesting authorized Remote Camera access...'
  );
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [snapshotFlash, setSnapshotFlash] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const managerRef = useRef<RemoteCameraSessionManager | null>(null);

  const startSession = () => {
    if (managerRef.current) {
      managerRef.current.cleanup();
      managerRef.current = null;
    }

    setRemoteStream(null);
    setStatus('requesting');
    setStatusMessage(`Connecting to ${peerUser.full_name}'s Remote Camera...`);

    const sessionId = `rcam_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const manager = new RemoteCameraSessionManager({
      sessionId,
      currentUserId: currentUser.id,
      currentUserName: currentUser.full_name,
      peerUserId: peerUser.id,
      onRemoteStream: (stream) => {
        setRemoteStream(stream);
      },
      onStatusChange: (nextStatus, msg) => {
        setStatus(nextStatus);
        if (msg) setStatusMessage(msg);
      },
    });

    managerRef.current = manager;
    manager.startViewerRequest();
  };

  useEffect(() => {
    if (!isOpen) return;
    startSession();

    const dbChannel = supabase
      .channel(`osa-rcam-db-rx-${currentUser.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${currentUser.id}`,
        },
        (payload) => {
          const item = payload.new as { body?: string };
          if (!item?.body || !item.body.startsWith(RCAM_SIG_PREFIX)) return;
          try {
            const sig = JSON.parse(
              item.body.slice(RCAM_SIG_PREFIX.length)
            ) as RemoteCameraSignalPayload;
            if (
              managerRef.current &&
              sig.sessionId === managerRef.current.getSessionId()
            ) {
              managerRef.current.handleIncomingSignal(sig);
            }
          } catch {
            // Ignore malformed signal
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(dbChannel);
      if (managerRef.current) {
        managerRef.current.stopSession();
        managerRef.current = null;
      }
    };
  }, [isOpen, peerUser.id]);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    if (remoteStream) {
      videoEl.srcObject = remoteStream;
      videoEl.play().catch(() => {});
    } else {
      videoEl.srcObject = null;
    }
  }, [remoteStream, status]);

  if (!isOpen) return null;

  const handleClose = async () => {
    if (managerRef.current) {
      await managerRef.current.stopSession();
      managerRef.current = null;
    }
    onClose();
  };

  const handleCaptureSnapshot = () => {
    const videoEl = videoRef.current;
    if (!videoEl || videoEl.videoWidth === 0 || videoEl.videoHeight === 0) return;

    const canvas = document.createElement('canvas');
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `OSA-RemoteCamera-${peerUser.full_name.replace(/\s+/g, '_')}-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setSnapshotFlash(true);
    setTimeout(() => setSnapshotFlash(false), 300);
  };

  const isStreaming = status === 'streaming' && Boolean(remoteStream);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 overflow-hidden">
      <div className="w-full max-w-xl rounded-3xl bg-slate-900 border border-slate-800 text-white shadow-2xl overflow-hidden flex flex-col max-h-dvh-modal">
        {snapshotFlash && (
          <div className="fixed inset-0 z-50 bg-white/70 pointer-events-none" />
        )}

        {/* Header */}
        <div className="shrink-0 px-5 py-4 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center shrink-0">
              <Eye className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold truncate">OSA Remote Camera</h3>
                {isStreaming && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                    LIVE
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 truncate">
                Device: {peerUser.full_name}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300"
            title="Close Remote Camera"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewport */}
        <div className="flex-1 min-h-0 overflow-y-auto relative w-full aspect-video bg-slate-950 flex items-center justify-center">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className={`w-full h-full object-contain ${isStreaming ? 'block' : 'hidden'}`}
          />

          {!isStreaming && (
            <div className="p-6 flex flex-col items-center justify-center text-center space-y-3 max-w-sm">
              {(status === 'requesting' ||
                status === 'waiting_consent' ||
                status === 'connecting') && (
                <>
                  <div className="relative">
                    <OSAAvatar
                      name={peerUser.full_name}
                      avatarUrl={peerUser.avatar_url}
                      size="lg"
                    />
                    <span className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-md">
                      <Loader2 className="w-4 h-4 animate-spin" />
                    </span>
                  </div>
                  <p className="text-sm font-bold text-white">{statusMessage}</p>
                  <p className="text-xs text-slate-400">
                    {status === 'waiting_consent'
                      ? `${peerUser.full_name} has manual Remote Camera confirmation enabled. Waiting for them to tap Allow...`
                      : 'Establishing dedicated WebRTC camera stream (separate from voice/video calls).'}
                  </p>
                </>
              )}

              {(status === 'declined' || status === 'failed' || status === 'ended') && (
                <>
                  <div className="w-12 h-12 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-400 flex items-center justify-center">
                    {status === 'declined' ? (
                      <ShieldAlert className="w-6 h-6" />
                    ) : (
                      <AlertCircle className="w-6 h-6" />
                    )}
                  </div>
                  <p className="text-sm font-bold text-white">
                    {status === 'declined'
                      ? 'Remote Camera Not Authorized'
                      : status === 'ended'
                      ? 'Remote Camera Session Ended'
                      : 'Remote Camera Unavailable'}
                  </p>
                  <p className="text-xs text-slate-400">{statusMessage}</p>
                  <button
                    type="button"
                    onClick={startSession}
                    className="mt-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Request Again</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer Controls */}
        <div className="shrink-0 px-5 py-4 bg-slate-900 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 z-10">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!isStreaming}
              onClick={() => managerRef.current?.requestRemoteCameraSwitch()}
              className="px-3.5 py-2.5 min-h-[42px] rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Flip Front / Back Camera</span>
            </button>

            <button
              type="button"
              disabled={!isStreaming}
              onClick={handleCaptureSnapshot}
              className="px-3.5 py-2.5 min-h-[42px] rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 disabled:opacity-40 text-indigo-300 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Snapshot</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2.5 min-h-[42px] rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors"
          >
            Stop Session
          </button>
        </div>
      </div>
    </div>
  );
};
