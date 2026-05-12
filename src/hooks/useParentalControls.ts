import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export const useParentalControls = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [links, setLinks] = useState<any[]>([]);

  const createInvite = useCallback(async (teenUserId: string, relationship: 'mother' | 'father' | 'guardian' | 'other' = 'parent') => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc('create_parental_invite', {
        p_teen_user_id: teenUserId,
        p_parent_user_id: (await supabase.auth.getUser()).data.user?.id,
        p_relationship: relationship,
      });

      if (error) throw error;
      return data;
    } catch (err: any) {
      console.error('Failed to create invite:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const acceptInvite = useCallback(async (inviteCode: string) => {
    setIsLoading(true);
    try {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      const { data, error } = await supabase.rpc('accept_parental_invite', {
        p_invite_code: inviteCode,
        p_parent_user_id: userId,
      });

      if (error) throw error;
      return data;
    } catch (err: any) {
      console.error('Failed to accept invite:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchLinks = useCallback(async () => {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    const { data, error } = await supabase
      .from('parental_links')
      .select('*')
      .or(`teen_user_id.eq.${userId},parent_user_id.eq.${userId}`)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setLinks(data);
    }
  }, []);

  const revokeLink = useCallback(async (linkId: string) => {
    const { error } = await supabase
      .from('parental_links')
      .update({ status: 'revoked' })
      .eq('id', linkId);

    if (!error) {
      setLinks((prev) => prev.filter((l) => l.id !== linkId));
    }
  }, []);

  const overrideContentLimit = useCallback(async (teenId: string, newRating: 'G' | 'PG' | 'PG-13' | 'T' | 'MA') => {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    const { data, error } = await supabase.rpc('parent_override_content_limit', {
      p_teen_id: teenId,
      p_parent_id: userId,
      p_new_rating: newRating,
    });

    if (error) throw error;
    return data;
  }, []);

  return {
    isLoading,
    links,
    createInvite,
    acceptInvite,
    fetchLinks,
    revokeLink,
    overrideContentLimit,
  };
};
