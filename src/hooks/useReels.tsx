import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { isGuestMode } from "@/lib/demo/demoMode";
import { getDemoBotsReels, isDemoId } from "@/lib/demo/demoBots";

function safeRandomUUID(): string {
  try {
    if (typeof crypto !== "undefined" && typeof (crypto as any).randomUUID === "function") {
      return (crypto as any).randomUUID();
    }
  } catch {
    // ignore
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeUrlish(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .trim();
}

function normalizeSupabaseBaseUrl(): string {
  const raw = normalizeUrlish((import.meta as any)?.env?.VITE_SUPABASE_URL);
  return raw.replace(/\/+$/, "");
}

function buildPublicStorageUrl(bucket: string, objectPath: string): string {
  const base = normalizeSupabaseBaseUrl();
  const cleanPath = normalizeUrlish(objectPath).replace(/^\/+/, "");
  if (!base || !cleanPath) return "";
  // NOTE: do not encode '/' so Supabase storage can resolve nested folders.
  const encoded = cleanPath
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `${base}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encoded}`;
}

export function normalizeReelMediaUrl(urlOrPath: unknown, bucket = "reels-media"): string {
  const v = normalizeUrlish(urlOrPath);
  if (!v) return "";

  // Absolute URLs.
  if (/^https?:\/\//i.test(v)) return v;

  // Supabase storage path variants.
  // - /storage/v1/object/public/...
  // - storage/v1/object/public/...
  if (v.startsWith("/storage/")) {
    const base = normalizeSupabaseBaseUrl();
    return base ? `${base}${v}` : v;
  }
  if (v.startsWith("storage/")) {
    const base = normalizeSupabaseBaseUrl();
    return base ? `${base}/${v}` : v;
  }

  // Common case when DB stores object path only (e.g. userId/file.mp4).
  return buildPublicStorageUrl(bucket, v);
}

function normalizeReelRow(row: any): any {
  if (!row) return row;
  const videoUrlRaw = row.video_url ?? row.reel_video_url ?? row.videoUrl ?? row.reelVideoUrl;
  const thumbUrlRaw = row.thumbnail_url ?? row.reel_thumbnail_url ?? row.thumbnailUrl ?? row.reelThumbnailUrl;
  return {
    ...row,
    video_url: normalizeReelMediaUrl(videoUrlRaw, "reels-media"),
    thumbnail_url: normalizeReelMediaUrl(thumbUrlRaw, "reels-media") || normalizeUrlish(thumbUrlRaw),
  };
}

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
  // EPIC I: Ranking explanation (why this reel was ranked/shown)
  request_id?: string;
  feed_position?: number;
  algorithm_version?: string;
  final_score?: number;
  ranking_reason?: string;
  source_pool?: string;
}

export type ReelsFeedMode = "reels" | "friends";

function isMissingColumnError(error: unknown, columnName: string): boolean {
  const code = String((error as any)?.code ?? "");
  const message = String((error as any)?.message ?? "").toLowerCase();
  return code === "42703" && message.includes(String(columnName).toLowerCase());
}

export function useReels(feedMode: ReelsFeedMode = "reels") {
  const { user } = useAuth();
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [likedReels, setLikedReels] = useState<Set<string>>(new Set());
  const [savedReels, setSavedReels] = useState<Set<string>>(new Set());
  const [repostedReels, setRepostedReels] = useState<Set<string>>(new Set());
  const storageSyncOnceRef = useRef(false);

  const PAGE_SIZE = 50;

  const getFollowedAuthorIdsIfNeeded = useCallback(async (): Promise<string[] | null> => {
    if (feedMode !== "friends") return null;
    if (!user) return [];
    const { data: followed, error: followedError } = await supabase
      .from("followers")
      .select("following_id")
      .eq("follower_id", user.id);
    if (followedError) throw followedError;
    let followedAuthorIds = (followed || []).map((f: any) => f.following_id) as string[];
    // Include own reels as well
    followedAuthorIds = Array.from(new Set([...(followedAuthorIds || []), user.id]));
    return followedAuthorIds;
  }, [feedMode, user]);

  const fetchRawBatch = useCallback(
    async ({ offset, limit, followedAuthorIds }: { offset: number; limit: number; followedAuthorIds: string[] | null }) => {
      const fetchReelsViaEdgeFallback = async () => {
        try {
          const { data, error } = await supabase.functions.invoke("reels-feed", {
            body: {
              limit,
              offset,
              author_ids: feedMode === "friends" ? (followedAuthorIds ?? []) : null,
            },
          });

          if (error) {
            console.warn("reels-feed edge fallback failed:", error);
            return [] as any[];
          }
          if (!data || (data as any).ok !== true) {
            console.warn("reels-feed edge fallback returned not-ok:", data);
            return [] as any[];
          }
          const rawRows = ((data as any).data ?? []) as any[];
          return rawRows;
        } catch (e) {
          console.warn("reels-feed edge fallback exception:", e);
          return [] as any[];
        }
      };

      const fetchReelsFallback = async () => {
        const buildQuery = (withModerationFilter: boolean) => {
          let query = (supabase as any)
            .from("reels")
            .select("*")
            .order("created_at", { ascending: false })
            .range(offset, offset + limit - 1);

          if (withModerationFilter) {
            query = query.neq("moderation_status", "blocked");
          }

          if (feedMode === "friends") {
            if (!followedAuthorIds || followedAuthorIds.length === 0) return null;
            query = query.in("author_id", followedAuthorIds);
          }

          return query;
        };

        const queryWithModeration = buildQuery(true);
        if (!queryWithModeration) return [] as any[];

        let res = await queryWithModeration;
        if (res.error && isMissingColumnError(res.error, "moderation_status")) {
          const queryWithoutModeration = buildQuery(false);
          if (!queryWithoutModeration) return [] as any[];
          res = await queryWithoutModeration;
        }
        if (res.error) throw res.error;
        return (res.data || []) as any[];
      };

      if (feedMode === "reels") {
        const fetchRequestId = safeRandomUUID();

        let anonSessionId: string | null = null;
        if (!user) {
          anonSessionId = sessionStorage.getItem("reels_anon_session_id");
          if (!anonSessionId) {
            anonSessionId = safeRandomUUID();
            sessionStorage.setItem("reels_anon_session_id", anonSessionId);
          }
        }

        const sessionId = !user ? `anon-${anonSessionId}` : null;
        let rpc = await (supabase as any).rpc("get_reels_feed_v2", {
          p_limit: limit,
          p_offset: offset,
          p_session_id: sessionId,
          p_exploration_ratio: 0.2,
          p_recency_days: 30,
          p_freq_cap_hours: 6,
          p_algorithm_version: "v2",
        });

        if (rpc.error) {
          rpc = await (supabase as any).rpc("get_reels_feed_v2", {
            p_limit: limit,
            p_offset: offset,
            p_session_id: sessionId,
          });
        }

        if (rpc.error) {
          console.warn("get_reels_feed_v2 failed, using fallback:", rpc.error);
          let data = await fetchReelsFallback();
          if ((data?.length || 0) === 0) data = await fetchReelsViaEdgeFallback();
          return data;
        }

        return (rpc.data || []).map((row: any, index: number) => {
          const id = row?.id ?? row?.reel_id;
          return {
            ...row,
            id,
            request_id: row?.request_id ?? fetchRequestId,
            feed_position: row?.feed_position ?? (offset + index),
            algorithm_version: row?.algorithm_version,
            final_score: row?.final_score ?? row?.score,
          };
        });
      }

      // friends mode
      let data = await fetchReelsFallback();
      if ((data?.length || 0) === 0) data = await fetchReelsViaEdgeFallback();
      return data;
    },
    [feedMode, user],
  );

  const enrichRows = useCallback(
    async (rows: any[]) => {
      const normalizedRows = (rows || []).map((r: any) => {
        const normalized = normalizeReelRow(r);
        const id = normalized?.id ?? normalized?.reel_id;
        return { ...normalized, id };
      });

      const feedReelIds = normalizedRows.map((r: any) => r.id) as string[];
      const authorIds = [...new Set(normalizedRows.map((r: any) => r.author_id))] as string[];

      let profiles: any[] = [];
      if (authorIds.length) {
        const profilesResWithVerified = await supabase
          .from("profiles")
          .select("user_id, display_name, avatar_url, verified")
          .in("user_id", authorIds);

        if (profilesResWithVerified.error && isMissingColumnError(profilesResWithVerified.error, "verified")) {
          const profilesResWithoutVerified = await supabase
            .from("profiles")
            .select("user_id, display_name, avatar_url")
            .in("user_id", authorIds);
          if (profilesResWithoutVerified.error) throw profilesResWithoutVerified.error;
          profiles = profilesResWithoutVerified.data || [];
        } else {
          if (profilesResWithVerified.error) throw profilesResWithVerified.error;
          profiles = profilesResWithVerified.data || [];
        }
      }

      const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));

      let userLikedReels: string[] = [];
      let userSavedReels: string[] = [];
      let userRepostedReels: string[] = [];
      if (user && feedReelIds.length) {
        const [likesRes, savesRes, repostsRes] = await Promise.all([
          (supabase as any).from("reel_likes").select("reel_id").eq("user_id", user.id).in("reel_id", feedReelIds),
          (supabase as any).from("reel_saves").select("reel_id").eq("user_id", user.id).in("reel_id", feedReelIds),
          (supabase as any).from("reel_reposts").select("reel_id").eq("user_id", user.id).in("reel_id", feedReelIds),
        ]);
        userLikedReels = (likesRes.data || []).map((l: any) => l.reel_id);
        userSavedReels = (savesRes.data || []).map((s: any) => s.reel_id);
        userRepostedReels = (repostsRes.data || []).map((r: any) => r.reel_id);
      }

      const reelsWithAuthors: Reel[] = normalizedRows.map((r: any) => {
        return {
          ...r,
          author: profileMap.get(r.author_id) || {
            display_name: "Пользователь",
            avatar_url: null,
            verified: false,
          },
          isLiked: userLikedReels.includes(r.id),
          isSaved: user ? userSavedReels.includes(r.id) : false,
          isReposted: user ? userRepostedReels.includes(r.id) : false,
        };
      });

      return {
        reels: reelsWithAuthors,
        likedIds: userLikedReels,
        savedIds: userSavedReels,
        repostedIds: userRepostedReels,
      };
    },
    [user],
  );

  const fetchReels = useCallback(async () => {
    setLoading(true);
    try {
      console.log("[useReels] fetchReels started", { feedMode, isGuest: isGuestMode() });
      
      // Best-effort: sync storage-only uploads into public.reels so they appear in the feed.
      // This must run even when RPC works (otherwise Edge fallback never runs and storage-only files stay invisible).
      if (!storageSyncOnceRef.current && !isGuestMode() && feedMode === "reels") {
        storageSyncOnceRef.current = true;
        console.log("[useReels] ✓ Starting storage sync...");
        try {
          const syncResult = await supabase.functions.invoke("reels-feed", { body: { limit: PAGE_SIZE, offset: 0 } });
          console.log("[useReels] ✓ Sync completed:", { syncError: syncResult.error, syncDataLength: (syncResult.data?.data || [])?.length });
        } catch (e) {
          console.warn("[useReels] ✗ Sync exception:", e);
          // ignore (network/env may not allow functions)
        }
      } else {
        console.log("[useReels] Skipping sync:", { alreadySync: storageSyncOnceRef.current, isGuest: isGuestMode(), feedMode });
      }

      if (feedMode === "friends" && !user) {
        console.log("[useReels] Friends mode without user, returning empty");
        setReels([]);
        setHasMore(false);
        setLoading(false);
        return;
      }

      const followedAuthorIds = await getFollowedAuthorIdsIfNeeded();
      const raw = await fetchRawBatch({ offset: 0, limit: PAGE_SIZE, followedAuthorIds });
      console.log("[useReels] fetchRawBatch returned:", { count: raw?.length, rawLength: raw?.length });
      
      const enriched = await enrichRows(raw);
      console.log("[useReels] After enrichRows:", { count: enriched.reels?.length });

      setLikedReels(new Set(enriched.likedIds));
      setSavedReels(new Set(enriched.savedIds));
      setRepostedReels(new Set(enriched.repostedIds));
      setHasMore((raw?.length || 0) >= PAGE_SIZE);

      if (isGuestMode()) {
        const demo = getDemoBotsReels() as any as Reel[];
        const withoutDemo = enriched.reels.filter((r) => !String(r.id).startsWith("demo_"));
        console.log("[useReels] Guest mode - combining demo + real:", { demoCount: demo.length, reelCount: withoutDemo.length });
        setReels([...demo, ...withoutDemo]);
        setHasMore(false);
      } else {
        console.log("[useReels] ✓ Setting reels:", { count: enriched.reels?.length });
        setReels(enriched.reels);
      }
    } catch (error) {
      console.error("Error fetching reels:", error);
    } finally {
      setLoading(false);
    }
  }, [user, feedMode, PAGE_SIZE, enrichRows, fetchRawBatch, getFollowedAuthorIdsIfNeeded]);

  const loadMore = useCallback(async () => {
    if (loadingMore || loading) return;
    if (!hasMore) return;
    if (isGuestMode()) return;

    try {
      setLoadingMore(true);
      const followedAuthorIds = await getFollowedAuthorIdsIfNeeded();
      const nextOffset = reels.length;
      const raw = await fetchRawBatch({ offset: nextOffset, limit: PAGE_SIZE, followedAuthorIds });

      if ((raw?.length || 0) === 0) {
        setHasMore(false);
        return;
      }

      const enriched = await enrichRows(raw);

      setLikedReels((prev) => new Set([...prev, ...enriched.likedIds]));
      setSavedReels((prev) => new Set([...prev, ...enriched.savedIds]));
      setRepostedReels((prev) => new Set([...prev, ...enriched.repostedIds]));

      setReels((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        const appended = enriched.reels.filter((r) => !seen.has(r.id));
        return [...prev, ...appended];
      });

      if ((raw?.length || 0) < PAGE_SIZE) {
        setHasMore(false);
      }
    } catch (e) {
      console.error("Error loading more reels:", e);
    } finally {
      setLoadingMore(false);
    }
  }, [PAGE_SIZE, enrichRows, fetchRawBatch, getFollowedAuthorIdsIfNeeded, hasMore, loading, loadingMore, reels.length]);

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
    videoPath: string,
    thumbnailUrl: string | undefined,
    description: string | undefined,
    musicTitle: string | undefined,
    clientPublishId: string,
  ) => {
    if (!user) return { error: "Not authenticated" };

    try {
      if (!clientPublishId) return { data: null, error: "Missing client_publish_id" };

      const { data, error } = await (supabase as any).rpc("create_reel_v1", {
        p_client_publish_id: clientPublishId,
        p_video_url: videoPath,
        p_thumbnail_url: thumbnailUrl ?? null,
        p_description: description ?? null,
        p_music_title: musicTitle ?? null,
      });

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
    loadingMore,
    hasMore,
    loadMore,
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
