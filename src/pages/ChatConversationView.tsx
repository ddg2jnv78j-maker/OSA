import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  BarChart2,
  BarChart3,
  Battery,
  Bell,
  BellOff,
  Bookmark,
  Check,
  CheckCheck,
  CheckCircle2,
  Clock,
  Copy,
  CornerUpLeft,
  CornerUpRight,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Flame,
  Ghost,
  Globe,
  Heart,
  Image as ImageIcon,
  Info,
  Link,
  Lock,
  Camera,
  MapPin,
  Mic,
  MicOff,
  MoreVertical,
  Music,
  Paperclip,
  Pause,
  Pencil,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  Pin,
  PinOff,
  Play,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Send,
  Share2,
  ShieldAlert,
  Smartphone,
  Smile,
  Sparkles,
  Square,
  ThumbsUp,
  Timer,
  Trash2,
  Unlock,
  UserMinus,
  UserPlus,
  Video,
  Volume2,
  X,
} from 'lucide-react';
import { OSAAvatar } from '../components/OSAAvatar';
import { RemoteCameraModal } from '../components/RemoteCameraModal';
import { RemoteLocationModal } from '../components/RemoteLocationModal';
import { ReportUserModal } from '../components/ReportUserModal';
import { RingtoneModal } from '../components/RingtoneSelector';
import { AffiliateProductCard } from '../components/AffiliateProductCard';
import { AffiliateProduct } from '../types/osa';
import { TranslationDictionary } from '../lib/i18n';
import { supabase } from '../lib/supabase';
import {
  generateSmartDraftOrReply,
  queryShoppingAssistant,
  transcribeVoiceMessage,
} from '../services/aiService';
import {
  CHAT_TRANSLATION_LANG_CHANGED_EVENT,
  CHAT_TRANSLATION_LANGUAGES,
  ChatTranslationLanguageCode,
  detectMessageLanguage,
  getCachedTranslation,
  getChatTranslationLanguage,
  getTranslationLanguageOption,
  isMessageTranslatable,
  saveChatTranslationLanguage,
  translateChatMessageText,
} from '../services/translationService';
import {
  ChatLocationData,
  formatLocationChatMessage,
  getCurrentDeviceLocation,
  parseLocationChatMessage,
} from '../services/permissionService';
import {
  addMembersToGroup,
  approveGroupJoinRequest,
  blockUser,
  clearChatForUser,
  createNotification,
  deleteGroupCompletely,
  fetchGroupJoinRequests,
  getGroupApprovalSetting,
  rejectGroupJoinRequest,
  setGroupApprovalSetting,
  GroupJoinRequest,
  deleteMessageForEveryone,
  deleteMessageForMe,
  editMessageContent,
  fetchChatMessages,
  fetchConversationCallHistory,
  fetchGroupMembers,
  formatBytes,
  generateGroupInviteLink,
  getDetailedBlockStatus,
  markChatAsRead,
  removeMemberFromGroup,
  searchUsers,
  sendMediaAttachmentMessage,
  sendTextMessage,
  toggleChatMute,
  unblockUser,
  updateGroupDetails,
  updateGroupMemberRole,
} from '../services/osaService';
import {
  formatDailyDateHeader,
  formatLastSeenText,
  getProfileLastSeenIso,
  isProfileTrulyOnline,
} from '../services/presenceService';
import {
  CallRecord,
  CallType,
  Chat,
  GroupMember,
  Message,
  PrivacySettings,
  Profile,
} from '../types/osa';

interface ChatConversationViewProps {
  chat: Chat;
  allChats: Chat[];
  currentUser: Profile;
  myPrivacy: PrivacySettings | null;
  peerPrivacy: PrivacySettings | null;
  onBack: () => void;
  onStartCall: (peer: Profile, callType: CallType, chatId: string) => void;
  onChatUpdated: () => void;
  t: TranslationDictionary;
}

const COMMON_EMOJIS = [
  '😀', '😂', '🥹', '😍', '🤩', '😎', '🙏', '👍',
  '❤️', '🔥', '🎉', '✨', '💯', '👏', '🤝', '🚀',
];

