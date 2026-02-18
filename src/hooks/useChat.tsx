import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import type { RealtimeChannel } from "@supabase/supabase-js";

function getErrorMessage(err: unknown): string {
  if (!err) return "Unknown error";
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (typeof err === "object") {
    const anyErr = err as any;
    // PostgREST errors
    if (typeof anyErr.message === "string") return anyErr.message;
    if (typeof anyErr.error_description === "string") return anyErr.error_description;
    if (typeof anyErr.details === "string") return anyErr.details;
    try {
      return JSON.stringify(anyErr);
    } catch {
      return String(anyErr);
    }
  }
  return String(err);
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
  media_url?: string | null;
  media_type?: string | null; // 'voice', 'video_circle', 'image'
  duration_seconds?: number | null;
  shared_post_id?: string | null;
  shared_reel_id?: string | null;
}

export interface Conversation {
  id: string;
  created_at: string;
  updated_at: string;
  participants: {
    user_id: string;
    profile?: {
      display_name: string | null;
      avatar_url: string | null;
    };
  }[];
  last_message?: ChatMessage;
  unread_count: number;
}

export function useConversations() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const withTimeout = async <T,>(label: string, p: PromiseLike<T>, ms = 12000): Promise<T> => {
    let t: number | undefined;
    const timeout = new Promise<never>((_, reject) => {
      t = window.setTimeout(() => reject(new Error(`Timeout at step: ${label}`)), ms);
    });
    try {
      return await Promise.race([p, timeout]);
    } finally {
      if (t) window.clearTimeout(t);
    }
  };

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (!user) {
      setConversations([]);
      setLoading(false);
      return;
    }

    try {
      console.log("[useConversations] start", { userId: user.id });

      // Step 1: conversation IDs for current user
      const { data: participantData, error: partError } = await withTimeout(
        "participants",
        supabase
          .from("conversation_participants")
          .select("conversation_id")
          .eq("user_id", user.id)
      );

      if (partError) throw partError;

      const conversationIds = (participantData || []).map((p) => p.conversation_id);
      if (conversationIds.length === 0) {
        setConversations([]);
        return;
      }

      // Step 2: fetch conversations + participants + recent messages + unread in parallel
      const [convRes, allPartRes, msgRes, unreadRes] = await withTimeout<[
        { data: any[] | null; error: any },
        { data: { conversation_id: string; user_id: string }[] | null; error: any },
        { data: any[] | null; error: any },
        { data: { conversation_id: string }[] | null; error: any }
      ]>(
        "batch",
        Promise.all([
          supabase
            .from("conversations")
            .select("*")
            .in("id", conversationIds)
            .order("updated_at", { ascending: false }),
          supabase
            .from("conversation_participants")
            .select("conversation_id, user_id")
            .in("conversation_id", conversationIds),
          // NOTE: limit to keep this fast; we only need latest messages for list
          supabase
            .from("messages")
            .select("*")
            .in("conversation_id", conversationIds)
            .order("created_at", { ascending: false })
            .limit(200),
          supabase
            .from("messages")
            .select("conversation_id")
            .in("conversation_id", conversationIds)
            .neq("sender_id", user.id)
            .eq("is_read", false)
            .limit(1000),
        ])
      );

      if (convRes.error) throw convRes.error;
      if (allPartRes.error) throw allPartRes.error;
      if (msgRes.error) throw msgRes.error;
      if (unreadRes.error) throw unreadRes.error;

      const convData = convRes.data || [];
      const allParticipants = allPartRes.data || [];
      const messages = msgRes.data || [];
      const unreadData = unreadRes.data || [];

      // Step 3: profiles for participants (can be empty for fresh mocks)
      const userIds = [...new Set(allParticipants.map((p) => p.user_id))];
      const profilesRes: { data: { user_id: string; display_name: string | null; avatar_url: string | null }[] | null; error: any } =
        userIds.length
          ? await withTimeout(
              "profiles",
              supabase
                .from("profiles")
                .select("user_id, display_name, avatar_url")
                .in("user_id", userIds)
            )
          : { data: [], error: null };

      if (profilesRes.error) throw profilesRes.error;
      const profiles = profilesRes.data || [];

      const unreadCounts: Record<string, number> = {};
      unreadData?.forEach((msg) => {
        unreadCounts[msg.conversation_id] = (unreadCounts[msg.conversation_id] || 0) + 1;
      });

      // Build conversation objects
      const convs: Conversation[] = (convData || []).map((conv) => {
        const participants = (allParticipants || [])
          .filter((p) => p.conversation_id === conv.id)
          .map((p) => ({
            user_id: p.user_id,
            profile: profiles?.find((pr) => pr.user_id === p.user_id),
          }));

        const lastMessage = messages?.find((m) => m.conversation_id === conv.id);

        return {
          id: conv.id,
          created_at: conv.created_at,
          updated_at: conv.updated_at,
          participants,
          last_message: lastMessage,
          unread_count: unreadCounts[conv.id] || 0,
        };
      });

      setConversations(convs);
      console.log("[useConversations] done", { count: convs.length });
    } catch (error) {
      console.error("Error fetching conversations:", error);
      const msg = getErrorMessage(error);
      // Helpful hint when the external project does not have the expected schema
      if (msg.includes("schema cache") || msg.includes("Could not find the table")) {
        setError(
          "В вашем Supabase проекте не создана схема чатов (таблица conversation_participants не найдена). Выполните SQL-миграцию со схемой чатов/сообщений и обновите страницу."
        );
      } else {
        setError(msg);
      }
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Realtime subscription for conversation updates
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('conversations-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversations',
        },
        () => {
          fetchConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchConversations]);

  return { conversations, loading, error, refetch: fetchConversations };
}

