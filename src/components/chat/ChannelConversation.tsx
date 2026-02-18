import { useState, useRef, useEffect } from "react";
import { ArrowLeft, Eye, Share2, Search, Volume2, VolumeX, ChevronDown, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChannelMessages, useJoinChannel, Channel } from "@/hooks/useChannels";
import { useAuth } from "@/hooks/useAuth";
import { useChatOpen } from "@/contexts/ChatOpenContext";
import { format } from "date-fns";
import { toast } from "sonner";

interface ChannelConversationProps {
  channel: Channel;
  onBack: () => void;
  onLeave?: () => void;
}

// Format subscriber count like "4 119 170 подписчиков"
const formatSubscribers = (count: number): string => {
  return count.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " подписчиков";
};

// Format view count like "168,6K"
const formatViews = (count: number): string => {
  if (count >= 1000000) {
    return (count / 1000000).toFixed(1).replace(".", ",") + "M";
  }
  if (count >= 1000) {
    return (count / 1000).toFixed(1).replace(".", ",") + "K";
  }
  return count.toString();
};

// Sample reactions for demo
const sampleReactions = [
  { emoji: "❤️", count: 914 },
  { emoji: "🤡", count: 328 },
  { emoji: "🤯", count: 113 },
  { emoji: "🔥", count: 66 },
  { emoji: "👍", count: 45 },
  { emoji: "🎉", count: 42 },
  { emoji: "👍", count: 40 },
  { emoji: "😂", count: 19 },
];

