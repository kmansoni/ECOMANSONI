import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2, Send, X, Mic, MicOff, Camera, CameraOff,
  FlipHorizontal, Users, Clock, MessageCircleQuestion, UserPlus2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { LiveQAQueue } from "@/components/live/LiveQAQueue";
import { LiveDonation } from "@/components/live/LiveDonation";
import { LiveReplay } from "@/components/live/LiveReplay";
import { InviteGuestSheet } from "@/components/live/InviteGuestSheet";
import { logger } from "@/lib/logger";
import { useInviteGuest, useKickGuest, useStreamGuests } from "@/hooks/useLivestream";
import type { LiveGuest } from "@/types/livestream";

interface LiveSession {
  id: string;
  title: string;
  category: string;
  status: string;
  viewer_count_current: number;
  started_at: string;
}

interface ChatMessage {
  id: string;
  content: string;
  sender_id: string;
  sender_name?: string;
  is_creator_message: boolean;
  created_at: string;
}

interface InviteFollower {
  id: string;
  username: string;
  display_name: string;
  avatar_url?: string;
}

interface LiveSessionRow {
  id?: string | number;
  title?: string | null;
  category?: string | null;
  status?: string | null;
  viewer_count_current?: number | string | null;
  started_at?: string | null;
}

interface LiveChatMessageRow {
  id?: string | number;
  content?: string | null;
  sender_id?: string | null;
  sender_name?: string | null;
  is_creator_message?: boolean | null;
  created_at?: string | null;
}

interface LiveFollowerRow {
  user_id?: string | null;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
}

function toLiveChatMessage(row: LiveChatMessageRow): ChatMessage {
  return {
    id: String(row.id ?? ""),
    content: String(row.content ?? ""),
    sender_id: String(row.sender_id ?? ""),
    sender_name: String(row.sender_name ?? ""),
    is_creator_message: Boolean(row.is_creator_message),
    created_at: String(row.created_at ?? ""),
  };
}

