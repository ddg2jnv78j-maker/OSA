import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Bell,
  BellOff,
  Check,
  CheckCheck,
  Copy,
  CornerUpLeft,
  CornerUpRight,
  Download,
  FileText,
  Info,
  MoreVertical,
  Paperclip,
  Pencil,
  Phone,
  Plus,
  Search,
  Send,
  Smile,
  Sparkles,
  Trash2,
  UserMinus,
  UserPlus,
  Video,
  X,
} from 'lucide-react';
import { OSAAvatar } from '../components/OSAAvatar';
import { ReportUserModal } from '../components/ReportUserModal';
import { TranslationDictionary } from '../lib/i18n';
import { supabase } from '../lib/supabase';
import { generateSmartDraftOrReply } from '../services/aiService';
import {
  addMembersToGroup,
  blockUser,
  clearChatForUser,
  createNotification,
  deleteGroupCompletely,
  deleteMessageForEveryone,
  deleteMessageForMe,
  editMessageContent,
  fetchChatMessages,
  fetchGroupMembers,
  formatBytes,
  getDetailedBlockStatus,
  markChatAsRead,
  removeMemberFromGroup,
  searchUsers,
  sendMediaAttachmentMessage,
  sendTextMessage,
  toggleChatMute,
  unblockUser,
  updateGroupDetails,
} from '../services/osaService';
import {
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
  const [loading, setLoading] = useState(true);
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

  // Realtime & Typing state
  const [peerIsTyping, setPeerIsTyping] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<'SUBSCRIBED' | 'RECONNECTING'>('SUBSCRIBED');

  // Chat Info Drawer
  const [showChatInfo, setShowChatInfo] = useState(false);
  const [infoTab, setInfoTab] = useState<'media' | 'files' | 'links' | 'members'>('media');
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

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const groupPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadMessagesAndMeta = async () => {
    try {
      const msgs = await fetchChatMessages(
        chat.id,
        currentUser.id,
        chat.my_membership?.cleared_at
      );
      setMessages(msgs);
      await markChatAsRead(
        chat.id,
        currentUser.id,
        myPrivacy ? myPrivacy.read_receipts : true
      );
      if (!isGroup && peer) {
        const blk = await getDetailedBlockStatus(currentUser.id, peer.id);
        setBlockState(blk);
      }
      if (isGroup && chat.group_id) {
        const mems = await fetchGroupMembers(chat.group_id);
        setGroupMembers(mems);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversation.');
    } finally {
      setLoading(false);
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
    scrollToBottom();
  }, [messages.length, peerIsTyping]);

  // Realtime subscription for messages, attachments, and typing broadcast
  useEffect(() => {
    const channel = supabase
      .channel(`osa-chat-room-${chat.id}`)
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
          await markChatAsRead(
            chat.id,
            currentUser.id,
            myPrivacy ? myPrivacy.read_receipts : true
          );
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
      .on('broadcast', { event: 'typing' }, (payload) => {
        const senderId = payload.payload?.userId as string | undefined;
        if (senderId && senderId !== currentUser.id) {
          setPeerIsTyping(true);
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = window.setTimeout(() => {
            setPeerIsTyping(false);
          }, 2800);
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
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [chat.id, currentUser.id]);

  const handleTypingChange = (val: string) => {
    setText(val);
    if (channelRef.current && (!myPrivacy || myPrivacy.typing_indicator)) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: { userId: currentUser.id, name: currentUser.full_name },
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

  const handleAiDraft = async () => {
    if (aiDrafting) return;
    setAiDrafting(true);
    setError('');
    try {
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
          : 'Google AI smart draft is currently unavailable.'
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
      const sent = await sendMediaAttachmentMessage({
        chatId: chat.id,
        senderId: currentUser.id,
        file,
        caption: text.trim(),
        replyToId: replyTo?.id || null,
        onProgress: (pct) => setUploadProgress(pct),
      });
      setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
      setText('');
      setReplyTo(null);
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

  // Filtered messages for in-conversation search
  const visibleMessages = chatSearchQuery.trim()
    ? messages.filter((m) =>
        m.content.toLowerCase().includes(chatSearchQuery.trim().toLowerCase())
      )
    : messages;

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
    <div className="flex flex-col h-full w-full bg-slate-50 dark:bg-slate-950 relative overflow-hidden">
      {/* Reconnect Banner */}
      {realtimeStatus === 'RECONNECTING' && (
        <div className="bg-amber-500 text-white text-xs font-medium px-4 py-1.5 text-center">
          {t.reconnecting}
        </div>
      )}

      {/* Top Conversation Header */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-3 sm:px-5 h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="w-10 h-10 rounded-full flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
            aria-label="Back to chats"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => setShowChatInfo(true)}
            className="flex items-center gap-3 min-w-0 text-left"
          >
            <OSAAvatar
              name={chatTitle}
              avatarUrl={chatAvatar}
              size="sm"
              isOnline={Boolean(canShowPeerOnline && peer?.is_online)}
              showOnlineStatus={Boolean(canShowPeerOnline)}
              isGroup={isGroup}
              hidePhotoForPrivacy={hidePeerPhoto}
            />
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                {chatTitle}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {peerIsTyping ? (
                  <span className="text-green-600 dark:text-green-400 font-semibold">
                    {t.typing}
                  </span>
                ) : isGroup ? (
                  `${groupMembers.length || chat.members?.length || 1} members`
                ) : canShowPeerOnline && peer?.is_online ? (
                  <span className="text-green-600 dark:text-green-400 font-medium">
                    {t.online}
                  </span>
                ) : canShowPeerLastSeen && peer?.last_seen ? (
                  `${t.lastSeen} ${new Date(peer.last_seen).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}`
                ) : (
                  t.offline
                )}
              </p>
            </div>
          </button>
        </div>

        {/* Right Header Actions: Audio Call, Video Call, Search, Chat Info */}
        <div className="flex items-center gap-1 shrink-0">
          {!isGroup && peer && !blockState.anyBlock && (
            <>
              <button
                type="button"
                onClick={() => onStartCall(peer, 'audio', chat.id)}
                className="w-10 h-10 rounded-full flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title={t.audioCall}
              >
                <Phone className="w-4.5 h-4.5" />
              </button>
              <button
                type="button"
                onClick={() => onStartCall(peer, 'video', chat.id)}
                className="w-10 h-10 rounded-full flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title={t.videoCall}
              >
                <Video className="w-5 h-5" />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => setSearchInChatOpen((prev) => !prev)}
            className="w-10 h-10 rounded-full flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title={t.searchInConversation}
          >
            <Search className="w-4.5 h-4.5" />
          </button>

          <button
            type="button"
            onClick={() => setShowChatInfo(true)}
            className="w-10 h-10 rounded-full flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title={t.chatInfo}
          >
            <Info className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Search in Conversation Bar */}
      {searchInChatOpen && (
        <div className="px-4 py-2.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            value={chatSearchQuery}
            onChange={(e) => setChatSearchQuery(e.target.value)}
            placeholder={t.searchInConversation}
            autoFocus
            className="flex-1 bg-transparent text-sm text-slate-900 dark:text-white focus:outline-none"
          />
          {chatSearchQuery && (
            <button
              type="button"
              onClick={() => setChatSearchQuery('')}
              className="text-xs text-slate-400 hover:text-slate-600"
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
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="mx-4 mt-2 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 px-3.5 py-2 text-xs text-red-700 dark:text-red-300 flex items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} className="ml-2 font-bold">
            &times;
          </button>
        </div>
      )}

      {/* Messages Stream */}
      <div
        className="flex-1 overflow-y-auto px-3 sm:px-5 py-4 space-y-3"
        onClick={() => setActiveMenuMsgId(null)}
      >
        {loading ? (
          <div className="py-16 text-center text-xs text-slate-400">
            Loading OSA messages...
          </div>
        ) : visibleMessages.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">
              {chatSearchQuery ? 'No messages match your search' : 'No messages yet'}
            </p>
            <p className="text-xs text-slate-400">
              Send a message or media attachment below to begin.
            </p>
          </div>
        ) : (
          visibleMessages.map((msg) => {
            const isMine = msg.sender_id === currentUser.id;
            const senderName = msg.sender?.full_name || 'OSA User';
            const attachments = msg.attachments || [];

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`relative group max-w-[84%] sm:max-w-[70%] rounded-2xl px-3.5 py-2.5 shadow-xs ${
                    isMine
                      ? 'bg-blue-600 text-white rounded-br-xs'
                      : 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200/80 dark:border-slate-800 rounded-bl-xs'
                  }`}
                >
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

                  {/* Message Text */}
                  <p
                    className={`text-sm whitespace-pre-wrap break-words leading-relaxed ${
                      msg.is_deleted_for_everyone ? 'italic opacity-75 text-xs' : ''
                    }`}
                  >
                    {msg.is_deleted_for_everyone ? t.messageDeleted : msg.content}
                  </p>

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
                      className={`absolute z-30 top-full mt-1 w-48 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl py-1.5 text-xs text-slate-700 dark:text-slate-200 ${
                        isMine ? 'right-0' : 'left-0'
                      }`}
                    >
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
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Upload Progress Indicator */}
      {uploadProgress !== null && (
        <div className="px-4 py-2 bg-blue-50 dark:bg-blue-950/60 border-t border-blue-200 dark:border-blue-800 flex items-center gap-3">
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
        <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950/40 border-t border-amber-200 dark:border-amber-800 flex items-center justify-between gap-2">
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
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800"
            aria-label="Cancel editing"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Reply Banner */}
      {replyTo && (
        <div className="px-4 py-2 bg-slate-100 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
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
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Emoji Bar */}
      {showEmojiPicker && (
        <div className="px-3 py-2 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center gap-1.5 overflow-x-auto">
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
        <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 text-center">
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
      ) : (
        <form
          onSubmit={handleSendText}
          className="px-3 py-2.5 pb-safe bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 shrink-0"
        >
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileChange}
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
            className="hidden"
          />

          <button
            type="button"
            onClick={() => setShowEmojiPicker((prev) => !prev)}
            className="w-10 h-10 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
            title="Emoji"
          >
            <Smile className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-10 h-10 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
            title="Attach Image, Video, Audio or File"
          >
            <Paperclip className="w-5 h-5" />
          </button>

          <button
            type="button"
            disabled={aiDrafting}
            onClick={handleAiDraft}
            className="w-10 h-10 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 disabled:opacity-40 shrink-0 transition-colors"
            title="AI Smart Draft / Polish Reply"
          >
            <Sparkles className={`w-4.5 h-4.5 ${aiDrafting ? 'animate-pulse' : ''}`} />
          </button>

          <input
            type="text"
            value={text}
            onChange={(e) => handleTypingChange(e.target.value)}
            placeholder={t.typeMessage}
            className="flex-1 min-w-0 px-4 py-2.5 min-h-[44px] rounded-2xl bg-slate-100 dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
          />

          <button
            type="submit"
            disabled={!text.trim() || sending}
            className="w-11 h-11 rounded-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white flex items-center justify-center shrink-0 shadow-sm transition-colors"
            title={t.send}
          >
            <Send className="w-4.5 h-4.5" />
          </button>
        </form>
      )}

      {/* Forward Message Modal */}
      {forwardModalMsg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-3">
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
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
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
          <div className="w-full max-w-md bg-white dark:bg-slate-900 h-full overflow-y-auto p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
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

              {/* Profile / Group Header */}
              <div className="py-6 flex flex-col items-center text-center border-b border-slate-100 dark:border-slate-800">
                <OSAAvatar
                  name={chatTitle}
                  avatarUrl={chatAvatar}
                  size="xl"
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
                    <p className="text-xs text-slate-500">{peer.email}</p>
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
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Admin Group Settings
                  </p>
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
                  onClick={handleClearChat}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-sm text-amber-600"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{t.clearChat}</span>
                </button>
              </div>

              {/* Tabs: Media, Files, Links, Members */}
              <div className="py-4">
                <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl mb-3">
                  {(['media', 'files', 'links', ...(isGroup ? ['members'] : [])] as const).map(
                    (tabKey) => (
                      <button
                        key={tabKey}
                        type="button"
                        onClick={() =>
                          setInfoTab(tabKey as 'media' | 'files' | 'links' | 'members')
                        }
                        className={`flex-1 py-1.5 text-xs font-semibold rounded-lg capitalize transition-colors ${
                          infoTab === tabKey
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                            : 'text-slate-500'
                        }`}
                      >
                        {tabKey}
                      </button>
                    )
                  )}
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

                {infoTab === 'members' && isGroup && (
                  <div className="space-y-2">
                    {isGroupAdmin && (
                      <button
                        type="button"
                        onClick={handleOpenAddMember}
                        className="w-full flex items-center justify-center gap-2 py-2.5 min-h-[40px] rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 text-xs font-semibold mb-2"
                      >
                        <UserPlus className="w-4 h-4" />
                        <span>{t.addMembers}</span>
                      </button>
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
                          <button
                            type="button"
                            onClick={() => handleRemoveGroupMember(gm.user_id)}
                            className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg"
                            title={t.removeMember}
                          >
                            <UserMinus className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Danger Actions: Block / Report or Leave / Delete Group */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
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
          <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-3">
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
              className="w-full px-3.5 py-2 min-h-[40px] rounded-xl bg-slate-100 dark:bg-slate-800 text-xs mb-3"
            />
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
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

      {/* Report User Modal */}
      <ReportUserModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        reporterId={currentUser.id}
        reportedUserId={peer?.id || null}
        reportedUserName={chatTitle}
        chatId={chat.id}
      />
    </div>
  );
};
