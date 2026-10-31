import React, { useEffect, useState } from 'react';
import { Users, Search, ChevronRight, X } from 'lucide-react';
import { Profile, Chat } from '../types/osa';
import { UserPermissionDetailModal } from './UserPermissionDetailModal';

interface UserSelectForPermissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: Profile;
  chats: Chat[];
}

export const UserSelectForPermissionModal: React.FC<UserSelectForPermissionModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  chats = [],
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);

  // Extract unique peers from chats
  const usersList: Profile[] = React.useMemo(() => {
    const map = new Map<string, Profile>();
    const safeChats = Array.isArray(chats) ? chats : [];
    for (const c of safeChats) {
      if (c?.peer && c.peer.id !== currentUser?.id) {
        map.set(c.peer.id, c.peer);
      }
      if (c?.members && Array.isArray(c.members)) {
        for (const m of c.members) {
          if (m?.id && m.id !== currentUser?.id) {
            map.set(m.id, m);
          }
        }
      }
    }
    return Array.from(map.values());
  }, [chats, currentUser?.id]);

  const filteredUsers = usersList.filter(
    (u) =>
      u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  User Access Settings
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Select a user to manage per-contact permissions
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Search */}
          <div className="p-4 border-b border-slate-100 dark:border-slate-800">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search chat users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 border-0 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {filteredUsers.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                No chat users found. Start a chat first to manage per-user access.
              </div>
            ) : (
              filteredUsers.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setSelectedUser(u)}
                  className="w-full flex items-center justify-between p-3 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-left group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {u.avatar_url ? (
                      <img
                        src={u.avatar_url}
                        alt={u.full_name}
                        className="w-10 h-10 rounded-xl object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-blue-600 text-white font-bold flex items-center justify-center text-xs shrink-0">
                        {u.full_name?.[0]?.toUpperCase() || 'U'}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {u.full_name}
                      </p>
                      <p className="text-xs text-slate-400 truncate">@{u.username}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {selectedUser && (
        <UserPermissionDetailModal
          isOpen={Boolean(selectedUser)}
          onClose={() => setSelectedUser(null)}
          currentUser={currentUser}
          targetUser={selectedUser}
        />
      )}
    </>
  );
};