function formatDuration(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * LiveBroadcastRoom
 * Экран трансляции стримера с реальным видеопотоком
 */
export function LiveBroadcastRoom() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const sessionIdNum = Number(sessionId);
  const navigate = useNavigate();
  const [session, setSession] = useState<LiveSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState("");
  const [viewerCount, setViewerCount] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [showQA, setShowQA] = useState(false);
  const [showInviteGuest, setShowInviteGuest] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [followers, setFollowers] = useState<InviteFollower[]>([]);
  const [isSearchingFollowers, setIsSearchingFollowers] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const { data: guests = [] } = useStreamGuests(Number.isFinite(sessionIdNum) ? sessionIdNum : undefined);
  const inviteGuest = useInviteGuest();
  const kickGuest = useKickGuest();

  // Инициализация камеры
  const startCamera = useCallback(async (facingMode: "user" | "environment") => {
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      // Применить mute состояние
      stream.getAudioTracks().forEach((t) => { t.enabled = !muted; });
      stream.getVideoTracks().forEach((t) => { t.enabled = !cameraOff; });
    } catch (err) {
      logger.warn("[LiveBroadcastRoom] Failed to start camera", { sessionId, facingMode, error: err });
      toast.error("Нет доступа к камере или микрофону");
    }
  }, [muted, cameraOff, sessionId]);

  // Загрузка данных сессии
  const loadSession = useCallback(async () => {
    if (!Number.isFinite(sessionIdNum)) {
      setLoading(false);
      toast.error("Некорректный идентификатор эфира");
      return;
    }
    try {
      const { data, error } = await supabase
        .from("live_sessions")
        .select("*")
        .eq("id", sessionIdNum)
        .single();
      if (error) throw error;
       
      const row = (data ?? {}) as LiveSessionRow;
      const mapped: LiveSession = {
        id: String(row.id ?? sessionIdNum ?? ""),
        title: String(row.title ?? "Прямой эфир"),
        category: String(row.category ?? "general"),
        status: String(row.status ?? "active"),
        viewer_count_current: Number(row.viewer_count_current ?? 0),
        started_at: String(row.started_at ?? new Date().toISOString()),
      };
      setSession(mapped);
      setViewerCount(mapped.viewer_count_current);
      const startTime = new Date(mapped.started_at).getTime();
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    } catch (error) {
      logger.warn("[LiveBroadcastRoom] Failed to load live session", { sessionId, error });
      toast.error("Сессия не найдена");
    } finally {
      setLoading(false);
    }
  }, [sessionId, sessionIdNum]);

  // Загрузка сообщений
  const loadMessages = useCallback(async () => {
    if (!Number.isFinite(sessionIdNum)) return;
    try {
      const { data, error } = await supabase
        .from("live_chat_messages")
        .select("*")
        .eq("session_id", sessionIdNum)
        .order("created_at", { ascending: true })
        .limit(100);
      if (error) throw error;
      setMessages(((data ?? []) as LiveChatMessageRow[]).map((row) => toLiveChatMessage(row)));
    } catch (error) {
      logger.warn("[LiveBroadcastRoom] Failed to load chat messages", { sessionId, error });
    }
  }, [sessionId, sessionIdNum]);

  useEffect(() => {
    if (!sessionId || !Number.isFinite(sessionIdNum)) return;
    void loadSession();
    void loadMessages();
    void startCamera(facing);

    const sub = supabase
      .channel(`live_broadcast:${sessionId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "live_chat_messages",
        filter: `session_id=eq.${sessionIdNum}`,
      }, (payload) => {
        const row = payload.new as unknown as LiveChatMessageRow;
        setMessages((prev) => [...prev, toLiveChatMessage(row)]);
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "live_sessions",
        filter: `id=eq.${sessionIdNum}`,
      }, (payload) => {
        const row = payload.new as unknown as LiveSessionRow;
        setViewerCount(Number(row.viewer_count_current ?? 0));
      })
      .subscribe();

    const timer = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);

    return () => {
      sub.unsubscribe();
      clearInterval(timer);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, sessionIdNum]);

  // Прокрутка вниз при новых сообщениях
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !next; });
  };

  const toggleCamera = () => {
    const next = !cameraOff;
    setCameraOff(next);
    streamRef.current?.getVideoTracks().forEach((t) => { t.enabled = !next; });
  };

  const flipCamera = () => {
    const next = facing === "user" ? "environment" : "user";
    setFacing(next);
    void startCamera(next);
  };

  const sendMessage = async () => {
    if (!messageText.trim() || submitting) return;
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Не авторизован");
      const { error } = await supabase.from("live_chat_messages").insert({
        session_id: sessionIdNum,
        sender_id: user.id,
        content: messageText.trim(),
        is_creator_message: true,
      });
      if (error) throw error;
      setMessageText("");
    } catch (error) {
      logger.warn("[LiveBroadcastRoom] Failed to send creator message", { sessionId, error });
      toast.error("Ошибка отправки");
    } finally {
      setSubmitting(false);
    }
  };

  const handleInviteGuest = useCallback(async (userId: string) => {
    if (!Number.isFinite(sessionIdNum)) return;
    await inviteGuest.mutateAsync({ sessionId: sessionIdNum, userId });
  }, [inviteGuest, sessionIdNum]);

  const handleCancelGuestInvite = useCallback(async (guestId: string) => {
    if (!Number.isFinite(sessionIdNum)) return;
    await kickGuest.mutateAsync({ sessionId: sessionIdNum, guestId });
  }, [kickGuest, sessionIdNum]);

  const handleSearchFollowers = useCallback(async (query: string) => {
    const q = query.trim();
    if (!q) {
      setFollowers([]);
      return;
    }

    setIsSearchingFollowers(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, username, display_name, avatar_url")
        .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
        .limit(20);

      if (error) throw error;

      const mapped: InviteFollower[] = ((data ?? []) as LiveFollowerRow[])
        .map((row) => ({
          id: String(row.user_id ?? ""),
          username: String(row.username ?? "user"),
          display_name: String(row.display_name ?? row.username ?? "User"),
          avatar_url: typeof row.avatar_url === "string" ? row.avatar_url : undefined,
        }))
        .filter((row) => row.id.length > 0);

      setFollowers(mapped);
    } catch (error) {
      logger.warn("[LiveBroadcastRoom] Failed to search followers for guest invite", { query: q, error });
      setFollowers([]);
    } finally {
      setIsSearchingFollowers(false);
    }
  }, []);

  const doEndBroadcast = async () => {
    try {
      await supabase.from("live_sessions").update({
        status: "ended",
        ended_at: new Date().toISOString(),
      }).eq("id", sessionIdNum);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      toast.success("Эфир завершён");
      navigate(-1);
    } catch (error) {
      logger.warn("[LiveBroadcastRoom] Failed to end broadcast", { sessionId, error });
      toast.error("Ошибка завершения эфира");
    }
  };

  const endBroadcast = () => setShowEndConfirm(true);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-black">
        <Loader2 className="w-8 h-8 animate-spin text-white" />
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-screen bg-black overflow-hidden">
      {/* Видео-область */}
      <div className="flex-1 relative flex flex-col">
        {/* Видео */}
        <div className="flex-1 relative bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={cn(
              "absolute inset-0 w-full h-full object-cover",
              facing === "user" && "scale-x-[-1]",
              cameraOff && "opacity-0",
            )}
          />
          {cameraOff && (
            <div className="absolute inset-0 flex items-center justify-center">
              <CameraOff className="w-16 h-16 text-white/40" />
            </div>
          )}

          {/* Верхняя панель */}
          <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between">
            <Badge className="bg-red-600 text-white animate-pulse flex items-center gap-1 px-3 py-1">
              🔴 LIVE
            </Badge>
            <div className="flex items-center gap-2 bg-black/50 rounded-full px-3 py-1.5 text-white text-sm">
              <Users className="w-4 h-4" />
              <span>{viewerCount}</span>
            </div>
          </div>

          {/* Таймер */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/50 rounded-full px-3 py-1 text-white text-sm flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            {formatDuration(elapsedSeconds)}
          </div>

          {/* Название */}
          <div className="absolute bottom-20 left-4 right-4">
            <p className="text-white font-semibold text-base drop-shadow">{session?.title}</p>
          </div>

          {/* LiveReplay + LiveDonation — restored after refactor */}
          <div className="absolute bottom-20 left-4 right-4 flex items-center gap-2">
            <LiveReplay sessionId={sessionId!} stream={streamRef.current} />
            {session && (
              <LiveDonation sessionId={sessionId!} streamerId={session.id} isStreamer={true} />
            )}
          </div>

          {/* Кнопки управления */}
          <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
            <div className="flex gap-3">
              <button
                onClick={toggleMute}
                className={cn(
                  "w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-sm",
                  muted ? "bg-red-600/80" : "bg-black/50",
                )}
              >
                {muted ? <MicOff className="w-5 h-5 text-white" /> : <Mic className="w-5 h-5 text-white" />}
              </button>
              <button
                onClick={toggleCamera}
                className={cn(
                  "w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-sm",
                  cameraOff ? "bg-red-600/80" : "bg-black/50",
                )}
              >
                {cameraOff ? <CameraOff className="w-5 h-5 text-white" /> : <Camera className="w-5 h-5 text-white" />}
              </button>
              <button
                onClick={flipCamera}
                className="w-11 h-11 rounded-full bg-black/50 flex items-center justify-center backdrop-blur-sm"
              >
                <FlipHorizontal className="w-5 h-5 text-white" />
              </button>
              {/* Q&A toggle — restored: removed from controls in refactor but state/render still relied on it */}
              <button
                onClick={() => setShowQA((v) => !v)}
                className={cn("w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-sm", showQA ? "bg-primary/80" : "bg-black/50")}
                aria-label="Q&A"
              >
                <MessageCircleQuestion className="w-5 h-5 text-white" />
              </button>
              {/* InviteGuest toggle — restored: removed from controls in refactor but InviteGuestSheet render still relied on it */}
              <button
                onClick={() => setShowInviteGuest(true)}
                className="w-11 h-11 rounded-full bg-black/50 flex items-center justify-center backdrop-blur-sm"
                aria-label="Пригласить гостя"
              >
                <UserPlus2 className="w-5 h-5 text-white" />
              </button>
            </div>
            <Button variant="destructive" size="sm" onClick={endBroadcast} className="rounded-full px-4">
              <X className="w-4 h-4 mr-1" />
              Завершить
            </Button>
          </div>
        </div>
      </div>

      {/* Боковой чат */}
      <div className="w-full md:w-80 flex flex-col bg-gray-950 border-l border-gray-800 max-h-[40vh] md:max-h-full">
        <div className="p-3 border-b border-gray-800 flex items-center justify-between">
          <p className="font-semibold text-white text-sm">{showQA ? "Q&A" : "Чат"}</p>
          <span className="text-xs text-gray-400">{messages.length} сообщ.</span>
        </div>

        {showQA ? (
          <div className="flex-1 overflow-hidden">
            <LiveQAQueue sessionId={sessionId!} isStreamer={true} />
          </div>
        ) : (
          <ScrollArea className="flex-1 p-3">
            <div className="space-y-2">
              {messages.map((msg) => (
                <div key={msg.id} className="text-sm flex gap-2">
                  {msg.is_creator_message && (
                    <span className="text-yellow-400 font-bold shrink-0">Вы:</span>
                  )}
                  <span className="text-gray-200 break-words">{msg.content}</span>
                </div>
              ))}
              <div ref={chatBottomRef} />
            </div>
          </ScrollArea>
        )}

        {!showQA && (
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
        )}
      </div>

      {/* InviteGuest */}
      {showInviteGuest && (
        <InviteGuestSheet
          open={showInviteGuest}
          onOpenChange={setShowInviteGuest}
          guests={guests as LiveGuest[]}
          followers={followers}
          isSearching={isSearchingFollowers}
          onInvite={handleInviteGuest}
          onCancel={handleCancelGuestInvite}
          onSearch={handleSearchFollowers}
        />
      )}

      {/* End broadcast confirmation — replaces window.confirm() */}
      <AlertDialog open={showEndConfirm} onOpenChange={setShowEndConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Завершить эфир?</AlertDialogTitle>
            <AlertDialogDescription>
              Трансляция будет остановлена для всех зрителей. Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void doEndBroadcast()}
            >
              Завершить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
