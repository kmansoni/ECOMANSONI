import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

export interface GroupTopic {
  id: string;
  group_id: string;
  name: string;
  icon_emoji: string;
  icon_color: string;
  description: string | null;
  is_general: boolean;
  is_closed: boolean;
  message_count: number;
  last_message_at: string | null;
  created_by: string;
  created_at: string;
  sort_order: number;
  unread_count?: number;
}

export function useGroupTopics(groupId: string | null) {
  const { user } = useAuth();
  const [topics, setTopics] = useState<GroupTopic[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchTopics = useCallback(async () => {
    if (!groupId) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('group_topics')
        .select('*')
        .eq('group_id', groupId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (!error && data) {
        setTopics(data as GroupTopic[]);
      }
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    fetchTopics();
  }, [fetchTopics]);

  // Подписка на реалтайм обновления
  useEffect(() => {
    if (!groupId) return;
    const channel = supabase
      .channel(`group_topics_${groupId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'group_topics',
        filter: `group_id=eq.${groupId}`,
      }, () => {
        fetchTopics();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, fetchTopics]);

  const createTopic = useCallback(async (params: {
    name: string;
    icon_emoji?: string;
    icon_color?: string;
    description?: string;
  }) => {
    if (!groupId || !user) return null;

    const { data, error } = await (supabase as any)
      .from('group_topics')
      .insert({
        group_id: groupId,
        name: params.name,
        icon_emoji: params.icon_emoji || '💬',
        icon_color: params.icon_color || '#3B82F6',
        description: params.description || null,
        created_by: user.id,
        sort_order: topics.length,
      })
      .select()
      .single();

    if (!error && data) {
      setTopics(prev => [...prev, data as GroupTopic]);
      return data as GroupTopic;
    }
    return null;
  }, [groupId, user, topics.length]);

  const editTopic = useCallback(async (topicId: string, params: {
    name?: string;
    icon_emoji?: string;
    icon_color?: string;
    description?: string;
  }) => {
    const { error } = await (supabase as any)
      .from('group_topics')
      .update(params)
      .eq('id', topicId);

    if (!error) {
      setTopics(prev => prev.map(t => t.id === topicId ? { ...t, ...params } : t));
    }
    return !error;
  }, []);

  const deleteTopic = useCallback(async (topicId: string) => {
    const topic = topics.find(t => t.id === topicId);
    if (!topic || topic.is_general) return false;

    const { error } = await (supabase as any)
      .from('group_topics')
      .delete()
      .eq('id', topicId);

    if (!error) {
      setTopics(prev => prev.filter(t => t.id !== topicId));
    }
    return !error;
  }, [topics]);

  const toggleClosed = useCallback(async (topicId: string) => {
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return false;

    const newState = !topic.is_closed;
    const { error } = await (supabase as any)
      .from('group_topics')
      .update({ is_closed: newState })
      .eq('id', topicId);

    if (!error) {
      setTopics(prev => prev.map(t => t.id === topicId ? { ...t, is_closed: newState } : t));
    }
    return !error;
  }, [topics]);

  const reorderTopics = useCallback(async (orderedIds: string[]) => {
    const updates = orderedIds.map((id, index) => ({ id, sort_order: index }));
    setTopics(prev => {
      const map = new Map(prev.map(t => [t.id, t]));
      return orderedIds.map((id, i) => ({ ...(map.get(id) as GroupTopic), sort_order: i }));
    });

    for (const upd of updates) {
      await (supabase as any)
        .from('group_topics')
        .update({ sort_order: upd.sort_order })
        .eq('id', upd.id);
    }
  }, []);

  return { topics, createTopic, editTopic, deleteTopic, toggleClosed, reorderTopics, loading, refetch: fetchTopics };
}
