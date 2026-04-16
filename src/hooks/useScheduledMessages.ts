import { useState, useEffect, useCallback } from 'react';
import { supabase, dbLoose } from "@/lib/supabase";
import { logger } from '@/lib/logger';
import { useAuth } from './useAuth';

export interface ScheduledMessage {
  id: string;
  user_id: string;
  conversation_id: string;
  content: string;
  media_url: string | null;
  media_type: string | null;
  duration_seconds: number | null;
  scheduled_for: string;
  created_at: string;
  status: 'scheduled' | 'sent' | 'cancelled' | 'failed';
  reply_to_message_id: string | null;
  thread_root_message_id: string | null;
}

export interface ScheduleMessageInput {
  conversation_id: string;
  content: string;
  media_url?: string | null;
  media_type?: string | null;
  duration_seconds?: number | null;
  scheduled_for: string;
  reply_to_message_id?: string | null;
  thread_root_message_id?: string | null;
}

export function useScheduledMessages(conversationId?: string | null) {
  const { user } = useAuth();
  const [scheduledMessages, setScheduledMessages] = useState<ScheduledMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchScheduledMessages = useCallback(async () => {
    if (!user) {
      setScheduledMessages([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      let query = dbLoose
        .from('scheduled_messages')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'scheduled')
        .gte('scheduled_for', new Date().toISOString())
        .order('scheduled_for', { ascending: true });

      if (conversationId) {
        query = query.eq('conversation_id', conversationId);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;
      setScheduledMessages(data || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load scheduled messages';
      setError(msg);
      logger.error('[useScheduledMessages] Error', { error: err });
    } finally {
      setLoading(false);
    }
  }, [user, conversationId]);

  useEffect(() => {
    fetchScheduledMessages();
  }, [fetchScheduledMessages]);

  // Poll for scheduled messages every 30s
  useEffect(() => {
    if (!user) return;

    const intervalId = window.setInterval(() => {
      void fetchScheduledMessages();
    }, 30_000);

    return () => window.clearInterval(intervalId);
  }, [user, fetchScheduledMessages]);

  // Realtime подписка
  useEffect(() => {
    if (!user) return;

    const filter = conversationId
      ? `user_id=eq.${user.id},conversation_id=eq.${conversationId}`
      : `user_id=eq.${user.id}`;

    const channel = supabase
      .channel(`scheduled-messages:${conversationId ?? 'all'}:${user.id}`)
      .on(
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: 'scheduled_messages',
          filter,
        },
        () => {
          void fetchScheduledMessages();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, conversationId, fetchScheduledMessages]);

  const scheduleMessage = useCallback(async (input: ScheduleMessageInput) => {
    if (!user) {
      throw new Error('Not authenticated');
    }

    const payload = {
      user_id: user.id,
      conversation_id: input.conversation_id,
      content: input.content,
      media_url: input.media_url ?? null,
      media_type: input.media_type ?? null,
      duration_seconds: input.duration_seconds ?? null,
      scheduled_for: input.scheduled_for,
      status: 'scheduled' as const,
      reply_to_message_id: input.reply_to_message_id ?? null,
      thread_root_message_id: input.thread_root_message_id ?? null,
    };

    const { data, error: insertError } = await dbLoose
      .from('scheduled_messages')
      .insert(payload)
      .select('*')
      .single();

    if (insertError) {
      throw insertError;
    }

    await fetchScheduledMessages();
    return data as ScheduledMessage;
  }, [user, fetchScheduledMessages]);

  const cancelScheduledMessage = useCallback(async (id: string) => {
    if (!user) {
      throw new Error('Not authenticated');
    }

    const { error: updateError } = await dbLoose
      .from('scheduled_messages')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('status', 'scheduled');

    if (updateError) {
      throw updateError;
    }

    setScheduledMessages((prev) => prev.filter((message) => message.id !== id));
  }, [user]);

  const deleteScheduledMessage = useCallback(async (id: string) => {
    if (!user) throw new Error('Not authenticated');

    const { error: deleteError } = await dbLoose
      .from('scheduled_messages')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (deleteError) throw deleteError;
    setScheduledMessages((prev) => prev.filter((m) => m.id !== id));
  }, [user]);

  const editScheduledMessage = useCallback(
    async (id: string, updates: Partial<Pick<ScheduledMessage, 'content' | 'scheduled_for'>>) => {
      if (!user) throw new Error('Not authenticated');

      const { data, error: updateError } = await dbLoose
        .from('scheduled_messages')
        .update(updates)
        .eq('id', id)
        .eq('user_id', user.id)
        .eq('status', 'scheduled')
        .select('*')
        .single();

      if (updateError) throw updateError;

      setScheduledMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, ...data } : m))
      );

      return data as ScheduledMessage;
    },
    [user]
  );

  const sendNow = useCallback(
    async (id: string) => {
      if (!user) throw new Error('Not authenticated');

      // Mark as instant send (set scheduled_for to now, backend processes it)
      const { error: updateError } = await dbLoose
        .from('scheduled_messages')
        .update({
          scheduled_for: new Date().toISOString(),
          status: 'scheduled',
        })
        .eq('id', id)
        .eq('user_id', user.id);

      if (updateError) throw updateError;
      await fetchScheduledMessages();
    },
    [user, fetchScheduledMessages]
  );

  return {
    scheduledMessages,
    loading,
    error,
    refresh: fetchScheduledMessages,
    scheduleMessage,
    cancelScheduledMessage,
    deleteScheduledMessage,
    editScheduledMessage,
    sendNow,
    count: scheduledMessages.length,
  };
}
