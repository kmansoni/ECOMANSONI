import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface CollabInvite {
  id: string;
  post_id: string;
  inviter_id: string;
  invitee_id: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  inviter?: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  };
  invitee?: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  };
}

export function useCollabs() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inviteCollab = useCallback(async (postId: string, inviteeId: string) => {
    if (!user) throw new Error('Необходима авторизация');
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await (supabase as any)
        .from('post_collabs')
        .insert({
          post_id: postId,
          inviter_id: user.id,
          invitee_id: inviteeId,
          status: 'pending',
        })
        .select()
        .single();

      if (err) throw err;
      return data as CollabInvite;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Ошибка приглашения';
      setError(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [user]);

  const acceptCollab = useCallback(async (collabId: string) => {
    if (!user) throw new Error('Необходима авторизация');
    setLoading(true);
    try {
      const { error: err } = await (supabase as any)
        .from('post_collabs')
        .update({ status: 'accepted' })
        .eq('id', collabId)
        .eq('invitee_id', user.id);
      if (err) throw err;
    } finally {
      setLoading(false);
    }
  }, [user]);

  const declineCollab = useCallback(async (collabId: string) => {
    if (!user) throw new Error('Необходима авторизация');
    setLoading(true);
    try {
      const { error: err } = await (supabase as any)
        .from('post_collabs')
        .update({ status: 'declined' })
        .eq('id', collabId)
        .eq('invitee_id', user.id);
      if (err) throw err;
    } finally {
      setLoading(false);
    }
  }, [user]);

  const getMyCollabInvites = useCallback(async (): Promise<CollabInvite[]> => {
    if (!user) return [];
    const selectFields = 'id,post_id,inviter_id,invitee_id,status,created_at,inviter:profiles!post_collabs_inviter_id_fkey(id,display_name,avatar_url),invitee:profiles!post_collabs_invitee_id_fkey(id,display_name,avatar_url)';
    const { data, error: err } = await (supabase as any)
      .from('post_collabs')
      .select(selectFields)
      .eq('invitee_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (err) {
      setError(err.message);
      return [];
    }
    return (data ?? []) as CollabInvite[];
  }, [user]);

  const getPostCollabs = useCallback(async (postId: string): Promise<CollabInvite[]> => {
    const selectFields = 'id,post_id,inviter_id,invitee_id,status,created_at,inviter:profiles!post_collabs_inviter_id_fkey(id,display_name,avatar_url),invitee:profiles!post_collabs_invitee_id_fkey(id,display_name,avatar_url)';
    const { data, error: err } = await (supabase as any)
      .from('post_collabs')
      .select(selectFields)
      .eq('post_id', postId)
      .eq('status', 'accepted');

    if (err) return [];
    return (data ?? []) as CollabInvite[];
  }, []);

  return {
    loading,
    error,
    inviteCollab,
    acceptCollab,
    declineCollab,
    getMyCollabInvites,
    getPostCollabs,
  };
}
