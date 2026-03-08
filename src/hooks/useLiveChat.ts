/**
 * useLiveChat — Supabase Realtime chat hook.
 *
 * - Loads last 50 messages on mount via REST query.
 * - Subscribes to postgres_changes on live_chat_messages.
 * - Supports infinite-scroll upward pagination (loadMore).
 * - Optimistic insert on sendMessage; rolls back on failure.
 * - Cleans up the Realtime channel on unmount.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { LiveChatMessage } from '@/types/livestream';

const PAGE_SIZE = 50;

export interface UseLiveChatReturn {
  messages: LiveChatMessage[];
  pinnedMessage: LiveChatMessage | null;
  sendMessage: (text: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
}

/**
 * Manages live chat for a given `sessionId`.
 * Pass `null` to skip subscription and return empty state.
 */
export function useLiveChat(sessionId: number | null): UseLiveChatReturn {
  const [messages, setMessages] = useState<LiveChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [oldestCreatedAt, setOldestCreatedAt] = useState<string | null>(null);

  const optimisticIdsRef = useRef<Set<number>>(new Set());

  const pinnedMessage =
    messages.find((m) => m.is_pinned && m.type === 'pinned') ?? null;

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (sessionId == null) {
      setMessages([]);
      setHasMore(false);
      setOldestCreatedAt(null);
      return;
    }

    let cancelled = false;

    setIsLoading(true);
    setError(null);

    supabase
      .from('live_chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)
      .then(({ data, error: qErr }) => {
        if (cancelled) return;
        if (qErr) {
          setError(qErr.message);
          setIsLoading(false);
          return;
        }
        const sorted = ((data ?? []) as LiveChatMessage[]).reverse();
        setMessages(sorted);
        setHasMore((data?.length ?? 0) === PAGE_SIZE);
        setOldestCreatedAt(sorted[0]?.created_at ?? null);
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // ── Realtime subscription ─────────────────────────────────────────────────
  useEffect(() => {
    if (sessionId == null) return;

    const channel = supabase
      .channel(`live_chat:${sessionId}`)
      .on(
        'postgres_changes' as 'system',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'live_chat_messages',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload: { new: LiveChatMessage }) => {
          const incoming = payload.new;
          if (optimisticIdsRef.current.has(incoming.id)) {
            optimisticIdsRef.current.delete(incoming.id);
            return;
          }
          setMessages((prev) => [...prev, incoming]);
        },
      )
      .on(
        'postgres_changes' as 'system',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'live_chat_messages',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload: { new: LiveChatMessage }) => {
          const updated = payload.new;
          setMessages((prev) =>
            prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)),
          );
        },
      )
      .on(
        'postgres_changes' as 'system',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'live_chat_messages',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload: { old: { id: number } }) => {
          setMessages((prev) => prev.filter((m) => m.id !== payload.old.id));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [sessionId]);

  // ── Load more (infinite scroll upward) ───────────────────────────────────
  const loadMore = useCallback(async (): Promise<void> => {
    if (sessionId == null || !hasMore || !oldestCreatedAt) return;

    const { data, error: qErr } = await supabase
      .from('live_chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .lt('created_at', oldestCreatedAt)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);

    if (qErr) {
      setError(qErr.message);
      return;
    }

    const sorted = ((data ?? []) as LiveChatMessage[]).reverse();
    setMessages((prev) => [...sorted, ...prev]);
    setHasMore(sorted.length === PAGE_SIZE);
    if (sorted.length > 0) setOldestCreatedAt(sorted[0].created_at);
  }, [sessionId, hasMore, oldestCreatedAt]);

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (text: string): Promise<void> => {
      if (sessionId == null || text.trim() === '') return;

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const tempId = -(Date.now());
      const optimistic: LiveChatMessage = {
        id: tempId,
        session_id: sessionId,
        user_id: session.user.id,
        message: text.trim(),
        type: 'text',
        is_pinned: false,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, optimistic]);

      const { data, error: insertErr } = await supabase
        .from('live_chat_messages')
        .insert({ session_id: sessionId, message: text.trim(), type: 'text' })
        .select('id')
        .single();

      if (insertErr) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setError(insertErr.message);
        return;
      }

      if (data?.id != null) {
        optimisticIdsRef.current.add(data.id as number);
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, id: data.id as number } : m)),
        );
      }
    },
    [sessionId],
  );

  return {
    messages,
    pinnedMessage,
    sendMessage,
    isLoading,
    error,
    hasMore,
    loadMore,
  };
}
