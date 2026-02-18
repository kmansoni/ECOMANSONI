import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Search, Check, CheckCheck, LogIn, MessageCircle, Plus, Megaphone, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GradientAvatar } from "@/components/ui/gradient-avatar";
import { BrandBackground } from "@/components/ui/brand-background";
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
import { SearchUser } from "@/hooks/useSearch";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import { ScrollContainerProvider } from "@/contexts/ScrollContainerContext";
import { usePullDownExpand } from "@/hooks/usePullDownExpand";


interface LocationState {
  conversationId?: string;
  chatName?: string;
  otherUserId?: string;
  otherDisplayName?: string;
  otherAvatarUrl?: string | null;
}

// Animation constants
const HEADER_BASE_HEIGHT = 56;
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
  
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<GroupChat | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<"all" | "chats" | "groups" | "channels">("all");
  
  
  // Local scroll container for chat list
  const chatListRef = useRef<HTMLDivElement>(null);
  
  // Pull-down expand hook for stories
  const { expandProgress, isExpanded, toggleExpanded } = usePullDownExpand(chatListRef, {
    threshold: 80,
    collapseScrollThreshold: 10,
  });

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
    if (selectedConversation && conversations.length > 0) {
      const fullConv = conversations.find(c => c.id === selectedConversation.id);
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
    refetchChannels();
    const newChannel = channels.find(c => c.id === channelId);
    if (newChannel) {
      setSelectedChannel(newChannel);
    }
  };

  const handleGroupCreated = (groupId: string) => {
    refetchGroups();
  };

  // Show auth prompt if not logged in
  if (!authLoading && !user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center relative">
        <BrandBackground />
        <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 flex items-center justify-center mb-4 relative z-10">
          <MessageCircle className="w-10 h-10 text-white/60" />
        </div>
        <h2 className="text-xl font-semibold mb-2 text-white relative z-10">Войдите для доступа к чатам</h2>
        <p className="text-white/60 mb-6 relative z-10">
          Чтобы переписываться и сохранять историю сообщений, необходимо войти в аккаунт
        </p>
        <Button onClick={() => navigate("/auth")} className="gap-2 bg-white/10 backdrop-blur-xl border border-white/20 text-white hover:bg-white/20 relative z-10">
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
        chatAvatar={other.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedConversation.id}`}
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
  const headerHeight = HEADER_BASE_HEIGHT + FILTERS_HEIGHT + (STORIES_ROW_HEIGHT * expandProgress);

  type CombinedItem =
    | { kind: "channel"; id: string; activityAt: string; channel: Channel }
    | { kind: "group"; id: string; activityAt: string; group: GroupChat }
    | { kind: "dm"; id: string; activityAt: string; conv: Conversation };

  const combinedItems: CombinedItem[] = [
    ...(activeFilter === "all" || activeFilter === "channels" 
      ? channels.map((channel) => ({
          kind: "channel" as const,
          id: channel.id,
          activityAt: channel.last_message?.created_at || channel.updated_at || channel.created_at,
          channel,
        }))
      : []),
    ...(activeFilter === "all" || activeFilter === "groups"
      ? groups.map((group) => ({
          kind: "group" as const,
          id: group.id,
          activityAt: group.last_message?.created_at || group.updated_at || group.created_at,
          group,
        }))
      : []),
    ...(activeFilter === "all" || activeFilter === "chats"
      ? conversations.map((conv) => ({
          kind: "dm" as const,
          id: conv.id,
          activityAt: conv.last_message?.created_at || conv.updated_at || conv.created_at,
          conv,
        }))
      : []),
  ].sort((a, b) => new Date(b.activityAt).getTime() - new Date(a.activityAt).getTime());

  return (
    <ScrollContainerProvider value={chatListRef}>
      <div className="h-full flex flex-col overflow-hidden relative">
        <BrandBackground />

        {/* Dynamic Header with stories stack/row */}
        <div 
          className="flex-shrink-0 overflow-hidden bg-white/5 backdrop-blur-xl border-b border-white/10"
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
                opacity: 1 - expandProgress,
                pointerEvents: expandProgress > 0.5 ? 'none' : 'auto',
                transition: 'opacity 0.2s ease-out',
              }}
            >
              <ChatStories 
                expandProgress={0} 
                mode="stack" 
                onStackClick={toggleExpanded}
              />
            </div>
            
            {/* Title - shifts based on expand */}
            <h1 
              className="text-lg font-semibold absolute left-1/2 text-white"
              style={{
                transform: `translateX(-50%) translateX(${(1 - expandProgress) * 30}px)`,
                transition: 'transform 0.25s cubic-bezier(0.25, 0.1, 0.25, 1)',
              }}
            >
              Чаты
            </h1>
            
            {/* Actions: Search + Create */}
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setSearchOpen(true)}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 backdrop-blur-xl border border-white/20 hover:bg-white/20 transition-colors"
              >
                <Search className="w-5 h-5 text-white" />
              </button>
              <button 
                onClick={() => setCreateOpen(true)}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 backdrop-blur-xl border border-white/20 hover:bg-white/20 transition-colors"
              >
                <Plus className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>
          
          {/* Filter tabs */}
          <div className="flex items-center gap-2 px-4 h-11">
            {[
              { id: "all", label: "Все" },
              { id: "chats", label: "Чаты" },
              { id: "groups", label: "Группы" },
              { id: "channels", label: "Каналы" },
            ].map((filter) => (
              <button
                key={filter.id}
                onClick={() => setActiveFilter(filter.id as typeof activeFilter)}
                className={`px-3 py-1.5 text-sm font-medium rounded-full transition-all ${
                  activeFilter === filter.id
                    ? "bg-white/20 text-white"
                    : "text-white/50 hover:text-white/80"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
          
          {/* Stories row (expanded) - appears below title */}
          <div 
            style={{ 
              opacity: expandProgress,
              height: STORIES_ROW_HEIGHT * expandProgress,
              pointerEvents: expandProgress < 0.5 ? 'none' : 'auto',
              transition: 'opacity 0.2s ease-out, height 0.25s cubic-bezier(0.25, 0.1, 0.25, 1)',
              overflow: 'hidden',
            }}
          >
            <ChatStories 
              expandProgress={expandProgress} 
              mode="row" 
            />
          </div>
        </div>

        {/* Scrollable list - unified view */}
        <div 
          ref={chatListRef}
          className="flex-1 overflow-y-auto overscroll-contain px-3 py-2"
        >
          {/* Loading */}
          {(chatsLoading || channelsLoading || groupsLoading) && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white/50" />
            </div>
          )}

          {/* Error */}
          {!chatsLoading && chatsError && (
            <div className="py-3">
              <div className="rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 p-4">
                <p className="font-semibold text-white">Не удалось загрузить чаты</p>
                <p className="mt-1 text-sm text-white/60 break-words">{chatsError}</p>
                <div className="mt-3">
                  <Button variant="outline" size="sm" onClick={() => refetch()} className="bg-white/10 border-white/20 text-white hover:bg-white/20">Повторить</Button>
                </div>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!chatsLoading && !groupsLoading && !channelsLoading && !chatsError && 
           conversations.length === 0 && groups.length === 0 && channels.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center px-6">
              <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 flex items-center justify-center mb-4">
                <MessageCircle className="w-8 h-8 text-white/60" />
              </div>
              <h3 className="font-semibold mb-1 text-white">Нет чатов</h3>
              <p className="text-sm text-white/60">
                Найдите пользователей через поиск или создайте группу/канал
              </p>
            </div>
          )}

          {/* Unified list sorted by activity - Telegram style */}
          <div className="divide-y divide-white/10">
          {combinedItems.map((item, index) => {
            if (item.kind === "channel") {
              const channel = item.channel;
              return (
                <div
                  key={`channel-${channel.id}`}
                  onClick={() => setSelectedChannel(channel)}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 active:bg-white/10 transition-colors cursor-pointer"
                >
                  <div className="relative flex-shrink-0">
                    <GradientAvatar
                      name={channel.name}
                      seed={channel.id}
                      avatarUrl={channel.avatar_url}
                      size="md"
                    />
                    {channel.is_member && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center border-2 border-slate-900">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-medium text-white truncate flex items-center gap-1.5">
                        <Megaphone className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                        {channel.name}
                      </span>
                      <span className="text-xs text-white/40 flex-shrink-0 ml-2">
                        {formatTime(channel.last_message?.created_at || channel.updated_at)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-white/50 truncate flex-1">
                        {channel.last_message?.content || channel.description || `${channel.member_count} подписчиков`}
                      </p>
                      <div className="flex items-center gap-1 text-xs text-white/40 ml-2">
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
                  className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 active:bg-white/10 transition-colors cursor-pointer"
                >
                  <div className="relative flex-shrink-0">
                    <GradientAvatar
                      name={group.name}
                      seed={group.id}
                      avatarUrl={group.avatar_url}
                      size="md"
                    />
                    <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center border-2 border-slate-900">
                      <Users className="w-3 h-3 text-white" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-medium text-white truncate">
                        {group.name}
                      </span>
                      <span className="text-xs text-white/40 flex-shrink-0 ml-2">
                        {formatTime(group.last_message?.created_at || group.updated_at)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-white/50 truncate flex-1">
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
                className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 active:bg-white/10 transition-colors cursor-pointer"
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
                    <span className="font-medium text-white truncate">
                      {other.display_name || "Пользователь"}
                    </span>
                    <span className="text-xs text-white/40 flex-shrink-0 ml-2">
                      {formatTime(lastMessage?.created_at || conv.updated_at)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      {isMyMessage && lastMessage?.is_read && (
                        <CheckCheck className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                      )}
                      {isMyMessage && !lastMessage?.is_read && (
                        <Check className="w-4 h-4 text-white/40 flex-shrink-0" />
                      )}
                      <p className="text-sm text-white/50 truncate">
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
