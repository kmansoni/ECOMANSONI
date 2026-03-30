import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { AnimatedEmojiFullscreen } from "./AnimatedEmojiFullscreen";
import { isSingleEmoji } from "./emojiUtils";
import { ChatHeader } from "./ChatHeader";
import { ChatMessageItem } from "./ChatMessageItem";
import { ChatInputBar } from "./ChatInputBar";
import { useBubbleGradient } from "@/hooks/useBubbleGradient";
import { FloatingDate } from "./FloatingDate";
import { ScrollToBottomFab } from "./ScrollToBottomFab";
import { JumpToDatePicker } from "./JumpToDatePicker";
import { useSecretChat } from "@/hooks/useSecretChat";
import { usePolls } from "@/hooks/usePolls";
import { SecretChatBanner } from "./SecretChatBanner";
import { MessageSearchSheet } from "./MessageSearchSheet";
import { CreatePollSheet } from "./CreatePollSheet";
import { useReadReceipts } from "@/hooks/useReadReceipts";
import { usePinnedMessages } from "@/hooks/usePinnedMessages";
import { useScheduledMessages } from "@/hooks/useScheduledMessages";
import { useSavedMessages } from "@/hooks/useSavedMessages";
import { useMessageTranslation } from "@/hooks/useMessageTranslation";
import { PinnedMessageBar } from "./PinnedMessageBar";
import { PinnedMessagesSheet } from "./PinnedMessagesSheet";
import { ScheduleMessagePicker } from "./ScheduleMessagePicker";
import { ScheduledMessagesList } from "./ScheduledMessagesList";
import { GiftCatalog } from "./GiftCatalog";
import { useE2EEncryption } from "@/hooks/useE2EEncryption";
import { useMessages } from "@/hooks/useChat";
import { useMessageReactions } from "@/hooks/useMessageReactions";
import { useAuth } from "@/hooks/useAuth";
import { useMarkConversationRead } from "@/hooks/useMarkConversationRead";
import { useVideoCallContext } from "@/contexts/VideoCallContext";
import { useChatOpen } from "@/contexts/ChatOpenContext";
import { useUserSettings } from "@/contexts/UserSettingsContext";
import { toast } from "sonner";
import { getHashtagBlockedToastPayload } from "@/lib/hashtagModeration";
import { getChatSendErrorToast } from "@/lib/chat/sendError";
import { VideoCircleRecorder } from "./VideoCircleRecorder";
import { AttachmentSheet } from "./AttachmentSheet";
import { CameraCaptureSheet } from "./CameraCaptureSheet";
import { ImageViewer } from "./ImageViewer";
import { FullscreenVideoPlayer } from "./VideoPlayer";
import { StickerGifPicker } from "./StickerGifPicker";
import { buildChatBodyEnvelope, sendMessageV1 } from "@/lib/chat/sendMessageV1";
import { sendStaticLocation, getCurrentPosition, geoErrorToKey } from "@/lib/chat/sendLocation";
import { MessageContextMenu } from "./MessageContextMenu";
import { ChatSettingsSheet } from "./ChatSettingsSheet";
import { ChatBackground } from "./ChatBackground";
import { useChatSettings } from "@/hooks/useChatSettings";
import { detectInlineBotTrigger } from "./inlineBotTrigger";
import {
  detectMentionTrigger,
  getMentionSuggestions,
  insertMention,
  useMentions,
  type MentionUser,
} from "@/hooks/useMentions";
import { ForwardMessageSheet } from "./ForwardMessageSheet";
import { TextSelectionMenu } from "./TextSelectionMenu";
import { ReplyKeyboard, type ReplyKeyboardButton } from "./ReplyKeyboard";
import { Button } from "@/components/ui/button";
import { useMessageDensity } from "@/hooks/useMessageDensity";
import { useChatDrafts } from "@/hooks/useChatDrafts";
import { DisappearTimerPicker } from "./DisappearTimerPicker";
import { useDisappearingMessages } from "@/hooks/useDisappearingMessages";
import { supabase } from "@/integrations/supabase/client";
import { useTypingIndicator } from "@/hooks/useTypingIndicator";
import { useVoiceMedia } from "@/hooks/useVoiceMedia";
import { useUserPresenceStatus } from "@/hooks/useUserPresenceStatus";
import { useAppearanceRuntime } from "@/contexts/AppearanceRuntimeContext";
import { diagnoseDmSendReadiness } from "@/lib/chat/readiness";
import { isChatProtocolV11EnabledForUser } from "@/lib/chat/protocolV11";
import {
  getOrCreateUserQuickReaction,
  listQuickReactionCatalog,
} from "@/lib/stickers-reactions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { resolveChatMediaDownloadPrefs } from "@/lib/chat/mediaSettings";
import { fetchUserBriefMap, resolveUserBrief } from "@/lib/users/userBriefs";
import { logger } from "@/lib/logger";
import {
  parseEncryptedPayload,
  toCompactErrorDetails,
} from "./chatConversationHelpers";

interface ChatConversationProps {
  conversationId: string;
  chatName: string;
  chatAvatar: string | null;
  otherUserId: string;
  onBack: () => void;
  participantCount?: number;
  isGroup?: boolean;
  totalUnreadCount?: number;
  /** Called to refresh conversation list after marking messages read */
  onRefetch?: () => void;
  initialOpenPanelAction?: "settings" | "timer" | "scheduled";
  onInitialPanelHandled?: () => void;
}

const TELEGRAM_MAX_MESSAGE_CHARS = 4096;

