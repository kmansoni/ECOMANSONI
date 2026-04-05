import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { isGuestMode } from "@/lib/demo/demoMode";
import { getDemoBotsReels, isDemoId } from "@/lib/demo/demoBots";
import { trackAnalyticsEvent } from "@/lib/analytics/firehose";
import { fetchUserBriefMap, resolveUserBrief } from "@/lib/users/userBriefs";
import { toggleReelLike as _toggleReelLike } from "@/lib/likes";
import { logger } from "@/lib/logger";
import { OperationMutex, showErrorToast, handleApiError } from "@/lib/errors";

function safeRandomUUID(): string {
  try {
    if (typeof crypto !== "undefined" && typeof (crypto as any).randomUUID === "function") {
      return (crypto as any).randomUUID();
    }
  } catch (error) {
    logger.warn("[useReels] randomUUID unavailable, using fallback", { error });
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
    username?: string | null; // ИСПРАВЛЕНИЕ дефекта #23: добавлен username
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

const PAGE_SIZE = 10;

function getAnonSessionId(user: any): string | null {
  if (user) return null;
  let anonSessionId = sessionStorage.getItem("reels_anon_session_id");
  if (!anonSessionId) {
    anonSessionId = safeRandomUUID();
    sessionStorage.setItem("reels_anon_session_id", anonSessionId);
  }
  return `anon-${anonSessionId}`;
}

export function useReels(feedMode: ReelsFeedMode = "reels") {
  const { user } = useAuth();
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  // ИСПРАВЛЕНИЕ дефекта #33: добавлен error state для пробрасывания в ReelsPage
  const [error, setError] = useState<string | null>(null);
  const [likedReels, setLikedReels] = useState<Set<string>>(new Set());
  const [savedReels, setSavedReels] = useState<Set<string>>(new Set());
  const [repostedReels, setRepostedReels] = useState<Set<string>>(new Set());
  const dbOffsetRef = useRef(0);
  const storageSyncOnceRef = useRef(false);
  // Ref для текущего user.id — используется в RT-обработчиках без пересоздания канала
  const userIdRef = useRef<string | null>(null);
  // Mutex для предотвращения race conditions при лайках/сохранениях/репостах
  const likeMutex = useRef(new OperationMutex());
  const saveMutex = useRef(new OperationMutex());
  const repostMutex = useRef(new OperationMutex());

  // Синхронизируем ref с актуальным user.id
  useEffect(() => {
    userIdRef.current = user?.id ?? null;
  }, [user?.id]);

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
        // supabase.functions.invoke автоматически передаёт JWT пользователя
        try {
          const { data, error } = await supabase.functions.invoke("reels-feed", {
            body: {
              limit,
              offset,
              author_ids: feedMode === "friends" ? (followedAuthorIds ?? []) : null,
            },
          });

          if (!error && data && (data as any).ok === true) {
            return ((data as any).data ?? []) as any[];
          }
          logger.warn("[useReels] reels-feed invoke failed", { error, feedMode, offset, limit });
        } catch (e) {
          logger.warn("[useReels] reels-feed invoke exception", { error: e });
        }

        return [] as any[];
      };

      const fetchReelsFallback = async () => {
        const buildBaseQuery = () => {
          let query = (supabase as any)
            .from("reels")
            .select("*")
            .order("created_at", { ascending: false })
            .range(offset, offset + limit - 1);

          if (feedMode === "friends") {
            if (!followedAuthorIds || followedAuthorIds.length === 0) return null;
            query = query.in("author_id", followedAuthorIds);
          }

          return query;
        };

        // Try with moderation filters first
        try {
          const baseQuery = buildBaseQuery();
          if (!baseQuery) return [] as any[];

          const queryWithModeration = (supabase as any)
            .from("reels")
            .select("*")
            .neq("moderation_status", "blocked")
            .eq("is_nsfw", false)
            .eq("is_graphic_violence", false)
            .eq("is_political_extremism", false)
            .order("created_at", { ascending: false })
            .range(offset, offset + limit - 1);

          const withFilter = feedMode === "friends" && followedAuthorIds && followedAuthorIds.length > 0
            ? queryWithModeration.in("author_id", followedAuthorIds)
            : queryWithModeration;

          const res = await withFilter;
          if (!res.error) return (res.data || []) as any[];

          // Moderation columns might not exist — fall through to simple query
          logger.warn("[useReels] moderation-filtered query failed, trying without moderation", { error: res.error });
        } catch (e) {
          logger.warn("[useReels] moderation-filtered query exception", { error: e });
        }

        // Fallback: query without moderation columns
        try {
          const simpleQuery = buildBaseQuery();
          if (!simpleQuery) return [] as any[];

          const res = await simpleQuery;
          if (res.error) {
            logger.warn("[useReels] simple reels query failed", { error: res.error });
            return [] as any[];
          }
          return (res.data || []) as any[];
        } catch (e) {
          logger.warn("[useReels] simple reels query exception", { error: e });
          return [] as any[];
        }
      };

      if (feedMode === "reels") {
        const fetchRequestId = safeRandomUUID();

        const sessionId = getAnonSessionId(user);
        let rpc = await (supabase as any).rpc("get_reels_feed_v2", {
          p_limit: limit,
          p_offset: offset,
          p_session_id: sessionId,
          p_exploration_ratio: 0.2,
          p_recency_days: 30,
          p_freq_cap_hours: 6,
          p_algorithm_version: "v3",
        });

        if (rpc.error) {
          rpc = await (supabase as any).rpc("get_reels_feed_v2", {
            p_limit: limit,
            p_offset: offset,
            p_session_id: sessionId,
          });
        }

        if (rpc.error) {
          logger.warn("[useReels] get_reels_feed_v2 failed, using fallback", { error: rpc.error, offset, limit });
          let data = await fetchReelsFallback();
          if ((data?.length || 0) === 0) data = await fetchReelsViaEdgeFallback();
          return data;
        }

        const rpcRows = (rpc.data || []).map((row: any, index: number) => {
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

        // RPC succeeded but returned 0 rows on first page → try fallback chain
        if (rpcRows.length === 0 && offset === 0) {
          let data = await fetchReelsFallback();
          if ((data?.length || 0) === 0) data = await fetchReelsViaEdgeFallback();
          if (data.length > 0) return data;
        }

        return rpcRows;
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
        const briefMap = await fetchUserBriefMap(authorIds, supabase as any);

      let profiles: Array<{ user_id: string; verified?: boolean | null }> = [];
      if (authorIds.length) {
        try {
          const profilesResWithVerified = await supabase
            .from("profiles")
            .select("user_id, verified")
            .in("user_id", authorIds);

          if (profilesResWithVerified.error && isMissingColumnError(profilesResWithVerified.error, "verified")) {
            const profilesResWithoutVerified = await supabase
              .from("profiles")
              .select("user_id")
              .in("user_id", authorIds);
            if (!profilesResWithoutVerified.error) {
              profiles = profilesResWithoutVerified.data || [];
            }
          } else if (!profilesResWithVerified.error) {
            profiles = profilesResWithVerified.data || [];
          }
        } catch (e) {
          logger.warn("[useReels] profiles query failed, skipping", { error: e });
        }
      }

      const verifiedMap = new Map((profiles || []).map((p) => [p.user_id, Boolean(p.verified)]));

      let userLikedReels: string[] = [];
      let userSavedReels: string[] = [];
      let userRepostedReels: string[] = [];
      if (user && feedReelIds.length) {
        try {
          const [likesRes, savesRes, repostsRes] = await Promise.all([
            (supabase as any).from("reel_likes").select("reel_id").eq("user_id", user.id).in("reel_id", feedReelIds),
            (supabase as any).from("reel_saves").select("reel_id").eq("user_id", user.id).in("reel_id", feedReelIds),
            (supabase as any).from("reel_reposts").select("reel_id").eq("user_id", user.id).in("reel_id", feedReelIds),
          ]);
          userLikedReels = (likesRes.data || []).map((l: any) => l.reel_id);
          userSavedReels = (savesRes.data || []).map((s: any) => s.reel_id);
          userRepostedReels = (repostsRes.data || []).map((r: any) => r.reel_id);
        } catch (e) {
          logger.warn("[useReels] engagement tables query failed, skipping", { error: e });
        }
      }

      const reelsWithAuthors: Reel[] = normalizedRows.map((r: any) => {
        const brief = resolveUserBrief(r.author_id, briefMap);
        return {
          ...r,
          author: {
            display_name: brief?.display_name ?? null,
            avatar_url: brief?.avatar_url ?? null,
            username: brief?.username ?? null, // ИСПРАВЛЕНИЕ дефекта #23: username из brief
            verified: verifiedMap.get(r.author_id) ?? false,
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
    // ИСПРАВЛЕНИЕ дефекта #21: ignore-флаг предотвращает setState после смены feedMode/user
    let ignore = false;
    setLoading(true);
    setError(null); // сбрасываем ошибку при новом запросе
    dbOffsetRef.current = 0;
    try {
      // Best-effort: sync storage-only uploads into public.reels so they appear in the feed.
      if (!storageSyncOnceRef.current && !isGuestMode() && feedMode === "reels") {
        storageSyncOnceRef.current = true;
        try {
          await supabase.functions.invoke("reels-feed", { body: { limit: PAGE_SIZE, offset: 0 } });
        } catch (error) {
          logger.warn("[useReels] reels-feed storage sync invoke failed", { error });
        }
      }

      if (feedMode === "friends" && !user) {
        if (!ignore) { setReels([]); setHasMore(false); setLoading(false); }
        return;
      }

      const followedAuthorIds = await getFollowedAuthorIdsIfNeeded();
      const raw = await fetchRawBatch({ offset: 0, limit: PAGE_SIZE, followedAuthorIds });
      const enriched = await enrichRows(raw);

      if (ignore) return; // feedMode/user сменились пока шёл запрос

      setLikedReels(new Set(enriched.likedIds));
      setSavedReels(new Set(enriched.savedIds));
      setRepostedReels(new Set(enriched.repostedIds));
      setHasMore((raw?.length || 0) >= PAGE_SIZE);

      if (isGuestMode()) {
        const demo = getDemoBotsReels() as any as Reel[];
        const withoutDemo = enriched.reels.filter((r) => !String(r.id).startsWith("demo_"));
        setReels([...demo, ...withoutDemo]);
        setHasMore(false);
      } else {
        setReels(enriched.reels);
        dbOffsetRef.current = raw?.length || 0;
      }
    } catch (err) {
      if (!ignore) {
        logger.error("[useReels] Error fetching reels", { error: err, feedMode, userId: user?.id ?? null });
        setError(err instanceof Error ? err.message : 'Ошибка загрузки Reels');
      }
    } finally {
      if (!ignore) setLoading(false);
    }
    return () => { ignore = true; };
  }, [user, feedMode, enrichRows, fetchRawBatch, getFollowedAuthorIdsIfNeeded]);

  const loadMore = useCallback(async () => {
    if (loadingMore || loading) return;
    if (!hasMore) return;
    if (isGuestMode()) return;

    try {
      setLoadingMore(true);
      const followedAuthorIds = await getFollowedAuthorIdsIfNeeded();
      const nextOffset = dbOffsetRef.current;
      const raw = await fetchRawBatch({ offset: nextOffset, limit: PAGE_SIZE, followedAuthorIds });

      if ((raw?.length || 0) === 0) {
        setHasMore(false);
        return;
      }

      dbOffsetRef.current = nextOffset + (raw?.length || 0);

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
      logger.error("[useReels] Error loading more reels", { error: e, feedMode, userId: user?.id ?? null, offset: dbOffsetRef.current });
    } finally {
      setLoadingMore(false);
    }
  }, [enrichRows, fetchRawBatch, feedMode, getFollowedAuthorIdsIfNeeded, hasMore, loading, loadingMore, user?.id]);

  const resolveReelOwnerId = useCallback(
    (reelId: string): string | null => {
      return reels.find((r) => r.id === reelId)?.author_id ?? null;
    },
    [reels],
  );

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

    // ИСПРАВЛЕНИЕ дефекта #22: оптимистичное обновление ДО запроса к БД
    // Ранее: запрос → обновление UI (задержка 200-500ms)
    // Теперь: обновление UI → запрос → откат при ошибке (мгновенный отклик)
    await likeMutex.current.execute(async () => {
      const isCurrentlyLiked = likedReels.has(reelId);

      // Оптимистичное обновление ДО запроса
      setLikedReels((prev) => {
        const next = new Set(prev);
        if (isCurrentlyLiked) next.delete(reelId); else next.add(reelId);
        return next;
      });
      setReels((prev) =>
        prev.map((r) =>
          r.id === reelId
            ? { ...r, likes_count: Math.max(0, r.likes_count + (isCurrentlyLiked ? -1 : 1)), isLiked: !isCurrentlyLiked }
            : r
        )
      );

      try {
        const { error } = await _toggleReelLike(reelId, user.id, isCurrentlyLiked);
        if (error) throw new Error(error);
      } catch (error) {
        // Откат при ошибке
        setLikedReels((prev) => {
          const next = new Set(prev);
          if (isCurrentlyLiked) next.add(reelId); else next.delete(reelId);
          return next;
        });
        setReels((prev) =>
          prev.map((r) =>
            r.id === reelId
              ? { ...r, likes_count: Math.max(0, r.likes_count + (isCurrentlyLiked ? 1 : -1)), isLiked: isCurrentlyLiked }
              : r
          )
        );
        logger.error("[useReels] Error toggling like", { error, reelId, userId: user?.id ?? null });
        showErrorToast(error, 'Не удалось обновить лайк');
      }
    });
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

      // Используем mutex для предотвращения race conditions
      await saveMutex.current.execute(async () => {
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
          logger.error("[useReels] Error toggling save", { error, reelId, userId: user?.id ?? null });
          showErrorToast(error, 'Не удалось обновить сохранение');
        }
      });
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
      await repostMutex.current.execute(async () => {
        // Оптимистичное обновление
        setRepostedReels((prev) => {
          const next = new Set(prev);
          if (isCurrentlyReposted) next.delete(reelId); else next.add(reelId);
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

        try {
          if (isCurrentlyReposted) {
            const { error } = await (supabase as any)
              .from("reel_reposts")
              .delete()
              .eq("reel_id", reelId)
              .eq("user_id", user.id);
            if (error) throw error;
          } else {
            const { error } = await (supabase as any)
              .from("reel_reposts")
              .insert({ reel_id: reelId, user_id: user.id });
            if (error) throw error;
          }
        } catch (error) {
          // Откат при ошибке
          setRepostedReels((prev) => {
            const next = new Set(prev);
            if (isCurrentlyReposted) next.add(reelId); else next.delete(reelId);
            return next;
          });
          setReels((prev) =>
            prev.map((r) =>
              r.id === reelId
                ? {
                    ...r,
                    reposts_count: Math.max(0, (r.reposts_count || 0) + (isCurrentlyReposted ? 1 : -1)),
                    isReposted: isCurrentlyReposted,
                  }
                : r,
            ),
          );
          logger.error("[useReels] Error toggling repost", { error, reelId, userId: user?.id ?? null });
          showErrorToast(error, 'Не удалось обновить репост');
        }
      });
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

        const ownerId = resolveReelOwnerId(reelId);
        if (ownerId) {
          trackAnalyticsEvent({
            actorId: user.id,
            objectType: "reel",
            objectId: reelId,
            ownerId,
            eventType: "share_complete",
            eventSubtype: targetType,
            props: { target_id: targetId },
          });
        }
      } catch (error) {
        logger.error("[useReels] Error recording share", {
          error,
          reelId,
          targetType,
          targetId,
          userId: user?.id ?? null,
        });
      }
    },
    [resolveReelOwnerId, user],
  );

  const recordView = useCallback(async (reelId: string) => {
    if (isDemoId(reelId)) return;
    try {
      const sessionId = getAnonSessionId(user);
      await (supabase as any).rpc("record_reel_view", {
        p_reel_id: reelId,
        p_session_id: sessionId,
      });
    } catch (error) {
      logger.error("[useReels] Error recording view", { error, reelId, userId: user?.id ?? null });
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
        const sessionId = getAnonSessionId(user);
        await (supabase as any).rpc("record_reel_impression_v2", {
          p_reel_id: reelId,
          p_session_id: sessionId,
          p_request_id: params?.request_id ?? null,
          p_position: params?.position ?? null,
          p_source: params?.source ?? "reels",
          p_algorithm_version: params?.algorithm_version ?? null,
          p_score: params?.score ?? null,
        });

        const ownerId = resolveReelOwnerId(reelId);
        if (ownerId) {
          const actorId = user?.id ?? `anon:${sessionId ?? "unknown"}`;
          trackAnalyticsEvent({
            actorId,
            objectType: "reel",
            objectId: reelId,
            ownerId,
            eventType: "view_start",
            positionIndex: params?.position,
            props: {
              source: params?.source ?? "reels",
              request_id: params?.request_id ?? null,
              algorithm_version: params?.algorithm_version ?? null,
              score: params?.score ?? null,
            },
          });
        }
      } catch (error) {
        logger.error("[useReels] Error recording impression", { error, reelId, userId: user?.id ?? null, params });
      }
    },
    [resolveReelOwnerId, user],
  );

  // Progressive Disclosure Layer 1: VIEWED (user started watching >2sec)
  const recordViewed = useCallback(
    async (reelId: string, watchDurationSeconds?: number, reelDurationSeconds?: number) => {
      if (isDemoId(reelId)) return;
      try {
        const sessionId = getAnonSessionId(user);
        await (supabase as any).rpc("record_reel_viewed", {
          p_reel_id: reelId,
          p_session_id: sessionId,
        });

        const ownerId = resolveReelOwnerId(reelId);
        if (ownerId) {
          const actorId = user?.id ?? `anon:${sessionId ?? "unknown"}`;
          trackAnalyticsEvent({
            actorId,
            objectType: "reel",
            objectId: reelId,
            ownerId,
            eventType: "view_progress",
            watchMs: typeof watchDurationSeconds === "number" ? Math.max(0, Math.floor(watchDurationSeconds * 1000)) : undefined,
            durationMs: typeof reelDurationSeconds === "number" ? Math.max(0, Math.floor(reelDurationSeconds * 1000)) : undefined,
            props: { viewed_threshold: "2s" },
          });
        }
      } catch (error) {
        logger.error("[useReels] Error recording viewed", {
          error,
          reelId,
          watchDurationSeconds,
          reelDurationSeconds,
          userId: user?.id ?? null,
        });
      }
    },
    [resolveReelOwnerId, user],
  );

  // Progressive Disclosure Layer 2: WATCHED (user completed >50%)
  const recordWatched = useCallback(
    async (reelId: string, watchDurationSeconds: number, reelDurationSeconds: number) => {
      if (isDemoId(reelId)) return;
      try {
        const sessionId = getAnonSessionId(user);
        await (supabase as any).rpc("record_reel_watched", {
          p_reel_id: reelId,
          p_watch_duration_seconds: watchDurationSeconds,
          p_reel_duration_seconds: reelDurationSeconds,
          p_session_id: sessionId,
        });

        const ownerId = resolveReelOwnerId(reelId);
        if (ownerId) {
          const actorId = user?.id ?? `anon:${sessionId ?? "unknown"}`;
          trackAnalyticsEvent({
            actorId,
            objectType: "reel",
            objectId: reelId,
            ownerId,
            eventType: "view_end",
            watchMs: Math.max(0, Math.floor(watchDurationSeconds * 1000)),
            durationMs: Math.max(0, Math.floor(reelDurationSeconds * 1000)),
            props: { completed: true },
          });
        }
      } catch (error) {
        logger.error("[useReels] Error recording watched", {
          error,
          reelId,
          watchDurationSeconds,
          reelDurationSeconds,
          userId: user?.id ?? null,
        });
      }
    },
    [resolveReelOwnerId, user],
  );

  // Negative Signal: SKIP (user skipped, especially <2sec = quick skip)
  const recordSkip = useCallback(
    async (reelId: string, skippedAtSecond: number, reelDurationSeconds: number) => {
      if (isDemoId(reelId)) return;
      try {
        const sessionId = getAnonSessionId(user);
        await (supabase as any).rpc("record_reel_skip", {
          p_reel_id: reelId,
          p_skipped_at_second: skippedAtSecond,
          p_reel_duration_seconds: reelDurationSeconds,
          p_session_id: sessionId,
        });

        const ownerId = resolveReelOwnerId(reelId);
        if (ownerId) {
          const actorId = user?.id ?? `anon:${sessionId ?? "unknown"}`;
          trackAnalyticsEvent({
            actorId,
            objectType: "reel",
            objectId: reelId,
            ownerId,
            eventType: "exit",
            watchMs: Math.max(0, Math.floor(skippedAtSecond * 1000)),
            durationMs: Math.max(0, Math.floor(reelDurationSeconds * 1000)),
            props: { instant_skip: skippedAtSecond < 2 },
          });
          trackAnalyticsEvent({
            actorId,
            objectType: "reel",
            objectId: reelId,
            ownerId,
            eventType: "view_end",
            watchMs: Math.max(0, Math.floor(skippedAtSecond * 1000)),
            durationMs: Math.max(0, Math.floor(reelDurationSeconds * 1000)),
            props: { completed: false, instant_skip: skippedAtSecond < 2 },
          });
        }
      } catch (error) {
        logger.error("[useReels] Error recording skip", {
          error,
          reelId,
          skippedAtSecond,
          reelDurationSeconds,
          userId: user?.id ?? null,
        });
      }
    },
    [resolveReelOwnerId, user],
  );

  const setReelFeedback = useCallback(
    async (reelId: string, feedback: "interested" | "not_interested") => {
      if (isDemoId(reelId)) return;
      try {
        const sessionId = getAnonSessionId(user);
        await (supabase as any).rpc("set_reel_feedback", {
          p_reel_id: reelId,
          p_feedback: feedback,
          p_session_id: sessionId,
        });
      } catch (error) {
        logger.error("[useReels] Error setting reel feedback", { error, reelId, feedback, userId: user?.id ?? null });
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
    options?: {
      visibility?: 'public' | 'followers' | 'private';
      locationName?: string | null;
      taggedUsers?: string[];
      allowComments?: boolean;
      allowRemix?: boolean;
      musicTrackId?: string | null;
      effectPreset?: string | null;
      faceEnhance?: boolean;
      aiEnhance?: boolean;
      maxDurationSec?: number | null;
    },
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
        p_music_track_id: options?.musicTrackId ?? null,
        p_effect_preset: options?.effectPreset ?? null,
        p_face_enhance: options?.faceEnhance ?? false,
        p_ai_enhance: options?.aiEnhance ?? false,
        p_max_duration_sec: options?.maxDurationSec ?? null,
        p_visibility: options?.visibility ?? 'public',
        p_location_name: options?.locationName ?? null,
        p_tagged_users: Array.isArray(options?.taggedUsers) ? options?.taggedUsers : [],
        p_allow_comments: options?.allowComments ?? true,
        p_allow_remix: options?.allowRemix ?? true,
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

  // Realtime подписки: лайки и комментарии обновляют счётчики в ленте
  useEffect(() => {
    const channel = supabase
      .channel('reels-likes-comments-rt')
      .on(
        "postgres_changes" as any,
        { event: "INSERT", schema: "public", table: "reel_likes" },
        (payload: any) => {
          const row = payload.new;
          if (!row?.reel_id) return;
          // Пропускаем собственные лайки — уже обновлены оптимистично в toggleLike
          if (row.user_id === userIdRef.current) return;
          setReels(prev => prev.map(r =>
            r.id === row.reel_id ? { ...r, likes_count: (r.likes_count ?? 0) + 1 } : r
          ));
        },
      )
      .on(
        "postgres_changes" as any,
        { event: "DELETE", schema: "public", table: "reel_likes" },
        (payload: any) => {
          const row = payload.old;
          if (!row?.reel_id) return;
          // Пропускаем собственные unlike — уже обновлены оптимистично в toggleLike
          if (row.user_id === userIdRef.current) return;
          setReels(prev => prev.map(r =>
            r.id === row.reel_id ? { ...r, likes_count: Math.max(0, (r.likes_count ?? 0) - 1) } : r
          ));
        },
      )
      .on(
        "postgres_changes" as any,
        { event: "INSERT", schema: "public", table: "reel_comments" },
        (payload: any) => {
          const reelId = payload.new?.reel_id;
          if (reelId) {
            setReels(prev => prev.map(r =>
              r.id === reelId ? { ...r, comments_count: (r.comments_count ?? 0) + 1 } : r
            ));
          }
        },
      )
      .on(
        "postgres_changes" as any,
        { event: "DELETE", schema: "public", table: "reel_comments" },
        (payload: any) => {
          const reelId = payload.old?.reel_id;
          if (reelId) {
            setReels(prev => prev.map(r =>
              r.id === reelId ? { ...r, comments_count: Math.max(0, (r.comments_count ?? 0) - 1) } : r
            ));
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return {
    reels,
    loading,
    loadingMore,
    hasMore,
    error, // ИСПРАВЛЕНИЕ дефекта #33: экспортируем error для ReelsPage
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
