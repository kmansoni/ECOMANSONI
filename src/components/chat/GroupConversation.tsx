import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CheckCheck, Link, LogOut, MoreVertical, Send, UserPlus, Users } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { getHashtagBlockedToastPayload } from "@/lib/hashtagModeration";
import { getChatSendErrorToast } from "@/lib/chat/sendError";
import { diagnoseGroupSendReadiness } from "@/lib/chat/readiness";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
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
      const payload = getHashtagBlockedToastPayload(error);
      if (payload) toast.error(payload.title, { description: payload.description });
      else {
        const sendPayload = getChatSendErrorToast(error);
        if (sendPayload) toast.error(sendPayload.title, { description: sendPayload.description });
        else {
          const diagnostic = await diagnoseGroupSendReadiness({
            supabase,
            userId: user?.id,
            groupId: group.id,
          });
          toast.error("Не удалось отправить сообщение", { description: diagnostic ?? undefined });
        }
      }
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

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="flex-shrink-0 safe-area-top relative z-10 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center px-2 py-2">
          <button
            onClick={onBack}
            className="flex items-center gap-1 px-2 py-1 text-primary hover:bg-muted rounded-lg"
            aria-label="Назад"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="flex-1 flex flex-col items-center justify-center min-w-0">
            <h2 className="font-semibold text-foreground text-base truncate max-w-[200px]">{group.name}</h2>
            <p className="text-xs text-muted-foreground">{group.member_count} участников</p>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:bg-muted">
                <MoreVertical className="w-5 h-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>
                <Users className="w-4 h-4 mr-2" />
                Участники ({members.length})
              </DropdownMenuItem>
              {isOwner && (
                <DropdownMenuItem onClick={handleCreateGroupInvite} disabled={!canInvite}>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Пригласить в группу
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={handleCreateGroupInvite} disabled={!canInvite}>
                <Link className="w-4 h-4 mr-2" />
                Скопировать invite-link
              </DropdownMenuItem>
              {!isOwner && (
                <DropdownMenuItem onClick={handleLeave} className="text-destructive">
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
              <p className="text-muted-foreground">Начните переписку в группе</p>
            </div>
          )}

          {messages.map((message, index) => {
            const isOwn = message.sender_id === user?.id;
            const prevMessage = index > 0 ? messages[index - 1] : null;
            const showAvatar = !isOwn && (!prevMessage || prevMessage.sender_id !== message.sender_id);
            const showSenderName = !isOwn && showAvatar;

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
                        className="w-8 h-8 text-xs border-border/60"
                      />
                    )}
                  </div>
                )}

                <div className={`flex flex-col min-w-0 ${isOwn ? "items-end" : "items-start"}`}>
                  <div
                    className={`max-w-[75%] rounded-2xl px-3 py-2 border ${
                      isOwn
                        ? "bg-primary text-primary-foreground border-primary/20 rounded-br-sm"
                        : "bg-muted text-foreground border-border rounded-bl-sm"
                    }`}
                  >
                    {showSenderName && (
                      <p className="text-[13px] font-medium mb-0.5 text-muted-foreground">
                        {message.sender?.display_name || "Аноним"}
                      </p>
                    )}
                    <p className="text-[15px] leading-[1.4] whitespace-pre-wrap break-words">{message.content}</p>
                  </div>

                  <div className={`mt-0.5 flex items-center gap-1 px-1 ${isOwn ? "self-end" : "self-start"}`}>
                    <span className="text-[11px] text-muted-foreground">{formatMessageTime(message.created_at)}</span>
                    {isOwn && <CheckCheck className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="flex-shrink-0 px-3 py-3 relative z-10 bg-background/95 backdrop-blur-sm border-t border-border safe-area-bottom">
        <div className="rounded-lg border border-border bg-card px-3 py-2 mb-2 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Глобально: приглашения в группы</span>
          <Switch
            checked={settings?.allow_group_invites ?? true}
            onCheckedChange={(checked) =>
              void updateGlobalSettings({ allow_group_invites: checked }).catch(() =>
                toast.error("Не удалось обновить глобальные настройки"),
              )
            }
          />
        </div>
        <div className="rounded-lg border border-border bg-card px-3 py-2 mb-2 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Глобально: превью медиа</span>
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
            <Input
              placeholder="Сообщение"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              className="w-full h-11 rounded-full"
            />
          </div>
          <Button
            onClick={handleSend}
            disabled={!inputText.trim() || sending}
            size="icon"
            className="w-11 h-11 rounded-full shrink-0"
            aria-label="Отправить"
            type="button"
          >
            <Send className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
