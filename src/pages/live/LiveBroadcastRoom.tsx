import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2, Send, X, Mic, MicOff, Camera, CameraOff,
  FlipHorizontal, Users, Clock, MessageCircleQuestion, UserPlus2, Video,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { LiveQAQueue } from "@/components/live/LiveQAQueue";
import { LiveDonation } from "@/components/live/LiveDonation";
import { LiveReplay } from "@/components/live/LiveReplay";
import { InviteGuestSheet } from "@/components/live/InviteGuestSheet";

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
  const navigate = useNavigate();
  const supabaseUnsafe = supabase as any;

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
  const [pinnedComment, setPinnedComment] = useState<string>("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

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
      toast.error("Нет доступа к камере или микрофону");
    }
  }, [muted, cameraOff]);

  // Загрузка данных сессии
  const loadSession = useCallback(async () => {
    try {
      const { data, error } = await supabaseUnsafe
        .from("live_sessions")
        .select("*")
        .eq("id", sessionId)
        .single();
      if (error) throw error;
      const mapped: LiveSession = {
        id: String(data?.id ?? sessionId ?? ""),
        title: String(data?.title ?? "Прямой эфир"),
        category: String(data?.category ?? "general"),
        status: String(data?.status ?? "active"),
        viewer_count_current: Number(data?.viewer_count_current ?? 0),
        started_at: String(data?.started_at ?? new Date().toISOString()),
      };
      setSession(mapped);
      setViewerCount(mapped.viewer_count_current);
      const startTime = new Date(mapped.started_at).getTime();
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    } catch {
      toast.error("Сессия не найдена");
    } finally {
      setLoading(false);
    }
  }, [sessionId, supabaseUnsafe]);

  // Загрузка сообщений
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
        is_creator_message: Boolean(row.is_creator_message),
        created_at: String(row.created_at ?? ""),
      })));
    } catch { /* игнорируем */ }
  }, [sessionId, supabaseUnsafe]);

  useEffect(() => {
    if (!sessionId) return;
    void loadSession();
    void loadMessages();
    void startCamera(facing);

    const sub = supabase
      .channel(`live_broadcast:${sessionId}`)
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
          is_creator_message: Boolean(row.is_creator_message),
          created_at: String(row.created_at ?? ""),
        }]);
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "live_sessions",
        filter: `id=eq.${sessionId}`,
      }, (payload) => {
        setViewerCount(Number((payload.new as any).viewer_count_current ?? 0));
      })
      .subscribe();

    const timer = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);

    return () => {
      sub.unsubscribe();
      clearInterval(timer);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

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
      const { error } = await supabaseUnsafe.from("live_chat_messages").insert({
        session_id: sessionId,
        sender_id: user.id,
        content: messageText.trim(),
        is_creator_message: true,
      });
      if (error) throw error;
      setMessageText("");
    } catch {
      toast.error("Ошибка отправки");
    } finally {
      setSubmitting(false);
    }
  };

  const endBroadcast = async () => {
    if (!confirm("Завершить эфир?")) return;
    try {
      await supabaseUnsafe.from("live_sessions").update({
        status: "ended",
        ended_at: new Date().toISOString(),
      }).eq("id", sessionId);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      toast.success("Эфир завершён");
      navigate(-1);
    } catch {
      toast.error("Ошибка завершения эфира");
    }
  };

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

          {/* Закреплённый комментарий */}
          {pinnedComment && (
            <div className="absolute top-16 left-4 right-4 bg-black/70 backdrop-blur-sm rounded-xl px-3 py-2 text-sm text-white border border-white/20">
              📌 {pinnedComment}
            </div>
          )}

          {/* Кнопки управления */}
          <div className="absolute bottom-4 left-4 right-4">
            <div className="flex items-center justify-between mb-2">
              {/* LiveReplay */}
              <LiveReplay sessionId={sessionId!} stream={streamRef.current} />
              {/* Донаты стримеру */}
              {session && <LiveDonation sessionId={sessionId!} streamerId={session.id} isStreamer={true} />}
            </div>
            <div className="flex items-center justify-between">
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
                <button
                  onClick={() => setShowQA((v) => !v)}
                  className={cn("w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-sm", showQA ? "bg-primary/80" : "bg-black/50")}
                >
                  <MessageCircleQuestion className="w-5 h-5 text-white" />
                </button>
                <button
                  onClick={() => setShowInviteGuest(true)}
                  className="w-11 h-11 rounded-full bg-black/50 flex items-center justify-center backdrop-blur-sm"
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
      </div>

      {/* Боковой чат */}
      <div className="w-full md:w-80 flex flex-col bg-gray-950 border-l border-gray-800 max-h-[40vh] md:max-h-full">
        <div className="p-3 border-b border-gray-800 flex items-center justify-between">
          <p className="font-semibold text-white text-sm">Чат</p>
          <span className="text-xs text-gray-400">{messages.length} сообщ.</span>
        </div>

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
  );
}
