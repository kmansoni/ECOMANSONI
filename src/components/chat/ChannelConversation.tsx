import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from "react";
import { FloatingDate, DateSeparator } from "./FloatingDate";
import { ScrollToBottomFab } from "./ScrollToBottomFab";
import { JumpToDatePicker } from "./JumpToDatePicker";
import {
  CheckCircle2,
  Eye,
  FileText,
  Pin,
  Share2,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { getHashtagBlockedToastPayload } from "@/lib/hashtagModeration";
import { getChatSendErrorToast } from "@/lib/chat/sendError";
import { diagnoseChannelSendReadiness } from "@/lib/chat/readiness";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VideoCircleMessage } from "@/components/chat/VideoCircleMessage";

import { useAuth } from "@/hooks/useAuth";
import { useMessageReactions } from "@/hooks/useMessageReactions";
import { MessageReactions } from "@/components/chat/MessageReactions";
import { MessageContextMenu } from "@/components/chat/MessageContextMenu";
import type { Channel, ChannelMessage } from "@/hooks/useChannels";
import { useChannelMessages, useJoinChannel } from "@/hooks/useChannels";
import { useChannelCapabilities } from "@/hooks/useChannelCapabilities";
import { useCommunityGlobalSettings, useCommunityInvites } from "@/hooks/useCommunityControls";
import { useChatOpen } from "@/contexts/ChatOpenContext";
import { GradientAvatar } from "@/components/ui/gradient-avatar";
import { supabase } from "@/lib/supabase";
import { useChannelUserSettings } from "@/hooks/useChannelUserSettings";
import { InviteQrDialog } from "@/components/chat/InviteQrDialog";
import { LinkPreview } from "@/components/chat/LinkPreview";

import { ChannelInfoDrawer } from "@/components/chat/ChannelInfoDrawer";
import { ChannelHeader } from "@/components/chat/ChannelHeader";
import { ChannelInputBar } from "@/components/chat/ChannelInputBar";
import { extractUrls } from "@/hooks/useLinkPreview";
import {
  getMentionSuggestions,
  useMentions,
  type MentionUser,
} from "@/hooks/useMentions";
import { fetchUserBriefMap, resolveUserBrief } from "@/lib/users/userBriefs";
import { logger } from "@/lib/logger";

interface ChannelConversationProps {
  channel: Channel;
  onBack: () => void;
  onLeave?: () => void;
}

