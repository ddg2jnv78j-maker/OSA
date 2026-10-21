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
  ShoppingBag,
  Sparkles,
  Users,
  WifiOff,
} from 'lucide-react';
import { CallOverlay } from './components/CallOverlay';
import { AppUpdateModal } from './components/AppUpdateModal';
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
import { DealsPage } from './pages/DealsPage';
import { AgentWorkbench } from './components/AgentWorkbench';
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
  markChatAsRead,
  openOrCreateDirectChat,
  isEmailVerificationInProgress,
  saveLanguagePreference,
  saveThemePreference,
  searchUsers,
  sendTextMessage,
  setEmailVerificationInProgress,
  setUserOnlineStatus,
  signOutUser,
} from './services/osaService';
import {
  checkNativePermissions,
  getCurrentDeviceLocation,
  getStoredPermissionStatus,
  LiveLocationPayload,
  requestAllOSAPermissions,
  requestCameraPermission,
  requestMicrophonePermission,
  syncPermissionsFromSupabase,
} from './services/permissionService';
import {
  formatLastSeenText,
  getProfileLastSeenIso,
  isProfileTrulyOnline,
  PresenceManager,
  subscribeToPresenceUpdates,
} from './services/presenceService';
import {
  checkNativeAppUpdate,
  detectRuntimePlatform,
  endNativeOngoingCall,
  initializeNativeMobileBridge,
  isNativeBackgroundAudioCallActive,
  notifyNativeIncomingRingingStopped,
  peekNativePendingIntentPayload,
  setNativeCallAudioRoute,
  setNativeCallMuteState,
} from './services/nativeMobileBridge';
import {
  dismissIncomingCallSystemNotification,
  ensureUserPushSubscription,
  reportActiveChatForPush,
  showBackgroundSystemNotification,
  syncNotificationPreferencesFromSupabase,
} from './services/pushNotificationService';
import {
  RCAM_SIG_PREFIX,
  RemoteCameraSessionManager,
  RemoteCameraSignalPayload,
} from './services/remoteCameraService';
import {
  startIncomingCallRingtone,
  stopAllRingtoneAudio,
  stopCallerRingbackTone,
  stopIncomingCallRingtone,
  syncUserRingtoneFromSupabase,
  unlockCallerRingbackAudio,
} from './services/ringtoneService';
import {
  getChatTranslationLanguage,
  saveChatTranslationLanguage,
  syncChatTranslationLanguageFromSupabase,
} from './services/translationService';
import { WebRTCCallManager } from './services/webrtcService';
import {
  CallRecord,
  CallStatus,
  CallType,
  Chat,
  LanguageCode,
  MainTab,
  Message,
  NotificationItem,
  PrivacySettings,
  Profile,
  ThemeMode,
} from './types/osa';

function inspectInitialRecoveryUrl(): {
  isRecoveryMode: boolean;
  isVerificationCallback: boolean;
  recoveryError: string;
  verificationError: string;
  tokenHash: string;
  callbackType: 'recovery' | 'signup' | 'email' | '';
} {
  if (typeof window === 'undefined') {
    return {
      isRecoveryMode: false,
      isVerificationCallback: false,
      recoveryError: '',
      verificationError: '',
      tokenHash: '',
      callbackType: '',
    };
  }
  const rawHash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  const hashParams = new URLSearchParams(rawHash);
  const searchParams = new URLSearchParams(window.location.search);
  const pathname = (window.location.pathname || '/').toLowerCase().replace(/\/+$/, '') || '/';

  const typeParam = (hashParams.get('type') || searchParams.get('type') || '').toLowerCase();
  const authParam = (searchParams.get('auth') || hashParams.get('auth') || '').toLowerCase();
  const isResetFlag =
    searchParams.get('reset_password') === 'true' ||
    hashParams.get('reset_password') === 'true' ||
    authParam === 'reset' ||
    pathname === '/reset-password';
  const isVerifyFlag =
    searchParams.get('verify_email') === 'true' ||
    hashParams.get('verify_email') === 'true' ||
    authParam === 'verify' ||
    pathname === '/verify-email';
  const tokenHash = (searchParams.get('token_hash') || hashParams.get('token_hash') || '').trim();

  const errorCode = (hashParams.get('error_code') || searchParams.get('error_code') || '').toLowerCase();
  const errorParam = (hashParams.get('error') || searchParams.get('error') || '').toLowerCase();
  const errorDesc = (
    hashParams.get('error_description') ||
    searchParams.get('error_description') ||
    ''
  )
    .replace(/\+/g, ' ')
    .trim();

  const isExplicitSignupVerify =
    typeParam === 'signup' || typeParam === 'email' || isVerifyFlag;
  const isExplicitRecovery =
    typeParam === 'recovery' || isResetFlag;

  let recoveryError = '';
  let verificationError = '';

  if (errorCode || errorParam) {
    const isExpiredOrInvalid =
      errorCode === 'otp_expired' ||
      errorDesc.toLowerCase().includes('expired') ||
      errorDesc.toLowerCase().includes('invalid');

    if (isExplicitSignupVerify) {
      verificationError = isExpiredOrInvalid
        ? 'This email verification link is invalid or has expired. Please request a new verification email or enter your verification code.'
        : errorDesc ||
          'Unable to verify email confirmation link. Please request a new verification email.';
    } else {
      recoveryError = isExpiredOrInvalid
        ? 'This password reset link is invalid or has expired. Please request a new password reset email.'
        : errorDesc ||
          'Unable to verify password reset link. Please request a new password reset email.';
    }
  }

  const isVerificationCallback = isExplicitSignupVerify || Boolean(verificationError);
  const isRecoveryMode =
    !isVerificationCallback && (isExplicitRecovery || Boolean(recoveryError));

  const callbackType: 'recovery' | 'signup' | 'email' | '' =
    typeParam === 'recovery'
      ? 'recovery'
      : typeParam === 'email'
      ? 'email'
      : isVerificationCallback
      ? 'signup'
      : isRecoveryMode
      ? 'recovery'
      : '';

  return {
    isRecoveryMode,
    isVerificationCallback,
    recoveryError,
    verificationError,
    tokenHash,
    callbackType,
  };
}

const INITIAL_RECOVERY_STATE = inspectInitialRecoveryUrl();

interface InitialDeepAction {
  callId: string | null;
  callAction: string | null;
  callType: CallType;
  callerId: string | null;
  callerName: string | null;
  chatId: string | null;
  senderId: string | null;
  senderName: string | null;
  isCallLaunch: boolean;
  isSameChatLaunch: boolean;
}

function inspectInitialDeepAction(): InitialDeepAction {
  if (typeof window === 'undefined') {
    return {
      callId: null,
      callAction: null,
      callType: 'audio',
      callerId: null,
      callerName: null,
      chatId: null,
      senderId: null,
      senderName: null,
      isCallLaunch: false,
      isSameChatLaunch: false,
    };
  }

  const searchParams = new URLSearchParams(window.location.search);
  const nativePayload = peekNativePendingIntentPayload();

  // Check path-based /chat/:id or /call/:id if present
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const pathChatId =
    pathParts[0] === 'chat' && pathParts[1] ? decodeURIComponent(pathParts[1]) : null;
  const pathCallId =
    pathParts[0] === 'call' && pathParts[1] ? decodeURIComponent(pathParts[1]) : null;

  const actionParam = (
    searchParams.get('action') ||
    nativePayload?.notificationAction ||
    ''
  ).trim();
  const callAction = (
    searchParams.get('callAction') ||
    nativePayload?.callAction ||
    (actionParam === 'accept' || actionParam === 'reject' || actionParam === 'end' || actionParam === 'open'
      ? actionParam
      : '')
  ).trim() || null;

  const callId = (
    searchParams.get('callId') ||
    pathCallId ||
    nativePayload?.callId ||
    ''
  ).trim() || null;

  const rawCallType = (
    searchParams.get('callType') ||
    nativePayload?.callType ||
    'audio'
  )
    .trim()
    .toLowerCase();
  const callType: CallType = rawCallType === 'video' ? 'video' : 'audio';

  const callerId = (
    searchParams.get('callerId') ||
    nativePayload?.callerId ||
    ''
  ).trim() || null;

  const callerName = (
    searchParams.get('callerName') ||
    nativePayload?.callerName ||
    ''
  ).trim() || null;

  const chatId = (
    searchParams.get('chatId') ||
    searchParams.get('conversationId') ||
    pathChatId ||
    nativePayload?.chatId ||
    nativePayload?.conversationId ||
    ''
  ).trim() || null;

  const senderId = (
    searchParams.get('senderId') ||
    nativePayload?.senderId ||
    ''
  ).trim() || null;

  const senderName = (
    searchParams.get('senderName') ||
    ''
  ).trim() || null;

  const isCallLaunch = Boolean(
    callId &&
      actionParam !== 'same_chat' &&
      callAction !== 'reject' &&
      callAction !== 'end'
  );
  const isSameChatLaunch = Boolean(
    !isCallLaunch && !callId && (chatId || senderId || actionParam === 'same_chat')
  );

  return {
    callId,
    callAction,
    callType,
    callerId,
    callerName,
    chatId,
    senderId,
    senderName,
    isCallLaunch,
    isSameChatLaunch,
  };
}

const INITIAL_DEEP_ACTION = inspectInitialDeepAction();

