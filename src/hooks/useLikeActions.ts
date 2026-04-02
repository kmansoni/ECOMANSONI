/**
 * useLikeActions — React hook wrapping the unified likes service.
 *
 * Provides auth-guarded like toggles for posts, reels, and comments.
 * No internal state — callers handle optimistic UI updates.
 */

import { useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  togglePostLike as _togglePostLike,
  toggleReelLike as _toggleReelLike,
  toggleCommentLike as _toggleCommentLike,
  type LikeResult,
} from "@/lib/likes";

const NOT_LOGGED_IN: LikeResult = { error: "Необходимо войти в систему" };

export function useLikeActions() {
  const { user } = useAuth();

  const togglePostLike = useCallback(
    async (postId: string, isCurrentlyLiked: boolean): Promise<LikeResult> => {
      if (!user) return NOT_LOGGED_IN;
      return _togglePostLike(postId, user.id, isCurrentlyLiked);
    },
    [user],
  );

  const toggleReelLike = useCallback(
    async (reelId: string, isCurrentlyLiked: boolean): Promise<LikeResult> => {
      if (!user) return NOT_LOGGED_IN;
      return _toggleReelLike(reelId, user.id, isCurrentlyLiked);
    },
    [user],
  );

  const toggleCommentLike = useCallback(
    async (commentId: string, isCurrentlyLiked: boolean): Promise<LikeResult> => {
      if (!user) return NOT_LOGGED_IN;
      return _toggleCommentLike(commentId, user.id, isCurrentlyLiked);
    },
    [user],
  );

  return { togglePostLike, toggleReelLike, toggleCommentLike };
}
