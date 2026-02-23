import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, MessageCircle, Users, Megaphone } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useConversations, type ChatMessage, useCreateConversation } from "@/hooks/useChat";
import { useGroupChats } from "@/hooks/useGroupChats";
import { useChannels } from "@/hooks/useChannels";
import { useSearch, type SearchUser } from "@/hooks/useSearch";
import { supabase } from "@/lib/supabase";
import { buildChatBodyEnvelope, sendMessageV1 } from "@/lib/chat/sendMessageV1";
import { GradientAvatar } from "@/components/ui/gradient-avatar";

interface ForwardMessageSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: ChatMessage | null;
}

function normalize(text: string) {
  return text.toLowerCase().trim();
}

function messagePreview(message: ChatMessage) {
  const base = (message.content || "").trim();
  if (base) return base.slice(0, 140);
  if (message.media_type === "image") return "📷 Изображение";
  if (message.media_type === "voice") return "🎤 Голосовое сообщение";
  if (message.media_type === "video") return "🎥 Видео";
  if (message.media_type === "video_circle") return "🎬 Видео-кружок";
  return "Сообщение";
}

function getOtherParticipantTitle(conversation: any, currentUserId: string) {
  const other = (conversation.participants || []).find((p: any) => p.user_id !== currentUserId);
  return other?.profile?.display_name || "Пользователь";
}

function guessMyName(user: { email?: string | null; user_metadata?: any } | null): string {
  if (!user) return "";
  const metaName = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "";
  if (metaName) return metaName;
  const email = (user.email || "").trim();
  if (!email) return "";
  const part = email.split("@")[0]?.trim();
  return part || "";
}

function withOptionalSignature(base: string, senderName: string, withSignature: boolean) {
  const content = base.trim();
  if (!withSignature) return content;
  const name = senderName.trim() || "Пользователь";
  return `↪ Переслано от ${name}\n\n${content}`;
}

