import { useState, useEffect, useCallback, useRef } from 'react';
import { dbLoose } from "@/lib/supabase";
import { useAuth } from './useAuth';
import { logger } from '@/lib/logger';

export interface ThreadMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
  reply_to_message_id: string | null;
  thread_root_message_id: string | null;
  sender?: {
    display_name: string | null;
    avatar_url: string | null;
  };
  replies_count?: number;
}

export interface ThreadRootMessage extends ThreadMessage {
  replies: ThreadMessage[];
}

export function useThreadMessages(rootMessageId: string | null) {
  const { user } = useAuth();
  const [rootMessage, setRootMessage] = useState<ThreadRootMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchThread = useCallback(async () => {
    if (!rootMessageId || !user) {
      setRootMessage(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Fetch root message
      const { data: rootData, error: rootError } = await dbLoose
        .from('messages')
        .select(`
          *,
          sender:user_profiles!messages_sender_id_fkey(display_name, avatar_url)
        `)
        .eq('id', rootMessageId)
        .single();

      if (rootError) throw rootError;

      // Fetch all replies in the thread (messages with same thread_root_message_id)
      const { data: repliesData, error: repliesError } = await dbLoose
        .from('messages')
        .select(`
          *,
          sender:user_profiles!messages_sender_id_fkey(display_name, avatar_url)
        `)
        .eq('thread_root_message_id', rootMessageId)
        .order('created_at', { ascending: true });

      if (repliesError) throw repliesError;

      // Count replies for root
      const repliesCount = repliesData?.length || 0;

      setRootMessage({
        ...rootData,
        sender: rootData.sender?.[0] || null,
        replies_count: repliesCount,
        replies: (repliesData || []).map((msg: any) => ({
          ...msg,
          sender: msg.sender?.[0] || null,
        })),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load thread';
      setError(msg);
      logger.error('[useThreadMessages] Error', { error: err });
    } finally {
      setLoading(false);
    }
  }, [rootMessageId, user]);

  // Stable ref so realtime callback never captures stale fetchThread
  const fetchThreadRef = useRef(fetchThread);
  fetchThreadRef.current = fetchThread;

  useEffect(() => {
    fetchThread();
  }, [fetchThread]);

  // Subscribe to new replies in the thread
  useEffect(() => {
    if (!rootMessageId) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const channel = dbLoose
      .channel(`thread:${rootMessageId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `thread_root_message_id=eq.${rootMessageId}`,
        },
        () => {
          // Debounce rapid INSERT bursts (e.g. paste of multiple messages)
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => fetchThreadRef.current(), 300);
        }
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      dbLoose.removeChannel(channel);
    };
  }, [rootMessageId]);

  const sendReply = useCallback(
    async (content: string, replyToMessageId?: string) => {
      if (!user || !rootMessageId || !content.trim()) {
        throw new Error('Missing required parameters');
      }

      // Determine the reply_to_message_id and thread_root_message_id
      const replyToId = replyToMessageId || rootMessageId;
      const threadRootId = rootMessageId;

      const { data, error } = await dbLoose
        .from('messages')
        .insert({
          conversation_id: (await dbLoose
            .from('messages')
            .select('conversation_id')
            .eq('id', rootMessageId)
            .single()
            .then((r: { data?: { conversation_id?: string } | null }) => r.data?.conversation_id)) as any,
          sender_id: user.id,
          content: content.trim(),
          reply_to_message_id: replyToId,
          thread_root_message_id: threadRootId,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    [user, rootMessageId]
  );

  const muteThread = useCallback(async () => {
    if (!user || !rootMessageId) return;

    const { error } = await dbLoose.from('threads_muted').insert({
      user_id: user.id,
      message_id: rootMessageId,
    });

    if (error && !error.message.includes('duplicate')) {
      throw error;
    }
  }, [user, rootMessageId]);

  const unmuteThread = useCallback(async () => {
    if (!user || !rootMessageId) return;

    const { error } = await dbLoose
      .from('threads_muted')
      .delete()
      .eq('user_id', user.id)
      .eq('message_id', rootMessageId);

    if (error) throw error;
  }, [user, rootMessageId]);

  return {
    rootMessage,
    loading,
    error,
    refetch: fetchThread,
    sendReply,
    muteThread,
    unmuteThread,
  };
}

export function useThreadBadge(conversationId: string | null) {
  const { user } = useAuth();
  const [threadsWithReplies, setThreadsWithReplies] = useState<
    Array<{ messageId: string; replyCount: number; unreadCount: number }>
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!conversationId || !user) {
      setThreadsWithReplies([]);
      setLoading(false);
      return;
    }

    const fetchThreads = async () => {
      try {
        // Fetch all thread replies + last-read timestamps in one query batch.
        // thread_read_positions stores (user_id, thread_root_message_id, last_read_at).
        const [repliesResult, readResult] = await Promise.all([
          dbLoose
            .from('messages')
            .select('id, thread_root_message_id, created_at')
            .eq('conversation_id', conversationId)
            .not('thread_root_message_id', 'is', null)
            .order('created_at', { ascending: false }),
          dbLoose
            .from('thread_read_positions')
            .select('thread_root_message_id, last_read_at')
            .eq('user_id', user!.id)
            .eq('conversation_id', conversationId),
        ]);

        if (repliesResult.error) throw repliesResult.error;

        // Build two maps in a single O(N) pass over the replies array:
        //   threadMap: rootMessageId → { count, latestAt, replies[] }
        //   (replies[] is used below for O(K) unread counting per thread)
        // This avoids the previous O(K×N) nested filter.
        type MsgRow = { thread_root_message_id: string | null; created_at: string };
        type ThreadEntry = { count: number; latestAt: string; replies: MsgRow[] };
        const threadMap = new Map<string, ThreadEntry>();
        for (const msg of ((repliesResult.data as MsgRow[]) || [])) {
          if (!msg.thread_root_message_id) continue;
          const existing = threadMap.get(msg.thread_root_message_id);
          if (existing) {
            existing.count += 1;
            if (msg.created_at > existing.latestAt) existing.latestAt = msg.created_at;
            existing.replies.push(msg);
          } else {
            threadMap.set(msg.thread_root_message_id, {
              count: 1,
              latestAt: msg.created_at,
              replies: [msg],
            });
          }
        }

        // Build map: rootMessageId → last_read_at for current user
        type ReadRow = { thread_root_message_id: string; last_read_at: string };
        const readMap = new Map<string, string>();
        if (!readResult.error) {
          for (const r of ((readResult.data as ReadRow[]) || [])) {
            readMap.set(r.thread_root_message_id, r.last_read_at);
          }
        }

        // Calculate unread: O(K + N) total — each reply visited at most twice.
        const threads = Array.from(threadMap.entries()).map(([messageId, info]) => {
          const lastReadAt = readMap.get(messageId);
          let unreadCount: number;
          if (!lastReadAt) {
            // Never opened — all replies are unread
            unreadCount = info.count;
          } else {
            // Count only replies within this thread that are newer than last read.
            // info.replies is already scoped to this thread — O(replies_in_thread).
            unreadCount = info.replies.filter((m) => m.created_at > lastReadAt).length;
          }
          return { messageId, replyCount: info.count, unreadCount };
        });

        setThreadsWithReplies(threads);
      } catch (err) {
        logger.error('[useThreadBadge] Error', { error: err });
      } finally {
        setLoading(false);
      }
    };

    fetchThreads();
  }, [conversationId, user]);

  return { threadsWithReplies, loading };
}
