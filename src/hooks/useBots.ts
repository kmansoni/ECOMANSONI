import { useState, useEffect, useCallback } from 'react';
import { dbLoose } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

export interface Bot {
  id: string;
  owner_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  description: string | null;
  api_token: string;
  is_active: boolean;
  capabilities: string[];
  webhook_url: string | null;
  created_at: string;
}

export interface BotCommand {
  id: string;
  bot_id: string;
  command: string;
  description: string;
  sort_order: number;
}

/** Ответ Supabase для таблиц, отсутствующих в generated types */
interface UntypedResult<T> {
  data: T | null;
  error: { message: string; code?: string } | null;
}

export function useBots() {
  const { user } = useAuth();
  const [myBots, setMyBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchBots = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data } = await dbLoose
        .from('bots')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at') as UntypedResult<Bot[]>;
      if (data) setMyBots(data);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchBots();
  }, [fetchBots]);

  const createBot = useCallback(async (params: {
    username: string;
    display_name: string;
    description?: string;
  }) => {
    if (!user) return null;
    const { data, error } = await dbLoose
      .from('bots')
      .insert({ ...params, owner_id: user.id })
      .select()
      .single() as UntypedResult<Bot>;
    if (!error && data) {
      setMyBots(prev => [...prev, data]);
      return data;
    }
    return null;
  }, [user]);

  const deleteBot = useCallback(async (botId: string) => {
    const { error } = await dbLoose.from('bots').delete().eq('id', botId) as UntypedResult<unknown>;
    if (!error) setMyBots(prev => prev.filter(b => b.id !== botId));
    return !error;
  }, []);

  const regenerateToken = useCallback(async (botId: string) => {
    const newToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    const { error } = await dbLoose
      .from('bots')
      .update({ api_token: newToken })
      .eq('id', botId) as UntypedResult<unknown>;
    if (!error) {
      setMyBots(prev => prev.map(b => b.id === botId ? { ...b, api_token: newToken } : b));
      return newToken;
    }
    return null;
  }, []);

  const addCommand = useCallback(async (botId: string, command: string, description: string) => {
    const { data, error } = await dbLoose
      .from('bot_commands')
      .insert({ bot_id: botId, command, description })
      .select()
      .single() as UntypedResult<BotCommand>;
    if (!error && data) return data;
    return null;
  }, []);

  const removeCommand = useCallback(async (commandId: string) => {
    const { error } = await dbLoose.from('bot_commands').delete().eq('id', commandId) as UntypedResult<unknown>;
    return !error;
  }, []);

  const addBotToChat = useCallback(async (botId: string, conversationId: string) => {
    if (!user) return false;
    const { error } = await dbLoose
      .from('bot_conversations')
      .insert({ bot_id: botId, conversation_id: conversationId, added_by: user.id }) as UntypedResult<unknown>;
    return !error;
  }, [user]);

  const getBotCommands = useCallback(async (botId: string): Promise<BotCommand[]> => {
    const { data } = await dbLoose
      .from('bot_commands')
      .select('*')
      .eq('bot_id', botId)
      .order('sort_order') as UntypedResult<BotCommand[]>;
    return data || [];
  }, []);

  return { myBots, createBot, deleteBot, regenerateToken, addCommand, removeCommand, addBotToChat, getBotCommands, loading, refetch: fetchBots };
}
