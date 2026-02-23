import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bell,
  BellOff,
  ChevronDown,
  Eye,
  FileText,
  Link,
  Mic,
  MoreVertical,
  Pin,
  Search,
  Send,
  Share2,
  Smile,
  Video,
  Volume2 as Volume2Icon,
  Trash2,
  CheckCircle2,
  X,
  Radio,
  Users,
  Settings2,
  ChevronRight,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { getHashtagBlockedToastPayload } from "@/lib/hashtagModeration";
import { getChatSendErrorToast } from "@/lib/chat/sendError";
import { diagnoseChannelSendReadiness } from "@/lib/chat/readiness";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Drawer, DrawerClose, DrawerContent } from "@/components/ui/drawer";
import { AttachmentIcon } from "@/components/chat/AttachmentIcon";
import { AttachmentSheet } from "@/components/chat/AttachmentSheet";
import { EmojiStickerPicker } from "@/components/chat/EmojiStickerPicker";
import { ImageViewer } from "@/components/chat/ImageViewer";
import { VideoCircleRecorder } from "@/components/chat/VideoCircleRecorder";
import { VideoCircleMessage } from "@/components/chat/VideoCircleMessage";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import type { Channel } from "@/hooks/useChannels";
import { useChannelMessages, useJoinChannel } from "@/hooks/useChannels";
import { useChannelCapabilities } from "@/hooks/useChannelCapabilities";
import { useCommunityGlobalSettings, useCommunityInvites } from "@/hooks/useCommunityControls";
import { useChatOpen } from "@/contexts/ChatOpenContext";
import { GradientAvatar } from "@/components/ui/gradient-avatar";
import { supabase } from "@/lib/supabase";
import { useChannelUserSettings } from "@/hooks/useChannelUserSettings";

interface ChannelConversationProps {
  channel: Channel;
  onBack: () => void;
  onLeave?: () => void;
}

const formatSubscribers = (count: number): string =>
  `${count.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} подписчиков`;

