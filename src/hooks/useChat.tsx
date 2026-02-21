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

function normalizeBrokenVerticalText(text: string): string {
  const lines = text.split(/\r\n|\r|\n|\u2028|\u2029/);
  const nonEmpty = lines.map((line) => line.trim()).filter(Boolean);
  const isSingleGlyph = (s: string) => Array.from(s).length === 1;
  // If payload became "one symbol per line", stitch it back.
  // Use 2+ to also fix short cases like "О\nК".
  if (nonEmpty.length >= 2 && nonEmpty.length <= 64 && nonEmpty.every(isSingleGlyph)) {
    return nonEmpty.join("");
  }
  return text;
}

export interface ChatMessage {
  id: string;
  client_msg_id?: string | null;
  conversation_id: string;
  sender_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
  seq?: number | null;
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

  const mapWithConcurrency = useCallback(async <T, R>(
    items: T[],
    concurrency: number,
    mapper: (item: T) => Promise<R>
  ): Promise<R[]> => {
    if (items.length === 0) return [];
    const results: R[] = new Array(items.length);
    let nextIndex = 0;

    const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (true) {
        const currentIndex = nextIndex++;
        if (currentIndex >= items.length) return;
        results[currentIndex] = await mapper(items[currentIndex]);
      }
    });

    await Promise.all(workers);
    return results;
  }, []);

  const withTimeout = async <T,>(label: string, p: PromiseLike<T>, ms = 20000): Promise<T> => {
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
          .eq("user_id", user.id),
        20000
      );

      if (partError) throw partError;

      const conversationIds = (participantData || []).map((p) => p.conversation_id);
      if (conversationIds.length === 0) {
        setConversations([]);
        return;
      }

      // Step 2: fetch conversations + participants
      const [convRes, allPartRes] = await withTimeout<[
        { data: any[] | null; error: any },
        { data: { conversation_id: string; user_id: string }[] | null; error: any }
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
        ])
      );

      if (convRes.error) throw convRes.error;
      if (allPartRes.error) throw allPartRes.error;

      const convData = convRes.data || [];
      const allParticipants = allPartRes.data || [];

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

      // Step 4: fetch last message per conversation (correctness > single global limit)
      const lastMessageByConversationId: Record<string, ChatMessage | undefined> = {};
      const lastMessageRows = await withTimeout(
        "last_messages",
        mapWithConcurrency(conversationIds, 6, async (conversationId) => {
          const { data, error } = await supabase
            .from("messages")
            .select("*")
            .eq("conversation_id", conversationId)
            .order("created_at", { ascending: false })
            .limit(1);
          if (error) throw error;
          return { conversationId, message: (data && data[0]) as ChatMessage | undefined };
        }),
        20000
      );

      for (const row of lastMessageRows) {
        if (row.message) lastMessageByConversationId[row.conversationId] = row.message;
      }

      // Step 5: exact unread counts without a hard limit
      const unreadCountByConversationId: Record<string, number> = {};
      const unreadCounts = await withTimeout(
        "unread_counts",
        mapWithConcurrency(conversationIds, 6, async (conversationId) => {
          const { count, error } = await supabase
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("conversation_id", conversationId)
            .neq("sender_id", user.id)
            .eq("is_read", false);
          if (error) throw error;
          return { conversationId, count: count || 0 };
        }),
        20000
      );

      for (const row of unreadCounts) {
        unreadCountByConversationId[row.conversationId] = row.count;
      }

      // Build conversation objects
      const convs: Conversation[] = (convData || []).map((conv) => {
        const participants = (allParticipants || [])
          .filter((p) => p.conversation_id === conv.id)
          .map((p) => ({
            user_id: p.user_id,
            profile: profiles?.find((pr) => pr.user_id === p.user_id),
          }));

        const lastMessage = lastMessageByConversationId[conv.id];

        return {
          id: conv.id,
          created_at: conv.created_at,
          updated_at: conv.updated_at,
          participants,
          last_message: lastMessage,
          unread_count: unreadCountByConversationId[conv.id] || 0,
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
  }, [user, mapWithConcurrency]);


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

  const isIdempotencySchemaMissing = (err: unknown) => {
    const msg = getErrorMessage(err).toLowerCase();
    return (
      msg.includes("client_msg_id") ||
      msg.includes("on conflict") ||
      msg.includes("no unique") ||
      msg.includes("no unique or exclusion constraint") ||
      msg.includes("could not find the")
    );
  };

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
        // DELETE payload may not include conversation_id (replica identity), so filtering by conversation_id
        // can drop delete events. Subscribe without filter and remove only if the id exists in local list.
        .on(
          "postgres_changes",
          {
            event: "DELETE",
            schema: "public",
            table: "messages",
          },
          (payload) => {
            const deleted = payload.old as Partial<ChatMessage>;
            if (!deleted?.id) return;
            setMessages((prev) => {
              if (!prev.some((m) => m.id === deleted.id)) return prev;
              return prev.filter((m) => m.id !== deleted.id);
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

    const normalizedContent = normalizeBrokenVerticalText(content).trim();

    if (!conversationId || !user || !normalizedContent) {
      console.log("[sendMessage] validation failed:", { conversationId, hasUser: !!user, trimmedContent: normalizedContent });
      return;
    }

    try {
      const clientMsgId = crypto.randomUUID();
      console.log("[sendMessage] upserting message...", { clientMsgId });

      const { data, error } = await supabase
        .from("messages")
        .upsert(
          {
            conversation_id: conversationId,
            sender_id: user.id,
            content: normalizedContent,
            client_msg_id: clientMsgId,
          },
          {
            onConflict: "conversation_id,sender_id,client_msg_id",
            ignoreDuplicates: true,
          }
        )
        .select();

      if (error) {
        // If migrations weren't applied yet, fall back to a plain insert so chat isn't bricked.
        if (isIdempotencySchemaMissing(error)) {
          console.warn("[sendMessage] idempotency schema missing; falling back to insert", error);
          const { error: fallbackError } = await supabase.from("messages").insert({
            conversation_id: conversationId,
            sender_id: user.id,
            content: normalizedContent,
          });
          if (fallbackError) throw fallbackError;
          return;
        }

        console.error("[sendMessage] upsert error:", error);
        throw error;
      }

      console.log("[sendMessage] success:", data);
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

      // Insert message with media (idempotent retries via client_msg_id)
      const clientMsgId = crypto.randomUUID();
      const payload = {
        conversation_id: conversationId,
        sender_id: user.id,
        content:
          mediaType === 'voice'
            ? '🎤 Голосовое сообщение'
            : mediaType === 'video_circle'
              ? '🎬 Видео-кружок'
              : mediaType === 'video'
                ? '🎥 Видео'
                : '📷 Изображение',
        media_url: publicUrl,
        media_type: mediaType,
        duration_seconds: durationSeconds || null,
        client_msg_id: clientMsgId,
      };

      const { error: msgError } = await supabase
        .from("messages")
        .upsert(payload, {
          onConflict: "conversation_id,sender_id,client_msg_id",
          ignoreDuplicates: true,
        });

      if (msgError) {
        if (isIdempotencySchemaMissing(msgError)) {
          console.warn("[sendMediaMessage] idempotency schema missing; falling back to insert", msgError);
          const { error: fallbackError } = await supabase.from("messages").insert({
            conversation_id: conversationId,
            sender_id: user.id,
            content: payload.content,
            media_url: publicUrl,
            media_type: mediaType,
            duration_seconds: durationSeconds || null,
          });
          if (fallbackError) throw fallbackError;
        } else {
          throw msgError;
        }
      }

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
      // Best-effort: reuse an existing DM between these two users.
      const [myParts, otherParts] = await Promise.all([
        supabase.from("conversation_participants").select("conversation_id").eq("user_id", user.id),
        supabase.from("conversation_participants").select("conversation_id").eq("user_id", otherUserId),
      ]);

      if (myParts.error) throw myParts.error;
      if (otherParts.error) throw otherParts.error;

      const myIds = new Set((myParts.data || []).map((r: any) => r.conversation_id));
      const candidateIds = (otherParts.data || [])
        .map((r: any) => r.conversation_id)
        .filter((id: any) => myIds.has(id));

      if (candidateIds.length) {
        const { data: allParts, error: allPartsError } = await supabase
          .from("conversation_participants")
          .select("conversation_id, user_id")
          .in("conversation_id", candidateIds);
        if (allPartsError) throw allPartsError;

        const counts: Record<string, number> = {};
        const hasMe: Record<string, boolean> = {};
        const hasOther: Record<string, boolean> = {};
        for (const row of allParts || []) {
          counts[row.conversation_id] = (counts[row.conversation_id] || 0) + 1;
          if (row.user_id === user.id) hasMe[row.conversation_id] = true;
          if (row.user_id === otherUserId) hasOther[row.conversation_id] = true;
        }

        const dmIds = candidateIds.filter((id) => counts[id] === 2 && hasMe[id] && hasOther[id]);
        if (dmIds.length) {
          const { data: convRow, error: convErr } = await supabase
            .from("conversations")
            .select("id")
            .in("id", dmIds)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (convErr) throw convErr;
          if (convRow?.id) return convRow.id;
          return dmIds[0];
        }
      }

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

      if (partError) {
        // Compensating cleanup to avoid orphan conversations without participants.
        try {
          await supabase.from("conversation_participants").delete().eq("conversation_id", conv.id);
        } catch {
          // ignore
        }
        try {
          await supabase.from("conversations").delete().eq("id", conv.id);
        } catch {
          // ignore
        }
        throw partError;
      }

      return conv.id;
    } catch (error) {
      console.error("Error creating conversation:", error);
      return null;
    }
  };

  return { createConversation };
}
