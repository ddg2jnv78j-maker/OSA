import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bell,
  CircleDot,
  MessageSquare,
  MessageSquarePlus,
  Phone,
  Search,
  Settings,
  Shield,
  Users,
  WifiOff,
} from 'lucide-react';
import { CallOverlay } from './components/CallOverlay';
import { NewChatModal } from './components/NewChatModal';
import { OSAAvatar } from './components/OSAAvatar';
import { PWAInstallButton } from './components/PWAInstallButton';
import { PermissionSetupModal } from './components/PermissionSetupModal';
import {
  REMOTE_LOC_ERR_PREFIX,
  REMOTE_LOC_REQ_PREFIX,
  REMOTE_LOC_RES_PREFIX,
} from './components/RemoteLocationModal';
import { SplashScreen } from './components/SplashScreen';
import { SupabaseConfigModal } from './components/SupabaseConfigModal';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { TRANSLATIONS } from './lib/i18n';
import { getSupabaseConfig, supabase } from './lib/supabase';
import { AdminPanelModal } from './pages/AdminPanelModal';
import { AuthPages, AuthScreenMode } from './pages/AuthPages';
import { CallsPage } from './pages/CallsPage';
import { ChatConversationView } from './pages/ChatConversationView';
import { GroupsPage } from './pages/GroupsPage';
import { NotificationsModal } from './pages/NotificationsModal';
import { SettingsPage } from './pages/SettingsPage';
import { StatusPage } from './pages/StatusPage';
import {
  applyThemeToDocument,
  checkIsUserAdmin,
  createNotification,
  ensureProfileAndPrivacy,
  fetchMyProfile,
  fetchPrivacyMapForUsers,
  fetchPrivacySettings,
  fetchUserChats,
  fetchUserNotifications,
  loadLanguagePreference,
  loadThemePreference,
  openOrCreateDirectChat,
  saveLanguagePreference,
  saveThemePreference,
  searchUsers,
  setUserOnlineStatus,
  signOutUser,
} from './services/osaService';
import {
  getCurrentDeviceLocation,
  getStoredPermissionStatus,
  LiveLocationPayload,
} from './services/permissionService';
import { WebRTCCallManager } from './services/webrtcService';
import {
  CallRecord,
  CallStatus,
  CallType,
  Chat,
  LanguageCode,
  MainTab,
  NotificationItem,
  PrivacySettings,
  Profile,
  ThemeMode,
} from './types/osa';

