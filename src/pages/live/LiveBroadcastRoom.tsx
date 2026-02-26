import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Loader2, Send, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface LiveSession {
  id: string;
  title: string;
  category: string;
  status: string;
  viewer_count_current: number;
  started_at: string;
  created_at: string;
}

interface ChatMessage {
  id: number;
  content: string;
  sender_id: string;
  is_creator_message: boolean;
  created_at: string;
}

/**
 * LiveBroadcastRoom
 * Creator's perspective: publish webrtc stream, see chat, end broadcast
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
        title: String(data?.title ?? data?.name ?? "Live Broadcast"),
        category: String(data?.category ?? "general"),
        status: String(data?.status ?? data?.state ?? "active"),
        viewer_count_current: Number(data?.viewer_count_current ?? 0),
        started_at: String(data?.started_at ?? data?.created_at ?? new Date().toISOString()),
        created_at: String(data?.created_at ?? new Date().toISOString()),
      };
      setSession(mapped);
      setViewerCount(mapped.viewer_count_current || 0);

      const startTime = new Date(mapped.started_at).getTime();
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setElapsedSeconds(elapsed);
    } catch (error) {
      console.error("Failed to load session:", error);
      toast.error("Failed to load session");
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
        .order("created_at", { ascending: true });

      if (error) throw error;
      const mapped = (data || []).map((row: any) => ({
        id: Number(row?.id ?? 0),
        content: String(row?.content ?? ""),
        sender_id: String(row?.sender_id ?? ""),
        is_creator_message: Boolean(row?.is_creator_message),
        created_at: String(row?.created_at ?? ""),
      }));
      setMessages(mapped);
    } catch (error) {
      console.error("Failed to load messages:", error);
    }
  }, [sessionId, supabaseUnsafe]);

  useEffect(() => {
    if (!sessionId) return;
    void loadSession();
    void loadMessages();

    // Real-time subscription to messages
    const subscription = supabase
      .channel(`live:${sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "live_chat_messages" }, () => {
        void loadMessages();
      })
      .subscribe();

    // Update elapsed time
    const timer = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);

    return () => {
      subscription.unsubscribe();
      clearInterval(timer);
    };
  }, [loadMessages, loadSession, sessionId]);

  async function sendAck() {
    if (!messageText.trim()) return;

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabaseUnsafe.from("live_chat_messages").insert([
        {
          session_id: sessionId,
          sender_id: user.id,
          content: messageText,
          is_creator_message: true,
        },
      ]);

      if (error) throw error;
      setMessageText("");
      await loadMessages();
    } catch (error) {
      console.error("Failed to send ack:", error);
      toast.error("Failed to send acknowledgment");
    } finally {
      setSubmitting(false);
    }
  }

  async function endBroadcast() {
    if (!confirm("End broadcasting? This will end the session immediately.")) return;

    try {
      const { error } = await supabaseUnsafe.rpc("broadcast_end_session_v1", {
        p_session_id: sessionId,
      });

      if (error) throw error;
      toast.success("Broadcast ended");
      navigate("/creator");
    } catch (error) {
      console.error("Failed to end broadcast:", error);
      toast.error("Failed to end broadcast");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  const duration = Math.floor(elapsedSeconds / 60); // minutes
  const isRestricted = session?.status === "restricted";

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-screen max-h-screen bg-black p-4">
      {/* Video Area */}
      <div className="md:col-span-2 flex flex-col gap-4">
        {/* Video placeholder */}
        <div className="aspect-video bg-gray-900 rounded-lg flex items-center justify-center relative overflow-hidden">
          <div className="text-white text-center">
            <p className="text-lg">WebRTC Stream</p>
            <p className="text-sm text-gray-400">(Camera/Screen share would appear here)</p>
          </div>

          {/* Live badge */}
          <Badge className="absolute top-4 left-4 animate-pulse bg-red-600">
            🔴 LIVE
          </Badge>

          {/* Restrictions warning */}
          {isRestricted && (
            <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-3">
              <AlertTriangle className="w-12 h-12 text-yellow-500" />
              <p className="text-white font-medium">Stream Restricted</p>
              <p className="text-gray-300 text-sm">Due to community reports. Check moderation queue.</p>
            </div>
          )}

          {/* Controls */}
          <div className="absolute bottom-4 right-4 flex gap-2">
            <Button variant="destructive" size="sm" onClick={endBroadcast}>
              <X className="w-4 h-4 mr-1" />
              End Live
            </Button>
          </div>
        </div>

        {/* Session info bar */}
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="flex items-center justify-between p-3">
            <div>
              <p className="font-semibold text-white">{session?.title}</p>
              <p className="text-xs text-gray-400">
                {Math.floor(duration / 60)}h {duration % 60}m
              </p>
            </div>
            <div className="text-right">
              <Badge variant="secondary">{viewerCount} watching</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Chat Sidebar */}
      <div className="flex flex-col gap-2 bg-gray-900 rounded-lg border border-gray-800">
        {/* Chat header */}
        <div className="p-3 border-b border-gray-800">
          <p className="font-semibold text-white text-sm">Live Chat</p>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 p-3">
          <div className="space-y-2">
            {messages.map((msg) => (
              <div key={msg.id} className="text-sm">
                {msg.is_creator_message && (
                  <span className="text-green-400 font-medium">You: </span>
                )}
                <span className="text-gray-200">{msg.content}</span>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Message input */}
        <div className="p-3 border-t border-gray-800 space-y-2">
          <div className="flex gap-2">
            <Input
              placeholder="Send acknowledgement..."
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") sendAck();
              }}
              className="bg-gray-800 border-gray-700 text-white"
              disabled={submitting || isRestricted}
            />
            <Button
              size="sm"
              onClick={sendAck}
              disabled={submitting || !messageText.trim() || isRestricted}
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
          <p className="text-xs text-gray-400">Rate limit: 1 message per second</p>
        </div>
      </div>
    </div>
  );
}
