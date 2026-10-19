import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  Camera,
  CameraOff,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Move,
  Phone,
  PhoneIncoming,
  PhoneOff,
  PictureInPicture2,
  RefreshCw,
  RotateCcw,
  Settings,
  Video,
  Volume1,
  Volume2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { TranslationDictionary } from '../lib/i18n';
import {
  isNativeCallMuted,
  isNativePipSupported,
  isNativeSpeakerphoneOn,
  requestNativePictureInPicture,
  setNativeCallAudioRoute,
} from '../services/nativeMobileBridge';
import {
  getOpenPermissionSettingsButtonLabel,
  openPermissionSettings,
} from '../services/permissionService';
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
  onToggleSpeakerphone?: (enabled: boolean) => void;
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
  onToggleSpeakerphone,
  onSwitchCamera,
  t,
}) => {
  const isVideo = callRecord.call_type === 'video';
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Call & device state
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(isVideo);
  const [isSpeakerOn, setIsSpeakerOn] = useState(isVideo);
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isInSystemPip, setIsInSystemPip] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Video feed presentation state
  const [isSwapped, setIsSwapped] = useState(false); // When true: local stream is main view, remote stream is floating
  const [zoomLevel, setZoomLevel] = useState<number>(1); // 1x, 1.5x, 2x, 2.5x, 3x
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [hasRemoteVideoFrame, setHasRemoteVideoFrame] = useState(false);
  const [hasLocalVideoFrame, setHasLocalVideoFrame] = useState(false);

  // Draggable position for small floating video preview (offset in pixels)
  const [floatingPos, setFloatingPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const floatingDragRef = useRef<{
    dragging: boolean;
    moved: boolean;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  }>({
    dragging: false,
    moved: false,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
  });

  // Draggable position for in-app minimized floating window
  const [miniWindowPos, setMiniWindowPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const miniDragRef = useRef<{
    dragging: boolean;
    moved: boolean;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  }>({
    dragging: false,
    moved: false,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
  });

  // Pan drag tracking for zoomed main video
  const panDragRef = useRef<{
    panning: boolean;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  }>({
    panning: false,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
  });

  // Persistent Media Element Refs
  const mainVideoRef = useRef<HTMLVideoElement | null>(null);
  const floatingVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const isIncoming =
    callRecord.receiver_id === currentUser.id &&
    (callStatus === 'calling' || callStatus === 'ringing');

  // Sync default speaker/earpiece, mute, and layout state on new call
  useEffect(() => {
    const defaultSpeaker =
      callRecord.call_type === 'video' ? true : isNativeSpeakerphoneOn();
    setIsSpeakerOn(defaultSpeaker);
    setIsMuted(isNativeCallMuted());
    setHasRemoteVideoFrame(false);
    setHasLocalVideoFrame(false);
    setIsMinimized(false);
    setIsSwapped(false);
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  }, [callRecord.id, callRecord.call_type]);

  // Listen for native Fullscreen state changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Listen for Android Native Picture-in-Picture mode transitions
  useEffect(() => {
    const handlePipChanged = (e: Event) => {
      const custom = e as CustomEvent<{ isInPictureInPictureMode: boolean }>;
      const inPip = Boolean(custom.detail?.isInPictureInPictureMode);
      setIsInSystemPip(inPip);
      if (inPip) {
        setIsMinimized(false);
      }
    };
    window.addEventListener('osa:pip-mode-changed', handlePipChanged);
    return () => {
      window.removeEventListener('osa:pip-mode-changed', handlePipChanged);
    };
  }, []);

  // Listen for native mute and speaker notifications
  useEffect(() => {
    const handleNativeMuteChanged = (e: Event) => {
      const custom = e as CustomEvent<{ callId?: string; muted?: boolean; action?: string }>;
      const detail = custom.detail;
      if (!detail) return;
      if (detail.callId && detail.callId !== callRecord.id) return;
      const nextMuted =
        typeof detail.muted === 'boolean' ? detail.muted : detail.action === 'mute';
      setIsMuted(nextMuted);
    };
    const handleNativeSpeakerChanged = (e: Event) => {
      const custom = e as CustomEvent<{ callId?: string; speakerOn?: boolean; action?: string }>;
      const detail = custom.detail;
      if (!detail) return;
      if (detail.callId && detail.callId !== callRecord.id) return;
      const nextSpeaker =
        typeof detail.speakerOn === 'boolean'
          ? detail.speakerOn
          : detail.action === 'speaker_on';
      setIsSpeakerOn(nextSpeaker);
    };
    window.addEventListener('osa:native-call-mute-changed', handleNativeMuteChanged);
    window.addEventListener('osa:native-call-speaker-changed', handleNativeSpeakerChanged);
    return () => {
      window.removeEventListener('osa:native-call-mute-changed', handleNativeMuteChanged);
      window.removeEventListener('osa:native-call-speaker-changed', handleNativeSpeakerChanged);
    };
  }, [callRecord.id]);

  // Manage incoming call ringtone
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

  // Call timer (only increments when active connection established)
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

  // Bind audio continuously without interruption
  useEffect(() => {
    const audioEl = remoteAudioRef.current;
    if (!audioEl || !remoteStream) return;
    if (audioEl.srcObject !== remoteStream) {
      audioEl.srcObject = remoteStream;
    }
    audioEl.play().catch(() => {});
  }, [remoteStream]);

  // Bind video streams to Main and Floating video elements based on current swap state
  // Normal mode: Main = Remote stream, Floating = Local stream
  // Swapped mode: Main = Local stream, Floating = Remote stream
  useEffect(() => {
    const mainVid = mainVideoRef.current;
    const activeMainStream = isSwapped ? localStream : remoteStream;

    if (mainVid) {
      if (mainVid.srcObject !== activeMainStream) {
        mainVid.srcObject = activeMainStream;
      }
      if (activeMainStream) {
        mainVid.play().catch(() => {});
      }
    }

    const floatVid = floatingVideoRef.current;
    const activeFloatStream = isSwapped ? remoteStream : localStream;

    if (floatVid) {
      if (floatVid.srcObject !== activeFloatStream) {
        floatVid.srcObject = activeFloatStream;
      }
      if (activeFloatStream) {
        floatVid.play().catch(() => {});
      }
    }
  }, [isSwapped, localStream, remoteStream, isCameraOn]);

  const peerName = peerProfile?.full_name || callRecord.caller?.full_name || 'OSA User';
  const peerAvatar = peerProfile?.avatar_url || callRecord.caller?.avatar_url || null;

  const hasLiveRemoteVideoTrack = Boolean(
    isVideo &&
      remoteStream &&
      remoteStream.getVideoTracks().some((t) => t.readyState === 'live')
  );

  const isRemoteVideoRenderable =
    isVideo &&
    (callStatus === 'connected' || callStatus === 'accepted') &&
    (hasRemoteVideoFrame || hasLiveRemoteVideoTrack);

  const formatDuration = (secs: number) => {
    const mins = Math.floor(secs / 60)
      .toString()
      .padStart(2, '0');
    const rem = (secs % 60).toString().padStart(2, '0');
    return `${mins}:${rem}`;
  };

  const statusText = () => {
    if (errorMessage && callStatus === 'failed') return errorMessage;
    if (errorMessage && callStatus === 'connected') return errorMessage;
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

  const handleSpeakerClick = () => {
    const next = !isSpeakerOn;
    setIsSpeakerOn(next);
    setNativeCallAudioRoute(next ? 'speaker' : 'earpiece');
    onToggleSpeakerphone?.(next);
  };

  const handleToggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        if (containerRef.current?.requestFullscreen) {
          await containerRef.current.requestFullscreen();
          setIsFullscreen(true);
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
          setIsFullscreen(false);
        }
      }
    } catch {
      setIsFullscreen((prev) => !prev);
    }
  };

  const handleEnterPipOrMinimize = () => {
    if (isVideo && isNativePipSupported()) {
      const entered = requestNativePictureInPicture();
      if (entered) return;
    }
    const vidEl = (mainVideoRef.current || floatingVideoRef.current) as HTMLVideoElement & {
      requestPictureInPicture?: () => Promise<unknown>;
    };
    if (
      isVideo &&
      vidEl &&
      typeof document !== 'undefined' &&
      'pictureInPictureEnabled' in document &&
      (document as Document & { pictureInPictureEnabled?: boolean }).pictureInPictureEnabled &&
      typeof vidEl.requestPictureInPicture === 'function' &&
      vidEl.readyState >= 2
    ) {
      vidEl.requestPictureInPicture().catch(() => {
        setIsMinimized(true);
      });
      return;
    }
    setIsMinimized(true);
  };

  const handleSwapFeeds = () => {
    setIsSwapped((prev) => !prev);
    // Reset zoom when swapping feeds to avoid disorienting zoom states
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  };

  // Zoom controls
  const handleZoomIn = () => {
    setZoomLevel((prev) => Math.min(3, Math.round((prev + 0.5) * 10) / 10));
  };

  const handleZoomOut = () => {
    setZoomLevel((prev) => {
      const next = Math.max(1, Math.round((prev - 0.5) * 10) / 10);
      if (next === 1) setPanOffset({ x: 0, y: 0 });
      return next;
    });
  };

  const handleResetZoom = () => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  };

  const handleMainDoubleClick = () => {
    if (zoomLevel > 1) {
      handleResetZoom();
    } else {
      setZoomLevel(2);
    }
  };

  // Main video pan handlers (when zoom > 1)
  const handleMainPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (zoomLevel <= 1) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    panDragRef.current = {
      panning: true,
      startX: e.clientX,
      startY: e.clientY,
      origX: panOffset.x,
      origY: panOffset.y,
    };
    setIsPanning(true);
  };

  const handleMainPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!panDragRef.current.panning || zoomLevel <= 1) return;
    const dx = e.clientX - panDragRef.current.startX;
    const dy = e.clientY - panDragRef.current.startY;
    const maxBound = (zoomLevel - 1) * 180;
    const nextX = Math.max(-maxBound, Math.min(maxBound, panDragRef.current.origX + dx));
    const nextY = Math.max(-maxBound, Math.min(maxBound, panDragRef.current.origY + dy));
    setPanOffset({ x: nextX, y: nextY });
  };

  const handleMainPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!panDragRef.current.panning) return;
    panDragRef.current.panning = false;
    setIsPanning(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
  };

  // Draggable floating preview handlers (tap to swap feeds, drag to reposition)
  const handleFloatingPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    floatingDragRef.current = {
      dragging: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      origX: floatingPos.x,
      origY: floatingPos.y,
    };
  };

  const handleFloatingPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!floatingDragRef.current.dragging) return;
    e.stopPropagation();
    const dx = e.clientX - floatingDragRef.current.startX;
    const dy = e.clientY - floatingDragRef.current.startY;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
      floatingDragRef.current.moved = true;
    }
    const maxW = typeof window !== 'undefined' ? window.innerWidth - 130 : 300;
    const maxH = typeof window !== 'undefined' ? window.innerHeight - 220 : 500;
    const nextX = Math.max(-maxW, Math.min(20, floatingDragRef.current.origX + dx));
    const nextY = Math.max(-60, Math.min(maxH, floatingDragRef.current.origY + dy));
    setFloatingPos({ x: nextX, y: nextY });
  };

  const handleFloatingPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!floatingDragRef.current.dragging) return;
    e.stopPropagation();
    const wasMoved = floatingDragRef.current.moved;
    floatingDragRef.current.dragging = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
    if (!wasMoved) {
      // Tap without dragging triggers feed swap!
      handleSwapFeeds();
    }
  };

  // Pointer drag handlers for minimized in-app floating window
  const handleMiniPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    miniDragRef.current = {
      dragging: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      origX: miniWindowPos.x,
      origY: miniWindowPos.y,
    };
  };

  const handleMiniPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!miniDragRef.current.dragging) return;
    const dx = e.clientX - miniDragRef.current.startX;
    const dy = e.clientY - miniDragRef.current.startY;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
      miniDragRef.current.moved = true;
    }
    const maxW = typeof window !== 'undefined' ? window.innerWidth - 190 : 300;
    const maxH = typeof window !== 'undefined' ? window.innerHeight - 240 : 500;
    const nextX = Math.max(-maxW, Math.min(12, miniDragRef.current.origX + dx));
    const nextY = Math.max(-maxH, Math.min(12, miniDragRef.current.origY + dy));
    setMiniWindowPos({ x: nextX, y: nextY });
  };

  const handleMiniPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!miniDragRef.current.dragging) return;
    const wasMoved = miniDragRef.current.moved;
    miniDragRef.current.dragging = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
    if (!wasMoved) {
      setIsMinimized(false);
    }
  };

  const canMinimize =
    !isIncoming &&
    (callStatus === 'calling' ||
      callStatus === 'ringing' ||
      callStatus === 'accepted' ||
      callStatus === 'connected');

  // Determine whether main video should be visually displayed
  const isMainVideoVisible = isVideo && (isSwapped ? isCameraOn && Boolean(localStream) : isRemoteVideoRenderable);
  // Determine whether floating video should be displayed
  const isFloatingVideoVisible = isVideo && (isSwapped ? isRemoteVideoRenderable : isCameraOn && Boolean(localStream));

  // Render Movable In-App Floating Mini Call Window when minimized
  if (isMinimized && !isInSystemPip) {
    return (
      <div
        onPointerDown={handleMiniPointerDown}
        onPointerMove={handleMiniPointerMove}
        onPointerUp={handleMiniPointerUp}
        style={{
          transform: `translate3d(${miniWindowPos.x}px, ${miniWindowPos.y}px, 0)`,
          touchAction: 'none',
        }}
        className={`fixed bottom-20 right-4 z-50 rounded-3xl overflow-hidden border-2 border-white/20 bg-slate-950 text-white shadow-2xl select-none cursor-grab active:cursor-grabbing ${
          isVideo ? 'w-44 h-64 sm:w-52 sm:h-72' : 'w-64 p-3.5'
        }`}
      >
        <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

        {isVideo ? (
          <div className="relative w-full h-full flex flex-col justify-between bg-slate-900 overflow-hidden">
            <video
              ref={mainVideoRef}
              autoPlay
              playsInline
              onLoadedData={() => setHasRemoteVideoFrame(true)}
              onPlaying={() => setHasRemoteVideoFrame(true)}
              className={`absolute inset-0 w-full h-full object-cover ${
                isMainVideoVisible ? 'opacity-100' : 'opacity-0'
              }`}
            />

            {!isMainVideoVisible && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center bg-slate-900">
                <OSAAvatar name={peerName} avatarUrl={peerAvatar} size="md" />
                <p className="mt-2 text-xs font-bold text-white truncate max-w-full">{peerName}</p>
                <p className="text-[11px] text-blue-300 font-mono-num">
                  {callStatus === 'connected' ? formatDuration(secondsElapsed) : t.connecting}
                </p>
              </div>
            )}

            {/* Top bar inside mini video window */}
            <div className="relative z-10 flex items-center justify-between p-2 bg-gradient-to-b from-black/75 to-transparent">
              <span className="text-[11px] font-mono-num font-semibold text-emerald-400 px-1.5 py-0.5 rounded bg-black/50">
                {callStatus === 'connected' ? formatDuration(secondsElapsed) : t.connecting}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMinimized(false);
                }}
                className="w-7 h-7 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center"
                title="Expand to full screen"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Mini local/remote secondary preview */}
            {isFloatingVideoVisible && (
              <div className="relative z-10 self-end mr-2 w-12 h-16 rounded-lg overflow-hidden border border-white/30 bg-slate-950 shadow-md">
                <video
                  ref={floatingVideoRef}
                  autoPlay
                  muted={!isSwapped}
                  playsInline
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            {/* Bottom controls inside mini video window */}
            <div className="relative z-10 flex items-center justify-around p-2 bg-gradient-to-t from-black/85 to-transparent">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleMuteClick();
                }}
                className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  isMuted ? 'bg-amber-500 text-slate-950' : 'bg-white/20 text-white'
                }`}
              >
                {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEnd();
                }}
                className="w-8 h-8 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center"
              >
                <Phone className="w-4 h-4 rotate-[135deg]" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <OSAAvatar name={peerName} avatarUrl={peerAvatar} size="sm" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">{peerName}</p>
                  <p className="text-[11px] font-mono-num text-emerald-400">
                    {callStatus === 'connected' ? formatDuration(secondsElapsed) : statusText()}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMinimized(false);
                }}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center shrink-0"
                title="Restore call to full screen"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center justify-around pt-1 border-t border-white/10">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleMuteClick();
                }}
                className={`w-9 h-9 rounded-full flex items-center justify-center ${
                  isMuted ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-white'
                }`}
                title={isMuted ? t.unmute : t.mute}
              >
                {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleSpeakerClick();
                }}
                className={`w-9 h-9 rounded-full flex items-center justify-center ${
                  isSpeakerOn ? 'bg-blue-600 text-white' : 'bg-slate-800 text-white'
                }`}
                title={isSpeakerOn ? 'Speakerphone ON' : 'Earpiece'}
              >
                {isSpeakerOn ? <Volume2 className="w-4 h-4" /> : <Volume1 className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEnd();
                }}
                className="w-9 h-9 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center"
                title={t.endCall}
              >
                <Phone className="w-4 h-4 rotate-[135deg]" />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex flex-col justify-between bg-slate-950 text-white p-4 sm:p-6 select-none overflow-hidden touch-none"
    >
      {/* Hidden audio element ensures audio always plays clearly */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {/* Main Video Canvas with Zoom, Pan & Feed Swap */}
      {isVideo && (
        <div
          onDoubleClick={handleMainDoubleClick}
          onPointerDown={handleMainPointerDown}
          onPointerMove={handleMainPointerMove}
          onPointerUp={handleMainPointerUp}
          className={`absolute inset-0 w-full h-full overflow-hidden ${
            zoomLevel > 1 ? 'cursor-grab active:cursor-grabbing' : ''
          }`}
        >
          <video
            ref={mainVideoRef}
            autoPlay
            muted={isSwapped} // Muted if showing local camera to prevent audio feedback
            playsInline
            onLoadedData={() => {
              if (isSwapped) setHasLocalVideoFrame(true);
              else setHasRemoteVideoFrame(true);
            }}
            onPlaying={() => {
              if (isSwapped) setHasLocalVideoFrame(true);
              else setHasRemoteVideoFrame(true);
            }}
            onResize={() => {
              if (isSwapped) setHasLocalVideoFrame(true);
              else setHasRemoteVideoFrame(true);
            }}
            onTimeUpdate={() => {
              if (isSwapped && !hasLocalVideoFrame) setHasLocalVideoFrame(true);
              if (!isSwapped && !hasRemoteVideoFrame) setHasRemoteVideoFrame(true);
            }}
            style={{
              transform: `scale(${zoomLevel}) translate3d(${panOffset.x / zoomLevel}px, ${panOffset.y / zoomLevel}px, 0)`,
              transformOrigin: 'center center',
              transition: isPanning ? 'none' : 'transform 0.2s cubic-bezier(0.2, 0, 0, 1)',
            }}
            className={`w-full h-full object-cover transition-opacity duration-200 pointer-events-none ${
              isMainVideoVisible ? 'opacity-100' : 'opacity-0'
            }`}
          />
        </div>
      )}

      {/* Gradient overlays to keep top and bottom controls crisp when video is playing */}
      {isMainVideoVisible && !isInSystemPip && (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/80 via-black/40 to-transparent z-[1]" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/90 via-black/50 to-transparent z-[1]" />
        </>
      )}

      {/* Top Header Bar */}
      {!isInSystemPip && (
        <div className="shrink-0 relative z-20 flex items-center justify-between pt-safe">
          <div className="flex items-center gap-2.5 bg-slate-900/75 backdrop-blur-md px-3.5 py-1.5 rounded-2xl border border-white/10 shadow-lg">
            <span className="font-display font-bold text-base tracking-wider text-white">OSA</span>
            <span className="text-xs text-slate-400">·</span>
            {isMainVideoVisible ? (
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white truncate max-w-[130px] sm:max-w-[220px]">
                  {isSwapped ? t.profile || 'You' : peerName}
                </span>
                <span className="text-xs font-mono-num text-emerald-400 font-semibold">
                  {callStatus === 'connected' ? formatDuration(secondsElapsed) : t.connecting}
                </span>
                {isSwapped && (
                  <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-blue-500/30 text-blue-300">
                    Self View
                  </span>
                )}
              </div>
            ) : (
              <span className="text-xs font-medium text-slate-300">
                {isVideo ? t.videoCall : t.audioCall}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Swap Feeds button (Local <-> Remote) */}
            {isVideo && isRemoteVideoRenderable && (
              <button
                type="button"
                onClick={handleSwapFeeds}
                className={`w-11 h-11 rounded-full backdrop-blur-md border border-white/15 flex items-center justify-center transition-colors ${
                  isSwapped
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                    : 'bg-slate-900/70 text-white hover:bg-slate-800'
                }`}
                title="Swap Main & Floating Video Previews"
              >
                <ArrowLeftRight className="w-5 h-5" />
              </button>
            )}

            {/* Independent Fullscreen Toggle */}
            <button
              type="button"
              onClick={handleToggleFullscreen}
              className={`w-11 h-11 rounded-full backdrop-blur-md border border-white/15 flex items-center justify-center transition-colors ${
                isFullscreen
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-900/70 text-white hover:bg-slate-800'
              }`}
              title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>

            {/* In-App Minimize button */}
            {canMinimize && (
              <button
                type="button"
                onClick={() => setIsMinimized(true)}
                className="w-11 h-11 rounded-full bg-slate-900/70 backdrop-blur-md border border-white/15 flex items-center justify-center text-white hover:bg-slate-800 transition-colors"
                title="Minimize call to floating window"
              >
                <Minimize2 className="w-5 h-5" />
              </button>
            )}

            {/* System Picture-in-Picture */}
            {isVideo && canMinimize && (
              <button
                type="button"
                onClick={handleEnterPipOrMinimize}
                className="w-11 h-11 rounded-full bg-slate-900/70 backdrop-blur-md border border-white/15 flex items-center justify-center text-white hover:bg-slate-800 transition-colors"
                title="Floating window (Picture-in-Picture)"
              >
                <PictureInPicture2 className="w-5 h-5" />
              </button>
            )}

            {/* Switch Camera (Front/Back) */}
            {isVideo && !isIncoming && (
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
        </div>
      )}

      {/* Floating Zoom & Pan Toolbar on Left Side (Visible when video active) */}
      {isVideo && isMainVideoVisible && !isInSystemPip && (
        <div className="absolute left-4 top-24 sm:top-28 z-20 flex flex-col items-center gap-2 bg-slate-900/75 backdrop-blur-md p-1.5 rounded-2xl border border-white/15 shadow-xl">
          <button
            type="button"
            onClick={handleZoomIn}
            disabled={zoomLevel >= 3}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white hover:bg-white/10 active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <span className="text-[11px] font-mono-num font-bold text-blue-300 px-1 select-none">
            {zoomLevel}x
          </span>

          <button
            type="button"
            onClick={handleZoomOut}
            disabled={zoomLevel <= 1}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white hover:bg-white/10 active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          {zoomLevel > 1 && (
            <button
              type="button"
              onClick={handleResetZoom}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-amber-400 hover:bg-white/10 active:scale-95 transition-colors border-t border-white/10"
              title="Reset Zoom & Pan"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Center Peer Info & Status (Shown when main video frame is not yet available) */}
      <div className="flex-1 min-h-0 overflow-y-auto relative z-10 flex flex-col items-center justify-center my-auto text-center px-4">
        {!isMainVideoVisible && (
          <>
            <div className="relative mb-5">
              <div
                className={`rounded-full p-2 ${
                  callStatus === 'calling' || callStatus === 'ringing' || callStatus === 'accepted'
                    ? 'animate-pulse bg-blue-500/20 ring-4 ring-blue-500/30'
                    : ''
                }`}
              >
                <OSAAvatar
                  name={peerName}
                  avatarUrl={peerAvatar}
                  size={isInSystemPip ? 'md' : 'xl'}
                />
              </div>
            </div>

            <h2
              className={`${
                isInSystemPip ? 'text-sm' : 'text-2xl sm:text-3xl'
              } font-bold text-white tracking-tight mb-1 drop-shadow`}
            >
              {peerName}
            </h2>
            <p className="text-sm font-mono-num text-blue-300 font-medium max-w-sm">
              {statusText()}
            </p>
            {!isVideo && callStatus === 'connected' && !isInSystemPip && (
              <p className="mt-2 text-xs text-slate-400">
                {isSpeakerOn ? 'Speakerphone ON' : 'Earpiece active — hold phone to ear or tap Speaker'}
              </p>
            )}
          </>
        )}

        {callStatus === 'failed' &&
          errorMessage &&
          /Camera|Microphone/i.test(errorMessage) && (
            <button
              type="button"
              onClick={() =>
                openPermissionSettings(
                  /Camera/i.test(errorMessage) ? 'camera' : 'microphone'
                )
              }
              className="mt-4 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center gap-2 shadow-lg"
            >
              <Settings className="w-4 h-4" />
              <span>
                {getOpenPermissionSettingsButtonLabel(
                  /Camera/i.test(errorMessage) ? 'camera' : 'microphone'
                )}
              </span>
            </button>
          )}
      </div>

      {/* Draggable Picture-in-Picture Floating Video Preview */}
      {isVideo && (
        <div
          onPointerDown={handleFloatingPointerDown}
          onPointerMove={handleFloatingPointerMove}
          onPointerUp={handleFloatingPointerUp}
          style={{
            transform: isInSystemPip
              ? undefined
              : `translate3d(${floatingPos.x}px, ${floatingPos.y}px, 0)`,
            touchAction: 'none',
          }}
          className={`absolute z-30 rounded-2xl overflow-hidden border-2 border-white/30 bg-slate-900 shadow-2xl cursor-grab active:cursor-grabbing transition-[border-color] hover:border-blue-400 ${
            isInSystemPip
              ? 'bottom-2 right-2 w-14 h-20 rounded-xl'
              : 'top-20 right-4 sm:top-24 sm:right-6 w-28 h-40 sm:w-36 sm:h-52'
          }`}
          title="Tap to switch feeds, drag to reposition preview"
        >
          <video
            ref={floatingVideoRef}
            autoPlay
            muted={!isSwapped} // Muted if local camera
            playsInline
            className={`w-full h-full object-cover pointer-events-none ${
              !isFloatingVideoVisible ? 'hidden' : ''
            }`}
          />

          {!isFloatingVideoVisible && (
            <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-slate-500 text-xs p-2 text-center select-none">
              <CameraOff className="w-6 h-6 mb-1 text-slate-400" />
              <span className="text-[10px]">{isSwapped ? peerName : 'Camera Off'}</span>
            </div>
          )}

          {!isInSystemPip && (
            <div className="pointer-events-none absolute top-1.5 right-1.5 flex items-center gap-1">
              <div className="w-5 h-5 rounded-full bg-black/60 flex items-center justify-center text-white/90">
                <Move className="w-3 h-3" />
              </div>
            </div>
          )}

          {/* Label indicating which stream is in the floating preview */}
          <div className="pointer-events-none absolute bottom-1 inset-x-1 flex justify-center">
            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-black/65 text-white/90 truncate max-w-full backdrop-blur-xs">
              {isSwapped ? peerName : 'You (Tap to swap)'}
            </span>
          </div>
        </div>
      )}

      {/* Bottom Call Controls */}
      {!isInSystemPip && (
        <div className="shrink-0 relative z-20 pb-safe">
          <div className="max-w-md mx-auto rounded-3xl bg-slate-900/85 backdrop-blur-md border border-white/10 p-4 flex items-center justify-around shadow-2xl">
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
                    {isVideo ? (
                      <Video className="w-6 h-6" />
                    ) : (
                      <PhoneIncoming className="w-6 h-6" />
                    )}
                  </span>
                  <span>{t.accept}</span>
                </button>
              </>
            ) : (
              <>
                {/* Microphone Mute/Unmute */}
                <button
                  type="button"
                  onClick={handleMuteClick}
                  className="flex flex-col items-center gap-1 text-xs text-slate-300"
                >
                  <span
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                      isMuted
                        ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30'
                        : 'bg-slate-800 hover:bg-slate-700 text-white'
                    }`}
                  >
                    {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </span>
                  <span>{isMuted ? t.unmute : t.mute}</span>
                </button>

                {/* Speakerphone Toggle */}
                <button
                  type="button"
                  onClick={handleSpeakerClick}
                  className="flex flex-col items-center gap-1 text-xs text-slate-300"
                >
                  <span
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                      isSpeakerOn
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                        : 'bg-slate-800 hover:bg-slate-700 text-white'
                    }`}
                  >
                    {isSpeakerOn ? (
                      <Volume2 className="w-5 h-5" />
                    ) : (
                      <Volume1 className="w-5 h-5" />
                    )}
                  </span>
                  <span>{isSpeakerOn ? 'Speaker' : 'Earpiece'}</span>
                </button>

                {/* Video controls */}
                {isVideo && (
                  <>
                    {/* Camera On/Off */}
                    <button
                      type="button"
                      onClick={handleCameraClick}
                      className="flex flex-col items-center gap-1 text-xs text-slate-300"
                    >
                      <span
                        className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                          !isCameraOn
                            ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30'
                            : 'bg-slate-800 hover:bg-slate-700 text-white'
                        }`}
                      >
                        {isCameraOn ? (
                          <Camera className="w-5 h-5" />
                        ) : (
                          <CameraOff className="w-5 h-5" />
                        )}
                      </span>
                      <span>{isCameraOn ? t.cameraOff : t.cameraOn}</span>
                    </button>

                    {/* Switch Front/Back Camera */}
                    <button
                      type="button"
                      onClick={onSwitchCamera}
                      className="flex flex-col items-center gap-1 text-xs text-slate-300"
                    >
                      <span className="w-12 h-12 rounded-full bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center transition-colors">
                        <RefreshCw className="w-5 h-5" />
                      </span>
                      <span>{t.switchCamera}</span>
                    </button>
                  </>
                )}

                {/* End Call */}
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
      )}
    </div>
  );
};