export default function App() {
  const [bootstrapping, setBootstrapping] = useState(true);
  const [authMode, setAuthMode] = useState<AuthScreenMode>('login');
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [myPrivacy, setMyPrivacy] = useState<PrivacySettings | null>(null);
  const [peerPrivacyMap, setPeerPrivacyMap] = useState<Record<string, PrivacySettings>>({});

  // Preferences
  const [theme, setTheme] = useState<ThemeMode>(() => loadThemePreference());
  const [language, setLanguage] = useState<LanguageCode>(() => loadLanguagePreference());
  const t = TRANSLATIONS[language];

  // Navigation & Active Chat
  const [activeTab, setActiveTab] = useState<MainTab>('chats');
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [chatFilter, setChatFilter] = useState<'all' | 'direct' | 'group'>('all');
  const [homeSearchQuery, setHomeSearchQuery] = useState('');
  const [directorySearchResults, setDirectorySearchResults] = useState<Profile[]>([]);

  // Modals
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [showSupabaseConfigModal, setShowSupabaseConfigModal] = useState(false);
  const [showAdminPanelModal, setShowAdminPanelModal] = useState(false);
  const [showPermissionSetupModal, setShowPermissionSetupModal] = useState(false);
  const [isFirstTimePermissionSetup, setIsFirstTimePermissionSetup] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminRole, setAdminRole] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  // WebRTC Calling & Remote Camera State
  const [activeCall, setActiveCall] = useState<CallRecord | null>(null);
  const [callPeerProfile, setCallPeerProfile] = useState<Profile | null>(null);
  const [callStatus, setCallStatus] = useState<CallStatus>('calling');
  const [callError, setCallError] = useState<string | undefined>(undefined);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isRemoteCameraCall, setIsRemoteCameraCall] = useState(false);
  const callManagerRef = useRef<WebRTCCallManager | null>(null);

  // Incoming Remote Location Request State
  const [pendingLocationReq, setPendingLocationReq] = useState<{
    requestId: string;
    requesterId: string;
    requesterName: string;
    chatId?: string | null;
  } | null>(null);
  const handledLocationReqIdsRef = useRef<Set<string>>(new Set());

  const isOnline = useOnlineStatus();

  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  const handleThemeChange = (nextTheme: ThemeMode) => {
    setTheme(nextTheme);
    saveThemePreference(nextTheme);
  };

  const handleLanguageChange = (nextLang: LanguageCode) => {
    setLanguage(nextLang);
    saveLanguagePreference(nextLang);
  };

  const refreshChatsAndNotifications = useCallback(async (uid: string) => {
    try {
      const [userChats, userNotifs] = await Promise.all([
        fetchUserChats(uid),
        fetchUserNotifications(uid),
      ]);
      setChats(userChats);
      setNotifications(userNotifs);

      const peerIds = userChats
        .map((c) => c.peer?.id)
        .filter((id): id is string => Boolean(id));
      if (peerIds.length > 0) {
        const privMap = await fetchPrivacyMapForUsers(peerIds);
        setPeerPrivacyMap(privMap);
      }
    } catch {
      // Ignore transient load error
    }
  }, []);

  const loadAuthenticatedUser = useCallback(async () => {
    const sbConfig = getSupabaseConfig();
    if (!sbConfig.isConfigured) {
      setCurrentUser(null);
      setBootstrapping(false);
      return;
    }

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        setCurrentUser(null);
        setBootstrapping(false);
        return;
      }

      const profile = await ensureProfileAndPrivacy(
        session.user.id,
        session.user.email || '',
        session.user.user_metadata?.full_name
      );
      const [priv, adminCheck] = await Promise.all([
        fetchPrivacySettings(session.user.id),
        checkIsUserAdmin(session.user.id),
      ]);

      setCurrentUser(profile);
      setMyPrivacy(priv);
      setIsAdmin(adminCheck.isAdmin);
      setAdminRole(adminCheck.role);

      if (profile.theme) handleThemeChange(profile.theme);
      if (profile.language) handleLanguageChange(profile.language);

      // Show Permission Setup screen on first-time registration / onboarding
      const permStatus = getStoredPermissionStatus(profile.id);
      let needsOnboarding = !permStatus.onboardingCompleted;
      try {
        if (localStorage.getItem('osa_needs_permission_onboarding') === 'true') {
          needsOnboarding = true;
        }
      } catch {
        // Ignore
      }
      if (needsOnboarding) {
        setIsFirstTimePermissionSetup(true);
        setShowPermissionSetupModal(true);
      }

      await setUserOnlineStatus(profile.id, true);
      await refreshChatsAndNotifications(profile.id);
    } catch {
      setCurrentUser(null);
    } finally {
      setBootstrapping(false);
    }
  }, [refreshChatsAndNotifications]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('reset_password') === 'true') {
      setAuthMode('reset');
    }

    loadAuthenticatedUser();

    const sbConfig = getSupabaseConfig();
    if (!sbConfig.isConfigured) return;

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setAuthMode('reset');
        setCurrentUser(null);
      } else if (event === 'SIGNED_OUT' || !session) {
        setCurrentUser(null);
        setIsAdmin(false);
        setAdminRole(null);
        setChats([]);
        setSelectedChatId(null);
      } else if (event === 'SIGNED_IN' && session?.user) {
        loadAuthenticatedUser();
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [loadAuthenticatedUser]);

  // Helper to respond to a Remote Location request with real GPS coordinates
  const respondWithDeviceLocation = useCallback(
    async (req: {
      requestId: string;
      requesterId: string;
      requesterName: string;
      chatId?: string | null;
    }) => {
      if (!currentUser) return;
      try {
        const pos = await getCurrentDeviceLocation();
        const locPayload: LiveLocationPayload = {
          requestId: req.requestId,
          senderId: currentUser.id,
          senderName: currentUser.full_name,
          receiverId: req.requesterId,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy || 10),
          altitude: pos.coords.altitude,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
          timestamp: new Date(pos.timestamp).toISOString(),
        };

        await createNotification({
          userId: req.requesterId,
          actorId: currentUser.id,
          type: 'system',
          title: `Live GPS from ${currentUser.full_name}`,
          body: `${REMOTE_LOC_RES_PREFIX}${JSON.stringify(locPayload)}`,
          chatId: req.chatId || null,
        });

        const rxChannel = supabase.channel(`osa-remote-loc-rx-${req.requesterId}`);
        rxChannel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await rxChannel.send({
              type: 'broadcast',
              event: 'location_response',
              payload: locPayload,
            });
            setTimeout(() => {
              supabase.removeChannel(rxChannel);
            }, 1500);
          }
        });
      } catch (err) {
        const errMsg =
          err instanceof Error
            ? err.message
            : 'Target device could not acquire GPS coordinates.';
        await createNotification({
          userId: req.requesterId,
          actorId: currentUser.id,
          type: 'system',
          title: `Location Error from ${currentUser.full_name}`,
          body: `${REMOTE_LOC_ERR_PREFIX}${JSON.stringify({ message: errMsg })}`,
          chatId: req.chatId || null,
        });
      }
    },
    [currentUser]
  );

  // Global Realtime Subscriptions for Chats, Messages, Notifications, Profiles, Remote Location & Incoming Calls
  useEffect(() => {
    if (!currentUser) return;

    const handleIncomingLocationReqRaw = (req: {
      requestId: string;
      requesterId: string;
      requesterName: string;
      chatId?: string | null;
    }) => {
      if (!req?.requestId || handledLocationReqIdsRef.current.has(req.requestId)) return;
      handledLocationReqIdsRef.current.add(req.requestId);

      const perm = getStoredPermissionStatus(currentUser.id);
      if (perm.allowRemoteLocation) {
        respondWithDeviceLocation(req);
      } else {
        setPendingLocationReq(req);
      }
    };

    const locBroadcastChannel = supabase
      .channel(`osa-remote-loc-tx-${currentUser.id}`)
      .on('broadcast', { event: 'location_request' }, ({ payload }) => {
        if (payload?.requestId && payload?.requesterId) {
          handleIncomingLocationReqRaw(payload);
        }
      })
      .subscribe();

    const globalChannel = supabase
      .channel(`osa-global-sync-${currentUser.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chats' },
        () => refreshChatsAndNotifications(currentUser.id)
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_members',
          filter: `user_id=eq.${currentUser.id}`,
        },
        () => refreshChatsAndNotifications(currentUser.id)
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => refreshChatsAndNotifications(currentUser.id)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        () => refreshChatsAndNotifications(currentUser.id)
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${currentUser.id}`,
        },
        (payload) => {
          const newNotif = payload.new as NotificationItem;

          // Intercept Remote Location Request signals
          if (newNotif.body?.startsWith(REMOTE_LOC_REQ_PREFIX)) {
            try {
              const parsed = JSON.parse(
                newNotif.body.slice(REMOTE_LOC_REQ_PREFIX.length)
              );
              handleIncomingLocationReqRaw(parsed);
            } catch {
              // Ignore
            }
            return;
          }

          // Ignore internal Remote Location Response/Error notifications from cluttering notification feed
          if (
            newNotif.body?.startsWith(REMOTE_LOC_RES_PREFIX) ||
            newNotif.body?.startsWith(REMOTE_LOC_ERR_PREFIX)
          ) {
            return;
          }

          setNotifications((prev) => [newNotif, ...prev]);
          if (
            'Notification' in window &&
            Notification.permission === 'granted' &&
            document.hidden
          ) {
            new Notification(newNotif.title || 'OSA', {
              body: newNotif.body,
              icon: `${import.meta.env.BASE_URL}pwa-192x192.png`,
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'calls',
          filter: `receiver_id=eq.${currentUser.id}`,
        },
        async (payload) => {
          const incoming = payload.new as CallRecord;
          if (incoming.status !== 'calling' && incoming.status !== 'ringing') return;
          if (activeCall) return; // Already in a call

          const callerProfile = await fetchMyProfile(incoming.caller_id);
          setCallPeerProfile(callerProfile);
          setActiveCall(incoming);
          setCallError(undefined);
          setIsRemoteCameraCall(false);

          const manager = new WebRTCCallManager(currentUser.id, {
            onLocalStream: setLocalStream,
            onRemoteStream: setRemoteStream,
            onRemoteModeDetected: (isRemote) => setIsRemoteCameraCall(isRemote),
            onStatusChange: (status, errMsg) => {
              setCallStatus(status);
              if (errMsg) setCallError(errMsg);
              if (
                status === 'ended' ||
                status === 'rejected' ||
                status === 'missed' ||
                status === 'failed'
              ) {
                setTimeout(() => {
                  setActiveCall(null);
                  setIsRemoteCameraCall(false);
                  callManagerRef.current = null;
                }, 1800);
              }
            },
          });
          callManagerRef.current = manager;

          // Wait briefly so the caller's SDP offer signal is committed in `call_signals`
          setTimeout(async () => {
            const isRemote = await manager.prepareIncomingCall(incoming);
            setIsRemoteCameraCall(isRemote);
            const perm = getStoredPermissionStatus(currentUser.id);
            if (isRemote && perm.allowRemoteCamera) {
              try {
                await manager.acceptIncomingCall(incoming);
              } catch {
                // If auto-accept fails, user can still tap Accept on the overlay
              }
            }
          }, 500);
        }
      )
      .subscribe();

    const handleBeforeUnload = () => {
      setUserOnlineStatus(currentUser.id, false);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      supabase.removeChannel(locBroadcastChannel);
      supabase.removeChannel(globalChannel);
    };
  }, [currentUser, activeCall, refreshChatsAndNotifications, respondWithDeviceLocation]);

  // Live user directory search when typing in the Home Search bar
  useEffect(() => {
    if (!currentUser || !homeSearchQuery.trim()) {
      setDirectorySearchResults([]);
      return;
    }
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const users = await searchUsers(homeSearchQuery, currentUser.id);
        if (active) setDirectorySearchResults(users);
      } catch {
        // Ignore
      }
    }, 220);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [homeSearchQuery, currentUser]);

  // Initiate Outgoing WebRTC Audio, Video, or Remote Camera Call
  const handleStartCall = async (
    peer: Profile,
    callType: CallType,
    chatId?: string | null,
    isRemoteCamera = false
  ) => {
    if (!currentUser) return;

    setCallPeerProfile(peer);
    setCallError(undefined);
    setCallStatus('calling');
    setIsRemoteCameraCall(Boolean(isRemoteCamera));

    const effectiveCallType: CallType = isRemoteCamera ? 'video' : callType;

    const tempRecord: CallRecord = {
      id: 'pending',
      chat_id: chatId || null,
      caller_id: currentUser.id,
      receiver_id: peer.id,
      call_type: effectiveCallType,
      status: 'calling',
      started_at: new Date().toISOString(),
      answered_at: null,
      ended_at: null,
      duration_seconds: 0,
      created_at: new Date().toISOString(),
      caller: currentUser,
      receiver: peer,
    };
    setActiveCall(tempRecord);

    const manager = new WebRTCCallManager(currentUser.id, {
      onLocalStream: setLocalStream,
      onRemoteStream: setRemoteStream,
      onRemoteModeDetected: (isRemote) => setIsRemoteCameraCall(isRemote),
      onStatusChange: (status, errMsg) => {
        setCallStatus(status);
        if (errMsg) setCallError(errMsg);
        if (
          status === 'ended' ||
          status === 'rejected' ||
          status === 'missed' ||
          status === 'failed'
        ) {
          setTimeout(() => {
            setActiveCall(null);
            setIsRemoteCameraCall(false);
            callManagerRef.current = null;
          }, 2000);
        }
      },
    });
    callManagerRef.current = manager;

    try {
      const createdRecord = await manager.startOutgoingCall({
        receiverId: peer.id,
        receiverName: peer.full_name,
        chatId: chatId || null,
        callType: effectiveCallType,
        isRemoteCamera,
      });
      setActiveCall(createdRecord);
    } catch {
      // Handled in status callback
    }
  };

  const handleAcceptCall = async () => {
    if (!callManagerRef.current || !activeCall) return;
    try {
      await callManagerRef.current.acceptIncomingCall(activeCall);
    } catch {
      // Handled in status callback
    }
  };

  const handleRejectCall = async () => {
    if (!callManagerRef.current || !activeCall) return;
    await callManagerRef.current.rejectIncomingCall(activeCall);
  };

  const handleEndCall = async () => {
    if (!callManagerRef.current) {
      setActiveCall(null);
      return;
    }
    await callManagerRef.current.endCall();
  };

  const handleLogout = async () => {
    if (!currentUser) return;
    await signOutUser(currentUser.id);
    setCurrentUser(null);
    setChats([]);
    setSelectedChatId(null);
  };

  if (bootstrapping) {
    return <SplashScreen />;
  }

  if (!currentUser || authMode === 'reset') {
    return (
      <>
        <AuthPages
          initialMode={authMode}
          onAuthenticated={() => {
            setAuthMode('login');
            loadAuthenticatedUser();
          }}
          onOpenSupabaseConfig={() => setShowSupabaseConfigModal(true)}
          t={t}
        />
        <SupabaseConfigModal
          isOpen={showSupabaseConfigModal}
          onClose={() => setShowSupabaseConfigModal(false)}
          onSaved={() => loadAuthenticatedUser()}
        />
      </>
    );
  }

  const selectedChat = chats.find((c) => c.id === selectedChatId) || null;
  const unreadNotifCount = notifications.filter((n) => !n.is_read).length;
  const totalUnreadChats = chats.reduce(
    (sum, c) => sum + (c.my_membership?.unread_count || 0),
    0
  );

  // Filter chats for Home / Chat list
  const visibleChats = chats.filter((c) => {
    if (chatFilter === 'direct' && c.type !== 'direct') return false;
    if (chatFilter === 'group' && c.type !== 'group') return false;
    if (!homeSearchQuery.trim()) return true;
    const q = homeSearchQuery.trim().toLowerCase();
    const title =
      c.type === 'group' ? c.group?.name || '' : c.peer?.full_name || '';
    const lastMsg = c.last_message_text || '';
    return title.toLowerCase().includes(q) || lastMsg.toLowerCase().includes(q);
  });

  return (
    <div className="h-screen w-full flex flex-col md:flex-row bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden">
      {/* Offline Mode Banner */}
      {!isOnline && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full bg-amber-500 px-4 py-1.5 text-xs font-semibold text-white shadow-lg">
          <WifiOff className="w-3.5 h-3.5" />
          <span>Offline — Reconnecting when network returns</span>
        </div>
      )}

      {/* Desktop Left Navigation Rail */}
      <aside className="hidden md:flex flex-col items-center justify-between w-20 py-5 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shrink-0">
        <div className="flex flex-col items-center gap-6">
          <button
            type="button"
            onClick={() => {
              setActiveTab('chats');
              setSelectedChatId(null);
            }}
            className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-display font-extrabold text-sm tracking-wider shadow-md shadow-blue-600/25"
          >
            OSA
          </button>

          <nav className="flex flex-col items-center gap-2">
            {(
              [
                { id: 'chats', icon: MessageSquare, label: t.chats, badge: totalUnreadChats },
                { id: 'status', icon: CircleDot, label: t.status, badge: 0 },
                { id: 'groups', icon: Users, label: t.groups, badge: 0 },
                { id: 'calls', icon: Phone, label: t.calls, badge: 0 },
                { id: 'settings', icon: Settings, label: t.settings, badge: 0 },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`relative w-12 h-12 rounded-2xl flex flex-col items-center justify-center transition-colors ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                  title={item.label}
                >
                  <Icon className="w-5 h-5" />
                  {item.badge > 0 && (
                    <span className="absolute -top-1 -right-1 px-1.5 min-w-[18px] h-[18px] rounded-full bg-green-500 text-white text-[10px] font-mono-num font-bold flex items-center justify-center">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="flex flex-col items-center gap-3">
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowAdminPanelModal(true)}
              className="w-11 h-11 rounded-2xl flex items-center justify-center bg-blue-600/10 text-blue-600 dark:text-blue-400 hover:bg-blue-600 hover:text-white transition-colors"
              title="OSA Admin C-Panel"
            >
              <Shield className="w-5 h-5" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowNotificationsModal(true)}
            className="relative w-11 h-11 rounded-2xl flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            title={t.notifications}
          >
            <Bell className="w-5 h-5" />
            {unreadNotifCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-red-500" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            title={currentUser.full_name}
          >
            <OSAAvatar
              name={currentUser.full_name}
              avatarUrl={currentUser.avatar_url}
              size="sm"
              isOnline={currentUser.is_online}
              showOnlineStatus
            />
          </button>
        </div>
      </aside>

      {/* Left / Primary Column (Home Chat List or Active Tab on Mobile) */}
      <div
        className={`flex-col h-full w-full md:w-96 lg:w-[410px] md:border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 shrink-0 ${
          selectedChat ? 'hidden md:flex' : 'flex'
        }`}
      >
        {/* Top App Bar */}
        <header className="sticky top-0 z-20 flex items-center justify-between px-4 h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shrink-0">
          {/* Zone 1: Single Brand Wordmark */}
          <span className="font-display text-xl font-extrabold tracking-wider text-blue-600 dark:text-blue-400">
            OSA
          </span>

          {/* Zone 3: Primary Header Actions */}
          <div className="flex items-center gap-1.5">
            <PWAInstallButton compact />

            <button
              type="button"
              onClick={() => setShowNewChatModal(true)}
              className="w-10 h-10 rounded-full flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title={t.newChat}
            >
              <MessageSquarePlus className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={() => setShowNotificationsModal(true)}
              className="relative w-10 h-10 rounded-full flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title={t.notifications}
            >
              <Bell className="w-5 h-5" />
              {unreadNotifCount > 0 && (
                <span className="absolute top-1.5 right-1.5 px-1 min-w-[16px] h-4 rounded-full bg-red-600 text-white text-[10px] font-mono-num font-bold flex items-center justify-center">
                  {unreadNotifCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className="ml-1 rounded-full focus:outline-none"
              title={t.profile}
            >
              <OSAAvatar
                name={currentUser.full_name}
                avatarUrl={currentUser.avatar_url}
                size="xs"
                isOnline={currentUser.is_online}
                showOnlineStatus
              />
            </button>
          </div>
        </header>

        {/* Active Section Body */}
        <main className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {activeTab === 'chats' && (
            <div className="flex flex-col h-full overflow-hidden">
              {/* Search Bar + Filter Tabs */}
              <div className="p-3.5 space-y-2.5 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800/80">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={homeSearchQuery}
                    onChange={(e) => setHomeSearchQuery(e.target.value)}
                    placeholder={t.searchPlaceholder}
                    className="w-full pl-10 pr-4 py-2.5 min-h-[44px] rounded-2xl bg-slate-100 dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                {/* Interactive Filter Controls */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                    {(
                      [
                        { id: 'all', label: 'All' },
                        { id: 'direct', label: 'Direct' },
                        { id: 'group', label: t.groups },
                      ] as const
                    ).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setChatFilter(f.id)}
                        className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                          chatFilter === f.id
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                            : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowNewChatModal(true)}
                    className="px-3.5 py-1.5 min-h-[36px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <MessageSquarePlus className="w-3.5 h-3.5" />
                    <span>{t.newChat}</span>
                  </button>
                </div>
              </div>

              {/* Conversation List */}
              <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/70">
                {visibleChats.length === 0 && directorySearchResults.length === 0 ? (
                  <div className="py-16 px-6 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-blue-600/10 text-blue-600 flex items-center justify-center mx-auto mb-3">
                      <MessageSquare className="w-7 h-7" />
                    </div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
                      {t.noChatsYet}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto mb-5">
                      {t.startNewConversation}
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowNewChatModal(true)}
                      className="px-5 py-2.5 min-h-[44px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-2"
                    >
                      <MessageSquarePlus className="w-4 h-4" />
                      <span>{t.newChat}</span>
                    </button>
                  </div>
                ) : (
                  <>
                    {visibleChats.map((chat) => {
                      const isGroup = chat.type === 'group';
                      const peer = chat.peer;
                      const peerPriv = peer ? peerPrivacyMap[peer.id] : undefined;
                      const showOnline =
                        !isGroup && peer && (peerPriv ? peerPriv.online_status : true);
                      const hidePhoto =
                        !isGroup && peerPriv?.profile_photo_visibility === 'nobody';
                      const title = isGroup
                        ? chat.group?.name || 'OSA Group'
                        : peer?.full_name || 'OSA User';
                      const avatarUrl = isGroup
                        ? chat.group?.avatar_url
                        : peer?.avatar_url;
                      const unread = chat.my_membership?.unread_count || 0;
                      const isSelected = chat.id === selectedChatId;

                      return (
                        <button
                          key={chat.id}
                          type="button"
                          onClick={() => setSelectedChatId(chat.id)}
                          className={`w-full flex items-center gap-3.5 px-4 py-3.5 transition-colors text-left ${
                            isSelected
                              ? 'bg-blue-50/80 dark:bg-blue-950/35'
                              : 'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                          }`}
                        >
                          <OSAAvatar
                            name={title}
                            avatarUrl={avatarUrl}
                            size="md"
                            isOnline={Boolean(showOnline && peer?.is_online)}
                            showOnlineStatus={Boolean(showOnline)}
                            isGroup={isGroup}
                            hidePhotoForPrivacy={hidePhoto}
                          />

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                                {title}
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
                                {chat.last_message_text || 'Start chatting on OSA'}
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

                    {/* Global Directory Search Results when searching */}
                    {homeSearchQuery.trim() && directorySearchResults.length > 0 && (
                      <div className="p-3 bg-slate-50 dark:bg-slate-950">
                        <p className="text-[11px] font-bold text-slate-400 uppercase px-2 mb-2">
                          OSA Users Directory
                        </p>
                        {directorySearchResults.map((u) => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={async () => {
                              const cid = await openOrCreateDirectChat(
                                currentUser.id,
                                u.id
                              );
                              await refreshChatsAndNotifications(currentUser.id);
                              setSelectedChatId(cid);
                              setHomeSearchQuery('');
                            }}
                            className="w-full flex items-center gap-3 p-2.5 rounded-2xl hover:bg-white dark:hover:bg-slate-900 text-left"
                          >
                            <OSAAvatar
                              name={u.full_name}
                              avatarUrl={u.avatar_url}
                              size="sm"
                              isOnline={u.is_online}
                              showOnlineStatus
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                {u.full_name}
                              </p>
                              <p className="text-[11px] text-slate-400 truncate">
                                {u.email}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {activeTab === 'status' && <StatusPage currentUser={currentUser} t={t} />}

          {activeTab === 'groups' && (
            <GroupsPage
              currentUser={currentUser}
              chats={chats}
              onOpenChat={(chatId) => {
                setSelectedChatId(chatId);
                setActiveTab('chats');
              }}
              onGroupsUpdated={() => refreshChatsAndNotifications(currentUser.id)}
              t={t}
            />
          )}

          {activeTab === 'calls' && (
            <CallsPage
              currentUser={currentUser}
              onStartCall={handleStartCall}
              t={t}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsPage
              currentUser={currentUser}
              privacy={myPrivacy}
              notifications={notifications}
              theme={theme}
              language={language}
              isAdmin={isAdmin}
              adminRole={adminRole}
              onProfileUpdated={(updated) => setCurrentUser(updated)}
              onPrivacyUpdated={(updated) => setMyPrivacy(updated)}
              onThemeChange={handleThemeChange}
              onLanguageChange={handleLanguageChange}
              onNotificationsChanged={() => refreshChatsAndNotifications(currentUser.id)}
              onOpenSupabaseConfig={() => setShowSupabaseConfigModal(true)}
              onOpenAdminPanel={() => setShowAdminPanelModal(true)}
              onOpenPermissionSetup={() => {
                setIsFirstTimePermissionSetup(false);
                setShowPermissionSetupModal(true);
              }}
              onLogout={handleLogout}
              t={t}
            />
          )}
        </main>

        {/* Functional 5-Tab Mobile Bottom Navigation */}
        <nav className="md:hidden grid grid-cols-5 items-center h-16 pb-safe bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 shrink-0">
          {(
            [
              { id: 'chats', icon: MessageSquare, label: t.chats, badge: totalUnreadChats },
              { id: 'status', icon: CircleDot, label: t.status, badge: 0 },
              { id: 'groups', icon: Users, label: t.groups, badge: 0 },
              { id: 'calls', icon: Phone, label: t.calls, badge: 0 },
              { id: 'settings', icon: Settings, label: t.settings, badge: 0 },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`relative flex flex-col items-center justify-center min-h-[48px] transition-colors ${
                  isActive
                    ? 'text-blue-600 dark:text-blue-400 font-bold'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <div className="relative">
                  <Icon className="w-5 h-5" />
                  {item.badge > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 px-1 min-w-[16px] h-4 rounded-full bg-green-500 text-white text-[10px] font-mono-num font-bold flex items-center justify-center">
                      {item.badge}
                    </span>
                  )}
                </div>
                <span className="text-[10px] tracking-tight mt-1 truncate max-w-[64px]">
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Right / Active Conversation Pane */}
      <div
        className={`flex-1 h-full min-w-0 ${
          selectedChat ? 'flex' : 'hidden md:flex'
        }`}
      >
        {selectedChat ? (
          <ChatConversationView
            chat={selectedChat}
            allChats={chats}
            currentUser={currentUser}
            myPrivacy={myPrivacy}
            peerPrivacy={
              selectedChat.peer ? peerPrivacyMap[selectedChat.peer.id] || null : null
            }
            onBack={() => setSelectedChatId(null)}
            onStartCall={(peer, callType, cid, isRemoteCamera) =>
              handleStartCall(peer, callType, cid, isRemoteCamera)
            }
            onChatUpdated={() => refreshChatsAndNotifications(currentUser.id)}
            t={t}
          />
        ) : (
          <div className="hidden md:flex flex-col items-center justify-center w-full h-full bg-slate-100/60 dark:bg-slate-900/40 p-8 text-center select-none">
            <div className="w-20 h-20 rounded-3xl bg-blue-600 text-white flex items-center justify-center mb-4 shadow-xl shadow-blue-600/20">
              <MessageSquare className="w-10 h-10" />
            </div>
            <h2 className="font-display text-2xl font-extrabold text-slate-900 dark:text-white mb-2">
              OSA Real-Time Messaging
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mb-6">
              Select a conversation from the left or start a new chat to send real-time messages, files, and WebRTC audio/video calls.
            </p>
            <button
              type="button"
              onClick={() => setShowNewChatModal(true)}
              className="px-5 py-3 min-h-[44px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold inline-flex items-center gap-2 shadow-sm"
            >
              <MessageSquarePlus className="w-4.5 h-4.5" />
              <span>{t.newChat}</span>
            </button>
          </div>
        )}
      </div>

      {/* Modals & Overlays */}
      <NewChatModal
        isOpen={showNewChatModal}
        onClose={() => setShowNewChatModal(false)}
        currentUserId={currentUser.id}
        onChatOpened={async (chatId) => {
          await refreshChatsAndNotifications(currentUser.id);
          setSelectedChatId(chatId);
          setActiveTab('chats');
        }}
      />

      <NotificationsModal
        isOpen={showNotificationsModal}
        onClose={() => setShowNotificationsModal(false)}
        userId={currentUser.id}
        notifications={notifications}
        onRefresh={() => refreshChatsAndNotifications(currentUser.id)}
        onOpenChat={(chatId) => {
          setSelectedChatId(chatId);
          setActiveTab('chats');
        }}
        t={t}
      />

      <SupabaseConfigModal
        isOpen={showSupabaseConfigModal}
        onClose={() => setShowSupabaseConfigModal(false)}
        onSaved={() => loadAuthenticatedUser()}
      />

      {isAdmin && (
        <AdminPanelModal
          isOpen={showAdminPanelModal}
          onClose={() => setShowAdminPanelModal(false)}
          currentUser={currentUser}
          adminRole={adminRole}
        />
      )}

      <PermissionSetupModal
        isOpen={showPermissionSetupModal}
        userId={currentUser.id}
        isFirstTimeOnboarding={isFirstTimePermissionSetup}
        onComplete={() => {
          setShowPermissionSetupModal(false);
          setIsFirstTimePermissionSetup(false);
          try {
            localStorage.removeItem('osa_needs_permission_onboarding');
          } catch {
            // Ignore
          }
        }}
        onClose={() => {
          setShowPermissionSetupModal(false);
          setIsFirstTimePermissionSetup(false);
        }}
      />

      {/* Manual Consent Prompt when allowRemoteLocation is false */}
      {pendingLocationReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Remote Location Request
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              <strong className="text-slate-900 dark:text-white">
                {pendingLocationReq.requesterName}
              </strong>{' '}
              is requesting your current live GPS location on OSA.
            </p>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={async () => {
                  const req = pendingLocationReq;
                  setPendingLocationReq(null);
                  await createNotification({
                    userId: req.requesterId,
                    actorId: currentUser.id,
                    type: 'system',
                    title: 'Location Request Declined',
                    body: `${REMOTE_LOC_ERR_PREFIX}${JSON.stringify({
                      message: `${currentUser.full_name} declined the location request.`,
                    })}`,
                    chatId: req.chatId || null,
                  });
                }}
                className="flex-1 py-2.5 min-h-[42px] rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Decline
              </button>
              <button
                type="button"
                onClick={async () => {
                  const req = pendingLocationReq;
                  setPendingLocationReq(null);
                  await respondWithDeviceLocation(req);
                }}
                className="flex-1 py-2.5 min-h-[42px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
              >
                Allow &amp; Share GPS
              </button>
            </div>
          </div>
        </div>
      )}

      {activeCall && (
        <CallOverlay
          callRecord={activeCall}
          currentUser={currentUser}
          peerProfile={callPeerProfile}
          callStatus={callStatus}
          errorMessage={callError}
          localStream={localStream}
          remoteStream={remoteStream}
          isRemoteCamera={isRemoteCameraCall}
          onAccept={handleAcceptCall}
          onReject={handleRejectCall}
          onEnd={handleEndCall}
          onToggleMute={(muted) => callManagerRef.current?.toggleMute(muted)}
          onToggleCamera={(enabled) => callManagerRef.current?.toggleCamera(enabled)}
          onSwitchCamera={() => callManagerRef.current?.switchCamera()}
          t={t}
        />
      )}
    </div>
  );
}
