import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Eye,
  Plus,
  Send,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import { OSAAvatar } from '../components/OSAAvatar';
import { TranslationDictionary } from '../lib/i18n';
import { supabase } from '../lib/supabase';
import {
  createMediaStatus,
  createTextStatus,
  deleteStatusItem,
  fetchActiveStatuses,
  recordStatusView,
} from '../services/osaService';
import { Profile, StatusItem } from '../types/osa';

interface StatusPageProps {
  currentUser: Profile;
  t: TranslationDictionary;
}

const STATUS_BG_COLORS = [
  '#2563eb',
  '#0f172a',
  '#059669',
  '#7c3aed',
  '#db2777',
  '#d97706',
];

export const StatusPage: React.FC<StatusPageProps> = ({ currentUser, t }) => {
  const [statuses, setStatuses] = useState<StatusItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Create Status Modals
  const [showTextModal, setShowTextModal] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [bgColor, setBgColor] = useState(STATUS_BG_COLORS[0]);
  const [submitting, setSubmitting] = useState(false);

  // Active Status Viewer
  const [viewingStatus, setViewingStatus] = useState<StatusItem | null>(null);
  const [showViewersSheet, setShowViewersSheet] = useState(false);

  const mediaInputRef = useRef<HTMLInputElement | null>(null);

  const loadStatuses = async () => {
    try {
      const data = await fetchActiveStatuses();
      setStatuses(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load statuses.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatuses();

    const channel = supabase
      .channel('osa-statuses-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'statuses' },
        () => {
          loadStatuses();
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'status_views' },
        () => {
          loadStatuses();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const myStatuses = statuses.filter((s) => s.user_id === currentUser.id);
  const otherStatuses = statuses.filter((s) => s.user_id !== currentUser.id);

  // Group other statuses by user
  const groupedByUser = Array.from(
    otherStatuses.reduce((map, item) => {
      const list = map.get(item.user_id) || [];
      list.push(item);
      map.set(item.user_id, list);
      return map;
    }, new Map<string, StatusItem[]>())
  );

  const handleCreateTextStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusText.trim() || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const created = await createTextStatus(currentUser.id, statusText, bgColor);
      setStatuses((prev) => [created, ...prev]);
      setStatusText('');
      setShowTextModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post status.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMediaFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setSubmitting(true);
    setError('');
    try {
      const created = await createMediaStatus(currentUser.id, file, '');
      setStatuses((prev) => [created, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload media status.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenStatus = async (status: StatusItem) => {
    setViewingStatus(status);
    setShowViewersSheet(false);
    if (status.user_id !== currentUser.id) {
      try {
        await recordStatusView(status.id, currentUser.id);
        loadStatuses();
      } catch {
        // Ignore duplicate view error
      }
    }
  };

  const handleDeleteStatus = async (status: StatusItem) => {
    try {
      await deleteStatusItem(status.id, currentUser.id, status.storage_path);
      setStatuses((prev) => prev.filter((s) => s.id !== status.id));
      setViewingStatus(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete status.');
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <input
        ref={mediaInputRef}
        type="file"
        accept="image/*,video/*"
        onChange={handleMediaFileSelected}
        className="hidden"
      />

      {/* Fixed Top Action Header - My Status */}
      <div className="shrink-0 px-4 py-3.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 z-10">
        <div className="flex items-center justify-between gap-3">
          <div
            onClick={() => {
              if (myStatuses.length > 0) {
                handleOpenStatus(myStatuses[0]);
              } else {
                setShowTextModal(true);
              }
            }}
            className="flex items-center gap-3.5 cursor-pointer min-w-0 flex-1"
          >
            <div className="relative">
              <div
                className={`rounded-full p-0.5 ${
                  myStatuses.length > 0
                    ? 'ring-2 ring-green-500 ring-offset-2 dark:ring-offset-slate-900'
                    : ''
                }`}
              >
                <OSAAvatar
                  name={currentUser.full_name}
                  avatarUrl={currentUser.avatar_url}
                  size="md"
                />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center border-2 border-white dark:border-slate-900">
                <Plus className="w-3 h-3" />
              </span>
            </div>

            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {t.myStatus}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {submitting
                  ? 'Uploading status to OSA...'
                  : myStatuses.length > 0
                  ? `${myStatuses.length} active status update(s) · Tap to view`
                  : t.addStatus}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowTextModal(true)}
              className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center transition-colors"
              title={t.textStatus}
            >
              <Type className="w-4.5 h-4.5" />
            </button>
            <button
              type="button"
              onClick={() => mediaInputRef.current?.click()}
              disabled={submitting}
              className="w-10 h-10 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center shadow-sm transition-colors"
              title={`${t.imageStatus} / ${t.videoStatus}`}
            >
              <Camera className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable Middle Content */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 pb-6 space-y-5">
        {error && (
          <div className="rounded-2xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 px-4 py-3 text-xs text-red-700 dark:text-red-300 flex items-center justify-between">
            <span>{error}</span>
            <button type="button" onClick={() => setError('')} className="font-bold">
              &times;
            </button>
          </div>
        )}

        {/* List my own individual statuses so user can view viewers or delete */}
        {myStatuses.length > 0 && (
          <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-3.5 shadow-xs space-y-2">
            {myStatuses.map((st) => (
              <div
                key={st.id}
                className="flex items-center justify-between py-1.5 px-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <button
                  type="button"
                  onClick={() => handleOpenStatus(st)}
                  className="flex items-center gap-2.5 text-left min-w-0 flex-1"
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" />
                  <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                    {st.media_type === 'text'
                      ? st.content
                      : `[${st.media_type.toUpperCase()}] ${st.content || 'Media Status'}`}
                  </span>
                  <span className="text-[11px] text-slate-400 shrink-0">
                    &middot; {(st.views || []).length} {t.statusViewers.toLowerCase()}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteStatus(st)}
                  className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg"
                  title={t.deleteStatus}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </section>
        )}

      {/* Recent Updates from Other OSA Users */}
      <section className="space-y-3">
        <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 px-1">
          {t.recentUpdates}
        </h4>

        {loading ? (
          <div className="py-12 text-center text-xs text-slate-400">
            Loading OSA status updates...
          </div>
        ) : groupedByUser.length === 0 ? (
          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-8 text-center">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
              {t.noStatusUpdates}
            </p>
            <p className="text-xs text-slate-400">
              Status updates shared by OSA users disappear automatically after 24 hours.
            </p>
          </div>
        ) : (
          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
            {groupedByUser.map(([uid, userStatuses]) => {
              const latest = userStatuses[0];
              const author = latest.user;
              return (
                <button
                  key={uid}
                  type="button"
                  onClick={() => handleOpenStatus(latest)}
                  className="w-full flex items-center gap-3.5 p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left"
                >
                  <div className="rounded-full p-0.5 ring-2 ring-green-500">
                    <OSAAvatar
                      name={author?.full_name || 'OSA User'}
                      avatarUrl={author?.avatar_url}
                      size="md"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {author?.full_name || 'OSA User'}
                      </p>
                      <span className="text-[11px] font-mono-num text-slate-400 shrink-0">
                        {new Date(latest.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {userStatuses.length} update(s) &middot;{' '}
                      {latest.media_type === 'text'
                        ? latest.content
                        : `${latest.media_type.toUpperCase()} status`}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>
      </div>

      {/* Create Text Status Modal */}
      {showTextModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div
            className="w-full max-w-md max-h-dvh-modal rounded-3xl p-6 text-white shadow-2xl flex flex-col justify-between min-h-[340px] overflow-hidden transition-colors"
            style={{ backgroundColor: bgColor }}
          >
            <div className="shrink-0 flex items-center justify-between">
              <span className="text-xs font-bold tracking-wider uppercase opacity-80">
                OSA {t.textStatus}
              </span>
              <button
                type="button"
                onClick={() => setShowTextModal(false)}
                className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center hover:bg-white/25"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTextStatus} className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="flex-1 min-h-0 overflow-y-auto flex items-center justify-center py-6">
                <textarea
                  rows={4}
                  value={statusText}
                  onChange={(e) => setStatusText(e.target.value)}
                  placeholder="Type your status update..."
                  autoFocus
                  className="w-full bg-transparent text-center text-xl font-bold placeholder:text-white/60 focus:outline-none resize-none"
                />
              </div>

              <div className="shrink-0 flex items-center justify-between pt-4 border-t border-white/20">
                <div className="flex items-center gap-2">
                  {STATUS_BG_COLORS.map((col) => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => setBgColor(col)}
                      className={`w-7 h-7 rounded-full border-2 ${
                        bgColor === col ? 'border-white scale-110' : 'border-white/40'
                      }`}
                      style={{ backgroundColor: col }}
                      aria-label={`Select color ${col}`}
                    />
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={!statusText.trim() || submitting}
                  className="px-5 py-2.5 min-h-[42px] rounded-xl bg-white text-slate-900 font-bold text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  <span>{submitting ? 'Posting...' : t.send}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Fullscreen Status Viewer Modal */}
      {viewingStatus && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-between overflow-hidden text-white p-5 select-none"
          style={{
            backgroundColor:
              viewingStatus.media_type === 'text' ? viewingStatus.background_color : '#020617',
          }}
        >
          {/* Top Viewer Bar */}
          <div className="shrink-0 flex items-center justify-between pt-safe z-10">
            <div className="flex items-center gap-3">
              <OSAAvatar
                name={viewingStatus.user?.full_name || currentUser.full_name}
                avatarUrl={viewingStatus.user?.avatar_url || currentUser.avatar_url}
                size="sm"
              />
              <div>
                <p className="text-sm font-bold">
                  {viewingStatus.user?.full_name || currentUser.full_name}
                </p>
                <p className="text-[11px] opacity-75">
                  {new Date(viewingStatus.created_at).toLocaleString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    month: 'short',
                    day: 'numeric',
                  })}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {viewingStatus.user_id === currentUser.id && (
                <button
                  type="button"
                  onClick={() => handleDeleteStatus(viewingStatus)}
                  className="w-10 h-10 rounded-full bg-red-600/80 hover:bg-red-600 flex items-center justify-center"
                  title={t.deleteStatus}
                >
                  <Trash2 className="w-4.5 h-4.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setViewingStatus(null)}
                className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Center Status Content */}
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center text-center py-4">
            {viewingStatus.media_type === 'text' && (
              <p className="text-2xl sm:text-3xl font-bold max-w-lg px-4 leading-relaxed whitespace-pre-wrap">
                {viewingStatus.content}
              </p>
            )}

            {viewingStatus.media_type === 'image' && viewingStatus.media_url && (
              <img
                src={viewingStatus.media_url}
                alt="OSA Status"
                referrerPolicy="no-referrer"
                className="max-h-[68vh] w-auto rounded-2xl object-contain"
              />
            )}

            {viewingStatus.media_type === 'video' && viewingStatus.media_url && (
              <video
                src={viewingStatus.media_url}
                controls
                autoPlay
                playsInline
                className="max-h-[68vh] w-auto rounded-2xl"
              />
            )}

            {viewingStatus.media_type !== 'text' && viewingStatus.content && (
              <p className="mt-3 text-sm bg-black/50 px-4 py-2 rounded-xl">
                {viewingStatus.content}
              </p>
            )}
          </div>

          {/* Bottom Viewers Trigger (for owner) */}
          <div className="shrink-0 pb-safe flex flex-col items-center z-10">
            {viewingStatus.user_id === currentUser.id && (
              <button
                type="button"
                onClick={() => setShowViewersSheet((prev) => !prev)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/15 hover:bg-white/25 text-xs font-semibold"
              >
                <Eye className="w-4 h-4" />
                <span>
                  {(viewingStatus.views || []).length} {t.statusViewers}
                </span>
              </button>
            )}

            {showViewersSheet && viewingStatus.user_id === currentUser.id && (
              <div className="mt-3 w-full max-w-md rounded-2xl bg-slate-900/95 border border-white/15 p-4 max-h-48 overflow-y-auto">
                <p className="text-xs font-bold mb-2 text-slate-300">{t.statusViewers}</p>
                {(viewingStatus.views || []).length === 0 ? (
                  <p className="text-xs text-slate-400">No views yet.</p>
                ) : (
                  <div className="space-y-2">
                    {(viewingStatus.views || []).map((v) => (
                      <div key={v.id} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <OSAAvatar
                            name={v.viewer?.full_name || 'Viewer'}
                            avatarUrl={v.viewer?.avatar_url}
                            size="xs"
                          />
                          <span>{v.viewer?.full_name || 'OSA User'}</span>
                        </div>
                        <span className="text-slate-400 font-mono-num">
                          {new Date(v.viewed_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
