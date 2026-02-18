import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface SearchUser {
  user_id: string;
  display_name: string;
  avatar_url: string;
  bio?: string;
  verified?: boolean;
  isFollowing?: boolean;
}

export interface ExplorePost {
  id: string;
  author_id: string;
  content?: string;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  views_count: number;
  created_at: string;
  profile?: {
    display_name: string | null;
    avatar_url: string | null;
    verified?: boolean;
  };
  media?: {
    media_url: string;
    media_type: string;
  }[];
}

export function useSearch() {
  const { user } = useAuth();
  const [users, setUsers] = useState<SearchUser[]>([]);
  const [explorePosts, setExplorePosts] = useState<ExplorePost[]>([]);
  const [loading, setLoading] = useState(false);
  const [exploring, setExploring] = useState(false);

  const searchUsers = useCallback(async (query: string) => {
    if (!query.trim()) {
      setUsers([]);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url, bio, verified")
        .ilike("display_name", `%${query}%`)
        .limit(20);

      if (error) throw error;

      // Check if current user is following these users
      let followingIds: string[] = [];
      if (user) {
        const { data: following } = await (supabase as any)
          .from("followers")
          .select("following_id")
          .eq("follower_id", user.id);
        followingIds = (following || []).map((f: any) => f.following_id);
      }

      const usersWithFollowStatus = (data || []).map((u) => ({
        ...u,
        isFollowing: followingIds.includes(u.user_id),
      }));

      setUsers(usersWithFollowStatus);
    } catch (error) {
      console.error("Error searching users:", error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const fetchExplorePosts = useCallback(async () => {
    setExploring(true);
    try {
      const { data, error } = await supabase
        .from("posts")
        .select(`
          id,
          author_id,
          content,
          likes_count,
          comments_count,
          shares_count,
          views_count,
          created_at,
          post_media (
            media_url,
            media_type,
            sort_order
          )
        `)
        .eq("is_published", true)
        .order("created_at", { ascending: false })
        .limit(30);

      if (error) throw error;

      // Only include posts with media
      const postsWithMedia = (data || [])
        .filter((p: any) => p.post_media && p.post_media.length > 0);
      
      // Fetch author profiles
      const authorIds = [...new Set(postsWithMedia.map((p: any) => p.author_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url, verified")
        .in("user_id", authorIds);
      
      const profilesMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
      
      const enrichedPosts: ExplorePost[] = postsWithMedia.map((p: any) => ({
        id: p.id,
        author_id: p.author_id,
        content: p.content,
        likes_count: p.likes_count,
        comments_count: p.comments_count,
        shares_count: p.shares_count,
        views_count: p.views_count,
        created_at: p.created_at,
        profile: profilesMap.get(p.author_id) || undefined,
        media: p.post_media,
      }));

      setExplorePosts(enrichedPosts);
    } catch (error) {
      console.error("Error fetching explore posts:", error);
    } finally {
      setExploring(false);
    }
  }, []);

  const toggleFollow = useCallback(async (targetUserId: string) => {
    if (!user) return;

    const targetUser = users.find((u) => u.user_id === targetUserId);
    if (!targetUser) return;

    try {
      if (targetUser.isFollowing) {
        await (supabase as any)
          .from("followers")
          .delete()
          .eq("follower_id", user.id)
          .eq("following_id", targetUserId);
      } else {
        await (supabase as any)
          .from("followers")
          .insert({
            follower_id: user.id,
            following_id: targetUserId,
          });
      }

      setUsers((prev) =>
        prev.map((u) =>
          u.user_id === targetUserId
            ? { ...u, isFollowing: !u.isFollowing }
            : u
        )
      );
    } catch (error) {
      console.error("Error toggling follow:", error);
    }
  }, [user, users]);

  return {
    users,
    explorePosts,
    loading,
    exploring,
    searchUsers,
    fetchExplorePosts,
    toggleFollow,
  };
}