export function ForwardMessageSheet({ open, onOpenChange, message }: ForwardMessageSheetProps) {
  const { user } = useAuth();
  const { conversations } = useConversations();
  const { groups } = useGroupChats();
  const { channels } = useChannels();
  const { createConversation } = useCreateConversation();
  const { users: searchedUsers, loading: searchingUsers, searchUsers } = useSearch();

  const [query, setQuery] = useState("");
  const [withSignature, setWithSignature] = useState(true);
  const [senderName, setSenderName] = useState("");
  const dmClientMsgIdsRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!open) {
      setQuery("");
      setWithSignature(true);
      dmClientMsgIdsRef.current.clear();
    }
  }, [open]);

  useEffect(() => {
    // New source message => new idempotency ids.
    dmClientMsgIdsRef.current.clear();
  }, [message?.id]);

  const getDmClientMsgId = (conversationId: string) => {
    const existing = dmClientMsgIdsRef.current.get(conversationId);
    if (existing) return existing;
    const next = crypto.randomUUID();
    dmClientMsgIdsRef.current.set(conversationId, next);
    return next;
  };

  useEffect(() => {
    if (!open || !user) return;

    // Start with a quick guess, then refine from profiles.
    setSenderName(guessMyName(user));

    (async () => {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("user_id", user.id)
          .single();
        const name = (data?.display_name || "").trim();
        if (name) setSenderName(name);
      } catch {
        // ignore
      }
    })();
  }, [open, user]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (query.trim().length >= 2) {
        searchUsers(query);
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [query, searchUsers]);

  const q = normalize(query);

  const filteredConversations = useMemo(() => {
    if (!user) return [];
    if (!q) return conversations;
    return conversations.filter((c: any) => normalize(getOtherParticipantTitle(c, user.id)).includes(q));
  }, [conversations, q, user]);

  const filteredGroups = useMemo(() => {
    if (!q) return groups;
    return groups.filter((g) => normalize(g.name).includes(q));
  }, [groups, q]);

  const filteredChannels = useMemo(() => {
    const memberChannels = channels.filter((c) => c.is_member);
    if (!q) return memberChannels;
    return memberChannels.filter((c) => normalize(c.name).includes(q));
  }, [channels, q]);

  const filteredUsers = useMemo(() => {
    if (!user) return [];
    if (query.trim().length < 2) return [];
    return searchedUsers.filter((u) => u.user_id !== user.id);
  }, [searchedUsers, query, user]);

  const sendToConversation = async (conversationId: string) => {
    if (!user || !message) return;

    const baseContent = (message.content || "").trim() || messagePreview(message);
    const content = withOptionalSignature(baseContent, senderName, withSignature);

    const kind = message.shared_post_id
      ? "share_post"
      : message.shared_reel_id
        ? "share_reel"
        : message.media_url || message.media_type
          ? "media"
          : "text";

    const body = buildChatBodyEnvelope({
      kind,
      text: content,
      media_url: message.media_url ?? null,
      media_type: message.media_type ?? null,
      duration_seconds: message.duration_seconds ?? null,
      shared_post_id: message.shared_post_id ?? null,
      shared_reel_id: message.shared_reel_id ?? null,
    });

    await sendMessageV1({
      conversationId,
      clientMsgId: getDmClientMsgId(conversationId),
      body,
    });
  };

  const sendToGroup = async (groupId: string) => {
    if (!user || !message) return;

    const baseContent = (message.content || "").trim() || messagePreview(message);
    const content = withOptionalSignature(baseContent, senderName, withSignature);

    const { error } = await supabase.from("group_chat_messages").insert({
      group_id: groupId,
      sender_id: user.id,
      content,
      media_url: message.media_url ?? null,
      media_type: message.media_type ?? null,
    });

    if (error) throw error;

    await supabase
      .from("group_chats")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", groupId);
  };

  const sendToChannel = async (channelId: string) => {
    if (!user || !message) return;

    const baseContent = (message.content || "").trim() || messagePreview(message);
    const content = withOptionalSignature(baseContent, senderName, withSignature);

    const { error } = await supabase.from("channel_messages").insert({
      channel_id: channelId,
      sender_id: user.id,
      content,
      media_url: message.media_url ?? null,
      media_type: message.media_type ?? null,
    });

    if (error) throw error;

    await supabase
      .from("channels")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", channelId);
  };

  const handleForwardToUser = async (u: SearchUser) => {
    if (!user || !message) return;

    // If a conversation already exists with this user, reuse it.
    const existing = conversations.find((c: any) => (c.participants || []).some((p: any) => p.user_id === u.user_id));
    const convId = existing?.id || (await createConversation(u.user_id));

    if (!convId) {
      toast.error("Не удалось создать диалог");
      return;
    }

    await sendToConversation(convId);
  };

  const close = () => onOpenChange(false);

  const forwardAndClose = async (fn: () => Promise<void>) => {
    if (!user) {
      toast.error("Нужно войти");
      return;
    }
    if (!message) {
      toast.error("Сообщение не выбрано");
      return;
    }
    try {
      await fn();
      toast.success("Переслано");
      close();
    } catch (e) {
      console.error("[forward] error", e);
      toast.error("Не удалось переслать");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="top"
        className="h-[85vh] rounded-b-3xl border-b border-white/10 shadow-2xl overflow-hidden p-0 bg-transparent"
        overlayClassName="bg-transparent"
        aria-describedby={undefined}
      >
        <div className="absolute inset-0 bg-black/40 backdrop-blur-xl pointer-events-none" />

        <div className="relative z-10 h-full flex flex-col p-6 pt-12">
          <SheetHeader className="pb-4">
            <SheetTitle className="text-white">Переслать</SheetTitle>
            {message && (
              <p className="mt-2 text-sm text-white/60 line-clamp-2">{messagePreview(message)}</p>
            )}
          </SheetHeader>

          <div className="mb-4 rounded-2xl bg-white/10 border border-white/10 px-3 py-2 flex items-center justify-between">
            <div className="min-w-0">
              <div className="text-sm text-white">С подписью</div>
              <div className="text-xs text-white/50 truncate">
                {senderName ? `↪ Переслано от ${senderName}` : "↪ Переслано"}
              </div>
            </div>
            <Switch checked={withSignature} onCheckedChange={setWithSignature} />
          </div>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/60" />
            <Input
              placeholder="Поиск: диалоги, группы, каналы, пользователи"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 pr-9 h-11 rounded-xl bg-white/10 border-white/20 text-white placeholder:text-white/50 focus-visible:ring-white/30"
              autoFocus
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="overflow-y-auto flex-1 -mx-6 px-6">
            {/* Users search */}
            {query.trim().length >= 2 && (
              <div className="mb-4">
                <div className="text-xs text-white/50 mb-2">Пользователи</div>
                {searchingUsers && (
                  <div className="flex items-center justify-center py-4">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white/60" />
                  </div>
                )}
                {!searchingUsers && filteredUsers.length === 0 && (
                  <div className="text-sm text-white/40 py-2">Ничего не найдено</div>
                )}
                {filteredUsers.map((u) => (
                  <button
                    key={u.user_id}
                    className="w-full flex items-center gap-3 py-3 hover:bg-white/10 transition-colors rounded-lg px-2 -mx-2"
                    onClick={() => forwardAndClose(() => handleForwardToUser(u))}
                  >
                    <GradientAvatar
                      name={u.display_name}
                      seed={u.user_id}
                      avatarUrl={u.avatar_url}
                      size="sm"
                      className="w-10 h-10 text-sm bg-white/10 border-white/15"
                    />
                    <div className="flex-1 min-w-0 text-left">
                      <div className="font-medium text-white truncate">{u.display_name}</div>
                      {u.bio && <div className="text-xs text-white/50 truncate">{u.bio}</div>}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Conversations */}
            <div className="mb-4">
              <div className="text-xs text-white/50 mb-2">Диалоги</div>
              {filteredConversations.length === 0 ? (
                <div className="text-sm text-white/40 py-2">Нет диалогов</div>
              ) : (
                filteredConversations.map((c: any) => (
                  <button
                    key={c.id}
                    className="w-full flex items-center gap-3 py-3 hover:bg-white/10 transition-colors rounded-lg px-2 -mx-2"
                    onClick={() => forwardAndClose(() => sendToConversation(c.id))}
                  >
                    <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                      <MessageCircle className="w-5 h-5 text-white/70" />
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="font-medium text-white truncate">{user ? getOtherParticipantTitle(c, user.id) : "Диалог"}</div>
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* Groups */}
            <div className="mb-4">
              <div className="text-xs text-white/50 mb-2">Группы</div>
              {filteredGroups.length === 0 ? (
                <div className="text-sm text-white/40 py-2">Нет групп</div>
              ) : (
                filteredGroups.map((g) => (
                  <button
                    key={g.id}
                    className="w-full flex items-center gap-3 py-3 hover:bg-white/10 transition-colors rounded-lg px-2 -mx-2"
                    onClick={() => forwardAndClose(() => sendToGroup(g.id))}
                  >
                    <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                      <Users className="w-5 h-5 text-white/70" />
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="font-medium text-white truncate">{g.name}</div>
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* Channels */}
            <div className="mb-2">
              <div className="text-xs text-white/50 mb-2">Каналы</div>
              {filteredChannels.length === 0 ? (
                <div className="text-sm text-white/40 py-2">Нет каналов</div>
              ) : (
                filteredChannels.map((c) => (
                  <button
                    key={c.id}
                    className="w-full flex items-center gap-3 py-3 hover:bg-white/10 transition-colors rounded-lg px-2 -mx-2"
                    onClick={() => forwardAndClose(() => sendToChannel(c.id))}
                  >
                    <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                      <Megaphone className="w-5 h-5 text-white/70" />
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="font-medium text-white truncate">{c.name}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
