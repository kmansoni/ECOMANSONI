import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Send, Flag, Users, UserPlus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface LiveSession {
  id: number;
  creator_id: string;
  title: string;
  viewer_count_current: number;
}

interface ChatMessage {
  id: number;
  content: string;
  sender_id: string;
  created_at: string;
}

/**
 * LiveViewerRoom
 * Viewer's perspective: watch stream, send messages, report, follow
 */
export function LiveViewerRoom() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [creatorName, setCreatorName] = useState("");
  const [viewerCount, setViewerCount] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    loadSession();
    loadMessages();

    const subscription = supabase
      .channel(`live:${sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "live_chat_messages" }, () => {
        loadMessages();
      })
      .subscribe();

    return () => subscription.unsubscribe();
  }, [sessionId]);

  async function loadSession() {
    try {
      const { data, error } = await supabase
        .from("live_sessions")
        .select("title, creator_id, viewer_count_current")
        .eq("id", sessionId)
        .single();

      if (error) throw error;

      setTitle(data.title);
      setViewerCount(data.viewer_count_current || 0);

      // Get creator name
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", data.creator_id)
        .single();

      if (profile) setCreatorName(profile.display_name || "Creator");
    } catch (error) {
      console.error("Failed to load session:", error);
      toast.error("Session not found");
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages() {
    try {
      const { data, error } = await supabase
        .from("live_chat_messages")
        .select("*")
        .eq("session_id", sessionId)
        .not("is_hidden_by_creator", "is", true)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error("Failed to load messages:", error);
    }
  }

  async function sendMessage() {
    if (!messageText.trim()) return;

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("live_chat_messages").insert([
        {
          session_id: sessionId,
          sender_id: user.id,
          content: messageText,
          is_creator_message: false,
        },
      ]);

      if (error) throw error;
      setMessageText("");
      await loadMessages();
    } catch (error) {
      console.error("Failed to send message:", error);
      toast.error("Failed to send message");
    } finally {
      setSubmitting(false);
    }
  }

  async function reportStream() {
    const reason = prompt(
      "Why are you reporting this stream?\n\nsexual, violence, harassment, misinformation, spam, other"
    );
    if (!reason) return;

    try {
      const { error } = await supabase.rpc("report_live_stream_v1", {
        p_session_id: sessionId,
        p_reporter_id: (await supabase.auth.getUser()).data.user?.id,
        p_report_type: reason,
        p_description: null,
      });

      if (error) throw error;
      toast.success("Report submitted. Thank you!");
    } catch (error) {
      console.error("Failed to report:", error);
      toast.error("Failed to submit report");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-screen max-h-screen bg-black p-4">
      {/* Video Area */}
      <div className="md:col-span-2 flex flex-col gap-4">
        {/* Video placeholder */}
        <div className="aspect-video bg-gray-900 rounded-lg flex items-center justify-center relative">
          <p className="text-gray-400">Live Stream</p>
          <Badge className="absolute top-4 left-4 animate-pulse bg-red-600">🔴 LIVE</Badge>
        </div>

        {/* Creator info */}
        <div className="bg-gray-900 rounded-lg p-4 border border-gray-800 flex items-center justify-between">
          <div className="flex gap-3">
            <div className="w-12 h-12 rounded-full bg-gray-700" />
            <div>
              <p className="font-semibold text-white">{creatorName}</p>
              <p className="text-sm text-gray-400">
                <Users className="w-3 h-3 inline mr-1" />
                {viewerCount} watching
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <UserPlus className="w-4 h-4 mr-1" />
              Follow
            </Button>
            <Button variant="destructive" size="sm" onClick={reportStream}>
              <Flag className="w-4 h-4 mr-1" />
              Report
            </Button>
          </div>
        </div>

        {/* Title */}
        <p className="text-white font-semibold">{title}</p>
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
              <div key={msg.id} className="text-sm text-gray-200 break-words">
                {msg.content}
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Message input */}
        <div className="p-3 border-t border-gray-800 space-y-2">
          <div className="flex gap-2">
            <Input
              placeholder="Say something..."
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") sendMessage();
              }}
              className="bg-gray-800 border-gray-700 text-white"
              disabled={submitting}
            />
            <Button
              size="sm"
              onClick={sendMessage}
              disabled={submitting || !messageText.trim()}
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
          <p className="text-xs text-gray-400">Be respectful · Max 200 chars</p>
        </div>
      </div>
    </div>
  );
}
