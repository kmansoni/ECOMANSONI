import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Search, Check, CheckCheck, LogIn, MessageCircle, Megaphone, Users, Phone } from "lucide-react";
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
import { useConversations, Conversation, useCreateConversation } from "@/hooks/useChat";
import { useChannels, Channel } from "@/hooks/useChannels";
import { useGroupChats, GroupChat } from "@/hooks/useGroupChats";
import { useChatFolders, type ChatFolder } from "@/hooks/useChatFolders";
import { useUserSettings } from "@/contexts/UserSettingsContext";
import { useCallHistory } from "@/hooks/useCallHistory";
import { useVideoCallContext } from "@/contexts/VideoCallContext";
import { SearchUser } from "@/hooks/useSearch";
import { joinChannelByInviteToken, joinGroupByInviteToken } from "@/lib/community-controls";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import { ScrollContainerProvider } from "@/contexts/ScrollContainerContext";
import { usePullDownExpand } from "@/hooks/usePullDownExpand";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { sha256Hex } from "@/lib/passcode";


interface LocationState {
  conversationId?: string;
  chatName?: string;
  otherUserId?: string;
  otherDisplayName?: string;
  otherAvatarUrl?: string | null;
}

// Animation constants
const HEADER_BASE_HEIGHT = 56;
const PRIMARY_TABS_HEIGHT = 40;
const FILTERS_HEIGHT = 44;
const STORIES_ROW_HEIGHT = 92;

