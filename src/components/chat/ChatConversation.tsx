import { useState, useRef, useEffect, useCallback, useMemo, Fragment } from "react";
import { AnimatedEmojiFullscreen, isSingleEmoji } from "./AnimatedEmojiFullscreen";
import { useBubbleGradient } from "@/hooks/useBubbleGradient";
import { FloatingDate, DateSeparator } from "./FloatingDate";
import { ScrollToBottomFab } from "./ScrollToBottomFab";
import { AutoGrowTextarea } from "./AutoGrowTextarea";
import { BubbleTail } from "./BubbleTail";
import { AnimatedSticker } from "./AnimatedSticker";
import { JumpToDatePicker } from "./JumpToDatePicker";
import { useSecretChat } from "@/hooks/useSecretChat";
import { usePolls } from "@/hooks/usePolls";
import { SecretChatBanner } from "./SecretChatBanner";
import { MessageSearchSheet } from "./MessageSearchSheet";
import { CreatePollSheet } from "./CreatePollSheet";
import { PollMessage } from "./PollMessage";
import { useReadReceipts } from "@/hooks/useReadReceipts";
import { usePinnedMessages } from "@/hooks/usePinnedMessages";
import { useScheduledMessages } from "@/hooks/useScheduledMessages";
import { MessageStatus } from "./MessageStatus";
import { PinnedMessageBar } from "./PinnedMessageBar";
import { PinnedMessagesSheet } from "./PinnedMessagesSheet";
import { ScheduleMessagePicker } from "./ScheduleMessagePicker";
import { ScheduledMessagesList } from "./ScheduledMessagesList";
import { GiftCatalog } from "./GiftCatalog";
import { GiftMessage } from "./GiftMessage";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Phone, Video, Send, Mic, X, Play, Pause, Check, CheckCheck, Smile, Timer, Search, Pencil, Users as UsersIcon } from "lucide-react";
import { AttachmentIcon } from "./AttachmentIcon";
import { EncryptionBadge } from "./EncryptionBadge";
import { useE2EEncryption } from "@/hooks/useE2EEncryption";
import type { EncryptedPayload } from "@/hooks/useE2EEncryption";
import { Button } from "@/components/ui/button";
import { useMessages } from "@/hooks/useChat";
import { useMessageReactions } from "@/hooks/useMessageReactions";
import { sanitizeReceivedText } from "@/lib/text-encoding";
import { useAuth } from "@/hooks/useAuth";
import { useMarkConversationRead } from "@/hooks/useMarkConversationRead";
import { useVideoCallContext } from "@/contexts/VideoCallContext";
import { useChatOpen } from "@/contexts/ChatOpenContext";
import { useUserSettings } from "@/contexts/UserSettingsContext";
import { format } from "date-fns";
import { toast } from "sonner";
import { getHashtagBlockedToastPayload } from "@/lib/hashtagModeration";
import { getChatSendErrorToast } from "@/lib/chat/sendError";
import { VideoCircleRecorder } from "./VideoCircleRecorder";
import { VideoCircleMessage } from "./VideoCircleMessage";
import { AttachmentSheet } from "./AttachmentSheet";
import { CameraCaptureSheet } from "./CameraCaptureSheet";
import { ImageViewer } from "./ImageViewer";
import { VideoPlayer, FullscreenVideoPlayer } from "./VideoPlayer";
import { SharedPostCard } from "./SharedPostCard";
import { StickerGifPicker } from "./StickerGifPicker";
import { StickerMessage } from "./StickerMessage";
import { GifMessage } from "./GifMessage";
import { buildChatBodyEnvelope, sendMessageV1 } from "@/lib/chat/sendMessageV1";
import { MessageContextMenu } from "./MessageContextMenu";
import { SwipeableMessage } from "./SwipeableMessage";
import { DoubleTapReaction } from "./DoubleTapReaction";
import { MessageReactions } from "./MessageReactions";
import { ChatSettingsSheet } from "./ChatSettingsSheet";
import { ChatBackground } from "./ChatBackground";
import { useChatSettings } from "@/hooks/useChatSettings";
import { LinkPreview } from "./LinkPreview";
import { InlineBotResults, detectInlineBotTrigger } from "./InlineBotResults";
import { MentionSuggestions } from "./MentionSuggestions";
import { SendOptionsMenu } from "./SendOptionsMenu";
import { extractUrls } from "@/hooks/useLinkPreview";
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
import { useMessageDensity } from "@/hooks/useMessageDensity";
import { DocumentBubble } from "./DocumentBubble";
import { SelfDestructMedia } from "./SelfDestructMedia";
import { useChatDrafts } from "@/hooks/useChatDrafts";
import { DisappearTimerPicker } from "./DisappearTimerPicker";
import { DisappearCountdown } from "./DisappearCountdown";
import { useDisappearingMessages } from "@/hooks/useDisappearingMessages";
import { supabase } from "@/integrations/supabase/client";
import { useUserPresenceStatus } from "@/hooks/useUserPresenceStatus";
import { cn } from "@/lib/utils";
import { GradientAvatar } from "@/components/ui/gradient-avatar";
import { useAppearanceRuntime } from "@/contexts/AppearanceRuntimeContext";
import { diagnoseDmSendReadiness } from "@/lib/chat/readiness";
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

function parseEncryptedPayload(content: unknown): EncryptedPayload | null {
  try {
    const parsed = JSON.parse(String(content ?? ""));
    if (
      parsed &&
      parsed.v === 2 &&
      typeof parsed.iv === "string" &&
      typeof parsed.ct === "string" &&
      typeof parsed.tag === "string" &&
      typeof parsed.epoch === "number" &&
      typeof parsed.kid === "string"
    ) {
      return parsed as EncryptedPayload;
    }
  } catch {
    return null;
  }
  return null;
}

