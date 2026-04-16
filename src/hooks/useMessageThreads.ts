// ============================================================================
// B-098: Message Threads Hook
// ============================================================================

import { useState, useCallback } from 'react';
import { supabase, dbLoose } from '@/lib/supabase';
import { useAuth } from './useAuth';
import { logger } from '@/lib/logger';

type ThreadMessageRow = ThreadMessage & {
  sender?: Array<{
    display_name: string | null;
    avatar_url: string | null;
  }> | null;
};

function mapThreadMessage(row: ThreadMessageRow): ThreadMessage {
  const sender = Array.isArray(row.sender) && row.sender[0]
    ? {
        display_name: row.sender[0].display_name,
        avatar_url: row.sender[0].avatar_url,
      }
    : undefined;

  return {
    ...row,
    sender,
  };
}

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

export interface Thread {
  rootMessage: ThreadMessage;
  replies: ThreadMessage[];
  totalReplies: number;
}

export function useMessageThreads(conversationId: string | null) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get thread by root message ID
  const getThread = useCallback(async (rootMessageId: string): Promise<Thread | null> => {
    if (!user || !conversationId) return null;
    
    setLoading(true);
    setError(null);

    try {
      // Get root message
      const { data: rootMessage, error: rootError } = await dbLoose
        .from('messages')
        .select(`
          *,
          sender:user_profiles!messages_sender_id_fkey(display_name, avatar_url)
        `)
        .eq('id', rootMessageId)
        .single();

      if (rootError) throw rootError;

      // Get all replies in thread
      const { data: replies, error: repliesError } = await dbLoose
        .from('messages')
        .select(`
          *,
          sender:user_profiles!messages_sender_id_fkey(display_name, avatar_url)
        `)
        .eq('thread_root_message_id', rootMessageId)
        .order('created_at', { ascending: true });

      if (repliesError) throw repliesError;

      const mappedRoot = mapThreadMessage(rootMessage as unknown as ThreadMessageRow);

      const mappedReplies: ThreadMessage[] = (replies || []).map((message) => mapThreadMessage(message as unknown as ThreadMessageRow));

      return {
        rootMessage: mappedRoot,
        replies: mappedReplies,
        totalReplies: mappedReplies.length,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load thread';
      setError(msg);
      logger.error('[useMessageThreads] getThread error', { error: err });
      return null;
    } finally {
      setLoading(false);
    }
  }, [user, conversationId]);

  const createReply = useCallback(async (
    rootMessageId: string,
    content: string,
    replyToMessageId?: string | null,
  ): Promise<ThreadMessage> => {
    if (!user || !conversationId) {
      throw new Error('Not authenticated');
    }
    if (!content.trim()) {
      throw new Error('Message content is empty');
    }

    const { data, error: insertError } = await dbLoose
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: content.trim(),
        reply_to_message_id: replyToMessageId ?? rootMessageId,
        thread_root_message_id: rootMessageId,
      })
      .select(`
        *,
        sender:user_profiles!messages_sender_id_fkey(display_name, avatar_url)
      `)
      .single();

    if (insertError) throw insertError;

    return mapThreadMessage(data as unknown as ThreadMessageRow);
  }, [user, conversationId]);

  const listThreadRoots = useCallback(async (): Promise<ThreadMessage[]> => {
    if (!user || !conversationId) {
      return [];
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: listError } = await dbLoose
        .from('messages')
        .select(`
          *,
          sender:user_profiles!messages_sender_id_fkey(display_name, avatar_url)
        `)
        .eq('conversation_id', conversationId)
        .is('thread_root_message_id', null)
        .order('created_at', { ascending: false });

      if (listError) throw listError;

      return (data || []).map((message) => mapThreadMessage(message as unknown as ThreadMessageRow));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load threads';
      setError(msg);
      logger.error('[useMessageThreads] listThreadRoots error', { error: err });
      return [];
    } finally {
      setLoading(false);
    }
  }, [user, conversationId]);

  return {
    loading,
    error,
    getThread,
    createReply,
    listThreadRoots,
  };
}
