import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Bell,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  Database,
  FileText,
  Globe,
  HardDrive,
  HelpCircle,
  Info,
  KeyRound,
  Lock,
  LogOut,
  Mail,
  MessageSquare,
  Moon,
  Music,
  Palette,
  Phone,
  Shield,
  Sun,
  Trash2,
  User,
} from 'lucide-react';
import { OSAAvatar } from '../components/OSAAvatar';
import { PWAInstallButton } from '../components/PWAInstallButton';
import { RingtoneSelectorList } from '../components/RingtoneSelector';
import { TranslationDictionary } from '../lib/i18n';
import {
  getRingtoneById,
  getSelectedRingtoneId,
  OSARingtoneId,
  RINGTONE_CHANGED_EVENT,
  stopRingtonePreview,
} from '../services/ringtoneService';
import {
  CHAT_TRANSLATION_LANG_CHANGED_EVENT,
  CHAT_TRANSLATION_LANGUAGES,
  ChatTranslationLanguageCode,
  getChatTranslationLanguage,
  getTranslationLanguageOption,
  saveChatTranslationLanguage,
} from '../services/translationService';
import {
  blockUser,
  deleteUserAccount,
  deleteUserUploadedAttachment,
  fetchBlockedUsers,
  fetchMySubmittedReports,
  fetchMySupportTickets,
  fetchUserStorageAttachments,
  formatBytes,
  markAllNotificationsRead,
  searchUsers,
  submitSupportTicket,
  unblockUser,
  updateMyProfile,
  updatePrivacySettings,
  updateUserEmail,
  updateUserPassword,
  uploadProfileAvatar,
} from '../services/osaService';
import {
  BlockRecord,
  LanguageCode,
  MessageAttachment,
  NotificationItem,
  PrivacySettings,
  Profile,
  ReportRecord,
  SupportTicket,
  ThemeMode,
  VisibilityScope,
} from '../types/osa';

export type SettingsSubPage =
  | 'main'
  | 'profile'
  | 'account'
  | 'privacy'
  | 'calls'
  | 'calls_ringtone'
  | 'notifications'
  | 'appearance'
  | 'language'
  | 'language_translation'
  | 'storage'
  | 'blocked'
  | 'help'
  | 'help_faq'
  | 'help_guide'
  | 'help_contact'
  | 'help_problem'
  | 'about'
  | 'about_terms'
  | 'about_privacy'
  | 'about_contact';

interface SettingsPageProps {
  currentUser: Profile;
  privacy: PrivacySettings | null;
  notifications: NotificationItem[];
  theme: ThemeMode;
  language: LanguageCode;
  isAdmin?: boolean;
  adminRole?: string | null;
  onProfileUpdated: (profile: Profile) => void;
  onPrivacyUpdated: (priv: PrivacySettings) => void;
  onThemeChange: (theme: ThemeMode) => void;
  onLanguageChange: (lang: LanguageCode) => void;
  onNotificationsChanged: () => void;
  onOpenSupabaseConfig: () => void;
  onOpenAdminPanel?: () => void;
  onOpenPermissionSetup?: () => void;
  onLogout: () => void;
  t: TranslationDictionary;
}

const VISIBILITY_OPTIONS: { value: VisibilityScope; labelKey: 'everyone' | 'contacts' | 'nobody' }[] = [
  { value: 'everyone', labelKey: 'everyone' },
  { value: 'contacts', labelKey: 'contacts' },
  { value: 'nobody', labelKey: 'nobody' },
];

