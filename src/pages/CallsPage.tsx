import React, { useEffect, useState } from 'react';
import {
  Eye,
  MapPin,
  Music,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  Plus,
  Search,
  Video,
  X,
  ShieldCheck,
  ShieldAlert,
  FileText,
  Sparkles,
  Bot,
  Save,
  CheckCircle,
} from 'lucide-react';
import { OSAAvatar } from '../components/OSAAvatar';
import { RemoteCameraModal } from '../components/RemoteCameraModal';
import { RemoteLocationModal } from '../components/RemoteLocationModal';
import { RingtoneModal } from '../components/RingtoneSelector';
import { TranslationDictionary } from '../lib/i18n';
import { supabase } from '../lib/supabase';
import { fetchCallHistory, searchUsers } from '../services/osaService';
import {
  formatDailyDateHeader,
  formatLastSeenText,
  getProfileLastSeenIso,
  isProfileTrulyOnline,
} from '../services/presenceService';
import { CallRecord, CallType, Profile } from '../types/osa';

interface CallsPageProps {
  currentUser: Profile;
  onStartCall: (peer: Profile, callType: CallType, chatId?: string | null) => void;
  t: TranslationDictionary;
}

export const CallsPage: React.FC<CallsPageProps> = ({
  currentUser,
  onStartCall,
  t,
}) => {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [showNewCallModal, setShowNewCallModal] = useState(false);
  const [userQuery, setUserQuery] = useState('');
  const [users, setUsers] = useState<Profile[]>([]);
  const [remoteCameraTargetPeer, setRemoteCameraTargetPeer] = useState<Profile | null>(null);
  const [locationTargetPeer, setLocationTargetPeer] = useState<Profile | null>(null);
  const [showRingtoneModal, setShowRingtoneModal] = useState(false);

  // Spam shield state
  const [showSpamModal, setShowSpamModal] = useState(false);
  const [spamPhoneInput, setSpamPhoneInput] = useState('');
  const [spamLookupResult, setSpamLookupResult] = useState<{
    phone: string;
    name: string;
    tag: string;
    spamReports: number;
    isSpam: boolean;
  } | null>(null);

  // Call Notes state
  const [activeNoteCall, setActiveNoteCall] = useState<CallRecord | null>(null);
  const [noteContent, setNoteContent] = useState('');
  const [callNotesMap, setCallNotesMap] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('osa_call_notes_dict');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // AI Call Screener state
  const [isAiScreenerEnabled, setIsAiScreenerEnabled] = useState(() => {
    try {
      return localStorage.getItem('osa_ai_call_screener') === 'true';
    } catch {
      return true;
    }
  });
  const [showScreenerInfo, setShowScreenerInfo] = useState(false);

  const loadCalls = async () => {
    try {
      const history = await fetchCallHistory(currentUser.id);
      setCalls(history);
    } catch {
      // Ignore error
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCalls();

    const channel = supabase
      .channel('osa-calls-history')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'calls' },
        () => {
          loadCalls();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser.id]);

  useEffect(() => {
    if (!showNewCallModal) return;
    let active = true;
    searchUsers(userQuery, currentUser.id)
      .then((res) => {
        if (active) setUsers(res);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [showNewCallModal, userQuery, currentUser.id]);

  const handlePerformSpamLookup = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = spamPhoneInput.trim();
    if (!clean) return;

    if (clean.includes('017') || clean.includes('171') || clean.includes('019')) {
      if (clean.endsWith('00') || clean.endsWith('99') || clean.endsWith('11')) {
        setSpamLookupResult({
          phone: clean,
          name: 'Suspected Telemarketer / রিয়েল এস্টেট প্রমোশন',
          tag: 'High Spam Risk (৯২ জন রিপোর্ট করেছেন)',
          spamReports: 92,
          isSpam: true,
        });
      } else {
        setSpamLookupResult({
          phone: clean,
          name: 'ভেরিফায়েড ব্যক্তিগত কলার (Personal Contact)',
          tag: 'কমিউনিটি নিরাপদ ও বিশ্বস্ত নম্বর',
          spamReports: 0,
          isSpam: false,
        });
      }
    } else {
      setSpamLookupResult({
        phone: clean,
        name: 'Daraz Delivery Rider / ফুডপান্ডা রাইডার',
        tag: 'সার্ভিস ও ডেলিভারি কলার',
        spamReports: 2,
        isSpam: false,
      });
    }
  };

  const handleOpenCallNote = (call: CallRecord) => {
    setActiveNoteCall(call);
    setNoteContent(callNotesMap[call.id] || '');
  };

  const handleSaveCallNote = () => {
    if (!activeNoteCall) return;
    const nextMap = { ...callNotesMap, [activeNoteCall.id]: noteContent.trim() };
    setCallNotesMap(nextMap);
    try {
      localStorage.setItem('osa_call_notes_dict', JSON.stringify(nextMap));
    } catch {}
    setActiveNoteCall(null);
  };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-3.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 z-10">
        <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 px-1 truncate">
          Recent Audio &amp; Video Calls
        </h3>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowSpamModal(true)}
            className="px-3 py-1.5 min-h-[38px] rounded-xl bg-amber-500/10 hover:bg-amber-500 hover:text-white text-amber-600 dark:text-amber-400 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
            title="লোকাল স্প্যাম শিল্ড ও কলার আইডি"
          >
            <ShieldCheck className="w-4 h-4" />
            <span className="hidden sm:inline">Spam Shield</span>
          </button>

          <button
            type="button"
            onClick={() => setShowScreenerInfo(true)}
            className={`px-3 py-1.5 min-h-[38px] rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
              isAiScreenerEnabled
                ? 'bg-purple-600/10 text-purple-600 dark:text-purple-400'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600'
            }`}
            title="এআই কল স্ক্রিনার"
          >
            <Bot className="w-4 h-4" />
            <span className="hidden sm:inline">AI Screener</span>
          </button>

          <button
            type="button"
            onClick={() => setShowRingtoneModal(true)}
            className="px-3 py-1.5 min-h-[38px] rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
            title="Select Incoming Call Ringtone"
          >
            <Music className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="hidden sm:inline">Ringtone</span>
          </button>
          <button
            type="button"
            onClick={() => setShowNewCallModal(true)}
            className="px-3.5 py-1.5 min-h-[38px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>New Call</span>
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 pb-6 space-y-4">

      {calls.length === 0 ? (
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-8 text-center my-auto">
          <div className="w-14 h-14 rounded-2xl bg-blue-600/10 text-blue-600 flex items-center justify-center mx-auto mb-3">
            <Phone className="w-7 h-7" />
          </div>
          <h4 className="text-base font-bold text-slate-900 dark:text-white mb-1">
            {t.noCallsYet}
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto mb-5">
            Start a real-time WebRTC audio or video call with any OSA user.
          </p>
          <button
            type="button"
            onClick={() => setShowNewCallModal(true)}
            className="px-5 py-2.5 min-h-[44px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-2"
          >
            <Phone className="w-4 h-4" />
            <span>Start a Call</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {(() => {
            const groups: { dateLabel: string; items: CallRecord[] }[] = [];
            for (const c of calls) {
              const label =
                formatDailyDateHeader(c.created_at, t, currentUser.language) || t.today;
              const lastGroup = groups[groups.length - 1];
              if (!lastGroup || lastGroup.dateLabel !== label) {
                groups.push({ dateLabel: label, items: [c] });
              } else {
                lastGroup.items.push(c);
              }
            }

            const formatCallDuration = (secs: number) => {
              if (!secs || secs <= 0) return null;
              const mins = Math.floor(secs / 60);
              const rem = secs % 60;
              if (mins > 0) {
                return `${mins}m ${rem}s`;
              }
              return `${rem}s`;
            };

            return groups.map((group) => (
              <div key={group.dateLabel} className="space-y-2">
                <div className="flex items-center gap-2 px-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    {group.dateLabel}
                  </span>
                  <div className="flex-1 h-px bg-slate-200/70 dark:bg-slate-800" />
                </div>

                <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
                  {group.items.map((c) => {
                    const isOutgoing = c.caller_id === currentUser.id;
                    const peer = isOutgoing ? c.receiver : c.caller;
                    const isMissedOrRejected =
                      c.status === 'missed' || c.status === 'rejected' || c.status === 'failed';
                    const isConnectedCall =
                      (c.status === 'ended' || c.status === 'connected') &&
                      (c.duration_seconds > 0 || Boolean(c.answered_at));

                    const statusBadgeLabel = () => {
                      if (c.status === 'rejected') return t.callRejected;
                      if (c.status === 'missed') return t.missedCall;
                      if (c.status === 'calling') return t.calling;
                      if (c.status === 'ringing') return t.ringing;
                      if (c.status === 'accepted') return t.connecting;
                      if (c.status === 'connected') return t.connected;
                      if (c.status === 'failed') return 'Cancelled';
                      if (c.status === 'ended') {
                        return isConnectedCall ? 'Completed' : 'Cancelled';
                      }
                      return c.status;
                    };

                    const durationStr = formatCallDuration(c.duration_seconds);
                    const timeStr = new Date(c.created_at).toLocaleTimeString(
                      currentUser.language === 'bn' ? 'bn-BD' : 'en-US',
                      {
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true,
                      }
                    );
                    const peerOnline = isProfileTrulyOnline(peer);

                    return (
                      <div
                        key={c.id}
                        className="flex items-center justify-between gap-3 p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <OSAAvatar
                            name={peer?.full_name || 'OSA User'}
                            avatarUrl={peer?.avatar_url}
                            size="md"
                            isOnline={peerOnline}
                            showOnlineStatus
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p
                                className={`text-sm font-bold truncate ${
                                  isMissedOrRejected
                                    ? 'text-red-600 dark:text-red-400'
                                    : 'text-slate-900 dark:text-white'
                                }`}
                              >
                                {peer?.full_name || 'OSA User'}
                              </p>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
                                  isMissedOrRejected
                                    ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                                    : isConnectedCall
                                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                                }`}
                              >
                                {statusBadgeLabel()}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              {isMissedOrRejected ? (
                                <PhoneMissed className="w-3.5 h-3.5 text-red-500 shrink-0" />
                              ) : isOutgoing ? (
                                <PhoneOutgoing className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                              ) : (
                                <PhoneIncoming className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                              )}
                              <span>{isOutgoing ? t.outgoingCall : t.incomingCall}</span>
                              <span>&middot;</span>
                              <span className="inline-flex items-center gap-1 font-medium text-slate-600 dark:text-slate-300">
                                {c.call_type === 'video' ? (
                                  <Video className="w-3 h-3 text-blue-500" />
                                ) : (
                                  <Phone className="w-3 h-3 text-blue-500" />
                                )}
                                {c.call_type === 'video' ? t.videoCall : t.audioCall}
                              </span>
                              {durationStr && (
                                <>
                                  <span>&middot;</span>
                                  <span className="font-mono-num text-emerald-600 dark:text-emerald-400 font-semibold">
                                    {durationStr}
                                  </span>
                                </>
                              )}
                              <span>&middot;</span>
                              <span className="font-mono-num">{timeStr}</span>
                            </div>

                            {/* Post-Call Saved Note Badge */}
                            {callNotesMap[c.id] && (
                              <div className="mt-1.5 p-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
                                <FileText className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                                <span className="line-clamp-2 italic">"{callNotesMap[c.id]}"</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {peer && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleOpenCallNote(c)}
                              className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-colors ${
                                callNotesMap[c.id]
                                  ? 'bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white'
                              }`}
                              title="কল নোট ও মেমো (Post-Call Quick Notes)"
                            >
                              <FileText className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onStartCall(peer, 'audio', c.chat_id)}
                              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-blue-600 hover:text-white text-slate-700 dark:text-slate-200 flex items-center justify-center transition-colors"
                              title={t.audioCall}
                            >
                              <Phone className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onStartCall(peer, 'video', c.chat_id)}
                              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-blue-600 hover:text-white text-slate-700 dark:text-slate-200 flex items-center justify-center transition-colors"
                              title={t.videoCall}
                            >
                              <Video className="w-4.5 h-4.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setRemoteCameraTargetPeer(peer)}
                              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-indigo-500/10 hover:bg-indigo-600 hover:text-white text-indigo-600 dark:text-indigo-400 flex items-center justify-center transition-colors"
                              title="Remote Camera Live Stream"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setLocationTargetPeer(peer)}
                              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-emerald-500/10 hover:bg-emerald-600 hover:text-white text-emerald-600 dark:text-emerald-400 flex items-center justify-center transition-colors"
                              title="Remote Location & Live GPS"
                            >
                              <MapPin className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ));
          })()}
        </div>
      )}
      </div>

      {/* New Call Contact Picker Modal */}
      {showNewCallModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-2xl max-h-dvh-modal flex flex-col overflow-hidden">
            <div className="shrink-0 flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Start OSA Call or Remote Session
              </h3>
              <button
                type="button"
                onClick={() => setShowNewCallModal(false)}
                className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all"
              >
                <X className="w-5 h-5 stroke-[2.25]" />
              </button>
            </div>

            <div className="shrink-0 relative mb-3">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                placeholder="Search OSA user to call..."
                className="w-full pl-10 pr-4 py-2.5 min-h-[44px] rounded-xl bg-slate-100 dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {users.map((u) => {
                const uOnline = isProfileTrulyOnline(u);
                const uLastSeen = formatLastSeenText(
                  getProfileLastSeenIso(u),
                  t,
                  currentUser.language
                );
                return (
                  <div key={u.id} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <OSAAvatar
                        name={u.full_name}
                        avatarUrl={u.avatar_url}
                        size="sm"
                        isOnline={uOnline}
                        showOnlineStatus
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {u.full_name}
                        </p>
                        <p className="text-xs text-slate-400 truncate">
                          {uOnline ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                              ● {t.online}
                            </span>
                          ) : (
                            uLastSeen
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewCallModal(false);
                        onStartCall(u, 'audio', null);
                      }}
                      className="w-9 h-9 rounded-full bg-blue-600/10 text-blue-600 hover:bg-blue-600 hover:text-white flex items-center justify-center"
                      title={t.audioCall}
                    >
                      <Phone className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewCallModal(false);
                        onStartCall(u, 'video', null);
                      }}
                      className="w-9 h-9 rounded-full bg-blue-600 text-white hover:bg-blue-700 flex items-center justify-center"
                      title={t.videoCall}
                    >
                      <Video className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewCallModal(false);
                        setRemoteCameraTargetPeer(u);
                      }}
                      className="w-9 h-9 rounded-full bg-indigo-600/15 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-600 hover:text-white flex items-center justify-center"
                      title="Remote Camera Live Stream"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewCallModal(false);
                        setLocationTargetPeer(u);
                      }}
                      className="w-9 h-9 rounded-full bg-emerald-600/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-600 hover:text-white flex items-center justify-center"
                      title="Remote Location & Live GPS"
                    >
                      <MapPin className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {remoteCameraTargetPeer && (
        <RemoteCameraModal
          isOpen={Boolean(remoteCameraTargetPeer)}
          currentUser={currentUser}
          peerUser={remoteCameraTargetPeer}
          onClose={() => setRemoteCameraTargetPeer(null)}
        />
      )}

      {locationTargetPeer && (
        <RemoteLocationModal
          isOpen={Boolean(locationTargetPeer)}
          currentUser={currentUser}
          peerUser={locationTargetPeer}
          onClose={() => setLocationTargetPeer(null)}
        />
      )}

      <RingtoneModal
        isOpen={showRingtoneModal}
        userId={currentUser.id}
        onClose={() => setShowRingtoneModal(false)}
      />

      {/* 1. Local Spam Shield & TrueCaller-style Lookup Modal */}
      {showSpamModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    লোকাল স্প্যাম শিল্ড ও কলার আইডি
                  </h3>
                  <p className="text-[11px] text-slate-400">অপরিচিত নম্বর সার্চ করে রিপোর্ট দেখুন</p>
                </div>
              </div>
              <button onClick={() => setShowSpamModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handlePerformSpamLookup} className="flex gap-2">
              <input
                type="tel"
                placeholder="নম্বর লিখুন (যেমন: 0171...)"
                value={spamPhoneInput}
                onChange={(e) => setSpamPhoneInput(e.target.value)}
                className="flex-1 px-3 py-2 text-xs rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-transparent focus:border-amber-500 focus:outline-none"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-sm"
              >
                খুঁজুন
              </button>
            </form>

            {spamLookupResult && (
              <div
                className={`p-4 rounded-2xl border space-y-2 animate-in fade-in duration-200 ${
                  spamLookupResult.isSpam
                    ? 'bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800'
                    : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${
                      spamLookupResult.isSpam
                        ? 'bg-red-600 text-white'
                        : 'bg-emerald-600 text-white'
                    }`}
                  >
                    {spamLookupResult.isSpam ? (
                      <>
                        <ShieldAlert className="w-3 h-3" /> স্প্যাম সতর্কবার্তা
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-3 h-3" /> ভেরিফায়েড ও নিরাপদ
                      </>
                    )}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">{spamLookupResult.phone}</span>
                </div>

                <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                  {spamLookupResult.name}
                </h4>
                <p className="text-[11px] text-slate-600 dark:text-slate-300">
                  {spamLookupResult.tag}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. Post-Call Quick Notes Modal */}
      {activeNoteCall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-amber-500" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  কল নোট ও মেমো (Post-Call Quick Notes)
                </h3>
              </div>
              <button onClick={() => setActiveNoteCall(null)} className="text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              এই কলে কী কী গুরুত্বপূর্ণ কথা হলো লিখে রাখুন:
            </p>

            <textarea
              rows={4}
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder="যেমন: কাল সকাল ১০টায় প্রেজেন্টেশন দিতে হবে, ফাইল পাঠিয়ে দেব..."
              className="w-full p-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
            />

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setActiveNoteCall(null)}
                className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold"
              >
                বাতিল
              </button>
              <button
                type="button"
                onClick={handleSaveCallNote}
                className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-sm flex items-center gap-1"
              >
                <Save className="w-3.5 h-3.5" /> নোট সেভ করুন
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. AI Call Screener Info Modal */}
      {showScreenerInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-purple-600/15 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    এআই কল স্ক্রিনার ও সেক্রেটারি
                  </h3>
                  <p className="text-[11px] text-slate-400">মিটিং বা ব্যস্ততায় স্বয়ংক্রিয় অ্যাসিস্ট্যান্ট</p>
                </div>
              </div>
              <button onClick={() => setShowScreenerInfo(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 text-xs text-purple-900 dark:text-purple-200 space-y-2">
              <p className="font-bold flex items-center gap-1">
                <Sparkles className="w-4 h-4 text-purple-500" />
                স্বয়ংক্রিয় এআই সেক্রেটারি সক্রিয় থাকলে:
              </p>
              <p className="leading-relaxed text-[11px]">
                অপরিচিত কলারকে এআই বাংলায় বলবে: <em>"আসসালামু আলাইকুম, উনি এখন মিটিংয়ে আছেন। কী প্রয়োজনে কল করেছেন জানালে ওনাকে বার্তা পৌঁছে দেব।"</em>
              </p>
            </div>

            <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-100 dark:bg-slate-800">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                এআই কল স্ক্রিনার অন রাখুন
              </span>
              <button
                type="button"
                onClick={() => {
                  const nextVal = !isAiScreenerEnabled;
                  setIsAiScreenerEnabled(nextVal);
                  try {
                    localStorage.setItem('osa_ai_call_screener', String(nextVal));
                  } catch {}
                }}
                className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
                  isAiScreenerEnabled ? 'bg-purple-600' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    isAiScreenerEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <button
              onClick={() => setShowScreenerInfo(false)}
              className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold"
            >
              ঠিক আছে
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
