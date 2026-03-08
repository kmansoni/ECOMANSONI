/**
 * AudioTrackPage — /audio/:trackTitle
 *
 * Instagram-style "Audio" page: shows all Reels that use a specific
 * music track, identified by its title (URL-encoded).
 *
 * Architecture:
 *   - Fetches reels WHERE music_title ILIKE :title (case-insensitive)
 *   - Cursor pagination (created_at DESC)
 *   - IntersectionObserver infinite scroll
 *   - Mini audio player bar at top (plays a preview if audio_url available)
 *   - Grid layout matching Instagram's audio page (3-column)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronLeft, Music2, Play } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TrackReel {
  id: string;
  thumbnail_url: string | null;
  video_url: string;
  views_count: number;
  likes_count: number;
  created_at: string;
  author: {
    username: string;
    avatar_url: string | null;
  } | null;
}

const PAGE_SIZE = 18; // 6 rows × 3 columns

// ---------------------------------------------------------------------------
// Hook: useTrackReels
// ---------------------------------------------------------------------------

function useTrackReels(trackTitle: string | undefined) {
  const [reels, setReels] = useState<TrackReel[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reelCount, setReelCount] = useState<number | null>(null);

  const cursorRef = useRef<string | null>(null); // last created_at
  const fetchingRef = useRef(false);

  const fetchPage = useCallback(
    async (isFirst: boolean) => {
      if (!trackTitle || fetchingRef.current) return;
      fetchingRef.current = true;
      if (isFirst) { setLoading(true); setError(null); }
      else setLoadingMore(true);

      try {
        let query = (supabase as any)
          .from("reels")
          .select(
            `id, thumbnail_url, video_url, views_count, likes_count, created_at,
             profiles:author_id ( username, avatar_url )`
          )
          .ilike("music_title", trackTitle)
          .eq("publish_state", "published")
          .order("created_at", { ascending: false })
          .limit(PAGE_SIZE);

        if (!isFirst && cursorRef.current) {
          query = query.lt("created_at", cursorRef.current);
        }

        const { data, error: fetchError, count } = await query;
        if (fetchError) throw fetchError;

        const rows = (data ?? []) as Array<{
          id: string;
          thumbnail_url: string | null;
          video_url: string;
          views_count: number;
          likes_count: number;
          created_at: string;
          profiles: { username: string; avatar_url: string | null } | null;
        }>;

        const mapped: TrackReel[] = rows.map((r) => ({
          id: r.id,
          thumbnail_url: r.thumbnail_url,
          video_url: r.video_url,
          views_count: r.views_count ?? 0,
          likes_count: r.likes_count ?? 0,
          created_at: r.created_at,
          author: r.profiles,
        }));

        if (isFirst) {
          setReels(mapped);
          if (count !== null) setReelCount(count);
        } else {
          setReels((prev) => [...prev, ...mapped]);
        }

        setHasMore(rows.length === PAGE_SIZE);
        if (rows.length > 0) {
          cursorRef.current = rows[rows.length - 1].created_at;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка загрузки");
      } finally {
        fetchingRef.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [trackTitle]
  );

  useEffect(() => {
    cursorRef.current = null;
    setReels([]);
    setHasMore(false);
    setReelCount(null);
    if (trackTitle) void fetchPage(true);
  }, [trackTitle, fetchPage]);

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore || loading) return;
    void fetchPage(false);
  }, [hasMore, loadingMore, loading, fetchPage]);

  return { reels, loading, loadingMore, hasMore, error, reelCount, loadMore };
}

// ---------------------------------------------------------------------------
// ReelGridItem
// ---------------------------------------------------------------------------

function ReelGridItem({ reel, onClick }: { reel: TrackReel; onClick: () => void }) {
  return (
    <button
      className="relative aspect-[9/16] bg-white/5 overflow-hidden rounded-sm group"
      onClick={onClick}
      aria-label={`Reel от @${reel.author?.username ?? "unknown"}`}
    >
      {reel.thumbnail_url ? (
        <img
          src={reel.thumbnail_url}
          alt=""
          className="w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-white/5">
          <Play className="w-8 h-8 text-white/30" />
        </div>
      )}
      {/* Play overlay on hover */}
      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        <Play className="w-8 h-8 text-white fill-white" />
      </div>
      {/* Views count */}
      <div className="absolute bottom-1.5 left-1.5 flex items-center gap-0.5 text-white text-xs font-semibold drop-shadow">
        <Play className="w-3 h-3 fill-white" />
        {formatViews(reel.views_count)}
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// AudioTrackPage
// ---------------------------------------------------------------------------

export default function AudioTrackPage() {
  const { trackTitle } = useParams<{ trackTitle: string }>();
  const navigate = useNavigate();
  const decodedTitle = trackTitle ? decodeURIComponent(trackTitle) : "";

  const { reels, loading, loadingMore, hasMore, error, reelCount, loadMore } =
    useTrackReels(decodedTitle || undefined);

  // Infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { threshold: 0.1 }
    );
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [hasMore, loadMore]);

  if (!decodedTitle) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white/40">
        Трек не найден
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-black/90 backdrop-blur-xl border-b border-white/10">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => navigate(-1)}
            className="text-white/70 hover:text-white transition-colors p-1 -ml-1"
            aria-label="Назад"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold truncate">{decodedTitle}</h1>
            {reelCount !== null && (
              <p className="text-xs text-white/50">
                {reelCount.toLocaleString("ru-RU")} {pluralReels(reelCount)}
              </p>
            )}
          </div>
        </div>

        {/* Track info bar */}
        <div className="flex items-center gap-3 px-4 pb-4">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-600 to-pink-500 flex items-center justify-center shrink-0">
            <Music2 className="w-7 h-7 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{decodedTitle}</p>
            <p className="text-xs text-white/50 mt-0.5">Оригинальный звук</p>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="p-0.5">
        {loading ? (
          <div className="grid grid-cols-3 gap-0.5">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[9/16] bg-white/10 rounded-sm" />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-white/40">
            <p className="text-sm">Не удалось загрузить Reels</p>
          </div>
        ) : reels.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-white/40">
            <Music2 className="w-12 h-12" />
            <p className="text-sm">Нет Reels с этим треком</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-0.5">
              {reels.map((reel) => (
                <ReelGridItem
                  key={reel.id}
                  reel={reel}
                  onClick={() => navigate(`/reels?startId=${reel.id}`)}
                />
              ))}
            </div>

            {/* Infinite scroll sentinel */}
            <div ref={sentinelRef} className="h-4" />

            {loadingMore && (
              <div className="grid grid-cols-3 gap-0.5 mt-0.5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-[9/16] bg-white/10 rounded-sm" />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function pluralReels(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "рилс";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "рилса";
  return "рилсов";
}
