import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface Reel {
  id: string;
  author_id: string;
  video_url: string;
  thumbnail_url?: string;
  description?: string;
  music_title?: string;
  likes_count: number;
  comments_count: number;
  views_count: number;
  created_at: string;
  author?: {
    display_name: string;
    avatar_url: string;
    verified: boolean;
  };
  isLiked?: boolean;
}

export function useReels() {
  const { user } = useAuth();
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [likedReels, setLikedReels] = useState<Set<string>>(new Set());

  const fetchReels = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("reels")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      // Fetch author profiles
      const authorIds = [...new Set((data || []).map((r: any) => r.author_id))] as string[];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url, verified")
        .in("user_id", authorIds);

      const profileMap = new Map(
        (profiles || []).map((p) => [p.user_id, p])
      );

      // Fetch user's liked reels
      let userLikedReels: string[] = [];
      if (user) {
        const { data: likes } = await (supabase as any)
          .from("reel_likes")
          .select("reel_id")
          .eq("user_id", user.id);
        userLikedReels = (likes || []).map((l: any) => l.reel_id);
        setLikedReels(new Set(userLikedReels));
      }

      const reelsWithAuthors = (data || []).map((r: any) => ({
        ...r,
        author: profileMap.get(r.author_id) || {
          display_name: "Пользователь",
          avatar_url: null,
          verified: false,
        },
        isLiked: userLikedReels.includes(r.id),
      }));

      setReels(reelsWithAuthors);
    } catch (error) {
      console.error("Error fetching reels:", error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const toggleLike = useCallback(async (reelId: string) => {
    if (!user) return;

    const isCurrentlyLiked = likedReels.has(reelId);

    try {
      if (isCurrentlyLiked) {
        await (supabase as any)
          .from("reel_likes")
          .delete()
          .eq("reel_id", reelId)
          .eq("user_id", user.id);

        setLikedReels((prev) => {
          const newSet = new Set(prev);
          newSet.delete(reelId);
          return newSet;
        });

        setReels((prev) =>
          prev.map((r) =>
            r.id === reelId
              ? { ...r, likes_count: Math.max(0, r.likes_count - 1), isLiked: false }
              : r
          )
        );
      } else {
        await (supabase as any)
          .from("reel_likes")
          .insert({ reel_id: reelId, user_id: user.id });

        setLikedReels((prev) => new Set([...prev, reelId]));

        setReels((prev) =>
          prev.map((r) =>
            r.id === reelId
              ? { ...r, likes_count: r.likes_count + 1, isLiked: true }
              : r
          )
        );
      }
    } catch (error) {
      console.error("Error toggling like:", error);
    }
  }, [user, likedReels]);

  const recordView = useCallback(async (reelId: string) => {
    try {
      await (supabase as any)
        .from("reel_views")
        .insert({
          reel_id: reelId,
          user_id: user?.id || null,
          session_id: !user ? `anon-${Date.now()}` : null,
        });
    } catch (error) {
      console.error("Error recording view:", error);
    }
  }, [user]);

  const createReel = useCallback(async (
    videoUrl: string,
    thumbnailUrl?: string,
    description?: string,
    musicTitle?: string
  ) => {
    if (!user) return { error: "Not authenticated" };

    try {
      const { data, error } = await (supabase as any)
        .from("reels")
        .insert({
          author_id: user.id,
          video_url: videoUrl,
          thumbnail_url: thumbnailUrl,
          description,
          music_title: musicTitle,
        })
        .select()
        .single();

      if (error) throw error;

      await fetchReels();
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }, [user, fetchReels]);

  useEffect(() => {
    fetchReels();
  }, [fetchReels]);

  return {
    reels,
    loading,
    likedReels,
    toggleLike,
    recordView,
    createReel,
    refetch: fetchReels,
  };
}
