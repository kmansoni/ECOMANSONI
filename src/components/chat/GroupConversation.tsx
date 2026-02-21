import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CheckCheck, Link, LogOut, MoreVertical, Send, UserPlus, Users } from "lucide-react";
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
import type { GroupChat } from "@/hooks/useGroupChats";
import { useGroupMembers, useGroupMessages } from "@/hooks/useGroupChats";
import { useCommunityGlobalSettings, useCommunityInvites } from "@/hooks/useCommunityControls";
import { useChatOpen } from "@/contexts/ChatOpenContext";
import { supabase } from "@/lib/supabase";
import { GradientAvatar } from "@/components/ui/gradient-avatar";

interface GroupConversationProps {
  group: GroupChat;
  onBack: () => void;
  onLeave?: () => void;
}

export function GroupConversation({ group, onBack, onLeave }: GroupConversationProps) {
  const { user } = useAuth();
  const { messages, loading, sendMessage } = useGroupMessages(group.id);
  const { members } = useGroupMembers(group.id);
  const { settings, update: updateGlobalSettings } = useCommunityGlobalSettings();
  const { createGroupInvite } = useCommunityInvites();
  const { setIsChatOpen } = useChatOpen();

  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isOwner = group.owner_id === user?.id;
  const canInvite = isOwner && (settings?.allow_group_invites ?? true);

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
    try {
      setSending(true);
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
      const { error } = await (supabase as any)
        .from("group_chat_members")
        .delete()
        .eq("group_id", group.id)
        .eq("user_id", user?.id);
      if (error) throw error;
      toast.success("Вы покинули группу");
      onLeave?.();
      onBack();
    } catch {
      toast.error("Не удалось покинуть группу");
    }
  };

  const handleCreateGroupInvite = async () => {
    try {
      if (!canInvite) {
        toast.error("Приглашения в группы отключены");
        return;
      }
      const token = await createGroupInvite(group.id);
      const url = `${window.location.origin}/chats?group_invite=${token}`;
      await navigator.clipboard.writeText(url);
      toast.success("Ссылка-приглашение в группу скопирована");
    } catch (error) {
      console.error("Failed to create group invite:", error);
      toast.error("Не удалось создать приглашение");
    }
  };

  const getMemberColor = (userId: string) => {
    const colors = ["#6ab3f3", "#e87979", "#7bcf72", "#d9a44d", "#9c7bcf", "#cf7ba8"];
    const hash = userId.split("").reduce((a, b) => a + b.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-background z-[200]">
      <div className="flex-shrink-0 safe-area-top relative z-10 backdrop-blur-xl bg-black/20 border-b border-white/10">
        <div className="flex items-center px-2 py-2">
          <button onClick={onBack} className="flex items-center gap-1 px-2 py-1 text-[#6ab3f3] hover:bg-white/5 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="flex-1 flex flex-col items-center justify-center min-w-0">
            <h2 className="font-semibold text-white text-base truncate max-w-[200px]">{group.name}</h2>
            <p className="text-xs text-[#6ab3f3]">{group.member_count} участников</p>
          </div>

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
                <DropdownMenuItem onClick={handleCreateGroupInvite} disabled={!canInvite} className="text-white hover:bg-white/10">
                  <UserPlus className="w-4 h-4 mr-2" />
                  Пригласить в группу
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={handleCreateGroupInvite} disabled={!canInvite} className="text-white hover:bg-white/10">
                <Link className="w-4 h-4 mr-2" />
                Скопировать invite-link
              </DropdownMenuItem>
              {!isOwner && (
                <DropdownMenuItem onClick={handleLeave} className="text-red-400 hover:bg-white/10">
                  <LogOut className="w-4 h-4 mr-2" />
                  Покинуть группу
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden native-scroll relative">
        <div className="relative z-10 p-4 space-y-1 overflow-x-hidden min-w-0">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          )}

          {!loading && messages.length === 0 && (
            <div className="flex items-center justify-center py-8 text-center">
              <p className="text-white/50">Начните переписку в группе</p>
            </div>
          )}

          {messages.map((message, index) => {
            const isOwn = message.sender_id === user?.id;
            const prevMessage = index > 0 ? messages[index - 1] : null;
            const showAvatar = !isOwn && (!prevMessage || prevMessage.sender_id !== message.sender_id);
            const showSenderName = !isOwn && showAvatar;
            const senderColor = getMemberColor(message.sender_id);

            return (
              <div key={message.id} className={`flex items-end gap-2 min-w-0 ${isOwn ? "justify-end" : "justify-start"}`}>
                {!isOwn && (
                  <div className="w-8 shrink-0">
                    {showAvatar && (
                      <GradientAvatar
                        name={message.sender?.display_name || "Аноним"}
                        seed={message.sender_id}
                        avatarUrl={message.sender?.avatar_url}
                        size="sm"
                        className="w-8 h-8 text-xs border-white/15"
                      />
                    )}
                  </div>
                )}

                <div className={`flex flex-col min-w-0 ${isOwn ? "items-end" : "items-start"}`}>
                  <div
                    className={`max-w-[75%] rounded-2xl px-3 py-2 select-none backdrop-blur-xl border border-white/10 ${
                      isOwn ? "bg-white/10 text-white rounded-br-sm" : "bg-white/5 text-white rounded-bl-sm"
                    }`}
                  >
                    {showSenderName && (
                      <p className="text-[13px] font-medium mb-0.5" style={{ color: senderColor }}>
                        {message.sender?.display_name || "Аноним"}
                      </p>
                    )}
                    <p className="text-[15px] leading-[1.4] whitespace-pre-wrap break-words">{message.content}</p>
                  </div>

                  <div className={`mt-0.5 flex items-center gap-1 px-1 ${isOwn ? "self-end" : "self-start"}`}>
                    <span className="text-[11px] text-muted-foreground dark:text-white/50">{formatMessageTime(message.created_at)}</span>
                    {isOwn && <CheckCheck className="w-4 h-4 text-[#6ab3f3]" />}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="flex-shrink-0 px-2 py-2 relative z-10 backdrop-blur-xl bg-black/20 border-t border-white/10 safe-area-bottom">
        <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 mb-2 flex items-center justify-between">
          <span className="text-xs text-white/70">Глобально: приглашения в группы</span>
          <Switch
            checked={settings?.allow_group_invites ?? true}
            onCheckedChange={(checked) =>
              void updateGlobalSettings({ allow_group_invites: checked }).catch(() =>
                toast.error("Не удалось обновить глобальные настройки"),
              )
            }
          />
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 mb-2 flex items-center justify-between">
          <span className="text-xs text-white/70">Глобально: превью медиа</span>
          <Switch
            checked={settings?.show_media_preview ?? true}
            onCheckedChange={(checked) =>
              void updateGlobalSettings({ show_media_preview: checked }).catch(() =>
                toast.error("Не удалось обновить глобальные настройки"),
              )
            }
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Сообщение"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              className="w-full h-11 px-5 rounded-full text-white placeholder:text-white/50 outline-none bg-black/40 border-0 transition-all focus:ring-1 focus:ring-[#6ab3f3]/30"
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!inputText.trim() || sending}
            className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, #00A3B4 0%, #0066CC 50%, #00C896 100%)",
              boxShadow: "0 0 25px rgba(0,163,180,0.5), 0 4px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.2)",
            }}
          >
            <Send className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
