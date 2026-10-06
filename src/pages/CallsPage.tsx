import React, { useEffect, useState } from 'react';
import {
  Eye,
  MapPin,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  Plus,
  Search,
  Video,
  X,
} from 'lucide-react';
import { OSAAvatar } from '../components/OSAAvatar';
import { RemoteCameraModal } from '../components/RemoteCameraModal';
import { RemoteLocationModal } from '../components/RemoteLocationModal';
import { TranslationDictionary } from '../lib/i18n';
import { supabase } from '../lib/supabase';
import { fetchCallHistory, searchUsers } from '../services/osaService';
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
  const [loading, setLoading] = useState(true);
  const [showNewCallModal, setShowNewCallModal] = useState(false);
  const [userQuery, setUserQuery] = useState('');
  const [users, setUsers] = useState<Profile[]>([]);
  const [remoteCameraTargetPeer, setRemoteCameraTargetPeer] = useState<Profile | null>(null);
  const [locationTargetPeer, setLocationTargetPeer] = useState<Profile | null>(null);

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

  return (
    <div className="flex flex-col h-full overflow-y-auto px-4 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 px-1">
          Recent Audio &amp; Video Calls
        </h3>
        <button
          type="button"
          onClick={() => setShowNewCallModal(true)}
          className="px-4 py-2 min-h-[40px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>New Call</span>
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-xs text-slate-400">
          Loading call history...
        </div>
      ) : calls.length === 0 ? (
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
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
          {calls.map((c) => {
            const isOutgoing = c.caller_id === currentUser.id;
            const peer = isOutgoing ? c.receiver : c.caller;
            const isMissed = c.status === 'missed' || c.status === 'rejected';

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
                  />
                  <div className="min-w-0">
                    <p
                      className={`text-sm font-bold truncate ${
                        isMissed ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {peer?.full_name || 'OSA User'}
                    </p>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {isMissed ? (
                        <PhoneMissed className="w-3.5 h-3.5 text-red-500 shrink-0" />
                      ) : isOutgoing ? (
                        <PhoneOutgoing className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      ) : (
                        <PhoneIncoming className="w-3.5 h-3.5 text-green-500 shrink-0" />
                      )}
                      <span>
                        {isMissed
                          ? t.missedCall
                          : isOutgoing
                          ? t.outgoingCall
                          : t.incomingCall}
                      </span>
                      <span>&middot;</span>
                      <span className="font-mono-num">
                        {new Date(c.created_at).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                </div>

                {peer && (
                  <div className="flex items-center gap-1.5 shrink-0">
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
      )}

      {/* New Call Contact Picker Modal */}
      {showNewCallModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-2xl max-h-[82vh] flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Start OSA Call or Remote Session
              </h3>
              <button
                type="button"
                onClick={() => setShowNewCallModal(false)}
                className="w-9 h-9 rounded-full flex items-center justify-center text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative mb-3">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                placeholder="Search OSA user to call..."
                className="w-full pl-10 pr-4 py-2.5 min-h-[44px] rounded-xl bg-slate-100 dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {users.map((u) => (
                <div key={u.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <OSAAvatar
                      name={u.full_name}
                      avatarUrl={u.avatar_url}
                      size="sm"
                      isOnline={u.is_online}
                      showOnlineStatus
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {u.full_name}
                      </p>
                      <p className="text-xs text-slate-400 truncate">{u.email}</p>
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
              ))}
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
    </div>
  );
};
