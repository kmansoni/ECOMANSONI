import { useState, useRef, useEffect } from "react";
import { ArrowLeft, Send, MoreVertical, Users, LogOut, UserPlus, CheckCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGroupMessages, useGroupMembers, GroupChat } from "@/hooks/useGroupChats";
import { useAuth } from "@/hooks/useAuth";
import { useChatOpen } from "@/contexts/ChatOpenContext";
import { format } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

interface GroupConversationProps {
  group: GroupChat;
  onBack: () => void;
  onLeave?: () => void;
}

export function GroupConversation({ group, onBack, onLeave }: GroupConversationProps) {
  const { user } = useAuth();
  const { messages, loading, sendMessage } = useGroupMessages(group.id);
  const { members } = useGroupMembers(group.id);
  const { setIsChatOpen } = useChatOpen();
  
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Mark chat as open for hiding bottom nav
  useEffect(() => {
    setIsChatOpen(true);
    return () => setIsChatOpen(false);
  }, [setIsChatOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const formatMessageTime = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "HH:mm");
    } catch {
      return "";
    }
  };

  const handleSend = async () => {
    if (!inputText.trim() || sending) return;
    
    setSending(true);
    try {
      await sendMessage(inputText);
      setInputText("");
    } catch (error) {
      toast.error("Не удалось отправить сообщение");
    } finally {
      setSending(false);
    }
  };

  const handleLeave = async () => {
    try {
      const { error } = await supabase
        .from("group_chat_members")
        .delete()
        .eq("group_id", group.id)
        .eq("user_id", user?.id);

      if (error) throw error;
      
      toast.success("Вы покинули группу");
      onLeave?.();
      onBack();
    } catch (error) {
      toast.error("Не удалось покинуть группу");
    }
  };

  const isOwner = group.owner_id === user?.id;

  // Get member colors based on user id
  const getMemberColor = (userId: string) => {
    const colors = [
      "#6ab3f3", "#e87979", "#7bcf72", "#d9a44d", "#9c7bcf", "#cf7ba8"
    ];
    const hash = userId.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-background z-[200]">
      {/* Header - transparent with glass effect */}
      <div className="flex-shrink-0 safe-area-top relative z-10 backdrop-blur-xl bg-black/20 border-b border-white/10">
        <div className="flex items-center px-2 py-2">
          {/* Back button */}
          <button 
            onClick={onBack} 
            className="flex items-center gap-1 px-2 py-1 text-[#6ab3f3] hover:bg-white/5 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          
          {/* Center - Group info */}
          <div className="flex-1 flex flex-col items-center justify-center min-w-0">
            <h2 className="font-semibold text-white text-base truncate max-w-[200px]">{group.name}</h2>
            <p className="text-xs text-[#6ab3f3]">
              {group.member_count} участник{group.member_count === 1 ? '' : group.member_count < 5 ? 'а' : 'ов'}
            </p>
          </div>
          
          {/* Right - Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="text-white/70 hover:bg-white/5">
                <MoreVertical className="w-5 h-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-[#17212b] border-white/10">
              <DropdownMenuItem className="text-white hover:bg-white/10">
                <Users className="w-4 h-4 mr-2" />
                Участники ({members.length})
              </DropdownMenuItem>
              {isOwner && (
                <DropdownMenuItem className="text-white hover:bg-white/10">
                  <UserPlus className="w-4 h-4 mr-2" />
                  Добавить участников
                </DropdownMenuItem>
              )}
              {!isOwner && (
                <DropdownMenuItem onClick={handleLeave} className="text-red-400 hover:bg-white/10">
                  <LogOut className="w-4 h-4 mr-2" />
                  Покинуть группу
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        {/* Add participants banner */}
        <button className="w-full py-2.5 px-4 bg-white/5 flex items-center justify-center gap-2 border-t border-white/5">
          <span className="text-[#6ab3f3] text-sm font-medium">Добавить участников</span>
          <span className="w-5 h-5 rounded-full border border-white/20 flex items-center justify-center">
            <X className="w-3 h-3 text-white/40" />
          </span>
        </button>
      </div>

      {/* Messages - scrollable with animated brand background */}
      <div className="flex-1 overflow-y-auto native-scroll relative">
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
        
        {/* Content layer */}
        <div className="relative z-10 p-4 space-y-1">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="flex items-center justify-center py-8 text-center">
            <p className="text-white/50">Начните переписку в группе!</p>
          </div>
        )}

        {messages.map((message, index) => {
          const isOwn = message.sender_id === user?.id;
          const prevMessage = index > 0 ? messages[index - 1] : null;
          const showAvatar = !isOwn && (!prevMessage || prevMessage.sender_id !== message.sender_id);
          const showSenderName = !isOwn && showAvatar;
          const senderColor = getMemberColor(message.sender_id);

          return (
            <div
              key={message.id}
              className={`flex items-end gap-2 ${isOwn ? "justify-end" : "justify-start"}`}
            >
              {/* Avatar for incoming messages */}
              {!isOwn && (
                <div className="w-8 shrink-0">
                  {showAvatar && (
                    <img 
                      src={message.sender?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${message.sender_id}`}
                      alt="" 
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  )}
                </div>
              )}

              <div
                className={`max-w-[75%] rounded-2xl px-3 py-2 ${
                  isOwn
                    ? "bg-[#2b5278] text-white rounded-br-sm"
                    : "bg-[#182533] text-white rounded-bl-sm"
                }`}
              >
                {/* Sender name */}
                {showSenderName && (
                  <p 
                    className="text-[13px] font-medium mb-0.5"
                    style={{ color: senderColor }}
                  >
                    {message.sender?.display_name || "Аноним"}
                  </p>
                )}
                
                <p className="text-[15px] leading-[1.4] whitespace-pre-wrap">{message.content}</p>
                
                {/* Time and read status */}
                <div className="flex items-center justify-end gap-1 mt-1">
                  <span className="text-[11px] text-white/40">{formatMessageTime(message.created_at)}</span>
                  {isOwn && (
                    <CheckCheck className="w-4 h-4 text-[#6ab3f3]" />
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="flex-shrink-0 px-2 py-2 relative z-10 backdrop-blur-xl bg-black/20 border-t border-white/10 safe-area-bottom">
        <div className="flex items-center gap-2">
          {/* Input field */}
          <div className="flex-1">
            <input
              type="text"
              placeholder="Сообщение"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              className="w-full h-11 px-4 rounded-full bg-[#242f3d] text-white placeholder:text-white/40 outline-none focus:ring-1 focus:ring-[#6ab3f3]/30 transition-all"
            />
          </div>
          
          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!inputText.trim() || sending}
            className="w-11 h-11 rounded-full bg-[#6ab3f3] flex items-center justify-center shrink-0 disabled:opacity-50"
          >
            <Send className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