export function ChatConversation({ conversationId, chatName, chatAvatar, otherUserId, onBack, participantCount, isGroup, totalUnreadCount, onRefetch, initialOpenPanelAction, onInitialPanelHandled }: ChatConversationProps) {
  const { user } = useAuth();
  const { getDraft, saveDraft, clearDraft } = useChatDrafts();
  const { settings } = useUserSettings();
  const { settings: chatSettings, globalSettings } = useChatSettings(conversationId);
  const { appearance, energy } = useAppearanceRuntime();
  const { bubbleClass } = useBubbleGradient();
  const { styles: densityStyles } = useMessageDensity();
  const [lastSentEmoji, setLastSentEmoji] = useState<string | null>(null);
  const { messages, loading, sendMessage, sendMediaMessage, deleteMessage, editMessage } = useMessages(conversationId);
  const { toggleReaction, getReactions } = useMessageReactions(conversationId);
  const { markConversationRead } = useMarkConversationRead();
  const { getMessageStatus, markAsRead, markAsDelivered } = useReadReceipts(conversationId);
  const { pinnedMessages, pinMessage, unpinMessage } = usePinnedMessages(conversationId);
  const { saveMessage: saveToSavedMessages, removeSavedByOriginalId, isSaved } = useSavedMessages();
  const { translate } = useMessageTranslation();
  const {
    scheduledMessages,
    scheduleMessage,
    deleteScheduledMessage,
    editScheduledMessage,
    sendNow: sendScheduledNow,
    count: scheduledCount,
  } = useScheduledMessages(conversationId);
  const { startCall } = useVideoCallContext();
  const { setIsChatOpen } = useChatOpen();

  const {
    encryptionEnabled,
    isReady: encryptionReady,
    encryptContent,
    decryptContent,
  } = useE2EEncryption(conversationId);

  // Кеш расшифрованных текстов: messageId → decrypted string | null
  const [decryptedCache, setDecryptedCache] = useState<Record<string, string | null>>({});
  
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const sendInFlightRef = useRef(false);
  const draftClientMsgIdRef = useRef<string>(crypto.randomUUID());
  const lastDraftTrimmedRef = useRef<string>("");
  const [showVideoRecorder, setShowVideoRecorder] = useState(false);
  const [showAttachmentSheet, setShowAttachmentSheet] = useState(false);
  const [showCameraSheet, setShowCameraSheet] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [viewingVideo, setViewingVideo] = useState<string | null>(null);
  const [recordMode, setRecordMode] = useState<'voice' | 'video'>('voice');
  const [manualMediaLoaded, setManualMediaLoaded] = useState<Set<string>>(new Set());

  const [aiStreamText, setAiStreamText] = useState<string | null>(null);
  const aiStreamStartedAtRef = useRef<number | null>(null);

  const energyMediaPreload = energy?.media_preload ?? true;
  const energyVideoAutoplay = energy?.autoplay_video ?? true;
  const mediaTapEnabled = appearance?.media_tap_navigation_enabled ?? true;
  const messageCornerRadius = appearance?.message_corner_radius ?? 18;
  const { autoDownloadPhotos, autoDownloadVideos } = resolveChatMediaDownloadPrefs({
    chatSettings,
    userSettings: settings,
    energy: {
      media_preload: energyMediaPreload,
      autoplay_video: energyVideoAutoplay,
    },
  });

  const {
    isOnline: isOtherOnline,
    statusText: otherPresenceText,
    statusEmoji: otherStatusEmoji,
    statusStickerUrl: otherStatusStickerUrl,
  } = useUserPresenceStatus(
    !isGroup ? otherUserId : null,
  );

  // Typing indicator: useTypingIndicator handles DM + group, presence-based, multi-device-safe
  const { typingLabel, onKeyDown: typingOnKeyDown, onStopTyping: typingOnStop } = useTypingIndicator(
    conversationId,
    user?.id,
    chatName ?? null,
    chatAvatar ?? null,
  );
  // Derive typing state for the header status text
  const isOtherTyping = !!typingLabel;
  const otherLiveActivity = null; // activity types (recording_voice/video) kept for future extension

  const {
    isRecording, recordingTime, playingVoice,
    startRecording, stopRecording, cancelRecording,
    toggleVoicePlay, getWaveformHeights,
  } = useVoiceMedia({
    conversationId,
    sendMediaMessage,
    typingOnKeyDown,
    typingOnStop,
  });

  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const lastNotifiedIncomingMessageIdRef = useRef<string | null>(null);

  const [replyTo, setReplyTo] = useState<{ id: string; preview: string } | null>(null);
  const [quotedText, setQuotedText] = useState<string | null>(null);
  const [editingMessage, setEditingMessage] = useState<{ id: string; content: string } | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; messageId: string | null }>(
    { open: false, messageId: null }
  );

  const [showPinnedSheet, setShowPinnedSheet] = useState(false);
  const [showScheduledList, setShowScheduledList] = useState(false);
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [pendingScheduleContent, setPendingScheduleContent] = useState('');

  // ─── Silent send ─────────────────────────────────────────────────────────────
  const [isSilentSend, setIsSilentSend] = useState(false);
  const [showSendOptions, setShowSendOptions] = useState(false);

  // ─── Inline bot state ────────────────────────────────────────────────────────
  const [inlineBotTrigger, setInlineBotTrigger] = useState<{ botUsername: string; query: string } | null>(null);

  // ─── @Mention state ──────────────────────────────────────────────────────────
  const [mentionParticipants, setMentionParticipants] = useState<MentionUser[]>([]);
  const [mentionTrigger, setMentionTrigger] = useState<{ query: string; triggerStart: number } | null>(null);
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
  const mentionSuggestions = useMemo(
    () => mentionTrigger ? getMentionSuggestions(mentionTrigger.query, mentionParticipants) : [],
    [mentionTrigger, mentionParticipants]
  );

  const [forwardOpen, setForwardOpen] = useState(false);
  const [forwardMessage, setForwardMessage] = useState<import("@/hooks/useChat").ChatMessage | null>(null);

  const [replyKeyboard, setReplyKeyboard] = useState<ReplyKeyboardButton[][] | null>(null);
  const [showGiftCatalog, setShowGiftCatalog] = useState(false);
  const [showChatSettings, setShowChatSettings] = useState(false);
  const [showTimerPicker, setShowTimerPicker] = useState(false);
  const handledPanelActionRef = useRef<string | null>(null);
  const {
    defaultTimer,
    setConversationTimer,
    enrichMessageWithDisappear,
    formatTimerLabel,
  } = useDisappearingMessages(conversationId);

  const { isSecret, secretChat } = useSecretChat(conversationId);
  const _polls = usePolls(conversationId);

  const [showMessageSearch, setShowMessageSearch] = useState(false);
  const [showCreatePoll, setShowCreatePoll] = useState(false);

  const hiddenKey = user && conversationId ? `chat.hiddenMessages.v1.${user.id}.${conversationId}` : null;

  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  
  // Context menu state
  const [contextMenuMessage, setContextMenuMessage] = useState<{
    id: string;
    content: string;
    isOwn: boolean;
    position: { top: number; left: number; width: number };
  } | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [quickReactions, setQuickReactions] = useState<string[]>(["❤️", "🔥", "👍", "😂", "😮", "🎉"]);
  const [senderProfiles, setSenderProfiles] = useState<
    Record<string, { display_name: string | null; avatar_url: string | null }>
  >({});
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // UI-3: textarea ref (HTMLTextAreaElement for AutoGrowTextarea)
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // UI-1 / UI-2: scroll container ref
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // UI-1: current floating date pill
  const [floatingDate, setFloatingDate] = useState<Date | null>(null);
  // UI-2: show scroll-to-bottom FAB
  const [showScrollFab, setShowScrollFab] = useState(false);
  // UI-6: jump-to-date picker
  const [showJumpToPicker, setShowJumpToPicker] = useState(false);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isHoldingRef = useRef(false);

  // Mark chat as open/closed for hiding bottom nav
  useEffect(() => {
    setIsChatOpen(true);
    return () => setIsChatOpen(false);
  }, [setIsChatOpen]);

  // ─── Draft: restore on mount, save on unmount / conversationId change ────────
  const inputTextRef = useRef<string>("");
  useEffect(() => {
    inputTextRef.current = inputText;
  }, [inputText]);

  useEffect(() => {
    // Restore draft on mount or conversationId change
    const saved = getDraft(conversationId);
    if (saved) {
      setInputText(saved);
    }
    // Save/clear on unmount or when conversationId changes
    return () => {
      const current = inputTextRef.current.trim();
      if (current) {
        saveDraft(conversationId, current);
      } else {
        clearDraft(conversationId);
      }
    };
  }, [conversationId, getDraft, saveDraft, clearDraft]);

  useEffect(() => {
    if (!hiddenKey) return;
    try {
      const raw = localStorage.getItem(hiddenKey);
      if (!raw) {
        setHiddenIds(new Set());
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      setHiddenIds(new Set(parsed.filter((x) => typeof x === "string")));
    } catch (error) {
      logger.warn("chat: failed to restore hidden message ids", { hiddenKey, error });
      setHiddenIds(new Set());
    }
  }, [hiddenKey]);

  useEffect(() => {
    if (!initialOpenPanelAction) return;
    const actionKey = `${conversationId}:${initialOpenPanelAction}`;
    if (handledPanelActionRef.current === actionKey) return;
    handledPanelActionRef.current = actionKey;

    if (initialOpenPanelAction === "settings") setShowChatSettings(true);
    if (initialOpenPanelAction === "timer") setShowTimerPicker(true);
    if (initialOpenPanelAction === "scheduled") setShowScheduledList(true);
    onInitialPanelHandled?.();
  }, [conversationId, initialOpenPanelAction, onInitialPanelHandled]);

  // ─── Дешифрование входящих зашифрованных сообщений ─────────────────────────
  // decryptInProgressRef содержит ID сообщений, для которых уже запущен
  // async-decrypt. Это позволяет исключить их из useMemo без включения
  // decryptedCache в зависимости (что вызывало бы N+1 проходов useEffect).
  const decryptInProgressRef = useRef<Set<string>>(new Set());

  const encryptedUndecrypted = useMemo(
    () =>
      messages.filter(
        (m) =>
          (Boolean(m.is_encrypted) || Boolean(parseEncryptedPayload(m.content))) &&
          !(m.id in decryptedCache) &&
          !decryptInProgressRef.current.has(m.id),
      ),
    [messages, decryptedCache],
  );

  useEffect(() => {
    if (!encryptedUndecrypted.length) return;

    // Регистрируем все ID как «в процессе» до запуска async-работы,
    // чтобы следующий пересчёт useMemo их исключил.
    for (const m of encryptedUndecrypted) decryptInProgressRef.current.add(m.id);

    let cancelled = false;
    void Promise.all(
      encryptedUndecrypted.map(async (m) => {
        const payload = parseEncryptedPayload(m.content);
        if (!payload) {
          if (!cancelled) setDecryptedCache((prev) => ({ ...prev, [m.id]: null }));
          return;
        }
        try {
          const plain = await decryptContent(payload, m.sender_id);
          if (!cancelled) setDecryptedCache((prev) => ({ ...prev, [m.id]: plain }));
        } catch (err) {
          logger.warn("chat: failed to decrypt message", { messageId: m.id, error: err });
          if (!cancelled) setDecryptedCache((prev) => ({ ...prev, [m.id]: null }));
        } finally {
          decryptInProgressRef.current.delete(m.id);
        }
      }),
    ).catch((err) => logger.error("chat: unexpected decrypt pipeline error", { conversationId, error: err }));
    return () => {
      cancelled = true;
    };
  }, [encryptedUndecrypted, decryptContent, conversationId]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void (async () => {
      try {
        const [saved, catalog] = await Promise.all([
          getOrCreateUserQuickReaction(user.id),
          listQuickReactionCatalog(),
        ]);
        if (cancelled) return;
        const next = [saved.emoji, ...catalog.filter((item) => item !== saved.emoji)].slice(0, 8);
        setQuickReactions(next);
      } catch (error) {
        logger.debug("chat: failed to load quick reactions, using defaults", {
          conversationId,
          error,
        });
        // keep defaults
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const persistHiddenIds = useCallback(
    (next: Set<string>) => {
      if (!hiddenKey) return;
      try {
        localStorage.setItem(hiddenKey, JSON.stringify([...next]));
      } catch (error) {
        logger.warn("chat: failed to persist hidden message ids", { hiddenKey, error });
        // ignore
      }
    },
    [hiddenKey]
  );

  const hideMessageForMe = useCallback(
    (messageId: string) => {
      setHiddenIds((prev) => {
        const next = new Set(prev);
        next.add(messageId);
        persistHiddenIds(next);
        return next;
      });
    },
    [persistHiddenIds]
  );

  const scrollToMessage = useCallback((messageId: string) => {
    const el = messageRefs.current[messageId];
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const visibleMessages = useMemo(() => {
    if (!hiddenIds.size) return messages;
    return messages.filter((m) => !hiddenIds.has(m.id));
  }, [messages, hiddenIds]);

  // ─── Load mention participants (for @-completion) ─────────────────────────
  useEffect(() => {
    if (!conversationId || !user) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data: partRows } = await supabase
          .from("conversation_participants")
          .select("user_id")
          .eq("conversation_id", conversationId);
        const ids = (partRows ?? []).map((r) => r.user_id as string).filter(Boolean);
        if (!ids.length) return;
        const briefMap = await fetchUserBriefMap(ids);
        if (cancelled) return;
        const participants: MentionUser[] = ids
          .map((participantId) => {
            const brief = resolveUserBrief(participantId, briefMap);
            if (!brief) return null;
            return {
              user_id: participantId,
              display_name: brief.display_name,
              username: brief.username,
              avatar_url: brief.avatar_url,
            } as MentionUser;
          })
          .filter(Boolean) as MentionUser[];
        setMentionParticipants(participants);
      } catch (error) {
        logger.warn("chat: failed to load mention participants", { conversationId, error });
        // non-fatal
      }
    })();
    return () => { cancelled = true; };
  }, [conversationId, user]);

  const { renderText } = useMentions(mentionParticipants);

  // Stable sender IDs key — prevents DB call on every minor re-render.
  const senderIdsKey = useMemo(() => {
    if (!isGroup) return "";
    const ids = [...new Set(visibleMessages.map((m) => m.sender_id).filter(Boolean))].sort();
    return ids.join(",");
  }, [isGroup, visibleMessages]);

  useEffect(() => {
    const senderIds = senderIdsKey ? senderIdsKey.split(",") : [];
    if (!isGroup || !senderIds.length) {
      setSenderProfiles({});
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const briefMap = await fetchUserBriefMap(senderIds);
        if (cancelled) return;
        const next: Record<string, { display_name: string | null; avatar_url: string | null }> = {};
        for (const userId of senderIds) {
          const brief = resolveUserBrief(userId, briefMap);
          if (!brief) continue;
          next[userId] = {
            display_name: brief.display_name,
            avatar_url: brief.avatar_url,
          };
        }
        setSenderProfiles(next);
      } catch (error) {
        logger.warn("chat: failed to resolve sender profiles", { conversationId, error });
        if (!cancelled) setSenderProfiles({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isGroup, senderIdsKey]);

  // Bot reply keyboard: watch last incoming message for reply_markup
  useEffect(() => {
    if (!visibleMessages.length) return;
    const last = visibleMessages[visibleMessages.length - 1];
    if (!last || last.sender_id === user?.id) return;
    const markup = (last.metadata as Record<string, unknown> | null)?.reply_markup as
      | { keyboard?: ReplyKeyboardButton[][]; remove_keyboard?: boolean }
      | undefined;
    if (!markup) return;
    if (markup.keyboard) {
      setReplyKeyboard(markup.keyboard);
    } else if (markup.remove_keyboard) {
      setReplyKeyboard(null);
    }
  }, [visibleMessages, user?.id]);

  // Typing is handled by useTypingIndicator hook (see state section above).
  // sendTyping stub delegates to the hook; activity param is kept for recording states.
  const sendTyping = useCallback(
    (isTyping: boolean, _activity: "typing" | "recording_voice" | "recording_video" = "typing") => {
      if (isTyping) {
        typingOnKeyDown();
      } else {
        typingOnStop();
      }
    },
    [typingOnKeyDown, typingOnStop],
  );

  const handleInputChange = useCallback(
    (value: string, caretPos?: number) => {
      setInputText(value);

      const trimmed = value.trim();
      if (trimmed !== lastDraftTrimmedRef.current) {
        lastDraftTrimmedRef.current = trimmed;
        draftClientMsgIdRef.current = crypto.randomUUID();
      }

      // ── Inline bot detection ─────────────────────────────────────────────────
      setInlineBotTrigger(detectInlineBotTrigger(value));

      // ── @Mention detection ──────────────────────────────────────────────────
      const caret = caretPos ?? value.length;
      const trigger = detectMentionTrigger(value, caret);
      setMentionTrigger(trigger);
      setMentionActiveIndex(0);

      // Typing indicator: works for both DM and groups via useTypingIndicator
      typingOnKeyDown();
    },
    [typingOnKeyDown],
  );

  const headerStatusText = useMemo(() => {
    if (isGroup) {
      // In groups: show typing label if anyone is typing, else participant count
      if (typingLabel) return typingLabel;
      return `${participantCount || 0} участник${participantCount === 1 ? "" : participantCount && participantCount < 5 ? "а" : "ов"}`;
    }
    if (isOtherTyping) return typingLabel ?? "печатает…";
    return otherPresenceText;
  }, [isGroup, participantCount, isOtherTyping, typingLabel, otherPresenceText]);

  // Mark incoming messages as read when chat is opened / receives new messages.
  useEffect(() => {
    // Only for DMs (groups/channels have separate infra).
    if (!conversationId || !user || isGroup) return;
    (async () => {
      await markConversationRead(conversationId);
      // Refresh list so unread badge updates immediately.
      onRefetch?.();
    })();

    // Mark unread incoming messages as delivered then read.
    // delivered first so the sender sees ✓✓ grey, then ✓✓ blue.
    const incomingUnread = messages.filter(
      (m) => m.sender_id !== user.id && !m.is_read
    );
    const incomingUnreadIds = incomingUnread.map((m) => m.id);
    if (incomingUnreadIds.length > 0) {
      // Fire-and-forget: mark delivered (grey ✓✓) then mark read (blue ✓✓)
      void markAsDelivered(incomingUnreadIds);
    }
    for (const msg of incomingUnread) {
      markAsRead(msg.id);
    }
  }, [conversationId, user, isGroup, messages, markConversationRead, onRefetch, markAsRead, markAsDelivered]);

  useEffect(() => {
    if (!user?.id) return;
    if (!messages.length) return;
    if (!chatSettings.notifications_enabled) return;

    const latestIncoming = [...messages]
      .reverse()
      .find((m) => m.sender_id !== user.id && !m.disappeared);

    if (!latestIncoming) return;
    if (lastNotifiedIncomingMessageIdRef.current === latestIncoming.id) return;
    lastNotifiedIncomingMessageIdRef.current = latestIncoming.id;

    const shouldPlaySound = globalSettings.in_app_sounds && chatSettings.notification_sound !== "none";
    if (shouldPlaySound) {
      try {
        const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const audioCtx = new AudioCtxClass();
        const oscillator = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        const baseFreq =
          chatSettings.notification_sound === "chime"
            ? 880
            : chatSettings.notification_sound === "pop"
              ? 660
              : chatSettings.notification_sound === "ding"
                ? 1046
                : 784;

        oscillator.type = "sine";
        oscillator.frequency.value = baseFreq;
        gain.gain.value = 0.0001;

        oscillator.connect(gain);
        gain.connect(audioCtx.destination);

        const now = audioCtx.currentTime;
        gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

        oscillator.start(now);
        oscillator.stop(now + 0.2);
        oscillator.onended = () => {
          void audioCtx.close();
        };
      } catch (error) {
        logger.debug("chat: sound playback unavailable", { conversationId, error });
      }
    }

    if (globalSettings.in_app_vibrate && chatSettings.notification_vibration && typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(30);
      } catch (error) {
        logger.debug("chat: vibration unavailable", { conversationId, error });
      }
    }
  }, [messages, user?.id, chatSettings.notifications_enabled, chatSettings.notification_sound, chatSettings.notification_vibration, globalSettings.in_app_sounds, globalSettings.in_app_vibrate]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, aiStreamText]);

  // ─── UI-1 / UI-2: scroll events for FloatingDate and ScrollToBottomFab ─────
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      // UI-2: show FAB when scrolled > 300px from bottom
      const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      setShowScrollFab(distFromBottom > 300);

      // UI-1: find topmost visible date separator
      const separators = container.querySelectorAll<HTMLElement>("[data-date-id]");
      let topmost: { el: HTMLElement; top: number } | null = null;
      separators.forEach((el) => {
        const rect = el.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        // Separator is "above" the visible area → its date label is the floating one
        if (rect.top <= containerRect.top + 4) {
          if (!topmost || rect.top > topmost.top) {
            topmost = { el, top: rect.top };
          }
        }
      });
      if (topmost) {
        const dateId = (topmost as { el: HTMLElement }).el.getAttribute("data-date-id");
        if (dateId) setFloatingDate(new Date(dateId));
      }
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  const renderMessages = useMemo(() => {
    return visibleMessages;
  }, [visibleMessages]);

  const handleSendMessage = async (silent = false, overrideText?: string) => {
    if (sendInFlightRef.current) return;

    const trimmed = (overrideText ?? inputText).trim();
    if (!trimmed) {
      sendTyping(false);
      return;
    }

    // ── Edit mode: update existing message ──────────────────────────────────
    if (editingMessage) {
      const editing = editingMessage;
      setEditingMessage(null);
      setInputText("");
      sendTyping(false);
      const result = await editMessage!(editing.id, trimmed);
      if (result?.error) {
        toast.error("Не удалось отредактировать сообщение. Попробуйте снова.");
        // Restore
        setEditingMessage(editing);
        setInputText(trimmed);
      }
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }

    const reply = replyTo;
    const withReply = reply ? `↩️ Ответ на сообщение:\n${reply.preview}\n\n${trimmed}` : trimmed;
    const clientMsgId = draftClientMsgIdRef.current;

    // Lock as early as possible to prevent any double-dispatch.
    sendInFlightRef.current = true;
    setIsSending(true);

    // Clear immediately to avoid perceived delay.
    setInputText("");
    setReplyTo(null);
    setQuotedText(null);
    sendTyping(false);
    // Clear draft on send
    clearDraft(conversationId);

    // Prepare next draft id right away for the next message.
    draftClientMsgIdRef.current = crypto.randomUUID();
    lastDraftTrimmedRef.current = "";

    try {
      // Шифруем сообщение если E2E включено
      let contentToSend = withReply;
      let extraFields: Record<string, unknown> = {};
      if (encryptionEnabled) {
        const encrypted = await encryptContent(withReply);
        if (!encrypted) {
          // Ключ недоступен — блокируем отправку, чтобы не допустить утечки plaintext.
          sendInFlightRef.current = false;
          setIsSending(false);
          setInputText(trimmed);
          setReplyTo(reply);
          draftClientMsgIdRef.current = clientMsgId;
          lastDraftTrimmedRef.current = trimmed;
          toast.error("Шифрование недоступно", {
            description: "Ключ E2EE не готов. Подождите или отключите сквозное шифрование.",
          });
          return;
        }
        contentToSend = JSON.stringify(encrypted);
        extraFields = {
          is_encrypted: true,
          encryption_iv: encrypted.iv,
          encryption_key_version: encrypted.epoch,
        };
      }
      await sendMessage(contentToSend, {
        clientMsgId,
        ...(silent ? { is_silent: true } : {}),
        ...enrichMessageWithDisappear(extraFields),
      });
      if (isSingleEmoji(trimmed)) {
        setLastSentEmoji(trimmed);
      }
      if (silent) {
        setIsSilentSend(false);
      }

      // Keep focus on input to prevent keyboard closing on mobile
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    } catch (error) {
      const compactErr = toCompactErrorDetails(error);
      logger.error("chat: handleSendMessage failed", {
        conversationId,
        error,
        errorCode: compactErr.code || undefined,
        errorStatus: compactErr.status ?? undefined,
        errorMessage: compactErr.message,
      });
      const payload = getHashtagBlockedToastPayload(error);
      if (payload) {
        setInputText(trimmed);
        setReplyTo(reply);
        draftClientMsgIdRef.current = clientMsgId;
        lastDraftTrimmedRef.current = trimmed;
        toast.error(payload.title, { description: payload.description });
      } else {
        if (compactErr.message.startsWith("CHAT_MESSAGE_TOO_LONG:")) {
          const current = Number(compactErr.message.split(":")[1] || 0);
          toast.error("Сообщение слишком длинное", {
            description: `Лимит: ${TELEGRAM_MAX_MESSAGE_CHARS} символов (сейчас ${current})`,
          });
          return;
        }

        const sendPayload = getChatSendErrorToast(error);
        if (sendPayload) {
          setInputText(trimmed);
          setReplyTo(reply);
          draftClientMsgIdRef.current = clientMsgId;
          lastDraftTrimmedRef.current = trimmed;
          toast.error(sendPayload.title, { description: sendPayload.description });
          return;
        }

        setInputText(trimmed);
        setReplyTo(reply);
        draftClientMsgIdRef.current = clientMsgId;
        lastDraftTrimmedRef.current = trimmed;
        const diagnostic = await diagnoseDmSendReadiness({
          supabase,
          userId: user?.id,
          conversationId,
          expectV11: isChatProtocolV11EnabledForUser(user?.id),
        });
        const reasonHint = [
          compactErr.code ? `code=${compactErr.code}` : null,
          compactErr.status != null ? `status=${compactErr.status}` : null,
          compactErr.message ? compactErr.message : null,
        ]
          .filter(Boolean)
          .join("; ");
        toast.error("Не удалось отправить сообщение", {
          description: diagnostic || reasonHint || undefined,
        });
      }
    } finally {
      sendInFlightRef.current = false;
      setIsSending(false);
    }
  };

  const handleVideoRecord = async (videoBlob: Blob, duration: number) => {
    const file = new File([videoBlob], `video_circle_${Date.now()}.webm`, { type: 'video/webm' });
    await sendMediaMessage(file, 'video_circle', duration);
    setShowVideoRecorder(false);
  };

  const handleAttachment = async (file: File, type: "image" | "video" | "document") => {
    if (type === "image") {
      await sendMediaMessage(file, 'image');
    } else if (type === "document") {
      await sendMediaMessage(file, 'document');
    } else {
      await sendMediaMessage(file, 'video');
    }
  };

  const handleLocationSelect = async () => {
    if (isSending) return;
    setIsSending(true);
    try {
      const coords = await getCurrentPosition();
      const clientMsgId = crypto.randomUUID();
      await sendStaticLocation({ conversationId, clientMsgId, coords });
    } catch (err: unknown) {
      if (err && typeof err === "object" && "code" in err) {
        const key = geoErrorToKey(err as GeolocationPositionError);
        toast.error(
          key === "geo_permission_denied"
            ? "Доступ к геолокации запрещён. Разрешите в настройках браузера."
            : key === "geo_timeout"
            ? "Геолокация не получена: истек таймаут."
            : "Не удалось определить местоположение.",
        );
      } else {
        toast.error("Не удалось отправить геолокацию.");
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleStartAudioCall = async () => {
    await startCall(otherUserId, conversationId, "audio", { display_name: chatName, avatar_url: chatAvatar });
  };

  const handleStartVideoCall = async () => {
    await startCall(otherUserId, conversationId, "video", { display_name: chatName, avatar_url: chatAvatar });
  };

  // Hold-to-record handlers for dynamic mic/video button
  const holdStartedRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);

  const handleRecordButtonDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (activePointerIdRef.current !== null) return;
    activePointerIdRef.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (error) {
      logger.debug("chat: pointer capture not available", { conversationId, error });
    }
    isHoldingRef.current = false;
    holdStartedRef.current = true;
    
    holdTimerRef.current = setTimeout(() => {
      isHoldingRef.current = true;
      if (recordMode === 'voice') {
        startRecording();
      } else {
        setShowVideoRecorder(true);
        sendTyping(true, "recording_video");
      }
    }, 200); // 200ms delay to distinguish tap from hold
  }, [recordMode, sendTyping, startRecording]);

  const handleRecordButtonUp = useCallback((e?: React.PointerEvent<HTMLButtonElement>) => {
    if (e && activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) {
      return;
    }
    // Only process if button down started on this button
    if (!holdStartedRef.current) return;
    holdStartedRef.current = false;
    activePointerIdRef.current = null;
    
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    
    if (isHoldingRef.current) {
      // This was a hold — stop voice recording (video auto-sends on release in VideoCircleRecorder)
      if (recordMode === 'voice' && isRecording) {
        stopRecording();
      }
      if (recordMode === 'video') {
        sendTyping(false, "recording_video");
      }
    } else {
      // This was a tap — switch mode
      setRecordMode(prev => prev === 'voice' ? 'video' : 'voice');
    }
    isHoldingRef.current = false;
  }, [recordMode, isRecording, stopRecording, sendTyping]);

  // Cancel hold timer when mouse leaves (but don't switch mode)
  const handleRecordButtonLeave = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    // Don't reset holdStartedRef - mouseUp can still happen
  }, []);

  // Long press handlers for context menu
  const handleMessageLongPressStart = useCallback((
    messageId: string, 
    content: string, 
    isOwn: boolean,
    event: React.MouseEvent | React.TouchEvent
  ) => {
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    
    longPressTimerRef.current = setTimeout(() => {
      setContextMenuMessage({ 
        id: messageId, 
        content, 
        isOwn,
        position: {
          top: rect.top,
          left: rect.left,
          width: rect.width
        }
      });
    }, 500);
  }, []);

  const handleMessageLongPressEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleMessageDelete = async (messageId: string) => {
    setDeleteDialog({ open: true, messageId });
  };

  const handleMessagePin = async (messageId: string) => {
    if (!conversationId || !user?.id) return;
    const alreadyPinned = pinnedMessages.some((p) => p.message_id === messageId);
    if (alreadyPinned) {
      await unpinMessage(messageId);
    } else {
      await pinMessage(messageId);
    }
  };

  const handleMessageReaction = async (messageId: string, emoji: string) => {
    await toggleReaction(messageId, emoji);
  };

  const handleMessageEdit = (messageId: string, content: string) => {
    setEditingMessage({ id: messageId, content });
    setInputText(content);
    setReplyTo(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleMessageReply = (messageId: string) => {
    const msg = messages.find((m) => m.id === messageId);
    if (!msg) return;
    const preview = (msg.content || "").trim().slice(0, 140);
    setReplyTo({ id: msg.id, preview });
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleMessageForward = (messageId: string) => {
    const msg = messages.find((m) => m.id === messageId);
    if (!msg) return;
    setForwardMessage(msg);
    setForwardOpen(true);
  };

  const handleMessageSelect = (messageId: string) => {
    setSelectionMode(true);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.add(messageId);
      return next;
    });
  };

  const handleMessageSave = async (messageId: string) => {
    const msg = messages.find((m) => m.id === messageId);
    if (!msg) return;

    await saveToSavedMessages({
      original_message_id: msg.id,
      content: msg.content ?? "",
      media_url: msg.media_url ?? null,
      media_type: msg.media_type ?? null,
      original_chat_id: conversationId,
    });
  };

  const handleMessageUnsave = async (messageId: string) => {
    await removeSavedByOriginalId(messageId);
  };

  const handleMessageTranslate = async (messageId: string, text: string) => {
    const source = text.trim();
    if (!source) return;
    const result = await translate(messageId, source, "ru");
    if (!result?.translatedText) {
      toast.error("Не удалось перевести сообщение");
      return;
    }
    const preview = result.translatedText.length > 140
      ? `${result.translatedText.slice(0, 140)}...`
      : result.translatedText;
    toast.success(preview);
  };

  const toggleSelected = (messageId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      if (next.size === 0) setSelectionMode(false);
      return next;
    });
  };

  const clearSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const deleteSelectedForMe = () => {
    selectedIds.forEach((id) => hideMessageForMe(id));
    toast.success("Удалено у вас");
    clearSelection();
  };

  const copySelected = async () => {
    const parts = visibleMessages
      .filter((m) => selectedIds.has(m.id))
      .map((m) => m.content)
      .filter(Boolean);
    try {
      await navigator.clipboard.writeText(parts.join("\n\n"));
      toast.success("Скопировано");
    } catch (error) {
      logger.warn("chat: failed to copy selected messages", {
        conversationId,
        count: selectedIds.size,
        error,
      });
      toast.error("Не удалось скопировать");
    }
  };

  // ── Props for ChatMessageItem ──────────────────────────────────
  const messageStyleConfig = {
    bubbleClass,
    densityStyles,
    fontSizeSetting: chatSettings.font_size as "small" | "medium" | "large" | undefined,
    bubbleStyleSetting: chatSettings.bubble_style as "classic" | "minimal" | "modern" | undefined,
    messageCornerRadius,
    autoDownloadPhotos,
    autoDownloadVideos,
    mediaTapEnabled,
    linkPreviewEnabled: globalSettings.link_preview_enabled,
  };

  const messageCallbacks = {
    onReply: handleMessageReply,
    onDelete: async (msgId: string) => {
      const result = await deleteMessage(msgId);
      if (result.error) toast.error("Не удалось удалить сообщение");
    },
    onReaction: handleMessageReaction,
    onLongPressStart: handleMessageLongPressStart,
    onLongPressEnd: handleMessageLongPressEnd,
    onManualLoad: (msgId: string) => setManualMediaLoaded((prev) => { const next = new Set(prev); next.add(msgId); return next; }),
    onViewImage: (url: string) => setViewingImage(url),
    onViewVideo: (url: string) => setViewingVideo(url),
    toggleSelected,
    getReactions,
    getMessageStatus,
    toggleVoicePlay,
    getWaveformHeights,
    renderText,
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-background z-[200]">
      <AnimatedEmojiFullscreen emoji={lastSentEmoji} onComplete={() => setLastSentEmoji(null)} />
      <AlertDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog((prev) => ({ ...prev, open }))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить сообщение?</AlertDialogTitle>
            <AlertDialogDescription>Выберите вариант удаления.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteDialog.messageId) {
                  hideMessageForMe(deleteDialog.messageId);
                  toast.success("Удалено у вас");
                }
              }}
            >
              У меня
            </AlertDialogAction>
            <AlertDialogAction
              onClick={async () => {
                const id = deleteDialog.messageId;
                if (!id) return;
                const msg = messages.find((m) => m.id === id);
                if (!msg || msg.sender_id !== user?.id) {
                  toast.error("Можно удалить у всех только свои сообщения");
                  return;
                }
                const result = await deleteMessage(id);
                if (result.error) {
                  toast.error("Не удалось удалить сообщение");
                } else {
                  toast.success("Удалено у всех");
                }
              }}
            >
              У всех
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ChatHeader
        conversationId={conversationId}
        chatName={chatName}
        chatAvatar={chatAvatar}
        otherUserId={otherUserId}
        isGroup={isGroup}
        totalUnreadCount={totalUnreadCount}
        headerStatusText={headerStatusText}
        isOtherOnline={isOtherOnline}
        isOtherTyping={isOtherTyping}
        otherStatusEmoji={otherStatusEmoji}
        otherStatusStickerUrl={otherStatusStickerUrl}
        onBack={onBack}
        onStartAudioCall={handleStartAudioCall}
        onStartVideoCall={handleStartVideoCall}
        onSearchOpen={() => setShowMessageSearch(true)}
      />

      {isSecret && (
        <SecretChatBanner ttlSeconds={secretChat?.default_ttl_seconds ?? undefined} />
      )}

      <PinnedMessageBar
        pinnedMessages={pinnedMessages}
        onScrollTo={scrollToMessage}
        onLongPress={() => setShowPinnedSheet(true)}
      />

      {/* Messages - scrollable with animated brand background */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden native-scroll flex flex-col relative">
        {/* UI-1: Floating date pill */}
        <FloatingDate
          date={floatingDate}
          onClick={() => setShowJumpToPicker(true)}
        />
        {/* UI-2: Scroll-to-bottom FAB */}
        <ScrollToBottomFab
          visible={showScrollFab}
          unreadCount={totalUnreadCount}
          onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })}
        />
      <ChatBackground wallpaper={chatSettings.chat_wallpaper} className="flex-1 flex flex-col min-h-full">
        {/* Content layer */}
        <div className="relative z-10 flex-1 flex flex-col p-4 overflow-x-hidden min-w-0">
        {/* Spacer to push messages to bottom */}
        <div className="flex-1" />
        
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        )}

        {!loading && renderMessages.length === 0 && (
          <div className="flex items-center justify-center py-8 text-center">
            <p className="text-muted-foreground">Начните переписку!</p>
          </div>
        )}
        
        <div className="space-y-1 min-w-0">

        {renderMessages.map((message, index) => (
          <ChatMessageItem
            key={message.id}
            message={message}
            prevMessage={index > 0 ? renderMessages[index - 1] : null}
            userId={user?.id}
            conversationId={conversationId}
            chatAvatar={chatAvatar}
            isGroup={isGroup}
            selectionMode={selectionMode}
            selectedIds={selectedIds}
            playingVoice={playingVoice}
            manualMediaLoaded={manualMediaLoaded}
            contextMenuMessageId={contextMenuMessage?.id ?? null}
            decryptedCache={decryptedCache}
            senderProfiles={senderProfiles}
            style={messageStyleConfig}
            callbacks={messageCallbacks}
          />
        ))}
        </div>
        <div ref={messagesEndRef} />
        </div>
      </ChatBackground>
      </div>{/* end scrollContainerRef div */}

      {/* Text selection floating menu */}
      <TextSelectionMenu
        onReplyWithQuote={(text) => {
          setQuotedText(text);
          setReplyTo({ id: "", preview: text.slice(0, 80) });
        }}
        onCopy={(text) => {
          navigator.clipboard.writeText(text).catch(() => { /* clipboard not available */ });
        }}
      />

      {/* Reply Keyboard for bots */}
      {replyKeyboard && (
        <ReplyKeyboard
          keyboard={replyKeyboard}
          onButtonPress={(text) => {
            void handleSendMessage(false, text);
          }}
          resizable
        />
      )}

      {/* Input area - Fully transparent like Telegram */}
      <div className="flex-shrink-0 relative z-10">
        
        <ChatInputBar
          inputText={inputText}
          isSending={isSending}
          isRecording={isRecording}
          recordingTime={recordingTime}
          recordMode={recordMode}
          showEmojiPicker={showEmojiPicker}
          defaultTimer={defaultTimer}
          isSilentSend={isSilentSend}
          showSendOptions={showSendOptions}
          isGroup={isGroup}
          maxLength={TELEGRAM_MAX_MESSAGE_CHARS}
          editingMessage={editingMessage}
          replyTo={replyTo}
          quotedText={quotedText}
          inlineBotTrigger={inlineBotTrigger}
          mentionTrigger={mentionTrigger}
          mentionSuggestions={mentionSuggestions}
          mentionActiveIndex={mentionActiveIndex}
          inputRef={inputRef}
          onInputChange={handleInputChange}
          onSend={(silent, overrideText) => void handleSendMessage(silent, overrideText)}
          onCancelRecording={cancelRecording}
          onStopRecording={stopRecording}
          onRecordButtonDown={handleRecordButtonDown}
          onRecordButtonUp={handleRecordButtonUp}
          onRecordButtonLeave={handleRecordButtonLeave}
          onSetShowEmojiPicker={setShowEmojiPicker}
          onSetShowTimerPicker={setShowTimerPicker}
          onSetShowAttachmentSheet={setShowAttachmentSheet}
          onSetShowGiftCatalog={setShowGiftCatalog}
          onSetShowCreatePoll={setShowCreatePoll}
          onSetShowSendOptions={setShowSendOptions}
          onSetPendingScheduleContent={setPendingScheduleContent}
          onSetShowSchedulePicker={setShowSchedulePicker}
          onCancelEdit={() => { setEditingMessage(null); setInputText(""); }}
          onCancelReply={() => { setReplyTo(null); setQuotedText(null); }}
          onScrollToReply={scrollToMessage}
          onMentionSelect={(user) => {
            if (!mentionTrigger) return;
            const caret = inputRef.current?.selectionStart ?? inputText.length;
            const { newText, newCaretPos } = insertMention(inputText, caret, mentionTrigger.triggerStart, user.username ?? user.display_name ?? user.user_id);
            handleInputChange(newText, newCaretPos);
            setMentionTrigger(null);
            requestAnimationFrame(() => {
              if (inputRef.current) {
                inputRef.current.focus();
                inputRef.current.setSelectionRange(newCaretPos, newCaretPos);
              }
            });
          }}
          onMentionActiveIndexChange={setMentionActiveIndex}
          onMentionDismiss={() => setMentionTrigger(null)}
          onInlineBotSelect={(result) => void handleSendMessage(false, result.sendContent.text)}
          onInlineBotDismiss={() => setInlineBotTrigger(null)}
        />
        
        {/* Sticker/GIF/Emoji Picker */}
        <StickerGifPicker
          open={showEmojiPicker}
          onOpenChange={setShowEmojiPicker}
          onEmojiSelect={(emoji) => {
            setInputText((prev) => prev + emoji);
          }}
          onStickerSelect={async (sticker) => {
            setShowEmojiPicker(false);
            if (!conversationId || !user) return;
            const clientMsgId = crypto.randomUUID();
            const envelope = buildChatBodyEnvelope({
              kind: 'media',
              text: '🎭 Стикер',
              media_type: 'sticker',
              media_url: sticker.file_url,
              sticker_id: sticker.id,
            });
            try {
              await sendMessageV1({ conversationId, clientMsgId, body: envelope });
            } catch (e) {
              logger.error("chat: send sticker failed", { conversationId, error: e });
            }
          }}
          onGifSelect={async (gif) => {
            setShowEmojiPicker(false);
            if (!conversationId || !user) return;
            const clientMsgId = crypto.randomUUID();
            const envelope = buildChatBodyEnvelope({
              kind: 'media',
              text: 'GIF',
              media_type: 'gif',
              media_url: gif.url,
            });
            try {
              await sendMessageV1({ conversationId, clientMsgId, body: envelope });
            } catch (e) {
              logger.error("chat: send gif failed", { conversationId, error: e });
            }
          }}
        />
      </div>
      
      {/* Safe area for bottom - transparent */}
      {!showEmojiPicker && <div className="safe-area-bottom" />}

      {/* Video Circle Recorder */}
      {showVideoRecorder && (
        <VideoCircleRecorder
          onRecord={handleVideoRecord}
          onCancel={() => {
            setShowVideoRecorder(false);
            sendTyping(false, "recording_video");
          }}
        />
      )}

      {/* Attachment Sheet */}
      <AttachmentSheet
        open={showAttachmentSheet}
        onOpenChange={setShowAttachmentSheet}
        onSelectFile={handleAttachment}
        onSelectLocation={handleLocationSelect}
        onOpenCamera={() => {
          setShowCameraSheet(true);
        }}
      />

      <CameraCaptureSheet
        open={showCameraSheet}
        onOpenChange={setShowCameraSheet}
        settingsScopeKey={`dm:${conversationId}`}
        onSendFile={async (file, type) => {
          await handleAttachment(file, type);
        }}
      />


      {/* Image Viewer */}
      {viewingImage && (
        <ImageViewer
          src={viewingImage}
          onClose={() => setViewingImage(null)}
        />
      )}

      {/* Fullscreen Video Player */}
      {viewingVideo && (
        <FullscreenVideoPlayer
          src={viewingVideo}
          onClose={() => setViewingVideo(null)}
        />
      )}

      <ForwardMessageSheet
        open={forwardOpen}
        onOpenChange={setForwardOpen}
        message={forwardMessage}
      />

      {/* Gift Catalog */}
      {!isGroup && (
        <GiftCatalog
          open={showGiftCatalog}
          onClose={() => setShowGiftCatalog(false)}
          recipientId={otherUserId}
          recipientName={chatName}
          recipientAvatar={chatAvatar}
          conversationId={conversationId}
          onGiftSent={async (giftEmoji, giftName, sentGiftId) => {
            // Send a message with media_type='gift' encoding gift data as content JSON
            const clientMsgId = crypto.randomUUID();
            const envelope = buildChatBodyEnvelope({
              kind: 'media',
              text: JSON.stringify({
                sent_gift_id: sentGiftId,
                gift_emoji: giftEmoji,
                gift_name: giftName,
                stars_spent: 0,
                is_opened: false,
              }),
              media_type: 'gift',
              media_url: null,
            });
            try {
              await sendMessageV1({ conversationId, clientMsgId, body: envelope });
            } catch (e) {
              logger.error("chat: send gift message failed", { conversationId, error: e });
            }
          }}
        />
      )}

      {/* Disappearing messages timer picker */}
      <DisappearTimerPicker
        open={showTimerPicker}
        onOpenChange={setShowTimerPicker}
        currentTimer={defaultTimer}
        onSelect={setConversationTimer}
      />

      {/* Selection actions */}
      {selectionMode && (
        <div className="fixed bottom-[84px] left-0 right-0 z-[250] px-4">
          <div className="mx-auto max-w-[520px] rounded-2xl bg-black/40 backdrop-blur-xl border border-white/10 px-3 py-2 flex items-center justify-between gap-2">
            <div className="text-sm text-white/80">Выбрано: {selectedIds.size}</div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="bg-white/10 border-white/20 text-white hover:bg-white/20"
                onClick={copySelected}
              >
                Скопировать
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="bg-white/10 border-white/20 text-white hover:bg-white/20"
                onClick={deleteSelectedForMe}
              >
                Удалить у меня
              </Button>
              <Button size="sm" variant="ghost" className="text-white/70 hover:bg-white/10" onClick={clearSelection}>
                Отмена
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Message Context Menu */}
      {contextMenuMessage && (
        <MessageContextMenu
          isOpen={!!contextMenuMessage}
          onClose={() => setContextMenuMessage(null)}
          messageId={contextMenuMessage.id}
          messageContent={contextMenuMessage.content}
          isOwn={contextMenuMessage.isOwn}
          position={contextMenuMessage.position}
          onDelete={handleMessageDelete}
          onPin={handleMessagePin}
          onReaction={handleMessageReaction}
          quickReactions={quickReactions}
          onReply={handleMessageReply}
          onForward={handleMessageForward}
          onSelect={handleMessageSelect}
          onSave={handleMessageSave}
          onUnsave={handleMessageUnsave}
          isSaved={isSaved(contextMenuMessage.id)}
          onTranslate={handleMessageTranslate}
          onEdit={handleMessageEdit}
        />
      )}

      {/* Pinned Messages Sheet */}
      <PinnedMessagesSheet
        open={showPinnedSheet}
        onClose={() => setShowPinnedSheet(false)}
        pinnedMessages={pinnedMessages}
        onScrollTo={(messageId) => {
          scrollToMessage(messageId);
          setShowPinnedSheet(false);
        }}
        onUnpin={unpinMessage}
      />

      {/* Scheduled Messages List */}
      <ScheduledMessagesList
        open={showScheduledList}
        onClose={() => setShowScheduledList(false)}
        scheduledMessages={scheduledMessages}
        onSendNow={async (id) => {
          try {
            await sendScheduledNow(id);
          } catch (error) {
            logger.warn("chat: failed to send scheduled message now", {
              conversationId,
              scheduledMessageId: id,
              error,
            });
            toast.error('Не удалось отправить сообщение');
          }
        }}
        onEdit={(msg) => {
          setPendingScheduleContent(msg.content);
          setShowScheduledList(false);
          setShowSchedulePicker(true);
        }}
        onDelete={async (id) => {
          try {
            await deleteScheduledMessage(id);
          } catch (error) {
            logger.warn("chat: failed to delete scheduled message", {
              conversationId,
              scheduledMessageId: id,
              error,
            });
            toast.error('Не удалось удалить запланированное сообщение');
          }
        }}
      />

      {/* Schedule Message Picker */}
      <ScheduleMessagePicker
        open={showSchedulePicker}
        onClose={() => setShowSchedulePicker(false)}
        messagePreview={pendingScheduleContent}
        onSchedule={async (scheduledFor) => {
          if (!conversationId || !pendingScheduleContent) return;
          try {
            await scheduleMessage({
              conversation_id: conversationId,
              content: pendingScheduleContent,
              scheduled_for: scheduledFor,
            });
            setInputText('');
            setPendingScheduleContent('');
            toast.success('Сообщение запланировано');
          } catch (error) {
            logger.warn("chat: failed to schedule message", { conversationId, error });
            toast.error('Не удалось запланировать сообщение');
          }
        }}
      />

      {/* Message Search Sheet */}
      <MessageSearchSheet
        open={showMessageSearch}
        onOpenChange={setShowMessageSearch}
        conversationId={conversationId}
        onSelectMessage={(msgId) => scrollToMessage(msgId)}
      />

      {/* Create Poll Sheet */}
      {conversationId && (
        <CreatePollSheet
          open={showCreatePoll}
          onOpenChange={setShowCreatePoll}
          conversationId={conversationId}
          onCreated={async (pollId) => {
            // Send poll message
            const clientMsgId = crypto.randomUUID();
            const envelope = buildChatBodyEnvelope({
              kind: 'media',
              text: '📊 Опрос',
              media_type: 'poll',
              media_url: null,
              poll_id: pollId,
            });
            try {
              await sendMessageV1({ conversationId, clientMsgId, body: envelope });
            } catch (e) {
              logger.error("chat: send poll failed", { conversationId, error: e });
            }
          }}
        />
      )}

      {/* Chat Settings Sheet */}
      <ChatSettingsSheet
        conversationId={conversationId}
        open={showChatSettings}
        onClose={() => setShowChatSettings(false)}
      />

      {/* UI-6: Jump to date picker */}
      <JumpToDatePicker
        open={showJumpToPicker}
        onClose={() => setShowJumpToPicker(false)}
        messages={messages}
        onJump={scrollToMessage}
      />

    </div>
  );
}