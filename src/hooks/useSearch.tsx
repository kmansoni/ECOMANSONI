import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { fetchUserBriefMap, resolveUserBrief } from "@/lib/users/userBriefs";

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
  saves_count: number;
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
  is_liked?: boolean;
}

export interface TrendingHashtag {
  hashtag: string;
  normalized_tag: string;
  reels_count: number;
  usage_last_24h: number;
  velocity_score: number;
  status: "normal" | "restricted" | "hidden" | string;
}

export type ExplorePageSectionType =
  | "trending_now"
  | "hashtags"
  | "fresh_creators"
  | "categories"
  | "recommended_reels"
  | string;

export interface ExplorePagePayload {
  generated_at: string;
  sections: Array<{
    type: ExplorePageSectionType;
    title: string | null;
    items: any[];
  }>;
}

export function useSearch() {
  const { user } = useAuth();
  // Хранит запрос, который не удалось выполнить из-за отсутствия сессии.
  // После восстановления сессии (SIGNED_IN / TOKEN_REFRESHED) поиск будет повторён автоматически.
  const pendingAuthQuery = useRef<string | null>(null);

  const [users, setUsers] = useState<SearchUser[]>([]);
  const [explorePosts, setExplorePosts] = useState<ExplorePost[]>([]);
  const [trendingHashtags, setTrendingHashtags] = useState<TrendingHashtag[]>([]);
  const [explorePage, setExplorePage] = useState<ExplorePagePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [exploring, setExploring] = useState(false);
  const [trendingLoading, setTrendingLoading] = useState(false);
  const [explorePageLoading, setExplorePageLoading] = useState(false);

  const searchUsers = useCallback(async (query: string) => {
    if (!query.trim()) {
      setUsers([]);
      return;
    }

    setLoading(true);
    try {
      const raw = query.trim();
      const safeQuery = raw.replace(/[%_,()]/g, "");
      let effectiveData: any[] = [];

      // Проверяем наличие активной сессии перед поиском.
      // Если сессии нет — помечаем запрос для автоповтора и продолжаем попытку
      // (RPC с SECURITY DEFINER может вернуть данные даже без uid, но fallback RLS-запрос — нет).
      const { data: sessionCheck } = await supabase.auth.getSession();
      const hasSession = Boolean(sessionCheck?.session?.access_token);
      if (!hasSession) {
        console.warn(
          "[useSearch] Нет активной сессии — поиск может вернуть пусто. Запрос сохранён для автоповтора после восстановления сессии.",
          { query: raw }
        );
        pendingAuthQuery.current = raw;
      }

      // Primary path: server-side RPC with SECURITY DEFINER.
      // This keeps search working even when profiles RLS differs across environments.
      const rpcResult = await (supabase as any).rpc("search_user_profiles", {
        p_query: safeQuery,
        p_limit: 20,
      });

      if (!rpcResult?.error && Array.isArray(rpcResult?.data)) {
        effectiveData = rpcResult.data;
      }

      // Fallback path for environments where migration is not applied yet.
      if (effectiveData.length === 0) {
        const lowerQuery = safeQuery.toLocaleLowerCase("ru-RU");
        const upperQuery = safeQuery.toLocaleUpperCase("ru-RU");
        const titleQuery =
          safeQuery.length > 0
            ? `${safeQuery.charAt(0).toLocaleUpperCase("ru-RU")}${safeQuery.slice(1).toLocaleLowerCase("ru-RU")}`
            : safeQuery;

        const variants = Array.from(new Set([safeQuery, lowerQuery, upperQuery, titleQuery].filter(Boolean)));
        const byFieldFilters = variants.flatMap((value) => [
          `display_name.like.%${value}%`,
          `username.like.%${value}%`,
          `full_name.like.%${value}%`,
          `first_name.like.%${value}%`,
          `last_name.like.%${value}%`,
        ]);

        const fallback = await supabase
          .from("profiles")
          .select("user_id, display_name, username, full_name, first_name, last_name, avatar_url, bio, verified")
          .or(byFieldFilters.join(","))
          .limit(20);

        if (!fallback.error && Array.isArray(fallback.data)) {
          effectiveData = fallback.data;
        }
      }

      // Если результаты получены — снимаем пометку ожидания для этого запроса.
      if (effectiveData.length > 0 && pendingAuthQuery.current === raw) {
        pendingAuthQuery.current = null;
      }

      // Check if current user is following these users
      let followingIds: string[] = [];
      if (user) {
        const { data: following } = await (supabase as any)
          .from("followers")
          .select("following_id")
          .eq("follower_id", user.id);
        followingIds = (following || []).map((f: any) => f.following_id);
      }

      const usersWithFollowStatus = (effectiveData || [])
        .map((u: any) => ({
          user_id: String(u.user_id),
          display_name: String(
            u.display_name ||
            u.full_name ||
            [u.first_name, u.last_name].filter(Boolean).join(" ") ||
            u.username ||
            "Пользователь"
          ),
          avatar_url: String(u.avatar_url || ""),
          bio: u.bio ? String(u.bio) : undefined,
          verified: Boolean(u.verified),
          isFollowing: followingIds.includes(u.user_id),
        }))
        .filter((u) => Boolean(u.user_id));

      setUsers(usersWithFollowStatus);
    } catch (error) {
      console.error("Error searching users:", error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Автоповтор поиска после восстановления сессии.
  // Срабатывает на SIGNED_IN и TOKEN_REFRESHED — оба события означают наличие валидного токена.
  useEffect(() => {
    if (!supabase?.auth || typeof supabase.auth.onAuthStateChange !== "function") {
      return;
    }

    // NOTE: Must call as supabase.auth.onAuthStateChange() — not via destructuring.
    // Destructuring loses `this` binding, causing GoTrueClient._debug() to throw
    // "TypeError: Cannot read properties of undefined (reading '_debug')".
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string, session: any) => {
      if (
        (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") &&
        session &&
        pendingAuthQuery.current
      ) {
        const query = pendingAuthQuery.current;
        pendingAuthQuery.current = null;
        console.info("[useSearch] Сессия восстановлена, повторяю поиск:", query);
        searchUsers(query);
      }
    });
    return () => subscription?.unsubscribe?.();
  }, [searchUsers]);

  const fetchExplorePosts = useCallback(async () => {
    setExploring(true);
    try {
      const selectBase = `
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
      `;
      const selectWithSaves = `
        id,
        author_id,
        content,
        likes_count,
        comments_count,
        saves_count,
        shares_count,
        views_count,
        created_at,
        post_media (
          media_url,
          media_type,
          sort_order
        )
      `;

      let includesSavesColumn = true;
      let data: any[] | null = null;
      let error: any = null;
      ({ data, error } = await (supabase as any)
        .from("posts")
        .select(selectWithSaves)
        .eq("is_published", true)
        .order("created_at", { ascending: false })
        .limit(30));

      const errorText = String(error?.message || error?.details || "");
      const isMissingSavesColumn = !!error && /(saves_count|column)/i.test(errorText);
      if (isMissingSavesColumn) {
        includesSavesColumn = false;
        const retry = await (supabase as any)
          .from("posts")
          .select(selectBase)
          .eq("is_published", true)
          .order("created_at", { ascending: false })
          .limit(30);
        data = retry.data;
        error = retry.error;
      }

      if (error) throw error;

      // Only include posts with media
      const postsWithMedia = (data || [])
        .filter((p: any) => p.post_media && p.post_media.length > 0);
      
      // Fetch author identity + verification
      const authorIds = [...new Set(postsWithMedia.map((p: any) => p.author_id))];
      const briefMap = await fetchUserBriefMap(authorIds, supabase as any);
      const postIds = postsWithMedia.map((p: any) => p.id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, verified")
        .in("user_id", authorIds);

      // Fetch real engagement rows so Explore counters match Home feed behavior.
      const [allLikesRes, allCommentsRes, allSavesRes] = await Promise.all([
        supabase
          .from("post_likes")
          .select("post_id")
          .in("post_id", postIds),
        supabase
          .from("comments")
          .select("post_id")
          .in("post_id", postIds),
        includesSavesColumn
          ? Promise.resolve({ data: [] as { post_id: string }[] })
          : supabase
              .from("saved_posts")
              .select("post_id")
              .in("post_id", postIds),
      ]);

      const likesCountMap = new Map<string, number>();
      const commentsCountMap = new Map<string, number>();
      const savesCountMap = new Map<string, number>();

      (allLikesRes.data || []).forEach((row: any) => {
        const postId = String(row.post_id);
        likesCountMap.set(postId, (likesCountMap.get(postId) || 0) + 1);
      });

      (allCommentsRes.data || []).forEach((row: any) => {
        const postId = String(row.post_id);
        commentsCountMap.set(postId, (commentsCountMap.get(postId) || 0) + 1);
      });

      (allSavesRes.data || []).forEach((row: any) => {
        const postId = String(row.post_id);
        savesCountMap.set(postId, (savesCountMap.get(postId) || 0) + 1);
      });

      // Fetch current user's likes for Explore posts so the UI heart state is correct on first render.
      let likedIds = new Set<string>();
      if (user && postIds.length > 0) {
        const { data: likes } = await (supabase as any)
          .from("post_likes")
          .select("post_id")
          .eq("user_id", user.id)
          .in("post_id", postIds);
        likedIds = new Set((likes || []).map((l: any) => String(l.post_id)));
      }
      
      const verifiedMap = new Map((profiles || []).map((p: any) => [String(p.user_id), Boolean(p.verified)]));
      
      const enrichedPosts: ExplorePost[] = postsWithMedia.map((p: any) => {
        const brief = resolveUserBrief(p.author_id, briefMap);
        const likesCount = Math.max(0, likesCountMap.get(String(p.id)) ?? p.likes_count ?? 0);
        const commentsCount = Math.max(0, commentsCountMap.get(String(p.id)) ?? p.comments_count ?? 0);
        const savesCount = includesSavesColumn
          ? Math.max(0, p.saves_count ?? 0)
          : Math.max(0, savesCountMap.get(String(p.id)) ?? p.saves_count ?? 0);
        const sharesCount = Math.max(0, p.shares_count ?? 0);
        const viewsCount = Math.max(0, p.views_count ?? 0);

        return {
          id: p.id,
          author_id: p.author_id,
          content: p.content,
          likes_count: likesCount,
          comments_count: commentsCount,
          saves_count: savesCount,
          shares_count: sharesCount,
          views_count: viewsCount,
          created_at: p.created_at,
          profile: brief
            ? {
                display_name: brief.display_name,
                avatar_url: brief.avatar_url,
                verified: verifiedMap.get(String(p.author_id)) ?? false,
              }
            : undefined,
          media: p.post_media,
          is_liked: likedIds.has(String(p.id)),
        };
      });

      setExplorePosts(enrichedPosts);
    } catch (error) {
      console.error("Error fetching explore posts:", error);
    } finally {
      setExploring(false);
    }
  }, [user]);

  const fetchTrendingHashtags = useCallback(async () => {
    setTrendingLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc("get_trending_hashtags_v1", {
        p_limit: 12,
      });
      if (error) throw error;
      setTrendingHashtags((data || []) as TrendingHashtag[]);
    } catch (error) {
      console.error("Error fetching trending hashtags:", error);
      setTrendingHashtags([]);
    } finally {
      setTrendingLoading(false);
    }
  }, []);

  const fetchExplorePage = useCallback(async () => {
    setExplorePageLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc("get_explore_page_v2", {
        p_segment_id: "seg_default",
        p_locale: navigator.language || "ru-RU",
        p_country: null,
        p_allow_stale: true,
        p_force_refresh: false,
      });
      if (error) throw error;
      setExplorePage((data || null) as ExplorePagePayload | null);
    } catch (error) {
      console.error("Error fetching explore page:", error);
      setExplorePage(null);
    } finally {
      setExplorePageLoading(false);
    }
  }, []);

  const toggleFollow = useCallback(async (targetUserId: string) => {
    if (!user) return;

    const targetUser = users.find((u) => u.user_id === targetUserId);
    if (!targetUser) return;

    try {
      if (targetUser.isFollowing) {
        const { error } = await (supabase as any)
          .from("followers")
          .delete()
          .eq("follower_id", user.id)
          .eq("following_id", targetUserId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("followers")
          .insert({
            follower_id: user.id,
            following_id: targetUserId,
          });
        if (error) throw error;
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
    trendingHashtags,
    explorePage,
    loading,
    exploring,
    trendingLoading,
    explorePageLoading,
    searchUsers,
    fetchExplorePosts,
    fetchTrendingHashtags,
    fetchExplorePage,
    toggleFollow,
  };
}
