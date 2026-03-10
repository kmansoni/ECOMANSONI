/**
 * LikesSheet — Instagram-style bottom sheet showing users who liked a post.
 *
 * Features:
 *   - Infinite scroll (IntersectionObserver on sentinel div)
 *   - Avatar + display name + username + verified badge
 *   - Follow button per user (optimistic, Supabase-backed)
 *   - Skeleton loading state
 *   - Empty state
 *   - Error state with retry
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, UserCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { usePostLikes, type PostLiker } from "@/hooks/usePostLikes";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { buildProfilePath } from "@/lib/users/profileLinks";
import { cn } from "@/lib/utils";

interface LikesSheetProps {
  postId: string | null;
  likeCount: number;
  isOpen: boolean;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// LikerRow — single user row with follow button
// ---------------------------------------------------------------------------

interface LikerRowProps {
  liker: PostLiker;
  currentUserId: string | null;
  onNavigate: (userId: string) => void;
}

function LikerRow({ liker, currentUserId, onNavigate }: LikerRowProps) {
  const [following, setFollowing] = useState(false);
  const [loadingFollow, setLoadingFollow] = useState(false);
  const isSelf = currentUserId === liker.userId;

  const handleFollow = useCallback(async () => {
    if (!currentUserId || isSelf) return;
    const wasFollowing = following;
    setFollowing(!wasFollowing);
    setLoadingFollow(true);
    try {
      if (wasFollowing) {
        const { error } = await (supabase as any)
          .from("followers")
          .delete()
          .eq("follower_id", currentUserId)
          .eq("following_id", liker.userId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("followers")
          .upsert(
            { follower_id: currentUserId, following_id: liker.userId },
            { onConflict: "follower_id,following_id", ignoreDuplicates: true }
          );
        if (error) throw error;
      }
    } catch {
      setFollowing(wasFollowing); // rollback
      toast.error("Не удалось обновить подписку");
    } finally {
      setLoadingFollow(false);
    }
  }, [currentUserId, liker.userId, following, isSelf]);

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 active:bg-white/5 transition-colors">
      {/* Avatar */}
      <button
        className="shrink-0"
        onClick={() => onNavigate(liker.userId)}
        aria-label={`Профиль ${liker.username}`}
      >
        {liker.avatarUrl ? (
          <img
            src={liker.avatarUrl}
            alt={liker.username}
            className="w-11 h-11 rounded-full object-cover"
          />
        ) : (
          <div className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center text-white/60 text-lg font-semibold">
            {liker.displayName.charAt(0).toUpperCase()}
          </div>
        )}
      </button>

      {/* Name + username */}
      <button
        className="flex-1 text-left min-w-0"
        onClick={() => onNavigate(liker.userId)}
      >
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-sm font-semibold text-white truncate">
            {liker.displayName}
          </span>
          {liker.isVerified && <VerifiedBadge size="sm" />}
        </div>
        <span className="text-xs text-white/50 truncate block">@{liker.username}</span>
      </button>

      {/* Follow button — hidden for self */}
      {!isSelf && currentUserId && (
        <Button
          variant="outline"
          size="sm"
          disabled={loadingFollow}
          onClick={handleFollow}
          className={cn(
            "shrink-0 h-8 px-4 text-xs font-semibold border transition-all",
            following
              ? "border-white/20 text-white/70 bg-transparent"
              : "border-white/30 text-white bg-transparent hover:bg-white/10"
          )}
        >
          {following ? (
            <span className="flex items-center gap-1">
              <UserCheck className="w-3.5 h-3.5" />
              Подписан
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <UserPlus className="w-3.5 h-3.5" />
              Подписаться
            </span>
          )}
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LikesSheet
// ---------------------------------------------------------------------------

export function LikesSheet({ postId, likeCount, isOpen, onClose }: LikesSheetProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { likers, loading, loadingMore, hasMore, error, loadMore } = usePostLikes(
    isOpen ? postId : null
  );

  // IntersectionObserver sentinel for infinite scroll
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { threshold: 0.1 }
    );
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [hasMore, loadMore]);

  const handleNavigate = useCallback(
    (userId: string) => {
      onClose();
      navigate(buildProfilePath({ userId }));
    },
    [navigate, onClose]
  );

  const title =
    likeCount > 0
      ? `${likeCount.toLocaleString("ru-RU")} ${pluralLikes(likeCount)}`
      : "Нравится";

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        className="bg-[#1a1a1a] border-t border-white/10 rounded-t-2xl p-0 max-h-[80vh] flex flex-col"
      >
        {/* Header */}
        <SheetHeader className="px-4 pt-4 pb-3 border-b border-white/10 flex-row items-center justify-between shrink-0">
          <SheetTitle className="text-white text-base font-semibold">{title}</SheetTitle>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white transition-colors p-1"
            aria-label="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        </SheetHeader>

        {/* Content */}
        <div className="overflow-y-auto flex-1 overscroll-contain">
          {loading ? (
            // Skeleton
            <div className="px-4 py-2 space-y-1">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-2.5">
                  <Skeleton className="w-11 h-11 rounded-full bg-white/10 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-32 bg-white/10" />
                    <Skeleton className="h-3 w-20 bg-white/10" />
                  </div>
                  <Skeleton className="h-8 w-24 rounded-lg bg-white/10 shrink-0" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-white/40">
              <p className="text-sm">Не удалось загрузить список</p>
              <Button
                variant="ghost"
                size="sm"
                className="text-white/60 hover:text-white"
                onClick={() => window.location.reload()}
              >
                Повторить
              </Button>
            </div>
          ) : likers.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-white/40">
              <p className="text-sm">Пока никто не поставил лайк</p>
            </div>
          ) : (
            <>
              {likers.map((liker) => (
                <LikerRow
                  key={liker.userId}
                  liker={liker}
                  currentUserId={user?.id ?? null}
                  onNavigate={handleNavigate}
                />
              ))}

              {/* Infinite scroll sentinel */}
              <div ref={sentinelRef} className="h-4" />

              {loadingMore && (
                <div className="px-4 py-2 space-y-1">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 py-2.5">
                      <Skeleton className="w-11 h-11 rounded-full bg-white/10 shrink-0" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-3 w-32 bg-white/10" />
                        <Skeleton className="h-3 w-20 bg-white/10" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pluralLikes(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "лайк";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "лайка";
  return "лайков";
}