export function useMessages(conversationId: string | null) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMessages = useCallback(async () => {
    if (!conversationId || !user) {
      setMessages([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error("Error fetching messages:", error);
    } finally {
      setLoading(false);
    }
  }, [conversationId, user]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Subscribe to realtime messages
  useEffect(() => {
    if (!conversationId) return;

    let channel: RealtimeChannel;

    const setupSubscription = () => {
      channel = supabase
        .channel(`messages:${conversationId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `conversation_id=eq.${conversationId}`,
          },
          (payload) => {
            const newMessage = payload.new as ChatMessage;
            // Prevent duplicates by checking if message already exists
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMessage.id)) {
                return prev;
              }
              return [...prev, newMessage];
            });
          }
        )
        .subscribe();
    };

    setupSubscription();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [conversationId]);

  const sendMessage = async (content: string) => {
    console.log("[sendMessage] called with:", { conversationId, userId: user?.id, content });
    
    if (!conversationId || !user || !content.trim()) {
      console.log("[sendMessage] validation failed:", { conversationId, hasUser: !!user, trimmedContent: content.trim() });
      return;
    }

    try {
      console.log("[sendMessage] inserting message...");
      const { data, error } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: content.trim(),
      }).select();

      if (error) {
        console.error("[sendMessage] insert error:", error);
        throw error;
      }
      
      console.log("[sendMessage] success:", data);

      // Update conversation updated_at
      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId);
    } catch (error) {
      console.error("[sendMessage] error:", error);
      throw error; // Re-throw to let caller handle
    }
  };

  const sendMediaMessage = async (file: File, mediaType: 'voice' | 'video_circle' | 'image' | 'video', durationSeconds?: number) => {
    if (!conversationId || !user) return { error: 'Not authenticated' };

    try {
      // Upload to storage
      const fileExt = file.name.split('.').pop() || 'webm';
      const fileName = `${user.id}/${conversationId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('chat-media')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('chat-media')
        .getPublicUrl(fileName);

      // Insert message with media
      const { error: msgError } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: mediaType === 'voice' ? '🎤 Голосовое сообщение' : 
                 mediaType === 'video_circle' ? '🎬 Видео-кружок' : 
                 mediaType === 'video' ? '🎥 Видео' : '📷 Изображение',
        media_url: publicUrl,
        media_type: mediaType,
        duration_seconds: durationSeconds || null
      });

      if (msgError) throw msgError;

      // Update conversation updated_at
      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId);

      return { error: null };
    } catch (error) {
      console.error("Error sending media message:", error);
      return { error: error instanceof Error ? error.message : 'Failed to send media' };
    }
  };

  const deleteMessage = async (messageId: string) => {
    if (!user) return { error: 'Not authenticated' };

    try {
      const { error } = await supabase
        .from("messages")
        .delete()
        .eq("id", messageId)
        .eq("sender_id", user.id); // Only allow deleting own messages

      if (error) throw error;

      // Remove from local state
      setMessages((prev) => prev.filter((m) => m.id !== messageId));

      return { error: null };
    } catch (error) {
      console.error("Error deleting message:", error);
      return { error: error instanceof Error ? error.message : 'Failed to delete message' };
    }
  };

  return { messages, loading, sendMessage, sendMediaMessage, deleteMessage, refetch: fetchMessages };
}

export function useCreateConversation() {
  const { user } = useAuth();

  const createConversation = async (otherUserId: string) => {
    if (!user) return null;

    try {
      // Create conversation
      const { data: conv, error: convError } = await supabase
        .from("conversations")
        .insert({})
        .select()
        .single();

      if (convError) throw convError;

      // Add both participants
      const { error: partError } = await supabase.from("conversation_participants").insert([
        { conversation_id: conv.id, user_id: user.id },
        { conversation_id: conv.id, user_id: otherUserId },
      ]);

      if (partError) throw partError;

      return conv.id;
    } catch (error) {
      console.error("Error creating conversation:", error);
      return null;
    }
  };

  return { createConversation };
}
