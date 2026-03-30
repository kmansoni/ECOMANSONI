import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import { checkHashtagsAllowedForText } from "@/lib/hashtagModeration";
import { fetchUserBriefMap, resolveUserBrief } from "@/lib/users/userBriefs";
import { logger } from "@/lib/logger";

export interface ReelComment {
  id: string;
  reel_id: string;
  author_id: string;
  parent_id: string | null;
  content: string;
  likes_count: number;
  created_at: string;
  author: {
    display_name: string;
    avatar_url: string | null;
    user_id: string;
    verified: boolean;
  };
  liked_by_user: boolean;
  replies?: ReelComment[];
}

interface CommentRow {
  id: string;
  reel_id: string;
  author_id: string;
  parent_id: string | null;
  content: string;
  likes_count: number;
  created_at: string;
}

interface CommentLikeRow {
  comment_id: string;
  user_id: string;
}

export function useReelComments(reelId: string) {
  const { user } = useAuth();
  const [comments, setComments] = useState<ReelComment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchComments = useCallback(async () => {
    if (!reelId) {
      setComments([]);
      setLoading(false);
      return;
    }

    try {
      // Fetch comments
      const { data: commentsData, error: commentsError } = await supabase
        .from("reel_comments")
        .select("*")
        .eq("reel_id", reelId)
        .order("created_at", { ascending: true });

      if (commentsError) throw commentsError;

      const commentRows = commentsData as CommentRow[] | null;
      if (!commentRows || commentRows.length === 0) {
        setComments([]);
        setLoading(false);
        return;
      }

      // Fetch author profiles
      const authorIds = [...new Set(commentRows.map((c) => c.author_id))];
      const briefMap = await fetchUserBriefMap(authorIds, supabase as any);
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("user_id, verified")
        .in("user_id", authorIds);

      const verifiedMap: Record<string, boolean> = {};
      (profilesData || []).forEach((p: any) => {
        verifiedMap[String(p.user_id)] = Boolean(p.verified);
      });

      // Fetch likes by current user
      let userLikes: Set<string> = new Set();
      if (user) {
        const { data: likesData } = await supabase
          .from("reel_comment_likes")
          .select("comment_id")
          .eq("user_id", user.id)
          .in("comment_id", commentRows.map((c) => c.id));

        (likesData as CommentLikeRow[] | null)?.forEach((l) => userLikes.add(l.comment_id));
      }

      // Build comments with author info
      const commentsWithAuthors: ReelComment[] = commentRows.map((c) => ({
        id: c.id,
        reel_id: c.reel_id,
        author_id: c.author_id,
        parent_id: c.parent_id,
        content: c.content,
        likes_count: c.likes_count,
        created_at: c.created_at,
        author: {
          user_id: c.author_id,
          display_name: resolveUserBrief(c.author_id, briefMap)?.display_name || c.author_id.slice(0, 8),
          avatar_url: resolveUserBrief(c.author_id, briefMap)?.avatar_url || null,
          verified: verifiedMap[c.author_id] || false,
        },
        liked_by_user: userLikes.has(c.id),
      }));

      // Build tree structure
      const rootComments: ReelComment[] = [];
      const childrenMap: Record<string, ReelComment[]> = {};

      commentsWithAuthors.forEach((comment) => {
        if (comment.parent_id) {
          if (!childrenMap[comment.parent_id]) {
            childrenMap[comment.parent_id] = [];
          }
          childrenMap[comment.parent_id].push(comment);
        } else {
          rootComments.push(comment);
        }
      });

      rootComments.forEach((comment) => {
        comment.replies = childrenMap[comment.id] || [];
      });

      setComments(rootComments);
    } catch (error) {
      logger.error("[useReelComments] Error fetching reel comments", { error });
    } finally {
      setLoading(false);
    }
  }, [reelId, user]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  // Realtime подписки: новые/удалённые комментарии для текущего reel
  useEffect(() => {
    if (!reelId) return;

    const channel = supabase
      .channel(`reel-comments-rt:${reelId}`)
      .on(
        "postgres_changes" as any,
        { event: "INSERT", schema: "public", table: "reel_comments", filter: `reel_id=eq.${reelId}` },
        (payload: any) => {
          const newComment = payload.new as CommentRow | undefined;
          if (!newComment || newComment.author_id === user?.id) return;
          setComments(prev => {
            // Проверяем дубликаты
            const allIds = new Set(prev.map(c => c.id));
            prev.forEach(c => (c.replies ?? []).forEach(r => allIds.add(r.id)));
            if (allIds.has(newComment.id)) return prev;

            const normalized: ReelComment = {
              id: newComment.id,
              reel_id: newComment.reel_id,
              author_id: newComment.author_id,
              parent_id: newComment.parent_id,
              content: newComment.content,
              likes_count: newComment.likes_count ?? 0,
              created_at: newComment.created_at,
              author: {
                user_id: newComment.author_id,
                display_name: newComment.author_id.slice(0, 8),
                avatar_url: null,
                verified: false,
              },
              liked_by_user: false,
            };

            if (normalized.parent_id) {
              return prev.map(c =>
                c.id === normalized.parent_id
                  ? { ...c, replies: [...(c.replies ?? []), normalized] }
                  : c
              );
            }
            return [...prev, { ...normalized, replies: [] }];
          });
        },
      )
      .on(
        "postgres_changes" as any,
        { event: "DELETE", schema: "public", table: "reel_comments", filter: `reel_id=eq.${reelId}` },
        (payload: any) => {
          const deletedId = payload.old?.id;
          if (!deletedId) return;
          setComments(prev => {
            // Удаляем из корневых
            const filtered = prev.filter(c => c.id !== deletedId);
            // Удаляем из replies
            return filtered.map(c => ({
              ...c,
              replies: (c.replies ?? []).filter(r => r.id !== deletedId),
            }));
          });
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [reelId, user?.id]);

  const addComment = async (
    content: string,
    parentId?: string
  ): Promise<{ ok: true } | { ok: false; error: unknown }> => {
    if (!user || !reelId || !content.trim()) return { ok: false, error: new Error("Invalid input") };

    try {
      const trimmed = content.trim();
      const hashtagVerdict = await checkHashtagsAllowedForText(trimmed);
      if (!hashtagVerdict.ok) {
        return { ok: false, error: new Error(`HASHTAG_BLOCKED:${("blockedTags" in hashtagVerdict ? hashtagVerdict.blockedTags : []).join(", ")}`) };
      }

      const { error } = await supabase
        .from("reel_comments")
        .insert({
          reel_id: reelId,
          author_id: user.id,
          parent_id: parentId || null,
          content: trimmed,
        });

      if (error) throw error;

      await fetchComments();
      return { ok: true };
    } catch (error) {
      logger.error("[useReelComments] Error adding reel comment", { error });
      return { ok: false, error };
    }
  };

  const toggleLike = async (commentId: string) => {
    if (!user) return;

    const comment = comments.find((c) => c.id === commentId) || 
                   comments.flatMap((c) => c.replies || []).find((r) => r.id === commentId);
    
    if (!comment) return;

    try {
      if (comment.liked_by_user) {
        const { error } = await supabase
          .from("reel_comment_likes")
          .delete()
          .eq("comment_id", commentId)
          .eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("reel_comment_likes")
          .insert({ comment_id: commentId, user_id: user.id });
        if (error) throw error;
      }

      // Optimistic update
      setComments((prev) =>
        prev.map((c) => {
          if (c.id === commentId) {
            return {
              ...c,
              liked_by_user: !c.liked_by_user,
              likes_count: c.liked_by_user ? c.likes_count - 1 : c.likes_count + 1,
            };
          }
          if (c.replies) {
            return {
              ...c,
              replies: c.replies.map((r) =>
                r.id === commentId
                  ? {
                      ...r,
                      liked_by_user: !r.liked_by_user,
                      likes_count: r.liked_by_user ? r.likes_count - 1 : r.likes_count + 1,
                    }
                  : r
              ),
            };
          }
          return c;
        })
      );
    } catch (error) {
      logger.error("[useReelComments] Error toggling reel comment like", { error });
    }
  };

  const deleteComment = async (commentId: string) => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from("reel_comments")
        .delete()
        .eq("id", commentId)
        .eq("author_id", user.id);

      if (error) throw error;

      await fetchComments();
      return true;
    } catch (error) {
      logger.error("[useReelComments] Error deleting reel comment", { error });
      return false;
    }
  };

  return {
    comments,
    loading,
    addComment,
    toggleLike,
    deleteComment,
    refetch: fetchComments,
  };
}
