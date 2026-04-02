import { useState, useCallback } from "react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

interface UseOptimisticFollowParams {
  isFollowing: boolean;
  followersCount: number;
  follow: () => Promise<void>;
  unfollow: () => Promise<void>;
  refetch: () => Promise<unknown>;
  targetUserId?: string;
}

export function useOptimisticFollow({
  isFollowing,
  followersCount,
  follow,
  unfollow,
  refetch,
  targetUserId,
}: UseOptimisticFollowParams) {
  const [optimisticFollowing, setOptimisticFollowing] = useState<boolean | null>(null);
  const [optimisticFollowersCount, setOptimisticFollowersCount] = useState<number | null>(null);
  const [followPending, setFollowPending] = useState(false);

  const displayIsFollowing = optimisticFollowing ?? isFollowing;
  const displayFollowersCount = optimisticFollowersCount ?? followersCount;

  const handleFollowToggle = useCallback(async () => {
    if (followPending) return;

    const wasFollowing = displayIsFollowing;
    const prevCount = displayFollowersCount;

    // Мгновенное обновление UI
    setOptimisticFollowing(!wasFollowing);
    setOptimisticFollowersCount(wasFollowing ? Math.max(0, prevCount - 1) : prevCount + 1);
    setFollowPending(true);

    try {
      if (wasFollowing) {
        await unfollow();
      } else {
        await follow();
      }
      // Сбрасываем оптимистичное состояние — реальные данные придут через refetch
      await refetch();
      setOptimisticFollowing(null);
      setOptimisticFollowersCount(null);
    } catch (error) {
      // Откат при ошибке
      setOptimisticFollowing(wasFollowing);
      setOptimisticFollowersCount(prevCount);
      logger.error("profile.follow_toggle_failed", { error, targetUserId, isFollowing: wasFollowing });
      toast.error("Не удалось выполнить действие");
    } finally {
      setFollowPending(false);
    }
  }, [followPending, displayIsFollowing, displayFollowersCount, follow, unfollow, refetch, targetUserId]);

  return { displayIsFollowing, displayFollowersCount, followPending, handleFollowToggle };
}
