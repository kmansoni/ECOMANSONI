import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/lib/logger";

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
    try {
      const { data, error } = await supabase
        .from("close_friends")
        .select("friend_id")
        .eq("user_id", user.id)
        .limit(500);
      if (!error && data) {
        setCloseFriends(data.map((r) => r.friend_id));
      }
      if (error) {
        logger.error("[useCloseFriends] fetch error", { error });
      }
    } catch (err) {
      logger.error("[useCloseFriends] unexpected error", { err });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    const controller = new AbortController();
    fetchCloseFriends();
    return () => controller.abort();
  }, [fetchCloseFriends]);

  const addFriend = useCallback(async (friendId: string) => {
    if (!user) return;
    setCloseFriends(prev => prev.includes(friendId) ? prev : [...prev, friendId]);
    const { error } = await supabase
      .from("close_friends")
      .insert({ user_id: user.id, friend_id: friendId });
    if (error) {
      logger.error("[useCloseFriends] addFriend error", { error });
      fetchCloseFriends();
    }
  }, [user, fetchCloseFriends]);

  const removeFriend = useCallback(async (friendId: string) => {
    if (!user) return;
    setCloseFriends(prev => prev.filter(id => id !== friendId));
    const { error } = await supabase
      .from("close_friends")
      .delete()
      .eq("user_id", user.id)
      .eq("friend_id", friendId);
    if (error) {
      logger.error("[useCloseFriends] removeFriend error", { error });
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