const formatViews = (count: number): string => {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(".", ",")}K`;
  return String(count);
};

const isExpectedChannelMembersAccessError = (error: unknown): boolean => {
  const e = error as Record<string, unknown> | null;
  const code = String(e?.code ?? "");
  const status = Number(e?.status ?? 0);
  const message = String(e?.message ?? "").toLowerCase();
  const details = String(e?.details ?? "").toLowerCase();
  return (
    code === "42501" ||
    code === "42P01" ||
    code === "PGRST204" ||
    code === "PGRST205" ||
    status === 403 ||
    status === 404 ||
    (message.includes("channel_members") && (message.includes("permission") || message.includes("does not exist") || message.includes("schema cache"))) ||
    (details.includes("channel_members") && details.includes("schema cache"))
  );
};

export function ChannelConversation({ channel, onBack, onLeave }: ChannelConversationProps) {
  const { user } = useAuth();
  const { setIsChatOpen } = useChatOpen();
  const { messages, loading, sendMessage, sendMediaMessage, editChannelMessage } = useChannelMessages(channel.id);
  const { toggleReaction, getReactions } = useMessageReactions(channel.id);
  const { joinChannel, leaveChannel } = useJoinChannel();
  const { can, canRpc, role } = useChannelCapabilities(channel);
  const { settings } = useCommunityGlobalSettings();
  const { createChannelInvite } = useCommunityInvites();
  const {
    muted,
    settings: channelUserSettings,
    setMuted,
    muteForMs,
    muteUntil,
    disableNotifications,
    enableNotifications,
  } = useChannelUserSettings(channel.id);
  const [isMember, setIsMember] = useState(channel.is_member);
  const [draftPost, setDraftPost] = useState("");
  const [editingChannelMsg, setEditingChannelMsg] = useState<{ id: string; content: string } | null>(null);
  const [contextMenuChannelMsg, setContextMenuChannelMsg] = useState<{
    id: string;
    content: string;
    isOwn: boolean;
    position: { top: number; left: number; width: number };
  } | null>(null);
  const longPressChannelRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [sendingPost, setSendingPost] = useState(false);
  const [showAttachmentSheet, setShowAttachmentSheet] = useState(false);
  const [showCameraSheet, setShowCameraSheet] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [notifySubscribers, setNotifySubscribers] = useState<boolean>(() => {
    try {
      return localStorage.getItem(`channel.notify.${channel.id}`) !== "0";
    } catch (error) {
      logger.debug("[ChannelConversation] Failed to read notify preference", { channelId: channel.id, error });
      return true;
    }
  });
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [recordMode, setRecordMode] = useState<"voice" | "video">("voice");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const recordingTimeRef = useRef(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<number | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const holdStartedRef = useRef(false);
  const isHoldingRef = useRef(false);
  const recordingMimeTypeRef = useRef<string | null>(null);
  const [showVideoRecorder, setShowVideoRecorder] = useState(false);
  const [showSendOptions, setShowSendOptions] = useState(false);
  // @Mention state
  const [mentionParticipants, setMentionParticipants] = useState<MentionUser[]>([]);
  const [mentionTrigger, setMentionTrigger] = useState<{ query: string; triggerStart: number } | null>(null);
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
  const mentionSuggestions = useMemo(
    () => mentionTrigger ? getMentionSuggestions(mentionTrigger.query, mentionParticipants) : [],
    [mentionTrigger, mentionParticipants]
  );
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  // UI-1: floating date state
  const [floatingDate, setFloatingDate] = useState<Date | null>(null);
  // UI-6: jump to date picker
  const [showJumpToPicker, setShowJumpToPicker] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const liveStorageKey = useMemo(() => `channel.live_mode.${channel.id}`, [channel.id]);
  const [liveMode, setLiveMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(`channel.live_mode.${channel.id}`) === "1";
    } catch (error) {
      logger.debug("[ChannelConversation] Failed to read live mode", { channelId: channel.id, error });
      return false;
    }
  });
  const [infoOpen, setInfoOpen] = useState(false);
  const [infoView, setInfoView] = useState<"main" | "admins" | "subscribers" | "settings" | "more">("main");
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [subsLoading, setSubsLoading] = useState(false);
  const [admins, setAdmins] = useState<Array<{ user_id: string; display_name: string | null; avatar_url: string | null; role: string }>>([]);
  const [subscribers, setSubscribers] = useState<Array<{ user_id: string; display_name: string | null; avatar_url: string | null; role: string }>>([]);
  const [autoDeleteSecondsLocal, setAutoDeleteSecondsLocal] = useState<number | null>(() => {
    const v = Number(channel?.auto_delete_seconds);
    return Number.isFinite(v) ? v : null;
  });
  const [autoDeleteLoading, setAutoDeleteLoading] = useState(false);
  const [pinnedMessageId, setPinnedMessageId] = useState<string | null>(null);
  const [pinnedLoaded, setPinnedLoaded] = useState(false);
  const [inviteQrOpen, setInviteQrOpen] = useState(false);
  const [inviteQrUrl, setInviteQrUrl] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const canCreatePosts = isMember && can("channel.posts.create");
  const canInvite = isMember && can("channel.members.invite") && (settings?.allow_channel_invites ?? true);
  const canDeletePostsAny = isMember && (can("channel.posts.delete") || role === "owner" || role === "admin");
  const canUpdateSettings = isMember && (can("channel.settings.update") || role === "owner" || role === "admin");
  const canManageMembers = isMember && (can("channel.members.manage") || role === "owner" || role === "admin");
  const canPinPosts = canUpdateSettings;

  useEffect(() => {
    recordingTimeRef.current = recordingTime;
  }, [recordingTime]);

  // ─── Load channel member participants for @mentions ────────────────────────
  useEffect(() => {
    if (!channel.id || !user || !canCreatePosts) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data: memberRows } = await supabase
          .from("channel_members")
          .select("user_id")
          .eq("channel_id", channel.id)
          .limit(200);
        const ids = (memberRows ?? []).map((r) => r.user_id).filter(Boolean);
        if (!ids.length) return;
        const briefMap = await fetchUserBriefMap(ids);
        if (cancelled) return;
        setMentionParticipants(
          ids
            .map((memberId) => {
              const brief = resolveUserBrief(memberId, briefMap);
              if (!brief) return null;
              return {
                user_id: memberId,
                display_name: brief.display_name,
                username: brief.username,
                avatar_url: brief.avatar_url,
              } as MentionUser;
            })
            .filter(Boolean) as MentionUser[]
        );
      } catch (error) {
        if (isExpectedChannelMembersAccessError(error)) {
          logger.debug("[ChannelConversation] Mention participants unavailable for current user", { channelId: channel.id, error });
        } else {
          logger.warn("[ChannelConversation] Failed to load mention participants", { channelId: channel.id, error });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [channel.id, user, canCreatePosts]);

  const { renderText } = useMentions(mentionParticipants);

  useEffect(() => {
    if (!channel.id) {
      setPinnedMessageId(null);
      setPinnedLoaded(true);
      return;
    }

    let cancelled = false;
    const loadPinned = async () => {
      try {
        const { data, error } = await supabase
          .from("channel_pins")
          .select("message_id")
          .eq("channel_id", channel.id)
          .maybeSingle();
        if (error) throw error;
        if (cancelled) return;
        setPinnedMessageId(data?.message_id ? String(data.message_id) : null);
      } catch (error) {
        if (cancelled) return;
        logger.warn("[ChannelConversation] Failed to load pinned message", { channelId: channel.id, error });
        setPinnedMessageId(null);
      } finally {
        if (!cancelled) setPinnedLoaded(true);
      }
    };

    void loadPinned();

    const channelPins = supabase
      .channel(`channel-pins:${channel.id}`)
      .on(
        "postgres_changes" as any,
        {
          schema: "public",
          table: "channel_pins",
          filter: `channel_id=eq.${channel.id}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            setPinnedMessageId(null);
            return;
          }
          const next = (payload.new as Record<string, unknown>)?.message_id;
          setPinnedMessageId(next ? String(next) : null);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channelPins);
    };
  }, [channel.id]);

  useEffect(() => {
    try {
      localStorage.setItem(`channel.notify.${channel.id}`, notifySubscribers ? "1" : "0");
    } catch (error) {
      logger.debug("[ChannelConversation] Failed to persist notify preference", { channelId: channel.id, error });
    }
  }, [channel.id, notifySubscribers]);

  const silentPublish = !notifySubscribers;

  const formatDuration = (seconds: number) => {
    const s = Math.max(0, Math.floor(Number(seconds) || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, "0")}`;
  };

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const preferredTypes = [
        "audio/mp4",
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
      ];
      const mimeType = preferredTypes.find((t) => MediaRecorder.isTypeSupported(t)) || "";
      recordingMimeTypeRef.current = mimeType || null;

      const mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      if (recordingIntervalRef.current) window.clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = window.setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      logger.error("[ChannelConversation] Failed to start voice recording", { channelId: channel.id, error: err });
      toast.error("Не удалось начать запись");
    }
  };

  const cancelVoiceRecording = () => {
    if (recordingIntervalRef.current) {
      window.clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
      mediaRecorderRef.current = null;
    }
    audioChunksRef.current = [];
    setIsRecording(false);
    setRecordingTime(0);
  };

  const stopVoiceRecordingAndSend = async () => {
    if (!mediaRecorderRef.current || !isRecording) return;
    const duration = recordingTimeRef.current;

    const mr = mediaRecorderRef.current;
    return new Promise<void>((resolve) => {
      mr.onstop = async () => {
        try {
          const mimeType = recordingMimeTypeRef.current || mr.mimeType || "audio/webm";
          const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
          const ext = mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm";
          const file = new File([audioBlob], `voice_${Date.now()}.${ext}`, { type: mimeType });

          if (duration >= 1) {
            await sendMediaMessage(file, "voice", { durationSeconds: duration, silent: silentPublish });
          }
        } catch (e) {
          logger.error("[ChannelConversation] Failed to send voice", { channelId: channel.id, error: e });
          toast.error("Не удалось отправить голосовое");
        } finally {
          if (recordingIntervalRef.current) {
            window.clearInterval(recordingIntervalRef.current);
            recordingIntervalRef.current = null;
          }
          mr.stream.getTracks().forEach((t) => t.stop());
          mediaRecorderRef.current = null;
          audioChunksRef.current = [];
          setIsRecording(false);
          setRecordingTime(0);
          resolve();
        }
      };

      mr.stop();
    });
  };

  const handleVideoRecord = async (videoBlob: Blob, duration: number) => {
    try {
      const file = new File([videoBlob], `video_circle_${Date.now()}.webm`, { type: "video/webm" });
      await sendMediaMessage(file, "video_circle", { durationSeconds: duration, silent: silentPublish });
    } catch (e) {
      logger.error("[ChannelConversation] Failed to send video circle", { channelId: channel.id, error: e });
      toast.error("Не удалось отправить видео-кружок");
    } finally {
      setShowVideoRecorder(false);
    }
  };

  const handleRecordButtonDown = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    if (!canCreatePosts || sendingPost) return;

    isHoldingRef.current = false;
    holdStartedRef.current = true;

    if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = window.setTimeout(() => {
      isHoldingRef.current = true;
      if (recordMode === "voice") {
        void startVoiceRecording();
      } else {
        setShowVideoRecorder(true);
      }
    }, 200);
  };

  const handleRecordButtonUp = () => {
    if (!holdStartedRef.current) return;
    holdStartedRef.current = false;

    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }

    if (isHoldingRef.current) {
      if (recordMode === "voice" && isRecording) {
        void stopVoiceRecordingAndSend();
      }
    } else {
      setRecordMode((prev) => (prev === "voice" ? "video" : "voice"));
    }

    isHoldingRef.current = false;
  };

  const handleRecordButtonLeave = () => {
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const notificationsEnabled = channelUserSettings?.notifications_enabled ?? true;
  const mutedUntil = channelUserSettings?.muted_until ?? null;
  const mutedForever = mutedUntil === "infinity";
  const mutedUntilTs = mutedUntil && mutedUntil !== "infinity" ? Date.parse(mutedUntil) : NaN;
  const mutedByTime = Number.isFinite(mutedUntilTs) && mutedUntilTs > Date.now();
  const notificationsDisabled = notificationsEnabled === false;

  const openInfo = () => {
    setInfoView("main");
    setInfoOpen(true);
  };

  const setLiveModePersisted = (next: boolean) => {
    setLiveMode(next);
    try {
      localStorage.setItem(liveStorageKey, next ? "1" : "0");
    } catch (error) {
      logger.debug("[ChannelConversation] Failed to persist live mode", { channelId: channel.id, next, error });
    }
  };

  const toggleLive = () => {
    setLiveModePersisted(!liveMode);
    if (!liveMode) {
      // enabling
      setTimeout(() => scrollToBottom(), 0);
      toast.success("Live режим включён");
    } else {
      toast.message("Live режим выключен");
    }
  };

  const closeInfo = () => {
    setInfoOpen(false);
    setInfoView("main");
  };

  const loadAdmins = useCallback(async () => {
    setAdminsLoading(true);
    try {
      const { data: rows, error } = await supabase
        .from("channel_members")
        .select("user_id, role")
        .eq("channel_id", channel.id)
        .in("role", ["admin"])
        .limit(200);
      if (error) throw error;

      const adminIds = new Set<string>();
      if (channel.owner_id) adminIds.add(String(channel.owner_id));
      for (const r of (rows ?? [])) {
        if (r?.user_id) adminIds.add(String(r.user_id));
      }

      const ids = Array.from(adminIds);
      const briefMap = await fetchUserBriefMap(ids);

      const out = ids.map((id) => ({
        user_id: id,
        display_name: resolveUserBrief(id, briefMap)?.display_name ?? null,
        avatar_url: resolveUserBrief(id, briefMap)?.avatar_url ?? null,
        role: id === String(channel.owner_id) ? "owner" : "admin",
      }));
      setAdmins(out);
    } catch (e) {
      if (isExpectedChannelMembersAccessError(e)) {
        logger.debug("[ChannelConversation] Admin list unavailable for current user", { channelId: channel.id, error: e });
      } else {
        logger.error("[ChannelConversation] Failed to load admins", { channelId: channel.id, error: e });
        toast.error("Не удалось загрузить администраторов");
      }
      setAdmins([]);
    } finally {
      setAdminsLoading(false);
    }
  }, [channel.id, channel.owner_id]);

  const loadSubscribers = useCallback(async () => {
    setSubsLoading(true);
    try {
      const { data: rows, error } = await supabase
        .from("channel_members")
        .select("user_id, role")
        .eq("channel_id", channel.id)
        .limit(200);
      if (error) throw error;

      const ids = Array.from(
        new Set(
          (rows || [])
            .map((r) => String(r?.user_id || ""))
            .filter((x) => x.length > 0),
        ),
      );
      if (ids.length === 0) {
        setSubscribers([]);
        return;
      }

      const briefMap = await fetchUserBriefMap(ids);

      const roleById: Record<string, string> = {};
      (rows || []).forEach((r) => {
        if (!r?.user_id) return;
        roleById[String(r.user_id)] = String(r?.role ?? "member");
      });

      setSubscribers(
        ids.map((id) => ({
          user_id: id,
          display_name: resolveUserBrief(id, briefMap)?.display_name ?? null,
          avatar_url: resolveUserBrief(id, briefMap)?.avatar_url ?? null,
          role: roleById[id] || "member",
        })),
      );
    } catch (e) {
      if (isExpectedChannelMembersAccessError(e)) {
        logger.debug("[ChannelConversation] Subscribers list unavailable for current user", { channelId: channel.id, error: e });
      } else {
        logger.error("[ChannelConversation] Failed to load subscribers", { channelId: channel.id, error: e });
        toast.error("Не удалось загрузить подписчиков");
      }
      setSubscribers([]);
    } finally {
      setSubsLoading(false);
    }
  }, [channel.id]);

  useEffect(() => {
    if (!infoOpen) return;
    if (infoView === "admins" && admins.length === 0 && !adminsLoading) {
      void loadAdmins();
    }
    if (infoView === "subscribers" && subscribers.length === 0 && !subsLoading) {
      void loadSubscribers();
    }
  }, [admins.length, adminsLoading, infoOpen, infoView, loadAdmins, loadSubscribers, subscribers.length, subsLoading]);

  const loadAutoDeleteSeconds = useCallback(async () => {
    setAutoDeleteLoading(true);
    try {
      const { data, error } = await supabase
        .from("channels")
        .select("auto_delete_seconds")
        .eq("id", channel.id)
        .maybeSingle();
      if (error) throw error;
      const v = Number(data?.auto_delete_seconds ?? 0) || 0;
      setAutoDeleteSecondsLocal(v);
    } catch (e) {
      logger.warn("[ChannelConversation] loadAutoDeleteSeconds failed", { channelId: channel.id, error: e });
    } finally {
      setAutoDeleteLoading(false);
    }
  }, [channel.id]);

  useEffect(() => {
    if (!infoOpen) return;
    void loadAutoDeleteSeconds();
  }, [infoOpen, loadAutoDeleteSeconds]);

  const messageById = useMemo(() => {
    const m = new Map<string, ChannelMessage>();
    for (const msg of messages) {
      if (!msg?.id) continue;
      m.set(String(msg.id), msg);
    }
    return m;
  }, [messages]);
  const pinnedMessage = useMemo(
    () => (pinnedMessageId ? messages.find((m) => String(m?.id) === pinnedMessageId) ?? null : null),
    [messages, pinnedMessageId],
  );

  const canDeleteSelected = useMemo(() => {
    if (!isMember) return false;
    if (selectedIds.size === 0) return false;
    if (canDeletePostsAny) return true;
    if (!user?.id) return false;
    // Allow deleting own selected posts even without extra capabilities.
    for (const id of selectedIds) {
      const msg = messageById.get(String(id));
      if (!msg) return false;
      if (String(msg.sender_id) !== String(user.id)) return false;
    }
    return true;
  }, [canDeletePostsAny, isMember, messageById, selectedIds, user?.id]);

  const autoDeleteSeconds = Number((autoDeleteSecondsLocal ?? channel?.auto_delete_seconds ?? 0)) || 0;

  const autoDeleteRadioValue = useMemo(() => {
    const known = new Set([0, 24 * 60 * 60, 7 * 24 * 60 * 60, 30 * 24 * 60 * 60]);
    return known.has(autoDeleteSeconds) ? String(autoDeleteSeconds) : "custom";
  }, [autoDeleteSeconds]);

  useEffect(() => {
    setIsChatOpen(true);
    return () => setIsChatOpen(false);
  }, [setIsChatOpen]);

  useEffect(() => {
    if (liveMode || isAtBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [isAtBottom, liveMode, messages]);

  useEffect(() => {
    if (!selectMode) {
      setSelectedIds(new Set());
    }
  }, [selectMode]);

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const atBottom = distanceFromBottom <= 80;
    setIsAtBottom(atBottom);
    setShowScrollDown(distanceFromBottom > 200);

    // If user scrolls away from bottom, pause live-follow.
    if (!atBottom && liveMode) {
      setLiveModePersisted(false);
    }

    // UI-1: update floating date from topmost visible date separator
    const separators = container.querySelectorAll<HTMLElement>("[data-date-id]");
    let topmost: { el: HTMLElement; top: number } | null = null;
    separators.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const cRect = container.getBoundingClientRect();
      if (rect.top <= cRect.top + 4) {
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

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  const scrollToChannelMessage = (messageId: string) => {
    const el = document.getElementById(`channel-msg-${messageId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const unpinChannelMessage = async () => {
    if (!canPinPosts) return;
    try {
      const { error } = await supabase
        .from("channel_pins")
        .delete()
        .eq("channel_id", channel.id);
      if (error) throw error;
      setPinnedMessageId(null);
      toast.success("Закрепление снято");
    } catch (e) {
      logger.error("[ChannelConversation] Failed to unpin message", { channelId: channel.id, error: e });
      toast.error("Не удалось снять закрепление");
    }
  };

  const pinChannelMessage = async (messageId: string) => {
    if (!canPinPosts || !user?.id) {
      toast.error("Недостаточно прав для закрепления");
      return;
    }
    try {
      if (pinnedMessageId === messageId) {
        await unpinChannelMessage();
        return;
      }

      const { error } = await supabase
        .from("channel_pins")
        .upsert(
          {
            channel_id: channel.id,
            message_id: messageId,
            pinned_by: user.id,
            pinned_at: new Date().toISOString(),
          },
          { onConflict: "channel_id" },
        );
      if (error) throw error;
      setPinnedMessageId(messageId);
      toast.success("Сообщение закреплено");
    } catch (e) {
      logger.error("[ChannelConversation] Failed to pin message", { channelId: channel.id, messageId, error: e });
      toast.error("Не удалось закрепить сообщение");
    }
  };

  const handleJoin = async () => {
    const success = await joinChannel(channel.id);
    if (success) {
      setIsMember(true);
      toast.success("Вы подписались на канал");
    } else {
      toast.error("Не удалось подписаться");
    }
  };

  const handleLeave = async () => {
    const success = await leaveChannel(channel.id);
    if (success) {
      setIsMember(false);
      toast.success("Вы отписались от канала");
      onLeave?.();
    } else {
      toast.error("Не удалось отписаться");
    }
  };

  const handlePublishPost = async () => {
    const text = draftPost.trim();
    if (!text || !user) return;

    // ── Edit mode ────────────────────────────────────────────────────────────
    if (editingChannelMsg) {
      const editing = editingChannelMsg;
      setEditingChannelMsg(null);
      setDraftPost("");
      const result = await editChannelMessage(editing.id, text);
      if (result?.error) {
        toast.error("Не удалось отредактировать пост. Попробуйте снова.");
        setEditingChannelMsg(editing);
        setDraftPost(text);
      }
      return;
    }

    try {
      setSendingPost(true);
      const allowedByRpc = await canRpc("channel.posts.create");
      if (!allowedByRpc) {
        toast.error("Недостаточно прав для публикации");
        return;
      }

      await sendMessage(text, { silent: silentPublish });
      setDraftPost("");
      toast.success("Пост опубликован");
    } catch (err) {
      logger.error("[ChannelConversation] Failed to publish post", { channelId: channel.id, error: err });
      const payload = getHashtagBlockedToastPayload(err);
      if (payload) toast.error(payload.title, { description: payload.description });
      else {
        const sendPayload = getChatSendErrorToast(err);
        if (sendPayload) toast.error(sendPayload.title, { description: sendPayload.description });
        else {
          const diagnostic = await diagnoseChannelSendReadiness({
            supabase,
            userId: user?.id,
            channelId: channel?.id,
          });
          toast.error("Не удалось опубликовать пост", { description: diagnostic ?? undefined });
        }
      }
    } finally {
      setSendingPost(false);
    }
  };

  const handleAttachment = async (file: File, type: "image" | "video" | "document") => {
    if (!user) return;
    if (!canCreatePosts) {
      toast.error("Для публикации нужны права");
      return;
    }

    try {
      setSendingPost(true);
      const allowedByRpc = await canRpc("channel.posts.create");
      if (!allowedByRpc) {
        toast.error("Недостаточно прав для публикации");
        return;
      }

      await sendMediaMessage(file, type, { silent: silentPublish });
      toast.success(type === "document" ? "Документ отправлен" : "Медиа опубликовано");
    } catch (e) {
      logger.error("[ChannelConversation] Failed to send channel media", { channelId: channel.id, type, error: e });
      toast.error("Не удалось отправить вложение");
    } finally {
      setSendingPost(false);
    }
  };

  const sendSticker = async (sticker: string) => {
    if (!canCreatePosts || sendingPost) return;
    try {
      setSendingPost(true);
      const allowedByRpc = await canRpc("channel.posts.create");
      if (!allowedByRpc) {
        toast.error("Недостаточно прав для публикации");
        return;
      }
      await sendMessage(sticker, { silent: silentPublish });
      setShowStickerPicker(false);
    } catch (e) {
      logger.error("[ChannelConversation] Failed to send sticker", { channelId: channel.id, error: e });
      toast.error("Не удалось отправить стикер");
    } finally {
      setSendingPost(false);
    }
  };

  const createChannelInviteUrl = async () => {
    if (!canInvite) {
      toast.error("Приглашения отключены настройками или правами");
      return null;
    }
    const token = await createChannelInvite(channel.id);
    return `https://mansoni.ru/chats?channel_invite=${token}`;
  };

  const handleCreateInvite = async () => {
    try {
      const url = await createChannelInviteUrl();
      if (!url) return;
      await navigator.clipboard.writeText(url);
      toast.success("Ссылка-приглашение скопирована");
    } catch (err) {
      logger.error("[ChannelConversation] Failed to create channel invite", { channelId: channel.id, error: err });
      toast.error("Не удалось создать приглашение");
    }
  };

  const handleShowInviteQr = async () => {
    try {
      const url = await createChannelInviteUrl();
      if (!url) return;
      setInviteQrUrl(url);
      setInviteQrOpen(true);
    } catch (err) {
      logger.error("[ChannelConversation] Failed to prepare channel invite QR", { channelId: channel.id, error: err });
      toast.error("Не удалось подготовить QR-приглашение");
    }
  };

  const setAutoDeleteSeconds = async (seconds: number) => {
    if (!canUpdateSettings) {
      toast.error("Недостаточно прав для изменения настроек");
      return;
    }
    try {
      const v = Math.max(0, Math.min(Number(seconds) || 0, 31_536_000));
      const updatePayload = { auto_delete_seconds: v, updated_at: new Date().toISOString() };
      const { error } = await supabase
        .from("channels")
        .update(updatePayload)
        .eq("id", channel.id);
      if (error) throw error;
      toast.success("Автоудаление обновлено");
      setAutoDeleteSecondsLocal(v);
    } catch (e) {
      logger.error("[ChannelConversation] Failed to update auto-delete", { channelId: channel.id, seconds, error: e });
      toast.error("Не удалось обновить автоудаление");
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deleteSelected = async () => {
    if (!canDeleteSelected) {
      toast.error("Недостаточно прав для удаления");
      return;
    }
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      const { error } = await supabase.from("channel_messages").delete().in("id", ids);
      if (error) throw error;
      toast.success("Удалено");
      setSelectedIds(new Set());
      setSelectMode(false);
    } catch (e) {
      logger.error("[ChannelConversation] Bulk delete failed", { channelId: channel.id, selectedCount: ids.length, error: e });
      toast.error("Не удалось удалить сообщения");
    }
  };

  const deleteChannel = async () => {
    if (role !== "owner") {
      toast.error("Удалить канал может только владелец");
      return;
    }
    const ok = window.confirm("Удалить канал? Это действие необратимо.");
    if (!ok) return;
    try {
      const { error } = await supabase.from("channels").delete().eq("id", channel.id);
      if (error) throw error;
      toast.success("Канал удалён");
      onLeave?.();
      onBack();
    } catch (e) {
      logger.error("[ChannelConversation] Delete channel failed", { channelId: channel.id, error: e });
      toast.error("Не удалось удалить канал");
    }
  };

  const updateMemberRole = async (userId: string, nextRole: "admin" | "member") => {
    if (!canManageMembers) {
      toast.error("Недостаточно прав");
      return;
    }
    if (!userId) return;
    if (String(userId) === String(channel.owner_id)) {
      toast.error("Нельзя изменить роль владельца");
      return;
    }
    try {
      const { error } = await supabase
        .from("channel_members")
        .update({ role: nextRole })
        .eq("channel_id", channel.id)
        .eq("user_id", userId);
      if (error) throw error;
      toast.success(nextRole === "admin" ? "Назначен администратор" : "Роль обновлена");
      await Promise.all([loadAdmins(), loadSubscribers()]);
    } catch (e) {
      logger.error("[ChannelConversation] updateMemberRole failed", { channelId: channel.id, userId, nextRole, error: e });
      toast.error("Не удалось обновить роль");
    }
  };

  const removeMember = async (userId: string) => {
    if (!isMember) return;
    if (!userId) return;
    if (String(userId) === String(channel.owner_id)) {
      toast.error("Нельзя удалить владельца");
      return;
    }

    if (String(userId) === String(user?.id)) {
      await handleLeave();
      return;
    }

    if (!canManageMembers) {
      toast.error("Недостаточно прав");
      return;
    }

    const ok = window.confirm("Удалить участника из канала?");
    if (!ok) return;

    try {
      const { error } = await supabase
        .from("channel_members")
        .delete()
        .eq("channel_id", channel.id)
        .eq("user_id", userId);
      if (error) throw error;
      toast.success("Участник удалён");
      await Promise.all([loadAdmins(), loadSubscribers()]);
    } catch (e) {
      logger.error("[ChannelConversation] removeMember failed", { channelId: channel.id, userId, error: e });
      toast.error("Не удалось удалить участника");
    }
  };

  const formatTime = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "HH:mm");
    } catch (_error) {
      return "";
    }
  };

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const visibleMessages =
    normalizedQuery.length === 0
      ? messages
      : messages.filter((m) => (m.content || "").toLowerCase().includes(normalizedQuery));

  const renderHighlightedText = (text: string) => {
    if (!normalizedQuery) return text;
    const lowerText = text.toLowerCase();
    const idx = lowerText.indexOf(normalizedQuery);
    if (idx === -1) return text;

    const before = text.slice(0, idx);
    const match = text.slice(idx, idx + normalizedQuery.length);
    const after = text.slice(idx + normalizedQuery.length);
    return (
      <>
        {before}
        <mark className="rounded px-0.5 bg-primary/20 text-foreground">{match}</mark>
        {after}
      </>
    );
  };

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-background">
      <ChannelHeader
        channel={channel}
        onBack={onBack}
        openInfo={openInfo}
        liveMode={liveMode}
        setSearchOpen={setSearchOpen}
        isMember={isMember}
        handleLeave={handleLeave}
        handleJoin={handleJoin}
        muted={muted}
        setMuted={setMuted}
        canUpdateSettings={canUpdateSettings}
        canInvite={canInvite}
        role={role}
        autoDeleteRadioValue={autoDeleteRadioValue}
        autoDeleteSeconds={autoDeleteSeconds}
        setAutoDeleteSeconds={setAutoDeleteSeconds}
        toggleLive={toggleLive}
        selectMode={selectMode}
        setSelectMode={setSelectMode}
        handleCreateInvite={handleCreateInvite}
        handleShowInviteQr={handleShowInviteQr}
        deleteChannel={deleteChannel}
      />

      <ChannelInfoDrawer
        channel={channel}
        infoOpen={infoOpen}
        infoView={infoView}
        setInfoView={setInfoView}
        closeInfo={closeInfo}
        liveMode={liveMode}
        toggleLive={toggleLive}
        muted={muted}
        setMuted={setMuted}
        muteForMs={muteForMs}
        muteUntil={muteUntil}
        notificationsDisabled={notificationsDisabled}
        enableNotifications={enableNotifications}
        disableNotifications={disableNotifications}
        isMember={isMember}
        role={role}
        handleLeave={handleLeave}
        handleJoin={handleJoin}
        canUpdateSettings={canUpdateSettings}
        canManageMembers={canManageMembers}
        canInvite={canInvite}
        admins={admins}
        subscribers={subscribers}
        adminsLoading={adminsLoading}
        subsLoading={subsLoading}
        loadAdmins={loadAdmins}
        loadSubscribers={loadSubscribers}
        updateMemberRole={updateMemberRole}
        removeMember={removeMember}
        autoDeleteSeconds={autoDeleteSeconds}
        autoDeleteRadioValue={autoDeleteRadioValue}
        autoDeleteLoading={autoDeleteLoading}
        setAutoDeleteSeconds={setAutoDeleteSeconds}
        handleCreateInvite={handleCreateInvite}
        deleteChannel={deleteChannel}
        setSearchOpen={setSearchOpen}
        setSearchQuery={setSearchQuery}
        setSelectMode={setSelectMode}
      />

      {searchOpen ? (
        <div className="flex-shrink-0 px-3 py-2 bg-background/95 backdrop-blur-sm border-b border-border relative z-10">
          <div className="relative">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по сообщениям канала"
              className="h-10 rounded-full pr-10"
              autoFocus
            />
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSearchOpen(false);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
              aria-label="Закрыть поиск"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : null}
      {pinnedLoaded && pinnedMessageId ? (
        <div className="flex-shrink-0 bg-background/95 backdrop-blur-sm border-b border-border relative z-10">
          <div className="flex items-center justify-between px-3 py-2">
            <button
              type="button"
              className="flex items-center gap-2 flex-1 min-w-0 text-left hover:bg-muted/40 rounded-lg px-1.5 py-1"
              onClick={() => scrollToChannelMessage(pinnedMessageId)}
            >
              <div className="w-0.5 h-8 bg-primary rounded-full flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-foreground truncate">Закрепленное сообщение</p>
                <p className="text-xs text-muted-foreground truncate">
                  {(String(pinnedMessage?.content || "").trim() || "Сообщение недоступно")}
                </p>
              </div>
            </button>
            {canPinPosts ? (
              <button
                type="button"
                onClick={() => void unpinChannelMessage()}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40"
                aria-label="Снять закрепление"
              >
                <X className="w-4 h-4" />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {selectMode ? (
        <div className="flex-shrink-0 px-3 py-2 border-b border-border bg-background/95 backdrop-blur-sm flex items-center justify-between">
          <div className="text-sm text-foreground flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
            Выбрано: {selectedIds.size}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectMode(false)}>
              Отмена
            </Button>
            <Button size="sm" variant="destructive" onClick={deleteSelected} disabled={!canDeleteSelected}>
              Удалить
            </Button>
          </div>
        </div>
      ) : null}

      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-3 space-y-3 relative z-10"
      >
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        )}

        {!loading && !normalizedQuery && visibleMessages.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <p>Пока нет публикаций</p>
          </div>
        )}

        {!loading && normalizedQuery && visibleMessages.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <p>Ничего не найдено</p>
          </div>
        )}

        {visibleMessages.map((msg, index) => {
          // UI-1: date separator between messages of different calendar days
          const msgDate = new Date(msg.created_at);
          const prevMsg = index > 0 ? visibleMessages[index - 1] : null;
          const prevMsgDate = prevMsg ? new Date(prevMsg.created_at) : null;
          const showDateSep = !prevMsgDate ||
            msgDate.getFullYear() !== prevMsgDate.getFullYear() ||
            msgDate.getMonth() !== prevMsgDate.getMonth() ||
            msgDate.getDate() !== prevMsgDate.getDate();
          const dateSepId = `${msgDate.getFullYear()}-${String(msgDate.getMonth() + 1).padStart(2, "0")}-${String(msgDate.getDate()).padStart(2, "0")}`;

          const viewCount = Number.isFinite(msg.views_count) ? Number(msg.views_count) : 0;
          const postReactions: Array<{ emoji: string; count: number }> = Array.isArray(msg.reactions)
            ? msg.reactions
                .filter((r) => r && typeof r.emoji === "string" && Number.isFinite(r.count))
                .map((r) => ({ emoji: String(r.emoji), count: Number(r.count) }))
            : [];

          const isOwnMsg = String(msg.sender_id) === String(user?.id);
          const liveReactions = getReactions(msg.id);

          return (
            <Fragment key={msg.id}>
            {showDateSep && <DateSeparator date={msgDate} id={dateSepId} />}
            <div id={`channel-msg-${msg.id}`} className="flex flex-col gap-1">
              <div
                className={`bg-card rounded-2xl overflow-hidden border ${
                  selectMode && selectedIds.has(msg.id) ? "border-primary" : "border-border/60"
                }`}
                onClick={() => {
                  if (!selectMode) return;
                  toggleSelect(msg.id);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setContextMenuChannelMsg({
                    id: msg.id,
                    content: msg.content || "",
                    isOwn: isOwnMsg,
                    position: { top: rect.top, left: rect.left, width: rect.width },
                  });
                }}
                onTouchStart={(e) => {
                  const el = e.currentTarget as HTMLElement;
                  const rect = el.getBoundingClientRect();
                  longPressChannelRef.current = setTimeout(() => {
                    setContextMenuChannelMsg({
                      id: msg.id,
                      content: msg.content || "",
                      isOwn: isOwnMsg,
                      position: { top: rect.top, left: rect.left, width: rect.width },
                    });
                  }, 500);
                }}
                onTouchEnd={() => {
                  if (longPressChannelRef.current) {
                    clearTimeout(longPressChannelRef.current);
                    longPressChannelRef.current = null;
                  }
                }}
                role={selectMode ? "button" : undefined}
                aria-label={selectMode ? "Выбрать сообщение" : undefined}
              >
              <div className="flex items-center gap-2 px-3 pt-3 pb-2">
                <GradientAvatar
                  name={channel.name}
                  seed={channel.id}
                  avatarUrl={channel.avatar_url}
                  size="sm"
                  className="w-8 h-8 text-xs border-border/60"
                />
                <div className="flex-1 min-w-0">
                  <span className="text-primary font-medium text-sm">{channel.name}</span>
                </div>
              </div>

              {msg.media_url ? (
                <div className="relative">
                  {String(msg.media_type || "image") === "video_circle" ? (
                    <div className="px-3 pb-3">
                      <VideoCircleMessage
                        videoUrl={msg.media_url}
                        duration={String(msg.duration_seconds || 0)}
                        isOwn={String(msg.sender_id) === String(user?.id)}
                      />
                    </div>
                  ) : String(msg.media_type || "image") === "voice" ? (
                    <div className="px-3 pb-3">
                      <audio controls src={msg.media_url} className="w-full" />
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {Number(msg.duration_seconds) ? formatDuration(Number(msg.duration_seconds)) : ""}
                      </div>
                    </div>
                  ) : String(msg.media_type || "image") === "video" ? (
                    <div className="media-frame media-frame--channel">
                      <video
                        src={msg.media_url}
                        controls
                        className="media-object media-object--fill"
                        playsInline
                      />
                    </div>
                  ) : String(msg.media_type || "image") === "document" ? (
                    <a
                      href={msg.media_url}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full px-3 py-3 flex items-center gap-2 hover:bg-muted/40"
                    >
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-foreground">Открыть документ</span>
                    </a>
                  ) : (
                    <button
                      type="button"
                      className="w-full"
                      onClick={() => setViewingImage(msg.media_url || null)}
                      aria-label="Открыть изображение"
                    >
                      <div className="media-frame media-frame--channel">
                        <img src={msg.media_url} alt="" className="media-object media-object--fill" />
                      </div>
                    </button>
                  )}
                </div>
              ) : null}

              <div className="px-3 py-2">
                <p className="text-foreground text-[15px] leading-relaxed whitespace-pre-wrap break-words">
                  {renderText(msg.content || "", user?.id)}
                </p>
                {/* Link Preview — max 1 per post */}
                {(() => {
                  const urls = extractUrls(msg.content || "");
                  return urls.length > 0 ? (
                    <LinkPreview key={urls[0]} url={urls[0]} enabled />
                  ) : null;
                })()}
              </div>

              {/* Live reactions from DB */}
              {liveReactions.length > 0 && (
                <div className="px-3 pb-1">
                  <MessageReactions
                    messageId={msg.id}
                    reactions={liveReactions}
                    showPicker={false}
                    onPickerClose={() => {}}
                    onReactionChange={() => {}}
                    onToggle={(mid, emoji) => toggleReaction(mid, emoji)}
                  />
                </div>
              )}
              {/* Fallback static reactions from message payload */}
              {liveReactions.length === 0 && postReactions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-3 py-2">
                  {postReactions.map((reaction, i) => (
                    <button
                      key={`${msg.id}-${i}`}
                      onClick={() => toggleReaction(msg.id, reaction.emoji)}
                      className="flex items-center gap-1 px-2 py-1 rounded-full bg-muted/60 hover:bg-muted transition-colors"
                    >
                      <span className="text-sm">{reaction.emoji}</span>
                      <span className="text-xs text-foreground/80">{formatViews(reaction.count)}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between px-3 pb-3">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Eye className="w-4 h-4" />
                  <span className="text-xs">{formatViews(viewCount)}</span>
                </div>
                <div className="flex items-center gap-2">
                  {canPinPosts ? (
                    <button
                      type="button"
                      onClick={() => void pinChannelMessage(msg.id)}
                      className={`transition-colors ${
                        pinnedMessageId === String(msg.id)
                          ? "text-primary"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      aria-label={pinnedMessageId === String(msg.id) ? "Снять закрепление" : "Закрепить сообщение"}
                    >
                      <Pin className="w-4 h-4" />
                    </button>
                  ) : null}
                  <button className="text-muted-foreground hover:text-foreground transition-colors">
                    <Share2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              </div>

              {/* Time (outside card) */}
              <div className="px-1 text-xs text-muted-foreground flex items-center gap-1">
                {formatTime(msg.created_at)}
                {msg.edited_at && (
                  <span className="italic opacity-70">ред.</span>
                )}
              </div>
            </div>
            </Fragment>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* UI-1: Floating date */}
      <FloatingDate date={floatingDate} onClick={() => setShowJumpToPicker(true)} />

      {/* UI-2: Scroll-to-bottom FAB replacing old button */}
      <ScrollToBottomFab
        visible={showScrollDown}
        onClick={() => { setLiveModePersisted(true); scrollToBottom(); }}
      />

      {contextMenuChannelMsg && (
        <MessageContextMenu
          isOpen={!!contextMenuChannelMsg}
          onClose={() => setContextMenuChannelMsg(null)}
          messageId={contextMenuChannelMsg.id}
          messageContent={contextMenuChannelMsg.content}
          isOwn={contextMenuChannelMsg.isOwn}
          position={contextMenuChannelMsg.position}
          onReaction={(msgId, emoji) => toggleReaction(msgId, emoji)}
          onEdit={contextMenuChannelMsg.isOwn ? (msgId, content) => {
            setEditingChannelMsg({ id: msgId, content });
            setDraftPost(content);
            setContextMenuChannelMsg(null);
          } : undefined}
        />
      )}

      {isMember && (
        <ChannelInputBar
          channelId={channel.id}
          draftPost={draftPost}
          setDraftPost={setDraftPost}
          editingChannelMsg={editingChannelMsg}
          setEditingChannelMsg={setEditingChannelMsg}
          role={role}
          canCreatePosts={canCreatePosts}
          sendingPost={sendingPost}
          handlePublishPost={handlePublishPost}
          handleAttachment={handleAttachment}
          notifySubscribers={notifySubscribers}
          setNotifySubscribers={setNotifySubscribers}
          recordMode={recordMode}
          isRecording={isRecording}
          recordingTime={recordingTime}
          handleRecordButtonDown={handleRecordButtonDown}
          handleRecordButtonUp={handleRecordButtonUp}
          handleRecordButtonLeave={handleRecordButtonLeave}
          handleVideoRecord={handleVideoRecord}
          cancelVoiceRecording={cancelVoiceRecording}
          stopVoiceRecordingAndSend={stopVoiceRecordingAndSend}
          sendSticker={sendSticker}
          mentionSuggestions={mentionSuggestions}
          mentionTrigger={mentionTrigger}
          mentionActiveIndex={mentionActiveIndex}
          setMentionTrigger={setMentionTrigger}
          setMentionActiveIndex={setMentionActiveIndex}
          showAttachmentSheet={showAttachmentSheet}
          setShowAttachmentSheet={setShowAttachmentSheet}
          showCameraSheet={showCameraSheet}
          setShowCameraSheet={setShowCameraSheet}
          showEmojiPicker={showEmojiPicker}
          setShowEmojiPicker={setShowEmojiPicker}
          showStickerPicker={showStickerPicker}
          setShowStickerPicker={setShowStickerPicker}
          showSendOptions={showSendOptions}
          setShowSendOptions={setShowSendOptions}
          showVideoRecorder={showVideoRecorder}
          setShowVideoRecorder={setShowVideoRecorder}
          viewingImage={viewingImage}
          setViewingImage={setViewingImage}
        />
      )}

      {/* UI-6: Jump to date picker */}
      <JumpToDatePicker
        open={showJumpToPicker}
        onClose={() => setShowJumpToPicker(false)}
        messages={messages}
        onJump={scrollToChannelMessage}
      />

      <InviteQrDialog
        open={inviteQrOpen}
        onOpenChange={setInviteQrOpen}
        title="QR-приглашение в канал"
        description="Отсканируйте QR-код, чтобы открыть ссылку-приглашение в канал"
        inviteUrl={inviteQrUrl}
        downloadFileName={`channel-${channel.id}-invite-qr.png`}
      />
    </div>
  );
}
