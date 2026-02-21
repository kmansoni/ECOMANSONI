import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { isGuestMode } from "@/lib/demo/demoMode";
import { getDemoBotsReels, isDemoId } from "@/lib/demo/demoBots";

export interface Reel {
  id: string;
  author_id: string;
  video_url: string;
  thumbnail_url?: string;
  description?: string;
  music_title?: string;
  duration_seconds?: number;
  likes_count: number;
  comments_count: number;
  views_count: number;
  saves_count?: number;
  reposts_count?: number;
  shares_count?: number;
  created_at: string;
  author?: {
    display_name: string;
    avatar_url: string;
    verified: boolean;
  };
  isLiked?: boolean;
  isSaved?: boolean;
  isReposted?: boolean;
  // Professional impression tracking metadata
  request_id?: string;
  feed_position?: number;
  algorithm_version?: string;
  final_score?: number;
}

export type ReelsFeedMode = "reels" | "friends";

export function useReels(feedMode: ReelsFeedMode = "reels") {
  const { user } = useAuth();
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [likedReels, setLikedReels] = useState<Set<string>>(new Set());
  const [savedReels, setSavedReels] = useState<Set<string>>(new Set());
  const [repostedReels, setRepostedReels] = useState<Set<string>>(new Set());

  const fetchReels = useCallback(async () => {
    setLoading(true);
    try {
      // Demo/guest mode: keep existing behavior (demo bots + latest reels)
      let followedAuthorIds: string[] | null = null;
      if (feedMode === "friends") {
        if (!user) {
          setReels([]);
          setLoading(false);
          return;
        }
        const { data: followed, error: followedError } = await supabase
          .from("followers")
          .select("following_id")
          .eq("follower_id", user.id);
        if (followedError) throw followedError;
        followedAuthorIds = (followed || []).map((f: any) => f.following_id);
        // Include own reels as well
        followedAuthorIds = Array.from(new Set([...(followedAuthorIds || []), user.id]));
      }

      let data: any[] | null = null;
      let error: any = null;

      if (feedMode === "reels") {
        // One request_id per fetch batch: used to correlate impressions and enable conflict-safe dedupe.
        // Server may also provide a request_id, but we generate one client-side to keep this robust.
        const fetchRequestId = crypto.randomUUID();

        let anonSessionId: string | null = null;
        if (!user) {
          anonSessionId = sessionStorage.getItem("reels_anon_session_id");
          if (!anonSessionId) {
            anonSessionId = crypto.randomUUID();
            sessionStorage.setItem("reels_anon_session_id", anonSessionId);
          }
        }

        const sessionId = !user ? `anon-${anonSessionId}` : null;
        const rpc = await (supabase as any).rpc("get_reels_feed_v2", {
          p_limit: 50,
          p_offset: 0,
          p_session_id: sessionId,
        });

        // Normalize payload:
        // - legacy RPC returns `id`
        // - newer/experimental variants may return `reel_id`
        // Also enrich with request_id/feed_position for impression correlation.
        data = (rpc.data || []).map((row: any, index: number) => {
          const id = row?.id ?? row?.reel_id;
          return {
            ...row,
            id,
            request_id: row?.request_id ?? fetchRequestId,
            feed_position: row?.feed_position ?? index,
            algorithm_version: row?.algorithm_version,
            final_score: row?.final_score ?? row?.score,
          };
        });
        error = rpc.error;
      } else {
        let query = (supabase as any)
          .from("reels")
          .select("*")
          .neq("moderation_status", "blocked")
          .order("created_at", { ascending: false })
          .limit(50);

        if (followedAuthorIds) {
          if (followedAuthorIds.length === 0) {
            setReels([]);
            setLoading(false);
            return;
          }
          query = query.in("author_id", followedAuthorIds);
        }

        const res = await query;
        data = res.data;
        error = res.error;
      }

      if (error) throw error;

      const feedReelIds = (data || []).map((r: any) => r.id) as string[];

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
      let userSavedReels: string[] = [];
      let userRepostedReels: string[] = [];
      if (user) {
        if (feedReelIds.length === 0) {
          setLikedReels(new Set());
          setSavedReels(new Set());
          setRepostedReels(new Set());
        } else {
          const { data: likes } = await (supabase as any)
            .from("reel_likes")
            .select("reel_id")
            .eq("user_id", user.id)
            .in("reel_id", feedReelIds);
        userLikedReels = (likes || []).map((l: any) => l.reel_id);
        setLikedReels(new Set(userLikedReels));

          const { data: saves } = await (supabase as any)
            .from("reel_saves")
            .select("reel_id")
            .eq("user_id", user.id)
            .in("reel_id", feedReelIds);
        userSavedReels = (saves || []).map((s: any) => s.reel_id);
        setSavedReels(new Set(userSavedReels));

          const { data: reposts } = await (supabase as any)
            .from("reel_reposts")
            .select("reel_id")
            .eq("user_id", user.id)
            .in("reel_id", feedReelIds);
        userRepostedReels = (reposts || []).map((r: any) => r.reel_id);
        setRepostedReels(new Set(userRepostedReels));
        }
      }

      const reelsWithAuthors = (data || []).map((r: any) => {
        const id = r?.id ?? r?.reel_id;
        return {
          ...r,
          id,
          author: profileMap.get(r.author_id) || {
            display_name: "Пользователь",
            avatar_url: null,
            verified: false,
          },
          isLiked: userLikedReels.includes(id),
          isSaved: user ? userSavedReels.includes(id) : false,
          isReposted: user ? userRepostedReels.includes(id) : false,
        };
      });

      if (isGuestMode()) {
        const demo = getDemoBotsReels() as any as Reel[];
        const withoutDemo = reelsWithAuthors.filter((r) => !String(r.id).startsWith('demo_'));
        setReels([...demo, ...withoutDemo]);
      } else {
        setReels(reelsWithAuthors);
      }
    } catch (error) {
      console.error("Error fetching reels:", error);
    } finally {
      setLoading(false);
    }
  }, [user, feedMode]);

  const toggleLike = useCallback(async (reelId: string) => {
    if (!user) return;

    if (isDemoId(reelId)) {
      const isCurrentlyLiked = likedReels.has(reelId);
      setLikedReels((prev) => {
        const next = new Set(prev);
        if (isCurrentlyLiked) next.delete(reelId);
        else next.add(reelId);
        return next;
      });
      setReels((prev) =>
        prev.map((r) =>
          r.id === reelId
            ? { ...r, likes_count: Math.max(0, r.likes_count + (isCurrentlyLiked ? -1 : 1)), isLiked: !isCurrentlyLiked }
            : r,
        ),
      );
      return;
    }

    const isCurrentlyLiked = likedReels.has(reelId);

    try {
      if (isCurrentlyLiked) {
        const { error } = await (supabase as any)
          .from("reel_likes")
          .delete()
          .eq("reel_id", reelId)
          .eq("user_id", user.id);
        if (error) throw error;

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
        const { error } = await (supabase as any)
          .from("reel_likes")
          .insert({ reel_id: reelId, user_id: user.id });
        if (error) throw error;

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

  const toggleSave = useCallback(
    async (reelId: string) => {
      if (!user) return;

      if (isDemoId(reelId)) {
        const isCurrentlySaved = savedReels.has(reelId);
        setSavedReels((prev) => {
          const next = new Set(prev);
          if (isCurrentlySaved) next.delete(reelId);
          else next.add(reelId);
          return next;
        });
        setReels((prev) =>
          prev.map((r) =>
            r.id === reelId
              ? {
                  ...r,
                  saves_count: Math.max(0, (r.saves_count || 0) + (isCurrentlySaved ? -1 : 1)),
                  isSaved: !isCurrentlySaved,
                }
              : r,
          ),
        );
        return;
      }
      const isCurrentlySaved = savedReels.has(reelId);
      try {
        if (isCurrentlySaved) {
          const { error } = await (supabase as any)
            .from("reel_saves")
            .delete()
            .eq("reel_id", reelId)
            .eq("user_id", user.id);
          if (error) throw error;

          setSavedReels((prev) => {
            const next = new Set(prev);
            next.delete(reelId);
            return next;
          });
          setReels((prev) =>
            prev.map((r) =>
              r.id === reelId
                ? { ...r, saves_count: Math.max(0, (r.saves_count || 0) - 1), isSaved: false }
                : r,
            ),
          );
        } else {
          const { error } = await (supabase as any)
            .from("reel_saves")
            .insert({ reel_id: reelId, user_id: user.id });
          if (error) throw error;
          setSavedReels((prev) => new Set([...prev, reelId]));
          setReels((prev) =>
            prev.map((r) =>
              r.id === reelId
                ? { ...r, saves_count: (r.saves_count || 0) + 1, isSaved: true }
                : r,
            ),
          );
        }
      } catch (error) {
        console.error("Error toggling save:", error);
      }
    },
    [user, savedReels],
  );

  const toggleRepost = useCallback(
    async (reelId: string) => {
      if (!user) return;

      if (isDemoId(reelId)) {
        const isCurrentlyReposted = repostedReels.has(reelId);
        setRepostedReels((prev) => {
          const next = new Set(prev);
          if (isCurrentlyReposted) next.delete(reelId);
          else next.add(reelId);
          return next;
        });
        setReels((prev) =>
          prev.map((r) =>
            r.id === reelId
              ? {
                  ...r,
                  reposts_count: Math.max(0, (r.reposts_count || 0) + (isCurrentlyReposted ? -1 : 1)),
                  isReposted: !isCurrentlyReposted,
                }
              : r,
          ),
        );
        return;
      }
      const isCurrentlyReposted = repostedReels.has(reelId);
      try {
        if (isCurrentlyReposted) {
          const { error } = await (supabase as any)
            .from("reel_reposts")
            .delete()
            .eq("reel_id", reelId)
            .eq("user_id", user.id);
          if (error) throw error;

          setRepostedReels((prev) => {
            const next = new Set(prev);
            next.delete(reelId);
            return next;
          });
          setReels((prev) =>
            prev.map((r) =>
              r.id === reelId
                ? { ...r, reposts_count: Math.max(0, (r.reposts_count || 0) - 1), isReposted: false }
                : r,
            ),
          );
        } else {
          const { error } = await (supabase as any)
            .from("reel_reposts")
            .insert({ reel_id: reelId, user_id: user.id });
          if (error) throw error;
          setRepostedReels((prev) => new Set([...prev, reelId]));
          setReels((prev) =>
            prev.map((r) =>
              r.id === reelId
                ? { ...r, reposts_count: (r.reposts_count || 0) + 1, isReposted: true }
                : r,
            ),
          );
        }
      } catch (error) {
        console.error("Error toggling repost:", error);
      }
    },
    [user, repostedReels],
  );

  const recordShare = useCallback(
    async (reelId: string, targetType: "dm" | "group" | "channel", targetId: string) => {
      if (!user) return;

      if (isDemoId(reelId)) {
        setReels((prev) =>
          prev.map((r) => (r.id === reelId ? { ...r, shares_count: (r.shares_count || 0) + 1 } : r)),
        );
        return;
      }
      try {
        await (supabase as any).from("reel_shares").insert({
          reel_id: reelId,
          user_id: user.id,
          target_type: targetType,
          target_id: targetId,
        });
        setReels((prev) =>
          prev.map((r) => (r.id === reelId ? { ...r, shares_count: (r.shares_count || 0) + 1 } : r)),
        );
      } catch (error) {
        console.error("Error recording share:", error);
      }
    },
    [user],
  );

  const recordView = useCallback(async (reelId: string) => {
    if (isDemoId(reelId)) return;
    try {
      let anonSessionId: string | null = null;
      if (!user) {
        anonSessionId = sessionStorage.getItem("reels_anon_session_id");
        if (!anonSessionId) {
          anonSessionId = crypto.randomUUID();
          sessionStorage.setItem("reels_anon_session_id", anonSessionId);
        }
      }

      const sessionId = !user ? `anon-${anonSessionId}` : null;
      await (supabase as any).rpc("record_reel_view", {
        p_reel_id: reelId,
        p_session_id: sessionId,
      });
    } catch (error) {
      console.error("Error recording view:", error);
    }
  }, [user]);

  const recordImpression = useCallback(
    async (
      reelId: string,
      params?: {
        position?: number;
        source?: string;
        request_id?: string;
        algorithm_version?: string;
        score?: number;
      }
    ) => {
      if (isDemoId(reelId)) return;
      try {
        let anonSessionId: string | null = null;
        if (!user) {
          anonSessionId = sessionStorage.getItem("reels_anon_session_id");
          if (!anonSessionId) {
            anonSessionId = crypto.randomUUID();
            sessionStorage.setItem("reels_anon_session_id", anonSessionId);
          }
        }

        const sessionId = !user ? `anon-${anonSessionId}` : null;
        await (supabase as any).rpc("record_reel_impression_v2", {
          p_reel_id: reelId,
          p_session_id: sessionId,
          p_request_id: params?.request_id ?? null,
          p_position: params?.position ?? null,
          p_source: params?.source ?? "reels",
          p_algorithm_version: params?.algorithm_version ?? null,
          p_score: params?.score ?? null,
        });
      } catch (error) {
        console.error("Error recording impression:", error);
      }
    },
    [user],
  );

  // Progressive Disclosure Layer 1: VIEWED (user started watching >2sec)
  const recordViewed = useCallback(
    async (reelId: string) => {
      if (isDemoId(reelId)) return;
      try {
        let anonSessionId: string | null = null;
        if (!user) {
          anonSessionId = sessionStorage.getItem("reels_anon_session_id");
          if (!anonSessionId) {
            anonSessionId = crypto.randomUUID();
            sessionStorage.setItem("reels_anon_session_id", anonSessionId);
          }
        }

        const sessionId = !user ? `anon-${anonSessionId}` : null;
        await (supabase as any).rpc("record_reel_viewed", {
          p_reel_id: reelId,
          p_session_id: sessionId,
        });
      } catch (error) {
        console.error("Error recording viewed:", error);
      }
    },
    [user],
  );

  // Progressive Disclosure Layer 2: WATCHED (user completed >50%)
  const recordWatched = useCallback(
    async (reelId: string, watchDurationSeconds: number, reelDurationSeconds: number) => {
      if (isDemoId(reelId)) return;
      try {
        let anonSessionId: string | null = null;
        if (!user) {
          anonSessionId = sessionStorage.getItem("reels_anon_session_id");
          if (!anonSessionId) {
            anonSessionId = crypto.randomUUID();
            sessionStorage.setItem("reels_anon_session_id", anonSessionId);
          }
        }

        const sessionId = !user ? `anon-${anonSessionId}` : null;
        await (supabase as any).rpc("record_reel_watched", {
          p_reel_id: reelId,
          p_watch_duration_seconds: watchDurationSeconds,
          p_reel_duration_seconds: reelDurationSeconds,
          p_session_id: sessionId,
        });
      } catch (error) {
        console.error("Error recording watched:", error);
      }
    },
    [user],
  );

  // Negative Signal: SKIP (user skipped, especially <2sec = quick skip)
  const recordSkip = useCallback(
    async (reelId: string, skippedAtSecond: number, reelDurationSeconds: number) => {
      if (isDemoId(reelId)) return;
      try {
        let anonSessionId: string | null = null;
        if (!user) {
          anonSessionId = sessionStorage.getItem("reels_anon_session_id");
          if (!anonSessionId) {
            anonSessionId = crypto.randomUUID();
            sessionStorage.setItem("reels_anon_session_id", anonSessionId);
          }
        }

        const sessionId = !user ? `anon-${anonSessionId}` : null;
        await (supabase as any).rpc("record_reel_skip", {
          p_reel_id: reelId,
          p_skipped_at_second: skippedAtSecond,
          p_reel_duration_seconds: reelDurationSeconds,
          p_session_id: sessionId,
        });
      } catch (error) {
        console.error("Error recording skip:", error);
      }
    },
    [user],
  );

  const setReelFeedback = useCallback(
    async (reelId: string, feedback: "interested" | "not_interested") => {
      if (isDemoId(reelId)) return;
      try {
        let anonSessionId: string | null = null;
        if (!user) {
          anonSessionId = sessionStorage.getItem("reels_anon_session_id");
          if (!anonSessionId) {
            anonSessionId = crypto.randomUUID();
            sessionStorage.setItem("reels_anon_session_id", anonSessionId);
          }
        }

        const sessionId = !user ? `anon-${anonSessionId}` : null;
        await (supabase as any).rpc("set_reel_feedback", {
          p_reel_id: reelId,
          p_feedback: feedback,
          p_session_id: sessionId,
        });
      } catch (error) {
        console.error("Error setting reel feedback:", error);
      }
    },
    [user],
  );

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
    savedReels,
    repostedReels,
    toggleLike,
    toggleSave,
    toggleRepost,
    recordShare,
    recordView,
    recordImpression,
    recordViewed,
    recordWatched,
    recordSkip,
    setReelFeedback,
    createReel,
    refetch: fetchReels,
  };
}
