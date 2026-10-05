import React, { useEffect, useRef, useState } from 'react';
import { Camera, Check, Plus, Search, Users, X } from 'lucide-react';
import { OSAAvatar } from '../components/OSAAvatar';
import { TranslationDictionary } from '../lib/i18n';
import { createGroupWithChat, searchUsers } from '../services/osaService';
import { Chat, Profile } from '../types/osa';

interface GroupsPageProps {
  currentUser: Profile;
  chats: Chat[];
  onOpenChat: (chatId: string) => void;
  onGroupsUpdated: () => void;
  t: TranslationDictionary;
}

export const GroupsPage: React.FC<GroupsPageProps> = ({
  currentUser,
  chats,
  onOpenChat,
  onGroupsUpdated,
  t,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Create Group form state
  const [groupName, setGroupName] = useState('');
  const [groupDesc, setGroupDesc] = useState('');
  const [groupPhotoFile, setGroupPhotoFile] = useState<File | null>(null);
  const [groupPhotoPreview, setGroupPhotoPreview] = useState<string | null>(null);
  const [availableUsers, setAvailableUsers] = useState<Profile[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [memberFilter, setMemberFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const groupChats = chats.filter((c) => c.type === 'group');
  const filteredGroups = searchQuery.trim()
    ? groupChats.filter((c) =>
        (c.group?.name || '').toLowerCase().includes(searchQuery.trim().toLowerCase())
      )
    : groupChats;

  useEffect(() => {
    if (!showCreateModal) return;
    let active = true;
    searchUsers('', currentUser.id)
      .then((res) => {
        if (active) setAvailableUsers(res);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [showCreateModal, currentUser.id]);

  const toggleMember = (userId: string) => {
    setSelectedMemberIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handlePhotoSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setGroupPhotoFile(file);
    setGroupPhotoPreview(URL.createObjectURL(file));
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) {
      setError('Please enter a group name.');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const { chatId } = await createGroupWithChat({
        creatorId: currentUser.id,
        name: groupName,
        description: groupDesc,
        avatarFile: groupPhotoFile,
        memberIds: selectedMemberIds,
      });
      setShowCreateModal(false);
      setGroupName('');
      setGroupDesc('');
      setGroupPhotoFile(null);
      setGroupPhotoPreview(null);
      setSelectedMemberIds([]);
      onGroupsUpdated();
      onOpenChat(chatId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create group.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto px-4 py-4 space-y-4">
      {/* Top Search + Create Group CTA */}
      <div className="flex items-center gap-2.5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search OSA groups..."
            className="w-full pl-10 pr-4 py-2.5 min-h-[44px] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2.5 min-h-[44px] rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>{t.createGroup}</span>
        </button>
      </div>

      {/* Groups List */}
      {filteredGroups.length === 0 ? (
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-8 text-center my-auto">
          <div className="w-14 h-14 rounded-2xl bg-blue-600/10 text-blue-600 flex items-center justify-center mx-auto mb-3">
            <Users className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
            No OSA Groups Yet
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto mb-5">
            Create a group with your contacts to share messages, media, and documents in real time.
          </p>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="px-5 py-2.5 min-h-[44px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>{t.createGroup}</span>
          </button>
        </div>
      ) : (
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
          {filteredGroups.map((chat) => {
            const grp = chat.group;
            const unread = chat.my_membership?.unread_count || 0;
            return (
              <button
                key={chat.id}
                type="button"
                onClick={() => onOpenChat(chat.id)}
                className="w-full flex items-center gap-3.5 p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left"
              >
                <OSAAvatar
                  name={grp?.name || 'OSA Group'}
                  avatarUrl={grp?.avatar_url}
                  size="md"
                  isGroup
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {grp?.name || 'OSA Group'}
                    </p>
                    {chat.last_message_at && (
                      <span className="text-[11px] font-mono-num text-slate-400 shrink-0">
                        {new Date(chat.last_message_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {chat.last_message_text || grp?.description || 'Tap to open group chat'}
                    </p>
                    {unread > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-blue-600 text-white text-[10px] font-mono-num font-bold shrink-0">
                        {unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Create Group Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl max-h-[88vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {t.createGroup}
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="w-9 h-9 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="mb-3 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 px-3.5 py-2 text-xs text-red-600 dark:text-red-300">
                {error}
              </div>
            )}

            <form onSubmit={handleCreateGroup} className="flex-1 flex flex-col min-h-0 space-y-4">
              {/* Group Photo + Name */}
              <div className="flex items-center gap-3.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoSelected}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="relative w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden shrink-0"
                >
                  {groupPhotoPreview ? (
                    <img
                      src={groupPhotoPreview}
                      alt="Group preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Camera className="w-5 h-5 text-slate-400" />
                  )}
                </button>
                <div className="flex-1 space-y-2">
                  <input
                    type="text"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder={t.groupName}
                    required
                    className="w-full px-3.5 py-2 min-h-[42px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
                  />
                  <input
                    type="text"
                    value={groupDesc}
                    onChange={(e) => setGroupDesc(e.target.value)}
                    placeholder={`${t.groupDescription} (optional)`}
                    className="w-full px-3.5 py-1.5 min-h-[38px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Member Selection */}
              <div className="flex-1 flex flex-col min-h-0">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {t.addMembers} ({selectedMemberIds.length} selected)
                </label>
                <input
                  type="text"
                  value={memberFilter}
                  onChange={(e) => setMemberFilter(e.target.value)}
                  placeholder="Search OSA users to add..."
                  className="w-full px-3.5 py-2 min-h-[40px] rounded-xl bg-slate-100 dark:bg-slate-800 text-xs mb-2"
                />

                <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-2xl px-3">
                  {availableUsers
                    .filter((u) =>
                      u.full_name.toLowerCase().includes(memberFilter.toLowerCase())
                    )
                    .map((u) => {
                      const isSelected = selectedMemberIds.includes(u.id);
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => toggleMember(u.id)}
                          className="w-full flex items-center justify-between py-2.5 text-left"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <OSAAvatar name={u.full_name} avatarUrl={u.avatar_url} size="xs" />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                                {u.full_name}
                              </p>
                              <p className="text-[10px] text-slate-400 truncate">{u.email}</p>
                            </div>
                          </div>
                          <span
                            className={`w-5 h-5 rounded-md flex items-center justify-center border ${
                              isSelected
                                ? 'bg-blue-600 border-blue-600 text-white'
                                : 'border-slate-300 dark:border-slate-700'
                            }`}
                          >
                            {isSelected && <Check className="w-3.5 h-3.5" />}
                          </span>
                        </button>
                      );
                    })}
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-2.5 min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-300"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={creating || !groupName.trim()}
                  className="flex-1 py-2.5 min-h-[44px] rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold"
                >
                  {creating ? 'Creating...' : t.createGroup}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