export default function App() {
  const [bootstrapping, setBootstrapping] = useState(true);
  const [authMode, setAuthMode] = useState<AuthScreenMode>(
    INITIAL_RECOVERY_STATE.isRecoveryMode
      ? 'reset'
      : INITIAL_RECOVERY_STATE.isVerificationCallback && INITIAL_RECOVERY_STATE.verificationError
      ? 'verify'
      : 'login'
  );
  const [recoveryError, setRecoveryError] = useState<string>(
    INITIAL_RECOVERY_STATE.verificationError || INITIAL_RECOVERY_STATE.recoveryError
  );
  const [authSuccessMessage, setAuthSuccessMessage] = useState<string>('');
  const [verifiedEmailHint, setVerifiedEmailHint] = useState<string>('');
  const isRecoveryModeRef = useRef<boolean>(INITIAL_RECOVERY_STATE.isRecoveryMode);
  const isVerificationCallbackRef = useRef<boolean>(
    INITIAL_RECOVERY_STATE.isVerificationCallback
  );
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
  const [selectedChatId, setSelectedChatId] = useState<string | null>(
    INITIAL_DEEP_ACTION.isSameChatLaunch ? INITIAL_DEEP_ACTION.chatId : null
  );
  const [resolvingSameChat, setResolvingSameChat] = useState<boolean>(
    INITIAL_DEEP_ACTION.isSameChatLaunch
  );
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

  // WebRTC Audio & Video Calling State — pre-seeded if launched directly from an Incoming Call notification
  const [activeCall, setActiveCall] = useState<CallRecord | null>(() => {
    if (!INITIAL_DEEP_ACTION.isCallLaunch || !INITIAL_DEEP_ACTION.callId) return null;
    const nowIso = new Date().toISOString();
    return {
      id: INITIAL_DEEP_ACTION.callId,
      chat_id: INITIAL_DEEP_ACTION.chatId,
      caller_id: INITIAL_DEEP_ACTION.callerId || 'caller',
      receiver_id: 'me',
      call_type: INITIAL_DEEP_ACTION.callType,
      status: INITIAL_DEEP_ACTION.callAction === 'accept' ? 'accepted' : 'ringing',
      started_at: nowIso,
      answered_at: INITIAL_DEEP_ACTION.callAction === 'accept' ? nowIso : null,
      ended_at: null,
      duration_seconds: 0,
      created_at: nowIso,
    };
  });
  const [callPeerProfile, setCallPeerProfile] = useState<Profile | null>(() => {
    if (!INITIAL_DEEP_ACTION.isCallLaunch) return null;
    const nowIso = new Date().toISOString();
    return {
      id: INITIAL_DEEP_ACTION.callerId || 'caller',
      full_name: INITIAL_DEEP_ACTION.callerName || 'Incoming Call',
      username: 'caller',
      email: '',
      avatar_url: null,
      about: '',
      phone: null,
      language: 'en',
      theme: 'dark',
      is_online: true,
      last_seen: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    };
  });
  const [callStatus, setCallStatus] = useState<CallStatus>(() =>
    INITIAL_DEEP_ACTION.isCallLaunch
      ? INITIAL_DEEP_ACTION.callAction === 'accept'
        ? 'accepted'
        : 'ringing'
      : 'calling'
  );
  const [callError, setCallError] = useState<string | undefined>(undefined);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const callManagerRef = useRef<WebRTCCallManager | null>(null);
  const activeCallRef = useRef<CallRecord | null>(activeCall);
  activeCallRef.current = activeCall;
  const inFlightCallResumeRef = useRef<string | null>(null);

  // Separate Remote Camera Streamer State (never opens normal Video Call UI)
  const remoteCameraStreamerRef = useRef<RemoteCameraSessionManager | null>(null);
  const [pendingRemoteCameraReq, setPendingRemoteCameraReq] =
    useState<RemoteCameraSignalPayload | null>(null);
  const handledRemoteCameraSessionsRef = useRef<Set<string>>(new Set());

  // Incoming Remote Location Request State
  const [pendingLocationReq, setPendingLocationReq] = useState<{
    requestId: string;
    requesterId: string;
    requesterName: string;
    chatId?: string | null;
  } | null>(null);
  const handledLocationReqIdsRef = useRef<Set<string>>(new Set());
  const presenceManagerRef = useRef<PresenceManager | null>(null);
  const [, setPresenceTick] = useState(0);

  const isOnline = useOnlineStatus();
  const [showAppUpdateModal, setShowAppUpdateModal] = useState(false);

  useEffect(() => {
    const unsub = subscribeToPresenceUpdates(() => {
      setPresenceTick((n) => n + 1);
    });
    const timer = window.setInterval(() => {
      setPresenceTick((n) => n + 1);
    }, 15000);
    return () => {
      unsub();
      window.clearInterval(timer);
    };
  }, []);

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
    const currentTrans = getChatTranslationLanguage(currentUser?.id, nextLang);
    if (currentTrans === 'en' || currentTrans === 'bn') {
      saveChatTranslationLanguage(currentUser?.id, nextLang).catch(() => {});
    }
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

  // Present incoming Audio or Video Call UI and optionally auto-accept if user clicked ACCEPT on notification
  const presentIncomingCall = useCallback(
    async (incoming: CallRecord, uid: string, autoAccept = false) => {
      if (!incoming || !uid) return;
      const currentActive = activeCallRef.current;
      if (currentActive && currentActive.id === incoming.id && callManagerRef.current) {
        if (autoAccept && inFlightCallResumeRef.current !== `${incoming.id}:accept`) {
          inFlightCallResumeRef.current = `${incoming.id}:accept`;
          stopIncomingCallRingtone();
          setCallStatus('accepted');
          try {
            await callManagerRef.current.acceptIncomingCall(incoming);
          } catch {
            // Handled via manager status callback
          }
        }
        return;
      }
      if (currentActive && currentActive.id !== incoming.id && callManagerRef.current) {
        return;
      }

      const lockKey = `${incoming.id}:${autoAccept ? 'accept' : 'open'}`;
      if (
        inFlightCallResumeRef.current === lockKey ||
        inFlightCallResumeRef.current === `${incoming.id}:accept`
      ) {
        return;
      }
      inFlightCallResumeRef.current = lockKey;

      try {
        const nextRecord: CallRecord = autoAccept
          ? { ...incoming, status: 'accepted' }
          : incoming;
        activeCallRef.current = nextRecord;
        setActiveCall(nextRecord);
        setCallError(undefined);
        if (autoAccept) {
          setCallStatus('accepted');
        } else if (nextRecord.status === 'calling' || nextRecord.status === 'ringing') {
          setCallStatus('ringing');
        }
        if (incoming.caller) {
          setCallPeerProfile(incoming.caller);
        } else if (incoming.caller_id && incoming.caller_id !== 'caller') {
          fetchMyProfile(incoming.caller_id)
            .then((callerProfile) => {
              if (callerProfile) setCallPeerProfile(callerProfile);
            })
            .catch(() => {});
        }

        if (!autoAccept && detectRuntimePlatform() !== 'android') {
          startIncomingCallRingtone(uid, incoming.id);
        }

        const manager = new WebRTCCallManager(uid, {
          onLocalStream: setLocalStream,
          onRemoteStream: setRemoteStream,
          onStatusChange: (status, errMsg) => {
            setCallStatus(status);
            if (status !== 'calling' && status !== 'ringing') {
              stopIncomingCallRingtone();
              stopCallerRingbackTone();
            }
            if (errMsg) setCallError(errMsg);
            if (
              status === 'ended' ||
              status === 'rejected' ||
              status === 'missed' ||
              status === 'failed'
            ) {
              stopIncomingCallRingtone();
              stopCallerRingbackTone();
              inFlightCallResumeRef.current = null;
              setTimeout(() => {
                activeCallRef.current = null;
                setActiveCall(null);
                callManagerRef.current = null;
              }, 1800);
            }
          },
        });
        callManagerRef.current = manager;

        if (autoAccept) {
          stopIncomingCallRingtone();
          await manager.acceptIncomingCall(nextRecord);
        } else {
          await manager.prepareIncomingCall(nextRecord);
        }
      } finally {
        if (!autoAccept && inFlightCallResumeRef.current === lockKey) {
          inFlightCallResumeRef.current = null;
        }
      }
    },
    []
  );

  // Resume or handle an incoming/ongoing Audio or Video Call when the user taps a Call Notification action
  const resumeIncomingCallFromNotification = useCallback(
    async (
      callId: string,
      uid: string,
      action?: string,
      meta?: {
        callType?: CallType;
        callerId?: string | null;
        callerName?: string | null;
        chatId?: string | null;
      }
    ) => {
      if (!callId || !uid) return;
      try {
        if (action === 'end') {
          stopIncomingCallRingtone();
          stopCallerRingbackTone();
          dismissIncomingCallSystemNotification(callId).catch(() => {});
          if (callManagerRef.current && activeCallRef.current?.id === callId) {
            await callManagerRef.current.endCall();
            return;
          }
          const { data: existingCall } = await supabase
            .from('calls')
            .select('*')
            .eq('id', callId)
            .maybeSingle();
          if (existingCall) {
            const nowIso = new Date().toISOString();
            await supabase
              .from('calls')
              .update({
                status: 'ended',
                ended_at: nowIso,
                updated_at: nowIso,
              })
              .eq('id', callId);
            const peerId =
              existingCall.caller_id === uid
                ? existingCall.receiver_id
                : existingCall.caller_id;
            await supabase.from('call_signals').insert({
              call_id: callId,
              sender_id: uid,
              receiver_id: peerId,
              signal_type: 'hangup',
              payload: { duration_seconds: 0 },
            });
          }
          if (activeCallRef.current?.id === callId) {
            callManagerRef.current?.cleanup();
            activeCallRef.current = null;
            setActiveCall(null);
            callManagerRef.current = null;
          }
          return;
        }

        if (action === 'reject') {
          stopIncomingCallRingtone();
          dismissIncomingCallSystemNotification(callId).catch(() => {});
          if (callManagerRef.current && activeCallRef.current?.id === callId) {
            await callManagerRef.current.rejectIncomingCall(activeCallRef.current);
            return;
          }
          const { data: callToReject } = await supabase
            .from('calls')
            .select('*')
            .eq('id', callId)
            .maybeSingle();
          if (callToReject) {
            await supabase
              .from('calls')
              .update({
                status: 'rejected',
                ended_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('id', callId);
            await supabase.from('call_signals').insert({
              call_id: callId,
              sender_id: uid,
              receiver_id: callToReject.caller_id,
              signal_type: 'reject',
              payload: {},
            });
          }
          if (activeCallRef.current && activeCallRef.current.id === callId) {
            callManagerRef.current?.cleanup();
            activeCallRef.current = null;
            setActiveCall(null);
            callManagerRef.current = null;
          }
          return;
        }

        // Immediately seed the active call UI on Frame 0 so accepting or opening a call from a notification
        // while using another app NEVER shows the OSA homepage, chat list, or a blank loading screen!
        const resolvedCallType: CallType =
          meta?.callType ||
          activeCallRef.current?.call_type ||
          INITIAL_DEEP_ACTION.callType ||
          'audio';
        const resolvedCallerId =
          (meta?.callerId ||
            (activeCallRef.current?.caller_id !== 'caller'
              ? activeCallRef.current?.caller_id
              : null) ||
            INITIAL_DEEP_ACTION.callerId ||
            '')
            .trim() || null;
        const resolvedCallerName =
          (meta?.callerName || INITIAL_DEEP_ACTION.callerName || '').trim() || null;
        const resolvedChatId =
          meta?.chatId || activeCallRef.current?.chat_id || INITIAL_DEEP_ACTION.chatId || null;

        const isBgActive = isNativeBackgroundAudioCallActive(callId);
        const immediateStatus: CallStatus =
          action === 'accept'
            ? 'accepted'
            : isBgActive
            ? 'connected'
            : 'ringing';

        if (!activeCallRef.current || activeCallRef.current.id !== callId) {
          const nowIso = new Date().toISOString();
          const immediateRecord: CallRecord = {
            id: callId,
            chat_id: resolvedChatId,
            caller_id: resolvedCallerId || 'caller',
            receiver_id: uid,
            call_type: resolvedCallType,
            status: immediateStatus,
            started_at: nowIso,
            answered_at: immediateStatus !== 'ringing' ? nowIso : null,
            ended_at: null,
            duration_seconds: 0,
            created_at: nowIso,
          };
          activeCallRef.current = immediateRecord;
          setActiveCall(immediateRecord);
          setCallError(undefined);
          setCallStatus(immediateStatus);
          if (resolvedCallerName || resolvedCallerId) {
            setCallPeerProfile((prev) =>
              prev && prev.id === resolvedCallerId
                ? prev
                : {
                    id: resolvedCallerId || 'caller',
                    full_name: resolvedCallerName || 'Incoming Call',
                    username: 'caller',
                    email: '',
                    avatar_url: null,
                    about: '',
                    phone: null,
                    language: 'en',
                    theme: 'dark',
                    is_online: true,
                    last_seen: nowIso,
                    created_at: nowIso,
                    updated_at: nowIso,
                  }
            );
          }
        } else if (action === 'accept') {
          setCallStatus('accepted');
        } else if (isBgActive) {
          setCallStatus('connected');
        }

        if (isBgActive && resolvedCallType === 'audio') {
          stopIncomingCallRingtone();
          if (callManagerRef.current) {
            callManagerRef.current.detachSilent();
            callManagerRef.current = null;
          }
          if (resolvedCallerId && resolvedCallerId !== 'caller') {
            fetchMyProfile(resolvedCallerId)
              .then((p) => {
                if (p) setCallPeerProfile(p);
              })
              .catch(() => {});
          }
          return;
        }

        // Fast-path: If user tapped ACCEPT on notification and we already have callerId from the notification intent,
        // start WebRTC media + offer negotiation immediately in parallel without waiting on an extra calls table roundtrip!
        if (action === 'accept' && resolvedCallerId && resolvedCallerId !== 'caller') {
          const fastRecord: CallRecord = {
            ...(activeCallRef.current || {
              id: callId,
              chat_id: resolvedChatId,
              caller_id: resolvedCallerId,
              receiver_id: uid,
              call_type: resolvedCallType,
              status: 'accepted',
              started_at: new Date().toISOString(),
              answered_at: new Date().toISOString(),
              ended_at: null,
              duration_seconds: 0,
              created_at: new Date().toISOString(),
            }),
            caller_id: resolvedCallerId,
            receiver_id: uid,
            call_type: resolvedCallType,
            chat_id: resolvedChatId,
          };
          await presentIncomingCall(fastRecord, uid, true);
          return;
        }

        const { data: callRow } = await supabase
          .from('calls')
          .select('*')
          .eq('id', callId)
          .maybeSingle();

        const incoming = callRow as CallRecord | null;
        if (!incoming || (incoming.receiver_id !== uid && incoming.caller_id !== uid)) {
          stopIncomingCallRingtone();
          dismissIncomingCallSystemNotification(callId).catch(() => {});
          if (activeCallRef.current?.id === callId) {
            setCallStatus('ended');
            setCallError('This call is no longer active.');
            setTimeout(() => {
              activeCallRef.current = null;
              setActiveCall(null);
              callManagerRef.current = null;
            }, 1400);
          }
          return;
        }

        // If the call is already active in this window:
        // - If user tapped 'accept' and it wasn't accepted yet, accept it now
        // - If it's already accepted/connected, keep it focused
        if (activeCallRef.current?.id === incoming.id && callManagerRef.current) {
          if (action === 'accept') {
            await presentIncomingCall(incoming, uid, true);
          }
          return;
        }

        // If the call has already ended, missed, or rejected
        if (
          incoming.status === 'ended' ||
          incoming.status === 'missed' ||
          incoming.status === 'rejected' ||
          incoming.status === 'failed'
        ) {
          stopIncomingCallRingtone();
          dismissIncomingCallSystemNotification(incoming.id).catch(() => {});
          if (activeCallRef.current?.id === incoming.id) {
            setCallStatus(
              incoming.status === 'rejected' || incoming.status === 'missed'
                ? incoming.status
                : 'ended'
            );
            setCallError('This call has already ended.');
            setTimeout(() => {
              activeCallRef.current = null;
              setActiveCall(null);
              callManagerRef.current = null;
            }, 1500);
          }
          return;
        }

        await presentIncomingCall(incoming, uid, action === 'accept');
      } catch {
        if (activeCallRef.current?.id === callId && !callManagerRef.current) {
          setCallStatus('failed');
          setCallError('Unable to connect to the call. Please check your internet connection.');
          setTimeout(() => {
            activeCallRef.current = null;
            setActiveCall(null);
          }, 1800);
        }
      }
    },
    [presentIncomingCall]
  );

  // Check for any active ringing/calling incoming call when OSA is open, visible, and online
  const checkPendingIncomingCall = useCallback(
    async (uid: string) => {
      if (!uid || activeCallRef.current) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      try {
        const cutoff = new Date(Date.now() - 45 * 1000).toISOString();
        const { data: rows } = await supabase
          .from('calls')
          .select('*')
          .eq('receiver_id', uid)
          .in('status', ['calling', 'ringing'])
          .gte('created_at', cutoff)
          .order('created_at', { ascending: false })
          .limit(1);

        if (rows && rows.length > 0) {
          const incoming = rows[0] as CallRecord;
          await presentIncomingCall(incoming, uid, false);
        }
      } catch {
        // Ignore transient network errors
      }
    },
    [presentIncomingCall]
  );

  const navigateToValidatedSameChat = useCallback(
    async (
      userId: string,
      rawChatId?: string | null,
      rawSenderId?: string | null
    ): Promise<void> => {
      const candidateChatId = (rawChatId || '').trim();
      const candidateSenderId = (rawSenderId || '').trim();
      if (!candidateChatId && !candidateSenderId) {
        setResolvingSameChat(false);
        return;
      }

      // Immediately switch to chats tab and close any covering modals
      setActiveTab('chats');
      setShowNewChatModal(false);
      setShowNotificationsModal(false);
      setHomeSearchQuery('');
      setResolvingSameChat(true);

      if (candidateChatId) {
        setSelectedChatId(candidateChatId);
      }

      try {
        const userChats = await fetchUserChats(userId);
        setChats(userChats);

        if (candidateChatId && userChats.some((c) => c.id === candidateChatId)) {
          setActiveTab('chats');
          setSelectedChatId(candidateChatId);
          setResolvingSameChat(false);
          return;
        }

        const peerIdToFind = candidateSenderId || candidateChatId;
        if (peerIdToFind && peerIdToFind !== userId) {
          const existingByPeer = userChats.find(
            (c) => c.type === 'direct' && c.peer && c.peer.id === peerIdToFind
          );
          if (existingByPeer) {
            setActiveTab('chats');
            setSelectedChatId(existingByPeer.id);
            setResolvingSameChat(false);
            return;
          }

          const directChatId = await openOrCreateDirectChat(userId, peerIdToFind);
          if (directChatId) {
            const refreshed = await fetchUserChats(userId);
            setChats(refreshed);
            setActiveTab('chats');
            setSelectedChatId(directChatId);
            setResolvingSameChat(false);
            return;
          }
        }

        // If candidateChatId was invalid or belonged to another user and no senderId matched,
        // clear the invalid selection cleanly so the user is not stuck on an unauthorized chat.
        if (candidateChatId && !userChats.some((c) => c.id === candidateChatId)) {
          setSelectedChatId(null);
        }
      } catch {
        // Ignore transient fetch error
      } finally {
        setResolvingSameChat(false);
      }
    },
    []
  );

  const loadAuthenticatedUser = useCallback(async () => {
    const sbConfig = getSupabaseConfig();
    if (!sbConfig.isConfigured) {
      setCurrentUser(null);
      setBootstrapping(false);
      return;
    }

    try {
      if (
        isRecoveryModeRef.current ||
        isVerificationCallbackRef.current ||
        isEmailVerificationInProgress()
      ) {
        setCurrentUser(null);
        setBootstrapping(false);
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        setCurrentUser(null);
        setActiveCall(null);
        activeCallRef.current = null;
        setResolvingSameChat(false);
        setBootstrapping(false);
        return;
      }

      const confirmedAt =
        session.user.email_confirmed_at ||
        (session.user as { confirmed_at?: string | null }).confirmed_at;
      if (!confirmedAt) {
        await supabase.auth.signOut().catch(() => {});
        setCurrentUser(null);
        setBootstrapping(false);
        return;
      }

      // Handle URL query or native intent deep-links from notification clicks immediately
      // BEFORE awaiting ensureProfileAndPrivacy so call acceptance starts with zero delay!
      const urlParams = new URLSearchParams(window.location.search);
      const deepChatId =
        urlParams.get('chatId') ||
        urlParams.get('conversationId') ||
        INITIAL_DEEP_ACTION.chatId;
      const deepSenderId = urlParams.get('senderId') || INITIAL_DEEP_ACTION.senderId;
      const deepCallId = urlParams.get('callId') || INITIAL_DEEP_ACTION.callId;
      const deepCallAction =
        urlParams.get('callAction') || INITIAL_DEEP_ACTION.callAction || undefined;
      if (
        urlParams.get('chatId') ||
        urlParams.get('conversationId') ||
        urlParams.get('senderId') ||
        urlParams.get('callId') ||
        urlParams.get('callAction') ||
        urlParams.get('action')
      ) {
        try {
          window.history.replaceState({}, document.title, '/');
        } catch {
          // Ignore
        }
      }
      if (deepCallId && urlParams.get('action') !== 'same_chat') {
        resumeIncomingCallFromNotification(deepCallId, session.user.id, deepCallAction, {
          callType: INITIAL_DEEP_ACTION.callType,
          callerId: INITIAL_DEEP_ACTION.callerId,
          callerName: INITIAL_DEEP_ACTION.callerName,
          chatId: INITIAL_DEEP_ACTION.chatId,
        });
      }

      const profile = await ensureProfileAndPrivacy(
        session.user.id,
        session.user.email || '',
        session.user.user_metadata?.full_name
      );

      setCurrentUser(profile);
      // Clear bootstrapping immediately once currentUser is verified so notifications open target views without waiting on secondary queries
      setBootstrapping(false);

      Promise.all([
        fetchPrivacySettings(session.user.id),
        checkIsUserAdmin(session.user.id),
      ])
        .then(([priv, adminCheck]) => {
          setMyPrivacy(priv);
          setIsAdmin(adminCheck.isAdmin);
          setAdminRole(adminCheck.role);
        })
        .catch(() => {});

      if (profile.theme) handleThemeChange(profile.theme);
      if (profile.language) handleLanguageChange(profile.language);
      syncUserRingtoneFromSupabase(profile.id).catch(() => {});
      syncChatTranslationLanguageFromSupabase(profile.id, profile.language).catch(() => {});
      syncNotificationPreferencesFromSupabase(profile.id)
        .then(() => ensureUserPushSubscription(profile.id))
        .catch(() => {});

      // Sync centralized permission state from Supabase + browser Permissions API first,
      // then run the ONE-TIME permission onboarding sequence (Camera -> Microphone -> Location -> Notifications)
      // ONLY if onboarding has not completed for this user/device.
      syncPermissionsFromSupabase(profile.id)
        .then((syncedPerm) => {
          let needsOnboarding = !syncedPerm.onboardingCompleted;
          try {
            if (localStorage.getItem('osa_needs_permission_onboarding') === 'true') {
              needsOnboarding = true;
            }
          } catch {
            // Ignore
          }
          if (needsOnboarding && !deepCallId) {
            return requestAllOSAPermissions(profile.id);
          }
          return syncedPerm;
        })
        .catch(() => {});

      if (!deepCallId && (deepChatId || deepSenderId)) {
        navigateToValidatedSameChat(profile.id, deepChatId, deepSenderId);
      }

      setUserOnlineStatus(profile.id, true).catch(() => {});
      await refreshChatsAndNotifications(profile.id);

      if (!deepCallId && !deepChatId && !deepSenderId) {
        checkPendingIncomingCall(profile.id);
      }
    } catch {
      setCurrentUser(null);
      setResolvingSameChat(false);
    } finally {
      setBootstrapping(false);
    }
  }, [
    refreshChatsAndNotifications,
    resumeIncomingCallFromNotification,
    checkPendingIncomingCall,
    navigateToValidatedSameChat,
  ]);

  useEffect(() => {
    const cleanBrowserAuthUrl = () => {
      try {
        window.history.replaceState({}, document.title, '/');
      } catch {
        // Ignore history error
      }
    };

    const currentUrlCheck = inspectInitialRecoveryUrl();
    if (currentUrlCheck.isRecoveryMode) {
      isRecoveryModeRef.current = true;
      setAuthMode('reset');
      if (currentUrlCheck.recoveryError) {
        setRecoveryError(currentUrlCheck.recoveryError);
      }
    } else if (currentUrlCheck.isVerificationCallback) {
      isVerificationCallbackRef.current = true;
      if (currentUrlCheck.verificationError) {
        setAuthMode('verify');
        setRecoveryError(currentUrlCheck.verificationError);
      }
    }

    const sbConfig = getSupabaseConfig();
    if (!sbConfig.isConfigured) {
      setBootstrapping(false);
      return;
    }

    if (isVerificationCallbackRef.current) {
      setEmailVerificationInProgress(true);
      const tokenHash = currentUrlCheck.tokenHash || INITIAL_RECOVERY_STATE.tokenHash;
      const errText =
        currentUrlCheck.verificationError || INITIAL_RECOVERY_STATE.verificationError;

      if (errText) {
        cleanBrowserAuthUrl();
        setAuthMode('verify');
        setRecoveryError(errText);
        setCurrentUser(null);
        setBootstrapping(false);
        isVerificationCallbackRef.current = false;
        setEmailVerificationInProgress(false);
      } else if (tokenHash) {
        supabase.auth
          .verifyOtp({
            token_hash: tokenHash,
            type: currentUrlCheck.callbackType === 'email' ? 'email' : 'signup',
          })
          .then(async ({ data, error: otpErr }) => {
            cleanBrowserAuthUrl();
            const confirmedAt =
              data?.user?.email_confirmed_at ||
              (data?.user as { confirmed_at?: string | null } | undefined)?.confirmed_at;
            if (otpErr || !data?.user || (!confirmedAt && !data.session)) {
              setAuthMode('verify');
              setRecoveryError(
                'This email verification link is invalid or has expired. Please request a new verification email or enter your verification code.'
              );
              setCurrentUser(null);
            } else {
              try {
                await ensureProfileAndPrivacy(
                  data.user.id,
                  data.user.email || '',
                  data.user.user_metadata?.full_name
                );
              } catch {
                // Handled by database trigger
              }
              if (data.user.email) {
                setVerifiedEmailHint(data.user.email);
              }
              await supabase.auth.signOut().catch(() => {});
              setRecoveryError('');
              setAuthSuccessMessage(
                'Your email has been verified! Please sign in to OSA Chat.'
              );
              setAuthMode('login');
              setCurrentUser(null);
            }
          })
          .catch(() => {
            cleanBrowserAuthUrl();
            setAuthMode('verify');
            setRecoveryError(
              'This email verification link is invalid or has expired. Please request a new verification email or enter your verification code.'
            );
            setCurrentUser(null);
          })
          .finally(() => {
            isVerificationCallbackRef.current = false;
            setEmailVerificationInProgress(false);
            setBootstrapping(false);
          });
      } else {
        supabase.auth
          .getSession()
          .then(async ({ data: { session } }) => {
            cleanBrowserAuthUrl();
            const confirmedAt =
              session?.user?.email_confirmed_at ||
              (session?.user as { confirmed_at?: string | null } | undefined)?.confirmed_at;
            if (!session?.user || !confirmedAt) {
              setAuthMode('verify');
              setRecoveryError(
                'This email verification link is invalid or has expired. Please request a new verification email or enter your verification code.'
              );
              setCurrentUser(null);
            } else {
              try {
                await ensureProfileAndPrivacy(
                  session.user.id,
                  session.user.email || '',
                  session.user.user_metadata?.full_name
                );
              } catch {
                // Handled by database trigger
              }
              if (session.user.email) {
                setVerifiedEmailHint(session.user.email);
              }
              await supabase.auth.signOut().catch(() => {});
              setRecoveryError('');
              setAuthSuccessMessage(
                'Your email has been verified! Please sign in to OSA Chat.'
              );
              setAuthMode('login');
              setCurrentUser(null);
            }
          })
          .catch(() => {
            cleanBrowserAuthUrl();
            setAuthMode('verify');
            setRecoveryError(
              'This email verification link is invalid or has expired. Please request a new verification email or enter your verification code.'
            );
            setCurrentUser(null);
          })
          .finally(() => {
            isVerificationCallbackRef.current = false;
            setEmailVerificationInProgress(false);
            setBootstrapping(false);
          });
      }
    } else if (isRecoveryModeRef.current) {
      setBootstrapping(false);
      const tokenHash = currentUrlCheck.tokenHash || INITIAL_RECOVERY_STATE.tokenHash;
      if (tokenHash) {
        supabase.auth
          .verifyOtp({ token_hash: tokenHash, type: 'recovery' })
          .then(({ error: otpErr }) => {
            cleanBrowserAuthUrl();
            if (otpErr) {
              setRecoveryError(
                'This password reset link is invalid or has expired. Please request a new password reset email.'
              );
            }
          })
          .catch(() => {
            cleanBrowserAuthUrl();
            setRecoveryError(
              'This password reset link is invalid or has expired. Please request a new password reset email.'
            );
          });
      } else if (!INITIAL_RECOVERY_STATE.recoveryError && !currentUrlCheck.recoveryError) {
        supabase.auth
          .getSession()
          .then(({ data: { session } }) => {
            cleanBrowserAuthUrl();
            if (!session?.user && isRecoveryModeRef.current) {
              setRecoveryError(
                'This password reset link is invalid or has expired. Please request a new password reset email.'
              );
            }
          })
          .catch(() => {});
      } else {
        cleanBrowserAuthUrl();
      }
    } else {
      if (window.location.pathname.toLowerCase() === '/login') {
        cleanBrowserAuthUrl();
      }
      loadAuthenticatedUser();
    }

    const handleHashChange = () => {
      const hashCheck = inspectInitialRecoveryUrl();
      if (hashCheck.isRecoveryMode) {
        isRecoveryModeRef.current = true;
        setAuthMode('reset');
        setCurrentUser(null);
        if (hashCheck.recoveryError) {
          setRecoveryError(hashCheck.recoveryError);
        }
      } else if (hashCheck.isVerificationCallback) {
        isVerificationCallbackRef.current = true;
        setCurrentUser(null);
        if (hashCheck.verificationError) {
          setAuthMode('verify');
          setRecoveryError(hashCheck.verificationError);
        }
      }
    };
    window.addEventListener('hashchange', handleHashChange);

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        isRecoveryModeRef.current = true;
        setRecoveryError('');
        setAuthMode('reset');
        setCurrentUser(null);
        setBootstrapping(false);
      } else if (event === 'SIGNED_OUT' || !session) {
        stopAllRingtoneAudio();
        if (presenceManagerRef.current) {
          presenceManagerRef.current.stopAndMarkOffline().catch(() => {});
          presenceManagerRef.current = null;
        }
        setCurrentUser(null);
        setIsAdmin(false);
        setAdminRole(null);
        setChats([]);
        setSelectedChatId(null);
      } else if (event === 'SIGNED_IN' && session?.user) {
        if (
          !isRecoveryModeRef.current &&
          !isVerificationCallbackRef.current &&
          !isEmailVerificationInProgress()
        ) {
          loadAuthenticatedUser();
        }
      }
    });

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      authListener.subscription.unsubscribe();
    };
  }, [loadAuthenticatedUser]);

  // Real-time multi-device presence & heartbeat lifecycle for the authenticated user
  useEffect(() => {
    if (!currentUser?.id) return;

    const manager = new PresenceManager(currentUser.id, (peerUserId, peerOnline, lastSeenIso) => {
      setChats((prev) =>
        prev.map((c) =>
          c.peer && c.peer.id === peerUserId
            ? {
                ...c,
                peer: {
                  ...c.peer,
                  is_online: peerOnline,
                  last_seen: lastSeenIso,
                  last_seen_at: lastSeenIso,
                  ...(peerOnline ? { last_heartbeat_at: lastSeenIso } : {}),
                },
              }
            : c
        )
      );
      setDirectorySearchResults((prev) =>
        prev.map((u) =>
          u.id === peerUserId
            ? {
                ...u,
                is_online: peerOnline,
                last_seen: lastSeenIso,
                last_seen_at: lastSeenIso,
                ...(peerOnline ? { last_heartbeat_at: lastSeenIso } : {}),
              }
            : u
        )
      );
    });

    presenceManagerRef.current = manager;
    manager.start().catch(() => {});

    return () => {
      manager.stopAndMarkOffline().catch(() => {});
      if (presenceManagerRef.current === manager) {
        presenceManagerRef.current = null;
      }
    };
  }, [currentUser?.id]);

  // Report active conversation to Service Worker & Supabase so background push is only sent when not viewing that exact chat
  useEffect(() => {
    if (!currentUser) return;
    const isChatVisible =
      document.visibilityState === 'visible' &&
      activeTab === 'chats' &&
      Boolean(selectedChatId);
    reportActiveChatForPush(
      currentUser.id,
      isChatVisible ? selectedChatId : null,
      document.visibilityState === 'visible'
    ).catch(() => {});

    const handleVisibilityChange = () => {
      const visibleNow = document.visibilityState === 'visible';
      if (visibleNow) {
        ensureUserPushSubscription(currentUser.id).catch(() => {});
      }
      reportActiveChatForPush(
        currentUser.id,
        visibleNow && activeTab === 'chats' ? selectedChatId : null,
        visibleNow
      ).catch(() => {});
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentUser?.id, activeTab, selectedChatId]);

  // Listen for Service Worker notificationclick & pushsubscriptionchange events
  useEffect(() => {
    if (!currentUser || !('serviceWorker' in navigator)) return;

    const handleSWMessage = (event: MessageEvent) => {
      const payload = event.data;
      if (!payload || typeof payload !== 'object') return;

      if (payload.type === 'OSA_NOTIFICATION_CLICK') {
        const data = payload.data || {};
        const action = typeof payload.action === 'string' ? payload.action : undefined;
        const targetChatId = data.conversationId || data.chatId;
        const targetSenderId = data.senderId;
        if (
          action !== 'same_chat' &&
          (data.callId || data.type === 'incoming_call' || data.type === 'call')
        ) {
          if (data.callId) {
            resumeIncomingCallFromNotification(String(data.callId), currentUser.id, action);
          } else if (!activeCall) {
            setActiveTab('calls');
          }
        } else if (targetChatId || targetSenderId) {
          navigateToValidatedSameChat(
            currentUser.id,
            targetChatId ? String(targetChatId) : null,
            targetSenderId ? String(targetSenderId) : null
          ).catch(() => {});
        }
      } else if (payload.type === 'OSA_INCOMING_CALL_PUSH') {
        const data = payload.data || {};
        if (data.callId && !activeCall) {
          resumeIncomingCallFromNotification(String(data.callId), currentUser.id, 'open');
        }
      } else if (payload.type === 'OSA_CALL_CANCELLED_PUSH') {
        stopIncomingCallRingtone();
        if (payload.callId) {
          dismissIncomingCallSystemNotification(String(payload.callId)).catch(() => {});
          if (activeCall && activeCall.id === payload.callId) {
            setCallStatus('ended');
            callManagerRef.current?.cleanup();
            setTimeout(() => {
              setActiveCall(null);
              callManagerRef.current = null;
            }, 1200);
          }
        }
      } else if (payload.type === 'OSA_NOTIFICATION_INLINE_REPLY') {
        const replyText = typeof payload.replyText === 'string' ? payload.replyText.trim() : '';
        const data = payload.data || {};
        const rawChatId = String(data.conversationId || data.chatId || '').trim();
        const rawSenderId = String(data.senderId || '').trim();
        const replyToId = data.messageId ? String(data.messageId).trim() : null;
        if (!replyText) return;
        (async () => {
          try {
            let resolvedChatId = rawChatId;
            if (!resolvedChatId && rawSenderId && rawSenderId !== currentUser.id) {
              resolvedChatId = await openOrCreateDirectChat(currentUser.id, rawSenderId);
            }
            if (!resolvedChatId) return;
            await sendTextMessage({
              chatId: resolvedChatId,
              senderId: currentUser.id,
              content: replyText,
              replyToId: replyToId || null,
            });
            await markChatAsRead(resolvedChatId, currentUser.id, true).catch(() => {});
            await refreshChatsAndNotifications(currentUser.id);
          } catch {
            // Ignore transient inline reply failure
          }
        })();
      } else if (payload.type === 'OSA_PUSH_SUBSCRIPTION_CHANGED') {
        ensureUserPushSubscription(currentUser.id).catch(() => {});
      }
    };

    const handleNativeInlineReplySent = () => {
      refreshChatsAndNotifications(currentUser.id).catch(() => {});
    };

    navigator.serviceWorker.addEventListener('message', handleSWMessage);
    window.addEventListener('osa:native-inline-reply-sent', handleNativeInlineReplySent);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleSWMessage);
      window.removeEventListener('osa:native-inline-reply-sent', handleNativeInlineReplySent);
    };
  }, [currentUser, activeCall, resumeIncomingCallFromNotification, refreshChatsAndNotifications]);

  // Initialize Native Mobile Bridge (Android FCM / CallNotificationService & iOS APNs / PushKit / CallKit)
  useEffect(() => {
    if (!currentUser) return;
    return initializeNativeMobileBridge(currentUser.id, {
      onNativeCallAction: (detail) => {
        if (detail.action === 'mute' || detail.action === 'unmute') {
          const wantMuted = detail.action === 'mute';
          if (callManagerRef.current) {
            callManagerRef.current.toggleMute(wantMuted);
          }
          return;
        }
        if (detail.action === 'speaker_on' || detail.action === 'speaker_off') {
          const wantSpeaker = detail.action === 'speaker_on';
          if (callManagerRef.current) {
            callManagerRef.current.toggleSpeakerphone(wantSpeaker);
          }
          return;
        }
        if (detail.action === 'bg_audio_accepted' || detail.action === 'bg_audio_connected') {
          stopIncomingCallRingtone();
          stopCallerRingbackTone();
          if (callManagerRef.current) {
            callManagerRef.current.detachSilent();
            callManagerRef.current = null;
          }
          const nowIso = new Date().toISOString();
          const nextStatus: CallStatus =
            detail.action === 'bg_audio_connected' ? 'connected' : 'accepted';
          const bgRecord: CallRecord = {
            ...(activeCallRef.current && activeCallRef.current.id === detail.callId
              ? activeCallRef.current
              : {
                  id: detail.callId,
                  chat_id: detail.chatId || null,
                  caller_id: detail.callerId || 'caller',
                  receiver_id: currentUser.id,
                  call_type: 'audio',
                  status: nextStatus,
                  started_at: nowIso,
                  answered_at: nowIso,
                  ended_at: null,
                  duration_seconds: 0,
                  created_at: nowIso,
                }),
            status: nextStatus,
            answered_at: nowIso,
          };
          activeCallRef.current = bgRecord;
          setActiveCall(bgRecord);
          setCallError(undefined);
          setCallStatus(nextStatus);
          if (detail.callerId && detail.callerId !== 'caller') {
            fetchMyProfile(detail.callerId)
              .then((p) => {
                if (p) setCallPeerProfile(p);
              })
              .catch(() => {});
          }
          return;
        }
        if (detail.action === 'end') {
          stopIncomingCallRingtone();
          dismissIncomingCallSystemNotification(detail.callId).catch(() => {});
          if (activeCallRef.current?.id === detail.callId || (activeCall && activeCall.id === detail.callId)) {
            if (callManagerRef.current) {
              callManagerRef.current.endCall().catch(() => {});
            } else {
              setCallStatus('ended');
              setTimeout(() => {
                activeCallRef.current = null;
                setActiveCall(null);
              }, 1000);
            }
          }
        } else {
          resumeIncomingCallFromNotification(detail.callId, currentUser.id, detail.action, {
            callType: detail.callType,
            callerId: detail.callerId,
            callerName: detail.callerName,
            chatId: detail.chatId,
          });
        }
      },
      onNativeDeepLink: (detail) => {
        if (detail.callId && detail.action !== 'same_chat') {
          resumeIncomingCallFromNotification(
            detail.callId,
            currentUser.id,
            detail.callAction || 'open',
            {
              callType: detail.callType || undefined,
              callerId: detail.senderId,
              callerName: detail.senderName,
              chatId: detail.chatId || detail.conversationId,
            }
          );
        } else if (detail.chatId || detail.conversationId || detail.senderId) {
          navigateToValidatedSameChat(
            currentUser.id,
            detail.chatId || detail.conversationId || null,
            detail.senderId || null
          ).catch(() => {});
        }
      },
    });
  }, [
    currentUser,
    activeCall,
    resumeIncomingCallFromNotification,
    refreshChatsAndNotifications,
    navigateToValidatedSameChat,
  ]);

  // Periodic Auto-Update Checker for Android / Web Releases
  useEffect(() => {
    if (!currentUser) return;

    // Check shortly after launch (1.5s cold-start grace period)
    const initialCheckTimer = window.setTimeout(() => {
      checkNativeAppUpdate();
    }, 1500);

    // Periodic check every 6 hours while app remains active
    const updateInterval = window.setInterval(() => {
      checkNativeAppUpdate();
    }, 6 * 60 * 60 * 1000);

    // Auto-prompt modal if an update is found on startup
    const handleUpdateResult = (e: Event) => {
      const detail = (e as CustomEvent<{ success: boolean; updateAvailable: boolean; info?: { versionName: string } }>).detail;
      if (detail?.success && detail.info) {
        const lastInstalled = localStorage.getItem('osa_last_installed_version');
        if (!lastInstalled) {
          // Brand new installation or new registration: do not prompt update, auto-mark as current
          try {
            localStorage.setItem('osa_last_installed_version', detail.info.versionName);
          } catch {}
          return;
        }
        if (lastInstalled === detail.info.versionName) {
          return; // Already updated to this version; do not show update modal again
        }
        setShowAppUpdateModal(true);
      }
    };

    window.addEventListener('osa:update-check-result', handleUpdateResult);

    return () => {
      window.clearTimeout(initialCheckTimer);
      window.clearInterval(updateInterval);
      window.removeEventListener('osa:update-check-result', handleUpdateResult);
    };
  }, [currentUser]);
  const respondWithDeviceLocation = useCallback(
    async (req: {
      requestId: string;
      requesterId: string;
      requesterName: string;
      chatId?: string | null;
    }) => {
      if (!currentUser) return;
      try {
        const pos = await getCurrentDeviceLocation(currentUser.id);
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

    const handleIncomingRemoteCameraSignal = (sig: RemoteCameraSignalPayload) => {
      if (!sig || !sig.sessionId || sig.senderId === currentUser.id) return;

      if (sig.type === 'request' || sig.type === 'RC_REQUEST') {
        if (handledRemoteCameraSessionsRef.current.has(sig.sessionId)) return;
        handledRemoteCameraSessionsRef.current.add(sig.sessionId);

        if (remoteCameraStreamerRef.current) {
          remoteCameraStreamerRef.current.cleanup();
          remoteCameraStreamerRef.current = null;
        }

        const streamer = new RemoteCameraSessionManager({
          sessionId: sig.sessionId,
          currentUserId: currentUser.id,
          currentUserName: currentUser.full_name,
          peerUserId: sig.senderId,
        });
        remoteCameraStreamerRef.current = streamer;

        const perm = getStoredPermissionStatus(currentUser.id);
        if (!perm.allowRemoteCamera) {
          // Remote Camera Access is OFF in Privacy Settings -> report authorization error immediately
          streamer
            .declineRequest(
              'Authorization required: Allow Remote Camera Access is disabled in peer Privacy settings.',
              'authorization_required'
            )
            .catch(() => {});
          remoteCameraStreamerRef.current = null;
          return;
        }

        if (!perm.cameraEnabled || perm.camera === 'denied') {
          streamer
            .declineRequest(
              'Camera permission required on the remote device.',
              'camera_permission_required'
            )
            .catch(() => {});
          remoteCameraStreamerRef.current = null;
          return;
        }

        streamer.startCameraStreamer(sig.facingMode || 'environment').catch(() => {});
      } else if (
        remoteCameraStreamerRef.current &&
        remoteCameraStreamerRef.current.getSessionId() === sig.sessionId
      ) {
        remoteCameraStreamerRef.current.handleIncomingSignal(sig);
      }
    };

    const rcamUserChannel = supabase
      .channel(`osa-rcam-user-${currentUser.id}`)
      .on('broadcast', { event: 'rcam_signal' }, ({ payload }) => {
        if (payload?.sessionId) {
          handleIncomingRemoteCameraSignal(payload as RemoteCameraSignalPayload);
        }
      })
      .subscribe();

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
        async (payload) => {
          refreshChatsAndNotifications(currentUser.id);
          const newMsg = payload.new as Message | undefined;
          if (!newMsg || !newMsg.id || !newMsg.sender_id || newMsg.sender_id === currentUser.id) {
            return;
          }
          const rawContent = (newMsg.content || '').trim();
          if (
            rawContent.startsWith(RCAM_SIG_PREFIX) ||
            rawContent.startsWith(REMOTE_LOC_REQ_PREFIX) ||
            rawContent.startsWith(REMOTE_LOC_RES_PREFIX) ||
            rawContent.startsWith(REMOTE_LOC_ERR_PREFIX)
          ) {
            return;
          }

          const isAndroidNative = detectRuntimePlatform() === 'android';
          const isSameActiveChat =
            !isAndroidNative &&
            document.visibilityState === 'visible' &&
            document.hasFocus() &&
            activeTab === 'chats' &&
            Boolean(selectedChatId) &&
            newMsg.chat_id === selectedChatId;

          if (isSameActiveChat) return;

          const matchedChat = chats.find((c) => c.id === newMsg.chat_id);
          if (matchedChat?.my_membership?.is_muted) return;

          let senderName =
            matchedChat?.peer?.full_name ||
            matchedChat?.members?.find((m) => m.user_id === newMsg.sender_id)?.profile?.full_name ||
            '';
          if (!senderName) {
            const senderProfile = await fetchMyProfile(newMsg.sender_id);
            senderName = senderProfile?.full_name || 'OSA User';
          }
          if (matchedChat?.type === 'group' && matchedChat.group?.name) {
            senderName = `${senderName} (${matchedChat.group.name})`;
          }

          const msgType = (newMsg.message_type || 'text').toLowerCase();
          const previewBody =
            msgType === 'image'
              ? 'Photo'
              : msgType === 'video'
              ? 'Video'
              : msgType === 'audio'
              ? 'Voice message'
              : msgType === 'document'
              ? 'File'
              : rawContent || 'New message';

          showBackgroundSystemNotification({
            userId: currentUser.id,
            senderId: newMsg.sender_id,
            senderName,
            title: senderName,
            body: previewBody,
            chatId: newMsg.chat_id || null,
            messageId: newMsg.id,
            type: matchedChat?.type === 'group' ? 'group_message' : 'new_message',
          }).catch(() => {});
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        (payload) => {
          const updatedProfile = payload.new as Profile;
          if (updatedProfile?.id) {
            setChats((prev) =>
              prev.map((c) =>
                c.peer && c.peer.id === updatedProfile.id
                  ? { ...c, peer: { ...c.peer, ...updatedProfile } }
                  : c
              )
            );
            setDirectorySearchResults((prev) =>
              prev.map((u) => (u.id === updatedProfile.id ? { ...u, ...updatedProfile } : u))
            );
          }
          refreshChatsAndNotifications(currentUser.id);
        }
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

          // Intercept dedicated Remote Camera signals (never treat as a normal call or notification)
          if (newNotif.body?.startsWith(RCAM_SIG_PREFIX)) {
            try {
              const sig = JSON.parse(
                newNotif.body.slice(RCAM_SIG_PREFIX.length)
              ) as RemoteCameraSignalPayload;
              handleIncomingRemoteCameraSignal(sig);
            } catch {
              // Ignore malformed signal
            }
            return;
          }

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

          // Show OS / Service Worker / Native Android notification
          const isAndroidNative = detectRuntimePlatform() === 'android';
          const isSameActiveChat =
            !isAndroidNative &&
            document.visibilityState === 'visible' &&
            document.hasFocus() &&
            activeTab === 'chats' &&
            Boolean(selectedChatId) &&
            newNotif.chat_id === selectedChatId;

          if (!isSameActiveChat && newNotif.type !== 'incoming_call') {
            showBackgroundSystemNotification({
              userId: currentUser.id,
              senderId: newNotif.actor_id || null,
              senderName: newNotif.title || 'OSA User',
              title: newNotif.title || 'OSA',
              body: newNotif.body || 'New message',
              chatId: newNotif.chat_id || null,
              messageId: newNotif.reference_id || newNotif.id || null,
              type: newNotif.type === 'mention' ? 'group_message' : newNotif.type,
            }).catch(() => {});
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
          if (typeof navigator !== 'undefined' && !navigator.onLine) return;

          const callerProfile = await fetchMyProfile(incoming.caller_id);
          const isAppVisible = document.visibilityState === 'visible';
          const isAndroidNative = detectRuntimePlatform() === 'android';
          const canNotifyInBackground =
            isAndroidNative ||
            (typeof Notification !== 'undefined' && Notification.permission === 'granted');

          // On Android Native (foreground, background, or locked) or when web tab is in background/unfocused,
          // trigger the incoming call notification immediately with Accept/Reject, ringtone, vibration, and 45s timeout
          if (isAndroidNative || !isAppVisible || !document.hasFocus()) {
            const callLabel = incoming.call_type === 'video' ? 'Video Call' : 'Audio Call';
            showBackgroundSystemNotification({
              userId: currentUser.id,
              senderId: incoming.caller_id,
              senderName: callerProfile?.full_name || 'OSA Caller',
              title: `Incoming ${callLabel}`,
              body: `${callerProfile?.full_name || 'Someone'} is calling you on OSA`,
              chatId: incoming.chat_id || null,
              callId: incoming.id,
              callType: incoming.call_type,
              type: 'incoming_call',
            }).catch(() => {});
          }

          // Only report RINGING back to the caller if OSA is actively visible OR a real system incoming-call notification can reach the user
          if (isAppVisible || canNotifyInBackground) {
            await presentIncomingCall(incoming, currentUser.id, false);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'calls',
          filter: `receiver_id=eq.${currentUser.id}`,
        },
        (payload) => {
          const updated = payload.new as CallRecord;
          if (!updated) return;
          if (
            updated.status === 'ended' ||
            updated.status === 'missed' ||
            updated.status === 'rejected' ||
            updated.status === 'failed'
          ) {
            stopIncomingCallRingtone();
            dismissIncomingCallSystemNotification(updated.id).catch(() => {});
          } else if (updated.status === 'connected' || updated.status === 'accepted') {
            stopIncomingCallRingtone();
            notifyNativeIncomingRingingStopped(updated.id);
          }
          if (
            activeCall &&
            activeCall.id === updated.id &&
            (updated.status === 'ended' ||
              updated.status === 'missed' ||
              updated.status === 'rejected' ||
              updated.status === 'failed')
          ) {
            setCallStatus(updated.status);
            callManagerRef.current?.cleanup();
            setTimeout(() => {
              setActiveCall(null);
              callManagerRef.current = null;
            }, 1500);
          }
        }
      )
      .subscribe();

    const handleBeforeUnload = () => {
      setUserOnlineStatus(currentUser.id, false);
    };
    const handleFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        checkPendingIncomingCall(currentUser.id);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('focus', handleFocusOrVisible);
    document.addEventListener('visibilitychange', handleFocusOrVisible);

    const callCheckInterval = window.setInterval(() => {
      checkPendingIncomingCall(currentUser.id);
    }, 4000);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('focus', handleFocusOrVisible);
      document.removeEventListener('visibilitychange', handleFocusOrVisible);
      window.clearInterval(callCheckInterval);
      supabase.removeChannel(rcamUserChannel);
      supabase.removeChannel(locBroadcastChannel);
      supabase.removeChannel(globalChannel);
    };
  }, [
    currentUser,
    activeCall,
    activeTab,
    selectedChatId,
    refreshChatsAndNotifications,
    respondWithDeviceLocation,
    presentIncomingCall,
    checkPendingIncomingCall,
  ]);

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

  // Initiate Outgoing WebRTC Audio or Video Call
  const handleStartCall = async (
    peer: Profile,
    callType: CallType,
    chatId?: string | null
  ) => {
    if (!currentUser) return;

    // Unlock caller ringback audio immediately inside the user's click/tap gesture
    unlockCallerRingbackAudio();

    // Open call screen IMMEDIATELY - instant responsive startup
    setCallPeerProfile(peer);
    setCallError(undefined);
    setCallStatus('calling');

    const tempRecord: CallRecord = {
      id: 'pending',
      chat_id: chatId || null,
      caller_id: currentUser.id,
      receiver_id: peer.id,
      call_type: callType,
      status: 'calling',
      started_at: new Date().toISOString(),
      answered_at: null,
      ended_at: null,
      duration_seconds: 0,
      created_at: new Date().toISOString(),
      caller: currentUser,
      receiver: peer,
    };
    activeCallRef.current = tempRecord;
    setActiveCall(tempRecord);

    const manager = new WebRTCCallManager(currentUser.id, {
      onLocalStream: setLocalStream,
      onRemoteStream: setRemoteStream,
      onStatusChange: (status, errMsg) => {
        setCallStatus(status);
        if (status !== 'calling' && status !== 'ringing') {
          stopCallerRingbackTone();
        }
        if (errMsg) setCallError(errMsg);
        if (
          status === 'ended' ||
          status === 'rejected' ||
          status === 'missed' ||
          status === 'failed'
        ) {
          stopCallerRingbackTone();
          setTimeout(() => {
            setActiveCall(null);
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
        callType,
      });
      setActiveCall(createdRecord);
    } catch {
      // Handled in status callback
    }
  };

  const handleAcceptCall = async () => {
    stopIncomingCallRingtone();
    stopCallerRingbackTone();
    if (!callManagerRef.current || !activeCall) return;
    try {
      await callManagerRef.current.acceptIncomingCall(activeCall);
    } catch {
      // Handled in status callback
    }
  };

  const handleRejectCall = async () => {
    stopIncomingCallRingtone();
    stopCallerRingbackTone();
    if (!callManagerRef.current || !activeCall) return;
    await callManagerRef.current.rejectIncomingCall(activeCall);
  };

  const handleEndCall = async () => {
    stopIncomingCallRingtone();
    stopCallerRingbackTone();
    if (activeCall?.id) {
      endNativeOngoingCall(activeCall.id);
    }
    if (!callManagerRef.current) {
      if (activeCall?.id) {
        dismissIncomingCallSystemNotification(activeCall.id).catch(() => {});
      }
      activeCallRef.current = null;
      setActiveCall(null);
      return;
    }
    await callManagerRef.current.endCall();
  };

  const handleLogout = async () => {
    stopAllRingtoneAudio();
    if (!currentUser) return;
    await signOutUser(currentUser.id);
    setCurrentUser(null);
    setChats([]);
    setSelectedChatId(null);
  };

  if (bootstrapping) {
    if (activeCall) {
      const nowIso = new Date().toISOString();
      const provisionalUser: Profile = currentUser || {
        id: activeCall.receiver_id || 'me',
        full_name: 'OSA User',
        username: 'osa_user',
        email: '',
        avatar_url: null,
        about: '',
        phone: null,
        language: 'en',
        theme: 'dark',
        is_online: true,
        last_seen: nowIso,
        created_at: nowIso,
        updated_at: nowIso,
      };
      return (
        <div className="h-dvh-screen w-full bg-slate-950 overflow-hidden">
          <CallOverlay
            callRecord={activeCall}
            currentUser={provisionalUser}
            peerProfile={callPeerProfile}
            callStatus={callStatus}
            errorMessage={callError}
            localStream={localStream}
            remoteStream={remoteStream}
            onAccept={handleAcceptCall}
            onReject={handleRejectCall}
            onEnd={handleEndCall}
            onToggleMute={(muted) => {
              if (activeCall?.id) setNativeCallMuteState(activeCall.id, muted);
              callManagerRef.current?.toggleMute(muted);
            }}
            onToggleCamera={(enabled) => callManagerRef.current?.toggleCamera(enabled)}
            onToggleSpeakerphone={(enabled) => {
              setNativeCallAudioRoute(enabled ? 'speaker' : 'earpiece');
              callManagerRef.current?.toggleSpeakerphone(enabled);
            }}
            onSwitchCamera={() => callManagerRef.current?.switchCamera()}
            t={t}
          />
        </div>
      );
    }
    if (resolvingSameChat) {
      return (
        <div className="h-dvh-screen w-full flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
          <header className="flex items-center gap-3 px-4 min-h-16 pt-safe bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
            <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800 animate-pulse" />
            <div className="space-y-1.5">
              <div className="w-32 h-3.5 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
              <div className="w-20 h-2.5 rounded bg-slate-100 dark:bg-slate-800/70 animate-pulse" />
            </div>
          </header>
          <div className="flex-1 bg-slate-100/60 dark:bg-slate-900/40" />
        </div>
      );
    }
    return <SplashScreen />;
  }

  if (!currentUser || authMode === 'reset' || authMode === 'verify') {
    return (
      <>
        <AuthPages
          initialMode={authMode}
          initialError={recoveryError}
          initialSuccess={authSuccessMessage}
          initialEmail={verifiedEmailHint}
          onClearInitialError={() => setRecoveryError('')}
          onClearInitialSuccess={() => setAuthSuccessMessage('')}
          onExitRecoveryMode={() => {
            isRecoveryModeRef.current = false;
            isVerificationCallbackRef.current = false;
            setEmailVerificationInProgress(false);
            setRecoveryError('');
            setAuthMode('login');
          }}
          onAuthenticated={() => {
            isRecoveryModeRef.current = false;
            isVerificationCallbackRef.current = false;
            setEmailVerificationInProgress(false);
            setRecoveryError('');
            setAuthSuccessMessage('');
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
    <div className="h-dvh-screen w-full flex flex-col md:flex-row bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden">
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
                { id: 'deals', icon: ShoppingBag, label: t.deals, badge: 0 },
                { id: 'agent', icon: Sparkles, label: t.agentTab || 'OSA AI', badge: 0 },
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
        className={`flex-col h-full min-h-0 w-full md:w-96 lg:w-[410px] md:border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 shrink-0 overflow-hidden ${
          selectedChat || resolvingSameChat ? 'hidden md:flex' : 'flex'
        }`}
      >
        {/* Top App Bar */}
        <header className="z-20 flex items-center justify-between px-4 min-h-16 pt-safe bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shrink-0">
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
            <div className="flex flex-col h-full min-h-0 overflow-hidden">
              {/* Search Bar + Filter Tabs (Fixed Top Area) */}
              <div className="p-3.5 space-y-2.5 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800/80 shrink-0">
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

              {/* Conversation List (Scrollable Middle Content) */}
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain pb-6 divide-y divide-slate-100 dark:divide-slate-800/70">
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
                      const showLastSeen =
                        !isGroup &&
                        peer &&
                        (peerPriv ? peerPriv.last_seen_visibility !== 'nobody' : true);
                      const peerTrulyOnline = Boolean(showOnline && isProfileTrulyOnline(peer));
                      const peerLastSeenLabel =
                        !isGroup && peer && !peerTrulyOnline && showLastSeen
                          ? formatLastSeenText(getProfileLastSeenIso(peer), t, language)
                          : null;
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
                            isOnline={peerTrulyOnline}
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

                            {!isGroup && peer && (peerTrulyOnline || peerLastSeenLabel) && (
                              <p className="text-[11px] truncate mt-0.5">
                                {peerTrulyOnline ? (
                                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                                    {t.online}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 dark:text-slate-500">
                                    {peerLastSeenLabel}
                                  </span>
                                )}
                              </p>
                            )}

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
                        {directorySearchResults.map((u) => {
                          const userOnline = isProfileTrulyOnline(u);
                          const userLastSeen = formatLastSeenText(
                            getProfileLastSeenIso(u),
                            t,
                            language
                          );
                          return (
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
                                isOnline={userOnline}
                                showOnlineStatus
                              />
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                  {u.full_name}
                                </p>
                                <p className="text-[11px] text-slate-400 truncate">
                                  {userOnline ? (
                                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                                      ● {t.online}
                                    </span>
                                  ) : (
                                    userLastSeen
                                  )}
                                </p>
                              </div>
                            </button>
                          );
                        })}
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

          {activeTab === 'deals' && <DealsPage t={t} />}

          {activeTab === 'agent' && (
            <AgentWorkbench
              currentUser={currentUser}
              t={t}
              onNavigateTab={(tab) => setActiveTab(tab)}
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

        {/* Functional Mobile Bottom Navigation */}
        <nav className="md:hidden z-20 grid grid-cols-7 items-center min-h-16 pt-1.5 pb-safe bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 shrink-0">
          {(
            [
              { id: 'chats', icon: MessageSquare, label: t.chats, badge: totalUnreadChats },
              { id: 'status', icon: CircleDot, label: t.status, badge: 0 },
              { id: 'groups', icon: Users, label: t.groups, badge: 0 },
              { id: 'calls', icon: Phone, label: t.calls, badge: 0 },
              { id: 'deals', icon: ShoppingBag, label: 'Deals', badge: 0 },
              { id: 'agent', icon: Sparkles, label: t.agentTab || 'OSA AI', badge: 0 },
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
        className={`flex-1 h-full min-h-0 min-w-0 overflow-hidden ${
          selectedChat || resolvingSameChat ? 'flex' : 'hidden md:flex'
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
            onBack={() => {
              setSelectedChatId(null);
              setResolvingSameChat(false);
            }}
            onStartCall={(peer, callType, cid) => handleStartCall(peer, callType, cid)}
            onChatUpdated={() => refreshChatsAndNotifications(currentUser.id)}
            t={t}
          />
        ) : resolvingSameChat ? (
          <div className="flex flex-col w-full h-full bg-slate-50 dark:bg-slate-950">
            <header className="flex items-center gap-3 px-4 min-h-16 pt-safe bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
              <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800 animate-pulse" />
              <div className="space-y-1.5">
                <div className="w-36 h-3.5 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
                <div className="w-24 h-2.5 rounded bg-slate-100 dark:bg-slate-800/70 animate-pulse" />
              </div>
            </header>
            <div className="flex-1 bg-slate-100/60 dark:bg-slate-900/40" />
          </div>
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

      {/* Manual Consent Prompt when allowRemoteCamera is false */}
      {pendingRemoteCameraReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Remote Camera Access Request
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              <strong className="text-slate-900 dark:text-white">
                {pendingRemoteCameraReq.senderName}
              </strong>{' '}
              is requesting live Remote Camera access on your device.
            </p>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={async () => {
                  const req = pendingRemoteCameraReq;
                  setPendingRemoteCameraReq(null);
                  if (
                    remoteCameraStreamerRef.current &&
                    remoteCameraStreamerRef.current.getSessionId() === req.sessionId
                  ) {
                    await remoteCameraStreamerRef.current.declineRequest();
                    remoteCameraStreamerRef.current = null;
                  }
                }}
                className="flex-1 py-2.5 min-h-[42px] rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Decline
              </button>
              <button
                type="button"
                onClick={async () => {
                  const req = pendingRemoteCameraReq;
                  setPendingRemoteCameraReq(null);
                  if (
                    remoteCameraStreamerRef.current &&
                    remoteCameraStreamerRef.current.getSessionId() === req.sessionId
                  ) {
                    await remoteCameraStreamerRef.current.startCameraStreamer(
                      req.facingMode || 'environment'
                    );
                  }
                }}
                className="flex-1 py-2.5 min-h-[42px] rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold"
              >
                Allow Camera
              </button>
            </div>
          </div>
        </div>
      )}

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
          onAccept={handleAcceptCall}
          onReject={handleRejectCall}
          onEnd={handleEndCall}
          onToggleMute={(muted) => {
            if (activeCall?.id) setNativeCallMuteState(activeCall.id, muted);
            callManagerRef.current?.toggleMute(muted);
          }}
          onToggleCamera={(enabled) => callManagerRef.current?.toggleCamera(enabled)}
          onToggleSpeakerphone={(enabled) => {
            setNativeCallAudioRoute(enabled ? 'speaker' : 'earpiece');
            callManagerRef.current?.toggleSpeakerphone(enabled);
          }}
          onSwitchCamera={() => callManagerRef.current?.switchCamera()}
          t={t}
        />
      )}

      {/* Root App Update Modal (Auto-check & In-App Notification) */}
      <AppUpdateModal
        isOpen={showAppUpdateModal}
        onClose={() => setShowAppUpdateModal(false)}
        t={t}
        autoCheckOnMount={true}
      />
    </div>
  );
}
