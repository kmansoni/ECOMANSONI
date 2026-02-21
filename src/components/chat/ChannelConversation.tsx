import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, Eye, Link, MoreVertical, Search, Send, Share2, Volume2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import type { Channel } from "@/hooks/useChannels";
import { useChannelMessages, useJoinChannel } from "@/hooks/useChannels";
import { useChannelCapabilities } from "@/hooks/useChannelCapabilities";
import { useCommunityGlobalSettings, useCommunityInvites } from "@/hooks/useCommunityControls";
import { useChatOpen } from "@/contexts/ChatOpenContext";
import { GradientAvatar } from "@/components/ui/gradient-avatar";

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
  const { messages, loading, sendMessage } = useChannelMessages(channel.id);
  const { joinChannel, leaveChannel } = useJoinChannel();
  const { can, canRpc, role } = useChannelCapabilities(channel);
  const { settings, update: updateGlobalSettings } = useCommunityGlobalSettings();
  const { createChannelInvite } = useCommunityInvites();
  const [isMember, setIsMember] = useState(channel.is_member);
  const [draftPost, setDraftPost] = useState("");
  const [sendingPost, setSendingPost] = useState(false);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const canCreatePosts = isMember && can("channel.posts.create");
  const canInvite = isMember && can("channel.members.invite") && (settings?.allow_channel_invites ?? true);

  useEffect(() => {
    setIsChatOpen(true);
    return () => setIsChatOpen(false);
  }, [setIsChatOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    setShowScrollDown(scrollHeight - scrollTop - clientHeight > 200);
  };

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

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

      await sendMessage(text);
      setDraftPost("");
      toast.success("Пост опубликован");
    } catch (err) {
      console.error("Failed to publish post:", err);
      toast.error("Не удалось опубликовать пост");
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

  const formatTime = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "HH:mm");
    } catch {
      return "";
    }
  };

  return (
    <div className="h-full flex flex-col relative">
      <div className="flex-shrink-0 flex items-center gap-2 px-2 py-2 bg-card border-b border-border relative z-10">
        <button onClick={onBack} className="flex items-center gap-1 text-primary">
          <ArrowLeft className="w-5 h-5" />
          <span className="text-sm font-medium">{stableIntInRange(`channel:${channel.id}:header`, 10, 109)}</span>
        </button>

        <GradientAvatar
          name={channel.name}
          seed={channel.id}
          avatarUrl={channel.avatar_url}
          size="sm"
          className="w-9 h-9 text-xs border-border/60"
        />

        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-foreground text-sm truncate">{channel.name}</h2>
          <p className="text-[11px] text-muted-foreground">{formatSubscribers(channel.member_count || 0)}</p>
        </div>

        <button className="p-2 text-muted-foreground hover:text-foreground">
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
            <DropdownMenuItem onClick={handleCreateInvite} disabled={!canInvite}>
              <Link className="w-4 h-4 mr-2" />
              Пригласить в канал
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex-shrink-0 bg-card border-b border-border relative z-10">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-0.5 h-8 bg-primary rounded-full flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-foreground truncate">Закрепленное сообщение</p>
              <p className="text-xs text-muted-foreground truncate">Канал подключен к capability engine</p>
            </div>
          </div>
          <Button
            onClick={isMember ? handlePublishPost : handleJoin}
            size="sm"
            className="rounded-full px-4 h-8 text-xs font-medium"
            disabled={isMember && (!canCreatePosts || sendingPost || !draftPost.trim())}
          >
            {!isMember ? "Подписаться" : canCreatePosts ? "Опубликовать" : "Только чтение"}
          </Button>
        </div>
      </div>

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

        {!loading && messages.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <p>Пока нет публикаций</p>
          </div>
        )}

        {messages.map((msg) => {
          const viewCount = Number.isFinite((msg as any)?.views_count) ? Number((msg as any).views_count) : 0;
          const postReactions: Array<{ emoji: string; count: number }> = Array.isArray((msg as any)?.reactions)
            ? ((msg as any).reactions as any[])
                .filter((r) => r && typeof r.emoji === "string" && Number.isFinite(r.count))
                .map((r) => ({ emoji: String(r.emoji), count: Number(r.count) }))
            : [];

          return (
            <div key={msg.id} className="flex flex-col gap-1">
              <div className="bg-card rounded-2xl overflow-hidden shadow-sm border border-border/50 dark:bg-[rgba(35,35,42,0.45)] dark:backdrop-blur-xl dark:border-white/10 dark:shadow-[0_0_0_1px_rgba(15,69,255,0.10)_inset,0_0_24px_rgba(15,69,255,0.10),0_0_24px_rgba(106,54,255,0.08)]">
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

              {msg.media_url && (
                <div className="relative">
                  <img src={msg.media_url} alt="" className="w-full max-h-80 object-cover" />
                  <div className="absolute top-2 left-2 bg-black/60 rounded px-1.5 py-0.5 text-white text-xs flex items-center gap-1">
                    <span>00:32</span>
                    <Volume2 className="w-3 h-3" />
                  </div>
                </div>
              )}

              <div className="px-3 py-2">
                <p className="text-foreground text-[15px] leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
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
                <button className="text-muted-foreground hover:text-foreground transition-colors">
                  <Share2 className="w-4 h-4" />
                </button>
              </div>
              </div>

              {/* Time (outside card) */}
              <div className="px-1 text-xs text-muted-foreground dark:text-white/50">
                {formatTime(msg.created_at)}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {showScrollDown && (
        <button
          onClick={scrollToBottom}
          className="absolute right-4 bottom-20 w-10 h-10 rounded-full bg-card flex items-center justify-center shadow-lg hover:bg-muted transition-colors border border-border"
        >
          <ChevronDown className="w-6 h-6 text-foreground" />
        </button>
      )}

      {isMember && (
        <div className="flex-shrink-0 px-3 py-3 relative z-10 backdrop-blur-xl bg-black/20 border-t border-white/10 safe-area-bottom">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground dark:text-white/50 mb-2">
            <span>Роль: {role}</span>
            {!canCreatePosts && <span>• публикация отключена</span>}
          </div>
          <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 mb-2">
            <span className="text-xs text-white/70">Глобально: приглашения в каналы</span>
            <Switch
              checked={settings?.allow_channel_invites ?? true}
              onCheckedChange={(checked) =>
                void updateGlobalSettings({ allow_channel_invites: checked }).catch(() =>
                  toast.error("Не удалось обновить глобальные настройки"),
                )
              }
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={draftPost}
              onChange={(e) => setDraftPost(e.target.value)}
              placeholder={canCreatePosts ? "Новый пост в канал..." : "Для публикации нужны права"}
              disabled={!canCreatePosts || sendingPost}
              className="flex-1 h-11 px-5 rounded-full text-white placeholder:text-white/50 outline-none bg-black/40 border-0 transition-all focus:ring-1 focus:ring-[#6ab3f3]/30 disabled:opacity-60"
            />
            <button
              onClick={handlePublishPost}
              disabled={!canCreatePosts || sendingPost || !draftPost.trim()}
              className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 disabled:opacity-50"
              style={{
                background: 'linear-gradient(135deg, #00A3B4 0%, #0066CC 50%, #00C896 100%)',
                boxShadow: '0 0 25px rgba(0,163,180,0.5), 0 4px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.2)'
              }}
              aria-label="Опубликовать"
              type="button"
            >
              <Send className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
