import React, { useEffect, useMemo, useState } from 'react';
import {
  Bookmark,
  Info,
  MessageSquare,
  MessageSquarePlus,
  Phone,
  Search,
  Sparkles,
  UserCheck,
  Users,
  Video,
  X,
} from 'lucide-react';
import { TRANSLATIONS } from '../lib/i18n';
import {
  fetchPrivacyMapForUsers,
  loadLanguagePreference,
  openOrCreateDirectChat,
  openOrCreateSavedMessagesChat,
  searchUsers,
} from '../services/osaService';
import {
  formatLastSeenText,
  getProfileLastSeenIso,
  isProfileTrulyOnline,
} from '../services/presenceService';
import { CallType, LanguageCode, PrivacySettings, Profile } from '../types/osa';
import { OSAAvatar } from './OSAAvatar';

interface NewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserId: string;
  onChatOpened: (chatId: string) => void;
  onStartCall?: (peer: Profile, callType: CallType) => void;
  language?: LanguageCode;
}

type DirectoryFilter = 'all' | 'online' | 'recent';

export const NewChatModal: React.FC<NewChatModalProps> = ({
  isOpen,
  onClose,
  currentUserId,
  onChatOpened,
  onStartCall,
  language,
}) => {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<Profile[]>([]);
  const [privacyMap, setPrivacyMap] = useState<Record<string, PrivacySettings>>({});
  const [loading, setLoading] = useState(false);
  const [startingUserId, setStartingUserId] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<DirectoryFilter>('all');
  const [previewUser, setPreviewUser] = useState<Profile | null>(null);
  const [error, setError] = useState('');

  const lang = language || loadLanguagePreference();
  const isBn = lang === 'bn';
  const t = TRANSLATIONS[lang];

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

    const timer = window.setTimeout(runSearch, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [isOpen, query, currentUserId]);

  const enrichedUsers = useMemo(() => {
    return users.map((u) => {
      const priv = privacyMap[u.id];
      const hidePhoto = priv?.profile_photo_visibility === 'nobody';
      const showOnline = priv ? priv.online_status : true;
      const showLastSeen = priv ? priv.last_seen_visibility !== 'nobody' : true;
      const showAbout = priv?.about_visibility !== 'nobody';
      const trulyOnline = Boolean(showOnline && isProfileTrulyOnline(u));
      const lastSeenIso = getProfileLastSeenIso(u);
      const lastSeenStr =
        !trulyOnline && showLastSeen
          ? formatLastSeenText(lastSeenIso, t, lang)
          : null;
      return {
        user: u,
        hidePhoto,
        showOnline,
        showAbout,
        trulyOnline,
        lastSeenStr,
        lastActiveMs: new Date(lastSeenIso || u.updated_at || 0).getTime(),
      };
    });
  }, [users, privacyMap, t, lang]);

  const onlineEntries = useMemo(
    () => enrichedUsers.filter((item) => item.trulyOnline),
    [enrichedUsers]
  );

  const visibleEntries = useMemo(() => {
    if (filterMode === 'online') {
      return enrichedUsers.filter((item) => item.trulyOnline);
    }
    if (filterMode === 'recent') {
      return [...enrichedUsers].sort((a, b) => b.lastActiveMs - a.lastActiveMs);
    }
    return enrichedUsers;
  }, [enrichedUsers, filterMode]);

  if (!isOpen) return null;

  const handleSelectUser = async (targetUser: Profile) => {
    setStartingUserId(targetUser.id);
    setError('');
    try {
      const chatId = await openOrCreateDirectChat(currentUserId, targetUser.id);
      setPreviewUser(null);
      onChatOpened(chatId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open conversation.');
    } finally {
      setStartingUserId(null);
    }
  };

  const handleOpenSavedMessages = async () => {
    setError('');
    try {
      const chatId = await openOrCreateSavedMessagesChat(currentUserId);
      onChatOpened(chatId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open Saved Messages.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in slide-in-from-bottom-3 duration-150">
        {/* Crisp Header */}
        <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Users className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
                {isBn ? 'OSA ইউজার ডিরেক্টরি' : 'OSA People Directory'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono-num truncate">
                {isBn
                  ? `${onlineEntries.length} জন অনলাইনে · ${users.length} জন ব্যবহারকারী`
                  : `${onlineEntries.length} online · ${users.length} people`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all shrink-0"
            aria-label="Close directory"
          >
            <X className="w-5 h-5 stroke-[2.25]" />
          </button>
        </div>

        {/* Search + Filter Controls */}
        <div className="shrink-0 px-4 pt-3 pb-3 space-y-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                isBn
                  ? 'নাম, @ইউজারনেম, বায়ো বা ইমেইল দিয়ে খুঁজুন...'
                  : 'Search by name, @username, bio, or email...'
              }
              autoFocus
              className="w-full pl-10 pr-10 py-2.5 min-h-[44px] rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200 flex items-center justify-center absolute right-2.5 top-1/2 -translate-y-1/2 hover:bg-slate-200 dark:hover:bg-slate-600"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-xl">
            {(
              [
                { id: 'all', label: isBn ? `সবাই (${users.length})` : `All (${users.length})` },
                { id: 'online', label: isBn ? `অনলাইন (${onlineEntries.length})` : `Online (${onlineEntries.length})` },
                { id: 'recent', label: isBn ? 'সর্বশেষ সক্রিয়' : 'Recently Active' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterMode(tab.id)}
                className={`flex-1 py-1.5 px-2.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
                  filterMode === tab.id
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Active Now Quick-Tap Rail */}
        {onlineEntries.length > 0 && filterMode !== 'online' && !query.trim() && (
          <div className="shrink-0 px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
            <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 mb-2 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isBn ? 'এখন অনলাইনে আছেন (১ ট্যাপে চ্যাট)' : 'Active Now (Tap to Chat)'}</span>
            </p>
            <div className="flex items-center gap-3 overflow-x-auto pb-1">
              {onlineEntries.slice(0, 14).map(({ user: u, hidePhoto }) => (
                <button
                  key={`rail-${u.id}`}
                  type="button"
                  onClick={() => handleSelectUser(u)}
                  className="flex flex-col items-center gap-1 w-14 shrink-0 group active:scale-95 transition-transform"
                >
                  <OSAAvatar
                    name={u.full_name}
                    avatarUrl={u.avatar_url}
                    size="md"
                    isOnline={true}
                    showOnlineStatus={true}
                    hidePhotoForPrivacy={hidePhoto}
                  />
                  <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 truncate w-full text-center group-hover:text-blue-600 dark:group-hover:text-blue-400">
                    {u.full_name.split(' ')[0]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Quick action: Saved Messages / Personal Notes */}
        <div className="shrink-0 px-4 py-2 border-b border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={handleOpenSavedMessages}
            className="w-full flex items-center gap-3 p-2.5 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-600/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Bookmark className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                {isBn ? 'সংরক্ষিত বার্তা (Saved Messages)' : 'Saved Messages'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {isBn
                  ? 'আপনার ব্যক্তিগত ক্লাউড নোট, লিংক ও ফাইল রাখুন'
                  : 'Your private cloud notes, links & files'}
              </p>
            </div>
          </button>
        </div>

        {error && (
          <div className="shrink-0 mx-4 mt-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 px-3.5 py-2.5 text-xs text-red-600 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Directory List */}
        <div className="flex-1 min-h-0 overflow-y-auto pb-4 divide-y divide-slate-100 dark:divide-slate-800/70">
          {loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3.5 animate-pulse p-2">
                  <div className="w-11 h-11 rounded-full bg-slate-200 dark:bg-slate-800 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="w-36 h-3.5 rounded bg-slate-200 dark:bg-slate-800" />
                    <div className="w-48 h-2.5 rounded bg-slate-100 dark:bg-slate-800/70" />
                  </div>
                </div>
              ))}
            </div>
          ) : visibleEntries.length === 0 ? (
            <div className="py-12 px-6 text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto mb-3">
                <UserCheck className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">
                {filterMode === 'online'
                  ? isBn
                    ? 'এই মুহূর্তে কেউ অনলাইনে নেই'
                    : 'No users online right now'
                  : isBn
                  ? 'কোনো মিল পাওয়া যায়নি'
                  : 'No matching OSA users found'}
              </p>
              <p className="text-xs text-slate-500">
                {isBn
                  ? 'অন্য নাম বা ইমেইল দিয়ে খুঁজে দেখুন অথবা "সবাই" ট্যাব দেখুন।'
                  : 'Try another search term or switch back to All users.'}
              </p>
            </div>
          ) : (
            visibleEntries.map(({ user: u, hidePhoto, showOnline, showAbout, trulyOnline, lastSeenStr }) => (
              <div
                key={u.id}
                onClick={() => handleSelectUser(u)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSelectUser(u);
                  }
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left cursor-pointer ${
                  startingUserId === u.id ? 'opacity-50 pointer-events-none' : ''
                }`}
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
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {u.full_name}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {trulyOnline ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold shrink-0">
                        {t.online}
                      </span>
                    ) : lastSeenStr ? (
                      <span className="truncate shrink-0 max-w-[140px]">{lastSeenStr}</span>
                    ) : null}
                    {(trulyOnline || lastSeenStr) && (u.username || (showAbout && u.about)) && (
                      <span aria-hidden="true">·</span>
                    )}
                    <span className="truncate">
                      {showAbout && u.about
                        ? u.about
                        : u.username
                        ? `@${u.username}`
                        : u.email}
                    </span>
                  </div>
                </div>

                {/* Quick 1-Tap Actions */}
                <div
                  className="flex items-center gap-1 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => setPreviewUser(u)}
                    className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center active:scale-95 transition-all"
                    title={isBn ? 'প্রোফাইল দেখুন' : 'View Profile'}
                  >
                    <Info className="w-4 h-4" />
                  </button>

                  {onStartCall && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onStartCall(u, 'audio');
                        }}
                        className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/70 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-600 hover:text-white flex items-center justify-center active:scale-95 transition-all"
                        title={t.audioCall}
                      >
                        <Phone className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onStartCall(u, 'video');
                        }}
                        className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800/70 text-blue-600 dark:text-blue-400 hover:bg-blue-600 hover:text-white flex items-center justify-center active:scale-95 transition-all"
                        title={t.videoCall}
                      >
                        <Video className="w-4 h-4" />
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => handleSelectUser(u)}
                    className="w-9 h-9 rounded-xl bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center shadow-2xs active:scale-95 transition-all"
                    title={isBn ? 'মেসেজ পাঠান' : 'Message'}
                  >
                    <MessageSquarePlus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Quick User Profile Card Overlay */}
      {previewUser && (() => {
        const priv = privacyMap[previewUser.id];
        const hidePhoto = priv?.profile_photo_visibility === 'nobody';
        const showOnline = priv ? priv.online_status : true;
        const showAbout = priv?.about_visibility !== 'nobody';
        const showLastSeen = priv ? priv.last_seen_visibility !== 'nobody' : true;
        const pOnline = Boolean(showOnline && isProfileTrulyOnline(previewUser));
        const pLastSeen =
          !pOnline && showLastSeen
            ? formatLastSeenText(getProfileLastSeenIso(previewUser), t, lang)
            : null;
        return (
          <div
            onClick={() => setPreviewUser(null)}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xs rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-2xl animate-in zoom-in-95 duration-150"
            >
              <div className="flex items-start justify-between mb-3">
                <OSAAvatar
                  name={previewUser.full_name}
                  avatarUrl={previewUser.avatar_url}
                  size="lg"
                  isOnline={pOnline}
                  showOnlineStatus={showOnline}
                  hidePhotoForPrivacy={hidePhoto}
                />
                <button
                  type="button"
                  onClick={() => setPreviewUser(null)}
                  className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white flex items-center justify-center"
                >
                  <X className="w-4 h-4 stroke-[2.25]" />
                </button>
              </div>

              <h4 className="text-lg font-bold text-slate-900 dark:text-white">
                {previewUser.full_name}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {previewUser.username ? `@${previewUser.username}` : previewUser.email}
                {pOnline ? ` · ${t.online}` : pLastSeen ? ` · ${pLastSeen}` : ''}
              </p>

              {showAbout && previewUser.about && (
                <div className="mt-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70 text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
                  {previewUser.about}
                </div>
              )}

              <div className="mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => handleSelectUser(previewUser)}
                  className="w-full min-h-[44px] py-2.5 px-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm active:scale-95 transition-all"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>{isBn ? 'চ্যাট শুরু করুন' : 'Start Chatting'}</span>
                </button>
                {onStartCall && (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewUser(null);
                        onClose();
                        onStartCall(previewUser, 'audio');
                      }}
                      className="min-h-[42px] py-2 px-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center justify-center gap-1.5"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>{t.audioCall}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewUser(null);
                        onClose();
                        onStartCall(previewUser, 'video');
                      }}
                      className="min-h-[42px] py-2 px-3 rounded-2xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs font-bold flex items-center justify-center gap-1.5"
                    >
                      <Video className="w-3.5 h-3.5" />
                      <span>{t.videoCall}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
