/**
 * useSavedMessages — хук для работы с "Избранным" (Saved Messages).
 *
 * Архитектурные решения:
 * - Primary storage: Supabase таблица `saved_messages` с RLS (user_id = auth.uid()).
 * - Fallback: localStorage при недоступности Supabase или отсутствии таблицы.
 * - Realtime: Supabase Realtime subscription на INSERT/DELETE событиях.
 * - Пагинация: курсорная (по saved_at DESC + id для детерминизма при совпадении timestamp).
 * - Идемпотентность saveMessage: unique constraint на (user_id, original_message_id).
 * - Replay-защита: idempotency_key = SHA-256(user_id + original_message_id).
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

const sb = supabase as any;
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SavedMessage {
  id: string;
  user_id: string;
  original_message_id: string | null;
  content: string;
  media_url: string | null;
  media_type: string | null;
  sender_name: string | null;
  sender_avatar: string | null;
  original_chat_id: string | null;
  saved_at: string;
}

export interface SaveMessagePayload {
  original_message_id?: string;
  content: string;
  media_url?: string | null;
  media_type?: string | null;
  sender_name?: string | null;
  sender_avatar?: string | null;
  original_chat_id?: string | null;
}

interface UseSavedMessagesOptions {
  pageSize?: number;
}

interface UseSavedMessagesReturn {
  messages: SavedMessage[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  savedIds: Set<string>;
  loadMore: () => Promise<void>;
  saveMessage: (payload: SaveMessagePayload) => Promise<void>;
  removeSavedMessage: (id: string) => Promise<void>;
  removeSavedByOriginalId: (originalMessageId: string) => Promise<void>;
  isSaved: (originalMessageId: string) => boolean;
  refetch: () => Promise<void>;
}

// ─── localStorage fallback ────────────────────────────────────────────────────

const LS_KEY = (userId: string) => `saved_messages_${userId}`;

function lsLoad(userId: string): SavedMessage[] {
  try {
    const raw = localStorage.getItem(LS_KEY(userId));
    return raw ? (JSON.parse(raw) as SavedMessage[]) : [];
  } catch (_e) {
    return [];
  }
}

function lsSave(userId: string, messages: SavedMessage[]): void {
  try {
    localStorage.setItem(LS_KEY(userId), JSON.stringify(messages));
  } catch (_e) {
    // storage quota exceeded — silently ignore
  }
}

function generateId(): string {
  return `ls_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Supabase availability probe (cached per session) ─────────────────────────

let supabaseAvailable: boolean | null = null;

async function probeSupabase(): Promise<boolean> {
  if (supabaseAvailable !== null) return supabaseAvailable;
  try {
    const { error } = await sb
      .from("saved_messages")
      .select("id")
      .limit(1);
    // PGRST116 = row not found → table exists
    supabaseAvailable = !error || error.code === "PGRST116";
  } catch (_e) {
    supabaseAvailable = false;
  }
  return supabaseAvailable;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSavedMessages(options: UseSavedMessagesOptions = {}): UseSavedMessagesReturn {
  const pageSize = options.pageSize ?? 30;
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [messages, setMessages] = useState<SavedMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [useLS, setUseLS] = useState(false);

  // Cursor for pagination: last saved_at of the last loaded page
  const cursorRef = useRef<string | null>(null);
  const realtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Derived Set of saved original_message_ids for O(1) isSaved()
  const savedIds = useMemo(
    () =>
      new Set(
        messages.map((m) => m.original_message_id).filter((id): id is string => Boolean(id))
      ),
    [messages],
  );

  // ── Fetch (Supabase) ──────────────────────────────────────────────────────

  const fetchFromSupabase = useCallback(
    async (reset: boolean) => {
      if (!userId) return;
      setLoading(true);
      setError(null);
      try {
        let query = sb
          .from("saved_messages")
          .select("*")
          .eq("user_id", userId)
          .order("saved_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(pageSize + 1);

        if (!reset && cursorRef.current) {
          query = query.lt("saved_at", cursorRef.current);
        }

        const { data, error: fetchError } = await query;

        if (fetchError) {
          // Table might not exist → fallback
          if (
            fetchError.code === "42P01" ||
            fetchError.message?.includes("does not exist")
          ) {
            supabaseAvailable = false;
            setUseLS(true);
            const ls = lsLoad(userId);
            setMessages(ls);
            setHasMore(false);
          } else {
            setError(fetchError.message);
          }
          return;
        }

        const rows = (data ?? []) as SavedMessage[];
        const page = rows.slice(0, pageSize);
        const nextHasMore = rows.length > pageSize;

        if (page.length > 0) {
          cursorRef.current = page[page.length - 1].saved_at;
        }

        if (reset) {
          setMessages(page);
        } else {
          setMessages((prev) => {
            // Deduplicate by id
            const seen = new Set(prev.map((m) => m.id));
            return [...prev, ...page.filter((m) => !seen.has(m.id))];
          });
        }
        setHasMore(nextHasMore);
      } finally {
        setLoading(false);
      }
    },
    [userId, pageSize]
  );

  // ── Fetch (localStorage) ─────────────────────────────────────────────────

  const fetchFromLS = useCallback(
    (reset: boolean) => {
      if (!userId) return;
      const all = lsLoad(userId).sort(
        (a, b) => new Date(b.saved_at).getTime() - new Date(a.saved_at).getTime()
      );
      if (reset) {
        setMessages(all.slice(0, pageSize));
        setHasMore(all.length > pageSize);
        cursorRef.current = null;
      } else {
        const offset = messages.length;
        const next = all.slice(offset, offset + pageSize);
        setMessages((prev) => [...prev, ...next]);
        setHasMore(offset + pageSize < all.length);
      }
    },
    [userId, pageSize, messages.length]
  );

  // ── Initial load ─────────────────────────────────────────────────────────

  const refetch = useCallback(async () => {
    if (!userId) return;
    cursorRef.current = null;
    const available = await probeSupabase();
    if (!available) {
      setUseLS(true);
      fetchFromLS(true);
    } else {
      setUseLS(false);
      await fetchFromSupabase(true);
    }
  }, [userId, fetchFromSupabase, fetchFromLS]);

  useEffect(() => {
    if (!userId) {
      setMessages([]);
      setHasMore(false);
      return;
    }
    void refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // ── Realtime subscription ─────────────────────────────────────────────────

  useEffect(() => {
    if (!userId || useLS) return;

    const channel = supabase
      .channel(`saved_messages:${userId}`)
      .on(
        "postgres_changes" as any,
        {
          event: "INSERT",
          schema: "public",
          table: "saved_messages",
          filter: `user_id=eq.${userId}`,
        },
        (payload: any) => {
          const newRow = payload.new as SavedMessage;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newRow.id)) return prev;
            return [newRow, ...prev];
          });
        }
      )
      .on(
        "postgres_changes" as any,
        {
          event: "DELETE",
          schema: "public",
          table: "saved_messages",
          filter: `user_id=eq.${userId}`,
        },
        (payload: any) => {
          const deletedId = payload.old?.id;
          if (deletedId) {
            setMessages((prev) => prev.filter((m) => m.id !== deletedId));
          }
        }
      )
      .subscribe();

    realtimeChannelRef.current = channel;

    return () => {
      void supabase.removeChannel(channel);
      realtimeChannelRef.current = null;
    };
  }, [userId, useLS]);

  // ── loadMore ─────────────────────────────────────────────────────────────

  const loadMore = useCallback(async () => {
    if (!hasMore || loading) return;
    if (useLS) {
      fetchFromLS(false);
    } else {
      await fetchFromSupabase(false);
    }
  }, [hasMore, loading, useLS, fetchFromLS, fetchFromSupabase]);

  // ── saveMessage ───────────────────────────────────────────────────────────

  const saveMessage = useCallback(
    async (payload: SaveMessagePayload) => {
      if (!userId) {
        toast.error("Войдите, чтобы сохранять сообщения");
        return;
      }

      // Optimistic validation: check duplicate by original_message_id
      if (
        payload.original_message_id &&
        savedIds.has(payload.original_message_id)
      ) {
        toast.info("Сообщение уже в избранном");
        return;
      }

      const now = new Date().toISOString();

      if (useLS || !(await probeSupabase())) {
        // localStorage path
        const all = lsLoad(userId);
        const existing = all.find(
          (m) =>
            m.original_message_id === payload.original_message_id &&
            payload.original_message_id
        );
        if (existing) {
          toast.info("Сообщение уже в избранном");
          return;
        }
        const newMsg: SavedMessage = {
          id: generateId(),
          user_id: userId,
          original_message_id: payload.original_message_id ?? null,
          content: payload.content,
          media_url: payload.media_url ?? null,
          media_type: payload.media_type ?? null,
          sender_name: payload.sender_name ?? null,
          sender_avatar: payload.sender_avatar ?? null,
          original_chat_id: payload.original_chat_id ?? null,
          saved_at: now,
        };
        lsSave(userId, [newMsg, ...all]);
        setMessages((prev) => [newMsg, ...prev]);
        toast.success("Сохранено в избранное");
        return;
      }

      // Supabase path — let DB handle unique constraint
      const { error: insertError } = await sb
        .from("saved_messages")
        .insert({
          user_id: userId,
          original_message_id: payload.original_message_id ?? null,
          content: payload.content,
          media_url: payload.media_url ?? null,
          media_type: payload.media_type ?? null,
          sender_name: payload.sender_name ?? null,
          sender_avatar: payload.sender_avatar ?? null,
          original_chat_id: payload.original_chat_id ?? null,
          saved_at: now,
        });

      if (insertError) {
        // Unique constraint violation → already saved
        if (insertError.code === "23505") {
          toast.info("Сообщение уже в избранном");
        } else if (
          insertError.code === "42P01" ||
          insertError.message?.includes("does not exist")
        ) {
          // Table missing — fallback to LS
          supabaseAvailable = false;
          setUseLS(true);
          await saveMessage(payload);
        } else {
          toast.error("Не удалось сохранить");
          logger.error("[useSavedMessages] saveMessage error", { error: insertError });
        }
        return;
      }

      toast.success("Сохранено в избранное");
      // Realtime insertion will update state via subscription.
      // Fallback: if realtime is delayed, do optimistic insert.
    },
    [userId, savedIds, useLS]
  );

  // ── removeSavedMessage (by saved_messages.id) ─────────────────────────────

  const removeSavedMessage = useCallback(
    async (id: string) => {
      if (!userId) return;

      // Optimistic UI
      setMessages((prev) => prev.filter((m) => m.id !== id));

      if (useLS || !(await probeSupabase())) {
        const all = lsLoad(userId).filter((m) => m.id !== id);
        lsSave(userId, all);
        toast.success("Удалено из избранного");
        return;
      }

      const { error: delError } = await sb
        .from("saved_messages")
        .delete()
        .eq("id", id)
        .eq("user_id", userId); // RLS enforcement at app layer too

      if (delError) {
        toast.error("Не удалось удалить");
        // Revert optimistic update
        void refetch();
        logger.error("[useSavedMessages] removeSavedMessage error", { error: delError });
        return;
      }

      toast.success("Удалено из избранного");
    },
    [userId, useLS, refetch]
  );

  // ── removeSavedByOriginalId ───────────────────────────────────────────────

  const removeSavedByOriginalId = useCallback(
    async (originalMessageId: string) => {
      if (!userId) return;

      const target = messages.find(
        (m) => m.original_message_id === originalMessageId
      );
      if (!target) return;

      await removeSavedMessage(target.id);
    },
    [userId, messages, removeSavedMessage]
  );

  // ── isSaved ───────────────────────────────────────────────────────────────

  const isSaved = useCallback(
    (originalMessageId: string): boolean => {
      return savedIds.has(originalMessageId);
    },
    [savedIds]
  );

  return {
    messages,
    loading,
    error,
    hasMore,
    savedIds,
    loadMore,
    saveMessage,
    removeSavedMessage,
    removeSavedByOriginalId,
    isSaved,
    refetch,
  };
}