export function ChatConversation({ conversationId, chatName, chatAvatar, otherUserId, onBack, participantCount, isGroup, totalUnreadCount, onRefetch, initialOpenPanelAction, onInitialPanelHandled }: ChatConversationProps) {
  const navigate = useNavigate();
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
  const { getMessageStatus, markAsRead } = useReadReceipts(conversationId);
  const { pinnedMessages, pinMessage, unpinMessage } = usePinnedMessages(conversationId);
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
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const recordingTimeRef = useRef(0);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
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

  useEffect(() => {
    recordingTimeRef.current = recordingTime;
  }, [recordingTime]);

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

  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [otherLiveActivity, setOtherLiveActivity] = useState<"typing" | "recording_voice" | "recording_video" | null>(null);
  const typingChannelRef = useRef<any>(null);
  const typingStopTimerRef = useRef<number | null>(null);
  const lastTypingSentAtRef = useRef<number>(0);
  const otherTypingTimerRef = useRef<number | null>(null);

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
  const sendButtonLongPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  const recordingInterval = useRef<NodeJS.Timeout | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recordingMimeTypeRef = useRef<string | null>(null);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

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
    } catch {
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
  useEffect(() => {
    const encrypted = messages.filter(
      (m: any) => (Boolean(m.is_encrypted) || Boolean(parseEncryptedPayload(m.content))) && !(m.id in decryptedCache),
    );
    if (!encrypted.length) return;

    encrypted.forEach(async (m: any) => {
      const payload = parseEncryptedPayload(m.content);

      if (!payload) {
        setDecryptedCache((prev) => ({ ...prev, [m.id]: null }));
        return;
      }

      const plain = await decryptContent(payload, m.sender_id);
      setDecryptedCache((prev) => ({ ...prev, [m.id]: plain }));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, decryptContent]);

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
      } catch {
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
      } catch {
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
        const ids = (partRows ?? []).map((r: any) => r.user_id as string).filter(Boolean);
        if (!ids.length) return;
        const { data: profileRows } = await supabase
          .from("profiles")
          .select("user_id, display_name, username, avatar_url")
          .in("user_id", ids);
        if (cancelled) return;
        const participants: MentionUser[] = (profileRows ?? []).map((r: any) => ({
          user_id: r.user_id,
          display_name: r.display_name ?? null,
          username: r.username ?? null,
          avatar_url: r.avatar_url ?? null,
        }));
        setMentionParticipants(participants);
      } catch {
        // non-fatal
      }
    })();
    return () => { cancelled = true; };
  }, [conversationId, user]);

  const { renderText } = useMentions(mentionParticipants);

  useEffect(() => {
    if (!isGroup) {
      setSenderProfiles({});
      return;
    }
    const senderIds = [...new Set(visibleMessages.map((m) => m.sender_id).filter(Boolean))];
    if (!senderIds.length) {
      setSenderProfiles({});
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("user_id, display_name, avatar_url")
          .in("user_id", senderIds);
        if (error) throw error;
        if (cancelled) return;
        const next: Record<string, { display_name: string | null; avatar_url: string | null }> = {};
        for (const row of data ?? []) {
          const userId = (row as any).user_id as string;
          next[userId] = {
            display_name: ((row as any).display_name ?? null) as string | null,
            avatar_url: ((row as any).avatar_url ?? null) as string | null,
          };
        }
        setSenderProfiles(next);
      } catch {
        if (!cancelled) setSenderProfiles({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isGroup, visibleMessages]);

  // Bot reply keyboard: watch last incoming message for reply_markup
  useEffect(() => {
    if (!visibleMessages.length) return;
    const last = visibleMessages[visibleMessages.length - 1];
    if (!last || last.sender_id === user?.id) return;
    const markup = (last as any).reply_markup;
    if (!markup) return;
    if (markup.keyboard) {
      setReplyKeyboard(markup.keyboard as ReplyKeyboardButton[][]);
    } else if (markup.remove_keyboard) {
      setReplyKeyboard(null);
    }
  }, [visibleMessages, user?.id]);

  // Realtime typing status (1:1)
  useEffect(() => {
    if (isGroup) return;
    if (!conversationId || !otherUserId || !user?.id) return;

    const channel = supabase
      .channel(`typing:${conversationId}`, {
        config: {
          broadcast: { self: true },
        },
      })
      .on(
        "broadcast" as any,
        { event: "typing" },
        (payload: any) => {
          const p = payload?.payload;
          if (!p || p.user_id !== otherUserId) return;

          const isTyping = !!p.is_typing;
          const activityRaw = String(p.activity || (isTyping ? "typing" : ""));
          const activity: "typing" | "recording_voice" | "recording_video" =
            activityRaw === "recording_voice" || activityRaw === "recording_video"
              ? activityRaw
              : "typing";

          setIsOtherTyping(isTyping && activity === "typing");
          setOtherLiveActivity(isTyping ? activity : null);

          if (otherTypingTimerRef.current) window.clearTimeout(otherTypingTimerRef.current);
          if (isTyping) {
            otherTypingTimerRef.current = window.setTimeout(() => {
              setIsOtherTyping(false);
              setOtherLiveActivity(null);
            }, 3500);
          }
        },
      )
      .subscribe();

    typingChannelRef.current = channel;

    return () => {
      typingChannelRef.current = null;
      if (typingStopTimerRef.current) window.clearTimeout(typingStopTimerRef.current);
      if (otherTypingTimerRef.current) window.clearTimeout(otherTypingTimerRef.current);
      void supabase.removeChannel(channel);
    };
  }, [conversationId, otherUserId, user?.id, isGroup]);

  const sendTyping = useCallback(
    (isTyping: boolean, activity: "typing" | "recording_voice" | "recording_video" = "typing") => {
      if (isGroup) return;
      const channel = typingChannelRef.current;
      if (!channel) return;
      if (!user?.id) return;

      const state = String(channel.state || "");
      if (state && state !== "joined") return;

      const payload = {
        type: "broadcast",
        event: "typing",
        payload: { user_id: user.id, is_typing: isTyping, activity },
      };

      const sender = typeof channel.httpSend === "function" ? channel.httpSend.bind(channel) : channel.send.bind(channel);

      Promise.resolve(sender(payload)).catch(() => {
        // best-effort typing signal only
      });
    },
    [user?.id, isGroup],
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

      if (isGroup) return;

      const now = Date.now();
      if (now - lastTypingSentAtRef.current > 700) {
        sendTyping(value.trim().length > 0, "typing");
        lastTypingSentAtRef.current = now;
      }

      if (typingStopTimerRef.current) window.clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = window.setTimeout(() => {
        sendTyping(false, "typing");
      }, 2000);
    },
    [sendTyping, isGroup],
  );

  const headerStatusText = useMemo(() => {
    if (isGroup) {
      return `${participantCount || 0} участник${participantCount === 1 ? "" : participantCount && participantCount < 5 ? "а" : "ов"}`;
    }
    if (otherLiveActivity === "recording_voice") return "записывает голосовое…";
    if (otherLiveActivity === "recording_video") return "записывает кружочек…";
    if (isOtherTyping || otherLiveActivity === "typing") return "печатает…";
    return otherPresenceText;
  }, [isGroup, participantCount, isOtherTyping, otherPresenceText, otherLiveActivity]);

  // Mark incoming messages as read when chat is opened / receives new messages.
  useEffect(() => {
    // Only for DMs (groups/channels have separate infra).
    if (!conversationId || !user || isGroup) return;
    (async () => {
      await markConversationRead(conversationId);
      // Refresh list so unread badge updates immediately.
      onRefetch?.();
    })();

    // Mark unread incoming messages as read via read-receipts hook
    const incomingUnread = messages.filter(
      (m) => m.sender_id !== user.id && !m.is_read
    );
    for (const msg of incomingUnread) {
      markAsRead(msg.id);
    }
  }, [conversationId, user, isGroup, messages.length, markConversationRead, onRefetch, markAsRead]);

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
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
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
      } catch {
        // Ignore autoplay / audio-context errors silently
      }
    }

    if (globalSettings.in_app_vibrate && chatSettings.notification_vibration && typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(30);
      } catch {
        // no-op
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

  useEffect(() => {
    if (isRecording) {
      recordingInterval.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } else {
      if (recordingInterval.current) {
        clearInterval(recordingInterval.current);
      }
      setRecordingTime(0);
    }
    return () => {
      if (recordingInterval.current) {
        clearInterval(recordingInterval.current);
      }
    };
  }, [isRecording]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatMessageTime = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "HH:mm");
    } catch {
      return "";
    }
  };

  const normalizeBrokenVerticalText = useCallback((text: string) => {
    // Validate that text is properly encoded (basic UTF-8 sanity check)
    try {
      // If text contains mojibake patterns (high-bit chars that don't form valid UTF-8),
      // it may indicate encoding issues. For Cyrillic, ensure it's valid UTF-8.
      const encoded = new TextEncoder().encode(text);
      const decoded = new TextDecoder('utf-8', { fatal: false }).decode(encoded);
      if (!decoded || decoded.length === 0) {
        return text; // Fallback if decoding fails
      }
    } catch {
      return text; // If encoding/decoding fails, return original text
    }

    const lines = text.split(/\r\n|\r|\n|\u2028|\u2029/);
    const nonEmpty = lines.map((line) => line.trim()).filter(Boolean);
    const isSingleGlyph = (s: string) => Array.from(s).length === 1;
    // Fix mojibake-style payloads where each symbol was saved as a separate line.
    // Use 2+ to also fix short cases like "О\nК".
    if (nonEmpty.length >= 2 && nonEmpty.length <= 64 && nonEmpty.every(isSingleGlyph)) {
      return nonEmpty.join("");
    }
    return text;
  }, []);

  const renderMessages = useMemo(() => {
    return visibleMessages;
  }, [visibleMessages]);

  const handleSendMessage = async (silent = false, overrideText?: string) => {
    console.log("[handleSendMessage] inputText:", inputText, "silent:", silent);
    if (sendInFlightRef.current) {
      console.log("[handleSendMessage] send in-flight, skipping");
      return;
    }

    const trimmed = (overrideText ?? inputText).trim();
    if (!trimmed) {
      console.log("[handleSendMessage] empty input, skipping");
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
        toast.error("Не удалось отредактировать", { description: String(result.error) });
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
        if (encrypted) {
          contentToSend = JSON.stringify(encrypted);
          extraFields = {
            is_encrypted: true,
            encryption_iv: encrypted.iv,
            encryption_key_version: encrypted.epoch,
          };
        }
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
      console.error("[handleSendMessage] error:", error);
      const payload = getHashtagBlockedToastPayload(error);
      if (payload) {
        setInputText(trimmed);
        setReplyTo(reply);
        draftClientMsgIdRef.current = clientMsgId;
        lastDraftTrimmedRef.current = trimmed;
        toast.error(payload.title, { description: payload.description });
      } else {
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
        });
        toast.error("Не удалось отправить сообщение", {
          description: diagnostic ?? undefined,
        });
      }
    } finally {
      sendInFlightRef.current = false;
      setIsSending(false);
    }
  };

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Pick best supported audio container/codec (iOS Safari often can't play webm/opus)
      const preferredTypes = [
        "audio/mp4",
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
      ];

      const mimeType = preferredTypes.find((t) => MediaRecorder.isTypeSupported(t)) || "";
      recordingMimeTypeRef.current = mimeType || null;

      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      sendTyping(true, "recording_voice");
    } catch (err) {
      console.error('Failed to start recording:', err);
    }
  }, [sendTyping]);

  const stopRecording = useCallback(async () => {
    if (!mediaRecorderRef.current || !isRecording) return;

    const duration = recordingTimeRef.current;
    
    return new Promise<void>((resolve) => {
      mediaRecorderRef.current!.onstop = async () => {
        const mimeType = recordingMimeTypeRef.current || mediaRecorderRef.current?.mimeType || "audio/webm";
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        
        if (duration > 0) {
          const ext = mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm";
          const file = new File([audioBlob], `voice_${Date.now()}.${ext}`, { type: mimeType });
          await sendMediaMessage(file, 'voice', duration);
        }

        // Stop all tracks
        mediaRecorderRef.current?.stream.getTracks().forEach(track => track.stop());
        resolve();
      };

      mediaRecorderRef.current!.stop();
      setIsRecording(false);
      sendTyping(false, "recording_voice");
    });
  }, [isRecording, sendMediaMessage, sendTyping]);

  const cancelRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      mediaRecorderRef.current = null;
    }
    audioChunksRef.current = [];
    setIsRecording(false);
    sendTyping(false, "recording_voice");
  };

  const toggleVoicePlay = async (messageId: string, mediaUrl?: string) => {
    if (playingVoice === messageId) {
      audioRef.current?.pause();
      setPlayingVoice(null);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (mediaUrl) {
        try {
          const audio = new Audio(mediaUrl);
          audio.onended = () => setPlayingVoice(null);
          audio.onerror = (e) => {
            console.error('Audio playback error:', e);
            setPlayingVoice(null);
          };
          await audio.play();
          audioRef.current = audio;
          setPlayingVoice(messageId);
        } catch (error) {
          console.error('Failed to play audio:', error);
          setPlayingVoice(null);
        }
      }
    }
  };

  // Generate stable waveform heights for voice messages
  const getWaveformHeights = useMemo(() => {
    const cache: Record<string, number[]> = {};
    return (messageId: string): number[] => {
      if (!cache[messageId]) {
        // Use message ID as seed for consistent random heights
        const heights: number[] = [];
        let seed = messageId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        for (let i = 0; i < 20; i++) {
          seed = (seed * 1103515245 + 12345) % 2147483648;
          heights.push((seed % 16) + 8);
        }
        cache[messageId] = heights;
      }
      return cache[messageId];
    };
  }, []);

  const handleVideoRecord = async (videoBlob: Blob, duration: number) => {
    const file = new File([videoBlob], `video_circle_${Date.now()}.webm`, { type: 'video/webm' });
    await sendMediaMessage(file, 'video_circle', duration);
    setShowVideoRecorder(false);
  };

  const handleAttachment = async (file: File, type: "image" | "video") => {
    if (type === "image") {
      await sendMediaMessage(file, 'image');
    } else {
      // For video files, we can add a 'video' type or reuse 'video_circle'
      await sendMediaMessage(file, 'video' as any);
    }
  };

  const handleStartAudioCall = async () => {
    await startCall(otherUserId, conversationId, "audio");
  };

  const handleStartVideoCall = async () => {
    await startCall(otherUserId, conversationId, "video");
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
    } catch {
      // ignore
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
    } catch {
      toast.error("Не удалось скопировать");
    }
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

      {/* Header - transparent with glass effect */}
      <div className="flex-shrink-0 safe-area-top relative z-10 backdrop-blur-xl bg-black/20 border-b border-white/10">
        <div className="flex items-center px-2 py-2">
          {/* Back button */}
          <button 
            onClick={onBack} 
            className="flex items-center gap-1 p-2 text-[#6ab3f3] hover:bg-white/5 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            {totalUnreadCount && totalUnreadCount > 0 ? (
              <span className="text-sm font-medium">{totalUnreadCount}</span>
            ) : null}
          </button>
          
          {/* Avatar + Name + Status - clickable to profile */}
          <button
            onClick={() => {
              if (isGroup) return;
              navigate(`/contact/${otherUserId}`, { state: { name: chatName, avatar: chatAvatar, conversationId } });
            }}
            className={`flex items-center gap-3 flex-1 min-w-0 rounded-lg px-2 py-1 transition-colors ${
              isGroup ? "cursor-default" : "hover:bg-white/5"
            }`}
          >
            <div className="relative flex-shrink-0">
              <GradientAvatar
                name={chatName}
                seed={conversationId}
                avatarUrl={chatAvatar}
                size="sm"
              />
              {otherStatusStickerUrl ? (
                <img
                  src={otherStatusStickerUrl}
                  alt="status sticker"
                  className="absolute -bottom-2 -left-2 w-9 h-9 rounded-xl object-cover bg-white/10 border border-white/20"
                />
              ) : null}
            </div>
            <div className="flex flex-col items-start min-w-0">
              <h2 className="font-semibold text-white text-base truncate max-w-[180px]">{chatName}{otherStatusEmoji ? ` ${otherStatusEmoji}` : ""}</h2>
              <p
                className={`text-xs flex items-center gap-1.5 ${
                  isGroup
                    ? "text-[#6ab3f3]"
                    : isOtherTyping
                      ? "text-[#6ab3f3]"
                      : isOtherOnline
                        ? "text-emerald-400"
                        : "text-[#6ab3f3]"
                }`}
              >
                {!isGroup ? (
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${
                      isOtherTyping ? "bg-[#6ab3f3]" : isOtherOnline ? "bg-emerald-400" : "bg-white/40"
                    }`}
                    aria-hidden="true"
                  />
                ) : null}
                <span className="truncate">{headerStatusText}</span>
              </p>
            </div>
          </button>
          
          {/* Right - quick actions */}
          <div className="flex items-center">
            {/* Search button */}
            <button
              onClick={() => setShowMessageSearch(true)}
              className="p-2 rounded-full hover:bg-white/10 transition-colors"
              aria-label="Поиск сообщений"
            >
              <Search className="w-4 h-4 text-white/60" />
            </button>
            {/* Audio call button */}
            <button
              onClick={handleStartAudioCall}
              className="p-2 rounded-full hover:bg-white/10 active:bg-white/15 transition-colors relative"
              aria-label="Аудиозвонок"
            >
              <Phone className="w-5 h-5 text-[#6ab3f3]" />
              {isGroup && <UsersIcon className="w-3 h-3 text-[#6ab3f3] absolute -bottom-0.5 -right-0.5" />}
            </button>
            
            {/* Video call button */}
            <button
              onClick={handleStartVideoCall}
              className="p-2 rounded-full hover:bg-white/10 active:bg-white/15 transition-colors relative"
              aria-label="Видеозвонок"
            >
              <Video className="w-5 h-5 text-[#6ab3f3]" />
              {isGroup && <UsersIcon className="w-3 h-3 text-[#6ab3f3] absolute -bottom-0.5 -right-0.5" />}
            </button>
          </div>
        </div>

        {/* Add participants banner for groups */}
        {isGroup && (
          <button className="w-full py-2.5 px-4 bg-white/5 flex items-center justify-center gap-2 border-t border-white/5">
            <span className="text-[#6ab3f3] text-sm font-medium">Добавить участников</span>
            <span className="w-5 h-5 rounded-full border border-white/20 flex items-center justify-center">
              <span className="text-white/60 text-xs leading-none">+</span>
            </span>
          </button>
        )}
      </div>

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

        {renderMessages.map((message, index) => {
          const isOwn = message.sender_id === user?.id;
          const senderProfile = senderProfiles[message.sender_id];
          const senderName = senderProfile?.display_name?.trim() || "Пользователь";
          const senderAvatar = senderProfile?.avatar_url || chatAvatar;
          const isVoice = message.media_type === 'voice';
          const isVideoCircle = message.media_type === 'video_circle';
          const isImage = message.media_type === 'image';
          const isVideo = message.media_type === 'video';
          const isSticker = message.media_type === 'sticker';
          const isGif = message.media_type === 'gif';
          const isGift = message.media_type === 'gift';
          const isPoll = message.media_type === 'poll' && !!(message as any).poll_id;
          const isSharedPost = !!message.shared_post_id;
          const isSelfDestruct = (message as any).metadata?.self_destruct === true || ((message as any).ttl_seconds > 0 && (isImage || isVideo));
          const isDocument = !!message.media_url && !!message.media_type &&
            !['voice','video_circle','image','video','sticker','gif','gift','poll'].includes(message.media_type) &&
            (message.media_type.startsWith('application/') || message.media_type.startsWith('text/') || message.media_type === 'document');
          const isRead = message.is_read;
          const textSizeClass =
            chatSettings.font_size === "small"
              ? "text-[13px]"
              : chatSettings.font_size === "large"
                ? "text-[17px]"
                : densityStyles.fontSize;
          const bubbleTailClass =
            chatSettings.bubble_style === "classic"
              ? (isOwn ? "rounded-br-xl" : "rounded-bl-xl")
              : chatSettings.bubble_style === "minimal"
                ? "rounded-lg"
                : (isOwn ? "rounded-br-sm" : "rounded-bl-sm");
          const effectiveBubbleRadius =
            chatSettings.bubble_style === "classic"
              ? Math.max(messageCornerRadius, 18)
              : chatSettings.bubble_style === "minimal"
                ? Math.min(messageCornerRadius, 12)
                : messageCornerRadius;
          const shouldTreatAsEncrypted = Boolean((message as any).is_encrypted) || Boolean(parseEncryptedPayload(message.content));
          const hasDecryptedEntry = Object.prototype.hasOwnProperty.call(decryptedCache, message.id);

          // Group messages - show avatar only for first in sequence
          const prevMessage = index > 0 ? renderMessages[index - 1] : null;
          const showAvatar = !isOwn && (!prevMessage || prevMessage.sender_id !== message.sender_id);
          const showSenderName = isGroup && !isOwn && showAvatar;
          // UI-4: show bubble tail only for first message in sender group
          const isFirstInGroup = !prevMessage || prevMessage.sender_id !== message.sender_id;

          // UI-1: date separator between messages of different calendar days
          const msgDate = new Date(message.created_at);
          const prevMsgDate = prevMessage ? new Date(prevMessage.created_at) : null;
          const showDateSeparator = !prevMsgDate ||
            msgDate.getFullYear() !== prevMsgDate.getFullYear() ||
            msgDate.getMonth() !== prevMsgDate.getMonth() ||
            msgDate.getDate() !== prevMsgDate.getDate();
          const dateSepId = `${msgDate.getFullYear()}-${String(msgDate.getMonth() + 1).padStart(2, "0")}-${String(msgDate.getDate()).padStart(2, "0")}`;

          // Hide message if it's currently shown in context menu
          const isInContextMenu = contextMenuMessage?.id === message.id;

          const requiresManualLoad =
            (isImage && !!message.media_url && !autoDownloadPhotos) ||
            ((isVideo || isVideoCircle) && !!message.media_url && !autoDownloadVideos);

          const isManuallyLoaded = manualMediaLoaded.has(message.id);

          return (
            <Fragment key={message.id}>
            {/* UI-1: date separator */}
            {showDateSeparator && (
              <DateSeparator date={msgDate} id={dateSepId} />
            )}
            <SwipeableMessage
              messageId={message.id}
              onReply={(id) => {
                const msg = renderMessages.find((m) => m.id === id);
                if (msg) {
                  const preview = (msg.content || "").trim().slice(0, 140);
                  setReplyTo({ id: msg.id, preview });
                  requestAnimationFrame(() => inputRef.current?.focus());
                }
              }}
            >
            <div
              ref={(el) => {
                messageRefs.current[message.id] = el;
              }}
              className={`flex items-end ${densityStyles.gap} min-w-0 ${isOwn ? "justify-end" : "justify-start"} ${isInContextMenu ? "opacity-0" : ""}`}
            >
              {/* Avatar for incoming messages */}
              {!isOwn && (
                <div className={`${densityStyles.avatarSize} shrink-0`}>
                  {showAvatar && (
                    <GradientAvatar
                      name={senderName}
                      seed={message.sender_id}
                      avatarUrl={senderAvatar}
                      size="sm"
                      className={`${densityStyles.avatarSize} text-xs border-white/15`}
                    />
                  )}
                </div>
              )}

              {isPoll && (message as any).poll_id ? (
                <PollMessage
                  pollId={(message as any).poll_id}
                  conversationId={conversationId}
                  isOwn={isOwn}
                />
              ) : isSharedPost && message.shared_post_id ? (
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <SharedPostCard 
                    postId={message.shared_post_id} 
                    isOwn={isOwn} 
                    messageId={message.id}
                    onDelete={async (msgId) => {
                      const result = await deleteMessage(msgId);
                      if (result.error) {
                        toast.error("Не удалось удалить сообщение");
                      }
                    }}
                  />
                  <div className={`flex items-center gap-1 ${isOwn ? "justify-end" : "justify-start"}`}>
                    <span className="text-[11px] text-muted-foreground dark:text-white/50">{formatMessageTime(message.created_at)}</span>
                    {isOwn && (
                      <CheckCheck className={`w-4 h-4 ${isRead ? 'text-[#6ab3f3]' : 'text-white/40'}`} />
                    )}
                  </div>
                </div>
              ) : isVideoCircle && message.media_url ? (
                <div className={`flex flex-col gap-1 flex-1 min-w-0 ${isOwn ? "items-end" : "items-start"}`}>
                  {requiresManualLoad && !isManuallyLoaded ? (
                    <div
                      className={cn(
                        "chat-bubble inline-block max-w-[min(75%,560px)] rounded-2xl px-4 py-3 backdrop-blur-xl border border-white/10",
                        isOwn ? "bg-white/10 text-white rounded-br-md" : "bg-white/5 text-white rounded-bl-md",
                      )}
                      style={{ borderRadius: `${messageCornerRadius}px` }}
                    >
                      <p className="text-sm text-white/80">Видео</p>
                      <Button
                        variant="secondary"
                        className="mt-2"
                        onClick={() =>
                          setManualMediaLoaded((prev) => {
                            const next = new Set(prev);
                            next.add(message.id);
                            return next;
                          })
                        }
                      >
                        Загрузить
                      </Button>
                    </div>
                  ) : (
                    <VideoCircleMessage
                      videoUrl={message.media_url}
                      duration={String(message.duration_seconds || 0)}
                      isOwn={isOwn}
                    />
                  )}
                  <div className={`mt-0.5 flex items-center gap-1 px-1 ${isOwn ? "self-end" : "self-start"}`}>
                    <span className="text-[10px] text-muted-foreground dark:text-white/50">{formatMessageTime(message.created_at)}</span>
                    {isOwn && (
                      <CheckCheck className={`w-4 h-4 ${isRead ? 'text-[#6ab3f3]' : 'text-white/40'}`} />
                    )}
                  </div>
                </div>
              ) : isSticker && message.media_url ? (
                <div className={`flex flex-col gap-1 ${isOwn ? "items-end" : "items-start"}`}>
                  <StickerMessage
                    fileUrl={message.media_url}
                    fileType="webp"
                    onReply={() => {}}
                    onDelete={() => deleteMessage(message.id)}
                  />
                  <div className={`flex items-center gap-1 ${isOwn ? "justify-end" : "justify-start"}`}>
                    <span className="text-[10px] text-muted-foreground dark:text-white/50">{formatMessageTime(message.created_at)}</span>
                    {isOwn && <CheckCheck className={`w-4 h-4 ${isRead ? 'text-[#6ab3f3]' : 'text-white/40'}`} />}
                  </div>
                </div>
              ) : isGif && message.media_url ? (
                <div className={`flex flex-col gap-1 ${isOwn ? "items-end" : "items-start"}`}>
                  <GifMessage gifUrl={message.media_url} />
                  <div className={`flex items-center gap-1 ${isOwn ? "justify-end" : "justify-start"}`}>
                    <span className="text-[10px] text-muted-foreground dark:text-white/50">{formatMessageTime(message.created_at)}</span>
                    {isOwn && <CheckCheck className={`w-4 h-4 ${isRead ? 'text-[#6ab3f3]' : 'text-white/40'}`} />}
                  </div>
                </div>
              ) : isGift ? (
                (() => {
                  let giftData: any = {};
                  try { giftData = JSON.parse(message.content || "{}"); } catch {}
                  return (
                    <div className="flex-1 min-w-0">
                      <GiftMessage
                        sentGiftId={giftData.sent_gift_id ?? ""}
                        giftId={giftData.gift_id ?? ""}
                        giftEmoji={giftData.gift_emoji ?? "🎁"}
                        giftName={giftData.gift_name ?? "Подарок"}
                        giftRarity={(giftData.gift_rarity ?? "common") as any}
                        starsSpent={giftData.stars_spent ?? 0}
                        senderName={senderName}
                        messageText={giftData.message_text}
                        isOwn={isOwn}
                        isOpened={giftData.is_opened ?? false}
                        isRecipient={!isOwn}
                      />
                      <div className={`flex items-center gap-1 px-2 ${isOwn ? "justify-end" : "justify-start"}`}>
                        <span className="text-[10px] text-muted-foreground dark:text-white/50">{formatMessageTime(message.created_at)}</span>
                        {isOwn && <CheckCheck className={`w-4 h-4 ${isRead ? 'text-[#6ab3f3]' : 'text-white/40'}`} />}
                      </div>
                    </div>
                  );
                })()
              ) : isDocument && message.media_url ? (
                <div className={`flex flex-col gap-1 flex-1 min-w-0 ${isOwn ? "items-end" : "items-start"}`}>
                  <DocumentBubble
                    fileName={(message as any).file_name ?? message.media_url.split("/").pop() ?? "file"}
                    fileUrl={message.media_url}
                    fileSize={(message as any).file_size ?? 0}
                    mimeType={message.media_type ?? undefined}
                  />
                  <div className={`mt-0.5 flex items-center gap-1 px-1 ${isOwn ? "self-end" : "self-start"}`}>
                    <span className="text-[11px] text-muted-foreground dark:text-white/50">{formatMessageTime(message.created_at)}</span>
                    {isOwn && (
                      <CheckCheck className={`w-4 h-4 ${isRead ? 'text-[#6ab3f3]' : 'text-white/40'}`} />
                    )}
                  </div>
                </div>
              ) : isImage && message.media_url && isSelfDestruct ? (
                <div className={`flex flex-col gap-1 flex-1 min-w-0 ${isOwn ? "items-end" : "items-start"}`}>
                  <SelfDestructMedia
                    mediaUrl={message.media_url}
                    mediaType="image"
                    ttlSeconds={(message as any).ttl_seconds || 10}
                    alreadyViewed={(message as any).metadata?.viewed === true}
                  />
                  <div className={`mt-0.5 flex items-center gap-1 px-1 ${isOwn ? "self-end" : "self-start"}`}>
                    <span className="text-[11px] text-muted-foreground dark:text-white/50">{formatMessageTime(message.created_at)}</span>
                    {isOwn && (
                      <CheckCheck className={`w-4 h-4 ${isRead ? 'text-[#6ab3f3]' : 'text-white/40'}`} />
                    )}
                  </div>
                </div>
              ) : isImage && message.media_url ? (
                requiresManualLoad && !isManuallyLoaded ? (
                  <div className={`flex flex-col gap-1 flex-1 min-w-0 ${isOwn ? "items-end" : "items-start"}`}>
                    <div
                      className={cn(
                        "chat-bubble inline-block max-w-[min(75%,560px)] rounded-2xl px-4 py-3 backdrop-blur-xl border border-white/10",
                        isOwn ? "rounded-br-md bg-white/10" : "rounded-bl-md bg-white/5",
                      )}
                      style={{
                        borderRadius: `${messageCornerRadius}px`,
                        boxShadow: isOwn
                          ? 'inset 0 1px 0 rgba(255,255,255,0.15), 0 4px 20px rgba(0,0,0,0.25)'
                          : 'inset 0 1px 0 rgba(255,255,255,0.1), 0 4px 20px rgba(0,0,0,0.2)'
                      }}
                    >
                      <p className="text-sm text-white/80">Фото</p>
                      <Button
                        variant="secondary"
                        className="mt-2"
                        onClick={() =>
                          setManualMediaLoaded((prev) => {
                            const next = new Set(prev);
                            next.add(message.id);
                            return next;
                          })
                        }
                      >
                        Загрузить
                      </Button>
                    </div>
                    <div className={`mt-0.5 flex items-center gap-1 px-1 ${isOwn ? "self-end" : "self-start"}`}>
                      <span className="text-[11px] text-muted-foreground dark:text-white/50">{formatMessageTime(message.created_at)}</span>
                      {isOwn && (
                        <CheckCheck className={`w-4 h-4 ${isRead ? 'text-[#6ab3f3]' : 'text-white/40'}`} />
                      )}
                    </div>
                  </div>
                ) : (
                  <div className={`flex flex-col gap-1 flex-1 min-w-0 ${isOwn ? "items-end" : "items-start"}`}>
                    <div 
                      className={`chat-bubble inline-block media-frame media-frame--chat rounded-2xl ${mediaTapEnabled ? "cursor-pointer" : ""} backdrop-blur-xl ${
                        isOwn 
                          ? "rounded-br-md bg-white/10 border border-white/10" 
                          : "rounded-bl-md bg-white/5 border border-white/10"
                      }`}
                      style={{
                        borderRadius: `${messageCornerRadius}px`,
                        boxShadow: isOwn 
                          ? 'inset 0 1px 0 rgba(255,255,255,0.15), 0 4px 20px rgba(0,0,0,0.25)'
                          : 'inset 0 1px 0 rgba(255,255,255,0.1), 0 4px 20px rgba(0,0,0,0.2)'
                      }}
                      onClick={() => {
                        if (mediaTapEnabled) setViewingImage(message.media_url!);
                      }}
                    >
                      <img 
                        src={message.media_url} 
                        alt="Изображение" 
                        className="media-object"
                      />
                    </div>
                    <div className={`mt-0.5 flex items-center gap-1 px-1 ${isOwn ? "self-end" : "self-start"}`}>
                      <span className="text-[11px] text-muted-foreground dark:text-white/50">{formatMessageTime(message.created_at)}</span>
                      {isOwn && (
                        <CheckCheck className={`w-4 h-4 ${isRead ? 'text-[#6ab3f3]' : 'text-white/40'}`} />
                      )}
                    </div>
                  </div>
                )
              ) : isVideo && message.media_url ? (
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  {requiresManualLoad && !isManuallyLoaded ? (
                    <div
                      className={cn(
                        "chat-bubble inline-block max-w-[min(75%,560px)] rounded-2xl px-4 py-3 backdrop-blur-xl border border-white/10",
                        isOwn ? "rounded-br-md bg-white/10" : "rounded-bl-md bg-white/5",
                      )}
                      style={{ borderRadius: `${messageCornerRadius}px` }}
                    >
                      <p className="text-sm text-white/80">Видео</p>
                      <Button
                        variant="secondary"
                        className="mt-2"
                        onClick={() =>
                          setManualMediaLoaded((prev) => {
                            const next = new Set(prev);
                            next.add(message.id);
                            return next;
                          })
                        }
                      >
                        Загрузить
                      </Button>
                    </div>
                  ) : (
                    <VideoPlayer
                      src={message.media_url}
                      isOwn={isOwn}
                      onFullscreen={() => setViewingVideo(message.media_url!)}
                    />
                  )}
                  <div className={`mt-0.5 flex items-center gap-1 px-1 ${isOwn ? "self-end" : "self-start"}`}>
                    <span className="text-[11px] text-muted-foreground dark:text-white/50">{formatMessageTime(message.created_at)}</span>
                    {isOwn && (
                      <CheckCheck className={`w-4 h-4 ${isRead ? 'text-[#6ab3f3]' : 'text-white/40'}`} />
                    )}
                  </div>
                </div>
              ) : (
                <div className={`flex flex-col flex-1 min-w-0 ${isOwn ? "items-end" : "items-start"}`}>
                  <div
                    className={`chat-bubble relative inline-block max-w-[min(75%,560px)] rounded-2xl px-3 py-2 select-none backdrop-blur-xl border border-white/10 ${
                      isOwn
                        ? `${bubbleClass} text-white ${bubbleTailClass}`
                        : `bg-white/5 text-white ${bubbleTailClass}`
                    } ${selectionMode && selectedIds.has(message.id) ? "ring-2 ring-white/30" : ""}`}
                    style={{
                      borderRadius: `${effectiveBubbleRadius}px`,
                      boxShadow: isOwn
                        ? 'inset 0 1px 0 rgba(255,255,255,0.15), 0 4px 20px rgba(0,0,0,0.25)'
                        : 'inset 0 1px 0 rgba(255,255,255,0.1), 0 4px 20px rgba(0,0,0,0.2)'
                    }}
                    onClick={() => {
                      if (selectionMode) {
                        toggleSelected(message.id);
                      }
                    }}
                    onMouseDown={(e) => {
                      if (selectionMode) return;
                      handleMessageLongPressStart(message.id, message.content, isOwn, e);
                    }}
                    onMouseUp={handleMessageLongPressEnd}
                    onMouseLeave={handleMessageLongPressEnd}
                    onTouchStart={(e) => {
                      if (selectionMode) return;
                      handleMessageLongPressStart(message.id, message.content, isOwn, e);
                    }}
                    onTouchEnd={handleMessageLongPressEnd}
                  >
                    {/* Sender name for group chats */}
                    {showSenderName && (
                      <p className="text-[13px] font-medium text-[#6ab3f3] mb-0.5">{senderName}</p>
                    )}
                  
                  {isVoice ? (
                    <div className="flex items-center gap-3 min-w-[180px]">
                      <button
                        className="w-10 h-10 shrink-0 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/15 transition-colors"
                        onClick={() => toggleVoicePlay(message.id, message.media_url || undefined)}
                      >
                        {playingVoice === message.id ? (
                          <Pause className="w-5 h-5 text-white" />
                        ) : (
                          <Play className="w-5 h-5 text-white ml-0.5" />
                        )}
                      </button>
                      <div className="flex-1 flex items-center gap-[2px]">
                        {getWaveformHeights(message.id).map((height, i) => (
                          <div
                            key={i}
                            className={`w-[3px] rounded-full transition-all duration-150 ${
                              playingVoice === message.id ? 'bg-white/80' : 'bg-white/40'
                            }`}
                            style={{ 
                              height: `${height}px`,
                              animationDelay: playingVoice === message.id ? `${i * 50}ms` : undefined
                            }}
                          />
                        ))}
                      </div>
                      <span className="text-xs text-white/60 font-medium">
                        {message.duration_seconds ? formatTime(message.duration_seconds) : "0:00"}
                      </span>
                    </div>
                  ) : message.disappeared ? (
                    <p className="text-[14px] italic text-white/40 flex items-center gap-1">
                      <span>👻</span>
                      <span>Сообщение исчезло</span>
                    </p>
                  ) : (
                    <>
                    <p className={`${textSizeClass} leading-[1.4] whitespace-pre-wrap break-words max-h-[60vh] overflow-auto`}>
                      {shouldTreatAsEncrypted
                        ? hasDecryptedEntry
                          ? <>
                              <EncryptionBadge className="mr-1 align-middle" />
                              {renderText(normalizeBrokenVerticalText(sanitizeReceivedText(decryptedCache[message.id] ?? "🔒 Защищённое сообщение")), user?.id)}
                            </>
                          : <span className="opacity-50 italic text-sm">🔒 Расшифровка…</span>
                        : renderText(normalizeBrokenVerticalText(sanitizeReceivedText(message.content)), user?.id)
                      }
                    </p>
                    {/* Link Preview — max 1 per message */}
                    {globalSettings.link_preview_enabled && !shouldTreatAsEncrypted && (() => {
                      const urls = extractUrls(message.content || "");
                      return urls.length > 0 ? (
                        <LinkPreview key={urls[0]} url={urls[0]} enabled={globalSettings.link_preview_enabled} />
                      ) : null;
                    })()}
                    </>
                  )}
                  
                  {/* UI-4: Bubble tail for first message in sender group */}
                  {isFirstInGroup && (
                    <BubbleTail
                      side={isOwn ? "right" : "left"}
                      color={isOwn ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.05)"}
                    />
                  )}
                  </div>

                  {/* Reactions */}
                  {(() => {
                    const msgReactions = getReactions(message.id);
                    return msgReactions.length > 0 ? (
                      <MessageReactions
                        messageId={message.id}
                        reactions={msgReactions}
                        showPicker={false}
                        onPickerClose={() => {}}
                        onReactionChange={() => {}}
                      />
                    ) : null;
                  })()}

                  {/* Time and read status (outside bubble) */}
                  <div className={`mt-0.5 flex items-center gap-1 px-1 ${isOwn ? "self-end" : "self-start"}`}>
                    <span className="text-[11px] text-muted-foreground dark:text-white/50">{formatMessageTime(message.created_at)}</span>
                    {message.is_silent && (
                      <span className="text-[11px]" title="Отправлено без звука">🔕</span>
                    )}
                    {(message as any).edited_at && (
                      <span className="text-[10px] text-white/40 italic">ред.</span>
                    )}
                    {message.disappear_at && message.disappear_in_seconds && !message.disappeared && (
                      <DisappearCountdown
                        disappearAt={message.disappear_at}
                        disappearInSeconds={message.disappear_in_seconds}
                      />
                    )}
                    {isOwn && (
                      <MessageStatus status={getMessageStatus(message.id)} />
                    )}
                  </div>
                </div>
              )}
            </div>
            </SwipeableMessage>
            </Fragment>
          );
        })}
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
          navigator.clipboard.writeText(text).catch(() => {});
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
        
        {/* Input controls */}
        <div className="px-3 py-3">
          {editingMessage && (
            <div className="mb-2 rounded-2xl bg-blue-900/40 backdrop-blur-xl border border-blue-500/30 px-3 py-2 flex items-start justify-between gap-2">
              <div className="min-w-0 flex items-center gap-2">
                <Pencil className="w-4 h-4 text-blue-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-blue-300">Редактирование</p>
                  <p className="text-sm text-white/80 truncate">{editingMessage.content}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingMessage(null);
                  setInputText("");
                }}
                className="shrink-0 p-1 rounded-md hover:bg-white/10"
                aria-label="Отменить редактирование"
              >
                <X className="w-4 h-4 text-white/60" />
              </button>
            </div>
          )}
          {!editingMessage && replyTo && (
            <div className="mb-2 rounded-2xl bg-black/35 backdrop-blur-xl border border-white/10 px-3 py-2 flex items-start justify-between gap-2">
              <button
                className="min-w-0 text-left"
                onClick={() => replyTo.id ? scrollToMessage(replyTo.id) : undefined}
                type="button"
              >
                <p className="text-xs text-white/60">Ответ</p>
                <p className="text-sm text-white/90 truncate">{replyTo.preview}</p>
                {quotedText && (
                  <div className="text-xs italic text-white/60 mt-1 border-l-2 border-blue-400 pl-2">
                    {quotedText}
                  </div>
                )}
              </button>
              <button
                type="button"
                onClick={() => { setReplyTo(null); setQuotedText(null); }}
                className="shrink-0 p-1 rounded-md hover:bg-white/10"
                aria-label="Отменить ответ"
              >
                <X className="w-4 h-4 text-white/60" />
              </button>
            </div>
          )}
          {isRecording ? (
            <div className="flex items-center gap-3">
              <button 
                onClick={cancelRecording}
                className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 backdrop-blur-xl border border-white/10"
                style={{
                  background: 'linear-gradient(145deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), 0 4px 20px rgba(0,0,0,0.3)'
                }}
              >
                <X className="w-5 h-5 text-white/70" />
              </button>
              
              <div 
                className="flex-1 flex items-center gap-3 h-12 px-5 rounded-full backdrop-blur-xl border border-white/10"
                style={{
                  background: 'linear-gradient(145deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), 0 4px 20px rgba(0,0,0,0.3)'
                }}
              >
                <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-sm text-white/70">
                  Запись... {formatTime(recordingTime)}
                </span>
              </div>
              
              <button
                onClick={stopRecording}
                className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
                style={{
                  background: 'linear-gradient(135deg, #00A3B4 0%, #0066CC 50%, #00C896 100%)',
                  boxShadow: '0 0 20px rgba(0,163,180,0.4), 0 4px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.2)'
                }}
              >
                <Send className="w-5 h-5 text-white" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowAttachmentSheet(true)}
                className="w-11 h-11 rounded-full shrink-0 flex items-center justify-center border border-white/20 bg-white/5 text-white/60 hover:text-white/80 hover:bg-white/10 transition-colors"
                aria-label="Вложение"
                type="button"
              >
                <AttachmentIcon className="w-5 h-5" />
              </button>

              {/* Input field - dark transparent like Telegram */}
              <div className="flex-1 relative">
                {/* Inline bot results popup */}
                {inlineBotTrigger && (
                  <InlineBotResults
                    botUsername={inlineBotTrigger.botUsername}
                    query={inlineBotTrigger.query}
                    onSelectResult={(result) => {
                      if (result.sendContent.text) handleSendMessage(false, result.sendContent.text);
                      setInlineBotTrigger(null);
                    }}
                    onDismiss={() => setInlineBotTrigger(null)}
                  />
                )}

                {/* @Mention suggestions popup */}
                <MentionSuggestions
                  suggestions={mentionSuggestions}
                  visible={mentionTrigger !== null && mentionSuggestions.length > 0}
                  onSelect={(user) => {
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
                  externalActiveIndex={mentionActiveIndex}
                />
                <AutoGrowTextarea
                  ref={inputRef}
                  placeholder="Сообщение"
                  value={inputText}
                  onChange={(e) => handleInputChange(e.target.value, (e.target as HTMLTextAreaElement).selectionStart ?? undefined)}
                  onSend={() => {
                    if (!isSending) void handleSendMessage();
                  }}
                  onKeyDown={(e) => {
                    // Mention keyboard navigation
                    if (mentionTrigger && mentionSuggestions.length > 0) {
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setMentionActiveIndex(i => Math.min(i + 1, mentionSuggestions.length - 1));
                        return;
                      }
                      if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setMentionActiveIndex(i => Math.max(i - 1, 0));
                        return;
                      }
                      if (e.key === "Enter" || e.key === "Tab") {
                        e.preventDefault();
                        const selected = mentionSuggestions[mentionActiveIndex];
                        if (selected) {
                          const caret = inputRef.current?.selectionStart ?? inputText.length;
                          const { newText, newCaretPos } = insertMention(inputText, caret, mentionTrigger.triggerStart, selected.username ?? selected.display_name ?? selected.user_id);
                          handleInputChange(newText, newCaretPos);
                          setMentionTrigger(null);
                          requestAnimationFrame(() => {
                            if (inputRef.current) {
                              inputRef.current.focus();
                              inputRef.current.setSelectionRange(newCaretPos, newCaretPos);
                            }
                          });
                        }
                        return;
                      }
                      if (e.key === "Escape") {
                        setMentionTrigger(null);
                        return;
                      }
                    }
                    // Enter handled by onSend above; block default to avoid newline on send
                  }}
                  onFocus={() => setShowEmojiPicker(false)}
                  className="w-full px-5 pr-20 rounded-2xl bg-black/40"
                />
                {/* Icons inside input */}
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  {/* Timer button */}
                  <button
                    onClick={() => setShowTimerPicker(true)}
                    className={`transition-colors ${defaultTimer !== null ? 'text-orange-400' : 'text-white/50 hover:text-white/70'}`}
                    aria-label="Таймер автоудаления"
                  >
                    <Timer className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className={`transition-colors ${showEmojiPicker ? 'text-cyan-400' : 'text-white/50 hover:text-white/70'}`}
                  >
                    <Smile className="w-5 h-5" />
                  </button>
                  {!isGroup && (
                    <button
                      onClick={() => setShowGiftCatalog(true)}
                      className="text-amber-400/70 hover:text-amber-400 transition-colors"
                      aria-label="Отправить подарок"
                    >
                      <span className="text-base leading-none">🎁</span>
                    </button>
                  )}
                  <button
                    onClick={() => setShowCreatePoll(true)}
                    className="text-white/50 hover:text-blue-400 transition-colors"
                    aria-label="Создать опрос"
                  >
                    <span className="text-base leading-none">📊</span>
                  </button>
                </div>
              </div>
              
              {/* Right button - Dynamic based on text and record mode */}
              {inputText.trim() ? (
                <div className="relative shrink-0">
                  <SendOptionsMenu
                    open={showSendOptions}
                    onClose={() => setShowSendOptions(false)}
                    onSend={() => void handleSendMessage(false)}
                    onSilent={() => void handleSendMessage(true)}
                    onSchedule={() => {
                      setPendingScheduleContent(inputText.trim());
                      setShowSchedulePicker(true);
                    }}
                  />
                  <button
                    onMouseDown={(e) => {
                      e.preventDefault();
                      sendButtonLongPressRef.current = setTimeout(() => {
                        sendButtonLongPressRef.current = null;
                        setShowSendOptions(true);
                      }, 500);
                    }}
                    onMouseUp={() => {
                      if (sendButtonLongPressRef.current) {
                        clearTimeout(sendButtonLongPressRef.current);
                        sendButtonLongPressRef.current = null;
                        void handleSendMessage(false);
                      }
                    }}
                    onMouseLeave={() => {
                      if (sendButtonLongPressRef.current) {
                        clearTimeout(sendButtonLongPressRef.current);
                        sendButtonLongPressRef.current = null;
                      }
                    }}
                    onTouchStart={(e) => {
                      e.preventDefault();
                      sendButtonLongPressRef.current = setTimeout(() => {
                        sendButtonLongPressRef.current = null;
                        setShowSendOptions(true);
                      }, 500);
                    }}
                    onTouchEnd={() => {
                      if (sendButtonLongPressRef.current) {
                        clearTimeout(sendButtonLongPressRef.current);
                        sendButtonLongPressRef.current = null;
                        void handleSendMessage(false);
                      }
                    }}
                    disabled={isSending}
                    className="w-12 h-12 rounded-full flex items-center justify-center transition-all"
                    style={{
                      background: isSilentSend
                        ? 'linear-gradient(135deg, #b45309 0%, #92400e 100%)'
                        : 'linear-gradient(135deg, #00A3B4 0%, #0066CC 50%, #00C896 100%)',
                      boxShadow: '0 0 25px rgba(0,163,180,0.5), 0 4px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.2)'
                    }}
                  >
                    <Send className="w-5 h-5 text-white" />
                  </button>
                </div>
              ) : (
                <button
                  onPointerDown={handleRecordButtonDown}
                  onPointerUp={handleRecordButtonUp}
                  onPointerCancel={handleRecordButtonUp}
                  onPointerLeave={handleRecordButtonLeave}
                  onContextMenu={(e) => e.preventDefault()}
                  className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 transition-all backdrop-blur-xl border border-cyan-400/30 select-none"
                  style={{
                    background: recordMode === 'video' 
                      ? 'linear-gradient(145deg, rgba(139,92,246,0.3) 0%, rgba(0,102,204,0.2) 100%)'
                      : 'linear-gradient(145deg, rgba(0,163,180,0.3) 0%, rgba(0,102,204,0.2) 100%)',
                    boxShadow: '0 0 20px rgba(0,163,180,0.3), inset 0 1px 0 rgba(255,255,255,0.15), 0 4px 20px rgba(0,0,0,0.3)'
                  }}
                >
                  {recordMode === 'voice' ? (
                    <Mic className="w-5 h-5 text-cyan-300" />
                  ) : (
                    <Video className="w-5 h-5 text-purple-300" />
                  )}
                </button>
              )}
            </div>
          )}
        </div>
        
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
              console.error('sendSticker error', e);
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
              console.error('sendGif error', e);
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
              console.error('sendGiftMessage error', e);
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
          } catch {
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
          } catch {
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
          } catch {
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
            });
            // attach poll_id via extra field
            (envelope as any).poll_id = pollId;
            try {
              await sendMessageV1({ conversationId, clientMsgId, body: envelope as any });
            } catch (e) {
              console.error('sendPoll error', e);
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