const formatViews = (count: number): string => {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(".", ",")}K`;
  return String(count);
};

const formatAutoDeleteLabel = (seconds: number): string => {
  const s = Math.max(0, Number(seconds) || 0);
  if (s === 0) return "Никогда";
  if (s === 24 * 60 * 60) return "1 день";
  if (s === 7 * 24 * 60 * 60) return "1 нед.";
  if (s === 30 * 24 * 60 * 60) return "1 месяц";
  return `Другое: ${s} сек.`;
};

const stableHash32 = (input: string): number => {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

const stableIntInRange = (seed: string, minInclusive: number, maxInclusive: number): number => {
  const min = Math.min(minInclusive, maxInclusive);
  const max = Math.max(minInclusive, maxInclusive);
  const span = max - min + 1;
  if (span <= 1) return min;
  return min + (stableHash32(seed) % span);
};

export function ChannelConversation({ channel, onBack, onLeave }: ChannelConversationProps) {
  const { user } = useAuth();
  const { setIsChatOpen } = useChatOpen();
  const { messages, loading, sendMessage, sendMediaMessage } = useChannelMessages(channel.id);
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
  const [sendingPost, setSendingPost] = useState(false);
  const [showAttachmentSheet, setShowAttachmentSheet] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [notifySubscribers, setNotifySubscribers] = useState<boolean>(() => {
    try {
      return localStorage.getItem(`channel.notify.${channel.id}`) !== "0";
    } catch {
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
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const liveStorageKey = useMemo(() => `channel.live_mode.${channel.id}`, [channel.id]);
  const [liveMode, setLiveMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(`channel.live_mode.${channel.id}`) === "1";
    } catch {
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
    const v = Number((channel as any)?.auto_delete_seconds);
    return Number.isFinite(v) ? v : null;
  });
  const [autoDeleteLoading, setAutoDeleteLoading] = useState(false);
  const [pinnedMessageId, setPinnedMessageId] = useState<string | null>(null);
  const [pinnedLoaded, setPinnedLoaded] = useState(false);
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

  useEffect(() => {
    if (!channel.id) {
      setPinnedMessageId(null);
      setPinnedLoaded(true);
      return;
    }

    let cancelled = false;
    const loadPinned = async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("channel_pins")
          .select("message_id")
          .eq("channel_id", channel.id)
          .maybeSingle();
        if (error) throw error;
        if (cancelled) return;
        setPinnedMessageId(data?.message_id ? String(data.message_id) : null);
      } catch {
        if (cancelled) return;
        setPinnedMessageId(null);
      } finally {
        if (!cancelled) setPinnedLoaded(true);
      }
    };

    void loadPinned();

    const channelPins = supabase
      .channel(`channel-pins:${channel.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "channel_pins",
          filter: `channel_id=eq.${channel.id}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            setPinnedMessageId(null);
            return;
          }
          const next = (payload.new as any)?.message_id;
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
    } catch {
      // ignore
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
      console.error("Failed to start voice recording:", err);
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
          console.error("Failed to send voice:", e);
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
      console.error("Failed to send video circle:", e);
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
    } catch {
      // ignore
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

  const loadAdmins = async () => {
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
      for (const r of rows as any[]) {
        if (r?.user_id) adminIds.add(String(r.user_id));
      }

      const ids = Array.from(adminIds);
      const { data: profs, error: profErr } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", ids);
      if (profErr) throw profErr;

      const map: Record<string, { display_name: string | null; avatar_url: string | null }> = {};
      (profs || []).forEach((p: any) => {
        if (!p?.user_id) return;
        map[String(p.user_id)] = {
          display_name: p.display_name ?? null,
          avatar_url: p.avatar_url ?? null,
        };
      });

      const out = ids.map((id) => ({
        user_id: id,
        display_name: map[id]?.display_name ?? null,
        avatar_url: map[id]?.avatar_url ?? null,
        role: id === String(channel.owner_id) ? "owner" : "admin",
      }));
      setAdmins(out);
    } catch (e) {
      console.error("Failed to load admins:", e);
      toast.error("Не удалось загрузить администраторов");
      setAdmins([]);
    } finally {
      setAdminsLoading(false);
    }
  };

  const loadSubscribers = async () => {
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
            .map((r: any) => String(r?.user_id || ""))
            .filter((x: string) => x.length > 0),
        ),
      );
      if (ids.length === 0) {
        setSubscribers([]);
        return;
      }

      const { data: profs, error: profErr } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", ids);
      if (profErr) throw profErr;

      const map: Record<string, { display_name: string | null; avatar_url: string | null }> = {};
      (profs || []).forEach((p: any) => {
        if (!p?.user_id) return;
        map[String(p.user_id)] = {
          display_name: p.display_name ?? null,
          avatar_url: p.avatar_url ?? null,
        };
      });

      const roleById: Record<string, string> = {};
      (rows || []).forEach((r: any) => {
        if (!r?.user_id) return;
        roleById[String(r.user_id)] = String(r?.role ?? "member");
      });

      setSubscribers(
        ids.map((id) => ({
          user_id: id,
          display_name: map[id]?.display_name ?? null,
          avatar_url: map[id]?.avatar_url ?? null,
          role: roleById[id] || "member",
        })),
      );
    } catch (e) {
      console.error("Failed to load subscribers:", e);
      toast.error("Не удалось загрузить подписчиков");
      setSubscribers([]);
    } finally {
      setSubsLoading(false);
    }
  };

  useEffect(() => {
    if (!infoOpen) return;
    if (infoView === "admins" && admins.length === 0 && !adminsLoading) {
      void loadAdmins();
    }
    if (infoView === "subscribers" && subscribers.length === 0 && !subsLoading) {
      void loadSubscribers();
    }
  }, [admins.length, adminsLoading, infoOpen, infoView, subscribers.length, subsLoading]);

  const loadAutoDeleteSeconds = async () => {
    setAutoDeleteLoading(true);
    try {
      const { data, error } = await supabase
        .from("channels")
        .select("auto_delete_seconds")
        .eq("id", channel.id)
        .maybeSingle();
      if (error) throw error;
      const v = Number((data as any)?.auto_delete_seconds ?? 0) || 0;
      setAutoDeleteSecondsLocal(v);
    } catch (e) {
      console.warn("loadAutoDeleteSeconds failed:", e);
    } finally {
      setAutoDeleteLoading(false);
    }
  };

  useEffect(() => {
    if (!infoOpen) return;
    void loadAutoDeleteSeconds();
  }, [infoOpen, channel.id]);

  const messageById = useMemo(() => {
    const m = new Map<string, any>();
    for (const msg of messages as any[]) {
      if (!msg?.id) continue;
      m.set(String(msg.id), msg);
    }
    return m;
  }, [messages]);
  const pinnedMessage = useMemo(
    () => (pinnedMessageId ? (messages as any[]).find((m: any) => String(m?.id) === pinnedMessageId) ?? null : null),
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

  const autoDeleteSeconds = Number((autoDeleteSecondsLocal ?? (channel as any)?.auto_delete_seconds ?? 0)) || 0;

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
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const atBottom = distanceFromBottom <= 80;
    setIsAtBottom(atBottom);
    setShowScrollDown(distanceFromBottom > 200);

    // If user scrolls away from bottom, pause live-follow.
    if (!atBottom && liveMode) {
      setLiveModePersisted(false);
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
      const { error } = await (supabase as any)
        .from("channel_pins")
        .delete()
        .eq("channel_id", channel.id);
      if (error) throw error;
      setPinnedMessageId(null);
      toast.success("Закрепление снято");
    } catch (e) {
      console.error("Failed to unpin message:", e);
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

      const { error } = await (supabase as any)
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
      console.error("Failed to pin message:", e);
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
      console.error("Failed to publish post:", err);
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
      console.error("Failed to send channel media:", e);
      toast.error("Не удалось отправить вложение");
    } finally {
      setSendingPost(false);
    }
  };

  const QUICK_STICKERS = useMemo(
    () => ["😄", "😍", "😂", "🔥", "👍", "❤️", "🥳", "😮", "😢", "😡", "🤝", "🙏", "💯", "✨", "🎉", "🤩", "🫶", "😴", "🤯", "😎"],
    [],
  );

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
      console.error("Failed to send sticker:", e);
      toast.error("Не удалось отправить стикер");
    } finally {
      setSendingPost(false);
    }
  };

  const handleCreateInvite = async () => {
    try {
      if (!canInvite) {
        toast.error("Приглашения отключены настройками или правами");
        return;
      }
      const token = await createChannelInvite(channel.id);
      const url = `${window.location.origin}/chats?channel_invite=${token}`;
      await navigator.clipboard.writeText(url);
      toast.success("Ссылка-приглашение скопирована");
    } catch (err) {
      console.error("Failed to create channel invite:", err);
      toast.error("Не удалось создать приглашение");
    }
  };

  const setAutoDeleteSeconds = async (seconds: number) => {
    if (!canUpdateSettings) {
      toast.error("Недостаточно прав для изменения настроек");
      return;
    }
    try {
      const v = Math.max(0, Math.min(Number(seconds) || 0, 31_536_000));
      const updatePayload: any = { auto_delete_seconds: v, updated_at: new Date().toISOString() };
      const { error } = await supabase
        .from("channels")
        .update(updatePayload)
        .eq("id", channel.id);
      if (error) throw error;
      toast.success("Автоудаление обновлено");
      setAutoDeleteSecondsLocal(v);
      // Best-effort shadow update.
      (channel as any).auto_delete_seconds = v;
    } catch (e) {
      console.error("Failed to update auto-delete:", e);
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
      console.error("Bulk delete failed:", e);
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
      console.error("Delete channel failed:", e);
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
        .update({ role: nextRole } as any)
        .eq("channel_id", channel.id)
        .eq("user_id", userId);
      if (error) throw error;
      toast.success(nextRole === "admin" ? "Назначен администратор" : "Роль обновлена");
      await Promise.all([loadAdmins(), loadSubscribers()]);
    } catch (e) {
      console.error("updateMemberRole failed:", e);
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
      console.error("removeMember failed:", e);
      toast.error("Не удалось удалить участника");
    }
  };

  const formatTime = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "HH:mm");
    } catch {
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
      <div className="flex-shrink-0 flex items-center gap-2 px-2 py-2 bg-background/95 backdrop-blur-sm border-b border-border relative z-10 safe-area-top">
        <button onClick={onBack} className="flex items-center gap-1 text-primary">
          <ArrowLeft className="w-5 h-5" />
          <span className="text-sm font-medium">{stableIntInRange(`channel:${channel.id}:header`, 10, 109)}</span>
        </button>

        <button
          type="button"
          onClick={openInfo}
          className="rounded-full"
          aria-label="Открыть меню канала"
          title="Канал"
        >
          <GradientAvatar
            name={channel.name}
            seed={channel.id}
            avatarUrl={channel.avatar_url}
            size="sm"
            className="w-9 h-9 text-xs border-border/60"
          />
        </button>

        <div className="flex-1 min-w-0">
          <button type="button" onClick={openInfo} className="text-left w-full">
            <h2 className="font-semibold text-foreground text-sm truncate flex items-center gap-2">
              <span className="truncate">{channel.name}</span>
              {liveMode ? (
                <span className="shrink-0 rounded-full bg-primary/10 text-primary text-[10px] leading-none px-2 py-1">
                  LIVE
                </span>
              ) : null}
            </h2>
          </button>
          <p className="text-[11px] text-muted-foreground">{formatSubscribers(channel.member_count || 0)}</p>
        </div>

        <button
          type="button"
          onClick={() => setSearchOpen((v) => !v)}
          className="p-2 text-muted-foreground hover:text-foreground"
          aria-label="Поиск сообщений"
          title="Поиск сообщений"
        >
          <Search className="w-5 h-5" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-2 text-muted-foreground hover:text-foreground">
              <MoreVertical className="w-5 h-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={isMember ? handleLeave : handleJoin}>
              {isMember ? "Отписаться от канала" : "Подписаться на канал"}
            </DropdownMenuItem>

            <DropdownMenuItem
              onClick={async () => {
                try {
                  await setMuted(!muted);
                  toast.success(!muted ? "Уведомления выключены" : "Уведомления включены");
                } catch (e) {
                  console.error("Mute toggle failed:", e);
                  toast.error("Не удалось обновить уведомления");
                }
              }}
              disabled={!isMember}
            >
              {muted ? "Включить уведомления" : "Выключить уведомления"}
            </DropdownMenuItem>

            <DropdownMenuSub>
              <DropdownMenuSubTrigger disabled={!isMember || !canUpdateSettings}>
                Автоудаление
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={autoDeleteRadioValue}
                  onValueChange={(v) => {
                    if (v === "custom") return;
                    void setAutoDeleteSeconds(Number(v));
                  }}
                >
                  <DropdownMenuRadioItem value="0">Никогда</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value={String(24 * 60 * 60)}>1 день</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value={String(7 * 24 * 60 * 60)}>1 нед.</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value={String(30 * 24 * 60 * 60)}>1 месяц</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem
                    value="custom"
                    onSelect={(e) => {
                      e.preventDefault();
                      const raw = window.prompt("Автоудаление: секунд (0 = никогда)", String(autoDeleteSeconds));
                      if (raw == null) return;
                      const n = Number(raw);
                      void setAutoDeleteSeconds(Number.isFinite(n) ? n : autoDeleteSeconds);
                    }}
                  >
                    Другое
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuItem
              onClick={toggleLive}
              disabled={!isMember}
            >
              {liveMode ? "Остановить трансляцию" : "Трансляция"}
            </DropdownMenuItem>

            <DropdownMenuItem
              onClick={() => setSelectMode((v) => !v)}
              disabled={!isMember}
            >
              {selectMode ? "Отменить выбор" : "Выбрать сообщения"}
            </DropdownMenuItem>

            <DropdownMenuItem disabled>Отправить подарок</DropdownMenuItem>

            <DropdownMenuItem onClick={handleCreateInvite} disabled={!canInvite}>
              <Link className="w-4 h-4 mr-2" />
              Пригласить в канал
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onClick={deleteChannel}
              className="text-destructive focus:text-destructive"
              disabled={role !== "owner"}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Удалить канал
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Drawer
        open={infoOpen}
        onOpenChange={(open) => {
          if (!open) closeInfo();
          else setInfoOpen(true);
        }}
      >
        <DrawerContent
          className="h-[92dvh] max-h-[92dvh] rounded-t-3xl p-0 overflow-hidden mt-0"
        >
          <div className="px-4 pb-6 flex flex-col h-full">
            <div className="flex items-center justify-between pb-2">
              <button
                type="button"
                onClick={() => {
                  if (infoView !== "main") setInfoView("main");
                  else closeInfo();
                }}
                className="p-2 text-muted-foreground hover:text-foreground"
                aria-label={infoView !== "main" ? "Назад" : "Закрыть"}
              >
                <ArrowLeft className="w-5 h-5" />
              </button>

              {infoView === "main" ? (
                <button
                  type="button"
                  onClick={() => setInfoView("settings")}
                  disabled={!canUpdateSettings}
                  className={`px-3 py-2 rounded-full text-sm ${
                    canUpdateSettings
                      ? "text-foreground hover:bg-muted"
                      : "text-muted-foreground opacity-60"
                  }`}
                >
                  Изм.
                </button>
              ) : (
                <div className="px-3 py-2 text-sm font-medium text-foreground">
                  {infoView === "admins" && "Администраторы"}
                  {infoView === "subscribers" && "Подписчики"}
                  {infoView === "settings" && "Настройки канала"}
                  {infoView === "more" && "Ещё"}
                </div>
              )}

              <DrawerClose asChild>
                <button type="button" className="p-2 text-muted-foreground hover:text-foreground" aria-label="Закрыть">
                  <X className="w-5 h-5" />
                </button>
              </DrawerClose>
            </div>

            {infoView === "main" ? (
              <div className="flex-1 overflow-y-auto">
                <div className="flex flex-col items-center pt-3 pb-4">
                  <GradientAvatar
                    name={channel.name}
                    seed={channel.id}
                    avatarUrl={channel.avatar_url}
                    size="lg"
                    className="w-20 h-20 text-xl"
                  />
                  <div className="pt-3 text-center">
                    <div className="text-xl font-semibold text-foreground">{channel.name}</div>
                    <div className="text-sm text-muted-foreground">{formatSubscribers(channel.member_count || 0)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 pb-4">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        disabled={!isMember}
                        className={`rounded-2xl bg-card border border-border/60 py-3 flex flex-col items-center gap-2 ${
                          isMember ? "" : "opacity-60"
                        }`}
                      >
                        <Radio className={`w-5 h-5 ${liveMode ? "text-primary" : "text-muted-foreground"}`} />
                        <span className="text-xs text-muted-foreground">трансляция</span>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="center">
                      <DropdownMenuItem onClick={toggleLive}>
                        {liveMode ? "Остановить" : "Начать трансляцию"}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => toast.message("Анонсы трансляции скоро")}
                      >
                        Анонсировать трансляцию
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => toast.message("Скоро")}
                      >
                        Начать с помощью…
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        disabled={!isMember}
                        className={`rounded-2xl bg-card border border-border/60 py-3 flex flex-col items-center gap-2 ${
                          isMember ? "" : "opacity-60"
                        }`}
                      >
                        <Volume2Icon className={`w-5 h-5 ${muted ? "text-muted-foreground" : "text-primary"}`} />
                        <span className="text-xs text-muted-foreground">звук</span>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="center">
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>Выключить на время…</DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          <DropdownMenuItem onClick={() => void muteForMs(60 * 60 * 1000)}>На 1 час</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => void muteForMs(8 * 60 * 60 * 1000)}>На 8 часов</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => void muteForMs(2 * 24 * 60 * 60 * 1000)}>На 2 дня</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => void muteUntil("infinity")}>Навсегда</DropdownMenuItem>
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>

                      {muted ? (
                        <DropdownMenuItem
                          onClick={() => void muteUntil(null)}
                        >
                          Включить звук
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onClick={() => void muteUntil("infinity")}>Выключить звук</DropdownMenuItem>
                      )}

                      <DropdownMenuItem onClick={() => setInfoView("settings")}>Настроить</DropdownMenuItem>

                      {notificationsDisabled ? (
                        <DropdownMenuItem onClick={() => void enableNotifications()}>
                          Вкл. уведомления
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          onClick={() => void disableNotifications()}
                          className="text-destructive focus:text-destructive"
                        >
                          Выкл. уведомления
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <button
                    type="button"
                    onClick={() => {
                      setSearchOpen(true);
                      setSearchQuery("");
                      closeInfo();
                    }}
                    className="rounded-2xl bg-card border border-border/60 py-3 flex flex-col items-center gap-2"
                  >
                    <Search className="w-5 h-5 text-primary" />
                    <span className="text-xs text-muted-foreground">поиск</span>
                  </button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="rounded-2xl bg-card border border-border/60 py-3 flex flex-col items-center gap-2"
                      >
                        <MoreVertical className="w-5 h-5 text-primary" />
                        <span className="text-xs text-muted-foreground">ещё</span>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="center">
                      <DropdownMenuItem onClick={() => toast.message("Подарки скоро")}>Отправить подарок</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => toast.message("Скоро")}>Голоса</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => toast.message("Скоро")}>Архив историй</DropdownMenuItem>
                      <DropdownMenuSeparator />

                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger disabled={!canUpdateSettings || autoDeleteLoading}>
                          Автоудаление
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          <DropdownMenuRadioGroup
                            value={autoDeleteRadioValue}
                            onValueChange={(v) => {
                              if (v === "custom") return;
                              void setAutoDeleteSeconds(Number(v));
                            }}
                          >
                            <DropdownMenuRadioItem value="0">Никогда</DropdownMenuRadioItem>
                            <DropdownMenuRadioItem value={String(24 * 60 * 60)}>1 день</DropdownMenuRadioItem>
                            <DropdownMenuRadioItem value={String(7 * 24 * 60 * 60)}>1 нед.</DropdownMenuRadioItem>
                            <DropdownMenuRadioItem value={String(30 * 24 * 60 * 60)}>1 месяц</DropdownMenuRadioItem>
                            <DropdownMenuRadioItem
                              value="custom"
                              onSelect={(e) => {
                                e.preventDefault();
                                const raw = window.prompt("Автоудаление: секунд (0 = никогда)", String(autoDeleteSeconds));
                                if (raw == null) return;
                                const n = Number(raw);
                                void setAutoDeleteSeconds(Number.isFinite(n) ? n : autoDeleteSeconds);
                              }}
                            >
                              Другое
                            </DropdownMenuRadioItem>
                          </DropdownMenuRadioGroup>
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>

                      <DropdownMenuItem disabled>Удалить переписку</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={handleLeave}
                        disabled={!isMember}
                        className="text-destructive focus:text-destructive"
                      >
                        Покинуть канал
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="rounded-2xl bg-card border border-border/60 overflow-hidden">
                  <div className="px-4 py-3 border-b border-border/60">
                    <div className="text-xs text-muted-foreground">описание</div>
                    <div className="text-sm text-foreground pt-1">{(channel.description || "").trim() || channel.name}</div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setInfoView("admins")}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/40"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Users className="w-5 h-5 text-primary" />
                      </div>
                      <div className="text-sm text-foreground">Администраторы</div>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span className="text-sm">{Math.max(1, admins.length || 1)}</span>
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setInfoView("subscribers")}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/40 border-t border-border/60"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Users className="w-5 h-5 text-primary" />
                      </div>
                      <div className="text-sm text-foreground">Подписчики</div>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span className="text-sm">{channel.member_count || 0}</span>
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setInfoView("settings")}
                    disabled={!canUpdateSettings}
                    className={`w-full px-4 py-3 flex items-center justify-between hover:bg-muted/40 border-t border-border/60 ${
                      canUpdateSettings ? "" : "opacity-60"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Settings2 className="w-5 h-5 text-primary" />
                      </div>
                      <div className="text-sm text-foreground">Настройки канала</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
              </div>
            ) : null}

            {infoView === "admins" ? (
              <div className="flex-1 overflow-y-auto">
                {adminsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    {canManageMembers ? (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await loadSubscribers();
                            setInfoView("subscribers");
                            toast.message("Выберите участника и назначьте админом");
                          } catch {
                            // ignore
                          }
                        }}
                        className="w-full flex items-center justify-between p-3 rounded-2xl bg-card border border-border/60 hover:bg-muted/40"
                      >
                        <div className="text-sm text-foreground">Добавить администратора</div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </button>
                    ) : null}
                    {admins.map((a) => (
                      <div key={a.user_id} className="flex items-center gap-3 p-3 rounded-2xl bg-card border border-border/60">
                        <GradientAvatar name={a.display_name || "User"} seed={a.user_id} avatarUrl={a.avatar_url} size="sm" className="w-10 h-10" />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-foreground truncate">{a.display_name || a.user_id}</div>
                          <div className="text-xs text-muted-foreground">{a.role === "owner" ? "владелец" : "админ"}</div>
                        </div>
                        {canManageMembers && a.role !== "owner" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void updateMemberRole(a.user_id, "member")}
                          >
                            Снять
                          </Button>
                        ) : null}
                      </div>
                    ))}
                    {admins.length === 0 ? (
                      <div className="text-center py-10 text-muted-foreground">Нет данных</div>
                    ) : null}
                  </div>
                )}
              </div>
            ) : null}

            {infoView === "subscribers" ? (
              <div className="flex-1 overflow-y-auto">
                {subsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(canManageMembers || canInvite) ? (
                      <div className="rounded-2xl bg-card border border-border/60 overflow-hidden">
                        {canManageMembers ? (
                          <button
                            type="button"
                            onClick={() => toast.message("Добавление подписчиков скоро")}
                            className="w-full px-4 py-3 text-left hover:bg-muted/40"
                          >
                            <div className="text-sm text-primary">Добавить подписчиков</div>
                          </button>
                        ) : null}
                        {canInvite ? (
                          <button
                            type="button"
                            onClick={handleCreateInvite}
                            className={`w-full px-4 py-3 text-left hover:bg-muted/40 ${canManageMembers ? "border-t border-border/60" : ""}`}
                          >
                            <div className="text-sm text-primary">Пригласить по ссылке</div>
                          </button>
                        ) : null}
                      </div>
                    ) : null}

                    {subscribers.map((s) => (
                      <div key={s.user_id} className="flex items-center gap-3 p-3 rounded-2xl bg-card border border-border/60">
                        <GradientAvatar name={s.display_name || "User"} seed={s.user_id} avatarUrl={s.avatar_url} size="sm" className="w-10 h-10" />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-foreground truncate">{s.display_name || s.user_id}</div>
                          <div className="text-xs text-muted-foreground">{String(s.role || "member")}</div>
                        </div>

                        {String(s.user_id) === String(channel.owner_id) ? (
                          <span className="text-[10px] px-2 py-1 rounded-full bg-primary/10 text-primary">owner</span>
                        ) : null}

                        {canManageMembers && String(s.user_id) !== String(channel.owner_id) ? (
                          <div className="flex items-center gap-1">
                            {String(s.role) === "admin" ? (
                              <Button variant="ghost" size="sm" onClick={() => void updateMemberRole(s.user_id, "member")}>
                                Снять
                              </Button>
                            ) : (
                              <Button variant="ghost" size="sm" onClick={() => void updateMemberRole(s.user_id, "admin")}>
                                Админ
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" onClick={() => void removeMember(s.user_id)} className="text-destructive">
                              Удалить
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                    {subscribers.length === 0 ? (
                      <div className="text-center py-10 text-muted-foreground">Нет данных</div>
                    ) : null}
                  </div>
                )}
              </div>
            ) : null}

            {infoView === "settings" ? (
              <div className="flex-1 overflow-y-auto">
                <div className="space-y-3">
                  <div className="rounded-2xl bg-card border border-border/60 overflow-hidden">
                    <div className="px-4 py-3 flex items-center justify-between border-b border-border/60">
                      <div>
                        <div className="text-sm font-medium text-foreground">Уведомления</div>
                        <div className="text-xs text-muted-foreground">Вкл/выкл для этого канала</div>
                      </div>
                      <Switch
                        checked={!muted}
                        onCheckedChange={async (checked) => {
                          try {
                            await setMuted(!checked);
                          } catch (e) {
                            console.error("Mute toggle failed:", e);
                            toast.error("Не удалось обновить уведомления");
                          }
                        }}
                        disabled={!isMember}
                      />
                    </div>

                    <div className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-foreground">Автоудаление</div>
                        <div className="text-xs text-muted-foreground">Сколько хранить новые публикации</div>
                      </div>
                      <div className="text-xs text-muted-foreground">{formatAutoDeleteLabel(autoDeleteSeconds)}</div>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-card border border-border/60 overflow-hidden">
                    <button
                      type="button"
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/40"
                      onClick={() => void setAutoDeleteSeconds(0)}
                      disabled={!canUpdateSettings}
                    >
                      <div className="text-sm text-foreground">Никогда</div>
                      {autoDeleteSeconds === 0 ? <CheckCircle2 className="w-4 h-4 text-primary" /> : null}
                    </button>
                    <button
                      type="button"
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/40 border-t border-border/60"
                      onClick={() => void setAutoDeleteSeconds(24 * 60 * 60)}
                      disabled={!canUpdateSettings}
                    >
                      <div className="text-sm text-foreground">1 день</div>
                      {autoDeleteSeconds === 24 * 60 * 60 ? <CheckCircle2 className="w-4 h-4 text-primary" /> : null}
                    </button>
                    <button
                      type="button"
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/40 border-t border-border/60"
                      onClick={() => void setAutoDeleteSeconds(7 * 24 * 60 * 60)}
                      disabled={!canUpdateSettings}
                    >
                      <div className="text-sm text-foreground">1 нед.</div>
                      {autoDeleteSeconds === 7 * 24 * 60 * 60 ? <CheckCircle2 className="w-4 h-4 text-primary" /> : null}
                    </button>
                    <button
                      type="button"
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/40 border-t border-border/60"
                      onClick={() => void setAutoDeleteSeconds(30 * 24 * 60 * 60)}
                      disabled={!canUpdateSettings}
                    >
                      <div className="text-sm text-foreground">1 месяц</div>
                      {autoDeleteSeconds === 30 * 24 * 60 * 60 ? <CheckCircle2 className="w-4 h-4 text-primary" /> : null}
                    </button>
                    <button
                      type="button"
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/40 border-t border-border/60"
                      onClick={() => {
                        const raw = window.prompt("Автоудаление: секунд (0 = никогда)", String(autoDeleteSeconds));
                        if (raw == null) return;
                        const n = Number(raw);
                        void setAutoDeleteSeconds(Number.isFinite(n) ? n : autoDeleteSeconds);
                      }}
                      disabled={!canUpdateSettings}
                    >
                      <div className="text-sm text-foreground">Другое…</div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {infoView === "more" ? (
              <div className="flex-1 overflow-y-auto">
                <div className="rounded-2xl bg-card border border-border/60 overflow-hidden">
                  <button
                    type="button"
                    onClick={isMember ? handleLeave : handleJoin}
                    className="w-full px-4 py-3 text-left hover:bg-muted/40"
                  >
                    <div className="text-sm text-foreground">{isMember ? "Отписаться от канала" : "Подписаться на канал"}</div>
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateInvite}
                    disabled={!canInvite}
                    className={`w-full px-4 py-3 text-left hover:bg-muted/40 border-t border-border/60 ${canInvite ? "" : "opacity-60"}`}
                  >
                    <div className="text-sm text-foreground">Пригласить в канал</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectMode(true);
                      closeInfo();
                    }}
                    disabled={!isMember}
                    className={`w-full px-4 py-3 text-left hover:bg-muted/40 border-t border-border/60 ${isMember ? "" : "opacity-60"}`}
                  >
                    <div className="text-sm text-foreground">Выбрать сообщения</div>
                  </button>
                  <button
                    type="button"
                    onClick={deleteChannel}
                    disabled={role !== "owner"}
                    className={`w-full px-4 py-3 text-left hover:bg-muted/40 border-t border-border/60 text-destructive ${
                      role === "owner" ? "" : "opacity-60"
                    }`}
                  >
                    <div className="text-sm">Удалить канал</div>
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </DrawerContent>
      </Drawer>

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
                  {(String((pinnedMessage as any)?.content || "").trim() || "Сообщение недоступно")}
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

        {visibleMessages.map((msg) => {
          const viewCount = Number.isFinite((msg as any)?.views_count) ? Number((msg as any).views_count) : 0;
          const postReactions: Array<{ emoji: string; count: number }> = Array.isArray((msg as any)?.reactions)
            ? ((msg as any).reactions as any[])
                .filter((r) => r && typeof r.emoji === "string" && Number.isFinite(r.count))
                .map((r) => ({ emoji: String(r.emoji), count: Number(r.count) }))
            : [];

          return (
            <div key={msg.id} id={`channel-msg-${msg.id}`} className="flex flex-col gap-1">
              <div
                className={`bg-card rounded-2xl overflow-hidden border ${
                  selectMode && selectedIds.has(msg.id) ? "border-primary" : "border-border/60"
                }`}
                onClick={() => {
                  if (!selectMode) return;
                  toggleSelect(msg.id);
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
                  {String((msg as any)?.media_type || "image") === "video_circle" ? (
                    <div className="px-3 pb-3">
                      <VideoCircleMessage
                        videoUrl={msg.media_url}
                        duration={String((msg as any)?.duration_seconds || 0)}
                        isOwn={String((msg as any)?.sender_id) === String(user?.id)}
                      />
                    </div>
                  ) : String((msg as any)?.media_type || "image") === "voice" ? (
                    <div className="px-3 pb-3">
                      <audio controls src={msg.media_url} className="w-full" />
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {Number((msg as any)?.duration_seconds) ? formatDuration(Number((msg as any).duration_seconds)) : ""}
                      </div>
                    </div>
                  ) : String((msg as any)?.media_type || "image") === "video" ? (
                    <video
                      src={msg.media_url}
                      controls
                      className="w-full max-h-80 object-cover"
                      playsInline
                    />
                  ) : String((msg as any)?.media_type || "image") === "document" ? (
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
                      <img src={msg.media_url} alt="" className="w-full max-h-80 object-cover" />
                    </button>
                  )}
                </div>
              ) : null}

              <div className="px-3 py-2">
                <p className="text-foreground text-[15px] leading-relaxed whitespace-pre-wrap break-words">
                  {renderHighlightedText(msg.content || "")}
                </p>
              </div>

              {postReactions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-3 py-2">
                  {postReactions.map((reaction, i) => (
                    <button
                      key={`${msg.id}-${i}`}
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
              <div className="px-1 text-xs text-muted-foreground">
                {formatTime(msg.created_at)}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {showScrollDown && (
        <button
          onClick={() => {
            setLiveModePersisted(true);
            scrollToBottom();
          }}
          className="absolute right-4 bottom-20 w-10 h-10 rounded-full bg-card flex items-center justify-center shadow-lg hover:bg-muted transition-colors border border-border"
          aria-label="Вернуться в live"
        >
          <ChevronDown className="w-6 h-6 text-foreground" />
        </button>
      )}

      {isMember && (
        <div className="flex-shrink-0 px-3 py-3 relative z-10 bg-background/95 backdrop-blur-sm border-t border-border safe-area-bottom">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-2">
            <span>Роль: {role}</span>
            {!canCreatePosts && <span>• публикация отключена</span>}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <Input
                value={draftPost}
                onChange={(e) => setDraftPost(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  if (e.repeat) return;
                  if (sendingPost) return;
                  void handlePublishPost();
                }}
                onFocus={() => setShowEmojiPicker(false)}
                placeholder={canCreatePosts ? "Сообщение" : "Для публикации нужны права"}
                disabled={!canCreatePosts || sendingPost}
                className="flex-1 h-11 rounded-full pr-20"
              />

              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setNotifySubscribers((v) => !v)}
                  disabled={!canCreatePosts || sendingPost}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                  aria-label={notifySubscribers ? "Публикация с уведомлением" : "Публикация без уведомления"}
                  title={notifySubscribers ? "С уведомлением" : "Без уведомления"}
                >
                  {notifySubscribers ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
                </button>
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker((v) => !v)}
                  disabled={!canCreatePosts || sendingPost}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                  aria-label="Эмодзи"
                >
                  <Smile className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowStickerPicker(true)}
                  disabled={!canCreatePosts || sendingPost}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                  aria-label="Стикеры"
                >
                  <span className="text-[15px]">🧩</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowAttachmentSheet(true)}
                  disabled={!canCreatePosts || sendingPost}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                  aria-label="Вложение"
                >
                  <AttachmentIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
            {draftPost.trim() ? (
              <Button
                onClick={handlePublishPost}
                disabled={!canCreatePosts || sendingPost || !draftPost.trim()}
                size="icon"
                className="w-11 h-11 rounded-full shrink-0"
                aria-label="Опубликовать"
                type="button"
              >
                <Send className="w-5 h-5 text-primary-foreground" />
              </Button>
            ) : (
              <button
                onTouchStart={handleRecordButtonDown}
                onTouchEnd={handleRecordButtonUp}
                onMouseDown={handleRecordButtonDown}
                onMouseUp={handleRecordButtonUp}
                onMouseLeave={handleRecordButtonLeave}
                onContextMenu={(e) => e.preventDefault()}
                disabled={!canCreatePosts || sendingPost}
                className="w-11 h-11 rounded-full shrink-0 flex items-center justify-center border border-border bg-card disabled:opacity-50"
                aria-label={recordMode === "voice" ? "Голосовое (удерживайте)" : "Видео-кружок (удерживайте)"}
                title={recordMode === "voice" ? "Тап: видео • Удержание: запись" : "Тап: голос • Удержание: запись"}
                type="button"
              >
                {recordMode === "voice" ? <Mic className="w-5 h-5" /> : <Video className="w-5 h-5" />}
              </button>
            )}
          </div>

          {isRecording ? (
            <div className="mt-2 flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2">
              <div className="text-xs text-muted-foreground">Запись… {formatDuration(recordingTime)}</div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={cancelVoiceRecording}>
                  Отмена
                </Button>
                <Button size="sm" onClick={() => void stopVoiceRecordingAndSend()}>
                  Отправить
                </Button>
              </div>
            </div>
          ) : null}

          <EmojiStickerPicker
            open={showEmojiPicker}
            onOpenChange={setShowEmojiPicker}
            onEmojiSelect={(emoji) => setDraftPost((prev) => prev + emoji)}
          />

          <Drawer open={showStickerPicker} onOpenChange={setShowStickerPicker}>
            <DrawerContent className="mx-4 mb-4 rounded-2xl border-0 bg-card">
              <div className="px-4 py-3 text-sm font-medium">Стикеры</div>
              <div className="px-4 pb-4 grid grid-cols-5 gap-2">
                {QUICK_STICKERS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="h-12 rounded-xl border border-border bg-background/50 text-[26px] flex items-center justify-center"
                    onClick={() => void sendSticker(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </DrawerContent>
          </Drawer>

          <AttachmentSheet
            open={showAttachmentSheet}
            onOpenChange={setShowAttachmentSheet}
            onSelectFile={handleAttachment}
            onSelectLocation={() => toast.message("Геопозиция пока не поддерживается")}
          />

          {viewingImage ? <ImageViewer src={viewingImage} onClose={() => setViewingImage(null)} /> : null}

          {showVideoRecorder ? (
            <VideoCircleRecorder onRecord={handleVideoRecord} onCancel={() => setShowVideoRecorder(false)} />
          ) : null}
        </div>
      )}
    </div>
  );
}

