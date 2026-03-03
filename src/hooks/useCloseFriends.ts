import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface CloseFriend {
  user_id: string;
  friend_id: string;
  created_at: string;
}

export function useCloseFriends() {
  const { user } = useAuth();
  const [closeFriends, setCloseFriends] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchCloseFriends = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('close_friends')
      .select('friend_id')
      .eq('user_id', user.id);
    if (!error && data) {
      setCloseFriends(data.map((r: { friend_id: string }) => r.friend_id));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchCloseFriends();
  }, [fetchCloseFriends]);

  const addFriend = useCallback(async (friendId: string) => {
    if (!user) return;
    // Оптимистичное обновление
    setCloseFriends(prev => prev.includes(friendId) ? prev : [...prev, friendId]);
    const { error } = await (supabase as any)
      .from('close_friends')
      .insert({ user_id: user.id, friend_id: friendId });
    if (error) {
      fetchCloseFriends();
    }
  }, [user, fetchCloseFriends]);

  const removeFriend = useCallback(async (friendId: string) => {
    if (!user) return;
    // Оптимистичное обновление
    setCloseFriends(prev => prev.filter(id => id !== friendId));
    const { error } = await (supabase as any)
      .from('close_friends')
      .delete()
      .eq('user_id', user.id)
      .eq('friend_id', friendId);
    if (error) {
      fetchCloseFriends();
    }
  }, [user, fetchCloseFriends]);

  const isCloseFriend = useCallback((userId: string) => {
    return closeFriends.includes(userId);
  }, [closeFriends]);

  return {
    closeFriends,
    loading,
    addFriend,
    removeFriend,
    isCloseFriend,
    refetch: fetchCloseFriends,
  };
}