export function ChatsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as LocationState | null;
  const { user, loading: authLoading } = useAuth();
  const { conversations, loading: chatsLoading, error: chatsError, refetch } = useConversations();
  const { channels, loading: channelsLoading, refetch: refetchChannels } = useChannels();
  const { groups, loading: groupsLoading, refetch: refetchGroups } = useGroupChats();
  const { createConversation } = useCreateConversation();
  const { folders, itemsByFolderId, refetch: refetchFolders } = useChatFolders();
  const { settings } = useUserSettings();
  const { calls, missedCalls, profilesById, loading: callsLoading } = useCallHistory();
  const { startCall } = useVideoCallContext();

  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<GroupChat | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [primaryTab, setPrimaryTab] = useState<"chats" | "calls">("chats");
  const [callsFilter, setCallsFilter] = useState<"all" | "missed">("all");

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
      } catch {
        // ignore
      }
    }, 220);

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
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
      ...channels.map((channel) => ({
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

  const visibleItems = useMemo(() => {
    if (!activeFolder) return combinedItems;

    // System folders: automatic distribution
    if (activeFolder.system_kind === "all") return combinedItems;
    if (activeFolder.system_kind === "chats") return combinedItems.filter((it) => it.kind === "dm");
    if (activeFolder.system_kind === "groups") return combinedItems.filter((it) => it.kind === "group");
    if (activeFolder.system_kind === "channels") return combinedItems.filter((it) => it.kind === "channel");

    // Custom folders: explicit selection
    if (!activeFolderKeys) return [];
    return combinedItems.filter((it) => activeFolderKeys.has(`${it.kind}:${it.id}`));
  }, [activeFolder, activeFolderKeys, combinedItems]);

  const activeCalls = useMemo(() => {
    return callsFilter === "missed" ? missedCalls : calls;
  }, [calls, callsFilter, missedCalls]);

  // Get the other participant's info for display
  const getOtherParticipant = (conv: Conversation) => {
    const other = conv.participants.find((p) => p.user_id !== user?.id);
    return {
      user_id: other?.user_id || "",
      ...(other?.profile || { display_name: "Пользователь", avatar_url: null })
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
              display_name: locationState.otherDisplayName || "Пользователь",
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
      window.history.replaceState({}, document.title);
      refetch();
    }
  }, [locationState, refetch]);

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

  const formatTime = (dateStr: string) => {
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: false, locale: ru });
    } catch {
      return "";
    }
  };

  // Get user IDs already in conversations
  const conversationUserIds = new Set(
    conversations.flatMap(c => c.participants.map(p => p.user_id))
  );

  const handleUserSelect = async (searchUser: SearchUser) => {
    try {
      const convId = await createConversation(searchUser.user_id);
      if (convId) {
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
      console.error("Failed to create conversation:", error);
    }
  };

  const handleChannelCreated = (channelId: string) => {
    void (async () => {
      await refetchChannels();
      try {
        const { data, error } = await supabase.from("channels").select("*").eq("id", channelId).maybeSingle();
        if (error) throw error;
        if (data) {
          setSelectedChannel({ ...(data as any), is_member: true });
          return;
        }
      } catch (e) {
        console.warn("handleChannelCreated: failed to fetch new channel", e);
      }

      // Fallback: if state already updated by refetch, pick it from list.
      const newChannel = channels.find((c) => c.id === channelId);
      if (newChannel) setSelectedChannel(newChannel);
    })();
  };

  const handleGroupCreated = (groupId: string) => {
    refetchGroups();
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
        chatName={other.display_name || "Пользователь"}
        chatAvatar={other.avatar_url ?? null}
        otherUserId={other.user_id}
        totalUnreadCount={totalUnreadCount}
        onRefetch={refetch}
        onBack={() => {
          setSelectedConversation(null);
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
  const headerHeight = HEADER_BASE_HEIGHT + primaryTabsHeight + filtersHeight + (STORIES_ROW_HEIGHT * effectiveExpandProgress);

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
            
            {/* Title - shifts based on expand */}
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
                  onClick={() => setSearchOpen(true)}
                  className="w-9 h-9 flex items-center justify-center rounded-full bg-black/5 dark:bg-white/10 backdrop-blur-xl border border-border/50 dark:border-white/20 hover:bg-black/10 dark:hover:bg-white/20 transition-colors"
                >
                  <Search className="w-5 h-5 text-foreground dark:text-white" />
                </button>
              </div>
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
                            const hash = await sha256Hex(code);
                            if (hash !== t.passcode_hash) {
                              toast.error("Неверный пароль");
                              return;
                            }
                            setUnlockedTabs((prev) => {
                              const next = new Set(prev);
                              next.add(t.id);
                              return next;
                            });
                          } catch {
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
                  const name = profile?.display_name || "Пользователь";
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
                          await startCall(otherId, call.conversation_id, callType);
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
              {visibleItems.map((item) => {
                if (item.kind === "channel") {
                  const channel = item.channel;
                  return (
                    <div
                      key={`channel-${channel.id}`}
                      onClick={() => setSelectedChannel(channel)}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-muted/60 active:bg-muted transition-colors cursor-pointer dark:hover:bg-white/5 dark:active:bg-white/10"
                    >
                      <div className="relative flex-shrink-0">
                        <GradientAvatar
                          name={channel.name}
                          seed={channel.id}
                          avatarUrl={channel.avatar_url}
                          size="md"
                        />
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
                    </div>
                  );
                }

                if (item.kind === "group") {
                  const group = item.group;
                  return (
                    <div
                      key={`group-${group.id}`}
                      onClick={() => setSelectedGroup(group)}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-muted/60 active:bg-muted transition-colors cursor-pointer dark:hover:bg-white/5 dark:active:bg-white/10"
                    >
                      <div className="relative flex-shrink-0">
                        <GradientAvatar
                          name={group.name}
                          seed={group.id}
                          avatarUrl={group.avatar_url}
                          size="md"
                        />
                        <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center border-2 border-background dark:border-slate-900">
                          <Users className="w-3 h-3 text-white" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="font-medium text-foreground dark:text-white truncate">
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
                    </div>
                  );
                }

                const conv = item.conv;
                const other = getOtherParticipant(conv);
                const lastMessage = conv.last_message;
                const isMyMessage = lastMessage?.sender_id === user?.id;

                return (
                  <div
                    key={`dm-${conv.id}`}
                    onClick={() => setSelectedConversation(conv)}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-muted/60 active:bg-muted transition-colors cursor-pointer dark:hover:bg-white/5 dark:active:bg-white/10"
                  >
                    <div className="relative flex-shrink-0">
                      <GradientAvatar
                        name={other.display_name || "User"}
                        seed={conv.id}
                        avatarUrl={other.avatar_url}
                        size="md"
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="font-medium text-foreground dark:text-white truncate">
                          {other.display_name || "Пользователь"}
                        </span>
                        <span className="text-xs text-muted-foreground/70 dark:text-white/40 flex-shrink-0 ml-2">
                          {formatTime(lastMessage?.created_at || conv.updated_at)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1 flex-1 min-w-0">
                          {isMyMessage && lastMessage?.is_read && (
                            <CheckCheck className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                          )}
                          {isMyMessage && !lastMessage?.is_read && (
                            <Check className="w-4 h-4 text-muted-foreground/60 dark:text-white/40 flex-shrink-0" />
                          )}
                          <p className="text-sm text-muted-foreground dark:text-white/50 truncate">
                            {lastMessage?.media_type === 'video_circle' 
                              ? '🎥 Видеосообщение'
                              : lastMessage?.media_type === 'voice'
                              ? '🎤 Голосовое сообщение'
                              : lastMessage?.media_url
                              ? '📷 Фото'
                              : lastMessage?.content || "Нет сообщений"}
                          </p>
                        </div>

                        {conv.unread_count > 0 && (
                          <Badge className="h-5 min-w-5 rounded-full px-1.5 text-[11px] flex-shrink-0 ml-2 bg-cyan-500 text-white border-0">
                            {conv.unread_count}
                          </Badge>
                        )}
                      </div>
                    </div>
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

        {/* Create Chat Sheet */}
        <CreateChatSheet
          open={createOpen}
          onOpenChange={setCreateOpen}
          onChannelCreated={handleChannelCreated}
          onGroupCreated={handleGroupCreated}
        />
      </div>
    </ScrollContainerProvider>
  );
}

