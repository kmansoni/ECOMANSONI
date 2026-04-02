import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Search, Check, CheckCheck, LogIn, MessageCircle, Megaphone, Users, Phone, Bookmark, Archive, Pin, PinOff, ArchiveRestore, AlertTriangle, Bot } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GradientAvatar } from "@/components/ui/gradient-avatar";
import { ChatConversation } from "@/components/chat/ChatConversation";
import { ChatStories } from "@/components/chat/ChatStories";
import { ChatSearchSheet } from "@/components/chat/ChatSearchSheet";
import { CreateChatSheet } from "@/components/chat/CreateChatSheet";
import { ChannelConversation } from "@/components/chat/ChannelConversation";
import { GroupConversation } from "@/components/chat/GroupConversation";
import { useAuth } from "@/hooks/useAuth";
import { useChatDrafts } from "@/hooks/useChatDrafts";
import { useSavedMessages } from "@/hooks/useSavedMessages";
import { useConversations, Conversation, useCreateConversation } from "@/hooks/useChat";
import { useChannels, Channel } from "@/hooks/useChannels";
import { useGroupChats, GroupChat } from "@/hooks/useGroupChats";
import { useChatFolders, type ChatFolder } from "@/hooks/useChatFolders";
import { useUserSettings } from "@/contexts/UserSettingsContext";
import { useCallHistory } from "@/hooks/useCallHistory";
import { useVideoCallContext } from "@/contexts/VideoCallContext";
import { SearchUser } from "@/hooks/useSearch";
import { joinChannelByInviteToken, joinGroupByInviteToken } from "@/lib/community-controls";
import { formatTelegramTime } from "@/lib/formatTelegramTime";
import { ScrollContainerProvider } from "@/contexts/ScrollContainerContext";
import { usePullDownExpand } from "@/hooks/usePullDownExpand";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { pbkdf2Hash, verifyPasscodeHash } from "@/lib/passcode";
import { useArchivedChats } from "@/hooks/useArchivedChats";
import { usePinnedChats } from "@/hooks/usePinnedChats";
import { useE2EEncryption } from "@/hooks/useE2EEncryption";
import type { EncryptedPayload } from "@/hooks/useE2EEncryption";
import { motion, AnimatePresence } from "framer-motion";
import { clearHandledChatsQueryParams, parseChatsQueryActions } from "@/lib/chat/deepLinkQuery";
import { logger } from "@/lib/logger";
import { EmergencySOSSheet } from "@/components/chat/EmergencySOSSheet";
import { OnlineDot } from "@/components/ui/OnlineDot";
import { useUserPresenceStatus } from "@/hooks/useUserPresenceStatus";

/** Lightweight presence dot for chat list avatars */
function ChatPresenceDot({ userId }: { userId?: string | null }) {
  const { isOnline } = useUserPresenceStatus(userId);
  return <OnlineDot isOnline={isOnline} size="sm" />;
}


interface LocationState {
  conversationId?: string;
  chatName?: string;
  otherUserId?: string;
  otherDisplayName?: string;
  otherAvatarUrl?: string | null;
  chatAction?: "settings" | "timer" | "scheduled";
}

interface TypingBroadcastPayload {
  payload?: {
    user_id?: string;
    is_typing?: boolean;
    activity?: string;
  };
}

function fallbackNameFromUserId(userId: string | null | undefined, fallback = "User"): string {
  const normalized = String(userId || "").trim();
  if (!normalized) return fallback;
  return normalized.slice(0, 8);
}

// Animation constants
const HEADER_BASE_HEIGHT = 56;
const PRIMARY_TABS_HEIGHT = 40;
const FILTERS_HEIGHT = 44;
const CREATE_ACTIONS_HEIGHT = 44;
const STORIES_ROW_HEIGHT = 92;
const CHAT_LIST_PLACEHOLDER_COUNT = 6;

function parseEncryptedPayload(content: unknown): EncryptedPayload | null {
  if (typeof content !== "string") return null;
  const trimmed = content.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
  try {
    const parsed = JSON.parse(trimmed) as Partial<EncryptedPayload>;
    const isValid = (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.v === "number" &&
      typeof parsed.iv === "string" &&
      typeof parsed.ct === "string" &&
      typeof parsed.tag === "string" &&
      typeof parsed.epoch === "number" &&
      typeof parsed.kid === "string"
    );
      return isValid ? (parsed as EncryptedPayload) : null;
  } catch (_parseError) {
      return null;
  }
}