export function ChannelConversation({ channel, onBack, onLeave }: ChannelConversationProps) {
  const { user } = useAuth();
  const { setIsChatOpen } = useChatOpen();
  const { messages, loading } = useChannelMessages(channel.id);
  const { joinChannel, leaveChannel } = useJoinChannel();
  const [isMember, setIsMember] = useState(channel.is_member);
  const [isMuted, setIsMuted] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);

  // Mark chat as open/closed for hiding bottom nav
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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

  const formatTime = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "HH:mm");
    } catch {
      return "";
    }
  };

  return (
    <div className="h-full flex flex-col relative">
      {/* Brand background - fixed to cover full screen */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a1628] via-[#0d2035] to-[#071420]" />
        <div 
          className="absolute top-0 left-1/4 w-[500px] h-[500px] rounded-full blur-[120px] opacity-60"
          style={{
            background: 'radial-gradient(circle, #0066CC 0%, transparent 70%)',
            animation: 'float-orb-1 15s ease-in-out infinite',
          }}
        />
        <div 
          className="absolute bottom-20 right-0 w-[450px] h-[450px] rounded-full blur-[100px] opacity-50"
          style={{
            background: 'radial-gradient(circle, #00A3B4 0%, transparent 70%)',
            animation: 'float-orb-2 18s ease-in-out infinite',
            animationDelay: '-5s',
          }}
        />
        <div 
          className="absolute top-1/3 -right-20 w-[400px] h-[400px] rounded-full blur-[90px] opacity-55"
          style={{
            background: 'radial-gradient(circle, #00C896 0%, transparent 70%)',
            animation: 'float-orb-3 20s ease-in-out infinite',
            animationDelay: '-10s',
          }}
        />
        <div 
          className="absolute bottom-1/3 -left-10 w-[350px] h-[350px] rounded-full blur-[80px] opacity-45"
          style={{
            background: 'radial-gradient(circle, #4FD080 0%, transparent 70%)',
            animation: 'float-orb-4 22s ease-in-out infinite',
            animationDelay: '-3s',
          }}
        />
      </div>
      {/* Header - Telegram style */}
      <div className="flex-shrink-0 flex items-center gap-2 px-2 py-2 bg-card border-b border-border relative z-10">
        {/* Back button with unread count */}
        <button 
          onClick={onBack} 
          className="flex items-center gap-1 text-primary"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="text-sm font-medium">
            {Math.floor(Math.random() * 100) + 10}
          </span>
        </button>
        
        {/* Channel avatar */}
        <img
          src={channel.avatar_url || `https://api.dicebear.com/7.x/shapes/svg?seed=${channel.id}`}
          alt={channel.name}
          className="w-9 h-9 rounded-full object-cover bg-muted"
        />

        {/* Channel info */}
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-foreground text-sm truncate">{channel.name}</h2>
          <p className="text-[11px] text-muted-foreground">
            {formatSubscribers(channel.member_count || 0)}
          </p>
        </div>

        {/* Actions */}
        <button className="p-2 text-muted-foreground hover:text-foreground">
          <Search className="w-5 h-5" />
        </button>
        <button className="p-2 text-muted-foreground hover:text-foreground">
          <MoreVertical className="w-5 h-5" />
        </button>
      </div>

      {/* Pinned message bar */}
      <div className="flex-shrink-0 bg-card border-b border-border relative z-10">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-0.5 h-8 bg-primary rounded-full flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-foreground truncate">Закреплённое сообщение</p>
              <p className="text-xs text-muted-foreground truncate">Увидели что-то важное и интересное...</p>
            </div>
          </div>
          <Button 
            onClick={handleJoin}
            size="sm" 
            className="rounded-full px-4 h-8 text-xs font-medium"
          >
            Прислать новость
          </Button>
        </div>
      </div>

      {/* Messages as posts */}
      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-2 py-3 space-y-3 relative z-10"
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

        {messages.map((msg, index) => {
          // Generate random view count for demo
          const viewCount = Math.floor(Math.random() * 200000) + 1000;
          // Get random subset of reactions
          const postReactions = sampleReactions.slice(0, Math.floor(Math.random() * 5) + 4);
          
          return (
            <div key={msg.id} className="bg-card rounded-2xl overflow-hidden shadow-sm">
              {/* Post header with channel info */}
              <div className="flex items-center gap-2 px-3 pt-3 pb-2">
                <img
                  src={channel.avatar_url || `https://api.dicebear.com/7.x/shapes/svg?seed=${channel.id}`}
                  alt=""
                  className="w-8 h-8 rounded-full object-cover bg-muted"
                />
                <div className="flex-1 min-w-0">
                  <span className="text-primary font-medium text-sm">{channel.name}</span>
                </div>
              </div>

              {/* Post image if exists */}
              {msg.media_url && (
                <div className="relative">
                  <img 
                    src={msg.media_url} 
                    alt="" 
                    className="w-full max-h-80 object-cover"
                  />
                  {/* Video overlay indicator */}
                  <div className="absolute top-2 left-2 bg-black/60 rounded px-1.5 py-0.5 text-white text-xs flex items-center gap-1">
                    <span>00:32</span>
                    <Volume2 className="w-3 h-3" />
                  </div>
                </div>
              )}

              {/* Post content */}
              <div className="px-3 py-2">
                <p className="text-foreground text-[15px] leading-relaxed whitespace-pre-wrap">
                  {msg.content}
                </p>
              </div>

              {/* Subscribe link */}
              <div className="px-3 pb-2">
                <button className="text-primary text-sm hover:underline flex items-center gap-1">
                  <span>👉</span>
                  <span>{channel.name}. Подписаться</span>
                </button>
              </div>

              {/* Reactions row */}
              <div className="flex flex-wrap gap-1.5 px-3 py-2">
                {postReactions.map((reaction, i) => (
                  <button 
                    key={i}
                    className="flex items-center gap-1 px-2 py-1 rounded-full bg-muted/60 hover:bg-muted transition-colors"
                  >
                    <span className="text-sm">{reaction.emoji}</span>
                    <span className="text-xs text-foreground/80">{formatViews(reaction.count)}</span>
                  </button>
                ))}
              </div>

              {/* Post footer - views and time */}
              <div className="flex items-center justify-between px-3 pb-3">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Eye className="w-4 h-4" />
                  <span className="text-xs">{formatViews(viewCount)}</span>
                  <span className="text-xs ml-1">{formatTime(msg.created_at)}</span>
                </div>
                <button className="text-muted-foreground hover:text-foreground transition-colors">
                  <Share2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Scroll to bottom button */}
      {showScrollDown && (
        <button
          onClick={scrollToBottom}
          className="absolute right-4 bottom-20 w-10 h-10 rounded-full bg-card flex items-center justify-center shadow-lg hover:bg-muted transition-colors border border-border"
        >
          <ChevronDown className="w-6 h-6 text-foreground" />
        </button>
      )}

    </div>
  );
}
