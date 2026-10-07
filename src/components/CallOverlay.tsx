import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  CameraOff,
  Mic,
  MicOff,
  Phone,
  PhoneIncoming,
  PhoneOff,
  RefreshCw,
  Video,
} from 'lucide-react';
import { TranslationDictionary } from '../lib/i18n';
import {
  startIncomingCallRingtone,
  stopIncomingCallRingtone,
} from '../services/ringtoneService';
import { CallRecord, CallStatus, Profile } from '../types/osa';
import { OSAAvatar } from './OSAAvatar';

interface CallOverlayProps {
  callRecord: CallRecord;
  currentUser: Profile;
  peerProfile: Profile | null;
  callStatus: CallStatus;
  errorMessage?: string;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  onAccept: () => void;
  onReject: () => void;
  onEnd: () => void;
  onToggleMute: (muted: boolean) => void;
  onToggleCamera: (enabled: boolean) => void;
  onSwitchCamera: () => void;
  t: TranslationDictionary;
}

export const CallOverlay: React.FC<CallOverlayProps> = ({
  callRecord,
  currentUser,
  peerProfile,
  callStatus,
  errorMessage,
  localStream,
  remoteStream,
  onAccept,
  onReject,
  onEnd,
  onToggleMute,
  onToggleCamera,
  onSwitchCamera,
  t,
}) => {
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(callRecord.call_type === 'video');
  const [secondsElapsed, setSecondsElapsed] = useState(0);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const isIncoming =
    callRecord.receiver_id === currentUser.id &&
    (callStatus === 'calling' || callStatus === 'ringing');

  // Play selected OSA ringtone in a loop while incoming Audio or Video Call is ringing;
  // stop immediately when accepted, rejected, cancelled, timed out, failed, ended, or unmounted.
  useEffect(() => {
    if (isIncoming && callRecord.id) {
      startIncomingCallRingtone(currentUser.id, callRecord.id);
    } else {
      stopIncomingCallRingtone();
    }
    return () => {
      stopIncomingCallRingtone();
    };
  }, [isIncoming, callRecord.id, currentUser.id]);

  const isVideo = callRecord.call_type === 'video';
  const peerName = peerProfile?.full_name || 'OSA User';
  const peerAvatar = peerProfile?.avatar_url || null;

  const hasRemoteVideoTrack = Boolean(
    isVideo &&
      remoteStream &&
      remoteStream.getVideoTracks().some((t) => t.readyState === 'live')
  );

  useEffect(() => {
    const localEl = localVideoRef.current;
    if (localEl && localStream) {
      if (localEl.srcObject !== localStream) {
        localEl.srcObject = localStream;
      }
      localEl.play().catch(() => {});
    }
  }, [localStream, isCameraOn, callStatus, isVideo]);

  useEffect(() => {
    const remoteVidEl = remoteVideoRef.current;
    if (remoteVidEl && remoteStream) {
      if (remoteVidEl.srcObject !== remoteStream) {
        remoteVidEl.srcObject = remoteStream;
      }
      remoteVidEl.play().catch(() => {});
    }
    const remoteAudEl = remoteAudioRef.current;
    if (remoteAudEl && remoteStream) {
      if (remoteAudEl.srcObject !== remoteStream) {
        remoteAudEl.srcObject = remoteStream;
      }
      remoteAudEl.play().catch(() => {});
    }
  }, [remoteStream, callStatus, isVideo]);

  useEffect(() => {
    if (callStatus !== 'connected') {
      setSecondsElapsed(0);
      return;
    }
    const interval = window.setInterval(() => {
      setSecondsElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [callStatus]);

  const formatDuration = (secs: number) => {
    const mins = Math.floor(secs / 60)
      .toString()
      .padStart(2, '0');
    const rem = (secs % 60).toString().padStart(2, '0');
    return `${mins}:${rem}`;
  };

  const handleMuteClick = () => {
    const next = !isMuted;
    setIsMuted(next);
    onToggleMute(next);
  };

  const handleCameraClick = () => {
    const next = !isCameraOn;
    setIsCameraOn(next);
    onToggleCamera(next);
  };

  const statusText = () => {
    if (errorMessage && callStatus === 'failed') return errorMessage;
    switch (callStatus) {
      case 'calling':
        return isIncoming ? t.incomingCall : t.calling;
      case 'ringing':
        return isIncoming ? t.incomingCall : t.ringing;
      case 'accepted':
        return t.connecting;
      case 'connected':
        return `${t.connected} · ${formatDuration(secondsElapsed)}`;
      case 'rejected':
        return t.callRejected;
      case 'missed':
        return t.missedCall;
      case 'ended':
        return t.callEnded;
      case 'failed':
        return errorMessage || 'Call Failed';
      default:
        return callStatus;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-between bg-slate-950 text-white p-6 select-none overflow-hidden">
      {/* Hidden audio element ensures audio plays in both audio and video calls */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {/* Remote Video Canvas — always mounted during video calls so srcObject is bound immediately */}
      {isVideo && (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className={`absolute inset-0 w-full h-full object-cover z-0 transition-opacity duration-300 ${
            callStatus === 'connected' && hasRemoteVideoTrack ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}

      {/* Scrim for readability */}
      <div className="shrink-0 relative z-10 flex items-center justify-between pt-safe">
        <div className="flex items-center gap-2">
          <span className="font-display font-bold text-lg tracking-wider text-white">OSA</span>
          <span className="text-xs text-slate-400">·</span>
          <span className="text-xs font-medium text-slate-300">
            {isVideo ? t.videoCall : t.audioCall}
          </span>
        </div>
        {isVideo && callStatus === 'connected' && (
          <button
            type="button"
            onClick={onSwitchCamera}
            className="w-11 h-11 rounded-full bg-slate-900/70 backdrop-blur-md border border-white/15 flex items-center justify-center text-white hover:bg-slate-800 transition-colors"
            title={t.switchCamera}
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Center Caller / Peer Information */}
      <div className="flex-1 min-h-0 overflow-y-auto relative z-10 flex flex-col items-center justify-center my-auto text-center px-4">
        {(!isVideo || callStatus !== 'connected' || !hasRemoteVideoTrack) && (
          <div className="relative mb-5">
            <div
              className={`rounded-full p-2 ${
                callStatus === 'calling' || callStatus === 'ringing'
                  ? 'animate-pulse bg-blue-500/20 ring-4 ring-blue-500/30'
                  : ''
              }`}
            >
              <OSAAvatar name={peerName} avatarUrl={peerAvatar} size="xl" />
            </div>
          </div>
        )}

        <h2 className="text-2xl font-bold text-white tracking-tight mb-1 drop-shadow">
          {peerName}
        </h2>
        <p className="text-sm font-mono-num text-blue-300 font-medium max-w-sm">
          {statusText()}
        </p>
      </div>

      {/* Picture-in-Picture Local Video Preview */}
      {isVideo && localStream && (
        <div className="relative z-20 self-end w-28 h-40 sm:w-36 sm:h-48 rounded-2xl overflow-hidden border-2 border-white/25 bg-slate-900 shadow-2xl mb-4">
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className={`w-full h-full object-cover ${!isCameraOn ? 'hidden' : ''}`}
          />
          {!isCameraOn && (
            <div className="w-full h-full flex items-center justify-center bg-slate-900 text-slate-500 text-xs">
              <CameraOff className="w-6 h-6" />
            </div>
          )}
        </div>
      )}

      {/* Bottom Call Controls */}
      <div className="shrink-0 relative z-10 pb-safe">
        <div className="max-w-md mx-auto rounded-3xl bg-slate-900/85 backdrop-blur-md border border-white/10 p-4 flex items-center justify-around">
          {isIncoming ? (
            <>
              <button
                type="button"
                onClick={onReject}
                className="flex flex-col items-center gap-1.5 text-xs font-medium text-red-400"
              >
                <span className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-lg shadow-red-600/30 transition-transform active:scale-95">
                  <PhoneOff className="w-6 h-6" />
                </span>
                <span>{t.reject}</span>
              </button>

              <button
                type="button"
                onClick={onAccept}
                className="flex flex-col items-center gap-1.5 text-xs font-medium text-green-400"
              >
                <span className="w-14 h-14 rounded-full bg-green-600 hover:bg-green-700 text-white flex items-center justify-center shadow-lg shadow-green-600/30 transition-transform active:scale-95">
                  {isVideo ? <Video className="w-6 h-6" /> : <PhoneIncoming className="w-6 h-6" />}
                </span>
                <span>{t.accept}</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleMuteClick}
                className="flex flex-col items-center gap-1 text-xs text-slate-300"
              >
                <span
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                    isMuted
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-800 hover:bg-slate-700 text-white'
                  }`}
                >
                  {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </span>
                <span>{isMuted ? t.unmute : t.mute}</span>
              </button>

              {isVideo && (
                <button
                  type="button"
                  onClick={handleCameraClick}
                  className="flex flex-col items-center gap-1 text-xs text-slate-300"
                >
                  <span
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                      !isCameraOn
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-slate-800 hover:bg-slate-700 text-white'
                    }`}
                  >
                    {isCameraOn ? <Camera className="w-5 h-5" /> : <CameraOff className="w-5 h-5" />}
                  </span>
                  <span>{isCameraOn ? t.cameraOff : t.cameraOn}</span>
                </button>
              )}

              <button
                type="button"
                onClick={onEnd}
                className="flex flex-col items-center gap-1 text-xs text-red-400"
              >
                <span className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-lg shadow-red-600/30 transition-transform active:scale-95">
                  <Phone className="w-6 h-6 rotate-[135deg]" />
                </span>
                <span>{t.endCall}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
