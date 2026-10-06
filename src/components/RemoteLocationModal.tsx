import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  Compass,
  Copy,
  ExternalLink,
  Loader2,
  MapPin,
  Navigation,
  RefreshCw,
  Send,
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { createNotification } from '../services/osaService';
import {
  ChatLocationData,
  getCurrentDeviceLocation,
  LiveLocationPayload,
  requestLocationPermission,
} from '../services/permissionService';
import { Profile } from '../types/osa';
import { OSAAvatar } from './OSAAvatar';

export const REMOTE_LOC_REQ_PREFIX = '[OSA_LOC_REQ]';
export const REMOTE_LOC_RES_PREFIX = '[OSA_LOC_RES]';
export const REMOTE_LOC_ERR_PREFIX = '[OSA_LOC_ERR]';

interface RemoteLocationModalProps {
  isOpen: boolean;
  currentUser: Profile;
  peerUser: Profile;
  chatId?: string | null;
  initialLocationData?: ChatLocationData | null;
  onClose: () => void;
  onSendLocationToChat?: (locationData: ChatLocationData) => Promise<void>;
}

export const RemoteLocationModal: React.FC<RemoteLocationModalProps> = ({
  isOpen,
  currentUser,
  peerUser,
  chatId,
  initialLocationData,
  onClose,
  onSendLocationToChat,
}) => {
  const [activeMode, setActiveMode] = useState<'remote' | 'my_location'>('remote');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [sendingToChat, setSendingToChat] = useState(false);

  const [remoteFix, setRemoteFix] = useState<LiveLocationPayload | null>(null);
  const [myFix, setMyFix] = useState<LiveLocationPayload | null>(null);
  const requestIdRef = useRef<string>('');
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (initialLocationData) {
      setRemoteFix({
        requestId: 'chat-card',
        senderId: peerUser.id,
        senderName: peerUser.full_name,
        receiverId: currentUser.id,
        latitude: initialLocationData.latitude,
        longitude: initialLocationData.longitude,
        accuracy: initialLocationData.accuracy || 15,
        altitude: null,
        heading: null,
        speed: null,
        timestamp: initialLocationData.timestamp,
      });
      setLoading(false);
      setError('');
      return;
    }

    // Automatically request peer's remote location when opened
    triggerRemoteLocationRequest();

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [isOpen, peerUser.id, initialLocationData]);

  // Listen for remote location response via both Realtime broadcast and notifications table
  useEffect(() => {
    if (!isOpen) return;

    const channel = supabase
      .channel(`osa-remote-loc-rx-${currentUser.id}`)
      .on('broadcast', { event: 'location_response' }, ({ payload }) => {
        const data = payload as LiveLocationPayload;
        if (data && data.senderId === peerUser.id) {
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
          setRemoteFix(data);
          setLoading(false);
          setError('');
        }
      })
      .on('broadcast', { event: 'location_error' }, ({ payload }) => {
        if (payload && payload.senderId === peerUser.id) {
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
          setLoading(false);
          setError(
            (payload.message as string) ||
              `${peerUser.full_name}'s device could not provide GPS coordinates.`
          );
        }
      })
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${currentUser.id}`,
        },
        (payload) => {
          const item = payload.new as { body?: string; actor_id?: string };
          if (!item?.body || item.actor_id !== peerUser.id) return;

          if (item.body.startsWith(REMOTE_LOC_RES_PREFIX)) {
            try {
              const parsed = JSON.parse(
                item.body.slice(REMOTE_LOC_RES_PREFIX.length)
              ) as LiveLocationPayload;
              if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
              }
              setRemoteFix(parsed);
              setLoading(false);
              setError('');
            } catch {
              // Ignore malformed payload
            }
          } else if (item.body.startsWith(REMOTE_LOC_ERR_PREFIX)) {
            try {
              const parsed = JSON.parse(item.body.slice(REMOTE_LOC_ERR_PREFIX.length)) as {
                message?: string;
              };
              if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
              }
              setLoading(false);
              setError(
                parsed.message || `${peerUser.full_name} declined or blocked location access.`
              );
            } catch {
              // Ignore
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOpen, currentUser.id, peerUser.id, peerUser.full_name]);

  const triggerRemoteLocationRequest = async () => {
    setActiveMode('remote');
    setLoading(true);
    setError('');

    const reqId = `loc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    requestIdRef.current = reqId;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    try {
      const reqPayload = {
        requestId: reqId,
        requesterId: currentUser.id,
        requesterName: currentUser.full_name,
        targetId: peerUser.id,
        chatId: chatId || null,
        timestamp: new Date().toISOString(),
      };

      // 1. Send via database notification (persisted & triggers postgres_changes on peer)
      await createNotification({
        userId: peerUser.id,
        actorId: currentUser.id,
        type: 'system',
        title: `Remote Location Request from ${currentUser.full_name}`,
        body: `${REMOTE_LOC_REQ_PREFIX}${JSON.stringify(reqPayload)}`,
        chatId: chatId || null,
      });

      // 2. Also broadcast on peer's realtime channel for instant zero-latency delivery
      const txChannel = supabase.channel(`osa-remote-loc-tx-${peerUser.id}`);
      txChannel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await txChannel.send({
            type: 'broadcast',
            event: 'location_request',
            payload: reqPayload,
          });
          setTimeout(() => {
            supabase.removeChannel(txChannel);
          }, 1500);
        }
      });

      timeoutRef.current = window.setTimeout(() => {
        setLoading(false);
        setError(
          `No live GPS response received from ${peerUser.full_name} within 20 seconds. Ensure ${peerUser.full_name} is online on OSA and has allowed Location permission.`
        );
      }, 20000);
    } catch (err) {
      setLoading(false);
      setError(
        err instanceof Error ? err.message : 'Failed to send remote location request.'
      );
    }
  };

  const fetchMyCurrentLocation = async () => {
    setActiveMode('my_location');
    setLoading(true);
    setError('');
    try {
      await requestLocationPermission(currentUser.id);
      const pos = await getCurrentDeviceLocation();
      setMyFix({
        requestId: `self_${Date.now()}`,
        senderId: currentUser.id,
        senderName: currentUser.full_name,
        receiverId: peerUser.id,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: Math.round(pos.coords.accuracy || 10),
        altitude: pos.coords.altitude,
        heading: pos.coords.heading,
        speed: pos.coords.speed,
        timestamp: new Date(pos.timestamp).toISOString(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to get your current GPS location.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const displayedFix = activeMode === 'remote' ? remoteFix : myFix;

  const handleCopyCoords = async () => {
    if (!displayedFix) return;
    const text = `${displayedFix.latitude.toFixed(6)}, ${displayedFix.longitude.toFixed(6)}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore
    }
  };

  const handleSendToChat = async () => {
    if (!displayedFix || !onSendLocationToChat) return;
    setSendingToChat(true);
    try {
      await onSendLocationToChat({
        latitude: displayedFix.latitude,
        longitude: displayedFix.longitude,
        accuracy: displayedFix.accuracy,
        label:
          activeMode === 'remote'
            ? `${peerUser.full_name}'s Live GPS Location`
            : `${currentUser.full_name}'s Live GPS Location`,
        timestamp: displayedFix.timestamp,
        isRemoteCapture: activeMode === 'remote',
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send location to chat.');
    } finally {
      setSendingToChat(false);
    }
  };

  const getOsmEmbedUrl = (lat: number, lng: number) => {
    const delta = 0.006;
    const bbox = `${(lng - delta).toFixed(6)}%2C${(lat - delta).toFixed(6)}%2C${(
      lng + delta
    ).toFixed(6)}%2C${(lat + delta).toFixed(6)}`;
    return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat.toFixed(
      6
    )}%2C${lng.toFixed(6)}`;
  };

  const getGoogleMapsUrl = (lat: number, lng: number) =>
    `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
      <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
              <MapPin className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold truncate">
                OSA Live &amp; Remote Location
              </h3>
              <p className="text-[11px] text-slate-400 truncate">
                Peer: {peerUser.full_name}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="p-3 bg-slate-100 dark:bg-slate-800/70 flex items-center gap-2 border-b border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={triggerRemoteLocationRequest}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
              activeMode === 'remote'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-800'
            }`}
          >
            <Compass className="w-4 h-4" />
            <span>{peerUser.full_name.split(' ')[0]}&apos;s Remote Location</span>
          </button>

          <button
            type="button"
            onClick={fetchMyCurrentLocation}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
              activeMode === 'my_location'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-800'
            }`}
          >
            <Navigation className="w-4 h-4" />
            <span>My GPS Location</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {loading && (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
              <div className="relative">
                <OSAAvatar
                  name={activeMode === 'remote' ? peerUser.full_name : currentUser.full_name}
                  avatarUrl={
                    activeMode === 'remote' ? peerUser.avatar_url : currentUser.avatar_url
                  }
                  size="lg"
                />
                <span className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-md">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </span>
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {activeMode === 'remote'
                    ? `Requesting real-time GPS from ${peerUser.full_name}...`
                    : 'Acquiring high-accuracy GPS fix from your device...'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs">
                  {activeMode === 'remote'
                    ? 'Connecting via OSA Realtime signaling to retrieve live device coordinates.'
                    : 'Using native browser/OS Geolocation API.'}
                </p>
              </div>
            </div>
          )}

          {!loading && error && (
            <div className="rounded-2xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 p-4 space-y-3">
              <div className="flex items-start gap-2.5 text-xs text-red-700 dark:text-red-300">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
                <span>{error}</span>
              </div>
              <button
                type="button"
                onClick={
                  activeMode === 'remote' ? triggerRemoteLocationRequest : fetchMyCurrentLocation
                }
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry GPS Request</span>
              </button>
            </div>
          )}

          {!loading && displayedFix && (
            <div className="space-y-4">
              {/* Interactive Map Preview */}
              <div className="relative w-full h-60 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800">
                <iframe
                  title="OSA Live GPS Map"
                  src={getOsmEmbedUrl(displayedFix.latitude, displayedFix.longitude)}
                  className="w-full h-full border-0"
                  loading="lazy"
                />
                <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-slate-900/85 backdrop-blur-xs text-white text-[11px] font-semibold flex items-center gap-1.5 shadow-md">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span>
                    {activeMode === 'remote'
                      ? `${peerUser.full_name} · Live GPS`
                      : 'Your Device · Live GPS'}
                  </span>
                </div>
              </div>

              {/* Coordinates & Telemetry */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-800 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Coordinates (Lat, Lng)
                  </p>
                  <p className="text-xs font-mono-num font-bold text-slate-900 dark:text-white mt-1">
                    {displayedFix.latitude.toFixed(6)}, {displayedFix.longitude.toFixed(6)}
                  </p>
                </div>

                <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-800 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    GPS Accuracy &amp; Time
                  </p>
                  <p className="text-xs font-mono-num font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                    ±{Math.round(displayedFix.accuracy || 10)}m &middot;{' '}
                    {new Date(displayedFix.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={
                    activeMode === 'remote' ? triggerRemoteLocationRequest : fetchMyCurrentLocation
                  }
                  className="px-3.5 py-2.5 min-h-[42px] rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Refresh GPS</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyCoords}
                  className="px-3.5 py-2.5 min-h-[42px] rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Coords</span>
                    </>
                  )}
                </button>

                <a
                  href={getGoogleMapsUrl(displayedFix.latitude, displayedFix.longitude)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-2.5 min-h-[42px] rounded-xl bg-blue-600/10 hover:bg-blue-600/20 text-blue-600 dark:text-blue-400 text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Google Maps</span>
                </a>

                {onSendLocationToChat && (
                  <button
                    type="button"
                    disabled={sendingToChat}
                    onClick={handleSendToChat}
                    className="ml-auto px-4 py-2.5 min-h-[42px] rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-md shadow-emerald-600/20"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{sendingToChat ? 'Sending...' : 'Send to Chat'}</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