export const ChatConversationView: React.FC<ChatConversationViewProps> = ({
  chat,
  allChats,
  currentUser,
  myPrivacy,
  peerPrivacy,
  onBack,
  onStartCall,
  onChatUpdated,
  t,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatCalls, setChatCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState('');

  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingMsg, setEditingMsg] = useState<Message | null>(null);
  const [aiDrafting, setAiDrafting] = useState(false);
  const [activeMenuMsgId, setActiveMenuMsgId] = useState<string | null>(null);
  const [forwardModalMsg, setForwardModalMsg] = useState<Message | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);
  const [showRemoteCameraModal, setShowRemoteCameraModal] = useState(false);
  const [showRemoteLocationModal, setShowRemoteLocationModal] = useState(false);
  const [showRingtoneModal, setShowRingtoneModal] = useState(false);
  const [showTranslationModal, setShowTranslationModal] = useState(false);
  const [selectedLocationCard, setSelectedLocationCard] = useState<ChatLocationData | null>(null);
  const [sharingLocation, setSharingLocation] = useState(false);

  // Per-user Automatic Chat Message Translation state
  const [chatTranslationLang, setChatTranslationLang] =
    useState<ChatTranslationLanguageCode>(() =>
      getChatTranslationLanguage(currentUser.id, currentUser.language)
    );
  const [translationsMap, setTranslationsMap] = useState<
    Record<
      string,
      {
        status: 'translating' | 'translated' | 'same-language' | 'failed';
        translatedText: string | null;
        targetLang: ChatTranslationLanguageCode;
        sourceContent: string;
      }
    >
  >({});
  const [showOriginalMap, setShowOriginalMap] = useState<Record<string, boolean>>({});

  // Realtime & Typing state
  const [peerIsTyping, setPeerIsTyping] = useState(false);
  const [typingUserName, setTypingUserName] = useState<string>('');
  const [activeGroupCall, setActiveGroupCall] = useState<{
    callerId: string;
    callerName: string;
    callerAvatar?: string | null;
    callType: CallType;
    startedAt: string;
  } | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<'SUBSCRIBED' | 'RECONNECTING'>('SUBSCRIBED');
  const [peerPermissions, setPeerPermissions] = useState<{
    allowRemoteCamera: boolean;
    allowRemoteLocation: boolean;
  }>({ allowRemoteCamera: false, allowRemoteLocation: false });

  // Voice Message UI & Presentation State
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [voiceDurationSeconds, setVoiceDurationSeconds] = useState(0);
  const [isVoicePaused, setIsVoicePaused] = useState(false);
  const [voicePermissionDenied, setVoicePermissionDenied] = useState(false);
  const [waveformLevels, setWaveformLevels] = useState<number[]>([
    25, 45, 60, 35, 80, 95, 70, 50, 85, 65, 40, 75, 90, 55, 35, 70, 85, 60, 45, 65,
  ]);
  const [playingVoiceMsgId, setPlayingVoiceMsgId] = useState<string | null>(null);
  const [voicePlaybackProgress, setVoicePlaybackProgress] = useState<number>(0);

  // Voice recording duration timer & animated waveform
  useEffect(() => {
    if (!isRecordingVoice || isVoicePaused) return;
    const interval = window.setInterval(() => {
      setVoiceDurationSeconds((prev) => prev + 1);
      setWaveformLevels((prev) =>
        prev.map(() => Math.floor(Math.random() * 70) + 20)
      );
    }, 500);
    return () => clearInterval(interval);
  }, [isRecordingVoice, isVoicePaused]);

  // Voice playback preview progress simulation
  useEffect(() => {
    if (!playingVoiceMsgId) return;
    const interval = window.setInterval(() => {
      setVoicePlaybackProgress((prev) => {
        if (prev >= 100) {
          setPlayingVoiceMsgId(null);
          return 0;
        }
        return prev + 10;
      });
    }, 300);
    return () => clearInterval(interval);
  }, [playingVoiceMsgId]);

  // Chat Info Drawer
  const [showChatInfo, setShowChatInfo] = useState(false);
  const [infoTab, setInfoTab] = useState<'media' | 'files' | 'links' | 'calls' | 'members' | 'insights'>('media');
  const [searchInChatOpen, setSearchInChatOpen] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [isMuted, setIsMuted] = useState(Boolean(chat.my_membership?.is_muted));

  // Block & Report
  const [blockState, setBlockState] = useState({
    blockedByMe: false,
    blockedByPeer: false,
    anyBlock: false,
  });
  const [showReportModal, setShowReportModal] = useState(false);

  // Group Admin state
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [editGroupName, setEditGroupName] = useState(chat.group?.name || '');
  const [editGroupDesc, setEditGroupDesc] = useState(chat.group?.description || '');
  const [savingGroupInfo, setSavingGroupInfo] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [candidateUsers, setCandidateUsers] = useState<Profile[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [generatedInviteUrl, setGeneratedInviteUrl] = useState('');

  // WhatsApp-Style '+' Action Menu State
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);

  // 1. View Once Media State
  const [isViewOnceNext, setIsViewOnceNext] = useState(false);
  const [activeViewOnceMedia, setActiveViewOnceMedia] = useState<{
    id: string;
    url: string;
    type: 'image' | 'video';
    name: string;
  } | null>(null);

  // 2. Pinned Message State
  const [pinnedMessageId, setPinnedMessageId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(`osa_pinned_msg_${chat.id}`) || null;
    } catch {
      return null;
    }
  });

  // 3. Disappearing Messages State (0 = Off, 86400000 = 24h, 604800000 = 7d)
  const [disappearingTimer, setDisappearingTimer] = useState<number>(() => {
    try {
      return Number(localStorage.getItem(`osa_disappearing_timer_${chat.id}`) || 0);
    } catch {
      return 0;
    }
  });
  const [showDisappearingModal, setShowDisappearingModal] = useState(false);

  // 4. Message Scheduling State
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showScheduledListModal, setShowScheduledListModal] = useState(false);
  const [scheduleTargetDate, setScheduleTargetDate] = useState('');
  const [scheduleTargetTime, setScheduleTargetTime] = useState('');
  const [scheduledMessages, setScheduledMessages] = useState<
    Array<{ id: string; content: string; targetTime: number; replyToId?: string | null }>
  >(() => {
    try {
      const raw = localStorage.getItem(`osa_scheduled_msgs_${chat.id}`);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  // 5. Group Poll State
  const [showCreatePollModal, setShowCreatePollModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [pollAllowMultiple, setPollAllowMultiple] = useState(false);

  // 6. Chat Lock State
  const [chatLockPin, setChatLockPin] = useState<string>(() => {
    try {
      return localStorage.getItem(`osa_chat_lock_${chat.id}`) || '';
    } catch {
      return '';
    }
  });
  const [showChatLockModal, setShowChatLockModal] = useState(false);
  const [tempLockPin, setTempLockPin] = useState('');

  // 7. Group Join Request State
  const [requireApproval, setRequireApproval] = useState<boolean>(() => {
    return chat.group_id ? getGroupApprovalSetting(chat.group_id) : false;
  });
  const [pendingJoinRequests, setPendingJoinRequests] = useState<GroupJoinRequest[]>(() => {
    return chat.group_id ? fetchGroupJoinRequests(chat.group_id) : [];
  });

  // ==========================================
  // 6 FLAGSHIP FEATURES STATE & REFS
  // ==========================================

  // Feature 1: Message Emoji Reactions
  const REACTION_EMOJIS = ['❤️', '👍', '😂', '😮', '😢', '🙏', '🔥'];
  const [messageReactions, setMessageReactions] = useState<
    Record<string, Record<string, string[]>>
  >(() => {
    try {
      const raw = localStorage.getItem(`osa_reactions_${chat.id}`);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [activeReactionMsgId, setActiveReactionMsgId] = useState<string | null>(null);

  // Feature 2: Round Instant Video Notes
  const [showVideoNoteModal, setShowVideoNoteModal] = useState(false);
  const [isVideoNoteRecording, setIsVideoNoteRecording] = useState(false);
  const [videoNoteDuration, setVideoNoteDuration] = useState(0);
  const [videoNoteFacingMode, setVideoNoteFacingMode] = useState<'user' | 'environment'>('user');
  const [videoNoteRecordedBlob, setVideoNoteRecordedBlob] = useState<Blob | null>(null);
  const [videoNotePreviewUrl, setVideoNotePreviewUrl] = useState<string | null>(null);
  const [videoNoteSending, setVideoNoteSending] = useState(false);
  const videoNoteStreamRef = useRef<MediaStream | null>(null);
  const videoNoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const videoNoteRecorderRef = useRef<MediaRecorder | null>(null);
  const videoNoteChunksRef = useRef<Blob[]>([]);
  const videoNoteTimerRef = useRef<number | null>(null);

  // Feature 3: Voice Message Transcription
  const [transcriptions, setTranscriptions] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem(`osa_transcripts_${chat.id}`);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [transcribingMsgIds, setTranscribingMsgIds] = useState<Record<string, boolean>>({});
  const [showTranscriptMap, setShowTranscriptMap] = useState<Record<string, boolean>>({});

  // Feature 4: Emergency SOS Alert Beacon
  const [showSosModal, setShowSosModal] = useState(false);
  const [sosCountdown, setSosCountdown] = useState(3);
  const [isSendingSos, setIsSendingSos] = useState(false);
  const sosTimerRef = useRef<number | null>(null);

  // Feature 5: Ghost Mode / Incognito Presence
  const [ghostModeActive, setGhostModeActive] = useState<boolean>(() => {
    try {
      return localStorage.getItem('osa_ghost_mode') === 'true';
    } catch {
      return false;
    }
  });

  // Feature 6: Group Split Bill / Expense Tracker
  const [showSplitBillModal, setShowSplitBillModal] = useState(false);
  const [splitBillTitle, setSplitBillTitle] = useState('');
  const [splitBillTotal, setSplitBillTotal] = useState('');
  const [splitBillNote, setSplitBillNote] = useState('');
  const [splitBillSubmitting, setSplitBillSubmitting] = useState(false);

  const chatViewportRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const groupPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const lastBroadcastTypingRef = useRef<number>(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const isGroup = chat.type === 'group';
  const peer = chat.peer || null;
  const chatTitle = isGroup
    ? chat.group?.name || 'OSA Group'
    : peer?.full_name || 'OSA User';
  const chatAvatar = isGroup ? chat.group?.avatar_url : peer?.avatar_url;

  const canShowPeerOnline = !isGroup && peer && (peerPrivacy ? peerPrivacy.online_status : true);
  const canShowPeerLastSeen =
    !isGroup && peer && (!peerPrivacy || peerPrivacy.last_seen_visibility !== 'nobody');
  const hidePeerPhoto = !isGroup && peerPrivacy?.profile_photo_visibility === 'nobody';
  const peerTrulyOnline = Boolean(canShowPeerOnline && isProfileTrulyOnline(peer));
  const peerLastSeenFormatted =
    !isGroup && peer && !peerTrulyOnline && canShowPeerLastSeen
      ? formatLastSeenText(getProfileLastSeenIso(peer), t, currentUser.language)
      : null;

  const scrollToBottom = (smooth = true) => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTo({
      top: container.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    });
  };

  // Keep mobile visualViewport (iPhone/Android virtual keyboard) synced without breaking fixed header/composer
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const handleViewportChange = () => {
      if (window.scrollY !== 0 || window.scrollX !== 0) {
        window.scrollTo(0, 0);
      }
      const rootEl = chatViewportRef.current;
      if (!rootEl) return;
      if (window.innerWidth < 768 && vv.height > 0 && vv.height < window.innerHeight) {
        rootEl.style.setProperty('--osa-vv-height', `${Math.round(vv.height)}px`);
      } else {
        rootEl.style.removeProperty('--osa-vv-height');
      }
    };

    vv.addEventListener('resize', handleViewportChange);
    vv.addEventListener('scroll', handleViewportChange);
    return () => {
      vv.removeEventListener('resize', handleViewportChange);
      vv.removeEventListener('scroll', handleViewportChange);
    };
  }, []);

  const loadMessagesAndMeta = async () => {
    try {
      const [msgs, callsList] = await Promise.all([
        fetchChatMessages(
          chat.id,
          currentUser.id,
          chat.my_membership?.cleared_at
        ),
        !isGroup
          ? fetchConversationCallHistory(chat.id, currentUser.id, peer?.id).catch(() => [])
          : Promise.resolve([] as CallRecord[]),
      ]);
      setMessages(msgs);
      const clearedTime = chat.my_membership?.cleared_at
        ? new Date(chat.my_membership.cleared_at).getTime()
        : 0;
      setChatCalls(
        clearedTime
          ? callsList.filter((c) => new Date(c.created_at).getTime() > clearedTime)
          : callsList
      );
      if (!ghostModeActive) {
        await markChatAsRead(
          chat.id,
          currentUser.id,
          myPrivacy ? myPrivacy.read_receipts : true
        );
      }
      if (!isGroup && peer) {
        const blk = await getDetailedBlockStatus(currentUser.id, peer.id);
        setBlockState(blk);

        let camAllowed = false;
        let locAllowed = false;

        // Query Supabase first as source of truth: peer (owner) granting permission to me (target)
        try {
          const res = await supabase
            .from('user_contact_permissions')
            .select('allow_remote_camera, allow_remote_location')
            .eq('owner_user_id', peer.id)
            .eq('target_user_id', currentUser.id)
            .maybeSingle();

          if (res.data) {
            camAllowed = Boolean(res.data.allow_remote_camera);
            locAllowed = Boolean(res.data.allow_remote_location);
            try {
              localStorage.setItem(
                `osa_contact_perm_${peer.id}_${currentUser.id}`,
                JSON.stringify({ owner_user_id: peer.id, target_user_id: currentUser.id, ...res.data })
              );
            } catch {}
          } else {
            try {
              const cached = localStorage.getItem(`osa_contact_perm_${peer.id}_${currentUser.id}`);
              if (cached) {
                const p = JSON.parse(cached);
                camAllowed = Boolean(p.allow_remote_camera);
                locAllowed = Boolean(p.allow_remote_location);
              } else {
                const globalRes = await supabase
                  .from('user_permissions')
                  .select('allow_remote_camera, allow_remote_location')
                  .eq('user_id', peer.id)
                  .maybeSingle();
                if (globalRes.data) {
                  camAllowed = Boolean(globalRes.data.allow_remote_camera);
                  locAllowed = Boolean(globalRes.data.allow_remote_location);
                }
              }
            } catch {}
          }
        } catch {
          try {
            const cached = localStorage.getItem(`osa_contact_perm_${peer.id}_${currentUser.id}`);
            if (cached) {
              const p = JSON.parse(cached);
              camAllowed = Boolean(p.allow_remote_camera);
              locAllowed = Boolean(p.allow_remote_location);
            }
          } catch {}
        }

        setPeerPermissions({
          allowRemoteCamera: camAllowed,
          allowRemoteLocation: locAllowed,
        });
      }
      if (isGroup && chat.group_id) {
        const mems = await fetchGroupMembers(chat.group_id);
        setGroupMembers(mems);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversation.');
    } finally {
      setLoading(false);
      requestAnimationFrame(() => scrollToBottom(false));
    }
  };

  useEffect(() => {
    setLoading(true);
    setIsMuted(Boolean(chat.my_membership?.is_muted));
    setEditGroupName(chat.group?.name || '');
    setEditGroupDesc(chat.group?.description || '');
    loadMessagesAndMeta();
  }, [chat.id]);

  useEffect(() => {
    requestAnimationFrame(() => scrollToBottom(false));
  }, [messages.length, chatCalls.length, peerIsTyping]);

  // Periodic background check for peer permissions so icon updates instantly
  useEffect(() => {
    if (isGroup || !peer || !currentUser) return;
    const interval = setInterval(async () => {
      try {
        let camAllowed = false;
        let locAllowed = false;

        const res = await supabase
          .from('user_contact_permissions')
          .select('allow_remote_camera, allow_remote_location')
          .eq('owner_user_id', peer.id)
          .eq('target_user_id', currentUser.id)
          .maybeSingle();

        if (res.data) {
          camAllowed = Boolean(res.data.allow_remote_camera);
          locAllowed = Boolean(res.data.allow_remote_location);
          try {
            localStorage.setItem(
              `osa_contact_perm_${peer.id}_${currentUser.id}`,
              JSON.stringify({ owner_user_id: peer.id, target_user_id: currentUser.id, ...res.data })
            );
          } catch {}
        } else {
          try {
            const cached = localStorage.getItem(`osa_contact_perm_${peer.id}_${currentUser.id}`);
            if (cached) {
              const p = JSON.parse(cached);
              camAllowed = Boolean(p.allow_remote_camera);
              locAllowed = Boolean(p.allow_remote_location);
            } else {
              const globalRes = await supabase
                .from('user_permissions')
                .select('allow_remote_camera, allow_remote_location')
                .eq('user_id', peer.id)
                .maybeSingle();
              if (globalRes.data) {
                camAllowed = Boolean(globalRes.data.allow_remote_camera);
                locAllowed = Boolean(globalRes.data.allow_remote_location);
              }
            }
          } catch {}
        }

        setPeerPermissions((prev) => {
          if (prev.allowRemoteCamera !== camAllowed || prev.allowRemoteLocation !== locAllowed) {
            return { allowRemoteCamera: camAllowed, allowRemoteLocation: locAllowed };
          }
          return prev;
        });
      } catch {}
    }, 4000);

    return () => clearInterval(interval);
  }, [isGroup, peer?.id, currentUser?.id]);

  // Listen for changes to the user's preferred Chat Translation Language
  useEffect(() => {
    setChatTranslationLang(
      getChatTranslationLanguage(currentUser.id, currentUser.language)
    );
    const handleTransLangChange = () => {
      setChatTranslationLang(
        getChatTranslationLanguage(currentUser.id, currentUser.language)
      );
    };
    window.addEventListener(
      CHAT_TRANSLATION_LANG_CHANGED_EVENT,
      handleTransLangChange
    );
    return () => {
      window.removeEventListener(
        CHAT_TRANSLATION_LANG_CHANGED_EVENT,
        handleTransLangChange
      );
    };
  }, [currentUser.id, currentUser.language]);

  // Asynchronously translate incoming messages from other users into currentUser's preferred language
  useEffect(() => {
    if (chatTranslationLang === 'off' || messages.length === 0) return;

    let cancelled = false;

    for (const msg of messages) {
      if (!isMessageTranslatable(msg, currentUser.id)) continue;

      const detected = detectMessageLanguage(msg.content);
      if (detected === chatTranslationLang) continue;

      const existing = translationsMap[msg.id];
      if (
        existing &&
        existing.targetLang === chatTranslationLang &&
        existing.sourceContent === msg.content &&
        (existing.status === 'translated' ||
          existing.status === 'same-language' ||
          existing.status === 'translating')
      ) {
        continue;
      }

      const syncCached = getCachedTranslation(msg.content, chatTranslationLang);
      if (syncCached) {
        setTranslationsMap((prev) => ({
          ...prev,
          [msg.id]: {
            status: 'translated',
            translatedText: syncCached,
            targetLang: chatTranslationLang,
            sourceContent: msg.content,
          },
        }));
        continue;
      }

      setTranslationsMap((prev) => ({
        ...prev,
        [msg.id]: {
          status: 'translating',
          translatedText: null,
          targetLang: chatTranslationLang,
          sourceContent: msg.content,
        },
      }));

      translateChatMessageText(msg.content, chatTranslationLang)
        .then((res) => {
          if (cancelled) return;
          setTranslationsMap((prev) => ({
            ...prev,
            [msg.id]: {
              status: res.status,
              translatedText: res.translatedText,
              targetLang: chatTranslationLang,
              sourceContent: msg.content,
            },
          }));
        })
        .catch(() => {
          if (cancelled) return;
          setTranslationsMap((prev) => ({
            ...prev,
            [msg.id]: {
              status: 'failed',
              translatedText: null,
              targetLang: chatTranslationLang,
              sourceContent: msg.content,
            },
          }));
        });
    }

    return () => {
      cancelled = true;
    };
  }, [messages, chatTranslationLang, currentUser.id]);

  // Realtime subscription for messages, attachments, and typing broadcast
  useEffect(() => {
    const channel = supabase
      .channel(`osa-chat-room-${chat.id}`, {
        config: {
          broadcast: { self: false },
          presence: { key: currentUser.id },
        },
      })
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `chat_id=eq.${chat.id}`,
        },
        async () => {
          const fresh = await fetchChatMessages(
            chat.id,
            currentUser.id,
            chat.my_membership?.cleared_at
          );
          setMessages(fresh);
          if (!ghostModeActive) {
            await markChatAsRead(
              chat.id,
              currentUser.id,
              myPrivacy ? myPrivacy.read_receipts : true
            );
          }
          onChatUpdated();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_attachments',
          filter: `chat_id=eq.${chat.id}`,
        },
        async () => {
          const fresh = await fetchChatMessages(
            chat.id,
            currentUser.id,
            chat.my_membership?.cleared_at
          );
          setMessages(fresh);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'calls',
        },
        async () => {
          if (!isGroup) {
            const freshCalls = await fetchConversationCallHistory(
              chat.id,
              currentUser.id,
              peer?.id
            ).catch(() => []);
            const clearedTime = chat.my_membership?.cleared_at
              ? new Date(chat.my_membership.cleared_at).getTime()
              : 0;
            setChatCalls(
              clearedTime
                ? freshCalls.filter((c) => new Date(c.created_at).getTime() > clearedTime)
                : freshCalls
            );
          }
        }
      )
      .on('broadcast', { event: 'typing' }, (payload) => {
        const senderId = payload.payload?.userId as string | undefined;
        const senderName = payload.payload?.name as string | undefined;
        const isTyping = payload.payload?.isTyping !== false;
        if (senderId && senderId !== currentUser.id) {
          if (isTyping) {
            setPeerIsTyping(true);
            if (senderName) setTypingUserName(senderName);
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = window.setTimeout(() => {
              setPeerIsTyping(false);
              setTypingUserName('');
            }, 3000);
          } else {
            setPeerIsTyping(false);
            setTypingUserName('');
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          }
        }
      })
      .on('broadcast', { event: 'group_call_invite' }, (payload) => {
        const data = payload.payload;
        if (data && data.callerId !== currentUser.id) {
          setActiveGroupCall({
            callerId: data.callerId,
            callerName: data.callerName,
            callerAvatar: data.callerAvatar,
            callType: data.callType || 'audio',
            startedAt: data.startedAt || new Date().toISOString(),
          });
        }
      })
      .on('broadcast', { event: 'pinned_message' }, (payload) => {
        const msgId = payload.payload?.messageId || null;
        setPinnedMessageId(msgId);
        try {
          if (msgId) {
            localStorage.setItem(`osa_pinned_msg_${chat.id}`, msgId);
          } else {
            localStorage.removeItem(`osa_pinned_msg_${chat.id}`);
          }
        } catch {}
      })
      .on('broadcast', { event: 'disappearing_timer' }, (payload) => {
        const timerVal = Number(payload.payload?.timer || 0);
        setDisappearingTimer(timerVal);
        try {
          localStorage.setItem(`osa_disappearing_timer_${chat.id}`, String(timerVal));
        } catch {}
      })
      .on('broadcast', { event: 'poll_vote' }, (payload) => {
        const { messageId, updatedContent } = payload.payload || {};
        if (messageId && updatedContent) {
          setMessages((prev) =>
            prev.map((m) => (m.id === messageId ? { ...m, content: updatedContent } : m))
          );
        }
      })
      .on('broadcast', { event: 'message_reaction' }, (payload) => {
        const { messageId, emoji, userId } = payload.payload || {};
        if (messageId && emoji && userId) {
          setMessageReactions((prev) => {
            const currentMsg = { ...(prev[messageId] || {}) };
            const list = currentMsg[emoji] || [];
            let updatedList: string[];
            if (list.includes(userId)) {
              updatedList = list.filter((id) => id !== userId);
            } else {
              updatedList = [...list, userId];
            }
            if (updatedList.length === 0) {
              delete currentMsg[emoji];
            } else {
              currentMsg[emoji] = updatedList;
            }
            const next = { ...prev, [messageId]: currentMsg };
            try {
              localStorage.setItem(`osa_reactions_${chat.id}`, JSON.stringify(next));
            } catch {}
            return next;
          });
        }
      })
      .on('broadcast', { event: 'split_bill_update' }, (payload) => {
        const { messageId, updatedContent } = payload.payload || {};
        if (messageId && updatedContent) {
          setMessages((prev) =>
            prev.map((m) => (m.id === messageId ? { ...m, content: updatedContent } : m))
          );
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setRealtimeStatus('SUBSCRIBED');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setRealtimeStatus('RECONNECTING');
        }
      });

    channelRef.current = channel;

    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      setPeerIsTyping(false);
      setTypingUserName('');
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [chat.id, currentUser.id]);

  const handleTypingChange = (val: string) => {
    setText(val);
    if (!channelRef.current || (myPrivacy && !myPrivacy.typing_indicator) || ghostModeActive) return;

    if (!val.trim()) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: { userId: currentUser.id, name: currentUser.full_name, isTyping: false },
      });
      return;
    }

    const now = Date.now();
    if (now - lastBroadcastTypingRef.current > 1200) {
      lastBroadcastTypingRef.current = now;
      channelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: { userId: currentUser.id, name: currentUser.full_name, isTyping: true },
      });
    }
  };

  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = text.trim();
    if (!clean || sending) return;

    if (!isGroup && blockState.anyBlock) {
      setError('Messaging is disabled because a block is active on this conversation.');
      return;
    }

    setSending(true);
    setError('');
    try {
      if (editingMsg) {
        const updated = await editMessageContent(editingMsg.id, currentUser.id, clean);
        setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
        setEditingMsg(null);
        setText('');
        setShowEmojiPicker(false);
        onChatUpdated();
        return;
      }

      const sent = await sendTextMessage({
        chatId: chat.id,
        senderId: currentUser.id,
        content: clean,
        replyToId: replyTo?.id || null,
      });
      setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
      setText('');
      setReplyTo(null);
      setShowEmojiPicker(false);

      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'typing',
          payload: { userId: currentUser.id, name: currentUser.full_name, isTyping: false },
        });
      }

      // Notify recipients
      if (!isGroup && peer) {
        await createNotification({
          userId: peer.id,
          actorId: currentUser.id,
          type: 'new_message',
          title: currentUser.full_name,
          body: clean.slice(0, 100),
          referenceId: sent.id,
          chatId: chat.id,
        });
      } else if (isGroup && chat.members) {
        for (const mem of chat.members) {
          if (mem.user_id !== currentUser.id && !mem.is_muted) {
            await createNotification({
              userId: mem.user_id,
              actorId: currentUser.id,
              type: 'group_message',
              title: `${currentUser.full_name} in ${chatTitle}`,
              body: clean.slice(0, 100),
              referenceId: sent.id,
              chatId: chat.id,
            });
          }
        }
      }
      onChatUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  const handleStartVoiceRecording = () => {
    setError('');
    setVoicePermissionDenied(false);
    setIsRecordingVoice(true);
    setIsVoicePaused(false);
    setVoiceDurationSeconds(0);
  };

  const handleCancelVoiceRecording = () => {
    setIsRecordingVoice(false);
    setIsVoicePaused(false);
    setVoiceDurationSeconds(0);
  };

  const handleTogglePauseVoiceRecording = () => {
    setIsVoicePaused((prev) => !prev);
  };

  const handleSendVoiceMessage = async () => {
    const duration = voiceDurationSeconds || 3;
    const durationText = `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}`;
    setIsRecordingVoice(false);
    setIsVoicePaused(false);
    setVoiceDurationSeconds(0);
    setSending(true);
    try {
      const isBn = currentUser.language === 'bn';
      const label = isBn ? 'ভয়েস বার্তা' : 'Voice Message';
      const clean = `🎤 ${label} (${durationText})`;
      const sent = await sendTextMessage({
        chatId: chat.id,
        senderId: currentUser.id,
        content: clean,
        replyToId: replyTo?.id || null,
      });
      setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
      setReplyTo(null);
      onChatUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send voice message.');
    } finally {
      setSending(false);
    }
  };

  const handleAiDraft = async () => {
    if (aiDrafting) return;
    setAiDrafting(true);
    setError('');
    try {
      // 1. Check if user prompt or draft contains shopping intent
      const shoppingRes = await queryShoppingAssistant(
        text.trim(),
        currentUser.language
      );

      if (shoppingRes.isShopping) {
        // User asked a shopping / product recommendation question
        if (shoppingRes.explanation) {
          const sentExplanation = await sendTextMessage({
            chatId: chat.id,
            senderId: currentUser.id,
            content: `🛍️ **OSA Deals Assistant**\n${shoppingRes.explanation}`,
          });
          setMessages((prev) =>
            prev.some((m) => m.id === sentExplanation.id) ? prev : [...prev, sentExplanation]
          );
        }

        // Send verified catalog deal cards into chat
        for (const cardPayload of shoppingRes.cardMessagePayloads) {
          const sentCard = await sendTextMessage({
            chatId: chat.id,
            senderId: currentUser.id,
            content: cardPayload,
          });
          setMessages((prev) =>
            prev.some((m) => m.id === sentCard.id) ? prev : [...prev, sentCard]
          );
        }

        setText('');
        onChatUpdated();
        return;
      }

      // 2. Fallback to standard smart compose / reply suggestion
      const recentContext = messages
        .filter((m) => !m.is_deleted_for_everyone && m.content.trim())
        .slice(-5)
        .map((m) => ({
          senderName:
            m.sender_id === currentUser.id
              ? currentUser.full_name
              : m.sender?.full_name || chatTitle,
          content: m.content,
        }));
      const suggestion = await generateSmartDraftOrReply({
        draftOrTopic: text,
        recentMessages: recentContext,
      });
      setText(suggestion);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Google AI assistant is currently unavailable.'
      );
    } finally {
      setAiDrafting(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (!isGroup && blockState.anyBlock) {
      setError('File upload is disabled because a block is active.');
      return;
    }

    setError('');
    setUploadProgress(5);
    try {
      const isViewOnce = isViewOnceNext;
      setIsViewOnceNext(false);
      const fileCaption = isViewOnce ? `[VIEW_ONCE] ${text.trim()}`.trim() : text.trim();
      const sent = await sendMediaAttachmentMessage({
        chatId: chat.id,
        senderId: currentUser.id,
        file,
        caption: fileCaption,
        replyToId: replyTo?.id || null,
        onProgress: (pct) => setUploadProgress(pct),
      });
      setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
      setText('');
      setReplyTo(null);

      // Notify recipients of attachment message
      const previewBody =
        sent.message_type === 'image'
          ? 'Photo'
          : sent.message_type === 'video'
          ? 'Video'
          : sent.message_type === 'audio'
          ? 'Voice message'
          : 'File';
      if (!isGroup && peer) {
        await createNotification({
          userId: peer.id,
          actorId: currentUser.id,
          type: 'new_message',
          title: currentUser.full_name,
          body: previewBody,
          referenceId: sent.id,
          chatId: chat.id,
        });
      } else if (isGroup && chat.members) {
        for (const mem of chat.members) {
          if (mem.user_id !== currentUser.id && !mem.is_muted) {
            await createNotification({
              userId: mem.user_id,
              actorId: currentUser.id,
              type: 'group_message',
              title: `${currentUser.full_name} in ${chatTitle}`,
              body: previewBody,
              referenceId: sent.id,
              chatId: chat.id,
            });
          }
        }
      }

      onChatUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Attachment upload failed.');
    } finally {
      setUploadProgress(null);
    }
  };

  const handleCopyMessage = async (msg: Message) => {
    await navigator.clipboard.writeText(msg.content);
    setActiveMenuMsgId(null);
  };

  const handleDeleteForMe = async (msg: Message) => {
    setActiveMenuMsgId(null);
    try {
      await deleteMessageForMe(msg.id, currentUser.id);
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete message.');
    }
  };

  const handleDeleteForEveryone = async (msg: Message) => {
    setActiveMenuMsgId(null);
    try {
      await deleteMessageForEveryone(msg.id, currentUser.id);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id
            ? { ...m, is_deleted_for_everyone: true, content: t.messageDeleted }
            : m
        )
      );
      onChatUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete message for everyone.');
    }
  };

  const handleForwardToChat = async (targetChatId: string) => {
    if (!forwardModalMsg) return;
    try {
      await sendTextMessage({
        chatId: targetChatId,
        senderId: currentUser.id,
        content: forwardModalMsg.content,
        forwardedFromId: forwardModalMsg.id,
      });
      setForwardModalMsg(null);
      onChatUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not forward message.');
    }
  };

  const handleToggleMute = async () => {
    const next = !isMuted;
    setIsMuted(next);
    try {
      await toggleChatMute(chat.id, currentUser.id, next);
      onChatUpdated();
    } catch (err) {
      setIsMuted(!next);
      setError(err instanceof Error ? err.message : 'Failed to update mute setting.');
    }
  };

  const handleClearChat = async () => {
    try {
      await clearChatForUser(chat.id, currentUser.id);
      setMessages([]);
      setShowChatInfo(false);
      onChatUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear chat.');
    }
  };

  const handleBlockToggle = async () => {
    if (!peer) return;
    try {
      if (blockState.blockedByMe) {
        await unblockUser(currentUser.id, peer.id);
      } else {
        await blockUser(currentUser.id, peer.id);
      }
      const updated = await getDetailedBlockStatus(currentUser.id, peer.id);
      setBlockState(updated);
      onChatUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update block status.');
    }
  };

  // Group Admin Actions
  const myGroupRole = groupMembers.find((m) => m.user_id === currentUser.id)?.role || 'member';
  const isGroupAdmin = isGroup && (myGroupRole === 'admin' || chat.group?.created_by === currentUser.id);

  const handleSaveGroupMetadata = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chat.group_id || !isGroupAdmin) return;
    setSavingGroupInfo(true);
    try {
      await updateGroupDetails(chat.group_id, {
        name: editGroupName.trim(),
        description: editGroupDesc.trim(),
      });
      onChatUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update group info.');
    } finally {
      setSavingGroupInfo(false);
    }
  };

  const handleGroupPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !chat.group_id || !isGroupAdmin) return;
    setSavingGroupInfo(true);
    try {
      await updateGroupDetails(chat.group_id, {}, file);
      onChatUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update group photo.');
    } finally {
      setSavingGroupInfo(false);
    }
  };

  const handleOpenAddMember = async () => {
    setShowAddMemberModal(true);
    const results = await searchUsers('', currentUser.id);
    const existingIds = new Set(groupMembers.map((m) => m.user_id));
    setCandidateUsers(results.filter((u) => !existingIds.has(u.id)));
  };

  const handleAddMemberToGroup = async (userId: string) => {
    if (!chat.group_id) return;
    try {
      await addMembersToGroup(chat.group_id, chat.id, [userId]);
      const mems = await fetchGroupMembers(chat.group_id);
      setGroupMembers(mems);
      setCandidateUsers((prev) => prev.filter((u) => u.id !== userId));
      onChatUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add member.');
    }
  };

  const handleRemoveGroupMember = async (targetUserId: string) => {
    if (!chat.group_id) return;
    try {
      await removeMemberFromGroup(chat.group_id, chat.id, targetUserId);
      if (targetUserId === currentUser.id) {
        onChatUpdated();
        onBack();
      } else {
        const mems = await fetchGroupMembers(chat.group_id);
        setGroupMembers(mems);
        onChatUpdated();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member.');
    }
  };

  const handleUpdateMemberRole = async (targetUserId: string, newRole: 'admin' | 'member') => {
    if (!chat.group_id || !isGroupAdmin) return;
    try {
      await updateGroupMemberRole(chat.group_id, chat.id, targetUserId, newRole);
      const mems = await fetchGroupMembers(chat.group_id);
      setGroupMembers(mems);
      onChatUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update member role.');
    }
  };

  const handleDeleteGroup = async () => {
    if (!chat.group_id || !isGroupAdmin) return;
    try {
      await deleteGroupCompletely(chat.group_id);
      onChatUpdated();
      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete group.');
    }
  };

  const handleGenerateInviteLink = () => {
    if (!chat.group_id) return;
    const link = generateGroupInviteLink(chat.group_id, chat.id);
    setGeneratedInviteUrl(link);
    setInviteCopied(false);
    setShowInviteModal(true);
  };

  const handleCopyInviteLink = async () => {
    if (!generatedInviteUrl) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(generatedInviteUrl);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = generatedInviteUrl;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  const handleShareInviteLink = async () => {
    if (!generatedInviteUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join ${chatTitle} on OSA Chat`,
          text: `You're invited to join "${chatTitle}" on OSA Chat!`,
          url: generatedInviteUrl,
        });
        return;
      } catch {
        // User cancelled or unsupported
      }
    }
    handleCopyInviteLink();
  };

  const handleStartGroupCall = async (callType: 'audio' | 'video') => {
    if (!chat.group_id) return;
    const otherMembers = groupMembers.filter((m) => m.user_id !== currentUser.id);
    const primaryPeer: Profile = otherMembers[0]?.profile || peer || {
      id: chat.group?.created_by || currentUser.id,
      email: `${chat.group?.name || 'group'}@osa.chat`,
      full_name: `${chat.group?.name || 'Group'} (Group Call)`,
      avatar_url: chat.group?.avatar_url || null,
      username: 'group',
      about: `Group Call · ${groupMembers.length || 1} members`,
      phone: null,
      is_online: true,
      last_seen: new Date().toISOString(),
      language: currentUser.language,
      theme: currentUser.theme,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'group_call_invite',
        payload: {
          chatId: chat.id,
          groupId: chat.group_id,
          groupName: chat.group?.name || 'Group',
          callerId: currentUser.id,
          callerName: currentUser.full_name,
          callerAvatar: currentUser.avatar_url,
          callType,
          startedAt: new Date().toISOString(),
        },
      });
    }

    sendTextMessage({
      chatId: chat.id,
      senderId: currentUser.id,
      content: `📞 Started a Group ${callType === 'video' ? 'Video' : 'Audio'} Call`,
    }).catch(() => {});

    onStartCall(
      {
        ...primaryPeer,
        full_name: `${chat.group?.name || 'Group'} (Group Call)`,
        avatar_url: chat.group?.avatar_url || primaryPeer.avatar_url,
      },
      callType,
      chat.id
    );
  };

  // 1. Pinned Message Handlers
  const handlePinMessage = (msgId: string) => {
    setPinnedMessageId(msgId);
    try {
      localStorage.setItem(`osa_pinned_msg_${chat.id}`, msgId);
    } catch {}
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'pinned_message',
        payload: { messageId: msgId },
      });
    }
    setActiveMenuMsgId(null);
  };

  const handleUnpinMessage = () => {
    setPinnedMessageId(null);
    try {
      localStorage.removeItem(`osa_pinned_msg_${chat.id}`);
    } catch {}
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'pinned_message',
        payload: { messageId: null },
      });
    }
  };

  // 2. Disappearing Messages Handler
  const handleSetDisappearingTimer = (durationMs: number) => {
    setDisappearingTimer(durationMs);
    try {
      localStorage.setItem(`osa_disappearing_timer_${chat.id}`, String(durationMs));
    } catch {}
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'disappearing_timer',
        payload: { timer: durationMs },
      });
    }
    setShowDisappearingModal(false);
  };

  // 3. Poll Handlers
  const handleCreatePoll = async () => {
    if (!pollQuestion.trim() || pollOptions.filter((o) => o.trim()).length < 2) {
      setError('Please provide a question and at least 2 options.');
      return;
    }
    const cleanOptions = pollOptions
      .filter((o) => o.trim())
      .map((text) => ({
        id: Math.random().toString(36).substring(2, 9),
        text: text.trim(),
        votes: [] as string[],
      }));
    const pollData = {
      type: 'poll',
      question: pollQuestion.trim(),
      allowMultiple: pollAllowMultiple,
      options: cleanOptions,
      creatorId: currentUser.id,
      creatorName: currentUser.full_name,
    };
    const pollContent = `[POLL_DATA]${JSON.stringify(pollData)}`;
    try {
      setSending(true);
      const sent = await sendTextMessage({
        chatId: chat.id,
        senderId: currentUser.id,
        content: pollContent,
      });
      setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
      setShowCreatePollModal(false);
      setPollQuestion('');
      setPollOptions(['', '']);
      setPollAllowMultiple(false);
      onChatUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create poll');
    } finally {
      setSending(false);
    }
  };

  const handleVotePoll = (msg: Message, optionId: string) => {
    try {
      const raw = msg.content.replace('[POLL_DATA]', '');
      const data = JSON.parse(raw);
      const currentUserId = currentUser.id;

      data.options = data.options.map((opt: any) => {
        const hasVoted = (opt.votes || []).includes(currentUserId);
        if (opt.id === optionId) {
          if (hasVoted) {
            return { ...opt, votes: opt.votes.filter((id: string) => id !== currentUserId) };
          } else {
            return { ...opt, votes: [...(opt.votes || []), currentUserId] };
          }
        } else if (!data.allowMultiple) {
          return { ...opt, votes: (opt.votes || []).filter((id: string) => id !== currentUserId) };
        }
        return opt;
      });

      const updatedContent = `[POLL_DATA]${JSON.stringify(data)}`;
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, content: updatedContent } : m))
      );

      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'poll_vote',
          payload: { messageId: msg.id, updatedContent },
        });
      }
    } catch (e) {
      console.error('Failed to vote in poll', e);
    }
  };

  // 4. Message Scheduling Runner & Handlers
  const saveScheduledMessages = (list: typeof scheduledMessages) => {
    setScheduledMessages(list);
    try {
      localStorage.setItem(`osa_scheduled_msgs_${chat.id}`, JSON.stringify(list));
    } catch {}
  };

  const handleScheduleMessage = () => {
    const clean = text.trim();
    if (!clean || !scheduleTargetDate || !scheduleTargetTime) {
      setError('Please provide message content, date, and time.');
      return;
    }
    const targetTime = new Date(`${scheduleTargetDate}T${scheduleTargetTime}`).getTime();
    if (isNaN(targetTime) || targetTime <= Date.now()) {
      setError('Scheduled time must be in the future.');
      return;
    }
    const newScheduled = {
      id: Math.random().toString(36).substring(2, 9),
      content: clean,
      targetTime,
      replyToId: replyTo?.id || null,
    };
    saveScheduledMessages([...scheduledMessages, newScheduled]);
    setText('');
    setReplyTo(null);
    setShowScheduleModal(false);
    setScheduleTargetDate('');
    setScheduleTargetTime('');
  };

  const handleDeleteScheduledMessage = (id: string) => {
    saveScheduledMessages(scheduledMessages.filter((s) => s.id !== id));
  };

  useEffect(() => {
    const timer = setInterval(async () => {
      if (scheduledMessages.length === 0) return;
      const now = Date.now();
      const due = scheduledMessages.filter((s) => s.targetTime <= now);
      if (due.length === 0) return;

      for (const item of due) {
        try {
          const sent = await sendTextMessage({
            chatId: chat.id,
            senderId: currentUser.id,
            content: item.content,
            replyToId: item.replyToId || null,
          });
          setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
        } catch (e) {
          console.error('Failed to send scheduled message', e);
        }
      }
      const remaining = scheduledMessages.filter((s) => s.targetTime > now);
      saveScheduledMessages(remaining);
      onChatUpdated();
    }, 4000);

    return () => clearInterval(timer);
  }, [scheduledMessages, chat.id, currentUser.id]);

  // 5. Chat Lock Handlers
  const handleSaveChatLock = (pin: string) => {
    setChatLockPin(pin);
    try {
      if (pin) {
        localStorage.setItem(`osa_chat_lock_${chat.id}`, pin);
      } else {
        localStorage.removeItem(`osa_chat_lock_${chat.id}`);
      }
    } catch {}
    setShowChatLockModal(false);
    setTempLockPin('');
  };

  // 6. Group Join Request Handlers
  const handleToggleRequireApproval = (val: boolean) => {
    if (!chat.group_id) return;
    setRequireApproval(val);
    setGroupApprovalSetting(chat.group_id, val);
  };

  const handleApproveRequest = async (req: GroupJoinRequest) => {
    if (!chat.group_id) return;
    try {
      await approveGroupJoinRequest(chat.group_id, chat.id, req.userId);
      setPendingJoinRequests(fetchGroupJoinRequests(chat.group_id));
      const members = await fetchGroupMembers(chat.group_id);
      setGroupMembers(members);
    } catch (e) {
      console.error('Failed to add approved member', e);
    }
  };

  const handleRejectRequest = (req: GroupJoinRequest) => {
    if (!chat.group_id) return;
    rejectGroupJoinRequest(chat.group_id, req.userId);
    setPendingJoinRequests(fetchGroupJoinRequests(chat.group_id));
  };

  // 7. View Once Open Status
  const isViewOnceOpened = (msgId: string) => {
    try {
      return localStorage.getItem(`osa_view_once_opened_${msgId}_${currentUser.id}`) === 'true';
    } catch {
      return false;
    }
  };

  const handleOpenViewOnce = (msg: Message, attachment: any) => {
    setActiveViewOnceMedia({
      id: msg.id,
      url: attachment.file_url,
      type: attachment.file_type === 'video' ? 'video' : 'image',
      name: attachment.file_name || 'View Once Media',
    });
    try {
      localStorage.setItem(`osa_view_once_opened_${msg.id}_${currentUser.id}`, 'true');
    } catch {}
  };

  // -------------------------------------------------------------
  // Feature 1: Message Emoji Reactions Handler
  // -------------------------------------------------------------
  const handleToggleReaction = (messageId: string, emoji: string) => {
    setMessageReactions((prev) => {
      const currentMsg = { ...(prev[messageId] || {}) };
      const list = currentMsg[emoji] || [];
      let updatedList: string[];
      if (list.includes(currentUser.id)) {
        updatedList = list.filter((id) => id !== currentUser.id);
      } else {
        updatedList = [...list, currentUser.id];
      }
      if (updatedList.length === 0) {
        delete currentMsg[emoji];
      } else {
        currentMsg[emoji] = updatedList;
      }
      const next = { ...prev, [messageId]: currentMsg };
      try {
        localStorage.setItem(`osa_reactions_${chat.id}`, JSON.stringify(next));
      } catch {}
      return next;
    });

    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'message_reaction',
        payload: { messageId, emoji, userId: currentUser.id },
      });
    }
    setActiveReactionMsgId(null);
  };

  // -------------------------------------------------------------
  // Feature 2: Round Instant Video Notes Handlers
  // -------------------------------------------------------------
  const handleOpenVideoNoteModal = async () => {
    setShowAttachmentMenu(false);
    setShowVideoNoteModal(true);
    setIsVideoNoteRecording(false);
    setVideoNoteDuration(0);
    setVideoNoteRecordedBlob(null);
    setVideoNotePreviewUrl(null);
    videoNoteChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: videoNoteFacingMode,
          width: { ideal: 480 },
          height: { ideal: 480 },
        },
        audio: true,
      });
      videoNoteStreamRef.current = stream;
      if (videoNoteVideoRef.current) {
        videoNoteVideoRef.current.srcObject = stream;
        videoNoteVideoRef.current.play().catch(() => {});
      }
    } catch {
      setError('Unable to access camera or microphone for video note.');
      setShowVideoNoteModal(false);
    }
  };

  const handleFlipVideoNoteCamera = async () => {
    if (isVideoNoteRecording) return;
    const newFacing = videoNoteFacingMode === 'user' ? 'environment' : 'user';
    setVideoNoteFacingMode(newFacing);
    if (videoNoteStreamRef.current) {
      videoNoteStreamRef.current.getTracks().forEach((t) => t.stop());
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: newFacing,
          width: { ideal: 480 },
          height: { ideal: 480 },
        },
        audio: true,
      });
      videoNoteStreamRef.current = stream;
      if (videoNoteVideoRef.current) {
        videoNoteVideoRef.current.srcObject = stream;
        videoNoteVideoRef.current.play().catch(() => {});
      }
    } catch (err) {
      console.warn('Could not flip camera', err);
    }
  };

  const handleStartVideoNoteRecording = () => {
    if (!videoNoteStreamRef.current) return;
    videoNoteChunksRef.current = [];
    setIsVideoNoteRecording(true);
    setVideoNoteDuration(0);

    let mimeType = 'video/webm;codecs=vp8,opus';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/mp4';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = '';
      }
    }

    try {
      const recorder = mimeType
        ? new MediaRecorder(videoNoteStreamRef.current, { mimeType })
        : new MediaRecorder(videoNoteStreamRef.current);

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          videoNoteChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(videoNoteChunksRef.current, {
          type: recorder.mimeType || 'video/webm',
        });
        setVideoNoteRecordedBlob(blob);
        const url = URL.createObjectURL(blob);
        setVideoNotePreviewUrl(url);
      };

      videoNoteRecorderRef.current = recorder;
      recorder.start(250);

      videoNoteTimerRef.current = window.setInterval(() => {
        setVideoNoteDuration((prev) => {
          if (prev >= 59) {
            handleStopVideoNoteRecording();
            return 60;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (e) {
      console.error('Failed to start video recording', e);
      setIsVideoNoteRecording(false);
    }
  };

  const handleStopVideoNoteRecording = () => {
    if (videoNoteTimerRef.current) {
      clearInterval(videoNoteTimerRef.current);
      videoNoteTimerRef.current = null;
    }
    setIsVideoNoteRecording(false);
    if (
      videoNoteRecorderRef.current &&
      videoNoteRecorderRef.current.state === 'recording'
    ) {
      videoNoteRecorderRef.current.stop();
    }
  };

  const handleSendVideoNote = async () => {
    if (!videoNoteRecordedBlob) return;
    setVideoNoteSending(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const base64Data = reader.result as string;
          const payload = {
            videoUrl: base64Data,
            duration: videoNoteDuration || 1,
            timestamp: new Date().toISOString(),
          };
          const content = `[VIDEO_NOTE]${JSON.stringify(payload)}`;
          const sent = await sendTextMessage({
            chatId: chat.id,
            senderId: currentUser.id,
            content,
          });
          setMessages((prev) =>
            prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]
          );
          handleCloseVideoNoteModal();
          onChatUpdated();
        } catch (err) {
          setError(
            err instanceof Error ? err.message : 'Failed to send video note.'
          );
        } finally {
          setVideoNoteSending(false);
        }
      };
      reader.readAsDataURL(videoNoteRecordedBlob);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to process video note.'
      );
      setVideoNoteSending(false);
    }
  };

  const handleCloseVideoNoteModal = () => {
    if (videoNoteTimerRef.current) {
      clearInterval(videoNoteTimerRef.current);
      videoNoteTimerRef.current = null;
    }
    if (
      videoNoteRecorderRef.current &&
      videoNoteRecorderRef.current.state === 'recording'
    ) {
      try {
        videoNoteRecorderRef.current.stop();
      } catch {}
    }
    if (videoNoteStreamRef.current) {
      videoNoteStreamRef.current.getTracks().forEach((t) => t.stop());
      videoNoteStreamRef.current = null;
    }
    setShowVideoNoteModal(false);
    setIsVideoNoteRecording(false);
    setVideoNoteRecordedBlob(null);
    setVideoNotePreviewUrl(null);
    setVideoNoteDuration(0);
    setVideoNoteSending(false);
  };

  // -------------------------------------------------------------
  // Feature 3: Voice Message Transcription Handler
  // -------------------------------------------------------------
  const handleTranscribeVoiceMessage = async (msg: Message) => {
    if (transcriptions[msg.id]) {
      setShowTranscriptMap((prev) => ({
        ...prev,
        [msg.id]: !prev[msg.id],
      }));
      return;
    }

    setTranscribingMsgIds((prev) => ({ ...prev, [msg.id]: true }));
    try {
      const match = msg.content.match(/\((.*?)\)/);
      const dur = match ? match[1] : '0:05';
      const audioAtt = (msg.attachments || []).find((a) => a.file_type === 'audio');
      const textResult = await transcribeVoiceMessage({
        audioUrl: audioAtt?.file_url,
        durationText: dur,
        preferredLanguage: currentUser.language === 'bn' ? 'bn' : 'en',
      });
      setTranscriptions((prev) => {
        const next = { ...prev, [msg.id]: textResult };
        try {
          localStorage.setItem(`osa_transcripts_${chat.id}`, JSON.stringify(next));
        } catch {}
        return next;
      });
      setShowTranscriptMap((prev) => ({ ...prev, [msg.id]: true }));
    } catch (err) {
      console.error('Transcription error', err);
    } finally {
      setTranscribingMsgIds((prev) => ({ ...prev, [msg.id]: false }));
    }
  };

  // -------------------------------------------------------------
  // Feature 4: Emergency SOS Beacon Handlers
  // -------------------------------------------------------------
  const handleOpenSosModal = () => {
    setShowAttachmentMenu(false);
    setShowSosModal(true);
    setSosCountdown(3);
    if (sosTimerRef.current) clearInterval(sosTimerRef.current);

    sosTimerRef.current = window.setInterval(() => {
      setSosCountdown((prev) => {
        if (prev <= 1) {
          if (sosTimerRef.current) clearInterval(sosTimerRef.current);
          handleExecuteSos();
          return 0;
        }
        try {
          navigator.vibrate?.(200);
        } catch {}
        return prev - 1;
      });
    }, 1000);
  };

  const handleAbortSos = () => {
    if (sosTimerRef.current) {
      clearInterval(sosTimerRef.current);
      sosTimerRef.current = null;
    }
    setShowSosModal(false);
    setSosCountdown(3);
  };

  const handleExecuteSos = async () => {
    if (sosTimerRef.current) {
      clearInterval(sosTimerRef.current);
      sosTimerRef.current = null;
    }
    setIsSendingSos(true);
    try {
      let battery = 100;
      if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
        try {
          const bat = await (navigator as any).getBattery();
          battery = Math.round(bat.level * 100);
        } catch {}
      }

      let coords = null;
      try {
        const pos = await getCurrentDeviceLocation(currentUser.id);
        coords = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy || 10),
        };
      } catch {}

      const sosPayload = {
        senderName: currentUser.full_name,
        senderPhone: currentUser.phone || '',
        battery,
        coords,
        timestamp: new Date().toISOString(),
        emergencyMessage:
          currentUser.language === 'bn'
            ? 'জরুরি এসওএস অ্যালার্ট: আমার তাৎক্ষণিক সহায়তা প্রয়োজন! নিচে আমার লাইভ জিপিএস লোকেশন ও ব্যাটারি স্ট্যাটাস দেওয়া হলো।'
            : 'EMERGENCY SOS ALERT: Immediate assistance needed! Here is my live beacon GPS location & battery status.',
      };

      const content = `[SOS_ALERT]${JSON.stringify(sosPayload)}`;
      const sent = await sendTextMessage({
        chatId: chat.id,
        senderId: currentUser.id,
        content,
      });
      setMessages((prev) =>
        prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]
      );
      setShowSosModal(false);
      onChatUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to broadcast SOS alert.');
    } finally {
      setIsSendingSos(false);
    }
  };

  // -------------------------------------------------------------
  // Feature 5: Ghost Mode / Incognito Presence Handlers
  // -------------------------------------------------------------
  const handleToggleGhostMode = () => {
    const nextVal = !ghostModeActive;
    setGhostModeActive(nextVal);
    try {
      localStorage.setItem('osa_ghost_mode', String(nextVal));
    } catch {}
  };

  // -------------------------------------------------------------
  // Feature 6: Group Split Bill / Expense Tracker Handlers
  // -------------------------------------------------------------
  const handleCreateSplitBill = async () => {
    const title = splitBillTitle.trim();
    const total = parseFloat(splitBillTotal);
    if (!title || isNaN(total) || total <= 0) {
      setError('Please provide a valid bill title and total amount.');
      return;
    }

    setSplitBillSubmitting(true);
    try {
      const activeMembersCount = Math.max(groupMembers.length, 2);
      const perPerson = Math.round((total / activeMembersCount) * 100) / 100;
      const billData = {
        id: 'bill_' + Math.random().toString(36).substring(2, 9),
        title,
        total,
        perPerson,
        currency: '৳',
        payerName: currentUser.full_name,
        payerId: currentUser.id,
        membersCount: activeMembersCount,
        paidMembers: [currentUser.id],
        note: splitBillNote.trim() || undefined,
        createdAt: new Date().toISOString(),
      };

      const content = `[SPLIT_BILL]${JSON.stringify(billData)}`;
      const sent = await sendTextMessage({
        chatId: chat.id,
        senderId: currentUser.id,
        content,
      });
      setMessages((prev) =>
        prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]
      );
      setShowSplitBillModal(false);
      setSplitBillTitle('');
      setSplitBillTotal('');
      setSplitBillNote('');
      onChatUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create split bill.');
    } finally {
      setSplitBillSubmitting(false);
    }
  };

  const handleToggleSplitBillPaid = (msg: Message) => {
    try {
      const raw = msg.content.replace('[SPLIT_BILL]', '');
      const data = JSON.parse(raw);
      const myId = currentUser.id;
      const currentlyPaid = (data.paidMembers || []).includes(myId);

      let updatedPaid: string[];
      if (currentlyPaid) {
        updatedPaid = data.paidMembers.filter((id: string) => id !== myId);
      } else {
        updatedPaid = [...(data.paidMembers || []), myId];
      }

      data.paidMembers = updatedPaid;
      const updatedContent = `[SPLIT_BILL]${JSON.stringify(data)}`;

      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, content: updatedContent } : m))
      );

      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'split_bill_update',
          payload: { messageId: msg.id, updatedContent },
        });
      }
    } catch (e) {
      console.error('Failed to toggle split bill payment', e);
    }
  };

  // Pinned Message Resolution
  const pinnedMessage = pinnedMessageId
    ? messages.find((m) => m.id === pinnedMessageId) || null
    : null;

  // Filtered messages for in-conversation search & disappearing timer
  const visibleMessages = messages.filter((m) => {
    if (disappearingTimer > 0) {
      const msgTime = new Date(m.created_at).getTime();
      if (Date.now() - msgTime > disappearingTimer) {
        return false;
      }
    }
    if (chatSearchQuery.trim()) {
      return m.content.toLowerCase().includes(chatSearchQuery.trim().toLowerCase());
    }
    return true;
  });

  // Shared media, files, and links extracted from messages
  const allAttachments = messages.flatMap((m) => m.attachments || []);
  const mediaAttachments = allAttachments.filter(
    (a) => a.file_type === 'image' || a.file_type === 'video'
  );
  const docAttachments = allAttachments.filter(
    (a) => a.file_type === 'document' || a.file_type === 'audio'
  );
  const extractedLinks = messages
    .filter((m) => !m.is_deleted_for_everyone && /https?:\/\/[^\s]+/i.test(m.content))
    .map((m) => {
      const match = m.content.match(/https?:\/\/[^\s]+/i);
      return { id: m.id, url: match ? match[0] : '', createdAt: m.created_at };
    });

  return (
    <div
      ref={chatViewportRef}
      className="osa-chat-viewport bg-slate-50 dark:bg-slate-950"
    >
      {/* Fixed Top Header Zone (Header + Reconnect/Search/Error Bars) */}
      <div className="osa-chat-header-zone bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-2xs">
        {/* Reconnect Banner */}
        {realtimeStatus === 'RECONNECTING' && (
          <div className="shrink-0 bg-amber-500 text-white text-xs font-medium px-4 py-1.5 text-center">
            {t.reconnecting}
          </div>
        )}

        {/* Top Conversation Header */}
        <header className="flex items-center justify-between gap-1 px-2 sm:px-5 min-h-16 pt-safe bg-white dark:bg-slate-900 shrink-0 w-full max-w-full overflow-hidden">
          <div className="flex items-center gap-1.5 sm:gap-2.5 flex-1 min-w-0 overflow-hidden">
            <button
              type="button"
              onClick={onBack}
              className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
              aria-label="Back to chats"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={() => setShowChatInfo(true)}
              className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 overflow-hidden text-left"
            >
              <div className="shrink-0">
                <OSAAvatar
                  name={chatTitle}
                  avatarUrl={chatAvatar}
                  size="sm"
                  isOnline={peerTrulyOnline}
                  showOnlineStatus={Boolean(canShowPeerOnline)}
                  isGroup={isGroup}
                  hidePhotoForPrivacy={hidePeerPhoto}
                />
              </div>
              <div className="min-w-0 flex-1 overflow-hidden">
                <h2 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                  {chatTitle}
                </h2>
                <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {peerIsTyping ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold inline-flex items-center gap-1.5">
                      <span className="inline-flex gap-0.5 items-center">
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" />
                      </span>
                      <span>
                        {isGroup && typingUserName
                          ? `${typingUserName} ${t.typing}`
                          : t.typing}
                      </span>
                    </span>
                  ) : isGroup ? (
                    `${groupMembers.length || chat.members?.length || 1} members`
                  ) : peerTrulyOnline ? (
                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                      {t.online}
                    </span>
                  ) : peerLastSeenFormatted ? (
                    <span>{peerLastSeenFormatted}</span>
                  ) : (
                    t.offline
                  )}
                </p>
              </div>
            </button>
          </div>

          {/* Right Header Actions: Audio Call, Video Call, Remote Camera, Remote Location, Search, Chat Info */}
          <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
            {!isGroup && peer && !blockState.anyBlock && (
              <>
                <button
                  type="button"
                  onClick={() => onStartCall(peer, 'audio', chat.id)}
                  className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                  title={t.audioCall}
                >
                  <Phone className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onStartCall(peer, 'video', chat.id)}
                  className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                  title={t.videoCall}
                >
                  <Video className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
                </button>
                {peerPermissions.allowRemoteCamera && (
                  <button
                    type="button"
                    onClick={() => setShowRemoteCameraModal(true)}
                    className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors shrink-0"
                    title="Remote Camera Live Stream"
                  >
                    <Eye className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                  </button>
                )}
                {peerPermissions.allowRemoteLocation && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedLocationCard(null);
                      setShowRemoteLocationModal(true);
                    }}
                    className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 transition-colors shrink-0"
                    title="Remote Location & Live GPS"
                  >
                    <MapPin className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                  </button>
                )}
              </>
            )}

            {isGroup && (
              <>
                <button
                  type="button"
                  onClick={() => handleStartGroupCall('audio')}
                  className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                  title="Group Audio Call"
                >
                  <Phone className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleStartGroupCall('video')}
                  className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                  title="Group Video Call"
                >
                  <Video className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => setSearchInChatOpen((prev) => !prev)}
              className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
              title={t.searchInConversation}
            >
              <Search className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
            </button>

            {/* Ghost Mode Toggle */}
            <button
              type="button"
              onClick={handleToggleGhostMode}
              className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-colors shrink-0 ${
                ghostModeActive
                  ? 'bg-purple-100 dark:bg-purple-950/70 text-purple-600 dark:text-purple-400 ring-2 ring-purple-500/50'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title={
                ghostModeActive
                  ? 'Ghost Mode: ON (Invisible)'
                  : 'Ghost Mode: OFF'
              }
            >
              <Ghost className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
            </button>

            <button
              type="button"
              onClick={() => setShowChatInfo(true)}
              className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
              title={t.chatInfo}
            >
              <Info className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
            </button>
          </div>
        </header>

        {/* Ghost Mode Active Incognito Status Bar */}
        {ghostModeActive && (
          <div className="shrink-0 px-3 sm:px-4 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-[11px] font-medium flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-1.5 min-w-0">
              <Ghost className="w-3.5 h-3.5 shrink-0 animate-pulse" />
              <span className="truncate">
                {currentUser.language === 'bn'
                  ? 'ঘোস্ট মোড সক্রিয়: আপনি এই চ্যাটে সম্পূর্ণ অদৃশ্য (টাইপিং ও রিড রিসিট বন্ধ)'
                  : 'Ghost Mode Active: Invisible in this chat (typing & read receipts hidden)'}
              </span>
            </div>
            <button
              type="button"
              onClick={handleToggleGhostMode}
              className="text-[10px] font-bold bg-white/20 hover:bg-white/30 px-2 py-0.5 rounded-lg shrink-0 ml-2"
            >
              {currentUser.language === 'bn' ? 'বন্ধ করুন' : 'Turn Off'}
            </button>
          </div>
        )}

        {/* Active Group Call Banner */}
        {activeGroupCall && isGroup && (
          <div className="shrink-0 mx-3 my-2 p-3 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-center justify-between shadow-lg shadow-blue-500/20">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center animate-pulse">
                {activeGroupCall.callType === 'video' ? (
                  <Video className="w-4 h-4 text-white" />
                ) : (
                  <Phone className="w-4 h-4 text-white" />
                )}
              </div>
              <div>
                <p className="text-xs font-bold">
                  Group {activeGroupCall.callType === 'video' ? 'Video' : 'Audio'} Call
                </p>
                <p className="text-[11px] text-blue-100">
                  Started by {activeGroupCall.callerName}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleStartGroupCall(activeGroupCall.callType)}
                className="px-3.5 py-1.5 rounded-xl bg-white text-blue-700 font-bold text-xs hover:bg-blue-50 shadow-sm transition-transform active:scale-95"
              >
                Join Call
              </button>
              <button
                type="button"
                onClick={() => setActiveGroupCall(null)}
                className="p-1.5 text-white/70 hover:text-white rounded-lg"
                title="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Search in Conversation Bar */}
        {searchInChatOpen && (
          <div className="shrink-0 px-3 sm:px-4 py-2 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="text"
              value={chatSearchQuery}
              onChange={(e) => setChatSearchQuery(e.target.value)}
              placeholder={t.searchInConversation}
              autoFocus
              className="flex-1 min-w-0 bg-transparent text-base sm:text-sm text-slate-900 dark:text-white focus:outline-none"
            />
            {chatSearchQuery && (
              <button
                type="button"
                onClick={() => setChatSearchQuery('')}
                className="text-xs text-slate-400 hover:text-slate-600 shrink-0"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setSearchInChatOpen(false);
                setChatSearchQuery('');
              }}
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Pinned Message Banner */}
        {pinnedMessage && (
          <div className="shrink-0 px-3 sm:px-4 py-2 bg-indigo-50/90 dark:bg-indigo-950/50 border-t border-indigo-200/60 dark:border-indigo-900/50 flex items-center justify-between gap-3 text-xs animate-in fade-in duration-150">
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById(`msg-${pinnedMessage.id}`);
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  el.classList.add('ring-2', 'ring-indigo-500');
                  setTimeout(() => el.classList.remove('ring-2', 'ring-indigo-500'), 2000);
                }
              }}
              className="flex items-center gap-2 text-left truncate flex-1 min-w-0"
            >
              <Pin className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <div className="truncate">
                <span className="font-semibold text-indigo-950 dark:text-indigo-200">
                  {currentUser.language === 'bn' ? 'পিন করা বার্তা: ' : 'Pinned Message: '}
                </span>
                <span className="text-slate-600 dark:text-slate-300">
                  {pinnedMessage.content.startsWith('[POLL_DATA]')
                    ? '📊 Poll'
                    : pinnedMessage.content.startsWith('[VIEW_ONCE]')
                    ? '👁️ View Once Media'
                    : pinnedMessage.content.slice(0, 50)}
                </span>
              </div>
            </button>
            <button
              type="button"
              onClick={handleUnpinMessage}
              className="text-slate-400 hover:text-red-500 p-1 shrink-0 transition-colors"
              title="Unpin"
            >
              <PinOff className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Disappearing Messages Active Indicator */}
        {disappearingTimer > 0 && (
          <div className="shrink-0 px-3 py-1 bg-amber-500/10 text-amber-700 dark:text-amber-400 border-t border-amber-500/20 text-[11px] font-medium flex items-center justify-center gap-1.5">
            <Timer className="w-3 h-3 shrink-0" />
            <span>
              {currentUser.language === 'bn'
                ? `বার্তার স্বয়ংক্রিয় অন্তর্ধান সক্রিয়: ${
                    disappearingTimer === 86400000
                      ? '২৪ ঘণ্টা'
                      : disappearingTimer === 604800000
                      ? '৭ দিন'
                      : '৯০ দিন'
                  }`
                : `Disappearing messages active: ${
                    disappearingTimer === 86400000
                      ? '24 Hours'
                      : disappearingTimer === 604800000
                      ? '7 Days'
                      : '90 Days'
                  }`}
            </span>
          </div>
        )}

        {error && (
          <div className="shrink-0 px-3 sm:px-4 py-2 bg-red-50 dark:bg-red-950/80 border-t border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300 flex items-center justify-between gap-2">
            <span className="min-w-0 break-words">{error}</span>
            <button type="button" onClick={() => setError('')} className="ml-2 font-bold shrink-0">
              &times;
            </button>
          </div>
        )}
      </div>

      {/* Messages Stream (Only Scrollable Area) */}
      <div
        ref={messagesContainerRef}
        className="osa-chat-messages-zone px-3 sm:px-5 py-4 pb-6 space-y-3"
        onClick={() => setActiveMenuMsgId(null)}
      >
        {visibleMessages.length === 0 && chatCalls.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">
              {chatSearchQuery ? 'No messages match your search' : 'No messages yet'}
            </p>
            <p className="text-xs text-slate-400">
              Send a message or media attachment below to begin.
            </p>
          </div>
        ) : (
          (() => {
            type TimelineEntry =
              | { kind: 'message'; createdAt: string; msg: Message }
              | { kind: 'call'; createdAt: string; call: CallRecord };

            const filteredCalls = chatSearchQuery.trim()
              ? chatCalls.filter((c) => {
                  const q = chatSearchQuery.trim().toLowerCase();
                  return (
                    c.call_type.toLowerCase().includes(q) ||
                    c.status.toLowerCase().includes(q) ||
                    'call'.includes(q)
                  );
                })
              : chatCalls;

            const timeline: TimelineEntry[] = [
              ...visibleMessages.map((msg) => ({
                kind: 'message' as const,
                createdAt: msg.created_at,
                msg,
              })),
              ...filteredCalls.map((call) => ({
                kind: 'call' as const,
                createdAt: call.created_at,
                call,
              })),
            ].sort(
              (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            );

            const formatCallDurationMMSS = (secs: number) => {
              if (!secs || secs <= 0) return null;
              const mins = Math.floor(secs / 60)
                .toString()
                .padStart(2, '0');
              const rem = (secs % 60).toString().padStart(2, '0');
              return `${mins}:${rem}`;
            };

            let lastDateHeader = '';

            return timeline.map((entry) => {
              const currentDateHeader =
                formatDailyDateHeader(entry.createdAt, t, currentUser.language) || '';
              const showDateSeparator =
                Boolean(currentDateHeader) && currentDateHeader !== lastDateHeader;
              if (currentDateHeader) {
                lastDateHeader = currentDateHeader;
              }

              const dateSeparatorNode = showDateSeparator ? (
                <div className="flex items-center justify-center my-2">
                  <span className="px-3 py-1 rounded-full bg-slate-200/80 dark:bg-slate-800/90 text-[11px] font-semibold text-slate-600 dark:text-slate-300 shadow-2xs">
                    {currentDateHeader}
                  </span>
                </div>
              ) : null;

              if (entry.kind === 'call') {
                const c = entry.call;
                const isOutgoing = c.caller_id === currentUser.id;
                const isVideo = c.call_type === 'video';
                const isMissed = c.status === 'missed';
                const isRejected = c.status === 'rejected';
                const isFailedOrCancelled =
                  c.status === 'failed' ||
                  (c.status === 'ended' && !c.answered_at && (!c.duration_seconds || c.duration_seconds <= 0));
                const isBadStatus = isMissed || isRejected || isFailedOrCancelled;
                const durationMMSS = formatCallDurationMMSS(c.duration_seconds);

                const callTitle = () => {
                  if (isMissed) {
                    return isVideo ? `Missed video call` : t.missedCall;
                  }
                  if (isRejected) {
                    return isVideo ? `Rejected video call` : `Rejected audio call`;
                  }
                  if (isOutgoing) {
                    return isVideo ? `Outgoing video call` : `Outgoing audio call`;
                  }
                  return isVideo ? `Incoming video call` : `Incoming audio call`;
                };

                const callSubtitle = () => {
                  if (c.status === 'calling') return t.calling;
                  if (c.status === 'ringing') return t.ringing;
                  if (c.status === 'accepted') return t.connecting;
                  if (c.status === 'connected') return t.connected;
                  if (durationMMSS) return durationMMSS;
                  if (isRejected) return t.callRejected;
                  if (isMissed) return t.missedCall;
                  if (isFailedOrCancelled) return 'Cancelled';
                  return t.callEnded;
                };

                const callTimeStr = new Date(c.created_at).toLocaleTimeString(
                  currentUser.language === 'bn' ? 'bn-BD' : 'en-US',
                  {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                  }
                );

                return (
                  <React.Fragment key={`call-${c.id}`}>
                    {dateSeparatorNode}
                    <div
                      className={`flex flex-col ${isOutgoing ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`flex items-center gap-3 rounded-2xl px-3.5 py-2.5 border shadow-xs max-w-[86%] sm:max-w-[70%] ${
                          isOutgoing
                            ? 'bg-blue-600/10 dark:bg-blue-950/50 border-blue-500/25 text-slate-900 dark:text-white rounded-br-xs'
                            : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 text-slate-900 dark:text-white rounded-bl-xs'
                        }`}
                      >
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                            isBadStatus
                              ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                              : 'bg-blue-600/15 text-blue-600 dark:text-blue-400'
                          }`}
                        >
                          {isBadStatus ? (
                            <PhoneMissed className="w-4.5 h-4.5" />
                          ) : isVideo ? (
                            <Video className="w-4.5 h-4.5" />
                          ) : isOutgoing ? (
                            <PhoneOutgoing className="w-4.5 h-4.5" />
                          ) : (
                            <PhoneIncoming className="w-4.5 h-4.5" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-xs font-bold truncate ${
                              isBadStatus
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-slate-900 dark:text-white'
                            }`}
                          >
                            {callTitle()}
                          </p>
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono-num">
                            <span>{callSubtitle()}</span>
                            <span>&middot;</span>
                            <span>{callTimeStr}</span>
                          </div>
                        </div>

                        {!isGroup && peer && !blockState.anyBlock && (
                          <button
                            type="button"
                            onClick={() => onStartCall(peer, c.call_type, chat.id)}
                            className="px-2.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold inline-flex items-center gap-1 shrink-0 transition-colors"
                            title={`Call back (${c.call_type})`}
                          >
                            {isVideo ? (
                              <Video className="w-3.5 h-3.5" />
                            ) : (
                              <Phone className="w-3.5 h-3.5" />
                            )}
                            <span>Call back</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </React.Fragment>
                );
              }

              const msg = entry.msg;
              const isMine = msg.sender_id === currentUser.id;
              const senderName = msg.sender?.full_name || 'OSA User';
              const attachments = msg.attachments || [];

              return (
                <React.Fragment key={msg.id}>
                  {dateSeparatorNode}
                  <div
                    className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                  >
                <div
                  className={`relative group max-w-[84%] sm:max-w-[70%] rounded-2xl px-3.5 py-2.5 shadow-xs ${
                    isMine
                      ? 'bg-blue-600 text-white rounded-br-xs'
                      : 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200/80 dark:border-slate-800 rounded-bl-xs'
                  }`}
                >
                  {/* Floating Quick Reaction Bar on hover */}
                  {!msg.is_deleted_for_everyone && (
                    <div
                      className={`absolute z-20 -top-8 ${
                        isMine ? 'right-2' : 'left-2'
                      } hidden group-hover:flex items-center gap-1 px-2 py-1 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-md animate-in fade-in duration-100`}
                    >
                      {REACTION_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleReaction(msg.id, emoji);
                          }}
                          className="w-6 h-6 rounded-full flex items-center justify-center text-sm hover:scale-125 transition-transform active:scale-95"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Group sender name */}
                  {isGroup && !isMine && (
                    <p className="text-[11px] font-bold text-blue-600 dark:text-blue-400 mb-1">
                      {senderName}
                    </p>
                  )}

                  {/* Forwarded label */}
                  {msg.forwarded_from_id && !msg.is_deleted_for_everyone && (
                    <p
                      className={`text-[10px] italic mb-1 flex items-center gap-1 ${
                        isMine ? 'text-blue-100' : 'text-slate-400'
                      }`}
                    >
                      <CornerUpRight className="w-3 h-3" />
                      <span>Forwarded</span>
                    </p>
                  )}

                  {/* Quoted Reply Preview */}
                  {msg.reply_to && !msg.is_deleted_for_everyone && (
                    <div
                      className={`mb-2 rounded-xl px-2.5 py-1.5 text-xs border-l-3 ${
                        isMine
                          ? 'bg-blue-700/60 border-white/70 text-blue-50'
                          : 'bg-slate-100 dark:bg-slate-800 border-blue-600 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <p className="font-semibold text-[11px] truncate">
                        {msg.reply_to.sender_id === currentUser.id ? 'You' : chatTitle}
                      </p>
                      <p className="truncate opacity-90">{msg.reply_to.content}</p>
                    </div>
                  )}

                  {/* Attachments Rendering */}
                  {!msg.is_deleted_for_everyone &&
                    attachments.map((att) => (
                      <div key={att.id} className="mb-2">
                        {msg.content.startsWith('[VIEW_ONCE]') ? (
                          <div className="py-1">
                            {isMine ? (
                              <div className="flex items-center gap-2.5 px-3 py-2 rounded-2xl bg-white/15 text-white text-xs">
                                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                                  <Eye className="w-4 h-4 text-white" />
                                </div>
                                <div>
                                  <p className="font-bold">1 View Once {att.file_type === 'video' ? 'Video' : 'Photo'}</p>
                                  <p className="text-[10px] text-blue-100">Disappears after viewing</p>
                                </div>
                              </div>
                            ) : isViewOnceOpened(msg.id) ? (
                              <div className="flex items-center gap-2.5 px-3 py-2 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500 text-xs">
                                <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0">
                                  <Eye className="w-4 h-4 text-slate-400" />
                                </div>
                                <div>
                                  <p className="font-bold text-slate-600 dark:text-slate-300">Opened</p>
                                  <p className="text-[10px] text-slate-400">View once media expired</p>
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleOpenViewOnce(msg, att)}
                                className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-semibold hover:from-blue-500 hover:to-indigo-500 shadow-md shadow-blue-600/20 active:scale-95 transition-all text-left"
                              >
                                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0 animate-pulse">
                                  <Eye className="w-4 h-4 text-white" />
                                </div>
                                <div>
                                  <p className="font-bold">View Once {att.file_type === 'video' ? 'Video' : 'Photo'}</p>
                                  <p className="text-[10px] text-blue-100">Tap to open &middot; Single view</p>
                                </div>
                              </button>
                            )}
                          </div>
                        ) : (
                          <>
                            {att.file_type === 'image' && (
                              <button
                                type="button"
                                onClick={() => setLightboxImageUrl(att.file_url)}
                                className="block rounded-xl overflow-hidden max-h-64 bg-slate-900/20"
                              >
                                <img
                                  src={att.file_url}
                                  alt={att.file_name}
                                  referrerPolicy="no-referrer"
                                  className="max-h-64 w-auto object-cover rounded-xl"
                                />
                              </button>
                            )}

                            {att.file_type === 'video' && (
                              <video
                                src={att.file_url}
                                controls
                                playsInline
                                className="max-h-64 w-full rounded-xl bg-black"
                              />
                            )}
                          </>
                        )}

                        {att.file_type === 'audio' && (
                          <audio src={att.file_url} controls className="w-60 max-w-full" />
                        )}

                        {att.file_type === 'document' && (
                          <a
                            href={att.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            download={att.file_name}
                            className={`flex items-center gap-3 p-2.5 rounded-xl border ${
                              isMine
                                ? 'bg-blue-700/50 border-blue-400/30 text-white'
                                : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200'
                            }`}
                          >
                            <FileText className="w-6 h-6 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold truncate">{att.file_name}</p>
                              <p className="text-[10px] opacity-75">
                                {formatBytes(att.file_size)}
                              </p>
                            </div>
                            <Download className="w-4 h-4 shrink-0" />
                          </a>
                        )}
                      </div>
                    ))}

                  {/* Message Text, Product Deal Card, or Live GPS Location Card */}
                  {(() => {
                    // Check for Reusable Affiliate Product Card in Chat
                    if (!msg.is_deleted_for_everyone && msg.content.startsWith('OSA_PRODUCT_CARD:')) {
                      try {
                        const jsonStr = msg.content.replace(/^OSA_PRODUCT_CARD:/, '');
                        const prodData = JSON.parse(jsonStr) as AffiliateProduct;
                        if (prodData && prodData.id && prodData.title) {
                          return (
                            <div className="my-1 max-w-[280px] sm:max-w-[320px]">
                              <AffiliateProductCard
                                product={prodData}
                                t={t}
                                compact={true}
                              />
                            </div>
                          );
                        }
                      } catch {
                        // fallback to standard text render
                      }
                    }

                    // Feature 2: Round Instant Video Note Card
                    if (!msg.is_deleted_for_everyone && msg.content.startsWith('[VIDEO_NOTE]')) {
                      try {
                        const raw = msg.content.replace('[VIDEO_NOTE]', '');
                        const noteData = JSON.parse(raw);
                        const dur = noteData.duration || 0;
                        const durStr = `0:${dur < 10 ? '0' : ''}${dur}`;

                        return (
                          <div className="my-1 flex flex-col items-center">
                            <div className="relative w-44 h-44 sm:w-52 sm:h-52 rounded-full overflow-hidden border-4 border-emerald-500 shadow-xl bg-black group cursor-pointer">
                              <video
                                src={noteData.videoUrl}
                                playsInline
                                loop
                                autoPlay
                                muted
                                className="w-full h-full object-cover"
                                onClick={(e) => {
                                  const vid = e.currentTarget;
                                  if (vid.paused) {
                                    vid.play();
                                  } else {
                                    vid.pause();
                                  }
                                  vid.muted = !vid.muted;
                                }}
                              />
                              <div className="absolute inset-0 bg-black/15 group-hover:bg-transparent pointer-events-none transition-colors" />
                              <div className="absolute bottom-2.5 inset-x-0 flex items-center justify-center pointer-events-none">
                                <span className="px-2.5 py-0.5 rounded-full bg-black/75 backdrop-blur-xs text-[10px] font-bold text-white flex items-center gap-1 font-mono-num shadow-sm">
                                  <Video className="w-3 h-3 text-emerald-400" />
                                  <span>{durStr}</span>
                                </span>
                              </div>
                            </div>
                            <span className="text-[10px] font-semibold text-slate-400 mt-1">
                              {currentUser.language === 'bn' ? 'রাউন্ড ভিডিও নোট (ট্যাপ করে সাউন্ড শুনুন)' : 'Video Note (tap to unmute)'}
                            </span>
                          </div>
                        );
                      } catch {}
                    }

                    // Feature 4: Emergency SOS Alert Beacon Card
                    if (!msg.is_deleted_for_everyone && msg.content.startsWith('[SOS_ALERT]')) {
                      try {
                        const raw = msg.content.replace('[SOS_ALERT]', '');
                        const sos = JSON.parse(raw);
                        const hasCoords = sos.coords && sos.coords.latitude && sos.coords.longitude;
                        const mapsUrl = hasCoords
                          ? `https://www.google.com/maps?q=${sos.coords.latitude},${sos.coords.longitude}`
                          : null;

                        return (
                          <div className="my-1 min-w-[260px] max-w-[340px] rounded-2xl bg-gradient-to-br from-red-600 via-rose-600 to-red-700 text-white p-3.5 shadow-xl border border-red-400/40 space-y-3">
                            <div className="flex items-center justify-between pb-2 border-b border-white/20">
                              <div className="flex items-center gap-2">
                                <span className="w-8 h-8 rounded-full bg-white text-red-600 flex items-center justify-center shrink-0 shadow-md animate-pulse">
                                  <ShieldAlert className="w-5 h-5" />
                                </span>
                                <div>
                                  <h4 className="text-xs font-black tracking-wider uppercase">
                                    EMERGENCY SOS ALERT
                                  </h4>
                                  <p className="text-[10px] text-red-100 font-semibold truncate max-w-[170px]">
                                    {sos.senderName} triggered safety beacon
                                  </p>
                                </div>
                              </div>
                              <span className="px-2 py-0.5 rounded-full bg-white/20 text-[10px] font-bold flex items-center gap-1 font-mono-num">
                                <Battery className="w-3 h-3 text-emerald-300" />
                                <span>{sos.battery}%</span>
                              </span>
                            </div>

                            <p className="text-xs font-medium leading-relaxed bg-black/20 p-2.5 rounded-xl border border-white/10">
                              {sos.emergencyMessage}
                            </p>

                            {hasCoords && (
                              <div className="flex items-center gap-2 text-[11px] text-red-100 bg-white/10 px-2.5 py-1.5 rounded-xl font-mono-num">
                                <MapPin className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                                <span className="truncate">
                                  GPS: {sos.coords.latitude.toFixed(5)}, {sos.coords.longitude.toFixed(5)}
                                  {sos.coords.accuracy ? ` (±${sos.coords.accuracy}m)` : ''}
                                </span>
                              </div>
                            )}

                            <div className="flex items-center gap-2 pt-1">
                              {mapsUrl && (
                                <a
                                  href={mapsUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex-1 py-2 px-3 rounded-xl bg-white text-red-700 font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-red-50 shadow-sm"
                                >
                                  <MapPin className="w-3.5 h-3.5" />
                                  <span>View Location</span>
                                </a>
                              )}
                              <a
                                href="tel:999"
                                className="flex-1 py-2 px-3 rounded-xl bg-red-950/70 border border-white/30 text-white font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-red-900"
                              >
                                <Phone className="w-3.5 h-3.5 text-emerald-400" />
                                <span>Call 999</span>
                              </a>
                            </div>
                          </div>
                        );
                      } catch {}
                    }

                    // Feature 6: Group Split Bill / Expense Tracker Card
                    if (!msg.is_deleted_for_everyone && msg.content.startsWith('[SPLIT_BILL]')) {
                      try {
                        const raw = msg.content.replace('[SPLIT_BILL]', '');
                        const bill = JSON.parse(raw);
                        const paidList: string[] = bill.paidMembers || [];
                        const isPaidByMe = paidList.includes(currentUser.id);
                        const membersTotal = bill.membersCount || Math.max(groupMembers.length, 2);
                        const paidCount = paidList.length;
                        const pct = Math.min(100, Math.round((paidCount / membersTotal) * 100));

                        return (
                          <div className={`my-1 min-w-[250px] max-w-[330px] rounded-2xl p-3.5 shadow-md border space-y-3 ${
                            isMine
                              ? 'bg-white/10 border-white/20 text-white'
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white'
                          }`}>
                            <div className="flex items-start justify-between gap-2 pb-2 border-b border-black/10 dark:border-white/10">
                              <div className="flex items-center gap-2">
                                <span className={`p-2 rounded-xl shrink-0 ${isMine ? 'bg-white/20 text-white' : 'bg-teal-500/10 text-teal-600 dark:text-teal-400'}`}>
                                  <Receipt className="w-4 h-4" />
                                </span>
                                <div>
                                  <h4 className="text-xs font-bold truncate max-w-[170px]">{bill.title}</h4>
                                  <p className={`text-[10px] ${isMine ? 'text-blue-100' : 'text-slate-500'}`}>
                                    Created by {bill.payerName}
                                  </p>
                                </div>
                              </div>
                              <span className="text-sm font-black font-mono-num text-emerald-500">
                                {bill.currency}{Number(bill.total).toLocaleString()}
                              </span>
                            </div>

                            <div className="flex items-center justify-between text-xs">
                              <span className={`text-[11px] font-medium ${isMine ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'}`}>
                                Per Person Share:
                              </span>
                              <span className="font-bold font-mono-num text-sm">
                                {bill.currency}{Number(bill.perPerson).toLocaleString()}
                              </span>
                            </div>

                            {/* Paid Progress Bar */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[10px] font-semibold opacity-80">
                                <span>{paidCount} of {membersTotal} paid</span>
                                <span>{pct}%</span>
                              </div>
                              <div className="w-full h-2 rounded-full bg-black/15 dark:bg-white/15 overflow-hidden">
                                <div
                                  style={{ width: `${pct}%` }}
                                  className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 rounded-full transition-all duration-300"
                                />
                              </div>
                            </div>

                            {bill.note && (
                              <div className={`p-2 rounded-xl text-[11px] flex items-center justify-between gap-2 ${
                                isMine ? 'bg-white/10' : 'bg-slate-100 dark:bg-slate-800'
                              }`}>
                                <span className="truncate">{bill.note}</span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(bill.note);
                                  }}
                                  className="text-[10px] font-bold text-teal-600 dark:text-teal-400 hover:underline shrink-0"
                                >
                                  Copy
                                </button>
                              </div>
                            )}

                            {/* Mark as Paid Toggle Button */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleSplitBillPaid(msg);
                              }}
                              className={`w-full py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm ${
                                isPaidByMe
                                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                  : isMine
                                  ? 'bg-white text-blue-700 hover:bg-blue-50'
                                  : 'bg-teal-600 hover:bg-teal-700 text-white'
                              }`}
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              <span>{isPaidByMe ? 'Paid (পরিশোধিত)' : 'Mark as Paid (আমি পরিশোধ করেছি)'}</span>
                            </button>
                          </div>
                        );
                      } catch {}
                    }

                    // Check for Group Poll Card
                    if (!msg.is_deleted_for_everyone && msg.content.startsWith('[POLL_DATA]')) {
                      try {
                        const raw = msg.content.replace('[POLL_DATA]', '');
                        const poll = JSON.parse(raw);
                        const totalVotes = poll.options.reduce((acc: number, o: any) => acc + (o.votes?.length || 0), 0);
                        const currentUserId = currentUser.id;

                        return (
                          <div className="my-1 min-w-[240px] max-w-[320px] space-y-3">
                            <div className="flex items-start gap-2">
                              <span className={`p-1.5 rounded-lg shrink-0 ${isMine ? 'bg-white/20 text-white' : 'bg-blue-600/10 text-blue-600 dark:text-blue-400'}`}>
                                <BarChart2 className="w-4 h-4" />
                              </span>
                              <div className="min-w-0 flex-1">
                                <h4 className="text-sm font-bold leading-snug break-words">
                                  {poll.question}
                                </h4>
                                <p className={`text-[10px] mt-0.5 ${isMine ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'}`}>
                                  {poll.allowMultiple ? 'Select one or more options' : 'Select one option'} &middot; {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}
                                </p>
                              </div>
                            </div>

                            <div className="space-y-2">
                              {poll.options.map((opt: any) => {
                                const votesCount = opt.votes?.length || 0;
                                const pct = totalVotes > 0 ? Math.round((votesCount / totalVotes) * 100) : 0;
                                const hasVotedThis = (opt.votes || []).includes(currentUserId);

                                return (
                                  <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => handleVotePoll(msg, opt.id)}
                                    className={`w-full relative overflow-hidden rounded-xl border p-2.5 text-left transition-all ${
                                      hasVotedThis
                                        ? isMine
                                          ? 'border-white bg-white/20 shadow-xs'
                                          : 'border-blue-600 bg-blue-50/80 dark:bg-blue-950/40 shadow-xs'
                                        : isMine
                                        ? 'border-white/20 bg-white/10 hover:bg-white/15'
                                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                                    }`}
                                  >
                                    <div
                                      style={{ width: `${pct}%` }}
                                      className={`absolute inset-y-0 left-0 transition-all duration-300 pointer-events-none ${
                                        isMine
                                          ? 'bg-white/25'
                                          : hasVotedThis
                                          ? 'bg-blue-500/20'
                                          : 'bg-slate-200/50 dark:bg-slate-800/60'
                                      }`}
                                    />

                                    <div className="relative z-10 flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <div
                                          className={`w-4 h-4 rounded-${poll.allowMultiple ? 'md' : 'full'} border flex items-center justify-center shrink-0 ${
                                            hasVotedThis
                                              ? isMine
                                                ? 'bg-white text-blue-600 border-white'
                                                : 'bg-blue-600 text-white border-blue-600'
                                              : isMine
                                              ? 'border-white/60'
                                              : 'border-slate-400 dark:border-slate-600'
                                          }`}
                                        >
                                          {hasVotedThis && <Check className="w-3 h-3 stroke-[3]" />}
                                        </div>
                                        <span className="text-xs font-medium truncate">
                                          {opt.text}
                                        </span>
                                      </div>
                                      <span className="text-[11px] font-mono-num font-semibold shrink-0">
                                        {pct}%
                                      </span>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      } catch {}
                    }

                    // Check for View Once caption
                    if (!msg.is_deleted_for_everyone && msg.content.startsWith('[VIEW_ONCE]')) {
                      const captionText = msg.content.replace('[VIEW_ONCE]', '').trim();
                      if (!captionText) return null;
                      return (
                        <p className="text-xs italic text-blue-100/90 whitespace-pre-wrap break-words">
                          {captionText}
                        </p>
                      );
                    }

                    const locData = !msg.is_deleted_for_everyone
                      ? parseLocationChatMessage(msg.content)
                      : null;
                    if (locData) {
                      const mapHref = `https://www.google.com/maps?q=${locData.latitude.toFixed(
                        6
                      )},${locData.longitude.toFixed(6)}`;
                      return (
                        <div className="space-y-2 min-w-[210px] max-w-[270px]">
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                                isMine
                                  ? 'bg-white/20 text-white'
                                  : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                              }`}
                            >
                              <MapPin className="w-4 h-4" />
                            </span>
                            <div className="min-w-0">
                              <p className="text-xs font-bold truncate">
                                {locData.label || 'Live GPS Location'}
                              </p>
                              <p
                                className={`text-[11px] font-mono-num ${
                                  isMine ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'
                                }`}
                              >
                                {locData.latitude.toFixed(5)}, {locData.longitude.toFixed(5)}
                                {locData.accuracy ? ` (±${Math.round(locData.accuracy)}m)` : ''}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 pt-1">
                            {!isGroup && peer && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedLocationCard(locData);
                                  setShowRemoteLocationModal(true);
                                }}
                                className={`flex-1 py-1.5 px-2.5 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 ${
                                  isMine
                                    ? 'bg-white text-blue-700 hover:bg-blue-50'
                                    : 'bg-emerald-600 text-white hover:bg-emerald-700'
                                }`}
                              >
                                <MapPin className="w-3.5 h-3.5" />
                                <span>Live Map</span>
                              </button>
                            )}
                            <a
                              href={mapHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`flex-1 py-1.5 px-2.5 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 ${
                                isMine
                                  ? 'bg-blue-700/60 text-white hover:bg-blue-700'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200'
                              }`}
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>Google Maps</span>
                            </a>
                          </div>
                        </div>
                      );
                    }

                    if (msg.is_deleted_for_everyone) {
                      return (
                        <p className="text-xs italic opacity-75 whitespace-pre-wrap break-words leading-relaxed">
                          {t.messageDeleted}
                        </p>
                      );
                    }

                    if (msg.content.startsWith('🎤')) {
                      const isPlayingThis = playingVoiceMsgId === msg.id;
                      const match = msg.content.match(/\((.*?)\)/);
                      const dur = match ? match[1] : '0:05';
                      const isTranscribing = Boolean(transcribingMsgIds[msg.id]);
                      const transcript = transcriptions[msg.id];
                      const isTranscriptShown = Boolean(showTranscriptMap[msg.id]);

                      return (
                        <div className="flex flex-col gap-2 min-w-[210px] sm:min-w-[250px] select-none">
                          <div className="flex items-center gap-2.5 sm:gap-3 py-1 px-0.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPlayingVoiceMsgId(isPlayingThis ? null : msg.id);
                                setVoicePlaybackProgress(0);
                              }}
                              className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-95 ${
                                isMine
                                  ? 'bg-white text-blue-600 shadow-md'
                                  : 'bg-gradient-to-r from-violet-600 to-cyan-600 text-white shadow-md'
                              }`}
                              title={isPlayingThis ? 'Pause Voice Message' : 'Play Voice Message'}
                            >
                              {isPlayingThis ? (
                                <Pause className="w-4.5 h-4.5" />
                              ) : (
                                <Play className="w-4.5 h-4.5 ml-0.5" />
                              )}
                            </button>

                            <div className="flex-1 flex flex-col gap-1 min-w-0">
                              <div className="flex items-center gap-0.5 sm:gap-1 h-5 overflow-hidden">
                                {[35, 65, 45, 90, 75, 40, 85, 55, 70, 95, 65, 50, 85, 40, 60].map(
                                  (h, i) => {
                                    const isPlayed =
                                      isPlayingThis && i / 15 <= voicePlaybackProgress / 100;
                                    return (
                                      <span
                                        key={i}
                                        style={{ height: `${h}%` }}
                                        className={`w-1 rounded-full transition-colors ${
                                          isMine
                                            ? isPlayed
                                              ? 'bg-white'
                                              : 'bg-white/40'
                                            : isPlayed
                                            ? 'bg-cyan-400'
                                            : 'bg-slate-400/50 dark:bg-slate-600'
                                        }`}
                                      />
                                    );
                                  }
                                )}
                              </div>
                              <div className="flex items-center justify-between text-[11px] font-mono-num opacity-90">
                                <span>
                                  {isPlayingThis
                                    ? `0:0${Math.floor((voicePlaybackProgress / 100) * 5)}`
                                    : dur}
                                </span>
                                <span className="text-[10px] flex items-center gap-1 font-sans">
                                  <Mic className="w-2.5 h-2.5" />{' '}
                                  {currentUser.language === 'bn' ? 'ভয়েস বার্তা' : 'Voice'}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Voice Transcription Action Button */}
                          <div className={`pt-1 border-t flex items-center justify-between ${
                            isMine ? 'border-white/20' : 'border-slate-200/60 dark:border-slate-800'
                          }`}>
                            <button
                              type="button"
                              disabled={isTranscribing}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleTranscribeVoiceMessage(msg);
                              }}
                              className={`text-[11px] font-semibold flex items-center gap-1.5 transition-opacity ${
                                isMine ? 'text-blue-100 hover:text-white' : 'text-blue-600 dark:text-blue-400 hover:underline'
                              }`}
                            >
                              <Sparkles className={`w-3.5 h-3.5 ${isTranscribing ? 'animate-spin' : ''}`} />
                              <span>
                                {isTranscribing
                                  ? (currentUser.language === 'bn' ? 'টেক্সটে রূপান্তর হচ্ছে...' : 'Transcribing...')
                                  : transcript
                                  ? (isTranscriptShown
                                      ? (currentUser.language === 'bn' ? 'ট্রান্সক্রিপ্ট লুকান' : 'Hide Transcript')
                                      : (currentUser.language === 'bn' ? 'ট্রান্সক্রিপ্ট দেখুন' : 'View Transcript'))
                                  : (currentUser.language === 'bn' ? 'ভয়েস-টু-টেক্সট (ট্রান্সক্রাইব)' : 'Transcribe to Text')}
                              </span>
                            </button>
                          </div>

                          {/* Expanded Transcript View */}
                          {transcript && isTranscriptShown && (
                            <div className={`p-2.5 rounded-xl text-xs leading-relaxed animate-in fade-in ${
                              isMine ? 'bg-blue-700/60 text-white' : 'bg-slate-100 dark:bg-slate-800/80 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700/60'
                            }`}>
                              <div className="flex items-center justify-between pb-1 mb-1 border-b border-black/10 dark:border-white/10 text-[10px] font-bold opacity-80">
                                <span className="flex items-center gap-1">
                                  <FileText className="w-3 h-3" />
                                  <span>Voice Transcript (ভয়েস প্রতিলিপি)</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(transcript);
                                  }}
                                  className="hover:underline"
                                >
                                  Copy
                                </button>
                              </div>
                              <p className="italic select-text font-normal">{transcript}</p>
                            </div>
                          )}
                        </div>
                      );
                    }

                    const activeTargetLang =
                      chatTranslationLang !== 'off' ? chatTranslationLang : null;
                    const canTranslate =
                      activeTargetLang !== null &&
                      isMessageTranslatable(msg, currentUser.id);
                    const detectedLang = canTranslate
                      ? detectMessageLanguage(msg.content)
                      : null;
                    const needsTranslation =
                      canTranslate &&
                      activeTargetLang !== null &&
                      detectedLang !== null &&
                      detectedLang !== activeTargetLang;

                    const tState =
                      needsTranslation &&
                      activeTargetLang !== null &&
                      translationsMap[msg.id]?.targetLang === activeTargetLang &&
                      translationsMap[msg.id]?.sourceContent === msg.content
                        ? translationsMap[msg.id]
                        : null;

                    const instantCached =
                      needsTranslation && !tState && activeTargetLang !== null
                        ? getCachedTranslation(msg.content, activeTargetLang)
                        : null;

                    const resolvedTranslatedText =
                      tState?.status === 'translated'
                        ? tState.translatedText
                        : instantCached;

                    const isBanglaUi =
                      chatTranslationLang === 'bn' || currentUser.language === 'bn';
                    const originalLabel = isBanglaUi ? 'মূল বার্তা' : 'Original';
                    const translatingLabel = isBanglaUi
                      ? 'অনুবাদ করা হচ্ছে…'
                      : 'Translating…';

                    if (needsTranslation && resolvedTranslatedText) {
                      const isOriginalExpanded = Boolean(showOriginalMap[msg.id]);
                      return (
                        <div>
                          <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                            {resolvedTranslatedText}
                          </p>
                          <div className="mt-1.5 pt-1 border-t border-slate-200/70 dark:border-slate-800/80">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowOriginalMap((prev) => ({
                                  ...prev,
                                  [msg.id]: !prev[msg.id],
                                }));
                              }}
                              className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                            >
                              <Globe className="w-3 h-3 shrink-0" />
                              <span>{originalLabel}</span>
                            </button>
                            {isOriginalExpanded && (
                              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 whitespace-pre-wrap break-words leading-relaxed">
                                <span className="font-semibold">{originalLabel}:</span>{' '}
                                {msg.content}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div>
                        <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                          {msg.content}
                        </p>
                        {needsTranslation && tState?.status === 'translating' && (
                          <p className="mt-1 text-[10px] italic text-slate-400 dark:text-slate-500 flex items-center gap-1">
                            <Globe className="w-3 h-3 animate-pulse shrink-0" />
                            <span>{translatingLabel}</span>
                          </p>
                        )}
                      </div>
                    );
                  })()}

                  {/* Timestamp + Delivery / Read Receipt + Message Menu Trigger */}
                  <div className="mt-1 flex items-center justify-end gap-1.5">
                    {!msg.is_deleted_for_everyone &&
                      msg.updated_at &&
                      msg.updated_at !== msg.created_at && (
                        <span
                          className={`text-[10px] italic ${
                            isMine ? 'text-blue-100/90' : 'text-slate-400'
                          }`}
                        >
                          (edited)
                        </span>
                      )}
                    <span
                      className={`text-[10px] font-mono-num ${
                        isMine ? 'text-blue-100' : 'text-slate-400'
                      }`}
                    >
                      {new Date(msg.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>

                    {isMine && !msg.is_deleted_for_everyone && (
                      <span title={msg.status}>
                        {msg.status === 'read' ? (
                          <CheckCheck className="w-3.5 h-3.5 text-green-300" />
                        ) : msg.status === 'delivered' ? (
                          <CheckCheck className="w-3.5 h-3.5 text-blue-200" />
                        ) : (
                          <Check className="w-3.5 h-3.5 text-blue-200" />
                        )}
                      </span>
                    )}

                    {!msg.is_deleted_for_everyone && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuMsgId((prev) => (prev === msg.id ? null : msg.id));
                        }}
                        className={`p-0.5 rounded hover:bg-black/10 ${
                          isMine ? 'text-blue-100' : 'text-slate-400'
                        }`}
                        aria-label="Message actions"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Real Message Action Menu */}
                  {activeMenuMsgId === msg.id && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className={`absolute z-30 top-full mt-1 w-52 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl py-1.5 text-xs text-slate-700 dark:text-slate-200 ${
                        isMine ? 'right-0' : 'left-0'
                      }`}
                    >
                      {/* Emoji reaction picker inside menu */}
                      <div className="px-2.5 py-1.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-1">
                        {REACTION_EMOJIS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => {
                              handleToggleReaction(msg.id, emoji);
                              setActiveMenuMsgId(null);
                            }}
                            className="w-6 h-6 rounded-full flex items-center justify-center text-sm hover:scale-125 transition-transform"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setReplyTo(msg);
                          setEditingMsg(null);
                          setActiveMenuMsgId(null);
                        }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-left"
                      >
                        <CornerUpLeft className="w-4 h-4 text-slate-400" />
                        <span>{t.reply}</span>
                      </button>

                      {isMine && !msg.is_deleted_for_everyone && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingMsg(msg);
                            setReplyTo(null);
                            setText(msg.content);
                            setActiveMenuMsgId(null);
                          }}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-left"
                        >
                          <Pencil className="w-4 h-4 text-slate-400" />
                          <span>Edit</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleCopyMessage(msg)}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-left"
                      >
                        <Copy className="w-4 h-4 text-slate-400" />
                        <span>{t.copy}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setForwardModalMsg(msg);
                          setActiveMenuMsgId(null);
                        }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-left"
                      >
                        <CornerUpRight className="w-4 h-4 text-slate-400" />
                        <span>{t.forward}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (pinnedMessageId === msg.id) {
                            handleUnpinMessage();
                          } else {
                            handlePinMessage(msg.id);
                          }
                        }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-left text-slate-700 dark:text-slate-200"
                      >
                        {pinnedMessageId === msg.id ? (
                          <>
                            <PinOff className="w-4 h-4 text-amber-500" />
                            <span>{currentUser.language === 'bn' ? 'আনপিন করুন' : 'Unpin Message'}</span>
                          </>
                        ) : (
                          <>
                            <Pin className="w-4 h-4 text-indigo-500" />
                            <span>{currentUser.language === 'bn' ? 'পিন করুন' : 'Pin Message'}</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteForMe(msg)}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-left text-red-600 dark:text-red-400"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>{t.deleteForMe}</span>
                      </button>

                      {isMine && (
                        <button
                          type="button"
                          onClick={() => handleDeleteForEveryone(msg)}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-left text-red-600 dark:text-red-400 font-semibold"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>{t.deleteForEveryone}</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Reaction Pill Badges beneath bubble */}
                {(() => {
                  const msgRx = messageReactions[msg.id];
                  if (!msgRx) return null;
                  const entries = Object.entries(msgRx).filter(([_, ids]) => ids.length > 0);
                  if (entries.length === 0) return null;

                  return (
                    <div className={`flex flex-wrap items-center gap-1 mt-1 px-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
                      {entries.map(([emoji, uids]) => {
                        const hasMine = uids.includes(currentUser.id);
                        return (
                          <button
                            key={emoji}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleReaction(msg.id, emoji);
                            }}
                            className={`px-2 py-0.5 rounded-full text-xs flex items-center gap-1 border transition-all active:scale-95 shadow-2xs ${
                              hasMine
                                ? isMine
                                  ? 'bg-white text-blue-700 border-white font-bold ring-2 ring-white/50'
                                  : 'bg-blue-50 dark:bg-blue-950 border-blue-500 text-blue-700 dark:text-blue-300 font-bold ring-2 ring-blue-500/30'
                                : isMine
                                ? 'bg-blue-700/80 text-white border-blue-500/40'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                            }`}
                          >
                            <span>{emoji}</span>
                            <span className="font-mono-num text-[11px]">{uids.length}</span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
                </React.Fragment>
              );
            });
          })()
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Fixed Bottom Composer Zone (Upload Progress, Edit/Reply Previews, Emoji Bar, Composer Form) */}
      <div className="osa-chat-composer-zone bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
        {/* Upload Progress Indicator */}
        {uploadProgress !== null && (
          <div className="shrink-0 px-4 py-2 bg-blue-50 dark:bg-blue-950/60 border-b border-blue-200 dark:border-blue-800 flex items-center gap-3">
            <div className="flex-1 h-2 rounded-full bg-blue-200 dark:bg-blue-900 overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all duration-200"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <span className="text-xs font-mono-num font-semibold text-blue-700 dark:text-blue-300">
              {uploadProgress}%
            </span>
          </div>
        )}

        {/* Editing Message Banner */}
        {editingMsg && (
          <div className="shrink-0 px-4 py-2 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1 border-l-3 border-amber-500 pl-2.5">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                Editing Message
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-300 truncate">
                {editingMsg.content}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingMsg(null);
                setText('');
              }}
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 shrink-0"
              aria-label="Cancel editing"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Scheduled Messages Notice Banner */}
        {scheduledMessages.length > 0 && (
          <div className="shrink-0 px-4 py-2 bg-indigo-50/80 dark:bg-indigo-950/40 border-b border-indigo-200/50 dark:border-indigo-900/40 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setShowScheduledListModal(true)}
              className="flex items-center gap-2 text-left min-w-0 flex-1 hover:underline text-indigo-700 dark:text-indigo-300 text-xs font-semibold"
            >
              <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span className="truncate">
                {currentUser.language === 'bn'
                  ? `${scheduledMessages.length}টি শিডিউল করা বার্তা অপেক্ষমাণ`
                  : `${scheduledMessages.length} scheduled message(s) pending`}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setShowScheduledListModal(true)}
              className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-lg bg-indigo-100 dark:bg-indigo-900/60 shrink-0"
            >
              View
            </button>
          </div>
        )}

        {/* Reply Banner */}
        {replyTo && (
          <div className="shrink-0 px-4 py-2 bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1 border-l-3 border-blue-600 pl-2.5">
              <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                Replying to {replyTo.sender_id === currentUser.id ? 'yourself' : chatTitle}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-300 truncate">
                {replyTo.content}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Emoji Bar */}
        {showEmojiPicker && (
          <div className="shrink-0 px-3 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center gap-1.5 overflow-x-auto">
            {COMMON_EMOJIS.map((em) => (
              <button
                key={em}
                type="button"
                onClick={() => setText((prev) => prev + em)}
                className="w-9 h-9 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-lg flex items-center justify-center shrink-0"
              >
                {em}
              </button>
            ))}
          </div>
        )}

        {/* Message Composer or Blocked Notice */}
        {!isGroup && blockState.anyBlock ? (
          <div className="shrink-0 p-4 bg-white dark:bg-slate-900 text-center">
            {blockState.blockedByMe ? (
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <span className="text-xs text-slate-600 dark:text-slate-300">
                  You have blocked this contact on OSA.
                </span>
                <button
                  type="button"
                  onClick={handleBlockToggle}
                  className="px-4 py-2 min-h-[38px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
                >
                  {t.unblockUser}
                </button>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                You cannot reply to this conversation.
              </p>
            )}
          </div>
        ) : isRecordingVoice ? (
          <div className="px-2 sm:px-4 py-2.5 bg-slate-900 border-t border-slate-800/80 flex items-center justify-between gap-2 sm:gap-3 shrink-0 w-full animate-in fade-in slide-in-from-bottom-2 duration-200">
            {/* Recording status & duration */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <span
                className={`w-3 h-3 rounded-full shrink-0 ${
                  isVoicePaused
                    ? 'bg-amber-400'
                    : 'bg-red-500 animate-pulse shadow-sm shadow-red-500/50'
                }`}
              />
              <div className="flex flex-col min-w-0">
                <span className="text-[11px] font-medium text-slate-400 truncate">
                  {isVoicePaused
                    ? currentUser.language === 'bn'
                      ? 'রেকর্ডিং স্থগিত'
                      : 'Paused'
                    : currentUser.language === 'bn'
                    ? 'ভয়েস রেকর্ড হচ্ছে'
                    : 'Recording...'}
                </span>
                <span className="text-sm font-mono-num font-bold text-white tracking-wider">
                  {Math.floor(voiceDurationSeconds / 60)
                    .toString()
                    .padStart(2, '0')}
                  :{(voiceDurationSeconds % 60).toString().padStart(2, '0')}
                </span>
              </div>
            </div>

            {/* Futuristic Animated Audio Waveform */}
            <div className="flex-1 flex items-center justify-center gap-0.5 sm:gap-1 h-8 max-w-[140px] sm:max-w-[220px] px-2 overflow-hidden">
              {waveformLevels.map((lvl, idx) => (
                <div
                  key={idx}
                  style={{ height: isVoicePaused ? '20%' : `${lvl}%` }}
                  className="w-1 rounded-full bg-gradient-to-t from-violet-500 via-fuchsia-500 to-cyan-400 transition-all duration-150 shrink-0"
                />
              ))}
            </div>

            {/* Action controls: Cancel, Pause/Resume, Send */}
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              {/* Cancel / Discard */}
              <button
                type="button"
                onClick={handleCancelVoiceRecording}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-red-400 hover:bg-red-500/10 active:scale-95 transition-all"
                title={currentUser.language === 'bn' ? 'বাতিল করুন' : 'Cancel'}
              >
                <Trash2 className="w-4.5 h-4.5" />
              </button>

              {/* Pause / Resume */}
              <button
                type="button"
                onClick={handleTogglePauseVoiceRecording}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-slate-300 hover:bg-slate-800 active:scale-95 transition-all"
                title={
                  isVoicePaused
                    ? currentUser.language === 'bn'
                      ? 'চালিয়ে যান'
                      : 'Resume'
                    : currentUser.language === 'bn'
                    ? 'স্থগিত করুন'
                    : 'Pause'
                }
              >
                {isVoicePaused ? (
                  <Play className="w-4.5 h-4.5 text-cyan-400" />
                ) : (
                  <Pause className="w-4.5 h-4.5 text-amber-400" />
                )}
              </button>

              {/* Send Voice Message */}
              <button
                type="button"
                onClick={handleSendVoiceMessage}
                disabled={sending}
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white flex items-center justify-center shadow-lg shadow-violet-600/30 active:scale-95 transition-all"
                title={currentUser.language === 'bn' ? 'ভয়েস পাঠান' : 'Send Voice Message'}
              >
                <Send className="w-4.5 h-4.5" />
              </button>
            </div>
          </div>
        ) : (
          <div>
            {voicePermissionDenied && (
              <div className="px-3 py-2 bg-amber-500/10 border-t border-amber-500/20 text-amber-200 text-xs flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <MicOff className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    {currentUser.language === 'bn'
                      ? 'ভয়েস মেসেজ রেকর্ড করতে মাইক্রোফোন পারমিশন প্রয়োজন।'
                      : 'Microphone permission is required to send voice messages.'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setVoicePermissionDenied(false)}
                  className="text-amber-400 hover:underline shrink-0 text-xs font-semibold"
                >
                  {currentUser.language === 'bn' ? 'ঠিক আছে' : 'Dismiss'}
                </button>
              </div>
            )}

            {/* WhatsApp-Style '+' Action Menu Popover */}
            {showAttachmentMenu && (
              <div className="shrink-0 p-3 sm:p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200">
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-3 sm:gap-4 max-w-2xl mx-auto">
                  {/* 1. Document / File */}
                  <button
                    type="button"
                    onClick={() => {
                      setShowAttachmentMenu(false);
                      fileInputRef.current?.click();
                    }}
                    className="flex flex-col items-center gap-1.5 group focus:outline-none"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-500 text-white flex items-center justify-center shadow-md shadow-purple-500/25 group-hover:scale-105 active:scale-95 transition-all">
                      <FileText className="w-6 h-6" />
                    </div>
                    <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">
                      Document
                    </span>
                  </button>

                  {/* 2. Photos & Videos */}
                  <button
                    type="button"
                    onClick={() => {
                      setShowAttachmentMenu(false);
                      fileInputRef.current?.click();
                    }}
                    className="flex flex-col items-center gap-1.5 group focus:outline-none"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-cyan-500 text-white flex items-center justify-center shadow-md shadow-blue-500/25 group-hover:scale-105 active:scale-95 transition-all">
                      <ImageIcon className="w-6 h-6" />
                    </div>
                    <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">
                      Gallery
                    </span>
                  </button>

                  {/* 3. View Once Media */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsViewOnceNext(true);
                      setShowAttachmentMenu(false);
                      fileInputRef.current?.click();
                    }}
                    className="flex flex-col items-center gap-1.5 group focus:outline-none"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-teal-500 to-emerald-500 text-white flex items-center justify-center shadow-md shadow-teal-500/25 group-hover:scale-105 active:scale-95 transition-all">
                      <Eye className="w-6 h-6" />
                    </div>
                    <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">
                      View Once
                    </span>
                  </button>

                  {/* 4. Poll */}
                  <button
                    type="button"
                    onClick={() => {
                      setShowAttachmentMenu(false);
                      setShowCreatePollModal(true);
                    }}
                    className="flex flex-col items-center gap-1.5 group focus:outline-none"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-md shadow-amber-500/25 group-hover:scale-105 active:scale-95 transition-all">
                      <BarChart2 className="w-6 h-6" />
                    </div>
                    <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">
                      Poll
                    </span>
                  </button>

                  {/* 5. Schedule Message */}
                  <button
                    type="button"
                    onClick={() => {
                      setShowAttachmentMenu(false);
                      const now = new Date();
                      now.setMinutes(now.getMinutes() + 10);
                      const yr = now.getFullYear();
                      const mo = String(now.getMonth() + 1).padStart(2, '0');
                      const da = String(now.getDate()).padStart(2, '0');
                      const ho = String(now.getHours()).padStart(2, '0');
                      const mi = String(now.getMinutes()).padStart(2, '0');
                      setScheduleTargetDate(`${yr}-${mo}-${da}`);
                      setScheduleTargetTime(`${ho}:${mi}`);
                      setShowScheduleModal(true);
                    }}
                    className="flex flex-col items-center gap-1.5 group focus:outline-none"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-violet-600 to-fuchsia-500 text-white flex items-center justify-center shadow-md shadow-violet-500/25 group-hover:scale-105 active:scale-95 transition-all">
                      <Clock className="w-6 h-6" />
                    </div>
                    <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">
                      Schedule
                    </span>
                  </button>

                  {/* 6. Live GPS Location */}
                  <button
                    type="button"
                    disabled={sharingLocation}
                    onClick={async () => {
                      setShowAttachmentMenu(false);
                      if (!isGroup && peer) {
                        setSelectedLocationCard(null);
                        setShowRemoteLocationModal(true);
                        return;
                      }
                      setSharingLocation(true);
                      setError('');
                      try {
                        const pos = await getCurrentDeviceLocation(currentUser.id);
                        const content = formatLocationChatMessage({
                          latitude: pos.coords.latitude,
                          longitude: pos.coords.longitude,
                          accuracy: Math.round(pos.coords.accuracy || 10),
                          label: `${currentUser.full_name}'s GPS Location`,
                          timestamp: new Date(pos.timestamp).toISOString(),
                        });
                        const sent = await sendTextMessage({
                          chatId: chat.id,
                          senderId: currentUser.id,
                          content,
                        });
                        setMessages((prev) =>
                          prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]
                        );
                        onChatUpdated();
                      } catch (err) {
                        setError(
                          err instanceof Error ? err.message : 'Unable to share current GPS location.'
                        );
                      } finally {
                        setSharingLocation(false);
                      }
                    }}
                    className="flex flex-col items-center gap-1.5 group focus:outline-none disabled:opacity-40"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-green-600 text-white flex items-center justify-center shadow-md shadow-emerald-500/25 group-hover:scale-105 active:scale-95 transition-all">
                      <MapPin className="w-6 h-6" />
                    </div>
                    <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">
                      Location
                    </span>
                  </button>

                  {/* 7. AI Smart Assistant */}
                  <button
                    type="button"
                    disabled={aiDrafting}
                    onClick={() => {
                      setShowAttachmentMenu(false);
                      handleAiDraft();
                    }}
                    className="flex flex-col items-center gap-1.5 group focus:outline-none disabled:opacity-40"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-rose-500 to-pink-500 text-white flex items-center justify-center shadow-md shadow-rose-500/25 group-hover:scale-105 active:scale-95 transition-all">
                      <Sparkles className={`w-6 h-6 ${aiDrafting ? 'animate-pulse' : ''}`} />
                    </div>
                    <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">
                      AI Draft
                    </span>
                  </button>

                  {/* 8. Round Instant Video Note */}
                  <button
                    type="button"
                    onClick={handleOpenVideoNoteModal}
                    className="flex flex-col items-center gap-1.5 group focus:outline-none"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-fuchsia-600 to-rose-500 text-white flex items-center justify-center shadow-md shadow-fuchsia-500/25 group-hover:scale-105 active:scale-95 transition-all">
                      <Camera className="w-6 h-6" />
                    </div>
                    <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">
                      Video Note
                    </span>
                  </button>

                  {/* 9. Emergency SOS Alert */}
                  <button
                    type="button"
                    onClick={handleOpenSosModal}
                    className="flex flex-col items-center gap-1.5 group focus:outline-none"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-red-600 to-rose-600 text-white flex items-center justify-center shadow-md shadow-red-500/30 group-hover:scale-105 active:scale-95 transition-all animate-pulse">
                      <ShieldAlert className="w-6 h-6" />
                    </div>
                    <span className="text-[11px] font-medium text-red-600 dark:text-red-400 font-bold">
                      SOS Alert
                    </span>
                  </button>

                  {/* 10. Split Bill (Group only) */}
                  {isGroup && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowAttachmentMenu(false);
                        setShowSplitBillModal(true);
                      }}
                      className="flex flex-col items-center gap-1.5 group focus:outline-none"
                    >
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-teal-500 to-emerald-600 text-white flex items-center justify-center shadow-md shadow-teal-500/25 group-hover:scale-105 active:scale-95 transition-all">
                        <Receipt className="w-6 h-6" />
                      </div>
                      <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">
                        Split Bill
                      </span>
                    </button>
                  )}
                </div>
              </div>
            )}

            <form
              onSubmit={handleSendText}
              className="px-2 sm:px-3 py-2 bg-white dark:bg-slate-900 flex items-center gap-1.5 sm:gap-2 shrink-0 w-full max-w-full overflow-hidden"
            >
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileChange}
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
                className="hidden"
              />

              {/* WhatsApp-Style '+' Action Menu Toggle */}
              <button
                type="button"
                onClick={() => {
                  setShowAttachmentMenu((prev) => !prev);
                  setShowEmojiPicker(false);
                }}
                className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all ${
                  showAttachmentMenu
                    ? 'bg-blue-600 text-white rotate-45 shadow-md shadow-blue-600/30'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
                title="Attachments & Actions"
                aria-label="Attachments & Actions"
              >
                <Plus className="w-5 h-5 stroke-[2.5]" />
              </button>

              {/* Emoji Picker Toggle */}
              <button
                type="button"
                onClick={() => {
                  setShowEmojiPicker((prev) => !prev);
                  setShowAttachmentMenu(false);
                }}
                className="w-10 h-10 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                title="Emoji"
              >
                <Smile className="w-5 h-5" />
              </button>

              {/* View Once active indicator chip if enabled */}
              {isViewOnceNext && (
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-blue-100 dark:bg-blue-950 border border-blue-300 dark:border-blue-800 text-[11px] text-blue-700 dark:text-blue-300 font-semibold shrink-0 animate-in fade-in">
                  <Eye className="w-3.5 h-3.5" />
                  <span>View Once Active</span>
                  <button
                    type="button"
                    onClick={() => setIsViewOnceNext(false)}
                    className="ml-1 text-blue-500 hover:text-blue-700"
                  >
                    &times;
                  </button>
                </div>
              )}

              <input
                type="text"
                value={text}
                onChange={(e) => handleTypingChange(e.target.value)}
                placeholder={t.typeMessage}
                className="flex-1 min-w-0 px-3 sm:px-4 py-2 sm:py-2.5 min-h-[42px] sm:min-h-[44px] neumorphic-input text-base sm:text-sm text-slate-900 dark:text-white focus:outline-none"
              />

              {text.trim() ? (
                <button
                  type="submit"
                  disabled={!text.trim() || sending}
                  className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white flex items-center justify-center shrink-0 shadow-sm transition-colors"
                  title={t.send}
                >
                  <Send className="w-4.5 h-4.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStartVoiceRecording}
                  className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-violet-600/30 transition-transform active:scale-95"
                  title={
                    currentUser.language === 'bn'
                      ? 'ভয়েস মেসেজ রেকর্ড করুন'
                      : 'Record Voice Message'
                  }
                >
                  <Mic className="w-5 h-5" />
                </button>
              )}
            </form>
          </div>
        )}
      </div>

      {/* Forward Message Modal */}
      {forwardModalMsg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-2xl max-h-dvh-modal flex flex-col overflow-hidden">
            <div className="shrink-0 flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {t.forward} Message
              </h3>
              <button
                type="button"
                onClick={() => setForwardModalMsg(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {allChats.map((c) => {
                const name = c.type === 'group' ? c.group?.name || 'Group' : c.peer?.full_name || 'User';
                const avatar = c.type === 'group' ? c.group?.avatar_url : c.peer?.avatar_url;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleForwardToChat(c.id)}
                    className="w-full flex items-center gap-3 py-3 px-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-left rounded-xl"
                  >
                    <OSAAvatar name={name} avatarUrl={avatar} size="sm" isGroup={c.type === 'group'} />
                    <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Image Viewer Lightbox */}
      {lightboxImageUrl && (
        <div
          onClick={() => setLightboxImageUrl(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
        >
          <button
            type="button"
            onClick={() => setLightboxImageUrl(null)}
            className="absolute top-5 right-5 w-11 h-11 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={lightboxImageUrl}
            alt="Attachment preview"
            referrerPolicy="no-referrer"
            className="max-h-[88vh] max-w-[92vw] rounded-2xl object-contain"
          />
        </div>
      )}

      {/* Chat Information & Group Management Drawer */}
      {showChatInfo && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 h-full flex flex-col overflow-hidden">
            {/* Fixed Top Header */}
            <div className="shrink-0 px-5 py-4 pt-safe bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between z-10">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {isGroup ? t.groupInfo : t.chatInfo}
              </h3>
              <button
                type="button"
                onClick={() => setShowChatInfo(false)}
                className="w-9 h-9 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Middle Content */}
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 pb-6">

              {/* Profile / Group Header */}
              <div className="py-6 flex flex-col items-center text-center border-b border-slate-100 dark:border-slate-800">
                <OSAAvatar
                  name={chatTitle}
                  avatarUrl={chatAvatar}
                  size="xl"
                  isOnline={peerTrulyOnline}
                  showOnlineStatus={Boolean(canShowPeerOnline)}
                  isGroup={isGroup}
                  hidePhotoForPrivacy={hidePeerPhoto}
                />
                {isGroup && isGroupAdmin && (
                  <>
                    <input
                      ref={groupPhotoInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleGroupPhotoChange}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => groupPhotoInputRef.current?.click()}
                      className="mt-2 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {t.changePhoto}
                    </button>
                  </>
                )}

                <h4 className="mt-3 text-lg font-bold text-slate-900 dark:text-white">
                  {chatTitle}
                </h4>
                {!isGroup && peer && (
                  <>
                    <p className="mt-0.5 text-xs">
                      {peerTrulyOnline ? (
                        <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                          {t.online}
                        </span>
                      ) : peerLastSeenFormatted ? (
                        <span className="text-slate-500 dark:text-slate-400">
                          {peerLastSeenFormatted}
                        </span>
                      ) : (
                        <span className="text-slate-400">{t.offline}</span>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{peer.email}</p>
                    {(!peerPrivacy || peerPrivacy.about_visibility !== 'nobody') && (
                      <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 max-w-xs">
                        {peer.about}
                      </p>
                    )}
                  </>
                )}
                {isGroup && chat.group?.description && (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-xs">
                    {chat.group.description}
                  </p>
                )}
              </div>

              {/* Admin Group Edit Form */}
              {isGroup && isGroupAdmin && (
                <form
                  onSubmit={handleSaveGroupMetadata}
                  className="py-4 border-b border-slate-100 dark:border-slate-800 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Admin Group Settings
                    </p>
                    <button
                      type="button"
                      onClick={handleGenerateInviteLink}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 text-xs font-bold hover:bg-blue-600/20 transition-colors"
                    >
                      <Link className="w-3.5 h-3.5" />
                      <span>Generate Invite Link</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    value={editGroupName}
                    onChange={(e) => setEditGroupName(e.target.value)}
                    placeholder={t.groupName}
                    className="w-full px-3.5 py-2 min-h-[40px] rounded-xl bg-slate-100 dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                  <input
                    type="text"
                    value={editGroupDesc}
                    onChange={(e) => setEditGroupDesc(e.target.value)}
                    placeholder={t.groupDescription}
                    className="w-full px-3.5 py-2 min-h-[40px] rounded-xl bg-slate-100 dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                  <div className="flex items-center justify-between py-2 border-t border-slate-100 dark:border-slate-800">
                    <div>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        Require Admin Approval
                      </p>
                      <p className="text-[11px] text-slate-500">
                        New invite link members must be approved
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={requireApproval}
                        onChange={(e) => handleToggleRequireApproval(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>

                  {pendingJoinRequests.length > 0 && (
                    <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-900 dark:text-amber-200">
                          Pending Join Requests ({pendingJoinRequests.length})
                        </span>
                      </div>
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {pendingJoinRequests.map((req) => (
                          <div key={req.id} className="flex items-center justify-between gap-2 p-2 rounded-xl bg-white dark:bg-slate-900 border border-amber-200/60 dark:border-amber-800/40">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold truncate text-slate-900 dark:text-white">
                                {req.fullName}
                              </p>
                              <p className="text-[10px] text-slate-500 truncate">
                                {new Date(req.requestedAt).toLocaleDateString()}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleApproveRequest(req)}
                                className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRejectRequest(req)}
                                className="px-2 py-1 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-red-500 hover:text-white rounded-lg text-[10px] font-bold"
                              >
                                Reject
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={savingGroupInfo}
                    className="w-full py-2 min-h-[40px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
                  >
                    {savingGroupInfo ? 'Saving...' : t.saveChanges}
                  </button>
                </form>
              )}

              {/* Quick Actions */}
              <div className="py-3 border-b border-slate-100 dark:border-slate-800 space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowChatInfo(false);
                    setSearchInChatOpen(true);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-sm text-slate-700 dark:text-slate-200"
                >
                  <Search className="w-4 h-4 text-blue-600" />
                  <span>{t.searchInConversation}</span>
                </button>

                <button
                  type="button"
                  onClick={handleToggleMute}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-sm text-slate-700 dark:text-slate-200"
                >
                  {isMuted ? (
                    <Bell className="w-4 h-4 text-blue-600" />
                  ) : (
                    <BellOff className="w-4 h-4 text-slate-500" />
                  )}
                  <span>{isMuted ? t.unmuteNotifications : t.muteNotifications}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowChatInfo(false);
                    setShowRingtoneModal(true);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-sm text-slate-700 dark:text-slate-200"
                >
                  <Music className="w-4 h-4 text-blue-600" />
                  <span>Call Ringtone</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowChatInfo(false);
                    setShowTranslationModal(true);
                  }}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-sm text-slate-700 dark:text-slate-200"
                >
                  <span className="flex items-center gap-3">
                    <Globe className="w-4 h-4 text-blue-600" />
                    <span>Chat Translation Language</span>
                  </span>
                  <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                    {getTranslationLanguageOption(chatTranslationLang).badge}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowDisappearingModal(true)}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-sm text-slate-700 dark:text-slate-200"
                >
                  <span className="flex items-center gap-3">
                    <Timer className="w-4 h-4 text-amber-500" />
                    <span>Disappearing Messages</span>
                  </span>
                  <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                    {disappearingTimer === 0
                      ? 'Off'
                      : disappearingTimer === 86400000
                      ? '24h'
                      : disappearingTimer === 604800000
                      ? '7d'
                      : '90d'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setTempLockPin(chatLockPin);
                    setShowChatLockModal(true);
                  }}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-sm text-slate-700 dark:text-slate-200"
                >
                  <span className="flex items-center gap-3">
                    {chatLockPin ? (
                      <Lock className="w-4 h-4 text-indigo-600" />
                    ) : (
                      <Unlock className="w-4 h-4 text-slate-400" />
                    )}
                    <span>Chat Lock / Secret PIN</span>
                  </span>
                  <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                    {chatLockPin ? 'Locked' : 'Off'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleToggleGhostMode}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-sm text-slate-700 dark:text-slate-200"
                >
                  <span className="flex items-center gap-3">
                    <Ghost className={`w-4 h-4 ${ghostModeActive ? 'text-purple-600' : 'text-slate-400'}`} />
                    <span>Ghost Mode (Incognito)</span>
                  </span>
                  <span className={`text-xs font-semibold ${ghostModeActive ? 'text-purple-600 dark:text-purple-400' : 'text-slate-400'}`}>
                    {ghostModeActive ? 'Active' : 'Off'}
                  </span>
                </button>

                {isGroup && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowChatInfo(false);
                      setShowSplitBillModal(true);
                    }}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-sm text-slate-700 dark:text-slate-200"
                  >
                    <span className="flex items-center gap-3">
                      <Receipt className="w-4 h-4 text-teal-600" />
                      <span>Split Group Bill</span>
                    </span>
                    <span className="text-xs font-semibold text-teal-600 dark:text-teal-400">
                      New
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleClearChat}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-sm text-amber-600"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{t.clearChat}</span>
                </button>
              </div>

              {/* Tabs: Media, Files, Links, Members */}
              <div className="py-4">
                <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl mb-3 overflow-x-auto">
                  {(
                    [
                      'media',
                      'files',
                      'links',
                      ...(!isGroup ? ['calls'] : []),
                      ...(isGroup ? ['members', ...(isGroupAdmin ? ['insights'] : [])] : []),
                    ] as const
                  ).map((tabKey) => (
                    <button
                      key={tabKey}
                      type="button"
                      onClick={() =>
                        setInfoTab(
                          tabKey as 'media' | 'files' | 'links' | 'calls' | 'members' | 'insights'
                        )
                      }
                      className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-lg capitalize transition-colors whitespace-nowrap ${
                        infoTab === tabKey
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-500'
                      }`}
                    >
                      {tabKey}
                    </button>
                  ))}
                </div>

                {infoTab === 'media' && (
                  <div className="grid grid-cols-3 gap-2">
                    {mediaAttachments.length === 0 ? (
                      <p className="col-span-3 text-center py-6 text-xs text-slate-400">
                        No shared photos or videos yet.
                      </p>
                    ) : (
                      mediaAttachments.map((att) => (
                        <a
                          key={att.id}
                          href={att.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="aspect-square rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 block"
                        >
                          {att.file_type === 'image' ? (
                            <img
                              src={att.file_url}
                              alt={att.file_name}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <video src={att.file_url} className="w-full h-full object-cover" />
                          )}
                        </a>
                      ))
                    )}
                  </div>
                )}

                {infoTab === 'files' && (
                  <div className="space-y-2">
                    {docAttachments.length === 0 ? (
                      <p className="text-center py-6 text-xs text-slate-400">
                        No shared files yet.
                      </p>
                    ) : (
                      docAttachments.map((att) => (
                        <a
                          key={att.id}
                          href={att.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 text-xs"
                        >
                          <span className="truncate font-medium text-slate-800 dark:text-slate-200">
                            {att.file_name}
                          </span>
                          <span className="text-slate-400 shrink-0 ml-2">
                            {formatBytes(att.file_size)}
                          </span>
                        </a>
                      ))
                    )}
                  </div>
                )}

                {infoTab === 'links' && (
                  <div className="space-y-2">
                    {extractedLinks.length === 0 ? (
                      <p className="text-center py-6 text-xs text-slate-400">
                        No links shared in this chat.
                      </p>
                    ) : (
                      extractedLinks.map((lnk) => (
                        <a
                          key={lnk.id}
                          href={lnk.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 text-xs text-blue-600 dark:text-blue-400 truncate hover:underline"
                        >
                          {lnk.url}
                        </a>
                      ))
                    )}
                  </div>
                )}

                {infoTab === 'calls' && !isGroup && (
                  <div className="space-y-2">
                    {chatCalls.length === 0 ? (
                      <p className="text-center py-6 text-xs text-slate-400">
                        {t.noCallsYet}
                      </p>
                    ) : (
                      [...chatCalls].reverse().map((c) => {
                        const isOutgoing = c.caller_id === currentUser.id;
                        const isVideo = c.call_type === 'video';
                        const isMissedOrRejected =
                          c.status === 'missed' || c.status === 'rejected';
                        const mins = Math.floor((c.duration_seconds || 0) / 60)
                          .toString()
                          .padStart(2, '0');
                        const secs = ((c.duration_seconds || 0) % 60)
                          .toString()
                          .padStart(2, '0');
                        const durStr =
                          c.duration_seconds && c.duration_seconds > 0
                            ? `${mins}:${secs}`
                            : null;
                        return (
                          <div
                            key={c.id}
                            className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800"
                          >
                            <div className="min-w-0">
                              <p
                                className={`text-xs font-bold truncate ${
                                  isMissedOrRejected
                                    ? 'text-red-600 dark:text-red-400'
                                    : 'text-slate-900 dark:text-white'
                                }`}
                              >
                                {c.status === 'missed'
                                  ? t.missedCall
                                  : c.status === 'rejected'
                                  ? t.callRejected
                                  : isOutgoing
                                  ? isVideo
                                    ? 'Outgoing video call'
                                    : 'Outgoing audio call'
                                  : isVideo
                                  ? 'Incoming video call'
                                  : 'Incoming audio call'}
                              </p>
                              <p className="text-[10px] font-mono-num text-slate-400">
                                {durStr ? `${durStr} · ` : ''}
                                {new Date(c.created_at).toLocaleString([], {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: 'numeric',
                                  minute: '2-digit',
                                })}
                              </p>
                            </div>
                            {peer && !blockState.anyBlock && (
                              <button
                                type="button"
                                onClick={() => {
                                  setShowChatInfo(false);
                                  onStartCall(peer, c.call_type, chat.id);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-blue-600 text-white text-[11px] font-semibold shrink-0"
                              >
                                Call back
                              </button>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {infoTab === 'members' && isGroup && (
                  <div className="space-y-2">
                    {isGroupAdmin && (
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <button
                          type="button"
                          onClick={handleOpenAddMember}
                          className="flex items-center justify-center gap-2 py-2.5 min-h-[40px] rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 text-xs font-semibold hover:bg-blue-600/20 transition-colors"
                        >
                          <UserPlus className="w-4 h-4" />
                          <span>{t.addMembers}</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleGenerateInviteLink}
                          className="flex items-center justify-center gap-2 py-2.5 min-h-[40px] rounded-xl bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold hover:bg-emerald-600/20 transition-colors"
                        >
                          <Link className="w-4 h-4" />
                          <span>Invite Link</span>
                        </button>
                      </div>
                    )}
                    {groupMembers.map((gm) => (
                      <div
                        key={gm.id}
                        className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <OSAAvatar
                            name={gm.profile?.full_name || 'Member'}
                            avatarUrl={gm.profile?.avatar_url}
                            size="xs"
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                              {gm.profile?.full_name || 'OSA User'}
                            </p>
                            <p className="text-[10px] text-slate-400">
                              {gm.role === 'admin' ? t.admin : t.member}
                            </p>
                          </div>
                        </div>
                        {isGroupAdmin && gm.user_id !== currentUser.id && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            {gm.role === 'admin' ? (
                              <button
                                type="button"
                                onClick={() => handleUpdateMemberRole(gm.user_id, 'member')}
                                className="px-2.5 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-[10px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-300 transition-colors"
                                title="Demote to Member"
                              >
                                Demote
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleUpdateMemberRole(gm.user_id, 'admin')}
                                className="px-2.5 py-1 rounded-lg bg-blue-600/20 text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-600/30 transition-colors"
                                title="Promote to Admin"
                              >
                                Make Admin
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRemoveGroupMember(gm.user_id)}
                              className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors"
                              title={t.removeMember}
                            >
                              <UserMinus className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {infoTab === 'insights' && isGroup && isGroupAdmin && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-3xl osa-embossed-card space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                        <BarChart3 className="w-4 h-4" />
                        <span>Group Activity Insights</span>
                      </h4>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
                          <p className="text-[10px] uppercase font-bold text-slate-400">Total Messages</p>
                          <p className="text-lg font-black text-slate-900 dark:text-white mt-0.5">{messages.length}</p>
                        </div>
                        <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
                          <p className="text-[10px] uppercase font-bold text-slate-400">Media Shared</p>
                          <p className="text-lg font-black text-slate-900 dark:text-white mt-0.5">{allAttachments.length}</p>
                        </div>
                        <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
                          <p className="text-[10px] uppercase font-bold text-slate-400">Total Members</p>
                          <p className="text-lg font-black text-slate-900 dark:text-white mt-0.5">{groupMembers.length}</p>
                        </div>
                        <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
                          <p className="text-[10px] uppercase font-bold text-slate-400">Group Admins</p>
                          <p className="text-lg font-black text-slate-900 dark:text-white mt-0.5">
                            {groupMembers.filter((m) => m.role === 'admin').length}
                          </p>
                        </div>
                      </div>

                      <div className="pt-2 space-y-1.5">
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Peak Active Hours</p>
                        <div className="p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300 font-semibold flex items-center justify-between">
                          <span>Most Active Time</span>
                          <span className="font-mono">7:00 PM - 10:00 PM</span>
                        </div>
                      </div>

                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={handleGenerateInviteLink}
                          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-600/20 transition-all"
                        >
                          <Link className="w-4 h-4" />
                          <span>Generate Invite Link</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Fixed Bottom Danger Actions: Block / Report or Leave / Delete Group */}
            <div className="shrink-0 px-5 py-3.5 pb-safe bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 space-y-2 z-10">
              {!isGroup && peer ? (
                <>
                  <button
                    type="button"
                    onClick={handleBlockToggle}
                    className="w-full flex items-center justify-center gap-2 py-2.5 min-h-[44px] rounded-xl border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 text-xs font-semibold hover:bg-red-50 dark:hover:bg-red-950/30"
                  >
                    <Ban className="w-4 h-4" />
                    <span>{blockState.blockedByMe ? t.unblockUser : t.blockUser}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowReportModal(true)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 min-h-[44px] rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
                  >
                    <AlertTriangle className="w-4 h-4" />
                    <span>{t.reportUser}</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => handleRemoveGroupMember(currentUser.id)}
                    className="w-full py-2.5 min-h-[44px] rounded-xl border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 text-xs font-semibold"
                  >
                    {t.leaveGroup}
                  </button>
                  {isGroupAdmin && (
                    <button
                      type="button"
                      onClick={handleDeleteGroup}
                      className="w-full py-2.5 min-h-[44px] rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
                    >
                      {t.deleteGroup}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Group Member Modal */}
      {showAddMemberModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-2xl max-h-dvh-modal flex flex-col overflow-hidden">
            <div className="shrink-0 flex items-center justify-between mb-3">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                {t.addMembers}
              </h4>
              <button
                type="button"
                onClick={() => setShowAddMemberModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              type="text"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder="Filter users..."
              className="shrink-0 w-full px-3.5 py-2 min-h-[40px] rounded-xl bg-slate-100 dark:bg-slate-800 text-xs mb-3"
            />
            <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {candidateUsers
                .filter((u) =>
                  u.full_name.toLowerCase().includes(memberSearch.toLowerCase())
                )
                .map((u) => (
                  <div key={u.id} className="flex items-center justify-between py-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <OSAAvatar name={u.full_name} avatarUrl={u.avatar_url} size="xs" />
                      <span className="text-xs font-medium text-slate-900 dark:text-white truncate">
                        {u.full_name}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddMemberToGroup(u.id)}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold inline-flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add</span>
                    </button>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Group Invite Link Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-2xl max-h-dvh-modal flex flex-col overflow-hidden">
            <div className="shrink-0 flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Link className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    Group Invite Link
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Shareable Supabase URL
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col items-center text-center py-2 mb-4">
              <OSAAvatar name={chatTitle} avatarUrl={chatAvatar} size="lg" isGroup={true} />
              <h5 className="mt-2 text-sm font-bold text-slate-900 dark:text-white">{chatTitle}</h5>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Anyone with this link can join this group via Supabase
              </p>
            </div>

            <div className="space-y-3 mb-4">
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Invite Link
                </p>
                <input
                  type="text"
                  readOnly
                  value={generatedInviteUrl}
                  onFocus={(e) => e.target.select()}
                  className="w-full bg-transparent font-mono text-xs text-slate-800 dark:text-slate-200 select-all outline-none"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyInviteLink}
                  className="flex-1 py-2.5 min-h-[42px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center justify-center gap-2 shadow-sm transition-colors"
                >
                  {inviteCopied ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-300" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copy Link</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleShareInviteLink}
                  className="py-2.5 px-3 min-h-[42px] rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
                  title="Share via device"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Share</span>
                </button>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                Group ID: <span className="font-mono">{chat.group_id?.slice(0, 8)}...</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  handleGenerateInviteLink();
                  setInviteCopied(false);
                }}
                className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline"
              >
                Regenerate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report User Modal */}
      <ReportUserModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        reporterId={currentUser.id}
        reportedUserId={peer?.id || null}
        reportedUserName={chatTitle}
        chatId={chat.id}
      />

      {/* Dedicated Remote Camera Modal (completely separate from Video Call) */}
      {!isGroup && peer && (
        <RemoteCameraModal
          isOpen={showRemoteCameraModal}
          currentUser={currentUser}
          peerUser={peer}
          onClose={() => setShowRemoteCameraModal(false)}
        />
      )}

      {/* Remote & Live Location Modal */}
      {!isGroup && peer && (
        <RemoteLocationModal
          isOpen={showRemoteLocationModal}
          currentUser={currentUser}
          peerUser={peer}
          chatId={chat.id}
          initialLocationData={selectedLocationCard}
          onClose={() => {
            setShowRemoteLocationModal(false);
            setSelectedLocationCard(null);
          }}
          onSendLocationToChat={async (locData) => {
            const content = formatLocationChatMessage(locData);
            const sent = await sendTextMessage({
              chatId: chat.id,
              senderId: currentUser.id,
              content,
            });
            setMessages((prev) =>
              prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]
            );
            onChatUpdated();
          }}
        />
      )}

      <RingtoneModal
        isOpen={showRingtoneModal}
        userId={currentUser.id}
        onClose={() => setShowRingtoneModal(false)}
      />

      {/* Quick Chat Translation Language Modal */}
      {showTranslationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 overflow-hidden">
          <div className="w-full max-w-md max-h-dvh-modal rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden">
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Globe className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Chat Translation Language
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Auto-translate incoming messages into your language
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTranslationModal(false)}
                className="w-9 h-9 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 pb-6 space-y-2">
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
                    }}
                    className={`w-full flex items-center justify-between p-3.5 rounded-2xl border transition-colors text-left ${
                      active
                        ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400'
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

            <div className="shrink-0 px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setShowTranslationModal(false)}
                className="w-full sm:w-auto px-6 py-2.5 min-h-[42px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1. View Once Media Viewer Lightbox */}
      {activeViewOnceMedia && (
        <div
          onClick={() => setActiveViewOnceMedia(null)}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95 p-4 animate-in fade-in duration-200"
        >
          <div className="absolute top-5 left-5 right-5 flex items-center justify-between text-white z-10">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-xs">
                1
              </span>
              <div>
                <p className="text-sm font-bold">View Once</p>
                <p className="text-[11px] text-white/70">Expires immediately upon closing</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveViewOnceMedia(null)}
              className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[82vh] max-w-[92vw] flex items-center justify-center"
          >
            {activeViewOnceMedia.type === 'video' ? (
              <video
                src={activeViewOnceMedia.url}
                controls
                autoPlay
                playsInline
                className="max-h-[80vh] max-w-full rounded-2xl"
              />
            ) : (
              <img
                src={activeViewOnceMedia.url}
                alt={activeViewOnceMedia.name}
                referrerPolicy="no-referrer"
                className="max-h-[80vh] max-w-full rounded-2xl object-contain select-none pointer-events-none"
              />
            )}
          </div>

          <p className="absolute bottom-6 text-xs text-white/60">
            Tap close to exit. This media cannot be reopened.
          </p>
        </div>
      )}

      {/* 2. Create Group Poll Modal */}
      {showCreatePollModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 overflow-hidden animate-in fade-in duration-150">
          <div className="w-full max-w-md max-h-dvh-modal rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden">
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <BarChart2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Create a Poll</h3>
                  <p className="text-[11px] text-slate-500">Ask a question for voting</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreatePollModal(false)}
                className="w-9 h-9 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Question
                </label>
                <input
                  type="text"
                  value={pollQuestion}
                  onChange={(e) => setPollQuestion(e.target.value)}
                  placeholder="Ask a question..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Options
                </label>
                <div className="space-y-2">
                  {pollOptions.map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={opt}
                        onChange={(e) => {
                          const updated = [...pollOptions];
                          updated[idx] = e.target.value;
                          setPollOptions(updated);
                        }}
                        placeholder={`Option ${idx + 1}`}
                        className="flex-1 min-w-0 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                      {pollOptions.length > 2 && (
                        <button
                          type="button"
                          onClick={() => setPollOptions(pollOptions.filter((_, i) => i !== idx))}
                          className="w-8 h-8 rounded-lg text-slate-400 hover:text-red-500 flex items-center justify-center"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {pollOptions.length < 6 && (
                  <button
                    type="button"
                    onClick={() => setPollOptions([...pollOptions, ''])}
                    className="mt-2 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add option</span>
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Allow multiple answers
                </span>
                <input
                  type="checkbox"
                  checked={pollAllowMultiple}
                  onChange={(e) => setPollAllowMultiple(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
              </div>
            </div>

            <div className="shrink-0 px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreatePollModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreatePoll}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
              >
                Create Poll
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Schedule Message Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 overflow-hidden animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Schedule Message
                  </h3>
                  <p className="text-[11px] text-slate-500">Auto-dispatch at target time</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowScheduleModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Target Date
                </label>
                <input
                  type="date"
                  value={scheduleTargetDate}
                  onChange={(e) => setScheduleTargetDate(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Target Time
                </label>
                <input
                  type="time"
                  value={scheduleTargetTime}
                  onChange={(e) => setScheduleTargetTime(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                />
              </div>

              {text.trim() && (
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 truncate">
                  <span className="font-semibold">Message: </span>
                  {text}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowScheduleModal(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleScheduleMessage}
                disabled={!text.trim() || !scheduleTargetDate || !scheduleTargetTime}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-bold"
              >
                Schedule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3b. Scheduled Messages List Modal */}
      {showScheduledListModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 overflow-hidden animate-in fade-in duration-150">
          <div className="w-full max-w-md max-h-dvh-modal rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden">
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Scheduled Messages ({scheduledMessages.length})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowScheduledListModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2">
              {scheduledMessages.length === 0 ? (
                <p className="text-center py-8 text-xs text-slate-400">No scheduled messages</p>
              ) : (
                scheduledMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {msg.content}
                      </p>
                      <p className="text-[10px] text-indigo-600 dark:text-indigo-400 mt-0.5">
                        Due: {new Date(msg.targetTime).toLocaleString()}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteScheduledMessage(msg.id)}
                      className="text-slate-400 hover:text-red-500 p-1.5 rounded-lg"
                      title="Cancel schedule"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="shrink-0 px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setShowScheduledListModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Disappearing Messages Modal */}
      {showDisappearingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 overflow-hidden animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <Timer className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Disappearing Messages
                  </h3>
                  <p className="text-[11px] text-slate-500">Auto-delete after timer expires</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDisappearingModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              {[
                { label: 'Off', ms: 0 },
                { label: '24 Hours', ms: 86400000 },
                { label: '7 Days', ms: 604800000 },
                { label: '90 Days', ms: 7776000000 },
              ].map((opt) => (
                <button
                  key={opt.ms}
                  type="button"
                  onClick={() => handleSetDisappearingTimer(opt.ms)}
                  className={`w-full flex items-center justify-between p-3 rounded-2xl border text-sm font-semibold transition-colors ${
                    disappearingTimer === opt.ms
                      ? 'border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      : 'border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <span>{opt.label}</span>
                  {disappearingTimer === opt.ms && <Check className="w-4 h-4" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 5. Chat Lock PIN Setup Modal */}
      {showChatLockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-xs rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
              <Lock className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Chat Lock PIN
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Set a 4-digit PIN to lock this chat, or leave empty to disable.
              </p>
            </div>
            <input
              type="password"
              maxLength={4}
              value={tempLockPin}
              onChange={(e) => setTempLockPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              className="w-32 mx-auto text-center tracking-widest text-2xl font-bold py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoFocus
            />
            <div className="flex items-center gap-2 pt-2">
              {chatLockPin && (
                <button
                  type="button"
                  onClick={() => handleSaveChatLock('')}
                  className="flex-1 py-2 rounded-xl text-xs font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
                >
                  Remove PIN
                </button>
              )}
              <button
                type="button"
                onClick={() => handleSaveChatLock(tempLockPin)}
                disabled={tempLockPin.length > 0 && tempLockPin.length < 4}
                className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-bold"
              >
                Save
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowChatLockModal(false)}
              className="text-xs text-slate-400 hover:text-slate-600 block mx-auto"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* 6. Round Instant Video Note Viewfinder Modal */}
      {showVideoNoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-6 flex flex-col items-center text-center space-y-4">
            <div className="w-full flex items-center justify-between text-white">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <Video className="w-4 h-4" />
                <span>Round Video Note</span>
              </span>
              <button
                type="button"
                onClick={handleCloseVideoNoteModal}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Circular Viewfinder with 60s Radial Countdown Ring */}
            <div className="relative w-60 h-60 sm:w-64 sm:h-64 rounded-full flex items-center justify-center">
              {/* SVG Ring Progress */}
              <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none">
                <circle
                  cx="50%"
                  cy="50%"
                  r="48%"
                  className="stroke-slate-800 stroke-[5] fill-none"
                />
                <circle
                  cx="50%"
                  cy="50%"
                  r="48%"
                  className={`stroke-[5] fill-none transition-all duration-300 ${
                    isVideoNoteRecording ? 'stroke-rose-500' : 'stroke-emerald-500'
                  }`}
                  strokeDasharray={`${2 * Math.PI * 115}`}
                  strokeDashoffset={`${
                    2 * Math.PI * 115 * (1 - Math.min(videoNoteDuration / 60, 1))
                  }`}
                  strokeLinecap="round"
                />
              </svg>

              {/* Circular Video Element */}
              <div className="w-52 h-52 sm:w-56 sm:h-56 rounded-full overflow-hidden border-2 border-emerald-500/50 bg-black relative shadow-inner">
                {videoNotePreviewUrl ? (
                  <video
                    src={videoNotePreviewUrl}
                    autoPlay
                    loop
                    playsInline
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <video
                    ref={videoNoteVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover scale-x-[-1]"
                  />
                )}

                {isVideoNoteRecording && (
                  <div className="absolute top-3 inset-x-0 flex items-center justify-center pointer-events-none">
                    <span className="px-2.5 py-0.5 rounded-full bg-rose-600/90 text-white font-mono-num font-bold text-xs flex items-center gap-1.5 animate-pulse shadow-md">
                      <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                      <span>REC 0:{videoNoteDuration < 10 ? '0' : ''}{videoNoteDuration}</span>
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Controls */}
            <div className="w-full flex items-center justify-center gap-4 pt-2">
              {!videoNoteRecordedBlob ? (
                <>
                  <button
                    type="button"
                    disabled={isVideoNoteRecording}
                    onClick={handleFlipVideoNoteCamera}
                    className="w-11 h-11 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center disabled:opacity-40 transition-colors"
                    title="Flip camera"
                  >
                    <RefreshCw className="w-5 h-5" />
                  </button>

                  {!isVideoNoteRecording ? (
                    <button
                      type="button"
                      onClick={handleStartVideoNoteRecording}
                      className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-lg shadow-rose-600/40 transition-transform active:scale-95 ring-4 ring-rose-600/20"
                      title="Record video note (up to 60s)"
                    >
                      <div className="w-6 h-6 rounded-full bg-white" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleStopVideoNoteRecording}
                      className="w-16 h-16 rounded-full bg-white hover:bg-slate-100 text-rose-600 flex items-center justify-center shadow-lg transition-transform active:scale-95 ring-4 ring-rose-500/30"
                      title="Stop recording"
                    >
                      <Square className="w-6 h-6 fill-rose-600" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleCloseVideoNoteModal}
                    className="w-11 h-11 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-colors"
                    title="Cancel"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-3 w-full">
                  <button
                    type="button"
                    onClick={() => {
                      setVideoNoteRecordedBlob(null);
                      setVideoNotePreviewUrl(null);
                      setVideoNoteDuration(0);
                      if (videoNoteStreamRef.current && videoNoteVideoRef.current) {
                        videoNoteVideoRef.current.srcObject = videoNoteStreamRef.current;
                        videoNoteVideoRef.current.play().catch(() => {});
                      }
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors"
                  >
                    Retake
                  </button>
                  <button
                    type="button"
                    disabled={videoNoteSending}
                    onClick={handleSendVideoNote}
                    className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-lg shadow-emerald-600/30"
                  >
                    <Send className="w-4 h-4" />
                    <span>{videoNoteSending ? 'Sending...' : 'Send Video Note'}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 7. Emergency SOS Beacon Alert Modal */}
      {showSosModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border-2 border-red-500 shadow-2xl p-6 text-center space-y-4">
            <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
              <span className="absolute inset-0 rounded-full bg-red-600/30 animate-ping" />
              <div className="relative w-16 h-16 rounded-full bg-gradient-to-tr from-red-600 to-rose-600 text-white flex items-center justify-center shadow-lg shadow-red-600/50">
                <ShieldAlert className="w-8 h-8" />
              </div>
            </div>

            <div>
              <h3 className="text-lg font-black text-white tracking-wider uppercase">
                EMERGENCY SOS ALERT
              </h3>
              <p className="text-xs text-red-200 mt-1 leading-relaxed">
                Broadcasting emergency beacon with live GPS coordinates & battery level to this chat.
              </p>
            </div>

            {/* Countdown Display */}
            <div className="py-2">
              <div className="text-5xl font-black font-mono-num text-red-500 animate-pulse">
                {sosCountdown}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Auto-sending in {sosCountdown} seconds...
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={handleAbortSos}
                className="flex-1 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs uppercase tracking-wider transition-colors"
              >
                Abort / Cancel
              </button>
              <button
                type="button"
                disabled={isSendingSos}
                onClick={handleExecuteSos}
                className="flex-1 py-3 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs uppercase tracking-wider transition-colors shadow-lg shadow-red-600/40"
              >
                {isSendingSos ? 'Sending...' : 'Send Now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. Group Split Bill / Expense Modal */}
      {showSplitBillModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Split Group Bill
                  </h3>
                  <p className="text-[11px] text-slate-500">Calculate & track group shares</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSplitBillModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Bill Title
                </label>
                <input
                  type="text"
                  value={splitBillTitle}
                  onChange={(e) => setSplitBillTitle(e.target.value)}
                  placeholder="e.g. Dinner at Sultan's Dine, Picnic Lunch"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Total Bill Amount (৳)
                </label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  value={splitBillTotal}
                  onChange={(e) => setSplitBillTotal(e.target.value)}
                  placeholder="e.g. 2400"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              {/* Dynamic Per Person Share preview */}
              {parseFloat(splitBillTotal) > 0 && (
                <div className="p-3 rounded-2xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 text-xs flex items-center justify-between text-teal-800 dark:text-teal-200 font-semibold">
                  <span>
                    Share across {Math.max(groupMembers.length, 2)} members:
                  </span>
                  <span className="font-bold font-mono-num text-sm text-teal-600 dark:text-teal-400">
                    ৳{Math.round((parseFloat(splitBillTotal) / Math.max(groupMembers.length, 2)) * 100) / 100} / person
                  </span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Payment Note (bKash / Nagad / Bank)
                </label>
                <input
                  type="text"
                  value={splitBillNote}
                  onChange={(e) => setSplitBillNote(e.target.value)}
                  placeholder="e.g. bKash: 01711-223344 (Send Money)"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowSplitBillModal(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!splitBillTitle.trim() || !splitBillTotal || splitBillSubmitting}
                onClick={handleCreateSplitBill}
                className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white text-xs font-bold transition-colors"
              >
                {splitBillSubmitting ? 'Creating...' : 'Create Split Bill'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
