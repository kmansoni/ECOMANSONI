import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface SecretChat {
  id: string;
  conversation_id: string;
  initiator_id: string;
  participant_id: string;
  status: "pending" | "active" | "closed";
  default_ttl_seconds: number;
  screenshot_notifications: boolean;
  created_at: string;
  accepted_at: string | null;
  closed_at: string | null;
}

export function useSecretChat(conversationId: string | null) {
  const { user } = useAuth();
  const [secretChat, setSecretChat] = useState<SecretChat | null>(null);
  const [loading, setLoading] = useState(false);

  const isSecret = !!secretChat;

  // Загрузка секретного чата для данного conversationId
  useEffect(() => {
    if (!conversationId || !user) {
      setSecretChat(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    ;(supabase as any)
      .from("secret_chats")
      .select("*")
      .eq("conversation_id", conversationId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setSecretChat(data as SecretChat | null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId, user]);

  // Realtime подписка на изменения
  useEffect(() => {
    if (!conversationId) return;
    const channel = (supabase as any)
      .channel(`secret_chat:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "secret_chats",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            setSecretChat(null);
          } else {
            setSecretChat(payload.new as SecretChat);
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  /**
   * Инициировать секретный чат с пользователем.
   * Сначала создаём conversation с is_secret=true, затем запись secret_chats.
   */
  const initiateSecretChat = useCallback(
    async (participantId: string, defaultTtlSeconds = 30) => {
      if (!user) return { error: "not_authenticated" };

      // Создать conversation
      const { data: conv, error: convErr } = await (supabase as any)
        .from("conversations")
        .insert({ is_secret: true })
        .select("id")
        .single();
      if (convErr || !conv) return { error: convErr?.message };

      // Добавить участников
      await (supabase as any).from("conversation_participants").insert([
        { conversation_id: conv.id, user_id: user.id },
        { conversation_id: conv.id, user_id: participantId },
      ]);

      // Создать secret_chats запись
      const { data: sc, error: scErr } = await (supabase as any)
        .from("secret_chats")
        .insert({
          conversation_id: conv.id,
          initiator_id: user.id,
          participant_id: participantId,
          default_ttl_seconds: defaultTtlSeconds,
          status: "pending",
        })
        .select("*")
        .single();

      if (scErr) return { error: scErr.message };
      setSecretChat(sc as SecretChat);
      return { data: sc, conversationId: conv.id };
    },
    [user]
  );

  const acceptSecretChat = useCallback(async () => {
    if (!secretChat) return;
    await (supabase as any)
      .from("secret_chats")
      .update({ status: "active", accepted_at: new Date().toISOString() })
      .eq("id", secretChat.id);
  }, [secretChat]);

  const declineSecretChat = useCallback(async () => {
    if (!secretChat) return;
    await (supabase as any)
      .from("secret_chats")
      .update({ status: "closed", closed_at: new Date().toISOString() })
      .eq("id", secretChat.id);
  }, [secretChat]);

  const closeSecretChat = useCallback(async () => {
    if (!secretChat) return;
    await (supabase as any)
      .from("secret_chats")
      .update({ status: "closed", closed_at: new Date().toISOString() })
      .eq("id", secretChat.id);
  }, [secretChat]);

  const updateSettings = useCallback(
    async (settings: { default_ttl_seconds?: number; screenshot_notifications?: boolean }) => {
      if (!secretChat) return;
      const { data } = await (supabase as any)
        .from("secret_chats")
        .update(settings)
        .eq("id", secretChat.id)
        .select("*")
        .single();
      if (data) setSecretChat(data as SecretChat);
    },
    [secretChat]
  );

  return {
    isSecret,
    secretChat,
    loading,
    initiateSecretChat,
    acceptSecretChat,
    declineSecretChat,
    closeSecretChat,
    updateSettings,
  };
}
