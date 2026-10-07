import React, { useEffect, useState } from 'react';
import { MessageSquarePlus, Search, X } from 'lucide-react';
import { TRANSLATIONS } from '../lib/i18n';
import {
  fetchPrivacyMapForUsers,
  loadLanguagePreference,
  openOrCreateDirectChat,
  searchUsers,
} from '../services/osaService';
import {
  formatLastSeenText,
  getProfileLastSeenIso,
  isProfileTrulyOnline,
} from '../services/presenceService';
import { PrivacySettings, Profile } from '../types/osa';
import { OSAAvatar } from './OSAAvatar';

interface NewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserId: string;
  onChatOpened: (chatId: string) => void;
}

export const NewChatModal: React.FC<NewChatModalProps> = ({
  isOpen,
  onClose,
  currentUserId,
  onChatOpened,
}) => {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<Profile[]>([]);
  const [privacyMap, setPrivacyMap] = useState<Record<string, PrivacySettings>>({});
  const [loading, setLoading] = useState(false);
  const [startingUserId, setStartingUserId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    const runSearch = async () => {
      setLoading(true);
      setError('');
      try {
        const results = await searchUsers(query, currentUserId);
        if (!active) return;
        setUsers(results);
        const priv = await fetchPrivacyMapForUsers(results.map((u) => u.id));
        if (active) setPrivacyMap(priv);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Unable to search users.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    const timer = window.setTimeout(runSearch, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [isOpen, query, currentUserId]);

  if (!isOpen) return null;

  const handleSelectUser = async (targetUser: Profile) => {
    setStartingUserId(targetUser.id);
    setError('');
    try {
      const chatId = await openOrCreateDirectChat(currentUserId, targetUser.id);
      onChatOpened(chatId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open conversation.');
    } finally {
      setStartingUserId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-dvh-modal overflow-hidden">
        <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600/10 text-blue-600 flex items-center justify-center">
              <MessageSquarePlus className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              New Chat on OSA
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="shrink-0 p-4 border-b border-slate-100 dark:border-slate-800">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search OSA users by name, email, or username..."
              autoFocus
              className="w-full pl-10 pr-4 py-2.5 min-h-[44px] rounded-xl bg-slate-100 dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
        </div>

        {error && (
          <div className="shrink-0 mx-4 mt-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 px-3.5 py-2.5 text-xs text-red-600 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto pb-4 divide-y divide-slate-100 dark:divide-slate-800/60">
          {loading ? (
            <div className="py-12 text-center text-xs text-slate-500">
              Searching OSA directory...
            </div>
          ) : users.length === 0 ? (
            <div className="py-12 px-6 text-center">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                No matching OSA users found
              </p>
              <p className="text-xs text-slate-500">
                Try searching a different name or email address.
              </p>
            </div>
          ) : (
            users.map((u) => {
              const lang = loadLanguagePreference();
              const t = TRANSLATIONS[lang];
              const priv = privacyMap[u.id];
              const hidePhoto = priv?.profile_photo_visibility === 'nobody';
              const showOnline = priv ? priv.online_status : true;
              const showLastSeen = priv ? priv.last_seen_visibility !== 'nobody' : true;
              const showAbout = priv?.about_visibility !== 'nobody';
              const trulyOnline = Boolean(showOnline && isProfileTrulyOnline(u));
              const lastSeenStr =
                !trulyOnline && showLastSeen
                  ? formatLastSeenText(getProfileLastSeenIso(u), t, lang)
                  : null;

              return (
                <button
                  key={u.id}
                  type="button"
                  disabled={startingUserId === u.id}
                  onClick={() => handleSelectUser(u)}
                  className="w-full flex items-center gap-3.5 px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left disabled:opacity-50"
                >
                  <OSAAvatar
                    name={u.full_name}
                    avatarUrl={u.avatar_url}
                    size="md"
                    isOnline={trulyOnline}
                    showOnlineStatus={showOnline}
                    hidePhotoForPrivacy={hidePhoto}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {u.full_name}
                      </p>
                      {trulyOnline ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                          {t.online}
                        </span>
                      ) : lastSeenStr ? (
                        <span className="text-[11px] text-slate-400 shrink-0 truncate max-w-[190px]">
                          {lastSeenStr}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {u.username ? `@${u.username}` : u.email}
                      {showAbout && u.about ? ` · ${u.about}` : ''}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
