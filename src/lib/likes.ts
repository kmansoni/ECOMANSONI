/**
 * likes.ts — Unified like service for the entire project.
 *
 * All like operations (posts, reels, comments) go through this module.
 * Pure async functions, no React dependency — can be used from hooks,
 * Edge Functions, tests, etc.
 *
 * Counter updates are handled by DB triggers (see migrations).
 * This module only manages the like/unlike rows in the respective tables.
 */

import { supabase } from "@/integrations/supabase/client";
import { dbLoose } from "@/lib/supabase";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LikeResult {
  error: string | null;
}

// ---------------------------------------------------------------------------
// Post Likes
// ---------------------------------------------------------------------------

export async function togglePostLike(
  postId: string,
  userId: string,
  isCurrentlyLiked: boolean,
): Promise<LikeResult> {
  try {
    if (isCurrentlyLiked) {
      const { error } = await supabase
        .from("post_likes")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", userId);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("post_likes")
        .insert({ post_id: postId, user_id: userId });
      if (error) throw error;
    }
    return { error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update like";
    logger.error("[likes] togglePostLike error", { postId, userId, isCurrentlyLiked, error: err });
    return { error: message };
  }
}

// ---------------------------------------------------------------------------
// Reel Likes
// ---------------------------------------------------------------------------

export async function toggleReelLike(
  reelId: string,
  userId: string,
  isCurrentlyLiked: boolean,
): Promise<LikeResult> {
  try {
    if (isCurrentlyLiked) {
      const { error } = await dbLoose
        .from("reel_likes")
        .delete()
        .eq("reel_id", reelId)
        .eq("user_id", userId);
      if (error) throw error;
    } else {
      const { error } = await dbLoose
        .from("reel_likes")
        .insert({ reel_id: reelId, user_id: userId });
      if (error) throw error;
    }
    return { error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update reel like";
    logger.error("[likes] toggleReelLike error", { reelId, userId, isCurrentlyLiked, error: err });
    return { error: message };
  }
}

// ---------------------------------------------------------------------------
// Comment Likes
// ---------------------------------------------------------------------------

export async function toggleCommentLike(
  commentId: string,
  userId: string,
  isCurrentlyLiked: boolean,
): Promise<LikeResult> {
  try {
    if (isCurrentlyLiked) {
      const { error } = await dbLoose
        .from("comment_likes")
        .delete()
        .eq("comment_id", commentId)
        .eq("user_id", userId);
      if (error) throw error;
    } else {
      const { error } = await dbLoose
        .from("comment_likes")
        .insert({ comment_id: commentId, user_id: userId });
      if (error) throw error;
    }
    return { error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update comment like";
    logger.error("[likes] toggleCommentLike error", { commentId, userId, isCurrentlyLiked, error: err });
    return { error: message };
  }
}

// ---------------------------------------------------------------------------
// Batch status queries
// ---------------------------------------------------------------------------

export async function batchGetPostLikes(
  postIds: string[],
  userId: string,
): Promise<Set<string>> {
  if (postIds.length === 0) return new Set();
  try {
    const { data, error } = await supabase
      .from("post_likes")
      .select("post_id")
      .eq("user_id", userId)
      .in("post_id", postIds);
    if (error) throw error;
    return new Set((data || []).map((d) => d.post_id));
  } catch (err) {
    logger.error("[likes] batchGetPostLikes error", { error: err });
    return new Set();
  }
}

export async function batchGetReelLikes(
  reelIds: string[],
  userId: string,
): Promise<Set<string>> {
  if (reelIds.length === 0) return new Set();
  try {
    const { data, error } = await dbLoose
      .from("reel_likes")
      .select("reel_id")
      .eq("user_id", userId)
      .in("reel_id", reelIds);
    if (error) throw error;
    return new Set((data || []).map((d) => d.reel_id as string));
  } catch (err) {
    logger.error("[likes] batchGetReelLikes error", { error: err });
    return new Set();
  }
}

export async function batchGetSavedPosts(
  postIds: string[],
  userId: string,
): Promise<Set<string>> {
  if (postIds.length === 0) return new Set();
  try {
    const { data, error } = await supabase
      .from("saved_posts")
      .select("post_id")
      .eq("user_id", userId)
      .in("post_id", postIds);
    if (error) throw error;
    return new Set((data || []).map((d) => d.post_id));
  } catch (err) {
    logger.error("[likes] batchGetSavedPosts error", { error: err });
    return new Set();
  }
}
