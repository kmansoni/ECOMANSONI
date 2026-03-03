import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Send, Flag, Users, UserPlus, Heart, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

interface LiveSession {
  id: string;
  creator_id: string;
  title: string;
  viewer_count_current: number;
}

interface CreatorProfile {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
}

interface ChatMessage {
  id: string;
  content: string;
  sender_id: string;
  sender_name?: string;
  created_at: string;
}

const REPORT_REASONS = [
  { id: "sexual", label: "Сексуальный контент" },
  { id: "violence", label: "Насилие" },
  { id: "harassment", label: "Преследование" },
  { id: "misinformation", label: "Дезинформация" },
  { id: "spam", label: "Спам" },
  { id: "other", label: "Другое" },
];

/**
 * LiveViewerRoom — Экран просмотра прямого эфира
 */
export function LiveViewerRoom() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const supabaseUnsafe = supabase as any;

  const [session, setSession] = useState<LiveSession | null>(null);
  const [creator, setCreator] = useState<CreatorProfile | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [followed, setFollowed] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [selectedReason, setSelectedReason] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [hearts, setHearts] = useState<{ id: number; x: number }[]>([]);
  const heartIdRef = useRef(0);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const loadSession = useCallback(async () => {
    try {
      const { data, error } = await supabaseUnsafe
        .from("live_sessions")
        .select("id, title, creator_id, viewer_count_current")
        .eq("id", sessionId)
        .single();
      if (error) throw error;

      setSession({
        id: String(data.id),
        title: String(data.title ?? "Прямой эфир"),
        creator_id: String(data.creator_id ?? data.author_id ?? ""),
        viewer_count_current: Number(data.viewer_count_current ?? 0),
      });

      // Загрузка профиля стримера
      const creatorId = String(data.creator_id ?? data.author_id ?? "");
      if (creatorId) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("user_id, display_name, avatar_url")
          .eq("user_id", creatorId)
          .single();
        if (profile) {
          setCreator({
            user_id: String(profile.user_id),
            display_name: String(profile.display_name ?? "Стример"),
            avatar_url: profile.avatar_url ?? null,
          });
        }
      }

      // Увеличить счётчик зрителей
      await supabaseUnsafe
        .from("live_sessions")
        .update({ viewer_count_current: (data.viewer_count_current ?? 0) + 1 })
        .eq("id", sessionId);
    } catch {
      toast.error("Эфир не найден");
    } finally {
      setLoading(false);
    }
  }, [sessionId, supabaseUnsafe]);

  const loadMessages = useCallback(async () => {
    try {
      const { data, error } = await supabaseUnsafe
        .from("live_chat_messages")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true })
        .limit(100);
      if (error) throw error;
      setMessages((data || []).map((row: any) => ({
        id: String(row.id),
        content: String(row.content ?? ""),
        sender_id: String(row.sender_id ?? ""),
        sender_name: String(row.sender_name ?? ""),
        created_at: String(row.created_at ?? ""),
      })));
    } catch (error) {
      console.warn("[LiveViewerRoom] Failed to load messages", error);
    }
  }, [sessionId, supabaseUnsafe]);

  useEffect(() => {
    if (!sessionId) return;
    void loadSession();
    void loadMessages();

    const sub = supabase
      .channel(`live_viewer:${sessionId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "live_chat_messages",
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        const row = payload.new as any;
        setMessages((prev) => [...prev, {
          id: String(row.id),
          content: String(row.content ?? ""),
          sender_id: String(row.sender_id ?? ""),
          sender_name: String(row.sender_name ?? ""),
          created_at: String(row.created_at ?? ""),
        }]);
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "live_sessions",
        filter: `id=eq.${sessionId}`,
      }, (payload) => {
        const updated = payload.new as any;
        setSession((prev) => prev ? { ...prev, viewer_count_current: Number(updated.viewer_count_current ?? 0) } : prev);
        if (updated.status === "ended") {
          toast.info("Эфир завершён");
          navigate(-1);
        }
      })
      .subscribe();

    return () => { sub.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!messageText.trim() || submitting) return;
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error("Войдите для отправки сообщений"); return; }
      const { error } = await supabaseUnsafe.from("live_chat_messages").insert({
        session_id: sessionId,
        sender_id: user.id,
        content: messageText.trim().slice(0, 200),
        is_creator_message: false,
      });
      if (error) throw error;
      setMessageText("");
    } catch {
      toast.error("Ошибка отправки");
    } finally {
      setSubmitting(false);
    }
  };

  const handleFollow = async () => {
    if (!creator) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error("Войдите чтобы подписаться"); return; }
      if (!followed) {
        await supabaseUnsafe.from("follows").insert({ follower_id: user.id, following_id: creator.user_id });
        setFollowed(true);
        toast.success(`Вы подписались на ${creator.display_name}`);
      } else {
        await supabaseUnsafe.from("follows").delete().eq("follower_id", user.id).eq("following_id", creator.user_id);
        setFollowed(false);
      }
    } catch {
      toast.error("Ошибка");
    }
  };

  const handleReport = async () => {
    if (!selectedReason) { toast.error("Выберите причину"); return; }
    setReportSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabaseUnsafe.from("reports").insert({
        reporter_id: user?.id,
        target_type: "live_session",
        target_id: sessionId,
        reason: selectedReason,
      });
      toast.success("Жалоба отправлена. Спасибо!");
      setShowReport(false);
      setSelectedReason("");
    } catch {
      toast.error("Ошибка отправки жалобы");
    } finally {
      setReportSubmitting(false);
    }
  };

  const addHeart = (e: React.TouchEvent | React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0]?.clientX ?? rect.width / 2 : e.clientX;
    const x = ((clientX - rect.left) / rect.width) * 100;
    const id = heartIdRef.current++;
    setHearts((prev) => [...prev, { id, x }]);
    setTimeout(() => setHearts((prev) => prev.filter((h) => h.id !== id)), 1500);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-black">
        <Loader2 className="w-8 h-8 animate-spin text-white" />
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col md:flex-row h-screen bg-black overflow-hidden">
        {/* Видео-область */}
        <div className="flex-1 relative flex flex-col">
          {/* Заглушка: аватар стримера + "Прямой эфир" */}
          <div
            className="flex-1 bg-gradient-to-b from-gray-900 to-black relative cursor-pointer select-none"
            onClick={addHeart}
            onTouchStart={addHeart}
          >
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <Avatar className="w-24 h-24 border-4 border-red-500">
                <AvatarImage src={creator?.avatar_url ?? undefined} />
                <AvatarFallback className="text-2xl bg-gray-700 text-white">
                  {creator?.display_name?.slice(0, 2).toUpperCase() ?? "?"}
                </AvatarFallback>
              </Avatar>
              <p className="text-white font-semibold text-lg">{creator?.display_name}</p>
              <Badge className="bg-red-600 text-white animate-pulse px-3 py-1 text-sm">
                🔴 Прямой эфир
              </Badge>
            </div>

            {/* Плавающие сердечки */}
            {hearts.map((heart) => (
              <div
                key={heart.id}
                className="absolute bottom-20 animate-float-heart pointer-events-none"
                style={{ left: `${heart.x}%`, transform: "translateX(-50%)" }}
              >
                <Heart className="w-10 h-10 text-red-500 fill-current" />
              </div>
            ))}

            {/* Верхняя панель */}
            <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between">
              <button
                onClick={(e) => { e.stopPropagation(); navigate(-1); }}
                className="w-9 h-9 bg-black/50 rounded-full flex items-center justify-center"
              >
                <X className="w-5 h-5 text-white" />
              </button>
              <div className="flex items-center gap-2 bg-black/50 rounded-full px-3 py-1.5 text-white text-sm">
                <Users className="w-4 h-4" />
                <span>{session?.viewer_count_current ?? 0}</span>
              </div>
            </div>

            {/* Инфо стримера внизу */}
            <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
              <div>
                <p className="text-white font-semibold text-base drop-shadow">{session?.title}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); handleFollow(); }}
                  className={followed ? "bg-gray-700" : "bg-primary"}
                >
                  <UserPlus className="w-4 h-4 mr-1" />
                  {followed ? "Подписан" : "Подписаться"}
                </Button>
                <button
                  onClick={(e) => { e.stopPropagation(); setShowReport(true); }}
                  className="w-9 h-9 bg-black/50 rounded-full flex items-center justify-center"
                >
                  <Flag className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Боковой чат */}
        <div className="w-full md:w-80 flex flex-col bg-gray-950 border-l border-gray-800 max-h-[40vh] md:max-h-full">
          <div className="p-3 border-b border-gray-800">
            <p className="font-semibold text-white text-sm">Чат</p>
          </div>
          <ScrollArea className="flex-1 p-3">
            <div className="space-y-2">
              {messages.map((msg) => (
                <div key={msg.id} className="text-sm text-gray-200 break-words">
                  {msg.sender_name && (
                    <span className="font-bold text-blue-400 mr-1">{msg.sender_name}:</span>
                  )}
                  {msg.content}
                </div>
              ))}
              <div ref={chatBottomRef} />
            </div>
          </ScrollArea>
          <div className="p-3 border-t border-gray-800 flex gap-2">
            <Input
              placeholder="Написать..."
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
              className="bg-gray-800 border-gray-700 text-white text-sm"
              maxLength={200}
            />
            <Button
              size="icon"
              onClick={sendMessage}
              disabled={submitting || !messageText.trim()}
              className="shrink-0"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Модальное окно репорта */}
      <Drawer open={showReport} onOpenChange={(o) => !o && setShowReport(false)}>
        <DrawerContent className="pb-safe">
          <DrawerHeader>
            <DrawerTitle>Пожаловаться на эфир</DrawerTitle>
          </DrawerHeader>
          <div className="p-4 space-y-2">
            {REPORT_REASONS.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelectedReason(r.id)}
                className={`w-full text-left px-4 py-3 rounded-xl transition-colors ${
                  selectedReason === r.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted hover:bg-muted/80"
                }`}
              >
                {r.label}
              </button>
            ))}
            <Button
              onClick={handleReport}
              disabled={!selectedReason || reportSubmitting}
              className="w-full mt-4"
            >
              {reportSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Отправить жалобу
            </Button>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
