import React from 'react';
import { Bell, Check, CheckCheck, Trash2, X } from 'lucide-react';
import { OSAAvatar } from '../components/OSAAvatar';
import { TranslationDictionary } from '../lib/i18n';
import {
  deleteNotificationItem,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/osaService';
import { NotificationItem } from '../types/osa';

interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  notifications: NotificationItem[];
  onRefresh: () => void;
  onOpenChat: (chatId: string) => void;
  t: TranslationDictionary;
}

export const NotificationsModal: React.FC<NotificationsModalProps> = ({
  isOpen,
  onClose,
  userId,
  notifications,
  onRefresh,
  onOpenChat,
  t,
}) => {
  if (!isOpen) return null;

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const handleMarkOne = async (n: NotificationItem) => {
    if (!n.is_read) {
      await markNotificationRead(n.id);
      onRefresh();
    }
    if (n.chat_id) {
      onOpenChat(n.chat_id);
      onClose();
    }
  };

  const handleMarkAll = async () => {
    await markAllNotificationsRead(userId);
    onRefresh();
  };

  const handleDeleteOne = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteNotificationItem(id);
    onRefresh();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl max-h-dvh-modal flex flex-col overflow-hidden">
        <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600/10 text-blue-600 flex items-center justify-center">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {t.notifications}
              </h3>
              <p className="text-[11px] text-slate-500">
                {unreadCount} unread notification(s)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAll}
                className="px-2.5 py-1.5 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 text-xs font-semibold inline-flex items-center gap-1"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>{t.markAllRead}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto pb-4 divide-y divide-slate-100 dark:divide-slate-800">
          {notifications.length === 0 ? (
            <div className="py-14 px-6 text-center">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                No notifications yet
              </p>
              <p className="text-xs text-slate-400">
                New messages, mentions, and call alerts will appear here in real time.
              </p>
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => handleMarkOne(n)}
                className={`flex items-start gap-3 px-5 py-3.5 cursor-pointer transition-colors ${
                  n.is_read
                    ? 'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    : 'bg-blue-50/50 dark:bg-blue-950/25 hover:bg-blue-50 dark:hover:bg-blue-950/40'
                }`}
              >
                <OSAAvatar
                  name={n.actor?.full_name || n.title || 'OSA'}
                  avatarUrl={n.actor?.avatar_url}
                  size="sm"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {n.title}
                    </p>
                    <span className="text-[10px] font-mono-num text-slate-400 shrink-0">
                      {new Date(n.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 mt-0.5">
                    {n.body}
                  </p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {!n.is_read && (
                    <span
                      title="Unread"
                      className="w-2.5 h-2.5 rounded-full bg-blue-600 mr-1"
                    />
                  )}
                  <button
                    type="button"
                    onClick={(e) => handleDeleteOne(n.id, e)}
                    className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg"
                    title="Delete notification"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