function LastMessagePreview({
  conversationId,
  lastMessage,
  isMyMessage,
  activityText,
}: {
  conversationId: string;
  lastMessage: Conversation["last_message"];
  isMyMessage: boolean;
  activityText: string | null;
}) {
  const encryptedPayload = useMemo(
    () => parseEncryptedPayload(lastMessage?.content),
    [lastMessage?.content]
  );
  const { decryptContent } = useE2EEncryption(conversationId);
  const [decryptedPreview, setDecryptedPreview] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDecryptedPreview(null);

    if (!encryptedPayload || !lastMessage?.sender_id) return;

    const run = async () => {
      const plain = await decryptContent(encryptedPayload, lastMessage.sender_id);
      if (!cancelled) {
        setDecryptedPreview(plain && plain.trim() ? plain : "Зашифрованное сообщение");
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [decryptContent, encryptedPayload, lastMessage?.sender_id]);

  const previewText = activityText
    ? activityText
    : lastMessage?.media_type === "video_circle"
      ? "🎥 Видеосообщение"
      : lastMessage?.media_type === "voice"
        ? "🎤 Голосовое сообщение"
        : lastMessage?.media_type === "video"
          ? "🎬 Видео"
          : lastMessage?.media_url
            ? "📷 Фото"
            : encryptedPayload
              ? decryptedPreview || "Зашифрованное сообщение"
              : (lastMessage?.content || "Нет сообщений");

  return <>{isMyMessage && !activityText ? `Вы: ${previewText}` : previewText}</>;
}

export function ChatsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as LocationState | null;
  const { user, loading: authLoading } = useAuth();
  const { getDraft, hasDraft, saveDraft } = useChatDrafts();
  const { conversations, loading: chatsLoading, error: chatsError, refetch } = useConversations();
  const { channels, loading: channelsLoading, refetch: refetchChannels } = useChannels();
  const { groups, loading: groupsLoading, refetch: refetchGroups } = useGroupChats();
  const { createConversation } = useCreateConversation();
  const { folders, itemsByFolderId, refetch: refetchFolders } = useChatFolders();
  const { settings } = useUserSettings();
  const { calls, missedCalls, profilesById, loading: callsLoading } = useCallHistory();
  const { startCall } = useVideoCallContext();
  const { messages: savedMessages, loading: savedMessagesLoading } = useSavedMessages({ pageSize: 1 });

  // Archive & Pin
  const {
    archivedChatIds,
    archivedCount,
    loading: archivedLoading,
    archiveChat,
    unarchiveChat,
    isArchived,
  } = useArchivedChats();
  const {
    pinnedOrder,
    pinnedChatIds,
    pinChat,
    unpinChat,
    isPinned,
  } = usePinnedChats();

  // Show archived view
  const [showArchive, setShowArchive] = useState(false);

  // Swipe state per item: { [itemKey]: offsetX }
  const [swipeOffsets, setSwipeOffsets] = useState<Record<string, number>>({});
  const swipeStartX = useRef<Record<string, number>>({});
  const swipeStartY = useRef<Record<string, number>>({});
  const swipeActive = useRef<Record<string, boolean>>({});

  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [initialPanelAction, setInitialPanelAction] = useState<"settings" | "timer" | "scheduled" | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<GroupChat | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [inlineSearchQuery, setInlineSearchQuery] = useState("");
  const [inlineSearchActive, setInlineSearchActive] = useState(false);
  const inlineSearchRef = useRef<HTMLInputElement>(null);
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createMode, setCreateMode] = useState<"select" | "channel" | "group">("select");
  const [pendingNewMessageText, setPendingNewMessageText] = useState<string | null>(null);
  const [primaryTab, setPrimaryTab] = useState<"chats" | "calls">("chats");
  const [callsFilter, setCallsFilter] = useState<"all" | "missed">("all");
  const [dmActivityByConversation, setDmActivityByConversation] = useState<
    Record<string, { activity: "typing" | "recording_voice" | "recording_video"; at: number }>
  >({});
  const [activityNowTick, setActivityNowTick] = useState<number>(Date.now());

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const channelInvite = params.get("channel_invite");
    const groupInvite = params.get("group_invite");
    if (!channelInvite && !groupInvite) return;

    let cancelled = false;

    const run = async () => {
      try {
        if (channelInvite) {
          await joinChannelByInviteToken(channelInvite);
          if (!cancelled) toast.success("Вы присоединились к каналу по приглашению");
          await refetchChannels();
        }
        if (groupInvite) {
          await joinGroupByInviteToken(groupInvite);
          if (!cancelled) toast.success("Вы присоединились к группе по приглашению");
          await refetchGroups();
        }
      } catch (err) {
        if (!cancelled) toast.error("Приглашение недействительно или истекло");
      } finally {
        if (!cancelled) {
          const clean = new URL(window.location.href);
          clean.searchParams.delete("channel_invite");
          clean.searchParams.delete("group_invite");
          window.history.replaceState({}, "", clean.toString());
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [location.search, refetchChannels, refetchGroups]);

  const showCallsTab = settings?.show_calls_tab ?? true;

  const visibleTabs = useMemo(() => {
    return folders
      .filter((f) => !f.is_hidden)
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [folders]);

  const defaultTabId = useMemo(() => {
    const all = visibleTabs.find((f) => f.system_kind === "all");
    return all?.id ?? (visibleTabs[0]?.id ?? "all");
  }, [visibleTabs]);

  const longPressTimerRef = useRef<number | null>(null);
  const dragIdRef = useRef<string | null>(null);
  const dragPointerIdRef = useRef<number | null>(null);
  const didDragRef = useRef(false);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const [draggingId, setDraggingId] = useState<string | null>(null);

  const [activeTabId, setActiveTabId] = useState<string>("all");
  const [tabOrder, setTabOrder] = useState<string[]>([]);
  const [unlockedTabs, setUnlockedTabs] = useState<Set<string>>(new Set());
  const handledQueryRef = useRef<string | null>(null);

  useEffect(() => {
    const next = visibleTabs.map((t) => t.id);
    setTabOrder(next);
  }, [visibleTabs]);

  useEffect(() => {
    if (!tabOrder.length) return;
    if (activeTabId === "all") {
      setActiveTabId(defaultTabId);
      return;
    }
    if (!tabOrder.includes(activeTabId)) {
      setActiveTabId(defaultTabId);
    }
  }, [activeTabId, defaultTabId, tabOrder]);

  useEffect(() => {
    if (!showCallsTab && primaryTab === "calls") {
      setPrimaryTab("chats");
    }
  }, [primaryTab, showCallsTab]);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const moveInOrder = useCallback((order: string[], item: string, before: string) => {
    if (item === before) return order;
    const from = order.indexOf(item);
    const to = order.indexOf(before);
    if (from === -1 || to === -1) return order;
    const next = [...order];
    next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
  }, []);

  const pickOverId = useCallback(
    (clientX: number) => {
      const ids = tabOrder;
      let best: { id: string; dist: number } | null = null;
      for (const id of ids) {
        const el = tabRefs.current[id];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const center = r.left + r.width / 2;
        const dist = Math.abs(center - clientX);
        if (!best || dist < best.dist) best = { id, dist };
      }
      return best?.id ?? null;
    },
    [tabOrder],
  );

  const endDrag = useCallback(async () => {
    clearLongPressTimer();
    dragIdRef.current = null;
    dragPointerIdRef.current = null;
    setDraggingId(null);

    if (didDragRef.current && user?.id) {
      const orderedIds = tabOrder;
      // Persist order to Supabase
      const updates = orderedIds
        .map((id, idx) => ({ id, sort_order: idx, user_id: user.id }))
        .filter(Boolean);

      await Promise.all(
        updates.map((u) => supabase.from("chat_folders").update({ sort_order: u.sort_order }).eq("id", u.id)),
      );
    }

    didDragRef.current = false;
  }, [tabOrder, user?.id]);

  const onTabPointerDown = (id: string) => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!user) return;

    clearLongPressTimer();
    didDragRef.current = false;
    dragPointerIdRef.current = e.pointerId;

    longPressTimerRef.current = window.setTimeout(() => {
      dragIdRef.current = id;
      setDraggingId(id);
      didDragRef.current = true;
      try {
        navigator.vibrate?.(10);
      } catch (error) {
        logger.debug("[ChatsPage] Vibration API unavailable", { error });
      }
    }, 220);

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (error) {
      logger.debug("[ChatsPage] setPointerCapture failed", { error });
    }
  };

  const onTabPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const activeDrag = dragIdRef.current;
    if (!activeDrag) return;

    const overId = pickOverId(e.clientX);
    if (!overId || overId === activeDrag) return;

    setTabOrder((prev) => {
      const next = moveInOrder(prev, activeDrag, overId);
      if (next !== prev) {
        didDragRef.current = true;
      }
      return next;
    });
  };

  const onTabPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const activeDrag = dragIdRef.current;
    clearLongPressTimer();

    if (activeDrag) {
      e.preventDefault();
      e.stopPropagation();
      void endDrag();
    }
  };

  const onTabPointerCancel = () => {
    void endDrag();
  };
  const activeFolder = useMemo<ChatFolder | null>(() => {
    return visibleTabs.find((t) => t.id === activeTabId) ?? null;
  }, [activeTabId, visibleTabs]);

  const activeFolderKeys = useMemo(() => {
    if (!activeFolder) return null;
    if (activeFolder.system_kind) return null;
    const folderItems = itemsByFolderId[activeFolder.id] ?? [];
    return new Set(folderItems.map((it) => `${it.item_kind}:${it.item_id}`));
  }, [activeFolder, itemsByFolderId]);
  
  
  // Local scroll container for chat list
  const chatListRef = useRef<HTMLDivElement>(null);
  
  // Pull-down expand hook for stories
  const { expandProgress, isExpanded, toggleExpanded } = usePullDownExpand(chatListRef, {
    threshold: 80,
    collapseScrollThreshold: 10,
  });
  const effectiveExpandProgress = primaryTab === "chats" ? expandProgress : 0;

  type CombinedItem =
    | { kind: "channel"; id: string; activityAt: string; channel: Channel }
    | { kind: "group"; id: string; activityAt: string; group: GroupChat }
    | { kind: "dm"; id: string; activityAt: string; conv: Conversation };

  const combinedItems: CombinedItem[] = useMemo(() => {
    return [
      ...channels.filter((c) => c.is_member).map((channel) => ({
        kind: "channel" as const,
        id: channel.id,
        activityAt: channel.last_message?.created_at || channel.updated_at || channel.created_at,
        channel,
      })),
      ...groups.map((group) => ({
        kind: "group" as const,
        id: group.id,
        activityAt: group.last_message?.created_at || group.updated_at || group.created_at,
        group,
      })),
      ...conversations.map((conv) => ({
        kind: "dm" as const,
        id: conv.id,
        activityAt: conv.last_message?.created_at || conv.updated_at || conv.created_at,
        conv,
      })),
    ].sort((a, b) => new Date(b.activityAt).getTime() - new Date(a.activityAt).getTime());
  }, [channels, conversations, groups]);

  // Archived items (for archive view)
  const archivedItems = useMemo(() => {
    return combinedItems.filter((it) => archivedChatIds.has(it.id));
  }, [combinedItems, archivedChatIds]);

  const visibleItems = useMemo(() => {
    if (showArchive) return archivedItems;

    // Base filter: exclude archived
    const unarchived = combinedItems.filter((it) => !archivedChatIds.has(it.id));

    let filtered: CombinedItem[];
    if (!activeFolder) {
      filtered = unarchived;
    } else if (activeFolder.system_kind === "all") {
      filtered = unarchived;
    } else if (activeFolder.system_kind === "chats") {
      filtered = unarchived.filter((it) => it.kind === "dm");
    } else if (activeFolder.system_kind === "groups") {
      filtered = unarchived.filter((it) => it.kind === "group");
    } else if (activeFolder.system_kind === "channels") {
      filtered = unarchived.filter((it) => it.kind === "channel");
    } else if (!activeFolderKeys) {
      filtered = [];
    } else {
      filtered = unarchived.filter((it) => activeFolderKeys.has(`${it.kind}:${it.id}`));
    }

    // Sort: pinned first (in pinnedOrder sequence), then regular by activityAt
    const pinnedItems: CombinedItem[] = [];
    const regularItems: CombinedItem[] = [];

    // Build pinned in correct order
    for (const pid of pinnedOrder) {
      const item = filtered.find((it) => it.id === pid);
      if (item) pinnedItems.push(item);
    }

    for (const item of filtered) {
      if (!pinnedChatIds.has(item.id)) {
        regularItems.push(item);
      }
    }

    return [...pinnedItems, ...regularItems];
  }, [activeFolder, activeFolderKeys, combinedItems, archivedChatIds, pinnedOrder, pinnedChatIds, showArchive, archivedItems]);

  // Inline search filter
  const displayItems = useMemo(() => {
    const q = inlineSearchQuery.trim().toLowerCase();
    if (!q) return visibleItems;
    return visibleItems.filter((item) => {
      let name = "";
      let preview = "";
      if (item.kind === "channel") {
        name = item.channel.name?.toLowerCase() ?? "";
      } else if (item.kind === "group") {
        name = item.group.name?.toLowerCase() ?? "";
      } else {
        const other = item.conv.participants?.find((p: any) => p?.user_id !== user?.id);
        name = (other?.profile?.display_name ?? "").toLowerCase();
        preview = (item.conv.last_message?.content ?? "").toLowerCase();
      }
      return name.includes(q) || preview.includes(q);
    });
  }, [visibleItems, inlineSearchQuery, user?.id]);

  const activeCalls = useMemo(() => {
    return callsFilter === "missed" ? missedCalls : calls;
  }, [calls, callsFilter, missedCalls]);

  // Get the other participant's info for display
  const getOtherParticipant = (conv: Conversation) => {
    const participants = Array.isArray(conv?.participants) ? conv.participants : [];
    const other = participants.find((p) => p?.user_id !== user?.id);
    return {
      user_id: other?.user_id || "",
      ...(other?.profile || { display_name: fallbackNameFromUserId(other?.user_id), avatar_url: null })
    };
  };

  // Handle incoming conversationId from navigation state
  useEffect(() => {
    if (locationState?.conversationId) {
      // Build participant from passed data (if available)
      const participants = locationState.otherUserId 
        ? [{
            user_id: locationState.otherUserId,
            profile: {
              display_name: locationState.otherDisplayName || fallbackNameFromUserId(locationState.otherUserId),
              avatar_url: locationState.otherAvatarUrl || null
            }
          }]
        : [];

      const immediateConv: Conversation = {
        id: locationState.conversationId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        participants,
        unread_count: 0
      };
      
      setSelectedConversation(immediateConv);
      if (locationState.chatAction) {
        setInitialPanelAction(locationState.chatAction);
      }
      window.history.replaceState({}, document.title);
      refetch();
    }
  }, [locationState, refetch]);

  useEffect(() => {
    const search = location.search;
    if (!search || handledQueryRef.current === search) return;

    const {
      openDmId,
      openChannelId,
      openGroupId,
      invite,
      newMessage,
      startCallUserId,
      startCallType,
    } = parseChatsQueryActions(search);

    let handled = false;

    if (openDmId) {
      const fullConv = conversations.find((c) => c.id === openDmId);
      if (fullConv) {
        setSelectedConversation(fullConv);
        handled = true;
      } else if (!chatsLoading) {
        setSelectedConversation({
          id: openDmId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          participants: [],
          unread_count: 0,
        });
        void refetch();
        handled = true;
      } else {
        return;
      }
    }

    if (openChannelId) {
      const channel = channels.find((c) => c.id === openChannelId);
      if (channel) {
        setSelectedChannel(channel);
        handled = true;
      } else if (channelsLoading) {
        return;
      }
    }

    if (openGroupId) {
      const group = groups.find((g) => g.id === openGroupId);
      if (group) {
        setSelectedGroup(group);
        handled = true;
      } else if (groupsLoading) {
        return;
      }
    }

    if (invite) {
      handled = true;
      void (async () => {
        try {
          await joinChannelByInviteToken(invite);
          toast.success("Вы присоединились к каналу по приглашению");
          await refetchChannels();
          return;
        } catch (error) {
          logger.warn("[ChatsPage] Channel invite join failed, trying group flow", { invite, error });
        }

        try {
          await joinGroupByInviteToken(invite);
          toast.success("Вы присоединились к группе по приглашению");
          await refetchGroups();
        } catch (error) {
          logger.warn("[ChatsPage] Group invite join failed", { invite, error });
          toast.error("Приглашение недействительно или истекло");
        }
      })();
    }

    if (newMessage) {
      setPendingNewMessageText(newMessage);
      setSearchOpen(true);
      handled = true;
    }

    if (startCallUserId) {
      handled = true;
      void startCall(startCallUserId, null, startCallType);
    }

    if (!handled) return;

    handledQueryRef.current = search;
    const nextSearch = clearHandledChatsQueryParams(search);
    navigate(
      {
        pathname: location.pathname,
        search: nextSearch,
      },
      { replace: true, state: location.state }
    );
  }, [
    location.pathname,
    location.search,
    location.state,
    navigate,
    conversations,
    channels,
    groups,
    chatsLoading,
    channelsLoading,
    groupsLoading,
    refetch,
    refetchChannels,
    refetchGroups,
    startCall,
  ]);

  // Hydrate selectedConversation with full data once conversations load
  useEffect(() => {
    const selectedId = selectedConversation?.id;
    if (selectedId && conversations.length > 0) {
      const fullConv = conversations.find(c => c.id === selectedId);
      if (fullConv && fullConv.participants.length > 0) {
        // Replace with the fully-loaded conversation (has last_message, unread_count, etc.)
        setSelectedConversation(fullConv);
      }
    }
  }, [conversations, selectedConversation?.id]);

  const formatTime = (dateStr: string) => formatTelegramTime(dateStr);

  // ── Swipe helpers ──────────────────────────────────────────────────────────

  const SWIPE_THRESHOLD = 60; // px — revealed actions threshold
  const SWIPE_MAX = 120;      // px — max drag distance

  const onSwipeTouchStart = useCallback((key: string, e: React.TouchEvent) => {
    const touch = e.touches[0];
    swipeStartX.current[key] = touch.clientX;
    swipeStartY.current[key] = touch.clientY;
    swipeActive.current[key] = false;
  }, []);

  const onSwipeTouchMove = useCallback((key: string, e: React.TouchEvent) => {
    const touch = e.touches[0];
    const dx = touch.clientX - (swipeStartX.current[key] ?? touch.clientX);
    const dy = Math.abs(touch.clientY - (swipeStartY.current[key] ?? touch.clientY));
    if (!swipeActive.current[key] && dy > Math.abs(dx) * 0.8) return;
    swipeActive.current[key] = true;
    const clamped = Math.max(-SWIPE_MAX, Math.min(SWIPE_MAX, dx));
    setSwipeOffsets((prev) => ({ ...prev, [key]: clamped }));
  }, []);

  const onSwipeTouchEnd = useCallback((key: string) => {
    const offset = swipeOffsets[key] ?? 0;
    const snapped = Math.abs(offset) >= SWIPE_THRESHOLD
      ? (offset < 0 ? -SWIPE_THRESHOLD : SWIPE_THRESHOLD)
      : 0;
    setSwipeOffsets((prev) => ({ ...prev, [key]: snapped }));
    swipeActive.current[key] = false;
  }, [swipeOffsets]);

  const closeSwipe = useCallback((key: string) => {
    setSwipeOffsets((prev) => ({ ...prev, [key]: 0 }));
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setActivityNowTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    const dmConversations = conversations
      .map((conv) => {
        const participants = Array.isArray(conv?.participants) ? conv.participants : [];
        const other = participants.find((p) => p?.user_id !== user.id);
        return { id: conv.id, otherUserId: other?.user_id || null };
      })
      .filter((item): item is { id: string; otherUserId: string } => Boolean(item.otherUserId));

    if (!dmConversations.length) {
      setDmActivityByConversation({});
      return;
    }

    const channels = dmConversations.map(({ id, otherUserId }) => {
      return supabase
        .channel(`typing:${id}`)
        .on(
          "broadcast",
          { event: "typing" },
          (payload: TypingBroadcastPayload) => {
            const p = payload?.payload;
            if (!p || p.user_id !== otherUserId) return;

            const isTyping = !!p.is_typing;
            const activityRaw = String(p.activity || (isTyping ? "typing" : ""));
            const activity =
              activityRaw === "recording_voice" || activityRaw === "recording_video" || activityRaw === "typing"
                ? activityRaw
                : "typing";

            setDmActivityByConversation((prev) => {
              const next = { ...prev };
              if (!isTyping) {
                delete next[id];
                return next;
              }
              next[id] = { activity, at: Date.now() };
              return next;
            });
          }
        )
        .subscribe();
    });

    return () => {
      channels.forEach((channel) => {
        void supabase.removeChannel(channel);
      });
    };
  }, [conversations, user?.id]);

  // Get user IDs already in conversations
  const conversationUserIds = new Set(
    conversations.flatMap((c) => {
      const participants = Array.isArray(c?.participants) ? c.participants : [];
      return participants
        .map((p) => (typeof p?.user_id === "string" ? p.user_id : ""))
        .filter(Boolean);
    })
  );

  const handleUserSelect = async (searchUser: SearchUser) => {
    try {
      const convId = await createConversation(searchUser.user_id);
      if (convId) {
        if (pendingNewMessageText && pendingNewMessageText.trim()) {
          saveDraft(convId, pendingNewMessageText.trim());
          setPendingNewMessageText(null);
        }
        const newConv: Conversation = {
          id: convId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          participants: [{
            user_id: searchUser.user_id,
            profile: {
              display_name: searchUser.display_name,
              avatar_url: searchUser.avatar_url
            }
          }],
          unread_count: 0
        };
        setSelectedConversation(newConv);
      }
    } catch (error) {
      logger.error("[ChatsPage] Failed to create conversation", { error, userId: searchUser.user_id });
    }
  };

  const handleChannelCreated = (channelId: string) => {
    void (async () => {
      await refetchChannels();
      try {
        const { data, error } = await supabase.from("channels").select("*").eq("id", channelId).maybeSingle();
        if (error) throw error;
        if (data) {
          setSelectedChannel({ ...(data as unknown as Channel), is_member: true });
          return;
        }
      } catch (e) {
        logger.warn("[ChatsPage] Failed to fetch newly created channel", { error: e, channelId });
      }

      // Fallback: if state already updated by refetch, pick it from list.
      const newChannel = channels.find((c) => c.id === channelId);
      if (newChannel) setSelectedChannel(newChannel);
    })();
  };

  const handleGroupCreated = (groupId: string) => {
    refetchGroups();
  };

  const openCreateSheet = (mode: "select" | "channel" | "group") => {
    setCreateMode(mode);
    setCreateOpen(true);
  };

  // Show auth prompt if not logged in
  if (!authLoading && !user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center relative">
        <div className="w-20 h-20 rounded-full bg-background/70 dark:bg-white/10 backdrop-blur-xl border border-border/60 dark:border-white/20 flex items-center justify-center mb-4 relative z-10">
          <MessageCircle className="w-10 h-10 text-muted-foreground dark:text-white/60" />
        </div>
        <h2 className="text-xl font-semibold mb-2 text-foreground dark:text-white relative z-10">Войдите для доступа к чатам</h2>
        <p className="text-muted-foreground dark:text-white/60 mb-6 relative z-10">
          Чтобы переписываться и сохранять историю сообщений, необходимо войти в аккаунт
        </p>
        <Button
          onClick={() => navigate("/auth")}
          className="gap-2 bg-background/70 border-border text-foreground hover:bg-muted relative z-10 dark:bg-white/10 dark:border-white/20 dark:text-white dark:hover:bg-white/20"
        >
          <LogIn className="w-4 h-4" />
          Войти
        </Button>
      </div>
    );
  }

  // Calculate total unread count
  const totalUnreadCount = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);

  // Show selected DM conversation
  if (selectedConversation) {
    const other = getOtherParticipant(selectedConversation);
    return (
      <ChatConversation
        conversationId={selectedConversation.id}
        chatName={other.display_name || fallbackNameFromUserId(other.user_id)}
        chatAvatar={other.avatar_url ?? null}
        otherUserId={other.user_id}
        initialOpenPanelAction={initialPanelAction ?? undefined}
        onInitialPanelHandled={() => setInitialPanelAction(null)}
        totalUnreadCount={totalUnreadCount}
        onRefetch={refetch}
        onBack={() => {
          setSelectedConversation(null);
          setInitialPanelAction(null);
          refetch();
        }}
      />
    );
  }

  // Show selected channel
  if (selectedChannel) {
    return (
      <ChannelConversation
        channel={selectedChannel}
        onBack={() => {
          setSelectedChannel(null);
          refetchChannels();
        }}
        onLeave={() => refetchChannels()}
      />
    );
  }

  // Show selected group
  if (selectedGroup) {
    return (
      <GroupConversation
        group={selectedGroup}
        onBack={() => {
          setSelectedGroup(null);
          refetchGroups();
        }}
        onLeave={() => refetchGroups()}
      />
    );
  }

  // Calculate header height based on expand progress
  const primaryTabsHeight = showCallsTab ? PRIMARY_TABS_HEIGHT : 0;
  const filtersHeight = primaryTab === "chats" ? FILTERS_HEIGHT : 0;
  const createActionsHeight = primaryTab === "chats" ? CREATE_ACTIONS_HEIGHT : 0;
  const headerHeight = HEADER_BASE_HEIGHT + primaryTabsHeight + filtersHeight + createActionsHeight + (STORIES_ROW_HEIGHT * effectiveExpandProgress);
  const showChatListPlaceholders = primaryTab === "chats" && !showArchive && archivedLoading;
  const currentUserName =
    (typeof user?.user_metadata?.full_name === "string" && user.user_metadata.full_name.trim()) ||
    user?.email?.split("@")[0] ||
    "Пользователь";

  return (
    <ScrollContainerProvider value={chatListRef}>
      <div className="h-full flex flex-col overflow-hidden relative">
        {/* Dynamic Header with stories stack/row */}
        <div 
          className="flex-shrink-0 overflow-hidden bg-background/80 dark:bg-white/5 backdrop-blur-xl border-b border-border/50 dark:border-white/10"
          style={{ 
            height: headerHeight,
            transition: 'height 0.25s cubic-bezier(0.25, 0.1, 0.25, 1)',
          }}
        >
          {/* Top row: stack (when collapsed) + title + actions */}
          <div className="flex items-center justify-between px-4 h-14">
            {/* Stories stack (collapsed) - left side */}
            <div 
              className="flex-shrink-0"
              style={{ 
                opacity: 1 - effectiveExpandProgress,
                pointerEvents: effectiveExpandProgress > 0.5 ? 'none' : 'auto',
                transition: 'opacity 0.2s ease-out',
              }}
            >
              {primaryTab === "chats" && (
                <ChatStories 
                  expandProgress={0} 
                  mode="stack" 
                  onStackClick={toggleExpanded}
                />
              )}
            </div>
            
            {/* Title / Inline search */}
            {inlineSearchActive ? (
              <div className="flex-1 flex items-center gap-2 mx-2">
                <input
                  ref={inlineSearchRef}
                  type="text"
                  value={inlineSearchQuery}
                  onChange={(e) => setInlineSearchQuery(e.target.value)}
                  placeholder="Поиск чатов..."
                  className="flex-1 h-9 px-3 rounded-lg bg-black/5 dark:bg-white/10 border border-border/50 dark:border-white/20 text-sm text-foreground dark:text-white placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary/50"
                  autoFocus
                />
                <button
                  onClick={() => { setInlineSearchActive(false); setInlineSearchQuery(""); }}
                  className="text-sm text-primary font-medium"
                >
                  Отмена
                </button>
              </div>
            ) : (
              <>
                <h1
                  className="text-lg font-semibold absolute left-1/2 text-foreground dark:text-white"
                  style={{
                    transform: `translateX(-50%) translateX(${(1 - effectiveExpandProgress) * 30}px)`,
                    transition: 'transform 0.25s cubic-bezier(0.25, 0.1, 0.25, 1)',
                  }}
                >
                  {primaryTab === "calls" ? "Звонки" : "Чаты"}
                </h1>

                {/* Actions: Search */}
                {primaryTab === "chats" && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEmergencyOpen(true)}
                      className="w-9 h-9 flex items-center justify-center rounded-full bg-red-500/10 backdrop-blur-xl border border-red-500/20 hover:bg-red-500/15 transition-colors"
                      aria-label="Открыть SOS-центр"
                    >
                      <AlertTriangle className="w-5 h-5 text-red-500" />
                    </button>
                    <button
                      onClick={() => setInlineSearchActive(true)}
                      className="w-9 h-9 flex items-center justify-center rounded-full bg-black/5 dark:bg-white/10 backdrop-blur-xl border border-border/50 dark:border-white/20 hover:bg-black/10 dark:hover:bg-white/20 transition-colors"
                    >
                      <Search className="w-5 h-5 text-foreground dark:text-white" />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
          
          {showCallsTab && (
            <div className="flex items-center gap-2 px-4 h-10">
              <button
                onClick={() => setPrimaryTab("chats")}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium rounded-full transition-all",
                  primaryTab === "chats"
                    ? "bg-black/5 text-foreground dark:bg-white/20 dark:text-white"
                    : "text-muted-foreground hover:text-foreground dark:text-white/50 dark:hover:text-white/80",
                )}
              >
                Чаты
              </button>
              <button
                onClick={() => setPrimaryTab("calls")}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium rounded-full transition-all",
                  primaryTab === "calls"
                    ? "bg-black/5 text-foreground dark:bg-white/20 dark:text-white"
                    : "text-muted-foreground hover:text-foreground dark:text-white/50 dark:hover:text-white/80",
                )}
              >
                Звонки
              </button>
            </div>
          )}

          {/* Unified tabs (system + custom) */}
          {primaryTab === "chats" && (
            <div className="flex items-center gap-2 px-4 h-11 overflow-x-auto no-scrollbar">
              {tabOrder
                .map((id) => visibleTabs.find((t) => t.id === id))
                .filter(Boolean)
                .map((tab) => {
                  const t = tab as ChatFolder;
                  const isActive = activeTabId === t.id;
                  const isLocked = !!t.passcode_hash && !unlockedTabs.has(t.id);

                  return (
                    <button
                      key={t.id}
                      ref={(el) => {
                        tabRefs.current[t.id] = el;
                      }}
                      onClick={async (ev) => {
                        if (draggingId || didDragRef.current) {
                          ev.preventDefault();
                          ev.stopPropagation();
                          return;
                        }

                        if (t.passcode_hash && !unlockedTabs.has(t.id)) {
                          const code = window.prompt("Введите пароль папки");
                          if (!code) return;
                          try {
                            const verdict = await verifyPasscodeHash(code, user?.id ?? "", t.passcode_hash);
                            if (!verdict.match) {
                              toast.error("Неверный пароль");
                              return;
                            }

                            if (verdict.legacy && user?.id) {
                              try {
                                const upgradedHash = await pbkdf2Hash(code);
                                await supabase
                                  .from("chat_folders")
                                  .update({ passcode_hash: upgradedHash })
                                  .eq("id", t.id)
                                  .eq("user_id", user.id);
                              } catch (upgradeError) {
                                logger.warn("[ChatsPage] Legacy folder passcode hash upgrade failed", {
                                  tabId: t.id,
                                  error: upgradeError,
                                });
                              }
                            }

                            setUnlockedTabs((prev) => {
                              const next = new Set(prev);
                              next.add(t.id);
                              return next;
                            });
                          } catch (error) {
                            logger.warn("[ChatsPage] Tab passcode verification failed", { tabId: t.id, error });
                            toast.error("Не удалось проверить пароль");
                            return;
                          }
                        }

                        setActiveTabId(t.id);
                      }}
                      onPointerDown={onTabPointerDown(t.id)}
                      onPointerMove={onTabPointerMove}
                      onPointerUp={onTabPointerUp}
                      onPointerCancel={onTabPointerCancel}
                      className={cn(
                        "px-3 py-1.5 text-sm font-medium rounded-full transition-all select-none flex-shrink-0",
                        "touch-none",
                        isActive
                          ? "bg-black/5 text-foreground dark:bg-white/20 dark:text-white"
                          : "text-muted-foreground hover:text-foreground dark:text-white/50 dark:hover:text-white/80",
                        draggingId === t.id && "scale-[1.06] bg-black/10 ring-2 ring-border/60 shadow-lg cursor-grabbing dark:bg-white/30 dark:ring-white/30",
                        draggingId && draggingId !== t.id && "cursor-grab",
                        isLocked && "opacity-80",
                      )}
                    >
                      {t.name}
                    </button>
                  );
                })}
            </div>
          )}

          {primaryTab === "chats" && (
            <div className="flex items-center gap-2 px-4 h-11 overflow-x-auto no-scrollbar">
              <button
                onClick={() => openCreateSheet("group")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full bg-black/5 text-foreground hover:bg-black/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/20 transition-colors"
              >
                <Users className="w-4 h-4" />
                Группа
              </button>
              <button
                onClick={() => openCreateSheet("channel")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full bg-black/5 text-foreground hover:bg-black/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/20 transition-colors"
              >
                <Megaphone className="w-4 h-4" />
                Канал
              </button>
              <button
                onClick={() => navigate("/bots/new")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full bg-black/5 text-foreground hover:bg-black/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/20 transition-colors"
              >
                <Bot className="w-4 h-4" />
                Чат-бот
              </button>
            </div>
          )}
          
          {/* Stories row (expanded) - appears below title */}
          {primaryTab === "chats" && (
            <div 
              style={{ 
                opacity: effectiveExpandProgress,
                height: STORIES_ROW_HEIGHT * effectiveExpandProgress,
                pointerEvents: effectiveExpandProgress < 0.5 ? 'none' : 'auto',
                transition: 'opacity 0.2s ease-out, height 0.25s cubic-bezier(0.25, 0.1, 0.25, 1)',
                overflow: 'hidden',
              }}
            >
              <ChatStories 
                expandProgress={effectiveExpandProgress} 
                mode="row" 
              />
            </div>
          )}
        </div>

        {/* Scrollable list - unified view */}
        <div 
          ref={chatListRef}
          className="flex-1 overflow-y-auto overscroll-contain px-3 py-2"
        >
          {primaryTab === "calls" ? (
            <>
              <div className="flex items-center gap-2 px-2 py-2">
                <button
                  onClick={() => setCallsFilter("all")}
                  className={cn(
                    "px-3 py-1.5 text-sm font-medium rounded-full transition-all",
                    callsFilter === "all"
                      ? "bg-black/5 text-foreground dark:bg-white/20 dark:text-white"
                      : "text-muted-foreground hover:text-foreground dark:text-white/50 dark:hover:text-white/80",
                  )}
                >
                  Все
                </button>
                <button
                  onClick={() => setCallsFilter("missed")}
                  className={cn(
                    "px-3 py-1.5 text-sm font-medium rounded-full transition-all",
                    callsFilter === "missed"
                      ? "bg-black/5 text-foreground dark:bg-white/20 dark:text-white"
                      : "text-muted-foreground hover:text-foreground dark:text-white/50 dark:hover:text-white/80",
                  )}
                >
                  Пропущенные
                </button>
              </div>

              {callsLoading && (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-muted-foreground/40 dark:border-white/50" />
                </div>
              )}

              {!callsLoading && activeCalls.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center px-6">
                  <div className="w-16 h-16 rounded-full bg-background/70 dark:bg-white/10 backdrop-blur-xl border border-border/60 dark:border-white/20 flex items-center justify-center mb-4">
                    <Phone className="w-8 h-8 text-muted-foreground dark:text-white/60" />
                  </div>
                  <h3 className="font-semibold mb-1 text-foreground dark:text-white">
                    {callsFilter === "missed" ? "Нет пропущенных" : "Нет звонков"}
                  </h3>
                  <p className="text-sm text-muted-foreground dark:text-white/60">
                    История звонков появится после первого вызова
                  </p>
                </div>
              )}

              <div className="divide-y divide-border/60 dark:divide-white/10">
                {activeCalls.map((call) => {
                  const otherId = call.caller_id === user?.id ? call.callee_id : call.caller_id;
                  const profile = otherId ? profilesById[otherId] : null;
                  const name = profile?.display_name || fallbackNameFromUserId(otherId);
                  const isIncoming = call.callee_id === user?.id;
                  const isMissed = call.status === "missed" || call.status === "declined";
                  const callType = call.call_type === "audio" ? "audio" : "video";
                  const statusLabel = isMissed
                    ? "Пропущенный"
                    : callType === "video" ? "Видео" : "Аудио";

                  return (
                    <div
                      key={call.id}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-muted/60 active:bg-muted transition-colors dark:hover:bg-white/5 dark:active:bg-white/10"
                    >
                      <div className="relative flex-shrink-0">
                        <GradientAvatar
                          name={name}
                          seed={otherId || call.id}
                          avatarUrl={profile?.avatar_url ?? null}
                          size="md"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className={cn(
                            "font-medium truncate",
                            isMissed ? "text-destructive dark:text-red-200" : "text-foreground dark:text-white",
                          )}>
                            {name}
                          </span>
                          <span className="text-xs text-muted-foreground/70 dark:text-white/40 flex-shrink-0 ml-2">
                            {formatTime(call.created_at)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <p className={cn(
                            "text-sm truncate flex-1",
                            isMissed ? "text-destructive/80 dark:text-red-200/80" : "text-muted-foreground dark:text-white/50",
                          )}>
                            {isIncoming ? "Входящий" : "Исходящий"} · {statusLabel}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          if (!otherId) return;
                          await startCall(otherId, call.conversation_id, callType, {
                            display_name: name,
                            avatar_url: profile?.avatar_url,
                          });
                        }}
                        className="w-9 h-9 flex items-center justify-center rounded-full bg-black/5 dark:bg-white/10 backdrop-blur-xl border border-border/50 dark:border-white/20 hover:bg-black/10 dark:hover:bg-white/20 transition-colors"
                      >
                        <Phone className="w-4 h-4 text-foreground dark:text-white" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              {/* Loading */}
              {(chatsLoading || channelsLoading || groupsLoading) && (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-muted-foreground/40 dark:border-white/50" />
                </div>
              )}

              {/* Error */}
              {!chatsLoading && chatsError && (
                <div className="py-3">
                  <div className="rounded-2xl bg-background/70 dark:bg-white/10 backdrop-blur-xl border border-border/60 dark:border-white/20 p-4">
                    <p className="font-semibold text-foreground dark:text-white">Не удалось загрузить чаты</p>
                    <p className="mt-1 text-sm text-muted-foreground dark:text-white/60 break-words">{chatsError}</p>
                    <div className="mt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => refetch()}
                        className="bg-background/70 border-border text-foreground hover:bg-muted dark:bg-white/10 dark:border-white/20 dark:text-white dark:hover:bg-white/20"
                      >
                        Повторить
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Empty state */}
              {!chatsLoading && !groupsLoading && !channelsLoading && !chatsError && 
               conversations.length === 0 && groups.length === 0 && channels.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center px-6">
                  <div className="w-16 h-16 rounded-full bg-background/70 dark:bg-white/10 backdrop-blur-xl border border-border/60 dark:border-white/20 flex items-center justify-center mb-4">
                    <MessageCircle className="w-8 h-8 text-muted-foreground dark:text-white/60" />
                  </div>
                  <h3 className="font-semibold mb-1 text-foreground dark:text-white">Нет чатов</h3>
                  <p className="text-sm text-muted-foreground dark:text-white/60">
                    Найдите пользователей через поиск или создайте группу/канал
                  </p>

                </div>
              )}

              {/* Unified list sorted by activity - Telegram style */}
              <div className="divide-y divide-border/60 dark:divide-white/10">

              {/* Archive header (when viewing archive) */}
              {showArchive && (
                <div className="flex items-center gap-3 px-4 py-2 bg-muted/30">
                  <button
                    onClick={() => setShowArchive(false)}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArchiveRestore className="w-4 h-4" />
                    ← Назад к чатам
                  </button>
                  <span className="text-sm font-medium text-foreground dark:text-white ml-auto">
                    Архив ({archivedCount})
                  </span>
                </div>
              )}

              {/* Saved Messages — always first (only in main view) */}
              {!showArchive && (
                <div
                  onClick={() => navigate("/saved-messages")}
                  className="flex min-h-[68px] items-center gap-3 px-4 py-3 hover:bg-muted/60 active:bg-muted transition-colors cursor-pointer dark:hover:bg-white/5 dark:active:bg-white/10"
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center flex-shrink-0">
                    <Bookmark className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-medium text-foreground dark:text-white truncate">
                        Избранное
                      </span>
                      <span
                        className={cn(
                          "ml-2 inline-block w-[44px] text-right text-xs text-muted-foreground/70 dark:text-white/40 flex-shrink-0",
                          !savedMessagesLoading && savedMessages.length > 0 && savedMessages[0]?.saved_at
                            ? "opacity-100"
                            : "opacity-0",
                        )}
                      >
                        {!savedMessagesLoading && savedMessages.length > 0 && savedMessages[0]?.saved_at
                          ? formatTime(savedMessages[0].saved_at)
                          : "00:00"}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground dark:text-white/50 truncate">
                      {savedMessagesLoading
                        ? "Загрузка…"
                        : savedMessages.length > 0
                        ? savedMessages[0]?.content || "Медиафайл"
                        : "Сохраняйте сообщения здесь"}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full text-xs font-medium flex items-center justify-center",
                      !savedMessagesLoading && savedMessages.length > 0
                        ? "bg-blue-500 text-white"
                        : "bg-transparent text-transparent",
                    )}
                  >
                    {!savedMessagesLoading && savedMessages.length > 0 ? savedMessages.length : "0"}
                  </span>
                </div>
              )}

              {/* Archive button (only in main view when archive not empty) */}
              {!showArchive && !archivedLoading && archivedCount > 0 && (
                <div
                  onClick={() => setShowArchive(true)}
                  className="flex min-h-[68px] items-center gap-3 px-4 py-3 hover:bg-muted/60 active:bg-muted transition-colors cursor-pointer dark:hover:bg-white/5 dark:active:bg-white/10"
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-500 to-slate-600 flex items-center justify-center flex-shrink-0">
                    <Archive className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-foreground dark:text-white">
                      Архив
                    </span>
                    <p className="text-sm text-muted-foreground dark:text-white/50">
                      {archivedCount} {archivedCount === 1 ? "чат" : archivedCount < 5 ? "чата" : "чатов"}
                    </p>
                  </div>
                  <Badge className="h-5 min-w-5 rounded-full px-1.5 text-[11px] flex-shrink-0 ml-2 bg-slate-500 text-white border-0">
                    {archivedCount}
                  </Badge>
                </div>
              )}

              {showChatListPlaceholders && Array.from({ length: CHAT_LIST_PLACEHOLDER_COUNT }).map((_, index) => (
                <div
                  key={`chat-list-skeleton-${index}`}
                  className="flex min-h-[72px] items-center gap-3 px-4 py-3"
                  aria-hidden="true"
                >
                  <div className="h-10 w-10 flex-shrink-0 rounded-full bg-muted/60 dark:bg-white/10 animate-pulse" />
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="h-4 w-28 rounded bg-muted/60 dark:bg-white/10 animate-pulse" />
                      <div className="h-3 w-10 rounded bg-muted/40 dark:bg-white/5 animate-pulse" />
                    </div>
                    <div className="h-3 w-40 rounded bg-muted/40 dark:bg-white/5 animate-pulse" />
                  </div>
                </div>
              ))}

              {!showChatListPlaceholders && displayItems.map((item) => {
                const itemKey = `${item.kind}-${item.id}`;
                const swipeOffset = swipeOffsets[itemKey] ?? 0;
                // swipe left (-) = archive/delete actions; swipe right (+) = pin/unpin
                const showLeftActions = swipeOffset <= -SWIPE_THRESHOLD;
                const showRightActions = swipeOffset >= SWIPE_THRESHOLD;

                if (item.kind === "channel") {
                  const channel = item.channel;
                  return (
                    <div key={itemKey} className="relative overflow-hidden">
                      {/* Right swipe reveal: pin */}
                      <AnimatePresence>
                        {showRightActions && (
                          <div className="absolute inset-y-0 left-0 flex items-center px-2 bg-cyan-500/20">
                            <button
                              onClick={() => { closeSwipe(itemKey); }}
                              className="flex flex-col items-center justify-center w-14 h-full text-cyan-600 dark:text-cyan-400 text-xs gap-1"
                            >
                              <Pin className="w-5 h-5" />
                              <span>Закрепить</span>
                            </button>
                          </div>
                        )}
                      </AnimatePresence>
                      {/* Left swipe reveal: archive */}
                      <AnimatePresence>
                        {showLeftActions && (
                          <div className="absolute inset-y-0 right-0 flex items-center px-2 bg-orange-500/20">
                            <button
                              onClick={() => {
                                closeSwipe(itemKey);
                                void archiveChat(channel.id);
                              }}
                              className="flex flex-col items-center justify-center w-14 h-full text-orange-600 dark:text-orange-400 text-xs gap-1"
                            >
                              <Archive className="w-5 h-5" />
                              <span>Архив</span>
                            </button>
                          </div>
                        )}
                      </AnimatePresence>
                      <motion.div
                        animate={{ x: swipeOffset }}
                        transition={{ type: "spring", stiffness: 400, damping: 35 }}
                        onTouchStart={(e) => onSwipeTouchStart(itemKey, e)}
                        onTouchMove={(e) => onSwipeTouchMove(itemKey, e)}
                        onTouchEnd={() => onSwipeTouchEnd(itemKey)}
                        onClick={() => {
                          if (Math.abs(swipeOffset) > 10) { closeSwipe(itemKey); return; }
                          setSelectedChannel(channel);
                        }}
                        className="flex items-center gap-3 px-4 py-3 bg-background hover:bg-muted/60 active:bg-muted transition-colors cursor-pointer dark:bg-transparent dark:hover:bg-white/5"
                      >
                        <div className="relative flex-shrink-0">
                          <GradientAvatar name={channel.name} seed={channel.id} avatarUrl={channel.avatar_url} size="md" />
                          {channel.is_member && (
                            <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center border-2 border-background dark:border-slate-900">
                              <Check className="w-3 h-3 text-white" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="font-medium text-foreground dark:text-white truncate flex items-center gap-1.5">
                              <Megaphone className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                              {channel.name}
                            </span>
                            <span className="text-xs text-muted-foreground/70 dark:text-white/40 flex-shrink-0 ml-2">
                              {formatTime(channel.last_message?.created_at || channel.updated_at)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <p className="text-sm text-muted-foreground dark:text-white/50 truncate flex-1">
                              {channel.last_message?.content || channel.description || `${channel.member_count} подписчиков`}
                            </p>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground/70 dark:text-white/40 ml-2">
                              <Users className="w-3 h-3" />
                              {channel.member_count}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    </div>
                  );
                }

                if (item.kind === "group") {
                  const group = item.group;
                  const pinned = isPinned(group.id);
                  return (
                    <div key={itemKey} className="relative overflow-hidden">
                      <AnimatePresence>
                        {showRightActions && (
                          <div className="absolute inset-y-0 left-0 flex items-center px-2 bg-cyan-500/20">
                            <button
                              onClick={() => {
                                closeSwipe(itemKey);
                                void (pinned ? unpinChat(group.id) : pinChat(group.id));
                              }}
                              className="flex flex-col items-center justify-center w-14 h-full text-cyan-600 dark:text-cyan-400 text-xs gap-1"
                            >
                              {pinned ? <PinOff className="w-5 h-5" /> : <Pin className="w-5 h-5" />}
                              <span>{pinned ? "Открепить" : "Закрепить"}</span>
                            </button>
                          </div>
                        )}
                      </AnimatePresence>
                      <AnimatePresence>
                        {showLeftActions && (
                          <div className="absolute inset-y-0 right-0 flex items-center px-2 bg-orange-500/20">
                            <button
                              onClick={() => {
                                closeSwipe(itemKey);
                                void archiveChat(group.id);
                              }}
                              className="flex flex-col items-center justify-center w-14 h-full text-orange-600 dark:text-orange-400 text-xs gap-1"
                            >
                              <Archive className="w-5 h-5" />
                              <span>Архив</span>
                            </button>
                          </div>
                        )}
                      </AnimatePresence>
                      <motion.div
                        animate={{ x: swipeOffset }}
                        transition={{ type: "spring", stiffness: 400, damping: 35 }}
                        onTouchStart={(e) => onSwipeTouchStart(itemKey, e)}
                        onTouchMove={(e) => onSwipeTouchMove(itemKey, e)}
                        onTouchEnd={() => onSwipeTouchEnd(itemKey)}
                        onClick={() => {
                          if (Math.abs(swipeOffset) > 10) { closeSwipe(itemKey); return; }
                          setSelectedGroup(group);
                        }}
                        className="flex items-center gap-3 px-4 py-3 bg-background hover:bg-muted/60 active:bg-muted transition-colors cursor-pointer dark:bg-transparent dark:hover:bg-white/5"
                      >
                        <div className="relative flex-shrink-0">
                          <GradientAvatar name={group.name} seed={group.id} avatarUrl={group.avatar_url} size="md" />
                          <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center border-2 border-background dark:border-slate-900">
                            <Users className="w-3 h-3 text-white" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="font-medium text-foreground dark:text-white truncate flex items-center gap-1.5">
                              {pinned && <Pin className="w-3 h-3 text-cyan-400 flex-shrink-0" />}
                              {group.name}
                            </span>
                            <span className="text-xs text-muted-foreground/70 dark:text-white/40 flex-shrink-0 ml-2">
                              {formatTime(group.last_message?.created_at || group.updated_at)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <p className="text-sm text-muted-foreground dark:text-white/50 truncate flex-1">
                              {group.last_message?.content || `${group.member_count} участников`}
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    </div>
                  );
                }

                const conv = item.conv;
                const other = getOtherParticipant(conv);
                const lastMessage = conv.last_message;
                const isMyMessage = lastMessage?.sender_id === user?.id;
                const liveActivity = dmActivityByConversation[conv.id];
                const activityIsFresh = liveActivity && activityNowTick - liveActivity.at < 5000;
                const activityText =
                  activityIsFresh && liveActivity
                    ? liveActivity.activity === "recording_voice"
                      ? "🎤 записывает голосовое…"
                      : liveActivity.activity === "recording_video"
                        ? "🎥 записывает кружочек…"
                        : "печатает…"
                    : null;

                const pinned = isPinned(conv.id);
                const archived = isArchived(conv.id);

                return (
                  <div key={itemKey} className="relative overflow-hidden">
                    {/* Right swipe reveal: pin/unpin */}
                    <AnimatePresence>
                      {showRightActions && (
                        <div className="absolute inset-y-0 left-0 flex items-center px-2 bg-cyan-500/20">
                          <button
                            onClick={() => {
                              closeSwipe(itemKey);
                              void (pinned ? unpinChat(conv.id) : pinChat(conv.id));
                            }}
                            className="flex flex-col items-center justify-center w-14 h-full text-cyan-600 dark:text-cyan-400 text-xs gap-1"
                          >
                            {pinned ? <PinOff className="w-5 h-5" /> : <Pin className="w-5 h-5" />}
                            <span>{pinned ? "Открепить" : "Закреп."}</span>
                          </button>
                        </div>
                      )}
                    </AnimatePresence>
                    {/* Left swipe reveal: archive/unarchive */}
                    <AnimatePresence>
                      {showLeftActions && (
                        <div className="absolute inset-y-0 right-0 flex items-center px-2 bg-orange-500/20">
                          <button
                            onClick={() => {
                              closeSwipe(itemKey);
                              void (archived ? unarchiveChat(conv.id) : archiveChat(conv.id));
                            }}
                            className="flex flex-col items-center justify-center w-14 h-full text-orange-600 dark:text-orange-400 text-xs gap-1"
                          >
                            {archived ? <ArchiveRestore className="w-5 h-5" /> : <Archive className="w-5 h-5" />}
                            <span>{archived ? "Достать" : "Архив"}</span>
                          </button>
                        </div>
                      )}
                    </AnimatePresence>
                    <motion.div
                      animate={{ x: swipeOffset }}
                      transition={{ type: "spring", stiffness: 400, damping: 35 }}
                      onTouchStart={(e) => onSwipeTouchStart(itemKey, e)}
                      onTouchMove={(e) => onSwipeTouchMove(itemKey, e)}
                      onTouchEnd={() => onSwipeTouchEnd(itemKey)}
                      onClick={() => {
                        if (Math.abs(swipeOffset) > 10) { closeSwipe(itemKey); return; }
                        setSelectedConversation({ ...conv, unread_count: 0 });
                        refetch();
                      }}
                      className="flex items-center gap-3 px-4 py-3 bg-background hover:bg-muted/60 active:bg-muted transition-colors cursor-pointer dark:bg-transparent dark:hover:bg-white/5"
                    >
                      <div className="relative flex-shrink-0">
                        <GradientAvatar
                          name={other.display_name || "User"}
                          seed={conv.id}
                          avatarUrl={other.avatar_url}
                          size="md"
                        />
                        <ChatPresenceDot userId={other.user_id} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="font-medium text-foreground dark:text-white truncate flex items-center gap-1.5">
                            {pinned && <Pin className="w-3 h-3 text-cyan-400 flex-shrink-0" />}
                            {other.display_name || fallbackNameFromUserId(other.user_id)}
                          </span>
                          <span className="text-xs text-muted-foreground/70 dark:text-white/40 flex-shrink-0 ml-2">
                            {formatTime(lastMessage?.created_at || conv.updated_at)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1 flex-1 min-w-0">
                            {!activityText && !hasDraft(conv.id) && isMyMessage && lastMessage?.is_read && (
                              <CheckCheck className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                            )}
                            {!activityText && !hasDraft(conv.id) && isMyMessage && !lastMessage?.is_read && (
                              <Check className="w-4 h-4 text-muted-foreground/60 dark:text-white/40 flex-shrink-0" />
                            )}
                            {hasDraft(conv.id) && !activityText ? (
                              <p className="text-sm truncate">
                                <span className="text-red-500 font-medium">Черновик: </span>
                                <span className="text-muted-foreground dark:text-white/50">{getDraft(conv.id)?.slice(0, 50)}</span>
                              </p>
                            ) : (
                              <p
                                className={cn(
                                  "text-sm truncate",
                                  activityText
                                    ? "text-cyan-400"
                                    : "text-muted-foreground dark:text-white/50"
                                )}
                              >
                                <LastMessagePreview
                                  conversationId={conv.id}
                                  lastMessage={lastMessage}
                                  isMyMessage={isMyMessage}
                                  activityText={activityText}
                                />
                              </p>
                            )}
                          </div>

                          {conv.unread_count > 0 && (
                            <Badge className="h-5 min-w-5 rounded-full px-1.5 text-[11px] flex-shrink-0 ml-2 bg-cyan-500 text-white border-0">
                              {conv.unread_count}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  </div>
                );
              })}
              </div>
            </>
          )}
        </div>

        {/* Search Sheet */}
        <ChatSearchSheet
          open={searchOpen}
          onOpenChange={setSearchOpen}
          onStartChat={handleUserSelect}
          existingUserIds={conversationUserIds}
          currentUserId={user?.id}
        />

        {user?.id && (
          <EmergencySOSSheet
            open={emergencyOpen}
            onClose={() => setEmergencyOpen(false)}
            currentUserId={user.id}
            currentUserName={currentUserName}
            initialType="sos"
          />
        )}

        {/* Create Chat Sheet */}
        <CreateChatSheet
          open={createOpen}
          onOpenChange={setCreateOpen}
          initialMode={createMode}
          onChannelCreated={handleChannelCreated}
          onGroupCreated={handleGroupCreated}
        />
      </div>
    </ScrollContainerProvider>
  );
}

