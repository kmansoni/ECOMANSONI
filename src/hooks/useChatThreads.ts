import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';

const supabaseAny = supabase as any;

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
      const { data: rootData, error: rootError } = await supabaseAny
        .from('messages')
        .select(`
          *,
          sender:user_profiles!messages_sender_id_fkey(display_name, avatar_url)
        `)
        .eq('id', rootMessageId)
        .single();

      if (rootError) throw rootError;

      // Fetch all replies in the thread (messages with same thread_root_message_id)
      const { data: repliesData, error: repliesError } = await supabaseAny
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
      console.error('[useThreadMessages] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [rootMessageId, user]);

  useEffect(() => {
    fetchThread();
  }, [fetchThread]);

  // Subscribe to new replies in the thread
  useEffect(() => {
    if (!rootMessageId) return;

    const channel = supabaseAny
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
          fetchThread();
        }
      )
      .subscribe();

    return () => {
      supabaseAny.removeChannel(channel);
    };
  }, [rootMessageId, fetchThread]);

  const sendReply = useCallback(
    async (content: string, replyToMessageId?: string) => {
      if (!user || !rootMessageId || !content.trim()) {
        throw new Error('Missing required parameters');
      }

      // Determine the reply_to_message_id and thread_root_message_id
      const replyToId = replyToMessageId || rootMessageId;
      const threadRootId = rootMessageId;

      const { data, error } = await supabaseAny
        .from('messages')
        .insert({
          conversation_id: (await supabaseAny
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

    const { error } = await supabaseAny.from('threads_muted').insert({
      user_id: user.id,
      message_id: rootMessageId,
    });

    if (error && !error.message.includes('duplicate')) {
      throw error;
    }
  }, [user, rootMessageId]);

  const unmuteThread = useCallback(async () => {
    if (!user || !rootMessageId) return;

    const { error } = await supabaseAny
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
        // Get all root messages with replies in this conversation
        const { data, error } = await supabaseAny
          .from('messages')
          .select('id, thread_root_message_id, created_at')
          .eq('conversation_id', conversationId)
          .not('thread_root_message_id', 'is', null)
          .order('created_at', { ascending: false });

        if (error) throw error;

        // Group by thread root and count
        const threadMap = new Map<string, number>();
        (data || []).forEach((msg: { thread_root_message_id: string | null }) => {
          if (msg.thread_root_message_id) {
            const count = threadMap.get(msg.thread_root_message_id) || 0;
            threadMap.set(msg.thread_root_message_id, count + 1);
          }
        });

        // Get root messages that have replies
        const threads = Array.from(threadMap.entries()).map(
          ([messageId, replyCount]) => ({
            messageId,
            replyCount,
            unreadCount: 0, // TODO: Calculate based on last read position
          })
        );

        setThreadsWithReplies(threads);
      } catch (err) {
        console.error('[useThreadBadge] Error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchThreads();
  }, [conversationId, user]);

  return { threadsWithReplies, loading };
}
