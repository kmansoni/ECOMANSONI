/**
 * useFollow — standalone follow/unfollow hook.
 *
 * Design:
 *   - Optimistic UI: local state updates immediately; server call in background.
 *   - On failure: rolls back local state and shows toast.
 *   - Idempotent INSERT (uses upsert) to handle duplicate follow race conditions.
 *   - Prevents self-follow at hook level (server-side trigger should also block it).
 *
 * Usage:
 *   const { isFollowing, toggle, loading } = useFollow(authorId);
 *   <button onClick={toggle}>{isFollowing ? "Отписаться" : "Подписаться"}</button>
 *
 * Security:
 *   - RLS on `followers` table enforces follower_id = auth.uid().
 *   - Self-follow guard here is UX-only; the DB CHECK constraint is the authority.
 *
 * Scale:
 *   - No global state — each call site is independent.
 *   - If the same user is shown N times (e.g., in a long Reels feed), each
 *     instance syncs independently. Consider lifting state to a context if
 *     N > 50 (rare).
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface UseFollowReturn {
  isFollowing: boolean;
  loading: boolean;
  /** Toggle follow/unfollow. No-op if not authenticated or targetUserId === self. */
  toggle: () => Promise<void>;
}

export function useFollow(targetUserId: string | null | undefined): UseFollowReturn {
  const { user } = useAuth();
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(false);
  const isFollowingRef = useRef(false);
  const inFlightRef = useRef(false);

  useEffect(() => {
    isFollowingRef.current = isFollowing;
  }, [isFollowing]);

  // ── Load initial follow state ─────────────────────────────────────────

  useEffect(() => {
    if (!user?.id || !targetUserId || targetUserId === user.id) {
      setIsFollowing(false);
      return;
    }

    let cancelled = false;
    const checkFollow = async () => {
      const { data, error } = await (supabase as any)
        .from("followers")
        .select("id")
        .eq("follower_id", user.id)
        .eq("following_id", targetUserId)
        .maybeSingle();

      if (!cancelled && !error) {
        setIsFollowing(!!data);
      }
    };

    void checkFollow();
    return () => { cancelled = true; };
  }, [user?.id, targetUserId]);

  // ── Toggle follow/unfollow ────────────────────────────────────────────

  const toggle = useCallback(async () => {
    if (!user?.id || !targetUserId) return;
    // Prevent self-follow
    if (targetUserId === user.id) return;
    // Ignore re-entrant toggles while a request is in-flight.
    if (inFlightRef.current) return;

    const wasFollowing = isFollowingRef.current;
    inFlightRef.current = true;
    // Optimistic update
    isFollowingRef.current = !wasFollowing;
    setIsFollowing(!wasFollowing);
    setLoading(true);

    try {
      if (wasFollowing) {
        const { error } = await (supabase as any)
          .from("followers")
          .delete()
          .eq("follower_id", user.id)
          .eq("following_id", targetUserId);
        if (error) throw error;
      } else {
        // upsert prevents duplicate key error on race condition
        const { error } = await (supabase as any)
          .from("followers")
          .upsert(
            { follower_id: user.id, following_id: targetUserId },
            { onConflict: "follower_id,following_id", ignoreDuplicates: true }
          );
        if (error) throw error;
      }
    } catch (err) {
      // Rollback
      isFollowingRef.current = wasFollowing;
      setIsFollowing(wasFollowing);
      toast.error(wasFollowing ? "Не удалось отписаться" : "Не удалось подписаться");
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, [user?.id, targetUserId]);

  return { isFollowing, loading, toggle };
}
