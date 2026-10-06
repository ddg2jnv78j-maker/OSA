import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  HelpCircle,
  RefreshCw,
  Search,
  Send,
  Shield,
  Users,
  X,
} from 'lucide-react';
import { OSAAvatar } from '../components/OSAAvatar';
import {
  createNotification,
  fetchAllReportsForAdmin,
  fetchAllSupportTicketsForAdmin,
  fetchAllUsersForAdmin,
  setUserSuspensionAsAdmin,
  updateReportStatusAsAdmin,
  updateSupportTicketStatusAsAdmin,
} from '../services/osaService';
import { Profile, ReportRecord, SupportTicket } from '../types/osa';

interface AdminPanelModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: Profile;
  adminRole: string | null;
}

type AdminTab = 'reports' | 'tickets' | 'users';

export const AdminPanelModal: React.FC<AdminPanelModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  adminRole,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('reports');
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Reports State
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [reportFilter, setReportFilter] = useState<'all' | 'submitted' | 'reviewing' | 'resolved'>(
    'all'
  );
  const [updatingReportId, setUpdatingReportId] = useState<string | null>(null);

  // Support Tickets State
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [ticketFilter, setTicketFilter] = useState<'all' | 'open' | 'in_progress' | 'closed'>(
    'all'
  );
  const [updatingTicketId, setUpdatingTicketId] = useState<string | null>(null);
  const [replyTextMap, setReplyTextMap] = useState<Record<string, string>>({});

  // Users Moderation State
  const [users, setUsers] = useState<Profile[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  const loadAdminData = async () => {
    setLoading(true);
    setBanner(null);
    try {
      const [repData, tktData, usrData] = await Promise.all([
        fetchAllReportsForAdmin(),
        fetchAllSupportTicketsForAdmin(),
        fetchAllUsersForAdmin(userSearch),
      ]);
      setReports(repData);
      setTickets(tktData);
      setUsers(usrData);
    } catch (err) {
      setBanner({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Failed to load admin data. Ensure RLS migration is applied.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    loadAdminData();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'users') return;
    const timer = window.setTimeout(async () => {
      try {
        const list = await fetchAllUsersForAdmin(userSearch);
        setUsers(list);
      } catch {
        // Ignore transient search error
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [userSearch, activeTab, isOpen]);

  if (!isOpen) return null;

  const handleUpdateReportStatus = async (
    report: ReportRecord,
    nextStatus: ReportRecord['status']
  ) => {
    setUpdatingReportId(report.id);
    setBanner(null);
    try {
      const updated = await updateReportStatusAsAdmin(report.id, nextStatus);
      setReports((prev) => prev.map((r) => (r.id === report.id ? updated : r)));
      if (report.reporter_id) {
        await createNotification({
          userId: report.reporter_id,
          actorId: currentUser.id,
          type: 'system',
          title: 'OSA Trust & Safety Update',
          body: `Your report (${report.reason}) status has been updated to: ${nextStatus.toUpperCase()}.`,
          referenceId: report.id,
        });
      }
      setBanner({
        type: 'success',
        text: `Report status updated to "${nextStatus}".`,
      });
    } catch (err) {
      setBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update report status.',
      });
    } finally {
      setUpdatingReportId(null);
    }
  };

  const handleUpdateTicketStatus = async (
    ticket: SupportTicket,
    nextStatus: SupportTicket['status']
  ) => {
    setUpdatingTicketId(ticket.id);
    setBanner(null);
    try {
      const updated = await updateSupportTicketStatusAsAdmin(ticket.id, nextStatus);
      setTickets((prev) => prev.map((tk) => (tk.id === ticket.id ? updated : tk)));
      await createNotification({
        userId: ticket.user_id,
        actorId: currentUser.id,
        type: 'system',
        title: `OSA Support Ticket (${ticket.subject})`,
        body: `Your support ticket status is now: ${nextStatus.replace('_', ' ').toUpperCase()}.`,
        referenceId: ticket.id,
      });
      setBanner({
        type: 'success',
        text: `Support ticket marked as "${nextStatus}".`,
      });
    } catch (err) {
      setBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update support ticket status.',
      });
    } finally {
      setUpdatingTicketId(null);
    }
  };

  const handleSendTicketReplyNotification = async (ticket: SupportTicket) => {
    const reply = (replyTextMap[ticket.id] || '').trim();
    if (!reply) return;
    setUpdatingTicketId(ticket.id);
    setBanner(null);
    try {
      await createNotification({
        userId: ticket.user_id,
        actorId: currentUser.id,
        type: 'system',
        title: `OSA Support Response: ${ticket.subject}`,
        body: reply,
        referenceId: ticket.id,
      });
      setReplyTextMap((prev) => ({ ...prev, [ticket.id]: '' }));
      setBanner({
        type: 'success',
        text: 'Response notification sent to user.',
      });
    } catch (err) {
      setBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to send response.',
      });
    } finally {
      setUpdatingTicketId(null);
    }
  };

  const handleToggleUserSuspension = async (target: Profile) => {
    if (target.id === currentUser.id) return;
    const nextSuspended = !target.is_suspended;
    setUpdatingUserId(target.id);
    setBanner(null);
    try {
      await setUserSuspensionAsAdmin(target.id, nextSuspended);
      setUsers((prev) =>
        prev.map((u) => (u.id === target.id ? { ...u, is_suspended: nextSuspended } : u))
      );
      await createNotification({
        userId: target.id,
        actorId: currentUser.id,
        type: 'system',
        title: nextSuspended ? 'Account Messaging Restricted' : 'Account Restored',
        body: nextSuspended
          ? 'Your OSA account has been restricted by an administrator following a moderation review.'
          : 'Your OSA account restriction has been lifted by an administrator.',
      });
      setBanner({
        type: 'success',
        text: `${target.full_name} has been ${nextSuspended ? 'suspended' : 'restored'}.`,
      });
    } catch (err) {
      setBanner({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Moderation update failed. Ensure 20261006_admin_cpanel_and_security.sql is applied.',
      });
    } finally {
      setUpdatingUserId(null);
    }
  };

  const filteredReports = reports.filter((r) =>
    reportFilter === 'all' ? true : r.status === reportFilter
  );

  const filteredTickets = tickets.filter((tk) =>
    ticketFilter === 'all' ? true : tk.status === ticketFilter
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-2 sm:p-4">
      <div className="w-full max-w-4xl h-[92vh] rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden">
        {/* Top Admin Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <Shield className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate">
                  OSA Admin C-Panel
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-blue-600/10 text-blue-600 dark:text-blue-400 text-[10px] font-bold uppercase tracking-wider shrink-0">
                  {adminRole || 'admin'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                RLS-Protected Moderation · Reports, Support Tickets &amp; Users
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={loadAdminData}
              disabled={loading}
              className="w-10 h-10 rounded-full flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
              title="Refresh Admin Data"
            >
              <RefreshCw className={`w-4.5 h-4.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-10 h-10 rounded-full flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
              aria-label="Close Admin C-Panel"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 px-4 sm:px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('reports')}
            className={`px-4 py-2 min-h-[40px] rounded-xl text-xs font-bold inline-flex items-center gap-2 shrink-0 transition-colors ${
              activeTab === 'reports'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            <span>Reports ({reports.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('tickets')}
            className={`px-4 py-2 min-h-[40px] rounded-xl text-xs font-bold inline-flex items-center gap-2 shrink-0 transition-colors ${
              activeTab === 'tickets'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            <span>Support Tickets ({tickets.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 min-h-[40px] rounded-xl text-xs font-bold inline-flex items-center gap-2 shrink-0 transition-colors ${
              activeTab === 'users'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Users ({users.length})</span>
          </button>
        </div>

        {banner && (
          <div
            className={`mx-4 sm:mx-6 mt-3 rounded-2xl px-4 py-2.5 text-xs flex items-center justify-between border shrink-0 ${
              banner.type === 'success'
                ? 'bg-green-50 dark:bg-green-950/50 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
                : 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
            }`}
          >
            <span className="flex items-center gap-2">
              {banner.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
              {banner.text}
            </span>
            <button type="button" onClick={() => setBanner(null)} className="font-bold ml-2">
              &times;
            </button>
          </div>
        )}

        {/* Main Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* =============================================================== */}
          {/* TAB 1: REPORTS                                                  */}
          {/* =============================================================== */}
          {activeTab === 'reports' && (
            <div className="space-y-4">
              <div className="flex items-center gap-1.5 flex-wrap">
                {(['all', 'submitted', 'reviewing', 'resolved'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setReportFilter(st)}
                    className={`px-3 py-1.5 min-h-[36px] rounded-xl text-xs font-semibold capitalize transition-colors ${
                      reportFilter === st
                        ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>

              {loading ? (
                <p className="py-12 text-center text-xs text-slate-400">Loading reports...</p>
              ) : filteredReports.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-8 text-center">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    No reports matching "{reportFilter}"
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredReports.map((rep) => (
                    <div
                      key={rep.id}
                      className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 p-4 space-y-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-0.5 rounded-full bg-red-600/10 text-red-600 dark:text-red-400 text-xs font-bold">
                              {rep.reason}
                            </span>
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase ${
                                rep.status === 'resolved'
                                  ? 'bg-green-600/15 text-green-600 dark:text-green-400'
                                  : rep.status === 'reviewing'
                                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                                  : 'bg-blue-600/15 text-blue-600 dark:text-blue-400'
                              }`}
                            >
                              {rep.status}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-1">
                            Reported by:{' '}
                            <strong className="text-slate-800 dark:text-slate-200">
                              {rep.reporter?.full_name || rep.reporter_id}
                            </strong>{' '}
                            ({rep.reporter?.email || 'user'}) &middot;{' '}
                            {new Date(rep.created_at).toLocaleString()}
                          </p>
                          {rep.reported_user && (
                            <p className="text-xs text-slate-500">
                              Reported user:{' '}
                              <strong className="text-red-600 dark:text-red-400">
                                {rep.reported_user.full_name} ({rep.reported_user.email})
                              </strong>
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap">
                          {(['submitted', 'reviewing', 'resolved'] as const).map((nextSt) => (
                            <button
                              key={nextSt}
                              type="button"
                              disabled={updatingReportId === rep.id || rep.status === nextSt}
                              onClick={() => handleUpdateReportStatus(rep, nextSt)}
                              className={`px-3 py-1.5 min-h-[36px] rounded-xl text-xs font-semibold capitalize transition-colors ${
                                rep.status === nextSt
                                  ? 'bg-blue-600 text-white opacity-60 cursor-default'
                                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-blue-600'
                              }`}
                            >
                              Mark {nextSt}
                            </button>
                          ))}
                        </div>
                      </div>

                      {rep.details && (
                        <p className="text-xs text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200/60 dark:border-slate-800 whitespace-pre-wrap">
                          {rep.details}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* =============================================================== */}
          {/* TAB 2: SUPPORT TICKETS                                          */}
          {/* =============================================================== */}
          {activeTab === 'tickets' && (
            <div className="space-y-4">
              <div className="flex items-center gap-1.5 flex-wrap">
                {(['all', 'open', 'in_progress', 'closed'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setTicketFilter(st)}
                    className={`px-3 py-1.5 min-h-[36px] rounded-xl text-xs font-semibold capitalize transition-colors ${
                      ticketFilter === st
                        ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {st.replace('_', ' ')}
                  </button>
                ))}
              </div>

              {loading ? (
                <p className="py-12 text-center text-xs text-slate-400">
                  Loading support tickets...
                </p>
              ) : filteredTickets.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-8 text-center">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    No support tickets matching "{ticketFilter.replace('_', ' ')}"
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredTickets.map((tk) => (
                    <div
                      key={tk.id}
                      className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 p-4 space-y-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-0.5 rounded-full bg-blue-600/10 text-blue-600 dark:text-blue-400 text-[11px] font-bold uppercase">
                              {tk.category}
                            </span>
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase ${
                                tk.status === 'closed'
                                  ? 'bg-green-600/15 text-green-600 dark:text-green-400'
                                  : tk.status === 'in_progress'
                                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                                  : 'bg-blue-600/15 text-blue-600 dark:text-blue-400'
                              }`}
                            >
                              {tk.status.replace('_', ' ')}
                            </span>
                          </div>
                          <h4 className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                            {tk.subject}
                          </h4>
                          <p className="text-xs text-slate-500">
                            From:{' '}
                            <strong className="text-slate-800 dark:text-slate-200">
                              {tk.user?.full_name || tk.user_id}
                            </strong>{' '}
                            ({tk.user?.email || 'OSA User'}) &middot;{' '}
                            {new Date(tk.created_at).toLocaleString()}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap">
                          {(['open', 'in_progress', 'closed'] as const).map((nextSt) => (
                            <button
                              key={nextSt}
                              type="button"
                              disabled={updatingTicketId === tk.id || tk.status === nextSt}
                              onClick={() => handleUpdateTicketStatus(tk, nextSt)}
                              className={`px-3 py-1.5 min-h-[36px] rounded-xl text-xs font-semibold capitalize transition-colors ${
                                tk.status === nextSt
                                  ? 'bg-blue-600 text-white opacity-60 cursor-default'
                                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-blue-600'
                              }`}
                            >
                              {nextSt.replace('_', ' ')}
                            </button>
                          ))}
                        </div>
                      </div>

                      <p className="text-xs text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200/60 dark:border-slate-800 whitespace-pre-wrap">
                        {tk.message}
                      </p>

                      {/* Admin Direct Reply Notification */}
                      <div className="flex items-center gap-2 pt-1">
                        <input
                          type="text"
                          value={replyTextMap[tk.id] || ''}
                          onChange={(e) =>
                            setReplyTextMap((prev) => ({ ...prev, [tk.id]: e.target.value }))
                          }
                          placeholder="Send official support reply notification to user..."
                          className="flex-1 min-w-0 px-3.5 py-2 min-h-[38px] rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                        />
                        <button
                          type="button"
                          disabled={
                            updatingTicketId === tk.id || !(replyTextMap[tk.id] || '').trim()
                          }
                          onClick={() => handleSendTicketReplyNotification(tk)}
                          className="px-3.5 py-2 min-h-[38px] rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Reply</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* =============================================================== */}
          {/* TAB 3: USERS & MODERATION                                       */}
          {/* =============================================================== */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search users by name, username, or email..."
                  className="w-full pl-10 pr-4 py-2.5 min-h-[42px] rounded-2xl bg-slate-100 dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
                {users.map((u) => (
                  <div
                    key={u.id}
                    className="p-3.5 flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <OSAAvatar
                        name={u.full_name}
                        avatarUrl={u.avatar_url}
                        size="sm"
                        isOnline={u.is_online}
                        showOnlineStatus
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                            {u.full_name}
                          </p>
                          {u.is_suspended && (
                            <span className="px-2 py-0.5 rounded-full bg-red-600/15 text-red-600 dark:text-red-400 text-[10px] font-bold uppercase">
                              Suspended
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 truncate">
                          {u.email} {u.username ? `· @${u.username}` : ''}
                        </p>
                        <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3" />
                          <span>Joined {new Date(u.created_at).toLocaleDateString()}</span>
                        </p>
                      </div>
                    </div>

                    {u.id !== currentUser.id && (
                      <button
                        type="button"
                        disabled={updatingUserId === u.id}
                        onClick={() => handleToggleUserSuspension(u)}
                        className={`px-3.5 py-2 min-h-[38px] rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 transition-colors ${
                          u.is_suspended
                            ? 'bg-green-600 hover:bg-green-700 text-white'
                            : 'bg-red-600/10 hover:bg-red-600 text-red-600 hover:text-white'
                        }`}
                      >
                        <Ban className="w-3.5 h-3.5" />
                        <span>{u.is_suspended ? 'Restore User' : 'Suspend User'}</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