export const SettingsPage: React.FC<SettingsPageProps> = ({
  currentUser,
  privacy,
  notifications,
  theme,
  language,
  isAdmin = false,
  adminRole = null,
  onProfileUpdated,
  onPrivacyUpdated,
  onThemeChange,
  onLanguageChange,
  onNotificationsChanged,
  onOpenSupabaseConfig,
  onOpenAdminPanel,
  onOpenPermissionSetup,
  onLogout,
  t,
}) => {
  const [subPage, setSubPage] = useState<SettingsSubPage>('main');
  const [statusBanner, setStatusBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );
  const [selectedRingtoneId, setSelectedRingtoneId] = useState<OSARingtoneId>(() =>
    getSelectedRingtoneId(currentUser.id)
  );
  const [chatTranslationLang, setChatTranslationLang] =
    useState<ChatTranslationLanguageCode>(() =>
      getChatTranslationLanguage(currentUser.id, language)
    );

  useEffect(() => {
    setSelectedRingtoneId(getSelectedRingtoneId(currentUser.id));
    setChatTranslationLang(getChatTranslationLanguage(currentUser.id, language));
    const handleRingtoneChanged = () => {
      setSelectedRingtoneId(getSelectedRingtoneId(currentUser.id));
    };
    const handleTranslationLangChanged = () => {
      setChatTranslationLang(getChatTranslationLanguage(currentUser.id, language));
    };
    window.addEventListener(RINGTONE_CHANGED_EVENT, handleRingtoneChanged);
    window.addEventListener(
      CHAT_TRANSLATION_LANG_CHANGED_EVENT,
      handleTranslationLangChanged
    );
    return () => {
      window.removeEventListener(RINGTONE_CHANGED_EVENT, handleRingtoneChanged);
      window.removeEventListener(
        CHAT_TRANSLATION_LANG_CHANGED_EVENT,
        handleTranslationLangChanged
      );
      stopRingtonePreview();
    };
  }, [currentUser.id, language]);

  useEffect(() => {
    stopRingtonePreview();
  }, [subPage]);

  // Profile Edit state
  const [fullName, setFullName] = useState(currentUser.full_name);
  const [about, setAbout] = useState(currentUser.about || 'Available on OSA');
  const [username, setUsername] = useState(currentUser.username || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  // Account state
  const [newEmail, setNewEmail] = useState(currentUser.email);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [accountLoading, setAccountLoading] = useState(false);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // Privacy state
  const [savingPrivacy, setSavingPrivacy] = useState(false);

  // Storage state
  const [storageItems, setStorageItems] = useState<MessageAttachment[]>([]);
  const [loadingStorage, setLoadingStorage] = useState(false);
  const [confirmClearStorage, setConfirmClearStorage] = useState(false);

  // Blocked contacts state
  const [blockedUsers, setBlockedUsers] = useState<BlockRecord[]>([]);
  const [loadingBlocks, setLoadingBlocks] = useState(false);
  const [blockSearchQuery, setBlockSearchQuery] = useState('');
  const [blockSearchResults, setBlockSearchResults] = useState<Profile[]>([]);

  // Help & Support state
  const [supportSubject, setSupportSubject] = useState('');
  const [supportMessage, setSupportMessage] = useState('');
  const [submittingSupport, setSubmittingSupport] = useState(false);
  const [myTickets, setMyTickets] = useState<SupportTicket[]>([]);
  const [myReports, setMyReports] = useState<ReportRecord[]>([]);

  useEffect(() => {
    setFullName(currentUser.full_name);
    setAbout(currentUser.about || 'Available on OSA');
    setUsername(currentUser.username || '');
    setNewEmail(currentUser.email);
  }, [currentUser]);

  useEffect(() => {
    setStatusBanner(null);
    if (subPage === 'storage') {
      setLoadingStorage(true);
      fetchUserStorageAttachments(currentUser.id)
        .then((items) => setStorageItems(items))
        .catch(() => {})
        .finally(() => setLoadingStorage(false));
    } else if (subPage === 'blocked') {
      loadBlockedContacts();
    } else if (subPage === 'help_contact' || subPage === 'help_problem') {
      fetchMySupportTickets(currentUser.id)
        .then((tickets) => setMyTickets(tickets))
        .catch(() => {});
      fetchMySubmittedReports(currentUser.id)
        .then((reps) => setMyReports(reps))
        .catch(() => {});
    }
  }, [subPage, currentUser.id]);

  const loadBlockedContacts = async () => {
    setLoadingBlocks(true);
    try {
      const list = await fetchBlockedUsers(currentUser.id);
      setBlockedUsers(list);
    } catch {
      // Ignore
    } finally {
      setLoadingBlocks(false);
    }
  };

  // Profile handlers
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setSavingProfile(true);
    setStatusBanner(null);
    try {
      const publicUrl = await uploadProfileAvatar(currentUser.id, file);
      const updated = await updateMyProfile(currentUser.id, { avatar_url: publicUrl });
      onProfileUpdated(updated);
      setStatusBanner({ type: 'success', text: 'Profile photo updated in Supabase Storage.' });
    } catch (err) {
      setStatusBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to upload photo.',
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setStatusBanner({ type: 'error', text: 'Full name cannot be empty.' });
      return;
    }
    setSavingProfile(true);
    setStatusBanner(null);
    try {
      const updated = await updateMyProfile(currentUser.id, {
        full_name: fullName.trim(),
        about: about.trim(),
        username: username.trim() || null,
      });
      onProfileUpdated(updated);
      setStatusBanner({ type: 'success', text: 'OSA profile saved to Supabase.' });
    } catch (err) {
      setStatusBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update profile.',
      });
    } finally {
      setSavingProfile(false);
    }
  };

  // Account handlers
  const handleUpdateEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setAccountLoading(true);
    setStatusBanner(null);
    try {
      await updateUserEmail(newEmail, currentUser.id);
      setStatusBanner({
        type: 'success',
        text: 'Email update requested via Supabase Auth. Check your inbox to confirm.',
      });
    } catch (err) {
      setStatusBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update email.',
      });
    } finally {
      setAccountLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setStatusBanner({ type: 'error', text: 'Password must be at least 6 characters.' });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setStatusBanner({ type: 'error', text: 'Passwords do not match.' });
      return;
    }
    setAccountLoading(true);
    setStatusBanner(null);
    try {
      await updateUserPassword(newPassword);
      setNewPassword('');
      setConfirmNewPassword('');
      setStatusBanner({ type: 'success', text: 'Password updated successfully.' });
    } catch (err) {
      setStatusBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update password.',
      });
    } finally {
      setAccountLoading(false);
    }
  };

  const handleConfirmAccountDelete = async () => {
    if (deleteConfirmText.trim().toUpperCase() !== 'OSA') {
      setStatusBanner({ type: 'error', text: 'Please type OSA to confirm permanent deletion.' });
      return;
    }
    setAccountLoading(true);
    try {
      await deleteUserAccount(currentUser.id);
      onLogout();
    } catch (err) {
      setStatusBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Account deletion failed.',
      });
      setAccountLoading(false);
    }
  };

  // Privacy handler
  const handlePrivacyFieldUpdate = async (
    updates: Partial<PrivacySettings>
  ) => {
    setSavingPrivacy(true);
    setStatusBanner(null);
    try {
      const updated = await updatePrivacySettings(currentUser.id, updates);
      onPrivacyUpdated(updated);
      setStatusBanner({ type: 'success', text: 'Privacy settings saved to Supabase.' });
    } catch (err) {
      setStatusBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not save privacy settings.',
      });
    } finally {
      setSavingPrivacy(false);
    }
  };

  // Storage handlers
  const handleDeleteStorageItem = async (att: MessageAttachment) => {
    try {
      await deleteUserUploadedAttachment(att, currentUser.id);
      setStorageItems((prev) => prev.filter((i) => i.id !== att.id));
      setStatusBanner({ type: 'success', text: `Deleted ${att.file_name} from Supabase Storage.` });
    } catch (err) {
      setStatusBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not delete file.',
      });
    }
  };

  const handleClearAllUploadedMedia = async () => {
    setLoadingStorage(true);
    try {
      for (const item of storageItems) {
        await deleteUserUploadedAttachment(item, currentUser.id);
      }
      setStorageItems([]);
      setConfirmClearStorage(false);
      setStatusBanner({ type: 'success', text: 'All uploaded media & files cleaned up.' });
    } catch (err) {
      setStatusBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Cleanup failed.',
      });
    } finally {
      setLoadingStorage(false);
    }
  };

  // Block handlers
  const handleUnblock = async (blockedId: string) => {
    try {
      await unblockUser(currentUser.id, blockedId);
      setBlockedUsers((prev) => prev.filter((b) => b.blocked_id !== blockedId));
      setStatusBanner({ type: 'success', text: 'Contact unblocked.' });
    } catch (err) {
      setStatusBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not unblock user.',
      });
    }
  };

  const handleSearchToBlock = async (q: string) => {
    setBlockSearchQuery(q);
    if (!q.trim()) {
      setBlockSearchResults([]);
      return;
    }
    const res = await searchUsers(q, currentUser.id);
    setBlockSearchResults(res);
  };

  const handleBlockFromSettings = async (targetUser: Profile) => {
    try {
      await blockUser(currentUser.id, targetUser.id);
      setBlockSearchQuery('');
      setBlockSearchResults([]);
      await loadBlockedContacts();
      setStatusBanner({ type: 'success', text: `${targetUser.full_name} has been blocked.` });
    } catch (err) {
      setStatusBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to block user.',
      });
    }
  };

  // Support ticket submit
  const handleSupportSubmit = async (
    e: React.FormEvent,
    category: 'support' | 'bug'
  ) => {
    e.preventDefault();
    if (!supportSubject.trim() || !supportMessage.trim()) {
      setStatusBanner({ type: 'error', text: 'Please fill out both subject and details.' });
      return;
    }
    setSubmittingSupport(true);
    setStatusBanner(null);
    try {
      const ticket = await submitSupportTicket({
        userId: currentUser.id,
        category,
        subject: supportSubject,
        message: supportMessage,
      });
      setMyTickets((prev) => [ticket, ...prev]);
      setSupportSubject('');
      setSupportMessage('');
      setStatusBanner({
        type: 'success',
        text: 'Your request has been saved to OSA Support in Supabase.',
      });
    } catch (err) {
      setStatusBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to submit support request.',
      });
    } finally {
      setSubmittingSupport(false);
    }
  };

  const renderSubHeader = (title: string, backTarget: SettingsSubPage = 'main') => (
    <div className="sticky top-0 z-20 -mx-4 px-4 py-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 mb-4">
      <button
        type="button"
        onClick={() => setSubPage(backTarget)}
        className="w-10 h-10 rounded-full flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <ArrowLeft className="w-5 h-5" />
      </button>
      <h2 className="text-base font-bold text-slate-900 dark:text-white">{title}</h2>
    </div>
  );

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Fixed Top Profile Bar on Main Settings Screen */}
      {subPage === 'main' && (
        <div className="shrink-0 px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 z-10">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setSubPage('profile')}
              className="flex items-center gap-3.5 text-left min-w-0 flex-1"
            >
              <OSAAvatar
                name={currentUser.full_name}
                avatarUrl={currentUser.avatar_url}
                size="lg"
                isOnline={currentUser.is_online}
                showOnlineStatus
              />
              <div className="min-w-0">
                <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
                  {currentUser.full_name}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {currentUser.email}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300 truncate mt-0.5">
                  {currentUser.about || 'Available on OSA'}
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setSubPage('profile')}
              className="px-3.5 py-2 min-h-[40px] rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 text-xs font-semibold shrink-0"
            >
              {t.editProfile}
            </button>
          </div>
        </div>
      )}

      <div className={`flex-1 min-h-0 overflow-y-auto px-4 pb-6 ${subPage === 'main' ? 'pt-4' : 'pt-0'}`}>
      {statusBanner && (
        <div
          className={`mt-3 mb-4 rounded-2xl px-4 py-3 text-xs flex items-center justify-between border ${
            statusBanner.type === 'success'
              ? 'bg-green-50 dark:bg-green-950/50 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
              : 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
          }`}
        >
          <span className="flex items-center gap-2">
            {statusBanner.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
            {statusBanner.text}
          </span>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="font-bold ml-2"
          >
            &times;
          </button>
        </div>
      )}

      {/* ================================================================= */}
      {/* MAIN SETTINGS MENU                                                */}
      {/* ================================================================= */}
      {subPage === 'main' && (
        <div className="space-y-4 pb-2">
          <PWAInstallButton />

          {onOpenPermissionSetup && (
            <button
              type="button"
              onClick={onOpenPermissionSetup}
              className="w-full rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 p-4 flex items-center justify-between gap-3 shadow-xs transition-colors text-left"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-emerald-600/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <Shield className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    Device Permissions &amp; Remote Access
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    Microphone, Camera, GPS Location, Notifications &amp; Remote Access
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4.5 h-4.5 text-slate-400 shrink-0" />
            </button>
          )}

          {isAdmin && onOpenAdminPanel && (
            <button
              type="button"
              onClick={onOpenAdminPanel}
              className="w-full rounded-3xl bg-blue-600 hover:bg-blue-700 text-white p-4 flex items-center justify-between gap-3 shadow-md shadow-blue-600/20 transition-colors text-left"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
                  <Shield className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold truncate">OSA Admin C-Panel</p>
                    <span className="px-2 py-0.5 rounded-full bg-white/20 text-[10px] font-bold uppercase">
                      {adminRole || 'admin'}
                    </span>
                  </div>
                  <p className="text-xs text-blue-100 truncate">
                    Review reports, support tickets &amp; user moderation
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4.5 h-4.5 text-white shrink-0" />
            </button>
          )}

          {/* Settings Navigation Groups */}
          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
            {[
              { id: 'profile', icon: User, label: t.profile, sub: 'Photo, name, about, online status' },
              { id: 'account', icon: KeyRound, label: t.account, sub: 'Email, password, delete account' },
              { id: 'privacy', icon: Lock, label: t.privacy, sub: 'Last seen, photo, read receipts' },
              {
                id: 'calls',
                icon: Phone,
                label: t.calls || 'Calls',
                sub: `Ringtone · ${getRingtoneById(selectedRingtoneId).name}`,
              },
              { id: 'notifications', icon: Bell, label: t.notifications, sub: 'Alerts, unread, push notifications' },
              { id: 'appearance', icon: Palette, label: t.appearance, sub: `Current: ${theme.toUpperCase()}` },
              {
                id: 'language',
                icon: Globe,
                label: t.language,
                sub: `${language === 'bn' ? 'বাংলা' : 'English'} · Chat Translation: ${
                  getTranslationLanguageOption(chatTranslationLang).nativeName
                }`,
              },
              { id: 'storage', icon: HardDrive, label: t.storageAndData, sub: 'Media, files & storage cleanup' },
              { id: 'blocked', icon: Ban, label: t.blockedContacts, sub: 'Manage blocked OSA users' },
              { id: 'help', icon: HelpCircle, label: t.helpAndSupport, sub: 'FAQ, guide, contact support, report bug' },
              { id: 'about', icon: Info, label: t.aboutOSA, sub: 'Version 1.0.0, terms, privacy policy' },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSubPage(item.id as SettingsSubPage)}
                  className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-2xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {item.label}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {item.sub}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4.5 h-4.5 text-slate-400 shrink-0" />
                </button>
              );
            })}

            <button
              type="button"
              onClick={onOpenSupabaseConfig}
              className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-emerald-600/10 text-emerald-600 flex items-center justify-center shrink-0">
                  <Database className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    Supabase Connection
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    Configure Supabase URL &amp; Anon Key
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4.5 h-4.5 text-slate-400 shrink-0" />
            </button>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* 27. PROFILE PAGE                                                  */}
      {/* ================================================================= */}
      {subPage === 'profile' && (
        <div className="space-y-5">
          {renderSubHeader(t.profile)}

          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-6 flex flex-col items-center text-center">
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarUpload}
              className="hidden"
            />
            <div className="relative">
              <OSAAvatar
                name={currentUser.full_name}
                avatarUrl={currentUser.avatar_url}
                size="xl"
                isOnline={currentUser.is_online}
                showOnlineStatus
              />
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                className="absolute bottom-0 right-0 w-9 h-9 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center border-2 border-white dark:border-slate-900 shadow"
                title={t.changePhoto}
              >
                <Camera className="w-4 h-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              className="mt-3 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
            >
              {t.changePhoto}
            </button>
          </div>

          <form
            onSubmit={handleSaveProfile}
            className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-4"
          >
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {t.changeName} ({t.fullName})
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="w-full px-4 py-2.5 min-h-[44px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="osa_username"
                className="w-full px-4 py-2.5 min-h-[44px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {t.changeAbout}
              </label>
              <textarea
                rows={3}
                value={about}
                onChange={(e) => setAbout(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {t.email}
              </label>
              <p className="text-xs text-slate-500">{currentUser.email}</p>
            </div>

            <button
              type="submit"
              disabled={savingProfile}
              className="w-full py-3 min-h-[46px] rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold"
            >
              {savingProfile ? 'Saving...' : t.saveChanges}
            </button>
          </form>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSubPage('privacy')}
              className="flex-1 py-3 min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200"
            >
              {t.privacy}
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="flex-1 py-3 min-h-[44px] rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
            >
              {t.logout}
            </button>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* 28. ACCOUNT SETTINGS                                              */}
      {/* ================================================================= */}
      {subPage === 'account' && (
        <div className="space-y-5">
          {renderSubHeader(t.account)}

          {/* Account Information */}
          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-2 text-xs">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2">
              Account Information
            </h3>
            <p className="text-slate-500">
              User ID: <span className="font-mono text-slate-800 dark:text-slate-200">{currentUser.id}</span>
            </p>
            <p className="text-slate-500">
              Email: <span className="font-semibold text-slate-800 dark:text-slate-200">{currentUser.email}</span>
            </p>
            <p className="text-slate-500">
              Joined OSA:{' '}
              <span className="font-mono-num text-slate-800 dark:text-slate-200">
                {new Date(currentUser.created_at).toLocaleDateString()}
              </span>
            </p>
          </div>

          {/* Change Email */}
          <form
            onSubmit={handleUpdateEmail}
            className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-3"
          >
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Mail className="w-4 h-4 text-blue-600" />
              <span>{t.changeEmail}</span>
            </h3>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
              className="w-full px-4 py-2.5 min-h-[44px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
            />
            <button
              type="submit"
              disabled={accountLoading}
              className="w-full py-2.5 min-h-[44px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
            >
              {t.changeEmail}
            </button>
          </form>

          {/* Change Password */}
          <form
            onSubmit={handleUpdatePassword}
            className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-3"
          >
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Lock className="w-4 h-4 text-blue-600" />
              <span>{t.changePassword}</span>
            </h3>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t.newPassword}
              className="w-full px-4 py-2.5 min-h-[44px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
            />
            <input
              type="password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              placeholder={t.confirmPassword}
              className="w-full px-4 py-2.5 min-h-[44px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
            />
            <button
              type="submit"
              disabled={accountLoading}
              className="w-full py-2.5 min-h-[44px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
            >
              {t.updatePassword}
            </button>
          </form>

          {/* Delete Account */}
          <div className="rounded-3xl bg-red-50/60 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 p-5 space-y-3">
            <h3 className="text-sm font-bold text-red-600 dark:text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              <span>{t.deleteAccount}</span>
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Permanently deletes your OSA profile, messages, statuses, and account via server-side RPC/Edge Function without exposing any service-role key.
            </p>
            {!confirmDeleteAccount ? (
              <button
                type="button"
                onClick={() => setConfirmDeleteAccount(true)}
                className="w-full py-2.5 min-h-[44px] rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
              >
                {t.deleteAccount}
              </button>
            ) : (
              <div className="space-y-2.5 pt-2">
                <p className="text-xs font-semibold text-red-700 dark:text-red-300">
                  Type <strong>OSA</strong> below to confirm permanent account deletion:
                </p>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="Type OSA"
                  className="w-full px-3.5 py-2 min-h-[42px] rounded-xl bg-white dark:bg-slate-900 border border-red-300 dark:border-red-800 text-sm"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmDeleteAccount(false);
                      setDeleteConfirmText('');
                    }}
                    className="flex-1 py-2.5 min-h-[42px] rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold"
                  >
                    {t.cancel}
                  </button>
                  <button
                    type="button"
                    disabled={accountLoading}
                    onClick={handleConfirmAccountDelete}
                    className="flex-1 py-2.5 min-h-[42px] rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
                  >
                    {accountLoading ? 'Deleting...' : t.confirm}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* 23. PRIVACY SETTINGS                                              */}
      {/* ================================================================= */}
      {subPage === 'privacy' && privacy && (
        <div className="space-y-5">
          {renderSubHeader(t.privacy)}

          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-5">
            {(
              [
                { key: 'last_seen_visibility', label: t.lastSeen },
                { key: 'profile_photo_visibility', label: t.profilePhoto },
                { key: 'about_visibility', label: t.aboutInfo },
                { key: 'status_visibility', label: t.statusVisibility },
              ] as const
            ).map((field) => (
              <div key={field.key}>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-2">
                  {field.label}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {VISIBILITY_OPTIONS.map((opt) => {
                    const active = privacy[field.key] === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={savingPrivacy}
                        onClick={() =>
                          handlePrivacyFieldUpdate({ [field.key]: opt.value })
                        }
                        className={`py-2 min-h-[40px] rounded-xl text-xs font-semibold border transition-colors ${
                          active
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {t[opt.labelKey]}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
              {(
                [
                  { key: 'read_receipts', label: t.readReceipts },
                  { key: 'typing_indicator', label: t.typingIndicator },
                  { key: 'online_status', label: t.onlineStatus },
                ] as const
              ).map((toggle) => {
                const checked = Boolean(privacy[toggle.key]);
                return (
                  <div
                    key={toggle.key}
                    className="flex items-center justify-between py-2"
                  >
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      {toggle.label}
                    </span>
                    <button
                      type="button"
                      disabled={savingPrivacy}
                      onClick={() =>
                        handlePrivacyFieldUpdate({ [toggle.key]: !checked })
                      }
                      className={`w-12 h-7 rounded-full p-1 transition-colors ${
                        checked ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                      }`}
                    >
                      <span
                        className={`block w-5 h-5 rounded-full bg-white transition-transform ${
                          checked ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* 26. NOTIFICATIONS SETTINGS                                        */}
      {/* ================================================================= */}
      {subPage === 'notifications' && (
        <div className="space-y-5">
          {renderSubHeader(t.notifications)}

          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  Browser Push Notifications
                </p>
                <p className="text-xs text-slate-500">
                  Status:{' '}
                  {'Notification' in window ? Notification.permission : 'unsupported'}
                </p>
              </div>
              {'Notification' in window && (
                <button
                  type="button"
                  onClick={async () => {
                    const perm = await Notification.requestPermission();
                    setStatusBanner({
                      type: perm === 'granted' ? 'success' : 'error',
                      text: `Browser push permission: ${perm}`,
                    });
                  }}
                  className="px-4 py-2 min-h-[40px] rounded-xl bg-blue-600 text-white text-xs font-semibold"
                >
                  Request Permission
                </button>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-600 dark:text-slate-300">
                Unread in-app notifications:{' '}
                <strong>{notifications.filter((n) => !n.is_read).length}</strong>
              </span>
              <button
                type="button"
                onClick={async () => {
                  await markAllNotificationsRead(currentUser.id);
                  onNotificationsChanged();
                  setStatusBanner({
                    type: 'success',
                    text: 'All notifications marked as read.',
                  });
                }}
                className="px-3.5 py-2 min-h-[38px] rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-blue-600"
              >
                {t.markAllRead}
              </button>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  Incoming Call Ringtone
                </p>
                <p className="text-xs text-slate-500">
                  Selected: {getRingtoneById(selectedRingtoneId).name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSubPage('calls_ringtone')}
                className="px-3.5 py-2 min-h-[38px] rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Music className="w-3.5 h-3.5" />
                <span>Ringtone</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* 29B. CALLS & RINGTONE SETTINGS (Settings -> Calls -> Ringtone)    */}
      {/* ================================================================= */}
      {subPage === 'calls' && (
        <div className="space-y-5">
          {renderSubHeader(t.calls || 'Calls', 'main')}

          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
            <button
              type="button"
              onClick={() => setSubPage('calls_ringtone')}
              className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <Music className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    Ringtone
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {getRingtoneById(selectedRingtoneId).name} &middot;{' '}
                    {getRingtoneById(selectedRingtoneId).subtitle}
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4.5 h-4.5 text-slate-400 shrink-0" />
            </button>
          </div>

          <RingtoneSelectorList
            userId={currentUser.id}
            onRingtoneChanged={(id) => setSelectedRingtoneId(id)}
          />
        </div>
      )}

      {subPage === 'calls_ringtone' && (
        <div className="space-y-5">
          {renderSubHeader('Ringtone', 'calls')}
          <RingtoneSelectorList
            userId={currentUser.id}
            onRingtoneChanged={(id) => setSelectedRingtoneId(id)}
          />
        </div>
      )}

      {/* ================================================================= */}
      {/* 30. APPEARANCE (LIGHT / DARK / SYSTEM)                            */}
      {/* ================================================================= */}
      {subPage === 'appearance' && (
        <div className="space-y-5">
          {renderSubHeader(t.appearance)}

          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 space-y-2">
            {(
              [
                { value: 'light', label: t.lightMode, icon: Sun },
                { value: 'dark', label: t.darkMode, icon: Moon },
                { value: 'system', label: t.systemDefault, icon: Palette },
              ] as const
            ).map((opt) => {
              const Icon = opt.icon;
              const active = theme === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={async () => {
                    onThemeChange(opt.value);
                    try {
                      const updated = await updateMyProfile(currentUser.id, {
                        theme: opt.value,
                      });
                      onProfileUpdated(updated);
                    } catch {
                      // Local theme already applied
                    }
                  }}
                  className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-colors ${
                    active
                      ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400'
                      : 'border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-5 h-5" />
                    <span className="text-sm font-semibold">{opt.label}</span>
                  </div>
                  {active && <Check className="w-5 h-5" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* 31. LANGUAGE & CHAT TRANSLATION LANGUAGE                          */}
      {/* ================================================================= */}
      {subPage === 'language' && (
        <div className="space-y-5">
          {renderSubHeader(t.language)}

          {/* Navigate to dedicated Chat Translation Language sub-screen */}
          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 overflow-hidden">
            <button
              type="button"
              onClick={() => setSubPage('language_translation')}
              className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <Globe className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {language === 'bn'
                      ? 'চ্যাট অনুবাদ ভাষা (Chat Translation Language)'
                      : 'Chat Translation Language'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {getTranslationLanguageOption(chatTranslationLang).nativeName} &middot;{' '}
                    {language === 'bn'
                      ? 'ইনকামিং মেসেজ স্বয়ংক্রিয়ভাবে অনুবাদ হবে'
                      : 'Auto-translate incoming chat messages'}
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4.5 h-4.5 text-slate-400 shrink-0" />
            </button>
          </div>

          {/* App Interface Language */}
          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-1 mb-1">
              {language === 'bn' ? 'অ্যাপের ভাষা (App Language)' : 'App Interface Language'}
            </p>
            {(
              [
                { value: 'en', label: t.english },
                { value: 'bn', label: t.bengali },
              ] as const
            ).map((opt) => {
              const active = language === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={async () => {
                    onLanguageChange(opt.value);
                    if (chatTranslationLang === 'en' || chatTranslationLang === 'bn') {
                      const saved = await saveChatTranslationLanguage(
                        currentUser.id,
                        opt.value
                      );
                      setChatTranslationLang(saved);
                    }
                    try {
                      const updated = await updateMyProfile(currentUser.id, {
                        language: opt.value,
                      });
                      onProfileUpdated(updated);
                    } catch {
                      // Local language already applied
                    }
                  }}
                  className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-colors ${
                    active
                      ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400'
                      : 'border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  <span className="text-sm font-semibold">{opt.label}</span>
                  {active && <Check className="w-5 h-5" />}
                </button>
              );
            })}
          </div>

          {/* Direct Chat Translation Language Selector */}
          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 space-y-2">
            <div className="px-1 mb-1">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {language === 'bn'
                  ? 'চ্যাট অনুবাদ ভাষা (Chat Translation Language)'
                  : 'Chat Translation Language'}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {language === 'bn'
                  ? 'অন্য ব্যবহারকারীর পাঠানো বার্তা আপনার পছন্দের ভাষায় দেখানো হবে। মূল বার্তা অপরিবর্তিত থাকবে।'
                  : 'Incoming messages from other users will be displayed in your preferred language while preserving the original message.'}
              </p>
            </div>

            {CHAT_TRANSLATION_LANGUAGES.map((opt) => {
              const active = chatTranslationLang === opt.code;
              return (
                <button
                  key={opt.code}
                  type="button"
                  onClick={async () => {
                    const saved = await saveChatTranslationLanguage(
                      currentUser.id,
                      opt.code
                    );
                    setChatTranslationLang(saved);
                    setStatusBanner({
                      type: 'success',
                      text:
                        language === 'bn'
                          ? `চ্যাট অনুবাদ ভাষা নির্ধারণ করা হয়েছে: ${opt.nativeName}`
                          : `Chat Translation Language set to ${opt.nativeName}`,
                    });
                  }}
                  className={`w-full flex items-center justify-between p-3.5 rounded-2xl border transition-colors text-left ${
                    active
                      ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400'
                      : 'border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div>
                    <p className="text-sm font-semibold">{opt.nativeName}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {opt.name}
                    </p>
                  </div>
                  {active && <Check className="w-5 h-5 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {subPage === 'language_translation' && (
        <div className="space-y-5">
          {renderSubHeader('Chat Translation Language', 'language')}

          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 space-y-2">
            <div className="px-1 mb-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {language === 'bn'
                  ? 'আপনার পছন্দের চ্যাট ভাষা নির্বাচন করুন'
                  : 'Choose Your Preferred Chat Language'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                {language === 'bn'
                  ? 'যখন অন্য কোনো ব্যবহারকারী ভিন্ন ভাষায় মেসেজ পাঠাবে, OSA সেটি স্বয়ংক্রিয়ভাবে আপনার выбран ভাষায় অনুবাদ করে দেখাবে। মেসেজের নিচে "মূল বার্তা" ট্যাপ করে আসল মেসেজ দেখা যাবে।'
                  : 'When another user sends a message in a different language, OSA automatically translates it into your preferred language. You can tap "Original" under any translated message to view the original text.'}
              </p>
            </div>

            {CHAT_TRANSLATION_LANGUAGES.map((opt) => {
              const active = chatTranslationLang === opt.code;
              return (
                <button
                  key={opt.code}
                  type="button"
                  onClick={async () => {
                    const saved = await saveChatTranslationLanguage(
                      currentUser.id,
                      opt.code
                    );
                    setChatTranslationLang(saved);
                    setStatusBanner({
                      type: 'success',
                      text:
                        language === 'bn'
                          ? `চ্যাট অনুবাদ ভাষা নির্ধারণ করা হয়েছে: ${opt.nativeName}`
                          : `Chat Translation Language set to ${opt.nativeName}`,
                    });
                  }}
                  className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-colors text-left ${
                    active
                      ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400'
                      : 'border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div>
                    <p className="text-sm font-semibold">{opt.nativeName}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {opt.name}
                    </p>
                  </div>
                  {active && <Check className="w-5 h-5 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* 32. STORAGE & DATA                                                */}
      {/* ================================================================= */}
      {subPage === 'storage' && (
        <div className="space-y-5">
          {renderSubHeader(t.storageAndData)}

          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Uploaded Media &amp; Files
                </h3>
                <p className="text-xs text-slate-500">
                  {storageItems.length} file(s) &middot; Total:{' '}
                  <span className="font-mono-num font-semibold text-slate-800 dark:text-slate-200">
                    {formatBytes(
                      storageItems.reduce((sum, item) => sum + (item.file_size || 0), 0)
                    )}
                  </span>
                </p>
              </div>
              {storageItems.length > 0 && !confirmClearStorage && (
                <button
                  type="button"
                  onClick={() => setConfirmClearStorage(true)}
                  className="px-3.5 py-2 min-h-[38px] rounded-xl bg-red-600/10 text-red-600 text-xs font-semibold"
                >
                  Clean All
                </button>
              )}
            </div>

            {confirmClearStorage && (
              <div className="rounded-2xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 p-3.5 space-y-2">
                <p className="text-xs font-semibold text-red-700 dark:text-red-300">
                  Delete all {storageItems.length} uploaded files from Supabase Storage?
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmClearStorage(false)}
                    className="flex-1 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold"
                  >
                    {t.cancel}
                  </button>
                  <button
                    type="button"
                    onClick={handleClearAllUploadedMedia}
                    className="flex-1 py-2 rounded-xl bg-red-600 text-white text-xs font-semibold"
                  >
                    {t.confirm}
                  </button>
                </div>
              </div>
            )}

            {loadingStorage ? (
              <p className="py-8 text-center text-xs text-slate-400">
                Calculating storage usage...
              </p>
            ) : storageItems.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-400">
                No uploaded media or files stored in your account.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {storageItems.map((att) => (
                  <div
                    key={att.id}
                    className="py-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <a
                        href={att.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline truncate block"
                      >
                        {att.file_name}
                      </a>
                      <p className="text-[11px] text-slate-400 font-mono-num">
                        {att.file_type.toUpperCase()} &middot; {formatBytes(att.file_size)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteStorageItem(att)}
                      className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl"
                      title="Delete file"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* 24. BLOCKED CONTACTS                                              */}
      {/* ================================================================= */}
      {subPage === 'blocked' && (
        <div className="space-y-5">
          {renderSubHeader(t.blockedContacts)}

          {/* Block a user search */}
          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 space-y-3">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              {t.blockUser}
            </label>
            <input
              type="text"
              value={blockSearchQuery}
              onChange={(e) => handleSearchToBlock(e.target.value)}
              placeholder="Search user to block..."
              className="w-full px-3.5 py-2.5 min-h-[42px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
            />
            {blockSearchResults.length > 0 && (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {blockSearchResults.map((u) => (
                  <div
                    key={u.id}
                    className="py-2.5 flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <OSAAvatar name={u.full_name} avatarUrl={u.avatar_url} size="xs" />
                      <span className="text-xs font-semibold truncate">{u.full_name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleBlockFromSettings(u)}
                      className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold"
                    >
                      Block
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Current Blocked Users List */}
          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4">
            {loadingBlocks ? (
              <p className="py-8 text-center text-xs text-slate-400">
                Loading blocked contacts...
              </p>
            ) : blockedUsers.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-400">
                You have no blocked contacts on OSA.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {blockedUsers.map((blk) => (
                  <div
                    key={blk.id}
                    className="py-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <OSAAvatar
                        name={blk.blocked_profile?.full_name || 'Blocked User'}
                        avatarUrl={blk.blocked_profile?.avatar_url}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {blk.blocked_profile?.full_name || 'OSA User'}
                        </p>
                        <p className="text-xs text-slate-400 truncate">
                          {blk.blocked_profile?.email}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleUnblock(blk.blocked_id)}
                      className="px-3.5 py-2 min-h-[38px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shrink-0"
                    >
                      {t.unblockUser}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* 33. HELP & SUPPORT                                                */}
      {/* ================================================================= */}
      {subPage === 'help' && (
        <div className="space-y-4">
          {renderSubHeader(t.helpAndSupport)}
          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
            {[
              { id: 'help_faq', label: t.faq, sub: 'Answers to common OSA questions' },
              { id: 'help_guide', label: t.userGuide, sub: 'Complete guide to OSA features' },
              { id: 'help_contact', label: t.contactSupport, sub: 'Send a direct support ticket' },
              { id: 'help_problem', label: t.reportProblem, sub: 'Report a technical issue or bug' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSubPage(item.id as SettingsSubPage)}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-left"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {item.label}
                  </p>
                  <p className="text-xs text-slate-500">{item.sub}</p>
                </div>
                <ChevronRight className="w-4.5 h-4.5 text-slate-400" />
              </button>
            ))}
          </div>
        </div>
      )}

      {subPage === 'help_faq' && (
        <div className="space-y-4">
          {renderSubHeader(t.faq, 'help')}
          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-4 text-xs leading-relaxed">
            <div>
              <h4 className="font-bold text-sm text-slate-900 dark:text-white mb-1">
                1. How does OSA real-time messaging work?
              </h4>
              <p className="text-slate-600 dark:text-slate-300">
                OSA uses Supabase PostgreSQL and Supabase Realtime channels to deliver messages, typing indicators, and read receipts instantaneously across devices.
              </p>
            </div>
            <div>
              <h4 className="font-bold text-sm text-slate-900 dark:text-white mb-1">
                2. How do OSA Audio &amp; Video Calls work?
              </h4>
              <p className="text-slate-600 dark:text-slate-300">
                OSA establishes direct peer-to-peer WebRTC media streams using RTCPeerConnection and Supabase Realtime signaling with STUN/TURN support.
              </p>
            </div>
            <div>
              <h4 className="font-bold text-sm text-slate-900 dark:text-white mb-1">
                3. How long do OSA Status updates last?
              </h4>
              <p className="text-slate-600 dark:text-slate-300">
                Every text, image, or video status automatically expires 24 hours after publication.
              </p>
            </div>
          </div>
        </div>
      )}

      {subPage === 'help_guide' && (
        <div className="space-y-4">
          {renderSubHeader(t.userGuide, 'help')}
          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            <h4 className="font-bold text-sm text-slate-900 dark:text-white">
              OSA User Guide
            </h4>
            <p><strong>Starting a Chat:</strong> Tap the New Chat button on the Chats tab and search for any registered OSA user by name, username, or email.</p>
            <p><strong>Sharing Media &amp; Files:</strong> Tap the paperclip icon inside any chat to upload images, videos, audio clips, or documents to Supabase Storage.</p>
            <p><strong>Groups:</strong> Open the Groups tab to create a group, upload a group photo, and manage members as an admin.</p>
            <p><strong>Privacy &amp; Blocking:</strong> Customize who can view your last seen, profile photo, about text, and status in Settings &rarr; Privacy.</p>
          </div>
        </div>
      )}

      {(subPage === 'help_contact' || subPage === 'help_problem') && (
        <div className="space-y-4">
          {renderSubHeader(
            subPage === 'help_contact' ? t.contactSupport : t.reportProblem,
            'help'
          )}
          <form
            onSubmit={(e) =>
              handleSupportSubmit(e, subPage === 'help_contact' ? 'support' : 'bug')
            }
            className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-3"
          >
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Subject
              </label>
              <input
                type="text"
                value={supportSubject}
                onChange={(e) => setSupportSubject(e.target.value)}
                required
                placeholder="Brief summary..."
                className="w-full px-3.5 py-2.5 min-h-[42px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Message / Steps to Reproduce
              </label>
              <textarea
                rows={4}
                value={supportMessage}
                onChange={(e) => setSupportMessage(e.target.value)}
                required
                placeholder="Describe how we can help..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={submittingSupport}
              className="w-full py-3 min-h-[44px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
            >
              {submittingSupport ? 'Submitting...' : t.send}
            </button>
          </form>

          {myTickets.length > 0 && (
            <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 space-y-2">
              <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Your Submitted Tickets
              </h4>
              {myTickets.map((tk) => (
                <div
                  key={tk.id}
                  className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 dark:text-white">
                      {tk.subject}
                    </span>
                    <span className="text-[10px] uppercase font-semibold text-blue-600">
                      {tk.status}
                    </span>
                  </div>
                  <p className="text-slate-500">{tk.message}</p>
                </div>
              ))}
            </div>
          )}

          {myReports.length > 0 && (
            <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 space-y-2">
              <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Your Submitted User / Message Reports
              </h4>
              {myReports.map((rep) => (
                <div
                  key={rep.id}
                  className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 dark:text-white">
                      {rep.reason}
                    </span>
                    <span className="text-[10px] uppercase font-semibold text-blue-600">
                      {rep.status}
                    </span>
                  </div>
                  {rep.details && <p className="text-slate-500">{rep.details}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* 34. ABOUT OSA                                                     */}
      {/* ================================================================= */}
      {subPage === 'about' && (
        <div className="space-y-4">
          {renderSubHeader(t.aboutOSA)}

          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-6 text-center space-y-2">
            <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto shadow-lg shadow-blue-600/25">
              <MessageSquare className="w-8 h-8" />
            </div>
            <h3 className="font-display text-2xl font-extrabold text-slate-900 dark:text-white">
              OSA
            </h3>
            <p className="text-xs font-mono-num text-slate-500">Version 1.0.0</p>
            <p className="text-xs text-slate-600 dark:text-slate-300 max-w-xs mx-auto">
              Production-ready real-time messaging, status, group collaboration, and WebRTC audio/video calling platform.
            </p>
          </div>

          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
            <button
              type="button"
              onClick={() => setSubPage('about_terms')}
              className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-left"
            >
              <span className="text-sm font-semibold flex items-center gap-2.5">
                <FileText className="w-4 h-4 text-blue-600" />
                <span>{t.termsAndConditions}</span>
              </span>
              <ChevronRight className="w-4.5 h-4.5 text-slate-400" />
            </button>
            <button
              type="button"
              onClick={() => setSubPage('about_privacy')}
              className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-left"
            >
              <span className="text-sm font-semibold flex items-center gap-2.5">
                <Shield className="w-4 h-4 text-blue-600" />
                <span>{t.privacyPolicy}</span>
              </span>
              <ChevronRight className="w-4.5 h-4.5 text-slate-400" />
            </button>
            <button
              type="button"
              onClick={() => setSubPage('about_contact')}
              className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-left"
            >
              <span className="text-sm font-semibold flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-blue-600" />
                <span>Contact OSA</span>
              </span>
              <ChevronRight className="w-4.5 h-4.5 text-slate-400" />
            </button>
          </div>
        </div>
      )}

      {subPage === 'about_terms' && (
        <div className="space-y-4">
          {renderSubHeader(t.termsAndConditions, 'about')}
          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
              OSA Terms &amp; Conditions
            </h4>
            <p>By creating an account on OSA, you agree to communicate respectfully and abide by applicable laws. Harassment, spam, and unauthorized distribution of content are strictly prohibited.</p>
            <p>Users retain ownership of the content and files they share on OSA and may delete their messages, statuses, or entire account at any time.</p>
          </div>
        </div>
      )}

      {subPage === 'about_privacy' && (
        <div className="space-y-4">
          {renderSubHeader(t.privacyPolicy, 'about')}
          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
              OSA Privacy Policy
            </h4>
            <p>OSA protects your data using Supabase Row Level Security (RLS) policies so only authorized conversation participants can access messages and attachments.</p>
            <p>You have full granular control over your Last Seen, Profile Photo, About text, Read Receipts, Typing Indicator, and Status Visibility in Settings &rarr; Privacy.</p>
          </div>
        </div>
      )}

      {subPage === 'about_contact' && (
        <div className="space-y-4">
          {renderSubHeader('Contact OSA', 'about')}
          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-3 text-xs text-slate-600 dark:text-slate-300">
            <p className="font-bold text-sm text-slate-900 dark:text-white">
              OSA Communications Support
            </p>
            <p>Email: support@osa-messaging.app</p>
            <button
              type="button"
              onClick={() => setSubPage('help_contact')}
              className="mt-2 px-4 py-2.5 min-h-[40px] rounded-xl bg-blue-600 text-white font-semibold"
            >
              Open Support Ticket Form
            </button>
          </div>
        </div>
      )}
      </div>

      {/* Fixed Bottom Logout Bar on Main Settings Screen */}
      {subPage === 'main' && (
        <div className="shrink-0 px-4 py-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 z-10">
          <button
            type="button"
            onClick={onLogout}
            className="w-full py-3 min-h-[46px] rounded-2xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 shadow-sm transition-colors"
          >
            <LogOut className="w-4.5 h-4.5" />
            <span>{t.logout}</span>
          </button>
        </div>
      )}
    </div>
  );
};
